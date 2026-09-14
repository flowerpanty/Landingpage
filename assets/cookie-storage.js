const productData = {
  crew: {
    title: "쿠키크루 보관방법",
    sections: [
      { icon: "⏱", title: "맛있게 드시는 기간", body: "실온 보관 시 수령일 포함 3일 이내 드시는 것을 권장해요." },
      { icon: "❄", title: "냉동 보관", body: "바로 드시지 않을 경우에는 수령 후 밀봉하여 냉동 보관해주세요.<br>냉동 보관 시 2주 이내 드시는 것을 권장해요." },
      { icon: "☀", title: "보관할 때", body: "직사광선과 고온다습한 곳을 피하고, 포장이 개봉되었다면 공기가 들어가지 않도록 잘 밀봉해주세요." },
      { icon: "🍪", title: "냉동했다면", body: "드시기 전 실온에서 자연해동해주세요.<br>조금 더 부드럽고 꾸덕하게 드시고 싶다면 해동 후 살짝 데워 드셔도 좋아요.<br>한 번 해동한 쿠키는 다시 냉동하기보다 가급적 바로 드시는 것을 권장합니다." }
    ]
  },
  brookie: {
    title: "브루키 보관방법",
    sections: [
      { icon: "⏱", title: "맛있게 드시는 기간", body: "브루키는 버터쿠키와 브라우니를 함께 구운 제품이에요.<br>실온 보관 시 수령일 포함 3일 이내 드시는 것을 권장해요." },
      { icon: "❄", title: "냉동 보관", body: "바로 드시지 않을 경우에는 수령 후 밀봉하여 냉동 보관해주세요.<br>냉동 보관 시 2주 이내 드시는 것을 권장해요." },
      { icon: "☀", title: "보관할 때", body: "직사광선과 고온다습한 곳을 피하고, 포장이 개봉되었다면 공기가 들어가지 않도록 잘 밀봉해주세요." },
      { icon: "🍪", title: "냉동했다면", body: "드시기 전 실온에서 자연해동해주세요.<br>조금 더 부드럽고 꾸덕하게 드시고 싶다면 해동 후 살짝 데워 드셔도 좋아요.<br>한 번 해동한 브루키는 다시 냉동하기보다 가급적 바로 드시는 것을 권장합니다." }
    ]
  },
  handmade: {
    title: "수제 꾸덕쿠키 보관방법",
    sections: [
      { icon: "⏱", title: "맛있게 드시는 기간", body: "실온 보관 시 수령일 포함 3일 이내 드시는 것을 권장해요." },
      { icon: "❄", title: "냉동 보관", body: "오래 두고 드실 경우, 수령 후 바로 밀봉하여 냉동 보관해주시고 2주 이내 드시는 것을 권장해요." },
      { icon: "☀", title: "보관할 때", body: "직사광선과 고온다습한 곳은 피해주세요." },
      { icon: "🍪", title: "냉동했다면", body: "드시기 전 실온에서 자연해동해주세요.<br>해동한 쿠키는 가급적 빠르게 드셔주세요." }
    ]
  },
  lucky: {
    title: "행운쿠키 보관방법",
    sections: [
      { icon: "⏱", title: "맛있게 드시는 기간", body: "행운쿠키는 버터쿠키로 만든 제품이에요.<br>실온 보관 시 수령일 포함 7일 이내 드시는 것을 권장해요." },
      { icon: "☀", title: "보관할 때", body: "직사광선과 고온다습한 곳을 피해 서늘한 실온에 보관해주세요.<br>바삭한 식감을 위해 개봉 후에는 포장을 잘 닫아주세요." },
      { icon: "❄", title: "냉동 보관", body: "오래 보관해야 한다면 밀봉한 상태로 냉동 보관할 수 있어요.<br>드시기 전 실온에서 충분히 자연해동해주세요." },
      { icon: "🍪", title: "개봉했다면", body: "공기와 습기에 노출되면 바삭한 식감이 떨어질 수 있어요.<br>가급적 빠르게 드시는 것을 권장합니다." }
    ]
  }
};

const cards = [...document.querySelectorAll(".product-card")];
const titleEl = document.getElementById("guide-title");
const infoListEl = document.getElementById("info-list");
const guidePanel = document.getElementById("guide-panel");

function renderProduct(key, shouldScroll = true, updateHistory = shouldScroll) {
  const product = productData[key];
  if (!product) return;

  cards.forEach((card) => {
    const active = card.dataset.product === key;
    card.classList.toggle("active", active);
    card.setAttribute("aria-pressed", String(active));
  });
  titleEl.textContent = product.title;
  infoListEl.innerHTML = product.sections
    .map((section) => `<div class="info"><div class="icon" aria-hidden="true">${section.icon}</div><div><strong>${section.title}</strong><p>${section.body}</p></div></div>`)
    .join("");
  if (updateHistory) {
    try { history.replaceState(null, "", `${location.pathname}${location.search}#${key}`); } catch (error) {}
  }
  if (shouldScroll) guidePanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

cards.forEach((card) => card.addEventListener("click", () => renderProduct(card.dataset.product)));
const initialKey = location.hash.replace(/^#/, "");
renderProduct(productData[initialKey] ? initialKey : "crew", false, false);

const params = new URLSearchParams(location.search);
const campaign = {
  source: params.get("utm_source") || "",
  medium: params.get("utm_medium") || "",
  campaign: params.get("utm_campaign") || ""
};
if (campaign.source || campaign.medium || campaign.campaign) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: "cookie_care_landing", ...campaign });
}
