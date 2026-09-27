"use strict";

const API_URL = "https://apis.data.go.kr/B551178/flight-search/info";
const CACHE_TTL_MS = 180_000;
const ROWS_PER_PAGE = 100;
const MAX_PAGES_PER_STREAM = 50;
const MAX_CALLS_PER_DAY = 4500;
const SOURCE = "Korea Airports Corporation";
const VERIFIED_AIRPORT_CODES = new Map([
  ["서울/김포", "GMP"], ["김포", "GMP"], ["GIMPO", "GMP"],
  ["제주", "CJU"], ["JEJU", "CJU"], ["부산/김해", "PUS"], ["BUSAN GIMHAE", "PUS"],
  ["도쿄/하네다", "HND"], ["TOKYO HANEDA", "HND"]
]);
const STREAMS = [
  { lineCode: "D", ioCode: "O", lineType: "domestic", type: "departure" },
  { lineCode: "D", ioCode: "I", lineType: "domestic", type: "arrival" },
  { lineCode: "I", ioCode: "O", lineType: "international", type: "departure" },
  { lineCode: "I", ioCode: "I", lineType: "international", type: "arrival" }
];

function value(row, ...names) {
  for (const name of names) {
    const candidate = row?.[name];
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return "";
}

function airport(row, side) {
  const boarding = side === "boarding";
  const ko = value(row, boarding ? "boardingKor" : "arrivedKor", boarding ? "boardingKorean" : "arrivedKorean");
  const en = value(row, boarding ? "boardingEng" : "arrivedEng", boarding ? "boardingEnglish" : "arrivedEnglish");
  return {
    ko,
    en,
    code: VERIFIED_AIRPORT_CODES.get(ko) || VERIFIED_AIRPORT_CODES.get(en.toUpperCase()) || null
  };
}

function time(valueToFormat) {
  const raw = String(valueToFormat || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "").padStart(4, "0");
  if (digits.length !== 4) return null;
  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2));
  return hour < 24 && minute < 60 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : null;
}

function normalizeFlight(row, stream) {
  if (!row || typeof row !== "object") return null;
  const flightNumber = value(row, "airFln", "flightNumber", "schFln").toUpperCase();
  if (!flightNumber) return null;
  const boarding = airport(row, "boarding");
  const arrived = airport(row, "arrived");
  const gimpo = { ko: "서울/김포", en: "GIMPO", code: "GMP" };
  // flight-search uses airport for the requested airport and city for the opposite airport.
  const providerCity = value(row, "city").toUpperCase();
  const cityCode = /^[A-Z]{3}$/.test(providerCity) ? providerCity : null;
  const origin = stream.type === "departure"
    ? { ...boarding, code: "GMP", ko: boarding.ko || gimpo.ko, en: boarding.en || gimpo.en }
    : { ...boarding, code: cityCode || boarding.code };
  const destination = stream.type === "arrival"
    ? { ...arrived, code: "GMP", ko: arrived.ko || gimpo.ko, en: arrived.en || gimpo.en }
    : { ...arrived, code: cityCode || arrived.code };
  const scheduledTime = time(value(row, "std"));
  const revisedTime = time(value(row, "etd"));
  return {
    id: `${stream.lineType}:${stream.type}:${flightNumber}:${origin.code || origin.ko}:${destination.code || destination.ko}`,
    flightNumber,
    airline: {
      ko: value(row, "airlineKorean", "airlineKor", "airlineKo", "airline"),
      en: value(row, "airlineEnglish", "airlineEng", "airlineEn")
    },
    type: stream.type,
    lineType: stream.lineType,
    origin,
    destination,
    scheduledTime,
    revisedTime,
    gate: value(row, "gate", "gateNumber") || null,
    status: { ko: value(row, "rmkKor"), en: value(row, "rmkEng") }
  };
}

function parsePage(payload) {
  const response = payload?.response || payload;
  const header = response?.header || {};
  if (String(header.resultCode ?? "").padStart(2, "0") !== "00") throw new Error("provider_rejected");
  const body = response?.body;
  const count = Number(body?.totalCount);
  const item = body?.items?.item ?? body?.items ?? [];
  const rows = Array.isArray(item) ? item : item && typeof item === "object" ? [item] : [];
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_PAGES_PER_STREAM * ROWS_PER_PAGE) {
    throw new Error("provider_invalid_count");
  }
  return { rows, totalCount: count };
}

function searchText(row) {
  return [row.flightNumber, row.airline.ko, row.airline.en, row.origin.ko, row.origin.en,
    row.origin.code, row.destination.ko, row.destination.en, row.destination.code].filter(Boolean).join(" ").toLocaleLowerCase();
}

class GimpoBoardUnavailableError extends Error {
  constructor() {
    super("gimpo_board_unavailable");
  }
}

function createGimpoBoardService({
  key = process.env.KAC_FLIGHT_API_KEY || "",
  fetchImpl = global.fetch,
  now = () => Date.now(),
  apiUrl = API_URL,
  timeoutMs = 5000,
  cacheTtlMs = CACHE_TTL_MS
} = {}) {
  let cache = null;
  let refreshPromise = null;
  let nextRetryAt = 0;
  let quotaDay = "";
  let callsToday = 0;

  function countCall() {
    const today = new Date(now()).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    if (today !== quotaDay) { quotaDay = today; callsToday = 0; }
    if (callsToday >= MAX_CALLS_PER_DAY) throw new Error("provider_quota_guard");
    callsToday += 1;
  }

  async function fetchPage(stream, pageNo) {
    countCall();
    const url = new URL(apiUrl);
    const decodedKey = /%[0-9a-f]{2}/i.test(key) ? decodeURIComponent(key) : key;
    url.searchParams.set("serviceKey", decodedKey);
    url.searchParams.set("schLineType", stream.lineCode);
    url.searchParams.set("schIOType", stream.ioCode);
    url.searchParams.set("schAirCode", "GMP");
    url.searchParams.set("type", "json");
    url.searchParams.set("numOfRows", String(ROWS_PER_PAGE));
    url.searchParams.set("pageNo", String(pageNo));
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
    if (!response?.ok) throw new Error("provider_http_error");
    let payload;
    try { payload = await response.json(); } catch { throw new Error("provider_invalid_json"); }
    return parsePage(payload);
  }

  async function fetchStream(stream) {
    const rows = [];
    for (let pageNo = 1; pageNo <= MAX_PAGES_PER_STREAM; pageNo += 1) {
      const page = await fetchPage(stream, pageNo);
      rows.push(...page.rows);
      if (rows.length >= page.totalCount) return rows.slice(0, page.totalCount).map((row) => normalizeFlight(row, stream)).filter(Boolean);
      if (!page.rows.length) throw new Error("provider_incomplete_page");
    }
    throw new Error("provider_page_limit");
  }

  async function refresh() {
    if (!key) throw new GimpoBoardUnavailableError();
    const chunks = await Promise.all(STREAMS.map(fetchStream));
    const rows = chunks.flat().sort((a, b) =>
      (a.scheduledTime || "99:99").localeCompare(b.scheduledTime || "99:99") || a.flightNumber.localeCompare(b.flightNumber));
    cache = { rows, timestamp: now() };
    return cache;
  }

  async function getFlights({ type = "departure", line = "all", q = "" } = {}) {
    if (!["departure", "arrival"].includes(type) || !["all", "domestic", "international"].includes(line)
      || typeof q !== "string" || q.length > 80 || /[\u0000-\u001f]/.test(q)) {
      throw new TypeError("invalid_query");
    }
    let stale = false;
    if ((!cache || now() - cache.timestamp >= cacheTtlMs) && now() >= nextRetryAt) {
      if (!refreshPromise) refreshPromise = refresh().finally(() => { refreshPromise = null; });
      try { await refreshPromise; nextRetryAt = 0; } catch {
        nextRetryAt = now() + cacheTtlMs;
        if (!cache) throw new GimpoBoardUnavailableError();
        stale = true;
      }
    }
    if (!cache) throw new GimpoBoardUnavailableError();
    if (now() - cache.timestamp >= cacheTtlMs) stale = true;
    const query = q.trim().toLocaleLowerCase();
    return {
      data: cache.rows.filter((row) => row.type === type && (line === "all" || row.lineType === line)
        && (!query || searchText(row).includes(query))),
      meta: {
        airport: "GMP",
        updatedAt: new Date(cache.timestamp).toISOString(),
        cacheAgeSeconds: Math.max(0, Math.floor((now() - cache.timestamp) / 1000)),
        source: SOURCE,
        live: !stale,
        stale
      }
    };
  }

  return { getFlights };
}

module.exports = { API_URL, CACHE_TTL_MS, MAX_CALLS_PER_DAY, STREAMS, createGimpoBoardService,
  GimpoBoardUnavailableError, normalizeFlight, parsePage };
