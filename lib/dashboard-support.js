"use strict";

const DAY_MS = 86400000;
const PUBLIC_ORIGIN = "https://nothingmatters.co.kr";

function searchPeriod(days, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now).map(part => [part.type, part.value]));
  const end = Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`) - 3 * DAY_MS;
  const span = offset => ({
    startDate: new Date(end - (offset + days - 1) * DAY_MS).toISOString().slice(0, 10),
    endDate: new Date(end - offset * DAY_MS).toISOString().slice(0, 10)
  });
  return { current: span(0), previous: span(days), timeZone: "America/Los_Angeles", dataState: "final" };
}

function safePage(value) {
  try {
    const url = new URL(value, PUBLIC_ORIGIN);
    if (url.origin !== PUBLIC_ORIGIN) return "(외부 페이지)";
    return url.pathname;
  } catch { return "(확인 필요)"; }
}

function previewAllowed(req, config, env = process.env) {
  let host = "";
  try { host = new URL(`http://${req.headers?.host || ""}`).hostname; } catch { /* Not a local request. */ }
  return ["localhost", "127.0.0.1", "[::1]"].includes(host) && env.DASHBOARD_PREVIEW_PUBLIC_DATA === "1" && env.NODE_ENV !== "production" &&
    config.publicRead && !config.serviceAccount &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket?.remoteAddress);
}

// The optional local preview reads only the already-public analytics endpoints.
// It never forwards user headers, cookies, credentials, or caller-supplied URLs.
async function readPreview(endpoint, request = fetch) {
  if (!/^\/api\/dashboard\/(?:summary\?range=(?:today|7d|30d|90d)|christmas-search)$/.test(endpoint)) {
    throw new Error("invalid_preview_endpoint");
  }
  const response = await request(PUBLIC_ORIGIN + endpoint, {
    headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw Object.assign(new Error("공개 성과 API 연결 실패"), { status: response.status });
  const payload = await response.json();
  if (endpoint.includes("summary") ? !payload.summary || !payload.range : !Array.isArray(payload.periods)) {
    throw new Error("invalid_preview_report");
  }
  // Older production summaries can include query strings in landing-page rows.
  for (const rows of [payload.landingPages, payload.naver?.landingPages, payload.ga4?.landingPages,
    payload.ga4?.naver?.landingPages, payload.search?.pages, payload.searchConsole?.topPages]) {
    rows?.forEach(row => { row.page = safePage(row.page); });
  }
  if (payload.search && !payload.search.dateRange) {
    payload.search.dateRange = { startDate: payload.range.startDate, endDate: payload.range.endDate };
    payload.search.legacyPeriod = true;
  }
  payload.dataSource = { mode: "public-preview", label: "운영 사이트 공개 API · 읽기 전용", origin: PUBLIC_ORIGIN };
  return payload;
}

module.exports = { searchPeriod, safePage, previewAllowed, readPreview };
