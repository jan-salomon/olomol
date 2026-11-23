// B2d: Fischer projections both ways.
//   conversions: each compound drawn with wedges from PubChem's SMILES (olomol's own drawing of a SMILES, as Paste
//                makes it: input, not truth), then clicked with the Fischer tool (wedges → Fischer), the result with
//                the zigzag tool (Fischer → zigzag), and that with the Fischer tool again (zigzag → Fischer), as the
//                app's tools do it (an Editor in Node, pointer down and up on an atom). Each result's SMILES and
//                InChIKey against PubChem's; a refusal (olomol says why and changes nothing) is counted as one.
//   hand-drawn:  a Fischer projection built here from PubChem's configuration, with our own few lines of geometry,
//                written as plain crossings in a KET file (no stereo in it), pasted into the app in Chrome and each
//                crossing clicked with the Fischer tool (a real mouse click, one crossing per fresh copy); straight,
//                turned by ±3° and ±8°, and with uneven arms. Read, missed (a centre left without stereo) or wrong.
// Truth: PubChem's isomeric SMILES of the named compound (CID recorded), canonicalised by RDKit. For the
// hand-drawn projections, the side of each centre's two horizontal groups is the one whose wedge drawing (the
// left horizontal bond a wedge towards the viewer, verticals in the plane: what a Fischer projection means) RDKit
// reads as PubChem's stereoisomer; checked against the textbook projections of D-glyceraldehyde, D-glucose and
// L-alanine at start-up.
// Usage: npm run bench:b2d [-- --no-build] [-- --no-chrome] [-- --app=http://localhost:5183/]
import { writeFileSync } from 'node:fs';
import { startApp } from './lib/app.mjs';
import { docToJSON } from './lib/docjson.mjs';
import { environment } from './lib/env.mjs';
import { indigoToMolfile } from './lib/indigo.mjs';
import { identity, rdkit, src } from './lib/olomol.mjs';
import { pubchemByName } from './lib/pubchem.mjs';
import { saveResults } from './lib/results.mjs';
import { rng } from './lib/rng.mjs';
import { median, wilson } from './lib/stats.mjs';

const started = performance.now();
const SEED = 20261122;
const RDKit = await rdkit();
const env = await environment(RDKit);
const { readAny, writeAs } = await src('io/files.js');
const { readMolfile } = await src('io/molfile.js');
const { Editor } = await src('editor/editor.js');
const { getRDKit } = await src('io/rdkit.js');
await getRDKit(); // (olomol's own RDKit, which its tools use, loaded before the first click)

// --- the compounds: what they are called here, and the name PubChem is asked for ---
const ALDOSES = ['glyceraldehyde', 'erythrose', 'threose', 'ribose', 'arabinose', 'xylose', 'lyxose', 'allose', 'altrose', 'glucose', 'mannose', 'gulose', 'idose', 'galactose', 'talose'];
const AMINO = ['alanine', 'arginine', 'asparagine', 'aspartic acid', 'cysteine', 'glutamine', 'glutamic acid', 'histidine', 'isoleucine', 'leucine', 'lysine', 'methionine', 'phenylalanine', 'proline', 'serine', 'threonine', 'tryptophan', 'tyrosine', 'valine'];
const COMPOUNDS = [];
for (const name of ALDOSES) {
  for (const dl of ['D', 'L']) {
    // (the open-chain form: "aldehydo-" where PubChem's name for the plain sugar is its ring)
    let query = `aldehydo-${dl}-${name}`;
    if (['glyceraldehyde', 'erythrose', 'threose'].includes(name)) query = `${dl}-${name}`;
    if (name === 'glucose' && dl === 'L') query = '(2S,3R,4S,5S)-2,3,4,5,6-pentahydroxyhexanal'; // (PubChem's "aldehydo-L-glucose" is its pyranose)
    COMPOUNDS.push({ name: `${dl}-${name}`, query, kind: 'aldose' });
  }
}
for (const [name, query] of [['D-erythrulose', 'D-erythrulose'], ['D-ribulose', 'D-ribulose'], ['D-xylulose', 'D-xylulose'], ['D-psicose', 'keto-D-psicose'], ['D-fructose', 'keto-D-fructose'], ['D-sorbose', 'keto-D-sorbose'], ['D-tagatose', 'keto-D-tagatose']]) {
  COMPOUNDS.push({ name, query, kind: 'ketose' });
}
COMPOUNDS.push({ name: 'glycine', query: 'glycine', kind: 'amino acid' });
for (const name of AMINO) for (const dl of ['L', 'D']) COMPOUNDS.push({ name: `${dl}-${name}`, query: `${dl}-${name}`, kind: 'amino acid' });
COMPOUNDS.push(
  { name: '(R,R)-tartaric acid', query: 'L-tartaric acid', kind: 'tartaric acid' },
  { name: '(S,S)-tartaric acid', query: 'D-tartaric acid', kind: 'tartaric acid' },
  { name: 'meso-tartaric acid', query: 'meso-tartaric acid', kind: 'tartaric acid' },
  { name: '(2R,3S)-2,3-dibromobutane', query: '(2R,3S)-2,3-dibromobutane', kind: 'dibromobutane' },
  // (no name of PubChem's gives (2R,3R) but this record's, whose structure is (2R,3R))
  { name: '(2R,3R)-2,3-dibromobutane', query: 'Butane, 2,3-dibromo-, threo', kind: 'dibromobutane' },
  { name: 'Ala-Ala-Ala', query: 'L-alanyl-L-alanyl-L-alanine', kind: 'chain with N in it' },
  { name: 'Thr-Thr', query: 'L-threonyl-L-threonine', kind: 'chain with N in it' },
  { name: 'Ile-Thr', query: 'L-isoleucyl-L-threonine', kind: 'chain with N in it' },
  { name: 'Ile-Ile', query: 'L-isoleucyl-L-isoleucine', kind: 'chain with N in it' },
  { name: 'D-glucitol', query: 'D-glucitol', kind: 'alditol, aldonic acid' },
  { name: 'D-gluconic acid', query: 'D-gluconic acid', kind: 'alditol, aldonic acid' },
);
const answers = await pubchemByName(COMPOUNDS.map((c) => c.query), new URL('data/b2d-pubchem.json', import.meta.url));

// --- shared ---
const truthOf = (smiles) => {
  const id = identity(RDKit, smiles);
  return { smiles: id.smiles, inchikey: id.inchikey };
};
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

// How a SMILES differs from the truth, centre by centre (RDKit's CIP labels, the atoms matched by constitution, the
// matching that disagrees least): 'right', 'missed' (some centres without stereo, none other), 'wrong' (a centre
// the other way, or another molecule)
function judge(truthSmiles, gotSmiles) {
  if (!gotSmiles) return { verdict: 'wrong', note: 'no SMILES' };
  if (gotSmiles === truthSmiles) return { verdict: 'right', wrongCentres: 0, missedCentres: 0 };
  const t = RDKit.get_mol(truthSmiles);
  const g = RDKit.get_mol(gotSmiles);
  try {
    if (!g) return { verdict: 'wrong', note: 'RDKit cannot read it' };
    const flat = (s) => identity(RDKit, s.replace(/@+/g, '').replace(/[/\\]/g, '')).smiles;
    if (flat(truthSmiles) !== flat(gotSmiles)) return { verdict: 'wrong', note: 'another molecule' };
    // (RDKit marks a possible centre with no stereo "(?)": that is no label)
    const labels = (mol) => new Map((JSON.parse(mol.get_stereo_tags()).CIP_atoms ?? []).filter(([, l]) => /^\((R|S|r|s)\)$/.test(l)).map(([i, l]) => [i, l]));
    const [lt, lg] = [labels(t), labels(g)];
    const matches = JSON.parse(t.get_substruct_matches(g, JSON.stringify({ uniquify: false, maxMatches: 5000 })) || '[]');
    let best = null;
    for (const m of matches.length ? matches : [[]]) {
      const atoms = m.atoms ?? m;
      let wrong = 0;
      let missed = 0;
      for (const [ti, label] of lt) {
        const gi = atoms.indexOf(ti);
        const other = gi < 0 ? undefined : lg.get(gi);
        if (other === undefined) missed += 1;
        else if (other !== label) wrong += 1;
      }
      if (!best || wrong < best.wrong || (wrong === best.wrong && missed < best.missed)) best = { wrong, missed };
    }
    if (best.wrong) return { verdict: 'wrong', wrongCentres: best.wrong, missedCentres: best.missed, note: `${best.wrong} centre(s) the other way` };
    if (best.missed) return { verdict: 'missed', wrongCentres: 0, missedCentres: best.missed, note: `${best.missed} centre(s) without stereo` };
    return { verdict: 'wrong', wrongCentres: 0, missedCentres: 0, note: 'other stereo (a double bond)' };
  } finally {
    t?.delete();
    g?.delete();
  }
}

// A wedge drawing of a SMILES (RDKit's 2D coordinates and wedges, read by olomol), to compare by eye.
function wedgeDrawing(smiles) {
  const mol = RDKit.get_mol(smiles);
  mol.set_new_coords();
  if (mol.get_num_atoms() > 2) mol.normalize_depiction(1);
  const { doc } = readMolfile(mol.get_molblock());
  mol.delete();
  return docToJSON(doc);
}

const drawings = {};

// ======================= the conversions: the app's tools in an Editor =======================

const EVENT = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
// A click with a tool on an atom: what olomol said and whether the drawing changed
async function click(ed, tool, atomId) {
  ed.setTool({ name: tool });
  ed.notice = null;
  const before = JSON.stringify([[...ed.doc.atoms.values()], [...ed.doc.bonds.values()]]);
  const atom = ed.doc.atoms.get(atomId);
  ed.pointerDown([atom.x, atom.y], EVENT);
  ed.pointerUp([atom.x, atom.y], EVENT);
  if (ed.tool.made) await ed.tool.made.made; // (the tool works it out with RDKit, then changes the drawing)
  await new Promise((resolve) => setTimeout(resolve, 0));
  const changed = before !== JSON.stringify([[...ed.doc.atoms.values()], [...ed.doc.bonds.values()]]);
  return { changed, message: ed.notice?.text ?? '' };
}
// an atom to click: one with fewer than four bonds (a click on a crossing would read it as drawn by hand)
const clickable = (doc, prefer = null) => {
  const bonds = (id) => [...doc.bonds.values()].filter((b) => b.a === id || b.b === id).length;
  return [...doc.atoms.values()].find((a) => (!prefer || prefer(a)) && bonds(a.id) < 4)?.id ?? [...doc.atoms.keys()][0];
};

const CONVERSIONS = [
  { key: 'toFischer', label: 'wedges → Fischer', tool: 'fischer' },
  { key: 'toZigzag', label: 'Fischer → zigzag', tool: 'zigzag' },
  { key: 'backToFischer', label: 'zigzag → Fischer', tool: 'fischer' },
];

const conversionCases = [];
for (const compound of COMPOUNDS) {
  const pubchem = answers[compound.query];
  const id = `B2d-conv-${compound.name.replace(/[^\w+-]+/g, '-').replace(/-$/, '')}`;
  const c = { id, part: 'conversions', name: compound.name, kind: compound.kind, query: compound.query, cid: pubchem.cid ?? null, pubchemSmiles: pubchem.smiles ?? null, steps: [] };
  conversionCases.push(c);
  if (!pubchem.smiles) {
    Object.assign(c, { status: 'excluded', reason: `PubChem doesn't know "${compound.query}": ${pubchem.error}` });
    continue;
  }
  c.expected = truthOf(pubchem.smiles);
  const mol = RDKit.get_mol(pubchem.smiles);
  c.centres = (JSON.parse(mol.get_stereo_tags()).CIP_atoms ?? []).length;
  mol.delete();
  const { doc } = await readAny(pubchem.smiles);
  const ed = new Editor();
  ed.setDoc(doc);
  c.input = await olomolSays(ed.doc);
  drawings[`${id}:input`] = docToJSON(ed.doc);
  if (c.input.smiles !== c.expected.smiles) {
    // (the drawing pasting makes is not PubChem's molecule: nothing to convert)
    Object.assign(c, { status: 'excluded', reason: `olomol's drawing of PubChem's SMILES is another stereoisomer already (${c.input.smiles}): not converted` });
    continue;
  }
  let stopped = false;
  for (const conversion of CONVERSIONS) {
    const step = { key: conversion.key, label: conversion.label };
    c.steps.push(step);
    if (stopped) {
      step.outcome = 'not run';
      continue;
    }
    // (the Fischer projection's zigzag: clicked on a centre; the rest on any atom with fewer than four bonds)
    const target = conversion.key === 'toZigzag' ? [...ed.doc.atoms.values()].find((a) => a.projection === 'fischer')?.id ?? clickable(ed.doc) : clickable(ed.doc);
    const { changed, message } = await click(ed, conversion.tool, target);
    step.message = message;
    if (!changed) {
      step.outcome = 'refused';
      stopped = true;
      continue;
    }
    const got = await olomolSays(ed.doc);
    step.got = got;
    step.centresDrawn = [...ed.doc.atoms.values()].filter((a) => a.projection === 'fischer').length;
    const j = judge(c.expected.smiles, got.smiles);
    step.outcome = got.smiles === c.expected.smiles && got.inchikey === c.expected.inchikey ? 'right' : 'wrong';
    if (step.outcome === 'wrong') step.note = j.note ?? (got.inchikey !== c.expected.inchikey ? 'the InChIKey differs' : '');
    drawings[`${id}:${conversion.key}`] = docToJSON(ed.doc);
    if (step.outcome === 'wrong') stopped = true;
  }
  const outcomes = c.steps.map((s) => s.outcome);
  c.status = outcomes.includes('wrong') ? 'fail' : outcomes.includes('refused') ? 'info' : 'pass';
  c.badge = outcomes.includes('wrong') ? 'wrong' : outcomes.includes('refused') ? 'refused' : 'right';
  const wrong = c.steps.find((s) => s.outcome === 'wrong');
  const refused = c.steps.find((s) => s.outcome === 'refused');
  c.reason = wrong ? `${wrong.label}: another molecule or stereoisomer (${wrong.note || wrong.got?.smiles})` : refused ? `${refused.label} refused: “${refused.message}”` : '';
  drawings[`exp:${c.expected.smiles}`] = wedgeDrawing(c.expected.smiles);
  console.log('B2d conversion', compound.name, outcomes.join(' '), refused ? refused.message : '');
}

// ======================= hand-drawn Fischer projections, built here =======================

// A molecule from RDKit (not olomol): atoms (element, implicit H, stereo), bonds (Kekulé orders), RDKit's own 2D
// coordinates (y down, for laying out groups away from the chain), which bonds are in a ring
function moleculeOf(smiles) {
  const mol = RDKit.get_mol(smiles);
  try {
    const json = JSON.parse(mol.get_json());
    const defaults = json.defaults.atom;
    const m = json.molecules[0];
    const atoms = m.atoms.map((a) => ({ z: a.z ?? defaults.z, h: a.impHs ?? defaults.impHs, charge: a.chg ?? defaults.chg, stereo: a.stereo ?? defaults.stereo }));
    mol.set_new_coords();
    const lines = mol.get_molblock(JSON.stringify({ kekulize: true })).split('\n');
    const n = Number(lines[3].slice(0, 3));
    const nb = Number(lines[3].slice(3, 6));
    lines.slice(4, 4 + n).forEach((l, i) => Object.assign(atoms[i], { el: l.slice(31, 34).trim(), x: Number(l.slice(0, 10)), y: -Number(l.slice(10, 20)) }));
    const bonds = lines.slice(4 + n, 4 + n + nb).map((l) => ({ a: Number(l.slice(0, 3)) - 1, b: Number(l.slice(3, 6)) - 1, order: Number(l.slice(6, 9)) }));
    const near = atoms.map(() => []);
    for (const b of bonds) {
      near[b.a].push({ to: b.b, order: b.order });
      near[b.b].push({ to: b.a, order: b.order });
    }
    // a bond in a ring: its ends still joined without it
    const joined = (from, to, skip) => {
      const seen = new Set([from]);
      for (const stack = [from]; stack.length;) {
        const at = stack.pop();
        for (const { to: next } of near[at]) {
          if ((at === skip[0] && next === skip[1]) || (at === skip[1] && next === skip[0]) || seen.has(next)) continue;
          if (next === to) return true;
          seen.add(next);
          stack.push(next);
        }
      }
      return false;
    };
    const inRing = new Set();
    for (const b of bonds) if (joined(b.a, b.b, [b.a, b.b])) inRing.add(b.a).add(b.b);
    return { atoms, bonds, near, inRing };
  } finally {
    mol.delete();
  }
}

// The vertical chain: the longest path of carbons outside rings with every stereocentre inside it (not at an end),
// the end more oxidised (bond orders to heteroatoms, then those of the next atom along) at the top; null if none
function chainOf(m) {
  const centres = m.atoms.map((a, i) => (a.stereo === 'cw' || a.stereo === 'ccw' ? i : -1)).filter((i) => i >= 0);
  const ok = (i) => m.atoms[i].z === 6 && !m.inRing.has(i);
  let best = null;
  const walk = (path) => {
    const inside = new Set(path.slice(1, -1));
    if (path.length >= 3 && centres.every((c) => inside.has(c)) && (!best || path.length > best.length)) best = [...path];
    for (const { to } of m.near[path.at(-1)]) {
      if (ok(to) && !path.includes(to)) {
        path.push(to);
        walk(path);
        path.pop();
      }
    }
  };
  m.atoms.forEach((a, i) => ok(i) && walk([i]));
  if (!best || !centres.length) return null;
  const hetero = (i) => m.near[i].filter(({ to }) => m.atoms[to].z !== 6 && m.atoms[to].z !== 1).reduce((s, { order }) => s + order, 0);
  const score = (path) => path.map(hetero);
  const [a, b] = [score(best), score([...best].reverse())];
  const k = a.findIndex((v, i) => v !== b[i]);
  if (k >= 0 && b[k] > a[k]) best.reverse();
  // (the centres from the top down)
  return { chain: best, centres: best.filter((i) => centres.includes(i)) };
}

const rotate = ([x, y], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];

// The projection's atoms and bonds (y down), for `sides` (per centre, in chain order: true = its first group on the
// left), `arms` (lengths: { gaps: per chain bond, left, right: per centre }), turned by `degrees`. Returns
// { atoms: [{ el, x, y, charge }], bonds: [{ a, b, order, wedge? }], crossings: atom indices, wedges: per centre
// [left bond, right bond] } (the explicit H of each centre added after the molecule's atoms)
function projection(m, { chain, centres }, sides, arms, degrees = 0) {
  const atoms = m.atoms.map((a) => ({ el: a.el, charge: a.charge, x: null, y: null }));
  const bonds = m.bonds.map((b) => ({ ...b }));
  const inChain = new Set(chain);
  const lengths = m.bonds.map((b) => Math.hypot(m.atoms[b.a].x - m.atoms[b.b].x, m.atoms[b.a].y - m.atoms[b.b].y)).sort((p, q) => p - q);
  const unit = 1 / lengths[Math.floor(lengths.length / 2)];
  // a group (its atom `root`, on chain atom `from`) put at `at`, the rest of it as RDKit drew it, turned rigidly so
  // that it points the way `dir` does
  const place = (root, from, at) => {
    atoms[root].x = at[0];
    atoms[root].y = at[1];
    const members = [];
    const seen = new Set([from, root]);
    for (const stack = [root]; stack.length;) {
      const i = stack.pop();
      for (const { to } of m.near[i]) if (!seen.has(to) && !inChain.has(to)) { seen.add(to); members.push(to); stack.push(to); }
    }
    const v = [m.atoms[root].x - m.atoms[from].x, m.atoms[root].y - m.atoms[from].y];
    const d = [at[0] - atoms[from].x, at[1] - atoms[from].y];
    const turn = Math.atan2(d[1], d[0]) - Math.atan2(v[1], v[0]);
    for (const i of members) {
      const [dx, dy] = rotate([(m.atoms[i].x - m.atoms[root].x) * unit, (m.atoms[i].y - m.atoms[root].y) * unit], turn);
      atoms[i].x = at[0] + dx;
      atoms[i].y = at[1] + dy;
    }
  };
  let y = 0;
  chain.forEach((i, k) => {
    atoms[i].x = 0;
    atoms[i].y = y;
    y += arms.gaps[k] ?? 0;
  });
  const wedges = [];
  const crossings = [];
  chain.forEach((i, k) => {
    const groups = m.near[i].filter(({ to }) => !inChain.has(to)).map(({ to }) => to);
    const centre = centres.indexOf(i);
    if (centre >= 0) {
      while (groups.length < 2) {
        atoms.push({ el: 'H', charge: 0, x: null, y: null });
        bonds.push({ a: i, b: atoms.length - 1, order: 1 });
        groups.push(atoms.length - 1);
      }
      const [left, right] = sides[centre] ? groups : [groups[1], groups[0]];
      const at = (to, dx) => (to >= m.atoms.length ? Object.assign(atoms[to], { x: dx, y: atoms[i].y }) : place(to, i, [dx, atoms[i].y]));
      at(left, -arms.left[centre]);
      at(right, arms.right[centre]);
      const bondTo = (to) => bonds.findIndex((b) => (b.a === i && b.b === to) || (b.b === i && b.a === to));
      wedges.push([bondTo(left), bondTo(right)]);
      crossings.push(i);
      return;
    }
    const end = k === 0 ? -1 : k === chain.length - 1 ? 1 : 0;
    const dirs = end === 0 ? [[1, 0], [-1, 0]] : { 1: [[0, end]], 2: [[-0.87, end * 0.5], [0.87, end * 0.5]], 3: [[-1, 0], [0, end], [1, 0]] }[groups.length] ?? [];
    groups.forEach((to, n) => place(to, i, [atoms[i].x + dirs[n][0], atoms[i].y + dirs[n][1]]));
  });
  if (atoms.some((a) => a.x === null)) throw new Error('an atom not placed');
  if (degrees) {
    const [cx, cy] = [atoms.reduce((s, a) => s + a.x, 0) / atoms.length, atoms.reduce((s, a) => s + a.y, 0) / atoms.length];
    for (const a of atoms) [a.x, a.y] = rotate([a.x - cx, a.y - cy], (degrees * Math.PI) / 180).map((v, n) => v + [cx, cy][n]);
  }
  return { atoms, bonds, crossings, wedges };
}

// Our own V2000 molfile (y up, as molfiles have it) of a projection, `wedged`: bond indices drawn as a wedge from
// their first atom (the centre) towards the viewer
function molfileOf({ atoms, bonds }, wedged = new Set()) {
  const pad = (v, n) => String(v).padStart(n);
  const lines = ['', '  bench    2D', '', `${pad(atoms.length, 3)}${pad(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`];
  for (const a of atoms) lines.push(`${a.x.toFixed(4).padStart(10)}${(-a.y).toFixed(4).padStart(10)}${'0.0000'.padStart(10)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  bonds.forEach((b, k) => lines.push(`${pad(b.a + 1, 3)}${pad(b.b + 1, 3)}${pad(b.order, 3)}${pad(wedged.has(k) ? 1 : 0, 3)}`));
  const charged = atoms.map((a, i) => [i, a.charge ?? 0]).filter(([, c]) => c);
  if (charged.length) lines.push(`M  CHG${pad(charged.length, 3)}${charged.map(([i, c]) => `${pad(i + 1, 4)}${pad(c, 4)}`).join('')}`);
  lines.push('M  END');
  return lines.join('\n');
}
// (a wedge's narrow end at the centre: the bond written from the centre)
const fromCentre = (p, centreOf) => ({ ...p, bonds: p.bonds.map((b, k) => (centreOf.has(k) && b.a !== centreOf.get(k) ? { ...b, a: b.b, b: b.a } : b)) });
// What the projection means, read by RDKit: each centre's left (or right) horizontal bond a wedge
function meaning(p, side = 0) {
  const centreOf = new Map(p.wedges.map((w, n) => [w[side], p.crossings[n]]));
  // (a wedged H stays in RDKit's SMILES of the molfile: read once more, as a SMILES, without it)
  const smiles = identity(RDKit, molfileOf(fromCentre(p, centreOf), new Set(centreOf.keys()))).smiles;
  return smiles && identity(RDKit, smiles).smiles;
}
// The same projection as plain crossings in a KET file (Ketcher's format; y up, as Indigo reads it: checked below)
function ketOf({ atoms, bonds }) {
  return JSON.stringify({
    root: { nodes: [{ $ref: 'mol0' }] },
    mol0: {
      type: 'molecule',
      atoms: atoms.map((a) => ({ label: a.el, location: [Number(a.x.toFixed(4)), Number((-a.y).toFixed(4)), 0], ...(a.charge ? { charge: a.charge } : {}) })),
      bonds: bonds.map((b) => ({ type: b.order, atoms: [b.a, b.b] })),
    },
  });
}

// Which side each centre's groups go: the first assignment RDKit reads as PubChem's stereoisomer (with the left
// wedges, and the same with the right ones), or null
function sidesFor(m, chain, truthSmiles) {
  const n = chain.centres.length;
  const plain = { gaps: chain.chain.map(() => 1), left: Array(n).fill(1), right: Array(n).fill(1) };
  for (let bits = 0; bits < 2 ** n; bits++) {
    const sides = Array.from({ length: n }, (_, k) => Boolean((bits >> k) & 1));
    const p = projection(m, chain, sides, plain);
    if (meaning(p, 0) === truthSmiles && meaning(p, 1) === truthSmiles) return sides;
  }
  return null;
}

// --- checks of the builder, before anything is measured ---
// KET's y axis points up: a KET atom at y = 1 is at y = 1 in Indigo's molfile (whose y axis points up)
{
  const ket = ketOf({ atoms: [{ el: 'C', x: 0, y: 0 }, { el: 'O', x: 0, y: -1 }], bonds: [{ a: 0, b: 1, order: 1 }] });
  const lines = (await indigoToMolfile(ket)).split('\n');
  const oxygen = lines.slice(4, 6).find((l) => l.slice(31, 34).trim() === 'O');
  if (!(Number(oxygen.slice(10, 20)) > 0.5)) throw new Error(`KET y axis: the O drawn above came out at ${oxygen.slice(10, 20)}`);
}
// the textbook projections: D-glyceraldehyde's OH on the right, D-glucose's right, left, right, right, L-alanine's
// NH2 on the left (CHO or CO2H at the top)
const sideOfHeavy = (m, chain, sides) => chain.centres.map((c, k) => {
  const groups = m.near[c].filter(({ to }) => !chain.chain.includes(to)).map(({ to }) => to);
  const heavyFirst = groups.length < 2 || m.atoms[groups[0]].z !== 1;
  return (sides[k] === heavyFirst) ? 'L' : 'R';
}).join('');
for (const [query, want] of [['D-glyceraldehyde', 'R'], ['aldehydo-D-glucose', 'RLRR'], ['L-alanine', 'L']]) {
  const m = moleculeOf(answers[query].smiles);
  const chain = chainOf(m);
  const truth = truthOf(answers[query].smiles).smiles;
  const sides = sidesFor(m, chain, truth);
  const got = sides && sideOfHeavy(m, chain, sides);
  const top = m.atoms[chain.chain[0]];
  if (got !== want || m.near[chain.chain[0]].every(({ to }) => m.atoms[to].z !== 8)) throw new Error(`builder check: ${query} drawn ${got} (top ${top.el}), textbooks ${want}`);
}

const VARIANTS = [
  { key: 'straight', degrees: 0 },
  { key: 'turned +3°', degrees: 3 },
  { key: 'turned −3°', degrees: -3 },
  { key: 'turned +8°', degrees: 8 },
  { key: 'turned −8°', degrees: -8 },
  { key: 'uneven arms', degrees: 0, uneven: true },
  { key: 'uneven arms, turned +8°', degrees: 8, uneven: true },
  // (beyond what was asked: nearer and past the 15° up to which a bond counts as horizontal or vertical
  // (chem/fischer.js), where a miss is right and a wrong reading is not)
  { key: 'turned +12°', degrees: 12, extra: true },
  { key: 'turned +20°', degrees: 20, extra: true },
];
const random = rng(SEED);
const handCases = [];
for (const c of conversionCases) {
  const base = { part: 'hand-drawn', name: c.name, kind: c.kind, cid: c.cid, pubchemSmiles: c.pubchemSmiles };
  if (!c.expected) continue;
  const m = moleculeOf(c.pubchemSmiles);
  const chain = chainOf(m);
  const slug = c.name.replace(/[^\w+-]+/g, '-').replace(/-$/, '');
  if (!chain) {
    const why = !m.atoms.some((a) => a.stereo === 'cw' || a.stereo === 'ccw') ? 'no stereocentre' : 'its stereocentres are not all on one open chain of carbons (a ring, or a heteroatom between them)';
    handCases.push({ ...base, id: `B2d-hand-${slug}`, variant: 'none', status: 'excluded', reason: `Not drawn as a Fischer projection: ${why}` });
    continue;
  }
  const sides = sidesFor(m, chain, c.expected.smiles);
  if (!sides) {
    handCases.push({ ...base, id: `B2d-hand-${slug}`, variant: 'none', status: 'excluded', reason: 'The builder found no projection RDKit reads as PubChem\'s stereoisomer' });
    continue;
  }
  const n = chain.centres.length;
  for (const variant of VARIANTS) {
    const arm = () => (variant.uneven ? random.uniform(0.6, 1.4) : 1);
    const arms = { gaps: chain.chain.map(arm), left: Array.from({ length: n }, arm), right: Array.from({ length: n }, arm) };
    const p = projection(m, chain, sides, arms, variant.degrees);
    const id = `B2d-hand-${slug}-${variant.key.replace(/[^\w+−-]+/g, '-').replace(/-$/, '')}`;
    // (its meaning, as built: what RDKit reads with the wedges, the arms uneven and the drawing turned too)
    const built = meaning(p, 0);
    handCases.push({ ...base, id, variant: variant.key, ket: ketOf(p), crossings: p.crossings, atomCount: p.atoms.length, elements: p.atoms.map((a) => a.el), expected: c.expected, builtMeans: built, arms: variant.uneven ? arms : null, degrees: variant.degrees });
  }
}

// --- read in the app, in Chrome: pasted, each crossing clicked with the Fischer tool on a fresh copy ---
const chrome = { ran: false };
const toRead = handCases.filter((h) => h.ket);
if (!process.argv.includes('--no-chrome')) {
  const app = await startApp({ pages: 4 });
  chrome.ran = true;
  chrome.url = app.url;
  let next = 0;
  const work = async (page) => {
    while (next < toRead.length) {
      const h = toRead[next++];
      h.clicks = [];
      for (let k = 0; k < h.crossings.length; k++) {
        const put = await page.evaluate(async (ket) => {
          const ed = window.olomol;
          ed.setDoc({ atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), fills: new Map(), brackets: new Map(), orbitals: new Map(), overlaps: new Map(), nextId: 1 });
          await window.olomolTest.paste(ket);
          ed.setTool({ name: 'fischer' });
          ed.fit(window.innerWidth, window.innerHeight);
          ed.emit();
          const atoms = [...ed.doc.atoms.values()].map((a) => ({ id: a.id, el: a.el, x: a.x, y: a.y }));
          return { atoms, view: { ...ed.view }, smiles: await window.olomolTest.writeAs('smiles') };
        }, h.ket);
        if (put.atoms.length !== h.atomCount || put.atoms.some((a, i) => a.el !== h.elements[i])) throw new Error(`${h.id}: the pasted atoms are not the KET's, in order`);
        const atom = put.atoms[h.crossings[k]];
        await page.mouse.click(atom.x * put.view.scale + put.view.tx, atom.y * put.view.scale + put.view.ty);
        await page.waitForTimeout(30);
        const after = await page.evaluate(async () => {
          const ed = window.olomol;
          return {
            smiles: await window.olomolTest.writeAs('smiles'), inchi: await window.olomolTest.writeAs('inchi'),
            notice: ed.notice?.text ?? '', centres: [...ed.doc.atoms.values()].filter((a) => a.projection === 'fischer').length,
            doc: { atoms: [...ed.doc.atoms.values()], bonds: [...ed.doc.bonds.values()], nextId: ed.doc.nextId },
          };
        });
        const got = { smiles: identity(RDKit, after.smiles).smiles ?? after.smiles, inchikey: after.inchi ? RDKit.get_inchikey_for_inchi(after.inchi) : null };
        h.clicks.push({ crossing: k, before: identity(RDKit, put.smiles).smiles, got, notice: after.notice, centres: after.centres, judged: judge(h.expected.smiles, got.smiles) });
        if (k === 0) {
          const map = (list) => new Map(list.map((o) => [o.id, o]));
          drawings[`${h.id}:read`] = docToJSON({ atoms: map(after.doc.atoms), bonds: map(after.doc.bonds), nextId: after.doc.nextId });
        }
      }
    }
  };
  await Promise.all(app.pages.map(work));
  if (app.errors.length) console.log('page errors:', app.errors.slice(0, 5));
  await app.close();
}

for (const h of handCases) {
  if (!h.ket) continue;
  // the drawing as built, for the report (atoms in the KET's order; their ids 1…)
  const atoms = new Map();
  const bonds = new Map();
  const p = JSON.parse(h.ket).mol0;
  p.atoms.forEach((a, i) => atoms.set(i + 1, { id: i + 1, el: a.label, x: a.location[0], y: -a.location[1], charge: a.charge ?? 0, radical: 0 }));
  p.bonds.forEach((b, i) => bonds.set(p.atoms.length + 1 + i, { id: p.atoms.length + 1 + i, a: b.atoms[0] + 1, b: b.atoms[1] + 1, order: b.type, stereo: '' }));
  drawings[`${h.id}:drawn`] = docToJSON({ atoms, bonds, nextId: atoms.size + bonds.size + 1 });
  drawings[`exp:${h.expected.smiles}`] ??= wedgeDrawing(h.expected.smiles);
  if (h.builtMeans !== h.expected.smiles) {
    Object.assign(h, { status: 'excluded', reason: `As built (arms, turn), RDKit reads the wedge version as ${h.builtMeans}, not PubChem's stereoisomer: the benchmark's drawing is off` });
    continue;
  }
  if (!h.clicks) {
    Object.assign(h, { status: 'excluded', reason: 'not read (run without Chrome)' });
    continue;
  }
  const verdicts = h.clicks.map((k) => k.judged.verdict);
  h.outcome = verdicts.includes('wrong') ? 'wrong' : verdicts.includes('missed') ? 'missed' : 'read';
  h.stereoBefore = h.clicks.some((k) => k.before?.includes('@'));
  h.status = h.outcome === 'wrong' ? 'fail' : h.outcome === 'missed' ? 'info' : 'pass';
  h.badge = h.outcome;
  if (h.outcome !== 'read') {
    const bad = h.clicks.find((k) => k.judged.verdict === h.outcome);
    h.reason = `Clicked at crossing ${bad.crossing + 1} of ${h.crossings.length}: ${bad.judged.note ?? h.outcome} (${bad.got.smiles}); olomol said “${bad.notice}”`;
  }
  delete h.ket;
}

// ======================= summary =======================
const judged = conversionCases.filter((c) => c.steps.length);
const perConversion = Object.fromEntries(CONVERSIONS.map(({ key, label }) => {
  const list = judged.map((c) => c.steps.find((s) => s.key === key)).filter((s) => s && s.outcome !== 'not run');
  const count = (o) => list.filter((s) => s.outcome === o).length;
  return [key, { label, n: list.length, right: wilson(count('right'), list.length), refused: wilson(count('refused'), list.length), wrong: wilson(count('wrong'), list.length), notRun: judged.length - list.length }];
}));
const refusalReasons = {};
for (const c of judged) for (const s of c.steps) if (s.outcome === 'refused') (refusalReasons[s.message] ??= []).push(`${c.name} (${s.label})`);
const allSteps = judged.flatMap((c) => c.steps).filter((s) => s.outcome !== 'not run');
const EXTRA = new Set(VARIANTS.filter((v) => v.extra).map((v) => v.key));
const allRead = handCases.filter((h) => h.outcome);
const read = allRead.filter((h) => !EXTRA.has(h.variant)); // (the headline: the variants asked for)
const byVariant = Object.fromEntries(VARIANTS.map(({ key }) => {
  const list = allRead.filter((h) => h.variant === key);
  return [key, { n: list.length, read: wilson(list.filter((h) => h.outcome === 'read').length, list.length), missed: wilson(list.filter((h) => h.outcome === 'missed').length, list.length), wrong: wilson(list.filter((h) => h.outcome === 'wrong').length, list.length) }];
}));
const clicks = read.flatMap((h) => h.clicks);
const summary = {
  compounds: COMPOUNDS.length,
  converted: judged.length,
  excluded: conversionCases.filter((c) => c.status === 'excluded').map((c) => ({ name: c.name, reason: c.reason })),
  perConversion,
  allConversions: { n: allSteps.length, right: wilson(allSteps.filter((s) => s.outcome === 'right').length, allSteps.length), refused: wilson(allSteps.filter((s) => s.outcome === 'refused').length, allSteps.length), wrong: wilson(allSteps.filter((s) => s.outcome === 'wrong').length, allSteps.length) },
  roundTrips: wilson(judged.filter((c) => c.steps.every((s) => s.outcome === 'right')).length, judged.length),
  refusalReasons,
  hand: {
    compounds: new Set(read.map((h) => h.name)).size,
    notDrawn: handCases.filter((h) => h.variant === 'none').map((h) => ({ name: h.name, reason: h.reason })),
    drawings: read.length,
    clicks: clicks.length,
    read: wilson(read.filter((h) => h.outcome === 'read').length, read.length),
    missed: wilson(read.filter((h) => h.outcome === 'missed').length, read.length),
    wrong: wilson(read.filter((h) => h.outcome === 'wrong').length, read.length),
    clicksRead: wilson(clicks.filter((k) => k.judged.verdict === 'right').length, clicks.length),
    stereoBeforeClick: allRead.filter((h) => h.stereoBefore).length,
    extraVariants: [...EXTRA],
    byVariant,
    chrome: chrome.ran,
  },
  medianCentres: median(judged.map((c) => c.centres)),
};
const cases = [...conversionCases, ...handCases];
writeFileSync(new URL('out/b2d-drawings.json', import.meta.url), JSON.stringify(drawings));
saveResults({
  id: 'b2d', title: 'B2d: Fischer projections both ways', environment: env, seconds: Math.round((performance.now() - started) / 100) / 10, seed: SEED,
  truth: "PubChem's isomeric SMILES of the named compound (CID recorded), canonicalised by RDKit; InChIKey by RDKit from it. Hand-drawn projections: built here so that RDKit reads their wedge version (left horizontal bond towards the viewer) as PubChem's stereoisomer",
  variants: VARIANTS,
  summary, cases,
  csvColumns: ['id', 'part', 'name', 'kind', 'cid', 'variant', 'status', 'badge', 'reason', 'toFischer', 'toZigzag', 'backToFischer'],
  csvRows: cases.map((c) => ({ ...c, ...Object.fromEntries((c.steps ?? []).map((s) => [s.key, s.outcome])) })),
});
console.log('B2d conversions', JSON.stringify(Object.fromEntries(Object.entries(perConversion).map(([k, v]) => [k, [v.right.k, v.refused.k, v.wrong.k, v.n]]))));
console.log('B2d hand-drawn', JSON.stringify({ read: summary.hand.read.k, missed: summary.hand.missed.k, wrong: summary.hand.wrong.k, n: read.length }));
process.exit(0);
