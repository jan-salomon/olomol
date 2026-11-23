// Parts of olomol switched off in an embedded editor (src/features.js): which parts an address asks for, which
// tools and windows go with them, and which changes of the drawing are refused.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAtom, addBond, cloneDoc, emptyDoc } from '../src/model/doc.js';
import { allowed, dialogAllowed, FEATURES, lookFrom, partsFrom, setParts, switchedOff, toolAllowed } from '../src/features.js';

const ALL = Object.keys(FEATURES);

test('an address gives the parts: all, only some, all but some; unknown names ignored', () => {
  assert.deepEqual([...partsFrom('')], ALL);
  assert.deepEqual([...partsFrom('?only=curved-arrows,charges-electrons')], ['curved-arrows', 'charges-electrons']);
  assert.deepEqual([...partsFrom('?only=curved-arrows%20charges-electrons&off=charges-electrons')], ['curved-arrows']);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual([...partsFrom('?off=structures-from-names,chairs-projections,nonsense')], ALL.filter((p) => p !== 'structures-from-names' && p !== 'chairs-projections'));
    // (the names before 0.6.0, in links already sent: read as the new ones)
    assert.deepEqual([...partsFrom('?only=arrows,electrons')], ['curved-arrows', 'charges-electrons']);
    assert.deepEqual([...partsFrom('?off=pubchem,3d')], ALL.filter((p) => p !== 'structures-from-names' && p !== 'turn-in-3d'));
  } finally {
    console.warn = warn;
  }
});

test('tools and windows go with their parts; Select and Erase always there', () => {
  setParts(['curved-arrows', 'charges-electrons']);
  try {
    assert.ok(toolAllowed({ name: 'select' }) && toolAllowed({ name: 'erase' }));
    assert.ok(toolAllowed({ name: 'curve', electrons: 2 }) && toolAllowed({ name: 'pairs' }) && toolAllowed({ name: 'charge', delta: 1 }));
    assert.ok(!toolAllowed({ name: 'bond', order: 1 }) && !toolAllowed({ name: 'ringFlip' }) && !toolAllowed({ name: 'text' }));
    assert.ok(!dialogAllowed('templates') && !dialogAllowed('turn3d') && !dialogAllowed('periodic'));
    assert.ok(!allowed('structures-from-names') && allowed(null));
  } finally {
    setParts(ALL);
  }
});

function acid() {
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C');
  const o = addAtom(doc, 1, 0, 'O');
  addBond(doc, c.id, o.id, 2);
  return { doc, c, o };
}

test('a change touching a part switched off is caught; how things are drawn is free', () => {
  const { doc, c, o } = acid();
  const changed = (change) => {
    const after = cloneDoc(doc);
    change(after);
    return switchedOff(doc, after);
  };
  assert.equal(changed((d) => { d.atoms.get(o.id).el = 'N'; }), null, 'everything on: nothing refused');
  setParts(['curved-arrows', 'charges-electrons']);
  try {
    assert.equal(changed((d) => { d.atoms.get(o.id).el = 'N'; }), 'structure');
    assert.equal(changed((d) => addAtom(d, 2, 0, 'C')), 'structure');
    assert.equal(changed((d) => d.atoms.delete(c.id)), 'structure');
    assert.equal(changed((d) => { [...d.bonds.values()][0].order = 1; }), 'structure');
    assert.equal(changed((d) => { d.atoms.get(o.id).charge = -1; d.atoms.get(o.id).lonePairs = 'auto'; }), null);
    assert.equal(changed((d) => { d.atoms.get(o.id).x += 1; [...d.bonds.values()][0].side = 'left'; }), null);
    assert.equal(changed((d) => d.curves.set(99, { id: 99, electrons: 2, from: { atom: o.id, pair: 0 }, to: { atom: c.id } })), null);
    assert.equal(changed((d) => d.arrows.set(99, { id: 99, x1: 0, y1: 0, x2: 1, y2: 0, kind: 'forward' })), 'reaction-arrows');
    assert.equal(changed((d) => d.texts.set(99, { id: 99, x: 0, y: 0, text: 'H₂O' })), 'text');
    assert.equal(changed((d) => { d.atoms.get(o.id).color = '#c00'; }), 'colors');
    assert.equal(changed((d) => { d.atoms.get(c.id).cipLabel = true; }), 'molecule-info');
    setParts(['structure']);
    assert.equal(changed((d) => addAtom(d, 2, 0, 'C')), null);
    assert.equal(changed((d) => { addAtom(d, 2, 0, 'C'); d.atoms.get(o.id).charge = 1; }), 'charges-electrons', 'a change of two parts: the one switched off');
  } finally {
    setParts(ALL);
  }
});

test('the address sets the colour of curved arrows; anything but a hex colour ignored', () => {
  assert.deepEqual(lookFrom('?arrowcolor=1035A9'), { curveColor: '#1035a9' });
  assert.deepEqual(lookFrom('?arrowcolor=%23e60'), { curveColor: '#e60' });
  assert.deepEqual(lookFrom('?arrowcolor=red'), {});
  assert.deepEqual(lookFrom(''), {});
});
