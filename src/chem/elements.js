// The periodic table, as far as drawing needs it: symbols, groups, valence
// electrons, the valences that get implicit hydrogens, and display colours.

export const SYMBOLS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr '
  + 'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os '
  + 'Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc '
  + 'Lv Ts Og').split(' ');

const NUMBER = new Map(SYMBOLS.map((symbol, i) => [symbol, i + 1]));
export const atomicNumber = (symbol) => NUMBER.get(symbol) ?? 0;
export const isElement = (symbol) => NUMBER.has(symbol);

// Isotopes as written: D and T (²H, ³H, written as their letters:
// letter), or a mass number before an element symbol (13C, 18O, and 2H, 3H
// for beginners, who don't know D and T yet). { el, isotope, letter } or
// null: anything else (4-DMTr, 2-Ns, Ph) is not an isotope.
export function readIsotope(text) {
  if (text === 'D') return { el: 'H', isotope: 2, letter: true };
  if (text === 'T') return { el: 'H', isotope: 3, letter: true };
  const match = text.match(/^(\d{1,3})([A-Z][a-z]?)$/);
  if (!match || !isElement(match[2])) return null;
  const isotope = Number(match[1]);
  return isotope >= atomicNumber(match[2]) && isotope < 300 ? { el: match[2], isotope, letter: false } : null;
}

// The letter of hydrogen 2 or 3 written as D or T (atom.letter), else null.
export const isotopeLetter = (atom) => (atom.el === 'H' && atom.letter ? { 2: 'D', 3: 'T' }[atom.isotope] ?? null : null);

// An atom's symbol as typed into the element field: 13C, D, Cl.
export const writtenSymbol = (atom) => isotopeLetter(atom) ?? `${atom.isotope ?? ''}${atom.el}`;

// Group (1-18) of element z; 0 for lanthanides and actinides (La-Yb, Ac-No).
export function groupOf(z) {
  if (z === 1) return 1;
  if (z === 2) return 18;
  const periods = [[3, 10], [11, 18], [19, 36], [37, 54], [55, 86], [87, 118]];
  for (const [first, last] of periods) {
    if (z < first || z > last) continue;
    const k = z - first;
    if (last - first === 7) return k < 2 ? k + 1 : k + 11; // periods 2 and 3: no d block
    if (last - first === 17) return k + 1; // periods 4 and 5
    // periods 6 and 7: s, then 14 f-block elements, then Lu/Lr and the rest
    if (k < 2) return k + 1;
    if (k < 16) return 0;
    return k - 13;
  }
  return 0;
}

// The family of element z, for the periodic table's colours: alkali,
// alkaline, transition, post-transition, metalloid, nonmetal, halogen,
// noble, lanthanide or actinide.
const FAMILIES = {
  alkali: [3, 11, 19, 37, 55, 87],
  alkaline: [4, 12, 20, 38, 56, 88],
  postTransition: [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116],
  metalloid: [5, 14, 32, 33, 51, 52],
  nonmetal: [1, 6, 7, 8, 15, 16, 34],
  halogen: [9, 17, 35, 53, 85, 117],
  noble: [2, 10, 18, 36, 54, 86, 118],
};
export function familyOf(z) {
  if (z >= 57 && z <= 71) return 'lanthanide';
  if (z >= 89 && z <= 103) return 'actinide';
  return Object.keys(FAMILIES).find((family) => FAMILIES[family].includes(z)) ?? 'transition';
}

// Main-group elements (s and p block) have lone pairs and octets.
export const isMainGroup = (z) => [1, 2, 13, 14, 15, 16, 17, 18].includes(groupOf(z));

export function valenceElectrons(z) {
  const group = groupOf(z);
  if (z === 2) return 2;
  if (group === 1 || group === 2) return group;
  if (group >= 13) return group - 10;
  return 0;
}

// Valences that get implicit hydrogens (as in RDKit's organic subset, plus a
// few more); other elements only have the hydrogens drawn or set.
const VALENCES = {
  H: [1], B: [3], C: [4], N: [3], O: [2], F: [1], Si: [4], P: [3, 5], S: [2, 4, 6], Cl: [1, 3, 5, 7], Ge: [4],
  As: [3, 5], Se: [2, 4, 6], Br: [1, 3, 5, 7], Te: [2, 4, 6], I: [1, 3, 5, 7], He: [0], Ne: [0], Ar: [0], Be: [2],
};

// Valences of an atom of `symbol` with `charge`: those of the element with
// as many electrons (N+ like C, O− like F, C− like N, B− like C), as RDKit
// does. Null if the element gets no implicit hydrogens.
export function valencesOf(symbol, charge = 0) {
  if (!VALENCES[symbol]) return null;
  if (!charge) return VALENCES[symbol];
  const same = SYMBOLS[atomicNumber(symbol) - charge - 1];
  if (same && VALENCES[same]) return VALENCES[same];
  return VALENCES[symbol].map((v) => v - Math.abs(charge)).filter((v) => v >= 0);
}

// Display colours ("colour by element"), dark enough for white paper.
const COLORS = {
  H: '#5c6670', B: '#c2585a', N: '#2350d8', O: '#dd2a1f', F: '#2f9a3a', Na: '#7e3fc4', Mg: '#2b8a2b', Al: '#8a7471',
  Si: '#a0742f', P: '#e07000', S: '#b89400', Cl: '#1f9b33', K: '#7e3fc4', Ca: '#2b8a2b', Fe: '#c45a1f', Cu: '#b8692b',
  Zn: '#6c6fa8', Br: '#9c2a2a', I: '#8a1fa2', Li: '#7e3fc4', Se: '#c47a00', As: '#9a5fc4', Sn: '#5f7f8a', Pt: '#6c7a8a',
  Pd: '#3f7a8a', Ti: '#6c7a8a', Mn: '#8a5fc4', Co: '#d0507a', Ni: '#3f9a5a', Ag: '#7a7a7a', Au: '#c49a00', Hg: '#8a8aa8',
};
export const elementColor = (symbol) => COLORS[symbol] ?? (symbol === 'C' || !NUMBER.has(symbol) ? null : '#46505a');

// Generic labels, offered with the periodic table (abbreviations such as
// Ph are in abbreviations.js). They are atoms of element '*' with the label
// as alias, so Ar is aryl, not argon.
export const GROUP_LABELS = ['R', "R'", "R''", 'R1', 'R2', 'X', 'Y', 'Nu', 'E', 'LG', 'Ar'];

// Elements whose hydrogens are written in front of the symbol when the atom
// stands alone (H2O, HCl, but NH3, CH4).
export const H_FIRST = new Set(['O', 'S', 'Se', 'Te', 'F', 'Cl', 'Br', 'I']);
