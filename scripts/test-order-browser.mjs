import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
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
    expression: `JSON.stringify((${callbackSource})())`,
    awaitPromise: true,
    returnByValue: true
  });
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


const requests = [];
let failSave = false;
const mock = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body);
  requests.push(payload);
  res.setHeader('Content-Type', 'application/json');
  if (failSave) {
    res.writeHead(400);
    res.end(JSON.stringify({ success: false, message: '모의 저장 오류' }));
  } else {
    const prices = { cookieFlight: 16000, airplaneButter: 2500, terminalCookie: 24000, lucky: 15000 };
    res.end(JSON.stringify({ success: true, orderId: `mock-${requests.length}`, totalPrice: (prices[payload.source] || 0) * (payload.quantity || 0), pricingPending: payload.source === 'cookieCrew' }));
  }
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const port = await reservePort();
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), WORDPRESS_JOURNAL_OFFLINE: '1', ORDER_API_ORIGIN: `http://127.0.0.1:${mock.address().port}` },
  stdio: 'ignore'
});
const base = `http://127.0.0.1:${port}`;
const debugPort = await reservePort();
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--remote-allow-origins=*',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=/private/tmp/nm-order-browser-${process.pid}`, 'about:blank'
], { stdio: 'ignore' });
let cdp;
try {
  await waitForJson(debugPort);
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/`)).ok) break; } catch { /* starting */ }
    await wait(50);
  }
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.command('Page.enable');
  await cdp.command('Runtime.enable');
  await cdp.command('Network.enable');
  const paths = ['/order', ...products.map(product => `/order/${product.slug}`)];
  for (const width of [320, 390, 1280]) {
    await setViewport(cdp, width);
    for (const pathname of paths) {
      await navigate(cdp, `${base}${pathname}`);
      const dimensions = await evaluate(cdp, `() => ({ pathname: location.pathname, width: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, h1: [...document.querySelectorAll('h1,h2')].some(node => node.getBoundingClientRect().height > 0) })`);
      assert.equal(dimensions.pathname, pathname, 'order routes must stay on the main origin');
      assert.ok(dimensions.doc <= dimensions.width && dimensions.body <= dimensions.width, `${pathname} overflow at ${width}: ${JSON.stringify(dimensions)}`);
      assert.ok(dimensions.h1, `${pathname} missing rendered heading`);
      await evaluate(cdp, `() => { document.querySelectorAll('img').forEach(image => { image.loading = 'eager'; }); return true; }`);
      await waitFor(cdp, `() => [...document.querySelectorAll('img[src]')].filter(image => image.getAttribute('src')).every(image => image.complete && image.naturalWidth > 0)`, `${pathname}: images did not load at ${width}`);
      if (pathname === '/order') {
        const state = await evaluate(cdp, `() => ({ canonical: document.querySelector('link[rel=canonical]').href, links: [...document.querySelectorAll('.product-cta')].map(link => new URL(link.href).pathname), columns: getComputedStyle(document.querySelector('.product-grid')).gridTemplateColumns.split(' ').length })`);
        assert.equal(state.canonical, 'https://nothingmatters.co.kr/order');
        assert.deepEqual(state.links, products.map(product => `/order/${product.slug}`));
        assert.equal(state.columns, width < 760 ? 1 : 3);
        if (width === 390 || width === 1280) fs.writeFileSync(`/private/tmp/nm-order-${width}.png`, (await cdp.command('Page.captureScreenshot', { format: 'png' })).data, 'base64');
      }
    }
  }
  assert.deepEqual(cdp.events.filter(event => event.method === 'Runtime.exceptionThrown').map(event => event.params.exceptionDetails.text), [], 'order UI must have no uncaught runtime errors');
  assert.deepEqual(cdp.events.filter(event => event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error'), [], 'order UI must have no console errors');
  console.log('Order browser: 8 pages at 320/390/1280px, main-origin navigation, all rendered images and no runtime errors PASS');

  // Use the real browser scripts and the real main API adapter, backed by a
  // loopback mock. Sharing and Kakao navigation are local test adapters only.
  await setViewport(cdp, 390);
  for (const [slug, source, unitPrice] of [['cookie-flight', 'cookieFlight', 16000], ['airplane-butter-cookie', 'airplaneButter', 2500], ['terminal-cookie', 'terminalCookie', 24000], ['cookie-crew', 'cookieCrew', 0]]) {
    await navigate(cdp, `${base}/order/${slug}`);
    await evaluate(cdp, `() => {
      window.__kakaoVisits = 0;
      window.NMQuote.navigateToKakao = () => { window.__kakaoVisits++; };
      window.NMQuote.provideImage = async () => 'download';
      return true;
    }`);
    if (source === 'cookieCrew') {
      await evaluate(cdp, `() => { document.querySelector('[data-next]').click(); return true; }`);
      assert.equal(await evaluate(cdp, `() => document.querySelector('#nm-order-selection-error').hidden`), false, 'crew minimum quantity must be enforced');
      await evaluate(cdp, `() => { for (let i=0; i<12; i++) document.querySelector('[data-crew="captain"][data-delta="1"]').click(); return true; }`);
    } else {
      await evaluate(cdp, `() => { document.querySelector('[data-delta="1"]').click(); return true; }`);
      assert.equal(await evaluate(cdp, `() => document.querySelector('#nm-order-selection-total').textContent.trim()`), `${(unitPrice * 2).toLocaleString('ko-KR')}원`);
    }
    await evaluate(cdp, `() => { document.querySelector('[data-next]').click(); document.querySelector('#nm-floating-next').click(); return true; }`);
    assert.equal(await evaluate(cdp, `() => document.querySelector('#nm-customerName').getAttribute('aria-invalid')`), 'true');
    await evaluate(cdp, `() => {
      const fill = (id, value) => { const field = document.getElementById(id); field.value = value; field.dispatchEvent(new Event('input', {bubbles:true})); field.dispatchEvent(new Event('change', {bubbles:true})); };
      fill('nm-customerName', '로컬 검증'); fill('nm-customerPhone', '010-0000-0000');
      fill('nm-deliveryDate', document.getElementById('nm-deliveryDate').min);
      fill('nm-pickupTime', document.getElementById('nm-pickupTime').options[1].value);
      document.querySelector('#nm-floating-next').click(); return true;
    }`);
    assert.equal(await evaluate(cdp, `() => document.querySelector('[data-order-step="3"]').hidden`), false);
    const count = requests.length;
    failSave = true;
    await evaluate(cdp, `() => { document.getElementById('nm-order-submit').click(); return true; }`);
    await waitFor(cdp, `() => document.querySelector('#nm-order-submit-error').textContent.includes('모의 저장 오류')`, `${slug}: expected visible save error`);
    assert.equal(await evaluate(cdp, `() => window.__kakaoVisits`), 0, 'failed saves must retain the current page');
    assert.equal(await evaluate(cdp, `() => document.getElementById('nm-customerName').value`), '로컬 검증');
    failSave = false;
    await evaluate(cdp, `() => { document.getElementById('nm-order-submit').click(); return true; }`);
    await waitFor(cdp, `() => window.__kakaoVisits === 1`, `${slug}: expected local saved confirmation`);
    assert.equal(requests.length, count + 2, 'failure and explicit retry should each issue one request');
    assert.equal(requests.at(-1).source, source);
    assert.equal(requests.at(-1).customerName, '로컬 검증');
    assert.equal(await evaluate(cdp, `() => document.getElementById('nm-order-confirmation-status').hidden`), false);
    await evaluate(cdp, `() => { document.getElementById('nm-order-submit').click(); return true; }`);
    await waitFor(cdp, `() => window.__kakaoVisits === 2`, `${slug}: existing saved quote should be reusable`);
    assert.equal(requests.length, count + 2, 'reusing a saved quote must not create a second order');
    assert.equal(await evaluate(cdp, `() => location.pathname`), `/order/${slug}`);
  }
  console.log('Order browser: original quantity/price, crew minimum, required fields, dates/time, quote rendering, mock save/error/retry and duplicate prevention PASS');
  assert.deepEqual(cdp.events.filter(event => event.method === 'Runtime.exceptionThrown'), [], 'order interaction must have no uncaught runtime errors');
} finally {
  cdp?.close();
  await stop(chrome);
  await stop(server);
  await new Promise(resolve => mock.close(resolve));
}
