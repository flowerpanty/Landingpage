(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let state, selected = null, busy = false, pending;
  const special = { christmasProducts: '[[크리스마스 상품 4종]]', shippingProducts: '[[택배 가능 상품 3종]]' };
  const message = (text, failed = false) => { $('message').textContent = text; $('message').classList.toggle('is-error', failed); };
  async function api(path, body) {
    const response = await fetch(`/api/notice-admin/${path}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json', ...(state?.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}) } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.message || '요청을 처리하지 못했습니다.'); error.code = result.error; throw error; }
    return result;
  }
  function buttons() {
    document.querySelectorAll('#editor button, #new-notice, #logout').forEach(button => { button.disabled = busy || !state || (button.hasAttribute('data-write') && !state.storage.ready); });
    if ($('unpublish')) $('unpublish').disabled = busy || !state?.storage.ready || !state.notices.find(item => item.notice.slug === selected)?.published;
  }
  function serialize(blocks) {
    return blocks.map(block => block.type === 'paragraph' ? block.text : block.type === 'heading' ? `## ${block.text}` : block.type === 'list' ? block.items.map(item => `- ${item}`).join('\n') : block.type === 'links' ? block.items.map(item => `[${item.label}](${item.href})`).join('\n') : special[block.type]).join('\n\n');
  }
  function content(text) {
    return text.trim().split(/\n\s*\n/).map(part => {
      if (part.trim() === special.christmasProducts) return { type: 'christmasProducts' };
      if (part.trim() === special.shippingProducts) { if (!state.shippingPreset) throw new Error('택배 상품 구성을 찾을 수 없습니다.'); return structuredClone(state.shippingPreset); }
      if (/^##\s+/.test(part)) return { type: 'heading', text: part.replace(/^##\s+/, '').trim() };
      const lines = part.split('\n');
      if (lines.every(line => /^-\s+/.test(line))) return { type: 'list', items: lines.map(line => line.replace(/^-\s+/, '').trim()) };
      const links = lines.map(line => line.match(/^\[([^\]]+)\]\(([^)]+)\)$/));
      if (links.every(Boolean)) return { type: 'links', items: links.map(match => ({ label: match[1], href: match[2] })) };
      return { type: 'paragraph', text: part.trim() };
    });
  }
  function formData() {
    if (!$('editor').reportValidity()) throw new Error('필수 입력을 확인해 주세요.');
    return { slug: $('slug').value.trim(), title: $('title').value.trim(), summary: $('summary').value.trim(), category: $('category').value.trim(), pinned: $('pinned').checked, content: content($('body').value) };
  }
  function select(slug) {
    selected = slug; pending = null;
    const item = state.notices.find(row => row.notice.slug === slug);
    const notice = item?.notice;
    $('editor').reset(); $('slug').readOnly = Boolean(notice);
    if (notice) {
      for (const key of ['slug', 'title', 'summary', 'category']) $(key).value = notice[key];
      $('pinned').checked = notice.pinned; $('body').value = serialize(notice.content);
      $('dates').textContent = `게시 기준일 ${notice.publishedAt} · 수정일 ${notice.modifiedAt}${item.hasDraft ? ' · 임시저장본을 편집 중입니다' : ''}`;
      $('edit-title').textContent = item.published ? '공개 공지 수정' : '비공개 공지 편집';
    } else { $('edit-title').textContent = '새 공지 작성'; $('dates').textContent = '최초 발행일과 수정일은 서버에서 실제 저장일로 기록합니다.'; }
    document.querySelectorAll('#notice-list button').forEach(button => button.setAttribute('aria-current', String(button.dataset.slug === slug)));
    buttons();
  }
  function renderList() {
    $('notice-list').replaceChildren();
    const sorted = [...state.notices].sort((a, b) => Number(b.notice.pinned) - Number(a.notice.pinned) || b.notice.modifiedAt.localeCompare(a.notice.modifiedAt));
    for (const item of sorted) {
      const li = document.createElement('li'), button = document.createElement('button'), title = document.createElement('span'), meta = document.createElement('small');
      button.type = 'button'; button.dataset.slug = item.notice.slug; title.textContent = item.notice.title;
      meta.textContent = `${item.published ? '공개' : '비공개'}${item.hasDraft ? ' · 임시저장' : ''}${item.notice.pinned ? ' · 상단 고정' : ''} · ${item.notice.modifiedAt}`;
      button.append(title, meta); button.addEventListener('click', () => { if (!busy) select(item.notice.slug); }); li.append(button); $('notice-list').append(li);
    }
  }
  async function load(slug = selected) {
    state = await api('session');
    $('storage-status').textContent = state.storage.ready ? state.storage.testMode ? '테스트 저장소가 연결되었습니다. 이 환경의 발행은 운영 사이트에 반영되지 않습니다.' : '영구 저장소가 연결되었습니다. 저장을 확인한 뒤 공개 화면에 반영합니다.' : '영구 저장소가 준비되지 않았습니다. 미리보기만 가능하며 저장·발행·비공개 전환은 비활성화됩니다.';
    renderList(); select(slug && state.notices.some(item => item.notice.slug === slug) ? slug : null);
    $('editor-layout').dataset.ready = 'true';
  }
  async function write(action) {
    if (busy || !state.storage.ready) return;
    try {
      const payload = action === 'unpublish' ? { action, slug: selected } : { action, notice: formData(), create: selected === null };
      const signature = JSON.stringify(payload);
      if (!pending || pending.signature !== signature) pending = { signature, body: { ...payload, baseRevision: state.revision, requestId: crypto.randomUUID() } };
      busy = true; buttons(); message('저장을 확인하고 있습니다…');
      const result = await api('notices', pending.body);
      await load(result.slug); pending = null;
      message(action === 'publish' ? '발행했습니다. 공개 목록·상세·홈 소식·RSS·사이트맵에 반영되었습니다.' : action === 'draft' ? '임시저장했습니다. 현재 공개 본문은 바뀌지 않았습니다.' : '비공개로 전환했습니다. 공개 목록과 RSS·사이트맵에서 제외되었습니다.');
    } catch (error) {
      if (['storage_unavailable', 'test_requires_loopback'].includes(error.code)) {
        state.storage.ready = false;
        $('storage-status').textContent = '저장소 연결을 확인하지 못해 저장·발행을 중지했습니다. 입력 내용을 보관하고 저장소 복구 후 다시 로그인해 주세요.';
      }
      message(`${error.message} 입력 내용은 이 화면에 유지됩니다.`, true);
    }
    finally { busy = false; buttons(); }
  }
  $('login')?.addEventListener('submit', async event => {
    event.preventDefault(); const button = $('login').querySelector('button'); button.disabled = true;
    try { await api('login', { username: $('username').value, password: $('password').value }); $('password').value = ''; location.reload(); }
    catch (error) { message(error.message, true); } finally { button.disabled = false; }
  });
  if (!$('editor')) return;
  $('logout').hidden = false;
  $('logout').addEventListener('click', async () => { try { await api('logout', {}); location.reload(); } catch (error) { message(error.message, true); } });
  $('new-notice').addEventListener('click', () => { select(null); $('title').focus(); });
  $('editor').addEventListener('submit', event => event.preventDefault());
  $('save-draft').addEventListener('click', () => write('draft'));
  $('publish').addEventListener('click', () => write('publish'));
  $('unpublish').addEventListener('click', () => write('unpublish'));
  $('preview').addEventListener('click', async () => {
    if (busy) return;
    try { const notice = formData(); busy = true; buttons(); const result = await api('preview', { notice }); $('preview-frame').srcdoc = result.html; $('preview-dialog').showModal(); }
    catch (error) { message(error.message, true); } finally { busy = false; buttons(); }
  });
  $('close-preview').addEventListener('click', () => $('preview-dialog').close());
  for (const [id, type] of [['insert-christmas', 'christmasProducts'], ['insert-shipping', 'shippingProducts']]) $(id).addEventListener('click', () => { $('body').value = `${$('body').value.trim()}\n\n${special[type]}`.trim(); $('body').focus(); });
  busy = true; buttons();
  load().catch(error => message(error.message, true)).finally(() => { busy = false; buttons(); });
})();
