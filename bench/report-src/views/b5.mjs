// B5 in the report: the drawing, its 3D model as Turn in 3D builds it (seen from the front, as projected), and
// the torsions drawn against those in 3D.
import { esc, pctCi, num, table } from '../html.mjs';
import { tex } from './b2common.mjs';
// (Turn in 3D's first view of a model, used here only to show it the way the app does; nothing is judged on it)
const { views } = await import('../../../src/layout/threeD.js');

export const meta = {
  id: 'b5',
  title: 'B5 · The conformation drawn kept in 3D',
  short: 'B5 conformation in 3D',
  description: "Turn in 3D's model keeps a chair's groups axial or equatorial as drawn, a Newman projection's dihedral, a diene's s-cis or s-trans, and R/S and E/Z.",
};
export const facets = [{ key: 'part', label: 'Part' }, { key: 'problem', label: 'Problem' }];
export const headline = (r) => {
  const s = r.summary;
  return { big: pctCi(s.all).split(' <')[0], text: `of ${s.all.n} models keep what was drawn: groups on their drawn side in ${s.sidesKept.k}/${s.sidesKept.n}, Newman dihedral within ${s.tolerance}° in ${s.newmanKept.k}/${s.newmanKept.n} (median error ${num(s.newmanError.median)}°), s-cis/s-trans in ${s.dieneKept.k}/${s.dieneKept.n}, R/S and E/Z in ${s.stereoKept.k}/${s.stereoKept.n}; median ${Math.round(s.ms.median)} ms a model.` };
};
export const passFail = (r) => ({ pass: r.cases.filter((c) => c.pass).length, n: r.cases.length });

const PART = { chair: 'chairs (B2b)', sugar: 'sugars (B2b)', newman: 'Newman (B2b)', cyNewman: 'cyclohexane Newman (B2b)', diene: 'dienes and enones' };
export function top(r) {
  const s = r.summary;
  const rows = [
    ['Every check passed', pctCi(s.all)],
    ['Groups on their drawn side (axial/equatorial)', pctCi(s.sidesKept)],
    ...Object.entries(s.sidesKeptByPart).map(([p, w]) => [`&nbsp;&nbsp;${esc(PART[p])}`, pctCi(w)]),
    [`Newman dihedral within ${s.tolerance}°`, `${pctCi(s.newmanKept)}; error median ${num(s.newmanError.median)}°, max ${num(s.newmanError.max)}°`],
    ['s-cis / s-trans kept', `${pctCi(s.dieneKept)}; s-cis ${pctCi(s.dieneByDrawn['s-cis'])}, s-trans ${pctCi(s.dieneByDrawn['s-trans'])}; torsion off planar: median ${num(s.dieneError.median)}°, max ${num(s.dieneError.max)}°`],
    ['R/S and E/Z kept', pctCi(s.stereoKept)],
    ['Conformation reported lost by olomol', s.conformationLost],
    ['No model', s.noModel],
    ['Time per model (Chrome, workers)', `median ${Math.round(s.ms.median)} ms, 95th percentile ${Math.round(s.ms.p95)} ms, max ${Math.round(s.ms.max)} ms`],
  ];
  return `<div class="panel"><h2>Results</h2>${table(['', ''], rows)}
  <p class="small muted">${esc(r.truth)} A group counts as axial in 3D when its torsion to the ring (X–C1–C2–C3) is under 120° in size, equatorial when over; a ring as a chair when its six torsions alternate in sign and lie between 30° and 85°. Sample (seed ${r.seed}): 350 B2b chairs with Me, OH and Cl, all 64 sugars, 100 Newman projections (the ethanes without labels), 50 cyclohexane Newman projections, 25 dienes and enones each drawn s-cis and s-trans.</p></div>`;
}

export function caseView(c, drawings) {
  const view = {
    id: c.id, status: c.status, title: PART[c.part], smiles: c.stereo?.expected,
    facets: { part: PART[c.part], problem: c.pass ? '' : c.reason.split(';').map((x) => x.trim().replace(/[\d.−-]+°/g, '…').replace(/ on ring atom \d/, '').replace(/^(Me|OH|Cl|CH2OH) /, '')) },
    reason: c.reason,
    drawings: [{ key: c.id, label: 'as drawn' }],
    open: 0,
    compareHeads: ['drawn', '3D model'],
    compare: c.stereo ? [{ label: 'R/S and E/Z (SMILES)', expected: c.stereo.expected, got: c.stereo.got }] : [],
    tables: [],
  };
  const drawing = drawings[c.id];
  if (drawing && c.model) {
    // the model as Turn in 3D first shows it: its clearest view (views() in src/layout/threeD.js, as Turn3D.jsx
    // calls it), each atom where that view has it, bonds with their depth so that the one behind is broken
    const copy = structuredClone(drawing);
    const index = new Map(c.modelAtoms.map((id, i) => [id, i]));
    const pairs = drawing.bonds.filter((b) => index.has(b.a) && index.has(b.b)).map((b) => [index.get(b.a), index.get(b.b)]);
    const elements = new Map(drawing.atoms.map((a) => [a.id, a.el]));
    const [clearest] = views(c.model, pairs, { axes: true, count: 1, labelled: c.modelAtoms.map((id) => elements.get(id) !== 'C') });
    const at = new Map(c.modelAtoms.map((id, i) => [id, clearest.points3[i]]));
    for (const a of copy.atoms) if (at.has(a.id)) Object.assign(a, { x: at.get(a.id)[0], y: -at.get(a.id)[1] });
    for (const b of copy.bonds) {
      if (at.has(b.a) && at.has(b.b)) b.z = (at.get(b.a)[2] + at.get(b.b)[2]) / 2;
      delete b.stereo;
      delete b.newman;
    }
    view.extraDrawings = { [`${c.id}:3d`]: copy };
    view.drawings.push({ key: `${c.id}:3d`, label: '3D model', caption: "as Turn in 3D first shows it", classes: c.pass ? [] : ['red'] });
  }
  if (c.torsions?.length) view.tables.push({ title: 'Torsions', columns: ['', 'drawn', '3D model', 'torsion in 3D'], rows: c.torsions.map((t) => [t.what, t.drawn, t.model, `${t.degrees}°`]), bad: c.torsions.flatMap((t, i) => (t.ok ? [] : [i])) });
  if (c.ringTorsions) view.tables.push({ title: 'Ring torsions in 3D', columns: c.ringTorsions.map((_, k) => [0, 1, 2, 3].map((d) => ((k + d) % 6) + 1).join('-')), rows: [c.ringTorsions.map((t) => `${t.toFixed(0)}°`)], bad: c.isChair ? [] : [0] });
  if (c.dihedralError !== undefined) view.notes = `Dihedral error ${c.dihedralError}°. Model in ${c.ms} ms${c.conformationLost ? '; olomol says the drawn conformation was not found' : ''}.`;
  else view.notes = `Model in ${c.ms} ms${c.conformationLost ? '; olomol says the drawn conformation was not found' : ''}.`;
  return view;
}

export function tableRows(r) {
  const s = r.summary;
  return [
    `B5 conformation in 3D & chairs, sugars, cyclohexane Newman & ${s.sidesKept.n} & ${tex(s.sidesKept)} groups on drawn side \\\\`,
    ` & Newman projections & ${s.newmanKept.n} & ${tex(s.newmanKept)} within ${s.tolerance}\\textdegree; median error ${num(s.newmanError.median)}\\textdegree \\\\`,
    ` & dienes, enones (s-cis/s-trans) & ${s.dieneKept.n} & ${tex(s.dieneKept)} kept \\\\`,
    ` & all models & ${s.stereoKept.n} & ${tex(s.stereoKept)} R/S, E/Z kept; ${Math.round(s.ms.median)} ms median \\\\`,
  ];
}
