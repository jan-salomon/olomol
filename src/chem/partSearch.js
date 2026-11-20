// "?xx" in the template search: the templates with that part in them (RDKit's substructure search).
import { ABBREVIATIONS } from './abbreviations.js';
import { SYMBOLS } from './elements.js';
import { AMINO_ACID_CODES, SEARCH_PARTS } from './searchParts.js';

const BY_KEY = new Map(SEARCH_PARTS.flatMap((part) => part.keys.map((key) => [key, part])));
const BY_CODE = new Map(Object.entries(AMINO_ACID_CODES).map(([name, [code]]) => [code.toLowerCase(), name]));

// What the text after "?" looks for, in this order: a part of the table (?oh, ?Ts, ?ester), an amino acid by
// its three-letter code (?ala: { name }), an element (?S, ?cl), an abbreviation in any case (?boc), else
// the text as SMILES or SMARTS (?C(=O)N). Returns { smarts } or { name }.
export function partPattern(text) {
  const lower = text.trim().toLowerCase();
  if (BY_KEY.has(lower)) return { smarts: BY_KEY.get(lower).smarts };
  if (BY_CODE.has(lower)) return { name: BY_CODE.get(lower) };
  const element = SYMBOLS.findIndex((symbol) => symbol.toLowerCase() === lower);
  if (element >= 0) return { smarts: `[#${element + 1}]` };
  const abbreviation = ABBREVIATIONS[text.trim()] ? text.trim() : Object.keys(ABBREVIATIONS).find((key) => key.toLowerCase() === lower);
  if (abbreviation) return { smarts: ABBREVIATIONS[abbreviation][0].replace('*', '') };
  return { smarts: text.trim() };
}

// The entries ([name, source, kind]) with the part in them. A template is searched as its SMILES (those drawn
// by hand, chairs and projections, aren't searched), an abbreviation as the group it stands for, "*" being
// the rest of the molecule. `mols` keeps each SMILES's molecule for the next search.
export function withPart(RDKit, text, entries, mols = new Map()) {
  if (!text.trim()) return [];
  const pattern = partPattern(text);
  if (pattern.name) return entries.filter(([name, , kind]) => kind !== 'label' && name === pattern.name);
  const query = RDKit.get_qmol(pattern.smarts);
  if (!query) return [];
  try {
    return entries.filter(([name, source, kind]) => {
      const smiles = kind === 'label' ? ABBREVIATIONS[name]?.[0] : typeof source === 'string' ? source : null;
      if (!smiles) return false;
      if (!mols.has(smiles)) mols.set(smiles, RDKit.get_mol(smiles));
      const mol = mols.get(smiles);
      return Boolean(mol) && mol.get_substruct_match(query) !== '{}';
    });
  } finally {
    query.delete();
  }
}
