// B6: the canonical form of a curved-arrow step (src/embed/canonical.js, the bridge's get('canonicalForms')): one
// string per step, the same for every drawing of the same step, another as soon as the step differs.
//   steps:        B4's 51 mechanism steps (lib/mechanisms.mjs, from bench/data/b4-mechanisms.json and the gallery's
//                 12) and two E2 steps on bromocyclohexane chairs (data/b6-steps.json), drawn by the benchmark;
//   invariance:   20 variants of each step made by our own code (never canonical.js): atom, bond and arrow ids
//                 renumbered; the arrows' order shuffled; the arrows moved to equivalent atoms (an automorphism of
//                 the molecules applied to every arrow at once); molecules moved, turned, flipped, redrawn by
//                 Indigo's layout (Redraw's first engine); hydrogens drawn as atoms, or explicit ones left out. Each
//                 must give exactly the original's string;
//   distinctness: single changes: an arrow's head on a non-equivalent atom, a full arrowhead made a fishhook, a
//                 bond source made a lone-pair source, a new-bond head made an atom head, and on chairs and Newman
//                 projections the anti-periplanar H swapped for another one on the same carbon. Each must give
//                 another string;
//   each arrow alone (curvedArrows): the same, arrow by arrow;
//   products:     the products written for each step (data/b6-steps.json) drawn after a reaction arrow: their
//                 canonical SMILES against RDKit's of what was written, and the step's string unchanged by them;
//   time:         canonicalForms per step in Node, and the bridge's get('canonicalForms') round trip in Chrome.
// Equivalence (truth): RDKit's substructure matches of the step's molecules onto themselves (every atom's element,
// charge, unpaired electrons and isotope, every bond's order kept), cross-checked with RDKit's canonical ranking
// without broken ties (each atom labelled in turn: atoms of one class give one canonical SMILES); on chairs and
// Newman projections only those that keep our own geometry: every group axial or equatorial as drawn (a chair), every
// front–back pair of groups anti, gauche or eclipsed as drawn (a Newman projection). Two steps are the same when such
// an automorphism maps one's arrows onto the other's (an arrow from a lone pair to an atom not bonded to it is the
// new bond it makes, as olomol's documented data model has it).
// Usage: npm run bench:b6 [-- --no-build] [-- --no-chrome] [-- --app=http://localhost:5183/]
import { readFileSync, writeFileSync } from 'node:fs';
import { startApp } from './lib/app.mjs';
import { docToJSON } from './lib/docjson.mjs';
import { environment } from './lib/env.mjs';
import { indigoLayout } from './lib/indigo.mjs';
import { mechanismSteps } from './lib/mechanisms.mjs';
import { identity, rdkit, src } from './lib/olomol.mjs';
import { saveResults } from './lib/results.mjs';
import { rng } from './lib/rng.mjs';
import { max, median, quantile, timed, wilson } from './lib/stats.mjs';

const started = performance.now();
const SEED = 20261123;
const VARIANTS_PER_STEP = 20;
const RDKit = await rdkit();
const env = await environment(RDKit);
const { canonicalForms } = await src('embed/canonical.js');
const { sidesOf } = await src('embed/sides.js');
const { chairDoc } = await src('chem/chair.js');
const { addAtom, addArrow, addBond, addCurve } = await src('model/doc.js');
const { writeOlom } = await src('io/olom.js');
const { mechanismDoc } = await import('../scripts/arrow-gallery.mjs');
const data = JSON.parse(readFileSync(new URL('data/b6-steps.json', import.meta.url), 'utf8'));
const random = rng(SEED);

// ======================= the steps =======================
const near = (doc, id) => [...doc.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
const bondOf = (doc, a, b) => [...doc.bonds.values()].find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
// axial: a group's bond within 20° of vertical (a chair is drawn with its axial bonds straight up and down)
const isAxial = (doc, ring, group) => {
  const [p, q] = [doc.atoms.get(ring), doc.atoms.get(group)];
  return Math.abs(q.x - p.x) < Math.tan((20 * Math.PI) / 180) * Math.abs(q.y - p.y);
};

const steps = (await mechanismSteps(RDKit)).map((s) => ({ name: s.name, source: s.source, doc: s.doc, projection: s.newman ? 'newman' : null }));
for (const spec of data.chairs) {
  const doc = chairDoc({ axial: ['Br', 'H', 'H', 'H', 'H', 'H'], equatorial: ['H', 'H', 'H', 'H', 'H', 'H'], flip: spec.flip });
  const br = [...doc.atoms.values()].find((a) => a.el === 'Br');
  const c1 = near(doc, br.id)[0];
  const [c2] = near(doc, c1).filter((id) => doc.atoms.get(id).el === 'C');
  if (!isAxial(doc, c1, br.id)) throw new Error(`${spec.name}: Br not axial as drawn`);
  const h = near(doc, c2).find((id) => doc.atoms.get(id).el === 'H' && isAxial(doc, c2, id));
  const xs = [...doc.atoms.values()].map((a) => a.x);
  const ys = [...doc.atoms.values()].map((a) => a.y);
  const o = addAtom(doc, Math.min(...xs) - 1.8, (Math.min(...ys) + Math.max(...ys)) / 2, 'O', { charge: -1, lonePairs: 'auto' });
  br.lonePairs = 'auto';
  addCurve(doc, { atom: o.id }, { atom: h }, 2, { color: '#d40000' });
  addCurve(doc, { bond: bondOf(doc, c2, h).id }, { bond: bondOf(doc, c1, c2).id }, 2, { color: '#d40000' });
  addCurve(doc, { bond: bondOf(doc, c1, br.id).id }, { atom: br.id }, 2, { color: '#d40000' });
  steps.push({ name: spec.name, source: 'b6-steps.json', doc, projection: 'chair' });
}
for (const step of steps) if (!data.products[step.name]) throw new Error(`no products written for ${step.name}`);
const slug = (name) => name.replace(/[^\w+]+/g, '-').replace(/^-|-$/g, '');

// ======================= our own reading of a step =======================
// The molecules as a molfile of our own (every atom drawn, labels as dummy atoms with an isotope of their own),
// read by RDKit: the atoms' implicit H, and the step's automorphisms
const pad = (v, n) => String(v).padStart(n);
const labelCode = (text) => 500 + ([...text].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7) % 400);
function ownMolfile(doc, ids) {
  const index = new Map(ids.map((id, k) => [id, k]));
  const bonds = [...doc.bonds.values()].filter((b) => index.has(b.a) && index.has(b.b) && !b.kind);
  const lines = ['', '  bench', '', `${pad(ids.length, 3)}${pad(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`];
  const props = { CHG: [], RAD: [], ISO: [] };
  ids.forEach((id, k) => {
    const a = doc.atoms.get(id);
    const label = a.alias || a.el === '*';
    lines.push(`${(a.x ?? 0).toFixed(4).padStart(10)}${(-(a.y ?? 0)).toFixed(4).padStart(10)}    0.0000 ${(label ? '*' : a.el).padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
    if (a.charge) props.CHG.push([k + 1, a.charge]);
    if (a.radical) props.RAD.push([k + 1, a.radical]);
    if (label) props.ISO.push([k + 1, labelCode(a.alias ?? '*')]);
    else if (a.isotope) props.ISO.push([k + 1, a.isotope]);
  });
  for (const b of bonds) lines.push(`${pad(index.get(b.a) + 1, 3)}${pad(index.get(b.b) + 1, 3)}${pad(Math.min(3, b.order ?? 1), 3)}  0`);
  for (const [tag, list] of Object.entries(props)) {
    for (let i = 0; i < list.length; i += 8) lines.push(`M  ${tag}${pad(list.slice(i, i + 8).length, 3)}${list.slice(i, i + 8).map(([k, v]) => `${pad(k, 4)}${pad(v, 4)}`).join('')}`);
  }
  lines.push('M  END');
  return lines.join('\n');
}
const readOwn = (molfile) => RDKit.get_mol(molfile, JSON.stringify({ removeHs: false })) ?? RDKit.get_mol(molfile, JSON.stringify({ removeHs: false, sanitize: false }));

// Each atom's implicit hydrogens, as RDKit counts them on our molfile
function implicitH(doc) {
  const ids = [...doc.atoms.keys()];
  const mol = readOwn(ownMolfile(doc, ids));
  try {
    const json = JSON.parse(mol.get_json());
    const d = json.defaults.atom.impHs;
    return new Map(json.molecules[0].atoms.map((a, k) => [ids[k], a.impHs ?? d]));
  } finally {
    mol.delete();
  }
}

// Our geometry of a projection: Newman projections' front–back pairs of groups (anti, gauche, eclipsed), chairs'
// groups (axial, equatorial)
function geometryOf(doc, projection) {
  const pairs = new Map(); // "g1|g2" (sorted) -> class, for groups on the two carbons of each Newman bond
  const slots = new Map(); // a chair's group -> 'axial' | 'equatorial'
  if (projection === 'newman') {
    for (const bond of doc.bonds.values()) {
      if (!bond.newman) continue;
      const angle = (c, g) => Math.atan2(doc.atoms.get(g).y - doc.atoms.get(c).y, doc.atoms.get(g).x - doc.atoms.get(c).x);
      for (const f of near(doc, bond.a).filter((id) => id !== bond.b)) {
        for (const g of near(doc, bond.b).filter((id) => id !== bond.a)) {
          let d = Math.abs(angle(bond.a, f) - angle(bond.b, g)) * (180 / Math.PI) % 360;
          if (d > 180) d = 360 - d;
          pairs.set([f, g].sort((p, q) => p - q).join('|'), d > 150 ? 'anti' : d > 30 ? 'gauche' : 'eclipsed');
        }
      }
    }
  }
  if (projection === 'chair') {
    const ring = [...doc.atoms.values()].filter((a) => a.el === 'C').map((a) => a.id); // (bromocyclohexane: its six C)
    for (const r of ring) for (const g of near(doc, r).filter((id) => !ring.includes(id))) slots.set(g, isAxial(doc, r, g) ? 'axial' : 'equatorial');
  }
  return { pairs, slots };
}

// The step's automorphisms that keep what is drawn: Maps atom id -> atom id
function automorphisms(doc, projection) {
  const ids = [...doc.atoms.keys()];
  const mol = readOwn(ownMolfile(doc, ids));
  let matches;
  try {
    matches = JSON.parse(mol.get_substruct_matches(mol, JSON.stringify({ uniquify: false, maxMatches: 200000 })) || '[]');
  } finally {
    mol.delete();
  }
  const same = (p, q) => {
    const [a, b] = [doc.atoms.get(p), doc.atoms.get(q)];
    return a.el === b.el && (a.charge ?? 0) === (b.charge ?? 0) && (a.radical ?? 0) === (b.radical ?? 0) && (a.isotope ?? null) === (b.isotope ?? null) && (a.alias ?? null) === (b.alias ?? null);
  };
  const { pairs, slots } = geometryOf(doc, projection);
  const out = [];
  const seen = new Set();
  for (const m of Array.isArray(matches) ? matches : []) {
    const sigma = new Map(ids.map((id, k) => [id, ids[m.atoms[k]]]));
    if (![...sigma].every(([p, q]) => same(p, q))) continue;
    if (![...doc.bonds.values()].filter((b) => !b.kind).every((b) => bondOf(doc, sigma.get(b.a), sigma.get(b.b))?.order === b.order)) continue;
    if ([...slots].some(([g, slot]) => slots.get(sigma.get(g)) !== slot)) continue;
    if ([...pairs].some(([key, cls]) => pairs.get(key.split('|').map((id) => sigma.get(Number(id))).sort((p, q) => p - q).join('|')) !== cls)) continue;
    const key = ids.map((id) => sigma.get(id)).join(',');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(sigma);
    }
  }
  return out;
}

// RDKit's classes of equivalent atoms, molecule by molecule: the canonical SMILES of our molfile with that atom
// alone labelled (an isotope), which is what RDKit's canonical ranking without broken ties tells apart
function rankClasses(doc) {
  const classes = new Map();
  for (const ids of fragmentsOf(doc)) {
    const lines = ownMolfile(doc, ids).split('\n');
    const end = lines.indexOf('M  END');
    ids.forEach((id, k) => {
      const text = [...lines.slice(0, end), `M  ISO  1${pad(k + 1, 4)}${pad(999, 4)}`, 'M  END'].join('\n');
      const mol = readOwn(text);
      classes.set(id, mol ? mol.get_smiles() : `?${id}`);
      mol?.delete();
    });
  }
  return classes;
}

function fragmentsOf(doc) {
  const seen = new Set();
  const out = [];
  for (const id of doc.atoms.keys()) {
    if (seen.has(id)) continue;
    const members = [id];
    seen.add(id);
    for (let k = 0; k < members.length; k++) for (const n of near(doc, members[k])) if (!seen.has(n)) { seen.add(n); members.push(n); }
    out.push(members);
  }
  return out;
}

// An arrow as our own key: electrons, where from (a bond's two atoms, a lone pair's or unpaired electron's atom),
// where to (an atom; a bond's two atoms; a new bond's two atoms, which an arrow from a lone pair to an atom not
// bonded to it makes); atom ids through `map`
function arrowKey(doc, curve, map = (id) => id) {
  const two = (a, b) => [map(a), map(b)].sort((p, q) => p - q).join('-');
  const bond = (id) => { const b = doc.bonds.get(id); return two(b.a, b.b); };
  const { from: f, to: t } = curve;
  let from;
  let source = null;
  if (f.bond !== undefined) from = `bond ${bond(f.bond)}`;
  else {
    source = f.atom;
    from = `${f.radical ? 'unpaired' : 'pair'} ${map(f.atom)}`;
  }
  let to;
  if (t.newBond !== undefined) to = `new ${two(t.newBond, t.atom)}`;
  else if (t.bond !== undefined) to = `bond ${bond(t.bond)}`;
  else to = source !== null && source !== t.atom && !bondOf(doc, source, t.atom) ? `new ${two(source, t.atom)}` : `atom ${map(t.atom)}`;
  return `${curve.electrons ?? 2}|${from}|${to}`;
}
const keysOf = (doc, map) => [...doc.curves.values()].map((c) => arrowKey(doc, c, map)).sort().join(' ; ');
// the same step (on the same atoms and bonds): an allowed automorphism takes one's arrows onto the other's
const sameStep = (base, other, sigmas) => sigmas.some((s) => keysOf(base, (id) => s.get(id)) === keysOf(other));

// ======================= variants (our own code) =======================
const clone = (doc) => structuredClone(doc);
// every id renumbered at random, and the atoms and bonds in another order; returns the curves' new ids in the old
// curves' order
function renumber(doc) {
  const kinds = ['atoms', 'bonds', 'curves', 'arrows', 'pluses', 'texts'];
  const all = kinds.flatMap((k) => [...(doc[k]?.keys() ?? [])]);
  const fresh = random.shuffle(Array.from({ length: all.length * 3 }, (_, i) => i + 1)).slice(0, all.length);
  const map = new Map(all.map((id, k) => [id, fresh[k]]));
  const m = (id) => (id === undefined || id === null ? id : map.get(id));
  for (const kind of kinds) {
    if (!doc[kind]) continue;
    const list = random.shuffle([...doc[kind].values()]);
    doc[kind] = new Map(list.map((o) => {
      const copy = { ...o, id: m(o.id) };
      if (kind === 'bonds') Object.assign(copy, { a: m(o.a), b: m(o.b) });
      if (kind === 'atoms' && o.arrow != null) copy.arrow = m(o.arrow);
      if (kind === 'curves') {
        copy.from = { ...o.from, ...(o.from.atom !== undefined ? { atom: m(o.from.atom) } : {}), ...(o.from.bond !== undefined ? { bond: m(o.from.bond) } : {}) };
        copy.to = { ...o.to, ...(o.to.atom !== undefined ? { atom: m(o.to.atom) } : {}), ...(o.to.bond !== undefined ? { bond: m(o.to.bond) } : {}), ...(o.to.newBond !== undefined ? { newBond: m(o.to.newBond) } : {}) };
      }
      return [copy.id, copy];
    }));
  }
  doc.nextId = Math.max(...fresh) + 1;
  return map;
}
function shuffleCurves(doc) {
  doc.curves = new Map(random.shuffle([...doc.curves.entries()]));
}
// an automorphism applied to every arrow's ends
function applySigma(doc, sigma) {
  for (const c of doc.curves.values()) {
    if (c.from.atom !== undefined) c.from.atom = sigma.get(c.from.atom);
    if (c.from.bond !== undefined) { const b = doc.bonds.get(c.from.bond); c.from.bond = bondOf(doc, sigma.get(b.a), sigma.get(b.b)).id; }
    if (c.to.atom !== undefined) c.to.atom = sigma.get(c.to.atom);
    if (c.to.newBond !== undefined) c.to.newBond = sigma.get(c.to.newBond);
    if (c.to.bond !== undefined) { const b = doc.bonds.get(c.to.bond); c.to.bond = bondOf(doc, sigma.get(b.a), sigma.get(b.b)).id; }
  }
}
const centre = (doc, ids) => [ids.reduce((s, id) => s + doc.atoms.get(id).x, 0) / ids.length, ids.reduce((s, id) => s + doc.atoms.get(id).y, 0) / ids.length];
function moved(doc) {
  for (const ids of fragmentsOf(doc)) {
    const [dx, dy] = [random.uniform(-2, 2), random.uniform(-2, 2)];
    for (const id of ids) { doc.atoms.get(id).x += dx; doc.atoms.get(id).y += dy; }
  }
  return 'each molecule moved up to 2 bond lengths';
}
function turned(doc) {
  const angles = [];
  for (const ids of fragmentsOf(doc)) {
    const angle = random.uniform(-Math.PI, Math.PI);
    angles.push(Math.round((angle * 180) / Math.PI));
    const [cx, cy] = centre(doc, ids);
    for (const id of ids) {
      const a = doc.atoms.get(id);
      [a.x, a.y] = [cx + Math.cos(angle) * (a.x - cx) - Math.sin(angle) * (a.y - cy), cy + Math.sin(angle) * (a.x - cx) + Math.cos(angle) * (a.y - cy)];
    }
  }
  return `each molecule turned (${angles.join('°, ')}°)`;
}
function flipped(doc) {
  for (const a of doc.atoms.values()) a.x = -a.x;
  // (as Flip does: a wedge becomes a hashed wedge, so that a molecule with stereo stays the same molecule)
  for (const b of doc.bonds.values()) if (b.stereo === 'wedge' || b.stereo === 'hash') b.stereo = b.stereo === 'wedge' ? 'hash' : 'wedge';
  return 'the drawing flipped left to right';
}
// projection molecules (a Newman projection's, a chair's) are not redrawn: a layout engine would draw them flat
const isProjection = (doc, ids, step) => step.projection && ids.some((id) => step.projection === 'chair' ? doc.atoms.get(id).el === 'C' : near(doc, id).some((n) => bondOf(doc, id, n).newman));
async function redrawn(doc, step) {
  let count = 0;
  for (const ids of fragmentsOf(doc)) {
    if (ids.length < 2 || isProjection(doc, ids, step)) continue;
    const lines = (await indigoLayout(ownMolfile(doc, ids))).split('\n');
    const n = Number(lines[3].slice(0, 3));
    const points = lines.slice(4, 4 + n).map((l) => [Number(l.slice(0, 10)), -Number(l.slice(10, 20))]);
    const lengths = [...doc.bonds.values()].filter((b) => ids.includes(b.a) && ids.includes(b.b)).map((b) => Math.hypot(points[ids.indexOf(b.a)][0] - points[ids.indexOf(b.b)][0], points[ids.indexOf(b.a)][1] - points[ids.indexOf(b.b)][1])).sort((p, q) => p - q);
    const unit = 1 / (lengths[Math.floor(lengths.length / 2)] || 1);
    const [ox, oy] = centre(doc, ids);
    const [cx, cy] = [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
    ids.forEach((id, k) => Object.assign(doc.atoms.get(id), { x: ox + (points[k][0] - cx) * unit, y: oy + (points[k][1] - cy) * unit }));
    count += 1;
  }
  return count ? `${count} molecule(s) redrawn by Indigo's layout` : null;
}
function hydrogensDrawn(doc) {
  const implicit = implicitH(doc);
  const candidates = [...implicit].filter(([id, h]) => h > 0 && !doc.atoms.get(id).alias && doc.atoms.get(id).el !== '*');
  if (!candidates.length) return null;
  const chosen = random.shuffle(candidates).slice(0, 1 + random.int(candidates.length));
  let added = 0;
  for (const [id, h] of chosen) {
    const a = doc.atoms.get(id);
    const k = 1 + random.int(h);
    for (let i = 0; i < k; i++) {
      const angle = random.uniform(0, 2 * Math.PI);
      const hAtom = addAtom(doc, a.x + 0.8 * Math.cos(angle), a.y + 0.8 * Math.sin(angle), 'H');
      addBond(doc, id, hAtom.id, 1);
      added += 1;
    }
  }
  return `${added} hydrogen(s) drawn as atoms on ${chosen.length} atom(s)`;
}
function hydrogensLeftOut(doc, step) {
  const used = new Set();
  for (const c of doc.curves.values()) {
    for (const end of [c.from, c.to]) {
      for (const id of [end.atom, end.newBond]) if (id !== undefined) used.add(id);
      if (end.bond !== undefined) { used.add(doc.bonds.get(end.bond).a); used.add(doc.bonds.get(end.bond).b); }
    }
  }
  const candidates = [...doc.atoms.values()].filter((a) => a.el === 'H' && !a.charge && !a.isotope && !a.radical && !used.has(a.id) && near(doc, a.id).length === 1
    && !isProjection(doc, [a.id, ...near(doc, a.id)], step) && !bondOf(doc, a.id, near(doc, a.id)[0]).stereo);
  if (!candidates.length) return null;
  const chosen = random.shuffle(candidates).slice(0, 1 + random.int(candidates.length));
  for (const a of chosen) {
    for (const [id, b] of doc.bonds) if (b.a === a.id || b.b === a.id) doc.bonds.delete(id);
    doc.atoms.delete(a.id);
  }
  return `${chosen.length} drawn hydrogen(s) left out`;
}

// The arrows that move under an automorphism (some end on another atom)
const moving = (doc, sigma) => [...doc.curves.values()].some((c) => arrowKey(doc, c) !== arrowKey(doc, c, (id) => sigma.get(id)));

// The forms, never throwing
function formsOf(doc) {
  try {
    return canonicalForms(doc, RDKit, sidesOf(doc));
  } catch (error) {
    return { step: null, curvedArrows: [], products: null, error: error.message };
  }
}
// The curve ids in the order curvedArrows lists them (arrowsOf: the drawing's curves, in order)
const curveOrder = (doc) => [...doc.curves.keys()];

// ======================= run =======================
const PLAN = ['ids', 'ids', 'order', 'order', 'equivalent', 'equivalent', 'equivalent', 'equivalent', 'moved', 'moved', 'turned', 'turned', 'flipped', 'flipped', 'redrawn', 'redrawn', 'H drawn', 'H drawn', 'H left out', 'all at once'];
const drawings = {};
const invariance = [];
const distinctness = [];
const products = [];
const stepFacts = [];

for (const step of steps) {
  const base = step.doc;
  const original = formsOf(base);
  const tag = slug(step.name);
  drawings[`${tag}:original`] = docToJSON(base);
  const sigmas = automorphisms(base, step.projection);
  const movingSigmas = sigmas.filter((s) => moving(base, s));
  // (cross-check: every automorphism keeps RDKit's classes)
  const classes = rankClasses(base);
  const classesKept = sigmas.every((s) => [...s].every(([p, q]) => classes.get(p) === classes.get(q)));
  const baseKeys = curveOrder(base);
  const facts = { step: step.name, source: step.source, projection: step.projection, atoms: base.atoms.size, arrows: base.curves.size, automorphisms: sigmas.length, equivalentMoves: movingSigmas.length, classesKept, string: original.step, curvedArrows: original.curvedArrows, error: original.error ?? null };
  stepFacts.push(facts);

  // --- invariance ---
  for (let k = 0; k < VARIANTS_PER_STEP; k++) {
    const doc = clone(base);
    const done = [];
    let kind = PLAN[k];
    // (the arrows' original indices, through the changes)
    const tags = new Map(baseKeys.map((id, i) => [id, i]));
    const apply = async (what) => {
      if (what === 'equivalent') {
        if (!movingSigmas.length) return false;
        const sigma = random.pick(movingSigmas);
        applySigma(doc, sigma);
        done.push(`arrows moved to equivalent atoms (${[...sigma].filter(([p, q]) => p !== q).map(([p, q]) => `${p}→${q}`).join(', ')})`);
        return true;
      }
      if (what === 'moved') { done.push(moved(doc)); return true; }
      if (what === 'turned') { done.push(turned(doc)); return true; }
      if (what === 'flipped') { done.push(flipped(doc)); return true; }
      if (what === 'redrawn') { const r = await redrawn(doc, step); if (r) done.push(r); return Boolean(r); }
      if (what === 'H drawn') { const r = hydrogensDrawn(doc); if (r) done.push(r); return Boolean(r); }
      if (what === 'H left out') { const r = hydrogensLeftOut(doc, step); if (r) done.push(r); return Boolean(r); }
      return true;
    };
    if (kind === 'all at once') {
      for (const what of ['equivalent', 'redrawn', 'turned', 'moved']) await apply(what);
      if (random.next() < 0.5) await apply('flipped');
    } else if (!['ids', 'order'].includes(kind) && !(await apply(kind))) {
      // (nothing of the kind in this step: the molecules turned and moved instead)
      const planned = kind;
      kind = 'turned and moved';
      await apply('turned');
      await apply('moved');
      done.push(`(no "${planned}" possible in this step)`);
    }
    let map = null;
    if (kind !== 'order') {
      map = renumber(doc);
      done.push('ids renumbered');
    }
    if (kind !== 'ids') {
      shuffleCurves(doc);
      done.push('arrows reordered');
    }
    const forms = formsOf(doc);
    // each arrow alone: this variant's k-th arrow is the original's tags.get(id)-th
    const back = new Map(map ? [...map].map(([oldId, newId]) => [newId, oldId]) : []);
    const perArrow = curveOrder(doc).map((id, i) => {
      const was = tags.get(map ? back.get(id) : id);
      return { index: was, got: forms.curvedArrows[i] ?? null, expected: original.curvedArrows[was] ?? null, same: forms.curvedArrows[i] === original.curvedArrows[was] };
    });
    const id = `B6-inv-${tag}-${String(k + 1).padStart(2, '0')}`;
    drawings[`${id}:variant`] = docToJSON(doc);
    const pass = Boolean(original.step) && forms.step === original.step;
    invariance.push({
      id, part: 'invariance', step: step.name, kind, made: done.join('; '), expected: original.step, got: forms.step, error: forms.error ?? null,
      pass, perArrow, arrowsSame: perArrow.every((a) => a.same), status: pass ? 'pass' : 'fail',
      reason: pass ? '' : forms.step ? 'Another string for a drawing of the same step' : `No string: ${forms.error ?? 'canonicalForms gave none'}`,
    });
  }

  // --- distinctness ---
  const curves = [...base.curves.values()];
  const changes = [];
  const pushChange = (kind, what, make, arrowIndex) => changes.push({ kind, what, make, arrowIndex });
  const atomsOf = [...base.atoms.keys()];
  curves.forEach((c, i) => {
    // an arrow's head on a non-equivalent atom (the step then is another by our own test; tried at random)
    pushChange('head on another atom', `arrow ${i + 1}'s head moved`, () => {
      for (let tries = 0; tries < 200; tries++) {
        const doc = clone(base);
        const curve = doc.curves.get(c.id);
        const target = random.pick(atomsOf);
        const source = curve.from.atom;
        if (target === source || (curve.from.bond !== undefined && [base.bonds.get(curve.from.bond).a, base.bonds.get(curve.from.bond).b].includes(target))) continue;
        if (curve.to.newBond !== undefined) {
          if (target === curve.to.newBond) continue;
          curve.to.atom = target;
        } else curve.to = { atom: target };
        if (!sameStep(base, doc, sigmas)) return { doc, said: `to atom ${target} (${base.atoms.get(target).el})` };
      }
      return null;
    }, i);
    if ((c.electrons ?? 2) === 2) {
      pushChange('fishhook', `arrow ${i + 1} made a fishhook`, () => {
        const doc = clone(base);
        doc.curves.get(c.id).electrons = 1;
        return { doc, said: 'two electrons → one' };
      }, i);
    } else {
      // (a step of fishhooks only: the other way round)
      pushChange('full arrowhead', `fishhook ${i + 1} made a full arrowhead`, () => {
        const doc = clone(base);
        doc.curves.get(c.id).electrons = 2;
        return { doc, said: 'one electron → two' };
      }, i);
    }
    if (c.from.bond !== undefined) {
      pushChange('lone-pair source', `arrow ${i + 1} from a lone pair instead of its bond`, () => {
        const doc = clone(base);
        const b = base.bonds.get(c.from.bond);
        // (the bond's atom with lone pairs to give: a heteroatom or an anion, else its first atom)
        const [p, q] = [base.atoms.get(b.a), base.atoms.get(b.b)];
        const atom = [p, q].find((a) => a.charge < 0) ?? [p, q].find((a) => !['C', 'H'].includes(a.el)) ?? p;
        doc.curves.get(c.id).from = { atom: atom.id };
        return { doc, said: `from ${atom.el} (atom ${atom.id})` };
      }, i);
    }
    if (c.to.newBond !== undefined && c.from.bond !== undefined) {
      pushChange('atom head', `arrow ${i + 1}'s new-bond head made an atom head`, () => {
        const doc = clone(base);
        doc.curves.get(c.id).to = { atom: c.to.atom };
        return { doc, said: `to atom ${c.to.atom}` };
      }, i);
    }
  });
  if (step.projection) {
    // the anti (axial) H that the base takes swapped for the other H on its carbon, in every arrow
    const { pairs, slots } = geometryOf(base, step.projection);
    const h = curves.map((c) => c.to.atom).find((id) => id !== undefined && base.atoms.get(id).el === 'H');
    const carbon = h !== undefined ? near(base, h)[0] : null;
    const other = carbon !== null ? near(base, carbon).find((id) => id !== h && base.atoms.get(id).el === 'H') : undefined;
    if (other !== undefined) {
      const relation = (x) => (step.projection === 'chair' ? slots.get(x) : [...pairs].filter(([key]) => key.split('|').map(Number).includes(x)).map(([, cls]) => cls).sort().join('/'));
      pushChange(step.projection === 'chair' ? 'axial H → equatorial H' : 'anti H → gauche H', `the H taken (${relation(h)}) swapped for the other on its carbon (${relation(other)})`, () => {
        const doc = clone(base);
        applySigma(doc, new Map([...base.atoms.keys()].map((id) => [id, id === h ? other : id === other ? h : id])));
        return { doc, said: `atom ${h} → atom ${other}` };
      }, null);
    }
  }
  for (const [n, change] of changes.entries()) {
    const made = change.make();
    const id = `B6-dis-${tag}-${String(n + 1).padStart(2, '0')}`;
    if (!made) {
      distinctness.push({ id, part: 'distinctness', step: step.name, kind: change.kind, made: change.what, status: 'excluded', reason: 'No non-equivalent atom found for it' });
      continue;
    }
    const forms = formsOf(made.doc);
    const truthSame = sameStep(base, made.doc, sigmas);
    drawings[`${id}:variant`] = docToJSON(made.doc);
    const pass = !truthSame && Boolean(forms.step) && forms.step !== original.step;
    // each arrow alone: a changed one another string unless, alone, it is the same arrow by our own test (an E2's
    // O → H moved to another H of the same CH3: another step, but the same arrow on its own); the rest their own
    const sameAlone = (c, d) => sigmas.some((sg) => arrowKey(base, c, (x) => sg.get(x)) === arrowKey(made.doc, d));
    const perArrow = curves.map((c, i) => {
      const d = made.doc.curves.get(c.id);
      const changed = arrowKey(base, c) !== arrowKey(made.doc, d);
      return { index: i, expected: original.curvedArrows[i], got: forms.curvedArrows[i], changed, aloneSame: changed && sameAlone(c, d) };
    });
    const arrowsRight = perArrow.every((a) => (a.changed && !a.aloneSame ? a.got !== a.expected : a.got === a.expected));
    distinctness.push({
      id, part: 'distinctness', step: step.name, kind: change.kind, made: `${change.what}: ${made.said}`, expected: original.step, got: forms.step, truthSame,
      pass, perArrow, arrowsRight, status: truthSame ? 'excluded' : pass ? 'pass' : 'fail',
      reason: truthSame ? 'Our own test says this is the same step: not counted' : pass ? '' : forms.step ? 'The same string for another step' : `No string: ${forms.error}`,
    });
  }

  // --- products, after a reaction arrow ---
  {
    const doc = clone(base);
    const xs = [...doc.atoms.values()].map((a) => a.x);
    const right = Math.max(...xs);
    addArrow(doc, right + 1, 0, right + 3, 0, 'forward');
    const written = data.products[step.name];
    const drawn = mechanismDoc(RDKit, { smiles: written, arrows: [] });
    const offset = right + 4 - Math.min(...[...drawn.atoms.values()].map((a) => a.x));
    const map = new Map();
    for (const a of drawn.atoms.values()) map.set(a.id, addAtom(doc, a.x + offset, a.y, a.el, { charge: a.charge, radical: a.radical, isotope: a.isotope, hCount: a.hCount, lonePairs: a.lonePairs }).id);
    for (const b of drawn.bonds.values()) addBond(doc, map.get(b.a), map.get(b.b), b.order, { stereo: b.stereo });
    const forms = formsOf(doc);
    const truth = written.split('.').map((s) => identity(RDKit, s).smiles).sort().join('.');
    const productsRight = forms.products === truth;
    const stepKept = forms.step === original.step;
    const id = `B6-prod-${tag}`;
    drawings[`${id}:drawing`] = docToJSON(doc);
    products.push({
      id, part: 'products', step: step.name, written, expected: truth, got: forms.products, stepString: forms.step, stepKept, pass: productsRight && stepKept, status: productsRight && stepKept ? 'pass' : 'fail',
      reason: productsRight && stepKept ? '' : [!productsRight && 'The products\' SMILES differ from those written', !stepKept && 'The step\'s string changed when its products were drawn after a reaction arrow'].filter(Boolean).join('; '),
    });
  }

  // --- time in Node ---
  const t = await timed(() => canonicalForms(base, RDKit, sidesOf(base)), { warmup: 2, runs: 9 });
  facts.node = { median: t.median, max: Math.max(...t.runs) };
  console.log(`B6 ${step.name}: ${invariance.filter((c) => c.step === step.name && c.pass).length}/${VARIANTS_PER_STEP} same, ${distinctness.filter((c) => c.step === step.name && c.pass).length}/${distinctness.filter((c) => c.step === step.name && c.status !== 'excluded').length} differ, products ${products.at(-1).pass}, ${t.median.toFixed(2)} ms`);
}

// --- time in Chrome: the bridge's get('canonicalForms'), an <olomol-editor> in a page, each step set() in it ---
const chrome = { ran: false };
if (!process.argv.includes('--no-chrome')) {
  const app = await startApp();
  const base = app.url.replace(/\?test$/, '');
  const page = app.page;
  await page.setContent(`<!doctype html><script src="${base}embed.js"></script><olomol-editor id="e" src="${base}embed.html" height="500"></olomol-editor>`);
  await page.waitForFunction(() => document.getElementById('e')?.get, null, { timeout: 60_000 });
  await page.evaluate(() => document.getElementById('e').get('version'));
  chrome.ran = true;
  for (const step of steps) {
    const facts = stepFacts.find((f) => f.step === step.name);
    const result = await page.evaluate(async (text) => {
      const editor = document.getElementById('e');
      await editor.set(text);
      const times = [];
      let forms = null;
      for (let k = 0; k < 11; k++) {
        const t0 = performance.now();
        forms = await editor.get('canonicalForms');
        if (k >= 2) times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      return { median: times[Math.floor(times.length / 2)], max: times.at(-1), step: forms?.step ?? null };
    }, writeOlom(step.doc));
    facts.chrome = { median: result.median, max: result.max, sameAsNode: result.step === facts.string, string: result.step };
  }
  chrome.version = env.chrome;
  if (app.errors.length) chrome.errors = app.errors.slice(0, 5);
  await app.close();
}

// ======================= summary =======================
const judgedInv = invariance;
const judgedDis = distinctness.filter((c) => c.status !== 'excluded');
const kinds = (list) => [...new Set(list.map((c) => c.kind))];
const rate = (list, test = (c) => c.pass) => wilson(list.filter(test).length, list.length);
const arrowsInv = invariance.flatMap((c) => c.perArrow);
const arrowsDis = judgedDis.flatMap((c) => c.perArrow.filter((a) => a.changed && !a.aloneSame));
const arrowsKept = judgedDis.flatMap((c) => c.perArrow.filter((a) => !a.changed || a.aloneSame));
const nodeTimes = stepFacts.map((f) => f.node.median);
const chromeTimes = stepFacts.filter((f) => f.chrome).map((f) => f.chrome.median);
const noH = invariance.filter((c) => !c.kind.startsWith('H '));
const summary = {
  steps: steps.length,
  arrows: steps.reduce((s, x) => s + x.doc.curves.size, 0),
  variantsPerStep: VARIANTS_PER_STEP,
  invariance: rate(judgedInv),
  invarianceWithoutH: rate(noH),
  invarianceByKind: Object.fromEntries(kinds(judgedInv).map((k) => [k, rate(judgedInv.filter((c) => c.kind === k))])),
  stepsAllSame: wilson(steps.filter((s) => invariance.filter((c) => c.step === s.name).every((c) => c.pass)).length, steps.length),
  distinctness: rate(judgedDis),
  distinctnessByKind: Object.fromEntries(kinds(judgedDis).map((k) => [k, rate(judgedDis.filter((c) => c.kind === k))])),
  distinctnessNotCounted: distinctness.length - judgedDis.length,
  perArrow: {
    invariance: rate(arrowsInv, (a) => a.same),
    invarianceWithoutH: rate(noH.flatMap((c) => c.perArrow), (a) => a.same),
    distinctness: rate(arrowsDis, (a) => a.got !== a.expected),
    unchangedKept: rate(arrowsKept, (a) => a.got === a.expected),
  },
  products: rate(products),
  productsRight: rate(products, (c) => c.expected === c.got),
  stepKeptWithProducts: rate(products, (c) => c.stepKept),
  equivalentMoves: { steps: stepFacts.filter((f) => f.equivalentMoves > 0).length, classesKept: stepFacts.every((f) => f.classesKept) },
  node: { median: median(nodeTimes), p95: quantile(nodeTimes, 0.95), max: max(stepFacts.map((f) => f.node.max)), slowest: stepFacts.reduce((b, f) => (f.node.median > b.node.median ? f : b)).step },
  chrome: chrome.ran ? { median: median(chromeTimes), p95: quantile(chromeTimes, 0.95), max: max(stepFacts.map((f) => f.chrome.max)), sameAsNode: stepFacts.every((f) => f.chrome.sameAsNode), differentInChrome: stepFacts.filter((f) => !f.chrome.sameAsNode).map((f) => f.step) } : null,
};
const cases = [...invariance, ...distinctness, ...products];
writeFileSync(new URL('out/b6-drawings.json', import.meta.url), JSON.stringify(drawings));
saveResults({
  id: 'b6', title: 'B6: the canonical form of a curved-arrow step', environment: env, seconds: Math.round((performance.now() - started) / 100) / 10, seed: SEED,
  truth: "Equivalence from RDKit (substructure matches of the step's molecules onto themselves, every atom's element, charge, unpaired electrons and isotope and every bond's order kept, all within RDKit's canonical-ranking classes), on chairs and Newman projections only those keeping our own geometry (axial/equatorial, anti/gauche); variants made by the benchmark's own code; products as written in data/b6-steps.json, canonicalised by RDKit",
  plan: PLAN, chrome,
  summary, stepFacts, cases,
  csvColumns: ['id', 'part', 'step', 'kind', 'made', 'status', 'reason', 'expected', 'got'],
});
console.log('B6', JSON.stringify({ invariance: summary.invariance, withoutH: summary.invarianceWithoutH, distinctness: summary.distinctness, products: summary.products, node: summary.node, chrome: summary.chrome && { median: summary.chrome.median, max: summary.chrome.max, sameAsNode: summary.chrome.sameAsNode } }));
process.exit(0);
