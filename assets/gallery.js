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
  const gallery = document.querySelector("[data-recent-gallery]");
  if (!gallery) return;

  const validSizes = new Set(["square", "tall", "wide", "large"]);
  const uploadedSizes = ["large", "square", "tall", "wide"];

  const makeItem = (item, index) => {
    const figure = document.createElement("figure");
    figure.className = "showroom-made-item is-visible";
    figure.dataset.size = validSizes.has(item.size) ? item.size : "square";

    const image = document.createElement("img");
    image.src = item.src;
    image.alt = item.alt || "낫띵메터스에서 만든 쿠키";
    image.loading = "lazy";
    image.decoding = "async";
    figure.append(image);

    if (item.title) {
      const caption = document.createElement("figcaption");
      caption.className = "showroom-made-caption";
      caption.textContent = item.title;
      figure.append(caption);
    }

    figure.style.setProperty("--made-index", String(index));
    return figure;
  };

  const renderArchive = (items) => {
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => fragment.append(makeItem(item, index)));
    gallery.replaceChildren(fragment);
  };

  const getUploadedItems = async () => {
    try {
      const response = await fetch("/api/gallery", { headers: { Accept: "application/json" } });
      if (!response.ok) return [];
      const payload = await response.json();

      return (payload.items || [])
        .filter((item) => item.userUploaded)
        .slice(0, 12)
        .map((item, index) => ({
          src: item.src,
          alt: item.caption || "낫띵메터스에서 만든 쿠키",
          title: index % 4 === 0 ? "new from our kitchen" : "",
          size: uploadedSizes[index % uploadedSizes.length]
        }));
    } catch (error) {
      return [];
    }
  };

  renderArchive(madeArchiveItems);

  getUploadedItems().then((uploadedItems) => {
    if (uploadedItems.length) renderArchive([...uploadedItems, ...madeArchiveItems]);
  });
})();
