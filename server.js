"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const ROOT = process.cwd();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const CANONICAL_HOST = "nothingmatters.co.kr";
const HOME_OG_ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOME_OG_IMAGE_ALT = "nothingmatters 대표 링크 썸네일";
const HOME_OG_IMAGES = [
  "/images/og-rotate-01.png",
  "/images/og-rotate-02.png",
  "/images/og-rotate-03.png",
  "/images/og-rotate-04.png"
];
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const SEARCH_CONSOLE_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly"
];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DASHBOARD_DAYS = 90;
const DASHBOARD_TIME_ZONE = "Asia/Seoul";
const DEFAULT_DASHBOARD_RANGE_KEY = "today";
const DASHBOARD_RANGE_PRESETS = {
  today: { days: 1, label: "오늘" },
  "7d": { days: 7, label: "7일" },
  "30d": { days: 30, label: "30일" },
  "90d": { days: 90, label: "90일" }
};
const TRACKED_DASHBOARD_EVENTS = [
  {
    name: "consult_kakao_click",
    label: "카카오 상담",
    type: "consult",
    description: "추천받기·단체 상담 버튼 클릭"
  },
  {
    name: "order_brookie_click",
    label: "브루키 주문",
    type: "order",
    description: "나만의 브루키 만들기 클릭"
  },
  {
    name: "order_cookies_click",
    label: "꾸덕쿠키 주문",
    type: "order",
    description: "수제꾸덕쿠키 주문하기 클릭"
  },
  {
    name: "order_lucky_click",
    label: "행운쿠키 주문",
    type: "order",
    description: "행운쿠키 주문하기 클릭"
  }
];

let googleTokenCache = {
  accessToken: "",
  expiresAt: 0
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function resolvePath(urlPathname) {
  let cleanPath = decodeURIComponent(urlPathname);
  if (cleanPath.endsWith("/")) {
    cleanPath = `${cleanPath}index.html`;
  }

  let filePath = path.normalize(path.join(ROOT, cleanPath));
  if (!filePath.startsWith(ROOT)) {
    return null;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  } else if (!path.extname(filePath)) {
    const htmlPath = `${filePath}.html`;
    if (fs.existsSync(htmlPath)) {
      filePath = htmlPath;
    }
  }

  return filePath;
}

function getFirstHeaderValue(value) {
  if (!value) return "";
  return String(value).split(",")[0].trim();
}

function escapeAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getRotatingHomeOgImagePath(timestamp = Date.now()) {
  const slot = Math.floor(timestamp / HOME_OG_ROTATION_WINDOW_MS) % HOME_OG_IMAGES.length;
  return HOME_OG_IMAGES[slot];
}

function injectHomePreviewMeta(html, baseOrigin) {
  const ogImageUrl = new URL(getRotatingHomeOgImagePath(), baseOrigin).toString();
  const safeImageUrl = escapeAttribute(ogImageUrl);
  const safeAlt = escapeAttribute(HOME_OG_IMAGE_ALT);

  return html
    .replace(
      /<meta property="og:image" content="[^"]*">/,
      `<meta property="og:image" content="${safeImageUrl}">`
    )
    .replace(
      /<meta property="og:image:alt" content="[^"]*">/,
      `<meta property="og:image:alt" content="${safeAlt}">`
    )
    .replace(
      /<meta name="twitter:image" content="[^"]*">/,
      `<meta name="twitter:image" content="${safeImageUrl}">`
    )
    .replace(
      /<meta name="twitter:image:alt" content="[^"]*">/,
      `<meta name="twitter:image:alt" content="${safeAlt}">`
    );
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function readDashboardServiceAccount() {
  const jsonValue = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const base64Value = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const raw = jsonValue || (base64Value ? Buffer.from(base64Value, "base64").toString("utf8") : "");

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 값을 JSON으로 읽지 못했습니다.");
  }
}

function getDashboardConfig() {
  let serviceAccount = null;
  let configError = "";

  try {
    serviceAccount = readDashboardServiceAccount();
  } catch (error) {
    configError = error.message;
  }

  const propertyId = (process.env.GA4_PROPERTY_ID || "").trim();
  const searchConsoleSiteUrl = (process.env.SEARCH_CONSOLE_SITE_URL || "").trim();
  const dashboardUsername = (process.env.DASHBOARD_USERNAME || "").trim();
  const dashboardPassword = (process.env.DASHBOARD_PASSWORD || "").trim();

  const missing = [];

  if (!serviceAccount) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  }

  if (!propertyId) {
    missing.push("GA4_PROPERTY_ID");
  }

  if (!searchConsoleSiteUrl) {
    missing.push("SEARCH_CONSOLE_SITE_URL");
  }

  if (configError) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON 형식 확인");
  }

  return {
    serviceAccount,
    propertyId,
    searchConsoleSiteUrl,
    dashboardUsername,
    dashboardPassword,
    missing,
    configError
  };
}

function formatDateInTimeZone(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestamp));

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getDateSpan(days, offsetDays = 0) {
  const endTimestamp = Date.now() - offsetDays * DAY_MS;
  const startTimestamp = Date.now() - (offsetDays + days - 1) * DAY_MS;

  return {
    startDate: formatDateInTimeZone(startTimestamp),
    endDate: formatDateInTimeZone(endTimestamp)
  };
}

function getDashboardRangeFromDays(days, preferredKey = "", preferredLabel = "") {
  const safeDays = Math.min(MAX_DASHBOARD_DAYS, Math.max(1, Number.parseInt(days, 10) || 1));
  const isToday = safeDays === 1;
  const currentDateRange = getDateSpan(safeDays);
  const previousDateRange = getDateSpan(safeDays, safeDays);
  const key = preferredKey || (isToday ? "today" : `${safeDays}d`);
  const label = preferredLabel || (isToday ? "오늘" : `${safeDays}일`);

  return {
    key,
    label,
    days: safeDays,
    granularity: isToday ? "hour" : "day",
    isPartial: isToday,
    comparisonLabel: isToday ? "어제 하루 대비" : "직전 기간 대비",
    startDate: currentDateRange.startDate,
    endDate: currentDateRange.endDate,
    gaDateRange: [
      isToday
        ? { startDate: "today", endDate: "today" }
        : { startDate: `${safeDays - 1}daysAgo`, endDate: "today" }
    ],
    previousGaDateRange: [
      isToday
        ? { startDate: "yesterday", endDate: "yesterday" }
        : { startDate: previousDateRange.startDate, endDate: previousDateRange.endDate }
    ],
    searchConsoleDateRange: currentDateRange,
    previousSearchConsoleDateRange: previousDateRange
  };
}

function getDashboardRange(requestUrl) {
  const requestedRange = (requestUrl.searchParams.get("range") || "")
    .trim()
    .toLowerCase();
  const preset = DASHBOARD_RANGE_PRESETS[requestedRange];

  if (preset) {
    return getDashboardRangeFromDays(preset.days, requestedRange, preset.label);
  }

  const requestedDays = Number.parseInt(requestUrl.searchParams.get("days") || "", 10);
  if (!Number.isNaN(requestedDays)) {
    return getDashboardRangeFromDays(requestedDays);
  }

  const defaultPreset = DASHBOARD_RANGE_PRESETS[DEFAULT_DASHBOARD_RANGE_KEY];
  return getDashboardRangeFromDays(
    defaultPreset.days,
    DEFAULT_DASHBOARD_RANGE_KEY,
    defaultPreset.label
  );
}

function getSearchConsoleRequest(range, dateRange, options = {}) {
  return {
    ...dateRange,
    ...(range.isPartial && !options.isPrevious ? { dataState: "all" } : {}),
    ...(options.dimensions ? { dimensions: options.dimensions } : {}),
    ...(options.rowLimit ? { rowLimit: options.rowLimit } : {})
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseBasicAuthHeader(headerValue) {
  if (!headerValue || !headerValue.startsWith("Basic ")) return null;
  const decoded = Buffer.from(headerValue.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return null;
  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
}

function isDashboardAuthorized(req, dashboardConfig) {
  const { dashboardUsername, dashboardPassword } = dashboardConfig;
  if (!dashboardUsername && !dashboardPassword) return true;
  const credentials = parseBasicAuthHeader(req.headers.authorization);
  return (
    credentials &&
    credentials.username === dashboardUsername &&
    credentials.password === dashboardPassword
  );
}

function requestDashboardAuth(res) {
  res.writeHead(401, {
    "Content-Type": "application/json; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="nothingmatters dashboard"'
  });
  res.end(JSON.stringify({ error: "dashboard_auth_required" }));
}

async function getGoogleAccessToken(serviceAccount) {
  if (googleTokenCache.accessToken && googleTokenCache.expiresAt > Date.now() + 60_000) {
    return googleTokenCache.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: serviceAccount.private_key_id
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: GOOGLE_SCOPES.join(" "),
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsignedToken), serviceAccount.private_key);
  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google access token 발급 실패: ${response.status} ${message}`);
  }

  const data = await response.json();
  googleTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(0, (data.expires_in || 3600) - 60) * 1000
  };
  return googleTokenCache.accessToken;
}

function mapGaRows(report = {}) {
  const dimensionHeaders = report.dimensionHeaders || [];
  const metricHeaders = report.metricHeaders || [];

  return (report.rows || []).map((row) => {
    const dimensions = {};
    const metrics = {};

    dimensionHeaders.forEach((header, index) => {
      dimensions[header.name] = row.dimensionValues?.[index]?.value || "";
    });

    metricHeaders.forEach((header, index) => {
      metrics[header.name] = row.metricValues?.[index]?.value || "";
    });

    return { dimensions, metrics };
  });
}

function isNaverSource(value = "") {
  return String(value).toLowerCase().includes("naver");
}

async function fetchGaReport(accessToken, propertyId, requestBody) {
  const response = await fetch(`${GA4_API_BASE}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GA4 보고서 조회 실패: ${response.status} ${message}`);
  }

  return response.json();
}

async function fetchSearchConsoleReport(accessToken, siteUrl, requestBody) {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const response = await fetch(
    `${SEARCH_CONSOLE_API_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Search Console 조회 실패: ${response.status} ${message}`);
  }

  return response.json();
}

function getMetricValue(report = {}, metricIndex = 0) {
  return Number(report.rows?.[0]?.metricValues?.[metricIndex]?.value || 0);
}

function getOverviewMetrics(report = {}) {
  return {
    sessions: getMetricValue(report, 0),
    activeUsers: getMetricValue(report, 1),
    engagedSessions: getMetricValue(report, 2),
    engagementRate: getMetricValue(report, 3)
  };
}

function createDimensionFilter(fieldName, value) {
  return {
    filter: {
      fieldName,
      stringFilter: {
        matchType: "CONTAINS",
        value,
        caseSensitive: false
      }
    }
  };
}

function getEventNameFilter() {
  return {
    filter: {
      fieldName: "eventName",
      inListFilter: {
        values: TRACKED_DASHBOARD_EVENTS.map((event) => event.name)
      }
    }
  };
}

function getSourceMeaning(sourceMedium = "", channelGroup = "") {
  const source = String(sourceMedium).toLowerCase();
  const channel = String(channelGroup).toLowerCase();

  if (source.includes("naver")) return "네이버 검색/서비스에서 들어온 방문";
  if (source.includes("google")) return "구글 검색 또는 구글 관련 유입";
  if (source.includes("instagram")) return "인스타그램 프로필·링크 유입";
  if (source.includes("(direct)") || source.includes("(none)")) {
    return "주소 직접 입력 또는 출처 확인 불가";
  }
  if (channel.includes("organic")) return "검색 결과에서 들어온 방문";
  if (channel.includes("referral")) return "다른 사이트 링크를 타고 들어온 방문";
  if (channel.includes("social")) return "SNS에서 들어온 방문";
  return "GA4가 분류한 유입 경로";
}

function mapSourceRows(report = {}, totalSessions = 0) {
  return mapGaRows(report).map((row) => {
    const sessions = Number(row.metrics.sessions || 0);
    const activeUsers = Number(row.metrics.activeUsers || 0);
    const sourceMedium = row.dimensions.sessionSourceMedium || "(not set)";
    const channelGroup = row.dimensions.sessionPrimaryChannelGroup || "(not set)";

    return {
      sourceMedium,
      channelGroup,
      sessions,
      activeUsers,
      share: totalSessions ? sessions / totalSessions : 0,
      meaning: getSourceMeaning(sourceMedium, channelGroup)
    };
  });
}

function mapLandingRows(report = {}) {
  return mapGaRows(report).map((row) => ({
    page: row.dimensions.landingPagePlusQueryString || "/",
    sessions: Number(row.metrics.sessions || 0),
    activeUsers: Number(row.metrics.activeUsers || 0),
    engagementRate: Number(row.metrics.engagementRate || 0)
  }));
}

function buildChannelRows(sources = [], totalSessions = 0) {
  const channelMap = new Map();

  sources.forEach((source) => {
    const key = source.channelGroup || "(not set)";
    const existing = channelMap.get(key) || {
      channelGroup: key,
      sessions: 0,
      activeUsers: 0
    };

    existing.sessions += source.sessions;
    existing.activeUsers += source.activeUsers;
    channelMap.set(key, existing);
  });

  return [...channelMap.values()]
    .map((channel) => ({
      ...channel,
      share: totalSessions ? channel.sessions / totalSessions : 0
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

function formatSeriesLabel(key = "", granularity = "day") {
  if (granularity === "hour") {
    return `${String(key || "0").padStart(2, "0")}시`;
  }

  if (/^\d{8}$/.test(key)) {
    return `${Number(key.slice(4, 6))}/${Number(key.slice(6, 8))}`;
  }

  return key || "-";
}

function buildSeriesRows(sessionReport = {}, eventSeriesReport = {}, range) {
  const seriesDimension = range.granularity === "hour" ? "hour" : "date";
  const seriesMap = new Map();

  const ensurePoint = (key) => {
    const safeKey = String(key || "");
    if (!seriesMap.has(safeKey)) {
      seriesMap.set(safeKey, {
        key: safeKey,
        label: formatSeriesLabel(safeKey, range.granularity),
        sessions: 0,
        activeUsers: 0,
        orderClicks: 0,
        consultClicks: 0,
        totalActionClicks: 0
      });
    }

    return seriesMap.get(safeKey);
  };

  if (range.granularity === "hour") {
    Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).forEach(ensurePoint);
  }

  mapGaRows(sessionReport).forEach((row) => {
    const point = ensurePoint(row.dimensions[seriesDimension]);
    point.sessions += Number(row.metrics.sessions || 0);
    point.activeUsers += Number(row.metrics.activeUsers || 0);
  });

  mapGaRows(eventSeriesReport).forEach((row) => {
    const eventName = row.dimensions.eventName || "";
    const point = ensurePoint(row.dimensions[seriesDimension]);
    const count = Number(row.metrics.eventCount || 0);

    if (eventName.startsWith("order_")) point.orderClicks += count;
    if (eventName.startsWith("consult_")) point.consultClicks += count;
    point.totalActionClicks += count;
  });

  return [...seriesMap.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function mapEventRows(report = {}) {
  const counts = new Map(TRACKED_DASHBOARD_EVENTS.map((event) => [event.name, 0]));

  mapGaRows(report).forEach((row) => {
    const eventName = row.dimensions.eventName || "";
    counts.set(eventName, (counts.get(eventName) || 0) + Number(row.metrics.eventCount || 0));
  });

  return TRACKED_DASHBOARD_EVENTS.map((event) => ({
    ...event,
    count: counts.get(event.name) || 0
  }));
}

function getSearchOverview(report = {}) {
  const row = report.rows?.[0] || {};
  return {
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0)
  };
}

function getSearchInsight(row = {}) {
  if (row.impressions >= 50 && row.ctr < 0.03) {
    return "노출은 많은데 클릭률이 낮아요. 제목/설명 개선 후보";
  }
  if (row.position <= 5 && row.ctr < 0.08 && row.impressions > 0) {
    return "상위권에 보이지만 클릭 설득이 약할 수 있어요";
  }
  if (row.position > 10 && row.impressions > 0) {
    return "검색 노출은 있지만 순위 개선이 필요해요";
  }
  if (row.clicks > 0) return "실제 유입이 발생한 검색어";
  return "조금 더 데이터가 쌓이면 판단하기 좋아요";
}

function mapSearchRows(report = {}, keyName) {
  return (report.rows || []).map((row) => {
    const item = {
      [keyName]: row.keys?.[0] || "(not set)",
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      position: Number(row.position || 0)
    };

    return {
      ...item,
      insight: getSearchInsight(item)
    };
  });
}

function getSearchOpportunities(rows = []) {
  return rows
    .filter((row) => row.impressions > 0)
    .map((row) => ({
      ...row,
      opportunityScore: row.impressions * Math.max(0.01, 1 - row.ctr)
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);
}

function getDelta(current = 0, previous = 0) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);

  return {
    current: currentValue,
    previous: previousValue,
    change: currentValue - previousValue,
    rate: previousValue ? (currentValue - previousValue) / previousValue : null
  };
}

async function settleReports(requests) {
  const entries = await Promise.all(
    Object.entries(requests).map(async ([key, request]) => {
      try {
        return [key, { data: await request }];
      } catch (error) {
        return [key, { error: error.message || "데이터 조회 실패" }];
      }
    })
  );

  return Object.fromEntries(entries);
}

function getReport(reports, key) {
  return reports[key]?.data || {};
}

function getReportErrors(reports) {
  return Object.entries(reports)
    .filter(([, result]) => result.error)
    .map(([source, result]) => ({
      source,
      message: result.error
    }));
}

async function buildDashboardPayload(range, dashboardConfig) {
  const accessToken = await getGoogleAccessToken(dashboardConfig.serviceAccount);
  const seriesDimension = range.granularity === "hour" ? "hour" : "date";
  const eventFilter = getEventNameFilter();

  const reports = await settleReports({
    overview: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "engagedSessions" },
        { name: "engagementRate" }
      ]
    }),
    previousOverview: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.previousGaDateRange,
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "engagedSessions" },
        { name: "engagementRate" }
      ]
    }),
    sources: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "sessionSourceMedium" }, { name: "sessionPrimaryChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 16
    }),
    landingPages: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagementRate" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 12
    }),
    naverLandingPages: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagementRate" }],
      dimensionFilter: createDimensionFilter("sessionSourceMedium", "naver"),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10
    }),
    series: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: seriesDimension }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ dimension: { dimensionName: seriesDimension, orderType: "ALPHANUMERIC" } }]
    }),
    events: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: eventFilter,
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: TRACKED_DASHBOARD_EVENTS.length
    }),
    previousEvents: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.previousGaDateRange,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: eventFilter,
      limit: TRACKED_DASHBOARD_EVENTS.length
    }),
    eventSeries: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: seriesDimension }, { name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: eventFilter,
      orderBys: [{ dimension: { dimensionName: seriesDimension, orderType: "ALPHANUMERIC" } }],
      limit: 500
    }),
    devices: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 6
    }),
    searchOverview: fetchSearchConsoleReport(
      accessToken,
      dashboardConfig.searchConsoleSiteUrl,
      getSearchConsoleRequest(range, range.searchConsoleDateRange, { rowLimit: 1 })
    ),
    previousSearchOverview: fetchSearchConsoleReport(
      accessToken,
      dashboardConfig.searchConsoleSiteUrl,
      getSearchConsoleRequest(range, range.previousSearchConsoleDateRange, {
        rowLimit: 1,
        isPrevious: true
      })
    ),
    queries: fetchSearchConsoleReport(
      accessToken,
      dashboardConfig.searchConsoleSiteUrl,
      getSearchConsoleRequest(range, range.searchConsoleDateRange, {
        dimensions: ["query"],
        rowLimit: 20
      })
    ),
    pages: fetchSearchConsoleReport(
      accessToken,
      dashboardConfig.searchConsoleSiteUrl,
      getSearchConsoleRequest(range, range.searchConsoleDateRange, {
        dimensions: ["page"],
        rowLimit: 20
      })
    )
  });

  const overview = getOverviewMetrics(getReport(reports, "overview"));
  const previousOverview = getOverviewMetrics(getReport(reports, "previousOverview"));
  const sources = mapSourceRows(getReport(reports, "sources"), overview.sessions);
  const naverSources = sources.filter((source) => isNaverSource(source.sourceMedium));
  const landingPages = mapLandingRows(getReport(reports, "landingPages"));
  const naverLandingPages = mapLandingRows(getReport(reports, "naverLandingPages"));
  const channels = buildChannelRows(sources, overview.sessions);
  const series = buildSeriesRows(getReport(reports, "series"), getReport(reports, "eventSeries"), range);
  const events = mapEventRows(getReport(reports, "events"));
  const previousEvents = mapEventRows(getReport(reports, "previousEvents"));
  const searchOverview = getSearchOverview(getReport(reports, "searchOverview"));
  const previousSearchOverview = getSearchOverview(getReport(reports, "previousSearchOverview"));
  const queries = mapSearchRows(getReport(reports, "queries"), "query");
  const pages = mapSearchRows(getReport(reports, "pages"), "page");
  const searchOpportunities = getSearchOpportunities(queries);
  const orderClicks = events
    .filter((event) => event.type === "order")
    .reduce((sum, event) => sum + event.count, 0);
  const previousOrderClicks = previousEvents
    .filter((event) => event.type === "order")
    .reduce((sum, event) => sum + event.count, 0);
  const consultClicks = events
    .filter((event) => event.type === "consult")
    .reduce((sum, event) => sum + event.count, 0);
  const previousConsultClicks = previousEvents
    .filter((event) => event.type === "consult")
    .reduce((sum, event) => sum + event.count, 0);
  const totalActionClicks = orderClicks + consultClicks;
  const previousActionClicks = previousOrderClicks + previousConsultClicks;
  const naverSessions = naverSources.reduce((sum, row) => sum + row.sessions, 0);
  const naverActiveUsers = naverSources.reduce((sum, row) => sum + row.activeUsers, 0);
  const reportErrors = getReportErrors(reports);

  const summary = {
    ...overview,
    searchClicks: searchOverview.clicks,
    searchImpressions: searchOverview.impressions,
    searchCtr: searchOverview.ctr,
    averagePosition: searchOverview.position,
    orderClicks,
    consultClicks,
    totalActionClicks,
    conversionSignalRate: overview.sessions ? totalActionClicks / overview.sessions : 0,
    naverSessions,
    naverActiveUsers
  };

  return {
    generatedAt: new Date().toISOString(),
    range: {
      key: range.key,
      label: range.label,
      days: range.days,
      startDate: range.startDate,
      endDate: range.endDate,
      granularity: range.granularity,
      isPartial: range.isPartial,
      comparisonLabel: range.comparisonLabel
    },
    summary,
    delta: {
      comparisonLabel: range.comparisonLabel,
      sessions: getDelta(summary.sessions, previousOverview.sessions),
      activeUsers: getDelta(summary.activeUsers, previousOverview.activeUsers),
      searchClicks: getDelta(summary.searchClicks, previousSearchOverview.clicks),
      searchImpressions: getDelta(summary.searchImpressions, previousSearchOverview.impressions),
      orderClicks: getDelta(orderClicks, previousOrderClicks),
      consultClicks: getDelta(consultClicks, previousConsultClicks),
      totalActionClicks: getDelta(totalActionClicks, previousActionClicks)
    },
    series,
    channels,
    sources,
    landingPages,
    naver: {
      sessions: naverSessions,
      activeUsers: naverActiveUsers,
      sources: naverSources,
      landingPages: naverLandingPages
    },
    devices: mapGaRows(getReport(reports, "devices")).map((row) => ({
      deviceCategory: row.dimensions.deviceCategory || "(not set)",
      sessions: Number(row.metrics.sessions || 0),
      activeUsers: Number(row.metrics.activeUsers || 0),
      share: summary.sessions ? Number(row.metrics.sessions || 0) / summary.sessions : 0
    })),
    events,
    search: {
      siteUrl: dashboardConfig.searchConsoleSiteUrl,
      isPartial: range.isPartial,
      ...searchOverview,
      queries,
      pages,
      opportunities: searchOpportunities,
      error:
        reports.searchOverview?.error ||
        reports.queries?.error ||
        reports.pages?.error ||
        ""
    },
    errors: reportErrors,
    ga4: {
      overview,
      sources,
      landingPages,
      daily: series
        .filter((point) => range.granularity === "day")
        .map((point) => ({
          date: point.key,
          sessions: point.sessions,
          activeUsers: point.activeUsers
        })),
      naver: {
        sessions: naverSessions,
        activeUsers: naverActiveUsers,
        sources: naverSources,
        landingPages: naverLandingPages
      }
    },
    searchConsole: {
      siteUrl: dashboardConfig.searchConsoleSiteUrl,
      topQueries: queries,
      topPages: pages,
      error:
        reports.searchOverview?.error ||
        reports.queries?.error ||
        reports.pages?.error ||
        ""
    }
  };
}

async function handleDashboardSummary(req, res, requestUrl, dashboardConfig) {
  if (!isDashboardAuthorized(req, dashboardConfig)) {
    requestDashboardAuth(res);
    return;
  }

  if (dashboardConfig.missing.length) {
    sendJson(res, 503, {
      error: "dashboard_not_configured",
      message: "대시보드를 보려면 Google Analytics 4 와 Search Console 설정이 필요합니다.",
      missing: dashboardConfig.missing,
      setup: {
        requiredEnv: [
          "GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
          "GA4_PROPERTY_ID",
          "SEARCH_CONSOLE_SITE_URL"
        ],
        notes: [
          dashboardConfig.configError || "서비스 계정 JSON은 전체 원문 또는 Base64 형태로 넣을 수 있습니다.",
          "서비스 계정 이메일을 GA4 속성에 Viewer 이상으로 추가하세요.",
          "서비스 계정 이메일을 Search Console 속성에 사용자로 추가하세요.",
          "SEARCH_CONSOLE_SITE_URL 은 예: https://nothingmatters.co.kr/ 또는 sc-domain:nothingmatters.co.kr 형태입니다."
        ].filter(Boolean)
      }
    });
    return;
  }

  const dashboardRange = getDashboardRange(requestUrl);

  try {
    const payload = await buildDashboardPayload(dashboardRange, dashboardConfig);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 502, {
      error: "dashboard_fetch_failed",
      message: error.message
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  const requestUrl = new URL(req.url || "/", "http://localhost");
  const dashboardConfig = getDashboardConfig();
  const forwardedHost = getFirstHeaderValue(req.headers["x-forwarded-host"]);
  const requestHost = (forwardedHost || req.headers.host || "localhost")
    .split(":")[0]
    .trim()
    .toLowerCase();
  const forwardedProto = getFirstHeaderValue(req.headers["x-forwarded-proto"]);
  const requestProto = (forwardedProto || "http").trim().toLowerCase();
  const isProductionHost =
    requestHost === CANONICAL_HOST || requestHost === `www.${CANONICAL_HOST}`;
  const responseOrigin = `${isProductionHost ? "https" : requestProto}://${
    requestHost && requestHost !== "localhost" ? requestHost : CANONICAL_HOST
  }`;

  if (isProductionHost && (requestHost !== CANONICAL_HOST || requestProto !== "https")) {
    const redirectUrl = new URL(
      `${requestUrl.pathname}${requestUrl.search}`,
      `https://${CANONICAL_HOST}`
    );

    res.writeHead(301, {
      Location: redirectUrl.toString(),
      "Cache-Control": "public, max-age=3600"
    });
    res.end();
    return;
  }

  if (requestUrl.pathname === "/api/dashboard/summary") {
    await handleDashboardSummary(req, res, requestUrl, dashboardConfig);
    return;
  }

  if (requestUrl.pathname.startsWith("/dashboard") && !isDashboardAuthorized(req, dashboardConfig)) {
    requestDashboardAuth(res);
    return;
  }

  const filePath = resolvePath(requestUrl.pathname);

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const stat = fs.statSync(filePath);

  const isHomeHtml =
    ext === ".html" &&
    path.relative(ROOT, filePath) === "index.html" &&
    (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html");

  if (isHomeHtml) {
    const html = fs.readFileSync(filePath, "utf8");
    const responseBody = injectHomePreviewMeta(html, responseOrigin);

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": Buffer.byteLength(responseBody)
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    res.end(responseBody);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running at http://${HOST}:${PORT}`);
});
