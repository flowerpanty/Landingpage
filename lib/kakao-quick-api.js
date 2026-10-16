"use strict";

const { createHash, randomBytes } = require("node:crypto");
const { createKakaoQuickClient, KakaoQuickError } = require("./kakao-quick-client.js");
const { createKakaoLocalClient, KakaoLocalError } = require("./kakao-local.js");
const MAX_BODY = 64 * 1024;
const QUOTE_TTL = 5 * 60 * 1000;
const TYPES = new Set(["QUICK", "QUICK_ECONOMY", "QUICK_EXPRESS"]);
const SIZES = new Set(["XS", "S", "M", "L"]);
const FLEETS = new Set(["DAMAS", "LABO", "TON"]);
const PAYMENTS = new Set(["CARD", "CASH_ON_PICKUP", "CASH_ON_DROPOFF"]);

class AdminError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function reply(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  res.end(JSON.stringify(data));
}
function invalid(message) { throw new AdminError(400, "invalid_input", message); }
function text(value, label, max = 200, optional = false) {
  if (optional && (value === undefined || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\p{C}]/u.test(value)) invalid(`${label}을(를) 확인해 주세요.`);
  return value.trim();
}
function number(value, label, min, max, integer = false) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") invalid(`${label}을(를) 입력해 주세요.`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isSafeInteger(result))) invalid(`${label} 범위를 확인해 주세요.`);
  return result;
}
function phone(value) {
  if (typeof value !== "string") invalid("연락처를 확인해 주세요.");
  const result = value.replace(/[\s()-]/g, "");
  if (!/^0\d{8,10}$/.test(result)) invalid("연락처를 확인해 주세요.");
  return result;
}
function note(value, label) {
  return text(typeof value === "string" ? value.replace(/\r?\n/g, " ") : value, label, 500, true);
}
function id(value) {
  const result = text(value, "기존 주문번호", 128);
  if (result === "." || result.includes("..") || /[\s/\\%?#]/u.test(result)) invalid("기존 주문번호를 확인해 주세요.");
  return result;
}
function normalize(body, now, quoteOnly = false) {
  if (Object.hasOwn(body, "pickup")) invalid("출발지는 서버 환경설정에서만 변경할 수 있습니다.");
  const orderType = text(body.orderType, "배송 종류");
  const size = text(body.productSize, "포장 크기");
  const paymentType = quoteOnly ? undefined : text(body.paymentType, "결제 방법");
  if (!TYPES.has(orderType) || !SIZES.has(size) || (!quoteOnly && !PAYMENTS.has(paymentType))) invalid("배송 종류·포장 크기·결제 방법을 확인해 주세요.");
  let fleet;
  if (size === "L") {
    fleet = text(body.fleet, "대형 차량");
    if (!FLEETS.has(fleet)) invalid("대형 차량을 선택해 주세요.");
  } else if (body.fleet) invalid("대형 차량은 L 크기에서만 선택할 수 있습니다.");
  let wishTime;
  if (body.pickupMode === "reserved") {
    wishTime = text(body.wishTime, "희망 픽업시간");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(wishTime)) invalid("픽업시간은 한국시간으로 입력해 주세요.");
    const diff = Date.parse(wishTime) - now;
    const minimum = (orderType === "QUICK_ECONOMY" ? 60 : 20) * 60000;
    if (!Number.isFinite(diff) || diff < minimum || diff > 14 * 86400000) invalid(`예약은 현재부터 ${minimum / 60000}분 이후, 14일 이내로 선택해 주세요.`);
  } else if (body.pickupMode !== "asap" || body.wishTime) invalid("픽업시간 선택을 확인해 주세요.");
  return {
    partnerOrderId: quoteOnly ? "PUBLIC_QUOTE" : id(body.partnerOrderId), orderType, size, fleet, paymentType, wishTime,
    dropoff: {
      location: { basicAddress: text(body.basicAddress, "배송지 주소"), detailAddress: text(body.detailAddress, "상세주소", 200, true),
        latitude: number(body.latitude, "위도", -90, 90), longitude: number(body.longitude, "경도", -180, 180) },
      ...(quoteOnly ? {} : { contact: { name: text(body.recipientName, "받는 분", 80), phone: phone(body.recipientPhone) }, note: note(body.note, "배송 요청사항") })
    },
    product: quoteOnly ? undefined : { name: text(body.productName, "상품명", 120), quantity: number(body.quantity, "수량", 1, 99999, true),
      unitPrice: number(body.unitPrice, "개당 상품 판매금액", 0, 100000000, true),
      detail: note(body.productNote, "배송 유의사항"), trayCount: number(body.trayCount, "포장 개수", 1, 999, true) }
  };
}
function pickupValues(env) {
  const value = (key, fallback) => env[key]?.trim() || fallback;
  return {
    address: value("KAKAO_QUICK_PICKUP_ADDRESS", "서울특별시 강서구 송정로 25"),
    detail: value("KAKAO_QUICK_PICKUP_DETAIL", "1층"),
    latitude: value("KAKAO_QUICK_PICKUP_LATITUDE", 37.557402),
    longitude: value("KAKAO_QUICK_PICKUP_LONGITUDE", 126.8115357),
    name: value("KAKAO_QUICK_PICKUP_NAME", "NOTHINGMATTERS")
  };
}
function pickupConfig(env, quoteOnly = false) {
  const store = pickupValues(env);
  return {
    location: { basicAddress: text(store.address, "출발지 주소"), detailAddress: text(store.detail, "출발지 상세주소", 200, true),
      latitude: number(store.latitude, "출발지 위도", -90, 90), longitude: number(store.longitude, "출발지 경도", -180, 180) },
    ...(quoteOnly ? {} : { contact: { name: text(store.name, "출발지 이름", 80), phone: phone(env.KAKAO_QUICK_PICKUP_PHONE) } })
  };
}
function pricePayload(input, pickup) {
  return { orderType: input.orderType, productSize: input.size,
    pickup: { location: pickup.location, ...(input.wishTime ? { wishTime: input.wishTime } : {}) }, dropoff: { location: input.dropoff.location },
    ...(input.fleet ? { fleetOption: { fleet: input.fleet, type: "REQUIRED" } } : {}) };
}
function createPayload(input, pickup) {
  return { partnerOrderId: input.partnerOrderId, orderType: input.orderType,
    pickup: { ...pickup, ...(input.wishTime ? { wishTime: input.wishTime } : {}) }, dropoff: input.dropoff,
    ...(input.fleet ? { fleetOption: { fleet: input.fleet, type: "REQUIRED" } } : {}),
    paymentInfo: { paymentType: input.paymentType },
    productInfo: { trayCount: input.product.trayCount, size: input.size, totalPrice: input.product.unitPrice * input.product.quantity,
      products: [{ name: input.product.name, quantity: String(input.product.quantity), price: input.product.unitPrice, detail: input.product.detail }] }
  };
}
function safePrice(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new KakaoQuickError("INVALID_RESPONSE");
  return value;
}
function projectPrice(value) {
  return { totalPrice: safePrice(value.totalPrice), ...(value.minimum === undefined ? {} : { minimum: safePrice(value.minimum) }), ...(value.maximum === undefined ? {} : { maximum: safePrice(value.maximum) }) };
}
function projectEstimate(value, input) {
  const selected = Array.isArray(value.lists) && value.lists.find(item => item.orderType === input.orderType && (!input.fleet || item.fleet === input.fleet));
  if (!selected || !Number.isFinite(selected.estimatedTime) || selected.estimatedTime < 0 || typeof selected.fleet !== "string") throw new KakaoQuickError("INVALID_RESPONSE");
  return { estimatedTime: selected.estimatedTime, orderType: selected.orderType, fleet: selected.fleet.slice(0, 80) };
}
function projectOrder(value, partnerOrderId) {
  const receipt = value?.receipt;
  if (!receipt || typeof receipt !== "object") throw new KakaoQuickError("INVALID_RESPONSE");
  return { partnerOrderId,
    status: typeof receipt.status === "string" ? receipt.status.slice(0, 100) : "UNKNOWN",
    kakaoOrderId: typeof receipt.orderId === "string" ? receipt.orderId.slice(0, 128) : "",
    totalPrice: receipt.priceInfo?.totalPrice === undefined ? null : safePrice(receipt.priceInfo.totalPrice) };
}
async function readJson(req) {
  if (!/^application\/json\s*(?:;|$)/i.test(req.headers["content-type"] || "")) throw new AdminError(415, "json_required", "JSON 요청만 사용할 수 있습니다.");
  if (Number(req.headers["content-length"]) > MAX_BODY) throw new AdminError(413, "body_too_large", "요청 내용이 너무 큽니다.");
  const raw = await new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    const cleanup = () => { req.off("data", data); req.off("end", end); req.off("error", error); };
    const error = () => { cleanup(); reject(new AdminError(400, "invalid_json", "요청 형식을 확인해 주세요.")); };
    const data = chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { cleanup(); req.once("error", () => {}); req.resume(); reject(new AdminError(413, "body_too_large", "요청 내용이 너무 큽니다.")); }
      else chunks.push(chunk);
    };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks).toString("utf8")); };
    req.on("data", data); req.once("end", end); req.once("error", error);
  });
  try {
    const result = JSON.parse(raw);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new AdminError(400, "invalid_json", "요청 형식을 확인해 주세요."); }
}

function createKakaoQuickApiHandler({ env = process.env } = {}) {
  let client;
  const getClient = () => (client ||= createKakaoQuickClient({ env }));
  let localClient;
  const getLocal = () => (localClient ||= createKakaoLocalClient({ env }));
  // Short-lived quote metadata only: no order database or callback persistence.
  const quotes = new Map();
  const submitting = new Set();
  const uncertain = new Set();
  const publicWindows = new Map();
  let publicGlobal = { start: Date.now(), count: 0 };
  function limitPublic(req) {
    const now = Date.now();
    for (const [key, window] of publicWindows) if (now - window.start >= 60000) publicWindows.delete(key);
    if (now - publicGlobal.start >= 60000) publicGlobal = { start: now, count: 0 };
    // Railway appends the client address. Keep only a hash in short-lived limiter metadata.
    const address = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",").at(-1).trim();
    const key = createHash("sha256").update(address).digest("hex");
    const window = publicWindows.get(key) || { start: now, count: 0 };
    if (window.count >= 30 || publicGlobal.count >= 120) throw new AdminError(429, "rate_limited", "조회가 많습니다. 잠시 후 다시 이용해 주세요.");
    window.count++; publicGlobal.count++; publicWindows.set(key, window);
  }
  function quoteFor(input, refresh = false) {
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    for (const [key, quote] of quotes) if (quote.expires < Date.now()) quotes.delete(key);
    if (refresh && quotes.get(fingerprint)?.used) quotes.delete(fingerprint);
    if (!quotes.has(fingerprint)) {
      if (quotes.size >= 256) throw new AdminError(429, "too_many_quotes", "잠시 후 다시 조회해 주세요.");
      quotes.set(fingerprint, { token: randomBytes(24).toString("hex"), expires: Date.now() + QUOTE_TTL, price: false, estimate: false, used: false });
    }
    return quotes.get(fingerprint);
  }
  return async function handleKakaoQuickApi(req, res, requestUrl) {
    try {
      const pathname = requestUrl.pathname;
      const isConfig = ["/api/kakao-quick/config", "/api/kakao-quick/admin-config"].includes(pathname);
      const adminConfig = pathname === "/api/kakao-quick/admin-config";
      const canCreate = requestUrl.canCreate === true;
      const lookup = /^\/api\/kakao-quick\/orders\/([^/]+)$/.exec(pathname);
      const action = ["price", "estimate", "orders", "quote-address"].find(name => pathname === `/api/kakao-quick/${name}`);
      if (!isConfig && !lookup && !action) throw new AdminError(404, "not_found", "지원하지 않는 요청입니다.");
      if (!canCreate && (lookup || action === "orders" || pathname.endsWith("/admin-config"))) {
        res.setHeader("WWW-Authenticate", 'Basic realm="nothingmatters dashboard"');
        throw new AdminError(401, "dashboard_auth_required", "관리자 로그인이 필요합니다.");
      }
      const method = isConfig || lookup ? "GET" : "POST";
      if (req.method !== method) { res.setHeader("Allow", method); throw new AdminError(405, "method_not_allowed", "요청 방법을 확인해 주세요."); }
      if (isConfig) {
        let ready = true;
        try { getClient(); if (!adminConfig) getLocal(); } catch { ready = false; }
        const store = pickupValues(env);
        const configuredBase = env.KAKAO_QUICK_BASE_URL || "";
        let sandbox = true;
        try { sandbox = configuredBase.includes("sandbox") || new URL(configuredBase).pathname === "/"; } catch { /* retain sandbox badge while unconfigured */ }
        reply(res, 200, { ready, sandbox, canCreate: adminConfig && canCreate, pickup: { name: store.name,
          address: store.address, detail: store.detail, ...(adminConfig && canCreate ? { phone: env.KAKAO_QUICK_PICKUP_PHONE || "" } : {}) } });
        return;
      }
      if (lookup) {
        let partnerOrderId;
        try { partnerOrderId = id(decodeURIComponent(lookup[1])); } catch { invalid("주문번호를 확인해 주세요."); }
        reply(res, 200, { order: projectOrder(await getClient().getOrder(partnerOrderId), partnerOrderId) });
        return;
      }
      // A custom header and origin check prevent cross-site form submissions.
      if ((req.headers["x-quick-admin"] !== "1" && req.headers["x-quick-request"] !== "1") || req.headers["sec-fetch-site"] === "cross-site") throw new AdminError(403, "origin_forbidden", "퀵 배송 화면에서 다시 시도해 주세요.");
      const origin = req.headers.origin;
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
      const localOrigin = env.NODE_ENV !== "production" && /^(127\.0\.0\.1|localhost):\d+$/.test(host) && origin === `http://${host}`;
      if (origin && origin !== `https://${host}` && !localOrigin) throw new AdminError(403, "origin_forbidden", "관리자 화면에서 다시 시도해 주세요.");
      const body = await readJson(req);
      if (action === "quote-address") {
        if (Object.hasOwn(body, "pickup")) invalid("출발지는 서버 설정으로 고정되어 있습니다.");
        const basicAddress = text(body.basicAddress, "배송지 주소");
        const detailAddress = text(body.detailAddress, "상세주소", 200, true);
        const orderType = body.orderType ?? "QUICK";
        const productSize = body.productSize ?? "S";
        if (!TYPES.has(orderType) || !["XS", "S", "M"].includes(productSize)) invalid("배송 종류와 포장 크기를 확인해 주세요. 대형 배송은 별도 상담이 필요합니다.");
        limitPublic(req);
        let api;
        try { api = getClient(); } catch { throw new AdminError(503, "quick_not_configured", "카카오 T 퀵 조회 서버 설정을 확인해 주세요."); }
        const coordinates = await getLocal().geocodeAddress(basicAddress);
        const input = normalize({ basicAddress, detailAddress, orderType, productSize, pickupMode: "asap", ...coordinates }, Date.now(), true);
        const pickup = pickupConfig(env, true);
        const [price, estimate] = await Promise.all([
          api.getPrice(pricePayload(input, pickup)),
          api.getEstimate({ pickup: pickup.location, dropoff: input.dropoff.location, verticalTypes: ["QUICK"] })
        ]);
        console.info("kakao_quick_public_quote");
        reply(res, 200, { address: { basicAddress, detailAddress }, price: projectPrice(price), estimate: projectEstimate(estimate, input) });
        return;
      }
      const quoteOnly = !canCreate && action !== "orders";
      let pickup;
      try { pickup = pickupConfig(env, action !== "orders"); } catch { throw new AdminError(503, "pickup_not_configured", canCreate ? "출발지 주소·좌표·연락처의 서버 환경설정을 확인해 주세요." : "현재 퀵 요금 조회를 준비 중입니다. 잠시 후 다시 이용해 주세요."); }
      const input = normalize(body, Date.now(), quoteOnly);
      if (!canCreate) limitPublic(req);
      // Anonymous lookups cannot authorize a delivery and must not fill the admin quote cache.
      const quote = canCreate ? quoteFor(input, action !== "orders") : null;
      const api = getClient();
      if (action === "price") {
        const value = await api.getPrice(pricePayload(input, pickup));
        const price = projectPrice(value);
        if (quote) quote.price = true;
        console.info("kakao_quick_price");
        reply(res, 200, { price, ...(quote ? { quoteToken: quote.token } : {}) });
      } else if (action === "estimate") {
        const value = await api.getEstimate({ pickup: pickup.location, dropoff: input.dropoff.location,
          ...(input.wishTime ? { wishTime: input.wishTime } : {}), verticalTypes: ["QUICK"] });
        const estimate = projectEstimate(value, input);
        if (quote) quote.estimate = true;
        reply(res, 200, { estimate, ...(quote ? { quoteToken: quote.token } : {}) });
      } else {
        if (body.confirmed !== true || body.quoteToken !== quote.token || !quote.price || !quote.estimate || quote.used) throw new AdminError(409, "quote_required", "배송비·예상시간을 다시 조회하고 확인해 주세요.");
        if (submitting.has(input.partnerOrderId) || uncertain.has(input.partnerOrderId)) throw new AdminError(409, "order_pending", "접수 결과를 주문 상태 조회로 확인해 주세요. 중복 접수하지 않습니다.");
        if (submitting.size + uncertain.size >= 1024) throw new AdminError(429, "busy", "잠시 후 다시 시도해 주세요.");
        quote.used = true;
        submitting.add(input.partnerOrderId);
        let createStarted = false;
        try {
          await api.checkAuth();
          try {
            const existing = await api.getOrder(input.partnerOrderId);
            reply(res, 409, { error: "duplicate_order", message: "이미 등록된 퀵 주문입니다.", order: projectOrder(existing, input.partnerOrderId) });
            return;
          } catch (error) {
            if (!(error instanceof KakaoQuickError && error.httpStatus === 404 && error.kakaoCode === -20010)) throw error;
          }
          createStarted = true;
          const created = await api.createOrder(createPayload(input, pickup));
          const order = projectOrder(created, input.partnerOrderId);
          console.info("kakao_quick_order_created");
          reply(res, 201, { order });
        } catch (error) {
          if (createStarted && (!(error instanceof KakaoQuickError) || error.code !== "HTTP_ERROR" || error.httpStatus >= 500)) uncertain.add(input.partnerOrderId);
          throw error;
        } finally { submitting.delete(input.partnerOrderId); }
      }
    } catch (error) {
      req.resume();
      if (res.destroyed || res.writableEnded) return;
      if (error instanceof AdminError) {
        if (error.status === 429) res.setHeader("Retry-After", "60");
        reply(res, error.status, { error: error.code, message: error.message });
      }
      else if (error instanceof KakaoLocalError) {
        console.error("kakao_local_error", { code: error.code, httpStatus: error.httpStatus, kakaoCode: error.kakaoCode });
        const missing = error.code === "CONFIGURATION_ERROR";
        const notFound = error.code === "ADDRESS_NOT_FOUND";
        const [status, message] = {
          CONFIGURATION_ERROR: [503, "주소 검색 서버 설정을 확인해 주세요."],
          AUTH_FAILED: [502, "카카오 주소검색 REST API 키를 확인해 주세요."],
          FORBIDDEN: [502, "카카오 주소검색 API 사용 권한 또는 허용 설정을 확인해 주세요."],
          RATE_LIMITED: [429, "주소 검색 요청이 많습니다. 잠시 후 다시 시도해 주세요."],
          ADDRESS_NOT_FOUND: [400, "배송지 주소를 찾지 못했습니다. 도로명 주소를 확인해 주세요."],
          TIMEOUT: [504, "주소 검색 응답이 늦어지고 있습니다. 다시 시도해 주세요."]
        }[error.code] || [502, "주소 검색을 완료하지 못했습니다. 잠시 후 다시 조회해 주세요."];
        reply(res, status, {
          error: missing ? "local_not_configured" : notFound ? "address_not_found" : "address_lookup_failed",
          message
        });
      }
      else if (error instanceof KakaoQuickError) {
        const status = error.code === "CONFIGURATION_ERROR" ? 503 : error.code === "TIMEOUT" ? 504 : 502;
        reply(res, status, { error: "kakao_request_failed", message: error.code === "CONFIGURATION_ERROR" ? "카카오퀵 서버 환경설정을 확인해 주세요." : "카카오 응답을 확인하지 못했습니다. 접수 요청이었다면 주문 상태를 먼저 조회해 주세요." });
      } else reply(res, 500, { error: "internal_error", message: "요청을 처리하지 못했습니다." });
    }
  };
}

module.exports = { createKakaoQuickApiHandler };
