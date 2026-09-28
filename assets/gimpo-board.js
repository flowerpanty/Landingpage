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
  const moreButton = document.getElementById("board-more");
  const direction = document.getElementById("board-direction");
  const routeHeading = document.getElementById("route-heading");
  const searchSheet = document.getElementById("flight-search-sheet");
  const searchOpen = document.getElementById("board-search-open");
  const searchClose = document.getElementById("board-search-close");
  const searchDone = document.getElementById("board-search-done");
  const loader = document.getElementById("board-loader");
  const flap = window.NmSplitFlap;
  const flights = window.NmGimpoFlights;
  const BANK_WIDTHS = { flight: 7, route: 16, time: 5, gate: 2, status: 10 };
  const MOBILE_BANK_WIDTHS = { flight: 7, route: 11, time: 5, status: 9 };
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
  let hasPlayedInitialFlapReveal = false;
  let initialFlight = flights.flightQuery();
  let searchTerm = "";
  let searchTimer;
  let extraPages = 0;
  const mobileQuery = window.matchMedia("(max-width: 760px)");
  const kstClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  function minutesOfDay(value) {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return null;
    const [hour, minute] = value.split(":").map(Number);
    return hour < 24 && minute < 60 ? hour * 60 + minute : null;
  }

  function inTimeWindow(row, nowMinutes) {
    const minutes = minutesOfDay(row.revisedTime || row.scheduledTime);
    return minutes !== null && minutes >= nowMinutes - 60 && minutes <= nowMinutes + 240;
  }

  function pageSize() { return mobileQuery.matches ? 10 : 16; }

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

  function compactPlace(place) {
    const known = { CJU: "JEJU", PUS: "BUSAN/PUS", HND: "TOKYO/HND", KIX: "OSAKA/KIX", TSA: "TAIPEI/TSA", FUK: "FUKUOKA", DLC: "DALIAN/DLC", GMP: "GIMPO" };
    const code = String(place?.code || "").toUpperCase();
    if (known[code]) return known[code];
    const english = String(place?.en || "").toUpperCase().trim();
    if (/^[A-Z0-9 :/.-]+$/.test(english) && english.length <= MOBILE_BANK_WIDTHS.route) return english;
    const city = english.split(/[\/,]/)[0].trim();
    const cityAndCode = `${city}/${code}`;
    if (city && /^[A-Z]{3}$/.test(code) && cityAndCode.length <= MOBILE_BANK_WIDTHS.route) return cityAndCode;
    return /^[A-Z]{3}$/.test(code) ? code : "-";
  }

  function compactStatus(value) {
    const full = String(value || "").toUpperCase().trim().replace(/\s+/g, " ");
    // Preserve the provider's full status in aria/detail; only the mechanical display is shortened.
    const known = {
      "FINAL BOARDING": "BOARDING", "NOW BOARDING": "BOARDING", "BOARDING NOW": "BOARDING",
      "ON SCHEDULE": "ON TIME", "DELAY": "DELAYED", "DELAYED DEPARTURE": "DELAYED",
      "DEPARTURE COMPLETED": "DEPARTED", "ARRIVAL COMPLETED": "ARRIVED",
      "CANCELED": "CANCELLED"
    };
    if (known[full]) return known[full];
    return /^[A-Z0-9 /-]+$/.test(full) && full.length <= MOBILE_BANK_WIDTHS.status ? full : "CHECK";
  }

  function routeValue(place) { return mobileQuery.matches ? compactPlace(place) : mechanicalPlace(place); }
  function statusValue(value) { return mobileQuery.matches ? compactStatus(value) : value || "-"; }
  function airlineLabel(row) {
    const name = row.airline.en || row.airline.ko || "—";
    return mobileQuery.matches ? `${name} · ${row.lineType === "international" ? "INT" : "DOM"}` : name;
  }
  function routeSecondaryLabel(place) {
    const name = place?.ko || "";
    const code = String(place?.code || "").toUpperCase();
    return mobileQuery.matches ? [name, /^[A-Z]{3}$/.test(code) ? code : ""].filter(Boolean).join(" · ") : name;
  }

  function gateDisplay(gate) {
    if (!gate) return "--";
    const value = String(gate);
    return /^\d$/.test(value) ? value.padStart(2, "0") : value;
  }

  function scheduleChanged(row) {
    return /^\d{2}:\d{2}$/.test(row.scheduledTime || "") &&
      /^\d{2}:\d{2}$/.test(row.revisedTime || "") && row.revisedTime !== row.scheduledTime;
  }

  function setTimeMetadata(time, scheduled, row) {
    const changed = scheduleChanged(row);
    time.td.classList.toggle("is-revised", changed);
    scheduled.hidden = !changed;
    if (changed) {
      const prefix = document.createElement("span");
      prefix.className = "changed-time-prefix";
      prefix.textContent = "변경시간";
      const original = document.createElement("span");
      original.textContent = ` · 기존 ${row.scheduledTime}`;
      scheduled.replaceChildren(prefix, original);
    } else scheduled.replaceChildren();
    time.td.setAttribute("aria-label", changed
      ? `변경된 시간 ${row.revisedTime}, 기존 예정시간 ${row.scheduledTime}`
      : `시간 ${row.revisedTime || row.scheduledTime || "-"}`);
  }

  function bankCell(field, value, labelText, blank = false) {
    const td = cell("");
    td.dataset.field = field;
    td.setAttribute("role", "cell");
    td.setAttribute("aria-label", `${labelText} ${value}`);
    const width = (mobileQuery.matches ? MOBILE_BANK_WIDTHS : BANK_WIDTHS)[field];
    const bank = flap.createFlapBank(blank ? " ".repeat(width) : value, `flap-bank--${field}`, width);
    bank.setAttribute("aria-hidden", "true");
    td.append(bank);
    return { td, bank, targetValue: value };
  }

  function flightRow(row, blank = false) {
    const tr = document.createElement("tr");
    tr.setAttribute("role", "row");
    tr.dataset.flightId = row.id;
    const flight = bankCell("flight", row.flightNumber, "편명", blank);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "flight-number";
    button.setAttribute("aria-label", `${row.flightNumber} 항공편 상세 보기`);
    button.append(flight.bank);
    button.addEventListener("click", () => openDetail(tr._row, button));
    flight.td.append(button);
    tr.append(flight.td);

    const airlineName = document.createElement("small"); airlineName.className = "airline-name";
    airlineName.textContent = airlineLabel(row);
    flight.td.append(airlineName);

    const endpoint = type === "departure" ? row.destination : row.origin;
    const route = bankCell("route", routeValue(endpoint), type === "departure" ? "목적지" : "출발지", blank);
    const routeKorean = document.createElement("small"); routeKorean.className = "flight-cell-sub route-korean";
    routeKorean.textContent = routeSecondaryLabel(endpoint);
    route.td.setAttribute("aria-label", `${type === "departure" ? "목적지" : "출발지"} ${mechanicalPlace(endpoint)} ${endpoint.ko || ""}`.trim());
    route.td.append(routeKorean); tr.append(route.td);

    const time = bankCell("time", row.revisedTime || row.scheduledTime || "-", "시간", blank);
    const scheduled = document.createElement("small"); scheduled.className = "flight-cell-sub scheduled-time";
    setTimeMetadata(time, scheduled, row);
    time.td.append(scheduled); tr.append(time.td);
    const gate = mobileQuery.matches ? null : bankCell("gate", gateDisplay(row.gate), "게이트", blank);
    if (gate) tr.append(gate.td);
    const status = bankCell("status", statusValue(row.status.en), "운항상태", blank);
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
    tr._scheduled = scheduled;
    tr.addEventListener("click", (event) => { if (!event.target.closest("button")) openDetail(tr._row, button); });
    return tr;
  }

  function updateRow(tr, row) {
    if (tr._row === row) return;
    const endpoint = type === "departure" ? row.destination : row.origin;
    const values = {
      flight: row.flightNumber, route: routeValue(endpoint), time: row.revisedTime || row.scheduledTime || "-",
      gate: gateDisplay(row.gate), status: statusValue(row.status.en)
    };
    const labels = { flight: "편명", route: type === "departure" ? "목적지" : "출발지", time: "시간", gate: "게이트", status: "운항상태" };
    for (const [name, value] of Object.entries(values)) {
      const part = tr._banks[name];
      if (!part) continue;
      if (part.bank.dataset.value !== value) flap.setFlapValue(part.bank, value, { animate: false });
      const ariaLabel = `${labels[name]} ${value}`;
      if (part.td.getAttribute("aria-label") !== ariaLabel) part.td.setAttribute("aria-label", ariaLabel);
    }
    setTimeMetadata(tr._banks.time, tr._scheduled, row);
    const airline = airlineLabel(row);
    if (tr._airlineName.textContent !== airline) tr._airlineName.textContent = airline;
    if (tr._routeKorean.textContent !== routeSecondaryLabel(endpoint)) tr._routeKorean.textContent = routeSecondaryLabel(endpoint);
    if (tr._statusKorean.textContent !== (row.status.ko || "")) tr._statusKorean.textContent = row.status.ko || "";
    const routeLabel = `${labels.route} ${mechanicalPlace(endpoint)} ${endpoint.ko || ""}`.trim();
    if (tr._banks.route.td.getAttribute("aria-label") !== routeLabel) tr._banks.route.td.setAttribute("aria-label", routeLabel);
    const statusLabel = `운항상태 ${row.status.en || "-"} ${row.status.ko || ""}`.trim();
    if (tr._banks.status.td.getAttribute("aria-label") !== statusLabel) tr._banks.status.td.setAttribute("aria-label", statusLabel);
    if (tr._banks.status.td.dataset.status !== (row.status.en || "").toUpperCase()) tr._banks.status.td.dataset.status = (row.status.en || "").toUpperCase();
    tr._row = row;
  }

  function render({ dataUpdate = false } = {}) {
    const line = document.querySelector('input[name="board-line"]:checked')?.value || "all";
    const query = searchTerm.trim();
    const nowMinutes = minutesOfDay(kstClock.format(new Date()));
    // Keep the full response in `rows`; only the mechanical DOM is windowed.
    const matching = rows.filter((row) => (line === "all" || row.lineType === line) && flights.matches(row, query));
    const relevant = query ? matching : matching.filter((row) => inTimeWindow(row, nowMinutes));
    const visible = relevant.slice(0, pageSize() * (1 + extraPages));
    count.textContent = `${visible.length} / ${relevant.length} FLIGHTS`;
    moreButton.hidden = visible.length >= relevant.length;
    if (!moreButton.hidden) moreButton.textContent = `다음 항공편 보기 (${relevant.length - visible.length}편 남음)`;
    if (!visible.length) {
      const empty = document.createElement("tr"); empty.className = "board-placeholder";
      const td = cell(rows.length ? query || line !== "all" ? "조건에 맞는 항공편이 없습니다." : "현재 시간대 항공편이 없습니다. 편명으로 전체 항공편을 검색할 수 있습니다."
        : notice.hidden ? "표시할 항공편이 없습니다." : "항공편 정보를 불러오지 못했습니다.");
      td.colSpan = 5; empty.append(td);
      if (rowsElement.children.length !== 1 || !rowsElement.firstElementChild.classList.contains("board-placeholder") || rowsElement.firstElementChild.textContent !== td.textContent) rowsElement.replaceChildren(empty);
      return;
    }
    if (dataUpdate) {
      const currentIds = new Set(rows.map((row) => row.id));
      for (const id of rowElements.keys()) if (!currentIds.has(id)) rowElements.delete(id);
    }
    const reveal = dataUpdate && !hasPlayedInitialFlapReveal && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = visible.map((row, index) => {
      let tr = rowElements.get(row.id);
      if (!tr) {
        tr = flightRow(row, reveal);
        rowElements.set(row.id, tr);
      } else updateRow(tr, row);
      return tr;
    });
    if (rowsElement.children.length !== elements.length || elements.some((tr, index) => rowsElement.children[index] !== tr)) {
      rowsElement.replaceChildren(...elements);
    }
    const displayedIds = new Set(visible.map((row) => row.id));
    for (const id of rowElements.keys()) if (!displayedIds.has(id)) rowElements.delete(id);
    if (!hasPlayedInitialFlapReveal) {
      hasPlayedInitialFlapReveal = true;
      if (reveal) {
        const slots = elements.flatMap((tr) => [...tr.querySelectorAll(".flap-slot")]);
        performance.mark("gimpo-board-initial-blank", {
          detail: { rows: elements.length, blankSlots: slots.filter((slot) => slot.dataset.char === " ").length, slots: slots.length }
        });
        setTimeout(() => {
          let changedSlots = 0;
          elements.forEach((tr, rowIndex) => {
            if (!tr.isConnected) return;
            for (const part of Object.values(tr._banks)) {
              if (part && !part.bank.dataset.value.trim()) changedSlots += flap.setFlapValue(part.bank, part.targetValue, { animate: true, rowDelay: rowIndex * 50, charStagger: 20 });
            }
          });
          performance.mark("gimpo-board-initial-flip", { detail: { changedSlots } });
          setTimeout(() => performance.mark("gimpo-board-initial-settled"), 1100);
        }, 50);
      }
    }
    if (dataUpdate && !hasLoadedRows) performance.mark("gimpo-board-first-render");
  }

  function setNotice(message, retry = false) {
    notice.textContent = message;
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "다시 시도 ↻";
      button.addEventListener("click", () => load(true));
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

  async function load(force = false) {
    const seq = ++requestNumber;
    refreshButton.disabled = true;
    setBadge("CHECKING");
    liveState.textContent = "항공편 정보를 확인하고 있습니다…";
    try {
      const payload = await flights.load(type, { force });
      if (seq !== requestNumber) return;
      rows = payload.data;
      updateMeta(payload.meta);
      if (initialFlight && rows.some((row) => row.flightNumber === initialFlight)) {
        searchInput.value = initialFlight;
        searchTerm = initialFlight;
      }
      render({ dataUpdate: true });
      if (initialFlight) {
        const matching = rows.find((row) => row.flightNumber === initialFlight);
        if (matching) {
          initialFlight = "";
          const selected = rowElements.get(matching.id);
          if (selected) openDetail(matching, selected.querySelector("button"));
        } else if (type === "departure") {
          selectTab(tabs.find((tab) => tab.dataset.type === "arrival"));
        } else {
          initialFlight = "";
        }
      }
      if (!hasLoadedRows) {
        hasLoadedRows = true;
        loader.hidden = true;
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
    document.getElementById("board-marquee-title").textContent = nextType === "departure" ? "DEPARTURE" : "ARRIVAL";
    document.getElementById("board-marquee-ko").textContent = nextType === "departure" ? "출발" : "도착";
    document.querySelector(".board-shell").dataset.type = nextType;
    direction.textContent = nextType === "departure" ? "DEPARTURES / 출발" : "ARRIVALS / 도착";
    routeHeading.textContent = nextType === "departure" ? "DESTINATION" : "ORIGIN";
    if (focus) nextTab.focus();
    if (nextType !== type) { type = nextType; rows = []; extraPages = 0; rowElements.clear(); rowsElement.replaceChildren(); load(); }
  }

  function openDetail(row, trigger) {
    lastTrigger = trigger;
    document.getElementById("board-gimpo2-link").href = flights.flightUrl("/gimpo2/", row);
    const pickupLink = document.getElementById("detail-pickup-link");
    pickupLink.href = flights.flightUrl("/gimpo2/", row);
    pickupLink.textContent = row.type === "arrival" ? "도착 후 김포공항 근처 쿠키 보기 →" : "이 항공편으로 픽업 시간 확인 →";
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
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchTerm = searchInput.value; extraPages = 0; render(); }, 180);
  });
  searchOpen.addEventListener("click", () => {
    searchSheet.showModal();
    if (mobileQuery.matches) searchClose.focus({ preventScroll: true });
    else searchInput.focus();
  });
  searchClose.addEventListener("click", () => searchSheet.close());
  searchDone.addEventListener("click", () => {
    clearTimeout(searchTimer);
    searchTerm = searchInput.value;
    extraPages = 0;
    render();
    searchSheet.close();
  });
  searchSheet.addEventListener("close", () => searchOpen.focus());
  document.querySelectorAll('input[name="board-line"]').forEach((input) => input.addEventListener("change", () => {
    clearTimeout(searchTimer); searchTerm = searchInput.value; extraPages = 0; render();
  }));
  moreButton.addEventListener("click", () => { extraPages += 1; render(); });
  mobileQuery.addEventListener("change", () => {
    extraPages = 0;
    rowElements.clear();
    rowsElement.replaceChildren();
    render();
  });
  refreshButton.addEventListener("click", () => load(true));
  detailClose.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => lastTrigger?.focus());
  window.setInterval(() => { if (!document.hidden) load(); }, 60_000);
  load();
})();
