import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CRITICAL_PATHS = [
  "/",
  "/products/scone/",
  "/products/cookie-flight/",
  "/guides/",
  "/works/",
  "/pickup/",
  "/contact/",
  "/cookie-crew/"
];
const MOBILE_WIDTHS = [320, 375, 430];

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function request(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: "GET" }, (res) => {
      res.resume();
      res.once("end", () => resolve(res.statusCode));
    });
    req.once("error", reject);
    req.end();
  });
}

async function startServer() {
  const port = await reservePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: "ignore"
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if (await request(baseUrl, "/") === 200) return { child, baseUrl };
    } catch {
      // The server is still starting.
    }
    await wait(75);
  }
  child.kill("SIGTERM");
  throw new Error("browser QA server did not start");
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), wait(2000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

class CdpConnection {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.websocket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.websocket.addEventListener("open", resolve, { once: true });
      this.websocket.addEventListener("error", reject, { once: true });
    });
    this.websocket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) {
        this.events.push(message);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async command(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.websocket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.websocket.close();
  }
}

async function waitForJson(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }
    await wait(75);
  }
  throw new Error("Chrome debugging endpoint did not start");
}

async function evaluate(cdp, callbackSource) {
  const response = await cdp.command("Runtime.evaluate", {
    expression: `JSON.stringify((${callbackSource})())`,
    awaitPromise: true,
    returnByValue: true
  });
  return JSON.parse(response.result.value);
}

async function navigate(cdp, url) {
  await cdp.command("Page.navigate", { url });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(cdp, "() => ({ href: location.href, ready: document.readyState })");
    if (state.href === url && state.ready === "complete") {
      await wait(250);
      return;
    }
    await wait(75);
  }
  throw new Error(`Navigation did not finish: ${url}`);
}

async function setViewport(cdp, width, height = 844) {
  await cdp.command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768
  });
}

async function press(cdp, key, keyCode) {
  await cdp.command("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await cdp.command("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}

async function waitFor(cdp, callbackSource, message) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await evaluate(cdp, callbackSource)) return;
    await wait(75);
  }
  throw new Error(message);
}

const server = await startServer();
const debugPort = await reservePort();
const chrome = spawn(CHROME_PATH, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--remote-allow-origins=*",
  `--remote-debugging-port=${debugPort}`,
  "--user-data-dir=/private/tmp/nothingmatters-public-browser-profile",
  "about:blank"
], { stdio: "ignore" });

let cdp;
try {
  await waitForJson(debugPort);
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
  const target = await targetResponse.json();
  cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.command("Page.enable");
  await cdp.command("Runtime.enable");

  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const indexablePaths = [...sitemap.matchAll(/<loc>https:\/\/nothingmatters\.co\.kr([^<]+)<\/loc>/g)].map((match) => match[1]);
  for (const pathname of indexablePaths) {
    assert.equal(await request(server.baseUrl, pathname), 200, `indexable route failed: ${pathname}`);
  }

  for (const width of MOBILE_WIDTHS) {
    await setViewport(cdp, width);
    for (const pathname of CRITICAL_PATHS) {
      await navigate(cdp, `${server.baseUrl}${pathname}`);
      const dimensions = await evaluate(cdp, "() => ({ viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, status: performance.getEntriesByType('navigation').at(-1)?.responseStatus || null })");
      assert.equal(dimensions.status, 200, `${pathname}: expected HTTP 200`);
      assert.ok(dimensions.documentWidth <= dimensions.viewport, `${pathname}: document horizontal overflow at ${width}px`);
      assert.ok(dimensions.bodyWidth <= dimensions.viewport, `${pathname}: body horizontal overflow at ${width}px`);
    }
  }

  await setViewport(cdp, 390);
  await navigate(cdp, `${server.baseUrl}/`);
  const runtimeErrors = cdp.events.filter((event) => event.method === "Runtime.exceptionThrown");
  assert.equal(runtimeErrors.length, 0, JSON.stringify(runtimeErrors));
  await press(cdp, "Tab", 9);
  const skipState = await evaluate(cdp, "() => ({ skipFocused: document.activeElement?.hasAttribute('data-nm-skip-link') || false, skipTarget: document.querySelector('[data-nm-skip-link]')?.getAttribute('href') || '' })");
  assert.equal(skipState.skipFocused, true, "first keyboard stop should be the skip link");
  assert.ok(skipState.skipTarget.startsWith("#"), "skip link must target main content");

  const journalState = await evaluate(cdp, "() => ({ section: Boolean(document.querySelector('#journal')), list: Boolean(document.querySelector('[data-journal-list]')), header: Boolean(document.querySelector('[data-analytics-event=\"blog_header_click\"]')), footer: Boolean(document.querySelector('[data-analytics-event=\"blog_footer_click\"]')) })");
  assert.deepEqual(journalState, { section: true, list: true, header: true, footer: true });

  await evaluate(cdp, "() => { window.__nmEvents = []; window.gtag = (...args) => window.__nmEvents.push(args); const click = (selector) => { const target = document.querySelector(selector); target.addEventListener('click', (event) => event.preventDefault(), { once: true }); target.click(); }; click('[data-analytics-event=\"product_click\"]'); click('[data-analytics-event=\"blog_header_click\"]'); click('[data-analytics-event=\"blog_card_click\"]'); click('[data-analytics-event=\"blog_footer_click\"]'); return true; }");
  const analytics = await evaluate(cdp, "() => window.__nmEvents.map((entry) => ({ name: entry[1], params: entry[2] || {} }))");
  for (const eventName of ["product_click", "blog_header_click", "blog_card_click", "blog_footer_click"]) {
    assert.equal(analytics.filter((entry) => entry.name === eventName).length, 1, `${eventName} should fire once`);
  }
  assert.ok(analytics.find((entry) => entry.name === "blog_card_click")?.params.post_title, "blog card event should include post_title");

  await evaluate(cdp, "() => { const trigger = document.querySelector('[data-open-made-overlay]'); trigger.focus(); trigger.click(); return true; }");
  await wait(300);
  const opened = await evaluate(cdp, "() => ({ visible: !document.querySelector('[data-made-overlay]').hidden, focused: document.activeElement?.matches('[data-made-overlay-close]') || false })");
  assert.equal(opened.visible, true, "gallery overlay should open");
  assert.equal(opened.focused, true, "gallery overlay should move focus inside");
  await press(cdp, "Escape", 27);
  await waitFor(cdp, "() => !location.hash.includes('made-gallery')", "Escape did not restore the previous history entry");
  const escaped = await evaluate(cdp, "() => ({ hidden: document.querySelector('[data-made-overlay]').hidden, restored: document.activeElement?.matches('[data-open-made-overlay]') || false })");
  assert.equal(escaped.hidden, true, "Escape should close gallery overlay");
  assert.equal(escaped.restored, true, "Escape should restore trigger focus");

  await evaluate(cdp, "() => { document.querySelector('[data-open-made-overlay]').click(); return true; }");
  await waitFor(cdp, "() => location.hash === '#made-gallery'", "gallery opening did not add a history entry");
  await cdp.command("Runtime.evaluate", { expression: "history.back()" });
  await waitFor(cdp, "() => document.querySelector('[data-made-overlay]').hidden", "Back did not close gallery overlay");
  assert.equal(await evaluate(cdp, "() => document.querySelector('[data-made-overlay]').hidden"), true, "Back should close gallery overlay");

  await navigate(cdp, `${server.baseUrl}/cookie-crew/`);
  const cookieCrew = await evaluate(cdp, "() => { const images = [...document.images]; return { count: images.length, base64: images.filter((image) => image.currentSrc.startsWith('data:image/')).length, loaded: images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0).length }; }");
  assert.equal(cookieCrew.base64, 19, "Cookie Crew should retain all Base64 images");
  assert.equal(cookieCrew.loaded, 19, "Cookie Crew Base64 images should render");

  await setViewport(cdp, 1440, 1000);
  await navigate(cdp, `${server.baseUrl}/?qa=desktop`);
  await waitFor(cdp, "() => document.querySelector('[data-reveal]')?.classList.contains('is-visible') || false", "home reveal motion did not complete");
  await wait(1200);
  const heroState = await evaluate(cdp, "() => { const visual = document.querySelector('.showroom-hero-visual'); const figure = visual?.querySelector('.showroom-hero-main-photo'); const image = visual?.querySelector('img'); const imageStyle = image ? getComputedStyle(image) : null; const rect = image?.getBoundingClientRect(); return { visible: visual?.classList.contains('is-visible') || false, visualOpacity: visual ? getComputedStyle(visual).opacity : '', figureOpacity: figure ? getComputedStyle(figure).opacity : '', naturalWidth: image?.naturalWidth || 0, naturalHeight: image?.naturalHeight || 0, opacity: imageStyle?.opacity || '', visibility: imageStyle?.visibility || '', rect: rect ? { width: rect.width, height: rect.height } : null }; }");
  assert.equal(heroState.visible, true, "home hero visual should not remain hidden");
  assert.equal(heroState.visualOpacity, "1", "home hero visual should remain visible");
  assert.equal(heroState.figureOpacity, "1", "home hero photo frame should remain visible");
  assert.ok(heroState.naturalWidth > 0 && heroState.naturalHeight > 0, "home hero image should load");
  assert.equal(heroState.opacity, "1", "home hero image should remain visible");
  assert.equal(heroState.visibility, "visible", "home hero image should not be visually hidden");
  const homeScreenshot = await cdp.command("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/private/tmp/nothingmatters-home-desktop.png", homeScreenshot.data, "base64");
  await setViewport(cdp, 390);
  await navigate(cdp, `${server.baseUrl}/cookie-crew/`);
  await wait(400);
  const cookieScreenshot = await cdp.command("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/private/tmp/nothingmatters-cookie-crew-mobile.png", cookieScreenshot.data, "base64");
} finally {
  cdp?.close();
  chrome.kill("SIGTERM");
  await stop(server.child);
}

console.log("public browser checks: passed");
