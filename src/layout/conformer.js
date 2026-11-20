// A molecule's 3D conformer from RDKit's ETKDG (megane-rdkit), or from OpenChemLib where RDKit has no MMFF94
// types, apart from the rest of threeD.js so that a worker can run it (conformerWorker.js) without the app's
// other modules.
import { parseMolfile } from './molfile.js';

const sub = (a, b) => a.map((v, i) => v - b[i]);
const times = (a, k) => a.map((v) => v * k);
const norm = (a) => Math.hypot(...a);

// A molfile's points in bond lengths, with their energy and the conformer's hydrogens (points.hydrogens, in
// the same units: for showing the model as it is, a stick model).
function inBondLengths(points, molfile, energy, hydrogens = []) {
  const { bonds } = parseMolfile(molfile);
  const mean = bonds.reduce((sum, { a, b }) => sum + norm(sub(points[a], points[b])), 0) / (bonds.length || 1);
  return Object.assign(points.map((p) => times(p, 1 / (mean || 1))), { energy, hydrogens: hydrogens.map((p) => times(p, 1 / (mean || 1))) });
}

// The molfile with its chiral flag set: R/S as drawn, not "or its mirror image".
export const withChiralFlag = (molfile) => molfile.replace(/^((?:.*\n){3})(.{12}).{3}/, (all, head, counts) => `${head}${counts}  1`);

// The molfile with each atom's number (1, 2…) as its atom map number, to find the atoms again in what
// OpenChemLib makes of it: it moves hydrogens drawn as atoms to the end of its atom list, so its own
// order is not the molfile's (methanol drawn C, H, O, H; a Newman projection's H between its carbons; a water
// ligand drawn H–O–H).
export function withMapNumbers(molfile) {
  const lines = molfile.split('\n');
  const n = Number.parseInt(lines[3].slice(0, 3), 10);
  for (let k = 0; k < n; k++) lines[4 + k] = `${lines[4 + k].slice(0, 60).padEnd(60)}${String(k + 1).padStart(3)}${lines[4 + k].slice(63)}`;
  return lines.join('\n');
}

// A molecule in 3D from OpenChemLib (`OCL`, resources registered): the
// points of the molfile's atoms in bond lengths, or null; points.energy:
// its MMFF94s+ energy (null where MMFF94 has no atom types, a boron with
// three bonds: then as generated; one with four is minimised as a carbon). `seed`: another try of its conformer generator (it can get a
// stereocentre wrong, see molfile3D for the check; and it finds S8's crown
// only now and then, so the lowest energy of a few tries is taken).
export function moleculeIn3D(OCL, molfile, seed = 42) {
  const mol = OCL.Molecule.fromMolfile(withChiralFlag(withMapNumbers(molfile)));
  const n = mol.getAllAtoms();
  // a boron with four bonds (B⁻: a BODIPY's, BF4⁻) is built and minimised as the carbon it is
  // like (MMFF94 has no types for boron, and an unminimised conformer can be badly twisted)
  for (let i = 0; i < n; i++) {
    if (mol.getAtomicNo(i) === 5 && mol.getAtomCharge(i) === -1 && mol.getConnAtoms(i) + mol.getImplicitHydrogens(i) === 4) {
      mol.setAtomicNo(i, 6);
      mol.setAtomCharge(i, 0);
    }
  }
  const conformer = new OCL.ConformerGenerator(seed).getOneConformerAsMolecule(mol);
  if (!conformer) return null;
  let energy = null;
  try {
    const field = new OCL.ForceFieldMMFF94(conformer, OCL.ForceFieldMMFF94.MMFF94SPLUS);
    field.minimise();
    energy = field.getTotalEnergy();
  } catch {
    // no MMFF94 atom types (a boron with three bonds): as generated
  }
  const points = new Array(n);
  const hydrogens = []; // (the atoms the generator added)
  for (let i = 0; i < conformer.getAllAtoms(); i++) {
    const k = conformer.getAtomMapNo(i);
    const p = [conformer.getAtomX(i), conformer.getAtomY(i), conformer.getAtomZ(i)];
    if (k) points[k - 1] = p;
    else if (conformer.getAtomicNo(i) === 1) hydrogens.push(p);
  }
  if (points.some((p) => !p)) return null;
  return inBondLengths(points, molfile, energy, hydrogens);
}

// One try of RDKit's ETKDG with MMFF94s (`RDKit3D`: megane-rdkit, loaded) on a molfile or a SMILES: { atoms:
// [{ el, x, y, z }] in Å, the molecule's own first and the hydrogens RDKit added after them, energy }, or null
// where RDKit has no MMFF94 types (boron, a P with five bonds; it would use UFF) or can't embed it.
// The energy is OpenChemLib's MMFF94s+, not RDKit's: RDKit's leaves out pairs of atoms more than 10 Å apart
// when it starts (nonBondedThresh in C++), so a side chain can fold through the rest of the molecule, with
// atoms on top of each other and the lowest energy of all. Here such a try has an energy in the thousands;
// null where OpenChemLib has no types for it (a lone Br⁺). ATTEMPTS: enough for what embeds at all, a hard
// seed of taxol's included (fewer change its results, for the worse), and one that can't (C60) gives up in
// about 9 s, not 45.
const ATTEMPTS = 120;
export function embedded(RDKit3D, OCL, input, seed) {
  let made;
  try {
    made = RDKit3D.embed(input, { randomSeed: seed, forceField: 'MMFF94s', maxIters: 2000, embedParams: { maxIterations: ATTEMPTS, useMacrocycleTorsions: true, useMacrocycle14config: true } });
  } catch {
    return null;
  }
  if (made.forceField !== 'MMFF94s') return null;
  const [block] = made.molblocks;
  const atoms = block.split('\n').slice(4, 4 + made.numAtoms).map((line) => ({
    el: line.slice(31, 34).trim(), x: parseFloat(line.slice(0, 10)), y: parseFloat(line.slice(10, 20)), z: parseFloat(line.slice(20, 30)),
  }));
  let energy = null;
  try {
    energy = new OCL.ForceFieldMMFF94(OCL.Molecule.fromMolfile(block), OCL.ForceFieldMMFF94.MMFF94SPLUS).getTotalEnergy();
  } catch {
    // no MMFF94 atom types in OpenChemLib: the try is good, but has no energy to compare
  }
  return { atoms, energy };
}

// How a try is taken. With more heavy atoms than LARGE (erythromycin, azithromycin) a seed can take 30 s where
// another takes 4, however its attempts are limited: fewer conformers are enough, the first to finish, so the
// structure can differ a little from run to run. With an energy above FOLDED atoms are folded through each other:
// such a try counts for nothing, and is taken only if there is nothing better.
export const LARGE = 40;
export const FOLDED = 1000;

// One try for a file, of a V2000 molfile or a SMILES: { atoms (Å, all hydrogens), energy, byRDKit } from RDKit
// (`RDKit3D`, or null), else from OpenChemLib { atoms, energy: null, unminimised: no MMFF94 atom type for an
// atom (B, the O of C≡O⁺), so as generated }; or null.
export function conformerAtoms(RDKit3D, OCL, input, seed) {
  const molfile = input.includes('V2000');
  const made = RDKit3D && embedded(RDKit3D, OCL, molfile ? withChiralFlag(input) : input, seed);
  if (made) return { ...made, byRDKit: true };
  const mol = molfile ? OCL.Molecule.fromMolfile(withChiralFlag(input)) : OCL.Molecule.fromSmiles(input);
  const conformer = new OCL.ConformerGenerator(seed).getOneConformerAsMolecule(mol);
  if (!conformer) return null;
  let unminimised = false;
  try {
    new OCL.ForceFieldMMFF94(conformer, OCL.ForceFieldMMFF94.MMFF94SPLUS).minimise();
  } catch {
    unminimised = true;
  }
  const atoms = Array.from({ length: conformer.getAllAtoms() }, (_, i) => ({
    el: conformer.getAtomLabel(i), x: conformer.getAtomX(i), y: conformer.getAtomY(i), z: conformer.getAtomZ(i),
  }));
  return { atoms, energy: null, byRDKit: false, unminimised };
}

// A molecule in 3D as moleculeIn3D gives it, by `embedded`, or null: the molfile's atoms are the first of RDKit's.
export function moleculeIn3DByRDKit(RDKit3D, OCL, molfile, seed = 42) {
  const made = embedded(RDKit3D, OCL, withChiralFlag(molfile), seed);
  if (!made) return null;
  const n = Number.parseInt(molfile.split('\n')[3].slice(0, 3), 10);
  return inBondLengths(made.atoms.slice(0, n).map(({ x, y, z }) => [x, y, z]), molfile, made.energy,
    made.atoms.slice(n).filter(({ el }) => el === 'H').map(({ x, y, z }) => [x, y, z]));
}

