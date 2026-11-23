// 3D models on the canvas (render/model3d.js): kept as built, out of date when their molecule changes, drawn in
// pictures, copied with their molecule, kept in .olom files, lost (and said) in other programs' formats.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAtom, addBond, addModel, copyObjects, emptyDoc } from '../src/model/doc.js';
import { keptModel, modelBox, moleculeSignature, outOfDate } from '../src/render/model3d.js';
import { buildScene } from '../src/render/scene.js';
import { sceneBounds, sceneMarkup } from '../src/render/svg.js';
import { readOlom, writeOlom } from '../src/io/olom.js';
import { lostIn } from '../src/io/lost.js';

// ethanol drawn (C–C–O), and a stick model of it as Turn in 3D gives one: its three atoms first, then hydrogens
function ethanol() {
  const doc = emptyDoc();
  const [c1, c2, o] = [addAtom(doc, 0, 0, 'C'), addAtom(doc, 0.87, -0.5, 'C'), addAtom(doc, 1.73, 0, 'O')];
  addBond(doc, c1.id, c2.id);
  addBond(doc, c2.id, o.id);
  const sticks = {
    elements: ['C', 'C', 'O', 'H', 'H'],
    // (in Å, off the origin: kept round its middle, a C–C 1 long)
    base: [[10, 0, 0], [11.5, 0, 0], [12.2, 1.3, 0], [9.6, 1, 0.2], [12.9, 1.6, 0.6]],
    bonds: [[0, 1, 1, null], [1, 2, 1, null], [0, 3, 1, null], [2, 4, 1, null]],
    groups: [],
    drawn: 3,
  };
  const ids = [c1.id, c2.id, o.id];
  const item = addModel(doc, 4, 0, { atoms: ids, model: keptModel(sticks), signature: moleculeSignature(doc, ids) });
  return { doc, item, atoms: { c1, c2, o } };
}

test('a 3D model is kept round its middle, a bond 1 long; out of date when its molecule changes, not when it moves or is coloured', () => {
  const { doc, item, atoms } = ethanol();
  const { points } = item.model;
  const middle = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  assert.ok(middle.every((v) => Math.abs(v) < 1e-3), `round its middle (${middle})`);
  assert.ok(Math.abs(Math.hypot(...points[0].map((v, k) => v - points[1][k])) - 1) < 1e-3, 'the C–C 1 long');
  assert.equal(outOfDate(doc, item), false);
  atoms.o.x += 2;
  atoms.o.color = '#ff0000';
  assert.equal(outOfDate(doc, item), false, 'moved and coloured: still up to date');
  atoms.o.el = 'N';
  assert.equal(outOfDate(doc, item), true, 'O made N: out of date');
  atoms.o.el = 'O';
  addAtom(doc, 3, 3, 'C');
  assert.equal(outOfDate(doc, item), false, 'an atom elsewhere: not its molecule');
  const extra = addAtom(doc, 2.6, -0.5, 'C');
  addBond(doc, atoms.o.id, extra.id);
  assert.equal(outOfDate(doc, item), true, 'an atom bonded on: out of date');
});

test('a 3D model is drawn in pictures, in its molecule\'s colours, inside the picture\'s bounds; its box grows with space-filling', () => {
  const { doc, item, atoms } = ethanol();
  atoms.o.color = '#00aa00';
  const scene = buildScene(doc);
  const markup = sceneMarkup(scene, 20);
  assert.ok(markup.includes(`data-id="${item.id}"`) && markup.includes('radialGradient'), 'its balls in the picture');
  assert.ok(markup.includes('00aa00'), 'the O in the drawing\'s green');
  const bounds = sceneBounds(scene);
  const box = modelBox(item);
  assert.ok(bounds.x2 >= box.x2 - 1e-9 && bounds.y1 <= box.y1 + 1e-9, 'the picture reaches round the model');
  item.look = { style: 'spacefill' };
  const big = modelBox(item);
  assert.ok(big.x2 - big.x1 > box.x2 - box.x1 + 1, `space-filling wider (${(big.x2 - big.x1).toFixed(2)} vs ${(box.x2 - box.x1).toFixed(2)})`);
  item.look = { hydrogens: 'none' };
  assert.ok(!sceneMarkup(buildScene(doc), 20).includes('f2f3f5'), 'without the model\'s hydrogens: no white balls');
});

test('a 3D model copied with its molecule shows the copy, up to date; copied alone it keeps the original\'s', () => {
  const { doc, item, atoms } = ethanol();
  const ids = [atoms.c1.id, atoms.c2.id, atoms.o.id, ...[...doc.bonds.keys()], item.id];
  const fresh = copyObjects(doc, ids, 0, 5);
  const copy = [...doc.models.values()].find((m) => fresh.includes(m.id));
  assert.ok(copy && copy.atoms.every((id) => fresh.includes(id)), 'its atoms the copies');
  assert.equal(outOfDate(doc, copy), false, 'the copy up to date');
  const alone = copyObjects(doc, [item.id], 6, 0);
  const lone = doc.models.get(alone[0]);
  assert.deepEqual(lone.atoms, item.atoms);
});

test('a 3D model in an .olom file: read back the same, its atoms and fingerprint by the new ids; other formats say they lose it', () => {
  const { doc, item } = ethanol();
  item.rotation = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
  item.look = { style: 'sticks', hydrogens: 'small' };
  item.size = 1.5;
  // read into a drawing that already has atoms: every id a new one
  const into = emptyDoc();
  addAtom(into, 0, 0, 'C');
  addAtom(into, 1, 0, 'C');
  const { doc: back } = readOlom(writeOlom(doc), into);
  const [read] = back.models.values();
  assert.deepEqual(read.model, item.model);
  assert.deepEqual(read.rotation, item.rotation);
  assert.deepEqual(read.look, item.look);
  assert.equal(read.size, 1.5);
  assert.ok(Math.abs(read.x - item.x) < 1e-6 && Math.abs(read.y - item.y) < 1e-6);
  assert.notDeepEqual(read.atoms, item.atoms);
  assert.equal(outOfDate(back, read), false, 'up to date with its atoms\' new ids');
  assert.ok(lostIn(doc, 'mol').includes('3D models') && lostIn(doc, 'ket').includes('3D models'));
  assert.deepEqual(lostIn(doc, 'png'), []);
});

test('space-filling balls side by side: each masked where the other is in front, the line between them in the middle; it moves smoothly as they turn', async () => {
  const { stickMarkup } = await import('../src/render/sticks.js');
  // two carbons a bond apart, level (the same depth): the overlap halved, each ball in front on its own side
  const model = (tilt) => ({ elements: ['C', 'C'], points: [[-0.5, 0, -tilt], [0.5, 0, tilt]], bonds: [[0, 1, 1]] });
  const masked = (markup) => [...markup.matchAll(/<mask[^>]*>(.*?)<\/mask>/g)].map((m) => m[1]);
  const level = stickMarkup(model(0), 100, { style: 'spacefill' });
  const [mask] = masked(level);
  assert.ok(mask && /<path d="M/.test(mask), 'the ball drawn second masked');
  // the mask's edge: the intersection circle seen edge on, a straight line across at x = 0 (the middle)
  const xs = [...mask.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(xs.some((x) => Math.abs(x) < 1), `its edge through the middle (${Math.min(...xs.map(Math.abs)).toFixed(2)})`);
  // turned a little: the mask a little different, never the whole overlap at once
  const turned = masked(stickMarkup(model(0.05), 100, { style: 'spacefill' }));
  assert.equal(turned.length, 1);
  assert.notEqual(turned[0], mask);
  assert.equal(masked(stickMarkup(model(0), 100, { style: 'balls' })).length, 0, 'ball and stick: no masks');
});

test('a 3D model of a chair is out of date when the ring is flipped (its methyl axial now), not when the molecule is moved', async () => {
  const { chairDoc } = await import('../src/chem/chair.js');
  const { ringFlip } = await import('../src/chem/ringFlip.js');
  const { smallestRings } = await import('../src/model/graph.js');
  const doc = chairDoc({ equatorial: [null, null, null, 'C'] });
  const ids = [...doc.atoms.keys()];
  const before = moleculeSignature(doc, ids);
  assert.ok(before.split('|')[2].length > 0, 'the chair read: its torsions in the fingerprint');
  const item = addModel(doc, 5, 0, { atoms: ids, model: { elements: ids.map(() => 'C'), points: ids.map((_, k) => [k, 0, 0]), bonds: [], groups: [], drawn: ids.length }, signature: before });
  for (const atom of doc.atoms.values()) atom.x += 3;
  assert.equal(outOfDate(doc, item), false, 'moved: up to date');
  const ring = [...smallestRings(doc).values()].find((r) => r.length === 6);
  // (the flip as the editor does it: its animation's end)
  const flip = ringFlip(doc, ring);
  for (const [id, [x, y]] of flip.at(1)) Object.assign(doc.atoms.get(id), { x, y });
  assert.equal(outOfDate(doc, item), true, 'flipped (the methyl axial): out of date');
});

test('a joint of the sticks style as it is: two sticks at right angles meet on the diagonal, a stick and its ball on the circle across it', async () => {
  const { stickMarkup } = await import('../src/render/sticks.js');
  // a carbon with sticks right (x) and up (y), in the page's plane; drawn 100 px to a bond
  const model = { elements: ['C', 'C', 'C'], points: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], bonds: [[0, 1, 1], [0, 2, 1]] };
  const markup = stickMarkup(model, 100, { style: 'sticks', fade: false });
  const parts = [...markup.matchAll(/<path d="M([^"]*)Z" fill="url\(#st/g)].map((m) => m[1].split('L').map((pt) => pt.split(',').map(Number)));
  // the middle joint's two parts (each through the middle, where the two sticks and the ball meet)
  const middle = parts.filter((part) => part.some(([x, y]) => Math.hypot(x, y) < 0.02));
  assert.equal(middle.length, 2, 'each stick its part of the joint');
  for (const part of middle) {
    // its edge towards the ball and the other stick (17 points across it): on the circle across it through the middle
    // (x = 0 for the stick going right, y = 0 going up) or halfway between the two (x = −y on the page, y down)
    const edge = part.slice(0, 17);
    assert.ok(edge.every(([x, y]) => Math.abs(x) < 0.02 || Math.abs(y) < 0.02 || Math.abs(x + y) < 0.02), `on the circle or the diagonal: ${JSON.stringify(edge)}`);
    assert.ok(edge.some(([x, y]) => Math.abs(x + y) < 0.02 && Math.abs(x) > 3), 'part of it on the diagonal');
  }
  // the end atoms (one stick each): the stick's part from the circle across it through the atom, the ball beyond
  const end = parts.find(([[x]]) => Math.abs(x - 100) < 14);
  assert.ok(end && end.slice(0, 17).every(([x]) => Math.abs(x - 100) < 0.02), 'a lone stick from the circle across it');
});

test('a 3D model\'s fingerprint is what the drawing means: flipped (its wedges swapped) or turned, up to date; a wedge made a hash or a double bond redrawn, out of date', () => {
  // (R)-CHFClBr-like: a carbon with a wedge and a hash, and a cis double bond beside it
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C');
  const [f, cl, br] = [addAtom(doc, 0, -1, 'F'), addAtom(doc, 0.87, 0.5, 'Cl'), addAtom(doc, -0.87, 0.5, 'Br')];
  addBond(doc, c.id, f.id);
  const wedge = addBond(doc, c.id, cl.id);
  wedge.stereo = 'wedge';
  addBond(doc, c.id, br.id).stereo = 'hash';
  const [d1, d2, d3] = [addAtom(doc, 1.73, 0, 'C'), addAtom(doc, 2.6, 0.5, 'C'), addAtom(doc, 3.46, 0, 'C')];
  addBond(doc, cl.id, d1.id);
  const double = addBond(doc, d1.id, d2.id, 2);
  addBond(doc, d2.id, d3.id);
  const ids = [...doc.atoms.keys()];
  const item = addModel(doc, 6, 0, { atoms: ids, model: { elements: [], points: [], bonds: [], groups: [], drawn: 0 }, signature: moleculeSignature(doc, ids) });
  // flipped left to right as olomol flips (mirrored, the wedges swapped: the same molecule turned over), and turned
  const flipped = () => {
    for (const a of doc.atoms.values()) a.x = -a.x;
    for (const b of doc.bonds.values()) if (b.stereo) b.stereo = b.stereo === 'wedge' ? 'hash' : 'wedge';
  };
  flipped();
  assert.equal(outOfDate(doc, item), false, 'flipped: up to date');
  for (const a of doc.atoms.values()) [a.x, a.y] = [a.x * 0.6 - a.y * 0.8, a.x * 0.8 + a.y * 0.6];
  assert.equal(outOfDate(doc, item), false, 'turned: up to date');
  // only mirrored (the wedges as they were): the other enantiomer
  for (const a of doc.atoms.values()) a.x = -a.x;
  assert.equal(outOfDate(doc, item), true, 'mirrored, wedges kept: the other enantiomer');
  for (const a of doc.atoms.values()) a.x = -a.x;
  assert.equal(outOfDate(doc, item), false);
  wedge.stereo = wedge.stereo === 'wedge' ? 'hash' : 'wedge';
  assert.equal(outOfDate(doc, item), true, 'a wedge made a hash');
  wedge.stereo = wedge.stereo === 'wedge' ? 'hash' : 'wedge';
  // the double bond's far carbon put across it (cis made trans)
  const [A, B] = [doc.atoms.get(double.a), doc.atoms.get(double.b)];
  const along = [B.x - A.x, B.y - A.y];
  const n = Math.hypot(...along);
  const [ux, uy] = [along[0] / n, along[1] / n];
  const rel = [d3.x - B.x, d3.y - B.y];
  const dot = rel[0] * ux + rel[1] * uy;
  [d3.x, d3.y] = [B.x + 2 * dot * ux - rel[0], B.y + 2 * dot * uy - rel[1]];
  assert.equal(outOfDate(doc, item), true, 'cis made trans');
});
