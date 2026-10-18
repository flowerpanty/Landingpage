import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";

const products = JSON.parse(fs.readFileSync("data/site-pages.json", "utf8")).orderProducts;
async function reservePort() {
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), wait(2000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
class CdpConnection {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.websocket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.websocket.addEventListener("open", resolve, { once: true });
      this.websocket.addEventListener("error", reject, { once: true });
    });
    this.websocket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) {
        this.events.push(message);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async command(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.websocket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.websocket.close();
  }
}

async function waitForJson(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }
    await wait(75);
  }
  throw new Error("Chrome debugging endpoint did not start");
}

async function evaluate(cdp, callbackSource) {
  const response = await cdp.command("Runtime.evaluate", {
    expression: `(async () => JSON.stringify(await (${callbackSource})()))()`,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return JSON.parse(response.result.value);
}

async function navigate(cdp, url) {
  await cdp.command("Page.navigate", { url });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await evaluate(cdp, "() => ({ href: location.href, ready: document.readyState })");
    if (state.href === url && state.ready === "complete") {
      await wait(250);
      return;
    }
    await wait(75);
  }
  throw new Error(`Navigation did not finish: ${url}`);
}

async function setViewport(cdp, width, height = 844) {
  await cdp.command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768
  });
}

async function press(cdp, key, keyCode) {
  await cdp.command("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await cdp.command("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}

async function waitFor(cdp, callbackSource, message) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await evaluate(cdp, callbackSource)) return;
    await wait(75);
  }
  throw new Error(message);
}
async function verifyPaperLogos(cdp, width, screenshots, live) {
  const characters=['bear','rabbit','tiger','birthday_bear','miss_bear','horse'];
  if(width<=600) {
    await evaluate(cdp,`()=>{const panel=document.querySelector('[data-builder-panel="paper"]');scrollTo({top:panel.getBoundingClientRect().top+scrollY-340,behavior:'instant'});return true;}`);
    await wait(150);
  }
  for (const [index, character] of characters.entries()) {
    for (const [fixture,line1,line2] of [
      ['one-line','THANK YOU',''],
      ['two-line','함께해 주셔서','감사합니다'],
      ['long-two-line','가'.repeat(28),'W'.repeat(28)],
    ]) {
      await evaluate(cdp,`()=>{
        document.querySelectorAll('#characters button')[${index}].click();
        document.querySelectorAll('#papers button')[5].click();
        for(const [id,value] of ${JSON.stringify([['paper1',line1],['paper2',line2]])}) {
          const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
        }
        return true;
      }`);
      await waitFor(cdp,`()=>{const image=document.getElementById('render');return image.complete&&image.naturalWidth>0&&image.src.endsWith('/${character}_custom.webp');}`,`${character} custom paper image loaded`);
      await evaluate(cdp,`async()=>{
        await document.fonts.ready;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;
      }`);
      const geometry=await evaluate(cdp,`()=>{
        const rect=node=>node.getBoundingClientRect().toJSON();
        const paper=document.querySelector('.customPaperPlacement'),logo=document.querySelector('.customPaperLogo'),copy=document.querySelector('.customPaperCopy'),preview=document.getElementById('preview');
        if(!paper||!logo||!copy)throw new Error(JSON.stringify({character:state.character,paper:state.paper,step:activeStep,previewWidth:preview.clientWidth,html:document.getElementById('customText').innerHTML,src:document.getElementById('render').src}));
        return {paper:rect(paper),logo:rect(logo),copy:rect(copy),preview:rect(preview),color:getComputedStyle(logo).color,fontSize:parseFloat(getComputedStyle(logo).fontSize),bottom:logo.style.bottom,overflow:getComputedStyle(paper).overflow,
          lines:[...copy.children].map(node=>({rect:rect(node),text:node.textContent,scroll:node.scrollWidth,client:node.clientWidth})),
          unit:comboUnitPrice(currentCombo()),pricing:characterAddonPrice(state.character),sticky:getComputedStyle(document.querySelector('.previewWrap')).position};
      }`);
      const {paper,logo,copy,preview}=geometry;
      const within=(inner,outer)=>inner.left>=outer.left-.75&&inner.right<=outer.right+.75&&inner.top>=outer.top-.75&&inner.bottom<=outer.bottom+.75;
      const context=`${width}px ${character} ${fixture}: ${JSON.stringify(geometry)}`;
      assert(within(logo,paper)&&within(logo,preview),context);
      assert(within(copy,paper),context);assert(copy.bottom<=logo.top-.5,context);
      assert(geometry.lines.every(line=>line.rect.bottom<=logo.top-.5&&line.scroll<=line.client+1),context);
      assert.equal(geometry.color,'rgb(255, 255, 255)',context);
      assert(geometry.fontSize>=6&&geometry.fontSize<=10,context);
      assert.equal(geometry.bottom,'6%');assert.equal(geometry.overflow,'hidden');
      assert(Math.abs(logo.left+logo.width/2-(paper.left+paper.width/2))<.75,context);
      assert.equal(geometry.pricing,index===3||index===4?700:index===5?500:0);
      if(width<=600) assert.equal(geometry.sticky,'sticky');
      if(fixture==='two-line'&&(width===390||width===1280)) {
        // Capture the viewport so sticky elements stay in their actual on-screen position.
        fs.writeFileSync(`${screenshots}/${live?'live':'local'}-${width}-${character}-preview.png`,(await cdp.command('Page.captureScreenshot',{format:'png'})).data,'base64');
      }
    }
    console.log(`${live?'PRODUCTION':'LOCAL'} ${width}px ${character}: white centered logo inside paper; 1/2-line and long text separated PASS`);
  }
}

const live = process.argv.includes('--live');
const baselineCss = execFileSync('git',['show','HEAD:order/assets/brookie-mobile.css'],{encoding:'utf8'});
const port = live ? 0 : await reservePort();
const server = live ? null : spawn(process.execPath, ['server.js'], {
  env: { ...process.env, NODE_ENV:'test', HOST:'127.0.0.1', PORT:String(port), WORDPRESS_JOURNAL_OFFLINE:'1', ORDER_API_ORIGIN:'http://127.0.0.1:9' }, stdio:'ignore',
});
const base = live ? 'https://nothingmatters.co.kr' : `http://127.0.0.1:${port}`;
const debugPort=await reservePort();
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*',`--remote-debugging-port=${debugPort}`,`--user-data-dir=/private/tmp/nm-brookie-grid-${process.pid}`,'about:blank',
],{stdio:'ignore'});
let cdp;
try {
  await waitForJson(debugPort);
  if(!live) for(let attempt=0;attempt<80;attempt++) {try{if((await fetch(base)).ok)break;}catch{}await wait(75);}
  const target=await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'})).json();
  cdp=new CdpConnection(target.webSocketDebuggerUrl);await cdp.ready;
  await cdp.command('Page.enable');await cdp.command('Runtime.enable');
  const screenshots='/private/tmp/nm-brookie-grid';fs.mkdirSync(screenshots,{recursive:true});
  for(const width of [320,360,390,430,601,1280]) {
    await setViewport(cdp,width,900);
    await navigate(cdp,`${base}/order/brookie?step=1`);
    await waitFor(cdp,`function(){return document.querySelectorAll('#characters button').length===6;}`, 'six characters rendered');
    const layout=await evaluate(cdp,`()=>{
      const grid=id=>{const node=document.getElementById(id),style=getComputedStyle(node),cards=[...node.children];return {
        columns:style.gridTemplateColumns.split(' ').length,rows:new Set(cards.map(card=>Math.round(card.getBoundingClientRect().top))).size,
        display:style.display,overflowX:style.overflowX,snap:style.scrollSnapType,swipe:node.scrollWidth>node.clientWidth+1,
        labels:cards.map(card=>card.textContent.trim()),sizes:cards.map(card=>({label:card.textContent.trim(),width:card.getBoundingClientRect().width,height:card.getBoundingClientRect().height,left:card.getBoundingClientRect().left,right:card.getBoundingClientRect().right,scroll:card.scrollWidth,client:card.clientWidth})),
        fits:cards.every(card=>{const rect=card.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth&&rect.height>=44&&card.scrollWidth<=card.clientWidth+1;}),
      }};
      return {width:innerWidth,doc:document.documentElement.scrollWidth,characters:grid('characters'),papers:grid('papers'),
        arrows:[...document.querySelectorAll('[data-builder-panel="character"] .railArrow,[data-builder-panel="paper"] .railArrow')].map(node=>getComputedStyle(node).display),
        sticky:getComputedStyle(document.querySelector('.previewWrap')).position,
        badges:[...document.querySelectorAll('#characters .premium')].map(node=>node.textContent),heart:document.getElementById('withText').textContent,
      };
    }`);
    assert(layout.doc<=width,`overflow ${JSON.stringify(layout)}`);
    assert.deepEqual(layout.badges,['+700원','+700원','+500원']);assert(layout.heart.includes('+700원'));
    if(width<=600) {
      for(const grid of [layout.characters,layout.papers]) {
        assert.equal(grid.display,'grid');assert.equal(grid.columns,3);assert.equal(grid.rows,2);
        assert.equal(grid.swipe,false);assert.equal(grid.overflowX,'visible');assert.equal(grid.snap,'none');assert.equal(grid.fits,true,JSON.stringify(layout));
      }
      assert(layout.arrows.every(display=>display==='none'));assert.equal(layout.sticky,'sticky');
    } else {
      const baseline = await evaluate(cdp,`()=>{const sheet=document.querySelector('link[href*="brookie-mobile.css"]');sheet.disabled=true;const style=document.createElement('style');style.textContent=${JSON.stringify(baselineCss)};document.head.append(style);const measure=id=>{const css=getComputedStyle(document.getElementById(id));return [css.display,css.overflowX,css.gridTemplateColumns.split(' ').length];};const result={characters:measure('characters'),papers:measure('papers')};style.remove();sheet.disabled=false;return result;}`);
      assert.deepEqual([layout.characters.display,layout.characters.overflowX,layout.characters.columns],baseline.characters,'desktop characters match original CSS');
      assert.deepEqual([layout.papers.display,layout.papers.overflowX,layout.papers.columns],baseline.papers,'desktop papers match original CSS');
    }
    // Select with the real button handlers and check preview/summary updates immediately.
    for(const [index,name,expected] of [[0,'곰돌이',7800],[1,'토끼',7800],[2,'호랑이',7800],[3,'생일곰',8500],[4,'미스곰',8500],[5,'말',8300]]) {
      const result=await evaluate(cdp,`()=>{document.querySelectorAll('#characters button')[${index}].click();return {src:document.getElementById('render').getAttribute('src'),summary:document.getElementById('mobileComboSummary').textContent,pressed:document.querySelectorAll('#characters button')[${index}].getAttribute('aria-pressed'),preview:document.getElementById('mobilePreviewSummary').textContent,unit:comboUnitPrice(currentCombo())};}`);
      assert.equal(result.unit,expected);assert.equal(result.pressed,'true');assert(result.summary.includes(name)&&result.preview.includes(name));
      assert(result.summary.includes(expected.toLocaleString('ko-KR')+'원'));assert(result.src.includes(['bear','rabbit','tiger','birthday_bear','miss_bear','horse'][index]));
    }
    const customized=await evaluate(cdp,`()=>{
      document.querySelectorAll('#characters button')[3].click();document.getElementById('withText').click();
      const input=document.getElementById('heartText');input.value='LOVE';input.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelectorAll('#papers button')[5].click();
      return {unit:comboUnitPrice(currentCombo()),summary:document.getElementById('mobileComboSummary').textContent,preview:document.getElementById('mobilePreviewSummary').textContent,src:document.getElementById('render').getAttribute('src')};
    }`);
    assert.equal(customized.unit,9900);assert(customized.summary.includes('9,900원')&&customized.preview.includes('LOVE')&&customized.preview.includes('커스텀 종이'));assert(customized.src.includes('birthday_bear_custom'));
    await verifyPaperLogos(cdp,width,screenshots,live);
    if(width<=600) {
      await evaluate(cdp,`()=>{const panel=document.querySelector('[data-builder-panel="paper"]');scrollTo({top:panel.getBoundingClientRect().top+scrollY-340,behavior:'instant'});return true;}`);await wait(120);
      const sticky=await evaluate(cdp,`()=>{const node=document.querySelector('.previewWrap'),r=node.getBoundingClientRect();return {position:getComputedStyle(node).position,top:r.top,bottom:r.bottom,header:document.querySelector('.siteHeader').getBoundingClientRect().bottom};}`);
      assert.equal(sticky.position,'sticky');assert(sticky.top>=sticky.header-2,JSON.stringify(sticky));
      fs.writeFileSync(`${screenshots}/${live?'live':'local'}-${width}.png`,(await cdp.command('Page.captureScreenshot',{format:'png'})).data,'base64');
    }
    if(width===390) {
      const checkout=await evaluate(cdp,`()=>{state.items=[{character:'bear',paper:'navy',qty:12}];draw();setActiveStep(3,{skipValidation:true});const guide=document.querySelector('.order-email-guide'),style=getComputedStyle(guide);return {cta:floatingNextLabel(),emailGuide:style.color,emailText:guide.textContent,emailVisible:guide.getBoundingClientRect().height>0};}`);
      assert.equal(checkout.cta,'다음으로 넘어가기 →');assert.equal(checkout.emailGuide,'rgb(217, 45, 32)');assert(checkout.emailVisible&&checkout.emailText.includes('이메일'));
    }
    console.log(`${live?'PRODUCTION':'LOCAL'} ${width}px: character/paper grids, fees, preview and summary PASS`);
  }
  assert.deepEqual(cdp.events.filter(event=>event.method==='Runtime.exceptionThrown'),[],'no uncaught browser errors');
  console.log('Brookie UI verification PASS. No orders submitted.');
} finally {cdp?.close();await stop(chrome);if(server)await stop(server);}
