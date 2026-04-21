"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const ROOT = process.cwd();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const CANONICAL_HOST = "nothingmatters.co.kr";

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

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }

  const requestUrl = new URL(req.url || "/", "http://localhost");
  const forwardedHost = getFirstHeaderValue(req.headers["x-forwarded-host"]);
  const requestHost = (forwardedHost || req.headers.host || "localhost")
    .split(":")[0]
    .trim()
    .toLowerCase();
  const forwardedProto = getFirstHeaderValue(req.headers["x-forwarded-proto"]);
  const requestProto = (forwardedProto || "http").trim().toLowerCase();
  const isProductionHost =
    requestHost === CANONICAL_HOST || requestHost === `www.${CANONICAL_HOST}`;

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

  const filePath = resolvePath(requestUrl.pathname);

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const stat = fs.statSync(filePath);

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
