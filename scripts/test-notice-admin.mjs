import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { startNoticeTestServer, stopNoticeTestServer, ROOT } from './notice-test-server.mjs';
import { createNoticeStore, storageConfiguration, writerLockActive } from '../lib/notice-store.mjs';

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-notice-admin-test-'));
const credentials = { username: `qa-${crypto.randomUUID()}`, password: crypto.randomBytes(24).toString('hex') };
const auth = { NOTICE_ADMIN_USERNAME: credentials.username, NOTICE_ADMIN_PASSWORD: credentials.password };
const persistent = { ...auth, NOTICE_DATA_DIR: path.join(folder, 'volume'), NOTICE_STORAGE_MODE: 'test' };
let server, cookie = '', csrf = '';
const outputs = [], checks = [];
async function request(route, body, options = {}) {
  const response = await fetch(server.base + route, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { Origin: server.base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }), ...(cookie ? { Cookie: cookie } : {}), ...options.headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const text = await response.text(); let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, headers: response.headers, text, data };
}
async function login() {
  const result = await request('/api/notice-admin/login', credentials);
  assert.equal(result.status, 200, result.text);
  const header = result.headers.get('set-cookie');
  assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/);
  cookie = header.split(';')[0];
  const session = await request('/api/notice-admin/session'); csrf = session.data.csrfToken;
  return session.data;
}
const notice = { slug: 'local-admin-test', title: '로컬 관리자 검증 <script> & 안내', category: '이용 안내', summary: 'LOCAL DRAFT CONTENT', pinned: false, content: [{ type: 'paragraph', text: 'LOCAL DRAFT SECRET </script><script>alert(1)</script> & 본문' }, { type: 'links', items: [{ label: '픽업 안내', href: '/pickup/' }] }] };
const payload = (action, revision, extras = {}) => ({ action, baseRevision: revision, requestId: crypto.randomUUID(), ...extras });
try {
  server = await startNoticeTestServer(auth);
  assert.equal((await request('/api/notice-admin/session')).status, 401);
  const page = await request('/notice/admin/');
  assert.equal(page.status, 200); assert.match(page.text, /id="login"/); assert.doesNotMatch(page.text, /id="editor"/);
  assert.match(page.headers.get('x-robots-tag'), /noindex/); assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/); assert.doesNotMatch(page.headers.get('content-security-policy'), /unsafe-inline|unsafe-eval/);
  assert.equal((await request('/data/notices.json')).status, 404);
  assert.equal((await request('/%64ata/notices.json')).status, 404);
  assert.doesNotMatch((await request('/notice/%61dmin/index.html')).text, /id="editor"/);
  assert.equal((await request('/api/notice-admin/login', credentials, { headers: { Origin: 'https://invalid.example' } })).status, 403);
  assert.equal((await request('/api/notice-admin/login', { username: 'wrong', password: 'wrong' })).status, 401);
  let session = await login();
  assert.equal(session.storage.ready, false);
  assert.equal((await request('/api/notice-admin/notices', payload('publish', 0, { notice, create: true }))).status, 503);
  const preview = await request('/api/notice-admin/preview', { notice });
  assert.equal(preview.status, 200, preview.text); assert.match(preview.data.html, /noindex,nofollow/);
  assert.match(preview.data.html, /&lt;script&gt;/); assert.doesNotMatch(preview.data.html, /<script>alert\(1\)/);
  assert.doesNotMatch(preview.data.html, /googletagmanager\.com|gtag\('config'/);
  assert.equal((await request('/api/notice-admin/preview', { notice }, { headers: { 'X-CSRF-Token': 'wrong' } })).status, 403);
  checks.push('auth/origin/CSRF/CSP/noindex/private-source/fail-closed-without-storage/escaped-no-GA-preview');
  outputs.push(...server.output); await stopNoticeTestServer(server); cookie = ''; csrf = '';

  server = await startNoticeTestServer(persistent);
  session = await login(); assert.equal(session.storage.ready, true); assert.equal(session.storage.testMode, true);
  assert.equal(fs.statSync(path.join(persistent.NOTICE_DATA_DIR, 'notices-state.json')).mode & 0o777, 0o600);
  let result = await request('/api/notice-admin/notices', payload('draft', 0, { notice, create: true }));
  assert.equal(result.status, 200, result.text); assert.equal(result.data.revision, 1);
  for (const route of ['/notice/', '/notice/feed.xml', '/sitemap.xml', '/llms.txt', '/']) assert.ok(!(await request(route)).text.includes('local-admin-test'), `draft leak: ${route}`);
  assert.equal((await request('/notice/local-admin-test/')).status, 404);
  const oldCookie = cookie;
  outputs.push(...server.output); await stopNoticeTestServer(server, 'SIGKILL');
  server = await startNoticeTestServer(persistent);
  assert.equal((await request('/api/notice-admin/session')).status, 401, 'restart invalidates sessions');
  session = await login(); assert.equal(session.revision, 1); assert.equal(session.notices.find(row => row.notice.slug === notice.slug).hasDraft, true);
  const publish = payload('publish', 1, { notice, create: false });
  const duplicates = await Promise.all([request('/api/notice-admin/notices', publish), request('/api/notice-admin/notices', publish)]);
  assert.deepEqual(duplicates.map(row => row.status), [200, 200]); assert.deepEqual(duplicates.map(row => row.data.revision), [2, 2]);
  assert.ok(duplicates.some(row => row.data.duplicate));
  const html = await request('/notice/local-admin-test/'); assert.equal(html.status, 200);
  assert.match(html.text, /"@type": "Article"/); assert.match(html.text, /&lt;script&gt;/); assert.doesNotMatch(html.text, /<script>alert\(1\)/);
  for (const route of ['/notice/', '/notice/feed.xml', '/sitemap.xml', '/llms.txt', '/']) assert.ok((await request(route)).text.includes('local-admin-test'), `publication not synchronized: ${route}`);
  const publicList = (await request('/notice/')).text;
  assert.ok(publicList.indexOf('data-notice-slug="pickup-guide"') < publicList.indexOf('data-notice-slug="local-admin-test"'));
  assert.equal((await request('/api/notice-admin/notices', payload('publish', 1, { notice, create: false }))).status, 409);
  assert.equal((await request('/api/notice-admin/notices', { ...publish, notice: { ...notice, title: 'Different payload' } })).status, 409);
  assert.equal((await request('/api/notice-admin/notices', payload('publish', 2, { notice: { ...notice, slug: 'admin' }, create: true }))).status, 400);
  assert.equal((await request('/api/notice-admin/notices', payload('publish', 2, { notice: { ...notice, slug: '../escape' }, create: true }))).status, 400);
  assert.equal((await request('/api/notice-admin/preview', { notice: { ...notice, content: [{ type: 'links', items: [{ label: 'unsafe', href: 'javascript:alert(1)' }] }] } })).status, 400);
  assert.equal((await request('/api/notice-admin/notices', '{')).status, 400);
  assert.equal((await request('/api/notice-admin/notices', 'x'.repeat(129 * 1024))).status, 413);
  const edited = { ...notice, title: 'LOCAL UNPUBLISHED EDIT' };
  assert.equal((await request('/api/notice-admin/notices', payload('draft', 2, { notice: edited, create: false }))).status, 200);
  assert.ok(!(await request('/notice/local-admin-test/')).text.includes(edited.title), 'draft edited public content');
  assert.equal((await request('/api/notice-admin/notices', payload('publish', 3, { notice: edited, create: false }))).status, 200);
  assert.ok((await request('/notice/local-admin-test/')).text.includes(edited.title));
  assert.equal((await request('/api/notice-admin/notices', payload('pin', 4, { slug: notice.slug, pinned: true }))).status, 200);
  assert.equal((await request('/api/notice-admin/session')).data.notices.find(row => row.notice.slug === notice.slug).notice.pinned, true);
  assert.equal((await request('/api/notice-admin/notices', payload('unpublish', 5, { slug: notice.slug }))).status, 200);
  for (const route of ['/notice/', '/notice/feed.xml', '/sitemap.xml', '/llms.txt', '/']) assert.ok(!(await request(route)).text.includes('local-admin-test'), `unpublished leak: ${route}`);
  assert.equal((await request('/notice/local-admin-test/')).status, 404);
  assert.equal((await request('/api/notice-admin/logout', {})).status, 200);
  assert.equal((await request('/api/notice-admin/session')).status, 401);
  cookie = oldCookie; assert.equal((await request('/api/notice-admin/session')).status, 401);
  checks.push('durable-draft/crash-restart/session-expiry/publish/duplicate/revision-conflict/input-limits/atomic-public-snapshot/draft-keeps-live/pin/unpublish/logout');
  outputs.push(...server.output); await stopNoticeTestServer(server); server = null;

  // Simulate a fresh checkout's different seed, retaining the external volume.
  const freshRoot = path.join(folder, 'fresh-checkout'); fs.mkdirSync(path.join(freshRoot, 'data'), { recursive: true });
  const differentSeed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/notices.json'))); differentSeed.notices[0].title = 'Different redeploy seed';
  fs.writeFileSync(path.join(freshRoot, 'data/notices.json'), JSON.stringify(differentSeed));
  const rehydrated = createNoticeStore({ root: freshRoot, env: { ...persistent, NODE_ENV: 'test', HOST: '127.0.0.1' }, render: () => new Map() });
  assert.equal(rehydrated.state.revision, 6); assert.equal(rehydrated.state.catalog.notices.find(row => row.slug === notice.slug).status, 'archived');
  assert.ok(!rehydrated.state.catalog.notices.some(row => row.title === 'Different redeploy seed')); rehydrated.close();
  assert.equal(storageConfiguration({ ...persistent, NODE_ENV: 'production' }, ROOT).ready, false);
  assert.equal(storageConfiguration({ ...persistent, NODE_ENV: 'test', HOST: '0.0.0.0' }, ROOT).ready, false);
  assert.equal(storageConfiguration({ NOTICE_DATA_DIR: path.join(folder, 'volume'), RAILWAY_VOLUME_MOUNT_PATH: folder }, ROOT).ready, false);
  assert.equal(writerLockActive('previous-container:1234'), true, 'unknown remote writer remains locked');
  assert.equal(writerLockActive('previous-container:1234', { exclusiveRailwayVolume: true }), false, 'exclusive Railway remount reclaims prior container lock');
  checks.push('fresh-checkout-does-not-overwrite-saved-data/test-mode-rejected-in-production/unverified-mount-rejected');

  cookie = ''; csrf = ''; server = await startNoticeTestServer(persistent); await login();
  const failedPath = path.join(persistent.NOTICE_DATA_DIR, 'notices-state.json');
  fs.renameSync(failedPath, failedPath + '.backup'); fs.mkdirSync(failedPath);
  assert.equal((await request('/api/notice-admin/notices', payload('draft', 6, { notice, create: false }))).status, 503);
  assert.equal((await request('/api/notice-admin/session')).data.revision, 6);
  fs.rmdirSync(failedPath); fs.renameSync(failedPath + '.backup', failedPath);
  outputs.push(...server.output); await stopNoticeTestServer(server); cookie = ''; csrf = '';
  const statePath = path.join(persistent.NOTICE_DATA_DIR, 'notices-state.json');
  const saved = fs.readFileSync(statePath); fs.writeFileSync(statePath, '{corrupt');
  server = await startNoticeTestServer(persistent);
  assert.equal((await request('/notice/')).status, 503);
  const stillShopping = await request('/'); assert.equal(stillShopping.status, 200); assert.match(stillShopping.text, /id="our-cookies"/);
  assert.ok(!stillShopping.text.includes('data-notice-slug='), 'corrupt store must not re-expose older seed notices');
  session = await login(); assert.equal(session.storage.ready, false);
  outputs.push(...server.output); await stopNoticeTestServer(server); fs.writeFileSync(statePath, saved);
  checks.push('write-failure-does-not-acknowledge-save/corrupt-store-closed/shopping-preserved');

  cookie = ''; csrf = ''; server = await startNoticeTestServer({ ...persistent, NODE_ENV: 'production' });
  assert.equal((await request('/notice/admin/')).status, 403);
  let response = await request('/api/notice-admin/login', credentials, { headers: { 'X-Forwarded-Host': 'nothingmatters.co.kr', 'X-Forwarded-Proto': 'https', Origin: 'https://nothingmatters.co.kr' } });
  assert.equal(response.status, 200, response.text); assert.match(response.headers.get('set-cookie'), /; Secure/);
  outputs.push(...server.output); await stopNoticeTestServer(server); cookie = ''; csrf = '';

  server = await startNoticeTestServer(auth);
  for (let i = 0; i < 5; i++) assert.equal((await request('/api/notice-admin/login', { username: 'wrong', password: 'wrong' })).status, 401);
  assert.equal((await request('/api/notice-admin/login', credentials)).status, 429);
  outputs.push(...server.output); await stopNoticeTestServer(server); cookie = ''; server = await startNoticeTestServer();
  assert.equal((await request('/notice/admin/')).status, 503); assert.equal((await request('/api/notice-admin/login', credentials)).status, 503);
  outputs.push(...server.output); await stopNoticeTestServer(server); server = await startNoticeTestServer({ ...auth, NOTICE_PUBLIC_ORIGIN: 'invalid origin' });
  assert.equal((await request('/notice/admin/')).status, 503); assert.equal((await request('/')).status, 200);
  checks.push('HTTPS/Secure-cookie/rate-limit/auth-config-fail-closed');
  assert.ok(!outputs.join('').includes(credentials.password)); assert.ok(!outputs.join('').includes('LOCAL DRAFT SECRET'));
  fs.mkdirSync(path.join(ROOT, 'output/playwright/notices-admin'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'output/playwright/notices-admin/api-results.json'), JSON.stringify({ passed: true, checks, productionWrites: false }, null, 2));
  console.log(`Notice admin API PASS: ${checks.join('; ')}; local isolated storage only, no production writes`);
} finally { await stopNoticeTestServer(server); fs.rmSync(folder, { recursive: true, force: true }); }
