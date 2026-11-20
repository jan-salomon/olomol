// Curved arrows (an electron pair, or one: a fishhook).
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { t } from '../../i18n/i18n.js';
import { addCurve } from '../../model/doc.js';
import { arrowCandidates, arrowGeometry } from '../../render/mechanism.js';

// --- curved arrows ---

// "the C=O bond", "the O⁻", for messages.
export function describe(doc, end) {
  const name = (id) => {
    const a = doc.atoms.get(id);
    return a.el + (a.charge > 0 ? '⁺' : a.charge < 0 ? '⁻' : '');
  };
  if (end.orbital !== undefined) return t('the orbital on {atom}', { atom: name(doc.orbitals.get(end.orbital).atom) });
  if (end.newBond !== undefined) return t('the new {bond} bond', { bond: `${name(end.newBond)}–${name(end.atom)}` });
  if (end.bond === undefined) return t('the {atom}', { atom: name(end.atom) });
  const b = doc.bonds.get(end.bond);
  return t('the {bond} bond', { bond: `${name(b.a)}${{ 2: '=', 3: '≡' }[b.order] ?? '–'}${name(b.b)}` });
}

// Where the electrons of an arrow can come from, for a hit: { from } or
// { error } (an atom without lone pair or unpaired electron).
function arrowSource(ed, hit, oneElectron) {
  if (!hit) return { error: t('Start on a bond, or on an atom with a lone pair.') };
  if (hit.kind === 'bond') return { from: { bond: hit.id } };
  if (hit.kind === 'orbital') return { from: { orbital: hit.id } }; // (a lobe: a lone pair in it, say)
  if (hit.kind !== 'atom') return { error: t('Start on a bond, or on an atom with a lone pair.') };
  const info = ed.scene.atoms.get(hit.id);
  if (info.atom.alias) return { from: { atom: hit.id } }; // a group label (Nu, R): it has what it needs
  // a fishhook from an atom with an unpaired electron starts at that electron (unless one of its lone pairs was hit)
  if (hit.radical || (oneElectron && info.chem.unpaired && hit.pair === undefined)) return { from: { atom: hit.id, radical: true } };
  if (!info.chem.lonePairs) {
    const el = info.atom.el;
    return { error: oneElectron ? t("This {el} has no lone pair or unpaired electron, so the electrons can't come from it. Start on a bond or another atom.", { el })
      : t("This {el} has no lone pair, so the electrons can't come from it. Start on a bond or another atom.", { el }) };
  }
  return { from: hit.pair !== undefined ? { atom: hit.id, pair: hit.pair } : { atom: hit.id } };
}

const sameEnd = (p, q) => p.atom === q.atom && p.bond === q.bond && p.orbital === q.orbital && p.newBond === q.newBond;

function addCurvedArrow(ed, from, hit, point, shift = false) {
  const gap = gapAt(ed, from, point, hit, newBondsOffered(ed, shift));
  if (!gap && (!hit || !['atom', 'bond', 'orbital'].includes(hit.kind))) {
    ed.say(t('End the arrow on an atom or a bond.'));
    return false;
  }
  const to = gap ? { atom: gap.b, newBond: gap.a } : endOfHit(hit);
  if (sameEnd(from, to)) {
    ed.say(t('That is where the electrons come from. End the arrow where they go.'));
    return false;
  }
  const electrons = ed.tool.electrons;
  ed.change((doc) => addCurve(doc, from, to, electrons, { color: ed.settings.arrowColor ?? null }));
  ed.say(t('Arrow from {from} to {to}. Ctrl+Z undoes it.', { from: describe(ed.doc, from), to: describe(ed.doc, to) }));
  return true;
}

// A curved arrow's end on what is under the pointer: a bond, an atom, an orbital's lobe.
const endOfHit = (hit) => (hit.kind === 'bond' ? { bond: hit.id } : hit.kind === 'orbital' ? { orbital: hit.id } : { atom: hit.id });

// --- arrows to a new bond ---

// While an arrow is drawn, a faint line from where its electrons are to every atom within GAP_REACH that they
// could make a new bond with (not already bonded), with a dot in its middle: an arrow dropped on the dot ends
// there, between the two atoms, where the new bond comes (Cl• + H–CH3: the Cl–H bond). The lines in the
// direction of the pointer are stronger. A fishhook has them always (two radicals combining, a hydrogen
// abstracted: where they are needed); a two-electron arrow only while Shift is held, as it ends on an atom or a
// bond in most mechanisms and the lines would crowd them; meanwhile a badge at the pointer says so.
const GAP_REACH = 5; // bond lengths
const GAP_SNAP = 0.3; // how near the dot the pointer must be
const GAP_SECTOR = 25 * (Math.PI / 180); // the lines this near the pointer's direction are stronger

// Are the new bonds offered (lines, dots, ending on one)? A fishhook's always, a two-electron arrow's with Shift.
const newBondsOffered = (ed, shift) => ed.tool.electrons === 1 || Boolean(shift);

// The atoms where the electrons are: an atom's (lone pair, unpaired electron), a bond's two, an orbital's atom.
function sourceAtoms(ed, from) {
  if (from.bond !== undefined) {
    const bond = ed.doc.bonds.get(from.bond);
    return bond ? [bond.a, bond.b] : [];
  }
  if (from.orbital !== undefined) {
    const orbital = ed.doc.orbitals.get(from.orbital);
    return orbital ? [orbital.atom] : [];
  }
  return [from.atom];
}

// The new bonds the electrons could make: [{ a (the atom on their side), b, p, q (their places), mid }].
export function gapTargets(ed, from) {
  const sources = sourceAtoms(ed, from).filter((id) => ed.scene.atoms.has(id));
  if (!sources.length) return [];
  const gaps = [];
  for (const info of ed.scene.atoms.values()) {
    const b = info.atom.id;
    if (sources.includes(b)) continue;
    const q = info.pos;
    const near = (id) => Math.hypot(ed.scene.pos(id)[0] - q[0], ed.scene.pos(id)[1] - q[1]);
    const a = sources.reduce((best, id) => (near(id) < near(best) ? id : best));
    if (near(a) > GAP_REACH || sources.some((id) => ed.scene.bonded(id, b))) continue;
    const p = ed.scene.pos(a);
    gaps.push({ a, b, p, q, mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] });
  }
  return gaps;
}

// The new bond whose dot is under the pointer, if no atom or bond under it is nearer.
function gapAt(ed, from, point, hit, offered = true) {
  if (!point || !offered) return null;
  let best = null;
  for (const gap of gapTargets(ed, from)) {
    const d = Math.hypot(point[0] - gap.mid[0], point[1] - gap.mid[1]);
    if (d < GAP_SNAP && (!best || d < best.d)) best = { ...gap, d };
  }
  return best && !(hit && ['atom', 'bond'].includes(hit.kind) && hit.distance < best.d) ? best : null;
}

// The lines to draw while the arrow is drawn: each with how strong it is (in the pointer's direction from its
// atom) and whether its dot is the one the arrow would end on.
function gapLines(ed, from, point, chosen, offered = true) {
  if (!offered) return [];
  return gapTargets(ed, from).map(({ a, b, p, q, mid }) => {
    const towards = point && Math.hypot(point[0] - p[0], point[1] - p[1]) > 0.3
      ? Math.abs(Math.atan2(Math.sin(Math.atan2(point[1] - p[1], point[0] - p[0]) - Math.atan2(q[1] - p[1], q[0] - p[0])),
        Math.cos(Math.atan2(point[1] - p[1], point[0] - p[0]) - Math.atan2(q[1] - p[1], q[0] - p[0])))) < GAP_SECTOR
      : false;
    return { p, q, mid, strong: towards, active: Boolean(chosen && chosen.a === a && chosen.b === b) };
  });
}
const arrowEndHit = (hit) => (['atom', 'bond', 'orbital'].includes(hit?.kind) ? hit : null);

export const curve = {
  cursor: 'crosshair',
  down(ed, g) {
    // the second click of click-click drawing
    if (ed.pendingCurve) return;
    g.source = arrowSource(ed, g.hit, ed.tool.electrons === 1);
  },
  drag(ed, g) {
    if (ed.pendingCurve || !g.source?.from) return;
    const target = ed.hitAt(g.point);
    ed.hover = arrowEndHit(target);
    ed.preview = curvePreview(ed, g.source.from, ed.hover, g.point, g.shift);
    if (ed.preview.gaps.some((gap) => gap.active)) ed.hover = null; // (the new bond, not the atom under it)
    ed.emit();
  },
  dragEnd(ed, g) {
    ed.preview = null;
    if (ed.pendingCurve) return;
    if (g.source?.error) ed.say(g.source.error);
    else if (g.source) addCurvedArrow(ed, g.source.from, ed.hitAt(g.point), g.point, g.shift);
  },
  click(ed, g) {
    if (ed.pendingCurve) {
      const from = ed.pendingCurve;
      if (addCurvedArrow(ed, from, g.hit, g.point, g.shift)) ed.pendingCurve = null;
      ed.preview = null;
      ed.emit();
      return;
    }
    if (g.source.error) {
      ed.say(g.source.error);
      return;
    }
    ed.pendingCurve = g.source.from;
    ed.say(t('From {from}. Now click where the electrons go (or drag next time). Esc cancels.', { from: describe(ed.doc, g.source.from) }), 'info', Infinity);
  },
  hover(ed, point, hit) {
    if (ed.pendingCurve) ed.preview = curvePreview(ed, ed.pendingCurve, arrowEndHit(hit), point, ed.shiftHeld);
    ed.emit();
  },
  // Shift pressed or let go while an arrow is dragged: the new bonds offered or taken away at once
  shift(ed, g) {
    if (g.moved) curve.drag(ed, g);
  },
  cancel(ed) {
    if (ed.pendingCurve) ed.clearNotice();
    ed.pendingCurve = null;
    ed.preview = null;
  },
};

// While choosing where an arrow goes: over an atom or bond, the arrow just
// as it will be drawn; elsewhere a dashed line from the start.
function curvePreview(ed, from, target, point, shift = false) {
  const offered = newBondsOffered(ed, shift);
  const gap = gapAt(ed, from, point, target, offered);
  const gaps = gapLines(ed, from, point, gap, offered);
  // (a two-electron arrow without Shift, with a new bond it could make: a badge at the pointer says how)
  const hint = !offered && point && gapTargets(ed, from).length ? { at: [point[0] + 0.25, point[1] - 0.55], text: t('Shift: to a new bond') } : null;
  if (gap || target) {
    const to = gap ? { atom: gap.b, newBond: gap.a } : endOfHit(target);
    if (!sameEnd(from, to)) {
      const best = arrowCandidates(ed.scene, { from, to, electrons: ed.tool.electrons }, [...ed.scene.curves.values()])[0];
      if (best) return { kind: 'curve', ...arrowGeometry(best, ed.tool.electrons), gaps, hint };
    }
  }
  return { kind: 'pull', from: endPoint(ed, from), to: point, gaps, hint };
}

// The point an arrow end refers to (for the preview line).
function endPoint(ed, end) {
  if (end.orbital !== undefined) {
    const lobes = ed.scene.orbitals.get(end.orbital)?.lobes ?? [];
    return lobes.at(-1)?.tip ?? [0, 0];
  }
  if (end.bond !== undefined) {
    const b = ed.doc.bonds.get(end.bond);
    return [(ed.doc.atoms.get(b.a).x + ed.doc.atoms.get(b.b).x) / 2, (ed.doc.atoms.get(b.a).y + ed.doc.atoms.get(b.b).y) / 2];
  }
  const info = ed.scene.atoms.get(end.atom);
  if (end.pair !== undefined && info.electrons.slots[end.pair]) return info.electrons.slots[end.pair].point;
  return info.pos;
}
