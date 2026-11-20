// Molecular formula (Hill order: C, H, then alphabetical; without carbon
// all alphabetical; hydrogen 2 and 3 after H, as they are drawn: D and T,
// or ²H and ³H (CDCl3, C²HCl3); other isotopes count with their element,
// at their own mass), molar mass and exact mass of a set of atoms, implicit
// hydrogens included; and from them the numbers a lab report quotes (HRMS
// ions, elemental analysis). Abbreviations (Ph, Boc) count with their
// atoms; generic labels (R, X) are left out, and then there are no masses.
import { abbreviationOf } from './abbreviations.js';
import { isotopeLetter } from './elements.js';
import { electronsByAtom } from './valence.js';

// Standard atomic weights (IUPAC, conventional values), g/mol.
const MASS = {
  H: 1.008, D: 2.0141, T: 3.0160, '²H': 2.0141, '³H': 3.0160, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180,
  Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.95, K: 39.098, Ca: 40.078,
  Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
  Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Zr: 91.224,
  Mo: 95.95, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71, Sb: 121.76,
  Te: 127.60, I: 126.90, Xe: 131.29, Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, W: 183.84, Os: 190.23,
  Ir: 192.22, Pt: 195.08, Au: 196.97, Hg: 200.59, Tl: 204.38, Pb: 207.2, Bi: 208.98, U: 238.03,
};

// Monoisotopic masses (the most abundant isotope), u; and some isotopes by
// mass number. Others count as their mass number.
const EXACT = {
  H: 1.00782503, D: 2.01410178, T: 3.01604928, '²H': 2.01410178, '³H': 3.01604928, He: 4.00260325, Li: 7.01600344, Be: 9.0121831, B: 11.00930536, C: 12, N: 14.00307401, O: 15.99491462,
  F: 18.99840316, Ne: 19.99244018, Na: 22.98976928, Mg: 23.9850417, Al: 26.98153853, Si: 27.97692653, P: 30.97376200,
  S: 31.97207117, Cl: 34.96885268, Ar: 39.96238312, K: 38.96370649, Ca: 39.96259086, Ti: 47.94794198, V: 50.94395704,
  Cr: 51.94050623, Mn: 54.93804391, Fe: 55.93493633, Co: 58.93319429, Ni: 57.93534241, Cu: 62.92959772, Zn: 63.92914201,
  Ga: 68.9255735, Ge: 73.92117776, As: 74.92159457, Se: 79.9165218, Br: 78.9183376, Kr: 83.91149773, Rb: 84.91178974,
  Sr: 87.9056125, Zr: 89.9046977, Mo: 97.90540482, Ru: 101.9043441, Rh: 102.905498, Pd: 105.9034804, Ag: 106.9050916,
  Cd: 113.90336509, In: 114.90387878, Sn: 119.90220163, Sb: 120.903812, Te: 129.90622275, I: 126.9044719, Xe: 131.90415509,
  Cs: 132.90545196, Ba: 137.905247, La: 138.9063563, Ce: 139.9054431, W: 183.95093092, Os: 191.961477, Ir: 192.9629216,
  Pt: 194.9647917, Au: 196.96656879, Hg: 201.9706434, Tl: 204.9744278, Pb: 207.9766525, Bi: 208.9803991, U: 238.0507884,
};
const ISOTOPES = { '2H': 2.01410178, '3H': 3.01604928, '13C': 13.00335484, '14C': 14.00324199, '15N': 15.00010890, '17O': 16.99913176, '18O': 17.99915961, '19F': 18.99840316, '34S': 33.96786701, '37Cl': 36.96590260, '81Br': 80.9162897 };
const ELECTRON = 0.000548580; // u

// { formula: [[symbol, count]], charge, mass (g/mol), exact (u, of the
// formula as charged: electrons taken off or added; null if an element's
// mass is unknown) } of the atoms with these ids.
export function formulaOf(doc, atomIds) {
  const electrons = electronsByAtom(doc);
  const counts = new Map();
  let charge = 0;
  let mass = 0;
  let exact = 0;
  for (const id of atomIds) {
    const atom = doc.atoms.get(id);
    if (atom.alias) {
      const group = abbreviationOf(atom);
      if (group) {
        charge += atom.charge ?? 0; // (NEt4⁺)
        for (const [symbol, n] of group.formula) {
          counts.set(symbol, (counts.get(symbol) ?? 0) + n);
          if (mass !== null) mass += n * MASS[symbol];
          if (exact !== null) exact += n * EXACT[symbol];
        }
      } else {
        // a generic label (R, X): only the drawn atoms count
        mass = null;
        exact = null;
      }
      continue;
    }
    const h = electrons.get(id).hydrogens;
    const heavy = atom.el === 'H' && (atom.isotope === 2 || atom.isotope === 3);
    const symbol = isotopeLetter(atom) ?? (heavy ? `${atom.isotope === 2 ? '²' : '³'}H` : atom.el);
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    if (h) counts.set('H', (counts.get('H') ?? 0) + h);
    charge += atom.charge;
    const m = atom.isotope ? ISOTOPES[`${atom.isotope}${atom.el}`] ?? atom.isotope : MASS[atom.el];
    mass = m === undefined || mass === null ? null : mass + m + h * MASS.H;
    const e = atom.isotope ? ISOTOPES[`${atom.isotope}${atom.el}`] ?? atom.isotope : EXACT[atom.el];
    exact = e === undefined || exact === null ? null : exact + e + h * EXACT.H;
  }
  if (exact !== null) exact -= charge * ELECTRON;
  return { formula: hillOrder(counts).map((s) => [s, counts.get(s)]), charge, mass, exact };
}

// The symbols in Hill order (with carbon: C, H, its isotopes, then the
// rest alphabetically; without: all alphabetically).
function hillOrder(counts) {
  const symbols = [...counts.keys()].sort();
  if (!counts.has('C')) return symbols;
  const first = ['C', 'H', '²H', 'D', '³H', 'T'].filter((s) => counts.has(s));
  return [...first, ...symbols.filter((s) => !first.includes(s))];
}

// A formula as plain text: C9H9O4.
export const formulaText = (formula) => formula.map(([s, n]) => `${s}${n > 1 ? n : ''}`).join('');

function adjust(formula, symbol, delta) {
  const counts = new Map(formula);
  counts.set(symbol, (counts.get(symbol) ?? 0) + delta);
  for (const [s, n] of counts) if (n <= 0) counts.delete(s);
  return hillOrder(counts).map((s) => [s, counts.get(s)]);
}

// The numbers a lab report quotes for a formula: the ions HRMS would see
// ([M+H]⁺, [M+Na]⁺, [M−H]⁻ for a neutral molecule, [M]⁺ or [M]²⁻ for an
// ion) as { ion, formula, mz, text }, and the elemental analysis (C, H, N,
// S in mass percent) as { parts: [[symbol, percent]], text }. Texts without
// words, so they fit a report in any language: the formula, the ion and its
// m/z (C9H8O4 [M+H]+ 181.0495); the formula and the percentages
// (C9H8O4: C 60.00, H 4.48).
export function labNumbers({ formula, charge, mass, exact }) {
  const ions = [];
  if (exact !== null) {
    if (charge === 0) {
      for (const [ion, symbol, delta, z] of [['[M+H]+', 'H', 1, 1], ['[M+Na]+', 'Na', 1, 1], ['[M−H]−', 'H', -1, -1]]) {
        const f = adjust(formula, symbol, delta);
        const mz = exact + delta * EXACT[symbol] - z * ELECTRON;
        ions.push({ ion, formula: f, mz, text: `${formulaText(formula)} ${ion.replaceAll('−', '-')} ${mz.toFixed(4)}` });
      }
    } else {
      const z = Math.abs(charge);
      const ion = `[M]${z > 1 ? z : ''}${charge > 0 ? '+' : '−'}`;
      const mz = exact / z;
      ions.push({ ion, formula, mz, text: `${formulaText(formula)} ${ion.replaceAll('−', '-')} ${mz.toFixed(4)}` });
    }
  }
  let analysis = null;
  if (mass !== null && mass > 0) {
    const counts = new Map(formula);
    const parts = ['C', 'H', 'N', 'S'].filter((s) => counts.get(s)).map((s) => [s, (100 * counts.get(s) * MASS[s]) / mass]);
    if (parts.length) analysis = { parts, text: `${formulaText(formula)}: ${parts.map(([s, p]) => `${s} ${p.toFixed(2)}`).join(', ')}` };
  }
  return { ions, analysis };
}
