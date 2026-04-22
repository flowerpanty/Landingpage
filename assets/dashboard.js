const statusNode = document.querySelector("[data-dashboard-status]");
const setupPanel = document.querySelector("[data-dashboard-setup]");
const setupMessage = document.querySelector("[data-dashboard-setup-message]");
const setupMissing = document.querySelector("[data-dashboard-setup-missing]");
const setupNotes = document.querySelector("[data-dashboard-setup-notes]");
const dashboardGrid = document.querySelector("[data-dashboard-grid]");
const rangeButtons = [...document.querySelectorAll("[data-range-days]")];
const rangeLabel = document.querySelector("[data-dashboard-range-label]");
const searchConsoleSite = document.querySelector("[data-search-console-site]");

const metricFormatters = {
  sessions: (value) => Number(value || 0).toLocaleString("ko-KR"),
  activeUsers: (value) => Number(value || 0).toLocaleString("ko-KR"),
  engagedSessions: (value) => Number(value || 0).toLocaleString("ko-KR"),
  engagementRate: (value) => `${(Number(value || 0) * 100).toFixed(1)}%`,
  naverSessions: (value) => Number(value || 0).toLocaleString("ko-KR"),
  naverActiveUsers: (value) => Number(value || 0).toLocaleString("ko-KR")
};

const formatNumber = (value = 0) => Number(value || 0).toLocaleString("ko-KR");
const formatPercent = (value = 0) => `${(Number(value || 0) * 100).toFixed(1)}%`;
const formatPosition = (value = 0) => Number(value || 0).toFixed(1);

function setStatus(message) {
  if (!statusNode) return;
  statusNode.textContent = message;
}

function setActiveRange(days) {
  rangeButtons.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.rangeDays) === days);
  });
}

function renderList(target, items, formatter) {
  if (!target) return;
  target.innerHTML = "";

  if (!items.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "dashboard-empty";
    cell.colSpan = formatter.emptyColSpan;
    cell.textContent = "표시할 데이터가 아직 없습니다.";
    row.appendChild(cell);
    target.appendChild(row);
    return;
  }

  items.forEach((item) => {
    target.appendChild(formatter(item));
  });
}

function createCell(content, strong = false) {
  const cell = document.createElement("td");
  if (strong) {
    const bold = document.createElement("strong");
    bold.textContent = content;
    cell.appendChild(bold);
  } else {
    cell.textContent = content;
  }
  return cell;
}

function createSourceRow(item) {
  const row = document.createElement("tr");
  row.appendChild(createCell(item.sourceMedium, true));
  row.appendChild(createCell(item.channelGroup));
  row.appendChild(createCell(formatNumber(item.sessions)));
  row.appendChild(createCell(formatNumber(item.activeUsers)));
  return row;
}
createSourceRow.emptyColSpan = 4;

function createLandingRow(item) {
  const row = document.createElement("tr");
  row.appendChild(createCell(item.page, true));
  row.appendChild(createCell(formatNumber(item.sessions)));
  row.appendChild(createCell(formatNumber(item.activeUsers)));
  return row;
}
createLandingRow.emptyColSpan = 3;

function createQueryRow(item) {
  const row = document.createElement("tr");
  row.appendChild(createCell(item.query, true));
  row.appendChild(createCell(formatNumber(item.clicks)));
  row.appendChild(createCell(formatNumber(item.impressions)));
  row.appendChild(createCell(formatPercent(item.ctr)));
  row.appendChild(createCell(formatPosition(item.position)));
  return row;
}
createQueryRow.emptyColSpan = 5;

function createPageRow(item) {
  const row = document.createElement("tr");
  row.appendChild(createCell(item.page, true));
  row.appendChild(createCell(formatNumber(item.clicks)));
  row.appendChild(createCell(formatNumber(item.impressions)));
  row.appendChild(createCell(formatPercent(item.ctr)));
  row.appendChild(createCell(formatPosition(item.position)));
  return row;
}
createPageRow.emptyColSpan = 5;

function renderMetrics(overview = {}) {
  Object.entries(metricFormatters).forEach(([metricName, formatter]) => {
    const node = document.querySelector(`[data-metric="${metricName}"]`);
    if (!node) return;
    node.textContent = formatter(overview[metricName]);
  });
}

function renderChart(rows = []) {
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

  const maxSessions = Math.max(...rows.map((row) => row.sessions), 1);
  const sampledRows = rows.length > 14 ? rows.filter((_, index) => index % Math.ceil(rows.length / 14) === 0) : rows;

  sampledRows.forEach((row) => {
    const column = document.createElement("div");
    column.className = "dashboard-bar";

    const track = document.createElement("div");
    track.className = "dashboard-bar-track";

    const fill = document.createElement("div");
    fill.className = "dashboard-bar-fill";
    fill.style.height = `${Math.max(8, (row.sessions / maxSessions) * 100)}%`;
    fill.title = `${row.date}: ${formatNumber(row.sessions)} sessions`;

    const label = document.createElement("span");
    label.className = "dashboard-bar-label";
    label.textContent = row.date.slice(4);

    track.appendChild(fill);
    column.appendChild(track);
    column.appendChild(label);
    chartNode.appendChild(column);
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

  renderMetrics({
    ...payload.ga4?.overview,
    naverSessions: payload.ga4?.naver?.sessions || 0,
    naverActiveUsers: payload.ga4?.naver?.activeUsers || 0
  });
  renderChart(payload.ga4?.daily || []);

  renderList(document.querySelector('[data-table="sources"]'), payload.ga4?.sources || [], createSourceRow);
  renderList(
    document.querySelector('[data-table="naverLandingPages"]'),
    payload.ga4?.naver?.landingPages || [],
    createLandingRow
  );
  renderList(document.querySelector('[data-table="landingPages"]'), payload.ga4?.landingPages || [], createLandingRow);
  renderList(document.querySelector('[data-table="queries"]'), payload.searchConsole?.topQueries || [], createQueryRow);
  renderList(document.querySelector('[data-table="pages"]'), payload.searchConsole?.topPages || [], createPageRow);

  if (rangeLabel) {
    rangeLabel.textContent = `${payload.range?.startDate || "-"} ~ ${payload.range?.endDate || "-"}`;
  }

  if (searchConsoleSite) {
    searchConsoleSite.textContent = payload.searchConsole?.siteUrl || "";
  }
}

async function fetchDashboard(days) {
  setActiveRange(days);
  setStatus("대시보드 데이터를 불러오는 중입니다.");

  try {
    const response = await fetch(`/api/dashboard/summary?days=${days}`, {
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
    setStatus(`${payload.generatedAt.slice(0, 19).replace("T", " ")} 기준으로 갱신되었습니다.`);
  } catch (error) {
    setupPanel?.classList.add("is-hidden");
    dashboardGrid?.classList.add("is-hidden");
    setStatus(error.message || "대시보드를 불러오는 중 오류가 발생했습니다.");
  }
}

rangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    fetchDashboard(Number(button.dataset.rangeDays || 28));
  });
});

fetchDashboard(28);
