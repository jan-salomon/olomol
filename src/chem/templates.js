// The template library: ready-made structures by topic, as SMILES (laid
// out by RDKit when inserted) or drawn here: chairs (chair.js),
// projections (projections.js), coordination geometries (complexes.js). Stereo is
// included where it matters. Functional groups carry a "*" where they
// attach to a molecule.
import { bondsByAtom, otherEnd } from '../model/doc.js';
import { ringList, smallestRings } from '../model/graph.js';
import { adamantaneCage, adamantaneFlat, CHAIRS } from './chair.js';
import { COMPLEXES } from './complexes.js';
import { PROJECTIONS } from './projections.js';
import { electronsByAtom } from './valence.js';
import { LABEL_GROUPS, labelDoc } from './labels.js';

// Cores that similar templates are drawn on, so they all come out the same
// way round: an amino acid's backbone as H2N–CH(R)–COOH with the side
// chain up (a molfile to align to). Nucleobases are turned instead
// (orientNucleobase): aligning can't tell their NH from their N.
export const CORES = {
  aminoAcid: ['', '  olomol', '', '  5  4  0  0  0  0  0  0  0  0999 V2000',
    '    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0',
    '    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    2.5981    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    2.5981   -1.5000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '    3.8971    0.7500    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  1  0', '  2  3  1  0', '  3  4  2  0', '  3  5  1  0', 'M  END'].join('\n'),
};

// Turns a drawn nucleobase as in textbooks: the N that carries the sugar in
// a nucleoside (N9 of a purine, N1 of a pyrimidine: the ring NH next to a
// ring CH) at the bottom; a purine's five-ring on the right, a
// pyrimidine's C2=O to the right of N1. Changes `doc` in place.
export function orientNucleobase(doc) {
  const byAtom = bondsByAtom(doc);
  const electrons = electronsByAtom(doc, byAtom);
  const rings = ringList(smallestRings(doc, byAtom));
  const inRing = (id) => rings.some((ring) => ring.includes(id));
  const ringNeighbours = (id) => byAtom.get(id).map((b) => otherEnd(b, id)).filter(inRing);
  const nh = [...doc.atoms.values()].find((a) => a.el === 'N' && inRing(a.id) && electrons.get(a.id).hydrogens > 0
    && ringNeighbours(a.id).some((n) => doc.atoms.get(n).el === 'C' && electrons.get(n).hydrogens > 0));
  if (!nh) return;
  const atoms = [...doc.atoms.values()];
  const centre = [atoms.reduce((s, a) => s + a.x, 0) / atoms.length, atoms.reduce((s, a) => s + a.y, 0) / atoms.length];
  const turn = Math.PI / 2 - Math.atan2(nh.y - centre[1], nh.x - centre[0]); // y down: +90° is the bottom
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  for (const a of atoms) [a.x, a.y] = [centre[0] + (a.x - centre[0]) * c - (a.y - centre[1]) * s, centre[1] + (a.x - centre[0]) * s + (a.y - centre[1]) * c];
  const mean = (ids) => ids.reduce((sum, id) => sum + doc.atoms.get(id).x, 0) / ids.length;
  const five = rings.find((ring) => ring.length === 5);
  const six = rings.find((ring) => ring.length === 6);
  // which way round: what should be on the right
  const mirror = five ? mean(five) < mean(six) : (() => {
    const c2 = ringNeighbours(nh.id).find((n) => byAtom.get(n).some((b) => b.order === 2 && doc.atoms.get(otherEnd(b, n)).el === 'O'));
    return c2 !== undefined && doc.atoms.get(c2).x < nh.x;
  })();
  if (mirror) for (const a of atoms) a.x = 2 * centre[0] - a.x;
}

// Functional groups that also have an abbreviation (the same group written as one labelled atom):
// their cards offer it too, and Abbreviations leaves it out (tests/chem.test.mjs checks each pair).
export const ABBREVIATED = {
  Isopropyl: ['iPr'], 'tert-Butyl': ['tBu'], Phenyl: ['Ph'], Benzyl: ['Bn'], Acetyl: ['Ac'], Aldehyde: ['CHO'], Boc: ['Boc', 'CO2tBu'],
  Tosyl: ['Ts'], Methoxy: ['OMe'], Acetoxy: ['OAc'], Dimethylamino: ['NMe2'], 'Carboxylic acid': ['CO2H'], Ester: ['CO2Me'],
  Nitrile: ['CN'], Trifluoromethyl: ['CF3'], Nitro: ['NO2'], 'Sulfonic acid': ['SO3H'],
};

// The big categories' subgroups, in the Templates window's list on the left: [subgroup, [template names]] per
// category (every template of the category in one of them; a unit test checks).
export const SUBGROUPS = {
  Rings: [
    ['Aromatic', ['Benzene', 'Naphthalene', 'Anthracene', 'Phenanthrene']],
    ['Heteroaromatic', ['Pyridine', 'Pyrrole', 'Furan', 'Thiophene', 'Imidazole', 'Indole', 'Quinoline', 'Pyrimidine', 'Purine']],
    ['Alicyclic', ['Cyclohexane', 'Cyclopentane', 'Cyclohexene', 'Norbornane', 'Adamantane', 'Adamantane, cage', 'Steroid skeleton']],
    ['Saturated heterocycles', ['Tetrahydrofuran', 'Piperidine', 'Morpholine', 'Dioxane', 'Epoxide']],
  ],
  'Functional groups': [
    ['Carbonyl groups', ['Carboxylic acid', 'Ester', 'Amide', 'Acid chloride', 'Aldehyde', 'Acetyl', 'Acetoxy', 'Carbamate', 'Urea', 'Boc']],
    ['Nitrogen groups', ['Amino', 'Dimethylamino', 'Imine', 'Nitrile', 'Nitro', 'Azide']],
    ['O, S and P groups', ['Hydroxy', 'Methoxy', 'Enol ether', 'Thiol', 'Sulfonic acid', 'Sulfonamide', 'Tosyl', 'Phosphate']],
    ['Carbon groups', ['Phenyl', 'Benzyl', 'Vinyl', 'Ethynyl', 'Isopropyl', 'tert-Butyl', 'Trifluoromethyl', 'Grignard']],
  ],
  Abbreviations: [
    ['Generic', ['R', "R'", "R''", 'R1', 'R2', 'X', 'Y', 'Nu', 'E', 'LG', 'Ar']],
    ['Alkyl and aryl', ['Me', 'Et', 'nPr', 'iPr', 'nBu', 'iBu', 'sBu', 'tBu', 'Cy', 'Ph', 'Bn', 'PMB', 'Mes', 'Tr']],
    ['Acyl, silyl, sulfonyl', ['Ac', 'Bz', 'Piv', 'CHO', 'Boc', 'Cbz', 'Fmoc', 'TMS', 'TES', 'TBS', 'TIPS', 'THP', 'Ts', 'Ms', 'Tf']],
    ['O and N groups', ['OMe', 'OEt', 'OtBu', 'OPh', 'OBn', 'OAc', 'OBz', 'OPiv', 'OTs', 'OMs', 'OTf', 'OTMS', 'OTBS', 'NHAc', 'NHBoc', 'NMe2']],
    ['Other groups', ['CO2H', 'CO2Me', 'CO2Et', 'CO2tBu', 'CH2OH', 'CN', 'CF3', 'NO2', 'SO3H']],
  ],
  // (by how they are drawn: a Newman projection is a conformation too)
  'Conformations and projections': [
    ['Chairs and boats', ['Chair', 'Chair, flipped', 'Boat', 'Chair with H', 'Methyl, equatorial', 'Methyl, axial', 'β-D-Glucose, chair', 'α-D-Glucose, chair']],
    ['Newman projections', ['Ethane, staggered (Newman)', 'Ethane, eclipsed (Newman)', 'Butane, anti (Newman)', 'Butane, gauche (Newman)', 'Butane, eclipsed (Newman)', 'Cyclohexane (Newman)']],
    ['Haworth projections', ['β-D-Glucose, Haworth', 'α-D-Glucose, Haworth', 'β-D-Galactose, Haworth', 'β-D-Ribose, Haworth', 'β-D-2-Deoxyribose, Haworth']],
    ['Fischer projections', ['D-Glyceraldehyde, Fischer', 'L-Glyceraldehyde, Fischer', 'D-Glucose, Fischer', 'D-Fructose, Fischer', 'L-Alanine, Fischer', 'L-Serine, Fischer']],
  ],
  'Reagents and solvents': [
    ['Solvents', ['Water', 'Methanol', 'Ethanol', 'Acetone', 'DMSO', 'DMF', 'Acetonitrile', 'Diethyl ether', 'Dichloromethane', 'Chloroform', 'Toluene', 'Pyridine']],
    ['Acids, bases and ions', ['Hydronium', 'Hydroxide', 'Ammonia', 'Triethylamine', 'LDA', 'Sulfuric acid', 'Nitric acid', 'Hydrogen bromide']],
    ['Reagents', ['NaBH4', 'LiAlH4', 'NBS', 'mCPBA', 'TsCl', 'Boc2O', 'DCC', 'Bromine', 'Aluminium chloride', 'Thionyl chloride']],
  ],
};

export const TEMPLATES = [
  ['Rings', [
    ['Benzene', 'c1ccccc1'], ['Cyclohexane', 'C1CCCCC1'], ['Cyclopentane', 'C1CCCC1'], ['Naphthalene', 'c1ccc2ccccc2c1'],
    ['Anthracene', 'c1ccc2cc3ccccc3cc2c1'], ['Phenanthrene', 'c1ccc2c(c1)ccc1ccccc12'], ['Pyridine', 'c1ccncc1'],
    ['Pyrrole', 'c1cc[nH]c1'], ['Furan', 'c1ccoc1'], ['Thiophene', 'c1ccsc1'], ['Imidazole', 'c1cnc[nH]1'],
    ['Indole', 'c1ccc2[nH]ccc2c1'], ['Quinoline', 'c1ccc2ncccc2c1'], ['Pyrimidine', 'c1cncnc1'], ['Purine', 'c1ncc2[nH]cnc2n1'],
    ['Cyclohexene', 'C1=CCCCC1'], ['Norbornane', 'C1CC2CCC1C2'], ['Adamantane', () => adamantaneFlat()], ['Adamantane, cage', () => adamantaneCage()],
    ['Steroid skeleton', 'C1CCC2C(C1)CCC1C2CCC2CCCC12'], ['Tetrahydrofuran', 'C1CCOC1'], ['Piperidine', 'C1CCNCC1'],
    ['Morpholine', 'C1COCCN1'], ['Dioxane', 'C1COCCO1'], ['Epoxide', 'C1CO1'],
  ]],
  // "*" is where a group attaches: picked, they become a stamp for atoms
  ['Functional groups', [
    ['Carboxylic acid', '*C(=O)O'], ['Ester', '*C(=O)OC'], ['Amide', '*C(=O)N'], ['Acid chloride', '*C(=O)Cl'],
    ['Aldehyde', '*C=O'], ['Acetyl', '*C(C)=O'], ['Nitrile', '*C#N'], ['Nitro', '*[N+](=O)[O-]'], ['Hydroxy', '*O'],
    ['Methoxy', '*OC'], ['Amino', '*N'], ['Dimethylamino', '*N(C)C'], ['Thiol', '*S'], ['Sulfonic acid', '*S(=O)(=O)O'],
    ['Sulfonamide', '*S(N)(=O)=O'], ['Phenyl', '*c1ccccc1'], ['Benzyl', '*Cc1ccccc1'], ['Vinyl', '*C=C'], ['Ethynyl', '*C#C'],
    ['Isopropyl', '*C(C)C'], ['tert-Butyl', '*C(C)(C)C'], ['Trifluoromethyl', '*C(F)(F)F'], ['Acetoxy', '*OC(C)=O'],
    ['Boc', '*C(=O)OC(C)(C)C'], ['Tosyl', '*S(=O)(=O)c1ccc(C)cc1'], ['Phosphate', '*OP(=O)(O)O'], ['Azide', '*N=[N+]=[N-]'],
    ['Imine', '*C=NC'], ['Enol ether', '*C=COC'], ['Carbamate', '*NC(=O)OC'], ['Urea', '*NC(N)=O'], ['Grignard', '*[Mg]Br'],
  ]],
  // group labels: placeholders and abbreviations (they count in formulas), each a functional group
  // that attaches as one labelled atom ([label, its drawing, 'label'])
  ['Abbreviations', LABEL_GROUPS.flatMap(([, labels]) => labels).map((label) => [label, () => labelDoc(label), 'label'])],
  ['Compounds', [
    ['Anhydride', 'CC(=O)OC(C)=O'], ['Acetal', 'CC(OC)OC'], ['Enamine', 'C=CN(C)C'], ['Carbonate', 'COC(=O)OC'],
    ['Diazonium', 'c1ccc(cc1)[N+]#N'], ['Epoxide', 'CC1CO1'], ['Thioether', 'CSC'], ['Disulfide', 'CSSC'],
  ]],
  ['Conformations and projections', [...CHAIRS, ...PROJECTIONS]],
  ['Complexes', COMPLEXES],
  ['Amino acids', [
    ['Glycine', 'NCC(=O)O', 'aminoAcid'], ['Alanine', 'N[C@@H](C)C(=O)O', 'aminoAcid'], ['Valine', 'N[C@@H](C(C)C)C(=O)O', 'aminoAcid'], ['Leucine', 'N[C@@H](CC(C)C)C(=O)O', 'aminoAcid'],
    ['Isoleucine', 'N[C@@H]([C@@H](C)CC)C(=O)O', 'aminoAcid'], ['Proline', 'OC(=O)[C@@H]1CCCN1', 'aminoAcid'], ['Phenylalanine', 'N[C@@H](Cc1ccccc1)C(=O)O', 'aminoAcid'],
    ['Tyrosine', 'N[C@@H](Cc1ccc(O)cc1)C(=O)O', 'aminoAcid'], ['Tryptophan', 'N[C@@H](Cc1c[nH]c2ccccc12)C(=O)O', 'aminoAcid'], ['Serine', 'N[C@@H](CO)C(=O)O', 'aminoAcid'],
    ['Threonine', 'N[C@@H]([C@H](O)C)C(=O)O', 'aminoAcid'], ['Cysteine', 'N[C@@H](CS)C(=O)O', 'aminoAcid'], ['Methionine', 'N[C@@H](CCSC)C(=O)O', 'aminoAcid'],
    ['Asparagine', 'N[C@@H](CC(N)=O)C(=O)O', 'aminoAcid'], ['Glutamine', 'N[C@@H](CCC(N)=O)C(=O)O', 'aminoAcid'], ['Aspartic acid', 'N[C@@H](CC(=O)O)C(=O)O', 'aminoAcid'],
    ['Glutamic acid', 'N[C@@H](CCC(=O)O)C(=O)O', 'aminoAcid'], ['Lysine', 'NCCCC[C@H](N)C(=O)O', 'aminoAcid'], ['Arginine', 'N[C@@H](CCCNC(N)=N)C(=O)O', 'aminoAcid'],
    ['Histidine', 'N[C@@H](Cc1c[nH]cn1)C(=O)O', 'aminoAcid'],
  ]],
  ['Sugars and nucleobases', [
    ['β-D-Glucose', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O'], ['α-D-Glucose', 'OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O'],
    ['D-Glucose (open)', 'OC[C@@H](O)[C@@H](O)[C@H](O)[C@@H](O)C=O'], ['β-D-Fructose', 'OC[C@@]1(O)OC[C@@H](O)[C@@H](O)[C@@H]1O'],
    ['β-D-Ribose', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H]1O'], ['2-Deoxyribose', 'OC[C@H]1O[C@@H](O)C[C@@H]1O'],
    ['Adenine', 'Nc1ncnc2[nH]cnc12', 'purine'], ['Guanine', 'Nc1nc2[nH]cnc2c(=O)[nH]1', 'purine'], ['Cytosine', 'Nc1cc[nH]c(=O)n1', 'pyrimidine'],
    ['Thymine', 'Cc1c[nH]c(=O)[nH]c1=O', 'pyrimidine'], ['Uracil', 'O=c1cc[nH]c(=O)[nH]1', 'pyrimidine'],
  ]],
  ['Reagents and solvents', [
    ['Water', 'O'], ['Hydronium', '[OH3+]'], ['Hydroxide', '[OH-]'], ['Ammonia', 'N'], ['Methanol', 'CO'], ['Ethanol', 'CCO'],
    ['Acetone', 'CC(C)=O'], ['DMSO', 'CS(C)=O'], ['DMF', 'CN(C)C=O'], ['Acetonitrile', 'CC#N'], ['Diethyl ether', 'CCOCC'],
    ['Dichloromethane', 'ClCCl'], ['Chloroform', 'ClC(Cl)Cl'], ['Toluene', 'Cc1ccccc1'], ['Pyridine', 'c1ccncc1'],
    ['Triethylamine', 'CCN(CC)CC'], ['LDA', 'CC(C)[N-]C(C)C.[Li+]'], ['NaBH4', '[Na+].[BH4-]'], ['LiAlH4', '[Li+].[AlH4-]'],
    ['NBS', 'BrN1C(=O)CCC1=O'], ['mCPBA', 'OOC(=O)c1cccc(Cl)c1'], ['TsCl', 'Cc1ccc(cc1)S(Cl)(=O)=O'], ['Boc2O', 'CC(C)(C)OC(=O)OC(=O)OC(C)(C)C'],
    ['DCC', 'C1CCC(CC1)N=C=NC1CCCCC1'], ['Sulfuric acid', 'OS(=O)(=O)O'], ['Nitric acid', 'O[N+](=O)[O-]'], ['Bromine', 'BrBr'],
    ['Hydrogen bromide', 'Br'], ['Aluminium chloride', 'Cl[Al](Cl)Cl'], ['Thionyl chloride', 'ClS(Cl)=O'],
  ]],
];
