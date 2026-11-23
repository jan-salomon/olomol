// B2: projections read as the stereoisomers they show.
//   B2a  every chair, boat, Newman, Haworth and Fischer template against PubChem;
//   B2b  generated chairs (5,000, seeded), D-aldohexopyranoses, Newman projections, ring flips and toChair,
//        against a truth built in 3D here;
//   B2c  chairs drawn as by hand (distorted) and hexagons that are no chairs: is a chair recognised?
// olomol's answer is what its SMILES and InChI export give (writeAs, as the app's Export does).
// Usage: npm run bench:b2 [-- --only=b2a,b2b,b2c]
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { docToJSON } from './lib/docjson.mjs';
import { environment } from './lib/env.mjs';
import { identity, rdkit, src } from './lib/olomol.mjs';
import { pubchemByName } from './lib/pubchem.mjs';
import { saveResults } from './lib/results.mjs';
import { rng, sample } from './lib/rng.mjs';
import { median, quantile, wilson } from './lib/stats.mjs';
import { Builder, identityOf, ringTruth, signedArea } from './lib/truth3d.mjs';
import { chairDrawing, PATTERNS, SUBS } from './lib/drawings.mjs';

const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? 'b2a,b2b,b2c').split(',');
const RDKit = await rdkit();
const { writeAs } = await src('io/files.js');
const { chairCorners, boatDoc, CHAIRS, adamantaneCage } = await src('chem/chair.js');
const { PROJECTIONS, haworthDoc } = await src('chem/projections.js');
const { newmanDoc, cyclohexaneNewmanDoc } = await src('chem/newman.js');
const { ringFlip, readChair } = await src('chem/ringFlip.js');
const { ringToChair } = await src('chem/toChair.js');
const { readMolfile } = await src('io/molfile.js');
const { getRDKit } = await src('io/rdkit.js');
const { smallestRings } = await src('model/graph.js');
const { addAtom, addBond, emptyDoc } = await src('model/doc.js');
const olomolRDKit = await getRDKit();
const env = await environment(RDKit);

// --- shared ---

// What olomol gives for a drawing: its SMILES and InChI export, canonicalised by our RDKit.
async function olomolSays(doc) {
  try {
    const smiles = await writeAs(doc, 'smiles');
    const inchi = await writeAs(doc, 'inchi');
    const canonical = identity(RDKit, smiles);
    return { smiles: canonical.smiles ?? smiles, inchikey: inchi ? RDKit.get_inchikey_for_inchi(inchi) : null };
  } catch (error) {
    return { smiles: null, inchikey: null, error: error.message };
  }
}

// The truth from a SMILES (PubChem's): canonical SMILES and InChIKey by our RDKit.
const truthOfSmiles = (smiles) => {
  const id = identity(RDKit, smiles);
  return { smiles: id.smiles, inchikey: id.inchikey };
};

// A wedge drawing of a SMILES (RDKit's 2D coordinates and wedges, read by olomol), to compare by eye.
const wedgeDrawings = new Map();
function wedgeDrawing(smiles) {
  if (!wedgeDrawings.has(smiles)) {
    const mol = RDKit.get_mol(smiles);
    let json = null;
    if (mol) {
      mol.set_new_coords();
      if (mol.get_num_atoms() > 2) mol.normalize_depiction(1);
      const { doc } = readMolfile(mol.get_molblock());
      mol.delete();
      json = docToJSON(doc);
    }
    wedgeDrawings.set(smiles, json);
  }
  return wedgeDrawings.get(smiles);
}

function verdict(c, truth, got) {
  c.expected = truth;
  c.got = got;
  const smilesOk = Boolean(truth.smiles) && truth.smiles === got.smiles;
  const keyOk = Boolean(truth.inchikey) && truth.inchikey === got.inchikey;
  c.pass = smilesOk && keyOk;
  c.status = c.pass ? 'pass' : 'fail';
  if (!c.pass) {
    if (got.error) c.reason = `olomol gave no SMILES: ${got.error}`;
    else if (!got.smiles) c.reason = 'olomol gave no SMILES';
    else if (truth.inchikey && got.inchikey && truth.inchikey.slice(0, 14) === got.inchikey.slice(0, 14)) c.reason = 'Same constitution, other stereoisomer (the InChIKeys differ only in their stereo part)';
    else c.reason = 'A different molecule (the InChIKeys differ in their first block)';
  }
  return c;
}

const drawings = { b2a: {}, b2b: {}, b2c: {} };
// ======================= B2a: the templates =======================
const TEMPLATE_NAMES = {
  Chair: 'cyclohexane', 'Chair, flipped': 'cyclohexane', Boat: 'cyclohexane', 'Chair with H': 'cyclohexane',
  'Methyl, equatorial': 'methylcyclohexane', 'Methyl, axial': 'methylcyclohexane',
  'β-D-Glucose, chair': 'beta-D-glucopyranose', 'α-D-Glucose, chair': 'alpha-D-glucopyranose',
  'Ethane, staggered (Newman)': 'ethane', 'Ethane, eclipsed (Newman)': 'ethane',
  'Butane, anti (Newman)': 'butane', 'Butane, gauche (Newman)': 'butane', 'Butane, eclipsed (Newman)': 'butane',
  'Cyclohexane (Newman)': 'cyclohexane',
  'β-D-Glucose, Haworth': 'beta-D-glucopyranose', 'α-D-Glucose, Haworth': 'alpha-D-glucopyranose',
  'β-D-Galactose, Haworth': 'beta-D-galactopyranose', 'β-D-Ribose, Haworth': 'beta-D-ribofuranose',
  'β-D-2-Deoxyribose, Haworth': '2-deoxy-beta-D-ribofuranose',
  'D-Glyceraldehyde, Fischer': 'D-glyceraldehyde', 'L-Glyceraldehyde, Fischer': 'L-glyceraldehyde',
  'D-Glucose, Fischer': 'aldehydo-D-glucose', 'D-Fructose, Fischer': 'keto-D-fructose',
  'L-Alanine, Fischer': 'L-alanine', 'L-Serine, Fischer': 'L-serine',
  'Adamantane, cage': 'adamantane',
};
const kindOf = (name) => (/Newman/.test(name) ? 'Newman' : /Haworth/.test(name) ? 'Haworth' : /Fischer/.test(name) ? 'Fischer' : /Boat/.test(name) ? 'boat' : /cage/.test(name) ? 'cage' : 'chair');

async function b2a() {
  const started = performance.now();
  const templates = [...CHAIRS, ...PROJECTIONS, ['Adamantane, cage', () => adamantaneCage()]];
  const missing = templates.filter(([name]) => !TEMPLATE_NAMES[name]).map(([name]) => name);
  if (missing.length) throw new Error(`B2a: no PubChem name for ${missing.join(', ')}`);
  const answers = await pubchemByName([...new Set(Object.values(TEMPLATE_NAMES))], new URL('data/b2a-pubchem.json', import.meta.url));
  const cases = [];
  for (const [name, make] of templates) {
    const doc = make();
    const id = `B2a-${name.replace(/[,()]/g, '').replace(/\s+/g, '-')}`;
    const pubchem = answers[TEMPLATE_NAMES[name]];
    const c = { id, name, kind: kindOf(name), pubchemName: TEMPLATE_NAMES[name], cid: pubchem.cid ?? null, pubchemSmiles: pubchem.smiles ?? null };
    const truth = pubchem.smiles ? truthOfSmiles(pubchem.smiles) : { smiles: null, inchikey: null };
    verdict(c, truth, await olomolSays(doc));
    if (pubchem.error) c.reason = `PubChem doesn't know "${TEMPLATE_NAMES[name]}": ${pubchem.error}`;
    drawings.b2a[id] = docToJSON(doc);
    if (truth.smiles) drawings.b2a[`exp:${truth.smiles}`] = wedgeDrawing(truth.smiles);
    cases.push(c);
  }
  const byKind = {};
  for (const c of cases) (byKind[c.kind] ??= []).push(c);
  const summary = {
    all: wilson(cases.filter((c) => c.pass).length, cases.length),
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, list]) => [k, wilson(list.filter((c) => c.pass).length, list.length)])),
  };
  writeFileSync(new URL('out/b2a-drawings.json', import.meta.url), JSON.stringify(drawings.b2a));
  saveResults({
    id: 'b2a', title: 'B2a: every projection template against PubChem', environment: env, seconds: Math.round((performance.now() - started) / 100) / 10,
    truth: 'PubChem isomeric SMILES of the named compound (CID recorded), canonicalised by RDKit; InChIKey by RDKit from it',
    summary, cases,
    csvColumns: ['id', 'name', 'kind', 'pubchemName', 'cid', 'status', 'reason'],
    csvRows: cases.map((c) => ({ ...c })),
  });
  console.log('B2a', JSON.stringify(summary.all));
}

// ======================= B2b: generated chairs, sugars, Newman projections =======================
const product = (lists) => lists.reduce((acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])), [[]]);

// The truth for a chair drawing: the ring as drawn goes round one way seen from above (the drawing's own
// turn: a chair is drawn seen from above and in front, the lower edge in front), each group on its face.
function chairTruth(doc, ringIds, ring, groups) {
  const way = Math.sign(signedArea(ringIds.map((id) => [doc.atoms.get(id).x, -doc.atoms.get(id).y])));
  return identityOf(RDKit, ringTruth(ring, way, groups));
}

// Does a ring flip (ringFlip, as the app's button) keep olomol's SMILES?
async function afterRingFlip(doc, ringIds) {
  const flip = ringFlip(doc, ringIds);
  if (flip.error) return { error: `ring flip refused (${flip.error})` };
  const copy = structuredClone(doc);
  for (const [id, [x, y]] of flip.at(1)) Object.assign(copy.atoms.get(id), { x, y });
  return { doc: copy, ...(await olomolSays(copy)) };
}

const SUGARS = {
  // Haworth faces (D series, ring O at the back right): C2, C3, C4; C5's CH2OH up, C1's OH up in β
  gluco: [-1, 1, -1], manno: [1, 1, -1], allo: [-1, -1, -1], altro: [1, -1, -1],
  gulo: [-1, -1, 1], ido: [1, -1, 1], galacto: [-1, 1, 1], talo: [1, 1, 1],
};

const NEWMAN_MOLECULES = [
  { name: '2,3-dibromobutane', front: ['Br', 'CH3', 'H'], back: ['Br', 'CH3', 'H'] },
  { name: '2-bromo-3-chlorobutane', front: ['Br', 'CH3', 'H'], back: ['Cl', 'CH3', 'H'] },
  { name: '3-chlorobutan-2-ol', front: ['OH', 'CH3', 'H'], back: ['Cl', 'CH3', 'H'] },
  { name: 'threonine', front: ['OH', 'CH3', 'H'], back: ['NH2', 'CO2H', 'H'] },
  { name: '1,2-dibromo-1,2-diphenylethane', front: ['Br', 'Ph', 'H'], back: ['Br', 'Ph', 'H'] },
];
const permutations = (list) => (list.length <= 1 ? [list] : list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest])));

// The truth for a drawing with Newman projections, from the picture under the textbook convention: a bond
// seen end on, the front carbon towards the viewer, the back one behind; each carbon's other bonds go where
// they are drawn, leaning its way. Atoms elsewhere lie in between, at the depth of the Newman carbons they
// are bonded to. Labels are written out as their atoms.
function newmanTruth(doc) {
  const b = new Builder();
  const index = new Map();
  const depth = new Map();
  const endOn = [...doc.bonds.values()].filter((bond) => bond.newman);
  for (const bond of endOn) {
    depth.set(bond.a, 0.75);
    depth.set(bond.b, -0.75);
  }
  const neighbours = (id) => [...doc.bonds.values()].filter((bond) => bond.a === id || bond.b === id).map((bond) => (bond.a === id ? bond.b : bond.a));
  for (const atom of doc.atoms.values()) {
    if (depth.has(atom.id)) continue;
    const near = neighbours(atom.id).filter((n) => depth.has(n) && endOn.some((e) => e.a === n || e.b === n));
    const z = near.length ? near.reduce((s, n) => s + depth.get(n) + 0.45 * Math.sign(depth.get(n)), 0) / near.length : 0;
    depth.set(atom.id, z);
  }
  const labels = [];
  for (const atom of doc.atoms.values()) {
    if (atom.el === '*') {
      labels.push(atom);
      continue;
    }
    index.set(atom.id, b.atom(atom.el, [atom.x, -atom.y, depth.get(atom.id)]));
  }
  for (const bond of doc.bonds.values()) if (index.has(bond.a) && index.has(bond.b)) b.bond(index.get(bond.a), index.get(bond.b), bond.order);
  for (const label of labels) {
    const [on] = neighbours(label.id);
    const base = b.atoms[index.get(on)];
    const at = [label.x, -label.y, depth.get(label.id)];
    const dir = [at[0] - base.x, at[1] - base.y, at[2] - base.z];
    const n = Math.hypot(...dir);
    b.group(index.get(on), label.alias, at, dir.map((v) => v / n));
  }
  return identityOf(RDKit, b.molfile());
}

async function b2b() {
  const started = performance.now();
  const random = rng(20261107);
  const cases = [];
  // --- chairs: every specification, then 5,000 by a seeded sample (all 1,1 cases, the rest evenly) ---
  const specs = [];
  for (const [pattern, positions] of Object.entries(PATTERNS)) {
    const facesList = pattern === '1,1' ? [[1, -1]] : product(positions.map(() => [1, -1]));
    for (const subs of product(positions.map(() => Object.keys(SUBS)))) {
      for (const faces of facesList) for (const chair of ['A', 'B']) for (const mirror of [false, true]) specs.push({ pattern, positions, subs, faces, chair, mirror });
    }
  }
  // 5,000 in all, shared out evenly over the patterns; a pattern with fewer specifications than its share
  // (1,1: 100; 1,2, 1,3, 1,4: 400 each) gives them all, and the rest is shared among the others
  const byPattern = Object.keys(PATTERNS).map((p) => specs.filter((s) => s.pattern === p));
  const quota = byPattern.map(() => 0);
  let open = byPattern.map((_, i) => i);
  let left = 5000;
  while (left > 0 && open.length) {
    const share = Math.floor(left / open.length);
    const extra = left % open.length;
    open.forEach((i, k) => { quota[i] += share + (k < extra ? 1 : 0); });
    left = 0;
    for (const i of open) if (quota[i] > byPattern[i].length) { left += quota[i] - byPattern[i].length; quota[i] = byPattern[i].length; }
    open = open.filter((i) => quota[i] < byPattern[i].length);
  }
  const chosen = byPattern.flatMap((list, i) => sample(random, list, quota[i]));
  const faceWord = (f) => (f > 0 ? 'up' : 'down');
  const truths = new Map();
  for (const spec of chosen) {
    const id = `B2b-${spec.pattern}-${spec.subs.join(',')}-${spec.faces.map(faceWord).join(',')}-chair${spec.chair}${spec.mirror ? '-mirror' : ''}`;
    const { doc, ringIds, slots } = chairDrawing(spec);
    const groups = spec.positions.map((position, i) => ({ position, text: spec.subs[i], face: spec.faces[i] }));
    const truth = chairTruth(doc, ringIds, Array(6).fill('C'), groups);
    const c = { id, part: 'chair', pattern: spec.pattern, subs: spec.subs, faces: spec.faces, slots, chair: spec.chair, mirror: spec.mirror };
    verdict(c, truth, await olomolSays(doc));
    const flip = await afterRingFlip(doc, ringIds);
    c.flip = flip.error ? { error: flip.error } : { smiles: flip.smiles, kept: flip.smiles === c.got.smiles, right: flip.smiles === truth.smiles };
    drawings.b2b[id] = docToJSON(doc);
    if (flip.doc) drawings.b2b[`${id}:flipped`] = docToJSON(flip.doc);
    if (truth.smiles) drawings.b2b[`exp:${truth.smiles}`] ??= wedgeDrawing(truth.smiles);
    if (truth.smiles) truths.set(truth.smiles, truth);
    cases.push(c);
  }
  // --- the D-aldohexopyranoses, α and β, as chairs (the β-D-glucose template's layout: C4 the raised left
  // tip, C5 and O5 at the back, C1 the lowered right tip, C2 and C3 in front) ---
  const SUGAR_RING = ['C', 'C', 'O', 'C', 'C', 'C']; // C4, C5, O5, C1, C2, C3
  const pubchemSugars = await pubchemByName(Object.keys(SUGARS).flatMap((s) => ['alpha', 'beta'].map((a) => `${a}-D-${s}pyranose`)), new URL('data/b2b-pubchem-sugars.json', import.meta.url));
  const builderCheck = [];
  for (const [sugar, [c2, c3, c4]] of Object.entries(SUGARS)) {
    for (const anomer of ['alpha', 'beta']) {
      const c1 = anomer === 'beta' ? 1 : -1;
      const groups = [{ position: 0, text: 'OH', face: c4 }, { position: 1, text: 'CH2OH', face: 1 }, { position: 3, text: 'OH', face: c1 }, { position: 4, text: 'OH', face: c2 }, { position: 5, text: 'OH', face: c3 }];
      for (const chair of ['A', 'B']) {
        for (const mirror of [false, true]) {
          const spec = { positions: groups.map((g) => g.position), subs: groups.map((g) => (g.text === 'CH2OH' ? ['C', 'O'] : 'O')), faces: groups.map((g) => g.face), chair, mirror, ring: SUGAR_RING, scale: 1.6 };
          const { doc, ringIds, slots } = chairDrawing(spec);
          const truth = chairTruth(doc, ringIds, SUGAR_RING, groups);
          const id = `B2b-sugar-${anomer}-D-${sugar}-chair${chair}${mirror ? '-mirror' : ''}`;
          const c = { id, part: 'sugar', pattern: 'sugar', sugar, anomer, chair, mirror, slots, faces: spec.faces, subs: groups.map((g) => g.text) };
          verdict(c, truth, await olomolSays(doc));
          const flip = await afterRingFlip(doc, ringIds);
          c.flip = flip.error ? { error: flip.error } : { smiles: flip.smiles, kept: flip.smiles === c.got.smiles, right: flip.smiles === truth.smiles };
          drawings.b2b[id] = docToJSON(doc);
          if (flip.doc) drawings.b2b[`${id}:flipped`] = docToJSON(flip.doc);
          if (truth.smiles) drawings.b2b[`exp:${truth.smiles}`] ??= wedgeDrawing(truth.smiles);
          cases.push(c);
          // the truth builder itself, checked against PubChem: the D sugar drawn unmirrored in chair A
          if (chair === 'A' && !mirror) {
            const pc = pubchemSugars[`${anomer}-D-${sugar}pyranose`];
            const pcTruth = pc?.smiles ? truthOfSmiles(pc.smiles) : null;
            builderCheck.push({ name: `${anomer}-D-${sugar}pyranose`, cid: pc?.cid ?? null, builder: truth.inchikey, pubchem: pcTruth?.inchikey ?? null, agree: Boolean(pcTruth) && pcTruth.inchikey === truth.inchikey });
          }
        }
      }
    }
  }
  // --- Newman projections of ethanes with two stereocentres: every order of the groups in front and behind,
  // dihedral 0–300° ---
  for (const molecule of NEWMAN_MOLECULES) {
    for (const front of permutations(molecule.front)) {
      for (const back of permutations(molecule.back)) {
        for (let dihedral = 0; dihedral < 360; dihedral += 60) {
          const doc = newmanDoc(front, back, dihedral);
          const id = `B2b-newman-${molecule.name}-f(${front.join(',')})-b(${back.join(',')})-dih${dihedral}`;
          const truth = newmanTruth(doc);
          const c = { id, part: 'newman', pattern: 'Newman', molecule: molecule.name, front, back, dihedral };
          verdict(c, truth, await olomolSays(doc));
          drawings.b2b[id] = docToJSON(doc);
          if (truth.smiles) drawings.b2b[`exp:${truth.smiles}`] ??= wedgeDrawing(truth.smiles);
          cases.push(c);
        }
      }
    }
  }
  // --- cyclohexane seen along C1–C2 (and C5–C4): two groups on two of the four Newman carbons ---
  const CARBONS = ['C1', 'C2', 'C4', 'C5'];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (const [si, sj] of product([['axial', 'equatorial'], ['axial', 'equatorial']])) {
        for (const [gi, gj] of product([['CH3', 'Cl', 'OH'], ['CH3', 'Cl', 'OH']])) {
          const axial = [];
          const equatorial = [];
          (si === 'axial' ? axial : equatorial)[i] = gi;
          (sj === 'axial' ? axial : equatorial)[j] = gj;
          const doc = cyclohexaneNewmanDoc({ axial, equatorial });
          const id = `B2b-cyNewman-${CARBONS[i]}${si.slice(0, 2)}-${gi},${CARBONS[j]}${sj.slice(0, 2)}-${gj}`;
          const truth = newmanTruth(doc);
          const c = { id, part: 'cyNewman', pattern: 'cyclohexane Newman', groups: [[CARBONS[i], si, gi], [CARBONS[j], sj, gj]] };
          verdict(c, truth, await olomolSays(doc));
          drawings.b2b[id] = docToJSON(doc);
          if (truth.smiles) drawings.b2b[`exp:${truth.smiles}`] ??= wedgeDrawing(truth.smiles);
          cases.push(c);
        }
      }
    }
  }
  // --- toChair: a wedge drawing of each chair's stereoisomer (RDKit's), turned into a chair by olomol
  // (ringToChair, the app's "to chair"), must keep its SMILES ---
  const molecules = sample(random, [...truths.keys()].sort(), 1000);
  let n = 0;
  for (const smiles of molecules) {
    n += 1;
    const id = `B2b-toChair-${String(n).padStart(4, '0')}`;
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const { doc } = readMolfile(mol.get_molblock());
    mol.delete();
    const ring = [...smallestRings(doc).values()].find((r) => r.length === 6);
    const c = { id, part: 'toChair', pattern: 'toChair', smiles };
    const made = ring ? ringToChair(olomolRDKit, doc, ring) : { error: 'no six-membered ring' };
    const truth = truths.get(smiles);
    if (made.error) {
      Object.assign(c, { expected: truth, got: { smiles: null, inchikey: null }, pass: false, status: 'fail', reason: `toChair refused: ${made.error}` });
    } else {
      verdict(c, truth, await olomolSays(made.doc));
      drawings.b2b[id] = docToJSON(made.doc);
    }
    drawings.b2b[`${id}:wedges`] = docToJSON(doc);
    cases.push(c);
  }

  const part = (name) => cases.filter((c) => c.part === name);
  const rate = (list) => wilson(list.filter((c) => c.pass).length, list.length);
  const chairs = part('chair');
  const withFlip = [...chairs, ...part('sugar')].filter((c) => !c.flip.error);
  const summary = {
    chairs: rate(chairs),
    chairsByPattern: Object.fromEntries(Object.keys(PATTERNS).map((p) => [p, rate(chairs.filter((c) => c.pattern === p))])),
    chairsBySubstituent: Object.fromEntries(Object.keys(SUBS).map((s) => [s, rate(chairs.filter((c) => c.subs.includes(s)))])),
    chairsByChair: { A: rate(chairs.filter((c) => c.chair === 'A' && !c.mirror)), 'A mirrored': rate(chairs.filter((c) => c.chair === 'A' && c.mirror)), B: rate(chairs.filter((c) => c.chair === 'B' && !c.mirror)), 'B mirrored': rate(chairs.filter((c) => c.chair === 'B' && c.mirror)) },
    sugars: rate(part('sugar')),
    newman: rate(part('newman')),
    newmanByMolecule: Object.fromEntries(NEWMAN_MOLECULES.map((m) => [m.name, rate(part('newman').filter((c) => c.molecule === m.name))])),
    newmanByDihedral: Object.fromEntries([0, 60, 120, 180, 240, 300].map((d) => [d, rate(part('newman').filter((c) => c.dihedral === d))])),
    cyclohexaneNewman: rate(part('cyNewman')),
    ringFlipKept: wilson(withFlip.filter((c) => c.flip.kept).length, withFlip.length),
    ringFlipRight: wilson(withFlip.filter((c) => c.flip.right).length, withFlip.length),
    ringFlipRefused: [...chairs, ...part('sugar')].filter((c) => c.flip.error).length,
    toChair: rate(part('toChair')),
    all: rate(cases),
    builderCheck,
    builderAgrees: builderCheck.every((b) => b.agree),
    mirrorPairs: (() => {
      // is the truth sensitive to handedness? each chair and its mirror image: where the truth differs (a chiral
      // molecule), olomol's answers must differ too
      const byId = new Map(chairs.map((c) => [c.id, c]));
      const pairs = chairs.filter((c) => !c.mirror && byId.has(`${c.id}-mirror`)).map((c) => [c, byId.get(`${c.id}-mirror`)]);
      const differ = pairs.filter(([a, b]) => a.expected.smiles !== b.expected.smiles);
      return { pairs: pairs.length, truthDiffers: differ.length, olomolDiffersToo: differ.filter(([a, b]) => a.got.smiles !== b.got.smiles).length };
    })(),
  };
  writeFileSync(new URL('out/b2b-drawings.json', import.meta.url), JSON.stringify(drawings.b2b));
  saveResults({
    id: 'b2b', title: 'B2b: generated chairs and Newman projections', environment: env, seconds: Math.round((performance.now() - started) / 100) / 10,
    seed: 20261107,
    truth: '3D coordinates built here from the specification (chairs, sugars: each group on its face of the ring, the ring going round the way the drawing does seen from above) or from the picture (Newman: front carbon towards the viewer), written as a 3D molfile; stereo by RDKit from the 3D coordinates. The builder agrees with PubChem for all 16 D-aldohexopyranoses (builderCheck).',
    summary, cases,
    csvColumns: ['id', 'part', 'pattern', 'status', 'reason', 'expectedSmiles', 'gotSmiles', 'flipKept'],
    csvRows: cases.map((c) => ({ ...c, expectedSmiles: c.expected?.smiles, gotSmiles: c.got?.smiles, flipKept: c.flip ? c.flip.kept ?? c.flip.error : '' })),
  });
  console.log('B2b', JSON.stringify({ chairs: summary.chairs, sugars: summary.sugars, newman: summary.newman, cy: summary.cyclohexaneNewman, flip: summary.ringFlipKept, toChair: summary.toChair, builder: summary.builderAgrees }));
}

// ======================= B2c: chairs drawn by hand =======================
const SIGMAS = [0, 0.05, 0.1, 0.15, 0.2, 0.3];
const PER_LEVEL = 1000;
const NEGATIVE_CLASSES = ['regular hexagon', 'Haworth hexagon', 'boat', 'half-chair', 'twist-boat', 'random hexagon'];

// Distorts a drawing as a hand would: turned, sheared, stretched, ring corners pulled in or out unevenly
// (their groups with them), then every atom moved by Gaussian noise of σ bond lengths. Returns the parameters.
function distort(doc, ringIds, random, { sigma, turn = 20, shear = 0.2, aspect = [0.75, 1.33], uneven = 0.1 }) {
  const ring = ringIds.map((id) => doc.atoms.get(id));
  const bond = ring.reduce((s, a, i) => s + Math.hypot(a.x - ring[(i + 1) % 6].x, a.y - ring[(i + 1) % 6].y), 0) / 6;
  const p = {
    turn: random.uniform(-turn, turn),
    shear: random.uniform(-shear, shear),
    aspect: Math.exp(random.uniform(Math.log(aspect[0]), Math.log(aspect[1]))),
    uneven: ringIds.map(() => 1 + random.uniform(-uneven, uneven)),
    sigma,
  };
  // the ring's corners pulled in or out from the centre, each group moving with its corner
  const [cx, cy] = [ring.reduce((s, a) => s + a.x, 0) / 6, ring.reduce((s, a) => s + a.y, 0) / 6];
  const owner = new Map();
  const byAtom = new Map([...doc.atoms.keys()].map((id) => [id, []]));
  for (const b of doc.bonds.values()) {
    byAtom.get(b.a).push(b.b);
    byAtom.get(b.b).push(b.a);
  }
  ringIds.forEach((id, k) => {
    const stack = byAtom.get(id).filter((n) => !ringIds.includes(n));
    for (const s of stack) owner.set(s, k);
    while (stack.length) {
      const at = stack.pop();
      for (const n of byAtom.get(at)) if (!ringIds.includes(n) && !owner.has(n)) { owner.set(n, k); stack.push(n); }
    }
  });
  const shift = ringIds.map((id, k) => {
    const a = doc.atoms.get(id);
    return [(a.x - cx) * (p.uneven[k] - 1), (a.y - cy) * (p.uneven[k] - 1)];
  });
  for (const a of doc.atoms.values()) {
    const k = ringIds.includes(a.id) ? ringIds.indexOf(a.id) : owner.get(a.id);
    if (k !== undefined) {
      a.x += shift[k][0];
      a.y += shift[k][1];
    }
  }
  const t = (p.turn * Math.PI) / 180;
  for (const a of doc.atoms.values()) {
    let [x, y] = [a.x - cx, a.y - cy];
    x += p.shear * y;
    y *= p.aspect;
    [x, y] = [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
    a.x = cx + x + random.gauss() * sigma * bond;
    a.y = cy + y + random.gauss() * sigma * bond;
  }
  p.turn = Math.round(p.turn * 10) / 10;
  p.shear = Math.round(p.shear * 1000) / 1000;
  p.aspect = Math.round(p.aspect * 1000) / 1000;
  p.uneven = p.uneven.map((u) => Math.round(u * 1000) / 1000);
  return p;
}

// A ring of six corners (y up, unit bonds roughly) with groups straight out from the centre on two of them.
function ringFromCorners(corners, random, groups = 2) {
  const doc = emptyDoc();
  const scale = 1.3;
  const ids = corners.map(([x, y]) => addAtom(doc, scale * x, -scale * y, 'C').id);
  ids.forEach((id, k) => addBond(doc, id, ids[(k + 1) % 6]));
  const [cx, cy] = [corners.reduce((s, p) => s + p[0], 0) / 6, corners.reduce((s, p) => s + p[1], 0) / 6];
  const where = random.shuffle([0, 1, 2, 3, 4, 5]).slice(0, groups);
  for (const k of where) {
    const [x, y] = corners[k];
    const n = Math.hypot(x - cx, y - cy) || 1;
    const atom = addAtom(doc, scale * (x + (x - cx) / n), -scale * (y + (y - cy) / n), random.pick(['C', 'O', 'Cl']));
    addBond(doc, ids[k], atom.id);
  }
  return { doc, ringIds: ids };
}

function negative(kind, random) {
  const hexagon = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos((k * Math.PI) / 3 + Math.PI / 6), Math.sin((k * Math.PI) / 3 + Math.PI / 6)]);
  if (kind === 'regular hexagon') return ringFromCorners(hexagon, random);
  if (kind === 'Haworth hexagon') {
    // the pyranose ring of olomol's Haworth template, its shape only (no tapered bonds: plain lines)
    const h = haworthDoc({});
    const ring = [...h.atoms.values()].slice(0, 6).map((a) => [a.x / 1.3, -a.y / 1.3]);
    const made = ringFromCorners(ring, random, 0);
    // groups straight up and down, as on a Haworth ring
    for (const k of random.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 2)) {
      const a = made.doc.atoms.get(made.ringIds[k]);
      const atom = addAtom(made.doc, a.x, a.y + (random.next() < 0.5 ? -1.3 : 1.3), 'O');
      addBond(made.doc, a.id, atom.id);
    }
    return made;
  }
  if (kind === 'boat') {
    const b = boatDoc({});
    return ringFromCorners([...b.atoms.values()].slice(0, 6).map((a) => [a.x / 1.3, -a.y / 1.3]), random);
  }
  if (kind === 'half-chair') {
    // a chair with one tip folded flat: reflected across the line through its two neighbours
    const { corners } = chairCorners(random.next() < 0.5);
    const tip = random.pick([0, 3]);
    const [p, q] = [corners[(tip + 5) % 6], corners[(tip + 1) % 6]];
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const t = ((corners[tip][0] - p[0]) * dx + (corners[tip][1] - p[1]) * dy) / (dx * dx + dy * dy);
    const foot = [p[0] + t * dx, p[1] + t * dy];
    const half = corners.map((c, k) => (k === tip ? [2 * foot[0] - c[0], 2 * foot[1] - c[1]] : c));
    return ringFromCorners(half, random);
  }
  if (kind === 'twist-boat') {
    // a boat whose back edge is pushed one way and front edge the other, the tips raised unevenly
    const b = boatDoc({});
    const corners = [...b.atoms.values()].slice(0, 6).map((a) => [a.x / 1.3, -a.y / 1.3]);
    const skew = random.uniform(0.2, 0.35);
    const twisted = corners.map(([x, y], k) => (k === 1 || k === 2 ? [x + skew, y] : k === 4 || k === 5 ? [x - skew, y] : k === 0 ? [x, y + 0.15] : [x, y - 0.15]));
    return ringFromCorners(twisted, random);
  }
  // random hexagon: six corners round a centre at random angles (sorted, so the ring doesn't cross itself)
  // and distances, convex or concave
  const angles = Array.from({ length: 6 }, () => random.uniform(0, 2 * Math.PI)).sort((a, b) => a - b);
  return ringFromCorners(angles.map((a) => { const r = random.uniform(0.6, 1.4); return [r * Math.cos(a), r * Math.sin(a)]; }), random);
}

async function b2c() {
  const started = performance.now();
  const random = rng(20261108);
  const cases = [];
  const chairFaces = [];
  // positives: chairs with two groups (1,2-, 1,3- or 1,4-; Me, OH or Cl; any faces; either chair), distorted
  for (const sigma of SIGMAS) {
    for (let n = 0; n < PER_LEVEL; n++) {
      const pattern = random.pick(['1,2', '1,3', '1,4']);
      const positions = PATTERNS[pattern];
      const subs = positions.map(() => random.pick(['Me', 'OH', 'Cl']));
      const faces = positions.map(() => (random.next() < 0.5 ? 1 : -1));
      const chair = random.pick(['A', 'B']);
      const { doc, ringIds } = chairDrawing({ positions, subs, faces, chair, mirror: false });
      const groups = positions.map((position, i) => ({ position, text: subs[i], face: faces[i] }));
      const truth = chairTruth(doc, ringIds, Array(6).fill('C'), groups); // from the chair before it is distorted
      const params = distort(doc, ringIds, random, { sigma });
      const read = readChair(doc, ringIds);
      const id = `B2c-pos-s${sigma.toFixed(2)}-${String(n).padStart(4, '0')}`;
      const c = { id, kind: 'positive', class: 'chair', sigma, params, spec: { pattern, subs, faces, chair }, recognised: !read.error, readError: read.error ?? null, fitOff: read.fit?.off ?? null };
      if (c.recognised) {
        verdict(c, truth, await olomolSays(doc));
        c.stereoRight = c.pass;
        if (!c.pass) c.reason = `Recognised as a chair, but the stereo is wrong: ${c.reason}`;
      } else {
        Object.assign(c, { expected: truth, pass: false, status: 'fail', reason: `Not recognised as a chair (readChair: ${read.error})` });
      }
      chairFaces.push(c);
      drawings.b2c[id] = docToJSON(doc);
      cases.push(c);
    }
  }
  // negatives
  for (const kind of NEGATIVE_CLASSES) {
    for (let n = 0; n < PER_LEVEL; n++) {
      const { doc, ringIds } = negative(kind, random);
      const sigma = random.pick([0, 0.05, 0.1]);
      const params = distort(doc, ringIds, random, { sigma });
      const read = readChair(doc, ringIds);
      const id = `B2c-neg-${kind.replace(/\s+/g, '-')}-${String(n).padStart(4, '0')}`;
      const c = { id, kind: 'negative', class: kind, sigma, params, recognised: !read.error, readError: read.error ?? null, fitOff: read.fit?.off ?? null };
      c.pass = !c.recognised;
      c.status = c.pass ? 'pass' : 'fail';
      if (!c.pass) c.reason = 'Taken for a chair, though it is none';
      drawings.b2c[id] = docToJSON(doc);
      cases.push(c);
    }
  }
  // real hands: KET files in data/handdrawn/ (chairs drawn freehand), if any: is each six-membered ring recognised?
  const handDir = new URL('data/handdrawn/', import.meta.url);
  const { readAny } = await src('io/files.js');
  for (const file of existsSync(handDir) ? readdirSync(handDir).filter((f) => f.endsWith('.ket')).sort() : []) {
    const { doc } = await readAny(readFileSync(new URL(file, handDir), 'utf8'), { name: file });
    for (const [k, ring] of [...smallestRings(doc).values()].filter((r) => r.length === 6).entries()) {
      const read = readChair(doc, ring);
      const id = `B2c-hand-${file.replace(/\.ket$/, '')}-${k}`;
      cases.push({ id, kind: 'hand', class: 'drawn by hand', recognised: !read.error, readError: read.error ?? null, fitOff: read.fit?.off ?? null, pass: !read.error, status: read.error ? 'fail' : 'pass', reason: read.error ? `Not recognised (readChair: ${read.error})` : '' });
      drawings.b2c[id] = docToJSON(doc);
    }
  }
  const positives = cases.filter((c) => c.kind === 'positive');
  const recognisedPos = positives.filter((c) => c.recognised);
  const summary = {
    recallBySigma: Object.fromEntries(SIGMAS.map((s) => [s, wilson(positives.filter((c) => c.sigma === s && c.recognised).length, positives.filter((c) => c.sigma === s).length)])),
    stereoRightBySigma: Object.fromEntries(SIGMAS.map((s) => { const r = recognisedPos.filter((c) => c.sigma === s); return [s, wilson(r.filter((c) => c.stereoRight).length, r.length)]; })),
    recall: wilson(recognisedPos.length, positives.length),
    stereoRight: wilson(recognisedPos.filter((c) => c.stereoRight).length, recognisedPos.length),
    falsePositiveByClass: Object.fromEntries(NEGATIVE_CLASSES.map((k) => { const list = cases.filter((c) => c.class === k); return [k, wilson(list.filter((c) => c.recognised).length, list.length)]; })),
    falsePositive: wilson(cases.filter((c) => c.kind === 'negative' && c.recognised).length, cases.filter((c) => c.kind === 'negative').length),
    hand: wilson(cases.filter((c) => c.kind === 'hand' && c.recognised).length, cases.filter((c) => c.kind === 'hand').length),
    fitOffPositive: { median: median(positives.map((c) => c.fitOff)), p95: quantile(positives.map((c) => c.fitOff), 0.95) },
  };
  writeFileSync(new URL('out/b2c-drawings.json', import.meta.url), JSON.stringify(drawings.b2c));
  saveResults({
    id: 'b2c', title: 'B2c: chairs drawn by hand', environment: env, seconds: Math.round((performance.now() - started) / 100) / 10,
    seed: 20261108,
    truth: 'Positives: chairs made by chairDoc and distorted here; their stereo from the 3D truth of the undistorted chair (as B2b). Negatives: hexagons that are no chairs; recognised = readChair (src/chem/ringFlip.js) reads the ring as a chair.',
    summary, cases,
    csvColumns: ['id', 'kind', 'class', 'sigma', 'recognised', 'readError', 'fitOff', 'stereoRight', 'status', 'reason'],
  });
  console.log('B2c', JSON.stringify({ recall: summary.recall, stereo: summary.stereoRight, fp: summary.falsePositive }));
}

if (only.includes('b2a')) await b2a();
if (only.includes('b2b')) await b2b();
if (only.includes('b2c')) await b2c();
