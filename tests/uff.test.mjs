// UFF (src/layout/uff.js): the same energies as RDKit's implementation, a
// gradient that is the energy's, and a minimiser that finds a chair.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { atomTypes, energy, forceField, metalType, minimise } from '../src/layout/uff.js';

const reference = JSON.parse(readFileSync(new URL('./fixtures/uff-rdkit.json', import.meta.url), 'utf8'));

const numericalGradientError = (field, x) => {
  const g = new Float64Array(x.length);
  energy(field, x, g);
  let worst = 0;
  for (let q = 0; q < x.length; q++) {
    const y = Float64Array.from(x);
    y[q] += 1e-5;
    const up = energy(field, y);
    y[q] -= 2e-5;
    const down = energy(field, y);
    worst = Math.max(worst, Math.abs((up - down) / 2e-5 - g[q]));
  }
  return worst;
};

test('UFF energies as RDKit has them (bonds, angles, torsions, inversions, van der Waals), the gradient the energy\'s', () => {
  for (const m of reference.molecules) {
    const atoms = m.atoms.map((a) => ({ el: a.el, aromatic: a.aromatic, h: 0 }));
    const { types, hyb } = atomTypes(atoms, m.bonds, new Set());
    const field = forceField({ atoms, bonds: m.bonds, types, hyb });
    const x = Float64Array.from(m.x);
    assert.ok(Math.abs(energy(field, x) - m.energy) < 0.01, `${m.smiles}: ${energy(field, x).toFixed(3)} kcal/mol, RDKit ${m.energy}`);
    assert.ok(numericalGradientError(field, x) < 1e-5, `${m.smiles}: the gradient`);
  }
});

test('a metal\'s angles held to its polyhedron, its donors pushing each other apart: the gradient the energy\'s', () => {
  // Fe with four NH3 and two Cl, roughly octahedral, a little out of shape
  const atoms = [{ el: 'Fe' }];
  const bonds = [];
  const places = new Map();
  const corners = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const x = [0.05, -0.03, 0.02];
  corners.forEach((c, k) => {
    const el = k < 2 ? 'Cl' : 'N';
    atoms.push({ el });
    const d = atoms.length - 1;
    bonds.push({ a: 0, b: d, order: 1 });
    places.set(d, c);
    x.push(...c.map((v, q) => 2.1 * v + 0.07 * Math.sin(3 * k + q)));
    if (el === 'N') {
      for (let h = 0; h < 3; h++) {
        atoms.push({ el: 'H' });
        bonds.push({ a: d, b: atoms.length - 1, order: 1 });
        x.push(...c.map((v, q) => 3.0 * v + 0.6 * Math.cos(2 * h + q + k)));
      }
    }
  });
  const { types, hyb } = atomTypes(atoms.map((a) => ({ ...a, h: 0 })), bonds, new Set([0]));
  types[0] = metalType('Fe', 6);
  const field = forceField({ atoms, bonds, types, hyb, metal: { index: 0, places } });
  assert.ok(field.held.count === 15, 'every two donors\' angle held');
  assert.ok(numericalGradientError(field, Float64Array.from(x)) < 1e-4, 'the gradient');
});

test('the minimiser: cyclohexane from nearly flat to a chair', () => {
  const atoms = [];
  const bonds = [];
  const x = [];
  for (let k = 0; k < 6; k++) {
    atoms.push({ el: 'C' });
    x.push(1.5 * Math.cos((k * Math.PI) / 3), 1.5 * Math.sin((k * Math.PI) / 3), 0.05 * (k % 2 ? 1 : -1));
  }
  for (let k = 0; k < 6; k++) bonds.push({ a: k, b: (k + 1) % 6, order: 1 });
  for (let k = 0; k < 6; k++) {
    for (const side of [1, -1]) {
      atoms.push({ el: 'H' });
      bonds.push({ a: k, b: atoms.length - 1, order: 1 });
      x.push(2.1 * Math.cos((k * Math.PI) / 3), 2.1 * Math.sin((k * Math.PI) / 3), 0.9 * side);
    }
  }
  const { types, hyb } = atomTypes(atoms.map((a) => ({ ...a, h: 0 })), bonds, new Set());
  const field = forceField({ atoms, bonds, types, hyb });
  const y = Float64Array.from(x);
  const before = energy(field, y);
  const after = minimise(field, y, { iterations: 3000, tolerance: 0.001 });
  assert.ok(after < before - 10, `lower (${before.toFixed(1)} → ${after.toFixed(1)} kcal/mol)`);
  const p = (i) => [y[3 * i], y[3 * i + 1], y[3 * i + 2]];
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const torsion = (a, b, c, d) => {
    const [b1, b2, b3] = [sub(p(b), p(a)), sub(p(c), p(b)), sub(p(d), p(c))];
    const [n1, n2] = [cross(b1, b2), cross(b2, b3)];
    return (Math.atan2(dot(cross(n1, n2), b2) / Math.hypot(...b2), dot(n1, n2)) * 180) / Math.PI;
  };
  const torsions = [0, 1, 2, 3, 4, 5].map((k) => torsion(k, (k + 1) % 6, (k + 2) % 6, (k + 3) % 6));
  assert.ok(torsions.every((t) => Math.abs(t) > 45 && Math.abs(t) < 65), `a chair: ring torsions ${torsions.map((t) => t.toFixed(0)).join(' ')}`);
  assert.ok(torsions.every((t, k) => Math.sign(t) !== Math.sign(torsions[(k + 1) % 6])), 'alternating, as in a chair (not a twist boat)');
});

test('Hückel π bond orders: benzene 2/3, butadiene 0.894 and 0.447, pyridine and pyrrole as the textbook has them; a bond twisted out of conjugation conjugates less', async () => {
  const { piBondOrders, symmetricEigen } = await import('../src/layout/hueckel.js');
  const ring = (elements, orders) => ({ elements, bonds: elements.map((_, i) => ({ a: i, b: (i + 1) % elements.length, order: orders[i] })), pi: () => true });
  const near = (x, y) => Math.abs(x - y) < 0.005;
  assert.deepEqual(symmetricEigen([[0, 1, 0, 0, 0, 1], [1, 0, 1, 0, 0, 0], [0, 1, 0, 1, 0, 0], [0, 0, 1, 0, 1, 0], [0, 0, 0, 1, 0, 1], [1, 0, 0, 0, 1, 0]]).values.map((v) => Math.round(v)).sort(), [-1, -1, -2, 1, 1, 2]);
  for (const p of piBondOrders(ring(['C', 'C', 'C', 'C', 'C', 'C'], [2, 1, 2, 1, 2, 1])).values()) assert.ok(near(p, 2 / 3), `benzene ${p}`);
  const butadiene = piBondOrders({ elements: ['C', 'C', 'C', 'C'], bonds: [{ a: 0, b: 1, order: 2 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 3, order: 2 }], pi: () => true });
  assert.ok(near(butadiene.get(0), 0.894) && near(butadiene.get(1), 0.447), 'butadiene');
  // (the two Kekulé structures of benzene: the same)
  const other = [...piBondOrders(ring(['C', 'C', 'C', 'C', 'C', 'C'], [1, 2, 1, 2, 1, 2])).values()];
  assert.ok(other.every((p) => near(p, 2 / 3)));
  const pyrrole = piBondOrders(ring(['N', 'C', 'C', 'C', 'C'], [1, 2, 1, 2, 1]));
  assert.ok(pyrrole.get(0) < 0.5 && pyrrole.get(1) > 0.75 && pyrrole.get(2) > 0.5 && pyrrole.get(2) < 0.6, `pyrrole ${[...pyrrole.values()].map((p) => p.toFixed(2))}`);
  // butadiene's middle bond twisted to 60° (its p orbitals at cos 0.5) and to 90° (none): less, then none
  const twisted = (c) => piBondOrders({ elements: ['C', 'C', 'C', 'C'], bonds: [{ a: 0, b: 1, order: 2 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 3, order: 2 }], pi: () => true, overlap: (k) => (k === 1 ? c : 1) });
  assert.ok(twisted(0.5).get(1) < butadiene.get(1) && twisted(0.5).get(1) > 0.1, 'twisted 60°: conjugated less');
  assert.ok(twisted(0).get(1) < 1e-9 && near(twisted(0).get(0), 1), 'twisted 90°: two ethylenes');
});

test('Hückel refined again (the bonds\' orders already 1 + p, their drawn order kept as kekule): the same π electrons, so pyridine and a porphyrin-like ring come out as at first', async () => {
  const { piBondOrders } = await import('../src/layout/hueckel.js');
  const near = (x, y) => Math.abs(x - y) < 0.005;
  const ring = (n, orders) => orders.slice(0, n).map((order, i) => [i, (i + 1) % n, order]);
  for (const [name, elements, links] of [
    ['pyridine', ['N', 'C', 'C', 'C', 'C', 'C'], ring(6, [2, 1, 2, 1, 2, 1])],
    ['pyrrole', ['N', 'C', 'C', 'C', 'C'], ring(5, [1, 2, 1, 2, 1])],
    // a benzene ring with CH=N on it (salen's aryl imine)
    ['an aryl imine', ['C', 'C', 'C', 'C', 'C', 'C', 'C', 'N'], [...ring(6, [2, 1, 2, 1, 2, 1]), [0, 6, 1], [6, 7, 2]]],
  ]) {
    const bonds = links.map(([a, b, order]) => ({ a, b, order, kekule: order }));
    const first = piBondOrders({ elements, bonds, pi: () => true });
    for (const [k, p] of first) bonds[k].order = 1 + p;
    const again = piBondOrders({ elements, bonds, pi: () => true });
    assert.ok([...first].every(([k, p]) => near(again.get(k), p)), `${name}: ${[...first.values()].map((p) => p.toFixed(2))} then ${[...again.values()].map((p) => p.toFixed(2))}`);
  }
});
