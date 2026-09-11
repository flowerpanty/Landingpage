import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://nothingmatters.co.kr";
const INSTAGRAM_URL = "https://instagram.com/nothingmatters_c";
const products = JSON.parse(fs.readFileSync(path.join(ROOT, "data/products.json"), "utf8"));
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>(https:\/\/nothingmatters\.co\.kr[^<]+)<\/loc>/g)].map((match) => match[1]);

function filePathForUrl(loc) {
  const pathname = new URL(loc).pathname;
  return path.join(ROOT, pathname === "/" ? "index.html" : pathname.slice(1), pathname === "/" ? "" : "index.html");
}

function getAttribute(html, pattern) {
  return html.match(pattern)?.[1]?.trim() || "";
}

function getMeta(html, attribute, value) {
  return getAttribute(
    html,
    new RegExp(`<meta[^>]+${attribute}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["']`, "i")
  );
}

function getStaticSchema(html) {
  const match = html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/);
  assert.ok(match, "missing static JSON-LD");
  return JSON.parse(match[1]);
}

assert.equal(new Set(locs).size, locs.length, "sitemap contains duplicate URLs");
for (const loc of locs) {
  const pathname = new URL(loc).pathname;
  assert.equal(/^\/(?:gallery-admin|dashboard|api)(?:\/|$)/.test(pathname), false, `non-public sitemap URL: ${pathname}`);

  const filePath = filePathForUrl(loc);
  assert.equal(fs.existsSync(filePath), true, `missing public HTML: ${filePath}`);
  const html = fs.readFileSync(filePath, "utf8");

  assert.ok(getAttribute(html, /<title>([\s\S]*?)<\/title>/i), `${pathname}: missing title`);
  assert.ok(getMeta(html, "name", "description"), `${pathname}: missing description`);
  assert.ok(getMeta(html, "name", "robots"), `${pathname}: missing robots`);
  assert.equal(getAttribute(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i), loc, `${pathname}: invalid canonical`);
  for (const property of ["og:title", "og:description", "og:url", "og:image"]) {
    assert.ok(getMeta(html, "property", property), `${pathname}: missing ${property}`);
  }
  assert.ok(getMeta(html, "name", "twitter:card"), `${pathname}: missing twitter card`);
  assert.ok(getAttribute(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i), `${pathname}: missing h1`);

  const schema = getStaticSchema(html);
  const graph = schema["@graph"] || [];
  for (const type of ["Organization", "Bakery"]) {
    const entity = graph.find((item) => item["@type"] === type);
    assert.ok(entity?.sameAs?.includes(INSTAGRAM_URL), `${pathname}: ${type} missing Instagram`);
  }

  for (const product of graph.filter((item) => item["@type"] === "Product")) {
    if (product.offers) {
      assert.ok(product.offers.priceCurrency, `${pathname}: Product offer missing currency`);
      assert.ok(product.offers.price != null || product.offers.lowPrice != null, `${pathname}: Product offer missing price`);
    }
  }
}

for (const product of products) {
  assert.ok(locs.includes(`${SITE_URL}${product.detailPath}`), `sitemap missing product: ${product.detailPath}`);
}

for (const requiredRoute of ["/works/", "/pickup/"]) {
  assert.ok(locs.includes(`${SITE_URL}${requiredRoute}`), `sitemap missing route: ${requiredRoute}`);
}

console.log(`public SEO checks: passed ${locs.length} URLs`);
