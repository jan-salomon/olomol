// Labels written as one atom with groups on it (PPh3, Et3N, Bu3SnH, SiMe3, NEt4 with its charge): which
// of their letters are atoms and which name groups (the P of PPh3 coloured as phosphorus, the Ph not), and
// the molecule or group they stand for, so that they count as what they are (formula, Info, PubChem, Draw
// out) like the abbreviations of abbreviations.js.
import { ABBREVIATIONS } from './abbreviations.js';
import { SYMBOLS } from './elements.js';

// the groups such a label is made of (the n of nPr may be left out), and placeholders, for colouring only
export const GROUPS = ['Me', 'Et', 'nPr', 'iPr', 'nBu', 'iBu', 'sBu', 'tBu', 'Cy', 'Ph', 'Bn', 'Mes', 'Tr', 'PMB', 'Ac', 'Bz', 'Piv', 'Boc', 'Cbz',
  'Fmoc', 'Ts', 'Ms', 'Tf', 'TMS', 'TES', 'TBS', 'TIPS', 'THP'];
const SAME = { Pr: 'nPr', Bu: 'nBu' };
const PLACEHOLDERS = ['R', 'Ar', 'X', 'Nu', 'Hal', 'LG'];
const NAMES = [...GROUPS, ...Object.keys(SAME), ...PLACEHOLDERS].sort((p, q) => q.length - p.length);
const ELEMENTS = new Set(SYMBOLS);

// The label's parts: [{ text, el (an atom's element) or group (a group's name) }], or null if it isn't
// all atoms, groups, counts and brackets (Nu′ is fine; a word isn't). A group's name comes before an
// element's symbol: Ts is tosyl, Ac acetyl, Bn benzyl, Pr propyl.
export function labelParts(text) {
  const parts = [];
  for (let i = 0; i < text.length;) {
    const rest = text.slice(i);
    const name = NAMES.find((n) => rest.startsWith(n));
    const two = rest.slice(0, 2);
    let part;
    if (name) part = { text: name, group: SAME[name] ?? name };
    else if (rest.length > 1 && ELEMENTS.has(two)) part = { text: two, el: two };
    else if (ELEMENTS.has(rest[0])) part = { text: rest[0], el: rest[0] };
    else if (/[0-9′″'()[\]+\-−·]/.test(rest[0])) part = { text: rest[0] };
    else return null;
    parts.push(part);
    i += part.text.length;
  }
  return parts;
}

// For each letter of the label, the element whose colour it takes (null: a group's name), as an atom's
// label is coloured: hydrogens with the atom they are on, the one before them (EtOH, NHBoc), or after
// them in a label written backwards for a bond from the right (`reversed`: HOH2C, HO2C, BocHN); a count
// with what it counts (the 2 of NH2 or of O2; the 3 of Ph3 stays the group's).
export function labelElements(text, { reversed = false } = {}) {
  const parts = labelParts(text);
  if (!parts) return null;
  const heavy = parts.map((part) => (part.el && part.el !== 'H' ? part.el : null));
  // the nearest heavy atom one way, past counts and hydrogens, not past a group's name
  const near = (k, step) => {
    for (let j = k + step; j >= 0 && j < parts.length; j += step) {
      if (parts[j].group) return null;
      if (heavy[j]) return heavy[j];
    }
    return null;
  };
  const colours = parts.map((part, k) => (part.el === 'H' ? ((reversed ? near(k, 1) ?? near(k, -1) : near(k, -1) ?? near(k, 1)) ?? 'H') : heavy[k]));
  parts.forEach((part, k) => {
    if (/^[0-9]$/.test(part.text)) colours[k] = colours[k - 1] ?? null;
  });
  return parts.flatMap((part, k) => [...part.text].map(() => colours[k]));
}

// What a label of one atom with groups stands for: { smiles (its * where it hangs on the rest), formula
// (symbol -> count), centre } or null. Groups before or after the atom (Et3N, NEt3), its hydrogens right
// after it (Bu3SnH, NHEt2); at least one group; the atom's charge as given.
export function condensedGroup(alias, charge = 0) {
  const parts = labelParts(alias);
  if (!parts) return null;
  let centre = null;
  let hydrogens = 0;
  const groups = [];
  let previous = null;
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    let count = 1;
    if (/^[0-9]$/.test(parts[k + 1]?.text ?? '')) count = Number(parts[++k].text);
    if (part.group) {
      if (!ABBREVIATIONS[part.group] || !count) return null;
      for (let n = 0; n < count; n++) groups.push(part.group);
    } else if (part.el === 'H' && centre && previous === centre && !hydrogens) {
      hydrogens = count;
    } else if (part.el && !centre && count === 1) {
      centre = part;
    } else {
      return null;
    }
    previous = part;
  }
  if (!centre || !groups.length) return null;
  const sign = charge > 0 ? '+' : charge < 0 ? '-' : '';
  const atom = `[${centre.el}${hydrogens ? `H${hydrogens > 1 ? hydrogens : ''}` : ''}${sign}${Math.abs(charge) > 1 ? Math.abs(charge) : ''}]`;
  const branches = groups.map((group) => ABBREVIATIONS[group][0].replace(/^\*/, ''));
  const formula = new Map([[centre.el, 1]]);
  if (hydrogens) formula.set('H', (formula.get('H') ?? 0) + hydrogens);
  for (const group of groups) {
    for (const [, symbol, n] of ABBREVIATIONS[group][1].matchAll(/([A-Z][a-z]?)(\d*)/g)) formula.set(symbol, (formula.get(symbol) ?? 0) + (n ? Number(n) : 1));
  }
  return { smiles: `*${atom}${branches.map((b) => `(${b})`).join('')}`, formula, centre: centre.el };
}

// A molecule's label from its centre atom and the groups on it: PPh3, NEt3, SiMe4; with hydrogens on it,
// or an ether or a sulfide, the groups first, as written (EtOH, AcOH, PhNH2, Bu3SnH, Et2O, Me2S).
// `groups`: their names, as many as there are. `attached`: hanging on the rest by its atom, which comes
// first then (PPh3, NHEt), and is written last when its bond comes from the right (labelLayout).
export function condensedName(el, hydrogens, groups, { attached = false } = {}) {
  const counts = new Map();
  for (const group of groups) counts.set(group, (counts.get(group) ?? 0) + 1);
  const written = [...counts].sort((p, q) => q[1] - p[1] || GROUPS.indexOf(p[0]) - GROUPS.indexOf(q[0]))
    .map(([group, n]) => `${group}${n > 1 ? n : ''}`).join('');
  const atom = `${el}${hydrogens ? `H${hydrogens > 1 ? hydrogens : ''}` : ''}`;
  return !attached && (hydrogens || ((el === 'O' || el === 'S') && groups.length === 2)) ? `${written}${atom}` : `${atom}${written}`;
}

// A label of an atom with groups written the other way round, for a bond from the right, its atom last
// so that it is next to the bond: PPh3 -> Ph3P, NHEt -> EtHN (as NHAc -> AcHN). Null if it isn't one
// that starts with its atom.
export function reversedCondensed(alias) {
  const group = condensedGroup(alias);
  const parts = labelParts(alias);
  if (!group || parts?.[0]?.el !== group.centre) return null;
  const units = [];
  for (const part of parts.slice(1)) {
    if (/^[0-9]$/.test(part.text) && units.length) units[units.length - 1] += part.text;
    else units.push(part.text);
  }
  return `${units.reverse().join('')}${parts[0].text}`;
}
