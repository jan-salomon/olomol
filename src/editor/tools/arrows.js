// Reaction arrows with their side arcs, "+" signs and text.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { addArrow, addPlus } from '../../model/doc.js';
import { arrowFrame, textAlign } from '../../render/scene.js';
import { snapAngle } from '../build.js';

// --- reaction arrows, "+", text, colour ---

// --- side arcs of reaction arrows (NAD⁺ → NADH): drawn with the reaction arrow tool, from the
// canvas to an arrow's middle (its anchor: an arc going in) or from there out (one going out) ---

const ANCHOR_REACH = 0.45; // how near an arrow's middle a drag starts or ends to make a side arc

// The reaction arrow whose middle is near `point` (not `skip`, one being drawn), or null.
function anchorAt(ed, point, skip = null) {
  for (const arrow of ed.doc.arrows.values()) {
    if (arrow.id === skip || arrow.kind === 'dipole' || arrow.kind === 'multistep') continue;
    if (Math.hypot((arrow.x1 + arrow.x2) / 2 - point[0], (arrow.y1 + arrow.y2) / 2 - point[1]) < ANCHOR_REACH) return arrow.id;
  }
  return null;
}

// A side arc of `arrow` towards `point` (above or below it, as far along it as the point is),
// as long as an arc it has already when it is about as long (symmetric; further: as dragged).
// `sides`: the arrow's arcs before this one (the one on the same side first to match).
const ARC_SNAP = 0.3;
function arcToward(arrow, point, way, sides) {
  const frame = arrowFrame(arrow);
  const length = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1) || 1;
  const u = [(arrow.x2 - arrow.x1) / length, (arrow.y2 - arrow.y1) / length];
  const [dx, dy] = [point[0] - frame.mid[0], point[1] - frame.mid[1]];
  const side = dx * frame.n[0] + dy * frame.n[1] >= 0 ? 'above' : 'below';
  const reach = snapReach(sides, { side, way }, Math.min(5, Math.max(0.6, Math.abs(dx * u[0] + dy * u[1]))));
  return { side, way, reach: Math.round(reach * 100) / 100 };
}

// `reach` for the arc `entry` (side, way), or the reach of another of the arrow's arcs when it is
// about as long (symmetric), one on the same side first: when an arc is drawn and when it is dragged.
export function snapReach(sides, entry, reach) {
  const others = sides.filter((e) => !(e.side === entry.side && e.way === entry.way)).sort((p, q) => Number(q.side === entry.side) - Number(p.side === entry.side));
  return others.find((e) => Math.abs(e.reach - reach) < ARC_SNAP)?.reach ?? reach;
}

// The arrow's side arcs with `entry` (one going in or out on each side: it replaces the one
// there, keeping its id; a new one gets one of its own).
function withArc(doc, sides, entry) {
  const old = sides.find((e) => e.side === entry.side && e.way === entry.way);
  return [...sides.filter((e) => e !== old), { ...entry, id: old?.id ?? doc.nextId++ }];
}

export const rxn = {
  cursor: 'crosshair',
  // (the anchor of an arrow near the pointer, to draw a side arc from or to)
  hover(ed, point) {
    const id = anchorAt(ed, point);
    const was = ed.preview?.kind === 'anchor' ? ed.preview.id : null;
    if (id === was) return;
    const arrow = id === null ? null : ed.doc.arrows.get(id);
    ed.preview = arrow ? { kind: 'anchor', id, at: [(arrow.x1 + arrow.x2) / 2, (arrow.y1 + arrow.y2) / 2] } : null;
    ed.emit();
  },
  click(ed, g) {
    const length = { dipole: 0.8, multistep: 3, same: 1.2 }[ed.tool.kind] ?? 2;
    ed.change((doc) => addArrow(doc, g.start[0], g.start[1], g.start[0] + length, g.start[1], ed.tool.kind));
  },
  drag(ed, g) {
    if (!g.started) {
      ed.checkpoint();
      g.started = true;
      // from an arrow's middle: an arc going out of it
      g.from = ['forward', 'equilibrium', 'retro', undefined].includes(ed.tool.kind) ? anchorAt(ed, g.start) : null;
      if (g.from !== null) g.before = structuredClone(ed.doc.arrows.get(g.from).sides ?? []);
      else g.drawn = addArrow(ed.doc, g.start[0], g.start[1], g.start[0], g.start[1], ed.tool.kind);
    }
    if (g.from !== null) {
      const arrow = ed.doc.arrows.get(g.from);
      arrow.sides = withArc(ed.doc, g.before, arcToward(arrow, g.point, 'out', g.before));
      delete arrow.lengthByHand;
      ed.touched();
      return;
    }
    // a new arrow, or (ending at another arrow's middle) an arc going in there instead
    const target = ['forward', 'equilibrium', 'retro', undefined].includes(ed.tool.kind) ? anchorAt(ed, g.point, g.drawn.id) : null;
    if (g.into != null && g.into !== target) {
      ed.doc.arrows.get(g.into).sides = g.intoBefore;
      g.into = null;
    }
    if (target !== null) {
      ed.doc.arrows.delete(g.drawn.id);
      if (g.into == null) [g.into, g.intoBefore] = [target, structuredClone(ed.doc.arrows.get(target).sides ?? [])];
      const arrow = ed.doc.arrows.get(target);
      arrow.sides = withArc(ed.doc, g.intoBefore, arcToward(arrow, g.start, 'in', g.intoBefore));
      delete arrow.lengthByHand;
      ed.touched();
      return;
    }
    ed.doc.arrows.set(g.drawn.id, g.drawn);
    const arrow = g.drawn;
    let angle = Math.atan2(g.point[1] - g.start[1], g.point[0] - g.start[0]);
    if (!g.shift) angle = snapAngle(angle, 15);
    const length = Math.max(0.5, Math.hypot(g.point[0] - g.start[0], g.point[1] - g.start[1]));
    [arrow.x2, arrow.y2] = [g.start[0] + length * Math.cos(angle), g.start[1] + length * Math.sin(angle)];
    ed.touched();
  },
};

export const plus = {
  cursor: 'crosshair',
  click(ed, g) {
    ed.change((doc) => addPlus(doc, g.start[0], g.start[1]));
  },
};

// A text opened for writing (the text tool's click, a double click): where it is drawn (on a molecule's anchor or a
// reaction arrow, not where the file has it), its box, so that the field's text stands on it, centred or from the
// right as it is. A text made bold all of it (the panel's Bold) comes in bold, its lines in *{…}, so that the
// field shows it so and B can take it off (it stayed bold, B off, whatever was done).
export function editText(ed, t) {
  const shown = ed.scene.texts.get(t.id);
  const [x, y] = shown?.at ?? [t.x, t.y];
  const value = t.bold ? t.text.split('\n').map((line) => (line ? `*{${line}}` : line)).join('\n') : t.text;
  ed.editing = { id: t.id, x, y, box: shown?.box, value, align: t.align, auto: textAlign(t), size: t.size, family: t.family, bold: Boolean(t.bold) };
}

export const text = {
  cursor: 'text',
  click(ed, g) {
    if (g.hit?.kind === 'text') {
      editText(ed, ed.doc.texts.get(g.hit.id));
    } else {
      ed.editing = { id: null, x: g.start[0], y: g.start[1] + 0.18, value: '', auto: 'left' };
    }
    ed.emit();
  },
};

// Sets the colour of objects (null: back to the default).
