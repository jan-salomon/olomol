// B2b in the report: each generated drawing beside a wedge drawing of the truth, and after its ring flip.
import { esc, pctCi, table } from '../html.mjs';
import { compareRows, tex } from './b2common.mjs';

export const meta = {
  id: 'b2b',
  title: 'B2b · Generated chairs and Newman projections',
  short: 'B2b chairs and Newman',
  description: 'Substituted cyclohexane chairs (both chairs, mirrored), the D-aldohexopyranoses, Newman projections of ethanes with two stereocentres and of cyclohexane give the stereoisomer drawn; a ring flip keeps it, and so does turning a wedge drawing into a chair.',
};
export const facets = [
  { key: 'part', label: 'Part' },
  { key: 'pattern', label: 'Pattern' },
  { key: 'sub', label: 'Substituent' },
  { key: 'chair', label: 'Chair' },
  { key: 'flip', label: 'Ring flip' },
];
export const headline = (r) => {
  const s = r.summary;
  return { big: pctCi(s.all).split(' <')[0], text: `of ${s.all.n.toLocaleString('en')} drawings give the stereoisomer drawn: ${s.chairs.k}/${s.chairs.n} chairs, ${s.sugars.k}/${s.sugars.n} sugars, ${s.newman.k}/${s.newman.n} Newman projections, ${s.cyclohexaneNewman.k}/${s.cyclohexaneNewman.n} cyclohexane Newman, ${s.toChair.k}/${s.toChair.n} wedge drawings turned into chairs; ring flips keep it in ${s.ringFlipKept.k}/${s.ringFlipKept.n}.` };
};
export const passFail = (r) => ({ pass: r.cases.filter((c) => c.pass).length, n: r.cases.length });

export function top(r) {
  const s = r.summary;
  const rows = [
    ['Chairs (5,000 of every 1,1- … 1,3,5-pattern × Me, OH, Cl, tBu, CO2H × faces × chair × mirror; seed ' + r.seed + ')', s.chairs],
    ...Object.entries(s.chairsByPattern).map(([p, w]) => [`&nbsp;&nbsp;pattern ${p}`, w]),
    ...Object.entries(s.chairsBySubstituent).map(([p, w]) => [`&nbsp;&nbsp;with ${p}`, w]),
    ...Object.entries(s.chairsByChair).map(([p, w]) => [`&nbsp;&nbsp;chair ${p}`, w]),
    ['D-aldohexopyranoses, α and β, both chairs, mirrored', s.sugars],
    ['Newman projections (5 ethanes × 36 group orders × 6 dihedrals)', s.newman],
    ...Object.entries(s.newmanByMolecule).map(([p, w]) => [`&nbsp;&nbsp;${esc(p)}`, w]),
    ['Cyclohexane seen along C1–C2 and C5–C4', s.cyclohexaneNewman],
    ['Ring flip keeps olomol\'s SMILES (chairs and sugars)', s.ringFlipKept],
    ['Ring flip gives the truth', s.ringFlipRight],
    ['toChair: a wedge drawing turned into a chair keeps its SMILES', s.toChair],
  ];
  const b = s.builderCheck;
  return `<div class="panel"><h2>Results</h2>${table(['Set', 'Right (95 % CI; k/n)'], rows.map(([name, w]) => [name, pctCi(w)]))}
  <p class="small muted">Ring flips refused: ${s.ringFlipRefused}. Truth: ${esc(r.truth)}</p>
  <h3>Is the truth itself right?</h3>
  <p class="small">The 3D builder gives PubChem's stereoisomer for ${b.filter((x) => x.agree).length} of ${b.length} D-aldohexopyranoses (drawn in chair A, unmirrored). And it tells mirror images apart: of ${s.mirrorPairs.pairs} chairs and their mirror images, the truth differs for ${s.mirrorPairs.truthDiffers} (the chiral ones; the rest are achiral or meso), and olomol's answers differ in ${s.mirrorPairs.olomolDiffersToo} of these.</p>
  ${table(['Sugar', 'PubChem CID', 'builder', 'PubChem', 'agree'], b.map((x) => [esc(x.name), x.cid ?? '–', `<code>${esc(x.builder)}</code>`, `<code>${esc(x.pubchem ?? '–')}</code>`, x.agree ? 'yes' : '<b style="color:var(--fail)">no</b>']))}</div>`;
}

const FACE = (f) => (f > 0 ? 'up' : 'down');
export function caseView(c) {
  const view = {
    id: c.id, status: c.status, smiles: c.expected?.smiles,
    title: c.part === 'newman' ? `${c.molecule}, dihedral ${c.dihedral}°` : c.part === 'sugar' ? `${c.anomer}-D-${c.sugar}opyranose`.replace('oopyranose', 'opyranose') : c.part === 'toChair' ? c.smiles : c.part === 'cyNewman' ? 'cyclohexane, Newman' : `${c.pattern}-${c.subs.join(', ')}`,
    facets: { part: c.part, pattern: c.pattern, sub: c.subs ?? [], chair: c.chair ? `${c.chair}${c.mirror ? ' mirrored' : ''}` : '', flip: c.flip ? (c.flip.error ? 'refused' : c.flip.kept ? 'kept' : 'changed') : '' },
    reason: c.reason,
    drawings: [],
    open: 0,
    compareHeads: ['truth', 'olomol'],
    compare: compareRows(c),
    tables: [],
  };
  if (c.part === 'toChair') {
    view.drawings.push({ key: `${c.id}:wedges`, label: 'wedge drawing (RDKit)', caption: 'given to toChair' });
    view.drawings.push({ key: c.id, label: 'as a chair', caption: 'by ringToChair' });
    view.open = 1;
  } else {
    view.drawings.push({ key: c.id, label: 'as drawn' });
  }
  if (c.expected?.smiles) view.drawings.push({ key: `exp:${c.expected.smiles}`, label: 'expected', caption: 'the truth, RDKit\'s wedges' });
  if (c.flip && !c.flip.error) {
    view.drawings.push({ key: `${c.id}:flipped`, label: 'after the ring flip', caption: c.flip.kept ? 'same SMILES' : 'SMILES changed', classes: c.flip.kept ? [] : ['red'] });
    view.compare.push({ label: 'after ring flip', expected: c.expected?.smiles ?? '–', got: c.flip.smiles ?? '–' });
  } else if (c.flip?.error) view.notes = esc(c.flip.error);
  if (c.part === 'chair' || c.part === 'sugar') {
    const positions = c.part === 'sugar' ? ['C4', 'C5', 'C1', 'C2', 'C3'] : c.pattern.split(',').map((p) => `C${p}`);
    view.tables.push({ title: 'Specification', columns: ['position', 'group', 'face', 'drawn'], rows: c.subs.map((s, i) => [positions[i], s, FACE(c.faces[i]), c.slots[i]]) });
  }
  if (c.part === 'newman') view.tables.push({ title: 'Specification', columns: ['', 'groups, from the top clockwise'], rows: [['front', c.front.join(', ')], ['back', c.back.join(', ')]] });
  if (c.part === 'cyNewman') view.tables.push({ title: 'Specification', columns: ['carbon', 'slot', 'group'], rows: c.groups });
  return view;
}

export function tableRows(r) {
  const s = r.summary;
  return [
    `B2b generated projections & chairs (5 substituents, 7 patterns) & ${s.chairs.n} & ${tex(s.chairs, 2)} correct \\\\`,
    ` & D-aldohexopyranose chairs & ${s.sugars.n} & ${tex(s.sugars)} correct \\\\`,
    ` & Newman projections & ${s.newman.n + s.cyclohexaneNewman.n} & ${tex({ k: s.newman.k + s.cyclohexaneNewman.k, n: s.newman.n + s.cyclohexaneNewman.n, ...wil(s.newman.k + s.cyclohexaneNewman.k, s.newman.n + s.cyclohexaneNewman.n) }, 2)} correct \\\\`,
    ` & ring flip keeps stereo & ${s.ringFlipKept.n} & ${tex(s.ringFlipKept, 2)} \\\\`,
    ` & wedges $\\to$ chair & ${s.toChair.n} & ${tex(s.toChair, 2)} \\\\`,
  ];
}
import { wilson as wil } from '../../lib/stats.mjs';
