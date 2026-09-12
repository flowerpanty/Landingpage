(() => {
  if (document.querySelector('script[data-nm-schema="static"]')) return;

  const origin = window.location.origin || "https://nothingmatters.co.kr";
  const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
  const title = document.title || "낫띵메터스";
  const description = document.querySelector('meta[name="description"]')?.content || "";
  const script = document.createElement("script");

  script.type = "application/ld+json";
  script.dataset.nmSchema = "fallback";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: "nothingmatters"
      },
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        isPartOf: { "@id": `${origin}/#website` },
        inLanguage: document.documentElement.lang || "ko-KR"
      }
    ]
  });
  document.head.append(script);
})();
