// The top bar's modes that turn part of a drawing: Flip over a bond, the ring flip of a chair, Make a bond horizontal or vertical.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { smallerSide, snapBond, turnOver } from '../../arrange/align.js';
import { chairTurn, ringFlip, seenEndOn } from '../../chem/ringFlip.js';
import { ringToChair, ringWedges } from '../../chem/toChair.js';
import { getRDKit } from '../../io/rdkit.js';
import { t } from '../../i18n/i18n.js';
import { addArrow, copyObjects, emptyDoc, forEachPoint, freeIds } from '../../model/doc.js';
import { buildScene, moleculeBox } from '../../render/scene.js';

// --- turning a part over a bond (the top bar's Flip over a bond): the
// bond clicked is the axle, the selection turns half a circle about it
// (with nothing selected, the smaller side of the bond), and a see-through
// copy shows where it would go ---

// What turns over a bond: ids, or null (a ring bond, nothing selected).
const turning = (ed, bond) => (ed.selection.size ? ed.movingIds() : smallerSide(ed.doc, bond));

// The preview for a bond: the part that turns marked where it is (its atoms
// and bonds, `turning`, with the axle), and a copy of it, turned, in blue
// where it will be (a place preview, `tint`).
function turnedPreview(ed, bondId) {
  const ids = turning(ed, ed.doc.bonds.get(bondId));
  if (!ids) return null;
  const doc = structuredClone(ed.doc);
  turnOver(doc, doc.bonds.get(bondId), ids);
  const part = emptyDoc();
  copyObjects(doc, ids, 0, 0, part);
  part.texts.clear(); // (only the structure turned: no labels on it)
  const atoms = [...part.atoms.values()];
  if (!atoms.length) return null;
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  const moving = new Set(ids);
  const bonds = [...ed.doc.bonds.values()].filter((b) => b.id !== bondId && moving.has(b.a) && moving.has(b.b)).map((b) => b.id);
  return {
    kind: 'place', doc: part, at: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], tint: true,
    turning: [...ids.filter((id) => ed.doc.atoms.has(id)), ...bonds], axle: bondId,
  };
}

// tool: { name: 'flipOver' } (it keeps the preview of the bond under the pointer)
export const flipOver = {
  cursor: 'pointer',
  hover(ed, point, hit) {
    const bondId = hit?.kind === 'bond' ? hit.id : null;
    if (bondId !== ed.tool.shown) Object.assign(ed.tool, { shown: bondId, ghost: bondId === null ? null : turnedPreview(ed, bondId) });
    ed.preview = ed.tool.ghost;
    ed.emit();
  },
  click(ed, g) {
    if (g.hit?.kind !== 'bond') return;
    const ids = turning(ed, ed.doc.bonds.get(g.hit.id));
    if (!ids) {
      ed.say(t('That bond is in a ring: select the part that should turn over it first.'));
      return;
    }
    ed.change((doc) => turnOver(doc, doc.bonds.get(g.hit.id), ids));
    ed.setTool({ name: 'select' });
  },
};

// --- the ring flip of a chair (the top bar's Ring flip): the chair under
// the pointer flips, axial ⇄ equatorial, each group staying on its face
// (src/chem/ringFlip.js); a see-through copy shows the other chair; with
// Shift, the other chair goes beside it, with an equilibrium arrow ---

const FLIP_GAP = 0.8; // between a chair (its labels) and the arrow
const FLIP_ARROW = 2.4;

// The six-membered ring under the pointer (atom ids in ring order): the
// ring of the atom or bond there, or the ring round the point.
function chairUnder(ed, point, hit) {
  const scene = ed.scene;
  const rings = scene.rings.filter((ring) => ring.length === 6);
  const bond = hit?.kind === 'bond' ? ed.doc.bonds.get(hit.id) : null;
  const atoms = hit?.kind === 'atom' ? [hit.id] : bond ? [bond.a, bond.b] : null;
  if (atoms) {
    const found = rings.find((ring) => atoms.every((id) => ring.includes(id)));
    if (found) return found;
  }
  return rings.find((ring) => {
    const polygon = ring.map((id) => scene.atoms.get(id)?.pos ?? [ed.doc.atoms.get(id).x, ed.doc.atoms.get(id).y]);
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [[xi, yi], [xj, yj]] = [polygon[i], polygon[j]];
      if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }) ?? null;
}

const FLIP_REFUSED = {
  shape: () => t('Only a chair drawn as the templates draw it can flip (Templates → Conformations and projections); this ring is drawn otherwise.'),
  bonds: () => t("Only a ring of single bonds flips or becomes a chair (a cyclohexene's half-chair isn't drawn)."),
  // (a chair whose up and down is drawn by a wedge on a ring bond: a chair says it by its axial and equatorial bonds)
  ringWedge: () => t('A chair with a wedge on a bond of the ring itself doesn\'t flip: in a chair, up and down are said by the axial and equatorial bonds. Take the wedge off, then flip it.'),
  fused: () => t("Fused or bridged rings (decalins, steroids) can't flip yet: only a chair on its own, with groups on it."),
  crowded: () => t('Two groups on one atom of this chair point the same way; one should be axial, the other equatorial.'),
  bridge: () => t('Seen along two bonds, cyclohexane flips only with its groups on the four carbons seen end on, none on the two between.'),
  newman: () => t('Cyclohexane seen along two bonds flips only drawn as the template draws it (Templates → Conformations and projections).'),
};

// The flipped chair (its molecule) as a drawing of its own, where it goes:
// in place, or (beside) to the right of the chair with an equilibrium
// arrow from it. Returns { part, at (the middle of its atoms, for the
// preview) } or null.
function flippedChair(ed, flip, beside) {
  const doc = structuredClone(ed.doc);
  for (const [id, [x, y]] of flip.at(1)) Object.assign(doc.atoms.get(id), { x, y });
  const part = emptyDoc();
  const ids = copyObjects(doc, flip.atoms, 0, 0, part);
  if (!beside) part.texts.clear(); // (the preview: only the structure)
  if (beside) {
    const box = moleculeBox(flip.atoms, ed.scene.atoms);
    const copyBox = moleculeBox(ids.filter((id) => part.atoms.has(id)), buildScene(part, ed.settings).atoms);
    const ring = flip.atoms.slice(0, 6).map((id) => ed.doc.atoms.get(id));
    const y = ring.reduce((s, a) => s + a.y, 0) / 6; // the arrow at the height of the ring's middle
    const x1 = box.x2 + FLIP_GAP;
    const x2 = x1 + FLIP_ARROW;
    forEachPoint(part, [...part.atoms.keys(), ...freeIds(part)], (o, [kx]) => {
      o[kx] += x2 + FLIP_GAP - copyBox.x1;
    });
    addArrow(part, x1, y, x2, y, 'equilibrium');
  }
  const atoms = [...part.atoms.values()];
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  return { part, at: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] };
}

// --- a flat ring drawn as a chair (the ring flip tool on a six-membered ring that isn't one yet,
// src/chem/toChair.js): worked out in the background (RDKit checks that the drawn R/S stays), its chair
// shown see-through, the ring lit as a chair is, and drawn on a click ---

const CHAIR_REFUSED = {
  double: () => t("Only a ring of single bonds flips or becomes a chair (a cyclohexene's half-chair isn't drawn)."),
  ringWedge: () => t('A wedge on a bond of the ring itself could not be moved onto a group: draw this R/S with a wedge on a group, then the ring becomes a chair.'),
  fused: () => t('Fused or bridged rings (decalins, steroids) are not drawn as chairs yet: only a ring on its own, with groups on it.'),
  crowded: () => t('An atom of this ring has more than two groups.'),
  stereo: () => t("This ring can't be drawn as a chair with its R/S kept."),
  // (a ring drawn by Turn in 3D, seen at an angle: up and down can't be read off its wedges as off a flat ring's)
  seen3D: () => t('This ring is drawn as seen in 3D, not flat, so which way its groups point can\'t be read off it for a chair. Redraw it flat first, then Ring flip.'),
  shape: () => t('Only a six-membered ring becomes a chair.'),
  failed: ({ reason }) => t('This ring could not be drawn as a chair ({reason}).', { reason }),
};

// The chair of the flat ring `ring`, for the document as it is now: a promise of ringToChair's answer,
// kept for as long as the document doesn't change.
function chairOf(ed, ring) {
  const key = `${ring.join(',')}|${ed.docVersion}`;
  if (ed.tool.chair?.key !== key) {
    const doc = ed.doc;
    const version = ed.docVersion;
    // (RDKit not loading rejects; an error in working the chair out is an answer, so that it is said as it is. A
    // drawing changed while RDKit loaded, the ring perhaps gone: nothing worked out, and no one asks any more)
    ed.tool.chair = { key, made: getRDKit().then((RDKit) => {
      if (ed.docVersion !== version) return { error: 'changed' };
      try {
        return ringToChair(RDKit, doc, ring);
      } catch (error) {
        console.error('[ring flip]', error);
        return { error: 'failed', reason: error.message };
      }
    }) };
  }
  return ed.tool.chair.made;
}

// The see-through chair a flat ring becomes, with the ring's bonds to light up.
function chairGhost(ed, ring, made) {
  const part = emptyDoc();
  copyObjects(made.doc, made.atoms, 0, 0, part);
  part.texts.clear();
  const atoms = [...part.atoms.values()];
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  const moving = new Set(made.atoms);
  const bonds = [...ed.doc.bonds.values()].filter((b) => moving.has(b.a) && moving.has(b.b)).map((b) => b.id);
  const inRing = new Set(ring);
  const lit = bonds.filter((id) => inRing.has(ed.doc.bonds.get(id).a) && inRing.has(ed.doc.bonds.get(id).b));
  return { kind: 'place', doc: part, at: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], tint: true, turning: [...made.atoms, ...bonds], lit };
}

// tool: { name: 'chairTurn' }: a click on a chair turns it a third of the way round its axis, anticlockwise
// (Shift+click: clockwise), drawn in the templates' shape where it stands: each ring atom two corners on, its
// groups staying axial or equatorial, up or down (the same molecule and conformation, seen turned; the ring
// flip gives the other chair). The chair under the pointer shows see-through where it would go; stays on.
const TURN_REFUSED = {
  shape: () => t('Only a chair turns (Templates → Conformations and projections, or a flat ring that Ring flip has made a chair); this ring is drawn otherwise.'),
  newman: () => t("A ring seen along two bonds (a Newman projection) doesn't turn; only a chair does."),
};

export const chairTurnTool = {
  cursor: 'pointer',
  hover(ed, point, hit) {
    const ring = ed.animation ? null : chairUnder(ed, point, hit);
    const key = ring && `${ring.join(',')}|${ed.shiftHeld}|${ed.docVersion}`;
    if (key !== ed.tool.shown) {
      let ghost = null;
      const turned = ring && chairTurn(ed.doc, ring, ed.shiftHeld ? -1 : 1);
      if (turned && !turned.error) {
        const shown = flippedChair(ed, turned, false);
        const moving = new Set(turned.atoms);
        const bonds = [...ed.doc.bonds.values()].filter((b) => moving.has(b.a) && moving.has(b.b)).map((b) => b.id);
        ghost = { kind: 'place', doc: shown.part, at: shown.at, tint: true, turning: [...turned.atoms, ...bonds] };
      }
      Object.assign(ed.tool, { shown: key, ghost });
    }
    ed.preview = ed.tool.ghost;
    ed.emit();
  },
  click(ed, g) {
    const ring = chairUnder(ed, g.start, g.hit);
    if (!ring) return;
    const turned = chairTurn(ed.doc, ring, g.shift ? -1 : 1);
    if (turned.error) {
      ed.say((TURN_REFUSED[turned.error] ?? FLIP_REFUSED[turned.error])());
      return;
    }
    Object.assign(ed.tool, { shown: null, ghost: null });
    ed.preview = null;
    if (ed.animationsOn()) ed.animate(turned.at);
    else {
      ed.change((doc) => {
        for (const [id, [x, y]] of turned.at(1)) Object.assign(doc.atoms.get(id), { x, y });
      });
    }
  },
  cancel(ed) {
    ed.preview = null;
  },
};

// The ring flip of `ring`, or { error: 'shape' } for a flat ring that may become a chair. A ring refused only for
// a wedge on a bond of the ring itself ('bonds') is looked at again without it: flat, it may become a chair
// (ringToChair moves such a wedge onto a group, the R/S the same); a chair already, it is refused for that wedge
// ('ringWedge'), not as if the ring had a double bond; else for what is wrong with it without the wedge.
function flipOrFlat(doc, ring) {
  const flip = ringFlip(doc, ring);
  if (flip.error !== 'bonds') return flip;
  const wedged = ringWedges(doc, ring);
  if (!wedged.length) return flip;
  const plain = structuredClone(doc);
  for (const bond of wedged) plain.bonds.get(bond.id).stereo = '';
  const without = ringFlip(plain, ring);
  if (without.error === 'shape') return { error: 'shape' };
  return without.error ? without : { error: 'ringWedge' };
}

// tool: { name: 'ringFlip' } (it keeps the preview of the chair under the pointer); stays on, so a
// second click flips the chair back. On a flat six-membered ring: it becomes a chair.
export const ringFlipTool = {
  cursor: 'pointer',
  hover(ed, point, hit) {
    const ring = ed.animation ? null : chairUnder(ed, point, hit);
    const key = ring && `${ring.join(',')}|${ed.shiftHeld}|${ed.docVersion}`;
    if (key !== ed.tool.shown) {
      let ghost = null;
      const flip = ring && flipOrFlat(ed.doc, ring);
      // (a flat ring becomes a chair; cyclohexane seen along a bond, a Newman projection, doesn't)
      if (flip?.error === 'shape' && !seenEndOn(ed.doc, ring)) {
        // not a chair: the chair it would become, once worked out (the pointer still on it)
        chairOf(ed, ring).then((made) => {
          if (ed.tool.shown !== key || made.error) return;
          ed.tool.ghost = chairGhost(ed, ring, made);
          ed.preview = ed.tool.ghost;
          ed.emit();
        }, () => {});
      } else if (flip && !flip.error) {
        const shown = flippedChair(ed, flip, ed.shiftHeld);
        // with Shift the chair stays: the copy and the arrow beside it; else it is washed out under its flipped copy
        const moving = new Set(flip.atoms);
        const bonds = [...ed.doc.bonds.values()].filter((b) => moving.has(b.a) && moving.has(b.b)).map((b) => b.id);
        ghost = { kind: 'place', doc: shown.part, at: shown.at, tint: true, ...(ed.shiftHeld ? {} : { turning: [...flip.atoms, ...bonds] }) };
      }
      Object.assign(ed.tool, { shown: key, ghost });
    }
    ed.preview = ed.tool.ghost;
    ed.emit();
  },
  click(ed, g) {
    const ring = chairUnder(ed, g.start, g.hit);
    if (!ring) return;
    const flip = flipOrFlat(ed.doc, ring);
    if (flip.error === 'shape' && seenEndOn(ed.doc, ring)) {
      ed.say(FLIP_REFUSED.newman());
      return;
    }
    if (flip.error === 'shape') {
      // a flat ring: drawn as a chair, once worked out (RDKit may still be loading); not if the drawing has
      // changed meanwhile (the ring deleted, moved, undone: the chair is of the drawing as it was)
      const version = ed.docVersion;
      chairOf(ed, ring).then((made) => {
        if (ed.docVersion !== version) return;
        if (made.error) {
          const seen3D = made.error === 'stereo' && [...ed.doc.bonds.values()].some((b) => ring.includes(b.a) && ring.includes(b.b) && b.z !== undefined);
          ed.say(CHAIR_REFUSED[seen3D ? 'seen3D' : made.error](made));
          return;
        }
        if (ed.tool.name === 'ringFlip') Object.assign(ed.tool, { shown: null, ghost: null });
        ed.preview = null;
        ed.change((doc) => {
          for (const id of made.atoms) Object.assign(doc.atoms.get(id), { x: made.doc.atoms.get(id).x, y: made.doc.atoms.get(id).y });
          const moved = new Set(made.atoms);
          for (const bond of doc.bonds.values()) {
            if (!moved.has(bond.a) && !moved.has(bond.b)) continue;
            const now = made.doc.bonds.get(bond.id);
            Object.assign(bond, { a: now.a, b: now.b, stereo: now.stereo });
          }
        });
        if (made.wavy) ed.say(t('The groups whose side the drawing doesn\'t say have wavy bonds.'));
      }, () => ed.say(t('RDKit could not be loaded: the chair needs it to keep the R/S.')));
      return;
    }
    if (flip.error) {
      ed.say(FLIP_REFUSED[flip.error]());
      return;
    }
    Object.assign(ed.tool, { shown: null, ghost: null });
    ed.preview = null;
    if (g.shift) {
      const { part } = flippedChair(ed, flip, true);
      ed.change((doc) => copyObjects(part, [...part.atoms.keys(), ...freeIds(part)], 0, 0, doc));
      return;
    }
    if (ed.animationsOn()) ed.animate(flip.at);
    else {
      ed.change((doc) => {
        for (const [id, [x, y]] of flip.at(1)) Object.assign(doc.atoms.get(id), { x, y });
      });
    }
  },
  cancel(ed) {
    ed.preview = null;
  },
};

// tool: { name: 'snapBond' }: a click on a bond makes it horizontal or vertical (again: the next
// quarter), turning the selection if the bond is in it, else its molecule; the tool stays
export const snapTool = {
  cursor: 'pointer',
  click(ed, g) {
    if (g.hit?.kind === 'bond') snapBond(ed, g.hit.id);
  },
};
