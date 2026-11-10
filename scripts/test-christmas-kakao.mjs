import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the real saved-order/email/clipboard modules with loopback-free adapters.
// No database, email delivery, system clipboard, or external navigation is used.
class Node {
  hidden = false; disabled = false; textContent = ''; value = ''; open = false; dataset = {};
  events = new Map();
  addEventListener(name, fn) { this.events.set(name, fn); }
  async click() { if (!this.disabled) return this.events.get('click')?.(); }
  focus() {}
  select() {}
  remove() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.events.get('close')?.(); }
}
function fixture() {
  const nodes = new Map(['[data-kakao-title]', '[data-kakao-hint]', '[data-kakao-preview]', '[data-kakao-manual]',
    'textarea', '[data-kakao-retry]', '[data-kakao-open]', '[data-kakao-feedback]', '[data-kakao-close]'].map(s => [s, new Node()]));
  const dialog = new Node(); dialog.querySelector = selector => nodes.get(selector);
  const events = [], copied = [];
  const behavior = { failSave: false, failEmail: false, failCopy: false, copyGate: null, allowFallback: false };
  const state = { posts: 0, emails: 0, navigation: 0 };
  const sandbox = {
    window: { isSecureContext: true }, navigator: { clipboard: { writeText: async text => {
      events.push('copy');
      if (behavior.copyGate) await behavior.copyGate;
      if (behavior.failCopy) throw new Error('Clipboard denied');
      copied.push(text);
    } } },
    document: { activeElement: new Node(), body: { append() {}, classList: { add() {}, remove() {} } },
      createElement: () => new Node(), execCommand: () => false },
  };
  const area = nodes.get('textarea');
  area.focus = () => { sandbox.document.activeElement = area; };
  area.select = () => { area.selectionStart = 0; area.selectionEnd = area.value.length; };
  sandbox.document.execCommand = () => {
    if (!behavior.allowFallback) return false;
    events.push('copy:fallback'); copied.push(area.value); return true;
  };
  vm.createContext(sandbox);
  for (const file of ['order/assets/landing-quote.js', 'order/assets/order-email-quote.js', 'christmas/christmas-kakao.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  }
  sandbox.window.NMQuote.navigateToKakao = () => { state.navigation++; };
  const completion = sandbox.window.NMChristmasKakao.create(dialog);
  const payload = { source: 'christmasBrookie', customerEmail: 'customer@example.com' };
  const data = { documentTitle: 'nothingmatters 크리스마스 브루키 견적서', customerName: 'LOCAL COPY TEST',
    customerPhone: '010-0000-0000', customerEmail: payload.customerEmail, deliveryDate: '2026-12-10', pickupTime: '14:00',
    deliveryMethod: 'quick', deliveryAddress: '배송 주소 테스트', request: '로컬 테스트', details: [],
    items: [{ name: '트리 브루키', quantity: 4, unitPrice: 9500, amount: 38000 }], totalPrice: 38000 };
  const flow = sandbox.window.NMEmailQuote.create({
    fileSlug: 'christmas-brookie', createImage: async () => ({}),
    postOrder: async () => {
      events.push('save'); state.posts++;
      if (behavior.failSave) throw new Error('Save failed');
      return { orderId: 'saved-christmas-order', emailQuoteToken: 'fixture' };
    },
    fromSaved: () => data,
    postEmail: async id => {
      assert.equal(id, 'saved-christmas-order'); events.push('email'); state.emails++;
      if (behavior.failEmail) throw new Error('Email failed');
      return { maskedEmail: 'cus***@example.com' };
    },
    onEmail: status => events.push(`email:${status}`),
    provideImage: async () => { events.push('png'); return 'download'; },
    navigateToKakao: () => {},
  });
  const receive = async () => { const saved = await flow.receive(payload, data); if (saved) await completion.present(saved); };
  return { nodes, dialog, behavior, state, events, copied, receive, completion, flow, payload, data };
}

const success = fixture();
await success.receive();
assert(success.dialog.open);
assert.equal(success.nodes.get('[data-kakao-title]').textContent, '✅ 주문 내용이 복사됐어요!');
assert.equal(success.nodes.get('[data-kakao-hint]').textContent, '카카오톡에서 붙여넣기만 해주세요.');
assert.equal(success.dialog.dataset.copyState, 'success');
assert.equal(success.state.navigation, 0, 'copying never opens Kakao');
for (const text of ['트리 브루키 4개 × 9,500원', '오후 2시', '38,000원']) assert(success.nodes.get('[data-kakao-preview]').textContent.includes(text));
for (const text of ['LOCAL COPY TEST', '010-0000-0000', '배송 주소 테스트', '로컬 테스트', '9,500원']) assert(success.copied[0].includes(text));
assert(success.events.indexOf('save') < success.events.indexOf('email'));
assert(success.events.indexOf('email') < success.events.indexOf('copy'));
await success.nodes.get('[data-kakao-retry]').click();
assert.equal(success.nodes.get('[data-kakao-feedback]').textContent, '✅ 다시 복사됐어요.');
await success.nodes.get('[data-kakao-open]').click();
await success.nodes.get('[data-kakao-open]').click();
assert.equal(success.state.navigation, 2, 'only explicit clicks navigate');
assert.equal(success.state.posts, 1); assert.equal(success.state.emails, 1);
await success.nodes.get('[data-kakao-close]').click(); assert.equal(success.dialog.open, false);
await success.receive(); assert.equal(success.state.posts, 1); assert.equal(success.state.emails, 1);

const denied = fixture(); denied.behavior.failCopy = true;
await denied.receive();
assert.equal(denied.dialog.dataset.copyState, 'failed');
assert.equal(denied.nodes.get('[data-kakao-title]').textContent, '주문 내용을 자동으로 복사하지 못했어요.');
assert.equal(denied.nodes.get('[data-kakao-manual]').hidden, false);
assert(denied.nodes.get('textarea').value.includes('트리 브루키'));
assert.equal(denied.nodes.get('[data-kakao-retry]').textContent, '다시 복사');
assert.equal(denied.state.navigation, 0);
await denied.nodes.get('[data-kakao-open]').click(); assert.equal(denied.state.navigation, 1);
denied.behavior.failCopy = false; await denied.nodes.get('[data-kakao-retry]').click();
assert.equal(denied.dialog.dataset.copyState, 'success');
assert.equal(denied.nodes.get('[data-kakao-manual]').hidden, true);
assert.equal(denied.state.posts, 1);

const fallback = fixture(); fallback.behavior.failCopy = true; fallback.behavior.allowFallback = true;
await fallback.receive();
assert.equal(fallback.dialog.dataset.copyState, 'success');
assert(fallback.copied[0].includes('38,000원'));
const inert = fixture(); inert.behavior.failCopy = true; inert.behavior.allowFallback = true;
inert.nodes.get('textarea').focus = () => {};
await inert.receive();
assert.equal(inert.dialog.dataset.copyState, 'failed', 'an unselectable textarea can never report copy success');
assert.equal(inert.copied.length, 0);

const failedSave = fixture(); failedSave.behavior.failSave = true;
await assert.rejects(failedSave.receive(), /Save failed/);
assert.equal(failedSave.dialog.open, false); assert.equal(failedSave.state.emails, 0);
assert.equal(failedSave.copied.length, 0); assert.equal(failedSave.state.navigation, 0);

const failedEmail = fixture(); failedEmail.behavior.failEmail = true;
await failedEmail.receive(); assert(failedEmail.dialog.open);
failedEmail.behavior.failEmail = false; await failedEmail.flow.retryEmail(failedEmail.payload);
assert.equal(failedEmail.state.posts, 1); assert.equal(failedEmail.state.emails, 2);

const pendingCopy = fixture(); let release;
pendingCopy.behavior.copyGate = new Promise(resolve => { release = resolve; });
const pending = pendingCopy.receive();
await new Promise(resolve => setImmediate(resolve));
assert.equal(pendingCopy.dialog.dataset.copyState, 'copying');
assert.equal(pendingCopy.nodes.get('[data-kakao-open]').disabled, true);
await pendingCopy.nodes.get('[data-kakao-open]').click();
await pendingCopy.completion.present(pendingCopy.flow.getSaved(pendingCopy.payload));
assert.equal(pendingCopy.events.filter(e => e === 'copy').length, 1);
release(); await pending; assert.equal(pendingCopy.state.navigation, 0);

console.log('Christmas Kakao copy UX: saved-order/email sequencing, persistent success screen, explicit-only navigation, retry, denied clipboard manual fallback, save/email failure and duplicate protection PASS');
