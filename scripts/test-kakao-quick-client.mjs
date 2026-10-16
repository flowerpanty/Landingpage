import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { inspect } from "node:util";
import { verifyKakaoQuickAuth } from "./verify-kakao-quick-auth.mjs";

const require = createRequire(import.meta.url);
const { createKakaoQuickClient, KakaoQuickError } = require("../lib/kakao-quick-client.js");
const env = {
  KAKAO_QUICK_VENDOR_ID: "MOCK_VENDOR",
  KAKAO_QUICK_API_KEY: "mock-only-key-not-a-real-credential",
  KAKAO_QUICK_BASE_URL: "https://open-api-logistics.kakaomobility.com"
};
const root = "/goa-sandbox-service/api/v2/orders";
const calls = [];
const consoleCalls = [];
let checks = 0;
const response = (body, status = 200, type = "application/json") => new Response(
  typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": type } }
);
const mockFetch = async (url, options) => {
  calls.push({ url, options });
  return response({ requestId: "mock-request", totalPrice: 12000 });
};
const clock = 1792051200000;
let nonce = 121212;
const client = createKakaoQuickClient({ env, fetchImpl: mockFetch, now: () => clock, nonce: () => nonce++ });

function assertPrivate(value) {
  const text = inspect(value, { depth: null }) + JSON.stringify(value);
  for (const secret of [env.KAKAO_QUICK_API_KEY, "PRIVATE_ADDRESS", "PRIVATE_PHONE", "PRIVATE_AUTHORIZATION"]) {
    assert.ok(!text.includes(secret), "errors/output must not expose credentials or customer data");
  }
  for (const { options } of calls) {
    assert.ok(!text.includes(options.headers.Authorization), "authorization must not appear in errors/output");
  }
}

async function expectError(run, code, status = null, kakaoCode = null) {
  let error;
  try { await run(); } catch (caught) { error = caught; }
  assert.ok(error instanceof KakaoQuickError, "failure must be a typed KakaoQuickError");
  assert.equal(error.code, code);
  assert.equal(error.httpStatus, status);
  assert.equal(error.kakaoCode, kakaoCode);
  assert.equal(error.cause, undefined);
  assert.deepEqual(Object.keys(error).sort(), ["name", "code", "httpStatus", "kakaoCode"].sort());
  assertPrivate(error);
  checks++;
}

const originalFetch = globalThis.fetch;
const originalConsole = Object.fromEntries(["log", "info", "warn", "error", "debug"].map(method => [method, console[method]]));
globalThis.fetch = () => { throw new Error("Live Kakao API calls are forbidden in this test"); };
for (const method of Object.keys(originalConsole)) console[method] = (...args) => consoleCalls.push(args);

try {
  const pricePayload = { orderType: "QUICK", productSize: "XS", pickup: { location: { basicAddress: "PRIVATE_ADDRESS" } } };
  const estimatePayload = { pickup: { basicAddress: "PRIVATE_ADDRESS" }, dropoff: {}, verticalTypes: ["QUICK"] };
  const orderPayload = { partnerOrderId: "NM-MOCK-001", pickup: { contact: { phone: "PRIVATE_PHONE" } } };
  const cancelPayload = { reason: "mock cancellation" };
  const cases = [
    [() => client.checkAuth(), "GET", "/v1/auth/check", undefined],
    [() => client.getPrice(pricePayload), "POST", `${root}/price`, pricePayload],
    [() => client.estimateDelivery(estimatePayload), "POST", `${root}/estimate`, estimatePayload],
    [() => client.createOrder(orderPayload), "POST", root, orderPayload],
    [() => client.getOrder("NM-MOCK-001"), "GET", `${root}/NM-MOCK-001`, undefined],
    [() => client.cancelOrder("NM-MOCK-001", cancelPayload), "PATCH", `${root}/NM-MOCK-001/cancel`, cancelPayload],
    [() => client.cancelOrder("NM-MOCK-001"), "PATCH", `${root}/NM-MOCK-001/cancel`, undefined]
  ];
  for (const [run, method, pathname, payload] of cases) {
    const result = await run();
    assert.equal(result.totalPrice, 12000);
    const { url, options } = calls.at(-1);
    assert.equal(url, env.KAKAO_QUICK_BASE_URL + pathname);
    assert.equal(options.method, method);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.vendor, env.KAKAO_QUICK_VENDOR_ID);
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.headers.Accept, "application/json");
    assert.equal(options.body, payload === undefined ? undefined : JSON.stringify(payload));
    const decoded = Buffer.from(options.headers.Authorization, "base64").toString("utf8");
    const [timestamp, nonceValue, sign] = decoded.split("$$");
    assert.equal(timestamp, String(clock));
    assert.equal(nonceValue, String(121211 + calls.length));
    assert.match(sign, /^[a-f0-9]{128}$/);
    assert.ok(sign === createHash("sha512").update(timestamp + nonceValue + env.KAKAO_QUICK_API_KEY).digest("hex"), "signature must match the official Java SHA-512 example");
    assert.ok(!options.headers.Authorization.startsWith("Bearer ") && !options.headers.Authorization.startsWith("Basic "));
    assert.ok(!url.includes(env.KAKAO_QUICK_API_KEY));
    assert.ok(!decoded.includes(env.KAKAO_QUICK_API_KEY));
    assert.equal(Object.keys(options.headers).length, 4);
    checks++;
  }
  assert.equal(new Set(calls.map(call => call.options.headers.Authorization)).size, cases.length, "each call generates fresh authorization");
  assertPrivate(client);

  for (const [key, value] of [
    ["KAKAO_QUICK_VENDOR_ID", ""], ["KAKAO_QUICK_API_KEY", ""], ["KAKAO_QUICK_BASE_URL", ""],
    ["KAKAO_QUICK_BASE_URL", "http://example.com"], ["KAKAO_QUICK_BASE_URL", "https://user:secret@example.com"],
    ["KAKAO_QUICK_BASE_URL", "https://example.com/invalid/nested/path"], ["KAKAO_QUICK_BASE_URL", "https://example.com/?secret=x"],
    ["KAKAO_QUICK_BASE_URL", "https://example.com/#fragment"], ["KAKAO_QUICK_VENDOR_ID", "invalid\r\nheader"]
  ]) {
    await expectError(async () => createKakaoQuickClient({ env: { ...env, [key]: value }, fetchImpl: mockFetch }), "CONFIGURATION_ERROR");
  }
  await expectError(async () => createKakaoQuickClient({ env, fetchImpl: mockFetch, timeoutMs: 0 }), "CONFIGURATION_ERROR");
  const beforeRejected = calls.length;
  for (const id of ["", ".", "..", "../escape", "a/b", "a\\b", "a?query=1", "%2e%2e", "a\n", "x".repeat(129), "\ud800"]) {
    await expectError(async () => client.getOrder(id), "INVALID_REQUEST");
    await expectError(async () => client.cancelOrder(id), "INVALID_REQUEST");
  }
  const cyclic = {}; cyclic.self = cyclic;
  for (const payload of [undefined, null, [], "PRIVATE_ADDRESS", cyclic]) {
    await expectError(() => client.createOrder(payload), "INVALID_REQUEST");
  }
  assert.equal(calls.length, beforeRejected, "invalid input must not invoke fetch");

  const clientReturning = (factory, options = {}) => createKakaoQuickClient({ env, fetchImpl: factory, ...options });
  for (const [body, type] of [["{broken", "application/json"], ["<html>PRIVATE_ADDRESS</html>", "text/html"],
    [null, "application/json"], [[], "application/json"], ["true", "application/json"], ["", "application/json"]]) {
    await expectError(() => clientReturning(async () => response(body, 200, type)).getPrice({}), "INVALID_RESPONSE", 200);
  }
  assert.equal(await clientReturning(async () => new Response(null, { status: 204 })).cancelOrder("NM-MOCK-001"), null);
  assert.equal(await clientReturning(async () => new Response(null, { status: 200 })).checkAuth(), null);
  assert.equal(await clientReturning(async () => response(true)).checkAuth(), true);
  checks += 3;
  await expectError(() => clientReturning(async () => response("{broken")).checkAuth(), "INVALID_RESPONSE", 200);

  for (const status of [400, 401, 404, 409, 429, 500, 503]) {
    let count = 0;
    const failureClient = clientReturning(async () => {
      count++;
      return response({ code: -20010, message: `${env.KAKAO_QUICK_API_KEY} PRIVATE_ADDRESS PRIVATE_PHONE PRIVATE_AUTHORIZATION`, data: orderPayload }, status);
    });
    await expectError(() => failureClient.createOrder(orderPayload), "HTTP_ERROR", status, -20010);
    assert.equal(count, 1, "failed create must never retry");
  }
  await expectError(() => clientReturning(async () => response({ code: "90002" }, 401)).checkAuth(), "HTTP_ERROR", 401, 90002);
  await expectError(() => clientReturning(async () => response({ code: env.KAKAO_QUICK_API_KEY }, 401)).checkAuth(), "HTTP_ERROR", 401);
  await expectError(() => clientReturning(async () => response("{broken", 502)).getPrice({}), "HTTP_ERROR", 502);
  await expectError(() => clientReturning(async () => response("PRIVATE_ADDRESS", 503, "text/html")).getPrice({}), "HTTP_ERROR", 503);
  await expectError(() => clientReturning(async () => response({}, 302)).getPrice({}), "HTTP_ERROR", 302);

  await expectError(() => clientReturning(async () => { throw new Error(`${env.KAKAO_QUICK_API_KEY} PRIVATE_AUTHORIZATION PRIVATE_PHONE`); }).getPrice({}), "NETWORK_ERROR");
  let aborted = false;
  let timeoutCalls = 0;
  await expectError(() => clientReturning((_url, { signal }) => {
    timeoutCalls++;
    return new Promise((_, reject) => signal.addEventListener("abort", () => {
      aborted = true;
      reject(new Error("PRIVATE_AUTHORIZATION"));
    }, { once: true }));
  }, { timeoutMs: 15 }).createOrder(orderPayload), "TIMEOUT");
  assert.equal(aborted, true);
  assert.equal(timeoutCalls, 1);
  await expectError(() => clientReturning(() => new Promise(() => {}), { timeoutMs: 15 }).getPrice({}), "TIMEOUT");
  await expectError(() => clientReturning(async () => ({ text: () => new Promise(() => {}) }), { timeoutMs: 15 }).getPrice({}), "TIMEOUT");

  const messages = [];
  let authCalls = 0;
  const authMock = async (url, options) => {
    authCalls++;
    assert.equal(url, env.KAKAO_QUICK_BASE_URL + "/v1/auth/check");
    assert.equal(options.method, "GET");
    return new Response(null, { status: 200 });
  };
  for (const missing of [Object.keys(env), ...Object.keys(env).map(key => [key])]) {
    assert.equal(await verifyKakaoQuickAuth({ env: { ...env, ...Object.fromEntries(missing.map(key => [key, ""])) }, fetchImpl: authMock, write: message => messages.push(message) }), 0);
    assert.equal(messages.at(-1), "Kakao Quick auth: NOT CONFIGURED");
    checks++;
  }
  assert.equal(authCalls, 0);
  assert.equal(await verifyKakaoQuickAuth({ env, fetchImpl: authMock, write: message => messages.push(message) }), 0);
  assert.equal(messages.at(-1), "Kakao Quick auth: PASS");
  assert.equal(authCalls, 1);
  assert.equal(await verifyKakaoQuickAuth({ env, fetchImpl: async () => response({ code: 90002, message: env.KAKAO_QUICK_API_KEY }, 401), write: message => messages.push(message) }), 1);
  assert.equal(messages.at(-1), "Kakao Quick auth: FAIL HTTP status=401 Kakao error code=90002");
  assert.equal(await verifyKakaoQuickAuth({ env, fetchImpl: async () => { throw new Error(env.KAKAO_QUICK_API_KEY); }, write: message => messages.push(message) }), 1);
  assert.equal(messages.at(-1), "Kakao Quick auth: FAIL HTTP status=N/A Kakao error code=N/A");
  checks += 3;
  assertPrivate(messages);
  assert.deepEqual(consoleCalls, [], "client must not log any request, authorization or customer data");
  const example = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  for (const key of ["KAKAO_QUICK_VENDOR_ID", "KAKAO_QUICK_API_KEY"]) assert.match(example, new RegExp(`^${key}=$`, "m"));
  assert.match(example, /^KAKAO_QUICK_BASE_URL=https:\/\/open-api-logistics.kakaomobility.com\/goa-sandbox-service$/m);
  const prefixedCalls = [];
  const prefixed = createKakaoQuickClient({env:{...env,KAKAO_QUICK_BASE_URL:env.KAKAO_QUICK_BASE_URL+'/goa-sandbox-service/'},fetchImpl:async (url)=>{prefixedCalls.push(url); return response({});}});
  await prefixed.getEstimate({}); await prefixed.checkAuth();
  assert.deepEqual(prefixedCalls, [env.KAKAO_QUICK_BASE_URL+root+'/estimate',env.KAKAO_QUICK_BASE_URL+'/v1/auth/check']);
  checks += 2;
} finally {
  globalThis.fetch = originalFetch;
  for (const [method, original] of Object.entries(originalConsole)) console[method] = original;
}

console.log(`kakao quick client: ${checks} mock-only checks, official SHA-512/Base64 and vendor headers, six API methods, safe errors, JSON/empty-body handling, timeout/abort, no retries or credential/customer logs PASS`);
