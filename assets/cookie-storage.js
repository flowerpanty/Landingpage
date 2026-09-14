  const productData = {
    crew: {
      title: 'COOKIE CREW',
      storage: '직사광선과 고온다습한 곳을 피하고, 제품 포장에 적힌 보관방법을 우선 따라주세요.',
      date: '제조일에 따라 날짜가 달라질 수 있어요. <span class="date-chip">포장 라벨의 소비기한 확인</span>',
      opened: '개봉 뒤에는 공기와 습기의 영향을 받기 쉬워요. 포장을 잘 닫아두고 가능한 한 빠르게 드시는 것을 권장합니다.',
      gift: '포장을 뜯지 않은 상태로, 햇빛과 열이 닿지 않는 곳에서 보관해주세요.',
      quick: [
        ['오늘 바로 먹는다면?', '포장이 손상되지 않았다면 라벨의 안내에 따라 보관하고 드세요.'],
        ['여름철에는?', '차 안, 창가처럼 온도가 크게 올라가는 장소에 오래 두지 마세요.'],
        ['포장이 손상됐다면?', '제품 상태를 먼저 확인하고, 이상이 있거나 판단이 어려우면 카카오로 문의해주세요.']
      ]
    },
    terminal: {
      title: 'TERMINAL SAND COOKIE',
      storage: '샌드 형태 제품은 구성에 따라 권장 보관 조건이 달라질 수 있어요. 수령한 제품 라벨의 보관방법을 우선 확인해주세요.',
      date: '제조일과 구성에 따라 날짜가 달라질 수 있어요. <span class="date-chip">포장 라벨의 소비기한 확인</span>',
      opened: '개봉했다면 필링과 쿠키가 공기·습기에 노출됩니다. 남은 제품은 포장을 잘 닫고 가능한 한 빠르게 드세요.',
      gift: '전달 전까지 밀봉 상태를 유지하고, 직사광선이나 열이 오래 닿는 곳은 피해주세요.',
      quick: [
        ['바로 선물할 예정이라면?', '포장을 그대로 유지하고, 전달 전까지 고온·직사광선을 피해주세요.'],
        ['냉장·냉동해도 될까요?', '구성에 따라 달라질 수 있어요. 라벨에 별도 표시가 없다면 제품명을 알려주시면 확인해드릴게요.'],
        ['필링 상태가 걱정된다면?', '사진과 제품명을 카카오로 보내주시면 확인이 가장 빠릅니다.']
      ]
    },
    flight: {
      title: 'COOKIE FLIGHT',
      storage: '버터쿠키와 코팅의 상태를 위해 직사광선과 고온다습한 곳을 피해주세요. 최종 보관 기준은 제품 라벨을 따라주세요.',
      date: '제조일에 따라 날짜가 달라질 수 있어요. <span class="date-chip">포장 라벨의 소비기한 확인</span>',
      opened: '개봉 후에는 습기에 영향을 받기 쉬워 식감이 달라질 수 있습니다. 포장을 잘 닫아두고 가능한 한 빠르게 드세요.',
      gift: '초콜릿·코팅이 있는 구성은 특히 고온 환경을 피해서 보관해주세요.',
      quick: [
        ['초콜릿이 살짝 녹았다면?', '온도에 따라 코팅의 모양이나 표면 상태가 달라질 수 있습니다. 상태가 걱정되면 사진과 함께 문의해주세요.'],
        ['차에 두어도 될까요?', '차량 내부는 온도가 빠르게 올라갈 수 있어 장시간 보관하지 않는 것을 권장합니다.'],
        ['여행 가방에 넣는다면?', '열과 직사광선을 피하고 제품이 눌리지 않도록 포장 상태를 유지해주세요.']
      ]
    }
  };

  const cards = [...document.querySelectorAll('.product-card')];
  const titleEl = document.getElementById('guide-title');
  const storageEl = document.getElementById('storage-text');
  const dateEl = document.getElementById('date-text');
  const openedEl = document.getElementById('opened-text');
  const giftEl = document.getElementById('gift-text');
  const quickListEl = document.getElementById('quick-list');
  const guidePanel = document.getElementById('guide-panel');

  function renderProduct(key, shouldScroll = true){
    const p = productData[key];
    if(!p) return;
    cards.forEach(card => {
      const active = card.dataset.product === key;
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', String(active));
    });
    titleEl.textContent = p.title;
    storageEl.innerHTML = p.storage;
    dateEl.innerHTML = p.date;
    openedEl.innerHTML = p.opened;
    giftEl.innerHTML = p.gift;
    quickListEl.innerHTML = p.quick.map(([q,a]) => `<div class="quick"><strong>${q}</strong><p>${a}</p></div>`).join('');
    try { history.replaceState(null, '', `${location.pathname}${location.search}#${key}`); } catch(e) {}
    if(shouldScroll) guidePanel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  cards.forEach(card => card.addEventListener('click', () => renderProduct(card.dataset.product)));
  const initialKey = location.hash.replace('#','');
  if(productData[initialKey]) renderProduct(initialKey, false);

  // QR/캠페인 유입값은 기존 analytics가 읽을 수 있도록 dataLayer에 남깁니다.
  const params = new URLSearchParams(location.search);
  const campaign = {
    source: params.get('utm_source') || '',
    medium: params.get('utm_medium') || '',
    campaign: params.get('utm_campaign') || ''
  };
  if(campaign.source || campaign.medium || campaign.campaign){
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({event:'cookie_care_landing', ...campaign});
  }
