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

  const upload = await requestJson(baseUrl, "/api/gallery", {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      dataUrl: `data:image/png;base64,${TINY_PNG}`,
      caption: "진단용 쿠키 사진",
      href: "/products/handmade-cookie/"
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
});

console.log("gallery storage diagnostics: passed");
