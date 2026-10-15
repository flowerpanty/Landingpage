"use strict";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_ID_LENGTH = 128;
const KNOWN_EVENTS = new Set([
  "matched", "canceled", "pickup_started", "pickup_completed",
  "dropoff_started", "dropoff_completed", "completed", "matching_failed",
  "aborted", "retry_matching", "repaid", "payment_canceled",
  "claim_requested", "claim_canceled"
]);

function reply(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow"
  });
  res.end(JSON.stringify(payload));
}

function decodeId(segment) {
  try {
    const value = decodeURIComponent(segment);
    if (!value || value.length > MAX_ID_LENGTH || value.includes("..") || value === "." ||
        /[\s\p{C}/\\%?#]/u.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    const onError = () => {
      cleanup();
      reject({ status: 400, code: "invalid_body" });
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        cleanup();
        // Drain without destroying the socket before the 413 response is sent.
        req.once("error", () => {});
        req.resume();
        reject({ status: 413, code: "payload_too_large" });
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
  });
}

function createKakaoQuickCallbackHandler() {
  return async function handleKakaoQuickCallback(req, res) {
    // Inspect the raw path: URL normalization can otherwise erase dot segments.
    const pathname = (req.url || "").split("?")[0];
    const match = /^\/callbacks\/orders\/([^/]+)(?:\/steps\/([^/]+))?$/.exec(pathname);
    const partnerOrderId = match ? decodeId(match[1]) : null;
    const stepId = match?.[2] === undefined ? undefined : decodeId(match[2]);
    if (!partnerOrderId || stepId === null) {
      req.resume();
      reply(res, 404, { error: "not_found" });
      return;
    }
    if (req.method !== "POST") {
      req.resume();
      res.setHeader("Allow", "POST");
      reply(res, 405, { error: "method_not_allowed" });
      return;
    }
    if (!/^application\/json\s*(?:;|$)/i.test(req.headers["content-type"] || "")) {
      req.resume();
      reply(res, 415, { error: "unsupported_media_type" });
      return;
    }
    if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) {
      req.resume();
      reply(res, 413, { error: "payload_too_large" });
      return;
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      if (!res.destroyed && !res.writableEnded) {
        reply(res, error.status === 413 ? 413 : 400, {
          error: error.status === 413 ? "payload_too_large" : "invalid_json"
        });
      }
      return;
    }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        typeof body.event !== "string" || !body.event.trim() ||
        typeof body.statusUpdatedAt !== "string" || !body.statusUpdatedAt.trim() ||
        !Number.isFinite(Date.parse(body.statusUpdatedAt))) {
      reply(res, 400, { error: "invalid_callback" });
      return;
    }

    // Phase 1 only acknowledges receipt. Do not persist or forward to the order API.
    // JSON escaping keeps control characters in future event names on one log line.
    console.info("kakao_quick_callback", JSON.stringify({
      partnerOrderId,
      ...(stepId === undefined ? {} : { stepId }),
      event: body.event,
      statusUpdatedAt: body.statusUpdatedAt,
      knownEvent: KNOWN_EVENTS.has(body.event)
    }));
    reply(res, 200, { ok: true });
  };
}

module.exports = { createKakaoQuickCallbackHandler };
