// The Align tools: line up or space out the selected objects, put them in
// a grid, or arrange a reaction scheme in one row. A molecule moves
// together with the texts on its anchors, an arrow with the reagents and
// conditions put on it; drawings never change. "Centre" is the middle of the
// whole selection, "left" its leftmost edge. One undo step per action.
import { bondsByAtom, bracketsOfMolecule, forEachPoint, freeIds, keepMargins, mapBracket, moveObjects, otherEnd, turningOrbitals } from '../model/doc.js';
import { fragments } from '../model/graph.js';
import { buildScene, DEFAULT_SETTINGS } from '../render/scene.js';
import { t } from '../i18n/i18n.js';
import { groupChain, wholeGroups } from '../editor/grouping.js';
import { attachLabels, attachRiders, centre, height, itemsOf, labelsOnOneLine, selectedItems, unionBox, width } from './items.js';

export const GRID_GAP = 1.25; // between grid cells, in bond lengths (the Align menu can set another)
const ROW_GAP = 0.7; // between neighbours in a reaction row
const READ_ARROW = 2; // a read reaction's arrows, before Align makes them as long as they need (as one clicked in)
const ARROW_OVERHANG = 0.5; // how far an arrow reaches past the reagents over it, at each end

// What a molecule is lined up by: across, its whole box; up and down, its
// atoms and their symbols only, so that a charge, written hydrogens or lone
// pairs don't lift or lower it (Cl⁻ and H2O level with Cl and O).
function alignBox(item) {
  const box = item.box();
  const core = item.core?.();
  return core ? { ...box, minY: core.minY, maxY: core.maxY } : box;
}

// What moves as one: an object with its followers. `box` is what gets
// aligned (alignBox), `outline` includes the followers.
// Text on a molecule's anchors goes with it; any other text is lined up on its own.
function units(items, doc) {
  attachRiders(items, doc);
  attachLabels(items);
  return items.filter((item) => !item.rides && !item.isLabel).map((item) => {
    const members = [item, ...(item.riders ?? []), ...(item.labels ?? [])];
    return {
      item,
      box: alignBox(item),
      outline: unionBox(members.map((member) => member.box())),
      move: (dx, dy) => members.forEach((member) => member.move(dx, dy)),
    };
  });
}

// Every object on its own, followers included: for selections such as an
// arrow with its condition text, where grouping would leave one unit.
// (a name on a selected molecule's anchor is no object of its own: it goes with its molecule)
function separately(items) {
  const onMolecule = (item) => item.kind === 'text' && item.object.anchor !== undefined
    && items.some((other) => other.kind === 'molecule' && other.atomIds.includes(item.object.anchor));
  // (molecules joined by a curved arrow, and a + between them, each on its own too)
  return items.flatMap((item) => item.parts ?? [item]).filter((item) => !onMolecule(item)).map((item) => ({ item, box: alignBox(item), outline: item.box(), move: item.move }));
}

// Groups move as blocks (Ctrl+G): the units of a group that is selected whole aligned as one, by the outermost
// such group; when all that is selected is one group, by the groups one level inside it (a group of rows: its rows)
function asBlocks(ed, list) {
  const { doc } = ed;
  if (!doc.groups?.size || list.length < 2) return list;
  const whole = wholeGroups(ed);
  if (!whole.size) return list;
  const idOf = (unit) => unit.item.atomIds?.[0] ?? unit.item.object?.id ?? unit.item.id;
  const chains = list.map((unit) => groupChain(doc, idOf(unit)));
  let keys = chains.map((chain, k) => chain.filter((id) => whole.has(id)).at(-1) ?? `u${k}`);
  if (new Set(keys).size === 1 && typeof keys[0] === 'number') {
    const outer = keys[0];
    keys = chains.map((chain, k) => chain[chain.indexOf(outer) - 1] ?? `u${k}`);
  }
  const blocks = new Map();
  list.forEach((unit, k) => {
    if (!blocks.has(keys[k])) blocks.set(keys[k], []);
    blocks.get(keys[k]).push(unit);
  });
  return [...blocks.values()].map((members) => (members.length === 1 ? members[0] : {
    item: { kind: 'group' },
    box: unionBox(members.map((unit) => unit.box)),
    outline: unionBox(members.map((unit) => unit.outline)),
    move: (dx, dy) => members.forEach((unit) => unit.move(dx, dy)),
  }));
}

const moveAlong = (unit, axis, d) => (axis === 0 ? unit.move(d, 0) : unit.move(0, d));

function lineUp(list, axis, point, target) {
  list.forEach((unit) => moveAlong(unit, axis, target - point(unit.box)));
}

function spaceCentres(list, axis) {
  const sorted = [...list].sort((a, b) => centre(a.box)[axis] - centre(b.box)[axis]);
  const first = centre(sorted[0].box)[axis];
  const step = (centre(sorted.at(-1).box)[axis] - first) / (sorted.length - 1);
  sorted.forEach((unit, i) => moveAlong(unit, axis, first + i * step - centre(unit.box)[axis]));
}

function spaceGaps(list, axis) {
  const [low, high, size] = axis === 0 ? ['minX', 'maxX', width] : ['minY', 'maxY', height];
  const sorted = [...list].sort((a, b) => centre(a.box)[axis] - centre(b.box)[axis]);
  const span = Math.max(...sorted.map((unit) => unit.box[high])) - sorted[0].box[low];
  const gap = (span - sorted.reduce((sum, unit) => sum + size(unit.box), 0)) / (sorted.length - 1);
  let cursor = sorted[0].box[low];
  for (const unit of sorted) {
    moveAlong(unit, axis, cursor - unit.box[low]);
    cursor += size(unit.box) + gap;
  }
}

// Rows of `columns` (default: as square as possible) in reading order,
// centred where the selection was; each column as wide as its widest
// object with its labels, each row as high as its highest, so small
// molecules don't get the gutters of the largest; the labels of a row on one line.
function grid(list, columns, gap = GRID_GAP) {
  const perRow = columns || Math.ceil(Math.sqrt(list.length));
  // reading order: lines (objects whose middles are within the first one's height), each left to right
  const lines = [];
  for (const unit of [...list].sort((a, b) => centre(a.outline)[1] - centre(b.outline)[1])) {
    const line = lines.at(-1);
    if (line && centre(unit.outline)[1] <= line[0].outline.maxY) line.push(unit);
    else lines.push([unit]);
  }
  const order = lines.flatMap((line) => line.sort((a, b) => centre(a.outline)[0] - centre(b.outline)[0]));
  const rows = [];
  for (let i = 0; i < order.length; i += perRow) rows.push(order.slice(i, i + perRow));
  const widths = Array.from({ length: perRow }, (_, c) => Math.max(0, ...rows.map((row) => (row[c] ? width(row[c].outline) : 0))) + gap);
  const heights = rows.map((row) => Math.max(...row.map((unit) => height(unit.outline))) + gap);
  const start = (sizes, k) => sizes.slice(0, k).reduce((sum, s) => sum + s, 0);
  // the moves for cells from the origin, then all of them shifted so the
  // outlines' box keeps its centre
  const moves = rows.flatMap((row, r) => row.map((unit, c) => {
    const [x, y] = centre(unit.box);
    return [unit, start(widths, c) + widths[c] / 2 - x, start(heights, r) + heights[r] / 2 - y];
  }));
  const moved = (box, dx, dy) => ({ minX: box.minX + dx, minY: box.minY + dy, maxX: box.maxX + dx, maxY: box.maxY + dy });
  const [bx, by] = centre(unionBox(list.map((unit) => unit.outline)));
  const [ax, ay] = centre(unionBox(moves.map(([unit, dx, dy]) => moved(unit.outline, dx, dy))));
  for (const [unit, dx, dy] of moves) unit.move(dx + bx - ax, dy + by - ay);
  for (const row of rows) labelsOnOneLine(row.map((unit) => unit.item).filter((item) => item.kind === 'molecule'));
}

const selectionBox = (list) => unionBox(list.map((unit) => unit.box));

export const ACTIONS = {
  left: (u) => lineUp(u, 0, (b) => b.minX, selectionBox(u).minX),
  centre: (u) => lineUp(u, 0, (b) => centre(b)[0], centre(selectionBox(u))[0]),
  right: (u) => lineUp(u, 0, (b) => b.maxX, selectionBox(u).maxX),
  top: (u) => lineUp(u, 1, (b) => b.minY, selectionBox(u).minY), // y points down
  middle: (u) => lineUp(u, 1, (b) => centre(b)[1], centre(selectionBox(u))[1]),
  bottom: (u) => lineUp(u, 1, (b) => b.maxY, selectionBox(u).maxY),
  'centres-x': (u) => spaceCentres(u, 0),
  'gaps-x': (u) => spaceGaps(u, 0),
  'centres-y': (u) => spaceCentres(u, 1),
  'gaps-y': (u) => spaceGaps(u, 1),
  grid,
};

export function align(ed, action, columns = 0, gap = GRID_GAP) {
  const needed = action.startsWith('centres') || action.startsWith('gaps') ? 3 : 2;
  const count = (list) => list.length;
  let ok = false;
  ed.checkpoint();
  const items = selectedItems(ed, ed.doc);
  const each = units(items, ed.doc);
  let objects = asBlocks(ed, each);
  if (count(objects) < needed) objects = each;
  if (count(objects) < needed) objects = separately(selectedItems(ed, ed.doc));
  if (count(objects) >= needed) {
    ACTIONS[action](objects, columns, gap);
    ok = true;
  }
  if (!ok) {
    ed.dropCheckpoint();
    ed.say(t('Select at least {n} objects (molecules, arrows, text) first.', { n: needed }));
    return;
  }
  ed.touched();
}

// --- Align reaction ---

// Puts the selected scheme in one row: reactants, "+", arrows and products
// keep their order and drawings; they are spaced evenly and centred on the
// line of the first arrow, arrows made horizontal (and long enough for the
// reagents over them). Labels go on one line under (or over) the row.
export function alignReaction(ed) {
  const items = selectedItems(ed, ed.doc);
  if (!items.length) {
    ed.say(t('Select the reaction scheme you want to align first.'));
    return;
  }
  if (!items.some((item) => item.kind === 'arrow' || item.members?.some((member) => member.kind === 'arrow'))) {
    ed.say(t('Select the whole reaction, including its arrow.'));
    return;
  }
  ed.checkpoint();
  lineUpReaction(ed.doc, ed.scene, groupsAsItems(ed, items));
  ed.touched();
}

// Align reaction scheme over groups (Ctrl+G), as Align moves them as blocks: a group selected whole is one thing
// in the row (a molecule with the counter-ion drawn under it, or with a note: the note went with it; they were
// lined up on their own). Not a group with an arrow in it (a part of the scheme: its parts lined up), nor one all
// that is selected is in (a row grouped: by the groups inside it).
function groupsAsItems(ed, items) {
  const { doc } = ed;
  if (!doc.groups?.size || items.length < 2) return items;
  const whole = wholeGroups(ed);
  if (!whole.size) return items;
  const idOf = (item) => item.atomIds?.[0] ?? item.object?.id ?? item.id;
  const chains = items.map((item) => groupChain(doc, idOf(item)));
  const usable = (group) => whole.has(group) && !chains.every((chain) => chain.includes(group))
    && !items.some((item, k) => (item.kind === 'arrow' || item.members?.some((m) => m.kind === 'arrow')) && chains[k].includes(group));
  const keys = chains.map((chain, k) => chain.filter(usable).at(-1) ?? `u${k}`);
  const parts = new Map();
  items.forEach((item, k) => parts.set(keys[k], [...(parts.get(keys[k]) ?? []), item]));
  return [...parts.values()].map((members) => {
    if (members.length === 1) return members[0];
    const molecules = members.filter((m) => m.kind === 'molecule');
    return {
      kind: molecules.length ? 'molecule' : members[0].kind,
      atomIds: molecules.flatMap((m) => m.atomIds),
      members,
      box: () => unionBox(members.map((m) => m.box())),
      ...(molecules.length && { core: () => unionBox(molecules.map((m) => m.core?.() ?? m.box())) }),
      move: (dx, dy) => members.forEach((m) => m.move(dx, dy)),
    };
  });
}

// Align reaction on these items (selectedItems, itemsOf) of `doc`, `scene` drawn from it; no editor needed.
function lineUpReaction(doc, scene, items) {
  // a bracket round a reaction of its own (resonance forms with their arrow): that lined up first, the bracket
  // fitted round it as far out as before; then the bracket with all in it is one in the row
  for (const block of items.filter((item) => item.kind === 'block' && item.members.some((member) => member.kind === 'arrow'))) {
    const contents = () => unionBox(block.members.map((member) => member.box()));
    const before = contents();
    lineUpReaction(doc, scene, block.members);
    const after = contents();
    keepMargins(block.object, before, after);
  }
  if (!items.some((item) => item.kind === 'arrow')) return; // (only the bracket and its reaction selected)
  attachRiders(items, doc);
  attachLabels(items);
  const molecules = items.filter((item) => item.kind === 'molecule' && !item.rides);
  // the row: molecules (with the counts and names on their anchors), "+" and arrows; free text stays where it is
  const row = items.filter((item) => item.kind !== 'text' && !item.rides).sort((a, b) => centre(a.box())[0] - centre(b.box())[0]);
  // a molecule's width in the row: with what sits on its left and right anchors (2 NaOH)
  const span = (item) => {
    const sides = (item.labels ?? []).filter((label) => label.object.slot === 'left' || label.object.slot === 'right');
    return sides.length ? unionBox([item.box(), ...sides.map((label) => label.box())]) : item.box();
  };
  const firstArrow = row.find((item) => item.kind === 'arrow');
  const baseline = (firstArrow.object.y1 + firstArrow.object.y2) / 2;
  let cursor = span(row[0]).minX;
  for (const item of row) {
    if (item.kind === 'arrow') {
      placeArrow(item, cursor, baseline, scene);
    } else {
      // (on the line by its atoms, not by a charge, written hydrogens or lone pairs: Cl⁻ and H2O as level as Cl and O)
      const [box, outer] = [item.box(), span(item)];
      const [dx, dy] = [cursor + (box.minX - outer.minX) - box.minX, baseline - centre(item.core?.() ?? box)[1]];
      item.move(dx, dy);
      item.labels?.forEach((label) => label.move(dx, dy)); // (they follow their anchor anyway; moved too, so the span below is right)
    }
    cursor += width(span(item)) + ROW_GAP;
  }
  labelsOnOneLine(molecules);
}

// A reaction from a file that has no places for its "+" and arrow (RXN, a reaction SMILES): Indigo
// puts them between the middles of the atoms, so they run into labels (O=CH2+, NH3→), and leaves the
// reagents where the file had them. The molecules over or under an arrow are put on it (left to right
// read from the top: the first outermost above it, nearest under it), and the scheme is aligned as by
// Align reaction. `ids`: what was read; `settings`: the drawing's (label sizes and fonts, which the spacing
// goes by).
export function alignReadReaction(doc, ids, settings = DEFAULT_SETTINGS) {
  const wanted = new Set(ids);
  const arrows = [...doc.arrows.values()].filter((arrow) => wanted.has(arrow.id) && arrow.kind !== 'dipole');
  if (!arrows.length) return;
  const molecules = fragments(doc).filter((members) => members.some((id) => wanted.has(id))).map((members) => {
    const atoms = members.map((id) => doc.atoms.get(id));
    const middle = (key) => (Math.min(...atoms.map((a) => a[key])) + Math.max(...atoms.map((a) => a[key]))) / 2;
    return { atoms, x: middle('x'), y: middle('y') };
  });
  for (const arrow of arrows) {
    const [left, right, y] = [Math.min(arrow.x1, arrow.x2), Math.max(arrow.x1, arrow.x2), (arrow.y1 + arrow.y2) / 2];
    const over = molecules.filter((m) => m.x > left && m.x < right && m.atoms.every((a) => a.arrow == null)).sort((p, q) => p.x - q.x);
    const put = (list, slot, order) => list.forEach((m, k) => m.atoms.forEach((atom) => Object.assign(atom, { arrow: arrow.id, arrowSlot: slot, arrowOrder: order(k, list.length) })));
    put(over.filter((m) => m.y < y), 'above', (k, n) => n - 1 - k);
    put(over.filter((m) => m.y >= y), 'below', (k) => k);
  }
  // each arrow as long as one clicked in (2), about its middle: Align makes it as long as its reagents
  // need (Indigo's is as long as the gap between the atoms, the reagents' places in the file)
  for (const arrow of arrows) {
    const [mx, my, length] = [(arrow.x1 + arrow.x2) / 2, (arrow.y1 + arrow.y2) / 2, Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1)];
    if (length <= READ_ARROW) continue;
    const [ux, uy] = [(arrow.x2 - arrow.x1) / length, (arrow.y2 - arrow.y1) / length];
    Object.assign(arrow, { x1: mx - ux * READ_ARROW / 2, y1: my - uy * READ_ARROW / 2, x2: mx + ux * READ_ARROW / 2, y2: my + uy * READ_ARROW / 2 });
  }
  // on their arrows, as the editor puts them when it draws
  for (const { atoms, dx, dy } of buildScene(doc, settings).arrowMoves) moveObjects(doc, atoms, dx, dy);
  const scene = buildScene(doc, settings);
  const items = itemsOf(doc, scene, new Set(ids));
  if (items.some((item) => item.kind === 'arrow')) lineUpReaction(doc, scene, items);
}

// An arrow made horizontal from `left`, long enough for what is on it (that
// follows it: placed by the arrow).
function placeArrow(arrow, left, baseline, scene) {
  const a = arrow.object;
  const [oldMidX, oldMidY] = [(a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2];
  const on = ['above', 'below'].flatMap((slot) => scene.arrowStacks.get(`${a.id}|${slot}`) ?? []);
  // (one with side arcs: just as long as they need, with what stands at their ends)
  const arcs = scene.arrowNeeds?.get(a.id) ?? 0;
  const needed = Math.max(Math.max(0, ...on.map((entry) => entry.box.x2 - entry.box.x1)) + 2 * ARROW_OVERHANG, 2 * arcs);
  const length = a.sides?.length ? needed : Math.max(Math.hypot(a.x2 - a.x1, a.y2 - a.y1), needed);
  if (a.sides?.length) delete a.ownLength;
  delete a.lengthByHand; // (Align makes it as long as it needs)
  const pointsRight = a.x2 >= a.x1;
  [a.x1, a.x2] = pointsRight ? [left, left + length] : [left + length, left];
  a.y1 = baseline;
  a.y2 = baseline;
  const [dx, dy] = [left + length / 2 - oldMidX, baseline - oldMidY];
  arrow.riders.forEach((rider) => rider.move(dx, dy));
}

// --- flips and straightening ---

// Flips the selection (or everything) left-right or top-bottom about its
// middle, keeping the molecule: wedges and hashed wedges swap, so this is
// the drawing turned over (a rotation in space), not its mirror image.
// Texts aren't flipped, nor moved: they stay where they are (J: no one flips a text; it went round its start, then
// round its middle), and the middle is that of what flips. A text on a molecule's anchor or on an arrow goes where
// its place does.
export function flip(ed, horizontal) {
  const ids = (ed.selection.size ? ed.movingIds() : [...ed.doc.atoms.keys(), ...freeIds(ed.doc)]).filter((id) => !ed.doc.texts.has(id));
  if (!ids.length) {
    if (ed.selection.size) ed.say(t('Texts aren\'t flipped: select the molecules, arrows or brackets to flip.'));
    return;
  }
  const points = [];
  const each = (fn) => {
    const wanted = new Set(ids);
    for (const atom of ed.doc.atoms.values()) if (wanted.has(atom.id)) fn(atom, 'x', 'y');
    for (const item of [...ed.doc.arrows.values(), ...ed.doc.brackets.values()]) {
      if (!wanted.has(item.id)) continue;
      fn(item, 'x1', 'y1');
      fn(item, 'x2', 'y2');
    }
    for (const item of [...ed.doc.pluses.values(), ...(ed.doc.models?.values() ?? [])]) if (wanted.has(item.id)) fn(item, 'x', 'y');
  };
  each((o, kx, ky) => points.push([o[kx], o[ky]]));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const atoms = new Set(ids.filter((id) => ed.doc.atoms.has(id)));
  // a Fischer or Haworth projection has no wedges to swap: flipped, it is its mirror image (D to L), and said so
  const projection = [...atoms].some((id) => ed.doc.atoms.get(id).projection)
    || [...ed.doc.bonds.values()].some((b) => b.stereo === 'perspective' && atoms.has(b.a) && atoms.has(b.b));
  ed.change((doc) => {
    // (their orbitals mirrored with them)
    turningOrbitals(doc, atoms, () => each((o, kx, ky) => {
      if (horizontal) o[kx] = 2 * cx - o[kx];
      else o[ky] = 2 * cy - o[ky];
    }), (a) => (horizontal ? Math.PI - a : -a));
    // a 3D model turned half round in space as a molecule is (its wedges swapped: the same molecule, turned over),
    // about the page's upright for a flip left to right, about its level for one up and down; not mirrored (that
    // would show the other enantiomer)
    const half = horizontal ? [-1, 1, -1] : [1, -1, -1];
    for (const model of doc.models?.values() ?? []) {
      if (!ids.includes(model.id)) continue;
      model.rotation = (model.rotation ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]]).map((row, k) => row.map((v) => v * half[k]));
    }
    // (hydrogens and groups written on a side by a template, HO and HOH2C on the left: on the other side, OH)
    const sides = horizontal ? { left: 'right', right: 'left' } : { up: 'down', down: 'up' };
    for (const id of atoms) {
      const atom = doc.atoms.get(id);
      if (sides[atom.hSide]) atom.hSide = sides[atom.hSide];
    }
    for (const bond of doc.bonds.values()) {
      if (!atoms.has(bond.a) || !atoms.has(bond.b)) continue;
      if (bond.stereo === 'wedge') bond.stereo = 'hash';
      else if (bond.stereo === 'hash') bond.stereo = 'wedge';
      bond.side = { left: 'right', right: 'left' }[bond.side] ?? bond.side;
      if (typeof bond.z === 'number') bond.z = -bond.z; // (what was behind is in front now)
      if (bond.newman) [bond.a, bond.b] = [bond.b, bond.a]; // (a Newman projection: its back carbon now in front)
    }
    turnedInSpace(doc, atoms);
  });
  if (projection) ed.say(t('A Fischer or Haworth projection flipped is its mirror image (D becomes L): it has no wedges to swap.'), 'info', 6000);
}

// Half a turn in space (a flip, a turn over a bond): for the orbitals on `atoms` from a 3D view, what was behind
// is in front, as for the bonds (their depth z and how much the first lobe points at the viewer, dz); an atom's
// remembered perpendicular to the molecule's plane (facing, for a p orbital put on later) mirrored like the
// lobes, measured from its first neighbour. Which side of the plane a lobe is on (plane, facing.face) is the
// molecule's own and stays.
function turnedInSpace(doc, atoms) {
  for (const orbital of doc.orbitals?.values() ?? []) {
    if (!atoms.has(orbital.atom)) continue;
    if (typeof orbital.z === 'number') orbital.z = -orbital.z;
    if (typeof orbital.dz === 'number') orbital.dz = -orbital.dz;
  }
  for (const id of atoms) {
    const facing = doc.atoms.get(id)?.facing;
    if (facing) facing.angle = -facing.angle;
  }
}

// Half a turn of `ids` (atoms and whatever else moves with them) about the
// line of `bond`, as about an axle: they are mirrored across that line,
// and the wedges and hashed wedges that turn with them swap, so the
// molecule stays the same (R/S kept); a double bond's second line set by
// hand changes sides. The bond itself stays as it is.
export function turnOver(doc, bond, ids) {
  const [a, b] = [doc.atoms.get(bond.a), doc.atoms.get(bond.b)];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const [ux, uy] = [(b.x - a.x) / length, (b.y - a.y) / length];
  const across = ([x, y]) => {
    const along = (x - a.x) * ux + (y - a.y) * uy;
    return [a.x + 2 * along * ux - (x - a.x), a.y + 2 * along * uy - (y - a.y)];
  };
  // (texts stay where they are, as in a flip; brackets drawn as boxes upright round what turned)
  ids = ids.filter((id) => !doc.texts.has(id));
  const boxes = ids.map((id) => doc.brackets.get(id)).filter((br) => br && !br.atoms?.length).map((br) => [br, { x1: br.x1, y1: br.y1, x2: br.x2, y2: br.y2 }]);
  // (orbitals on what turns, the axle's two atoms too, mirrored across the bond's line)
  const axis = Math.atan2(uy, ux);
  turningOrbitals(doc, [...ids, bond.a, bond.b], () => forEachPoint(doc, ids, (object, [kx, ky]) => {
    const [dx, dy] = [object[kx] - a.x, object[ky] - a.y];
    const along = dx * ux + dy * uy;
    object[kx] = a.x + 2 * along * ux - dx;
    object[ky] = a.y + 2 * along * uy - dy;
  }), (angle) => 2 * axis - angle);
  for (const [bracket, box] of boxes) mapBracket(bracket, box, across);
  // the axle's own wedge, where its narrow end (a stereocentre) turns with the part: that centre is mirrored
  // with all its other bonds' wedges swapped, so this one swaps too, or it would be the other way round
  // (maltose turned over a glycosidic bond became cellobiose); its narrow end on the side that stays: as it was
  if (ids.includes(bond.a)) bond.stereo = { wedge: 'hash', hash: 'wedge' }[bond.stereo] ?? bond.stereo;
  // what turns, with the two atoms of the axle (they turn on the spot)
  const turning = new Set([...ids.filter((id) => doc.atoms.has(id)), bond.a, bond.b]);
  for (const other of doc.bonds.values()) {
    if (other === bond || !turning.has(other.a) || !turning.has(other.b)) continue;
    other.stereo = { wedge: 'hash', hash: 'wedge' }[other.stereo] ?? other.stereo;
    other.side = { left: 'right', right: 'left' }[other.side] ?? other.side;
    if (typeof other.z === 'number') other.z = -other.z;
    if (other.newman) [other.a, other.b] = [other.b, other.a];
  }
  turnedInSpace(doc, turning);
}

// What turns over `bond` when nothing is selected: the smaller part of the
// molecule on one side of it (atom ids), or null for a bond in a ring.
export function smallerSide(doc, bond) {
  const byAtom = bondsByAtom(doc);
  const side = (start) => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const id = stack.pop();
      for (const next of byAtom.get(id)) {
        if (next === bond) continue;
        const atom = otherEnd(next, id);
        if (!seen.has(atom)) {
          seen.add(atom);
          stack.push(atom);
        }
      }
    }
    return seen;
  };
  const [one, two] = [side(bond.a), side(bond.b)];
  if (one.has(bond.b)) return null;
  return [...(one.size <= two.size ? one : two)];
}

// Turns a bond's molecule so that the bond is horizontal or vertical,
// whichever is nearer; if it already is, a quarter turn on, so clicking
// again goes through all four. With the bond in the selection only the
// selection turns (part of a molecule: its bonds to the rest stretch);
// `whole`: the whole molecule all the same.
export function snapBond(ed, bondId, { whole = false } = {}) {
  const bond = ed.doc.bonds.get(bondId);
  if (!bond) return;
  const [a, b] = [ed.doc.atoms.get(bond.a), ed.doc.atoms.get(bond.b)];
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  let target = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  if (Math.abs(target - angle) < 1e-6) target += Math.PI / 2;
  const turn = target - angle;
  // the selection, if the bond is in it, else the whole molecule, turns about the bond's middle
  const selected = new Set(ed.selectedAtoms());
  const molecule = !whole && selected.has(bond.a) && selected.has(bond.b) ? selected : new Set([bond.a]);
  const stack = molecule === selected ? [] : [bond.a];
  while (stack.length) {
    const id = stack.pop();
    for (const other of ed.doc.bonds.values()) {
      const next = other.a === id ? other.b : other.b === id ? other.a : null;
      if (next !== null && !molecule.has(next)) {
        molecule.add(next);
        stack.push(next);
      }
    }
  }
  const [cx, cy] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  // brackets drawn as boxes round the molecule (or selected with the part) turn with it, upright round it
  const boxes = (molecule === selected ? ed.selected('brackets').map((id) => ed.doc.brackets.get(id)) : bracketsOfMolecule(ed.doc, molecule).map((id) => ed.doc.brackets.get(id)))
    .filter((br) => !br.atoms?.length);
  ed.change((doc) => {
    turningOrbitals(doc, molecule, () => {
      for (const id of molecule) {
        const atom = doc.atoms.get(id);
        const [x, y] = [atom.x - cx, atom.y - cy];
        atom.x = cx + x * cos - y * sin;
        atom.y = cy + x * sin + y * cos;
      }
    }, (angle) => angle + turn);
    for (const br of boxes) mapBracket(br, { x1: br.x1, y1: br.y1, x2: br.x2, y2: br.y2 }, ([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]);
  });
}
