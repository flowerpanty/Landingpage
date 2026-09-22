import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_PRIMARY_IMAGE_BYTES = 1024 * 1024;
const MAX_PICKUP_COOKIE_BYTES = 500 * 1024;
const excludedDirectories = new Set([".git", ".playwright-cli", "node_modules", "dashboard", "gallery-admin", "_handoff"]);
const excludedRelativeDirectories = new Set(["out/_next", "out/_not-found", "out/404", "out/scone"]);

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

function resolveLocalAsset(reference, htmlPath) {
  if (!reference || /^(?:https?:|data:|#)/i.test(reference)) return null;
  return path.resolve(path.dirname(htmlPath), reference.split(/[?#]/, 1)[0]);
}

function firstSrcsetReference(srcset = "") {
  return srcset.split(",")[0]?.trim().split(/\s+/, 1)[0] || "";
}

function imageSize(reference, htmlPath) {
  const assetPath = resolveLocalAsset(reference, htmlPath);
  if (!assetPath) return null;
  if (!fs.existsSync(assetPath)) return null;
  return fs.statSync(assetPath).size;
}

function isSmallLocalSource(reference, htmlPath) {
  const size = imageSize(reference, htmlPath);
  return size !== null && size <= MAX_PRIMARY_IMAGE_BYTES;
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
    const fallback = pictureHtml.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1] || "";

    for (const source of sources) imageSize(source, htmlPath);
    if (!fallback || !resolveLocalAsset(fallback, htmlPath)) continue;
    const fallbackSize = imageSize(fallback, htmlPath);
    if (fallbackSize > MAX_PRIMARY_IMAGE_BYTES) {
      assert.ok(
        sources.some((source) => isSmallLocalSource(source, htmlPath)),
        `${path.relative(ROOT, htmlPath)}: ${fallback} exceeds 1MB without a smaller picture source`
      );
    }
  }

  for (const image of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const imageOffset = image.index ?? 0;
    if (pictureRanges.some(([start, end]) => imageOffset >= start && imageOffset < end)) continue;
    const size = imageSize(image[1], htmlPath);
    if (size !== null) {
      assert.ok(size <= MAX_PRIMARY_IMAGE_BYTES, `${path.relative(ROOT, htmlPath)}: ${image[1]} is a direct primary image larger than 1MB`);
    }
  }
}

const pickupHtmlPath = path.join(ROOT, "pickup", "index.html");
const pickupHtml = fs.readFileSync(pickupHtmlPath, "utf8");
const pickupCard = pickupHtml.match(/<figure class="nm-pickup-cookie-thumb">([\s\S]*?)<\/figure>/i)?.[1] || "";
const pickupSource = pickupCard.match(/<source\b[^>]*\bsrcset=["']([^"']+)["'][^>]*>/i)?.[1] || "";
const pickupFallback = pickupCard.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1] || "";

assert.equal(pickupSource, "../images/pickup-cute-cookie-optimized.png", "pickup Cookie Crew card must prioritize the optimized image");
assert.equal(pickupFallback, "../images/pickup-cute-cookie.png", "pickup Cookie Crew card must retain the original PNG fallback");
const pickupOptimizedSize = imageSize(pickupSource, pickupHtmlPath);
const pickupFallbackSize = imageSize(pickupFallback, pickupHtmlPath);
assert.ok(pickupOptimizedSize != null, "optimized pickup Cookie Crew image must exist");
assert.ok(pickupFallbackSize != null, "pickup Cookie Crew fallback image must exist");
assert.ok(pickupOptimizedSize <= MAX_PICKUP_COOKIE_BYTES, "optimized pickup Cookie Crew image must be 500KB or smaller");
assert.ok(pickupFallbackSize > MAX_PRIMARY_IMAGE_BYTES, "pickup Cookie Crew fallback fixture should remain a large source image");

console.log(`public performance checks: passed ${discoverHtmlFiles().length} pages`);
