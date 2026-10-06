(function () {
  const root = document.getElementById('nm-order-flow');
  const core = window.NMOrderCore;
  const quote = window.NMQuote;
  const confirmation = window.NMOrderConfirmation;
  if (!root || !core || !quote || !confirmation) return;

  const products = {
    cookieFlight: {
      name: '쿠키 플라이트', unit: 'BOX', unitPrice: 16000,
      image: '/order/assets/public/cookie-flight-assets/cookie-flight-hero.webp',
      imageAlt: '쿠키 플라이트 4개입 선물 박스',
      tagline: '클래식버터 · 더블초코 · 제주말차 · 오렌지',
      description: '4가지 맛을 담은 4개입 선물 박스',
      facts: [['CLASSIC', '클래식버터'], ['CHOCO', '더블초코'], ['MATCHA', '제주말차'], ['ORANGE', '오렌지']],
      note: '4가지 맛이 1 BOX의 기본 구성입니다. 맛은 선택 옵션이 아닙니다.',
      quoteFileSlug: 'cookie-flight',
      quoteOptions: { unitLabel: 'BOX', packageName: '4개입 1세트', flavors: ['클래식버터', '더블초코', '제주말차', '오렌지'] },
    },
    airplaneButter: {
      name: '비행기 버터쿠키', unit: '개', unitPrice: 2500,
      image: '/order/assets/public/airplane-cookie-assets/hero.webp',
      imageAlt: '개별 포장된 비행기 버터쿠키',
      tagline: '비행기 모양 버터쿠키 · 단품 · 개별포장',
      description: '가볍게 건네기 좋은 비행기 모양 버터쿠키',
      facts: [['PRODUCT', '비행기 버터쿠키'], ['TYPE', '단품 · 개별포장'], ['PRICE', '1개 2,500원']],
      note: '1개씩 개별 포장해 준비합니다.',
      quoteFileSlug: 'airplane-butter-cookie',
      quoteOptions: { unitLabel: '개', individuallyWrapped: true },
    },
    cookieCrew: {
      name: '쿠키크루', unit: '개', pricingPending: true, minimumQuantity: 12,
      image: '/order/assets/public/cookie-crew-assets/cookie-crew-hero-main.webp',
      imageAlt: '쿠키크루 캐릭터 쿠키',
      tagline: '마음에 드는 쿠키크루를 종류별로 골라주세요.',
      description: '쿠키 4종을 원하는 수량만큼 선택할 수 있어요. 종류 합계 최소 12개부터 주문 가능합니다.',
      note: '마그넷은 현재 주문 항목에 포함되지 않습니다.',
      quoteFileSlug: 'cookie-crew',
      crew: [
        ['captain', '쿠키기장', '/order/assets/public/cookie-crew-assets/cookie-crew-pilot-hero.webp'],
        ['blue', '쿠키블루', '/order/assets/public/cookie-crew-assets/cookie-crew-color-crew-02.webp'],
        ['orange', '쿠키오렌지', '/order/assets/public/cookie-crew-assets/cookie-crew-color-crew-01.webp'],
        ['green', '쿠키그린', '/order/assets/public/cookie-crew-assets/cookie-crew-color-crew-03.webp'],
      ],
    },
    terminalCookie: {
      name: '터미널쿠키', unit: '', unitPrice: 24000,
      image: '/order/assets/public/terminal-cookie-assets/terminal-hero-package.webp',
      imageAlt: 'TERMINAL 카라멜 샌드쿠키 선물 패키지',
      tagline: '천천히 끓인 카라멜을 샌드한 여섯 가지 맛',
      description: '맛 구성은 고정입니다. 주문 수량만 선택해 주세요.',
      facts: [['FLAVORS', '6가지 맛 고정'], ['PACKAGE', '선물 패키지'], ['PRICE', '24,000원']],
      note: '피스타치오 · 패션프루츠코코넛 · 제주말차레몬 · 흑임자 · 커피 밀크 초콜릿 · 무화과피칸',
      quoteName: 'TERMINAL 카라멜 샌드쿠키',
      quoteFileSlug: 'terminal-cookie',
      quoteOptions: { unitLabel: '', flavors: ['피스타치오', '패션프루츠코코넛', '제주말차레몬', '흑임자', '커피 밀크 초콜릿', '무화과피칸'] },
    },
  };
  const source = root.dataset.source;
  const product = products[source];
  if (!product) return;

  const state = {
    step: 1,
    quantity: 1,
    crewQuantities: { captain: 0, blue: 0, orange: 0, green: 0 },
    submitting: false,
    submitted: false,
    orderId: null,
    savedQuotes: new Map(),
  };
  const byId = (id) => document.getElementById(id);
  const won = (value) => `${value.toLocaleString('ko-KR')}원`;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stepNames = ['상품 선택', '주문 정보', '견적서'];
  const submitLabel = confirmation.ctaLabel(product.pricingPending);
  const track = (event, params) => { try { core.track(event, { product: source, ...params }); } catch (_) { /* Analytics is optional. */ } };
  const counter = (key, label, count) => `
    <div class="nm-order-counter" role="group" aria-label="${label} 수량">
      <button type="button" data-delta="-1" ${key ? `data-crew="${key}"` : ''} aria-label="${label} ${product.unit === '' ? '수량' : '한 개'} 줄이기">−</button>
      <output ${key ? `data-crew-count="${key}"` : 'id="nm-order-count"'} aria-live="polite">${count}</output>
      <button type="button" data-delta="1" ${key ? `data-crew="${key}"` : ''} aria-label="${label} ${product.unit === '' ? '수량' : '한 개'} 늘리기">+</button>
    </div>`;
  const controls = product.crew
    ? `<div class="nm-order-crew-list">${product.crew.map(([key, label, image]) => `
        <div class="nm-order-quantity nm-order-crew-row">
          <img src="${image}" alt="${label}" width="76" height="76" loading="lazy" decoding="async">
          <strong class="nm-order-quantity-name">${label}</strong>
          ${counter(key, label, 0)}
        </div>`).join('')}</div>`
    : `<div class="nm-order-quantity nm-order-main-quantity">
        <strong class="nm-order-quantity-name">${product.name}</strong>
        ${counter('', product.name, 1)}
      </div>`;
  const facts = product.facts
    ? `<div class="nm-order-facts">${product.facts.map(([tag, value]) => `<div><small>${tag}</small><strong>${value}</strong></div>`).join('')}</div>`
    : '';

  root.innerHTML = `
    <header class="nm-order-header">
      <div class="nm-order-header-inner">
        <a class="nm-order-brand" href="/order">NOTHINGMATTERS.</a>
        <a class="nm-order-back" href="/order">← 다른 상품 보기</a>
        <nav class="nm-order-steps" aria-label="주문 단계">
          ${stepNames.map((name, index) => `<button type="button" data-step-link="${index + 1}" aria-label="${index + 1}단계 ${name}"><span>${index + 1}</span>${name}</button>`).join('')}
        </nav>
        <div class="nm-order-mobile-progress" aria-live="polite">
          <div><span id="nm-mobile-count">1 / 3</span><strong id="nm-mobile-title">상품 선택</strong></div>
          <div class="nm-order-track"><span id="nm-mobile-bar"></span></div>
        </div>
      </div>
    </header>
    <main class="nm-order-main">
      <section class="nm-order-page" data-order-step="1" aria-labelledby="nm-step-one-title">
        <div class="nm-order-hero"><img src="${product.image}" alt="${product.imageAlt}" fetchpriority="high" decoding="async"></div>
        <div class="nm-order-page-head"><p>STEP 01 · 상품 선택</p><h1 id="nm-step-one-title">${product.name}</h1><p>${product.tagline}</p><p>${product.description}</p></div>
        ${facts}
        <article class="nm-order-card">
          <h2>${product.crew ? '쿠키크루 종류별 수량' : product.unit === '' ? '주문 수량' : '몇 개 준비할까요?'}</h2>
          ${product.crew ? '<p id="nm-order-minimum" class="nm-order-minimum" role="status" aria-live="polite"></p>' : ''}
          ${controls}
          <p class="nm-order-hint">${product.note}</p>
          <p id="nm-order-selection-error" class="nm-order-alert" role="alert" hidden></p>
        </article>
        <article class="nm-order-card nm-order-selection-card">
          <h2>현재 선택</h2>
          <div id="nm-order-selected-lines" class="nm-order-selected-lines" aria-live="polite"></div>
          <dl class="nm-order-price-list">
            <dt>선택 수량</dt><dd id="nm-order-selected-quantity"></dd>
            ${product.pricingPending ? '' : `<dt>${product.unit === 'BOX' ? '1 BOX 가격' : product.unit === '' ? '단가' : '1개 가격'}</dt><dd>${won(product.unitPrice)}</dd>`}
            <dt>${product.pricingPending ? '가격' : '예상 총액'}</dt><dd class="nm-order-highlight" id="nm-order-selection-total"></dd>
          </dl>
          <button class="nm-order-primary" type="button" data-next>주문 정보 입력하기 →</button>
        </article>
      </section>
      <section class="nm-order-page" data-order-step="2" aria-labelledby="nm-step-two-title" hidden>
        <div class="nm-order-page-head"><p>STEP 02 · 주문 정보</p><h1 id="nm-step-two-title">주문 정보를 알려주세요</h1></div>
        <div class="nm-order-mini-summary"><img src="${product.image}" alt="" width="84" height="84"><div><strong>${product.name}</strong><span id="nm-order-mini-detail"></span></div></div>
        <div class="nm-order-card">
          <h2>주문자 정보</h2>
          <div class="nm-order-fields">
            <label><span>고객명 <b>*</b></span><input id="nm-customerName" type="text" autocomplete="name" placeholder="성함" /><small class="fieldError" id="nm-customerNameError" hidden></small></label>
            <label><span>핸드폰 <b>*</b></span><input id="nm-customerPhone" type="tel" autocomplete="tel" inputmode="tel" placeholder="010-0000-0000" /><small class="fieldError" id="nm-customerPhoneError" hidden></small></label>
            <label class="nm-order-full"><span>이메일 (선택)</span><input id="nm-customerEmail" type="email" autocomplete="email" placeholder="example@email.com" /><small class="fieldError" id="nm-customerEmailError" hidden></small></label>
          </div>
        </div>
        <div class="nm-order-card">
          <h2>수령 정보</h2>
          <div class="nm-order-fields">
            <label><span>수령 희망일 <b>*</b></span><input id="nm-deliveryDate" type="date" /><small class="fieldError" id="nm-deliveryDateError" hidden></small></label>
            <label><span>희망 시간 <b>*</b></span><select id="nm-pickupTime"><option value="">시간 선택</option></select><small class="fieldError" id="nm-pickupTimeError" hidden></small></label>
          </div>
          <p class="nm-order-field-label">수령 방식</p>
          <div class="nm-order-methods" role="group" aria-label="수령 방식">
            <button type="button" data-method="pickup" aria-pressed="true">매장 픽업<small>공항동 송정로 25</small></button>
            <button type="button" data-method="quick" aria-pressed="false">퀵 배송<small>지역 상담 필요</small></button>
          </div>
          <input id="nm-deliveryMethod" type="hidden" value="pickup">
          <label id="nm-address-row" class="nm-order-address" hidden><span>퀵 배송 주소 <b>*</b></span><input id="nm-deliveryAddress" type="text" autocomplete="street-address" placeholder="주소를 입력해 주세요" /><small class="fieldError" id="nm-deliveryAddressError" hidden></small></label>
        </div>
        <div class="nm-order-card"><label class="nm-order-request"><span>요청사항 (선택)</span><textarea id="nm-request" rows="3" placeholder="필요한 내용을 적어주세요"></textarea></label></div>
        <div class="nm-order-actions"><button type="button" class="nm-order-secondary" data-prev>← 이전</button><button type="button" class="nm-order-primary" data-next>${product.pricingPending ? '상담 요청서 확인하기' : '견적서 확인하기'} →</button></div>
      </section>
      <section class="nm-order-page" data-order-step="3" aria-labelledby="nm-step-three-title" hidden>
        <div class="nm-order-page-head"><p>STEP 03 · 견적서</p><h1 id="nm-step-three-title">${product.pricingPending ? '상담 요청서를 확인해 주세요' : '견적서를 확인해 주세요'}</h1></div>
        <div class="nm-order-card nm-order-quote-card"><h2>${product.pricingPending ? '상담 요청서 미리보기' : '견적서 미리보기'}</h2><div id="nm-order-quote-preview"></div></div>
        ${confirmation.warningMarkup(product.pricingPending)}
        <p class="nm-order-hint">${product.pricingPending ? '상담 요청서를 받으면 주문을 저장하고 이미지 공유 또는 다운로드 후 카카오톡 상담으로 이어집니다.' : '견적서를 받으면 주문을 저장하고 이미지 공유 또는 다운로드 후 카카오톡 상담으로 이어집니다.'}</p>
        <p id="nm-order-quote-status" class="nm-order-quote-status" role="status" aria-live="polite" hidden></p>
        <p id="nm-order-submit-error" class="nm-order-alert" role="alert" hidden></p>
        <p class="order-confirm-note">카카오톡 상담 완료 후 주문이 최종 확정됩니다.</p>
        <div class="nm-order-actions"><button type="button" class="nm-order-secondary" data-prev>← 이전</button><button type="button" class="nm-order-primary order-confirm-cta" id="nm-order-submit">${submitLabel}</button></div>
        <div class="nm-order-quote-tools"><button type="button" class="nm-order-secondary" id="nm-order-copy">선택 내용 복사</button><button type="button" class="nm-order-kakao" id="nm-order-kakao">카카오톡 상담하기</button></div>
        ${confirmation.statusMarkup('nm-order-confirmation-status')}
      </section>
    </main>
    <div class="nm-order-floating" id="nm-order-floating" aria-label="선택 요약">
      <div class="nm-order-floating-progress"><span id="nm-floating-progress"></span></div>
      <div class="nm-order-floating-inner">
        <button type="button" class="nm-order-floating-back" id="nm-floating-back">← 뒤로</button>
        <div class="nm-order-floating-copy"><small id="nm-floating-label">상품 선택</small><strong>${product.name}</strong><span id="nm-floating-detail"></span></div>
        <button type="button" class="nm-order-floating-next" id="nm-floating-next">다음 →</button>
      </div>
    </div>`;

  const dateInput = byId('nm-deliveryDate');
  dateInput.min = core.getMinDeliveryDate();
  const timeSelect = byId('nm-pickupTime');
  core.operatingSettings.pickupTimeOptions.forEach((time) => {
    const option = document.createElement('option');
    option.value = time;
    option.textContent = time;
    timeSelect.append(option);
  });

  function selectedQuantity() {
    return product.crew ? Object.values(state.crewQuantities).reduce((sum, quantity) => sum + quantity, 0) : state.quantity;
  }
  function selectedLines() {
    return product.crew
      ? product.crew.filter(([key]) => state.crewQuantities[key] > 0).map(([key, name]) => `${name} ${state.crewQuantities[key]}개`)
      : [];
  }
  function priceText() {
    return product.pricingPending ? '가격 상담 필요' : won(selectedQuantity() * product.unitPrice);
  }
  function quantityText() {
    if (product.unit === '') return `수량 ${selectedQuantity()}`;
    return product.unit === 'BOX' ? `${selectedQuantity()} BOX` : `${selectedQuantity()}개`;
  }
  function showMessage(id, message) {
    const node = byId(id);
    node.textContent = message;
    node.hidden = !message;
  }
  function renderSelection() {
    if (product.crew) {
      product.crew.forEach(([key]) => {
        root.querySelector(`[data-crew-count="${key}"]`).textContent = state.crewQuantities[key];
      });
      const remaining = Math.max(0, product.minimumQuantity - selectedQuantity());
      const minimum = byId('nm-order-minimum');
      minimum.textContent = remaining
        ? `최소 주문 12개 · 현재 ${selectedQuantity()}개 선택 · ${remaining}개 더 선택해 주세요.`
        : `최소 주문 12개 충족 · 현재 ${selectedQuantity()}개 선택`;
      minimum.classList.toggle('is-met', remaining === 0);
    } else byId('nm-order-count').textContent = state.quantity;
    const lines = byId('nm-order-selected-lines');
    lines.replaceChildren();
    selectedLines().forEach((value) => {
      const line = document.createElement('span');
      line.textContent = value;
      lines.append(line);
    });
    lines.hidden = !selectedLines().length;
    byId('nm-order-selected-quantity').textContent = quantityText();
    byId('nm-order-selection-total').textContent = product.pricingPending ? '가격 상담 후 안내' : priceText();
    byId('nm-order-mini-detail').textContent = `${product.crew ? '총 ' : ''}${quantityText()} · ${priceText()}`;
    byId('nm-floating-detail').textContent = `${product.crew ? '총 ' : ''}${quantityText()} · ${product.pricingPending ? '가격 상담' : priceText()}`;
    showMessage('nm-order-selection-error', '');
  }
  function validateSelection() {
    if (!product.crew || selectedQuantity() >= product.minimumQuantity) return true;
    showMessage('nm-order-selection-error', `쿠키크루는 종류 합계 최소 12개부터 주문할 수 있어요. ${product.minimumQuantity - selectedQuantity()}개 더 선택해 주세요.`);
    if (state.step !== 1) setStep(1, { skipValidation: true });
    root.querySelector('[data-crew="captain"][data-delta="1"]').focus();
    return false;
  }
  function validateDetails() {
    ['nm-customerName', 'nm-customerPhone', 'nm-customerEmail', 'nm-deliveryDate', 'nm-pickupTime', 'nm-deliveryAddress'].forEach(core.clearFieldError);
    const fields = [
      ['nm-customerName', !byId('nm-customerName').value.trim(), '이름을 입력해 주세요.'],
      ['nm-customerPhone', !core.validateKoreanPhone(byId('nm-customerPhone').value), '010 형식의 핸드폰 번호를 입력해 주세요.'],
      ['nm-customerEmail', !!byId('nm-customerEmail').value && !byId('nm-customerEmail').checkValidity(), '이메일 주소를 확인해 주세요.'],
      ['nm-deliveryDate', !dateInput.value || dateInput.value < dateInput.min || core.isUnavailableDeliveryDate(dateInput.value), '가능한 수령 희망일을 선택해 주세요.'],
      ['nm-pickupTime', !timeSelect.value, '희망 시간을 선택해 주세요.'],
      ['nm-deliveryAddress', byId('nm-deliveryMethod').value === 'quick' && !byId('nm-deliveryAddress').value.trim(), '퀵 배송 주소를 입력해 주세요.'],
    ];
    const first = fields.find(([, invalid]) => invalid);
    if (!first) return true;
    if (state.step !== 2) setStep(2, { skipValidation: true });
    core.setFieldError(first[0], first[2]);
    core.focusField(first[0]);
    return false;
  }
  function customerValues() {
    return {
      customerName: byId('nm-customerName').value.trim(),
      customerPhone: byId('nm-customerPhone').value.trim(),
      customerEmail: byId('nm-customerEmail').value.trim(),
      deliveryDate: dateInput.value,
      deliveryMethod: byId('nm-deliveryMethod').value,
      pickupTime: timeSelect.value,
      deliveryAddress: byId('nm-deliveryMethod').value === 'quick' ? byId('nm-deliveryAddress').value.trim() : '',
      request: byId('nm-request').value.trim(),
    };
  }
  function orderPayload() {
    return {
      source,
      ...customerValues(),
      ...(product.crew ? { crewQuantities: { ...state.crewQuantities }, pricingPending: true } : { quantity: state.quantity }),
    };
  }
  function quoteDataFromItems(items, customer, pricingPending, totalPrice) {
    const details = items.flatMap((item) => {
      const options = item.options || {};
      return [
        options.packageName ? `${item.name} · ${options.packageName}` : '',
        Array.isArray(options.flavors) ? `${item.name} · 맛 구성: ${options.flavors.join(' / ')}` : '',
        options.individuallyWrapped ? `${item.name} · 개별 포장` : '',
      ].filter(Boolean);
    });
    return {
      ...customer,
      documentTitle: pricingPending ? 'nothingmatters 주문 상담 요청서' : 'nothingmatters 견적서',
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitLabel: item.options?.unitLabel ?? '개',
        ...(pricingPending ? { priceText: '상담 후 안내' } : { unitPrice: item.price, amount: item.quantity * item.price }),
      })),
      details,
      totalPrice: pricingPending ? null : totalPrice,
      pricingPending,
    };
  }
  function draftQuoteData() {
    const items = product.crew
      ? product.crew.filter(([key]) => state.crewQuantities[key] > 0).map(([key, name]) => ({ name, quantity: state.crewQuantities[key], price: 0, options: { unitLabel: '개' } }))
      : [{ name: product.quoteName || product.name, quantity: state.quantity, price: product.unitPrice, options: product.quoteOptions }];
    return quoteDataFromItems(items, customerValues(), !!product.pricingPending, product.pricingPending ? 0 : selectedQuantity() * product.unitPrice);
  }
  function fromSaved(result, draft) {
    if (!Array.isArray(result.orderItems)) {
      if (result.totalPrice !== (draft.totalPrice ?? 0) || !!result.pricingPending !== draft.pricingPending) {
        throw new Error('저장된 견적 금액을 확인할 수 없습니다. 페이지를 새로고침해 주세요.');
      }
      return draft;
    }
    const items = result.orderItems.filter((item) => item?.type !== 'meta' && item?.options?.landingSource === source);
    if (!items.length || items.some((item) => typeof item.name !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.price) || item.price < 0)) {
      throw new Error('저장된 견적 항목을 확인할 수 없습니다.');
    }
    if (items.reduce((sum, item) => sum + item.quantity * item.price, 0) !== result.totalPrice) throw new Error('저장된 항목과 견적 금액이 일치하지 않습니다.');
    const customer = { ...draft };
    ['documentTitle', 'items', 'details', 'totalPrice', 'pricingPending'].forEach((key) => delete customer[key]);
    return quoteDataFromItems(items, customer, !!result.pricingPending, result.totalPrice);
  }
  function currentQuoteData() {
    return state.savedQuotes.get(JSON.stringify(orderPayload()))?.data || draftQuoteData();
  }
  function renderQuotation() {
    const data = currentQuoteData();
    quote.renderPreview(byId('nm-order-quote-preview'), data);
    const isSaved = state.savedQuotes.has(JSON.stringify(orderPayload()));
    showMessage('nm-order-quote-status', isSaved ? '주문 요청이 접수되었습니다. 같은 문서는 다시 받을 수 있어요.' : '');
    if (isSaved) confirmation.showSaved(byId('nm-order-confirmation-status'), product.pricingPending);
    else byId('nm-order-confirmation-status').hidden = true;
    track('quote_preview', { qty: selectedQuantity(), pricing_pending: data.pricingPending, total_price: data.totalPrice });
  }

  const quoteFlow = quote.createFlow({
    fileSlug: product.quoteFileSlug,
    createImage: (data) => quote.createImage(data),
    postOrder: (payload) => core.postLandingOrder(payload),
    provideImage: (...args) => quote.provideImage(...args),
    navigateToKakao: () => confirmation.navigate(byId('nm-order-confirmation-status')),
    fromSaved,
    track,
    onSaved: (record) => {
      state.orderId = record.result.orderId;
      state.submitted = true;
      state.savedQuotes.set(JSON.stringify(orderPayload()), record);
      quote.renderPreview(byId('nm-order-quote-preview'), record.data);
      showMessage('nm-order-quote-status', '주문 요청이 접수되었습니다. 같은 문서는 다시 받을 수 있어요.');
      confirmation.showSaved(byId('nm-order-confirmation-status'), product.pricingPending);
      byId('nm-floating-detail').textContent = `${quantityText()} · ${record.data.pricingPending ? '가격 상담' : won(record.data.totalPrice)}`;
    },
  });

  let pushStep = () => {};
  function setStep(next, options = {}) {
    if (state.submitting) return;
    const previous = state.step;
    const target = Math.max(1, Math.min(3, options.fromHistory ? next : Math.min(next, previous + 1)));
    if (!options.skipValidation && target > state.step) {
      if (state.step === 1 && !validateSelection()) return;
      if (state.step === 2 && !validateDetails()) return;
    }
    state.step = target;
    document.body.classList.toggle('order-confirm-quote-active', target === 3);
    byId('nm-floating-next').classList.toggle('order-confirm-cta', target === 3);
    if (target === 3) renderQuotation();
    root.querySelectorAll('[data-order-step]').forEach((page) => { page.hidden = Number(page.dataset.orderStep) !== target; });
    root.querySelectorAll('[data-step-link]').forEach((button) => {
      const step = Number(button.dataset.stepLink);
      button.classList.toggle('is-active', step === target);
      button.classList.toggle('is-done', step < target);
      if (step === target) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    byId('nm-mobile-count').textContent = `${target} / 3`;
    byId('nm-mobile-title').textContent = stepNames[target - 1];
    byId('nm-mobile-bar').style.width = `${target / 3 * 100}%`;
    byId('nm-floating-progress').style.width = `${target / 3 * 100}%`;
    byId('nm-floating-label').textContent = stepNames[target - 1];
    byId('nm-floating-back').hidden = target === 1;
    byId('nm-floating-next').textContent = target === 3 ? submitLabel : '다음 →';
    if (!options.fromHistory && target !== previous) pushStep(target);
    track('order_step_view', { step: target });
    if (options.scroll !== false) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  async function receiveQuote(directConsult = false) {
    if (state.submitting || !validateSelection() || !validateDetails()) return;
    state.submitting = true;
    const controls = Array.from(root.querySelectorAll('button, input, select, textarea'));
    controls.forEach((control) => { control.disabled = true; });
    byId('nm-order-submit').textContent = '처리 중...';
    byId('nm-floating-next').textContent = '처리 중...';
    showMessage('nm-order-submit-error', '');
    try {
      await quoteFlow.receive(orderPayload(), currentQuoteData(), directConsult);
    } catch (error) {
      showMessage('nm-order-submit-error', error.message || '견적서 처리에 실패했어요. 다시 시도해 주세요.');
      byId('nm-order-confirmation-status').querySelector('[data-confirm-moving]').hidden = true;
      byId('nm-order-submit-error').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    } finally {
      state.submitting = false;
      controls.forEach((control) => { control.disabled = false; });
      byId('nm-order-submit').textContent = submitLabel;
      byId('nm-floating-next').textContent = state.step === 3 ? submitLabel : '다음 →';
    }
  }
  async function copyOrder() {
    if (state.submitting || !validateSelection() || !validateDetails()) return;
    try {
      await quote.copyText(currentQuoteData());
      showMessage('nm-order-quote-status', '선택 내용이 복사됐어요.');
    } catch (error) { showMessage('nm-order-submit-error', error.message || '복사하지 못했어요. 다시 시도해 주세요.'); }
  }
  function nextStep() {
    if (state.step === 3) receiveQuote();
    else setStep(state.step + 1);
  }
  root.addEventListener('click', (event) => {
    if (state.submitting) { event.preventDefault(); return; }
    const qtyButton = event.target.closest('[data-delta]');
    if (qtyButton) {
      const delta = Number(qtyButton.dataset.delta);
      const crewType = qtyButton.dataset.crew;
      if (crewType) state.crewQuantities[crewType] = Math.min(10000, Math.max(0, state.crewQuantities[crewType] + delta));
      else state.quantity = Math.min(10000, Math.max(1, state.quantity + delta));
      renderSelection();
      track('option_select', { qty: selectedQuantity() });
      return;
    }
    const method = event.target.closest('[data-method]');
    if (method) {
      byId('nm-deliveryMethod').value = method.dataset.method;
      root.querySelectorAll('[data-method]').forEach((button) => button.setAttribute('aria-pressed', button === method ? 'true' : 'false'));
      byId('nm-address-row').hidden = method.dataset.method !== 'quick';
      if (method.dataset.method !== 'quick') core.clearFieldError('nm-deliveryAddress');
      return;
    }
    const stepLink = event.target.closest('[data-step-link]');
    if (stepLink) return setStep(Number(stepLink.dataset.stepLink));
    if (event.target.closest('[data-next]')) nextStep();
    if (event.target.closest('[data-prev]')) setStep(state.step - 1);
  });
  byId('nm-floating-back').addEventListener('click', () => setStep(state.step - 1));
  byId('nm-floating-next').addEventListener('click', nextStep);
  byId('nm-order-submit').addEventListener('click', () => receiveQuote());
  byId('nm-order-kakao').addEventListener('click', () => receiveQuote(true));
  byId('nm-order-copy').addEventListener('click', copyOrder);
  byId('nm-order-confirmation-status').querySelector('[data-confirm-kakao]').addEventListener('click', () => receiveQuote(true));
  renderSelection();
  pushStep = core.setupStepHistory({ getStep: () => state.step, setStep });
  if (state.step === 1) setStep(1, { fromHistory: true, skipValidation: true, scroll: false });
  track('order_start', {});
})();
