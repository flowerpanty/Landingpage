(() => {
  const list = document.querySelector("[data-journal-list]");
  if (!list) return;

  const createText = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };

  const createCard = (post) => {
    const article = document.createElement("article");
    article.className = "showroom-journal-card";
    const link = document.createElement("a");
    link.href = post.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.dataset.analyticsEvent = "blog_card_click";
    link.dataset.analyticsPostTitle = post.title;

    const media = document.createElement("figure");
    media.className = "showroom-journal-media";
    if (post.image) {
      const image = document.createElement("img");
      image.src = post.image;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      media.append(image);
    } else {
      media.classList.add("is-empty");
      media.append(createText("span", "showroom-journal-placeholder", "JOURNAL"));
    }

    const copy = document.createElement("div");
    copy.className = "showroom-journal-copy";
    copy.append(createText("p", "showroom-journal-category", post.category || "JOURNAL"));
    copy.append(createText("h3", "showroom-journal-title", post.title));
    if (post.excerpt) copy.append(createText("p", "showroom-journal-excerpt", post.excerpt));

    const meta = document.createElement("div");
    meta.className = "showroom-journal-meta";
    if (post.date) meta.append(createText("time", "showroom-journal-date", post.date));
    meta.append(createText("span", "showroom-journal-read", "읽어보기 →"));
    copy.append(meta);

    link.append(media, copy);
    article.append(link);
    return article;
  };

  fetch("/api/journal", { headers: { Accept: "application/json" }, credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error("journal_unavailable");
      return response.json();
    })
    .then((payload) => {
      const posts = Array.isArray(payload?.items) ? payload.items.slice(0, 3) : [];
      if (!posts.length) return;
      list.replaceChildren(...posts.map(createCard));
    })
    .catch(() => {
      // The static fallback remains available when WordPress or the network is unavailable.
    });
})();
