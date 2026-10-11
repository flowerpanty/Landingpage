(function () {
  const quoteNotice = '※ 본 견적은 주문 접수용이며 카카오톡 상담 완료 후 주문이 최종 확정됩니다.';
  const consultNotice = '※ 가격 및 최종 주문 내용은 카카오톡 상담 후 확정됩니다.';
  const ctaLabel = (pending) => `${pending ? '상담 요청서' : '견적서'} 받고 카카오톡에서 주문 확정하기 →`;
  function warningMarkup(pending = false) {
    return `<aside class="order-confirm-warning" aria-label="주문 확정 안내">
      <h3 class="order-confirm-warning-title">⚠️ 주문 전 꼭 확인해 주세요</h3>
      <p>현재 단계는 주문 접수 단계입니다.</p>
      <p>견적서를 받은 후 카카오톡 상담에서 수량, 수령 일정, 배송 방법 등 최종 내용을 확인해야 주문이 확정됩니다.</p>
      ${pending ? '<p>가격과 최종 주문 금액은 카카오톡 상담 후 확정됩니다.</p>' : ''}
      <p class="order-confirm-warning-critical">카카오톡 상담을 완료하지 않으면 주문이 최종 완료되지 않습니다.</p>
    </aside>`;
  }
  function statusMarkup(id) {
    return `<section id="${id}" class="order-confirm-status" aria-label="저장 후 상담 안내" hidden>
      <div role="status" aria-live="polite"><h3 data-confirm-saved></h3>
        <p>이어서 카카오톡에서 주문 상담을 완료해 주세요.</p>
        <p class="order-confirm-warning-critical">카카오톡 상담을 완료해야 주문이 최종 확정됩니다.</p>
        <p data-confirm-moving hidden>카카오톡 상담으로 이동 중입니다.</p>
      </div>
      <button type="button" class="order-confirm-kakao" data-confirm-kakao>카카오톡에서 주문 확정하기 →</button>
      <a class="order-confirm-other" href="/order">다른 상품 보기</a>
    </section>`;
  }
  function showSaved(container, pending = false) {
    container.hidden = false;
    container.querySelector('[data-confirm-saved]').textContent = pending ? '✅ 상담 요청서가 저장되었습니다.' : '✅ 견적서가 저장되었습니다.';
    container.querySelector('[data-confirm-moving]').hidden = true;
  }
  function navigate(container) {
    container.querySelector('[data-confirm-moving]').hidden = false;
    window.NMQuote.navigateToKakao();
  }
  function safeTrack(event, params) {
    try { window.NMOrderCore?.track(event, params); } catch (_) { /* Analytics never blocks an order. */ }
  }

  // Retain the original Lucky/cookie7 canvas and pricing functions. Only the
  // save/share/consultation coordination is shared with the new order pages.
  function createLegacyFlow(options) {
    const container = document.getElementById('orderConfirmationStatus');
    const errorNode = document.getElementById('orderConfirmationError');
    const email = window.NMEmailQuote;
    container.insertAdjacentHTML('beforebegin', email.markup());
    const flow = email.create({
      postEmail: email.postEmail,
      onEmail: email.status('orderEmailStatus'),
      fileSlug: options.fileSlug,
      createImage: () => options.createImage(),
      postOrder: (payload) => window.NMOrderCore.postLandingOrder(payload),
      fromSaved: (result, draft) => {
        if (result.totalPrice !== draft.totalPrice || result.pricingPending) throw new Error('저장된 견적 금액을 확인할 수 없습니다. 페이지를 새로고침해 주세요.');
        return draft;
      },
      provideImage: (...args) => window.NMQuote.provideImage(...args),
      navigateToKakao: () => navigate(container),
      track: (event, params) => safeTrack(event, { product: options.source, ...params }),
      onSaved: (record) => {
        options.state.orderId = record.result.orderId;
        options.state.submitted = true;
        showSaved(container);
      },
    });
    email.bindRetry('orderEmailStatus', flow, options.getPayload);
    document.addEventListener('click', (event) => {
      if (options.state.submitting && event.target.closest('a')) event.preventDefault();
    }, true);
    return {
      refresh() {
        const record = flow.getSaved(options.getPayload());
        if (record?.data) showSaved(container);
        else container.hidden = true;
        errorNode.hidden = true;
      },
      async receive(directConsult = false) {
        if (options.state.submitting || !options.validate()) return;
        const payload = options.getPayload();
        const draft = { documentTitle: 'nothingmatters 견적서', totalPrice: options.getTotal(), pricingPending: false, customerEmail: payload.customerEmail || '' };
        options.state.submitting = true;
        const controls = Array.from(document.querySelectorAll('button, input, select, textarea')).map((node) => [node, node.disabled]);
        controls.forEach(([node]) => { node.disabled = true; });
        const label = document.getElementById('quoteButton').textContent;
        document.getElementById('quoteButton').textContent = '처리 중...';
        errorNode.hidden = true;
        try {
          await flow.receive(payload, draft, directConsult);
        } catch (error) {
          errorNode.textContent = error.message || '주문 저장에 실패했어요. 다시 시도해 주세요.';
          errorNode.hidden = false;
          container.querySelector('[data-confirm-moving]').hidden = true;
          options.onError(errorNode.textContent);
          errorNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } finally {
          options.state.submitting = false;
          controls.forEach(([node, disabled]) => { node.disabled = disabled; });
          document.getElementById('quoteButton').textContent = label;
        }
      },
    };
  }
  window.NMOrderConfirmation = { ctaLabel, warningMarkup, statusMarkup, showSaved, navigate, safeTrack, createLegacyFlow, quoteNotice, consultNotice };
})();
