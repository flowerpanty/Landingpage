import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run deliberately before deployment; production never depends on another checkout.
const argument = process.argv.indexOf('--source');
if (argument < 0 || !process.argv[argument + 1]) throw new Error('Usage: node scripts/sync-brookie-order.mjs --source <order-workspace>');
const sourceRoot = path.resolve(process.argv[argument + 1]);
const publicRoot = path.join(sourceRoot, 'client/public');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const files = ['order.css', 'order-confirmation.css', 'order-confirmation.js', 'order-core.js', 'landing-quote.js', 'brookie-mobile.css', 'brookie-quote.js', 'order-email-quote.js'];
const hashes = {};
for (const file of files) {
  const data = fs.readFileSync(path.join(publicRoot, file));
  hashes[file] = sha(data);
  fs.writeFileSync(path.join(root, 'order/assets', file), data);
}
let html = fs.readFileSync(path.join(publicRoot, 'brookie.html'), 'utf8');
hashes['brookie.html'] = sha(html);
for (const file of files) {
  html = html.replaceAll(`"${file}"`, `"/order/assets/${file}?v=${hashes[file].slice(0, 12)}"`)
    .replaceAll(`"/${file}"`, `"/order/assets/${file}?v=${hashes[file].slice(0, 12)}"`);
}
html = html.replaceAll('public/', '/order/assets/public/');
fs.writeFileSync(path.join(root, 'order/brookie.html'), html);
let copied = 0;
function syncDirectory(relative) {
  for (const item of fs.readdirSync(path.join(publicRoot, relative), { withFileTypes: true })) {
    const child = path.join(relative, item.name);
    if (item.isDirectory()) { syncDirectory(child); continue; }
    const from = path.join(publicRoot, child), to = path.join(root, 'order/assets', child);
    const data = fs.readFileSync(from);
    if (!fs.existsSync(to) || sha(fs.readFileSync(to)) !== sha(data)) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, data); copied++;
    }
  }
}
for (const directory of ['public/renders', 'public/images/characters', 'public/custom-cases', 'public/examples/topper', 'public/examples/sticker']) syncDirectory(directory);
const manifestPath = path.join(root, 'order/source-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
Object.assign(manifest.sourceFiles, hashes);
manifest.brookieImport = {
  repository: 'flowerpanty/ThingMattersReserve',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(),
  sourceFiles: hashes,
  deployedHtmlSha256: sha(html),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Imported latest Brookie HTML, ${files.length} styles/scripts and ${copied} changed images for /order/brookie.`);
