// B1: why olomol and RDKit disagree, sorted into three kinds:
// - 'olomol wrong': olomol's count is chemically wrong;
// - 'RDKit models it differently': RDKit's valence model gives a count a
//   chemist wouldn't (or can't express the species), olomol's is right;
// - 'convention': both are defensible, they follow different conventions.
// Filled in by looking at every disagreement of a run; anything not
// matched here is 'unclassified' and must be looked at.
export function classify(c, disagreements) {
  for (const rule of RULES) {
    if (rule.when(c, disagreements)) return { category: rule.category, explanation: rule.explanation };
  }
  return { category: 'unclassified', explanation: 'Not yet looked at.' };
}

const RULES = [
  {
    // [Cl]: RDKit writes a lone chlorine atom's radical only as the molfile's valence field (0), with no RAD
    // line; in the 'rules' mode that field is dropped, so nothing says it is a radical
    when: (c) => c.name === 'chlorine-atom',
    category: 'RDKit models it differently',
    explanation: "RDKit's molfile gives the chlorine atom no RAD line, only valence 0 in the atom line. With that count dropped (the 'rules' mode) the file holds a plain Cl, and olomol's rules give HCl. Read as a pasted SMILES (the molfile as it is), olomol gives 0 H and 3 lone pairs, as RDKit does. Drawn in olomol, the radical tool sets the unpaired electron and the counts are right (methyl and hydroxyl radicals agree).",
  },
  {
    // olomol gives aluminium no implicit hydrogens (src/chem/elements.js VALENCES has no Al)
    when: (c, d) => d.every((x) => x.el === 'Al'),
    category: 'olomol wrong',
    explanation: "olomol gives Al no implicit hydrogens (it is not in the VALENCES table of src/chem/elements.js: 'other elements only have the hydrogens drawn or set'). RDKit gives Al valence 3. So a hand-drawn Al with too few bonds shows no H, and AlH4⁻ drawn as Al⁻ even shows two lone pairs. Read as a pasted SMILES, the molfile's hydrogen count is kept and olomol agrees with RDKit.",
  },
];
