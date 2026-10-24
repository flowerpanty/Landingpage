import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { loadNotices, validateNotices, renderNoticeContent } from './notices.mjs';

export class NoticeError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const fail = (status, code, message) => { throw new NoticeError(status, code, message); };
export const koreaDate = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const contains = (parent, child) => child === parent || child.startsWith(parent + path.sep);

export function writerLockActive(owner, { exclusiveRailwayVolume = false } = {}) {
  const [hostname, pid] = owner.split(':');
  // Railway prevents simultaneous deployments on the same volume. A different
  // container's stale lock can therefore be reclaimed on that verified mount.
  if (hostname !== os.hostname()) return !exclusiveRailwayVolume;
  try { process.kill(Number(pid), 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

export function storageConfiguration(env, root) {
  const configured = Boolean(env.NOTICE_DATA_DIR);
  if (!configured) return { configured, ready: false, reason: 'storage_not_configured' };
  try {
    if (!path.isAbsolute(env.NOTICE_DATA_DIR)) throw new Error();
    const directory = path.resolve(env.NOTICE_DATA_DIR);
    // Store files and drafts must never live below the web root, including through a symlink.
    const existingParent = fs.existsSync(directory) ? directory : path.dirname(directory);
    const realDirectory = path.join(fs.realpathSync(existingParent), path.relative(existingParent, directory));
    if (contains(fs.realpathSync(root), realDirectory)) throw new Error();
    if (env.NOTICE_STORAGE_MODE === 'test') {
      if (env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost', '::1'].includes(env.HOST)) throw new Error();
      return { configured, ready: true, directory: realDirectory, testMode: true };
    }
    const mount = fs.realpathSync(env.RAILWAY_VOLUME_MOUNT_PATH || env.NOTICE_VOLUME_MOUNT_PATH || '');
    if (mount === '/' || !contains(mount, realDirectory)) throw new Error();
    const verifiedMount = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some(line => {
      const [before, after] = line.split(' - ');
      const mountedPath = before?.split(' ')[4]?.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
      const type = after?.split(' ')[0];
      return mountedPath === mount && ['ext4', 'xfs', 'btrfs', 'zfs', 'nfs', 'nfs4'].includes(type);
    });
    if (!verifiedMount) throw new Error();
    return { configured, ready: true, directory: realDirectory, testMode: false };
  } catch { return { configured, ready: false, reason: 'persistent_mount_unverified' }; }
}

function validateState(state) {
  if (state?.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.drafts) || !Array.isArray(state.requests) || state.requests.length > 100) throw new Error('Invalid stored notice state');
  validateNotices(state.catalog);
  validateNotices({ ...state.catalog, updatedAt: '9999-12-31', notices: state.drafts });
  if (new Set([...state.catalog.notices, ...state.drafts].map(notice => notice.slug)).size > 100) throw new Error('Notice limit exceeded');
  return state;
}

function persist(file, value) {
  const bytes = JSON.stringify(value);
  if (Buffer.byteLength(bytes) > 5 * 1024 * 1024) throw new Error('Notice store too large');
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
    const directoryFd = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function createNoticeStore({ root, env = process.env, render }) {
  const seed = loadNotices(root);
  const storage = storageConfiguration(env, root);
  let state = { version: 1, revision: 0, catalog: seed, drafts: [], requests: [] };
  let snapshot = render(seed), publicAvailable = !storage.configured, ownsLock = false;
  const owner = `${os.hostname()}:${process.pid}`;
  const file = storage.directory && path.join(storage.directory, 'notices-state.json');
  const lock = storage.directory && path.join(storage.directory, 'writer.lock');
  try {
    if (storage.ready) {
      fs.mkdirSync(storage.directory, { recursive: true, mode: 0o700 });
      if (fs.existsSync(lock)) {
        const previous = fs.readFileSync(lock, 'utf8');
        const alive = writerLockActive(previous, { exclusiveRailwayVolume: !storage.testMode && Boolean(env.RAILWAY_VOLUME_NAME && env.RAILWAY_VOLUME_MOUNT_PATH) });
        if (!alive) fs.unlinkSync(lock);
      }
      try { const fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, owner); fs.closeSync(fd); ownsLock = true; }
      catch { storage.ready = false; storage.reason = 'another_writer_active'; }
      if (fs.existsSync(file)) {
        if (fs.statSync(file).size > 5 * 1024 * 1024) throw new Error('Store too large');
        state = validateState(JSON.parse(fs.readFileSync(file, 'utf8')));
      } else if (ownsLock) persist(file, state);
      else throw new Error('Store not initialized');
      snapshot = render(state.catalog); publicAvailable = ownsLock;
      if (ownsLock) {
        const probe = path.join(storage.directory, `.probe-${crypto.randomUUID()}`);
        const fd = fs.openSync(probe, 'wx', 0o600);
        try { fs.writeFileSync(fd, 'durability-probe'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); fs.unlinkSync(probe); }
      }
    }
  } catch { storage.ready = false; storage.reason = 'storage_unavailable'; }

  function normalize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'invalid_notice', '공지 입력을 확인해 주세요.');
    const allowed = new Set(['slug', 'title', 'summary', 'category', 'content', 'pinned']);
    if (Object.keys(input).some(key => !allowed.has(key))) fail(400, 'invalid_notice', '지원하지 않는 공지 필드입니다.');
    const old = state.catalog.notices.find(notice => notice.slug === input.slug);
    const date = koreaDate();
    const notice = { ...input, publishedAt: old?.publishedAt || date, modifiedAt: date, status: 'draft' };
    try {
      validateNotices({ version: 1, updatedAt: date, notices: [notice] });
      renderNoticeContent(notice, { root });
    } catch { fail(400, 'invalid_notice', '제목·주소·본문·링크 형식과 길이를 확인해 주세요.'); }
    return notice;
  }
  function mutate(input) {
    if (storage.ready && !storageConfiguration(env, root).ready) { storage.ready = false; storage.reason = 'persistent_mount_unverified'; }
    if (!storage.ready || !ownsLock) fail(503, 'storage_unavailable', '영구 저장소가 준비되지 않아 저장과 발행을 할 수 없습니다.');
    if (!input || !['draft', 'publish', 'unpublish', 'pin'].includes(input.action) || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId || '') || !Number.isSafeInteger(input.baseRevision)) fail(400, 'invalid_request', '요청 형식을 확인해 주세요.');
    const hash = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const duplicate = state.requests.find(request => request.id === input.requestId);
    if (duplicate) {
      if (duplicate.hash !== hash) fail(409, 'request_conflict', '같은 요청 번호에 다른 내용을 보낼 수 없습니다.');
      return { ...duplicate.result, duplicate: true };
    }
    if (input.baseRevision !== state.revision) fail(409, 'revision_conflict', '다른 변경이 먼저 저장되었습니다. 목록을 새로 불러온 뒤 다시 확인해 주세요.');
    const next = structuredClone(state), date = koreaDate();
    let slug;
    if (['draft', 'publish'].includes(input.action)) {
      const notice = normalize(input.notice); slug = notice.slug;
      const exists = [...state.catalog.notices, ...state.drafts].some(item => item.slug === slug);
      if (typeof input.create !== 'boolean' || (input.create && exists) || (!input.create && !exists)) fail(409, 'slug_conflict', '공지 주소가 이미 사용 중이거나 글을 찾을 수 없습니다.');
      if (input.action === 'draft') next.drafts = [...next.drafts.filter(item => item.slug !== slug), notice];
      else {
        notice.status = 'published';
        const index = next.catalog.notices.findIndex(item => item.slug === slug);
        if (index < 0) next.catalog.notices.unshift(notice);
        else next.catalog.notices[index] = notice;
        next.catalog.updatedAt = date;
        next.drafts = next.drafts.filter(item => item.slug !== slug);
      }
    } else {
      slug = input.slug;
      const notice = next.catalog.notices.find(item => item.slug === slug && item.status === 'published');
      if (!notice) fail(404, 'notice_not_found', '공개된 공지를 찾을 수 없습니다.');
      if (input.action === 'unpublish') notice.status = 'archived';
      else { if (typeof input.pinned !== 'boolean') fail(400, 'invalid_pin', '고정 설정을 확인해 주세요.'); notice.pinned = input.pinned; }
      notice.modifiedAt = date; next.catalog.updatedAt = date;
    }
    next.revision++;
    const result = { success: true, revision: next.revision, slug, action: input.action };
    next.requests = [...next.requests, { id: input.requestId, hash, result }].slice(-100);
    let nextSnapshot;
    try { validateState(next); nextSnapshot = input.action === 'draft' ? snapshot : render(next.catalog); }
    catch { fail(400, 'invalid_notice', '공지 내용을 생성할 수 없습니다. 입력을 확인해 주세요.'); }
    try { persist(file, next); }
    catch { storage.ready = false; storage.reason = 'storage_unavailable'; fail(503, 'storage_unavailable', '저장을 확인하지 못했습니다. 입력 내용을 유지하고 관리자에게 저장소 상태를 확인해 주세요.'); }
    // A single in-memory pointer swap happens only after durable state commit.
    state = next; snapshot = nextSnapshot;
    return result;
  }
  return {
    get state() { return structuredClone(state); },
    get snapshot() { return snapshot; },
    get publicAvailable() { return publicAvailable; },
    get status() { return { ready: Boolean(storage.ready && ownsLock), configured: storage.configured, testMode: Boolean(storage.testMode), reason: storage.reason || '' }; },
    normalize, mutate,
    close() { if (ownsLock && fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === owner) fs.unlinkSync(lock); ownsLock = false; }
  };
}
