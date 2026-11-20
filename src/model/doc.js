// The drawing: atoms and bonds, reaction arrows, "+" signs, text, and curved
// (electron-pushing) arrows. Plain data, so a copy for undo is structuredClone.
// Coordinates are in bond lengths (a standard bond is 1 long), y pointing
// down as on screen; files with y up (molfile, KET) are flipped when read
// and written.
//
// atom:  { id, el, x, y, charge, isotope, radical, hCount, lonePairs, color, alias, highlight }
//        el: the element symbol, or '*' for a group label (R, Nu, Ph, Ar) in alias;
//        highlight: a background colour (RDKit-style marking) or null;
//        partialCharge: +1 or -1 to write δ+ or δ− (drawing only), or null;
//        hSide: 'left' | 'right' to write the hydrogens there (HO), else automatic;
//        endLabel: write CH3 at this chain end (true/false), null: as set for all;
//        letter: hydrogen 2 or 3 written as D or T (else ²H, ³H);
//        arrow, arrowSlot ('above' | 'below'), arrowSign ('+' | '−': added,
//        taken away), arrowOrder (its place in the stack there, from the
//        arrow out): the molecule is on that reaction arrow (a reagent),
//        placed by it (on all its atoms);
//        carbonLabel: write this carbon wherever it is (CH2, CH, C: true), or
//        not (false), whatever is set for all; none: as set;
//        cipLabel: true to write its R or S (from RDKit) beside it;
//        number: the atom's number shown beside it, set by hand (NMR
//        assignments), or none (null, undefined); autoNumber: true on the
//        atoms of a molecule numbered by the IUPAC rules instead (worked
//        out again after each change, src/chem/numbering.js)
//        radical: 0, or as in molfiles: 1 singlet (two electrons), 2 doublet, 3 triplet; and on, 4 (three
//        unpaired electrons), 5 (four): see RADICAL_ELECTRONS in chem/valence.js
//        (one electron), 3 triplet; hCount: null = implicit hydrogens as
//        the valence says, or a number set by hand; lonePairs: null =
//        not shown, 'auto' = as many as the atom has, or a number to show.
// bond:  { id, a, b, order (1-3), stereo ('' | 'wedge' | 'hash' | 'wavy' |
//        'perspective': drawn as a wedge, the side of a Haworth ring, no stereo),
//        side (null = automatic, or where the second line of a double bond
//        goes: 'left' | 'right' | 'center', seen from a to b), color, highlight,
//        delocalized (true: drawn as part of an aromatic ring or a group like
//        COO⁻; order still 1 or 2, the Kekulé structure), kind (undefined: a
//        bond; 'partial': forming or breaking, dashed; 'hbond': a hydrogen
//        bond, dotted; 'dative': a coordination bond, an arrow from the
//        donor a to the acceptor b; z: its depth in a drawing from a 3D view
//        (where two bonds with a depth cross, the one behind is broken);
//        cipLabel: true to write its E or Z
//        beside it; 'link': no bond, only keeps its atoms'
//        molecules together, as one (K⁺, K⁺ and SiF6²⁻ for a grid), not
//        drawn); newman: true: seen end on, a Newman projection (its front
//        atom a and back atom b on one point; see chem/newman.js) }
// arrow: { id, x1, y1, x2, y2, kind ('forward' | 'equilibrium' | 'resonance'
//        | 'retro' | 'multistep': two arrows, one over the other (in n steps) | 'dipole':
//        the crossed arrow from δ+ to δ− | 'failed': crossed in its middle, the
//        reaction doesn't go | 'same': an equals sign, the same thing drawn
//        another way), lean (an equilibrium's: 'forward' or 'back', the way it
//        lies, the other harpoon shorter; none: even), color, sides } — reaction arrows;
//        sides: its side arcs (NAD⁺ → NADH), [{ id, side: 'above' | 'below',
//        way: 'in' | 'out', reach (along the arrow) }], one each way on each
//        side (an id of their own: selected and deleted on their own); what
//        stands at an arc's free end is on the arrow in slot `${side}-${way}`;
//        ownLength: its length as drawn, while its arcs make it longer;
//        lengthByHand: true when its end was dragged (its arcs then don't
//        change its length, until one is drawn or dragged, or Align)
// plus:  { id, x, y, color }
// bracket: { id, x1, y1, x2, y2 (two corners of the box it encloses), shape
//        ('square' | 'round'), sup (text at the top right: '‡', '+', '2−'),
//        sub (at the bottom right: 'n' for a repeating unit), color, atoms
//        (made round these atoms: it keeps fitting them, see scene.js) }
// text:  { id, x, y, text, color, bold, anchor, slot, drop } — x, y: the
//        start of its first baseline; anchor: an atom of the molecule the
//        text is on, then placed by it (x, y follow) in its slot: 'below'
//        (the default: a compound number, a name), 'above', 'left' (a
//        count, 2 NaOH), 'right'; drop: further from the molecule (labels
//        of a row on one line); or arrow: a reaction arrow the text is on
//        (conditions), slot 'above' | 'below', arrowSign ('+' | '−' in front
//        of it, as of a molecule: − AlCl₃); order: its place in the stack
//        on its anchor or arrow, from the molecule or arrow out; align:
//        'left' | 'center' | 'right' for its lines, or none (see textAlign)
// curve: { id, electrons (2 | 1), from, to, color, variant } — curved arrows.
//        from: { bond } | { atom } (a lone pair) | { atom, radical: true };
//        to: { atom } | { bond } | { atom, newBond } (a new bond between
//        newBond, the atom on the electrons' side, and atom: the arrow ends
//        between them, Cl• + H–CH3 → the Cl–H bond); variant: which of the
//        good ways to draw it
//        (0 = the best; the "other way" command counts up).
// fill:  { id, atoms: [atom ids around a ring, in order], color } — a ring
//        filled with colour; it goes when the ring is broken.
// orbital: { id, atom, kind ('p' | 'hybrid' | 's'), angle, ref, size, phase,
//        color, colorOther, plane, reach } — an orbital drawn on an atom, behind the
//        bonds (render/orbitals.js). angle: the direction of its first lobe
//        (p: either lobe; hybrid: the big one), in radians, y down, measured
//        from the direction to atom `ref` (a neighbour, so the orbital turns
//        with its molecule: rotated, redrawn, turned in 3D), or from the x
//        axis when ref is null; size: 1 as drawn by default (a coefficient:
//        larger or smaller lobes); phase: 1 the first lobe shaded, -1 the
//        other; color: the shaded lobe's colour, null for grey; colorOther: the
//        other lobe's, null (or none) for white; plane: 1 or
//        −1 for a p orbital upright to the molecule's plane in a 3D view, on
//        that side of it (set again by Turn in 3D), reach: how long it looks
//        then (1: in the page, less when it points towards the viewer);
//        z, dz: in a drawing from a 3D view, its atom's depth (the larger,
//        the nearer) and how much its first lobe points at the viewer, so
//        that the lobes are painted back to front among the bonds.
// overlap: { id, a, b, color, sideA?, sideB? } — a dashed line between orbitals a and b
//        (an interaction between two molecules, which stay two molecules); sideA, sideB: the lobe of each
//        it was drawn from and to, where one was chosen (1: the lobe along the orbital's angle, −1: the one
//        opposite; so whatever its kind); without, the line joins the lobes that face each other most.
// groups: Map id → { id, members: [ids] } — things grouped (Ctrl+G) to select and move together, not objects
//        drawn: atoms (standing for their molecules), reaction arrows, "+" signs, free texts, brackets and
//        groups (editor/grouping.js)

export const KINDS = ['atoms', 'bonds', 'arrows', 'pluses', 'texts', 'curves', 'fills', 'brackets', 'orbitals', 'overlaps'];

export function emptyDoc() {
  return { atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), fills: new Map(), brackets: new Map(), orbitals: new Map(), overlaps: new Map(), groups: new Map(), nextId: 1 };
}

// A document from elsewhere (an older version, a test) with every collection there.
export function completeDoc(doc) {
  for (const kind of KINDS) doc[kind] ??= new Map();
  doc.groups ??= new Map();
  return doc;
}

export const cloneDoc = (doc) => structuredClone(doc);

// Which collection an id belongs to ('atoms', 'bonds', ...), or null.
export function kindOf(doc, id) {
  for (const kind of KINDS) if (doc[kind]?.has(id)) return kind;
  return null;
}

export function getObject(doc, id) {
  const kind = kindOf(doc, id);
  return kind ? doc[kind].get(id) : null;
}

export function addAtom(doc, x, y, el = 'C', extra = {}) {
  const atom = { id: doc.nextId++, el, x, y, charge: 0, isotope: null, radical: 0, hCount: null, lonePairs: null, color: null, alias: null, ...extra };
  doc.atoms.set(atom.id, atom);
  return atom;
}

export function addBond(doc, a, b, order = 1, extra = {}) {
  const bond = { id: doc.nextId++, a, b, order, stereo: '', side: null, color: null, ...extra };
  doc.bonds.set(bond.id, bond);
  return bond;
}

export function addArrow(doc, x1, y1, x2, y2, kind = 'forward', extra = {}) {
  const arrow = { id: doc.nextId++, x1, y1, x2, y2, kind, color: null, ...extra };
  doc.arrows.set(arrow.id, arrow);
  return arrow;
}

export function addPlus(doc, x, y, extra = {}) {
  const plus = { id: doc.nextId++, x, y, color: null, ...extra };
  doc.pluses.set(plus.id, plus);
  return plus;
}

export function addText(doc, x, y, text, extra = {}) {
  const item = { id: doc.nextId++, x, y, text, color: null, ...extra };
  doc.texts.set(item.id, item);
  return item;
}

export function addBracket(doc, x1, y1, x2, y2, extra = {}) {
  const bracket = { id: doc.nextId++, x1, y1, x2, y2, shape: 'square', sup: '', sub: '', color: null, ...extra };
  doc.brackets.set(bracket.id, bracket);
  return bracket;
}

export function addFill(doc, atoms, color) {
  const fill = { id: doc.nextId++, atoms: [...atoms], color };
  doc.fills.set(fill.id, fill);
  return fill;
}

export function addCurve(doc, from, to, electrons = 2, extra = {}) {
  const curve = { id: doc.nextId++, electrons, from, to, color: null, variant: 0, ...extra };
  doc.curves.set(curve.id, curve);
  return curve;
}

export function addOrbital(doc, atom, extra = {}) {
  const orbital = { id: doc.nextId++, atom, kind: 'p', angle: -Math.PI / 2, ref: null, size: 1, phase: 1, color: null, ...extra };
  doc.orbitals.set(orbital.id, orbital);
  return orbital;
}

export function addOverlap(doc, a, b, extra = {}) {
  const overlap = { id: doc.nextId++, a, b, color: null, ...extra };
  doc.overlaps.set(overlap.id, overlap);
  return overlap;
}

// --- orbitals' directions ---

// The neighbour an orbital's angle is measured from: the atom at the other end of its atom's first bond,
// leaving out one on the same point (a Newman projection's other carbon: no direction to measure from).
export function firstNeighbour(doc, atomId) {
  const atom = doc.atoms.get(atomId);
  let first = null;
  for (const bond of doc.bonds.values()) {
    if (bond.kind === 'link' || (bond.a !== atomId && bond.b !== atomId)) continue;
    const other = doc.atoms.get(otherEnd(bond, atomId));
    if (atom && other && Math.hypot(other.x - atom.x, other.y - atom.y) < 0.05) continue;
    if (!first || bond.id < first.id) first = bond;
  }
  return first ? otherEnd(first, atomId) : null;
}

// The orbital's direction on the page (radians, y down).
export function orbitalAngle(doc, orbital) {
  const [atom, ref] = [doc.atoms.get(orbital.atom), orbital.ref == null ? null : doc.atoms.get(orbital.ref)];
  return ref && atom ? orbital.angle + Math.atan2(ref.y - atom.y, ref.x - atom.x) : orbital.angle;
}

// Points the orbital along `angle` on the page, measured from its atom's first neighbour (or the x axis).
export function setOrbitalAngle(doc, orbital, angle) {
  const ref = firstNeighbour(doc, orbital.atom);
  const [atom, other] = [doc.atoms.get(orbital.atom), ref === null ? null : doc.atoms.get(ref)];
  orbital.ref = other ? ref : null;
  orbital.angle = normalAngle(other ? angle - Math.atan2(other.y - atom.y, other.x - atom.x) : angle);
}

const normalAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Runs `move` (which moves the atoms `atomIds`, all or some), keeping the orbitals on those atoms pointing
// as `turn(angle)` says (a rotation: angle + θ; a mirror image: 2φ − angle): they are measured from a
// neighbour, which may not move with them, or have turned the other way round.
export function turningOrbitals(doc, atomIds, move, turn) {
  const atoms = new Set(atomIds);
  const before = [...(doc.orbitals?.values() ?? [])].filter((o) => atoms.has(o.atom)).map((o) => [o, orbitalAngle(doc, o)]);
  const result = move();
  for (const [orbital, angle] of before) setOrbitalAngle(doc, orbital, turn(angle));
  return result;
}

// The bond between atoms a and b, or undefined.
export function bondBetween(doc, a, b) {
  for (const bond of doc.bonds.values()) {
    if ((bond.a === a && bond.b === b) || (bond.a === b && bond.b === a)) return bond;
  }
  return undefined;
}

// For each atom id, its bonds: Map id -> [bond]. `links`: with the links
// that keep molecules together (they make one molecule of them).
export function bondsByAtom(doc, { links = true } = {}) {
  const map = new Map([...doc.atoms.keys()].map((id) => [id, []]));
  for (const bond of doc.bonds.values()) {
    if (!links && bond.kind === 'link') continue;
    map.get(bond.a)?.push(bond);
    map.get(bond.b)?.push(bond);
  }
  return map;
}

export const otherEnd = (bond, id) => (bond.a === id ? bond.b : bond.a);

// Partial, hydrogen and dative bonds are drawn but are no covalent bonds:
// no valence, and molfiles leave them out.
export const isCovalent = (bond) => !bond.kind;

// Takes a side arc off its arrow; what stood at its free end stays where it
// is, free (as when an arrow goes).
export function removeArc(doc, arrow, arc) {
  arrow.sides = (arrow.sides ?? []).filter((e) => e !== arc);
  const slot = `${arc.side}-${arc.way}`;
  for (const object of [...doc.texts.values(), ...doc.atoms.values()]) {
    if (object.arrow !== arrow.id || (object.slot !== slot && object.arrowSlot !== slot)) continue;
    for (const key of ['arrow', 'arrowSlot', 'arrowSign', 'arrowOrder', ...(doc.texts.get(object.id) === object ? ['slot', 'order'] : [])]) delete object[key];
  }
}

const OTHER_SIDE = { above: 'below', below: 'above' };

// Everything on `arrow` in slot `from` moved to slot `to`, in its order
// (texts: slot; molecules: arrowSlot on their atoms, none meaning above).
function moveStack(doc, arrowId, from, to) {
  for (const text of doc.texts.values()) if (text.arrow === arrowId && (text.slot ?? 'above') === from) text.slot = to;
  for (const atom of doc.atoms.values()) if (atom.arrow === arrowId && (atom.arrowSlot ?? 'above') === from) atom.arrowSlot = to;
}

// A side arc moved to the other side of its arrow, what stands at its end
// with it; an arc going the same way there changes places with it.
export function arcToOtherSide(doc, arrow, arc) {
  const to = OTHER_SIDE[arc.side];
  const there = (arrow.sides ?? []).find((e) => e.side === to && e.way === arc.way);
  const [here, away] = [`${arc.side}-${arc.way}`, `${to}-${arc.way}`];
  moveStack(doc, arrow.id, here, '~');
  moveStack(doc, arrow.id, away, here);
  moveStack(doc, arrow.id, '~', away);
  if (there) there.side = arc.side;
  arc.side = to;
}

// A reaction arrow turned over top to bottom: its side arcs and all that is
// stacked on it on the other side, each stack in its order.
export function flipArrowSides(doc, arrow) {
  for (const arc of arrow.sides ?? []) arc.side = OTHER_SIDE[arc.side];
  const other = (slot) => slot.replace(/^(above|below)/, (side) => OTHER_SIDE[side]);
  for (const text of doc.texts.values()) if (text.arrow === arrow.id) text.slot = other(text.slot ?? 'above');
  for (const atom of doc.atoms.values()) if (atom.arrow === arrow.id) atom.arrowSlot = other(atom.arrowSlot ?? 'above');
}

// A reaction arrow pointing the other way (its arcs and stacks stay on their sides).
export function reverseArrow(arrow) {
  [arrow.x1, arrow.y1, arrow.x2, arrow.y2] = [arrow.x2, arrow.y2, arrow.x1, arrow.y1];
}

// The atoms brackets made round atoms (bracket.atoms) enclose now: those of
// them still there, and atoms added after the brackets that are bonded on
// to them (drawn onto a bracketed molecule; an older molecule bonded on
// later stays outside).
export function bracketMembers(doc, bracket) {
  const members = new Set((bracket.atoms ?? []).filter((id) => doc.atoms.has(id)));
  const queue = [...members];
  const neighbours = new Map();
  for (const b of doc.bonds.values()) {
    if (b.kind === 'link') continue;
    for (const [p, q] of [[b.a, b.b], [b.b, b.a]]) {
      if (!neighbours.has(p)) neighbours.set(p, []);
      neighbours.get(p).push(q);
    }
  }
  while (queue.length) {
    for (const n of neighbours.get(queue.shift()) ?? []) {
      if (members.has(n) || n < bracket.id) continue;
      members.add(n);
      queue.push(n);
    }
  }
  return [...members];
}

// Brackets that mark a repeating unit (a polymer's, -[CH2CH2]n-) as files hold one: a letter below (n, m, x),
// nothing above, two bonds leaving it (head and tail; other programs refuse any other). [{ bracket, atoms }]: the
// atoms in each (made round atoms: those; drawn as a box: those inside it).
export function repeatingUnits(doc) {
  return [...doc.brackets.values()].filter((b) => /^[a-z]$/i.test(b.sub ?? '') && !b.sup).map((bracket) => {
    const [x1, x2, y1, y2] = [Math.min(bracket.x1, bracket.x2), Math.max(bracket.x1, bracket.x2), Math.min(bracket.y1, bracket.y2), Math.max(bracket.y1, bracket.y2)];
    // (bracket.unitAtoms: its atoms as worked out before its labels were drawn out for a file: files.js)
    const atoms = bracket.unitAtoms?.filter((id) => doc.atoms.has(id)) ?? (bracket.atoms?.length ? bracketMembers(doc, bracket)
      : [...doc.atoms.values()].filter((a) => a.x > x1 && a.x < x2 && a.y > y1 && a.y < y2).map((a) => a.id));
    return { bracket, atoms };
  }).filter(({ atoms }) => {
    const inside = new Set(atoms);
    return atoms.length && [...doc.bonds.values()].filter((b) => isCovalent(b) && inside.has(b.a) !== inside.has(b.b)).length === 2;
  });
}

// A repeating unit read from a file (its atoms, its letter): brackets made round its atoms, a box the editor
// fits to them as drawn (bracketFits), crossing the bonds that leave it
export function addRepeatingUnit(doc, atomIds, sub = 'n') {
  const atoms = atomIds.map((id) => doc.atoms.get(id)).filter(Boolean);
  if (!atoms.length) return null;
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  const room = 0.5;
  return addBracket(doc, Math.min(...xs) - room, Math.min(...ys) - room, Math.max(...xs) + room, Math.max(...ys) + room,
    { sub: /^[a-z]$/i.test(sub) ? sub : 'n', atoms: atoms.map((a) => a.id) });
}

// Deletes atoms, bonds and other objects by id, with everything that hangs
// on them: an atom's bonds, ring fills of rings that are broken now, and
// curved arrows from or to anything deleted.
export function deleteObjects(doc, ids) {
  const gone = new Set(ids);
  // a side arc of a reaction arrow: only it; what stood at its end stays where it is, free
  for (const arrow of doc.arrows.values()) {
    for (const arc of (arrow.sides ?? []).filter((e) => gone.has(e.id))) removeArc(doc, arrow, arc);
  }
  for (const bond of doc.bonds.values()) if (gone.has(bond.a) || gone.has(bond.b)) gone.add(bond.id);
  // a text anchored to an atom that goes: to the nearest atom of its molecule that stays
  for (const text of doc.texts.values()) {
    if (!gone.has(text.anchor)) continue;
    const seen = new Set([text.anchor]);
    let next = null;
    for (let queue = [text.anchor]; queue.length && next === null;) {
      const id = queue.shift();
      for (const bond of doc.bonds.values()) {
        const other = bond.a === id ? bond.b : bond.b === id ? bond.a : null;
        if (other === null || seen.has(other)) continue;
        if (!gone.has(other)) {
          next = other;
          break;
        }
        seen.add(other);
        queue.push(other);
      }
    }
    if (next !== null) text.anchor = next;
    else gone.add(text.id); // its whole molecule goes: the text with it
  }
  // what was on an arrow that goes stays where it is, free
  for (const object of [...doc.texts.values(), ...doc.atoms.values()]) {
    if (object.arrow == null || !gone.has(object.arrow)) continue;
    for (const key of ['arrow', 'arrowSlot', 'arrowSign', 'arrowOrder', ...(doc.texts.get(object.id) === object ? ['slot', 'order'] : [])]) delete object[key];
  }
  // brackets made round atoms: round those of them that stay (also atoms drawn on later), gone when none does
  for (const bracket of doc.brackets.values()) {
    if (!bracket.atoms?.length || gone.has(bracket.id)) continue;
    const staying = bracketMembers(doc, bracket).filter((id) => !gone.has(id));
    if (staying.length) bracket.atoms = staying;
    else gone.add(bracket.id);
  }
  // an orbital goes with its atom; one measured from an atom that goes keeps its direction on the page
  for (const orbital of doc.orbitals?.values() ?? []) {
    if (gone.has(orbital.atom)) gone.add(orbital.id);
    else if (gone.has(orbital.ref)) Object.assign(orbital, { angle: orbitalAngle(doc, orbital), ref: null });
  }
  for (const overlap of doc.overlaps?.values() ?? []) if (gone.has(overlap.a) || gone.has(overlap.b)) gone.add(overlap.id);
  for (const id of gone) for (const kind of KINDS) doc[kind]?.delete(id);
  pruneFills(doc);
  dropLooseCurves(doc);
}

// Are a curved arrow's ends (atoms, bonds, orbitals, a new bond's atom) all in the drawing?
export function curveEndsThere(doc, curve) {
  const ends = [curve.from.atom, curve.from.bond, curve.from.orbital, curve.to.atom, curve.to.bond, curve.to.orbital, curve.to.newBond].filter((x) => x !== undefined);
  return ends.every((id) => doc.atoms.has(id) || doc.bonds.has(id) || doc.orbitals?.has(id));
}

// Curved arrows whose start or end has gone, gone too.
export function dropLooseCurves(doc) {
  for (const curve of [...doc.curves.values()]) if (!curveEndsThere(doc, curve)) doc.curves.delete(curve.id);
}

// The brackets that are this molecule's (`atoms`: a Set of its atom ids): round it and nothing else, no other
// molecule, arrow or + (a bracket round resonance forms and their arrow is no one form's: a double click on one
// form took it, so a drag moved it off the other one, Delete deleted it).
export function bracketsOfMolecule(doc, atoms) {
  return [...doc.brackets.values()].filter((b) => {
    if (b.atoms?.length) return b.atoms.some((id) => atoms.has(id)) && b.atoms.every((id) => atoms.has(id) || !doc.atoms.has(id));
    const inside = ([x, y]) => x > Math.min(b.x1, b.x2) && x < Math.max(b.x1, b.x2) && y > Math.min(b.y1, b.y2) && y < Math.max(b.y1, b.y2);
    const others = [
      ...[...doc.atoms.values()].filter((a) => !atoms.has(a.id)).map((a) => [a.x, a.y]),
      ...[...doc.arrows.values()].filter((a) => a.kind !== 'dipole').map((a) => [(a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2]),
      ...[...doc.pluses.values()].map((p) => [p.x, p.y]),
    ];
    return [...atoms].some((id) => inside([doc.atoms.get(id).x, doc.atoms.get(id).y])) && !others.some(inside);
  }).map((b) => b.id);
}

// A bracket drawn as a box, turned or mirrored with what is in it (`map`: a point to where it goes; `box`: where
// its corners were): still upright, round where its four corners went (a square one turned by 45° had its two
// corners turned, a flat line between them).
export function mapBracket(bracket, { x1, y1, x2, y2 }, map) {
  const corners = [[x1, y1], [x2, y1], [x1, y2], [x2, y2]].map(map);
  const [xs, ys] = [corners.map((c) => c[0]), corners.map((c) => c[1])];
  Object.assign(bracket, { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) });
}

// A bracket drawn as a box round something that changed shape (Redraw, Align inside it): as far out from it on
// each side as before. `before`, `after`: its contents' box ({ minX, minY, maxX, maxY }).
export function keepMargins(bracket, before, after) {
  const [left, top] = [bracket.x1 <= bracket.x2 ? 'x1' : 'x2', bracket.y1 <= bracket.y2 ? 'y1' : 'y2'];
  const [right, bottom] = [left === 'x1' ? 'x2' : 'x1', top === 'y1' ? 'y2' : 'y1'];
  bracket[left] += after.minX - before.minX;
  bracket[right] += after.maxX - before.maxX;
  bracket[top] += after.minY - before.minY;
  bracket[bottom] += after.maxY - before.maxY;
}

// A text turned or mirrored with what is around it: its middle goes where `map` puts it, the text stays upright
// about it (turned by its start, it came out a text's width off). `at`: its start then, `box`: its box then.
export function mapText(text, [x, y], box, map) {
  const middle = [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2];
  const [mx, my] = map(middle);
  [text.x, text.y] = [mx + x - middle[0], my + y - middle[1]];
}

// Is the ring of a fill still there (its atoms, each bonded to the next)?
export function ringIntact(doc, fill, byAtom = null) {
  return fill.atoms.every((id, k) => {
    const next = fill.atoms[(k + 1) % fill.atoms.length];
    if (!doc.atoms.has(id)) return false;
    return byAtom ? byAtom.get(id).some((bond) => otherEnd(bond, id) === next) : Boolean(bondBetween(doc, id, next));
  });
}

// Ring fills of broken rings go (an atom or a ring bond deleted).
export function pruneFills(doc) {
  if (!doc.fills.size) return;
  for (const fill of [...doc.fills.values()]) if (!ringIntact(doc, fill)) doc.fills.delete(fill.id);
}

// Copies the objects with these ids (atoms with the bonds between them,
// curved arrows whose ends are all copied) into `target` (default: doc
// itself), shifted by dx, dy. Returns the new ids.
export function copyObjects(doc, ids, dx = 0, dy = 0, target = doc) {
  const wanted = new Set(ids);
  const map = new Map();
  const fresh = (object) => {
    const copy = { ...structuredClone(object), id: target.nextId++ };
    map.set(object.id, copy.id);
    return copy;
  };
  for (const atom of doc.atoms.values()) {
    if (!wanted.has(atom.id)) continue;
    const copy = fresh(atom);
    Object.assign(copy, { x: atom.x + dx, y: atom.y + dy });
    target.atoms.set(copy.id, copy);
  }
  for (const bond of doc.bonds.values()) {
    if (!map.has(bond.a) || !map.has(bond.b)) continue;
    const copy = fresh(bond);
    Object.assign(copy, { a: map.get(bond.a), b: map.get(bond.b) });
    target.bonds.set(copy.id, copy);
  }
  for (const kind of ['arrows', 'brackets']) {
    for (const item of doc[kind].values()) {
      if (!wanted.has(item.id)) continue;
      const copy = fresh(item);
      Object.assign(copy, { x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy });
      if (copy.sides) copy.sides = copy.sides.map((arc) => ({ ...arc, id: target.nextId++ })); // (side arcs: ids of their own)
      target[kind].set(copy.id, copy);
    }
  }
  for (const kind of ['pluses', 'texts']) {
    for (const item of doc[kind].values()) {
      // (text on a copied molecule's anchor or on a copied arrow goes along)
      if (!wanted.has(item.id) && !(kind === 'texts' && (map.has(item.anchor) || (item.arrow != null && wanted.has(item.arrow))))) continue;
      const copy = fresh(item);
      Object.assign(copy, { x: item.x + dx, y: item.y + dy });
      if (copy.anchor !== undefined) copy.anchor = map.get(copy.anchor); // on the copied molecule (or free, if it isn't copied)
      target[kind].set(copy.id, copy);
    }
  }
  // a copied bracket made round atoms: round their copies (a plain box if none of them are copied); all it was
  // round, the atoms drawn on later too (they count by their ids being after the bracket's, which the copies' aren't)
  for (const [from, id] of map) {
    const bracket = target.brackets.get(id);
    if (!bracket?.atoms) continue;
    const members = doc.brackets.has(from) ? [...bracketMembers(doc, doc.brackets.get(from))] : bracket.atoms;
    const copied = members.filter((a) => map.has(a)).map((a) => map.get(a));
    if (copied.length) bracket.atoms = copied;
    else delete bracket.atoms;
  }
  // on a copied arrow: on the copy; else free
  for (const id of map.values()) {
    const object = target.atoms.get(id) ?? target.texts.get(id);
    if (object?.arrow == null) continue;
    if (map.has(object.arrow) && target.arrows.has(map.get(object.arrow))) object.arrow = map.get(object.arrow);
    else for (const key of ['arrow', 'arrowSlot', 'arrowSign', 'arrowOrder', ...(target.texts.get(id) === object ? ['slot', 'order'] : [])]) delete object[key];
  }
  // the orbitals on copied atoms (measured from an atom not copied: from the page instead), the
  // overlaps between copied orbitals
  for (const orbital of doc.orbitals?.values() ?? []) {
    if (!map.has(orbital.atom)) continue;
    const copy = fresh(orbital);
    copy.atom = map.get(orbital.atom);
    if (orbital.ref != null) Object.assign(copy, map.has(orbital.ref) ? { ref: map.get(orbital.ref) } : { ref: null, angle: orbitalAngle(doc, orbital) });
    (target.orbitals ??= new Map()).set(copy.id, copy);
  }
  for (const overlap of doc.overlaps?.values() ?? []) {
    if (!map.has(overlap.a) || !map.has(overlap.b)) continue;
    const copy = fresh(overlap);
    Object.assign(copy, { a: map.get(overlap.a), b: map.get(overlap.b) });
    (target.overlaps ??= new Map()).set(copy.id, copy);
  }
  const mapEnd = (end) => {
    const out = { ...end };
    for (const key of ['atom', 'bond', 'orbital', 'newBond']) {
      if (end[key] === undefined) continue;
      if (!map.has(end[key])) return null;
      out[key] = map.get(end[key]);
    }
    return out;
  };
  for (const curve of doc.curves.values()) {
    const [from, to] = [mapEnd(curve.from), mapEnd(curve.to)];
    if (!from || !to) continue;
    const copy = fresh(curve);
    Object.assign(copy, { from, to });
    // (a copy finds its own way where it is: not the curve the one copied was read as; the curve it was drawn as
    // moved along, until it is drawn)
    delete copy.hint;
    if (copy.drawn) copy.drawn = { points: copy.drawn.points.map(([x, y]) => [x + dx, y + dy]), tip: [copy.drawn.tip[0] + dx, copy.drawn.tip[1] + dy] };
    target.curves.set(copy.id, copy);
  }
  for (const fill of doc.fills.values()) {
    if (!fill.atoms.every((id) => map.has(id))) continue;
    const copy = fresh(fill);
    copy.atoms = fill.atoms.map((id) => map.get(id));
    target.fills.set(copy.id, copy);
  }
  // groups all of whose things are copied, as groups of the copies (those inside first)
  const copiedGroups = new Map();
  for (let more = true; more;) {
    more = false;
    for (const group of doc.groups?.values() ?? []) {
      if (copiedGroups.has(group.id)) continue;
      if (!group.members.every((id) => map.has(id) || copiedGroups.has(id))) continue;
      // (with its name, and what a newer olomol gave it)
      const copy = { ...structuredClone(group), id: target.nextId++, members: group.members.map((id) => map.get(id) ?? copiedGroups.get(id)) };
      (target.groups ??= new Map()).set(copy.id, copy);
      copiedGroups.set(group.id, copy.id);
      more = true;
    }
  }
  return [...map.values()];
}

// Everything movable as points: calls fn(object, key) for each x/y pair.
// Used to move, rotate and flip a set of objects.
export function forEachPoint(doc, ids, fn) {
  const wanted = new Set(ids);
  for (const atom of doc.atoms.values()) if (wanted.has(atom.id)) fn(atom, ['x', 'y']);
  for (const kind of ['arrows', 'brackets']) {
    for (const item of doc[kind].values()) {
      if (!wanted.has(item.id)) continue;
      fn(item, ['x1', 'y1']);
      fn(item, ['x2', 'y2']);
    }
  }
  for (const kind of ['pluses', 'texts']) for (const item of doc[kind].values()) if (wanted.has(item.id)) fn(item, ['x', 'y']);
}

// The movable objects that aren't atoms or bonds: arrows, "+", text, brackets.
export const freeIds = (doc) => [...doc.arrows.keys(), ...doc.pluses.keys(), ...doc.texts.keys(), ...doc.brackets.keys()];

export function moveObjects(doc, ids, dx, dy) {
  forEachPoint(doc, ids, (object, [kx, ky]) => {
    object[kx] += dx;
    object[ky] += dy;
  });
}

// Is anything drawn at all?
export const isEmpty = (doc) => KINDS.every((kind) => !doc[kind]?.size);
