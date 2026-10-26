import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('national-aviation-museum/index.html');
const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
const url = 'https://nothingmatters.co.kr/national-aviation-museum/';
const registry = JSON.parse(read('data/site-pages.json'));
const entry = registry.pages.find(page => page.path === '/national-aviation-museum/');
const clean = value => value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().replaceAll('&amp;', '&');
const graph = JSON.parse(html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/)[1])['@graph'];

assert.deepEqual([entry.status, entry.indexing, entry.sitemap, entry.lastmod], ['active', 'index', true, '2026-10-26']);
assert.ok(read('sitemap.xml').includes(`<loc>${url}</loc>`));
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.equal(clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]), '국립항공박물관 방문 가이드');
assert.equal(html.match(/<title>([^<]+)<\/title>/)[1], '국립항공박물관 입장료·주차·예약·체험 안내 | 낫띵메터스');
assert.equal(html.match(/<meta name="description" content="([^"]+)"/)[1], '국립항공박물관 방문 전 입장료, 주차요금, 관람시간, 예약 방법과 어린이 체험 정보를 확인하세요. 김포공항 근처 비행기 쿠키 선물과 네이버 픽업예약·택배주문도 안내합니다.');
assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
for (const meta of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(html.includes(`="${meta}"`), meta);
assert.ok(html.includes('e627e1eaae68060408cb4e512e46d6b98a64401c'));
assert.ok(html.includes("gtag('config', 'G-DR5XLDB042',"));
assert.match(html, /page_location: 'https:\/\/nothingmatters\.co\.kr\/national-aviation-museum\/'/);
assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]), ['https://www.googletagmanager.com/gtag/js?id=G-DR5XLDB042', '/assets/national-aviation-museum-analytics.js'], 'only the existing GA4 and lightweight dedicated click script');
const analytics = read('assets/national-aviation-museum-analytics.js');
assert.ok(Buffer.byteLength(analytics) < 4000);
for (const name of ['museum_pickup_click', 'museum_shipping_click', 'museum_shipping_inquiry_click', 'museum_floating_pickup_click', 'museum_floating_shipping_click']) assert.ok(analytics.includes(name));
assert.doesNotMatch(analytics, /preventDefault|stopPropagation|location\.(?:search|hash)|\.href|textContent|innerText|fetch\(/, 'no navigation interception or URL/text/private data collection');
assert.equal((html.match(/data-museum-action=/g) || []).length, 10);

for (const type of ['WebPage', 'BreadcrumbList', 'FAQPage', 'Organization', 'Bakery', 'ItemList']) assert.equal(graph.filter(node => node['@type'] === type).length, 1, type);
assert.equal(new Set(graph.map(node => node['@id'])).size, graph.length, 'unique entities');
assert.equal(graph.filter(node => ['Product', 'Service', 'Museum', 'Offer', 'Review', 'AggregateRating', 'Event'].includes(node['@type'])).length, 0, 'no invented product/event/review or locally-owned museum entity');
assert.equal(graph.find(node => node['@type'] === 'WebPage').url, url);
assert.equal(graph.find(node => node['@type'] === 'WebPage').dateModified, '2026-10-26');
assert.deepEqual(graph.find(node => node['@type'] === 'WebPage').about, entry.about);
assert.equal(entry.about['@id'], 'https://www.aviation.or.kr/');
assert.equal(entry.about.name, '국립항공박물관');
assert.equal(entry.about.address.streetAddress, '하늘길 177');
assert.equal(graph.find(node => node['@type'] === 'Bakery').address.streetAddress, '송정로 25 1층');
const visibleFaq = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map(match => [clean(match[1]), clean(match[2])]);
const questions = ['국립항공박물관 입장료는 무료인가요?', '국립항공박물관은 예약 없이 관람할 수 있나요?', '국립항공박물관 주차요금은 얼마인가요?', '국립항공박물관 관람시간과 휴관일은 어떻게 되나요?', '국립항공박물관 어린이 체험은 몇 살부터 가능한가요?', '국립항공박물관 특별전 일정은 어디서 확인하나요?', '국립항공박물관 근처에서 비행기 쿠키를 예약할 수 있나요?', '낫띵메터스 쿠키는 예약 없이 방문해 구매할 수 있나요?', 'COOKIE FLIGHT와 TERMINAL 쿠키는 택배주문이 가능한가요?'];
assert.deepEqual(visibleFaq.map(([question]) => question), questions, 'cover all verified visitor and cookie questions');
const faqBlocks = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
for (const block of faqBlocks.slice(0, 6)) assert.match(block[2], /href="https:\/\/www\.aviation\.or\.kr\//, 'museum FAQ cites official sources');
assert.deepEqual(graph.find(node => node['@type'] === 'FAQPage').mainEntity.map(item => [item.name, item.acceptedAnswer.text]), visibleFaq, 'FAQ comes from the visible HTML');

const sectionIds = ['visit-info', 'visit-details', 'museum-exhibition', 'visit-checklist', 'cookie-collection', 'reservation-pickup', 'visitor-faq'];
const positions = sectionIds.map(id => main.indexOf(`id="${id}"`));
assert.ok(positions.every((position, index) => position > 0 && (!index || position > positions[index - 1])), 'visitor information precedes collection, pickup and FAQ');
for (const id of ['museum-hours', 'museum-reservation', 'museum-parking', 'museum-location', 'museum-children']) assert.ok(main.includes(`id="${id}"`));
for (const term of ['10:00~18:00', '17:30', '08:00~20:00', '만 48개월~미취학 아동', '온라인 사전예약·현장예약', '현장예약', '하늘길 177', '2026-10-26']) assert.ok(main.includes(term), term);
for (const suffix of ['contents.do?menuno=65', 'contents.do?menuno=168', 'contents.do?menuno=311', 'contents.do?menuno=311&amp;tabno=4', 'reservation.do?gcode=gcode1&amp;menuno=189', 'board.do?boardno=24&amp;menuno=68']) assert.ok(main.includes(`href="https://www.aviation.or.kr/${suffix}"`), suffix);
assert.match(main, /낫띵메터스는 예약 제작·예약 픽업 전용 작업실입니다\. 예약 없이 방문하셔도 바로 구매할 쿠키가 없습니다\./);
assert.match(main, /서울특별시 강서구 송정로 25 1층/);
assert.match(main, /박물관 내부 판매 매장이나 공식 기념품 판매점이 아닙니다/);
assert.doesNotMatch(main, /도보 \d+분|차량 \d+분|제휴 상품|공식 인증|당일 구매 가능|재고 확보|결제 완료|무료 배송/);
assert.doesNotMatch(html, /<form\b|\/api\/landing-orders|\/api\/gimpo|data-gimpo-preview/);
const quick = main.match(/<section[^>]*id="visit-info"[\s\S]*?<\/section>/)[0];
assert.equal((quick.match(/class="museum-answer"/g) || []).length, 5);
assert.deepEqual([...quick.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match => match[1]), ['입장료', '관람시간', '주차', '예약', '위치']);
for (const card of quick.matchAll(/<article class="museum-answer">([\s\S]*?)<\/article>/g)) {
  const id = card[1].match(/href="#([^"]+)"/)[1];
  assert.ok(main.includes(`id="${id}"`));
  assert.match(card[1], /href="https:\/\/www\.aviation\.or\.kr\//);
}
assert.match(main, /아이랑 방문하기/);
assert.match(main, /어린이 1명당 보호자 1명/);
assert.match(main, /마지막 비행, 새로운 시작 : 대통령 전용기 HS-748/);
assert.match(main, /datetime="2026-08-11"/);
assert.match(main, /datetime="2027-07-31"/);
assert.match(main, /3층 기획전시실/);
assert.match(main, /view\.do\?boardno=51&amp;menuno=75&amp;seq=2062/);
assert.doesNotMatch(main, /전망대|직접 방문 후기|별점|평점|네이버 연관검색어|검색량 검증|노출 보장/);
assert.equal((main.match(/<section[^>]*id="visit-checklist"[\s\S]*?<\/section>/)[0].match(/<li>/g) || []).length, 5);

const expectedProducts = [
  ['COOKIE FLIGHT', '/products/cookie-flight/', '/images/cookie-flight-box-open.jpg', 'https://naver.me/Ge7SnJnC', '택배주문', 'https://mkt.shopping.naver.com/link/6ad84808a30a4751f926bfde'],
  ['COOKIE CREW', '/cookie-crew/', '/images/cookie-crew-bear-poster.jpg', 'https://naver.me/FjmgqAUo', '택배 문의', 'https://pf.kakao.com/_QdCaK/chat'],
  ['TERMINAL 샌드쿠키', '/products/terminal-sand-cookie/', '/images/terminal/terminal-hero-package.jpg', 'https://naver.me/GArtG2FK', '택배주문', 'https://mkt.shopping.naver.com/link/6ad84808bb270c6ca6310878'],
  ['수제 꾸덕쿠키', '/products/handmade-cookie/', '/images/handmade-hero.jpg', 'https://naver.me/FQuvqNt0', '택배 문의', 'https://pf.kakao.com/_QdCaK/chat'],
];
const cards = [...main.matchAll(/<article class="museum-product"[^>]*>([\s\S]*?)<\/article>/g)];
assert.equal(cards.length, 4);
const itemList = graph.find(node => node['@type'] === 'ItemList');
assert.deepEqual(itemList.itemListElement.map(item => [item.position, item.name, item.url]), expectedProducts.map(([name, href], index) => [index + 1, name, 'https://nothingmatters.co.kr' + href]));
assert.deepEqual(entry.itemList, expectedProducts.map(([name, href]) => ({ name, url: href })));
assert.deepEqual(graph.find(node => node['@type'] === 'WebPage').mainEntity, { '@id': itemList['@id'] });
for (const [index, [name, href, src, pickup, shippingLabel, shipping]] of expectedProducts.entries()) {
  const card = cards[index][1];
  assert.equal(clean(card.match(/<h3>([\s\S]*?)<\/h3>/)[1]), name, 'collection order');
  assert.equal((card.match(new RegExp(`href="${href}"`, 'g')) || []).length, 2, 'photo and title keep detail links');
  assert.ok(card.includes(`src="${src}"`));
  assert.match(card, /loading="lazy"/);
  assert.doesNotMatch(card, /[\d,]+원|재고|품절|구성·주문 방법 보기/);
  const purchase = card.match(/<div class="museum-purchase-actions"[^>]*>([\s\S]*?)<\/div>/)[1];
  const links = [...purchase.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.deepEqual(links.map(link => [clean(link[2]), link[1].match(/href="([^"]+)"/)[1]]), [['네이버 픽업예약', pickup], [shippingLabel, shipping]], name);
  for (const link of links) {
    assert.match(link[1], /target="_blank"/);
    assert.match(link[1], /rel="noopener noreferrer"/);
  }
  for (const anchor of card.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) assert.doesNotMatch(anchor[1], /<a\b/, 'no nested anchors');
  assert.match(card, /^\s*<a class="museum-product-photo"[^>]*><figure>[\s\S]*?<\/figure><\/a>/, 'card is not wrapped in one anchor');
  assert.ok(fs.existsSync(path.join(root, src)));
}
assert.doesNotMatch(html, /비행기 버터쿠키|\/products\/airplane-cookie\/|airplane-cookie-handheld/);
assert.match(cards[3][1], /width="1024" height="867"/);
assert.match(cards[3][1], /7가지 맛과 1구·2구·4구 포장/);
assert.match(main, /loading="eager" decoding="async" fetchpriority="high"/);
for (const tag of html.matchAll(/<img\b[^>]*>/g)) {
  for (const attr of ['width', 'height', 'alt', 'loading', 'decoding']) assert.ok(tag[0].includes(`${attr}="`));
}
assert.ok(read('assets/national-aviation-museum.css').includes('env(safe-area-inset-bottom'));
assert.ok(read('assets/national-aviation-museum.css').includes('prefers-reduced-motion'));
for (const href of ['/pickup/', '/notice/pickup-guide/', '/gimpo/', 'https://pf.kakao.com/_QdCaK/chat']) assert.ok(main.includes(`href="${href}"`));
const floating = html.match(/<nav class="museum-mobile-actions"[^>]*>([\s\S]*?)<\/nav>/)[1];
const floatingLinks = [...floating.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
assert.equal(floatingLinks.length, 2);
assert.deepEqual(floatingLinks.map(link => [clean(link[2]), link[1].match(/href="([^"]+)"/)[1]]), [['픽업예약', expectedProducts[0][3]], ['택배주문', expectedProducts[0][5]]]);
for (const link of floatingLinks) {
  assert.match(link[1], /target="_blank"/);
  assert.match(link[1], /rel="noopener noreferrer"/);
  assert.match(link[1], /aria-describedby="museum-cookie-booking-note"/);
}
assert.match(floating, /id="museum-cookie-booking-note">COOKIE FLIGHT 전용 · 쿠키 예약·주문<\/p>/);
assert.doesNotMatch(floating, /href="#cookie-collection"|pf\.kakao\.com/);
const storeLinks = [...main.matchAll(/href="(https:\/\/mkt\.shopping\.naver\.com\/link\/[^"?]+)"/g)].map(match => match[1]);
assert.deepEqual(storeLinks, [expectedProducts[0][5], expectedProducts[2][5], expectedProducts[0][5], expectedProducts[2][5]], 'shipping only for the two verified collection products, on cards and in pickup guidance');
assert.ok(read('gimpo/index.html').includes('href="/national-aviation-museum/"'));
for (const file of ['index.html', 'guides/gimpo-airport-departure-checklist/index.html']) assert.equal((read(file).match(/href="\/national-aviation-museum\/"/g) || []).length, 1, 'one contextual inbound link');
assert.ok(read('llms.txt').includes(url));
// Do not transplant the existing airport hub's gift and dessert paragraphs.
const airportParagraphs = [...read('gimpo/index.html').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(match => clean(match[1])).filter(text => text.length > 70);
assert.ok(airportParagraphs.every(text => !clean(main).includes(text)), 'unique museum visitor content');
console.log('museum PASS: final four products/photos/detail links, four exact pickup URLs, two verified shipping links and inquiry-only alternatives, safe external anchors, COOKIE FLIGHT floating actions, synchronized FAQ/schema and preserved museum information');
