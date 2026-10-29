import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = file => fs.readFileSync(file, 'utf8');
const html = read('magok-cookie/index.html');
const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
const clean = text => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().replaceAll('&amp;', '&');
const base = 'https://nothingmatters.co.kr';
const url = base + '/magok-cookie/';
const registry = JSON.parse(read('data/site-pages.json'));
const entry = registry.pages.find(page => page.path === '/magok-cookie/');
const graph = JSON.parse(html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/)[1])['@graph'];
const title = '마곡 디저트·답례품 | 회사 간식·수제쿠키 선물 - 낫띵메터스';
const description = html.match(/<meta name="description" content="([^"]+)"/)[1];
assert.equal(html.match(/<title>([^<]+)<\/title>/)[1], title);
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.equal(clean(main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]), '마곡 디저트 선물, 쿠키 답례품을 골라보세요');
for (const name of ['og:title', 'twitter:title']) assert.ok(html.includes(`="${name}" content="${title}"`));
for (const name of ['og:description', 'twitter:description']) assert.ok(html.includes(`="${name}" content="${description}"`));
assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
assert.match(html, /name="robots" content="index,follow/);
assert.match(html, /naver-site-verification/);
assert.ok(html.includes('src="../assets/site.js"'));
assert.equal(entry.lastmod, '2026-10-30');
assert.ok(read('sitemap.xml').includes(`<loc>${url}</loc>\n    <lastmod>${entry.lastmod}</lastmod>`));
const page = graph.find(item => item['@type'] === 'WebPage');
assert.equal(page.dateModified, entry.lastmod);
assert.equal(page.description, description);
assert.equal(page.url, url);
assert.equal(graph.find(item => item['@type'] === 'BreadcrumbList').itemListElement.at(-1).name, '마곡 디저트·답례품');
for (const term of ['마곡 디저트 선물', '마곡 디저트 답례품', '마곡 회사 간식', '마곡 사무실 간식', '마곡 세미나 간식', '마곡 기업행사 답례품', '마곡 쿠키 선물', '마곡 단체 간식']) assert.ok(clean(main).includes(term), `static buyer intent: ${term}`);
assert.ok(main.indexOf('class="magok-answer-first"') < main.indexOf('id="cookies"'));
assert.ok(main.indexOf('id="cookies"') < main.indexOf('class="magok-section magok-proof"'), 'products precede the dynamic archive');
for (const fact of ['실제 작업실은 마곡 인근 서울 강서구 공항동', '서울특별시 강서구 송정로 25 1층', '예약 없이 방문하시면 바로 구매할 쿠키가 없습니다.', '가능 여부와 비용', '주문이 최종 확정']) assert.ok(main.includes(fact), fact);
for (const text of ['마곡 매장', '마곡점', '마곡에 위치', '당일 배송', '무료 배송', '마곡 전지역 배송 가능', '즉시 퀵 가능', '별점', '판매 1위']) assert.ok(!clean(main).includes(text), `no unverified claim: ${text}`);
const expected = [
  ['브루키', '/brookie/', '/images/main-order-brookie-thumb-optimized.jpg'],
  ['쿠키크루', '/cookie-crew/', '/images/cookie-crew-bear-poster.jpg'],
  ['수제 꾸덕쿠키', '/products/handmade-cookie/', '/images/handmade-cookie-flavor-lineup-optimized.jpg'],
  ['행운쿠키', '/products/lucky-cookie/', '/images/lucky-hero-custom-20260414.jpeg'],
  ['COOKIE FLIGHT', '/products/cookie-flight/', '/images/main-order-cookie-thumb.png'],
  ['터미널 샌드쿠키', '/products/terminal-sand-cookie/', '/images/terminal-hero.jpg']
];
const cards = [...main.matchAll(/<article class="magok-product-card">([\s\S]*?)<\/article>/g)];
assert.equal(cards.length, 6);
for (const [index, [name, href, src]] of expected.entries()) {
  const card = cards[index][1];
  assert.equal(clean(card.match(/<h3>([\s\S]*?)<\/h3>/)[1]), name);
  assert.equal(new URL(card.match(/<a href="([^"]+)"/)[1], url).pathname, href);
  assert.ok(card.includes(src.slice(1)));
  assert.match(card, /loading="lazy"/);
  assert.doesNotMatch(card, /[\d,]+원|할인|재고/);
}
const hero = html.match(/<img class="magok-hero-image"[^>]+>/)[0];
for (const attr of ['fetchpriority', 'decoding', 'loading', 'width', 'height', 'alt']) assert.equal((hero.match(new RegExp(`${attr}="`, 'g')) || []).length, 1);
assert.match(hero, /handmade-cookie-flavor-lineup-optimized.jpg/);
for (const tag of html.matchAll(/<img\b[^>]*>/g)) {
  for (const attr of ['width', 'height', 'alt', 'loading', 'decoding']) assert.ok(tag[0].includes(`${attr}="`));
  assert.ok(fs.existsSync(path.resolve('magok-cookie', tag[0].match(/src="([^"]+)"/)[1])));
}
const faq = [...main.matchAll(/<details><summary>([\s\S]*?)<\/summary><div class="magok-faq-answer">([\s\S]*?)<\/div><\/details>/g)].map(match => [clean(match[1]), clean(match[2])]);
assert.equal(faq.length, 8);
assert.equal(new Set(faq.map(item => item[0])).size, 8);
assert.deepEqual(graph.find(item => item['@type'] === 'FAQPage').mainEntity.map(item => [item.name, item.acceptedAnswer.text]), faq);
const service = graph.find(item => item['@type'] === 'Service');
assert.equal(service.areaServed, '마곡');
assert.equal(service.description, description);
assert.deepEqual(service.provider, {'@id':base+'/#localbusiness'});
assert.equal(graph.find(item => item['@type'] === 'Bakery').address.streetAddress, '송정로 25 1층');
assert.ok(!graph.some(item => ['Product', 'Offer', 'Review', 'AggregateRating'].includes(item['@type'])));
assert.equal(new Set(graph.map(item => item['@id'])).size, graph.length);
for (const href of ['/order', 'https://pf.kakao.com/_QdCaK/chat']) assert.ok(html.includes(`href="${href}"`));
for (const tag of html.matchAll(/<a\b([^>]*)>/g)) {
  const href = tag[1].match(/href="([^"]+)"/)?.[1]; if (!href) continue;
  const target = new URL(href.replaceAll('&amp;', '&'), url);
  if (target.origin !== base) continue;
  const local = target.pathname.endsWith('/') ? target.pathname+'index.html' : path.extname(target.pathname) ? target.pathname : target.pathname+'/index.html';
  const file = local.slice(1);
  assert.ok(fs.existsSync(file), `internal destination exists: ${href}`);
  if (target.hash) assert.ok(read(file).includes(`id="${decodeURIComponent(target.hash.slice(1))}"`), `internal anchor exists: ${href}`);
}
for (const file of ['index.html', 'corporate-gift/index.html']) assert.match(read(file), /href="\/?magok-cookie\/">마곡 디저트·/);
console.log('Magok landing: dessert/favor/office intent, six preserved products/photos, eight matching FAQs, location/pickup/quick conditions, schema/dates, static content and all internal anchors PASS');
