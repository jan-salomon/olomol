// What a format other programs read has no place for (the Export menu says it before a format is picked).
import { repeatingUnits } from '../model/doc.js';
import { t } from '../i18n/i18n.js';

// Arrows that make a reaction in another program's file (one of them, with its + and what is on it): a reaction
// arrow, an equilibrium, a retrosynthesis, several steps at once; not a resonance, a dipole, =, nor one that
// doesn't go (Indigo would make a reaction of any of them: water the product of HCl's dipole)
export const REACTION_ARROWS = ['forward', 'equilibrium', 'retro', 'multistep'];
// Whether these objects of the drawing go to other programs as one reaction in this format: one reaction arrow,
// and a format that holds one (not SDF or InChI; a scheme of several steps is no one reaction)
export function oneReaction(doc, ids, format) {
  const arrows = [...doc.arrows.values()].filter((a) => !ids || ids.includes(a.id));
  return !['sdf', 'inchi'].includes(format) && arrows.filter((a) => REACTION_ARROWS.includes(a.kind)).length === 1;
}

// What of the drawing (or the objects with `ids`) a format can't hold: [what, in words], [] for none (pictures keep
// it all, KET all but 3D models: olomol's own; XYZ is 3D coordinates only, as its name says)
// (a molfile of a reaction is an RXN, a reaction SMILES has one: its arrow and + kept, other arrows not; SDF and
// InChI hold molecules only)
const LOST = {
  mol: ['curves', 'lonePairs', 'orbitals', 'texts', 'brackets', 'arrows', 'otherArrows', 'colours', 'partial', 'models'],
  rxn: ['curves', 'lonePairs', 'orbitals', 'texts', 'brackets', 'arrows', 'otherArrows', 'colours', 'partial', 'models'],
  sdf: ['curves', 'lonePairs', 'orbitals', 'texts', 'brackets', 'arrows', 'colours', 'partial', 'models'],
  // (standard SMILES: no dative bonds, a complex written as its parts)
  smiles: ['curves', 'lonePairs', 'orbitals', 'texts', 'brackets', 'units', 'arrows', 'otherArrows', 'colours', 'hbond', 'partial', 'dative', 'models'],
  inchi: ['curves', 'lonePairs', 'orbitals', 'texts', 'brackets', 'units', 'arrows', 'colours', 'hbond', 'partial', 'dative', 'models'],
  cdxml: ['curves', 'lonePairs', 'orbitals', 'brackets', 'units', 'colours', 'partial', 'models'],
  // (KET for Ketcher: olomol's own section keeps the rest, which Ketcher ignores; what Ketcher itself shows otherwise)
  ket: ['newman', 'partialKet', 'labelPairs', 'models'],
};
const LOST_WORDS = {
  curves: () => t('curved arrows'), lonePairs: () => t('lone pairs'), orbitals: () => t('orbitals'), texts: () => t('texts'),
  brackets: () => t('brackets'), units: () => t('repeating units (n)'), arrows: () => t('arrows and +'), otherArrows: () => t('arrows other than the reaction\'s'), colours: () => t('colours'),
  newman: () => t('Newman projections (as the molecules they show)'), labelPairs: () => t('lone pairs on abbreviations'), partialKet: () => t('partial bonds (as hydrogen bonds)'),
  hbond: () => t('hydrogen bonds'), partial: () => t('partial bonds'), dative: () => t('dative bonds'), models: () => t('3D models'),
};
export function lostIn(doc, format, ids = null) {
  const lost = LOST[format];
  if (!lost) return [];
  const wanted = ids ? new Set(ids) : null;
  const kept = (id) => !wanted || wanted.has(id);
  const atoms = [...doc.atoms.values()].filter((a) => kept(a.id));
  const bonds = [...doc.bonds.values()].filter((b) => kept(b.id) || (kept(b.a) && kept(b.b)));
  const units = new Set(repeatingUnits(doc).map(({ bracket }) => bracket.id));
  const some = (kind, test = () => true) => [...(doc[kind]?.values() ?? [])].some((o) => kept(o.id) && test(o));
  const has = {
    curves: some('curves'),
    lonePairs: atoms.some((a) => a.lonePairs === 'auto' || a.lonePairs > 0),
    orbitals: [...(doc.orbitals?.values() ?? [])].some((o) => kept(o.id) || kept(o.atom)),
    texts: some('texts'),
    brackets: some('brackets', (b) => !units.has(b.id)),
    units: some('brackets', (b) => units.has(b.id)),
    // (the arrows: all of them where the format holds no reaction, or this is none or several steps; else those
    // that aren't the one reaction's, a resonance arrow beside it)
    arrows: !oneReaction(doc, ids, format) && (some('arrows') || some('pluses')),
    otherArrows: oneReaction(doc, ids, format) && some('arrows', (a) => !REACTION_ARROWS.includes(a.kind)),
    colours: [...atoms, ...bonds].some((o) => o.color || o.highlight) || ['arrows', 'pluses', 'texts', 'curves', 'brackets'].some((kind) => some(kind, (o) => o.color))
      || [...doc.fills.values()].some((f) => f.atoms.every(kept)),
    hbond: bonds.some((b) => b.kind === 'hbond'),
    partial: bonds.some((b) => b.kind === 'partial'),
    partialKet: bonds.some((b) => b.kind === 'partial'),
    newman: bonds.some((b) => b.newman),
    labelPairs: atoms.some((a) => a.alias && (a.lonePairs === 'auto' || a.lonePairs > 0)),
    dative: bonds.some((b) => b.kind === 'dative'),
    models: some('models'),
  };
  return lost.filter((what) => has[what]).map((what) => LOST_WORDS[what]());
}
