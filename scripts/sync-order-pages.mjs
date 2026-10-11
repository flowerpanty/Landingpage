import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const argument = process.argv.indexOf('--source');
if (argument < 0 || !process.argv[argument + 1]) throw new Error('Usage: node scripts/sync-order-pages.mjs --source <order-workspace>');
const sourceRoot = path.resolve(process.argv[argument + 1]);
const publicRoot = path.join(sourceRoot, 'client/public');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const products = JSON.parse(fs.readFileSync(path.join(root,'data/site-pages.json'),'utf8')).orderProducts;
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const files = ['order.css','order-confirmation.css','order-confirmation.js','order-core.js','landing-quote.js','order-email-quote.js','brookie-mobile.css','brookie-quote.js','new-product-order.css','new-product-order.js'];
const hashes = {}, deployed = {};
for (const file of files) {
  let data = fs.readFileSync(path.join(publicRoot,file),'utf8'); hashes[file] = sha(data);
  // Source modules use root assets; imported modules use the same-origin /order namespace.
  data = data.replaceAll('/public/','/order/assets/public/');
  fs.writeFileSync(path.join(root,'order/assets',file),data);
  deployed[file] = sha(data);
}
for (const product of products) {
  const file = product.slug+'.html';
  let html = fs.readFileSync(path.join(publicRoot,file),'utf8'); hashes[file] = sha(html);
  for (const asset of files) {
    html = html.replaceAll(`"${asset}"`,`"/order/assets/${asset}?v=${deployed[asset].slice(0,12)}"`)
      .replaceAll(`"/${asset}"`,`"/order/assets/${asset}?v=${deployed[asset].slice(0,12)}"`);
  }
  html = html.replace(/(?<!assets\/)public\//g,'/order/assets/public/');
  html = html.replace(/(<link rel="canonical" href=")[^"]+/,`$1https://nothingmatters.co.kr${product.detailUrl}`)
    .replace(/(<meta property="og:url" content=")[^"]+/,`$1https://nothingmatters.co.kr${product.detailUrl}`);
  // Absolute social image URLs need the imported public asset namespace too.
  html = html.replaceAll('https://nothingmatters.co.kr//order/', 'https://nothingmatters.co.kr/order/');
  fs.writeFileSync(path.join(root,'order',file),html); deployed[file] = sha(html);
}
let copied = 0;
function syncDirectory(relative) {
  for (const item of fs.readdirSync(path.join(publicRoot,relative),{withFileTypes:true})) {
    const child = path.join(relative,item.name);
    if(item.isDirectory()){syncDirectory(child);continue;}
    const data = fs.readFileSync(path.join(publicRoot,child)), to = path.join(root,'order/assets',child);
    if(!fs.existsSync(to)||sha(fs.readFileSync(to))!==sha(data)) {
      fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,data);copied++;
    }
  }
}
for(const directory of ['public/renders','public/images/characters','public/custom-cases','public/examples/topper','public/examples/sticker','public/cookie-assets','public/lucky-assets','public/cookie-flight-assets','public/airplane-cookie-assets','public/cookie-crew-assets','public/terminal-cookie-assets']) {
  if(fs.existsSync(path.join(publicRoot,directory)))syncDirectory(directory);
}
const manifestPath = path.join(root,'order/source-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
Object.assign(manifest.sourceFiles,hashes);
manifest.orderImport = {repository:'flowerpanty/ThingMattersReserve',commit:execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim(),sourceFiles:hashes,deployedFiles:deployed};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(`Imported seven order pages, ${files.length} styles/scripts and ${copied} changed images with content-hash asset URLs.`);
