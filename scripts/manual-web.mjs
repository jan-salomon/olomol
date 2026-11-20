// The manual on the web: the same Typst source as the PDF (docs/manual.typ, docs/en/manual.typ), exported as
// HTML (Typst's HTML export, still experimental: docs/styl.typ leaves out what is only the paper's layout) and
// made a page of the site: public/manual.html (English) and public/cs/manual.html (Czech), the contents beside
// the text, in the look of the about page. The pictures Typst puts into the page (data: URIs) are written as
// files of their own, public/manual/img/<hash>.<ext>, shared by both pages. Committed, as the PDFs are: the
// site's build needs no Typst.
//   npm run manual:web          (after the pictures and the PDFs: docs/README.md)
// German has no manual of its own: Help in German opens the English one.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'https://olomol.org/';
const PAGES = {
  en: {
    source: 'docs/en/manual.typ', out: 'public/manual.html', root: '', pdf: 'docs/en/manual.pdf',
    title: 'olomol – Manual', heading: 'Manual', contents: 'Contents', open: 'Open olomol', pdfLabel: 'PDF for printing',
    description: 'The olomol manual: drawing chemical structures, reactions and curved-arrow mechanisms in the browser, step by step.',
    quick: ['docs/en/quick-start.pdf', 'Quick start (PDF)'], language: 'Language',
  },
  cs: {
    source: 'docs/manual.typ', out: 'public/cs/manual.html', root: '../', pdf: 'docs/manual.pdf',
    title: 'olomol – Příručka', heading: 'Příručka', contents: 'Obsah', open: 'Otevřít olomol', pdfLabel: 'PDF k tisku',
    description: 'Příručka k olomolu: kreslení chemických struktur, reakcí a mechanismů se zahnutými šipkami v prohlížeči, krok za krokem.',
    quick: ['docs/rychly-start.pdf', 'Rychlý start (PDF)'], language: 'Jazyk',
  },
};
const IMAGES = 'public/manual/img';

const work = mkdtempSync(join(tmpdir(), 'olomol-manual-'));
// (the folder kept, only pictures no longer in a page removed at the end: a dev server running meanwhile loses
// track of a folder deleted and made again)
mkdirSync(IMAGES, { recursive: true });
mkdirSync('public/cs', { recursive: true });

const written = new Set();
// The size a picture is shown at, in CSS pixels: a screenshot (PNG, taken at twice the pixels: manual-shots.mjs)
// at half its pixels, a drawing (SVG) at the size it says it is (pt or px); null when it doesn't say.
function naturalWidth(mime, bytes) {
  if (mime === 'image/png') return Math.round(bytes.readUInt32BE(16) / 2);
  if (mime === 'image/svg+xml') {
    const head = bytes.toString('utf8', 0, 2000);
    const width = head.match(/<svg[^>]*\swidth="([\d.]+)(pt|px)?"/);
    if (width) return Math.round(Number(width[1]) * (width[2] === 'pt' ? 4 / 3 : 1));
  }
  return null;
}

// a data: URI's picture as a file of its own (named by its content: the same picture once for both pages)
function pictureFile(mime, base64) {
  const bytes = Buffer.from(base64, 'base64');
  const ext = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime];
  if (!ext) throw new Error(`a picture of an unknown kind: ${mime}`);
  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${ext}`;
  if (!written.has(name)) {
    if (!existsSync(`${IMAGES}/${name}`)) writeFileSync(`${IMAGES}/${name}`, bytes);
    written.add(name);
  }
  return { path: `manual/img/${name}`, width: naturalWidth(mime, bytes) };
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function build() {
for (const [lang, page] of Object.entries(PAGES)) {
  const raw = join(work, `${lang}.html`);
  execFileSync('typst', ['compile', '--features', 'html', '--format', 'html', '--root', '.', page.source, raw], { stdio: ['ignore', 'ignore', 'pipe'] });
  const html = readFileSync(raw, 'utf8');
  let body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.lastIndexOf('</body>'));
  // the pictures: files, loaded when scrolled to (the icons in the text are small: at once)
  // A button's icon in the text keeps Typst's size (0.95em); any other picture is shown at its own size, no wider
  // than the text: Typst's sizes are the paper's (100 % of a narrow column there is the whole page here).
  body = body.replace(/<img src="data:([^;"]+);base64,([^"]+)"([^>]*)>/g, (whole, mime, base64, rest, at, all) => {
    const picture = pictureFile(mime, base64);
    const src = `${page.root}${picture.path}`;
    if (all.slice(Math.max(0, at - 20), at).endsWith('<span class="ik">')) return `<img src="${src}"${rest}>`;
    return `<img src="${src}" alt=""${picture.width ? ` width="${picture.width}"` : ''} loading="lazy" decoding="async">`;
  });
  // the contents (obsah() in styl.typ): beside the text, not in it
  const toc = body.match(/<nav class="toc">[\s\S]*?<\/nav>/)?.[0] ?? '';
  body = body.replace(toc, '');
  const other = lang === 'en' ? 'cs' : 'en';
  const href = (target) => `${page.root}${PAGES[target].out.replace(/^public\//, '')}`;
  const languages = Object.keys(PAGES).map((code) => (code === lang
    ? `<a aria-current="page" lang="${code}">${code.toUpperCase()}</a>`
    : `<a href="${href(code)}" lang="${code}" hreflang="${code}">${code.toUpperCase()}</a>`)).join('');
  const out = `<!doctype html>
<!-- Made by scripts/manual-web.mjs from ${page.source} (npm run manual:web): change the Typst source, not this file. -->
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<link rel="canonical" href="${SITE}${PAGES[lang].out.replace(/^public\//, '')}">
${Object.keys(PAGES).map((code) => `<link rel="alternate" hreflang="${code}" href="${SITE}${PAGES[code].out.replace(/^public\//, '')}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${SITE}manual.html">
<link rel="icon" href="${page.root}favicon.ico" sizes="any">
<link rel="icon" href="${page.root}icons/icon.svg" type="image/svg+xml">
<style>
${CSS}
</style>
</head>
<body>
<header class="bar">
  <a class="brand" href="${page.root}./"><img src="${page.root}icons/icon.svg" alt="" width="28" height="28">olomol</a>
  <span class="what">${escape(page.heading)}</span>
  <span class="end">
    <a href="${page.root}${page.pdf}">${escape(page.pdfLabel)}</a>
    <a class="open" href="${page.root}./">${escape(page.open)}</a>
    <span class="languages" role="group" aria-label="${escape(page.language)}">${languages}</span>
  </span>
</header>
<div class="layout">
  <aside>
    <details class="contents" open>
      <summary>${escape(page.contents)}</summary>
      ${toc}
      <p class="also"><a href="${page.root}${page.quick[0]}">${escape(page.quick[1])}</a></p>
    </details>
  </aside>
  <main>
${body}
  </main>
</div>
<script>
${SCRIPT}
</script>
</body>
</html>
`;
  writeFileSync(page.out, out);
  console.log(`${page.out}: ${(out.length / 1e3).toFixed(0)} kB (from ${page.source}), link to ${href(other)}`);
}
rmSync(work, { recursive: true, force: true });
const old = readdirSync(IMAGES).filter((name) => !written.has(name));
for (const name of old) rmSync(`${IMAGES}/${name}`);
console.log(`${IMAGES}/: ${written.size} pictures${old.length ? `, ${old.length} no longer used removed` : ''}`);
}

// The page's look: the about page's colours and type (light and dark), the contents in a column on the left
// (on a phone: folded, above the text), the text no wider than reads well.
const CSS = `
  :root {
    --accent: #1035a9; --accent-2: #2e6fdb; --accent-soft: rgba(16, 53, 169, 0.08);
    --text: #1c1f26; --muted: #687082; --canvas: #f7f8fb; --panel: #ffffff; --edge: rgba(20, 25, 45, 0.1);
    --shadow: 0 10px 34px rgba(25, 30, 60, 0.08), 0 2px 6px rgba(25, 30, 60, 0.05);
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --accent: #8fb0ff; --accent-2: #6f97f5; --accent-soft: rgba(143, 176, 255, 0.12);
      --text: #e7e9f0; --muted: #a0a6b6; --canvas: #13151b; --panel: #1b1e26; --edge: rgba(255, 255, 255, 0.09);
      --shadow: 0 12px 40px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.3);
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  html { scroll-padding-top: 72px; }
  img { max-width: 100%; height: auto; }
  body { margin: 0; background: var(--canvas); color: var(--text); font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
  a { color: var(--accent); }
  .bar {
    position: sticky; top: 0; z-index: 2; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px;
    padding: 10px 20px; background: color-mix(in srgb, var(--panel) 88%, transparent); backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--edge);
  }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 19px; color: var(--text); text-decoration: none; }
  .brand img { border-radius: 7px; }
  .what { color: var(--muted); font-size: 17px; }
  .end { margin-left: auto; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; font-size: 14px; }
  .end > a { text-decoration: none; font-weight: 600; }
  .end > a:hover { text-decoration: underline; }
  .open { padding: 6px 16px; border-radius: 999px; color: #fff !important; background: linear-gradient(135deg, #1035a9, #2e6fdb); }
  .languages { display: flex; gap: 2px; padding: 2px; border-radius: 999px; background: var(--accent-soft); }
  .languages a { border-radius: 999px; padding: 2px 10px; color: var(--text); text-decoration: none; font-size: 13px; }
  .languages a[aria-current="page"] { background: var(--panel); color: var(--accent); font-weight: 650; box-shadow: 0 1px 4px rgba(25, 30, 60, 0.15); }
  .layout { display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 32px; max-width: 1180px; margin: 0 auto; padding: 0 20px; }
  .layout > aside { position: sticky; top: 64px; align-self: start; max-height: calc(100vh - 64px); overflow-y: auto; padding: 22px 4px 32px 0; font-size: 14px; }
  .contents summary { font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; cursor: pointer; list-style: none; margin-bottom: 6px; }
  .contents summary::-webkit-details-marker { display: none; }
  .toc ol { list-style: none; margin: 0; padding: 0; }
  .toc ol ol { padding-left: 14px; margin: 2px 0 8px; }
  .toc li { margin: 1px 0; }
  .toc a { display: block; padding: 2px 8px; border-radius: 6px; color: var(--text); text-decoration: none; line-height: 1.35; }
  .toc > ol > li > div a, .toc > ol > li > a { font-weight: 650; }
  .toc a:hover { background: var(--accent-soft); }
  .toc a.here { background: var(--accent-soft); color: var(--accent); }
  .toc p { margin: 0; }
  .toc .prefix { color: var(--muted); margin-right: 4px; font-variant-numeric: tabular-nums; }
  .also { margin: 12px 8px 0; }
  main { min-width: 0; max-width: 780px; padding: 22px 0 80px; }
  main h2 { font-size: 28px; line-height: 1.2; margin: 56px 0 14px; padding-top: 10px; border-top: 3px solid var(--accent); color: var(--accent); }
  main h2:first-child { margin-top: 8px; }
  main h3 { font-size: 20px; margin: 34px 0 8px; color: var(--accent); }
  main h4 { font-size: 16px; margin: 24px 0 6px; }
  main p { margin: 0 0 12px; }
  main ul, main ol { margin: 0 0 12px; padding-left: 22px; }
  main li { margin: 4px 0; }
  main li > p { margin: 0; }
  figure { margin: 18px 0 22px; text-align: center; }
  figure img { display: block; margin: 0 auto; max-width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--edge); background: #fff; }
  figcaption { margin-top: 6px; color: var(--muted); font-size: 14px; line-height: 1.45; }
  .okno img { display: block; width: 100%; height: auto; margin: 6px 0 12px; border-radius: 10px; border: 1px solid var(--edge); box-shadow: var(--shadow); }
  .ui { background: var(--accent-soft); border-radius: 4px; padding: 0 3px; font-weight: 550; }
  kbd { font: 13px ui-monospace, 'DejaVu Sans Mono', monospace; padding: 1px 5px; border-radius: 5px; border: 1px solid var(--edge); background: var(--panel); white-space: nowrap; }
  .ik img { display: inline-block !important; height: 1.15em; width: auto; vertical-align: -0.2em; padding: 1px; border-radius: 4px; border: 1px solid var(--edge); background: #fff; }
  .tip { display: block; margin: 14px 0; padding: 10px 14px; border-radius: 8px; background: var(--accent-soft); }
  .tip strong { color: var(--accent); margin-right: 6px; }
  table { border-collapse: collapse; margin: 12px 0 18px; font-size: 15px; }
  td, th { padding: 4px 10px; text-align: left; vertical-align: top; }
  tr:nth-child(even) td { background: var(--accent-soft); }
  code { font: 0.9em ui-monospace, monospace; }
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; gap: 0; }
    .layout > aside { position: static; max-height: none; padding: 14px 0 0; }
    .contents { background: var(--panel); border: 1px solid var(--edge); border-radius: 10px; padding: 10px 12px; }
    .contents summary { margin: 0; }
    main h2 { font-size: 24px; margin-top: 40px; }
  }
  @media (max-width: 560px) {
    html { scroll-padding-top: 12px; }
    .bar { position: static; padding: 8px 14px; }
    .what { display: none; }
    .end { margin-left: 0; }
  }
`;

// The contents: the section in view lit up in it; on a phone, the contents folded once a link in it is taken.
const SCRIPT = `
  const links = new Map([...document.querySelectorAll('.toc a[href^="#"]')].map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  const headings = [...document.querySelectorAll('main h2[id], main h3[id]')].filter((h) => links.has(h.id));
  let lit = null;
  const light = () => {
    const passed = headings.filter((h) => h.getBoundingClientRect().top < 120);
    const link = links.get((passed.at(-1) ?? headings[0])?.id);
    if (link === lit) return;
    lit?.classList.remove('here');
    link?.classList.add('here');
    lit = link;
    if (link && matchMedia('(min-width: 901px)').matches) link.scrollIntoView({ block: 'nearest' });
  };
  addEventListener('scroll', light, { passive: true });
  light();
  const contents = document.querySelector('.contents');
  if (matchMedia('(max-width: 900px)').matches) contents.open = false;
  contents.addEventListener('click', (e) => {
    if (e.target.closest('a[href^="#"]') && matchMedia('(max-width: 900px)').matches) contents.open = false;
  });
`;

build();
