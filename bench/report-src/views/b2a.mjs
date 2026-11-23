// B2a in the report: each template as drawn, beside a wedge drawing of PubChem's compound.
import { esc, pct, pctCi, table } from '../html.mjs';
import { compareRows, tex } from './b2common.mjs';

export const meta = {
  id: 'b2a',
  title: 'B2a · Projection templates against PubChem',
  short: 'B2a templates',
  description: "Every chair, boat, Newman, Haworth and Fischer template gives, in its SMILES and InChI, the stereoisomer of the compound it is named after (PubChem's).",
};
export const facets = [{ key: 'kind', label: 'Kind' }];
export const headline = (r) => ({ big: pct(r.summary.all), text: `of ${r.summary.all.n} templates give PubChem's stereoisomer (SMILES and InChIKey).` });
export const passFail = (r) => ({ pass: r.cases.filter((c) => c.pass).length, n: r.cases.length });

export function top(r) {
  return `<div class="panel"><h2>Results</h2>${table(['Kind', 'Templates', 'Right'], Object.entries(r.summary.byKind).map(([k, w]) => [esc(k), w.n, pctCi(w)]), { numeric: [1] })}
  <p class="small muted">Truth: ${esc(r.truth)}. olomol's answer: its SMILES and InChI export (writeAs). A case passes when the canonical SMILES (stereo included) and the InChIKey both agree.</p></div>`;
}

export function caseView(c) {
  return {
    id: c.id, status: c.status, title: `${c.name} · PubChem: ${c.pubchemName} (CID ${c.cid ?? '–'})`, smiles: c.got?.smiles || c.pubchemSmiles,
    facets: { kind: c.kind },
    reason: c.reason,
    drawings: [
      { key: c.id, label: 'as drawn (template)' },
      ...(c.expected?.smiles ? [{ key: `exp:${c.expected.smiles}`, label: 'expected', caption: "PubChem's stereoisomer, RDKit's wedges" }] : []),
    ],
    open: 0,
    compareHeads: ['PubChem', 'olomol'],
    compare: compareRows(c),
    tables: [{ columns: ['PubChem name', 'CID', 'PubChem isomeric SMILES'], rows: [[c.pubchemName, c.cid ?? '–', c.pubchemSmiles ?? '–']] }],
  };
}

export const tableRows = (r) => [`B2a templates $\\to$ stereo & all projection templates & ${r.summary.all.n} & ${tex(r.summary.all)} correct \\\\`];
