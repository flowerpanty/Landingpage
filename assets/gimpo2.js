(() => {
  "use strict";

  const flights = window.NmGimpoFlights;
  const byId = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll('.flight-tabs [role="tab"]')];
  const list = byId('g2-list');
  const search = byId('g2-search');
  const panel = byId('g2-flight-panel');
  const analysis = byId('my-flight');
  const pendingFlight = flights.flightQuery();
  const state = { type: 'departure', payload: null, selected: null, sequence: 0 };
  let lastPickupEventKey = '';

  function track(name, details = {}) {
    if (typeof window.gtag === 'function') window.gtag('event', name, details);
  }

  function endpoint(row) {
    return row.type === 'departure' ? row.destination : row.origin;
  }

  function endpointLabel(row) {
    const place = endpoint(row);
    return place?.ko || place?.en || place?.code || '미확인';
  }

  function statusLabel(row) {
    return row.status?.ko || row.status?.en || '운항 정보 확인 중';
  }

  function statusStyle(row) {
    const value = `${row.status?.en || ''} ${row.status?.ko || ''}`.toUpperCase();
    if (/CANCEL|결항/.test(value)) return 'cancelled';
    if (/DELAY|지연/.test(value)) return 'delayed';
    if (/BOARD|탑승/.test(value)) return 'boarding';
    if (/ARRIV|도착/.test(value)) return 'arrival';
    return 'normal';
  }

  function currentKstTime() {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
  }

  function visibleRows() {
    const rows = state.payload?.data || [];
    const query = search.value.trim();
    const matching = rows.filter((row) => flights.matches(row, query))
      .sort((a, b) => (a.revisedTime || a.scheduledTime || '99:99').localeCompare(b.revisedTime || b.scheduledTime || '99:99'));
    if (query) return matching.slice(0, 12);
    const now = currentKstTime();
    const upcoming = matching.filter((row) => (row.revisedTime || row.scheduledTime || '00:00') >= now);
    return (upcoming.length ? upcoming : matching.slice(-6)).slice(0, 6);
  }

  function makeRow(row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flight-row';
    button.setAttribute('aria-label', `${row.flightNumber}, ${endpointLabel(row)}, ${row.revisedTime || row.scheduledTime || '시간 미확인'}, ${statusLabel(row)} 선택`);
    button.setAttribute('aria-pressed', String(state.selected?.id === row.id));
    const time = document.createElement('span');
    time.className = 'row-time';
    time.textContent = row.revisedTime || row.scheduledTime || '—';
    const route = document.createElement('span');
    route.className = 'row-route';
    route.textContent = endpointLabel(row);
    if (endpoint(row)?.code) {
      const small = document.createElement('small');
      small.textContent = endpoint(row).code;
      route.append(small);
    }
    const number = document.createElement('span');
    number.className = 'row-flight';
    number.textContent = row.flightNumber;
    const status = document.createElement('span');
    status.className = 'flight-status';
    status.dataset.kind = statusStyle(row);
    status.textContent = statusLabel(row);
    button.append(time, route, number, status);
    button.addEventListener('click', () => selectFlight(row, true));
    return button;
  }

  function message(lines, retry = false) {
    const paragraph = document.createElement('p');
    paragraph.className = 'flight-message';
    paragraph.textContent = lines;
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '다시 시도 ↻';
      button.addEventListener('click', () => load(true));
      paragraph.append(document.createElement('br'), button);
    }
    list.replaceChildren(paragraph);
  }

  function renderList() {
    const rows = visibleRows();
    if (!rows.length) {
      message(search.value.trim() ? 'NO FLIGHTS FOUND\n검색한 항공편을 찾지 못했어요. 편명 또는 목적지를 다시 확인해 주세요.'
        : '현재 표시할 항공편이 없습니다. 전체 실시간 항공편 페이지에서도 확인해 주세요.');
      return;
    }
    list.replaceChildren(...rows.map(makeRow));
  }

  function updateMeta() {
    const meta = state.payload?.meta;
    const indicator = byId('g2-live-indicator');
    const stale = !meta || meta.stale || meta.live !== true;
    indicator.dataset.state = stale ? 'stale' : 'live';
    indicator.textContent = `GMP · ${stale ? 'STALE' : 'LIVE'}`;
    const time = meta?.updatedAt ? flights.formatTime(new Date(meta.updatedAt)) : '—';
    byId('g2-updated').textContent = `${stale ? '마지막 확인 정보' : '한국공항공사 운항정보'} · ${time} 업데이트`;
  }

  async function load(force = false) {
    const sequence = ++state.sequence;
    const type = state.type;
    if (!state.payload) message('CHECKING GIMPO AIRPORT...\n실시간 항공편 정보를 불러오는 중입니다.');
    try {
      const payload = await flights.load(type, { force });
      if (sequence !== state.sequence) return;
      state.payload = payload;
      updateMeta();
      if (state.selected) {
        const refreshed = payload.data.find((row) => row.id === state.selected.id);
        if (refreshed) state.selected = refreshed;
        else { state.selected = null; analysis.hidden = true; byId('g2-selection-bar').hidden = true; }
      }
      renderList();
      if (state.selected) renderSelection();
    } catch {
      if (sequence !== state.sequence) return;
      if (state.payload) {
        state.payload.meta = { ...state.payload.meta, stale: true, live: false };
        updateMeta(); renderList();
        if (state.selected) renderSelection();
      } else {
        byId('g2-live-indicator').textContent = 'GMP · OFFLINE';
        message('FLIGHT INFORMATION TEMPORARILY UNAVAILABLE\n현재 실시간 항공편 정보를 불러올 수 없습니다.', true);
      }
    }
  }

  async function setType(type, { focus = false, keepQuery = false } = {}) {
    if (type !== 'departure' && type !== 'arrival') return;
    const changed = state.type !== type;
    state.type = type;
    tabs.forEach((tab) => {
      const selected = tab.dataset.type === type;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (focus && selected) tab.focus();
    });
    panel.setAttribute('aria-labelledby', type === 'departure' ? 'g2-departure-tab' : 'g2-arrival-tab');
    byId('g2-route-label').textContent = type === 'departure' ? 'DESTINATION' : 'ORIGIN';
    if (changed) {
      state.payload = null;
      state.selected = null;
      analysis.hidden = true;
      byId('g2-selection-bar').hidden = true;
      if (!keepQuery) history.replaceState(null, '', location.pathname);
      await load();
    }
  }

  function action(parent, href, text) {
    parent.replaceChildren();
    if (!href) return;
    const link = document.createElement('a');
    link.href = href;
    link.textContent = text;
    link.addEventListener('click', () => track('pickup_cta_click', { flightNumber: state.selected?.flightNumber, destination: endpointLabel(state.selected), pickupStatus: parent.closest('.pickup-card')?.dataset.kind }));
    parent.append(link);
  }

  function timeline(plan) {
    const section = byId('g2-timeline');
    if (!['PLENTY', 'AVAILABLE'].includes(plan.kind)) { section.hidden = true; return; }
    const now = new Date();
    const { storeToAirportMinutes, airportBufferMinutes, safetyBufferMinutes } = flights.TRAVEL_CONFIG;
    const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60_000);
    const steps = [
      ['NOW', now, '현재 시각'],
      ['NOTHINGMATTERS', addMinutes(plan.departure, -(airportBufferMinutes + safetyBufferMinutes + storeToAirportMinutes)), '픽업 완료 기준 · 예약시간 확인'],
      ['GIMPO AIRPORT', addMinutes(plan.departure, -(airportBufferMinutes + safetyBufferMinutes)), '이동 15분 가정'],
      ['CHECK-IN', addMinutes(plan.departure, -airportBufferMinutes), '수속 여유 기준'],
      ['DEPARTURE', plan.departure, '변경시간 우선']
    ];
    const items = steps.map(([name, date, note]) => {
      const li = document.createElement('li');
      const title = document.createElement('strong'); title.textContent = name;
      const time = document.createElement('span'); time.textContent = flights.formatTime(date);
      const caption = document.createElement('small'); caption.textContent = note;
      li.append(title, time, caption); return li;
    });
    byId('g2-timeline-steps').replaceChildren(...items);
    section.hidden = false;
  }

  function renderSelection() {
    const row = state.selected;
    if (!row) return;
    analysis.hidden = false;
    const route = `${row.origin?.code || row.origin?.ko || '—'} → ${row.destination?.code || row.destination?.ko || '—'}`;
    byId('g2-flight-route').textContent = route;
    byId('g2-flight-number').textContent = row.flightNumber;
    byId('g2-flight-time').textContent = row.revisedTime || row.scheduledTime || '—';
    byId('g2-flight-status').textContent = statusLabel(row);
    byId('g2-flight-schedule').textContent = `${row.scheduledTime || '—'} → ${row.revisedTime || '변경 없음'}`;
    byId('g2-selected-board').href = flights.flightUrl('/gimpo-board/', row);
    byId('g2-board-link').href = flights.flightUrl('/gimpo-board/', row);

    const plan = flights.pickupPlan(row, state.payload?.meta);
    const card = byId('g2-pickup-card');
    card.dataset.kind = plan.kind;
    const status = byId('g2-pickup-status');
    const copy = byId('g2-pickup-copy');
    const countdown = byId('g2-countdown');
    const actions = byId('g2-pickup-action');
    const bar = byId('g2-selection-bar');
    const barLink = byId('g2-bar-link');
    const barCopy = byId('g2-bar-copy');
    const remaining = plan.minutes == null ? '' : `출발까지 ${Math.floor(plan.minutes / 60)}시간 ${plan.minutes % 60}분`;
    countdown.textContent = remaining;
    status.textContent = ({ PLENTY:'PLENTY OF TIME', AVAILABLE:'AVAILABLE', QUICK:'QUICK PICK-UP', NOT_RECOMMENDED:'NOT RECOMMENDED', CANCELLED:'CANCELLED', DEPARTED:'DEPARTED', UNAVAILABLE:'TIME UNAVAILABLE', ARRIVAL:'WELCOME TO SEOUL' })[plan.kind];
    const messages = {
      PLENTY:'시간 계산상 픽업 여유가 있어 보입니다. 실제 예약·영업 여부를 확인해 주세요.',
      AVAILABLE:'픽업을 계획해 볼 수 있는 시간대입니다. 실제 이동·수속 시간과 예약 가능 여부를 확인해 주세요.',
      QUICK:'시간이 많지 않습니다. 이미 예약한 상품이 준비되었다면 매장 위치와 공항 이동 시간을 먼저 확인해 주세요.',
      NOT_RECOMMENDED:'지금은 쿠키보다 비행기가 먼저예요. 공항으로 바로 이동하세요. Have a safe flight.',
      CANCELLED:'항공편이 결항되었습니다. 항공사와 김포공항의 공식 안내를 확인해 주세요.',
      DEPARTED:'출발 처리된 항공편입니다. 항공사와 공항 안내를 확인해 주세요.',
      UNAVAILABLE:'현재 운항정보 또는 출발시간을 확인할 수 없어 픽업 가능 여부를 계산하지 않습니다.',
      ARRIVAL:'여행은 끝났지만 쿠키는 아직 남아있어요. 김포공항 근처에서 예약 픽업 가능한 쿠키를 살펴보세요.'
    };
    copy.textContent = messages[plan.kind];
    const destinations = {
      PLENTY:['#cookies','쿠키 보러가기 →'], AVAILABLE:['/gimpo/pickup/','픽업 안내 보기 →'],
      QUICK:['/gimpo/pickup/#pickup-location','매장 위치 확인 →'], ARRIVAL:['#cookies','김포공항 근처 쿠키 보기 →']
    };
    action(actions, ...(destinations[plan.kind] || [null, null]));
    timeline(plan);
    bar.hidden = false;
    barCopy.textContent = `${row.flightNumber} · ${plan.kind === 'ARRIVAL' ? '도착편' : remaining || status.textContent}`;
    if (destinations[plan.kind]) {
      barLink.hidden = false;
      barLink.href = destinations[plan.kind][0];
      barLink.textContent = destinations[plan.kind][1];
    } else {
      barLink.hidden = true;
    }
    const eventKey = `${row.id}:${plan.kind}`;
    if (eventKey !== lastPickupEventKey) {
      lastPickupEventKey = eventKey;
      track('pickup_status_view', { flightNumber: row.flightNumber, destination: endpointLabel(row), pickupStatus: plan.kind, minutesUntilDeparture: plan.minutes });
    }
  }

  function selectFlight(row, scroll = false) {
    state.selected = row;
    history.replaceState(null, '', flights.flightUrl(location.pathname, row));
    renderList();
    renderSelection();
    track('flight_select', { flightNumber: row.flightNumber, destination: endpointLabel(row) });
    if (scroll) analysis.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setType(tab.dataset.type));
    tab.addEventListener('keydown', (event) => {
      const next = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!next) return;
      event.preventDefault();
      setType(tabs[(tabs.indexOf(tab) + next + tabs.length) % tabs.length].dataset.type, { focus: true });
    });
  });
  search.addEventListener('input', () => { if (state.payload) renderList(); track('flight_search', { queryLength: search.value.trim().length }); });
  byId('g2-board-link').addEventListener('click', () => track('flight_board_view_all', { flightNumber: state.selected?.flightNumber }));

  (async () => {
    await load();
    if (!pendingFlight) return;
    let found = state.payload?.data.find((row) => row.flightNumber === pendingFlight);
    if (!found) {
      await setType('arrival', { keepQuery: true });
      found = state.payload?.data.find((row) => row.flightNumber === pendingFlight);
    }
    if (found) { selectFlight(found); analysis.scrollIntoView({ behavior: 'instant', block: 'start' }); }
  })();
  window.setInterval(() => { if (!document.hidden) load(true); }, 60_000);
  window.setInterval(() => { if (state.selected && !document.hidden) renderSelection(); }, 60_000);
})();
