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

if (revealTargets.length) {
  if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
    revealTargets.forEach((element) => element.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    revealTargets.forEach((element) => revealObserver.observe(element));
  }
}

const heroParallaxImage = document.querySelector("[data-hero-parallax]");
const mobileMedia = window.matchMedia("(max-width: 760px)");

if (heroParallaxImage && !prefersReducedMotion.matches && !mobileMedia.matches) {
  let ticking = false;

  const updateHeroParallax = () => {
    const rect = heroParallaxImage.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 1;
    const progress = (viewportHeight - rect.top) / (viewportHeight + rect.height);
    const shift = Math.max(-18, Math.min(18, (progress - 0.5) * 28));

    heroParallaxImage.style.setProperty("--hero-parallax-shift", `${shift}px`);
    ticking = false;
  };

  const requestHeroParallax = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateHeroParallax);
  };

  updateHeroParallax();
  window.addEventListener("scroll", requestHeroParallax, { passive: true });
  window.addEventListener("resize", requestHeroParallax);
}

const homeSearchInput = document.querySelector("#nm-home-search-input");
const homeSearchResults = document.querySelector("[data-home-search-results]");
const homeSearchFeedback = document.querySelector("[data-home-search-feedback]");
const homeSearchGrid = document.querySelector(".nm-home-bento-grid");
const homeSearchCards = [...document.querySelectorAll("[data-search-card]")];

if (homeSearchInput && homeSearchResults && homeSearchFeedback && homeSearchGrid && homeSearchCards.length) {
  const searchItems = [
    {
      label: "브랜드 행사",
      aliases: ["브랜드", "기업", "기업 행사", "행사", "단체", "회사", "로고"],
      targetSelector: '[data-search-card="corporate"]',
      href: "guides/corporate-event-cookie/index.html"
    },
    {
      label: "무난한 답례품",
      aliases: ["답례", "답례품", "하객", "감사 답례", "브라우니 답례"],
      targetSelector: '[data-search-card="favor"]',
      href: "products/brownie-cookie/index.html"
    },
    {
      label: "특별한 선물",
      aliases: ["선물", "생일", "생일 선물", "기념일", "감사 선물", "패키지", "수제"],
      targetSelector: '[data-search-card="gift"]',
      href: "products/handmade-cookie/index.html"
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
      href: "products/handmade-cookie/index.html"
    }
  ];

  const normalizeSearchValue = (value = "") =>
    value
      .toLowerCase()
      .replace(/\s+/g, "")
      .trim();

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
      href: "products/handmade-cookie/index.html"
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
      link.href = item.href;
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
