// Chemistry rules checked against RDKit: implicit hydrogens and lone pairs
// for a range of molecules, ions and radicals; the molecular formula.
// Run: npm test
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { delocalizedGroups, spreadCharges } from '../src/chem/delocalize.js';
import { formulaOf, labNumbers } from '../src/chem/formula.js';
import { electronsByAtom } from '../src/chem/valence.js';
import { readMolfile } from '../src/io/molfile.js';
import { smallestRings } from '../src/model/graph.js';

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();

const VALENCE_ELECTRONS = { 1: 1, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 14: 4, 15: 5, 16: 6, 17: 7, 35: 7, 53: 7 };

// A molecule read the way the app reads a pasted SMILES (as a molfile),
// with RDKit's own counts per atom alongside.
function both(smiles) {
  const mol = RDKit.get_mol(smiles);
  mol.set_new_coords();
  const molfile = mol.get_molblock(JSON.stringify({ kekulize: true }));
  const { molecules: [m], defaults } = JSON.parse(mol.get_json());
  mol.delete();
  const atoms = m.atoms.map((a) => ({ ...defaults.atom, ...a }));
  const order = atoms.map(() => 0);
  const kekule = RDKit.get_mol(molfile);
  const { molecules: [k], defaults: kd } = JSON.parse(kekule.get_json());
  kekule.delete();
  for (const bond of k.bonds ?? []) bond.atoms.forEach((i) => { order[i] += bond.bo ?? kd.bond.bo; });
  const rdkit = atoms.map((a, i) => ({
    hydrogens: a.impHs,
    lonePairs: VALENCE_ELECTRONS[a.z] === undefined ? 0 : Math.max(0, Math.floor((VALENCE_ELECTRONS[a.z] - a.chg - order[i] - a.impHs - a.nRad) / 2)),
  }));
  const { doc, atomIds } = readMolfile(molfile);
  const electrons = electronsByAtom(doc);
  const ours = atomIds.map((id) => ({ hydrogens: electrons.get(id).hydrogens, lonePairs: electrons.get(id).lonePairs }));
  return { ours, rdkit, doc, atomIds };
}

const MOLECULES = {
  'acetic acid': 'CC(=O)O',
  nitromethane: 'C[N+](=O)[O-]',
  DMSO: 'CS(C)=O',
  pyridine: 'c1ccncc1',
  pyrrole: 'c1cc[nH]c1',
  ammonium: '[NH4+]',
  hydroxide: '[OH-]',
  hydronium: '[OH3+]',
  'methyl anion': '[CH3-]',
  'methyl cation': '[CH3+]',
  'methyl radical': '[CH3]',
  borohydride: '[BH4-]',
  'boron trifluoride': 'FB(F)F',
  'sulfuric acid': 'OS(=O)(=O)O',
  phosphate: 'OP(=O)(O)O',
  thiophene: 'c1ccsc1',
  'acetyl chloride': 'CC(=O)Cl',
  'aluminium chloride': 'Cl[Al](Cl)Cl',
  acylium: 'CC#[O+]',
  'chloride': '[Cl-]',
  'hydrogen bromide': 'Br',
  'hydrogen cyanide': 'C#N',
  'azide': '[N-]=[N+]=[N-]',
  'carbon monoxide': '[C-]#[O+]',
  'perchlorate': '[O-]Cl(=O)(=O)=O',
  'trimethylamine N-oxide': 'C[N+](C)(C)[O-]',
  'enolate': 'C=C[O-]',
  'singlet methylene': '[CH2]',
};

for (const [name, smiles] of Object.entries(MOLECULES)) {
  test(`hydrogens and lone pairs as RDKit: ${name} (${smiles})`, () => {
    const { ours, rdkit } = both(smiles);
    assert.deepEqual(ours, rdkit);
  });
}

test('molecular formula and mass: caffeine', () => {
  const { doc, atomIds } = both('CN1C=NC2=C1C(=O)N(C(=O)N2C)C');
  const { formula, mass } = formulaOf(doc, atomIds);
  assert.equal(formula.map(([s, n]) => s + (n > 1 ? n : '')).join(''), 'C8H10N4O2');
  assert.ok(Math.abs(mass - 194.19) < 0.02);
});

test('lab report lines without words: HRMS ions and elemental analysis of aspirin', () => {
  const { doc, atomIds } = both('CC(=O)Oc1ccccc1C(=O)O');
  const { ions, analysis } = labNumbers(formulaOf(doc, atomIds));
  assert.equal(ions[0].text, 'C9H8O4 [M+H]+ 181.0495');
  assert.equal(ions[2].text, 'C9H8O4 [M-H]- 179.0350');
  assert.equal(analysis.text, 'C9H8O4: C 60.00, H 4.48');
});

test('formula of an ion: ammonium, Hill order without carbon', () => {
  const { doc, atomIds } = both('[NH4+].[Cl-]');
  const { formula, charge } = formulaOf(doc, atomIds);
  assert.equal(formula.map(([s, n]) => s + (n > 1 ? n : '')).join(''), 'ClH4N');
  assert.equal(charge, 0);
});

test('a group label has no hydrogens or lone pairs, and its neighbour counts it as a bond', () => {
  const { doc } = both('CO');
  const o = [...doc.atoms.values()].find((a) => a.el === 'O');
  Object.assign(o, { el: '*', alias: 'R' });
  const electrons = electronsByAtom(doc);
  assert.deepEqual([electrons.get(o.id).hydrogens, electrons.get(o.id).lonePairs, electrons.get(o.id).error], [0, 0, null]);
  const c = [...doc.atoms.values()].find((a) => a.el === 'C');
  assert.equal(electrons.get(c.id).hydrogens, 3);
});

test('delocalized groups: carboxylate, nitro, guanidinium, ozone; not esters or enolates', () => {
  const groups = (smiles) => {
    const { doc } = readMolfile(RDKit.get_mol(smiles).get_molblock(JSON.stringify({ kekulize: true })));
    return [...delocalizedGroups(doc)].map((id) => doc.bonds.get(id)).map((b) => [doc.atoms.get(b.a).el, doc.atoms.get(b.b).el].sort().join('')).sort();
  };
  assert.deepEqual(groups('CC(=O)[O-]'), ['CO', 'CO']);
  assert.deepEqual(groups('C[N+](=O)[O-]'), ['NO', 'NO']);
  assert.deepEqual(groups('NC(N)=[NH2+]'), ['CN', 'CN', 'CN']);
  assert.deepEqual(groups('O=[O+][O-]'), ['OO', 'OO']);
  assert.deepEqual(groups('CC(=O)OC'), []);
  assert.deepEqual(groups('C=C[O-]'), []);
});

test('spread charges: δ− on both O of a carboxylate, N⁺ of nitro stays, C5H5⁻ in the middle', () => {
  const marked = (smiles) => {
    const mol = RDKit.get_mol(smiles);
    const { doc } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })));
    const aromatic = mol.get_molblock(JSON.stringify({ kekulize: false })).split('\n').slice(4 + doc.atoms.size, 4 + doc.atoms.size + doc.bonds.size).map((line) => line.slice(6, 9).trim() === '4');
    mol.delete();
    [...doc.bonds.values()].forEach((bond, k) => { if (aromatic[k]) bond.delocalized = true; });
    for (const id of delocalizedGroups(doc)) doc.bonds.get(id).delocalized = true;
    const spread = spreadCharges(doc, smallestRings(doc));
    const el = (id) => doc.atoms.get(id).el;
    return { partial: [...spread.partial].map(([id, s]) => `${el(id)}${s > 0 ? '+' : '-'}`).sort(), hidden: spread.hidden.size, centred: spread.centred.map((c) => c.charge) };
  };
  assert.deepEqual(marked('CC(=O)[O-]'), { partial: ['O-', 'O-'], hidden: 0, centred: [] });
  assert.deepEqual(marked('C[N+](=O)[O-]'), { partial: ['O-', 'O-'], hidden: 0, centred: [] });
  assert.deepEqual(marked('O=[O+][O-]'), { partial: ['O-', 'O-'], hidden: 0, centred: [] });
  assert.deepEqual(marked('C=C[CH2+]'), { partial: ['C+', 'C+'], hidden: 0, centred: [] });
  assert.deepEqual(marked('[cH-]1cccc1'), { partial: [], hidden: 5, centred: [-1] });
  assert.deepEqual(marked('c1cc[nH+]cc1'), { partial: [], hidden: 0, centred: [] });
});

// "Aromatize" keeps the single and double bonds underneath; a change of the
// structure that breaks a ring or a charged group takes the marks away (an
// automatic Kekulé), with the very bonds there were before.
test('marks that no longer hold go after a change of the structure, the Kekulé bonds as before', async () => {
  const { dropStaleMarks } = await import('../src/chem/delocalize.js');
  const { deleteObjects } = await import('../src/model/doc.js');
  const { mergeLanded } = await import('../src/editor/build.js');
  const aromatized = (smiles) => {
    const mol = RDKit.get_mol(smiles);
    const { doc } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })));
    const aromatic = mol.get_molblock(JSON.stringify({ kekulize: false })).split('\n').slice(4 + doc.atoms.size, 4 + doc.atoms.size + doc.bonds.size).map((line) => line.slice(6, 9).trim() === '4');
    mol.delete();
    [...doc.bonds.values()].forEach((bond, k) => { if (aromatic[k]) bond.delocalized = true; });
    for (const id of delocalizedGroups(doc)) doc.bonds.get(id).delocalized = true;
    return doc;
  };
  const orders = (doc) => [...doc.bonds.values()].map((b) => `${b.order}${b.delocalized ? 'd' : ''}`).join();
  // nothing changed: nothing goes
  const benzoate = aromatized('[O-]C(=O)c1ccccc1');
  const before = orders(benzoate);
  assert.equal(dropStaleMarks(benzoate), false);
  assert.equal(orders(benzoate), before);
  // a ring atom deleted: the ring's marks go, the carboxylate keeps its own
  const ringAtom = [...benzoate.atoms.values()].filter((a) => a.el === 'C').at(-1).id;
  deleteObjects(benzoate, [ringAtom]);
  assert.equal(dropStaleMarks(benzoate), true);
  const marked = [...benzoate.bonds.values()].filter((b) => b.delocalized).map((b) => [benzoate.atoms.get(b.a).el, benzoate.atoms.get(b.b).el].sort().join(''));
  assert.deepEqual(marked, ['CO', 'CO'], 'COO⁻ still delocalized');
  assert.equal(before.replace(/d/g, '').split(',').filter((_, k) => k < 3).join(), orders(benzoate).replace(/d/g, '').split(',').slice(0, 3).join(), 'the bonds kept');
  // acetate with an O⁻ dropped onto the CH3: the C=O is a plain double bond again
  const acetate = aromatized('CC(=O)[O-]');
  const [methyl, , , oxide] = [...acetate.atoms.values()];
  [oxide.x, oxide.y] = [methyl.x, methyl.y];
  mergeLanded(acetate, [oxide.id]);
  dropStaleMarks(acetate);
  assert.deepEqual([...acetate.bonds.values()].map((b) => `${b.order}${b.delocalized ? 'd' : ''}`).sort(), ['1', '2']);
  // naphthalene with an atom gone: the whole system (also the intact ring) Kekulé
  const naphthalene = aromatized('c1ccc2ccccc2c1');
  deleteObjects(naphthalene, [[...naphthalene.atoms.keys()][0]]);
  dropStaleMarks(naphthalene);
  assert.ok([...naphthalene.bonds.values()].every((b) => !b.delocalized));
});

test('drawing the hydrogens keeps the molecule; hiding them gives the same drawing back', async () => {
  const { drawHydrogens, hideHydrogens, hydrogenAction } = await import('../src/editor/hydrogens.js');
  const { doc } = readMolfile(RDKit.get_mol('CC(=O)O').get_molblock());
  const ed = { doc, change(fn) { fn(this.doc); } };
  const ids = [...doc.atoms.keys()];
  const before = formulaOf(doc, ids).formula;
  assert.equal(hydrogenAction(doc, ids), 'draw');
  drawHydrogens(ed, ids);
  assert.equal(doc.atoms.size, 8);
  assert.deepEqual(formulaOf(doc, [...doc.atoms.keys()]).formula, before);
  assert.equal(hydrogenAction(doc, ids), 'hide');
  hideHydrogens(ed, ids);
  assert.equal(doc.atoms.size, 4);
  assert.deepEqual(formulaOf(doc, [...doc.atoms.keys()]).formula, before);
});

test('drawing the hydrogens on a chair: each on its ring atom\'s free place, axial or equatorial (both chairs)', async () => {
  const { drawHydrogens } = await import('../src/editor/hydrogens.js');
  const { chairDoc } = await import('../src/chem/chair.js');
  const { readChair, ringFlip } = await import('../src/chem/ringFlip.js');
  // the template's chair with every place taken: where its bonds point, per ring atom and place
  const full = chairDoc({ axial: ['Br', 'H', 'H', 'H', 'H', 'H'], equatorial: ['H', 'H', 'H', 'H', 'H', 'H'] });
  const bromo = chairDoc({ axial: ['Br'], equatorial: [] });
  const ring = [...bromo.atoms.keys()].slice(0, 6);
  const other = (doc) => {
    const copy = structuredClone(doc);
    for (const [id, [x, y]] of ringFlip(doc, ring).at(1)) Object.assign(copy.atoms.get(id), { x, y });
    return copy;
  };
  const directions = (doc) => {
    const read = readChair(doc, ring);
    return new Map(read.groups.map((g) => [`${ring.indexOf(g.ring)}${g.slot}`, Math.atan2(g.bondVector[1], g.bondVector[0])]));
  };
  for (const [name, doc, model] of [['Br axial', bromo, full], ['Br equatorial (the other chair)', other(bromo), other(full)]]) {
    const ed = { doc, change(fn) { fn(this.doc); } };
    drawHydrogens(ed, ring);
    assert.equal([...doc.atoms.values()].filter((a) => a.el === 'H').length, 11, name);
    const [got, want] = [directions(doc), directions(model)];
    const off = [...want].map(([key, angle]) => [key, got.has(key) ? Math.abs(Math.atan2(Math.sin(got.get(key) - angle), Math.cos(got.get(key) - angle))) * 180 / Math.PI : Infinity]);
    assert.ok(off.every(([, d]) => d < 3), `${name}: each H as the template draws it (${off.filter(([, d]) => d >= 3).map(([k, d]) => `${k} ${d.toFixed(0)}°`).join(', ')})`);
  }
});

test('bond kinds: a dative bond takes a lone pair of its donor; partial bonds count, without errors', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const doc = emptyDoc();
  const [n, b] = [addAtom(doc, 0, 0, 'N'), addAtom(doc, 1.5, 0, 'B')];
  addBond(doc, n.id, b.id, 1, { kind: 'dative' });
  for (const k of [0, 1, 2]) addBond(doc, b.id, addAtom(doc, 2, k, 'F').id);
  let e = electronsByAtom(doc);
  assert.deepEqual([e.get(n.id).hydrogens, e.get(n.id).lonePairs, e.get(b.id).hydrogens, e.get(b.id).error], [3, 0, 0, null]);
  // the carbon of an SN2 transition state: three H and two partial bonds
  const ts = emptyDoc();
  const c = addAtom(ts, 0, 0);
  for (const k of [0, 1, 2]) addBond(ts, c.id, addAtom(ts, 0, k + 1, 'H').id);
  const br = addAtom(ts, 1.4, 0, 'Br');
  const o = addAtom(ts, -1.4, 0, 'O', { charge: -1 });
  addBond(ts, c.id, br.id, 1, { kind: 'partial' });
  addBond(ts, o.id, c.id, 1, { kind: 'partial' });
  e = electronsByAtom(ts);
  assert.deepEqual([e.get(c.id).hydrogens, e.get(c.id).error, e.get(br.id).hydrogens, e.get(br.id).lonePairs, e.get(o.id).hydrogens], [0, null, 0, 3, 0]);
});

test('every abbreviation has the formula of its SMILES; they count in formulas', async () => {
  const { ABBREVIATIONS } = await import('../src/chem/abbreviations.js');
  for (const [name, [smiles, formula]] of Object.entries(ABBREVIATIONS)) {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const { doc } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })));
    mol.delete();
    const ids = [...doc.atoms.values()].filter((a) => a.el !== '*' && !a.alias).map((a) => a.id);
    // the attachment is a dummy atom: one H less than the group alone
    const text = formulaOf(doc, ids).formula.map(([s, n]) => `${s}${n > 1 ? n : ''}`).join('');
    assert.equal(text, formula, name);
  }
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const doc = emptyDoc();
  const [o, ph] = [addAtom(doc, 0, 0, 'O'), addAtom(doc, 1, 0, '*', { alias: 'Ph' })];
  addBond(doc, o.id, ph.id);
  const phenol = formulaOf(doc, [o.id, ph.id]);
  assert.deepEqual(phenol.formula, [['C', 6], ['H', 6], ['O', 1]]);
  assert.equal(phenol.mass.toFixed(2), '94.11');
});

test('Haworth and Fischer templates have the stereo of their sugars and amino acids', async () => {
  const { PROJECTIONS } = await import('../src/chem/projections.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const expected = {
    'β-D-Glucose, Haworth': 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O',
    'α-D-Glucose, Haworth': 'OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O',
    'β-D-Galactose, Haworth': 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@H]1O',
    'β-D-Ribose, Haworth': 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H]1O',
    'D-Glyceraldehyde, Fischer': 'O=C[C@H](O)CO',
    'L-Glyceraldehyde, Fischer': 'O=C[C@@H](O)CO',
    'D-Glucose, Fischer': 'O=C[C@H](O)[C@@H](O)[C@H](O)[C@H](O)CO',
    'L-Alanine, Fischer': 'C[C@H](N)C(=O)O',
  };
  const canonical = (smiles) => {
    const mol = RDKit.get_mol(smiles, JSON.stringify({ removeHs: true }));
    try {
      return mol.get_smiles();
    } finally {
      mol.delete();
    }
  };
  const { ABBREVIATIONS } = await import('../src/chem/abbreviations.js');
  const { drawOutWith } = await import('../src/editor/groups.js');
  const groups = new Map(Object.entries(ABBREVIATIONS).map(([name, [smiles]]) => {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const group = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true }))).doc;
    mol.delete();
    return [name, group];
  }));
  for (const [name, build] of PROJECTIONS) {
    if (!expected[name]) continue;
    const doc = build();
    drawOutWith(doc, [...doc.atoms.keys()], groups);
    assert.equal(canonical(writeMolfile(doc).molfile), canonical(expected[name]), name);
  }

  // drawn by hand (no template's mark on its centres): a drawing, no stereo read into it, however many
  // crossings it has; a template's projection is stereo because the template says so
  const byHand = (name) => {
    const doc = PROJECTIONS.find(([n]) => n === name)[1]();
    drawOutWith(doc, [...doc.atoms.keys()], groups);
    for (const atom of doc.atoms.values()) delete atom.projection;
    return canonical(writeMolfile(doc).molfile);
  };
  const flat = (smiles) => canonical(smiles.replace(/@/g, ''));
  assert.equal(byHand('D-Glucose, Fischer'), flat(expected['D-Glucose, Fischer']), 'D-glucose drawn by hand: no stereo');
  assert.equal(byHand('D-Glyceraldehyde, Fischer'), flat(expected['D-Glyceraldehyde, Fischer']), 'one crossing by hand: no stereo');
});

test('Draw out keeps a label\'s highlight on its group, and the bond\'s on the bond', async () => {
  const { ABBREVIATIONS } = await import('../src/chem/abbreviations.js');
  const { drawOutWith } = await import('../src/editor/groups.js');
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const groups = new Map(['Me', 'Ph'].map((name) => {
    const mol = RDKit.get_mol(ABBREVIATIONS[name][0]);
    mol.set_new_coords();
    const group = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true }))).doc;
    mol.delete();
    return [name, group];
  }));
  const red = '#ffb3b3';
  const blue = '#b5dcff';
  const doc = emptyDoc();
  const n = addAtom(doc, 0, 0, 'N', { highlight: red });
  const me = addAtom(doc, 1, 0, '*', { alias: 'Me', highlight: red });
  const ph = addAtom(doc, -1, 0, '*', { alias: 'Ph', highlight: blue });
  addBond(doc, n.id, me.id, 1, { highlight: red, color: '#c00000' });
  addBond(doc, n.id, ph.id, 1);
  drawOutWith(doc, [me.id, ph.id], groups);
  const on = (id) => [...doc.bonds.values()].filter((b) => b.a === id || b.b === id);
  const [toMe, toPh] = on(n.id).sort((x, y) => doc.atoms.get(x.a === n.id ? x.b : x.a).el.localeCompare(doc.atoms.get(y.a === n.id ? y.b : y.a).el));
  const methyl = doc.atoms.get(toMe.a === n.id ? toMe.b : toMe.a);
  assert.equal(methyl.highlight, red, 'the methyl drawn out highlighted as its label was');
  assert.deepEqual([toMe.highlight, toMe.color], [red, '#c00000'], 'the bond to it as it was');
  assert.equal(toPh.highlight ?? null, null, 'the bond to the phenyl unhighlighted, as it was');
  const ring = [...doc.atoms.values()].filter((a) => a.id !== n.id && a !== methyl);
  assert.equal(ring.length, 6);
  assert.ok(ring.every((a) => a.highlight === blue), 'every ring atom highlighted');
  const ringIds = new Set(ring.map((a) => a.id));
  const ringBonds = [...doc.bonds.values()].filter((b) => ringIds.has(b.a) && ringIds.has(b.b));
  assert.equal(ringBonds.length, 6);
  assert.ok(ringBonds.every((b) => b.highlight === blue), 'and every ring bond');
});

// IUPAC numbers of textbook molecules: one number (or -) per SMILES atom, from the name
const IUPAC = [
  ['hexane', 'CCCCCC', [1, 2, 3, 4, 5, 6]],
  ['1-chlorohexane', 'CCCCCCCl', [6, 5, 4, 3, 2, 1, '-']],
  ['2-methylpentane', 'CC(C)CCC', [1, 2, '-', 3, 4, 5]],
  ['2,2,4-trimethylpentane', 'CC(C)CC(C)(C)C', [5, 4, '-', 3, 2, 1, '-', '-']],
  ['pent-1-ene', 'C=CCCC', [1, 2, 3, 4, 5]],
  ['pent-2-ene', 'CCC=CC', [5, 4, 3, 2, 1]],
  ['pent-1-en-4-yne (double bond before triple)', 'C=CCC#C', [1, 2, 3, 4, 5]],
  ['2-methylbut-2-ene', 'CC=C(C)C', [4, 3, 2, 1, '-']],
  ['but-3-en-2-ol (the OH before the double bond)', 'C=CC(O)C', [4, 3, 2, '-', 1]],
  ['4-methylpentan-2-one', 'CC(=O)CC(C)C', [1, 2, '-', 3, 4, 5, '-']],
  ['butanoic acid', 'CCCC(=O)O', [4, 3, 2, 1, '-', '-']],
  ['2-propylpentan-1-ol (the chain has the OH, not the longest)', 'CCCC(CO)CCC', [5, 4, 3, 2, 1, '-', '-', '-', '-']],
  ['5-ethyl-2-methylheptane', 'CCC(CC)CCC(C)C', [7, 6, 5, '-', '-', 4, 3, 2, 1, '-']],
  ['4-hydroxypentanal (aldehyde over alcohol)', 'CC(O)CCC=O', [5, 4, '-', 3, 2, 1, '-']],
  ['1-bromo-3-chloropropane (alphabetical)', 'BrCCCCl', ['-', 1, 2, 3, '-']],
  ['2-bromo-4-chloropentane (alphabetical)', 'CC(Cl)CC(Br)C', [5, 4, '-', 3, 2, '-', 1]],
  ['ethyl ethanoate (the acid part)', 'CCOC(C)=O', ['-', '-', '-', 1, 2, '-']],
  ['3-methylbutanamide', 'CC(C)CC(N)=O', [4, 3, '-', 2, 1, '-', '-']],
  ['butan-2-amine', 'CCC(C)N', [4, 3, 2, 1, '-']],
  ['ethoxyethane', 'CCOCC', [2, 1, '-', '-', '-']],
  ['cyclohexanol', 'OC1CCCCC1', ['-', 1, 2, 3, 4, 5, 6]],
  ['3-methylcyclohexan-1-ol', 'CC1CCCC(O)C1', ['-', 3, 4, 5, 6, 1, '-', 2]],
  ['cyclohex-2-en-1-ol', 'OC1CCCC=C1', ['-', 1, 6, 5, 4, 3, 2]],
  ['1-methylcyclohex-1-ene', 'CC1=CCCCC1', ['-', 1, 2, 3, 4, 5, 6]],
  ['3-methylcyclohex-1-ene', 'CC1CCCC=C1', ['-', 3, 4, 5, 6, 1, 2]],
  ['methylbenzene', 'Cc1ccccc1', ['-', 1, 2, 3, 4, 5, 6]],
  ['1-bromo-3-chlorobenzene', 'Clc1cccc(Br)c1', ['-', 3, 4, 5, 6, 1, '-', 2]],
  ['benzoic acid', 'OC(=O)c1ccccc1', ['-', '-', '-', 1, 2, 3, 4, 5, 6]],
  ['2-chlorobenzoic acid', 'OC(=O)c1ccccc1Cl', ['-', '-', '-', 1, 6, 5, 4, 3, 2, '-']],
  ['4-nitrophenol', 'Oc1ccc(cc1)[N+](=O)[O-]', ['-', 1, 2, 3, 4, 5, 6, '-', '-', '-']],
  ['pyridine', 'c1ccncc1', [4, 3, 2, 1, 6, 5]],
  ['3-methylpyridine', 'Cc1cccnc1', ['-', 3, 4, 5, 6, 1, 2]],
  ['1H-pyrrole', 'c1cc[nH]c1', [4, 3, 2, 1, 5]],
  ['4-phenylbutan-2-one (the chain has the ketone)', 'CC(=O)CCc1ccccc1', [1, 2, '-', 3, 4, '-', '-', '-', '-', '-', '-']],
  ['hexylbenzene (a ring before a chain)', 'CCCCCCc1ccccc1', ['-', '-', '-', '-', '-', '-', 1, 2, 3, 4, 5, 6]],
  ['cyclohexylmethanol (the chain has the OH)', 'OCC1CCCCC1', ['-', 1, '-', '-', '-', '-', '-', '-']],
];

test('IUPAC atom numbers of textbook molecules', async () => {
  const { iupacNumbering } = await import('../src/chem/numbering.js');
  for (const [name, smiles, expected] of IUPAC) {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const { doc } = readMolfile(mol.get_molblock());
    mol.delete();
    const { numbers } = iupacNumbering(doc, [...doc.atoms.keys()]);
    const got = [...doc.atoms.keys()].map((id) => numbers.get(id) ?? '-');
    assert.deepEqual(got, expected, name);
  }
});

test('IUPAC numbers: which rule decided; fused rings are left alone', async () => {
  const { iupacNumbering } = await import('../src/chem/numbering.js');
  const why = (smiles) => {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const { doc } = readMolfile(mol.get_molblock());
    mol.delete();
    return iupacNumbering(doc, [...doc.atoms.keys()]);
  };
  assert.deepEqual(why('CCCCCCCl').why.numbers, { rule: 'substituents', chosen: '1', other: '6', name: null });
  assert.equal(why('CC(Cl)CC(Br)C').why.numbers.rule, 'alphabet');
  assert.equal(why('CC(Cl)CC(Br)C').why.numbers.name, 'bromo');
  assert.equal(why('C=CC(O)C').why.numbers.rule, 'principal');
  assert.equal(why('CCCCCC').why.numbers, null, 'hexane: both ways the same');
  assert.equal(why('CC(C)CCCC').why.parent, 'length');
  assert.equal(why('CCCCCCc1ccccc1').why.parent, 'ring');
  const naphthalene = why('c1ccc2ccccc2c1');
  assert.ok(naphthalene.numbers.size === 0 && naphthalene.why.parent === 'system');
  assert.equal(why('O').why.parent, 'none');
});

test('SMILES with a mistake: what is wrong, in words; a charge after its atom put right', async () => {
  const { explainSmiles, looksLikeSmiles } = await import('../src/io/smiles.js');
  assert.deepEqual(explainSmiles(RDKit, 'c1ccc(N[+](O[-])=O)cc1'), { message: 'A charge goes inside the brackets, with its atom: [N+], [O-].', fixed: 'c1ccc([N+]([O-])=O)cc1' });
  const oxygen = explainSmiles(RDKit, 'CCO(C=O)OCC');
  assert.ok(oxygen.message.startsWith('Atom 3 (O) has 3 bonds') && oxygen.fixed === null, oxygen.message);
  assert.match(explainSmiles(RDKit, 'C1CC').message, /ring is opened/);
  assert.match(explainSmiles(RDKit, 'CC(C').message, /not closed/);
  assert.match(explainSmiles(RDKit, 'c1cccc1').message, /\[nH\]/);
  assert.equal(explainSmiles(RDKit, 'CCOC(=O)OCC'), null, 'a good SMILES has nothing wrong');
  // what is a SMILES, what a name (names go to PubChem)
  for (const s of ['c1ccc(N[+](O[-])=O)cc1', 'CCO(C=O)OCC', 'c1cccc1', 'C[C@H](N)C(=O)O']) assert.ok(looksLikeSmiles(s), s);
  for (const s of ['aspirin', 'H2O', 'NaCl', 'benzo[a]pyrene', '(R)-carvone', 'N,N-dimethylformamide', '2-methylpropan-1-ol', 'caffeine']) assert.ok(!looksLikeSmiles(s), s);
});

// RDKit refuses Cl=O and redraws perchlorate as [Cl+3] with four O⁻; a
// SMILES with such halogens is drawn as written, our valence rules giving
// the hydrogens.
test('halogens with more than one bond are read as the SMILES writes them', async () => {
  const { readSmiles } = await import('../src/io/readMol.js');
  const { explainSmiles } = await import('../src/io/smiles.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const read = (smiles) => {
    const { mol, asWritten } = readSmiles(RDKit, smiles);
    mol.set_new_coords();
    const molfile = mol.get_molblock(JSON.stringify({ kekulize: true }));
    mol.delete();
    const { doc } = readMolfile(molfile);
    const electrons = electronsByAtom(doc);
    const atom = [...doc.atoms.values()].find((a) => a.el === 'Cl' || a.el === 'I');
    return { asWritten, atom, ...electrons.get(atom.id), orders: [...doc.bonds.values()].map((b) => b.order).sort().join(), charges: [...doc.atoms.values()].map((a) => a.charge).join() };
  };
  const perchlorate = read('Cl(=O)(=O)(=O)[O-]');
  assert.equal(perchlorate.orders, '1,2,2,2');
  assert.equal(perchlorate.charges, '0,0,0,0,-1', 'no Cl3+');
  assert.equal(perchlorate.hydrogens, 0);
  const hypochlorous = read('Cl=O');
  assert.ok(hypochlorous.hydrogens === 1 && !hypochlorous.atom.radical && !hypochlorous.error, 'H–Cl=O');
  assert.equal(read('OCl(=O)=O').hydrogens, 0, 'chloric acid');
  assert.equal(read('O=[Cl]=O').hydrogens, 0, 'in brackets: the hydrogens as written');
  assert.equal(read('FI(F)(F)(F)(F)(F)F').orders, '1,1,1,1,1,1,1', 'IF7');
  for (const smiles of ['Cl=O', 'Cl(=O)(=O)(=O)[O-]', 'c1ccccc1Cl(=O)=O']) assert.equal(explainSmiles(RDKit, smiles), null, smiles);
  // other SMILES as RDKit reads them
  const other = read('c1ccccc1CCl');
  assert.equal(other.asWritten, false);
});

// Flip over a bond: half a turn about the bond, so the molecule stays the
// same (a plain mirror image would be the other enantiomer).
test('turning a part over a bond keeps R/S', async () => {
  const { turnOver, smallerSide } = await import('../src/arrange/align.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const canonical = (molfile) => {
    const mol = RDKit.get_mol(molfile);
    try {
      return mol.get_smiles();
    } finally {
      mol.delete();
    }
  };
  let mirrors = 0; // cases where a plain mirror image was told apart
  for (const smiles of ['C[C@@H](O)c1ccccc1', 'N[C@@H](Cc1ccccc1)C(=O)O', 'C[C@H]1CC[C@@H](O)CC1']) {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const molfile = mol.get_molblock();
    mol.delete();
    const before = canonical(molfile);
    // every bond that isn't in a ring, with the smaller side turning over it
    const { doc } = readMolfile(molfile);
    const inRing = smallestRings(doc); // bond id -> its ring
    for (const bond of [...doc.bonds.values()].filter((b) => !inRing.has(b.id))) {
      const turned = structuredClone(doc);
      const part = smallerSide(turned, turned.bonds.get(bond.id));
      turnOver(turned, turned.bonds.get(bond.id), part);
      assert.equal(canonical(writeMolfile(turned).molfile), before, `${smiles}: turned over bond ${bond.id}`);
      // the same mirror without swapping wedges: the other enantiomer, unless no wedge turned
      const mirrored = structuredClone(turned);
      const moved = new Set(part);
      let swapped = false;
      for (const b of mirrored.bonds.values()) {
        if (b.id !== bond.id && (moved.has(b.a) || b.a === bond.a || b.a === bond.b) && (moved.has(b.b) || b.b === bond.a || b.b === bond.b) && b.stereo) {
          b.stereo = { wedge: 'hash', hash: 'wedge' }[b.stereo];
          swapped = true;
        }
      }
      if (swapped) {
        assert.notEqual(canonical(writeMolfile(mirrored).molfile), before, `${smiles}: a plain mirror over bond ${bond.id} would not be the same`);
        mirrors += 1;
      }
    }
    // the whole molecule over a ring bond
    const ringBond = doc.bonds.get([...inRing.keys()][0]);
    const whole = structuredClone(doc);
    turnOver(whole, whole.bonds.get(ringBond.id), [...whole.atoms.keys()]);
    assert.equal(canonical(writeMolfile(whole).molfile), before, `${smiles}: all of it turned over a ring bond`);
  }
  assert.ok(mirrors >= 3, `plain mirrors told apart: ${mirrors}`);
});

test('isotopes: 13C, 2H, D and T read as typed, abbreviations with digits left alone, D and ²H written as drawn', async () => {
  const { readIsotope, writtenSymbol } = await import('../src/chem/elements.js');
  const { formulaOf, formulaText } = await import('../src/chem/formula.js');
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const { buildScene } = await import('../src/render/scene.js');
  const { readMolfile } = await import('../src/io/molfile.js');
  assert.deepEqual(readIsotope('13C'), { el: 'C', isotope: 13, letter: false });
  assert.deepEqual(readIsotope('D'), { el: 'H', isotope: 2, letter: true });
  assert.deepEqual(readIsotope('T'), { el: 'H', isotope: 3, letter: true });
  assert.deepEqual(readIsotope('2H'), { el: 'H', isotope: 2, letter: false });
  for (const text of ['4-DMTr', '2-Dde', '2-Ns', 'Ph', 'C', '1C', '13Xx']) assert.equal(readIsotope(text), null, text);
  // CDCl3: D written as D, after C; its mass that of deuterium
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C');
  const d = addAtom(doc, 0, -1, 'H', { isotope: 2, letter: true });
  addBond(doc, c.id, d.id);
  for (const [x, y] of [[1, 0.5], [-1, 0.5], [0, 1]]) addBond(doc, c.id, addAtom(doc, x, y, 'Cl').id);
  const f = formulaOf(doc, [...doc.atoms.keys()]);
  assert.equal(formulaText(f.formula), 'CDCl3');
  assert.ok(Math.abs(f.exact - 118.92066) < 0.0001, `exact mass ${f.exact}`); // 12 + 2.01410 + 3 × 34.96885
  assert.equal(writtenSymbol(d), 'D');
  const label = buildScene(doc).atoms.get(d.id).label;
  assert.deepEqual(label.runs.map((r) => r.text), ['D'], 'drawn as D, without a 2 before it');
  // the same atom typed as 2H (for beginners): ²H in the drawing and in the formula
  delete d.letter;
  assert.equal(writtenSymbol(d), '2H');
  assert.deepEqual([...buildScene(doc).atoms.get(d.id).label.runs].sort((p, q) => p.x - q.x).map((r) => r.text), ['2', 'H']);
  assert.equal(formulaText(formulaOf(doc, [...doc.atoms.keys()]).formula), 'C²HCl3');
  d.letter = true;
  // ¹³CH3 with its hydrogens on the left: H3¹³C, the mass number with the carbon
  const methyl = emptyDoc();
  const c13 = addAtom(methyl, 0, 0, 'C', { isotope: 13 });
  addBond(methyl, c13.id, addAtom(methyl, 1, 0, 'O').id);
  const runs = [...buildScene(methyl).atoms.get(c13.id).label.runs].sort((p, q) => p.x - q.x).map((r) => r.text);
  assert.deepEqual(runs, ['H', '3', '13', 'C']);
  // a molfile with D (as ChemDraw writes it): hydrogen 2
  const molfile = ['', '', '', '  2  1  0  0  0  0  0  0  0  0999 V2000',
    '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.0000    0.0000    0.0000 D   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0', 'M  END'].join('\n');
  const atoms = [...readMolfile(molfile).doc.atoms.values()];
  assert.deepEqual(atoms.map((a) => [a.el, a.isotope, a.letter ?? false]), [['C', null, false], ['H', 2, true]]);
});

test('a functional group template and the abbreviations its card offers are the same group', async () => {
  const { ABBREVIATED, TEMPLATES } = await import('../src/chem/templates.js');
  const { ABBREVIATIONS } = await import('../src/chem/abbreviations.js');
  const canonical = (smiles) => {
    const mol = RDKit.get_mol(smiles);
    try {
      return mol.get_smiles();
    } finally {
      mol.delete();
    }
  };
  const groups = new Map(TEMPLATES.find(([name]) => name === 'Functional groups')[1]);
  for (const [group, labels] of Object.entries(ABBREVIATED)) {
    for (const label of labels) assert.equal(canonical(ABBREVIATIONS[label][0]), canonical(groups.get(group)), `${group} = ${label}`);
  }
});

test('?xx in the template search: the parts of the table, codes, elements, abbreviations in any case', async () => {
  const { TEMPLATES } = await import('../src/chem/templates.js');
  const { withPart } = await import('../src/chem/partSearch.js');
  const { AMINO_ACID_CODES, SEARCH_PARTS } = await import('../src/chem/searchParts.js');
  const entries = TEMPLATES.flatMap(([, list]) => list);
  for (const { keys, smarts } of SEARCH_PARTS) {
    const query = RDKit.get_qmol(smarts);
    assert.ok(query, `${keys[0]}: ${smarts}`);
    query.delete();
  }
  for (const name of Object.keys(AMINO_ACID_CODES)) assert.ok(entries.some(([n, , kind]) => n === name && kind === 'aminoAcid'), name);
  const mols = new Map();
  const names = (text) => withPart(RDKit, text, entries, mols).map(([name]) => name);
  const has = (text, yes, no = []) => {
    const found = names(text);
    for (const name of yes) assert.ok(found.includes(name), `?${text} finds ${name}`);
    for (const name of no) assert.ok(!found.includes(name), `?${text} doesn't find ${name}`);
  };
  has('oh', ['Serine', 'Tyrosine'], ['Benzene', 'OMe']);
  has('OH', ['Serine']);
  has('ph', ['Phenyl', 'Benzyl', 'Phenylalanine'], ['Naphthalene', 'Indole']);
  has('Ts', ['Tosyl', 'OTs']);
  has('ts', ['Tosyl', 'OTs']);
  has('me', ['Toluene', 'Alanine'], ['Benzene']);
  has('ester', ['Ester', 'CO2Me'], ['Anhydride', 'Boc2O']);
  has('S', ['Thiophene', 'Methionine'], ['Benzene']);
  has('cl', ['TsCl']);
  assert.deepEqual(names('ala'), ['Alanine']);
  assert.deepEqual(names('C(=O'), []); // not a SMARTS: nothing, no error
});

test('labels of an atom with groups (PPh3, Et3N, Bu3SnH): what they stand for, their names, their colours', async () => {
  const { condensedGroup, condensedName, labelElements } = await import('../src/chem/condensed.js');
  const { formulaOf } = await import('../src/chem/formula.js');
  const { emptyDoc, addAtom } = await import('../src/model/doc.js');
  const canonical = (smiles) => {
    const mol = RDKit.get_mol(smiles);
    const out = mol.get_smiles();
    mol.delete();
    return out;
  };
  const molecule = (label, charge = 0) => canonical(condensedGroup(label, charge).smiles.replace(/^\*/, ''));
  assert.equal(molecule('PPh3'), canonical('P(c1ccccc1)(c1ccccc1)c1ccccc1'));
  assert.equal(molecule('Ph3P'), molecule('PPh3'));
  assert.equal(molecule('Et3N'), canonical('CCN(CC)CC'));
  assert.equal(molecule('Bu3SnH'), canonical('CCCC[SnH](CCCC)CCCC'));
  assert.equal(molecule('EtOH'), canonical('CCO'));
  assert.equal(molecule('NEt4', 1), canonical('CC[N+](CC)(CC)CC'));
  for (const label of ['Nu', 'R1', 'Ts', 'Boc', 'Cl', 'CO2Me', 'Word']) assert.equal(condensedGroup(label), null, label);
  assert.deepEqual([condensedName('P', 0, ['Ph', 'Ph', 'Ph']), condensedName('N', 0, ['Et', 'Et', 'Et']), condensedName('O', 0, ['Et', 'Et']), condensedName('O', 1, ['Ac']), condensedName('N', 2, ['Ph'])],
    ['PPh3', 'NEt3', 'Et2O', 'AcOH', 'PhNH2']);
  // the letters that are atoms, coloured as theirs: the P of PPh3 (not of Ph), the O of OBz, the N and H2 of PhNH2
  assert.deepEqual(labelElements('PPh3'), ['P', null, null, null]);
  assert.deepEqual(labelElements('OBz'), ['O', null, null]);
  assert.deepEqual(labelElements('PhNH2'), [null, null, 'N', 'N', 'N']);
  assert.deepEqual(labelElements('Ts'), [null, null]);
  assert.equal(labelElements('Word'), null);
  // written backwards for a bond from the right: hydrogens with the atom after them (HO red, H2C not)
  assert.deepEqual(labelElements('HOH2C', { reversed: true }), ['O', 'O', 'C', 'C', 'C']);
  assert.deepEqual(labelElements('HO2C', { reversed: true }), ['O', 'O', 'O', 'C']);
  assert.deepEqual(labelElements('EtOH'), [null, null, 'O', 'O']);
  // a label counts as its molecule in the formula, its charge too
  const doc = emptyDoc();
  addAtom(doc, 0, 0, '*', { alias: 'PPh3' });
  const ion = emptyDoc();
  addAtom(ion, 0, 0, '*', { alias: 'NEt4', charge: 1 });
  assert.equal(formulaOf(doc, [...doc.atoms.keys()]).formula.map(([s, n]) => `${s}${n}`).join(''), 'C18H15P1');
  assert.equal(formulaOf(ion, [...ion.atoms.keys()]).charge, 1);
});

test('a label on a coordination arrow is drawn out with the arrow kept: PPh3 on rhodium, so files and Info get its atoms; 0.3\'s 3D models keep it as a stand-in', async () => {
  const { ABBREVIATIONS } = await import('../src/chem/abbreviations.js');
  const { drawOutWith, expandable } = await import('../src/editor/groups.js');
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const groups = new Map(Object.entries(ABBREVIATIONS).map(([name, [smiles]]) => {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const group = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true }))).doc;
    mol.delete();
    return [name, group];
  }));
  // (PPh3 isn't on the list: an atom with groups on it, as condensed.js reads it)
  const { condensedGroup } = await import('../src/chem/condensed.js');
  const pph3 = RDKit.get_mol(condensedGroup('PPh3').smiles);
  pph3.set_new_coords();
  groups.set('PPh3', readMolfile(pph3.get_molblock(JSON.stringify({ kekulize: true }))).doc);
  pph3.delete();
  const doc = emptyDoc();
  const rh = addAtom(doc, 0, 0, 'Rh').id;
  addBond(doc, rh, addAtom(doc, 1, 0, 'Cl').id);
  const labels = [[-1, 0], [0, 1], [0, -1]].map(([x, y]) => {
    const p = addAtom(doc, x, y, '*', { alias: 'PPh3' }).id;
    addBond(doc, p, rh, 1, { kind: 'dative' });
    return p;
  });
  assert.equal(expandable(doc, labels).length, 3);
  assert.equal(expandable(doc, labels, undefined, { dative: false }).length, 0);
  drawOutWith(doc, labels, groups);
  const count = (el) => [...doc.atoms.values()].filter((a) => a.el === el).length;
  assert.deepEqual([count('P'), count('C'), count('*')], [3, 54, 0]);
  // each P on rhodium by a coordination arrow from it, as the label's was
  const arrows = [...doc.bonds.values()].filter((b) => b.kind === 'dative');
  assert.equal(arrows.length, 3);
  assert.ok(arrows.every((b) => doc.atoms.get(b.a).el === 'P' && b.b === rh));
});

test('Templates: each big category\'s templates are each in exactly one of its subgroups', async () => {
  const { SUBGROUPS, TEMPLATES } = await import('../src/chem/templates.js');
  for (const [category, groups] of Object.entries(SUBGROUPS)) {
    const names = TEMPLATES.find(([name]) => name === category)[1].map(([name]) => name);
    const grouped = groups.flatMap(([, list]) => list);
    assert.deepEqual([...grouped].sort(), [...names].sort(), `${category}: ${names.filter((n) => !grouped.includes(n))} not in a subgroup; ${grouped.filter((n) => !names.includes(n))} not a template`);
  }
});

test('charged abbreviations (SO3⁻, CO2⁻, OPO3²⁻): their formulas, and drawn out with the charge where it is', async () => {
  const { CHARGED_ABBREVIATIONS, abbreviationOf } = await import('../src/chem/abbreviations.js');
  const { drawOutWith, groupKey } = await import('../src/editor/groups.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const canonical = (smiles) => { const mol = RDKit.get_mol(smiles); const s = mol.get_smiles(); mol.delete(); return s; };
  for (const [name, charge, smiles, formula] of CHARGED_ABBREVIATIONS) {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const group = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true }))).doc;
    mol.delete();
    const ids = [...group.atoms.values()].filter((a) => a.el !== '*' && !a.alias).map((a) => a.id);
    assert.equal(formulaOf(group, ids).formula.map(([s, n]) => `${s}${n > 1 ? n : ''}`).join(''), formula, name);
    // a methyl with the label on it, drawn out: the group's own charges only (not one more on its first atom)
    const doc = emptyDoc();
    const [c, label] = [addAtom(doc, 0, 0, 'C'), addAtom(doc, 1, 0, '*', { alias: name, charge })];
    addBond(doc, c.id, label.id);
    assert.equal(abbreviationOf(label)?.smiles, smiles);
    drawOutWith(doc, [label.id], new Map([[groupKey(name, charge), group]]));
    assert.equal(canonical(writeMolfile(doc).molfile), canonical(smiles.replace('*', 'C')), name);
  }
  // without its charge the label is no such group (SO3 alone is not a sulfonate)
  assert.equal(abbreviationOf({ el: '*', alias: 'SO3', charge: 0 }), null);
});

// A chair's R/S as olomol reads it (its wedges for files, chairStereo) against the 3D chair it shows (its depths,
// chairModel, read by RDKit from 3D): a ring atom with two groups (C1 of 1,2-dimethylcyclohexan-1-ol) on every
// corner of both chairs, at the tips too (there a wedge on either group was read the other way round)
test('a chair\'s R/S read as the 3D chair shows it, a ring atom with two groups on every corner', async () => {
  const { chairCorners } = await import('../src/chem/chair.js');
  const { chairModel, freeChairSlots } = await import('../src/chem/ringFlip.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { addAtom, addBond, bondsByAtom, emptyDoc } = await import('../src/model/doc.js');
  const read = (molfile) => {
    const mol = RDKit.get_mol(molfile, JSON.stringify({ removeHs: true }));
    const out = mol.get_smiles();
    mol.delete();
    return out;
  };
  // (which bond comes first matters to how the wedge is worked out: the groups' bonds before the ring's and after,
  // the axial one first and the equatorial one)
  for (const [flip, groupsFirst, axialFirst] of [false, true].flatMap((f) => [false, true].flatMap((g) => [false, true].map((a) => [f, g, a])))) {
    for (let k = 0; k < 6; k++) {
      const doc = emptyDoc();
      const ring = chairCorners(flip).corners.map(([x, y]) => addAtom(doc, 1.3 * x, -1.3 * y, 'C').id);
      const ringBonds = () => ring.forEach((id, i) => addBond(doc, id, ring[(i + 1) % 6]));
      // (the slots from a ring drawn alone: the same chair)
      const plain = emptyDoc();
      const plainRing = chairCorners(flip).corners.map(([x, y]) => addAtom(plain, 1.3 * x, -1.3 * y, 'C').id);
      plainRing.forEach((id, i) => addBond(plain, id, plainRing[(i + 1) % 6]));
      const free = freeChairSlots(plain, plainRing);
      const slots = new Map(ring.map((id, i) => [id, free.get(plainRing[i])]));
      const put = (at, slot, el) => {
        const { x, y } = slots.get(at).find((s) => s.slot === slot);
        return () => addBond(doc, at, addAtom(doc, x, y, el).id);
      };
      const [c1, c2] = [ring[k], ring[(k + 1) % 6]];
      const groups = [put(c1, 'axial', 'O'), put(c1, 'equatorial', 'C')];
      if (!axialFirst) groups.reverse();
      groups.push(put(c2, 'equatorial', 'C'));
      if (!groupsFirst) ringBonds();
      for (const group of groups) group();
      if (groupsFirst) ringBonds();
      const flat = read(writeMolfile(doc).molfile);
      // the same molecule with each atom at its depth in the chair, read from 3D
      const { at } = chairModel(doc, null, bondsByAtom(doc), [...smallestRings(doc).values()]);
      const atoms = [...doc.atoms.values()];
      const lines = writeMolfile(doc).molfile.split('\n');
      atoms.forEach((atom, i) => {
        const [x, y, z] = at.get(atom.id);
        lines[4 + i] = x.toFixed(4).padStart(10) + (-y).toFixed(4).padStart(10) + z.toFixed(4).padStart(10) + lines[4 + i].slice(30);
      });
      for (let i = 4 + atoms.length; i < 4 + atoms.length + doc.bonds.size; i++) lines[i] = `${lines[i].slice(0, 9)}  0${lines[i].slice(12)}`;
      lines[1] = '  olomol          3D';
      const deep = read(lines.join('\n'));
      const name = `chair ${flip ? 2 : 1}, C1 on corner ${k} (${groupsFirst ? 'groups' : 'ring'} first, ${axialFirst ? 'axial' : 'equatorial'} first)`;
      assert.match(deep, /@.*@/, `${name}: both stereocentres in 3D (${deep})`);
      assert.equal(flat, deep, `${name}: read as the 3D chair shows it`);
    }
  }
});

// The template "Chair with H" with two of its H made OH and CH3 on neighbouring carbons (the element changed in
// place, as one does): trans-2-methylcyclohexan-1-ol where both are axial or both equatorial, cis where one is
// each, by the textbook rule, not by olomol's own 3D model; trans is (1R,2R) or (1S,2S). (0.4.0 to 0.4.3 read
// 16 of these 48 the other way round: an axial group with its equatorial H drawn, and two groups at a tip.)
test('a chair template with two of its H made groups: cis and trans as the axial and equatorial bonds say', async () => {
  const { CHAIRS } = await import('../src/chem/chair.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const make = CHAIRS.find(([name]) => name === 'Chair with H')[1];
  const NAMES = ['left tip', 'back left', 'back right', 'right tip', 'front right', 'front left'];
  for (const [first, second] of [['O', 'C'], ['C', 'O']]) {
    for (let k = 0; k < 6; k++) {
      for (const one of ['axial', 'equatorial']) {
        for (const other of ['axial', 'equatorial']) {
          const doc = make();
          const ring = [...doc.atoms.values()].filter((a) => a.el === 'C').map((a) => a.id);
          // (the template draws each carbon's axial H first, then its equatorial one)
          const hOf = (c, slot) => [...doc.bonds.values()].filter((b) => b.a === c && doc.atoms.get(b.b).el === 'H').map((b) => b.b)[slot === 'axial' ? 0 : 1];
          doc.atoms.get(hOf(ring[k], one)).el = first;
          doc.atoms.get(hOf(ring[(k + 1) % 6], other)).el = second;
          const mol = RDKit.get_mol(writeMolfile(doc).molfile, JSON.stringify({ removeHs: true }));
          const labels = JSON.parse(mol.get_stereo_tags()).CIP_atoms.map(([, label]) => label);
          mol.delete();
          const want = one === other ? 'trans' : 'cis';
          const got = labels.length !== 2 ? `${labels.length} stereocentres` : labels[0] === labels[1] ? 'trans' : 'cis';
          assert.equal(got, want, `${first} ${one} on the ${NAMES[k]}, ${second} ${other} next to it`);
        }
      }
    }
  }
});

// A Haworth projection with both groups of every carbon drawn (OH up, H down, as Draw the H gives it), drawn
// straight and a little askew: each stereocentre olomol reads (its molfile's wedges) has the handedness of the
// molecule the projection means (the ring flat and level, its front towards the viewer, a group drawn above it
// up: built in 3D and read by RDKit), or none; never the other one. (0.4.x put a wedge and a hashed wedge on
// the two, pointing opposite ways: read as no R/S, or askew the wrong one.) The ring's middle carbons, whose two
// ring bonds go either way, are read; C1 and C4, at its sides, may not be.
test('a Haworth projection with both groups of each carbon drawn: R/S as it means it, or none', async () => {
  const { haworthDoc } = await import('../src/chem/projections.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { bondsByAtom } = await import('../src/model/doc.js');
  const handedness = (molfile) => {
    const mol = RDKit.get_mol(molfile, JSON.stringify({ removeHs: false }));
    const out = JSON.parse(mol.get_json()).molecules[0].atoms.map((atom) => atom.stereo ?? null);
    mol.delete();
    return out;
  };
  let seed = 3;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.12;
  for (const [name, ring, up, down] of [
    ['β-D-glucose', 'pyranose', ['OH', 'H', 'OH', 'H', 'CH2OH'], ['H', 'OH', 'H', 'OH', 'H']],
    ['α-D-galactose', 'pyranose', ['H', 'H', 'OH', 'OH', 'CH2OH'], ['OH', 'OH', 'H', 'H', 'H']],
    ['β-D-ribose', 'furanose', ['OH', 'H', 'H', 'CH2OH'], ['H', 'OH', 'OH', 'H']],
  ]) {
    for (const askew of [false, true]) {
      const doc = haworthDoc({ ring, up, down });
      if (askew) for (const atom of doc.atoms.values()) [atom.x, atom.y] = [atom.x + jitter(), atom.y + jitter()];
      const n = ring === 'pyranose' ? 6 : 5;
      const atoms = [...doc.atoms.values()];
      const ringIds = atoms.slice(0, n).map((a) => a.id);
      // the molecule in 3D: the ring level (depth from how low it is drawn), each group from its atom as drawn, up or down
      const byAtom = bondsByAtom(doc);
      const at = new Map(ringIds.map((id) => [id, [doc.atoms.get(id).x, 0, 1.6 * doc.atoms.get(id).y]]));
      for (const queue = [...ringIds]; queue.length;) {
        const id = queue.shift();
        for (const b of byAtom.get(id)) {
          const to = b.a === id ? b.b : b.a;
          if (at.has(to)) continue;
          const [p, q] = [doc.atoms.get(id), doc.atoms.get(to)];
          at.set(to, [at.get(id)[0] + q.x - p.x, at.get(id)[1] - (q.y - p.y), at.get(id)[2]]);
          queue.push(to);
        }
      }
      const lines = writeMolfile(doc).molfile.split('\n');
      atoms.forEach((atom, i) => {
        lines[4 + i] = at.get(atom.id).map((v) => v.toFixed(4).padStart(10)).join('') + lines[4 + i].slice(30);
      });
      for (let i = 4 + atoms.length; i < 4 + atoms.length + doc.bonds.size; i++) lines[i] = `${lines[i].slice(0, 9)}  0${lines[i].slice(12)}`;
      lines[1] = '  olomol          3D';
      const meant = handedness(lines.join('\n'));
      const read = handedness(writeMolfile(doc).molfile);
      ringIds.forEach((id, k) => {
        const i = atoms.findIndex((a) => a.id === id);
        const what = `${name}${askew ? ', askew' : ''}, ring atom ${k}`;
        if (read[i]) assert.equal(read[i], meant[i], `${what}: read as the projection means it`);
        // (the middle ones: C2 and C3 in front, C5 at the back, a pyranose's; a furanose's C2 and C3)
        const middle = ring === 'pyranose' ? [2, 3, 5] : [2, 3];
        if (meant[i] && middle.includes(k)) assert.ok(read[i], `${what}: read`);
      });
    }
  }
});
