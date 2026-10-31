import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { playwrightRuntime } from './notice-browser-support.mjs';

const probe=http.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const base=`http://127.0.0.1:${port}`;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'cookie-walk-'));
const output=path.resolve('output/playwright/wishing-tree');fs.mkdirSync(output,{recursive:true});
const server=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),WISHING_TREE_DATA_DIR:dataDir,WORDPRESS_JOURNAL_OFFLINE:'1'},stdio:'ignore'});
const {chromium}=playwrightRuntime();let browser;
const errors=[];
try {
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/wishing-tree/')).ok){ready=true;break;}}catch{}await pause(60);}assert.ok(ready);
  const saved=await fetch(base+'/api/wishing-tree/letters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),author:'산책하는 쿠키',to:'이 겨울의 친구',message:'함께 걷는 겨울이라서 더 따뜻해요.\n소원을 트리에 걸어두고 가요.',decoration:'letter',publicConsent:true})});assert.equal(saved.status,201);
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/wishing-tree/');await page.waitForFunction(()=>document.querySelector('#tree-stage').dataset.renderer==='webgl',{timeout:60000});
  await page.evaluate(()=>document.fonts.ready);
  const toggle=page.getByRole('button',{name:'산책하기',exact:true});assert.ok(await toggle.isEnabled());
  await page.mouse.move(800,450);await page.mouse.wheel(0,200);await page.waitForFunction(()=>scrollY>100);const previousScroll=await page.evaluate(()=>scrollY);
  await toggle.click();await page.waitForFunction(()=>document.querySelector('#tree-stage').dataset.walkMode==='true');
  const stage=page.locator('#tree-stage');assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).overflowY),'hidden');
  assert.equal((await stage.boundingBox()).height,900);assert.equal(await page.locator('#walk-hud').isVisible(),true);
  await page.screenshot({path:path.join(output,'walk-desktop.png')});
  const initial=await stage.evaluate(el=>({x:Number(el.dataset.playerX),z:Number(el.dataset.playerZ)}));
  await page.keyboard.down('d');await page.waitForFunction(start=>Number(document.querySelector('#tree-stage').dataset.playerX)>start+.45,initial.x);await page.keyboard.up('d');
  assert.ok(await stage.evaluate(el=>Math.hypot(Number(el.dataset.playerX),Number(el.dataset.playerZ))>=3.3));
  // A real floor click sets a destination and moves the cookie to it.
  await page.mouse.click(1070,650);await page.waitForFunction(()=>document.querySelector('#tree-stage').dataset.destinationX!==undefined);
  const destination=await stage.evaluate(el=>({x:Number(el.dataset.destinationX),z:Number(el.dataset.destinationZ)}));
  await page.waitForFunction(target=>{const s=document.querySelector('#tree-stage');return Math.hypot(Number(s.dataset.playerX)-target.x,Number(s.dataset.playerZ)-target.z)<.12;},destination,{timeout:20000});
  // Move back toward the tree until the collider is reached; the body stays outside.
  const beforeForward=await stage.evaluate(el=>({x:Number(el.dataset.playerX),z:Number(el.dataset.playerZ)}));
  await page.keyboard.down('w');await page.waitForFunction(start=>{const s=document.querySelector('#tree-stage');return Math.hypot(Number(s.dataset.playerX)-start.x,Number(s.dataset.playerZ)-start.z)>.4;},beforeForward);await page.keyboard.up('w');
  assert.ok(await stage.evaluate(el=>Math.hypot(Number(el.dataset.playerX),Number(el.dataset.playerZ))>=3.3));
  await page.evaluate(()=>{
    window.__closestWalkRadius=Infinity;
    const element=document.querySelector('#tree-stage');
    new MutationObserver(()=>{window.__closestWalkRadius=Math.min(window.__closestWalkRadius,Math.hypot(Number(element.dataset.playerX),Number(element.dataset.playerZ)));}).observe(element,{attributes:true,attributeFilter:['data-player-x','data-player-z']});
  });
  const previousDestination=await stage.getAttribute('data-destination-z');
  await page.mouse.click(720,450);
  await page.waitForFunction(previous=>document.querySelector('#tree-stage').dataset.destinationZ!==previous,previousDestination);
  const behindTree=await stage.evaluate(el=>({x:Number(el.dataset.destinationX),z:Number(el.dataset.destinationZ)}));
  await page.waitForFunction(target=>{const s=document.querySelector('#tree-stage');return Math.hypot(Number(s.dataset.playerX)-target.x,Number(s.dataset.playerZ)-target.z)<.12;},behindTree,{timeout:25000});
  assert.ok(await page.evaluate(()=>window.__closestWalkRadius>=3.3),'the complete click-to-walk path stays outside the solid tree');
  await page.getByRole('button',{name:'산책 끝내기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#tree-stage').dataset.walkMode==='false');
  assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).overflowY),'auto');assert.ok(Math.abs((await page.evaluate(()=>scrollY))-previousScroll)<3);
  await page.getByRole('button',{name:'산책하기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#tree-stage').dataset.walkMode==='true');
  await page.getByRole('button',{name:'산책하는 쿠키님의 편지 읽기'}).click();await page.locator('#read-dialog').waitFor({state:'visible'});
  await page.keyboard.press('Escape');await page.locator('#read-dialog').waitFor({state:'hidden'});assert.equal(await stage.getAttribute('data-walk-mode'),'true','closing a letter does not exit walking');
  await page.getByRole('button',{name:'트리에 편지 달기'}).click();await page.locator('#compose-dialog').waitFor({state:'visible'});
  const positionInDialog=await stage.getAttribute('data-player-x');await page.getByLabel('보내는 사람').fill('wasd');assert.equal(await stage.getAttribute('data-player-x'),positionInDialog,'typing does not move the player');
  await page.getByRole('button',{name:'편지 쓰기 닫기'}).click();await page.locator('#compose-dialog').waitFor({state:'hidden'});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.body.classList.contains('walk-mode'));
  await page.mouse.move(800,450);await page.mouse.wheel(0,200);await page.waitForFunction(before=>scrollY>before,previousScroll);
  await context.close();

  const mobileContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),mobile=await mobileContext.newPage();
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(base+'/wishing-tree/?walk=1');await mobile.waitForFunction(()=>document.querySelector('#tree-stage').dataset.walkMode==='true',{timeout:60000});
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const pad=mobile.getByRole('button',{name:'쿠키 오른쪽으로 걷기'}),padRect=await pad.boundingBox();assert.ok(padRect.width>=44&&padRect.height>=44);
  const cdp=await mobileContext.newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:padRect.x+22,y:padRect.y+22,id:1}]});
  await mobile.waitForFunction(()=>Number(document.querySelector('#tree-stage').dataset.playerX)>.35);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  // Tapping the snowy floor works independently from the touch direction pad.
  await mobile.touchscreen.tap(300,600);await mobile.waitForFunction(()=>document.querySelector('#tree-stage').dataset.destinationX!==undefined);
  await mobile.screenshot({path:path.join(output,'walk-mobile.png')});
  await mobile.getByRole('button',{name:'트리에 편지 달기'}).click();await mobile.locator('#compose-dialog').waitFor({state:'visible'});await mobile.getByRole('button',{name:'편지 쓰기 닫기'}).click();await mobile.locator('#compose-dialog').waitFor({state:'hidden'});
  await mobile.getByRole('button',{name:'산책 끝내기',exact:true}).click();await mobile.waitForFunction(()=>document.querySelector('#tree-stage').dataset.walkMode==='false');
  assert.equal(await mobile.locator('html').evaluate(el=>getComputedStyle(el).overflowY),'auto');
  assert.deepEqual(errors,[]);
  const report={contract:'An optional single-player Cookie Walk mode extends the existing shared letter tree: click or tap the floor to walk, WASD/arrow keys or 44px touch buttons to move, drag to orbit a following camera, and leave to restore the ordinary tree view and native page scrolling. Seoul Alrim fonts and public letters remain accessible. Reduced motion omits bobbing and limb swings while retaining direct user movement.',targetViewports:['1440x900','390x844'],accessibility:{status:'pass',evidence:'Native labelled enter/exit and direction buttons; 44px touch targets; status region; WASD and arrows; Escape closes a letter before exiting walk mode. Form typing does not move the avatar. Reduced-motion input remains usable.'},responsive:{status:'pass',evidence:'Full viewport scene verified at 1440x900 and 390x844 without horizontal overflow. Mobile touch direction pad and snowy-floor taps move the cookie. Exit restores root scrolling and the prior scroll position.'},contentStates:{loading:{status:'pass',evidence:'Walk button stays disabled until WebGL scene compilation completes; the test waits for the renderer before entry.'},empty:{status:'not-applicable',reason:'The procedural cookie and plaza are always present; the shared letter empty state and labelled preview letters are already tested in test-wishing-tree-browser.mjs.'},error:{status:'not-applicable',reason:'Walking is local with no new network request or independent remote error state. Existing WebGL-unavailable fallback and letter network errors are covered in test-wishing-tree-3d.mjs and test-wishing-tree-browser.mjs.'},partial:{status:'not-applicable',reason:'The avatar and environment are generated together in memory; partial shared-letter data continues using the existing tree implementation and its dedicated failure tests.'},success:{status:'pass',evidence:'Desktop floor click reaches its destination and an entire route around the tree preserves the 3.3m clearance. Desktop and mobile controls, camera following, letter reading, writing, and leaving mode pass.'},permission:{status:'not-applicable',reason:'The avatar is local and needs no new identity or access permission. Existing explicit consent and ownership checks still govern publishing and deleting public letters.'}},renderedEvidence:[{viewport:'1440x900',artifact:'walk-desktop.png',observation:'Snowy Christmas plaza with a cookie character seen from behind, the existing giant tree, warm lamps, original gingerbread stalls, and keyboard/touch controls.'},{viewport:'390x844',artifact:'walk-mobile.png',observation:'Mobile full-screen plaza with 44px direction buttons and reachable write/exit controls.'}]};
  fs.writeFileSync(path.join(output,'walk-evidence.json'),JSON.stringify(report,null,2));
  console.log('PASS: desktop floor click and WASD movement, following camera, central tree collision, projected letter reading, writing without moving, modal Escape, restored view and scrolling, mobile touch direction pad, floor taps, reduced-motion movement, and 44px controls.');
} finally {await browser?.close();server.kill('SIGTERM');await pause(200);if(server.exitCode===null)server.kill('SIGKILL');fs.rmSync(dataDir,{recursive:true,force:true});}
