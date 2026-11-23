// The truth for B2 and B5, built without olomol's readers: 3D coordinates
// from a specification (which face of the ring each group is on) or from a
// projection's picture under the textbook convention, written as a 3D
// molfile by our own writer, and RDKit's stereo perception from 3D (a
// molfile marked 3D: RDKit assigns R/S and E/Z from the coordinates).

// --- a V2000 molfile of our own ---
const pad = (v, n) => String(v).padStart(n);
const SYMBOLS = new Set(['H', 'B', 'C', 'N', 'O', 'F', 'Si', 'P', 'S', 'Cl', 'Br', 'I', 'Se']);

// atoms: [{ el, x, y, z, charge }], bonds: [{ a, b, order }] (0-based)
export function molfile3D(atoms, bonds) {
  for (const a of atoms) if (!SYMBOLS.has(a.el)) throw new Error(`no element ${a.el}`);
  const lines = ['', '  bench    3D', '', `${pad(atoms.length, 3)}${pad(bonds.length, 3)}  0  0  1  0  0  0  0  0999 V2000`];
  for (const a of atoms) lines.push(`${a.x.toFixed(4).padStart(10)}${a.y.toFixed(4).padStart(10)}${a.z.toFixed(4).padStart(10)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  for (const b of bonds) lines.push(`${pad(b.a + 1, 3)}${pad(b.b + 1, 3)}${pad(b.order ?? 1, 3)}  0`);
  const charged = atoms.map((a, i) => [i, a.charge ?? 0]).filter(([, c]) => c);
  if (charged.length) lines.push(`M  CHG${pad(charged.length, 3)}${charged.map(([i, c]) => `${pad(i + 1, 4)}${pad(c, 4)}`).join('')}`);
  lines.push('M  END');
  return lines.join('\n');
}

// --- groups as atoms ---
// A group written as text (an element with its H, or an abbreviation) as atoms: [{ el, from (index in the
// group, -1: the atom it hangs on), order }]. Only what the benchmarks draw.
const GROUPS = {
  H: [{ el: 'H', from: -1 }],
  Me: [{ el: 'C', from: -1 }], CH3: [{ el: 'C', from: -1 }], C: [{ el: 'C', from: -1 }],
  OH: [{ el: 'O', from: -1 }], O: [{ el: 'O', from: -1 }],
  NH2: [{ el: 'N', from: -1 }], N: [{ el: 'N', from: -1 }],
  Cl: [{ el: 'Cl', from: -1 }], Br: [{ el: 'Br', from: -1 }], F: [{ el: 'F', from: -1 }], I: [{ el: 'I', from: -1 }],
  tBu: [{ el: 'C', from: -1 }, { el: 'C', from: 0 }, { el: 'C', from: 0 }, { el: 'C', from: 0 }],
  CO2H: [{ el: 'C', from: -1 }, { el: 'O', from: 0, order: 2 }, { el: 'O', from: 0 }],
  COOH: [{ el: 'C', from: -1 }, { el: 'O', from: 0, order: 2 }, { el: 'O', from: 0 }],
  CH2OH: [{ el: 'C', from: -1 }, { el: 'O', from: 0 }],
  CHO: [{ el: 'C', from: -1 }, { el: 'O', from: 0, order: 2 }],
  Et: [{ el: 'C', from: -1 }, { el: 'C', from: 0 }],
  Ph: [{ el: 'C', from: -1 }, { el: 'C', from: 0, order: 2 }, { el: 'C', from: 1 }, { el: 'C', from: 2, order: 2 }, { el: 'C', from: 3 }, { el: 'C', from: 4, order: 2, ring: 0 }],
};
export const groupAtoms = (text) => GROUPS[text] ?? null;

// A molecule under construction: atoms with 3D points, bonds.
export class Builder {
  constructor() {
    this.atoms = [];
    this.bonds = [];
  }
  atom(el, [x, y, z]) {
    this.atoms.push({ el, x, y, z });
    return this.atoms.length - 1;
  }
  bond(a, b, order = 1) {
    this.bonds.push({ a, b, order });
  }
  // a group (text) on atom `on`, its first atom at `at`, the rest further out along `dir` (unit vector)
  group(on, text, at, dir) {
    const parts = groupAtoms(text);
    if (!parts) throw new Error(`no group ${text}`);
    const ids = [];
    // a little fan for the atoms after the first, so no two sit on one point
    const side = Math.abs(dir[2]) < 0.9 ? cross(dir, [0, 0, 1]) : cross(dir, [1, 0, 0]);
    const s = normalise(side);
    const u = normalise(cross(dir, s));
    parts.forEach((p, k) => {
      let point;
      if (k === 0) point = at;
      else {
        const base = this.atoms[ids[p.from]];
        const angle = (2 * Math.PI * k) / parts.length;
        const off = [0, 1, 2].map((i) => 0.9 * dir[i] + 0.6 * (Math.cos(angle) * s[i] + Math.sin(angle) * u[i]) * (1 + 0.1 * k));
        point = [base.x + off[0], base.y + off[1], base.z + off[2]];
      }
      ids.push(this.atom(p.el, point));
      this.bond(k === 0 ? on : ids[p.from], ids[k], p.order ?? 1);
      if (p.ring !== undefined) this.bond(ids[k], ids[p.ring], 1);
    });
    return ids[0];
  }
  molfile() {
    return molfile3D(this.atoms, this.bonds);
  }
}

export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalise = (v) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

// The signed area of a polygon (points [x, y], y up): > 0 anticlockwise.
export const signedArea = (points) => points.reduce((s, p, i) => {
  const q = points[(i + 1) % points.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

// A six-membered ring as the truth sees it: `ring` six element symbols in ring order, going round
// anticlockwise (way +1) or clockwise (way −1) seen from above; groups: [{ position, text, face: +1 up |
// −1 down }]. A regular hexagon in the xy plane, each group out of the ring and above or below it.
// Returns the molfile.
export function ringTruth(ring, way, groups) {
  const b = new Builder();
  const ids = ring.map((el, k) => {
    const angle = (way * k * Math.PI) / 3;
    return b.atom(el, [1.4 * Math.cos(angle), 1.4 * Math.sin(angle), 0]);
  });
  ids.forEach((id, k) => b.bond(id, ids[(k + 1) % 6]));
  for (const g of groups) {
    const a = b.atoms[ids[g.position]];
    const out = normalise([a.x, a.y, 0]);
    const dir = normalise([0.55 * out[0], 0.55 * out[1], 0.85 * g.face]);
    b.group(ids[g.position], g.text, [a.x + 1.5 * dir[0], a.y + 1.5 * dir[1], a.z + 1.5 * dir[2]], dir);
  }
  return b.molfile();
}

// Canonical SMILES, InChI and InChIKey of a molfile, as RDKit reads it (a 3D one: stereo from the
// coordinates).
export function identityOf(RDKit, text) {
  const mol = RDKit.get_mol(text, JSON.stringify({ removeHs: true }));
  if (!mol) return { smiles: null, inchi: null, inchikey: null };
  try {
    const inchi = mol.get_inchi();
    return { smiles: mol.get_smiles(), inchi, inchikey: inchi ? RDKit.get_inchikey_for_inchi(inchi) : null };
  } finally {
    mol.delete();
  }
}
