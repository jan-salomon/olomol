// The curved arrows of a drawing as data, for a page that embeds olomol and checks what students drew
// (<olomol-editor>'s get('curvedArrows')). One way to write each arrow, by the ids of atoms in the drawing (the same
// in what students start from and its answer when both come from one drawing):
//   { id, electrons: 2 | 1,
//     from: { lonePair: a } (or a group label's electrons: Nu) | { unpairedElectron: a } | { bond: [a, b] } | { orbital: o, atom: a },
//     to:   { atom: a } | { bond: [a, b] } | { newBond: [a, b] } | { orbital: o, atom: a } }
// A bond as its two atoms, smaller id first. Which lone pair (which dots) an arrow starts at is how it is drawn,
// not chemistry: left out. An arrow from an atom's electrons to an atom not bonded to it makes a bond between
// them, whether drawn to the atom or to the middle between them (Shift): both are { newBond: [a, b] }. From a
// bond to a third atom stays { atom } (which end of the bond bonds to it is the chemist's to say).
import { bondsByAtom } from '../model/doc.js';

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

export function arrowsOf(doc) {
  const byAtom = bondsByAtom(doc);
  const bonded = (a, b) => (byAtom.get(a) ?? []).some((bond) => bond.a === b || bond.b === b);
  const bond = (id) => {
    const b = doc.bonds.get(id);
    return b ? pair(b.a, b.b) : null;
  };
  const orbitalAtom = (id) => doc.orbitals.get(id)?.atom ?? null;
  const arrows = [];
  for (const curve of doc.curves.values()) {
    const { from: f = {}, to: e = {} } = curve;
    let from = null;
    if (f.bond !== undefined) from = bond(f.bond) && { bond: bond(f.bond) };
    else if (f.orbital !== undefined) from = { orbital: f.orbital, atom: orbitalAtom(f.orbital) };
    else if (f.atom !== undefined) from = f.radical ? { unpairedElectron: f.atom } : { lonePair: f.atom };
    let to = null;
    if (e.newBond !== undefined) to = { newBond: pair(e.newBond, e.atom) };
    else if (e.bond !== undefined) to = bond(e.bond) && { bond: bond(e.bond) };
    else if (e.orbital !== undefined) to = { orbital: e.orbital, atom: orbitalAtom(e.orbital) };
    else if (e.atom !== undefined) {
      const source = from?.lonePair ?? from?.unpairedElectron;
      to = source !== undefined && source !== e.atom && !bonded(source, e.atom) ? { newBond: pair(source, e.atom) } : { atom: e.atom };
    }
    if (from && to) arrows.push({ id: curve.id, electrons: curve.electrons ?? 2, from, to });
  }
  return arrows;
}
