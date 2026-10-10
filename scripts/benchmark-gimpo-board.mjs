import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { startMockFlightProvider } from "./gimpo-board-test-provider.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const verify = process.argv.includes("--verify");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nm-board-benchmark-"));

async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const result = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return result;
}

async function ready(url) {
  for (let i = 0; i < 100; i += 1) {
    try { const response = await fetch(url); if (response.ok) return response; } catch { /* starting */ }
    await wait(75);
  }
  throw new Error(`Timed out waiting for ${new URL(url).pathname}`);
}

class Cdp {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.open = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  async command(method, params = {}) {
    await this.open;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(source) {
    const result = await this.command("Runtime.evaluate", { expression: `Promise.resolve((${source})()).then(JSON.stringify)`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return JSON.parse(result.result.value);
  }
  close() { this.socket.close(); }
}

const provider = await startMockFlightProvider({ domesticDepartureCount: verify ? 500 : 160, domesticArrivalCount: verify ? 500 : 160 });
const appPort = await port();
const debugPort = await port();
const server = spawn(process.execPath, ["server.js"], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "test", HOST: "127.0.0.1", PORT: String(appPort), GIMPO_BOARD_TEST_API_URL: provider.url, KAC_FLIGHT_API_KEY: "benchmark-test-key" },
  stdio: "ignore"
});
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-allow-origins=*", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let cdp;
try {
  await ready(`http://127.0.0.1:${appPort}/`);
  await ready(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.command("Page.enable");
  await cdp.command("Runtime.enable");
  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.command("Page.addScriptToEvaluateOnNewDocument", { source: "(() => { window.__boardMotion = { banks: 0, slotFlips: 0 }; document.addEventListener('animationstart', (event) => { if (event.target.matches?.('#flight-rows .flap-bank')) window.__boardMotion.banks += 1; }, true); const observer = new MutationObserver((records) => { for (const record of records) if (record.target.matches?.('#flight-rows .flap-slot.is-flipping')) window.__boardMotion.slotFlips += 1; }); observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] }); })();" });
  await cdp.command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const NativeDate = Date; function FixedDate(...args) { return args.length ? new NativeDate(...args) : new NativeDate('2026-09-28T06:30:00+09:00'); } FixedDate.now = () => new NativeDate('2026-09-28T06:30:00+09:00').getTime(); FixedDate.parse = NativeDate.parse; FixedDate.UTC = NativeDate.UTC; FixedDate.prototype = NativeDate.prototype; window.Date = FixedDate; })();` });
  await cdp.command("Page.navigate", { url: `http://127.0.0.1:${appPort}/gimpo-board/` });
  let metrics;
  for (let i = 0; i < 200; i += 1) {
    metrics = await cdp.evaluate(`() => ({ rows: document.querySelectorAll('#flight-rows tr[data-flight-id]').length, slots: document.querySelectorAll('#flight-rows .flap-slot').length, nodes: document.querySelectorAll('*').length, firstRenderMs: performance.getEntriesByName('gimpo-board-first-render').at(-1)?.startTime ?? null, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, boardCount: document.getElementById('board-count').textContent })`);
    if (metrics.firstRenderMs !== null) break;
    await wait(100);
  }
  if (metrics.firstRenderMs === null) throw new Error("Board did not finish initial render");
  const frames = await cdp.evaluate(`async () => { const gaps = []; let previous = performance.now(); for (let i = 0; i < 24; i += 1) { await new Promise(requestAnimationFrame); const current = performance.now(); gaps.push(current - previous); previous = current; window.scrollBy(0, 72); } return gaps.sort((a,b) => a-b)[Math.floor(gaps.length * .95)]; }`);
  for (let i = 0; i < 30; i += 1) {
    if (await cdp.evaluate(`() => performance.getEntriesByName('gimpo-board-initial-settled').length === 1`)) break;
    await wait(25);
  }
  const entrance = await cdp.evaluate(`() => { const start = performance.getEntriesByName('gimpo-board-initial-entrance')[0]; const end = performance.getEntriesByName('gimpo-board-initial-settled')[0]; return { durationMs: start && end ? Math.round(end.startTime - start.startTime) : null, detail: start?.detail ?? null, ...window.__boardMotion, loaderSlots: document.querySelectorAll('#board-loader .flap-slot').length, firstFlight: document.querySelector('#flight-rows [data-field=flight] .flap-bank')?.dataset.value, activeSlotFlips: document.querySelectorAll('#flight-rows .flap-slot.is-flipping').length }; }`);
  const payload = await (await fetch(`http://127.0.0.1:${appPort}/api/gimpo-board/flights?type=arrival`)).json();
  console.log(JSON.stringify({ ...metrics, scrollFrameP95Ms: Math.round(frames), apiRows: payload.data.length, entrance }));
  if (verify) {
    assert.equal(payload.data.length, 501, "the API must retain every full-day flight");
    assert.equal(metrics.rows, 10, "mobile defaults to ten time-window rows");
    assert.equal(metrics.slots, 320, "only visible mobile rows should own 7+11+5+9 mechanical slots");
    assert.equal(metrics.boardCount, "10 / 272 FLIGHTS", "the default time window should include only 05:30–10:30 KST flights, not the full day");
    assert.ok(metrics.documentWidth <= metrics.viewport, "mobile board must not overflow");
    assert.ok(metrics.firstRenderMs < 500, `initial flight values should be ready promptly: ${metrics.firstRenderMs}ms`);
    assert.ok(entrance.durationMs !== null && entrance.durationMs <= 500 && entrance.detail?.rows === 10 && entrance.detail?.banks === 40 && entrance.detail?.rowStaggerMs === 22 && entrance.banks > 0 && entrance.slotFlips === 0 && entrance.activeSlotFlips === 0 && entrance.loaderSlots === 0 && entrance.firstFlight, `mobile should use static values and a sub-500ms bank entrance: ${JSON.stringify(entrance)}`);
    assert.ok(frames <= 45, `mobile scroll frame p95 should stay responsive: ${frames}ms`);
    assert.equal(await cdp.evaluate(`() => !document.getElementById('board-more').hidden`), true, "more relevant flights should be available progressively");
    await cdp.evaluate(`() => { document.getElementById('board-more').click(); return true; }`);
    assert.equal(await cdp.evaluate(`() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length`), 20, "more button should reveal one mobile page");
    await cdp.evaluate(`() => { const input = document.getElementById('flight-search'); input.value = 'ZE600'; input.dispatchEvent(new Event('input', { bubbles: true })); return true; }`);
    assert.equal(await cdp.evaluate(`() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length`), 20, "search should not rerender on the same keystroke");
    await wait(250);
    assert.equal(await cdp.evaluate(`() => document.querySelector('#flight-rows tr[data-flight-id] .flight-number')?.getAttribute('aria-label')`), "ZE600 항공편 상세 보기", "search must find an out-of-window flight in full data");
    await cdp.evaluate(`() => { const input = document.getElementById('flight-search'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('input[value=international]').click(); return true; }`);
    assert.equal(await cdp.evaluate(`() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length`), 1, "line filters must use full data before limiting rows");
    await cdp.evaluate(`() => { document.querySelector('input[value=all]').click(); return true; }`);
    await wait(800);
    await cdp.evaluate(`() => { window.__firstFlightRow = document.querySelector('#flight-rows tr[data-flight-id]'); document.getElementById('board-refresh').click(); return true; }`);
    for (let i = 0; i < 80; i += 1) {
      if (await cdp.evaluate(`() => !document.getElementById('board-refresh').disabled`)) break;
      await wait(75);
    }
    assert.deepEqual(await cdp.evaluate(`() => ({ same: window.__firstFlightRow === document.querySelector('#flight-rows tr[data-flight-id]'), flipping: document.querySelectorAll('#flight-rows .flap-slot.is-flipping').length, rows: document.querySelectorAll('#flight-rows tr[data-flight-id]').length })`), { same: true, flipping: 0, rows: 10 }, "unchanged refresh must reuse row DOM without replaying all flaps");
    await cdp.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 40; i += 1) {
      if (await cdp.evaluate(`() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length === 16`)) break;
      await wait(75);
    }
    assert.equal(await cdp.evaluate(`() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length`), 16, "desktop defaults to sixteen rows");
    assert.equal(await cdp.evaluate(`() => document.documentElement.scrollWidth <= innerWidth`), true, "desktop board must not overflow");
    await cdp.command("Page.navigate", { url: `http://127.0.0.1:${appPort}/gimpo-board/` });
    let desktopEntrance;
    for (let i = 0; i < 80; i += 1) {
      desktopEntrance = await cdp.evaluate(`() => { const start = performance.getEntriesByName('gimpo-board-initial-entrance')[0]; const end = performance.getEntriesByName('gimpo-board-initial-settled')[0]; return end ? { rows: document.querySelectorAll('#flight-rows tr[data-flight-id]').length, slots: document.querySelectorAll('#flight-rows .flap-slot').length, nodes: document.querySelectorAll('*').length, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, durationMs: Math.round(end.startTime - start.startTime), detail: start.detail, ...window.__boardMotion } : null; }`);
      if (desktopEntrance) break;
      await wait(25);
    }
    assert.ok(desktopEntrance?.rows === 16 && desktopEntrance.slots === 640 && desktopEntrance.documentWidth <= desktopEntrance.viewport && desktopEntrance.durationMs <= 500 && desktopEntrance.detail?.banks === 80 && desktopEntrance.detail?.rowStaggerMs === 18 && desktopEntrance.banks > 0 && desktopEntrance.slotFlips === 0, `desktop should also use a sub-500ms bank entrance: ${JSON.stringify(desktopEntrance)}`);
    console.log(JSON.stringify({ desktopEntrance }));
    console.log("gimpo board window regression: PASS");
  }
} finally {
  cdp?.close();
  for (const child of [chrome, server]) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), wait(2000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
  await provider.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
