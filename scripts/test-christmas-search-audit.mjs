import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startAuditTestServer } from './christmas-search-test-helper.mjs';
const require = createRequire(import.meta.url);
const { CANONICAL_URL, periodsFor, requestFor, classify, buildChristmasSearchAudit } = require('../lib/christmas-search-audit.js');
const now = new Date('2026-10-29T12:00:00Z');
assert.deepEqual(periodsFor(now), [
  {days:28, startDate:'2026-09-29', endDate:'2026-10-26'},
  {days:90, startDate:'2026-07-29', endDate:'2026-10-26'}
]);
assert.equal(periodsFor(new Date('2026-10-29T01:00:00Z'))[0].endDate, '2026-10-25', 'Pacific date, not KST');
const assertFilter = body => {
  assert.deepEqual(body.dimensionFilterGroups, [{groupType:'and', filters:[{dimension:'page', operator:'equals', expression:CANONICAL_URL}]}]);
  assert.equal(body.type, 'web'); assert.equal(body.dataState, 'final'); assert.equal(body.aggregationType, 'byPage');
};
const row = (query, impressions = 50, position = 12) => ({ keys:[query], clicks:1, impressions, ctr:1/impressions, position });
const requests = [];
const audit = await buildChristmasSearchAudit({ now, requestReport: async body => {
  requests.push(body); assertFilter(body);
  if (!body.dimensions) return {rows:[{ clicks:8, impressions:200, ctr:0.04, position:10 }]};
  if (body.dimensions[0] === 'device') return {rows:[row('MOBILE')]};
  return {rows:[row('크리스마스 쿠키 가격 포장'), row('쿠키 가격', 150, 8), row('서울 기업행사 크리스마스 쿠키', 5), row('어린이집 유치원 산타 트리 곰돌이 쿠키 예약 픽업 택배')]};
}});
assert.equal(requests.length, 6); assert.equal(audit.status, 'available');
for (const period of audit.periods) {
  assert.equal(period.overview.impressions, 200, 'overview is separate from disclosed query sums');
  assert.equal(period.topics.find(topic => topic.id === 'C').metrics.position, 9, 'impression-weighted position');
  assert.equal(period.topics.find(topic => topic.id === 'C').metrics.ctr, 2/200, 'CTR from total clicks/impressions');
  assert.equal(period.reviewCandidates.some(item => item.query === '서울 기업행사 크리스마스 쿠키'), false, 'small query samples not prioritized');
  assert.equal(period.sample, 'observed');
}
assert.deepEqual(classify('서울 기업 행사 어린이집 크리스마스 쿠키 가격 포장 주문 산타 선물'), ['A','B','C','D','E','F','G','H']);
assert.deepEqual(classify('다른 브랜드'), []);
const paged = [];
await buildChristmasSearchAudit({now, requestReport: async body => {
  if (body.dimensions?.[0] !== 'query') return {};
  paged.push(body.startRow);
  return {rows:body.startRow === 0 ? Array.from({length:25000}, (_,i) => row(`SYNTHETIC ${i}`, 1)) : [row('SYNTHETIC last', 1)]};
}});
assert.deepEqual(paged.sort((a,b)=>a-b), [0,0,25000,25000], 'pagination beyond site-wide top 20');
const empty = await buildChristmasSearchAudit({now, requestReport:async () => ({})});
assert.equal(empty.status, 'no_data'); assert.equal(empty.periods[0].overview, null);
assert.equal(empty.periods[0].topics[0].status, 'not_observed'); assert.equal(empty.periods[0].topics[0].metrics, null);
const denied = await buildChristmasSearchAudit({now, requestReport:async () => {throw Object.assign(new Error('PRIVATE RAW'), {status:403});}});
assert.equal(denied.periods[0].status, 'access_denied'); assert.equal(JSON.stringify(denied).includes('PRIVATE RAW'), false);
const partial = await buildChristmasSearchAudit({now, requestReport:async body => {
  if (body.dimensions?.[0] === 'query') throw new Error('timeout');
  return {rows:[row('MOBILE', 5)]};
}});
assert.equal(partial.periods[0].queryStatus, 'upstream_unavailable'); assert.equal(partial.periods[0].sample, 'small');
assert.equal(partial.periods[0].topics[0].queryCount, null);

const protectedPaths = ['/dashboard', '/dashboard/', '/dashboard/index.html', '/dash%62oard/', '/dashboard%2Findex.html', '/%64ashboard/../dashboard/', '/api/dashboard/summary', '/api/dashboard/christmas-search', '/api%2Fdashboard%2Fchristmas-search'];
for (const env of [{DASHBOARD_USERNAME:'',DASHBOARD_PASSWORD:''}, {DASHBOARD_USERNAME:'only-user',DASHBOARD_PASSWORD:''}, {DASHBOARD_USERNAME:'',DASHBOARD_PASSWORD:'only-password'}]) {
  const server = await startAuditTestServer({google:true, env});
  try {
    for (const pathname of protectedPaths) {
      const response = await fetch(server.base + pathname);
      assert.equal(response.status, 503, pathname);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.match(response.headers.get('x-robots-tag'), /noindex/);
      assert.doesNotMatch(await response.text(), /SYNTHETIC|access_token|private_key/);
    }
    assert.equal(server.calls().length, 0, 'no upstream requests without configured auth');
    assert.equal((await fetch(server.base + '/dashboard/quick/')).status, 200, 'existing public Quick preserved');
  } finally { await server.stop(); }
}
const unconfigured = await startAuditTestServer();
try {
  for (const pathname of protectedPaths) {
    for (const headers of [{}, {Authorization:'Basic broken'}, {Authorization:'Basic '+Buffer.from('wrong:wrong').toString('base64')}]) {
      const response = await fetch(unconfigured.base + pathname, {headers});
      assert.equal(response.status, 401, pathname); assert.match(response.headers.get('www-authenticate'), /Basic/);
    }
  }
  const headers = {Authorization:unconfigured.authorization};
  const html = await fetch(unconfigured.base + '/dashboard/', {headers});
  assert.equal(html.status, 200); assert.match(html.headers.get('cache-control'), /no-store/);
  assert.match(await html.text(), /data-christmas-search/);
  const response = await fetch(unconfigured.base + '/api/dashboard/christmas-search', {headers});
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.status, 'not_configured'); assert.equal(data.naver.message, '네이버 검색어 데이터 미확보');
  assert.equal(data.periods[0].overview, null); assert.equal(data.periods[0].queries.length, 0);
  assert.equal(data.missing.includes('GA4_PROPERTY_ID'), false, 'GSC analysis independent from GA4');
} finally { await unconfigured.stop(); }
for (const mode of ['available', 'empty', 'denied']) {
  const server = await startAuditTestServer({google:true, mode});
  try {
    const headers = {Authorization:server.authorization};
    assert.equal((await fetch(server.base + '/api/dashboard/christmas-search?page=https://other.invalid/', {headers})).status, 400);
    assert.equal((await fetch(server.base + '/api/dashboard/christmas-search', {method:'POST',headers})).status, 405);
    assert.equal((await fetch(server.base + '/api/dashboard/christmas-search', {method:'HEAD',headers})).status, 200);
    assert.equal(server.calls().length, 0, 'invalid inputs / HEAD never query Google');
    const response = await fetch(server.base + '/api%2Fdashboard%2Fchristmas-search', {headers});
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(response.headers.get('vary'), /Authorization/);
    const data = await response.json();
    assert.equal(data.canonicalUrl, CANONICAL_URL); assert.equal(data.periods.length, 2);
    assert.equal(data.periods[0].status, mode === 'available' ? 'available' : mode === 'empty' ? 'no_data' : 'access_denied');
    assert.doesNotMatch(JSON.stringify(data), /SYNTHETIC-TOKEN|SYNTHETIC-PRIVATE-UPSTREAM|private_key|BEGIN PRIVATE/);
    server.calls().forEach(assertFilter); assert.equal(server.calls().length, 6);
    assert.equal((await fetch(server.base + '/christmas/')).status, 200);
  } finally { await server.stop(); }
}
assertFilter(requestFor(periodsFor(now)[0], ['query']));
console.log('Christmas search audit: auth, canonical filters, PT ranges, pagination, weighted topics, missing/empty/denied/partial data passed (synthetic only).');
