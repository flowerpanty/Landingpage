"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

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
const DEFAULT_DASHBOARD_DAYS = 28;
const MIN_DASHBOARD_DAYS = 7;
const MAX_DASHBOARD_DAYS = 90;

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

function resolvePath(urlPathname) {
  let cleanPath = decodeURIComponent(urlPathname);
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

function getDashboardDays(requestUrl) {
  const requestedDays = Number.parseInt(requestUrl.searchParams.get("days") || "", 10);
  if (Number.isNaN(requestedDays)) return DEFAULT_DASHBOARD_DAYS;
  return Math.min(MAX_DASHBOARD_DAYS, Math.max(MIN_DASHBOARD_DAYS, requestedDays));
}

function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSearchConsoleDateRange(days) {
  const end = new Date();
  const start = new Date(Date.now() - (days - 1) * DAY_MS);
  return {
    startDate: formatDate(start),
    endDate: formatDate(end)
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

async function buildDashboardPayload(days, dashboardConfig) {
  const accessToken = await getGoogleAccessToken(dashboardConfig.serviceAccount);
  const gaDateRange = [{ startDate: `${days}daysAgo`, endDate: "today" }];
  const searchConsoleDateRange = getSearchConsoleDateRange(days);

  const [
    overviewReport,
    sourceReport,
    landingReport,
    dailyReport,
    queryReport,
    pageReport
  ] = await Promise.all([
    fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: gaDateRange,
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "engagedSessions" },
        { name: "engagementRate" }
      ]
    }),
    fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: gaDateRange,
      dimensions: [{ name: "sessionSourceMedium" }, { name: "sessionPrimaryChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10
    }),
    fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: gaDateRange,
      dimensions: [{ name: "landingPagePlusQueryString" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10
    }),
    fetchGaReport(accessToken, dashboardConfig.propertyId, {
      dateRanges: gaDateRange,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }]
    }),
    fetchSearchConsoleReport(accessToken, dashboardConfig.searchConsoleSiteUrl, {
      ...searchConsoleDateRange,
      dimensions: ["query"],
      rowLimit: 10
    }),
    fetchSearchConsoleReport(accessToken, dashboardConfig.searchConsoleSiteUrl, {
      ...searchConsoleDateRange,
      dimensions: ["page"],
      rowLimit: 10
    })
  ]);

  const overviewRow = overviewReport.rows?.[0]?.metricValues || [];

  return {
    generatedAt: new Date().toISOString(),
    range: {
      days,
      startDate: searchConsoleDateRange.startDate,
      endDate: searchConsoleDateRange.endDate
    },
    ga4: {
      overview: {
        sessions: Number(overviewRow[0]?.value || 0),
        activeUsers: Number(overviewRow[1]?.value || 0),
        engagedSessions: Number(overviewRow[2]?.value || 0),
        engagementRate: Number(overviewRow[3]?.value || 0)
      },
      sources: mapGaRows(sourceReport).map((row) => ({
        sourceMedium: row.dimensions.sessionSourceMedium || "(not set)",
        channelGroup: row.dimensions.sessionPrimaryChannelGroup || "(not set)",
        sessions: Number(row.metrics.sessions || 0),
        activeUsers: Number(row.metrics.activeUsers || 0)
      })),
      landingPages: mapGaRows(landingReport).map((row) => ({
        page: row.dimensions.landingPagePlusQueryString || "/",
        sessions: Number(row.metrics.sessions || 0),
        activeUsers: Number(row.metrics.activeUsers || 0)
      })),
      daily: mapGaRows(dailyReport).map((row) => ({
        date: row.dimensions.date || "",
        sessions: Number(row.metrics.sessions || 0),
        activeUsers: Number(row.metrics.activeUsers || 0)
      })),
      naver: (() => {
        const sourceRows = mapGaRows(sourceReport).map((row) => ({
          sourceMedium: row.dimensions.sessionSourceMedium || "(not set)",
          channelGroup: row.dimensions.sessionPrimaryChannelGroup || "(not set)",
          sessions: Number(row.metrics.sessions || 0),
          activeUsers: Number(row.metrics.activeUsers || 0)
        }));

        const landingRows = mapGaRows(landingReport).map((row) => ({
          page: row.dimensions.landingPagePlusQueryString || "/",
          sessions: Number(row.metrics.sessions || 0),
          activeUsers: Number(row.metrics.activeUsers || 0)
        }));

        const naverSources = sourceRows.filter((row) => isNaverSource(row.sourceMedium));
        const naverSessions = naverSources.reduce((sum, row) => sum + row.sessions, 0);
        const naverUsers = naverSources.reduce((sum, row) => sum + row.activeUsers, 0);

        return {
          sessions: naverSessions,
          activeUsers: naverUsers,
          sources: naverSources,
          landingPages: landingRows.filter((row) => row.page)
        };
      })()
    },
    searchConsole: {
      siteUrl: dashboardConfig.searchConsoleSiteUrl,
      topQueries: (queryReport.rows || []).map((row) => ({
        query: row.keys?.[0] || "(not set)",
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0
      })),
      topPages: (pageReport.rows || []).map((row) => ({
        page: row.keys?.[0] || "(not set)",
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0
      }))
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

  const days = getDashboardDays(requestUrl);

  try {
    const payload = await buildDashboardPayload(days, dashboardConfig);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 502, {
      error: "dashboard_fetch_failed",
      message: error.message
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

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

  if (requestUrl.pathname === "/api/dashboard/summary") {
    await handleDashboardSummary(req, res, requestUrl, dashboardConfig);
    return;
  }

  if (requestUrl.pathname.startsWith("/dashboard") && !isDashboardAuthorized(req, dashboardConfig)) {
    requestDashboardAuth(res);
    return;
  }

  const filePath = resolvePath(requestUrl.pathname);

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
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

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": Buffer.byteLength(responseBody)
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    res.end(responseBody);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running at http://${HOST}:${PORT}`);
});
