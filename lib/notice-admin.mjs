import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadNotices } from './notices.mjs';
import { createNoticeStore, NoticeError, koreaDate } from './notice-store.mjs';
import { renderNoticeOutputs } from '../scripts/build-notices.mjs';
import { buildSchema, insertSchema } from '../scripts/generate-jsonld.mjs';
import { renderSiteSitemap } from './site-sitemap.mjs';

const COOKIE = 'nm_notice_session';
const TTL = 8 * 3600000;
const hash = value => crypto.createHash('sha256').update(String(value)).digest();
const equal = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));
const error = (status, code, message) => { throw new NoticeError(status, code, message); };
const normalizedPath = value => { try { return path.posix.normalize(decodeURIComponent(value).replace(/\\/g, '/')); } catch { return value; } };
const json = (res, status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); };

function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') { req.resume(); error(415, 'json_required', 'JSON 요청이 필요합니다.'); }
  if (Number(req.headers['content-length']) > 128 * 1024) { req.resume(); error(413, 'body_too_large', '공지 내용이 너무 큽니다.'); }
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    const cleanup = () => { req.removeListener('data', data); req.removeListener('end', end); req.removeListener('error', reject); };
    const data = chunk => {
      size += chunk.length;
      if (size > 128 * 1024) { cleanup(); req.resume(); reject(new NoticeError(413, 'body_too_large', '공지 내용이 너무 큽니다.')); }
      else chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new NoticeError(400, 'invalid_json', '입력 형식을 확인해 주세요.')); }
    };
    req.on('data', data); req.on('end', end); req.on('error', reject);
  });
}

export function createNoticeService({ root, env = process.env }) {
  const business = JSON.parse(fs.readFileSync(path.join(root, 'data/business.json'), 'utf8'));
  function render(catalog, preview = false) {
    const generated = renderNoticeOutputs({ root, data: catalog, preview });
    const registry = JSON.parse(generated.get('data/site-pages.json'));
    const result = new Map();
    for (const [file, html] of generated) {
      if (file === 'index.html' || (file.startsWith('notice/') && file.endsWith('/index.html'))) {
        const pathname = file === 'index.html' ? '/' : `/${file.replace(/index\.html$/, '')}`;
        result.set(pathname, insertSchema(html, buildSchema(html, business.siteUrl + pathname, { notices: catalog, registry })));
      }
    }
    result.set('/notice/feed.xml', generated.get('notice/feed.xml'));
    result.set('/llms.txt', generated.get('llms.txt'));
    result.set('/sitemap.xml', renderSiteSitemap(registry, { root, siteUrl: business.siteUrl }));
    return result;
  }
  const store = createNoticeStore({ root, env, render });
  const username = env.NOTICE_ADMIN_USERNAME || '', password = env.NOTICE_ADMIN_PASSWORD || '';
  let publicOrigin = business.siteUrl, originConfigured = true;
  try {
    const configured = new URL(env.NOTICE_PUBLIC_ORIGIN || business.siteUrl);
    if (configured.protocol !== 'https:' || configured.pathname !== '/' || configured.username || configured.password || configured.search || configured.hash) throw new Error();
    publicOrigin = configured.origin;
  } catch { originConfigured = false; }
  const authConfigured = originConfigured && username.length >= 3 && username.length <= 100 && password.length >= 16 && password.length <= 256;
  const sessions = new Map(), attempts = new Map(), reads = new Map();
  function rate(map, key, limit, interval) {
    const now = Date.now();
    for (const [id, row] of map) if (row.until <= now) map.delete(id);
    const item = map.get(key) || { count: 0, until: now + interval };
    item.count++; map.set(key, item);
    if (item.count > limit) error(429, 'rate_limited', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  }
  function session(req) {
    for (const [key, item] of sessions) if (item.expires <= Date.now()) sessions.delete(key);
    const token = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return token ? sessions.get(hash(token).toString('hex')) : null;
  }
  function secureContext(req, ctx) {
    const rawHost = req.headers.host || '';
    const host = new URL(`http://${rawHost}`).hostname;
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(host) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (env.NODE_ENV !== 'production' && loopback) return { origin: `http://${rawHost}`, secure: false, local: true };
    if (ctx.proto !== 'https' || ctx.host !== new URL(publicOrigin).hostname) error(403, 'https_required', '관리자는 공식 HTTPS 주소에서 접속해 주세요.');
    return { origin: publicOrigin, secure: true, local: false };
  }
  function origin(req, transport) {
    if (req.headers.origin !== transport.origin || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin' && req.headers['sec-fetch-site'] !== 'none')) error(403, 'origin_rejected', '같은 사이트에서 다시 시도해 주세요.');
  }
  function csrf(req, current) {
    if (!req.headers['x-csrf-token'] || !equal(req.headers['x-csrf-token'], current.csrf)) error(403, 'csrf_rejected', '관리자 화면을 새로고침한 뒤 다시 시도해 주세요.');
  }
  const cookie = (token, secure, age = TTL / 1000) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const privateHeaders = res => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Vary', 'Cookie');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self' https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  };
  function list(current, transport) {
    const state = store.state;
    const slugs = new Set([...state.catalog.notices, ...state.drafts].map(item => item.slug));
    const storage = store.status;
    if (storage.testMode && !transport.local) { storage.ready = false; storage.reason = 'test_requires_loopback'; }
    return { revision: state.revision, csrfToken: current.csrf, storage,
      shippingPreset: loadNotices(root).notices.flatMap(notice => notice.content).find(block => block.type === 'shippingProducts'),
      notices: [...slugs].map(slug => ({
      notice: state.drafts.find(item => item.slug === slug) || state.catalog.notices.find(item => item.slug === slug),
      published: state.catalog.notices.some(item => item.slug === slug && item.status === 'published'),
      hasDraft: state.drafts.some(item => item.slug === slug)
    })) };
  }
  async function handle(req, res, ctx) {
    const pathname = normalizedPath(ctx.pathname);
    // Guard normalized aliases before the generic static file server can resolve them.
    if (pathname === '/data/notices.json' || /(?:^|\/)\.(?:env|git)(?:[./]|$)/.test(pathname)) {
      privateHeaders(res); res.writeHead(404); res.end(); return true;
    }
    const admin = /^\/notice\/admin(?:\/|$)/.test(pathname);
    const api = /^\/api\/notice-admin(?:\/|$)/.test(pathname);
    if (admin || api) {
      privateHeaders(res);
      try {
        const transport = secureContext(req, ctx);
        const current = session(req);
        rate(reads, req.socket.remoteAddress, 300, 60000);
        if (admin) {
          if (!['GET', 'HEAD'].includes(req.method)) error(405, 'method_not_allowed', '지원하지 않는 요청입니다.');
          const asset = pathname.replace(/^\/notice\/admin\/?/, '') || 'index.html';
          if (!['index.html', 'admin.js', 'admin.css'].includes(asset)) error(404, 'not_found', '페이지를 찾을 수 없습니다.');
          let body = fs.readFileSync(path.join(root, 'notice/admin', asset), 'utf8');
          if (asset === 'index.html') {
            body = body.replace(/<!-- LOGIN:START -->[\s\S]*?<!-- LOGIN:END -->/, block => current ? '' : block)
              .replace(/<!-- EDITOR:START -->[\s\S]*?<!-- EDITOR:END -->/, block => current ? block : '')
              .replace('<!-- AUTH_STATUS -->', authConfigured ? '' : '<p class="na-alert">관리자 인증 환경변수 설정이 필요합니다. 운영 설정 문서를 확인해 주세요.</p>');
          }
          res.writeHead(asset === 'index.html' && !authConfigured ? 503 : 200, { 'Content-Type': asset.endsWith('.js') ? 'text/javascript; charset=utf-8' : asset.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
          res.end(req.method === 'HEAD' ? undefined : body); return true;
        }
        if (!authConfigured) error(503, 'auth_not_configured', '관리자 인증 설정이 필요합니다.');
        if (pathname === '/api/notice-admin/login' && req.method === 'POST') {
          origin(req, transport); rate(attempts, req.socket.remoteAddress, 5, 15 * 60000);
          const body = await readJson(req);
          if (!body || typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 100 || body.password.length > 256) error(401, 'authentication_failed', '아이디와 비밀번호를 확인해 주세요.');
          const validUser = equal(body.username, username), validPassword = equal(body.password, password);
          if (!validUser || !validPassword) error(401, 'authentication_failed', '아이디와 비밀번호를 확인해 주세요.');
          if (sessions.size >= 50) sessions.delete(sessions.keys().next().value);
          const token = crypto.randomBytes(32).toString('base64url');
          sessions.set(hash(token).toString('hex'), { csrf: crypto.randomBytes(32).toString('base64url'), expires: Date.now() + TTL });
          res.setHeader('Set-Cookie', cookie(token, transport.secure)); json(res, 200, { success: true }); return true;
        }
        if (!current) error(401, 'authentication_required', '관리자 로그인이 필요합니다.');
        if (pathname === '/api/notice-admin/session' && req.method === 'GET') { json(res, 200, list(current, transport)); return true; }
        if (req.method !== 'POST') error(405, 'method_not_allowed', '지원하지 않는 요청입니다.');
        origin(req, transport); csrf(req, current);
        if (pathname === '/api/notice-admin/logout') {
          for (const [key, item] of sessions) if (item === current) sessions.delete(key);
          req.resume(); res.setHeader('Set-Cookie', cookie('', transport.secure, 0)); json(res, 200, { success: true }); return true;
        }
        const body = await readJson(req);
        if (pathname === '/api/notice-admin/preview') {
          const notice = store.normalize(body?.notice); notice.status = 'published';
          const data = { version: 1, updatedAt: koreaDate(), notices: [notice] };
          const html = render(data, true).get(`/notice/${notice.slug}/`);
          json(res, 200, { html }); return true;
        }
        if (pathname === '/api/notice-admin/notices') {
          if (store.status.testMode && !transport.local) error(503, 'test_requires_loopback', '테스트 저장소는 로컬 검증에만 사용할 수 있습니다.');
          json(res, 200, store.mutate(body)); return true;
        }
        error(404, 'not_found', 'API를 찾을 수 없습니다.');
      } catch (err) {
        req.resume();
        if (err.status === 429) res.setHeader('Retry-After', '900');
        json(res, err instanceof NoticeError ? err.status : 500, { error: err instanceof NoticeError ? err.code : 'notice_unavailable', message: err instanceof NoticeError ? err.message : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
        return true;
      }
    }
    const state = store.status;
    const isNotice = /^\/notice(?:\/|$)/.test(pathname);
    const isDynamic = state.configured && ['/', '/index.html', '/sitemap.xml', '/llms.txt'].includes(pathname);
    if (!isNotice && !isDynamic) return false;
    if (!['GET', 'HEAD'].includes(req.method)) { req.resume(); res.writeHead(405); res.end(); return true; }
    const route = pathname === '/index.html' ? '/' : pathname.replace(/\/index\.html$/, '/');
    if (isNotice && !pathname.endsWith('/') && store.snapshot.has(`${pathname}/`)) {
      res.writeHead(301, { Location: `${pathname}/`, 'Cache-Control': 'no-store' }); res.end(); return true;
    }
    if (!store.publicAvailable) {
      if (isNotice) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : '공지 저장소를 확인 중입니다. 잠시 후 다시 확인해 주세요.'); return true; }
      // Preserve shopping when a configured store fails; never expose an older seed notice.
      const empty = render({ ...loadNotices(root), notices: [] });
      const body = empty.get(route);
      res.writeHead(200, { 'Content-Type': route.endsWith('.xml') ? 'application/xml; charset=utf-8' : route.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : route === '/' && ctx.transformHome ? ctx.transformHome(body) : body); return true;
    }
    const body = store.snapshot.get(route);
    if (body === undefined) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : '공개된 공지를 찾을 수 없습니다.'); return true; }
    res.writeHead(200, { 'Content-Type': route.endsWith('.xml') ? 'application/xml; charset=utf-8' : route.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : route === '/' && ctx.transformHome ? ctx.transformHome(body) : body); return true;
  }
  return { handle, close: () => store.close() };
}
