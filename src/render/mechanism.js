// Electron pushing: where lone pairs and unpaired electrons sit around their
// atoms, and how a curved arrow runs from electrons (a bond, a lone pair, an
// unpaired electron) to where they go (an atom or a bond).
//
// Arrows follow the textbook rules: they leave a lone pair or a bond
// outwards, turn one way and smoothly, end in a small head pointing at the
// atom or bond, come in from the side of the electrons when they make a new
// bond, and keep clear of labels, bonds, lone pairs, rings and other arrows.
// Many candidate curves are scored; the best wins (or, with `variant`, the
// next best that looks different). All in bond lengths, y down.
import { distanceToSegment } from '../layout/geometry.js';
import { exitDistance, SIDES } from './labels.js';
import { STYLE } from './style.js';
import { NEWMAN_RADIUS } from '../chem/newman.js';

const DEGREE = Math.PI / 180;
const add = ([x, y], [dx, dy], k = 1) => [x + k * dx, y + k * dy];
const sub = ([x, y], [u, v]) => [x - u, y - v];
const len = ([x, y]) => Math.hypot(x, y);
const unit = (v) => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
};
const angleOf = ([x, y]) => Math.atan2(y, x);
const direction = (angle) => [Math.cos(angle), Math.sin(angle)];
export const angleBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const midpoint = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// --- lone pairs and unpaired electrons ---

// Directions around an atom that are taken: its bonds and the side where
// its hydrogens are written. (The charge is placed after the electrons, in
// a free corner, so electrons sit where the chemistry puts them: opposite
// the triple bond of C≡O⁺, all around Cl⁻.)
export function occupiedDirections(info) {
  const taken = [...info.bondAngles];
  if (info.hSide) taken.push(SIDES[info.hSide]);
  return taken;
}

const directionCache = new Map(); // electronDirections: its inputs -> the directions

// `count` directions for electrons around an atom (lone pairs and unpaired
// electrons together), as far as possible from what is taken and from each
// other: all combinations of directions in 15° steps are tried, the widest
// smallest angle wins, then the most even spread. Beside a text label (O,
// OH, NH2) straight up/down/left/right counts as up to 20° wider, since
// diagonal pairs look lost there. Around an atom without bonds only those
// four directions are used (H2O, Cl⁻).
export function electronDirections(info, count, facing = null, prefer = null) {
  if (!count) return [];
  // the same atoms come back at every redraw (a drag moves a few): worked
  // out once for each set of directions (rounded, so a molecule that only
  // moved finds its own)
  const round = (a) => Math.round(a * 1e6) / 1e6;
  const taken = occupiedDirections(info).map(round);
  const lone = !info.bondAngles.length;
  const towards = facing === null ? null : round(facing);
  const key = `${count}|${towards}|${prefer}|${lone}|${Boolean(info.labelled)}|${taken.join(',')}`;
  let found = directionCache.get(key);
  if (!found) {
    found = bestDirections(taken, lone, Boolean(info.labelled), count, towards, prefer);
    if (directionCache.size > 20000) directionCache.clear();
    directionCache.set(key, found);
  }
  return [...found];
}

function bestDirections(taken, lone, labelled, count, facing, prefer = null) {
  const steps = lone && count + taken.length <= 4 ? 4 : 24;
  const angles = Array.from({ length: steps }, (_, step) => (2 * step * Math.PI) / steps - Math.PI / 2);
  const square = (a) => Math.abs(Math.round(a / (Math.PI / 2)) * (Math.PI / 2) - a) < 1e-6;
  const squareBonus = labelled ? 20 * DEGREE : 0;
  let best = null;
  const score = (chosen) => {
    // around an atom without bonds a right angle is room enough: then the
    // side an arrow goes to decides
    const enough = lone && facing !== null ? Math.PI / 2 : Math.PI;
    const between = chosen.flatMap((a, k) => [...taken, ...chosen.slice(k + 1)].map((b) => Math.min(enough, angleBetween(a, b))));
    const room = between.length ? Math.min(...between) : enough;
    const crowding = between.reduce((sum, angle) => sum + 1 / Math.max(angle, 1e-3) ** 2, 0);
    const squares = chosen.filter(square).length;
    // ties: one towards where an arrow from here goes, else one towards `prefer` (an unpaired electron:
    // the right), else towards the top
    const lean = facing ?? prefer;
    const tie = lean === null
      ? -chosen.reduce((sum, a) => sum + angleBetween(a, -Math.PI / 2), 0)
      : -Math.min(...chosen.map((a) => angleBetween(a, lean)));
    return [room + (squareBonus * squares) / count, -crowding, squares, tie];
  };
  const better = (s, t) => {
    for (let k = 0; k < s.length; k++) if (Math.abs(s[k] - t[k]) > 1e-9) return s[k] > t[k];
    return false;
  };
  const pick = (chosen, from) => {
    if (chosen.length === count) {
      const s = score(chosen);
      if (!best || better(s, best.score)) best = { chosen, score: s };
      return;
    }
    for (let k = from; k < angles.length; k++) pick([...chosen, angles[k]], k + 1);
  };
  if (count > 4) return Array.from({ length: count }, (_, k) => (2 * k * Math.PI) / count); // never in practice
  pick([], 0);
  return best.chosen;
}

// Distance from the atom's centre to the middle of a pair in a direction:
// just outside its label (the charge makes room for the electrons, not
// they for it; Lewis bars hug it, |O|), or close to a plain corner.
export function electronDistance(info, angle, bars = false) {
  if (!info.label) return 0.19;
  const [dx, dy] = direction(angle);
  return exitDistance(info.label.boxes.filter((b) => !b.charge), 0, 0, dx, dy, 0) + (bars ? 0.095 : 0.12);
}

// Where an atom's electrons go: { pairs: [angles of all its lone pairs],
// radicals: [the angle of each place of unpaired electrons] }. `info`: {
// bondAngles, hSide, labelled }. `places`: how many places of unpaired
// electrons (RADICAL_PLACES: one for a radical or a singlet, one for each
// electron from a triplet on). `facing`: the direction an arrow from this
// atom's electrons goes, if any (an atom without bonds turns its electrons
// that way; an unpaired electron sits on that side). Without an arrow an
// unpaired electron goes to the right of its atom where there is room
// (Cl•), else to the free place nearest it; more of them on round: below,
// left, above (a Lewis symbol: ·N̈·, :Ö·, the lone pairs on the rest).
// `aims`: the directions of the fishhooks from its unpaired electrons, in
// order: each gets an electron of its own, those places together that face
// them best (·N̈· with three H• round it: an electron towards each H, the
// pair where none goes).
export function electronAngles(info, lonePairs, places = 0, facing = null, aims = []) {
  const towards = facing ?? (places ? 0 : null);
  const angles = electronDirections(info, lonePairs + places, info.bondAngles.length ? null : facing, places ? 0 : null);
  const radicals = [];
  const wanted = aims.slice(0, places);
  if (wanted.length) {
    let best = null;
    const walk = (chosen, cost) => {
      if (best && cost > best.cost - 1e-9) return;
      if (chosen.length === wanted.length) {
        best = { chosen, cost };
        return;
      }
      for (const a of angles) if (!chosen.includes(a)) walk([...chosen, a], cost + angleBetween(a, wanted[chosen.length]));
    };
    walk([], 0);
    for (const a of best?.chosen ?? []) {
      angles.splice(angles.indexOf(a), 1);
      radicals.push(a);
    }
  }
  for (let k = radicals.length; k < places; k++) {
    const want = towards + (k % 4) * (Math.PI / 2);
    const radical = angles.reduce((best, a) => (angleBetween(a, want) < angleBetween(best, want) - 1e-9 ? a : best));
    angles.splice(angles.indexOf(radical), 1);
    radicals.push(radical);
  }
  return { pairs: angles, radicals, aimed: wanted.length };
}

// The lone pairs drawn when only `shown` of them are: those nearest the top.
export const shownPairs = (angles, shown) => [...angles]
  .sort((p, q) => angleBetween(p, -Math.PI / 2) - angleBetween(q, -Math.PI / 2)).slice(0, shown);

// The electrons drawn around one atom, now that its label is known: {
// pairs: [{ angle, point }], unpaired: [{ angle, point, count }] } (count:
// dots of an unpaired position, 1 for an unpaired electron, 2 for a
// singlet's two together), and `slots`: all lone pair directions (also the
// hidden ones), where arrows from lone pairs start. `shown`: how many lone
// pairs to draw; `dots`: each unpaired place's (RADICAL_PLACES); `bars`:
// drawn as Lewis bars. `aimed`: how many of the unpaired places face a fishhook each (the first, in the
// fishhooks' order: electronAngles; the scene adds startOf, which fishhook each is for).
export function electronLayout(info, { pairs: angles, radicals, aimed = 0 }, shown, dots, bars = false) {
  const at = (angle) => add(info.pos, direction(angle), electronDistance(info, angle, bars));
  const pairs = shownPairs(angles, shown).map((angle) => ({ angle, point: at(angle) }));
  const unpaired = radicals.map((angle, k) => ({ angle, point: at(angle), count: dots[k] }));
  const slots = angles.map((angle) => ({ angle, point: at(angle), shown: pairs.some((p) => p.angle === angle) }));
  return { pairs, unpaired, slots, aimed };
}

// SVG of a lone pair (two dots or a bar) or unpaired electrons (one or two
// dots), `k` units per bond length.
export function electronSVG(point, angle, dots, style, color, k = 1) {
  const n = (v) => +(v * k).toFixed(3);
  const across = direction(angle + Math.PI / 2);
  if (dots === 2 && style === 'bars') {
    const [p, q] = [-1, 1].map((s) => add(point, across, s * STYLE.barHalfLength));
    return `<line x1="${n(p[0])}" y1="${n(p[1])}" x2="${n(q[0])}" y2="${n(q[1])}" stroke="${color}" stroke-width="${n(STYLE.line * 1.1)}" stroke-linecap="round"/>`;
  }
  const centres = dots === 2 ? [-1, 1].map((s) => add(point, across, s * STYLE.dotHalfSpacing)) : [point];
  // an unpaired electron stands out a little more than a pair's dots
  const r = dots === 1 || style === 'unpaired' ? STYLE.radicalRadius : STYLE.dotRadius;
  return centres.map((c) => `<circle cx="${n(c[0])}" cy="${n(c[1])}" r="${n(r)}" fill="${color}"/>`).join('');
}

const f = (v) => +v.toFixed(4);

// --- curved arrows ---

const BOND_OFFSET = 0.11; // arrows start and end this far beside a bond's lines

// The two places beside a bond's middle where an arrow can start or end,
// with the direction away from the bond: just outside its lines on that
// side (the second line of a double bond, the outer lines of a triple bond).
function besideBond(sceneBond, p, q) {
  const [x, y] = unit(sub(q, p));
  return [1, -1].map((side) => {
    const offset = BOND_OFFSET + (sceneBond.extent?.[side] ?? 0);
    return { point: add(midpoint(p, q), [-y, x], side * offset), out: [-side * y, side * x], side };
  });
}

// The lines of a bond drawn beside the line between its atoms (a double
// bond's second line, the outer two of a triple bond, a dashed one), as
// segments [p, q]: an arrow keeps clear of them too.
function sideLines(sceneBond, p, q) {
  const { bond, shapes } = sceneBond;
  if (!(bond.order >= 2 || bond.delocalized)) return [];
  const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const normal = [-(q[1] - p[1]) / length, (q[0] - p[0]) / length];
  const off = (x, y) => Math.abs((x - p[0]) * normal[0] + (y - p[1]) * normal[1]);
  return [...shapes.lines, ...(shapes.dashed ?? []), ...(shapes.dotted ?? [])]
    .filter(([x1, y1, x2, y2]) => off(x1, y1) > 0.03 && off(x2, y2) > 0.03)
    .map(([x1, y1, x2, y2]) => [[x1, y1], [x2, y2]]);
}

// A curve from p0, leaving in direction t0, to p3, arriving in direction t1:
// a cubic Bézier { p0, p1, p2, p3 } that turns one way only (null if the
// directions would make an S), with how far it turns (radians) and to which
// side. The handles are those of a circular arc turning as far, so a
// symmetric curve is a circular arc.
export function curveBetween(p0, t0, p3, t1) {
  const chord = sub(p3, p0);
  const [a, b] = [cross(t0, chord), cross(chord, t1)];
  if (a * b <= 0) return null;
  const turnsLeft = a > 0;
  const turn = (((turnsLeft ? 1 : -1) * (angleOf(t1) - angleOf(t0))) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const handle = len(chord) * (2 / 3) * Math.tan(turn / 4) / Math.max(0.2, Math.sin(turn / 2));
  const lopsided = Math.abs(angleBetween(angleOf(t0), angleOf(chord)) - angleBetween(angleOf(chord), angleOf(t1)));
  return { p0, p1: add(p0, t0, handle), p2: add(p3, t1, -handle), p3, t1, turn, turnsLeft, lopsided };
}

export function bezierPoint({ p0, p1, p2, p3 }, t) {
  const s = 1 - t;
  return [0, 1].map((k) => s ** 3 * p0[k] + 3 * s * s * t * p1[k] + 3 * s * t * t * p2[k] + t ** 3 * p3[k]);
}
export const curvePoints = (c, n) => Array.from({ length: n + 1 }, (_, k) => bezierPoint(c, k / n));

const segmentsCross = (p, q, r, s) => {
  // apart from each other's boxes: no need to look closer
  if (Math.max(p[0], q[0]) < Math.min(r[0], s[0]) || Math.min(p[0], q[0]) > Math.max(r[0], s[0])
    || Math.max(p[1], q[1]) < Math.min(r[1], s[1]) || Math.min(p[1], q[1]) > Math.max(r[1], s[1])) return false;
  const d = (a, b, c) => Math.sign(cross(sub(b, a), sub(c, a)));
  return d(p, q, r) * d(p, q, s) < 0 && d(r, s, p) * d(r, s, q) < 0;
};

function inPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Where an arrow can start: beside a bond (both sides), at a lone pair
// (just outside it), or at an unpaired electron.
// A Newman projection's bond seen end on, as an arrow's end: round its circle, as round an atom, away
// from the bonds of its two carbons. [{ angle, point (just outside the circle), cost }].
function roundCircle(scene, bondId) {
  const bond = scene.bonds.get(bondId);
  const centre = scene.pos(bond.a);
  const taken = [...scene.atoms.get(bond.a).bondAngles, ...scene.atoms.get(bond.b).bondAngles];
  const crowding = (angle) => taken.reduce((sum, a) => sum + Math.max(0, 40 * DEGREE - angleBetween(a, angle)), 0) / (15 * DEGREE);
  return Array.from({ length: 24 }, (_, step) => {
    const angle = step * 15 * DEGREE;
    return { angle, point: add(centre, direction(angle), NEWMAN_RADIUS + 0.07), cost: crowding(angle), key: `c${step}` };
  });
}

// An orbital's lobes as ends of a curved arrow: from just beyond each lobe's tip, pointing out of it; a
// hybrid's small lobe only at a cost (the electrons are in the big one).
function lobeEnds(scene, id) {
  const lobes = scene.orbitals?.get(id)?.lobes ?? [];
  const small = lobes.length === 2 && scene.orbitals.get(id).orbital.kind === 'hybrid' ? lobes[0] : null;
  return lobes.map((lobe, k) => ({ point: add(lobe.tip, direction(lobe.angle), 0.07), out: direction(lobe.angle), extra: lobe === small ? 1.5 : 0, key: `o${k}` }));
}

// `used`: how many arrows before this one start at each of the atom's unpaired electrons (by key): one that
// already starts as many as it has electrons (one; a singlet's place two) is taken, so the next fishhook from
// that atom starts at another, whichever is nearer. `curveId`: a fishhook the atom turned an electron towards
// (electrons.startOf) starts at that one, whatever its path would prefer.
function tails(scene, from, target, used = new Map(), curveId = null) {
  if (from.orbital !== undefined) {
    return lobeEnds(scene, from.orbital).map(({ point, out, extra, key }) => ({ point, out, cost: extra + angleBetween(angleOf(out), angleOf(sub(target, point))) / Math.PI, key }));
  }
  if (from.bond !== undefined && scene.newmanAxles?.has(from.bond)) {
    return roundCircle(scene, from.bond).map(({ angle, point, cost, key }) => ({ point, out: direction(angle), cost: cost + angleBetween(angle, angleOf(sub(target, point))) / Math.PI, key }));
  }
  if (from.bond !== undefined) {
    const bond = scene.bonds.get(from.bond);
    return besideBond(bond, scene.pos(bond.a), scene.pos(bond.b)).map((t) => ({ ...t, cost: 0, key: `b${t.side}` }));
  }
  const info = scene.atoms.get(from.atom);
  const towards = angleOf(sub(target, info.pos));
  const places = from.radical
    ? info.electrons.unpaired
    : info.electrons.slots.length ? info.electrons.slots : [{ angle: towards, point: add(info.pos, direction(towards), electronDistance(info, towards)) }];
  const assigned = from.radical ? (info.electrons.startOf?.get(curveId) ?? null) : null;
  return places.flatMap((place, k) => (assigned !== null && k !== assigned ? [] : [{
    // from an unpaired electron, start a little further out: it shouldn't be hidden
    point: add(place.point, direction(place.angle), from.radical ? 0.15 : 0.09),
    out: direction(place.angle),
    cost: angleBetween(place.angle, towards) / Math.PI + (from.pair !== undefined && from.pair !== k ? 1.5 : 0)
      + (from.radical && (used.get(`p${k}`) ?? 0) >= (place.count ?? 1) ? 3 : 0),
    key: `p${k}`,
  }]));
}

// Where an arrow to a new bond (to.newBond: the atom on the electrons'
// side, to.atom the other) can end: just short of the middle between the
// two atoms, on the electrons' side of it, on either side of the line
// between them, coming down onto it. `normal` (the side, on the page) lets
// an arrow from the other atom to the same new bond meet it on its side.
function newBondHeads(scene, fromAtom, toAtom) {
  const [p, q] = [scene.pos(fromAtom), scene.pos(toAtom)];
  const u = unit(sub(q, p));
  const middle = midpoint(p, q);
  // (further off the line, at a cost, when something sits in the middle: the "+" of Cl• + H–CH3)
  return [1, -1].flatMap((side) => {
    const normal = [-u[1] * side, u[0] * side];
    return [[0.08, 0], [0.25, 0.3], [0.45, 0.6]].flatMap(([lift, extra]) => [30, 50, 70].map((tilt) => {
      const arrival = unit(add([u[0] * Math.cos(tilt * DEGREE), u[1] * Math.cos(tilt * DEGREE)], normal, -Math.sin(tilt * DEGREE)));
      const tip = add(add(middle, u, -0.07), normal, lift);
      return { tip, arrival, angle: angleOf([-arrival[0], -arrival[1]]), cost: extra + Math.abs(tilt - 50) / 100, normal, key: `m${side}` };
    }));
  });
}

// How far out from a labelled atom a head pointing at it in direction `out`
// stops: 0.07 past the label along its way in, further if that leaves a
// corner of the head nearer the label (a head aslant past a corner of it).
function labelGap(info, out) {
  const [x, y] = info.pos;
  const boxes = info.label.boxes.map((b) => [x + b.x1, y + b.y1, x + b.x2, y + b.y2]);
  const toBoxes = (p) => Math.min(...boxes.map(([x1, y1, x2, y2]) => Math.hypot(Math.max(x1 - p[0], 0, p[0] - x2), Math.max(y1 - p[1], 0, p[1] - y2))));
  let gap = exitDistance(info.label.boxes, 0, 0, out[0], out[1], 0) + 0.07;
  for (let k = 0; k < 5 && Math.min(...headPoints(add(info.pos, out, gap), [-out[0], -out[1]]).map(toBoxes)) < 0.065; k++) gap += 0.02;
  return gap;
}

// Where an arrow can end: beside a bond, pointing at it, or around an atom
// (24 directions), pointing at it from just outside its label or corner.
// Coming in near the atom's bonds, hydrogens or electrons costs.
function heads(scene, to, from) {
  if (to.newBond !== undefined) return newBondHeads(scene, to.newBond, to.atom);
  if (to.orbital !== undefined) {
    return lobeEnds(scene, to.orbital).map(({ point, out, extra, key }) => ({ tip: point, arrival: [-out[0], -out[1]], angle: angleOf(out), cost: extra, key }));
  }
  if (to.bond !== undefined && scene.newmanAxles?.has(to.bond)) {
    return roundCircle(scene, to.bond).map(({ angle, point, cost, key }) => ({ tip: point, arrival: direction(angle + Math.PI), angle, cost, key }));
  }
  if (to.bond !== undefined) {
    const bond = scene.bonds.get(to.bond);
    return besideBond(bond, scene.pos(bond.a), scene.pos(bond.b))
      .map(({ point, out, side }) => ({ tip: point, arrival: [-out[0], -out[1]], angle: angleOf(out), cost: 0, key: `b${side}` }));
  }
  const info = scene.atoms.get(to.atom);
  const hydrogens = info.label?.hSide ? [SIDES[info.label.hSide]] : [];
  const charge = info.label?.chargeAngle != null ? [info.label.chargeAngle] : [];
  const electrons = [...info.electrons.pairs, ...info.electrons.unpaired].map((e) => e.angle);
  const crowding = (angle, list, room) => list.reduce((sum, a) => sum + Math.max(0, room - angleBetween(a, angle)), 0);
  // the outer lines of its double and triple bonds, which the head must not lie on
  const lines = [...scene.bonds.values()].filter((b) => b.a === to.atom || b.b === to.atom)
    .flatMap((b) => sideLines(b, scene.pos(b.a), scene.pos(b.b)));
  return Array.from({ length: 24 }, (_, step) => {
    const angle = step * 15 * DEGREE;
    const out = direction(angle);
    const across = [-out[1] * STYLE.arrowHeadHalfWidth, out[0] * STYLE.arrowHeadHalfWidth];
    const linesUnder = (gap) => {
      const tip = add(info.pos, out, gap);
      const base = add(tip, out, STYLE.arrowHeadLength);
      return [tip, add(tip, out, STYLE.arrowHeadLength / 2), base, add(base, across), sub(base, across)]
        .filter((p) => lines.some((line) => distanceToSegment(p, ...line) < 0.05)).length;
    };
    // (a corner's lines run up to it: beside them the head stops a little further out, clear of their ends;
    // at a label, the head as far from it all along as its tip, coming in aslant too)
    const gaps = info.label ? [labelGap(info, out)] : [0.17, 0.22, 0.27];
    const gap = gaps.find((g) => !linesUnder(g)) ?? gaps[0];
    const tip = add(info.pos, out, gap);
    const onLines = linesUnder(gap);
    // coming in over the written hydrogens (H3C, OH) misses the atom itself
    const cost = (crowding(angle, info.bondAngles, 40 * DEGREE) + crowding(angle, hydrogens, 75 * DEGREE)
      + crowding(angle, charge, 35 * DEGREE) + crowding(angle, electrons, 35 * DEGREE)) / (15 * DEGREE) + 1.5 * onLines;
    return { tip, arrival: [-out[0], -out[1]], angle, cost, key: `a${step}` };
  });
}

// What an arrow must keep clear of, as drawn: labels (its own atoms' too,
// but for its head at its target: `atom` says whose), corners of other
// atoms, every line of a bond (a double bond's second, a triple bond's
// outer ones, a wedge's outline), electrons, atom numbers, R/S, + or − on
// reaction arrows, a ring's charge, texts, "+", reaction arrows, brackets,
// orbitals other than its own, other curved arrows, and the inside of rings.
// (δ+ and δ− are not in the way: they move off an arrow, clearOfArrows.)
export function obstacles(scene, own, otherCurves, near = () => true, ownOrbitals = new Set(), shared = {}) {
  const points = [];
  const segments = [];
  const box = (b, room, atom) => segments.push({ box: [b.x1, b.y1, b.x2, b.y2], room, ...(atom !== undefined && { atom }) });
  for (const info of scene.atoms.values()) {
    if (!near(info.pos)) continue;
    const [x, y] = info.pos;
    if (info.label) {
      for (const b of info.label.boxes) box({ x1: x + b.x1, y1: y + b.y1, x2: x + b.x2, y2: y + b.y2 }, 0.09, own.has(info.atom.id) ? info.atom.id : undefined);
    } else if (!own.has(info.atom.id)) {
      points.push({ point: info.pos, room: 0.12 });
    }
    // running through electrons hides them: that counts double
    for (const e of info.electrons.pairs) points.push({ point: e.point, room: 0.17, weight: 2 });
    for (const e of info.electrons.unpaired) points.push({ point: e.point, room: 0.2, weight: 2 });
    if (info.number) box(info.number.box, 0.06);
  }
  for (const sceneBond of scene.bonds.values()) {
    if (sceneBond.bond.kind === 'link') continue; // not drawn
    const [p, q] = [scene.pos(sceneBond.a), scene.pos(sceneBond.b)];
    if (!near(p) && !near(q)) continue;
    segments.push({ segment: [p, q], room: 0.08, line: true });
    for (const segment of sideLines(sceneBond, p, q)) segments.push({ segment, room: 0.07, line: true });
    // (a wedge's outline, a bold bond's)
    for (const polygon of sceneBond.shapes?.polygons ?? []) {
      polygon.forEach((a, k) => segments.push({ segment: [a, polygon[(k + 1) % polygon.length]], room: 0.06 }));
    }
  }
  for (const mark of scene.stereo ?? []) {
    if (!near([mark.x, mark.y])) continue;
    const half = STYLE.stereoFont * 0.4;
    box({ x1: mark.x - half * mark.text.length * 0.8, y1: mark.y - half, x2: mark.x + half * mark.text.length * 0.8, y2: mark.y + half }, 0.06);
  }
  for (const { at } of [...(scene.arrowSigns ?? []), ...(scene.ringCharges ?? [])]) if (near(at)) points.push({ point: at, room: 0.15 });
  // text, "+", reaction arrows and brackets
  for (const { box: b } of scene.texts.values()) box(b, 0.08);
  for (const { plus } of scene.pluses.values()) points.push({ point: [plus.x, plus.y], room: 0.3 });
  for (const { arrow } of scene.arrows.values()) segments.push({ segment: [[arrow.x1, arrow.y1], [arrow.x2, arrow.y2]], room: 0.15, line: true });
  for (const { sides = [] } of scene.brackets.values()) for (const [x1, y1, x2, y2] of sides) segments.push({ segment: [[x1, y1], [x2, y2]], room: 0.08, line: true });
  for (const [id, { lobes }] of scene.orbitals ?? []) {
    if (ownOrbitals.has(id)) continue;
    for (const { polygon } of lobes) {
      if (!polygon.some(near)) continue;
      // (every few points of its outline: a lobe is a smooth curve)
      const step = Math.max(1, Math.floor(polygon.length / 16));
      for (let k = 0; k < polygon.length; k += step) segments.push({ segment: [polygon[k], polygon[(k + step) % polygon.length]], room: 0.06 });
    }
  }
  // the other curved arrows, as drawn (`shared`: not round the start of one from the same bond, a seagull's
  // other half, nor round the head of one to the same new bond: those meet there)
  for (const c of otherCurves) {
    const start = c.samples[0];
    const end = c.head[0];
    for (const p of [...c.samples, ...c.head]) {
      if (!near(p)) continue;
      if (shared.starts && len(sub(p, start)) < 0.3 && c.curve.from.bond === shared.starts) continue;
      if (shared.meets && len(sub(p, end)) < 0.3 && c.curve.to.newBond === shared.meets.atom && c.curve.to.atom === shared.meets.newBond) continue;
      points.push({ point: p, room: 0.08 });
    }
  }
  const paths = otherCurves.map((c) => c.samples);
  const lines = segments.filter((s) => s.line).map((s) => s.segment);
  // rings near the arrow, with their bounding boxes (most points are outside them)
  const rings = scene.ringPolygons.filter((ring) => ring.some(near)).map((polygon) => {
    const [xs, ys] = [polygon.map((p) => p[0]), polygon.map((p) => p[1])];
    return { polygon, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  });
  return { points, segments, lines, rings, paths };
}

const inRing = ([x, y], { polygon, box }) => x > box[0] && x < box[2] && y > box[1] && y < box[3] && inPolygon([x, y], polygon);

// How crowded the points are, summed: a point within an obstacle's room
// counts 1 (electrons 2), one a little further out (MARGIN) less the further
// it is, so that of two clear curves the one with more room wins. `skipAtom`:
// that atom's label is not in the way (the head at its target).
const MARGIN = 0.06;
const SOFT = 0.5; // a point just outside the room: half a point inside it
function crowdedness(samples, avoid, skipAtom = null) {
  let total = 0;
  const weigh = (d, room, weight) => (d < room ? weight : d < room + MARGIN ? weight * SOFT * (1 - (d - room) / MARGIN) : 0);
  for (const p of samples) {
    let worst = 0;
    for (const o of avoid.points) {
      const reach = o.room + MARGIN;
      if (Math.abs(p[0] - o.point[0]) > reach || Math.abs(p[1] - o.point[1]) > reach) continue;
      worst = Math.max(worst, weigh(len(sub(p, o.point)), o.room, o.weight ?? 1));
    }
    if (worst >= 2) {
      total += worst;
      continue;
    }
    for (const { segment, box, room, atom } of avoid.segments) {
      if (atom !== undefined && atom === skipAtom) continue;
      const reach = room + MARGIN;
      let d;
      if (box) {
        if (p[0] < box[0] - reach || p[0] > box[2] + reach || p[1] < box[1] - reach || p[1] > box[3] + reach) continue;
        d = Math.hypot(Math.max(box[0] - p[0], 0, p[0] - box[2]), Math.max(box[1] - p[1], 0, p[1] - box[3]));
      } else {
        if (p[0] < Math.min(segment[0][0], segment[1][0]) - reach || p[0] > Math.max(segment[0][0], segment[1][0]) + reach
          || p[1] < Math.min(segment[0][1], segment[1][1]) - reach || p[1] > Math.max(segment[0][1], segment[1][1]) + reach) continue;
        d = distanceToSegment(p, ...segment);
      }
      worst = Math.max(worst, weigh(d, room, 1));
      if (worst >= 1) break;
    }
    total += worst;
  }
  return total;
}

// The head as drawn, for checking what it lies on: its tip, its middle, the
// corners of its base, and between.
function headPoints(tip, arrival) {
  const base = add(tip, arrival, -STYLE.arrowHeadLength);
  const across = [-arrival[1] * STYLE.arrowHeadHalfWidth, arrival[0] * STYLE.arrowHeadHalfWidth];
  const [left, right] = [add(base, across), sub(base, across)];
  return [tip, midpoint(tip, base), base, left, right, midpoint(tip, left), midpoint(tip, right)];
}

// The candidate curves for an arrow, best first: [{ cost, shape, tip, key,
// parts }]. `parts` (for the debug view) says what each cost came from.
// `paired`: the first of a homolysis's two fishhooks, the second to be drawn as its mirror image (mirrored): its
// ways scored with that image too, so that the pair goes where both have room.
export function arrowCandidates(scene, curve, otherCurves = [], { paired = false } = {}) {
  const { from, to } = curve;
  // (an end on an orbital: its atom, for the directions)
  const atomOf = (end) => (end.orbital !== undefined ? scene.orbitals?.get(end.orbital)?.orbital.atom : end.atom);
  const endOf = (end) => (end.bond !== undefined
    ? midpoint(scene.pos(scene.bonds.get(end.bond).a), scene.pos(scene.bonds.get(end.bond).b))
    : scene.pos(atomOf(end)));
  // to a new bond: the middle between its two atoms
  const meeting = to.newBond !== undefined;
  const target = meeting ? midpoint(scene.pos(to.newBond), scene.pos(to.atom)) : endOf(to);
  const source = endOf(from);
  const ownAtoms = new Set();
  for (const end of [from, to]) {
    if (atomOf(end) !== undefined) ownAtoms.add(atomOf(end));
    if (end.bond !== undefined) {
      const bond = scene.bonds.get(end.bond);
      ownAtoms.add(bond.a);
      ownAtoms.add(bond.b);
    }
  }
  if (meeting) ownAtoms.add(to.newBond);
  // a new bond: the head comes in from the side of the electrons
  const fromAtoms = from.bond !== undefined ? [scene.bonds.get(from.bond).a, scene.bonds.get(from.bond).b] : [atomOf(from)];
  const newBond = !meeting && to.atom !== undefined && !fromAtoms.includes(to.atom) && !fromAtoms.some((a) => scene.bonded(a, to.atom));
  // only what is near the arrow can be in its way
  const reach = len(sub(target, source)) / 2 + 2.5;
  const middle = midpoint(source, target);
  const ownOrbitals = new Set([from.orbital, to.orbital].filter((id) => id !== undefined));
  const avoid = obstacles(scene, ownAtoms, otherCurves, (p) => len(sub(p, middle)) < reach, ownOrbitals,
    { starts: from.bond, meets: meeting ? { atom: to.atom, newBond: to.newBond } : null });
  const otherSegments = otherCurves.flatMap((c) => c.samples.slice(1).map((p, k) => [c.samples[k], p]))
    .filter(([p, q]) => len(sub(p, middle)) < reach || len(sub(q, middle)) < reach);
  // two arrows from one bond (homolysis) start on the same side, like a seagull
  const sibling = from.bond !== undefined ? otherCurves.find((c) => c.curve.from.bond === from.bond) : null;
  // and two arrows to one new bond from its two atoms (two radicals combining) meet on one side of it
  const partner = meeting ? otherCurves.find((c) => c.curve.to.newBond === to.atom && c.curve.to.atom === to.newBond) : null;
  // fishhooks from this atom's unpaired electrons before this one: each electron starts one (tails)
  const used = new Map();
  if (from.radical) for (const c of otherCurves) if (c.curve.from.radical && c.curve.from.atom === from.atom) used.set(c.tailKey, (used.get(c.tailKey) ?? 0) + 1);
  const [starts, ends] = [tails(scene, from, target, used, curve.id ?? null), heads(scene, to, from)];
  // the same arrow among the same things comes back at every redraw (a
  // drag elsewhere): worked out once
  const key = JSON.stringify([starts, ends, avoid.points, avoid.segments, avoid.rings.map((r) => r.polygon), otherSegments, sibling?.tailKey ?? null, partner?.headNormal ?? null, newBond, source, target, STYLE.arrowHeadLength, paired]);
  // the second arrow of a homolysis, to the bond's other atom: the first one's mirror image (across the line
  // upright through the bond's middle), as books draw the pair, before the ways worked out alone
  const mirror = sibling?.shape && to.atom !== undefined && fromAtoms.includes(to.atom) && sibling.curve.to.atom !== undefined
    && sibling.curve.to.atom !== to.atom && fromAtoms.includes(sibling.curve.to.atom) ? mirrored(sibling, scene.pos(fromAtoms[0]), scene.pos(fromAtoms[1])) : null;
  if (candidateCache.has(key)) return mirror ? [mirror, ...candidateCache.get(key)] : candidateCache.get(key);
  // what each head lies on, as drawn (its target's label aside: it points at it; a head to a new
  // bond is in the open, between atoms, and counts double there)
  const headCrowding = new Map(ends.map((head) => [head, (meeting ? 1 : 0.5) * crowdedness(headPoints(head.tip, head.arrival), avoid, meeting ? null : to.atom ?? null)]));
  const candidates = [];
  for (const tail of starts) {
    for (const lean of [-60, -30, 0, 30, 60]) {
      const t0 = direction(angleOf(tail.out) + lean * DEGREE);
      for (const head of ends) {
        const base = add(head.tip, head.arrival, -STYLE.arrowHeadLength);
        const shape = curveBetween(tail.point, t0, base, head.arrival);
        if (!shape) continue;
        const chord = len(sub(base, tail.point));
        // short arrows may turn more: a hook; long ones less
        const ideal = Math.min(150, Math.max(70, 150 - 45 * chord)) * DEGREE;
        const parts = {
          ends: tail.cost + head.cost + (sibling && sibling.tailKey !== tail.key ? 0.8 : 0)
            + (partner?.headNormal && head.normal && head.normal[0] * partner.headNormal[0] + head.normal[1] * partner.headNormal[1] < 0 ? 0.8 : 0),
          lean: (Math.abs(lean) / 60) * 0.3,
          turn: Math.abs(shape.turn - ideal) / (60 * DEGREE) * 0.6
            + Math.max(0, 40 * DEGREE - shape.turn) / (15 * DEGREE)
            + Math.max(0, shape.turn - 200 * DEGREE) / (10 * DEGREE),
          lopsided: (shape.lopsided / (60 * DEGREE)) * 0.5,
          short: Math.max(0, 0.35 - chord) / 0.05,
          approach: newBond ? Math.max(0, angleBetween(head.angle, angleOf(sub(source, target))) - 80 * DEGREE) / (20 * DEGREE) : 0,
          head: headCrowding.get(head),
        };
        candidates.push({ shape, tip: head.tip, key: `${tail.key}${head.key}`, parts, tail, head, lean });
      }
    }
  }
  // Clutter is the slow part: first a rough look (few points along each of
  // the cheapest few hundred curves), then a close one for the best of those.
  const total = (c) => Object.values(c.parts).reduce((s, v) => s + v, 0);
  // (only what is near a curve can be in its way: a Bézier curve stays inside its control points)
  const nearCurve = (c) => {
    const { p0, p1, p2, p3 } = c.shape;
    const xs = [p0[0], p1[0], p2[0], p3[0], c.tip[0]];
    const ys = [p0[1], p1[1], p2[1], p3[1], c.tip[1]];
    const [x1, y1, x2, y2] = [Math.min(...xs) - 0.4, Math.min(...ys) - 0.4, Math.max(...xs) + 0.4, Math.max(...ys) + 0.4];
    const inside = ([x, y]) => x > x1 && x < x2 && y > y1 && y < y2;
    const overlaps = (a, b, c2, d) => a < x2 && c2 > x1 && b < y2 && d > y1;
    return {
      points: avoid.points.filter((o) => inside(o.point)),
      segments: avoid.segments.filter(({ box, segment }) => (box ? overlaps(...box)
        : overlaps(Math.min(segment[0][0], segment[1][0]), Math.min(segment[0][1], segment[1][1]), Math.max(segment[0][0], segment[1][0]), Math.max(segment[0][1], segment[1][1])))),
      lines: avoid.lines.filter(([a, b]) => overlaps(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]))),
    };
  };
  const clutter = (c, n) => {
    const local = c.local ??= nearCurve(c);
    const samples = curvePoints(c.shape, n);
    // (a tail from a bond starts clear of everything: looked at from nearer its start than one from electrons)
    const clear = (p) => len(sub(p, c.shape.p0)) > (from.bond !== undefined ? 0.06 : 0.14) && len(sub(p, c.tip)) > 0.14;
    const inner = [...samples, c.tip].filter(clear);
    const scale = 20 / n; // the same cost per length of curve, however many points
    c.parts.clutter = 0.5 * scale * crowdedness(inner, local);
    // across a bond (or a reaction arrow, a bracket): seen however few the points, and worse than passing near
    const path = [c.shape.p0, ...samples, c.tip];
    let across = 0;
    for (let k = 1; k < path.length; k++) for (const [r, t] of local.lines) if (segmentsCross(path[k - 1], path[k], r, t)) across += 1;
    c.parts.across = 3 * across;
    c.parts.rings = 0.35 * scale * inner.filter((p) => avoid.rings.some((ring) => inRing(p, ring))).length;
    return samples;
  };
  for (const c of candidates) c.cost = total(c);
  candidates.sort((p, q) => p.cost - q.cost);
  const rough = candidates.slice(0, 400);
  for (const c of rough) {
    clutter(c, 6);
    c.cost = total(c);
  }
  rough.sort((p, q) => p.cost - q.cost);
  const close = rough.slice(0, 40);
  const otherNeighbours = paired ? [...scene.bonds.values()].filter((b) => b.bond.id !== from.bond && (fromAtoms.includes(b.a) || fromAtoms.includes(b.b)))
    .map((b) => (fromAtoms.includes(b.a) ? b.b : b.a)) : [];
  for (const c of close) {
    c.samples = clutter(c, 20);
    let crossings = 0;
    for (let k = 1; k < c.samples.length; k++) {
      for (const [r, s] of otherSegments) if (segmentsCross(c.samples[k - 1], c.samples[k], r, s)) crossings += 1;
    }
    c.parts.crossing = 2 * crossings;
    if (paired) {
      // its mirror image, the pair's second arrow: as cluttered, crossing as much, as it would be
      const image = c.samples.map(reflection(scene.pos(fromAtoms[0]), scene.pos(fromAtoms[1])));
      const tip = image.at(-1);
      const inner = image.filter((p) => len(sub(p, image[0])) > 0.14 && len(sub(p, tip)) > 0.14);
      let across = 0;
      let bonds = 0;
      for (let k = 1; k < image.length; k++) {
        for (const [r, s] of otherSegments) if (segmentsCross(image[k - 1], image[k], r, s)) across += 1;
        for (const [r, s] of avoid.lines) if (segmentsCross(image[k - 1], image[k], r, s)) bonds += 1;
      }
      // (and the pair on the open side of the bond, away from its atoms' other bonds: the tBu of tBuO–OtBu)
      const crowding = 0.1 * otherNeighbours.filter((n) => dot(sub(scene.pos(n), source), c.tail.out ?? [0, 0]) > 0).length;
      c.parts.pair = 0.5 * crowdedness(inner, avoid) + 0.35 * inner.filter((p) => avoid.rings.some((ring) => inRing(p, ring))).length + 2 * across + 3 * bonds + crowding;
    }
    c.cost = total(c);
  }
  close.sort((p, q) => p.cost - q.cost);
  if (candidateCache.size > 500) candidateCache.clear();
  candidateCache.set(key, close);
  return mirror ? [mirror, ...close] : close;
}

// A point reflected across the line upright through the middle of p–q (a function of the point).
function reflection(p, q) {
  const u = unit(sub(q, p));
  const middle = midpoint(p, q);
  return (x) => add(x, u, -2 * dot(sub(x, middle), u));
}

// An arrow (its scene geometry: shape, tip, tailKey) reflected across the line upright through the middle of p–q:
// a candidate, starting on the same side of the bond, turning the other way.
function mirrored(arrow, p, q) {
  const u = unit(sub(q, p));
  const point = reflection(p, q);
  const turned = (v) => add(v, u, -2 * dot(v, u));
  const { p0, p1, p2, p3, t1, turn, turnsLeft, lopsided } = arrow.shape;
  const shape = { p0: point(p0), p1: point(p1), p2: point(p2), p3: point(p3), t1: turned(t1), turn, turnsLeft: !turnsLeft, lopsided };
  const tip = point(arrow.tip);
  return {
    shape, tip, key: `${arrow.tailKey}m`, parts: { mirrored: 0 }, cost: 0, lean: 0, samples: curvePoints(shape, 20),
    tail: { key: arrow.tailKey, point: shape.p0 },
    head: { key: 'm', tip, arrival: turned(arrow.shape.t1), angle: angleOf(sub(shape.p3, tip)) },
  };
}

const candidateCache = new Map(); // arrowCandidates: its inputs -> the candidates

// The candidate for a curved arrow, { best, variant }: by its `variant` (0 the best, 1 the best one that starts
// or ends elsewhere or bends the other way, and so on); or, read from a file and not changed since, the one
// nearest the curve it was saved as (`hint`: { points: [p0, p1, p2, p3], tip }), so that it comes back as it was:
// the same curve while olomol draws arrows as it did, the nearest if it draws them otherwise now.
const HINT_CHOICES = 12;
export function pickCurve(candidates, curve) {
  if (!curve.hint) {
    const distinct = distinctCandidates(candidates, (curve.variant ?? 0) + 1);
    const variant = Math.min(curve.variant ?? 0, distinct.length - 1);
    return { best: distinct[variant] ?? null, variant: Math.max(0, variant) };
  }
  const { points, tip } = curve.hint;
  const apart = (c) => [c.shape.p0, c.shape.p1, c.shape.p2, c.shape.p3, c.tip].reduce((sum, p, k) => sum + len(sub(p, k < 4 ? points[k] : tip)), 0);
  const distinct = distinctCandidates(candidates, HINT_CHOICES);
  let variant = -1;
  distinct.forEach((c, k) => {
    if (variant < 0 || apart(c) < apart(distinct[variant])) variant = k;
  });
  return { best: distinct[variant] ?? null, variant: Math.max(0, variant) };
}

// The candidates that look different (another start, end side or bend),
// best first, at most `max`. Variant k of an arrow is the kth of these.
export function distinctCandidates(candidates, max = 8) {
  const seen = new Set();
  const distinct = [];
  for (const c of candidates) {
    const signature = `${c.tail.key}|${c.head.key.startsWith('a') ? Math.round(c.head.angle / (60 * DEGREE)) : c.head.key}|${c.shape.turnsLeft}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    distinct.push(c);
    if (distinct.length >= max) break;
  }
  return distinct;
}

// The drawing of an arrow: { d (the curve), head (its points: the polygon
// of a full head; the tip and the barb's end of a fishhook), barb (a
// fishhook's: the path of its one barb, a stroke turning back from the tip
// to the outside of the bend, a little curved like a hook's), samples }.
export function arrowGeometry(best, electrons) {
  const { shape, tip } = best;
  const left = [-shape.t1[1], shape.t1[0]];
  const outside = shape.turnsLeft ? [-left[0], -left[1]] : left;
  const { p0, p1, p2, p3 } = shape;
  const pt = (p) => `${f(p[0])} ${f(p[1])}`;
  const samples = best.samples ?? curvePoints(shape, 20);
  if (electrons === 1) {
    // (the curve runs on to the tip; the barb leaves it backwards and out)
    const end = add(shape.p3, outside, STYLE.arrowHeadHalfWidth * 1.35);
    const bend = add([(tip[0] + end[0]) / 2, (tip[1] + end[1]) / 2], outside, -STYLE.arrowHeadHalfWidth * 0.3);
    return { d: `M${pt(p0)} C${pt(p1)} ${pt(p2)} ${pt(p3)} L${pt(tip)}`, head: [tip, end], barb: `M${pt(tip)} Q${pt(bend)} ${pt(end)}`, samples };
  }
  const corners = [add(shape.p3, left, STYLE.arrowHeadHalfWidth), add(shape.p3, left, -STYLE.arrowHeadHalfWidth)];
  return { d: `M${pt(p0)} C${pt(p1)} ${pt(p2)} ${pt(p3)}`, head: [tip, ...corners], samples };
}

// SVG of a curved arrow from arrowGeometry, in `color`; `path` turns its
// path data into the drawing's units (as svg.js scales it).
export function arrowMarkup({ d, head, barb }, color, path = (x) => x, n = (v) => v) {
  const line = `stroke="${color}" stroke-width="${f(n(STYLE.arrowLine))}" stroke-linecap="round"`;
  const tip = barb
    ? `<path d="${path(barb)}" fill="none" ${line} stroke-linejoin="round"/>`
    : `<polygon points="${head.map((p) => `${f(n(p[0]))},${f(n(p[1]))}`).join(' ')}" fill="${color}" stroke="${color}" stroke-width="${f(n(0.012))}" stroke-linejoin="round"/>`;
  return `<path d="${path(d)}" fill="none" ${line}/>${tip}`;
}
