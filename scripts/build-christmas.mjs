import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/christmas-products.json'), 'utf8'));
const { representative: socialImage, workshop: aboutPhoto } = JSON.parse(fs.readFileSync(path.join(root, 'data/christmas-media.json'), 'utf8'));
const socialImageUrl = `https://nothingmatters.co.kr${socialImage.image}`;
if (!fs.existsSync(path.join(root, socialImage.image)) || socialImage.width !== 1200 || socialImage.height !== 630) throw new Error('Invalid Christmas representative image');
if (!aboutPhoto || !Number.isSafeInteger(aboutPhoto.width) || !Number.isSafeInteger(aboutPhoto.height) || aboutPhoto.width <= 0 || aboutPhoto.height <= 0 || !aboutPhoto.alt || !aboutPhoto.caption || ![aboutPhoto.image, aboutPhoto.fallback].every(image => image && fs.existsSync(path.join(root, image)))) throw new Error('Invalid Christmas workshop photo');
const check = process.argv.includes('--check');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const won = value => `${value.toLocaleString('ko-KR')}원`;
const bySku = new Map(catalog.products.map(product => [product.sku, product]));
if (bySku.size !== 4 || catalog.products.some(p => !Number.isSafeInteger(p.price) || p.price <= 0 || !fs.existsSync(path.join(root,p.image)))) throw new Error('Invalid Christmas catalog');
const savings = bySku.get('christmas-bear-brookie').price + bySku.get('christmas-tree-brookie').price - bySku.get('christmas-brookie-set').price;
const cards = `<div class="xmas-products">${catalog.products.map(p => `
        <article class="xmas-product" id="${p.sku}" data-sku="${p.sku}" aria-labelledby="${p.sku}-title">
          <figure><button type="button" class="xmas-photo-button" data-gallery="${p.sku}" aria-label="${escape(p.name)} 상세 사진 보기" aria-haspopup="dialog" disabled><img src="${p.image}" alt="${escape(p.alt)}" width="${p.width}" height="${p.height}" loading="lazy" decoding="async"><span class="xmas-photo-label"><svg class="xmas-photo-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2"/><path d="m12.5 12.5 4.5 4.5M8 5.5v5M5.5 8h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><strong>상세사진</strong><span class="xmas-photo-sparkle" aria-hidden="true">✦</span></span></button><figcaption class="xmas-photo-caption">${escape(p.caption)}</figcaption></figure>
          <div class="xmas-product-info"><h3 id="${p.sku}-title">${escape(p.name)}</h3><p class="xmas-price">${won(p.price)}${p.sku === 'christmas-brookie-set' && savings > 0 ? `<span class="xmas-saving">단품 합계보다 ${won(savings)} 절약</span>` : ''}</p><p class="xmas-composition">${escape(p.composition)}</p></div>
          <div class="xmas-counter" role="group" aria-label="${escape(p.name)} 수량"><button type="button" data-delta="-1" aria-label="${escape(p.name)} 수량 줄이기" disabled>−</button><input id="qty-${p.sku}" type="number" inputmode="numeric" min="0" step="1" value="0" aria-label="${escape(p.name)} 수량" aria-describedby="xmas-quantity-help"><button type="button" data-delta="1" aria-label="${escape(p.name)} 수량 늘리기" disabled>+</button></div><output class="xmas-line-total" data-line-total>0원</output>
        </article>`).join('')}
      </div><p class="xmas-sr-only" id="xmas-quantity-help">0 이상의 정수로 입력해 주세요. 세트 수량은 단품과 별도로 계산합니다.</p>`;
function update(relative, transform) {
  const file=path.join(root,relative), before=fs.readFileSync(file,'utf8'), after=transform(before);
  if (check && before !== after) throw new Error(`${relative} is out of date; run npm run christmas:build`);
  if (!check && before !== after) fs.writeFileSync(file,after);
}
const bear = bySku.get('christmas-bear-brookie');
const tree = bySku.get('christmas-tree-brookie');
const set = bySku.get('christmas-brookie-set');
const bundle = bySku.get('christmas-santa-bundle');
const title = '2026 크리스마스 쿠키 세트·수제쿠키 선물 | 낫띵메터스';
const description = `2026 크리스마스 수제쿠키 선물세트 4종. ${catalog.products.map(p => `${p.name} ${won(p.price)}`).join(', ')}. 서울 강서구 예약 픽업과 기업행사·어린이집 단체주문 상담을 안내합니다.`;
const heading = '2026 크리스마스 쿠키 세트·선물';
const aboutTitle = '이 쿠키는 여기서 만들어요.';
const brandIntro = '낫띵메터스는 서울 강서구 공항동에서 귀여운 캐릭터 쿠키와 마음을 전하는 선물을 만드는 작은 쿠키 작업실이에요.';
const brandSeason = '올해 크리스마스에도 곰돌이와 트리, 산타와 루돌프를 쿠키에 담았습니다.';
const giftAdvice = new Map([
  [bear.sku, { packaging: '곰돌이 브루키의 개별 포장 사진을 상세 갤러리에서 확인할 수 있습니다.', purpose: '한 사람에게 전하는 개별 선물·크리스마스 답례품' }],
  [tree.sku, { packaging: '개별 포장 사진은 트리 브루키 2개를 함께 촬영한 예시입니다. 단품 구성은 1개입니다.', purpose: '트리 모양으로 계절의 분위기를 전하는 개인 선물' }],
  [set.sku, { packaging: '곰돌이와 트리를 함께 담은 손잡이 포장 실물 사진을 참고해 주세요.', purpose: '연인·친구에게 두 가지 디자인을 함께 전하는 쿠키 선물세트' }],
  [bundle.sku, { packaging: '선물 상자와 네 가지 쿠키를 함께 촬영한 실물 사진을 참고해 주세요.', purpose: '산타 쿠키 선물을 포함해 네 가지 디자인을 함께 전하는 선물' }]
]);
const recommendations = [
  ['개인에게 가볍게 전하는 선물', `곰돌이 쿠키나 트리 쿠키를 한 개씩 나눠주려면 ${bear.name}·${tree.name} 단품을 고르세요. 받는 분에게 전하고 싶은 모양과 나눠줄 수량을 먼저 정리하면 됩니다.`],
  ['연인·친구에게 주는 쿠키 선물', `곰돌이와 트리를 함께 전하고 싶다면 ${set.name}, 네 가지 크리스마스 디자인을 함께 보여주고 싶다면 ${bundle.name}을 비교해 보세요. 함께 담긴 디자인과 실제 포장 사진이 선택 기준이 됩니다.`],
  ['크리스마스 파티 간식', '한 사람에게 개별로 나눠줄지, 세트째 선물할지 먼저 정해 보세요. 참석 인원과 전달 방식을 기준으로 단품·세트의 희망 수량을 각각 선택하면 필요한 상품 합계를 확인할 수 있습니다.'],
  ['회사·기관 단체 선물', '크리스마스 기업 선물은 임직원·고객 등 전달 대상별로 상품과 수량을 나눠 정리해 보세요. 행사일과 예산, 포장 요청을 함께 알려주시면 제작 일정과 수령 방법을 상담할 수 있습니다.']
];
const orderGuide = [
  ['상품과 희망 수량을 선택해 주세요', '위 3 STEP에서 실제 사진을 확대해 보고 상품별 수량과 합계를 확인하세요. 단품과 세트는 각각 별도 상품으로 계산하며, 선택하지 않은 상품은 합계에서 제외됩니다.'],
  ['픽업 날짜와 시간을 상담해 주세요', '서울 강서구 공항동 작업실의 예약 픽업을 기본으로 안내합니다. 수령 희망 날짜·시간과 픽업 또는 차량 퀵 희망 여부를 알려주세요. 입력한 일정은 상담에서 가능 여부를 확인한 뒤 확정합니다.'],
  ['크리스마스 전에 받으려면 언제 예약해야 하나요?', '주문 마감일과 제작 가능 일정은 카카오톡 상담으로 먼저 확인해 주세요. 희망 픽업 날짜·시간과 수량을 알려주시면 가능 여부를 안내합니다. 크리스마스 4종의 택배 가능 여부도 별도 확인이 필요하며, 다른 상품의 택배 조건을 적용하지 않습니다.'],
  ['카카오톡에서 최종 주문을 확정해 주세요', '온라인 주문 신청은 현재 준비 중입니다. 화면에서 검토한 상품 구성을 복사해 카카오톡으로 상담하고, 상품·수량·수령 일정을 최종 확인해 주세요. 예약 없이 방문하시면 바로 구매할 쿠키가 없습니다.']
];
const shoppingGuide = `
    <section class="xmas-wrap xmas-section" id="gift-choice" aria-labelledby="gift-choice-title">
      <p class="xmas-eyebrow">CHOOSE YOUR CHRISTMAS</p><h2 id="gift-choice-title">크리스마스 쿠키 추천, 받는 분과 나누는 방식부터 골라보세요</h2>
      <p><strong>쿠키 한 개 선물과 세트 선물 중 무엇을 고르면 좋을까요?</strong> 한 사람씩 나눠주려면 단품, 두 가지 모양이나 네 가지 디자인을 함께 전하려면 세트를 비교해 보세요. 크리스마스 브루키 단품과 세트는 각각 별도 상품입니다.</p>
      <div class="xmas-advice-grid">${recommendations.map(([name, text]) => `<article><h3>${escape(name)}</h3><p>${escape(text)}</p></article>`).join('')}</div>
    </section>
    <section class="xmas-wrap xmas-section" id="gift-comparison" aria-labelledby="gift-comparison-title">
      <p class="xmas-eyebrow">PRICE &amp; PACKAGING</p><h2 id="gift-comparison-title">크리스마스 쿠키 가격·구성·포장 비교</h2>
      <p><strong>크리스마스 쿠키 2종 세트와 4종 세트는 무엇이 다른가요?</strong> ${escape(set.name)}는 ${escape(set.composition)}, ${escape(bundle.name)}은 ${escape(bundle.composition)} 구성입니다. 아래에서 크리스마스 쿠키 선물세트와 단품의 가격·실물 포장을 비교해 보세요.</p>
      <div class="xmas-comparison-grid">${catalog.products.map(p => {
        const advice = giftAdvice.get(p.sku);
        return `<article class="xmas-comparison-card" data-compare-sku="${p.sku}" aria-labelledby="compare-${p.sku}"><h3 id="compare-${p.sku}">${escape(p.name)}</h3><p class="xmas-comparison-price">${won(p.price)}</p><dl><div><dt>구성</dt><dd data-compare-composition>${escape(p.composition)}</dd></div><div><dt>포장 사진</dt><dd>${escape(advice.packaging)}</dd></div><div><dt>선물 용도</dt><dd>${escape(advice.purpose)}</dd></div></dl></article>`;
      }).join('')}</div>
      <p class="xmas-fineprint">단품과 세트는 각각 별도 상품입니다. 크리스마스 쿠키 포장은 위 상품 카드의 상세 사진과 촬영 설명을 함께 확인해 주세요. 여러 상품을 함께 촬영한 사진의 수량이나 촬영 소품이 판매 구성에 추가되지는 않습니다. 별도 포장 요청은 가능 여부와 비용을 상담으로 확인합니다.</p>
    </section>
    <section class="xmas-wrap xmas-section" id="ordering-guide" aria-labelledby="ordering-guide-title">
      <p class="xmas-eyebrow">BEFORE YOU ORDER</p><h2 id="ordering-guide-title">크리스마스 쿠키 주문, 이 순서로 준비하세요</h2>
      <p>상품과 수량을 먼저 정리하고, 희망 수령 일정을 카카오톡에서 상담해 주세요. 제작과 수령 가능 여부를 확인하는 과정이 필요합니다.</p>
      <ol class="xmas-order-guide-list">${orderGuide.map(([name, text]) => `<li><h3>${escape(name)}</h3><p>${escape(text)}</p></li>`).join('')}</ol>
      <nav class="xmas-guide-links" aria-label="주문 상담과 픽업"><a href="https://pf.kakao.com/_QdCaK/chat" target="_blank" rel="noopener noreferrer" data-analytics-event="consult_click" data-analytics-label="christmas-order-guide">카카오톡 최종 주문 상담 ↗</a><a href="/pickup/">예약 픽업 안내 ↗</a></nav>
    </section>`;
const faqs = [
  ['크리스마스 쿠키 세트에는 어떤 상품이 있나요?', `선택할 수 있는 상품은 ${catalog.products.map(p => `${p.name} ${won(p.price)}`).join(', ')}입니다. 실제 구성과 상세 사진은 위 상품 카드에서 확인해 주세요.`],
  ['브루키 2종 세트와 산타꾸러미는 어떻게 다른가요?', `${set.name}는 ${set.composition} 구성으로 ${won(set.price)}, ${bundle.name}은 ${bundle.composition} 구성으로 ${won(bundle.price)}입니다. 단품과 세트는 별도 상품이며 선택한 상품별 수량과 가격으로 계산합니다. 단품을 세트로 자동 전환하지 않습니다.`],
  ['서울에서 크리스마스 쿠키 선물을 픽업할 수 있나요?', '서울 강서구 공항동 작업실에서 사전 예약 픽업을 상담할 수 있습니다. 주소는 서울특별시 강서구 송정로 25 1층이며 김포공항·송정역 인근입니다. 희망 날짜와 시간을 알려주시면 제작·픽업 가능 여부를 확인하고 카카오톡 상담으로 확정합니다.'],
  ['서울 크리스마스 기업행사 단체 주문도 가능한가요?', '서울 크리스마스 기업행사와 연말 단체 간식 구성을 상담할 수 있습니다. 회사 파티, 임직원 감사 선물, 고객·거래처 답례품, 워크숍 등 사용 목적과 희망 수량·행사일·수령일·예산·상품 구성·포장 요청·수령 방법을 알려주세요. 제작 가능 여부는 상담 후 안내합니다.'],
  ['어린이집·유치원 크리스마스 간식으로 준비할 수 있나요?', '어린이집 크리스마스 쿠키 선물과 유치원 크리스마스 간식 구성을 상담할 수 있습니다. 받는 아이들의 연령, 수량, 희망 날짜와 포장 요청을 알려주세요. 식재료·알레르기 정보와 기관의 간식 반입 기준은 주문 전에 확인해 주세요.'],
  ['크리스마스 쿠키는 언제까지 주문해야 하나요?', '주문 마감일과 제작 가능한 일정은 카카오톡 상담으로 확인해야 합니다. 재고·최소 주문량·픽업 가능 일정도 상담에서 안내하며 확정된 날짜나 수량을 이 페이지에서 약속하지 않습니다. 화면의 수령 희망일 입력은 예약 확정이 아닙니다.'],
  ['크리스마스 쿠키를 택배로 받을 수 있나요?', '크리스마스 4종의 택배 가능 여부는 별도 상담으로 확인해야 합니다. 이 페이지는 예약 픽업을 기본으로 안내하며, 다른 상품의 스마트스토어 택배 주문 조건을 크리스마스 상품에 적용하지 않습니다. 배송료나 도착일도 확정해 안내하지 않습니다.'],
  ['예약 없이 방문해도 구매할 수 있나요?', '예약 없이 방문하시면 바로 구매할 쿠키가 없습니다. 낫띵메터스는 예약 제작·예약 픽업 전용 작업실이므로 상품·수량·픽업 날짜와 시간을 카카오톡 상담으로 확정한 뒤 방문해 주세요.'],
  ['온라인에서 바로 주문이 접수되나요?', '현재 온라인 주문 신청은 준비 중이며 카카오톡으로 주문을 상담하고 최종 확정합니다. 3 STEP에서 상품·수량·합계와 수령 희망 정보를 검토할 수 있지만 화면 확인만으로 접수되지는 않습니다. 주문 요청 접수도 결제 완료나 제작 확정을 의미하지 않습니다.'],
  ['차량 퀵으로 받을 수 있나요?', '차량 퀵은 일정·수량·수령 지역에 따라 가능 여부와 비용을 확인해야 합니다. 마곡을 비롯한 서울 기업행사는 수령 희망 지역과 시간을 알려주세요. 서울 전역 당일 배송을 보장하는 서비스는 아닙니다.'],
  ['입력한 개인정보는 어떻게 사용하나요?', '현재 입력 정보는 화면에서 주문 내용을 검토하는 데만 사용하며 URL이나 분석 이벤트에 포함하지 않습니다. 상품 구성 복사에는 개인정보가 포함되지 않으며, 카카오톡 상담에서 필요한 정보를 직접 전달할 수 있습니다.'],
  ['개인 선물과 파티 간식은 어떻게 고르면 좋을까요?', `한 사람씩 나눠줄 선물은 ${bear.name}·${tree.name} 단품, 두 가지 모양을 함께 전할 선물은 ${set.name}, 여러 디자인을 함께 전할 선물은 ${bundle.name}을 비교해 보세요. 파티 간식은 참석 인원과 개별 배포 또는 세트 선물 여부에 맞춰 상품별 수량을 정리하면 됩니다.`],
  ['크리스마스 쿠키 포장은 어떻게 확인하나요?', '상품 카드의 상세 사진과 촬영 설명에서 포장 모습을 확인할 수 있습니다. 브루키 단품의 개별 포장, 2종 세트를 함께 담은 포장, 산타꾸러미 선물 상자 사진을 참고해 주세요. 사진에 함께 촬영된 다른 상품이나 소품은 판매 구성과 구분하며, 별도 포장 요청의 가능 여부와 비용은 상담으로 확인합니다.']
];
update('christmas/index.html', html => html
  .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
  .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*(">)/g, `$1${escape(title)}$2`)
  .replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*(">)/g, `$1${escape(description)}$2`)
  .replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*(">)/g, `$1${escape(socialImageUrl)}$2`)
  .replace(/(<meta (?:property="og:image:alt"|name="twitter:image:alt") content=")[^"]*(">)/g, `$1${escape(socialImage.alt)}$2`)
  .replace(/(<meta property="og:image:width" content=")[^"]*(">)/, `$1${socialImage.width}$2`)
  .replace(/(<meta property="og:image:height" content=")[^"]*(">)/, `$1${socialImage.height}$2`)
  .replace(/(<meta property="og:image:type" content=")[^"]*(">)/, '$1image/jpeg$2')
  .replace(/(<h1 id="christmas-title">)[\s\S]*?(<\/h1>)/, `$1${escape(heading)}$2`)
  .replace(/(<p class="xmas-brand-intro">)[\s\S]*?(<\/p>)/, `$1${escape(brandIntro)}$2`)
  .replace(/(<h2 id="xmas-about-title">)[\s\S]*?(<\/h2>)/, `$1${escape(aboutTitle)}$2`)
  .replace(/(<p class="xmas-brand-season">)[\s\S]*?(<\/p>)/, `$1${escape(brandSeason)}$2`)
  .replace(/<!-- christmas-hero-image:start -->[\s\S]*?<!-- christmas-hero-image:end -->/, `<!-- christmas-hero-image:start -->\n      <figure class="xmas-hero-media"><img id="xmas-hero-image" src="${escape(socialImage.image)}" alt="${escape(socialImage.alt)}" width="${socialImage.width}" height="${socialImage.height}" loading="eager" fetchpriority="high" decoding="async"></figure>\n      <!-- christmas-hero-image:end -->`)
  .replace(/<!-- christmas-about-image:start -->[\s\S]*?<!-- christmas-about-image:end -->/, `<!-- christmas-about-image:start -->\n      <figure class="xmas-about-media"><picture><source srcset="${aboutPhoto.image}" type="image/webp"><img src="${aboutPhoto.fallback}" alt="${escape(aboutPhoto.alt)}" width="${aboutPhoto.width}" height="${aboutPhoto.height}" loading="lazy" decoding="async"></picture><figcaption>${escape(aboutPhoto.caption)}</figcaption></figure>\n      <!-- christmas-about-image:end -->`)
  .replace(/<!-- christmas-summary:start -->[\s\S]*?<!-- christmas-summary:end -->/, `<!-- christmas-summary:start -->\n    <section class="xmas-wrap xmas-gift-guide" id="gift-guide" aria-labelledby="gift-guide-title">\n      <h2 id="gift-guide-title">크리스마스 쿠키 4종</h2>\n      <ul>${catalog.products.map(p => `<li data-summary-sku="${p.sku}"><strong>${escape(p.name)}</strong><span>${won(p.price)}</span></li>`).join('')}</ul>\n    </section>\n    <!-- christmas-summary:end -->`)
  .replace(/<!-- christmas-shopping-guide:start -->[\s\S]*?<!-- christmas-shopping-guide:end -->/, `<!-- christmas-shopping-guide:start -->${shoppingGuide}\n    <!-- christmas-shopping-guide:end -->`)
  .replace(/<!-- christmas-faq:start -->[\s\S]*?<!-- christmas-faq:end -->/, `<!-- christmas-faq:start -->\n      ${faqs.map(([question, answer]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join('\n      ')}\n      <!-- christmas-faq:end -->`)
  .replace(/<!-- christmas-products:start -->[\s\S]*?<!-- christmas-products:end -->/, `<!-- christmas-products:start -->\n      ${cards}\n      <!-- christmas-products:end -->`)
  .replace(/<script id="xmas-catalog" type="application\/json">[\s\S]*?<\/script>/, `<script id="xmas-catalog" type="application/json">${JSON.stringify(catalog).replace(/</g,'\\u003c')}</script>`));
update('llms.txt', text => text.replace(/\*\*Christmas \/ Holiday gifts\*\*[\s\S]*?(?=## Official channels)/, `**Christmas / Holiday gifts**\n\n- Landing: https://nothingmatters.co.kr/christmas/\n${catalog.products.map(p=>`- ${p.sku}: ${p.name} / ${won(p.price)} / ${p.composition}`).join('\n')}\n- Use cases: 크리스마스 쿠키 세트, 서울 크리스마스 쿠키선물, 서울 크리스마스 기업행사, 회사 크리스마스 파티 간식, 임직원 감사 선물, 고객·거래처 연말 답례품, 어린이집 크리스마스 선물, 유치원 크리스마스 간식.\n- Gift selection: https://nothingmatters.co.kr/christmas/#gift-choice — choose individual gifts, gifts for partners/friends, party snacks or company/institution gifts by recipient and distribution method.\n- Price/composition/packaging comparison: https://nothingmatters.co.kr/christmas/#gift-comparison — catalog prices and contents; packaging refers to actual gallery photos and captions, not extra contents or guaranteed custom options.\n- Order guide: https://nothingmatters.co.kr/christmas/#ordering-guide — select products and quantities, consult pickup date/time, confirm deadlines and Christmas shipping eligibility, then finalize in Kakao consultation.\n- Brand: NOTHINGMATTERS / 낫띵메터스. Reservation-only cookie atelier in 공항동, 강서구, 서울; address 서울특별시 강서구 송정로 25 1층, near 김포공항 and 송정역. No cookies are available for walk-in purchase without a reservation.\n- Pickup guide: https://nothingmatters.co.kr/pickup/ / Magok event guide: https://nothingmatters.co.kr/magok-cookie/\n- Group consultation: share quantities, event/receipt dates, budget, product selection, packaging requests and preferred pickup or vehicle courier. Courier availability and cost require confirmation; no citywide same-day delivery promise.\n- The set is an independent SKU; never automatically combine or convert single items.\n- Online submission is unavailable pending Railway support. Consult via https://pf.kakao.com/_QdCaK/chat; final orders are confirmed in Kakao consultation. A request is not payment or production confirmation.\n- Christmas shipping eligibility, stock, minimum quantities, delivery fees, deadlines and available pickup dates must be confirmed by consultation. Other products' Smartstore shipping conditions do not apply to this collection. Prices above are product totals only.\n\n`));
console.log(`Christmas catalog ${check ? 'check' : 'build'}: four independent SKUs, visible prices and llms guidance PASS`);
