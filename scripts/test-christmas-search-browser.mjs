import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { startAuditTestServer } from './christmas-search-test-helper.mjs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const artifactDir = 'output/playwright/christmas-search-audit';
fs.mkdirSync(artifactDir, {recursive:true});
const browser = await playwright.chromium.launch({ executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
const errors = [];
try {
  for (const mode of ['available', 'empty', 'denied', 'not-configured']) {
    const server = await startAuditTestServer({google:mode !== 'not-configured', mode});
    const context = await browser.newContext({httpCredentials:{username:'synthetic-admin', password:'synthetic-password'}, reducedMotion:'reduce'});
    try {
      await context.route('**/*', route => new URL(route.request().url()).origin === server.base ? route.continue() : route.abort());
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const response = await page.goto(server.base + '/dashboard/');
      assert.equal(response.status(), 200);
      assert.match(response.headers()['cache-control'], /no-store/);
      const panel = page.locator('[data-christmas-search]');
      await panel.locator('table').first().waitFor();
      assert.equal(await panel.getAttribute('aria-busy'), 'false');
      const text = await panel.innerText();
      assert.match(text, /네이버 검색어 데이터 미확보/);
      assert.match(text, /GA4 네이버 유입 세션과 혼합하지 않습니다/);
      assert.match(await page.locator('[data-dashboard-setup]').innerText(), /GA4|연결/);
      if (mode === 'available') {
        assert.match(text, /작은 표본/); assert.match(text, /SYNTHETIC 크리스마스 쿠키 가격 포장/);
        assert.match(text, /MOBILE/); assert.match(text, /DESKTOP/);
        assert.equal(await panel.locator('img').count(), 0, 'query text cannot create HTML');
        assert.equal(await page.evaluate(() => window.searchAuditXss), undefined);
        for (const width of [320,390,768,1280,1440]) {
          await page.setViewportSize({width, height:900});
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px page overflow`);
          for (const button of await panel.locator('button').all()) {
            const box = await button.boundingBox(); assert.ok(box.height >= 44 && box.width >= 44);
          }
          await panel.getByRole('button', {name:'90일', exact:true}).click();
          assert.equal(await panel.getByRole('button', {name:'90일',exact:true}).getAttribute('aria-pressed'), 'true');
          assert.match(await panel.locator('[data-christmas-status]').innerText(), /90일/);
          await panel.getByRole('button', {name:'28일',exact:true}).click();
          assert.equal(await panel.getByRole('button', {name:'28일',exact:true}).getAttribute('aria-pressed'), 'true');
          assert.equal(await panel.getByRole('button', {name:'90일',exact:true}).getAttribute('aria-pressed'), 'false');
          await panel.locator('.dashboard-table-wrap').first().focus();
          assert.equal(await panel.locator('.dashboard-table-wrap').first().evaluate(node => node === document.activeElement), true);
          if ([390,1280].includes(width)) {
            await page.waitForTimeout(250); // Let the existing brand button transition settle for screenshots.
            await page.screenshot({path:`${artifactDir}/synthetic-${width}.png`, fullPage:true});
          }
        }
        await page.route('**/api/dashboard/christmas-search', route => route.abort());
        await panel.getByRole('button', {name:'다시 조회'}).click();
        await panel.locator('[data-christmas-status]').filter({hasText:'가져오지 못했습니다'}).waitFor();
        assert.equal(await panel.locator('table').count(), 0, 'failed refresh clears stale performance');
        assert.equal(await panel.getByRole('button', {name:'다시 조회'}).isEnabled(), true);
        await page.unroute('**/api/dashboard/christmas-search');
        await panel.getByRole('button', {name:'다시 조회'}).click();
        await panel.locator('table').first().waitFor();
      } else {
        assert.equal(await panel.locator('img').count(), 0);
        assert.doesNotMatch(text, /SYNTHETIC 크리스마스/);
        assert.match(text, mode === 'empty' ? /성과 행 없음/ : mode === 'denied' ? /권한 확인 필요/ : /Google 연결 설정 필요/);
        assert.match(text, /페이지 합계 미확보/);
      }
      assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    } finally { await context.close(); await server.stop(); }
  }
  assert.deepEqual(errors, []);
  console.log('Christmas search dashboard browser: 320/390/768/1280/1440px, 28/90 day switching, private authenticated responses, XSS, keyboard focus, missing/empty/denied/retry states passed (synthetic only).');
} finally { await browser.close(); }
