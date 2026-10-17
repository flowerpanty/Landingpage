"use strict";

(() => {
  const form = document.getElementById("works-filters");
  const cards = [...document.querySelectorAll("[data-works-cards] .nm-work-card")];
  const count = document.querySelector("[data-works-count]");
  const empty = document.querySelector("[data-works-empty]");
  if (!form || !count || !empty) return;
  const buttons = [...form.querySelectorAll("[data-work-purpose-filter]")];
  let purpose = "";
  const matchesQuantity = (value, range) => {
    if (!range) return true;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) return false;
    if (range === "100+") return quantity > 100;
    const [min, max] = range.split("-").map(Number);
    return quantity >= min && quantity <= max;
  };
  const update = () => {
    let visible = 0;
    for (const card of cards) {
      const cardPurpose = card.dataset.workPurpose === "기업 행사" ? "기업행사" : card.dataset.workPurpose;
      const cardProduct = card.dataset.workProduct === "브라우니쿠키" ? "브루키" : card.dataset.workProduct;
      const productMatch = !form.elements.product.value || cardProduct === form.elements.product.value ||
        (form.elements.product.value === "기타" && ["기타", "비행기 버터쿠키", "쿠키크루"].includes(cardProduct));
      card.hidden = Boolean((purpose && cardPurpose !== purpose) || !productMatch || !matchesQuantity(card.dataset.workQuantity, form.elements.quantity.value));
      if (!card.hidden) visible++;
    }
    count.textContent = `총 ${visible}개의 제작 사례`;
    empty.hidden = visible !== 0;
  };
  buttons.forEach((button) => button.addEventListener("click", () => {
    purpose = button.dataset.workPurposeFilter;
    buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    update();
  }));
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("change", update);
  update();
})();
