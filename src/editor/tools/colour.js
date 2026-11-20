// Colour: painting, highlighting, filling rings.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { addFill, getObject } from '../../model/doc.js';
import { idsInRect } from '../hit.js';
import { rectOf } from './shared.js';

export function paintObjects(ed, ids, color) {
  const targets = ids.filter((id) => getObject(ed.doc, id));
  if (!targets.length) return false;
  ed.change((doc) => targets.forEach((id) => {
    getObject(doc, id).color = color;
  }));
  return true;
}

// Highlights atoms and bonds (null: takes it away, and the fills of rings
// all of whose atoms are among them). A highlighted bond highlights its
// atoms too, so a marked group looks like one region.
export function highlightObjects(ed, ids, color) {
  const targets = new Set();
  for (const id of ids) {
    if (ed.doc.atoms.has(id)) targets.add(id);
    const bond = ed.doc.bonds.get(id);
    if (bond) [bond.id, bond.a, bond.b].forEach((x) => targets.add(x));
  }
  if (!targets.size) return false;
  const fills = color === null ? [...ed.doc.fills.values()].filter((fill) => fill.atoms.every((id) => targets.has(id))).map((fill) => fill.id) : [];
  ed.change((doc) => {
    targets.forEach((id) => {
      getObject(doc, id).highlight = color;
    });
    fills.forEach((id) => doc.fills.delete(id));
  });
  return true;
}

// The smallest ring around a point: its atom ids in order, or null.
function ringAround(scene, [x, y]) {
  const inside = (polygon) => {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
    }
    return result;
  };
  const found = scene.rings.filter((ring) => inside(ring.map(scene.pos)));
  return found.sort((p, q) => p.length - q.length)[0] ?? null;
}

// The fill of the ring around a point: { ring (its atoms), existing (its
// fill, if it has one) }, or null outside rings.
export function fillAt(ed, point) {
  const ring = ringAround(ed.scene, point);
  if (!ring) return null;
  const key = [...ring].sort((p, q) => p - q).join();
  return { ring, existing: [...ed.doc.fills.values()].find((f) => [...f.atoms].sort((p, q) => p - q).join() === key) };
}

// Fills the ring around a point with a colour; clicked again with the same
// colour (or with none, null), the fill goes. True if there was a ring.
export function fillRing(ed, point, color) {
  const found = fillAt(ed, point);
  if (!found) return false;
  const { ring, existing } = found;
  if (!existing && color === null) return true;
  ed.change((doc) => {
    if (existing) doc.fills.delete(existing.id);
    if (color !== null && (!existing || existing.color !== color)) addFill(doc, ring, color);
  });
  return true;
}

// The highlighter: click or box atoms and bonds, or click inside a ring to
// fill it; a highlighted one clicked again with the same colour loses it.
// Without a colour (null) it takes highlights and fills away.
export const highlight = {
  cursor: 'pointer',
  click(ed, g) {
    if (!g.hit || g.hit.kind === 'fill') {
      fillRing(ed, g.start, ed.tool.color);
      return;
    }
    if (g.hit?.kind !== 'atom' && g.hit?.kind !== 'bond') return;
    const object = getObject(ed.doc, g.hit.id);
    highlightObjects(ed, [g.hit.id], object.highlight === ed.tool.color ? null : ed.tool.color);
  },
  drag(ed, g) {
    ed.preview = { kind: 'rect', ...rectOf(g.start, g.point) };
    ed.emit();
  },
  dragEnd(ed, g) {
    ed.preview = null;
    if (!highlightObjects(ed, idsInRect(ed.scene, rectOf(g.start, g.point)), ed.tool.color)) ed.emit();
  },
};

export const paint = {
  cursor: 'pointer',
  click(ed, g) {
    // an orbital's white lobe (the other phase): that lobe painted, the shaded one as it was
    const lobe = g.hit?.kind === 'orbital' ? ed.scene.orbitals.get(g.hit.id)?.lobes[g.hit.lobe] : null;
    if (lobe && !lobe.shaded) ed.change((doc) => { doc.orbitals.get(g.hit.id).colorOther = ed.tool.color; });
    else if (g.hit && g.hit.kind !== 'fill') paintObjects(ed, [g.hit.id], ed.tool.color); // (a ring's fill takes the highlighter's colours)
  },
  drag(ed, g) {
    ed.preview = { kind: 'rect', ...rectOf(g.start, g.point) };
    ed.emit();
  },
  dragEnd(ed, g) {
    ed.preview = null;
    if (!paintObjects(ed, idsInRect(ed.scene, rectOf(g.start, g.point)), ed.tool.color)) ed.emit();
  },
};
