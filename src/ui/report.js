// What a problem report needs to say about the app and the computer: the
// version, the browser and system, the window, whether it is installed,
// and (if wanted) a link that holds the drawing. Nothing is sent: the
// e-mail link fills in the table (but the drawing's link, too long for one),
// and the user sends the e-mail from their own program.
import { language, t } from '../i18n/i18n.js';
import { linkTo } from '../io/link.js';
import { isEmpty } from '../model/doc.js';

export const REPORT_ADDRESS = 'bugs@olomol.org';
export const VERSION = `${__APP_VERSION__} (${[__BUILD_DATE__, __COMMIT__].filter(Boolean).join(', ')})`;
// The about page and What's new in the app's language: a page of each per language (scripts/pages.mjs),
// cs/… and de/…; the English one with ?lang=en, so it stays English whatever language was picked before
const pageIn = (page, query = '') => (['cs', 'de'].includes(language)
  ? `${language}/${page}${query ? `?${query}` : ''}`
  : `${page}?lang=en${query ? `&${query}` : ''}`);
// The quick start and the manual: the manual on the web (manual.html, cs/manual.html: scripts/manual-web.mjs, the
// same text as its PDF), the PDFs for printing; Czech in the Czech app, English otherwise (there is no German one)
export const DOCS = language === 'cs'
  ? { quickStart: 'docs/rychly-start.pdf', manual: 'cs/manual.html', manualPdf: 'docs/manual.pdf' }
  : { quickStart: 'docs/en/quick-start.pdf', manual: 'manual.html', manualPdf: 'docs/en/manual.pdf' };
// What's new at this version's entry
export const WHATS_NEW = `${pageIn('changelog.html')}#v${__APP_VERSION__.replace(/-.*/, '')}`;
// the about page (?stay: not on to the app, as a kept link of someone who has used it would go)
export const ABOUT_PAGE = pageIn('about.html', 'stay');
// the day this version was released (What's new's date; null for a development version), as the language writes it
export const RELEASED = __RELEASE_DATE__ ? new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(`${__RELEASE_DATE__}T12:00`)) : null;
// How to cite this version: olomol's concept DOI on Zenodo (of all versions; vite.config.js) and this version's
// number; null for a development version, which has no release date
export const DOI = __RELEASE_DATE__ && __DOI__ ? __DOI__ : null;
export const CITATION = DOI
  ? `Salomon, J. (${__RELEASE_DATE__.slice(0, 4)}). olomol: drawing chemical structures, reactions and mechanisms (Version ${__APP_VERSION__}) [Computer software]. Zenodo. https://doi.org/${DOI}`
  : null;
// The same citation for reference managers: [{ id, label, ext, mime, text }] (none for a development version).
// BibTeX as @misc, which BibTeX and BibLaTeX both read; RIS for Zotero, Mendeley, EndNote and Citavi; CSL JSON
// for Zotero, Pandoc and Markdown.
export const CITATIONS = (() => {
  if (!DOI) return [];
  const [year, month, day] = __RELEASE_DATE__.split('-');
  const title = 'olomol: drawing chemical structures, reactions and mechanisms';
  const url = `https://doi.org/${DOI}`;
  const bibtex = [
    `@misc{salomon_olomol_${year},`,
    '  author       = {Salomon, Jan},',
    `  title        = {{olomol}: drawing chemical structures, reactions and mechanisms},`,
    `  version      = {${__APP_VERSION__}},`,
    `  year         = {${year}},`,
    `  month        = ${['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][Number(month) - 1]},`,
    '  publisher    = {Zenodo},',
    `  doi          = {${DOI}},`,
    `  url          = {${url}},`,
    `  note         = {Computer software, version ${__APP_VERSION__}},`,
    '}',
    '',
  ].join('\n');
  const ris = [
    'TY  - COMP', 'AU  - Salomon, Jan', `TI  - ${title}`, `PY  - ${year}`, `DA  - ${year}/${month}/${day}`, `ET  - ${__APP_VERSION__}`,
    'PB  - Zenodo', `DO  - ${DOI}`, `UR  - ${url}`, 'ER  - ', '',
  ].join('\r\n');
  const csl = JSON.stringify([{
    id: `salomon_olomol_${year}`, type: 'software', title, author: [{ family: 'Salomon', given: 'Jan' }],
    issued: { 'date-parts': [[Number(year), Number(month), Number(day)]] }, version: __APP_VERSION__, publisher: 'Zenodo', DOI, URL: url,
  }], null, 2);
  return [
    { id: 'text', label: 'Text', ext: 'txt', mime: 'text/plain', text: CITATION },
    { id: 'bibtex', label: 'BibTeX', ext: 'bib', mime: 'application/x-bibtex', text: bibtex },
    { id: 'ris', label: 'RIS', ext: 'ris', mime: 'application/x-research-info-systems', text: ris },
    { id: 'csl', label: 'CSL JSON', ext: 'json', mime: 'application/vnd.citationstyles.csl+json', text: csl },
  ];
})();

// "Chrome 141", "Firefox 145", "Edge 141", "Safari 18", from the user agent.
function browser() {
  const ua = navigator.userAgent;
  for (const [name, pattern] of [['Edge', /Edg\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Firefox', /Firefox\/(\d+)/], ['Chrome', /Chrome\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/]]) {
    const found = pattern.exec(ua);
    if (found) return `${name} ${found[1]}`;
  }
  return ua;
}

function system() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return navigator.platform || '?';
}

// The rows of the table: [[name, value]]; `drawing`: with a link to the drawing.
export async function reportRows(ed, { drawing = true } = {}) {
  const yes = (on) => (on ? t('yes') : t('no'));
  const rows = [
    [t('Version'), VERSION],
    [t('Browser'), browser()],
    [t('System'), system()],
    [t('Language'), `${language} (${t('browser')}: ${navigator.language})`],
    [t('Window'), `${window.innerWidth} × ${window.innerHeight} px, ${t('pixel ratio')} ${window.devicePixelRatio}`],
    [t('Installed as an app'), yes(matchMedia('(display-mode: standalone)').matches)],
    [t('Offline copy'), yes(Boolean(navigator.serviceWorker?.controller))],
    ['User agent', navigator.userAgent],
  ];
  if (drawing && !isEmpty(ed.doc)) rows.push([t('Drawing'), await linkTo(ed.doc, { settings: ed.settings, title: ed.title })]);
  return rows;
}

// The table on the clipboard: as a table for e-mail programs that take
// one, as "name: value" lines for the rest.
export async function copyRows(rows) {
  const text = rows.map(([name, value]) => `${name}: ${value}`).join('\n');
  const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<table>${rows.map(([name, value]) => `<tr><td>${escape(name)}</td><td>${escape(value)}</td></tr>`).join('')}</table>`;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

// A mailto: link with a subject, the questions to answer and the table
// (`rows`, as "name: value" lines). The drawing's link is left out: mail
// programs cut links to e-mails after a few thousand characters, so it is
// copied and pasted instead.
export function mailLink(rows = []) {
  const drawing = t('Drawing');
  const lines = rows.filter(([name]) => name !== drawing).map(([name, value]) => `${name}: ${value}`);
  const withDrawing = rows.some(([name]) => name === drawing);
  const body = [t('What I did:'), '', t('What happened, and what I expected:'), '', '', '---', ...lines,
    ...(withDrawing ? ['', t('(The link to the drawing is too long for this e-mail: click Copy the table in olomol and paste it here.)')] : [])].join('\n');
  return `mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(`olomol ${__APP_VERSION__}: `)}&body=${encodeURIComponent(body)}`;
}
