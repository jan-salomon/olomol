// The conformation a drawing shows, for its 3D model: chairs drawn as the
// templates draw them (ringFlip.js reads them as the 3D chair they show)
// and Newman projections (newman.js: front carbon towards the viewer).
// Torsion angles (IUPAC: looking from the second atom to the third, positive
// clockwise), in degrees, by atom index in the molecule (`atomIds`' order):
// - `checks`: what a conformer must have, within TORSION_TOLERANCE: a chair's
//   ring torsions (which chair) and each group's against the ring (axial or
//   equatorial), the torsions of a Newman projection seen along a ring
//   bond (cyclohexane's: its back can't turn on its own);
// - `sets`: a Newman projection of a chain: the conformer's back turned
//   about the bond to the drawn dihedral (an eclipsed one too, which no
//   conformer generator makes; an eclipsed back drawn a little further
//   round is eclipsed); and a diene's or an enone's s-cis or s-trans, as
//   drawn (`loose`, the sixth: turned only where the conformer has the other).
import { bondsByAtom } from '../model/doc.js';
import { smallestRings } from '../model/graph.js';
import { backGroups, dihedralDrawn, endOnBonds, groupsAround, referenceGroup } from './newman.js';
import { chairModel } from './ringFlip.js';

export const TORSION_TOLERANCE = 60;
const DEGREE = Math.PI / 180;

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// The torsion angle a–b–c–d of four points (right-handed), in degrees, −180…180.
export function torsion(a, b, c, d) {
  const [b1, b2, b3] = [sub(b, a), sub(c, b), sub(d, c)];
  const [n1, n2] = [cross(b1, b2), cross(b2, b3)];
  return Math.atan2(dot(cross(n1, n2), b2) / Math.hypot(...b2), dot(n1, n2)) / DEGREE;
}

// How far apart two angles are, in degrees, 0…180.
export const torsionOff = (x, y) => Math.abs((((x - y) % 360) + 540) % 360 - 180);

// { checks: [[i, j, k, l, degrees]], sets: [[i, j, k, l, degrees, loose]] } for the molecule `atomIds`, or null
// if it shows no conformation.
export function conformationOf(doc, atomIds) {
  const index = new Map(atomIds.map((id, k) => [id, k]));
  const checks = [];
  const sets = [];
  const byAtom = bondsByAtom(doc);
  const rings = smallestRings(doc, byAtom);
  const { chairs } = chairModel(doc, atomIds, byAtom, [...rings.values()]);
  for (const { ring, groups, at } of chairs) {
    // (the drawing's x right, y down, depth towards the viewer: right-handed with y up; each chair's own depths)
    const point = (id) => [at.get(id)[0], -at.get(id)[1], at.get(id)[2]];
    const quad = (...ids) => checks.push([...ids.map((id) => index.get(id)), torsion(...ids.map(point))]);
    for (let i = 0; i < 6; i++) quad(ring[i], ring[(i + 1) % 6], ring[(i + 2) % 6], ring[(i + 3) % 6]);
    for (const g of groups) {
      const i = ring.indexOf(g.ring);
      quad(g.first, ring[i], ring[(i + 1) % 6], ring[(i + 2) % 6]);
    }
  }
  for (const bond of endOnBonds(doc)) {
    if (!index.has(bond.a) || !index.has(bond.b)) continue;
    const drawn = dihedralDrawn(doc, bond);
    if (!drawn) continue;
    const [front, back] = [groupsAround(doc, bond, 'front'), groupsAround(doc, bond, 'back')];
    // the groups the dihedral is between (dihedralDrawn's: the largest), and each group's place round its
    // carbon from there, in thirds of a turn clockwise
    const [f, g] = [referenceGroup(doc, bond, 'front'), referenceGroup(doc, bond, 'back')];
    const third = (group, ref) => Math.round(((((group.angle - ref.angle) / DEGREE) % 360) + 360) % 360 / 120) % 3;
    const [a, b] = [index.get(bond.a), index.get(bond.b)];
    if (backGroups(doc, bond)) sets.push([index.get(f.atom), a, b, index.get(g.atom), drawn.dihedral]);
    else {
      for (const p of front) {
        for (const q of back) checks.push([index.get(p.atom), a, b, index.get(q.atom), drawn.dihedral + 120 * (third(q, g) - third(p, f))]);
      }
    }
  }
  // a single bond between two double bonds, not in a ring (a diene, an enone): s-cis or s-trans as drawn, which a
  // flat drawing of a conjugated chain says (a diene drawn s-cis for a Diels–Alder stays s-cis, about 35°, though
  // s-trans is lower). (A double bond of an aromatic ring says nothing: its Kekulé structure is one of two.)
  const other = (bond, atom) => (bond.a === atom ? bond.b : bond.a);
  const aromatic = (bond) => {
    const ring = rings.get(bond.id);
    if (!ring) return false;
    const inRing = new Set(ring);
    const doubled = (atom) => byAtom.get(atom).some((x) => x.order === 2 && inRing.has(other(x, atom)));
    const plain = ring.filter((atom) => !doubled(atom));
    return !plain.length || (ring.length === 5 && plain.length === 1 && ['N', 'O', 'S'].includes(doc.atoms.get(plain[0]).el));
  };
  for (const bond of doc.bonds.values()) {
    if (bond.order !== 1 || bond.kind || bond.newman || !index.has(bond.a) || !index.has(bond.b) || rings.has(bond.id)) continue;
    const double = (atom) => byAtom.get(atom).find((x) => x !== bond && x.order === 2 && !x.kind && !aromatic(x));
    const [d1, d2] = [double(bond.a), double(bond.b)];
    if (!d1 || !d2) continue;
    const [i, l] = [other(d1, bond.a), other(d2, bond.b)];
    const [a, b] = [doc.atoms.get(bond.a), doc.atoms.get(bond.b)];
    const side = (atom) => {
      const p = doc.atoms.get(atom);
      return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    };
    const [si, sl] = [side(i), side(l)];
    if (Math.abs(si) < 0.1 || Math.abs(sl) < 0.1) continue; // (drawn in a line: says neither)
    // (turned to it where the conformer has the other one: a conformer generator makes a conjugated chain s-trans
    // whatever is drawn; one with it already, an s-cis diene's about 35°, kept as it is)
    sets.push([index.get(i), index.get(bond.a), index.get(bond.b), index.get(l), Math.sign(si) === Math.sign(sl) ? 0 : 180, true]);
  }
  return checks.length || sets.length ? { checks, sets } : null;
}

// Does a model (points by atom index, right-handed) have the conformation's checked torsions?
export const hasConformation = (conformation, points) => !conformation
  || conformation.checks.every(([i, j, k, l, degrees]) => torsionOff(torsion(points[i], points[j], points[k], points[l]), degrees) <= TORSION_TOLERANCE);

// Turns each `sets` torsion of a model to its drawn value: the atoms on the far side of the bond (by
// `bonds`, [[a, b]] over every atom of the model, hydrogens too) turned about it. `points` changed in place.
export function setTorsions(conformation, points, bonds) {
  if (!conformation?.sets.length) return;
  const near = points.map(() => []);
  for (const [a, b] of bonds) {
    near[a].push(b);
    near[b].push(a);
  }
  for (const [i, j, k, l, degrees, loose] of conformation.sets) {
    if (loose && torsionOff(torsion(points[i], points[j], points[k], points[l]), degrees) <= TORSION_TOLERANCE) continue;
    // the far side: what k reaches without going through j
    const side = new Set([k]);
    const stack = [k];
    while (stack.length) {
      for (const next of near[stack.pop()]) {
        if (next === j || side.has(next)) continue;
        side.add(next);
        stack.push(next);
      }
    }
    if (side.has(i)) continue; // (a ring after all)
    // (turned clockwise as seen from j, the torsion grows by as much)
    const by = (degrees - torsion(points[i], points[j], points[k], points[l])) * DEGREE;
    const axis = sub(points[k], points[j]);
    const n = axis.map((v) => v / Math.hypot(...axis));
    const [c, s] = [Math.cos(by), Math.sin(by)];
    for (const m of side) {
      // Rodrigues: v cos + (n × v) sin + n (n·v)(1 − cos), about the bond through k
      const v = sub(points[m], points[k]);
      const nv = cross(n, v);
      const along = dot(n, v) * (1 - c);
      points[m] = points[k].map((o, q) => o + v[q] * c + nv[q] * s + n[q] * along);
    }
  }
}
