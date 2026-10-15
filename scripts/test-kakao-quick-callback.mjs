import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = [];
let upstreamCalls = 0;
const upstream = http.createServer((req, res) => {
  upstreamCalls++;
  req.resume();
  res.writeHead(500);
  res.end();
});
await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
const probe = http.createServer();
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const server = spawn(process.execPath, ["server.js"], {
  cwd: ROOT,
  env: {
    ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", PORT: String(port),
    WORDPRESS_JOURNAL_OFFLINE: "1", KAC_FLIGHT_API_KEY: "",
    ORDER_API_ORIGIN: `http://127.0.0.1:${upstream.address().port}`
  },
  stdio: ["ignore", "pipe", "pipe"]
});
server.stdout.on("data", chunk => output.push(chunk.toString()));
server.stderr.on("data", chunk => output.push(chunk.toString()));
const startupError = new Promise((_, reject) => server.once("error", reject));
// Attach a rejection handler immediately, including if startup fails before polling.
startupError.catch(() => {});
const orderPath = "/callbacks/orders/NM-TEST-001";
const valid = { event: "pickup_completed", statusUpdatedAt: "2026-10-15T20:30:00+09:00" };
let assertions = 0;

function request(pathname, { method = "POST", body = valid, headers = {}, chunked = false } = {}) {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    // Pass a raw path so malformed encodings and dot segments reach server.js.
    const req = http.request({
      hostname: "127.0.0.1", port, path: pathname, method,
      headers: {
        "Content-Type": "application/json",
        ...(chunked ? { "Transfer-Encoding": "chunked" } : { "Content-Length": Buffer.byteLength(data) }),
        ...headers
      }
    }, res => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { responseBody += chunk; });
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: responseBody }));
    });
    req.setTimeout(5000, () => req.destroy(new Error("callback test request timed out")));
    req.on("error", reject);
    if (chunked) {
      const bytes = Buffer.from(data);
      for (let offset = 0; offset < bytes.length; offset += 8192) req.write(bytes.subarray(offset, offset + 8192));
      req.end();
    } else {
      req.end(data);
    }
  });
}

async function expectStatus(status, options = {}, pathname = orderPath) {
  const response = await request(pathname, options);
  assert.equal(response.status, status, `${options.method || "POST"} ${pathname}`);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-robots-tag"], "noindex, nofollow");
  assert.match(response.headers["content-type"], /^application\/json(?:;|$)/);
  if (status === 200) assert.deepEqual(JSON.parse(response.body), { ok: true });
  if (status === 405) assert.equal(response.headers.allow, "POST");
  assertions++;
  return response;
}

try {
  await Promise.race([
    startupError,
    (async () => {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (server.exitCode !== null) throw new Error("callback test server exited during startup");
        try {
          if ((await request(orderPath, { method: "GET", body: "" })).status === 405) return;
        } catch { /* local server is still starting */ }
        await wait(50);
      }
      throw new Error("callback test server did not start");
    })()
  ]);

  await expectStatus(200); // 1: pickup_completed
  await expectStatus(200, { body: { ...valid, event: "completed" } }); // 2
  await expectStatus(200, { body: { ...valid, event: "future_event_2027" } }); // 3
  await expectStatus(400, { body: { statusUpdatedAt: valid.statusUpdatedAt } }); // 4
  await expectStatus(400, { body: { ...valid, statusUpdatedAt: "not-a-date" } }); // 5
  await expectStatus(400, { body: "{broken" }); // 6
  await expectStatus(415, { headers: { "Content-Type": "text/plain" } }); // 7
  await expectStatus(405, { method: "GET", body: "" }); // 8
  const oversized = JSON.stringify({ ...valid, extra: "x".repeat(64 * 1024) });
  await expectStatus(413, { body: oversized }); // 9
  await expectStatus(200, {}, `${orderPath}/steps/STEP-01`); // 10

  // Enforce the byte limit even without Content-Length, including UTF-8 content.
  await expectStatus(413, { body: oversized, chunked: true });
  await expectStatus(413, { body: { ...valid, extra: "가".repeat(23000) }, chunked: true });
  const envelope = JSON.stringify({ ...valid, extra: "" });
  const boundary = JSON.stringify({ ...valid, extra: "x".repeat(64 * 1024 - Buffer.byteLength(envelope)) });
  await expectStatus(200, { body: boundary, chunked: true });
  await expectStatus(413, { body: boundary.slice(0, -2) + 'x"}', chunked: true });

  for (const body of [null, [], "1", '"text"', {}, { ...valid, event: " \n" },
    { ...valid, event: 1 }, { event: "completed" }, { ...valid, statusUpdatedAt: 123 },
    { ...valid, statusUpdatedAt: " " }]) await expectStatus(400, { body });
  await expectStatus(415, { headers: { "Content-Type": "application/jsonp" } });
  await expectStatus(415, { headers: { "Content-Type": "" } });
  for (const method of ["HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    await expectStatus(405, { method, body: "" });
  }
  for (const pathname of ["/callbacks", "/callbacks/orders", "/callbacks/orders/",
    `${orderPath}/extra`, `${orderPath}/steps/`, `${orderPath}/steps/STEP-01/extra`,
    "/callbacks/orders/%ZZ", "/callbacks/orders/%E0%A4%A", "/callbacks/orders/%2e%2e",
    "/callbacks/orders/../escape", "/callbacks/orders/%2Fetc", "/callbacks/orders/%5C..%5C",
    "/callbacks/orders/%252e%252e", "/callbacks/orders/%00", "/callbacks/orders/%20",
    `/callbacks/orders/${"a".repeat(129)}`, `${orderPath}/steps/%ZZ`,
    `${orderPath}/steps/%2e%2e`, `${orderPath}/steps/${"s".repeat(129)}`]) {
    await expectStatus(404, {}, pathname);
  }
  await expectStatus(200, {}, `/callbacks/orders/${"a".repeat(128)}/steps/${"s".repeat(128)}`);
  await expectStatus(200, {
    body: { ...valid, picker: { name: "PRIVATE_DRIVER_MARKER", phone: "PRIVATE_PHONE_MARKER" },
      address: "PRIVATE_ADDRESS_MARKER", futureField: { accepted: true } },
    headers: { "Content-Type": "application/json; charset=utf-8", Origin: "https://unrelated.example", "Sec-Fetch-Site": "cross-site" }
  }, "/callbacks/orders/NM%2DENCODED%2D001");
  await expectStatus(200, { body: { ...valid, event: "future_event\nLOG_MARKER" } });

  // Flush captured pipe output before checking the allowlisted, one-line logs.
  await wait(50);
  const logs = output.join("");
  for (const marker of ["PRIVATE_DRIVER_MARKER", "PRIVATE_PHONE_MARKER", "PRIVATE_ADDRESS_MARKER", "futureField"]) {
    assert.ok(!logs.includes(marker), "callback payload fields must not appear in logs");
  }
  const entries = logs.split("\n").filter(line => line.startsWith("kakao_quick_callback "))
    .map(line => JSON.parse(line.slice("kakao_quick_callback ".length)));
  assert.equal(entries.length, 8, "only valid callbacks are logged");
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ["partnerOrderId", "event", "statusUpdatedAt", "knownEvent", ...(entry.stepId === undefined ? [] : ["stepId"])].sort());
    assert.equal(entry.statusUpdatedAt, valid.statusUpdatedAt);
  }
  assert.equal(entries.find(entry => entry.event === "pickup_completed").knownEvent, true);
  assert.equal(entries.find(entry => entry.event === "completed").knownEvent, true);
  assert.equal(entries.find(entry => entry.event === "future_event_2027").knownEvent, false);
  assert.ok(entries.some(entry => entry.stepId === "STEP-01"));
  assert.ok(entries.some(entry => entry.partnerOrderId === "NM-ENCODED-001"));
  assert.ok(entries.some(entry => entry.event === "future_event\nLOG_MARKER" && !entry.knownEvent));
  assert.equal(upstreamCalls, 0, "callbacks must never be forwarded to the order backend");
  console.log(`kakao quick callback: ${assertions} HTTP cases, order/step, future events, 64KB boundary/chunked UTF-8, raw path validation, minimal logs, no origin/session requirement or upstream forwarding PASS`);
} finally {
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await Promise.race([exited, wait(2000)]);
    if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
  }
  await new Promise(resolve => upstream.close(resolve));
}
