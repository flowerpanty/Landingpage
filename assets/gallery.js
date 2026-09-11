/*
 * MADE BY NOTHINGMATTERS photo archive
 *
 * Add a new static photo in two steps:
 * 1. Put the image in images/made/.
 * 2. Add one object below with src, alt, title (optional), and size.
 *
 * Supported sizes: square, tall, wide, large.
 * Only add a title to some photos so the archive stays photo-first.
 */
const madeArchiveItems = [
  {
    src: "images/made/handmade-cookie-box.jpeg",
    alt: "여러 표정의 쿠키를 담은 낫띵메터스 선물 상자",
    size: "tall"
  },
  {
    src: "images/made/wedding-favor.jpeg",
    alt: "결혼식 답례용 캐릭터 쿠키 세트",
    title: "COOKIE FLIGHT",
    size: "square"
  },
  {
    src: "images/made/corporate-favor.jpeg",
    alt: "브랜드 행사에 맞춰 제작한 단체 쿠키",
    size: "large"
  },
  {
    src: "images/made/lucky-cookie.jpeg",
    alt: "행운 메시지와 함께 구성한 쿠키 선물",
    size: "wide"
  },
  {
    src: "images/made/terminal-crew.png",
    alt: "터미널 유니폼을 입은 낫띵메터스 쿠키 크루",
    title: "tiny cookie crew",
    size: "wide"
  },
  {
    src: "images/made/crew-brownie.jpg",
    alt: "하트 메시지를 든 곰 캐릭터 브라우니",
    size: "tall"
  },
  {
    src: "images/made/handmade-cookie-rack.jpg",
    alt: "다양한 캐릭터 수제쿠키가 놓인 쿠키 랙",
    size: "large"
  },
  {
    src: "images/made/made-cookie-moment.jpg",
    alt: "메시지를 더해 제작한 브라우니 선물",
    size: "square"
  }
];

(() => {
  const homeGallery = document.querySelector("[data-recent-gallery]");
  const overlay = document.querySelector("[data-made-overlay]");
  const overlayDialog = overlay?.querySelector(".showroom-made-overlay-dialog");
  const overlayGrid = document.querySelector("[data-made-overlay-grid]");
  const closeButton = document.querySelector("[data-made-overlay-close]");
  if (!homeGallery) return;

  const validSizes = new Set(["square", "tall", "wide", "large"]);
  const uploadedSizes = ["large", "tall", "wide", "square"];
  let lastTrigger = null;
  let overlayOpen = false;
  let overlayHistoryEntryActive = false;

  const stableHash = (value) => [...String(value || "made-photo")]
    .reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);

  const getItemSize = (item) => {
    if (validSizes.has(item.size)) return item.size;
    return uploadedSizes[stableHash(item.id || item.filename || item.src) % uploadedSizes.length];
  };

  const createImage = (item) => {
    const image = document.createElement("img");
    image.src = item.src;
    image.alt = item.alt || "낫띵메터스에서 만든 쿠키";
    image.loading = "lazy";
    image.decoding = "async";
    return image;
  };

  const createHomeItem = (item, index) => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "showroom-made-item showroom-made-item--trigger is-visible";
    trigger.dataset.size = getItemSize(item);
    trigger.style.setProperty("--made-index", String(index));
    trigger.setAttribute("aria-label", `${item.alt || "작업 사진"} 전체 아카이브로 보기`);
    trigger.append(createImage(item));

    if (item.title) {
      const caption = document.createElement("span");
      caption.className = "showroom-made-caption";
      caption.textContent = item.title;
      trigger.append(caption);
    }

    trigger.addEventListener("click", () => openOverlay(trigger));
    return trigger;
  };

  const createOverlayItem = (item) => {
    const figure = document.createElement("figure");
    figure.className = "showroom-made-overlay-item";
    figure.dataset.size = getItemSize(item);
    figure.append(createImage(item));

    if (item.caption) {
      const caption = document.createElement("span");
      caption.className = "showroom-made-overlay-caption";
      caption.textContent = item.caption;
      figure.append(caption);
    }

    return figure;
  };

  const renderHomeArchive = (items) => {
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => fragment.append(createHomeItem(item, index)));
    homeGallery.replaceChildren(fragment);
  };

  const renderOverlayArchive = (items) => {
    if (!overlayGrid) return;
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.append(createOverlayItem(item)));
    overlayGrid.replaceChildren(fragment);
  };

  const restoreTriggerFocus = () => {
    if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
    lastTrigger = null;
  };

  const getOverlayFocusableElements = () => {
    if (!overlayDialog) return [];
    return [...overlayDialog.querySelectorAll(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )].filter((element) => !element.hidden && element.getClientRects().length);
  };

  const clearStaleOverlayHistory = () => {
    if (!history.state?.nmMadeOverlay) return;
    const { nmMadeOverlay, ...previousState } = history.state;
    const currentUrl = new URL(window.location.href);
    if (currentUrl.hash === "#made-gallery") currentUrl.hash = "";
    history.replaceState(previousState, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  };

  const closeOverlay = ({ restoreFocus = true, returnToHistory = true } = {}) => {
    if (!overlayOpen || !overlay) return;
    overlayOpen = false;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-made-overlay-open");

    window.setTimeout(() => {
      if (!overlayOpen) overlay.hidden = true;
    }, 180);

    const shouldReturnToHistory = returnToHistory && overlayHistoryEntryActive;
    overlayHistoryEntryActive = false;
    if (shouldReturnToHistory) history.back();
    if (restoreFocus) restoreTriggerFocus();
  };

  const openOverlay = (trigger) => {
    if (!overlay || !overlayDialog) return;
    lastTrigger = trigger;
    overlayOpen = true;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-made-overlay-open");
    window.requestAnimationFrame(() => overlay.classList.add("is-open"));

    history.pushState({ ...(history.state || {}), nmMadeOverlay: true }, "", "#made-gallery");
    overlayHistoryEntryActive = true;

    const [firstFocusableElement] = getOverlayFocusableElements();
    (firstFocusableElement || overlayDialog).focus({ preventScroll: true });
  };

  const getUploadedItems = async () => {
    try {
      const response = await fetch("/api/gallery", { headers: { Accept: "application/json" } });
      if (!response.ok) return [];
      const payload = await response.json();
      return (payload.items || [])
        .filter((item) => item.userUploaded)
        .map((item) => ({
          id: item.id,
          filename: item.filename,
          src: item.src,
          alt: item.caption || "낫띵메터스에서 만든 쿠키",
          caption: String(item.caption || "").trim()
        }));
    } catch (error) {
      return [];
    }
  };

  closeButton?.addEventListener("click", () => closeOverlay());
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) closeOverlay();
  });
  document.addEventListener("keydown", (event) => {
    if (!overlayOpen) return;
    if (event.key === "Escape") {
      closeOverlay();
      return;
    }
    if (event.key !== "Tab") return;

    const focusableElements = getOverlayFocusableElements();
    if (!focusableElements.length) {
      event.preventDefault();
      overlayDialog?.focus({ preventScroll: true });
      return;
    }

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === firstFocusableElement || !overlayDialog?.contains(activeElement))) {
      event.preventDefault();
      lastFocusableElement.focus({ preventScroll: true });
    } else if (!event.shiftKey && (activeElement === lastFocusableElement || !overlayDialog?.contains(activeElement))) {
      event.preventDefault();
      firstFocusableElement.focus({ preventScroll: true });
    }
  });
  window.addEventListener("popstate", () => {
    if (overlayOpen) closeOverlay({ returnToHistory: false });
  });

  clearStaleOverlayHistory();
  renderHomeArchive(madeArchiveItems);
  renderOverlayArchive(madeArchiveItems);

  getUploadedItems().then((uploadedItems) => {
    const homeItems = uploadedItems.length
      ? [...uploadedItems.slice(0, 12), ...madeArchiveItems]
      : madeArchiveItems;
    const overlayItems = uploadedItems.length ? uploadedItems : madeArchiveItems;
    renderHomeArchive(homeItems);
    renderOverlayArchive(overlayItems);
  });
})();
