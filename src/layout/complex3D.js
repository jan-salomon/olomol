// A metal complex in 3D, optimised as a whole by UFF (uff.js) instead of by
// rules: its ligands' shapes (chelate rings, a porphyrin's plane, a
// cyclohexyl's chair, a terpyridine's pocket) come out of the bonds, angles,
// torsions, planarity and van der Waals contacts of every atom at once.
//
// What is still chosen, not computed:
// - the coordination polyhedron's candidates for the number of donors (a
//   tetrahedron or a square for four, a trigonal bipyramid or a square
//   pyramid for five, the octahedron for six…); d8 metals (Pt, Pd, Au, Rh, Ir,
//   Ni with carbon donors) and copper(II) only the square (and the square
//   pyramid), an electronic preference a force field can't know; between the
//   others the energy decides, the donors pushing each other apart (Kepert);
// - which donor goes on which corner, among the arrangements that fit the
//   drawing equally well (costOf: cis and trans as drawn, a chelate's donors
//   next to each other); between them, and between the polyhedra, the lowest
//   energy decides (a terpyridine meridional, a porphyrin's iron square);
// - the start: each ligand as OpenChemLib builds it (with a carbon standing
//   in for the metal, so that a chelate's donors face it), turned onto its
//   corners, hydrogens added; from there UFF moves every atom.
// The metal's angles are held to the polyhedron chosen (uff.js), its bonds
// and everything else are UFF's.
import { atomTypes, forceField, metalType, minimise } from './uff.js';
import { piBondOrders } from './hueckel.js';
import { abbreviationOf } from '../chem/abbreviations.js';
import { parseMolfile } from '../io/molfile.js';
import { withMapNumbers } from './conformer.js';
import { permutations } from './geometry.js';

const DEG = Math.PI / 180;
const START = 2.0; // Å from the metal, where the donors start
const BOND_TO_METAL = 1.8; // a metal's bonds in the drawing, in bond lengths: room for the labels round it (as threeD.js)
const CHELATE_GROWTH = 1.6; // a chelate made at most this much larger to reach its donors' places
const NONMETALS = new Set(['H', 'He', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Si', 'P', 'S', 'Cl', 'Ar', 'As', 'Se', 'Br', 'Kr', 'Te', 'I', 'Xe', 'At', 'Rn', '*']);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const times = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.sqrt(dot(a, a));
const unit = (a) => (norm(a) > 1e-9 ? times(a, 1 / norm(a)) : a.map(() => 0));
const centroid = (points) => times(points.reduce(add), 1 / points.length);
const turn = (r, v) => r.map((row) => dot(row, v));
const ring = (n, y, r, start = 0) => Array.from({ length: n }, (_, k) => [r * Math.cos(start + (2 * Math.PI * k) / n), y, r * Math.sin(start + (2 * Math.PI * k) / n)]);

// The polyhedra to try for n donors: [{ name, corners (unit vectors, main axis up), digit (of the metal's UFF type) }].
function polyhedra(n, squareOnly) {
  const tetrahedron = { name: 'tetrahedron', digit: 3, corners: [[0, 1, 0], ...ring(3, -1 / 3, Math.sqrt(8) / 3, 90 * DEG)] };
  const square = { name: 'square', digit: 4, corners: [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]] };
  const s = Math.sqrt(1 - 0.55 ** 2);
  return {
    2: [{ name: 'linear', digit: 1, corners: [[1, 0, 0], [-1, 0, 0]] }],
    3: [{ name: 'trigonal', digit: 2, corners: [90, 210, 330].map((a) => [Math.cos(a * DEG), Math.sin(a * DEG), 0]) }],
    4: squareOnly ? [square] : [tetrahedron, square],
    5: [
      ...(squareOnly ? [] : [{ name: 'trigonal bipyramid', digit: 6, corners: [[0, 1, 0], [0, -1, 0], ...ring(3, 0, 1)] }]),
      { name: 'square pyramid', digit: 6, corners: [[0, 1, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]] },
    ],
    6: [{ name: 'octahedron', digit: 6, corners: [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] }],
    7: [{ name: 'pentagonal bipyramid', digit: 6, corners: [[0, 1, 0], [0, -1, 0], ...ring(5, 0, 1)] }],
    8: [{ name: 'square antiprism', digit: 6, corners: [...ring(4, 0.55, s), ...ring(4, -0.55, s, 45 * DEG)] }],
  }[n] ?? [];
}

// The arrangements worth optimising on a polyhedron: one per isomer (the
// angles between every two donors, so mirror images are one: Λ or Δ is the
// drawing's, asDrawn), those that fit the drawing nearly as well as the best.
function arrangements(donors, corners, costOf) {
  const byIsomer = new Map();
  for (const order of permutations(donors.length)) {
    const cost = costOf(corners, order, Infinity, true);
    const key = donors.map((_, i) => donors.map((__, j) => Math.round(Math.acos(Math.max(-1, Math.min(1, dot(corners[order[i]], corners[order[j]])))) / (10 * DEG)))).join();
    if (!byIsomer.has(key) || byIsomer.get(key).cost > cost) byIsomer.set(key, { cost, order });
  }
  const all = [...byIsomer.values()].sort((p, q) => p.cost - q.cost);
  return all.filter((a) => a.cost <= all[0].cost + 0.35).slice(0, 40).map((a) => ({ ...a, extra: a.cost - all[0].cost }));
}

// Hydrogen directions on an atom at p with neighbours in `towards` (unit
// vectors), sp (1), sp2 (2) or sp3 (3): the free corners of its shape.
function freeDirections(towards, hyb, count, reference) {
  const slots = (hyb === 1 ? 2 : hyb === 2 ? 3 : 4) - towards.length;
  if (count <= 0 || slots <= 0) return [];
  const anyNormal = (v) => unit(cross(v, Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  let out = [];
  if (!towards.length) {
    out = hyb === 1 ? [[1, 0, 0], [-1, 0, 0]] : hyb === 2 ? ring(3, 0, 1) : [[0, 1, 0], ...ring(3, -1 / 3, Math.sqrt(8) / 3)];
  } else if (towards.length === 1) {
    const [u] = towards;
    if (hyb === 1) out = [times(u, -1)];
    else {
      // in the plane of a neighbour's neighbour if there is one (CH2= and NH2 of an amide flat with the rest)
      let p = reference ? sub(reference, times(u, dot(reference, u))) : null;
      p = p && norm(p) > 1e-3 ? unit(p) : anyNormal(u);
      const q = unit(cross(u, p));
      const theta = hyb === 2 ? 120 * DEG : 109.47 * DEG;
      const turns = hyb === 2 ? [0, Math.PI] : [Math.PI, Math.PI / 3, -Math.PI / 3];
      out = turns.map((phi) => add(times(u, Math.cos(theta)), times(add(times(p, Math.cos(phi)), times(q, Math.sin(phi))), Math.sin(theta))));
    }
  } else if (towards.length === 2) {
    const back = unit(times(add(towards[0], towards[1]), -1));
    if (hyb === 2 || norm(back) < 1e-6) out = [norm(back) > 1e-6 ? back : anyNormal(towards[0])];
    else {
      const n = unit(cross(towards[0], towards[1]));
      const a = 54.74 * DEG;
      out = [add(times(back, Math.cos(a)), times(n, Math.sin(a))), add(times(back, Math.cos(a)), times(n, -Math.sin(a)))];
    }
  } else {
    const back = unit(times(towards.reduce(add), -1));
    out = [norm(back) > 1e-6 ? back : anyNormal(towards[0])];
  }
  return out.slice(0, count);
}

// A label (R, Ph, PPh3) as the atom it hangs by, its hydrogens filling up its valence (PH3 for PPh3, CH3 for
// Ph or R): its symbol in the molecule and its molfile (where it is "A" with the label as an alias).
// The element a label hangs by: P for PPh3, O for OMe, C for Ph or R.
export function labelAtom(alias, charge = 0) {
  const smiles = abbreviationOf({ el: '*', alias, charge })?.smiles ?? '';
  // (the atom after the *: in brackets any symbol ([P], [Si]); outside them only the organic subset, Cl and
  // Br its two-letter ones, an aromatic atom in lower case (Bn's *Cc1…: C, not "Cc"))
  const bracketed = smiles.match(/^\*\[\d*([A-Z][a-z]?|[bcnops])/)?.[1];
  const plain = smiles.match(/^\*(Cl|Br|[BCNOPSFI]|[bcnops])/)?.[1];
  const symbol = bracketed ?? plain;
  return symbol ? symbol.charAt(0).toUpperCase() + symbol.slice(1) : 'C';
}

function withStandIns(molecule) {
  if (!molecule.elements.includes('*')) return molecule;
  const { atoms } = parseMolfile(molecule.molfile);
  const standIn = molecule.elements.map((el, i) => (el === '*' ? labelAtom(atoms[i]?.alias, atoms[i]?.charge ?? 0) : el));
  const lines = molecule.molfile.split('\n');
  const count = Number(lines[3].slice(0, 3));
  const out = [];
  for (let k = 0; k < lines.length; k++) {
    if (k >= 4 && k < 4 + count && molecule.elements[k - 4] === '*') {
      const line = lines[k].padEnd(34);
      out.push(`${line.slice(0, 31)}${standIn[k - 4].padEnd(3)}${line.slice(34)}`);
    } else if (/^A\s+\d+\s*$/.test(lines[k])) {
      k += 1; // (its alias line: the label's text)
    } else out.push(lines[k]);
  }
  return { ...molecule, elements: standIn, molfile: out.join('\n') };
}

// Returns buildComplex's result ({ points (bond lengths 1, y up), metal, hydrogens: [[atom, point]], angstrom:
// [{ el, x, y, z }] (every atom, the molecule's own first, then the hydrogens, in Å: for a file), … }), or
// null to build it the old way.
// A molfile as OpenChemLib reads it: { mol, ocl: Map the molfile's atom index -> OpenChemLib's }, or null.
// (OpenChemLib moves hydrogens drawn as atoms to the end of its list, so each atom is read back by a map
// number written into the molfile.)
export function readBack(OCL, molfile) {
  try {
    const mol = OCL.Molecule.fromMolfile(withMapNumbers(molfile));
    mol.ensureHelperArrays(OCL.Molecule.cHelperRings);
    const ocl = new Map();
    for (let i = 0; i < mol.getAllAtoms(); i++) if (mol.getAtomMapNo(i) > 0) ocl.set(mol.getAtomMapNo(i) - 1, i);
    return { mol, ocl };
  } catch {
    return null;
  }
}

// `shapes`: the centre's shape given instead of the polyhedra to choose from (a transition state's bipyramid, a
// main-group centre's VSEPR shape: [{ name, digit, corners }]); the centre is then typed as the element it is
// (a carbon C_3, the S of sulfate S_3+6), not as a metal, and `hydrogens` (by atom, our own count, a partial
// bond counted as a bond) say each atom's, where OpenChemLib, which has no partial bonds, would give a
// transition state's leaving group one.
export function optimisedComplex({ OCL, molecule: drawn, m, donors, pieces, costOf, squarePlanar, ligandIn3D, bestRotation, shapes: given = null, hydrogens: counted = null }) {
  const molecule = withStandIns(drawn);
  const { elements, links } = molecule;
  const heavy = elements.length;
  // aromaticity and hydrogens as OpenChemLib reads the drawing (the bonds to the metal that a molfile has no place for left out)
  const read = readBack(OCL, molecule.molfile);
  if (!read || read.mol.getAllAtoms() < heavy) return null;
  const { mol, ocl } = read;
  // (OpenChemLib's count, which has no partial bonds: one H fewer for each, a transition state's Br none)
  const partials = elements.map((_, i) => links.filter((l) => l.kind === 'partial' && (l.a === i || l.b === i)).length);
  const hydrogens = elements.map((el, i) => (i === m || !ocl.has(i) ? 0 : counted ? counted[i] ?? 0 : Math.max(0, mol.getImplicitHydrogens(ocl.get(i)) - partials[i])));
  // (a partial bond, forming or breaking: order ½, which UFF makes longer and weaker). `kekule`: the order as
  // drawn, for the atom types (as RDKit types them); `order`, for the force field, a conjugated bond's from the
  // π system (hueckel.js)
  const bonds = links.filter((l) => l.kind !== 'hbond').map((l) => {
    if (l.kind === 'partial') return { a: l.a, b: l.b, order: 0.5, kekule: 0.5 };
    if (l.a === m || l.b === m) return { a: l.a, b: l.b, order: 1, kekule: 1 };
    const order = Math.min(3, Math.max(1, l.order ?? 1));
    return { a: l.a, b: l.b, order, kekule: order };
  });
  // the heavy atoms' hybridization (hydrogens counted, not yet atoms), for placing the hydrogens
  const heavyAtoms = elements.map((el, i) => ({ el, h: hydrogens[i], aromatic: ocl.has(i) && mol.isAromaticAtom(ocl.get(i)) }));
  const { hyb: heavyHyb } = atomTypes(heavyAtoms, bonds, new Set([m]));
  // each conjugated bond as conjugated as its whole π system makes it: 1 + its Hückel π bond order (benzene's
  // 1.67, salen's aryl–CH=N about 1.4, a phenyl on a porphyrin's meso carbon little, so it turns out of the way)
  const charges = elements.map((_, i) => (ocl.has(i) ? mol.getAtomCharge(ocl.get(i)) : 0));
  const piOrders = piBondOrders({ elements, bonds, charges, pi: (i) => i !== m && heavyHyb[i] === 2, skip: (bond) => bond.a === m || bond.b === m || bond.order === 0.5 });
  for (const [k, p] of piOrders) bonds[k].order = 1 + p;
  // each ligand's own shape (Å): with a carbon standing in for the metal while it has four donors or fewer
  const shapes = new Map();
  for (const piece of pieces) {
    if (piece.atoms.length === 1) continue;
    const shape = (piece.donors.length <= 4 && ligandIn3D(OCL, molecule, piece, m, { angstrom: true, polish: false }))
      || ligandIn3D(OCL, molecule, piece, m, { standIn: false, angstrom: true, polish: false });
    if (!shape) return null;
    shapes.set(piece, shape);
  }
  const near = Array.from({ length: heavy }, () => []);
  for (const { a, b } of bonds) {
    near[a].push(b);
    near[b].push(a);
  }

  // the start for donors on these corners (unit vectors by donor): heavy atoms placed, hydrogens added
  const start = (cornerOf) => {
    const out = new Array(heavy);
    out[m] = [0, 0, 0];
    for (const piece of pieces) {
      if (piece.atoms.length === 1) {
        out[piece.atoms[0]] = times(cornerOf.get(piece.atoms[0]), START);
        continue;
      }
      const shape = shapes.get(piece);
      const ds = piece.donors.map((d) => shape.points[d]);
      const from = [...ds];
      const to = piece.donors.map((d) => times(cornerOf.get(d), START));
      if (shape.stand) {
        from.push(shape.stand);
        to.push([0, 0, 0]);
      }
      if (piece.donors.length === 1) {
        // a ligand on one donor: its body pointing away from the metal, turned to lie across the page where it can
        const axis = unit(sub(ds[0], shape.stand ?? centroid(piece.atoms.map((i) => shape.points[i]))));
        const rest = centroid(piece.atoms.filter((i) => i !== piece.donors[0]).map((i) => shape.points[i]));
        if (!shape.stand) {
          from.push(add(ds[0], times(axis, -START)));
          to.push([0, 0, 0]);
        }
        const across = sub(sub(rest, ds[0]), times(axis, dot(sub(rest, ds[0]), axis)));
        const v = cornerOf.get(piece.donors[0]);
        const [w] = [[1, 0, 0], [0, 1, 0]].map((e) => sub(e, times(v, dot(e, v)))).sort((p, q) => norm(q) - norm(p));
        if (norm(across) > 1e-3) {
          from.push(add(ds[0], unit(across)));
          to.push(add(times(v, START), unit(w)));
        }
      }
      const [cf, ct] = [centroid(from), centroid(to)];
      const r = bestRotation(from.map((p) => sub(p, cf)), to.map((p) => sub(p, ct)));
      for (const i of piece.atoms) out[i] = add(turn(r, sub(shape.points[i], cf)), ct);
    }
    // hydrogens, 1.0 Å out along the free corners of each atom's shape
    const atoms = elements.map((el, i) => ({ el, h: 0, aromatic: heavyAtoms[i].aromatic }));
    const all = [...out];
    const allBonds = [...bonds];
    for (let i = 0; i < heavy; i++) {
      if (!hydrogens[i]) continue;
      const towards = near[i].map((j) => unit(sub(out[j], out[i])));
      const second = near[i].flatMap((j) => near[j].filter((k) => k !== i)).map((k) => sub(out[k], out[i]))[0] ?? null;
      const directions = freeDirections(towards, heavyHyb[i] ?? 3, hydrogens[i], second);
      while (directions.length < hydrogens[i]) directions.push(unit([Math.sin(directions.length + 1), Math.cos(directions.length * 2 + 1), 0.3]));
      for (const d of directions) {
        all.push(add(out[i], d));
        atoms.push({ el: 'H', h: 0 });
        allBonds.push({ a: i, b: all.length - 1, order: 1 });
      }
    }
    return { atoms, bonds: allBonds, x: Float64Array.from(all.flat()) };
  };

  // every candidate (a polyhedron and an arrangement on it) optimised a little, the two best on, the best to the end;
  // the drawing's preference counts between arrangements on one polyhedron (about one weak hint per 3 kcal/mol),
  // not between polyhedra: those the energy alone decides
  const candidates = (given ?? polyhedra(donors.length, squarePlanar)).flatMap((shape) => arrangements(donors, shape.corners, costOf).map((a) => ({ shape, ...a })));
  if (!candidates.length) return null;
  const tried = [];
  for (const candidate of candidates) {
    const cornerOf = new Map(donors.map((d, k) => [d, candidate.shape.corners[candidate.order[k]]]));
    const { atoms, bonds: allBonds, x } = start(cornerOf);
    const kekule = allBonds.map((bond) => ({ ...bond, order: bond.kekule ?? bond.order }));
    const { types, hyb } = atomTypes(atoms, kekule, new Set([m]));
    types[m] = given ? atomTypes(atoms, kekule, new Set()).types[m] : metalType(elements[m], candidate.shape.digit);
    const field = forceField({ atoms, bonds: allBonds, types, hyb, metal: { index: m, places: cornerOf } });
    if (!field) return null;
    field.hydrogensOn = allBonds.slice(bonds.length).map((b) => b.a);
    const energy = minimise(field, x, { iterations: candidates.length > 2 ? 120 : 400 });
    tried.push({ score: energy + 10 * candidate.extra, field, x, candidate, atoms, allBonds, types, hyb, cornerOf });
  }
  tried.sort((p, q) => p.score - q.score);
  const finalists = tried.slice(0, 2);
  if (candidates.length > 2) for (const f of finalists) f.score = minimise(f.field, f.x, { iterations: 600 }) + 10 * f.candidate.extra;
  const best = finalists.reduce((p, q) => (q.score < p.score ? q : p));
  // conjugation as this geometry has it: each π bond's β with the overlap of its two p orbitals (each atom's
  // axis across the plane of its bonds), the orders from it, the force field with them, until the two agree
  // (a phenyl its neighbours turn out of the porphyrin's plane conjugates less, and turns further)
  const near3 = Array.from({ length: best.atoms.length }, () => []);
  for (const { a, b } of best.allBonds) {
    near3[a].push(b);
    near3[b].push(a);
  }
  const at = (i) => [best.x[3 * i], best.x[3 * i + 1], best.x[3 * i + 2]];
  const axis = (i) => (near3[i].length < 2 ? null : unit(cross(sub(at(near3[i][0]), at(i)), sub(at(near3[i][1]), at(i)))));
  for (let cycle = 0; cycle < 6; cycle++) {
    const overlap = (k) => {
      const [u, v] = [axis(bonds[k].a), axis(bonds[k].b)];
      return u && v && norm(u) > 0 && norm(v) > 0 ? Math.abs(dot(u, v)) : 1;
    };
    let change = 0;
    for (const [k, pk] of piBondOrders({ elements, bonds, charges, pi: (i) => i !== m && heavyHyb[i] === 2, skip: (bond) => bond.a === m || bond.b === m || bond.order === 0.5, overlap })) {
      change = Math.max(change, Math.abs(1 + pk - bonds[k].order));
      bonds[k].order = 1 + pk; // (best.allBonds holds these very bonds)
    }
    if (change < 0.02) break;
    const field = forceField({ atoms: best.atoms, bonds: best.allBonds, types: best.types, hyb: best.hyb, metal: { index: m, places: best.cornerOf } });
    if (!field) break;
    field.hydrogensOn = best.field.hydrogensOn;
    best.field = field;
    minimise(best.field, best.x, { iterations: 600 });
  }
  best.energy = minimise(best.field, best.x, { iterations: 2000, tolerance: 0.005 });

  // back to the drawing's units: the metal in the middle, bond lengths 1 (its own bonds as they come out)
  const x = best.x;
  const point = (i) => [x[3 * i] - x[3 * m], x[3 * i + 1] - x[3 * m + 1], x[3 * i + 2] - x[3 * m + 2]];
  const ligandBonds = bonds.filter(({ a, b, order }) => a !== m && b !== m && order !== 0.5); // (partial bonds long on purpose)
  const lengths = ligandBonds.map(({ a, b }) => norm(sub(point(a), point(b))));
  const scale = 1 / (lengths.length ? lengths.reduce((s, v) => s + v, 0) / lengths.length : 1.4);
  const points = Array.from({ length: heavy }, (_, i) => times(point(i), scale));
  // the hydrogens UFF placed (for a model shown as it is): each on its atom
  const placedHydrogens = best.field.hydrogensOn.map((on, k) => [on, times(point(heavy + k), scale)]);
  // A metal's bonds drawn 1.8 bond lengths long, as before UFF built complexes (UFF's own are about 1.4 to 1.6, and
  // shorter still seen at a slant: the labels round the metal crowd): each ligand moved out along its bonds to the
  // metal, a chelate made as large as its donors' places need (at most 1.6×), the hydrogens with their atoms. Only
  // the drawing and the model: a file gets UFF's own geometry (`angstrom`, below). A transition state's centre (a
  // carbon) keeps UFF's lengths.
  if (!NONMETALS.has(elements[m])) {
    const owner = new Map();
    pieces.forEach((piece, k) => piece.atoms.forEach((i) => owner.set(i, k)));
    const moves = pieces.map((piece) => {
      const ds = piece.donors.filter((d) => norm(points[d]) > 1e-6);
      if (!ds.length) return null;
      const c = centroid(ds.map((d) => points[d]));
      const targets = ds.map((d) => times(unit(points[d]), BOND_TO_METAL));
      const ct = centroid(targets);
      let k = 1;
      if (ds.length > 1) {
        const across = ds.reduce((s, d, i) => s + dot(sub(points[d], c), sub(targets[i], ct)), 0);
        const spread = ds.reduce((s, d) => s + dot(sub(points[d], c), sub(points[d], c)), 0);
        k = Math.max(1, Math.min(CHELATE_GROWTH, spread > 1e-9 ? across / spread : 1));
      }
      return (p) => add(ct, times(sub(p, c), k));
    });
    const move = (i, p) => (owner.has(i) && moves[owner.get(i)] ? moves[owner.get(i)](p) : p);
    for (let i = 0; i < heavy; i++) points[i] = move(i, points[i]);
    for (const h of placedHydrogens) h[1] = move(h[0], h[1]);
  }
  // and as UFF has it, for a file: every atom with its hydrogens, in Å, the metal at the origin
  const angstrom = best.atoms.map(({ el }, i) => ({ el, x: point(i)[0], y: point(i)[1], z: point(i)[2] }));
  const reach = donors.reduce((s, d) => s + norm(points[d]), 0) / donors.length;
  const { shape } = best.candidate;
  const square = shape.name === 'square';
  return {
    points, metal: m, outTo: 1.44, flat: square && donors.length === 4,
    prefer: { 2: [0, 0], 3: [0, 0], 4: square ? [0, 0] : [0, 15], 5: [12, 15], 6: [25, 15], 7: [12, 15], 8: [12, 15] }[donors.length],
    axial: null,
    pieces: pieces.map(({ atoms, donors: d }) => ({ atoms, donors: d, wraps: d.length > 2 && norm(centroid(d.map((i) => points[i]))) < 0.5 * reach })),
    polyhedron: shape.name, energy: best.energy, hydrogens: placedHydrogens, angstrom,
  };
}
