// Writes dist/sw.js, the service worker (scripts/sw.js), with the list of
// the built site's files and a version made from their contents: a new
// build is a new version, which replaces the copies browsers keep. Runs
// after the build (and after the lock, which changes files):
//   npm run build, npm run build:locked
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const files = readdirSync('dist', { recursive: true })
  .map((file) => file.split('\\').join('/'))
  .filter((file) => file !== 'sw.js' && statSync(`dist/${file}`).isFile())
  // (Cloudflare's rules for its server, not served; and what is only for search engines)
  .filter((file) => !['_headers', 'robots.txt', 'sitemap.xml', 'llms.txt'].includes(file))
  .filter((file) => !file.endsWith('.pdf')) // the manuals: kept once opened (sw.js), not by every visitor
  // the manual on the web and its pictures too (scripts/manual-web.mjs)
  .filter((file) => !/(^|\/)manual\.html$/.test(file) && !file.startsWith('manual/'))
  // the about page's pictures and videos and the link preview: not for the app, and a video from the
  // cache would answer a range request with the whole file, which Safari doesn't play
  .filter((file) => !file.startsWith('about/') && file !== 'og.png')
  .sort();
const worker = readFileSync(new URL('sw.js', import.meta.url), 'utf8');
const hash = createHash('sha256').update(worker);
for (const file of files) hash.update(file).update(readFileSync(`dist/${file}`));
const version = hash.digest('hex').slice(0, 12);
// kept when it installs: what the page loads to open (also as the folder's own address, ./, which is
// how it is opened); the rest (the chemistry engines, a few MB) one at a time after, RDKit
// first: all at once, they held up a first visit's first SMILES (21 s instead of 8 on a slow line)
// (the app icons, the other pages and the licences after too: they wait for the link)
const opening = new Set([...readFileSync('dist/index.html', 'utf8').matchAll(/assets\/[^"'\s)]+/g)].map((m) => m[0]));
const now = files.filter((file) => opening.has(file) || ['index.html', 'manifest.webmanifest', 'icons/icon.svg'].includes(file));
const later = files.filter((file) => !now.includes(file))
  .sort((p, q) => (/RDKit/.test(q) - /RDKit/.test(p)) || statSync(`dist/${p}`).size - statSync(`dist/${q}`).size);
const list = (names) => JSON.stringify(names.map((file) => `./${file}`), null, 2);
writeFileSync('dist/sw.js', worker.replace('VERSION', version).replace('FILE_LIST', list(['', ...now])).replace('LATER_LIST', list(later)));
const size = files.reduce((sum, file) => sum + statSync(`dist/${file}`).size, 0);
console.log(`olomol: dist/sw.js keeps ${files.length} files (${(size / 1e6).toFixed(1)} MB; ${now.length} when installed, then ${later.length}), version ${version}`);
