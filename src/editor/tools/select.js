// The select tool: click, Shift+click, a box or a lasso; moving, rotating, snapping texts and molecules onto anchors and arrows.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { arcToOtherSide, bracketsOfMolecule, dropLooseCurves, forEachPoint, mapBracket, mapText, orbitalAngle, setOrbitalAngle } from '../../model/doc.js';
import { fragments } from '../../model/graph.js';
import { anchorTargets, arrowFrame, arrowTargets, arrowVariants, layoutText, moleculeBox, putOnAnchor, putOnArrow } from '../../render/scene.js';
import { atomNear, joinAtom, mergeLanded, snapAngle } from '../build.js';
import { groupChain, groupIds, groupToPick } from '../grouping.js';
import { idsInPolygon, idsInRect } from '../hit.js';
import { DEGREE, rectOf } from './shared.js';
import { snapReach } from './arrows.js';
import { turnOrbital } from './orbitals.js';

// --- select: click, shift-click, drag a box (or a lasso), move, rotate ---

// The rotation handle above the selection, in model coordinates, or null.
export function rotationHandle(ed) {
  const box = selectionBox(ed);
  if (!box || ed.movingIds().length < 2) return null;
  return { point: [(box.x1 + box.x2) / 2, box.y1 - 0.9], centre: [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2], box };
}

export function selectionBox(ed) {
  const points = [];
  forEachPoint(ed.doc, ed.movingIds(), (object, [kx, ky]) => points.push([object[kx], object[ky]]));
  for (const id of ed.selected('texts')) {
    const t = ed.scene.texts.get(id);
    if (t) points.push([t.box.x1, t.box.y1], [t.box.x2, t.box.y2]);
  }
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x1: Math.min(...xs) - 0.3, y1: Math.min(...ys) - 0.3, x2: Math.max(...xs) + 0.3, y2: Math.max(...ys) + 0.3 };
}

// The boxes round all groups, as drawn (labels and texts included): Map group → { x1, y1, x2, y2, depth }, a group
// round others wider by a step for each level inside it, so that nested ones show as boxes in boxes. Worked out
// once for each drawing of the scene.
const boxesByScene = new WeakMap();
export function groupBoxes(ed) {
  const { scene, doc } = ed;
  if (!doc.groups?.size) return new Map();
  if (boxesByScene.has(scene)) return boxesByScene.get(scene);
  const height = (id, seen = new Set()) => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const inner = (doc.groups.get(id)?.members ?? []).filter((one) => doc.groups.has(one));
    return inner.length ? 1 + Math.max(...inner.map((one) => height(one, seen))) : 0;
  };
  const boxes = new Map();
  for (const id of doc.groups.keys()) {
    const points = [];
    const ids = idsOfGroup(ed, id);
    forEachPoint(doc, ids, (object, [kx, ky]) => points.push([object[kx], object[ky]]));
    for (const one of ids) {
      const text = scene.texts.get(one);
      if (text) points.push([text.box.x1, text.box.y1], [text.box.x2, text.box.y2]);
      // (an atom's label as drawn: CH3 reaches beyond its atom)
      const atom = scene.atoms.get(one);
      for (const box of atom?.label?.boxes ?? []) points.push([atom.pos[0] + box.x1, atom.pos[1] + box.y1], [atom.pos[0] + box.x2, atom.pos[1] + box.y2]);
    }
    if (!points.length) continue;
    const depth = height(id);
    const room = 0.3 + 0.25 * depth;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    boxes.set(id, { x1: Math.min(...xs) - room, y1: Math.min(...ys) - room, x2: Math.max(...xs) + room, y2: Math.max(...ys) + room, depth });
  }
  boxesByScene.set(scene, boxes);
  return boxes;
}

// What a box (or lasso) being dragged takes: what lies in it; with Ctrl, the whole of the outermost group of
// each thing it takes (a group touched is a group taken). Shown while dragging, selected when let go.
function takenBy(ed, g) {
  const ids = g.mode === 'box' ? idsInRect(ed.scene, rectOf(g.start, g.point)) : idsInPolygon(ed.scene, g.path);
  if (!g.ctrl || !ed.doc.groups?.size) return ids;
  const outer = new Set(ids.map((id) => groupChain(ed.doc, id).at(-1)).filter((group) => group !== undefined));
  return [...new Set([...ids, ...[...outer].flatMap((group) => idsOfGroup(ed, group))])];
}

// A group selected, all of it, as Ctrl+click selects it (the panel's and the right-click menu's buttons)
export function selectGroup(ed, group) {
  ed.select(idsOfGroup(ed, group));
  ed.groupPick = group;
}

// The innermost group of something selected (the first that is in one), for "Select its group"; null: none
export function groupOfSelection(ed) {
  if (!ed.doc.groups?.size) return null;
  for (const id of ed.selection) {
    const [group] = groupChain(ed.doc, id);
    if (group !== undefined) return group;
  }
  return null;
}

// The group a Ctrl+click on object `id` would pick (null: none), and the group that is what is selected now
// (picked by Ctrl+click or made by Ctrl+G; null: the selection is not a group)
export const groupUnder = (ed, id) => groupToPick(ed, id, (one) => idsOfGroup(ed, one));
export function selectedGroup(ed) {
  const group = ed.groupPick;
  if (group == null || !ed.doc.groups?.has(group)) return null;
  const ids = idsOfGroup(ed, group);
  return ids.length === ed.selection.size && ids.every((one) => ed.selection.has(one)) ? group : null;
}

// A drag of whole molecules, none of their atoms to join another: the canvas slides their drawing as it
// was at the start ({ scene, keys (their layers in it), dx, dy }), not drawing them again at every step,
// which a large drawing can't keep up with (Canvas.jsx checks they are where the slide puts them)
function slideOf(ed, g) {
  if (g.landing.length) return null;
  const moving = new Set(g.ids);
  const { scene } = ed;
  const keys = new Set();
  for (const members of scene.frags) {
    const n = members.reduce((sum, id) => sum + moving.has(id), 0);
    if (n && n < members.length) return null; // (part of a molecule: its bonds to the rest stretch)
    if (n) keys.add(`m${members[0]}`);
  }
  return keys.size ? { scene, keys, dx: 0, dy: 0 } : null;
}

// The ends of the selected reaction arrows, for dragging: [{ id, end: 1 | 2, point }].
export function arrowHandles(ed) {
  const arcHandles = (id, entries) => entries.map((entry) => ed.scene.arrowArcs.get(`${id}|${entry.side}-${entry.way}`)).filter(Boolean)
    .map((arc) => ({ id, end: arc.key, arc: arc.key, point: arc.free, reachTo: Math.abs(arc.meetAt) }));
  const selected = new Set(ed.selected('arrows'));
  return [...ed.doc.arrows.values()].flatMap((a) => {
    // a selected arrow: its ends, and the free ends of its side arcs (dragged: how far the arc reaches);
    // a selected side arc: its free end
    if (selected.has(a.id)) return [{ id: a.id, end: 1, point: [a.x1, a.y1] }, { id: a.id, end: 2, point: [a.x2, a.y2] }, ...arcHandles(a.id, a.sides ?? [])];
    return arcHandles(a.id, (a.sides ?? []).filter((entry) => ed.selection.has(entry.id)));
  });
}

export const select = {
  cursor: 'default',
  down(ed, g) {
    // the end of a selected reaction arrow: drag it to make the arrow longer, shorter or turn it
    const end = arrowHandles(ed).find((h) => Math.hypot(g.start[0] - h.point[0], g.start[1] - h.point[1]) < 0.25);
    if (end) {
      g.mode = 'arrowEnd';
      g.end = end;
      return;
    }
    const handle = rotationHandle(ed);
    if (handle && Math.hypot(g.start[0] - handle.point[0], g.start[1] - handle.point[1]) < 0.3) {
      g.mode = 'rotate';
      g.centre = handle.centre;
      return;
    }
    if (g.ctrl && g.hit && groupChain(ed.doc, g.hit.id).length) {
      // Ctrl on something grouped: its innermost group picked on the press (so that a drag moves it), unless it
      // is selected already (then a drag moves what is selected; a click picks the group round it: click)
      g.mode = 'move';
      g.grouped = true;
      g.wasSelected = ed.selection.has(g.hit.id);
      if (!g.wasSelected) pickGroup(ed, g.hit, g.shift);
      return;
    }
    if (g.hit?.kind === 'curve') {
      // dragging a curved arrow bends it: the way of drawing it that passes nearest the pointer
      g.mode = 'bend';
      if (!g.shift) ed.select([g.hit.id]);
      g.variants = arrowVariants(ed.scene, g.hit.id);
      return;
    }
    if (g.hit?.kind === 'fill') {
      // a filled ring: its ring selected (unless it already is, as part of a selected molecule), then moved
      g.mode = 'move';
      const ring = ringOfFill(ed.doc, g.hit.id);
      if (!ring.every((id) => ed.selection.has(id))) ed.select(ring, { add: g.shift });
      g.fill = g.hit.id;
      g.hit = { ...g.hit, id: ring[0] };
      return;
    }
    if (g.hit?.kind === 'orbital') {
      // an orbital's lobe: selected; dragged, the orbital turns on its atom
      g.mode = 'orbit';
      // (with Shift the click adds or takes it out, as an atom: not the press as well)
      if (!g.shift && !ed.selection.has(g.hit.id)) ed.select([g.hit.id]);
      return;
    }
    if (g.hit?.arcId != null) {
      // a reaction arrow's side arc: only it selected (Delete takes it off, what is at its end stays)
      g.mode = 'arc';
      ed.select([g.hit.arcId], { add: g.shift });
      return;
    }
    if (g.hit) {
      g.mode = 'move';
      if (!ed.selection.has(g.hit.id) && !g.shift) ed.select([g.hit.id]);
      return;
    }
    g.mode = ed.tool.lasso ? 'lasso' : 'box';
    g.path = [g.start];
  },
  drag(ed, g) {
    if (g.mode === 'arrowEnd') {
      if (!g.started) {
        ed.checkpoint();
        g.started = true;
      }
      const arrow = ed.doc.arrows.get(g.end.id);
      if (g.end.arc) {
        // a side arc's free end: as far along the arrow as the pointer is (its curve kept); across
        // the arrow, to the other side (what stands at its end with it)
        g.entry ??= (arrow.sides ?? []).find((e) => `${arrow.id}|${e.side}-${e.way}` === g.end.arc);
        const entry = g.entry;
        if (!entry) return;
        const frame = arrowFrame(arrow);
        const length = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1) || 1;
        const u = [(arrow.x2 - arrow.x1) / length, (arrow.y2 - arrow.y1) / length];
        const [dx, dy] = [g.point[0] - frame.mid[0], g.point[1] - frame.mid[1]];
        const side = dx * frame.n[0] + dy * frame.n[1] >= 0 ? 'above' : 'below';
        if (side !== entry.side) arcToOtherSide(ed.doc, arrow, entry);
        // (where it meets the arrow, from the middle: as the scene last drew it)
        const drawn = ed.scene.arrowArcs.get(`${arrow.id}|${entry.side}-${entry.way}`);
        const offset = drawn?.id === entry.id ? Math.abs(drawn.meetAt) - entry.reach : 0;
        entry.reach = Math.round(snapReach(arrow.sides, entry, Math.min(5, Math.max(0.6, Math.abs(dx * u[0] + dy * u[1]) - offset))) * 100) / 100;
        delete arrow.lengthByHand; // (as long as its arcs need again)
        ed.touched();
        return;
      }
      // (made this long by hand: its own length now, and left so whatever its arcs need)
      delete arrow.ownLength;
      arrow.lengthByHand = true;
      const [fx, fy] = g.end.end === 1 ? [arrow.x2, arrow.y2] : [arrow.x1, arrow.y1]; // the other end stays
      let angle = Math.atan2(g.point[1] - fy, g.point[0] - fx);
      if (!g.shift) angle = snapAngle(angle, 15);
      const length = Math.max(0.6, Math.hypot(g.point[0] - fx, g.point[1] - fy));
      const [x, y] = [fx + length * Math.cos(angle), fy + length * Math.sin(angle)];
      if (g.end.end === 1) [arrow.x1, arrow.y1] = [x, y];
      else [arrow.x2, arrow.y2] = [x, y];
      ed.touched();
    } else if (g.mode === 'orbit') {
      turnOrbital(ed, g, g.hit.id, g.hit.lobe);
    } else if (g.mode === 'bend') {
      const distance = (samples) => Math.min(...samples.map((p) => Math.hypot(p[0] - g.point[0], p[1] - g.point[1])));
      const nearest = g.variants.reduce((best, v) => (!best || distance(v.samples) < distance(best.samples) ? v : best), null);
      const curve = ed.doc.curves.get(g.hit.id);
      if (!nearest || !curve || (curve.variant ?? 0) === nearest.variant) return;
      if (!g.started) {
        ed.checkpoint();
        g.started = true;
      }
      curve.variant = nearest.variant;
      ed.touched();
    } else if (g.mode === 'move') {
      if (!g.started) {
        if (!g.grouped && !ed.selection.has(g.hit.id)) ed.select([g.hit.id], { add: g.shift });
        ed.checkpoint();
        g.started = true;
        g.ids = ed.movingIds();
        g.original = [];
        forEachPoint(ed.doc, g.ids, (object, keys) => g.original.push([object, keys, object[keys[0]], object[keys[1]]]));
        // one or two atoms (an atom, a bond) join an atom they are dropped on
        const atoms = g.original.filter(([object]) => ed.doc.atoms.get(object.id) === object).map(([object]) => object);
        g.landing = atoms.length <= 2 ? atoms : [];
        // text dragged on its own comes off its anchor (a molecule's or an arrow's); let go near one, it snaps there
        Object.assign(g, takeOff(ed, g.ids, atoms.length));
        g.slide = slideOf(ed, g);
      }
      unpark(ed, g);
      let [dx, dy] = [g.point[0] - g.start[0], g.point[1] - g.start[1]];
      const moving = new Set(g.ids);
      for (const atom of g.landing) {
        const start = g.original.find(([object]) => object === atom);
        const target = atomNear(ed.doc, start[2] + dx, start[3] + dy, moving);
        if (target === undefined) continue;
        // snapped onto it: shown joined already
        [dx, dy] = [ed.doc.atoms.get(target).x - start[2], ed.doc.atoms.get(target).y - start[3]];
        g.parked = { atom, target, selected: ed.selection.has(atom.id) };
        break;
      }
      for (const [object, [kx, ky], x, y] of g.original) [object[kx], object[ky]] = [x + dx, y + dy];
      if (g.slide) Object.assign(g.slide, { dx, dy });
      if (g.parked) park(ed, g.parked);
      if (g.texts.length === 1) snapText(ed, g, ed.doc.texts.get(g.texts[0]));
      else if (g.molecule && !g.parked) snapMolecule(ed, g);
      else g.snap = null;
      ed.touched();
    } else if (g.mode === 'rotate') {
      if (!g.started) {
        ed.checkpoint();
        g.started = true;
        g.ids = ed.movingIds();
        g.original = [];
        forEachPoint(ed.doc, g.ids, (object, keys) => g.original.push([object, keys, object[keys[0]], object[keys[1]]]));
        const moving = new Set(g.ids);
        g.orbitals = [...ed.doc.orbitals.values()].filter((o) => moving.has(o.atom)).map((o) => [o, orbitalAngle(ed.doc, o)]);
        // (texts turn about their middles, upright; brackets drawn as boxes stay upright round what turns)
        g.texts = g.ids.filter((id) => ed.doc.texts.has(id) && ed.scene.texts.get(id)).map((id) => [ed.doc.texts.get(id), [ed.doc.texts.get(id).x, ed.doc.texts.get(id).y], { ...ed.scene.texts.get(id).box }]);
        g.boxes = g.ids.map((id) => ed.doc.brackets.get(id)).filter((b) => b && !b.atoms?.length).map((b) => [b, { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 }]);
        // (3D models turn as they move round: about the line of sight, as much)
        g.models = g.ids.map((id) => ed.doc.models?.get(id)).filter(Boolean).map((m) => [m, m.rotation ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]]]);
      }
      const [cx, cy] = g.centre;
      let angle = Math.atan2(g.point[1] - cy, g.point[0] - cx) - Math.atan2(g.start[1] - cy, g.start[0] - cx);
      if (!g.shift) angle = snapAngle(angle, 15);
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      for (const [object, [kx, ky], x, y] of g.original) {
        object[kx] = cx + (x - cx) * cos - (y - cy) * sin;
        object[ky] = cy + (x - cx) * sin + (y - cy) * cos;
      }
      for (const [orbital, before] of g.orbitals) setOrbitalAngle(ed.doc, orbital, before + angle);
      const turn = ([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
      for (const [text, at, box] of g.texts) mapText(text, at, box, turn);
      for (const [bracket, box] of g.boxes) mapBracket(bracket, box, turn);
      // (the page's y is down, a model's up: turned the other way round its z)
      const spin = [[cos, sin, 0], [-sin, cos, 0], [0, 0, 1]];
      for (const [model, before] of g.models) model.rotation = spin.map((row) => [0, 1, 2].map((j) => row[0] * before[0][j] + row[1] * before[1][j] + row[2] * before[2][j]));
      ed.preview = { kind: 'angle', centre: g.centre, text: `${Math.round(((angle / DEGREE) % 360 + 360) % 360)}°` };
      ed.touched();
    } else if (g.mode === 'box') {
      // (and what letting go would select, shown as it grows: `taking`)
      ed.preview = { kind: 'rect', ...rectOf(g.start, g.point), taking: takenBy(ed, g), adding: g.shift };
      ed.emit();
    } else if (g.mode === 'lasso') {
      g.path.push(g.point);
      ed.preview = { kind: 'lasso', points: g.path, taking: takenBy(ed, g), adding: g.shift };
      ed.emit();
    }
  },
  dragEnd(ed, g) {
    ed.preview = null;
    if (g.mode === 'move' && g.started) {
      // atoms dropped onto others join them (the one snapped on already is)
      const moved = ed.selectedAtoms();
      if (moved.length <= 2) mergeLanded(ed.doc, moved);
      if (g.parked) dropLooseCurves(ed.doc); // (an arrow on the bond between the two joined atoms: no bond left)
      // a text let go at an anchor, a molecule at an arrow: on it
      if (g.snap?.molecule) putOnArrow(ed.doc, g.snap, g.snap.molecule.map((id) => ed.doc.atoms.get(id)));
      else if (g.snap?.arrow != null) putOnArrow(ed.doc, g.snap, [ed.doc.texts.get(g.texts[0])]);
      else if (g.snap) putOnAnchor(ed.doc, g.snap, ed.doc.texts.get(g.texts[0]));
      ed.touched();
    } else if (g.mode === 'box' || g.mode === 'lasso') {
      ed.select(takenBy(ed, g), { add: g.shift });
    }
  },
  click(ed, g) {
    if (g.mode === 'rotate' || g.mode === 'arrowEnd' || g.mode === 'arc') return;
    if (g.grouped) {
      // Ctrl+click: the press picked the innermost group; on what was selected already, the group round it
      // (or, on a group just picked, the one round that)
      if (g.wasSelected) pickGroup(ed, g.hit, g.shift);
      return;
    }
    if (g.fill !== undefined) {
      // a filled ring clicked: its ring (selected on the press; a molecule selected already shrinks to the ring)
      if (!g.shift) ed.select(ringOfFill(ed.doc, g.fill));
      return;
    }
    // a third click, half a second after a double click at the same place: the reaction row (the browser sends no
    // click for it, the drawing having changed under the pointer)
    const double = ed.lastDouble;
    ed.lastDouble = null;
    if (g.hit && g.hit.kind !== 'text' && double && performance.now() - double.time < 500
      && Math.hypot(g.start[0] - double.point[0], g.start[1] - double.point[1]) * ed.view.scale < 8) {
      selectRow(ed, g.hit, { add: g.shift });
      return;
    }
    if (!g.hit) ed.clearSelection();
    else if (g.shift) {
      // (the same thing again at once is the second half of a Shift+double click, which adds the whole
      // molecule: not toggled back out, or the browser, seeing the drawing change, sends no double click)
      const now = performance.now();
      const again = ed.lastToggle?.id === g.hit.id && now - ed.lastToggle.time < 500;
      ed.lastToggle = { id: g.hit.id, time: now };
      if (!again) ed.toggleSelected(g.hit.id);
    } else ed.select([g.hit.id]);
  },
};

// What a move takes off the anchor or arrow it was placed on (else the place puts it back): a text moved on its
// own (no atoms moving with it: `atoms`, how many), from a molecule's anchor or an arrow, its sign in front too
// (− AlCl3: it came back on the next arrow); a whole molecule moved without its arrow. For a drag and the arrow
// keys alike. Returns { texts, molecule }.
export function takeOff(ed, ids, atoms) {
  const texts = atoms ? [] : ids.filter((id) => ed.doc.texts.has(id));
  for (const id of texts) {
    const text = ed.doc.texts.get(id);
    for (const key of ['anchor', 'slot', 'drop', 'arrow', 'order', 'arrowSign']) delete text[key];
  }
  const molecule = movedMolecule(ed, ids);
  for (const id of molecule ?? []) for (const key of ['arrow', 'arrowSlot', 'arrowSign', 'arrowOrder']) delete ed.doc.atoms.get(id)[key];
  return { texts, molecule };
}

// An atom dragged onto another, shown as joined to it while it is there (joinAtom: its bonds, curved arrows,
// texts, fills, orbitals moved to the other atom). `parked`: { atom, target }; how to undo it is kept in it for
// unpark.
function park(ed, parked) {
  parked.undo = joinAtom(ed.doc, parked.atom.id, parked.target);
}

// The parked atom back where it was dragged from (the pointer moved on).
function unpark(ed, g) {
  const parked = g.parked;
  if (!parked) return;
  parked.undo();
  if (parked.selected) ed.selection.add(parked.atom.id);
  g.parked = null;
}

// The atom of the molecule a hit is on (an atom, a bond's first atom, a
// filled ring's first atom), or null.
export function atomOfHit(doc, hit) {
  if (hit?.kind === 'atom') return hit.id;
  if (hit?.kind === 'bond') return doc.bonds.get(hit.id).a;
  if (hit?.kind === 'fill') return doc.fills.get(hit.id)?.atoms[0] ?? null;
  if (hit?.kind === 'orbital') return doc.orbitals.get(hit.id)?.atom ?? null;
  return null;
}

// A filled ring's atoms and bonds (what a click on its fill selects).
function ringOfFill(doc, id) {
  const atoms = new Set(doc.fills.get(id)?.atoms ?? []);
  return [...atoms, ...[...doc.bonds.values()].filter((b) => atoms.has(b.a) && atoms.has(b.b) && b.kind !== 'link').map((b) => b.id)];
}

// While a text is dragged: the anchors of the molecules and arrows near it,
// and the one it would snap to (g.snap: { atom | arrow, slot, box }) if it
// is let go now.
const SNAP_REACH = 0.8;
function snapText(ed, g, text) {
  const box = layoutText(text).box;
  showTargets(ed, g, box, [...anchorTargets(ed.scene, text), ...arrowTargets(ed.scene, box, text.id)]);
}

// The near targets shown, the nearest within reach chosen. (On an arrow:
// the outermost place of each side shown; a place inside a stack, when
// chosen, as a line in the gap it goes into: a stack put in another order.)
function showTargets(ed, g, box, targets) {
  const [cx, cy] = [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2];
  // (a place inside a stack is aimed at by its line)
  const point = (t) => (t.line ? [(t.line[0] + t.line[2]) / 2, (t.line[1] + t.line[3]) / 2] : [(t.box.x1 + t.box.x2) / 2, (t.box.y1 + t.box.y2) / 2]);
  const distance = (t) => Math.hypot(point(t)[0] - cx, point(t)[1] - cy);
  const near = targets.map((t) => ({ ...t, d: distance(t) })).filter((t) => t.d < 3);
  const best = near.reduce((b, t) => (!b || t.d < b.d ? t : b), null);
  g.snap = best && best.d < SNAP_REACH ? best : null;
  const shown = near.filter((t) => t.stack === undefined || t.index === t.stack.length);
  ed.preview = near.length ? { kind: 'slots', boxes: shown.map((t) => t.box), chosen: g.snap?.line ? null : g.snap?.box ?? null, line: g.snap?.line ?? null } : null;
}

// A text just typed (in `doc`, being changed) where a molecule's or an
// arrow's next place for text is goes there, as if dragged there: a name
// typed under a molecule is its name, so Align and the grid keep the two
// together. "Where": at least 40 % of the text within that place, give or
// take a line up and down and a little to the sides (typed without the
// places shown, it is rarely on the line); of several, the one with most.
const TYPED_REACH = [0.3, 0.6];
export function putTypedText(ed, doc, text) {
  const box = layoutText(text).box;
  const [rx, ry] = TYPED_REACH;
  const within = (b) => Math.max(0, Math.min(box.x2, b.x2 + rx) - Math.max(box.x1, b.x1 - rx)) * Math.max(0, Math.min(box.y2, b.y2 + ry) - Math.max(box.y1, b.y1 - ry))
    / ((box.x2 - box.x1) * (box.y2 - box.y1));
  const best = [...anchorTargets(ed.scene, text), ...arrowTargets(ed.scene, box, text.id)]
    .filter((target) => target.index === target.stack.length)
    .map((target) => ({ target, share: within(target.box) }))
    .reduce((b, c) => (c.share >= 0.4 && (!b || c.share > b.share) ? c : b), null);
  if (!best) return;
  if (best.target.arrow != null) putOnArrow(doc, best.target, [text]);
  else putOnAnchor(doc, best.target, text);
}

// The atoms of the one whole molecule being moved, if that is all that
// moves (with the texts on its anchors): it can go on an arrow.
function movedMolecule(ed, ids) {
  const moving = new Set(ids);
  if ([...moving].some((id) => ed.doc.arrows.has(id))) return null;
  const touched = fragments(ed.doc).filter((members) => members.some((id) => moving.has(id)));
  if (touched.length !== 1 || !touched[0].every((id) => moving.has(id))) return null;
  return touched[0];
}

// While a whole molecule is dragged: the places on the arrows near it.
function snapMolecule(ed, g) {
  const scene = ed.scene;
  const members = g.molecule;
  const first = ed.doc.atoms.get(members[0]);
  const info = scene.atoms.get(members[0]);
  if (!info) return;
  // (the scene is from before this step of the drag: shifted to where the molecule is now)
  const [dx, dy] = [first.x - info.pos[0], first.y - info.pos[1]];
  const boxes = [moleculeBox(members, scene.atoms), ...[...scene.texts.values()].filter((t) => members.includes(t.text.anchor)).map((t) => t.box)];
  const box = { x1: Math.min(...boxes.map((b) => b.x1)) + dx, y1: Math.min(...boxes.map((b) => b.y1)) + dy, x2: Math.max(...boxes.map((b) => b.x2)) + dx, y2: Math.max(...boxes.map((b) => b.y2)) + dy };
  showTargets(ed, g, box, arrowTargets(scene, box, members).map((t) => ({ ...t, molecule: members })));
}

// Double click on a reaction arrow: it with what is on it.
// A reaction arrow with what is on it (the molecules and texts over and under it, the texts on those)
export function arrowIds(doc, id) {
  const atoms = new Set(fragments(doc).filter((members) => members.some((a) => doc.atoms.get(a).arrow === id)).flat());
  const bonds = [...doc.bonds.values()].filter((b) => atoms.has(b.a)).map((b) => b.id);
  const texts = [...doc.texts.values()].filter((text) => text.arrow === id || atoms.has(text.anchor)).map((text) => text.id);
  return [id, ...atoms, ...bonds, ...texts];
}
function selectArrow(ed, id, add = false) {
  ed.select(arrowIds(ed.doc, id), { add });
  return true;
}

// Double click with the select tool: the whole molecule, with its curved
// arrows, the dipole arrows on it, the brackets round it and the text on
// its anchors; `add` (Shift): added to what is selected.
export function selectMolecule(ed, hit, { add = false } = {}) {
  if (hit.kind === 'arrow') return selectArrow(ed, hit.id, add);
  const start = atomOfHit(ed.doc, hit);
  if (start === null) return false;
  ed.select(moleculeIds(ed, fragments(ed.doc).find((members) => members.includes(start))), { add });
  return true;
}

// A molecule (its atoms, `members`) with what belongs to it: its bonds, curved arrows and orbitals, the dipole
// arrows on it, the brackets round it, the texts on its anchors
export function moleculeIds(ed, members) {
  const atoms = new Set(members);
  const bonds = [...ed.doc.bonds.values()].filter((b) => atoms.has(b.a)).map((b) => b.id);
  const endAtom = (end) => end.atom ?? (end.orbital !== undefined ? ed.doc.orbitals.get(end.orbital)?.atom : ed.doc.bonds.get(end.bond).a);
  const curves = [...ed.doc.curves.values()].filter((c) => atoms.has(endAtom(c.from)) && atoms.has(endAtom(c.to))).map((c) => c.id);
  const orbitals = [...ed.doc.orbitals.values()].filter((o) => atoms.has(o.atom)).map((o) => o.id);
  const overlaps = [...ed.doc.overlaps.values()].filter((o) => orbitals.includes(o.a) && orbitals.includes(o.b)).map((o) => o.id);
  const points = [...atoms].map((id) => [ed.doc.atoms.get(id).x, ed.doc.atoms.get(id).y]);
  const near = (x, y, reach) => points.some(([px, py]) => Math.hypot(px - x, py - y) <= reach);
  const dipoles = [...ed.doc.arrows.values()].filter((a) => a.kind === 'dipole' && near((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2, 1.2)).map((a) => a.id);
  const brackets = bracketsOfMolecule(ed.doc, atoms);
  const texts = [...ed.doc.texts.values()].filter((text) => atoms.has(text.anchor)).map((text) => text.id);
  return [...atoms, ...bonds, ...curves, ...dipoles, ...brackets, ...texts, ...orbitals, ...overlaps];
}

// Ctrl+click (and the press of a Ctrl+drag) with the select tool: the group round what was clicked, as
// grouping.js picks it (the innermost; again, the one round it). Whether there was one.
export const idsOfGroup = (ed, group) => groupIds(ed, group, { moleculeIds, arrowIds });
function pickGroup(ed, hit, add) {
  const group = groupToPick(ed, hit.id, (one) => idsOfGroup(ed, one));
  if (group === null) return false;
  ed.select(idsOfGroup(ed, group), { add });
  ed.groupPick = group;
  return true;
}

// Triple click with the select tool: the reaction row of what was clicked, everything that crosses the
// horizontal line through its middle (an arrow's: its own): molecules whole, "+" signs, reaction arrows with what
// is on them, texts standing free, and what belongs to each as a double click takes it; the curved arrows between
// them too. A scheme of several rows: one row of it, to move or align on its own. `add` (Shift): added.
export function selectRow(ed, hit, { add = false } = {}) {
  const { doc } = ed;
  const scene = ed.scene;
  const molecules = fragments(doc).filter((members) => members.every((id) => doc.atoms.get(id).arrow == null));
  const span = (members) => {
    const ys = members.map((id) => doc.atoms.get(id).y);
    return [Math.min(...ys), Math.max(...ys)];
  };
  const textBox = (id) => scene.texts.get(id)?.box;
  const reaction = (arrow) => arrow.kind !== 'dipole';
  // the line: through the middle of what was clicked
  let line = null;
  const start = atomOfHit(doc, hit);
  if (start !== null) {
    const [top, bottom] = span(fragments(doc).find((members) => members.includes(start)));
    line = (top + bottom) / 2;
  } else if (hit.kind === 'arrow' && doc.arrows.has(hit.id)) {
    const arrow = doc.arrows.get(hit.id);
    line = (arrow.y1 + arrow.y2) / 2;
  } else if (hit.kind === 'plus' && doc.pluses.has(hit.id)) {
    line = doc.pluses.get(hit.id).y;
  } else if (hit.kind === 'text' && textBox(hit.id)) {
    const box = textBox(hit.id);
    line = (box.y1 + box.y2) / 2;
  }
  if (line === null) return false;
  const ROOM = 0.5; // (a label or a charge reaches about half a bond beyond its atom)
  const crosses = (top, bottom, room = ROOM) => top - room <= line && line <= bottom + room;
  const ids = [];
  for (const members of molecules) if (crosses(...span(members))) ids.push(...moleculeIds(ed, members));
  for (const arrow of doc.arrows.values()) {
    if (reaction(arrow) && crosses(Math.min(arrow.y1, arrow.y2), Math.max(arrow.y1, arrow.y2), 0.3)) ids.push(...arrowIds(doc, arrow.id));
  }
  for (const plus of doc.pluses.values()) if (crosses(plus.y, plus.y, 0.3)) ids.push(plus.id);
  for (const text of doc.texts.values()) {
    const box = textBox(text.id);
    if (box && text.anchor == null && text.arrow == null && crosses(box.y1, box.y2, 0)) ids.push(text.id);
  }
  // curved arrows from one molecule of the row to another
  const atoms = new Set(ids.filter((id) => doc.atoms.has(id)));
  const endAtom = (end) => end.atom ?? (end.orbital !== undefined ? doc.orbitals.get(end.orbital)?.atom : doc.bonds.get(end.bond)?.a);
  for (const curve of doc.curves.values()) if (atoms.has(endAtom(curve.from)) && atoms.has(endAtom(curve.to))) ids.push(curve.id);
  // the dashed lines between their orbitals; brackets in the row round its molecules (resonance forms with their
  // arrow: no one molecule's bracket, so not taken with one)
  const orbitals = new Set(ids.filter((id) => doc.orbitals?.has(id)));
  for (const overlap of doc.overlaps?.values() ?? []) if (orbitals.has(overlap.a) && orbitals.has(overlap.b)) ids.push(overlap.id);
  for (const b of doc.brackets.values()) {
    const inside = (a) => a.x > Math.min(b.x1, b.x2) && a.x < Math.max(b.x1, b.x2) && a.y > Math.min(b.y1, b.y2) && a.y < Math.max(b.y1, b.y2);
    if (crosses(Math.min(b.y1, b.y2), Math.max(b.y1, b.y2), 0) && [...atoms].some((id) => inside(doc.atoms.get(id)))) ids.push(b.id);
  }
  ed.select([...new Set(ids)], { add });
  return true;
}
