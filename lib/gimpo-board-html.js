"use strict";

const MAX_SERVER_ROWS = 6;
const kstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const koreanDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
const kstTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const escape = value => String(value ?? "—").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function renderGimpoBoardPage(html, payload, { now = Date.now() } = {}) {
  const requested = new Date(now);
  const today = kstDate.format(requested);
  html = html.replace(/<time id="today-arrivals-date"[^>]*>[\s\S]*?<\/time>/,
    `<time id="today-arrivals-date" datetime="${today}">${koreanDate.format(requested)}</time>`);
  if (!payload?.meta?.updatedAt || !Array.isArray(payload.data)) return html;
  const observed = new Date(payload.meta.updatedAt);
  // The request date and cached data date must agree before labeling any row as today's arrival.
  if (Number.isNaN(observed.getTime()) || kstDate.format(observed) !== today) return html;
  const arrivals = payload.data.filter(row => row.type === "arrival").slice(0, MAX_SERVER_ROWS);
  if (!arrivals.length) return html;
  const rows = arrivals.map(row => {
    const origin = row.origin?.ko || row.origin?.en || row.origin?.code || "—";
    const airline = row.airline?.ko || row.airline?.en || "—";
    const scheduled = row.scheduledTime || "정보 없음";
    const revised = row.revisedTime || "정보 없음";
    const status = row.status?.ko || row.status?.en || "정보 없음";
    return `<tr class="board-server-row" role="row" data-server-flight="${escape(row.id)}"><td data-field="flight" aria-label="항공사 ${escape(airline)} · 편명 ${escape(row.flightNumber)}">${escape(row.flightNumber)}<small class="airline-name">${escape(airline)}</small></td><td data-field="route" aria-label="출발지 ${escape(origin)} · 김포공항 도착">${escape(origin)}<span class="visually-hidden"> 출발 → 김포공항 도착</span></td><td data-field="time" aria-label="김포공항 예정 도착시간 ${escape(scheduled)} · 변경 도착시간 ${escape(revised)}">${escape(row.revisedTime || row.scheduledTime)}<small class="flight-cell-sub">예정 도착 ${escape(scheduled)} · 변경 ${escape(revised)}</small></td><td data-field="gate">${escape(row.gate)}</td><td data-field="status" aria-label="운항상태 ${escape(status)}">${escape(status)}</td></tr>`;
  }).join("");
  const stale = payload.meta.stale || payload.meta.live !== true;
  const state = stale ? "마지막으로 확인된 도착정보 · 최신 자료 확인 중" : "한국공항공사 제공 도착정보 · JS로 최신 자료 갱신";
  const time = kstTime.format(observed);
  return html
    .replace(/(<tbody id="flight-rows" role="rowgroup">)[\s\S]*?(<\/tbody>)/, (_, open, close) => open + rows + close)
    .replace(/(<span id="board-live-state"[^>]*>)[\s\S]*?(<\/span>)/, (_, open, close) => open + state + close)
    .replace(/(<p id="today-arrivals-status"[^>]*>)[\s\S]*?(<\/p>)/, (_, open, close) => open + state + close)
    .replace(/<time id="board-updated"[^>]*>[\s\S]*?<\/time>/, `<time id="board-updated" datetime="${escape(payload.meta.updatedAt)}">UPDATED ${escape(time)}</time>`);
}

module.exports = { renderGimpoBoardPage, MAX_SERVER_ROWS };
