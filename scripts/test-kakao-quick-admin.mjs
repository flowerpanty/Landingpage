import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const fakeKey = "MOCK_ONLY_QUICK_SECRET";
const localKey = "MOCK_ONLY_LOCAL_SECRET";
const localCalls = [];
const localFailures = [
  { query: "LOCAL_AUTH_FAILED", status: 401, kakaoCode: -401, code: "AUTH_FAILED", apiStatus: 502, message: "카카오 주소검색 REST API 키를 확인해 주세요." },
  { query: "LOCAL_CODE_AUTH_FAILED", status: 400, kakaoCode: -401, code: "AUTH_FAILED", apiStatus: 502, message: "카카오 주소검색 REST API 키를 확인해 주세요." },
  { query: "LOCAL_FORBIDDEN_3", status: 403, kakaoCode: -3, code: "FORBIDDEN", apiStatus: 502, message: "카카오 주소검색 API 사용 권한 또는 허용 설정을 확인해 주세요." },
  { query: "LOCAL_FORBIDDEN_5", status: 403, kakaoCode: -5, code: "FORBIDDEN", apiStatus: 502, message: "카카오 주소검색 API 사용 권한 또는 허용 설정을 확인해 주세요." },
  { query: "LOCAL_RATE_LIMITED", status: 429, kakaoCode: null, code: "RATE_LIMITED", apiStatus: 429, message: "주소 검색 요청이 많습니다. 잠시 후 다시 시도해 주세요." }
];
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
  if (req.url.startsWith("/v2/local/search/address.json?")) {
    const query = new URL(req.url,"http://mock").searchParams.get("query");
    localCalls.push({query,headers:req.headers});
    if(req.headers.authorization!==`KakaoAK ${localKey}`) return json(res,401,{message:localKey});
    const failure = localFailures.find(item => item.query === query);
    if (failure) return json(res,failure.status,{code:failure.kakaoCode,message:localKey,Authorization:"PRIVATE_AUTH",address:query});
    if(query==="NOT_FOUND") return json(res,200,{documents:[]});
    if(query==="BAD_COORDINATES") return json(res,200,{documents:[{x:"",y:"91"}]});
    if(query==="LOCAL_FAILURE") return json(res,500,{message:localKey});
    return json(res,200,{documents:[{x:"127.1234567",y:"37.5123456"}],privateKey:localKey});
  }
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
    DASHBOARD_ACCESS_MODE: "public", DASHBOARD_USERNAME: "mock-admin", DASHBOARD_PASSWORD: "mock-password", KAKAO_QUICK_VENDOR_ID: vendor, KAKAO_QUICK_API_KEY: fakeKey,
    KAKAO_QUICK_BASE_URL: `http://127.0.0.1:${provider.address().port}/goa-sandbox-service`,
    KAKAO_LOCAL_REST_API_KEY: localKey, KAKAO_LOCAL_TEST_API_URL: `http://127.0.0.1:${provider.address().port}/v2/local/search/address.json`,
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
  for (const secret of [fakeKey, localKey, vendor, "PRIVATE_AUTH", "PRIVATE_PHONE"]) assert.ok(!value.includes(secret), "credentials must never appear in browser/API output");
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
  const publicHtml = fs.readFileSync(path.join(ROOT, "dashboard/quick/index.html"), "utf8");
  const postcodeScript = 'src="https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"';
  assert.ok(publicHtml.includes(postcodeScript));
  assert.ok(publicHtml.indexOf(postcodeScript) < publicHtml.indexOf('src="/dashboard/quick/quick.js"'));
  checks++;
  base = await startServer();
  const paths = ["/dashboard/quick/admin/", "/dashboard/quick/admin.html", "/dashboard/quick/admin.js", "/dash%62oard/quick/admin/", "/%64ashboard/quick/admin/index.html", "/dashboard%2Fquick%2Fadmin/", "/api/kakao-quick/admin-config", "/api/kakao-quick/orders", "/api/kakao-quick/orders/NM-TEST"];
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
  const addressInput = {basicAddress:baseInput.basicAddress,detailAddress:"5층",orderType:"QUICK",productSize:"S"};
  const beforeAddress = upstreamCalls.length;
  const addressQuote = (await api("quote-address",{...addressInput,latitude:1,longitude:2},200,{Authorization:""})).data;
  assert.deepEqual(Object.keys(addressQuote).sort(),["address","price","estimate"].sort());
  assert.deepEqual(addressQuote.address,{basicAddress:addressInput.basicAddress,detailAddress:"5층"});
  assert.equal(addressQuote.price.totalPrice,18500); assert.equal(addressQuote.estimate.estimatedTime,1800);
  assert.ok(!/latitude|longitude|Authorization/.test(JSON.stringify(addressQuote)));
  assert.equal(localCalls.at(-1).query,addressInput.basicAddress,"detail address must not be geocoded");
  assert.equal(localCalls.at(-1).headers.accept,"application/json");
  for(const call of upstreamCalls.slice(beforeAddress)) {
    const location=call.url.endsWith("/price")?call.body.dropoff.location:call.body.dropoff;
    assert.equal(location.latitude,37.5123456); assert.equal(location.longitude,127.1234567);
    assert.equal(location.basicAddress,addressInput.basicAddress); assert.equal(location.detailAddress,"5층");
  }
  const beforeInvalidAddress = upstreamCalls.length;
  const notFound=await api("quote-address",{basicAddress:"NOT_FOUND"},400,{Authorization:""});
  assert.equal(notFound.data.error,"address_not_found");
  assert.equal(notFound.data.message,"배송지 주소를 찾지 못했습니다. 도로명 주소를 확인해 주세요.");
  for (const failure of localFailures) {
    const result = await api("quote-address",{basicAddress:failure.query},failure.apiStatus,{Authorization:""});
    assert.deepEqual(result.data,{error:"address_lookup_failed",message:failure.message});
  }
  await api("quote-address",{basicAddress:"BAD_COORDINATES"},502,{Authorization:""});
  assert.equal((await api("quote-address",{basicAddress:"LOCAL_FAILURE"},502,{Authorization:""})).data.message,"주소 검색을 완료하지 못했습니다. 잠시 후 다시 조회해 주세요.");
  await api("quote-address",{basicAddress:""},400,{Authorization:""});
  await api("quote-address",{basicAddress:"MOCK",productSize:"L"},400,{Authorization:""});
  await api("quote-address",{basicAddress:"MOCK",orderType:"DOBO"},400,{Authorization:""});
  assert.equal(upstreamCalls.length,beforeInvalidAddress,"invalid/not found Local results must not reach Quick");
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
  const config = (await api("admin-config")).data;
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
  // Only the three Kakao API settings are needed for public lookup; omit every pickup setting.
  const pickupKeys = ["ADDRESS", "DETAIL", "LATITUDE", "LONGITUDE", "NAME", "PHONE"].map(key => `KAKAO_QUICK_PICKUP_${key}`);
  const fallbackEnv = Object.fromEntries(pickupKeys.map(key => [key, undefined]));
  const fallbackBase = await startServer({ ...fallbackEnv, KAKAO_QUICK_PICKUP_DETAIL: " " });
  const mainBase = base;
  base = fallbackBase;
  const fallbackPage = await fetch(base + "/dashboard/quick/");
  assert.equal(fallbackPage.status, 200);
  assert.ok((await fallbackPage.text()).includes('id="pickupAddress">서울특별시 강서구 송정로 25 1층'));
  const fallbackConfig = (await api("config", undefined, 200, {Authorization:""})).data;
  assert.equal(fallbackConfig.ready, true);
  assert.deepEqual(fallbackConfig.pickup, {name:"NOTHINGMATTERS",address:"서울특별시 강서구 송정로 25",detail:"1층"});
  const beforeFallback = upstreamCalls.length;
  await api("price", publicInput, 200, {Authorization:""});
  await api("estimate", publicInput, 200, {Authorization:""});
  for(const call of upstreamCalls.slice(beforeFallback)) {
    const location = call.url.endsWith("/price") ? call.body.pickup.location : call.body.pickup;
    assert.deepEqual(location, {basicAddress:"서울특별시 강서구 송정로 25",detailAddress:"1층",latitude:37.557402,longitude:126.8115357});
  }
  await api("orders",baseInput,401,{Authorization:""});
  assert.equal((await api("config")).data.ready,true,"phone is only required when actually creating an order");
  const withoutPhone = await quote({...baseInput,partnerOrderId:"NO-PICKUP-PHONE"});
  const beforePhoneCheck = upstreamCalls.length;
  await api("orders",withoutPhone,503);
  assert.equal(upstreamCalls.length,beforePhoneCheck,"admin create without pickup phone must not reach Kakao");
  base = mainBase;
  const missingKeyBase = await startServer({...fallbackEnv,KAKAO_QUICK_API_KEY:""});
  assert.equal((await (await fetch(missingKeyBase+"/api/kakao-quick/config")).json()).ready,false);
  base=missingKeyBase;
  assert.equal((await api("quote-address",addressInput,503,{Authorization:""})).data.message,"카카오 T 퀵 조회 서버 설정을 확인해 주세요.");
  const missingLocalBase=await startServer({...fallbackEnv,KAKAO_LOCAL_REST_API_KEY:""});
  base=missingLocalBase;
  assert.equal((await api("config",undefined,200,{Authorization:""})).data.ready,false);
  assert.equal((await api("admin-config")).data.ready,true,"existing admin orders do not require Local");
  assert.equal((await api("quote-address",addressInput,503,{Authorization:""})).data.message,"주소 검색 서버 설정을 확인해 주세요.");
  base=mainBase;
  checks += 3;

  const {createKakaoLocalClient,KakaoLocalError}=createRequire(import.meta.url)("../lib/kakao-local.js");
  let geocodeCall;
  const localClient=createKakaoLocalClient({env:{KAKAO_LOCAL_REST_API_KEY:localKey},fetchImpl:async(url,options)=>{geocodeCall={url,options};return new Response(JSON.stringify({documents:[{x:"127.1234567",y:"37.5123456"}]}),{headers:{"Content-Type":"application/json"}});}});
  assert.deepEqual(await localClient.geocodeAddress("도로명 주소"),{latitude:37.5123456,longitude:127.1234567});
  assert.equal(new URL(geocodeCall.url).origin,"https://dapi.kakao.com"); assert.equal(new URL(geocodeCall.url).pathname,"/v2/local/search/address.json");
  assert.equal(geocodeCall.options.redirect,"error"); assert.ok(geocodeCall.options.signal instanceof AbortSignal);
  const diagnosticCases = [
    ...localFailures.map(item=>({...item,body:JSON.stringify({code:item.kakaoCode,message:localKey,Authorization:"PRIVATE_AUTH",address:"PRIVATE_SEARCH_ADDRESS"}),contentType:"application/json"})),
    {status:401,kakaoCode:null,code:"AUTH_FAILED",body:"{broken",contentType:"application/json"},
    {status:403,kakaoCode:null,code:"FORBIDDEN",body:localKey,contentType:"text/html"},
    {status:500,kakaoCode:null,code:"REQUEST_FAILED",body:JSON.stringify({code:localKey}),contentType:"application/json"},
    {status:500,kakaoCode:null,code:"REQUEST_FAILED",body:JSON.stringify({code:{secret:localKey}}),contentType:"application/json"},
    {status:500,kakaoCode:-99,code:"REQUEST_FAILED",body:JSON.stringify({code:-99}),contentType:"application/json"},
    {status:200,kakaoCode:null,code:"ADDRESS_NOT_FOUND",body:JSON.stringify({documents:[]}),contentType:"application/json",httpStatus:null}
  ];
  for (const item of diagnosticCases) {
    const client=createKakaoLocalClient({env:{KAKAO_LOCAL_REST_API_KEY:localKey},fetchImpl:async()=>new Response(item.body,{status:item.status,headers:{"Content-Type":item.contentType}})});
    await assert.rejects(client.geocodeAddress("PRIVATE_SEARCH_ADDRESS"),error=>{
      assert.ok(error instanceof KakaoLocalError);
      assert.deepEqual({...error},{name:"KakaoLocalError",code:item.code,httpStatus:item.httpStatus===null?null:item.status,kakaoCode:item.kakaoCode});
      privateCheck(JSON.stringify(error)); assert.ok(!JSON.stringify(error).includes("PRIVATE_SEARCH_ADDRESS"));
      return true;
    });
    checks++;
  }
  for(const factory of [async()=>new Response("{broken",{headers:{"Content-Type":"application/json"}}),async()=>new Response("PRIVATE_PHONE",{headers:{"Content-Type":"text/html"}}),async()=>{throw new Error(localKey);},()=>new Promise(()=>{})]) {
    let error;try{await createKakaoLocalClient({env:{KAKAO_LOCAL_REST_API_KEY:localKey},fetchImpl:factory,timeoutMs:15}).geocodeAddress("도로명 주소");}catch(caught){error=caught;}
    assert.ok(error instanceof KakaoLocalError);privateCheck(JSON.stringify(error));checks++;
  }

  const debugPort = await port(); profile = fs.mkdtempSync(path.join(os.tmpdir(), "nm-quick-admin-"));
  browser = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-allow-origins=*", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  processes.push(browser);
  let target;
  for (let i = 0; i < 80; i++) { try { target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json(); break; } catch { await wait(75); } }
  assert.ok(target, "headless Chrome must start"); cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.command("Page.enable"); await cdp.command("Runtime.enable"); await cdp.command("Network.enable");
  await cdp.command("Network.setExtraHTTPHeaders", { headers: { Authorization: authorization } });
  await cdp.command("Network.setBlockedURLs", { urls: ["*kakaomobility.com*", "*dapi.kakao.com*", "*t1.kakaocdn.net*", "*google-analytics.com*"] });
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
    await cdp.command("Page.navigate", {url:`${fallbackBase}/dashboard/quick/`});
    await cdp.until("document.readyState==='complete' && !document.querySelector('#formFields').disabled", "public quote form ready without login");
    const state = await cdp.evaluate("return {doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,name:document.querySelector('#pickupName').textContent,address:document.querySelector('#pickupAddress').textContent,privateFields:document.querySelectorAll('#latitude,#longitude,#coordinates,#partnerOrderId,#recipientName,#recipientPhone,#productName,#unitPrice,#paymentType,#createButton,#publicAccess').length,type:document.querySelector('#orderType').value,size:document.querySelector('#productSize').value};");
    assert.ok(state.doc<=width&&state.body<=width); assert.equal(state.privateFields,0); assert.equal(state.type,"QUICK"); assert.equal(state.size,"S");
    assert.equal(state.name,"NOTHINGMATTERS"); assert.equal(state.address,"서울특별시 강서구 송정로 25 1층");
    const addressControl = await cdp.evaluate("const input=document.querySelector('#basicAddress');const button=document.querySelector('#addressSearchButton');return {readonly:input.readOnly,required:input.required,disabled:input.disabled,placeholder:input.placeholder,label:button.getAttribute('aria-label'),type:button.type,columns:getComputedStyle(button.parentElement).gridTemplateColumns.split(' ').length,buttonWidth:button.getBoundingClientRect().width,rowWidth:button.parentElement.getBoundingClientRect().width};");
    assert.equal(addressControl.readonly,true); assert.equal(addressControl.required,true); assert.equal(addressControl.disabled,false);
    assert.equal(addressControl.placeholder,"주소 찾기를 눌러주세요"); assert.equal(addressControl.label,"배송지 주소 찾기"); assert.equal(addressControl.type,"button");
    assert.equal(addressControl.columns,width===390?1:2);
    if(width===390) assert.equal(addressControl.buttonWidth,addressControl.rowWidth);
    const beforeEmpty = localCalls.length;
    await cdp.evaluate("document.querySelector('#quoteButton').click();return true;");
    assert.deepEqual(await cdp.evaluate("return {text:document.querySelector('#actionStatus').textContent,focus:document.activeElement.id};"),{text:"주소를 선택해 주세요.",focus:"addressSearchButton"});
    assert.equal(localCalls.length,beforeEmpty,"empty readonly address cannot request a quote");
    await cdp.evaluate("delete window.kakao;document.querySelector('#addressSearchButton').click();return true;");
    assert.equal(await cdp.evaluate("return document.querySelector('#actionStatus').textContent;"),"주소검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    await cdp.evaluate("window.postcodeData={};window.kakao={Postcode:class{constructor(options){this.options=options;}open(){this.options.oncomplete(window.postcodeData);}}};document.querySelector('#addressSearchButton').click();return true;");
    assert.equal(await cdp.evaluate("return document.querySelector('#actionStatus').textContent;"),"주소를 선택해 주세요.");
    const selectedAddress = "서울특별시 강남구 테헤란로 123";
    await cdp.evaluate(`window.postcodeData={userSelectedType:'R',roadAddress:${JSON.stringify(selectedAddress)},jibunAddress:''};document.querySelector('#addressSearchButton').focus();return true;`);
    await cdp.command("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r"});
    await cdp.command("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
    assert.deepEqual(await cdp.evaluate("return {address:document.querySelector('#basicAddress').value,focus:document.activeElement.id};"),{address:selectedAddress,focus:"detailAddress"});
    await cdp.evaluate("document.querySelector('#detailAddress').value='5층';document.querySelector('#detailAddress').dispatchEvent(new Event('input',{bubbles:true}));scrollTo(0,0);return true;");
    fs.writeFileSync(path.join(screenshots,`${width}-public-form.png`),(await cdp.command("Page.captureScreenshot",{format:"png"})).data,"base64");
    const beforePublicQuote = upstreamCalls.length;
    const beforePublicEvents = cdp.events.length;
    await cdp.evaluate("document.querySelector('#quoteButton').click();document.querySelector('#quoteButton').click();return true;");
    await cdp.until("document.querySelector('#estimatedPrice').textContent==='18,500원' && document.querySelector('#estimatedTime').textContent==='약 30분'", "anonymous quote displayed");
    assert.equal(await cdp.evaluate("return document.querySelector('#quoteBasis').textContent;"),"일반 퀵 · 소형(S) 기준");
    assert.equal(await cdp.evaluate("return document.querySelector('#priceRange').textContent;"),"15,000원 ~ 18,500원");
    assert.equal(await cdp.evaluate("return document.querySelector('#resultAddress').textContent;"),`${selectedAddress} 5층`);
    const quoteRequests = cdp.events.slice(beforePublicEvents).filter(event=>event.method==="Network.requestWillBeSent"&&event.params.request.url.endsWith("/api/kakao-quick/quote-address"));
    assert.equal(quoteRequests.length,1,"double click sends one public quote request");
    assert.deepEqual(JSON.parse(quoteRequests[0].params.request.postData),{basicAddress:selectedAddress,detailAddress:"5층",orderType:"QUICK",productSize:"S"});
    assert.equal(Object.keys(quoteRequests[0].params.request.headers).some(key=>key.toLowerCase()==="authorization"),false);
    assert.equal(localCalls.at(-1).query,selectedAddress);
    const publicCalls = upstreamCalls.slice(beforePublicQuote);
    assert.equal(publicCalls.length,2);
    for(const call of publicCalls){
      const location=call.url.endsWith("/price")?call.body.dropoff.location:call.body.dropoff;
      assert.equal(location.basicAddress,selectedAddress); assert.equal(location.detailAddress,"5층");
      assert.equal(location.latitude,37.5123456); assert.equal(location.longitude,127.1234567);
    }
    const publicMarkup = await cdp.evaluate("return document.documentElement.outerHTML;");
    privateCheck(publicMarkup); assert.ok(!/37\.5123456|127\.1234567/.test(publicMarkup));
    assert.equal(await cdp.evaluate(`return document.documentElement.scrollWidth<=${width}&&document.body.scrollWidth<=${width};`),true);
    await cdp.evaluate("document.querySelector('.quick-summary').scrollIntoView({behavior:'instant',block:'start'});return true;");
    fs.writeFileSync(path.join(screenshots,`${width}-public.png`),(await cdp.command("Page.captureScreenshot",{format:"png"})).data,"base64");
    await cdp.evaluate("window.postcodeData={jibunAddress:'NOT_FOUND'};document.querySelector('#addressSearchButton').click();return true;");
    assert.deepEqual(await cdp.evaluate("return {address:document.querySelector('#basicAddress').value,price:document.querySelector('#estimatedPrice').textContent,resultHidden:document.querySelector('#resultAddress').hidden,focus:document.activeElement.id};"),{address:"NOT_FOUND",price:"조회 전",resultHidden:true,focus:"detailAddress"});
    await cdp.evaluate("document.querySelector('#quoteButton').click();return true;");
    await cdp.until("document.querySelector('#actionStatus').textContent.includes('도로명 주소를 다시 확인')","address not found message");
    await cdp.evaluate("window.postcodeData={address:'주소 대체값'};document.querySelector('#addressSearchButton').click();return true;");
    assert.equal(await cdp.evaluate("return document.querySelector('#basicAddress').value;"),"주소 대체값");
    checks+=22;
  }
  assert.equal(upstreamCalls.filter(call=>call.url===rootPath&&call.method==='POST').length,beforeBrowser+2,"public visitors cannot create orders");
  for(let i=0;i<30;i++) await api("quote-address", addressInput,200,{Authorization:"","X-Forwarded-For":"192.0.2.50"});
  const beforeLimitLocal=localCalls.length;
  await api("quote-address",addressInput,429,{Authorization:"","X-Forwarded-For":"192.0.2.50"});
  assert.equal(localCalls.length,beforeLimitLocal,"rate limit must precede geocoding");
  const limited=await api("price",publicInput,429,{Authorization:"","X-Forwarded-For":"192.0.2.50"});
  assert.equal(limited.res.headers.get("retry-after"),"60");
  assert.equal(cdp.events.some(event => event.method === "Runtime.exceptionThrown"), false, "no browser runtime exceptions");
  await wait(50);
  const logs = output.join(""); privateCheck(logs);
  for (const failure of localFailures) {
    const expected = new RegExp(`kakao_local_error \\{\\s*code: '${failure.code}',\\s*httpStatus: ${failure.status},\\s*kakaoCode: ${failure.kakaoCode}\\s*\\}`);
    assert.match(logs,expected,"only safe Local diagnostic fields are logged");
    assert.ok(!logs.includes(failure.query),"failed search addresses must not be logged");
  }
  assert.ok(!logs.includes("Authorization"));
  for (const privateValue of [baseInput.basicAddress, baseInput.recipientPhone, baseInput.recipientName, "01012345678", "MOCK_FIXED_PICKUP_ADDRESS"]) assert.ok(!logs.includes(privateValue), "request/customer data must not be logged");
  console.log(`kakao quick admin/public: ${checks} checks, Local HTTP/numeric error diagnostics and safe logs/messages, Postcode mock selection/keyboard/detail focus/invalidation, anonymous address quotes/Local x/y mapping, SDK unavailable/empty/not-found/missing keys, safe JSON/errors/timeouts, no public coordinates/secret/order fields, rate limiting, admin create/status/callback preserved, 390/1280 address search and admin flows PASS`);
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
