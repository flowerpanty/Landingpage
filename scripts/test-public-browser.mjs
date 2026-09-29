import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { startMockFlightProvider } from "./gimpo-board-test-provider.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CRITICAL_PATHS = [
  "/",
  "/products/scone/",
  "/products/cookie-flight/",
  "/products/airplane-cookie/",
  "/brookie/",
  "/products/handmade-cookie/",
  "/products/lucky-cookie/",
  "/magok-cookie/",
  "/guides/",
  "/guides/cookie-storage/",
  "/guides/gimpo-airport-flight-status/",
  "/guides/gimpo-airport-departure-checklist/",
  "/works/",
  "/bulk/",
  "/pickup/",
  "/contact/",
  "/cookie-crew/",
  "/gimpo-board/",
  "/gimpo/",
  "/gimpo2/",
  "/gimpo/pickup/"
];
const MOBILE_WIDTHS = [320, 375, 390, 430];
const PICKUP_MAP_URL = "https://map.naver.com/p/entry/place/1547319276?lng=126.8115357&lat=37.557402&placePath=%2Fhome%3Ffrom%3Dmap%26fromPanelNum%3D1%26additionalHeight%3D76%26timestamp%3D202609131310%26locale%3Dko%26svcName%3Dmap_pcv5&entry=plt&searchType=place&c=15.00,0,0,0,dh";
const GIMPO_BOOKING_URL = "https://m.place.naver.com/restaurant/1547319276/booking?entry=ple";
const PICKUP_RESERVATION_URL = "https://m.place.naver.com/restaurant/1547319276/home?utm_source=nothingmatters.co.kr&utm_medium=owned&utm_campaign=pickup_reservation";
const expectedOrderUrls = new Map([
  ["/products/cookie-flight/", "https://thingmattersreserve-production.up.railway.app/cookie-flight"],
  ["/products/airplane-cookie/", "https://thingmattersreserve-production.up.railway.app/airplane-butter-cookie"],
  ["/cookie-crew/", "https://thingmattersreserve-production.up.railway.app/cookie-crew"]
]);
const BROWSER_GALLERY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nm-public-browser-gallery-"));

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

async function startServer(extraEnv = {}) {
  const port = await reservePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, GALLERY_DATA_DIR: BROWSER_GALLERY_DATA_DIR, HOST: "127.0.0.1", PORT: String(port), ...extraEnv },
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

async function verifyGimpoDesign(cdp, pathname, width) {
  await setViewport(cdp, width, width === 1280 ? 900 : 844);
  await navigate(cdp, `${server.baseUrl}${pathname}`);
  const pickup = pathname.endsWith("/pickup/");
  const visual = await evaluate(cdp, `() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const border = (selector) => {
      const computed = style(selector);
      return { width: parseFloat(computed.borderTopWidth), color: computed.borderTopColor, radius: parseFloat(computed.borderTopLeftRadius) };
    };
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      headings: [...document.querySelectorAll('main h1, main h2, main h3')].map((node) => ({ text: node.textContent.trim(), weight: getComputedStyle(node).fontWeight })),
      wordmark: [style('.gimpo-header .wordmark').fontWeight, style('.gimpo-header .wordmark span').fontWeight],
      nav: [...document.querySelectorAll('.gimpo-header nav a')].filter((node) => getComputedStyle(node).display !== 'none').map((node) => ({ text: node.textContent.trim(), weight: getComputedStyle(node).fontWeight })),
      clipped: [...document.querySelectorAll('.gimpo-header .wordmark, .gimpo-header nav a, main h1')].filter((node) => getComputedStyle(node).display !== 'none' && (node.scrollWidth > node.clientWidth + 1 || node.getBoundingClientRect().left < -1 || node.getBoundingClientRect().right > innerWidth + 1)).map((node) => node.textContent.trim()),
      hero: border('${pickup ? ".pickup-hero-art img" : ".hero-visual img"}'),
      location: border('.location-photo img'),
      products: ${pickup ? "[]" : "[...document.querySelectorAll('.cookie-image')].map((node) => { const computed = getComputedStyle(node); return { width: parseFloat(computed.borderTopWidth), color: computed.borderTopColor }; })"},
      cards: ${pickup ? "[]" : "[...document.querySelectorAll('.cookie-card')].map((node) => { const computed = getComputedStyle(node); return { border: parseFloat(computed.borderTopWidth), background: computed.backgroundColor, shadow: computed.boxShadow }; })"},
      bodyBackground: style('body').backgroundColor,
      blueBackground: style('${pickup ? ".pickup-final" : ".final-section"}').backgroundColor,
      accentBackground: style('${pickup ? ".pickup-alert" : ".experience-section"}').backgroundColor,
      sticky: [...document.querySelectorAll('.mobile-sticky a')].map((node) => ({ text: node.textContent.trim(), href: node.href, height: node.getBoundingClientRect().height, width: node.getBoundingClientRect().width, top: node.getBoundingClientRect().top, background: getComputedStyle(node).backgroundColor, foreground: getComputedStyle(node).color, border: border('.mobile-sticky a').width, visible: getComputedStyle(node).display !== 'none' })),
      density: {
        heroPaddingTop: parseFloat(style('${pickup ? ".pickup-hero" : ".gimpo-hero"}').paddingTop),
        heroPaddingBottom: parseFloat(style('${pickup ? ".pickup-hero" : ".gimpo-hero"}').paddingBottom),
        heroGap: parseFloat(style('${pickup ? ".pickup-hero" : ".gimpo-hero"}').gap),
        sectionPadding: parseFloat(style('${pickup ? ".pickup-steps" : ".cookies-section"}').paddingTop),
        sectionBottomPadding: parseFloat(style('${pickup ? ".pickup-location" : ".location-section"}').paddingBottom),
        allSectionPaddings: [...document.querySelectorAll('main .section')].map((node) => ({ top: parseFloat(getComputedStyle(node).paddingTop), bottom: parseFloat(getComputedStyle(node).paddingBottom) })),
        heroButtons: [...document.querySelectorAll('${pickup ? ".pickup-hero" : ".gimpo-hero"} .button')].map((node) => node.getBoundingClientRect().height),
        imageHeight: document.querySelector('${pickup ? ".pickup-hero-art img" : ".hero-visual img"}').getBoundingClientRect().height,
        imageWidth: document.querySelector('${pickup ? ".pickup-hero-art img" : ".hero-visual img"}').getBoundingClientRect().width,
        productGap: ${pickup ? "null" : "parseFloat(style('.cookie-grid').rowGap)"},
        productColumns: ${pickup ? "null" : "style('.cookie-grid').gridTemplateColumns.trim().split(/\\s+/).length"},
        locationGap: parseFloat(style('${pickup ? ".pickup-location" : ".location-section"}').gap),
        locationColumns: ${pickup ? "null" : "style('.location-section').gridTemplateColumns.trim().split(/\\s+/).length"},
        quickInfoHeight: ${pickup ? "null" : "document.querySelector('.quick-info').getBoundingClientRect().height"},
        boardWidth: ${pickup ? "null" : "document.querySelector('.gimpo-board').getBoundingClientRect().width"},
        pickupRowHeights: ${pickup ? "[...document.querySelectorAll('.pickup-product-list > a')].map((node) => node.getBoundingClientRect().height)" : "[]"}
      }
    };
  }`);
  assert.equal(visual.viewport, width, `${pathname} viewport`);
  assert.ok(visual.documentWidth <= width && visual.bodyWidth <= width, `${pathname} overflow at ${width}px: ${JSON.stringify(visual)}`);
  assert.ok(visual.headings.length > 3 && visual.headings.every((heading) => heading.weight === "900"), `${pathname} headings must be full bold: ${JSON.stringify(visual.headings)}`);
  assert.deepEqual(visual.wordmark, ["900", "900"], `${pathname} wordmark must be uniformly bold`);
  assert.ok(visual.nav.every((item) => Number(item.weight) >= 700), `${pathname} navigation must be bold`);
  assert.deepEqual(visual.clipped, [], `${pathname} header or H1 clipped at ${width}px`);
  for (const frame of [visual.hero, visual.location, ...visual.products]) {
    assert.ok(frame.width >= 2.5 && frame.color === "rgb(17, 17, 17)", `${pathname} photo frame must be black: ${JSON.stringify(frame)}`);
  }
  assert.equal(visual.products.length, pickup ? 0 : 3, `${pathname} product photos`);
  assert.ok(visual.cards.every((card) => card.border === 0 && card.background === "rgba(0, 0, 0, 0)" && card.shadow === "none"), `${pathname} products should use editorial layout`);
  assert.equal(visual.bodyBackground, "rgb(255, 255, 255)");
  assert.equal(visual.blueBackground, "rgb(135, 193, 235)");
  assert.equal(visual.accentBackground, pickup ? "rgb(221, 240, 255)" : "rgb(135, 193, 235)");
  if (width === 390) {
    assert.deepEqual(visual.sticky.map(({ text, href, background }) => ({ text, href, background })), [
      { text: "위치 보기", href: PICKUP_MAP_URL, background: "rgb(255, 255, 255)" },
      { text: "네이버 예약 →", href: GIMPO_BOOKING_URL, background: "rgb(3, 199, 90)" }
    ], `${pathname} mobile actions must use the official map and booking URLs`);
    assert.ok(visual.sticky.every((link) => link.visible && link.height >= 52 && link.height <= 56 && link.border >= 2 && link.foreground === "rgb(17, 17, 17)"), `${pathname} mobile actions must be legible and tappable`);
    assert.ok(Math.abs(visual.sticky[0].top - visual.sticky[1].top) < 1 && Math.abs(visual.sticky[0].width - visual.sticky[1].width) < 1, `${pathname} mobile actions must share one row equally`);
    assert.ok(visual.density.heroPaddingTop <= 42 && visual.density.heroPaddingBottom <= 42, `${pathname} hero mobile padding: ${JSON.stringify(visual.density)}`);
    assert.ok(visual.density.heroGap <= 24, `${pathname} hero copy/image gap`);
    assert.ok(visual.density.sectionPadding <= 56 && visual.density.sectionBottomPadding <= 56, `${pathname} section padding`);
    assert.ok(visual.density.allSectionPaddings.every(({ top, bottom }) => top <= 56 && bottom <= 56), `${pathname} all mobile sections should remain compact`);
    assert.ok(visual.density.locationGap <= 28, `${pathname} location gap`);
    assert.ok(visual.density.heroButtons.length === 2 && visual.density.heroButtons.every((height) => height >= 44), `${pathname} hero CTA touch targets`);
    assert.ok(visual.density.imageHeight <= visual.density.imageWidth * .9, `${pathname} hero image should remain compact`);
    if (pickup) assert.ok(visual.density.pickupRowHeights.length === 3 && visual.density.pickupRowHeights.every((height) => height <= 72), "pickup rows should remain compact");
    else {
      assert.ok(visual.density.productGap <= 30 && visual.density.productColumns === 2, "Gimpo mobile products should form a compact two-column grid");
      assert.ok(visual.density.quickInfoHeight <= 210, "Gimpo quick info should remain compact");
      assert.ok(visual.density.boardWidth >= width - 35, "Gimpo board should use almost the full mobile width");
    }
  }
  if (width === 1280 && !pickup) {
    assert.equal(visual.density.productColumns, 4, "Gimpo desktop layout should place the intro beside three products");
    assert.equal(visual.density.locationColumns, 3, "Gimpo desktop location should have heading, photo, and address columns");
  }
  await evaluate(cdp, "() => { document.querySelectorAll('main img').forEach((image) => { image.loading = 'eager'; }); return true; }");
  await waitFor(cdp, "() => [...document.querySelectorAll('main img')].every((image) => image.complete && image.naturalWidth > 0)", `${pathname} product and location images should load`);
  await cdp.command("Runtime.evaluate", {
    expression: "(async () => { for (const image of document.querySelectorAll('main img')) { image.scrollIntoView({ block: 'center' }); await image.decode(); await new Promise(requestAnimationFrame); } scrollTo(0, 0); await new Promise(requestAnimationFrame); return true; })()",
    awaitPromise: true,
    returnByValue: true
  });
  const screenshot = await cdp.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(`/private/tmp/nm-gimpo-design-${pickup ? "pickup" : "landing"}-${width}.png`, screenshot.data, "base64");
}

const flightProvider = await startMockFlightProvider();
const server = await startServer({ NODE_ENV: "test", GIMPO_BOARD_TEST_API_URL: flightProvider.url, KAC_FLIGHT_API_KEY: "browser-test-key" });
const debugPort = await reservePort();
const chrome = spawn(CHROME_PATH, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--remote-allow-origins=*",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=/private/tmp/nothingmatters-public-browser-profile-${process.pid}`,
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

  for (const width of [390, 1280]) {
    await verifyGimpoDesign(cdp, "/gimpo/", width);
    await verifyGimpoDesign(cdp, "/gimpo/pickup/", width);
  }

  await setViewport(cdp, 390);
  await navigate(cdp, `${server.baseUrl}/gimpo/`);
  const gimpoState = await evaluate(cdp, "() => ({ cards: [...document.querySelectorAll('.cookie-card')].map((card) => new URL(card.href).pathname), rows: [...document.querySelectorAll('.destination-row')].map((row) => ({ value: row.querySelector('.flap-bank')?.dataset.value, slots: row.querySelectorAll('.flap-slot').length })), map: document.querySelector('.mobile-sticky a:first-child')?.href, booking: document.querySelector('.mobile-sticky a:last-child')?.href, sticky: getComputedStyle(document.querySelector('.mobile-sticky')).position, stickyBottom: Math.round(document.querySelector('.mobile-sticky').getBoundingClientRect().bottom), height: innerHeight, disclaimer: document.body.textContent.includes('실제 항공편 정보가 아닙니다.'), sound: window.NmSplitFlap.getSoundState(), productImages: [...document.querySelectorAll('.cookie-card img')].every((image) => image.complete && image.naturalWidth > 0) })");
  assert.deepEqual(gimpoState.cards, ["/products/cookie-flight/", "/products/terminal-sand-cookie/", "/products/airplane-cookie/"]);
  assert.deepEqual(gimpoState.rows.map((row) => row.value), ["JEJU", "BUSAN", "TOKYO", "OSAKA"]);
  assert.ok(gimpoState.rows.every((row) => row.slots === 5), "Gimpo design board must use actual flap slots");
  assert.equal(gimpoState.map, PICKUP_MAP_URL);
  assert.equal(gimpoState.booking, GIMPO_BOOKING_URL);
  assert.equal(gimpoState.sticky, "fixed");
  assert.equal(gimpoState.stickyBottom, gimpoState.height);
  assert.equal(gimpoState.disclaimer, true);
  assert.equal(gimpoState.productImages, true, "all three product images should load");
  assert.equal(gimpoState.sound.contextCreated, false, "Gimpo design board must not auto-play sound");
  assert.deepEqual(await evaluate(cdp, "() => [...document.querySelectorAll('.gimpo-tools a')].map((link) => new URL(link.href).pathname)"), ["/gimpo-board/", "/gimpo2/"], "Gimpo cookie hub should expose both flight tools");
  assert.equal(await evaluate(cdp, "() => document.querySelectorAll('.gimpo-faq article').length"), 5, "Gimpo cookie hub should retain three pickup answers and show two flight answers");
  const gimpoTextClipping = await evaluate(cdp, "() => [...document.querySelectorAll('.gimpo-header nav a, .hero-copy h1, .hero-description')].filter((element) => getComputedStyle(element).display !== 'none').map((element) => ({ text: element.textContent.trim(), clipped: element.scrollWidth > element.clientWidth + 1 || element.getBoundingClientRect().right > innerWidth + 1 }))");
  assert.ok(gimpoTextClipping.every((element) => !element.clipped), `Gimpo mobile text must fit: ${JSON.stringify(gimpoTextClipping)}`);
  await evaluate(cdp, "() => { document.getElementById('gimpo-board-change').click(); return true; }");
  await waitFor(cdp, "() => document.querySelector('.destination-row .flap-bank')?.dataset.value === 'BUSAN'", "Gimpo design board should change destinations through NmSplitFlap");
  await cdp.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate(cdp, `${server.baseUrl}/gimpo/`);
  const gimpoReduced = await evaluate(cdp, "() => { document.getElementById('gimpo-board-change').click(); return { value: document.querySelector('.destination-row .flap-bank').dataset.value, animatedSlots: document.querySelectorAll('.gimpo-board .flap-slot.is-flipping').length, motion: matchMedia('(prefers-reduced-motion: reduce)').matches }; }");
  assert.deepEqual(gimpoReduced, { value: "BUSAN", animatedSlots: 0, motion: true }, "Gimpo design board should settle immediately with reduced motion");
  await cdp.command("Emulation.setEmulatedMedia", { features: [] });
  await navigate(cdp, `${server.baseUrl}/gimpo/pickup/`);
  const gimpoPickupState = await evaluate(cdp, "() => ({ steps: [...document.querySelectorAll('.pickup-steps li h3')].map((item) => item.textContent.trim()), products: [...document.querySelectorAll('.pickup-product-list a')].map((link) => new URL(link.href).pathname), sticky: [...document.querySelectorAll('.mobile-sticky a')].map((link) => ({ text: link.textContent.trim(), href: link.href })), position: getComputedStyle(document.querySelector('.mobile-sticky')).position, bottom: Math.round(document.querySelector('.mobile-sticky').getBoundingClientRect().bottom), height: innerHeight, map: document.querySelector('.pickup-location .button-dark')?.href, address: document.querySelector('.pickup-location address')?.textContent.trim() })");
  assert.deepEqual(gimpoPickupState.steps, ["쿠키 선택", "픽업 예약", "공항동 매장에서 수령", "김포공항으로 이동"]);
  assert.deepEqual(gimpoPickupState.products, ["/products/cookie-flight/", "/products/terminal-sand-cookie/", "/products/airplane-cookie/"]);
  assert.deepEqual(gimpoPickupState.sticky, [
    { text: "위치 보기", href: PICKUP_MAP_URL },
    { text: "네이버 예약 →", href: GIMPO_BOOKING_URL },
  ]);
  assert.equal(gimpoPickupState.position, "fixed");
  assert.equal(gimpoPickupState.bottom, gimpoPickupState.height);
  assert.equal(gimpoPickupState.map, PICKUP_MAP_URL);
  assert.equal(gimpoPickupState.address, "서울 강서구 송정로 25 1층");
  assert.deepEqual(await evaluate(cdp, "() => [...document.querySelectorAll('.gimpo-related a')].map((link) => new URL(link.href).pathname)"), ["/gimpo2/", "/gimpo-board/", "/gimpo/"], "pickup guide should link to the planner, board and travel-cookie hub");
  const gimpoPickupTextClipping = await evaluate(cdp, "() => [...document.querySelectorAll('.gimpo-header nav a, .pickup-hero h1, .pickup-hero-copy>p:not(.eyebrow)')].filter((element) => getComputedStyle(element).display !== 'none').map((element) => ({ text: element.textContent.trim(), clipped: element.scrollWidth > element.clientWidth + 1 || element.getBoundingClientRect().right > innerWidth + 1 }))");
  assert.ok(gimpoPickupTextClipping.every((element) => !element.clipped), `Gimpo pickup mobile text must fit: ${JSON.stringify(gimpoPickupTextClipping)}`);
  await navigate(cdp, `${server.baseUrl}/gimpo2/`);
  await waitFor(cdp, "() => document.querySelectorAll('#g2-list .flight-row').length === 4", "Gimpo2 should show shared live departures");
  const gimpo2FirstView = await evaluate(cdp, "() => ({ h1: document.querySelector('h1')?.textContent.trim(), tabs: [...document.querySelectorAll('.flight-tabs button')].map((button) => button.textContent.trim()), searchVisible: document.getElementById('g2-search').getBoundingClientRect().top < innerHeight, rows: document.querySelectorAll('#g2-list .flight-row').length, boardHref: new URL(document.getElementById('g2-board-link').href).pathname, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth })");
  assert.equal(gimpo2FirstView.h1, "내 항공편 기준 쿠키 픽업 시간 확인");
  assert.equal(gimpo2FirstView.tabs.length, 2);
  assert.ok(gimpo2FirstView.searchVisible && gimpo2FirstView.documentWidth <= gimpo2FirstView.viewport, "Gimpo2 mobile search should fit in the first viewport");
  assert.equal(gimpo2FirstView.boardHref, "/gimpo-board/");
  assert.deepEqual(await evaluate(cdp, "() => ({ heading: document.getElementById('live-title').textContent.trim(), answers: document.querySelectorAll('.flight-answers article').length, board: new URL(document.querySelector('.flight-answers a').href).pathname, overflow: document.documentElement.scrollWidth > innerWidth })"), { heading: "김포공항 출발·도착 항공편 선택", answers: 3, board: "/gimpo-board/", overflow: false }, "planner should expose concise arrival answers without mobile overflow");
  assert.deepEqual(await evaluate(cdp, "() => [...document.querySelectorAll('.planner-links a')].map((link) => new URL(link.href).pathname)"), ["/gimpo/pickup/", "/gimpo/"], "planner should lead to booking guidance and the cookie hub");
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo2-mobile.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  await navigate(cdp, `${server.baseUrl}/gimpo2/?flight=RS901`);
  await waitFor(cdp, "() => document.getElementById('g2-flight-number')?.textContent === 'RS901'", "Gimpo2 flight query should select a departure");
  const gimpo2Departure = await evaluate(cdp, "() => ({ kind: document.getElementById('g2-pickup-card').dataset.kind, board: document.getElementById('g2-selected-board').getAttribute('href'), actionCount: document.querySelectorAll('#g2-pickup-action a').length })");
  assert.deepEqual(gimpo2Departure, { kind: "DEPARTED", board: "/gimpo-board/?flight=RS901", actionCount: 0 }, "departed flights must not suggest pickup");
  await navigate(cdp, `${server.baseUrl}/gimpo2/?flight=TW922`);
  await waitFor(cdp, "() => document.getElementById('g2-flight-number')?.textContent === 'TW922'", "Gimpo2 flight query should also select an arrival");
  const gimpo2Arrival = await evaluate(cdp, "() => ({ tab: document.getElementById('g2-arrival-tab').getAttribute('aria-selected'), kind: document.getElementById('g2-pickup-card').dataset.kind, countdown: document.getElementById('g2-countdown').textContent, timelineHidden: document.getElementById('g2-timeline').hidden })");
  assert.deepEqual(gimpo2Arrival, { tab: "true", kind: "ARRIVAL", countdown: "", timelineHidden: true }, "arrivals should show a nearby-cookie message without pickup timing");
  const pickupMath = await evaluate(cdp, "() => { const base = { type:'departure', scheduledTime:'15:00', revisedTime:null, status:{ en:'ON TIME' } }; const meta = { live:true, stale:false, updatedAt:'2026-09-28T12:00:00+09:00' }; const now = new Date('2026-09-28T12:00:00+09:00'); const calculate = (time) => window.NmGimpoFlights.pickupPlan({ ...base, scheduledTime:time },meta,now).kind; return { plenty:calculate('15:00'), available:calculate('14:00'), quick:calculate('13:30'), avoid:calculate('13:29'), revised:window.NmGimpoFlights.pickupPlan({ ...base, revisedTime:'13:29' },meta,now).kind, stale:window.NmGimpoFlights.pickupPlan(base,{ ...meta,stale:true },now).kind, cancelled:window.NmGimpoFlights.pickupPlan({ ...base,status:{ en:'CANCELLED' } },meta,now).kind }; }");
  assert.deepEqual(pickupMath, { plenty:"PLENTY", available:"AVAILABLE", quick:"QUICK", avoid:"NOT_RECOMMENDED", revised:"NOT_RECOMMENDED", stale:"UNAVAILABLE", cancelled:"CANCELLED" });
  const boardClock = await cdp.command("Page.addScriptToEvaluateOnNewDocument", { source: "(() => { const NativeDate = Date; function FixedDate(...args) { return args.length ? new NativeDate(...args) : new NativeDate('2026-09-28T06:30:00+09:00'); } FixedDate.now = () => new NativeDate('2026-09-28T06:30:00+09:00').getTime(); FixedDate.parse = NativeDate.parse; FixedDate.UTC = NativeDate.UTC; FixedDate.prototype = NativeDate.prototype; window.Date = FixedDate; })();" });
  await navigate(cdp, `${server.baseUrl}/gimpo-board/?flight=RS901`);
  await waitFor(cdp, "() => document.getElementById('flight-detail')?.open", "board flight query should open the matching detail");
  assert.equal(await evaluate(cdp, "() => document.getElementById('detail-pickup-link').getAttribute('href')"), "/gimpo2/?flight=RS901", "board detail should carry the selected flight into Gimpo2");
  assert.equal(await evaluate(cdp, "() => [...document.querySelectorAll('#detail-fields dt')].some((item) => item.textContent === '게이트')"), true, "mobile flight detail should retain gate information when provided");
  await setViewport(cdp, 390);
  await navigate(cdp, `${server.baseUrl}/gimpo-board/`);
  await waitFor(cdp, "() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length === 4", "Gimpo departures should load from the mocked provider");
  assert.equal(await evaluate(cdp, "() => document.querySelectorAll('#board-loader .flap-bank').length"), 3, "initial airport loader should use three flap banks");
  await waitFor(cdp, "() => document.getElementById('board-loader').hidden", "first-load airport loader should finish");
  await waitFor(cdp, "() => performance.getEntriesByName('gimpo-board-initial-flip').length === 1", "first board load should begin the mechanical reveal");
  const revealStart = await evaluate(cdp, "() => { const blank = performance.getEntriesByName('gimpo-board-initial-blank')[0]; const flip = performance.getEntriesByName('gimpo-board-initial-flip')[0]; return { blank: blank?.detail, changed: flip?.detail.changedSlots, gap: flip.startTime - blank.startTime }; }");
  assert.deepEqual(revealStart.blank, { rows: 4, blankSlots: 128, slots: 128 }, "first render must construct blank physical banks before setting values");
  assert.ok(revealStart.changed > 0 && revealStart.gap > 0 && revealStart.gap < 150, `first reveal should animate visible slots promptly: ${JSON.stringify(revealStart)}`);
  await waitFor(cdp, "() => document.querySelectorAll('#flight-rows .flap-slot.is-flipping').length > 0", "first entrance should visibly flip physical slots");
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo-board-initial-flip.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  await waitFor(cdp, "() => performance.getEntriesByName('gimpo-board-initial-settled').length === 1 && !document.querySelector('#flight-rows .flap-slot.is-flipping')", "first entrance should settle within its budget");
  const revealTiming = await evaluate(cdp, "() => performance.getEntriesByName('gimpo-board-initial-settled')[0].startTime - performance.getEntriesByName('gimpo-board-initial-blank')[0].startTime");
  assert.ok(revealTiming <= 1400, `initial physical reveal must finish within 1.4 seconds, got ${revealTiming}ms`);
  const boardMobile = await evaluate(cdp, "() => { const row = [...document.querySelectorAll('#flight-rows tr[data-flight-id]')].find((item) => item.querySelector('.flight-number')?.getAttribute('aria-label').includes('RS901')); const route = row.querySelector('[data-field=route]'); const slot = route.querySelector('.flap-slot'); const sweet = document.querySelector('.board-marquee-copy p'); return { title: document.querySelector('h1')?.textContent.trim(), rows: document.querySelectorAll('#flight-rows tr[data-flight-id]').length, columns: [...document.querySelectorAll('.flight-table th')].filter((th) => getComputedStyle(th).display !== 'none').map((th) => th.textContent.trim()), links: [...document.querySelectorAll('.brand-actions a')].map((a) => new URL(a.href).pathname), route: route.querySelector('.flap-bank').dataset.value, routeKorean: route.querySelector('.route-korean').textContent, halves: [...slot.children].map((part) => part.className), grid: getComputedStyle(row).display, sound: document.getElementById('board-sound').getAttribute('aria-pressed'), headerHeight: document.querySelector('.board-header').getBoundingClientRect().height, boardTop: document.querySelector('.board-shell').getBoundingClientRect().top, sweetFlow: getComputedStyle(sweet).position === 'static', sweetOffset: sweet.getBoundingClientRect().top - document.querySelector('.board-marquee-title-line').getBoundingClientRect().bottom, planeFilter: getComputedStyle(document.querySelector('.board-plane-departure')).filter, searchInControls: Boolean(document.querySelector('.board-controls #flight-search')), documentWidth: document.documentElement.scrollWidth, viewport: innerWidth }; }");
  assert.equal(boardMobile.title, "김포공항 도착정보·출발정보 실시간 항공편");
  assert.equal(boardMobile.rows, 4);
  assert.deepEqual(boardMobile.columns, ["FLIGHT", "DESTINATION"], `board mobile columns at viewport ${boardMobile.viewport}`);
  assert.deepEqual(boardMobile.links, ["/gimpo2/", "/gimpo/"]);
  assert.deepEqual([boardMobile.route, boardMobile.routeKorean], ["JEJU", "제주 · CJU"], "English destination should be the main mechanical value with Korean and provider code below");
  assert.deepEqual(boardMobile.halves, ["flap-static-top", "flap-static-bottom", "flap-flip-top", "flap-flip-bottom", "flap-hinge"]);
  assert.equal(boardMobile.grid, "grid", "mobile board rows should use a physical two-line grid");
  assert.equal(boardMobile.sound, "false", "mechanical sound must default to OFF");
  assert.ok(boardMobile.headerHeight >= 90 && boardMobile.headerHeight <= 130 && boardMobile.boardTop < 20, `yellow reference marquee must sit inside the board frame: header=${boardMobile.headerHeight}, boardTop=${boardMobile.boardTop}`);
  assert.equal(boardMobile.sweetFlow, true, "mobile sweet-flight copy should stay in the compact marquee flow");
  assert.ok(boardMobile.sweetOffset >= 0 && boardMobile.sweetOffset <= 12, `mobile sweet-flight copy should sit close to the title: offset=${boardMobile.sweetOffset}`);
  assert.match(boardMobile.planeFilter, /invert/);
  assert.equal(boardMobile.searchInControls, false, "search must not dominate the board controls");
  assert.equal(await evaluate(cdp, "() => document.querySelector('.board-shell').firstElementChild?.className === 'board-header' && document.getElementById('board-marquee-title').textContent === 'DEPARTURE'"), true, "the yellow departure marquee must be the first section inside the physical frame");
  assert.equal(await evaluate(cdp, "() => getComputedStyle(document.querySelector('.board-plane-departure')).display !== 'none' && getComputedStyle(document.querySelector('.board-plane-arrival')).display === 'none'"), true, "departure marquee must show the departure plane icon");
  const fixedMobileBanks = await evaluate(cdp, "() => { const row = [...document.querySelectorAll('#flight-rows tr[data-flight-id]')].find((item) => item.querySelector('.flight-number')?.getAttribute('aria-label').includes('RS901')); return Object.fromEntries(['flight','route','time','status'].map((field) => { const bank = row.querySelector(`[data-field=${field}] .flap-bank`); return [field, { width: bank.children.length, blanks: [...bank.children].filter((slot) => slot.dataset.char === ' ').length }]; })); }");
  assert.deepEqual(Object.fromEntries(Object.entries(fixedMobileBanks).map(([field, bank]) => [field, bank.width])), { flight: 7, route: 11, time: 5, status: 9 }, "mobile banks should use compact physical widths");
  assert.equal(fixedMobileBanks.route.blanks, 7, "JEJU must be followed by seven real blank flap slots");
  const fixedUpdate = await evaluate(cdp, "() => { const bank = window.NmSplitFlap.createFlapBank('ABCDEFG', '', 7); window.NmSplitFlap.setFlapValue(bank, 'AB', { animate: false }); const shorter = { width: bank.children.length, blanks: [...bank.children].filter((slot) => slot.dataset.char === ' ').length }; window.NmSplitFlap.setFlapValue(bank, 'ABCDEFGHI', { animate: false }); return { shorter, longer: { width: bank.children.length, visible: [...bank.children].map((slot) => slot.dataset.char).join(''), label: bank.getAttribute('aria-label') } }; }");
  assert.deepEqual(fixedUpdate, { shorter: { width: 7, blanks: 5 }, longer: { width: 7, visible: "ABCDEFG", label: "ABCDEFGHI" } }, "shorter and longer updates must not remove or append physical slots");
  const mobileHousing = await evaluate(cdp, "() => { const rows = [...document.querySelectorAll('#flight-rows tr[data-flight-id]')]; const first = rows[0]; const second = rows[1]; const style = getComputedStyle(first); const hinge = first.querySelector('.flap-hinge'); return { sameHousing: rows.every((row) => row.closest('.board-shell') === first.closest('.board-shell')), gap: second.getBoundingClientRect().top - first.getBoundingClientRect().bottom, margin: style.marginBottom, radius: style.borderRadius, shadow: style.boxShadow, divider: parseFloat(style.borderBottomWidth), gutterColor: getComputedStyle(document.getElementById('flight-rows')).backgroundColor, hinge: hinge.getBoundingClientRect().height }; }");
  assert.equal(mobileHousing.sameHousing, true, "mobile flights must share one physical board housing");
  assert.ok(mobileHousing.gap >= 6 && mobileHousing.gap <= 8 && mobileHousing.margin === "7px" && mobileHousing.radius === "0px" && mobileHousing.shadow === "none", `mobile flights need a recessed physical gutter, not cards: ${JSON.stringify(mobileHousing)}`);
  assert.ok(mobileHousing.divider === 0 && mobileHousing.gutterColor === "rgb(2, 2, 2)" && mobileHousing.hinge === 1, "flight records must have no drawn divider and exactly 1px flap hinges");
  const flapTypography = await evaluate(cdp, "() => { const slot = document.querySelector('#flight-rows [data-field=flight] .flap-slot'); const top = slot.querySelector('.flap-static-top .flap-glyph').getBoundingClientRect(); const bottom = slot.querySelector('.flap-static-bottom .flap-glyph').getBoundingClientRect(); const bounds = slot.getBoundingClientRect(); const hinge = slot.querySelector('.flap-hinge').getBoundingClientRect(); const status = document.querySelector('#flight-rows [data-field=status] .flap-slot'); const visibleSlots = [...document.querySelectorAll('#flight-rows .flap-slot')]; const allHingesOnePx = visibleSlots.every((item) => Math.round(item.querySelector('.flap-hinge').getBoundingClientRect().height) === 1); const allGlyphsFit = visibleSlots.every((item) => { const itemBounds = item.getBoundingClientRect(); const itemTop = item.querySelector('.flap-static-top .flap-glyph').getBoundingClientRect(); const itemBottom = item.querySelector('.flap-static-bottom .flap-glyph').getBoundingClientRect(); return itemTop.top >= itemBounds.top - 1 && itemBottom.bottom <= itemBounds.bottom + 1; }); return { font: getComputedStyle(slot).fontFamily, loaded: document.fonts.check('900 20px NmBoardDisplay'), statusColor: getComputedStyle(status).color, glyphOffset: Math.abs(top.top - bottom.top), hingeOffset: Math.abs((hinge.top + hinge.height / 2) - (bounds.top + bounds.height / 2)), glyphFits: top.top >= bounds.top - 1 && bottom.bottom <= bounds.bottom + 1, allHingesOnePx, allGlyphsFit }; }");
  assert.ok(flapTypography.font.includes("NmBoardDisplay") && flapTypography.loaded, "board slots should use the board-specific loaded display face");
  assert.equal(flapTypography.statusColor, "rgb(255, 206, 0)", "every flight status should use airport yellow");
  assert.ok(flapTypography.glyphOffset <= 1 && flapTypography.hingeOffset <= 1 && flapTypography.glyphFits && flapTypography.allHingesOnePx && flapTypography.allGlyphsFit, "top and bottom must show the same complete glyph split at the slot center");
  assert.equal(await evaluate(cdp, "() => !document.querySelector('#flight-rows tr[data-flight-id] [data-field=gate]') && getComputedStyle(document.querySelector('.flight-table th:nth-child(4)')).display === 'none'"), true, "mobile gate should move to flight detail rather than crowd the board");
  assert.equal(await evaluate(cdp, "() => Boolean(document.querySelector('.board-panel-top .board-clock')) && !document.querySelector('.board-header .board-clock')"), true, "Korea time belongs inside the physical board");
  assert.deepEqual(await evaluate(cdp, "() => window.NmSplitFlap.getSoundState()"), { enabled: false, contextCreated: false }, "sound must not initialise automatically");
  assert.equal(await evaluate(cdp, "() => document.getElementById('board-badge').textContent.trim()"), "GMP · LIVE", "fresh provider data must set the live badge");
  const revisedTimeDisplay = await evaluate(cdp, "() => { const rows = [...document.querySelectorAll('#flight-rows tr[data-flight-id]')]; const changed = rows.find((row) => row.querySelector('.flight-number')?.getAttribute('aria-label').includes('RS901')); const unchanged = rows.find((row) => row.querySelector('.flight-number')?.getAttribute('aria-label').includes('JL090')); const time = changed.querySelector('[data-field=time]'); const label = changed.querySelector('.scheduled-time'); const next = rows[rows.indexOf(changed) + 1]; return { current: time.querySelector('.flap-bank').dataset.value, original: label.textContent, warning: getComputedStyle(time.querySelector('.flap-slot')).color, labelColor: getComputedStyle(label).color, labelFont: parseFloat(getComputedStyle(label).fontSize), labelWeight: Number(getComputedStyle(label).fontWeight), labelFits: label.getBoundingClientRect().bottom <= changed.getBoundingClientRect().bottom + 1, nextGap: next.getBoundingClientRect().top - changed.getBoundingClientRect().bottom, aria: time.getAttribute('aria-label'), unchangedHasLabel: Boolean(unchanged.querySelector('.scheduled-time')), unchangedTimeColor: getComputedStyle(unchanged.querySelector('[data-field=time] .flap-slot')).color }; }");
  assert.deepEqual([revisedTimeDisplay.current, revisedTimeDisplay.original, revisedTimeDisplay.unchangedHasLabel], ["06:15", "기존 06:00", false], "only genuinely revised flights should render the original scheduled time");
  assert.ok(revisedTimeDisplay.warning === "rgb(255, 101, 79)" && revisedTimeDisplay.labelColor === "rgb(170, 170, 170)" && revisedTimeDisplay.unchangedTimeColor !== revisedTimeDisplay.warning, `only the current revised time should be red-orange: ${JSON.stringify(revisedTimeDisplay)}`);
  assert.ok(revisedTimeDisplay.labelFont >= 8 && revisedTimeDisplay.labelFont <= 9 && revisedTimeDisplay.labelWeight >= 400 && revisedTimeDisplay.labelWeight <= 500 && revisedTimeDisplay.labelFits && revisedTimeDisplay.nextGap >= 6 && revisedTimeDisplay.aria.includes('기존 06:00'), `original time must be a small secondary line inside its flight record: ${JSON.stringify(revisedTimeDisplay)}`);
  assert.ok(boardMobile.documentWidth <= boardMobile.viewport, "Gimpo board must not overflow at 390px");
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo-board-mobile.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  const providerCalls = flightProvider.state.calls.length;
  assert.equal(providerCalls, 4, "browser traffic should share one four-stream provider cache refresh");
  for (const [width, height] of [[320,720], [360,800], [375,812], [390,844], [430,932]]) {
    await setViewport(cdp, width, height);
    const fitted = await evaluate(cdp, "() => { const shell = document.querySelector('.board-shell').getBoundingClientRect(); const banks = [...document.querySelectorAll('#flight-rows .flap-bank')]; const title = document.getElementById('board-marquee-title'); const logo = document.querySelector('.board-logo'); const tagline = document.querySelector('.board-marquee-copy p'); const row = document.querySelector('#flight-rows tr[data-flight-id]'); const heading = document.querySelector('.flight-table th'); const label = document.querySelector('.airline-name'); const bankFits = banks.every((bank) => { const cell = bank.closest('td').getBoundingClientRect(); const rect = bank.getBoundingClientRect(); return rect.left >= cell.left - 1 && rect.right <= cell.right + 1 && rect.right <= innerWidth; }); const glyphFits = banks.every((bank) => [...bank.querySelectorAll('.flap-slot')].filter((slot) => slot.dataset.char !== ' ').every((slot) => { const glyph = slot.querySelector('.flap-static-top .flap-glyph'); const range = document.createRange(); range.selectNodeContents(glyph); const text = range.getBoundingClientRect(); const rect = slot.getBoundingClientRect(); return text.left >= rect.left - 1 && text.right <= rect.right + 1 && parseFloat(getComputedStyle(slot).fontSize) <= rect.width * 1.4; })); const utilities = [...document.querySelectorAll('.board-utilities button')].filter((button) => getComputedStyle(button).display !== 'none'); const tabs = [...document.querySelectorAll('.board-tabs button')]; const slot = row.querySelector('[data-field=flight] .flap-slot'); return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bankFits, glyphFits, shellLeft: shell.left, shellRight: shell.right, rowHeight: row.getBoundingClientRect().height, slotHeight: slot.getBoundingClientRect().height, slotWidth: slot.getBoundingClientRect().width, labelFont: parseFloat(getComputedStyle(label).fontSize), labelWeight: Number(getComputedStyle(label).fontWeight), headingFont: parseFloat(getComputedStyle(heading).fontSize), tabHeights: tabs.map((button) => button.getBoundingClientRect().height), utilityHeights: utilities.map((button) => button.getBoundingClientRect().height), titleRight: title.getBoundingClientRect().right, logoLeft: logo.getBoundingClientRect().left, titleWeight: Number(getComputedStyle(title).fontWeight), taglineWeight: Number(getComputedStyle(tagline).fontWeight), airlineColor: getComputedStyle(label).color, routeColor: getComputedStyle(document.querySelector('.route-korean')).color, gridRows: getComputedStyle(row).gridTemplateRows, utilities: utilities.map((button) => button.id), utilityWidths: utilities.map((button) => button.getBoundingClientRect().width), statusVisible: getComputedStyle(document.querySelector('.board-status-line')).width, airlineLabel: label.textContent.trim(), routeLabel: document.querySelector('.route-korean').textContent.trim() }; }");
    assert.ok(fitted.documentWidth <= fitted.viewport && fitted.bankFits && fitted.glyphFits, `mobile physical slots must fit their cells and glyphs at ${width}px: ${JSON.stringify(fitted)}`);
    assert.ok(Math.abs(fitted.shellLeft) <= 1 && Math.abs(fitted.shellRight - width) <= 1, `physical frame must reach both viewport edges at ${width}px: ${JSON.stringify(fitted)}`);
    const mobileFlapFit = await evaluate(cdp, "() => { const row = document.querySelector('#flight-rows tr[data-flight-id]'); return Object.fromEntries(['flight','route','time','status'].map((field) => { const cell = row.querySelector(`[data-field=${field}]`); const bank = cell.querySelector('.flap-bank'); const slot = bank.firstElementChild; const last = bank.lastElementChild.getBoundingClientRect(); return [field, { slotWidth: slot.getBoundingClientRect().width, glyphSize: parseFloat(getComputedStyle(slot).fontSize), lastFits: last.right <= cell.getBoundingClientRect().right + 1, unclipped: bank.scrollWidth <= bank.clientWidth + 1 }]; })); }");
    assert.ok(Object.values(mobileFlapFit).every((field) => field.lastFits && field.unclipped), `every mobile physical slot must fit at ${width}px: ${JSON.stringify(mobileFlapFit)}`);
    if (width === 390) assert.ok(mobileFlapFit.flight.slotWidth >= 21 && mobileFlapFit.route.slotWidth >= 17 && mobileFlapFit.time.slotWidth >= 26 && mobileFlapFit.status.slotWidth >= 18 && mobileFlapFit.flight.glyphSize >= 28, `390px primary flap letters should occupy the board: ${JSON.stringify(mobileFlapFit)}`);
    assert.ok(fitted.slotHeight >= 44 && fitted.slotWidth >= 16 && fitted.labelWeight <= 500 && fitted.labelFont >= 8 && fitted.labelFont <= 9.5 && fitted.headingFont >= 11 && fitted.headingFont <= 13, `mobile flap and secondary text hierarchy must remain readable at ${width}px: ${JSON.stringify(fitted)}`);
    assert.ok(fitted.tabHeights.every((height) => height >= 44) && fitted.utilityHeights.every((height) => height >= 44), `mobile controls need 44px touch targets at ${width}px: ${JSON.stringify(fitted)}`);
    if (width === 390) assert.ok(fitted.rowHeight >= 122 && fitted.rowHeight <= 136, `390px rows should match the physical board reference density: ${JSON.stringify(fitted)}`);
    assert.deepEqual(fitted.utilities, ["board-search-open", "board-refresh"], `only search and refresh should be shown on mobile at ${width}px`);
    assert.ok(Math.abs(fitted.utilityWidths[0] - fitted.utilityWidths[1]) < 2, `mobile utilities should have equal width at ${width}px`);
    assert.equal(fitted.statusVisible, "1px", "fresh-state metadata should stay accessible without occupying mobile board space");
    assert.match(fitted.airlineLabel, / · (DOM|INT)$/);
    assert.match(fitted.routeLabel, / · [A-Z]{3}$/);
    assert.equal(fitted.airlineColor, "rgba(255, 207, 9, 0.8)", "airline label should use subdued airport yellow");
    assert.equal(fitted.routeColor, "rgba(255, 207, 9, 0.8)", "Korean route label should use subdued airport yellow");
    assert.ok(fitted.titleRight < fitted.logoLeft && fitted.titleWeight >= 800 && fitted.taglineWeight >= 800, `bold marquee text must fit beside the brand at ${width}px: ${JSON.stringify(fitted)}`);
    if (width === 320 || width === 360) fs.writeFileSync(`/private/tmp/nothingmatters-gimpo-board-mobile-${width}.png`, (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  }
  await setViewport(cdp, 320, 720);
  const glyphSamples = await evaluate(cdp, "() => { const host = document.createElement('div'); host.className = 'flight-table'; host.style.cssText = 'position:fixed;left:-1000px;top:0;width:300px'; document.body.append(host); const samples = [['flight','MWA801RS',8],['flight','RS901',7],['flight','KE111',7],['time','06:15',5],['route','JEJU',11],['route','BUSAN/PUS',11],['route','TOKYO/HND',11],['status','DEPARTED',9],['status','BOARDING',9],['status','DELAYED',9],['status','ARRIVED',9]]; const result = samples.map(([field,value,width]) => { const bank = window.NmSplitFlap.createFlapBank(value, `flap-bank--${field}`, width); host.append(bank); const fitted = [...bank.children].filter((slot) => slot.dataset.char !== ' ').every((slot) => { const glyph = slot.querySelector('.flap-static-top .flap-glyph'); const range = document.createRange(); range.selectNodeContents(glyph); const text = range.getBoundingClientRect(); const rect = slot.getBoundingClientRect(); return text.left >= rect.left - 1 && text.right <= rect.right + 1; }); bank.remove(); return { value, fitted }; }); host.remove(); return result; }");
  assert.ok(glyphSamples.every((sample) => sample.fitted), `all target flight letters and status strings must fit their physical slots at 320px: ${JSON.stringify(glyphSamples)}`);
  await setViewport(cdp, 375, 812);
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo-board-mobile-375.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  for (const [width, height] of [[320,720], [360,800], [375,812], [390,844], [430,932]]) {
    await setViewport(cdp, width, height);
    await evaluate(cdp, "() => { document.getElementById('board-search-open').click(); return true; }");
    const sheetFit = await evaluate(cdp, "() => { const sheet = document.getElementById('flight-search-sheet'); const rect = sheet.getBoundingClientRect(); const filters = [...sheet.querySelectorAll('.board-lines span')].map((item) => item.getBoundingClientRect()); const action = document.getElementById('board-search-done').getBoundingClientRect(); return { active: document.activeElement.id, left: rect.left, right: rect.right, bottom: rect.bottom, height: rect.height, viewport: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth, filterDelta: Math.max(...filters.map((item) => item.top)) - Math.min(...filters.map((item) => item.top)), filtersTall: filters.every((item) => item.height >= 44), inputFont: parseFloat(getComputedStyle(document.getElementById('flight-search')).fontSize), closeVisible: document.getElementById('board-search-close').getBoundingClientRect().right <= innerWidth, actionInside: action.bottom <= rect.bottom + 1, safePadding: parseFloat(getComputedStyle(sheet.querySelector('.search-sheet-body')).paddingBottom), pageLocked: getComputedStyle(document.documentElement).overflow === 'hidden' }; }");
    assert.ok(sheetFit.active !== "flight-search" && sheetFit.left >= 3 && sheetFit.right <= width - 3 && sheetFit.bottom <= height + 1 && sheetFit.height <= height * .7 + 2 && sheetFit.documentWidth <= width, `mobile search should fit at ${width}px: ${JSON.stringify(sheetFit)}`);
    assert.ok(sheetFit.filterDelta < 2 && sheetFit.filtersTall && sheetFit.inputFont >= 16 && sheetFit.closeVisible && sheetFit.actionInside && sheetFit.safePadding >= 14 && sheetFit.pageLocked, `mobile search controls should remain usable at ${width}px: ${JSON.stringify(sheetFit)}`);
    if (width === 320) {
      await evaluate(cdp, "() => { document.getElementById('flight-search').value = 'KEEP'; document.getElementById('board-search-close').click(); document.getElementById('board-search-open').click(); return true; }");
      assert.equal(await evaluate(cdp, "() => document.getElementById('flight-search').value"), "KEEP", "closing and reopening should preserve the pending query");
      await evaluate(cdp, "() => { document.getElementById('flight-search').value = ''; return true; }");
    }
    await evaluate(cdp, "() => { document.getElementById('board-search-close').click(); return true; }");
    await waitFor(cdp, "() => document.activeElement?.id === 'board-search-open'", "closing mobile search should restore focus");
  }
  await setViewport(cdp, 390);
  await evaluate(cdp, "() => { document.getElementById('board-search-open').click(); return true; }");
  assert.equal(await evaluate(cdp, "() => document.getElementById('flight-search-sheet').open"), true, "flight search should open a separate sheet");
  const searchSheetMobile = await evaluate(cdp, "() => { const sheet = document.getElementById('flight-search-sheet'); const bounds = sheet.getBoundingClientRect(); const input = document.getElementById('flight-search'); const filters = [...sheet.querySelectorAll('.board-lines span')].map((item) => item.getBoundingClientRect()); const action = document.getElementById('board-search-done'); return { active: document.activeElement.id, inputFont: parseFloat(getComputedStyle(input).fontSize), inputHeight: input.getBoundingClientRect().height, placeholder: input.placeholder, sheetHeight: bounds.height, sheetBottom: bounds.bottom, sheetLeft: bounds.left, sheetRight: bounds.right, backdropVisible: getComputedStyle(sheet,'::backdrop').backgroundColor !== 'rgba(0, 0, 0, 0)', filterRows: Math.max(...filters.map((item) => item.top)) - Math.min(...filters.map((item) => item.top)), filterHeights: filters.map((item) => item.height), actionInside: action.getBoundingClientRect().bottom <= bounds.bottom + 1, eyebrowHidden: getComputedStyle(sheet.querySelector('.search-sheet-head p')).display === 'none', infoHidden: getComputedStyle(sheet.querySelector('.search-sheet-body p')).display === 'none' }; }");
  assert.equal(searchSheetMobile.active, "board-search-close", "mobile sheet must not force keyboard focus");
  assert.ok(searchSheetMobile.inputFont >= 16 && searchSheetMobile.inputHeight >= 50, "mobile input must avoid iOS zoom and remain tappable");
  assert.equal(searchSheetMobile.placeholder, "편명 · 목적지 · 출발지 · 항공사");
  assert.ok(searchSheetMobile.sheetHeight <= 844 * .7 + 2 && searchSheetMobile.sheetLeft >= 3 && searchSheetMobile.sheetRight <= 387 && searchSheetMobile.actionInside && searchSheetMobile.backdropVisible, `mobile search sheet should stay within the lower viewport: ${JSON.stringify(searchSheetMobile)}`);
  assert.ok(searchSheetMobile.filterRows < 2 && searchSheetMobile.filterHeights.every((height) => height >= 44) && searchSheetMobile.eyebrowHidden && searchSheetMobile.infoHidden, "mobile filters must share one compact row without explanatory copy");
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo-board-search.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  await setViewport(cdp, 375, 812);
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo-board-search-375.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  assert.equal(await evaluate(cdp, "() => document.documentElement.scrollWidth <= innerWidth"), true, "375px search sheet must not overflow");
  await setViewport(cdp, 390, 844);
  await press(cdp, "Escape", 27);
  await waitFor(cdp, "() => !document.getElementById('flight-search-sheet').open && document.activeElement?.id === 'board-search-open'", "Escape should close mobile search and restore focus");
  await evaluate(cdp, "() => { document.getElementById('board-search-open').click(); return true; }");
  assert.equal(await evaluate(cdp, "() => document.activeElement.id"), "board-search-close", "reopened mobile sheet should leave keyboard closed");
  await evaluate(cdp, "() => { const input = document.getElementById('flight-search'); input.focus(); input.value = 'RS901'; input.dispatchEvent(new Event('input', { bubbles: true })); return true; }");
  assert.equal(await evaluate(cdp, "() => document.activeElement.id"), "flight-search", "the keyboard should open only after the user chooses the search input");
  await evaluate(cdp, "() => { document.getElementById('board-search-done').click(); return true; }");
  await waitFor(cdp, "() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length === 1", "search action should flush pending debounce and filter locally");
  assert.equal(await evaluate(cdp, "() => document.querySelectorAll('#flight-rows .flap-slot.is-flipping').length"), 0, "search must not replay mechanical flips");
  assert.equal(flightProvider.state.calls.length, providerCalls, "search keystrokes must not call the provider");
  assert.equal(await evaluate(cdp, "() => document.getElementById('flight-search-sheet').open"), false, "closing search should return to a clean board");
  await waitFor(cdp, "() => document.activeElement?.id === 'board-search-open'", "closing search should restore trigger focus");
  await evaluate(cdp, "() => { document.getElementById('board-search-open').click(); return true; }");
  await evaluate(cdp, "() => { const input = document.getElementById('flight-search'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('input[value=international]').click(); return true; }");
  assert.equal(await evaluate(cdp, "() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length"), 1, "international filter should work locally");
  await evaluate(cdp, "() => { document.getElementById('board-search-close').click(); return true; }");
  await evaluate(cdp, "() => { document.querySelector('input[value=all]').click(); document.getElementById('arrivals-tab').click(); return true; }");
  await waitFor(cdp, "() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length === 2 && document.getElementById('route-heading').textContent === 'ORIGIN'", "arrival board should show two origins");
  assert.equal(await evaluate(cdp, "() => document.querySelectorAll('#flight-rows .flap-slot.is-flipping').length"), 0, "tab switch must not replay entrance animation");
  assert.equal(await evaluate(cdp, "() => document.getElementById('board-marquee-title').textContent"), "ARRIVAL", "marquee must follow the selected flight direction");
  assert.equal(await evaluate(cdp, "() => getComputedStyle(document.querySelector('.board-plane-departure')).display === 'none' && getComputedStyle(document.querySelector('.board-plane-arrival')).display !== 'none'"), true, "arrival marquee must show the arrival plane icon");
  assert.equal(await evaluate(cdp, "() => document.getElementById('board-marquee-ko').textContent"), "도착", "Korean marquee label must follow arrivals");
  assert.deepEqual((await evaluate(cdp, "() => [...document.querySelectorAll('#flight-rows [data-field=route]')].map((cell) => [cell.querySelector('.flap-bank').dataset.value, cell.querySelector('.route-korean').textContent])")).sort(([left], [right]) => left.localeCompare(right)), [["BUSAN/PUS", "부산/김해 · PUS"], ["TOKYO/HND", "도쿄/하네다 · HND"]]);
  await waitFor(cdp, "() => !document.querySelector('#flight-rows .is-entering, #flight-rows .flap-slot.is-flipping')", "arrival screenshot should show settled flight rows");
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo-board-mobile-arrival.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  await evaluate(cdp, "() => { document.querySelector('#flight-rows .flight-number').focus(); document.querySelector('#flight-rows .flight-number').click(); return true; }");
  const openDetail = await evaluate(cdp, "() => ({ open: document.getElementById('flight-detail').open, gate: [...document.querySelectorAll('#detail-fields dt')].some((dt) => dt.textContent === '게이트'), focused: document.activeElement?.id })");
  assert.deepEqual(openDetail, { open: true, gate: false, focused: "detail-close" }, "arrival detail should open accessibly without an invented gate");
  await press(cdp, "Escape", 27);
  await waitFor(cdp, "() => !document.getElementById('flight-detail').open", "Escape should close flight detail");
  assert.equal(await evaluate(cdp, "() => document.activeElement?.classList.contains('flight-number')"), true, "closing detail should restore flight focus");
  await evaluate(cdp, "() => { document.getElementById('departures-tab').click(); return true; }");
  await waitFor(cdp, "() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length === 4", "departure tab should restore departure rows");
  assert.equal(await evaluate(cdp, "() => document.getElementById('board-marquee-title').textContent"), "DEPARTURE");
  await evaluate(cdp, "() => { const row = [...document.querySelectorAll('#flight-rows tr[data-flight-id]')].find((item) => item.querySelector('.flight-number')?.getAttribute('aria-label').includes('RS901')); row.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; }");
  await evaluate(cdp, "() => { const originalFetch = window.fetch.bind(window); window.__boardRevision = 1; window.__boardErrorMode = ''; window.fetch = async (...args) => { if (String(args[0]).includes('/api/gimpo-board/') && window.__boardErrorMode === 'checking') await new Promise((resolve) => { window.__boardRelease = resolve; }); if (window.__boardErrorMode === 'error' && String(args[0]).includes('/api/gimpo-board/')) throw new Error('simulated failure'); const response = await originalFetch(...args); if (!String(args[0]).includes('/api/gimpo-board/')) return response; const payload = await response.json(); if (window.__boardErrorMode === 'stale') { payload.meta.stale = true; payload.meta.live = false; } const row = payload.data.find((item) => item.flightNumber === 'RS901'); if (row) { row.revisedTime = window.__boardRevision === 1 ? '06:25' : '06:35'; row.status.en = window.__boardRevision === 1 ? 'DELAYED' : window.__boardRevision === 3 ? 'FINAL BOARDING' : window.__boardRevision === 4 ? 'MYSTERY SERVICE STATE' : 'BOARDING'; row.status.ko = window.__boardRevision === 1 ? '지연' : '탑승 중'; } return new Response(JSON.stringify(payload), { status: response.status, headers: { 'Content-Type': 'application/json' } }); }; return true; }");
  await evaluate(cdp, "() => { document.getElementById('board-refresh').click(); return true; }");
  await waitFor(cdp, "() => { const row = [...document.querySelectorAll('#flight-rows tr')].find((item) => item.querySelector('.flight-number')?.getAttribute('aria-label').includes('RS901')); return row?.querySelector('[data-field=time] .flap-bank').dataset.value === '06:25' && row.querySelector('[data-field=status] .flap-bank').dataset.value === 'DELAYED'; }", "manual refresh should update time and status immediately");
  const refreshed = await evaluate(cdp, "() => { const row = [...document.querySelectorAll('#flight-rows tr')].find((item) => item.querySelector('.flight-number')?.getAttribute('aria-label').includes('RS901')); return { time: [...row.querySelectorAll('[data-field=time] .flap-slot')].map((slot) => slot.dataset.char).join(''), status: [...row.querySelectorAll('[data-field=status] .flap-slot')].map((slot) => slot.dataset.char).join('').trimEnd(), scheduled: row.querySelector('.scheduled-time').textContent, flipping: document.querySelectorAll('#flight-rows .flap-slot.is-flipping').length, reveals: performance.getEntriesByName('gimpo-board-initial-flip').length }; }");
  assert.deepEqual(refreshed, { time: "06:25", status: "DELAYED", scheduled: "기존 06:00", flipping: 0, reveals: 1 }, "refresh should retain the original time without replaying the entrance");
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo-board-mobile-changed-time.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  await cdp.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await waitFor(cdp, "() => matchMedia('(prefers-reduced-motion: reduce)').matches", "browser should apply reduced-motion emulation");
  await evaluate(cdp, "() => { window.__boardRevision = 2; document.getElementById('board-refresh').click(); return true; }");
  await waitFor(cdp, "() => [...document.querySelectorAll('#flight-rows [data-field=time] .flap-bank')].some((bank) => bank.dataset.value === '06:35')", "reduced-motion refresh should update flight time");
  assert.equal(await evaluate(cdp, "() => document.querySelectorAll('.flap-slot.is-flipping').length"), 0, "reduced motion should disable mechanical sequence");
  assert.ok(await evaluate(cdp, "() => [...document.querySelectorAll('#flight-rows [data-field=status] .flap-bank')].some((bank) => bank.dataset.value === 'BOARDING')"), "reduced-motion status should settle directly");
  assert.equal(await evaluate(cdp, "() => { const bank = [...document.querySelectorAll('#flight-rows [data-field=status] .flap-bank')].find((item) => item.dataset.value === 'BOARDING'); return bank.children.length === 9 && bank.lastElementChild.dataset.char === ' '; }"), true, "mobile status updates must retain their ninth physical slot");
  await evaluate(cdp, "() => { window.__boardRevision = 3; document.getElementById('board-refresh').click(); return true; }");
  await waitFor(cdp, "() => [...document.querySelectorAll('#flight-rows [data-field=status]')].some((cell) => cell.querySelector('.flap-bank').dataset.value === 'BOARDING' && cell.getAttribute('aria-label').includes('FINAL BOARDING'))", "known long provider statuses should use a compact truthful label without losing the full accessible status");
  assert.equal(await evaluate(cdp, "() => document.querySelectorAll('#flight-rows .flap-slot.is-flipping').length"), 0, "normal refresh must stay still after the first entrance");
  await evaluate(cdp, "() => { window.__boardRevision = 4; document.getElementById('board-refresh').click(); return true; }");
  await waitFor(cdp, "() => [...document.querySelectorAll('#flight-rows [data-field=status]')].some((cell) => cell.querySelector('.flap-bank').dataset.value === 'CHECK' && cell.getAttribute('aria-label').includes('MYSTERY SERVICE STATE'))", "unknown long statuses should stay neutral and preserve the provider text accessibly");
  await cdp.command("Emulation.setEmulatedMedia", { features: [] });
  await evaluate(cdp, "() => { window.__boardErrorMode = 'checking'; document.getElementById('board-refresh').click(); return true; }");
  assert.equal(await evaluate(cdp, "() => document.getElementById('board-badge').textContent.trim()"), "GMP · CHECKING", "loading must not claim LIVE");
  await evaluate(cdp, "() => { window.__boardErrorMode = ''; window.__boardRelease(); return true; }");
  await waitFor(cdp, "() => !document.getElementById('board-refresh').disabled && document.getElementById('board-badge').textContent.includes('LIVE')", "fresh refresh should restore LIVE state");
  await evaluate(cdp, "() => { window.__boardErrorMode = 'stale'; document.getElementById('board-refresh').click(); return true; }");
  await waitFor(cdp, "() => document.getElementById('board-notice').textContent.includes('마지막으로 확인된')", "stale data notice should be shown");
  assert.equal(await evaluate(cdp, "() => document.getElementById('board-badge').textContent.trim()"), "GMP · STALE", "stale cache must not claim LIVE");
  await evaluate(cdp, "() => { window.__boardErrorMode = 'error'; document.getElementById('board-refresh').click(); return true; }");
  await waitFor(cdp, "() => !document.getElementById('board-refresh').disabled && document.getElementById('board-badge').textContent.includes('STALE')", "provider error should leave the cached board in STALE state");
  assert.match(await evaluate(cdp, "() => document.getElementById('board-live-state').textContent"), /TEMPORARILY UNAVAILABLE/);
  assert.equal(await evaluate(cdp, "() => document.getElementById('board-badge').textContent.trim()"), "GMP · STALE", "failed refresh with cached rows must show STALE");
  assert.equal(await evaluate(cdp, "() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length"), 4, "provider error should not erase board rows");
  const stickyHeading = await evaluate(cdp, "() => { const table = document.querySelector('.flight-table'); scrollTo({ top: table.getBoundingClientRect().top + scrollY + 70, behavior: 'instant' }); const rect = document.querySelector('.flight-table thead').getBoundingClientRect(); return { top: rect.top, position: getComputedStyle(document.querySelector('.flight-table thead')).position }; }");
  assert.ok(stickyHeading.position === "sticky" && Math.abs(stickyHeading.top) <= 2, `flight column headings should remain pinned during scroll: ${JSON.stringify(stickyHeading)}`);
  await cdp.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate(cdp, `${server.baseUrl}/gimpo-board/`);
  await waitFor(cdp, "() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length === 4", "reduced-motion board should load");
  assert.deepEqual(await evaluate(cdp, "() => ({ blank: performance.getEntriesByName('gimpo-board-initial-blank').length, flip: performance.getEntriesByName('gimpo-board-initial-flip').length, flipping: document.querySelectorAll('#flight-rows .flap-slot.is-flipping').length, route: document.querySelector('#flight-rows [data-field=route] .flap-bank').dataset.value })"), { blank: 0, flip: 0, flipping: 0, route: "TOKYO/HND" }, "reduced motion should render final board values without entrance animation");
  await cdp.command("Emulation.setEmulatedMedia", { features: [] });
  const blocker = await cdp.command("Page.addScriptToEvaluateOnNewDocument", { source: "const boardOriginalFetch = window.fetch.bind(window); window.fetch = (...args) => String(args[0]).includes('/api/gimpo-board/') ? Promise.reject(new Error('simulated failure')) : boardOriginalFetch(...args);" });
  await navigate(cdp, `${server.baseUrl}/gimpo-board/`);
  await waitFor(cdp, "() => Boolean(document.querySelector('#board-notice button'))", "no-cache failure should show a retry button");
  assert.equal(await evaluate(cdp, "() => document.getElementById('board-badge').textContent.trim()"), "GMP · OFFLINE", "initial API failure must show OFFLINE");
  await cdp.command("Page.removeScriptToEvaluateOnNewDocument", { identifier: blocker.identifier });
  await setViewport(cdp, 1280, 900);
  await navigate(cdp, `${server.baseUrl}/gimpo-board/`);
  await waitFor(cdp, "() => document.querySelectorAll('#flight-rows tr[data-flight-id]').length === 4", "desktop Gimpo board should load");
  await waitFor(cdp, "() => performance.getEntriesByName('gimpo-board-initial-settled').length === 1 && !document.querySelector('#flight-rows .flap-slot.is-flipping')", "desktop entrance should settle before visual review");
  const boardDesktop = await evaluate(cdp, "() => ({ columns: [...document.querySelectorAll('.flight-table th')].filter((th) => getComputedStyle(th).display !== 'none').map((th) => th.textContent.trim()), grid: getComputedStyle(document.querySelector('#flight-rows tr[data-flight-id]')).display, slots: document.querySelectorAll('#flight-rows .flap-slot').length, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth })");
  assert.deepEqual(boardDesktop.columns, ["FLIGHT", "DESTINATION", "TIME", "GATE", "STATUS"]);
  assert.deepEqual(await evaluate(cdp, "() => Object.fromEntries(['flight','route','time','gate','status'].map((field) => [field, document.querySelector(`#flight-rows tr[data-flight-id] [data-field=${field}] .flap-bank`)?.children.length]))"), { flight: 7, route: 16, time: 5, gate: 2, status: 10 }, "desktop bank widths and gate must remain unchanged");
  assert.equal(boardDesktop.grid, "grid", "desktop board should use mechanical grid rows");
  assert.ok(boardDesktop.slots > 0, "desktop board should contain physical flap slots");
  assert.ok(boardDesktop.documentWidth <= boardDesktop.viewport, "desktop Gimpo board must not overflow");
  const desktopMarquee = await evaluate(cdp, "() => { const title = document.getElementById('board-marquee-title'); const tagline = document.querySelector('.board-marquee-copy p'); const logo = document.querySelector('.board-logo'); return { title: title.textContent, titleRight: title.getBoundingClientRect().right, logoLeft: logo.getBoundingClientRect().left, headerHeight: document.querySelector('.board-header').getBoundingClientRect().height, taglineWeight: Number(getComputedStyle(tagline).fontWeight), titleWeight: Number(getComputedStyle(title).fontWeight) }; }");
  assert.ok(desktopMarquee.title === "DEPARTURE" && desktopMarquee.titleRight < desktopMarquee.logoLeft && desktopMarquee.headerHeight >= 180 && desktopMarquee.titleWeight >= 800 && desktopMarquee.taglineWeight >= 800, `desktop marquee should match the bold reference without overlap: ${JSON.stringify(desktopMarquee)}`);
  for (const width of [800, 1024, 1100]) {
    await setViewport(cdp, width);
    const marquee = await evaluate(cdp, "() => { const shell = document.querySelector('.board-shell').getBoundingClientRect(); const row = document.querySelector('#flight-rows tr[data-flight-id]'); const banksFit = [...row.querySelectorAll('.flap-bank')].every((bank) => bank.lastElementChild.getBoundingClientRect().right <= bank.closest('td').getBoundingClientRect().right + 1 && bank.scrollWidth <= bank.clientWidth + 1); return { titleRight: document.getElementById('board-marquee-title').getBoundingClientRect().right, logoLeft: document.querySelector('.board-logo').getBoundingClientRect().left, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, shellLeft: shell.left, shellRight: shell.right, banksFit }; }");
    assert.ok(marquee.titleRight < marquee.logoLeft && marquee.documentWidth <= marquee.viewport && Math.abs(marquee.shellLeft) <= 1 && Math.abs(marquee.shellRight - width) <= 1 && marquee.banksFit, `full-width desktop board and marquee must fit at ${width}px: ${JSON.stringify(marquee)}`);
  }
  await setViewport(cdp, 1280, 900);
  const desktopHousing = await evaluate(cdp, "() => { const rows = [...document.querySelectorAll('#flight-rows tr[data-flight-id]')]; const first = rows[0]; const second = rows[1]; const style = getComputedStyle(first); const slot = first.querySelector('[data-field=route] .flap-slot'); const hinge = slot.querySelector('.flap-hinge'); const shell = getComputedStyle(document.querySelector('.board-shell')); return { gap: second.getBoundingClientRect().top - first.getBoundingClientRect().bottom, margin: style.marginBottom, radius: style.borderRadius, shadow: style.boxShadow, divider: parseFloat(style.borderBottomWidth), rowHeight: first.getBoundingClientRect().height, slotWidth: slot.getBoundingClientRect().width, slotHeight: slot.getBoundingClientRect().height, hinge: hinge.getBoundingClientRect().height, slotRadius: parseFloat(getComputedStyle(slot).borderTopLeftRadius), slotShadow: getComputedStyle(slot).boxShadow, slotBackground: getComputedStyle(slot).backgroundImage, faceBackground: getComputedStyle(slot.querySelector('.flap-static-top')).backgroundImage, shellBackground: shell.backgroundImage, topShadow: getComputedStyle(slot.querySelector('.flap-static-top')).boxShadow, bottomShadow: getComputedStyle(slot.querySelector('.flap-static-bottom')).boxShadow, flight: first.querySelector('[data-field=flight] .flap-bank').dataset.value, route: first.querySelector('[data-field=route] .flap-bank').dataset.value, time: first.querySelector('[data-field=time] .flap-bank').dataset.value, status: first.querySelector('[data-field=status] .flap-bank').dataset.value }; }");
  assert.ok(desktopHousing.gap <= 1 && desktopHousing.margin === "0px" && desktopHousing.radius === "0px" && desktopHousing.shadow === "none", "desktop flights must form one continuous board, not cards");
  assert.ok(desktopHousing.divider <= 6 && desktopHousing.hinge === 1 && desktopHousing.topShadow === "none" && desktopHousing.bottomShadow === "none", "flaps must have a single 1px seam without face inset shadows");
  assert.ok(desktopHousing.slotRadius === 0 && desktopHousing.slotShadow !== "none" && desktopHousing.slotBackground.includes("linear-gradient") && desktopHousing.faceBackground.includes("linear-gradient") && desktopHousing.shellBackground.includes("repeating-linear-gradient"), "connected flap slots must retain the 3D texture treatment without individual card corners");
  const connectedFlaps = await evaluate(cdp, "() => { const bank = document.querySelector('#flight-rows [data-field=flight] .flap-bank'); const slots = [...bank.children]; const slot = slots[0]; const last = slots.at(-1); const hinge = slot.querySelector('.flap-hinge').getBoundingClientRect(); const bounds = slot.getBoundingClientRect(); const css = getComputedStyle(slot); return { gap: getComputedStyle(bank).gap, bankOverflow: getComputedStyle(bank).overflow, cellOverflow: getComputedStyle(bank.closest('td')).overflow, adjacentGap: slots[1].getBoundingClientRect().left - bounds.right, borderLeft: css.borderLeftWidth, borderRight: css.borderRightWidth, lastBorderRight: getComputedStyle(last).borderRightWidth, hingeInside: hinge.left >= bounds.left && hinge.right <= bounds.right, hingeHeight: hinge.height }; }");
  assert.ok(connectedFlaps.gap === "0px" && connectedFlaps.bankOverflow === "hidden" && connectedFlaps.cellOverflow === "hidden" && Math.abs(connectedFlaps.adjacentGap) <= 1 && connectedFlaps.borderLeft === "0px" && connectedFlaps.borderRight === "1px" && connectedFlaps.lastBorderRight === "0px" && connectedFlaps.hingeInside && connectedFlaps.hingeHeight === 1, "physical characters must form one continuous clipped bank with an internal 1px hinge");
  assert.ok(desktopHousing.rowHeight >= 70 && desktopHousing.rowHeight <= 86, "desktop rows should fit enlarged physical letters without card gaps");
  assert.ok(desktopHousing.slotWidth >= 23 && desktopHousing.slotWidth <= 28 && desktopHousing.slotHeight >= 49 && desktopHousing.slotHeight <= 58, "desktop physical slots should be larger without clipping");
  assert.deepEqual([desktopHousing.flight, desktopHousing.route, desktopHousing.time, desktopHousing.status], ["JL090", "TOKYO/HND", "06:00", "DEPARTED"], "primary row values must all use mechanical flap banks");
  const entranceStart = Date.now();
  await waitFor(cdp, "() => document.querySelectorAll('#flight-rows tr.is-entering').length === 0", "initial board entrance should settle");
  await waitFor(cdp, "() => document.getElementById('board-loader').hidden", "initial flight information loader should finish");
  assert.ok(Date.now() - entranceStart < 2000, "initial board entrance must finish within two seconds");
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo-board-desktop.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  await setViewport(cdp, 1440, 900);
  const fullDesktop = await evaluate(cdp, "() => { const shell = document.querySelector('.board-shell').getBoundingClientRect(); const row = document.querySelector('#flight-rows tr[data-flight-id]'); const banksFit = [...row.querySelectorAll('.flap-bank')].every((bank) => bank.lastElementChild.getBoundingClientRect().right <= bank.closest('td').getBoundingClientRect().right + 1 && bank.scrollWidth <= bank.clientWidth + 1); const flightSlot = row.querySelector('[data-field=flight] .flap-slot'); return { shellLeft: shell.left, shellRight: shell.right, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, flightSlotWidth: flightSlot.getBoundingClientRect().width, flightGlyphSize: parseFloat(getComputedStyle(flightSlot).fontSize), banksFit }; }");
  assert.ok(Math.abs(fullDesktop.shellLeft) <= 1 && Math.abs(fullDesktop.shellRight - fullDesktop.viewport) <= 1 && fullDesktop.documentWidth <= fullDesktop.viewport && fullDesktop.banksFit && fullDesktop.flightSlotWidth >= 34 && fullDesktop.flightGlyphSize >= 35, `1440px board should be full-bleed with larger letters: ${JSON.stringify(fullDesktop)}`);
  fs.writeFileSync("/private/tmp/nothingmatters-gimpo-board-desktop-1440.png", (await cdp.command("Page.captureScreenshot", { format: "png" })).data, "base64");
  await setViewport(cdp, 1280, 900);
  await evaluate(cdp, "() => { document.getElementById('board-sound').click(); return true; }");
  assert.equal(await evaluate(cdp, "() => localStorage.getItem('gimpoBoardSound')"), "on", "sound preference should persist only after user activation");
  await navigate(cdp, `${server.baseUrl}/gimpo-board/`);
  assert.equal(await evaluate(cdp, "() => document.getElementById('board-sound').getAttribute('aria-pressed')"), "true", "sound toggle should restore saved preference");
  assert.deepEqual(await evaluate(cdp, "() => window.NmSplitFlap.getSoundState()"), { enabled: true, contextCreated: false }, "restored preference must not auto-start Web Audio");
  await evaluate(cdp, "() => { document.getElementById('board-sound').click(); return true; }");
  assert.equal(await evaluate(cdp, "() => localStorage.getItem('gimpoBoardSound')"), "off");
  await cdp.command("Page.removeScriptToEvaluateOnNewDocument", { identifier: boardClock.identifier });

  const stickyProducts = [
    ["/products/cookie-flight/", "cookie-flight"],
    ["/products/airplane-cookie/", "airplane-cookie"],
    ["/cookie-crew/", "cookie-crew"]
  ];
  const productOrderUrls = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "data/site-pages.json"), "utf8")).products.map((product) => [product.primaryUrl, product.orderUrl]));
  for (const [pathname, orderUrl] of expectedOrderUrls) {
    assert.equal(productOrderUrls.get(pathname), orderUrl, `${pathname}: product orderUrl must match the dedicated order page`);
  }
  assert.deepEqual([productOrderUrls.get("/brookie/"), productOrderUrls.get("/out/"), productOrderUrls.get("/out/fortune/")], [
    "https://thingmattersreserve-production.up.railway.app/brookie",
    "https://thingmattersreserve-production.up.railway.app/cookies",
    "https://thingmattersreserve-production.up.railway.app/lucky?step=1"
  ], "other product order URLs must stay unchanged");
  await setViewport(cdp, 390);
  for (const [pathname, label] of stickyProducts) {
    await navigate(cdp, `${server.baseUrl}${pathname}`);
    await cdp.command("Runtime.evaluate", { expression: "window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })" });
    const mobileSticky = await evaluate(cdp, "() => { const nav = document.querySelector('.nm-product-sticky'); const buttons = [...(nav?.querySelectorAll('a') || [])]; const bounds = buttons.map((button) => button.getBoundingClientRect()); const navBounds = nav?.getBoundingClientRect(); const content = document.querySelector('footer') || document.querySelector('main'); return { disabled: document.body.hasAttribute('data-disable-kakao-float'), floatCount: document.querySelectorAll('.nm-float-icon, .nm-float-bubble, [data-kakao-float]').length, coupon: document.body.textContent.includes('채널추가하고 1,000원 쿠폰 받기'), legacyBuybar: document.querySelectorAll('.mobile-buybar').length, navCount: document.querySelectorAll('.nm-product-sticky').length, display: nav ? getComputedStyle(nav).display : '', columns: nav ? getComputedStyle(nav).gridTemplateColumns.trim().split(/\\s+/).length : 0, buttons: buttons.map((button) => ({ text: button.textContent.trim(), href: button.href, event: button.dataset.analyticsEvent, label: button.dataset.analyticsLabel, target: button.target, height: button.getBoundingClientRect().height })), sameRow: bounds.length === 2 && Math.abs(bounds[0].top - bounds[1].top) < 1 && Math.abs(bounds[0].width - bounds[1].width) < 1, contentBottom: content?.getBoundingClientRect().bottom || 0, stickyTop: navBounds?.top || 0, bodyPadding: parseFloat(getComputedStyle(document.body).paddingBottom), stickyHeight: navBounds?.height || 0, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth }; }");
    assert.equal(mobileSticky.disabled, true, `${pathname}: Kakao float should be disabled`);
    assert.equal(mobileSticky.floatCount, 0, `${pathname}: no floating Kakao widget should be injected`);
    assert.equal(mobileSticky.coupon, false, `${pathname}: coupon bubble copy should be absent`);
    assert.equal(mobileSticky.legacyBuybar, 0, `${pathname}: legacy buybar should be absent`);
    assert.equal(mobileSticky.navCount, 1, `${pathname}: exactly one sticky CTA should exist`);
    assert.equal(mobileSticky.display, "grid", `${pathname}: mobile sticky should be visible`);
    assert.equal(mobileSticky.columns, 2, `${pathname}: mobile sticky should have two columns`);
    assert.equal(mobileSticky.sameRow, true, `${pathname}: equal-width buttons should share a row`);
    assert.deepEqual(mobileSticky.buttons.map(({ text, href, event, label: buttonLabel, target }) => ({ text, href, event, label: buttonLabel, target })), [
      { text: "네이버예약", href: "https://m.place.naver.com/restaurant/1547319276/booking?entry=ple", event: "naver_booking_click", label, target: "_blank" },
      { text: "주문하기", href: expectedOrderUrls.get(pathname), event: "order_start", label, target: "_blank" }
    ], `${pathname}: sticky CTA links and analytics should match`);
    assert.ok(mobileSticky.buttons.every((button) => button.height >= 48), `${pathname}: buttons should have touch-friendly height`);
    assert.ok(mobileSticky.bodyPadding >= mobileSticky.stickyHeight, `${pathname}: body should reserve space for the sticky CTA`);
    assert.ok(mobileSticky.contentBottom <= mobileSticky.stickyTop + 1, `${pathname}: footer/content should not be obscured at the bottom (${mobileSticky.contentBottom} > ${mobileSticky.stickyTop})`);
    assert.ok(mobileSticky.documentWidth <= mobileSticky.viewport, `${pathname}: sticky CTA should not cause horizontal overflow`);
  }
  await setViewport(cdp, 1280, 900);
  for (const [pathname] of stickyProducts) {
    await navigate(cdp, `${server.baseUrl}${pathname}`);
    const desktopSticky = await evaluate(cdp, "() => ({ display: getComputedStyle(document.querySelector('.nm-product-sticky')).display, floatCount: document.querySelectorAll('.nm-float-icon, .nm-float-bubble, [data-kakao-float]').length })");
    assert.equal(desktopSticky.display, "none", `${pathname}: mobile sticky should be hidden on desktop`);
    assert.equal(desktopSticky.floatCount, 0, `${pathname}: Kakao float should also be absent on desktop`);
  }

  const knownWorkHrefs = [
    "/out/",
    "/guides/wedding-favor-cookie/",
    "/guides/corporate-event-cookie/",
    "/out/fortune/",
    "/products/brownie-cookie/"
  ];
  for (const width of MOBILE_WIDTHS) {
    await setViewport(cdp, width);
    await navigate(cdp, `${server.baseUrl}/works/`);
    await cdp.command("Runtime.evaluate", { expression: "document.querySelectorAll('.nm-work-card img').forEach((image) => { image.loading = 'eager'; })" });
    await waitFor(cdp, "() => [...document.querySelectorAll('.nm-work-card img')].every((image) => image.complete && image.naturalWidth > 0)", `works images should load at ${width}px`);
    const worksRuntime = await evaluate(cdp, "() => { const pathname = (href) => new URL(href, location.href).pathname; const cards = [...document.querySelectorAll('.nm-work-card')].map((card) => { const cta = card.querySelector('.nm-work-card-copy a'); const details = card.querySelector('.nm-work-card-details'); return { href: cta ? pathname(cta.href) : '', hasDetails: Boolean(details), detailsFits: !details || details.scrollWidth <= details.clientWidth, detailLabels: [...card.querySelectorAll('.nm-work-card-details dt')].map((label) => label.textContent.trim()), ctaHeight: cta?.getBoundingClientRect().height || 0 }; }); return { viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, answerFirst: Boolean(document.querySelector('#works-answer-first')), faqCount: document.querySelectorAll('.nm-works-faq details').length, nextOrder: Boolean(document.querySelector('#works-next-order-title')), nextOrderHrefs: [...document.querySelectorAll('.nm-works-next-order-grid a')].map((link) => pathname(link.href)), cards }; }");
    assert.equal(worksRuntime.answerFirst, true, `works should expose answer-first context at ${width}px`);
    assert.equal(worksRuntime.faqCount, 3, `works should expose three FAQ entries at ${width}px`);
    assert.equal(worksRuntime.nextOrder, true, `works runtime should include NEXT ORDER at ${width}px`);
    for (const href of ["/bulk/", "/pickup/", "/magok-cookie/"]) {
      assert.ok(worksRuntime.nextOrderHrefs.includes(href), `works runtime should link to ${href} at ${width}px`);
    }
    const knownCards = worksRuntime.cards.filter((card) => knownWorkHrefs.includes(card.href));
    assert.equal(knownCards.length, knownWorkHrefs.length, `works runtime should render every default known card at ${width}px`);
    assert.ok(knownCards.every((card) => card.hasDetails), `known work cards should render metadata at ${width}px`);
    assert.ok(knownCards.every((card) => card.detailsFits), `works metadata details should fit within their cards at ${width}px`);
    assert.ok(knownCards.every((card) => card.detailLabels.every((label, index) => ["용도", "관련 제품", "지역/행사 유형", "포장 또는 문구 여부", "수령 방식"].indexOf(label) >= (index ? ["용도", "관련 제품", "지역/행사 유형", "포장 또는 문구 여부", "수령 방식"].indexOf(card.detailLabels[index - 1]) : -1))), `works metadata should keep its standard order at ${width}px`);
    assert.ok(knownCards.every((card) => card.ctaHeight >= 44), `known work card CTAs should be at least 44px at ${width}px`);
    assert.ok(worksRuntime.documentWidth <= worksRuntime.viewport && worksRuntime.bodyWidth <= worksRuntime.viewport, `works runtime should not horizontally overflow at ${width}px`);
  }

  await setViewport(cdp, 390);
  await navigate(cdp, `${server.baseUrl}/magok-cookie/`);
  const magokState = await evaluate(cdp, "() => ({ h1: document.querySelector('h1')?.textContent.trim() || '', cards: document.querySelectorAll('#cookies .magok-product-card').length, favorGuide: document.querySelectorAll('#magok-favor-guide .magok-favor-guide-card').length, companyChoice: document.querySelectorAll('#magok-company-choice .magok-company-choice-card').length, corporate: [...document.querySelectorAll('a[href]')].some((link) => new URL(link.href).pathname === '/guides/corporate-event-cookie/'), pickup: [...document.querySelectorAll('a[href]')].some((link) => new URL(link.href).pathname === '/pickup/'), kakao: [...document.querySelectorAll('a[href]')].some((link) => link.href.includes('pf.kakao.com/_QdCaK/chat')), faq: document.querySelectorAll('#faq .magok-faq-list details').length, quickNav: Boolean(document.querySelector('.magok-quick-nav')), floats: document.querySelectorAll('.magok-float-stack a').length, address: document.body.textContent.includes('서울특별시 강서구 송정로 25 1층'), locationContext: document.body.textContent.includes('마곡 인근') })");
  assert.deepEqual(magokState, { h1: "마곡 답례품·쿠키 선물을 찾고 있다면공항동에서 만들어 가까이 전해드려요", cards: 6, favorGuide: 3, companyChoice: 4, corporate: true, pickup: true, kakao: true, faq: 8, quickNav: true, floats: 2, address: true, locationContext: true }, "magok cookie hub should expose the local ordering path");
  await waitFor(cdp, "() => { const gallery = document.querySelector('[data-live-gallery-preview]'); return gallery?.dataset.gallerySource === 'fallback' && gallery.querySelectorAll('.nm-live-archive-preview').length === 3; }", "magok should render the shared live archive preview");
  await cdp.command("Runtime.evaluate", { expression: "document.querySelectorAll('.magok-proof img').forEach((image) => { image.loading = 'eager'; })" });
  await waitFor(cdp, "() => [...document.querySelectorAll('.magok-proof img')].every((image) => image.complete && image.naturalWidth > 0)", "magok proof images should load");
  const magokAuthority = await evaluate(cdp, "() => { const gallery = document.querySelector('[data-live-gallery-preview]'); const previewLinks = [...gallery.querySelectorAll('.nm-live-archive-preview')].map((link) => { const url = new URL(link.href); return { pathname: url.pathname, hash: url.hash }; }); return { breadcrumb: document.querySelector('.magok-visible-breadcrumb')?.textContent.trim() || '', answer: document.querySelector('.magok-answer-first')?.textContent || '', gallerySource: gallery?.dataset.gallerySource || '', previewLinks, rail: { overflowX: gallery ? getComputedStyle(gallery).overflowX : '', scrollWidth: gallery?.scrollWidth || 0, clientWidth: gallery?.clientWidth || 0 }, proofImages: [...document.querySelectorAll('.magok-proof img')].map((image) => { const rect = image.getBoundingClientRect(); return { loaded: Boolean(image.naturalWidth && image.naturalHeight), objectFit: getComputedStyle(image).objectFit, right: rect.right, ratio: rect.width / rect.height }; }), archiveHref: document.querySelector('.magok-proof .magok-action-row a[href=\"../#actual-cases\"]')?.getAttribute('href') || '', worksHref: document.querySelector('.magok-proof .magok-action-row a[href=\"../works/\"]')?.getAttribute('href') || '', documentWidth: document.documentElement.scrollWidth, naverPlace: [...document.querySelectorAll('a[href]')].some((link) => link.getAttribute('href') === 'https://naver.me/Gsj2pwAu') }; }");
  assert.match(magokAuthority.breadcrumb, /홈\s*\/\s*마곡 답례품·쿠키 선물/);
  assert.match(magokAuthority.answer, /마곡에서 쿠키 답례품이나 회사 선물을 찾는다면/);
  assert.match(magokAuthority.answer, /마곡 회사 답례품을 준비한다면 행사 날짜, 필요한 수량, 선물 목적을 먼저 정한 뒤/);
  assert.equal(magokAuthority.gallerySource, "fallback", "magok preview should use the same archive fallback as the homepage when no uploads exist");
  assert.deepEqual(magokAuthority.previewLinks, Array.from({ length: 3 }, () => ({ pathname: "/", hash: "#actual-cases" })), "magok archive cards should point to the homepage production archive");
  assert.equal(magokAuthority.archiveHref, "../#actual-cases");
  assert.equal(magokAuthority.worksHref, "../works/");
  assert.ok(magokAuthority.proofImages.length === 3 && magokAuthority.proofImages.every((image) => image.loaded && image.objectFit === 'cover' && image.ratio >= 1.45 && image.ratio <= 1.55), "magok proof images should use compact cover crops on mobile");
  assert.equal(magokAuthority.rail.overflowX, "auto", "magok production archive should scroll inside its own mobile rail");
  assert.ok(magokAuthority.rail.scrollWidth > magokAuthority.rail.clientWidth && magokAuthority.proofImages[0].right <= 390 && magokAuthority.documentWidth <= 390, "magok production archive should reduce vertical pressure without page overflow");
  assert.equal(magokAuthority.naverPlace, true, "magok should expose the official Naver Place link");
  await navigate(cdp, `${server.baseUrl}/products/cookie-flight/`);
  const cookieFlightState = await evaluate(cdp, "() => { const pathname = (href) => new URL(href, location.href).pathname; const hero = document.querySelector('.hero-photo img'); return { flavors: [...document.querySelectorAll('#flavors .flavor-card h3')].map((item) => item.textContent.trim()), links: [...document.querySelectorAll('nav[aria-label=\"관련 안내\"] a')].map((link) => pathname(link.href)), price: document.querySelector('.hero-price')?.textContent.replace(/\\s+/g, '').trim() || '', heroLoaded: hero?.complete && hero.naturalWidth > 0, inAirportClaim: document.body.textContent.includes('김포공항 내부 매장'), documentWidth: document.documentElement.scrollWidth, viewport: window.innerWidth }; }");
  assert.deepEqual(cookieFlightState.flavors, ["클래식버터", "더블초코", "제주말차", "오렌지"], "COOKIE FLIGHT should visibly list its four flavors");
  assert.deepEqual(cookieFlightState.links, ["/pickup/", "/magok-cookie/", "/works/"], "COOKIE FLIGHT should connect pickup, magok, and works flows");
  assert.equal(cookieFlightState.price, "16,000원", "COOKIE FLIGHT should show the supplied 16,000원 price");
  assert.equal(cookieFlightState.heroLoaded, true, "COOKIE FLIGHT hero image should load");
  assert.equal(cookieFlightState.inAirportClaim, false, "COOKIE FLIGHT should not imply an in-airport shop");
  assert.ok(cookieFlightState.documentWidth <= cookieFlightState.viewport, "COOKIE FLIGHT should not horizontally overflow on mobile");
  assert.equal(await evaluate(cdp, "() => [...document.querySelectorAll('a')].find((link) => link.textContent.trim() === '카카오톡 문의')?.href"), "https://pf.kakao.com/_QdCaK/chat", "COOKIE FLIGHT Kakao consultation must remain available");
  await navigate(cdp, `${server.baseUrl}/products/airplane-cookie/`);
  const airplaneState = await evaluate(cdp, "() => { const hero = document.querySelector('.hero-visual img'); return { title: document.querySelector('h1')?.textContent.trim(), price: document.querySelector('.price-tag')?.textContent.replace(/\\s+/g, '').trim(), heroLoaded: hero?.complete && hero.naturalWidth > 0, documentWidth: document.documentElement.scrollWidth, viewport: window.innerWidth }; }");
  assert.equal(airplaneState.title, "비행기 버터쿠키");
  assert.equal(airplaneState.price, "2,500원·1개");
  assert.equal(airplaneState.heroLoaded, true, "airplane butter cookie hero should load");
  assert.ok(airplaneState.documentWidth <= airplaneState.viewport, "airplane butter cookie should not horizontally overflow on mobile");
  const airplaneBodyOrders = await evaluate(cdp, "() => [...document.querySelectorAll('main a[data-analytics-event=\"order_start\"]')].map((link) => ({ text: link.textContent.trim(), href: link.href, event: link.dataset.analyticsEvent, label: link.dataset.analyticsLabel, target: link.target }))");
  assert.deepEqual(airplaneBodyOrders, [{ text: "주문하기 →", href: expectedOrderUrls.get("/products/airplane-cookie/"), event: "order_start", label: "airplane-cookie", target: "_blank" }], "airplane cookie body order CTA must use its dedicated order page");
  await setViewport(cdp, 1280, 900);
  await navigate(cdp, `${server.baseUrl}/magok-cookie/`);
  const magokFavorGuideDesktop = await evaluate(cdp, "() => { const grid = document.querySelector('#magok-favor-guide .magok-favor-guide-grid'); const cards = [...document.querySelectorAll('#magok-favor-guide .magok-favor-guide-card')]; return { columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length, documentWidth: document.documentElement.scrollWidth, cards: cards.map((card) => ({ right: card.getBoundingClientRect().right, titleFits: (card.querySelector('h3')?.scrollWidth || 0) <= (card.querySelector('h3')?.clientWidth || 0), linkFits: (card.querySelector('a')?.scrollWidth || 0) <= (card.querySelector('a')?.clientWidth || 0) })) }; }");
  assert.equal(magokFavorGuideDesktop.columns, 3, "magok favor guide should use three desktop cards");
  assert.ok(magokFavorGuideDesktop.documentWidth <= 1280 && magokFavorGuideDesktop.cards.every((card) => card.right <= 1280 && card.titleFits && card.linkFits), "magok favor guide should remain readable on desktop");
  const magokCompanyChoiceDesktop = await evaluate(cdp, "() => { const grid = document.querySelector('#magok-company-choice .magok-company-choice-grid'); const cards = [...document.querySelectorAll('#magok-company-choice .magok-company-choice-card')]; return { columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length, documentWidth: document.documentElement.scrollWidth, cards: cards.map((card) => ({ right: card.getBoundingClientRect().right, titleFits: (card.querySelector('h3')?.scrollWidth || 0) <= (card.querySelector('h3')?.clientWidth || 0), linkFits: (card.querySelector('a')?.scrollWidth || 0) <= (card.querySelector('a')?.clientWidth || 0) })) }; }");
  assert.equal(magokCompanyChoiceDesktop.columns, 4, "magok company choice should use four desktop cards");
  assert.ok(magokCompanyChoiceDesktop.documentWidth <= 1280 && magokCompanyChoiceDesktop.cards.every((card) => card.right <= 1280 && card.titleFits && card.linkFits), "magok company choice should remain readable on desktop");
  for (const [pathname, expectedTarget] of [
    ["/", "/magok-cookie/"],
    ["/guides/", "/magok-cookie/"],
    ["/guides/corporate-event-cookie/", "/magok-cookie/"],
    ["/pickup/", "/magok-cookie/"]
  ]) {
    await navigate(cdp, `${server.baseUrl}${pathname}`);
    const hasMagokLink = await evaluate(cdp, `() => [...document.querySelectorAll('a[href]')].some((link) => new URL(link.href).pathname === '${expectedTarget}')`);
    assert.equal(hasMagokLink, true, `${pathname} should link to the magok cookie hub`);
  }

  for (const width of MOBILE_WIDTHS) {
    await setViewport(cdp, width);
    await navigate(cdp, `${server.baseUrl}/magok-cookie/`);
    const magokMobile = await evaluate(cdp, "() => { const rect = (node) => { const value = node?.getBoundingClientRect(); return value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height } : null; }; const columns = (selector) => getComputedStyle(document.querySelector(selector)).gridTemplateColumns.trim().split(/\\s+/).length; const h1 = document.querySelector('.magok-hero-copy h1'); const heroImage = document.querySelector('.magok-hero-image'); const heroCopy = document.querySelector('.magok-hero-copy'); const heroStamp = document.querySelector('.magok-hero-stamp'); const heroActions = [...document.querySelectorAll('.magok-hero-actions .magok-button')].map(rect); const productCards = [...document.querySelectorAll('.magok-product-card')].map((card) => ({ rect: rect(card), titleFits: (card.querySelector('h3')?.scrollWidth || 0) <= (card.querySelector('h3')?.clientWidth || 0), linkFits: (card.querySelector('a')?.scrollWidth || 0) <= (card.querySelector('a')?.clientWidth || 0) })); const visibleNav = [...document.querySelectorAll('.magok-header-nav a')].filter((link) => getComputedStyle(link).display !== 'none').map((link) => link.textContent.trim()); const logo = rect(document.querySelector('.magok-brand')); const nav = rect(document.querySelector('.magok-header-nav')); const quickNav = document.querySelector('.magok-quick-nav-inner'); return { h1Size: Number.parseFloat(getComputedStyle(h1).fontSize), h1Rect: rect(h1), heroFit: getComputedStyle(heroImage).objectFit, heroNaturalRatio: heroImage.naturalWidth / heroImage.naturalHeight, heroRenderedRatio: heroImage.getBoundingClientRect().width / heroImage.getBoundingClientRect().height, heroCopy: rect(heroCopy), heroStamp: rect(heroStamp), heroActions, productColumns: columns('.magok-product-grid'), productCards, favorColumns: columns('.magok-favor-grid'), companyChoiceColumns: columns('.magok-company-choice-grid'), businessColumns: columns('.magok-business-grid'), pickupColumns: columns('.magok-pickup-grid'), answerColumns: columns('.magok-answer-grid'), finalColumns: columns('.magok-final-grid'), faqCount: document.querySelectorAll('.magok-faq-list details').length, documentWidth: document.documentElement.scrollWidth, visibleNav, logoCenter: logo ? logo.top + logo.height / 2 : 0, navCenter: nav ? nav.top + nav.height / 2 : 0, quickOverflow: getComputedStyle(quickNav).overflowX, quickScrollable: quickNav.scrollWidth >= quickNav.clientWidth }; }");
    assert.ok(magokMobile.h1Size >= 36 && magokMobile.h1Size <= 40, `magok hero h1 should use the mobile editorial scale at ${width}px`);
    assert.ok(magokMobile.h1Rect.left >= 0 && magokMobile.h1Rect.right <= width, `magok hero copy should fit the viewport at ${width}px`);
    assert.equal(magokMobile.heroFit, 'contain', `magok hero image should avoid an excessive crop at ${width}px`);
    assert.ok(Math.abs(magokMobile.heroNaturalRatio - magokMobile.heroRenderedRatio) < 0.02, `magok hero should preserve its natural ratio at ${width}px`);
    assert.ok(magokMobile.heroStamp.bottom <= magokMobile.heroCopy.top, `magok hero stamp should not overlap copy at ${width}px: ${JSON.stringify({ stamp: magokMobile.heroStamp, copy: magokMobile.heroCopy })}`);
    assert.equal(magokMobile.quickOverflow, 'auto', `magok quick navigation should scroll internally at ${width}px`);
    assert.equal(magokMobile.quickScrollable, true, `magok quick navigation should remain usable at ${width}px`);
    assert.deepEqual(magokMobile.visibleNav, ['픽업 안내', '주문'], `magok header should simplify to pickup and order at ${width}px`);
    assert.ok(Math.abs(magokMobile.logoCenter - magokMobile.navCenter) <= 2, `magok logo and nav should remain on one row at ${width}px`);
    assert.equal(magokMobile.heroActions.length, 3, `magok hero should keep three CTA buttons at ${width}px`);
    assert.ok(magokMobile.heroActions.every((button) => button.left >= 0 && button.right <= width && button.height >= 44), `magok hero CTAs should fit the viewport at ${width}px`);
    assert.ok(magokMobile.heroActions.every((button) => Math.abs(button.width - magokMobile.heroActions[0].width) < 1), `magok hero CTAs should use one full-width column at ${width}px`);
    assert.equal(magokMobile.productCards.length, 6, `magok page should keep six product cards at ${width}px`);
    assert.equal(magokMobile.productColumns, 2, `magok product cards should use two visual columns at ${width}px`);
    assert.ok(magokMobile.productCards.every((card) => card.rect.right <= width && card.titleFits && card.linkFits), `magok product card content should fit at ${width}px`);
    assert.ok(magokMobile.productCards.at(-1).rect.width >= magokMobile.productCards[0].rect.width * 1.8, `magok final product card should use a wide mobile layout at ${width}px`);
    assert.equal(magokMobile.favorColumns, 2, `magok favor cards should use two compact columns at ${width}px`);
    const magokFavorGuideMobile = await evaluate(cdp, "() => { const cards = [...document.querySelectorAll('#magok-favor-guide .magok-favor-guide-card')]; const columns = getComputedStyle(document.querySelector('#magok-favor-guide .magok-favor-guide-grid')).gridTemplateColumns.trim().split(/\\s+/).length; return { columns, cards: cards.map((card) => ({ right: card.getBoundingClientRect().right, titleFits: (card.querySelector('h3')?.scrollWidth || 0) <= (card.querySelector('h3')?.clientWidth || 0), linkFits: (card.querySelector('a')?.scrollWidth || 0) <= (card.querySelector('a')?.clientWidth || 0), linkHeight: card.querySelector('a')?.getBoundingClientRect().height || 0 })) }; }");
    assert.equal(magokFavorGuideMobile.columns, 1, `magok favor guide should stack at ${width}px`);
    assert.ok(magokFavorGuideMobile.cards.length === 3 && magokFavorGuideMobile.cards.every((card) => card.right <= width && card.titleFits && card.linkFits && card.linkHeight >= 44), `magok favor guide cards and links should remain readable and tappable at ${width}px`);
    const magokCompanyChoiceMobile = await evaluate(cdp, "() => { const cards = [...document.querySelectorAll('#magok-company-choice .magok-company-choice-card')]; const columns = getComputedStyle(document.querySelector('#magok-company-choice .magok-company-choice-grid')).gridTemplateColumns.trim().split(/\\s+/).length; return { columns, cards: cards.map((card) => ({ right: card.getBoundingClientRect().right, titleFits: (card.querySelector('h3')?.scrollWidth || 0) <= (card.querySelector('h3')?.clientWidth || 0), linkFits: (card.querySelector('a')?.scrollWidth || 0) <= (card.querySelector('a')?.clientWidth || 0), linkHeight: card.querySelector('a')?.getBoundingClientRect().height || 0 })) }; }");
    assert.equal(magokCompanyChoiceMobile.columns, 1, `magok company choice should stack at ${width}px`);
    assert.ok(magokCompanyChoiceMobile.cards.length === 4 && magokCompanyChoiceMobile.cards.every((card) => card.right <= width && card.titleFits && card.linkFits && card.linkHeight >= 44), `magok company choice cards and links should remain readable and tappable at ${width}px`);
    assert.equal(magokMobile.businessColumns, 1, `magok business section should stack at ${width}px`);
    assert.equal(magokMobile.pickupColumns, 1, `magok pickup board should stack at ${width}px`);
    assert.equal(magokMobile.answerColumns, 1, `magok quick answers should use one column at ${width}px`);
    assert.equal(magokMobile.finalColumns, 1, `magok final CTA should stack at ${width}px`);
    assert.equal(magokMobile.documentWidth <= width, true, `magok page should not horizontally overflow at ${width}px`);
    assert.equal(magokMobile.faqCount, 8, `magok FAQ count should remain eight at ${width}px`);
    const magokFaqOpen = await evaluate(cdp, "() => { const details = document.querySelector('.magok-faq-list details'); details.querySelector('summary').click(); return details.open; }");
    assert.equal(magokFaqOpen, true, `magok FAQ should open on activation at ${width}px`);
    await cdp.command('Runtime.evaluate', { expression: "document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.documentElement.scrollHeight)" });
    await wait(100);
    const magokFooter = await evaluate(cdp, "() => { const footer = document.querySelector('.magok-footer')?.getBoundingClientRect(); const floating = document.querySelector('.magok-float-stack')?.getBoundingClientRect(); return { footerBottom: footer?.bottom || 0, floatTop: floating?.top || Infinity, floatWidth: floating?.width || 0, floatHeight: floating?.height || 0 }; }");
    assert.ok(magokFooter.footerBottom <= magokFooter.floatTop, `magok floating actions should not cover the footer at ${width}px: ${JSON.stringify(magokFooter)}`);
    assert.ok(magokFooter.floatWidth <= 140 && magokFooter.floatHeight <= 56, `magok floating actions should remain compact at ${width}px`);
  }

  await setViewport(cdp, 390);
  await navigate(cdp, `${server.baseUrl}/guides/cookie-storage/`);
  const cookieStorageGuide = await evaluate(cdp, "() => ({ cards: document.querySelectorAll('.product-card').length, active: document.querySelector('.product-card.active')?.dataset.product || '', guideTitle: document.querySelector('#guide-title')?.textContent.trim() || '', faqCount: document.querySelectorAll('#faq details').length, discoverCards: document.querySelectorAll('.discover-card').length, hasKakaoFloat: Boolean(document.querySelector('[data-kakao-float]')), hasKakaoBubble: Boolean(document.querySelector('.nm-float-bubble')), hasLegacyPng: [...document.images].some((image) => image.getAttribute('src')?.includes('main-order-cookie-thumb.png')), hasLegacyText: document.documentElement.textContent.includes('소비기한'), imageSourcesLocal: [...document.querySelectorAll('main img')].every((image) => image.getAttribute('src')?.startsWith('../../images/')) })");
  assert.deepEqual(cookieStorageGuide, { cards: 4, active: "crew", guideTitle: "쿠키크루 보관방법", faqCount: 8, discoverCards: 4, hasKakaoFloat: false, hasKakaoBubble: false, hasLegacyPng: false, hasLegacyText: false, imageSourcesLocal: true }, "cookie storage guide should render its four-product initial content");
  const cookieStoragePickup = await evaluate(cdp, "() => { const callouts = document.querySelectorAll('.pickup-callout'); const place = document.querySelector('[data-analytics-event=\"cookie_care_naver_place_click\"]'); const pickup = [...document.querySelectorAll('.pickup-actions a')].find((link) => new URL(link.href).pathname === '/pickup/'); const instagram = document.querySelector('[data-analytics-event=\"cookie_care_instagram_click\"]'); return { count: callouts.length, address: callouts[0]?.textContent.includes('서울특별시 강서구 송정로 25 1층') || false, placeHref: place?.getAttribute('href') || '', placeTarget: place?.getAttribute('target') || '', placeEvent: place?.dataset.analyticsEvent || '', pickupHref: pickup?.getAttribute('href') || '', instagramHref: instagram?.getAttribute('href') || '', instagramTarget: instagram?.getAttribute('target') || '', instagramEvent: instagram?.dataset.analyticsEvent || '', actionEvents: [...document.querySelectorAll('.pickup-actions a')].map((link) => link.dataset.analyticsEvent || ''), reservationOnly: callouts[0]?.textContent.includes('예약 픽업 전용') || false, noWalkIn: callouts[0]?.textContent.includes('예약 없이 방문하시면 현장 구매가 어려우니') || false }; }");
  assert.deepEqual(cookieStoragePickup, { count: 1, address: true, placeHref: "https://naver.me/Gsj2pwAu", placeTarget: "_blank", placeEvent: "cookie_care_naver_place_click", pickupHref: "../../pickup/", instagramHref: "https://instagram.com/nothingmatters_c", instagramTarget: "_blank", instagramEvent: "cookie_care_instagram_click", actionEvents: ["cookie_care_naver_place_click", "", "cookie_care_instagram_click"], reservationOnly: true, noWalkIn: true }, "cookie storage should expose ordered pickup, Place, and Instagram actions");
  for (const [key, expectedTitle, expectedContent] of [
    ["brookie", "브루키 보관방법", "브루키는 버터쿠키와 브라우니를 함께 구운 제품이에요."],
    ["handmade", "수제 꾸덕쿠키 보관방법", "수령 후 바로 밀봉하여 냉동 보관해주시고 2주 이내"],
    ["lucky", "행운쿠키 보관방법", "실온 보관 시 수령일 포함 7일 이내"]
  ]) {
    const selectedProduct = await evaluate(cdp, `() => { document.querySelector('[data-product="${key}"]').click(); return { active: document.querySelector('.product-card.active')?.dataset.product || '', pressed: document.querySelector('[data-product="${key}"]')?.getAttribute('aria-pressed') || '', title: document.querySelector('#guide-title')?.textContent.trim() || '', content: document.querySelector('#info-list')?.textContent.includes(${JSON.stringify(expectedContent)}) || false }; }`);
    assert.deepEqual(selectedProduct, { active: key, pressed: "true", title: expectedTitle, content: true }, `cookie storage ${key} selection should render its product-specific guidance`);
  }
  const storageFaqOpen = await evaluate(cdp, "() => { const details = document.querySelector('#faq details'); details.querySelector('summary').click(); return details.open; }");
  assert.equal(storageFaqOpen, true, "cookie storage guide FAQ should open on activation");

  const discoverProducts = await evaluate(cdp, "() => [...document.querySelectorAll('.discover-card')].map((card) => ({ title: card.querySelector('h3')?.textContent.trim() || '', href: card.querySelector('a')?.getAttribute('href') || '', event: card.querySelector('a')?.dataset.analyticsEvent || '', label: card.querySelector('a')?.dataset.analyticsLabel || '' }))");
  assert.deepEqual(discoverProducts, [
    { title: "쿠키크루", href: "https://nothingmatters.co.kr/cookie-crew/?utm_source=cookie-care&utm_medium=owned&utm_campaign=aftercare", event: "cookie_care_product_discover_click", label: "쿠키크루" },
    { title: "브루키", href: "https://nothingmatters.co.kr/brookie/?utm_source=cookie-care&utm_medium=owned&utm_campaign=aftercare", event: "cookie_care_product_discover_click", label: "브루키" },
    { title: "수제 꾸덕쿠키", href: "https://nothingmatters.co.kr/products/handmade-cookie/?utm_source=cookie-care&utm_medium=owned&utm_campaign=aftercare", event: "cookie_care_product_discover_click", label: "수제 꾸덕쿠키" },
    { title: "행운쿠키", href: "https://nothingmatters.co.kr/products/lucky-cookie/?utm_source=cookie-care&utm_medium=owned&utm_campaign=aftercare", event: "cookie_care_product_discover_click", label: "행운쿠키" }
  ], "cookie storage AFTER COOKIE CARE should contain the four operating products");

  await evaluate(cdp, "() => { window.__cookieCareEvents = []; window.gtag = (...args) => window.__cookieCareEvents.push(args); const click = (selector) => { const target = document.querySelector(selector); target.addEventListener('click', (event) => event.preventDefault(), { once: true }); target.click(); }; click('[data-analytics-event=\"cookie_care_find_product_click\"]'); click('[data-analytics-event=\"cookie_care_kakao_subscribe_click\"]'); click('[data-analytics-event=\"cookie_care_kakao_question_click\"]'); click('[data-analytics-event=\"cookie_care_product_discover_click\"]'); click('[data-analytics-event=\"cookie_care_naver_place_click\"]'); click('[data-analytics-event=\"cookie_care_instagram_click\"]'); return true; }");
  const cookieCareEvents = await evaluate(cdp, "() => window.__cookieCareEvents.map((entry) => entry[1])");
  for (const eventName of ["cookie_care_find_product_click", "cookie_care_kakao_subscribe_click", "cookie_care_kakao_question_click", "cookie_care_product_discover_click", "cookie_care_naver_place_click", "cookie_care_instagram_click"]) {
    assert.equal(cookieCareEvents.filter((name) => name === eventName).length, 1, `${eventName} should fire once`);
  }

  for (const [hash, expected] of Object.entries({ crew: "쿠키크루 보관방법", brookie: "브루키 보관방법", handmade: "수제 꾸덕쿠키 보관방법", lucky: "행운쿠키 보관방법" })) {
    await navigate(cdp, `${server.baseUrl}/guides/cookie-storage/?deep-link=${hash}#${hash}`);
    const deepLinkState = await evaluate(cdp, "() => { const active = document.querySelector('.product-card.active'); return { active: active?.dataset.product || '', pressed: active?.getAttribute('aria-pressed') || '', title: document.querySelector('#guide-title')?.textContent.trim() || '' }; }");
    assert.deepEqual(deepLinkState, { active: hash, pressed: "true", title: expected }, `cookie storage ${hash} deep link should select the matching product`);
  }

  for (const width of MOBILE_WIDTHS) {
    await setViewport(cdp, width);
    await navigate(cdp, `${server.baseUrl}/guides/cookie-storage/`);
    const guidePickupMobile = await evaluate(cdp, "() => { const callout = document.querySelector('.pickup-callout'); const actions = [...document.querySelectorAll('.pickup-actions .btn')]; const mobileCta = document.querySelector('.mobile-cta'); document.documentElement.style.scrollBehavior = 'auto'; callout?.scrollIntoView({ block: 'end' }); const rect = (node) => { const value = node?.getBoundingClientRect(); return value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom, height: value.height } : null; }; return { documentWidth: document.documentElement.scrollWidth, actionRects: actions.map(rect), mobileCta: rect(mobileCta) }; }");
    await wait(100);
    assert.ok(guidePickupMobile.documentWidth <= width, `cookie storage pickup callout should not overflow at ${width}px`);
    assert.equal(guidePickupMobile.actionRects.length, 3, `cookie storage pickup callout should keep three actions at ${width}px`);
    assert.ok(guidePickupMobile.actionRects.every((rect) => rect.left >= 0 && rect.right <= width && rect.height >= 44), `cookie storage pickup actions should fit and remain tappable at ${width}px`);
    assert.ok(guidePickupMobile.actionRects.at(-1).bottom <= guidePickupMobile.mobileCta.top, `cookie storage pickup actions should clear the fixed CTA at ${width}px: ${JSON.stringify(guidePickupMobile)}`);
    await cdp.command("Runtime.evaluate", { expression: "document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.documentElement.scrollHeight)" });
    await wait(100);
    const guideMobileCta = await evaluate(cdp, "() => { const cta = document.querySelector('.mobile-cta'); const footer = document.querySelector('.footer-inner'); const ctaRect = cta?.getBoundingClientRect(); const footerRect = footer?.getBoundingClientRect(); return { visible: cta ? getComputedStyle(cta).display !== 'none' : false, ctaTop: ctaRect?.top || 0, footerBottom: footerRect?.bottom || 0, hasKakaoFloat: Boolean(document.querySelector('[data-kakao-float]')), hasKakaoBubble: Boolean(document.querySelector('.nm-float-bubble')) }; }");
    assert.equal(guideMobileCta.visible, true, `cookie storage mobile CTA should be visible at ${width}px`);
    assert.equal(guideMobileCta.hasKakaoFloat, false, `cookie storage should opt out of the common Kakao float at ${width}px`);
    assert.equal(guideMobileCta.hasKakaoBubble, false, `cookie storage should not render the common Kakao bubble at ${width}px`);
    assert.ok(guideMobileCta.footerBottom <= guideMobileCta.ctaTop, `cookie storage mobile CTA should not cover footer content at ${width}px: ${JSON.stringify(guideMobileCta)}`);
  }

  for (const [pathname, href, expectedLabel] of [
    ["/cookie-crew/", "../guides/cookie-storage/#crew", "쿠키크루"],
    ["/brookie/", "../guides/cookie-storage/#brookie", "브루키"],
    ["/products/handmade-cookie/", "../../guides/cookie-storage/#handmade", "수제 꾸덕쿠키"],
    ["/products/lucky-cookie/", "../../guides/cookie-storage/#lucky", "행운쿠키"]
  ]) {
    await navigate(cdp, `${server.baseUrl}${pathname}`);
    const entryLink = await evaluate(cdp, `() => { const link = document.querySelector('[data-analytics-event="cookie_care_entry_click"]'); return { href: link?.getAttribute('href') || '', label: link?.dataset.analyticsLabel || '' }; }`);
    assert.equal(entryLink.href, href, `${pathname} should link to its cookie storage deep link`);
    assert.equal(entryLink.label, expectedLabel, `${pathname} cookie storage link should retain its product analytics label`);
    const entryAnalytics = await evaluate(cdp, "() => { const link = document.querySelector('[data-analytics-event=\"cookie_care_entry_click\"]'); const available = typeof window.gtag === 'function'; window.__cookieCareEntryEvents = []; if (available) { window.gtag = (...args) => window.__cookieCareEntryEvents.push(args); link.addEventListener('click', (event) => event.preventDefault(), { once: true }); link.click(); } return { available, eventCount: window.__cookieCareEntryEvents.filter((entry) => entry[1] === 'cookie_care_entry_click').length }; }");
    assert.equal(entryAnalytics.available, true, `${pathname} should expose the GA4 gtag bootstrap`);
    assert.equal(entryAnalytics.eventCount, 1, `${pathname} cookie storage entry should send exactly one cookie_care_entry_click event`);
  }

  for (const pathname of ["/products/terminal-sand-cookie/", "/products/cookie-flight/"]) {
    await navigate(cdp, `${server.baseUrl}${pathname}`);
    assert.equal(await evaluate(cdp, "() => Boolean(document.querySelector('[data-analytics-event=\"cookie_care_entry_click\"]'))"), false, `${pathname} should not link to an unavailable cookie storage product`);
  }

  for (const width of MOBILE_WIDTHS) {
    await setViewport(cdp, width);
    await navigate(cdp, `${server.baseUrl}/pickup/`);
    await cdp.command("Runtime.evaluate", { expression: "document.querySelectorAll('.nm-pickup-links img').forEach((image) => { image.loading = 'eager'; })" });
    await waitFor(cdp, "() => [...document.querySelectorAll('.nm-pickup-links img')].every((image) => image.complete && image.naturalWidth > 0)", `pickup order thumbnails should load at ${width}px`);
    const pickupLayout = await evaluate(cdp, "() => { const selectors = ['.nm-pickup-hero .nm-seo-actions', '.nm-pickup-address-card', '.nm-pickup-sticky']; const bounds = Object.fromEntries(selectors.map((selector) => { const node = document.querySelector(selector); const rect = node?.getBoundingClientRect(); return [selector, rect ? { left: rect.left, right: rect.right, width: rect.width, height: rect.height, display: getComputedStyle(node).display } : null]; })); const heroImage = document.querySelector('.nm-pickup-hero img'); const heroRect = heroImage?.getBoundingClientRect(); const floatingDisplays = ['.nm-floating-actions', '.nm-float-icon', '.nm-float-cta', '.nm-mobile-float-stack'].map((selector) => { const node = document.querySelector(selector); return node ? getComputedStyle(node).display : 'none'; }); return { viewport: window.innerWidth, bounds, heroSrc: heroImage?.getAttribute('src') || '', heroObjectFit: heroImage ? getComputedStyle(heroImage).objectFit : '', heroNaturalRatio: heroImage ? heroImage.naturalWidth / heroImage.naturalHeight : 0, heroRenderedRatio: heroRect ? heroRect.width / heroRect.height : 0, heroHeight: heroRect?.height || 0, mapHref: document.querySelector('[data-analytics-event=\"pickup_map_click\"]')?.getAttribute('href') || '', hasCopyTrigger: Boolean(document.querySelector('[data-copy-target=\"#pickup-address\"]')), hasBlogLink: Boolean(document.querySelector('a[href=\"https://blog.nothingmatters.co.kr/\"]')), hasPickupFaq: Boolean(document.querySelector('.nm-pickup-faq-list details')), floatingDisplays, sitePaddingBottom: Number.parseFloat(getComputedStyle(document.querySelector('.nm-site')).paddingBottom) || 0 }; }");
    assert.ok(pickupLayout.bounds['.nm-pickup-hero .nm-seo-actions'].right <= pickupLayout.viewport, `pickup hero CTA overflows at ${width}px`);
    assert.ok(pickupLayout.bounds['.nm-pickup-address-card'].right <= pickupLayout.viewport, `pickup address card overflows at ${width}px`);
    assert.equal(pickupLayout.bounds['.nm-pickup-sticky'].display, "grid", `pickup sticky action should be visible at ${width}px`);
    assert.ok(pickupLayout.bounds['.nm-pickup-sticky'].left >= 0 && pickupLayout.bounds['.nm-pickup-sticky'].right <= pickupLayout.viewport, `pickup sticky action overflows at ${width}px`);
    assert.ok(pickupLayout.sitePaddingBottom >= 78, `pickup content needs sticky action clearance at ${width}px`);
    assert.equal(pickupLayout.heroSrc, "../images/pickup-cookie-lineup-optimized.jpg", `pickup hero should use the optimized pickup cookie lineup image at ${width}px`);
    assert.equal(pickupLayout.heroObjectFit, "contain", `pickup hero should not crop flavor labels at ${width}px`);
    assert.ok(Math.abs(pickupLayout.heroNaturalRatio - pickupLayout.heroRenderedRatio) < 0.02, `pickup hero should preserve its natural ratio at ${width}px`);
    assert.ok(pickupLayout.heroHeight >= 200 && pickupLayout.heroHeight <= 240, `pickup hero should stay compact at ${width}px`);
    assert.equal(pickupLayout.mapHref, PICKUP_MAP_URL, `pickup map CTA should use the Naver place URL at ${width}px`);
    assert.equal(pickupLayout.hasCopyTrigger, true, "pickup address copy trigger should exist");
    assert.equal(pickupLayout.hasBlogLink, true, "pickup BLOG link should remain available");
    assert.equal(pickupLayout.hasPickupFaq, true, "pickup FAQ should remain available");
    assert.equal(pickupLayout.floatingDisplays.every((display) => display === "none"), true, "pickup sticky action should be the only mobile floating CTA");
    const pickupOrders = await evaluate(cdp, "() => { const cards = [...document.querySelectorAll('.nm-pickup-links a')].map((link) => { const image = link.querySelector('img'); const figure = link.querySelector('figure')?.getBoundingClientRect(); const title = link.querySelector('strong')?.getBoundingClientRect(); const description = link.querySelector('span')?.getBoundingClientRect(); const action = link.querySelector('em')?.getBoundingClientRect(); const rect = link.getBoundingClientRect(); return { title: link.querySelector('strong')?.textContent.trim() || '', href: new URL(link.href).pathname, imageLoaded: Boolean(image?.naturalWidth && image?.naturalHeight), right: rect.right, figureRight: figure?.right || 0, textLeft: Math.min(title?.left || Infinity, description?.left || Infinity, action?.left || Infinity), titleFits: (link.querySelector('strong')?.scrollWidth || 0) <= (link.querySelector('strong')?.clientWidth || 0), actionFits: (link.querySelector('em')?.scrollWidth || 0) <= (link.querySelector('em')?.clientWidth || 0) }; }); const reservationLinks = [...document.querySelectorAll('[data-analytics-event=\"pickup_reservation_click\"]')].map((link) => ({ href: link.href, label: link.dataset.analyticsLabel || '', height: link.getBoundingClientRect().height })); const sticky = document.querySelector('.nm-pickup-sticky a:last-child'); const callout = document.querySelector('.nm-pickup-reservation-callout'); const reservationFaq = [...document.querySelectorAll('.nm-pickup-faq-list details')].find((details) => details.querySelector('summary')?.textContent.includes('예약 없이 바로 구매할 수 있나요?'))?.textContent || ''; return { hasGtag: typeof window.gtag === 'function', cards, reservationLinks, stickyText: sticky?.textContent.trim() || '', stickyHref: sticky?.href || '', stickyHeight: sticky?.getBoundingClientRect().height || 0, calloutText: callout?.textContent || '', reservationFaq, aeoCards: document.querySelectorAll('.nm-pickup-aeo-grid article').length, faqCards: document.querySelectorAll('.nm-pickup-faq-list details').length, pageText: document.body.textContent }; }");
    assert.deepEqual(
      pickupOrders.cards.map((card) => [card.title, card.href]),
      [["브루키", "/brookie/"], ["수제꾸덕쿠키", "/out/"], ["행운쿠키", "/out/fortune/"], ["쿠키크루", "/cookie-crew/"], ["COOKIE FLIGHT", "/products/cookie-flight/"]],
      `pickup orders should match the five cookie products at ${width}px`
    );
    assert.equal(pickupOrders.hasGtag, true, `pickup should expose the GA4 gtag bootstrap at ${width}px`);
    const cookieCrewThumbnail = await evaluate(cdp, "() => { const image = document.querySelector('.nm-pickup-cookie-thumb img'); const sources = [...document.querySelectorAll('.nm-pickup-cookie-thumb picture source')].map((source) => source.getAttribute('srcset') || ''); return { src: image ? new URL(image.src).pathname : '', currentSrc: image?.currentSrc ? new URL(image.currentSrc).pathname : '', sources, objectFit: image ? getComputedStyle(image).objectFit : '', naturalWidth: image?.naturalWidth || 0, naturalHeight: image?.naturalHeight || 0 }; }");
    assert.deepEqual(cookieCrewThumbnail.sources, ["../images/pickup-cute-cookie-optimized.webp", "../images/pickup-cute-cookie-optimized.png"], `pickup Cookie Crew card should declare WebP with an optimized PNG fallback at ${width}px`);
    assert.equal(cookieCrewThumbnail.currentSrc, "/images/pickup-cute-cookie-optimized.webp", `pickup Cookie Crew card should load the WebP source at ${width}px`);
    assert.equal(cookieCrewThumbnail.src, "/images/pickup-cute-cookie.png", `pickup Cookie Crew card should retain the original PNG fallback at ${width}px`);
    assert.equal(cookieCrewThumbnail.objectFit, "contain", `pickup Cookie Crew thumbnail should not crop the provided cookie image at ${width}px`);
    assert.equal(cookieCrewThumbnail.naturalWidth, cookieCrewThumbnail.naturalHeight, `pickup Cookie Crew thumbnail should preserve the square source ratio at ${width}px`);
    assert.ok(pickupOrders.cards.every((card) => card.imageLoaded && card.right <= width && card.figureRight <= card.textLeft && card.titleFits && card.actionFits), `pickup order cards should remain readable without image overlap at ${width}px: ${JSON.stringify(pickupOrders.cards)}`);
    const pickupItemList = await evaluate(cdp, "() => { const schema = JSON.parse(document.querySelector('script[data-nm-schema=\"static\"]')?.textContent || '{}'); const itemList = schema['@graph']?.find((entry) => entry['@type'] === 'ItemList'); return (itemList?.itemListElement || []).map((item) => [item.name, new URL(item.url).pathname]); }");
    assert.deepEqual(pickupItemList, pickupOrders.cards.map((card) => [card.title, card.href]), `pickup ItemList should match all five visible product cards at ${width}px`);
    assert.deepEqual(pickupOrders.reservationLinks.map((link) => link.label), ["pickup_hero", "pickup_orders", "pickup_sticky"], `pickup reservation CTAs should be labeled at ${width}px`);
    assert.ok(pickupOrders.reservationLinks.every((link) => link.href === PICKUP_RESERVATION_URL && link.height >= 44), `pickup reservation CTAs should use the official Naver destination at ${width}px: ${JSON.stringify(pickupOrders.reservationLinks)}`);
    assert.equal(pickupOrders.stickyText, "예약", `pickup sticky action should prioritize reservation at ${width}px`);
    assert.equal(pickupOrders.stickyHref, PICKUP_RESERVATION_URL, `pickup sticky reservation should use the official Naver destination at ${width}px`);
    assert.ok(pickupOrders.stickyHeight >= 44, `pickup sticky reservation should remain tappable at ${width}px`);
    assert.match(pickupOrders.calloutText, /예약 픽업 전용 작업실/);
    assert.match(pickupOrders.reservationFaq, /예약 픽업 전용/);
    assert.match(pickupOrders.reservationFaq, /예약 없이 방문/);
    assert.equal(pickupOrders.aeoCards, 3, `pickup should keep three Gimpo Airport quick answers at ${width}px`);
    const pickupGiftGuide = await evaluate(cdp, "() => { const cards = [...document.querySelectorAll('#gimpo-dessert-gift-guide .nm-pickup-gift-grid article')]; const columns = getComputedStyle(document.querySelector('#gimpo-dessert-gift-guide .nm-pickup-gift-grid')).gridTemplateColumns.trim().split(/\\s+/).length; return { columns, clarification: document.querySelector('#gimpo-dessert-gift-guide')?.textContent.includes('김포공항 내부 매장이 아니라') || false, cards: cards.map((card) => ({ right: card.getBoundingClientRect().right, titleFits: (card.querySelector('h3')?.scrollWidth || 0) <= (card.querySelector('h3')?.clientWidth || 0) })) }; }");
    assert.equal(pickupGiftGuide.columns, 1, `pickup dessert gift cards should stack at ${width}px`);
    assert.equal(pickupGiftGuide.clarification, true, `pickup dessert gift guide should clarify it is not inside Gimpo Airport at ${width}px`);
    assert.ok(pickupGiftGuide.cards.length === 3 && pickupGiftGuide.cards.every((card) => card.right <= width && card.titleFits), `pickup dessert gift cards should remain readable at ${width}px`);
    const pickupChoiceGuide = await evaluate(cdp, "() => { const grid = document.querySelector('.nm-pickup-choice-grid'); const cards = [...document.querySelectorAll('.nm-pickup-choice-grid article')]; return { columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length, cards: cards.map((card) => { const title = card.querySelector('h3'); const link = card.querySelector('a'); const rect = card.getBoundingClientRect(); return { title: title?.textContent.trim() || '', href: link ? new URL(link.href).pathname : '', right: rect.right, titleFits: (title?.scrollWidth || 0) <= (title?.clientWidth || 0) }; }) }; }");
    assert.equal(pickupChoiceGuide.columns, 1, `pickup choice guide should stack at ${width}px`);
    assert.deepEqual(
      pickupChoiceGuide.cards.map((card) => [card.title, card.href]),
      [["COOKIE FLIGHT", "/products/cookie-flight/"], ["브루키", "/brookie/"], ["수제꾸덕쿠키", "/out/"], ["행운쿠키", "/out/fortune/"], ["쿠키크루", "/cookie-crew/"]],
      `pickup choice guide should retain five contextual product links at ${width}px`
    );
    assert.ok(pickupChoiceGuide.cards.every((card) => card.right <= width && card.titleFits), `pickup choice guide cards should fit at ${width}px`);
    await waitFor(cdp, "() => { const gallery = document.querySelector('[data-live-gallery-preview]'); return gallery?.dataset.gallerySource === 'fallback' && gallery.querySelectorAll('.nm-live-archive-preview').length === 3; }", `pickup should render the shared live archive preview at ${width}px`);
    await cdp.command("Runtime.evaluate", { expression: "document.querySelectorAll('.nm-pickup-proof img').forEach((image) => { image.loading = 'eager'; })" });
    await waitFor(cdp, "() => [...document.querySelectorAll('.nm-pickup-proof img')].every((image) => image.complete && image.naturalWidth > 0)", `pickup proof images should load at ${width}px`);
    const pickupAuthority = await evaluate(cdp, "() => { const gallery = document.querySelector('[data-live-gallery-preview]'); const previewLinks = [...gallery.querySelectorAll('.nm-live-archive-preview')].map((link) => { const url = new URL(link.href); return { pathname: url.pathname, hash: url.hash }; }); return { breadcrumb: document.querySelector('.nm-pickup-visible-breadcrumb')?.textContent.trim() || '', answer: document.querySelector('.nm-pickup-answer-first')?.textContent || '', gallerySource: gallery?.dataset.gallerySource || '', previewLinks, rail: { overflowX: gallery ? getComputedStyle(gallery).overflowX : '', scrollWidth: gallery?.scrollWidth || 0, clientWidth: gallery?.clientWidth || 0 }, proofImages: [...document.querySelectorAll('.nm-pickup-proof img')].map((image) => { const rect = image.getBoundingClientRect(); return { loaded: Boolean(image.naturalWidth && image.naturalHeight), objectFit: getComputedStyle(image).objectFit, right: rect.right, ratio: rect.width / rect.height }; }), archiveHref: document.querySelector('.nm-pickup-proof .nm-seo-actions a[href=\"../#actual-cases\"]')?.getAttribute('href') || '', worksHref: document.querySelector('.nm-pickup-proof .nm-seo-actions a[href=\"../works/\"]')?.getAttribute('href') || '', documentWidth: document.documentElement.scrollWidth }; }");
    assert.match(pickupAuthority.breadcrumb, /홈\s*\/\s*김포공항 디저트 선물·픽업/);
    assert.match(pickupAuthority.answer, /김포공항 내부 매장이 아니며 방문 전 픽업 예약이 필요합니다/);
    assert.match(pickupAuthority.answer, /원하는 쿠키를 먼저 고르고 픽업 날짜를 예약한 뒤 공항동 작업실에서 수령하면 됩니다/);
    assert.equal(pickupAuthority.gallerySource, "fallback", `pickup preview should use the same archive fallback as the homepage at ${width}px`);
    assert.deepEqual(pickupAuthority.previewLinks, Array.from({ length: 3 }, () => ({ pathname: "/", hash: "#actual-cases" })), `pickup archive cards should point to the homepage production archive at ${width}px`);
    assert.equal(pickupAuthority.archiveHref, "../#actual-cases");
    assert.equal(pickupAuthority.worksHref, "../works/");
    assert.ok(pickupAuthority.proofImages.length === 3 && pickupAuthority.proofImages.every((image) => image.loaded && image.objectFit === 'cover' && image.ratio >= 1.45 && image.ratio <= 1.55), `pickup proof images should use compact cover crops at ${width}px`);
    assert.equal(pickupAuthority.rail.overflowX, "auto", `pickup production archive should scroll inside its own mobile rail at ${width}px`);
    assert.ok(pickupAuthority.rail.scrollWidth > pickupAuthority.rail.clientWidth && pickupAuthority.proofImages[0].right <= width && pickupAuthority.documentWidth <= width, `pickup production archive should reduce vertical pressure without page overflow at ${width}px`);
    assert.equal(pickupOrders.faqCards, 7, `pickup should keep seven AEO FAQ items at ${width}px`);
    assert.match(pickupOrders.pageText, /김포공항/);
    assert.match(pickupOrders.pageText, /디저트 선물/);
    assert.match(pickupOrders.pageText, /답례품/);
    assert.match(pickupOrders.pageText, /예약 픽업 전용/);
    await cdp.command("Runtime.evaluate", { expression: "document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.documentElement.scrollHeight)" });
    await wait(100);
    const pickupFooterClearance = await evaluate(cdp, "() => { const footer = document.querySelector('.nm-pickup-page .nm-seo-footer')?.getBoundingClientRect(); const sticky = document.querySelector('.nm-pickup-sticky')?.getBoundingClientRect(); return { footerBottom: footer?.bottom || 0, stickyTop: sticky?.top || 0 }; }");
    assert.ok(pickupFooterClearance.footerBottom <= pickupFooterClearance.stickyTop, `pickup sticky reservation should not cover the footer at ${width}px: ${JSON.stringify(pickupFooterClearance)}`);
  }

  await setViewport(cdp, 1280, 900);
  await navigate(cdp, `${server.baseUrl}/pickup/`);
  await cdp.command("Runtime.evaluate", { expression: "document.querySelectorAll('.nm-pickup-links img').forEach((image) => { image.loading = 'eager'; })" });
  await waitFor(cdp, "() => [...document.querySelectorAll('.nm-pickup-links img')].every((image) => image.complete && image.naturalWidth > 0)", "pickup order thumbnails should load at desktop width");
  const pickupDesktopThumbnail = await evaluate(cdp, "() => { const image = document.querySelector('.nm-pickup-cookie-thumb img'); const sources = [...document.querySelectorAll('.nm-pickup-cookie-thumb picture source')].map((source) => source.getAttribute('srcset') || ''); const figure = document.querySelector('.nm-pickup-cookie-thumb')?.getBoundingClientRect(); const title = document.querySelector('.nm-pickup-cookie-thumb')?.nextElementSibling?.getBoundingClientRect(); return { src: image ? new URL(image.src).pathname : '', currentSrc: image?.currentSrc ? new URL(image.currentSrc).pathname : '', sources, objectFit: image ? getComputedStyle(image).objectFit : '', figureBottom: figure?.bottom || 0, titleTop: title?.top || 0, viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth }; }");
  assert.deepEqual(pickupDesktopThumbnail.sources, ["../images/pickup-cute-cookie-optimized.webp", "../images/pickup-cute-cookie-optimized.png"], "desktop pickup Cookie Crew card should declare WebP with an optimized PNG fallback");
  assert.equal(pickupDesktopThumbnail.currentSrc, "/images/pickup-cute-cookie-optimized.webp", "desktop pickup Cookie Crew card should load the WebP source");
  assert.equal(pickupDesktopThumbnail.src, "/images/pickup-cute-cookie.png", "desktop pickup Cookie Crew card should retain the original PNG fallback");
  assert.equal(pickupDesktopThumbnail.objectFit, "contain", "desktop pickup Cookie Crew thumbnail should not crop the provided cookie PNG");
  assert.ok(pickupDesktopThumbnail.figureBottom <= pickupDesktopThumbnail.titleTop, "desktop pickup card image should not overlap its text");
  assert.ok(pickupDesktopThumbnail.documentWidth <= pickupDesktopThumbnail.viewport, "desktop pickup page should not horizontally overflow");
  const pickupGiftGuideDesktop = await evaluate(cdp, "() => { const grid = document.querySelector('#gimpo-dessert-gift-guide .nm-pickup-gift-grid'); const cards = [...document.querySelectorAll('#gimpo-dessert-gift-guide .nm-pickup-gift-grid article')]; return { columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length, cards: cards.map((card) => ({ right: card.getBoundingClientRect().right, titleFits: (card.querySelector('h3')?.scrollWidth || 0) <= (card.querySelector('h3')?.clientWidth || 0) })) }; }");
  assert.equal(pickupGiftGuideDesktop.columns, 3, "pickup dessert gift guide should use three desktop cards");
  assert.ok(pickupGiftGuideDesktop.cards.length === 3 && pickupGiftGuideDesktop.cards.every((card) => card.right <= 1280 && card.titleFits), "pickup dessert gift guide should remain readable on desktop");

  await setViewport(cdp, 1440, 900);
  await navigate(cdp, `${server.baseUrl}/magok-cookie/`);
  const magokAuthorityDesktop = await evaluate(cdp, "() => { const breadcrumb = document.querySelector('.magok-visible-breadcrumb')?.getBoundingClientRect(); const answer = document.querySelector('.magok-answer-first')?.getBoundingClientRect(); const proofs = [...document.querySelectorAll('.magok-proof figure')].map((figure) => figure.getBoundingClientRect()); return { documentWidth: document.documentElement.scrollWidth, breadcrumb, answer, proofs }; }");
  assert.ok(magokAuthorityDesktop.documentWidth <= 1440, "magok authority sections should not overflow at 1440px");
  assert.ok(magokAuthorityDesktop.breadcrumb.right <= 1440 && magokAuthorityDesktop.answer.right <= 1440 && magokAuthorityDesktop.proofs.length === 3 && magokAuthorityDesktop.proofs.every((proof) => proof.right <= 1440), "magok authority content should fit at 1440px");

  for (const width of MOBILE_WIDTHS) {
    await setViewport(cdp, width);
    await navigate(cdp, `${server.baseUrl}/guides/wedding-favor-cookie/`);
    await cdp.command("Runtime.evaluate", { expression: "document.querySelectorAll('.nm-wedding-page img').forEach((image) => { image.loading = 'eager'; })" });
    await waitFor(cdp, "() => [...document.querySelectorAll('.nm-wedding-page img')].every((image) => image.complete && image.naturalWidth > 0)", `wedding showroom images should load at ${width}px`);
    const weddingMobile = await evaluate(cdp, "() => { const productGrid = document.querySelector('.nm-wedding-product-grid'); const cards = [...document.querySelectorAll('.nm-wedding-product-card')]; const float = document.querySelector('.nm-float-cta'); const footerContent = document.querySelector('.nm-wedding-footer .nm-wrap'); const header = document.querySelector('.nm-topbar-inner'); const logo = document.querySelector('.nm-logo'); const caseLink = document.querySelector('.nm-wedding-nav-case'); const productCtas = cards.map((card) => card.querySelector('.nm-wedding-product-copy a')); const consultation = document.querySelector('.nm-nav a:last-child'); const primaryAction = document.querySelector('.nm-wedding-actions .nm-btn--primary'); const order = document.querySelector('.nm-wedding-order'); return { h1: document.querySelector('h1')?.textContent.trim() || '', logoText: logo?.textContent.trim() || '', logoColor: logo ? getComputedStyle(logo).color : '', logoWeight: logo ? Number.parseInt(getComputedStyle(logo).fontWeight, 10) : 0, consultationColor: consultation ? getComputedStyle(consultation).color : '', consultationBackground: consultation ? getComputedStyle(consultation).backgroundColor : '', primaryActionBackground: primaryAction ? getComputedStyle(primaryAction).backgroundColor : '', orderBackground: order ? getComputedStyle(order).backgroundColor : '', orderHeadingColor: order?.querySelector('h2') ? getComputedStyle(order.querySelector('h2')).color : '', nav: [...document.querySelectorAll('.nm-nav a')].filter((link) => getComputedStyle(link).display !== 'none' && getComputedStyle(link).visibility !== 'hidden').map((link) => link.textContent.trim()), caseLinkDisplay: caseLink ? getComputedStyle(caseLink).display : '', mobileMedia: matchMedia('(max-width: 760px)').matches, headerHeight: header?.getBoundingClientRect().height || 0, navHeight: document.querySelector('.nm-nav')?.getBoundingClientRect().height || 0, gallery: document.querySelectorAll('.nm-wedding-gallery figure').length, cards: cards.length, productNames: cards.map((card) => card.querySelector('h3')?.textContent.trim() || ''), productImagePaths: cards.map((card) => { const image = card.querySelector('img'); return image ? new URL(image.src).pathname : ''; }), columns: getComputedStyle(productGrid).gridTemplateColumns.trim().split(/\\s+/).length, imagesLoaded: [...document.querySelectorAll('.nm-wedding-product-card img')].every((image) => image.naturalWidth > 0 && image.naturalHeight > 0), productImageHeights: cards.map((card) => card.querySelector('figure')?.getBoundingClientRect().height || 0), productFactPills: cards.map((card) => card.querySelectorAll('.nm-wedding-product-facts li').length), productCtaHrefs: productCtas.map((cta) => cta ? new URL(cta.href).pathname : ''), productCtaRadii: productCtas.map((cta) => cta ? Number.parseFloat(getComputedStyle(cta).borderTopLeftRadius) : 0), productCtaColors: productCtas.map((cta) => cta ? getComputedStyle(cta).backgroundColor : ''), ctaHeights: [...document.querySelectorAll('.nm-wedding-actions .nm-btn, .nm-wedding-product-copy a, .nm-wedding-final-actions .nm-btn, .nm-float-cta .nm-btn')].map((cta) => cta.getBoundingClientRect().height), finalCta: Boolean(document.querySelector('.nm-wedding-final-cta')), faq: document.querySelectorAll('#faq details').length, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, viewport: window.innerWidth, float: float?.getBoundingClientRect() || null, footerContent: footerContent?.getBoundingClientRect() || null }; }");
    assert.ok(weddingMobile.h1.includes("결혼식 답례"), `wedding showroom should retain its hero at ${width}px`);
    assert.equal(weddingMobile.logoText, "NOTHINGMATTERS", `wedding showroom should use the uppercase brand wordmark at ${width}px`);
    assert.equal(weddingMobile.logoColor, "rgb(185, 77, 52)", `wedding showroom should use the coral brand wordmark at ${width}px`);
    assert.ok(weddingMobile.logoWeight >= 800, `wedding showroom should retain a bold brand wordmark at ${width}px`);
    assert.equal(weddingMobile.consultationColor, "rgb(116, 48, 33)", `wedding showroom consultation label should avoid black at ${width}px`);
    assert.equal(weddingMobile.consultationBackground, "rgb(243, 201, 93)", `wedding showroom consultation CTA should use the home palette yellow at ${width}px`);
    assert.equal(weddingMobile.primaryActionBackground, "rgb(169, 68, 45)", `wedding showroom primary action should use deep coral instead of black at ${width}px`);
    assert.equal(weddingMobile.orderBackground, "rgb(184, 212, 221)", `wedding showroom order section should use the home palette blue instead of black at ${width}px`);
    assert.equal(weddingMobile.orderHeadingColor, "rgb(116, 48, 33)", `wedding showroom order copy should remain legible without black at ${width}px`);
    assert.deepEqual(weddingMobile.nav, ["답례 구성", "주문 상담"], `wedding showroom mobile nav should stay simplified at ${width}px: ${JSON.stringify(weddingMobile)}`);
    assert.ok(weddingMobile.headerHeight <= 64 && weddingMobile.navHeight <= weddingMobile.headerHeight, `wedding showroom mobile header should stay on one line at ${width}px`);
    assert.equal(weddingMobile.gallery, 4, `wedding showroom should expose four real-order images at ${width}px`);
    assert.equal(weddingMobile.cards, 2, `wedding showroom should expose Brookie and handmade cookie favor cards at ${width}px`);
    assert.deepEqual(weddingMobile.productNames, ["브루키 / 브라우니쿠키", "수제꾸덕쿠키"], `wedding showroom should retain the Brookie and handmade cookie cards without custom or scone at ${width}px`);
    assert.deepEqual(weddingMobile.productImagePaths, ["/images/brownie-main.jpg", "/images/handmade-cookie-flavor-lineup-optimized.jpg"], `wedding showroom should use the optimized handmade cookie image at ${width}px`);
    assert.equal(weddingMobile.columns, 2, `wedding showroom should use a compact two-product grid at ${width}px`);
    assert.ok(weddingMobile.imagesLoaded, `wedding showroom product images should load at ${width}px`);
    assert.ok(weddingMobile.productImageHeights.every((height) => height >= 100), `wedding showroom compact product thumbnails should remain legible at ${width}px`);
    assert.deepEqual(weddingMobile.productFactPills, [3, 3], `wedding showroom should surface three compact fact pills per product at ${width}px`);
    assert.deepEqual(weddingMobile.productCtaHrefs, ["/brookie/", "/out/"], `wedding showroom product CTAs should use their primary product URLs at ${width}px`);
    assert.ok(weddingMobile.productCtaRadii.every((radius) => radius >= 100), `wedding showroom product actions should retain visible pill shapes at ${width}px`);
    assert.deepEqual(weddingMobile.productCtaColors, ["rgb(244, 119, 82)", "rgb(255, 217, 104)"], `wedding showroom product actions should retain their coral and yellow colors at ${width}px`);
    assert.ok(weddingMobile.ctaHeights.every((height) => height >= 44), `wedding showroom CTAs should be tappable at ${width}px`);
    assert.equal(weddingMobile.finalCta, true, `wedding showroom should include its final consultation CTA at ${width}px`);
    assert.ok(weddingMobile.faq > 0, `wedding showroom should retain FAQ at ${width}px`);
    assert.ok(weddingMobile.documentWidth <= weddingMobile.viewport && weddingMobile.bodyWidth <= weddingMobile.viewport, `wedding showroom should not horizontally overflow at ${width}px`);
    await evaluate(cdp, "() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })");
    await wait(100);
    const weddingFooter = await evaluate(cdp, "() => { const float = document.querySelector('.nm-float-cta')?.getBoundingClientRect(); const content = document.querySelector('.nm-wedding-footer .nm-wrap')?.getBoundingClientRect(); return { floatTop: float?.top || 0, contentBottom: content?.bottom || 0 }; }");
    assert.ok(weddingFooter.contentBottom <= weddingFooter.floatTop, `wedding floating CTA should not cover footer content at ${width}px: ${JSON.stringify(weddingFooter)}`);
  }

  await setViewport(cdp, 1280, 900);
  await navigate(cdp, `${server.baseUrl}/guides/wedding-favor-cookie/`);
  const weddingDesktop = await evaluate(cdp, "() => { const hero = document.querySelector('.nm-wedding-hero-grid'); const products = document.querySelector('.nm-wedding-product-grid'); const gallery = document.querySelector('.nm-wedding-gallery'); return { nav: [...document.querySelectorAll('.nm-nav a')].filter((link) => getComputedStyle(link).display !== 'none' && getComputedStyle(link).visibility !== 'hidden').map((link) => link.textContent.trim()), heroColumns: getComputedStyle(hero).gridTemplateColumns.trim().split(/\\s+/).length, productColumns: getComputedStyle(products).gridTemplateColumns.trim().split(/\\s+/).length, productCards: products.querySelectorAll('.nm-wedding-product-card').length, productHrefs: [...products.querySelectorAll('.nm-wedding-product-copy a')].map((link) => new URL(link.href).pathname), galleryImages: gallery.querySelectorAll('img').length, galleryWidth: gallery.getBoundingClientRect().width, documentWidth: document.documentElement.scrollWidth, viewport: window.innerWidth }; }");
  assert.deepEqual(weddingDesktop.nav, ["실제 사례", "답례 구성", "주문 상담"], "wedding showroom desktop nav should show only its three ordering links");
  assert.equal(weddingDesktop.heroColumns, 2, "wedding showroom should use a two-column hero on desktop");
  assert.equal(weddingDesktop.productColumns, 2, "wedding showroom should use a focused two-product row on desktop");
  assert.equal(weddingDesktop.productCards, 2, "wedding showroom desktop should expose Brookie and handmade cookie favor cards");
  assert.deepEqual(weddingDesktop.productHrefs, ["/brookie/", "/out/"], "wedding showroom desktop product CTAs should use their primary product URLs");
  assert.equal(weddingDesktop.galleryImages, 4, "wedding showroom desktop gallery should remain image-led");
  assert.ok(weddingDesktop.galleryWidth > 0 && weddingDesktop.documentWidth <= weddingDesktop.viewport, "wedding showroom desktop should fit without horizontal overflow");

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

  const homepageSectionOrder = await evaluate(cdp, "() => [...document.querySelectorAll('main > section')].map((section) => section.id).filter(Boolean)");
  assert.deepEqual(homepageSectionOrder, ['mainpage-home', 'our-cookies', 'use-case-guide', 'actual-cases', 'journal', 'local-pickup', 'main-faq', 'contact'], 'homepage sections should lead from products to use cases, trust content, FAQ, and final CTA');

  const mobileProductCards = await evaluate(cdp, "() => { const grid = document.querySelector('.showroom-product-grid'); const cards = [...document.querySelectorAll('.showroom-product-card')]; const crew = cards.find((card) => card.dataset.analyticsLabel === '쿠키크루'); return { columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length, newArrivalSection: Boolean(document.querySelector('.showroom-section--new-arrival')), newBadge: crew?.querySelector('.showroom-product-badge')?.textContent.trim() || '', cards: cards.map((card) => { const title = card.querySelector('h3'); const description = card.querySelector('.showroom-product-text > p'); const cta = card.querySelector('.showroom-product-go'); const rect = card.getBoundingClientRect(); const ctaRect = cta?.getBoundingClientRect(); const ctaStyle = getComputedStyle(cta); return { name: title?.textContent.trim() || '', href: card.getAttribute('href') || '', event: card.dataset.analyticsEvent || '', englishHidden: getComputedStyle(card.querySelector('small')).display === 'none', descriptionHidden: getComputedStyle(description).display === 'none', tags: card.querySelectorAll('.showroom-product-tags span').length, orderInfo: card.querySelector('.showroom-product-order-info')?.textContent.trim() || '', right: rect.right, ctaHeight: ctaRect?.height || 0, ctaMinHeight: ctaStyle.minHeight, ctaDisplay: ctaStyle.display, ctaText: cta?.textContent.trim() || '' }; }) }; }");
  assert.equal(mobileProductCards.columns, 2, "OUR COOKIES should retain a two-column mobile grid");
  assert.equal(mobileProductCards.newArrivalSection, false, "NEW ARRIVAL should not render as a standalone section");
  assert.equal(mobileProductCards.newBadge, "NEW", "Cookie Crew should retain its NEW badge in OUR COOKIES");
  assert.deepEqual(mobileProductCards.cards.map((card) => [card.name, card.href, card.event]), [["COOKIE FLIGHT", "products/cookie-flight/", "product_click"], ["비행기 버터쿠키", "products/airplane-cookie/", "product_click"], ["브루키", "brookie/", "product_click"], ["수제꾸덕쿠키", "out/", "product_click"], ["행운쿠키", "out/fortune/", "product_click"], ["쿠키크루", "cookie-crew/", "product_click"]], "OUR COOKIES should lead with both airplane cookie products");
  assert.ok(mobileProductCards.cards.every((card) => card.right <= 390 && card.englishHidden && card.descriptionHidden && card.tags === 2 && card.ctaHeight >= 44 && card.ctaText === "제품 보기 →"), `OUR COOKIES mobile cards should keep readable tags and tappable CTAs: ${JSON.stringify(mobileProductCards.cards)}`);
  assert.deepEqual(mobileProductCards.cards.map(card => card.orderInfo), ['16,000원', '2,500원', '기본형 1구 7,800원 · 최소 12개', '4,500원부터 · 대부분 최소 수량 없음', '4가지맛 1세트 15,000원 · 최소 1세트', '가격·수량 상담']);
  await cdp.command("Runtime.evaluate", { expression: "document.querySelectorAll('.showroom-product-card--featured img').forEach((image) => { image.loading = 'eager'; })" });
  await waitFor(cdp, "() => [...document.querySelectorAll('.showroom-product-card--featured img')].every((image) => image.complete && image.naturalWidth > 0)", "new product card images should load");
  for (const [label, expectedPath] of [["COOKIE FLIGHT", "/products/cookie-flight/"], ["비행기 버터쿠키", "/products/airplane-cookie/"]]) {
    await evaluate(cdp, `() => { document.querySelector('.showroom-product-card[data-analytics-label="${label}"]').click(); return true; }`);
    await waitFor(cdp, `() => location.pathname === "${expectedPath}"`, `${label} card click should open its detail page`);
    await navigate(cdp, `${server.baseUrl}/`);
  }
  const readBookingActions = () => evaluate(cdp, "() => [...document.querySelectorAll('.nm-booking-action')].map(a => ({text: a.textContent.trim(), href: a.href, height: a.getBoundingClientRect().height}))");
  const bookingActions = await readBookingActions();
  assert.deepEqual(bookingActions.map(a => a.text), ['네이버예약', '커스텀주문', '상담하기']);
  assert.ok(bookingActions.every(a => a.height >= 44));
  assert.equal(bookingActions[0].href, PICKUP_RESERVATION_URL);
  assert.equal(bookingActions[1].href, 'https://thingmattersreserve-production.up.railway.app/');
  assert.equal(bookingActions[2].href, 'https://pf.kakao.com/_QdCaK/chat');
  for (const section of ['#actual-cases', '#local-pickup', '#contact']) {
    await evaluate(cdp, `() => document.querySelector('${section}').scrollIntoView()`);
    await wait(150);
    assert.deepEqual(await readBookingActions(), bookingActions, 'Booking actions should remain stable while scrolling');
  }

  await setViewport(cdp, 1280, 900);
  await navigate(cdp, `${server.baseUrl}/`);
  const desktopProductCards = await evaluate(cdp, "() => { const grid = document.querySelector('.showroom-product-grid'); const cards = [...document.querySelectorAll('.showroom-product-card')]; return { columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length, documentWidth: document.documentElement.scrollWidth, cards: cards.map((card) => { const rect = card.getBoundingClientRect(); const cta = card.querySelector('.showroom-product-go')?.getBoundingClientRect(); return { right: rect.right, height: rect.height, ctaBottom: cta?.bottom || 0, cardBottom: rect.bottom }; }) }; }");
  assert.equal(desktopProductCards.columns, 4, "OUR COOKIES should show four cards on one desktop row");
  assert.ok(desktopProductCards.documentWidth <= 1280 && desktopProductCards.cards.every((card) => card.right <= 1280), "OUR COOKIES should not overflow on desktop");
  assert.ok(desktopProductCards.cards.every((card) => Math.abs(card.height - desktopProductCards.cards[0].height) < 1 && card.cardBottom - card.ctaBottom >= 16), "OUR COOKIES cards should share a stable height with bottom-aligned CTAs");
  for (const pathname of ["/products/cookie-flight/", "/products/airplane-cookie/"]) {
    await navigate(cdp, `${server.baseUrl}${pathname}`);
    assert.ok(await evaluate(cdp, "() => document.documentElement.scrollWidth <= window.innerWidth"), `${pathname}: desktop detail should not overflow`);
  }

  await setViewport(cdp, 390);
  await navigate(cdp, `${server.baseUrl}/`);

  await evaluate(cdp, "() => { window.__nmEvents = []; window.gtag = (...args) => window.__nmEvents.push(args); const click = (selector) => { const target = document.querySelector(selector); target.addEventListener('click', (event) => event.preventDefault(), { once: true }); target.click(); }; click('[data-analytics-event=\"product_click\"]'); click('[data-analytics-event=\"blog_header_click\"]'); click('[data-analytics-event=\"blog_card_click\"]'); click('[data-analytics-event=\"blog_footer_click\"]'); return true; }");
  const analytics = await evaluate(cdp, "() => window.__nmEvents.map((entry) => ({ name: entry[1], params: entry[2] || {} }))");
  for (const eventName of ["product_click", "blog_header_click", "blog_card_click", "blog_footer_click"]) {
    assert.equal(analytics.filter((entry) => entry.name === eventName).length, 1, `${eventName} should fire once`);
  }
  assert.ok(analytics.find((entry) => entry.name === "blog_card_click")?.params.post_title, "blog card event should include post_title");

  await navigate(cdp, `${server.baseUrl}/pickup/`);
  await evaluate(cdp, "() => { window.__pickupEvents = []; window.gtag = (...args) => window.__pickupEvents.push(args); const click = (selector) => { const target = document.querySelector(selector); target.addEventListener('click', (event) => event.preventDefault(), { once: true }); target.click(); }; click('[data-analytics-event=\"pickup_map_click\"]'); click('[data-analytics-event=\"pickup_consult_click\"]'); click('[data-analytics-event=\"pickup_reservation_click\"]'); return true; }");
  const pickupEvents = await evaluate(cdp, "() => window.__pickupEvents.map((entry) => entry[1])");
  assert.equal(pickupEvents.filter((name) => name === "pickup_map_click").length, 1, "pickup map click should fire once");
  assert.equal(pickupEvents.filter((name) => name === "pickup_consult_click").length, 1, "pickup consult click should fire once");
  assert.equal(pickupEvents.filter((name) => name === "pickup_reservation_click").length, 1, "pickup reservation click should fire once");
  const pickupFaqOpen = await evaluate(cdp, "() => { const details = document.querySelector('.nm-pickup-faq-list details'); details.querySelector('summary').click(); return details.open; }");
  assert.equal(pickupFaqOpen, true, "pickup FAQ should open on activation");
  await setViewport(cdp, 390);
  const pickupScreenshot = await cdp.command("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/private/tmp/nothingmatters-pickup-mobile.png", pickupScreenshot.data, "base64");

  await navigate(cdp, `${server.baseUrl}/`);
  await evaluate(cdp, "() => { const trigger = document.querySelector('[data-open-made-overlay]'); trigger.focus(); trigger.click(); return true; }");
  await wait(300);
  const opened = await evaluate(cdp, "() => ({ visible: !document.querySelector('[data-made-overlay]').hidden, focused: document.activeElement?.matches('[data-made-overlay-close]') || false })");
  assert.equal(opened.visible, true, "gallery overlay should open");
  assert.equal(opened.focused, true, "gallery overlay should move focus inside");
  await press(cdp, "Escape", 27);
  await waitFor(cdp, "() => !location.hash.includes('made-gallery')", "Escape did not restore the previous history entry");
  await waitFor(cdp, "() => document.querySelector('[data-made-overlay]').hidden", "Escape did not close the gallery overlay");
  const escaped = await evaluate(cdp, "() => ({ hidden: document.querySelector('[data-made-overlay]').hidden, restored: document.activeElement?.matches('[data-open-made-overlay]') || false })");
  assert.equal(escaped.hidden, true, "Escape should close gallery overlay");
  assert.equal(escaped.restored, true, "Escape should restore trigger focus");

  await evaluate(cdp, "() => { document.querySelector('[data-open-made-overlay]').click(); return true; }");
  await waitFor(cdp, "() => location.hash === '#made-gallery'", "gallery opening did not add a history entry");
  await cdp.command("Runtime.evaluate", { expression: "history.back()" });
  await waitFor(cdp, "() => document.querySelector('[data-made-overlay]').hidden", "Back did not close gallery overlay");
  assert.equal(await evaluate(cdp, "() => document.querySelector('[data-made-overlay]').hidden"), true, "Back should close gallery overlay");

  await navigate(cdp, `${server.baseUrl}/cookie-crew/`);
  await cdp.command("Runtime.evaluate", { expression: "document.querySelectorAll('img[src^=\"../images/cookie-crew/\"]').forEach((image) => { image.loading = 'eager'; })" });
  await waitFor(cdp, "() => [...document.querySelectorAll('img[src^=\"../images/cookie-crew/\"]')].every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)", "Cookie Crew extracted images did not load when requested");
  const cookieCrew = await evaluate(cdp, "() => { const images = [...document.images]; return { count: images.length, base64: images.filter((image) => image.currentSrc.startsWith('data:image/')).length, local: images.filter((image) => image.getAttribute('src')?.startsWith('../images/cookie-crew/')).length, loaded: images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0).length }; }");
  assert.equal(cookieCrew.base64, 0, "Cookie Crew should not retain embedded Base64 images");
  assert.equal(cookieCrew.local, 19, "Cookie Crew should reference its extracted local images");
  assert.equal(cookieCrew.loaded, 19, "Cookie Crew extracted images should render");

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
  await flightProvider.close();
  fs.rmSync(BROWSER_GALLERY_DATA_DIR, { recursive: true, force: true });
}

console.log("public browser checks: passed");
