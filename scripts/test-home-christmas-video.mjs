import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { brandFonts, playwrightRuntime } from './notice-browser-support.mjs';
import { checkProductVideo } from './christmas-video-browser-support.mjs';

const probe = http.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, NODE_ENV: 'test', PORT: String(port), HOST: '127.0.0.1', WORDPRESS_JOURNAL_OFFLINE: '1', ORDER_API_ORIGIN: 'http://127.0.0.1:1' }, stdio: 'ignore'
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch { /* server starting */ }
    await wait(50);
  }
  if (!ready) throw new Error('Homepage video test server did not start');
  browser = await playwrightRuntime().chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const artifactDir = 'output/playwright/home-christmas-video';
  fs.mkdirSync(artifactDir, { recursive: true });
  const evidence = await checkProductVideo({ browser, base, fonts: await brandFonts(), artifactDir, home: true });
  fs.writeFileSync(`${artifactDir}/evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log('Homepage Christmas video PASS: six widths, uncropped silent autoplay, lazy download, pause/resume, photo fallbacks, reduced motion/data saving and both Christmas links (local server only).');
} finally { await browser?.close(); server.kill('SIGTERM'); }
