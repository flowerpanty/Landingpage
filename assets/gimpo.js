(() => {
  "use strict";
  const section = document.querySelector("[data-gimpo-preview]");
  const service = window.NmGimpoFlights;
  if (!section || !service) return;

  const state = section.querySelector("[data-preview-state]");
  const container = section.querySelector("[data-preview-rows]");
  const fallback = "실시간 항공편 정보를 불러올 수 없습니다.";
  let started = false;
  const kstDate = (date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
  const kstTime = (date) => new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);

  async function showFlights() {
    if (started) return;
    started = true;
    state.textContent = "오늘의 항공편을 확인하고 있습니다…";
    try {
      const payload = await service.load("departure");
      const updatedAt = new Date(payload.meta?.updatedAt || "");
      if (!payload.meta?.live || payload.meta.stale || Number.isNaN(updatedAt.getTime()) || kstDate(updatedAt) !== kstDate(new Date())) {
        throw new Error("flight_data_stale");
      }
      const rows = payload.data.filter((row) => row?.flightNumber && row?.destination && /^\d{2}:\d{2}$/.test(row.revisedTime || row.scheduledTime || ""));
      const now = kstTime(new Date());
      const upcoming = rows.filter((row) => (row.revisedTime || row.scheduledTime) >= now);
      const selected = (upcoming.length ? upcoming : rows.slice(-4)).slice(0, 4);
      if (!selected.length) {
        state.textContent = "현재 표시할 출발 항공편이 없습니다.";
        return;
      }
      const fragment = document.createDocumentFragment();
      for (const row of selected) {
        const card = document.createElement("article");
        const time = document.createElement("time");
        time.textContent = row.revisedTime || row.scheduledTime;
        const flight = document.createElement("strong");
        flight.textContent = row.flightNumber;
        const detail = document.createElement("span");
        const place = row.destination.ko || row.destination.en || row.destination.code || "목적지 미제공";
        const status = row.status?.ko || row.status?.en || "운항상태 미제공";
        detail.textContent = `${place} · ${status}`;
        card.append(time, flight, detail);
        fragment.append(card);
      }
      container.replaceChildren(fragment);
      state.textContent = "김포공항 출발 항공편 · 일부 미리보기";
    } catch {
      container.replaceChildren();
      state.textContent = fallback;
    }
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      showFlights();
    }, { rootMargin: "160px 0px" });
    observer.observe(section);
  } else {
    showFlights();
  }
})();
