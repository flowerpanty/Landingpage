import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { loadNotices, publicNotices, noticePath } from '../lib/notices.mjs';
import { brandFonts, routeBrandFont, checkBrandFonts } from './notice-browser-support.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const probe = http.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', WORDPRESS_JOURNAL_OFFLINE: '1', ORDER_API_ORIGIN: 'http://127.0.0.1:1' }, stdio: 'ignore' });
const dir = 'output/playwright/notices';
fs.mkdirSync(dir, { recursive: true });
const notices = publicNotices(loadNotices());
const errors = [], consoleErrors = [], missing = [], mutations = [], evidence = [], measurements = [];
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/notice/`)).ok) { ready = true; break; } } catch { /* starting */ }
    await pause(50);
  }
  assert.ok(ready, 'isolated local server started');
  browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const fonts = await brandFonts();
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.method() !== 'GET') { mutations.push(request.url()); return route.abort(); }
    if (await routeBrandFont(route, fonts)) return;
    return new URL(request.url()).origin === base ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && (!message.location().url || message.location().url.startsWith(base))) consoleErrors.push(message.text());
  });
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) missing.push([response.status(), response.url()]); });
  const routes = ['/notice/', ...notices.map(noticePath)];
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const pathname of routes) {
      const response = await page.goto(base + pathname, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await checkBrandFonts(page);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), `https://nothingmatters.co.kr${pathname}`);
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(dimensions.scrollWidth <= dimensions.width + 1, `overflow ${pathname} @${width}`);
      for (const anchor of await page.locator('a:not(.nm-skip-link)').all()) {
        if (!(await anchor.isVisible())) continue;
        const box = await anchor.boundingBox();
        assert.ok(box && box.height >= 43, `${pathname} @${width}: small touch target ${await anchor.textContent()}`);
      }
      measurements.push({ pathname, width, ...dimensions });
      if ([375, 1440].includes(width) || pathname === '/notice/') {
        const file = `${pathname === '/notice/' ? 'list' : pathname.split('/')[2]}-${width}.png`;
        await page.screenshot({ path: `${dir}/${file}`, fullPage: true });
        evidence.push({ viewport: `${width}x900`, artifact: file, observation: `${pathname}: static readable content, 44px links, no horizontal overflow` });
      }
    }
  }
  await page.goto(`${base}/notice/`);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.nm-skip-link').evaluate(element => element === document.activeElement), true);
  const skipBox = await page.locator('.nm-skip-link').boundingBox();
  assert.ok(skipBox.y >= 0);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
  if (notices.length) {
  await page.locator('.nm-notice-card h2 a').first().focus();
  assert.equal(await page.locator('.nm-notice-card h2 a').first().evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
  await page.keyboard.press('Enter');
  await page.waitForURL(`**${noticePath(notices[0])}`);
  await page.getByRole('link', { name: '← 전체 공지사항', exact: true }).click();
  await page.waitForURL('**/notice/');
  }
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const news = page.locator('#official-notices');
    assert.equal(await news.locator('[data-notice-slug]').count(), Math.min(notices.length, 3));
    assert.ok(await page.locator('#our-cookies').count());
    assert.ok(await page.locator('[data-journal-list]').count());
    assert.ok(await page.locator('.nm-floating-actions').isVisible(), 'existing order actions retained');
    await news.scrollIntoViewIfNeeded();
    // Isolate the new section in the artifact; fixed site controls stay intact in the page.
    await news.screenshot({ path: `${dir}/home-news-${width}.png`, style: '.showroom-header, .nm-floating-actions, .nm-skip-link { visibility: hidden !important; }' });
    if (notices.length) {
      const columns = await news.locator('ul').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width < 768 ? 1 : 3);
      const href = await news.locator('h3 a').first().getAttribute('href');
      await news.locator('h3 a').first().click();
      await page.waitForURL(`**${href}`);
    }
    evidence.push({ viewport: `${width}x900`, artifact: `home-news-${width}.png`, observation: 'Homepage news: responsive 1/3 column layout; product and journal sections retained' });
  }
  for (const pathname of ['/christmas/', '/pickup/', '/products/cookie-flight/', '/products/terminal-sand-cookie/', '/out/fortune/']) {
    await page.goto(base + pathname, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-notice-link][href="/notice/"]').count(), 1, `${pathname}: retained notice navigation after page scripts`);
    await page.locator('[data-notice-link]').click();
    await page.waitForURL('**/notice/');
  }
  // Mobile real touch, and a crawler/no-JS context, both follow plain static links.
  const touch = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await touch.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const mobile = await touch.newPage();
  await mobile.goto(`${base}/notice/`);
  if (notices.length) {
  const mobileLink = mobile.locator('.nm-notice-card h2 a').first();
  const mobileHref = await mobileLink.getAttribute('href');
  await mobileLink.tap();
  await mobile.waitForURL(`**${mobileHref}`);
  assert.ok(await mobile.locator('h1').isVisible());
  }
  await touch.close();
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const crawler = await noJs.newPage();
  for (const pathname of routes) {
    await crawler.goto(base + pathname);
    assert.ok((await crawler.locator('main').innerText()).length > 100);
    assert.equal(await crawler.locator('h1').count(), 1);
  }
  await noJs.close();
  for (const pathname of ['/notice/feed.xml', '/feed.xml', '/sitemap.xml']) {
    const response = await fetch(base + pathname);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /xml/);
    const text = await response.text();
    assert.ok(text.startsWith('<?xml'));
    assert.equal(await page.evaluate(xml => new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('parsererror').length, text), 0, `${pathname}: valid XML`);
  }
  assert.deepEqual(errors, [], 'no browser JS exceptions');
  assert.deepEqual(consoleErrors, [], 'no local console errors');
  assert.deepEqual(missing, [], 'no missing/failed local resources');
  assert.deepEqual(mutations, [], 'no order/production mutations');
  fs.writeFileSync(`${dir}/browser-results.json`, JSON.stringify({ passed: true, measurements, errors, consoleErrors, missing, mutations, renderedEvidence: evidence }, null, 2));
  console.log(`notices browser PASS: ${routes.length} routes × 6 widths, SeoulNotice/PretendardDisplay real font loading, home pinned first, keyboard/skip/focus/touch/navigation, no-JS crawl, XML HTTP, ${evidence.length} screenshots; no production writes`);
} finally { await browser?.close(); server.kill(); }
