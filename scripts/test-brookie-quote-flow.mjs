import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { File } from 'node:buffer';

const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {
    id, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector: selector => node(selector), querySelectorAll: () => [],
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, scrollIntoView() {}, focus() {},
    checkValidity() { return !this.value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value); },
  });
  return nodes.get(id);
};
const panels = ['character', 'heart', 'paper', 'quantity'].map(id => { const panel = node(id); panel.dataset.builderPanel = id; panel.hidden = true; return panel; });
const painted = [];
const events = [];
let saves = 0;
let emailFail = false;
let saveFail = false;
const ctx = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), fillText: text => painted.push(String(text)) }, {
  get: (target, key) => key in target ? target[key] : () => {},
});
const sandbox = {
  window: { addEventListener() {}, scrollTo() {}, clearTimeout() {}, setTimeout: () => 1, matchMedia: () => ({ matches: true }) },
  navigator: { clipboard: { writeText: async () => {} } }, Blob, File, AbortController, console, URL,
  setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => {},
  localStorage: { removeItem() {} }, sessionStorage: { setItem() {}, getItem: () => null },
  IntersectionObserver: class { observe() {} },
  document: {
    documentElement: { removeAttribute() {} }, body: node('body'), fonts: { ready: Promise.resolve() },
    addEventListener() {}, getElementById: node,
    querySelectorAll: selector => selector === '[data-builder-panel]' ? panels : selector === 'button, input, select, textarea' ? [node('quoteBtn'), node('quoteKakaoLink')] : [],
    createElement: tag => { assert.equal(tag, 'canvas'); return { getContext: () => ctx, toBlob: callback => callback(new Blob(['canvas'], { type: 'image/png' })) }; },
  },
  fetch: async (url, init) => {
    events.push('email');
    assert(url.includes(`/api/orders/saved-${saves}/email-quote`));
    assert.match(init.headers.Authorization, /^Bearer token-/);
    assert.equal(JSON.parse(init.body).email, 'kim@example.com');
    return { ok: !emailFail, status: emailFail ? 503 : 200, json: async () => ({ success: !emailFail, maskedEmail: 'ki***@example.com', message: emailFail ? '현재 이메일 견적 서비스를 사용할 수 없습니다. 화면에서 견적서를 저장한 뒤 카카오톡 상담을 이용해주세요.' : undefined }) };
  },
};
vm.createContext(sandbox);
for (const file of ['order-core.js', 'order-confirmation.js', 'landing-quote.js', 'brookie-quote.js']) vm.runInContext(fs.readFileSync(`order/assets/${file}`, 'utf8'), sandbox);
sandbox.window.NMOrderCore.postLandingOrder = async payload => {
  events.push('save');
  if (saveFail) throw new Error('저장 실패');
  saves++;
  const totalPrice = vm.runInContext('totalPrice()', sandbox);
  return { orderId: `saved-${saves}`, emailQuoteToken: `token-${saves}`, totalPrice, orderItems: [{ quantity: 1, price: totalPrice }] };
};
sandbox.window.NMQuote.provideImage = async () => { events.push('png'); return 'download'; };
sandbox.window.NMQuote.navigateToKakao = () => events.push('kakao');
const html = fs.readFileSync('order/brookie.html', 'utf8');
const inline = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).at(-1)[1];
vm.runInContext(inline.replace(/    init\(\);\s*$/, ''), sandbox);
vm.runInContext(`Object.assign(state, {customerName:'검증', customerPhone:'010-1234-5678', date:'2026-10-20', pickupTime:'12:00~13:00', items:[{character:'bear',paper:'navy',qty:12}]}); activeStep=4; renderBuilderProgress();`, sandbox);
assert(panels.every(panel => !panel.hidden));
await Promise.all([vm.runInContext('receiveQuote()', sandbox), vm.runInContext('receiveQuote()', sandbox)]);
assert.deepEqual(events, ['save', 'png', 'kakao']);
assert.equal(saves, 1);
assert.equal(vm.runInContext('state.submitted', sandbox), true);
assert(painted.some(line => line.includes('카카오톡 상담 완료 후 주문이 최종 확정')));
events.length = 0;
await vm.runInContext('receiveQuote()', sandbox);
assert.deepEqual(events, ['png', 'kakao']);
vm.runInContext(`state.customerEmail='invalid';`, sandbox);
node('customerEmail').value = 'invalid';
assert.equal(vm.runInContext('validateStep(3)', sandbox), false);
vm.runInContext(`state.customerEmail='kim@example.com'; state.items=[{character:'bear',paper:'navy',qty:6},{character:'birthday_bear',paper:'custom',qty:6,heartTextEnabled:true,heartText:'LOVE',customPaperLine1:'첫번째',customPaperLine2:'두번째'}];state.topper=true;state.sticker=true;`, sandbox);
node('customerEmail').value = 'kim@example.com';
assert.equal(vm.runInContext('totalPrice()', sandbox), 132200);
events.length = 0;
emailFail = true;
await vm.runInContext('receiveQuote()', sandbox);
assert.deepEqual(events, ['save', 'email', 'png', 'kakao']);
assert.match(node('brookieEmailMessage').textContent, /주문 요청은 저장됐지만 이메일 견적을 보내지 못했어요/);
assert.match(node('brookieEmailMessage').textContent, /현재 이메일 견적 서비스를 사용할 수 없습니다/);
assert.equal(node('brookieEmailRetry').hidden, false);
assert.equal(saves, 2);
emailFail = false;
events.length = 0;
await vm.runInContext('brookieQuoteFlow.retryEmail(landingOrderPayload())', sandbox);
assert.deepEqual(events, ['email']);
assert.match(node('brookieEmailMessage').textContent, /ki\*\*\*@example.com/);
await vm.runInContext('receiveQuote(true)', sandbox);
assert.deepEqual(events, ['email', 'kakao']);
assert.equal(saves, 2);
vm.runInContext(`state.customerName='changed';`, sandbox);
saveFail = true;
events.length = 0;
await vm.runInContext('receiveQuote()', sandbox);
assert.deepEqual(events, ['save']);
assert.equal(node('brookieQuoteError').hidden, false);
assert.equal(node('quoteBtn').disabled, false);
assert.equal(vm.runInContext('state.submitting', sandbox), false);
assert.equal(vm.runInContext('state.items.length', sandbox), 2);
vm.runInContext("state.heartTextEnabled=true;state.heartText='';addCurrentCombo();", sandbox);
assert.equal(vm.runInContext('state.items.length', sandbox), 2);
vm.runInContext('state.items[0].qty=5;state.items[1].qty=6;', sandbox);
assert.equal(vm.runInContext('validateQuote()', sandbox), false);
assert.equal(vm.runInContext('activeStep', sandbox), 1);
// Mobile CTA labels change only after minimum quantity; desktop labels stay intact.
vm.runInContext('state.items=[];activeStep=1;', sandbox);
assert.equal(vm.runInContext('floatingNextLabel()', sandbox), '조합 담기');
vm.runInContext('state.items=[{character:"bear",paper:"navy",qty:8}];', sandbox);
assert.equal(vm.runInContext('floatingNextLabel()', sandbox), '4개 더 담아주세요');
vm.runInContext('state.items[0].qty=12;', sandbox);
for (const step of [1, 2, 3]) {
  vm.runInContext(`activeStep=${step}`, sandbox);
  assert.equal(vm.runInContext('floatingNextLabel()', sandbox), '다음으로 넘어가기 →');
}
vm.runInContext('activeStep=4', sandbox);
assert.equal(vm.runInContext('floatingNextLabel()', sandbox), '견적서 받고 카카오톡에서 주문 확정하기 →');
sandbox.window.matchMedia = () => ({ matches: false });
for (const [step, label] of [[1, '추가 옵션 확인하기 →'], [2, '고객 정보 입력하기 →'], [3, '견적 내용 확인하기 →']]) {
  vm.runInContext(`activeStep=${step}`, sandbox);
  assert.equal(vm.runInContext('floatingNextLabel()', sandbox), label);
}
console.log('Brookie actual page: all panels, minimum 12, unchanged multi-combo pricing, optional/invalid email, save → email → PNG → Kakao, failure/retry, duplicate/concurrent protection: PASS');
