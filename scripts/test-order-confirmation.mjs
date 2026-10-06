import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { File } from 'node:buffer';

// Exercise the actual legacy page renderer and shared save/confirmation flow.
// Browser adapters are local; no notifications, clipboard writes or real orders.
for (const slug of ['lucky', 'cookies']) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      id, hidden: true, disabled: false, textContent: '견적서 받고 카카오톡에서 주문 확정하기 →',
      style: {}, classList: { add() {}, remove() {}, toggle() {} },
      querySelector: (selector) => node(selector), scrollIntoView() {}, removeAttribute() {}, setAttribute() {},
    });
    return nodes.get(id);
  };
  const painted = [];
  const events = [];
  let posts = 0;
  let fail = false;
  const ctx = { fillRect() {}, strokeRect() {}, fillText: text => painted.push(text) };
  const sandbox = {
    window: {}, navigator: {}, Blob, File, console, URL,
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: fn => fn(),
    document: {
      fonts: { ready: Promise.resolve() }, addEventListener() {},
      getElementById: node,
      querySelectorAll: () => [node('quoteButton'), node('kakaoButton')],
      createElement: tag => {
        assert.equal(tag, 'canvas');
        return { getContext: () => ctx, toBlob: callback => callback(new Blob(['canvas'], { type: 'image/png' })) };
      },
    },
  };
  vm.createContext(sandbox);
  for (const file of ['order-core.js', 'order-confirmation.js', 'landing-quote.js']) vm.runInContext(fs.readFileSync(`order/assets/${file}`, 'utf8'), sandbox);
  sandbox.window.gtag = () => { throw new Error('Analytics failure'); };
  sandbox.window.NMOrderCore.postLandingOrder = async payload => {
    posts++;
    events.push('save');
    assert.equal(node('quoteButton').disabled, true);
    if (fail) throw new Error('저장 실패 테스트');
    return { orderId: `saved-${posts}`, totalPrice: vm.runInContext(slug === 'lucky' ? 'totalPrice()' : 'subtotal()', sandbox), pricingPending: false };
  };
  sandbox.window.NMQuote.provideImage = async (_blob, filename) => {
    events.push('provide');
    assert.equal(node('orderConfirmationStatus').hidden, false);
    assert.match(node('[data-confirm-saved]').textContent, /견적서가 저장/);
    assert.match(filename, /nothingmatters-.*-quote-\d+\.png/);
    return 'download';
  };
  sandbox.window.NMQuote.navigateToKakao = () => {
    events.push('kakao');
    assert.equal(node('[data-confirm-moving]').hidden, false);
  };
  const html = fs.readFileSync(`order/${slug}.html`, 'utf8');
  const inline = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).at(-1)[1];
  // Skip bootstrapping inputs/gallery only. All quote and pricing functions run.
  vm.runInContext(inline.replace(/    init\(\);\s*$/, ''), sandbox);
  vm.runInContext(`Object.assign(state, { step: ${slug === 'lucky' ? 3 : 5}, customerName: '검증', customerPhone:'010-1234-5678', date:'2026-10-10', quantity:2 });`, sandbox);
  if (slug === 'cookies') vm.runInContext('state.items = [{ packageId:"two-box", flavorQty:{ "double-choco":2 }, drink:"", ribbon:true }]; state.sticker=true;', sandbox);
  const expectedTotal = vm.runInContext(slug === 'lucky' ? 'totalPrice()' : 'subtotal()', sandbox);
  assert.equal(expectedTotal, slug === 'lucky' ? 30000 : 31000);
  fail = true;
  await vm.runInContext('receiveQuote()', sandbox);
  assert.deepEqual(events, ['save']);
  assert.equal(node('orderConfirmationError').hidden, false);
  assert.equal(node('orderConfirmationStatus').hidden, true);
  assert.equal(node('quoteButton').disabled, false);
  assert.equal(vm.runInContext('state.customerName', sandbox), '검증');
  events.length = 0;
  // Direct consultation must also fail before navigation.
  await vm.runInContext('receiveQuote(true)', sandbox);
  assert.deepEqual(events, ['save']);
  fail = false;
  events.length = 0;
  await Promise.all([vm.runInContext('receiveQuote()', sandbox), vm.runInContext('receiveQuote()', sandbox)]);
  assert.deepEqual(events, ['save', 'provide', 'kakao']);
  assert.equal(vm.runInContext('state.orderId', sandbox), `saved-${posts}`);
  assert.equal(vm.runInContext('state.submitted', sandbox), true);
  assert.equal(vm.runInContext('state.submitting', sandbox), false);
  const successfulPosts = posts;
  events.length = 0;
  vm.runInContext('confirmationFlow.refresh()', sandbox);
  await vm.runInContext('receiveQuote()', sandbox);
  await vm.runInContext('receiveQuote(true)', sandbox);
  assert.equal(posts, successfulPosts);
  assert.deepEqual(events, ['provide', 'kakao', 'kakao']);
  assert(painted.some(text => text.includes('카카오톡 상담 완료 후 주문이 최종 확정')));
  assert(painted.some(text => text.includes('입금 계좌')));
  assert(painted.some(text => text.includes('주문 문의')));
  // Changing customer data hides the earlier success and saves a new request.
  vm.runInContext('state.customerName="수정 검증"; confirmationFlow.refresh()', sandbox);
  assert.equal(node('orderConfirmationStatus').hidden, true);
  await vm.runInContext('receiveQuote(true)', sandbox);
  assert.equal(posts, successfulPosts + 1);
  console.log(`${slug}: existing prices/PNG, warning, save before provide/Kakao, failed direct/quote retry, duplicate/concurrent protection PASS`);
}
