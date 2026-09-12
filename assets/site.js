document.querySelectorAll("[data-accordion]").forEach((item, index) => {
  const trigger = item.querySelector("[data-accordion-trigger]");
  const panel = item.querySelector("[data-accordion-panel]");

  if (!trigger || !panel) return;

  if (!trigger.id) {
    trigger.id = `accordion-trigger-${index + 1}`;
  }

  if (!panel.id) {
    panel.id = `accordion-panel-${index + 1}`;
  }

  trigger.setAttribute("aria-controls", panel.id);
  panel.setAttribute("aria-labelledby", trigger.id);

  const setExpanded = (expanded) => {
    item.classList.toggle("is-open", expanded);
    trigger.setAttribute("aria-expanded", String(expanded));
    panel.hidden = !expanded;
  };

  setExpanded(item.classList.contains("is-open"));

  trigger.addEventListener("click", () => {
    const expanded = trigger.getAttribute("aria-expanded") === "true";
    setExpanded(!expanded);
  });
});

document.querySelectorAll("[data-copy-template]").forEach((button) => {
  const defaultLabel = button.textContent.trim();

  button.addEventListener("click", async () => {
    const selector = button.dataset.copyTarget || "";
    const target = document.querySelector(selector);
    const text = target?.textContent?.trim();

    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "복사 완료";
    } catch (error) {
      button.textContent = "수동 복사해주세요";
    }

    window.setTimeout(() => {
      button.textContent = defaultLabel;
    }, 1800);
  });
});

const escapeSvgText = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const createImageFallback = (label = "nothingmatters") => {
  const safeLabel = escapeSvgText(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
      <rect width="1200" height="900" fill="#f7f2eb"/>
      <rect x="74" y="74" width="1052" height="752" rx="18" fill="#fffdf9" stroke="#000" stroke-width="12"/>
      <text x="600" y="470" text-anchor="middle" font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="#000">IMAGE READY</text>
      <text x="600" y="570" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="600" fill="#000">${safeLabel}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

document.querySelectorAll("img[data-fallback-label]").forEach((img) => {
  const applyFallback = () => {
    if (img.dataset.fallbackApplied === "true") return;
    img.dataset.fallbackApplied = "true";
    img.src = createImageFallback(img.dataset.fallbackLabel || "nothingmatters");
  };

  img.addEventListener("error", applyFallback, { once: true });

  if (img.complete && img.naturalWidth === 0) {
    applyFallback();
  }
});

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const revealTargets = document.querySelectorAll("[data-reveal]");
const revealElement = (element, { immediate = false } = {}) => {
  element.classList.add("is-visible");
  if (immediate) element.style.transition = "none";
  element.style.opacity = "1";
  element.style.transform = "translateY(0)";
};

if (revealTargets.length) {
  if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
    revealTargets.forEach((element) => revealElement(element, { immediate: true }));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          revealElement(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    revealTargets.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const isInitiallyVisible = Boolean(element.closest(".showroom-hero")) || (rect.top < window.innerHeight * 0.95 && rect.bottom > 0);
      if (isInitiallyVisible) {
        revealElement(element, { immediate: true });
      } else {
        revealObserver.observe(element);
      }
    });
  }
}

const homeSearchInput = document.querySelector("#nm-home-search-input");
const homeSearchResults = document.querySelector("[data-home-search-results]");
const homeSearchFeedback = document.querySelector("[data-home-search-feedback]");
const homeSearchGrid = document.querySelector(".nm-home-bento-grid");
const homeSearchCards = [...document.querySelectorAll("[data-search-card]")];

if (homeSearchInput && homeSearchResults && homeSearchFeedback && homeSearchGrid && homeSearchCards.length) {
  const searchItems = [
    {
      label: "기업 행사",
      aliases: ["브랜드", "기업", "기업 행사", "행사", "단체", "회사", "로고"],
      targetSelector: '[data-search-card="corporate"]',
      href: "guides/corporate-event-cookie/index.html"
    },
    {
      label: "결혼/답례",
      aliases: ["답례", "답례품", "하객", "감사 답례", "브라우니 답례"],
      targetSelector: '[data-search-card="favor"]',
      href: "products/brownie-cookie/index.html"
    },
    {
      label: "생일/선물",
      aliases: ["선물", "생일", "생일 선물", "기념일", "감사 선물", "패키지", "수제"],
      targetSelector: '[data-search-card="gift"]',
      href: "small-gift/index.html"
    },
    {
      label: "승진/퇴사",
      aliases: ["승진", "퇴사", "이직", "감사", "응원", "축하", "문구", "이름", "날짜", "메시지", "커스텀"],
      targetSelector: '[data-search-card="message"]',
      href: "guides/farewell-favor-cookie/index.html"
    },
    {
      label: "결혼식 답례",
      aliases: ["결혼", "결혼식", "웨딩", "답례", "답례품", "하객 선물"],
      targetSelector: '[data-search-card="favor"]',
      href: "guides/wedding-favor-cookie/index.html"
    },
    {
      label: "행운쿠키",
      aliases: ["행운", "포춘", "포춘쿠키", "문구 쿠키", "메시지 쿠키"],
      targetSelector: '[data-search-card="message"]',
      href: "products/lucky-cookie/index.html"
    },
    {
      label: "브라우니쿠키",
      aliases: ["브라우니", "브루키", "답례 쿠키", "브라우니 답례품"],
      targetSelector: '[data-search-card="favor"]',
      href: "products/brownie-cookie/index.html"
    },
    {
      label: "수제쿠키",
      aliases: ["수제", "캐릭터", "캐릭터 쿠키", "생일 쿠키", "선물 쿠키"],
      targetSelector: '[data-search-card="gift"]',
      href: "small-gift/index.html"
    }
  ];

  const normalizeSearchValue = (value = "") =>
    value
      .toLowerCase()
      .replace(/\s+/g, "")
      .trim();

  const getHomeSearchHref = (href = "") => {
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return href;
    const isNestedHomePage = window.location.pathname.includes("/bulk/");
    return `${isNestedHomePage ? "../" : ""}${href}`;
  };

  const getDefaultResults = () => [
    {
      label: "결혼식 답례",
      targetSelector: '[data-search-card="favor"]',
      href: "guides/wedding-favor-cookie/index.html"
    },
    {
      label: "기업 행사",
      targetSelector: '[data-search-card="corporate"]',
      href: "guides/corporate-event-cookie/index.html"
    },
    {
      label: "생일 선물",
      targetSelector: '[data-search-card="gift"]',
      href: "small-gift/index.html"
    },
    {
      label: "승진/퇴사",
      targetSelector: '[data-search-card="message"]',
      href: "guides/farewell-favor-cookie/index.html"
    }
  ];

  const renderSearchResults = (items) => {
    homeSearchResults.innerHTML = "";

    items.forEach((item) => {
      const link = document.createElement("a");
      link.className = "nm-home-search-result";
      link.href = getHomeSearchHref(item.href);
      link.textContent = item.label;
      homeSearchResults.appendChild(link);
    });
  };

  const clearCardHighlights = () => {
    homeSearchGrid.classList.remove("is-search-active");

    homeSearchCards.forEach((card) => {
      card.classList.remove("is-search-match", "is-search-dimmed");
    });
  };

  const applyCardHighlights = (items) => {
    const selectors = [...new Set(items.map((item) => item.targetSelector).filter(Boolean))];

    if (!selectors.length) {
      clearCardHighlights();
      return;
    }

    homeSearchGrid.classList.add("is-search-active");

    homeSearchCards.forEach((card) => {
      const isMatch = selectors.some((selector) => card.matches(selector));
      card.classList.toggle("is-search-match", isMatch);
      card.classList.toggle("is-search-dimmed", !isMatch);
    });
  };

  const getMatchedItems = (rawValue) => {
    const query = normalizeSearchValue(rawValue);
    const seen = new Set();

    return searchItems
      .filter((item) => {
        const terms = [item.label, ...item.aliases].map(normalizeSearchValue);
        return terms.some((term) => term.includes(query) || query.includes(term));
      })
      .filter((item) => {
        if (seen.has(item.label)) return false;
        seen.add(item.label);
        return true;
      })
      .slice(0, 4);
  };

  const updateHomeSearchState = () => {
    const rawValue = homeSearchInput.value || "";
    const query = normalizeSearchValue(rawValue);

    if (!query) {
      homeSearchFeedback.textContent = "아래를 선택해주세요 👇";
      renderSearchResults(getDefaultResults());
      clearCardHighlights();
      return;
    }

    const matchedItems = getMatchedItems(rawValue);

    if (matchedItems.length) {
      homeSearchFeedback.textContent = "아래를 선택해주세요 👇";
      renderSearchResults(matchedItems);
      applyCardHighlights(matchedItems);
      return;
    }

    homeSearchFeedback.textContent = "아래를 선택해주세요 👇";
    renderSearchResults(getDefaultResults());
    clearCardHighlights();
  };

  renderSearchResults(getDefaultResults());
  clearCardHighlights();

  homeSearchInput.addEventListener("input", updateHomeSearchState);
  homeSearchInput.addEventListener("search", updateHomeSearchState);
}

const normalizeAnalyticsText = (value = "") =>
  String(value).trim().replace(/\s+/g, " ").slice(0, 80);

const getLegacyDashboardEventNameForLink = (link) => {
  const href = link?.href || "";

  if (href.includes("pf.kakao.com/_QdCaK")) return "consult_kakao_click";
  if (href.includes("thingmattersreserve-production.up.railway.app/brookie")) return "order_brookie_click";
  if (href.includes("thingmattersreserve-production.up.railway.app/cookies")) return "order_cookies_click";
  if (href.includes("thingmattersreserve-production.up.railway.app/lucky")) return "order_lucky_click";
  return "";
};

const getDataAnalyticsEventName = (target) => {
  const analyticsTarget = target?.closest?.("[data-analytics-event]");
  return analyticsTarget?.dataset.analyticsEvent || "";
};

const getBehaviorAnalyticsEventNames = (link, clickedElement) => {
  const href = link?.href || "";
  const pathname = (() => {
    try {
      return new URL(href).pathname;
    } catch (error) {
      return "";
    }
  })();
  const className = `${link?.className || ""} ${clickedElement?.className || ""}`;
  const events = [];

  if (/\/(?:products|brookie|out|cookie-crew)\//.test(pathname) || link?.closest?.(".showroom-product-card, .nm-all-product-link, .nm-small-card")) {
    events.push("product_click");
  }

  if (href.includes("thingmattersreserve-production.up.railway.app")) {
    events.push("order_start");
  }

  if (href.includes("pf.kakao.com/_QdCaK")) {
    events.push("consult_click");
  }

  if (pathname.includes("/guides/")) {
    events.push("guide_click");
  }

  if (link?.closest?.("[data-home-search-results]") || className.includes("nm-home-search-result")) {
    events.push("quick_selector_click");
  }

  return events;
};

const getDashboardEventNamesForClick = (event) => {
  const clickedElement = event.target;
  const link = clickedElement.closest?.("a[href]");
  const trigger = clickedElement.closest?.("a[href], button, [role='button'], [data-analytics-event]");
  const eventNames = new Set();
  const dataEventName = getDataAnalyticsEventName(trigger || clickedElement);
  const legacyEventName = getLegacyDashboardEventNameForLink(link);

  if (dataEventName) eventNames.add(dataEventName);
  if (link) {
    getBehaviorAnalyticsEventNames(link, clickedElement).forEach((eventName) => eventNames.add(eventName));
    if (legacyEventName) eventNames.add(legacyEventName);
  }
  if ((trigger || clickedElement).closest?.("[data-open-made-overlay]")) eventNames.add("gallery_open");

  return {
    eventNames: [...eventNames],
    link,
    trigger: trigger || link || clickedElement,
  };
};

document.addEventListener("click", (event) => {
  if (typeof window.gtag !== "function") return;

  const { eventNames, link, trigger } = getDashboardEventNamesForClick(event);
  if (!eventNames.length) return;

  const analyticsTarget = trigger?.closest?.("[data-analytics-event]");
  const eventLabel =
    analyticsTarget?.dataset.analyticsLabel ||
    normalizeAnalyticsText(trigger?.textContent || link?.textContent || "");
  const postTitle = normalizeAnalyticsText(analyticsTarget?.dataset.analyticsPostTitle || "");

  eventNames.forEach((eventName) => {
    window.gtag("event", eventName, {
      event_category: eventName.endsWith("_click") || eventName === "order_start" ? "conversion_signal" : "site_interaction",
      event_label: eventLabel,
      link_url: link?.href || "",
      link_text: normalizeAnalyticsText(link?.textContent || trigger?.textContent || ""),
      page_path: window.location.pathname,
      ...(eventName === "blog_card_click" && postTitle ? { post_title: postTitle } : {}),
      transport_type: "beacon"
    });
  });
});

const mobileBottomNav = document.querySelector(".nm-mobile-bottom-nav");
const inlineCtaRegions = document.querySelectorAll(
  ".nm-main-hero-actions, .nm-main-order-card, .nm-main-custom-action, .showroom-detail-actions, .showroom-final-inner"
);

if (mobileBottomNav && inlineCtaRegions.length && "IntersectionObserver" in window) {
  const visibleCtaRegions = new Set();
  const bottomNavObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          visibleCtaRegions.add(entry.target);
        } else {
          visibleCtaRegions.delete(entry.target);
        }
      });

      mobileBottomNav.classList.toggle("is-suppressed", visibleCtaRegions.size > 0);
    },
    { threshold: 0.12, rootMargin: "0px 0px -72px 0px" }
  );

  inlineCtaRegions.forEach((element) => bottomNavObserver.observe(element));
}

const showroomAnchorLinks = [...document.querySelectorAll(".showroom-nav--quick a[href^='#']")];

if (showroomAnchorLinks.length && "IntersectionObserver" in window) {
  const anchorTargets = showroomAnchorLinks
    .map((link) => ({ link, target: document.querySelector(link.getAttribute("href")) }))
    .filter((item) => item.target);
  const visibleAnchors = new Map();

  const setActiveShowroomAnchor = (target) => {
    anchorTargets.forEach(({ link, target: candidate }) => {
      const isActive = candidate === target;
      link.toggleAttribute("aria-current", isActive);
      if (isActive) link.setAttribute("aria-current", "location");
    });
  };

  const resolveActiveShowroomAnchor = () => {
    const active = [...visibleAnchors.entries()]
      .filter(([, entry]) => entry.isIntersecting)
      .sort(([, a], [, b]) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
    if (active.length) setActiveShowroomAnchor(active[0][0]);
  };

  const anchorObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => visibleAnchors.set(entry.target, entry));
      resolveActiveShowroomAnchor();
    },
    { threshold: [0.25, 0.55], rootMargin: "-18% 0px -48% 0px" }
  );

  anchorTargets.forEach(({ target }) => anchorObserver.observe(target));
  window.addEventListener("hashchange", () => {
    const target = document.querySelector(window.location.hash);
    if (target) setActiveShowroomAnchor(target);
  });
}

const floatingOrderCta = document.querySelector("[data-mobile-order-cta]");
const floatingOrderLabel = document.querySelector("[data-mobile-order-label]");

if (floatingOrderCta && floatingOrderLabel && "IntersectionObserver" in window) {
  const defaultOrderCta = {
    key: "default",
    label: "쿠키 주문하기",
    href: "https://thingmattersreserve-production.up.railway.app"
  };
  const ctaContexts = [
    {
      selector: "#our-cookies, #featured-products",
      ...defaultOrderCta
    },
    {
      selector: "#use-case-guide",
      key: "gift",
      label: "선물 주문하기",
      href: "https://thingmattersreserve-production.up.railway.app"
    },
    {
      selector: "#local-pickup",
      key: "group",
      label: "단체 주문 상담",
      href: "https://pf.kakao.com/_QdCaK/chat"
    },
    {
      selector: "#actual-cases",
      key: "made",
      label: "이런 쿠키 문의하기",
      href: "https://pf.kakao.com/_QdCaK/chat"
    }
  ];
  const mobileMedia = window.matchMedia("(max-width: 760px)");
  const ctaEntries = new Map();
  let activeCtaKey = "";

  const applyFloatingOrderCta = (context) => {
    if (!mobileMedia.matches) {
      floatingOrderLabel.textContent = "주문하기";
      floatingOrderCta.href = defaultOrderCta.href;
      floatingOrderCta.setAttribute("aria-label", "주문하기");
      activeCtaKey = "desktop";
      return;
    }

    if (activeCtaKey === context.key) return;
    activeCtaKey = context.key;
    floatingOrderLabel.textContent = context.label;
    floatingOrderCta.href = context.href;
    floatingOrderCta.setAttribute("aria-label", context.label);
  };

  const resolveFloatingOrderCta = () => {
    const active = [...ctaEntries.entries()]
      .filter(([, entry]) => entry.isIntersecting)
      .sort(([, a], [, b]) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
    applyFloatingOrderCta(active.length ? active[0][0] : defaultOrderCta);
  };

  const ctaObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => ctaEntries.set(entry.target.__nmCtaContext, entry));
      resolveFloatingOrderCta();
    },
    { threshold: [0.08, 0.35], rootMargin: "-12% 0px -24% 0px" }
  );

  ctaContexts.forEach((context) => {
    document.querySelectorAll(context.selector).forEach((element) => {
      element.__nmCtaContext = context;
      ctaObserver.observe(element);
    });
  });

  mobileMedia.addEventListener("change", () => {
    activeCtaKey = "";
    resolveFloatingOrderCta();
  });
  resolveFloatingOrderCta();
}

const siteScript =
  document.currentScript ||
  [...document.scripts].find((script) =>
    /\/assets\/site\.js(?:\?|$)/.test(script.src)
  );

if (!document.querySelector("[data-kakao-float]")) {
  const kakaoLink = document.createElement("a");
  kakaoLink.className = "nm-float-icon";
  kakaoLink.href = "https://pf.kakao.com/_QdCaK";
  kakaoLink.target = "_blank";
  kakaoLink.rel = "noopener noreferrer";
  kakaoLink.setAttribute("aria-label", "카카오톡 상담 열기");
  kakaoLink.setAttribute("title", "카카오톡 상담");
  kakaoLink.dataset.kakaoFloat = "true";

  const icon = document.createElement("img");
  icon.alt = "";
  icon.decoding = "async";
  icon.loading = "lazy";

  if (siteScript?.src) {
    icon.src = new URL("../images/consult-icon-browser.png", siteScript.src).href;
  } else {
    icon.src = "/images/consult-icon-browser.png";
  }

  const bubble = document.createElement("span");
  bubble.className = "nm-float-bubble";
  bubble.textContent = "채널추가하고 1,000원 쿠폰 받기";
  bubble.setAttribute("aria-hidden", "true");

  kakaoLink.appendChild(bubble);
  kakaoLink.appendChild(icon);

  if (document.querySelector(".nm-float-cta")) {
    kakaoLink.classList.add("with-bar");
  }

  document.body.appendChild(kakaoLink);
}
