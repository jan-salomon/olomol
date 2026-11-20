// UFF, the universal force field (Rappé et al., J. Am. Chem. Soc. 1992, 114,
// 10024): parameters for every element, so a metal complex can be optimised
// as a whole, its ligands' shapes coming from physics (bond lengths, angles,
// torsions, planarity, van der Waals contacts) instead of rules. The terms
// follow RDKit's implementation (Code/ForceField/UFF, BSD licence); the angles
// at a metal are held to its coordination polyhedron instead of UFF's own
// metal angle terms, so that the polyhedron chosen stays the one optimised.
// Units: Å and kcal/mol.
import { UFF_TABLE } from './uffParams.js';

const DEG = Math.PI / 180;
const G = 332.06; // bond force constant prefactor
const LAMBDA = 0.1332; // bond order correction

export const PARAMS = Object.fromEntries(UFF_TABLE.trim().split('\n').map((line) => {
  const [label, ...values] = line.trim().split(/\s+/);
  const [r1, theta0, x1, D1, zeta, Z1, V1, U1, Xi] = values.map(Number);
  return [label, { r1, theta0: theta0 * DEG, x1, D1, zeta, Z1, V1, U1, Xi }];
}));

// --- atom types ---

const GROUP16 = new Set(['O', 'S', 'Se', 'Te', 'Po']);
const HALOGENS = new Set(['F', 'Cl', 'Br', 'I', 'At']);
const padded = (el) => (el.length === 1 ? `${el}_` : el);

// The UFF type of a metal (or any element without rules here): its own
// type with the coordination digit asked for (3 tetrahedral, 4 square, 6
// octahedral) if there is one, else its first.
export function metalType(el, digit = null) {
  const own = Object.keys(PARAMS).filter((label) => label.startsWith(padded(el)) && !/[a-z]/.test(label[padded(el).length] ?? ''));
  return own.find((label) => label[padded(el).length] === String(digit)) ?? own[0] ?? null;
}

// Hybridization (1 sp, 2 sp2, 3 sp3) and UFF type of each atom, from the
// bonds without the metal's: `atoms` [{ el, h (hydrogens on it, if they are
// not atoms of their own), aromatic }], `bonds` [{ a, b, order (1, 1.5 aromatic, 2, 3) }],
// `metals` a set of atom indices. Lone-pair atoms next to a π system (amide
// N, phenol O, carboxylate O−, pyrrole N) are sp2, as RDKit has them.
export function atomTypes(atoms, bonds, metals) {
  const n = atoms.length;
  const own = Array.from({ length: n }, () => []); // bonds without the metal's
  for (const bond of bonds) {
    if (metals.has(bond.a) || metals.has(bond.b)) continue;
    own[bond.a].push(bond);
    own[bond.b].push(bond);
  }
  const other = (bond, i) => (bond.a === i ? bond.b : bond.a);
  const pi = (i) => own[i].some((bond) => bond.order > 1);
  const hyb = atoms.map(({ el, h = 0 }, i) => {
    if (metals.has(i) || el === 'H' || HALOGENS.has(el)) return null;
    const orders = own[i].map((bond) => bond.order);
    if (orders.includes(3) || orders.filter((o) => o === 2).length >= 2) return 1;
    if (orders.some((o) => o > 1)) return 2;
    // a lone pair next to a π system
    if ((el === 'N' || el === 'O') && own[i].length + h < (el === 'N' ? 4 : 3) && own[i].some((bond) => pi(other(bond, i)))) return 2;
    if (el === 'B' && own[i].length + h === 3) return 2;
    return 3;
  });
  const conjugated = (i) => atoms[i].aromatic || own[i].some((bond) => {
    const j = other(bond, i);
    return hyb[j] === 2 || hyb[j] === 1;
  });
  const valence = (i) => own[i].reduce((sum, bond) => sum + bond.order, 0) + (atoms[i].h ?? 0);
  const types = atoms.map(({ el }, i) => {
    if (metals.has(i)) return null; // (set by the caller, from its polyhedron)
    if (el === 'H') return 'H_';
    if (HALOGENS.has(el)) return padded(el);
    const h = hyb[i];
    if (el === 'C' || el === 'N' || el === 'O') return `${el}_${h === 1 ? 1 : h === 2 ? (conjugated(i) ? 'R' : 2) : 3}`;
    if (el === 'S') {
      if (h === 2) return conjugated(i) ? 'S_R' : 'S_2';
      const v = Math.round(valence(i));
      return v >= 6 ? 'S_3+6' : v >= 4 ? 'S_3+4' : 'S_3+2';
    }
    if (el === 'P') return Math.round(valence(i)) >= 5 ? 'P_3+5' : 'P_3+3';
    if (el === 'B') return h === 2 ? 'B_2' : 'B_3';
    return metalType(el, 3);
  });
  return { types, hyb };
}

// --- the terms ---

function restLength(order, p, q) {
  const rBO = -LAMBDA * (p.r1 + q.r1) * Math.log(order);
  const rEN = (p.r1 * q.r1 * (Math.sqrt(p.Xi) - Math.sqrt(q.Xi)) ** 2) / (p.Xi * p.r1 + q.Xi * q.r1);
  return p.r1 + q.r1 + rBO - rEN;
}

function angleConstant(theta0, order12, order23, p1, p2, p3) {
  const c = Math.cos(theta0);
  const r12 = restLength(order12, p1, p2);
  const r23 = restLength(order23, p2, p3);
  const r13 = Math.sqrt(r12 * r12 + r23 * r23 - 2 * r12 * r23 * c);
  const rTerm = r12 * r23;
  return ((2 * G) / rTerm) * ((p1.Z1 * p3.Z1) / r13 ** 5) * rTerm * (3 * rTerm * (1 - c * c) - r13 * r13 * c);
}

// The force field of a molecule: `atoms` [{ el, h }] (hydrogens as atoms of
// their own: h 0), `bonds` [{ a, b, order (a conjugated one any between 1 and 2), kekule (as drawn, if it differs) }], `types` (UFF labels, metals'
// included), `hyb`, and `metal`: { index, places: Map(donor -> unit vector of its
// place on the polyhedron) } or null. Returns the terms; energy() evaluates them.
export function forceField({ atoms, bonds, types, hyb, metal = null }) {
  const n = atoms.length;
  const params = types.map((label) => PARAMS[label]);
  if (params.some((p) => !p)) return null;
  const near = Array.from({ length: n }, () => []);
  const orderOf = new Map();
  const kekuleOf = new Map(); // (a bond's order as drawn, where its `order` is a conjugated one: for what types it)
  for (const { a, b, order, kekule } of bonds) {
    near[a].push(b);
    near[b].push(a);
    orderOf.set(`${Math.min(a, b)}-${Math.max(a, b)}`, order);
    kekuleOf.set(`${Math.min(a, b)}-${Math.max(a, b)}`, kekule ?? order);
  }
  const order = (a, b) => orderOf.get(`${Math.min(a, b)}-${Math.max(a, b)}`) ?? 1;
  const drawnOrder = (a, b) => kekuleOf.get(`${Math.min(a, b)}-${Math.max(a, b)}`) ?? 1;
  const isMetal = (i) => metal?.index === i;
  const stretch = bonds.map(({ a, b, order: o }) => {
    const r0 = restLength(o, params[a], params[b]);
    return [a, b, (2 * G * params[a].Z1 * params[b].Z1) / r0 ** 3, r0];
  });
  const bend = []; // [i, j, k, ka, order, C0, C1, C2]
  const held = []; // at the metal: [i, m, k, ka, cos0, trans]
  for (let j = 0; j < n; j++) {
    for (let x = 0; x < near[j].length; x++) {
      for (let y = x + 1; y < near[j].length; y++) {
        const [i, k] = [near[j][x], near[j][y]];
        if (isMetal(j)) {
          const [u, v] = [metal.places.get(i), metal.places.get(k)];
          if (!u || !v) continue;
          const cos0 = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
          const ka = angleConstant(Math.acos(cos0), order(i, j), order(j, k), params[i], params[j], params[k]);
          held.push([i, j, k, ka, cos0, cos0 < -0.99]);
          continue;
        }
        if (hyb[j] === null) continue;
        const p = params[j];
        const ka = angleConstant(p.theta0, order(i, j), order(j, k), params[i], p, params[k]);
        const terms = hyb[j] === 1 ? 1 : hyb[j] === 2 ? 3 : 0;
        const s = Math.max(Math.sin(p.theta0) ** 2, 1e-8);
        const C2 = 1 / (4 * s);
        bend.push([i, j, k, ka, terms, C2 * (2 * Math.cos(p.theta0) ** 2 + 1), -4 * C2 * Math.cos(p.theta0), C2]);
      }
    }
  }
  // torsions about bonds between sp2 or sp3 atoms (not the metal), shared out
  const twist = []; // [i, j, k, l, V, n, cosTerm]
  for (const { a: j, b: k, order: o } of bonds) {
    if (!(hyb[j] === 2 || hyb[j] === 3) || !(hyb[k] === 2 || hyb[k] === 3)) continue;
    let [V, nn, cosTerm] = [0, 0, 0];
    const [pj, pk] = [params[j], params[k]];
    const eq17 = 5 * Math.sqrt(pj.U1 * pk.U1) * (1 + 4.18 * Math.log(o));
    const here = [];
    for (const i of near[j]) {
      if (i === k) continue;
      for (const l of near[k]) {
        if (l === j || l === i) continue;
        if (hyb[j] === 3 && hyb[k] === 3) {
          [V, nn, cosTerm] = [Math.sqrt(pj.V1 * pk.V1), 3, -1];
          if (o === 1 && GROUP16.has(atoms[j].el) && GROUP16.has(atoms[k].el)) {
            [V, nn, cosTerm] = [Math.sqrt((atoms[j].el === 'O' ? 2 : 6.8) * (atoms[k].el === 'O' ? 2 : 6.8)), 2, -1];
          }
        } else if (hyb[j] === 2 && hyb[k] === 2) {
          [V, nn, cosTerm] = [eq17, 2, 1];
        } else {
          [V, nn, cosTerm] = [1, 6, 1];
          if (o === 1) {
            const [sp3, sp2] = hyb[j] === 3 ? [j, k] : [k, j];
            if (GROUP16.has(atoms[sp3].el) && !GROUP16.has(atoms[sp2].el)) [V, nn, cosTerm] = [eq17, 2, -1];
            else if (hyb[i] === 2 || hyb[l] === 2) [V, nn, cosTerm] = [2, 3, -1];
          }
        }
        here.push([i, j, k, l, V, nn, cosTerm]);
      }
    }
    for (const term of here) twist.push([...term.slice(0, 4), term[4] / here.length, term[5], term[6]]);
  }
  // inversions at sp2 C, N, O with three neighbours (the metal one of them: a pyridine's N keeps it in its plane)
  const flat = []; // [i, j (centre), k, l, K, C0, C1, C2]
  // (and at P, As, Sb, Bi with three neighbours, which it keeps pyramidal)
  const PYRAMID = { P: 84.4339, As: 86.9735, Sb: 87.7047, Bi: 90 };
  for (let j = 0; j < n; j++) {
    if (near[j].length !== 3) continue;
    const [a, b, c] = near[j];
    const el = atoms[j].el;
    let coefficients;
    if (['C', 'N', 'O'].includes(el) && hyb[j] === 2) {
      const toO = el === 'C' && near[j].some((x) => atoms[x].el === 'O' && hyb[x] === 2 && drawnOrder(j, x) === 2);
      coefficients = [(toO ? 50 : 6) / 3, 1, -1, 0];
    } else if (PYRAMID[el]) {
      const w0 = PYRAMID[el] * DEG;
      const [C2, C1] = [1, -4 * Math.cos(w0)];
      const C0 = -(C1 * Math.cos(w0) + C2 * Math.cos(2 * w0));
      coefficients = [22 / (C0 + C1 + C2) / 3, C0, C1, C2];
    } else continue;
    for (const [i, k, l] of [[a, b, c], [a, c, b], [b, c, a]]) flat.push([i, j, k, l, ...coefficients]);
  }
  // van der Waals between atoms three or more bonds apart
  const apart = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) {
    for (const j of near[i]) {
      apart[i].add(j);
      for (const k of near[j]) if (k !== i) apart[i].add(k);
    }
  }
  // (and between the metal's donors, though two bonds apart: the ligands push each other apart round
  // the metal, which is what decides between its polyhedra, a tetrahedron for [ZnCl4]2− and not a square)
  const donorPair = (i, j) => metal && near[metal.index].includes(i) && near[metal.index].includes(j);
  const contact = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (apart[i].has(j) && !donorPair(i, j)) continue;
      contact.push([i, j, Math.sqrt(params[i].x1 * params[j].x1), Math.sqrt(params[i].D1 * params[j].D1)]);
    }
  }
  // packed for speed: indices and constants of each kind of term in typed arrays
  const pack = (terms, width) => {
    const index = new Int32Array(terms.length * width);
    const value = new Float64Array(terms.length * (terms[0]?.length - width || 0));
    const rest = terms[0] ? terms[0].length - width : 0;
    terms.forEach((term, t) => {
      for (let q = 0; q < width; q++) index[t * width + q] = term[q];
      for (let q = 0; q < rest; q++) value[t * rest + q] = Number(term[width + q]);
    });
    return { count: terms.length, index, value, rest };
  };
  return {
    n, stretch: pack(stretch, 2), bend: pack(bend, 3), held: pack(held, 3), twist: pack(twist, 4), flat: pack(flat, 4), contact: pack(contact, 2),
  };
}

// --- energy and gradient ---

// The energy at coordinates x (Float64Array, 3 per atom); the gradient added into g if given.
export function energy(field, x, g = null) {
  let E = 0;
  {
    const { count, index, value } = field.stretch;
    for (let t = 0; t < count; t++) {
      const [a, b] = [3 * index[2 * t], 3 * index[2 * t + 1]];
      const [k, r0] = [value[2 * t], value[2 * t + 1]];
      const dx = x[a] - x[b];
      const dy = x[a + 1] - x[b + 1];
      const dz = x[a + 2] - x[b + 2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      E += 0.5 * k * (r - r0) * (r - r0);
      if (g) {
        const f = (k * (r - r0)) / r;
        g[a] += f * dx; g[a + 1] += f * dy; g[a + 2] += f * dz;
        g[b] -= f * dx; g[b + 1] -= f * dy; g[b + 2] -= f * dz;
      }
    }
  }
  // angles, as functions of their cosine c at j: dE/dc times dc/dx. `held`: [ka, cos θ0, trans] of a metal's
  // angle held to its polyhedron, else `bend`: [ka, terms (0 general, 1 linear, 3 trigonal), C0, C1, C2]
  const angleTerm = (i3, j3, k3, held, bend) => {
    const ux = x[i3] - x[j3];
    const uy = x[i3 + 1] - x[j3 + 1];
    const uz = x[i3 + 2] - x[j3 + 2];
    const vx = x[k3] - x[j3];
    const vy = x[k3 + 1] - x[j3 + 1];
    const vz = x[k3 + 2] - x[j3 + 2];
    const lu = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1e-9;
    const lv = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-9;
    const c = Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (lu * lv)));
    let e;
    let dEdc;
    if (held) {
      // harmonic about the polyhedron's angle (as ka/2 Δθ² near it); a trans pair ka (1 + cos θ)
      const [ka, cos0, trans] = held;
      const s = Math.max(1 - cos0 * cos0, 1e-6);
      e = trans ? ka * (1 + c) : (ka / (2 * s)) * (c - cos0) * (c - cos0);
      dEdc = trans ? ka : (ka / s) * (c - cos0);
    } else {
      const [ka, terms, C0, C1, C2] = bend;
      if (terms === 0) {
        e = ka * (C0 + C1 * c + C2 * (2 * c * c - 1));
        dEdc = ka * (C1 + 4 * C2 * c);
      } else if (terms === 1) {
        e = ka * (1 + c); // linear
        dEdc = ka;
      } else {
        e = (ka / 9) * (1 - (4 * c * c * c - 3 * c)); // trigonal: 1 − cos 3θ
        dEdc = (ka / 9) * -(12 * c * c - 3);
      }
    }
    if (g) {
      const [a, b] = [1 / (lu * lv), c / (lu * lu)];
      const [d, h] = [1 / (lu * lv), c / (lv * lv)];
      const gix = dEdc * (vx * a - ux * b);
      const giy = dEdc * (vy * a - uy * b);
      const giz = dEdc * (vz * a - uz * b);
      const gkx = dEdc * (ux * d - vx * h);
      const gky = dEdc * (uy * d - vy * h);
      const gkz = dEdc * (uz * d - vz * h);
      g[i3] += gix; g[i3 + 1] += giy; g[i3 + 2] += giz;
      g[k3] += gkx; g[k3 + 1] += gky; g[k3 + 2] += gkz;
      g[j3] -= gix + gkx; g[j3 + 1] -= giy + gky; g[j3 + 2] -= giz + gkz;
    }
    return e;
  };
  {
    const { count, index, value } = field.bend; // value: ka, terms, C0, C1, C2
    for (let t = 0; t < count; t++) {
      const v = 5 * t;
      E += angleTerm(3 * index[3 * t], 3 * index[3 * t + 1], 3 * index[3 * t + 2], null, value.subarray(v, v + 5));
    }
  }
  {
    const { count, index, value } = field.held; // value: ka, cos0, trans
    for (let t = 0; t < count; t++) {
      const v = 3 * t;
      E += angleTerm(3 * index[3 * t], 3 * index[3 * t + 1], 3 * index[3 * t + 2], value.subarray(v, v + 3), null);
    }
  }
  {
    // torsions (Blondel and Karplus): φ from F = xi − xj, H = xl − xk, about G = xj − xk
    const { count, index, value } = field.twist; // value: V, n, cosTerm
    for (let t = 0; t < count; t++) {
      const [i, j, k, l] = [3 * index[4 * t], 3 * index[4 * t + 1], 3 * index[4 * t + 2], 3 * index[4 * t + 3]];
      const [V, nn, cosTerm] = [value[3 * t], value[3 * t + 1], value[3 * t + 2]];
      const Fx = x[i] - x[j], Fy = x[i + 1] - x[j + 1], Fz = x[i + 2] - x[j + 2];
      const Gx = x[j] - x[k], Gy = x[j + 1] - x[k + 1], Gz = x[j + 2] - x[k + 2];
      const Hx = x[l] - x[k], Hy = x[l + 1] - x[k + 1], Hz = x[l + 2] - x[k + 2];
      const Ax = Fy * Gz - Fz * Gy, Ay = Fz * Gx - Fx * Gz, Az = Fx * Gy - Fy * Gx;
      const Bx = Hy * Gz - Hz * Gy, By = Hz * Gx - Hx * Gz, Bz = Hx * Gy - Hy * Gx;
      const a2 = Ax * Ax + Ay * Ay + Az * Az;
      const b2 = Bx * Bx + By * By + Bz * Bz;
      const lg = Math.sqrt(Gx * Gx + Gy * Gy + Gz * Gz);
      if (a2 < 1e-12 || b2 < 1e-12 || lg < 1e-9) continue;
      const Cx = By * Az - Bz * Ay, Cy = Bz * Ax - Bx * Az, Cz = Bx * Ay - By * Ax; // B × A
      const phi = Math.atan2((Cx * Gx + Cy * Gy + Cz * Gz) / lg, Ax * Bx + Ay * By + Az * Bz);
      E += (V / 2) * (1 - cosTerm * Math.cos(nn * phi));
      if (!g) continue;
      const dEdphi = (V / 2) * cosTerm * nn * Math.sin(nn * phi);
      const fg = Fx * Gx + Fy * Gy + Fz * Gz;
      const hg = Hx * Gx + Hy * Gy + Hz * Gz;
      const [ca, cb] = [(dEdphi * lg) / a2, (dEdphi * lg) / b2];
      const [pa, pb] = [(dEdphi * fg) / (a2 * lg), (dEdphi * hg) / (b2 * lg)];
      g[i] -= ca * Ax; g[i + 1] -= ca * Ay; g[i + 2] -= ca * Az;
      g[l] += cb * Bx; g[l + 1] += cb * By; g[l + 2] += cb * Bz;
      g[j] += ca * Ax + pa * Ax - pb * Bx; g[j + 1] += ca * Ay + pa * Ay - pb * By; g[j + 2] += ca * Az + pa * Az - pb * Bz;
      g[k] += -cb * Bx - pa * Ax + pb * Bx; g[k + 1] += -cb * By - pa * Ay + pb * By; g[k + 2] += -cb * Bz - pa * Az + pb * Bz;
    }
  }
  {
    // inversions: Y between j→l and the normal of the plane of i, j, k
    const { count, index, value } = field.flat; // value: K, C0, C1, C2
    for (let t = 0; t < count; t++) {
      const [i, j, k, l] = [3 * index[4 * t], 3 * index[4 * t + 1], 3 * index[4 * t + 2], 3 * index[4 * t + 3]];
      const [K, C0, C1, C2] = [value[4 * t], value[4 * t + 1], value[4 * t + 2], value[4 * t + 3]];
      const ax = x[i] - x[j], ay = x[i + 1] - x[j + 1], az = x[i + 2] - x[j + 2];
      const bx = x[k] - x[j], by = x[k + 1] - x[j + 1], bz = x[k + 2] - x[j + 2];
      const wx = x[l] - x[j], wy = x[l + 1] - x[j + 1], wz = x[l + 2] - x[j + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const N = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const W = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (N < 1e-9 || W < 1e-9) continue;
      const cosY = Math.max(-1, Math.min(1, (nx * wx + ny * wy + nz * wz) / (N * W)));
      const sinY = Math.sqrt(Math.max(1 - cosY * cosY, 1e-12));
      E += K * (C0 + C1 * sinY + C2 * (2 * sinY * sinY - 1));
      if (!g) continue;
      const d = K * (C1 + 4 * C2 * sinY) * (-cosY / sinY);
      const qx = wx / (N * W) - (cosY * nx) / (N * N), qy = wy / (N * W) - (cosY * ny) / (N * N), qz = wz / (N * W) - (cosY * nz) / (N * N);
      const gwx = d * (nx / (N * W) - (cosY * wx) / (W * W)), gwy = d * (ny / (N * W) - (cosY * wy) / (W * W)), gwz = d * (nz / (N * W) - (cosY * wz) / (W * W));
      const gix = d * (by * qz - bz * qy), giy = d * (bz * qx - bx * qz), giz = d * (bx * qy - by * qx); // b × q
      const gkx = d * (qy * az - qz * ay), gky = d * (qz * ax - qx * az), gkz = d * (qx * ay - qy * ax); // q × a
      g[i] += gix; g[i + 1] += giy; g[i + 2] += giz;
      g[k] += gkx; g[k + 1] += gky; g[k + 2] += gkz;
      g[l] += gwx; g[l + 1] += gwy; g[l + 2] += gwz;
      g[j] -= gix + gkx + gwx; g[j + 1] -= giy + gky + gwy; g[j + 2] -= giz + gkz + gwz;
    }
  }
  {
    const { count, index, value } = field.contact; // value: x_ij, D_ij
    for (let t = 0; t < count; t++) {
      const [a, b] = [3 * index[2 * t], 3 * index[2 * t + 1]];
      const dx = x[a] - x[b];
      const dy = x[a + 1] - x[b + 1];
      const dz = x[a + 2] - x[b + 2];
      const r2 = Math.max(dx * dx + dy * dy + dz * dz, 1e-6);
      const xij = value[2 * t];
      const D = value[2 * t + 1];
      const s2 = (xij * xij) / r2;
      const s6 = s2 * s2 * s2;
      E += D * (s6 * s6 - 2 * s6);
      if (g) {
        const f = ((12 * D) / r2) * (s6 - s6 * s6);
        g[a] += f * dx; g[a + 1] += f * dy; g[a + 2] += f * dz;
        g[b] -= f * dx; g[b + 1] -= f * dy; g[b + 2] -= f * dz;
      }
    }
  }
  return E;
}

// --- minimising: L-BFGS with a backtracking line search, no atom moved more than 0.3 Å a step ---

export function minimise(field, x, { iterations = 1000, tolerance = 0.01 } = {}) {
  const size = x.length;
  const history = [];
  let g = new Float64Array(size);
  let E = energy(field, x, g);
  for (let step = 0; step < iterations; step++) {
    let largest = 0;
    for (let q = 0; q < size; q++) largest = Math.max(largest, Math.abs(g[q]));
    if (largest < tolerance) break;
    // the direction: two-loop recursion
    const d = Float64Array.from(g, (v) => -v);
    const alphas = [];
    for (let h = history.length - 1; h >= 0; h--) {
      const { s, y, rho } = history[h];
      let a = 0;
      for (let q = 0; q < size; q++) a += s[q] * d[q];
      a *= rho;
      alphas[h] = a;
      for (let q = 0; q < size; q++) d[q] -= a * y[q];
    }
    if (history.length) {
      const { s, y } = history[history.length - 1];
      let [sy, yy] = [0, 0];
      for (let q = 0; q < size; q++) {
        sy += s[q] * y[q];
        yy += y[q] * y[q];
      }
      const scale = sy / (yy || 1);
      for (let q = 0; q < size; q++) d[q] *= scale;
    }
    for (let h = 0; h < history.length; h++) {
      const { s, y, rho } = history[h];
      let b = 0;
      for (let q = 0; q < size; q++) b += y[q] * d[q];
      b *= rho;
      for (let q = 0; q < size; q++) d[q] += (alphas[h] - b) * s[q];
    }
    let slope = 0;
    for (let q = 0; q < size; q++) slope += d[q] * g[q];
    if (!(slope < 0)) {
      history.length = 0; // not downhill: start again from the gradient
      for (let q = 0; q < size; q++) d[q] = -g[q];
      slope = 0;
      for (let q = 0; q < size; q++) slope += d[q] * g[q];
    }
    let move = 0;
    for (let a = 0; a < size; a += 3) move = Math.max(move, Math.hypot(d[a], d[a + 1], d[a + 2]));
    let t = Math.min(1, 0.3 / (move || 1));
    const next = new Float64Array(size);
    const gNext = new Float64Array(size);
    let ENext = Infinity;
    for (let tries = 0; tries < 30; tries++) {
      for (let q = 0; q < size; q++) next[q] = x[q] + t * d[q];
      gNext.fill(0);
      ENext = energy(field, next, gNext);
      if (ENext <= E + 1e-4 * t * slope) break;
      t *= 0.5;
    }
    if (!(ENext < E)) break; // no way down any more
    const s = new Float64Array(size);
    const y = new Float64Array(size);
    let sy = 0;
    for (let q = 0; q < size; q++) {
      s[q] = next[q] - x[q];
      y[q] = gNext[q] - g[q];
      sy += s[q] * y[q];
    }
    if (sy > 1e-10) {
      history.push({ s, y, rho: 1 / sy });
      if (history.length > 8) history.shift();
    }
    x.set(next);
    g = gNext;
    E = ENext;
  }
  return E;
}
