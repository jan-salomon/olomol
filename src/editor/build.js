// Building structures: new bonds in a sensible direction (zigzag chains,
// the biggest gap), rings attached to an atom or fused to a bond, chains,
// and joining atoms that land on top of each other.
import { addAtom, addBond, bondBetween, bondsByAtom, dropLooseCurves, orbitalAngle, otherEnd } from '../model/doc.js';

const DEGREE = Math.PI / 180;
export const MERGE_DISTANCE = 0.25; // a new atom this close to an old one becomes that one

const angleBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
export const snapAngle = (angle, step = 15) => Math.round(angle / (step * DEGREE)) * step * DEGREE;

// Directions (angles) of an atom's bonds.
export function bondAngles(doc, id, byAtom = bondsByAtom(doc, { links: false })) {
  const atom = doc.atoms.get(id);
  return byAtom.get(id).map((bond) => {
    const other = doc.atoms.get(otherEnd(bond, id));
    return Math.atan2(other.y - atom.y, other.x - atom.x);
  });
}

// The directions for a new bond from an atom, the best first: 30° up from
// horizontal for a lone atom (30° down next); for a chain end, 120° from its
// bond, turning away from the bond before it (zigzag), or with no bond
// before it the more horizontal way (a chain runs across the page; equal:
// the upper), the other side next; otherwise the middles of the gaps between
// its bonds, the widest first (a gap under 100° is no place for a bond).
export function sproutAngles(doc, id, byAtom = bondsByAtom(doc, { links: false })) {
  const atom = doc.atoms.get(id);
  const angles = bondAngles(doc, id, byAtom);
  if (!angles.length) return [-30 * DEGREE, 30 * DEGREE];
  if (angles.length === 1) {
    const back = angles[0];
    const options = [back + 120 * DEGREE, back - 120 * DEGREE];
    const neighbour = otherEnd(byAtom.get(id)[0], id);
    const beyond = bondAngles(doc, neighbour, byAtom).filter((a) => angleBetween(a, back + Math.PI) > 1e-3);
    const n = doc.atoms.get(neighbour);
    let first;
    if (beyond.length) {
      // zigzag: on the other side of the neighbour's other bonds
      const far = [n.x + Math.cos(beyond[0]), n.y + Math.sin(beyond[0])];
      const score = (a) => Math.hypot(atom.x + Math.cos(a) - far[0], atom.y + Math.sin(a) - far[1]);
      first = score(options[0]) >= score(options[1]) ? 0 : 1;
    } else {
      const across = (a) => Math.abs(Math.cos(a));
      const flat = across(options[0]) - across(options[1]);
      first = Math.abs(flat) > 1e-6 ? (flat > 0 ? 0 : 1) : Math.sin(options[0]) < Math.sin(options[1]) - 1e-6 ? 0 : 1;
    }
    return [options[first], options[1 - first]];
  }
  const sorted = [...angles].sort((p, q) => p - q);
  const gaps = sorted.map((a, k) => {
    const next = k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + 2 * Math.PI;
    return { gap: next - a, angle: a + (next - a) / 2 };
  });
  // (the widest; among equal ones, the first round from the left, as before)
  const ranked = gaps.map((g, k) => ({ ...g, k })).sort((p, q) => (Math.abs(p.gap - q.gap) > 1e-6 ? q.gap - p.gap : p.k - q.k));
  return ranked.filter((g, k) => k === 0 || g.gap >= 100 * DEGREE).map((g) => g.angle);
}

// The direction for a new bond from an atom (sproutAngles' best); `other`:
// the next best, where there is one (Shift with the drawing tools).
export function sproutAngle(doc, id, byAtom = bondsByAtom(doc, { links: false }), { other = false } = {}) {
  const angles = sproutAngles(doc, id, byAtom);
  return other && angles.length > 1 ? angles[1] : angles[0];
}

// The atom near a point (within MERGE_DISTANCE), or undefined.
export function atomNear(doc, x, y, skip = new Set()) {
  let found;
  let best = MERGE_DISTANCE;
  for (const atom of doc.atoms.values()) {
    if (skip.has(atom.id)) continue;
    const d = Math.hypot(atom.x - x, atom.y - y);
    if (d < best) {
      best = d;
      found = atom.id;
    }
  }
  return found;
}

// A bond from atom `from` to a new atom (or the existing atom near the end
// point) in direction `angle`; `alias`: a label for the new atom (Ph, R).
// Returns { atom, bond }; if the bond exists already, its order changes to
// `order`.
export function bondTo(doc, from, angle, { order = 1, stereo = '', el = 'C', alias = null, length = 1, kind } = {}) {
  const atom = doc.atoms.get(from);
  const x = atom.x + length * Math.cos(angle);
  const y = atom.y + length * Math.sin(angle);
  const existing = atomNear(doc, x, y, new Set([from]));
  const end = existing ?? addAtom(doc, x, y, el, { alias }).id;
  let bond = bondBetween(doc, from, end);
  if (bond) {
    bond.order = order;
    bond.stereo = stereo;
    if (kind) bond.kind = kind;
    else delete bond.kind;
  } else {
    bond = addBond(doc, from, end, order, { stereo, ...(kind && { kind }) });
  }
  return { atom: end, bond: bond.id };
}

// The corners of a regular ring of n atoms with side 1, around `centre`,
// the first corner in direction `start` from the centre.
export function ringCorners(n, centre, start) {
  const radius = 1 / (2 * Math.sin(Math.PI / n));
  return Array.from({ length: n }, (_, k) => {
    const a = start + (2 * Math.PI * k) / n;
    return [centre[0] + radius * Math.cos(a), centre[1] + radius * Math.sin(a)];
  });
}

// Where a free-standing ring of n atoms goes, centred on a point: flat at
// the bottom for odd rings and squares, a corner at the top for six-rings
// and others with an even number (as rings are usually drawn).
export function freeRingCorners(n, centre) {
  const start = n === 4 || n === 8 ? -Math.PI / 2 + Math.PI / n : -Math.PI / 2;
  return ringCorners(n, centre, start);
}

// Adds a ring through the given corner points, reusing atoms that are
// already there (fusing) and bonds that exist. `aromatic`: alternating
// double bonds (benzene), fitted to the double bonds already there.
// Returns the ids of the ring's atoms.
export function addRing(doc, corners, { aromatic = false, separate = false } = {}) {
  // (separate: atoms of its own, even where it lands on others: a ring hung on an atom by a bond)
  const ids = corners.map(([x, y]) => (separate ? null : atomNear(doc, x, y)) ?? addAtom(doc, x, y).id);
  const n = ids.length;
  const pairs = ids.map((id, k) => [id, ids[(k + 1) % n]]);
  const fresh = new Set();
  for (const [a, b] of pairs) if (!bondBetween(doc, a, b)) fresh.add(addBond(doc, a, b).id);
  if (aromatic) {
    // double bonds on every other ring bond, starting so that existing double bonds fit
    const byAtom = bondsByAtom(doc);
    const hasDouble = (id) => byAtom.get(id).some((bond) => bond.order === 2);
    const scoreFor = (offset) => pairs.reduce((score, [a, b], k) => {
      if ((k + offset) % 2) return score;
      const bond = bondBetween(doc, a, b);
      if (bond.order === 2) return score + 2;
      return score + (hasDouble(a) || hasDouble(b) ? -3 : 0);
    }, 0);
    const offset = scoreFor(0) >= scoreFor(1) ? 0 : 1;
    pairs.forEach(([a, b], k) => {
      if ((k + offset) % 2) return;
      const bond = bondBetween(doc, a, b);
      if (fresh.has(bond.id) && !hasDouble(a) && !hasDouble(b)) {
        bond.order = 2;
        byAtom.get(a).push(bond); // so hasDouble sees it (the list is only read here)
      }
    });
  }
  return ids;
}

// Ring corners for a ring of n atoms sharing atom `id` (attached at that
// corner, pointing away from its bonds, or towards `aim`).
export function ringAtAtom(doc, id, n, aim = null) {
  const atom = doc.atoms.get(id);
  const angle = sproutAngle(doc, id);
  const degree = bondAngles(doc, id).length;
  const radius = 1 / (2 * Math.sin(Math.PI / n));
  // a chain end or lone atom becomes a ring corner; more bonds: a spiro ring (`aim`: that way instead)
  const away = aim ?? (degree === 1 ? bondAngles(doc, id)[0] + Math.PI : angle);
  const centre = [atom.x + radius * Math.cos(away), atom.y + radius * Math.sin(away)];
  return ringCorners(n, centre, away + Math.PI);
}

// A ring of n atoms hung on atom `id` by a new bond (a phenyl on it), in
// the direction a new bond would take (or `angle`): { corners (the first is bonded to
// the atom), bond: [x1, y1, x2, y2] }.
export function ringOnAtom(doc, id, n, angle = sproutAngle(doc, id)) {
  const atom = doc.atoms.get(id);
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const radius = 1 / (2 * Math.sin(Math.PI / n));
  const centre = [atom.x + (1 + radius) * c, atom.y + (1 + radius) * s];
  return { corners: ringCorners(n, centre, angle + Math.PI), bond: [atom.x, atom.y, atom.x + c, atom.y + s] };
}

// Ring corners for a ring of n atoms fused to a bond, on the side with less
// drawn on it (`otherSide`: the other one).
export function ringAtBond(doc, bondId, n, otherSide = false) {
  const bond = doc.bonds.get(bondId);
  const a = doc.atoms.get(bond.a);
  const b = doc.atoms.get(bond.b);
  const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normal = [-(b.y - a.y) / length, (b.x - a.x) / length];
  const apothem = 1 / (2 * Math.tan(Math.PI / n));
  // count atoms on each side near the bond
  let side = 0;
  for (const atom of doc.atoms.values()) {
    const d = Math.hypot(atom.x - mid[0], atom.y - mid[1]);
    if (d > 2.5 || atom.id === a.id || atom.id === b.id) continue;
    side += Math.sign((atom.x - mid[0]) * normal[0] + (atom.y - mid[1]) * normal[1]);
  }
  const s = (side > 0 ? -1 : 1) * (otherSide ? -1 : 1);
  const centre = [mid[0] + s * apothem * normal[0], mid[1] + s * apothem * normal[1]];
  const start = Math.atan2(a.y - centre[1], a.x - centre[0]);
  // go round so that the second corner is b
  const corners = ringCorners(n, centre, start);
  const second = corners[1];
  if (Math.hypot(second[0] - b.x, second[1] - b.y) > 0.1) return ringCorners(n, centre, start).map((_, k, all) => all[(n - k) % n]);
  return corners;
}

// Zigzag chain points from a start point towards an end point: atoms 1
// bond apart, alternating 30° to each side of the drag direction (snapped
// to 30°). Returns the points after the start.
export function chainPoints(start, end, firstUp = true) {
  const angle = snapAngle(Math.atan2(end[1] - start[1], end[0] - start[0]), 30);
  const reach = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const step = Math.cos(30 * DEGREE);
  const count = Math.max(1, Math.round(reach / step));
  const points = [];
  let [x, y] = start;
  for (let k = 0; k < count; k++) {
    const a = angle + ((k % 2 === 0) === firstUp ? -30 : 30) * DEGREE;
    x += Math.cos(a);
    y += Math.sin(a);
    points.push([x, y]);
  }
  return points;
}

// Where the atoms of a group go when it is attached to atom `target`:
// `group` is a document with one attachment atom (element '*'); its
// neighbour goes one bond out from the target in the direction a new bond
// would take, the rest follows, mirrored if that bumps into less. Returns
// { atoms: [{ from: group atom id, x, y }], attachment, neighbour } with
// positions for all group atoms but the attachment (which is the target).
// `angle`: another direction for the group (where its label was, or where
// it was dragged). `fused`: the neighbour is the target itself (COOH on the
// end of a chain: its C is that carbon), the group going on along the
// target's one bond (else the way a new bond would take, or `angle`); then
// the neighbour has no position either.
export function groupPlacement(doc, target, group, { angle: direction = null, fused = false } = {}) {
  // (where it attaches: the "*" without a label; an abbreviation's own atom is a "*" with one)
  const attachment = [...group.atoms.values()].find((a) => a.el === '*' && !a.alias) ?? [...group.atoms.values()].find((a) => a.el === '*');
  const link = [...group.bonds.values()].find((b) => b.a === attachment.id || b.b === attachment.id);
  const neighbour = group.atoms.get(link.a === attachment.id ? link.b : link.a);
  const t = doc.atoms.get(target);
  const along = bondAngles(doc, target);
  const angle = direction ?? (fused && along.length === 1 ? along[0] + Math.PI : sproutAngle(doc, target));
  const axis = Math.atan2(neighbour.y - attachment.y, neighbour.x - attachment.x);
  const turn = angle - axis;
  const length = Math.hypot(neighbour.x - attachment.x, neighbour.y - attachment.y) || 1;
  const origin = fused ? neighbour : attachment; // (the group atom that lands on the target)
  const place = (mirror) => [...group.atoms.values()].filter((a) => a !== attachment && a !== origin).map((a) => {
    let [x, y] = [(a.x - origin.x) / length, (a.y - origin.y) / length];
    if (mirror) {
      // reflect across the attachment bond
      const [c, s] = [Math.cos(2 * axis), Math.sin(2 * axis)];
      [x, y] = [c * x + s * y, s * x - c * y];
    }
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    return { from: a.id, x: t.x + c * x - s * y, y: t.y + s * x + c * y };
  });
  const bumps = (atoms) => atoms.reduce((n, p) => n + [...doc.atoms.values()].filter((a) => Math.hypot(a.x - p.x, a.y - p.y) < 0.7).length, 0);
  const [plain, mirrored] = [place(false), place(true)];
  return { atoms: bumps(mirrored) < bumps(plain) ? mirrored : plain, attachment: attachment.id, neighbour: neighbour.id };
}

// Adds a group (see groupPlacement) to the drawing, attached to `target`
// by a new bond, or (fused) with the target becoming its first atom (its
// element, charge... too). Returns the new atom ids.
export function attachGroup(doc, target, group, options = {}) {
  const { atoms, attachment, neighbour } = groupPlacement(doc, target, group, options);
  const ids = new Map([[options.fused ? neighbour : attachment, target]]);
  if (options.fused) {
    const { id, x, y, ...rest } = group.atoms.get(neighbour);
    Object.assign(doc.atoms.get(target), rest);
  }
  for (const { from, x, y } of atoms) {
    const { id, ...rest } = group.atoms.get(from);
    ids.set(from, addAtom(doc, x, y, rest.el, { ...rest, x, y }).id);
  }
  for (const bond of group.bonds.values()) {
    if (!ids.has(bond.a) || !ids.has(bond.b)) continue; // (fused: the bond to the attachment is the target's own)
    addBond(doc, ids.get(bond.a), ids.get(bond.b), bond.order, { stereo: bond.stereo });
  }
  return [...ids.values()].filter((id) => id !== target);
}

// Atom `id` joined into atom `target` (dropped onto it): its bonds moved over (one that would double a bond there
// goes, a curved arrow on it then on that bond), and all that refers to it: curved arrows' ends (a new bond's atom
// too), texts on its anchors, ring fills, orbitals on it or measured from it, brackets made round it. Returns how to
// undo it (for a drag that moves on: select.js park).
export function joinAtom(doc, id, target) {
  const undo = [];
  const set = (object, key, value) => {
    const [had, old] = [key in object, object[key]];
    undo.push(() => { if (had) object[key] = old; else delete object[key]; });
    object[key] = value;
  };
  const replaced = new Map(); // a bond gone: the bond there in its place (or none)
  for (const bond of [...doc.bonds.values()]) {
    if (bond.a !== id && bond.b !== id) continue;
    const other = otherEnd(bond, id);
    if (other === target || bondBetween(doc, other, target)) {
      replaced.set(bond.id, other === target ? null : bondBetween(doc, other, target).id);
      doc.bonds.delete(bond.id);
      undo.push(() => doc.bonds.set(bond.id, bond));
    } else set(bond, bond.a === id ? 'a' : 'b', target);
  }
  for (const curve of doc.curves.values()) {
    for (const end of [curve.from, curve.to]) {
      if (end.atom === id) set(end, 'atom', target);
      if (end.newBond === id) set(end, 'newBond', target); // (an arrow to a new bond: its other atom)
      if (replaced.get(end.bond) != null) set(end, 'bond', replaced.get(end.bond));
    }
  }
  for (const text of doc.texts.values()) if (text.anchor === id) set(text, 'anchor', target);
  // a ring it was in keeps its fill if it is still a ring
  for (const fill of doc.fills.values()) if (fill.atoms.includes(id)) set(fill, 'atoms', fill.atoms.map((x) => (x === id ? target : x)));
  // an orbital on it goes on the atom it joins, pointing as before; one measured from it, from that atom (on the same spot)
  for (const orbital of doc.orbitals?.values() ?? []) {
    const onTarget = (orbital.atom === id ? target : orbital.atom) === (orbital.ref === id ? target : orbital.ref);
    if (onTarget) {
      set(orbital, 'angle', orbitalAngle(doc, orbital));
      set(orbital, 'ref', null);
    } else if (orbital.ref === id) set(orbital, 'ref', target);
    if (orbital.atom === id) set(orbital, 'atom', target);
  }
  for (const bracket of doc.brackets?.values() ?? []) {
    if (bracket.atoms?.includes(id)) set(bracket, 'atoms', [...new Set(bracket.atoms.map((x) => (x === id ? target : x)))]);
  }
  // (and the groups it was in: the molecule it is part of now is in them, a label drawn out stays in its group)
  for (const group of doc.groups?.values() ?? []) {
    if (group.members.includes(id)) set(group, 'members', [...new Set(group.members.map((x) => (x === id ? target : x)))]);
  }
  const atom = doc.atoms.get(id);
  doc.atoms.delete(id);
  undo.push(() => doc.atoms.set(id, atom));
  return () => undo.reverse().forEach((step) => step());
}

// Joins atoms that sit on top of others (after a move): each such atom is
// replaced by the one it landed on (joinAtom). `moved`: ids of
// atoms that may have landed. Returns how many were joined.
export function mergeLanded(doc, moved) {
  let joined = 0;
  const movedSet = new Set(moved);
  for (const id of moved) {
    const atom = doc.atoms.get(id);
    if (!atom) continue;
    const target = atomNear(doc, atom.x, atom.y, movedSet);
    if (target === undefined) continue;
    joinAtom(doc, id, target);
    joined += 1;
  }
  if (joined) dropLooseCurves(doc); // (an arrow on a bond between the two atoms: no bond left)
  return joined;
}
