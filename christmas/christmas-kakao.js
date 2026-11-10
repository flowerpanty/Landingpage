(function () {
  function create(dialog) {
    const find = selector => dialog.querySelector(selector);
    const title = find('[data-kakao-title]');
    const hint = find('[data-kakao-hint]');
    const preview = find('[data-kakao-preview]');
    const manual = find('[data-kakao-manual]');
    const text = find('textarea');
    const retry = find('[data-kakao-retry]');
    const open = find('[data-kakao-open]');
    const feedback = find('[data-kakao-feedback]');
    let record, copying = false, opener;
    const won = value => `${Number(value).toLocaleString('ko-KR')}원`;
    function timeLabel(value) {
      const hour = Number(value.split(':')[0]);
      return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}시`;
    }
    async function writeClipboard() {
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(text.value); return; } catch (_) { /* Use the selectable text inside the modal. */ }
      }
      // An element appended outside an open modal is inert and cannot be selected.
      // Use the actual fallback box and verify its selection before claiming success.
      const focusBefore = document.activeElement;
      manual.hidden = false;
      text.focus({ preventScroll: true });
      text.select();
      if (document.activeElement !== text || text.selectionStart !== 0 || text.selectionEnd !== text.value.length || !document.execCommand('copy')) {
        throw new Error('Clipboard copy failed');
      }
      focusBefore?.focus({ preventScroll: true });
    }
    async function copy(again = false) {
      if (!record || copying) return;
      copying = true;
      retry.disabled = open.disabled = true;
      feedback.textContent = '';
      title.textContent = '주문 내용을 복사하고 있어요.';
      hint.textContent = '저장된 주문의 상담 내용을 준비하고 있어요. 잠시만 기다려 주세요.';
      manual.hidden = true;
      dialog.dataset.copyState = 'copying';
      try {
        await writeClipboard();
        title.textContent = '✅ 주문 내용이 복사됐어요!';
        hint.textContent = '카카오톡에서 붙여넣기만 해주세요.';
        retry.textContent = '주문 내용 다시 복사';
        manual.hidden = true;
        dialog.dataset.copyState = 'success';
        if (again) feedback.textContent = '✅ 다시 복사됐어요.';
      } catch (_) {
        title.textContent = '주문 내용을 자동으로 복사하지 못했어요.';
        hint.textContent = '아래 주문 내용을 길게 눌러 전체 선택한 뒤 직접 복사하거나 다시 복사해 주세요.';
        manual.hidden = false;
        retry.textContent = '다시 복사';
        dialog.dataset.copyState = 'failed';
      } finally {
        copying = false;
        retry.disabled = open.disabled = false;
      }
    }
    retry.addEventListener('click', () => copy(true));
    open.addEventListener('click', () => {
      if (record && !copying) window.NMQuote.navigateToKakao();
    });
    find('[data-kakao-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      document.body.classList.remove('xmas-kakao-open');
      opener?.focus({ preventScroll: true });
    });
    return {
      async present(saved) {
        // This UI has no save/email operation. Every action reuses this saved order.
        if (!saved?.result?.orderId || !saved.data || copying) return;
        record = saved;
        opener = document.activeElement;
        const data = record.data;
        const productLines = data.items.slice(0, 2).map(item => `${item.name} ${item.quantity}개 × ${won(item.unitPrice)}`);
        if (data.items.length > 2) productLines.push(`외 ${data.items.length - 2}종`);
        preview.textContent = ['크리스마스 브루키', ...productLines,
          `총 금액: ${won(data.totalPrice)}`, `수령일: ${data.deliveryDate}`,
          `수령시간: ${timeLabel(data.pickupTime)}`, `수령 방법: ${data.deliveryMethod === 'quick' ? '퀵 배송' : '매장 픽업'}`].join('\n');
        text.value = window.NMQuote.toText(data);
        if (!dialog.open) dialog.showModal();
        document.body.classList.add('xmas-kakao-open');
        dialog.scrollTop = 0;
        title.focus({ preventScroll: true });
        await copy();
      },
    };
  }
  window.NMChristmasKakao = { create };
})();
