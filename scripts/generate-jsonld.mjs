import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUSINESS_FACTS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/business.json"), "utf8"));
const SITE_URL = BUSINESS_FACTS.siteUrl;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const LOCAL_BUSINESS_ID = `${SITE_URL}/#localbusiness`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const STATIC_SCHEMA_REGEX =
  /\n?\s*<script type="application\/ld\+json" data-nm-schema="static">[\s\S]*?<\/script>\n?/;
const SITE_PAGE_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "data/site-pages.json"), "utf8"));
const PRODUCT_CATALOG = (SITE_PAGE_DATA.products || []).map((product) => ({
  ...product,
  detailPath: product.primaryUrl
}));
const WORK_REGISTRY_BY_HREF = new Map();
for (const product of PRODUCT_CATALOG) {
  if (product.primaryUrl) WORK_REGISTRY_BY_HREF.set(product.primaryUrl, product);
}
for (const page of SITE_PAGE_DATA.pages || []) {
  if (page.path) WORK_REGISTRY_BY_HREF.set(page.path, page);
  if (page.product?.primaryUrl) WORK_REGISTRY_BY_HREF.set(page.product.primaryUrl, page);
}
const WORK_ITEM_LIST = (SITE_PAGE_DATA.works || []).map((item, index) => {
  const registryEntry = WORK_REGISTRY_BY_HREF.get(item.href);
  if (!registryEntry) throw new Error(`works item href is missing from the site registry: ${item.href}`);
  return [item.workCardLabel || registryEntry.workCardLabel || item.caption, item.href, index + 1];
});

const isCheckMode = process.argv.includes("--check");

const PRODUCT_META = {
  ...Object.fromEntries(
    (SITE_PAGE_DATA.pages || [])
      .filter((page) => page.product)
      .map((page) => [page.path, page.product])
  ),
  ...Object.fromEntries(
    PRODUCT_CATALOG.map((product) => [
      product.detailPath,
      {
        name: `nothingmatters ${product.name}`,
        price: product.price,
        lowPrice: product.lowPrice,
        minOrder: product.minOrder,
        category: product.category,
      },
    ])
  ),
};

const ITEM_LISTS = {
  "/": [
    ...PRODUCT_CATALOG.map((product) => [product.name, product.detailPath]),
    ["결혼식 답례품 쿠키 가이드", "/guides/wedding-favor-cookie/"],
    ["기업행사 쿠키 가이드", "/guides/corporate-event-cookie/"],
    ["소량 선물 쿠키 고르기", "/small-gift/"],
    ["마곡 쿠키·답례품", "/magok-cookie/"],
  ],
  "/bulk/": [
    ["결혼식 답례품 쿠키 가이드", "/guides/wedding-favor-cookie/"],
    ["기업행사 쿠키 가이드", "/guides/corporate-event-cookie/"],
    ["브라우니쿠키", "/products/brownie-cookie/"],
    ["수제꾸덕쿠키", "/products/handmade-cookie/"],
    ["행운쿠키", "/products/lucky-cookie/"],
  ],
  "/small-gift/": [
    ["수제꾸덕쿠키", "/products/handmade-cookie/"],
    ["행운쿠키", "/products/lucky-cookie/"],
    ["소량 선물 상담", "/contact/"],
  ],
  "/guides/": [
    ["쿠키 보관방법·맛있게 드시는 기간", "/guides/cookie-storage/"],
    ["마곡 쿠키·답례품", "/magok-cookie/"],
    ["결혼식 답례품 쿠키", "/guides/wedding-favor-cookie/"],
    ["기업행사 쿠키", "/guides/corporate-event-cookie/"],
    ["선생님 간식 선물", "/guides/teacher-snack-gift/"],
    ["퇴사 · 승진 답례품", "/guides/farewell-favor-cookie/"],
    ["디저트 선물세트", "/guides/dessert-gift-set/"],
    ["행운 · 응원 쿠키", "/guides/lucky-cheering-cookie/"],
  ],
  "/works/": WORK_ITEM_LIST,
  "/pickup/": [
    ["브루키", "/brookie/"],
    ["수제꾸덕쿠키", "/out/"],
    ["행운쿠키", "/out/fortune/"],
    ["쿠키크루", "/cookie-crew/"],
  ],
  "/magok-cookie/": [
    ["브루키", "/brookie/"],
    ["쿠키크루", "/cookie-crew/"],
    ["수제꾸덕쿠키", "/products/handmade-cookie/"],
    ["행운쿠키", "/products/lucky-cookie/"],
    ["터미널 샌드쿠키", "/products/terminal-sand-cookie/"],
    ["마곡 기업행사 쿠키", "/guides/corporate-event-cookie/"],
    ["공항동 픽업 안내", "/pickup/"],
  ],
};

const organization = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: BUSINESS_FACTS.brandName,
  alternateName: BUSINESS_FACTS.alternateName,
  url: SITE_URL,
  logo: absoluteUrl(BUSINESS_FACTS.logo),
  image: absoluteUrl(BUSINESS_FACTS.image),
  description: BUSINESS_FACTS.description,
  email: BUSINESS_FACTS.email,
  telephone: BUSINESS_FACTS.telephone,
  address: {
    "@type": "PostalAddress",
    ...BUSINESS_FACTS.address,
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: BUSINESS_FACTS.telephone,
      email: BUSINESS_FACTS.email,
      availableLanguage: ["ko-KR"],
    },
  ],
  areaServed: BUSINESS_FACTS.areaServed,
  sameAs: BUSINESS_FACTS.sameAs,
};

const localBusiness = {
  "@type": "Bakery",
  "@id": LOCAL_BUSINESS_ID,
  name: BUSINESS_FACTS.brandName,
  alternateName: BUSINESS_FACTS.alternateName,
  url: SITE_URL,
  image: absoluteUrl(BUSINESS_FACTS.image),
  description: BUSINESS_FACTS.localBusinessDescription,
  email: BUSINESS_FACTS.email,
  telephone: BUSINESS_FACTS.telephone,
  priceRange: BUSINESS_FACTS.priceRange,
  address: organization.address,
  areaServed: BUSINESS_FACTS.areaServed,
  hasMap: BUSINESS_FACTS.naverMapUrl,
  sameAs: BUSINESS_FACTS.sameAs,
  geo: BUSINESS_FACTS.geo
    ? {
        "@type": "GeoCoordinates",
        latitude: BUSINESS_FACTS.geo.latitude,
        longitude: BUSINESS_FACTS.geo.longitude,
      }
    : undefined,
  parentOrganization: {
    "@id": ORGANIZATION_ID,
  },
};

const website = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: SITE_URL,
  name: "nothingmatters 낫띵메터스",
  inLanguage: "ko-KR",
  publisher: {
    "@id": ORGANIZATION_ID,
  },
};

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function writeFile(relativePath, content) {
  fs.writeFileSync(path.join(ROOT, relativePath), content);
}

function decodeEntities(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value = "") {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[＋+−]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getAttribute(html, pattern) {
  return html.match(pattern)?.[1]?.trim() || "";
}

function getMetaContent(html, attribute, value) {
  return getAttribute(
    html,
    new RegExp(`<meta[^>]+${attribute}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']*)["']`, "i")
  );
}

function getCanonicalHref(html) {
  return getAttribute(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
}

function absoluteUrl(value, base = SITE_URL) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return new URL(value, base).href;
}

function filePathForUrl(loc) {
  const pathname = new URL(loc).pathname;
  if (pathname === "/") return "index.html";
  return path.join(pathname.slice(1), "index.html");
}

function getPageData(html, loc) {
  const url = new URL(loc);
  const canonical = getCanonicalHref(html) || loc;
  const registryPage = (SITE_PAGE_DATA.pages || []).find((entry) => entry.path === url.pathname);

  return {
    loc,
    path: url.pathname,
    pageUrl: absoluteUrl(canonical),
    title: cleanText(getAttribute(html, /<title>([\s\S]*?)<\/title>/i)),
    description: cleanText(
      getAttribute(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    ),
    ogImage: absoluteUrl(
      getAttribute(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        "/images/heart-badge.png"
    ),
    h1: cleanText(getAttribute(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)),
    breadcrumbName: registryPage?.breadcrumbName || "",
    status: registryPage?.status || "",
    indexing: registryPage?.indexing || "",
    lastmod: registryPage?.lastmod || "",
  };
}

function getPageType(pathname) {
  if (pathname === "/" || pathname === "/works/") return "CollectionPage";
  if (pathname === "/contact/") return "ContactPage";
  if (pathname === "/guides/") return "CollectionPage";
  if (pathname.startsWith("/products/")) return "ProductPage";
  if (pathname === "/bulk/" || pathname === "/small-gift/") return "CollectionPage";
  return "WebPage";
}

function buildBreadcrumb(page) {
  if (page.path === "/") return null;

  const items = [{ name: "쿠키 메인", item: SITE_URL }];

  if (page.path.startsWith("/guides/") && page.path !== "/guides/") {
    items.push({ name: "가이드 허브", item: `${SITE_URL}/guides/` });
  } else if (page.path.startsWith("/products/")) {
    items.push({ name: "쿠키 라인업", item: `${SITE_URL}/#ready-order` });
  }

  items.push({
    name: page.breadcrumbName || page.h1 || page.title.replace(/\s*\|\s*nothingmatters.*$/i, ""),
    item: page.pageUrl,
  });

  return {
    "@type": "BreadcrumbList",
    "@id": `${page.pageUrl}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}

function buildFaq(html, page) {
  const questions = [];
  const seen = new Set();

  for (const match of html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)) {
    const block = match[1];
    const question = cleanText(block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || "");
    const answer = cleanText(block.replace(/<summary\b[^>]*>[\s\S]*?<\/summary>/i, " "));
    if (!question || !answer || seen.has(question)) continue;
    seen.add(question);
    questions.push({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    });
  }

  for (const match of html.matchAll(/<article\b[^>]*class=["'][^"']*nm-faq-item[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi)) {
    const block = match[1];
    const question = cleanText(
      block.match(/<button\b[^>]*class=["'][^"']*nm-faq-question[^"']*["'][^>]*>([\s\S]*?)<\/button>/i)?.[1] ||
        ""
    );
    const answer = cleanText(
      block.match(/<div\b[^>]*class=["'][^"']*nm-faq-answer[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
        ""
    );
    if (!question || !answer || seen.has(question)) continue;
    seen.add(question);
    questions.push({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    });
  }

  if (!questions.length) return null;

  return {
    "@type": "FAQPage",
    "@id": `${page.pageUrl}#faq`,
    mainEntity: questions,
  };
}

function buildItemList(page) {
  const items = ITEM_LISTS[page.path];
  if (!items?.length) return null;

  return {
    "@type": "ItemList",
    "@id": `${page.pageUrl}#itemlist`,
    itemListElement: items.map(([name, url, position], index) => ({
      "@type": "ListItem",
      position: position || index + 1,
      name,
      url: absoluteUrl(url),
    })),
  };
}

function buildProduct(page) {
  const meta = PRODUCT_META[page.path];
  if (!meta) return null;

  const product = {
    "@type": "Product",
    "@id": `${page.pageUrl}#product`,
    name: meta.name,
    description: page.description,
    image: [page.ogImage],
    url: page.pageUrl,
    brand: {
      "@id": ORGANIZATION_ID,
    },
    category: meta.category,
  };

  if (meta.price != null) {
    product.offers = {
      "@type": "Offer",
      url: page.pageUrl,
      price: meta.price,
      priceCurrency: "KRW",
      availability: "https://schema.org/InStoreOnly",
      seller: { "@id": ORGANIZATION_ID },
    };
  } else if (meta.lowPrice != null) {
    product.offers = {
      "@type": "AggregateOffer",
      url: page.pageUrl,
      lowPrice: meta.lowPrice,
      priceCurrency: "KRW",
      availability: "https://schema.org/InStoreOnly",
      seller: { "@id": ORGANIZATION_ID },
    };
  }

  const properties = [
    meta.minOrder
      ? { "@type": "PropertyValue", name: "주문 기준", value: meta.minOrder }
      : null,
    {
      "@type": "PropertyValue",
      name: "수령 방식",
      value: "강서구 공항동 예약 픽업 또는 일정·수량에 따른 차량 퀵 상담",
    },
  ].filter(Boolean);

  if (properties.length) product.additionalProperty = properties;
  return product;
}

function buildService(page) {
  if (page.path === "/pickup/") {
    return {
      "@type": "Service",
      "@id": `${page.pageUrl}#service`,
      name: "김포공항 인근 공항동 쿠키 예약 픽업",
      serviceType: "쿠키·디저트 선물 예약 픽업",
      provider: { "@id": LOCAL_BUSINESS_ID },
      url: page.pageUrl,
      areaServed: ["공항동", "김포공항", "송정역"],
      description: "김포공항 안이 아닌 공항동 예약 픽업 전용 작업실에서 예약한 쿠키를 수령하는 서비스입니다. 방문 전 픽업 예약이 필요합니다.",
    };
  }

  if (page.path === "/magok-cookie/") {
    return {
      "@type": "Service",
      "@id": `${page.pageUrl}#service`,
      name: "마곡 답례품·기업행사 쿠키 제작 상담",
      serviceType: "답례품·기업행사 쿠키 제작",
      provider: { "@id": LOCAL_BUSINESS_ID },
      url: page.pageUrl,
      areaServed: "마곡",
      description: "실제 작업실은 공항동에 있으며 마곡 기업행사·단체 답례품을 상담합니다. 차량 퀵은 일정과 수량에 따라 안내합니다.",
    };
  }

  if (page.path !== "/contact/") return null;

  return {
    "@type": "Service",
    "@id": `${page.pageUrl}#service`,
    name: "쿠키 답례품 및 행사 주문 상담",
    serviceType: "답례품, 행사 간식, 커스텀 디저트 주문 상담",
    provider: {
      "@id": ORGANIZATION_ID,
    },
    areaServed: "KR",
    availableChannel: [
      {
        "@type": "ServiceChannel",
        serviceUrl: page.pageUrl,
        servicePhone: {
          "@type": "ContactPoint",
          telephone: BUSINESS_FACTS.telephone,
        },
      },
    ],
  };
}

function buildWebPage(page, breadcrumb, itemList, product, service) {
  const schema = {
    "@type": getPageType(page.path),
    "@id": `${page.pageUrl}#webpage`,
    url: page.pageUrl,
    name: page.title.replace(/\s*\|\s*nothingmatters.*$/i, ""),
    description: page.description,
    inLanguage: "ko-KR",
    isPartOf: {
      "@id": WEBSITE_ID,
    },
    publisher: {
      "@id": ORGANIZATION_ID,
    },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: page.ogImage,
    },
  };

  if (page.indexing === "index" && page.lastmod) schema.dateModified = page.lastmod;
  if (breadcrumb) schema.breadcrumb = { "@id": breadcrumb["@id"] };
  if (page.path === "/") schema.about = { "@id": LOCAL_BUSINESS_ID };
  if (["/magok-cookie/", "/pickup/"].includes(page.path)) schema.about = { "@id": LOCAL_BUSINESS_ID };
  if (product) schema.about = { "@id": product["@id"] };
  const mainEntities = [itemList, service].filter(Boolean).map((entry) => ({ "@id": entry["@id"] }));
  if (mainEntities.length === 1) schema.mainEntity = mainEntities[0];
  if (mainEntities.length > 1) schema.mainEntity = mainEntities;

  return schema;
}

function buildSchema(html, loc) {
  const page = getPageData(html, loc);
  const breadcrumb = buildBreadcrumb(page);
  const faq = buildFaq(html, page);
  const itemList = buildItemList(page);
  const product = buildProduct(page);
  const service = buildService(page);
  const webPage = buildWebPage(page, breadcrumb, itemList, product, service);
  const graph = [organization, localBusiness, website, webPage];

  if (breadcrumb) graph.push(breadcrumb);
  if (itemList) graph.push(itemList);
  if (product) graph.push(product);
  if (service) graph.push(service);
  if (faq) graph.push(faq);

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

function renderSchemaScript(schema) {
  return `  <script type="application/ld+json" data-nm-schema="static">\n${JSON.stringify(schema, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}\n  </script>\n`;
}

function insertSchema(html, schema) {
  const script = renderSchemaScript(schema);
  if (STATIC_SCHEMA_REGEX.test(html)) {
    return html.replace(STATIC_SCHEMA_REGEX, () => `\n${script}`);
  }
  return html.replace(/<\/head>/i, () => `${script}</head>`);
}

function ensureSocialMetadata(html, loc) {
  const page = getPageData(html, loc);
  const additions = [];
  const twitterTitle = getMetaContent(html, "property", "og:title") || page.title;
  const twitterDescription = getMetaContent(html, "property", "og:description") || page.description;

  if (!getMetaContent(html, "name", "twitter:card")) {
    additions.push('<meta name="twitter:card" content="summary_large_image">');
  }
  if (!getMetaContent(html, "name", "twitter:title") && twitterTitle) {
    additions.push(`<meta name="twitter:title" content="${escapeHtml(twitterTitle)}">`);
  }
  if (!getMetaContent(html, "name", "twitter:description") && twitterDescription) {
    additions.push(`<meta name="twitter:description" content="${escapeHtml(twitterDescription)}">`);
  }
  if (!getMetaContent(html, "name", "twitter:image") && page.ogImage) {
    additions.push(`<meta name="twitter:image" content="${escapeHtml(page.ogImage)}">`);
  }

  if (!additions.length) return html;
  return html.replace(/<\/head>/i, `  ${additions.join("\n  ")}\n</head>`);
}

function getStaticSchema(html) {
  const match = html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

function getGraphTypes(schema) {
  return new Set((schema?.["@graph"] || []).map((entry) => entry["@type"]));
}

const sitemap = readFile("sitemap.xml");
const locs = [...sitemap.matchAll(/<loc>(https:\/\/nothingmatters\.co\.kr[^<]+)<\/loc>/g)].map((match) => match[1]);
const failures = [];
const seenLocs = new Set();

for (const loc of locs) {
  if (seenLocs.has(loc)) failures.push(`sitemap.xml: duplicate loc ${loc}`);
  seenLocs.add(loc);

  const pathname = new URL(loc).pathname;
  if (/^\/(?:gallery-admin|dashboard|api)(?:\/|$)/.test(pathname)) {
    failures.push(`sitemap.xml: non-public route included ${pathname}`);
  }
}

for (const product of PRODUCT_CATALOG) {
  const productLoc = `${SITE_URL}${product.detailPath}`;
  if (!seenLocs.has(productLoc)) {
    failures.push(`sitemap.xml: missing product route ${product.detailPath}`);
  }
}

for (const loc of locs) {
  const relativePath = filePathForUrl(loc);
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing HTML file`);
    continue;
  }

  const html = readFile(relativePath);
  const expectedSchema = buildSchema(html, loc);

  if (isCheckMode) {
    try {
      const staticSchema = getStaticSchema(html);
      if (!staticSchema) {
        failures.push(`${relativePath}: missing static JSON-LD`);
        continue;
      }

      const types = getGraphTypes(staticSchema);
      for (const type of ["Organization", "Bakery", "WebSite", getPageType(new URL(loc).pathname)]) {
        if (!types.has(type)) failures.push(`${relativePath}: missing ${type}`);
      }

      const canonical = getCanonicalHref(html);
      if (!canonical) {
        failures.push(`${relativePath}: missing canonical`);
      } else if (absoluteUrl(canonical) !== loc) {
        failures.push(`${relativePath}: canonical does not match sitemap loc`);
      }

      if (!cleanText(getAttribute(html, /<title>([\s\S]*?)<\/title>/i))) {
        failures.push(`${relativePath}: missing title`);
      }
      if (!getMetaContent(html, "name", "description")) {
        failures.push(`${relativePath}: missing description`);
      }
      if (!getMetaContent(html, "name", "robots")) {
        failures.push(`${relativePath}: missing robots`);
      }
      for (const property of ["og:title", "og:description", "og:url", "og:image"]) {
        if (!getMetaContent(html, "property", property)) {
          failures.push(`${relativePath}: missing ${property}`);
        }
      }
      if (!getMetaContent(html, "name", "twitter:card")) {
        failures.push(`${relativePath}: missing twitter:card`);
      }
      if (!getPageData(html, loc).h1) failures.push(`${relativePath}: missing h1`);

      for (const type of ["Organization", "Bakery"]) {
        const entity = staticSchema["@graph"].find((entry) => entry["@type"] === type);
        if (!entity?.sameAs?.includes("https://instagram.com/nothingmatters_c")) {
          failures.push(`${relativePath}: ${type} missing official Instagram sameAs`);
        }
      }

      if (new URL(loc).pathname === "/") {
        for (const type of ["CollectionPage", "ItemList", "FAQPage"]) {
          if (!types.has(type)) failures.push(`${relativePath}: missing ${type}`);
        }
      }

      if (PRODUCT_META[new URL(loc).pathname]) {
        const product = staticSchema["@graph"].find((entry) => entry["@type"] === "Product");
        if (!product) {
          failures.push(`${relativePath}: missing Product`);
        } else {
          const expectedMeta = PRODUCT_META[new URL(loc).pathname];
          const hasPrice = expectedMeta.price != null || expectedMeta.lowPrice != null;
          if (hasPrice && !product.offers?.priceCurrency) {
            failures.push(`${relativePath}: missing Product offers priceCurrency`);
          } else if (hasPrice && product.offers.price == null && product.offers.lowPrice == null) {
            failures.push(`${relativePath}: missing Product offer price or lowPrice`);
          } else if (!hasPrice && product.offers) {
            failures.push(`${relativePath}: Product offers present without known price`);
          }
        }
      }
    } catch (error) {
      failures.push(`${relativePath}: ${error.message}`);
    }
  } else {
    const nextHtml = insertSchema(ensureSocialMetadata(html, loc), expectedSchema);
    if (nextHtml !== html) writeFile(relativePath, nextHtml);
    console.log(`schema: wrote ${relativePath}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

if (isCheckMode) {
  console.log(`schema: checked ${locs.length} pages`);
}
