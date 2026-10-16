import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fakeKey = "MOCK_ONLY_QUICK_SECRET";
const vendor = "MOCK_VENDOR";
const authorization = `Basic ${Buffer.from("mock-admin:mock-password").toString("base64")}`;
const upstreamCalls = [];
const orders = new Map();
const processes = [];
const output = [];
let checks = 0;
let cdp;
let browser;
let profile;
const rootPath = "/goa-sandbox-service/api/v2/orders";
const baseInput = { partnerOrderId: "NM-ADMIN-001", basicAddress: "MOCK_DESTINATION_ADDRESS", detailAddress: "모의 상세주소", recipientName: "모의 수령인", recipientPhone: "010-1234-5678", note: "문 앞 전달", latitude: "37.5", longitude: "127.1", orderType: "QUICK", productSize: "S", fleet: "", pickupMode: "asap", wishTime: "", productName: "브루키 답례품", quantity: "12", unitPrice: "7800", productNote: "파손 주의", trayCount: "1", paymentType: "CARD" };
function json(res, status, value) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); }
const provider = http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  let body; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined; } catch { return json(res, 400, {}); }
  upstreamCalls.push({ method: req.method, url: req.url, body, headers: req.headers });
  if (!req.headers.authorization || req.headers.vendor !== vendor) return json(res, 401, { code: 90002 });
  if (req.url === "/v1/auth/check") return json(res, 200, {});
  if (req.url === `${rootPath}/price`) {
    if (body.dropoff.location.basicAddress === "MOCK_FAILURE") return json(res, 503, { code: -50003, message: fakeKey, vendor, Authorization: "PRIVATE_AUTH", phone: "PRIVATE_PHONE" });
    return json(res, 200, { totalPrice: 18500, minimum: 15000, maximum: 18500, apiKey: fakeKey, vendor });
  }
  if (req.url === `${rootPath}/estimate`) return json(res, 200, { lists: ["QUICK", "QUICK_ECONOMY", "QUICK_EXPRESS"].flatMap(orderType => ["PASSENGER_CAR", "DAMAS", "LABO", "TON"].map(fleet => ({ orderType, fleet, estimatedTime: 1800, totalFareAmount: 18500 }))), apiKey: fakeKey });
  if (req.url === rootPath && req.method === "POST") {
    if (orders.has(body.partnerOrderId)) return json(res, 409, { code: -20001 });
    await wait(70); // keep concurrent submit tests in flight
    const value = { receipt: { orderId: "qo_mock_001", status: "MATCHING", priceInfo: { totalPrice: 18500 } }, pickup: body.pickup, apiKey: fakeKey, vendor };
    orders.set(body.partnerOrderId, value);
    return json(res, 201, value);
  }
  if (req.url.startsWith(`${rootPath}/`) && req.method === "GET") {
    const id = decodeURIComponent(req.url.slice(rootPath.length + 1));
    if (id === "UNKNOWN-404") return json(res, 404, { code: 90006, message: fakeKey });
    if (!orders.has(id)) return json(res, 404, { code: -20010 });
    const value = structuredClone(orders.get(id));
    if (value.receipt.status === "MATCHING") value.receipt.status = "MATCHED";
    return json(res, 200, value);
  }
  json(res, 404, { code: -20010 });
});
await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));

async function port() {
  const probe = http.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const value = probe.address().port; await new Promise(resolve => probe.close(resolve)); return value;
}
async function startServer(extra = {}) {
  const value = await port();
  const proc = spawn(process.execPath, ["server.js"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: {
    ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", PORT: String(value), WORDPRESS_JOURNAL_OFFLINE: "1", KAC_FLIGHT_API_KEY: "",
    DASHBOARD_USERNAME: "mock-admin", DASHBOARD_PASSWORD: "mock-password", KAKAO_QUICK_VENDOR_ID: vendor, KAKAO_QUICK_API_KEY: fakeKey,
    KAKAO_QUICK_BASE_URL: `http://127.0.0.1:${provider.address().port}/goa-sandbox-service`,
    KAKAO_QUICK_PICKUP_ADDRESS: "MOCK_FIXED_PICKUP_ADDRESS", KAKAO_QUICK_PICKUP_DETAIL: "1층",
    KAKAO_QUICK_PICKUP_LATITUDE: "37.55", KAKAO_QUICK_PICKUP_LONGITUDE: "126.81", KAKAO_QUICK_PICKUP_NAME: "NOTHINGMATTERS", KAKAO_QUICK_PICKUP_PHONE: "02-123-4567", ...extra
  }});
  processes.push(proc); proc.stdout.on("data", chunk => output.push(String(chunk))); proc.stderr.on("data", chunk => output.push(String(chunk)));
  const base = `http://127.0.0.1:${value}`;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${base}/dashboard/quick/`)).status === 200) return base; } catch { /* starting */ }
    if (proc.exitCode !== null) throw new Error("Quick admin test server exited");
    await wait(50);
  }
  throw new Error("Quick admin test server did not start");
}
function privateCheck(value) {
  for (const secret of [fakeKey, vendor, "PRIVATE_AUTH", "PRIVATE_PHONE"]) assert.ok(!value.includes(secret), "credentials must never appear in browser/API output");
}
let base;
async function api(action, body, status = 200, headers = {}, method = body === undefined ? "GET" : "POST") {
  const res = await fetch(`${base}/api/kakao-quick/${action}`, { method, headers: { Authorization: authorization, "Content-Type": "application/json", "X-Quick-Admin": "1", ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
  const raw = await res.text();
  assert.equal(res.status, status, `${method} ${action}`); privateCheck(raw);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow"); checks++;
  return { data: raw ? JSON.parse(raw) : null, res };
}
async function quote(input = baseInput) {
  const [price, estimate] = await Promise.all([api("price", input), api("estimate", input)]);
  assert.equal(price.data.quoteToken, estimate.data.quoteToken);
  assert.equal(price.data.price.totalPrice, 18500); assert.equal(estimate.data.estimate.estimatedTime, 1800);
  return { ...input, confirmed: true, quoteToken: price.data.quoteToken };
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.events = [];
    this.ready = new Promise((resolve, reject) => { this.ws.addEventListener("open", resolve, { once: true }); this.ws.addEventListener("error", reject, { once: true }); });
    this.ws.addEventListener("message", ({ data }) => {
      const result = JSON.parse(data);
      if (!result.id) { this.events.push(result); return; }
      const item = this.pending.get(result.id); this.pending.delete(result.id);
      if (result.error) item.reject(new Error(result.error.message)); else item.resolve(result.result);
    });
  }
  async command(method, params = {}) { await this.ready; const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(code) {
    const result = await this.command("Runtime.evaluate", { expression: `Promise.resolve((async () => { ${code} })()).then(JSON.stringify)`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error("Quick admin browser evaluation failed");
    return JSON.parse(result.result.value);
  }
  async until(code, label) { for (let i = 0; i < 100; i++) { if (await this.evaluate(`return ${code};`)) return; await wait(50); } throw new Error(`Quick admin browser: ${label}`); }
}

try {
  base = await startServer();
  const paths = ["/dashboard/quick/admin/", "/dash%62oard/quick/admin/", "/%64ashboard/quick/admin/index.html", "/dashboard%2Fquick%2Fadmin/", "/api/kakao-quick/admin-config", "/api/kakao-quick/orders", "/api/kakao-quick/orders/NM-TEST"];
  for (const pathname of paths) {
    const res = await fetch(base + pathname, { method: pathname.endsWith("price") || pathname.endsWith("estimate") || pathname.endsWith("orders") ? "POST" : "GET" });
    assert.equal(res.status, 401, pathname); assert.match(res.headers.get("www-authenticate"), /Basic realm="nothingmatters dashboard"/); checks++;
  }
  assert.equal(upstreamCalls.length, 0);
  for (const pathname of ["/dashboard/quick/", "/dashboard/quick/quick.js", "/dashboard/quick/quick.css", "/dash%62oard/quick/", "/dashboard%2Fquick%2Fquick.js"]) {
    const res = await fetch(base + pathname);
    assert.equal(res.status, 200); assert.equal(res.headers.get("www-authenticate"), null); privateCheck(await res.text()); checks++;
  }
  const publicConfig = (await api("config", undefined, 200, { Authorization: "" })).data;
  assert.equal(publicConfig.canCreate, false); assert.equal(publicConfig.pickup.phone, undefined);
  const publicInput = Object.fromEntries(["basicAddress", "detailAddress", "latitude", "longitude", "orderType", "productSize", "fleet", "pickupMode", "wishTime"].map(key => [key, baseInput[key]]));
  const publicPrice = await api("price", publicInput, 200, { Authorization: "" });
  assert.equal(publicPrice.data.quoteToken, undefined, "public quote must not grant an order capability");
  await api("estimate", publicInput, 200, { Authorization: "" });
  await api("orders", { ...baseInput, confirmed: true, quoteToken: publicPrice.data.quoteToken }, 401, { Authorization: "" });
  await api("orders/NM-ADMIN-001", undefined, 401, { Authorization: "" });
  await api("orders", { ...baseInput, confirmed: true, quoteToken: publicPrice.data.quoteToken }, 409);
  for (const pathname of ["/dashboard/quick/", "/dashboard/quick/quick.js", "/dashboard/quick/quick.css"]) {
    const res = await fetch(base + pathname, { headers: { Authorization: authorization } });
    assert.equal(res.status, 200); assert.equal(res.headers.get("cache-control"), "no-store"); privateCheck(await res.text()); checks++;
  }
  const config = (await api("config")).data;
  assert.equal(config.ready, true); assert.equal(config.sandbox, true); assert.equal(config.canCreate, true); assert.equal(config.pickup.address, "MOCK_FIXED_PICKUP_ADDRESS");
  await api("price", baseInput, 403, { "X-Quick-Admin": "" });
  await api("price", baseInput, 403, { Origin: "https://unrelated.example" });
  await api("price", baseInput, 403, { "Sec-Fetch-Site": "cross-site" });
  await api("price", "{broken", 400); await api("price", [], 400);
  await api("price", baseInput, 415, { "Content-Type": "text/plain" });
  await api("price", { ...baseInput, note: "x".repeat(65536) }, 413);
  await api("unknown", {}, 404); await api("price", undefined, 405);
  const prior = upstreamCalls.length;
  for (const change of [{ basicAddress: "" }, { recipientName: "" }, { recipientPhone: "bad" }, { latitude: "" }, { longitude: "" }, { latitude: 91 }, { longitude: -181 }, { productSize: "XXL" }, { orderType: "DOBO" }, { paymentType: "" }, { productSize: "L", fleet: "" }, { productSize: "L", fleet: "MOTORCYCLE" }, { fleet: "TON" }, { pickup: { location: { basicAddress: "ATTACKER_PICKUP" } } }, { quantity: 0 }, { unitPrice: -1 }]) await api("price", { ...baseInput, ...change }, 400);
  assert.equal(upstreamCalls.length, prior, "invalid requests cannot reach Kakao");
  const kst = minutes => new Date(Date.now() + minutes * 60000 + 9 * 3600000).toISOString().slice(0, 19) + "+09:00";
  for (const [orderType, minutes, status] of [["QUICK", 10, 400], ["QUICK", 30, 200], ["QUICK_EXPRESS", 30, 200], ["QUICK_ECONOMY", 30, 400], ["QUICK_ECONOMY", 70, 200], ["QUICK", 15 * 1440, 400]]) await api("price", { ...baseInput, orderType, pickupMode: "reserved", wishTime: kst(minutes) }, status);
  for (const orderType of ["QUICK", "QUICK_ECONOMY", "QUICK_EXPRESS"]) await api("estimate", { ...baseInput, orderType });
  for (const productSize of ["XS", "S", "M"]) await api("price", { ...baseInput, productSize });
  for (const fleet of ["DAMAS", "LABO", "TON"]) await api("price", { ...baseInput, productSize: "L", fleet });
  await api("orders", { ...baseInput, confirmed: true }, 409);
  const ready = await quote();
  await api("orders", { ...ready, basicAddress: "CHANGED_AFTER_QUOTE" }, 409);
  await api("orders", { ...ready, confirmed: false }, 409);
  const results = await Promise.all([api("orders", ready, 201), api("orders", ready, 409)]);
  assert.equal(results[0].data.order.status, "MATCHING"); assert.equal(results[0].data.order.kakaoOrderId, "qo_mock_001");
  assert.equal(upstreamCalls.filter(call => call.url === rootPath && call.method === "POST").length, 1);
  const created = upstreamCalls.find(call => call.url === rootPath && call.method === "POST").body;
  assert.equal(created.pickup.location.basicAddress, "MOCK_FIXED_PICKUP_ADDRESS"); assert.equal(created.pickup.location.latitude, 37.55);
  assert.equal(created.dropoff.contact.phone, "01012345678"); assert.equal(created.pickup.contact.phone, "021234567");
  assert.equal(created.productInfo.totalPrice, 93600); assert.equal(created.productInfo.size, "S"); assert.equal(created.productInfo.products[0].quantity, "12");
  assert.equal(created.paymentInfo.paymentType, "CARD");
  assert.equal((await api("orders/NM-ADMIN-001")).data.order.status, "MATCHED");
  const duplicate = await api("orders", await quote(), 409); assert.equal(duplicate.data.message, "이미 등록된 퀵 주문입니다.");
  const noCreate = upstreamCalls.filter(call => call.url === rootPath && call.method === "POST").length;
  await api("orders", await quote({ ...baseInput, partnerOrderId: "UNKNOWN-404" }), 502);
  assert.equal(upstreamCalls.filter(call => call.url === rootPath && call.method === "POST").length, noCreate, "unrecognized 404 must not permit create");
  await api("price", { ...baseInput, basicAddress: "MOCK_FAILURE" }, 502);
  const noteQuote = await quote({ ...baseInput, partnerOrderId: "MULTILINE-NOTES", note: "첫째 줄\n둘째 줄", productNote: "파손 주의\n냉장 보관" });
  assert.ok(noteQuote.quoteToken);
  const callback = await fetch(base + "/callbacks/orders/NM-QUICK-TEST", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "completed", statusUpdatedAt: "2026-10-16T10:00:00+09:00" }) });
  assert.equal(callback.status, 200); assert.deepEqual(await callback.json(), { ok: true }); checks++;
  const unconfigured = await startServer({ DASHBOARD_USERNAME: "", DASHBOARD_PASSWORD: "" });
  assert.equal((await fetch(unconfigured + "/dashboard/quick/")).status, 200);
  assert.equal((await fetch(unconfigured + "/api/kakao-quick/config")).status, 200);
  assert.equal((await fetch(unconfigured + "/dashboard/quick/admin/")).status, 401);
  assert.equal((await fetch(unconfigured + "/api/kakao-quick/orders", {method:"POST"})).status, 401); checks += 4;
  const missingPickup = await startServer({ KAKAO_QUICK_PICKUP_LATITUDE: "", KAKAO_QUICK_PICKUP_PHONE: "" });
  const missingConfig = await fetch(missingPickup + "/api/kakao-quick/config", {headers:{Authorization:authorization}});
  assert.equal((await missingConfig.json()).ready, false); checks++;

  const debugPort = await port(); profile = fs.mkdtempSync(path.join(os.tmpdir(), "nm-quick-admin-"));
  browser = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-allow-origins=*", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  processes.push(browser);
  let target;
  for (let i = 0; i < 80; i++) { try { target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json(); break; } catch { await wait(75); } }
  assert.ok(target, "headless Chrome must start"); cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.command("Page.enable"); await cdp.command("Runtime.enable"); await cdp.command("Network.enable");
  await cdp.command("Network.setExtraHTTPHeaders", { headers: { Authorization: authorization } });
  await cdp.command("Network.setBlockedURLs", { urls: ["*kakaomobility.com*", "*google-analytics.com*"] });
  const screenshots = path.join(ROOT, "output/playwright/quick-admin"); fs.mkdirSync(screenshots, { recursive: true });
  const beforeBrowser = upstreamCalls.filter(call => call.url === rootPath && call.method === "POST").length;
  for (const width of [390, 1280]) {
    await cdp.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
    await cdp.command("Page.navigate", { url: `${base}/dashboard/quick/admin/` });
    await cdp.until("document.readyState === 'complete' && !document.querySelector('#formFields').disabled", "config ready");
    let layout = await cdp.evaluate("return {width:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,columns:getComputedStyle(document.querySelector('.quick-layout')).gridTemplateColumns.split(' ').length,createDisabled:document.querySelector('#createButton').disabled,badge:document.querySelector('#environmentBadge').textContent};");
    assert.ok(layout.doc <= width && layout.body <= width, "no horizontal overflow"); assert.equal(layout.columns, width === 390 ? 1 : 2); assert.equal(layout.createDisabled, true); assert.equal(layout.badge, "SANDBOX");
    await cdp.evaluate(`const values=${JSON.stringify({ ...baseInput, partnerOrderId: `NM-BROWSER-${width}` })}; for(const [key,value] of Object.entries(values)){const el=document.getElementById(key); if(el){el.value=value; el.dispatchEvent(new Event('input',{bubbles:true}));}} return true;`);
    await cdp.evaluate("document.querySelector('#latitude').value=''; document.querySelector('#quoteButton').click(); return true;");
    assert.equal(await cdp.evaluate("return document.querySelector('#coordinates').open;"), true);
    await cdp.evaluate("document.querySelector('#latitude').value='37.5'; document.querySelector('#latitude').dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#quoteButton').click(); document.querySelector('#quoteButton').click(); return true;");
    await cdp.until("!document.querySelector('#quoteConfirmed').disabled", "quote rendered");
    const quoted = await cdp.evaluate("return {price:document.querySelector('#estimatedPrice').textContent,time:document.querySelector('#estimatedTime').textContent,range:document.querySelector('#priceRange').textContent,disabled:document.querySelector('#createButton').disabled};");
    assert.equal(quoted.price, "18,500원"); assert.equal(quoted.time, "약 30분"); assert.equal(quoted.range, "15,000원 ~ 18,500원"); assert.equal(quoted.disabled, true);
    await cdp.evaluate("document.querySelector('#detailAddress').value='변경됨'; document.querySelector('#detailAddress').dispatchEvent(new Event('input',{bubbles:true})); return true;");
    assert.equal(await cdp.evaluate("return document.querySelector('#quoteConfirmed').disabled && document.querySelector('#createButton').disabled;"), true);
    await cdp.evaluate("document.querySelector('#quoteButton').click(); return true;");
    await cdp.until("!document.querySelector('#quoteConfirmed').disabled", "changed address re-quoted");
    await cdp.evaluate("document.querySelector('#quoteConfirmed').click(); return true;");
    assert.equal(await cdp.evaluate("return document.querySelector('#createButton').disabled;"), false);
    await cdp.command("Runtime.evaluate", { expression: "document.activeElement.blur(); scrollTo(0,0)" });
    fs.writeFileSync(path.join(screenshots, `${width}-form.png`), (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
    await cdp.evaluate("document.querySelector('.quick-summary').scrollIntoView({block:'start',behavior:'instant'}); return true;");
    fs.writeFileSync(path.join(screenshots, `${width}-summary.png`), (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
    await cdp.evaluate("document.querySelector('#createButton').click(); return true;");
    assert.equal(await cdp.evaluate("return document.querySelector('#confirmDialog').open;"), true);
    await cdp.evaluate("document.querySelector('#submitConfirm').click(); document.querySelector('#submitConfirm').click(); return true;");
    await cdp.until("!document.querySelector('#successCard').hidden && document.querySelector('#successStatus').textContent==='배송원 배정 중'", "201 success rendered");
    await cdp.evaluate("document.querySelector('#refreshButton').click(); return true;");
    await cdp.until("document.querySelector('#successStatus').textContent==='배송원 배정 완료'", "status refreshed");
    orders.get(`NM-BROWSER-${width}`).receipt.status = "<img src=x onerror=alert(1)>";
    await cdp.evaluate("document.querySelector('#refreshButton').click(); return true;");
    await cdp.until("document.querySelector('#successStatus').textContent.startsWith('카카오 상태:')", "unknown state safely displayed");
    assert.equal(await cdp.evaluate("return document.querySelector('#successStatus').children.length;"), 0);
    orders.get(`NM-BROWSER-${width}`).receipt.status = "MATCHING";
    await cdp.evaluate("document.querySelector('#refreshButton').click(); return true;");
    await cdp.until("document.querySelector('#successStatus').textContent==='배송원 배정 완료'", "status restored");
    await cdp.evaluate("document.querySelector('#successCard').scrollIntoView({block:'start',behavior:'instant'}); return true;");
    fs.writeFileSync(path.join(screenshots, `${width}-success.png`), (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
    privateCheck(await cdp.evaluate("return document.documentElement.outerHTML;"));
    await cdp.evaluate("document.querySelector('#newButton').click(); return true;");
    assert.equal(await cdp.evaluate("return document.querySelector('#createButton').disabled && document.querySelector('#successCard').hidden;"), true);
    checks += 10;
  }
  assert.equal(upstreamCalls.filter(call => call.url === rootPath && call.method === "POST").length, beforeBrowser + 2, "double click must not duplicate orders");
  await cdp.command("Network.setExtraHTTPHeaders", { headers: {} });
  for (const width of [390,1280]) {
    await cdp.command("Emulation.setDeviceMetricsOverride", {width,height:900,deviceScaleFactor:1,mobile:width===390});
    await cdp.command("Page.navigate", {url:`${base}/dashboard/quick/`});
    await cdp.until("document.readyState==='complete' && !document.querySelector('#formFields').disabled", "public quote form ready without login");
    const state = await cdp.evaluate("return {doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,phone:document.querySelector('#pickupPhone').textContent,create:document.querySelector('#createButton').hidden,privateFields:[...document.querySelectorAll('[data-admin-only] input,[data-admin-only] select,[data-admin-only] textarea')].every(el=>el.disabled),login:document.querySelector('#publicAccess a').getAttribute('href')};");
    assert.ok(state.doc<=width&&state.body<=width); assert.equal(state.phone,""); assert.equal(state.create,true); assert.equal(state.privateFields,true); assert.equal(state.login,"/dashboard/quick/admin/");
    await cdp.evaluate(`const values=${JSON.stringify(publicInput)};for(const [key,value] of Object.entries(values)){const el=document.getElementById(key);if(el){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}}document.querySelector('#coordinates').open=true;document.querySelector('#quoteButton').click();return true;`);
    await cdp.until("document.querySelector('#estimatedPrice').textContent==='18,500원' && document.querySelector('#estimatedTime').textContent==='약 30분'", "anonymous quote displayed");
    await cdp.evaluate("document.querySelector('#submitConfirm').click();document.querySelector('.quick-summary').scrollIntoView({behavior:'instant',block:'start'});return true;");
    fs.writeFileSync(path.join(screenshots,`${width}-public.png`),(await cdp.command("Page.captureScreenshot",{format:"png"})).data,"base64");
    checks+=4;
  }
  assert.equal(upstreamCalls.filter(call=>call.url===rootPath&&call.method==='POST').length,beforeBrowser+2,"public visitors cannot create orders");
  for(let i=0;i<30;i++) await api("price", publicInput,200,{Authorization:"","X-Forwarded-For":"192.0.2.50"});
  const limited=await api("price",publicInput,429,{Authorization:"","X-Forwarded-For":"192.0.2.50"});
  assert.equal(limited.res.headers.get("retry-after"),"60");
  assert.equal(cdp.events.some(event => event.method === "Runtime.exceptionThrown"), false, "no browser runtime exceptions");
  await wait(50);
  const logs = output.join(""); privateCheck(logs);
  for (const privateValue of [baseInput.basicAddress, baseInput.recipientPhone, baseInput.recipientName, "01012345678", "MOCK_FIXED_PICKUP_ADDRESS"]) assert.ok(!logs.includes(privateValue), "request/customer data must not be logged");
  console.log(`kakao quick admin/public: ${checks} checks, anonymous quote/price/time, rate limiting, private create/status and admin aliases, fixed pickup, quote/duplicate guards, privacy, callback, 390/1280 public and admin browser flows PASS`);
} finally {
  if (cdp) cdp.ws.close();
  for (const proc of processes.reverse()) {
    if (proc.exitCode !== null || proc.signalCode !== null) continue;
    const done = once(proc, "exit"); proc.kill("SIGTERM"); await Promise.race([done, wait(1500)]);
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
  }
  await new Promise(resolve => provider.close(resolve));
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
}
