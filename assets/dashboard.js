const statusNode = document.querySelector("[data-dashboard-status]");
const setupPanel = document.querySelector("[data-dashboard-setup]");
const setupMessage = document.querySelector("[data-dashboard-setup-message]");
const setupMissing = document.querySelector("[data-dashboard-setup-missing]");
const setupNotes = document.querySelector("[data-dashboard-setup-notes]");
const dashboardGrid = document.querySelector("[data-dashboard-grid]");
const rangeButtons = [...document.querySelectorAll("[data-range-key]")];
const rangeLabel = document.querySelector("[data-dashboard-range-label]");
const rangeCopy = document.querySelector("[data-dashboard-range-copy]");
const partialBadge = document.querySelector("[data-dashboard-partial-badge]");
const searchConsoleSite = document.querySelector("[data-search-console-site]");
const insightsNode = document.querySelector("[data-dashboard-insights]");

const metricFormatters = {
  sessions: (value) => formatNumber(value),
  activeUsers: (value) => formatNumber(value),
  engagementRate: (value) => formatPercent(value),
  totalActionClicks: (value) => formatNumber(value),
  conversionSignalRate: (value) => formatPercent(value),
  searchClicks: (value) => formatNumber(value),
  searchImpressions: (value) => formatNumber(value),
  naverSessions: (value) => formatNumber(value)
};

const sourceLabels = {
  "Organic Search": "검색",
  Direct: "직접/출처불명",
  Referral: "추천 링크",
  "Organic Social": "SNS",
  "Paid Search": "검색 광고",
  Unassigned: "미분류"
};

const deviceLabels = {
  mobile: "모바일",
  desktop: "데스크톱",
  tablet: "태블릿",
  smarttv: "스마트TV"
};

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatPercent(value = 0) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatPosition(value = 0) {
  return Number(value || 0).toFixed(1);
}

function formatShare(value = 0) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatDateTime(value = "") {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDelta(delta, fallback = "") {
  if (!delta) return fallback;
  if (delta.rate === null) {
    if (delta.change > 0) return `비교 기간 0 → +${formatNumber(delta.change)}`;
    return fallback || "비교 변화 없음";
  }

  const sign = delta.change > 0 ? "+" : "";
  return `${sign}${(delta.rate * 100).toFixed(1)}% · ${sign}${formatNumber(delta.change)}`;
}

function setStatus(message) {
  if (!statusNode) return;
  statusNode.textContent = message;
}

function setActiveRange(rangeKey) {
  rangeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rangeKey === rangeKey);
  });
}

function setText(selector, text) {
  const node = document.querySelector(selector);
  if (node) node.textContent = text;
}

function createCell(content, options = {}) {
  const cell = document.createElement("td");

  if (options.className) cell.className = options.className;

  if (options.detail) {
    const strong = document.createElement("strong");
    strong.textContent = content;
    const small = document.createElement("small");
    small.textContent = options.detail;
    cell.appendChild(strong);
    cell.appendChild(small);
    return cell;
  }

  if (options.strong) {
    const strong = document.createElement("strong");
    strong.textContent = content;
    cell.appendChild(strong);
    return cell;
  }

  cell.textContent = content;
  return cell;
}

function renderTable(target, items, formatter, emptyMessage = "표시할 데이터가 아직 없습니다.") {
  if (!target) return;
  target.innerHTML = "";

  if (!items.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "dashboard-empty";
    cell.colSpan = formatter.emptyColSpan;
    cell.textContent = emptyMessage;
    row.appendChild(cell);
    target.appendChild(row);
    return;
  }

  items.forEach((item) => {
    target.appendChild(formatter(item));
  });
}

function createSourceRow(item) {
  const row = document.createElement("tr");
  row.appendChild(createCell(item.sourceMedium, { strong: true }));
  row.appendChild(createCell(item.meaning || "유입 경로"));
  row.appendChild(createCell(formatNumber(item.sessions)));
  row.appendChild(createCell(formatNumber(item.activeUsers)));
  row.appendChild(createCell(formatShare(item.share)));
  return row;
}
createSourceRow.emptyColSpan = 5;

function createLandingRow(item) {
  const row = document.createElement("tr");
  row.appendChild(createCell(item.page, { strong: true }));
  row.appendChild(createCell(formatNumber(item.sessions)));
  row.appendChild(createCell(formatPercent(item.engagementRate)));
  return row;
}
createLandingRow.emptyColSpan = 3;

function createQueryRow(item) {
  const row = document.createElement("tr");
  row.appendChild(createCell(item.query, { detail: item.insight }));
  row.appendChild(createCell(formatNumber(item.clicks)));
  row.appendChild(createCell(formatNumber(item.impressions)));
  row.appendChild(createCell(formatPercent(item.ctr)));
  row.appendChild(createCell(formatPosition(item.position)));
  return row;
}
createQueryRow.emptyColSpan = 5;

function createPageRow(item) {
  const row = document.createElement("tr");
  row.appendChild(createCell(item.page, { strong: true }));
  row.appendChild(createCell(formatNumber(item.clicks)));
  row.appendChild(createCell(formatNumber(item.impressions)));
  row.appendChild(createCell(formatPercent(item.ctr)));
  row.appendChild(createCell(formatPosition(item.position)));
  row.appendChild(createCell(item.insight || "관찰 필요"));
  return row;
}
createPageRow.emptyColSpan = 6;

function renderMetrics(payload) {
  const summary = payload.summary || {};

  Object.entries(metricFormatters).forEach(([metricName, formatter]) => {
    const node = document.querySelector(`[data-metric="${metricName}"]`);
    if (!node) return;
    node.textContent = formatter(summary[metricName]);
  });

  Object.entries(payload.delta || {}).forEach(([metricName, delta]) => {
    if (metricName === "comparisonLabel") return;
    const node = document.querySelector(`[data-delta="${metricName}"]`);
    if (!node) return;
    node.textContent = `${payload.delta?.comparisonLabel || "비교"} ${formatDelta(delta)}`;
  });
}

function renderInsights(payload) {
  if (!insightsNode) return;

  const summary = payload.summary || {};
  const topSource = payload.sources?.[0];
  const topQuery = payload.search?.queries?.[0];
  const actionText = summary.totalActionClicks
    ? `주문/상담 버튼 클릭이 ${formatNumber(summary.totalActionClicks)}번 발생했습니다.`
    : "아직 주문/상담 버튼 클릭은 잡히지 않았습니다.";

  const insights = [
    `${payload.range?.label || "선택 기간"} 방문은 ${formatNumber(summary.sessions)}회, 사람 수는 ${formatNumber(
      summary.activeUsers
    )}명입니다.`,
    topSource
      ? `가장 큰 유입은 ${topSource.sourceMedium}입니다. ${topSource.meaning}`
      : "아직 유입 경로를 판단할 만큼 데이터가 쌓이지 않았습니다.",
    topQuery
      ? `${actionText} Google 검색어 중 '${topQuery.query}'가 가장 먼저 확인됩니다.`
      : actionText
  ];

  insightsNode.innerHTML = "";
  insights.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    insightsNode.appendChild(item);
  });
}

function renderChart(rows = [], range = {}) {
  const chartNode = document.querySelector("[data-dashboard-chart]");
  if (!chartNode) return;
  chartNode.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "dashboard-empty";
    empty.textContent = "방문 추이를 그릴 데이터가 아직 없습니다.";
    chartNode.appendChild(empty);
    return;
  }

  const width = 920;
  const height = 320;
  const padding = { top: 24, right: 28, bottom: 48, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxSessions = Math.max(...rows.map((row) => row.sessions), 1);
  const maxActions = Math.max(...rows.map((row) => row.totalActionClicks), 1);
  const barWidth = Math.max(8, plotWidth / rows.length - 8);
  const labelStep = range.granularity === "hour" ? 3 : Math.max(1, Math.ceil(rows.length / 8));
  const points = rows.map((row, index) => {
    const x = padding.left + (rows.length === 1 ? plotWidth / 2 : (plotWidth / (rows.length - 1)) * index);
    const y = padding.top + plotHeight - (row.totalActionClicks / maxActions) * plotHeight;
    return `${x},${y}`;
  });

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "선택 기간 방문 수와 주문 상담 클릭 추이");
  svg.classList.add("dashboard-svg-chart");

  const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  gridLine.setAttribute("x1", String(padding.left));
  gridLine.setAttribute("x2", String(width - padding.right));
  gridLine.setAttribute("y1", String(height - padding.bottom));
  gridLine.setAttribute("y2", String(height - padding.bottom));
  gridLine.classList.add("dashboard-svg-axis");
  svg.appendChild(gridLine);

  rows.forEach((row, index) => {
    const x = padding.left + (plotWidth / rows.length) * index + (plotWidth / rows.length - barWidth) / 2;
    const barHeight = Math.max(row.sessions ? 5 : 0, (row.sessions / maxSessions) * plotHeight);
    const y = padding.top + plotHeight - barHeight;

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(barWidth));
    rect.setAttribute("height", String(barHeight));
    rect.setAttribute("rx", "8");
    rect.classList.add("dashboard-svg-bar");
    svg.appendChild(rect);

    if (index % labelStep === 0 || index === rows.length - 1) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(x + barWidth / 2));
      label.setAttribute("y", String(height - 18));
      label.setAttribute("text-anchor", "middle");
      label.classList.add("dashboard-svg-label");
      label.textContent = row.label;
      svg.appendChild(label);
    }
  });

  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", points.join(" "));
  line.classList.add("dashboard-svg-line");
  svg.appendChild(line);

  rows.forEach((row, index) => {
    const [x, y] = points[index].split(",");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", row.totalActionClicks ? "5" : "3");
    circle.classList.add("dashboard-svg-dot");
    svg.appendChild(circle);
  });

  const legend = document.createElement("div");
  legend.className = "dashboard-chart-legend";
  legend.innerHTML = "<span><i></i>방문 수</span><span><i></i>주문/상담 클릭</span>";

  chartNode.appendChild(svg);
  chartNode.appendChild(legend);
}

function renderBars(target, rows, labelAccessor) {
  if (!target) return;
  target.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "dashboard-empty";
    empty.textContent = "표시할 데이터가 아직 없습니다.";
    target.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "dashboard-bar-row";

    const head = document.createElement("div");
    head.className = "dashboard-bar-row-head";

    const label = document.createElement("strong");
    label.textContent = labelAccessor(row);

    const value = document.createElement("span");
    value.textContent = `${formatNumber(row.sessions)}회 · ${formatShare(row.share)}`;

    head.appendChild(label);
    head.appendChild(value);

    const track = document.createElement("div");
    track.className = "dashboard-progress-track";

    const fill = document.createElement("div");
    fill.className = "dashboard-progress-fill";
    fill.style.width = `${Math.max(4, Math.round((row.share || 0) * 100))}%`;

    track.appendChild(fill);
    item.appendChild(head);
    item.appendChild(track);
    target.appendChild(item);
  });
}

function renderEvents(events = []) {
  const target = document.querySelector("[data-dashboard-events]");
  if (!target) return;
  target.innerHTML = "";

  if (!events.length) {
    const empty = document.createElement("p");
    empty.className = "dashboard-empty";
    empty.textContent = "추적할 클릭 이벤트가 아직 없습니다.";
    target.appendChild(empty);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement("div");
    item.className = "dashboard-event-item";

    const copy = document.createElement("div");
    const label = document.createElement("strong");
    const description = document.createElement("span");
    const count = document.createElement("b");

    label.textContent = event.label;
    description.textContent = event.description;
    count.textContent = formatNumber(event.count);

    copy.appendChild(label);
    copy.appendChild(description);
    item.appendChild(copy);
    item.appendChild(count);
    target.appendChild(item);
  });
}

function renderOpportunities(items = [], searchError = "") {
  const target = document.querySelector("[data-dashboard-opportunities]");
  if (!target) return;
  target.innerHTML = "";

  if (searchError) {
    const error = document.createElement("p");
    error.className = "dashboard-empty";
    error.textContent = `Search Console 데이터를 읽지 못했습니다: ${searchError}`;
    target.appendChild(error);
    return;
  }

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "dashboard-empty";
    empty.textContent = "클릭 개선 후보를 판단할 데이터가 아직 없습니다.";
    target.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "dashboard-opportunity";

    const query = document.createElement("strong");
    const insight = document.createElement("span");
    const meta = document.createElement("small");

    query.textContent = item.query;
    insight.textContent = item.insight;
    meta.textContent = `노출 ${formatNumber(item.impressions)} · CTR ${formatPercent(
      item.ctr
    )} · 평균순위 ${formatPosition(item.position)}`;

    card.appendChild(query);
    card.appendChild(insight);
    card.appendChild(meta);
    target.appendChild(card);
  });
}

function showSetup(payload) {
  dashboardGrid?.classList.add("is-hidden");
  setupPanel?.classList.remove("is-hidden");

  if (setupMessage) {
    setupMessage.textContent = payload.message || "대시보드 설정이 아직 완료되지 않았습니다.";
  }

  if (setupMissing) {
    setupMissing.innerHTML = "";
    (payload.missing || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      setupMissing.appendChild(li);
    });
  }

  if (setupNotes) {
    setupNotes.innerHTML = "";
    (payload.setup?.notes || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      setupNotes.appendChild(li);
    });
  }
}

function showDashboard(payload) {
  setupPanel?.classList.add("is-hidden");
  dashboardGrid?.classList.remove("is-hidden");

  renderMetrics(payload);
  renderInsights(payload);
  renderChart(payload.series || [], payload.range || {});
  renderEvents(payload.events || []);
  renderOpportunities(payload.search?.opportunities || [], payload.search?.error || "");
  renderBars(
    document.querySelector("[data-dashboard-channels]"),
    payload.channels || [],
    (row) => sourceLabels[row.channelGroup] || row.channelGroup
  );
  renderBars(
    document.querySelector("[data-dashboard-devices]"),
    payload.devices || [],
    (row) => deviceLabels[row.deviceCategory] || row.deviceCategory
  );

  renderTable(document.querySelector('[data-table="sources"]'), payload.sources || [], createSourceRow);
  renderTable(
    document.querySelector('[data-table="naverLandingPages"]'),
    payload.naver?.landingPages || [],
    createLandingRow,
    "네이버 유입 랜딩 페이지가 아직 없습니다."
  );
  renderTable(document.querySelector('[data-table="landingPages"]'), payload.landingPages || [], createLandingRow);
  renderTable(
    document.querySelector('[data-table="queries"]'),
    payload.search?.queries || [],
    createQueryRow,
    payload.search?.error ? "Search Console 데이터를 읽지 못했습니다." : "Google 검색어 데이터가 아직 없습니다."
  );
  renderTable(
    document.querySelector('[data-table="pages"]'),
    payload.search?.pages || [],
    createPageRow,
    payload.search?.error ? "Search Console 데이터를 읽지 못했습니다." : "검색 페이지 데이터가 아직 없습니다."
  );

  if (rangeLabel) {
    const unit = payload.range?.granularity === "hour" ? "시간대별" : "일자별";
    rangeLabel.textContent = `${payload.range?.startDate || "-"} ~ ${
      payload.range?.endDate || "-"
    } · ${unit} · 막대는 방문, 선은 주문/상담 클릭`;
  }

  if (rangeCopy) {
    rangeCopy.textContent = payload.range?.isPartial
      ? "오늘 현재까지 들어온 예비 데이터를 봅니다."
      : `${payload.range?.label || "선택 기간"} 데이터를 봅니다.`;
  }

  partialBadge?.classList.toggle("is-hidden", !payload.range?.isPartial);

  if (searchConsoleSite) {
    searchConsoleSite.textContent = payload.search?.siteUrl
      ? `${payload.search.siteUrl} · Google 검색 기준`
      : "Google Search Console 기준";
  }
}

async function fetchDashboard(rangeKey = "today") {
  setActiveRange(rangeKey);
  setStatus("대시보드 데이터를 불러오는 중입니다.");

  try {
    const response = await fetch(`/api/dashboard/summary?range=${encodeURIComponent(rangeKey)}`, {
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json();

    if (!response.ok) {
      if (payload.error === "dashboard_not_configured") {
        showSetup(payload);
        setStatus("환경변수와 Google 속성 연결이 필요합니다.");
        return;
      }

      throw new Error(payload.message || "대시보드 데이터를 읽지 못했습니다.");
    }

    showDashboard(payload);

    const errorCount = payload.errors?.length || 0;
    const suffix = errorCount ? ` · 일부 데이터 ${errorCount}개 미연결` : "";
    setStatus(`${formatDateTime(payload.generatedAt)} 기준으로 갱신되었습니다.${suffix}`);
  } catch (error) {
    setupPanel?.classList.add("is-hidden");
    dashboardGrid?.classList.add("is-hidden");
    setStatus(error.message || "대시보드를 불러오는 중 오류가 발생했습니다.");
  }
}

rangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    fetchDashboard(button.dataset.rangeKey || "today");
  });
});

fetchDashboard("today");
