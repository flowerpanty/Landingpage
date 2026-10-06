import assert from "node:assert/strict";
import fs from "node:fs";

// Read-only deployment check. Never submit an order or access admin/customer data.
const site = "https://nothingmatters.co.kr";
const oldSite = "https://thingmattersreserve-production.up.railway.app";
const products = JSON.parse(fs.readFileSync(new URL("../data/site-pages.json", import.meta.url), "utf8")).orderProducts;
async function get(url) {
  return fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
}

const hub = await get(`${site}/order`);
assert.equal(hub.status, 200, "Deploy the main site first: /order must return 200");
assert.equal(hub.headers.get("location"), null, "/order must render without a redirect");
assert.doesNotMatch(hub.headers.get("x-robots-tag") || "", /noindex/i);
const html = await hub.text();
assert.match(html, /rel="canonical" href="https:\/\/nothingmatters\.co\.kr\/order"/);
assert.match(html, /name="robots" content="index,follow/);
assert.doesNotMatch(html, /<iframe|http-equiv=["']refresh/i);
for (const product of products) {
  const pathname = `/order/${product.slug}`;
  assert.ok(html.includes(`href="${pathname}"`), `Missing internal order link: ${pathname}`);
  assert.equal((await get(`${site}${pathname}`)).status, 200, `Order UI unavailable: ${pathname}`);
}
for (const match of html.matchAll(/src="(\/order\/assets\/[^"$]+)"/g)) {
  assert.equal((await get(`${site}${match[1]}`)).status, 200, `Image unavailable: ${match[1]}`);
}
const sitemapResponse = await get(`${site}/sitemap.xml`);
assert.equal(sitemapResponse.status, 200);
assert.ok((await sitemapResponse.text()).includes(`<loc>${site}/order</loc>`));
const robotsResponse = await get(`${site}/robots.txt`);
assert.equal(robotsResponse.status, 200);
assert.doesNotMatch(await robotsResponse.text(), /Disallow:\s*\/order/i);
assert.equal((await get(`${site}/api/landing-orders`)).status, 405, "The public order API adapter must be deployed (GET is intentionally rejected)");
console.log("Main /order, seven forms, images, canonical, sitemap, robots and API adapter: deployed. No order submitted.");

const old = await get(`${oldSite}/order`);
if (process.argv.includes("--require-redirect")) {
  assert.equal(old.status, 301, "After main-site verification, enable ORDER_PAGE_REDIRECT_ENABLED=1 on Railway");
  assert.equal(old.headers.get("location"), `${site}/order`);
  console.log("Legacy /order: permanent 301 to the main URL. Duplicate public hub removed.");
} else {
  console.log(`Legacy /order status: ${old.status}. Enable its 301 only after main-site verification, then rerun with --require-redirect.`);
}
