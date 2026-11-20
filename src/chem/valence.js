// Hydrogens, lone pairs and unpaired electrons of each atom, from its
// element, charge, bonds and radical state:
//   implicit H = the smallest allowed valence that fits − bond orders − unpaired electrons
//   lone pairs = (valence electrons − charge − bond orders − H − unpaired electrons) / 2
// for main-group elements (others get no lone pairs). The same rules as
// RDKit's for the usual cases; checked against it in the tests.
import { atomicNumber, isMainGroup, valenceElectrons, valencesOf } from './elements.js';
import { bondsByAtom } from '../model/doc.js';
import { overfullLabel } from './abbreviations.js';
import { t } from '../i18n/i18n.js';

// Electrons not in bonds or pairs, per radical code: as in molfiles (0 none, 1 singlet: two electrons
// together, 2 doublet: one, 3 triplet: two) and on (4: three, 5: four), for Lewis symbols (·N̈·, ·Ċ·),
// which molfiles can't say (written there as the atom without its H).
export const RADICAL_ELECTRONS = { 0: 0, 1: 2, 2: 1, 3: 2, 4: 3, 5: 4 };
// How they are drawn: the dots of each place (a singlet's two together; from a triplet on, each unpaired
// electron on a place of its own, as a Lewis symbol fills its sides singly before pairing).
export const RADICAL_PLACES = { 0: [], 1: [2], 2: [1], 3: [1, 1], 4: [1, 1, 1], 5: [1, 1, 1, 1] };
// The radical tool's and the . key's cycle: none -> one dot -> two dots (carbene) -> none
export const RADICAL_CYCLE = { 0: 2, 2: 1, 1: 0, 3: 0, 4: 0, 5: 0 };

// For one atom: { hydrogens, lonePairs, unpaired, bondOrder, error }.
// `error` is a short explanation if the atom has more bonds than allowed.
// A partial bond (in a transition state) counts as a bond, but more bonds
// than allowed are no error there (the carbon of an SN2 transition state);
// hydrogen and dative bonds count nothing, except that a dative bond uses
// one lone pair of its donor.
export function electronsOf(atom, bonds) {
  const bondOrder = bonds.reduce((sum, bond) => sum + (bond.kind && bond.kind !== 'partial' ? 0 : bond.order), 0);
  const donated = 2 * bonds.filter((bond) => bond.kind === 'dative' && bond.a === atom.id).length;
  const partial = bonds.some((bond) => bond.kind === 'partial');
  const unpaired = RADICAL_ELECTRONS[atom.radical ?? 0] ?? 0;
  const z = atomicNumber(atom.el);
  const valences = valencesOf(atom.el, atom.charge);
  let hydrogens = 0;
  let error = null;
  if (overfullLabel(atom, bonds)) error = t('{label} stands for a group on one bond', { label: atom.alias });
  if (atom.hCount !== null && atom.hCount !== undefined) {
    hydrogens = atom.hCount;
  } else if (valences) {
    const fits = valences.find((v) => v >= bondOrder + unpaired);
    if (fits !== undefined) hydrogens = fits - bondOrder - unpaired;
    else if (!partial) error = atom.charge ? t("{el} with this charge can't have {n} bonds", { el: atom.el, n: bondOrder }) : t("{el} can't have {n} bonds", { el: atom.el, n: bondOrder });
  }
  let lonePairs = 0;
  if (z && isMainGroup(z) && z > 2) {
    const free = valenceElectrons(z) - atom.charge - bondOrder - hydrogens - unpaired - donated;
    if (free < 0 && !error && !partial) error = t('{el} has too few electrons for this', { el: atom.el });
    lonePairs = Math.max(0, Math.floor(free / 2));
  }
  return { hydrogens, lonePairs, unpaired, bondOrder, error };
}

// electronsOf for every atom: Map id -> result.
export function electronsByAtom(doc, byAtom = bondsByAtom(doc)) {
  const result = new Map();
  for (const atom of doc.atoms.values()) result.set(atom.id, electronsOf(atom, byAtom.get(atom.id)));
  return result;
}
