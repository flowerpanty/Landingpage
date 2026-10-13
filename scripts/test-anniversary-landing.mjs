import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const html = read("anniversary-cookie/index.html");
const registry = JSON.parse(read("data/site-pages.json"));
const entry = registry.pages.find((page) => page.path === "/anniversary-cookie/");
const url = "https://nothingmatters.co.kr/anniversary-cookie/";
const graph = JSON.parse(html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/)[1])["@graph"];
const clean = (value) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

assert.deepEqual([entry.status, entry.indexing, entry.sitemap], ["active", "index", true]);
assert.ok(read("sitemap.xml").includes(`<loc>${url}</loc>`));
assert.match(html, new RegExp(`<link rel="canonical" href="${url}">`));
assert.equal((html.match(/application\/ld\+json/g) || []).length, 1, "use the shared generated graph without duplicate schema");
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.equal(clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]), "축하할 일이 있다면, 쿠키로 말해요.");
const sections = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(sections[sections.indexOf("set") + 1], "customization");

const product = graph.find((node) => node["@type"] === "Product");
assert.equal(product.offers.price, 19000);
assert.equal(product.offers.priceCurrency, "KRW");
assert.equal(product.offers.url, url);
assert.match(product.additionalProperty.find((property) => property.name === "기본 구성").value, /브루키 2개.*문구 커스텀.*토퍼/);
assert.equal(graph.find((node) => node["@type"] === "ProductPage").about["@id"], `${url}#product`);
const visibleFaq = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map((match) => [clean(match[1]), clean(match[2])]);
assert.deepEqual(graph.find((node) => node["@type"] === "FAQPage").mainEntity.map((item) => [item.name, item.acceptedAnswer.text]), visibleFaq);
assert.equal(visibleFaq.length, 6);

for (let number = 1; number <= 3; number += 1) {
  const reference = `/images/anniversary/custom-${number}.webp`;
  assert.equal((html.match(new RegExp(`src="${reference}"`, "g")) || []).length, 1);
  assert.ok(html.includes(`href="${reference}"`), "every custom guide can open at full size");
  assert.ok(fs.statSync(path.join(ROOT, reference)).size < 150 * 1024);
}
const consultation = [...html.matchAll(/<a\b[^>]*data-event="order_anniversary_click"[^>]*>/g)];
assert.ok(consultation.length >= 5);
assert.ok(consultation.every(([tag]) => tag.includes('href="/order/anniversary-cookie"')));
assert.match(html, /href="\/order\/brookie"/);
assert.match(html, /12개 이상 단체 주문/);
assert.doesNotMatch(html, /<form\b|\/api\/landing-orders|결제 완료|예약 완료/);
assert.match(read("index.html"), /href="anniversary-cookie\/"/);
const gallery = html.match(/<div class="ac-gallery-grid">([\s\S]*?)<\/div>/)[1];
assert.equal((gallery.match(/<figure\b/g) || []).length, 6);
for (let number = 1; number <= 6; number += 1) {
  const reference = `/images/anniversary/photo-${number}.jpg`;
  assert.ok(gallery.includes(`src="${reference}"`), `attached photo ${number} must appear in the gallery`);
  assert.ok(fs.statSync(path.join(ROOT, reference)).size < 500 * 1024);
}
assert.ok(product.image.includes("https://nothingmatters.co.kr/images/anniversary/photo-2.jpg"));
assert.match(html, /fetchpriority="high"[^>]*src="\/images\/anniversary\/photo-2.jpg"/);
assert.doesNotMatch(html, /2구 세트 최종 포장 사진은 아닙니다|구성 설명용 일러스트/);
assert.ok(registry.orderProducts.some((item) => item.slug === 'anniversary-cookie' && item.detailUrl === '/anniversary-cookie/'), 'dedicated anniversary order is listed');
console.log("anniversary landing: fixed KRW 19,000 offer, all three custom guides, exact FAQ schema, homepage link and separate consultation/bulk order paths PASS");
