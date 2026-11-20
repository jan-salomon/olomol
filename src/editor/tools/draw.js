// Drawing bonds, atoms and chains.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { isEndOn } from '../../chem/newman.js';
import { t } from '../../i18n/i18n.js';
import { addAtom, addBond, bondBetween, deleteObjects } from '../../model/doc.js';
import { atomNear, bondTo, chainPoints, mergeLanded, snapAngle, sproutAngle } from '../build.js';

// --- bonds, atoms, chains ---

// A drag that pulls a new bond out of an atom (or out of the empty canvas):
// the bond follows the pointer in 15° steps and snaps onto atoms. Snapped,
// the bond goes to that atom and the new atom is taken out meanwhile (no
// CH3 drawn over the Fe a cyanide is pulled to); a bond that is there
// already is shown alone.
function pullBond(ed, g, { order = 1, stereo = '', el = 'C', kind } = {}) {
  if (!g.started) {
    ed.checkpoint();
    g.started = true;
    g.from = g.hit?.kind === 'atom' ? g.hit.id : addAtom(ed.doc, g.start[0], g.start[1]).id;
    g.endAtom = addAtom(ed.doc, g.start[0], g.start[1], el);
    g.end = g.endAtom.id;
    g.newBond = addBond(ed.doc, g.from, g.end, order, { stereo, ...(kind && { kind }) });
    g.bond = g.newBond.id;
  }
  const from = ed.doc.atoms.get(g.from);
  const end = g.endAtom;
  const target = atomNear(ed.doc, g.point[0], g.point[1], new Set([g.from, g.end]));
  ed.doc.atoms.delete(g.end);
  ed.doc.bonds.delete(g.bond);
  if (target !== undefined) {
    g.newBond.b = target;
    if (!bondBetween(ed.doc, g.from, target)) ed.doc.bonds.set(g.bond, g.newBond);
  } else {
    let angle = Math.atan2(g.point[1] - from.y, g.point[0] - from.x);
    if (!g.shift) angle = snapAngle(angle, 15);
    [end.x, end.y] = [from.x + Math.cos(angle), from.y + Math.sin(angle)];
    g.newBond.b = g.end;
    ed.doc.atoms.set(g.end, end);
    ed.doc.bonds.set(g.bond, g.newBond);
  }
  ed.touched();
}

function finishPull(ed, g) {
  if (!g.started) return;
  mergeLanded(ed.doc, [g.end]);
  // a bond onto its own start, or a duplicate: gone
  const bond = ed.doc.bonds.get(g.bond);
  if (bond && bond.a === bond.b) ed.doc.bonds.delete(bond.id);
  ed.touched();
}

// tool: { name: 'bond', order, stereo, kind, el (the element of the atoms
// it adds: an element key over the canvas chooses it; none: C). With an
// element, a click on an atom makes it that element, as the element tool
// does; on one that is it already, or with Shift, a bond to a new one; on
// the empty canvas, the atom on its own (O: water). Shift puts the new bond
// on the other side (sproutAngles' next best: the chain's zigzag the other
// way), except where it is what makes a bond at all (N on a C).
export const bond = {
  cursor: 'crosshair',
  hover(ed, point, hit, same) {
    // (without an element: only the hover halo changes, when it does; with Shift, the bond it would add)
    if (ed.tool.el) atom.hover(ed, point, hit);
    else if (ed.shiftHeld && hit?.kind === 'atom') showSprout(ed, hit.id, true);
    else if (ed.preview) {
      ed.preview = null;
      ed.emit();
    } else if (!same) ed.emit();
  },
  click(ed, g) {
    const { order = 1, stereo = '', kind, el } = ed.tool; // (the chain tool has neither: a single bond's click)
    if (el && g.hit?.kind === 'atom' && !atomGrows(ed.doc, g.hit.id, { el }, g.shift)) {
      ed.change((doc) => Object.assign(doc.atoms.get(g.hit.id), { el, alias: null, hCount: null, isotope: null }));
      return;
    }
    if (el && !g.hit) {
      ed.change((doc) => addAtom(doc, g.start[0], g.start[1], el));
      return;
    }
    if (g.hit?.kind === 'bond') {
      // (a Newman projection's bond seen end on stays a single bond, as the keys keep it: else the projection fell apart)
      if (isEndOn(ed.doc, ed.doc.bonds.get(g.hit.id))) {
        ed.say(t("A Newman projection's bond seen end on stays a single bond."));
        return;
      }
      ed.change((doc) => {
        const b = doc.bonds.get(g.hit.id);
        delete b.delocalized; // drawn by hand now
        if (kind) {
          // a dative bond clicked again: the other way round
          if (b.kind === kind && kind === 'dative') [b.a, b.b] = [b.b, b.a];
          else Object.assign(b, { order: 1, stereo: '', kind });
        } else if (b.kind === 'dative' && (stereo === 'wedge' || stereo === 'hash')) {
          b.stereo = b.stereo === stereo ? '' : stereo; // depth only: it stays a coordination bond (again: none)
        } else if (b.kind) {
          delete b.kind; // a plain bond again
          Object.assign(b, { order, stereo });
        } else if (stereo) {
          if (b.stereo === stereo) [b.a, b.b] = [b.b, b.a];
          else Object.assign(b, { order: 1, stereo });
        } else if (order === 1) {
          if (b.stereo) b.stereo = '';
          else b.order = b.order >= 3 ? 1 : b.order + 1;
        } else if (order === 2 && b.order === 2) {
          const sides = [null, 'center', 'left', 'right'];
          b.side = sides[(sides.indexOf(b.side ?? null) + 1) % sides.length];
        } else {
          Object.assign(b, { order, stereo: '' });
        }
      });
      return;
    }
    ed.change((doc) => {
      const from = g.hit?.kind === 'atom' ? g.hit.id : addAtom(doc, g.start[0], g.start[1]).id;
      const other = g.shift && (!el || g.hit?.kind !== 'atom' || atomGrows(doc, from, { el }, false));
      bondTo(doc, from, sproutAngle(doc, from, undefined, { other }), { order, stereo, kind, el: ed.tool.el ?? 'C' });
    });
  },
  drag(ed, g) {
    if (g.hit && g.hit.kind !== 'atom') return;
    pullBond(ed, g, ed.tool); // (with the tool's element for the new atom, if it has one)
  },
  dragEnd: finishPull,
  cancel(ed) {
    ed.preview = null;
  },
};

// Over an atom, the atom tool (an element, or a label like Ph or R)
// replaces it; on an atom that is already that (C on C), or with Shift, it
// bonds a new one to it instead, so clicking C on C grows a chain.
function atomGrows(doc, id, { el, alias = null }, shift) {
  const a = doc.atoms.get(id);
  return shift || (a.el === el && (a.alias ?? null) === alias);
}

// Shift on an atom the tool grows anyway (C on C): the new bond on the other side.
const otherSide = (doc, id, tool, shift) => shift && atomGrows(doc, id, tool, false);

// The bond a click would add to an atom, see-through.
function showSprout(ed, id, other) {
  const a = ed.doc.atoms.get(id);
  const angle = sproutAngle(ed.doc, id, undefined, { other });
  ed.preview = { kind: 'lines', lines: [[a.x, a.y, a.x + Math.cos(angle), a.y + Math.sin(angle)]] };
  ed.emit();
}

export const atom = {
  cursor: 'crosshair',
  hover(ed, point, hit) {
    // the bond it would add, see-through
    if (hit?.kind === 'atom' && atomGrows(ed.doc, hit.id, ed.tool, ed.shiftHeld)) return showSprout(ed, hit.id, otherSide(ed.doc, hit.id, ed.tool, ed.shiftHeld));
    ed.preview = null;
    ed.emit();
  },
  click(ed, g) {
    const { el, alias = null } = ed.tool;
    if (g.hit?.kind === 'atom' && atomGrows(ed.doc, g.hit.id, ed.tool, g.shift)) {
      ed.change((doc) => bondTo(doc, g.hit.id, sproutAngle(doc, g.hit.id, undefined, { other: otherSide(doc, g.hit.id, ed.tool, g.shift) }), { el, alias }));
    } else if (g.hit?.kind === 'atom') {
      ed.change((doc) => Object.assign(doc.atoms.get(g.hit.id), { el, alias, hCount: null, isotope: null }));
    } else if (!g.hit) {
      ed.change((doc) => addAtom(doc, g.start[0], g.start[1], el, { alias }));
    }
  },
  drag(ed, g) {
    if (g.hit && g.hit.kind !== 'atom') return;
    pullBond(ed, g, { el: ed.tool.el, alias: ed.tool.alias ?? null });
    if (ed.tool.alias) g.endAtom.alias = ed.tool.alias;
  },
  dragEnd: finishPull,
  cancel(ed) {
    ed.preview = null;
  },
};

export const chain = {
  cursor: 'crosshair',
  click: bond.click,
  drag(ed, g) {
    if (g.hit && g.hit.kind !== 'atom') return;
    if (!g.started) {
      ed.checkpoint();
      g.started = true;
      g.from = g.hit?.kind === 'atom' ? g.hit.id : addAtom(ed.doc, g.start[0], g.start[1]).id;
      g.added = [];
    }
    deleteObjects(ed.doc, g.added);
    const from = ed.doc.atoms.get(g.from);
    // zigzag on the side that continues an existing chain nicely (Shift: the other one)
    const sprout = sproutAngle(ed.doc, g.from);
    const options = [true, false].map((up) => chainPoints([from.x, from.y], g.point, up));
    const fit = (points) => Math.abs(Math.atan2(points[0][1] - from.y, points[0][0] - from.x) - sprout);
    const points = (fit(options[0]) <= fit(options[1])) !== Boolean(g.shift) ? options[0] : options[1];
    g.added = [];
    let previous = g.from;
    for (const [x, y] of points) {
      const next = addAtom(ed.doc, x, y);
      const b = addBond(ed.doc, previous, next.id);
      g.added.push(next.id, b.id);
      previous = next.id;
    }
    const last = points.at(-1);
    ed.preview = { kind: 'badge', at: [last[0] + 0.3, last[1] - 0.3], text: String(points.length) };
    ed.touched();
  },
  dragEnd(ed, g) {
    ed.preview = null;
    if (!g.started) return;
    mergeLanded(ed.doc, g.added.filter((id) => ed.doc.atoms.has(id)));
    ed.touched();
  },
};
