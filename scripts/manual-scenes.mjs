// The example drawings of the manual (docs/): a Friedel–Crafts acylation
// with its curved arrows and the resonance structures of the σ-complex, an
// SN2 transition state, six catecholamines with their common part
// highlighted, all drawn the same way round, and a zwitterion for the style
// settings. Built here from SMILES (RDKit) with the app's own model, then
// pasted into the app by scripts/manual-shots.mjs.
import { readMolfile } from '../src/io/molfile.js';
import { addArrow, addAtom, addBond, addBracket, addCurve, addFill, addPlus, addText, emptyDoc } from '../src/model/doc.js';
import { ringList, smallestRings } from '../src/model/graph.js';

// A molfile of `smiles` (explicit [H] kept), its atoms placed like the
// matching atoms of `template` (a molfile whose bonds may be of any order).
function molfileOf(RDKit, smiles, template = null) {
  const mol = RDKit.get_mol(smiles, JSON.stringify({ removeHs: false }));
  try {
    if (template) {
      const core = RDKit.get_mol(template);
      try {
        if (!mol.generate_aligned_coords(core, JSON.stringify({ useCoordGen: false, acceptFailure: false }))) throw new Error(`${smiles}: no match for the template`);
      } finally {
        core.delete();
      }
    } else {
      mol.set_new_coords();
      mol.normalize_depiction(1);
      mol.straighten_depiction(true);
    }
    return mol.get_molblock(JSON.stringify({ kekulize: true }));
  } finally {
    mol.delete();
  }
}

const boxOf = (atoms) => ({
  x1: Math.min(...atoms.map((a) => a.x)), x2: Math.max(...atoms.map((a) => a.x)),
  y1: Math.min(...atoms.map((a) => a.y)), y2: Math.max(...atoms.map((a) => a.y)),
});

// Reads a molfile into `doc`; returns its atoms (objects).
function read(doc, molfile) {
  const { atomIds } = readMolfile(molfile, doc);
  return atomIds.map((id) => doc.atoms.get(id));
}

// The box of atoms with room for their labels (heteroatoms, CH3, ions).
function labelBox(doc, atoms) {
  const box = boxOf(atoms);
  const labelled = (a) => a.el !== 'C' || a.charge || [...doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length < 2;
  const pad = (side) => (atoms.some((a) => labelled(a) && a.x === box[side]) ? 0.45 : 0);
  return { ...box, x1: box.x1 - pad('x1'), x2: box.x2 + pad('x2') };
}

// Puts things in a row from x = 0, each centred on y: molecules (atom
// lists), '+', '->' (reaction arrow), '<->' (resonance arrow), or
// { arrow: '->', over: 'text', length }. Returns the right end.
function row(doc, y, items, gap = 1.1) {
  let x = 0;
  const placed = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      const box = labelBox(doc, item);
      for (const a of item) {
        a.x += x - box.x1;
        a.y += y - (box.y1 + box.y2) / 2;
      }
      placed.push({ atoms: item, box: boxOf(item) });
      x += box.x2 - box.x1 + gap;
    } else if (item === '+') {
      addPlus(doc, x + 0.1, y);
      x += 0.2 + gap;
    } else {
      const { arrow, over, length = arrow === '<->' ? 1.4 : 2.2 } = typeof item === 'string' ? { arrow: item } : item;
      addArrow(doc, x, y, x + length, y, arrow === '<->' ? 'resonance' : 'forward');
      if (over) addText(doc, x + length / 2 - 0.12 * over.length, y - 0.45, over);
      x += length + gap;
    }
  }
  return { end: x - gap, placed };
}

// --- the Friedel–Crafts acylation ---

const bonded = (doc, id) => [...doc.bonds.values()].filter((b) => b.a === id || b.b === id);
const other = (bond, id) => (bond.a === id ? bond.b : bond.a);
const bondOf = (doc, a, b) => [...doc.bonds.values()].find((x) => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id));

const RED = '#d40000';

// The σ-complex as textbooks draw it: the ring upright, the sp3 carbon at
// the top with its H and the acetyl group, C=O pointing up; the positive
// carbon at ring position `plus` (2, 4 or 6, counted from the sp3 carbon
// clockwise); `mirror`: H on the right. Returns { atoms, ring, h, acyl, o }.
function sigmaComplex(doc, plus, mirror = false) {
  const m = mirror ? -1 : 1;
  const at = (x, y, el = 'C', extra = {}) => addAtom(doc, m * x, y, el, extra);
  const ring = [[0, -1], [0.866, -0.5], [0.866, 0.5], [0, 1], [-0.866, 0.5], [-0.866, -0.5]]
    .map(([x, y], i) => at(x, y, 'C', { charge: i + 1 === plus ? 1 : 0 }));
  const doubles = { 6: [[2, 3], [4, 5]], 4: [[2, 3], [5, 6]], 2: [[3, 4], [5, 6]] }[plus];
  ring.forEach((a, i) => {
    const [p, q] = [i + 1, ((i + 1) % 6) + 1];
    addBond(doc, a.id, ring[q - 1].id, doubles.some(([x, y]) => x === Math.min(p, q) && y === Math.max(p, q)) ? 2 : 1);
  });
  const h = at(-0.707, -1.707, 'H');
  const acyl = at(0.707, -1.707);
  const o = at(0.448, -2.673, 'O');
  const methyl = at(1.673, -1.448);
  addBond(doc, ring[0].id, h.id);
  addBond(doc, ring[0].id, acyl.id);
  addBond(doc, acyl.id, o.id, 2);
  addBond(doc, acyl.id, methyl.id);
  return { atoms: [...ring, h, acyl, o, methyl], ring, h, acyl, o };
}

export function friedelCrafts(RDKit) {
  const doc = emptyDoc();
  // step 1: benzene + acylium -> [σ-complex ↔ ↔]
  const benzene = read(doc, molfileOf(RDKit, 'c1ccccc1'));
  const acylium = read(doc, molfileOf(RDKit, 'CC#[O+]'));
  const forms = [6, 4, 2].map((plus) => sigmaComplex(doc, plus));
  const top = row(doc, 0, [benzene, '+', acylium, { arrow: '->', over: '1' }, forms[0].atoms, '<->', forms[1].atoms, '<->', forms[2].atoms]);
  const resonance = labelBox(doc, forms.flatMap((f) => f.atoms));
  addBracket(doc, resonance.x1 - 0.6, resonance.y1 - 0.6, resonance.x2 + 0.6, resonance.y2 + 0.6, { shape: 'square' });

  // step 2: σ-complex + AlCl4- -> acetophenone + HCl + AlCl3; the σ-complex
  // mirrored, so that its H faces the AlCl4-
  const again = sigmaComplex(doc, 6, true);
  const aluminate = read(doc, molfileOf(RDKit, 'Cl[Al-](Cl)(Cl)Cl'));
  const product = read(doc, molfileOf(RDKit, 'CC(=O)c1ccccc1'));
  const hcl = read(doc, molfileOf(RDKit, 'Cl'));
  const alcl3 = read(doc, molfileOf(RDKit, 'Cl[Al](Cl)Cl'));
  const bottom = row(doc, 4.6, [again.atoms, '+', aluminate, { arrow: '->', over: '2' }, product, '+', hcl, '+', alcl3]);
  // the second row centred under the first
  const shift = (top.end - bottom.end) / 2;
  for (const a of [...again.atoms, ...aluminate, ...product, ...hcl, ...alcl3]) a.x += shift;
  for (const item of [...doc.arrows.values(), ...doc.pluses.values(), ...doc.texts.values()]) {
    if ((item.y ?? item.y1) < 2) continue;
    if ('x1' in item) {
      item.x1 += shift;
      item.x2 += shift;
    } else item.x += shift;
  }

  // curved arrows (red), lone pairs on O and the Cl that takes the proton
  const curve = (from, to) => addCurve(doc, from, to, 2, { color: RED });
  // the ring bond nearest the acylium attacks its carbon; the C≡O π bond goes to O
  const acylC = acylium.find((a) => a.el === 'C' && bonded(doc, a.id).some((b) => b.order === 3));
  const acylO = acylium.find((a) => a.el === 'O');
  const ringDouble = [...doc.bonds.values()].filter((b) => b.order === 2 && benzene.some((a) => a.id === b.a));
  const nearest = ringDouble.reduce((best, b) => {
    const x = (doc.atoms.get(b.a).x + doc.atoms.get(b.b).x) / 2;
    return !best || x > best.x ? { b, x } : best;
  }, null).b;
  curve({ bond: nearest.id }, { atom: acylC.id });
  curve({ bond: bondOf(doc, acylC, acylO).id }, { atom: acylO.id });
  // resonance: the double bond next to the positive carbon moves towards it
  // (C4=C5 to C5=C6, then C2=C3 to C3=C4)
  const [r1, r2] = [forms[0].ring, forms[1].ring];
  curve({ bond: bondOf(doc, r1[3], r1[4]).id }, { bond: bondOf(doc, r1[4], r1[5]).id });
  curve({ bond: bondOf(doc, r2[1], r2[2]).id }, { bond: bondOf(doc, r2[2], r2[3]).id });
  // step 2: a Cl of AlCl4- takes the proton, the C–H electrons close the ring
  const { ring, h } = again;
  const cl = aluminate.filter((a) => a.el === 'Cl').reduce((best, a) => (!best || Math.hypot(a.x - h.x, a.y - h.y) < Math.hypot(best.x - h.x, best.y - h.y) ? a : best), null);
  curve({ atom: cl.id }, { atom: h.id });
  curve({ bond: bondOf(doc, ring[0], h).id }, { bond: bondOf(doc, ring[0], ring[5]).id });
  for (const a of doc.atoms.values()) if (a.el === 'O' || a.id === cl.id) a.lonePairs = 'auto';
  return doc;
}

// The molecules of the Friedel–Crafts drawing, as SMILES (for the check).
export const FRIEDEL_CRAFTS = ['c1ccccc1', 'CC#[O+]', '[H]C1(C(C)=O)C=CC=C[CH+]1', '[H]C1(C(C)=O)C=C[CH+]C=C1', '[H]C1(C(C)=O)[CH+]C=CC=C1',
  '[H]C1(C(C)=O)C=CC=C[CH+]1', 'Cl[Al-](Cl)(Cl)Cl', 'CC(=O)c1ccccc1', 'Cl', 'Cl[Al](Cl)Cl'];

// --- an SN2 reaction with its transition state ---

// HO⁻ + CH3Br -> [HO···CH3···Br]‡ -> HOCH3 + Br⁻, the hydrogens drawn
// (wedge and hashed wedge), the transition state with partial bonds and δ−.
// A carbon with its three H; `side`: -1 the H point left, 1 right, 0 flat
// (the transition state, its H wedged and hashed).
function methylGroup(doc, side) {
  const c = addAtom(doc, 0, 0);
  const hs = side === 0
    ? [[0, -1, ''], [-0.45, 0.8, 'wedge'], [0.45, 0.8, 'hash']]
    : [[side * 0.5, -0.87, ''], [side * 0.94, 0.34, 'wedge'], [side * 0.17, 0.98, 'hash']];
  const atoms = [c];
  for (const [x, y, stereo] of hs) {
    const h = addAtom(doc, x, y, 'H');
    addBond(doc, c.id, h.id, 1, { stereo });
    atoms.push(h);
  }
  return { c, atoms };
}

// The SN2 transition state [HO···CH3···Br]‡: partial bonds, δ− on both ends.
function sn2TransitionState(doc) {
  const ts = methylGroup(doc, 0);
  const o = addAtom(doc, -1.35, 0, 'O', { partialCharge: -1 });
  const br = addAtom(doc, 1.35, 0, 'Br', { partialCharge: -1 });
  addBond(doc, ts.c.id, o.id, 1, { kind: 'partial' });
  addBond(doc, ts.c.id, br.id, 1, { kind: 'partial' });
  return [o, ...ts.atoms, br];
}

export function sn2() {
  const doc = emptyDoc();
  const methyl = (side) => methylGroup(doc, side);
  const hydroxide = addAtom(doc, 0, 0, 'O', { charge: -1, lonePairs: 'auto' });
  const start = methyl(-1);
  const br = addAtom(doc, 1, 0, 'Br', { lonePairs: 'auto' });
  const cBr = addBond(doc, start.c.id, br.id);
  const ts = sn2TransitionState(doc);
  // the product: methanol, the hydrogens turned over, and bromide
  const endO = addAtom(doc, -1, 0, 'O', { lonePairs: 'auto' });
  const end = methyl(1);
  addBond(doc, endO.id, end.c.id);
  const bromide = addAtom(doc, 0, 0, 'Br', { charge: -1, lonePairs: 'auto' });
  row(doc, 0, [[hydroxide], '+', [...start.atoms, br], '->', ts, '->', [endO, ...end.atoms], '+', [bromide]]);
  const box = labelBox(doc, ts);
  addBracket(doc, box.x1 - 0.6, box.y1 - 0.45, box.x2 + 0.6, box.y2 + 0.45, { shape: 'square', sup: '‡' });
  addCurve(doc, { atom: hydroxide.id }, { atom: start.c.id }, 2, { color: RED });
  addCurve(doc, { bond: cBr.id }, { atom: br.id }, 2, { color: RED });
  return doc;
}

// --- six catecholamines, their common part highlighted ---

// L-DOPA and the hormones made from it, and two drugs: isoprenaline and
// salbutamol, whose CH2OH in place of the 3-OH (no catechol: not broken
// down by COMT, so it acts for hours) is its one important difference.
export const CATECHOLAMINES = [
  ['L-DOPA', 'C1=CC(=C(C=C1C[C@@H](C(=O)O)N)O)O'],
  ['dopamin', 'NCCc1ccc(O)c(O)c1'],
  ['noradrenalin', 'C1=CC(=C(C=C1[C@H](CN)O)O)O'],
  ['adrenalin', 'CNC[C@@H](C1=CC(=C(C=C1)O)O)O'],
  ['isoprenalin', 'CC(C)NCC(O)c1ccc(O)c(O)c1'],
  ['salbutamol', 'CC(C)(C)NCC(O)c1ccc(O)c(CO)c1'],
];
const COMMON = '#b5dcff'; // the app's blue highlight
const DIFFERENT = '#ffd59e'; // its orange highlight
const PURPLE = '#7a00b0'; // a colour of the paint tool

// The largest common part of `smiles`, as a query molecule.
function commonPart(RDKit, smiles) {
  const mols = smiles.map((s) => RDKit.get_mol(s));
  const list = new RDKit.MolList();
  for (const mol of mols) list.append(mol);
  const { smarts } = JSON.parse(RDKit.get_mcs_as_json(list, JSON.stringify({ RingMatchesRingOnly: true, CompleteRingsOnly: true })));
  for (const mol of mols) mol.delete();
  list.delete();
  return RDKit.get_qmol(smarts);
}

// The common part as every molecule gets it: the ring upright with C1 on
// the right, the 4-OH to the left, the 3-substituent (`x`: O, or C in
// salbutamol) up and left, the chain zigzagging to the right (molfile
// coordinates, bonds of any order).
function catecholTemplate(x) {
  const atoms = [['C', 1.5, 0], ['C', 0.75, 1.299], ['C', -0.75, 1.299], ['C', -1.5, 0], ['C', -0.75, -1.299], ['C', 0.75, -1.299],
    ['O', -3, 0], [x, -1.5, 2.598], ['C', 3, 0], ['C', 3.75, 1.299], ['N', 5.25, 1.299]];
  const bonds = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1], [4, 7], [3, 8], [1, 9], [9, 10], [10, 11]];
  const counts = `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`;
  return ['', '  template', '', counts,
    ...atoms.map(([el, x, y]) => `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}    0.0000 ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...bonds.map(([a, b]) => `${String(a).padStart(3)}${String(b).padStart(3)}  8  0`), 'M  END'].join('\n');
}

// (the names in English: dopamine, ...)
const ENGLISH_NAMES = { dopamin: 'dopamine', noradrenalin: 'noradrenaline', adrenalin: 'adrenaline', isoprenalin: 'isoprenaline' };

export function catecholamines(RDKit, { english = false } = {}) {
  const query = commonPart(RDKit, CATECHOLAMINES.map(([, smiles]) => smiles));
  const doc = emptyDoc();
  CATECHOLAMINES.forEach(([name, smiles], i) => {
    const molfile = molfileOf(RDKit, smiles, catecholTemplate(name === 'salbutamol' ? 'C' : 'O'));
    const mol = RDKit.get_mol(molfile);
    const match = JSON.parse(mol.get_substruct_match(query)).atoms;
    mol.delete();
    if (match.length !== 10) throw new Error(`${name}: the common part has ${match.length} atoms, not 10`);
    const atoms = read(doc, molfile);
    // methyls as plain line ends (the tert-butyl of salbutamol would crowd its OH)
    for (const a of atoms) if (a.el === 'C' && bonded(doc, a.id).length === 1) a.endLabel = false;
    // in a row for now; the manual shows the Align menu putting them in a grid
    const box = boxOf(atoms);
    for (const a of atoms) {
      a.x += i * 9 - box.x1;
      a.y -= (box.y1 + box.y2) / 2;
    }
    const mark = (ids, key, value) => {
      for (const a of atoms) if (ids.has(a.id)) a[key] = value;
      for (const b of doc.bonds.values()) if (ids.has(b.a) && ids.has(b.b)) b[key] = value;
    };
    // the common part in blue
    const common = new Set(match.map((index) => atoms[index].id));
    mark(common, 'highlight', COMMON);
    const ring = atoms.filter((a) => common.has(a.id) && bonded(doc, a.id).filter((b) => common.has(other(b, a.id))).length >= 2 && a.el === 'C');
    const n = atoms.find((a) => common.has(a.id) && a.el === 'N');
    // what hangs on the N (methyl, isopropyl, tert-butyl): painted purple
    const onN = new Set();
    const todo = bonded(doc, n.id).map((b) => other(b, n.id)).filter((id) => !common.has(id));
    while (todo.length) {
      const id = todo.pop();
      if (onN.has(id)) continue;
      onN.add(id);
      todo.push(...bonded(doc, id).map((b) => other(b, id)).filter((next) => next !== n.id && !onN.has(next)));
    }
    mark(onN, 'color', PURPLE);
    for (const b of doc.bonds.values()) if ((b.a === n.id && onN.has(b.b)) || (b.b === n.id && onN.has(b.a))) b.color = PURPLE;
    // salbutamol's CH2OH on the ring, where the others have an OH: orange
    if (name === 'salbutamol') {
      const ch2 = atoms.find((a) => !common.has(a.id) && a.el === 'C' && bonded(doc, a.id).some((b) => ring.some((r) => r.id === other(b, a.id))));
      const oh = atoms.find((a) => a.el === 'O' && bonded(doc, a.id).some((b) => other(b, a.id) === ch2.id));
      const ids = new Set([ch2.id, oh.id]);
      mark(ids, 'highlight', DIFFERENT);
      const toRing = bonded(doc, ch2.id).find((b) => ring.some((r) => r.id === other(b, ch2.id)));
      toRing.highlight = DIFFERENT;
    }
    const after = boxOf(atoms);
    // on the anchor below: it goes with its molecule into the grid
    const label = (english && ENGLISH_NAMES[name]) || name;
    addText(doc, (after.x1 + after.x2) / 2 - 0.13 * label.length, after.y2 + 1.1, label, { anchor: Math.min(...atoms.map((a) => a.id)) });
  });
  query.delete();
  return doc;
}

// --- one molecule for the style settings ---

// The glycine zwitterion with its lone pairs: charges, lone pairs and atom
// colours, the three things the Settings change most visibly.
export function zwitterion(RDKit) {
  const doc = emptyDoc();
  const atoms = read(doc, molfileOf(RDKit, '[NH3+]CC(=O)[O-]'));
  for (const a of atoms) if (a.el === 'O') a.lonePairs = 'auto';
  return doc;
}

// --- the cover: penicillin G with almost everything the app can show ---

// Penicillin G (as its potassium salt) meeting the serine of the enzyme it
// blocks (a transpeptidase): the serine O attacks the β-lactam C=O (two
// curved arrows). On it: wedges and R/S labels, the β-lactam and
// thiazolidine rings filled, the amide and the carboxylate highlighted, the
// phenyl with an aromatic circle, charges, lone pairs, the enzyme painted
// and labelled. (Atom numbers by hand would collide with the R/S label at
// C5, and a δ+ on C7 with the arrow head: both take the one free side.)
export const PENICILLIN_SALT = 'CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)CC3=CC=CC=C3)C(=O)[O-])C';
export function penicillinCover(RDKit, { english = false } = {}) {
  const doc = emptyDoc();
  const atoms = read(doc, molfileOf(RDKit, PENICILLIN_SALT));
  const atom = (k) => atoms[k];
  const bondOf = (a, b) => [...doc.bonds.values()].find((x) => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id));
  for (const a of atoms) if (a.el === 'C' && bonded(doc, a.id).length === 1) a.endLabel = false;
  // SMILES order: 3 N, 4 C5, 6 C6, 7 C7 (the lactam C=O) and 8 its O;
  // 1–5 the thiazolidine; 9–11 the amide N–C=O; 19–21 the carboxylate
  const ring = (indices) => ringList(smallestRings(doc)).find((r) => r.length === indices.length && indices.every((k) => r.includes(atoms[k].id)));
  addFill(doc, ring([3, 4, 6, 7]), '#ffb3b3');
  addFill(doc, ring([1, 2, 3, 4, 5]), '#fff09a');
  const mark = (indices, colour) => {
    const ids = new Set(indices.map((k) => atoms[k].id));
    for (const a of atoms) if (ids.has(a.id)) a.highlight = colour;
    for (const b of doc.bonds.values()) if (ids.has(b.a) && ids.has(b.b)) b.highlight = colour;
  };
  mark([9, 10, 11], COMMON);
  mark([19, 20, 21], '#b9e8b0');
  // the phenyl with a circle
  const phenyl = new Set([13, 14, 15, 16, 17, 18].map((k) => atoms[k].id));
  for (const b of doc.bonds.values()) if (phenyl.has(b.a) && phenyl.has(b.b)) b.delocalized = true;
  // K+ beside the carboxylate
  const minus = atoms.find((a) => a.charge === -1);
  const acid = atom(19);
  const away = [minus.x - acid.x, minus.y - acid.y];
  addAtom(doc, minus.x + away[0] * 1.6, minus.y + away[1] * 1.6, 'K', { charge: 1 });
  // the serine of the enzyme: Enz–CH2–O–H above the β-lactam C=O
  const c7 = atom(7);
  const o7 = atom(8);
  const teal = '#0b8a8a';
  const o = addAtom(doc, c7.x + 0.55, c7.y - 1.75, 'O', { lonePairs: 'auto', color: teal });
  const h = addAtom(doc, o.x + 0.87, o.y - 0.5, 'H', { color: teal });
  const ch2 = addAtom(doc, o.x - 0.5, o.y - 0.87, 'C', { color: teal });
  const enz = addAtom(doc, ch2.x + 0.5, ch2.y - 0.87, '*', { alias: 'Enz', color: teal });
  for (const [a, b] of [[o, h], [o, ch2], [ch2, enz]]) addBond(doc, a.id, b.id, 1, { color: teal });
  addText(doc, enz.x + 1.1, enz.y + 0.18, english ? "the enzyme's serine" : 'serin enzymu', { color: teal });
  o7.lonePairs = 'auto';
  addCurve(doc, { atom: o.id }, { atom: c7.id }, 2, { color: RED });
  addCurve(doc, { bond: bondOf(c7, o7).id }, { atom: o7.id }, 2, { color: RED });
  return doc;
}
