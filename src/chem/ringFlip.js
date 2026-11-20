// The ring flip of a cyclohexane chair (axial ⇄ equatorial), for chairs
// drawn as the templates draw them (chair.js) or by hand. Those are plain
// atoms and bonds, nothing marks them as chairs: a chair is a ring drawn as
// every chair is, a zigzag hexagon (see readChair), and it is read by
// fitting its six ring atoms to the templates' chair (any turn, size, first
// atom and direction round the ring). Each group on a ring atom sits in the slot it
// is nearest to, axial or equatorial, and after the flip it is in the other
// slot on the same face of the ring (axial up becomes equatorial up), so
// cis and trans, R and S and D and L stay as they were; it turns as one
// piece about its ring atom.
//
// The flipped chair is the chair mirrored left to right, its atoms swapped
// within each pair (the two tips, the two at the back, the two in front):
// each atom stays on its side of the ring, and its axial group becomes
// equatorial where it is. (Mirroring the drawing top to bottom instead
// would swap the back and the front edge: the mirror image.)
import { bondsByAtom, otherEnd } from '../model/doc.js';
import { chairCorners } from './chair.js';
import { cyclohexaneNewmanShape, isEndOn } from './newman.js';

// A chair drawn by hand (with the bond tool's 15° or 30° steps, as books draw them) is a zigzag hexagon
// like the templates' but not the same: 0.07 to 0.17 off it (rms, in bond lengths of the fitted chair; a
// regular hexagon is 0.62 off, the boat 0.56). At most MAX_OFF off it, and its best reading better than
// any other by CLEAR: else it shows no one chair (tips as blunt as the corners beside them, 75° and more,
// fit two readings almost as well).
const MAX_OFF = 0.3;
const CLEAR = 0.15;
// opposite edges parallel within this, as every chair's are (a boat's aren't)
const PARALLEL = 15 * Math.PI / 180;

// The chair in canvas directions (y down), ring order: 0 the raised left
// tip, 1 and 2 the back edge, 3 the lowered right tip, 4 and 5 the front
// edge; up[k]: +1 where the axial bond goes up. The other chair is its
// mirror image, top to bottom.
function shape(flip) {
  const { corners, up } = chairCorners(flip);
  return { points: corners.map(([x, y]) => [x, -y]), up };
}
const SHAPES = [shape(false), shape(true)];
const PARTNER = [3, 2, 1, 0, 5, 4]; // the atom whose place each one takes, mirrored
const BOAT_LIFT = 0.25; // the edges of the boat between the chairs, above halfway
const UPRIGHT = 1e-3; // (see fitChair)

// complex numbers as [re, im]
const mul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
const div = ([a, b], [c, d]) => {
  const n = c * c + d * d;
  return [(a * c + b * d) / n, (b * c - a * d) / n];
};
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const plus = (p, q) => [p[0] + q[0], p[1] + q[1]];
const lerp = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
const norm = (v) => {
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
};
const mean = (ps) => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
const angle = (v) => Math.atan2(v[1], v[0]);
const turn = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const smooth = (x) => x * x * (3 - 2 * x);

// The best fit of six points (ring order) to a chair: { k (the chair's
// corner of each point), points, up (of the chair, by corner), a, b
// (canvas = a·chair + b, complex), off (rms, in bond lengths), rival (the
// next best reading's off: one that isn't the best turned half round) }.
export function fitChair(positions) {
  const centre = mean(positions);
  const p = positions.map((q) => sub(q, centre));
  let best = null;
  const all = [];
  for (const { points, up } of SHAPES) {
    const middle = mean(points);
    for (let start = 0; start < 6; start++) {
      for (const way of [1, -1]) {
        const k = [0, 1, 2, 3, 4, 5].map((i) => (start + way * i + 12) % 6);
        const q = k.map((c) => sub(points[c], middle));
        // the turn and size that fit best: a = Σ p·conj(q) / Σ |q|²
        let [re, im, qq] = [0, 0, 0];
        p.forEach(([x, y], i) => {
          const [u, v] = q[i];
          re += x * u + y * v;
          im += y * u - x * v;
          qq += u * u + v * v;
        });
        const a = [re / qq, im / qq];
        const size = Math.hypot(...a);
        const rest = p.reduce((s, pi, i) => s + Math.hypot(...sub(pi, mul(a, q[i]))) ** 2, 0);
        const off = Math.sqrt(rest / 6) / size;
        // the drawn chair is the same turned half round (its tips and edges swapped), so every
        // chair fits twice as well: the fit nearer upright wins (its up is up on the screen)
        const score = off + UPRIGHT * (1 - a[0] / size);
        all.push({ k, points, off });
        if (!best || score < best.score) best = { k, points, up, a, b: sub(centre, mul(a, middle)), off, score };
      }
    }
  }
  const twin = (r) => r.points === best.points && r.k.every((c, i) => c === best.k[i] || c === (best.k[i] + 3) % 6);
  best.rival = Math.min(...all.filter((r) => !twin(r)).map((r) => r.off));
  return best;
}

// Is the ring drawn as a chair is, by hand or by the templates: a zigzag hexagon, its opposite edges
// parallel (PARALLEL) and about as long, two opposite corners turning the other way from the other four
// (where the long edges meet the tips' edges)? A flat ring, a Haworth projection too, turns one way all round.
function zigzag(positions) {
  const edges = positions.map((q, i) => sub(positions[(i + 1) % 6], q));
  for (let i = 0; i < 3; i++) {
    const [e, f] = [edges[i], edges[i + 3]];
    const [m, n] = [Math.hypot(...e), Math.hypot(...f)];
    if (!m || !n || Math.max(m / n, n / m) > 1.5) return false;
    if (Math.acos(Math.max(-1, Math.min(1, -(e[0] * f[0] + e[1] * f[1]) / (m * n)))) > PARALLEL) return false;
  }
  const turns = edges.map((e, i) => Math.sign(e[0] * edges[(i + 1) % 6][1] - e[1] * edges[(i + 1) % 6][0]));
  const odd = [0, 1, 2, 3, 4, 5].filter((i) => turns[i] !== turns[(i + 1) % 6] && turns[i] !== turns[(i + 5) % 6]);
  return odd.length === 2 && odd[1] - odd[0] === 3;
}

// The axial and equatorial directions at corner c of a chair (its points
// and up, in the chair's own frame): equatorial bonds parallel to the ring
// bonds one removed, pointing out of the ring.
function slots(points, up, c) {
  const axial = [0, -up[c]];
  let equatorial = norm(sub(points[(c + 2) % 6], points[(c + 1) % 6]));
  const out = sub(points[c], mean(points));
  if (out[0] * equatorial[0] + out[1] * equatorial[1] < 0) equatorial = [-equatorial[0], -equatorial[1]];
  return { axial, equatorial };
}

// A chair, drawn as the templates draw it or by hand, read: { error } ('shape': not a
// zigzag hexagon, or not one chair clearly (see MAX_OFF); 'bonds': a double bond, a wedge or a bond
// that isn't one in the ring; 'fused': fused, bridged or spiro rings;
// 'crowded': two groups in one slot), or { fit (see fitChair), groups: per
// group on a ring atom { ring (its ring atom), corner (the ring atom's),
// first (the group's atom on the ring), slot ('axial' or 'equatorial'),
// members (all its atoms), bondVector (as drawn, ring atom to first) } }.
// `ring`: six atom ids in ring order. `halfChair`: a ring with one double bond drawn in a chair's shape too (a
// cyclohexene's half-chair, as an E2 product is drawn), read for its stereo (chairModel) only: it isn't a
// chair to flip or turn.
export function readChair(doc, ring, byAtom = bondsByAtom(doc), { halfChair = false } = {}) {
  if (ring.length !== 6 || !ring.every((id) => doc.atoms.has(id))) return { error: 'shape' };
  const inRing = new Set(ring);
  let doubles = 0;
  for (let i = 0; i < 6; i++) {
    const bond = byAtom.get(ring[i]).find((b) => otherEnd(b, ring[i]) === ring[(i + 1) % 6]);
    if (!bond || bond.kind || !['', 'perspective', undefined].includes(bond.stereo)) return { error: 'bonds' };
    if (bond.order === 2 && halfChair && !bond.delocalized && ++doubles === 1) continue;
    if (bond.order !== 1) return { error: 'bonds' };
  }
  const positions = ring.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]);
  if (!zigzag(positions)) return { error: 'shape' };
  const fit = fitChair(positions);
  if (fit.off > MAX_OFF || fit.rival - fit.off < CLEAR) return { error: 'shape', off: fit.off };
  const { k, points, up, a } = fit;
  // the groups on each ring atom: the atoms reached from it without
  // passing the ring (not by hydrogen bonds or links: those only stretch)
  const groups = [];
  const covalentish = (bond) => bond.kind !== 'hbond' && bond.kind !== 'link';
  for (let i = 0; i < 6; i++) {
    const id = ring[i];
    const c = k[i];
    const here = { axial: 0, equatorial: 0 };
    for (const bond of byAtom.get(id)) {
      const first = otherEnd(bond, id);
      if (inRing.has(first) || !covalentish(bond)) continue;
      const members = new Set([first]);
      const stack = [first];
      while (stack.length) {
        const atom = stack.pop();
        for (const next of byAtom.get(atom)) {
          if (!covalentish(next)) continue;
          const to = otherEnd(next, atom);
          // back to the ring other than by the bond it hangs on: fused, bridged or spiro
          if (inRing.has(to)) {
            if (next !== bond) return { error: 'fused' };
            continue;
          }
          if (!members.has(to)) {
            members.add(to);
            stack.push(to);
          }
        }
      }
      const atom = doc.atoms.get(id);
      const end = doc.atoms.get(first);
      const bondVector = [end.x - atom.x, end.y - atom.y];
      const inChair = norm(div(bondVector, a)); // the bond's direction in the chair's frame
      const { axial, equatorial } = slots(points, up, c);
      const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
      const slot = dot(inChair, axial) >= dot(inChair, equatorial) ? 'axial' : 'equatorial';
      here[slot] += 1;
      if (here[slot] > 1) return { error: 'crowded' };
      groups.push({ ring: id, corner: c, first, slot, members: [...members], bondVector });
    }
  }
  const atoms = [...ring, ...groups.flatMap((g) => g.members)];
  if (new Set(atoms).size !== atoms.length) return { error: 'fused' };
  return { fit, groups };
}

// The places left free on a chair's ring atoms, for new bonds (Draw the H): Map ring atom -> [{ slot
// ('equatorial' first, then 'axial'), x, y (the new atom's place: equatorial as far as a ring bond is
// long, axial 0.9 of it, as the templates draw them) }], or null if `ring` isn't read as a chair.
export function freeChairSlots(doc, ring, byAtom = bondsByAtom(doc)) {
  const chair = readChair(doc, ring, byAtom);
  if (chair.error) return null;
  const { k, points, up, a } = chair.fit;
  const at = ring.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]);
  const length = at.reduce((s, p, i) => s + Math.hypot(...sub(at[(i + 1) % 6], p)), 0) / 6;
  const free = new Map();
  ring.forEach((id, i) => {
    const taken = new Set(chair.groups.filter((g) => g.ring === id).map((g) => g.slot));
    const directions = slots(points, up, k[i]);
    free.set(id, ['equatorial', 'axial'].filter((slot) => !taken.has(slot)).map((slot) => {
      const [x, y] = plus(at[i], mul(norm(mul(a, directions[slot])), [slot === 'axial' ? 0.9 * length : length, 0]));
      return { slot, x, y };
    }));
  });
  return free;
}

// --- what a chair drawing shows in 3D ---
//
// The drawn chair is a real chair seen a little from above (14.5°, rms 0.14 off; fitted once): its lower
// long edge in front, its upper one at the back, the tips halfway; an axial bond pointing up leans towards
// the viewer, one pointing down away; an equatorial bond runs as the ring bond one removed from it does,
// so in depth too. DEPTH: each corner's depth (towards the viewer), in the drawn chair's units, for the
// chair as chairCorners draws it; the other chair is the drawn one turned half round about the horizontal
// (y and depth the other way). LEAN: depth per drawn length of an axial bond pointing up (tan 14.5°).
const DEPTH = [-0.185, -1.126, -0.802, 0.185, 1.126, 0.802];
const LEAN = 0.26;

// The chairs among the given atoms (`atomIds`, or all) drawn as the templates draw them, each read as the
// 3D chair it shows: { chairs: [{ ring, fit, groups, at }] (see readChair; `at`: Map atom id -> [x, y,
// depth] for its ring atoms and its groups, x and y as drawn, depth towards the viewer), at: all of them in
// one map }. Several chairs in one molecule (a disaccharide): each chair's groups stop at another chair's
// ring, which keeps its own depths, and an atom between two chairs (the glycosidic O) has each chair's depth
// in that chair's map (the first chair's in `at`). Chairs that readChair refuses (fused, bridged, crowded)
// are left out: nothing is guessed for them. A cyclohexene drawn in a chair's shape (a half-chair) is read as its
// chair: its sp3 ring atoms' groups on the faces the chair puts them on.
export function chairModel(doc, atomIds = null, byAtom = bondsByAtom(doc), rings = null) {
  const wanted = atomIds ? new Set(atomIds) : null;
  const read = [];
  const seen = new Set();
  for (const ring of rings ?? []) {
    if (ring.length !== 6 || (wanted && !ring.every((id) => wanted.has(id)))) continue;
    const key = [...ring].sort((p, q) => p - q).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const chair = readChair(doc, ring, byAtom, { halfChair: true });
    if (!chair.error) read.push({ ring, ...chair });
  }
  const ringAtoms = new Set(read.flatMap((c) => c.ring));
  const covalentish = (bond) => bond.kind !== 'hbond' && bond.kind !== 'link';
  // a group's atoms from its first one, not into a chair's ring
  const reach = (first) => {
    const members = new Set([first]);
    const stack = ringAtoms.has(first) ? [] : [first];
    while (stack.length) {
      const atom = stack.pop();
      for (const bond of byAtom.get(atom)) {
        const to = otherEnd(bond, atom);
        if (!covalentish(bond) || ringAtoms.has(to) || members.has(to)) continue;
        members.add(to);
        stack.push(to);
      }
    }
    return members;
  };
  const at = new Map();
  const chairs = [];
  for (const chair of read) {
    const { ring, fit, groups } = chair;
    const { k, points, up, a } = fit;
    const own = new Map();
    const size = Math.hypot(...a);
    const depth = fit.points === SHAPES[0].points ? DEPTH : DEPTH.map((d) => -d);
    ring.forEach((id, i) => {
      const atom = doc.atoms.get(id);
      own.set(id, [atom.x, atom.y, depth[k[i]] * size]);
    });
    for (const g of groups) {
      const c = g.corner;
      const length = Math.hypot(...g.bondVector);
      let perLength;
      if (g.slot === 'axial') perLength = LEAN * up[c];
      else {
        // along the ring bond one removed, out of the ring (as slots has it)
        const [q, r] = [points[(c + 1) % 6], points[(c + 2) % 6]];
        const out = sub(points[c], mean(points));
        const along = sub(r, q);
        const sign = out[0] * along[0] + out[1] * along[1] < 0 ? -1 : 1;
        perLength = (sign * (depth[(c + 2) % 6] - depth[(c + 1) % 6])) / Math.hypot(...along);
      }
      const z = own.get(g.ring)[2] + perLength * length;
      // (the rest of the group at its first atom's depth: it lies as drawn, its own wedges kept)
      for (const m of reach(g.first)) {
        const atom = doc.atoms.get(m);
        own.set(m, [atom.x, atom.y, z]);
      }
    }
    chairs.push({ ...chair, at: own });
  }
  // (every chair's ring as that chair has it; the rest from the first chair that reaches it)
  for (const { ring, at: own } of chairs) for (const id of ring) at.set(id, own.get(id));
  for (const { at: own } of chairs) for (const [id, point] of own) if (!at.has(id)) at.set(id, point);
  return { chairs, at };
}

// Do these bonds of an atom (its other three, [dx, dy] each, in the page) stand round it, no two of them more
// than half a turn apart round it? Only then is a wedge on its fourth bond read one way: with the three all on
// one side of the atom, RDKit may read it either way (a chair's tip, a Haworth ring atom with both its groups
// drawn, which point opposite ways).
export function standsRound(vectors) {
  const angles = vectors.map(([dx, dy]) => Math.atan2(dy, dx)).sort((p, q) => p - q);
  return angles.every((angle, i) => (i === angles.length - 1 ? angles[0] + 2 * Math.PI : angles[i + 1]) - angle < Math.PI - 0.05);
}

// Wedges for the chairs' R/S, for files and for reading the molecule (SMILES, InChI, Info): on each ring
// atom with groups, one of its groups' bonds, a wedge if that group is in front of it in the chair and a
// hashed wedge if behind, kept only where the wedge read in the page (the group towards or away from the
// viewer, the others flat) gives the handedness the 3D chair has. A ring atom with two groups and so four
// bonds: its wedge only on a bond whose other three stand round it in the page (no two of them more than half
// a turn apart round it), as a wedge with the other three all on one side of the ring atom is read either way
// (RDKit read the other R/S): at a chair's two tips, whichever group carries it, its other bonds are all on one
// side, so there the wedge goes on one of its ring bonds (in the file, not in the drawing); with no such bond at
// all, no wedge: no R/S rather than a wrong one. Map bond id ->
// { stereo, from (the ring atom), hydrogens (true where the ring atom's groups are only drawn hydrogens: no
// stereocentre, wanted only to tell its axial H from its equatorial one) }. A ring atom with a wedge drawn on it
// is left as drawn.
export function chairStereo(doc, rings, byAtom = bondsByAtom(doc)) {
  const wedges = new Map();
  const { chairs } = chairModel(doc, null, byAtom, rings);
  const volume = ([u, v, w]) => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
  for (const { ring, at } of chairs) {
    const inRing = new Set(ring);
    for (const c of ring) {
      const bonds = byAtom.get(c).filter((b) => !b.kind && b.order === 1);
      if (bonds.length < 3 || byAtom.get(c).some((b) => b.stereo && b.stereo !== 'perspective')) continue;
      const from = (id) => at.get(id).map((v, i) => v - at.get(c)[i]);
      const depth = (id) => from(id)[2];
      const neighbours = bonds.map((b) => otherEnd(b, c));
      const groups = neighbours.filter((id) => !inRing.has(id));
      const hydrogens = groups.every((id) => doc.atoms.get(id).el === 'H' && !doc.atoms.get(id).isotope);
      // a group other than H first, then the one that stands out most
      const isH = (b) => Number(doc.atoms.get(otherEnd(b, c)).el === 'H');
      const order = bonds.filter((b) => !inRing.has(otherEnd(b, c)))
        .sort((p, q) => isH(p) - isH(q) || Math.abs(depth(otherEnd(q, c))) - Math.abs(depth(otherEnd(p, c))));
      // (four bonds: the other three round the ring atom in the page, else the wedge is read either way)
      const around = (b) => bonds.length !== 4 || standsRound(bonds.filter((x) => x !== b).map((x) => from(otherEnd(x, c))));
      // (none such: no wedge, so no R/S read for it, rather than one that may be the wrong one)
      const ringBonds = bonds.filter((b) => inRing.has(otherEnd(b, c)));
      const tries = [...order.filter(around), ...ringBonds.filter(around)]
        .filter((b) => !wedges.has(b.id)); // (a ring bond the ring atom at its other end has taken already)
      for (const b of tries) {
        const d = otherEnd(b, c);
        const three = [d, ...neighbours.filter((x) => x !== d).slice(0, 2)];
        const page = volume(three.map((i) => [from(i)[0], from(i)[1], i === d ? 1 : 0]));
        const real = volume(three.map(from));
        if (Math.abs(page) < 0.05 || Math.abs(real) < 1e-3) continue;
        // (a wedge says the group is on the viewer's side of the ring atom's other bonds, which for an axial
        // group, nearly in the page, can be the hashed one even where it leans a little towards the viewer)
        wedges.set(b.id, { stereo: Math.sign(page) === Math.sign(real) ? 'wedge' : 'hash', from: c, hydrogens });
        break;
      }
    }
  }
  return wedges;
}

// A ring flip of the chair `ring` (six atom ids in ring order): { error }
// (see readChair), or { atoms (all that move), at(t): Map atom id -> [x, y]
// at t from 0 (as drawn) to 1 (the other chair), through a boat: the raised
// tip drops first, then the lowered one rises (never through a flat ring) }.
export function ringFlip(doc, ring) {
  if (ring.length === 6 && ring.some((id, i) => isEndOnPair(doc, id, ring[(i + 1) % 6]))) return newmanRingFlip(doc, ring);
  const read = readChair(doc, ring);
  if (read.error) return read;
  const { fit } = read;
  const { k, points, up, a, b } = fit;
  const place = (q) => plus(mul(a, q), b); // chair frame -> canvas
  const xs = points.map((q) => q[0]);
  const mirror = ([x, y]) => [Math.min(...xs) + Math.max(...xs) - x, y];
  const flipped = PARTNER.map((c) => mirror(points[c])); // by corner
  const flippedUp = PARTNER.map((c) => up[c]);
  // the boat between: the raised tip already down where it ends, the
  // lowered one not yet up, the four edge atoms halfway and a little
  // higher, so that both tips hang below them (y is down)
  const raised = up[0] > 0 ? 0 : 3;
  const boat = points.map((q, c) => {
    if (c === raised) return flipped[c];
    if (c === PARTNER[raised]) return q;
    return plus(lerp(q, flipped[c], 0.5), [0, -BOAT_LIFT]);
  });
  const groups = read.groups.map((g) => {
    const after = slots(flipped, flippedUp, g.corner)[g.slot === 'axial' ? 'equatorial' : 'axial'];
    let turnBy = angle(mul(a, after)) - angle(g.bondVector);
    turnBy = Math.atan2(Math.sin(turnBy), Math.cos(turnBy)); // the shorter way round
    const atom = doc.atoms.get(g.ring);
    // (where everything is now, kept: an animation moves the atoms of `doc` while it runs)
    return { ring: g.ring, corner: g.corner, turnBy, members: g.members, origin: [atom.x, atom.y], from: new Map(g.members.map((m) => [m, [doc.atoms.get(m).x, doc.atoms.get(m).y]])) };
  });
  const atoms = [...ring, ...groups.flatMap((g) => g.members)];
  const at = (t) => {
    const out = new Map();
    const t1 = smooth(Math.min(1, Math.max(0, 2 * t)));
    const t2 = smooth(Math.min(1, Math.max(0, 2 * t - 1)));
    const corner = (c) => place(t <= 0.5 ? lerp(points[c], boat[c], t1) : lerp(boat[c], flipped[c], t2));
    ring.forEach((id, i) => out.set(id, corner(k[i])));
    for (const g of groups) {
      // a tip's groups turn while it moves; the edges' all along
      const share = g.corner === raised ? t1 : g.corner === PARTNER[raised] ? t2 : smooth(Math.min(1, Math.max(0, t)));
      const [ox, oy] = g.origin;
      const centre = out.get(g.ring);
      for (const m of g.members) {
        const [x, y] = g.from.get(m);
        out.set(m, plus(centre, turn([x - ox, y - oy], g.turnBy * share)));
      }
    }
    return out;
  };
  return { atoms, at, off: fit.off };
}

// A chair turned a third of a turn about its axis (`way` 1: anticlockwise seen from above, −1 clockwise),
// drawn in the templates' shape where it stands: each ring atom two corners on, onto the corner of its own
// height, its groups turning with it, so axial stays axial and up stays up (the same molecule and the same
// conformation, seen turned; the ring flip gives the other conformation). While it turns, each ring atom goes
// round the ellipse its height's three corners lie on, as a chair turning in space would.
// { atoms, at(t), off } as ringFlip, or { error } (readChair's; 'newman' for cyclohexane seen along two bonds).
export function chairTurn(doc, ring, way = 1) {
  if (ring.length === 6 && ring.some((id, i) => isEndOnPair(doc, id, ring[(i + 1) % 6]))) return { error: 'newman' };
  const read = readChair(doc, ring);
  if (read.error) return read;
  const { k, points, up, a, b } = read.fit;
  const place = (q) => plus(mul(a, q), b); // chair frame -> canvas
  // each height's three corners (0, 2, 4 and 1, 3, 5), anticlockwise as the drawing shows them seen from above
  // (y up): an ellipse through them, each corner at its angle on it
  const middle = mean(points);
  const round = (c) => Math.atan2(middle[1] - points[c][1], points[c][0] - middle[0]);
  const ellipse = new Map();
  for (const start of [0, 1]) {
    const three = [start, start + 2, start + 4].sort((p, q) => round(p) - round(q));
    const m = mean(three.map((c) => points[c]));
    const u = sub(points[three[0]], m);
    const c120 = Math.cos((2 * Math.PI) / 3);
    const s120 = Math.sin((2 * Math.PI) / 3);
    const v = sub(sub(points[three[1]], m), [u[0] * c120, u[1] * c120]).map((x) => x / s120);
    three.forEach((c, j) => ellipse.set(c, { m, u, v, angle: (j * 2 * Math.PI) / 3 }));
  }
  const on = (c, by) => {
    const { m, u, v, angle: at } = ellipse.get(c);
    return plus(m, plus([u[0] * Math.cos(at + by), u[1] * Math.cos(at + by)], [v[0] * Math.sin(at + by), v[1] * Math.sin(at + by)]));
  };
  // where each corner goes: a third of a turn on round its ellipse
  const third = (way * 2 * Math.PI) / 3;
  const next = (c) => [...ellipse].find(([d, e]) => e.m === ellipse.get(c).m && Math.abs(Math.cos(e.angle - ellipse.get(c).angle - third) - 1) < 1e-6)[0];
  const groups = read.groups.map((g) => {
    const after = slots(points, up, next(g.corner))[g.slot];
    let turnBy = angle(mul(a, after)) - angle(g.bondVector);
    turnBy = Math.atan2(Math.sin(turnBy), Math.cos(turnBy)); // the shorter way round
    const atom = doc.atoms.get(g.ring);
    return { ring: g.ring, turnBy, members: g.members, origin: [atom.x, atom.y], from: new Map(g.members.map((m) => [m, [doc.atoms.get(m).x, doc.atoms.get(m).y]])) };
  });
  const atoms = [...ring, ...groups.flatMap((g) => g.members)];
  const at = (t) => {
    const out = new Map();
    const share = smooth(Math.min(1, Math.max(0, t)));
    ring.forEach((id, i) => out.set(id, place(on(k[i], third * share))));
    for (const g of groups) {
      const [ox, oy] = g.origin;
      const centre = out.get(g.ring);
      for (const m of g.members) {
        const [x, y] = g.from.get(m);
        out.set(m, plus(centre, turn([x - ox, y - oy], g.turnBy * share)));
      }
    }
    return out;
  };
  return { atoms, at, off: read.fit.off };
}

// --- the ring flip of cyclohexane seen along two bonds (Newman projections, newman.js) ---

const endOnBond = (doc, p, q) => [...doc.bonds.values()].find((b) => ((b.a === p && b.b === q) || (b.a === q && b.b === p)) && isEndOn(doc, b));
const isEndOnPair = (doc, p, q) => Boolean(endOnBond(doc, p, q));
// Is this six-membered ring cyclohexane seen along a bond (a Newman projection), not a ring drawn flat?
export const seenEndOn = (doc, ring) => ring.length === 6 && ring.some((id, i) => isEndOnPair(doc, id, ring[(i + 1) % 6]));
const NEWMAN_SHAPES = [false, true].map((flip) => ({ flip, ...cyclohexaneNewmanShape(flip) }));
const NEWMAN_TOLERANCE = 0.12; // rms of the four points off the template's, in its C1–C5 distances

// The ring flip of cyclohexane drawn as the template draws it: seen along C1–C2 and C5–C4, C6 between the
// front carbons and C3 between the back ones. The other chair seen the same way: the projections stay,
// C3 and C6 change sides and each group on the four carbons seen end on goes into the other slot on its
// face (axial up to equatorial up), turned as one piece about its carbon. Same results as ringFlip; more
// errors: 'shape' (not drawn as the template, any turn, size or mirror image), 'bridge' (groups on C3 or C6).
function newmanRingFlip(doc, ring) {
  const byAtom = bondsByAtom(doc);
  const inRing = new Set(ring);
  for (let i = 0; i < 6; i++) {
    const bond = byAtom.get(ring[i]).find((b) => otherEnd(b, ring[i]) === ring[(i + 1) % 6]);
    if (!bond || bond.kind || bond.order !== 1 || (bond.stereo && bond.stereo !== 'perspective')) return { error: 'bonds' };
  }
  // the ring as C1…C6: C1 the front atom of one end-on bond, C2 its back one, C3, then C4 and C5 the other
  // end-on bond's back and front atoms, C6; either end-on bond as C1–C2
  const orders = [];
  for (let start = 0; start < 6; start++) {
    for (const way of [1, -1]) {
      const seq = Array.from({ length: 6 }, (_, k) => ring[(start + way * k + 12) % 6]);
      const [first, second] = [endOnBond(doc, seq[0], seq[1]), endOnBond(doc, seq[3], seq[4])];
      if (first && second && first.a === seq[0] && second.a === seq[4]) orders.push(seq);
    }
  }
  if (!orders.length) return { error: 'shape' };
  const at = (id) => [doc.atoms.get(id).x, doc.atoms.get(id).y];
  // the best fit (canvas = a·template + b, complex; the template mirrored first where `mirror`)
  let best = null;
  for (const seq of orders) {
    const drawn = [0, 2, 4, 5].map((k) => at(seq[k]));
    const centre = mean(drawn);
    const p = drawn.map((q) => sub(q, centre));
    for (const shape of NEWMAN_SHAPES) {
      for (const mirror of [false, true]) {
        const m = ([x, y]) => (mirror ? [x, -y] : [x, y]);
        const template = [0, 2, 4, 5].map((k) => m(shape.ring[k]));
        const middle = mean(template);
        const q = template.map((t) => sub(t, middle));
        let [re, im, qq] = [0, 0, 0];
        p.forEach(([x, y], i) => {
          const [u, v] = q[i];
          re += x * u + y * v;
          im += y * u - x * v;
          qq += u * u + v * v;
        });
        const a = [re / qq, im / qq];
        const size = Math.hypot(...a);
        const off = Math.sqrt(p.reduce((s, pi, i) => s + Math.hypot(...sub(pi, mul(a, q[i]))) ** 2, 0) / 4) / (size * Math.hypot(...sub(shape.ring[4], shape.ring[0])));
        if (!best || off < best.off) best = { seq, shape, mirror, m, a, b: sub(centre, mul(a, middle)), off };
      }
    }
  }
  if (best.off > NEWMAN_TOLERANCE) return { error: 'shape', off: best.off };
  const { seq, shape, m, a, b } = best;
  const other = NEWMAN_SHAPES.find((s) => s !== shape);
  const place = (t) => plus(mul(a, m(t)), b);
  const toPage = (dir) => mul(a, m(dir)); // a template direction on the canvas (not a unit vector)
  // C3 and C6 carry nothing but the ring (their groups would be seen from the side)
  for (const k of [2, 5]) if (byAtom.get(seq[k]).some((bond) => !inRing.has(otherEnd(bond, seq[k])) && bond.kind !== 'hbond' && bond.kind !== 'link')) return { error: 'bridge' };
  const covalentish = (bond) => bond.kind !== 'hbond' && bond.kind !== 'link';
  const groups = [];
  for (const k of [0, 1, 3, 4]) {
    const id = seq[k];
    const here = { axial: 0, equatorial: 0 };
    for (const bond of byAtom.get(id)) {
      const first = otherEnd(bond, id);
      if (inRing.has(first) || !covalentish(bond)) continue;
      const members = new Set([first]);
      const stack = [first];
      while (stack.length) {
        const atom = stack.pop();
        for (const next of byAtom.get(atom)) {
          if (!covalentish(next)) continue;
          const to = otherEnd(next, atom);
          if (inRing.has(to)) {
            if (next !== bond) return { error: 'fused' };
            continue;
          }
          if (!members.has(to)) {
            members.add(to);
            stack.push(to);
          }
        }
      }
      const vector = sub(at(first), at(id));
      const along = (dir) => {
        const d = norm(toPage(dir));
        return d[0] * norm(vector)[0] + d[1] * norm(vector)[1];
      };
      const slot = along(shape.slots[k].axial.dir) >= along(shape.slots[k].equatorial.dir) ? 'axial' : 'equatorial';
      here[slot] += 1;
      if (here[slot] > 1) return { error: 'crowded' };
      const { face } = shape.slots[k][slot];
      const target = other.slots[k].axial.face === face ? other.slots[k].axial : other.slots[k].equatorial;
      let turnBy = angle(toPage(target.dir)) - angle(vector);
      turnBy = Math.atan2(Math.sin(turnBy), Math.cos(turnBy));
      groups.push({ ring: id, turnBy, members: [...members], origin: at(id), from: new Map([...members].map((x) => [x, at(x)])) });
    }
  }
  const atoms = [...ring, ...groups.flatMap((g) => g.members)];
  if (new Set(atoms).size !== atoms.length) return { error: 'fused' };
  // C3 and C6 swing across (the projections stay where they are); the groups turn about their carbons
  const ends = new Map([2, 5].map((k) => [seq[k], [at(seq[k]), place(other.ring[k])]]));
  const at_ = (t) => {
    const out = new Map();
    const s = smooth(Math.min(1, Math.max(0, t)));
    for (const id of ring) out.set(id, ends.has(id) ? lerp(...ends.get(id), s) : at(id));
    for (const g of groups) {
      for (const x of g.members) {
        const [px, py] = g.from.get(x);
        out.set(x, plus(g.origin, turn([px - g.origin[0], py - g.origin[1]], g.turnBy * s)));
      }
    }
    return out;
  };
  return { atoms, at: at_, off: best.off };
}
