import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");
const html = read("flight-attendant-gift/index.html");
const SITE = "https://nothingmatters.co.kr";
const STORE = "https://nothingmatters.kr/";
const pathname = "/flight-attendant-gift/";
const clean = text => text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const entry = JSON.parse(read("data/site-pages.json")).pages.find(page => page.path === pathname);
assert.deepEqual([entry.status, entry.indexing, entry.sitemap, entry.lastmod, entry.breadcrumbName], ["active", "index", true, "2026-10-07", "승무원 선물"]);
assert.match(html, /<link rel="canonical" href="https:\/\/nothingmatters\.co\.kr\/flight-attendant-gift\/">/);
assert.match(html, /name="robots" content="index,follow"/);
assert.ok(read("sitemap.xml").includes(`<loc>${SITE}${pathname}</loc>`));
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.equal(clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]), "승무원 친구에게, 비행기와 공항을 닮은 선물.");
assert.equal(html.match(/<title>([^<]+)<\/title>/)[1], "승무원 선물 · 승무원 친구 선물 | 비행기 쿠키·굿즈 - 낫띵메터스");
for (const meta of ["description", "og:title", "og:description", "og:url", "og:image", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
  assert.ok(html.includes(`="${meta}"`), `missing SEO metadata: ${meta}`);
}
assert.match(html, /class="theme-showroom flight-gift-page"/);
for (const css of ["site.css", "showroom.css", "showroom-home.css", "flight-attendant-gift.css"]) assert.ok(html.includes(`/assets/${css}`));

const cards = [...html.matchAll(/<article\b[^>]*data-gift-product="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.deepEqual(cards.map(card => card[1]), ["cookie-flight", "cookie-crew", "terminal", "captain", "dadama"]);
assert.match(cards[0][2], /16,000원/);
assert.match(cards[0][2], /클래식버터 · 더블초코 · 제주말차 · 오렌지/);
assert.match(cards[0][2], /4개입 전용 박스/);
assert.match(cards[1][2], /COOKIE CREW/);
assert.match(cards[2][2], /TERMINAL/);
assert.match(cards[3][2], /캡틴복덩이 · 비행기 키링/);
assert.match(cards[4][2], /dadama · 파우치/);
const photos = ["/images/cookie-flight-box-open.jpg", "/images/cookie-crew/cookie-crew-gift-set.jpg", "/images/terminal/package-closed.jpg"];
for (const [index, src] of photos.entries()) {
  assert.ok(cards[index][2].includes(`src="${src}"`));
  assert.ok(fs.existsSync(path.join(ROOT, src)));
}
for (const card of cards.slice(1)) assert.doesNotMatch(card[2], /[\d,]+\s*원/, "unverified product prices must remain absent");
for (const card of cards.slice(3)) {
  assert.doesNotMatch(card[2], /<img\b|소재|사이즈|크기|용량|색상|재고|배송|가죽|방수|\d+\s*(?:cm|mm|리터|ml)/i, "goods must not invent product photos or specifications");
}

const labels = ["hero", "cookie-flight", "cookie-crew", "terminal", "captain", "dadama", "combo", "final"].map(label => `flight-attendant-${label}`);
const purchaseLinks = [...html.matchAll(/<a\b[^>]*href="https:\/\/nothingmatters\.kr\/"[^>]*>/g)].map(match => match[0]);
assert.equal(purchaseLinks.length, 8);
assert.deepEqual(purchaseLinks.map(tag => tag.match(/data-analytics-label="([^"]+)"/)[1]), labels);
for (const tag of purchaseLinks) {
  assert.match(tag, /data-analytics-event="store_shop_click"/);
  assert.doesNotMatch(tag, /\btarget=|\bdownload=/, "store shopping must stay in the same tab");
}
assert.doesNotMatch(html, /href="\/order(?:\/|"|\?)/, "purchase CTAs must converge on the store");
const combos = html.match(/<section[^>]*id="gift-combos"[\s\S]*?<\/section>/)[0];
assert.match(combos, /이렇게 같이 골라보세요/);
assert.match(combos, /추천 조합이며 실제 상품은 각각 장바구니에 담아주세요\./);
assert.equal((combos.match(/<article>/g) || []).length, 3);
assert.equal((combos.match(/href="https:\/\/nothingmatters\.kr\/"/g) || []).length, 1);
assert.doesNotMatch(html, /무료배송|합배송|당일배송|세트 할인/);

const graph = JSON.parse(html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/)[1])["@graph"];
for (const type of ["CollectionPage", "BreadcrumbList", "ItemList", "FAQPage"]) assert.equal(graph.filter(node => node["@type"] === type).length, 1);
assert.equal(graph.some(node => ["Product", "Offer", "AggregateOffer", "Service"].includes(node["@type"])), false);
const itemList = graph.find(node => node["@type"] === "ItemList");
assert.deepEqual(itemList.itemListElement.map(item => item.url), ["/products/cookie-flight/", "/cookie-crew/", "/products/terminal-sand-cookie/"].map(url => SITE + url));
assert.deepEqual(graph.find(node => node["@type"] === "CollectionPage").mainEntity, { "@id": `${SITE}${pathname}#itemlist` });
assert.deepEqual(graph.find(node => node["@type"] === "BreadcrumbList").itemListElement.map(item => item.item), [SITE, SITE + pathname]);
const visibleFaq = [...html.matchAll(/<details><summary>([^<]+)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(match => [clean(match[1]), clean(match[2])]);
assert.equal(visibleFaq.length, 6);
assert.deepEqual(graph.find(node => node["@type"] === "FAQPage").mainEntity.map(item => [item.name, item.acceptedAnswer.text]), visibleFaq);
assert.ok(visibleFaq.at(-1)[1].includes("같은 쇼핑몰 장바구니"));

for (const file of ["gimpo/index.html", "products/cookie-flight/index.html", "cookie-crew/index.html", "products/terminal-sand-cookie/index.html", "index.html"]) {
  assert.ok(read(file).includes(`href="${pathname}"`), `missing inbound link: ${file}`);
}
for (const link of html.matchAll(/href="([^"]+)"/g)) {
  const url = new URL(link[1], SITE + pathname);
  if (url.origin !== SITE) continue;
  const file = url.pathname === "/" ? "index.html" : url.pathname.endsWith("/") ? url.pathname.slice(1) + "index.html" : url.pathname.slice(1);
  assert.ok(fs.existsSync(path.join(ROOT, file)), `broken internal link: ${url.pathname}`);
  if (url.hash) assert.ok(read(file).includes(`id="${url.hash.slice(1)}"`), `broken section link: ${url.href}`);
}
for (const file of ["server.js", "assets/dashboard.js"]) {
  const event = read(file).match(/(?:name: "store_shop_click",|store_shop_click: \{)([\s\S]*?)\n\s*\}/)?.[1];
  assert.ok(event, `${file}: event registration is required`);
  assert.match(event, /type: "order"/);
  assert.match(event, /nothingmatters\.kr 온라인 스토어 구매 이동/);
}
// Exercise daily and hourly aggregation with synthetic GA4 reports; no server or credentials are needed.
const serverSource = read("server.js");
const aggregationSource = ["mapGaRows", "formatSeriesLabel", "buildSeriesRows"]
  .map(name => serverSource.match(new RegExp(`function ${name}\\([^]*?\\n}\\n`))?.[0]);
assert.ok(aggregationSource.every(Boolean));
const aggregate = vm.runInNewContext(`${aggregationSource.join("\n")}\nbuildSeriesRows`);
for (const granularity of ["day", "hour"]) {
  const dimension = granularity === "hour" ? "hour" : "date";
  const key = granularity === "hour" ? "09" : "20261007";
  const eventReport = {
    dimensionHeaders: [{ name: dimension }, { name: "eventName" }],
    metricHeaders: [{ name: "eventCount" }],
    rows: [["store_shop_click", 8], ["order_start", 2], ["consult_click", 3]].map(([name, count]) => ({
      dimensionValues: [{ value: key }, { value: name }], metricValues: [{ value: String(count) }]
    }))
  };
  const point = aggregate({}, eventReport, { granularity }).find(row => row.key === key);
  assert.equal(point.orderClicks, 10, "store visits must contribute to the order time series");
  assert.equal(point.consultClicks, 3);
  assert.equal(point.totalActionClicks, 13);
}
assert.equal(new URL(STORE).hostname, "nothingmatters.kr");
console.log("flight attendant gift checks: five verified gifts, no invented goods facts/photos, same-tab store funnel, SEO/schema, six FAQs, inbound links and order event registration PASS");
