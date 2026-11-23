// olomol's own modules, loaded in Node as they are (setup.mjs makes the
// Vite-only imports work), and a separate RDKit instance for the truth.
// RDKit for the truth is the same build olomol ships (@rdkit/rdkit).
import { createRequire } from 'node:module';

export const SRC = new URL('../../src/', import.meta.url);
export const src = (path) => import(new URL(path, SRC).href);

let truthRDKit = null;
// An RDKit instance of our own, not the one olomol's code loads (getRDKit).
export async function rdkit() {
  truthRDKit ??= await createRequire(import.meta.url)('@rdkit/rdkit')();
  return truthRDKit;
}

// Valence electrons of the main-group elements by atomic number (the group number, 1–2 and 13–18).
const GROUPS = { 1: 1, 2: 8, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 7, 18: 8, 19: 1, 20: 2, 31: 3, 32: 4, 33: 5, 34: 6, 35: 7, 36: 8, 37: 1, 38: 2, 49: 3, 50: 4, 51: 5, 52: 6, 53: 7, 54: 8, 55: 1, 56: 2 };
export const valenceElectrons = (z) => GROUPS[z];

// RDKit canonical SMILES (stereo included) and InChIKey of a SMILES or molfile; null fields if RDKit can't read it.
export function identity(RDKit, text, details = {}) {
  const mol = RDKit.get_mol(text, JSON.stringify(details));
  if (!mol) return { smiles: null, inchi: null, inchikey: null };
  try {
    const inchi = mol.get_inchi();
    return { smiles: mol.get_smiles(), inchi, inchikey: inchi ? RDKit.get_inchikey_for_inchi(inchi) : null };
  } finally {
    mol.delete();
  }
}
