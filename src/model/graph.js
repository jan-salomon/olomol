// The molecule graph: neighbours, molecules (connected atoms) and rings.
import { bondsByAtom, otherEnd } from './doc.js';

// Molecules: lists of atom ids, each a set of atoms connected by bonds.
export function fragments(doc, byAtom = bondsByAtom(doc)) {
  const seen = new Set();
  const result = [];
  for (const id of doc.atoms.keys()) {
    if (seen.has(id)) continue;
    const members = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const atom = stack.pop();
      members.push(atom);
      for (const bond of byAtom.get(atom)) {
        const next = otherEnd(bond, atom);
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    result.push(members);
  }
  return result;
}

// Map atom id -> index of its molecule in fragments().
export function fragmentIndex(frags) {
  const map = new Map();
  frags.forEach((members, i) => members.forEach((id) => map.set(id, i)));
  return map;
}

// The smallest ring through each bond (Map bond id -> [atom ids] in ring
// order), for bonds in rings of up to `maxSize` atoms. Found by a breadth-
// first search from one end of the bond to the other without the bond.
// Hydrogen bonds and links make no rings (a transition state's partial bonds do).
export function smallestRings(doc, byAtom = bondsByAtom(doc), maxSize = 12) {
  const rings = new Map();
  for (const bond of doc.bonds.values()) {
    if (bond.kind === 'hbond' || bond.kind === 'link') continue;
    const previous = new Map([[bond.a, null]]);
    let frontier = [bond.a];
    let found = false;
    for (let depth = 1; depth < maxSize && frontier.length && !found; depth++) {
      const next = [];
      for (const atom of frontier) {
        for (const other of byAtom.get(atom)) {
          if (other.id === bond.id || other.kind === 'hbond' || other.kind === 'link') continue;
          const to = otherEnd(other, atom);
          if (previous.has(to)) continue;
          previous.set(to, atom);
          if (to === bond.b) {
            found = true;
            break;
          }
          next.push(to);
        }
        if (found) break;
      }
      frontier = next;
    }
    if (!found) continue;
    const ring = [];
    for (let atom = bond.b; atom !== null; atom = previous.get(atom)) ring.push(atom);
    rings.set(bond.id, ring);
  }
  return rings;
}

// All rings that are the smallest ring of some bond, without repeats.
export function ringList(rings) {
  const seen = new Map();
  for (const ring of rings.values()) seen.set([...ring].sort((p, q) => p - q).join(','), ring);
  return [...seen.values()];
}
