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
assert.match(clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]), /국립항공박물관.*방문 가이드.*근처 비행기 쿠키 선물/);
assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
for (const meta of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(html.includes(`="${meta}"`), meta);
assert.ok(html.includes('e627e1eaae68060408cb4e512e46d6b98a64401c'));
assert.ok(html.includes("gtag('config', 'G-DR5XLDB042')"));
assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]), ['https://www.googletagmanager.com/gtag/js?id=G-DR5XLDB042'], 'no additional frontend JavaScript');

for (const type of ['WebPage', 'BreadcrumbList', 'FAQPage']) assert.ok(graph.some(node => node['@type'] === type), type);
assert.equal(graph.filter(node => node['@type'] === 'Product' || node['@type'] === 'Service' || node['@type'] === 'Museum').length, 0, 'do not claim a museum entity, service, or invented offer');
assert.equal(graph.find(node => node['@type'] === 'WebPage').url, url);
assert.equal(graph.find(node => node['@type'] === 'WebPage').dateModified, '2026-10-26');
const visibleFaq = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map(match => [clean(match[1]), clean(match[2])]);
assert.equal(visibleFaq.length, 5);
assert.deepEqual(graph.find(node => node['@type'] === 'FAQPage').mainEntity.map(item => [item.name, item.acceptedAnswer.text]), visibleFaq, 'FAQ comes from the visible HTML');

const sectionIds = ['visit-info', 'cookie-collection', 'reservation-pickup', 'visitor-faq'];
const positions = sectionIds.map(id => main.indexOf(`id="${id}"`));
assert.ok(positions.every((position, index) => position > 0 && (!index || position > positions[index - 1])), 'visitor information precedes collection, pickup and FAQ');
for (const id of ['museum-hours', 'museum-reservation', 'museum-parking', 'museum-location', 'museum-children']) assert.ok(main.includes(`id="${id}"`));
for (const term of ['10:00~18:00', '17:30', '08:00~20:00', '만 48개월~미취학 아동', '온라인 사전예약·현장예약', '현장예약', '하늘길 177', '2026-10-26']) assert.ok(main.includes(term), term);
for (const suffix of ['contents.do?menuno=65', 'contents.do?menuno=168', 'contents.do?menuno=311', 'contents.do?menuno=311&amp;tabno=4', 'reservation.do?gcode=gcode1&amp;menuno=189', 'board.do?boardno=24&amp;menuno=68']) assert.ok(main.includes(`href="https://www.aviation.or.kr/${suffix}"`), suffix);
assert.match(main, /예약 없이 방문하시면 바로 구매할 쿠키가 없습니다/);
assert.match(main, /서울특별시 강서구 송정로 25 1층/);
assert.match(main, /박물관 내부 판매 매장이나 공식 기념품 판매점이 아닙니다/);
assert.doesNotMatch(main, /도보 \d+분|차량 \d+분|제휴 상품|공식 인증|당일 구매 가능|재고 확보|결제 완료|무료 배송/);
assert.doesNotMatch(html, /<form\b|\/api\/landing-orders|\/api\/gimpo|data-gimpo-preview/);

const expectedProducts = [
  ['COOKIE FLIGHT', '/products/cookie-flight/', '/images/cookie-flight-box-open.jpg', 'https://naver.me/Ge7SnJnC', '택배주문', 'https://mkt.shopping.naver.com/link/6ad84808a30a4751f926bfde'],
  ['COOKIE CREW', '/cookie-crew/', '/images/cookie-crew-bear-poster.jpg', 'https://naver.me/FjmgqAUo', '택배 문의', 'https://pf.kakao.com/_QdCaK/chat'],
  ['TERMINAL 샌드쿠키', '/products/terminal-sand-cookie/', '/images/terminal/terminal-hero-package.jpg', 'https://naver.me/GArtG2FK', '택배주문', 'https://mkt.shopping.naver.com/link/6ad84808bb270c6ca6310878'],
  ['수제 꾸덕쿠키', '/products/handmade-cookie/', '/images/handmade-hero.jpg', 'https://naver.me/FQuvqNt0', '택배 문의', 'https://pf.kakao.com/_QdCaK/chat'],
];
const cards = [...main.matchAll(/<article class="museum-product"[^>]*>([\s\S]*?)<\/article>/g)];
assert.equal(cards.length, 4);
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
assert.ok(read('llms.txt').includes(url));
// Do not transplant the existing airport hub's gift and dessert paragraphs.
const airportParagraphs = [...read('gimpo/index.html').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(match => clean(match[1])).filter(text => text.length > 70);
assert.ok(airportParagraphs.every(text => !clean(main).includes(text)), 'unique museum visitor content');
console.log('museum PASS: final four products/photos/detail links, four exact pickup URLs, two verified shipping links and inquiry-only alternatives, safe external anchors, COOKIE FLIGHT floating actions, synchronized FAQ/schema and preserved museum information');
