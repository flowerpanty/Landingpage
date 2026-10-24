import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://nothingmatters.co.kr";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const registry = JSON.parse(read("data/site-pages.json"));
const business = JSON.parse(read("data/business.json"));
const sitemap = read("sitemap.xml");
const pages = [
  ["wedding-favor", ["/brookie/", "/products/handmade-cookie/", "/guides/wedding-favor-cookie/"]],
  ["first-birthday-favor", ["/brookie/", "/products/custom-brownie-cookie/"]],
  ["corporate-gift", ["/brookie/", "/products/handmade-cookie/", "/products/terminal-sand-cookie/", "/guides/corporate-event-cookie/"]],
  ["farewell-favor", ["/products/custom-brownie-cookie/", "/products/brownie-cookie/", "/guides/farewell-favor-cookie/"]]
];
const sectionOrder = ["hero", "order-info", "real-cases", "choose", "price", "how-to-order", "receipt", "faq", "final-quote"];
const clean = (text) => text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

for (const [slug, expectedItems] of pages) {
  const pathname = `/${slug}/`;
  const html = read(`${slug}/index.html`);
  const entry = registry.pages.find((page) => page.path === pathname);
  assert.deepEqual([entry.status, entry.indexing, entry.sitemap, entry.lastmod], ["active", "index", true, slug === "farewell-favor" ? "2026-10-14" : "2026-10-06"]);
  assert.ok(entry.breadcrumbName);
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}${pathname}">`));
  assert.match(html, /name="robots" content="index,follow/);
  assert.ok(sitemap.includes(`<loc>${SITE}${pathname}</loc>`));
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<body class="theme-showroom occasion-page"/);
  for (const stylesheet of ["site.css", "showroom.css", "showroom-home.css", "occasion-landing.css"]) {
    assert.ok(html.includes(`href="/assets/${stylesheet}`), `${pathname}: missing shared showroom stylesheet`);
  }
  assert.doesNotMatch(html, /theme-home|class="nm-(?:topbar|logo|nav|btn|site)/);
  for (const meta of ["og:title", "og:description", "og:url", "og:image", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    assert.ok(html.includes(`="${meta}"`), `${pathname}: missing ${meta}`);
  }
  const expectedSections = slug === 'corporate-gift' ? [...sectionOrder.slice(0, 2), 'business-checklist', ...sectionOrder.slice(2)] : sectionOrder;
  assert.deepEqual([...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]), expectedSections);
  assert.match(html, /기본형 1구 7,800원 · 최소 12개/);
  assert.ok(html.includes("강서구 공항동 예약 픽업 또는 일정·수량에 따른 차량 퀵 상담"));
  assert.doesNotMatch(html, /택배|무료배송|전국배송|대량 할인|당일 제작/);
  const heroAndFinal = ["hero", "final-quote"].map(id => html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/section>`))[0]).join("\n");
  const primaryCtas = [...heroAndFinal.matchAll(/<a\b[^>]*class="showroom-button showroom-button--hero-primary"[^>]*>/g)].map((match) => match[0]);
  assert.equal(primaryCtas.length, 2);
  assert.ok(primaryCtas.every((tag) => tag.includes('href="/order/brookie"')));
  if (slug === "corporate-gift") {
    assert.equal((heroAndFinal.match(/class="showroom-button showroom-button--hero-secondary" href="\/order"/g) || []).length, 2);
  } else {
    assert.equal((heroAndFinal.match(/class="showroom-button showroom-button--hero-secondary" href="#real-cases"/g) || []).length, 2);
  }

  const schema = JSON.parse(html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/)[1]);
  const graph = schema["@graph"];
  for (const type of ["Organization", "Bakery", "CollectionPage", "Service", "BreadcrumbList", "FAQPage", "ItemList"]) {
    assert.equal(graph.filter((node) => node["@type"] === type).length, 1, `${pathname}: expected one ${type}`);
  }
  assert.equal(graph.some((node) => ["Product", "ProductPage", "Offer", "AggregateOffer"].includes(node["@type"])), false, "occasion pages must not duplicate representative Product entities");
  const service = graph.find((node) => node["@type"] === "Service");
  assert.deepEqual(service.provider, { "@id": `${SITE}/#localbusiness` });
  assert.deepEqual(service.areaServed, business.areaServed);
  assert.equal(service.url, `${SITE}${pathname}`);
  const collection = graph.find((node) => node["@type"] === "CollectionPage");
  assert.equal(collection.dateModified, entry.lastmod);
  assert.deepEqual(collection.mainEntity, [{ "@id": `${SITE}${pathname}#itemlist` }, { "@id": `${SITE}${pathname}#service` }]);
  const itemList = graph.find((node) => node["@type"] === "ItemList");
  assert.deepEqual(itemList.itemListElement.map((item) => item.url), expectedItems.map((href) => `${SITE}${href}`));
  for (const href of expectedItems) assert.ok(html.includes(`href="${href}"`), `${pathname}: schema link must be visible: ${href}`);
  const breadcrumb = graph.find((node) => node["@type"] === "BreadcrumbList");
  assert.equal(breadcrumb.itemListElement.at(-1).name, entry.breadcrumbName);
  assert.deepEqual(breadcrumb.itemListElement.map((item) => item.item), [SITE, `${SITE}/bulk/`, `${SITE}${pathname}`]);
  const visibleFaq = [...html.matchAll(/<details><summary>([^<]+)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map((match) => [clean(match[1]), clean(match[2])]);
  const faq = graph.find((node) => node["@type"] === "FAQPage");
  assert.deepEqual(faq.mainEntity.map((item) => [item.name, item.acceptedAnswer.text]), visibleFaq);
  assert.equal(visibleFaq.length, slug === "farewell-favor" ? 5 : slug === 'corporate-gift' ? 7 : 3);

  if (["corporate-gift", "wedding-favor", "farewell-favor"].includes(slug)) {
    assert.match(html, /data-occasion-conversion/);
    assert.equal((html.match(/class="occasion-floating-nav"/g) || []).length, 1);
    assert.equal((html.match(/class="occasion-mobile-sticky"/g) || []).length, 1);
    const floating = html.match(/<nav class="occasion-floating-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
    const mobile = html.match(/<nav class="occasion-mobile-sticky"[^>]*>([\s\S]*?)<\/nav>/)[1];
    for (const control of [floating, mobile]) {
      assert.ok(control.includes('href="/order/brookie"'));
      assert.ok(control.includes('href="https://pf.kakao.com/_QdCaK/chat"'));
      assert.ok(control.includes(`data-analytics-label="${slug}-floating-quote"`));
      assert.ok(control.includes(`data-analytics-label="${slug}-floating-kakao"`));
    }
    for (const anchor of ["real-cases", "choose", "price", "how-to-order", "faq"]) assert.ok(floating.includes(`href="#${anchor}"`));
    const header = html.match(/<header[\s\S]*?<\/header>/)[0];
    assert.ok(header.includes('href="#real-cases"'));
    assert.equal(header.includes('href="/#'), false, "occasion headers must navigate the current page");
    assert.ok(html.indexOf('class="showroom-wrap occasion-case-cta"') > html.indexOf('id="real-cases"'));
    assert.ok(html.indexOf('class="showroom-wrap occasion-case-cta"') < html.indexOf('id="choose"'));
    assert.match(html, /class="occasion-compare-cta"/);
  }
  if (slug === "farewell-favor") {
    const choose = html.match(/<section[^>]*id="choose"[^>]*>([\s\S]*?)<\/section>/)[1];
    const cards = [...choose.matchAll(/<article class="occasion-match">([\s\S]*?)<\/article>/g)];
    assert.equal(cards.length, 2, "only the two brownie products get primary recommendation cards");
    assert.ok(cards[0][1].includes('href="/products/custom-brownie-cookie/"'));
    assert.ok(cards[1][1].includes('href="/products/brownie-cookie/"'));
    assert.match(choose, /class="occasion-secondary-option"[\s\S]*보조 옵션[\s\S]*href="\/products\/lucky-cookie\/"/);
    assert.ok(read("llms.txt").includes(`${SITE}/farewell-favor/`));
    assert.match(sitemap, /<loc>https:\/\/nothingmatters\.co\.kr\/farewell-favor\/<\/loc>\s*<lastmod>2026-10-14<\/lastmod>/);
    for (const image of ["farewell-hero.jpg", "work-new-01.jpg", "work-new-02.jpg", "work-new-03.jpg"]) assert.ok(fs.existsSync(path.join(ROOT, "images", image)));
  }

  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const url = new URL(match[1], `${SITE}${pathname}`);
    if (url.origin !== SITE) continue;
    if (url.pathname === pathname && url.hash) {
      assert.ok(html.includes(`id="${url.hash.slice(1)}"`), `${pathname}: broken section link`);
      continue;
    }
    const file = url.pathname === "/" ? "index.html" : url.pathname.endsWith("/") ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1);
    const exists = fs.existsSync(path.join(ROOT, file)) || fs.existsSync(path.join(ROOT, `${file}.html`)) || fs.existsSync(path.join(ROOT, file, "index.html"));
    assert.ok(exists, `${pathname}: broken local link ${url.pathname}`);
  }
}

const bulk = read("bulk/index.html");
assert.match(bulk, /data-search-card="corporate"\s+href="\/corporate-gift\/"/);
assert.match(bulk, /data-search-card="favor"\s+href="\/wedding-favor\/"/);
for (const [guide, landing] of [["wedding-favor-cookie", "wedding-favor"], ["corporate-event-cookie", "corporate-gift"], ["farewell-favor-cookie", "farewell-favor"]]) {
  const html = read(`guides/${guide}/index.html`);
  assert.ok(html.includes(`href="/${landing}/"`), "information guides must link to the commercial landing");
  assert.ok(html.includes(`rel="canonical" href="${SITE}/guides/${guide}/"`), "information guides must retain self canonical");
  assert.ok(read(`${landing}/index.html`).includes(`href="/guides/${guide}/"`), "commercial landings must retain the preparation-guide link");
}
const brookie = read("brookie/index.html");
for (const [panel, slug] of [["moment-wedding", "wedding-favor"], ["moment-corporate", "corporate-gift"], ["moment-firstbirthday", "first-birthday-favor"]]) {
  const markup = brookie.slice(brookie.indexOf(`id="${panel}"`));
  const heading = markup.match(/<div class="moment-panel-head">[\s\S]*?<\/div>/)?.[0] || "";
  assert.ok(heading.includes(`href="/${slug}/"`), `${slug}: missing inbound link from the corresponding real-case section`);
}
const farewellGuide = read("guides/farewell-favor-cookie/index.html");
for (const anchor of farewellGuide.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(커스텀 브라우니(?: 보기)?)<\/a>/g)) assert.equal(anchor[1], "/products/custom-brownie-cookie/");
assert.match(farewellGuide, /href="\/products\/custom-brownie-cookie\/"[^>]*>커스텀 브라우니 보기/);
assert.match(farewellGuide, /guide-secondary-option/);
for (const file of ["corporate-gift/index.html", "wedding-favor/index.html", "first-birthday-favor/index.html", "flight-attendant-gift/index.html", "index.html", "magok-cookie/index.html"]) assert.ok(read(file).includes('href="/farewell-favor/"'), `${file}: commercial farewell context must link to the landing`);
for (const guide of ["farewell-favor-cookie", "teacher-snack-gift"]) {
  const html = read(`guides/${guide}/index.html`);
  assert.equal((html.match(/class="nm-float-cta"/g) || []).length, 1, `${guide}: reuse one existing floating bar`);
  const bar = html.slice(html.indexOf('<div class="nm-float-cta">'));
  assert.ok(bar.includes('href="https://pf.kakao.com/_QdCaK/chat"'));
  assert.ok(bar.includes(`href="${guide === "teacher-snack-gift" ? "/order" : "/farewell-favor/"}"`));
  assert.match(html, /data-disable-kakao-float/, "avoid an additional generated Kakao float");
}
const teacher = read("guides/teacher-snack-gift/index.html");
assert.equal((teacher.match(/class="guide-cta-strip"/g) || []).length, 1);
assert.match(teacher, /선생님 간식 구성 고르기/);
const teacherMatch = teacher.match(/<section[^>]*id="match"[^>]*>([\s\S]*?)<\/section>/)[1];
assert.equal((teacherMatch.match(/<article class="nm-pick-card/g) || []).length, 3);
for (const label of ["teacher-guide-order", "teacher-guide-kakao"]) assert.ok(teacher.includes(`data-analytics-label="${label}"`));
console.log("occasion conversion: four commercial routes, preserved 7800 KRW/minimum 12, schema/FAQ parity, farewell product priority and reciprocal guide links, local/floating/sticky CTAs, teacher single floating bar, inbound links/sitemap/llms PASS");
