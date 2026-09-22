import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_PAGE_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "site-pages.json"), "utf8"));
const cookieCareDashboardEvents = [
  "cookie_care_entry_click",
  "cookie_care_find_product_click",
  "cookie_care_kakao_subscribe_click",
  "cookie_care_kakao_question_click",
  "cookie_care_product_discover_click"
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function request(baseUrl, pathname, options = {}) {
  const url = new URL(pathname, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method || "GET",
        headers: options.headers || {}
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on("error", reject);
    req.end(options.body || undefined);
  });
}

async function startServer() {
  const port = await reservePort();
  const output = [];
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      WORDPRESS_JOURNAL_OFFLINE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (chunk) => output.push(chunk.toString()));
  serverProcess.stderr.on("data", (chunk) => output.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await request(baseUrl, "/");
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch (error) {
      // The server may still be starting.
    }
    await sleep(60);
  }

  if (!ready) {
    serverProcess.kill("SIGTERM");
    throw new Error(`HTTP test server did not start: ${output.join("")}`);
  }

  return { process: serverProcess, baseUrl };
}

async function stopServer(server) {
  if (server.process.exitCode !== null) return;
  server.process.kill("SIGTERM");
  await Promise.race([once(server.process, "exit"), sleep(2000)]);
  if (server.process.exitCode === null) server.process.kill("SIGKILL");
}

const server = await startServer();

try {
  const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const dashboardSource = fs.readFileSync(path.join(ROOT, "assets/dashboard.js"), "utf8");
  for (const eventName of cookieCareDashboardEvents) {
    assert.match(serverSource, new RegExp(`name: "${eventName}"`), `${eventName} must be tracked by the dashboard server`);
    assert.match(dashboardSource, new RegExp(`${eventName}: \\{`), `${eventName} must have dashboard metadata`);
  }

  const asset = await request(server.baseUrl, "/assets/site.css");
  assert.equal(asset.status, 200);
  assert.match(asset.headers["cache-control"], /public, max-age=86400/);
  assert.ok(asset.headers.etag, "asset response should include ETag");
  assert.ok(asset.headers["last-modified"], "asset response should include Last-Modified");
  assert.equal(asset.headers["accept-ranges"], "bytes");

  const fresh = await request(server.baseUrl, "/assets/site.css", {
    headers: { "If-None-Match": asset.headers.etag }
  });
  assert.equal(fresh.status, 304);
  assert.equal(fresh.body.length, 0);

  const compressed = await request(server.baseUrl, "/assets/site.css", {
    headers: { "Accept-Encoding": "br, gzip" }
  });
  assert.equal(compressed.status, 200);
  assert.equal(compressed.headers["content-encoding"], "br");
  assert.equal(compressed.headers.vary, "Accept-Encoding");
  assert.ok(Number(compressed.headers["content-length"]) < Number(asset.headers["content-length"]));

  const ranged = await request(server.baseUrl, "/assets/site.css", {
    headers: { Range: "bytes=0-99", "Accept-Encoding": "br, gzip" }
  });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers["content-range"], `bytes 0-99/${asset.body.length}`);
  assert.equal(ranged.headers["content-length"], "100");
  assert.equal(ranged.headers["content-encoding"], undefined);
  assert.equal(ranged.body.length, 100);

  const head = await request(server.baseUrl, "/assets/site.css", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers["content-length"], asset.headers["content-length"]);
  assert.equal(head.body.length, 0);

  const home = await request(server.baseUrl, "/");
  assert.equal(home.status, 200);
  assert.match(home.headers["cache-control"], /max-age=0, must-revalidate/);
  assert.ok(home.headers.etag);

  const journal = await request(server.baseUrl, "/api/journal");
  assert.equal(journal.status, 200);
  const journalPayload = JSON.parse(journal.body.toString("utf8"));
  assert.equal(journalPayload.source, "fallback");
  assert.deepEqual(journalPayload.items, []);

  const notFound = await request(server.baseUrl, "/does-not-exist");
  assert.equal(notFound.status, 404);
  assert.match(notFound.headers["content-type"], /text\/html/);
  assert.match(notFound.headers["cache-control"], /max-age=0, must-revalidate/);
  assert.match(notFound.body.toString("utf8"), /쿠키 보러가기/);
  assert.match(notFound.body.toString("utf8"), /제작 사례/);
  assert.match(notFound.body.toString("utf8"), /주문 상담/);

  for (const [alias, target] of Object.entries(SITE_PAGE_DATA.redirects || {})) {
    const legacy = await request(server.baseUrl, alias);
    assert.equal(legacy.status, 301, `${alias} should redirect`);
    assert.equal(legacy.headers.location, new URL(target, "https://nothingmatters.co.kr").toString(), `${alias} should redirect to its registry target`);
    assert.match(legacy.headers["cache-control"], /max-age=86400/, `${alias} should use the long redirect cache policy`);
  }
  assert.equal((await request(server.baseUrl, "/brookie")).headers.location, "https://nothingmatters.co.kr/brookie/");
  assert.equal((await request(server.baseUrl, "/cookies")).headers.location, "https://nothingmatters.co.kr/out/");
  assert.equal((await request(server.baseUrl, "/lucky")).headers.location, "https://nothingmatters.co.kr/out/fortune/");
} finally {
  await stopServer(server);
}

console.log("server HTTP delivery checks: passed");
