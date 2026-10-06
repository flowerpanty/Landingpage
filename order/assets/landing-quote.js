(function () {
  const kakaoUrl = 'https://pf.kakao.com/_QdCaK/chat';
  const account = '입금 계좌: 83050104204736 국민은행 (낫띵메터스)';
  const contact = '주문 문의: 카카오톡 @nothingmatters 또는 010-2866-7976';
  const consultationNotice = '가격 및 최종 주문 금액은 카카오톡 상담 후 안내됩니다.';
  const won = (value) => `${Number(value).toLocaleString('ko-KR')}원`;
  const quantityText = (item) => `${item.quantity}${item.unitLabel ? ` ${item.unitLabel}` : ''}`;
  const totalQuantity = (data) => data.items.reduce((sum, item) => sum + item.quantity, 0);

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function renderPreview(container, data) {
    container.replaceChildren();
    const paper = element('article', undefined, 'nm-quote-document');
    paper.append(element('h2', data.documentTitle, 'nm-quote-title'));
    const info = element('dl', undefined, 'nm-quote-info');
    const fields = [
      ['고객명', data.customerName], ['핸드폰', data.customerPhone],
      ...(data.customerEmail ? [['이메일', data.customerEmail]] : []),
      ['수령 방법', data.deliveryMethod === 'quick' ? '퀵 배송' : '매장 픽업'],
      ['수령 희망일', data.deliveryDate], ['시간', data.pickupTime],
      ...(data.deliveryAddress ? [['배송 주소', data.deliveryAddress]] : []),
    ];
    fields.forEach(([label, value]) => info.append(element('dt', label), element('dd', value)));
    paper.append(info);
    const table = element('table', undefined, 'nm-quote-table');
    table.append(element('caption', data.pricingPending ? '상담할 상품과 수량' : '주문 상품 견적'));
    const head = element('thead');
    const headings = element('tr');
    (data.pricingPending ? ['제품명', '수량'] : ['제품명', '수량', '단가', '합계']).forEach((label) => {
      const cell = element('th', label);
      cell.scope = 'col';
      headings.append(cell);
    });
    head.append(headings);
    table.append(head);
    const body = element('tbody');
    data.items.forEach((item) => {
      const row = element('tr');
      const values = [item.name, quantityText(item)];
      if (!data.pricingPending) values.push(won(item.unitPrice), won(item.amount));
      values.forEach((value) => row.append(element('td', value)));
      body.append(row);
    });
    table.append(body);
    paper.append(table);
    const total = element('div', undefined, 'nm-quote-total');
    total.append(element('span', data.pricingPending ? '총 수량' : '총 합계'), element('strong', data.pricingPending ? `${totalQuantity(data)}개` : won(data.totalPrice)));
    paper.append(total);
    if (data.pricingPending) paper.append(element('p', '가격: 상담 후 안내', 'nm-quote-consult-price'));
    if (data.details.length) {
      paper.append(element('h3', '주문 상세 옵션'));
      const details = element('ul', undefined, 'nm-quote-details');
      data.details.forEach((line) => details.append(element('li', line)));
      paper.append(details);
    }
    paper.append(element('h3', '요청사항'), element('p', data.request || '없음', 'nm-quote-request'));
    const footer = element('footer', undefined, 'nm-quote-footer');
    footer.append(element('p', data.pricingPending ? consultationNotice : account), element('p', contact));
    footer.append(element('p', data.pricingPending ? window.NMOrderConfirmation.consultNotice : window.NMOrderConfirmation.quoteNotice));
    paper.append(footer);
    container.append(paper);
  }

  function toText(data) {
    const lines = [data.documentTitle, `고객명: ${data.customerName}`, `연락처: ${data.customerPhone}`];
    if (data.customerEmail) lines.push(`이메일: ${data.customerEmail}`);
    lines.push(`수령 방법: ${data.deliveryMethod === 'quick' ? '퀵 배송' : '매장 픽업'}`, `희망 수령일: ${data.deliveryDate}`, `시간: ${data.pickupTime}`);
    if (data.deliveryAddress) lines.push(`배송 주소: ${data.deliveryAddress}`);
    data.items.forEach((item) => {
      lines.push('', `상품: ${item.name}`, `수량: ${quantityText(item)}`);
      if (!data.pricingPending) lines.push(`단가: ${won(item.unitPrice)}`, `금액: ${won(item.amount)}`);
    });
    lines.push('', ...(data.pricingPending ? [`총 수량: ${totalQuantity(data)}개`, '가격: 상담 후 안내'] : [`총 금액: ${won(data.totalPrice)}`]));
    if (data.details.length) lines.push('', '구성/옵션:', ...data.details);
    lines.push('', `요청사항: ${data.request || '없음'}`, '', '위 구성으로 주문 상담하고 싶어요.');
    return lines.join('\n');
  }

  async function copyText(data) {
    const text = toText(data);
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return; } catch (_) { /* Try the local fallback. */ }
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      if (!document.execCommand('copy')) throw new Error('선택 내용을 복사하지 못했어요. 다시 시도해 주세요.');
    } finally { area.remove(); }
  }

  async function createImage(data) {
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('견적서 이미지를 만들 수 없습니다.');
    const width = 1080;
    const inset = 20;
    const contentWidth = width - inset * 2;
    const commands = [];
    let y = inset;
    const font = (size, weight = 500) => `${weight} ${size}px 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif`;
    function wrap(text, maxWidth, size, weight) {
      ctx.font = font(size, weight);
      return String(text).split('\n').flatMap((paragraph) => {
        const lines = [];
        let line = '';
        for (const char of Array.from(paragraph)) {
          if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ''; }
          line += char;
        }
        lines.push(line);
        return lines;
      });
    }
    function row(values, widths, options = {}) {
      const size = options.size || 25;
      const weight = options.weight || 500;
      const lineHeight = size * 1.5;
      const cells = values.map((value, index) => wrap(value, widths[index] - 32, size, weight));
      const height = Math.max(options.minHeight || 66, ...cells.map((lines) => lines.length * lineHeight + 28));
      commands.push({ y, height, widths, cells, size, weight, lineHeight, ...options });
      y += height;
    }
    function block(text, options) { row([text], [contentWidth], options); }
    const purple = '#5548e8';
    block(data.documentTitle, { size: 36, weight: 700, fill: purple, color: '#fff', center: true, minHeight: 88 });
    block(`고객명: ${data.customerName} | 핸드폰: ${data.customerPhone}`);
    if (data.customerEmail) block(`이메일: ${data.customerEmail}`);
    block(`수령 방법: ${data.deliveryMethod === 'quick' ? '퀵 배송' : '매장 픽업'} | 수령 희망일: ${data.deliveryDate} | 시간: ${data.pickupTime}`);
    if (data.deliveryAddress) block(`배송 주소: ${data.deliveryAddress}`);
    y += 24;
    const columns = data.pricingPending ? [790, 250] : [430, 150, 230, 230];
    row(data.pricingPending ? ['제품명', '수량'] : ['제품명', '수량', '단가', '합계'], columns, { weight: 700, fill: '#f0f1f5' });
    data.items.forEach((item) => {
      const values = [item.name, quantityText(item)];
      if (!data.pricingPending) values.push(won(item.unitPrice), won(item.amount));
      row(values, columns);
    });
    row([data.pricingPending ? '총 수량' : '총 합계', data.pricingPending ? `${totalQuantity(data)}개` : won(data.totalPrice)], [660, 380], { fill: purple, color: '#fff', size: 30, weight: 700, minHeight: 84 });
    if (data.pricingPending) block('가격: 상담 후 안내', { size: 28, weight: 700, fill: '#f7f8fa' });
    if (data.details.length) {
      y += 24;
      block('주문 상세 옵션', { weight: 700, fill: '#f7f8fa' });
      data.details.forEach((line) => block(`• ${line}`, { size: 24 }));
    }
    y += 24;
    block(`요청사항: ${data.request || '없음'}`, { size: 24 });
    y += 24;
    block(data.pricingPending ? consultationNotice : account, { size: 26, weight: 700, fill: data.pricingPending ? '#f7f8fa' : '#fff3bf', center: true });
    block(contact, { size: 24, center: true });
    block(data.pricingPending ? window.NMOrderConfirmation.consultNotice : window.NMOrderConfirmation.quoteNotice, { size: 22, weight: 700, color: '#ad3418', center: true });
    if (y > 32000) throw new Error('요청사항이 너무 깁니다. 내용을 줄인 뒤 다시 시도해 주세요.');
    canvas.width = width;
    canvas.height = Math.ceil(y + inset);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    commands.forEach((command) => {
      let x = inset;
      command.cells.forEach((lines, index) => {
        const cellWidth = command.widths[index];
        ctx.fillStyle = command.fill || '#fff';
        ctx.fillRect(x, command.y, cellWidth, command.height);
        ctx.strokeRect(x, command.y, cellWidth, command.height);
        ctx.fillStyle = command.color || '#111';
        ctx.font = font(command.size, command.weight);
        ctx.textBaseline = 'middle';
        ctx.textAlign = command.center ? 'center' : 'left';
        const top = command.y + (command.height - lines.length * command.lineHeight) / 2 + command.lineHeight / 2;
        lines.forEach((line, lineIndex) => ctx.fillText(line, command.center ? x + cellWidth / 2 : x + 16, top + lineIndex * command.lineHeight));
        x += cellWidth;
      });
    });
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('견적서 이미지 생성에 실패했어요. 다시 시도해 주세요.')), 'image/png'));
  }

  async function provideImage(blob, filename, data) {
    const file = new File([blob], filename, { type: 'image/png' });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: data.documentTitle, text: data.documentTitle, files: [file] });
          return 'share';
        } catch (error) {
          if (error.name === 'AbortError') return 'share_cancelled';
          // Sharing can become unavailable after the asynchronous order save.
        }
      }
    } catch (_) { /* Use download when file sharing is unavailable. */ }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    try { link.click(); } finally { link.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    await new Promise((resolve) => setTimeout(resolve, 400));
    return 'download';
  }

  // Keep successful saves even when image sharing fails or the user revisits an
  // earlier step. A changed payload creates a different order; an identical one
  // reuses its saved items and never sends another POST in this page session.
  function createFlow(options) {
    const saved = new Map();
    let busy = false;
    const safeTrack = (event, params) => { try { options.track?.(event, params); } catch (_) { /* Analytics is optional. */ } };
    return {
      getSaved(payload) { return saved.get(JSON.stringify(payload)); },
      async receive(payload, draft, directConsult = false) {
        if (busy) return null;
        busy = true;
        const key = JSON.stringify(payload);
        try {
          let record = saved.get(key);
          if (!record) {
            const image = directConsult ? null : await options.createImage(draft);
            const result = await options.postOrder(payload);
            if (!result?.orderId) throw new Error('주문 저장 결과를 확인할 수 없어요. 다시 시도해 주세요.');
            record = { result, image, data: null, filename: null };
            saved.set(key, record);
            safeTrack('submit_success', { order_id: result.orderId, total_price: result.totalPrice });
          }
          if (!record.data) {
            record.data = options.fromSaved(record.result, draft);
            // Re-render if the server corrected any name, price or options.
            if (record.image && JSON.stringify(record.data) !== JSON.stringify(draft)) record.image = null;
          }
          if (!directConsult && !record.image) record.image = await options.createImage(record.data);
          if (!record.filename) record.filename = `nothingmatters-${options.fileSlug}-${record.data.pricingPending ? 'consult' : 'quote'}-${Date.now()}.png`;
          options.onSaved?.(record);
          if (!directConsult) {
            const method = await options.provideImage(record.image, record.filename, record.data);
            safeTrack(method === 'download' ? 'quote_download' : 'quote_share', { order_id: record.result.orderId, cancelled: method === 'share_cancelled' });
          }
          safeTrack('kakao_consult_start', { order_id: record.result.orderId });
          options.navigateToKakao();
          return record;
        } catch (error) {
          safeTrack('submit_error', { message: error.message || '견적서 처리 실패' });
          throw error;
        } finally { busy = false; }
      },
    };
  }

  window.NMQuote = {
    copyText, createFlow, createImage, provideImage, renderPreview, toText,
    navigateToKakao: () => { window.location.href = kakaoUrl; },
  };
})();
