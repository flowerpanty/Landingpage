import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startNoticeTestServer, stopNoticeTestServer } from './notice-test-server.mjs';
import { playwrightRuntime, brandFonts, routeBrandFont, checkBrandFonts } from './notice-browser-support.mjs';

const output = 'output/playwright/magok-upgrade';
fs.mkdirSync(output, {recursive:true});
const server = await startNoticeTestServer();
const errors = [], missing = [], writes = [], measurements = [], navigations = [];
let browser;
try {
  browser = await playwrightRuntime().chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const fonts = await brandFonts();
  const context = await browser.newContext({reducedMotion:'reduce'});
  await context.route('**/*', async route => {
    const request = route.request();
    if (!['GET','HEAD'].includes(request.method())) { writes.push(request.url()); return route.abort(); }
    if (await routeBrandFont(route, fonts)) return;
    if (request.url() === 'https://pf.kakao.com/_QdCaK/chat' && request.isNavigationRequest()) {
      navigations.push(request.url());
      return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="ko"><title>상담 이동 모의 테스트</title><body>모의 응답</body></html>'});
    }
    return new URL(request.url()).origin === server.base ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if(response.url().startsWith(server.base) && response.status() >= 400) missing.push([response.status(),response.url()]); });
  for (const width of [320,390,768,1280,1440]) {
    await page.setViewportSize({width,height:900});
    assert.equal((await page.goto(server.base+'/magok-cookie/',{waitUntil:'networkidle'})).status(),200);
    await checkBrandFonts(page);
    assert.equal(await page.locator('h1').count(),1);
    assert.match(await page.title(),/마곡 디저트·답례품/);
    assert.equal(await page.locator('#cookies .magok-product-card').count(),6);
    assert.equal(await page.locator('#faq details').count(),8);
    assert.equal(await page.locator('a a').count(),0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`overflow @${width}`);
    assert.ok((await page.locator('body').evaluate(node=>getComputedStyle(node).fontFamily)).includes('SeoulNotice'));
    const hero = page.locator('.magok-hero-image');
    await hero.evaluate(image=>image.decode());
    if(width<=720) {
      const size=await hero.boundingBox();
      assert.ok(Math.abs(size.width/size.height-1064/798)<.02,'mobile real photo keeps its aspect ratio');
    }
    const productTop=(await page.locator('#cookies').boundingBox()).y;
    measurements.push({width,productTop,scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});
    await page.screenshot({path:`${output}/after-${width}.png`});
    await page.locator('.magok-hero-actions a').first().click();
    await page.waitForURL('**#cookies');
    const rect=await page.locator('#cookies').boundingBox();
    const sticky=await page.locator('.magok-quick-nav').boundingBox();
    assert.ok(rect.y>=sticky.y+sticky.height-1,`products clear of sticky navigation @${width}`);
    for(const image of await page.locator('.magok-product-card img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(image=>image.decode());
      assert.ok(await image.evaluate(image=>image.naturalWidth>0));
    }
    await page.locator('.magok-proof').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelectorAll('.magok-proof .nm-live-archive-preview').length===3);
    for(const image of await page.locator('.magok-proof img').all()) {await image.scrollIntoViewIfNeeded();await image.evaluate(image=>image.decode());}
    for(const summary of await page.locator('#faq summary').all()) {
      await summary.focus();await page.keyboard.press('Enter');
      assert.ok(await summary.evaluate(node=>node.parentElement.open));
    }
    for(const link of await page.locator('a:not(.nm-skip-link), summary').all()) {
      if(!await link.isVisible())continue;
      const box=await link.boundingBox();
      assert.ok(box.height>=43,`touch target @${width}: ${await link.textContent()}`);
    }
    const visibleFaq=await page.locator('#faq details').evaluateAll(nodes=>nodes.map(node=>[node.querySelector('summary').textContent.trim(),node.querySelector('.magok-faq-answer').textContent.replace(/\s+/g,' ').trim()]));
    const schemaFaq=await page.locator('script[data-nm-schema="static"]').evaluate(node=>JSON.parse(node.textContent)['@graph'].find(item=>item['@type']==='FAQPage').mainEntity.map(item=>[item.name,item.acceptedAnswer.text]));
    assert.deepEqual(visibleFaq,schemaFaq,'rendered FAQ and JSON-LD agree');
    await page.locator('footer a').last().scrollIntoViewIfNeeded();
    const footer=await page.locator('footer a').last().boundingBox(),floating=await page.locator('.magok-float-stack').boundingBox();
    assert.ok(footer.y+footer.height<floating.y,`footer clear of floating actions @${width}`);
    if([390,1280].includes(width))await page.screenshot({path:`${output}/full-${width}.png`,fullPage:true});
  }
  for(const [index,pathname] of ['/brookie/','/cookie-crew/','/products/handmade-cookie/','/products/lucky-cookie/','/products/cookie-flight/','/products/terminal-sand-cookie/'].entries()) {
    await page.goto(server.base+'/magok-cookie/');
    await page.locator('.magok-product-card a').nth(index).click();await page.waitForURL(`**${pathname}`);
    assert.ok(await page.locator('h1').isVisible());
  }
  for(const [pathname,href] of [['/','magok-cookie/'],['/corporate-gift/','/magok-cookie/']]) {
    await page.goto(server.base+pathname);
    const link=page.getByRole('link').filter({hasText:/마곡 디저트·/});
    assert.equal(await link.count(),1,'one contextual Magok entry per page');
    assert.equal(await link.getAttribute('href'),href);
    await link.click();await page.waitForURL('**/magok-cookie/');
    assert.ok(await page.locator('#magok-hero-title').isVisible());
  }
  await page.goto(server.base+'/magok-cookie/');
  await page.keyboard.press('Tab');
  assert.ok(await page.locator('.nm-skip-link').evaluate(node=>node===document.activeElement));
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content');
  for(const selector of ['.magok-hero-actions a[href^="https://pf.kakao.com"]','#business a[href^="https://pf.kakao.com"]','.magok-float-kakao']) {
    const link=page.locator(selector);assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
    const [popup]=await Promise.all([page.waitForEvent('popup'),link.click()]);await popup.waitForLoadState('domcontentloaded');
    assert.equal(popup.url(),'https://pf.kakao.com/_QdCaK/chat');assert.equal(await popup.evaluate(()=>window.opener===null),true);assert.equal(await popup.evaluate(()=>document.referrer),'');await popup.close();
  }
  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
  await noJs.route('**/*',route=>new URL(route.request().url()).origin===server.base?route.continue():route.abort());
  const crawler=await noJs.newPage();await crawler.goto(server.base+'/magok-cookie/');
  assert.equal(await crawler.locator('.magok-product-card').count(),6);
  assert.ok((await crawler.locator('main').textContent()).includes('예약 없이 방문하시면 바로 구매할 쿠키가 없습니다.'));
  await crawler.locator('#faq summary').first().click();assert.equal(await crawler.locator('#faq details').first().getAttribute('open'),'');
  await noJs.close();
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(writes,[]);assert.equal(navigations.length,3);
  fs.writeFileSync(`${output}/results.json`,JSON.stringify({passed:true,measurements,errors,missing,writes,navigations},null,2));
  console.log('Magok browser: 320/390/768/1280/1440, brand fonts, six real photos/product routes, sticky/float clearance, touch/keyboard/8 FAQ parity, no-JS and 3 mocked consultation popups PASS; no production writes');
} finally {await browser?.close();await stopNoticeTestServer(server);}
