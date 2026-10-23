import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('christmas/index.html'), catalog=JSON.parse(read('data/christmas-products.json'));
const clean=text=>text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
assert.equal((html.match(/<h1\b/g)||[]).length,1);
assert.match(html,/rel="canonical" href="https:\/\/nothingmatters.co.kr\/christmas\/"/);
assert.match(html,/naver-site-verification.*e627e1eaae68060408cb4e512e46d6b98a64401c/);
assert.match(html,/G-DR5XLDB042/);
assert.match(html,/data-nm-skip-link/);assert.match(html,/data-nm-accessibility/);
const expected=[['christmas-bear-brookie','곰돌이 브루키',8500],['christmas-tree-brookie','트리 브루키',9000],['christmas-brookie-set','브루키 2종 세트',17000],['christmas-santa-bundle','산타꾸러미 4종',23000]];
assert.deepEqual(catalog.products.map(p=>[p.sku,p.name,p.price]),expected);
assert.deepEqual(JSON.parse(html.match(/<script id="xmas-catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]),catalog);
assert.deepEqual([...html.matchAll(/<article class="xmas-product" id="([^"]+)"/g)].map(m=>m[1]),catalog.products.map(p=>p.sku));
for(const p of catalog.products){
  const card=html.match(new RegExp(`<article class="xmas-product" id="${p.sku}"[\\s\\S]*?</article>`))[0];
  assert.ok(clean(card).includes(p.name));assert.ok(clean(card).includes(`${p.price.toLocaleString('ko-KR')}원`));assert.ok(card.includes(p.image));
  const image=card.match(/<img\b[^>]*>/)[0];for(const attribute of ['width','height','alt','loading','decoding']) assert.ok(image.includes(`${attribute}="`));
  assert.ok(fs.statSync(path.join(root,p.image)).size<200*1024);assert.ok(card.includes('data-delta="-1"'));assert.ok(card.includes('data-delta="1"'));
}
assert.deepEqual([...html.matchAll(/<section[^>]*id="([^"]+)"/g)].map(m=>m[1]),['hero','christmas-products','order-details','order-review','group-orders','faq']);
assert.deepEqual([...html.matchAll(/data-order-step="(\d)"/g)].map(m=>m[1]),['1','2','3']);
assert.equal((html.match(/data-step-link="/g)||[]).length,3);
assert.match(html,/<dialog id="xmas-gallery" aria-labelledby="xmas-gallery-title">/);
assert.match(html,/<aside class="xmas-order-summary"/);
assert.ok(html.indexOf('id="group-orders"')>html.indexOf('id="order-review"'));
for(const product of catalog.products){
  assert.ok(product.gallery.length>=1);
  for(const photo of product.gallery)assert.ok(fs.existsSync(path.join(root,photo.image)) && photo.width>0 && photo.height>0 && photo.alt && photo.caption);
}
assert.doesNotMatch(html,/산타 브루키|크리스마스 트리 브루키|크리스마스 얼굴쿠키 4구|data-image-slot|christmas-cute/);
assert.match(html,/<form[^>]*method="post"/);assert.match(html,/<button id="xmas-submit"[^>]*form="xmas-order-form"[^>]*disabled/);
assert.match(html,/카카오톡 상담.*최종 주문/s);
const graph=JSON.parse(html.match(/<script type="application\/ld\+json" data-nm-schema="static">([\s\S]*?)<\/script>/)[1])['@graph'];
for(const type of ['ItemList','FAQPage','Service','CollectionPage','BreadcrumbList']) assert.equal(graph.filter(n=>n['@type']===type).length,1);
const list=graph.find(n=>n['@type']==='ItemList');
assert.deepEqual(list.itemListElement.map(n=>[n.item.sku,n.item.name,n.item.offers.price]),expected);
assert.doesNotMatch(JSON.stringify(list),/availability|shippingDetails|priceValidUntil|inventoryLevel|hasMerchantReturnPolicy/);
const faqs=[...html.matchAll(/<details><summary>([^<]+)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(m=>[clean(m[1]),clean(m[2])]);
assert.equal(faqs.length,7);assert.deepEqual(graph.find(n=>n['@type']==='FAQPage').mainEntity.map(n=>[n.name,n.acceptedAnswer.text]),faqs);
const entry=JSON.parse(read('data/site-pages.json')).pages.find(p=>p.path==='/christmas/');
assert.equal(entry.occasionLanding.productCatalog,'christmas');assert.equal(entry.lastmod,catalog.updatedAt);
assert.ok(read('sitemap.xml').includes(`<loc>https://nothingmatters.co.kr/christmas/</loc>\n    <lastmod>${catalog.updatedAt}</lastmod>`));
const guidance=read('llms.txt').split('**Christmas / Holiday gifts**')[1].split('## Official channels')[0];
for(const p of catalog.products) assert.ok(guidance.includes(p.name)&&guidance.includes(p.sku)&&guidance.includes(`${p.price.toLocaleString('ko-KR')}원`));
for(const link of html.matchAll(/href="([^"]+)"/g)){
 const url=new URL(link[1],'https://nothingmatters.co.kr/christmas/');if(url.origin!=='https://nothingmatters.co.kr') continue;
 const file=url.pathname==='/'?'index.html':url.pathname.endsWith('/')?url.pathname.slice(1)+'index.html':url.pathname.slice(1);
 assert.ok(fs.existsSync(path.join(root,file)),`missing link ${url}`);if(url.hash)assert.ok(read(file).includes(`id="${url.hash.slice(1)}"`),`missing anchor ${url}`);
}
const js=read('christmas/christmas-order.js');assert.doesNotMatch(js,/localStorage|sessionStorage|gtag\(|URLSearchParams/);
console.log('Christmas landing: four real photos, visible catalog prices, independent set, order form, gated submission, synchronized schema/FAQ/llms and internal links PASS');
