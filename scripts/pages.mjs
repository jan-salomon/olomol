// The about page and What's new, one page per language. public/about.html and public/changelog.html each
// hold all three languages (each text in an element with lang="cs", "en" or "de", as they are written and
// translated side by side); this makes a page of each for one language: English at about.html (also where a
// link without a language lands: see toLanguage), Czech at cs/about.html, German at
// de/about.html. So a search engine finds each language at an address of its own, with its own title,
// description and link preview, and the hreflang links that say which is which (one address with ?lang= was
// one page to Google, the English one). The same for changelog.html. Also sitemap.xml, from these pages.
//   node scripts/pages.mjs          after vite build (npm run build): dist/ in place
// The dev server serves the same pages from public/ (vite.config.js), so both look alike.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LANGUAGES = ['en', 'cs', 'de'];
export const PAGES = ['about.html', 'changelog.html'];
const SITE = 'https://olomol.org/';
const LOCALES = { cs: 'cs_CZ', en: 'en_GB', de: 'de_DE' };
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// a page's address in a language, from the site's root
export const pathOf = (page, lang) => (lang === 'en' ? page : `${lang}/${page}`);

// The English page (where a link without a language lands) on to the language asked for: ?lang= (as a link
// to the other page of the two keeps it), else the one picked in the app. Not by the browser's language: to
// search engines about.html is the English page (hreflang), so it shows English to whoever opens it so. Run
// in the browser, put in by splitPage in place of the page's <script data-to-language> on the English page
// only; not when the page's own script is on its way elsewhere already (window.olomolLeaving: the about page,
// to the app).
function toLanguage(page, languages) {
  if (window.olomolLeaving) return;
  const params = new URLSearchParams(location.search);
  let picked = null;
  try {
    picked = localStorage.getItem('olomol-language');
  } catch {
    // not available
  }
  const lang = [params.get('lang'), picked].find((code) => languages.includes(code));
  if (!lang || lang === 'en') return;
  params.delete('lang');
  // (?stay as it was written, not ?stay=)
  const query = [...params].map(([key, value]) => encodeURIComponent(key) + (value ? `=${encodeURIComponent(value)}` : '')).join('&');
  location.replace(`${lang}/${location.pathname.split('/').pop() || page}${query ? `?${query}` : ''}${location.hash}`);
}
const toLanguageScript = (page) => `<script>\n(${toLanguage})(${JSON.stringify(page)}, ${JSON.stringify(LANGUAGES)});\n</script>`;

// The page's tags, comments, scripts and styles, in order: { start, end, kind: 'open' | 'close' | 'raw', name, tag }
// (attribute values may hold ">"; a script's or style's text is one 'raw' piece, never read as tags)
function tokens(html) {
  const found = [];
  const pattern = /<!--[\s\S]*?-->|<(script|style)\b(?:"[^"]*"|'[^']*'|[^>"'])*>[\s\S]*?<\/\1\s*>|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  for (const m of html.matchAll(pattern)) {
    const start = m.index;
    const end = start + m[0].length;
    if (m[0].startsWith('<!--') || m[1]) found.push({ start, end, kind: 'raw', tag: m[0] });
    else found.push({ start, end, kind: m[2] ? 'close' : 'open', name: m[3].toLowerCase(), tag: m[0] });
  }
  return found;
}
const langOf = (tag) => tag.match(/\slang="([a-z]{2})"/)?.[1] ?? null;

// The page without the other languages' elements (an element with lang="xx" and everything in it; <html>'s
// own lang excepted)
function keepLanguage(html, lang) {
  const all = tokens(html);
  const cut = [];
  for (let i = 0; i < all.length; i++) {
    const token = all[i];
    if (token.kind !== 'open' || token.name === 'html') continue;
    const code = langOf(token.tag);
    if (!code || code === lang) continue;
    if (VOID.has(token.name)) {
      cut.push([token.start, token.end]);
      continue;
    }
    let depth = 1;
    let j = i + 1;
    for (; j < all.length; j++) {
      if (all[j].name !== token.name) continue;
      if (all[j].kind === 'open') depth++;
      else if (all[j].kind === 'close' && --depth === 0) break;
    }
    if (j === all.length) throw new Error(`pages: no end to ${token.tag} at ${token.start}`);
    cut.push([token.start, all[j].end]);
    i = j;
  }
  let out = '';
  let at = 0;
  for (const [start, end] of cut) {
    out += html.slice(at, start);
    at = end;
  }
  return out + html.slice(at);
}

// Each tag's attributes rewritten by edit(name, value) (not in scripts, styles or comments)
function editAttributes(html, names, edit) {
  let out = '';
  let at = 0;
  for (const token of tokens(html)) {
    if (token.kind !== 'open') continue;
    const tag = token.tag.replace(/(\s)([\w:-]+)="([^"]*)"/g, (whole, space, name, value) =>
      names.includes(name) ? `${space}${name}="${edit(name, value, token)}"` : whole);
    out += html.slice(at, token.start) + tag;
    at = token.end;
  }
  return out + html.slice(at);
}

// HTML's character references as the characters (&amp;, &nbsp;, &#8211;, &#x2013;); one not known here stops the
// build, so that it never reaches a search engine as written (`page`: for the message)
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', thinsp: ' ', shy: '' };
function decodeEntities(text, page) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    if (!(name in ENTITIES)) throw new Error(`pages: ${page} has ${whole}, unknown to decodeEntities`);
    return ENTITIES[name];
  });
}

const metaContent = (html, attr, name) =>
  html.match(new RegExp(`<meta ${attr}="${name}"[^>]*content="([^"]*)"`))?.[1] ?? null;

// The page in one language. version, released: package.json's version and its release date (for the JSON-LD)
export function splitPage(html, page, lang, { version = '', released = '' } = {}) {
  const root = lang === 'en' ? '' : '../';
  let out = keepLanguage(html, lang);
  const left = tokens(out).filter((token) => token.kind === 'open' && token.name !== 'html' && langOf(token.tag) && langOf(token.tag) !== lang);
  if (left.length) throw new Error(`pages: ${page} (${lang}) still has ${left[0].tag}`);

  // <html>: the language, and the way back to the site's root for the page's scripts
  out = out.replace(/<html\b[^>]*>/, `<html lang="${lang}" data-root="${root || './'}">`);
  // the title: the page's own in this language (<title lang="…">, as search results show it), else the link
  // preview's (og:title), which is in each language
  if (!/<title\s+lang="/.test(out)) {
    const title = metaContent(out, 'property', 'og:title');
    if (title) out = out.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  }
  // this page's own address, the other languages' (hreflang; x-default: where a link without one lands)
  const own = SITE + pathOf(page, lang);
  const alternates = [...LANGUAGES.map((code) => `<link rel="alternate" hreflang="${code}" href="${SITE + pathOf(page, code)}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE + page}">`].join('\n');
  out = out.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${own}">\n${alternates}`);
  out = out.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${own}">`);
  out = out.replace(/<meta property="og:locale(?::alternate)?"[^>]*>\n?/g, '');
  const locales = [`<meta property="og:locale" content="${LOCALES[lang]}">`,
    ...LANGUAGES.filter((code) => code !== lang).map((code) => `<meta property="og:locale:alternate" content="${LOCALES[code]}">`)].join('\n');
  out = out.replace(/(<meta property="og:url"[^>]*>)/, `$1\n${locales}`);
  // the JSON-LD (the about page): this version
  out = out.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (whole, open, json, close) => {
    const data = JSON.parse(json);
    if (version) data.softwareVersion = version;
    if (released) data.dateModified = released;
    return `${open}\n${JSON.stringify(data, null, 2)}\n${close}`;
  });
  // the questions (the about page's <section id="faq">: an <h3> each, its answer all up to the next one, in one
  // or more paragraphs) also as FAQPage JSON-LD, as plain text
  const faq = out.match(/<section id="faq">([\s\S]*?)<\/section>/)?.[1];
  if (faq) {
    // (a paragraph's or line's end a space, any other tag nothing: CO<sub>2</sub> is CO2)
    const text = (part) => decodeEntities(part.replace(/<\/?(?:p|br|li|ul|ol|div)\b[^>]*>/g, ' ').replace(/<[^>]+>/g, ''), page).replace(/[ \t\r\n]+/g, ' ').trim(); // (a no-break space kept)
    const questions = [...faq.matchAll(/<h3>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3>|$)/g)]
      .map(([, question, answer]) => ({ '@type': 'Question', name: text(question), acceptedAnswer: { '@type': 'Answer', text: text(answer) } }));
    if (!questions.length) throw new Error(`pages: ${page} (${lang}) has a section id="faq" without questions`);
    const data = { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang, mainEntity: questions };
    out = out.replace('</head>', `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>\n</head>`);
  }

  // the dates (What's new: data-date) in the page's language
  const dates = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  out = out.replace(/(<span class="date" data-date="(\d{4}-\d{2}-\d{2})">)[^<]*(<\/span>)/g,
    (whole, open, date, close) => `${open}${dates.format(new Date(`${date}T12:00Z`))}${close}`);

  // the links: the language links (href="?lang=cs") to that language's page, the own one marked;
  // the rest, from cs/ and de/, one folder up
  out = editAttributes(out, ['href', 'src', 'poster'], (name, value, token) => {
    const to = value.match(/^\?lang=([a-z]{2})$/)?.[1];
    // (to English with ?lang=en: without it, about.html goes on to the browser's language)
    if (name === 'href' && to) return root + pathOf(page, to) + (to === 'en' ? '?lang=en' : '');
    if (/^(?:[a-z][\w+.-]*:|#|\/|\?)/i.test(value)) return value;
    // the other split page: the same language's, in the same folder (English with ?lang=en, as above)
    const [, path, rest] = value.match(/^([^?#]*)(.*)$/);
    if (PAGES.includes(path)) return lang === 'en' && !rest.startsWith('?') ? `${path}?lang=en${rest}` : value;
    if (!root) return value;
    return root + value.replace(/^\.\//, ''); // (./, the app, from cs/: ../)
  });
  out = out.replace(/(<a\b[^>]*\bhref="[^"]*"[^>]*\bdata-lang="([a-z]{2})")/g, (whole, tag, code) => (code === lang ? `${tag} aria-current="page"` : whole));
  // the English page on to the language asked for (toLanguage); the others are theirs already
  const place = /<script data-to-language><\/script>/;
  if (!place.test(out)) throw new Error(`pages: ${page} has no <script data-to-language></script>`);
  out = out.replace(place, lang === 'en' ? toLanguageScript(page) : '');
  return out;
}

// this version's release date, as What's new gives it (its section's data-date; none for a development version)
export function releaseDate(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return changelog.match(new RegExp(`<section id="v${escaped}">\\s*<h2>[^<]*<span class="date" data-date="(\\d{4}-\\d{2}-\\d{2})"`))?.[1] ?? '';
}

// When a file last changed, by git (for sitemap.xml's lastmod); today without git or if it is new
function changed(file) {
  try {
    return execSync(`git log -1 --format=%cs -- "${file}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || today();
  } catch {
    return today();
  }
}
const today = () => new Date().toISOString().slice(0, 10);

function sitemap() {
  const url = (loc, lastmod, alternates = '') => `  <url>\n    <loc>${SITE + loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n${alternates}  </url>`;
  const entries = [url('', changed('src'))];
  for (const page of PAGES) {
    const lastmod = changed(`public/${page}`);
    const alternates = LANGUAGES.map((code) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${SITE + pathOf(page, code)}"/>\n`).join('')
      + `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE + page}"/>\n`;
    for (const code of LANGUAGES) entries.push(url(pathOf(page, code), lastmod, alternates));
  }
  // the manual on the web, in English and Czech (scripts/manual-web.mjs; German: the English one)
  const manuals = { en: 'manual.html', cs: 'cs/manual.html' };
  const manualAlternates = Object.entries(manuals).map(([code, loc]) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${SITE + loc}"/>\n`).join('')
    + `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}manual.html"/>\n`;
  for (const loc of Object.values(manuals)) entries.push(url(loc, changed(`public/${loc}`), manualAlternates));
  for (const pdf of ['docs/manual.pdf', 'docs/rychly-start.pdf', 'docs/en/manual.pdf', 'docs/en/quick-start.pdf']) entries.push(url(pdf, changed(pdf)));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- olomol's pages for search engines (robots.txt points here), written by scripts/pages.mjs -->\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

// after the build: dist/about.html (as Vite copied it from public/) into its three pages, and so on
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const released = releaseDate(readFileSync('public/changelog.html', 'utf8'), version);
  for (const page of PAGES) {
    const source = readFileSync(`public/${page}`, 'utf8');
    for (const lang of LANGUAGES) {
      const file = `dist/${pathOf(page, lang)}`;
      if (lang !== 'en' && !existsSync(`dist/${lang}`)) mkdirSync(`dist/${lang}`);
      writeFileSync(file, splitPage(source, page, lang, { version, released }));
    }
  }
  writeFileSync('dist/sitemap.xml', sitemap());
  console.log(`olomol: ${PAGES.join(', ')} in ${LANGUAGES.join(', ')}, and sitemap.xml`);
}
