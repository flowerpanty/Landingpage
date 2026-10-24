import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function startNoticeTestServer(env = {}) {
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const output = [];
  const processHandle = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), WORDPRESS_JOURNAL_OFFLINE: '1', ORDER_API_ORIGIN: env.NODE_ENV === 'production' ? 'https://thingmattersreserve-production.up.railway.app' : 'http://127.0.0.1:1', NOTICE_ADMIN_USERNAME: '', NOTICE_ADMIN_PASSWORD: '', NOTICE_DATA_DIR: '', NOTICE_STORAGE_MODE: '', RAILWAY_VOLUME_MOUNT_PATH: '', NOTICE_VOLUME_MOUNT_PATH: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  processHandle.stdout.on('data', chunk => output.push(chunk.toString()));
  processHandle.stderr.on('data', chunk => output.push(chunk.toString()));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) return { base, output, process: processHandle }; } catch { /* startup */ }
    if (processHandle.exitCode !== null) break;
    await pause(50);
  }
  processHandle.kill(); throw new Error('Local notice test server did not start');
}
export async function stopNoticeTestServer(server, signal = 'SIGTERM') {
  if (!server || server.process.exitCode !== null) return;
  server.process.kill(signal);
  await Promise.race([once(server.process, 'exit'), pause(2000)]);
  if (server.process.exitCode === null) server.process.kill('SIGKILL');
}
