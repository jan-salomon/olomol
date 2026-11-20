// R/S and E/Z labels from RDKit (CIP rules), for the stereocentres and
// double bonds as drawn (wedges and coordinates); Λ and Δ for octahedral
// complexes with chelates (handedness.js).
import { writeMolfile } from '../io/molfile.js';
import { getRDKit } from '../io/rdkit.js';
import { withGroupsDrawnOut } from '../editor/abbreviate.js';
import { bondBetween } from '../model/doc.js';
import { fragments } from '../model/graph.js';
import { complexHandedness } from './handedness.js';

// Does any atom or bond ask for its R/S or E/Z label (cipLabel)?
export const wantsStereo = (doc) => [...doc.atoms.values()].some((a) => a.cipLabel) || [...doc.bonds.values()].some((b) => b.cipLabel);

// { atoms: Map atom id -> 'R' | 'S' (a metal: 'Λ' | 'Δ'), bonds: Map bond id -> 'E' | 'Z' }.
// Molecules RDKit can't read (unfinished drawings) are skipped.
export async function stereoLabels(drawn) {
  const RDKit = await getRDKit();
  // abbreviations drawn out, so a Ph ranks as a phenyl (atoms keep their ids)
  const { doc } = await withGroupsDrawnOut(drawn);
  const atoms = new Map();
  const bonds = new Map();
  for (const members of fragments(doc)) {
    if (members.length < 3) continue;
    const { molfile, atomIds } = writeMolfile(doc, members);
    const mol = RDKit.get_mol(molfile, JSON.stringify({ removeHs: false }));
    if (!mol) continue;
    try {
      const tags = JSON.parse(mol.get_stereo_tags());
      for (const [i, label] of tags.CIP_atoms ?? []) atoms.set(atomIds[i], label.replace(/[()]/g, ''));
      for (const [i, j, label] of tags.CIP_bonds ?? []) {
        const bond = bondBetween(doc, atomIds[i], atomIds[j]);
        if (bond) bonds.set(bond.id, label.replace(/[()]/g, ''));
      }
    } catch {
      // no stereo tags for this one
    } finally {
      mol.delete();
    }
  }
  for (const [metal, label] of complexHandedness(drawn)) atoms.set(metal, label);
  return { atoms, bonds };
}
