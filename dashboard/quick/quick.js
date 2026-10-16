"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const form = $("quickForm");
  const basicAddress = $("basicAddress");
  const detailAddress = $("detailAddress");
  const types = { QUICK: "일반 퀵", QUICK_ECONOMY: "이코노미", QUICK_EXPRESS: "급송" };
  const sizes = { XS: "초소형", S: "소형", M: "중형" };
  const money = value => `${value.toLocaleString("ko-KR")}원`;
  let ready = false;
  let busy = false;
  let version = 0;
  function message(value, error = false) {
    $("actionStatus").textContent = value;
    $("actionStatus").dataset.error = String(error);
  }
  function invalidate() {
    version++;
    $("estimatedPrice").textContent = "조회 전";
    $("estimatedTime").textContent = "조회 전";
    $("priceRangeRow").hidden = true;
    $("resultAddress").hidden = true;
    $("quoteBasis").textContent = `${types[$("orderType").value]} · ${sizes[$("productSize").value]}(${$("productSize").value}) 기준`;
    message("");
  }
  form.addEventListener("input", invalidate);
  form.addEventListener("change", invalidate);
  $("addressSearchButton").addEventListener("click", () => {
    if (!window.kakao?.Postcode) {
      message("주소검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
      return;
    }
    new window.kakao.Postcode({
      oncomplete(data) {
        const address = data.roadAddress || data.jibunAddress || data.address || "";
        if (!address) {
          message("주소를 선택해 주세요.", true);
          return;
        }
        basicAddress.value = address;
        basicAddress.dispatchEvent(new Event("input", { bubbles: true }));
        detailAddress.focus();
      }
    }).open();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!ready || busy || !form.reportValidity()) return;
    // Readonly inputs are excluded from native required validation.
    if (!basicAddress.value.trim()) {
      message("주소를 선택해 주세요.", true);
      $("addressSearchButton").focus();
      return;
    }
    invalidate();
    const current = version;
    const body = { basicAddress: $("basicAddress").value.trim(), detailAddress: $("detailAddress").value.trim(), orderType: $("orderType").value, productSize: $("productSize").value };
    busy = true;
    $("quoteButton").disabled = true;
    form.setAttribute("aria-busy", "true");
    message("카카오 T 퀵 요금을 확인하고 있어요…");
    try {
      const response = await fetch("/api/kakao-quick/quote-address", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "X-Quick-Request": "1" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (current !== version) return;
      if (!response.ok) {
        if (result.error === "address_not_found") throw new Error("배송지 주소를 찾지 못했습니다. 도로명 주소를 다시 확인해 주세요.");
        throw new Error(result.message || "조회하지 못했습니다. 잠시 후 다시 이용해 주세요.");
      }
      if (!Number.isFinite(result.price?.totalPrice) || !Number.isFinite(result.estimate?.estimatedTime) || !result.address) throw new Error("조회 결과를 확인하지 못했습니다. 다시 조회해 주세요.");
      $("estimatedPrice").textContent = money(result.price.totalPrice);
      $("estimatedTime").textContent = `약 ${Math.max(1, Math.ceil(result.estimate.estimatedTime / 60))}분`;
      const hasRange = Number.isFinite(result.price.minimum) && Number.isFinite(result.price.maximum);
      $("priceRangeRow").hidden = !hasRange;
      if (hasRange) $("priceRange").textContent = `${money(result.price.minimum)} ~ ${money(result.price.maximum)}`;
      $("quoteBasis").textContent = `${types[body.orderType]} · ${sizes[body.productSize]}(${body.productSize}) 기준`;
      $("resultAddress").textContent = `${result.address.basicAddress} ${result.address.detailAddress}`.trim();
      $("resultAddress").hidden = false;
      message("예상 퀵비와 배송시간을 확인했습니다.");
    } catch (error) { if (current === version) message(error instanceof Error ? error.message : "조회 중 연결을 확인하지 못했습니다.", true); }
    finally { busy = false; $("quoteButton").disabled = false; form.setAttribute("aria-busy", "false"); }
  });
  fetch("/api/kakao-quick/config", { credentials: "same-origin", cache: "no-store" }).then(async response => {
    if (!response.ok) throw new Error();
    const config = await response.json();
    ready = config.ready === true;
    $("pickupName").textContent = config.pickup.name;
    $("pickupAddress").textContent = `${config.pickup.address} ${config.pickup.detail}`.trim();
    $("environmentBadge").textContent = config.sandbox ? "SANDBOX" : "실시간 조회";
    $("formFields").disabled = !ready;
    $("setupStatus").textContent = ready ? "주소 찾기로 배송지를 선택하고 상세주소를 입력해 주세요." : "현재 요금 조회를 준비 중입니다. 잠시 후 다시 이용해 주세요.";
  }).catch(() => { $("setupStatus").textContent = "조회 준비 상태를 확인하지 못했습니다. 잠시 후 새로고침해 주세요."; });
})();
