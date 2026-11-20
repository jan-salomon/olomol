// Orbitals on atoms: their directions follow the molecule (turned, mirrored, a neighbour deleted), they
// are copied and deleted with their atoms, kept in KET files, drawn as lobes outside a label's letters, and upright to a 3D view's plane on the side they were drawn on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readKet, toKet } from '../src/io/ket.js';
import { faceOf, planeNormals, uprightOnPage } from '../src/layout/orbitals3D.js';
import { addAtom, addBond, addCurve, addOrbital, addOverlap, copyObjects, deleteObjects, emptyDoc, orbitalAngle, setOrbitalAngle, turningOrbitals } from '../src/model/doc.js';
import { buildScene } from '../src/render/scene.js';

const DEGREE = Math.PI / 180;
const degrees = (a) => Math.round(((a / DEGREE) % 360 + 540) % 360 - 180);

// ethylene with a p orbital on each carbon, upright
function ethylene() {
  const doc = emptyDoc();
  const [a, b] = [addAtom(doc, 0, 0).id, addAtom(doc, 1, 0).id];
  addBond(doc, a, b, 2);
  const orbitals = [a, b].map((atom) => {
    const o = addOrbital(doc, atom);
    setOrbitalAngle(doc, o, -90 * DEGREE);
    return o;
  });
  return { doc, a, b, orbitals };
}

test('an orbital turns with its molecule: measured from a neighbour', () => {
  const { doc, a, b, orbitals } = ethylene();
  assert.equal(orbitals[0].ref, b);
  // the molecule turned by 90° (its atoms moved, nothing told the orbital): still across the bond
  Object.assign(doc.atoms.get(b), { x: 0, y: 1 });
  assert.equal(degrees(orbitalAngle(doc, orbitals[0])), 0);
  // a lone atom's orbital is measured from the page
  const lone = addOrbital(doc, addAtom(doc, 5, 5, 'Cl').id);
  setOrbitalAngle(doc, lone, 30 * DEGREE);
  assert.equal(lone.ref, null);
  assert.equal(degrees(orbitalAngle(doc, lone)), 30);
  assert.ok(a);
});

test('a mirror image mirrors the orbitals; a neighbour deleted leaves them pointing as they did', () => {
  const { doc, a, b, orbitals } = ethylene();
  setOrbitalAngle(doc, orbitals[0], -60 * DEGREE);
  // flipped left to right about x = 0.5
  turningOrbitals(doc, [a, b], () => {
    for (const id of [a, b]) doc.atoms.get(id).x = 1 - doc.atoms.get(id).x;
  }, (angle) => Math.PI - angle);
  assert.equal(degrees(orbitalAngle(doc, orbitals[0])), -120);
  deleteObjects(doc, [b]);
  assert.equal(orbitals[0].ref, null);
  assert.equal(degrees(orbitalAngle(doc, orbitals[0])), -120);
  // its own atom deleted: the orbital goes, and the line and the curved arrow from it
  assert.equal(doc.orbitals.size, 1);
  deleteObjects(doc, [a]);
  assert.equal(doc.orbitals.size, 0);
});

test('copies, lines between orbitals, curved arrows from a lobe: copied and kept in KET', () => {
  const { doc, a, b, orbitals } = ethylene();
  const c = addAtom(doc, 4, 0, 'O', { charge: -1 }).id;
  const lone = addOrbital(doc, c, { kind: 'hybrid', phase: -1, size: 1.25, color: '#2e6fdb' });
  setOrbitalAngle(doc, lone, 180 * DEGREE);
  addOverlap(doc, lone.id, orbitals[1].id);
  addCurve(doc, { orbital: lone.id }, { orbital: orbitals[1].id });
  const back = readKet(JSON.stringify(toKet(doc))).doc;
  assert.equal(back.orbitals.size, 3);
  assert.equal(back.overlaps.size, 1);
  const read = [...back.orbitals.values()];
  assert.deepEqual(read.map((o) => [o.kind, degrees(orbitalAngle(back, o)), o.phase, o.size, o.color]),
    [['p', -90, 1, 1, null], ['p', -90, 1, 1, null], ['hybrid', -180, -1, 1.25, '#2e6fdb']]);
  const [curve] = back.curves.values();
  assert.ok(back.orbitals.has(curve.from.orbital) && back.orbitals.has(curve.to.orbital));
  // the ethylene copied alone: its orbitals with it, not the line to the hydroxide's
  copyObjects(doc, [a, b], 0, 3);
  assert.equal(doc.orbitals.size, 5);
  assert.equal(doc.overlaps.size, 1);
});

test('lobes: on a labelled atom starting outside the label, 0.45 of a bond beyond it', () => {
  // (acetaldehyde's carbonyl carbon, a corner without a label, and its O)
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0).id;
  const o = addAtom(doc, 1, 0, 'O').id;
  addBond(doc, c, o, 2);
  addBond(doc, c, addAtom(doc, -0.5, 0.87).id, 1);
  for (const id of [c, o]) setOrbitalAngle(doc, addOrbital(doc, id), -90 * DEGREE);
  const scene = buildScene(doc);
  const [onC, onO] = [...scene.orbitals.values()];
  const reach = (lobe, atom) => Math.hypot(lobe.tip[0] - doc.atoms.get(atom).x, lobe.tip[1] - doc.atoms.get(atom).y);
  assert.ok(Math.abs(reach(onC.lobes[0], c) - 0.64) < 1e-9);
  assert.ok(reach(onO.lobes[0], o) > 0.64 && reach(onO.lobes[0], o) < 0.9);
  // the carbon's lobes meet at its centre; the oxygen's start outside its letter
  const nearest = (lobe, atom) => Math.min(...lobe.polygon.map(([x, y]) => Math.hypot(x - doc.atoms.get(atom).x, y - doc.atoms.get(atom).y)));
  assert.ok(nearest(onC.lobes[0], c) < 1e-6);
  assert.ok(nearest(onO.lobes[0], o) > 0.2);
  // a hybrid on a label: its small back lobe too, outside the letters, smaller than its big one
  const hybrid = addOrbital(doc, o, { kind: 'hybrid' });
  setOrbitalAngle(doc, hybrid, 0);
  const [back, big] = buildScene(doc).orbitals.get(hybrid.id).lobes;
  assert.ok(nearest(back, o) > 0.2 && reach(back, o) < reach(big, o));
});

test('3D: the plane\'s normals keep their side as the molecule turns; a lobe drawn up goes towards the viewer', () => {
  // s-trans butadiene in the xy plane
  const points = [[-1.8, -0.4, 0], [-0.7, 0.3, 0], [0.7, -0.3, 0], [1.8, 0.4, 0]];
  const links = [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }];
  const normals = planeNormals(points, links);
  // all on one side
  assert.ok(normals.every((n) => n && Math.abs(Math.abs(n[2]) - 1) < 1e-9 && Math.sign(n[2]) === Math.sign(normals[0][2])));
  // turned 70° about the x axis: the same side of the molecule (the normals turned with it)
  const c = Math.cos(70 * DEGREE);
  const s = Math.sin(70 * DEGREE);
  const turned = planeNormals(points.map(([x, y, z]) => [x, c * y - s * z, s * y + c * z]), links);
  turned.forEach((n, k) => assert.ok(Math.abs(n[1] - (-s * normals[k][2])) < 1e-9 && Math.abs(n[2] - c * normals[k][2]) < 1e-9));
  // a lobe drawn up (−90°, y down) on a molecule seen face on: on the side towards the viewer
  const towards = normals[0][2] > 0 ? normals[0] : normals[0].map((v) => -v);
  assert.equal(faceOf(towards, -90 * DEGREE), 1);
  assert.equal(faceOf(towards, 90 * DEGREE), -1);
  // seen edge on, upright on the page, full length; end on, shorter
  assert.deepEqual(uprightOnPage([0, 1, 0], 1), { angle: -90 * DEGREE, reach: 1 });
  assert.ok(uprightOnPage([0, 0.5, Math.sqrt(0.75)], 1).reach < 0.51);
});

test('turned over a bond, orbitals from a 3D view turn in space with it: what was behind is in front', async () => {
  const { turnOver } = await import('../src/arrange/align.js');
  // ethylene from a 3D view: a p orbital on each carbon, its lobes' depth and side, the atoms' facing
  const doc = emptyDoc();
  const [a, b] = [addAtom(doc, 0, 0), addAtom(doc, 1, 0)];
  const bond = addBond(doc, a.id, b.id, 2);
  const o = addOrbital(doc, a.id, { kind: 'p', plane: 1, z: 0.4, dz: 0.6, reach: 0.8 });
  setOrbitalAngle(doc, o, -60 * DEGREE);
  a.facing = { angle: 0.5, reach: 0.8, face: 1 };
  bond.z = 0.4;
  turnOver(doc, bond, [a.id, b.id]);
  // (the bond's depth turned, the lobe's with it; its side of the plane the molecule's own, kept)
  assert.deepEqual([bond.z, o.z, o.dz, o.plane, a.facing.angle, a.facing.face], [0.4, -0.4, -0.6, 1, -0.5, 1]);
  assert.equal(Math.round(orbitalAngle(doc, o) / DEGREE), 60);
});

test('a charge is written where no lobe runs: hydroxide\'s lone pair pointing right, its minus not under the lobe', () => {
  const doc = emptyDoc();
  const o = addAtom(doc, 0, 0, 'O', { charge: -1 }).id;
  const plain = buildScene(doc).atoms.get(o).label.chargeAngle;
  setOrbitalAngle(doc, addOrbital(doc, o, { kind: 'hybrid' }), 0);
  const scene = buildScene(doc);
  const { label } = scene.atoms.get(o);
  const charge = label.boxes.find((b) => b.charge);
  const [, big] = [...scene.orbitals.values()][0].lobes;
  const inside = big.polygon.some(([x, y]) => x >= charge.x1 && x <= charge.x2 && y >= charge.y1 && y <= charge.y2);
  assert.equal(degrees(plain), -40); // (without the orbital: top right, as usual)
  assert.ok(!inside && degrees(label.chargeAngle) !== -40, `the charge at ${degrees(label.chargeAngle)}°`);
});

test('a line to an s orbital meets its circle on the side facing the other orbital, wherever that is', () => {
  // a carbocation's empty p orbital (upright) and an H on each side below it, each with an s orbital: the lines
  // in hyperconjugation; before, both met their H's circle on its right (at the s orbital's angle, 0)
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C', { charge: 1 }).id;
  const p = addOrbital(doc, c);
  setOrbitalAngle(doc, p, -90 * DEGREE);
  const hs = [[-1.5, 1], [1.5, 1]].map(([x, y]) => addAtom(doc, x, y, 'H').id);
  // (each s orbital's own angle 0, to the right, as it comes for an H on the right of its carbon)
  const lines = hs.map((h) => {
    const s = addOrbital(doc, h, { kind: 's' });
    setOrbitalAngle(doc, s, 0);
    return addOverlap(doc, p.id, s.id).id;
  });
  const scene = buildScene(doc);
  for (const [k, h] of hs.entries()) {
    const [a, b] = scene.overlaps.get(lines[k]).line;
    const { pos } = scene.atoms.get(h);
    const [atH, other] = Math.hypot(a[0] - pos[0], a[1] - pos[1]) < Math.hypot(b[0] - pos[0], b[1] - pos[1]) ? [a, b] : [b, a];
    // the end at the H in the direction of the line's other end (within 30°): on the side of its circle facing it
    const off = Math.abs(degrees(Math.atan2(atH[1] - pos[1], atH[0] - pos[0]) - Math.atan2(other[1] - pos[1], other[0] - pos[0])));
    assert.ok(off < 30, `H ${k}: its end ${off}° away from the direction of the p orbital`);
  }
});

test('the other phase can have a colour of its own: painted, swapped with the phase, kept in KET', () => {
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0).id;
  const p = addOrbital(doc, c, { color: '#e83e8c', colorOther: '#2e6fdb' });
  const fills = (d) => {
    const o = buildScene(d).orbitals.get([...d.orbitals.keys()][0]);
    return o.lobes.map((l) => (l.shaded ? o.shade : o.other));
  };
  assert.deepEqual(fills(doc), ['#e83e8c', '#2e6fdb']);
  // the phase swapped: the colours go with it
  p.phase = -1;
  assert.deepEqual(fills(doc), ['#2e6fdb', '#e83e8c']);
  // saved and opened
  const back = readKet(toKet(doc)).doc;
  assert.equal([...back.orbitals.values()][0].colorOther, '#2e6fdb');
  assert.deepEqual(fills(back), ['#2e6fdb', '#e83e8c']);
  // without one: white (none)
  assert.equal(buildScene(emptyDoc()).orbitals.size, 0);
  const plain = emptyDoc();
  addOrbital(plain, addAtom(plain, 0, 0).id);
  assert.deepEqual(fills(plain).map((x) => x ?? 'white'), ['#9aa1ad', 'white']);
});
