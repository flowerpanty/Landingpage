import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { startNoticeTestServer, stopNoticeTestServer } from './notice-test-server.mjs';
import { playwrightRuntime, brandFonts, routeBrandFont, checkBrandFonts } from './notice-browser-support.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-notice-admin-browser-'));
const artifacts = 'output/playwright/notices-admin'; fs.mkdirSync(artifacts, { recursive: true });
const credentials = { username: `qa-${crypto.randomUUID()}`, password: crypto.randomBytes(24).toString('hex') };
const env = { NOTICE_ADMIN_USERNAME: credentials.username, NOTICE_ADMIN_PASSWORD: credentials.password, NOTICE_DATA_DIR: path.join(directory, 'volume'), NOTICE_STORAGE_MODE: 'test' };
let server, browser;
const exceptions = [], consoleErrors = [], badResources = [], nonLocalPosts = [], evidence = [], fontsLoaded = [];
try {
  server = await startNoticeTestServer(env);
  browser = await playwrightRuntime().chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  const fonts = await brandFonts();
  let failNext = false;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (await routeBrandFont(route, fonts)) return;
    if (url.origin !== server.base) { if (request.method() !== 'GET') nonLocalPosts.push(url.origin); return route.abort(); }
    if (failNext && url.pathname === '/api/notice-admin/notices') { failNext = false; return route.fulfill({ status: 503, json: { message: '로컬 검증용 저장 오류' } }); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => exceptions.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) consoleErrors.push(message.text()); });
  page.on('response', response => { if (response.url().startsWith(server.base) && response.status() >= 400 && !response.url().includes('/api/')) badResources.push([response.status(), response.url()]); });
  await page.goto(`${server.base}/notice/admin/`);
  assert.equal(await page.locator('#editor').count(), 0);
  assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex,nofollow');
  await page.locator('#username').fill(credentials.username); await page.locator('#password').fill(credentials.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.locator('#editor').waitFor();
  await page.waitForFunction(() => !document.getElementById('new-notice').disabled);
  assert.ok((await context.cookies()).some(cookie => cookie.name === 'nm_notice_session' && cookie.httpOnly && cookie.sameSite === 'Strict'));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    fontsLoaded.push({ width, faces: await checkBrandFonts(page) });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `admin overflow @${width}`);
    for (const button of await page.locator('button:visible').all()) {
      const box = await button.boundingBox(); assert.ok(box.height >= 43, `small admin touch target @${width}`);
    }
    await page.screenshot({ path: `${artifacts}/admin-${width}.png`, fullPage: true });
    evidence.push({ viewport: `${width}x900`, artifact: `admin-${width}.png`, observation: 'Authenticated editor and notice list: readable layout, 44px controls, actual brand fonts, no overflow' });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: /김포공항 인근 예약 픽업 안내/ }).click();
  assert.equal(await page.locator('#pinned').isChecked(), true);
  assert.ok((await page.locator('#body').inputValue()).includes('예약 없이 방문하시면 구매할 쿠키가 없습니다.'));
  await page.getByRole('button', { name: '새 공지 +', exact: true }).click();
  await page.locator('#title').fill('로컬 관리자 화면 검증'); await page.locator('#slug').fill('local-browser-notice');
  await page.locator('#summary').fill('로컬 브라우저 검증용 공지입니다.');
  await page.locator('#body').fill('본문은 공개하기 전까지 관리자만 볼 수 있습니다.\n\n## 이용 안내\n\n- 첫 번째 안내\n- 두 번째 안내\n\n[예약 픽업 안내](/pickup/)');
  await page.getByRole('button', { name: '미리보기', exact: true }).click();
  await page.locator('#preview-dialog').waitFor({ state: 'visible' });
  await page.frameLocator('#preview-frame').locator('h1').waitFor();
  assert.equal(await page.frameLocator('#preview-frame').locator('h1').innerText(), '로컬 관리자 화면 검증');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#preview-dialog').isVisible(), false);
  failNext = true;
  await page.getByRole('button', { name: '임시저장', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('message').classList.contains('is-error'));
  assert.equal(await page.locator('#title').inputValue(), '로컬 관리자 화면 검증');
  assert.ok((await page.locator('#body').inputValue()).includes('첫 번째 안내'));
  await page.getByRole('button', { name: '임시저장', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('message').textContent.startsWith('임시저장했습니다'));
  assert.equal((await fetch(`${server.base}/notice/local-browser-notice/`)).status, 404);
  await page.reload(); await page.waitForFunction(() => !document.getElementById('new-notice').disabled);
  await page.getByRole('button', { name: /로컬 관리자 화면 검증/ }).click();
  assert.ok((await page.locator('#body').inputValue()).includes('첫 번째 안내'));
  await page.getByRole('button', { name: '발행', exact: true }).dblclick();
  await page.waitForFunction(() => document.getElementById('message').textContent.startsWith('발행했습니다'));
  assert.equal((await fetch(`${server.base}/notice/local-browser-notice/`)).status, 200);
  const published = await (await fetch(`${server.base}/notice/local-browser-notice/`)).text();
  assert.ok(published.includes('첫 번째 안내') && published.includes('href="/pickup/"'));
  await page.locator('#title').fill('아직 발행하지 않은 수정');
  await page.getByRole('button', { name: '임시저장', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('message').textContent.startsWith('임시저장했습니다'));
  assert.ok(!(await (await fetch(`${server.base}/notice/local-browser-notice/`)).text()).includes('아직 발행하지 않은 수정'));
  await page.getByRole('button', { name: '비공개로 전환', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('message').textContent.startsWith('비공개로 전환했습니다'));
  assert.equal((await fetch(`${server.base}/notice/local-browser-notice/`)).status, 404);
  const failedPath = path.join(env.NOTICE_DATA_DIR, 'notices-state.json');
  fs.renameSync(failedPath, failedPath + '.backup'); fs.mkdirSync(failedPath);
  await page.getByRole('button', { name: '임시저장', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('message').classList.contains('is-error') && document.getElementById('publish').disabled);
  assert.equal(await page.locator('#title').inputValue(), '아직 발행하지 않은 수정');
  assert.ok(await page.locator('#save-draft').isDisabled());
  fs.rmdirSync(failedPath); fs.renameSync(failedPath + '.backup', failedPath);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await page.locator('#login').waitFor();
  assert.equal(await page.locator('#editor').count(), 0);
  await context.close(); await stopNoticeTestServer(server);

  server = await startNoticeTestServer({ NOTICE_ADMIN_USERNAME: credentials.username, NOTICE_ADMIN_PASSWORD: credentials.password });
  const readonly = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await readonly.route('**/*', async route => { if (await routeBrandFont(route, fonts)) return; return new URL(route.request().url()).origin === server.base ? route.continue() : route.abort(); });
  const locked = await readonly.newPage(); await locked.goto(`${server.base}/notice/admin/`);
  await locked.locator('#username').fill(credentials.username); await locked.locator('#password').fill(credentials.password);
  await locked.getByRole('button', { name: '로그인', exact: true }).click(); await locked.locator('#editor').waitFor();
  await locked.waitForFunction(() => document.getElementById('storage-status').textContent.includes('미리보기만 가능'));
  assert.ok(await locked.locator('#publish').isDisabled()); assert.ok(await locked.locator('#save-draft').isDisabled());
  await checkBrandFonts(locked); await locked.screenshot({ path: `${artifacts}/admin-storage-disabled-390.png`, fullPage: true });
  evidence.push({ viewport: '390x900', artifact: 'admin-storage-disabled-390.png', observation: 'No persistent volume: storage explanation, save/publish disabled; preview retained' });
  assert.deepEqual(exceptions, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(badResources, []); assert.deepEqual(nonLocalPosts, []);
  fs.writeFileSync(`${artifacts}/browser-results.json`, JSON.stringify({ passed: true, exceptions, consoleErrors, badResources, nonLocalPosts, fonts: [...fonts].map(([url, row]) => ({ name: url.split('/').pop(), status: row.status, bytes: row.bytes.length })), fontsLoaded, renderedEvidence: evidence, productionWrites: false }, null, 2));
  console.log('Notice admin browser PASS: login, 320/390/768/1440, actual fonts, list/edit/preview/draft/publish/unpublish/logout, retained failed input, disabled publishing without storage; isolated local writes only');
} finally {
  fs.writeFileSync(`${artifacts}/browser-diagnostics.json`, JSON.stringify({ exceptions, consoleErrors, badResources, nonLocalPosts }, null, 2));
  await browser?.close(); await stopNoticeTestServer(server); fs.rmSync(directory, { recursive: true, force: true });
}
