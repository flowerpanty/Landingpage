"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { createWordpressJournalService } = require("./lib/wordpress-journal.js");

const ROOT = process.cwd();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const CANONICAL_HOST = "nothingmatters.co.kr";
const HOME_OG_ROTATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOME_OG_IMAGE_ALT = "nothingmatters 대표 링크 썸네일";
const HOME_OG_IMAGES = [
  "/images/og-rotate-01.png",
  "/images/og-rotate-02.png",
  "/images/og-rotate-03.png",
  "/images/og-rotate-04.png"
];
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const SEARCH_CONSOLE_API_BASE = "https://www.googleapis.com/webmasters/v3";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly"
];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DASHBOARD_DAYS = 90;
const DASHBOARD_TIME_ZONE = "Asia/Seoul";
const DEFAULT_DASHBOARD_RANGE_KEY = "today";
const DASHBOARD_RANGE_PRESETS = {
  today: { days: 1, label: "오늘" },
  "7d": { days: 7, label: "7일" },
  "30d": { days: 30, label: "30일" },
  "90d": { days: 90, label: "90일" }
};
const TRACKED_DASHBOARD_EVENTS = [
  {
    name: "consult_kakao_click",
    label: "카카오 상담",
    type: "consult",
    description: "추천받기·단체 상담 버튼 클릭"
  },
  {
    name: "order_brookie_click",
    label: "브루키 주문",
    type: "order",
    description: "나만의 브루키 만들기 클릭"
  },
  {
    name: "order_cookies_click",
    label: "꾸덕쿠키 주문",
    type: "order",
    description: "수제꾸덕쿠키 주문하기 클릭"
  },
  {
    name: "order_lucky_click",
    label: "행운쿠키 주문",
    type: "order",
    description: "행운쿠키 주문하기 클릭"
  },
  {
    name: "product_click",
    label: "상품 클릭",
    type: "browse",
    description: "상품 카드 또는 상세페이지 이동"
  },
  {
    name: "order_start",
    label: "주문 시작",
    type: "order",
    description: "외부 주문 페이지로 이동"
  },
  {
    name: "consult_click",
    label: "상담 클릭",
    type: "consult",
    description: "카카오 상담 또는 상담 CTA 클릭"
  },
  {
    name: "gallery_open",
    label: "갤러리 열기",
    type: "browse",
    description: "제작 사례 갤러리 오버레이 열기"
  },
  {
    name: "guide_click",
    label: "가이드 클릭",
    type: "browse",
    description: "용도별 가이드로 이동"
  },
  {
    name: "quick_selector_click",
    label: "빠른 선택 클릭",
    type: "browse",
    description: "홈 빠른 선택 결과 클릭"
  },
  {
    name: "blog_header_click",
    label: "블로그 헤더 클릭",
    type: "browse",
    description: "헤더 BLOG 진입점 클릭"
  },
  {
    name: "blog_card_click",
    label: "블로그 글 클릭",
    type: "browse",
    description: "JOURNAL 최신 글 카드 클릭"
  },
  {
    name: "blog_footer_click",
    label: "블로그 푸터 클릭",
    type: "browse",
    description: "푸터 블로그 링크 클릭"
  },
  {
    name: "pickup_map_click",
    label: "픽업 지도 클릭",
    type: "pickup",
    description: "네이버 지도에서 픽업 주소 확인"
  },
  {
    name: "pickup_reservation_click",
    label: "픽업 예약",
    type: "pickup",
    description: "네이버플레이스 픽업 예약 진입"
  },
  {
    name: "pickup_consult_click",
    label: "픽업 상담 클릭",
    type: "consult",
    description: "픽업 일정과 수령 방식 상담"
  },
  {
    name: "cookie_care_entry_click",
    label: "보관 가이드 진입",
    type: "browse",
    description: "제품 상세에서 보관 가이드로 이동"
  },
  {
    name: "cookie_care_find_product_click",
    label: "보관 제품 찾기",
    type: "browse",
    description: "보관 가이드에서 제품 선택 시작"
  },
  {
    name: "cookie_care_kakao_subscribe_click",
    label: "보관 가이드 채널 추가",
    type: "consult",
    description: "보관 가이드에서 카카오채널 추가"
  },
  {
    name: "cookie_care_kakao_question_click",
    label: "보관 문의",
    type: "consult",
    description: "보관 가이드에서 카카오 문의"
  },
  {
    name: "cookie_care_product_discover_click",
    label: "보관 후 상품 탐색",
    type: "browse",
    description: "보관 가이드에서 상품 상세로 이동"
  }
];
const MAX_GALLERY_UPLOAD_BYTES = 8 * 1024 * 1024;
const wordpressJournal = createWordpressJournalService({
  fetchImpl: process.env.WORDPRESS_JOURNAL_OFFLINE === "1"
    ? async () => { throw new Error("wordpress_offline"); }
    : global.fetch
});
const DEFAULT_GALLERY_ITEMS = [
  {
    id: "default-handmade",
    src: "/images/case-handmade-cookie.jpeg",
    caption: "귀여운 표정을 고른 작은 선물",
    href: "/products/handmade-cookie/",
    userUploaded: false
  },
  {
    id: "default-wedding",
    src: "/images/case-wedding-favor.jpeg",
    caption: "결혼식 날 건넨 감사 쿠키",
    href: "/guides/wedding-favor-cookie/",
    userUploaded: false
  },
  {
    id: "default-corporate",
    src: "/images/case-corporate-favor.jpeg",
    caption: "브랜드 행사에 맞춘 단체 구성",
    href: "/guides/corporate-event-cookie/",
    userUploaded: false
  },
  {
    id: "default-lucky",
    src: "/images/case-lucky-cookie.jpeg",
    caption: "응원하는 마음을 담은 행운쿠키",
    href: "/products/lucky-cookie/",
    userUploaded: false
  },
  {
    id: "default-brownie",
    src: "/images/work-new-01.jpg",
    caption: "짧은 문구를 더한 브라우니",
    href: "/products/brownie-cookie/",
    userUploaded: false
  }
];

const PUBLIC_WORK_CARD_META_BY_HREF = {
  "/products/handmade-cookie/": {
    details: [["용도", "작은 선물"], ["관련 제품", "수제쿠키"]],
    actionLabel: "수제쿠키 자세히 보기 →"
  },
  "/guides/wedding-favor-cookie/": {
    details: [["용도", "결혼식 답례"], ["관련 가이드", "결혼식 답례품 쿠키"]],
    actionLabel: "결혼식 답례 가이드 보기 →"
  },
  "/guides/corporate-event-cookie/": {
    details: [["용도", "기업 행사"], ["관련 가이드", "기업행사 쿠키"]],
    actionLabel: "기업행사 가이드 보기 →"
  },
  "/products/lucky-cookie/": {
    details: [["관련 제품", "행운쿠키"]],
    actionLabel: "행운쿠키 자세히 보기 →"
  },
  "/products/brownie-cookie/": {
    details: [["관련 제품", "브라우니쿠키"]],
    actionLabel: "브라우니쿠키 자세히 보기 →"
  }
};

const LEGACY_PRODUCT_REDIRECTS = {
  "/brookie": "/products/custom-brownie-cookie/",
  "/brookie.html": "/products/custom-brownie-cookie/",
  "/cookies": "/products/handmade-cookie/",
  "/cookies.html": "/products/handmade-cookie/",
  "/lucky": "/products/lucky-cookie/",
  "/lucky.html": "/products/lucky-cookie/",
};

let googleTokenCache = {
  accessToken: "",
  expiresAt: 0
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
const TEXT_RESPONSE_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".xml",
  ".txt",
  ".svg"
]);
const HTML_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const ASSET_CACHE_CONTROL = "public, max-age=86400";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const NOT_FOUND_PAGE_PATH = path.join(ROOT, "404.html");

function getStaticCacheControl(ext) {
  return ext === ".html" ? HTML_CACHE_CONTROL : ASSET_CACHE_CONTROL;
}

function createFileEtag(stat) {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function createBufferEtag(buffer) {
  return `"${crypto.createHash("sha1").update(buffer).digest("hex")}"`;
}

function isRequestFresh(req, etag, lastModified) {
  const ifNoneMatch = String(req.headers["if-none-match"] || "").trim();
  if (ifNoneMatch) {
    return ifNoneMatch === "*" || ifNoneMatch.split(",").map((value) => value.trim()).includes(etag);
  }

  const ifModifiedSince = String(req.headers["if-modified-since"] || "").trim();
  if (!ifModifiedSince || !lastModified) return false;

  const requestTime = Date.parse(ifModifiedSince);
  const modifiedTime = Date.parse(lastModified);
  return !Number.isNaN(requestTime) && !Number.isNaN(modifiedTime) && modifiedTime <= requestTime;
}

function sendNotModified(req, res, headers) {
  res.writeHead(304, headers);
  res.end();
}

function getAcceptedContentEncoding(req) {
  const header = String(req.headers["accept-encoding"] || "").toLowerCase();
  const accepted = new Set(
    header
      .split(",")
      .map((value) => value.trim().split(";")[0])
      .filter(Boolean)
  );
  if (accepted.has("br")) return "br";
  if (accepted.has("gzip")) return "gzip";
  return "";
}

function encodeBody(buffer, encoding) {
  if (encoding === "br") return zlib.brotliCompressSync(buffer);
  if (encoding === "gzip") return zlib.gzipSync(buffer);
  return buffer;
}

function parseRangeHeader(rangeHeader, size) {
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startValue, endValue] = match;
  if (!startValue && !endValue) return null;

  let start;
  let end;

  if (!startValue) {
    const suffixLength = Number.parseInt(endValue, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number.parseInt(startValue, 10);
    end = endValue ? Number.parseInt(endValue, 10) : size - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1)
  };
}

function sendRangeNotSatisfiable(res, size, headers) {
  res.writeHead(416, {
    ...headers,
    "Content-Range": `bytes */${size}`,
    "Content-Length": 0
  });
  res.end();
}

function sendBufferResponse(req, res, statusCode, body, options) {
  const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const ext = options.ext || "";
  const etag = options.etag || createBufferEtag(rawBody);
  const lastModified = options.lastModified || new Date().toUTCString();
  const baseHeaders = {
    "Content-Type": options.contentType,
    "Cache-Control": options.cacheControl,
    ETag: etag,
    "Last-Modified": lastModified,
    ...(options.allowRange ? { "Accept-Ranges": "bytes" } : {})
  };

  if (isRequestFresh(req, etag, lastModified)) {
    sendNotModified(req, res, baseHeaders);
    return;
  }

  if (options.allowRange && req.headers.range) {
    const range = parseRangeHeader(req.headers.range, rawBody.length);
    if (!range) {
      sendRangeNotSatisfiable(res, rawBody.length, baseHeaders);
      return;
    }

    const chunk = rawBody.subarray(range.start, range.end + 1);
    res.writeHead(206, {
      ...baseHeaders,
      "Content-Range": `bytes ${range.start}-${range.end}/${rawBody.length}`,
      "Content-Length": chunk.length
    });
    res.end(req.method === "HEAD" ? undefined : chunk);
    return;
  }

  const encoding = TEXT_RESPONSE_EXTENSIONS.has(ext) ? getAcceptedContentEncoding(req) : "";
  const responseBody = encodeBody(rawBody, encoding);
  const headers = {
    ...baseHeaders,
    ...(encoding ? { "Content-Encoding": encoding, Vary: "Accept-Encoding" } : {}),
    "Content-Length": responseBody.length
  };

  res.writeHead(statusCode, headers);
  res.end(req.method === "HEAD" ? undefined : responseBody);
}

function sendFileResponse(req, res, filePath, options = {}) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const cacheControl = options.cacheControl || getStaticCacheControl(ext);
  const etag = createFileEtag(stat);
  const lastModified = stat.mtime.toUTCString();
  const baseHeaders = {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    ETag: etag,
    "Last-Modified": lastModified,
    "Accept-Ranges": "bytes"
  };

  if (isRequestFresh(req, etag, lastModified)) {
    sendNotModified(req, res, baseHeaders);
    return;
  }

  if (req.headers.range) {
    const range = parseRangeHeader(req.headers.range, stat.size);
    if (!range) {
      sendRangeNotSatisfiable(res, stat.size, baseHeaders);
      return;
    }

    res.writeHead(206, {
      ...baseHeaders,
      "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
      "Content-Length": range.end - range.start + 1
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }

  if (TEXT_RESPONSE_EXTENSIONS.has(ext)) {
    sendBufferResponse(req, res, 200, fs.readFileSync(filePath), {
      contentType,
      cacheControl,
      etag,
      lastModified,
      ext,
      allowRange: true
    });
    return;
  }

  res.writeHead(200, {
    ...baseHeaders,
    "Content-Length": stat.size
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function getNotFoundHtml() {
  if (fs.existsSync(NOT_FOUND_PAGE_PATH)) {
    return fs.readFileSync(NOT_FOUND_PAGE_PATH, "utf8");
  }
  return "<!doctype html><title>404 | NOTHINGMATTERS</title><h1>404</h1>";
}

function sendNotFound(req, res) {
  const body = Buffer.from(getNotFoundHtml());
  let lastModified = new Date().toUTCString();
  if (fs.existsSync(NOT_FOUND_PAGE_PATH)) {
    lastModified = fs.statSync(NOT_FOUND_PAGE_PATH).mtime.toUTCString();
  }
  sendBufferResponse(req, res, 404, body, {
    contentType: MIME_TYPES[".html"],
    cacheControl: HTML_CACHE_CONTROL,
    lastModified,
    ext: ".html",
    allowRange: false
  });
}

function resolvePath(urlPathname) {
  let cleanPath;
  try {
    cleanPath = decodeURIComponent(urlPathname);
  } catch (error) {
    return null;
  }

  if (cleanPath.endsWith("/")) {
    cleanPath = `${cleanPath}index.html`;
  }

  let filePath = path.normalize(path.join(ROOT, cleanPath));
  if (!filePath.startsWith(ROOT)) {
    return null;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  } else if (!path.extname(filePath)) {
    const htmlPath = `${filePath}.html`;
    if (fs.existsSync(htmlPath)) {
      filePath = htmlPath;
    }
  }

  return filePath;
}

function getFirstHeaderValue(value) {
  if (!value) return "";
  return String(value).split(",")[0].trim();
}

function escapeAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRotatingHomeOgImagePath(timestamp = Date.now()) {
  const slot = Math.floor(timestamp / HOME_OG_ROTATION_WINDOW_MS) % HOME_OG_IMAGES.length;
  return HOME_OG_IMAGES[slot];
}

function injectHomePreviewMeta(html, baseOrigin) {
  const ogImageUrl = new URL(getRotatingHomeOgImagePath(), baseOrigin).toString();
  const safeImageUrl = escapeAttribute(ogImageUrl);
  const safeAlt = escapeAttribute(HOME_OG_IMAGE_ALT);

  return html
    .replace(
      /<meta property="og:image" content="[^"]*">/,
      `<meta property="og:image" content="${safeImageUrl}">`
    )
    .replace(
      /<meta property="og:image:alt" content="[^"]*">/,
      `<meta property="og:image:alt" content="${safeAlt}">`
    )
    .replace(
      /<meta name="twitter:image" content="[^"]*">/,
      `<meta name="twitter:image" content="${safeImageUrl}">`
    )
    .replace(
      /<meta name="twitter:image:alt" content="[^"]*">/,
      `<meta name="twitter:image:alt" content="${safeAlt}">`
    );
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function readDashboardServiceAccount() {
  const jsonValue = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const base64Value = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const raw = jsonValue || (base64Value ? Buffer.from(base64Value, "base64").toString("utf8") : "");

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 값을 JSON으로 읽지 못했습니다.");
  }
}

function getDashboardConfig() {
  let serviceAccount = null;
  let configError = "";

  try {
    serviceAccount = readDashboardServiceAccount();
  } catch (error) {
    configError = error.message;
  }

  const propertyId = (process.env.GA4_PROPERTY_ID || "").trim();
  const searchConsoleSiteUrl = (process.env.SEARCH_CONSOLE_SITE_URL || "").trim();
  const dashboardUsername = (process.env.DASHBOARD_USERNAME || "").trim();
  const dashboardPassword = (process.env.DASHBOARD_PASSWORD || "").trim();

  const missing = [];

  if (!serviceAccount) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  }

  if (!propertyId) {
    missing.push("GA4_PROPERTY_ID");
  }

  if (!searchConsoleSiteUrl) {
    missing.push("SEARCH_CONSOLE_SITE_URL");
  }

  if (configError) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON 형식 확인");
  }

  return {
    serviceAccount,
    propertyId,
    searchConsoleSiteUrl,
    dashboardUsername,
    dashboardPassword,
    missing,
    configError
  };
}

function formatDateInTimeZone(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestamp));

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getDateSpan(days, offsetDays = 0) {
  const endTimestamp = Date.now() - offsetDays * DAY_MS;
  const startTimestamp = Date.now() - (offsetDays + days - 1) * DAY_MS;

  return {
    startDate: formatDateInTimeZone(startTimestamp),
    endDate: formatDateInTimeZone(endTimestamp)
  };
}

function getDashboardRangeFromDays(days, preferredKey = "", preferredLabel = "") {
  const safeDays = Math.min(MAX_DASHBOARD_DAYS, Math.max(1, Number.parseInt(days, 10) || 1));
  const isToday = safeDays === 1;
  const currentDateRange = getDateSpan(safeDays);
  const previousDateRange = getDateSpan(safeDays, safeDays);
  const key = preferredKey || (isToday ? "today" : `${safeDays}d`);
  const label = preferredLabel || (isToday ? "오늘" : `${safeDays}일`);

  return {
    key,
    label,
    days: safeDays,
    granularity: isToday ? "hour" : "day",
    isPartial: isToday,
    comparisonLabel: isToday ? "어제 하루 대비" : "직전 기간 대비",
    startDate: currentDateRange.startDate,
    endDate: currentDateRange.endDate,
    gaDateRange: [
      isToday
        ? { startDate: "today", endDate: "today" }
        : { startDate: `${safeDays - 1}daysAgo`, endDate: "today" }
    ],
    previousGaDateRange: [
      isToday
        ? { startDate: "yesterday", endDate: "yesterday" }
        : { startDate: previousDateRange.startDate, endDate: previousDateRange.endDate }
    ],
    searchConsoleDateRange: currentDateRange,
    previousSearchConsoleDateRange: previousDateRange
  };
}

function getDashboardRange(requestUrl) {
  const requestedRange = (requestUrl.searchParams.get("range") || "")
    .trim()
    .toLowerCase();
  const preset = DASHBOARD_RANGE_PRESETS[requestedRange];

  if (preset) {
    return getDashboardRangeFromDays(preset.days, requestedRange, preset.label);
  }

  const requestedDays = Number.parseInt(requestUrl.searchParams.get("days") || "", 10);
  if (!Number.isNaN(requestedDays)) {
    return getDashboardRangeFromDays(requestedDays);
  }

  const defaultPreset = DASHBOARD_RANGE_PRESETS[DEFAULT_DASHBOARD_RANGE_KEY];
  return getDashboardRangeFromDays(
    defaultPreset.days,
    DEFAULT_DASHBOARD_RANGE_KEY,
    defaultPreset.label
  );
}

function getSearchConsoleRequest(range, dateRange, options = {}) {
  return {
    ...dateRange,
    ...(range.isPartial && !options.isPrevious ? { dataState: "all" } : {}),
    ...(options.dimensions ? { dimensions: options.dimensions } : {}),
    ...(options.rowLimit ? { rowLimit: options.rowLimit } : {})
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function getGalleryStorageDir() {
  return path.resolve(process.env.GALLERY_DATA_DIR || path.join(ROOT, "data", "gallery"));
}

function getGalleryManifestPath() {
  return path.join(getGalleryStorageDir(), "manifest.json");
}

function ensureGalleryStorage() {
  fs.mkdirSync(getGalleryStorageDir(), { recursive: true });
}

function getGalleryManifestModifiedAt(manifestPath) {
  try {
    return fs.statSync(manifestPath).mtime.toISOString();
  } catch (error) {
    return null;
  }
}

function readGalleryManifestState() {
  const manifestPath = getGalleryManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return {
      items: [],
      manifestPath,
      manifestExists: false,
      manifestStatus: "missing",
      manifestModifiedAt: null
    };
  }

  let source;
  try {
    source = fs.readFileSync(manifestPath, "utf8");
  } catch (error) {
    console.error(`[gallery] Failed to read manifest at ${manifestPath}`, error);
    return {
      items: [],
      manifestPath,
      manifestExists: true,
      manifestStatus: "read_error",
      manifestModifiedAt: getGalleryManifestModifiedAt(manifestPath)
    };
  }

  try {
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed)) {
      console.error(`[gallery] Manifest must contain an array at ${manifestPath}`);
      return {
        items: [],
        manifestPath,
        manifestExists: true,
        manifestStatus: "invalid_format",
        manifestModifiedAt: getGalleryManifestModifiedAt(manifestPath)
      };
    }

    return {
      items: parsed,
      manifestPath,
      manifestExists: true,
      manifestStatus: "ok",
      manifestModifiedAt: getGalleryManifestModifiedAt(manifestPath)
    };
  } catch (error) {
    console.error(`[gallery] Failed to parse manifest at ${manifestPath}`, error);
    return {
      items: [],
      manifestPath,
      manifestExists: true,
      manifestStatus: "parse_error",
      manifestModifiedAt: getGalleryManifestModifiedAt(manifestPath)
    };
  }
}

function readGalleryManifest() {
  return readGalleryManifestState().items;
}

function isGalleryImageFile(filename) {
  return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(filename);
}

function getGalleryStorageStatus() {
  const storagePath = getGalleryStorageDir();
  const galleryDataDirConfigured = Boolean(String(process.env.GALLERY_DATA_DIR || "").trim());
  let storageDirectoryExists = false;
  let storageDirectoryWritable = false;
  let galleryImageFileCount = 0;
  let galleryImageFilenames = null;

  try {
    storageDirectoryExists = fs.statSync(storagePath).isDirectory();
  } catch (error) {
    storageDirectoryExists = false;
  }

  if (storageDirectoryExists) {
    try {
      fs.accessSync(storagePath, fs.constants.W_OK);
      storageDirectoryWritable = true;
    } catch (error) {
      storageDirectoryWritable = false;
    }

    try {
      galleryImageFilenames = new Set(
        fs.readdirSync(storagePath, { withFileTypes: true })
          .filter((entry) => entry.isFile() && isGalleryImageFile(entry.name))
          .map((entry) => entry.name)
      );
      galleryImageFileCount = galleryImageFilenames.size;
    } catch (error) {
      console.error(`[gallery] Failed to count image files at ${storagePath}`, error);
      galleryImageFileCount = null;
    }
  }

  const manifest = readGalleryManifestState();
  let missingReferencedImageCount = 0;
  let orphanImageFileCount = 0;

  if (galleryImageFilenames && manifest.manifestStatus === "ok") {
    const referencedFilenames = new Set();
    manifest.items.forEach((item) => {
      const filename = path.basename(String(item?.filename || ""));
      if (!filename) {
        missingReferencedImageCount += 1;
        return;
      }
      referencedFilenames.add(filename);
      if (!galleryImageFilenames.has(filename)) missingReferencedImageCount += 1;
    });
    orphanImageFileCount = [...galleryImageFilenames]
      .filter((filename) => !referencedFilenames.has(filename))
      .length;
  } else if (galleryImageFilenames && manifest.manifestStatus === "missing") {
    // A missing manifest cannot account for any files that still remain on disk.
    orphanImageFileCount = galleryImageFilenames.size;
  } else if (!galleryImageFilenames) {
    missingReferencedImageCount = null;
    orphanImageFileCount = null;
  }

  return {
    storagePath,
    galleryDataDirConfigured,
    storageDirectoryExists,
    storageDirectoryWritable,
    manifestExists: manifest.manifestExists,
    manifestStatus: manifest.manifestStatus,
    manifestItemCount: manifest.items.length,
    galleryImageFileCount,
    missingReferencedImageCount,
    orphanImageFileCount,
    manifestModifiedAt: manifest.manifestModifiedAt
  };
}

function writeGalleryManifest(items) {
  ensureGalleryStorage();
  const manifestPath = getGalleryManifestPath();
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(items, null, 2)}\n`);
  fs.renameSync(temporaryPath, manifestPath);
}

function isGalleryAdminAuthorized(req) {
  const expectedToken = (process.env.GALLERY_ADMIN_TOKEN || "").trim();
  const suppliedToken = String(req.headers["x-gallery-admin-token"] || "").trim();
  if (!expectedToken || !suppliedToken || expectedToken.length !== suppliedToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedToken), Buffer.from(suppliedToken));
}

function sendGalleryAuthorizationError(res) {
  const galleryConfigured = Boolean(String(process.env.GALLERY_ADMIN_TOKEN || "").trim());
  sendJson(res, galleryConfigured ? 403 : 503, {
    error: galleryConfigured ? "gallery_forbidden" : "gallery_not_configured",
    message: galleryConfigured
      ? "관리자 키가 올바르지 않습니다."
      : "GALLERY_ADMIN_TOKEN 환경변수를 먼저 설정해주세요."
  });
}

function readRequestBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > limitBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function normalizeGalleryHref(value) {
  const href = String(value || "").trim();
  if (!href) return "#actual-cases";
  if (/^(https?:\/\/|\/|#)/i.test(href)) return href.slice(0, 500);
  return `/${href.replace(/^\.\//, "").slice(0, 498)}`;
}

function decodeGalleryPathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return "";
  }
}

async function handleGalleryApi(req, res, requestUrl) {
  if (req.method === "GET" && requestUrl.pathname === "/api/gallery/status") {
    if (!isGalleryAdminAuthorized(req)) {
      sendGalleryAuthorizationError(res);
      return;
    }

    sendJson(res, 200, getGalleryStorageStatus());
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/gallery") {
    const customItems = readGalleryManifest();
    sendJson(res, 200, {
      items: customItems.length ? [...customItems].reverse() : DEFAULT_GALLERY_ITEMS,
      customCount: customItems.length,
      uploadEnabled: Boolean((process.env.GALLERY_ADMIN_TOKEN || "").trim())
    });
    return;
  }

  if (!isGalleryAdminAuthorized(req)) {
    sendGalleryAuthorizationError(res);
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/gallery") {
    try {
      const rawBody = await readRequestBody(req, MAX_GALLERY_UPLOAD_BYTES * 1.5);
      const payload = JSON.parse(rawBody);
      const match = String(payload.dataUrl || "").match(
        /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=]+)$/i
      );

      if (!match) {
        sendJson(res, 400, { error: "invalid_image", message: "JPG, PNG, WEBP 이미지만 올릴 수 있어요." });
        return;
      }

      const imageBuffer = Buffer.from(match[2], "base64");
      if (!imageBuffer.length || imageBuffer.length > MAX_GALLERY_UPLOAD_BYTES) {
        sendJson(res, 413, { error: "image_too_large", message: "이미지는 8MB 이하로 올려주세요." });
        return;
      }

      ensureGalleryStorage();
      const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
      const filename = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${extension}`;
      const id = crypto.randomUUID();
      fs.writeFileSync(path.join(getGalleryStorageDir(), filename), imageBuffer);

      const items = readGalleryManifest();
      const item = {
        id,
        filename,
        src: `/gallery-media/${filename}`,
        caption: String(payload.caption || "새로 만든 쿠키").trim().slice(0, 80),
        href: normalizeGalleryHref(payload.href),
        createdAt: new Date().toISOString(),
        userUploaded: true
      };
      items.push(item);
      writeGalleryManifest(items);
      console.info(
        `[gallery] Saved upload filename=${filename} path=${path.join(getGalleryStorageDir(), filename)} manifestItems=${items.length}`
      );
      sendJson(res, 201, { item });
    } catch (error) {
      const statusCode = error.message === "payload_too_large" ? 413 : 400;
      sendJson(res, statusCode, {
        error: error.message === "payload_too_large" ? "payload_too_large" : "invalid_request",
        message: statusCode === 413 ? "업로드 파일이 너무 큽니다." : "업로드 요청을 확인해주세요."
      });
    }
    return;
  }

  if (req.method === "DELETE" && requestUrl.pathname.startsWith("/api/gallery/")) {
    const id = decodeGalleryPathSegment(requestUrl.pathname.slice("/api/gallery/".length));
    const items = readGalleryManifest();
    const item = items.find((candidate) => candidate.id === id);

    if (!item) {
      sendJson(res, 404, { error: "gallery_item_not_found" });
      return;
    }

    const nextItems = items.filter((candidate) => candidate.id !== id);
    const imagePath = path.join(getGalleryStorageDir(), path.basename(item.filename || ""));
    if (item.filename && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    writeGalleryManifest(nextItems);
    sendJson(res, 200, { deleted: id });
    return;
  }

  sendJson(res, 405, { error: "method_not_allowed" });
}

function handleGalleryMedia(req, res, requestUrl) {
  const decodedFilename = decodeGalleryPathSegment(
    requestUrl.pathname.slice("/gallery-media/".length)
  );
  const filename = path.basename(decodedFilename);
  const filePath = path.join(getGalleryStorageDir(), filename);

  if (!filename || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendNotFound(req, res);
    return;
  }

  sendFileResponse(req, res, filePath, {
    cacheControl: IMMUTABLE_CACHE_CONTROL
  });
}

function getPublicWorkHref(value) {
  const href = String(value || "").trim();
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith(`https://${CANONICAL_HOST}/`)) return href;
  return "";
}

function formatPublicWorkDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "공개 제작 사례";
  return `공개 제작 사례 · ${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function getPublicWorkCardMeta(value) {
  const href = getPublicWorkHref(value);
  if (!href) return null;

  try {
    const pathname = new URL(href, `https://${CANONICAL_HOST}`).pathname;
    return PUBLIC_WORK_CARD_META_BY_HREF[pathname] || null;
  } catch (error) {
    return null;
  }
}

function getPublicWorkItems() {
  const savedItems = readGalleryManifest();
  const savedWorks = savedItems
    .map((item) => {
      const filename = path.basename(String(item?.filename || ""));
      if (!filename) return null;
      const imagePath = path.join(getGalleryStorageDir(), filename);
      if (!fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) return null;

      return {
        src: `/gallery-media/${encodeURIComponent(filename)}`,
        alt: String(item.caption || "낫띵메터스 제작 쿠키").trim().slice(0, 160),
        caption: String(item.caption || "낫띵메터스 제작 쿠키").trim().slice(0, 160),
        href: getPublicWorkHref(item.href),
        createdAt: item.createdAt,
      };
    })
    .filter(Boolean)
    .reverse();

  if (savedWorks.length) return savedWorks;

  return DEFAULT_GALLERY_ITEMS.map((item) => ({
    src: item.src,
    alt: item.caption,
    caption: item.caption,
    href: getPublicWorkHref(item.href),
    createdAt: "",
  }));
}

function renderPublicWorkCards() {
  return getPublicWorkItems()
    .map((item) => {
      const meta = getPublicWorkCardMeta(item.href);
      const details = meta
        ? `<dl class="nm-work-card-details">${meta.details
          .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
          .join("")}</dl>`
        : "";
      const action = item.href
        ? `<a href="${escapeAttribute(item.href)}">${escapeHtml(meta?.actionLabel || "관련 페이지 보기 →")}</a>`
        : "";

      return `            <article class="nm-work-card">
              <img src="${escapeAttribute(item.src)}" alt="${escapeAttribute(item.alt)}" loading="lazy" decoding="async">
              <div class="nm-work-card-copy">
                <p>${escapeHtml(item.caption)}</p>
                ${details}
                <small>${escapeHtml(formatPublicWorkDate(item.createdAt))} · 낫띵메터스 공항동 작업실</small>
                ${action}
              </div>
            </article>`;
    })
    .join("\n");
}

function renderWorksPage() {
  const templatePath = path.join(ROOT, "works", "index.html");
  const template = fs.readFileSync(templatePath, "utf8");
  const cards = renderPublicWorkCards();

  return template.replace(
    /<!-- NM_WORKS_CARDS:START -->[\s\S]*?<!-- NM_WORKS_CARDS:END -->/,
    `<!-- NM_WORKS_CARDS:START -->\n${cards}\n            <!-- NM_WORKS_CARDS:END -->`
  );
}

function parseBasicAuthHeader(headerValue) {
  if (!headerValue || !headerValue.startsWith("Basic ")) return null;
  const decoded = Buffer.from(headerValue.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return null;
  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1)
  };
}

function isDashboardAuthorized(req, dashboardConfig) {
  const { dashboardUsername, dashboardPassword } = dashboardConfig;
  if (!dashboardUsername && !dashboardPassword) return true;
  const credentials = parseBasicAuthHeader(req.headers.authorization);
  return (
    credentials &&
    credentials.username === dashboardUsername &&
    credentials.password === dashboardPassword
  );
}

function requestDashboardAuth(res) {
  res.writeHead(401, {
    "Content-Type": "application/json; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="nothingmatters dashboard"'
  });
  res.end(JSON.stringify({ error: "dashboard_auth_required" }));
}

async function getGoogleAccessToken(serviceAccount) {
  if (googleTokenCache.accessToken && googleTokenCache.expiresAt > Date.now() + 60_000) {
    return googleTokenCache.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: serviceAccount.private_key_id
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: GOOGLE_SCOPES.join(" "),
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsignedToken), serviceAccount.private_key);
  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google access token 발급 실패: ${response.status} ${message}`);
  }

  const data = await response.json();
  googleTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(0, (data.expires_in || 3600) - 60) * 1000
  };
  return googleTokenCache.accessToken;
}

function mapGaRows(report = {}) {
  const dimensionHeaders = report.dimensionHeaders || [];
  const metricHeaders = report.metricHeaders || [];

  return (report.rows || []).map((row) => {
    const dimensions = {};
    const metrics = {};

    dimensionHeaders.forEach((header, index) => {
      dimensions[header.name] = row.dimensionValues?.[index]?.value || "";
    });

    metricHeaders.forEach((header, index) => {
      metrics[header.name] = row.metricValues?.[index]?.value || "";
    });

    return { dimensions, metrics };
  });
}

function isNaverSource(value = "") {
  return String(value).toLowerCase().includes("naver");
}

async function fetchGaReport(accessToken, propertyId, requestBody) {
  const response = await fetch(`${GA4_API_BASE}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GA4 보고서 조회 실패: ${response.status} ${message}`);
  }

  return response.json();
}

async function fetchSearchConsoleReport(accessToken, siteUrl, requestBody) {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const response = await fetch(
    `${SEARCH_CONSOLE_API_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Search Console 조회 실패: ${response.status} ${message}`);
  }

  return response.json();
}

function getMetricValue(report = {}, metricIndex = 0) {
  return Number(report.rows?.[0]?.metricValues?.[metricIndex]?.value || 0);
}

function getOverviewMetrics(report = {}) {
  return {
    sessions: getMetricValue(report, 0),
    activeUsers: getMetricValue(report, 1),
    engagedSessions: getMetricValue(report, 2),
    engagementRate: getMetricValue(report, 3)
  };
}

function createDimensionFilter(fieldName, value) {
  return {
    filter: {
      fieldName,
      stringFilter: {
        matchType: "CONTAINS",
        value,
        caseSensitive: false
      }
    }
  };
}

function getEventNameFilter() {
  return {
    filter: {
      fieldName: "eventName",
      inListFilter: {
        values: TRACKED_DASHBOARD_EVENTS.map((event) => event.name)
      }
    }
  };
}

function getSourceMeaning(sourceMedium = "", channelGroup = "") {
  const source = String(sourceMedium).toLowerCase();
  const channel = String(channelGroup).toLowerCase();

  if (source.includes("naver")) return "네이버 검색/서비스에서 들어온 방문";
  if (source.includes("google")) return "구글 검색 또는 구글 관련 유입";
  if (source.includes("instagram")) return "인스타그램 프로필·링크 유입";
  if (source.includes("(direct)") || source.includes("(none)")) {
    return "주소 직접 입력 또는 출처 확인 불가";
  }
  if (channel.includes("organic")) return "검색 결과에서 들어온 방문";
  if (channel.includes("referral")) return "다른 사이트 링크를 타고 들어온 방문";
  if (channel.includes("social")) return "SNS에서 들어온 방문";
  return "GA4가 분류한 유입 경로";
}

function mapSourceRows(report = {}, totalSessions = 0) {
  return mapGaRows(report).map((row) => {
    const sessions = Number(row.metrics.sessions || 0);
    const activeUsers = Number(row.metrics.activeUsers || 0);
    const sourceMedium = row.dimensions.sessionSourceMedium || "(not set)";
    const channelGroup = row.dimensions.sessionPrimaryChannelGroup || "(not set)";

    return {
      sourceMedium,
      channelGroup,
      sessions,
      activeUsers,
      share: totalSessions ? sessions / totalSessions : 0,
      meaning: getSourceMeaning(sourceMedium, channelGroup)
    };
  });
}

function mapLandingRows(report = {}) {
  return mapGaRows(report).map((row) => ({
    page: row.dimensions.landingPagePlusQueryString || "/",
    sessions: Number(row.metrics.sessions || 0),
    activeUsers: Number(row.metrics.activeUsers || 0),
    engagementRate: Number(row.metrics.engagementRate || 0)
  }));
}

function buildChannelRows(sources = [], totalSessions = 0) {
  const channelMap = new Map();

  sources.forEach((source) => {
    const key = source.channelGroup || "(not set)";
    const existing = channelMap.get(key) || {
      channelGroup: key,
      sessions: 0,
      activeUsers: 0
    };

    existing.sessions += source.sessions;
    existing.activeUsers += source.activeUsers;
    channelMap.set(key, existing);
  });

  return [...channelMap.values()]
    .map((channel) => ({
      ...channel,
      share: totalSessions ? channel.sessions / totalSessions : 0
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

function formatSeriesLabel(key = "", granularity = "day") {
  if (granularity === "hour") {
    return `${String(key || "0").padStart(2, "0")}시`;
  }

  if (/^\d{8}$/.test(key)) {
    return `${Number(key.slice(4, 6))}/${Number(key.slice(6, 8))}`;
  }

  return key || "-";
}

function buildSeriesRows(sessionReport = {}, eventSeriesReport = {}, range) {
  const seriesDimension = range.granularity === "hour" ? "hour" : "date";
  const seriesMap = new Map();

  const ensurePoint = (key) => {
    const safeKey = String(key || "");
    if (!seriesMap.has(safeKey)) {
      seriesMap.set(safeKey, {
        key: safeKey,
        label: formatSeriesLabel(safeKey, range.granularity),
        sessions: 0,
        activeUsers: 0,
        orderClicks: 0,
        consultClicks: 0,
        totalActionClicks: 0
      });
    }

    return seriesMap.get(safeKey);
  };

  if (range.granularity === "hour") {
    Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).forEach(ensurePoint);
  }

  mapGaRows(sessionReport).forEach((row) => {
    const point = ensurePoint(row.dimensions[seriesDimension]);
    point.sessions += Number(row.metrics.sessions || 0);
    point.activeUsers += Number(row.metrics.activeUsers || 0);
  });

  mapGaRows(eventSeriesReport).forEach((row) => {
    const eventName = row.dimensions.eventName || "";
    const point = ensurePoint(row.dimensions[seriesDimension]);
    const count = Number(row.metrics.eventCount || 0);

    if (eventName.startsWith("order_")) point.orderClicks += count;
    if (eventName.startsWith("consult_")) point.consultClicks += count;
    point.totalActionClicks += count;
  });

  return [...seriesMap.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function mapEventRows(report = {}) {
  const counts = new Map(TRACKED_DASHBOARD_EVENTS.map((event) => [event.name, 0]));

  mapGaRows(report).forEach((row) => {
    const eventName = row.dimensions.eventName || "";
    counts.set(eventName, (counts.get(eventName) || 0) + Number(row.metrics.eventCount || 0));
  });

  return TRACKED_DASHBOARD_EVENTS.map((event) => ({
    ...event,
    count: counts.get(event.name) || 0
  }));
}

function getSearchOverview(report = {}) {
  const row = report.rows?.[0] || {};
  return {
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0)
  };
}

function getSearchInsight(row = {}) {
  if (row.impressions >= 50 && row.ctr < 0.03) {
    return "노출은 많은데 클릭률이 낮아요. 제목/설명 개선 후보";
  }
  if (row.position <= 5 && row.ctr < 0.08 && row.impressions > 0) {
    return "상위권에 보이지만 클릭 설득이 약할 수 있어요";
  }
  if (row.position > 10 && row.impressions > 0) {
    return "검색 노출은 있지만 순위 개선이 필요해요";
  }
  if (row.clicks > 0) return "실제 유입이 발생한 검색어";
  return "조금 더 데이터가 쌓이면 판단하기 좋아요";
}

function mapSearchRows(report = {}, keyName) {
  return (report.rows || []).map((row) => {
    const item = {
      [keyName]: row.keys?.[0] || "(not set)",
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      position: Number(row.position || 0)
    };

    return {
      ...item,
      insight: getSearchInsight(item)
    };
  });
}

function getSearchOpportunities(rows = []) {
  return rows
    .filter((row) => row.impressions > 0)
    .map((row) => ({
      ...row,
      opportunityScore: row.impressions * Math.max(0.01, 1 - row.ctr)
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);
}

function getDelta(current = 0, previous = 0) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);

  return {
    current: currentValue,
    previous: previousValue,
    change: currentValue - previousValue,
    rate: previousValue ? (currentValue - previousValue) / previousValue : null
  };
}

async function settleReports(requests) {
  const entries = await Promise.all(
    Object.entries(requests).map(async ([key, request]) => {
      try {
        return [key, { data: await request }];
      } catch (error) {
        return [key, { error: error.message || "데이터 조회 실패" }];
      }
    })
  );

  return Object.fromEntries(entries);
}

function getReport(reports, key) {
  return reports[key]?.data || {};
}

function getReportErrors(reports) {
  return Object.entries(reports)
    .filter(([, result]) => result.error)
    .map(([source, result]) => ({
      source,
      message: result.error
    }));
}

async function buildDashboardPayload(range, dashboardConfig) {
  const accessToken = await getGoogleAccessToken(dashboardConfig.serviceAccount);
  const seriesDimension = range.granularity === "hour" ? "hour" : "date";
  const eventFilter = getEventNameFilter();

  const reports = await settleReports({
    overview: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "engagedSessions" },
        { name: "engagementRate" }
      ]
    }),
    previousOverview: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.previousGaDateRange,
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "engagedSessions" },
        { name: "engagementRate" }
      ]
    }),
    sources: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "sessionSourceMedium" }, { name: "sessionPrimaryChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 16
    }),
    landingPages: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagementRate" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 12
    }),
    naverLandingPages: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "engagementRate" }],
      dimensionFilter: createDimensionFilter("sessionSourceMedium", "naver"),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10
    }),
    series: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: seriesDimension }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ dimension: { dimensionName: seriesDimension, orderType: "ALPHANUMERIC" } }]
    }),
    events: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: eventFilter,
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: TRACKED_DASHBOARD_EVENTS.length
    }),
    previousEvents: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.previousGaDateRange,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: eventFilter,
      limit: TRACKED_DASHBOARD_EVENTS.length
    }),
    eventSeries: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: seriesDimension }, { name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: eventFilter,
      orderBys: [{ dimension: { dimensionName: seriesDimension, orderType: "ALPHANUMERIC" } }],
      limit: 500
    }),
    devices: fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: range.gaDateRange,
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 6
    }),
    searchOverview: fetchSearchConsoleReport(
      accessToken,
      dashboardConfig.searchConsoleSiteUrl,
      getSearchConsoleRequest(range, range.searchConsoleDateRange, { rowLimit: 1 })
    ),
    previousSearchOverview: fetchSearchConsoleReport(
      accessToken,
      dashboardConfig.searchConsoleSiteUrl,
      getSearchConsoleRequest(range, range.previousSearchConsoleDateRange, {
        rowLimit: 1,
        isPrevious: true
      })
    ),
    queries: fetchSearchConsoleReport(
      accessToken,
      dashboardConfig.searchConsoleSiteUrl,
      getSearchConsoleRequest(range, range.searchConsoleDateRange, {
        dimensions: ["query"],
        rowLimit: 20
      })
    ),
    pages: fetchSearchConsoleReport(
      accessToken,
      dashboardConfig.searchConsoleSiteUrl,
      getSearchConsoleRequest(range, range.searchConsoleDateRange, {
        dimensions: ["page"],
        rowLimit: 20
      })
    )
  });

  const overview = getOverviewMetrics(getReport(reports, "overview"));
  const previousOverview = getOverviewMetrics(getReport(reports, "previousOverview"));
  const sources = mapSourceRows(getReport(reports, "sources"), overview.sessions);
  const naverSources = sources.filter((source) => isNaverSource(source.sourceMedium));
  const landingPages = mapLandingRows(getReport(reports, "landingPages"));
  const naverLandingPages = mapLandingRows(getReport(reports, "naverLandingPages"));
  const channels = buildChannelRows(sources, overview.sessions);
  const series = buildSeriesRows(getReport(reports, "series"), getReport(reports, "eventSeries"), range);
  const events = mapEventRows(getReport(reports, "events"));
  const previousEvents = mapEventRows(getReport(reports, "previousEvents"));
  const searchOverview = getSearchOverview(getReport(reports, "searchOverview"));
  const previousSearchOverview = getSearchOverview(getReport(reports, "previousSearchOverview"));
  const queries = mapSearchRows(getReport(reports, "queries"), "query");
  const pages = mapSearchRows(getReport(reports, "pages"), "page");
  const searchOpportunities = getSearchOpportunities(queries);
  const orderClicks = events
    .filter((event) => event.type === "order")
    .reduce((sum, event) => sum + event.count, 0);
  const previousOrderClicks = previousEvents
    .filter((event) => event.type === "order")
    .reduce((sum, event) => sum + event.count, 0);
  const consultClicks = events
    .filter((event) => event.type === "consult")
    .reduce((sum, event) => sum + event.count, 0);
  const previousConsultClicks = previousEvents
    .filter((event) => event.type === "consult")
    .reduce((sum, event) => sum + event.count, 0);
  const totalActionClicks = orderClicks + consultClicks;
  const previousActionClicks = previousOrderClicks + previousConsultClicks;
  const naverSessions = naverSources.reduce((sum, row) => sum + row.sessions, 0);
  const naverActiveUsers = naverSources.reduce((sum, row) => sum + row.activeUsers, 0);
  const reportErrors = getReportErrors(reports);

  const summary = {
    ...overview,
    searchClicks: searchOverview.clicks,
    searchImpressions: searchOverview.impressions,
    searchCtr: searchOverview.ctr,
    averagePosition: searchOverview.position,
    orderClicks,
    consultClicks,
    totalActionClicks,
    conversionSignalRate: overview.sessions ? totalActionClicks / overview.sessions : 0,
    naverSessions,
    naverActiveUsers
  };

  return {
    generatedAt: new Date().toISOString(),
    range: {
      key: range.key,
      label: range.label,
      days: range.days,
      startDate: range.startDate,
      endDate: range.endDate,
      granularity: range.granularity,
      isPartial: range.isPartial,
      comparisonLabel: range.comparisonLabel
    },
    summary,
    delta: {
      comparisonLabel: range.comparisonLabel,
      sessions: getDelta(summary.sessions, previousOverview.sessions),
      activeUsers: getDelta(summary.activeUsers, previousOverview.activeUsers),
      searchClicks: getDelta(summary.searchClicks, previousSearchOverview.clicks),
      searchImpressions: getDelta(summary.searchImpressions, previousSearchOverview.impressions),
      orderClicks: getDelta(orderClicks, previousOrderClicks),
      consultClicks: getDelta(consultClicks, previousConsultClicks),
      totalActionClicks: getDelta(totalActionClicks, previousActionClicks)
    },
    series,
    channels,
    sources,
    landingPages,
    naver: {
      sessions: naverSessions,
      activeUsers: naverActiveUsers,
      sources: naverSources,
      landingPages: naverLandingPages
    },
    devices: mapGaRows(getReport(reports, "devices")).map((row) => ({
      deviceCategory: row.dimensions.deviceCategory || "(not set)",
      sessions: Number(row.metrics.sessions || 0),
      activeUsers: Number(row.metrics.activeUsers || 0),
      share: summary.sessions ? Number(row.metrics.sessions || 0) / summary.sessions : 0
    })),
    events,
    search: {
      siteUrl: dashboardConfig.searchConsoleSiteUrl,
      isPartial: range.isPartial,
      ...searchOverview,
      queries,
      pages,
      opportunities: searchOpportunities,
      error:
        reports.searchOverview?.error ||
        reports.queries?.error ||
        reports.pages?.error ||
        ""
    },
    errors: reportErrors,
    ga4: {
      overview,
      sources,
      landingPages,
      daily: series
        .filter((point) => range.granularity === "day")
        .map((point) => ({
          date: point.key,
          sessions: point.sessions,
          activeUsers: point.activeUsers
        })),
      naver: {
        sessions: naverSessions,
        activeUsers: naverActiveUsers,
        sources: naverSources,
        landingPages: naverLandingPages
      }
    },
    searchConsole: {
      siteUrl: dashboardConfig.searchConsoleSiteUrl,
      topQueries: queries,
      topPages: pages,
      error:
        reports.searchOverview?.error ||
        reports.queries?.error ||
        reports.pages?.error ||
        ""
    }
  };
}

async function handleDashboardSummary(req, res, requestUrl, dashboardConfig) {
  if (!isDashboardAuthorized(req, dashboardConfig)) {
    requestDashboardAuth(res);
    return;
  }

  if (dashboardConfig.missing.length) {
    sendJson(res, 503, {
      error: "dashboard_not_configured",
      message: "대시보드를 보려면 Google Analytics 4 와 Search Console 설정이 필요합니다.",
      missing: dashboardConfig.missing,
      setup: {
        requiredEnv: [
          "GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
          "GA4_PROPERTY_ID",
          "SEARCH_CONSOLE_SITE_URL"
        ],
        notes: [
          dashboardConfig.configError || "서비스 계정 JSON은 전체 원문 또는 Base64 형태로 넣을 수 있습니다.",
          "서비스 계정 이메일을 GA4 속성에 Viewer 이상으로 추가하세요.",
          "서비스 계정 이메일을 Search Console 속성에 사용자로 추가하세요.",
          "SEARCH_CONSOLE_SITE_URL 은 예: https://nothingmatters.co.kr/ 또는 sc-domain:nothingmatters.co.kr 형태입니다."
        ].filter(Boolean)
      }
    });
    return;
  }

  const dashboardRange = getDashboardRange(requestUrl);

  try {
    const payload = await buildDashboardPayload(dashboardRange, dashboardConfig);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 502, {
      error: "dashboard_fetch_failed",
      message: error.message
    });
  }
}

async function handleJournalFeed(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  sendJson(res, 200, await wordpressJournal.getLatestPosts());
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const dashboardConfig = getDashboardConfig();
  const forwardedHost = getFirstHeaderValue(req.headers["x-forwarded-host"]);
  const requestHost = (forwardedHost || req.headers.host || "localhost")
    .split(":")[0]
    .trim()
    .toLowerCase();
  const forwardedProto = getFirstHeaderValue(req.headers["x-forwarded-proto"]);
  const requestProto = (forwardedProto || "http").trim().toLowerCase();
  const isProductionHost =
    requestHost === CANONICAL_HOST || requestHost === `www.${CANONICAL_HOST}`;
  const responseOrigin = `${isProductionHost ? "https" : requestProto}://${
    requestHost && requestHost !== "localhost" ? requestHost : CANONICAL_HOST
  }`;

  if (isProductionHost && (requestHost !== CANONICAL_HOST || requestProto !== "https")) {
    const redirectUrl = new URL(
      `${requestUrl.pathname}${requestUrl.search}`,
      `https://${CANONICAL_HOST}`
    );

    res.writeHead(301, {
      Location: redirectUrl.toString(),
      "Cache-Control": "public, max-age=3600"
    });
    res.end();
    return;
  }

  const legacyRedirectPath = LEGACY_PRODUCT_REDIRECTS[requestUrl.pathname];
  if (legacyRedirectPath) {
    const redirectUrl = new URL(legacyRedirectPath, `https://${CANONICAL_HOST}`);
    res.writeHead(301, {
      Location: redirectUrl.toString(),
      "Cache-Control": "public, max-age=86400",
    });
    res.end();
    return;
  }

  if (requestUrl.pathname === "/api/gallery" || requestUrl.pathname.startsWith("/api/gallery/")) {
    await handleGalleryApi(req, res, requestUrl);
    return;
  }

  if (requestUrl.pathname === "/api/journal") {
    await handleJournalFeed(req, res);
    return;
  }

  if (
    requestUrl.pathname.startsWith("/gallery-media/") &&
    (req.method === "GET" || req.method === "HEAD")
  ) {
    handleGalleryMedia(req, res, requestUrl);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  if (requestUrl.pathname === "/api/dashboard/summary") {
    await handleDashboardSummary(req, res, requestUrl, dashboardConfig);
    return;
  }

  if (requestUrl.pathname.startsWith("/dashboard") && !isDashboardAuthorized(req, dashboardConfig)) {
    requestDashboardAuth(res);
    return;
  }

  if (requestUrl.pathname === "/works/") {
    const responseBody = renderWorksPage();
    sendBufferResponse(req, res, 200, responseBody, {
      contentType: MIME_TYPES[".html"],
      cacheControl: HTML_CACHE_CONTROL,
      ext: ".html",
      allowRange: false
    });
    return;
  }

  const filePath = resolvePath(requestUrl.pathname);

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendNotFound(req, res);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const stat = fs.statSync(filePath);

  const isHomeHtml =
    ext === ".html" &&
    path.relative(ROOT, filePath) === "index.html" &&
    (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html");

  if (isHomeHtml) {
    const html = fs.readFileSync(filePath, "utf8");
    const responseBody = injectHomePreviewMeta(html, responseOrigin);
    sendBufferResponse(req, res, 200, responseBody, {
      contentType,
      cacheControl: HTML_CACHE_CONTROL,
      lastModified: stat.mtime.toUTCString(),
      ext,
      allowRange: false
    });
    return;
  }

  sendFileResponse(req, res, filePath);
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running at http://${HOST}:${PORT}`);
});
