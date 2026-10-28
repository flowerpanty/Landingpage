// Synthetic fixtures only. No production Google request or persisted performance data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

export async function startAuditTestServer(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-search-audit-test-'));
  const calls = path.join(dir, 'synthetic-calls.jsonl');
  const preload = path.join(dir, 'mock-google.cjs');
  fs.writeFileSync(preload, `
    const fs = require('node:fs');
    global.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target === 'https://oauth2.googleapis.com/token') {
        return Response.json({access_token:'SYNTHETIC-TOKEN', expires_in:3600});
      }
      if (target.startsWith('https://www.googleapis.com/webmasters/v3/')) {
        const body = JSON.parse(options.body);
        fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(body) + '\\n');
        if (process.env.MOCK_SEARCH_MODE === 'denied') return Response.json({error:'SYNTHETIC-PRIVATE-UPSTREAM'}, {status:403});
        if (process.env.MOCK_SEARCH_MODE === 'empty') return Response.json({});
        if (!body.dimensions) return Response.json({rows:[{clicks:4, impressions:80, ctr:0.05, position:12}]});
        if (body.dimensions[0] === 'device') return Response.json({rows:[{keys:['MOBILE'], clicks:3, impressions:60, ctr:0.05, position:13},{keys:['DESKTOP'], clicks:1, impressions:20, ctr:0.05, position:9}]});
        return Response.json({rows:[
          {keys:['SYNTHETIC 크리스마스 쿠키 가격 포장'],clicks:1,impressions:70,ctr:1/70,position:12},
          {keys:['SYNTHETIC 서울 기업 크리스마스 쿠키'],clicks:1,impressions:10,ctr:0.1,position:8},
          {keys:['<img src=x onerror=window.searchAuditXss=1>'],clicks:0,impressions:1,ctr:0,position:30}
        ]});
      }
      throw new Error('External request disabled in local fixture');
    };
  `);
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const serviceAccount = options.google ? JSON.stringify({
    client_email: 'synthetic-account@example.invalid',
    private_key: generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: {type:'pkcs8', format:'pem'}, publicKeyEncoding: {type:'spki', format:'pem'} }).privateKey
  }) : '';
  const child = spawn(process.execPath, ['--require', preload, 'server.js'], {
    cwd: process.cwd(), stdio: 'ignore', env: {
      ...process.env, NODE_ENV:'test', HOST:'127.0.0.1', PORT:String(port), WORDPRESS_JOURNAL_OFFLINE:'1',
      ORDER_API_ORIGIN:'http://127.0.0.1:1', GOOGLE_SERVICE_ACCOUNT_JSON:serviceAccount,
      GOOGLE_SERVICE_ACCOUNT_JSON_BASE64:'', GA4_PROPERTY_ID:'',
      SEARCH_CONSOLE_SITE_URL:options.google ? 'sc-domain:nothingmatters.co.kr' : '',
      DASHBOARD_USERNAME:'synthetic-admin', DASHBOARD_PASSWORD:'synthetic-password',
      MOCK_SEARCH_MODE:options.mode || 'available', ...options.env
    }
  });
  const base = `http://127.0.0.1:${port}`;
  const stop = async () => {
    child.kill('SIGTERM');
    for (let i = 0; i < 40 && child.exitCode === null; i++) await pause(25);
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.rmSync(dir, { recursive:true, force:true });
  };
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/christmas/')).ok) return {
        base, stop, authorization: 'Basic ' + Buffer.from('synthetic-admin:synthetic-password').toString('base64'),
        calls: () => fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
      };
    } catch { /* local server starting */ }
    await pause(50);
  }
  await stop(); throw new Error('Synthetic audit server did not start');
}
