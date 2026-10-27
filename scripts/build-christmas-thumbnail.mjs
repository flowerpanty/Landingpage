// Optional asset production command; site:build consumes the saved JPG without Sharp.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { representative: image } = JSON.parse(fs.readFileSync(path.join(root, 'data/christmas-media.json'), 'utf8'));
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); }
catch { sharp = require(process.env.SHARP_MODULE_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')); }

const layers = await Promise.all(image.sources.map(async source => ({
  // Contain each complete source photograph, preserving its proportions and product details.
  input: await sharp(path.join(root, source.image.slice(1)))
    .resize(source.width, source.height, { fit: 'contain', background: image.background })
    .png().toBuffer(),
  left: source.left,
  top: source.top
})));
const output = path.join(root, image.image.slice(1));
await sharp({ create: { width: image.width, height: image.height, channels: 3, background: image.background } })
  .composite(layers)
  .jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true })
  .toFile(output);
const metadata = await sharp(output).metadata();
if (metadata.format !== 'jpeg' || metadata.width !== 1200 || metadata.height !== 630) throw new Error('Invalid Christmas thumbnail');
console.log(`Christmas thumbnail: ${image.image} / ${metadata.width}x${metadata.height} JPEG / ${fs.statSync(output).size} bytes / unaltered source photos`);
