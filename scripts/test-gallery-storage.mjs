import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "gallery-storage-test-token";
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJ/gAAAABJRU5ErkJggg==";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  return { response, payload: await response.json() };
}

async function requestText(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return { response, body: await response.text() };
}

async function startGalleryServer(storageDir) {
  const port = await reservePort();
  const output = [];
  const serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      GALLERY_DATA_DIR: storageDir,
      GALLERY_ADMIN_TOKEN: TOKEN
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (chunk) => output.push(chunk.toString()));
  serverProcess.stderr.on("data", (chunk) => output.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/gallery`);
      if (response.ok) {
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
    throw new Error(`Gallery test server did not start: ${output.join("")}`);
  }

  return { process: serverProcess, baseUrl, output };
}

async function stopServer(server) {
  if (server.process.exitCode !== null) return;
  server.process.kill("SIGTERM");
  await Promise.race([once(server.process, "exit"), sleep(2000)]);
  if (server.process.exitCode === null) server.process.kill("SIGKILL");
}

async function withTemporaryStorage(run) {
  const storageDir = await mkdtemp(path.join(os.tmpdir(), "nm-gallery-storage-"));
  let server;
  try {
    server = await startGalleryServer(storageDir);
    await run({ storageDir, ...server });
  } finally {
    if (server) await stopServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
}

function adminHeaders() {
  return { "X-Gallery-Admin-Token": TOKEN };
}

await withTemporaryStorage(async ({ storageDir, baseUrl, output }) => {
  const anonymous = await requestJson(baseUrl, "/api/gallery/status");
  assert.equal(anonymous.response.status, 403);
  assert.equal("storagePath" in anonymous.payload, false);

  const empty = await requestJson(baseUrl, "/api/gallery/status", { headers: adminHeaders() });
  assert.equal(empty.response.status, 200);
  assert.equal(empty.payload.storagePath, path.resolve(storageDir));
  assert.equal(empty.payload.galleryDataDirConfigured, true);
  assert.equal(empty.payload.storageDirectoryExists, true);
  assert.equal(empty.payload.storageDirectoryWritable, true);
  assert.equal(empty.payload.manifestStatus, "missing");
  assert.equal(empty.payload.manifestItemCount, 0);
  assert.equal(empty.payload.galleryImageFileCount, 0);
  assert.equal(empty.payload.missingReferencedImageCount, 0);
  assert.equal(empty.payload.orphanImageFileCount, 0);

  const defaultGallery = await requestJson(baseUrl, "/api/gallery");
  assert.equal(defaultGallery.response.status, 200);
  assert.equal(defaultGallery.payload.customCount, 0);
  assert.equal(defaultGallery.payload.items.length, 5, "registry-backed default gallery should expose five works");
  assert.deepEqual(
    defaultGallery.payload.items.map((item) => item.href),
    ["/out/", "/guides/wedding-favor-cookie/", "/guides/corporate-event-cookie/", "/out/fortune/", "/products/brownie-cookie/"]
  );

  const emptyWorks = await requestText(baseUrl, "/works/");
  assert.equal(emptyWorks.response.status, 200);
  assert.match(emptyWorks.body, /귀여운 표정을 고른 작은 선물/);
  assert.match(emptyWorks.body, /nm-work-card-details/);
  assert.doesNotMatch(emptyWorks.body, /gallery-storage-test-token|GALLERY_DATA_DIR/);

  const pickup = await requestText(baseUrl, "/pickup/");
  assert.equal(pickup.response.status, 200);
  assert.match(pickup.body, /김포공항·송정역 인근/);

  const upload = await requestJson(baseUrl, "/api/gallery", {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      dataUrl: `data:image/png;base64,${TINY_PNG}`,
      caption: "<strong>진단용 쿠키 사진</strong>",
      href: "https://nothingmatters.co.kr/products/brownie-cookie/"
    })
  });
  assert.equal(upload.response.status, 201);
  assert.ok(upload.payload.item.id);
  await sleep(20);
  assert.match(output.join(""), /Saved upload filename=.*manifestItems=1/);

  const gallery = await requestJson(baseUrl, "/api/gallery");
  assert.equal(gallery.response.status, 200);
  assert.equal(gallery.payload.customCount, 1);
  assert.equal(gallery.payload.items[0].id, upload.payload.item.id);

  const works = await requestText(baseUrl, "/works/");
  assert.equal(works.response.status, 200);
  assert.match(works.body, /&lt;strong&gt;진단용 쿠키 사진&lt;\/strong&gt;/);
  assert.doesNotMatch(works.body, /<strong>진단용 쿠키 사진<\/strong>/);
  assert.match(works.body, new RegExp(upload.payload.item.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(works.body, /nm-work-card-details/, "uploads without optional works metadata should use the minimal card fallback");
  const captionOnlyCard = works.body.match(/<article class="nm-work-card">[\s\S]*?진단용 쿠키 사진[\s\S]*?<\/article>/)?.[0] || "";
  assert.doesNotMatch(captionOnlyCard, /공항동 작업실/, "caption-only uploads must not inherit default workshop metadata");
  assert.match(works.body, /href="https:\/\/nothingmatters\.co\.kr\/products\/brownie-cookie\/"/, "same-domain absolute work href should render as a valid link");
  const worksSchemaMatch = works.body.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/);
  assert.ok(worksSchemaMatch, "works should include runtime JSON-LD");
  const worksSchema = JSON.parse(worksSchemaMatch[1]);
  const worksItemList = worksSchema["@graph"].find((entry) => entry["@type"] === "ItemList");
  const absoluteHrefSchemaUrl = worksItemList?.itemListElement?.[0]?.url;
  assert.equal(absoluteHrefSchemaUrl, "https://nothingmatters.co.kr/products/brownie-cookie/");
  assert.equal((absoluteHrefSchemaUrl.match(/https:\/\/nothingmatters\.co\.kr/g) || []).length, 1, "works JSON-LD must not duplicate the canonical hostname");

  const media = await fetch(`${baseUrl}${upload.payload.item.src}`);
  assert.equal(media.status, 200);

  const populated = await requestJson(baseUrl, "/api/gallery/status", { headers: adminHeaders() });
  assert.equal(populated.payload.manifestStatus, "ok");
  assert.equal(populated.payload.manifestItemCount, 1);
  assert.equal(populated.payload.galleryImageFileCount, 1);
  assert.equal(populated.payload.missingReferencedImageCount, 0);
  assert.equal(populated.payload.orphanImageFileCount, 0);
  assert.ok(populated.payload.manifestModifiedAt);

  const deleted = await requestJson(baseUrl, `/api/gallery/${encodeURIComponent(upload.payload.item.id)}`, {
    method: "DELETE",
    headers: adminHeaders()
  });
  assert.equal(deleted.response.status, 200);

  const afterDelete = await requestJson(baseUrl, "/api/gallery");
  assert.equal(afterDelete.payload.customCount, 0);

  const metadataUpload = await requestJson(baseUrl, "/api/gallery", {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      dataUrl: `data:image/png;base64,${TINY_PNG}`,
      caption: "메타데이터가 있는 제작 사진",
      href: "/products/brownie-cookie/",
      purpose: "작은 선물",
      fulfillment: "예약 픽업",
      packaging: "문구 추가"
    })
  });
  assert.equal(metadataUpload.response.status, 201);
  assert.deepEqual(
    { purpose: metadataUpload.payload.item.purpose, fulfillment: metadataUpload.payload.item.fulfillment, packaging: metadataUpload.payload.item.packaging },
    { purpose: "작은 선물", fulfillment: "예약 픽업", packaging: "문구 추가" }
  );
  const metadataWorks = await requestText(baseUrl, "/works/");
  assert.equal(metadataWorks.response.status, 200, "an uploaded work with optional metadata must render");
  assert.match(metadataWorks.body, /메타데이터가 있는 제작 사진/);
  assert.match(metadataWorks.body, /예약 픽업/);
  assert.match(metadataWorks.body, /문구 추가/);
  assert.match(metadataWorks.body, /href="\/products\/brownie-cookie\/"/);
  assert.doesNotMatch(metadataWorks.body, /<dt>관련 제품<\/dt><dd>브라우니쿠키<\/dd>/, "uploaded works must not inherit registry metadata");

  const invalidHrefUpload = await requestJson(baseUrl, "/api/gallery", {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      dataUrl: `data:image/png;base64,${TINY_PNG}`,
      caption: "외부 링크가 제거되는 제작 사진",
      href: "https://example.com/not-a-public-work"
    })
  });
  assert.equal(invalidHrefUpload.response.status, 201);
  const invalidHrefWorks = await requestText(baseUrl, "/works/");
  assert.equal(invalidHrefWorks.response.status, 200, "an uploaded work with an external href must not break works rendering");
  assert.match(invalidHrefWorks.body, /외부 링크가 제거되는 제작 사진/);
  assert.doesNotMatch(invalidHrefWorks.body, /href="https:\/\/example\.com\/not-a-public-work"/);
  const invalidHrefSchema = JSON.parse(invalidHrefWorks.body.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/)[1]);
  const invalidHrefItem = invalidHrefSchema["@graph"].find((entry) => entry["@type"] === "ItemList").itemListElement[0];
  assert.equal("url" in invalidHrefItem, false, "external uploaded href must be omitted from works JSON-LD");
});

await withTemporaryStorage(async ({ storageDir, baseUrl }) => {
  const filename = "saved-cookie.webp";
  await writeFile(path.join(storageDir, filename), Buffer.from(TINY_PNG, "base64"));
  await writeFile(
    path.join(storageDir, "manifest.json"),
    JSON.stringify([{ id: "saved-item", filename, src: `/gallery-media/${filename}` }])
  );

  const status = await requestJson(baseUrl, "/api/gallery/status", { headers: adminHeaders() });
  assert.equal(status.payload.manifestStatus, "ok");
  assert.equal(status.payload.manifestItemCount, 1);
  assert.equal(status.payload.galleryImageFileCount, 1);
  assert.equal(status.payload.missingReferencedImageCount, 0);
  assert.equal(status.payload.orphanImageFileCount, 0);

  const works = await requestText(baseUrl, "/works/");
  assert.equal(works.response.status, 200);
  assert.match(works.body, /saved-cookie\.webp/);
  assert.doesNotMatch(works.body, /nm-work-card-details/);
});

await withTemporaryStorage(async ({ storageDir, baseUrl }) => {
  await writeFile(path.join(storageDir, "orphan-without-manifest.webp"), Buffer.from(TINY_PNG, "base64"));

  const status = await requestJson(baseUrl, "/api/gallery/status", { headers: adminHeaders() });
  assert.equal(status.payload.manifestStatus, "missing");
  assert.equal(status.payload.manifestItemCount, 0);
  assert.equal(status.payload.galleryImageFileCount, 1);
  assert.equal(status.payload.missingReferencedImageCount, 0);
  assert.equal(status.payload.orphanImageFileCount, 1);
});

await withTemporaryStorage(async ({ storageDir, baseUrl }) => {
  await writeFile(path.join(storageDir, "orphan.webp"), Buffer.from(TINY_PNG, "base64"));
  await writeFile(
    path.join(storageDir, "manifest.json"),
    JSON.stringify([{ id: "missing-item", filename: "missing.webp", src: "/gallery-media/missing.webp" }])
  );

  const status = await requestJson(baseUrl, "/api/gallery/status", { headers: adminHeaders() });
  assert.equal(status.payload.manifestStatus, "ok");
  assert.equal(status.payload.manifestItemCount, 1);
  assert.equal(status.payload.galleryImageFileCount, 1);
  assert.equal(status.payload.missingReferencedImageCount, 1);
  assert.equal(status.payload.orphanImageFileCount, 1);
});

await withTemporaryStorage(async ({ storageDir, baseUrl, output }) => {
  await mkdir(storageDir, { recursive: true });
  await writeFile(path.join(storageDir, "manifest.json"), "{not valid json");

  const status = await requestJson(baseUrl, "/api/gallery/status", { headers: adminHeaders() });
  assert.equal(status.response.status, 200);
  assert.equal(status.payload.manifestStatus, "parse_error");
  assert.equal(status.payload.manifestItemCount, 0);

  const gallery = await requestJson(baseUrl, "/api/gallery");
  assert.equal(gallery.response.status, 200);
  assert.equal(gallery.payload.customCount, 0);
  assert.match(output.join(""), /Failed to parse manifest at/);

  const works = await requestText(baseUrl, "/works/");
  assert.equal(works.response.status, 200);
  assert.match(works.body, /귀여운 표정을 고른 작은 선물/);
});

console.log("gallery storage diagnostics: passed");
