// Molecules side by side as one V2000 molfile (RDKit coordinates, each shifted along x), for a
// drawing set up before a recording.
import { createRequire } from 'node:module';
const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
export function sideBySide(list) { // [[smiles, dx, dy]] in bond lengths
  const atoms = [];
  const bonds = [];
  const charges = [];
  for (const [smiles, dx, dy = 0] of list) {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const lines = mol.get_molblock().split('\n');
    mol.delete();
    const [na, nb] = [Number(lines[3].slice(0, 3)), Number(lines[3].slice(3, 6))];
    const atomLines = lines.slice(4, 4 + na);
    const xs = atomLines.map((l) => Number(l.slice(0, 10)));
    const ys = atomLines.map((l) => Number(l.slice(10, 20)));
    const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const offset = atoms.length;
    atomLines.forEach((l, i) => atoms.push(`${(xs[i] - cx + dx * 1.5).toFixed(4).padStart(10)}${(ys[i] - cy - dy * 1.5).toFixed(4).padStart(10)}${l.slice(20)}`));
    for (const l of lines.slice(4 + na + nb)) { // charges, numbered as the atoms now are
      if (!l.startsWith('M  CHG')) continue;
      const pairs = l.slice(9).trim().split(/\s+/).map(Number);
      for (let i = 0; i < pairs.length; i += 2) charges.push([pairs[i] + offset, pairs[i + 1]]);
    }
    for (const l of lines.slice(4 + na, 4 + na + nb)) bonds.push(`${String(Number(l.slice(0, 3)) + offset).padStart(3)}${String(Number(l.slice(3, 6)) + offset).padStart(3)}${l.slice(6)}`);
  }
  return ['', '  olomol demo', '', `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`, ...atoms, ...bonds, ...charges.map(([k, c]) => `M  CHG  1${String(k).padStart(4)}${String(c).padStart(4)}`), 'M  END'].join('\n');
}
