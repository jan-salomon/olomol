// Rings: on the canvas, fused on a bond, hung on an atom or spiro.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { addBond, bondBetween } from '../../model/doc.js';
import { addRing, freeRingCorners, ringAtAtom, ringAtBond, ringOnAtom, snapAngle } from '../build.js';

// --- rings ---

// Where a ring goes: { corners, from (the atom it hangs on by a new bond),
// bond (that bond, for the preview) }. On an atom the ring hangs on it by a
// new bond (a phenyl); with Shift it goes through the atom (spiro, or the
// end of a chain as a ring corner). On a bond it is fused to it, on the
// side with less drawn on it (Shift: the other side).
function ringPlacement(ed, point, hit, shift) {
  const { size } = ed.tool;
  if (hit?.kind === 'atom' && shift) return { corners: ringAtAtom(ed.doc, hit.id, size) };
  if (hit?.kind === 'atom') return { ...ringOnAtom(ed.doc, hit.id, size), from: hit.id };
  if (hit?.kind === 'bond') return { corners: ringAtBond(ed.doc, hit.id, size, shift) };
  return { corners: freeRingCorners(size, point) };
}

// A ring added: hung on atom `from` by a new bond (with atoms of its own, even where it lands on
// others: never fused by accident), or fused or free as placed (from undefined).
function hangRing(ed, doc, corners, from) {
  const [first] = addRing(doc, corners, { aromatic: ed.tool.aromatic, separate: from !== undefined });
  if (from !== undefined && from !== first && !bondBetween(doc, from, first)) addBond(doc, from, first);
}

// Dragged from an atom: the direction to the pointer, snapped to 15°.
export function aimed(ed, g) {
  const atom = ed.doc.atoms.get(g.hit.id);
  return snapAngle(Math.atan2(g.point[1] - atom.y, g.point[0] - atom.x), 15);
}

// (Shift: through the atom, spiro, that way)
function ringDragged(ed, g) {
  if (g.shift) return { corners: ringAtAtom(ed.doc, g.hit.id, ed.tool.size, aimed(ed, g)) };
  return ringOnAtom(ed.doc, g.hit.id, ed.tool.size, aimed(ed, g));
}

export const ring = {
  cursor: 'crosshair',
  hover(ed, point, hit) {
    const target = hit?.kind === 'atom' || hit?.kind === 'bond' ? hit : null;
    const { corners, bond } = ringPlacement(ed, point, target, ed.shiftHeld);
    ed.preview = { kind: 'ghost', polygon: corners, bond };
    ed.emit();
  },
  click(ed, g) {
    const hit = g.hit?.kind === 'atom' || g.hit?.kind === 'bond' ? g.hit : null;
    const { corners, from } = ringPlacement(ed, g.start, hit, g.shift);
    ed.change((doc) => hangRing(ed, doc, corners, from));
  },
  // dragged from an atom: the ring hangs on it by a bond pointing at the pointer (snapped to 15°;
  // Shift: through the atom), so a crowded atom (Ph3P=O) gets its rings where they go
  drag(ed, g) {
    if (g.hit?.kind !== 'atom') return;
    const { corners, bond } = ringDragged(ed, g);
    ed.preview = { kind: 'ghost', polygon: corners, bond };
    ed.emit();
  },
  dragEnd(ed, g) {
    if (g.hit?.kind === 'atom') {
      ed.preview = null;
      const { corners } = ringDragged(ed, g);
      ed.change((doc) => hangRing(ed, doc, corners, g.shift ? undefined : g.hit.id));
      return;
    }
    ring.click(ed, { ...g, start: g.point, hit: ed.hitAt(g.point) });
  },
  cancel(ed) {
    ed.preview = null;
  },
};
