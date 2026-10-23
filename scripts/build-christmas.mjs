import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/christmas-products.json'), 'utf8'));
const check = process.argv.includes('--check');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const won = value => `${value.toLocaleString('ko-KR')}원`;
const bySku = new Map(catalog.products.map(product => [product.sku, product]));
if (bySku.size !== 4 || catalog.products.some(p => !Number.isSafeInteger(p.price) || p.price <= 0 || !fs.existsSync(path.join(root,p.image)))) throw new Error('Invalid Christmas catalog');
const savings = bySku.get('christmas-bear-brookie').price + bySku.get('christmas-tree-brookie').price - bySku.get('christmas-brookie-set').price;
const cards = `<div class="xmas-products">${catalog.products.map((p,index) => `
        <article class="xmas-product" id="${p.sku}" data-sku="${p.sku}" aria-labelledby="${p.sku}-title">
          <figure><button type="button" class="xmas-photo-button" data-gallery="${p.sku}" aria-label="${escape(p.name)} 상세 사진 보기" aria-haspopup="dialog" disabled><img src="${p.image}" alt="${escape(p.alt)}" width="${p.width}" height="${p.height}" loading="${index === 0 ? 'eager' : 'lazy'}" ${index === 0 ? 'fetchpriority="high" ' : ''}decoding="async"><span class="xmas-photo-label"><svg class="xmas-photo-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2"/><path d="m12.5 12.5 4.5 4.5M8 5.5v5M5.5 8h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><strong>상세사진</strong><span class="xmas-photo-sparkle" aria-hidden="true">✦</span></span></button><figcaption class="xmas-sr-only">${escape(p.caption)}</figcaption></figure>
          <div class="xmas-product-info"><h3 id="${p.sku}-title">${escape(p.name)}</h3><p class="xmas-price">${won(p.price)}${p.sku === 'christmas-brookie-set' && savings > 0 ? `<span class="xmas-saving">단품 합계보다 ${won(savings)} 절약</span>` : ''}</p><p class="xmas-composition">${escape(p.composition)}</p></div>
          <div class="xmas-counter" role="group" aria-label="${escape(p.name)} 수량"><button type="button" data-delta="-1" aria-label="${escape(p.name)} 수량 줄이기" disabled>−</button><input id="qty-${p.sku}" type="number" inputmode="numeric" min="0" step="1" value="0" aria-label="${escape(p.name)} 수량" aria-describedby="xmas-quantity-help"><button type="button" data-delta="1" aria-label="${escape(p.name)} 수량 늘리기" disabled>+</button></div><output class="xmas-line-total" data-line-total>0원</output>
        </article>`).join('')}
      </div><p class="xmas-sr-only" id="xmas-quantity-help">0 이상의 정수로 입력해 주세요. 세트 수량은 단품과 별도로 계산합니다.</p>`;
function update(relative, transform) {
  const file=path.join(root,relative), before=fs.readFileSync(file,'utf8'), after=transform(before);
  if (check && before !== after) throw new Error(`${relative} is out of date; run npm run christmas:build`);
  if (!check && before !== after) fs.writeFileSync(file,after);
}
const description = `2026 크리스마스 쿠키 선물 4종. ${catalog.products.map(p => `${p.name} ${won(p.price)}`).join(', ')}. 수량과 상품 합계를 확인하고 기업·어린이집 연말 답례품을 상담하세요.`;
update('christmas/index.html', html => html
  .replace(/<!-- christmas-faq-products:start -->[\s\S]*?<!-- christmas-faq-products:end -->/, `<!-- christmas-faq-products:start -->\n      <details><summary>어떤 크리스마스 쿠키 선물을 고를 수 있나요?</summary><p>${catalog.products.map(p => escape(p.name)).join(', ')}을 준비했습니다. 상품별 구성과 가격은 위 상품 카드에서 확인할 수 있습니다.</p></details>\n      <!-- christmas-faq-products:end -->`)
  .replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*(">)/g, `$1${escape(description)}$2`)
  .replace(/<!-- christmas-products:start -->[\s\S]*?<!-- christmas-products:end -->/, `<!-- christmas-products:start -->\n      ${cards}\n      <!-- christmas-products:end -->`)
  .replace(/<script id="xmas-catalog" type="application\/json">[\s\S]*?<\/script>/, `<script id="xmas-catalog" type="application/json">${JSON.stringify(catalog).replace(/</g,'\\u003c')}</script>`));
update('llms.txt', text => text.replace(/\*\*Christmas \/ Holiday gifts\*\*[\s\S]*?(?=## Official channels)/, `**Christmas / Holiday gifts**\n\n- Landing: https://nothingmatters.co.kr/christmas/\n${catalog.products.map(p=>`- ${p.sku}: ${p.name} / ${won(p.price)} / ${p.composition}`).join('\n')}\n- Use cases: 크리스마스 쿠키 선물, 크리스마스 답례품, 기업 크리스마스 선물, 어린이집 크리스마스 선물, 크리스마스 단체 간식, 연말 답례품.\n- The set is an independent SKU; never automatically combine or convert single items.\n- Online submission is unavailable pending Railway support. Consult via https://pf.kakao.com/_QdCaK/chat; a request is not payment or production confirmation.\n- Stock, minimum quantities, delivery fees, deadlines and available pickup dates must be confirmed by consultation. Prices above are product totals only.\n\n`));
console.log(`Christmas catalog ${check ? 'check' : 'build'}: four independent SKUs, visible prices and llms guidance PASS`);
