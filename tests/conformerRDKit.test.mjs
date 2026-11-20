// 3D by RDKit's ETKDG (megane-rdkit): the drawn R/S kept, the molfile's atoms first, a same seed the same
// structure, and a try with atoms on top of each other (RDKit's energy calls it the best) never the lowest.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { loadRDKit } from 'megane-rdkit';
import OCL from 'openchemlib';
import { readMolfile, writeMolfile } from '../src/io/molfile.js';
import { conformersXyz, sameStereo, stereoFits } from '../src/io/xyz.js';
import { conformerAtoms, embedded, moleculeIn3D, moleculeIn3DByRDKit, withChiralFlag } from '../src/layout/conformer.js';
import { molfile3D } from '../src/layout/threeD.js';

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
const RDKit3D = await loadRDKit();
OCL.Resources.register(readFileSync(new URL('../node_modules/openchemlib/dist/resources.json', import.meta.url), 'utf8'));
const drawn = (smiles) => {
  const mol = RDKit.get_mol(smiles);
  mol.set_new_coords();
  const { doc } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })));
  mol.delete();
  return writeMolfile(doc).molfile;
};
const TAXOL = 'CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C';
const FRUCTOSE = 'OC[C@@]1(O)OC[C@@H](O)[C@@H](O)[C@@H]1O';

test('the drawn R/S kept, as the first atoms, and the same again for a seed', () => {
  for (const smiles of [FRUCTOSE, 'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C']) {
    const molfile = drawn(smiles);
    for (const seed of [42, 1, 2, 3]) {
      const points = moleculeIn3DByRDKit(RDKit3D, OCL, molfile, seed);
      assert.equal(points.length, Number.parseInt(molfile.split('\n')[3].slice(0, 3), 10));
      assert.ok(stereoFits(RDKit, molfile, () => molfile3D(molfile, points)));
      assert.deepEqual([...points], [...moleculeIn3DByRDKit(RDKit3D, OCL, molfile, seed)]);
    }
  }
});

test('atoms folded through each other: RDKit calls it its lowest energy, here it is out of the running', () => {
  const made = embedded(RDKit3D, OCL, withChiralFlag(drawn(TAXOL)), 4);
  const rdkit = RDKit3D.embed(withChiralFlag(drawn(TAXOL)), { randomSeed: 4, forceField: 'MMFF94s', maxIters: 2000, embedParams: { useMacrocycleTorsions: true, useMacrocycle14config: true } }).energies[0];
  assert.ok(rdkit < 150, `RDKit's energy ${rdkit}`);
  assert.ok(made.energy > 1000, `the energy ${made.energy}`);
});

test('S8: the crown among the four tries', () => {
  const s8 = drawn('S1SSSSSSS1');
  const [crown] = [42, 1, 2, 3].map((seed) => moleculeIn3DByRDKit(RDKit3D, OCL, s8, seed)).sort((p, q) => p.energy - q.energy);
  assert.ok(crown.energy < -60);
});

test('no MMFF94 types: null, for OpenChemLib', () => {
  for (const smiles of ['c1ccc(cc1)B(c1ccccc1)c1ccccc1', 'ClP(Cl)(Cl)(Cl)c1ccccc1', 'C[N+](C)(C)[B-](F)(F)F']) {
    const molfile = drawn(smiles);
    assert.equal(moleculeIn3DByRDKit(RDKit3D, OCL, molfile), null);
    assert.ok(moleculeIn3D(OCL, molfile));
  }
});

test('XYZ by RDKit: all hydrogens, the drawn R/S; OpenChemLib where RDKit has no MMFF94 types', async () => {
  for (const smiles of [FRUCTOSE, 'c1ccc(cc1)B(c1ccccc1)c1ccccc1']) {
    const molfile = drawn(smiles);
    const xyz = await conformersXyz(OCL, [smiles], 'test', (k, text) => sameStereo(RDKit, molfile, text), RDKit3D);
    const H = RDKit.get_mol(smiles);
    H.add_hs_in_place();
    assert.equal(Number.parseInt(xyz, 10), H.get_num_atoms());
    H.delete();
  }
});

test('XYZ: several tries at once give the same structure as one after the other', async () => {
  const attempt = async (input, seed) => conformerAtoms(RDKit3D, OCL, input, seed);
  const molfile = drawn(FRUCTOSE);
  const fits = (k, text) => sameStereo(RDKit, molfile, text);
  assert.equal(await conformersXyz(null, [FRUCTOSE], 'test', fits, null, { attempt, batch: 4 }), await conformersXyz(OCL, [FRUCTOSE], 'test', fits, RDKit3D));
});

test('XYZ: a lone ion OpenChemLib has no atom types for goes through with the rest', async () => {
  for (const ion of ['[Br+]', '[Cl+]', '[N+]']) {
    assert.equal(embedded(RDKit3D, OCL, ion, 42).energy, null, ion);
    assert.match(await conformersXyz(OCL, [ion, 'O'], 'test', () => true, RDKit3D), /^4\n/, ion);
  }
});

test('a cage RDKit cannot embed gives up in seconds, not in most of a minute', () => {
  const C60 = 'c12c3c4c5c2c2c6c7c1c1c8c3c3c9c4c4c%10c5c5c2c2c6c6c%11c7c1c1c7c8c3c3c8c9c4c4c9c%10c5c5c2c2c6c6c%11c1c1c7c3c3c8c4c4c9c5c2c2c6c1c3c42';
  const started = Date.now();
  assert.equal(embedded(RDKit3D, OCL, C60, 42), null);
  assert.ok(Date.now() - started < 15_000, `${Date.now() - started} ms`);
});
