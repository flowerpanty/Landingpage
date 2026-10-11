(function () {
  // Email is an optional side effect of an already saved order. A failure must
  // never discard that save or prevent the PNG/consultation flow.
  function create(options) {
    let sending = false;
    async function sendEmail(record) {
      if (!record.data.customerEmail || record.emailSent || sending) return;
      sending = true;
      options.onEmail('sending');
      try {
        const result = await options.postEmail(record.result.orderId, record.data.customerEmail, record.result.emailQuoteToken);
        record.emailSent = true;
        record.maskedEmail = result.maskedEmail;
        options.onEmail('sent', result.maskedEmail);
      } catch (error) {
        options.onEmail('failed', '', error.userMessage || '');
      } finally { sending = false; }
    }
    const flow = window.NMQuote.createFlow({ ...options, beforeProvide: sendEmail });
    return {
      receive: (...args) => flow.receive(...args),
      getSaved: (payload) => flow.getSaved(payload),
      async retryEmail(payload) {
        const record = flow.getSaved(payload);
        if (record?.data) await sendEmail(record);
      },
    };
  }
  async function postEmail(id, email, token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}/email-quote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ email }), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('이메일 문서를 보내지 못했습니다.');
      return result;
    } finally { clearTimeout(timeout); }
  }
  function markup(id = 'orderEmailStatus') {
    return `<section id="${id}" class="order-email-status" hidden><p data-email-message role="status" aria-live="polite"></p><button type="button" data-email-retry hidden>이메일 다시 보내기</button></section>`;
  }
  function status(id, pending = false) {
    return (state, masked = '') => {
      const node = document.getElementById(id);
      node.hidden = false;
      node.classList.toggle('is-error', state === 'failed');
      node.querySelector('[data-email-message]').textContent = state === 'sent'
        ? `✅ ${pending ? '상담 요청서' : '견적서'}를 이메일로 보냈어요. ${masked}`
        : state === 'sending' ? '저장된 주문의 문서를 이메일로 보내는 중입니다.'
        : '주문 요청은 저장됐지만 이메일 견적을 보내지 못했어요.';
      const button = node.querySelector('[data-email-retry]');
      button.hidden = state !== 'failed';
      button.disabled = state === 'sending';
    };
  }
  function bindRetry(id, flow, getPayload) {
    const button = document.getElementById(id).querySelector('[data-email-retry]');
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await flow.retryEmail(getPayload()); } finally { button.disabled = false; }
    });
  }
  window.NMEmailQuote = { create, postEmail, markup, status, bindRetry };
})();
