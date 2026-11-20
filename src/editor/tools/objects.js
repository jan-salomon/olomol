// Molecules kept together, brackets, atom numbers.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { t } from '../../i18n/i18n.js';
import { addBond, addBracket } from '../../model/doc.js';
import { fragments } from '../../model/graph.js';
import { bracketBox } from '../../render/scene.js';
import { rectOf } from './shared.js';
import { atomOfHit } from './select.js';

// --- molecules kept together (K⁺, K⁺ and SiF6²⁻ as one for a grid) ---

// Links these molecules (lists of atom ids) into one: each joined to the
// nearest of the others already joined, from its atom nearest to theirs.
export function keepTogether(ed, molecules) {
  if (molecules.length < 2) return;
  const point = (id) => ed.doc.atoms.get(id);
  const distance = (p, q) => Math.hypot(point(p).x - point(q).x, point(p).y - point(q).y);
  const joined = [...molecules[0]];
  const rest = molecules.slice(1);
  const links = [];
  while (rest.length) {
    let best = null;
    rest.forEach((members, k) => {
      for (const a of joined) for (const b of members) if (!best || distance(a, b) < best.d) best = { a, b, k, d: distance(a, b) };
    });
    links.push([best.a, best.b]);
    joined.push(...rest.splice(best.k, 1)[0]);
  }
  ed.change((doc) => links.forEach(([a, b]) => addBond(doc, a, b, 1, { kind: 'link' })));
}

// The links among these atoms go: their molecules are on their own again.
export function keepApart(ed, atomIds) {
  const atoms = new Set(atomIds);
  const links = [...ed.doc.bonds.values()].filter((b) => b.kind === 'link' && atoms.has(b.a)).map((b) => b.id);
  if (links.length) ed.change((doc) => links.forEach((id) => doc.bonds.delete(id)));
}

// --- brackets ---

// Brackets round atoms (with their labels and electrons): a transition
// state or a complex ion when they are whole molecules, a repeating unit
// (with n) when bonds leave them. Selects the new brackets.
// (they keep fitting the atoms as the drawing changes: bracket.atoms, see scene.js)
export function bracketAtoms(ed, atomIds) {
  const box = bracketBox(ed.doc, ed.scene, atomIds);
  if (!box) return;
  const id = ed.change((doc) => addBracket(doc, box.x1, box.y1, box.x2, box.y2, { sub: box.exits ? 'n' : '', atoms: [...atomIds] }).id);
  ed.select([id]);
}

export const bracket = {
  cursor: 'crosshair',
  click(ed, g) {
    const start = atomOfHit(ed.doc, g.hit);
    if (start === null) {
      ed.say(t('Drag a box for brackets, or click a molecule to put it in brackets.'));
      return;
    }
    bracketAtoms(ed, fragments(ed.doc).find((members) => members.includes(start)));
  },
  drag(ed, g) {
    ed.preview = { kind: 'rect', ...rectOf(g.start, g.point) };
    ed.emit();
  },
  dragEnd(ed, g) {
    ed.preview = null;
    const box = rectOf(g.start, g.point);
    if (box.x2 - box.x1 < 0.3 || box.y2 - box.y1 < 0.3) {
      ed.emit();
      return;
    }
    const id = ed.change((doc) => addBracket(doc, box.x1, box.y1, box.x2, box.y2).id);
    ed.select([id]);
  },
};

// --- atom numbers: atoms clicked in the order wanted ---

// IUPAC numbers on or off for these molecules (lists of atom ids): the
// scene works them out again after each change. Numbers set by hand go.
export function numberAtoms(ed, molecules, on) {
  ed.change((doc) => {
    for (const id of molecules.flat()) {
      const atom = doc.atoms.get(id);
      atom.number = null;
      if (on) atom.autoNumber = true;
      else delete atom.autoNumber;
    }
  });
}

// One atom's number set by hand (null: none). A molecule numbered by the
// IUPAC rules keeps the numbers it shows, now as its own.
export function setAtomNumber(ed, id, number) {
  const shown = ed.scene.atoms;
  ed.change((doc) => {
    byHand(doc, fragments(doc).find((m) => m.includes(id)), shown);
    doc.atoms.get(id).number = number;
  });
}

// A molecule's IUPAC numbers made its own (`shown`: the scene's atoms, for
// the numbers they show), or dropped (no `shown`).
function byHand(doc, members, shown = null) {
  if (!members.some((id) => doc.atoms.get(id).autoNumber)) return;
  for (const id of members) {
    const atom = doc.atoms.get(id);
    delete atom.autoNumber;
    atom.number = shown?.get(id)?.number ? Number(shown.get(id).number.text) : null;
  }
}

// The number the next atom clicked in this atom's molecule gets.
function nextAtomNumber(doc, id) {
  const members = fragments(doc).find((m) => m.includes(id));
  return Math.max(0, ...members.map((m) => doc.atoms.get(m).number ?? 0)) + 1;
}

// A click on an atom: the next number of its molecule (1, 2, 3…); on a
// numbered atom: its number off. The number it would get shows first. A
// molecule numbered by the IUPAC rules starts again at 1.
export const atomNumber = {
  cursor: 'pointer',
  hover(ed, point, hit) {
    const atom = hit?.kind === 'atom' ? ed.doc.atoms.get(hit.id) : null;
    ed.preview = atom && atom.number == null ? { kind: 'badge', at: [atom.x + 0.32, atom.y - 0.32], text: String(nextAtomNumber(ed.doc, atom.id)) } : null;
    ed.emit();
  },
  click(ed, g) {
    ed.preview = null;
    if (g.hit?.kind !== 'atom') return;
    ed.change((doc) => {
      byHand(doc, fragments(doc).find((m) => m.includes(g.hit.id)));
      const atom = doc.atoms.get(g.hit.id);
      atom.number = atom.number == null ? nextAtomNumber(doc, atom.id) : null;
    });
  },
  cancel(ed) {
    ed.preview = null;
  },
};
