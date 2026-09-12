"use strict";

const WORDPRESS_ORIGIN = "https://blog.nothingmatters.co.kr";
const WORDPRESS_POSTS_ENDPOINT = `${WORDPRESS_ORIGIN}/wp-json/wp/v2/posts?_embed=1&per_page=3&page=1`;
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_POSTS = 3;

function decodeEntities(value = "") {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(nbsp|amp|quot|apos|#39|lt|gt);/gi, (_, entity) => {
      const entities = {
        nbsp: " ",
        amp: "&",
        quot: '"',
        apos: "'",
        "#39": "'",
        lt: "<",
        gt: ">"
      };
      return entities[entity.toLowerCase()] || " ";
    });
}

function cleanText(value, maxLength) {
  const withoutHtml = String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  const normalized = decodeEntities(withoutHtml).replace(/\s+/g, " ").trim();
  return Array.from(normalized).slice(0, maxLength).join("").trim();
}

function safeWordpressUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.hostname !== new URL(WORDPRESS_ORIGIN).hostname) return "";
    return url.href;
  } catch {
    return "";
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul"
  }).format(date);
}

function getCategory(post) {
  const terms = post?._embedded?.["wp:term"];
  const category = Array.isArray(terms)
    ? terms.flat().find((term) => term?.taxonomy === "category" && term?.name)
    : null;
  return cleanText(category?.name || "JOURNAL", 42) || "JOURNAL";
}

function mapPost(post) {
  if (!post || typeof post !== "object") return null;
  const title = cleanText(post.title?.rendered, 110);
  const url = safeWordpressUrl(post.link);
  if (!title || !url) return null;

  const featuredMedia = Array.isArray(post._embedded?.["wp:featuredmedia"])
    ? post._embedded["wp:featuredmedia"][0]
    : null;
  const image = safeWordpressUrl(featuredMedia?.source_url);

  return {
    title,
    excerpt: cleanText(post.excerpt?.rendered, 180),
    category: getCategory(post),
    date: formatDate(post.date),
    url,
    image
  };
}

async function fetchPosts(fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("wordpress_timeout"));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(WORDPRESS_POSTS_ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      }),
      timeout
    ]);
    if (!response?.ok) throw new Error(`wordpress_status_${response?.status || "unknown"}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("wordpress_malformed_payload");
    return payload.map(mapPost).filter(Boolean).slice(0, MAX_POSTS);
  } finally {
    clearTimeout(timeoutId);
  }
}

function createWordpressJournalService({
  fetchImpl = global.fetch,
  now = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS
} = {}) {
  let cache = null;

  return {
    async getLatestPosts() {
      const timestamp = now();
      if (cache && timestamp - cache.timestamp < cacheTtlMs) {
        return { items: cache.items, source: "memory", stale: false };
      }

      try {
        const items = await fetchPosts(fetchImpl, timeoutMs);
        if (!items.length) throw new Error("wordpress_empty_payload");
        cache = { items, timestamp };
        return { items, source: "live", stale: false };
      } catch {
        if (cache) return { items: cache.items, source: "memory", stale: true };
        return { items: [], source: "fallback", stale: false };
      }
    }
  };
}

module.exports = {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TIMEOUT_MS,
  MAX_POSTS,
  WORDPRESS_ORIGIN,
  WORDPRESS_POSTS_ENDPOINT,
  cleanText,
  createWordpressJournalService,
  mapPost,
  safeWordpressUrl
};
