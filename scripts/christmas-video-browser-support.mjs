import assert from 'node:assert/strict';
import { routeBrandFont } from './notice-browser-support.mjs';

export async function checkProductVideo({ browser, base, fonts, artifactDir }) {
  const evidence = [], selector = '#christmas-santa-bundle-video';
  async function setup({ width = 390, motion = 'no-preference', saveData = false, failure = false, blocked = false, javaScriptEnabled = true } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: motion, javaScriptEnabled });
    if (saveData) await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true, addEventListener() {} } }));
    if (blocked) await context.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Local autoplay-block fixture', 'NotAllowedError')); });
    const requests = [], errors = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (await routeBrandFont(route, fonts)) return;
      if (url.origin !== base) return route.abort();
      if (url.pathname.endsWith('santa-bundle-preview.mp4')) {
        requests.push(url.pathname);
        if (failure) return route.fulfill({ status: 404, body: '' });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/christmas/');
    if (javaScriptEnabled) await page.waitForFunction(() => !document.querySelector('[data-delta="1"]').disabled);
    return { context, page, requests, errors, video: page.locator(selector), thumbnail: page.locator('[data-product-video]'), toggle: page.locator('.xmas-video-toggle') };
  }
  const playing = page => page.waitForFunction(selector => {
    const video = document.querySelector(selector);
    return !video.paused && video.readyState >= 2 && video.currentTime > .1;
  }, selector);
  const paused = page => page.waitForFunction(selector => document.querySelector(selector).paused, selector);
  for (const width of [320, 390, 430, 768, 1280, 1440]) {
    const fixture = await setup({ width });
    const { context, page, video, thumbnail, toggle, requests, errors } = fixture;
    try {
      assert.equal(await video.getAttribute('src'), null);
      assert.deepEqual(requests, [], 'no video request before scrolling to the product');
      await thumbnail.scrollIntoViewIfNeeded();
      await playing(page);
      const media = await video.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return { muted: node.muted, loop: node.loop, inline: node.playsInline, width: node.videoWidth, height: node.videoHeight, fit: getComputedStyle(node).objectFit, ratio: rect.width / rect.height, duration: node.duration, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.deepEqual([media.width, media.height], [540, 960]);
      assert.ok(media.muted && media.loop && media.inline && !media.overflow);
      assert.equal(media.fit, 'contain');
      assert.ok(Math.abs(media.ratio - 9 / 16) < .001, 'full uncropped portrait video');
      assert.ok(media.duration > 3 && media.duration < 3.5);
      const button = await toggle.boundingBox();
      assert.ok(button.width >= 44 && button.height >= 44);
      await toggle.click(); await paused(page);
      await page.locator('#hero').scrollIntoViewIfNeeded();
      await thumbnail.scrollIntoViewIfNeeded();
      assert.equal(await video.evaluate(node => node.paused), true, 'user pause survives scrolling away and back');
      await toggle.focus(); await page.keyboard.press('Space'); await playing(page);
      if (width === 390 || width === 1440) await page.locator('#christmas-santa-bundle').screenshot({ path: `${artifactDir}/${width}-santa-video.png` });
      await page.locator('[data-gallery="christmas-santa-bundle"]').click();
      await page.waitForFunction(() => document.querySelector('#xmas-gallery').open);
      await paused(page);
      assert.equal(await page.locator('#xmas-gallery-title').textContent(), '산타꾸러미 4종');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#xmas-gallery').open);
      await thumbnail.scrollIntoViewIfNeeded(); await playing(page);
      await page.evaluate(() => scrollTo(0, 0)); await paused(page);
      assert.deepEqual(errors, []);
      evidence.push({ width, ...media, visibleAutoplay: true, userPause: true, galleryPreserved: true, offscreenPause: true });
    } finally { await context.close(); }
  }
  for (const preference of ['reduce', 'save-data']) {
    const { context, page, video, thumbnail, toggle, requests } = await setup({ motion: preference === 'reduce' ? 'reduce' : 'no-preference', saveData: preference === 'save-data' });
    try {
      await thumbnail.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      assert.deepEqual(requests, [], `${preference}: no video downloads or autoplay`);
      assert.equal(await video.getAttribute('src'), null);
      await toggle.click(); await playing(page);
      if (preference === 'reduce') {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await paused(page);
      }
      evidence.push({ preference, noAutomaticDownload: true, explicitPlay: true });
    } finally { await context.close(); }
  }
  for (const scenario of ['failure', 'blocked', 'no-js']) {
    const { context, page, video, thumbnail, toggle, requests } = await setup({ failure: scenario === 'failure', blocked: scenario === 'blocked', javaScriptEnabled: scenario !== 'no-js' });
    try {
      await thumbnail.scrollIntoViewIfNeeded();
      if (scenario === 'failure') await page.waitForFunction(selector => Boolean(document.querySelector(selector).error), selector);
      else if (scenario === 'blocked') await page.waitForFunction(selector => document.querySelector(selector).hasAttribute('src'), selector);
      assert.equal(await video.evaluate(node => getComputedStyle(node).opacity), '0', `${scenario}: original photo remains visible`);
      assert.equal(await thumbnail.locator('img').evaluate(node => getComputedStyle(node).opacity), '1');
      assert.equal(await video.evaluate(node => node.paused), true);
      if (scenario === 'no-js') { assert.deepEqual(requests, []); assert.equal(await toggle.isVisible(), false); }
      evidence.push({ scenario, staticPhotoFallback: true });
    } finally { await context.close(); }
  }
  return evidence;
}
