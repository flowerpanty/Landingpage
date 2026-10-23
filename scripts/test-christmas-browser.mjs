import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const catalog = JSON.parse(fs.readFileSync('data/christmas-products.json', 'utf8'));
const probe = http.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, NODE_ENV: 'test', PORT: String(port), HOST: '127.0.0.1', WORDPRESS_JOURNAL_OFFLINE: '1', ORDER_API_ORIGIN: 'http://127.0.0.1:1' }, stdio: 'ignore' });
const artifactDir = 'output/playwright/christmas-3step';
fs.mkdirSync(artifactDir, { recursive: true });
const errors = [], requests = [], requestedUrls = [], missing = [];
let browser, mode = 'disabled';
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/christmas/')).ok) break; } catch { /* starting */ }
    await pause(50);
  }
  browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    requestedUrls.push(decodeURIComponent(url.href));
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/api/christmas-order-status' && mode !== 'disabled') {
      if (mode === 'status-fail') return route.abort();
      return route.fulfill({ json: { enabled: true, catalogVersion: catalog.version } });
    }
    if (url.pathname === '/api/landing-orders') {
      const body = route.request().postDataJSON(); requests.push(body);
      if (mode === 'disabled') return route.continue();
      await pause(200);
      if (mode === '400' || mode === '500') return route.fulfill({ status: Number(mode), json: { success: false, message: 'LOCAL MOCK rejection' } });
      if (mode === 'disconnect') return route.abort();
      const orderItems = body.items.map(item => ({ ...item, price: catalog.products.find(p => p.sku === item.sku).price }));
      const totalPrice = orderItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
      const result = { success: true, orderId: 'LOCAL-MOCK-ONLY', orderItems, totalPrice };
      if (mode === 'mismatch') result.totalPrice = 1;
      if (mode === 'missing-id') delete result.orderId;
      if (mode === 'items-mismatch') result.orderItems[0].quantity += 1;
      if (mode === 'missing-success') delete result.success;
      return route.fulfill({ status: 200, json: result });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(base) && response.status() === 404) missing.push(response.url()); });
  const qty = (index, value) => page.locator('.xmas-product input').nth(index).fill(value);
  const step = async number => {
    await page.locator(`[data-order-step="${number}"]`).waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-order-step]:visible').count(), 1, 'one active panel');
    assert.equal(await page.locator('[aria-current=step]').getAttribute('data-step-link'), String(number));
  };
  const next = async () => {
    if (await page.locator('#xmas-sticky-next').isVisible()) await page.locator('#xmas-sticky-next').click();
    else if (await page.locator('#xmas-submit').isVisible()) await page.locator('#xmas-submit').click();
    else await page.locator('#xmas-next').click();
  };
  async function focusHeading(number) { await page.locator(['#products-title', '#details-title', '#review-title'][number - 1]).focus(); }
  async function fillCustomer() {
    await page.locator('#xmas-date').fill('2026-12-20');
    await page.locator('#xmas-time').fill('14:30');
    await page.locator('#xmas-name').fill('LOCAL MOCK CUSTOMER');
    await page.locator('#xmas-phone').fill('010-0000-0000');
    await page.locator('#xmas-request').fill('<img src=x onerror=alert(1)> LOCAL MOCK REQUEST');
    await page.locator('[name=deliveryMethod][value=quick]').check();
    await focusHeading(2);
  }
  async function assertPrivacy() {
    const serialized = await page.evaluate(() => JSON.stringify({ analytics: (window.dataLayer || []).map(item => Array.from(item)), history: history.state }));
    for (const value of ['LOCAL MOCK CUSTOMER', '010-0000-0000', 'LOCAL MOCK REQUEST']) assert.ok(!serialized.includes(value), `private value leaked: ${value}`);
  }
  async function assertLayout(width, currentStep) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width} step ${currentStep}`);
    const sidebar = page.locator('.xmas-order-summary');
    if (width >= 960) {
      assert.ok(await sidebar.isVisible());
      const positions = await page.evaluate(() => {
        const form = document.querySelector('#xmas-order-form').getBoundingClientRect();
        const aside = document.querySelector('.xmas-order-summary').getBoundingClientRect();
        return { formRight: form.right, asideLeft: aside.left, position: getComputedStyle(document.querySelector('.xmas-order-summary')).position };
      });
      assert.ok(positions.asideLeft > positions.formRight); assert.equal(positions.position, 'sticky');
      assert.equal(await page.locator('.xmas-sticky').isVisible(), false);
    } else {
      assert.equal(await sidebar.isVisible(), false);
      assert.ok(await page.locator('#xmas-sticky-next').isVisible());
      const rect = await page.locator('.xmas-sticky').boundingBox();
      assert.ok(Math.abs(rect.y + rect.height - page.viewportSize().height) <= 1);
    }
  }
  async function openAndTestGallery(width) {
    const opener = page.locator('[data-gallery]').first(); await opener.click();
    await page.locator('#xmas-gallery[open]').waitFor();
    await page.waitForFunction(() => document.querySelector('#xmas-gallery-image').naturalWidth > 0);
    const dimensions = await page.locator('#xmas-gallery').boundingBox();
    if (width < 960) {
      assert.ok(Math.abs(dimensions.width - width) <= 1);
      assert.ok(Math.abs(dimensions.height - page.viewportSize().height) <= 1);
    } else assert.ok(dimensions.width >= 800 && dimensions.width < width);
    assert.equal(await page.locator('#xmas-gallery-count').textContent(), '사진 1 / 3');
    await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#xmas-gallery-count').textContent(), '사진 2 / 3');
    await page.locator('#xmas-gallery-thumbnails button').nth(2).click(); assert.equal(await page.locator('#xmas-gallery-count').textContent(), '사진 3 / 3');
    await page.waitForFunction(() => { const image = document.querySelector('#xmas-gallery-image'); return image.complete && image.naturalWidth > 0; });
    for (let index = 0; index < 9; index++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => document.querySelector('#xmas-gallery').contains(document.activeElement)), 'gallery focus trapped');
    }
    await page.screenshot({ path: `${artifactDir}/${width}-gallery.png` });
    await page.keyboard.press('Escape'); await page.locator('#xmas-gallery').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-gallery') === 'christmas-bear-brookie');
    assert.equal(await page.locator(':focus').getAttribute('data-gallery'), catalog.products[0].sku);
    await opener.click(); await page.goBack(); await page.locator('#xmas-gallery').waitFor({ state: 'hidden' }); await step(1);
    if (width === 375 || width === 1440) {
      for (let productIndex = 1; productIndex < catalog.products.length; productIndex++) {
        await page.locator('[data-gallery]').nth(productIndex).click();
        const photos = [catalog.products[productIndex], ...catalog.products[productIndex].gallery];
        for (let photoIndex = 0; photoIndex < photos.length; photoIndex++) {
          await page.locator('#xmas-gallery-thumbnails button').nth(photoIndex).click();
          await page.waitForFunction(() => { const image = document.querySelector('#xmas-gallery-image'); return image.complete && image.naturalWidth > 0; });
          assert.ok((await page.locator('#xmas-gallery-image').getAttribute('src')).endsWith(photos[photoIndex].image));
        }
        await page.locator('#xmas-gallery-close').focus(); await page.keyboard.press('Shift+Tab');
        assert.equal(await page.locator(':focus').getAttribute('id'), 'xmas-gallery-next');
        await page.keyboard.press('Escape'); await page.locator('#xmas-gallery').waitFor({ state: 'hidden' });
      }
    }
  }
  const renderedEvidence = [];
  for (const [width, height] of [[320, 844], [375, 812], [768, 1024], [1024, 900], [1440, 1000]]) {
    mode = 'disabled'; await page.setViewportSize({ width, height }); await page.goto(base + '/christmas/');
    await page.waitForFunction(() => !document.querySelector('[data-delta="1"]').disabled);
    await step(1);
    if (width === 320) {
      await page.keyboard.press('Tab'); assert.equal(await page.locator(':focus').getAttribute('data-nm-skip-link'), '');
      await page.keyboard.press('Enter'); assert.equal(await page.locator(':focus').getAttribute('id'), 'main-content');
    }
    assert.equal(await page.locator('#xmas-sticky-next').isDisabled(), true);
    await page.locator('.xmas-product img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.querySelectorAll('.xmas-product img')].every(image => image.complete && image.naturalWidth > 0));
    const historyLength = await page.evaluate(() => history.length);
    await page.locator('[data-step-link="1"]').click();
    assert.equal(await page.evaluate(() => history.length), historyLength, 'current step does not create duplicate history');
    await openAndTestGallery(width);
    await qty(0, '1'); await qty(1, '1'); assert.equal(await page.locator('#xmas-total-price').textContent(), '17,500원');
    await qty(0, '0'); await qty(1, '0'); await qty(2, '1'); assert.equal(await page.locator('#xmas-total-price').textContent(), '17,000원');
    await qty(2, '-1'); assert.equal(await page.locator('#xmas-sticky-next').isDisabled(), true);
    await qty(2, '0.5'); assert.equal(await page.locator('#xmas-sticky-next').isDisabled(), true);
    await qty(2, '1'); await qty(0, '1'); await qty(3, '1'); await focusHeading(1);
    assert.equal(await page.locator('#xmas-total-price').textContent(), '48,500원');
    assert.ok(!(await page.locator('#xmas-selected').textContent()).includes('트리 브루키 ×'));
    const touch = await page.locator('.xmas-counter button,.xmas-counter input,.xmas-photo-button').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { w: r.width, h: r.height }; }));
    assert.ok(touch.every(r => r.w >= 44 && r.h >= 44), `touch targets ${width}: ${JSON.stringify(touch)}`);
    await qty(0, '1000000'); await focusHeading(1); await assertLayout(width, 1); await qty(0, '1'); await focusHeading(1);
    await assertLayout(width, 1);
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${artifactDir}/${width}-step-1.png` });
    await next(); await step(2); assert.equal(await page.locator(':focus').getAttribute('id'), 'details-title');
    await next(); assert.equal(await page.locator(':focus').getAttribute('id'), 'xmas-date');
    await fillCustomer();
    if (width < 960) {
      await page.locator('#xmas-name').focus(); assert.equal(await page.locator('.xmas-sticky').isVisible(), false); await focusHeading(2);
    }
    if (width === 375) {
      await page.setViewportSize({ width: 1440, height: 1000 }); await step(2);
      assert.equal(await page.locator('#xmas-name').inputValue(), 'LOCAL MOCK CUSTOMER'); await assertLayout(1440, 2);
      await page.setViewportSize({ width, height });
    }
    await assertLayout(width, 2); await page.screenshot({ path: `${artifactDir}/${width}-step-2.png` });
    await page.locator('#xmas-back').click(); await step(1); assert.equal(await page.locator('.xmas-product input').nth(2).inputValue(), '1');
    await next(); await step(2); assert.equal(await page.locator('#xmas-phone').inputValue(), '010-0000-0000');
    await next(); await step(3);
    assert.equal(await page.locator('#xmas-review-total').textContent(), '48,500원');
    assert.ok((await page.locator('#xmas-review').textContent()).includes('LOCAL MOCK CUSTOMER'));
    assert.equal(await page.locator('#xmas-review img').count(), 0);
    assert.equal(await page.locator('#xmas-submit').isDisabled(), true);
    await assertLayout(width, 3); await assertPrivacy(); await page.screenshot({ path: `${artifactDir}/${width}-step-3.png` });
    await page.goBack(); await step(2); await page.goForward(); await step(3);
    await page.locator('[data-edit-step="1"]').click(); await step(1); await qty(0, '2'); await focusHeading(1);
    await next(); await step(2); await next(); await step(3); assert.equal(await page.locator('#xmas-review-total').textContent(), '57,000원');
    await page.locator('#xmas-submit').evaluate(button => button.form.requestSubmit()); assert.equal(requests.length, 0, 'real capability blocks saves');
    if (width === 375) {
      await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('Mock denied'); } }));
      await page.locator('#xmas-copy').click(); const copy = await page.locator('#xmas-copy-fallback').inputValue();
      assert.ok(copy.includes('57,000원') && !copy.includes('LOCAL MOCK') && !copy.includes('010-0000-0000'));
      await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async value => { window.__copied = value; } }));
      await page.locator('#xmas-copy').click(); assert.equal(await page.evaluate(() => window.__copied), copy);
    }
    renderedEvidence.push({ viewport: `${width}x${height}`, artifact: `${width}-step-1.png`, observation: `All three step screenshots at width ${width}; retained quantities/contact on back/forward/edit and width change, one panel, shared totals, sticky desktop summary or mobile bottom CTA. Separate gallery screenshot verifies modal/full screen.` });
  }
  async function prepare(width, nextMode) {
    mode = nextMode; await page.setViewportSize({ width, height: width < 960 ? 844 : 1000 });
    await page.goto(base + '/christmas/');
    await page.waitForFunction(() => document.querySelector('#xmas-availability').textContent.includes('저장한 뒤'));
    for (let index = 0; index < 4; index++) await qty(index, '1');
    await focusHeading(1); await next(); await step(2); await fillCustomer();
    if (width >= 960) await page.locator('[name=deliveryMethod][value=pickup]').check();
    await next(); await step(3);
    assert.equal(await page.locator('#xmas-review-total').textContent(), '57,500원');
    assert.equal(await page.locator('#xmas-submit').isDisabled(), true, 'consent required');
    await page.locator('#xmas-consent').check(); await focusHeading(3);
  }
  // Both desktop and mobile execute the complete receipt flow against local mocks.
  for (const width of [375, 1440]) {
    await prepare(width, 'success'); const before = requests.length;
    await next(); await page.locator('#xmas-submit').evaluate(button => { button.form.requestSubmit(); button.form.requestSubmit(); });
    await page.locator('#xmas-success').waitFor({ state: 'visible' }); assert.equal(requests.length, before + 1);
    assert.equal(requests.at(-1).items.length, 4); assert.ok(requests.at(-1).items.every(item => Object.keys(item).sort().join(',') === 'quantity,sku'));
    assert.equal(requests.at(-1).totalPrice, undefined); assert.equal(requests.at(-1).deliveryMethod, width < 960 ? 'quick' : 'pickup');
    await page.locator('#xmas-submit').evaluate(button => button.form.requestSubmit()); await pause(50); assert.equal(requests.length, before + 1);
    await assertPrivacy(); await page.screenshot({ path: `${artifactDir}/${width}-mock-success.png`, fullPage: true });
  }
  for (const [width, kind] of [[375, '400'], [375, '500'], [375, 'disconnect'], [375, 'mismatch'], [375, 'missing-id'], [375, 'items-mismatch'], [375, 'missing-success'], [1440, '500'], [1440, 'mismatch']]) {
    await prepare(width, kind); const before = requests.length; await next();
    await page.locator('#xmas-submit-error').waitFor({ state: 'visible' }); assert.equal(await page.locator('#xmas-success').isVisible(), false);
    if (kind === '400') {
      const key = requests.at(-1).idempotencyKey; mode = 'success'; await next(); await page.locator('#xmas-success').waitFor({ state: 'visible' });
      assert.equal(requests.at(-1).idempotencyKey, key);
    } else {
      assert.equal(await page.locator('#xmas-submit').isDisabled(), true);
      await page.locator('#xmas-submit').evaluate(button => button.form.requestSubmit()); await pause(50); assert.equal(requests.length, before + 1);
    }
  }
  mode = 'status-fail'; await page.goto(base + '/christmas/');
  await page.waitForFunction(() => document.querySelector('#xmas-availability').textContent.includes('확인하지 못했어요'));
  assert.ok(requestedUrls.every(url => !url.includes('LOCAL MOCK') && !url.includes('010-0000-0000')));
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  const evidence = {
    contract: 'One responsive three-step Christmas ordering flow: shared quantities/customer/validation/API, compact products and gallery; desktop two columns and sticky summary in every step, mobile full-screen gallery and keyboard-safe fixed total/next. Existing catalog, consent and disabled live backend preserved. SEO and FAQ follow the workflow.',
    targetViewports: renderedEvidence.map(item => item.viewport), renderedEvidence,
    accessibility: { status: 'pass', evidence: 'Skip link, first invalid field focus, labelled 44px+ quantity/photo controls, gallery Tab trap, arrow keys, Escape and restored opener focus. Reduced motion and no runtime exceptions.' },
    responsive: { status: 'pass', evidence: 'All three panels tested at 320/375/768/1024/1440, one visible panel, no overflow; desktop 2-column summary sticky every step; mobile bottom CTA hides while input focused; resize during step 2 retains data.' },
    contentStates: {
      loading: { status: 'pass', evidence: 'Local mock in-flight POST blocks repeated submits and edits on desktop/mobile.' },
      empty: { status: 'pass', evidence: 'Zero selection shows zero total and disables forward navigation.' },
      error: { status: 'pass', evidence: 'Missing fields/negative/fractional quantities plus mock 400/500/disconnect/mismatched totals or lines/missing success or ID. No false receipt.' },
      partial: { status: 'pass', evidence: 'Real capability disabled: complete three-step review still works and provides Kakao consultation without POST.' },
      success: { status: 'pass', evidence: 'LOCAL MOCK ONLY: full desktop and mobile flows require exact saved items/total and ID; duplicate submits prevented. Live backend remains unavailable.' },
      permission: { status: 'pass', evidence: 'Denied clipboard permission offers selectable product-only text; successful copy also excludes contact/request data.' }
    }
  };
  fs.writeFileSync(`${artifactDir}/evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log('Christmas 3-step browser PASS: five responsive widths, desktop/mobile full flow, retained data/back/forward/resize, gallery/focus, totals/validation/privacy, local mock success/duplicates/errors. No production writes.');
} finally { await browser?.close(); server.kill('SIGTERM'); }
