import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://nothingmatters.co.kr";
const SITE_PAGES = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site-pages.json"), "utf8"));
const FEED_PATH = path.join(ROOT, "feed.xml");
const isCheckMode = process.argv.includes("--check");

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanText(value = "") {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function filePathForRoute(route) {
  return path.join(ROOT, route === "/" ? "index.html" : route.slice(1), route === "/" ? "" : "index.html");
}

function readPageMetadata(route) {
  const html = fs.readFileSync(filePathForRoute(route), "utf8");
  const title = cleanText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = cleanText(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || ""
  );

  if (!title || !description) throw new Error(`${route}: feed metadata is incomplete`);
  return { title, description };
}

function toRfc822Date(date) {
  return new Date(`${date}T00:00:00+09:00`).toUTCString();
}

const guideEntries = (SITE_PAGES.pages || [])
  .filter((page) => (
    page.path.startsWith("/guides/")
    && page.path !== "/guides/"
    && page.status === "active"
    && page.indexing === "index"
  ))
  .map((page) => ({ ...page, ...readPageMetadata(page.path) }))
  .sort((left, right) => right.lastmod.localeCompare(left.lastmod) || left.path.localeCompare(right.path));

if (!guideEntries.length) throw new Error("feed.xml: no indexable guide entries are available");

const lastBuildDate = toRfc822Date(guideEntries[0].lastmod);
const items = guideEntries.map((entry) => {
  const url = `${SITE_URL}${entry.path}`;
  return `    <item>\n      <title>${escapeXml(entry.title)}</title>\n      <link>${url}</link>\n      <guid isPermaLink="true">${url}</guid>\n      <pubDate>${toRfc822Date(entry.lastmod)}</pubDate>\n      <description>${escapeXml(entry.description)}</description>\n    </item>`;
}).join("\n");

const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>nothingmatters 쿠키 가이드</title>\n    <link>${SITE_URL}/guides/</link>\n    <description>낫띵메터스의 쿠키 선물, 답례품, 보관방법 가이드입니다.</description>\n    <language>ko-KR</language>\n    <lastBuildDate>${lastBuildDate}</lastBuildDate>\n    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />\n${items}\n  </channel>\n</rss>\n`;

if (isCheckMode) {
  if (!fs.existsSync(FEED_PATH) || fs.readFileSync(FEED_PATH, "utf8") !== feed) {
    throw new Error("feed.xml is out of date with indexable guides");
  }
  console.log(`feed: checked ${guideEntries.length} guide entries`);
} else {
  fs.writeFileSync(FEED_PATH, feed);
  console.log(`feed: wrote ${guideEntries.length} guide entries`);
}
