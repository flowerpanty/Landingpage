"use strict";

const catalog = require("../data/christmas-products.json");
const products = new Map(catalog.products.map(product => [product.sku, product]));

// Keep closed until Railway supports this catalog, durable idempotency and
// returns its saved line items and total. A frontend flag cannot enable saving.
function christmasOrderStatus() {
  return { enabled: false, catalogVersion: catalog.version, message: "온라인 주문 신청을 준비 중입니다. 선택한 구성은 카카오톡으로 상담해 주세요." };
}

function calculateChristmasOrder(items) {
  if (!Array.isArray(items) || !items.length || items.length > products.size) throw new Error("상품을 한 종류 이상 선택해 주세요.");
  const seen = new Set();
  const orderItems = items.map(item => {
    const product = products.get(item?.sku);
    if (!product || seen.has(item.sku)) throw new Error("상품 구성을 다시 확인해 주세요.");
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.quantity * product.price)) throw new Error("수량은 올바른 양의 정수로 입력해 주세요.");
    seen.add(item.sku);
    return { sku: product.sku, name: product.name, quantity: item.quantity, price: product.price, lineTotal: product.price * item.quantity };
  });
  const totalPrice = orderItems.reduce((total, item) => total + item.lineTotal, 0);
  if (!Number.isSafeInteger(totalPrice)) throw new Error("수량을 다시 확인해 주세요.");
  return { orderItems, totalPrice };
}

function validateChristmasOrder(body) {
  const result = calculateChristmasOrder(body.items);
  if (body.catalogVersion !== catalog.version) throw new Error("상품 정보가 변경되었습니다. 페이지를 새로고침해 주세요.");
  if (typeof body.customerName !== "string" || !body.customerName.trim() || body.customerName.length > 80) throw new Error("주문자 이름을 확인해 주세요.");
  if (typeof body.customerPhone !== "string" || !/^010[-\s]?\d{4}[-\s]?\d{4}$/.test(body.customerPhone.trim())) throw new Error("휴대전화 번호를 확인해 주세요.");
  const date = typeof body.deliveryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.deliveryDate) ? new Date(`${body.deliveryDate}T00:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== body.deliveryDate) throw new Error("수령 희망 날짜를 확인해 주세요.");
  if (typeof body.pickupTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.pickupTime)) throw new Error("수령 희망 시간을 확인해 주세요.");
  if (!["pickup", "quick"].includes(body.deliveryMethod)) throw new Error("수령 방식을 확인해 주세요.");
  if (body.request != null && (typeof body.request !== "string" || body.request.length > 1000)) throw new Error("요청사항을 확인해 주세요.");
  if (body.privacyConsent !== true) throw new Error("개인정보 수집·이용 동의를 확인해 주세요.");
  if (typeof body.idempotencyKey !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(body.idempotencyKey)) throw new Error("주문 요청 정보를 새로 생성해 주세요.");
  return result;
}

module.exports = { christmasOrderStatus, calculateChristmasOrder, validateChristmasOrder };
