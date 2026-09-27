(() => {
  "use strict";

  const cache = new Map();
  const pending = new Map();
  const CACHE_MS = 45_000;
  const PICKUP_CONFIG = Object.freeze({ plentyMinutes: 180, availableMinutes: 120, quickMinutes: 90 });
  const TRAVEL_CONFIG = Object.freeze({ storeToAirportMinutes: 15, airportBufferMinutes: 60, safetyBufferMinutes: 15 });

  async function load(type, { force = false } = {}) {
    if (!['departure', 'arrival'].includes(type)) throw new TypeError('invalid flight type');
    const stored = cache.get(type);
    if (!force && stored && Date.now() - stored.fetchedAt < CACHE_MS) return stored.payload;
    if (pending.has(type)) return pending.get(type);
    const request = (async () => {
      const response = await fetch(`/api/gimpo-board/flights?type=${encodeURIComponent(type)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('flight_data_unavailable');
      const payload = await response.json();
      if (!Array.isArray(payload.data) || !payload.meta) throw new Error('flight_data_invalid');
      cache.set(type, { payload, fetchedAt: Date.now() });
      return payload;
    })();
    pending.set(type, request);
    try { return await request; } finally { pending.delete(type); }
  }

  function matches(row, query) {
    const q = String(query || '').trim().toLocaleLowerCase();
    if (!q) return true;
    return [row.flightNumber, row.airline?.ko, row.airline?.en, row.origin?.ko, row.origin?.en,
      row.origin?.code, row.destination?.ko, row.destination?.en, row.destination?.code]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(q);
  }

  function flightQuery() {
    const value = new URLSearchParams(location.search).get('flight')?.trim().toUpperCase() || '';
    return /^[A-Z0-9]{2,10}$/.test(value) ? value : '';
  }

  function flightUrl(path, row) {
    return row ? `${path}?flight=${encodeURIComponent(row.flightNumber)}` : path;
  }

  function kstDay(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function statusKind(row) {
    const status = `${row.status?.en || ''} ${row.status?.ko || ''}`.toUpperCase();
    if (/CANCEL|결항/.test(status)) return 'cancelled';
    if (/DEPART|TAKE.?OFF|출발완료|이륙/.test(status)) return 'departed';
    return 'current';
  }

  function departureAt(row, meta, now = new Date()) {
    const time = row.revisedTime || row.scheduledTime;
    if (!/^\d{2}:\d{2}$/.test(time || '') || !meta?.updatedAt || meta.stale || meta.live !== true) return null;
    const updated = new Date(meta.updatedAt);
    if (Number.isNaN(updated.getTime()) || kstDay(updated) !== kstDay(now)) return null;
    const result = new Date(`${kstDay(updated)}T${time}:00+09:00`);
    return Number.isNaN(result.getTime()) ? null : result;
  }

  function pickupStatus(minutes) {
    if (minutes >= PICKUP_CONFIG.plentyMinutes) return 'PLENTY';
    if (minutes >= PICKUP_CONFIG.availableMinutes) return 'AVAILABLE';
    if (minutes >= PICKUP_CONFIG.quickMinutes) return 'QUICK';
    return 'NOT_RECOMMENDED';
  }

  function pickupPlan(row, meta, now = new Date()) {
    if (row.type !== 'departure') return { kind: 'ARRIVAL' };
    const flightState = statusKind(row);
    if (flightState !== 'current') return { kind: flightState.toUpperCase() };
    const departure = departureAt(row, meta, now);
    if (!departure) return { kind: 'UNAVAILABLE' };
    const minutes = Math.max(0, Math.ceil((departure.getTime() - now.getTime()) / 60_000));
    return { kind: pickupStatus(minutes), minutes, departure };
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  window.NmGimpoFlights = Object.freeze({ load, matches, flightQuery, flightUrl, pickupPlan, formatTime, PICKUP_CONFIG, TRAVEL_CONFIG });
})();
