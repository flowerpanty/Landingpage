(() => {
  "use strict";

  const tabs = [...document.querySelectorAll('.board-tabs [role="tab"]')];
  const panel = document.getElementById("flight-panel");
  const rowsElement = document.getElementById("flight-rows");
  const searchInput = document.getElementById("flight-search");
  const refreshButton = document.getElementById("board-refresh");
  const notice = document.getElementById("board-notice");
  const liveState = document.getElementById("board-live-state");
  const badge = document.getElementById("board-badge");
  const updated = document.getElementById("board-updated");
  const count = document.getElementById("board-count");
  const direction = document.getElementById("board-direction");
  const routeHeading = document.getElementById("route-heading");
  const searchSheet = document.getElementById("flight-search-sheet");
  const searchOpen = document.getElementById("board-search-open");
  const searchClose = document.getElementById("board-search-close");
  const searchDone = document.getElementById("board-search-done");
  const loader = document.getElementById("board-loader");
  const flap = window.NmSplitFlap;
  const BANK_WIDTHS = { flight: 7, route: 16, time: 5, gate: 2, status: 10 };
  flap.bindSoundToggle(document.getElementById("board-sound"));
  flap.initClock(
    document.getElementById("clock-hh"),
    document.getElementById("clock-mm")
  );
  const dialog = document.getElementById("flight-detail");
  const detailFields = document.getElementById("detail-fields");
  const detailClose = document.getElementById("detail-close");
  let type = "departure";
  let rows = [];
  const rowElements = new Map();
  let currentMeta = null;
  let requestNumber = 0;
  let lastTrigger = null;
  let hasLoadedRows = false;

  for (const [index, word] of ["GIMPO", "FLIGHT", "INFO"].entries()) {
    const bank = flap.createFlapBank(" ".repeat(word.length), "flap-bank--loader");
    bank.setAttribute("aria-hidden", "true");
    loader.querySelector(".board-loader-banks").append(bank);
    setTimeout(() => flap.setFlapValue(bank, word, { rowDelay: index * 50 }), 30);
  }

  function label(airport) {
    return airport?.ko || airport?.en || airport?.code || "—";
  }

  function formattedUpdated(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function cell(content, className = "") {
    const td = document.createElement("td");
    td.className = className;
    td.textContent = content;
    return td;
  }

  function mechanicalPlace(place) {
    const named = { CJU: "JEJU", PUS: "BUSAN/GIMHAE", HND: "TOKYO/HND", GMP: "GIMPO" };
    if (named[place?.code]) return named[place.code];
    const english = String(place?.en || "").toUpperCase();
    return /^[A-Z0-9 :/.-]+$/.test(english) && english.length <= 16 ? english : place?.code || "-";
  }

  function gateDisplay(gate) {
    if (!gate) return "--";
    const value = String(gate);
    return /^\d$/.test(value) ? value.padStart(2, "0") : value;
  }

  function bankCell(field, value, labelText, className = "") {
    const td = cell("", className);
    td.dataset.field = field;
    td.setAttribute("role", "cell");
    td.setAttribute("aria-label", `${labelText} ${value}`);
    const bank = flap.createFlapBank(value, `flap-bank--${field}`, BANK_WIDTHS[field]);
    bank.setAttribute("aria-hidden", "true");
    td.append(bank);
    return { td, bank };
  }

  function flightRow(row) {
    const tr = document.createElement("tr");
    tr.setAttribute("role", "row");
    tr.dataset.flightId = row.id;
    const flight = bankCell("flight", row.flightNumber, "편명");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "flight-number";
    button.setAttribute("aria-label", `${row.flightNumber} 항공편 상세 보기`);
    button.append(flight.bank);
    button.addEventListener("click", () => openDetail(tr._row, button));
    flight.td.append(button);
    tr.append(flight.td);

    const airlineName = document.createElement("small"); airlineName.className = "airline-name";
    airlineName.textContent = row.airline.en || row.airline.ko || "—";
    flight.td.append(airlineName);

    const endpoint = type === "departure" ? row.destination : row.origin;
    const route = bankCell("route", mechanicalPlace(endpoint), type === "departure" ? "목적지" : "출발지");
    const routeKorean = document.createElement("small"); routeKorean.className = "flight-cell-sub route-korean";
    routeKorean.textContent = endpoint.ko || "";
    route.td.setAttribute("aria-label", `${type === "departure" ? "목적지" : "출발지"} ${mechanicalPlace(endpoint)} ${endpoint.ko || ""}`.trim());
    route.td.append(routeKorean); tr.append(route.td);

    const time = bankCell("time", row.revisedTime || row.scheduledTime || "-", "시간"); tr.append(time.td);
    const gate = bankCell("gate", gateDisplay(row.gate), "게이트"); tr.append(gate.td);
    const status = bankCell("status", row.status.en || "-", "운항상태");
    status.td.dataset.status = (row.status.en || "").toUpperCase();
    const statusKorean = document.createElement("small"); statusKorean.className = "flight-cell-sub status-korean";
    statusKorean.textContent = row.status.ko || "";
    status.td.setAttribute("aria-label", `운항상태 ${row.status.en || "-"} ${row.status.ko || ""}`.trim());
    status.td.append(statusKorean); tr.append(status.td);
    tr._row = row;
    tr._banks = { flight, time, gate, route, status };
    tr._airlineName = airlineName;
    tr._routeKorean = routeKorean;
    tr._statusKorean = statusKorean;
    tr.addEventListener("click", (event) => { if (!event.target.closest("button")) openDetail(tr._row, button); });
    return tr;
  }

  function updateRow(tr, row, rowIndex, animate) {
    if (tr._row === row) return;
    const endpoint = type === "departure" ? row.destination : row.origin;
    const values = {
      flight: row.flightNumber, route: mechanicalPlace(endpoint), time: row.revisedTime || row.scheduledTime || "-",
      gate: gateDisplay(row.gate), status: row.status.en || "-"
    };
    const labels = { flight: "편명", route: type === "departure" ? "목적지" : "출발지", time: "시간", gate: "게이트", status: "운항상태" };
    const rowDelay = Math.min(rowIndex * 45, 450) + Math.floor(Math.random() * 25);
    for (const [name, value] of Object.entries(values)) {
      const part = tr._banks[name];
      part.td.setAttribute("aria-label", `${labels[name]} ${value}`);
      flap.setFlapValue(part.bank, value, { animate, rowDelay, onStep: flap.tick });
    }
    tr._airlineName.textContent = row.airline.en || row.airline.ko || "—";
    tr._routeKorean.textContent = endpoint.ko || "";
    tr._statusKorean.textContent = row.status.ko || "";
    tr._banks.route.td.setAttribute("aria-label", `${labels.route} ${values.route} ${endpoint.ko || ""}`.trim());
    tr._banks.status.td.setAttribute("aria-label", `운항상태 ${values.status} ${row.status.ko || ""}`.trim());
    tr._banks.status.td.dataset.status = values.status.toUpperCase();
    tr._row = row;
  }

  function render({ dataUpdate = false } = {}) {
    const line = document.querySelector('input[name="board-line"]:checked')?.value || "all";
    const q = searchInput.value.trim().toLocaleLowerCase();
    const visible = rows.filter((row) => (line === "all" || row.lineType === line) && (!q || [
      row.flightNumber, row.airline.ko, row.airline.en, row.origin.ko, row.origin.en, row.origin.code,
      row.destination.ko, row.destination.en, row.destination.code
    ].filter(Boolean).join(" ").toLocaleLowerCase().includes(q)));
    count.textContent = `${visible.length} FLIGHTS`;
    if (!visible.length) {
      const empty = document.createElement("tr"); empty.className = "board-placeholder";
      const td = cell(rows.length ? "조건에 맞는 항공편이 없습니다."
        : notice.hidden ? "표시할 항공편이 없습니다." : "항공편 정보를 불러오지 못했습니다.");
      td.colSpan = 5; empty.append(td); rowsElement.replaceChildren(empty); return;
    }
    if (dataUpdate) {
      const currentIds = new Set(rows.map((row) => row.id));
      for (const id of rowElements.keys()) if (!currentIds.has(id)) rowElements.delete(id);
    }
    const initial = rowElements.size === 0 && !hasLoadedRows;
    const elements = visible.map((row, index) => {
      let tr = rowElements.get(row.id);
      if (!tr) {
        tr = flightRow(row);
        rowElements.set(row.id, tr);
        if (dataUpdate) {
          tr.classList.add("is-entering");
          const delay = Math.min(index * 38, initial ? 1400 : 300);
          tr.style.setProperty("--row-delay", `${delay}ms`);
          tr.addEventListener("animationend", () => tr.classList.remove("is-entering"), { once: true });
          setTimeout(() => tr.classList.remove("is-entering"), delay + 350);
        }
      } else updateRow(tr, row, index, dataUpdate);
      return tr;
    });
    rowsElement.replaceChildren(...elements);
  }

  function setNotice(message, retry = false) {
    notice.textContent = message;
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "다시 시도 ↻";
      button.addEventListener("click", load);
      notice.append(button);
    }
    notice.hidden = !message;
  }

  function setBadge(state) {
    badge.textContent = `GMP · ${state}`;
    badge.dataset.state = state.toLowerCase();
  }

  function updateMeta(meta) {
    currentMeta = meta;
    const time = formattedUpdated(meta.updatedAt);
    updated.textContent = `UPDATED ${time}`;
    updated.dateTime = meta.updatedAt;
    const stale = meta.stale || meta.live !== true;
    setBadge(stale ? "STALE" : "LIVE");
    liveState.textContent = stale ? "LIVE DATA TEMPORARILY UNAVAILABLE" : "LIVE · 한국공항공사 항공편 정보";
    setNotice(stale ? "마지막으로 확인된 항공편 정보를 표시하고 있습니다." : "");
  }

  async function load() {
    const seq = ++requestNumber;
    refreshButton.disabled = true;
    setBadge("CHECKING");
    liveState.textContent = "항공편 정보를 확인하고 있습니다…";
    try {
      const response = await fetch(`/api/gimpo-board/flights?type=${encodeURIComponent(type)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json();
      if (seq !== requestNumber) return;
      rows = payload.data;
      updateMeta(payload.meta);
      render({ dataUpdate: true });
      if (!hasLoadedRows) {
        hasLoadedRows = true;
        setTimeout(() => { loader.hidden = true; }, 500);
      }
    } catch {
      if (seq !== requestNumber) return;
      loader.hidden = true;
      setBadge(rows.length ? "STALE" : "OFFLINE");
      liveState.textContent = "LIVE DATA TEMPORARILY UNAVAILABLE";
      setNotice(rows.length ? "마지막으로 확인된 항공편 정보를 표시하고 있습니다." : "항공편 정보를 불러올 수 없습니다.", !rows.length);
      if (!rows.length) render();
    } finally {
      if (seq === requestNumber) refreshButton.disabled = false;
    }
  }

  function selectTab(nextTab, focus = false) {
    const nextType = nextTab.dataset.type;
    tabs.forEach((tab) => { const selected = tab === nextTab; tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1; });
    panel.setAttribute("aria-labelledby", nextTab.id);
    document.getElementById("board-marquee-title").textContent = nextType === "departure" ? "DEPARTURES" : "ARRIVALS";
    document.getElementById("board-marquee-ko").textContent = nextType === "departure" ? "출발" : "도착";
    document.querySelector(".board-shell").dataset.type = nextType;
    direction.textContent = nextType === "departure" ? "DEPARTURES / 출발" : "ARRIVALS / 도착";
    routeHeading.textContent = nextType === "departure" ? "DESTINATION" : "ORIGIN";
    if (focus) nextTab.focus();
    if (nextType !== type) { type = nextType; rows = []; rowElements.clear(); rowsElement.replaceChildren(); load(); }
  }

  function openDetail(row, trigger) {
    lastTrigger = trigger;
    document.getElementById("detail-title").textContent = row.flightNumber;
    const fields = [
      ["항공사", [row.airline.ko, row.airline.en].filter(Boolean).join(" / ") || "—"],
      ["출발지", label(row.origin)], ["도착지", label(row.destination)],
      ["예정시간", row.scheduledTime || "—"], ["변경시간", row.revisedTime || "—"],
      ...(row.gate ? [["게이트", row.gate]] : []),
      ["운항상태", [row.status.ko, row.status.en].filter(Boolean).join(" / ") || "확인 중"]
    ];
    detailFields.replaceChildren(...fields.map(([name, content]) => {
      const wrapper = document.createElement("div"); const dt = document.createElement("dt"); const dd = document.createElement("dd");
      dt.textContent = name; dd.textContent = content; wrapper.append(dt, dd); return wrapper;
    }));
    document.getElementById("detail-updated").textContent = `마지막 업데이트: ${formattedUpdated(currentMeta?.updatedAt)}`;
    dialog.showModal();
    detailClose.focus();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
        : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); selectTab(tabs[next], true);
    });
  });
  searchInput.addEventListener("input", render);
  searchOpen.addEventListener("click", () => { searchSheet.showModal(); searchInput.focus(); });
  searchClose.addEventListener("click", () => searchSheet.close());
  searchDone.addEventListener("click", () => searchSheet.close());
  searchSheet.addEventListener("close", () => searchOpen.focus());
  document.querySelectorAll('input[name="board-line"]').forEach((input) => input.addEventListener("change", render));
  refreshButton.addEventListener("click", load);
  detailClose.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => lastTrigger?.focus());
  window.setInterval(() => { if (!document.hidden) load(); }, 60_000);
  load();
})();
