// Drawn hydrogens: the implicit H of some atoms as H atoms of their own
// (a proton transfer needs an H to point an arrow at), and back. New H
// atoms go into the widest gaps between the atom's bonds, evenly; an atom
// that ends up with two bonds stays bent (H–O–C, not H–O–C in a line). On a
// chair's ring atom they go on its free places, axial or equatorial, as the
// chair templates draw them.
import { freeChairSlots } from '../chem/ringFlip.js';
import { electronsByAtom } from '../chem/valence.js';
import { addAtom, addBond, bondsByAtom, deleteObjects, otherEnd } from '../model/doc.js';
import { smallestRings } from '../model/graph.js';
import { sproutAngle } from './build.js';

const TURN = 2 * Math.PI;

// Directions for `count` new bonds next to bonds at `angles`.
function newDirections(angles, count) {
  if (!angles.length) return Array.from({ length: count }, (_, k) => -Math.PI / 2 + (k * TURN) / count);
  const sorted = [...angles].sort((p, q) => p - q);
  const gaps = sorted.map((a, k) => ({ from: a, size: (k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + TURN) - a, n: 0 }));
  for (let k = 0; k < count; k++) gaps.reduce((best, g) => (g.size / (g.n + 1) > best.size / (best.n + 1) ? g : best)).n++;
  return gaps.flatMap((g) => Array.from({ length: g.n }, (_, k) => g.from + (g.size * (k + 1)) / (g.n + 1)));
}

// The drawn H atoms that can go back to being implicit: plain single
// bonds, no charge, isotope, arrows or orbitals of their own (an arrow from
// its bond, an E2's C–H, counts as its own: it stays with it).
function drawnHydrogens(doc, ids, byAtom) {
  const used = new Set();
  for (const curve of doc.curves.values()) {
    for (const end of [curve.from, curve.to]) {
      for (const id of [end.atom, end.newBond]) if (id !== undefined) used.add(id);
      const bond = end.bond !== undefined ? doc.bonds.get(end.bond) : null;
      if (bond) used.add(bond.a).add(bond.b);
    }
  }
  for (const orbital of doc.orbitals?.values() ?? []) used.add(orbital.atom);
  const found = [];
  for (const id of ids) {
    for (const bond of byAtom.get(id) ?? []) {
      const h = doc.atoms.get(otherEnd(bond, id));
      if (h.el !== 'H' || h.charge || h.isotope || h.radical || used.has(h.id) || bond.order !== 1 || bond.stereo) continue;
      if (byAtom.get(h.id).length === 1 && doc.atoms.get(id).el !== 'H') found.push({ h: h.id, parent: id });
    }
  }
  return found;
}

// What the button does for these atoms: 'draw' (some have implicit H),
// 'hide' (some have drawn H) or null.
export function hydrogenAction(doc, ids) {
  const electrons = electronsByAtom(doc);
  if (ids.some((id) => doc.atoms.get(id)?.el !== 'H' && electrons.get(id)?.hydrogens > 0)) return 'draw';
  return drawnHydrogens(doc, ids, bondsByAtom(doc)).length ? 'hide' : null;
}

export function drawHydrogens(ed, ids) {
  ed.change((doc) => {
    const electrons = electronsByAtom(doc);
    // the chairs these atoms are in: their free places, read before any H is added
    const onChair = new Map();
    const wanted = new Set(ids);
    // (smallestRings has each ring once for each of its bonds: each chair read once)
    const seen = new Set();
    for (const ring of smallestRings(doc).values()) {
      if (ring.length !== 6 || !ring.some((id) => wanted.has(id))) continue;
      const key = [...ring].sort((p, q) => p - q).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      for (const [id, free] of freeChairSlots(doc, ring) ?? []) onChair.set(id, free);
    }
    for (const id of ids) {
      const atom = doc.atoms.get(id);
      const count = electrons.get(id)?.hydrogens ?? 0;
      if (!atom || atom.el === 'H' || !count) continue;
      const free = onChair.get(id);
      if (free && free.length >= count) {
        for (const { x, y } of free.slice(0, count)) addBond(doc, id, addAtom(doc, x, y, 'H').id);
        if (atom.hCount !== null && atom.hCount !== undefined) atom.hCount = 0;
        continue;
      }
      const byAtom = bondsByAtom(doc);
      const angles = byAtom.get(id).map((bond) => {
        const other = doc.atoms.get(otherEnd(bond, id));
        return Math.atan2(other.y - atom.y, other.x - atom.x);
      });
      // one bond and one H: bent, as a chain goes on
      const directions = angles.length === 1 && count === 1 ? [sproutAngle(doc, id, byAtom)] : newDirections(angles, count);
      for (const a of directions) {
        const h = addAtom(doc, atom.x + Math.cos(a), atom.y + Math.sin(a), 'H');
        addBond(doc, id, h.id);
      }
      // a hydrogen count set by hand now counts the drawn ones too
      if (atom.hCount !== null && atom.hCount !== undefined) atom.hCount = 0;
    }
  });
}

export function hideHydrogens(ed, ids) {
  ed.change((doc) => {
    const found = drawnHydrogens(doc, ids, bondsByAtom(doc));
    for (const { parent } of found) {
      const atom = doc.atoms.get(parent);
      if (atom.hCount !== null && atom.hCount !== undefined) atom.hCount += 1;
    }
    deleteObjects(doc, found.map((f) => f.h));
  });
}
