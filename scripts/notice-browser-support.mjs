import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function playwrightRuntime() {
  try { return require('playwright'); }
  catch { return require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
}
let cache;
export async function brandFonts() {
  if (cache) return cache;
  const css = fs.readFileSync('assets/site.css', 'utf8');
  const urls = [...new Set([...css.matchAll(/src:\s*url\("(https:[^"]+\.woff2)"/g)].slice(0, 4).map(match => match[1]))];
  cache = new Map(await Promise.all(urls.map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Brand font HTTP ${response.status}: ${url.split('/').pop()}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000) throw new Error('Brand font is not a valid asset');
    return [url, { bytes, status: response.status }];
  })));
  return cache;
}
export async function routeBrandFont(route, fonts) {
  const asset = fonts.get(route.request().url());
  if (!asset) return false;
  // Replay the actual HTTP-200 font bytes, not a stand-in, for deterministic browser/font QA.
  await route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'Access-Control-Allow-Origin': '*' }, body: asset.bytes });
  return true;
}
export async function checkBrandFonts(page) {
  await page.waitForFunction(() => [...document.fonts].some(face => face.family.includes('SeoulNotice')));
  const faces = await page.evaluate(async () => {
    await document.fonts.load('500 16px "SeoulNotice"', '예약 픽업');
    await document.fonts.load('900 20px "PretendardDisplay"', 'NOTHINGMATTERS');
    await document.fonts.ready;
    return [...document.fonts].map(face => ({ family: face.family.replaceAll('"', ''), weight: face.weight, status: face.status }));
  });
  for (const family of ['SeoulNotice', 'PretendardDisplay']) if (!faces.some(face => face.family === family && face.status === 'loaded')) throw new Error(`${family} did not load: ${JSON.stringify(faces)}`);
  return faces;
}
