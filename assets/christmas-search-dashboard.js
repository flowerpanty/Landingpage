(() => {
  "use strict";
  const panel = document.querySelector("[data-christmas-search]");
  if (!panel) return;
  const output = panel.querySelector("[data-christmas-results]");
  const status = panel.querySelector("[data-christmas-status]");
  const refresh = panel.querySelector("[data-christmas-refresh]");
  const buttons = [...panel.querySelectorAll("[data-christmas-days]")];
  let payload = null, days = 28;
  const labels = {
    available: "조회됨", no_data: "해당 기간 성과 행 없음 · 수요 없음으로 판단하지 마세요",
    not_configured: "Google 연결 설정 필요", access_denied: "서비스 계정 권한 확인 필요",
    upstream_unavailable: "Google 조회 실패 · 잠시 후 다시 확인", partial_or_unavailable: "일부 자료 미확보",
    unavailable: "미확보", observed: "관측됨", not_observed: "미관측 · 수요 판단 보류"
  };
  const number = value => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "—";
  const percent = value => typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "—";
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function line(text) { output.append(element("p", text, "dashboard-panel-copy")); }
  function values(row) { return [number(row?.clicks), number(row?.impressions), percent(row?.ctr), number(row?.position)]; }
  function table(title, headings, rows, emptyText) {
    output.append(element("h3", title));
    const wrapper = element("div", undefined, "dashboard-table-wrap");
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region"); wrapper.setAttribute("aria-label", title);
    const node = element("table", undefined, "dashboard-table");
    node.append(element("caption", title, "christmas-search-caption"));
    const head = element("thead"), header = element("tr");
    headings.forEach(text => { const cell = element("th", text); cell.scope = "col"; header.append(cell); });
    head.append(header); node.append(head);
    const body = element("tbody");
    rows.forEach(row => { const tr = element("tr"); row.forEach(text => tr.append(element("td", text))); body.append(tr); });
    if (!rows.length) { const tr = element("tr"), cell = element("td", emptyText || "자료 미확보"); cell.colSpan = headings.length; tr.append(cell); body.append(tr); }
    node.append(body); wrapper.append(node); output.append(wrapper);
  }
  function render() {
    output.replaceChildren();
    const period = payload?.periods?.find(item => item.days === days);
    if (!period) return;
    buttons.forEach(button => { const active = Number(button.dataset.christmasDays) === days; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
    status.textContent = `${days}일 · ${labels[period.status] || "자료 확인 필요"}`;
    line(`출처: ${payload.source} · ${period.startDate} ~ ${period.endDate} (포함) · ${payload.timeZone} · web / final`);
    if (payload.missing?.length) line(`필요한 서버 환경변수: ${payload.missing.join(", ")}`);
    if (period.sample === "small") line("작은 표본: 페이지 총 노출이 100회 미만입니다. 제목·콘텐츠 변경의 근거로 단정하기 어렵습니다.");
    table("페이지 전체 합계 · 검색어 합산 아님", ["클릭", "노출", "CTR", "평균순위"], period.overview ? [values(period.overview)] : [], "페이지 합계 미확보 · 0으로 대체하지 않습니다.");
    table("기기별 비교", ["기기", "클릭", "노출", "CTR", "평균순위"], period.devices.map(row => [row.device, ...values(row)]), labels[period.deviceStatus]);
    table("검색 주제 A–H · 중복 분류", ["주제", "상태", "검색어 수", "클릭", "노출", "CTR", "평균순위"], period.topics.map(row => [`${row.id}. ${row.name}`, labels[row.status], number(row.queryCount), ...values(row.metrics)]));
    const reasons = row => row.reviewReasons.map(reason => reason === "low_ctr" ? "낮은 CTR · 제목/설명 검토" : "낮은 순위 · 관련 본문 검토").join(" / ");
    table("우선 검토 후보 · 편집 확정 아님", ["검색어", "검토 근거", "클릭", "노출", "CTR", "평균순위"], period.reviewCandidates.slice(0, 100).map(row => [row.query, reasons(row), ...values(row)]), period.queryStatus === "available" ? "현재 확보한 행에서 검토 기준을 충족한 후보가 없습니다. 데이터 누락 또는 작은 표본일 수 있습니다." : "검색어 자료 미확보로 우선 보완 검색어 판단을 보류합니다.");
    table("크리스마스 canonical 검색어", ["검색어", "주제", "클릭", "노출", "CTR", "평균순위"], period.queries.slice(0, 100).map(row => [row.query, row.topics.join(", ") || "기타", ...values(row)]), labels[period.queryStatus] === "조회됨" ? "검색어 행 미관측 · 수요 없음이라는 뜻이 아닙니다." : labels[period.queryStatus]);
    line(`검색어 ${number(period.queries.length)}행 확보, 화면에는 최대 100행 표시. ${period.queryRowsCapped ? "50,000행 조회 한도 도달. " : ""}검색어 조회: ${labels[period.queryStatus]} / 기기 조회: ${labels[period.deviceStatus]}`);
    payload.notes.forEach(line);
  }
  async function load() {
    refresh.disabled = true; panel.setAttribute("aria-busy", "true");
    status.textContent = "Google 검색 성과 조회 중…";
    try {
      const response = await fetch("/api/dashboard/christmas-search", {
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }
      });
      const result = await response.json();
      if (!Array.isArray(result.periods)) throw new Error("unavailable");
      payload = result; render();
    } catch {
      payload = null; output.replaceChildren();
      status.textContent = "검색 성과를 가져오지 못했습니다. 관리자 인증과 서버 연결을 확인한 뒤 다시 조회해 주세요.";
    } finally { refresh.disabled = false; panel.setAttribute("aria-busy", "false"); }
  }
  buttons.forEach(button => button.addEventListener("click", () => { days = Number(button.dataset.christmasDays); render(); }));
  refresh.addEventListener("click", load);
  load();
})();
