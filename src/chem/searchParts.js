// What ?xx in the template search looks for: each entry's keys (lower case, matched case-insensitively
// against the text after "?") and an RDKit SMARTS; a template is listed if the SMARTS matches anywhere in it.
// This table comes before the elements and literal SMILES. A template is searched as its SMILES, a label
// as its group's, so "*" (read as a dummy atom, #0) stands for the rest of the molecule: [#6,#0] is "a
// carbon or the attachment point" where a pattern needs a carbon on that side.
//
// Keys that are element symbols, and what they are here (no searched template has these elements: the
// cobalt complexes are drawings):
//   ac acetyl, not actinium        cn nitrile, not copernicium    ho hydroxy, not holmium
//   ar aromatic, not argon         co carbonyl, not cobalt        hs thiol, not hassium
//   nh N–H, not nihonium           no N=O, not nobelium           po P=O, not polonium
//   pr propyl, not praseodymium    ts tosyl, not tennessine
// Other element symbols keep working as "contains that element" (f, cl, br, i, s, p, si…). h is here
// because hydrogens are implicit, so [#1] finds nothing. ph, bn and ms aren't element symbols.
// Keys that are also SMILES win over the SMILES: ?CO is a carbonyl, not C–O (write that ?C-O), ?NC a
// nitrile. C=O, C=C, C#C, C#N, C=N, S=O, N=O and P=O are keys so that they work in any case: in lower
// case, as literal SMARTS, c=o would be an aromatic carbon.
//
// Decisions:
// - Ph (and so Bn and Bz) is a benzene ring with or without substituents, not fused: not naphthalene,
//   indole, quinoline or fluorene (Fmoc). ?benzo also finds the fused ones. Pyridine, pyrrole, furan,
//   thiophene and imidazole also mean the ring on its own; the fused ones have keys of their own (?indole).
// - Et, nPr, iPr and the like are the group as named: n-propyl is not an ethyl, isobutyl (leucine) not an
//   isopropyl. Me is any methyl, so also the ends of those.
// - ?acid (and carboxylic acid, carboxyl) includes the carboxylate, ?cooh and ?co2h don't: those are
//   written protonated; ?carboxylate is the anion only. ?acid means carboxylic acids: not sulfuric or nitric.
// - ?oh is O–H on something: not water or hydroxide (found by name).
// - An attachment point counts as a carbon where the group would make the thing on one: Acetyl is a ketone,
//   Boc an ester (it is CO2tBu too), Hydroxy an alcohol.
// - Amides and lactams include the aromatic ones in nucleobases (uracil, thymine, guanine); cytosine's C=O
//   is between two N, as in a urea, and isn't one. Imides (NBS) are neither, they have ?imide.
// - Amines: not amides, ureas, guanidines, sulfonamides or ammonia; NH2 on an aromatic ring is one.
//   ?nh2 is any NH2, also an amide's.
// - Amino acids: ?ala finds alanine by its three-letter code (AMINO_ACID_CODES, below; none is a key here).
//   One-letter codes aren't searched with ?, since ?c is carbon and ?s sulfur: they are on the cards and
//   found by the normal search.

const PHENYL = '[cR1]1[cR1][cR1][cR1][cR1][cR1]1'; // a benzene ring not fused to anything
const R = '[#6,#0]'; // a carbon or the attachment point
const R_NOT_ACYL = '[#6,#0;!$(C=O)]'; // the same, not a C=O
const R_ETHER = '[#6,#0;!$(C=O);!$([CX4]([OX2])[OX2])]'; // the same, not an acetal's or a sugar's C(O)(O) either
const AMINE = '+0;!$(N[#6,#15,#16]=[O,S,N]);!$(N[#7,#8])'; // an N that is neither acylated nor N–N or N–O
const ACID_OH = '[OX2H,OX1-]'; // what ends an acid, protonated or not
const AMIDE_N = '[#7X3;+0;!$(N(C=O)C=O)]'; // aromatic too; not an imide's
const AMIDE_C = '[#6X3;!$([#6](=O)([#7])[#7,#8,#16])]'; // aromatic too; not a urea's or a carbamate's
const NPR = '[CH3][CH2][CH2;!$([CH2]([CH2])[CH2])]'; // not the end of n-butyl
const IPR = '[CH3][CX4H]([CH3])[!$([CH2])]'; // not the end of isobutyl
const NBU = '[CH3][CH2][CH2][CH2;!$([CH2]([CH2])[CH2])]';
const IBU = '[CH3][CX4H]([CH3])[CH2]';
const SBU = '[CH3][CH2][CX4H][CH3]';
const TBU = '[CX4]([CH3])([CH3])[CH3]';
const SI_TBS = '[SiX4]([CH3])([CH3])[CX4]([CH3])([CH3])[CH3]';
const SI_TMS = '[SiX4]([CH3])([CH3])[CH3]';
const TOSYL = 'S(=O)(=O)c1ccc([CH3])cc1';
const TRIFLYL = 'S(=O)(=O)C(F)(F)F';
const PYRANOSE = '[OX2;r6]1[CX4]([OX2])[CX4]([OX2])[CX4]([OX2])[CX4]([OX2])[CX4]1';
const FURANOSE = '[OX2;r5]1[CX4]([OX2])[CX4][CX4]([OX2])[CX4]1';
const OPEN_SUGAR = '[CX3](=O)[CX4]([OX2H])[CX4]([OX2H])[CX4]([OX2H])';
const any = (...patterns) => `[${patterns.map((p) => `$(${p})`).join(',')}]`;

export const SEARCH_PARTS = [
  // alkyl and aryl groups
  { keys: ['me', 'ch3', 'methyl'], smarts: '[CH3]', note: 'any methyl, also in OMe, NMe2, CO2Me, toluene, the ends of Et, iPr, tBu' },
  { keys: ['et', 'ethyl'], smarts: '[CH3][CH2;!$([CH2][CH2])]', note: 'ethyl; not the end of n-propyl or n-butyl' },
  { keys: ['npr', 'n-pr', 'n-propyl'], smarts: NPR, note: 'n-propyl; not the end of n-butyl' },
  { keys: ['ipr', 'i-pr', 'isopropyl'], smarts: IPR, note: 'isopropyl; not isobutyl (leucine)' },
  { keys: ['pr', 'propyl'], smarts: any(NPR, IPR), note: "n-propyl or isopropyl (Pr isn't in any template)" },
  { keys: ['nbu', 'n-bu', 'n-butyl'], smarts: NBU, note: 'n-butyl' },
  { keys: ['ibu', 'i-bu', 'isobutyl'], smarts: IBU, note: "isobutyl, leucine's side chain" },
  { keys: ['sbu', 's-bu', 'sec-butyl'], smarts: SBU, note: "sec-butyl, isoleucine's side chain" },
  { keys: ['tbu', 't-bu', 'tert-butyl', 'terc-butyl'], smarts: TBU, note: 'tert-butyl, also in Boc, Piv, TBS' },
  { keys: ['bu', 'butyl'], smarts: any(NBU, IBU, SBU, TBU), note: 'any butyl' },
  { keys: ['ch2', 'methylene'], smarts: '[CX4H2]', note: 'a CH2' },
  { keys: ['cy', 'cyclohexyl'], smarts: '[CX4H]1[CH2][CH2][CH2][CH2][CH2]1', note: 'cyclohexyl (on something)' },
  { keys: ['ph', 'phenyl', 'fenyl', 'benzene', 'benzen'], smarts: PHENYL, note: 'a benzene ring, substituted or not; not fused (naphthalene, indole, Fmoc): ?benzo' },
  { keys: ['benzo', 'benzene ring'], smarts: 'c1ccccc1', note: 'any benzene ring, also fused' },
  { keys: ['bn', 'benzyl'], smarts: `[CH2]${PHENYL}`, note: 'benzyl, also on a substituted ring (PMB, tyrosine)' },
  { keys: ['bz', 'benzoyl'], smarts: `[CX3](=O)${PHENYL}`, note: 'benzoyl, also on a substituted ring (mCPBA)' },
  { keys: ['pmb', 'p-methoxybenzyl'], smarts: '[CH2]c1ccc([OX2H0][CH3])cc1', note: 'p-methoxybenzyl' },
  { keys: ['mes', 'mesityl'], smarts: 'c1c([CH3])cc([CH3])cc1[CH3]', note: '2,4,6-trimethylphenyl' },
  { keys: ['tr', 'trityl'], smarts: `[CX4](${PHENYL})(${PHENYL})${PHENYL}`, note: 'triphenylmethyl' },

  // acyl groups and protecting groups
  { keys: ['ac', 'acetyl'], smarts: '[CH3][CX3]=O', note: 'acetyl, also in OAc, NHAc, acetone' },
  { keys: ['piv', 'pivaloyl'], smarts: `[CX3](=O)${TBU}`, note: 'pivaloyl' },
  { keys: ['boc'], smarts: `[CX3](=O)[OX2H0]${TBU}`, note: 'tert-butoxycarbonyl, also in NHBoc and Boc2O (the same group as CO2tBu)' },
  { keys: ['cbz', 'benzyloxycarbonyl'], smarts: `[CX3](=O)[OX2H0][CH2]${PHENYL}`, note: 'benzyloxycarbonyl' },
  { keys: ['fmoc'], smarts: '[CX3](=O)[OX2H0][CH2][CX4H]1c2ccccc2-c2ccccc21', note: '9-fluorenylmethoxycarbonyl' },
  { keys: ['thp', 'tetrahydropyranyl'], smarts: '[CX4H]1[OX2][CH2][CH2][CH2][CH2]1', note: 'tetrahydropyran-2-yl' },
  { keys: ['tms', 'trimethylsilyl'], smarts: SI_TMS, note: 'trimethylsilyl, also in OTMS' },
  { keys: ['tes', 'triethylsilyl'], smarts: '[SiX4]([CH2][CH3])([CH2][CH3])[CH2][CH3]', note: 'triethylsilyl' },
  { keys: ['tbs', 'tbdms', 'tert-butyldimethylsilyl'], smarts: SI_TBS, note: 'tert-butyldimethylsilyl, also in OTBS' },
  { keys: ['tips', 'triisopropylsilyl'], smarts: '[SiX4]([CX4H]([CH3])[CH3])([CX4H]([CH3])[CH3])[CX4H]([CH3])[CH3]', note: 'triisopropylsilyl' },

  // sulfonyl groups
  { keys: ['ts', 'tosyl'], smarts: TOSYL, note: 'p-toluenesulfonyl, also in OTs and TsCl' },
  { keys: ['ms', 'mesyl'], smarts: 'S(=O)(=O)[CH3]', note: 'methanesulfonyl, also in OMs; not DMSO' },
  { keys: ['tf', 'triflyl'], smarts: TRIFLYL, note: 'trifluoromethanesulfonyl, also in OTf' },
  { keys: ['so2', 'sulfonyl'], smarts: '[SX4](=O)=O', note: 'any sulfonyl' },
  { keys: ['so', 's=o'], smarts: '[#16]=O', note: 'any S=O, also sulfonyls and thionyl chloride' },
  { keys: ['sulfoxide', 'sulfoxid', 'sulfinyl'], smarts: `[SX3](=O)(${R})${R}`, note: 'C–S(=O)–C; not thionyl chloride' },

  // on oxygen
  { keys: ['oh', 'ho', 'hydroxy', 'hydroxyl'], smarts: '[OX2H]', note: 'O–H: alcohols, phenols, acids; not ethers or esters, not water or OH⁻' },
  { keys: ['ome', 'meo', 'methoxy'], smarts: '[OX2H0][CH3]', note: 'methoxy, also in CO2Me, PMB, carbonates' },
  { keys: ['oet', 'eto', 'ethoxy'], smarts: '[OX2H0][CH2][CH3]', note: 'ethoxy, also in CO2Et, diethyl ether' },
  { keys: ['otbu', 'tbuo', 'tert-butoxy'], smarts: `[OX2H0]${TBU}`, note: 'tert-butoxy, also in Boc' },
  { keys: ['oph', 'pho', 'phenoxy'], smarts: `[OX2H0]${PHENYL}`, note: 'phenoxy, also on a substituted ring (PMB)' },
  { keys: ['obn', 'bno', 'benzyloxy'], smarts: `[OX2H0][CH2]${PHENYL}`, note: 'benzyloxy, also in Cbz' },
  { keys: ['oac', 'aco', 'acetoxy'], smarts: '[OX2H0][CX3](=O)[CH3]', note: 'acetoxy, also in acetic anhydride' },
  { keys: ['obz', 'bzo', 'benzoyloxy'], smarts: `[OX2H0][CX3](=O)${PHENYL}`, note: 'benzoyloxy' },
  { keys: ['opiv', 'pivo', 'pivaloyloxy'], smarts: `[OX2H0][CX3](=O)${TBU}`, note: 'pivaloyloxy' },
  { keys: ['ots', 'tso', 'tosylate', 'tosyloxy'], smarts: `[OX2H0]${TOSYL}`, note: 'tosylate' },
  { keys: ['oms', 'mso', 'mesylate', 'mesyloxy'], smarts: '[OX2H0]S(=O)(=O)[CH3]', note: 'mesylate' },
  { keys: ['otf', 'tfo', 'triflate', 'triflyloxy'], smarts: `[OX2H0]${TRIFLYL}`, note: 'triflate' },
  { keys: ['otms', 'tmso'], smarts: `[OX2H0]${SI_TMS}`, note: 'trimethylsilyl ether' },
  { keys: ['otbs', 'tbso'], smarts: `[OX2H0]${SI_TBS}`, note: 'tert-butyldimethylsilyl ether' },
  { keys: ['silyl ether'], smarts: '[OX2H0][Si]', note: 'O–Si' },
  { keys: ['alcohol', 'alkohol'], smarts: '[OX2H][CX4,#0]', note: 'O–H on an sp3 carbon or a hydroxy group; not phenols or acids' },
  { keys: ['primary alcohol'], smarts: '[OX2H][CX4;H2,H3]', note: 'CH2OH, methanol too' },
  { keys: ['secondary alcohol'], smarts: '[OX2H][CX4H]', note: 'CH–OH' },
  { keys: ['tertiary alcohol'], smarts: '[OX2H][CX4H0]', note: 'C–OH with no H on the C' },
  { keys: ['ch2oh', 'hoh2c', 'hydroxymethyl'], smarts: '[CH2][OX2H]', note: 'CH2OH, also in ethanol, serine, sugars' },
  { keys: ['phenol', 'fenol'], smarts: '[OX2H]c', note: 'O–H on an aromatic ring' },
  { keys: ['ether'], smarts: `${R_ETHER}[OX2H0]${R_ETHER}`, note: "C–O–C; not esters, anhydrides, acetals or a sugar's ring O" },
  { keys: ['enol ether', 'enolether'], smarts: 'C=C[OX2H0]', note: 'C=C–O–C' },
  { keys: ['peroxide', 'peroxid'], smarts: '[OX2][OX2]', note: 'O–O' },
  { keys: ['peracid', 'peroxy acid', 'perkyselina'], smarts: '[CX3](=O)[OX2][OX2H]', note: 'C(=O)OOH' },
  { keys: ['acetal', 'ketal'], smarts: '[CX4;!$(C(O)(O)O)]([OX2H0][#6])[OX2H0][#6]', note: 'C(OR)2' },
  { keys: ['hemiacetal', 'poloacetal'], smarts: '[CX4]([OX2H])[OX2H0][#6]', note: 'C(OH)(OR): cyclic sugars' },

  // carbonyls
  { keys: ['co', 'c=o', 'carbonyl', 'karbonyl'], smarts: '[#6]=[OX1]', note: 'any C=O, also in nucleobases (aromatic in RDKit)' },
  { keys: ['ketone', 'keton'], smarts: `${R}[CX3](=O)${R}`, note: 'C–C(=O)–C; Acetyl, Bz and Piv as groups too, as on a carbon' },
  { keys: ['aldehyde', 'aldehyd'], smarts: `[CX3H1](=O)${R}`, note: 'C–CH=O; not DMF' },
  { keys: ['cho', 'ohc', 'formyl'], smarts: '[CX3H1]=O', note: 'HC=O, aldehydes and formamides (DMF)' },
  { keys: ['acid', 'carboxylic acid', 'carboxyl', 'kyselina', 'karboxyl'], smarts: `[CX3](=O)${ACID_OH}`, note: 'carboxylic acid, carboxylate included; not sulfuric, nitric or peracids' },
  { keys: ['cooh', 'co2h', 'hooc', 'ho2c', 'carboxy'], smarts: '[CX3](=O)[OX2H]', note: 'COOH as written, not the carboxylate' },
  { keys: ['carboxylate', 'karboxylat', 'karboxylát', 'coo-', 'co2-'], smarts: '[CX3](=O)[OX1-]', note: 'the anion only; no template has one yet' },
  { keys: ['ester'], smarts: `${R_NOT_ACYL}[CX3](=O)[OX2H0]${R_NOT_ACYL}`, note: 'C–C(=O)–O–C; not carbonates, carbamates, anhydrides. Boc is an ester as a group (CO2tBu)' },
  { keys: ['co2me', 'coome', 'meo2c', 'meooc', 'methyl ester', 'methoxycarbonyl'], smarts: `[CX3;$(C${R})](=O)[OX2H0][CH3]`, note: 'C–CO2Me; not carbonates or carbamates' },
  { keys: ['co2et', 'cooet', 'eto2c', 'etooc', 'ethyl ester', 'ethoxycarbonyl'], smarts: `[CX3;$(C${R})](=O)[OX2H0][CH2][CH3]`, note: 'C–CO2Et' },
  { keys: ['co2tbu', 'cootbu', 'tbuo2c', 'tbuooc', 'tert-butyl ester'], smarts: `[CX3;$(C${R})](=O)[OX2H0]${TBU}`, note: 'C–CO2tBu; Boc as a group is the same' },
  { keys: ['lactone', 'lakton'], smarts: '[#6;!$(C=O)]@[CX3](=O)@[OX2H0]@[#6;!$(C=O)]', note: 'a ring ester; no template has one yet' },
  { keys: ['amide', 'amid'], smarts: `${AMIDE_N}${AMIDE_C}=O`, note: 'N–C=O, also formamides and in nucleobases; not ureas, carbamates, sulfonamides or imides' },
  { keys: ['lactam', 'laktam'], smarts: `[#6]@${AMIDE_C}(=O)@${AMIDE_N}`, note: 'a ring amide, also in uracil, thymine, guanine; not NBS' },
  { keys: ['imide', 'imid'], smarts: '[CX3](=O)[NX3][CX3](=O)', note: 'C(=O)NC(=O) outside aromatic rings' },
  { keys: ['acid chloride', 'acyl chloride', 'cocl'], smarts: '[CX3](=O)Cl', note: 'C(=O)Cl' },
  { keys: ['acid halide', 'acyl halide'], smarts: '[CX3](=O)[F,Cl,Br,I]', note: 'C(=O)X' },
  { keys: ['anhydride', 'anhydrid'], smarts: '[CX3](=O)[OX2][CX3](=O)', note: 'C(=O)OC(=O), also Boc2O' },
  { keys: ['carbonate', 'karbonat', 'uhličitan'], smarts: '[OX2H0][CX3](=O)[OX2H0]', note: 'O–C(=O)–O, also Boc2O' },
  { keys: ['carbamate', 'karbamat', 'urethane', 'uretan'], smarts: '[NX3][CX3](=O)[OX2H0]', note: 'N–C(=O)–O, also NHBoc; Boc on its own has no N' },
  { keys: ['urea', 'močovina'], smarts: '[NX3][CX3](=O)[NX3]', note: 'N–C(=O)–N' },

  // on nitrogen
  { keys: ['nh2', 'h2n'], smarts: '[NX3H2]', note: 'any NH2: amines, amides, sulfonamides, urea; not ammonia' },
  { keys: ['nh'], smarts: '[#7;!H0]', note: 'any N–H, also in rings' },
  { keys: ['nhac', 'achn', 'acetamido', 'acetamide'], smarts: '[NX3H1][CX3](=O)[CH3]', note: 'acetamido' },
  { keys: ['nhboc', 'bochn'], smarts: `[NX3H1][CX3](=O)[OX2H0]${TBU}`, note: 'Boc on N–H' },
  { keys: ['nme2', 'me2n', 'dimethylamino'], smarts: '[NX3]([CH3])[CH3]', note: 'N(CH3)2, also in DMF' },
  { keys: ['net2', 'et2n', 'diethylamino'], smarts: '[NX3]([CH2][CH3])[CH2][CH3]', note: 'N(C2H5)2' },
  { keys: ['amine', 'amin'], smarts: `[NX3;!H3;${AMINE}]`, note: 'primary, secondary or tertiary; not amides, ureas, guanidines, sulfonamides, ammonia' },
  { keys: ['amino', 'primary amine', 'primární amin'], smarts: `[NX3H2;${AMINE}]`, note: "primary amine, also on an aromatic ring; not an amide's NH2" },
  { keys: ['secondary amine', 'sekundární amin'], smarts: `[NX3H1;${AMINE}]`, note: 'secondary amine' },
  { keys: ['tertiary amine', 'terciární amin'], smarts: `[NX3H0;${AMINE}]`, note: 'tertiary amine' },
  { keys: ['enamine', 'enamin'], smarts: 'C=C[NX3]', note: 'C=C–N' },
  { keys: ['amino acid', 'aminokyselina'], smarts: `[NX3,NX4+;!$(NC=O)][CX4][CX3](=O)${ACID_OH}`, note: 'an α-amino acid, the zwitterion too' },
  { keys: ['cn', 'nc', 'c#n', 'nitrile', 'nitril', 'cyano', 'kyano'], smarts: '[CX2]#[NX1]', note: 'C≡N' },
  { keys: ['no2', 'o2n', 'nitro'], smarts: any('[NX3](=O)=O', '[NX3+](=O)[O-]'), note: 'nitro, written charged or not; nitric acid too' },
  { keys: ['no', 'n=o'], smarts: '[#7]=[OX1]', note: 'N=O: nitroso, or in nitro; not amides or morpholine' },
  { keys: ['nitrate', 'dusičnan', 'no3'], smarts: '[OX2][NX3+](=O)[O-]', note: 'O–NO2, nitric acid too' },
  { keys: ['azide', 'azid', 'n3'], smarts: any('[NX2]=[NX2+]=[NX1-]', '[NX2-][NX2+]#[NX1]'), note: 'N3' },
  { keys: ['imine', 'imin', 'c=n'], smarts: '[CX3;!$(C(=N)[#7])]=[NX2;+0]', note: 'C=N; not guanidines or aromatic rings' },
  { keys: ['guanidine', 'guanidin'], smarts: '[CX3](=N)([NX3])[NX3]', note: "arginine's side chain" },
  { keys: ['carbodiimide', 'karbodiimid'], smarts: 'N=C=N', note: 'N=C=N' },
  { keys: ['diazonium', 'n2+'], smarts: '[NX2+]#[NX1]', note: 'N≡N⁺' },

  // sulfur and phosphorus
  { keys: ['sh', 'hs', 'thiol', 'mercapto'], smarts: '[SX2H]', note: 'S–H' },
  { keys: ['thioether', 'sulfide', 'sulfid'], smarts: `${R}[SX2H0]${R}`, note: 'C–S–C; not disulfides' },
  { keys: ['sme', 'methylthio'], smarts: '[SX2H0][CH3]', note: 'S–CH3' },
  { keys: ['disulfide', 'disulfid', 's-s'], smarts: '[SX2][SX2]', note: 'S–S' },
  { keys: ['so3h', 'ho3s', 'sulfonic acid', 'sulfo', 'sulfonová kyselina'], smarts: `[SX4;$(S${R})](=O)(=O)[OX2H]`, note: 'C–SO3H; not sulfuric acid' },
  { keys: ['sulfonate', 'sulfonate ester'], smarts: `[SX4;$(S${R})](=O)(=O)[OX2H0]`, note: 'C–SO2–O–, as in OTs, OMs, OTf' },
  { keys: ['sulfate', 'síran', 'so4'], smarts: '[OX2][SX4](=O)(=O)[OX2]', note: 'O–SO2–O, sulfuric acid too' },
  { keys: ['sulfonamide', 'sulfonamid'], smarts: '[SX4](=O)(=O)[NX3]', note: 'S(=O)2–N' },
  { keys: ['sulfonyl chloride', 'so2cl'], smarts: '[SX4](=O)(=O)Cl', note: 'S(=O)2–Cl' },
  { keys: ['phosphate', 'fosfát', 'fosfat', 'po4'], smarts: '[OX2][PX4](=O)([OX2,OX1-])[OX2,OX1-]', note: 'O–P(=O)(O)O, ionised or not' },
  { keys: ['po', 'p=o', 'phosphoryl', 'fosforyl'], smarts: '[#15]=[OX1]', note: 'P=O' },

  // carbon–carbon multiple bonds
  { keys: ['alkene', 'alken', 'olefin', 'c=c'], smarts: 'C=C', note: 'C=C outside aromatic rings' },
  { keys: ['vinyl'], smarts: '[CH2]=[CH]', note: 'CH2=CH' },
  { keys: ['alkyne', 'alkyn', 'c#c', 'ethynyl'], smarts: 'C#C', note: 'C≡C' },

  // halogens (?f, ?cl, ?br, ?i: the elements)
  { keys: ['halide', 'halogenide', 'halogenid', 'halogen', 'x'], smarts: '[F,Cl,Br,I]', note: 'any halogen, CF3 and acid chlorides too' },
  { keys: ['alkyl halide'], smarts: '[CX4][F,Cl,Br,I]', note: 'halogen on an sp3 carbon' },
  { keys: ['aryl halide'], smarts: 'c[F,Cl,Br,I]', note: 'halogen on an aromatic ring' },
  { keys: ['fluoride', 'fluoro', 'fluorine', 'fluorid', 'fluor'], smarts: '[#9]', note: 'fluorine' },
  { keys: ['chloride', 'chloro', 'chlorine', 'chlorid', 'chlor'], smarts: '[#17]', note: 'chlorine' },
  { keys: ['bromide', 'bromo', 'bromine', 'bromid', 'brom'], smarts: '[#35]', note: 'bromine' },
  { keys: ['iodide', 'iodo', 'iodine', 'jodid', 'jod'], smarts: '[#53]', note: 'iodine; no template has it yet' },
  { keys: ['cf3', 'f3c', 'trifluoromethyl'], smarts: '[CX4](F)(F)F', note: 'CF3, also in Tf, OTf' },
  { keys: ['ccl3', 'trichloromethyl'], smarts: '[CX4](Cl)(Cl)Cl', note: 'CCl3, chloroform too' },

  // rings
  { keys: ['ring', 'cycle', 'cyklus', 'kruh'], smarts: '[R]', note: 'any ring' },
  { keys: ['ar', 'aryl', 'aromatic', 'aromatic ring', 'arene', 'aren', 'aromát'], smarts: 'a', note: 'any aromatic ring, hetero too; what the Ar label means' },
  { keys: ['heteroaromatic', 'heteroaryl', 'hetaryl'], smarts: '[a;!#6]', note: 'an aromatic ring with something other than carbon in it' },
  { keys: ['heterocycle', 'heterocyklus'], smarts: '[!#6;R]', note: 'a ring with something other than carbon in it' },
  { keys: ['pyridine', 'pyridin'], smarts: '[nR1]1[cR1][cR1][cR1][cR1][cR1]1', note: 'one ring N, not fused (not quinoline)' },
  { keys: ['pyrrole', 'pyrrol'], smarts: '[nR1]1[cR1][cR1][cR1][cR1]1', note: 'not fused (not indole)' },
  { keys: ['furan'], smarts: '[oR1]1[cR1][cR1][cR1][cR1]1', note: 'aromatic, not THF' },
  { keys: ['thiophene', 'thiofen'], smarts: '[sR1]1[cR1][cR1][cR1][cR1]1', note: 'not fused' },
  { keys: ['imidazole', 'imidazol'], smarts: '[nR1]1[cR1][nR1][cR1][cR1]1', note: 'also histidine; not fused (not purine)' },
  { keys: ['pyrimidine', 'pyrimidin'], smarts: '[nR1]1[cR1][nR1][cR1][cR1][cR1]1', note: 'also cytosine, thymine, uracil; not fused (not purine)' },
  { keys: ['purine', 'purin'], smarts: 'n1cnc2c(c1)ncn2', note: 'also adenine, guanine' },
  { keys: ['indole', 'indol'], smarts: 'c1ccc2c(c1)ccn2', note: 'also tryptophan' },
  { keys: ['quinoline', 'chinolin'], smarts: 'c1ccc2ncccc2c1', note: 'quinoline' },
  { keys: ['naphthalene', 'naftalen', 'naphthyl'], smarts: 'c1ccc2ccccc2c1', note: 'also in anthracene, phenanthrene' },
  { keys: ['cyclohexane', 'cyklohexan'], smarts: '[CX4]1[CX4][CX4][CX4][CX4][CX4]1', note: 'a six-membered carbon ring, also Cy, steroids, adamantane' },
  { keys: ['cyclopentane', 'cyklopentan'], smarts: '[CX4]1[CX4][CX4][CX4][CX4]1', note: 'a five-membered carbon ring, also steroids, norbornane' },
  { keys: ['piperidine', 'piperidin'], smarts: '[NX3;R1]1[CX4][CX4][CX4][CX4][CX4]1', note: 'piperidine ring' },
  { keys: ['morpholine', 'morfolin'], smarts: '[NX3]1[CX4][CX4][OX2][CX4][CX4]1', note: 'morpholine ring' },
  { keys: ['dioxane', 'dioxan'], smarts: '[OX2]1[CX4][CX4][OX2][CX4][CX4]1', note: '1,4-dioxane ring' },
  { keys: ['thf', 'tetrahydrofuran', 'oxolane'], smarts: '[OX2;r5]1[CX4][CX4][CX4][CX4]1', note: 'saturated O five-ring, also furanoses' },
  { keys: ['epoxide', 'epoxid', 'oxirane', 'oxiran'], smarts: '[CX4;r3]1[CX4;r3][OX2;r3]1', note: 'three-membered C–C–O ring' },

  // sugars
  { keys: ['pyranose', 'pyranosa', 'pyranóza'], smarts: PYRANOSE, note: 'six-membered sugar ring: glucose, fructose as drawn here' },
  { keys: ['furanose', 'furanosa', 'furanóza'], smarts: FURANOSE, note: 'five-membered sugar ring: ribose, deoxyribose' },
  { keys: ['sugar', 'saccharide', 'carbohydrate', 'cukr', 'sacharid'], smarts: any(PYRANOSE, FURANOSE, OPEN_SUGAR), note: 'a sugar ring, or an open chain with C=O next to three C–OH' },

  // hydrogen: implicit in every template, so [#1] finds nothing
  { keys: ['h', 'hydrogen', 'vodík'], smarts: '[!H0]', note: 'an atom with a hydrogen on it' },
];

// Amino acid codes, also shown on the amino acid cards ("Alanine · Ala, A")
export const AMINO_ACID_CODES = {
  Glycine: ['Gly', 'G'], Alanine: ['Ala', 'A'], Valine: ['Val', 'V'], Leucine: ['Leu', 'L'], Isoleucine: ['Ile', 'I'],
  Proline: ['Pro', 'P'], Phenylalanine: ['Phe', 'F'], Tyrosine: ['Tyr', 'Y'], Tryptophan: ['Trp', 'W'], Serine: ['Ser', 'S'],
  Threonine: ['Thr', 'T'], Cysteine: ['Cys', 'C'], Methionine: ['Met', 'M'], Asparagine: ['Asn', 'N'], Glutamine: ['Gln', 'Q'],
  'Aspartic acid': ['Asp', 'D'], 'Glutamic acid': ['Glu', 'E'], Lysine: ['Lys', 'K'], Arginine: ['Arg', 'R'], Histidine: ['His', 'H'],
};
