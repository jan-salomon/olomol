// How to cite olomol: its concept DOI on Zenodo (of all versions, package.json's conceptDoi, so that citations of
// every version add up under one DOI) with the version used named beside it. For the about page (scripts/pages.mjs
// writes it into its How to cite section) and the app (ui/report.js). In English: a citation is the same in any
// language. A version without a release date (0.6.0-dev) has none: then the citation names no version, as
// text only.
//   citationOf({ version, released: '2026-11-22' | '', doi }) → { text, formats: [{ id, label, ext, mime, text }] }
const TITLE = 'olomol: drawing chemical structures, reactions and mechanisms';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function citationOf({ version, released, doi }) {
  if (!doi) return null;
  const url = `https://doi.org/${doi}`;
  if (!released) return { text: `Salomon, J. ${TITLE} [Computer software]. Zenodo. ${url}`, formats: [] };
  const [year, month, day] = released.split('-');
  const text = `Salomon, J. (${year}). ${TITLE} (Version ${version}) [Computer software]. Zenodo. ${url}`;
  // BibTeX as @misc, which BibTeX and BibLaTeX both read; RIS for Zotero, Mendeley, EndNote and Citavi; CSL JSON
  // for Zotero, Pandoc and Markdown
  const bibtex = [
    `@misc{salomon_olomol_${year},`,
    '  author       = {Salomon, Jan},',
    '  title        = {{olomol}: drawing chemical structures, reactions and mechanisms},',
    `  version      = {${version}},`,
    `  year         = {${year}},`,
    `  month        = ${MONTHS[Number(month) - 1]},`,
    '  publisher    = {Zenodo},',
    `  doi          = {${doi}},`,
    `  url          = {${url}},`,
    `  note         = {Computer software, version ${version}},`,
    '}',
    '',
  ].join('\n');
  const ris = [
    'TY  - COMP', 'AU  - Salomon, Jan', `TI  - ${TITLE}`, `PY  - ${year}`, `DA  - ${year}/${month}/${day}`, `ET  - ${version}`,
    'PB  - Zenodo', `DO  - ${doi}`, `UR  - ${url}`, 'ER  - ', '',
  ].join('\r\n');
  const csl = JSON.stringify([{
    id: `salomon_olomol_${year}`, type: 'software', title: TITLE, author: [{ family: 'Salomon', given: 'Jan' }],
    issued: { 'date-parts': [[Number(year), Number(month), Number(day)]] }, version, publisher: 'Zenodo', DOI: doi, URL: url,
  }], null, 2);
  return {
    text,
    formats: [
      { id: 'text', label: 'Text', ext: 'txt', mime: 'text/plain', text },
      { id: 'bibtex', label: 'BibTeX', ext: 'bib', mime: 'application/x-bibtex', text: bibtex },
      { id: 'ris', label: 'RIS', ext: 'ris', mime: 'application/x-research-info-systems', text: ris },
      { id: 'csl', label: 'CSL JSON', ext: 'json', mime: 'application/vnd.citationstyles.csl+json', text: csl },
    ],
  };
}
