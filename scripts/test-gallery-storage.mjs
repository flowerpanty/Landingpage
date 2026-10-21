import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
  const captionOnlyCard = works.body.match(/<article class="nm-work-card"[^>]*>[\s\S]*?진단용 쿠키 사진[\s\S]*?<\/article>/)?.[0] || "";
  assert.ok(captionOnlyCard);
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
  assert.equal(upload.payload.item.caseSlug, undefined, "legacy upload must not acquire an SEO case URL");
  assert.doesNotMatch((await requestText(baseUrl, "/works-sitemap.xml")).body, /<url>/, "legacy uploads stay out of the case sitemap");

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

await withTemporaryStorage(async ({ storageDir, baseUrl, output }) => {
  const upload = (body, headers = adminHeaders()) => requestJson(baseUrl, "/api/gallery", {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl: `data:image/png;base64,${TINY_PNG}`, ...body })
  });
  const input = { caption: '마곡 기업 세미나 브루키 <img src=x onerror=alert(1)>', purpose: "기업행사", product: "브루키", context: '회사 세미나 "참석자"', quantity: 60,
    region: "마곡 & 강서구", packaging: "<b>행사 문구 추가</b>", fulfillment: "차량 퀵", caseNote: "첫째 줄\n</script><script>alert(1)</script>",
    href: "/corporate-gift/", seoPublished: true };
  assert.equal((await upload(input, {})).response.status, 403, "upload authentication stays required");
  const result = await upload(input);
  assert.equal(result.response.status, 201);
  const item = result.payload.item;
  assert.match(item.caseSlug, /^case-\d{8}-[a-f0-9]{8}$/);
  const casePath = `/works/${item.caseSlug}/`;
  const manifest = JSON.parse(await readFile(path.join(storageDir, "manifest.json"), "utf8"));
  assert.equal(manifest[0].caseSlug, item.caseSlug, "slug must be persisted");
  const page = await requestText(baseUrl, casePath);
  assert.equal(page.response.status, 200);
  assert.equal(page.response.headers.get("cache-control"), "no-store");
  assert.match(page.body, new RegExp(`<link rel="canonical" href="https://nothingmatters.co.kr${casePath}">`));
  assert.match(page.body, /name="robots" content="index,follow,max-image-preview:large"/);
  assert.match(page.body, /<h1>마곡 기업 세미나 브루키 &lt;img src=x onerror=alert\(1\)&gt;<\/h1>/);
  assert.match(page.body, /<title>마곡 기업 세미나 브루키 &lt;img src=x onerror=alert\(1\)&gt; \| 낫띵메터스 제작 사례<\/title>/);
  assert.match(page.body, /<dt>수량<\/dt><dd>60개<\/dd>/);
  assert.match(page.body, /마곡 &amp; 강서구/);
  assert.match(page.body, /&lt;b&gt;행사 문구 추가&lt;\/b&gt;/);
  assert.match(page.body, /&lt;\/script&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(page.body, /<img src=x|<b>행사|<script>alert/);
  assert.match(page.body, /href="\/corporate-gift\/">관련 페이지 보기/);
  for (const field of ["og:title", "og:description", "og:image", "twitter:title", "twitter:description", "twitter:image"]) assert.ok(page.body.includes(`="${field}"`));
  const prefillHref = page.body.match(/href="(\/contact\/\?[^\"]+)"/)[1].replace(/&amp;/g, "&");
  const query = new URL(prefillHref, baseUrl).searchParams;
  assert.deepEqual(Object.fromEntries(query), { reference: input.caption, purpose: input.purpose, product: input.product, quantity: "60", fulfillment: input.fulfillment });
  const schema = JSON.parse(page.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(schema["@graph"].map((node) => node["@type"]), ["WebPage", "BreadcrumbList"]);
  assert.equal(schema["@graph"][0].datePublished, item.createdAt); assert.equal(schema["@graph"][0].dateModified, item.createdAt);
  const head = await fetch(`${baseUrl}${casePath}`, { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
  // Change only the temporary manifest fixture; no edit API is added.
  for (const unpublished of [false, "true"]) {
    await writeFile(path.join(storageDir, "manifest.json"), JSON.stringify([{ ...item, seoPublished: unpublished }]));
    assert.equal((await fetch(baseUrl + casePath)).status, 404, "only boolean true publishes a case");
    assert.ok(!(await requestText(baseUrl, "/works-sitemap.xml")).body.includes(casePath));
  }
  await writeFile(path.join(storageDir, "manifest.json"), JSON.stringify([{ ...item, caption: "수정된 실제 사례 제목" }]));
  const renamed = await requestText(baseUrl, casePath);
  assert.equal(renamed.response.status, 200); assert.match(renamed.body, /<h1>수정된 실제 사례 제목<\/h1>/);
  assert.ok(renamed.body.includes(`href="https://nothingmatters.co.kr${casePath}"`), "persisted case URLs remain stable across title changes");
  await writeFile(path.join(storageDir, "manifest.json"), JSON.stringify([item]));
  const sitemap = await requestText(baseUrl, "/works-sitemap.xml");
  assert.equal(sitemap.response.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.ok(sitemap.body.includes(`https://nothingmatters.co.kr${casePath}`));
  assert.ok(sitemap.body.includes(`<lastmod>${item.createdAt.slice(0, 10)}</lastmod>`));
  const works = await requestText(baseUrl, "/works/");
  assert.ok(works.body.includes(`href="${casePath}">사례 자세히 보기 →</a>`));
  assert.match(works.body, /data-work-purpose="기업행사" data-work-product="브루키" data-work-quantity="60"/);
  assert.match(works.body, /총 1개의 제작 사례/);
  for (const body of [page.body, works.body, sitemap.body, JSON.stringify((await requestJson(baseUrl, "/api/gallery")).payload)]) {
    assert.ok(!body.includes(TOKEN)); assert.ok(!body.includes(storageDir)); assert.ok(!body.includes("GALLERY_ADMIN_TOKEN"));
  }
  const beforeInvalidFiles = await readdir(storageDir);
  const beforeInvalidManifest = await readFile(path.join(storageDir, "manifest.json"), "utf8");
  for (const field of ["caption", "purpose", "product", "context", "quantity", "fulfillment"]) {
    const invalid = { ...input }; delete invalid[field];
    assert.equal((await upload(invalid)).response.status, 400, `SEO publication requires ${field}`);
  }
  for (const change of [{ quantity: 1.5 }, { quantity: 0 }, { quantity: 100001 }, { quantity: "60" }, { quantity: null }, { purpose: "추정한 용도" }, { product: "미등록 제품" }, { fulfillment: "택배" }, { seoPublished: "true" }, { caption: "가".repeat(81) }, { caseSlug: "case-20261017-a31f4c8d" }]) {
    assert.equal((await upload({ ...input, ...change })).response.status, 400);
  }
  assert.deepEqual(await readdir(storageDir), beforeInvalidFiles, "invalid registrations must leave no orphan image files");
  assert.equal(await readFile(path.join(storageDir, "manifest.json"), "utf8"), beforeInvalidManifest);
  const shipping = await upload({ caption: "택배로 전달한 COOKIE FLIGHT", purpose: "작은 선물", product: "COOKIE FLIGHT", context: "선물", quantity: 3, fulfillment: "택배 배송", seoPublished: true });
  assert.equal(shipping.response.status, 201, "shipping is allowed as actual production metadata");
  assert.equal(shipping.payload.item.fulfillment, "택배 배송");
  const shippingPath = `/works/${shipping.payload.item.caseSlug}/`;
  const shippingPage = await requestText(baseUrl, shippingPath);
  assert.equal(shippingPage.response.status, 200);
  assert.match(shippingPage.body, /<dt>수령 방식<\/dt><dd>택배 배송<\/dd>/);
  assert.match((await requestText(baseUrl, "/works/")).body, /<dt>수령 방식<\/dt><dd>택배 배송<\/dd>/);
  assert.equal((await requestJson(baseUrl, `/api/gallery/${shipping.payload.item.id}`, { method: "DELETE", headers: adminHeaders() })).response.status, 200);
  const minimal = await upload({ caption: "입력한 기본 사례", purpose: "작은 선물", product: "행운쿠키", context: "선물", quantity: 1, fulfillment: "상담 후 결정", seoPublished: true, href: "https://example.com/not-public" });
  assert.equal(minimal.response.status, 201);
  const minimalPath = `/works/${minimal.payload.item.caseSlug}/`;
  const minimalPage = await requestText(baseUrl, minimalPath);
  assert.doesNotMatch(minimalPage.body, /<dt>지역<|<dt>포장·문구<|관련 페이지 보기|회사명|고객명|마곡|공항동 작업실/);
  await rm(path.join(storageDir, minimal.payload.item.filename));
  assert.equal((await fetch(baseUrl + minimalPath)).status, 404, "missing image excludes the case page");
  assert.ok(!(await requestText(baseUrl, "/works-sitemap.xml")).body.includes(minimalPath));
  for (const invalidPath of ["/works/case-not-valid/", "/works/case-20261017-ABCDEF12/", "/works/case-20261017-a31f4c8d/", casePath + "extra/"]) assert.equal((await fetch(baseUrl + invalidPath)).status, 404);
  await requestJson(baseUrl, `/api/gallery/${item.id}`, { method: "DELETE", headers: adminHeaders() });
  assert.equal((await fetch(baseUrl + casePath)).status, 404);
  assert.ok(!(await requestText(baseUrl, "/works-sitemap.xml")).body.includes(casePath), "deletion immediately removes sitemap entry");
  await sleep(20); assert.ok(!output.join("").includes(TOKEN), "admin token must not be logged");
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

console.log("gallery storage diagnostics: legacy compatibility, SEO case GET/HEAD + sitemap/delete, strict validation/no orphan images, escaped HTML/JSON-LD/attributes, no secret/path leaks PASS");
