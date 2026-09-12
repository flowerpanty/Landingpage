import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  MAX_POSTS,
  WORDPRESS_POSTS_ENDPOINT,
  createWordpressJournalService,
  mapPost
} = require("../lib/wordpress-journal.js");

const makePost = (overrides = {}) => ({
  title: { rendered: "<strong>쿠키 &amp; 선물</strong>" },
  excerpt: { rendered: "<p>짧은 <em>요약</em> &amp; 안내</p>" },
  content: { rendered: "<p>홈에는 절대 쓰면 안 되는 전문</p>" },
  link: "https://blog.nothingmatters.co.kr/journal/example/",
  date: "2026-09-12T09:00:00",
  _embedded: {
    "wp:featuredmedia": [{ source_url: "https://blog.nothingmatters.co.kr/wp-content/uploads/example.jpg" }],
    "wp:term": [[{ taxonomy: "category", name: "<b>선물</b>" }]]
  },
  ...overrides
});

const mapped = mapPost(makePost());
assert.equal(mapped.title, "쿠키 & 선물");
assert.equal(mapped.excerpt, "짧은 요약 & 안내");
assert.equal(mapped.category, "선물");
assert.equal(mapped.image, "https://blog.nothingmatters.co.kr/wp-content/uploads/example.jpg");
assert.equal("content" in mapped, false);

const journalClient = fs.readFileSync(path.join(ROOT, "assets/journal.js"), "utf8");
assert.match(journalClient, /\.textContent\s*=/);
assert.doesNotMatch(journalClient, /\.innerHTML\s*=/);

const missingImage = mapPost(makePost({ _embedded: { "wp:term": [[]] } }));
assert.equal(missingImage.image, "");
assert.equal(missingImage.category, "JOURNAL");
assert.equal(mapPost(makePost({ link: "javascript:alert(1)" })), null);

let currentTime = 1_000;
const normalFetch = async (url) => {
  assert.equal(url, WORDPRESS_POSTS_ENDPOINT);
  return { ok: true, json: async () => Array.from({ length: 4 }, (_, index) => makePost({ link: `https://blog.nothingmatters.co.kr/journal/${index}/` })) };
};
const service = createWordpressJournalService({ fetchImpl: normalFetch, now: () => currentTime, cacheTtlMs: 100 });
const live = await service.getLatestPosts();
assert.equal(live.source, "live");
assert.equal(live.items.length, MAX_POSTS);

currentTime += 101;
let staleFetch = async () => ({ ok: true, json: async () => [makePost()] });
const staleService = createWordpressJournalService({
  fetchImpl: (...args) => staleFetch(...args),
  now: () => currentTime,
  cacheTtlMs: 1
});
await staleService.getLatestPosts();
currentTime += 2;
staleFetch = async () => { throw new Error("offline"); };
const stale = await staleService.getLatestPosts();
assert.equal(stale.source, "memory");
assert.equal(stale.stale, true);
assert.equal(stale.items.length, 1);

for (const fetchImpl of [
  async () => ({ ok: false, status: 500, json: async () => [] }),
  async () => { throw new Error("offline"); },
  async () => ({ ok: true, json: async () => ({ malformed: true }) }),
  () => new Promise(() => {})
]) {
  const fallback = await createWordpressJournalService({ fetchImpl, timeoutMs: 5 }).getLatestPosts();
  assert.equal(fallback.source, "fallback");
  assert.deepEqual(fallback.items, []);
}

console.log("wordpress journal checks: passed");
