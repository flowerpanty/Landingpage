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
assert.equal(clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]), "기념일 브루키 2구 선물");
assert.match(html.match(/<title>([^<]+)<\/title>/)[1], /기념일 브루키/);
assert.match(html, /class="ac-hero-headline">축하할 일이 있다면,/);
assert.match(html, /class="ac-answer-first" id="answer-first"/);
assert.match(html, /기념일 브루키는 어떤 선물인가요/);
assert.match(html, /1세트부터 예약할 수 있고 가격은 20,000원/);
assert.ok(html.indexOf('id="answer-first"') > html.indexOf('class="ac-hero-price"'));
assert.match(html, /<dl class="ac-facts-grid">/);
const momentSection = html.match(/<section[^>]*id="moments">([\s\S]*?)<\/section>/)[1];
assert.equal((momentSection.match(/<article\b/g) || []).length, 6);
const occasionTerms = ["생일", "프로포즈", "커플", "100일", "1주년", "결혼기념일", "첫돌", "승진축하", "시보해제"];
for (const term of occasionTerms) assert.ok(momentSection.includes(term), `occasion section must explain ${term}`);
for (const href of ["/wedding-favor/", "/first-birthday-favor/"]) assert.ok(momentSection.includes(`href="${href}"`));
assert.match(html, /class="ac-questions ac-section" id="occasion-questions"/);
assert.match(html, /기념일 브루키는 어디에서 받을 수 있나요/);
assert.match(html, /공항동 송정로 25 1층/);
for (const file of ["brookie/index.html", "small-gift/index.html"]) assert.match(read(file), /href="\/anniversary-cookie\/"/);
const previousBrookie = read("brookie/index.html");
assert.match(previousBrookie, /12개/);
const llmsEntry = read("llms.txt").split("\n").find(line => line.includes(url));
assert.ok(llmsEntry, "llms.txt must list the anniversary product");
for (const term of ["20,000원", "1세트", ...occasionTerms]) assert.ok(llmsEntry.includes(term), `llms must include ${term}`);
const sections = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(sections[sections.indexOf("set") + 1], "customization");

const product = graph.find((node) => node["@type"] === "Product");
assert.equal(product.offers.price, 20000);
assert.equal(product.offers.priceCurrency, "KRW");
assert.equal(product.offers.url, url);
for (const type of ["ProductPage", "Product", "Offer", "FAQPage", "BreadcrumbList", "Organization", "Bakery", "WebSite"]) {
  assert.ok(type === "Offer" ? product.offers["@type"] === type : graph.some(node => node["@type"] === type), `retain ${type}`);
}
assert.equal(graph.filter(node => node["@type"] === "Product").length, 1);
assert.equal(graph.some(node => node["@type"] === "Service"), false);
const recommended = product.additionalProperty.find(property => property.name === "추천 기념일");
assert.ok(recommended);
for (const term of occasionTerms) assert.ok(recommended.value.includes(term));
for (const name of ["기본 구성", "커스텀 안내", "주문 기준", "수령 방식"]) assert.ok(product.additionalProperty.some(property => property.name === name));

assert.match(product.additionalProperty.find((property) => property.name === "기본 구성").value, /브루키 2개.*문구 커스텀.*토퍼/);
assert.equal(graph.find((node) => node["@type"] === "ProductPage").about["@id"], `${url}#product`);
const visibleFaq = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map((match) => [clean(match[1]), clean(match[2])]);
assert.deepEqual(graph.find((node) => node["@type"] === "FAQPage").mainEntity.map((item) => [item.name, item.acceptedAnswer.text]), visibleFaq);
assert.equal(visibleFaq.length, 9);

for (let number = 1; number <= 3; number += 1) {
  const reference = `/images/anniversary/custom-${number}.webp`;
  assert.equal((html.match(new RegExp(`src="${reference}"`, "g")) || []).length, 1);
  assert.ok(html.includes(`href="${reference}"`), "every custom guide can open at full size");
  assert.ok(fs.statSync(path.join(ROOT, reference)).size < 150 * 1024);
}
const consultation = [...html.matchAll(/<a\b[^>]*data-event="order_anniversary_click"[^>]*>/g)];
assert.ok(consultation.length >= 5);
assert.ok(consultation.every(([tag]) => tag.includes('href="https://nothingmatters.co.kr/order/anniversary-cookie"')));
const naverUrl = "https://map.naver.com/p/entry/place/1547319276?lng=126.8115357&lat=37.557402&placePath=%2Fbooking%3Fentry%3Dplt%26from%3Dmap%26fromPanelNum%3D1%26additionalHeight%3D76%26timestamp%3D202610130938%26locale%3Dko%26svcName%3Dmap_pcv5&entry=plt&searchType=place&c=15.00,0,0,0,dh";
const reservations = [...html.matchAll(/<a\b[^>]*data-event="pickup_reservation_click"[^>]*>/g)];
assert.equal(reservations.length, 3);
assert.ok(reservations.every(([tag]) => tag.includes(`href="${naverUrl.replaceAll("&", "&amp;")}"`)));
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
console.log("anniversary occasion SEO: product H1, answer/facts, six occasions, separated favor routes, two inbound links, nine FAQs with exact schema parity, fixed 20000 KRW Offer, recommended occasions, llms/canonical/sitemap and preserved photo/order flow PASS");
