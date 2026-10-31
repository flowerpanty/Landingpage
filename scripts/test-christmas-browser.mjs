import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { brandFonts, routeBrandFont, checkBrandFonts } from './notice-browser-support.mjs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const catalog = JSON.parse(fs.readFileSync('data/christmas-products.json', 'utf8'));
const { representative: thumbnail, workshop: workshopPhoto } = JSON.parse(fs.readFileSync('data/christmas-media.json', 'utf8'));
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
  const fonts = await brandFonts();
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/christmas/')).ok) break; } catch { /* starting */ }
    await pause(50);
  }
  browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 812 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.__xmasVitals = { lcp: null, cls: 0 };
    let sessionStart = 0, lastShift = 0, sessionValue = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__xmasVitals.lcp = Math.round(entry.startTime);
    }).observe({type:'largest-contentful-paint', buffered:true});
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        if (entry.startTime - lastShift > 1000 || entry.startTime - sessionStart > 5000) {
          sessionStart = entry.startTime; sessionValue = 0;
        }
        sessionValue += entry.value; lastShift = entry.startTime;
        window.__xmasVitals.cls = Math.max(window.__xmasVitals.cls, sessionValue);
      }
    }).observe({type:'layout-shift', buffered:true});
  });
  const imageResponses = [], crawlerResponses = [], labVitals = [];
  for(const [file,type] of [[workshopPhoto.image,'image/webp'],[workshopPhoto.fallback,'image/jpeg']]){
    const response=await context.request.get(base+file);
    assert.equal(response.status(),200);assert.equal(response.headers()['content-type'],type);
    assert.deepEqual(await response.body(),fs.readFileSync('.'+file));
    imageResponses.push({image:file,status:response.status(),contentType:type});
  }
  for (const userAgent of ['Mozilla/5.0', 'Googlebot-Image/1.0', 'Yeti/1.1', 'bingbot/2.0', 'facebookexternalhit/1.1', 'Twitterbot/1.0']) {
    const response = await context.request.get(base + thumbnail.image, { headers: { 'User-Agent': userAgent } });
    assert.equal(response.status(), 200, `anonymous image GET: ${userAgent}`);
    assert.equal(response.headers()['content-type'], 'image/jpeg');
    assert.ok(!/noindex|noimageindex|none/i.test(response.headers()['x-robots-tag'] || ''));
    assert.deepEqual(await response.body(), fs.readFileSync('.' + thumbnail.image));
    imageResponses.push({ userAgent, status: response.status(), contentType: response.headers()['content-type'] });
  }
  for (const userAgent of ['Googlebot/2.1', 'Yeti/1.1']) {
    const response = await context.request.get(base + '/christmas/', {headers:{'User-Agent':userAgent}});
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-type'], /text\/html/);
    assert.ok(!/noindex|none/i.test(response.headers()['x-robots-tag'] || ''));
    const source = await response.text();
    assert.match(source, /<meta name="robots" content="index,follow/);
    assert.match(source, /rel="canonical" href="https:\/\/nothingmatters.co.kr\/christmas\/"/);
    for (const product of catalog.products) assert.ok(source.includes(product.name) && source.includes(product.price.toLocaleString('ko-KR')+'원'));
    assert.equal((source.match(/<h1\b/g)||[]).length, 1);
    crawlerResponses.push({userAgent, status:response.status(), contentType:response.headers()['content-type']});
  }
  const imageHead = await context.request.head(base + thumbnail.image);
  assert.equal(imageHead.status(), 200); assert.equal(imageHead.headers()['content-type'], 'image/jpeg');
  const robotsResponse = await context.request.get(base + '/robots.txt');
  assert.equal(robotsResponse.status(), 200); assert.match(await robotsResponse.text(), /User-agent: \*\s+Allow: \//);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    requestedUrls.push(decodeURIComponent(url.href));
    if (await routeBrandFont(route, fonts)) return;
    if (url.href === 'https://pf.kakao.com/_QdCaK/chat') return route.fulfill({contentType:'text/html', body:'<!doctype html><title>LOCAL MOCK 상담</title>'});
    if (url.href === 'https://instagram.com/nothingmatters_c') return route.fulfill({contentType:'text/html', body:'<!doctype html><title>LOCAL MOCK Instagram</title>'});
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
  async function assertProductConsultation() {
    const link = page.locator('.xmas-product-consult');
    assert.equal(await link.getAttribute('href'), 'https://pf.kakao.com/_QdCaK/chat');
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    const box = await link.boundingBox(); assert.ok(box.height >= 44 && box.width >= 44);
    const opened = page.waitForEvent('popup'); await link.click();
    const popup = await opened; await popup.waitForLoadState('domcontentloaded');
    assert.equal(popup.url(), 'https://pf.kakao.com/_QdCaK/chat', 'consultation has no quantity or private URL parameters');
    assert.match(await popup.title(), /LOCAL MOCK/); await popup.close();
    await step(1);
  }
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
    if (width === 390 || width === 1440) {
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
  const renderedEvidence = [], brandEvidence = [], storefrontEvidence = [];
  async function assertStorefront(width){
    const image=page.locator('.xmas-about-media img'),source=page.locator('.xmas-about-media source');
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(photo=>{const i=document.querySelector('.xmas-about-media img');return i.complete&&i.naturalWidth===photo.width&&i.naturalHeight===photo.height&&new URL(i.currentSrc).pathname===photo.image;},workshopPhoto);
    await image.evaluate(async node=>{await node.decode();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    const actual=await image.evaluate(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height,naturalWidth:node.naturalWidth,naturalHeight:node.naturalHeight,fit:getComputedStyle(node).objectFit,transform:getComputedStyle(node).transform,src:new URL(node.currentSrc).pathname};});
    assert.equal(actual.fit,'contain');assert.equal(actual.transform,'none');
    assert.ok(Math.abs(actual.width/actual.height-workshopPhoto.width/workshopPhoto.height)<.002,'complete original storefront ratio; no crop or distortion');
    assert.ok(actual.width>= (width<640?width*.7:width<960?600:width*.35),'large real workshop photo');
    assert.ok(actual.width<=workshopPhoto.width,'no original photo upscaling');
    assert.equal(await image.getAttribute('alt'),workshopPhoto.alt);
    assert.equal(await page.locator('#xmas-about-title').textContent(),'이 쿠키는 여기서 만들어요.');
    assert.equal(await page.locator('.xmas-brand-intro').textContent(),'낫띵메터스는 서울 강서구 공항동에서 귀여운 캐릭터 쿠키와 마음을 전하는 선물을 만드는 작은 쿠키 작업실이에요.');
    assert.equal(await page.locator('.xmas-brand-season').textContent(),'올해 크리스마스에도 곰돌이와 트리, 산타와 루돌프를 쿠키에 담았습니다.');
    await page.screenshot({path:`${artifactDir}/${width}-storefront.png`});
    if([390,1280].includes(width)){
      // Locally disable the WebP source to exercise the real JPEG fallback, without changing the application.
      await source.evaluate(node=>node.media='not all');
      await page.waitForFunction(photo=>{const i=document.querySelector('.xmas-about-media img');return i.complete&&i.naturalWidth===photo.width&&new URL(i.currentSrc).pathname===photo.fallback;},workshopPhoto);
      await image.evaluate(node=>node.decode());
      assert.ok(Math.abs((await image.boundingBox()).height-actual.height)<1,'fallback preserves the reserved photo area');
      await source.evaluate(node=>node.removeAttribute('media'));
      await page.waitForFunction(photo=>new URL(document.querySelector('.xmas-about-media img').currentSrc).pathname===photo.image,workshopPhoto);
      await image.evaluate(node=>node.decode());
    }
    storefrontEvidence.push({viewport:width,...actual,jpegFallbackTested:[390,1280].includes(width)});
  }
  async function assertBrand(width) {
    const faces = await checkBrandFonts(page);
    const loaded = faces.filter(face => face.status === 'loaded');
    for (const weight of ['500', '700', '900']) assert.ok(loaded.some(face => face.family === 'SeoulNotice' && face.weight === weight), `actual SeoulNotice ${weight} loaded`);
    assert.match(await page.locator('body').evaluate(node => getComputedStyle(node).fontFamily), /SeoulNotice/);
    assert.match(await page.locator('.xmas-brand').first().evaluate(node => getComputedStyle(node).fontFamily), /PretendardDisplay/);
    assert.equal(await page.locator('.xmas-header-nav a').count(), 3);
    const headerRects = await page.locator('.xmas-header a').evaluateAll(nodes => nodes.map(node => {const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};}));
    for (const [i,rect] of headerRects.entries()) {
      assert.ok(rect.left >= 0 && rect.right <= width && rect.height >= 44, `header touch area at ${width}`);
      for (const other of headerRects.slice(i+1)) assert.ok(rect.right <= other.left || other.right <= rect.left || rect.bottom <= other.top || other.bottom <= rect.top, `header links never overlap at ${width}`);
    }
    assert.ok(await page.locator('.xmas-brand-copy').isVisible());
    assert.ok((await page.locator('#about-nothingmatters').textContent()).includes('카카오톡 상담으로 확정'));
    const contrast = await page.evaluate(() => {
      const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);
      const ratio = (a,b) => {const [lo,hi]=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (hi+.05)/(lo+.05);};
      return ['.xmas-header-consult','#xmas-next','.xmas-button-green','.xmas-brand-intro','.xmas-photo-label','#xmas-name'].map(selector=>{
        const node=document.querySelector(selector),style=getComputedStyle(node);
        let background=style.backgroundColor, ancestor=node;
        while (background==='rgba(0, 0, 0, 0)' && ancestor.parentElement) {ancestor=ancestor.parentElement;background=getComputedStyle(ancestor).backgroundColor;}
        return {selector,text:ratio(style.color,background),border:selector==='#xmas-name'?ratio(style.borderTopColor,background):null};
      });
    });
    for (const item of contrast) {assert.ok(item.text>=4.5, `brand text contrast ${JSON.stringify(item)}`);if(item.border)assert.ok(item.border>=3,'input boundary contrast');}
    for (const area of ['.xmas-header','#about-nothingmatters','.xmas-footer']) {
      const instagram=page.locator(`${area} a[href="https://instagram.com/nothingmatters_c"]`);
      assert.equal(await instagram.getAttribute('target'),'_blank'); assert.equal(await instagram.getAttribute('rel'),'noopener noreferrer');
      assert.ok(await page.locator(`${area} a[href="/"]`).count()>0);
      if ([390,1440].includes(width)) {
        const opened=page.waitForEvent('popup');await instagram.click();const popup=await opened;await popup.waitForLoadState('domcontentloaded');
        assert.equal(popup.url(),'https://instagram.com/nothingmatters_c');assert.equal(await popup.evaluate(()=>window.opener),null);await popup.close();
      }
    }
    if ([390,1440].includes(width)) {
      await page.locator('.xmas-header-nav a[href="/"]').click();await page.waitForURL(base+'/');
      await page.goBack();await page.waitForFunction(()=>!document.querySelector('[data-delta="1"]').disabled);await checkBrandFonts(page);
    }
    await page.evaluate(()=>scrollTo(0,0));
    brandEvidence.push({width,faces:loaded,headerRects,contrast,channels:'Home link navigates locally; all three Instagram links open their exact URL in isolated local mock tabs at 390/1440. No external account writes.'});
  }
  for (const [width, height] of [[320, 844], [390, 844], [430, 932], [768, 1024], [1024, 900], [1280, 900], [1440, 1000]]) {
    mode = 'disabled'; await page.setViewportSize({ width, height }); await page.goto(base + '/christmas/');
    await page.waitForFunction(() => !document.querySelector('[data-delta="1"]').disabled);
    await step(1);
    await assertBrand(width);
    assert.equal(await page.locator('h1').textContent(), '2026 크리스마스 쿠키 세트·선물');
    assert.ok(await page.locator('.xmas-brand-intro').isVisible(), 'brand introduction remains visible in HTML');
    await page.waitForFunction(() => { const image = document.querySelector('#xmas-hero-image'); return image.complete && image.naturalWidth === 1200 && image.naturalHeight === 630; });
    const heroImage = page.locator('#xmas-hero-image');
    assert.ok(await heroImage.isVisible());
    assert.equal(await heroImage.getAttribute('src'), thumbnail.image);
    const heroRect = await heroImage.boundingBox();
    assert.ok(heroRect.width <= thumbnail.width, 'hero stays within the original image resolution');
    assert.ok(heroRect.y >= 0 && heroRect.y + heroRect.height < height, `hero in initial viewport ${width}`);
    assert.ok(Math.abs(heroRect.width / heroRect.height - 1200 / 630) < 0.04, 'photo ratio preserved');
    for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) assert.equal(await page.locator(selector).getAttribute('content'), 'https://nothingmatters.co.kr' + thumbnail.image);
    assert.equal(await page.locator('#gift-guide li').count(), 4);
    for (const product of catalog.products) {
      const summary = page.locator(`[data-summary-sku="${product.sku}"]`);
      assert.ok((await summary.textContent()).includes(product.name));
      assert.ok((await summary.textContent()).includes(product.price.toLocaleString('ko-KR')+'원'));
    }
    assert.equal(await page.locator('#gift-choice article').count(), 4);
    assert.equal(await page.locator('#gift-comparison [data-compare-sku]').count(), 4);
    assert.equal(await page.locator('#ordering-guide li').count(), 4);
    const comparisonColumns = await page.locator('.xmas-comparison-grid').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
    assert.equal(comparisonColumns, width < 640 ? 1 : width < 1200 ? 2 : 4);
    for (const product of catalog.products) {
      const comparison = page.locator(`[data-compare-sku="${product.sku}"]`);
      assert.equal(await comparison.locator('h3').textContent(), product.name);
      assert.equal(await comparison.locator('[data-compare-composition]').textContent(), product.composition);
      assert.equal(await comparison.locator('.xmas-comparison-price').textContent(), `${product.price.toLocaleString('ko-KR')}원`);
    }
    const firstScreen = await page.evaluate(() => {
      const image=document.querySelector('#xmas-hero-image').getBoundingClientRect(), cta=document.querySelector('#xmas-hero-order').getBoundingClientRect();
      return {heroWidth:image.width,heroHeight:image.height,ctaTop:cta.top,ctaBottom:cta.bottom,bottom:innerWidth<960?document.querySelector('.xmas-sticky').getBoundingClientRect().top:innerHeight};
    });
    assert.ok(firstScreen.heroWidth>=Math.min(width*.85,1180), `image-first hero at ${width}: ${JSON.stringify(firstScreen)}`);
    assert.ok(firstScreen.ctaTop>=0 && firstScreen.ctaBottom<=firstScreen.bottom, `hero selection link clears fixed CTA ${width}`);
    assert.equal(await page.locator('#xmas-hero-image').evaluate(node=>getComputedStyle(node).objectFit),'contain','hero shows the complete actual photograph');
    assert.ok(await page.locator('#about-nothingmatters .xmas-about-media img').isVisible());
    if (width === 320) {
      await page.setViewportSize({width:320,height:667});
      const shortScreen=await page.evaluate(()=>({ctaBottom:document.querySelector('#xmas-hero-order').getBoundingClientRect().bottom,bottom:document.querySelector('.xmas-sticky').getBoundingClientRect().top,overflow:document.documentElement.scrollWidth>innerWidth}));
      assert.ok(shortScreen.ctaBottom<=shortScreen.bottom,'large hero still offers an unobscured route to selection on 320x667');
      assert.equal(shortScreen.overflow,false);firstScreen.shortViewport={viewport:'320x667',...shortScreen};
      await page.screenshot({path:`${artifactDir}/320x667-first-screen.png`});await page.setViewportSize({width,height});
    }
    await page.waitForFunction(() => window.__xmasVitals.lcp !== null);
    await pause(250);
    const vitals = await page.evaluate(() => window.__xmasVitals);
    assert.ok(vitals.cls <= 0.1, `initial layout shifts ${width}: ${vitals.cls}`);
    labVitals.push({width, ...vitals, profile:'Local Chromium, default CPU/network, real brand font bytes replayed from successful CDN fetches, external scripts blocked; viewport-based lab observation, not cold-network mobile field data'});
    if (width === 320) {
      await page.keyboard.press('Tab'); assert.equal(await page.locator(':focus').getAttribute('data-nm-skip-link'), '');
      await page.keyboard.press('Enter'); assert.equal(await page.locator(':focus').getAttribute('id'), 'main-content');
    }
    assert.equal(await page.locator('#xmas-sticky-next').isDisabled(), true);
    await page.locator('.xmas-product img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.querySelectorAll('.xmas-product img')].every(image => image.complete && image.naturalWidth > 0));
    const photoLayout=await page.locator('.xmas-product').evaluateAll(cards=>cards.map(card=>{
      const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
      const image=card.querySelector('figure img');
      return {sku:card.dataset.sku,card:rect(card),image:rect(image),figure:rect(card.querySelector('figure')),info:rect(card.querySelector('.xmas-product-info')),counter:rect(card.querySelector('.xmas-counter')),fit:getComputedStyle(image).objectFit,natural:[image.naturalWidth,image.naturalHeight],caption:rect(card.querySelector('figcaption'))};
    }));
    assert.equal(await page.locator('.xmas-products').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length),width<960?1:2);
    for(const item of photoLayout){
      assert.equal(item.fit,'contain');assert.ok(item.image.width>=item.card.width*.95,'photo occupies the full card width');
      assert.ok(item.image.width<=item.natural[0] && item.image.height<=item.natural[1],'no unnecessary product photo enlargement');
      assert.ok(item.image.width>=(width<640?width*.8:width<960?500:240),`large product image at ${width}: ${JSON.stringify(item)}`);
      assert.ok(item.image.height>item.card.height*.5,'real photo dominates the product card');
      assert.ok(item.info.y>=item.figure.bottom && item.counter.y>=item.info.bottom,'name, price and quantity controls follow the photo');
      assert.ok(item.caption.height>=16,'actual composition caption is visible');
    }
    firstScreen.photoLayout=photoLayout;
    await page.locator('#xmas-hero-order').click();await step(1);
    assert.ok(await page.locator('#christmas-order').evaluate(node=>Math.abs(node.getBoundingClientRect().top-20)<3),'hero anchor reaches the order collection');
    await page.goBack();await step(1);await page.evaluate(()=>scrollTo(0,0));
    let clickedTotal=0;
    for(const product of catalog.products){
      await page.locator(`[data-sku="${product.sku}"] [data-delta="1"]`).click();clickedTotal+=product.price;
      assert.equal(await page.locator('#xmas-total-price').textContent(),clickedTotal.toLocaleString('ko-KR')+'원','large-card plus buttons retain the shared total');
      if(width<960)assert.ok(await page.locator('.xmas-sticky').isVisible(),'pointer quantity changes keep the mobile next action available');
    }
    for(const product of catalog.products)await page.locator(`[data-sku="${product.sku}"] [data-delta="-1"]`).click();
    assert.equal(await page.locator('#xmas-total-price').textContent(),'0원');
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
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${artifactDir}/${width}-hero.png` });
    await page.locator('#christmas-order').evaluate(node=>node.scrollIntoView({block:'start'}));await page.screenshot({ path: `${artifactDir}/${width}-step-1.png` });
    await next(); await step(2); assert.equal(await page.locator(':focus').getAttribute('id'), 'details-title');
    await next(); assert.equal(await page.locator(':focus').getAttribute('id'), 'xmas-date');
    await fillCustomer();
    if (width < 960) {
      await page.locator('#xmas-name').focus(); assert.equal(await page.locator('.xmas-sticky').isVisible(), false); await focusHeading(2);
    }
    if (width === 390) {
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
    if ([390,1440].includes(width)) {
      await assertProductConsultation();
      assert.equal(await page.locator('#xmas-phone').inputValue(), '010-0000-0000');
      assert.equal(await page.locator('.xmas-product input').first().inputValue(), '2');
      await assertPrivacy();
    }
    await next(); await step(2); await next(); await step(3); assert.equal(await page.locator('#xmas-review-total').textContent(), '57,000원');
    await page.locator('#xmas-submit').evaluate(button => button.form.requestSubmit()); assert.equal(requests.length, 0, 'real capability blocks saves');
    if (width === 390) {
      await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('Mock denied'); } }));
      await page.locator('#xmas-copy').click(); const copy = await page.locator('#xmas-copy-fallback').inputValue();
      assert.ok(copy.includes('57,000원') && !copy.includes('LOCAL MOCK') && !copy.includes('010-0000-0000'));
      await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async value => { window.__copied = value; } }));
      await page.locator('#xmas-copy').click(); assert.equal(await page.evaluate(() => window.__copied), copy);
    }
    await assertStorefront(width);
    for (const id of ['about-nothingmatters', 'gift-choice', 'gift-comparison', 'ordering-guide', 'group-orders']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await step(3);
      assert.equal(await page.locator('#xmas-review-total').textContent(), '57,000원', 'reading guidance preserves the reviewed order');
      assert.equal(await page.locator('#xmas-phone').inputValue(), '010-0000-0000');
    }
    if ([320, 390, 1440].includes(width)) {
      for (const id of ['gift-choice', 'gift-comparison', 'ordering-guide']) {
        await page.locator(`#${id}`).screenshot({ path: `${artifactDir}/${width}-${id}.png` });
      }
    }
    renderedEvidence.push({ firstScreen, viewport: `${width}x${height}`, artifact: `${width}-step-1.png`, observation: `All three step screenshots at width ${width}; retained quantities/contact on back/forward/edit and width change, one panel, shared totals, sticky desktop summary or mobile bottom CTA. Separate gallery screenshot verifies modal/full screen.` });
  }
  // SEO content is available as static HTML, even with ordering JavaScript disabled.
  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await staticContext.route('**/*', async route => {if(await routeBrandFont(route,fonts))return;return new URL(route.request().url()).origin === base ? route.continue() : route.abort();});
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base + '/christmas/');
  assert.ok(await staticPage.locator('#gift-guide').isVisible());
  assert.ok(await staticPage.locator('.xmas-product-consult').isVisible());
  assert.ok(await staticPage.locator('#xmas-hero-image').isVisible());
  assert.equal(await staticPage.locator('#xmas-hero-image').getAttribute('src'), thumbnail.image);
  assert.equal(await staticPage.locator('.xmas-product').count(), 4);
  assert.ok((await staticPage.locator('noscript').textContent()).includes('카카오톡으로 상담'));
  for (const product of catalog.products) {
    const card = staticPage.locator(`[data-sku="${product.sku}"]`);
    assert.ok((await card.textContent()).includes(`${product.price.toLocaleString('ko-KR')}원`));
  }
  for (const id of ['about-nothingmatters', 'gift-guide', 'gift-choice', 'gift-comparison', 'ordering-guide', 'seoul-pickup']) {
    assert.ok(await staticPage.locator(`#${id}`).isVisible(), `static purchase guidance: ${id}`);
  }
  assert.equal(await staticPage.locator('#gift-choice article').count(), 4);
  for (const product of catalog.products) {
    const comparison = staticPage.locator(`[data-compare-sku="${product.sku}"]`);
    assert.equal(await comparison.locator('[data-compare-composition]').textContent(), product.composition);
    assert.equal(await comparison.locator('.xmas-comparison-price').textContent(), `${product.price.toLocaleString('ko-KR')}원`);
  }
  assert.equal(await staticPage.locator('#faq details').count(), 13);
  const staticFaqs = await staticPage.locator('#faq details').evaluateAll(nodes => nodes.map(node => [node.querySelector('summary').textContent.trim(), node.querySelector('p').textContent.trim()]));
  const structuredFaqs = await staticPage.locator('[data-nm-schema]').textContent();
  assert.deepEqual(JSON.parse(structuredFaqs)['@graph'].find(node => node['@type'] === 'FAQPage').mainEntity.map(node => [node.name, node.acceptedAnswer.text]), staticFaqs);
  await staticPage.locator('#faq summary').first().click();
  assert.ok(await staticPage.locator('#faq details').first().locator('p').isVisible());
  assert.ok((await staticPage.locator('#seoul-pickup').textContent()).includes('예약 없이 방문하시면 바로 구매할 쿠키가 없습니다.'));
  for (const href of ['/pickup/', '/magok-cookie/', '/corporate-gift/', '/guides/corporate-event-cookie/', '/guides/teacher-snack-gift/']) {
    assert.equal((await staticContext.request.get(base + href)).status(), 200, `internal link ${href}`);
  }
  for (const pathname of ['/small-gift/', '/bulk/', '/guides/', '/corporate-gift/']) {
    const response = await staticContext.request.get(base + pathname);
    assert.equal(response.status(), 200);
    assert.equal(((await response.text()).match(/href="\/christmas\/"/g) || []).length, 1, `seasonal link on ${pathname}`);
  }
  await staticPage.screenshot({ path: `${artifactDir}/390-no-js.png`, fullPage: true });
  await staticContext.close();

  // Native FAQ controls remain keyboard accessible and do not alter order state.
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width < 960 ? 844 : 1000 });
    await page.goto(base + '/christmas/?campaign=seo-regression');
    await page.waitForFunction(() => !document.querySelector('[data-delta="1"]').disabled);
    for (const details of await page.locator('#faq details').all()) {
      await details.locator('summary').focus(); await page.keyboard.press('Enter');
      assert.ok(await details.locator('p').isVisible());
    }
    await step(1);
    assert.equal(await page.locator('#xmas-total-price').textContent(), '0원');
    const analytics = await page.evaluate(() => (window.dataLayer || []).map(item => Array.from(item)));
    const config = analytics.find(item => item[0] === 'config');
    assert.equal(config[2].page_location, base + '/christmas/');
    assert.ok(!JSON.stringify(analytics).includes('seo-regression'), 'analytics excludes URL query');
    await page.locator('#group-orders').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${artifactDir}/${width}-seo-content.png`, fullPage: true });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    if (width < 960) {
      const footer = await page.locator('.xmas-footer small').boundingBox();
      const sticky = await page.locator('.xmas-sticky').boundingBox();
      assert.ok(footer.y + footer.height < sticky.y, 'footer content clears mobile CTA');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
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
  for (const width of [390, 1440]) {
    await prepare(width, 'success'); const before = requests.length;
    await next(); await page.locator('#xmas-submit').evaluate(button => { button.form.requestSubmit(); button.form.requestSubmit(); });
    await page.locator('#xmas-success').waitFor({ state: 'visible' }); assert.equal(requests.length, before + 1);
    assert.equal(requests.at(-1).items.length, 4); assert.ok(requests.at(-1).items.every(item => Object.keys(item).sort().join(',') === 'quantity,sku'));
    assert.equal(requests.at(-1).totalPrice, undefined); assert.equal(requests.at(-1).deliveryMethod, width < 960 ? 'quick' : 'pickup');
    await page.locator('#xmas-submit').evaluate(button => button.form.requestSubmit()); await pause(50); assert.equal(requests.length, before + 1);
    await assertPrivacy(); await page.screenshot({ path: `${artifactDir}/${width}-mock-success.png`, fullPage: true });
  }
  for (const [width, kind] of [[390, '400'], [390, '500'], [390, 'disconnect'], [390, 'mismatch'], [390, 'missing-id'], [390, 'items-mismatch'], [390, 'missing-success'], [1440, '500'], [1440, 'mismatch']]) {
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
    contract: 'One responsive three-step Christmas ordering flow: shared quantities/customer/validation/API, large image-first product cards and gallery; desktop two columns and sticky summary in every step, mobile full-screen gallery and keyboard-safe fixed total/next. Existing catalog, consent and disabled live backend preserved. A wide uncropped actual hero precedes the collection; price summary follows ordering and the photo-led brand introduction; recipient advice, four catalog comparisons, order guidance, Seoul/group facts and 13 FAQs follow the workflow and work without JavaScript.',
    targetViewports: renderedEvidence.map(item => item.viewport), renderedEvidence, imageResponses, crawlerResponses, labVitals, brandEvidence, storefrontEvidence,
    seo: { status: 'pass', evidence: 'Static recipient advice, catalog price/composition/packaging comparison, order guide and 13 FAQs work with JavaScript disabled; exact visible/JSON-LD FAQ parity, local guide links return 200, keyboard FAQ controls preserve selection, wide uncropped hero and direct order navigation in every initial viewport, full-width product photos with information below, analytics excludes query strings.' },
    accessibility: { status: 'pass', evidence: 'Skip link, first invalid field focus, labelled 44px+ quantity/photo controls, gallery Tab trap, arrow keys, Escape and restored opener focus. Reduced motion and no runtime exceptions.' },
    responsive: { status: 'pass', evidence: 'All three panels tested at 320/390/430/768/1024/1280/1440, one visible panel, no overflow; desktop 2-column summary sticky every step; mobile bottom CTA hides while input focused; resize during step 2 retains data.' },
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
  console.log('Christmas 3-step browser PASS: seven widths, loaded homepage brand fonts, header touch areas, text/input contrast, exact home/Instagram navigation, static ABOUT; unchanged order/gallery/calculation/privacy flow, 13 FAQs, Kakao consultation, Googlebot/Yeti HTML 200, image-first hero and large uncropped product cards. Local LCP/CLS observations saved; no production writes.');
} finally { await browser?.close(); server.kill('SIGTERM'); }
