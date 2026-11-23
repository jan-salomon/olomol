// A curved-arrow step as one string (src/embed/canonical.js): the same for the same answer whichever equivalent
// atoms it uses, in whatever order its arrows were drawn, by whatever ids; another for another answer.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { addAtom, addBond, addOrbital, emptyDoc } from '../src/model/doc.js';
import { atomClasses, canonicalForms, canonicalSmilesOf, moleculeFacts } from '../src/embed/canonical.js';
import { readMolfile } from '../src/io/molfile.js';

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();

// 3,3-dimethylbutan-2-yl cation: C1–C2(+)–C3(–C4)(–C5)(–C6); `order`: the ids given in another order
function cation(order = [1, 2, 3, 4, 5, 6]) {
  const doc = emptyDoc();
  const ids = {};
  for (const k of order) ids[k] = addAtom(doc, k, 0, 'C', k === 2 ? { charge: 1 } : {}).id;
  for (const [a, b] of [[1, 2], [2, 3], [3, 4], [3, 5], [3, 6]]) addBond(doc, ids[a], ids[b], 1);
  return { doc, ids };
}
const bondOf = (doc, a, b) => [...doc.bonds.values()].find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)).id;
function arrow(doc, from, to, electrons = 2) {
  const id = doc.nextId++;
  doc.curves.set(id, { id, electrons, from, to, color: null });
}
const shift = (methyl, order) => {
  const { doc, ids } = cation(order);
  arrow(doc, { bond: bondOf(doc, ids[3], ids[methyl]) }, { atom: ids[2] });
  return canonicalForms(doc, RDKit).step;
};

test('a methyl shift: any of the three methyls, any ids, the same', () => {
  const forms = [shift(4), shift(5), shift(6), shift(5, [6, 5, 4, 3, 2, 1])];
  assert.ok(forms[0] && forms.every((form) => form === forms[0]), forms.join('\n'));
});

test('another answer, another string: the arrow to another atom, a fishhook, the other bond', () => {
  const right = shift(4);
  const { doc, ids } = cation();
  arrow(doc, { bond: bondOf(doc, ids[3], ids[4]) }, { atom: ids[1] });
  assert.notEqual(canonicalForms(doc, RDKit).step, right);
  const fish = cation();
  arrow(fish.doc, { bond: bondOf(fish.doc, fish.ids[3], fish.ids[4]) }, { atom: fish.ids[2] }, 1);
  assert.notEqual(canonicalForms(fish.doc, RDKit).step, right);
  const other = cation();
  arrow(other.doc, { bond: bondOf(other.doc, other.ids[2], other.ids[3]) }, { atom: other.ids[2] });
  assert.notEqual(canonicalForms(other.doc, RDKit).step, right);
});

// H3O+ (O with three H drawn) and acetone's O: O lone pair to an H, that H's bond to its O
function protonation(h, swap = false) {
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C');
  const o = addAtom(doc, 1, 0, 'O');
  addBond(doc, c.id, o.id, 2);
  for (const x of [-1, 0]) addBond(doc, c.id, addAtom(doc, x, 1, 'C').id, 1);
  const w = addAtom(doc, 3, 0, 'O', { charge: 1 });
  const hs = [0, 1, 2].map((k) => addAtom(doc, 3 + k, 1, 'H'));
  for (const x of hs) addBond(doc, w.id, x.id, 1);
  const first = () => arrow(doc, { atom: o.id, pair: 0 }, { atom: hs[h].id });
  const second = () => arrow(doc, { bond: bondOf(doc, w.id, hs[h].id) }, { atom: w.id });
  if (swap) { second(); first(); } else { first(); second(); }
  return canonicalForms(doc, RDKit);
}

test('a proton taken from H3O+: whichever H, arrows in either order; each arrow on its own too', () => {
  const forms = [protonation(0), protonation(1), protonation(2, true)];
  assert.ok(forms.every((f) => f.step === forms[0].step));
  assert.deepEqual(new Set(forms[2].curvedArrows), new Set(forms[0].curvedArrows), 'each arrow alone: the same pair of strings');
  assert.notEqual(forms[0].curvedArrows[0], forms[0].curvedArrows[1]);
});

test('products: their canonical SMILES after the reaction arrow; none without one', () => {
  const { doc } = cation();
  assert.equal(canonicalForms(doc, RDKit).products, null);
  const after = addAtom(doc, 9, 0, 'C', { charge: 1 });
  for (const x of [0, 1, 2]) addBond(doc, after.id, addAtom(doc, 9 + x, 1, 'C').id, 1);
  const products = canonicalForms(doc, RDKit, { step: [...doc.atoms.keys()].slice(0, 6), products: [...doc.atoms.keys()].slice(6) }).products;
  assert.equal(products, 'C[C+](C)C');
});

// E2 on a bromocyclohexane chair, Br axial on C1, every H drawn: HO⁻ takes an H of C2 or C6, that C–H bond becomes
// the C=C, the C–Br bond goes to Br. `ring`: C1…C6 in the order the chair is drawn; `flip`: the other chair
const { chairDoc } = await import('../src/chem/chair.js');
function e2(corner, place, { flip = false, bare = false } = {}) {
  const doc = chairDoc({ axial: ['Br', 'H', 'H', 'H', 'H', 'H'], equatorial: ['H', 'H', 'H', 'H', 'H', 'H'], flip });
  const ring = [...doc.atoms.keys()].slice(0, 6);
  const neighbours = (id) => [...doc.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
  // (each ring atom's groups, axial first, as chairDoc adds them)
  const groups = (id) => neighbours(id).filter((x) => !ring.includes(x)).sort((p, q) => p - q);
  const [br] = groups(ring[0]);
  const h = groups(ring[corner])[place === 'axial' ? 0 : 1];
  const o = addAtom(doc, -4, 0, 'O', { charge: -1 });
  arrow(doc, { atom: o.id, pair: 0 }, { atom: h });
  arrow(doc, { bond: bondOf(doc, ring[corner], h) }, { bond: bondOf(doc, ring[corner], ring[0]) });
  arrow(doc, { bond: bondOf(doc, ring[0], br) }, { atom: br });
  // (bare: every H but the one taken left implicit)
  if (bare) {
    for (const [id, atom] of doc.atoms) {
      if (atom.el !== 'H' || id === h) continue;
      doc.atoms.delete(id);
      for (const [bid, bond] of doc.bonds) if (bond.a === id || bond.b === id) doc.bonds.delete(bid);
    }
  }
  return canonicalForms(doc, RDKit).step;
}

test('stereo drawn counts: anti-periplanar H (axial, C2 or C6, its mirror image) alike, the equatorial H not', () => {
  const anti = e2(1, 'axial');
  assert.ok(anti);
  assert.equal(e2(5, 'axial'), anti, "C6's axial H: C2's mirror image in an achiral molecule");
  assert.notEqual(e2(1, 'equatorial'), anti, "C2's equatorial H: cis to Br, not anti");
  assert.equal(e2(1, 'equatorial'), e2(5, 'equatorial'));
});

test('stereo not drawn does not count: the H of a flat bromocyclohexane are alike', () => {
  const doc = emptyDoc();
  const ring = [0, 1, 2, 3, 4, 5].map((k) => addAtom(doc, Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3), 'C').id);
  ring.forEach((id, k) => addBond(doc, id, ring[(k + 1) % 6], 1));
  const br = addAtom(doc, 2, 0, 'Br');
  addBond(doc, ring[0], br.id, 1);
  const hs = [0, 1].map((k) => addAtom(doc, 0.5 + k, 2, 'H').id);
  for (const id of hs) addBond(doc, ring[1], id, 1);
  const forms = hs.map((h) => {
    const copy = structuredClone(doc);
    arrow(copy, { bond: bondOf(copy, ring[1], h) }, { bond: bondOf(copy, ring[1], ring[0]) });
    return canonicalForms(copy, RDKit).step;
  });
  assert.equal(forms[0], forms[1]);
});

// SN2, HO⁻ + CH3Br: the O's lone pair to C, the C–Br bond to Br; `drawn`: how many of the carbon's H are drawn
function sn2(drawn) {
  const doc = emptyDoc();
  const o = addAtom(doc, -2, 0, 'O', { charge: -1 });
  const c = addAtom(doc, 0, 0, 'C');
  const br = addAtom(doc, 1, 0, 'Br');
  addBond(doc, c.id, br.id, 1);
  for (let k = 0; k < drawn; k++) addBond(doc, c.id, addAtom(doc, 0, k + 1, 'H').id, 1);
  arrow(doc, { atom: o.id, pair: 0 }, { atom: c.id });
  arrow(doc, { bond: bondOf(doc, c.id, br.id) }, { atom: br.id });
  return canonicalForms(doc, RDKit);
}

test('hydrogens no arrow uses: drawn out or not, the same string (the step and each arrow alone)', () => {
  const forms = [0, 1, 3].map(sn2);
  assert.ok(forms.every((f) => f.step === forms[0].step), forms.map((f) => f.step).join('\n'));
  assert.ok(forms.every((f) => f.curvedArrows.join() === forms[0].curvedArrows.join()));
  // (propene and HBr: one H of the CH2 drawn, which RDKit would read as the double bond's stereo)
  const addition = (drawn) => {
    const doc = emptyDoc();
    const [c1, c2, c3] = [0, 1, 2].map((k) => addAtom(doc, k * 1.3, k % 2 ? 0.75 : 0, 'C'));
    addBond(doc, c1.id, c2.id, 2);
    addBond(doc, c2.id, c3.id, 1);
    if (drawn) addBond(doc, c1.id, addAtom(doc, -0.65, -0.75, 'H').id, 1);
    const h = addAtom(doc, 0, 2, 'H');
    const br = addAtom(doc, 1.3, 2, 'Br');
    addBond(doc, h.id, br.id, 1);
    arrow(doc, { bond: bondOf(doc, c1.id, c2.id) }, { atom: h.id });
    arrow(doc, { bond: bondOf(doc, h.id, br.id) }, { atom: br.id });
    return canonicalForms(doc, RDKit).step;
  };
  assert.equal(addition(true), addition(false));
  // (on a chair: every H drawn, or only the one taken; its axial or equatorial place still told)
  assert.equal(e2(1, 'axial', { bare: true }), e2(1, 'axial'));
  assert.equal(e2(1, 'equatorial', { bare: true }), e2(1, 'equatorial'));
  assert.notEqual(e2(1, 'axial', { bare: true }), e2(1, 'equatorial', { bare: true }));
});

test('atom classes: alike atoms one class (a t-butyl\'s methyls; C2\'s and C6\'s axial H), others not', () => {
  const { doc, ids } = cation();
  const classes = atomClasses(doc, RDKit);
  assert.equal(classes.get(ids[4]), classes.get(ids[5]));
  assert.equal(classes.get(ids[4]), classes.get(ids[6]));
  assert.notEqual(classes.get(ids[1]), classes.get(ids[4]), 'C1 is no methyl of the t-butyl');
  const chair = chairDoc({ axial: ['Br', 'H', 'H', 'H', 'H', 'H'], equatorial: ['H', 'H', 'H', 'H', 'H', 'H'] });
  const ring = [...chair.atoms.keys()].slice(0, 6);
  const groups = (id) => [...chair.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a)).filter((x) => !ring.includes(x)).sort((p, q) => p - q);
  const c = atomClasses(chair, RDKit);
  const [ax2, eq2] = groups(ring[1]);
  const [ax6] = groups(ring[5]);
  assert.equal(c.get(ax2), c.get(ax6), 'C2\'s and C6\'s axial H: mirror images, alike');
  assert.notEqual(c.get(ax2), c.get(eq2), 'C2\'s axial and equatorial H: not');
});

test('canonical SMILES per molecule: resonance forms told apart (InChI isn\'t), hydrogens drawn or not alike', () => {
  // the enolate as O⁻ (C=C–O⁻) and as C⁻ (⁻C–C=O)
  const form = (onOxygen) => {
    const doc = emptyDoc();
    const [c1, c2, o] = [addAtom(doc, 0, 0, 'C', onOxygen ? {} : { charge: -1 }), addAtom(doc, 1, 0, 'C'), addAtom(doc, 2, 0, 'O', onOxygen ? { charge: -1 } : {})];
    addBond(doc, c1.id, c2.id, onOxygen ? 2 : 1);
    addBond(doc, c2.id, o.id, onOxygen ? 1 : 2);
    return canonicalSmilesOf(doc, RDKit)[0];
  };
  assert.notEqual(form(true), form(false));
  const doc = emptyDoc();
  const o = addAtom(doc, 0, 0, 'O');
  for (const x of [1, -1]) addBond(doc, o.id, addAtom(doc, x, 1, 'H').id, 1);
  addAtom(doc, 5, 0, 'O');
  assert.deepEqual(canonicalSmilesOf(doc, RDKit), ['O', 'O'], 'water with its H drawn and without');
});

// a molecule from SMILES, as olomol reads a molfile (its wedges from RDKit's 2D drawing)
const fromSmiles = (smiles) => {
  const mol = RDKit.get_mol(smiles);
  try {
    return readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true }))).doc;
  } finally {
    mol.delete();
  }
};

test('a molecule\'s facts for exercises: formula, chiral (a meso diol as drawn not; drawn flat, it could be), the group', async () => {
  const whole = (smiles) => { const doc = fromSmiles(smiles); return { doc, ids: [...doc.atoms.keys()] }; };
  const facts = async (smiles, group) => (await moleculeFacts(fromSmiles(smiles), RDKit, group && (group.doc ? group : whole(group))))[0];
  assert.equal((await facts('CCCCO')).formula, 'C4H10O');
  assert.equal((await facts('[O-][N+](=O)[O-]')).formula, 'NO3-');
  assert.equal((await facts('C[C@@H](O)CC')).chiral, true);
  assert.equal((await facts('CCCCO')).chiral, false);
  assert.equal((await facts('C[C@@H](O)[C@H](C)O')).chiral, false, 'meso-2,3-butanediol: its own mirror image');
  assert.equal((await facts('C[C@@H](O)[C@@H](C)O')).chiral, true, '(R,R)-2,3-butanediol');
  assert.equal((await facts('CC(O)C(C)O')).chiral, true, 'drawn flat: one of its stereoisomers chiral');
  assert.equal((await facts('CCOC(C)=O', 'COC=O')).contains, true);
  assert.equal((await facts('CCC(=O)O', 'COC=O')).contains, false, 'an acid has no ester group');
  // (the group as picked in an example: an ester's C(=O)O only, its O's hydrogens as in the ester: none)
  const ester = fromSmiles('CCOC(C)=O');
  const picked = [...ester.atoms.values()].filter((a) => a.el === 'O' || [...ester.bonds.values()].some((b) => b.order === 2 && (b.a === a.id || b.b === a.id))).map((a) => a.id);
  assert.equal((await facts('CC(=O)OC', { doc: ester, ids: picked })).contains, true);
  assert.equal((await facts('CC(=O)O', { doc: ester, ids: picked })).contains, false, 'C(=O)O picked in an ester: an acid not');
  // (an alcohol's C–O: an ether's isn't)
  const ethanol = fromSmiles('CCO');
  const co = [...ethanol.atoms.values()].filter((a) => a.el === 'O' || [...ethanol.bonds.values()].some((b) => ethanol.atoms.get(b.a).el === 'O' ? b.b === a.id : ethanol.atoms.get(b.b).el === 'O' && b.a === a.id)).map((a) => a.id);
  assert.equal((await facts('CC(O)CC', { doc: ethanol, ids: co })).contains, true);
  assert.equal((await facts('CCOCC', { doc: ethanol, ids: co })).contains, false, 'an ether has no O–H');
  assert.equal((await facts('Oc1ccccc1', { doc: fromSmiles('Oc1ccccc1'), ids: [...fromSmiles('Oc1ccccc1').atoms.keys()] })).contains, true, 'a phenyl matches itself, aromatic');
});

test('a Lewis structure: the lone pairs shown count, alike atoms alike (any O of nitrate the one drawn)', async () => {
  const nitrate = (pairs) => {
    const doc = fromSmiles('[O-][N+](=O)[O-]');
    for (const a of doc.atoms.values()) a.lonePairs = pairs(a);
    return doc;
  };
  const [all, oxygens, none, two] = await Promise.all([() => 'auto', (a) => (a.el === 'O' ? 'auto' : null), () => null, (a) => (a.el === 'O' ? 2 : null)]
    .map(async (pairs) => (await moleculeFacts(nitrate(pairs), RDKit))[0]));
  assert.equal(all.smiles, none.smiles, 'the same molecule');
  assert.equal(all.lewis, oxygens.lewis, 'N has no lone pair: "show all" there shows none');
  assert.notEqual(all.lewis, none.lewis);
  assert.notEqual(all.lewis, two.lewis, 'two on the O⁻ that have three');
});

// CH3–Br breaking: the C–Br bond's electrons to Br, or into an orbital drawn on Br
test('an arrow into an orbital is another answer than one to its atom', () => {
  const step = (into) => {
    const doc = emptyDoc();
    const c = addAtom(doc, 0, 0, 'C');
    const br = addAtom(doc, 1.5, 0, 'Br');
    addBond(doc, c.id, br.id, 1);
    const p = addOrbital(doc, br.id);
    arrow(doc, { bond: bondOf(doc, c.id, br.id) }, into === 'orbital' ? { orbital: p.id } : { atom: br.id });
    return canonicalForms(doc, RDKit);
  };
  const [orbital, atom] = [step('orbital'), step('atom')];
  assert.ok(orbital.step && atom.step);
  assert.notEqual(orbital.step, atom.step);
  assert.notEqual(orbital.curvedArrows[0], atom.curvedArrows[0]);
});
