// Orbitals on atoms and the dashed lines of their overlap.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { t } from '../../i18n/i18n.js';
import { addOrbital, addOverlap, firstNeighbour, orbitalAngle, otherEnd, setOrbitalAngle } from '../../model/doc.js';
import { overlapLine } from '../../render/orbitals.js';

// --- orbitals ---

const DEGREE15 = Math.PI / 12;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// The directions of an atom's molecule there: along its bonds and across them, and between two of its bonds
// (either way), for an orbital to snap to.
function moleculeAngles(doc, atomId) {
  const atom = doc.atoms.get(atomId);
  const bonds = [...doc.bonds.values()].filter((b) => b.kind !== 'link' && (b.a === atomId || b.b === atomId));
  const along = bonds.map((b) => {
    const other = doc.atoms.get(otherEnd(b, atomId));
    return Math.atan2(other.y - atom.y, other.x - atom.x);
  });
  const angles = along.flatMap((a) => [a, a + Math.PI / 2, a + Math.PI, a - Math.PI / 2]);
  for (let i = 0; i < along.length; i++) {
    for (let j = i + 1; j < along.length; j++) {
      const middle = Math.atan2(Math.sin(along[i]) + Math.sin(along[j]), Math.cos(along[i]) + Math.cos(along[j]));
      angles.push(middle, middle + Math.PI);
    }
  }
  return angles;
}

// `raw` snapped: to the molecule's directions when one is within half a step, else to 15° steps; Shift: free.
function snapOrbital(doc, atomId, raw, free) {
  if (free) return raw;
  const step = Math.round(raw / DEGREE15) * DEGREE15;
  const near = moleculeAngles(doc, atomId).map((a) => ({ a, d: Math.abs(wrap(a - raw)) })).filter((c) => c.d < DEGREE15 / 2);
  const best = near.reduce((b, c) => (!b || c.d < b.d ? c : b), null);
  return best && best.d < Math.abs(wrap(step - raw)) ? best.a : step;
}

// Which way a new orbital points: a p orbital upright on the page (or across the molecule's plane, where a 3D
// view left that on the atom); a hybrid away from the atom's bonds; an s orbital anyhow.
function newOrbitalAngle(doc, atomId, kind) {
  const atom = doc.atoms.get(atomId);
  if (kind === 'p') return -Math.PI / 2;
  if (kind !== 'hybrid') return 0;
  let [x, y] = [0, 0];
  for (const b of doc.bonds.values()) {
    if (b.kind === 'link' || (b.a !== atomId && b.b !== atomId)) continue;
    const other = doc.atoms.get(otherEnd(b, atomId));
    const d = Math.hypot(other.x - atom.x, other.y - atom.y) || 1;
    [x, y] = [x + (other.x - atom.x) / d, y + (other.y - atom.y) / d];
  }
  if (Math.hypot(x, y) < 0.2) {
    // (no bonds, or bonds all round: across the first)
    const angles = moleculeAngles(doc, atomId);
    return angles.length ? angles[1] : 0;
  }
  return Math.atan2(-y, -x);
}

// Puts an orbital of `kind` on the atom; returns it.
export function addOrbitalTo(doc, atomId, kind, angle = null) {
  const orbital = addOrbital(doc, atomId, { kind });
  // (on an atom of a drawing from a 3D view: upright to the molecule's plane there, as long as that looks)
  const facing = doc.atoms.get(atomId).facing;
  if (angle === null && kind === 'p' && facing) {
    const probe = { atom: atomId, angle: facing.angle, ref: null };
    const neighbour = firstNeighbour(doc, atomId);
    probe.ref = neighbour;
    setOrbitalAngle(doc, orbital, orbitalAngle(doc, probe));
    Object.assign(orbital, { plane: facing.face ?? 1, reach: facing.reach });
    return orbital;
  }
  setOrbitalAngle(doc, orbital, angle ?? newOrbitalAngle(doc, atomId, kind));
  return orbital;
}

// While a lobe is dragged: the orbital turned so that this lobe points at the pointer, snapped.
export function turnOrbital(ed, g, id, lobe = 0) {
  const orbital = ed.doc.orbitals.get(id);
  if (!orbital) return;
  if (!g.started) {
    ed.checkpoint();
    g.started = true;
    g.lobeOffset = (ed.scene.orbitals.get(id)?.lobes[lobe]?.angle ?? orbitalAngle(ed.doc, orbital)) - orbitalAngle(ed.doc, orbital);
  }
  const atom = ed.doc.atoms.get(orbital.atom);
  const pointer = Math.atan2(g.point[1] - atom.y, g.point[0] - atom.x);
  if (Math.hypot(g.point[1] - atom.y, g.point[0] - atom.x) < 0.1) return;
  setOrbitalAngle(ed.doc, orbital, snapOrbital(ed.doc, orbital.atom, pointer, g.shift) - g.lobeOffset);
  ed.touched();
}

// The orbital under the pointer other than `skip` (a lobe dragged onto it: a dashed line between them), with
// the lobe it is on: { id, side } (the lobe's side, see doc.js's overlap; null when on its atom, not on a lobe:
// then that atom's orbital whose lobe ends nearest the pointer) or null.
function otherLobeAt(ed, point, skip) {
  const hit = ed.hitAt(point, { skip: new Set([skip]) });
  if (hit?.kind === 'orbital' && hit.id !== skip) return { id: hit.id, side: sideOf(ed, hit.id, hit.lobe) };
  const id = nearestOnAtom(ed, hit, point, skip);
  return id === null ? null : { id, side: null };
}

// A lobe's side (1: along its orbital's angle, −1: opposite), from its index in the scene's lobes; or null.
const sideOf = (ed, id, lobe) => ed.scene.orbitals.get(id)?.lobes[lobe]?.side ?? null;

// On an atom (hit) other than `skip`'s: its orbital whose lobe ends nearest the point, or null.
function nearestOnAtom(ed, hit, point, skip) {
  const atom = hit?.kind === 'atom' ? hit.id : null;
  const own = ed.doc.orbitals.get(skip)?.atom;
  if (atom === null || atom === own) return null;
  let best = null;
  for (const { orbital, lobes } of ed.scene.orbitals.values()) {
    if (orbital.atom !== atom || orbital.id === skip) continue;
    const d = Math.min(...lobes.map((l) => Math.hypot(l.tip[0] - point[0], l.tip[1] - point[1])));
    if (!best || d < best.d) best = { id: orbital.id, d };
  }
  return best?.id ?? null;
}

// The overlap tool's start: an orbital's lobe, or an atom with orbitals (the one whose lobe ends nearest).
function orbitalNear(ed, hit, point) {
  if (hit?.kind === 'orbital') return hit.id;
  if (hit?.kind !== 'atom') return null;
  let best = null;
  for (const { orbital, lobes } of ed.scene.orbitals.values()) {
    if (orbital.atom !== hit.id) continue;
    const d = Math.min(...lobes.map((l) => Math.hypot(l.tip[0] - point[0], l.tip[1] - point[1])));
    if (!best || d < best.d) best = { id: orbital.id, d };
  }
  return best?.id ?? null;
}

// Have these two orbitals a dashed line between them already?
const joined = (doc, a, b) => [...doc.overlaps.values()].some((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a));

// A dashed line between two orbitals, unless they have one already; `started`: the drag has its undo step
// already (a lobe turned on the way). Returns whether it drew one.
function addOverlapLine(ed, a, b, started = false, lobes = {}) {
  if (joined(ed.doc, a, b)) {
    if (started) ed.dropCheckpoint(); // (the orbital is back as it was: nothing to undo)
    return false;
  }
  // (the lobes it was drawn from and to, where one was: the line stays between them)
  const line = { color: ed.settings.arrowColor ?? null, ...(lobes.sideA != null && { sideA: lobes.sideA }), ...(lobes.sideB != null && { sideB: lobes.sideB }) };
  if (started) {
    addOverlap(ed.doc, a, b, line);
    ed.touched();
  } else ed.change((doc) => addOverlap(doc, a, b, line));
  return true;
}

// The orbital tool's overlap variant: only dashed lines, dragged from one orbital to another.
const overlapLines = {
  down(ed, g) {
    g.from = orbitalNear(ed, g.hit, g.start);
    g.fromSide = g.hit?.kind === 'orbital' ? sideOf(ed, g.hit.id, g.hit.lobe) : null;
  },
  drag(ed, g) {
    if (g.from === null) return;
    const onto = otherLobeAt(ed, g.point, g.from);
    g.onto = onto?.id ?? null;
    g.lobes = { sideA: g.fromSide, sideB: onto?.side ?? null };
    const a = ed.scene.orbitals.get(g.from);
    const b = g.onto !== null ? ed.scene.orbitals.get(g.onto) : null;
    const tip = a?.lobes.reduce((best, l) => (!best || Math.hypot(l.tip[0] - g.point[0], l.tip[1] - g.point[1]) < Math.hypot(best[0] - g.point[0], best[1] - g.point[1]) ? l.tip : best), null);
    ed.preview = { kind: 'overlap', line: b ? overlapLine(a.lobes, b.lobes, g.lobes) : tip && [tip, g.point] };
    ed.emit();
  },
  dragEnd(ed, g) {
    ed.preview = null;
    if (g.from == null) ed.say(t('Start on an orbital (or an atom with one) and drag to an orbital of another molecule.'));
    else if (g.onto == null) ed.say(t('End on another orbital (or its atom).'));
    else if (!addOverlapLine(ed, g.from, g.onto, false, g.lobes)) ed.emit();
  },
  click(ed) {
    ed.say(t('Drag from one orbital to another: a dashed line between them.'));
  },
};

export const orbitalTool = {
  cursor: 'crosshair',
  down(ed, g) {
    if (ed.tool.kind === 'overlap') return overlapLines.down(ed, g);
    if (g.hit?.kind === 'orbital') g.target = g.hit;
    else if (g.hit?.kind === 'atom') g.atom = g.hit.id;
  },
  drag(ed, g) {
    if (ed.tool.kind === 'overlap') return overlapLines.drag(ed, g);
    if (g.atom !== undefined && !g.target) {
      // dragged from an atom: a new orbital, pointing as dragged
      ed.checkpoint();
      g.started = true;
      g.target = { id: addOrbitalTo(ed.doc, g.atom, ed.tool.kind ?? 'p').id, lobe: 0 };
      g.lobeOffset = 0;
      g.fresh = true;
    }
    if (!g.target) return;
    // onto another orbital (not a new one): the dashed line between them, the orbital as it was
    const onto = g.fresh ? null : otherLobeAt(ed, g.point, g.target.id);
    const other = onto?.id ?? null;
    if (other !== null) {
      if (g.turnedFrom !== undefined) {
        Object.assign(ed.doc.orbitals.get(g.target.id), g.turnedFrom);
        ed.touched();
      }
      const [a, b] = [ed.scene.orbitals.get(g.target.id), ed.scene.orbitals.get(other)];
      // (from the lobe dragged, to the one it is on)
      g.lobes = { sideA: sideOf(ed, g.target.id, g.target.lobe), sideB: onto.side };
      ed.preview = { kind: 'overlap', line: a && b ? overlapLine(a.lobes, b.lobes, g.lobes) : null };
      g.onto = other;
      ed.emit();
      return;
    }
    g.onto = null;
    ed.preview = null;
    const orbital = ed.doc.orbitals.get(g.target.id);
    g.turnedFrom ??= { angle: orbital.angle, ref: orbital.ref };
    turnOrbital(ed, g, g.target.id, g.target.lobe);
  },
  dragEnd(ed, g) {
    if (ed.tool.kind === 'overlap') return overlapLines.dragEnd(ed, g);
    ed.preview = null;
    if (g.onto == null) return;
    if (!addOverlapLine(ed, g.target.id, g.onto, Boolean(g.started), g.lobes)) ed.emit();
  },
  click(ed, g) {
    if (ed.tool.kind === 'overlap') return overlapLines.click(ed, g);
    // a lobe: the other phase; an atom: an orbital on it
    if (g.hit?.kind === 'orbital') {
      ed.change((doc) => {
        const orbital = doc.orbitals.get(g.hit.id);
        orbital.phase = -(orbital.phase ?? 1);
      });
    } else if (g.hit?.kind === 'atom') {
      ed.change((doc) => addOrbitalTo(doc, g.hit.id, ed.tool.kind ?? 'p'));
    } else if (g.hit?.kind === 'bond') {
      ed.say(t('Click an atom to put an orbital on it.'));
    }
  },
};
