// B5: the conformation drawn survives into 3D. Turn in 3D's model of a chair keeps each group axial or
// equatorial as drawn; of a Newman projection its dihedral; of a diene or enone its s-cis or s-trans; and
// every model keeps R/S and E/Z.
//
// The model is the app's own: each drawing is pasted into the built app (Chrome, ?test) and
// window.olomolTest.model3D() gives the 3D points Turn in 3D shows (relayout.js model3D: conformers in
// Web Workers, which Node has not). Everything measured on the points is our own code: torsion angles,
// and R/S and E/Z by RDKit from a 3D molfile we write. The truth is the specification drawn, not
// olomol's reading of it. Usage: npm run bench:b5 [-- --no-build]
import { writeFileSync } from 'node:fs';
import { putDrawing, startApp } from './lib/app.mjs';
import { docToJSON } from './lib/docjson.mjs';
import { chairDrawing, PATTERNS } from './lib/drawings.mjs';
import { environment } from './lib/env.mjs';
import { rdkit, src, identity } from './lib/olomol.mjs';
import { loadResults, saveResults } from './lib/results.mjs';
import { rng, sample } from './lib/rng.mjs';
import { max, median, quantile, wilson } from './lib/stats.mjs';
import { identityOf, molfile3D } from './lib/truth3d.mjs';

const started = performance.now();
const SEED = 20261109;
const random = rng(SEED);
const RDKit = await rdkit();
const { writeAs } = await src('io/files.js');
// (drawings go to the app as olomol's own file: KET is written for Ketcher, a Newman projection in it drawn plainly since 0.5.0)
const { writeOlom } = await src('io/olom.js');
const { newmanDoc, cyclohexaneNewmanDoc } = await src('chem/newman.js');
const { readMolfile } = await src('io/molfile.js');
const env = await environment(RDKit);

// --- geometry of our own ---
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// The torsion angle a–b–c–d (IUPAC: seen along b→c, positive clockwise), degrees −180…180.
export function torsion(a, b, c, d) {
  const [b1, b2, b3] = [sub(b, a), sub(c, b), sub(d, c)];
  const [n1, n2] = [cross(b1, b2), cross(b2, b3)];
  // (Blondel & Karplus 1996: atan2((n1 × n2)·b2/|b2|, n1·n2))
  return (Math.atan2(dot(cross(n1, n2), b2) / Math.hypot(...b2), dot(n1, n2)) * 180) / Math.PI;
}
const off = (x, y) => Math.abs(((((x - y) % 360) + 540) % 360) - 180);
// the torsion function checked on points whose angle is known: d at 0, 60, …, 300° turned about z, both ways
for (const want of [0, 60, 120, 180, -60, -120, 35]) {
  const t = (want * Math.PI) / 180;
  const got = torsion([1, 0, 1], [0, 0, 1], [0, 0, 0], [Math.cos(-t), Math.sin(-t), 0]);
  if (off(got, want) > 1e-9) throw new Error(`torsion() wrong: ${want} gave ${got}`);
}
// (clockwise seen from b to c: b at z = 1 looking down −z, so a clockwise turn is −t in the xy plane)

const TOLERANCE = 30; // degrees: a Newman dihedral kept within this

// --- the drawings ---
const b2b = loadResults('b2b');
if (!b2b) throw new Error('B5 takes its chairs and Newman projections from B2b: run npm run bench:b2 first');
const plainChairs = b2b.cases.filter((c) => c.part === 'chair' && c.subs.every((s) => ['Me', 'OH', 'Cl'].includes(s)));
const cases = [];
const jobs = [];
for (const c of sample(random, plainChairs, 350)) {
  const { doc, ringIds, slots, firsts } = chairDrawing({ positions: PATTERNS[c.pattern], subs: c.subs, faces: c.faces, chair: c.chair, mirror: c.mirror });
  jobs.push({ id: `B5-${c.id.slice(4)}`, part: 'chair', from: c.id, doc, ringIds, groups: firsts.map((first, i) => ({ first, ring: ringIds[PATTERNS[c.pattern][i]], slot: slots[i], label: c.subs[i] })), truth: c.expected.smiles });
}
for (const c of b2b.cases.filter((x) => x.part === 'sugar')) {
  const groups = [0, 1, 3, 4, 5];
  const { doc, ringIds, slots, firsts } = chairDrawing({ positions: groups, subs: c.subs.map((s) => (s === 'CH2OH' ? ['C', 'O'] : 'O')), faces: c.faces, chair: c.chair, mirror: c.mirror, ring: ['C', 'C', 'O', 'C', 'C', 'C'], scale: 1.6 });
  jobs.push({ id: `B5-${c.id.slice(4)}`, part: 'sugar', from: c.id, doc, ringIds, groups: firsts.map((first, i) => ({ first, ring: ringIds[groups[i]], slot: slots[i], label: c.subs[i] })), truth: c.expected.smiles });
}
const plainNewman = b2b.cases.filter((c) => c.part === 'newman' && !['threonine', '1,2-dibromo-1,2-diphenylethane'].includes(c.molecule));
for (const c of sample(random, plainNewman, 100)) {
  const doc = newmanDoc(c.front, c.back, c.dihedral);
  const ids = [...doc.atoms.keys()]; // the front carbon, the back carbon, the three front groups, the three back ones
  jobs.push({ id: `B5-${c.id.slice(4)}`, part: 'newman', from: c.id, doc, newman: { front: ids[0], back: ids[1], fronts: ids.slice(2, 5), backs: ids.slice(5, 8), dihedral: c.dihedral }, truth: c.expected.smiles });
}
for (const c of sample(random, b2b.cases.filter((x) => x.part === 'cyNewman'), 50)) {
  const axial = [];
  const equatorial = [];
  const CARBONS = ['C1', 'C2', 'C4', 'C5'];
  for (const [carbon, slot, group] of c.groups) (slot === 'axial' ? axial : equatorial)[CARBONS.indexOf(carbon)] = group;
  const doc = cyclohexaneNewmanDoc({ axial, equatorial });
  const ids = [...doc.atoms.keys()];
  const ringIds = ids.slice(0, 6);
  // cyclohexaneNewmanDoc adds, for C1, C2, C4, C5 in turn, the axial group's atom and then the equatorial one's
  const groups = [];
  [0, 1, 3, 4].forEach((k, n) => {
    for (const [m, slot] of ['axial', 'equatorial'].entries()) {
      const given = (slot === 'axial' ? axial : equatorial)[n];
      if (given) groups.push({ first: ids[6 + 2 * n + m], ring: ringIds[k], slot, label: given });
    }
  });
  jobs.push({ id: `B5-${c.id.slice(4)}`, part: 'cyNewman', from: c.id, doc, ringIds, groups, truth: c.expected.smiles });
}
// dienes and enones, each drawn s-trans and s-cis: RDKit's 2D layout, and the same with one side of the single
// bond between the two double bonds turned over it (mirrored across the bond's line)
const DIENES = [
  ['buta-1,3-diene', 'C=CC=C'], ['isoprene', 'C=CC(C)=C'], ['(E)-penta-1,3-diene', 'C=C/C=C/C'], ['(Z)-penta-1,3-diene', 'C=C/C=C\\C'],
  ['2,3-dimethylbuta-1,3-diene', 'C=C(C)C(C)=C'], ['(2E,4E)-hexa-2,4-diene', 'C/C=C/C=C/C'], ['(2E,4Z)-hexa-2,4-diene', 'C/C=C/C=C\\C'],
  ['2-methylpenta-1,3-diene', 'C=C(C)/C=C/C'], ['1-methoxybuta-1,3-diene', 'CO/C=C/C=C'], ['ocimene-like triene', 'C=CC(=C)CCC=C(C)C'],
  ['acrolein', 'C=CC=O'], ['methyl vinyl ketone', 'C=CC(C)=O'], ['methacrolein', 'C=C(C)C=O'], ['crotonaldehyde', 'C/C=C/C=O'],
  ['(E)-pent-3-en-2-one', 'C/C=C/C(C)=O'], ['mesityl oxide', 'CC(C)=CC(C)=O'], ['methyl acrylate', 'C=CC(=O)OC'], ['acrylic acid', 'C=CC(=O)O'],
  ['acrylamide', 'C=CC(N)=O'], ['ethyl (E)-crotonate', 'C/C=C/C(=O)OCC'], ['(E)-cinnamaldehyde', 'O=C/C=C/c1ccccc1'], ['(E)-benzalacetone', 'CC(=O)/C=C/c1ccccc1'],
  ['methyl methacrylate', 'C=C(C)C(=O)OC'], ['(E)-but-2-enoic acid', 'C/C=C/C(=O)O'], ['2-cyclohexylidene acetaldehyde', 'O=CC=C1CCCCC1'],
];
// the single bond between two double bonds (not aromatic, not in a ring) and its outer atoms, from our own reading
function dieneBond(doc) {
  const bonds = [...doc.bonds.values()];
  const near = (id) => bonds.filter((b) => b.a === id || b.b === id);
  const other = (b, id) => (b.a === id ? b.b : b.a);
  for (const bond of bonds.filter((b) => b.order === 1)) {
    const d1 = near(bond.a).find((b) => b !== bond && b.order === 2);
    const d2 = near(bond.b).find((b) => b !== bond && b.order === 2);
    if (d1 && d2) return { i: other(d1, bond.a), a: bond.a, b: bond.b, l: other(d2, bond.b) };
  }
  return null;
}
for (const [name, smiles] of DIENES) {
  const mol = RDKit.get_mol(smiles);
  mol.set_new_coords();
  const { doc } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })));
  mol.delete();
  const d = dieneBond(doc);
  for (const turned of [false, true]) {
    const copy = structuredClone(doc);
    if (turned) {
      // the b side, across the line through a and b
      const [A, B] = [copy.atoms.get(d.a), copy.atoms.get(d.b)];
      const side = new Set([d.b]);
      const stack = [d.b];
      while (stack.length) {
        const at = stack.pop();
        for (const bond of copy.bonds.values()) {
          const next = bond.a === at ? bond.b : bond.b === at ? bond.a : null;
          if (next !== null && next !== d.a && !side.has(next)) { side.add(next); stack.push(next); }
        }
      }
      const [ux, uy] = [(B.x - A.x) / Math.hypot(B.x - A.x, B.y - A.y), (B.y - A.y) / Math.hypot(B.x - A.x, B.y - A.y)];
      for (const id of side) {
        const p = copy.atoms.get(id);
        const [vx, vy] = [p.x - A.x, p.y - A.y];
        const along = vx * ux + vy * uy;
        p.x = A.x + 2 * along * ux - vx;
        p.y = A.y + 2 * along * uy - vy;
      }
    }
    const [I, A, B, L] = [d.i, d.a, d.b, d.l].map((id) => copy.atoms.get(id));
    const sideOf = (p) => (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
    const drawn = Math.sign(sideOf(I)) === Math.sign(sideOf(L)) ? 's-cis' : 's-trans';
    jobs.push({ id: `B5-diene-${name}-${drawn}`, part: 'diene', name, smiles, doc: copy, diene: { ...d, drawn }, truth: identity(RDKit, smiles).smiles });
  }
}

// --- the app ---
const app = await startApp();
const { page } = app;
// (the first model loads RDKit, OpenChemLib and the workers: done once before timing)
await putDrawing(page, writeOlom(jobs[0].doc));
await page.evaluate(() => window.olomolTest.model3D());

const drawings = {};
let n = 0;
for (const job of jobs) {
  n += 1;
  const placed = await putDrawing(page, writeOlom(job.doc));
  const ours = [...job.doc.atoms.values()];
  // which pasted atom is which of ours: pasting moves the drawing (and may order its atoms otherwise), so each
  // of ours is matched to the pasted atom where it lands, the drawing shifted by the difference of the centres
  const centre = (list) => [list.reduce((s, a) => s + a.x, 0) / list.length, list.reduce((s, a) => s + a.y, 0) / list.length];
  const [co, cp] = [centre(ours), centre(placed.atoms)];
  const pageId = new Map();
  for (const a of ours) {
    const [x, y] = [a.x - co[0] + cp[0], a.y - co[1] + cp[1]];
    const best = placed.atoms.reduce((m, p) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(m.x - x, m.y - y) ? p : m));
    if (Math.hypot(best.x - x, best.y - y) > 0.05 || best.el !== a.el) throw new Error(`${job.id}: atom ${a.id} (${a.el}) has no pasted twin`);
    pageId.set(a.id, best.id);
  }
  // a Newman projection's two carbons share one point: the end-on bond tells them apart (a in front, b behind)
  for (const bond of [...job.doc.bonds.values()].filter((b) => b.newman)) {
    const twin = placed.bonds.find((b) => b.newman && [b.a, b.b].includes(pageId.get(bond.a)));
    if (twin) {
      pageId.set(bond.a, twin.a);
      pageId.set(bond.b, twin.b);
    }
  }
  if (new Set(pageId.values()).size !== ours.length || placed.atoms.length !== ours.length) throw new Error(`${job.id}: the pasted drawing's atoms are not ours`);
  const t0 = Date.now();
  const model = await page.evaluate(async () => {
    const start = performance.now();
    try {
      const m = await window.olomolTest.model3D();
      return { ...m, ms: performance.now() - start };
    } catch (error) {
      return { error: error.message, ms: performance.now() - start };
    }
  });
  const c = { id: job.id, part: job.part, from: job.from ?? null, ms: Math.round(model.ms), conformationLost: model.conformationLost ?? null };
  drawings[job.id] = docToJSON(job.doc);
  if (model.error || model.reason || !model.points) {
    Object.assign(c, { status: 'fail', pass: false, reason: `no 3D model: ${model.error ?? model.reason ?? 'no points'}` });
    cases.push(c);
    continue;
  }
  const index = new Map(model.atomIds.map((id, i) => [id, i]));
  const at = (ourId) => model.points[index.get(pageId.get(ourId))];
  // R/S and E/Z of the model, by RDKit from a 3D molfile of our own (the molecule's atoms, as the model has them)
  const elements = model.atomIds.map((id) => placed.atoms.find((a) => a.id === id).el);
  const bonds = placed.bonds.filter((b) => index.has(b.a) && index.has(b.b)).map((b) => ({ a: index.get(b.a), b: index.get(b.b), order: b.order }));
  const got = identityOf(RDKit, molfile3D(elements.map((el, i) => ({ el, x: model.points[i][0], y: model.points[i][1], z: model.points[i][2] })), bonds));
  c.stereo = { expected: job.truth, got: got.smiles, kept: got.smiles === job.truth };
  const problems = [];
  if (!c.stereo.kept) problems.push('R/S or E/Z not kept in 3D');
  c.torsions = [];
  if (job.groups) {
    // each group: axial if gauche to the ring (|X–C1–C2–C3| under 120°), equatorial if anti
    const ring = job.ringIds;
    c.ringTorsions = ring.map((_, k) => torsion(...[0, 1, 2, 3].map((d) => at(ring[(k + d) % 6]))));
    c.isChair = c.ringTorsions.every((t, k) => Math.abs(t) >= 30 && Math.abs(t) <= 85 && Math.sign(t) !== Math.sign(c.ringTorsions[(k + 1) % 6]));
    if (!c.isChair) problems.push(`the ring is no chair in 3D (ring torsions ${c.ringTorsions.map((t) => t.toFixed(0)).join(', ')}°)`);
    for (const g of job.groups) {
      const k = ring.indexOf(g.ring);
      const t = torsion(at(g.first), at(ring[k]), at(ring[(k + 1) % 6]), at(ring[(k + 2) % 6]));
      const inModel = Math.abs(t) < 120 ? 'axial' : 'equatorial';
      c.torsions.push({ what: `${g.label} on ring atom ${k + 1}`, drawn: g.slot, model: inModel, degrees: Math.round(t * 10) / 10, ok: inModel === g.slot });
      if (inModel !== g.slot) problems.push(`${g.label} on ring atom ${k + 1} drawn ${g.slot}, ${inModel} in 3D`);
    }
    c.sidesKept = c.torsions.every((x) => x.ok);
  }
  if (job.newman) {
    // every front group against every back one: drawn dihedral + 120° per place round (newmanDoc: front groups
    // from the top clockwise, the back's turned by the dihedral)
    const { front, back, fronts, backs, dihedral } = job.newman;
    const errors = [];
    fronts.forEach((f, i) => backs.forEach((b, j) => {
      const want = (((dihedral + 120 * (j - i)) % 360) + 540) % 360 - 180;
      const t = torsion(at(f), at(front), at(back), at(b));
      errors.push(off(t, want));
      if (i === 0 && j === 0) c.torsions.push({ what: 'front group 1 – back group 1', drawn: `${dihedral}°`, model: `${t.toFixed(1)}°`, degrees: Math.round(t * 10) / 10, ok: off(t, want) <= TOLERANCE });
    }));
    c.dihedralError = Math.round(Math.max(...errors) * 10) / 10;
    if (c.dihedralError > TOLERANCE) problems.push(`dihedral ${c.dihedralError.toFixed(0)}° off the drawn ${dihedral}°`);
  }
  if (job.diene) {
    const { i, a, b, l, drawn } = job.diene;
    const t = torsion(at(i), at(a), at(b), at(l));
    const inModel = Math.abs(t) < 90 ? 's-cis' : 's-trans';
    c.torsions.push({ what: 'C=C–C=C (or C=C–C=O)', drawn, model: inModel, degrees: Math.round(t * 10) / 10, ok: inModel === drawn });
    c.dihedralError = Math.round(off(t, drawn === 's-cis' ? 0 : 180) * 10) / 10;
    if (inModel !== drawn) problems.push(`drawn ${drawn}, ${inModel} in 3D (${t.toFixed(0)}°)`);
  }
  c.pass = !problems.length;
  c.status = c.pass ? 'pass' : 'fail';
  c.reason = problems.join('; ');
  c.ringIds = job.ringIds ?? null;
  c.model = model.points.map((p) => p.map((v) => Math.round(v * 1000) / 1000));
  c.modelAtoms = model.atomIds.map((id) => ours[placed.atoms.findIndex((a) => a.id === id)].id); // our ids, model order
  cases.push(c);
  if (n % 50 === 0) console.log(`${n}/${jobs.length} (${((Date.now() - t0) / 1000).toFixed(1)} s for the last)`);
}
await app.close();

const rate = (list, test) => wilson(list.filter(test).length, list.length);
const part = (name) => cases.filter((c) => c.part === name);
const withSides = cases.filter((c) => c.sidesKept !== undefined);
const newmans = part('newman');
const dihedralErrors = [...newmans, ...part('diene')].map((c) => c.dihedralError).filter((v) => v !== undefined);
const summary = {
  all: rate(cases, (c) => c.pass),
  sidesKept: rate(withSides, (c) => c.sidesKept),
  sidesKeptByPart: Object.fromEntries(['chair', 'sugar', 'cyNewman'].map((p) => [p, rate(withSides.filter((c) => c.part === p), (c) => c.sidesKept)])),
  newmanKept: rate(newmans, (c) => c.dihedralError <= TOLERANCE),
  newmanError: { median: median(newmans.map((c) => c.dihedralError)), max: max(newmans.map((c) => c.dihedralError)) },
  dieneKept: rate(part('diene'), (c) => c.pass),
  dieneByDrawn: Object.fromEntries(['s-cis', 's-trans'].map((d) => [d, rate(part('diene').filter((c) => c.id.endsWith(d)), (c) => c.torsions?.[0]?.ok)])),
  dieneError: { median: median(part('diene').map((c) => c.dihedralError)), max: max(part('diene').map((c) => c.dihedralError)) },
  dihedralError: { median: median(dihedralErrors), max: max(dihedralErrors) },
  stereoKept: rate(cases.filter((c) => c.stereo), (c) => c.stereo.kept),
  conformationLost: cases.filter((c) => c.conformationLost).length,
  noModel: cases.filter((c) => !c.stereo).length,
  ms: { median: median(cases.map((c) => c.ms)), p95: quantile(cases.map((c) => c.ms), 0.95), max: max(cases.map((c) => c.ms)) },
  tolerance: TOLERANCE,
};
writeFileSync(new URL('out/b5-drawings.json', import.meta.url), JSON.stringify(drawings));
saveResults({
  id: 'b5', title: 'B5: the conformation drawn kept in 3D', environment: env, seconds: Math.round((performance.now() - started) / 100) / 10, seed: SEED,
  truth: "The specification drawn (axial or equatorial, the Newman dihedral, s-cis or s-trans), not olomol's reading of it; R/S and E/Z from B2b's 3D truth (chairs, sugars, Newman) or the SMILES (dienes). Measured on the app's own 3D model (window.olomolTest.model3D(), Turn in 3D's) with torsion angles computed here and RDKit's stereo from a 3D molfile written here.",
  summary, cases,
  csvColumns: ['id', 'part', 'from', 'status', 'reason', 'sidesKept', 'dihedralError', 'stereoKept', 'conformationLost', 'ms'],
  csvRows: cases.map((c) => ({ ...c, stereoKept: c.stereo?.kept })),
});
console.log(JSON.stringify({ all: summary.all, sides: summary.sidesKept, newman: summary.newmanKept, diene: summary.dieneKept, stereo: summary.stereoKept, ms: summary.ms }));
