// How a drawing shows its molecules in space, for a page that checks a conformation ("draw the chair with Br
// axial", "the conformation with H and Br anti"): get('conformations') →
//   { chairs: [{ ring: [atom ids], groups: [{ atom: the ring atom, first: the group's first atom, slot: 'axial' |
//       'equatorial' }] }],
//     newmans: [{ front, back (the carbons seen end on), pairs: [{ front, back (a group's first atom on each),
//       dihedral: 0 | 60 | … | 300, relation: 'eclipsed' | 'gauche' | 'anticlinal' | 'anti' }] }] }
// A chair as olomol reads one (ringFlip.js readChair: the ring drawn as a chair, each group axial or equatorial by
// its bond); a Newman projection as drawn (newman.js), each group on the front against each on the back.
import { bondsByAtom } from '../model/doc.js';
import { smallestRings } from '../model/graph.js';
import { readChair } from '../chem/ringFlip.js';
import { dihedralBetween, endOnBonds, groupsAround } from '../chem/newman.js';

const RELATION = { 0: 'eclipsed', 60: 'gauche', 120: 'anticlinal', 180: 'anti', 240: 'anticlinal', 300: 'gauche' };

export function conformationsOf(doc) {
  const byAtom = bondsByAtom(doc);
  const chairs = [];
  const seen = new Set();
  for (const ring of smallestRings(doc, byAtom).values()) {
    const key = [...ring].sort((p, q) => p - q).join();
    if (ring.length !== 6 || seen.has(key)) continue;
    seen.add(key);
    const read = readChair(doc, ring, byAtom);
    if (read.error) continue;
    chairs.push({ ring: [...ring], groups: read.groups.map((g) => ({ atom: g.ring, first: g.first, slot: g.slot })) });
  }
  const newmans = endOnBonds(doc).map((bond) => {
    const pairs = [];
    for (const f of groupsAround(doc, bond, 'front')) {
      for (const b of groupsAround(doc, bond, 'back')) {
        const dihedral = dihedralBetween(doc, bond, f.atom, b.atom);
        if (dihedral !== null) pairs.push({ front: f.atom, back: b.atom, dihedral, relation: RELATION[dihedral] });
      }
    }
    return { front: bond.a, back: bond.b, pairs };
  });
  return { chairs, newmans };
}
