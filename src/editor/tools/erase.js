// The eraser.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { deleteObjects } from '../../model/doc.js';
import { idsInRect } from '../hit.js';
import { rectOf } from './shared.js';
import { fillAt } from './colour.js';

// --- erase ---

export const erase = {
  cursor: 'crosshair',
  click(ed, g) {
    if (!g.hit) {
      // inside a filled ring: the fill
      const fill = fillAt(ed, g.start)?.existing;
      if (fill) ed.change((doc) => doc.fills.delete(fill.id));
      return;
    }
    // a reaction arrow's side arc: only that arc (what was at its free end goes onto the arrow, that side)
    if (g.hit.arc) {
      ed.change((doc) => deleteObjects(doc, [g.hit.arcId]));
      return;
    }
    ed.change((doc) => deleteObjects(doc, [g.hit.id]));
  },
  drag(ed, g) {
    ed.preview = { kind: 'rect', ...rectOf(g.start, g.point), erase: true };
    ed.emit();
  },
  dragEnd(ed, g) {
    ed.preview = null;
    const ids = idsInRect(ed.scene, rectOf(g.start, g.point));
    if (ids.length) ed.change((doc) => deleteObjects(doc, ids));
  },
};
