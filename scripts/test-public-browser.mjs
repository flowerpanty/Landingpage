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
  "/brookie/",
  "/products/handmade-cookie/",
  "/products/lucky-cookie/",
  "/magok-cookie/",
  "/guides/",
  "/guides/cookie-storage/",
  "/works/",
  "/pickup/",
  "/contact/",
  "/cookie-crew/"
];
const MOBILE_WIDTHS = [320, 375, 430];
const PICKUP_MAP_URL = "https://map.naver.com/p/entry/place/1547319276?lng=126.8115357&lat=37.557402&placePath=%2Fhome%3Ffrom%3Dmap%26fromPanelNum%3D1%26additionalHeight%3D76%26timestamp%3D202609131310%26locale%3Dko%26svcName%3Dmap_pcv5&entry=plt&searchType=place&c=15.00,0,0,0,dh";

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
  await navigate(cdp, `${server.baseUrl}/magok-cookie/`);
  const magokState = await evaluate(cdp, "() => ({ h1: document.querySelector('h1')?.textContent.trim() || '', cards: document.querySelectorAll('#cookies .magok-product-card').length, corporate: [...document.querySelectorAll('a[href]')].some((link) => new URL(link.href).pathname === '/guides/corporate-event-cookie/'), pickup: [...document.querySelectorAll('a[href]')].some((link) => new URL(link.href).pathname === '/pickup/'), kakao: [...document.querySelectorAll('a[href]')].some((link) => link.href.includes('pf.kakao.com/_QdCaK/chat')), faq: document.querySelectorAll('#faq .magok-faq-list details').length, quickNav: Boolean(document.querySelector('.magok-quick-nav')), floats: document.querySelectorAll('.magok-float-stack a').length, address: document.body.textContent.includes('서울특별시 강서구 송정로 25 1층'), locationContext: document.body.textContent.includes('마곡 인근') })");
  assert.deepEqual(magokState, { h1: "마곡 쿠키·답례품 찾고 있다면공항동에서 만들어 가까이 전해드려요", cards: 5, corporate: true, pickup: true, kakao: true, faq: 6, quickNav: true, floats: 2, address: true, locationContext: true }, "magok cookie hub should expose the local ordering path");
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
    const magokMobile = await evaluate(cdp, "() => { const rect = (node) => { const value = node?.getBoundingClientRect(); return value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height } : null; }; const columns = (selector) => getComputedStyle(document.querySelector(selector)).gridTemplateColumns.trim().split(/\\s+/).length; const h1 = document.querySelector('.magok-hero-copy h1'); const heroImage = document.querySelector('.magok-hero-image'); const heroCopy = document.querySelector('.magok-hero-copy'); const heroStamp = document.querySelector('.magok-hero-stamp'); const heroActions = [...document.querySelectorAll('.magok-hero-actions .magok-button')].map(rect); const productCards = [...document.querySelectorAll('.magok-product-card')].map((card) => ({ rect: rect(card), titleFits: (card.querySelector('h3')?.scrollWidth || 0) <= (card.querySelector('h3')?.clientWidth || 0), linkFits: (card.querySelector('a')?.scrollWidth || 0) <= (card.querySelector('a')?.clientWidth || 0) })); const visibleNav = [...document.querySelectorAll('.magok-header-nav a')].filter((link) => getComputedStyle(link).display !== 'none').map((link) => link.textContent.trim()); const logo = rect(document.querySelector('.magok-brand')); const nav = rect(document.querySelector('.magok-header-nav')); const quickNav = document.querySelector('.magok-quick-nav-inner'); return { h1Size: Number.parseFloat(getComputedStyle(h1).fontSize), h1Rect: rect(h1), heroFit: getComputedStyle(heroImage).objectFit, heroNaturalRatio: heroImage.naturalWidth / heroImage.naturalHeight, heroRenderedRatio: heroImage.getBoundingClientRect().width / heroImage.getBoundingClientRect().height, heroCopy: rect(heroCopy), heroStamp: rect(heroStamp), heroActions, productColumns: columns('.magok-product-grid'), productCards, favorColumns: columns('.magok-favor-grid'), businessColumns: columns('.magok-business-grid'), pickupColumns: columns('.magok-pickup-grid'), answerColumns: columns('.magok-answer-grid'), finalColumns: columns('.magok-final-grid'), faqCount: document.querySelectorAll('.magok-faq-list details').length, visibleNav, logoCenter: logo ? logo.top + logo.height / 2 : 0, navCenter: nav ? nav.top + nav.height / 2 : 0, quickOverflow: getComputedStyle(quickNav).overflowX, quickScrollable: quickNav.scrollWidth >= quickNav.clientWidth }; }");
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
    assert.equal(magokMobile.productCards.length, 5, `magok page should keep five product cards at ${width}px`);
    assert.equal(magokMobile.productColumns, 2, `magok product cards should use two visual columns at ${width}px`);
    assert.ok(magokMobile.productCards.every((card) => card.rect.right <= width && card.titleFits && card.linkFits), `magok product card content should fit at ${width}px`);
    assert.ok(magokMobile.productCards.at(-1).rect.width >= magokMobile.productCards[0].rect.width * 1.8, `magok fifth product card should use a wide mobile layout at ${width}px`);
    assert.equal(magokMobile.favorColumns, 2, `magok favor cards should use two compact columns at ${width}px`);
    assert.equal(magokMobile.businessColumns, 1, `magok business section should stack at ${width}px`);
    assert.equal(magokMobile.pickupColumns, 1, `magok pickup board should stack at ${width}px`);
    assert.equal(magokMobile.answerColumns, 1, `magok quick answers should use one column at ${width}px`);
    assert.equal(magokMobile.finalColumns, 1, `magok final CTA should stack at ${width}px`);
    assert.equal(magokMobile.faqCount, 6, `magok FAQ count should remain six at ${width}px`);
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

  await evaluate(cdp, "() => { window.__cookieCareEvents = []; window.gtag = (...args) => window.__cookieCareEvents.push(args); const click = (selector) => { const target = document.querySelector(selector); target.addEventListener('click', (event) => event.preventDefault(), { once: true }); target.click(); }; click('[data-analytics-event=\"cookie_care_find_product_click\"]'); click('[data-analytics-event=\"cookie_care_kakao_subscribe_click\"]'); click('[data-analytics-event=\"cookie_care_kakao_question_click\"]'); click('[data-analytics-event=\"cookie_care_product_discover_click\"]'); return true; }");
  const cookieCareEvents = await evaluate(cdp, "() => window.__cookieCareEvents.map((entry) => entry[1])");
  for (const eventName of ["cookie_care_find_product_click", "cookie_care_kakao_subscribe_click", "cookie_care_kakao_question_click", "cookie_care_product_discover_click"]) {
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

  await navigate(cdp, `${server.baseUrl}/pickup/`);
  await evaluate(cdp, "() => { window.__pickupEvents = []; window.gtag = (...args) => window.__pickupEvents.push(args); const click = (selector) => { const target = document.querySelector(selector); target.addEventListener('click', (event) => event.preventDefault(), { once: true }); target.click(); }; click('[data-analytics-event=\"pickup_map_click\"]'); click('[data-analytics-event=\"pickup_consult_click\"]'); return true; }");
  const pickupEvents = await evaluate(cdp, "() => window.__pickupEvents.map((entry) => entry[1])");
  assert.equal(pickupEvents.filter((name) => name === "pickup_map_click").length, 1, "pickup map click should fire once");
  assert.equal(pickupEvents.filter((name) => name === "pickup_consult_click").length, 1, "pickup consult click should fire once");
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
}

console.log("public browser checks: passed");
