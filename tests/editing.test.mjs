// Editing rules that one feature must keep for another: atoms joined by a drop keep what refers to them (curved
// arrows, orbitals, brackets), copies keep a bracket's members, drawn H with an arrow on their bond stay,
// brackets turned with what is in them stay upright round it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinAtom, mergeLanded } from '../src/editor/build.js';
import { hydrogenAction } from '../src/editor/hydrogens.js';
import {
  addAtom, addBond, addBracket, addCurve, addOrbital, bondBetween, bracketMembers, bracketsOfMolecule, copyObjects, curveEndsThere,
  emptyDoc, keepMargins, mapBracket, mapText,
} from '../src/model/doc.js';
import { buildScene } from '../src/render/scene.js';

// X–Y, and Z bonded to X: Z dropped onto Y doubles X–Y, so its bond to X goes
function triangle() {
  const doc = emptyDoc();
  const [x, y, z, w] = [addAtom(doc, 0, 0), addAtom(doc, 1, 0), addAtom(doc, 1, 1), addAtom(doc, 3, 0, 'Cl')];
  addBond(doc, x.id, y.id, 1);
  const xz = addBond(doc, x.id, z.id, 1);
  return { doc, x, y, z, w, xz };
}

test('an atom joined into another: an arrow from its bond that went is on the bond there now; one to a new bond to it, to the other atom', () => {
  const { doc, x, y, z, w, xz } = triangle();
  const fromBond = addCurve(doc, { bond: xz.id }, { atom: w.id });
  const toNew = addCurve(doc, { atom: w.id }, { atom: x.id, newBond: z.id }, 1);
  const orbital = addOrbital(doc, z.id, { ref: x.id });
  const bracket = addBracket(doc, -1, -1, 2, 2, { atoms: [z.id] });
  joinAtom(doc, z.id, y.id);
  assert.equal(doc.curves.get(fromBond.id).from.bond, bondBetween(doc, x.id, y.id).id);
  assert.equal(doc.curves.get(toNew.id).to.newBond, y.id);
  assert.equal(doc.orbitals.get(orbital.id).atom, y.id);
  assert.deepEqual(doc.brackets.get(bracket.id).atoms, [y.id]);
  assert.ok([...doc.curves.values()].every((curve) => curveEndsThere(doc, curve)));
  assert.doesNotThrow(() => buildScene(doc));
});

test('a join undone (a drag that moves on) leaves the drawing as it was', () => {
  const { doc, y, z, xz, w } = triangle();
  addCurve(doc, { bond: xz.id }, { atom: w.id });
  addCurve(doc, { atom: w.id }, { atom: y.id, newBond: z.id }, 1);
  addOrbital(doc, z.id);
  const before = structuredClone(doc);
  joinAtom(doc, z.id, y.id)();
  assert.deepEqual(doc, before);
});

test('atoms dropped onto each other: an arrow on the bond between them goes with it, not drawn from nothing', () => {
  const doc = emptyDoc();
  const [a, b, c] = [addAtom(doc, 0, 0), addAtom(doc, 1, 0), addAtom(doc, 3, 0, 'O')];
  const ab = addBond(doc, a.id, b.id, 1);
  addCurve(doc, { bond: ab.id }, { atom: c.id });
  b.x = 0.05; // (b dropped onto a)
  assert.equal(mergeLanded(doc, [b.id]), 1);
  assert.equal(doc.curves.size, 0);
  assert.doesNotThrow(() => buildScene(doc));
});

test('a curved arrow whose end has gone is left out of the drawing, not drawn from nothing', () => {
  const doc = emptyDoc();
  const [a, b, c] = [addAtom(doc, 0, 0), addAtom(doc, 1, 0), addAtom(doc, 3, 0, 'O')];
  const ab = addBond(doc, a.id, b.id, 1);
  addCurve(doc, { bond: ab.id }, { atom: c.id });
  doc.bonds.delete(ab.id);
  assert.equal(buildScene(doc).curves.size, 0);
});

test('a bracket made round a molecule, copied: round all of it, the atoms drawn on after it too', () => {
  const doc = emptyDoc();
  const [a, b] = [addAtom(doc, 0, 0), addAtom(doc, 1, 0)];
  addBond(doc, a.id, b.id, 1);
  const bracket = addBracket(doc, -1, -1, 2, 1, { atoms: [a.id, b.id] });
  const later = addAtom(doc, 2, 0);
  addBond(doc, b.id, later.id, 1);
  const target = emptyDoc();
  copyObjects(doc, [a.id, b.id, later.id, ...doc.bonds.keys(), bracket.id], 0, 0, target);
  const copied = [...target.brackets.values()][0];
  assert.equal([...bracketMembers(target, copied)].length, 3);
});

test('drawn H with a curved arrow from its bond (an E2) stay drawn', () => {
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0);
  for (const [x, y] of [[-1, 0.5], [1, 0.5], [0, 1]]) addBond(doc, c.id, addAtom(doc, x, y).id, 1); // (no H of its own left)
  const h = addAtom(doc, 0, -1, 'H');
  const ch = addBond(doc, c.id, h.id, 1);
  const base = addAtom(doc, 2, 0, 'O', { charge: -1 });
  assert.equal(hydrogenAction(doc, [c.id]), 'hide');
  addCurve(doc, { bond: ch.id }, { atom: base.id });
  assert.equal(hydrogenAction(doc, [c.id]), null);
});

test("a bracket round two molecules (resonance forms) is neither one's; round one alone, its", () => {
  const doc = emptyDoc();
  const [a, b] = [addAtom(doc, 0, 0), addAtom(doc, 3, 0)];
  const both = addBracket(doc, -1, -1, 4, 1);
  const one = addBracket(doc, -0.5, -0.5, 0.5, 0.5);
  assert.deepEqual(bracketsOfMolecule(doc, new Set([a.id])), [one.id]);
  assert.deepEqual(bracketsOfMolecule(doc, new Set([b.id])), []);
  assert.ok(!bracketsOfMolecule(doc, new Set([a.id])).includes(both.id));
});

test('a bracket drawn as a box, turned by 45° with what is in it: upright round it, not a line', () => {
  const bracket = { x1: -1, y1: -1, x2: 1, y2: 1 };
  const t = Math.PI / 4;
  mapBracket(bracket, { ...bracket }, ([x, y]) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)]);
  assert.ok(bracket.x2 - bracket.x1 > 2 && bracket.y2 - bracket.y1 > 2);
});

test('a text mirrored with a drawing: by its middle, not its start', () => {
  const text = { x: 2, y: 0 };
  mapText(text, [2, 0], { x1: 2, y1: -0.3, x2: 4, y2: 0.1 }, ([x, y]) => [-x, y]);
  assert.equal(text.x, -4); // (its middle at 3 goes to −3, its start a half width before that)
});

test('a bracket round what changed shape: as far out from it as before', () => {
  const bracket = { x1: -1, y1: -1, x2: 3, y2: 1 };
  keepMargins(bracket, { minX: 0, minY: 0, maxX: 2, maxY: 0 }, { minX: 0, minY: -1, maxX: 1, maxY: 1 });
  assert.deepEqual(bracket, { x1: -1, y1: -2, x2: 2, y2: 2 });
});
