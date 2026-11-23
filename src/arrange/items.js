// The selected objects (molecules, reaction arrows, "+" signs, text) as
// items that know their box and can be moved, for the arranging tools
// (Align, Align reaction). A molecule is always moved whole, with its lone
// pairs and curved arrows; molecules joined by a curved arrow (a base and
// the proton it takes) move as one. Coordinates: drawing units, y down.
import { forEachPoint } from '../model/doc.js';
import { fragments } from '../model/graph.js';
import { bracketShapes } from '../render/scene.js';
import { modelBox } from '../render/model3d.js';


export function boxOf(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
export const unionBox = (boxes) => boxOf(boxes.flatMap((b) => [[b.minX, b.minY], [b.maxX, b.maxY]]));
export const centre = (box) => [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
export const width = (box) => box.maxX - box.minX;
export const height = (box) => box.maxY - box.minY;

function boxDistance(a, b) {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

// Movers write into the document directly; the caller wraps them in one
// undo step.
function moleculeItem(doc, scene, atomIds) {
  const points = () => atomIds.flatMap((id) => {
    const info = scene.atoms.get(id);
    const atom = doc.atoms.get(id);
    const [dx, dy] = [atom.x - info.pos[0], atom.y - info.pos[1]]; // moved since the scene was made
    const boxes = info.label?.boxes ?? [];
    return [[atom.x, atom.y], ...boxes.flatMap((b) => [[atom.x + b.x1, atom.y + b.y1], [atom.x + b.x2, atom.y + b.y2]]),
      ...[...info.electrons.pairs, ...info.electrons.unpaired].map((e) => [e.point[0] + dx, e.point[1] + dy])];
  });
  // its atoms and their symbols only (no charges, written hydrogens, lone pairs): what a row lines up
  const core = () => atomIds.flatMap((id) => {
    const atom = doc.atoms.get(id);
    const b = scene.atoms.get(id).label?.symbolBox;
    return b ? [[atom.x + b.x1, atom.y + b.y1], [atom.x + b.x2, atom.y + b.y2]] : [[atom.x, atom.y]];
  });
  return {
    kind: 'molecule',
    atomIds,
    box: () => boxOf(points()),
    core: () => boxOf(core()),
    move: (dx, dy) => forEachPoint(doc, atomIds, (o, [kx, ky]) => {
      o[kx] += dx;
      o[ky] += dy;
    }),
  };
}

const COLLECTION = { arrow: 'arrows', plus: 'pluses', text: 'texts', model: 'models' };

function simpleItem(doc, scene, kind, id) {
  const object = doc[COLLECTION[kind]].get(id);
  const box = () => {
    if (kind === 'arrow') return boxOf([[object.x1, object.y1], [object.x2, object.y2]]);
    if (kind === 'plus') return boxOf([[object.x - 0.3, object.y - 0.3], [object.x + 0.3, object.y + 0.3]]);
    if (kind === 'model') {
      // (a 3D model: its balls as drawn)
      const b = modelBox(object);
      return { minX: b.x1, maxX: b.x2, minY: b.y1, maxY: b.y2 };
    }
    const { box: b, at } = scene.texts.get(id);
    const [dx, dy] = [object.x - at[0], object.y - at[1]]; // moved since the scene was made
    return { minX: b.x1 + dx, maxX: b.x2 + dx, minY: b.y1 + dy, maxY: b.y2 + dy };
  };
  return {
    kind,
    id,
    object,
    box,
    move: (dx, dy) => forEachPoint(doc, [id], (o, [kx, ky]) => {
      o[kx] += dx;
      o[ky] += dy;
    }),
  };
}

// Molecules joined by curved arrows become one item. Not a molecule on a reaction arrow (a reagent: it goes
// with its arrow) with one that isn't on that arrow: an arrow from a product's N to the H of the H2O over the
// next arrow had made the two one item, which rode on that arrow, so Align took the product out of the row and
// moved it with the arrow, onto the arrow before it.
function joinByArrows(doc, items) {
  const molecules = items.filter((item) => item.kind === 'molecule');
  const owner = new Map();
  molecules.forEach((item, k) => item.atomIds.forEach((id) => owner.set(id, k)));
  const group = molecules.map((_, k) => k);
  const find = (k) => (group[k] === k ? k : (group[k] = find(group[k])));
  const arrowOf = molecules.map((item) => item.atomIds.map((id) => doc.atoms.get(id).arrow).find((arrow) => arrow != null) ?? null);
  const join = (a, b) => {
    if (a !== undefined && b !== undefined && arrowOf[a] === arrowOf[b]) group[find(a)] = find(b);
  };
  const atomOf = (end) => end.atom ?? (end.orbital !== undefined ? doc.orbitals.get(end.orbital)?.atom : doc.bonds.get(end.bond)?.a);
  for (const curve of doc.curves.values()) join(owner.get(atomOf(curve.from)), owner.get(atomOf(curve.to)));
  // (so are molecules with a dashed line between their orbitals: a Diels–Alder's diene and dienophile)
  for (const overlap of doc.overlaps?.values() ?? []) join(owner.get(doc.orbitals.get(overlap.a)?.atom), owner.get(doc.orbitals.get(overlap.b)?.atom));
  const joined = new Map();
  molecules.forEach((item, k) => {
    const root = find(k);
    if (!joined.has(root)) joined.set(root, []);
    joined.get(root).push(item);
  });
  // a "+" between them (HO⁻ + CH3Br with the SN2's arrow) goes with them, as drawn: it came out of the row in front
  // of them or after them, a gap where it was. `parts`: what they are on their own (Align's line up, spacing)
  const pluses = items.filter((item) => item.kind === 'plus');
  const taken = new Set();
  const merged = [...joined.values()].map((members) => {
    if (members.length === 1) return members[0];
    const area = unionBox(members.map((m) => m.box()));
    const between = pluses.filter((plus) => {
      const [x, y] = centre(plus.box());
      return !taken.has(plus) && x > area.minX && x < area.maxX && y > area.minY && y < area.maxY;
    });
    between.forEach((plus) => taken.add(plus));
    const all = [...members, ...between];
    return {
      kind: 'molecule',
      atomIds: members.flatMap((m) => m.atomIds),
      parts: all,
      box: () => unionBox(all.map((m) => m.box())),
      core: () => unionBox(members.map((m) => m.core())),
      move: (dx, dy) => all.forEach((m) => m.move(dx, dy)),
    };
  });
  return [...merged, ...items.filter((item) => item.kind !== 'molecule' && !taken.has(item))];
}

// The selected objects as items (doc: the document to move things in,
// usually the editor's, inside a change()).
export const selectedItems = (ed, doc) => itemsOf(doc, ed.scene, ed.selection, ed.selectedAtoms());

// The objects of `selection` (a Set of ids) as items, without an editor: `scene` drawn from `doc`,
// `atoms` the atoms that move with them (default: the selected atoms and the atoms of selected bonds).
export function itemsOf(doc, scene, selection, atoms = null) {
  const selected = (kind) => [...selection].filter((id) => doc[kind].has(id));
  const selectedAtoms = new Set(atoms ?? [...selected('atoms'), ...selected('bonds').flatMap((id) => [doc.bonds.get(id).a, doc.bonds.get(id).b])]);
  const items = fragments(doc).filter((members) => members.some((id) => selectedAtoms.has(id))).map((members) => moleculeItem(doc, scene, members));
  for (const id of selected('arrows')) if (doc.arrows.get(id).kind !== 'dipole') items.push(simpleItem(doc, scene, 'arrow', id));
  for (const id of selected('pluses')) items.push(simpleItem(doc, scene, 'plus', id));
  for (const id of doc.models ? selected('models') : []) items.push(simpleItem(doc, scene, 'model', id));
  // the text on a selected molecule's anchors goes with it, selected or not (a box that missed its name)
  const texts = new Set(selected('texts'));
  const inMolecules = new Set(items.flatMap((item) => item.atomIds));
  for (const text of doc.texts.values()) if (inMolecules.has(text.anchor)) texts.add(text.id);
  for (const id of texts) items.push(simpleItem(doc, scene, 'text', id));
  return withFollowers(doc, selection, joinByArrows(doc, items));
}

const DIPOLE_REACH = 0.8; // a dipole arrow this close to a molecule belongs to it

// Brackets go with the molecules inside them (a transition state, an ion, a
// repeating unit), dipole arrows with the molecule they lie on, selected or
// not; other selected brackets and dipole arrows are items of their own.
function withFollowers(doc, selection, items) {
  const result = [...items];
  // a bracket round two things or more (resonance forms with their arrow, a part of a scheme): one block, the
  // bracket and what is inside it moved together as drawn. (It went with the first molecule inside it, whose box
  // then spanned the bracket, the rest lined up on their own: Align reaction scheme put the resonance arrow in
  // front of the bracket, the second form after it, a wide gap after the first)
  // Not when all that is selected is inside it and it isn't (resonance forms lined up inside their bracket): then
  // they are lined up among themselves, the bracket stays. The smallest first: a bracket in a bracket is a block
  // in the outer one's, whichever was drawn first.
  const blocked = new Set();
  const areaOf = (bracket) => {
    const b = bracketShapes(bracket).box;
    return { minX: b.x1, maxX: b.x2, minY: b.y1, maxY: b.y2 };
  };
  const bySize = [...doc.brackets.values()].sort((p, q) => width(areaOf(p)) * height(areaOf(p)) - width(areaOf(q)) * height(areaOf(q)));
  for (const bracket of bySize) {
    const area = () => areaOf(bracket);
    const a = area();
    const inside = result.filter((item) => {
      const [x, y] = centre(item.box());
      return x > a.minX && x < a.maxX && y > a.minY && y < a.maxY;
    });
    if (inside.length < 2) continue;
    blocked.add(bracket.id);
    if (!selection.has(bracket.id) && inside.length === result.length) continue;
    for (const item of inside) result.splice(result.indexOf(item), 1);
    const molecules = inside.filter((item) => item.kind === 'molecule');
    result.push({
      kind: 'block',
      id: bracket.id,
      object: bracket,
      members: inside,
      box: () => unionBox([area(), ...inside.map((item) => item.box())]),
      // (lined up in a row by the molecules inside, as one molecule is by its atoms)
      ...(molecules.length && { core: () => unionBox(molecules.map((item) => item.core?.() ?? item.box())) }),
      move: (dx, dy) => {
        for (const item of inside) item.move(dx, dy);
        forEachPoint(doc, [bracket.id], (o, [kx, ky]) => {
          o[kx] += dx;
          o[ky] += dy;
        });
      },
    });
  }
  const followers = [
    ...[...doc.brackets.values()].filter((bracket) => !blocked.has(bracket.id)).map((bracket) => ({ object: bracket, kind: 'bracket', box: () => {
      const b = bracketShapes(bracket).box;
      return { minX: b.x1, maxX: b.x2, minY: b.y1, maxY: b.y2 };
    } })),
    ...[...doc.arrows.values()].filter((arrow) => arrow.kind === 'dipole')
      .map((arrow) => ({ object: arrow, kind: 'dipole', box: () => boxOf([[arrow.x1, arrow.y1], [arrow.x2, arrow.y2]]) })),
  ];
  for (const { object, kind, box } of followers) {
    const move = (dx, dy) => forEachPoint(doc, [object.id], (o, [kx, ky]) => {
      o[kx] += dx;
      o[ky] += dy;
    });
    const area = box();
    const host = items.find((item) => {
      if (item.kind !== 'molecule') return false;
      if (kind === 'dipole') return boxDistance(item.box(), area) <= DIPOLE_REACH;
      const [x, y] = centre(item.box());
      return x > area.minX && x < area.maxX && y > area.minY && y < area.maxY;
    });
    if (host) {
      const [hostBox, hostCore, hostMove] = [host.box, host.core, host.move];
      host.box = () => unionBox([hostBox(), box()]);
      // (brackets are part of what it is lined up by: two complexes level by their brackets)
      if (kind === 'bracket' && hostCore) host.core = () => unionBox([hostCore(), box()]);
      host.move = (dx, dy) => {
        hostMove(dx, dy);
        move(dx, dy);
      };
    } else if (selection.has(object.id)) {
      result.push({ kind, id: object.id, object, box, move });
    }
  }
  return result;
}

// Reagents and conditions: the molecules and texts put on an arrow go with
// it (arrow.riders; rider.rides = true).
export function attachRiders(items, doc) {
  const on = (item) => (item.kind === 'text' ? item.object.arrow
    : item.kind === 'molecule' ? item.atomIds.map((id) => doc.atoms.get(id).arrow).find((arrow) => arrow != null) : undefined);
  for (const arrow of items.filter((item) => item.kind === 'arrow')) {
    arrow.riders = items.filter((item) => !item.rides && on(item) === arrow.id);
    arrow.riders.forEach((rider) => {
      rider.rides = true;
    });
  }
}

// Text on a molecule's anchors goes with that molecule (molecule.labels;
// label.isLabel = true); other text stays an item of its own.
export function attachLabels(items) {
  const molecules = items.filter((item) => item.kind === 'molecule' && !item.rides);
  for (const text of items.filter((item) => item.kind === 'text' && !item.rides && item.object.anchor !== undefined)) {
    const host = molecules.find((molecule) => molecule.atomIds.includes(text.object.anchor));
    if (!host) continue;
    (host.labels ??= []).push(text);
    text.isLabel = true;
  }
}

// Puts the labels of these molecules (a row) on one line: those below
// under the lowest molecule, those above over the highest. A label stays
// on its anchor and only goes further from its molecule (text.drop).
export function labelsOnOneLine(molecules) {
  const bottom = Math.max(...molecules.map((m) => m.box().maxY));
  const top = Math.min(...molecules.map((m) => m.box().minY));
  for (const molecule of molecules) {
    const box = molecule.box();
    for (const label of molecule.labels ?? []) {
      const slot = label.object.slot ?? 'below';
      const drop = slot === 'below' ? bottom - box.maxY : slot === 'above' ? box.minY - top : 0;
      if (drop > 1e-6) label.object.drop = drop;
      else delete label.object.drop;
    }
  }
}
