"use strict";

const CANONICAL_URL = "https://nothingmatters.co.kr/christmas/";
const TIME_ZONE = "America/Los_Angeles";
const DAY_MS = 86400000;
const QUERY_PAGE_SIZE = 25000;
const QUERY_ROW_CAP = 50000;
const TOPICS = [
  { id: "A", name: "크리스마스 쿠키·세트", pattern: /크리스마스|성탄절|브루키|christmas/i },
  { id: "B", name: "선물·추천", pattern: /선물|추천|답례|친구|연인/ },
  { id: "C", name: "가격·포장", pattern: /가격|얼마|비용|포장|패키지|금액/ },
  { id: "D", name: "주문·픽업·택배", pattern: /주문|예약|픽업|택배|배송|마감|수령/ },
  { id: "E", name: "서울 쿠키선물", pattern: /서울|강서|공항동|김포공항|송정/ },
  { id: "F", name: "기업행사·단체 간식", pattern: /기업|회사|기관|단체|행사|임직원|거래처|워크숍|사내|마곡/ },
  { id: "G", name: "어린이집·유치원 선물", pattern: /어린이집|유치원|원아/ },
  { id: "H", name: "산타·트리·곰돌이", pattern: /산타|트리|곰돌이|곰 쿠키/ }
];
const NOTES = [
  "Google Search Console의 web 검색, 최종 데이터만 조회합니다. 날짜는 미국 태평양 시간 기준이며 반영 지연을 고려해 최근 3일을 제외한 28일·90일입니다.",
  "검색어는 익명화 및 API 내부 한도로 일부 누락될 수 있습니다. 검색어 합계를 페이지 전체 합계로 사용하지 않습니다.",
  "A–H 주제는 중복 분류될 수 있어 주제별 수치를 합산하면 안 됩니다. 관측되지 않은 검색어를 수요 없음으로 해석하지 않습니다.",
  "페이지 총 노출 100회 미만은 작은 표본으로 표시합니다. 검토 후보는 노출 30회 이상에서 CTR 2% 미만 또는 평균순위 10 초과인 관련 검색어입니다. 이는 편집 검토 기준이며 원인이나 개선 효과를 확정하지 않습니다.",
  "성과 조회와 검색 수집·색인 진단은 별도입니다. 이 기능은 URL 색인 상태를 확인하지 않습니다."
];

function periodsFor(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now).map(part => [part.type, part.value]));
  const today = Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  const end = today - 3 * DAY_MS;
  return [28, 90].map(days => ({
    days,
    startDate: new Date(end - (days - 1) * DAY_MS).toISOString().slice(0, 10),
    endDate: new Date(end).toISOString().slice(0, 10)
  }));
}

function requestFor(period, dimensions = [], startRow = 0) {
  return {
    startDate: period.startDate, endDate: period.endDate,
    type: "web", dataState: "final", aggregationType: "byPage",
    dimensionFilterGroups: [{ groupType: "and", filters: [{
      dimension: "page", operator: "equals", expression: CANONICAL_URL
    }] }],
    ...(dimensions.length ? { dimensions } : {}),
    rowLimit: dimensions[0] === "query" ? QUERY_PAGE_SIZE : dimensions.length ? 25 : 1,
    startRow
  };
}

function metrics(row) {
  const { clicks, impressions, position } = row;
  if (![clicks, impressions, position].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
    throw new Error("invalid_report");
  }
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? position : null };
}

function classify(query) {
  return TOPICS.filter(topic => topic.pattern.test(query)).map(topic => topic.id);
}

function summarizeTopics(queries, available) {
  return TOPICS.map(({ id, name }) => {
    const rows = queries.filter(row => row.topics.includes(id));
    const impressions = rows.reduce((total, row) => total + row.impressions, 0);
    const clicks = rows.reduce((total, row) => total + row.clicks, 0);
    return {
      id, name, status: !available ? "unavailable" : rows.length ? "observed" : "not_observed",
      queryCount: available ? rows.length : null,
      metrics: rows.length ? { clicks, impressions, ctr: impressions ? clicks / impressions : 0,
        position: impressions ? rows.reduce((total, row) => total + row.position * row.impressions, 0) / impressions : null } : null
    };
  });
}

function emptyPeriod(period, status) {
  return { ...period, status, overview: null, queries: [], devices: [], topics: summarizeTopics([], false),
    sample: "unknown", queryStatus: status, deviceStatus: status, queryRowsCapped: false, reviewCandidates: [] };
}

function unavailableAudit(status, missing = [], now = new Date()) {
  return {
    source: "Google Search Console Search Analytics", canonicalUrl: CANONICAL_URL,
    timeZone: TIME_ZONE, generatedAt: now.toISOString(), status, missing,
    periods: periodsFor(now).map(period => emptyPeriod(period, status)), notes: NOTES,
    naver: { status: "unavailable", message: "네이버 검색어 데이터 미확보", period: null,
      queries: [], indexingStatus: "not_checked",
      note: "서치어드바이저 내보내기 자료가 필요합니다. GA4 네이버 유입 세션은 검색어 통계가 아닙니다. 수집·색인 상태도 별도 확인이 필요합니다." }
  };
}

function errorStatus(error) {
  return [401, 403].includes(error?.status) ? "access_denied" : "upstream_unavailable";
}

async function buildChristmasSearchAudit({ requestReport, now = new Date() }) {
  const audit = unavailableAudit("unavailable", [], now);
  const safeRead = async callback => {
    try { return { status: "available", value: await callback() }; }
    catch (error) { return { status: errorStatus(error), value: null }; }
  };
  audit.periods = await Promise.all(periodsFor(now).map(async period => {
    const [overviewResult, queryResult, deviceResult] = await Promise.all([
      safeRead(async () => {
        const report = await requestReport(requestFor(period));
        return report.rows?.[0] ? metrics(report.rows[0]) : null;
      }),
      safeRead(async () => {
        const queries = [];
        let capped = false;
        for (let startRow = 0; startRow < QUERY_ROW_CAP; startRow += QUERY_PAGE_SIZE) {
          const report = await requestReport(requestFor(period, ["query"], startRow));
          const rows = report.rows || [];
          for (const row of rows) {
            if (typeof row.keys?.[0] !== "string") throw new Error("invalid_report");
            const query = row.keys[0];
            const values = metrics(row);
            const topics = classify(query);
            const reviewReasons = [];
            if (values.impressions >= 30 && topics.length) {
              if (values.ctr < 0.02) reviewReasons.push("low_ctr");
              if (values.position > 10) reviewReasons.push("low_position");
            }
            queries.push({ query, ...values, topics, reviewReasons });
          }
          if (rows.length < QUERY_PAGE_SIZE) break;
          if (startRow + QUERY_PAGE_SIZE >= QUERY_ROW_CAP) capped = true;
        }
        return { queries, capped };
      }),
      safeRead(async () => {
        const report = await requestReport(requestFor(period, ["device"]));
        return (report.rows || []).map(row => {
          if (typeof row.keys?.[0] !== "string") throw new Error("invalid_report");
          return { device: row.keys[0], ...metrics(row) };
        });
      })
    ]);
    const overview = overviewResult.value;
    const queries = queryResult.value?.queries || [];
    const status = overviewResult.status !== "available" ? overviewResult.status : overview ? "available" : "no_data";
    return { ...period, status, overview, queries, devices: deviceResult.value || [],
      queryStatus: queryResult.status, deviceStatus: deviceResult.status,
      topics: summarizeTopics(queries, queryResult.status === "available"),
      sample: overview ? overview.impressions < 100 ? "small" : "observed" : "unknown",
      queryRowsCapped: queryResult.value?.capped || false,
      reviewCandidates: queries.filter(row => row.reviewReasons.length).sort((a, b) => b.impressions - a.impressions)
    };
  }));
  audit.status = audit.periods.every(period => period.status === "available" && period.queryStatus === "available" && period.deviceStatus === "available")
    ? "available" : audit.periods.every(period => period.status === "no_data") ? "no_data" : "partial_or_unavailable";
  return audit;
}

module.exports = { CANONICAL_URL, periodsFor, requestFor, classify, unavailableAudit, buildChristmasSearchAudit, errorStatus };
