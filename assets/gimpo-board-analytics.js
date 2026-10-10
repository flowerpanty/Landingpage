(() => {
  "use strict";

  const gifts = document.querySelector(".board-arrival-gifts");
  if (!gifts) return;
  let initialized = false;
  const normalize = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);

  function initialize() {
    if (initialized) return;
    initialized = true;
    // Reuse the site's GA4 destination and attribute/event contract, after gift discovery.
    if (typeof window.gtag === "function") return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", "G-DR5XLDB042");
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-DR5XLDB042";
    document.head.append(script);
  }

  document.addEventListener("click", event => {
    const link = event.target?.closest?.("a[data-analytics-event]");
    if (!link || !["product_click", "guide_click"].includes(link.dataset.analyticsEvent)) return;
    initialize();
    window.gtag("event", link.dataset.analyticsEvent, {
      event_category: "conversion_signal",
      event_label: link.dataset.analyticsLabel || normalize(link.textContent),
      link_url: link.href,
      link_text: normalize(link.textContent),
      page_path: window.location.pathname,
      transport_type: "beacon"
    });
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      initialize();
      observer.disconnect();
    });
    observer.observe(gifts);
  }
})();
