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
