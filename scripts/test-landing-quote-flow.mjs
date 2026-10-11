import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { File } from 'node:buffer';

// Run the production quote module with local browser adapters. These tests never
// contact a database, write the system clipboard, or navigate to Kakao.
const painted = [];
const downloads = [];
const delays = [];
const context = {
  fillRect() {}, strokeRect() {},
  measureText(text) { return { width: Array.from(text).length * 15 }; },
  fillText(text) { painted.push(text); },
};
const sandbox = {
  window: {}, navigator: {}, Blob, File,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  setTimeout(callback, delay) { delays.push(delay); callback(); },
  document: {
    fonts: { ready: Promise.resolve() },
    body: { append() {} },
    createElement(tag) {
      if (tag === 'canvas') return { getContext: () => context, toBlob: (callback) => callback(new Blob(['test'], { type: 'image/png' })) };
      if (tag === 'a') return { click() { downloads.push(this.download); }, remove() {} };
      throw new Error(`Unexpected test element: ${tag}`);
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('order/assets/order-confirmation.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('order/assets/landing-quote.js', 'utf8'), sandbox);
const quote = sandbox.window.NMQuote;
const common = {
  customerName: '견적 테스트', customerPhone: '010-1234-5678', customerEmail: '',
  deliveryMethod: 'pickup', deliveryDate: '2026-10-10', pickupTime: '10:00~11:00',
  deliveryAddress: '', request: '상담 테스트',
};
const fixtures = [
  { source: 'cookieFlight', slug: 'cookie-flight', name: '쿠키 플라이트', quantity: 2, unitLabel: 'BOX', unitPrice: 16000, total: 32000, details: ['4개입 1세트', '클래식버터 / 더블초코 / 제주말차 / 오렌지'] },
  { source: 'airplaneButter', slug: 'airplane-butter-cookie', name: '비행기 버터쿠키', quantity: 10, unitLabel: '개', unitPrice: 2500, total: 25000, details: ['개별 포장'] },
  { source: 'terminalCookie', slug: 'terminal-cookie', name: 'TERMINAL 카라멜 샌드쿠키', quantity: 2, unitLabel: '', unitPrice: 24000, total: 48000, details: ['피스타치오 / 패션프루츠코코넛 / 제주말차레몬 / 흑임자 / 커피 밀크 초콜릿 / 무화과피칸'] },
  { source: 'cookieCrew', slug: 'cookie-crew', pricingPending: true, total: 0, items: ['쿠키기장', '쿠키블루', '쿠키오렌지', '쿠키그린'].map((name) => ({ name, quantity: 3, unitLabel: '개', priceText: '상담 후 안내' })), details: [] },
];
function dataFor(fixture) {
  return {
    ...common,
    documentTitle: fixture.pricingPending ? 'nothingmatters 주문 상담 요청서' : 'nothingmatters 견적서',
    items: fixture.items || [{ name: fixture.name, quantity: fixture.quantity, unitLabel: fixture.unitLabel, unitPrice: fixture.unitPrice, amount: fixture.total }],
    details: fixture.details, totalPrice: fixture.pricingPending ? null : fixture.total, pricingPending: !!fixture.pricingPending,
  };
}
function flowFor(data, overrides = {}) {
  const events = [];
  let posts = 0;
  let exports = 0;
  const flow = quote.createFlow({
    fileSlug: 'test-product',
    createImage: async (value) => { events.push('image'); return new Blob([JSON.stringify(value)], { type: 'image/png' }); },
    postOrder: async () => { posts++; events.push('save'); return { orderId: 'test-order', totalPrice: data.totalPrice ?? 0, pricingPending: data.pricingPending }; },
    fromSaved: () => data,
    provideImage: async () => { exports++; events.push('provide'); return 'download'; },
    navigateToKakao: () => events.push('kakao'),
    track: () => { throw new Error('Analytics unavailable'); },
    ...overrides,
  });
  return { flow, events, posts: () => posts, exports: () => exports };
}

for (const fixture of fixtures) {
  const data = dataFor(fixture);
  painted.length = 0;
  const image = await quote.createImage(data);
  assert.equal(image.type, 'image/png');
  const text = quote.toText(data);
  if (fixture.pricingPending) {
    assert(text.includes('총 수량: 12개') && text.includes('가격: 상담 후 안내'));
    assert(!text.includes('0원') && !painted.join(' ').includes('0원'));
    assert(!painted.join(' ').includes('입금 계좌'));
    assert(painted.join(' ').includes('가격 및 최종 주문 금액'));
  } else {
    assert(text.includes(fixture.total.toLocaleString('ko-KR') + '원'));
    assert(painted.join(' ').includes(fixture.total.toLocaleString('ko-KR') + '원'));
  }
  const run = flowFor(data, { fileSlug: fixture.slug });
  const record = await run.flow.receive({ source: fixture.source, quantity: fixture.quantity }, data);
  assert.deepEqual(run.events, ['image', 'save', 'provide', 'kakao']);
  assert.match(record.filename, new RegExp(`^nothingmatters-${fixture.slug}-${fixture.pricingPending ? 'consult' : 'quote'}-\\d+\\.png$`));
  await run.flow.receive({ source: fixture.source, quantity: fixture.quantity }, data);
  assert.equal(run.posts(), 1);
  assert.equal(run.exports(), 2);
  console.log(`${fixture.source}: PNG content, save → provide → Kakao, and repeat without POST PASS`);
}

const data = dataFor(fixtures[2]);
let failSave = true;
let postAttempts = 0;
const failed = flowFor(data, {
  postOrder: async () => { postAttempts++; failed.events.push('save'); if (failSave) throw new Error('API failed'); return { orderId: 'retry-order', totalPrice: 48000 }; },
});
await assert.rejects(failed.flow.receive({ quantity: 2 }, data), /API failed/);
assert.deepEqual(failed.events, ['image', 'save']);
failSave = false;
await failed.flow.receive({ quantity: 2 }, data);
assert.equal(postAttempts, 2);
assert.equal(failed.exports(), 1);

let release;
let concurrentPosts = 0;
const concurrent = flowFor(data, {
  postOrder: async () => { concurrentPosts++; return new Promise((resolve) => { release = () => resolve({ orderId: 'concurrent', totalPrice: 48000 }); }); },
});
const first = concurrent.flow.receive({ quantity: 2 }, data);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(await concurrent.flow.receive({ quantity: 2 }, data), null);
release();
await first;
assert.equal(concurrentPosts, 1);

let exportFails = true;
const recovery = flowFor(data, {
  provideImage: async () => { if (exportFails) throw new Error('Download failed'); return 'download'; },
});
await assert.rejects(recovery.flow.receive({ quantity: 2 }, data), /Download failed/);
assert(!recovery.events.includes('kakao'));
exportFails = false;
await recovery.flow.receive({ quantity: 2 }, data);
assert.equal(recovery.posts(), 1);

const direct = flowFor(data);
await direct.flow.receive({ quantity: 2 }, data, true);
assert.deepEqual(direct.events, ['save', 'kakao']);
await direct.flow.receive({ quantity: 2 }, data);
assert.equal(direct.posts(), 1);
assert.equal(direct.exports(), 1);

const corrected = { ...data, items: [{ ...data.items[0], unitPrice: 24500, amount: 49000 }], totalPrice: 49000 };
let providedData;
const canonical = flowFor(data, {
  fromSaved: () => corrected,
  provideImage: async (_image, _filename, actual) => { providedData = actual; return 'download'; },
});
await canonical.flow.receive({ quantity: 2 }, data);
assert.deepEqual(canonical.events, ['image', 'save', 'image', 'kakao']);
assert.equal(providedData.totalPrice, 49000);

let invalidResultPosts = 0;
const invalidResult = flowFor(data, {
  postOrder: async () => { invalidResultPosts++; return { orderId: 'saved-invalid', totalPrice: 48000 }; },
  fromSaved: () => { throw new Error('Invalid saved items'); },
});
await assert.rejects(invalidResult.flow.receive({ quantity: 2 }, data), /Invalid saved items/);
await assert.rejects(invalidResult.flow.receive({ quantity: 2 }, data), /Invalid saved items/);
assert.equal(invalidResultPosts, 1);

const noImage = flowFor(data, { createImage: async () => { throw new Error('Canvas failed'); } });
await assert.rejects(noImage.flow.receive({ quantity: 2 }, data), /Canvas failed/);
assert.equal(noImage.posts(), 0);
assert.equal(noImage.exports(), 0);

const blob = new Blob(['png'], { type: 'image/png' });
sandbox.navigator.canShare = () => true;
let sharedFile;
sandbox.navigator.share = async ({ files }) => { sharedFile = files[0]; };
assert.equal(await quote.provideImage(blob, 'test.png', data), 'share');
assert.equal(sharedFile.name, 'test.png');
assert.equal(downloads.length, 0);
sandbox.navigator.share = async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); };
assert.equal(await quote.provideImage(blob, 'test.png', data), 'share_cancelled');
assert.equal(downloads.length, 0);
assert.equal(await quote.provideImage(blob, 'test.png', data, { downloadOnCancel: true }), 'download');
assert.deepEqual(downloads, ['test.png']);
sandbox.navigator.share = async () => { throw Object.assign(new Error('Unavailable'), { name: 'NotAllowedError' }); };
assert.equal(await quote.provideImage(blob, 'test.png', data), 'download');
assert.deepEqual(downloads, ['test.png', 'test.png']);
assert(delays.includes(400));

painted.length = 0;
await quote.createImage({ ...data, request: ('긴 요청사항을 잘리지 않게 표시합니다.\n').repeat(50) });
assert.equal(painted.filter((line) => line.includes('긴 요청사항')).length, 50);
console.log('Failure/retry, concurrent clicks, direct consultation, saved-price reconciliation, share/fallback, and wrapped PNG text: PASS');

vm.runInContext(fs.readFileSync('order/assets/order-email-quote.js', 'utf8'), sandbox);
for (const source of ['brookie','cookie7','lucky','cookieFlight','airplaneButter','terminalCookie','cookieCrew']) {
  for (const email of ['', 'customer@example.com']) {
    let posts=0, attempts=0, fail=true;
    const events=[];
    const payload={source,customerEmail:email};
    const data={...common, customerEmail:email, totalPrice:32000, pricingPending:source==='cookieCrew'};
    const flow=sandbox.window.NMEmailQuote.create({
      postOrder:async()=>{posts++;return {orderId:'same-order',emailQuoteToken:'local-token'};},
      createImage:async()=>new Blob(['PNG']),fromSaved:()=>data,
      provideImage:async()=>events.push('PNG'),navigateToKakao:()=>events.push('Kakao'),
      onEmail:state=>events.push(state),
      postEmail:async(id,recipient,token)=>{attempts++;assert.equal(id,'same-order');assert.equal(recipient,email);assert.equal(token,'local-token');if(fail)throw new Error('Mock provider failure');return {success:true,maskedEmail:'cu***@example.com'};},
    });
    await flow.receive(payload,data);
    assert.equal(posts,1);assert.equal(attempts,email?1:0);assert(events.includes('PNG')&&events.includes('Kakao'));
    fail=false;await flow.retryEmail(payload);
    assert.equal(posts,1);assert.equal(attempts,email?2:0);
    await flow.receive(payload,data);assert.equal(attempts,email?2:0);
  }
  console.log(`${source}: shared client empty email, failure keeps PNG/Kakao, same-order retry, no duplicate sends PASS`);
}
