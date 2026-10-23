(() => {
  'use strict';
  const catalog = JSON.parse(document.getElementById('xmas-catalog').textContent);
  const products = new Map(catalog.products.map(product => [product.sku, product]));
  const byId = id => document.getElementById(id);
  const form = byId('xmas-order-form');
  const cards = [...document.querySelectorAll('.xmas-product[data-sku]')];
  const dialog = byId('xmas-gallery');
  const won = value => `${value.toLocaleString('ko-KR')}원`;
  const fields = { deliveryDate: 'xmas-date', pickupTime: 'xmas-time', customerName: 'xmas-name', customerPhone: 'xmas-phone', request: 'xmas-request' };
  const stepNames = ['상품 선택', '수령 정보', '확인 및 접수'];
  const stepTitles = ['products-title', 'details-title', 'review-title'];
  // One model for both layouts; history contains only the step and gallery SKU.
  const state = {
    step: 1,
    quantities: new Map(catalog.products.map(product => [product.sku, 0])),
    invalid: new Set(),
    customer: Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, byId(id).value])),
    method: 'pickup', consent: false, enabled: false, busy: false,
    saved: false, uncertain: false, idempotencyKey: null,
    gallery: null
  };
  let galleryOpener, galleryClosing = false;
  const locked = () => state.saved || state.uncertain;
  const error = (id, message) => {
    const node = byId(id);
    node.textContent = message;
    node.hidden = !message;
  };
  function selection() {
    const items = catalog.products.filter(p => state.quantities.get(p.sku) > 0)
      .map(p => ({ sku: p.sku, quantity: state.quantities.get(p.sku) }));
    return {
      items,
      total: items.reduce((sum, item) => sum + products.get(item.sku).price * item.quantity, 0),
      count: items.reduce((sum, item) => sum + item.quantity, 0)
    };
  }
  const selectionValid = () => selection().count > 0 && state.invalid.size === 0;
  function customer() {
    return { ...Object.fromEntries(Object.entries(state.customer).map(([key, value]) => [key, value.trim()])), deliveryMethod: state.method };
  }
  function validationErrors() {
    const info = customer();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(info.deliveryDate) ? new Date(`${info.deliveryDate}T00:00:00Z`) : null;
    return [
      ['xmas-date', !!date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === info.deliveryDate, '수령 희망 날짜를 입력해 주세요.'],
      ['xmas-time', /^([01]\d|2[0-3]):[0-5]\d$/.test(info.pickupTime), '수령 희망 시간을 입력해 주세요.'],
      ['xmas-name', !!info.customerName && info.customerName.length <= 80, '주문자 이름을 입력해 주세요.'],
      ['xmas-phone', /^010[-\s]?\d{4}[-\s]?\d{4}$/.test(info.customerPhone), '010으로 시작하는 휴대전화 번호를 입력해 주세요.']
    ];
  }
  function validateCustomer() {
    let first;
    for (const [id, valid, message] of validationErrors()) {
      error(`${id}-error`, valid ? '' : message);
      byId(id).toggleAttribute('aria-invalid', !valid);
      if (!valid) { byId(id).setAttribute('aria-invalid', 'true'); first ||= byId(id); }
    }
    first?.focus();
    return !first;
  }
  function renderLines(target, items) {
    target.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.textContent = '아직 선택한 상품이 없어요. 선물을 골라주세요.';
      target.append(empty);
      return;
    }
    const list = document.createElement('ul');
    for (const item of items) {
      const product = products.get(item.sku);
      const line = document.createElement('li');
      const label = document.createElement('span');
      const price = document.createElement('b');
      label.textContent = `${product.name} × ${item.quantity}`;
      price.textContent = won(product.price * item.quantity);
      line.append(label, price);
      list.append(line);
    }
    target.append(list);
  }
  function renderReview(items, total) {
    renderLines(byId('xmas-review-items'), items);
    byId('xmas-review-total').textContent = won(total);
    const info = customer();
    const lines = [
      ['수령 방식', info.deliveryMethod === 'pickup' ? '예약 픽업' : '차량 퀵 희망 · 가능 여부와 비용 상담 필요'],
      ['수령 희망', `${info.deliveryDate} ${info.pickupTime}`],
      ['주문자', info.customerName], ['휴대전화', info.customerPhone],
      ['요청사항', info.request || '없음']
    ];
    const target = byId('xmas-review');
    target.replaceChildren();
    for (const [label, value] of lines) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value;
      target.append(dt, dd);
    }
  }
  function actionLabel() {
    if (state.busy) return '접수 확인 중…';
    if (state.saved) return '주문 요청 접수됨';
    if (state.uncertain) return '접수 여부 상담 필요';
    if (state.step === 1) return '수령 정보 입력 →';
    if (state.step === 2) return '주문 내역 확인 →';
    return state.enabled ? '주문 요청 신청하기' : '온라인 신청 준비 중';
  }
  function render() {
    const { items, total, count } = selection();
    const ready = selectionValid();
    document.querySelectorAll('[data-order-step]').forEach(panel => { panel.hidden = Number(panel.dataset.orderStep) !== state.step; });
    document.querySelectorAll('[data-step-link]').forEach(button => {
      const step = Number(button.dataset.stepLink);
      button.disabled = state.busy || locked() || (step > 1 && !ready) || (step === 3 && validationErrors().some(([, valid]) => !valid));
      if (step === state.step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    byId('xmas-back').hidden = state.step === 1;
    byId('xmas-back').disabled = state.busy || locked();
    byId('xmas-step-status').textContent = `STEP ${state.step} / 3 · ${stepNames[state.step - 1]}`;
    renderLines(byId('xmas-selected'), items);
    byId('xmas-total-count').textContent = `${count}개`;
    byId('xmas-total-price').textContent = won(total);
    byId('xmas-sticky-total').textContent = won(total);
    byId('xmas-sticky-count').textContent = `STEP ${state.step} / 3 · 선물 ${count}개`;
    byId('xmas-live-total').textContent = `선택 수량 ${count}개, 상품 합계 ${won(total)}`;
    if (state.step === 3) renderReview(items, total);
    const actionDisabled = !ready || state.busy || locked() || (state.step === 3 && (!state.enabled || !state.consent));
    byId('xmas-next').hidden = state.step === 3;
    byId('xmas-submit').hidden = state.step !== 3;
    for (const id of ['xmas-next', 'xmas-submit', 'xmas-sticky-next']) {
      byId(id).textContent = actionLabel();
      byId(id).disabled = actionDisabled;
    }
    byId('xmas-consent-row').hidden = !state.enabled;
    form.querySelectorAll('input, textarea, [data-edit-step]').forEach(node => { node.disabled = state.busy || locked(); });
    for (const card of cards) {
      const quantity = state.quantities.get(card.dataset.sku);
      card.classList.toggle('is-selected', quantity > 0);
      card.querySelector('[data-delta="-1"]').disabled = state.busy || locked() || quantity === 0;
      card.querySelector('[data-delta="1"]').disabled = state.busy || locked();
      card.querySelector('[data-gallery]').disabled = false;
      card.querySelector('[data-line-total]').textContent = won(products.get(card.dataset.sku).price * quantity);
    }
    byId('xmas-copy').disabled = !ready || state.busy;
  }
  function invalidate() {
    state.idempotencyKey = null;
    error('xmas-submit-error', '');
    byId('xmas-copy-status').textContent = '';
    byId('xmas-copy-fallback')?.remove();
  }
  function changeQuantity(card, value) {
    if (state.busy || locked()) return;
    invalidate();
    const sku = card.dataset.sku, field = card.querySelector('input');
    const quantity = Number(value), price = products.get(sku).price;
    const total = selection().total - state.quantities.get(sku) * price + quantity * price;
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(quantity) || !Number.isSafeInteger(quantity * price) || !Number.isSafeInteger(total)) {
      state.invalid.add(sku);
      field.setAttribute('aria-invalid', 'true');
    } else {
      state.invalid.delete(sku);
      state.quantities.set(sku, quantity);
      field.value = String(quantity);
      field.removeAttribute('aria-invalid');
    }
    error('xmas-selection-error', state.invalid.size ? '수량은 0 이상의 정수로 입력해 주세요. 너무 큰 수량은 상담으로 문의해 주세요.' : '');
    render();
  }
  function historyData(step, extra = {}) {
    return { nmChristmasStep: step, ...extra };
  }
  function goStep(target, { mode = 'push', focus = true } = {}) {
    if (state.busy || locked()) return;
    let next = Math.max(1, Math.min(3, target));
    if (next > 1 && !selectionValid()) next = 1;
    const invalidCustomer = next === 3 && validationErrors().some(([, valid]) => !valid);
    if (invalidCustomer) next = 2;
    const changed = state.step !== next;
    const previousStep = state.step;
    state.step = next;
    if (mode === 'replace' || (mode === 'push' && changed)) history[mode === 'replace' ? 'replaceState' : 'pushState'](historyData(next, { previousStep }), '', `#step-${next}`);
    render();
    if (invalidCustomer) { validateCustomer(); return; }
    if (focus && (changed || mode !== 'none')) {
      byId('christmas-order').scrollIntoView({ block: 'start' });
      byId(stepTitles[next - 1]).focus({ preventScroll: true });
    }
    if (target > 1 && next === 1 && state.invalid.size) cards.find(card => state.invalid.has(card.dataset.sku))?.querySelector('input').focus();
  }
  function advance() {
    if (state.busy || locked() || !selectionValid()) return;
    if (state.step === 3) { form.requestSubmit(); return; }
    if (state.step === 2 && !validateCustomer()) return;
    goStep(state.step + 1);
  }
  for (const card of cards) {
    card.querySelector('input').addEventListener('input', event => changeQuantity(card, event.target.value));
    card.querySelectorAll('[data-delta]').forEach(button => button.addEventListener('click', () => changeQuantity(card, state.quantities.get(card.dataset.sku) + Number(button.dataset.delta))));
  }
  for (const [key, id] of Object.entries(fields)) byId(id).addEventListener('input', event => {
    state.customer[key] = event.target.value;
    byId(id).removeAttribute('aria-invalid');
    if (byId(`${id}-error`)) error(`${id}-error`, '');
    invalidate(); render();
  });
  form.querySelectorAll('[name=deliveryMethod]').forEach(input => input.addEventListener('change', () => { state.method = input.value; invalidate(); render(); }));
  byId('xmas-consent').addEventListener('change', event => { state.consent = event.target.checked; render(); });
  byId('xmas-next').addEventListener('click', advance);
  byId('xmas-sticky-next').addEventListener('click', advance);
  document.querySelectorAll('[data-step-link], [data-edit-step]').forEach(button => button.addEventListener('click', () => goStep(Number(button.dataset.stepLink || button.dataset.editStep))));
  byId('xmas-back').addEventListener('click', () => {
    if (history.state?.previousStep === state.step - 1) history.back();
    else goStep(state.step - 1);
  });
  function selectionText() {
    const { items, total } = selection();
    return `NOTHINGMATTERS 크리스마스 2026\n${items.map(item => `${products.get(item.sku).name} × ${item.quantity} = ${won(products.get(item.sku).price * item.quantity)}`).join('\n')}\n상품 합계 ${won(total)}\n예약 픽업 기본 · 차량 퀵 비용과 일정은 상담 후 확인`;
  }
  byId('xmas-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(selectionText());
      byId('xmas-copy-status').textContent = '상품 구성을 복사했어요. 카카오톡 상담창에 붙여넣어 주세요.';
    } catch {
      byId('xmas-copy-status').textContent = '아래 상품 구성을 선택해 직접 복사해 주세요.';
      let fallback = byId('xmas-copy-fallback');
      if (!fallback) {
        fallback = document.createElement('textarea');
        fallback.id = 'xmas-copy-fallback'; fallback.className = 'xmas-copy-fallback'; fallback.readOnly = true;
        fallback.setAttribute('aria-label', '복사할 상품 구성'); byId('xmas-copy-status').after(fallback);
      }
      fallback.value = selectionText(); fallback.focus(); fallback.select();
    }
  });
  function galleryImages(product) {
    return [product, ...(product.gallery || [])];
  }
  function renderGallery() {
    const { sku, index } = state.gallery;
    const product = products.get(sku), images = galleryImages(product), photo = images[index];
    const image = byId('xmas-gallery-image');
    const loading = byId('xmas-gallery-loading');
    loading.textContent = '사진을 불러오는 중…'; loading.hidden = false;
    image.onload = () => { loading.hidden = true; };
    image.onerror = () => { loading.textContent = '사진을 불러오지 못했어요. 다른 사진을 선택해 주세요.'; };
    byId('xmas-gallery-title').textContent = product.name;
    byId('xmas-gallery-count').textContent = `사진 ${index + 1} / ${images.length}`;
    byId('xmas-gallery-caption').textContent = photo.caption;
    image.width = photo.width; image.height = photo.height; image.alt = photo.alt; image.src = photo.image;
    if (image.complete && image.naturalWidth > 0) loading.hidden = true;
    byId('xmas-gallery-thumbnails').querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
  }
  function openGallery(sku, opener, push = true) {
    const product = products.get(sku);
    if (!product) return;
    galleryOpener = opener || document.querySelector(`[data-gallery="${sku}"]`);
    galleryClosing = false;
    state.gallery = { sku, index: 0 };
    const thumbnails = byId('xmas-gallery-thumbnails'); thumbnails.replaceChildren();
    galleryImages(product).forEach((photo, index) => {
      const button = document.createElement('button'), image = document.createElement('img');
      button.type = 'button'; button.setAttribute('aria-label', `${index + 1}번째 사진 보기`);
      image.src = photo.image; image.alt = ''; image.width = photo.width; image.height = photo.height; image.decoding = 'async';
      button.append(image); button.addEventListener('click', () => { state.gallery.index = index; renderGallery(); });
      thumbnails.append(button);
    });
    renderGallery();
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('xmas-gallery-open');
    byId('xmas-gallery-close').focus();
    if (push) history.pushState(historyData(state.step, { nmChristmasGallery: sku }), '', `#photo-${sku}`);
  }
  function closeGallery() {
    if (galleryClosing) return;
    galleryClosing = true;
    if (history.state?.nmChristmasGallery) history.back();
    else dialog.close();
  }
  function nextPhoto(delta) {
    const images = galleryImages(products.get(state.gallery.sku));
    state.gallery.index = (state.gallery.index + delta + images.length) % images.length;
    renderGallery();
  }
  document.querySelectorAll('[data-gallery]').forEach(button => button.addEventListener('click', () => openGallery(button.dataset.gallery, button)));
  byId('xmas-gallery-close').addEventListener('click', closeGallery);
  byId('xmas-gallery-prev').addEventListener('click', () => nextPhoto(-1));
  byId('xmas-gallery-next').addEventListener('click', () => nextPhoto(1));
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeGallery(); });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    galleryClosing = false; state.gallery = null;
    document.body.classList.remove('xmas-gallery-open'); galleryOpener?.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) closeGallery(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); nextPhoto(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  history.replaceState(historyData(1), '');
  window.addEventListener('popstate', event => {
    if (state.busy || locked()) { history.replaceState(historyData(state.step), '', `#step-${state.step}`); return; }
    const galleryWasOpen = dialog.open;
    if (event.state?.nmChristmasGallery) {
      goStep(event.state.nmChristmasStep || 1, { mode: 'none', focus: false });
      openGallery(event.state.nmChristmasGallery, null, false);
    } else {
      if (dialog.open) dialog.close();
      const requested = event.state?.nmChristmasStep || 1;
      goStep(requested, { mode: 'none', focus: !galleryWasOpen });
      if (state.step !== requested) history.replaceState(historyData(state.step), '', `#step-${state.step}`);
    }
  });
  // Capability and server gate stay closed until Railway supports all four SKUs.
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (state.step !== 3) { advance(); return; }
    if (!state.enabled || state.busy || locked() || !selectionValid() || !state.consent || !validateCustomer()) return;
    const { items, total } = selection();
    state.idempotencyKey ||= crypto.randomUUID();
    const payload = { source: 'christmas', catalogVersion: catalog.version, items, ...customer(), privacyConsent: true, idempotencyKey: state.idempotencyKey };
    state.busy = true; error('xmas-submit-error', ''); render();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/landing-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (result?.code === 'CHRISTMAS_ORDERS_UNAVAILABLE') { state.enabled = false; byId('xmas-availability').textContent = result.message; }
        else if (response.status >= 500) state.uncertain = true;
        throw new Error('주문 요청이 저장되지 않았어요. 입력 내용을 확인하거나 카카오톡으로 상담해 주세요.');
      }
      const matched = Array.isArray(result?.orderItems) && result.orderItems.length === items.length && items.every(item => result.orderItems.filter(line => line.sku === item.sku && line.quantity === item.quantity && line.price === products.get(item.sku).price).length === 1);
      if (result?.success !== true || typeof result.orderId !== 'string' || !result.orderId || result.totalPrice !== total || !matched) {
        state.uncertain = true;
        throw new Error('저장된 상품 구성과 금액을 확인하지 못했어요.');
      }
      state.saved = true;
      byId('xmas-success').textContent = '주문 요청 접수 · 선택한 상품 구성과 금액이 저장되었습니다. 카카오톡 상담으로 최종 주문을 확정해 주세요. 결제 완료나 제작 확정 상태는 아닙니다.';
      byId('xmas-success').hidden = false;
      byId('xmas-success').focus();
    } catch (errorValue) {
      if (errorValue.name === 'AbortError' || errorValue instanceof TypeError) state.uncertain = true;
      error('xmas-submit-error', state.uncertain ? '주문 저장 결과를 확인하지 못했어요. 다시 제출하지 말고 카카오톡으로 접수 여부를 확인해 주세요.' : errorValue.message);
    } finally { clearTimeout(timeout); state.busy = false; render(); }
  });
  async function loadStatus() {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch('/api/christmas-order-status', { cache: 'no-store', signal: controller.signal });
      const status = await response.json();
      state.enabled = response.ok && status.enabled === true && status.catalogVersion === catalog.version;
      if (state.enabled) byId('xmas-availability').textContent = '주문 요청을 저장한 뒤 카카오톡 상담으로 최종 주문을 확정합니다.';
    } catch { state.enabled = false; byId('xmas-availability').textContent = '온라인 접수 가능 여부를 확인하지 못했어요. 카카오톡으로 상담해 주세요.'; }
    finally { clearTimeout(timer); render(); }
  }
  function keyboardState() {
    const editing = document.activeElement?.matches('input:not([type=radio]):not([type=checkbox]), textarea');
    const keyboard = window.visualViewport && window.visualViewport.height < window.innerHeight * .75;
    document.body.classList.toggle('xmas-input-active', !!editing || !!keyboard);
  }
  document.addEventListener('focusin', keyboardState);
  document.addEventListener('focusout', () => setTimeout(keyboardState, 0));
  window.visualViewport?.addEventListener('resize', keyboardState);
  render(); loadStatus();
})();
