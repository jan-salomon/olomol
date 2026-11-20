// Aromatic rings and other delocalized bonds (C(=O)O⁻, N⁺(=O)O⁻, S(=O)2O⁻,
// C(=NH2⁺)NH2, O=O⁺–O⁻) are marked for drawing (bond.delocalized) while
// keeping their single and double orders: valences, formulas and files stay
// as they were, and other programs read the Kekulé structure.
import { bondsByAtom, otherEnd } from '../model/doc.js';
import { smallestRings } from '../model/graph.js';
import { electronsByAtom } from './valence.js';

// Bond orders plus hydrogens of each atom (4 for a ring CH, 1 for O⁻).
export function bondTotals(doc, byAtom = bondsByAtom(doc), electrons = electronsByAtom(doc, byAtom)) {
  const totals = new Map();
  for (const [id, bonds] of byAtom) totals.set(id, bonds.reduce((sum, bond) => sum + (bond.kind ? 0 : bond.order), 0) + (electrons.get(id)?.hydrogens ?? 0));
  return totals;
}

// The bonds of charged groups that are the same in their resonance forms:
// round an atom X, a charged neighbour and a neutral one of the same element
// that swap single and double bonds to X. Either the charged one is singly
// bonded and the other has one bond more (O⁻ and =O; C⁺ or C⁻ and =C, allyl),
// or the charged one is doubly bonded onium and the other has a lone pair
// and one bond less (=NH2⁺ and NH2). `atomIds`: where to look (default all).
export function delocalizedGroups(doc, atomIds = null) {
  const byAtom = bondsByAtom(doc);
  const electrons = electronsByAtom(doc, byAtom);
  const totals = bondTotals(doc, byAtom, electrons);
  const found = new Set();
  for (const x of atomIds ?? doc.atoms.keys()) {
    if (!doc.atoms.has(x)) continue;
    const members = byAtom.get(x).filter((bond) => bond.order <= 2 && !bond.kind).map((bond) => ({ bond, atom: doc.atoms.get(otherEnd(bond, x)) }));
    for (const charged of members) {
      const { atom: a, bond } = charged;
      if (!a.charge || a.el === '*') continue;
      const partners = members.filter(({ atom: b, bond: other }) => {
        if (b === a || b.el !== a.el || b.charge) return false;
        if (bond.order === 1) return other.order === 2 && totals.get(b.id) === totals.get(a.id) + 1;
        return a.charge > 0 && other.order === 1 && totals.get(b.id) === totals.get(a.id) - 1 && electrons.get(b.id).lonePairs > 0;
      });
      if (!partners.length) continue;
      found.add(bond.id);
      for (const { bond: other } of partners) found.add(other.id);
    }
  }
  return found;
}

// How charges show when their bonds are delocalized: spread over the atoms
// they move between (each gets δ+ or δ−), or for three atoms or more of a
// ring written in its middle (C5H5⁻, C7H7⁺). A charge moves two bonds at a
// time (O⁻–C=O to O=C–O⁻), to an atom of the same element with one bond
// more or less. Returns { partial: Map atom id -> +1 | -1, hidden: Set of
// atom ids whose charge isn't written, centred: [{ ring: [atom ids],
// charge }] }. `rings`: Map bond id -> its smallest ring.
export function spreadCharges(doc, rings, byAtom = bondsByAtom(doc)) {
  const result = { partial: new Map(), hidden: new Set(), centred: [] };
  if (![...doc.bonds.values()].some((bond) => bond.delocalized)) return result;
  const totals = bondTotals(doc, byAtom);
  const along = (id) => byAtom.get(id).filter((bond) => bond.delocalized).map((bond) => otherEnd(bond, id));
  const done = new Set();
  for (const a of doc.atoms.values()) {
    if (!a.charge || done.has(a.id) || !along(a.id).length) continue;
    const sign = Math.sign(a.charge);
    const fits = (b) => b.el === a.el && (Math.sign(b.charge) === sign ? totals.get(b.id) === totals.get(a.id) : !b.charge && Math.abs(totals.get(b.id) - totals.get(a.id)) === 1);
    const pool = new Set([a.id]);
    const stack = [a.id];
    while (stack.length) {
      for (const x of along(stack.pop())) {
        for (const id of along(x)) {
          if (pool.has(id) || !fits(doc.atoms.get(id))) continue;
          pool.add(id);
          stack.push(id);
        }
      }
    }
    const charged = [...pool].filter((id) => doc.atoms.get(id).charge);
    charged.forEach((id) => done.add(id));
    if (pool.size === charged.length) continue;
    const ring = ringOf(a.id, byAtom, rings);
    if (ring && pool.size >= 3 && [...pool].every((id) => ring.includes(id))) {
      pool.forEach((id) => result.hidden.add(id));
      result.centred.push({ ring, charge: charged.reduce((sum, id) => sum + doc.atoms.get(id).charge, 0) });
    } else {
      pool.forEach((id) => result.partial.set(id, sign));
    }
  }
  return result;
}

// The smallest ring through an atom, from the rings of its bonds.
function ringOf(id, byAtom, rings) {
  let best = null;
  for (const bond of byAtom.get(id)) {
    const ring = rings.get(bond.id);
    if (ring && (!best || ring.length < best.length)) best = ring;
  }
  return best;
}

// What the marks depend on: the delocalized bonds with their atoms'
// elements, charges and bond counts ('' without any). A change of it is a
// change of the structure round them (not a move).
export function marksKey(doc) {
  const marked = [...doc.bonds.values()].filter((bond) => bond.delocalized);
  if (!marked.length) return '';
  const degree = new Map();
  for (const bond of doc.bonds.values()) for (const id of [bond.a, bond.b]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const atom = (id) => `${doc.atoms.get(id)?.el}${doc.atoms.get(id)?.charge}/${degree.get(id)}`;
  return marked.map((bond) => `${bond.id}:${bond.a}${atom(bond.a)}-${bond.b}${atom(bond.b)}=${bond.order}`).join(';');
}

// Marks that no longer hold after a change of the structure (an atom of an
// aromatic ring deleted, the O⁻ of a COO⁻ dropped onto another atom): a
// delocalized bond must lie in a ring of delocalized bonds or in a charged
// group (delocalizedGroups). Otherwise its mark goes, with those of every
// delocalized bond joined to it: the system is written with the single and
// double bonds it kept underneath, as Kekulé would. True if any went.
export function dropStaleMarks(doc) {
  const marked = [...doc.bonds.values()].filter((bond) => bond.delocalized);
  if (!marked.length) return false;
  const byAtom = bondsByAtom(doc);
  const rings = smallestRings(doc, byAtom);
  let groups = null;
  const holds = (bond) => {
    const ring = rings.get(bond.id);
    if (ring?.every((id, k) => byAtom.get(id).some((b) => b.delocalized && otherEnd(b, id) === ring[(k + 1) % ring.length]))) return true;
    groups ??= delocalizedGroups(doc);
    return groups.has(bond.id);
  };
  const stale = marked.filter((bond) => !holds(bond));
  const seen = new Set(stale);
  for (const stack = [...stale]; stack.length;) {
    const bond = stack.pop();
    delete bond.delocalized;
    for (const id of [bond.a, bond.b]) {
      for (const next of byAtom.get(id) ?? []) {
        if (!next.delocalized || seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return stale.length > 0;
}
