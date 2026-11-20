// The examples on the empty canvas (src/ui/examples/*.olom, see
// src/ui/EmptyExample.jsx): built from SMILES, by the app's own layout and
// 3D engines, as the manual's pictures are. Run again after a change to the
// drawing (node scripts/empty-examples.mjs [folder for SVG previews]).
// - diels-alder: a Diels–Alder reaction, then Br2 adds: curved arrows,
//   conditions and a molecule on the arrows, a filled ring, numbers, wedges
// - sn2: (S)-2-bromobutane to (R)-butan-2-ol, the transition state drawn
//   by Layout's 3D engine: lone pairs, δ−, ‡, partial bonds, R/S
// - cobalt: [Co(H2O)6]2+ ⇄ [CoCl4]2−, both from the 3D engine: counts,
//   charged brackets, an equilibrium arrow
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import OCL from 'openchemlib';
import { addArrow, addAtom, addBond, addBracket, addCurve, addFill, addPlus, addText, bondBetween, copyObjects, emptyDoc } from '../src/model/doc.js';
import { chairDoc } from '../src/chem/chair.js';
import { addNewmanMolecule } from '../src/chem/newman.js';
import { catecholamines, friedelCrafts } from './manual-scenes.mjs';
import { align, smallerSide, turnOver } from '../src/arrange/align.js';
import { fischerDoc, haworthDoc } from '../src/chem/projections.js';
import { formulaOf } from '../src/chem/formula.js';
import { templateLayout } from '../src/layout/ringTemplates.js';
import { addParsed, parseMolfile, writeMolfile } from '../src/io/molfile.js';
import { writeOlom } from '../src/io/olom.js';
import { electronsByAtom } from '../src/chem/valence.js';
import { buildComplex, drawingOfModel, transitionCentre, transitionDrawing, views } from '../src/layout/threeD.js';
import { buildScene, keepDrawnCurves, moleculeBox, moleculeCore } from '../src/render/scene.js';
import { fragments } from '../src/model/graph.js';
import { sceneToSVG } from '../src/render/svg.js';

const { version: VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
OCL.Resources.register(readFileSync(new URL('../node_modules/openchemlib/dist/resources.json', import.meta.url), 'utf8'));
const previews = process.argv[2];
const RED = '#d0021b';
const BLUE = '#b5dcff';
const FILL = BLUE;
const ORANGE = '#ffd59e';
const PINK = '#ffbde4';
const PURPLE = '#7a00b0'; // a colour of the paint tool

// a molecule from SMILES, laid out by RDKit, centred at (x, y): its atoms
function place(doc, smiles, x, y, { turn = 0 } = {}) {
  const mol = RDKit.get_mol(smiles);
  mol.set_new_coords();
  mol.normalize_depiction(1);
  mol.straighten_depiction(true);
  const parsed = parseMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })));
  mol.delete();
  if (turn) for (const a of parsed.atoms) [a.x, a.y] = [a.x * Math.cos(turn) - a.y * Math.sin(turn), a.x * Math.sin(turn) + a.y * Math.cos(turn)];
  const { atomIds } = addParsed(parsed, doc, [x, y]);
  return atomIds.map((id) => doc.atoms.get(id));
}
const bondOf = (doc, a, b) => [...doc.bonds.values()].find((x) => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id));
const box = (atoms) => ({ x1: Math.min(...atoms.map((a) => a.x)), x2: Math.max(...atoms.map((a) => a.x)), y1: Math.min(...atoms.map((a) => a.y)), y2: Math.max(...atoms.map((a) => a.y)) });
const ringOf = (doc, atoms) => {
  // the six-membered ring of these atoms (as RDKit numbers a benzene ring: the ring closure found by search)
  const ids = new Set(atoms.map((a) => a.id));
  const near = (id) => [...doc.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a)).filter((n) => ids.has(n));
  for (const start of ids) {
    const walk = (path) => {
      if (path.length === 6) return near(path[5]).includes(path[0]) ? path : null;
      for (const n of near(path.at(-1))) if (!path.includes(n)) { const r = walk([...path, n]); if (r) return r; }
      return null;
    };
    const ring = walk([start]);
    if (ring) return ring;
  }
  return null;
};
const highlight = (doc, atoms, color) => {
  const ids = new Set(atoms.map((a) => a.id));
  for (const a of atoms) a.highlight = color;
  for (const b of doc.bonds.values()) if (ids.has(b.a) && ids.has(b.b)) b.highlight = color;
};
const number = (doc, atoms, n) => addText(doc, 0, 0, String(n), { bold: true, anchor: Math.min(...atoms.map((a) => a.id)) });

// Diels–Alder by hand: s-cis butadiene and ethene, three curved arrows
// the side ('left' | 'right', seen from a to b) of a bond where `point` is
const inside = (doc, bond, point) => {
  const [a, b] = [doc.atoms.get(bond.a), doc.atoms.get(bond.b)];
  return (b.x - a.x) * (point[1] - a.y) - (b.y - a.y) * (point[0] - a.x) > 0 ? SIDE_POSITIVE : SIDE_NEGATIVE;
};
const [SIDE_POSITIVE, SIDE_NEGATIVE] = ['left', 'right']; // as sideOf in src/render/bonds.js

function dielsAlder(doc, x, y) {
  const hex = Array.from({ length: 6 }, (_, k) => [x + Math.cos((k * Math.PI) / 3 + Math.PI / 6), y + Math.sin((k * Math.PI) / 3 + Math.PI / 6)]);
  const gap = (p) => [p[0] + 0.55 * (p[0] - x), p[1] + 0.55 * (p[1] - y)];
  const d = [3, 4, 5, 0].map((k) => addAtom(doc, ...hex[k], 'C')); // diene, on the left
  const e = [1, 2].map((k) => addAtom(doc, ...gap(hex[k]), 'C')); // dienophile, a little apart on the right
  const [b01, b12, b23] = [addBond(doc, d[0].id, d[1].id, 2), addBond(doc, d[1].id, d[2].id), addBond(doc, d[2].id, d[3].id, 2)];
  const bee = addBond(doc, e[0].id, e[1].id, 2);
  // the second lines inside, towards the ring that forms: it looks like part of a benzene
  for (const bond of [b01, b23, bee]) bond.side = inside(doc, bond, [x, y]);
  for (const [from, to] of [[{ bond: b23.id }, { atom: e[0].id }], [{ bond: bee.id }, { atom: d[0].id }], [{ bond: b01.id }, { bond: b12.id }]]) addCurve(doc, from, to, 2, { color: RED });
  void b12;
  return [...d, ...e];
}

// A reaction row at height y from x = 0: molecules (atom lists, drawn
// anywhere: moved into the row), '+', or { arrow: kind, length }; spaced by
// what they look like (labels included). Returns the arrows made.
function row(doc, y, items, gap = 0.7) {
  let x = 0;
  const arrows = [];
  for (const item of items) {
    if (item === '+') {
      addPlus(doc, x + 0.35, y);
      x += 0.7 + gap;
    } else if (item.arrow) {
      arrows.push(addArrow(doc, x, y, x + item.length, y, item.arrow));
      x += item.length + gap;
    } else {
      const scene = buildScene(doc);
      // (an item may be several molecules, put side by side by hand: moved together)
      const ids = new Set(item.map((a) => a.id));
      const members = fragments(doc).filter((m) => m.some((id) => ids.has(id))).flat();
      const b = moleculeBox(members, scene.atoms);
      const core = moleculeCore(members, scene.atoms); // (on the line by its atoms, as Align reaction scheme does: Cl⁻ and H2O level)
      const [dx, dy] = [x - b.x1, y - (core.y1 + core.y2) / 2];
      for (const id of members) { doc.atoms.get(id).x += dx; doc.atoms.get(id).y += dy; }
      x += b.x2 - b.x1 + gap;
    }
  }
  return arrows;
}

// A small drawing (`part`) as Layout's 3D engine draws it (src/layout/relayout.js:
// a complex round its metal, a transition state round its five-bonded atom),
// copied into `doc` at x, y: its atoms
function engine3D(doc, part, x, y, { pick = null } = {}) {
  const electrons = electronsByAtom(part);
  const { molfile, atomIds } = writeMolfile(part);
  const bonds = [...part.bonds.values()];
  const molecule = { atomIds, molfile, elements: atomIds.map((id) => part.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs),
    links: bonds.map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind, stereo: b.stereo })), points: atomIds.map((id) => [part.atoms.get(id).x, part.atoms.get(id).y]) };
  const c = buildComplex(molecule, { OCL }) ?? buildComplex(molecule, { OCL, ...transitionCentre(molecule) });
  const all = views(c.points, molecule.links.map((l) => [l.a, l.b]), { axes: false, flat: c.flat, prefer: c.prefer, complex: c, count: pick ? 12 : 1, labelled: molecule.elements.map((el) => el !== 'C') });
  const view = pick ? all.reduce((best, v) => (pick(v, c) > pick(best, c) ? v : best)) : all[0];
  const model = { metal: c.metal, complex: c, axial: c.axial };
  let drawing = drawingOfModel(RDKit, molecule, model, view);
  if (c.axial) drawing = transitionDrawing(molecule, model, drawing);
  atomIds.forEach((id, k) => { [part.atoms.get(id).x, part.atoms.get(id).y] = drawing.points[k]; });
  bonds.forEach((b, k) => { b.z = drawing.z[k]; });
  for (const [a, b, stereo] of drawing.stereo) {
    const bond = bonds.find((q) => [atomIds[a], atomIds[b]].includes(q.a) && [atomIds[a], atomIds[b]].includes(q.b));
    // (a coordination bond's wedge too: drawn from the metal, it keeps donor → acceptor)
    if (!bond || (bond.kind && bond.kind !== 'dative')) continue;
    bond.stereo = stereo;
    if (stereo && bond.a !== atomIds[a] && bond.kind !== 'dative') [bond.a, bond.b] = [atomIds[a], atomIds[b]];
  }
  const fresh = copyObjects(part, [...part.atoms.keys(), ...part.bonds.keys()], x, y, doc);
  return fresh.filter((id) => doc.atoms.has(id)).map((id) => doc.atoms.get(id));
}

// a complex: a metal and its ligands (element symbols, each a single atom bonded by a dative bond, or
// { el, charge, bond: 'covalent' }), drawn round it, then by the 3D engine
function complexOf(doc, metal, charge, ligands, x, y, options = {}) {
  const part = emptyDoc();
  const m = addAtom(part, 0, 0, metal, { charge });
  ligands.forEach((ligand, k) => {
    const { el, charge: q = 0, bond = 'dative' } = typeof ligand === 'string' ? { el: ligand } : ligand;
    const a = (k * 2 * Math.PI) / ligands.length;
    const l = addAtom(part, 1.5 * Math.cos(a), 1.5 * Math.sin(a), el, { charge: q });
    addBond(part, l.id, m.id, 1, bond === 'dative' ? { kind: 'dative' } : {});
  });
  return engine3D(doc, part, x, y, options);
}

// an octahedron drawn as textbooks do: its axis (the two bonds nearest upright) in the page, the
// four round it a wedge or a hashed wedge (a convention: in the projection the axis tilts a little)
function axisInPage(doc, atoms) {
  const metal = atoms.find((a) => !['O', 'N', 'Cl', 'C', 'H'].includes(a.el));
  const toMetal = [...doc.bonds.values()].filter((b) => b.b === metal.id || b.a === metal.id);
  const upright = (b) => {
    const d = doc.atoms.get(b.a === metal.id ? b.b : b.a);
    return Math.abs(d.y - metal.y) / (Math.hypot(d.x - metal.x, d.y - metal.y) || 1);
  };
  for (const b of [...toMetal].sort((p, q) => upright(q) - upright(p)).slice(0, 2)) b.stereo = '';
}


// Compound numbers on one line under the lowest of `molecules` (as Align reaction scheme puts them).
function numbersOnOneLine(doc, molecules, numbers) {
  const scene = buildScene(doc);
  const boxes = molecules.map((m) => moleculeBox(fragments(doc).find((f) => f.includes(m[0].id)), scene.atoms));
  const bottom = Math.max(...boxes.map((b) => b.y2));
  numbers.forEach((text, k) => { if (bottom - boxes[k].y2 > 1e-6) text.drop = bottom - boxes[k].y2; });
}

// As the editor does after a change: arrows as long as their side arcs need, what is on arrows where
// they put it (src/editor/editor.js, the scene getter).
function settle(doc) {
  for (let k = 0; k < 4; k++) {
    const scene = buildScene(doc);
    for (const [id, ends, own] of scene.arrowFits) {
      Object.assign(doc.arrows.get(id), ends);
      if (own === null) delete doc.arrows.get(id).ownLength;
      else doc.arrows.get(id).ownLength = own;
    }
    for (const { atoms, dx, dy } of scene.arrowMoves) for (const id of atoms) { doc.atoms.get(id).x += dx; doc.atoms.get(id).y += dy; }
  }
}

// the transition state's wedges: CH3 behind, C2H5 in front (checked by RDKit: (S) with C–Br, (R) with C–O)
const TS_WEDGES = ['hash', 'wedge'];
const examples = {};

// 4: a pericyclic reaction, then an addition: Diels–Alder, then + Br2 (a molecule on the arrow, its
// lone pairs shown; anti: trans-1,2-dibromocyclohexane, wedges, its Br with their lone pairs); the
// numbers on one line, as Align reaction scheme puts them
{
  const doc = emptyDoc();
  const da = dielsAlder(doc, 0, 0);
  const cyclohexene = place(doc, 'C1=CCCCC1', 0, 10);
  const dibromide = place(doc, 'Br[C@@H]1CCCC[C@H]1Br', 0, 20);
  const [heat, bromine] = row(doc, 0, [da, { arrow: 'forward', length: 2.6 }, cyclohexene, { arrow: 'forward', length: 3 }, dibromide]);
  addText(doc, 0, 0, 'Δ', { arrow: heat.id });
  const br2 = place(doc, 'BrBr', 0, -10);
  for (const a of br2) Object.assign(a, { lonePairs: 'auto', arrow: bromine.id, arrowSlot: 'above', arrowSign: '+' });
  for (const a of dibromide) if (a.el === 'Br') a.lonePairs = 'auto';
  addFill(doc, ringOf(doc, cyclohexene), BLUE);
  const numbers = [number(doc, cyclohexene, 1), number(doc, dibromide, 2)];
  // as the editor does: Br2 where its arrow puts it; then the numbers on one line under the lowest molecule
  let scene = buildScene(doc);
  for (const { atoms, dx, dy } of scene.arrowMoves) for (const id of atoms) { doc.atoms.get(id).x += dx; doc.atoms.get(id).y += dy; }
  scene = buildScene(doc);
  const boxes = [cyclohexene, dibromide].map((m) => moleculeBox(fragments(doc).find((f) => f.includes(m[0].id)), scene.atoms));
  const bottom = Math.max(...boxes.map((b) => b.y2));
  numbers.forEach((text, k) => { if (bottom - boxes[k].y2 > 1e-6) text.drop = bottom - boxes[k].y2; });
  examples['diels-alder'] = doc;
}

// A: SN2 with inversion: (S)-2-bromobutane, the transition state as Layout draws it, (R)-butan-2-ol
{
  const doc = emptyDoc();
  const oh = addAtom(doc, 0, 0, 'O', { charge: -1, lonePairs: 'auto' });
  const start = place(doc, 'C[C@H](Br)CC', 0, 10);
  const brStart = start.find((a) => a.el === 'Br');
  const c2 = start.find((a) => a.el === 'C' && bondOf(doc, a, brStart));
  brStart.lonePairs = 'auto';
  c2.cipLabel = true;
  // the transition state as Layout draws it: drawn roughly, then by its 3D engine
  const rough = emptyDoc();
  const c = addAtom(rough, 0, 0);
  const o = addAtom(rough, -1.2, 0.1, 'O', { partialCharge: -1 });
  const br = addAtom(rough, 1.2, -0.1, 'Br', { partialCharge: -1 });
  addBond(rough, o.id, c.id, 1, { kind: 'partial' });
  addBond(rough, c.id, br.id, 1, { kind: 'partial' });
  addBond(rough, c.id, addAtom(rough, 0, -1, 'H').id);
  // (the hydroxide comes in behind the Br of (S)-2-bromobutane: the wedges say which way round)
  addBond(rough, c.id, addAtom(rough, -0.5, 0.9).id, 1, { stereo: TS_WEDGES[0] });
  const ch2 = addAtom(rough, 0.5, 0.9);
  addBond(rough, c.id, ch2.id, 1, { stereo: TS_WEDGES[1] });
  addBond(rough, ch2.id, addAtom(rough, 1.4, 1.3).id);
  const ts = engine3D(doc, rough, 0, 20);
  const end = place(doc, 'C[C@@H](O)CC', 0, 30);
  for (const a of end) if (a.el === 'O') a.lonePairs = 'auto';
  end.find((a) => a.el === 'C' && end.some((x) => x.el === 'O' && bondOf(doc, a, x))).cipLabel = true;
  const bromide = addAtom(doc, 0, 40, 'Br', { charge: -1, lonePairs: 'auto' });
  row(doc, 0, [[oh], '+', start, { arrow: 'forward', length: 1.8 }, ts, { arrow: 'forward', length: 1.8 }, end, '+', [bromide]], 1.0);
  const b = box(ts);
  addBracket(doc, b.x1 - 1.0, b.y1 - 0.6, b.x2 + 1.0, b.y2 + 0.75, { sup: '‡', atoms: ts.map((a) => a.id) });
  addCurve(doc, { atom: oh.id }, { atom: c2.id }, 2, { color: RED });
  addCurve(doc, { bond: bondOf(doc, c2, brStart).id }, { atom: brStart.id }, 2, { color: RED });
  examples.sn2 = doc;
}

// cobalt(II), octahedral and tetrahedral, both in 3D: [Co(H2O)6]2+ (pink) + 4 Cl− ⇄ [CoCl4]2− (blue) + 6 H2O;
// every charge written, no lone pairs
{
  const doc = emptyDoc();
  const aqua = complexOf(doc, 'Co', 2, Array(6).fill('O'), 0, 0);
  axisInPage(doc, aqua);
  const cl = addAtom(doc, 0, 10, 'Cl', { charge: -1 });
  const tetra = complexOf(doc, 'Co', 2, Array(4).fill({ el: 'Cl', charge: -1 }), 0, 20);
  const water = place(doc, 'O', 0, 30);
  row(doc, 0, [aqua, '+', [cl], { arrow: 'equilibrium', length: 2.2 }, tetra, '+', water], 1.3);
  for (const [atoms, sup] of [[aqua, '2+'], [tetra, '2−']]) {
    const b = box(atoms);
    addBracket(doc, b.x1 - 0.85, b.y1 - 0.85, b.x2 + 0.85, b.y2 + 0.85, { sup, atoms: atoms.map((a) => a.id) });
  }
  addText(doc, 0, 0, '4', { anchor: cl.id, slot: 'left' });
  addText(doc, 0, 0, '6', { anchor: water[0].id, slot: 'left' });
  // the colours of the two: pink and blue
  highlight(doc, aqua.filter((a) => a.el === 'Co'), PINK);
  highlight(doc, tetra.filter((a) => a.el === 'Co'), BLUE);
  for (const a of doc.atoms.values()) a.lonePairs = 0; // (none shown, whatever the settings)
  examples.cobalt = doc;
}

// an enzyme: lactate dehydrogenase, pyruvate to (S)-lactate; NADH and H⁺ in and NAD⁺ out on side
// arcs, the enzyme under the arrow, the new stereocentre's R/S
{
  const doc = emptyDoc();
  const pyruvate = place(doc, 'CC(=O)C(=O)[O-]', 0, 0);
  const lactate = place(doc, 'C[C@H](O)C(=O)[O-]', 0, 10);
  const [arrow] = row(doc, 0, [pyruvate, { arrow: 'forward', length: 4.4 }, lactate], 1.2);
  arrow.sides = [{ id: doc.nextId++, side: 'above', way: 'in', reach: 1.3 }, { id: doc.nextId++, side: 'above', way: 'out', reach: 1.3 }];
  addText(doc, 0, 0, 'NADH', { arrow: arrow.id, slot: 'above-in', order: 0 });
  addText(doc, 0, 0, 'H^{+}', { arrow: arrow.id, slot: 'above-in', order: 1 });
  addText(doc, 0, 0, 'NAD^{+}', { arrow: arrow.id, slot: 'above-out' });
  addText(doc, 0, 0, 'LDH', { arrow: arrow.id, slot: 'below' });
  lactate.find((a) => a.el === 'C' && lactate.some((o) => o.el === 'O' && bondOf(doc, a, o)?.order === 1 && !o.charge && [...doc.bonds.values()].filter((b) => b.a === o.id || b.b === o.id).length === 1)).cipLabel = true;
  for (const a of [...pyruvate, ...lactate]) if (a.el === 'O') a.lonePairs = null;
  settle(doc);
  examples.enzyme = doc;
}

// --- more, for the examples window (the help menu) ---

// a reaction scheme with everything round it: compound numbers, conditions on the arrow, a ring filled, a group highlighted
{
  const doc = emptyDoc();
  const salicylic = place(doc, 'O=C(O)c1ccccc1O', 0, 0);
  const anhydride = place(doc, 'CC(=O)OC(C)=O', 0, 10);
  const aspirin = place(doc, 'CC(=O)Oc1ccccc1C(=O)O', 0, 20);
  const acetic = place(doc, 'CC(=O)O', 0, 30);
  const [arrow] = row(doc, 0, [salicylic, '+', anhydride, { arrow: 'forward', length: 3.2 }, aspirin, '+', acetic]);
  addText(doc, 0, 0, 'H_{2}SO_{4}', { arrow: arrow.id });
  addText(doc, 0, 0, '80 °C', { arrow: arrow.id, slot: 'below' });
  addFill(doc, ringOf(doc, aspirin), FILL);
  const ester = aspirin.filter((a, k) => k <= 3); // CH3, C, =O, O
  highlight(doc, ester, ORANGE);
  const numbers = [salicylic, anhydride, aspirin, acetic].map((m, k) => number(doc, m, k + 1));
  numbersOnOneLine(doc, [salicylic, anhydride, aspirin, acetic], numbers);
  examples.aspirin = doc;
}

// radical chlorination of methane: initiation and propagation, fishhooks
{
  const doc = emptyDoc();
  const cl2 = place(doc, 'ClCl', 0, 0);
  for (const a of cl2) a.lonePairs = 'auto';
  const clBond = bondOf(doc, cl2[0], cl2[1]);
  addCurve(doc, { bond: clBond.id }, { atom: cl2[0].id }, 1, { color: RED });
  addCurve(doc, { bond: clBond.id }, { atom: cl2[1].id }, 1, { color: RED });
  const clDot = addAtom(doc, 0, 10, 'Cl', { radical: 2, lonePairs: 'auto' });
  const [light] = row(doc, 0, [cl2, { arrow: 'forward', length: 2.2 }, [clDot]], 1.0);
  addText(doc, 0, 0, 'hν', { arrow: light.id });
  addText(doc, 0, 0, '2', { anchor: clDot.id, slot: 'left' });
  // second row: Cl• + H–CH3 → H–Cl + •CH3
  const cl = addAtom(doc, 0, 20, 'Cl', { radical: 2, lonePairs: 'auto' });
  const methane = place(doc, 'C', 0, 30);
  const hm = addAtom(doc, methane[0].x - 1, methane[0].y, 'H');
  const ch = addBond(doc, hm.id, methane[0].id);
  addCurve(doc, { atom: cl.id, radical: true }, { atom: hm.id }, 1, { color: RED });
  addCurve(doc, { bond: ch.id }, { atom: hm.id }, 1, { color: RED });
  addCurve(doc, { bond: ch.id }, { atom: methane[0].id }, 1, { color: RED });
  const hcl = place(doc, 'Cl', 0, 40);
  const hh = addAtom(doc, hcl[0].x - 1, hcl[0].y, 'H');
  addBond(doc, hh.id, hcl[0].id);
  hcl[0].lonePairs = 'auto';
  const methyl = addAtom(doc, 0, 50, 'C', { radical: 2 });
  row(doc, 3.2, [[cl], '+', [...methane, hm], { arrow: 'forward', length: 2.2 }, [hh, ...hcl], '+', [methyl]], 1.0);
  examples.radical = doc;
}

// conformations: butane anti ⇄ gauche (Newman), methylcyclohexane axial ⇄ equatorial (chairs)
{
  const doc = emptyDoc();
  const chairAt = (flip, x, y) => {
    // after the ring flip the methyl is equatorial (chairDoc leaves the swap to us)
    const part = chairDoc(flip ? { equatorial: ['C'], flip } : { axial: ['C'] });
    const atoms = [...part.atoms.values()];
    const b = box(atoms);
    const fresh = copyObjects(part, [...part.atoms.keys(), ...part.bonds.keys()], x - (b.x1 + b.x2) / 2, y - (b.y1 + b.y2) / 2, doc);
    return fresh.filter((id) => doc.atoms.has(id)).map((id) => doc.atoms.get(id));
  };
  addNewmanMolecule(doc, 0, 0, { front: ['CH_{3}', 'H', 'H'], back: ['CH_{3}', 'H', 'H'], dihedral: 180 });
  const a1 = addArrow(doc, 1.9, 0, 4.4, 0, 'equilibrium');
  addNewmanMolecule(doc, 6.3, 0, { front: ['CH_{3}', 'H', 'H'], back: ['CH_{3}', 'H', 'H'], dihedral: 60 });
  addText(doc, 0, 0, '3.8 kJ/mol', { arrow: a1.id });
  const ax = chairAt(false, 0, 10);
  const eq = chairAt(true, 0, 20);
  const [a2] = row(doc, 0, [ax, { arrow: 'equilibrium', length: 2.4 }, eq], 1.0);
  // the chairs to the right of the Newman projections
  for (const a of [...ax, ...eq]) a.x += 10.5;
  for (const k of ['x1', 'x2']) a2[k] += 10.5;
  addText(doc, 0, 0, '−7.3 kJ/mol', { arrow: a2.id });
  highlight(doc, ax.filter((a) => [...doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length === 1), ORANGE);
  highlight(doc, eq.filter((a) => [...doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length === 1), ORANGE);
  examples.conformations = doc;
}

// hydrogen bonds: the acetic acid dimer (a ring of eight, two H-bonds)
{
  const doc = emptyDoc();
  const half = (cx, side) => {
    const c = addAtom(doc, cx, 0);
    const me = addAtom(doc, cx - side, 0);
    const o2 = addAtom(doc, cx + side * 0.5, -side * 0.87, 'O', { lonePairs: 'auto' });
    const oh = addAtom(doc, cx + side * 0.5, side * 0.87, 'O', { lonePairs: 'auto' });
    const h = addAtom(doc, cx + side * 1.5, side * 0.87, 'H');
    addBond(doc, c.id, me.id);
    addBond(doc, c.id, o2.id, 2);
    addBond(doc, c.id, oh.id);
    addBond(doc, oh.id, h.id);
    return { o2, h };
  };
  const left = half(0, 1);
  const right = half(3.6, -1);
  addBond(doc, left.h.id, right.o2.id, 1, { kind: 'hbond' });
  addBond(doc, right.h.id, left.o2.id, 1, { kind: 'hbond' });
  examples.hbonds = doc;
}

// the manual's Friedel–Crafts acylation: curved arrows, resonance in brackets, two steps
examples['friedel-crafts'] = friedelCrafts(RDKit);

// a drawing made apart (a template) copied into `doc`, its middle at x, y: old atom id -> new atom
function paste(doc, part, x, y) {
  const atoms = [...part.atoms.values()];
  for (const a of atoms) a.from = a.id;
  const b = box(atoms);
  copyObjects(part, [...part.atoms.keys(), ...part.bonds.keys()], x - (b.x1 + b.x2) / 2, y - (b.y1 + b.y2) / 2, doc);
  const map = new Map();
  for (const a of doc.atoms.values()) if (a.from !== undefined) { map.set(a.from, a); delete a.from; }
  return map;
}
const neighbours = (doc, atom) => [...doc.bonds.values()].filter((b) => b.a === atom.id || b.b === atom.id).map((b) => doc.atoms.get(b.a === atom.id ? b.b : b.a));

// sugars: D-glucose in a Fischer projection ⇄ β-D-glucopyranose in a Haworth one (Templates →
// Projections); C1 and its OH orange, the O that closes the ring blue
{
  const doc = emptyDoc();
  const fischer = paste(doc, fischerDoc({ top: 'CHO', rows: [['H', 'OH'], ['OH', 'H'], ['H', 'OH'], ['H', 'OH']], bottom: 'CH2OH' }), 0, 0);
  const haworth = paste(doc, haworthDoc({ up: ['OH', null, 'OH', null, 'CH2OH'], down: [null, 'OH', null, 'OH'] }), 0, 10);
  row(doc, 0, [[...fischer.values()], { arrow: 'equilibrium', length: 2.4 }, [...haworth.values()]], 1.2);
  highlight(doc, [fischer.get(1)], ORANGE); // CHO
  highlight(doc, [fischer.get(24)], BLUE); // the OH on C5
  highlight(doc, [haworth.get(2), haworth.get(13)], ORANGE); // C1 and its OH (β: up)
  highlight(doc, [haworth.get(1)], BLUE); // the ring O
  addText(doc, 0, 0, 'D-glucose', { anchor: fischer.get(1).id });
  addText(doc, 0, 0, 'β-D-glucopyranose', { anchor: haworth.get(1).id });
  examples.sugars = doc;
}

// polar bonds: δ+ and δ−, dipole arrows from δ+ (the crossed end) to δ−; CO2's two cancel
{
  const doc = emptyDoc();
  const h = addAtom(doc, 0, 0, 'H', { partialCharge: 1 });
  const cl = addAtom(doc, 1, 0, 'Cl', { partialCharge: -1 });
  addBond(doc, h.id, cl.id);
  addArrow(doc, 0, 0.75, 1, 0.75, 'dipole');
  addText(doc, 0, 0, 'μ = 1.1 D', { anchor: h.id, drop: 0.55 });
  const o = addAtom(doc, 4, -0.3, 'O', { partialCharge: -1 });
  const h1 = addAtom(doc, 3.2, 0.3, 'H', { partialCharge: 1 });
  const h2 = addAtom(doc, 4.8, 0.3, 'H', { partialCharge: 1 });
  addBond(doc, o.id, h1.id);
  addBond(doc, o.id, h2.id);
  addArrow(doc, 4, 1.05, 4, 0.3, 'dipole');
  addText(doc, 0, 0, 'μ = 1.85 D', { anchor: o.id, drop: 0.55 });
  const c = addAtom(doc, 8, 0, 'C', { partialCharge: 1, carbonLabel: true });
  const oa = addAtom(doc, 7, 0, 'O', { partialCharge: -1 });
  const ob = addAtom(doc, 9, 0, 'O', { partialCharge: -1 });
  addBond(doc, c.id, oa.id, 2);
  addBond(doc, c.id, ob.id, 2);
  addArrow(doc, 7.85, 0.75, 7.1, 0.75, 'dipole');
  addArrow(doc, 8.15, 0.75, 8.9, 0.75, 'dipole');
  addText(doc, 0, 0, 'μ = 0', { anchor: c.id, drop: 0.55 });
  examples.dipoles = doc;
}

// Lewis structures: the carbonate ion, three resonance structures; every lone pair and charge, the
// carbon written; curved arrows from the first to the second
{
  const doc = emptyDoc();
  const carbonate = (x, double) => {
    const c = addAtom(doc, x, 0, 'C', { carbonLabel: true });
    const os = [[0, -1.1], [-0.95, 0.55], [0.95, 0.55]].map(([dx, dy], k) => addAtom(doc, x + dx, dy, 'O', { charge: k === double ? 0 : -1, lonePairs: 'auto' }));
    const bonds = os.map((oxygen, k) => addBond(doc, c.id, oxygen.id, k === double ? 2 : 1));
    return { atoms: [c, ...os], os, bonds };
  };
  const first = carbonate(0, 0);
  const second = carbonate(10, 1);
  const third = carbonate(20, 2);
  row(doc, 0, [first.atoms, { arrow: 'resonance', length: 1.8 }, second.atoms, { arrow: 'resonance', length: 1.8 }, third.atoms], 1.1);
  addCurve(doc, { atom: first.os[1].id }, { bond: first.bonds[1].id }, 2, { color: RED });
  addCurve(doc, { bond: first.bonds[0].id }, { atom: first.os[0].id }, 2, { color: RED });
  examples.carbonate = doc;
}

// retrosynthesis: the bond to make (orange) taken apart (⇒) into a Grignard reagent and acetone; then
// the synthesis, two steps over one arrow; Ph an abbreviation
{
  const doc = emptyDoc();
  const ph = (x, y) => addAtom(doc, x, y, '*', { alias: 'Ph' });
  const grignard = (y) => {
    const p = ph(0, y);
    const mg = addAtom(doc, 1, y, 'Mg');
    const br = addAtom(doc, 2, y, 'Br');
    addBond(doc, p.id, mg.id);
    addBond(doc, mg.id, br.id);
    return [p, mg, br];
  };
  const target = place(doc, 'CC(C)(O)c1ccccc1', 0, 0);
  const carbinol = target.find((a) => a.el === 'C' && neighbours(doc, a).some((n) => n.el === 'O'));
  const ipso = neighbours(doc, carbinol).find((n) => neighbours(doc, n).length === 3);
  bondOf(doc, carbinol, ipso).highlight = ORANGE;
  const reagent = grignard(10);
  const acetone = place(doc, 'CC(C)=O', 0, 20);
  row(doc, 0, [target, { arrow: 'retro', length: 2 }, reagent, '+', acetone], 1.0);
  const reagent2 = grignard(30);
  const acetone2 = place(doc, 'CC(C)=O', 0, 40);
  const product = place(doc, 'CC(C)(O)c1ccccc1', 0, 50);
  const [steps] = row(doc, 4.6, [reagent2, '+', acetone2, { arrow: 'forward', length: 2.8 }, product], 1.0);
  addText(doc, 0, 0, '1. Et_{2}O\n2. H_{3}O^{+}', { arrow: steps.id, align: 'left' });
  examples.retrosynthesis = doc;
}

// isotope labelling: Fischer esterification with ¹⁸O in the methanol: the ester has it, not the water
{
  const doc = emptyDoc();
  const acid = place(doc, 'CC(=O)O', 0, 0);
  const methanol = place(doc, 'CO', 0, 10);
  const ester = place(doc, 'CC(=O)OC', 0, 20);
  const water = place(doc, 'O', 0, 30);
  const labelled = [methanol.find((a) => a.el === 'O'), ester.find((a) => a.el === 'O' && neighbours(doc, a).length === 2)];
  for (const a of labelled) Object.assign(a, { isotope: 18, color: PURPLE });
  const [arrow] = row(doc, 0, [acid, '+', methanol, { arrow: 'equilibrium', length: 2.2 }, ester, '+', water]);
  addText(doc, 0, 0, 'H^{+}', { arrow: arrow.id });
  examples.isotope = doc;
}

// numbering: a molecule numbered by the IUPAC rules with its R/S and E/Z, its name; ethyl acetate
// numbered by hand for its NMR, the shifts under it
{
  const doc = emptyDoc();
  const alcohol = place(doc, 'C[C@H](O)/C=C/CC', 0, 0);
  for (const a of alcohol) a.autoNumber = true;
  alcohol.find((a) => a.el === 'C' && neighbours(doc, a).some((n) => n.el === 'O')).cipLabel = true;
  const double = [...doc.bonds.values()].find((b) => b.order === 2 && alcohol.some((a) => a.id === b.a));
  double.cipLabel = true;
  addText(doc, 0, 0, '(2S,3E)-hex-3-en-2-ol', { anchor: alcohol[0].id });
  const acetate = place(doc, 'CC(=O)OCC', 0, 10);
  const carbons = acetate.filter((a) => a.el === 'C');
  carbons.forEach((a, k) => { a.number = k + 1; });
  addText(doc, 0, 0, 'δ_{H} 2.05 (1), 4.12 (3), 1.26 (4)', { anchor: acetate[0].id });
  const b1 = box(alcohol);
  const b2 = box(acetate);
  for (const a of acetate) { a.x += b1.x2 + 2.4 - b2.x1; a.y += (b1.y1 + b1.y2) / 2 - (b2.y1 + b2.y2) / 2; }
  examples.numbering = doc;
}

// polymerisation: n styrene → polystyrene, the repeating unit in brackets with n
{
  const doc = emptyDoc();
  const vinyl = [[0, 0], [0.87, -0.5]].map(([x, y]) => addAtom(doc, x, y));
  addBond(doc, vinyl[0].id, vinyl[1].id, 2);
  const phenyl = addAtom(doc, 1.73, 0, '*', { alias: 'Ph' });
  addBond(doc, vinyl[1].id, phenyl.id);
  const styrene = [...vinyl, phenyl];
  // the repeating unit by hand: –CH2–CH(Ph)– across, its two ends sticking out of the brackets
  // (lines only, no CH3), Ph (an abbreviation) under the CH
  const zig = [[-0.87, 0.5], [0, 0], [0.87, 0.5], [1.73, 0]].map(([x, y]) => addAtom(doc, x, y + 10));
  for (let k = 0; k < 3; k++) addBond(doc, zig[k].id, zig[k + 1].id);
  const ends = [zig[0], zig[3]];
  for (const a of ends) a.endLabel = false;
  const ph = addAtom(doc, 0.87, 11.5, '*', { alias: 'Ph' });
  addBond(doc, zig[2].id, ph.id);
  const unit = [...zig, ph];
  const [arrow] = row(doc, 0, [styrene, { arrow: 'forward', length: 2.2 }, unit], 1.0);
  addText(doc, 0, 0, 'n', { anchor: styrene[0].id, slot: 'left' });
  addText(doc, 0, 0, 'initiator', { arrow: arrow.id });
  const b = box(unit.filter((a) => !ends.includes(a)));
  addBracket(doc, zig[0].x + 0.3, b.y1 - 0.5, zig[3].x - 0.3, b.y2 + 0.4, { sub: 'n' });
  examples.polymer = doc;
}

// turning parts: (S)-ibuprofen with only its propanoic acid side flipped over its bond to the ring
// (the isobutyl stays: not the same as flipping the molecule; the wedge becomes a hash, R/S stays S),
// and a tilted benzoic acid with its C–COOH bond made straight; the bonds acted on marked blue
{
  const doc = emptyDoc();
  const before = place(doc, 'C[C@H](C(=O)O)c1ccc(CC(C)C)cc1', 0, 0);
  const after = place(doc, 'C[C@H](C(=O)O)c1ccc(CC(C)C)cc1', 0, 10);
  const axle = (atoms) => {
    // the stereocentre: the carbon with the COOH carbon and a ring carbon round it
    const centre = atoms.find((a) => a.el === 'C' && neighbours(doc, a).length === 3 && neighbours(doc, a).some((n) => neighbours(doc, n).filter((x) => x.el === 'O').length === 2));
    centre.cipLabel = true;
    return bondOf(doc, centre, neighbours(doc, centre).find((n) => neighbours(doc, n).length === 3 && n.el === 'C' && !neighbours(doc, n).some((x) => x.el === 'O')));
  };
  const [b1, b2] = [axle(before), axle(after)];
  turnOver(doc, b2, smallerSide(doc, b2));
  for (const b of [b1, b2]) b.highlight = BLUE;
  row(doc, 0, [before, { arrow: 'forward', length: 2.2 }, after], 1.2);
  const tilted = place(doc, 'OC(=O)c1ccccc1', 0, 20, { turn: 0.45 });
  const straight = place(doc, 'OC(=O)c1ccccc1', 0, 30, { turn: 0.45 });
  const link = (atoms) => {
    const carboxyl = atoms.find((a) => a.el === 'C' && neighbours(doc, a).filter((n) => n.el === 'O').length === 2);
    return bondOf(doc, carboxyl, neighbours(doc, carboxyl).find((n) => n.el === 'C'));
  };
  const [l1, l2] = [link(tilted), link(straight)];
  {
    // straightened as the tool does it: turned about the bond's middle until the bond is horizontal
    const [a, b] = [doc.atoms.get(l2.a), doc.atoms.get(l2.b)];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const turn = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2) - angle;
    const [cx, cy] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    for (const atom of straight) {
      const [x, y] = [atom.x - cx, atom.y - cy];
      [atom.x, atom.y] = [cx + x * Math.cos(turn) - y * Math.sin(turn), cy + x * Math.sin(turn) + y * Math.cos(turn)];
    }
  }
  for (const b of [l1, l2]) b.highlight = BLUE;
  row(doc, 5, [tilted, { arrow: 'forward', length: 2.2 }, straight], 1.2);
  examples.turning = doc;
}

// Layout: a molecule drawn in a hurry (caffeine, its atoms off their places) and how Layout draws it
{
  const doc = emptyDoc();
  const messy = place(doc, 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 0, 0);
  let seed = 3;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 1.2;
  for (const a of messy) { a.x += jitter(); a.y += jitter(); }
  const tidy = place(doc, 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 0, 10);
  row(doc, 0, [messy, { arrow: 'forward', length: 2.2 }, tidy], 1.2);
  examples.layout = doc;
}

// Layout of a part: atropine, its tropane drawn as in textbooks (as Turn in 3D and a few nudges give it:
// wedges on the stereocentres, the bridge behind the front of the chair broken where they cross), its side
// chain drawn in a hurry. Everything selected (highlighted): the whole molecule redrawn, the bicycle
// flattened. Only the side chain selected: it alone redrawn, the bicycle as it was.
{
  const doc = emptyDoc();
  // (atoms 0–8 the bicycle with its N-methyl, 9– the side chain; the OH of tropine endo, axial)
  const ATROPINE = 'CN1[C@@H]2CC[C@H]1C[C@H](C2)OC(=O)C(CO)c1ccccc1';
  const mol = RDKit.get_mol(ATROPINE);
  mol.set_new_coords();
  const flatMolfile = mol.get_molblock();
  mol.delete();
  // the whole molecule redrawn: with RDKit's ring template (Redraw's "RDKit + ring template"), the tropane
  // from above; RDKit's plain drawing puts the methyl over the ring
  const template = await templateLayout(RDKit, flatMolfile);
  const drawing = (molfile, y) => {
    const { atomIds } = addParsed(parseMolfile(molfile), doc, [0, y]);
    const atoms = atomIds.map((id) => doc.atoms.get(id));
    for (const a of atoms) a.isotope = null; // (the template search marks atoms with isotopes)
    return atoms;
  };
  // the textbook tropane (y down, in bond lengths) and how far each atom stands out of the page, by atom
  // number: 0 CH3, 1 N, 5 the front bridgehead C1, 6 C2, 7 C3, 8 C4, 2 the back bridgehead C5, 3 C6, 4 C7, 9 O
  const TROPANE = [[60, 40], [215, 165], [385, 190], [385, 385], [300, 495], [310, 295], [470, 255], [655, 305], [565, 150], [655, 490]].map(([x, y]) => [x / 180, y / 180]);
  const DEPTH = [-0.3, -0.1, -0.79, -0.97, -0.08, 0.55, 1.03, 0.39, -0.46, 0.18];
  const WEDGES = [[5, 1, 'hash'], [2, 1, 'wedge'], [7, 8, 'hash']]; // (narrow end first: the stereocentre)
  const textbook = (y) => {
    const atoms = drawing(flatMolfile, y);
    const flat = atoms.map((a) => [a.x, a.y]);
    const [ox, oy] = [atoms[0].x, atoms[0].y];
    TROPANE.forEach(([x, y], k) => { [atoms[k].x, atoms[k].y] = [ox + x, oy + y]; });
    const index = new Map(atoms.map((a, k) => [a.id, k]));
    for (const b of doc.bonds.values()) {
      const [i, j] = [index.get(b.a), index.get(b.b)];
      if (i === undefined || j === undefined || i > 9 || j > 9) continue;
      b.stereo = '';
      b.z = Math.round(((DEPTH[i] + DEPTH[j]) / 2) * 1000) / 1000;
    }
    for (const [i, j, kind] of WEDGES) {
      const b = bondOf(doc, atoms[i], atoms[j]);
      [b.a, b.b, b.stereo] = [atoms[i].id, atoms[j].id, kind];
    }
    // the side chain as RDKit drew it, hung on the O: C3→O as there, turned (and mirrored, if that
    // keeps it further from the bicycle) onto the textbook's C3→O
    const angle = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]);
    const turn = angle([atoms[7].x, atoms[7].y], [atoms[9].x, atoms[9].y]) - angle(flat[7], flat[9]);
    let best = null;
    for (const mirror of [1, -1]) {
      const placedAt = flat.slice(10).map(([x, y]) => {
        const [dx, dy] = [x - flat[9][0], (y - flat[9][1])];
        const along = angle(flat[7], flat[9]);
        // (mirrored across the line C3–O)
        const [u, v] = [dx * Math.cos(-along) - dy * Math.sin(-along), mirror * (dx * Math.sin(-along) + dy * Math.cos(-along))];
        const back = along + turn;
        return [atoms[9].x + u * Math.cos(back) - v * Math.sin(back), atoms[9].y + u * Math.sin(back) + v * Math.cos(back)];
      });
      const room = Math.min(...placedAt.flatMap((p) => atoms.slice(0, 9).map((a) => Math.hypot(p[0] - a.x, p[1] - a.y))));
      if (!best || room > best.room) best = { room, placedAt };
    }
    best.placedAt.forEach(([x, y], k) => { [atoms[10 + k].x, atoms[10 + k].y] = [x, y]; });
    return atoms;
  };
  const sloppy = (atoms) => {
    let seed = 11;
    const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.7;
    for (const a of atoms.slice(9)) { a.x += jitter(); a.y += jitter(); }
    return atoms;
  };
  const allSelected = sloppy(textbook(0));
  const flattened = drawing(template.molfile ?? template, 10);
  const partSelected = sloppy(textbook(20));
  const kept = textbook(30);
  {
    // the tropane as drawn is atropine, R/S and the OH's side included
    const smiles = (atoms) => {
      const m = RDKit.get_mol(writeMolfile(doc, atoms.map((a) => a.id)).molfile);
      try { return m.get_smiles(); } finally { m.delete(); }
    };
    const wanted = smiles(flattened);
    for (const atoms of [allSelected, partSelected, kept]) if (smiles(atoms) !== wanted) throw new Error(`the textbook atropine is not ${wanted}: ${smiles(atoms)}`);
  }
  highlight(doc, allSelected, BLUE);
  highlight(doc, partSelected.slice(9), BLUE);
  const [whole] = row(doc, 0, [allSelected, { arrow: 'forward', length: 2.6 }, flattened], 1.2);
  const [part] = row(doc, 9, [partSelected, { arrow: 'forward', length: 2.6 }, kept], 1.2);
  addText(doc, 0, 0, 'all selected', { arrow: whole.id });
  addText(doc, 0, 0, 'side chain selected', { arrow: part.id });
  examples.partial = doc;
}

// texts: a reaction written in texts (Fenton), formatted with the text window's Formula and characters,
// its conditions on the arrow, a note in italic with a bold word
{
  const doc = emptyDoc();
  const parts = ['Fe^{2+}', '+', 'H_{2}O_{2}', '→', 'Fe^{3+}', '+', 'HO^{•}', '+', 'OH^{−}'];
  let x = 0;
  let arrow = null;
  for (const part of parts) {
    if (part === '+') { addPlus(doc, x + 0.35, -0.25); x += 0.9; continue; }
    if (part === '→') { arrow = addArrow(doc, x, -0.25, x + 2.2, -0.25, 'forward'); x += 2.6; continue; }
    addText(doc, x, 0, part);
    x += 0.32 * part.replace(/[_^{}]/g, '').length + 0.5;
  }
  addText(doc, 0, 0, 'pH 3', { arrow: arrow.id });
  addText(doc, 0, 0, '25 °C', { arrow: arrow.id, slot: 'below' });
  addText(doc, 0, 1.6, '~{the} *{Fenton} ~{reaction: HO^{•} oxidises almost anything}');
  examples.texts = doc;
}

// Info: aspirin, and what the Info card says of it (worked out by the app's own formula code)
{
  const doc = emptyDoc();
  const aspirin = place(doc, 'CC(=O)Oc1ccccc1C(=O)O', 0, 0);
  const { formula, mass, exact } = formulaOf(doc, aspirin.map((a) => a.id));
  const written = formula.map(([el, n]) => `${el}${n > 1 ? `_{${n}}` : ''}`).join('');
  const b = box(aspirin);
  addText(doc, b.x2 + 1.6, b.y1 + 0.6, `*{${written}}\nM = ${mass.toFixed(2)} g/mol\nexact mass ${exact.toFixed(4)}\nCC(=O)Oc1ccccc1C(=O)O`, { align: 'left' });
  examples.info = doc;
}

// the look: one molecule (alanine as its zwitterion, the lone pairs of its O shown), drawn in each look
// by the window (example.looks in ExampleDrawing.jsx)
{
  const doc = emptyDoc();
  const alanine = place(doc, '[NH3+][C@@H](C)C(=O)[O-]', 0, 0);
  for (const a of alanine) if (a.el === 'O') a.lonePairs = 'auto';
  examples.looks = doc;
}

// a structure from its name, SMILES or PubChem number: what was typed under each
{
  const doc = emptyDoc();
  const caffeine = place(doc, 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 0, 0);
  const ibuprofen = place(doc, 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', 0, 10);
  const aspirin = place(doc, 'CC(=O)Oc1ccccc1C(=O)O', 0, 20);
  row(doc, 0, [caffeine, ibuprofen, aspirin], 1.6);
  const typed = [[caffeine, 'caffeine'], [ibuprofen, 'CC(C)Cc1ccc(cc1)C(C)C(=O)O'], [aspirin, 'CID 2244']];
  const labels = typed.map(([atoms, text]) => addText(doc, 0, 0, text, { anchor: Math.min(...atoms.map((a) => a.id)) }));
  numbersOnOneLine(doc, [caffeine, ibuprofen, aspirin], labels);
  examples.names = doc;
}

// export: a small scheme, to be saved, exported or copied as a picture
{
  const doc = emptyDoc();
  const acid = place(doc, 'CC(=O)O', 0, 0);
  const ethanol = place(doc, 'CCO', 0, 10);
  const ester = place(doc, 'CC(=O)OCC', 0, 20);
  const water = place(doc, 'O', 0, 30);
  const [arrow] = row(doc, 0, [acid, '+', ethanol, { arrow: 'equilibrium', length: 2.2 }, ester, '+', water]);
  addText(doc, 0, 0, 'H_{2}SO_{4}', { arrow: arrow.id });
  examples.export = doc;
}

// several drawings: an exercise; its solution goes in a tab of its own, and Show steps from one to the other
{
  const doc = emptyDoc();
  const bromide = place(doc, 'CC(C)(C)Br', 0, 0);
  const water = place(doc, 'O', 0, 10);
  for (const a of [...bromide, ...water]) if (a.el === 'O' || a.el === 'Br') a.lonePairs = 'auto';
  const [arrow] = row(doc, 0, [bromide, '+', water, { arrow: 'forward', length: 2.4 }]);
  addText(doc, arrow.x2 + 0.6, 0.3, '?', { size: 1.6 });
  const b = box(bromide);
  addText(doc, b.x1, b.y1 - 2.6, 'Exercise 1', { bold: true });
  addText(doc, b.x1, b.y1 - 1.8, 'Draw the mechanism and the product.');
  examples.exercise = doc;
}

// the drawing's own file: a synthesis worth keeping (saved, opened again, its earlier versions)
{
  const doc = emptyDoc();
  const salicylic = place(doc, 'OC(=O)c1ccccc1O', 0, 0);
  const aspirin = place(doc, 'CC(=O)Oc1ccccc1C(=O)O', 0, 10);
  const [arrow] = row(doc, 0, [salicylic, { arrow: 'forward', length: 2.6 }, aspirin]);
  addText(doc, 0, 0, 'Ac_{2}O', { arrow: arrow.id });
  addText(doc, 0, 0, 'H_{2}SO_{4}', { arrow: arrow.id, slot: 'below' });
  examples.files = doc;
}

// a journal's look: the style (Settings), a bold bond and a bold label, a caption in Serif at its own size
{
  const doc = emptyDoc();
  const ester = place(doc, 'COC(=O)c1ccccc1', 0, 0);
  const bondsOf = (atom) => [...doc.bonds.values()].filter((x) => x.a === atom.id || x.b === atom.id);
  // the ester's O and its bond to the carbonyl carbon: the bond made in the esterification
  const o = ester.find((a) => a.el === 'O' && neighbours(doc, a).length === 2);
  const carbonyl = neighbours(doc, o).find((c) => bondsOf(c).some((x) => x.order === 2));
  const made = bondsOf(o).find((x) => x.a === carbonyl.id || x.b === carbonyl.id);
  o.bold = true;
  made.bold = true;
  const b = box(ester);
  addText(doc, b.x1 - 0.4, b.y2 + 1.6, 'Scheme 1. The new C–O bond in bold.', { family: 'serif', size: 1.15 });
  examples.style = doc;
}

// the manual's catecholamines: what they share highlighted blue, salbutamol's difference orange, the
// groups on N painted purple; in a grid made by the app's own Align
{
  const doc = catecholamines(RDKit, { english: true });
  // as Align → Columns 3 → Arrange in a grid does it, everything selected (the names on one line in each row)
  const everything = new Set([...doc.atoms.keys(), ...doc.texts.keys()]);
  const ed = {
    doc,
    get scene() { return buildScene(doc); },
    selection: everything,
    selectedAtoms: () => [...doc.atoms.keys()],
    selected: (kind) => [...doc[kind].keys()].filter((id) => everything.has(id)),
    checkpoint() {},
    dropCheckpoint() {},
    touched() {},
    say: (message) => { throw new Error(message); },
  };
  align(ed, 'grid', 3);
  examples.catecholamines = doc;
}

// R/S labels as the editor gets them (src/chem/stereo.js), for the previews
function stereoOf(doc) {
  const atoms = new Map();
  const bonds = new Map();
  for (const members of fragments(doc)) {
    if (members.length < 3) continue;
    const { molfile, atomIds } = writeMolfile(doc, members);
    const mol = RDKit.get_mol(molfile, JSON.stringify({ removeHs: false }));
    if (!mol) continue;
    const tags = JSON.parse(mol.get_stereo_tags());
    for (const [i, label] of tags.CIP_atoms ?? []) atoms.set(atomIds[i], label.replace(/[()]/g, ''));
    for (const [i, j, label] of tags.CIP_bonds ?? []) bonds.set(bondBetween(doc, atomIds[i], atomIds[j])?.id, label.replace(/[()]/g, ''));
    mol.delete();
  }
  return { atoms, bonds };
}

for (const [name, doc] of Object.entries(examples)) {
  // (no pictures for Ketcher: only olomol reads these)
  // (their own style only, none: shown in the style set)
  keepDrawnCurves(doc, buildScene(doc)); // (the curved arrows' curves in the file, as the editor keeps them)
  writeFileSync(new URL(`../src/ui/examples/${name}.olom`, import.meta.url), writeOlom(doc, { ownStyle: true, app: `olomol ${VERSION}` }));
  if (previews) writeFileSync(`${previews}/${name}.svg`, sceneToSVG(buildScene(doc, undefined, { stereo: stereoOf(doc) }), { background: '#ffffff' }));
  console.log(name);
}
