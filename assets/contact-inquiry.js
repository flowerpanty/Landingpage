"use strict";

(() => {
  const form = document.getElementById("contact-inquiry-form");
  const template = document.getElementById("inquiry-template");
  if (!form || !template) return;
  const fields = form.elements;
  const query = new URLSearchParams(window.location.search);
  const selectValue = (name, value) => {
    if ([...fields[name].options].some((option) => option.value === value)) fields[name].value = value;
  };
  for (const name of ["purpose", "product"]) {
    if (query.has(name)) selectValue(name, query.get(name));
  }
  const fulfillment = query.get("fulfillment");
  if (fulfillment) selectValue("fulfillment", fulfillment === "예약 픽업" ? "공항동 예약 픽업" : fulfillment === "상담 후 결정" ? "상담 필요" : fulfillment);
  const quantity = query.get("quantity") || "";
  if (/^\d{1,6}$/.test(quantity) && Number(quantity) >= 1 && Number(quantity) <= 100000) fields.quantity.value = quantity;
  const reference = (query.get("reference") || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const text = (name) => fields[name].value.trim() || "미정";
  const number = (name, min, max = Number.MAX_SAFE_INTEGER) => {
    const value = fields[name].value;
    const parsed = Number(value);
    return value !== "" && Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
  };
  const update = () => {
    const quantityValue = number("quantity", 1, 100000);
    const budget = number("budget", 0);
    const date = fields.date.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const lines = ["안녕하세요. 낫띵메터스 쿠키 주문 문의드립니다.", "",
      `행사/용도: ${text("purpose")}`,
      `희망 수령일: ${date ? `${date[1]}년 ${Number(date[2])}월 ${Number(date[3])}일` : "미정"}`,
      `예상 수량: ${quantityValue === null ? "미정" : `약 ${quantityValue.toLocaleString("ko-KR")}개`}`,
      `예산: ${budget === null ? "미정" : `약 ${budget.toLocaleString("ko-KR")}원`}`,
      `관심 제품: ${text("product")}`, `원하는 분위기/포장: ${text("packaging")}`,
      `문구/스티커: ${text("messageOption")}`, `수령 방법: ${text("fulfillment")}`,
      `추가 메모: ${text("note")}`, "", "가능한 구성과 제작 일정 확인 부탁드립니다."];
    if (reference) lines.push("", "참고 제작 사례:", reference);
    template.textContent = lines.join("\n");
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", (event) => event.preventDefault());
  update();
})();
