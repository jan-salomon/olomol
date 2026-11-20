// Drawing out abbreviations (a Ph label becomes a benzene ring), given the
// groups' drawings; abbreviate.js loads those with RDKit.
import { abbreviationOf, chargedAbbreviation } from '../chem/abbreviations.js';
import { addAtom, addBond, bondsByAtom, deleteObjects, otherEnd } from '../model/doc.js';
import { attachGroup, joinAtom } from './build.js';
import { gridTurn } from '../layout/geometry.js';

// The key of a group's drawing in the drawings given to drawOutWith: its label, and its charge for a charged
// group of its own (SO3⁻), " alone" for a molecule written as one label.
export const groupKey = (alias, charge = 0, alone = false) => `${alias}${chargedAbbreviation(alias, charge) ? ` ${charge}` : ''}${alone ? ' alone' : ''}`;

// The abbreviation atoms among `ids` that can be drawn out: on one bond, single or double (PPh3 on the O
// of Ph3P=O), or on none (a molecule written as one label, PPh3). On a coordination arrow too (PPh3 on a
// metal, drawn out with the arrow from its P: files, Info and Draw out get its atoms), unless `dative` is
// false (0.3's 3D models of complexes took such a label as a stand-in; 0.4's build them drawn out).
export function expandable(doc, ids, byAtom = bondsByAtom(doc), { dative = true } = {}) {
  return ids.filter((id) => {
    const atom = doc.atoms.get(id);
    // (links of One compound, hydrogen and partial bonds don't count: CO2⁻ kept together with Na⁺ draws out)
    const bonds = (byAtom.get(id) ?? []).filter((b) => !['link', 'hbond', 'partial'].includes(b.kind));
    return atom && abbreviationOf(atom) && (!bonds.length || (bonds.length === 1 && bonds[0].order <= 2 && (!bonds[0].kind || (dative && bonds[0].kind === 'dative'))));
  });
}

// A molecule written as one label, drawn out where the label was (`molecule`: its drawing, the atom the
// groups are on first), that atom on the label's place. Returns the new ids, that atom first.
function drawOutAlone(doc, atom, molecule) {
  const [centre] = molecule.atoms.values();
  const ids = new Map();
  for (const { id, x, y, ...props } of molecule.atoms.values()) {
    ids.set(id, addAtom(doc, atom.x + x - centre.x, atom.y + y - centre.y, props.el, props).id);
  }
  const bonds = [];
  for (const bond of molecule.bonds.values()) {
    if (ids.has(bond.a) && ids.has(bond.b)) bonds.push(addBond(doc, ids.get(bond.a), ids.get(bond.b), bond.order, { stereo: bond.stereo }).id);
  }
  return [...ids.values(), ...bonds];
}

// A group just drawn out, its bonds turned onto the 30° grid: RDKit draws a CHO's C=O, an OMe's O–C or an Et's
// C–C at about 122° to the bond before, so drawn out they lay 2° off. Atom by atom from its first one (`first`,
// on the bond `joined` to the molecule, which lies as the label's did), what lies beyond each atom is turned
// about it by the small turn that puts those bonds on the grid (nBu's chain bond by bond, Ts's ring about its C).
// Only up to 6°, so that the angles stay near 120° (Fmoc's rings, 12° off, stay as they are).
const GRID_TURN = 6;
function onGrid(doc, first, joined, atoms, bonds) {
  const inside = new Set(atoms.filter((id) => doc.atoms.has(id)));
  const own = bonds.map((id) => doc.bonds.get(id)).filter((b) => b && b !== joined && inside.has(b.a) && inside.has(b.b));
  const near = (id) => own.filter((b) => b.a === id || b.b === id).map((b) => otherEnd(b, id));
  // the atoms in order outwards from the first, each with the one it was reached from
  const parent = new Map([[first, null]]);
  const order = [first];
  for (let i = 0; i < order.length; i++) for (const next of near(order[i])) if (!parent.has(next)) { parent.set(next, order[i]); order.push(next); }
  for (const pivot of order) {
    // what lies beyond the pivot: reached from it without going back the way it came (none if a ring leads back)
    const beyond = new Set();
    const todo = near(pivot).filter((id) => id !== parent.get(pivot));
    while (todo.length) {
      const id = todo.pop();
      if (id === pivot || beyond.has(id)) continue;
      beyond.add(id);
      todo.push(...near(id));
    }
    if (!beyond.size || [...beyond].some((id) => id === parent.get(pivot) || id === first)) continue;
    const ids = [pivot, ...beyond];
    const index = new Map(ids.map((id, k) => [id, k]));
    const pairs = own.filter((b) => index.has(b.a) && index.has(b.b)).map((b) => [index.get(b.a), index.get(b.b)]);
    const turn = gridTurn(ids.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]), pairs);
    if (!turn || Math.abs(turn) > GRID_TURN) continue;
    const { x: cx, y: cy } = doc.atoms.get(pivot);
    const t = (turn * Math.PI) / 180;
    const [c, s] = [Math.cos(t), Math.sin(t)];
    for (const id of beyond) {
      const atom = doc.atoms.get(id);
      [atom.x, atom.y] = [cx + c * (atom.x - cx) - s * (atom.y - cy), cy + s * (atom.x - cx) + c * (atom.y - cy)];
    }
  }
}

// Draws out these abbreviation atoms in `doc`, each where its label was;
// `groups`: name -> the group's drawing (its * atom attaches). A wedge from
// the atom it hangs on (a stereocentre) stays on the bond to the group.
// Returns the ids of the new atoms and bonds.
export function drawOutWith(doc, ids, groups) {
  const made = [];
  for (const id of expandable(doc, ids)) {
    const atom = doc.atoms.get(id);
    // (the bond it hangs on; One compound's links and hydrogen bonds go with it to its atom, joinAtom)
    const link = bondsByAtom(doc).get(id).find((b) => !['link', 'hbond', 'partial'].includes(b.kind));
    if (!link) {
      const { alias, color, charge, highlight } = atom;
      const added = drawOutAlone(doc, atom, groups.get(groupKey(alias, charge, true)));
      // what was on the label is on the molecule drawn out: its place on a reaction arrow (all of it), and on the
      // atom on the label's place the texts on its anchors, curved arrows, orbitals, brackets made round it
      for (const n of added) {
        if (!doc.atoms.has(n)) continue;
        for (const key of ['arrow', 'arrowSlot', 'arrowOrder', 'arrowSign']) if (atom[key] !== undefined) doc.atoms.get(n)[key] = atom[key];
      }
      joinAtom(doc, id, added[0]);
      for (const n of added) if (doc.atoms.has(n) && color) doc.atoms.get(n).color = color;
      // the label's highlight on all of the group, its atoms and bonds
      for (const n of added) if (highlight) (doc.atoms.get(n) ?? doc.bonds.get(n)).highlight = highlight;
      if (charge && !chargedAbbreviation(alias, charge)) doc.atoms.get(added[0]).charge = charge; // (NEt4⁺: on its N)
      made.push(...added);
      continue;
    }
    const anchor = otherEnd(link, id);
    const stereo = link.a === anchor ? link.stereo : ''; // (its narrow end at the anchor)
    const a = doc.atoms.get(anchor);
    const angle = Math.atan2(atom.y - a.y, atom.x - a.x);
    const { alias, color, charge, highlight } = atom;
    const before = new Set(doc.bonds.keys());
    const added = attachGroup(doc, anchor, groups.get(groupKey(alias, charge)), { angle });
    for (const n of added) if (color) doc.atoms.get(n).color = color;
    const fresh = [...doc.bonds.keys()].filter((b) => !before.has(b));
    // the label's charge on the group's atom on the bond (NMe3⁺), the bond as it was (Ph3P=O, its colour
    // and highlight)
    const joined = fresh.map((b) => doc.bonds.get(b)).find((b) => b.a === anchor || b.b === anchor);
    // what was on the label is on the group's atom on the bond, what was on its bond on the bond (curved arrows,
    // texts on its anchor, orbitals, groups: joinAtom); then the label goes
    if (joined) joinAtom(doc, id, otherEnd(joined, anchor));
    if (doc.atoms.has(id)) deleteObjects(doc, [id]);
    // the label's highlight on all of the group: its atoms and the bonds among them
    if (highlight) for (const n of [...added, ...fresh]) if (doc.bonds.get(n) !== joined) (doc.atoms.get(n) ?? doc.bonds.get(n)).highlight = highlight;
    // (a charged group of its own, SO3⁻, has its charge where its drawing has it already)
    if (joined && charge && !chargedAbbreviation(alias, charge)) doc.atoms.get(otherEnd(joined, anchor)).charge = charge;
    if (joined) Object.assign(joined, { order: link.order, color: link.color ?? null }, link.highlight ? { highlight: link.highlight } : {});
    if (joined) onGrid(doc, otherEnd(joined, anchor), joined, added, fresh);
    // a coordination arrow stays one, from the group's atom to what it was on (its wedge with it)
    if (joined && link.kind === 'dative') {
      const donor = otherEnd(joined, anchor);
      const fromLabel = link.a === id;
      Object.assign(joined, { kind: 'dative', stereo: link.stereo ?? '', a: fromLabel ? donor : anchor, b: fromLabel ? anchor : donor });
    } else if (stereo) {
      const bond = fresh.map((b) => doc.bonds.get(b)).find((b) => b.a === anchor || b.b === anchor);
      if (bond) Object.assign(bond, { stereo, a: anchor, b: otherEnd(bond, anchor) });
    }
    made.push(...added, ...fresh);
  }
  return made;
}
