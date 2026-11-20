// What is under a point: an atom (its corner or label), one of its lone
// pairs or unpaired electrons, a bond, a curved or reaction arrow, a "+" or
// text. Right on an atom wins; then a bond's line, even near its end; then
// electrons; then whatever is a little further away.
import { distanceToSegment } from '../layout/geometry.js';
import { NEWMAN_RADIUS } from '../chem/newman.js';

// A Newman projection: its front carbon right in the middle, the bond seen end on round it, the back
// carbon on the circle.
const FRONT = 0.12;
const BACK = 0.28;

const inBox = ([x, y], b, pad = 0) => x >= b.x1 - pad && x <= b.x2 + pad && y >= b.y1 - pad && y <= b.y2 + pad;

// Returns { kind: 'atom' | 'bond' | 'curve' | 'arrow' | 'plus' | 'text' | 'bracket' |
// 'orbital' (lobe: which of its lobes) | 'overlap' | 'fill', id, distance, pair?, radical?, arc and arcId? (a reaction arrow's side arc: its key and id) } or null. `only`: kinds to consider.
// Inside a filled ring, with nothing else there, the fill: it stands for its
// ring (a click selects the ring, a double click the molecule, a drag moves it).
export function hitTest(scene, point, { only = null, skip = new Set() } = {}) {
  const wants = (kind) => !only || only.includes(kind);
  const [x, y] = point;
  let atom = null;
  let bond = null;
  let electron = null;
  if (wants('atom')) {
    for (const info of scene.atoms.values()) {
      if (skip.has(info.atom.id)) continue;
      let distance = Math.hypot(info.pos[0] - x, info.pos[1] - y);
      if (scene.newmanBacks?.has(info.atom.id)) distance = distance >= BACK ? Math.abs(distance - NEWMAN_RADIUS) : Infinity;
      else if (scene.newmanFronts?.has(info.atom.id) && distance >= FRONT) distance = Infinity;
      if (info.label && info.label.boxes.some((b) => inBox([x - info.pos[0], y - info.pos[1]], b, 0.04))) distance = Math.min(distance, 0.1);
      if (!atom || distance < atom.distance) atom = { kind: 'atom', id: info.atom.id, distance };
      info.electrons.slots.forEach((slot, k) => {
        const d = Math.hypot(slot.point[0] - x, slot.point[1] - y);
        if (slot.shown && (!electron || d < electron.distance)) electron = { kind: 'atom', id: info.atom.id, distance: d, pair: k };
      });
      for (const e of info.electrons.unpaired) {
        const d = Math.hypot(e.point[0] - x, e.point[1] - y);
        if (!electron || d < electron.distance) electron = { kind: 'atom', id: info.atom.id, distance: d, radical: true };
      }
    }
  }
  if (wants('bond')) {
    for (const { bond: b } of scene.bonds.values()) {
      if (skip.has(b.id) || b.kind === 'link') continue;
      let distance = distanceToSegment(point, scene.pos(b.a), scene.pos(b.b));
      if (scene.newmanAxles?.has(b.id)) distance = distance >= FRONT && distance < BACK ? 0.05 : Infinity;
      if (!bond || distance < bond.distance) bond = { kind: 'bond', id: b.id, distance };
    }
  }
  const within = (hit, reach) => (hit && hit.distance <= reach ? hit : null);
  // (on a Newman projection's circle, a bond right under the pointer: the bond, not the back carbon)
  if (atom && scene.newmanBacks?.has(atom.id) && bond && bond.distance < 0.07 && !scene.newmanAxles?.has(bond.id)) return bond;
  const close = within(atom, 0.2) ?? within(bond, 0.12) ?? within(electron, 0.16);
  if (close) return close;
  // inside an orbital's lobe: the orbital, unless right on its atom or a bond (a lobe reaches out from its atom)
  if (wants('orbital')) {
    for (const { orbital, lobes } of [...(scene.orbitals?.values() ?? [])].reverse()) {
      const lobe = lobes.findIndex((l) => insidePolygon(point, l.polygon));
      if (lobe >= 0 && !skip.has(orbital.id)) return { kind: 'orbital', id: orbital.id, lobe, distance: 0 };
    }
  }
  const chemistry = within(atom, 0.33) ?? within(bond, 0.22);
  if (chemistry) return chemistry;

  let other = null;
  const consider = (hit) => {
    if (!other || hit.distance < other.distance) other = hit;
  };
  if (wants('curve')) {
    for (const { curve, samples } of scene.curves.values()) {
      for (let k = 1; k < samples.length; k++) consider({ kind: 'curve', id: curve.id, distance: distanceToSegment(point, samples[k - 1], samples[k]) });
    }
  }
  if (wants('arrow')) {
    for (const { arrow, arcs = [] } of scene.arrows.values()) {
      consider({ kind: 'arrow', id: arrow.id, distance: distanceToSegment(point, [arrow.x1, arrow.y1], [arrow.x2, arrow.y2]) });
      // its side arcs: the arrow too, and which arc (arc: the key, `${id}|${side}-${way}`)
      for (const { key, id: arcId, samples } of arcs) {
        for (let k = 1; k < samples.length; k++) consider({ kind: 'arrow', id: arrow.id, arc: key, arcId, distance: distanceToSegment(point, samples[k - 1], samples[k]) });
      }
    }
  }
  if (wants('plus')) {
    for (const { plus } of scene.pluses.values()) consider({ kind: 'plus', id: plus.id, distance: Math.max(0, Math.hypot(plus.x - x, plus.y - y) - 0.25) });
  }
  if (wants('text')) {
    for (const { text, box } of scene.texts.values()) if (inBox(point, box, 0.05)) consider({ kind: 'text', id: text.id, distance: 0 });
  }
  if (wants('bracket')) {
    // its two sides (and their hooks), and the text beside it
    for (const { bracket, sides, box } of scene.brackets.values()) {
      for (const [x1, y1, x2, y2] of sides) consider({ kind: 'bracket', id: bracket.id, distance: Math.max(0, distanceToSegment(point, [x1, y1], [x2, y2]) - 0.1) });
      if (point[0] > sides[1][0] && inBox(point, box, 0.03)) consider({ kind: 'bracket', id: bracket.id, distance: 0 });
    }
  }
  const near = within(other, 0.18);
  if (near) return near;
  // the dashed line between two orbitals
  if (wants('orbital')) {
    let line = null;
    for (const { overlap, line: [p, q] } of scene.overlaps?.values() ?? []) {
      const distance = distanceToSegment(point, p, q);
      if (distance < 0.12 && (!line || distance < line.distance)) line = { kind: 'overlap', id: overlap.id, distance };
    }
    if (line) return line;
  }
  if (!wants('fill')) return null;
  for (const { fill, polygon } of scene.fills) if (insidePolygon(point, polygon)) return { kind: 'fill', id: fill.id, distance: 0 };
  return null;
}

// Is the point inside the polygon (even-odd)?
function insidePolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [[xi, yi], [xj, yj]] = [polygon[i], polygon[j]];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Ids of everything inside a rectangle (x1 < x2, y1 < y2): atoms by their
// position, bonds with both atoms inside, arrows with both ends inside,
// curved arrows whose curve lies inside, "+" and text by their middle.
export function idsInRect(scene, { x1, y1, x2, y2 }) {
  const inside = ([x, y]) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
  const ids = [];
  for (const info of scene.atoms.values()) if (inside(info.pos)) ids.push(info.atom.id);
  const atoms = new Set(ids);
  for (const { bond } of scene.bonds.values()) if (atoms.has(bond.a) && atoms.has(bond.b)) ids.push(bond.id);
  for (const { arrow } of scene.arrows.values()) if (inside([arrow.x1, arrow.y1]) && inside([arrow.x2, arrow.y2])) ids.push(arrow.id);
  for (const { plus } of scene.pluses.values()) if (inside([plus.x, plus.y])) ids.push(plus.id);
  for (const { text, box } of scene.texts.values()) if (inside([(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2])) ids.push(text.id);
  for (const { curve, samples } of scene.curves.values()) if (samples.every(inside)) ids.push(curve.id);
  for (const { bracket, box } of scene.brackets.values()) if (inside([box.x1, box.y1]) && inside([box.x2, box.y2])) ids.push(bracket.id);
  return withOrbitals(scene, ids, atoms);
}

// The orbitals on these atoms, and the lines between orbitals that are both in, added to `ids`.
function withOrbitals(scene, ids, atoms) {
  const orbitals = new Set();
  for (const { orbital } of scene.orbitals?.values() ?? []) if (atoms.has(orbital.atom)) orbitals.add(orbital.id);
  for (const { overlap } of scene.overlaps?.values() ?? []) if (orbitals.has(overlap.a) && orbitals.has(overlap.b)) ids.push(overlap.id);
  return [...ids, ...orbitals];
}

// Ids inside a closed polygon (lasso), with the same rules as idsInRect.
export function idsInPolygon(scene, polygon) {
  const inside = ([x, y]) => {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
    }
    return result;
  };
  const ids = [];
  for (const info of scene.atoms.values()) if (inside(info.pos)) ids.push(info.atom.id);
  const atoms = new Set(ids);
  for (const { bond } of scene.bonds.values()) if (atoms.has(bond.a) && atoms.has(bond.b)) ids.push(bond.id);
  for (const { arrow } of scene.arrows.values()) if (inside([arrow.x1, arrow.y1]) && inside([arrow.x2, arrow.y2])) ids.push(arrow.id);
  for (const { plus } of scene.pluses.values()) if (inside([plus.x, plus.y])) ids.push(plus.id);
  for (const { text, box } of scene.texts.values()) if (inside([(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2])) ids.push(text.id);
  for (const { curve, samples } of scene.curves.values()) if (samples.every(inside)) ids.push(curve.id);
  // (a bracket with all four corners inside, as a box takes one with its two)
  for (const { bracket, box } of scene.brackets.values()) if ([[box.x1, box.y1], [box.x2, box.y1], [box.x1, box.y2], [box.x2, box.y2]].every(inside)) ids.push(bracket.id);
  return withOrbitals(scene, ids, atoms);
}
