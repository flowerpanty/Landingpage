import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startNoticeTestServer, stopNoticeTestServer } from './notice-test-server.mjs';
import { playwrightRuntime, brandFonts, routeBrandFont, checkBrandFonts } from './notice-browser-support.mjs';

const output = 'output/playwright/national-aviation-museum';
fs.mkdirSync(output, { recursive: true });
const server = await startNoticeTestServer();
const { base } = server;
const pathname = '/national-aviation-museum/';
const errors = [], missing = [], mutations = [], measurements = [], evidence = [];
const products = [
  { name: 'COOKIE FLIGHT', detail: '/products/cookie-flight/', image: '/images/cookie-flight-box-open.jpg', pickup: 'https://naver.me/Ge7SnJnC', shipping: 'https://mkt.shopping.naver.com/link/6ad84808a30a4751f926bfde', shippingLabel: '택배주문' },
  { name: 'COOKIE CREW', detail: '/cookie-crew/', image: '/images/cookie-crew-bear-poster.jpg', pickup: 'https://naver.me/FjmgqAUo', shipping: 'https://pf.kakao.com/_QdCaK/chat', shippingLabel: '택배 문의' },
  { name: 'TERMINAL 샌드쿠키', detail: '/products/terminal-sand-cookie/', image: '/images/terminal/terminal-hero-package.jpg', pickup: 'https://naver.me/GArtG2FK', shipping: 'https://mkt.shopping.naver.com/link/6ad84808bb270c6ca6310878', shippingLabel: '택배주문' },
  { name: '수제 꾸덕쿠키', detail: '/products/handmade-cookie/', image: '/images/handmade-hero.jpg', pickup: 'https://naver.me/FQuvqNt0', shipping: 'https://pf.kakao.com/_QdCaK/chat', shippingLabel: '택배 문의' },
];
['cookie-flight', 'cookie-crew', 'terminal-sand-cookie', 'handmade-cookie'].forEach((id, index) => { products[index].id = id; });
const expectedAnalytics = (product, action, placement = 'collection') => [
  ({ collection: { pickup: 'museum_pickup_click', shipping: 'museum_shipping_click', inquiry: 'museum_shipping_inquiry_click' }, floating: { pickup: 'museum_floating_pickup_click', shipping: 'museum_floating_shipping_click' } })[placement][action],
  { product_id: product.id, placement, destination_type: ({ pickup: 'naver_pickup', shipping: 'smartstore_shipping', inquiry: 'kakao_inquiry' })[action], page_path: pathname },
];
const readAnalytics = page => page.evaluate(() => (window.dataLayer || []).filter(entry => entry?.[0] === 'event' && String(entry[1]).startsWith('museum_')).map(entry => [entry[1], entry[2]]));
const analyticsEvidence = [];
const externalUrls = new Set(products.flatMap(product => [product.pickup, product.shipping]));
const purchaseNavigations = [];
const mockPurchaseNavigation = route => {
  const request = route.request();
  if (!externalUrls.has(request.url()) || !request.isNavigationRequest()) return false;
  purchaseNavigations.push(request.url());
  return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="ko"><title>구매 채널 이동 테스트</title><body>로컬 모의 응답</body></html>' });
};
async function checkPurchasePopup(page, link, expectedUrl, touch = false, expected = null) {
  assert.equal(await link.getAttribute('href'), expectedUrl);
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  const before = await readAnalytics(page);
  const activate = async () => {
    if (touch === 'keyboard') { await link.focus(); return page.keyboard.press('Enter'); }
    return touch ? link.tap() : link.click();
  };
  const [popup] = await Promise.all([page.waitForEvent('popup'), activate()]);
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), expectedUrl);
  assert.equal(await popup.evaluate(() => window.opener === null), true, 'purchase tab has no opener');
  assert.equal(await popup.evaluate(() => document.referrer), '', 'noreferrer omits the guide referrer');
  await popup.close();
  const added = (await readAnalytics(page)).slice(before.length);
  assert.deepEqual(added, expected ? [expected] : [], 'one exact click event, or none when analytics is unavailable');
  analyticsEvidence.push({ destination: expectedUrl, event: expected, actual: added });
}
let browser;
try {
  browser = await playwrightRuntime().chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const fonts = await brandFonts();
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.method() !== 'GET') { mutations.push(request.url()); return route.abort(); }
    if (await routeBrandFont(route, fonts)) return;
    const mocked = mockPurchaseNavigation(route);
    if (mocked) return mocked;
    return new URL(request.url()).origin === base ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && message.location().url.startsWith(base)) errors.push(message.text()); });
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) missing.push([response.status(), response.url()]); });
  let commonContent;
  for (const width of [320, 390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal((await page.goto(base + pathname, { waitUntil: 'networkidle' })).status(), 200);
    const fontFaces = await checkBrandFonts(page);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal((await page.locator('h1').innerText()).replace(/\s+/g, ' '), '국립항공박물관 방문 가이드');
    assert.equal(await page.title(), '국립항공박물관 입장료·주차·예약·체험 안내 | 낫띵메터스');
    assert.equal(await page.locator('.museum-answer').count(), 5);
    assert.equal(await page.locator('.museum-faq summary').count(), 9);
    assert.ok((await page.locator('#museum-exhibition').innerText()).includes('2027.07.31'));
    assert.equal(await page.locator('#visit-checklist li').count(), 5);
    assert.equal(await page.evaluate(() => window[Symbol.for('nothingmatters.museum.analytics')]), true);
    const content = await page.locator('main').textContent();
    commonContent ??= content;
    assert.equal(content, commonContent, 'same content on desktop and mobile');
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://nothingmatters.co.kr' + pathname);
    const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, background: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.body).fontFamily }));
    assert.ok(geometry.scrollWidth <= width + 1, `horizontal overflow @${width}`);
    assert.equal(geometry.background, 'rgb(255, 255, 255)');
    assert.ok(geometry.font.includes('SeoulNotice'));
    const floating = page.locator('.museum-mobile-actions');
    assert.equal(await floating.locator('a').count(), 2);
    assert.deepEqual(await floating.locator('a').allTextContents(), ['픽업예약', '택배주문']);
    for (const [index, url] of [products[0].pickup, products[0].shipping].entries()) {
      const action = floating.locator('a').nth(index);
      assert.equal(await action.getAttribute('href'), url);
      assert.equal(await action.getAttribute('target'), '_blank');
      assert.equal(await action.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await action.getAttribute('aria-describedby'), 'museum-cookie-booking-note');
    }
    assert.equal(await floating.locator('#museum-cookie-booking-note').textContent(), 'COOKIE FLIGHT 전용 · 쿠키 예약·주문');
    assert.equal(await floating.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(239, 251, 243)');
    assert.deepEqual(await page.locator('.museum-product h3').allTextContents(), products.map(product => product.name));
    assert.equal(await page.locator('a a').count(), 0, 'no nested anchors');
    assert.equal(await page.locator('.museum-product a[href="/products/airplane-cookie/"]').count(), 0);
    for (const [index, product] of products.entries()) {
      const card = page.locator('.museum-product').nth(index);
      assert.equal(await card.locator('.museum-product-photo').getAttribute('href'), product.detail);
      assert.equal(await card.locator('h3 a').getAttribute('href'), product.detail);
      assert.equal(await card.locator('img').getAttribute('src'), product.image);
      assert.deepEqual(await card.locator('.museum-purchase-actions a').allTextContents(), ['네이버 픽업예약', product.shippingLabel]);
      const actions = card.locator('.museum-purchase-actions a');
      const sizes = [];
      for (const [actionIndex, url] of [product.pickup, product.shipping].entries()) {
        const action = actions.nth(actionIndex);
        assert.equal(await action.getAttribute('href'), url);
        assert.equal(await action.getAttribute('target'), '_blank');
        assert.equal(await action.getAttribute('rel'), 'noopener noreferrer');
        const metrics = await action.evaluate(element => {
          const style = getComputedStyle(element), range = document.createRange();
          range.selectNodeContents(element);
          return { height: element.getBoundingClientRect().height, overflow: element.scrollWidth > element.clientWidth, lines: range.getClientRects().length, background: style.backgroundColor, border: style.borderTopColor };
        });
        assert.ok(metrics.height >= 48 && !metrics.overflow && metrics.lines === 1, `${product.name} button fit @${width}: ${JSON.stringify(metrics)}`);
        assert.equal(metrics.background, actionIndex === 0 ? 'rgb(3, 199, 90)' : 'rgb(255, 255, 255)');
        assert.equal(metrics.border, 'rgb(3, 199, 90)');
        sizes.push(metrics.height);
      }
      assert.equal(sizes[0], sizes[1], 'equal button heights');
      assert.equal(await card.locator('.museum-purchase-actions').evaluate(element => getComputedStyle(element).rowGap), '8px');
    }
    for (const link of await page.locator('a:not(.nm-skip-link), summary').all()) {
      if (!(await link.isVisible())) continue;
      const box = await link.boundingBox();
      assert.ok(box.height >= 43, `touch target @${width}: ${await link.textContent()}`);
    }
    await page.locator('.museum-hero-photo img').waitFor();
    assert.ok(await page.locator('.museum-hero-photo img').evaluate(image => image.complete && image.naturalWidth > 0));
    const hero = await page.locator('.museum-hero-photo img').boundingBox();
    assert.ok(Math.abs(hero.width / hero.height - 1084 / 1341) < .01, 'hero preserves photo aspect ratio');
    await page.locator('#cookie-collection').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('.museum-product img')].every(image => image.complete && image.naturalWidth > 0));
    await page.locator('.museum-product img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const handmade = page.locator('.museum-product img[src="/images/handmade-hero.jpg"]');
    assert.deepEqual(await handmade.evaluate(image => [image.naturalWidth, image.naturalHeight]), [1024, 867]);
    const columns = await page.locator('.museum-products').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(columns, width >= 1024 ? 4 : 2);
    const quickColumns = await page.locator('.museum-quick-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(quickColumns, width >= 1280 ? 5 : width >= 768 ? 3 : 1);
    // Isolate the collection from fixed page controls in the section capture.
    await page.locator('#cookie-collection').screenshot({ path: `${output}/museum-products-${width}.png`, style: '.showroom-header, .museum-mobile-actions, .nm-skip-link { visibility: hidden !important; }' });
    for (const summary of await page.locator('summary').all()) {
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.equal(await summary.evaluate(element => element.parentElement.open), true, 'keyboard opens native FAQ');
      await page.keyboard.press('Enter');
      assert.equal(await summary.evaluate(element => element.parentElement.open), false);
    }
    if (width < 768) {
      assert.ok(await page.locator('.museum-mobile-actions').isVisible());
      const last = page.locator('.showroom-footer-links a').last();
      await last.scrollIntoViewIfNeeded();
      const target = await last.boundingBox(), bar = await page.locator('.museum-mobile-actions').boundingBox();
      assert.ok(target.y + target.height <= bar.y + 1, `footer remains above fixed CTA @${width}`);
    } else assert.equal(await page.locator('.museum-mobile-actions').isVisible(), false);
    await page.locator('summary').last().evaluate(element => element.blur());
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `${output}/museum-top-${width}.png` });
    const artifact = `museum-${width}.png`;
    await page.screenshot({ path: `${output}/${artifact}`, fullPage: true });
    evidence.push({ viewport: `${width}x900`, artifact, observation: 'Shared brand header, white page, preserved hero ratio, visit information, four photos, pickup, FAQ and sources; no overflow or CTA obstruction.' });
    measurements.push({ ...geometry, columns, quickColumns, fontFaces });
  }
  await page.goto(base + pathname);
  await page.keyboard.press('Tab');
  assert.ok(await page.locator('.nm-skip-link').evaluate(element => element === document.activeElement));
  assert.ok((await page.locator('.nm-skip-link').boundingBox()).y >= 0);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
  const heroAction = page.locator('.museum-actions a').first();
  await heroAction.focus();
  assert.equal(await heroAction.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
  await page.keyboard.press('Enter');
  await page.waitForURL('**#visit-info');
  assert.ok(await page.locator('#visit-title').isVisible());
  for (const anchor of await page.locator('.museum-answer a[href^="#"]').all()) {
    const id = (await anchor.getAttribute('href')).slice(1);
    await anchor.click();
    await page.waitForURL(`**#${id}`);
    const rect = await page.locator(`#${id}`).boundingBox();
    assert.ok(rect.y >= (await page.locator('.showroom-header').boundingBox()).height - 1, 'detail anchor is not hidden under the header');
  }
  const contrast = await page.evaluate(() => {
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    return [...document.querySelectorAll('.museum-lead, .museum-hero-note, .museum-eyebrow, .museum-source, .museum-product-tag, .showroom-button--dark, .museum-buy-button, #museum-cookie-booking-note')].map(element => {
      const style = getComputedStyle(element);
      let parent = element, background = style.backgroundColor;
      while (background === 'rgba(0, 0, 0, 0)' && parent.parentElement) { parent = parent.parentElement; background = getComputedStyle(parent).backgroundColor; }
      const first = luminance(style.color), second = luminance(background);
      return { selector: element.className || element.id, ratio: (Math.max(first, second) + .05) / (Math.min(first, second) + .05) };
    });
  });
  assert.ok(contrast.every(item => item.ratio >= 4.5), JSON.stringify(contrast));
  const hrefs = await page.locator('a').evaluateAll(elements => [...new Set(elements.map(element => element.getAttribute('href')).filter(href => href.startsWith('/') && !href.startsWith('//')))]);
  for (const href of hrefs) assert.equal((await fetch(base + href)).status, 200, `local navigation ${href}`);
  for (const [index, product] of products.entries()) {
    for (const selector of ['h3 a', '.museum-product-photo']) {
      await page.goto(base + pathname);
      await page.locator('.museum-product').nth(index).locator(selector).click();
      await page.waitForURL(`**${product.detail}`);
      assert.ok(await page.locator('h1').isVisible());
    }
    await page.goto(base + pathname);
    const actions = page.locator('.museum-product').nth(index).locator('.museum-purchase-actions a');
    await checkPurchasePopup(page, actions.nth(0), product.pickup, false, expectedAnalytics(product, 'pickup'));
    await checkPurchasePopup(page, actions.nth(1), product.shipping, false, expectedAnalytics(product, product.shippingLabel === '택배주문' ? 'shipping' : 'inquiry'));
    assert.equal(page.url(), base + pathname);
  }
  await page.goto(`${base}/gimpo/`);
  await page.locator('a[href="/national-aviation-museum/"]').click();
  await page.waitForURL(`**${pathname}`);
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const crawler = await noJs.newPage();
  await crawler.goto(base + pathname);
  assert.equal(await crawler.locator('.museum-product').count(), 4);
  await crawler.locator('summary').first().click();
  assert.equal(await crawler.locator('details').first().getAttribute('open'), '');
  assert.ok((await crawler.locator('main').innerText()).includes('예약 픽업 전용 작업실'));
  assert.equal(await crawler.locator('.museum-answer').count(), 5);
  await crawler.locator('.museum-product h3 a').first().click();
  await crawler.waitForURL('**/products/cookie-flight/');
  await noJs.close();
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await touch.route('**/*', route => {
    const request = route.request();
    if (request.method() !== 'GET') { mutations.push(request.url()); return route.abort(); }
    // Mock the external destination while checking the actual new-tab navigation.
    const mocked = mockPurchaseNavigation(route);
    if (mocked) return mocked;
    return new URL(request.url()).origin === base ? route.continue() : route.abort();
  });
  const mobile = await touch.newPage();
  for (const width of [320, 390]) {
    await mobile.setViewportSize({ width, height: 844 });
    await mobile.goto(base + pathname);
    await checkPurchasePopup(mobile, mobile.locator('.museum-mobile-actions a').nth(0), products[0].pickup, true, expectedAnalytics(products[0], 'pickup', 'floating'));
    await checkPurchasePopup(mobile, mobile.locator('.museum-mobile-actions a').nth(1), products[0].shipping, true, expectedAnalytics(products[0], 'shipping', 'floating'));
    assert.equal(mobile.url(), base + pathname, 'floating purchase leaves the guide intact');
  }
  assert.deepEqual(purchaseNavigations, [...products.flatMap(product => [product.pickup, product.shipping]), products[0].pickup, products[0].shipping, products[0].pickup, products[0].shipping]);
  await touch.close();
  // Duplicate script loading must not add a second listener; queries/fragments never enter GA params.
  await page.goto(`${base}${pathname}?private_test=do-not-send#private-fragment`, { waitUntil: 'networkidle' });
  const config = await page.evaluate(() => (window.dataLayer || []).find(entry => entry?.[0] === 'config' && entry[1] === 'G-DR5XLDB042')?.[2]);
  assert.deepEqual(config, { page_location: 'https://nothingmatters.co.kr' + pathname, page_path: pathname });
  await page.addScriptTag({ url: base + '/assets/national-aviation-museum-analytics.js' });
  await checkPurchasePopup(page, page.locator('.museum-product').first().locator('.museum-purchase-actions a').first(), products[0].pickup, 'keyboard', expectedAnalytics(products[0], 'pickup'));
  const beforeNonPurchase = await readAnalytics(page);
  await page.locator('.museum-answer a[href="#museum-hours"]').first().click();
  assert.deepEqual(await readAnalytics(page), beforeNonPurchase, 'visitor information is not a purchase event');
  assert.doesNotMatch(JSON.stringify(await readAnalytics(page)), /private_test|do-not-send|private-fragment|link_url|customer|phone|email/);
  await page.evaluate(() => { window.gtag = undefined; });
  assert.equal(await page.evaluate(() => typeof window.gtag), 'undefined');
  await checkPurchasePopup(page, page.locator('.museum-product').first().locator('.museum-purchase-actions a').first(), products[0].pickup);
  await page.evaluate(() => { window.gtag = () => { throw new Error('Analytics unavailable'); }; });
  await checkPurchasePopup(page, page.locator('.museum-product').first().locator('.museum-purchase-actions a').last(), products[0].shipping);
  const blocked = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await blocked.route('**/*', async route => {
    const request = route.request();
    if (request.method() !== 'GET') { mutations.push(request.url()); return route.abort(); }
    if (request.url().endsWith('/assets/national-aviation-museum-analytics.js')) return route.abort();
    if (await routeBrandFont(route, fonts)) return;
    const mocked = mockPurchaseNavigation(route);
    if (mocked) return mocked;
    return new URL(request.url()).origin === base ? route.continue() : route.abort();
  });
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', error => errors.push(error.message));
  await blockedPage.goto(base + pathname);
  assert.equal(await blockedPage.evaluate(() => window[Symbol.for('nothingmatters.museum.analytics')]), undefined);
  await checkPurchasePopup(blockedPage, blockedPage.locator('.museum-mobile-actions a').first(), products[0].pickup);
  await blocked.close();
  const failedImages = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await failedImages.route('**/*', async route => {
    if (route.request().resourceType() === 'image') return route.abort();
    if (await routeBrandFont(route, fonts)) return;
    return new URL(route.request().url()).origin === base ? route.continue() : route.abort();
  });
  const partial = await failedImages.newPage();
  await partial.goto(base + pathname, { waitUntil: 'networkidle' });
  await checkBrandFonts(partial);
  assert.ok(await partial.locator('h1').isVisible());
  assert.equal(await partial.locator('.museum-product h3 a').count(), 4);
  assert.equal(await partial.locator('.museum-purchase-actions a').count(), 8);
  await partial.locator('#cookie-collection').scrollIntoViewIfNeeded();
  await partial.screenshot({ path: `${output}/museum-image-failure-390.png`, fullPage: true });
  await failedImages.close();
  assert.deepEqual(errors, [], 'no local JavaScript/console errors');
  assert.deepEqual(missing, [], 'no failed local resources');
  assert.deepEqual(mutations, [], 'no order or other writes');
  fs.writeFileSync(`${output}/browser-results.json`, JSON.stringify({ passed: true, measurements, contrast, errors, missing, mutations, purchaseNavigations, analyticsEvidence, renderedEvidence: evidence }, null, 2));
  console.log(`museum browser PASS: five widths 320/390/768/1280/1440, quick answers/details/9 FAQs, preserved four products and purchase channels, green contrast/safe CTA; ${purchaseNavigations.length} mocked external popups, five exact click events without duplication/private URL values, duplicate script/keyboard/missing or throwing gtag/blocked analytics/no-JS resilience; no production writes`);
} finally { await browser?.close(); await stopNoticeTestServer(server); }
