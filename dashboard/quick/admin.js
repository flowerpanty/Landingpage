"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const form = $("quickForm");
  const types = { QUICK: "일반 퀵", QUICK_ECONOMY: "이코노미", QUICK_EXPRESS: "급송" };
  const fleets = { MOTORCYCLE: "오토바이", JIMBAJI_MOTORCYCLE: "짐받이 오토바이", PASSENGER_CAR: "승용차", DAMAS: "다마스", LABO: "라보", TON: "1톤" };
  const statuses = { RESERVED: "예약", MATCHING: "배송원 배정 중", MATCHED: "배송원 배정 완료", PICKUP_WAITING: "픽업 대기", PICKUP_STARTED: "픽업지 이동 중", PICKUP_COMPLETED: "픽업 완료", DROPOFF_WAITING: "배송 대기", DROPOFF_STARTED: "배송 중", DROPOFF_COMPLETED: "배송 완료", COMPLETED: "완료", CANCELED: "취소", MATCHING_FAILED: "배정 실패", ABORTED: "종료" };
  const money = value => Number.isFinite(value) ? `${value.toLocaleString("ko-KR")}원` : "확인 필요";
  let ready = false;
  let canCreate = false;
  let quote = null;
  let orderId = null;
  let quoting = false;
  let creating = false;
  let version = 0;

  function message(value, error = false) {
    $("actionStatus").textContent = value;
    $("actionStatus").dataset.error = String(error);
  }
  function updateCreate() {
    $("createButton").disabled = !canCreate || !quote || !$("quoteConfirmed").checked || creating || quoting || Boolean(orderId);
  }
  function invalidate() {
    version++;
    quote = null;
    $("quoteConfirmed").checked = false;
    $("quoteConfirmed").disabled = true;
    $("estimatedPrice").textContent = "조회 전";
    $("estimatedTime").textContent = "조회 전";
    $("estimatedService").textContent = "선택 후 조회";
    $("priceRangeRow").hidden = true;
    if ($("confirmDialog").open) $("confirmDialog").close();
    updateCreate();
  }
  function toggleFields() {
    const large = $("productSize").value === "L";
    $("fleetField").hidden = !large;
    $("fleet").required = large;
    if (!large) $("fleet").value = "";
    const reserved = $("pickupMode").value === "reserved";
    $("wishTimeField").hidden = !reserved;
    $("wishTime").required = reserved;
    if (!reserved) $("wishTime").value = "";
  }
  function input() {
    const value = Object.fromEntries(new FormData(form));
    value.wishTime = value.pickupMode === "reserved" && value.wishTime ? `${value.wishTime.length === 16 ? value.wishTime + ":00" : value.wishTime}+09:00` : "";
    return value;
  }
  function valid() {
    for (const name of ["latitude", "longitude"]) {
      if (!$(name).validity.valid) $("coordinates").open = true;
    }
    if (!form.reportValidity()) return false;
    const value = input();
    if (canCreate && !/^0\d{8,10}$/.test(value.recipientPhone.replace(/[\s()-]/g, ""))) {
      message("연락처를 확인해 주세요.", true); $("recipientPhone").focus(); return false;
    }
    if (value.pickupMode === "reserved") {
      const delta = Date.parse(value.wishTime) - Date.now();
      const minimum = value.orderType === "QUICK_ECONOMY" ? 60 : 20;
      if (!Number.isFinite(delta) || delta < minimum * 60000 || delta > 14 * 86400000) {
        message(`예약은 한국시간 기준 ${minimum}분 이후, 14일 이내로 선택해 주세요.`, true); $("wishTime").focus(); return false;
      }
    }
    return true;
  }
  async function api(path, body) {
    const response = await fetch(`/api/kakao-quick/${path}`, {
      method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Quick-Admin": "1" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("관리자 로그인과 서버 응답을 확인해 주세요."); }
    if (!response.ok) {
      const error = new Error(data.message || (response.status === 401 ? "관리자 로그인이 필요합니다." : "요청을 처리하지 못했습니다."));
      error.order = data.order;
      error.status = response.status;
      error.code = data.error;
      throw error;
    }
    return data;
  }
  function renderOrder(order, existing = false) {
    orderId = order.partnerOrderId;
    $("successTitle").textContent = existing ? "이미 등록된 퀵 주문입니다." : "카카오 T 퀵 접수 완료";
    $("successOrderId").textContent = order.partnerOrderId;
    $("successStatus").textContent = statuses[order.status] || `카카오 상태: ${order.status}`;
    $("successPrice").textContent = money(order.totalPrice);
    $("successKakaoId").textContent = order.kakaoOrderId || "확인 필요";
    $("successCard").hidden = false;
    $("formFields").disabled = true;
    $("quoteConfirmed").disabled = true;
    updateCreate();
  }
  form.addEventListener("input", () => { invalidate(); toggleFields(); });
  form.addEventListener("change", () => { invalidate(); toggleFields(); });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!ready || quoting || creating || orderId || !valid()) return;
    invalidate();
    const currentVersion = version;
    const value = input();
    quoting = true;
    $("quoteButton").disabled = true;
    updateCreate();
    message("카카오 T 퀵 요금을 확인하고 있어요…");
    try {
      const [price, estimate] = await Promise.all([api("price", value), api("estimate", value)]);
      if (currentVersion !== version) { message("입력이 변경되었습니다. 다시 조회해 주세요."); return; }
      if (canCreate && price.quoteToken !== estimate.quoteToken) throw new Error("조회 결과를 다시 확인해 주세요.");
      quote = { input: value, token: price.quoteToken, price: price.price, estimate: estimate.estimate };
      $("estimatedPrice").textContent = money(price.price.totalPrice);
      const hasRange = price.price.minimum !== undefined && price.price.maximum !== undefined;
      $("priceRangeRow").hidden = !hasRange;
      if (hasRange) $("priceRange").textContent = `${money(price.price.minimum)} ~ ${money(price.price.maximum)}`;
      $("estimatedTime").textContent = `약 ${Math.max(1, Math.ceil(estimate.estimate.estimatedTime / 60))}분`;
      $("estimatedService").textContent = `${fleets[estimate.estimate.fleet] || estimate.estimate.fleet} / ${types[estimate.estimate.orderType] || estimate.estimate.orderType}`;
      $("summaryDropoff").textContent = `${value.basicAddress} ${value.detailAddress}`.trim();
      $("quoteConfirmed").disabled = !canCreate;
      message(canCreate ? "배송지와 예상 요금을 확인한 뒤 접수해 주세요. 조회 결과는 5분간 사용할 수 있습니다." : "예상 요금과 시간을 확인했습니다. 배송 접수는 관리자 로그인 후 진행합니다.");
    } catch (error) { if (currentVersion === version) message(error.message, true); }
    finally { quoting = false; $("quoteButton").disabled = false; updateCreate(); }
  });
  $("quoteConfirmed").addEventListener("change", updateCreate);
  $("createButton").addEventListener("click", () => {
    if (!canCreate || !quote || creating || !$("quoteConfirmed").checked || !valid()) return;
    $("confirmOrderId").textContent = quote.input.partnerOrderId;
    $("confirmAddress").textContent = `${quote.input.basicAddress} ${quote.input.detailAddress}`.trim();
    $("confirmRecipient").textContent = quote.input.recipientName;
    $("confirmPrice").textContent = money(quote.price.totalPrice);
    $("confirmDialog").showModal();
  });
  $("cancelConfirm").addEventListener("click", () => $("confirmDialog").close());
  $("confirmDialog").addEventListener("cancel", event => { if (creating) event.preventDefault(); });
  $("submitConfirm").addEventListener("click", async () => {
    if (!canCreate || !quote || creating || !$("quoteConfirmed").checked) return;
    creating = true;
    $("submitConfirm").disabled = true;
    $("cancelConfirm").disabled = true;
    $("formFields").disabled = true;
    updateCreate();
    message("퀵 주문을 접수하고 있어요…");
    try {
      const result = await api("orders", { ...quote.input, confirmed: true, quoteToken: quote.token });
      renderOrder(result.order);
      message("접수가 완료되었습니다. 주문 상태를 새로고침할 수 있습니다.");
      $("successCard").focus();
    } catch (error) {
      message(error.message, true);
      if (error.order) renderOrder(error.order, true);
      else if (error.status >= 400 && error.status < 500 && error.code !== "order_pending") {
        // A rejected validation/expired quote did not create an order; allow a fresh quote.
        invalidate();
        $("formFields").disabled = false;
      }
      else {
        // A network error may follow a successful create. Offer lookup before another attempt.
        orderId = quote.input.partnerOrderId;
        $("successTitle").textContent = "접수 결과를 먼저 확인해 주세요";
        $("successOrderId").textContent = orderId;
        $("successStatus").textContent = "조회 필요";
        $("successPrice").textContent = "확인 필요";
        $("successKakaoId").textContent = "확인 필요";
        $("successCard").hidden = false;
      }
    } finally {
      creating = false;
      $("confirmDialog").close();
      $("submitConfirm").disabled = false;
      $("cancelConfirm").disabled = false;
      $("quoteConfirmed").disabled = true;
      updateCreate();
    }
  });
  $("refreshButton").addEventListener("click", async () => {
    if (!orderId) return;
    $("refreshButton").disabled = true;
    try { renderOrder((await api(`orders/${encodeURIComponent(orderId)}`)).order); message("주문 상태를 새로고침했습니다."); }
    catch (error) { message(error.message, true); }
    finally { $("refreshButton").disabled = false; }
  });
  $("newButton").addEventListener("click", () => {
    if (creating) return;
    form.reset(); orderId = null; invalidate(); toggleFields();
    $("formFields").disabled = !ready;
    $("successCard").hidden = true;
    $("coordinates").open = false;
    $("summaryDropoff").textContent = "배송지 입력 후 조회";
    message(""); $("partnerOrderId").focus();
  });
  const adminEntry = document.body.dataset.quickEntry === "admin";
  api(adminEntry ? "admin-config" : "config").then(config => {
    ready = config.ready;
    canCreate = config.canCreate === true;
    for (const section of document.querySelectorAll('[data-admin-only]')) {
      section.hidden = !canCreate;
      for (const control of section.querySelectorAll('input,select,textarea')) control.disabled = !canCreate;
    }
    $("confirmationField").hidden = !canCreate;
    $("createButton").hidden = !canCreate;
    $("publicAccess").hidden = canCreate;
    $("formTitle").textContent = canCreate ? "퀵 배송 정보 입력" : "배송비·시간 조회";
    $("environmentBadge").textContent = config.sandbox ? "SANDBOX" : "실서비스";
    $("pickupName").textContent = config.pickup.name;
    const address = `${config.pickup.address} ${config.pickup.detail}`.trim();
    $("pickupAddress").textContent = address;
    $("pickupPhone").textContent = config.pickup.phone || "";
    $("summaryPickup").textContent = `${config.pickup.name}\n${address}`;
    $("formFields").disabled = !ready;
    $("setupStatus").textContent = ready ? (config.sandbox ? "SANDBOX · 테스트 환경의 예상 요금과 시간을 조회합니다." : "예상 요금과 시간을 조회합니다. 배송 접수는 관리자만 진행할 수 있습니다.") : (canCreate ? "Railway Variables에서 카카오퀵 키와 출발지 주소·좌표·연락처를 설정해 주세요." : "현재 퀵 요금 조회를 준비 중입니다. 잠시 후 다시 이용해 주세요.");
  }).catch(error => { $("setupStatus").textContent = error.message; });
})();
