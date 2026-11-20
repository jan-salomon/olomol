// Abbreviations (Ph, Boc, Ts, OMe, CO2Et): a label on one atom that stands
// for a whole group. They count in formulas and masses, and files and
// identifiers get the group itself; Expand draws it. Each is a SMILES whose
// first atom, *, is where it attaches, and its formula (the tests check one
// against the other). Generic labels (R, X, Nu, Ar) stay placeholders.
// Ac and Ts are acetyl and tosyl here, not actinium and tennessine (the
// periodic table still has those); Pr is left out (praseodymium or propyl?).
import { condensedGroup, reversedCondensed } from './condensed.js';

export const ABBREVIATIONS = {
  Me: ['*C', 'CH3'],
  Et: ['*CC', 'C2H5'],
  nPr: ['*CCC', 'C3H7'],
  iPr: ['*C(C)C', 'C3H7'],
  nBu: ['*CCCC', 'C4H9'],
  iBu: ['*CC(C)C', 'C4H9'],
  sBu: ['*C(C)CC', 'C4H9'],
  tBu: ['*C(C)(C)C', 'C4H9'],
  Cy: ['*C1CCCCC1', 'C6H11'],
  Ph: ['*c1ccccc1', 'C6H5'],
  Bn: ['*Cc1ccccc1', 'C7H7'],
  Mes: ['*c1c(C)cc(C)cc1C', 'C9H11'],
  Tr: ['*C(c1ccccc1)(c1ccccc1)c1ccccc1', 'C19H15'],
  PMB: ['*Cc1ccc(OC)cc1', 'C8H9O'],
  Ac: ['*C(C)=O', 'C2H3O'],
  Bz: ['*C(=O)c1ccccc1', 'C7H5O'],
  Piv: ['*C(=O)C(C)(C)C', 'C5H9O'],
  Boc: ['*C(=O)OC(C)(C)C', 'C5H9O2'],
  Cbz: ['*C(=O)OCc1ccccc1', 'C8H7O2'],
  Fmoc: ['*C(=O)OCC1c2ccccc2-c2ccccc21', 'C15H11O2'],
  Ts: ['*S(=O)(=O)c1ccc(C)cc1', 'C7H7O2S'],
  Ms: ['*S(=O)(=O)C', 'CH3O2S'],
  Tf: ['*S(=O)(=O)C(F)(F)F', 'CF3O2S'],
  TMS: ['*[Si](C)(C)C', 'C3H9Si'],
  TES: ['*[Si](CC)(CC)CC', 'C6H15Si'],
  TBS: ['*[Si](C)(C)C(C)(C)C', 'C6H15Si'],
  TIPS: ['*[Si](C(C)C)(C(C)C)C(C)C', 'C9H21Si'],
  THP: ['*C1CCCCO1', 'C5H9O'],
  OMe: ['*OC', 'CH3O'],
  OEt: ['*OCC', 'C2H5O'],
  OtBu: ['*OC(C)(C)C', 'C4H9O'],
  OPh: ['*Oc1ccccc1', 'C6H5O'],
  OBn: ['*OCc1ccccc1', 'C7H7O'],
  OAc: ['*OC(C)=O', 'C2H3O2'],
  OBz: ['*OC(=O)c1ccccc1', 'C7H5O2'],
  OPiv: ['*OC(=O)C(C)(C)C', 'C5H9O2'],
  OTs: ['*OS(=O)(=O)c1ccc(C)cc1', 'C7H7O3S'],
  OMs: ['*OS(=O)(=O)C', 'CH3O3S'],
  OTf: ['*OS(=O)(=O)C(F)(F)F', 'CF3O3S'],
  OTMS: ['*O[Si](C)(C)C', 'C3H9OSi'],
  OTBS: ['*O[Si](C)(C)C(C)(C)C', 'C6H15OSi'],
  NHAc: ['*NC(C)=O', 'C2H4NO'],
  NHBoc: ['*NC(=O)OC(C)(C)C', 'C5H10NO2'],
  NMe2: ['*N(C)C', 'C2H6N'],
  CO2H: ['*C(=O)O', 'CHO2'],
  COOH: ['*C(=O)O', 'CHO2'],
  CO2Me: ['*C(=O)OC', 'C2H3O2'],
  CO2Et: ['*C(=O)OCC', 'C3H5O2'],
  CO2tBu: ['*C(=O)OC(C)(C)C', 'C5H9O2'],
  CHO: ['*C=O', 'CHO'],
  CH2OH: ['*CO', 'CH3O'],
  CN: ['*C#N', 'CN'],
  CF3: ['*C(F)(F)F', 'CF3'],
  NO2: ['*[N+](=O)[O-]', 'NO2'],
  SO3H: ['*S(=O)(=O)O', 'HO3S'],
};

// Charged groups, written with their charge on the label (the SO3⁻ of a sulfonate, the OPO3²⁻ of a sugar
// phosphate): [label, charge, SMILES with the charge where it is, formula]. Drawn out, the charge stays on the
// atom the SMILES has it on (an O), not on the atom on the bond as for NMe3⁺.
export const CHARGED_ABBREVIATIONS = [
  ['SO3', -1, '*S(=O)(=O)[O-]', 'O3S'],
  ['CO2', -1, '*C(=O)[O-]', 'CO2'],
  ['COO', -1, '*C(=O)[O-]', 'CO2'],
  ['OPO3', -2, '*OP(=O)([O-])[O-]', 'O4P'],
  ['OPO3H', -1, '*OP(=O)(O)[O-]', 'HO4P'],
  ['PO3', -2, '*P(=O)([O-])[O-]', 'O3P'],
];
// The charged group a label with this charge stands for: [label, charge, smiles, formula] or undefined.
export const chargedAbbreviation = (alias, charge) => (charge ? CHARGED_ABBREVIATIONS.find(([a, c]) => a === alias && c === charge) : undefined);

// The abbreviation an atom stands for ({ smiles, formula: Map symbol ->
// count }), or null for an element or a generic label. Besides those above,
// an atom with groups on it, as condensed.js reads it (PPh3, Et3N, SiMe3).
export function abbreviationOf(atom) {
  if (atom.el !== '*' || !atom.alias) return null;
  const ion = chargedAbbreviation(atom.alias, atom.charge ?? 0);
  if (ion) return { name: atom.alias, smiles: ion[2], formula: counts(ion[3]), charged: true };
  const entry = ABBREVIATIONS[atom.alias];
  if (entry) return { name: atom.alias, smiles: entry[0], formula: counts(entry[1]) };
  const condensed = condensedGroup(atom.alias, atom.charge ?? 0);
  return condensed && { name: atom.alias, smiles: condensed.smiles, formula: condensed.formula };
}

// How many heavy atoms an atom stands for (how big a group weighs on a chair or in a Newman projection): a
// label's as its abbreviation has them (an unknown one, R, three), any other atom one, a hydrogen none.
export function heavyAtomsOf(atom) {
  if (atom.el === 'H') return 0;
  if (atom.el !== '*' || !atom.alias) return 1;
  let n = 0;
  for (const [el, k] of abbreviationOf(atom)?.formula ?? new Map([['C', 3]])) if (el !== 'H') n += k;
  return n;
}

// An abbreviation (Ph, OMe, CO2Et) on more than one bond: it stands for a group on one (a hydrogen bond or
// an invisible link of One compound not counted). `bonds`: the atom's bonds.
export function overfullLabel(atom, bonds) {
  return Boolean(abbreviationOf(atom)) && bonds.filter((b) => b.kind !== 'hbond' && b.kind !== 'link').length > 1;
}

const cache = new Map();
function counts(formula) {
  if (!cache.has(formula)) {
    const map = new Map();
    for (const [, symbol, n] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) map.set(symbol, (map.get(symbol) ?? 0) + (n ? Number(n) : 1));
    cache.set(formula, map);
  }
  return cache.get(formula);
}

// Written backwards when the bond comes from the right, so the atom that
// attaches is next to it: MeO–, EtO2C–, BocHN–.
const REVERSED = {
  OMe: 'MeO', OEt: 'EtO', OtBu: 'tBuO', OPh: 'PhO', OBn: 'BnO', OAc: 'AcO', OBz: 'BzO', OPiv: 'PivO', OTs: 'TsO', OMs: 'MsO',
  OTf: 'TfO', OTMS: 'TMSO', OTBS: 'TBSO', NHAc: 'AcHN', NHBoc: 'BocHN', NMe2: 'Me2N', CO2H: 'HO2C', COOH: 'HOOC', CO2Me: 'MeO2C',
  CO2Et: 'EtO2C', CO2tBu: 'tBuO2C', CHO: 'OHC', CH2OH: 'HOH2C', CN: 'NC', CF3: 'F3C', NO2: 'O2N', SO3H: 'HO3S',
  SO3: 'O3S', CO2: 'O2C', COO: 'OOC', OPO3: 'O3PO', OPO3H: 'HO3PO', PO3: 'O3P',
};

// How a label is written next to its bond (`bondAngles`: directions of the
// atom's bonds): { text, anchor, lead } with anchor 'start' or 'end' (that
// letter, or the `lead` letters, sit on the atom: the O of OMe, the Si of
// SiMe3) or 'centre' (Ph, R). `left`: written backwards anyway (a template's
// choice).
export function labelLayout(alias, bondAngles, left = false) {
  if (!REVERSED[alias]) {
    // an atom with groups on a bond (PPh3): that atom on the bond (`lead`: its symbol's length), the
    // label written Ph3P when the bond comes from the right
    const reversed = bondAngles.length ? reversedCondensed(alias) : null;
    if (!reversed) return { text: alias, anchor: 'centre' };
    const lead = condensedGroup(alias).centre.length;
    if (left || (bondAngles.length === 1 && Math.cos(bondAngles[0]) > 0.3)) return { text: reversed, anchor: 'end', lead };
    return { text: alias, anchor: 'start', lead };
  }
  if (left || (bondAngles.length === 1 && Math.cos(bondAngles[0]) > 0.3)) return { text: REVERSED[alias], anchor: 'end' };
  return { text: alias, anchor: 'start' };
}
