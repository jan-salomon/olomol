// Bond drawings: lines, wedges and wavy lines, stopping short of atom labels.
// Double bonds in rings put their second line inside the ring; outside rings
// it goes to the side with more substituents, or is centred on a bond to a
// labelled chain end (C=O) or between two lone atoms. A plain bond between
// the wide ends of two wedges is drawn bold (it comes out of the page as
// well), and thick ends meet the next bond without a notch.
import { otherEnd } from '../model/doc.js';
import { exitDistance } from './labels.js';
import { STYLE } from './style.js';

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const add = (p, v, k = 1) => [p[0] + k * v[0], p[1] + k * v[1]];
const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
const unit = ([x, y]) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
// half a wedge's wide end; a corner may move 2.5 times that to meet the next bond
const half = () => STYLE.wedgeWidth / 2;
// drawn as a wedge: a stereo wedge, or a Haworth ring's side (only perspective)
const TAPERED = new Set(['wedge', 'perspective']);

// The plain single bonds to draw bold: those made bold (bond.bold), and between the wide ends of two wedges,
// directly or along a short unbranched chain (the bridge of a morphinan,
// the front edge of a Haworth ring). `bondsAt(id)`: an atom's bonds.
export function boldBonds(bondList, bondsAt) {
  const bonds = [...bondList];
  const wide = new Set();
  for (const bond of bonds) if (bond.order === 1 && TAPERED.has(bond.stereo)) wide.add(bond.b);
  const plain = (bond) => bond.order === 1 && !bond.stereo && !bond.kind;
  const bold = new Set();
  for (const start of wide) {
    for (const first of bondsAt(start)) {
      if (!plain(first)) continue;
      const path = [first];
      let at = otherEnd(first, start);
      while (!wide.has(at) && path.length < 4) {
        const next = bondsAt(at).filter((bond) => bond !== path.at(-1));
        if (next.length !== 1 || !plain(next[0])) break;
        path.push(next[0]);
        at = otherEnd(next[0], at);
      }
      if (wide.has(at) && at !== start) for (const bond of path) bold.add(bond.id);
    }
  }
  // and the plain single bonds made bold by hand (a bond forming in a scheme, a bond to point at)
  for (const bond of bonds) if (bond.bold && plain(bond)) bold.add(bond.id);
  return bold;
}

// The side for the dashed line of a delocalized bond: inside its ring, or
// towards the other atoms of its group; in a group as symmetric as
// guanidinium the same way round on every bond, seen from the middle.
export function dashSide(bond, ctx, pa = ctx.pos(bond.a), pb = ctx.pos(bond.b)) {
  if (ctx.ring) return doubleBondSide(bond, ctx);
  let score = 0;
  for (const id of [bond.a, bond.b]) {
    for (const next of ctx.bondsAt?.(id) ?? []) if (next !== bond && next.delocalized) score += sideOf(pa, pb, ctx.pos(otherEnd(next, id)));
  }
  if (score) return Math.sign(score);
  const centre = (id) => (ctx.bondsAt?.(id) ?? []).filter((next) => next.delocalized).length;
  return centre(bond.a) >= centre(bond.b) ? 1 : -1;
}

// Where lines p + t·u and q + s·v cross, or null if they are parallel.
function meet(p, u, q, v) {
  const d = cross(u, v);
  if (Math.abs(d) < 1e-9) return null;
  return add(p, u, cross(sub(q, p), v) / d);
}

// Where a wedge starts: at its narrow atom, or the edge of that atom's label.
function wedgeTip(bond, ctx) {
  const [pa, pb] = [ctx.pos(bond.a), ctx.pos(bond.b)];
  const la = ctx.label(bond.a);
  if (!la) return pa;
  const dir = unit(sub(pb, pa));
  const cut = exitDistance(la.boxes, 0, 0, dir[0], dir[1]);
  return cut < Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) - 0.02 ? add(pa, dir, cut) : pa;
}

// The two outlines ([point, direction]) of a thick bond at atom `end`: a
// wedge at its wide end or a bold bond; null for thin bonds.
function thickEdges(bond, end, ctx) {
  const wedge = bond.order === 1 && TAPERED.has(bond.stereo) && bond.b === end;
  if (!wedge && !ctx.bold?.(bond)) return null;
  const dir = unit(sub(ctx.pos(bond.b), ctx.pos(bond.a)));
  const normal = [-dir[1], dir[0]];
  const at = ctx.pos(end);
  return [1, -1].map((side) => {
    const corner = add(at, normal, side * half());
    return [corner, wedge ? sub(corner, wedgeTip(bond, ctx)) : dir];
  });
}

// A corner (side +1 or -1 of the normal) of a thick bond's end at an
// unlabelled atom, moved to meet the next bond round on that side: along
// a thin bond's line, or where the outlines of two thick bonds cross.
function joinedCorner(bond, end, side, ctx) {
  const at = ctx.pos(end);
  const [corner, along] = thickEdges(bond, end, ctx)[side === 1 ? 0 : 1];
  const back = unit(sub(ctx.pos(otherEnd(bond, end)), at));
  const sense = Math.sign(cross(back, sub(corner, at)));
  let [next, least] = [null, Infinity];
  for (const other of ctx.bondsAt?.(end) ?? []) {
    if (other === bond) continue;
    const e = unit(sub(ctx.pos(otherEnd(other, end)), at));
    let turn = sense * Math.atan2(cross(back, e), dot(back, e));
    if (turn <= 1e-6) turn += 2 * Math.PI;
    if (turn < least) [next, least] = [other, turn];
  }
  if (!next) return corner;
  const outlines = thickEdges(next, end, ctx) ?? [[at, sub(ctx.pos(otherEnd(next, end)), at)]];
  let [best, room] = [corner, 2.5 * half()];
  for (const [q, v] of outlines) {
    const p = meet(corner, along, q, v);
    const d = p && Math.hypot(p[0] - corner[0], p[1] - corner[1]);
    if (p && d < room) [best, room] = [p, d];
  }
  return best;
}

// Which side of the bond a→b point p is on: +1 (the side of the normal
// (-dy, dx)), -1, or 0.
function sideOf(a, b, p) {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  return Math.abs(cross) < 1e-6 ? 0 : Math.sign(cross);
}

// Where the second line of a double bond goes: { side: +1 or -1 (side of
// the normal), or 0 for centred, rule: which rule decided (for the debug
// view) }. `ctx`: { pos(id), degree(id), labelled(id), neighbours(id), ring
// (atom ids of its smallest ring, or undefined), centroid (of its molecule) }.
export function doubleBondRule(bond, ctx) {
  const names = { left: 1, right: -1, center: 0 };
  if (bond.side in names) return { side: names[bond.side], rule: 'set by hand' };
  const [a, b] = [ctx.pos(bond.a), ctx.pos(bond.b)];
  if (ctx.ring) {
    const centre = ctx.ring.map(ctx.pos).reduce((s, p) => [s[0] + p[0] / ctx.ring.length, s[1] + p[1] / ctx.ring.length], [0, 0]);
    return { side: sideOf(a, b, centre) || 1, rule: `inside its ${ctx.ring.length}-ring` };
  }
  const [da, db] = [ctx.degree(bond.a), ctx.degree(bond.b)];
  if (da === 1 && db === 1) return { side: 0, rule: 'centred: two lone atoms' };
  if ((da === 1 && ctx.labelled(bond.a)) || (db === 1 && ctx.labelled(bond.b))) return { side: 0, rule: 'centred: to a labelled chain end (C=O)' };
  let score = 0;
  for (const [id, other] of [[bond.a, bond.b], [bond.b, bond.a]]) {
    for (const n of ctx.neighbours(id)) if (n !== other) score += sideOf(a, b, ctx.pos(n));
  }
  if (score) return { side: Math.sign(score), rule: 'towards the side with more substituents' };
  if (da === 1 || db === 1) return { side: 0, rule: 'centred: chain end, no side preferred' };
  return { side: sideOf(a, b, ctx.centroid) || 1, rule: 'towards the middle of the molecule (substituents even)' };
}

export const doubleBondSide = (bond, ctx) => doubleBondRule(bond, ctx).side;

// The drawing of one bond: { lines: [[x1, y1, x2, y2]], polygons: [[points]],
// paths: [svg path d] } in absolute coordinates. `ctx` as for
// doubleBondSide, plus label(id): the atom's label (with boxes) or null,
// and dativeLines: coordination bonds in the page as lines, not arrows.
export function bondShapes(bond, ctx) {
  // a coordination bond with depth: a wedge or hashed wedge from the acceptor (the metal) to the
  // donor, as a single bond would be drawn (it still counts for no valence: that is the bond's kind)
  if (bond.kind === 'dative' && (bond.stereo === 'wedge' || bond.stereo === 'hash')) {
    return bondShapes({ ...bond, a: bond.b, b: bond.a, kind: undefined, order: 1 }, ctx);
  }
  const pa = ctx.pos(bond.a);
  const pb = ctx.pos(bond.b);
  const length = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  const result = { lines: [], polygons: [], paths: [] };
  if (length < 1e-6) return result;
  const dir = unit(sub(pb, pa));
  const normal = [-dir[1], dir[0]];
  const la = ctx.label(bond.a);
  const lb = ctx.label(bond.b);
  // the part of a line through p (parallel to the bond) outside both labels;
  // cut off by a charge too, unless little of it would be left
  const clip = (p, q) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const cuts = (boxes) => [
      la ? exitDistance(boxes(la), p[0] - pa[0], p[1] - pa[1], dir[0], dir[1]) : 0,
      lb ? exitDistance(boxes(lb), q[0] - pb[0], q[1] - pb[1], -dir[0], -dir[1]) : 0,
    ];
    let [startCut, endCut] = cuts((label) => label.boxes);
    if (startCut + endCut > len - 0.35) [startCut, endCut] = cuts((label) => label.boxes.filter((b) => !b.charge));
    if (startCut + endCut >= len - 0.02) return null;
    return [add(p, dir, startCut), add(q, dir, -endCut)];
  };
  const line = (p, q) => {
    const c = clip(p, q);
    if (c) result.lines.push([...c[0], ...c[1]]);
  };
  const gap = STYLE.doubleGap;
  // how much shorter a second line is at an end: none at a label; at a plain
  // corner it ends inside the angle; at a straight one (C=C=O, the dot only
  // a gap) clear of the next bond's second line
  const trim = (id) => (ctx.labelled?.(id) ? 0 : gap * (ctx.straight?.(id) ? 1.25 : 0.75));
  const dashedLine = (side) => {
    const shift = [normal[0] * side * gap, normal[1] * side * gap];
    const [trimA, trimB] = [trim(bond.a), trim(bond.b)];
    const c = clip(add(add(pa, shift), dir, trimA), add(add(pb, shift), dir, -trimB));
    if (c) result.dashed = [[...c[0], ...c[1]]];
  };

  if (bond.kind === 'partial' || bond.kind === 'hbond') {
    // forming or breaking: dashed; a hydrogen bond: dotted
    const c = clip(pa, pb);
    if (c) result[bond.kind === 'partial' ? 'dashed' : 'dotted'] = [[...c[0], ...c[1]]];
    return result;
  }
  if (bond.kind === 'dative' && ctx.dativeLines) {
    line(pa, pb);
    return result;
  }
  if (bond.kind === 'dative') {
    // an arrow from the donor to the acceptor
    const c = clip(pa, pb) ?? [pa, pb];
    const base = add(c[1], dir, -STYLE.arrowHeadLength);
    result.lines.push([...c[0], ...base]);
    result.polygons.push([c[1], add(base, normal, STYLE.arrowHeadHalfWidth), add(base, normal, -STYLE.arrowHeadHalfWidth)]);
    return result;
  }
  if (bond.order === 1 && TAPERED.has(bond.stereo)) {
    const c = clip(pa, pb) ?? [pa, pb];
    if (lb) result.polygons.push([c[0], add(c[1], normal, half()), add(c[1], normal, -half())]);
    else result.polygons.push([c[0], joinedCorner(bond, bond.b, 1, ctx), pb, joinedCorner(bond, bond.b, -1, ctx)]);
    return result;
  }
  if (bond.order === 1 && !bond.stereo && ctx.bold?.(bond)) {
    const c = clip(pa, pb) ?? [pa, pb];
    const end = (id, p, label) => (label ? [add(p, normal, half()), p, add(p, normal, -half())]
      : [joinedCorner(bond, id, 1, ctx), p, joinedCorner(bond, id, -1, ctx)]);
    const [ea, eb] = [end(bond.a, c[0], la), end(bond.b, c[1], lb)];
    result.polygons.push([ea[0], eb[0], eb[1], eb[2], ea[2], ea[1]]);
    return result;
  }
  if (bond.order === 1 && bond.stereo === 'hash') {
    const c = clip(pa, pb) ?? [pa, pb];
    const span = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
    // (at most 400 lines: a bond far longer than any drawn, a mistyped coordinate in a file, would fill the memory)
    const count = Math.min(400, Math.max(3, Math.round(span / STYLE.hashSpacing)));
    for (let k = 0; k <= count; k++) {
      const t = k / count;
      const half = Math.max(0.012, (STYLE.wedgeWidth / 2) * t);
      const p = add(c[0], dir, t * span);
      result.lines.push([...add(p, normal, half), ...add(p, normal, -half)]);
    }
    return result;
  }
  if (bond.order === 1 && bond.stereo === 'wavy') {
    const c = clip(pa, pb) ?? [pa, pb];
    const span = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
    const waves = Math.min(400, Math.max(2, Math.round(span / 0.16)));
    const step = span / waves;
    let d = `M${fmt(c[0])}`;
    for (let k = 0; k < waves; k++) {
      const p = add(c[0], dir, (k + 0.5) * step);
      const control = add(p, normal, (k % 2 ? -1 : 1) * STYLE.wavyAmplitude * 2);
      d += ` Q${fmt(control)} ${fmt(add(c[0], dir, (k + 1) * step))}`;
    }
    result.paths.push(d);
    return result;
  }
  if (bond.delocalized && bond.order <= 2) {
    line(pa, pb);
    // in a ring with a circle, just the line; else a dashed second line,
    // inside the ring or towards the rest of the group (O–C–O)
    if (ctx.circled?.(bond)) return result;
    dashedLine(dashSide(bond, ctx, pa, pb));
    return result;
  }
  if (bond.order === 2) {
    const side = doubleBondSide(bond, ctx);
    if (side === 0) {
      line(add(pa, normal, gap / 2), add(pb, normal, gap / 2));
      line(add(pa, normal, -gap / 2), add(pb, normal, -gap / 2));
    } else {
      line(pa, pb);
      const shift = [normal[0] * side * gap, normal[1] * side * gap];
      const [trimA, trimB] = [trim(bond.a), trim(bond.b)];
      if (length > trimA + trimB + 0.1) line(add(add(pa, shift), dir, trimA), add(add(pb, shift), dir, -trimB));
    }
    return result;
  }
  if (bond.order === 3) {
    line(pa, pb);
    for (const side of [1, -1]) line(add(pa, normal, side * gap), add(pb, normal, side * gap));
    return result;
  }
  if (bond.order === 4) {
    // aromatic, if it could not be written as single and double bonds: a dashed second line
    line(pa, pb);
    dashedLine(ctx.ring ? doubleBondSide(bond, ctx) : 1);
    return result;
  }
  line(pa, pb);
  return result;
}

const fmt = (p) => `${+p[0].toFixed(4)} ${+p[1].toFixed(4)}`;
