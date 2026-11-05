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

const source = image.sources[0];
if (image.sources.length !== 1 || source.crop || source.fit !== 'contain' || source.left !== 0 || source.top !== 0) {
  throw new Error('The Christmas photo must stay complete: no crop, cover, padding, or split composition');
}
const input = sharp(path.join(root, source.image.slice(1)));
const original = await input.metadata();
if (original.width !== image.width || original.height !== image.height || source.width !== image.width || source.height !== image.height) {
  throw new Error('Use the original photo dimensions and let the page frame grow');
}
const output = path.join(root, image.image.slice(1));
await input.jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true }).toFile(output);
const metadata = await sharp(output).metadata();
if (metadata.format !== 'jpeg' || metadata.width !== image.width || metadata.height !== image.height) throw new Error('Invalid Christmas photo');
console.log(`Christmas photo: ${image.image} / ${metadata.width}x${metadata.height} JPEG / ${fs.statSync(output).size} bytes / complete photo, no crop or padding`);
