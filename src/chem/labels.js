// Group labels: placeholders (R, X, Nu) and abbreviations (Ph, Boc, OMe:
// they count in formulas), by kind, with their full names; and each as a
// functional group to attach (Templates → Abbreviations): the attachment
// point (a "*" without a label) bonded to an atom with the label.
import { ABBREVIATIONS } from './abbreviations.js';
import { GROUP_LABELS } from './elements.js';
import { t } from '../i18n/i18n.js';
import { addAtom, addBond, emptyDoc } from '../model/doc.js';

// The labels, by kind; abbreviations not listed here go under "Other".
export const LABEL_GROUPS = [
  [t('Generic'), GROUP_LABELS],
  [t('Alkyl'), ['Me', 'Et', 'nPr', 'iPr', 'nBu', 'iBu', 'sBu', 'tBu', 'Cy']],
  [t('Aryl and benzyl'), ['Ph', 'Bn', 'PMB', 'Mes', 'Tr']],
  [t('Acyl'), ['Ac', 'Bz', 'Piv', 'CHO']],
  [t('Protecting groups'), ['Boc', 'Cbz', 'Fmoc', 'TMS', 'TES', 'TBS', 'TIPS', 'THP']],
  [t('Sulfonyl'), ['Ts', 'Ms', 'Tf']],
  [t('On oxygen'), ['OMe', 'OEt', 'OtBu', 'OPh', 'OBn', 'OAc', 'OBz', 'OPiv', 'OTs', 'OMs', 'OTf', 'OTMS', 'OTBS']],
  [t('On nitrogen'), ['NHAc', 'NHBoc', 'NMe2']],
  [t('Acids, esters and more'), ['CO2H', 'CO2Me', 'CO2Et', 'CO2tBu', 'CH2OH', 'CN', 'CF3', 'NO2', 'SO3H']],
];
// The labels' full names (shown when one is pointed at); generic labels: what they stand for.
export const LABEL_NAMES = {
  R: t('any substituent'), "R'": t('any substituent'), "R''": t('any substituent'), R1: t('any substituent'), R2: t('any substituent'),
  X: t('a halogen (or another atom)'), Y: t('another atom or group'), Nu: t('nucleophile'), E: t('electrophile'), LG: t('leaving group'), Ar: t('aryl (any aromatic ring)'),
  Me: t('methyl'), Et: t('ethyl'), nPr: t('n-propyl'), iPr: t('isopropyl'), nBu: t('n-butyl'), iBu: t('isobutyl'), sBu: t('sec-butyl'), tBu: t('tert-butyl'),
  Cy: t('cyclohexyl'), Ph: t('phenyl'), Bn: t('benzyl'), Mes: t('mesityl (2,4,6-trimethylphenyl)'), Tr: t('trityl (triphenylmethyl)'), PMB: t('p-methoxybenzyl'),
  Ac: t('acetyl'), Bz: t('benzoyl'), Piv: t('pivaloyl'), Boc: t('tert-butoxycarbonyl'), Cbz: t('benzyloxycarbonyl'), Fmoc: t('9-fluorenylmethoxycarbonyl'),
  Ts: t('tosyl (p-toluenesulfonyl)'), Ms: t('mesyl (methanesulfonyl)'), Tf: t('triflyl (trifluoromethanesulfonyl)'),
  TMS: t('trimethylsilyl'), TES: t('triethylsilyl'), TBS: t('tert-butyldimethylsilyl'), TIPS: t('triisopropylsilyl'), THP: t('tetrahydropyranyl'),
  OMe: t('methoxy'), OEt: t('ethoxy'), OtBu: t('tert-butoxy'), OPh: t('phenoxy'), OBn: t('benzyloxy'), OAc: t('acetoxy'), OBz: t('benzoyloxy'),
  OPiv: t('pivaloyloxy'), OTs: t('tosyloxy (tosylate)'), OMs: t('mesyloxy (mesylate)'), OTf: t('triflyloxy (triflate)'), OTMS: t('trimethylsilyloxy'), OTBS: t('tert-butyldimethylsilyloxy'),
  NHAc: t('acetamido'), NHBoc: t('tert-butoxycarbonylamino'), NMe2: t('dimethylamino'),
  CO2H: t('carboxy'), COOH: t('carboxy'), CO2Me: t('methoxycarbonyl'), CO2Et: t('ethoxycarbonyl'), CO2tBu: t('tert-butoxycarbonyl'), CHO: t('formyl'),
  CH2OH: t('hydroxymethyl'), CN: t('cyano'), CF3: t('trifluoromethyl'), NO2: t('nitro'), SO3H: t('sulfo'),
};

const listed = new Set(LABEL_GROUPS.flatMap(([, labels]) => labels));
const others = Object.keys(ABBREVIATIONS).filter((label) => !listed.has(label) && label !== 'COOH');
if (others.length) LABEL_GROUPS.push([t('Other'), others]);

// A label as a functional group: "*" (where it attaches) – the label.
export function labelDoc(label) {
  const doc = emptyDoc();
  const at = addAtom(doc, 0, 0, '*');
  const labelled = addAtom(doc, 1, 0, '*', { alias: label });
  addBond(doc, at.id, labelled.id);
  return doc;
}
