// Stamps: a functional group attached to an atom, a template or what was pasted placed with a see-through copy.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { copyObjects, forEachPoint, freeIds } from '../../model/doc.js';
import { attachGroup, groupPlacement } from '../build.js';
import { aimed } from './rings.js';

// --- functional groups: a stamp ---

// tool: { name: 'group', label, group (a document with one '*' atom) }. As a ring: a click on an
// atom attaches it there by a new bond, dragged from the atom it points at the pointer (snapped to
// 15°); with Shift the atom itself becomes the group's first atom (COOH on a chain's end carbon:
// pentane to pentanoic acid).
function groupPreview(ed, target, options) {
  const { atoms, neighbour } = groupPlacement(ed.doc, target, ed.tool.group, options);
  const at = new Map(atoms.map((a) => [a.from, a]));
  const t = ed.doc.atoms.get(target);
  const lines = [...ed.tool.group.bonds.values()].map((b) => [at.get(b.a) ?? t, at.get(b.b) ?? t]).filter(([p, q]) => p !== q);
  return { kind: 'lines', lines: lines.map(([p, q]) => [p.x, p.y, q.x, q.y]), mark: at.get(neighbour) ?? t };
}

export const group = {
  cursor: 'copy',
  hover(ed, point, hit) {
    ed.preview = hit?.kind === 'atom' ? groupPreview(ed, hit.id, { fused: ed.shiftHeld }) : null;
    ed.emit();
  },
  click(ed, g) {
    const template = ed.tool.group;
    if (g.hit?.kind === 'atom') {
      ed.change((doc) => attachGroup(doc, g.hit.id, template, { fused: g.shift }));
    } else if (!g.hit) {
      // on its own: the attachment point becomes an R
      ed.change((doc) => {
        const xs = [...template.atoms.values()].map((a) => a.x);
        const ys = [...template.atoms.values()].map((a) => a.y);
        const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
        const ids = copyObjects(template, [...template.atoms.keys()], g.start[0] - cx, g.start[1] - cy, doc);
        for (const id of ids) if (doc.atoms.get(id)?.el === '*') doc.atoms.get(id).alias ??= 'R';
      });
    }
  },
  drag(ed, g) {
    if (g.hit?.kind !== 'atom') return;
    ed.preview = groupPreview(ed, g.hit.id, { fused: g.shift, angle: aimed(ed, g) });
    ed.emit();
  },
  dragEnd(ed, g) {
    if (g.hit?.kind !== 'atom') return;
    ed.preview = null;
    ed.change((doc) => attachGroup(doc, g.hit.id, ed.tool.group, { fused: g.shift, angle: aimed(ed, g) }));
  },
  cancel(ed) {
    ed.preview = null;
  },
};

// --- placing a template or what was pasted: a see-through copy follows
// the pointer, a click puts it there ---

// tool: { name: 'place', label, doc, once (one copy, then back to the
// tool `back`, the copy selected: pasting) }
export const place = {
  cursor: 'copy',
  hover(ed, point) {
    // (its middle as placeCopy takes it: a lone arrow or plus has no atoms to take it from)
    ed.preview = { kind: 'place', doc: ed.tool.doc, at: point, middle: middleOf(ed.tool.doc) };
    ed.emit();
  },
  click(ed, g) {
    const template = ed.tool.doc;
    const ids = ed.change((doc) => placeCopy(template, doc, g.start));
    if (ed.tool.once) {
      ed.setTool(ed.tool.back ?? { name: 'select' });
      ed.select(ids);
    }
  },
  cancel(ed) {
    ed.preview = null;
  },
};

// The middle of everything in `template` (atoms, arrows, pluses, texts…): what goes where the click is
export function middleOf(template) {
  const points = [];
  forEachPoint(template, [...template.atoms.keys(), ...freeIds(template)], (o, [kx, ky]) => points.push([o[kx], o[ky]]));
  if (!points.length) return [0, 0];
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

// Copies everything of `template` into `doc`, its middle at `point`.
// Returns the new ids.
export function placeCopy(template, doc, [x, y]) {
  const [cx, cy] = middleOf(template);
  return copyObjects(template, [...template.atoms.keys(), ...freeIds(template)], x - cx, y - cy, doc);
}
