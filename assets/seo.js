(() => {
  const SITE_URL = "https://nothingmatters.kr";
  const ORGANIZATION_ID = `${SITE_URL}/#organization`;
  const WEBSITE_ID = `${SITE_URL}/#website`;

  const cleanText = (value = "") =>
    value.replace(/\s+/g, " ").replace(/[＋+−]/g, "").trim();

  const absoluteUrl = (value, base = SITE_URL) => {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return `https:${value}`;
    return new URL(value, base).href;
  };

  const canonicalHref =
    document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "/";
  const pageUrl = absoluteUrl(canonicalHref, SITE_URL);
  const pageTitle = cleanText(document.title);
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute("content") ||
    "";
  const ogImage =
    absoluteUrl(
      document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content") || "/images/heart-badge.png",
      pageUrl
    ) || absoluteUrl("/images/heart-badge.png");

  const pageType = (() => {
    if (document.body.classList.contains("theme-home")) return "home";
    if (document.body.classList.contains("theme-contact")) return "contact";
    if (canonicalHref.includes("/guides/")) return "guide";

    const productThemes = [
      "theme-brownie",
      "theme-handmade",
      "theme-lucky",
      "theme-scone",
      "theme-terminal",
    ];

    if (productThemes.some((theme) => document.body.classList.contains(theme))) {
      return "product";
    }

    return "page";
  })();

  const isGuideHub = /\/guides\/?$/.test(new URL(pageUrl).pathname);

  const organization = {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "nothingmatters",
    alternateName: "낫띵메터스",
    url: SITE_URL,
    logo: absoluteUrl("/images/heart-badge.png"),
    image: absoluteUrl("/images/home-collage-a.jpg"),
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
        url: absoluteUrl("/contact/"),
        availableLanguage: ["ko-KR"],
      },
    ],
    areaServed: ["KR"],
  };

  const website = {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: "nothingmatters",
    inLanguage: "ko-KR",
    publisher: {
      "@id": ORGANIZATION_ID,
    },
  };

  const buildBreadcrumbSchema = () => {
    const breadcrumb = document.querySelector(".nm-breadcrumb");
    if (!breadcrumb) return null;

    const items = [];

    breadcrumb.querySelectorAll("a").forEach((link) => {
      const name = cleanText(link.textContent);
      const href = link.getAttribute("href");

      if (!name || !href) return;

      items.push({
        name,
        item: absoluteUrl(href, pageUrl),
      });
    });

    const current =
      breadcrumb.querySelector("strong") ||
      breadcrumb.querySelector("[aria-current='page']");

    if (current) {
      items.push({
        name: cleanText(current.textContent),
        item: pageUrl,
      });
    }

    if (!items.length) return null;

    return {
      "@type": "BreadcrumbList",
      "@id": `${pageUrl}#breadcrumb`,
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: item.item,
      })),
    };
  };

  const buildFaqSchema = () => {
    const questions = [];
    const seen = new Set();

    document.querySelectorAll(".faq-wrap details, .nm-faq details").forEach((item) => {
      const question = cleanText(item.querySelector("summary")?.textContent || "");
      const answer = cleanText(
        item.querySelector(".answer, .faq-answer, div")?.textContent || ""
      );

      if (!question || !answer || seen.has(question)) return;
      seen.add(question);

      questions.push({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      });
    });

    document.querySelectorAll(".nm-faq-item").forEach((item) => {
      const question =
        cleanText(
          item.querySelector(".nm-faq-question span:first-child")?.textContent ||
            item.querySelector(".nm-faq-question")?.textContent ||
            item.querySelector("[data-accordion-trigger]")?.textContent ||
            ""
        ) || "";
      const answer = cleanText(
        item.querySelector(".nm-faq-answer, [data-accordion-panel]")?.textContent ||
          ""
      );

      if (!question || !answer || seen.has(question)) return;
      seen.add(question);

      questions.push({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      });
    });

    if (!questions.length) return null;

    return {
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: questions,
    };
  };

  const buildItemListSchema = () => {
    if (!["home", "guide"].includes(pageType)) return null;

    const seen = new Set();
    const items = [];

    const selector = isGuideHub ? 'a[href*="/guides/"], a[href^="./"]' : 'a[href*="products/"]';

    document.querySelectorAll(selector).forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;

      const absolute = absoluteUrl(href, pageUrl);
      const isGuideTarget = absolute.includes("/guides/") && absolute !== pageUrl;
      const isProductTarget = absolute.includes("/products/");

      if (isGuideHub) {
        if (!isGuideTarget || seen.has(absolute)) return;
      } else if (!isProductTarget || seen.has(absolute)) {
        return;
      }

      seen.add(absolute);

      const card = link.closest("article") || link.closest(".nm-product-card") || link;
      const name = cleanText(
        card.querySelector("h3")?.textContent || link.textContent || ""
      );

      if (!name) return;

      items.push({
        "@type": "ListItem",
        position: items.length + 1,
        url: absolute,
        name,
      });
    });

    if (!items.length) return null;

    return {
      "@type": "ItemList",
      "@id": `${pageUrl}#${isGuideHub ? "guides" : "products"}`,
      itemListElement: items,
    };
  };

  const buildProductSchema = () => {
    if (pageType !== "product") return null;

    const name = cleanText(
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content")
        ?.split("|")[0] || document.querySelector("h1")?.textContent || pageTitle
    );

    const highlights = Array.from(
      document.querySelectorAll(".nm-pill, .nm-meta-pill")
    )
      .map((item) => cleanText(item.textContent))
      .filter(Boolean)
      .slice(0, 6);

    const product = {
      "@type": "Product",
      "@id": `${pageUrl}#product`,
      name,
      description: cleanText(metaDescription),
      image: [ogImage],
      url: pageUrl,
      brand: {
        "@id": ORGANIZATION_ID,
      },
      category: name,
      offers: {
        "@type": "Offer",
        url: pageUrl,
        availability: "https://schema.org/InStoreOnly",
        priceCurrency: "KRW",
        seller: {
          "@id": ORGANIZATION_ID,
        },
      },
    };

    if (highlights.length) {
      product.additionalProperty = highlights.map((value, index) => ({
        "@type": "PropertyValue",
        name: `핵심 정보 ${index + 1}`,
        value,
      }));
    }

    return product;
  };

  const buildServiceSchema = () => {
    if (pageType !== "contact") return null;

    return {
      "@type": "Service",
      "@id": `${pageUrl}#service`,
      name: "쿠키 답례품 및 행사 주문 상담",
      serviceType: "답례품, 행사 간식, 커스텀 디저트 주문 상담",
      provider: {
        "@id": ORGANIZATION_ID,
      },
      areaServed: "KR",
      availableChannel: [
        {
          "@type": "ServiceChannel",
          serviceUrl: pageUrl,
          servicePhone: {
            "@type": "ContactPoint",
            telephone: "+82-10-2866-7976",
          },
        },
      ],
    };
  };

  const buildPageSchema = (breadcrumbSchema) => {
    const typeMap = {
      home: "CollectionPage",
      contact: "ContactPage",
      guide: "CollectionPage",
      product: "ProductPage",
      page: "WebPage",
    };

    const schema = {
      "@type": typeMap[pageType] || "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: cleanText(pageTitle.replace(/\s*\|\s*nothingmatters/i, "")),
      description: cleanText(metaDescription),
      inLanguage: "ko-KR",
      isPartOf: {
        "@id": WEBSITE_ID,
      },
      about:
        pageType === "product"
          ? {
              "@id": `${pageUrl}#product`,
            }
          : {
              "@id": ORGANIZATION_ID,
            },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: ogImage,
      },
    };

    if (breadcrumbSchema) {
      schema.breadcrumb = {
        "@id": breadcrumbSchema["@id"],
      };
    }

    if (pageType === "home" || pageType === "guide") {
      schema.mainEntity = {
        "@id": `${pageUrl}#${isGuideHub ? "guides" : "products"}`,
      };
    }

    if (pageType === "contact") {
      schema.mainEntity = {
        "@id": `${pageUrl}#service`,
      };
    }

    return schema;
  };

  const graph = [];
  const breadcrumbSchema = buildBreadcrumbSchema();
  const faqSchema = buildFaqSchema();
  const itemListSchema = buildItemListSchema();
  const productSchema = buildProductSchema();
  const serviceSchema = buildServiceSchema();
  const pageSchema = buildPageSchema(breadcrumbSchema);

  graph.push(organization, website, pageSchema);

  if (breadcrumbSchema) graph.push(breadcrumbSchema);
  if (itemListSchema) graph.push(itemListSchema);
  if (productSchema) graph.push(productSchema);
  if (serviceSchema) graph.push(serviceSchema);
  if (faqSchema) graph.push(faqSchema);

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": graph,
    },
    null,
    2
  );

  document.head.appendChild(script);
})();
