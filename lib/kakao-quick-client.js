"use strict";

const { createHash, randomInt } = require("node:crypto");

// Official documentation, checked 2026-10-15:
// https://logistics-developers.kakaomobility.com/document/tutorial
// https://logistics-developers.kakaomobility.com/document/post-price
// https://logistics-developers.kakaomobility.com/document/delivery-time
// https://logistics-developers.kakaomobility.com/document/post-orders
// https://logistics-developers.kakaomobility.com/document/get-orders
// https://logistics-developers.kakaomobility.com/document/patch-orders-cancel
// The published service paths are sandbox paths; do not guess production paths.
const ORDER_PATH = "/api/v2/orders";
const ERROR_MESSAGES = {
  CONFIGURATION_ERROR: "Kakao Quick configuration is invalid.",
  INVALID_REQUEST: "Kakao Quick request is invalid.",
  TIMEOUT: "Kakao Quick request timed out.",
  NETWORK_ERROR: "Kakao Quick request could not be completed.",
  INVALID_RESPONSE: "Kakao Quick response is invalid.",
  HTTP_ERROR: "Kakao Quick returned an unsuccessful HTTP status."
};

class KakaoQuickError extends Error {
  constructor(code, { httpStatus = null, kakaoCode = null } = {}) {
    super(ERROR_MESSAGES[code]);
    this.name = "KakaoQuickError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.kakaoCode = kakaoCode;
    // Never retain a request, response body, upstream message or original cause.
  }
}

function getConfig(env) {
  const vendorId = env.KAKAO_QUICK_VENDOR_ID?.trim();
  const apiKey = env.KAKAO_QUICK_API_KEY?.trim();
  let baseUrl;
  try {
    baseUrl = new URL(env.KAKAO_QUICK_BASE_URL);
  } catch {
    throw new KakaoQuickError("CONFIGURATION_ERROR");
  }
  const localTest = env.NODE_ENV === "test" && baseUrl.protocol === "http:" && baseUrl.hostname === "127.0.0.1";
  if (!vendorId || !/^[A-Za-z0-9_-]{1,128}$/.test(vendorId) || !apiKey ||
      /[\s\p{C}]/u.test(apiKey) || (!localTest && baseUrl.protocol !== "https:") ||
      baseUrl.username || baseUrl.password || !/^\/(?:[A-Za-z0-9_-]+\/?)?$/.test(baseUrl.pathname) ||
      baseUrl.search || baseUrl.hash) throw new KakaoQuickError("CONFIGURATION_ERROR");
  // Retain compatibility with Phase 2's origin-only configuration.
  const prefix = baseUrl.pathname === "/" ? "/goa-sandbox-service" : baseUrl.pathname.replace(/\/$/, "");
  return { vendorId, apiKey, baseUrl: baseUrl.origin, serviceUrl: baseUrl.origin + prefix };
}

function orderIdSegment(partnerOrderId) {
  if (typeof partnerOrderId !== "string" || !partnerOrderId || partnerOrderId.length > 128 ||
      partnerOrderId === "." || partnerOrderId.includes("..") || /[\s\p{C}/\\%?#]/u.test(partnerOrderId)) {
    throw new KakaoQuickError("INVALID_REQUEST");
  }
  try {
    return encodeURIComponent(partnerOrderId);
  } catch {
    throw new KakaoQuickError("INVALID_REQUEST");
  }
}

function safeKakaoCode(value) {
  // Official error codes are integers; do not pass arbitrary upstream text to logs.
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d{1,9}$/.test(value)) return Number(value);
  return null;
}

function createKakaoQuickClient({
  env = process.env, fetchImpl = global.fetch, timeoutMs = 10000,
  now = Date.now, nonce = () => randomInt(0, 2147483647)
} = {}) {
  const { vendorId, apiKey, baseUrl, serviceUrl } = getConfig(env);
  if (typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new KakaoQuickError("CONFIGURATION_ERROR");
  }

  async function request(method, pathname, payload, { allowEmpty = false, authCheck = false } = {}) {
    let body;
    if (payload !== undefined || method === "POST") {
      try {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
        body = JSON.stringify(payload);
        if (!body || body[0] !== "{") throw new Error();
      } catch {
        throw new KakaoQuickError("INVALID_REQUEST");
      }
    }

    const timestamp = now();
    const nonceValue = nonce();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || !Number.isSafeInteger(nonceValue) ||
        nonceValue < 0 || nonceValue > 2147483647) throw new KakaoQuickError("CONFIGURATION_ERROR");
    // The tutorial prose says HMAC, but its Java MessageDigest example is plain SHA-512.
    // Follow that published executable example: UTF-8, lowercase 128-character hex.
    const sign = createHash("sha512").update(`${timestamp}${nonceValue}${apiKey}`, "utf8").digest("hex");
    const authorization = Buffer.from(`${timestamp}$$${nonceValue}$$${sign}`, "utf8").toString("base64");
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new KakaoQuickError("TIMEOUT"));
        controller.abort();
      }, timeoutMs);
    });

    try {
      // No retries: a timed-out create/cancel may already have reached Kakao.
      return await Promise.race([deadline, (async () => {
        const response = await fetchImpl(`${authCheck ? baseUrl : serviceUrl}${pathname}`, {
          method,
          headers: { Authorization: authorization, vendor: vendorId, "Content-Type": "application/json", Accept: "application/json" },
          ...(body === undefined ? {} : { body }),
          redirect: "error",
          signal: controller.signal
        });
        const text = await response.text();
        let result;
        let validJson = false;
        if (/^application\/json\s*(?:;|$)/i.test(response.headers.get("content-type") || "")) {
          try { result = JSON.parse(text); validJson = true; } catch { /* handled below */ }
        }
        if (!response.ok) {
          throw new KakaoQuickError("HTTP_ERROR", {
            httpStatus: response.status,
            kakaoCode: validJson && result && !Array.isArray(result) ? safeKakaoCode(result.code) : null
          });
        }
        // Auth/cancel documentation defines success by HTTP status, with no required body.
        if (!text && allowEmpty) return null;
        if (!validJson || (!authCheck && (!result || typeof result !== "object" || Array.isArray(result)))) {
          throw new KakaoQuickError("INVALID_RESPONSE", { httpStatus: response.status });
        }
        return result;
      })()]);
    } catch (error) {
      if (error instanceof KakaoQuickError) throw error;
      throw new KakaoQuickError(controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR");
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    checkAuth: () => request("GET", "/v1/auth/check", undefined, { allowEmpty: true, authCheck: true }),
    getPrice: payload => request("POST", `${ORDER_PATH}/price`, payload),
    estimateDelivery: payload => request("POST", `${ORDER_PATH}/estimate`, payload),
    getEstimate: payload => request("POST", `${ORDER_PATH}/estimate`, payload),
    createOrder: payload => request("POST", ORDER_PATH, payload),
    getOrder: partnerOrderId => request("GET", `${ORDER_PATH}/${orderIdSegment(partnerOrderId)}`),
    cancelOrder: (partnerOrderId, payload) => request("PATCH", `${ORDER_PATH}/${orderIdSegment(partnerOrderId)}/cancel`, payload, { allowEmpty: true })
  });
}

module.exports = { createKakaoQuickClient, KakaoQuickError };
