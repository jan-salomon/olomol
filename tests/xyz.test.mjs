// XYZ files: 3D coordinates from OpenChemLib and MMFF94s+, and back:
// bonds, bond orders, charges and stereo worked out from the coordinates.
// Every molecule goes the way the app takes it: SMILES, a 2D drawing, its
// molfile, RDKit's SMILES of that for OpenChemLib, 3D (each conformer
// checked for the drawn R/S and E/Z), an XYZ text, read again; RDKit must
// see the same molecule.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import OCL from 'openchemlib';
import { readMolfile, writeMolfile } from '../src/io/molfile.js';
import { conformersXyz, parseXyz, perceiveBonds, sameStereo, xyzMolfile } from '../src/io/xyz.js';

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
OCL.Resources.register(readFileSync(new URL('../node_modules/openchemlib/dist/resources.json', import.meta.url), 'utf8'));
const canonical = (text) => {
  const mol = RDKit.get_mol(text, JSON.stringify({ removeHs: true }));
  try {
    return mol.get_smiles();
  } finally {
    mol.delete();
  }
};
const drawn = (smiles) => {
  const mol = RDKit.get_mol(smiles);
  mol.set_new_coords();
  const { doc } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })));
  mol.delete();
  return writeMolfile(doc).molfile;
};

// as writeXyz does it: OpenChemLib gets RDKit's SMILES, each conformer is checked
const toXyz = (molfiles, comment) => conformersXyz(OCL, molfiles.map(canonical), comment, (k, xyz) => sameStereo(RDKit, molfiles[k], xyz));

const MOLECULES = [
  'CCO', 'CC(=O)Oc1ccccc1C(=O)O', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 'c1ccccc1', 'c1ccc2ccccc2c1', 'c1ccncc1', 'c1cc[nH]c1', 'c1ccoc1', 'c1ccsc1',
  'C[S+](C)C', 'C[O+](C)C', 'C[P+](C)(C)C', 'C[N+](=O)[O-]', 'O=[N+]([O-])c1ccccc1', 'CC(=O)[O-]', '[NH4+]', 'C[NH3+]', 'CS(C)(=O)=O', 'CS(C)=O', 'OP(O)(O)=O', 'CC#N', 'O=C=O', 'C=C=C',
  'C1=CCCCC1', 'C=Cc1ccccc1', 'FC(F)(F)c1ccccc1', 'C[C@H](N)C(=O)O', 'C[C@@H](N)C(=O)O', 'C/C=C/C', 'C/C=C\\C', 'F[C@H](Cl)Br',
  'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O', '[Na+].CC(=O)[O-]',
  // (+)-hinckdentine A: OpenChemLib misread the wedges at its spiro carbon, and its conformers don't keep it every time
  'C1CNC(=O)C[C@H]2[C@@]13C4=C(C=CC(=C4)Br)N=CN3C5=C2C=C(C=C5Br)Br',
  'C[C@@H]1CC[C@]2(CC1)OCCO2', 'C[C@H]1CCCC[C@@H]1C', 'C[C@H]1CCCC[C@H]1C',
  // radicals: on the carbon without H (phenyl), on CH2 (benzyl), the ring kept
  '[c]1ccccc1', '[CH2]c1ccccc1', 'C[CH2]',
];

test('3D and back: the same molecules, with R/S and E/Z', async () => {
  for (const smiles of MOLECULES) {
    const xyz = await toXyz([drawn(smiles)], 'test');
    assert.equal(canonical(xyzMolfile(xyz)), canonical(smiles), smiles);
  }
});

test('3D: an undefined stereocentre may come out either way; a wrong conformer is not taken', async () => {
  const molfile = drawn('CC(N)C(=O)O'); // alanine without a wedge
  await toXyz([molfile], 'test');
  const r = await conformersXyz(OCL, [canonical(drawn('C[C@@H](N)C(=O)O'))], 'test');
  assert.equal(sameStereo(RDKit, drawn('C[C@H](N)C(=O)O'), r), false, 'the mirror image is not the drawing');
  assert.equal(sameStereo(RDKit, molfile, r), true);
});

test('3D without MMFF94 atom types (boron, an acylium C≡O⁺): the conformer as generated', async () => {
  for (const [smiles, atoms] of [['CC#[O+]', 6], ['CC1(C)CB(c2ccccc2B2CC(C)(C)C(C)(C)C2)CC1(C)C', 60], ['C[C@H](B(O)O)c1ccccc1', 22]]) {
    const xyz = await toXyz([drawn(smiles)], 'test');
    const lines = xyz.trim().split('\n');
    assert.equal(Number(lines[0]), atoms, smiles);
    assert.match(lines[1], /no atom types/, smiles);
    if (smiles.includes('@')) assert.equal(canonical(xyzMolfile(xyz)), canonical(smiles), `${smiles}: R/S kept`);
  }
});

test('3D: sensible geometry (MMFF94s+)', async () => {
  const atoms = parseXyz(await toXyz([drawn('CC(=O)Oc1ccccc1C(=O)O')], 'aspirin'));
  const { bonds } = perceiveBonds(atoms);
  const length = ({ a, b }) => Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y, atoms[a].z - atoms[b].z);
  const kinds = (bond) => [atoms[bond.a].el, atoms[bond.b].el].sort().join('') + bond.order;
  for (const bond of bonds) {
    const expected = { CC1: [1.37, 1.53], CC2: [1.37, 1.42], CO1: [1.3, 1.45], CO2: [1.19, 1.25], CH1: [1.07, 1.11], HO1: [0.95, 1.0] }[kinds(bond)];
    assert.ok(expected && length(bond) >= expected[0] && length(bond) <= expected[1], `${kinds(bond)} ${length(bond).toFixed(3)} Å`);
  }
  assert.equal(atoms.length, 21, 'aspirin with its hydrogens');
});

test('XYZ: several molecules side by side; the count and comment lines', async () => {
  const xyz = await toXyz([drawn('O'), drawn('CO')], 'two');
  const lines = xyz.trim().split('\n');
  assert.equal(lines[0], '9');
  assert.equal(lines[1], 'two');
  assert.equal(canonical(xyzMolfile(xyz)), canonical('O.CO'));
  assert.throws(() => parseXyz('three\nno\n'), /not an XYZ file/);
});
