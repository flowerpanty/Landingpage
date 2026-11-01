import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {startAuditTestServer} from './christmas-search-test-helper.mjs';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_MODULE_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const dir='output/playwright/dashboard-upgrade';fs.mkdirSync(dir,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[],evidence=[];
const loaded=page=>page.waitForFunction(()=>document.querySelector('.dashboard-content').getAttribute('aria-busy')==='false');
try{
  const server=await startAuditTestServer({google:true,ga4:true,env:{DASHBOARD_ACCESS_MODE:'public',DASHBOARD_USERNAME:'',DASHBOARD_PASSWORD:''}});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
  try{
    await context.route('**/*',route=>new URL(route.request().url()).origin===server.base?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const response=await page.goto(server.base+'/dashboard/');assert.equal(response.status(),200);assert.match(response.headers()['cache-control'],/no-store/);
    await loaded(page);assert.equal(await page.locator('[data-metric="sessions"]').innerText(),'12');
    assert.equal(await page.locator('[data-range-key="7d"]').getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('[data-dashboard-source-note]').innerText(),/최종 데이터/);
    assert.equal(await page.locator('[data-dashboard-connections] [data-state="available"]').count(),3);
    for(const width of[320,390,768,1280,1440]){
      await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px page overflow`);
      for(const button of await page.locator('[data-range-key],[data-dashboard-refresh],[data-dashboard-export]').all()){
        const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44,`${width}px touch area`);
      }
      await page.screenshot({path:`${dir}/synthetic-${width}-top.png`});
      await page.locator('.dashboard-jump a[href="#dashboard-overview"]').click();
      assert.equal(new URL(page.url()).hash,'#dashboard-overview');
      await page.screenshot({path:`${dir}/synthetic-${width}-overview.png`});
      evidence.push({width,overflow:false,touchTargets:true});
    }
    await page.setViewportSize({width:1280,height:1000});
    for(const range of['today','30d','90d','7d']){
      await page.locator(`[data-range-key="${range}"]`).click();await loaded(page);
      assert.equal(await page.locator(`[data-range-key="${range}"]`).getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-metric="sessions"]').innerText(),'12');
      assert.equal(await page.locator('.dashboard-chart-data tbody tr').count(),range==='today'?24:parseInt(range));
    }
    await page.locator('[data-dashboard-filter]').fill('NO_MATCH_QUERY');assert.match(await page.locator('[data-dashboard-filter-status]').innerText(),/0개 행/);
    assert.equal(await page.locator('[data-table] tr:visible').count(),0);
    await page.locator('[data-dashboard-filter]').fill('');
    const queryBody=page.locator('[data-table="queries"]'),table=queryBody.locator('..');
    await table.getByRole('button',{name:'노출 정렬',exact:true}).click();
    assert.equal(await queryBody.locator('tr').first().locator('td').nth(2).innerText(),'1');
    await table.getByRole('button',{name:'노출 정렬',exact:true}).click();
    assert.equal(await queryBody.locator('tr').first().locator('td').nth(2).innerText(),'70');
    assert.equal(await table.locator('th[aria-sort="descending"]').count(),1);
    assert.equal(await page.locator('img').count(),0,'query HTML remains text');
    assert.equal(await page.evaluate(()=>window.searchAuditXss),undefined);
    const link=page.locator('[data-table="landingPages"] a').first();assert.equal(await link.getAttribute('href'),'/christmas/');
    assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
    const popupPromise=page.waitForEvent('popup');await link.click();const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');assert.equal(new URL(popup.url()).pathname,'/christmas/');await popup.close();
    await page.locator('.dashboard-chart-data summary').click();assert.ok(await page.locator('.dashboard-chart-data table').isVisible());
    await page.locator('[data-table="sources"]').locator('..').locator('..').focus();
    assert.ok(await page.locator('[data-table="sources"]').locator('..').locator('..').evaluate(node=>node===document.activeElement));
    const fixture=await(await context.request.get(server.base+'/api/dashboard/summary?range=7d')).json();
    const routePattern='**/api/dashboard/summary?*';
    await page.route(routePattern,route=>{
      const range=new URL(route.request().url()).searchParams.get('range');
      const body=structuredClone(fixture);body.range.key=range;body.range.label=range;body.summary.sessions=range==='30d'?30:90;
      const delay=range==='30d'?180:5;
      return new Promise(resolve=>setTimeout(resolve,delay)).then(()=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})).catch(()=>{});
    });
    await page.locator('[data-range-key="30d"]').click();await page.locator('[data-range-key="90d"]').click();await loaded(page);
    await page.waitForTimeout(220);assert.equal(await page.locator('[data-metric="sessions"]').innerText(),'90','late responses cannot replace the current range');
    await page.unroute(routePattern);
    await page.route(routePattern,route=>route.abort());await page.locator('[data-dashboard-refresh]').click();await loaded(page);
    assert.ok(await page.locator('[data-dashboard-grid]').isHidden());assert.ok(await page.locator('[data-dashboard-export]').isDisabled());assert.ok(await page.locator('[data-dashboard-refresh]').isEnabled());
    await page.unroute(routePattern);await page.locator('[data-dashboard-refresh]').click();await loaded(page);assert.ok(await page.locator('[data-dashboard-grid]').isVisible());
    await page.route(routePattern,route=>route.fulfill({status:429,contentType:'application/json',body:'{"error":"dashboard_rate_limited"}'}));
    await page.locator('[data-dashboard-refresh]').click();await loaded(page);assert.match(await page.locator('[data-dashboard-status]').innerText(),/1분/);await page.unroute(routePattern);
    await page.route(routePattern,route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Unexpected page</title>'}));
    await page.locator('[data-dashboard-refresh]').click();await loaded(page);assert.match(await page.locator('[data-dashboard-status]').innerText(),/올바른 보고서/);await page.unroute(routePattern);
    fixture.search.queries.push({query:'=1+1',clicks:0,impressions:1,ctr:0,position:20});
    await page.route(routePattern,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)}));
    await page.locator('[data-range-key="7d"]').click();await loaded(page);
    const downloadPromise=page.waitForEvent('download');await page.locator('[data-dashboard-export]').click();const download=await downloadPromise;
    assert.match(download.suggestedFilename(),/^nothingmatters-7d-.*\.csv$/);
    const file=path.join(os.tmpdir(),`nm-dashboard-csv-${Date.now()}.csv`);await download.saveAs(file);const csv=fs.readFileSync(file,'utf8');fs.unlinkSync(file);
    assert.match(csv,/Google 검색어/);assert.match(csv,/'=1\+1/,'CSV formulas are escaped');assert.doesNotMatch(csv,/SYNTHETIC-PII|private_key/);
    assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('header').count(),1);
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
  }finally{await context.close();await server.stop();}
  for(const mode of['not-configured','ga-denied','events-denied','ga-empty','search-denied']){
    const server=await startAuditTestServer({google:mode!=='not-configured',ga4:mode!=='not-configured',mode,env:{DASHBOARD_ACCESS_MODE:'public'}});
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    try{
      await page.route('**/*',route=>new URL(route.request().url()).origin===server.base?route.continue():route.abort());
      page.on('pageerror',error=>errors.push(error.message));await page.goto(server.base+'/dashboard/');await loaded(page);
      if(mode==='not-configured'){assert.ok(await page.locator('[data-dashboard-setup]').isVisible());assert.ok(await page.locator('[data-dashboard-export]').isDisabled());}
      else{
        assert.ok(await page.locator('[data-dashboard-grid]').isVisible());
        assert.equal(await page.locator(`[data-metric="${mode==='events-denied'?'totalActionClicks':mode==='search-denied'?'searchClicks':'sessions'}"]`).innerText(),mode==='ga-empty'?'0':'—');
        if(mode==='ga-denied')assert.match(await page.locator('[data-dashboard-funnel]').innerText(),/—/);
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`${dir}/synthetic-${mode}.png`});
    }finally{await page.close();await server.stop();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(`${dir}/browser-evidence.json`,JSON.stringify({source:'synthetic fixtures only',viewports:evidence,rangeControls:true,retry:true,staleResponseProtection:true,filterSort:true,csv:true,privacy:true,partialStates:true,errors},null,2)+'\n');
  console.log('Dashboard browser PASS: 320/390/768/1280/1440, real buttons/navigation, four ranges, refresh/retry, late response protection, filter/sort, safe CSV, chart data, keyboard, missing/empty/denied/partial states, no console exceptions (synthetic only).');
}finally{await browser.close();}
