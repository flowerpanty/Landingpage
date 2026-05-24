import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://nothingmatters.co.kr";
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const LOCAL_BUSINESS_ID = `${SITE_URL}/#localbusiness`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const STATIC_SCHEMA_REGEX =
  /\n?\s*<script type="application\/ld\+json" data-nm-schema="static">[\s\S]*?<\/script>\n?/;

const isCheckMode = process.argv.includes("--check");

const PRODUCT_META = {
  "/products/brownie-cookie/": {
    name: "nothingmatters 브루키 / 브라우니쿠키",
    lowPrice: 7800,
    minOrder: "최소 주문 수량 12개",
    category: "브라우니쿠키 답례품",
  },
  "/products/custom-brownie-cookie/": {
    name: "nothingmatters 커스텀 브라우니쿠키",
    lowPrice: 7800,
    minOrder: "보통 12개 이상 상담",
    category: "커스텀 브라우니쿠키",
  },
  "/products/handmade-cookie/": {
    name: "nothingmatters 수제꾸덕쿠키",
    lowPrice: 4500,
    minOrder: "대부분 최소 수량 없음",
    category: "수제쿠키 선물세트",
  },
  "/products/lucky-cookie/": {
    name: "nothingmatters 행운쿠키 4가지맛 세트",
    price: 15000,
    minOrder: "최소 1세트",
    category: "행운쿠키 선물세트",
  },
};

const ITEM_LISTS = {
  "/": [
    ["나만의 브루키 만들기", "https://thingmattersreserve-production.up.railway.app/brookie"],
    ["수제꾸덕쿠키 주문하기", "https://thingmattersreserve-production.up.railway.app/cookies"],
    ["행운쿠키 주문하기", "https://thingmattersreserve-production.up.railway.app/lucky"],
    ["결혼식 답례품 쿠키 가이드", "/guides/wedding-favor-cookie/"],
    ["기업행사 쿠키 가이드", "/guides/corporate-event-cookie/"],
    ["소량 선물 쿠키 고르기", "/small-gift/"],
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
    ["결혼식 답례품 쿠키", "/guides/wedding-favor-cookie/"],
    ["기업행사 쿠키", "/guides/corporate-event-cookie/"],
    ["선생님 간식 선물", "/guides/teacher-snack-gift/"],
    ["퇴사 · 승진 답례품", "/guides/farewell-favor-cookie/"],
    ["디저트 선물세트", "/guides/dessert-gift-set/"],
    ["행운 · 응원 쿠키", "/guides/lucky-cheering-cookie/"],
  ],
};

const organization = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "nothingmatters",
  alternateName: "낫띵메터스",
  url: SITE_URL,
  logo: `${SITE_URL}/images/heart-badge.png`,
  image: `${SITE_URL}/images/og-consult-cookie.png`,
  email: "eddiefactory@naver.com",
  telephone: "+82-10-2866-7976",
  address: {
    "@type": "PostalAddress",
    streetAddress: "상원12길 19 1층",
    addressLocality: "성동구",
    addressRegion: "서울특별시",
    postalCode: "04780",
    addressCountry: "KR",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: "+82-10-2866-7976",
      email: "eddiefactory@naver.com",
      availableLanguage: ["ko-KR"],
    },
  ],
  areaServed: "KR",
};

const localBusiness = {
  "@type": "Bakery",
  "@id": LOCAL_BUSINESS_ID,
  name: "nothingmatters",
  alternateName: "낫띵메터스",
  url: SITE_URL,
  image: `${SITE_URL}/images/og-consult-cookie.png`,
  email: "eddiefactory@naver.com",
  telephone: "+82-10-2866-7976",
  priceRange: "$$",
  address: organization.address,
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

function getAttribute(html, pattern) {
  return html.match(pattern)?.[1]?.trim() || "";
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
  const canonical =
    getAttribute(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || loc;

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
  };
}

function getPageType(pathname) {
  if (pathname === "/") return "CollectionPage";
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
    name: page.h1 || page.title.replace(/\s*\|\s*nothingmatters.*$/i, ""),
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
    itemListElement: items.map(([name, url], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      url: absoluteUrl(url),
    })),
  };
}

function buildProduct(page) {
  const meta = PRODUCT_META[page.path];
  if (!meta) return null;

  const offer =
    meta.price != null
      ? {
          "@type": "Offer",
          url: page.pageUrl,
          price: meta.price,
          priceCurrency: "KRW",
          availability: "https://schema.org/InStoreOnly",
          seller: { "@id": ORGANIZATION_ID },
        }
      : {
          "@type": "AggregateOffer",
          url: page.pageUrl,
          lowPrice: meta.lowPrice,
          priceCurrency: "KRW",
          availability: "https://schema.org/InStoreOnly",
          seller: { "@id": ORGANIZATION_ID },
        };

  return {
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
    offers: offer,
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "주문 기준",
        value: meta.minOrder,
      },
      {
        "@type": "PropertyValue",
        name: "수령 방식",
        value: "성동구 매장 픽업 또는 차량 퀵 상담",
      },
    ],
  };
}

function buildService(page) {
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
          telephone: "+82-10-2866-7976",
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

  if (breadcrumb) schema.breadcrumb = { "@id": breadcrumb["@id"] };
  if (itemList) schema.mainEntity = { "@id": itemList["@id"] };
  if (product) schema.about = { "@id": product["@id"] };
  if (service) schema.mainEntity = { "@id": service["@id"] };

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
    return html.replace(STATIC_SCHEMA_REGEX, `\n${script}`);
  }
  return html.replace(/<\/head>/i, `${script}</head>`);
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

      if (new URL(loc).pathname === "/") {
        for (const type of ["CollectionPage", "ItemList", "FAQPage"]) {
          if (!types.has(type)) failures.push(`${relativePath}: missing ${type}`);
        }
      }

      if (PRODUCT_META[new URL(loc).pathname]) {
        const product = staticSchema["@graph"].find((entry) => entry["@type"] === "Product");
        if (!product) {
          failures.push(`${relativePath}: missing Product`);
        } else if (!product.offers?.priceCurrency) {
          failures.push(`${relativePath}: missing Product offers priceCurrency`);
        } else if (product.offers.price == null && product.offers.lowPrice == null) {
          failures.push(`${relativePath}: missing Product offer price or lowPrice`);
        }
      }
    } catch (error) {
      failures.push(`${relativePath}: ${error.message}`);
    }
  } else {
    const nextHtml = insertSchema(html, expectedSchema);
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
