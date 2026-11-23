// Drawing rules: where electrons, charges, double bond lines, arrow ends
// and corner dots go.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { readMolfile } from '../src/io/molfile.js';
import { addAtom, addBond, addCurve, addOrbital, addPlus, addText, emptyDoc } from '../src/model/doc.js';
import { angleBetween } from '../src/render/mechanism.js';
import { buildScene } from '../src/render/scene.js';
import { STYLE } from '../src/render/style.js';
import { CAP_HEIGHT } from '../src/render/text.js';

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
const DEGREE = Math.PI / 180;

function draw(smiles, { pairs = true } = {}) {
  const mol = RDKit.get_mol(smiles);
  mol.set_new_coords();
  const { doc } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })));
  mol.delete();
  if (pairs) for (const atom of doc.atoms.values()) if (atom.el !== 'C') atom.lonePairs = 'auto';
  return doc;
}
const atomOf = (scene, el, charge = 0) => [...scene.atoms.values()].find((info) => info.atom.el === el && info.atom.charge === charge);

test('chloride: four lone pairs in a square', () => {
  const info = atomOf(buildScene(draw('[Cl-]')), 'Cl', -1);
  const angles = info.electrons.pairs.map((p) => Math.round(p.angle / DEGREE)).sort((a, b) => a - b);
  assert.deepEqual(angles, [-90, 0, 90, 180]);
});

test('acylium: the lone pair of O⁺ opposite the triple bond', () => {
  const info = atomOf(buildScene(draw('CC#[O+]')), 'O', 1);
  assert.equal(info.electrons.pairs.length, 1);
  assert.ok(angleBetween(info.electrons.pairs[0].angle, info.bondAngles[0]) > 170 * DEGREE);
});

test('ammonium: the charge after NH3, top right', () => {
  const info = atomOf(buildScene(draw('C[NH3+]', { pairs: false })), 'N', 1);
  assert.equal(info.label.hSide, info.bondAngles[0] > -Math.PI / 2 && info.bondAngles[0] < Math.PI / 2 ? 'left' : 'right');
  assert.equal(Math.round(info.label.chargeAngle / DEGREE), info.label.hSide === 'right' ? -40 : -140);
});

test('double bonds: inside a ring; centred on a C=O at a chain end', () => {
  const scene = buildScene(draw('O=C(C)c1ccccc1'), undefined, { debug: true });
  const rules = [...scene.bonds.values()].filter((b) => b.bond.order === 2).map((b) => b.rule).sort();
  assert.deepEqual(rules, ['centred: to a labelled chain end (C=O)', 'inside its 6-ring', 'inside its 6-ring', 'inside its 6-ring']);
});

test('an arrow from a triple bond starts outside its lines', () => {
  const doc = draw('C#N.[H+]', { pairs: false });
  const bond = [...doc.bonds.values()].find((b) => b.order === 3);
  const h = [...doc.atoms.values()].find((a) => a.el === 'H');
  addCurve(doc, { bond: bond.id }, { atom: h.id });
  const scene = buildScene(doc);
  const [p, q] = [scene.pos(bond.a), scene.pos(bond.b)];
  const start = [...scene.curves.values()][0].samples[0];
  const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const off = Math.abs((q[0] - p[0]) * (start[1] - p[1]) - (q[1] - p[1]) * (start[0] - p[0])) / length;
  assert.ok(off > scene.bonds.get(bond.id).extent[1] + 0.05, `starts ${off.toFixed(2)} from the bond axis`);
});

test('an arrow keeps off the outer lines of a triple bond, its head too', () => {
  const near = (p, [x1, y1, x2, y2]) => {
    const [dx, dy] = [x2 - x1, y2 - y1];
    const t = Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - x1 - t * dx, p[1] - y1 - t * dy);
  };
  // Cl's lone pair to the nitrile's carbon (the head lay on a line); the C≡C bond to the carbonyl carbon past it (the curve ran over one)
  const tripleOf = (doc) => [...doc.bonds.values()].find((b) => b.order === 3);
  for (const [smiles, from, to] of [['N#CC(C)Cl', () => ({ atom: 5 }), () => ({ atom: 2 })], ['CC#CC=O', (doc) => ({ bond: tripleOf(doc).id }), () => ({ atom: 4 })]]) {
    const doc = draw(smiles);
    addCurve(doc, from(doc), to(doc));
    const scene = buildScene(doc);
    const curve = [...scene.curves.values()][0];
    const triple = scene.bonds.get(tripleOf(doc).id);
    const [p, q] = [scene.pos(triple.a), scene.pos(triple.b)];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const outer = triple.shapes.lines.filter(([x, y]) => Math.abs((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])) / length > 0.03);
    assert.equal(outer.length, 2);
    const closest = Math.min(...outer.flatMap((line) => [...curve.samples.slice(2), ...curve.head].map((point) => near(point, line))));
    assert.ok(closest > 0.05, `${smiles}: ${closest.toFixed(3)} from an outer line`);
  }
});

test('carbons in a straight line get a dot', () => {
  const scene = buildScene(draw('CC#CC', { pairs: false }));
  assert.equal([...scene.atoms.values()].filter((info) => info.straight).length, 2);
});

test('a bridge between the wide ends of two wedges is bold; joints have no notch', () => {
  // a five-ring on a bond: wedges up from both ends, two plain bonds across the top
  const doc = emptyDoc();
  const [p, q] = [addAtom(doc, 0, 0), addAtom(doc, 1, 0)];
  const [x, z] = [addAtom(doc, -0.3, -0.95), addAtom(doc, 1.3, -0.95)];
  const y = addAtom(doc, 0.5, -1.55);
  addBond(doc, p.id, q.id);
  const wedge = addBond(doc, p.id, x.id, 1, { stereo: 'wedge' });
  addBond(doc, q.id, z.id, 1, { stereo: 'wedge' });
  const [b1, b2] = [addBond(doc, x.id, y.id), addBond(doc, y.id, z.id)];
  const scene = buildScene(doc);
  for (const bond of [b1, b2]) assert.equal(scene.bonds.get(bond.id).shapes.polygons.length, 1);
  assert.equal(scene.bonds.get(doc.bonds.values().next().value.id).shapes.lines.length, 1); // the ring bond stays thin
  // the wedge's wide end runs into the bold bond: one corner sits beyond the plain perpendicular end
  const [, c1, at, c2] = scene.bonds.get(wedge.id).shapes.polygons[0];
  assert.deepEqual(at, [x.x, x.y]);
  const along = (c) => (c[0] - x.x) * (x.x - p.x) + (c[1] - x.y) * (x.y - p.y);
  assert.ok(Math.max(along(c1), along(c2)) > 0.01);
});

test('ACS 1996 style: thinner lines, labels of 10 pt, pictures 14.4 pt (19.2 px) per bond', async () => {
  const { applyStyle, STYLE } = await import('../src/render/style.js');
  const { sceneToSVG } = await import('../src/render/svg.js');
  try {
    applyStyle('acs');
    assert.ok(Math.abs(STYLE.font - 10 / 14.4) < 1e-9 && Math.abs(STYLE.line - 0.6 / 14.4) < 1e-9);
    const doc = draw('CC');
    // bonds 0.6 pt wide at 14.4 pt per bond: 0.8 px; labels Arial 10 pt: 13.33 px
    const svg = sceneToSVG(buildScene(doc), { scale: STYLE.exportScale, margin: 0 });
    assert.ok(svg.includes('stroke-width="0.8"'), 'line width');
    assert.ok(/font-size="13\.33/.test(svg), 'label size');
  } finally {
    applyStyle('screen');
  }
});

test('an unpaired electron sits to the right of its atom (Cl•, with or without its lone pairs), else where there is room (•CH3)', () => {
  const dot = (el, extra) => {
    const doc = emptyDoc();
    const atom = addAtom(doc, 0, 0, el, { radical: 2, ...extra });
    return Math.round(buildScene(doc).atoms.get(atom.id).electrons.unpaired[0].angle / DEGREE);
  };
  assert.deepEqual([dot('Cl', {}), dot('Cl', { lonePairs: 'auto' }), dot('C', {})], [0, 0, 180]);
});

test('fishhooks from an atom with several unpaired electrons start each from an electron of its own (·N̈· + 3 H•)', () => {
  // J's drawing: a lone N with three unpaired electrons, three H atoms round it, a fishhook from N to each new N–H
  // bond (left, right, then the one below on the left) and one from each H to it
  const doc = emptyDoc();
  const n = addAtom(doc, 0, 0, 'N', { radical: 4, lonePairs: 'auto' });
  const hs = [[-1.9, 1.1], [1.9, 1.2], [-1.0, 3.5]].map(([x, y]) => addAtom(doc, x, y, 'H', { radical: 2 }));
  for (const h of hs) {
    addCurve(doc, { atom: n.id, radical: true }, { atom: h.id, newBond: n.id }, 1);
    addCurve(doc, { atom: h.id, radical: true }, { atom: n.id, newBond: h.id }, 1);
  }
  const scene = buildScene(doc);
  const fromN = [...scene.curves.values()].filter((g) => g.curve.from.atom === n.id);
  const starts = fromN.map((g) => g.tailKey);
  assert.equal(new Set(starts).size, 3, `the three start at ${starts.join(', ')}`);
  // and the symbol turned so that each starts at the electron facing its H (within 50°), the pair on top, where
  // none goes
  const { electrons } = scene.atoms.get(n.id);
  fromN.forEach((g, k) => {
    const start = electrons.unpaired[Number(g.tailKey.slice(1))];
    const [x, y] = [hs[k].x, hs[k].y];
    assert.ok(angleBetween(start.angle, Math.atan2(y, x)) < 50 * DEGREE, `arrow ${k} from the electron at ${Math.round(start.angle / DEGREE)}°`);
  });
  assert.equal(Math.round(electrons.slots[0].angle / DEGREE), -90);
  // J's second drawing (the H atoms closer, the right one lower): in whatever order the arrows were drawn, each
  // starts at the electron facing its H (before, those to the right and lower H swapped electrons and crossed)
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const order of orders) {
    const second = emptyDoc();
    const n2 = addAtom(second, 0, 0, 'N', { radical: 4, lonePairs: 'auto' });
    const around = [[-0.8, 0.85], [1.65, 1.1], [0, 2.5]].map(([x, y]) => addAtom(second, x, y, 'H', { radical: 2 }));
    for (const k of order) {
      addCurve(second, { atom: n2.id, radical: true }, { atom: around[k].id, newBond: n2.id }, 1);
      addCurve(second, { atom: around[k].id, radical: true }, { atom: n2.id, newBond: around[k].id }, 1);
    }
    const built = buildScene(second);
    const { unpaired } = built.atoms.get(n2.id).electrons;
    for (const g of [...built.curves.values()].filter((c) => c.curve.from.atom === n2.id)) {
      const h = second.atoms.get(g.curve.to.atom);
      const start = unpaired[Number(g.tailKey.slice(1))];
      assert.ok(angleBetween(start.angle, Math.atan2(h.y, h.x)) < 50 * DEGREE, `order ${order}: the arrow to H at ${h.x}, ${h.y} from ${Math.round(start.angle / DEGREE)}°`);
    }
  }
  // a fishhook to a p orbital of another molecule drawn before two to H atoms: still each arrow from the electron
  // facing its target (before, the orbital's arrow wasn't among those the electrons turned to but was counted
  // when they were handed out: every later one took the wrong electron, and they crossed)
  const third = emptyDoc();
  const n3 = addAtom(third, 0, 0, 'N', { radical: 4, lonePairs: 'auto' });
  const [c1, c2] = [addAtom(third, 0, -2.2, 'C'), addAtom(third, 1.3, -2.2, 'C')];
  addBond(third, c1.id, c2.id, 2);
  const p = addOrbital(third, c1.id, { kind: 'p' });
  addCurve(third, { atom: n3.id, radical: true }, { orbital: p.id }, 1);
  const h3 = [[1.9, 1.2], [-1.0, 3.5]].map(([x, y]) => addAtom(third, x, y, 'H', { radical: 2 }));
  for (const h of h3) addCurve(third, { atom: n3.id, radical: true }, { atom: h.id, newBond: n3.id }, 1);
  const scene3 = buildScene(third);
  const unpaired3 = scene3.atoms.get(n3.id).electrons.unpaired;
  for (const g of [...scene3.curves.values()]) {
    const end = g.curve.to.orbital !== undefined ? c1 : third.atoms.get(g.curve.to.atom);
    const start = unpaired3[Number(g.tailKey.slice(1))];
    assert.ok(angleBetween(start.angle, Math.atan2(end.y, end.x)) < 50 * DEGREE, `the arrow to ${end.el} at ${end.x}, ${end.y} from ${Math.round(start.angle / DEGREE)}°`);
  }
  // a singlet's two electrons sit in one place: two fishhooks may both start there
  const singlet = emptyDoc();
  const c = addAtom(singlet, 0, 0, 'C', { radical: 1 });
  const [a, b] = [addAtom(singlet, 2, -0.3, 'H', { radical: 2 }), addAtom(singlet, 2, 0.3, 'H', { radical: 2 })];
  for (const h of [a, b]) addCurve(singlet, { atom: c.id, radical: true }, { atom: h.id, newBond: c.id }, 1);
  assert.equal(new Set([...buildScene(singlet).curves.values()].map((g) => g.tailKey)).size, 1);
});

test('two radicals combining (Cl• + •CH3): their fishhooks meet between the atoms, on one side, and stay so in a KET file', async () => {
  const { readKet, writeKet } = await import('../src/io/ket.js');
  const doc = emptyDoc();
  const cl = addAtom(doc, 0, 0, 'Cl', { radical: 2, lonePairs: 'auto' });
  const c = addAtom(doc, 2.4, 0, 'C', { radical: 2 });
  addCurve(doc, { atom: cl.id, radical: true }, { atom: c.id, newBond: cl.id }, 1);
  addCurve(doc, { atom: c.id, radical: true }, { atom: cl.id, newBond: c.id }, 1);
  const tips = [...buildScene(doc).curves.values()].map((g) => g.head[0]);
  for (const [x, y] of tips) assert.ok(Math.hypot(x - 1.2, y) < 0.2, `a head at ${x.toFixed(2)}, ${y.toFixed(2)}: by the middle`);
  assert.ok(Math.sign(tips[0][1]) === Math.sign(tips[1][1]) && tips[0][1] !== 0, 'both on one side');
  assert.ok(tips[0][0] < 1.2 && tips[1][0] > 1.2, 'each short of the middle, on its own side of it');
  const { doc: back } = readKet(writeKet(doc));
  const ids = [...back.atoms.values()].map((a) => a.id);
  assert.deepEqual([...back.curves.values()].map((curve) => [ids.indexOf(curve.to.newBond), ids.indexOf(curve.to.atom)]), [[0, 1], [1, 0]]);
});

test('H abstraction (Cl• + H–CH3): the Cl•\'s fishhook and one from the H–C bond meet at the new Cl–H bond, clear of the "+" between them', () => {
  const doc = emptyDoc();
  const cl = addAtom(doc, 0, 0, 'Cl', { radical: 2, lonePairs: 'auto' });
  const h = addAtom(doc, 3.3, 0, 'H');
  const c = addAtom(doc, 4.3, 0, 'C');
  const hc = addBond(doc, h.id, c.id);
  addPlus(doc, 1.75, 0);
  addCurve(doc, { atom: cl.id, radical: true }, { atom: h.id, newBond: cl.id }, 1);
  addCurve(doc, { bond: hc.id }, { atom: cl.id, newBond: h.id }, 1);
  addCurve(doc, { bond: hc.id }, { atom: c.id }, 1);
  const [fromCl, fromBond] = [...buildScene(doc).curves.values()].map((g) => g.head[0]);
  for (const [x, y] of [fromCl, fromBond]) {
    assert.ok(Math.abs(x - 1.65) < 0.2, `a head at x ${x.toFixed(2)}: by the middle of Cl···H`);
    assert.ok(Math.abs(y) > 0.2, `a head ${Math.abs(y).toFixed(2)} off the line: clear of the "+"`);
  }
  assert.ok(fromCl[0] < 1.65 && fromBond[0] > 1.65 && Math.sign(fromCl[1]) === Math.sign(fromBond[1]), 'from either side, on one side of the line');
});

// A δ that a curved arrow would cross goes to another side of its atom.
test('δ+ and δ− keep out of the way of curved arrows', () => {
  const hit = (scene) => {
    const points = [...scene.curves.values()].flatMap((c) => [...c.samples, ...c.head]);
    return [...scene.atoms.values()].filter((info) => info.mark || (info.label && info.atom.partialCharge)).some((info) => {
      const [dx, dy] = info.label ? info.pos : [0, 0];
      const b = info.label ? info.label.boxes.at(-1) : info.mark.box;
      return points.some(([x, y]) => x > b.x1 + dx && x < b.x2 + dx && y > b.y1 + dy && y < b.y2 + dy);
    });
  };
  let crossed = 0;
  // a hydroxide attacking a carbonyl carbon from every side round it
  for (let k = 0; k < 12; k++) {
    const doc = emptyDoc();
    const c = addAtom(doc, 0, 0, 'C', { partialCharge: 1 });
    const o = addAtom(doc, 0, 1, 'O', { partialCharge: -1, lonePairs: 'auto' });
    addBond(doc, c.id, o.id, 2);
    addBond(doc, c.id, addAtom(doc, -0.87, -0.5).id);
    addBond(doc, c.id, addAtom(doc, 0.87, -0.5).id);
    const angle = (k * Math.PI) / 6;
    const nu = addAtom(doc, 2 * Math.cos(angle), 2 * Math.sin(angle), 'O', { charge: -1, lonePairs: 'auto' });
    addCurve(doc, { atom: nu.id }, { atom: c.id });
    addCurve(doc, { bond: [...doc.bonds.values()][0].id }, { atom: o.id });
    const scene = buildScene(doc);
    if (hit(scene)) crossed += 1;
  }
  assert.equal(crossed, 0, 'no arrow through a δ');
});

// A ring fill keeps off written atoms, also at a corner that points into
// the ring (a bridged ring drawn with its O inward).
test('ring fills leave written atoms out, at inward corners too', async () => {
  const { addFill } = await import('../src/model/doc.js');
  const inside = ([x, y], polygon) => {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [[xi, yi], [xj, yj]] = [polygon[i], polygon[j]];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
    }
    return result;
  };
  const doc = emptyDoc();
  // C, O (pushed in), C, C, N, C round a ring
  const points = [[-1.1, -0.9, 'C'], [0, -0.55, 'O'], [1.1, -0.9, 'C'], [0.9, 0.5, 'C'], [0, 1, 'N'], [-0.9, 0.5, 'C']];
  const ring = points.map(([x, y, el]) => addAtom(doc, x, y, el).id);
  ring.forEach((id, k) => addBond(doc, id, ring[(k + 1) % ring.length]));
  addFill(doc, ring, '#b9e8b0');
  const scene = buildScene(doc);
  const [{ polygon }] = scene.fills;
  for (const id of ring) {
    const info = scene.atoms.get(id);
    if (info.label) assert.ok(!inside(info.pos, polygon), `${info.atom.el} left out of the fill`);
  }
});

// Highlights of several colours: the larger region first, so a small mark
// lies on top of a large one, whichever was stored first.
test('highlights: smaller marks on top of larger ones, in a fixed order', async () => {
  const { sceneMarkup } = await import('../src/render/svg.js');
  const doc = emptyDoc();
  const atoms = [0, 1, 2, 3, 4].map((k) => addAtom(doc, k, 0).id);
  // the orange bond first in the document, the blue region after it
  const orange = addBond(doc, atoms[0], atoms[1], 1, { highlight: '#ffd59e' });
  for (let k = 1; k < 4; k++) addBond(doc, atoms[k], atoms[k + 1], 1, { highlight: '#b5dcff' });
  for (const id of atoms.slice(1)) doc.atoms.get(id).highlight = '#b5dcff';
  for (const id of atoms.slice(0, 2)) doc.atoms.get(id).highlight = '#ffd59e';
  assert.ok(orange);
  const markup = sceneMarkup(buildScene(doc), 40);
  assert.ok(markup.indexOf('fill="#b5dcff"') < markup.indexOf('fill="#ffd59e"'), 'blue (larger) under orange (smaller)');
});

// Turn in 3D's drawing gives its atoms and bonds a depth: there the nearer mark lies over the further one,
// whatever its colour or region
test('highlights in Turn in 3D\'s drawing: by depth, the nearer over the further', async () => {
  const { sceneMarkup } = await import('../src/render/svg.js');
  for (const blueNear of [true, false]) {
    const doc = emptyDoc();
    const [a, b, c] = [0, 1, 2].map((k) => addAtom(doc, k * 0.5, 0).id);
    addBond(doc, a, b);
    addBond(doc, b, c);
    // blue a larger region (two atoms), red one atom
    Object.assign(doc.atoms.get(a), { highlight: '#b5dcff', depth: blueNear ? 1 : -1 });
    Object.assign(doc.atoms.get(b), { highlight: '#b5dcff', depth: blueNear ? 1 : -1 });
    Object.assign(doc.atoms.get(c), { highlight: '#ffb0b0', depth: blueNear ? -1 : 1 });
    const markup = sceneMarkup(buildScene(doc), 40);
    const [blue, red] = [markup.lastIndexOf('fill="#b5dcff"'), markup.lastIndexOf('fill="#ffb0b0"')];
    assert.ok(blueNear ? blue > red : red > blue, `blue ${blueNear ? 'nearer' : 'further'}: ${JSON.stringify({ blue, red })}`);
  }
});

test('chairs sit level; the adamantane cage is adamantane; a multistep arrow is two arrows', async () => {
  const { chairDoc, adamantaneCage } = await import('../src/chem/chair.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { arrowShapes } = await import('../src/render/scene.js');
  for (const flip of [false, true]) {
    const [t1, , u2, t2, , l1] = [...chairDoc({ flip }).atoms.values()].slice(0, 6);
    assert.ok(Math.abs(t1.y - u2.y) < 1e-9 && Math.abs(t2.y - l1.y) < 1e-9, 'the tips level with the top and bottom corners');
  }
  const cage = adamantaneCage();
  const [left, , right, , , , top] = [...cage.atoms.values()];
  assert.ok(Math.abs(top.x - (left.x + right.x) / 2) < 1e-9, 'the top CH midway between the upper tips');
  const smiles = (molfile) => { const mol = RDKit.get_mol(molfile); const s = mol.get_smiles(); mol.delete(); return s; };
  assert.equal(smiles(writeMolfile(cage).molfile), smiles('C1C2CC3CC1CC(C2)C3'));
  const arrow = arrowShapes({ x1: 0, y1: 0, x2: 3, y2: 0, kind: 'multistep' });
  assert.equal(arrow.lines.length, 2);
  assert.equal(arrow.polygons.length, 2);
  assert.ok(arrow.lines[0][1] < arrow.lines[1][1] && arrow.lines[0][0] < arrow.lines[1][0], 'one over the other, the lower one further on');
});

test('the stick model\'s small hydrogens: those the model added small and near their atom, a drawn H as it is', async () => {
  const { stickMarkup } = await import('../src/render/sticks.js');
  // a C–C with a drawn H on the first carbon (the drawing's three atoms) and two hydrogens the model added
  const model = {
    elements: ['C', 'C', 'H', 'H', 'H'],
    points: [[0, 0, 0], [1.5, 0, 0], [-0.5, 1, 0], [-0.5, -1, 0], [2, 1, 0]],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [1, 4, 1]],
    drawn: 3,
  };
  const balls = (markup) => [...markup.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  const [full, small] = [stickMarkup(model, 50), stickMarkup(model, 50, { smallHydrogens: true })].map(balls);
  assert.equal(small.length, full.length, 'every atom still a ball');
  const at = (list, [x, y]) => list.find(([cx, cy]) => Math.hypot(cx - x * 50, cy + y * 50) < 0.5);
  // (the drawn H where it was, as large; the added ones 0.42 of a bond from their carbon (1.5 here), much smaller)
  assert.deepEqual(at(small, [-0.5, 1]), at(full, [-0.5, 1]));
  const h3 = at(small, [-0.5 * 0.42 * 1.5 / Math.hypot(0.5, 1), -1 * 0.42 * 1.5 / Math.hypot(0.5, 1)]);
  assert.ok(h3 && h3[2] < 0.5 * at(full, [-0.5, -1])[2], JSON.stringify(small));
});

test('a cyclohexene drawn as a chair (a half-chair, as an E2 product is drawn) carries its R/S: trans and cis told apart', async () => {
  const { chairDoc } = await import('../src/chem/chair.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { ringFlip, chairTurn } = await import('../src/chem/ringFlip.js');
  // 3,6-dimethylcyclohexene: methyls on the two tips, the double bond on the back edge (corners 1 and 2)
  const made = (axial, equatorial) => {
    const doc = chairDoc({ axial, equatorial });
    const ring = [...doc.atoms.keys()].slice(0, 6);
    const back = [...doc.bonds.values()].find((b) => [b.a, b.b].sort().join() === [ring[1], ring[2]].sort().join());
    back.order = 2;
    return { doc, ring };
  };
  const smiles = ({ doc }) => {
    const mol = RDKit.get_mol(writeMolfile(doc).molfile);
    const out = mol.get_smiles();
    mol.delete();
    return out;
  };
  const both = made([], ['C', null, null, 'C']); // both equatorial (1,4: trans)
  const up = made(['C', null, null, 'C'], []); // both axial on the same corners: each on the other face
  const one = made(['C'], [null, null, null, 'C']); // one axial, one equatorial (cis)
  const [eq, ax, mixed] = [both, up, one].map(smiles);
  // (the mirror image: every @ the other way round)
  const mirror = (text) => {
    const mol = RDKit.get_mol(text.replace(/@@|@/g, (m) => (m === '@' ? '@@' : '@')));
    const out = mol.get_smiles();
    mol.delete();
    return out;
  };
  assert.ok(eq.includes('@') && mixed.includes('@'), `${eq} ${mixed}: R/S read`);
  assert.equal(mirror(eq), ax, 'both equatorial and both axial: the two trans enantiomers');
  assert.notEqual(eq, ax);
  assert.equal(mirror(mixed), mixed, 'one axial, one equatorial: cis, its own mirror image (meso)');
  assert.notEqual(mixed, eq);
  // (it isn't a chair to flip or turn: those still refuse it)
  assert.equal(ringFlip(both.doc, both.ring).error, 'bonds');
  assert.equal(chairTurn(both.doc, both.ring).error, 'bonds');
});

test('turning a chair a third of a turn: the same molecule and conformation, each ring atom two corners on; three turns as drawn', async () => {
  const { CHAIRS } = await import('../src/chem/chair.js');
  const { chairTurn, readChair } = await import('../src/chem/ringFlip.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const ringOf = (doc) => [...doc.atoms.keys()].slice(0, 6);
  const moved = (doc, at) => {
    const copy = structuredClone(doc);
    for (const [id, [x, y]] of at) Object.assign(copy.atoms.get(id), { x, y });
    return copy;
  };
  const smiles = (doc) => {
    const mol = RDKit.get_mol(writeMolfile(doc).molfile);
    const out = mol.get_smiles();
    mol.delete();
    return out;
  };
  // each group: axial or equatorial, and on a raised or lowered corner (its face)
  const slots = (doc, ring) => {
    const { fit, groups } = readChair(doc, ring);
    return groups.map((g) => `${g.first}${g.slot}${fit.up[g.corner]}`).sort().join();
  };
  const leftmost = (doc, ring) => [...ring].sort((p, q) => doc.atoms.get(p).x - doc.atoms.get(q).x)[0];
  for (const [name, make] of CHAIRS.filter(([n]) => /chair|Chair|Methyl/.test(n))) {
    for (const mirror of [1, -1]) {
      const doc = make();
      for (const a of doc.atoms.values()) [a.x, a.y] = [mirror * (a.x * Math.cos(0.3) - a.y * Math.sin(0.3)), a.x * Math.sin(0.3) + a.y * Math.cos(0.3)];
      const ring = ringOf(doc);
      const turned = chairTurn(doc, ring, 1);
      assert.ok(!turned.error, `${name}: turns`);
      const once = moved(doc, turned.at(1));
      assert.equal(slots(once, ring), slots(doc, ring), `${name}: every group as axial or equatorial, up or down, as before`);
      assert.equal(smiles(once), smiles(doc), `${name}: the same molecule`);
      assert.notEqual(leftmost(once, ring), leftmost(doc, ring), `${name}: another atom at the left tip`);
      // back the other way: as drawn; three turns one way: as drawn
      const back = moved(once, chairTurn(once, ring, -1).at(1));
      let thrice = once;
      for (let n = 0; n < 2; n++) thrice = moved(thrice, chairTurn(thrice, ring, 1).at(1));
      for (const a of doc.atoms.values()) {
        assert.ok(Math.hypot(a.x - back.atoms.get(a.id).x, a.y - back.atoms.get(a.id).y) < 1e-6, `${name}: turned back as drawn`);
        assert.ok(Math.hypot(a.x - thrice.atoms.get(a.id).x, a.y - thrice.atoms.get(a.id).y) < 1e-6, `${name}: three turns as drawn`);
      }
    }
  }
});

test('ring flip: template chairs only; axial ⇄ equatorial on the same face, each atom on its side; through a boat', async () => {
  const { chairDoc, boatDoc, CHAIRS } = await import('../src/chem/chair.js');
  const { ringFlip } = await import('../src/chem/ringFlip.js');
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const ringOf = (doc) => [...doc.atoms.keys()].slice(0, 6);
  const moved = (doc, at) => {
    const copy = structuredClone(doc);
    for (const [id, [x, y]] of at) Object.assign(copy.atoms.get(id), { x, y });
    return copy;
  };
  // each group's face (up: its first bond goes up the screen), and which ring atom is leftmost and rightmost
  const faces = (doc, ring) => [...doc.bonds.values()].filter((b) => ring.includes(b.a) !== ring.includes(b.b))
    .map((b) => (ring.includes(b.a) ? [b.a, b.b] : [b.b, b.a])).map(([r, g]) => `${r}${doc.atoms.get(g).y < doc.atoms.get(r).y ? '+' : '-'}`).sort().join();
  const tips = (doc, ring) => [...ring].sort((p, q) => doc.atoms.get(p).x - doc.atoms.get(q).x).filter((_, i) => i === 0 || i === 5).join();
  for (const [name, make] of CHAIRS.filter(([n]) => /chair|Chair|Methyl/.test(n))) {
    // also turned a little and mirrored: any turn, either chair
    for (const mirror of [1, -1]) {
      const doc = make();
      for (const a of doc.atoms.values()) [a.x, a.y] = [mirror * (a.x * Math.cos(0.3) - a.y * Math.sin(0.3)), a.x * Math.sin(0.3) + a.y * Math.cos(0.3)];
      const ring = ringOf(doc);
      const flip = ringFlip(doc, ring);
      assert.ok(!flip.error, `${name}: flips`);
      const after = moved(doc, flip.at(1));
      assert.equal(faces(after, ring), faces(doc, ring), `${name}: every group on its face`);
      assert.equal(tips(after, ring), tips(doc, ring), `${name}: the tips stay the tips`);
      const back = moved(after, ringFlip(after, ring).at(1));
      for (const a of doc.atoms.values()) assert.ok(Math.hypot(a.x - back.atoms.get(a.id).x, a.y - back.atoms.get(a.id).y) < 1e-9, `${name}: twice is as drawn`);
    }
  }
  // the methyl: axial (straight down) to equatorial, on the same carbon
  const methyl = chairDoc({ axial: [null, null, null, 'C'] });
  const ring = ringOf(methyl);
  const flipped = moved(methyl, ringFlip(methyl, ring).at(1));
  const [carbon, end] = [ring[3], [...methyl.atoms.keys()][6]];
  const slope = (doc) => Math.abs(doc.atoms.get(end).x - doc.atoms.get(carbon).x);
  assert.ok(slope(methyl) < 1e-9 && slope(flipped) > 0.5);
  // halfway: a boat with both tips below the edges, never a flat ring
  const plain = chairDoc();
  const plainFlip = ringFlip(plain, ringOf(plain));
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const at = plainFlip.at(t);
    const ys = ringOf(plain).map((id) => at.get(id)[1]);
    const edges = (ys[1] + ys[2] + ys[4] + ys[5]) / 4;
    assert.ok(Math.max(Math.abs(ys[0] - edges), Math.abs(ys[3] - edges)) > 0.3, `not flat at t = ${t.toFixed(2)}`);
    if (Math.abs(t - 0.5) < 0.01) assert.ok(ys[0] > edges && ys[3] > edges, 'a boat, both tips down');
  }
  // refused: a boat, a regular hexagon, a decalin, a double bond, two groups in one slot
  assert.equal(ringFlip(boatDoc(), ringOf(boatDoc())).error, 'shape');
  const hexagon = emptyDoc();
  const corners = Array.from({ length: 6 }, (_, i) => addAtom(hexagon, Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3)).id);
  corners.forEach((id, i) => addBond(hexagon, id, corners[(i + 1) % 6]));
  assert.equal(ringFlip(hexagon, corners).error, 'shape');
  const decalin = chairDoc();
  const [p, q] = ringOf(decalin).slice(1, 3).map((id) => decalin.atoms.get(id));
  let previous = p.id;
  for (let i = 0; i < 4; i++) previous = addBond(decalin, previous, addAtom(decalin, p.x + i * 0.4, p.y - 1 - (i % 2) * 0.5).id).b;
  addBond(decalin, previous, q.id);
  assert.equal(ringFlip(decalin, ringOf(decalin)).error, 'fused');
  const ene = chairDoc();
  [...ene.bonds.values()][0].order = 2;
  assert.equal(ringFlip(ene, ringOf(ene)).error, 'bonds');
  const crowded = chairDoc({ axial: [null, null, null, 'C'] });
  const c3 = crowded.atoms.get(ring[3]);
  addBond(crowded, c3.id, addAtom(crowded, c3.x + 0.05, c3.y + 0.9).id);
  assert.equal(ringFlip(crowded, ringOf(crowded)).error, 'crowded');
});

test('turned over a bond (Flip over a bond), a molecule stays the same stereoisomer: every single bond outside a ring, either side turning, its own wedge too where its narrow end turns (maltose stayed maltose, not cellobiose)', async () => {
  const { turnOver } = await import('../src/arrange/align.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { bondsByAtom, otherEnd } = await import('../src/model/doc.js');
  const { smallestRings } = await import('../src/model/graph.js');
  const smiles = (doc) => {
    const mol = RDKit.get_mol(writeMolfile(doc).molfile, JSON.stringify({ removeHs: true }));
    const out = mol.get_smiles();
    mol.delete();
    return out;
  };
  const side = (doc, bond, start) => {
    const byAtom = bondsByAtom(doc);
    const seen = new Set([start]);
    for (const stack = [start]; stack.length;) {
      const id = stack.pop();
      for (const next of byAtom.get(id)) {
        if (next === bond) continue;
        const to = otherEnd(next, id);
        if (!seen.has(to)) {
          seen.add(to);
          stack.push(to);
        }
      }
    }
    return [...seen];
  };
  for (const [name, input] of [
    ['maltose', 'C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@@H]2[C@H](OC([C@@H]([C@H]2O)O)O)CO)O)O)O)O'],
    ['cellobiose', 'C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O[C@@H]2[C@H](OC([C@@H]([C@H]2O)O)O)CO)O)O)O)O'],
    ['sucrose', 'C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@]2([C@H]([C@@H]([C@H](O2)CO)O)O)CO)O)O)O)O'],
    ['(R)-2-butanol', 'C[C@@H](O)CC'],
    ['an amino acid', 'N[C@@H](Cc1ccccc1)C(=O)O'],
    ['two centres apart', 'C[C@H](O)C(=O)[C@@H](N)CC'],
    ['an E alkene', 'C/C=C/C[C@H](C)O'],
  ]) {
    const mol = RDKit.get_mol(input);
    const doc = readMolfile(mol.get_molblock()).doc;
    mol.delete();
    const want = smiles(doc);
    const rings = smallestRings(doc);
    for (const bond of [...doc.bonds.values()]) {
      // (a ring bond can't turn; over a double bond the part turned is the other isomer, E for Z, as meant)
      if (rings.has(bond.id) || bond.order !== 1) continue;
      for (const start of [bond.a, bond.b]) {
        const copy = structuredClone(doc);
        const axle = copy.bonds.get(bond.id);
        turnOver(copy, axle, side(copy, axle, start));
        assert.equal(smiles(copy), want, `${name} turned over bond ${bond.id} (${bond.stereo || 'plain'}), the side of atom ${start}`);
      }
    }
  }
});

test('a flat ring drawn as a chair (the ring flip tool on a ring that isn\'t one): the drawn stereoisomer kept, the less crowded chair, groups whose side isn\'t said wavy only on a stereocentre; Haworth projections too; a cyclohexene refused', async () => {
  const { ringToChair } = await import('../src/chem/toChair.js');
  const { readChair } = await import('../src/chem/ringFlip.js');
  const { PROJECTIONS } = await import('../src/chem/projections.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { smallestRings } = await import('../src/model/graph.js');
  const smiles = (doc) => {
    const mol = RDKit.get_mol(writeMolfile(doc).molfile, JSON.stringify({ removeHs: true }));
    const out = mol.get_smiles();
    mol.delete();
    return out;
  };
  const sixRing = (doc) => [...smallestRings(doc).values()].find((r) => r.length === 6 && r.every((id) => doc.atoms.get(id).el !== 'c'));
  const chair = (doc) => {
    const ring = sixRing(doc);
    const made = ringToChair(RDKit, doc, ring);
    if (made.error) return made;
    const read = readChair(made.doc, ring);
    const name = (id) => made.doc.atoms.get(id).alias ?? made.doc.atoms.get(id).el;
    // the templates' chair: its left tip (the leftmost ring atom) raised, above the right one
    const p = ring.map((id) => made.doc.atoms.get(id));
    const raised = p.reduce((m, a) => (a.x < m.x ? a : m)).y < p.reduce((m, a) => (a.x > m.x ? a : m)).y;
    return { ...made, raised, same: smiles(made.doc) === smiles(doc), read: read.error ?? 'ok', slots: read.groups.map((g) => `${name(g.first)}${g.slot[0]}`).sort().join(' ') };
  };
  const fromSmiles = (s) => {
    const mol = RDKit.get_mol(s);
    const doc = readMolfile(mol.get_molblock()).doc;
    mol.delete();
    return doc;
  };
  for (const [name, input, slots, wavy] of [
    ['trans-1,2-dimethylcyclohexane: both equatorial', 'C[C@@H]1CCCC[C@H]1C', 'Ce Ce', 0],
    ['cis-1,2-dimethylcyclohexane: one axial', 'C[C@@H]1CCCC[C@@H]1C', 'Ca Ce', 0],
    ['β-D-glucose: all equatorial', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'Ce Oe Oe Oe Oe', 0],
    ['α-D-glucose: its anomeric OH axial', 'OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'Ce Oa Oe Oe Oe', 0],
    ['menthol: all equatorial', 'CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O', 'Ce Ce Oe', 0],
    ['methylcyclohexane: equatorial, no stereocentre', 'CC1CCCCC1', 'Ce', 0],
    ['1,2-dimethylcyclohexane, its sides not said: wavy', 'CC1CCCCC1C', 'Ce Ce', 2],
  ]) {
    // (RDKit's flat drawing turned whichever way it comes: the chair is always the templates', so the groups
    // are as said or all the other way round, the ring flip's)
    const got = chair(fromSmiles(input));
    const flipped = slots.split(' ').map((g) => g.slice(0, -1) + (g.endsWith('a') ? 'e' : 'a')).sort().join(' ');
    assert.ok(got.same && got.read === 'ok' && [slots, flipped].includes(got.slots) && got.wavy === wavy && got.raised, `${name}: ${JSON.stringify({ same: got.same, read: got.read, slots: got.slots, wavy: got.wavy, raised: got.raised, error: got.error })}`);
  }
  for (const [name, slots] of [['β-D-Glucose, Haworth', 'CH2OHe Oe Oe Oe Oe'], ['α-D-Glucose, Haworth', 'CH2OHe Oa Oe Oe Oe'], ['β-D-Galactose, Haworth', 'CH2OHe Oa Oe Oe Oe']]) {
    const got = chair(PROJECTIONS.find(([n]) => n === name)[1]());
    assert.ok(got.same && got.read === 'ok' && got.slots === slots && got.raised, `${name} as a chair: ${JSON.stringify({ same: got.same, read: got.read, slots: got.slots, raised: got.raised })}`);
  }
  assert.equal(chair(fromSmiles('C1=CCCCC1')).error, 'double', 'a cyclohexene: refused');
  // a ring atom's R/S drawn by a wedge on a ring bond (tramadol's C1, as J drew it): the wedge moved onto a group
  // of that atom (the R/S the same), then the chair, the molecule the same; no wedge elsewhere changed
  {
    const { bondsByAtom } = await import('../src/model/doc.js');
    const wedged = (b) => b.stereo === 'wedge' || b.stereo === 'hash';
    for (const [name, input, redrawn] of [
      ['tramadol', 'CN(C)C[C@@H]1CCCC[C@]1(O)c1cccc(OC)c1', false],
      // (the wedge of a stereocentre in a group drawn otherwise than RDKit would: it stays as drawn)
      ['a stereocentre in a group, drawn its own way', 'C[C@H](CC)C[C@@H]1CCCC[C@]1(O)c1ccccc1', true],
      // (C2's group is a stereocentre, so RDKit itself wedges a ring bond for C2: moved too)
      ['C2 wedged on a ring bond as well', 'C[C@@H](N(C)C)[C@@H]1CCCC[C@]1(O)c1ccccc1', true],
    ]) {
      const doc = fromSmiles(input);
      const want = smiles(doc);
      const ring = sixRing(doc);
      const byAtom = bondsByAtom(doc);
      const other = (b, id) => (b.a === id ? b.b : b.a);
      // the wedge of the stereocentre in the group put on another of its bonds, the R/S the same
      if (redrawn) {
        const centre = [...doc.atoms.values()].find((a) => !ring.includes(a.id) && byAtom.get(a.id).some((b) => b.a === a.id && wedged(b))).id;
        const was = byAtom.get(centre).find((b) => b.a === centre && wedged(b));
        const before = { id: was.id, stereo: was.stereo };
        let moved = false;
        for (const bond of byAtom.get(centre)) {
          for (const stereo of ['wedge', 'hash']) {
            if (moved || (bond.id === before.id && stereo === before.stereo)) continue;
            for (const b of byAtom.get(centre)) if (b.a === centre) b.stereo = '';
            Object.assign(bond, { a: centre, b: other(bond, centre), stereo });
            moved = smiles(doc) === want;
          }
        }
        if (!moved) Object.assign(doc.bonds.get(before.id), { stereo: before.stereo });
        assert.ok(moved && smiles(doc) === want, `${name}: its group's stereocentre drawn with another wedge`);
      }
      const c1 = ring.find((id) => byAtom.get(id).some((b) => doc.atoms.get(other(b, id)).el === 'O'));
      for (const b of byAtom.get(c1)) b.stereo = ''; // (C1's own wedges off)
      let found = null;
      for (const bond of byAtom.get(c1).filter((b) => ring.includes(other(b, c1)))) {
        for (const stereo of ['wedge', 'hash']) {
          Object.assign(bond, { a: c1, b: other(bond, c1), stereo });
          if (!found && smiles(doc) === want) found = { bond, stereo };
          bond.stereo = '';
        }
      }
      assert.ok(found, `${name}: a ring bond whose wedge draws C1 as it is`);
      found.bond.stereo = found.stereo;
      assert.equal(smiles(doc), want, `${name} with C1 wedged on a ring bond`);
      // the wedges not on a bond of a ring atom: as drawn
      const away = (d) => [...d.bonds.values()].filter((b) => !ring.includes(b.a) && !ring.includes(b.b)).map((b) => `${b.id}:${b.a}:${b.stereo}`).join();
      const got = chair(doc);
      assert.ok(!got.error && got.same && got.read === 'ok', `${name}, C1 wedged on a ring bond: a chair, the same molecule (${JSON.stringify({ error: got.error, same: got.same, read: got.read, slots: got.slots })})`);
      const wedgedRing = [...got.doc.bonds.values()].filter((b) => ring.includes(b.a) && ring.includes(b.b) && wedged(b));
      assert.equal(wedgedRing.length, 0, `${name}: no wedge left on the ring`);
      assert.equal(away(got.doc), away(doc), `${name}: the other wedges as drawn`);
    }
  }
  // bromocyclohexane with the H on C1 and C2 drawn (two on C2, none on C6): C1 is no stereocentre, so nothing wavy
  const drawnH = fromSmiles('BrC1CCCCC1');
  {
    const { addAtom, addBond, bondsByAtom } = await import('../src/model/doc.js');
    const byAtom = bondsByAtom(drawnH);
    const br = [...drawnH.atoms.values()].find((a) => a.el === 'Br');
    const c1 = byAtom.get(br.id).map((b) => (b.a === br.id ? b.b : b.a))[0];
    const c2 = byAtom.get(c1).map((b) => (b.a === c1 ? b.b : b.a)).find((id) => id !== br.id);
    const at = (id, dx, dy) => { const a = drawnH.atoms.get(id); return addAtom(drawnH, a.x + dx, a.y + dy, 'H').id; };
    addBond(drawnH, c1, at(c1, 0.3, -0.9));
    addBond(drawnH, c2, at(c2, 0.9, 0.3));
    addBond(drawnH, c2, at(c2, -0.2, 0.95));
  }
  const withH = chair(drawnH);
  assert.ok(withH.same && withH.read === 'ok' && withH.wavy === 0, `bromocyclohexane with drawn H: no wavy bond (${JSON.stringify({ same: withH.same, read: withH.read, wavy: withH.wavy, slots: withH.slots })})`);

  // two isomers drawn alike come out alike: each ring atom on the chair's corner where it stood round the flat
  // ring (menthyl and neomenthyl chloride, as J drew them: iPr on the left tip, Cl below it, CH3 on the right
  // tip), the ring drawn tips left and right, a tip up, tilted; both the templates' chair (its left tip raised),
  // not each its more stable one: drawn tips left and right, the first with its iPr and Cl axial, the other all
  // equatorial
  const flat = (turn, groups) => {
    const doc = emptyDoc();
    const at = (a, r) => [r * Math.cos(((a + turn) * Math.PI) / 180), -r * Math.sin(((a + turn) * Math.PI) / 180)];
    const ring = [0, 60, 120, 180, 240, 300].map((a) => addAtom(doc, ...at(a, 1)).id);
    ring.forEach((id, k) => addBond(doc, id, ring[(k + 1) % 6]));
    for (const [a, el, stereo] of groups) {
      const first = addAtom(doc, ...at(a, 2), el);
      addBond(doc, ring[a / 60], first.id, 1, { stereo });
      if (a === 180) for (const dy of [-0.6, 0.6]) addBond(doc, first.id, addAtom(doc, first.x - 0.8, first.y + dy).id);
    }
    return { doc, ring };
  };
  // the corner each ring atom is on: the tips leftmost and rightmost; the back edge from the left tip's
  // neighbour higher up the page
  const corners = (doc, ring) => {
    const p = ring.map((id) => doc.atoms.get(id));
    const left = p.indexOf(p.reduce((m, a) => (a.x < m.x ? a : m)));
    const right = p.indexOf(p.reduce((m, a) => (a.x > m.x ? a : m)));
    const way = p[(left + 1) % 6].y < p[(left + 5) % 6].y ? 1 : 5; // (the back edge: left + way, left + 2 way)
    return ring.map((_, k) => (k === left ? 'left tip' : k === right ? 'right tip' : [(left + way) % 6, (left + 2 * way) % 6].includes(k) ? 'back' : 'front'));
  };
  for (const turn of [0, 30, -30, 12]) {
    const got = [[[180, 'C', 'wedge'], [240, 'Cl', 'wedge'], [0, 'C', 'hash']], [[180, 'C', 'hash'], [240, 'Cl', 'wedge'], [0, 'C', 'wedge']]].map((groups) => {
      const { doc, ring } = flat(turn, groups);
      const made = ringToChair(RDKit, doc, ring);
      const p = ring.map((id) => made.doc.atoms.get(id));
      const raised = p.reduce((m, a) => (a.x < m.x ? a : m)).y < p.reduce((m, a) => (a.x > m.x ? a : m)).y;
      return { where: corners(made.doc, ring).join(), raised, slots: readChair(made.doc, ring).groups.map((g) => g.slot[0]).sort().join(''), same: smiles(made.doc) === smiles(doc) };
    });
    assert.ok(got[0].where === got[1].where && got.every((g) => g.same && g.raised) && (turn !== 0 || (got[0].slots === 'aae' && got[1].slots === 'eee')),
      `menthyl and neomenthyl chloride, the ring turned ${turn}°: on the same corners (${JSON.stringify(got)})`);
  }
});

test('two chairs in one molecule keep their R/S: two β-D-glucose chairs joined through an O (a disaccharide)', async () => {
  const { chairDoc } = await import('../src/chem/chair.js');
  const { chairModel, chairStereo } = await import('../src/chem/ringFlip.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { smallestRings } = await import('../src/model/graph.js');
  const { copyObjects, deleteObjects, bondsByAtom } = await import('../src/model/doc.js');
  const sugar = { ring: ['C', 'C', 'O', 'C', 'C', 'C'], equatorial: ['O', ['C', 'O'], null, 'O', 'O', 'O'], scale: 1.6 };
  const doc = chairDoc(sugar);
  const one = chairDoc(sugar);
  // (ring atoms first: C4, C5, O5, C1, C2, C3; C1's O and C4's O are found by their bonds)
  const ringIds = (d, from) => [...d.atoms.keys()].slice(from, from + 6);
  const groupO = (d, ring, k) => { const c = ring[k]; return [...d.bonds.values()].map((b) => (b.a === c ? b.b : b.b === c ? b.a : null)).find((n) => n !== null && !ring.includes(n) && d.atoms.get(n).el === 'O'); };
  const first = ringIds(doc, 0);
  const anomericO = groupO(doc, first, 3);
  // the second chair placed so that its C4's O lands on the first chair's anomeric O, then bonded through it
  const second = ringIds(one, 0);
  const o4 = groupO(one, second, 0);
  const [dx, dy] = [doc.atoms.get(anomericO).x - one.atoms.get(o4).x, doc.atoms.get(anomericO).y - one.atoms.get(o4).y];
  const before = new Set(doc.atoms.keys());
  const made = copyObjects(one, [...one.atoms.keys(), ...one.bonds.keys()], dx, dy, doc);
  const map = new Map([...one.atoms.keys()].map((id, k) => [id, made[k]])); // (the atoms copied first, in order)
  const c4 = map.get(second[0]);
  deleteObjects(doc, [map.get(o4)]);
  addBond(doc, c4, anomericO);
  const chirals = (molfile) => {
    const mol = RDKit.get_mol(molfile, JSON.stringify({ removeHs: true }));
    const s = mol.get_smiles();
    mol.delete();
    return (s.match(/@+/g) ?? []).length;
  };
  const byAtom = bondsByAtom(doc);
  const rings = [...smallestRings(doc, byAtom).values()];
  const { chairs } = chairModel(doc, null, byAtom, rings);
  const wedges = chairStereo(doc, rings, byAtom);
  const onFirst = [...wedges.values()].filter((w) => first.includes(w.from) && !w.hydrogens).length;
  const onSecond = [...wedges.values()].filter((w) => [...map.values()].includes(w.from) && !w.hydrogens).length;
  assert.equal(chairs.length, 2, 'both chairs read');
  assert.equal(onFirst, 5, 'the first chair keeps its five stereocentres');
  assert.equal(onSecond, 5, 'and the second its five');
  assert.equal(chirals(writeMolfile(doc).molfile), 10, 'ten stereocentres in the molecule written');
  assert.ok(before.size > 0);
});

test('a chair is read as the molecule it shows: α- and β-D-glucose, cis and trans; kept by a ring flip, a turn and top to bottom, left to right the enantiomer', async () => {
  const { chairDoc } = await import('../src/chem/chair.js');
  const { ringFlip } = await import('../src/chem/ringFlip.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const smiles = (doc, options = {}) => {
    const mol = RDKit.get_mol(writeMolfile(doc, null, '', options).molfile, JSON.stringify({ removeHs: true }));
    const s = mol.get_smiles();
    mol.delete();
    return s;
  };
  const can = (s) => smiles(readMolfile(RDKit.get_mol(s).get_molblock()).doc);
  const changed = (doc, change) => {
    const copy = structuredClone(doc);
    for (const a of copy.atoms.values()) change(a);
    return copy;
  };
  const flipped = (doc) => {
    const copy = structuredClone(doc);
    for (const [id, [x, y]] of ringFlip(doc, [...doc.atoms.keys()].slice(0, 6)).at(1)) Object.assign(copy.atoms.get(id), { x, y });
    return copy;
  };
  const sugar = ['C', 'C', 'O', 'C', 'C', 'C'];
  assert.equal(smiles(chairDoc({ ring: sugar, equatorial: ['O', ['C', 'O'], null, 'O', 'O', 'O'] })), can('OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O'), 'β-D-glucose');
  assert.equal(smiles(chairDoc({ ring: sugar, axial: [null, null, null, 'O'], equatorial: ['O', ['C', 'O'], null, null, 'O', 'O'] })), can('OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O'), 'α-D-glucose');
  // trans-1,2-dibromocyclohexane diaxial and diequatorial: chiral, the same compound in either chair; cis: meso
  const enantiomer = (s) => can(s.replaceAll('@@', '!').replaceAll('@', '@@').replaceAll('!', '@'));
  const diaxial = smiles(chairDoc({ axial: ['Br', 'Br'] }));
  assert.notEqual(diaxial, enantiomer(diaxial), 'trans: chiral');
  assert.equal(smiles(flipped(chairDoc({ axial: ['Br', 'Br'] }))), diaxial, 'trans: diequatorial after the flip');
  const cis = smiles(chairDoc({ axial: ['Br'], equatorial: [null, 'Br'] }));
  assert.equal(cis, enantiomer(cis), 'cis: meso');
  // CH2 with its hydrogens drawn: no wedges, unless the axial H is to be told apart (sided)
  const withH = chairDoc({ axial: Array(6).fill('H'), equatorial: Array(6).fill('H') });
  assert.ok(!/^\s*\d+\s+\d+\s+1\s+[16]\s*$/m.test(writeMolfile(withH).molfile), 'no wedges on CH2');
  assert.ok(/ISO/.test(writeMolfile(withH, null, '', { sided: true }).molfile), 'sided: the axial H told apart');
  // random chairs
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const groups = [null, 'Br', 'C', 'O'];
  for (let n = 0; n < 60; n++) {
    const axial = Array.from({ length: 6 }, () => groups[Math.floor(random() * 4)]);
    const equatorial = Array.from({ length: 6 }, () => (random() < 0.3 ? groups[Math.floor(random() * 4)] : null));
    const doc = chairDoc({ axial, equatorial, flip: random() < 0.5 });
    const s = smiles(doc);
    const what = JSON.stringify({ axial, equatorial });
    assert.equal(smiles(flipped(doc)), s, `${what}: kept by a ring flip`);
    assert.equal(smiles(changed(doc, (a) => ([a.x, a.y] = [a.x * Math.cos(0.5) - a.y * Math.sin(0.5), a.x * Math.sin(0.5) + a.y * Math.cos(0.5)]))), s, `${what}: turned`);
    assert.equal(smiles(changed(doc, (a) => (a.y = -a.y))), s, `${what}: top to bottom, the same chair turned over`);
    assert.equal(smiles(changed(doc, (a) => (a.x = -a.x))), enantiomer(s), `${what}: left to right, the mirror image`);
  }
});

test('a clean-up that moves a chair\'s atoms keeps its R/S (keepHandedness); a Newman projection seen from its other end in 3D has the nearer carbon in front', async () => {
  const { chairDoc } = await import('../src/chem/chair.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { keepHandedness } = await import('../src/layout/molfile.js');
  const { newmanDoc, nearerInFront } = await import('../src/chem/newman.js');
  const smiles = (molfile) => {
    const mol = RDKit.get_mol(molfile, JSON.stringify({ removeHs: true }));
    const s = mol.get_smiles();
    mol.delete();
    return s;
  };
  // β-D-glucose's chair, its ring evened out into a regular hexagon (as a clean-up does), each group moved with
  // its ring atom, the wedges as they were
  const before = writeMolfile(chairDoc({ ring: ['C', 'C', 'O', 'C', 'C', 'C'], equatorial: ['O', ['C', 'O'], null, 'O', 'O', 'O'] })).molfile;
  const lines = before.split('\n');
  const n = Number(lines[3].slice(0, 3));
  const at = lines.slice(4, 4 + n).map((l) => [Number(l.slice(0, 10)), Number(l.slice(10, 20))]);
  const centre = [0, 1].map((k) => at.slice(0, 6).reduce((s, p) => s + p[k], 0) / 6);
  const radius = Math.hypot(at[0][0] - at[1][0], at[0][1] - at[1][1]);
  const start = Math.atan2(at[0][1] - centre[1], at[0][0] - centre[0]);
  const way = Math.sign((at[1][0] - centre[0]) * (at[0][1] - centre[1]) - (at[1][1] - centre[1]) * (at[0][0] - centre[0])) || 1;
  const moved = at.map((p) => [...p]);
  for (let k = 0; k < 6; k++) moved[k] = [centre[0] + radius * Math.cos(start - way * k * Math.PI / 3), centre[1] + radius * Math.sin(start - way * k * Math.PI / 3)];
  const bonds = lines.slice(4 + n).filter((l) => /^\s*\d+\s+\d+\s+\d/.test(l) && !l.startsWith('M')).map((l) => [Number(l.slice(0, 3)) - 1, Number(l.slice(3, 6)) - 1]);
  // groups: every atom past the ring, carried by its ring atom's shift (by the first ring atom reached)
  const shift = moved.slice(0, 6).map((p, k) => [p[0] - at[k][0], p[1] - at[k][1]]);
  const owner = new Array(n).fill(-1);
  for (let k = 0; k < 6; k++) owner[k] = k;
  for (let changed = true; changed;) {
    changed = false;
    for (const [a, b] of bonds) {
      if (owner[a] >= 0 && owner[b] < 0) [owner[b], changed] = [owner[a], true];
      else if (owner[b] >= 0 && owner[a] < 0) [owner[a], changed] = [owner[b], true];
    }
  }
  for (let k = 6; k < n; k++) moved[k] = [at[k][0] + shift[owner[k]][0], at[k][1] + shift[owner[k]][1]];
  const after = [...lines.slice(0, 4), ...lines.slice(4, 4 + n).map((l, k) => `${moved[k][0].toFixed(4).padStart(10)}${moved[k][1].toFixed(4).padStart(10)}${l.slice(20)}`), ...lines.slice(4 + n)].join('\n');
  assert.notEqual(smiles(after), smiles(before), 'the wedges as they were read another sugar on the hexagon');
  assert.equal(smiles(keepHandedness(before, after)), smiles(before), 'β-D-glucose kept');
  // a Newman projection turned in 3D so that its back carbon is nearer: that one in front now
  const doc = newmanDoc(['CH3', 'H', 'H'], ['CH3', 'H', 'H'], 180);
  const axle = [...doc.bonds.values()].find((b) => b.newman);
  const [front, back] = [axle.a, axle.b];
  nearerInFront(doc, [axle.id], (id) => (id === back ? 1 : 0));
  assert.deepEqual([axle.a, axle.b], [back, front]);
  nearerInFront(doc, [axle.id], (id) => (id === back ? 1 : 0));
  assert.deepEqual([axle.a, axle.b], [back, front], 'already so: unchanged');
});

test('ring flip of cyclohexane seen along two bonds: the projections stay, C3 and C6 change sides, axial ⇄ equatorial, the same compound; twice is as drawn', async () => {
  const { cyclohexaneNewmanDoc } = await import('../src/chem/newman.js');
  const { ringFlip } = await import('../src/chem/ringFlip.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const smiles = (doc) => {
    const mol = RDKit.get_mol(writeMolfile(doc).molfile, JSON.stringify({ removeHs: true }));
    const s = mol.get_smiles();
    mol.delete();
    return s;
  };
  const moved = (doc, at) => {
    const copy = structuredClone(doc);
    for (const [id, [x, y]] of at) Object.assign(copy.atoms.get(id), { x, y });
    return copy;
  };
  const ringOf = (doc) => [...doc.atoms.keys()].slice(0, 6);
  // a group's bond straight up or down (axial) in the drawing's own frame (`turn` undone)
  const axial = (doc, el, turn) => {
    const atom = [...doc.atoms.values()].find((a) => a.el === el);
    const bond = [...doc.bonds.values()].find((b) => b.a === atom.id || b.b === atom.id);
    const on = doc.atoms.get(bond.a === atom.id ? bond.b : bond.a);
    const angle = Math.atan2(atom.y - on.y, atom.x - on.x) - turn;
    return Math.abs(Math.cos(angle)) < 0.05;
  };
  for (const [name, change, turn] of [['as drawn', () => {}, 0], ['mirrored', (a) => (a.x = -a.x), 0], ['upside down', (a) => (a.y = -a.y), 0], ['turned', (a) => ([a.x, a.y] = [a.x * Math.cos(0.6) - a.y * Math.sin(0.6), a.x * Math.sin(0.6) + a.y * Math.cos(0.6)]), 0.6]]) {
    const doc = cyclohexaneNewmanDoc({ axial: ['Br', 'Cl'] }); // trans-1-bromo-2-chloro, diaxial
    for (const a of doc.atoms.values()) change(a);
    const ring = ringOf(doc);
    const flip = ringFlip(doc, ring);
    assert.ok(!flip.error, `${name}: flips`);
    const after = moved(doc, flip.at(1));
    assert.equal(smiles(after), smiles(doc), `${name}: the same compound`);
    assert.ok(smiles(doc).includes('@'), 'trans: R/S');
    assert.ok(axial(doc, 'Br', turn) && axial(doc, 'Cl', turn) && !axial(after, 'Br', turn) && !axial(after, 'Cl', turn), `${name}: diaxial to diequatorial`);
    // the projections where they were; C3 and C6 elsewhere
    for (const k of [0, 1, 3, 4]) assert.ok(Math.hypot(after.atoms.get(ring[k]).x - doc.atoms.get(ring[k]).x, after.atoms.get(ring[k]).y - doc.atoms.get(ring[k]).y) < 1e-9, `${name}: C${k + 1} stays`);
    for (const k of [2, 5]) assert.ok(Math.hypot(after.atoms.get(ring[k]).x - doc.atoms.get(ring[k]).x, after.atoms.get(ring[k]).y - doc.atoms.get(ring[k]).y) > 0.5, `${name}: C${k + 1} moves`);
    const back = moved(after, ringFlip(after, ring).at(1));
    for (const a of doc.atoms.values()) assert.ok(Math.hypot(a.x - back.atoms.get(a.id).x, a.y - back.atoms.get(a.id).y) < 1e-6, `${name}: twice is as drawn`);
  }
  // a group on C3: refused
  const bridged = cyclohexaneNewmanDoc();
  const c3 = bridged.atoms.get(ringOf(bridged)[2]);
  addBond(bridged, c3.id, addAtom(bridged, c3.x, c3.y - 1, 'C').id);
  assert.equal(ringFlip(bridged, ringOf(bridged)).error, 'bridge');
});

test('Newman projections\' groups and dihedral: Ac and Ts typed are acetyl and tosyl; the dihedral read by the largest groups as the back turns; a group replaced leaves nothing behind; an orbital on a carbon turns with its molecule', async () => {
  const { dihedralOf, endOnBonds, newmanDoc, replaceGroup, setDihedral, turnBack } = await import('../src/chem/newman.js');
  const { addOrbital, orbitalAngle, setOrbitalAngle } = await import('../src/model/doc.js');
  // abbreviations before elements, as the panel's Element field reads them
  for (const label of ['Ac', 'Ts']) {
    const doc = newmanDoc([label, 'H', 'H'], ['H', 'H', 'H'], 60);
    const atom = [...doc.atoms.values()].find((a) => a.alias === label || a.el === label);
    assert.ok(atom && atom.el === '*' && atom.alias === label, `${label}: a label, not an element (${atom?.el})`);
  }
  // [Br, CH3, H] front and back: turned 60° at a time, the dihedral goes round evenly; set, it is what was asked
  const doc = newmanDoc(['Br', 'CH3', 'H'], ['Br', 'CH3', 'H'], 60);
  const [axle] = endOnBonds(doc);
  const read = [dihedralOf(doc, axle)];
  for (let k = 0; k < 5; k++) {
    turnBack(doc, axle, 60);
    read.push(dihedralOf(doc, axle));
  }
  assert.ok(read.every((d, k) => k === 0 || (d - read[k - 1] + 360) % 360 === 60), `turned 60° each time: ${read.join(' ')}`);
  for (const wanted of [0, 60, 120, 180, 240, 300]) {
    setDihedral(doc, axle, wanted);
    assert.equal(dihedralOf(doc, axle), wanted, `set to ${wanted}`);
  }
  // a group replaced: an orbital on it goes, one on its carbon measured from it keeps its direction
  const ol = newmanDoc(['OH', 'H', 'H'], ['H', 'H', 'H'], 60);
  const [bond] = endOnBonds(ol);
  const o = [...ol.atoms.values()].find((a) => a.el === 'O').id;
  const onO = addOrbital(ol, o);
  const onC = addOrbital(ol, bond.a);
  setOrbitalAngle(ol, onC, 1);
  setOrbitalAngle(ol, onO, 2);
  replaceGroup(ol, bond, o, 'Cl');
  assert.ok(!ol.orbitals.has(onO.id), 'the orbital on the O gone with it');
  assert.ok(Math.abs(orbitalAngle(ol, ol.orbitals.get(onC.id)) - 1) < 1e-9, 'the carbon\'s orbital points as before');
  // an orbital on the front carbon is measured from a group, not from the back carbon on the same point:
  // the whole projection turned a quarter, it turns with it
  const turned = newmanDoc(['CH3', 'H', 'H'], ['CH3', 'H', 'H'], 180);
  const [t2] = endOnBonds(turned);
  const p = addOrbital(turned, t2.a);
  setOrbitalAngle(turned, p, 0.3);
  for (const atom of turned.atoms.values()) [atom.x, atom.y] = [-atom.y, atom.x];
  const now = orbitalAngle(turned, p);
  assert.ok(Math.abs(Math.atan2(Math.sin(now - 0.3 - Math.PI / 2), Math.cos(now - 0.3 - Math.PI / 2))) < 1e-9, `turned with it (${now.toFixed(3)})`);
  // methylamine seen along C–N, the N in front: labelled where the point was; the carbons not
  const amine = newmanDoc(['H', 'H', ''], ['H', 'H', 'H'], 60);
  const [n] = endOnBonds(amine);
  amine.atoms.get(n.a).el = 'N';
  const scene = buildScene(amine);
  assert.ok(scene.atoms.get(n.a).label, 'the N in front labelled');
  assert.ok(!scene.atoms.get(n.b).label, 'the carbon at the back the circle');
});

test('Newman projections: the stereoisomer they show, kept when the back turns; cyclohexane diaxial is trans; files get a plain drawing', async () => {
  const { cyclohexaneNewmanDoc, dihedralOf, endOnBonds, newmanDoc, plainNewmans, setDihedral, turnBack } = await import('../src/chem/newman.js');
  const { writeMolfile, parseMolfile } = await import('../src/io/molfile.js');
  const { readMol } = await import('../src/io/readMol.js');
  const { fragments } = await import('../src/model/graph.js');
  const smiles = (doc) => {
    const mol = RDKit.get_mol(writeMolfile(doc).molfile, JSON.stringify({ removeHs: true }));
    const s = mol.get_smiles();
    mol.delete();
    return s;
  };
  const canonical = (text) => {
    const mol = RDKit.get_mol(text);
    const s = mol.get_smiles();
    mol.delete();
    return s;
  };
  const mirror = (text) => text.replace(/@@|@/g, (x) => (x === '@@' ? '@' : '@@'));
  // 2,3-dibromobutane, anti: the same groups in the same order front and back is the meso form
  const meso = newmanDoc(['Br', 'CH3', 'H'], ['Br', 'CH3', 'H'], 180);
  assert.equal(canonical(smiles(meso)), canonical(mirror(smiles(meso))), 'meso');
  const chiral = newmanDoc(['Br', 'CH3', 'H'], ['Br', 'H', 'CH3'], 180);
  assert.notEqual(canonical(smiles(chiral)), canonical(mirror(smiles(chiral))), 'chiral');
  // turning the back, or setting the dihedral, changes the conformation only
  for (const degrees of [60, 120, 180]) {
    const turned = structuredClone(chiral);
    assert.ok(turnBack(turned, endOnBonds(turned)[0], degrees));
    assert.equal(smiles(turned), smiles(chiral));
  }
  const butane = newmanDoc(['CH3', 'H', 'H'], ['CH3', 'H', 'H'], 180);
  assert.equal(dihedralOf(butane, endOnBonds(butane)[0]), 180);
  for (const d of [0, 60, 120]) {
    setDihedral(butane, endOnBonds(butane)[0], d);
    assert.equal(dihedralOf(butane, endOnBonds(butane)[0]), d);
  }
  // (R)-2-bromobutane, worked out by hand: Br up, CH3 lower right, H lower left in front, the ethyl behind
  const bromobutane = newmanDoc(['Br', 'CH3', 'H'], ['H', 'H', 'CH3'], 60);
  assert.equal(canonical(smiles(bromobutane)), canonical('CC[C@@H](C)Br'));
  // cyclohexane: two neighbouring axial groups are trans, an axial and an equatorial one cis
  const diaxial = cyclohexaneNewmanDoc({ axial: ['Br', 'CH3'] });
  const axialEquatorial = cyclohexaneNewmanDoc({ axial: ['Br'], equatorial: [undefined, 'CH3'] });
  const cisLike = (doc) => {
    const methyl = smiles(doc).replace('Br', 'C');
    return canonical(methyl) === canonical(mirror(methyl)); // cis-1,2-dimethylcyclohexane is meso
  };
  assert.equal(cisLike(diaxial), false, 'diaxial: trans');
  assert.equal(cisLike(axialEquatorial), true, 'axial and equatorial: cis');
  assert.equal(endOnBonds(diaxial).length, 2);
  // for a 3D builder: the drawn hydrogens of a CH2 with a wedge told apart (²H, ³H), so its wedge counts
  const sided = writeMolfile(diaxial, null, '', { sided: true }).molfile;
  assert.match(sided, /^M {2}ISO/m);
  assert.doesNotMatch(writeMolfile(diaxial).molfile, /^M {2}ISO/m);
  // for other programs: drawn plainly, no two atoms on one point, the same stereoisomer
  const plain = plainNewmans(chiral, { RDKit, writeMolfile, readMol, parseMolfile, fragments });
  assert.equal(endOnBonds(plain).length, 0);
  const atoms = [...plain.atoms.values()];
  assert.ok(atoms.every((p, i) => atoms.every((q, j) => i === j || Math.hypot(p.x - q.x, p.y - q.y) > 0.3)));
  assert.equal(smiles(plain), smiles(chiral));
});

test('bonds from a 3D view that cross: the one behind is broken where the one in front goes over it', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const doc = emptyDoc();
  const [a, b, c, d] = [[0, 0], [2, 0], [1, -1], [1, 1]].map(([x, y]) => addAtom(doc, x, y, 'C').id);
  const back = addBond(doc, a, b, 1, { z: -0.5 });
  const front = addBond(doc, c, d, 1, { z: 0.5 });
  const scene = buildScene(doc);
  assert.equal(scene.bonds.get(back.id).shapes.lines.length, 2, 'the one behind in two pieces');
  assert.equal(scene.bonds.get(front.id).shapes.lines.length, 1, 'the one in front whole');
  const [left, right] = scene.bonds.get(back.id).shapes.lines;
  assert.ok(left[2] < 0.9 && right[0] > 1.1, 'a gap round the crossing');
  // a thick bond in front (between the wide ends of two wedges) and a wedge near its wide end: the gap
  // clear of their edges, not hidden under them
  const { STYLE } = await import('../src/render/style.js');
  const half = STYLE.wedgeWidth / 2;
  const thick = emptyDoc();
  const [r, t, e, f, top, bottom] = [[0.5, 1], [1.5, 1], [0, 2], [2, 2], [1, 2.2], [1, -0.2]].map(([x, y]) => addAtom(thick, x, y, 'C').id);
  addBond(thick, e, r, 1, { stereo: 'wedge', z: 0.5 });
  addBond(thick, f, t, 1, { stereo: 'wedge', z: 0.5 });
  addBond(thick, r, t, 1, { z: 0.5 });
  const under = addBond(thick, top, bottom, 1, { z: -0.5 });
  const [upper, lower] = buildScene(thick).bonds.get(under.id).shapes.lines;
  assert.ok(Math.min(upper[1], upper[3]) > 1 + half + 0.05 && Math.max(lower[1], lower[3]) < 1 - half - 0.05,
    `a thick bond in front: the gap clear of it (${JSON.stringify([upper, lower].map((x) => x.map((v) => +v.toFixed(3))))})`);
  const wedged = emptyDoc();
  const [w1, w2, w3, w4] = [[0, 0], [2, 0], [1, -3], [1, 0.3]].map(([x, y]) => addAtom(wedged, x, y, 'C').id);
  const behind = addBond(wedged, w1, w2, 1, { z: -0.5 });
  addBond(wedged, w3, w4, 1, { stereo: 'wedge', z: 0.5 });
  const [l, m] = buildScene(wedged).bonds.get(behind.id).shapes.lines;
  const width = half * (3 / 3.3);
  assert.ok(l[2] < 1 - width - 0.05 && m[0] > 1 + width + 0.05, `a wedge in front: the gap clear of it (${l[2].toFixed(3)}, ${m[0].toFixed(3)})`);
  delete doc.bonds.get(back.id).z;
  assert.equal(buildScene(doc).bonds.get(back.id).shapes.lines.length, 1, 'without depths: drawn as before');
});

test('brackets made round atoms keep fitting them: smaller when one goes, larger when one is drawn on, an older molecule bonded on stays out', async () => {
  const { addAtom, addBond, addBracket, emptyDoc, deleteObjects } = await import('../src/model/doc.js');
  const { bracketBox, bracketFits } = await import('../src/render/scene.js');
  const doc = emptyDoc();
  const chain = [0, 1, 2].map((x) => addAtom(doc, x, 0, 'C').id);
  addBond(doc, chain[0], chain[1]); addBond(doc, chain[1], chain[2]);
  const older = addAtom(doc, 9, 0, 'C').id; // another molecule, there before the brackets
  const box = bracketBox(doc, buildScene(doc), chain);
  const bracket = addBracket(doc, box.x1, box.y1, box.x2, box.y2, { atoms: [...chain] });
  const fit = () => {
    for (const [id, b] of bracketFits(doc, buildScene(doc))) Object.assign(doc.brackets.get(id), b);
    return doc.brackets.get(bracket.id);
  };
  assert.equal(bracketFits(doc, buildScene(doc)).length, 0, 'fits as made');
  const right = fit().x2;
  deleteObjects(doc, [chain[2]]);
  assert.ok(fit().x2 < right - 0.5, 'an atom deleted: smaller');
  const drawn = addAtom(doc, 1.5, 1, 'O').id; // drawn on later
  addBond(doc, chain[1], drawn);
  assert.ok(fit().y2 > 0.9, 'an atom drawn on: larger');
  addBond(doc, drawn, older);
  assert.ok(fit().x2 < 6, 'the older molecule bonded on stays outside (the brackets reach the middle of the bond that leaves them, not round it)');
  deleteObjects(doc, [chain[0], chain[1]]);
  assert.ok(doc.brackets.has(bracket.id), 'still round the atom drawn on');
  deleteObjects(doc, [drawn]);
  assert.ok(!doc.brackets.has(bracket.id), 'all its atoms gone: gone too');
});

test('a count beside a molecule is level with its atoms, not with a charge or written hydrogens (4 Cl⁻, 6 H2O)', () => {
  const doc = emptyDoc();
  const cl = addAtom(doc, 0, 0, 'Cl', { charge: -1, lonePairs: 'auto' });
  const four = addText(doc, 0, 0, '4', { anchor: cl.id, slot: 'left' });
  const o = addAtom(doc, 5, 0, 'O');
  const six = addText(doc, 0, 0, '6', { anchor: o.id, slot: 'left' });
  const scene = buildScene(doc);
  const capital = CAP_HEIGHT * STYLE.textFont;
  for (const [text, atom] of [[four, cl], [six, o]]) {
    const placed = scene.texts.get(text.id);
    assert.ok(Math.abs(placed.at[1] - capital / 2 - atom.y) < 1e-9, `${text.text}: the middle of its digit level with the ${atom.el}`);
    assert.ok(placed.box.x2 < atom.x - 0.2, 'to its left');
  }
});

test('a superscript right after a subscript stands over it (CO₃²⁻); bold and italic runs drawn so', async () => {
  const { sceneToSVG } = await import('../src/render/svg.js');
  const doc = emptyDoc();
  const text = addText(doc, 0, 0, 'CO_{3}^{2−} *{a} ~{b}');
  const [line] = buildScene(doc).texts.get(text.id).lines;
  const [, sub, sup, , bold, , italic] = line.runs;
  assert.equal(sub.text, '3');
  assert.equal(sup.x, sub.x, 'the charge over the 3');
  assert.ok(bold.bold && !bold.italic && italic.italic && !italic.bold);
  assert.match(sceneToSVG(buildScene(doc)), /font-style="italic"/);
});

test('side arcs of a reaction arrow (NAD⁺ → NADH): meeting at its middle, either side of its own stack only when it is on their side; the arrow long enough; stacks at their free ends', async () => {
  const { addArrow } = await import('../src/model/doc.js');
  const fitted = (doc) => {
    for (let k = 0; k < 3; k++) {
      const scene = buildScene(doc);
      for (const [id, ends] of scene.arrowFits) Object.assign(doc.arrows.get(id), ends);
    }
    return buildScene(doc);
  };
  // a swoop above, a text in the arrow's stack below: the arcs meet at the middle
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 1, 0, 'forward', { sides: [{ side: 'above', way: 'in', reach: 1 }, { side: 'above', way: 'out', reach: 1 }] });
  addText(doc, 0, 0, 'NAD^{+}', { arrow: arrow.id, slot: 'above-in' });
  addText(doc, 0, 0, 'cat.', { arrow: arrow.id, slot: 'below' });
  let scene = fitted(doc);
  const mid = (arrow.x1 + arrow.x2) / 2;
  const arc = (key) => scene.arrowArcs.get(`${arrow.id}|${key}`);
  const meetX = (a) => Number(a.d.match(/^M(-?[\d.]+)/)[1]); // (the out arc starts where it meets)
  assert.ok(Math.abs(meetX(arc('above-out')) - mid) < 1e-6, 'the swoop meets at the middle');
  assert.equal(arc('above-in').head, null, 'the arc going in: no head (one swoop with the one going out)');
  assert.ok(arc('above-out').head, 'the arc going out: its head at its free end');
  assert.ok(arrow.x2 - arrow.x1 > 2 * 1 + 0.5, `the arrow lengthened to reach past its arcs (${(arrow.x2 - arrow.x1).toFixed(2)})`);
  const nad = scene.texts.get([...doc.texts.values()][0].id).box;
  assert.ok(nad.y2 < arc('above-in').free[1] && Math.abs((nad.x1 + nad.x2) / 2 - arc('above-in').free[0]) < 1e-6, 'NAD⁺ over the free end of the arc going in');
  // the arrow's own stack on the arcs' side: they meet either side of it
  [...doc.texts.values()][1].slot = 'above';
  scene = fitted(doc);
  const cat = scene.texts.get([...doc.texts.values()][1].id).box;
  assert.ok(meetX(arc('above-out')) > cat.x2, 'the arc going out meets the arrow past the arrow\'s own stack');
});

test('side arcs on opposite sides (in above, out below) meet round the arrow\'s label even if it is on one side; an arrow without arcs back to its length as drawn', async () => {
  const { addArrow } = await import('../src/model/doc.js');
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 4, 0, 'forward', { sides: [{ id: 90, side: 'above', way: 'in', reach: 1 }, { id: 91, side: 'below', way: 'out', reach: 1 }] });
  addText(doc, 0, 0, 'ADH', { arrow: arrow.id, slot: 'below' });
  let scene = buildScene(doc);
  const label = scene.texts.get([...doc.texts.values()][0].id).box;
  const meet = (key) => {
    const arc = scene.arrowArcs.get(`${arrow.id}|${key}`);
    return arc.samples[key.endsWith('in') ? 16 : 0][0];
  };
  assert.ok(meet('above-in') < label.x1 && meet('below-out') > label.x2, `either side of ADH (${meet('above-in').toFixed(2)}, ${meet('below-out').toFixed(2)}; ADH ${label.x1.toFixed(2)}–${label.x2.toFixed(2)})`);
  assert.equal(scene.arrowArcs.get(`${arrow.id}|above-in`).head, null, 'what goes in: no head');
  // its arcs gone, the arrow made longer by them: back to its own length
  Object.assign(arrow, { sides: [], ownLength: 2 });
  scene = buildScene(doc);
  const [[id, ends, own]] = scene.arrowFits;
  assert.equal(id, arrow.id);
  assert.ok(Math.abs(Math.hypot(ends.x2 - ends.x1, ends.y2 - ends.y1) - 2) < 1e-9 && own === null, 'as long as drawn, and no longer remembering it');
});

test('the circle in an aromatic ring: a curve through its corners pulled in, so round in a regular ring, in the ring\'s plane in one seen in perspective, solid or dashed', async () => {
  const { sceneMarkup } = await import('../src/render/svg.js');
  // benzene with its bonds delocalized, its corners moved by `map` ([x, y] -> [x, y])
  const benzene = (map, settings) => {
    const doc = emptyDoc();
    const ids = Array.from({ length: 6 }, (_, k) => addAtom(doc, ...map([Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)])).id);
    ids.forEach((id, k) => { addBond(doc, id, ids[(k + 1) % 6], k % 2 ? 1 : 2).delocalized = true; });
    const scene = buildScene(doc, settings);
    assert.equal(scene.circles.length, 1, 'one circle');
    return { scene, circle: scene.circles[0] };
  };
  // a point on the curve: segment k (from the middle before corner k to the one after it), at t
  const on = ({ corners }, k, t) => {
    const n = corners.length;
    const [a, c, b] = [corners[(k + n - 1) % n].map((v, i) => (v + corners[k][i]) / 2), corners[k], corners[k].map((v, i) => (v + corners[(k + 1) % n][i]) / 2)];
    return a.map((_, i) => (1 - t) ** 2 * a[i] + 2 * t * (1 - t) * c[i] + t * t * b[i]);
  };
  const { circle: round } = benzene((p) => p);
  const radii = [0, 1, 2, 3, 4, 5].flatMap((k) => [0, 0.25, 0.5].map((t) => Math.hypot(...on(round, k, t).map((v, i) => v - [round.cx, round.cy][i]))));
  assert.ok(Math.max(...radii) / Math.min(...radii) < 1.02, `regular: round within 2 % (${Math.min(...radii).toFixed(3)}–${Math.max(...radii).toFixed(3)})`);
  assert.ok(Math.abs(Math.min(...radii) - 0.62 * Math.cos(Math.PI / 6)) < 1e-9, 'as large as the circle was');
  // seen tilted and turned: the same curve seen alike (in the ring's plane)
  const turn = 30 * (Math.PI / 180);
  const view = ([x, y]) => [x * Math.cos(turn) - 0.4 * y * Math.sin(turn), x * Math.sin(turn) + 0.4 * y * Math.cos(turn)];
  const { circle: seen } = benzene(view);
  for (const k of [0, 2, 5]) for (const t of [0.3, 0.7]) assert.ok(Math.hypot(...on(seen, k, t).map((v, i) => v - view(on(round, k, t))[i])) < 1e-9, 'its points where the regular one\'s are seen');
  // moving one atom a little moves the curve a little (no axis to swing round)
  const { circle: nudged } = benzene(([x, y]) => (x > 0.9 ? [x + 0.05, y] : [x, y]));
  for (const k of [0, 1, 2, 3, 4, 5]) assert.ok(Math.hypot(...on(nudged, k, 0.5).map((v, i) => v - on(round, k, 0.5)[i])) < 0.05, 'moved little');
  // solid, or dashed in the dashed style; its bonds single lines either way
  const solid = sceneMarkup(benzene((p) => p).scene, 40);
  const { scene: dashedScene } = benzene((p) => p, { aromaticStyle: 'dashed' });
  const dashed = sceneMarkup(dashedScene, 40);
  assert.ok(/<path d="M[^"]*Q[^"]*Z" fill="none"[^>]*\/>/.test(solid) && !/<path d="M[^"]*Z" fill="none"[^>]*stroke-dasharray/.test(solid), 'a solid curve');
  assert.ok(/<path d="M[^"]*Z" fill="none"[^>]*stroke-dasharray/.test(dashed), 'a dashed curve');
  assert.equal((dashed.match(/<line[^>]*stroke-dasharray/g) ?? []).length, 0, 'no dashed second lines on its bonds');
});

test('a chair drawn by hand (the bond tool\'s steps, as books draw them) is read as the templates\' chair; flat rings, a boat and a zigzag of no one chair aren\'t', async () => {
  const { chairDoc } = await import('../src/chem/chair.js');
  const { readChair } = await import('../src/chem/ringFlip.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const smiles = (doc) => {
    const mol = RDKit.get_mol(writeMolfile(doc).molfile, JSON.stringify({ removeHs: true }));
    const s = mol.get_smiles();
    mol.delete();
    return s;
  };
  const D = Math.PI / 180;
  // a ring by its corners (y down) in the templates' order (left tip, back edge, right tip, front edge), Br
  // axial on the first two corners (straight up on the left tip, down on the next)
  const ringOf = (corners, axialBr = true) => {
    const doc = emptyDoc();
    const ids = corners.map(([x, y]) => addAtom(doc, x, y).id);
    ids.forEach((id, k) => addBond(doc, id, ids[(k + 1) % 6]));
    if (axialBr) [[0, -1], [1, 1]].forEach(([k, dy]) => addBond(doc, ids[k], addAtom(doc, corners[k][0], corners[k][1] + dy, 'Br').id));
    return { doc, ring: ids };
  };
  // a chair from its edges' directions (degrees, y up): the long edges, the tips' edges to the back and to the front
  const drawn = (edge, back, front) => {
    const step = ([x, y], a) => [x + Math.cos(a * D), y + Math.sin(a * D)];
    const t1 = [0, 0];
    const [u1, l1] = [step(t1, back), step(t1, front)];
    const [u2, l2] = [step(u1, edge), step(l1, edge)];
    return [t1, u1, u2, step(u2, front), l2, l1].map(([x, y]) => [x, -y]);
  };
  const template = smiles(chairDoc({ axial: ['Br', 'Br'] }));
  for (const [edge, back, front] of [[15, -15, -60], [30, -30, -60], [0, -30, -60], [30, 0, -60], [15, -30, -75]]) {
    const { doc, ring } = ringOf(drawn(edge, back, front));
    assert.ok(!readChair(doc, ring).error, `${edge}/${back}/${front}: a chair`);
    assert.equal(smiles(doc), template, `${edge}/${back}/${front}: trans-diaxial as the template's`);
  }
  const hexagon = [0, 60, 120, 180, 240, 300].map((a) => [Math.cos(a * D), Math.sin(a * D)]);
  const not = {
    hexagon,
    haworth: hexagon.map(([x, y]) => [1.3 * x, 0.45 * y]),
    boat: [[0, 0], [0.9, 0.5], [1.9, 0.5], [2.8, 0], [1.9, 0.9], [0.9, 0.9]],
    'blunt tips (one chair or the other)': drawn(30, -15, -90),
  };
  for (const [name, corners] of Object.entries(not)) {
    const { doc, ring } = ringOf(corners, false);
    assert.equal(readChair(doc, ring).error, 'shape', name);
  }
});

test('reaction arrows: an equilibrium lying one way (the other harpoon shorter), a crossed arrow, an equals sign; KET keeps them, Ketcher gets its own modes', async () => {
  const { arrowShapes } = await import('../src/render/scene.js');
  const { addArrow } = await import('../src/model/doc.js');
  const { readKet, writeKet } = await import('../src/io/ket.js');
  const span = ([x1, , x2]) => Math.abs(x2 - x1);
  const even = arrowShapes({ x1: 0, y1: 0, x2: 2, y2: 0, kind: 'equilibrium' }).lines.map(span);
  const forward = arrowShapes({ x1: 0, y1: 0, x2: 2, y2: 0, kind: 'equilibrium', lean: 'forward' }).lines.map(span);
  const back = arrowShapes({ x1: 0, y1: 0, x2: 2, y2: 0, kind: 'equilibrium', lean: 'back' }).lines.map(span);
  assert.ok(Math.abs(even[0] - even[1]) < 1e-9, 'even: both as long');
  assert.ok(forward[0] > forward[1] + 0.5 && Math.abs(forward[0] - even[0]) < 1e-9, 'lying forward: the lower one (back) shorter');
  assert.ok(back[1] > back[0] + 0.5 && Math.abs(back[1] - even[1]) < 1e-9, 'lying back: the upper one shorter');
  const failed = arrowShapes({ x1: 0, y1: 0, x2: 2, y2: 0, kind: 'failed' });
  assert.equal(failed.lines.length, 3, 'crossed: the line and the two strokes of its cross');
  const same = arrowShapes({ x1: 0, y1: 0, x2: 1.2, y2: 0, kind: 'same' });
  assert.ok(same.lines.length === 2 && !same.polygons.length, 'equals sign: two lines, no head');

  const doc = emptyDoc();
  addArrow(doc, 0, 0, 2, 0, 'equilibrium', { lean: 'forward' });
  addArrow(doc, 0, 2, 2, 2, 'equilibrium', { lean: 'back' });
  addArrow(doc, 0, 4, 2, 4, 'failed');
  addArrow(doc, 0, 6, 1.2, 6, 'same');
  const text = writeKet(doc);
  const nodes = JSON.parse(text).root.nodes.filter((n) => n.type === 'arrow');
  assert.deepEqual(nodes.map((n) => n.data.mode), ['unbalanced-equilibrium-filled-half-bow', 'unbalanced-equilibrium-filled-half-bow', 'failed', 'filled-triangle']);
  assert.ok(nodes[1].data.pos[0].x > nodes[1].data.pos[1].x, 'lying back: for Ketcher, from its other end');
  const back2 = [...readKet(text).doc.arrows.values()];
  assert.deepEqual(back2.map((a) => [a.kind, a.lean ?? null, a.x1 < a.x2]), [['equilibrium', 'forward', true], ['equilibrium', 'back', true], ['failed', null, true], ['same', null, true]]);
});

test('an equilibrium arrow is two arrows for its side arcs: each meets the harpoon on its side and goes its way', async () => {
  const { addArrow } = await import('../src/model/doc.js');
  const free = (kind, x1, x2, side, way) => {
    const doc = emptyDoc();
    const arrow = addArrow(doc, x1, 0, x2, 0, kind, { sides: [{ id: 99, side, way, reach: 1.2 }] });
    const arc = buildScene(doc).arrowArcs.get(`${arrow.id}|${side}-${way}`);
    return { x: Math.sign(arc.free[0] - (x1 + x2) / 2), meets: +arc.samples[way === 'out' ? 0 : 16][1].toFixed(2) };
  };
  // left to right: above, the forward harpoon (in from the left); below, the one going back (out to the left)
  assert.deepEqual([free('equilibrium', -2, 2, 'above', 'in').x, free('equilibrium', -2, 2, 'below', 'out').x], [-1, -1]);
  // a plain arrow: below, out to the right as before
  assert.equal(free('forward', -2, 2, 'below', 'out').x, 1);
  // drawn from the right: the forward harpoon below, going left (in from the right)
  assert.equal(free('equilibrium', 2, -2, 'below', 'in').x, 1);
  // on its harpoon's line, not the middle between them (y down: above is negative)
  assert.deepEqual([free('equilibrium', -2, 2, 'above', 'in').meets, free('equilibrium', -2, 2, 'below', 'out').meets], [-0.07, 0.07]);
});

test('the stick model\'s highlights as spheres and tubes: what lies behind one\'s front (what it highlights too: inside it) seen through it, tinted; what lies in front not', async () => {
  const { stickMarkup } = await import('../src/render/sticks.js');
  const { sceneMarkup } = await import('../src/render/svg.js');
  // (a ball's tinted part: the ball again (and its haze, at the back), the highlight over it, masked)
  const tints = (markup) => [...markup.matchAll(/<g mask="url\(#ht[^"]*\)"><circle cx="([-\d.]+)"[^>]*\/>(?:<circle [^>]*fill="#ffffff"[^>]*\/>)?<circle [^>]*fill="#ff0000"/g)].map((m) => Number(m[1]));
  // a highlighted atom, a ball beside it on the screen behind it, and the same ball in front of it
  const lone = (z) => ({ elements: ['C', 'C'], points: [[0, 0, 0], [0.35, 0, z]], bonds: [], marks: { atomHighlight: new Map([[0, '#ff0000']]) } });
  const behind = stickMarkup(lone(-1), 40);
  const glowAt = behind.indexOf('fill="#ff0000"');
  const firstBall = behind.search(/fill="url\(#ball/);
  assert.ok(glowAt >= 0 && glowAt < firstBall, 'its glow behind every ball');
  assert.deepEqual(tints(behind).sort((p, q) => p - q), [0, 14], 'its own ball (inside it) and the ball behind it tinted (at x 0 and 0.35 · 40)');
  assert.deepEqual(tints(stickMarkup(lone(1), 40)), [0], 'the ball in front of it not');
  // the bond's tube and both its atoms' spheres: one tint each on its two balls (inside) and on a ball behind them all
  const own = stickMarkup({ elements: ['C', 'C', 'C'], points: [[0, 0, 0], [0.8, 0, 0], [0.4, 0.1, -1.2]], bonds: [[0, 1, 1]],
    marks: { atomHighlight: new Map([[0, '#ff0000'], [1, '#ff0000']]), bondHighlight: new Map([['0-1', '#ff0000']]) } }, 40);
  assert.deepEqual(tints(own).sort((p, q) => p - q), [0, 16, 32], 'its two balls and the ball behind, each once (x 0, 0.4 · 40, 0.8 · 40)');
  assert.equal((own.match(/<g opacity="[\d.]+">/g) ?? []).length, 1, 'one glow for the colour');
  // the drawing (Turn in 3D's line view, the canvas) keeps its highlights behind every bond
  const doc = emptyDoc();
  const [a, b] = [0, 1].map((k) => addAtom(doc, k * 0.8, 0, 'C', { depth: [1, -1][k] }).id);
  doc.atoms.get(a).highlight = '#ff0000';
  addBond(doc, a, b, 1, { z: 0 });
  const drawn = sceneMarkup(buildScene(doc), 40);
  assert.ok(drawn.indexOf('fill="#ff0000"') < drawn.indexOf(`data-id="${[...doc.bonds.keys()][0]}"`), 'the drawing: the disc behind every bond');
});

test('Lewis symbols: three or four unpaired electrons each on a side of their own, the H and lone pairs from them; files and SMILES keep them', async () => {
  const { electronsOf } = await import('../src/chem/valence.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const { readKet, writeKet } = await import('../src/io/ket.js');
  const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  const SIDE = { 0: 'right', 90: 'below', 180: 'left', 270: 'above' };
  const side = (angle) => SIDE[Math.round(((angle * 180) / Math.PI + 360) % 360)] ?? `${Math.round((angle * 180) / Math.PI)}°`;
  // [element, radical, hCount] -> [H, lone pairs, unpaired, the unpaired electrons' sides, the pairs', SMILES]
  for (const [el, radical, hCount, want] of [
    ['N', 4, null, [0, 1, 3, 'right below left', 'above', '[N]']],
    ['O', 3, null, [0, 2, 2, 'right below', 'above left', '[O]']],
    ['C', 5, null, [0, 0, 4, 'right below left above', '', '[C]']],
    ['C', 3, 0, [0, 1, 2, 'right below', 'above', '[C]']], // (the ground state's ·C̈·: H set to none)
    ['F', 2, null, [0, 3, 1, 'right', 'above left below', '[F]']],
    ['B', 4, null, [0, 0, 3, 'right below above', '', '[B]']],
  ]) {
    const doc = emptyDoc();
    const atom = addAtom(doc, 0, 0, el, { radical, lonePairs: 'auto', hCount });
    const e = electronsOf(atom, []);
    const { electrons } = buildScene(doc).atoms.get(atom.id);
    const mol = RDKit.get_mol(writeMolfile(doc).molfile);
    const got = [e.hydrogens, e.lonePairs, e.unpaired, electrons.unpaired.map((u) => side(u.angle)).join(' '), electrons.pairs.map((p) => side(p.angle)).join(' '), mol.get_smiles()];
    mol.delete();
    assert.deepEqual(got, want, `${el} with radical ${radical}`);
    assert.ok(electrons.unpaired.every((u) => u.count === 1), `${el}: one dot on each`);
    // KET: Ketcher's code at most a triplet's, ours in the olomol section, read back as it was
    const ket = writeKet(doc);
    const ketcherAtom = JSON.parse(ket)[Object.keys(JSON.parse(ket)).find((k) => k.startsWith('mol'))].atoms[0];
    const { doc: back } = readKet(ket);
    assert.ok(ketcherAtom.radical <= 3 && [...back.atoms.values()][0].radical === radical, `${el}: KET (${ketcherAtom.radical}, read back ${[...back.atoms.values()][0].radical})`);
  }
  // a singlet's two electrons stay together, in one place; a triplet carbene's apart
  for (const [radical, places, dots] of [[1, 1, 2], [3, 2, 1]]) {
    const doc = emptyDoc();
    const c = addAtom(doc, 0, 0, 'C', { radical });
    addBond(doc, c.id, addAtom(doc, 1, 0, 'C').id);
    addBond(doc, c.id, addAtom(doc, -0.5, 0.87, 'C').id);
    const { unpaired } = buildScene(doc).atoms.get(c.id).electrons;
    assert.ok(unpaired.length === places && unpaired.every((u) => u.count === dots), `radical ${radical}: ${places} place(s) of ${dots}`);
  }
});

test('the stick model: a label shown as one ball is its label\'s colour, not its first atom\'s element\'s; drawn out, its O stays red', async () => {
  const { labelColours, stickMarkup } = await import('../src/render/sticks.js');
  // C–O–CH3 with OMe a label (its O first), all in the plane
  const model = { elements: ['C', 'O', 'C'], points: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], bonds: [[0, 1, 1], [1, 2, 1]], groups: [{ name: 'OMe', atoms: [1, 2] }] };
  const colour = labelColours(model.groups).legend[0].colour.toLowerCase();
  const ball = (markup, x) => markup.match(new RegExp(`<circle cx="${x}"[^>]*fill="url\\(#ball([0-9a-f]{6})\\)"`))?.[1];
  const collapsed = stickMarkup(model, 40, { collapsed: true });
  const out = stickMarkup(model, 40);
  const xO = collapsed.match(/<circle cx="([-\d.]+)"[^>]*fill="url\(#ball[0-9a-f]{6}\)"[^>]*\/><text/)?.[1];
  assert.equal(`#${ball(collapsed, xO)}`, colour, 'the OMe ball in OMe\'s colour');
  assert.notEqual(`#${ball(out, xO)}`, colour, 'drawn out, the O in its element\'s colour');
});

test('the adamantane cage template: the bond behind broken where the bridge in front crosses it', async () => {
  const { adamantaneCage } = await import('../src/chem/chair.js');
  const { buildScene } = await import('../src/render/scene.js');
  const doc = adamantaneCage();
  assert.ok([...doc.bonds.values()].every((b) => typeof b.z === 'number'));
  // a broken bond is drawn as two lines instead of one
  const broken = [...buildScene(doc).bonds.values()].filter((info) => info.shapes.lines.length > 1);
  assert.equal(broken.length, 1);
  // the one broken is behind (the chair's upper edge)
  assert.ok(broken[0].bond.z < 0, `z ${broken[0].bond.z}`);
});

test('the flat adamantane template is adamantane, its long bond broken where it passes behind the bridge', async () => {
  const { adamantaneFlat } = await import('../src/chem/chair.js');
  const { writeMolfile } = await import('../src/io/molfile.js');
  const doc = adamantaneFlat();
  const smiles = (molfile) => { const mol = RDKit.get_mol(molfile); const s = mol.get_smiles(); mol.delete(); return s; };
  assert.equal(smiles(writeMolfile(doc).molfile), smiles('C1C2CC3CC1CC(C2)C3'));
  const broken = [...buildScene(doc).bonds.values()].filter((info) => info.shapes.lines.length > 1);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].bond.z, -1);
});

// Align reaction scheme: a curved arrow from a molecule in the row to a reagent over the next arrow (the
// product's N to the H of H2O, J's Strecker scheme) doesn't join the two: the reagent stays on its arrow, the
// molecule in the row, in its order (before: it rode on the second arrow and was moved onto the first)
test('Align reaction: a curved arrow from a molecule in the row to a reagent on an arrow leaves each where it belongs', async () => {
  const { addArrow } = await import('../src/model/doc.js');
  const { alignReaction } = await import('../src/arrange/align.js');
  const doc = emptyDoc();
  const line = (x, y, els) => {
    const ids = els.map((el, k) => addAtom(doc, x + k, y, el).id);
    for (let k = 1; k < ids.length; k++) addBond(doc, ids[k - 1], ids[k]);
    return ids;
  };
  const start = line(0, 0, ['C', 'C', 'O']);
  const first = addArrow(doc, 3.5, 0, 6, 0, 'forward');
  const middle = line(7, 0, ['C', 'C', 'N']);
  const second = addArrow(doc, 10.5, 0, 13, 0, 'forward');
  const water = line(11.2, -0.8, ['H', 'O']);
  for (const id of water) Object.assign(doc.atoms.get(id), { arrow: second.id, arrowSlot: 'above', arrowOrder: 0 });
  const end = line(14, 0, ['C', 'C', 'N']);
  addCurve(doc, { atom: middle[2] }, { atom: water[0] });
  const ed = { doc, scene: buildScene(doc), checkpoint() {}, touched() { this.scene = buildScene(this.doc); }, say() {}, selectedAtoms: () => null,
    selection: new Set([...doc.atoms.keys(), ...doc.bonds.keys(), ...doc.arrows.keys(), ...doc.curves.keys()]) };
  alignReaction(ed);
  const span = (ids) => [Math.min(...ids.map((id) => doc.atoms.get(id).x)), Math.max(...ids.map((id) => doc.atoms.get(id).x))];
  const [a1, a2] = [first, second].map((arrow) => [Math.min(arrow.x1, arrow.x2), Math.max(arrow.x1, arrow.x2)]);
  const row = [span(start), a1, span(middle), a2, span(end)];
  assert.ok(row.every((part, k) => k === 0 || part[0] > row[k - 1][1]), `in the row's order, apart: ${JSON.stringify(row)}`);
  const [w1, w2] = span(water);
  assert.ok(w1 >= a2[0] - 0.5 && w2 <= a2[1] + 0.5 && doc.atoms.get(water[1]).y < first.y1, 'the water over the second arrow');
});

test("charges circled and lone pairs as bars: the drawing's own style before the settings'", () => {
  const doc = emptyDoc();
  addAtom(doc, 0, 0, 'O', { charge: 1, lonePairs: 'auto' });
  const circled = (scene) => [...scene.atoms.values()][0].label.circles.length;
  assert.equal(circled(buildScene(doc)), 0);
  doc.style = { style: 'screen', charges: 'circled' };
  assert.equal(circled(buildScene(doc)), 1);
  doc.style = { style: 'screen' };
  assert.equal(circled(buildScene(doc, { ...buildScene(emptyDoc()).settings, chargeStyle: 'circled' })), 0, 'a drawing with a style of its own: plain unless it says');
});

test('a label whose usual side runs into another atom is written the other way round, where there is room: HO beside a drawn H, HOH2C over an OH', () => {
  // a sugar's CH(OH) on a zigzag as Redraw's engines draw it (y down): the OH up, the drawn H 46° to its right
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C');
  for (const [x, y] of [[-0.87, 0.5], [0.87, 0.5]]) addBond(doc, c.id, addAtom(doc, x, y, 'C').id);
  const o = addAtom(doc, Math.cos(-113 * DEGREE), Math.sin(-113 * DEGREE), 'O');
  addBond(doc, c.id, o.id);
  addBond(doc, c.id, addAtom(doc, Math.cos(-67 * DEGREE), Math.sin(-67 * DEGREE), 'H').id, 1, { stereo: 'hash' });
  assert.equal(buildScene(doc).atoms.get(o.id).hSide, 'left');
  // the same with the H the other side of the OH: OH as usual
  const free = emptyDoc();
  const c2 = addAtom(free, 0, 0, 'C');
  for (const [x, y] of [[-0.87, 0.5], [0.87, 0.5]]) addBond(free, c2.id, addAtom(free, x, y, 'C').id);
  const o2 = addAtom(free, 0, -1, 'O');
  addBond(free, c2.id, o2.id);
  addBond(free, c2.id, addAtom(free, -0.87, -0.5, 'H').id);
  assert.equal(buildScene(free).atoms.get(o2.id).hSide, 'right');
  // a CH2OH hanging down from its carbon, an OH one bond to its right: HOH2C
  const group = emptyDoc();
  const top = addAtom(group, 0, 0, 'C');
  const ch2oh = addAtom(group, 0, 1, 'C');
  ch2oh.alias = 'CH2OH';
  addBond(group, top.id, ch2oh.id);
  const next = addAtom(group, 0.87, 0.5, 'C');
  addBond(group, top.id, next.id);
  addBond(group, next.id, addAtom(group, 0.87, 1.4, 'O').id);
  assert.ok(buildScene(group).atoms.get(ch2oh.id).label.runs.map((r) => r.text).join('').startsWith('HO'));
});

test('R/S marks on a glucose chair: none inside the ring or on a label (CH2OH written as a label)', async () => {
  const { CHAIRS } = await import('../src/chem/chair.js');
  const doc = CHAIRS.find(([name]) => name === 'β-D-Glucose, chair')[1]();
  // C6 and its O as one CH2OH label, as Abbreviate makes it
  const c6 = [...doc.atoms.values()].find((a) => a.el === 'C' && [...doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length === 2);
  const o6 = [...doc.bonds.values()].map((b) => (b.a === c6.id ? b.b : b.b === c6.id ? b.a : null)).find((id) => id !== null && doc.atoms.get(id).el === 'O');
  const c5 = [...doc.bonds.values()].map((b) => (b.a === c6.id ? b.b : b.b === c6.id ? b.a : null)).find((id) => id !== null && id !== o6);
  for (const b of [...doc.bonds.values()]) if ([b.a, b.b].some((id) => id === c6.id || id === o6)) doc.bonds.delete(b.id);
  doc.atoms.delete(c6.id);
  doc.atoms.delete(o6);
  addBond(doc, c5, addAtom(doc, c6.x, c6.y, '*', { alias: 'CH2OH' }).id);
  // the ring's carbons: C1 to C5, each a stereocentre
  const centres = buildScene(doc).rings[0].map((id) => doc.atoms.get(id)).filter((a) => a.el === 'C');
  for (const a of centres) a.cipLabel = true;
  const scene = buildScene(doc, undefined, { stereo: { atoms: new Map(centres.map((a) => [a.id, 'R'])), bonds: new Map() } });
  assert.equal(scene.stereo.length, 5);
  const polygon = scene.ringPolygons[0];
  const inside = ([x, y]) => {
    let inn = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [[xi, yi], [xj, yj]] = [polygon[i], polygon[j]];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
    }
    return inn;
  };
  const labelBoxes = [...scene.atoms.values()].flatMap((info) => (info.label?.boxes ?? []).map((b) => ({ x1: info.pos[0] + b.x1, y1: info.pos[1] + b.y1, x2: info.pos[0] + b.x2, y2: info.pos[1] + b.y2 })));
  for (const mark of scene.stereo) {
    assert.ok(!inside([mark.x, mark.y]), `${mark.text} at ${mark.x.toFixed(2)}, ${mark.y.toFixed(2)}: inside the ring`);
    const [w, h] = [0.25, 0.18];
    assert.ok(!labelBoxes.some((b) => b.x1 < mark.x + w && mark.x - w < b.x2 && b.y1 < mark.y + h && mark.y - h < b.y2), `${mark.text} at ${mark.x.toFixed(2)}, ${mark.y.toFixed(2)}: on a label`);
  }
});

test("a homolysis's two fishhooks are a mirror pair: the second the first reflected across the bond's middle", () => {
  for (const tilt of [0, 30]) {
    const doc = emptyDoc();
    const [c, s] = [Math.cos(tilt * DEGREE), Math.sin(tilt * DEGREE)];
    const a = addAtom(doc, 0, 0, 'Cl', { lonePairs: 'auto' });
    const b = addAtom(doc, c, s, 'Cl', { lonePairs: 'auto' });
    const bond = addBond(doc, a.id, b.id);
    const first = addCurve(doc, { bond: bond.id }, { atom: a.id }, 1);
    const second = addCurve(doc, { bond: bond.id }, { atom: b.id }, 1);
    const scene = buildScene(doc);
    const [one, two] = [first, second].map((curve) => scene.curves.get(curve.id));
    // reflected across the line upright through the bond's middle
    const mirror = ([x, y]) => {
      const d = (x - c / 2) * c + (y - s / 2) * s;
      return [x - 2 * d * c, y - 2 * d * s];
    };
    for (const key of ['p0', 'p1', 'p2', 'p3']) {
      const [want, got] = [mirror(one.shape[key]), two.shape[key]];
      assert.ok(Math.hypot(want[0] - got[0], want[1] - got[1]) < 1e-9, `tilted ${tilt}°: ${key} mirrored`);
    }
    // (the pair on one side of the bond: both tips on the same side of its line)
    const side = ([x, y]) => Math.sign(x * s - y * c);
    assert.equal(side(one.tip), side(two.tip), `tilted ${tilt}°: both on one side`);
  }
});

test("a homolysis's fishhook pair goes to the open side of the bond: tBuO–OtBu with both tBu below, the pair above", () => {
  const doc = emptyDoc();
  const t1 = addAtom(doc, -0.87, 0.5, '*', { alias: 'tBu' });
  const [a, b] = [addAtom(doc, 0, 0, 'O'), addAtom(doc, 1, 0, 'O')];
  const t2 = addAtom(doc, 1.87, 0.5, '*', { alias: 'tBu' });
  addBond(doc, t1.id, a.id);
  const bond = addBond(doc, a.id, b.id);
  addBond(doc, b.id, t2.id);
  const pair = [addCurve(doc, { bond: bond.id }, { atom: a.id }, 1), addCurve(doc, { bond: bond.id }, { atom: b.id }, 1)];
  const scene = buildScene(doc);
  for (const curve of pair) assert.ok(scene.curves.get(curve.id).tip[1] < 0, `fishhook to ${curve.to.atom}: above the bond (y ${scene.curves.get(curve.id).tip[1].toFixed(2)})`);
});
