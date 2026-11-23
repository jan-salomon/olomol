// The drawing tools. Each reacts to a click, or to a drag (drag, then
// dragEnd), on the canvas; `g` is the gesture: { start, point (model
// coordinates), hit (what was under the pointer at the start), shift }.
// Changes go through the editor, one undo step per gesture.
//
// Each kind of tool is a module of its own in tools/ (select, draw, rings,
// stamps, turning, electrons, orbitals, curves, arrows, colour, objects);
// this file puts them together (TOOLS) and is where the rest of the app
// finds them and the helpers they share with it.
import { RADICAL_CYCLE } from '../chem/valence.js';
import { isEndOn } from '../chem/newman.js';
import { t } from '../i18n/i18n.js';
import { fragments } from '../model/graph.js';
import { select } from './tools/select.js';
import { erase } from './tools/erase.js';
import { atom, bond, chain } from './tools/draw.js';
import { ring } from './tools/rings.js';
import { group, place } from './tools/stamps.js';
import { chairTurnTool, flipOver, ringFlipTool, snapTool } from './tools/turning.js';
import { fischerTool, zigzagTool } from './tools/fischer.js';
import { changeCharge, charge, pairs, radical, togglePartial, toggleLonePairs } from './tools/electrons.js';
import { orbitalTool } from './tools/orbitals.js';
import { curve } from './tools/curves.js';
import { plus, rxn, text } from './tools/arrows.js';
import { highlight, paint } from './tools/colour.js';
import { atomNumber, bracket, bracketAtoms } from './tools/objects.js';
export { arrowHandles, atomOfHit, putTypedText, rotationHandle, selectionBox, selectMolecule, groupBoxes, groupOfSelection, groupUnder, selectedGroup, selectGroup } from './tools/select.js';
export { placeCopy } from './tools/stamps.js';
export { editText } from './tools/arrows.js';
export { changeCharge, togglePartial, toggleLonePairs } from './tools/electrons.js';
export { addOrbitalTo } from './tools/orbitals.js';
export { describe } from './tools/curves.js';
export { fillRing, highlightObjects, paintObjects } from './tools/colour.js';
export { bracketAtoms, keepApart, keepTogether, numberAtoms, setAtomNumber } from './tools/objects.js';

export const TOOLS = { select, erase, bond, atom, chain, ring, group, place, flipOver, ringFlip: ringFlipTool, chairTurn: chairTurnTool, fischer: fischerTool, zigzag: zigzagTool, snapBond: snapTool, charge, radical, pairs, orbital: orbitalTool, curve, rxn, plus, text, atomNumber, paint, highlight, bracket };

// Sets the element of atoms (an element key over an atom, or over the selection; an element picked in the bottom
// bar or the periodic table with atoms selected), in one step.
export function setElement(ed, ids, el) {
  ed.change((doc) => [ids].flat().forEach((id) => Object.assign(doc.atoms.get(id), { el, alias: null, hCount: null, isotope: null })));
}

// An element chosen in the bottom bar or the periodic table: the selected atoms that element (part of a molecule:
// partSelected), as the panel's
// Element field makes them (and as its key over them does); its tool on.
export function pickElement(ed, el) {
  const atoms = partSelected(ed, 'atoms');
  if (atoms.length) setElement(ed, atoms, el);
  ed.setTool({ name: 'atom', el });
}

// The selected atoms or bonds (`kind`) as the panel offers their charge or order: one, or parts of molecules, not
// whole molecules (what Paste leaves selected: picking a tool then mustn't make every bond single). Else none.
export function partSelected(ed, kind) {
  const ids = ed.selected(kind);
  if (ids.length <= 1) return ids;
  const moving = new Set(ed.selectedAtoms());
  const whole = fragments(ed.doc).filter((members) => members.some((id) => moving.has(id))).every((members) => members.every((id) => ed.selection.has(id)));
  return whole ? [] : ids;
}

// A rail button pressed with part of a molecule selected (partSelected), as its key does: the charge (or δ) on the selected atoms, the next
// unpaired electrons on them, the bond on the selected bonds (a Newman projection's bond seen end on stays).
// Whether it did anything.
export function toolOnSelection(ed, tool) {
  const atoms = partSelected(ed, 'atoms');
  const bonds = partSelected(ed, 'bonds');
  if (tool.name === 'charge' && atoms.length) {
    ed.change((doc) => (tool.partial ? togglePartial(doc, atoms, tool.partial) : changeCharge(doc, atoms, tool.delta)));
    return true;
  }
  if (tool.name === 'radical' && atoms.length) {
    ed.change((doc) => atoms.forEach((id) => { doc.atoms.get(id).radical = RADICAL_CYCLE[doc.atoms.get(id).radical ?? 0]; }));
    return true;
  }
  if (tool.name === 'bond' && bonds.length) {
    const ids = bonds.filter((id) => !isEndOn(ed.doc, ed.doc.bonds.get(id)));
    if (ids.length < bonds.length) ed.say(t("A Newman projection's bond seen end on stays a single bond."));
    if (ids.length) {
      ed.change((doc) => ids.forEach((id) => {
        const b = Object.assign(doc.bonds.get(id), { order: tool.order, stereo: tool.stereo ?? '' });
        if (tool.kind) b.kind = tool.kind;
        else delete b.kind;
        delete b.delocalized;
      }));
    }
    return true;
  }
  return false;
}

// A tool chosen on the left bar or in the search bar: with atoms selected, the lone pair button also shows (or
// hides) theirs, and the bracket button puts brackets round them, as the panel's Brackets does; the charges, the
// unpaired electron and the bonds do to part of a molecule what their keys do. Then the tool is on; another bond
// keeps the element the bond tool draws (an element key chose it, or the bottom bar: N, then the double bond, a
// double bond to N).
export function pressTool(ed, tool) {
  if (tool.name === 'pairs' && ed.selectedAtoms().length && ed.tool.name !== 'pairs') toggleLonePairs(ed, ed.selectedAtoms());
  else if (tool.name === 'bracket' && ed.selectedAtoms().length) bracketAtoms(ed, ed.selectedAtoms());
  else toolOnSelection(ed, tool);
  const element = tool.name === 'bond' && !tool.kind && (ed.tool.name === 'bond' || ed.tool.name === 'atom') && ed.tool.el ? { el: ed.tool.el } : {};
  ed.setTool({ ...tool, ...element });
}

export function setBondOrder(ed, id, order) {
  ed.change((doc) => {
    const bond = Object.assign(doc.bonds.get(id), { order, stereo: '' });
    delete bond.delocalized;
    delete bond.kind; // (a plain bond, as the panel's Order makes it)
  });
}
