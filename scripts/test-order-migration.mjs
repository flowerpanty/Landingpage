import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createOrderApiHandler, getOrderApiOrigin } = require("../lib/order-api.js");
const registry = JSON.parse(fs.readFileSync("data/site-pages.json", "utf8"));
assert.throws(() => getOrderApiOrigin({ ORDER_API_ORIGIN: "http://example.com" }));
assert.throws(() => getOrderApiOrigin({ ORDER_API_ORIGIN: "https://example.com/api" }));
assert.throws(() => getOrderApiOrigin({ ORDER_API_ORIGIN: "https://user:secret@example.com" }));

const calls = [];
const upstream = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  calls.push({ method: req.method, path: req.url, headers: req.headers, body });
  const payload = JSON.parse(body);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Set-Cookie", "nm.sid=upstream-admin-session; HttpOnly");
  if (payload.source === "error") {
    res.writeHead(400);
    res.end(JSON.stringify({ success: false, message: "주문할 상품을 선택해주세요." }));
  } else if (payload.source === "disconnect") {
    req.socket.destroy();
  } else {
    res.end(JSON.stringify({ success: true, orderId: "local-mock-order", totalPrice: 32000 }));
  }
});
await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${upstream.address().port}`;
const probe = http.createServer();
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const output = [];
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", PORT: String(port), WORDPRESS_JOURNAL_OFFLINE: "1", ORDER_API_ORIGIN: origin },
  stdio: ["ignore", "pipe", "pipe"]
});
server.stdout.on("data", chunk => output.push(chunk.toString()));
server.stderr.on("data", chunk => output.push(chunk.toString()));
const base = `http://127.0.0.1:${port}`;

async function post(body, headers = {}) {
  return fetch(`${base}/api/landing-orders`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/`)).ok) { ready = true; break; } } catch { /* starting */ }
    await wait(50);
  }
  assert.ok(ready, output.join(""));
  const hub = await fetch(`${base}/order`, { redirect: "manual" });
  assert.equal(hub.status, 200);
  assert.equal(hub.headers.get("location"), null);
  const html = await hub.text();
  assert.match(html, /canonical" href="https:\/\/nothingmatters\.co\.kr\/order"/);
  assert.match(html, /name="robots" content="index,follow/);
  assert.doesNotMatch(html, /<iframe|http-equiv="refresh"|thingmattersreserve/i);
  assert.equal((html.match(/class="product-card /g) || []).length, 7);

  for (const product of registry.orderProducts) {
    const pathname = `/order/${product.slug}`;
    assert.match(html, new RegExp(`href="${pathname}"`));
    const response = await fetch(`${base}${pathname}`, { redirect: "manual" });
    assert.equal(response.status, 200, pathname);
    const page = await response.text();
    assert.ok(page.includes(`href="https://nothingmatters.co.kr${product.detailUrl}"`), `${pathname} canonical should point to its existing product detail`);
    for (const match of page.matchAll(/(?:src|href)=["'](\/order\/assets\/[^"']+)["']/g)) {
      if (match[1].includes("${")) continue;
      assert.equal((await fetch(`${base}${match[1]}`)).status, 200, `${pathname}: missing ${match[1]}`);
    }
  }
  for (const alias of ["/order/", "/order.html", "/order/index.html"]) {
    const response = await fetch(`${base}${alias}`, { redirect: "manual" });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://nothingmatters.co.kr/order");
  }
  for (const match of html.matchAll(/src=["'](\/order\/assets\/[^"']+)["']/g)) {
    assert.equal((await fetch(`${base}${match[1]}`)).status, 200);
  }
  assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /<loc>https:\/\/nothingmatters\.co\.kr\/order<\/loc>/);
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.doesNotMatch(robots, /Disallow:\s*\/order/);
  assert.match(robots, /Disallow:\s*\/api\//);
  for (const pathname of ["/", "/brookie/", "/cookie-crew/", "/products/cookie-flight/", "/products/terminal-sand-cookie/"]) {
    assert.equal((await fetch(`${base}${pathname}`)).status, 200, `${pathname}: existing page regression`);
  }

  const payload = { source: "cookieFlight", quantity: 2, customerName: "LOCAL MOCK ONLY", customerPhone: "010-0000-0000", deliveryDate: "2026-10-10", pickupTime: "10:00~11:00", deliveryMethod: "pickup" };
  let response = await post(payload, { Origin: "https://nothingmatters.co.kr", Cookie: "nm.sid=private", Authorization: "Bearer private" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).orderId, "local-mock-order");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/landing-orders");
  assert.deepEqual(JSON.parse(calls[0].body), payload);
  assert.equal(calls[0].headers.cookie, undefined);
  assert.equal(calls[0].headers.authorization, undefined);

  response = await post({ source: "error" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, "주문할 상품을 선택해주세요.");
  const previousCalls = calls.length;
  assert.equal((await post("{broken")).status, 400);
  assert.equal((await post(payload, { Origin: "https://unrelated.example" })).status, 403);
  assert.equal((await post(payload, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await post(payload, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await post({ data: "x".repeat(512 * 1024) })).status, 413);
  assert.equal((await fetch(`${base}/api/landing-orders`)).status, 405);
  assert.equal(calls.length, previousCalls, "rejected requests must never reach the upstream");
  response = await post({ source: "disconnect" });
  assert.equal(response.status, 502);
  assert.match((await response.json()).message, /접수 여부/);
  assert.equal(calls.length, previousCalls + 1, "failed submissions must never be retried automatically");
  assert.equal((await fetch(`${base}/api/admin/me`)).status, 404, "admin endpoints must not be proxied");

  // Exercise an invalid upstream response without calling the real backend.
  const handler = createOrderApiHandler({ fetchImpl: async () => new Response("<html>redirect</html>", { headers: { "Content-Type": "text/html" } }) });
  const fakeReq = (await import("node:stream")).Readable.from([Buffer.from("{}")]);
  Object.assign(fakeReq, { method: "POST", headers: { "content-type": "application/json" } });
  const fakeRes = new (await import("node:events")).EventEmitter();
  Object.assign(fakeRes, { setHeader() {}, writeHead(status) { this.status = status; }, end(body) { this.body = body; this.writableEnded = true; } });
  await handler(fakeReq, fakeRes);
  assert.equal(fakeRes.status, 502);
  console.log("order migration: 8 routes, original assets, SEO, same-origin API, privacy boundaries, validation/errors and no automatic retry PASS (local mock only)");
} finally {
  server.kill("SIGTERM");
  if (server.exitCode === null) await Promise.race([once(server, "exit"), wait(2000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
  await new Promise(resolve => upstream.close(resolve));
}
