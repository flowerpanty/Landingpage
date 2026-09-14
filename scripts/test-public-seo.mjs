import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://nothingmatters.co.kr";
const INSTAGRAM_URL = "https://instagram.com/nothingmatters_c";
const sitePages = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site-pages.json"), "utf8"));
const products = (sitePages.products || []).map((product) => ({
  ...product,
  detailPath: product.primaryUrl
}));
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>(https:\/\/nothingmatters\.co\.kr[^<]+)<\/loc>/g)].map((match) => match[1]);
const locSet = new Set(locs);
const htmlCache = new Map();
const sourceHtmlEntries = discoverSourceHtmlEntries();
const registryEntries = new Map();

for (const page of sitePages.pages || []) {
  registryEntries.set(normalizePathname(page.path), page);
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

const registrySitemapLocs = [...registryEntries.values()]
  .filter((page) => page.sitemap)
  .map((page) => `${SITE_URL}${normalizePathname(page.path)}`);

function filePathForUrl(loc) {
  const pathname = new URL(loc).pathname;
  return path.join(ROOT, pathname === "/" ? "index.html" : pathname.slice(1), pathname === "/" ? "" : "index.html");
}

function normalizePathname(pathname) {
  const value = String(pathname || "/").trim() || "/";
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

  if (isIndexFollow(html)) {
    assert.ok(canonical, `${entry.pathname}: missing canonical`);
    assert.equal(canonical, `${SITE_URL}${entry.pathname}`, `${entry.pathname}: canonical must match source path`);
    assert.ok(locSet.has(canonical), `${entry.pathname}: index,follow page missing from sitemap`);
  } else if (registryEntry.indexing === "noindex") {
    assert.match(getRobots(html), /\bnoindex\b/, `${entry.pathname}: noindex registry entry must emit noindex robots`);
  }

  assertLocalInternalLinksResolve(entry, html);
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

assert.equal(
  sourceHtmlEntries.some((entry) => entry.pathname.startsWith("/_handoff/")),
  false,
  "handoff source files must not be discovered as public pages"
);
assert.match(fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8"), /^_handoff\/$/m, "handoff files must stay out of deploy commits");
assert.match(
  sitemap,
  /<loc>https:\/\/nothingmatters\.co\.kr\/guides\/<\/loc>\s*<lastmod>2026-09-14<\/lastmod>/,
  "guides sitemap lastmod should reflect the cookie storage guide entry"
);

const cookieStorageSchema = getStaticSchema(readHtml(filePathForPathname("/guides/cookie-storage/")));
const cookieStorageBreadcrumb = cookieStorageSchema["@graph"].find((entry) => entry["@type"] === "BreadcrumbList");
assert.equal(
  cookieStorageBreadcrumb?.itemListElement?.at(-1)?.name,
  "쿠키 보관법·소비기한 확인",
  "cookie storage breadcrumb should use its search-intent name"
);

console.log(`public SEO checks: passed ${locs.length} sitemap URLs, ${sourceHtmlEntries.length} discovered public HTML files`);
