// Reading structures with RDKit.js, with RDKit's own error message on failure.
import { t } from '../i18n/i18n.js';

let errorLog = null;
let warningLog = null;

// RDKit molecule from a molfile or SMILES, keeping explicit hydrogens
// (`details`: more RDKit reading options). Throws with RDKit's explanation
// (e.g. a valence error) if RDKit can't read it. The caller must .delete()
// the molecule (it lives in WebAssembly memory). RDKit's warnings (a wedge
// it ignores, a transition state's partial bond it writes as none) are
// kept out of the console.
export function readMol(RDKit, input, details = {}) {
  errorLog ??= RDKit.set_log_capture('rdApp.error');
  warningLog ??= RDKit.set_log_capture('rdApp.warning');
  errorLog.clear_buffer();
  warningLog.clear_buffer();
  const mol = RDKit.get_mol(input, JSON.stringify({ removeHs: false, ...details }));
  if (mol) return mol;
  const reason = errorLog.get_buffer().split('\n').map((line) => line.replace(/^\[[\d:]+\]\s*/, '')).find(Boolean);
  throw new Error(reason ? t('RDKit cannot read this structure ({reason}).', { reason }) : t('RDKit cannot read this structure.'));
}

const HALOGENS = new Set([17, 35, 53]); // Cl, Br, I

// Does a molecule (read without RDKit's checks) have a halogen with more
// than one bond (Cl=O, ClO4⁻ written Cl(=O)(=O)(=O)[O-])? From RDKit's
// JSON of it.
function crowdedHalogen(mol) {
  const { molecules: [m], defaults } = JSON.parse(mol.get_json());
  const bonds = new Map();
  for (const bond of m.bonds ?? []) for (const i of bond.atoms) bonds.set(i, (bonds.get(i) ?? 0) + (bond.bo ?? defaults.bond.bo));
  return m.atoms.some((atom, index) => HALOGENS.has(atom.z ?? defaults.atom.z) && bonds.get(index) > 1);
}

// A SMILES read by RDKit: { mol, asWritten }. RDKit refuses Cl=O (a
// halogen has one bond for it) and its clean-up redraws perchlorate as
// [Cl+3] with four O⁻, where school chemistry writes Cl=O; so a SMILES with
// a halogen of more than one bond is read by RDKit's parser without its
// checks (its own sanitize: false option), as written (`asWritten`), and
// our valence rules give the hydrogens (Cl=O: H–Cl=O). Any other SMILES as
// RDKit reads it. Throws as readMol does. The caller must .delete() the
// molecule.
export function readSmiles(RDKit, smiles, details = {}) {
  const raw = RDKit.get_mol(smiles, JSON.stringify({ ...details, sanitize: false }));
  if (raw && crowdedHalogen(raw)) return { mol: raw, asWritten: true };
  raw?.delete();
  return { mol: readMol(RDKit, smiles, details), asWritten: false };
}

// What RDKit says about a text it can't read (its error lines, without
// times), or null if it reads it (a SMILES as readSmiles reads it).
export function rdkitProblem(RDKit, input) {
  errorLog ??= RDKit.set_log_capture('rdApp.error');
  errorLog.clear_buffer();
  const raw = RDKit.get_mol(input, JSON.stringify({ sanitize: false }));
  const crowded = raw ? crowdedHalogen(raw) : false;
  raw?.delete();
  if (crowded) return null;
  const mol = RDKit.get_mol(input, JSON.stringify({ removeHs: false }));
  if (mol) {
    mol.delete();
    return null;
  }
  return errorLog.get_buffer().split('\n').map((line) => line.replace(/^\[[\d:]+\]\s*/, '')).filter(Boolean).join('\n') || '?';
}

// RDKit canonical isomeric SMILES of a molfile, with stereo read from the
// wedges and coordinates as drawn.
export function canonicalSmiles(RDKit, molfile) {
  const mol = readMol(RDKit, molfile);
  try {
    return mol.get_smiles();
  } finally {
    mol.delete();
  }
}
