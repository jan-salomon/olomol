// Orbitals drawn on atoms, as organic papers draw them: a p orbital as two
// lobes on either side of its atom (one shaded: its phase), a hybrid
// orbital as a big lobe with a small one behind (a lone pair, a σ*), an s
// orbital as a circle. A lobe is a teardrop from the atom's centre to its
// round end; on an atom with a label each lobe starts outside the letters,
// its narrow end rounded off there, and reaches a little further out than
// on a carbon (0.45 of a bond beyond the letters), narrower. All in
// bond lengths, y down, as the drawing.
import { orbitalAngle } from '../model/doc.js';

export const SHADE = '#9aa1ad'; // the shaded lobe, when the orbital has no colour of its own
const P_LENGTH = 0.64; // from the atom's centre to a p lobe's end, at size 1
const HYBRID_LENGTH = 0.75; // a hybrid orbital's big lobe
const BACK = 0.28; // its small lobe, as a share of the big one
const S_RADIUS = 0.3;
const WIDTH = 0.355; // a lobe's half width, as a share of its length
const LABEL_ROOM = 0.06; // between a label and the lobes starting outside it
const LABELLED = 0.7; // a lobe outside a label: this share of a carbon's lobe long beyond the letters (0.45 bonds at size 1)
const SAMPLES = 10; // points per curve, for hit testing and bounds

// How far from the atom's centre a label reaches in direction `angle` (0 without a label).
function labelReach(info, angle) {
  const boxes = info?.label?.boxes ?? [];
  if (!boxes.length) return 0;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  // the furthest point of the boxes along the ray, within the lobe's width of it
  let reach = 0;
  for (const b of boxes) {
    for (let t = 0; t <= 1.2; t += 0.02) {
      const [x, y] = [c * t, s * t];
      if (x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2) reach = Math.max(reach, t);
    }
  }
  return reach > 0 ? reach + LABEL_ROOM : 0;
}

// One lobe along `angle` from the atom at `pos`: from `from` (0: a narrow start at the atom's centre; more:
// a round start outside a label) to its round end `to` from the centre, `width` its half width.
// { curves (three cubic Béziers, four points each), tip (its far end), middle }.
function lobe(pos, angle, from, to, width) {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const at = ([u, v]) => [pos[0] + u * c - v * s, pos[1] + u * s + v * c];
  const W = width;
  // where it is widest; the round end's controls beyond, so that its middle reaches `to`
  const shoulder = Math.max(0.7 * to, from + 0.35 * (to - from));
  const control = shoulder + (to - shoulder) / 0.75;
  // (from outside a label: the teardrop's taper, its narrow end rounded off just beyond the letters)
  const start = from > 0
    ? [[from, 0], [from, 0.3 * W], [from + 0.3 * (shoulder - from), W], [shoulder, W]]
    : [[0, 0], [0.125 * to, 0.35 * W], [0.41 * to, W], [shoulder, W]];
  const end = [[shoulder, W], [control, W], [control, -W], [shoulder, -W]];
  const back = start.map(([u, v]) => [u, -v]).reverse();
  return { curves: [start, end, back].map((curve) => curve.map(at)), tip: at([to, 0]), middle: at([(from + to) / 2, 0]) };
}

// Points along cubic Béziers, for hit testing and bounds.
function sample(curves) {
  const points = [];
  for (const [p0, p1, p2, p3] of curves) {
    for (let k = 0; k < SAMPLES; k++) {
      const t = k / SAMPLES;
      const m = 1 - t;
      points.push([0, 1].map((i) => m * m * m * p0[i] + 3 * m * m * t * p1[i] + 3 * m * t * t * p2[i] + t * t * t * p3[i]));
    }
  }
  return points;
}

// The directions of an orbital's lobes on the page and how wide they are outside a label (half widths):
// [{ angle, half }], for its atom's charge, which is written where no lobe runs (as where no bond does; an
// s orbital goes round the label and has none).
export function lobeSpans(doc, orbital) {
  if (orbital.kind === 's') return [];
  const angle = orbitalAngle(doc, orbital);
  const size = orbital.size ?? 1;
  const half = (length) => WIDTH * length * 0.75;
  const [first, second] = orbital.kind === 'hybrid' ? [HYBRID_LENGTH * size, BACK * HYBRID_LENGTH * size] : [P_LENGTH * size, P_LENGTH * size];
  return [{ angle, half: half(first) }, { angle: angle + Math.PI, half: half(second) }];
}

// The lobes of an orbital on the atom `info` (the scene's, for its label): [{ curves | circle, polygon,
// shaded, tip (its far end), middle, angle, side (1: along the orbital's angle, −1: opposite; an s orbital's 1) }].
export function orbitalLobes(doc, orbital, info) {
  const pos = info?.pos ?? [doc.atoms.get(orbital.atom).x, doc.atoms.get(orbital.atom).y];
  const angle = orbitalAngle(doc, orbital);
  const size = orbital.size ?? 1;
  const reach = orbital.reach ?? 1;
  const first = (orbital.phase ?? 1) > 0;
  if (orbital.kind === 's') {
    const r = Math.max(S_RADIUS * size, labelReach(info, angle) + 0.1);
    const polygon = Array.from({ length: 4 * SAMPLES }, (_, k) => [pos[0] + r * Math.cos((2 * Math.PI * k) / (4 * SAMPLES)), pos[1] + r * Math.sin((2 * Math.PI * k) / (4 * SAMPLES))]);
    return [{ circle: { cx: pos[0], cy: pos[1], r }, polygon, shaded: first, tip: [pos[0] + r * Math.cos(angle), pos[1] + r * Math.sin(angle)], middle: pos, angle, side: 1 }];
  }
  const make = (a, length, shaded) => {
    // (seen at a slant, a p orbital of a 3D view looks shorter, not narrower)
    const from = labelReach(info, a);
    // (outside a label: as long beyond the letters as LABELLED of a carbon's lobe, and narrower, so that it reads as a lobe)
    const to = from > 0 ? from + LABELLED * length * reach : length * reach;
    const shape = lobe(pos, a, from, to, WIDTH * length * (from > 0 ? 0.75 : 1));
    return { ...shape, polygon: sample(shape.curves), shaded, angle: a, side: Math.cos(a - angle) > 0 ? 1 : -1 };
  };
  if (orbital.kind === 'hybrid') {
    const big = HYBRID_LENGTH * size;
    // (the small lobe behind too on an atom with a label, just outside the letters, as papers draw a σ*)
    return withDepth(orbital, angle, [make(angle + Math.PI, BACK * big, !first), make(angle, big, first)], big);
  }
  const length = P_LENGTH * size;
  return withDepth(orbital, angle, [make(angle, length, first), make(angle + Math.PI, length, !first)], length);
}

// In a drawing from a 3D view (orbital.z: its atom's depth, the larger the nearer; orbital.dz: how much its
// first lobe, along `angle`, points towards the viewer), each lobe's depth at its middle, for painting back
// to front among the bonds.
function withDepth(orbital, angle, lobes, length) {
  if (typeof orbital.z !== 'number') return lobes;
  const dz = orbital.dz ?? 0;
  for (const lobe of lobes) lobe.z = orbital.z + (Math.cos(lobe.angle - angle) > 0 ? 1 : -1) * dz * (length / 2);
  return lobes;
}

// An SVG path of a lobe (`f` scales and rounds a coordinate).
export function lobePath(lobe, f) {
  if (lobe.circle) {
    const { cx, cy, r } = lobe.circle;
    return `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
  }
  const [first, ...rest] = lobe.curves;
  const point = (p) => `${f(p[0])},${f(p[1])}`;
  return `M${point(first[0])}${[first, ...rest].map(([, p1, p2, p3]) => `C${point(p1)} ${point(p2)} ${point(p3)}`).join('')}Z`;
}

// Where an overlap line between two orbitals runs: between the lobes it was drawn between (`sideA`, `sideB`: a's
// and b's lobe by its side, where chosen), or else those that face each other most (their ends nearest), from
// just inside one end to just inside the other. An s orbital has no end of its own: the line meets its circle where
// it faces the other orbital (an H's s orbital in hyperconjugation, whichever side the p orbital is on).
// [[x, y], [x, y]] or null.
export function overlapLine(a, b, { sideA = null, sideB = null } = {}) {
  // a lobe's end facing `other`: a circle's point towards the other's end (its centre, if a circle too)
  const facing = (lobe, other) => {
    if (!lobe.circle) return lobe;
    const { cx, cy, r } = lobe.circle;
    const [ox, oy] = other.circle ? [other.circle.cx, other.circle.cy] : other.tip;
    const d = Math.hypot(ox - cx, oy - cy);
    return d < 1e-9 ? lobe : { ...lobe, tip: [cx + ((ox - cx) / d) * r, cy + ((oy - cy) / d) * r] };
  };
  // (a lobe chosen: only that one; none on that side, as after a p became an s: any)
  const only = (lobes, side) => {
    const chosen = side == null ? [] : lobes.filter((l) => l.side === side);
    return chosen.length ? chosen : lobes;
  };
  let best = null;
  for (const p0 of only(a, sideA)) {
    for (const q0 of only(b, sideB)) {
      const [p, q] = [facing(p0, q0), facing(q0, p0)];
      const d = Math.hypot(p.tip[0] - q.tip[0], p.tip[1] - q.tip[1]);
      if (!best || d < best.d) best = { p, q, d };
    }
  }
  if (!best || best.d < 1e-6) return null;
  const inset = (lobe, other) => {
    const [dx, dy] = [other.tip[0] - lobe.tip[0], other.tip[1] - lobe.tip[1]];
    const d = Math.hypot(dx, dy);
    const k = Math.min(0.08, d / 4) / d;
    return [lobe.tip[0] + dx * k, lobe.tip[1] + dy * k];
  };
  return [inset(best.p, best.q), inset(best.q, best.p)];
}
