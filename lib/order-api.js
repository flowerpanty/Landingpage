"use strict";

const DEFAULT_ORDER_API_ORIGIN = "https://thingmattersreserve-production.up.railway.app";
const MAX_BODY_BYTES = 512 * 1024;
const { christmasOrderStatus, validateChristmasOrder } = require('./christmas-order.js');

function getOrderApiOrigin(env = process.env) {
  const url = new URL(env.ORDER_API_ORIGIN || DEFAULT_ORDER_API_ORIGIN);
  const localTest = env.NODE_ENV === "test" && url.protocol === "http:" && url.hostname === "127.0.0.1";
  if ((!localTest && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("ORDER_API_ORIGIN must be an HTTPS origin without a path or credentials");
  }
  return url.origin;
}

function reply(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow"
  });
  res.end(JSON.stringify(payload));
}

function isAllowedOrigin(req, env) {
  const origin = req.headers.origin;
  if (!origin) return req.headers["sec-fetch-site"] !== "cross-site";
  if (origin === "https://nothingmatters.co.kr") return true;
  if (env.NODE_ENV === "production") return false;
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function createOrderApiHandler({ env = process.env, fetchImpl = global.fetch } = {}) {
  const upstreamOrigin = getOrderApiOrigin(env);
  return async function handleOrderApi(req, res) {
    const pathname = new URL(req.url || '/api/landing-orders', 'http://adapter').pathname;
    if (pathname === '/api/christmas-order-status' && req.method === 'GET') {
      reply(res, 200, christmasOrderStatus());
      return;
    }
    const emailQuote = /^\/api\/orders\/[A-Za-z0-9_-]+\/email-quote$/.test(pathname);
    if (pathname !== '/api/landing-orders' && !emailQuote) {
      reply(res, 404, { success: false, message: '지원하지 않는 요청입니다.' });
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      reply(res, 405, { success: false, message: "POST 요청만 사용할 수 있습니다." });
      return;
    }
    if (!isAllowedOrigin(req, env)) {
      reply(res, 403, { success: false, message: "주문 페이지에서 다시 시도해 주세요." });
      return;
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) {
      reply(res, 415, { success: false, message: "JSON 요청만 사용할 수 있습니다." });
      return;
    }
    if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) {
      reply(res, 413, { success: false, message: "주문 내용이 너무 큽니다." });
      return;
    }

    const authorization = req.headers.authorization;
    if (emailQuote && !/^Bearer [a-f0-9]{64}$/.test(authorization || '')) {
      reply(res, 403, { success: false, message: '이 주문의 이메일 견적 요청을 확인할 수 없습니다.' });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", onClose);
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reply(res, 413, { success: false, message: "주문 내용이 너무 큽니다." });
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString("utf8");
      let parsed;
      try {
        parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
      } catch {
        reply(res, 400, { success: false, message: "주문 요청 형식을 확인해 주세요." });
        return;
      }
      if (!emailQuote && parsed.source === 'christmas') {
        try { validateChristmasOrder(parsed); }
        catch (error) { reply(res, 400, { success: false, message: error.message }); return; }
        // No forwarding until Railway can persist all four independent SKUs.
        reply(res, 503, { success: false, code: 'CHRISTMAS_ORDERS_UNAVAILABLE', ...christmasOrderStatus() });
        return;
      }
      // Only public order creation and saved-recipient email quotes are forwarded.
      // The creation-only email capability is forwarded only to email-quote;
      // admin sessions/cookies never cross this boundary. Never retry requests.
      const response = await fetchImpl(`${upstreamOrigin}${pathname}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(emailQuote ? { Authorization: authorization } : {}) },
        body,
        redirect: "error",
        signal: controller.signal
      });
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) {
        throw new Error("invalid_upstream_response");
      }
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid_upstream_response");
      reply(res, response.status, payload);
    } catch {
      if (!res.destroyed && !res.writableEnded) {
        reply(res, controller.signal.aborted ? 504 : 502, {
          success: false,
          message: "주문 저장 결과를 확인하지 못했어요. 카카오톡으로 접수 여부를 확인해 주세요."
        });
      }
    } finally {
      clearTimeout(timeout);
      res.off("close", onClose);
    }
  };
}

module.exports = { createOrderApiHandler, getOrderApiOrigin };
