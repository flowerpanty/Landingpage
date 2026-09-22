import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_PRIMARY_IMAGE_BYTES = 500 * 1024;
const MAX_PICKUP_COOKIE_BYTES = 500 * 1024;
const SITE_ORIGIN = "https://nothingmatters.co.kr";
const excludedDirectories = new Set([".git", ".playwright-cli", "node_modules", "dashboard", "gallery-admin", "_handoff"]);
const excludedRelativeDirectories = new Set(["out/_next", "out/_not-found", "out/404", "out/scone"]);
const effectiveBaseUrlByHtmlPath = new Map();

function discoverHtmlFiles(directory = ROOT, relativeDirectory = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    const relativePath = path.join(relativeDirectory, entry.name).split(path.sep).join("/");
    if (entry.isDirectory() && !excludedRelativeDirectories.has(relativePath)) {
      files.push(...discoverHtmlFiles(filePath, relativePath));
    }
    else if (entry.name === "index.html" || entry.name === "404.html") files.push(filePath);
  }
  return files;
}

function publicPathnameForHtml(htmlPath) {
  const relativePath = path.relative(ROOT, htmlPath).split(path.sep).join("/");
  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath}`;
}

function getEffectiveBaseUrl(htmlPath) {
  if (effectiveBaseUrlByHtmlPath.has(htmlPath)) return effectiveBaseUrlByHtmlPath.get(htmlPath);

  const documentUrl = new URL(publicPathnameForHtml(htmlPath), SITE_ORIGIN);
  const html = fs.readFileSync(htmlPath, "utf8");
  const baseHref = html.match(/<base\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1];
  const effectiveBaseUrl = new URL(baseHref || documentUrl.href, documentUrl);
  effectiveBaseUrlByHtmlPath.set(htmlPath, effectiveBaseUrl);
  return effectiveBaseUrl;
}

function resolveLocalAsset(reference, htmlPath) {
  if (!reference || /^(?:data:|#)/i.test(reference)) return null;
  const assetUrl = new URL(reference, getEffectiveBaseUrl(htmlPath));
  if (assetUrl.origin !== SITE_ORIGIN) return null;
  return path.join(ROOT, decodeURIComponent(assetUrl.pathname).replace(/^\/+/, ""));
}

function firstSrcsetReference(srcset = "") {
  return srcset.split(",")[0]?.trim().split(/\s+/, 1)[0] || "";
}

function imageSize(reference, htmlPath) {
  const assetPath = resolveLocalAsset(reference, htmlPath);
  if (!assetPath) return null;
  assert.ok(fs.existsSync(assetPath), `${path.relative(ROOT, htmlPath)}: local image asset is missing: ${reference}`);
  return fs.statSync(assetPath).size;
}

function isSmallLocalSource(reference, htmlPath) {
  const size = imageSize(reference, htmlPath);
  return size !== null && size <= MAX_PRIMARY_IMAGE_BYTES;
}

function assertIntrinsicDimensions(imageTag, reference, htmlPath) {
  if (!resolveLocalAsset(reference, htmlPath)) return;
  assert.match(imageTag, /\bwidth=["']\d+["']/i, `${path.relative(ROOT, htmlPath)}: local image ${reference} is missing width`);
  assert.match(imageTag, /\bheight=["']\d+["']/i, `${path.relative(ROOT, htmlPath)}: local image ${reference} is missing height`);
}

function assertLoadingStrategy(imageTag, reference, htmlPath) {
  const assetPath = resolveLocalAsset(reference, htmlPath);
  if (!assetPath || !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(assetPath)) return;
  const loading = imageTag.match(/\bloading=["'](lazy|eager)["']/i)?.[1]?.toLowerCase();
  assert.ok(loading, `${path.relative(ROOT, htmlPath)}: local raster image ${reference} must declare loading`);
  assert.match(imageTag, /\bdecoding=["']async["']/i, `${path.relative(ROOT, htmlPath)}: local raster image ${reference} must decode asynchronously`);
  if (loading === "eager") {
    assert.match(imageTag, /\bfetchpriority=["']high["']/i, `${path.relative(ROOT, htmlPath)}: eager local raster image ${reference} must be high priority`);
  }
}

for (const htmlPath of discoverHtmlFiles()) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const pictureRanges = [];

  for (const picture of html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)) {
    const pictureHtml = picture[0];
    const pictureOffset = picture.index ?? 0;
    pictureRanges.push([pictureOffset, pictureOffset + pictureHtml.length]);
    const sources = [...pictureHtml.matchAll(/<source\b[^>]*\bsrcset=["']([^"']+)["'][^>]*>/gi)]
      .map((source) => firstSrcsetReference(source[1]))
      .filter(Boolean);
    const fallbackImage = pictureHtml.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
    const fallback = fallbackImage?.[1] || "";

    for (const source of sources) imageSize(source, htmlPath);
    if (!fallback || !resolveLocalAsset(fallback, htmlPath)) continue;
    assertIntrinsicDimensions(fallbackImage?.[0] || "", fallback, htmlPath);
    assertLoadingStrategy(fallbackImage?.[0] || "", fallback, htmlPath);
    const fallbackSize = imageSize(fallback, htmlPath);
    if (fallbackSize > MAX_PRIMARY_IMAGE_BYTES) {
      assert.ok(
        sources.some((source) => isSmallLocalSource(source, htmlPath)),
        `${path.relative(ROOT, htmlPath)}: ${fallback} exceeds 500KB without a smaller picture source`
      );
    }
  }

  for (const image of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const imageOffset = image.index ?? 0;
    if (pictureRanges.some(([start, end]) => imageOffset >= start && imageOffset < end)) continue;
    const size = imageSize(image[1], htmlPath);
    if (size !== null) {
      assertIntrinsicDimensions(image[0], image[1], htmlPath);
      assertLoadingStrategy(image[0], image[1], htmlPath);
      assert.ok(size <= MAX_PRIMARY_IMAGE_BYTES, `${path.relative(ROOT, htmlPath)}: ${image[1]} is a direct primary image larger than 500KB`);
    }
  }
}

const pickupHtmlPath = path.join(ROOT, "pickup", "index.html");
assert.equal(
  resolveLocalAsset("/images/pickup-cute-cookie-optimized.png", pickupHtmlPath),
  path.join(ROOT, "images", "pickup-cute-cookie-optimized.png"),
  "root-relative assets must resolve from the workspace root"
);
const brookieHtmlPath = path.join(ROOT, "brookie", "index.html");
const brookieHtml = fs.readFileSync(brookieHtmlPath, "utf8");
assert.match(brookieHtml, /<base\s+href=["']\.\.\/["']\s*\/>/i, "brookie should retain its document base URL");
assert.equal(getEffectiveBaseUrl(brookieHtmlPath).href, `${SITE_ORIGIN}/`, "brookie base URL should resolve from /brookie/ to the site root");
const brookieWeddingImage = "images/wedding-case-03.jpeg";
assert.equal(
  resolveLocalAsset(brookieWeddingImage, brookieHtmlPath),
  path.join(ROOT, "images", "wedding-case-03.jpeg"),
  "brookie relative image paths must resolve through its base URL"
);
assert.ok(fs.existsSync(resolveLocalAsset(brookieWeddingImage, brookieHtmlPath)), "brookie base-resolved image must exist");
const brookieHero = brookieHtml.match(/<img\b[^>]*\bsrc=["']([^"']*main-order-brookie-thumb[^"']*)["'][^>]*>/i)?.[1] || "";
assert.equal(brookieHero, "images/main-order-brookie-thumb-optimized.jpg", "brookie should use the optimized hero image");
assert.ok(imageSize(brookieHero, brookieHtmlPath) <= MAX_PRIMARY_IMAGE_BYTES, "brookie optimized hero image must be 500KB or smaller");
const pickupHtml = fs.readFileSync(pickupHtmlPath, "utf8");
const pickupCard = pickupHtml.match(/<figure class="nm-pickup-cookie-thumb">([\s\S]*?)<\/figure>/i)?.[1] || "";
const pickupSources = [...pickupCard.matchAll(/<source\b[^>]*\bsrcset=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
const pickupFallback = pickupCard.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1] || "";

assert.deepEqual(
  pickupSources,
  ["../images/pickup-cute-cookie-optimized.webp", "../images/pickup-cute-cookie-optimized.png"],
  "pickup Cookie Crew card must prioritize WebP and retain the optimized PNG fallback"
);
assert.equal(pickupFallback, "../images/pickup-cute-cookie.png", "pickup Cookie Crew card must retain the original PNG fallback");
const pickupOptimizedSize = imageSize(pickupSources[0], pickupHtmlPath);
const pickupPngFallbackSize = imageSize(pickupSources[1], pickupHtmlPath);
const pickupFallbackSize = imageSize(pickupFallback, pickupHtmlPath);
assert.ok(pickupOptimizedSize != null, "optimized pickup Cookie Crew image must exist");
assert.ok(pickupPngFallbackSize != null, "optimized PNG pickup Cookie Crew image must exist");
assert.ok(pickupFallbackSize != null, "pickup Cookie Crew fallback image must exist");
assert.ok(pickupOptimizedSize <= MAX_PICKUP_COOKIE_BYTES, "optimized pickup Cookie Crew image must be 500KB or smaller");
assert.ok(pickupPngFallbackSize <= MAX_PICKUP_COOKIE_BYTES, "optimized PNG pickup Cookie Crew image must be 500KB or smaller");
assert.ok(pickupFallbackSize > MAX_PRIMARY_IMAGE_BYTES, "pickup Cookie Crew fallback fixture should remain a large source image");

console.log(`public performance checks: passed ${discoverHtmlFiles().length} pages`);
