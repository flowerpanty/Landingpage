import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_PAGE_DATA_PATH = path.join(ROOT, "data/site-pages.json");
const HOME_PATH = path.join(ROOT, "index.html");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const SITE_URL = "https://nothingmatters.co.kr";
const KAKAO_URL = "https://pf.kakao.com/_QdCaK/chat";
const isCheckMode = process.argv.includes("--check");
const IMAGE_OPTIMIZATIONS = {
  "/images/main-order-brookie-thumb.png": {
    optimized: "/images/main-order-brookie-thumb-optimized.jpg",
    width: 1024,
    height: 1536
  },
  "/images/handmade-cookie-flavor-lineup.png": {
    optimized: "/images/handmade-cookie-flavor-lineup-optimized.jpg",
    width: 1064,
    height: 798
  }
};

const sitePageData = JSON.parse(fs.readFileSync(SITE_PAGE_DATA_PATH, "utf8"));
const products = (sitePageData.products || []).map((product) => ({
  ...product,
  detailPath: product.primaryUrl
}));
const requiredFields = [
  "name",
  "slug",
  "description",
  "thumbnail",
  "images",
  "status",
  "category",
  "orderUrl",
  "detailPath",
  "updatedAt",
];

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validateProducts() {
  const errors = [];
  const slugs = new Set();

  products.forEach((product, index) => {
    requiredFields.forEach((field) => {
      if (product[field] == null || product[field] === "") {
        errors.push(`products[${index}].${field} is required`);
      }
    });

    if (!Array.isArray(product.images) || product.images.length < 2) {
      errors.push(`products[${index}].images must contain at least 2 images`);
    }

    if (product.detailPageMode === "generated" && !/^\d{4}-\d{2}-\d{2}$/.test(product.updatedAt || "")) {
      errors.push(`products[${index}].updatedAt must use YYYY-MM-DD`);
    }

    if (!["generated", "existing"].includes(product.detailPageMode)) {
      errors.push(`products[${index}].detailPageMode must be generated or existing`);
    }

    if (!/^\/[\w/-]+\/$/.test(product.detailPath)) {
      errors.push(`products[${index}].detailPath must be a public trailing-slash route`);
    }

    if (product.detailPageMode === "existing") {
      const existingPath = path.join(ROOT, product.detailPath.slice(1), "index.html");
      if (!fs.existsSync(existingPath)) {
        errors.push(`products[${index}].detailPath does not have an existing HTML page: ${product.detailPath}`);
      }
    }

    if (slugs.has(product.slug)) errors.push(`duplicate slug: ${product.slug}`);
    slugs.add(product.slug);
  });

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
}

function homeAssetPath(value) {
  return value.replace(/^\//, "");
}

function homeLinkPath(value) {
  return value.replace(/^\/+/, "");
}

function detailAssetPath(value) {
  return `../../${value.replace(/^\//, "")}`;
}

function renderProductCard(product) {
  const status = product.cardStatus === "new"
    ? '\n              <span class="showroom-product-badge">NEW</span>'
    : "";
  const homeCard = product.homeCard || {};
  const tags = (homeCard.tags || [])
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");
  const cardMeta = homeCard.orderInfo
    ? `\n              <p class="showroom-product-order-info">${escapeHtml(homeCard.orderInfo)}</p>`
    : "";
  const cardTags = tags
    ? `\n              <div class="showroom-product-tags" aria-label="${escapeHtml(product.name)} 특징">${tags}</div>`
    : "";
  const imageOptimization = IMAGE_OPTIMIZATIONS[product.thumbnail];
  const thumbnail = imageOptimization
    ? `              <picture>\n                <source srcset="${escapeHtml(homeAssetPath(imageOptimization.optimized))}" type="image/jpeg">\n                <img src="${escapeHtml(homeAssetPath(product.thumbnail))}" width="${imageOptimization.width}" height="${imageOptimization.height}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async">\n              </picture>`
    : `              <img src="${escapeHtml(homeAssetPath(product.thumbnail))}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async">`;

  return `          <a class="showroom-product-card" href="${escapeHtml(homeLinkPath(product.detailPath))}" data-reveal data-analytics-event="product_click" data-analytics-label="${escapeHtml(product.name)}">
            <figure class="showroom-product-photo">
${thumbnail}${status}
            </figure>
            <div class="showroom-product-copy">
              <div class="showroom-product-text">
                <small>${escapeHtml(homeCard.englishName || product.badge || product.category)}</small>
                <h3>${escapeHtml(product.name)}</h3>
                <p>${escapeHtml(product.description)}</p>
${cardTags}${cardMeta}
              </div>
              <span class="showroom-product-go">제품 보기 →</span>
            </div>
          </a>`;
}

function renderNewArrival(product) {
  const heroImage = product.heroImage || product.images[1] || product.thumbnail;

  return `        <article class="showroom-new-card" data-reveal>
          <span class="showroom-new-badge">NEW</span>
          <div class="showroom-new-copy">
            <p class="showroom-eyebrow">${escapeHtml(product.badge || product.category)}</p>
            <h2>${escapeHtml(product.name)}</h2>
            <p>${escapeHtml(product.description)}</p>
            <a class="showroom-button showroom-button--dark" href="${escapeHtml(homeLinkPath(product.detailPath))}" data-analytics-event="product_click" data-analytics-label="${escapeHtml(product.name)}">구경하기 →</a>
          </div>
          <figure class="showroom-new-photo">
            <img src="${escapeHtml(homeAssetPath(heroImage))}" alt="${escapeHtml(product.name)} 신제품" loading="eager" decoding="async">
          </figure>
          <span class="showroom-new-note" aria-hidden="true">new cookie<br>on board!</span>
        </article>`;
}

function replaceManagedBlock(source, name, content) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);

  if (!pattern.test(source)) {
    throw new Error(`Missing managed block: ${name}`);
  }

  return source.replace(pattern, `${start}\n${content}\n        ${end}`);
}

function renderProductPage(product) {
  const canonical = `${SITE_URL}${product.detailPath}`;
  const primaryImage = `${SITE_URL}${product.thumbnail}`;
  const gallery = product.images
    .map(
      (image, index) => `          <figure class="showroom-detail-gallery-item">
            <img src="${escapeHtml(detailAssetPath(image))}" alt="${escapeHtml(product.name)} ${index + 1}" loading="${index === 0 ? "eager" : "lazy"}" ${index === 0 ? 'fetchpriority="high"' : ""} decoding="async">
          </figure>`
    )
    .join("\n");
  const features = (product.features || [])
    .map((feature) => `              <li>${escapeHtml(feature)}</li>`)
    .join("\n");
  const recommendations = (product.recommendedFor || [])
    .map((item) => `            <li>${escapeHtml(item)}</li>`)
    .join("\n");
  const secondaryAction =
    product.orderUrl === KAKAO_URL
      ? '<a class="showroom-button showroom-button--paper" href="../../index.html#our-cookies">다른 쿠키 보기</a>'
      : `<a class="showroom-button showroom-button--paper" href="${KAKAO_URL}" target="_blank" rel="noopener noreferrer">카카오톡 문의</a>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(product.name)} | 낫띵메터스</title>
  <meta name="description" content="${escapeHtml(product.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta name="naver-site-verification" content="e627e1eaae68060408cb4e512e46d6b98a64401c">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(product.name)} | 낫띵메터스">
  <meta property="og:description" content="${escapeHtml(product.description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${primaryImage}">
  <meta property="og:image:alt" content="${escapeHtml(product.name)} 대표 이미지">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(product.name)} | 낫띵메터스">
  <meta name="twitter:description" content="${escapeHtml(product.description)}">
  <meta name="twitter:image" content="${primaryImage}">
  <link rel="icon" type="image/svg+xml" href="../../images/nm-bear-mark.svg">
  <link rel="stylesheet" href="../../assets/site.css">
  <link rel="stylesheet" href="../../assets/showroom.css">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-DR5XLDB042"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-DR5XLDB042');
  </script>
</head>
<body class="theme-showroom theme-showroom-detail">
  <div class="showroom-page">
    <header class="showroom-header">
      <div class="showroom-wrap showroom-header-inner">
        <a class="showroom-logo" href="../../index.html" aria-label="낫띵메터스 메인">
          <img src="../../images/nm-bear-mark.svg" alt="" width="34" height="34">
          <span>NOTHINGMATTERS</span>
        </a>
        <nav class="showroom-nav" aria-label="주요 메뉴">
          <a href="../../index.html#our-cookies">쿠키</a>
          <a href="../../works/">제작 사례</a>
          <a href="../../pickup/">픽업</a>
          <a href="https://blog.nothingmatters.co.kr/" target="_blank" rel="noopener noreferrer" data-analytics-event="blog_header_click">BLOG</a>
        </nav>
        <a class="showroom-header-cta" data-kakao-float="true" href="${KAKAO_URL}" target="_blank" rel="noopener noreferrer" data-analytics-event="consult_click">주문·문의</a>
      </div>
    </header>

    <main>
      <nav class="showroom-wrap showroom-breadcrumb" aria-label="현재 위치">
        <a href="../../index.html">HOME</a><span aria-hidden="true">/</span><a href="../../index.html#our-cookies">OUR COOKIES</a><span aria-hidden="true">/</span><strong>${escapeHtml(product.name)}</strong>
      </nav>

      <section class="showroom-detail-hero">
        <div class="showroom-wrap showroom-detail-hero-grid">
          <figure class="showroom-detail-main-photo" data-reveal>
            <img src="${escapeHtml(detailAssetPath(product.thumbnail))}" alt="${escapeHtml(product.name)}" loading="eager" fetchpriority="high" decoding="async">
          </figure>
          <div class="showroom-detail-copy" data-reveal>
            ${product.status === "new" ? '<span class="showroom-new-badge">NEW</span>' : ""}
            <p class="showroom-eyebrow">${escapeHtml(product.badge || product.category)}</p>
            <h1>${escapeHtml(product.name)}</h1>
            <p class="showroom-detail-lead">${escapeHtml(product.description)}</p>
            <dl class="showroom-detail-meta">
              <div><dt>가격</dt><dd>${escapeHtml(product.priceHint || "상담 후 안내")}</dd></div>
              <div><dt>주문 기준</dt><dd>${escapeHtml(product.minOrder || "수량 상담")}</dd></div>
            </dl>
            <ul class="showroom-detail-features">
${features}
            </ul>
            <div class="showroom-detail-actions">
              <a class="showroom-button showroom-button--dark" href="${escapeHtml(product.orderUrl)}" target="_blank" rel="noopener noreferrer" data-analytics-event="${product.orderUrl === KAKAO_URL ? "consult_click" : "order_start"}">${escapeHtml(product.ctaLabel || "견적·주문하기")}</a>
              ${secondaryAction}
            </div>
          </div>
        </div>
      </section>

      <section class="showroom-detail-section" id="package">
        <div class="showroom-wrap">
          <div class="showroom-section-heading" data-reveal>
            <p class="showroom-eyebrow">PACKAGE & DETAILS</p>
            <h2>이렇게 준비해요.</h2>
            <p>${escapeHtml(product.package || product.description)}</p>
          </div>
          <div class="showroom-detail-gallery">
${gallery}
          </div>
        </div>
      </section>

      <section class="showroom-detail-section showroom-detail-recommend">
        <div class="showroom-wrap showroom-detail-recommend-grid">
          <div>
            <p class="showroom-eyebrow">GOOD FOR</p>
            <h2>이런 날에 추천해요.</h2>
          </div>
          <ul>
${recommendations}
          </ul>
        </div>
      </section>

      <section class="showroom-detail-final">
        <div class="showroom-wrap showroom-detail-final-inner" data-reveal>
          <div>
            <p class="showroom-eyebrow">NEED A SPECIAL COOKIE?</p>
            <h2>수량과 날짜만 알려주세요.</h2>
            <p>가능한 구성과 제작 일정을 빠르게 안내해드릴게요.</p>
          </div>
          <a class="showroom-button showroom-button--dark" href="${escapeHtml(product.orderUrl)}" target="_blank" rel="noopener noreferrer" data-analytics-event="${product.orderUrl === KAKAO_URL ? "consult_click" : "order_start"}">${escapeHtml(product.ctaLabel || "견적·주문하기")}</a>
        </div>
      </section>
    </main>

    <footer class="showroom-footer">
      <div class="showroom-wrap">
        <strong>NOTHINGMATTERS</strong>
        <p>서울특별시 강서구 송정로 25 1층 · 010-2866-7976</p>
      </div>
    </footer>
  </div>
  <script src="../../assets/site.js"></script>
  <script src="../../assets/seo.js"></script>
</body>
</html>
`;
}

function buildHome() {
  const home = fs.readFileSync(HOME_PATH, "utf8");
  const newProducts = products.filter((product) => product.cardStatus === "new");
  const next = replaceManagedBlock(
    replaceManagedBlock(home, "NM_NEW_ARRIVAL", newProducts.map(renderNewArrival).join("\n")),
    "NM_PRODUCT_GRID",
    products.map(renderProductCard).join("\n")
  );

  if (isCheckMode) {
    if (next !== home) throw new Error("index.html product blocks are out of date");
  } else if (next !== home) {
    fs.writeFileSync(HOME_PATH, next);
  }
}

function stripStaticSchema(html) {
  return html.replace(/\n?\s*<script type="application\/ld\+json" data-nm-schema="static">[\s\S]*?<\/script>\n?/g, "\n");
}

function getExistingProductMetadata(product) {
  const canonical = `${SITE_URL}${product.detailPath}`;
  const image = `${SITE_URL}${product.thumbnail}`;
  const title = `${product.name} | 낫띵메터스`;

  return `<!-- NM_EXISTING_PRODUCT_META:START -->
  <meta name="description" content="${escapeHtml(product.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta name="naver-site-verification" content="e627e1eaae68060408cb4e512e46d6b98a64401c">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(product.description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:alt" content="${escapeHtml(product.name)} 대표 이미지">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(product.description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <!-- NM_EXISTING_PRODUCT_META:END -->`;
}

function upsertExistingProductMetadata(html, product) {
  const metadata = getExistingProductMetadata(product);
  const withoutManagedBlock = html.replace(
    /\s*<!-- NM_EXISTING_PRODUCT_META:START -->[\s\S]*?<!-- NM_EXISTING_PRODUCT_META:END -->/,
    ""
  );
  const title = `${product.name} | 낫띵메터스`;
  const withoutConflictingTags = withoutManagedBlock
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["'](?:description|robots|twitter:card|twitter:title|twitter:description|twitter:image)["'][^>]*>/gi, "")
    .replace(/<meta\s+property=["']og:(?:type|title|description|url|image|image:alt)["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "");

  const withMetadata = withoutConflictingTags.replace(
    /<head(\s[^>]*)?>/i,
    (headTag) => `${headTag}\n  <title>${escapeHtml(title)}</title>\n  ${metadata}`
  );

  return withMetadata.replace(
    /(<!-- NM_EXISTING_PRODUCT_META:END -->)\s*(?=<(?:meta|base|style|link|script))/i,
    "$1\n  "
  );
}

function buildExistingProductPages() {
  products
    .filter((product) => product.detailPageMode === "existing")
    .forEach((product) => {
      const outputPath = path.join(ROOT, product.detailPath.slice(1), "index.html");
      const current = fs.readFileSync(outputPath, "utf8");
      const expected = upsertExistingProductMetadata(current, product);

      if (isCheckMode) {
        if (expected !== current) throw new Error(`${product.detailPath} existing product metadata is out of date`);
        return;
      }

      if (expected !== current) fs.writeFileSync(outputPath, expected);
    });
}

function buildDetailPages() {
  products
    .filter((product) => product.detailPageMode === "generated")
    .forEach((product) => {
      const outputPath = path.join(ROOT, product.detailPath.replace(/^\//, ""), "index.html");
      const expected = renderProductPage(product);

      if (isCheckMode) {
        if (!fs.existsSync(outputPath)) throw new Error(`${product.detailPath} is missing`);
        const actual = stripStaticSchema(fs.readFileSync(outputPath, "utf8"));
        if (actual !== expected) throw new Error(`${product.detailPath} is out of date`);
        return;
      }

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, expected);
    });
}

function buildSitemap() {
  const staticEntries = sitePageData.pages
    .filter((page) => page.sitemap && page.indexing === "index")
    .map((page) => ({
      loc: `${SITE_URL}${page.path}`,
      lastmod: page.lastmod,
    }));
  const productEntries = products
    .filter((product) => {
      const outputPath = path.join(ROOT, product.detailPath.slice(1), "index.html");
      return ["generated", "existing"].includes(product.detailPageMode) && fs.existsSync(outputPath);
    })
    .map((product) => ({
      loc: `${SITE_URL}${product.detailPath}`,
      lastmod: product.updatedAt,
    }));
  const entries = [...staticEntries, ...productEntries];
  const seen = new Set();
  const body = entries
    .filter((entry) => {
      if (seen.has(entry.loc)) return false;
      seen.add(entry.loc);
      return true;
    })
    .map((entry) => `  <url>\n    <loc>${entry.loc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`)
    .join("\n");
  const next = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

  if (isCheckMode) {
    if (next !== fs.readFileSync(SITEMAP_PATH, "utf8")) {
      throw new Error("sitemap.xml is out of date with data/site-pages.json and products");
    }
  } else {
    fs.writeFileSync(SITEMAP_PATH, next);
  }
}

try {
  validateProducts();
  buildHome();
  buildDetailPages();
  buildExistingProductPages();
  buildSitemap();
  console.log(`products: ${isCheckMode ? "checked" : "built"} ${products.length} products`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
