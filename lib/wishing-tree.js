'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PAGE_SIZE = 24;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TYPES = new Set(['letter', 'star', 'bauble', 'gift']);
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const publicLetter = ({ id, author, to, message, decoration, createdAt }) => ({ id, author, to, message, decoration, createdAt });

function createWishingTreeHandler({ root = process.cwd(), dataDir, clock = Date.now, rateLimit = 12 } = {}) {
  const configuredDir = dataDir || process.env.WISHING_TREE_DATA_DIR ||
    (process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'wishing-tree') : '');
  const production = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT_ID);
  const directory = path.resolve(configuredDir || path.join(root, 'data', 'wishing-tree'));
  const journal = path.join(directory, 'letters.jsonl');
  const entries = new Map(), requests = new Map(), rates = new Map();
  let storageError;
  try {
    if (production && !configuredDir) throw new Error('persistent_storage_not_configured');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.existsSync(journal)) {
      const source = fs.readFileSync(journal, 'utf8');
      if (source && !source.endsWith('\n')) throw new Error('incomplete_journal');
      for (const line of source.split('\n').filter(Boolean)) {
        const operation = JSON.parse(line);
        if (operation.type === 'add') {
          const record = operation.letter;
          if (!record || !UUID.test(record.id) || !UUID.test(record.requestId) ||
            !/^[a-f0-9]{64}$/.test(record.tokenHash) || !TYPES.has(record.decoration) ||
            typeof record.message !== 'string' || typeof record.author !== 'string' ||
            typeof record.to !== 'string' || !Number.isFinite(Date.parse(record.createdAt)) ||
            entries.has(record.id) || requests.has(record.requestId)) throw new Error('invalid_journal');
          entries.set(record.id, record);requests.set(record.requestId, record);
        } else if (operation.type === 'delete' && UUID.test(operation.id) && entries.has(operation.id)) {
          entries.delete(operation.id);
        } else throw new Error('invalid_journal');
      }
    }
  } catch (error) { storageError = error; }

  function append(operation) {
    // One Node process owns this journal. An acknowledged write is flushed to disk.
    // Never reset a damaged journal or substitute seed content for visitor letters.
    fs.appendFileSync(journal, `${JSON.stringify(operation)}\n`, { mode: 0o600, flush: true });
  }
  function reply(res, status, body, extra = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', ...extra });
    res.end(JSON.stringify(body));
  }
  function fail(status, message) { const error = new Error(message);error.status = status;throw error; }
  function checkOrigin(req) {
    if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, '이 트리 페이지에서 다시 편지를 남겨주세요.');
    if (!req.headers.origin) return;
    let origin;
    try { origin = new URL(req.headers.origin); } catch { fail(403, '접속 주소를 확인해주세요.'); }
    const expected = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== expected) fail(403, '이 트리 페이지에서 다시 편지를 남겨주세요.');
  }
  async function body(req) {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) fail(415, '편지 전송 형식을 확인해주세요.');
    let size = 0;const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) fail(413, '편지는 500자 이내로 남겨주세요.');
      chunks.push(chunk);
    }
    let payload;try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, '편지 내용을 다시 확인해주세요.'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail(400, '편지 내용을 다시 확인해주세요.');
    return payload;
  }
  function text(value, name, min, max) {
    if (typeof value !== 'string') fail(400, `${name}을(를) 확인해주세요.`);
    const clean = value.replace(/\r\n?/g, '\n').trim();
    if (clean.length < min || clean.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) fail(400, `${name}은(는) ${min ? `${min}~` : ''}${max}자로 남겨주세요.`);
    return clean;
  }
  return async function handleWishingTree(req, res, { pathname, searchParams }) {
    try {
      const itemMatch = pathname.match(/^\/api\/wishing-tree\/letters\/([a-f0-9-]+)$/i);
      const collection = pathname === '/api/wishing-tree/letters';
      if (!collection && !itemMatch) { req.resume();reply(res, 404, { message: '편지를 찾을 수 없어요.' });return; }
      if ((!collection || !['GET', 'POST'].includes(req.method)) && (!itemMatch || req.method !== 'DELETE')) {
        req.resume();reply(res, 405, { message: '지원하지 않는 요청이에요.' }, { Allow: collection ? 'GET, POST' : 'DELETE' });return;
      }
      if (storageError) { req.resume();reply(res, 503, { message: '편지를 보관하는 곳에 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.' });return; }
      if (req.method === 'GET') {
        const requested = searchParams.get('page') || '1';
        if (!/^\d{1,8}$/.test(requested) || Number(requested) < 1) fail(400, '트리 번호를 확인해주세요.');
        const items = [...entries.values()].reverse();
        const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
        const page = Math.min(Number(requested), pages);
        reply(res, 200, { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(publicLetter), total: items.length, page, pages, pageSize: PAGE_SIZE });return;
      }
      checkOrigin(req);
      if (req.method === 'POST') {
        const payload = await body(req);
        const fields = { author: text(payload.author, '이름', 1, 20), to: text(payload.to ?? '', '받는 사람', 0, 24),
          message: text(payload.message, '편지', 2, 500), decoration: payload.decoration };
        if (!TYPES.has(fields.decoration) || !UUID.test(payload.requestId || '')) fail(400, '편지 장식을 다시 골라주세요.');
        if (payload.publicConsent !== true) fail(400, '모두에게 공개되는 편지에 동의해주세요.');
        const existing = requests.get(payload.requestId);
        if (existing) {
          if (Object.keys(fields).some(key => fields[key] !== existing[key])) fail(409, '편지가 변경됐어요. 페이지를 새로 열어 다시 남겨주세요.');
          if (!entries.has(existing.id)) fail(409, '이미 내려둔 편지예요. 새로운 편지를 남겨주세요.');
          // The request UUID is a client-held secret and can recover an interrupted response.
          reply(res, 200, { letter: publicLetter(existing), deleteToken: digest(payload.requestId + existing.id) });return;
        }
        const peer = req.socket.remoteAddress || 'unknown', now = clock();
        for (const [key, state] of rates) if (state.until <= now) rates.delete(key);
        const rate = rates.get(peer) || { count: 0, until: now + 60_000 };
        if (rate.count >= rateLimit) { reply(res, 429, { message: '마음을 잠시 아껴두었다가, 1분 뒤 다시 남겨주세요.' }, { 'Retry-After': String(Math.max(1, Math.ceil((rate.until - now) / 1000))) });return; }
        const id = crypto.randomUUID(), deleteToken = digest(payload.requestId + id);
        const record = { ...fields, id, createdAt: new Date(now).toISOString(), requestId: payload.requestId, tokenHash: digest(deleteToken) };
        try { append({ type: 'add', letter: record }); } catch (error) { storageError = error;fail(503, '편지를 보관하지 못했어요. 작성한 내용은 그대로 두었어요. 잠시 뒤 다시 시도해주세요.'); }
        entries.set(id, record);requests.set(payload.requestId, record);rate.count++;rates.set(peer, rate);
        reply(res, 201, { letter: publicLetter(record), deleteToken });return;
      }
      const id = itemMatch[1], record = entries.get(id);
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      if (!record || !/^[a-f0-9]{64}$/.test(token) || !crypto.timingSafeEqual(Buffer.from(digest(token)), Buffer.from(record.tokenHash))) fail(403, '내가 남긴 편지만 내려둘 수 있어요.');
      try { append({ type: 'delete', id }); } catch (error) { storageError = error;fail(503, '편지를 내리지 못했어요. 잠시 뒤 다시 시도해주세요.'); }
      entries.delete(id);reply(res, 200, { deleted: true });
    } catch (error) {
      req.resume();reply(res, error.status || 503, { message: error.status ? error.message : '트리에 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.' });
    }
  };
}

module.exports = { createWishingTreeHandler, PAGE_SIZE };
