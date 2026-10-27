// Builds site/simple.html: one self-contained page.
// Inlines the shared intake assistant (site/assets/intake.css and intake.js) into src/simple.html,
// so the intake logic lives in one place. Run after changing either: node scripts/build-simple.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(root + p, 'utf8');

let html = read('src/simple.html');
const swaps = [
  ['/* @inline intake.css */', read('site/assets/intake.css')],
  ['/* @inline intake.js */', read('site/assets/intake.js').replace(/<\/script/gi, '<\\/script')],
];
for (const [marker, content] of swaps) {
  if (!html.includes(marker)) throw new Error(`Marker missing in src/simple.html: ${marker}`);
  html = html.replace(marker, () => content);
}
html = html.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n<!-- Generated from src/simple.html by scripts/build-simple.mjs. Edit the source, not this file. -->\n');
writeFileSync(root + 'site/simple.html', html);
console.log(`Built site/simple.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
