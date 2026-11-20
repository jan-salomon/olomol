// Hückel π bond orders, for the force field's bond orders in a conjugated
// system (complex3D.js): each conjugated bond's order 1 + its π bond order
// (Coulson's), worked out over the whole π system the drawing has, instead of
// as drawn (one Kekulé structure: a porphyrin's two kinds of pyrrole) or by
// rules. So a bond is as conjugated as its system makes it: benzene's 1.67,
// salen's aryl–CH=N about 1.4, a phenyl on a porphyrin's meso carbon little
// (then the phenyl turns out of the porphyrin's plane, away from its
// neighbours' hydrogens, as it does in crystals, rather than bending it into
// a saddle).
//
// The molecule needn't be flat: a bond's β goes with the overlap of its two p
// orbitals (the cosine of the angle between them), so a bond twisted out of
// conjugation, a phenyl turned away from its neighbours, conjugates less;
// worked out again on the geometry the force field gives, until the two agree
// (as Allinger's MMP2 does with its π calculation).
//
// Hückel's method (in units of β, α of carbon 0): an atom's Coulomb integral
// α + hβ, a bond's resonance integral kβ, with the textbook heteroatom
// parameters (Streitwieser, Molecular Orbital Theory for Organic Chemists,
// 1961), by element and by the π electrons the atom gives: one (pyridine's N,
// a carbonyl's O) or two (pyrrole's N, furan's O, a phenolate's O⁻), a
// positive charge raising it. The lowest orbitals are filled, two electrons
// each (orbitals of one energy shared out evenly), and p_ij = Σ n c_i c_j.

// h by element and π electrons given (1 or 2), and +1 charged; k of a bond to it (to carbon)
const HETERO = {
  N: { 1: { h: 0.5, k: 1.0 }, 2: { h: 1.5, k: 0.8 }, plus: { h: 2.0, k: 1.0 } },
  O: { 1: { h: 1.0, k: 1.0 }, 2: { h: 2.0, k: 0.8 }, plus: { h: 2.5, k: 1.0 } },
  S: { 1: { h: 0.0, k: 0.6 }, 2: { h: 0.0, k: 0.6 } },
  P: { 1: { h: 0.0, k: 0.7 }, 2: { h: 0.0, k: 0.7 } },
  B: { 0: { h: -1.0, k: 0.7 } },
  F: { 2: { h: 3.0, k: 0.7 } },
  Cl: { 2: { h: 2.0, k: 0.4 } },
  Br: { 2: { h: 1.5, k: 0.3 } },
};

// The eigenvalues and eigenvectors of a symmetric matrix (Jacobi's rotations): { values, vectors (by column) }.
export function symmetricEigen(matrix) {
  const n = matrix.length;
  const a = matrix.map((row) => [...row]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const [akp, akq] = [a[k][p], a[k][q]];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const [apk, aqk] = [a[p][k], a[q][k]];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const [vkp, vkq] = [v[k][p], v[k][q]];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

// π bond orders for a molecule's conjugated systems. `elements` by atom; `bonds` [{ a, b, order, kekule }]:
// `kekule` as drawn (1, 2 or 3; a partial bond 0.5), `order` the same, or already refined (1 + p) with `kekule`
// still the drawn one; `pi(i)`: whether atom i takes part (sp2: a double bond of its own,
// or a lone pair, an empty orbital or a charge next to one); `charges` by atom; `skip(bond)`: bonds out of it
// (to a metal); `overlap(bond index)`: how far its two p orbitals overlap, 0…1 (|cos| of the angle between
// them: a bond twisted out of conjugation, 0 at right angles; 1 for a flat system). Returns Map(bond index ->
// its π bond order, 0…1) for the bonds between two such atoms.
export function piBondOrders({ elements, bonds, pi, charges = [], skip = () => false, overlap = () => 1 }) {
  // (`kekule`, where a bond has it: the order as drawn, which a refinement keeps while `order` becomes 1 + p)
  const drawn = (bond) => bond.kekule ?? bond.order;
  const inSystem = bonds.map((bond) => !skip(bond) && drawn(bond) >= 1 && drawn(bond) <= 2 && pi(bond.a) && pi(bond.b));
  const near = new Map();
  bonds.forEach((bond, k) => {
    if (!inSystem[k]) return;
    for (const [x, y] of [[bond.a, bond.b], [bond.b, bond.a]]) {
      if (!near.has(x)) near.set(x, []);
      near.get(x).push({ to: y, k });
    }
  });
  const result = new Map();
  const seen = new Set();
  for (const start of near.keys()) {
    if (seen.has(start)) continue;
    // one conjugated system
    const atoms = [start];
    seen.add(start);
    for (let i = 0; i < atoms.length; i++) {
      for (const { to } of near.get(atoms[i])) {
        if (!seen.has(to)) {
          seen.add(to);
          atoms.push(to);
        }
      }
    }
    if (atoms.length < 2) continue;
    const index = new Map(atoms.map((atom, i) => [atom, i]));
    // each atom's π electrons: one with a double bond in the system, else two (a lone pair: N, O, S, a carbanion)
    // or none (boron, a carbocation)
    const double = (atom) => near.get(atom).some(({ k }) => drawn(bonds[k]) === 2);
    const electrons = atoms.map((atom) => {
      if (double(atom)) return 1;
      const el = elements[atom];
      const charge = charges[atom] ?? 0;
      if (el === 'B' || (el === 'C' && charge > 0)) return 0;
      if (el === 'C' && charge === 0) return 1; // (a radical)
      return 2;
    });
    const kind = (atom, i) => {
      const table = HETERO[elements[atom]];
      if (!table) return { h: 0, k: 1 };
      if ((charges[atom] ?? 0) > 0 && table.plus) return table.plus;
      return table[electrons[i]] ?? table[1] ?? table[2] ?? table[0] ?? { h: 0, k: 1 };
    };
    const kinds = atoms.map(kind);
    const n = atoms.length;
    const h = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? kinds[i].h : 0)));
    for (const atom of atoms) {
      for (const { to, k: bond } of near.get(atom)) {
        const [i, j] = [index.get(atom), index.get(to)];
        // (a heteroatom's k for its bonds; between two heteroatoms the smaller; β as the p orbitals overlap)
        const k = elements[atom] === 'C' ? kinds[j].k : elements[to] === 'C' ? kinds[i].k : Math.min(kinds[i].k, kinds[j].k);
        h[i][j] = k * overlap(bond);
      }
    }
    const { values, vectors } = symmetricEigen(h);
    // the orbitals filled from the lowest energy (α + xβ, β < 0: the largest x first); one energy's orbitals evenly
    const order = values.map((x, i) => [x, i]).sort((p, q) => q[0] - p[0]);
    let left = electrons.reduce((s, e) => s + e, 0);
    const occupancy = new Array(n).fill(0);
    for (let g = 0; g < n && left > 0;) {
      let end = g;
      while (end + 1 < n && Math.abs(order[end + 1][0] - order[g][0]) < 1e-6) end++;
      const size = end - g + 1;
      const put = Math.min(left, 2 * size);
      for (let q = g; q <= end; q++) occupancy[order[q][1]] = put / size;
      left -= put;
      g = end + 1;
    }
    for (const atom of atoms) {
      for (const { to, k } of near.get(atom)) {
        if (result.has(k)) continue;
        const [i, j] = [index.get(atom), index.get(to)];
        let p = 0;
        for (let m = 0; m < n; m++) p += occupancy[m] * vectors[i][m] * vectors[j][m];
        result.set(k, Math.max(0, Math.min(1, p)));
      }
    }
  }
  return result;
}
