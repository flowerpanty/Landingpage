import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SITE_ROOT as ROOT, loadNotices, validateNotices, publicNotices, noticePath, shippingUrl, renderNoticeContent } from '../lib/notices.mjs';
import { buildNotices } from './build-notices.mjs';

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const data = loadNotices();
const site = JSON.parse(read('data/business.json')).siteUrl;
const catalog = JSON.parse(read('data/christmas-products.json'));
const registry = JSON.parse(read('data/site-pages.json'));
const sitemap = read('sitemap.xml');
const rss = read('notice/feed.xml');
const guideRss = read('feed.xml');
const home = read('index.html');
const schema = html => JSON.parse(html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/)[1])['@graph'];
const clean = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity]));
for (const pathname of ['/notice/', ...publicNotices(data).map(noticePath)]) {
  const html = read(`${pathname.slice(1)}index.html`);
  const entry = registry.pages.find(page => page.path === pathname);
  assert.deepEqual([entry.status, entry.indexing, entry.sitemap], ['active', 'index', true]);
  assert.ok(sitemap.includes(`<loc>${site}${pathname}</loc>\n    <lastmod>${entry.lastmod}</lastmod>`));
  assert.ok(read('llms.txt').includes(site + pathname));
  assert.ok(html.includes(`<link rel="canonical" href="${site}${pathname}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${site}${pathname}">`));
  for (const marker of ['name="description"', 'name="twitter:card"', 'property="og:title"', 'property="og:description"', 'property="og:image"', 'href="/notice/feed.xml"', 'G-DR5XLDB042', 'name="naver-site-verification"', 'data-nm-skip-link']) assert.ok(html.includes(marker), `${pathname}: ${marker}`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<script\b/g) || []).length, 3, 'only existing GA4 and static JSON-LD; no app JS');
  const graph = schema(html);
  const breadcrumb = graph.find(item => item['@type'] === 'BreadcrumbList');
  assert.equal(breadcrumb.itemListElement.at(-1).item, site + pathname);
  for (const href of [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1])) {
    const url = new URL(href, site + pathname);
    if (url.origin !== site) continue;
    const file = url.pathname.endsWith('/') ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `missing ${href} on ${pathname}`);
    if (url.hash) assert.ok(read(file).includes(`id="${url.hash.slice(1)}"`), `missing anchor ${href}`);
  }
}
const index = read('notice/index.html');
assert.deepEqual([...index.matchAll(/data-notice-slug="([^"]+)"/g)].map(match => match[1]), publicNotices(data).map(notice => notice.slug));
const listSchema = schema(index).find(node => node['@type'] === 'ItemList');
assert.equal(schema(index).filter(node => node['@type'] === 'CollectionPage').length, 1);
assert.deepEqual(listSchema.itemListElement.map(item => item.url), publicNotices(data).map(notice => site + noticePath(notice)));
for (const notice of publicNotices(data)) {
  const html = read(`notice/${notice.slug}/index.html`);
  assert.ok(html.includes(renderNoticeContent(notice)));
  assert.ok(html.includes(`<time datetime="${notice.publishedAt}">`));
  const graph = schema(html), article = graph.find(node => node['@type'] === 'Article');
  assert.equal(article.headline, notice.title);
  assert.equal(article.description, notice.summary);
  assert.equal(article.datePublished, notice.publishedAt);
  assert.equal(article.dateModified, notice.modifiedAt);
  assert.equal(article.articleSection, notice.category);
  assert.equal(article.articleBody, clean(renderNoticeContent(notice)));
  assert.equal(graph.find(node => node['@type'] === 'WebPage').mainEntity['@id'], article['@id']);
  assert.deepEqual(graph.find(node => node['@type'] === 'BreadcrumbList').itemListElement.map(item => item.item), [site, `${site}/notice/`, site + noticePath(notice)]);
  assert.ok(rss.includes(`<guid isPermaLink="true">${site}${noticePath(notice)}</guid>`));
  assert.ok(rss.includes(`<pubDate>${new Date(`${notice.publishedAt}T00:00:00+09:00`).toUTCString()}</pubDate>`));
}
if (publicNotices(data).some(notice => notice.slug === 'christmas-2026')) {
const christmas = read('notice/christmas-2026/index.html');
for (const product of catalog.products) {
  assert.ok(christmas.includes(`<strong>${product.name}</strong>`));
  assert.ok(christmas.includes(`${product.price.toLocaleString('ko-KR')}원`));
}
assert.match(christmas, /온라인 주문 신청은 준비 중/);
assert.doesNotMatch(christmas, /주문 오픈|예약 확정|재고 확보|결제 완료/);
assert.ok(christmas.includes('href="/christmas/"'));
}
if (publicNotices(data).some(notice => notice.slug === 'pickup-guide')) {
const pickup = read('notice/pickup-guide/index.html');
assert.ok(pickup.includes('서울특별시 강서구 송정로 25 1층'));
assert.match(pickup, /차량 퀵.*가능 여부/);
assert.ok(pickup.includes('href="/pickup/"'));
}
const shippingNotice = publicNotices(data).find(notice => notice.slug === 'shipping-guide');
if (shippingNotice) {
const shipping = read('notice/shipping-guide/index.html');
assert.deepEqual(shippingNotice.content.find(block => block.type === 'shippingProducts').items.map(item => item.name), ['COOKIE FLIGHT', 'TERMINAL 카라멜 샌드쿠키', '행운쿠키']);
for (const item of shippingNotice.content.find(block => block.type === 'shippingProducts').items) assert.ok(shipping.includes(`href="${shippingUrl(item)}"`));
assert.doesNotMatch(shipping, /무료배송|전국배송|익일 도착|당일 발송/);
}
assert.equal((rss.match(/<item>/g) || []).length, publicNotices(data).length);
assert.deepEqual([...rss.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map(match => match[1]), publicNotices(data, { pinnedFirst: false }).map(notice => site + noticePath(notice)));
assert.ok(guideRss.includes('/guides/'));
assert.equal(guideRss.includes('/notice/'), false, 'retain distinct cookie-guide RSS');
const homeNews = home.match(/<!-- NM_NOTICE_HOME:START -->([\s\S]*?)<!-- NM_NOTICE_HOME:END -->/)[1];
assert.deepEqual([...homeNews.matchAll(/data-notice-slug="([^"]+)"/g)].map(match => match[1]), publicNotices(data).slice(0, 3).map(notice => notice.slug));
assert.equal(publicNotices(data)[0].slug, 'pickup-guide');
assert.equal(data.notices.find(notice => notice.slug === 'christmas-2026').pinned, false);
for (const file of ['notice/pickup-guide/index.html', 'pickup/index.html', 'index.html']) assert.ok(read(file).includes('예약 없이 방문하시면 구매할 쿠키가 없습니다.'), `${file}: clear reservation-only notice`);
for (const file of ['notice/index.html', 'notice/pickup-guide/index.html']) {
  assert.ok(read(file).includes('href="/assets/site.css"') && read(file).includes('href="/assets/showroom.css"'));
  assert.match(read(file), /class="showroom-logo"/);
  assert.match(read(file), /class="showroom-header"/);
  assert.match(read(file), /class="showroom-footer"/);
}
assert.doesNotMatch(read('assets/notices.css'), /font:.*system-ui|font:.*-apple-system/);
assert.ok(home.includes('data-journal-list') && home.includes('src="assets/journal.js"'));
for (const file of ['christmas/index.html', 'pickup/index.html', 'products/cookie-flight/index.html', 'products/terminal-sand-cookie/index.html', 'out/fortune/index.html']) assert.ok(read(file).includes('data-notice-link href="/notice/"'));
buildNotices({ check: true });

// Exercise authoring/visibility transitions in an isolated fixture, never the live site.
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-notices-'));
try {
  for (const file of ['data/notices.json', 'data/business.json', 'data/christmas-products.json', 'data/site-pages.json', 'index.html', 'llms.txt', 'christmas/index.html', 'pickup/index.html', 'products/cookie-flight/index.html', 'products/terminal-sand-cookie/index.html', 'out/fortune/index.html']) {
    fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(fixture, file));
  }
  const writeCatalog = value => fs.writeFileSync(path.join(fixture, 'data/notices.json'), JSON.stringify(value));
  const example = { slug: 'fixture-old', title: '기존 공지', summary: '정렬 검증용 공지', category: '이용 안내', publishedAt: '2026-10-24', modifiedAt: '2026-10-24', status: 'published', pinned: false, content: [{ type: 'paragraph', text: '정적 공지 본문입니다.' }] };
  const pinned = { ...structuredClone(example), slug: 'fixture-pinned', pinned: true, publishedAt: '2026-10-23' };
  const sameDay = { ...structuredClone(example), slug: 'fixture-same-day' };
  const newer = structuredClone(example);
  Object.assign(newer, { slug: 'new-public-notice', title: '새 공지 <script>alert(1)</script> & 안내', publishedAt: '2026-10-25', modifiedAt: '2026-10-26', pinned: false });
  newer.content = [{ type: 'paragraph', text: '<script>alert(1)</script> & 본문' }];
  const changed = { version: 1, updatedAt: '2026-10-26', notices: [pinned, example, sameDay, newer] };
  writeCatalog(changed);
  buildNotices({ root: fixture });
  buildNotices({ root: fixture, check: true });
  const fixtureRead = file => fs.readFileSync(path.join(fixture, file), 'utf8');
  assert.equal(publicNotices(changed)[0].slug, 'fixture-pinned', 'pinned stays first');
  assert.equal(publicNotices(changed, { pinnedFirst: false })[0].slug, newer.slug, 'home/RSS latest first');
  assert.deepEqual([...fixtureRead('notice/index.html').matchAll(/data-notice-slug="([^"]+)"/g)].map(match => match[1]), ['fixture-pinned', newer.slug, 'fixture-old', 'fixture-same-day']);
  assert.equal([...fixtureRead('notice/feed.xml').matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)][0][1], site + noticePath(newer));
  assert.match(fixtureRead(`notice/${newer.slug}/index.html`), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(fixtureRead(`notice/${newer.slug}/index.html`), /<script>alert\(1\)<\/script>/);
  assert.match(fixtureRead(`notice/${newer.slug}/index.html`), /수정일 <time datetime="2026-10-26"/);
  assert.deepEqual([...fixtureRead('index.html').matchAll(/data-notice-slug="([^"]+)"/g)].map(match => match[1]), ['fixture-pinned', newer.slug, 'fixture-old'], 'home prioritizes pinned posts; RSS stays newest first');
  assert.equal((fixtureRead('notice/feed.xml').match(/<item>/g) || []).length, 4);
  changed.notices.at(-1).status = 'draft';
  writeCatalog(changed);
  assert.throws(() => buildNotices({ root: fixture, check: true }), /out of date/);
  buildNotices({ root: fixture });
  assert.equal(fs.existsSync(path.join(fixture, `notice/${newer.slug}/index.html`)), false);
  for (const file of ['notice/index.html', 'notice/feed.xml', 'index.html', 'data/site-pages.json', 'llms.txt']) assert.ok(!fixtureRead(file).includes(newer.slug), `${file}: draft leaked`);
  changed.notices.forEach(notice => { notice.status = 'archived'; });
  writeCatalog(changed);
  buildNotices({ root: fixture });
  assert.match(fixtureRead('notice/index.html'), /아직 공개된 공지사항이 없습니다/);
  assert.equal((fixtureRead('notice/feed.xml').match(/<item>/g) || []).length, 0);
  assert.equal(fs.existsSync(path.join(fixture, 'notice/fixture-pinned/index.html')), false);
  const badDate = structuredClone(changed); badDate.notices[0].publishedAt = '2026-02-30';
  assert.throws(() => validateNotices(badDate), /dates/);
  const duplicate = structuredClone(changed); duplicate.notices.push(structuredClone(duplicate.notices[0]));
  assert.throws(() => validateNotices(duplicate), /duplicate/);
  assert.throws(() => shippingUrl({ page: '/christmas/' }), /Unverified/);
} finally { fs.rmSync(fixture, { recursive: true, force: true }); }
console.log(`notices PASS: ${1 + publicNotices(data).length} static pages, content/price/link parity, metadata/Article/breadcrumb/sitemap/RSS, newest/pinned sorting, isolated add/draft/archive/empty/escaping/date validation`);
