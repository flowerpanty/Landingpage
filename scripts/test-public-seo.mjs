import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://nothingmatters.co.kr";
const INSTAGRAM_URL = "https://instagram.com/nothingmatters_c";
const NAVER_PLACE_URL = "https://naver.me/Gsj2pwAu";
const businessFacts = JSON.parse(fs.readFileSync(path.join(ROOT, "data/business.json"), "utf8"));
const sitePages = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site-pages.json"), "utf8"));
const products = (sitePages.products || []).map((product) => ({
  ...product,
  detailPath: product.primaryUrl
}));
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>(https:\/\/nothingmatters\.co\.kr[^<]+)<\/loc>/g)].map((match) => match[1]);
const locSet = new Set(locs);
const feed = fs.readFileSync(path.join(ROOT, "feed.xml"), "utf8");
const htmlCache = new Map();
const sourceHtmlEntries = discoverSourceHtmlEntries();
const registryEntries = new Map();
const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");

for (const page of sitePages.pages || []) {
  registryEntries.set(normalizePathname(page.path), page);
}

for (const entry of sourceHtmlEntries) {
  if (!entry.pathname.startsWith("/gimpo/")) {
    assert.equal(readHtml(entry.filePath).includes("매장 픽업"), false, `${entry.pathname}: public source must describe reservation pickup instead of store pickup`);
  }
}

for (const product of products) {
  registryEntries.set(normalizePathname(product.detailPath), {
    path: product.detailPath,
    status: product.status,
    indexing: product.indexing || "index",
    sitemap: product.sitemap ?? true,
    source: "products",
  });
}

assert.equal(serverSource.includes("PUBLIC_WORK_CARD_META_BY_HREF"), false, "works metadata must not use a separate href map");
assert.match(serverSource, /const LEGACY_PRODUCT_REDIRECTS = SITE_PAGE_DATA\.redirects \|\| \{\};/, "redirects must come from site-pages.json");
assert.doesNotMatch(serverSource, /const LEGACY_PRODUCT_REDIRECTS = \{/, "server must not define a separate legacy redirect map");
for (const product of products) {
  assert.ok(product.primaryUrl, `${product.name}: primaryUrl is required`);
  assert.ok(registryEntries.has(normalizePathname(product.primaryUrl)), `${product.name}: primaryUrl must resolve through the registry`);
  assert.ok(fs.existsSync(filePathForPathname(product.primaryUrl)), `${product.name}: primaryUrl must resolve to a public page`);
}
for (const work of sitePages.works || []) {
  assert.ok(registryEntries.has(normalizePathname(work.href)), `works item ${work.id}: href must exist in the registry`);
}

const indexableGuidePages = (sitePages.pages || []).filter((page) => (
  page.path.startsWith("/guides/")
  && page.path !== "/guides/"
  && page.status === "active"
  && page.indexing === "index"
));
assert.match(feed, /<rss version="2\.0"/, "feed.xml should be a valid RSS feed");
assert.match(feed, /<atom:link href="https:\/\/nothingmatters\.co\.kr\/feed\.xml" rel="self" type="application\/rss\+xml" \/>/, "feed.xml should declare its canonical self link");
for (const page of indexableGuidePages) {
  assert.match(feed, new RegExp(`<link>${SITE_URL}${page.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</link>`), `${page.path}: feed should include the indexable guide`);
}

const primaryProducts = products.filter((product) => product.urlRole === "primary-product");
const searchLandingPages = (sitePages.pages || []).filter((page) => page.urlRole === "search-landing");
const expectedPrimaryOffers = new Map([
  ["/brookie/", ["lowPrice", 7800]],
  ["/out/", ["lowPrice", 4500]],
  ["/out/fortune/", ["price", 15000]],
  ["/products/cookie-flight/", ["price", 16000]],
  ["/products/airplane-cookie/", ["price", 2500]],
]);
assert.equal(primaryProducts.length, 6, "site registry should define six primary products");
assert.equal(searchLandingPages.length, 4, "site registry should define four search landing pages");
const primaryProductUrls = new Set(primaryProducts.map((product) => normalizePathname(product.primaryUrl)));
for (const product of primaryProducts) {
  const pathname = normalizePathname(product.primaryUrl);
  const html = readHtml(filePathForPathname(pathname));
  const schema = getStaticSchema(html);
  const graph = schema["@graph"] || [];
  const productPage = graph.find((entry) => entry["@type"] === "ProductPage");
  const productEntity = graph.find((entry) => entry["@type"] === "Product");
  assert.equal(product.status, "active", `${pathname}: primary product should remain active`);
  assert.equal(product.indexing, "index", `${pathname}: primary product should remain indexable`);
  assert.equal(product.sitemap, true, `${pathname}: primary product should remain in the sitemap`);
  assert.equal(getCanonical(html), `${SITE_URL}${pathname}`, `${pathname}: primary product must use self canonical`);
  assert.equal(isIndexFollow(html), true, `${pathname}: primary product must remain index,follow`);
  assert.equal(locSet.has(`${SITE_URL}${pathname}`), true, `${pathname}: primary product must remain in the sitemap`);
  assert.ok(productPage, `${pathname}: primary product should use ProductPage schema`);
  assert.equal(productEntity?.["@id"], `${SITE_URL}${pathname}#product`, `${pathname}: primary Product should keep its local @id`);
  assert.deepEqual(productPage?.about, { "@id": `${SITE_URL}${pathname}#product` }, `${pathname}: ProductPage should describe its local Product`);
  assert.deepEqual(productEntity?.mainEntityOfPage, { "@id": `${SITE_URL}${pathname}#webpage` }, `${pathname}: Product should identify its local ProductPage`);
  const expectedSubjects = searchLandingPages
    .filter((page) => normalizePathname(page.relatedProductPrimaryUrl) === pathname)
    .map((page) => ({ "@id": `${SITE_URL}${normalizePathname(page.path)}#webpage` }));
  assert.deepEqual(productEntity?.subjectOf, expectedSubjects.length ? expectedSubjects : undefined, `${pathname}: primary Product subjectOf should list only related search landings`);
  const [offerKey, offerValue] = expectedPrimaryOffers.get(pathname) || [];
  if (offerKey) {
    assert.equal(productEntity?.offers?.[offerKey], offerValue, `${pathname}: primary Product should retain its verified price metadata`);
    assert.equal(productEntity?.offers?.priceCurrency, "KRW", `${pathname}: primary Product offers should retain KRW`);
    assert.deepEqual(productEntity?.offers?.seller, { "@id": `${SITE_URL}/#organization` }, `${pathname}: primary Product offers should retain the organization seller`);
  } else {
    assert.equal(productEntity?.offers, undefined, `${pathname}: primary Product must not infer a price`);
  }
}
for (const page of searchLandingPages) {
  const pathname = normalizePathname(page.path);
  const html = readHtml(filePathForPathname(pathname));
  const schema = getStaticSchema(html);
  const graph = schema["@graph"] || [];
  const productPage = graph.find((entry) => entry["@type"] === "ProductPage");
  const productEntity = graph.find((entry) => entry["@type"] === "Product");
  assert.equal(page.indexing, "index", `${pathname}: search landing should remain indexable`);
  assert.equal(page.sitemap, true, `${pathname}: search landing should remain in the sitemap`);
  assert.ok(primaryProductUrls.has(normalizePathname(page.relatedProductPrimaryUrl)), `${pathname}: relatedProductPrimaryUrl must point to a primary product`);
  assert.equal(getCanonical(html), `${SITE_URL}${pathname}`, `${pathname}: search landing must use self canonical`);
  assert.equal(isIndexFollow(html), true, `${pathname}: search landing must remain index,follow`);
  assert.equal(locSet.has(`${SITE_URL}${pathname}`), true, `${pathname}: search landing must remain in the sitemap`);
  const relatedUrl = `${SITE_URL}${normalizePathname(page.relatedProductPrimaryUrl)}`;
  assert.ok([...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].some((match) => {
    try { return new URL(match[1], `${SITE_URL}${pathname}`).href === relatedUrl; } catch { return false; }
  }), `${pathname}: search landing should link to its related primary product`);
  assert.ok(productPage, `${pathname}: search landing should use ProductPage schema`);
  assert.equal(productEntity, undefined, `${pathname}: search landing must not publish a duplicate Product entity`);
  assert.deepEqual(
    productPage?.about,
    { "@id": `${SITE_URL}${normalizePathname(page.relatedProductPrimaryUrl)}#product` },
    `${pathname}: ProductPage should reference its representative primary Product`
  );
}

for (const [pathname, expectedProperties] of [
  ["/products/scone/", ["맛 구성", "예약 제작", "주문 기준", "수령 방식"]],
  ["/products/terminal-sand-cookie/", ["주문 방식", "수령 방식"]],
]) {
  const html = readHtml(filePathForPathname(pathname));
  const graph = getStaticSchema(html)["@graph"] || [];
  const productPage = graph.find((entry) => entry["@type"] === "ProductPage");
  const productEntity = graph.find((entry) => entry["@type"] === "Product");
  assert.ok(productEntity, `${pathname}: active product page should have a Product entity`);
  assert.equal(productEntity?.["@id"], `${SITE_URL}${pathname}#product`, `${pathname}: Product should use the local representative URL`);
  assert.deepEqual(productPage?.about, { "@id": `${SITE_URL}${pathname}#product` }, `${pathname}: ProductPage should reference its Product`);
  assert.deepEqual(productEntity?.mainEntityOfPage, { "@id": `${SITE_URL}${pathname}#webpage` }, `${pathname}: Product should identify its ProductPage`);
  assert.equal(productEntity?.offers, undefined, `${pathname}: Product must not infer a price`);
  assert.deepEqual(productEntity?.additionalProperty?.map((property) => property.name), expectedProperties, `${pathname}: Product should expose only confirmed properties`);
}

for (const [pathname, { title, description, optimizedImage }] of [
  ["/brookie/", { title: "브루키 답례품·커스텀 쿠키 | 낫띵메터스", description: /브루키 답례품·커스텀 쿠키/, optimizedImage: "/images/main-order-brookie-thumb-optimized.jpg" }],
  ["/out/", { title: "수제꾸덕쿠키 선물세트 | 낫띵메터스", description: /수제꾸덕쿠키 선물세트/, optimizedImage: "/images/handmade-cookie-flavor-lineup-optimized.jpg" }],
  ["/out/fortune/", { title: "행운쿠키 응원 선물세트 | 낫띵메터스", description: /행운쿠키·응원 선물세트/ }],
  ["/cookie-crew/", { title: "쿠키크루 캐릭터 쿠키 선물 | 낫띵메터스", description: /캐릭터 쿠키와 굿즈/ }],
]) {
  const html = readHtml(filePathForPathname(pathname));
  assert.equal(getAttribute(html, /<title>([\s\S]*?)<\/title>/i), title, `${pathname}: product title should match its search intent`);
  assert.match(getMeta(html, "name", "description"), description, `${pathname}: product description should match its search intent`);
  if (optimizedImage) {
    assert.equal(getMeta(html, "property", "og:image"), `${SITE_URL}${optimizedImage}`, `${pathname}: social metadata should use its optimized image`);
    assert.ok(fs.statSync(path.join(ROOT, optimizedImage)).size <= 500 * 1024, `${pathname}: optimized social image should stay at or below 500KB`);
  }
}
const brookieHtml = readHtml(filePathForPathname("/brookie/"));
for (const relatedLanding of ["/products/brownie-cookie/", "/products/custom-brownie-cookie/"]) {
  assert.ok([...brookieHtml.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].some((match) => {
    try { return new URL(match[1], `${SITE_URL}/brookie/`).pathname === relatedLanding; } catch { return false; }
  }), `primary Brookie page should link to ${relatedLanding}`);
}
for (const alias of Object.keys(sitePages.redirects || {})) {
  assert.equal(locSet.has(`${SITE_URL}${alias}`), false, `${alias}: redirect aliases must not enter the sitemap`);
}

const registrySitemapLocs = [...registryEntries.values()]
  .filter((page) => page.sitemap)
  .map((page) => `${SITE_URL}${normalizePathname(page.path)}`);

function filePathForUrl(loc) {
  const pathname = new URL(loc).pathname;
  return path.join(ROOT, pathname === "/" ? "index.html" : pathname.slice(1), pathname === "/" ? "" : "index.html");
}

function normalizePathname(pathname) {
  const value = String(pathname || "/").trim().normalize("NFC") || "/";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  if (withLeadingSlash === "/") return "/";
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function pathnameForIndexFile(filePath) {
  const relative = path.relative(ROOT, filePath).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  return normalizePathname(`/${relative.replace(/\/index\.html$/, "/")}`);
}

function isExcludedPathname(pathname) {
  const normalized = normalizePathname(pathname);
  if (/^\/(?:api|dashboard|gallery-admin)(?:\/|$)/.test(normalized)) return true;
  return (sitePages.excludedPrefixes || []).some((prefix) => {
    const normalizedPrefix = normalizePathname(prefix);
    return normalized === normalizedPrefix || normalized.startsWith(normalizedPrefix);
  });
}

function discoverSourceHtmlEntries() {
  const entries = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".playwright-cli", "node_modules", "_handoff"].includes(entry.name)) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.name !== "index.html") continue;

      const pathname = pathnameForIndexFile(entryPath);
      if (isExcludedPathname(pathname)) continue;
      entries.push({ pathname, filePath: entryPath });
    }
  }

  walk(ROOT);
  return entries.sort((a, b) => a.pathname.localeCompare(b.pathname));
}

function getAttribute(html, pattern) {
  return html.match(pattern)?.[1]?.trim() || "";
}

function cleanText(value = "") {
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getMeta(html, attribute, value) {
  return getAttribute(
    html,
    new RegExp(`<meta[^>]+${attribute}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["']`, "i")
  );
}

function countHeadMetaByName(html, name) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...head.matchAll(new RegExp(`<meta\\b[^>]*\\bname=["']${escapedName}["'][^>]*>`, "gi"))].length;
}

function getStaticSchema(html) {
  const match = html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/);
  assert.ok(match, "missing static JSON-LD");
  return JSON.parse(match[1]);
}

function readHtml(filePath) {
  if (!htmlCache.has(filePath)) htmlCache.set(filePath, fs.readFileSync(filePath, "utf8"));
  return htmlCache.get(filePath);
}

function getCanonical(html) {
  return getAttribute(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
}

function getRobots(html) {
  return getMeta(html, "name", "robots").toLowerCase();
}

function isIndexFollow(html) {
  const robots = getRobots(html);
  return /\bindex\b/.test(robots) && /\bfollow\b/.test(robots) && !/\bnoindex\b/.test(robots);
}

function getFilePathForLocalHref(currentPathname, rawHref) {
  const href = String(rawHref || "").trim();
  if (!href || href.startsWith("#")) return null;
  if (/^(?:mailto:|tel:|sms:|javascript:|data:)/i.test(href)) return null;

  let resolvedUrl;
  try {
    resolvedUrl = new URL(href, `${SITE_URL}${currentPathname}`);
  } catch (error) {
    return null;
  }

  if (resolvedUrl.origin !== SITE_URL) return null;
  if (resolvedUrl.pathname.startsWith("/api/")) return null;

  const pathname = resolvedUrl.pathname;
  if ((sitePages.redirects || {})[pathname]) return null;
  if ((sitePages.redirects || {})[pathname.replace(/\/$/, "")]) return null;

  return {
    href,
    pathname,
    filePath: filePathForPathname(pathname),
  };
}

function filePathForPathname(pathname) {
  const decodedPathname = decodeURIComponent(pathname);
  if (decodedPathname === "/" || decodedPathname.endsWith("/")) {
    return path.join(ROOT, decodedPathname.slice(1), "index.html");
  }
  if (decodedPathname.endsWith("/index.html")) {
    return path.join(ROOT, decodedPathname.slice(1));
  }
  if (path.extname(decodedPathname)) {
    return path.join(ROOT, decodedPathname.slice(1));
  }
  return path.join(ROOT, decodedPathname.slice(1), "index.html");
}

function assertLocalInternalLinksResolve(entry, html) {
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);

  for (const href of hrefs) {
    const target = getFilePathForLocalHref(entry.pathname, href);
    if (!target) continue;
    assert.equal(
      fs.existsSync(target.filePath),
      true,
      `${entry.pathname}: broken local link ${target.href} -> ${target.pathname}`
    );
  }
}

assert.equal(new Set(locs).size, locs.length, "sitemap contains duplicate URLs");
assert.equal(new Set(registrySitemapLocs).size, registrySitemapLocs.length, "site registry contains duplicate sitemap URLs");

for (const expectedLoc of registrySitemapLocs) {
  assert.ok(locSet.has(expectedLoc), `sitemap missing registry URL: ${new URL(expectedLoc).pathname}`);
}

for (const loc of locs) {
  const pathname = normalizePathname(new URL(loc).pathname);
  const isManagedProductPath = products.some((product) => normalizePathname(product.detailPath) === pathname);
  assert.ok(
    registryEntries.has(pathname) || isManagedProductPath,
    `sitemap URL is not classified in data/site-pages.json: ${pathname}`
  );
}

for (const entry of sourceHtmlEntries) {
  const html = readHtml(entry.filePath);
  const canonical = getCanonical(html);
  const registryEntry = registryEntries.get(entry.pathname);

  assert.ok(registryEntry, `public HTML is not classified in data/site-pages.json: ${entry.pathname}`);
  assert.equal(
    countHeadMetaByName(html, "naver-site-verification"),
    1,
    `${entry.pathname}: naver-site-verification must appear exactly once in head`
  );

  if (isIndexFollow(html)) {
    assert.ok(canonical, `${entry.pathname}: missing canonical`);
    assert.equal(canonical, `${SITE_URL}${entry.pathname}`, `${entry.pathname}: canonical must match source path`);
    assert.ok(locSet.has(canonical), `${entry.pathname}: index,follow page missing from sitemap`);
  } else if (registryEntry.indexing === "noindex") {
    assert.match(getRobots(html), /\bnoindex\b/, `${entry.pathname}: noindex registry entry must emit noindex robots`);
  }

  assertLocalInternalLinksResolve(entry, html);
}

const boardEntry = (sitePages.pages || []).find((page) => page.path === "/gimpo-board/");
assert.equal(boardEntry?.productionReady, true, "Gimpo board must be production-ready");
assert.deepEqual(
  { status: boardEntry?.status, indexing: boardEntry?.indexing, sitemap: boardEntry?.sitemap },
  { status: "active", indexing: "index", sitemap: true },
  "Gimpo flight board should be an active public page"
);
assert.ok(locSet.has(`${SITE_URL}/gimpo-board/`), "Gimpo flight board should be in the sitemap");
const boardHtml = readHtml(filePathForPathname("/gimpo-board/"));
assert.match(boardHtml, /<title>김포공항 도착정보·출발정보 \| 실시간 항공편<\/title>/);
assert.equal(getCanonical(boardHtml), `${SITE_URL}/gimpo-board/`);
assert.doesNotMatch(boardHtml, /href="\/gimpo2\/"/);
assert.match(boardHtml, /href="\/gimpo\/"/, "flight board should link back to the cookie hub");
assert.match(boardHtml, /id="detail-pickup-link"[^>]*href="\/gimpo\/pickup\/"/, "selected board flight should link to pickup guidance");
assert.match(boardHtml, /id="board-badge"[^>]*>GMP · CHECKING<\/span>/, "board must not claim LIVE before fresh data loads");
assert.doesNotMatch(boardHtml, /KAC_FLIGHT_API_KEY|serviceKey=/, "board HTML must not expose provider credentials");
assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "assets/gimpo-board.js"), "utf8"), /KAC_FLIGHT_API_KEY|serviceKey=/, "board client JS must not expose provider credentials");

for (const [pathname, title, h1, pageType] of [
  ["/gimpo/", "김포공항 선물·디저트·기념품 | 비행기 쿠키 예약 픽업 - 낫띵메터스", "김포공항 가는 날, 조금 특별한 선물을 찾고 있다면.", "CollectionPage"],
  ["/gimpo-board/", "김포공항 도착정보·출발정보 | 실시간 항공편", "김포공항 도착정보·출발정보 실시간 항공편", "WebPage"],
  ["/gimpo/pickup/", "김포공항 근처 쿠키 픽업 안내 | NOTHINGMATTERS", "김포공항 가기 전, 예약한 쿠키를 픽업하세요.", "WebPage"],
]) {
  const entry = registryEntries.get(pathname);
  const html = readHtml(filePathForPathname(pathname));
  const graph = getStaticSchema(html)["@graph"];
  assert.deepEqual(
    { status: entry?.status, indexing: entry?.indexing, sitemap: entry?.sitemap, lastmod: entry?.lastmod },
    { status: "active", indexing: "index", sitemap: true, lastmod: pathname === "/gimpo/pickup/" ? "2026-09-28" : pathname === "/gimpo/" ? "2026-09-30" : "2026-09-29" },
    `${pathname}: registry must publish the new route`
  );
  assert.equal(getCanonical(html), `${SITE_URL}${pathname}`);
  assert.match(getRobots(html), /^index,follow/, `${pathname}: should remain indexable`);
  assert.equal(getAttribute(html, /<title>([\s\S]*?)<\/title>/i), title);
  assert.equal(cleanText(getAttribute(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)), h1);
  assert.ok(locSet.has(`${SITE_URL}${pathname}`));
  assert.ok(sitemap.includes(`<loc>${SITE_URL}${pathname}</loc>\n    <lastmod>${entry.lastmod}</lastmod>`), `${pathname}: sitemap lastmod must match the registry`);
  assert.ok(graph.some((node) => node["@type"] === pageType));
  assert.ok(graph.some((node) => node["@type"] === "BreadcrumbList"));
  assert.equal(graph.some((node) => node["@type"] === "Product"), false, `${pathname}: no duplicate Product schema`);
  assert.doesNotMatch(html, /(?:재고\s*\d+|남은\s*수량|품절\s*임박|in\s*stock)/i, `${pathname}: no fake inventory claims`);
  assert.doesNotMatch(html, /(?:도보|차로|차량으로|공항까지)\s*\d+\s*분|\d+\s*(?:km|m)\s*거리/i, `${pathname}: no unverified travel estimate`);
}
const gimpoHtml = readHtml(filePathForPathname("/gimpo/"));
assert.equal(getMeta(gimpoHtml, "name", "description"), "김포공항 근처에서 특별한 선물이나 디저트를 찾고 있다면. 비행기 쿠키 COOKIE FLIGHT부터 터미널 쿠키, 공항 테마 선물까지 만나보세요. 김포공항·송정역 인근 공항동 예약 픽업.");
assert.equal(getMeta(gimpoHtml, "property", "og:title"), "김포공항 가는 날, 조금 특별한 선물이 필요하다면");
assert.equal(getMeta(gimpoHtml, "property", "og:url"), `${SITE_URL}/gimpo/`);
assert.ok(gimpoHtml.includes('href="/gimpo-board/"'), "hub should link to the full flight board");
assert.equal((gimpoHtml.match(/class="hub-intents"[\s\S]*?<\/nav>/)?.[0].match(/href="#/g) || []).length, 6, "hub needs six search-intent anchors");
assert.equal((gimpoHtml.match(/class="hub-faq-list"[\s\S]*?<\/div>/)?.[0].match(/<details>/g) || []).length, 5, "hub needs five visible FAQ answers");
assert.ok(gimpoHtml.includes("김포공항 안에서 판매하지 않습니다."));
assert.ok(gimpoHtml.includes("서울특별시 강서구 송정로 25 1층"));
assert.doesNotMatch(gimpoHtml, /(?:김포공항\s*5분|도보|주차|\d+번 출구)/);
assert.doesNotMatch(gimpoHtml, /SNS COOKIE|href="\/gimpo2\/"/);
const gimpoGraph = getStaticSchema(gimpoHtml)["@graph"];
const gimpoFaq = gimpoGraph.find((node) => node["@type"] === "FAQPage");
assert.equal(gimpoFaq?.mainEntity.length, 5, "hub FAQPage must match five visible questions");
assert.deepEqual(gimpoFaq.mainEntity.map((item) => item.name), [...gimpoHtml.matchAll(/<summary>([^<]+)<\/summary>/g)].map((match) => match[1]));
assert.deepEqual(gimpoFaq.mainEntity.map((item) => item.acceptedAnswer.text), [...gimpoHtml.matchAll(/<details><summary>[^<]+<\/summary><p>([^<]+)<\/p><\/details>/g)].map((match) => match[1]));
assert.match(gimpoFaq.mainEntity.find((item) => item.name === "김포공항 선물로 어떤 쿠키가 있나요?")?.acceptedAnswer.text || "", /COOKIE FLIGHT, TERMINAL SAND COOKIE, AIRPLANE BUTTER COOKIE, COOKIE CREW/);
assert.deepEqual(gimpoGraph.find((node) => node["@type"] === "CollectionPage")?.about, { "@id": `${SITE_URL}/#localbusiness` });
const gimpoItemList = gimpoGraph.find((node) => node["@type"] === "ItemList");
assert.deepEqual(gimpoItemList?.itemListElement?.map((item) => [item.name, item.url]), [
  ["COOKIE FLIGHT", `${SITE_URL}/products/cookie-flight/`],
  ["TERMINAL SAND COOKIE", `${SITE_URL}/products/terminal-sand-cookie/`],
  ["AIRPLANE BUTTER COOKIE", `${SITE_URL}/products/airplane-cookie/`],
  ["COOKIE CREW", `${SITE_URL}/cookie-crew/`],
]);
assert.equal((gimpoHtml.match(/<div class="hub-products">[\s\S]*?<\/div>/)?.[0].match(/<article>/g) || []).length, 4, "hub must show exactly four verified products");
assert.equal(gimpoGraph.some((node) => node["@type"] === "Product"), false);
const gimpo2Html = readHtml(filePathForPathname("/gimpo2/"));
const gimpo2Entry = registryEntries.get("/gimpo2/");
assert.deepEqual({ status: gimpo2Entry.status, indexing: gimpo2Entry.indexing, sitemap: gimpo2Entry.sitemap }, { status: "active", indexing: "noindex", sitemap: false });
assert.match(getRobots(gimpo2Html), /^noindex,follow/);
assert.equal(locSet.has(`${SITE_URL}/gimpo2/`), false, "planner should be absent from sitemap while it remains a separate utility");
assert.match(gimpo2Html, /<h2 id="live-title">김포공항 출발·도착 항공편 선택<\/h2>/);
assert.match(gimpo2Html, /김포공항 도착정보/);
assert.match(gimpo2Html, /김포공항 도착시간/);
assert.match(gimpo2Html, /김포공항 도착정보도 확인할 수 있나요\?/);
assert.match(gimpo2Html, /class="flight-answers"[\s\S]*?href="\/gimpo-board\/"/);
assert.equal((gimpo2Html.match(/class="flight-answers-grid"[\s\S]*?<\/div>/)?.[0].match(/<article>/g) || []).length, 3, "planner should answer three flight-information questions");
assert.match(gimpo2Html, /id="g2-board-link" href="\/gimpo-board\/"/, "planner should link to the full live board");
assert.match(gimpo2Html, /class="planner-links"[\s\S]*?href="\/gimpo\/pickup\/"[\s\S]*?href="\/gimpo\/"/, "planner should link to pickup guidance and the cookie hub");
const gimpo2Graph = getStaticSchema(gimpo2Html)["@graph"];
assert.equal(gimpo2Graph.find((node) => node["@type"] === "WebPage")?.name, "김포공항 출발 전 쿠키 픽업 시간 확인");
assert.equal(gimpo2Graph.find((node) => node["@type"] === "WebPage")?.description, getMeta(gimpo2Html, "name", "description"));
assert.equal(gimpo2Graph.find((node) => node["@type"] === "BreadcrumbList")?.itemListElement?.at(-1)?.name, "김포공항 출발 전 쿠키 픽업 플래너");
const gimpoPickupHtml = readHtml(filePathForPathname("/gimpo/pickup/"));
assert.match(gimpoPickupHtml, /class="section gimpo-related"[\s\S]*?href="\/gimpo-board\/"/, "pickup guide should link to the flight board");
for (const [name, content] of [
  ["board", boardHtml],
  ["pickup", gimpoPickupHtml],
  ["flight guide", readHtml(filePathForPathname("/guides/gimpo-airport-flight-status/"))],
  ["departure guide", readHtml(filePathForPathname("/guides/gimpo-airport-departure-checklist/"))],
  ["llms", fs.readFileSync(path.join(ROOT, "llms.txt"), "utf8")],
]) assert.doesNotMatch(content, /(?:href="|https:\/\/nothingmatters\.co\.kr)\/gimpo2\//, `${name}: no internal planner link`);
assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "assets/gimpo-board.js"), "utf8"), /flightUrl\("\/gimpo2\/"/, "board must not inject a planner link");
const gimpoPickupGraph = getStaticSchema(gimpoPickupHtml)["@graph"];
assert.equal(gimpoPickupGraph.find((node) => node["@type"] === "BreadcrumbList")?.itemListElement?.[1]?.name, "김포공항 선물·디저트·기념품", "pickup breadcrumb should name its Gimpo hub parent");
assert.deepEqual(gimpoPickupGraph.find((node) => node["@type"] === "WebPage")?.about, { "@id": `${SITE_URL}/#localbusiness` });
assert.deepEqual(gimpoPickupGraph.find((node) => node["@type"] === "Service")?.provider, { "@id": `${SITE_URL}/#localbusiness` });

const kimpoCorePages = ["/gimpo-board/", "/gimpo/", "/gimpo2/", "/gimpo/pickup/", "/pickup/"];
const kimpoGuides = [
  ["/guides/gimpo-airport-flight-status/", "김포공항 출발·도착 항공편 확인하는 방법"],
  ["/guides/gimpo-airport-departure-checklist/", "김포공항 가기 전 확인할 것"],
];
const kimpoIntents = new Map();
for (const pathname of [...kimpoCorePages, ...kimpoGuides.map(([route]) => route)]) {
  const html = readHtml(filePathForPathname(pathname));
  kimpoIntents.set(pathname, {
    title: cleanText(getAttribute(html, /<title>([\s\S]*?)<\/title>/i)),
    h1: cleanText(getAttribute(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)),
    description: getMeta(html, "name", "description"),
  });
}
for (const field of ["title", "h1", "description"]) {
  const values = [...kimpoIntents.values()].map((intent) => intent[field]);
  assert.ok(values.every(Boolean) && new Set(values).size === values.length, `Kimpo cluster pages need distinct ${field} search intents`);
}
for (const [pathname, h1] of kimpoGuides) {
  const entry = registryEntries.get(pathname);
  const html = readHtml(filePathForPathname(pathname));
  const graph = getStaticSchema(html)["@graph"];
  const url = `${SITE_URL}${pathname}`;
  assert.deepEqual(
    { status: entry?.status, indexing: entry?.indexing, sitemap: entry?.sitemap, lastmod: entry?.lastmod },
    { status: "active", indexing: "index", sitemap: true, lastmod: "2026-09-28" },
    `${pathname}: informational guide registry`
  );
  assert.equal(getCanonical(html), url);
  assert.equal(isIndexFollow(html), true);
  assert.equal(kimpoIntents.get(pathname).h1, h1);
  assert.equal(locs.filter((loc) => loc === url).length, 1, `${pathname}: sitemap exactly once`);
  assert.equal(feed.split(`<link>${url}</link>`).length - 1, 1, `${pathname}: feed exactly once`);
  const webpage = graph.find((node) => node["@id"] === `${url}#webpage`);
  assert.equal(webpage?.["@type"], "WebPage");
  assert.equal(webpage?.dateModified, "2026-09-28");
  assert.equal(webpage?.inLanguage, "ko-KR");
  assert.deepEqual(webpage?.publisher, { "@id": `${SITE_URL}/#organization` });
  assert.ok(graph.some((node) => node["@type"] === "BreadcrumbList"));
  assert.equal(graph.some((node) => node["@type"] === "Product"), false, `${pathname}: informational guide must not invent a Product`);
  assert.ok(html.includes('href="/gimpo-board/"'), `${pathname}: guide should reach the live board`);
  assert.match(html, /한국공항공사 제공 자료/, `${pathname}: source attribution should be visible`);
}
for (const href of ["/gimpo/pickup/", "/gimpo/"]) {
  assert.ok(boardHtml.includes(`href="${href}"`), `flight board should link to ${href}`);
}
assert.match(boardHtml, /class="board-info"[\s\S]*?김포공항 도착정보와 출발정보 확인[\s\S]*?한국공항공사 제공 자료/);
assert.match(boardHtml, /김포공항 도착시간/);
assert.match(boardHtml, /김포공항 출발정보/);
assert.match(boardHtml, /공식 공항 사이트가 아닙니다/);
assert.equal((boardHtml.match(/class="board-info-questions"[\s\S]*?<\/div>/)?.[0].match(/<article>/g) || []).length, 4, "board should answer four practical flight questions");
assert.equal(getStaticSchema(boardHtml)["@graph"].some((node) => node["@type"] === "FAQPage"), false, "board Q&A should not add FAQPage markup purely for ranking");
assert.ok(gimpoHtml.includes('href="/gimpo/pickup/"'), "travel-cookie hub should reach reservation pickup guidance");
assert.ok(gimpoPickupHtml.includes('href="/gimpo/"'), "pickup guidance should link back to the travel-cookie hub");
for (const html of [boardHtml, gimpoHtml, gimpo2Html, gimpoPickupHtml]) {
  assert.match(html, /김포공항 내부가 아닌|김포공항 내부가 아니라|김포공항 안에서 판매하지 않습니다/, "Kimpo pages must clarify that NOTHINGMATTERS is outside the airport");
}
const guideHubHtml = readHtml(filePathForPathname("/guides/"));
const guideHubItems = getStaticSchema(guideHubHtml)["@graph"].find((node) => node["@type"] === "ItemList")?.itemListElement || [];
for (const [pathname] of kimpoGuides) {
  assert.ok(guideHubHtml.includes(`href=".${pathname.slice(7)}"`), `${pathname}: visible guide directory link`);
  assert.ok(guideHubItems.some((item) => item.url === `${SITE_URL}${pathname}`), `${pathname}: guide directory ItemList`);
}

for (const entry of sitePages.pages || []) {
  if (entry.status !== "archive") continue;
  assert.equal(entry.indexing, "noindex", `${entry.path}: archive pages must be noindex in registry`);
  assert.equal(entry.sitemap, false, `${entry.path}: archive pages must be excluded from sitemap`);
  const archiveHtml = readHtml(filePathForPathname(entry.path));
  assert.equal(getRobots(archiveHtml), "noindex,follow", `${entry.path}: archive robots must be exactly noindex,follow`);
  assert.equal(locSet.has(`${SITE_URL}${normalizePathname(entry.path)}`), false, `${entry.path}: archive page must be absent from sitemap`);
}

for (const loc of locs) {
  const pathname = new URL(loc).pathname;
  assert.equal(/^\/(?:gallery-admin|dashboard|api)(?:\/|$)/.test(pathname), false, `non-public sitemap URL: ${pathname}`);

  const filePath = filePathForUrl(loc);
  assert.equal(fs.existsSync(filePath), true, `missing public HTML: ${filePath}`);
  const html = readHtml(filePath);

  assert.ok(getAttribute(html, /<title>([\s\S]*?)<\/title>/i), `${pathname}: missing title`);
  assert.ok(getMeta(html, "name", "description"), `${pathname}: missing description`);
  assert.ok(getMeta(html, "name", "robots"), `${pathname}: missing robots`);
  assert.equal(getCanonical(html), loc, `${pathname}: invalid canonical`);
  for (const property of ["og:title", "og:description", "og:url", "og:image"]) {
    assert.ok(getMeta(html, "property", property), `${pathname}: missing ${property}`);
  }
  assert.ok(getMeta(html, "name", "twitter:card"), `${pathname}: missing twitter card`);
  assert.ok(getAttribute(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i), `${pathname}: missing h1`);

  const schema = getStaticSchema(html);
  const graph = schema["@graph"] || [];
  assert.equal(graph.filter((item) => item["@type"] === "Organization").length, 1, `${pathname}: Organization should have one top-level entity`);
  assert.equal(graph.filter((item) => item["@type"] === "Bakery").length, 1, `${pathname}: Bakery should have one top-level entity`);
  assert.equal(graph.filter((item) => item["@type"] === "Place").length, 0, `${pathname}: duplicate top-level Place schema is not allowed`);
  const registryEntry = registryEntries.get(normalizePathname(pathname));
  const webPage = graph.find((item) => ["WebPage", "CollectionPage", "ContactPage", "ProductPage"].includes(item["@type"]));
  if (registryEntry?.indexing === "index" && registryEntry.lastmod) {
    assert.equal(webPage?.dateModified, registryEntry.lastmod, `${pathname}: dateModified should match registry lastmod`);
  }
  for (const type of ["Organization", "Bakery"]) {
    const entity = graph.find((item) => item["@type"] === type);
    assert.ok(entity?.sameAs?.includes(INSTAGRAM_URL), `${pathname}: ${type} missing Instagram`);
    assert.ok(entity?.sameAs?.includes(NAVER_PLACE_URL), `${pathname}: ${type} missing official Naver Place`);
  }

  for (const product of graph.filter((item) => item["@type"] === "Product")) {
    assert.equal(product.offers?.availability, undefined, `${pathname}: Product offers must not claim InStoreOnly or another unverified availability`);
    if (product.offers) {
      assert.ok(product.offers.priceCurrency, `${pathname}: Product offer missing currency`);
      assert.ok(product.offers.price != null || product.offers.lowPrice != null, `${pathname}: Product offer missing price`);
    }
  }
}

const cookieFlightPath = "/products/cookie-flight/";
const cookieFlightProduct = products.find((product) => product.primaryUrl === cookieFlightPath);
assert.deepEqual(
  {
    status: cookieFlightProduct?.status,
    indexing: cookieFlightProduct?.indexing,
    sitemap: cookieFlightProduct?.sitemap,
    detailPageMode: cookieFlightProduct?.detailPageMode
  },
  { status: "active", indexing: "index", sitemap: true, detailPageMode: "existing" },
  "COOKIE FLIGHT should be an active, indexable existing product"
);
assert.equal((sitePages.pages || []).some((page) => page.path === cookieFlightPath), false, "COOKIE FLIGHT must not remain as a duplicate page-registry entry");
assert.equal(cookieFlightProduct?.updatedAt, "2026-09-24", "COOKIE FLIGHT updatedAt should reflect the new detail");
assert.ok(locs.includes(`${SITE_URL}${cookieFlightPath}`), "sitemap should include COOKIE FLIGHT");
assert.match(
  sitemap,
  /<loc>https:\/\/nothingmatters\.co\.kr\/products\/cookie-flight\/<\/loc>\s*<lastmod>2026-09-24<\/lastmod>/,
  "COOKIE FLIGHT sitemap lastmod should reflect the new detail"
);
const cookieFlightHtml = readHtml(filePathForPathname(cookieFlightPath));
assert.equal(
  countHeadMetaByName(cookieFlightHtml, "naver-site-verification"),
  1,
  "COOKIE FLIGHT should have exactly one naver-site-verification meta tag"
);
assert.match(getRobots(cookieFlightHtml), /\bindex\b/);
assert.equal(getRobots(cookieFlightHtml).includes("noindex"), false, "COOKIE FLIGHT must be indexable");
assert.equal(getCanonical(cookieFlightHtml), `${SITE_URL}${cookieFlightPath}`, "COOKIE FLIGHT canonical should be exact");
assert.equal(getAttribute(cookieFlightHtml, /<title>([\s\S]*?)<\/title>/i), "COOKIE FLIGHT 비행기 쿠키 4종 선물세트 | 낫띵메터스");
assert.match(getMeta(cookieFlightHtml, "name", "description"), /클래식버터, 오렌지, 제주말차, 더블초코/);
for (const flavor of ["클래식버터", "더블초코", "제주말차", "오렌지"]) {
  assert.ok(cookieFlightHtml.includes(flavor), `COOKIE FLIGHT should visibly name ${flavor}`);
}
assert.match(cookieFlightHtml, /FROM GIMPO/, "COOKIE FLIGHT should visibly identify its Gimpo origin");
for (const unverifiedDetail of ["4,500원부터", "1구부터", "1구, 2구, 4구", "handmade-hero.jpg", "handmade-4box-01.jpg"]) {
  assert.equal(cookieFlightHtml.includes(unverifiedDetail), false, `COOKIE FLIGHT must not include unverified detail: ${unverifiedDetail}`);
}
for (const forbiddenLocationClaim of ["김포공항 매장", "김포공항점", "공항 내 매장", "김포공항 안에 위치"]) {
  assert.equal(cookieFlightHtml.includes(forbiddenLocationClaim), false, `COOKIE FLIGHT must not imply an in-airport shop: ${forbiddenLocationClaim}`);
}
for (const href of ["../../pickup/", "../../magok-cookie/", "../../works/"]) {
  assert.ok(cookieFlightHtml.includes(`href=\"${href}\"`), `COOKIE FLIGHT should link to ${href}`);
}
const cookieFlightSchema = getStaticSchema(cookieFlightHtml);
const cookieFlightGraph = cookieFlightSchema["@graph"] || [];
const cookieFlightWebPage = cookieFlightGraph.find((entry) => entry["@type"] === "ProductPage");
const cookieFlightSchemaProduct = cookieFlightGraph.find((entry) => entry["@type"] === "Product");
assert.ok(cookieFlightSchemaProduct, "COOKIE FLIGHT should have Product schema");
assert.equal(cookieFlightSchemaProduct?.offers?.price, 16000, "COOKIE FLIGHT Product schema should use the supplied 16,000원 price");
assert.deepEqual(
  cookieFlightSchemaProduct?.additionalProperty?.map((property) => [property.name, property.value]),
  [["맛 구성", "클래식버터 · 오렌지 · 제주말차 · 더블초코"], ["구성", "4개입 전용 박스"], ["수령 방식", "강서구 공항동 예약 픽업 또는 일정·수량에 따른 차량 퀵 상담"]],
  "COOKIE FLIGHT Product schema should contain the supplied flavor and box facts"
);
assert.deepEqual(cookieFlightWebPage?.about, { "@id": `${SITE_URL}${cookieFlightPath}#product` }, "COOKIE FLIGHT ProductPage should link to its Product entity");
const cookieFlightHomeHtml = readHtml(filePathForPathname("/"));
assert.match(cookieFlightHomeHtml, /data-analytics-label="COOKIE FLIGHT"[\s\S]*?href="products\/cookie-flight\/"|href="products\/cookie-flight\/"[\s\S]*?data-analytics-label="COOKIE FLIGHT"/);
assert.match(cookieFlightHomeHtml, /<span>4 FLAVORS<\/span><span>4개입 세트<\/span>/, "home should render COOKIE FLIGHT registry tags");
assert.match(cookieFlightHomeHtml, /alt="NOTHINGMATTERS COOKIE FLIGHT 4종 선물세트"/);
assert.equal((cookieFlightHomeHtml.match(/data-analytics-label="COOKIE FLIGHT"/g) || []).length, 1, "old COOKIE FLIGHT card must be replaced");
const airplanePath = "/products/airplane-cookie/";
const airplaneHtml = readHtml(filePathForPathname(airplanePath));
assert.equal(getCanonical(airplaneHtml), `${SITE_URL}${airplanePath}`);
assert.ok(locs.includes(`${SITE_URL}${airplanePath}`), "sitemap should include the airplane butter cookie");
assert.match(airplaneHtml, /비행기 버터쿠키/);
assert.match(airplaneHtml, /2,500/);
assert.equal(getStaticSchema(airplaneHtml)["@graph"].find((entry) => entry["@type"] === "Product")?.offers?.price, 2500);
assert.match(cookieFlightHomeHtml, /alt="NOTHINGMATTERS 비행기 버터쿠키"/);
const cookieFlightWorksHtml = readHtml(filePathForPathname("/works/"));
assert.equal(cookieFlightWorksHtml.includes("COOKIE FLIGHT"), false, "works must not claim a COOKIE FLIGHT production case without evidence");

assert.ok(businessFacts.sameAs?.includes(NAVER_PLACE_URL), "business facts should include the official Naver Place URL");

for (const product of products) {
  assert.ok(locs.includes(`${SITE_URL}${product.detailPath}`), `sitemap missing product: ${product.detailPath}`);
}

for (const requiredRoute of ["/works/", "/pickup/"]) {
  assert.ok(locs.includes(`${SITE_URL}${requiredRoute}`), `sitemap missing route: ${requiredRoute}`);
}

assert.equal(
  sourceHtmlEntries.some((entry) => entry.pathname.startsWith("/_handoff/")),
  false,
  "handoff source files must not be discovered as public pages"
);
assert.match(fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8"), /^_handoff\/$/m, "handoff files must stay out of deploy commits");
assert.match(
  sitemap,
  /<loc>https:\/\/nothingmatters\.co\.kr\/guides\/<\/loc>\s*<lastmod>2026-09-28<\/lastmod>/,
  "guides sitemap lastmod should reflect the updated guide directory"
);
for (const pathname of ["/", "/bulk/", "/small-gift/", "/works/", "/guides/corporate-event-cookie/", "/guides/dessert-gift-set/"]) {
  assert.match(
    sitemap,
    new RegExp(`<loc>${SITE_URL.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}${pathname.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}<\\/loc>\\s*<lastmod>${pathname === "/" ? "2026-09-24" : pathname === "/works/" ? "2026-09-22" : "2026-09-18"}<\\/lastmod>`),
    `${pathname} sitemap lastmod should reflect its current content`
  );
}
assert.match(
  sitemap,
  /<loc>https:\/\/nothingmatters\.co\.kr\/pickup\/<\/loc>\s*<lastmod>2026-09-22<\/lastmod>/,
  "pickup sitemap lastmod should reflect the Gimpo Airport dessert gift guide"
);

const cookieStoragePath = "/guides/cookie-storage/";
const cookieStorageEntry = registryEntries.get(cookieStoragePath);
assert.equal(cookieStorageEntry?.lastmod, "2026-09-22", "cookie storage registry lastmod should reflect the answer-first update");
assert.match(
  sitemap,
  /<loc>https:\/\/nothingmatters\.co\.kr\/guides\/cookie-storage\/<\/loc>\s*<lastmod>2026-09-22<\/lastmod>/,
  "cookie storage sitemap lastmod should reflect the answer-first update"
);
const cookieStorageHtml = readHtml(filePathForPathname(cookieStoragePath));
assert.match(cleanText(getAttribute(cookieStorageHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i)), /쿠키 보관방법과\s*맛있게 드시는 기간/, "cookie storage H1 should answer the search intent directly");
const cookieStorageSchema = getStaticSchema(cookieStorageHtml);
const cookieStorageBreadcrumb = cookieStorageSchema["@graph"].find((entry) => entry["@type"] === "BreadcrumbList");
assert.equal(
  cookieStorageBreadcrumb?.itemListElement?.at(-1)?.name,
  "쿠키 보관방법·맛있게 드시는 기간",
  "cookie storage breadcrumb should use its search-intent name"
);
const cookieStorageLocationMarkup = cookieStorageHtml.match(/<section class="section pickup-section" id="visit-pickup">([\s\S]*?)<\/section>/)?.[1] || "";
assert.match(cookieStorageLocationMarkup, /서울특별시 강서구 송정로 25 1층/, "cookie storage pickup callout should expose the official address");
assert.match(cookieStorageLocationMarkup, /김포공항·송정역 인근/, "cookie storage pickup callout should expose the local context");
assert.match(cookieStorageLocationMarkup, /예약 픽업 전용/, "cookie storage pickup callout should explain the reservation-only pickup model");
assert.match(cookieStorageLocationMarkup, /예약 없이 방문하시면 현장 구매가 어려우니/, "cookie storage pickup callout should not promise walk-in availability");
assert.match(cookieStorageLocationMarkup, /href="https:\/\/naver\.me\/Gsj2pwAu"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*data-analytics-event="cookie_care_naver_place_click"/, "cookie storage pickup callout should use the official Naver Place CTA");
assert.match(cookieStorageLocationMarkup, /href="\.\.\/\.\.\/pickup\/"/, "cookie storage pickup callout should link internally to pickup guidance");
for (const forbidden of ["김포공항 매장", "김포공항점", "공항 내 매장", "예약 없이 구매 가능"]) {
  assert.equal(cookieStorageLocationMarkup.includes(forbidden), false, `cookie storage pickup callout contains forbidden location claim: ${forbidden}`);
}
const cookieStorageFaq = cookieStorageSchema["@graph"].find((entry) => entry["@type"] === "FAQPage");
assert.equal(cookieStorageFaq?.mainEntity?.length, 8, "cookie storage FAQPage should keep eight questions");
const cookieStorageFaqMarkup = cookieStorageHtml.match(/<section class="section" id="faq">([\s\S]*?)<\/section>/)?.[1] || "";
const cookieStorageVisibleFaq = [...cookieStorageFaqMarkup.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
  .map((match) => ({ name: cleanText(match[1]), text: cleanText(match[2]) }));
assert.deepEqual(
  cookieStorageVisibleFaq,
  cookieStorageFaq?.mainEntity?.map((item) => ({ name: item.name, text: item.acceptedAnswer?.text })) || [],
  "cookie storage visible FAQ and FAQPage should remain synchronized"
);

const magokPath = "/magok-cookie/";
const magokEntry = registryEntries.get(magokPath);
assert.deepEqual(
  { status: magokEntry?.status, indexing: magokEntry?.indexing, sitemap: magokEntry?.sitemap },
  { status: "active", indexing: "index", sitemap: true },
  "magok cookie hub should be an indexable sitemap page"
);
const magokHtml = readHtml(filePathForPathname(magokPath));
const magokLineup = magokHtml.match(/<div class="magok-product-grid">([\s\S]*?)<\/div>\s*<\/section>/)?.[1] || "";
assert.equal((magokLineup.match(/<h3>COOKIE FLIGHT<\/h3>/g) || []).length, 1, "magok lineup should expose COOKIE FLIGHT exactly once");
assert.match(magokLineup, /김포공항 인근 시그니처 선물/, "magok should preserve the verified COOKIE FLIGHT context");
for (const forbidden of ["마곡 전용 상품", "마곡 매장 상품"]) {
  assert.equal(magokLineup.includes(forbidden), false, `magok COOKIE FLIGHT lineup must not imply ${forbidden}`);
}
assert.match(getAttribute(magokHtml, /<title>([\s\S]*?)<\/title>/i), /마곡 쿠키/);
assert.match(getMeta(magokHtml, "name", "description"), /쿠키|답례품/);
assert.match(magokHtml, /<h1\b[^>]*>/i, "magok cookie hub should have an h1");
assert.equal(magokEntry?.lastmod, "2026-09-22", "magok registry lastmod should reflect COOKIE FLIGHT activation");
assert.match(getAttribute(magokHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i), /마곡 답례품/);
assert.match(magokHtml, /실제 작업실은 마곡 인근 서울 강서구 공항동/, "magok quick answer should clarify the actual workshop location");
assert.match(magokHtml, /QUICK ANSWER/, "magok should include an answer-first block");
assert.match(magokHtml, /마곡 회사 답례품을 준비한다면 행사 날짜, 필요한 수량, 선물 목적을 먼저 정한 뒤 쿠키와 포장·문구 가능 범위를 상담하면 됩니다\./, "magok should answer how to prepare a company gift");
assert.match(magokHtml, /홈[\s\S]*마곡 답례품·쿠키 선물/, "magok should expose a visible breadcrumb");
assert.match(magokHtml, /실제로 이런 쿠키를 만들고 있어요/, "magok should include first-party proof");
assert.match(magokHtml, /class="magok-proof-grid"[^>]*data-live-gallery-preview[^>]*data-archive-href="\.\.\/#actual-cases"[^>]*data-gallery-preview-limit="3"/, "magok proof should use the live homepage archive preview");
assert.match(magokHtml, /href="\.\.\/#actual-cases">메인에서 최근 제작 아카이브 보기 →<\/a>/, "magok proof should link to the homepage production archive");
assert.match(magokHtml, /href="\.\.\/works\/">실제 제작 사례 더 보기 →<\/a>/, "magok proof should link to works");
assert.match(magokHtml, /<script src="\.\.\/assets\/gallery\.js"><\/script>/, "magok should load the shared live archive renderer");
assert.match(magokHtml, /href="https:\/\/naver\.me\/Gsj2pwAu"/, "magok pickup section should expose the official Naver Place link");
const magokFavorGuide = magokHtml.match(/<section class="magok-section magok-favor-guide" id="magok-favor-guide"[\s\S]*?<\/section>/)?.[0] || "";
assert.match(magokFavorGuide, /회사·팀 감사 답례품/);
assert.match(magokFavorGuide, /행사·세미나 답례품/);
assert.match(magokFavorGuide, /소량 쿠키 선물/);
assert.equal((magokFavorGuide.match(/<a href=/g) || []).length, 3, "magok favor guide should provide three contextual links");
const magokCompanyChoice = magokHtml.match(/<section class="magok-section magok-company-choice"[\s\S]*?<\/section>/)?.[0] || "";
assert.match(magokCompanyChoice, /마곡 회사 선물,[\s\S]*어떤 경우에 무엇부터 확인하면 될까요\?/);
for (const label of ["팀·직원 감사 선물", "세미나·기업행사", "승진·퇴사·송별", "외부 방문객·가벼운 선물"]) {
  assert.match(magokCompanyChoice, new RegExp(label), `magok company choice should include ${label}`);
}
for (const href of ["../small-gift/", "../guides/corporate-event-cookie/", "../guides/farewell-favor-cookie/", "../index.html#cookies", "../works/"]) {
  assert.match(magokCompanyChoice, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `magok company choice should link to ${href}`);
}
for (const productHint of ["브루키는 캐릭터와 짧은 문구", "수제꾸덕쿠키는 여러 맛과 패키지", "행운쿠키는 HAPPY", "COOKIE FLIGHT는 비행기 모양", "쿠키크루는 쿠키와 캐릭터 굿즈"]) {
  assert.match(magokCompanyChoice, new RegExp(productHint), `magok company choice should explain ${productHint}`);
}
const magokSchema = getStaticSchema(magokHtml);
const magokGraph = magokSchema["@graph"] || [];
for (const type of ["Organization", "Bakery", "WebSite", "WebPage", "BreadcrumbList", "ItemList", "FAQPage"]) {
  assert.ok(magokGraph.some((entry) => entry["@type"] === type), `magok cookie hub missing ${type} schema`);
}
const magokBreadcrumb = magokGraph.find((entry) => entry["@type"] === "BreadcrumbList");
assert.equal(magokBreadcrumb?.itemListElement?.at(-1)?.name, "마곡 쿠키·답례품");
const magokWebPage = magokGraph.find((entry) => entry["@type"] === "WebPage");
assert.deepEqual(magokWebPage?.about, { "@id": `${SITE_URL}/#localbusiness` }, "magok WebPage should identify the actual LocalBusiness");
const magokService = magokGraph.find((entry) => entry["@type"] === "Service");
assert.deepEqual(magokService?.provider, { "@id": `${SITE_URL}/#localbusiness` }, "magok Service should be provided by the actual LocalBusiness");
assert.equal(magokService?.areaServed, "마곡", "magok Service should target Magok");
const magokItemList = magokGraph.find((entry) => entry["@type"] === "ItemList");
const normalizeMagokProductName = (name) => cleanText(name).replaceAll(" ", "");
const magokProductNames = new Set(["브루키", "쿠키크루", "수제꾸덕쿠키", "행운쿠키", "COOKIE FLIGHT", "터미널 샌드쿠키"].map(normalizeMagokProductName));
const magokVisibleProductEntries = [...magokLineup.matchAll(/<h3>([^<]+)<\/h3>[\s\S]*?<a href="([^"]+)"/g)]
  .map((match) => ({ name: normalizeMagokProductName(match[1]), url: new URL(match[2], `${SITE_URL}${magokPath}`).href }))
  .filter((entry) => magokProductNames.has(entry.name));
const magokSchemaProductEntries = (magokItemList?.itemListElement || [])
  .filter((item) => magokProductNames.has(normalizeMagokProductName(item.name)))
  .map((item) => ({ name: normalizeMagokProductName(item.name), url: item.url }));
assert.deepEqual(magokSchemaProductEntries, magokVisibleProductEntries.map((entry) => ({ name: entry.name, url: entry.url })), "magok visible product grid and ItemList products should stay synchronized");
const magokBusiness = magokGraph.find((entry) => entry["@type"] === "Bakery");
assert.deepEqual(magokBusiness?.address, {
  "@type": "PostalAddress",
  streetAddress: "송정로 25 1층",
  addressLocality: "강서구",
  addressRegion: "서울특별시",
  addressCountry: "KR"
});
assert.ok(magokBusiness?.areaServed?.some((area) => area.name === "마곡"), "magok areaServed should include 마곡");
assert.equal(magokBusiness?.priceRange, businessFacts.priceRange, "magok Bakery priceRange should match data/business.json");
assert.equal(locs.includes(`${SITE_URL}${magokPath}`), true, "sitemap should include magok cookie hub");
for (const forbidden of ["마곡 매장", "마곡동 매장", "마곡점", "마곡에 위치", "마곡 쿠키 전문점", "당일 배송", "무료 배송", "마곡 전지역 배송 가능", "즉시 퀵 가능"]) {
  assert.equal(magokHtml.includes(forbidden), false, `magok cookie hub contains forbidden location claim: ${forbidden}`);
}
const magokFaq = magokGraph.find((entry) => entry["@type"] === "FAQPage");
const magokFaqMarkup = magokHtml.match(/<div class="magok-faq-list">([\s\S]*?)<\/div><\/div>\s*<\/section>/)?.[1] || "";
const magokVisibleFaq = [...magokFaqMarkup.matchAll(/<details><summary>([\s\S]*?)<\/summary><div class="magok-faq-answer">([\s\S]*?)<\/div><\/details>/g)]
  .map((match) => ({ name: cleanText(match[1]), text: cleanText(match[2]) }));
assert.deepEqual(
  magokVisibleFaq,
  magokFaq?.mainEntity?.map((item) => ({ name: item.name, text: item.acceptedAnswer?.text })) || [],
  "magok visible FAQ and FAQPage should remain synchronized"
);
assert.equal(magokVisibleFaq.length, 8, "magok should expose eight visible FAQ entries");
for (const href of ["../works/", "../small-gift/", "../bulk/", "../guides/corporate-event-cookie/", "../guides/farewell-favor-cookie/"]) {
  assert.equal(magokHtml.includes(`href="${href}"`), true, `magok should expose contextual link ${href}`);
}

const guidesSchema = getStaticSchema(readHtml(filePathForPathname("/guides/")));
const guidesItemList = guidesSchema["@graph"].find((entry) => entry["@type"] === "ItemList");
assert.ok(guidesItemList?.itemListElement?.some((item) => item.url === `${SITE_URL}/magok-cookie/`), "guides ItemList should include magok cookie hub");

const pickupPath = "/pickup/";
const pickupEntry = registryEntries.get(pickupPath);
assert.equal(pickupEntry?.lastmod, "2026-09-22", "pickup registry lastmod should reflect COOKIE FLIGHT activation");
const pickupHtml = readHtml(filePathForPathname(pickupPath));
assert.match(getAttribute(pickupHtml, /<title>([\s\S]*?)<\/title>/i), /김포공항/);
assert.match(getAttribute(pickupHtml, /<title>([\s\S]*?)<\/title>/i), /디저트/);
assert.match(getAttribute(pickupHtml, /<title>([\s\S]*?)<\/title>/i), /답례품/);
assert.match(getMeta(pickupHtml, "name", "description"), /김포공항/);
assert.match(getMeta(pickupHtml, "name", "description"), /예약 픽업/);
assert.match(getMeta(pickupHtml, "name", "description"), /디저트 선물|쿠키 선물/);
assert.match(getAttribute(pickupHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i), /김포공항/);
assert.match(getAttribute(pickupHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i), /픽업/);
const pickupSchema = getStaticSchema(pickupHtml);
const pickupWebPage = pickupSchema["@graph"].find((entry) => entry["@type"] === "WebPage");
assert.deepEqual(pickupWebPage?.about, { "@id": `${SITE_URL}/#localbusiness` }, "pickup WebPage should identify the actual LocalBusiness");
const pickupService = pickupSchema["@graph"].find((entry) => entry["@type"] === "Service");
assert.deepEqual(pickupService?.provider, { "@id": `${SITE_URL}/#localbusiness` }, "pickup Service should be provided by the actual LocalBusiness");
assert.deepEqual(pickupService?.areaServed, ["공항동", "김포공항", "송정역"], "pickup Service should identify its local area");
const pickupItemList = pickupSchema["@graph"].find((entry) => entry["@type"] === "ItemList");
assert.deepEqual(
  pickupItemList?.itemListElement?.map((item) => [item.name, item.url]),
  [
    ["브루키", `${SITE_URL}/brookie/`],
    ["수제꾸덕쿠키", `${SITE_URL}/out/`],
    ["행운쿠키", `${SITE_URL}/out/fortune/`],
    ["쿠키크루", `${SITE_URL}/cookie-crew/`],
    ["COOKIE FLIGHT", `${SITE_URL}/products/cookie-flight/`]
  ],
  "pickup ItemList should match the five pickup order products"
);
const pickupFaq = pickupSchema["@graph"].find((entry) => entry["@type"] === "FAQPage");
assert.equal(pickupFaq?.mainEntity?.length, 7, "pickup FAQPage should contain seven AEO questions");
const pickupProductsQuestion = pickupFaq?.mainEntity?.find((item) => item.name === "김포공항 디저트 선물은 어떤 제품이 있나요?");
for (const productName of ["브루키", "수제꾸덕쿠키", "행운쿠키", "쿠키크루", "COOKIE FLIGHT"]) {
  assert.match(pickupProductsQuestion?.acceptedAnswer?.text || "", new RegExp(productName), `pickup FAQ should list ${productName}`);
}
const pickupFlightQuestion = pickupFaq?.mainEntity?.find((item) => item.name === "김포공항 근처에서 비행기 모양 쿠키를 살 수 있나요?");
assert.ok(pickupFlightQuestion, "pickup FAQ should answer the airplane-shaped cookie question");
for (const flavor of ["COOKIE FLIGHT", "클래식버터", "더블초코", "제주말차", "오렌지", "김포공항 내부 매장이 아니며", "공항동 작업실"]) {
  assert.match(pickupFlightQuestion?.acceptedAnswer?.text || "", new RegExp(flavor), `pickup airplane-cookie FAQ should include ${flavor}`);
}
const reservationQuestion = pickupFaq?.mainEntity?.find((item) => item.name === "예약 없이 바로 구매할 수 있나요?");
assert.match(reservationQuestion?.acceptedAnswer?.text || "", /예약 픽업 전용/);
assert.match(reservationQuestion?.acceptedAnswer?.text || "", /예약 없이 방문/);
assert.match(pickupHtml, /예약 픽업 전용 작업실/);
assert.match(pickupHtml, /예약 없이 방문하면 현장 구매가 어렵습니다/);
assert.match(pickupHtml, /홈[\s\S]*김포공항 디저트 선물·픽업/, "pickup should expose a visible breadcrumb");
assert.match(pickupHtml, /김포공항 내부 매장이 아니며 방문 전 픽업 예약이 필요합니다/, "pickup answer-first should clarify the reservation-only location");
assert.match(pickupHtml, /원하는 쿠키를 먼저 고르고 픽업 날짜를 예약한 뒤 공항동 작업실에서 수령하면 됩니다/, "pickup quick answer should explain the reservation flow directly");
assert.match(pickupHtml, /픽업으로 준비하는 쿠키를[\s\S]*먼저 확인해보세요/, "pickup should include first-party proof");
assert.match(pickupHtml, /class="nm-pickup-proof-grid"[^>]*data-live-gallery-preview[^>]*data-archive-href="\.\.\/#actual-cases"[^>]*data-gallery-preview-limit="3"/, "pickup proof should use the live homepage archive preview");
assert.match(pickupHtml, /href="\.\.\/#actual-cases">메인에서 최근 제작 아카이브 보기 →<\/a>/, "pickup proof should link to the homepage production archive");
assert.match(pickupHtml, /href="\.\.\/works\/">실제 제작 사례 더 보기 →<\/a>/, "pickup proof should link to works");
assert.match(pickupHtml, /<script src="\.\.\/assets\/gallery\.js"><\/script>/, "pickup should load the shared live archive renderer");
const pickupGiftGuide = pickupHtml.match(/<section class="nm-seo-section nm-pickup-gift-guide" id="gimpo-dessert-gift-guide"[\s\S]*?<\/section>/)?.[0] || "";
assert.match(pickupGiftGuide, /여행 전 작은 선물/);
assert.match(pickupGiftGuide, /마중·배웅할 때 쿠키 선물/);
assert.match(pickupGiftGuide, /답례품·여러 개 준비할 때/);
assert.match(pickupGiftGuide, /김포공항 내부 매장이 아니라/);
assert.match(pickupGiftGuide, /공항동의 예약 픽업 전용 작업실/);
assert.match(pickupGiftGuide, /비행기를 닮은 COOKIE FLIGHT/);
assert.match(pickupGiftGuide, /브루키, 수제꾸덕쿠키, 행운쿠키, 쿠키크루, [\s\S]*COOKIE FLIGHT/);
assert.match(pickupGiftGuide, /href="\.\.\/products\/cookie-flight\/"/, "pickup gift guide should link COOKIE FLIGHT contextually");
const pickupChoiceGuide = pickupHtml.match(/<section class="nm-seo-section nm-seo-section--cream nm-pickup-choice-guide"[\s\S]*?<\/section>/)?.[0] || "";
assert.match(pickupChoiceGuide, /김포공항 가기 전 선물,[\s\S]*어떤 쿠키를 고르면 될까요/);
for (const [name, href] of [
  ["COOKIE FLIGHT", "../products/cookie-flight/"],
  ["브루키", "../brookie/"],
  ["수제꾸덕쿠키", "../out/"],
  ["행운쿠키", "../out/fortune/"],
  ["쿠키크루", "../cookie-crew/"]
]) {
  assert.match(pickupChoiceGuide, new RegExp(`<h3>${name}<\\/h3>[\\s\\S]*?href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `pickup choice guide should link ${name}`);
}
const pickupHrefPaths = [...pickupHtml.matchAll(/<a\b[^>]*href="([^"]+)"/gi)]
  .map((match) => new URL(match[1], `${SITE_URL}${pickupPath}`).pathname);
for (const pathname of ["/products/cookie-flight/", "/brookie/", "/out/", "/out/fortune/", "/cookie-crew/", "/works/", "/bulk/", "/magok-cookie/"]) {
  assert.ok(pickupHrefPaths.includes(pathname), `pickup should provide a contextual link to ${pathname}`);
}
for (const forbidden of ["김포공항 매장", "김포공항점", "공항 내 매장", "김포공항 안에"]) {
  assert.equal(pickupHtml.includes(forbidden), false, `pickup page contains forbidden location claim: ${forbidden}`);
}
const pickupFaqMarkup = pickupHtml.match(/<div class="nm-pickup-faq-list">([\s\S]*?)<\/div>/)?.[1] || "";
const pickupVisibleFaq = [...pickupFaqMarkup.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
  .map((match) => ({ name: cleanText(match[1]), text: cleanText(match[2]) }));
assert.deepEqual(
  pickupVisibleFaq,
  pickupFaq?.mainEntity?.map((item) => ({ name: item.name, text: item.acceptedAnswer?.text })) || [],
  "pickup visible FAQ and FAQPage should remain synchronized"
);

const homeHtml = readHtml(filePathForPathname("/"));
assert.match(getAttribute(homeHtml, /<title>([\s\S]*?)<\/title>/i), /낫띵메터스.*수제쿠키.*김포공항/);
assert.match(getMeta(homeHtml, "name", "description"), /서울 강서구 공항동/);
assert.match(homeHtml, /서울특별시 강서구 송정로 25 1층/);
assert.match(homeHtml, /예약 제작 · 예약 픽업 전용/);
assert.match(homeHtml, /href="guides\/">쿠키 선물·답례품 가이드 →<\/a>/);
assert.equal((homeHtml.match(/data-analytics-label="COOKIE FLIGHT"/g) || []).length, 1, "home should show COOKIE FLIGHT exactly once");
assert.match(homeHtml, /href="products\/cookie-flight\/"/, "home COOKIE FLIGHT card should use its public product URL");
assert.match(homeHtml, /href="pickup\/">김포공항 디저트 선물·픽업 안내 →<\/a>/, "home should use a descriptive pickup hub anchor");
assert.match(homeHtml, /김포공항·송정역 인근 공항동의 예약 픽업과 마곡 답례품·기업행사 상담/, "home visit copy should clarify both local intent hubs");
const homeSchema = getStaticSchema(homeHtml);
const homeWebPage = homeSchema["@graph"].find((item) => item["@type"] === "CollectionPage");
assert.deepEqual(homeWebPage?.about, { "@id": `${SITE_URL}/#localbusiness` }, "homepage should identify the actual LocalBusiness");
const homeBakery = homeSchema["@graph"].find((item) => item["@type"] === "Bakery");
assert.deepEqual(homeBakery?.geo, { "@type": "GeoCoordinates", latitude: 37.557402, longitude: 126.8115357 }, "Bakery geo should match business facts");
const corporateHtml = readHtml(filePathForPathname("/guides/corporate-event-cookie/"));
assert.match(corporateHtml, /href="\.\.\/\.\.\/magok-cookie\/">마곡 답례품·기업행사 안내<\/a>/, "corporate guide should expose its Magok contextual link");
const smallGiftHtml = readHtml(filePathForPathname("/small-gift/"));
assert.match(smallGiftHtml, /href="\.\.\/magok-cookie\/">마곡 답례품·쿠키 선물 안내 →<\/a>/, "small gift hub should link once to the Magok favor guide");
const dessertGiftHtml = readHtml(filePathForPathname("/guides/dessert-gift-set/"));
assert.match(dessertGiftHtml, /href="\.\.\/\.\.\/pickup\/">김포공항 디저트 선물·픽업 안내 →<\/a>/, "dessert gift guide should link to pickup");
const bulkHtml = readHtml(filePathForPathname("/bulk/"));
assert.match(bulkHtml, /href="\.\.\/magok-cookie\/">마곡 답례품·기업행사 안내 →<\/a>/, "bulk should link to Magok favor guidance");
const worksHtml = readHtml(filePathForPathname("/works/"));
assert.match(worksHtml, /id="works-answer-first"/, "works should expose an answer-first evidence explanation");
assert.match(worksHtml, /관리자가 입력하지 않은 정보는 자동으로 추정하지 않습니다\./, "works should explain that missing metadata is not inferred");
assert.match(worksHtml, /href="\.\.\/magok-cookie\/">마곡 답례품·쿠키 선물 안내 →<\/a>/, "works should link to Magok favor guidance");
assert.match(worksHtml, /href="\.\.\/pickup\/">김포공항 디저트 선물·픽업 안내 →<\/a>/, "works should link to pickup guidance");
assert.match(worksHtml, /실제 제작 사례를 본 뒤 수령 흐름 확인/, "works pickup CTA should explain the next step");
assert.match(worksHtml, /회사·행사 목적이라면 마곡 안내 확인/, "works Magok CTA should explain the next step");
const worksSchema = getStaticSchema(worksHtml);
const worksWebPage = worksSchema["@graph"].find((entry) => entry["@type"] === "CollectionPage");
assert.equal(worksWebPage?.dateModified, "2026-09-22", "works dateModified should match the registry");
const visibleWorkCards = [...worksHtml.matchAll(/<article class="nm-work-card">([\s\S]*?)<\/article>/g)].map((match) => {
  const card = match[1];
  const label = cleanText(card.match(/<p>([\s\S]*?)<\/p>/i)?.[1] || "");
  const href = card.match(/<a\b[^>]*href="([^"]+)"/i)?.[1] || "";
  return { label, href: href ? new URL(href, `${SITE_URL}/works/`).pathname : "" };
});
const detailOrder = ["용도", "관련 제품", "지역/행사 유형", "포장 또는 문구 여부", "수령 방식"];
for (const [index, match] of [...worksHtml.matchAll(/<article class="nm-work-card">([\s\S]*?)<\/article>/g)].entries()) {
  const labels = [...match[1].matchAll(/<dt>([^<]+)<\/dt>/g)].map((detail) => detail[1]);
  assert.deepEqual(labels, [...labels].sort((a, b) => detailOrder.indexOf(a) - detailOrder.indexOf(b)), `works card ${index + 1} metadata should use the standard order`);
  assert.equal(labels.some((label) => !detailOrder.includes(label)), false, `works card ${index + 1} should only use standard metadata fields`);
  assert.doesNotMatch(match[1], /<dd>\s*<\/dd>/, `works card ${index + 1} should not render empty metadata values`);
}
assert.deepEqual(
  visibleWorkCards,
  (sitePages.works || []).map((work) => {
    const entry = registryEntries.get(normalizePathname(work.href));
    return { label: work.workCardLabel || entry?.workCardLabel || work.caption, href: work.href };
  }),
  "works visible cards should be generated from the registry-backed works list"
);
assert.ok(visibleWorkCards.every((card) => registryEntries.has(normalizePathname(card.href))), "every work card link must exist in the registry");
const worksItemList = worksSchema["@graph"].find((entry) => entry["@type"] === "ItemList");
assert.deepEqual(
  worksItemList?.itemListElement?.map((item) => ({ label: item.name, href: new URL(item.url).pathname })),
  visibleWorkCards,
  "works ItemList should describe the visible production cases rather than guide links"
);
const worksFaq = worksSchema["@graph"].find((entry) => entry["@type"] === "FAQPage");
const worksFaqMarkup = worksHtml.match(/<section[^>]+class="[^"]*nm-works-faq[^"]*"[\s\S]*?<\/section>/)?.[0] || "";
const visibleWorksFaq = [...worksFaqMarkup.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
  .map((match) => ({ name: cleanText(match[1]), text: cleanText(match[2]) }));
assert.deepEqual(
  visibleWorksFaq,
  worksFaq?.mainEntity?.map((item) => ({ name: item.name, text: item.acceptedAnswer?.text })) || [],
  "works visible FAQ and FAQPage should remain synchronized"
);
assert.equal(visibleWorksFaq.length, 3, "works should expose three evidence FAQ entries");
assert.doesNotMatch(worksHtml, /사진과 같은 구성을 그대로 주문할 수 있습니다/, "works must not guarantee that a past configuration is currently orderable");
for (const href of ["../guides/corporate-event-cookie/", "../guides/wedding-favor-cookie/", "../out/fortune/", "../products/brownie-cookie/"]) {
  assert.equal(worksHtml.includes(`href="${href}"`), true, `works should preserve contextual link ${href}`);
}
const llms = fs.readFileSync(path.join(ROOT, "llms.txt"), "utf8");
assert.equal(llms.includes("in-store pickup"), false, "llms should not describe pickup as an in-store purchase");
assert.match(llms, /reservation pickup at the Gonghang-dong workshop or vehicle quick consultation depending on schedule and quantity/);
assert.match(llms, /Official Naver Place: https:\/\/naver\.me\/Gsj2pwAu/);

console.log(`public SEO checks: passed ${locs.length} sitemap URLs, ${sourceHtmlEntries.length} discovered public HTML files`);
