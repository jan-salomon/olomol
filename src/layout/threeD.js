// The 3D layout engine: the molecule built in 3D, turned to the side that
// shows it best and projected onto the page; wedges (towards you) and
// hashed wedges (away) give the depth. A metal complex (with OpenChemLib) is
// optimised as a whole by UFF on its coordination polyhedron (complex3D.js,
// uff.js): the polyhedron and which donor goes where tried out, the lowest
// energy kept. So are a transition state round its five-bonded atom (SN2: a
// trigonal bipyramid, the bonds forming and breaking axial) and a main-group
// atom beyond the octet (its VSEPR shape, below): the centre's angles held to
// that shape, everything else (bond lengths, the partial bonds' stretch, every
// hydrogen) UFF's. Without OpenChemLib, or where UFF can't be set up, it is
// built the older way: the polyhedron by the number
// of donors, each ligand in its own 3D shape (OpenChemLib, the metal standing
// in as a carbon bonded to its donors) or flat as drawn, attached rigidly
// along its bonds to the metal: a chelate on positions next to each other,
// and ligands opposite each other in the drawing (trans) opposite in 3D. A
// main-group atom with more than an octet or five electron pairs round it
// (PCl5, SF6, ClO4⁻, SF4, XeF4) is built the same way, its shape by VSEPR:
// lone pairs take places of the polyhedron too. Other molecules get
// OpenChemLib's 3D structure (MMFF94s+), passed in.
// Coordinates here: bond lengths 1, y up; the page's y points down.
export { moleculeIn3D } from './conformer.js'; // (its own module, for the worker)
import { t } from '../i18n/i18n.js';
import { withChiralFlag, withMapNumbers } from './conformer.js';
import { layoutProblems, permutations, rmsdAfterRotation } from './geometry.js';
import { parseMolfile } from './molfile.js';
import { parseMolfile as readMolfileAtoms } from '../io/molfile.js';
import { optimisedComplex } from './complex3D.js';

const DEG = Math.PI / 180;
const NONMETALS = new Set(['H', 'He', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Si', 'P', 'S', 'Cl', 'Ar', 'As', 'Se', 'Br', 'Kr', 'Te', 'I', 'Xe', 'At', 'Rn', '*']);
const SQUARE_PLANAR = new Set(['Pt', 'Pd', 'Au', 'Rh', 'Ir']); // d8: four ligands in a square
const DEPTH = 0.45; // a bond this steeply (sine of the angle) towards (away from) the viewer: a wedge (hashed wedge)
const BOND_TO_METAL = 1.8; // metal–ligand bonds, longer than the rest: room for the labels
const ROOM = 0.9; // atoms not bonded to each other should be at least this far apart on the page
const LABEL_ROOM = 0.25; // and this much more for each of them written out (O, NH2, Cl: not a bare corner)

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const times = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.sqrt(dot(a, a));
const unit = (a) => (norm(a) > 1e-9 ? times(a, 1 / norm(a)) : a.map(() => 0));
const centroid = (points) => times(points.reduce(add), 1 / points.length);
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))));
const turn = (m, v) => m.map((row) => dot(row, v));

// n points evenly round a circle at height y, radius r, from angle `start`
const ring = (n, y, r, start = 0) => Array.from({ length: n }, (_, k) => [r * Math.cos(start + (2 * Math.PI * k) / n), y, r * Math.sin(start + (2 * Math.PI * k) / n)]);

// The directions of n ligands round a metal (unit vectors), main axis up.
function polyhedron(n, squarePlanar) {
  const s = Math.sqrt(1 - 0.55 ** 2);
  return {
    1: [[1, 0, 0]],
    2: [[1, 0, 0], [-1, 0, 0]],
    3: [90, 210, 330].map((a) => [Math.cos(a * DEG), Math.sin(a * DEG), 0]),
    4: squarePlanar ? [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]] : [[0, 1, 0], ...ring(3, -1 / 3, Math.sqrt(8) / 3, 90 * DEG)],
    5: [[0, 1, 0], [0, -1, 0], ...ring(3, 0, 1)],
    6: [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]],
    7: [[0, 1, 0], [0, -1, 0], ...ring(5, 0, 1)],
    8: [...ring(4, 0.55, s), ...ring(4, -0.55, s, 45 * DEG)],
  }[n] ?? null;
}

const NOBLE = new Set(['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn']);
const NONMETALS_ONLY = (elements) => elements.every((el) => NONMETALS.has(el));

// The atom a main-group molecule is built round, or null: the one atom with
// more than an octet (bond orders over 4: ClO4⁻, SO4²⁻, POCl3), five or
// more electron pairs (bonds and lone pairs: PCl5, SF4, I3⁻) or a noble gas
// with bonds (XeF4). Only with nothing but single atoms on it (OpenChemLib
// does sulfones and the like better), unless `anyLigands` (when OpenChemLib
// can't: it has no MMFF94 types for P with five bonds).
function mainGroupCentre({ elements, links, lonePairs = [] }, at, anyLigands) {
  const order = (i) => links.filter((l) => !l.kind && (l.a === i || l.b === i)).reduce((sum, l) => sum + l.order, 0);
  const centres = elements.flatMap((el, i) => {
    if (el === 'H' || el === '*' || el === 'C' || at(i).length < 2) return [];
    return order(i) > 4 || at(i).length + (lonePairs[i] ?? 0) >= 5 || NOBLE.has(el) ? [i] : [];
  });
  if (centres.length !== 1) return null;
  const [c] = centres;
  // (a label is a group, not an end atom: Ph3P=O drawn with Ph labels is a molecule for the force field, its phenyls drawn out)
  return anyLigands || at(c).every((j) => at(j).length === 1 && elements[j] !== '*') ? c : null;
}

// Where n atoms go round an atom with `pairs` lone pairs (VSEPR): {
// vertices, prefer (the textbook view, as in buildComplex), flat }. Lone
// pairs take the equator of a trigonal bipyramid (seesaw SF4, T-shaped
// ClF3, linear XeF2), opposite places of an octahedron (square pyramidal
// BrF5, square planar XeF4) and the top of a tetrahedron (pyramidal ClO3⁻).
// The tetrahedron as textbooks draw it: two bonds in the page (up and to
// the right), a wedge and a hashed wedge.
function vseprShape(n, pairs) {
  const steric = Math.min(n + pairs, 7);
  if (steric === 5 && n === 2) return { vertices: polyhedron(2), prefer: [0, 0] };
  if (steric === 6 && n === 4) return { vertices: polyhedron(4, true), prefer: [0, 0], flat: true };
  const all = steric === 4 ? [[0, 1, 0], ...ring(3, -1 / 3, Math.sqrt(8) / 3)] : polyhedron(steric);
  if (!all || n < 2) return null;
  // the places lone pairs take, from the end of each list
  const keep = { 2: [0, 1], 3: [0, 1, 2], 4: [1, 2, 3, 0], 5: [0, 1, 2, 3, 4], 6: [0, 2, 3, 4, 5, 1], 7: [0, 2, 3, 4, 5, 6, 1] }[steric];
  const vertices = keep.slice(0, n).map((k) => all[k]);
  return { vertices, prefer: { 2: [0, 0], 3: [0, 0], 4: [0, 0], 5: [12, 15], 6: [25, 15], 7: [12, 15] }[steric] };
}

// The rotation (3×3) that best turns the points `from` onto `to`, both
// centred, paired (Horn 1987: the eigenvector of the largest eigenvalue of
// a 4×4 matrix, a quaternion; found by power iteration).
export function bestRotation(from, to) {
  const s = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  from.forEach((f, k) => {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s[i][j] += f[i] * to[k][j];
  });
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = s;
  const n = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const shift = n.flat().reduce((sum, v) => sum + Math.abs(v), 0) + 1; // makes every eigenvalue positive, keeps their order
  let q = [1, 0.3, 0.2, 0.1];
  for (let it = 0; it < 500; it++) q = unit(n.map((row, i) => dot(row, q) + shift * q[i]));
  const [w, x, y, z] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

// A ligand of a complex in 3D on its own, by OpenChemLib (MMFF94s+ where it
// has atom types): the metal stands in as a carbon bonded to the ligand's
// donors, each donor one charge up for the bond it gets (water CH3OH2+, a
// cyanide CH3CN, ethylenediamine closed to a five-membered ring). { points
// (by molecule atom index, bond lengths), stand (the carbon's point) }, or
// null (labels such as R, more than four donors). `standIn` false: the
// ligand free, without the carbon (a ligand with more donors than that).
// `angstrom`: in Å, as generated, instead of bond lengths 1; `polish` false:
// the conformer as generated, not minimised (a start for UFF, which minimises it anyway).
export function ligandIn3D(OCL, molecule, piece, m, { standIn = true, angstrom = false, polish = true } = {}) {
  const { elements, links, points } = molecule;
  if ((standIn && piece.donors.length > 4) || piece.atoms.some((i) => !NONMETALS.has(elements[i]) || elements[i] === '*')) return null;
  const { atoms } = readMolfileAtoms(molecule.molfile);
  const index = new Map(piece.atoms.map((a, k) => [a, k]));
  const stand = piece.atoms.length; // the metal's stand-in
  const toMetal = (d) => links.find((l) => (l.a === d && l.b === m) || (l.b === d && l.a === m));
  const charge = (i) => (atoms[i]?.charge ?? 0) + (standIn && piece.donors.includes(i) && toMetal(i)?.kind === 'dative' ? 1 : 0);
  const bonds = links.filter((l) => index.has(l.a) && index.has(l.b) && l.kind !== 'hbond')
    .map((l) => [index.get(l.a), index.get(l.b), l.kind ? 1 : l.order, !l.kind && l.order === 1 ? { wedge: 1, hash: 6 }[l.stereo] ?? 0 : 0]); // (the ligand's own R/S, as drawn)
  if (standIn) for (const d of piece.donors) bonds.push([index.get(d), stand, 1, 0]);
  const f = (v) => v.toFixed(4).padStart(10);
  const centre = points[m];
  const lines = ['', '  olomol', '', `${String(stand + Number(standIn)).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...piece.atoms.map((i) => `${f(points[i][0])}${f(-points[i][1])}${f(0)} ${elements[i].padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...(standIn ? [`${f(centre[0])}${f(-centre[1])}${f(0)} C   0  0  0  0  0  0  0  0  0  0  0  0`] : []),
    ...bonds.map(([a, b, order, code]) => `${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}${String(order).padStart(3)}${String(code).padStart(3)}`)];
  const charged = piece.atoms.flatMap((i, k) => (charge(i) ? [[k + 1, charge(i)]] : []));
  for (let k = 0; k < charged.length; k += 8) lines.push(`M  CHG${String(charged.slice(k, k + 8).length).padStart(3)}${charged.slice(k, k + 8).map(([i, c]) => `${String(i).padStart(4)}${String(c).padStart(4)}`).join('')}`);
  lines.push('M  END');
  try {
    const mol = OCL.Molecule.fromMolfile(withChiralFlag(withMapNumbers(lines.join('\n'))));
    const conformer = new OCL.ConformerGenerator(42).getOneConformerAsMolecule(mol);
    if (!conformer) return null;
    try {
      if (polish) new OCL.ForceFieldMMFF94(conformer, OCL.ForceFieldMMFF94.MMFF94SPLUS).minimise();
    } catch {
      // no MMFF94 types: as generated
    }
    const found = new Array(stand + Number(standIn));
    for (let i = 0; i < conformer.getAllAtoms(); i++) {
      const k = conformer.getAtomMapNo(i);
      if (k) found[k - 1] = [conformer.getAtomX(i), conformer.getAtomY(i), conformer.getAtomZ(i)];
    }
    if (found.some((p) => !p) || found.length < stand) return null;
    const lengths = bonds.map(([a, b]) => norm(sub(found[a], found[b])));
    const scale = angstrom ? 1 : 1 / (lengths.reduce((s, x) => s + x, 0) / lengths.length || 1);
    const byAtom = new Array(elements.length);
    piece.atoms.forEach((i, k) => {
      byAtom[i] = times(found[k], scale);
    });
    return { points: byAtom, stand: standIn ? times(found[stand], scale) : null };
  } catch {
    return null;
  }
}

// A ligand with more donors than a stand-in carbon can take (EDTA: six)
// wrapped round the metal: OpenChemLib's free ligand, its donors fitted onto
// their places, then relaxed by springs: the donors drawn to their places
// (loosely: a chelate's bite is smaller than the polyhedron's angle), each
// bond (stiffly) and each angle as in the free ligand, the angle at a donor
// between the metal and the rest of the ligand opened out, and atoms kept
// apart (from each other and from the metal). Map atom -> point, or null.
function wrapLigand(OCL, molecule, piece, m, places, reach) {
  const free = ligandIn3D(OCL, molecule, piece, m, { standIn: false });
  if (!free) return null;
  const inPiece = new Set(piece.atoms);
  const bonds = molecule.links.filter((l) => inPiece.has(l.a) && inPiece.has(l.b) && l.kind !== 'hbond');
  const near = new Map(piece.atoms.map((i) => [i, []]));
  for (const { a, b } of bonds) {
    near.get(a).push(b);
    near.get(b).push(a);
  }
  // the start: the free ligand turned (and as large as need be) so that its donors lie near their places
  const spread = (list) => list.reduce((s, p, i) => s + list.slice(i + 1).reduce((t, q) => t + norm(sub(p, q)), 0), 0);
  const ds = piece.donors.map((d) => free.points[d]);
  const to = piece.donors.map((d) => places.get(d));
  const k = Math.max(1, Math.min(2, spread(to) / (spread(ds) || 1)));
  const [cf, ct] = [times(centroid(ds), k), centroid(to)];
  const r = bestRotation(ds.map((p) => sub(times(p, k), cf)), to.map((p) => sub(p, ct)));
  const at = new Map(piece.atoms.map((i) => [i, add(turn(r, sub(times(free.points[i], k), cf)), ct)]));
  // the springs: [i, j (or 'metal'), length, strength]
  const springs = [];
  const length = (i, j) => norm(sub(free.points[i], free.points[j]));
  for (const { a, b } of bonds) springs.push([a, b, length(a, b), 3]);
  for (const [j, list] of near) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) springs.push([list[x], list[y], length(list[x], list[y]), 0.5]);
  }
  for (const d of piece.donors) {
    for (const x of near.get(d)) springs.push([x, 'metal', Math.sqrt(reach ** 2 + length(d, x) ** 2 + 2 * reach * length(d, x) * Math.cos(65 * DEG)), 0.5]);
  }
  const close = new Set([...bonds.map(({ a, b }) => `${a}-${b}`), ...springs.filter(([, j]) => j !== 'metal').map(([i, j]) => `${i}-${j}`)]);
  const apart = (i, j) => !close.has(`${i}-${j}`) && !close.has(`${j}-${i}`);
  for (let step = 0; step < 1500; step++) {
    const pull = new Map(piece.atoms.map((i) => [i, [0, 0, 0]]));
    const spring = (i, j, want, strength) => {
      const pj = j === 'metal' ? [0, 0, 0] : at.get(j);
      const v = sub(at.get(i), pj);
      const d = norm(v) || 1e-6;
      const f = times(v, (strength * (want - d)) / d);
      pull.set(i, add(pull.get(i), f));
      if (j !== 'metal') pull.set(j, sub(pull.get(j), f));
    };
    for (const [i, j, want, strength] of springs) spring(i, j, want, strength);
    for (const d of piece.donors) pull.set(d, add(pull.get(d), times(sub(places.get(d), at.get(d)), 0.6)));
    for (let x = 0; x < piece.atoms.length; x++) {
      const i = piece.atoms[x];
      if (!piece.donors.includes(i) && norm(at.get(i)) < reach * 1.1) spring(i, 'metal', reach * 1.1, 0.5);
      for (let y = x + 1; y < piece.atoms.length; y++) {
        const j = piece.atoms[y];
        if (apart(i, j) && norm(sub(at.get(i), at.get(j))) < 1.6) spring(i, j, 1.6, 0.3);
      }
    }
    for (const i of piece.atoms) at.set(i, add(at.get(i), times(pull.get(i), 0.05)));
  }
  return at;
}

// A metal complex in 3D: { points (3D, by atom), metal (its index; also
// the centre of a main-group molecule built by VSEPR), … } for `molecule` ({ elements, points (the drawing: 2D, y down),
// links: [{ a, b, order, kind }], lonePairs (by atom) }); { reason } if it
// is one but can't be built; null if it isn't one. `anyLigands`: a
// main-group centre with any groups on it (see mainGroupCentre); `OCL`:
// OpenChemLib (its resources registered), for the ligands' own 3D shapes.
// `defer`: a metal complex for UFF not built here but answered { deferred: true }, to be built in a worker
// (complexIn3D) after these quick checks have said what is wrong, if anything, in the page's language.
// Has the molecule (describeMolecule's) a metal bonded to something: a complex for UFF (the XYZ export
// gives only such a molecule the complex builder)?
export const hasMetal = ({ elements, links }) => elements.some((el, i) => !NONMETALS.has(el) && links.some((l) => l.kind !== 'hbond' && (l.a === i || l.b === i)));

export function buildComplex(molecule, { anyLigands = false, OCL = null, centre = null, axial = [], defer = false } = {}) {
  const { elements, points, links } = molecule;
  // a transition state with a five-bonded centre (SN2), found here too: the worker gets the molecule alone
  if (centre === null) {
    const found = NONMETALS_ONLY(elements) ? transitionCentre(molecule) : null;
    if (found) ({ centre, axial } = found);
  }
  const bonded = links.filter((l) => l.kind !== 'hbond');
  const other = (l, i) => (l.a === i ? l.b : l.a);
  const at = (i) => bonded.filter((l) => l.a === i || l.b === i).map((l) => other(l, i));
  const metals = elements.flatMap((el, i) => (!NONMETALS.has(el) && at(i).length ? [i] : []));
  if (metals.length > 1) return { reason: t('more than one metal atom') };
  const m = metals[0] ?? centre ?? mainGroupCentre(molecule, at, anyLigands);
  if (m === null) return null;
  const donors = [...new Set(at(m))];
  const flat = (i) => [points[i][0], -points[i][1]]; // the drawing, y up
  let vertices;
  let shape;
  let squarePlanar = false;
  const reach = metals.length ? BOND_TO_METAL : 1; // the bonds to the centre
  if (metals.length) {
    // (d8, and d9 copper(II): square, an electronic preference no force field knows. Copper's oxidation state
    // as drawn: its charge, and one for each ordinary bond to it (an anionic ligand: Cu(acac)2, Cu(gly)2 and
    // Cu(salen) drawn neutral are copper(II)); a coordination arrow gives none. Copper(III), d8, square too)
    const copper = () => (readMolfileAtoms(molecule.molfile).atoms[m]?.charge ?? 0)
      + links.filter((l) => (l.a === m || l.b === m) && !l.kind).length;
    squarePlanar = SQUARE_PLANAR.has(elements[m]) || (elements[m] === 'Ni' && donors.some((d) => elements[d] === 'C'))
      || (elements[m] === 'Cu' && copper() >= 2);
    vertices = polyhedron(donors.length, squarePlanar);
    if (!vertices || donors.length < 2) return { reason: t('{n} atoms around the metal', { n: donors.length }) };
  } else {
    shape = vseprShape(donors.length, centre === null ? (molecule.lonePairs?.[m] ?? 0) : 0);
    if (!shape) return null;
    vertices = shape.vertices;
  }

  // the ligands: the pieces left when the metal goes, each with its donor atoms
  const seen = new Set([m]);
  const pieces = [];
  for (const d of donors) {
    if (seen.has(d)) continue;
    const atoms = [d];
    seen.add(d);
    for (let k = 0; k < atoms.length; k++) {
      for (const j of at(atoms[k])) {
        if (seen.has(j)) continue;
        seen.add(j);
        atoms.push(j);
      }
    }
    pieces.push({ atoms, donors: donors.filter((x) => atoms.includes(x)) });
  }
  if (seen.size < elements.length) return { reason: t('atoms held only by hydrogen bonds') };
  // where each ligand, as drawn, would have the metal: beyond its donors, away from its body
  for (const piece of pieces) {
    const body = centroid(piece.atoms.map(flat));
    if (piece.donors.length === 1) {
      const d = flat(piece.donors[0]);
      const rest = piece.atoms.filter((i) => i !== piece.donors[0]);
      const away = rest.length ? unit(sub(d, centroid(rest.map(flat)))) : [1, 0];
      piece.metal = add(d, times(norm(away) ? away : [1, 0], reach));
    } else {
      const ds = piece.donors.map(flat);
      const c = centroid(ds);
      let away = unit(sub(c, body));
      if (!norm(away)) away = unit([-(ds[1][1] - ds[0][1]), ds[1][0] - ds[0][0]]);
      const spread = ds.reduce((sum, p) => sum + norm(sub(p, c)), 0) / ds.length;
      piece.metal = add(c, times(away, Math.sqrt(Math.max(0.1, reach ** 2 - spread * spread))));
    }
    piece.bite = piece.donors.map((i) => piece.donors.map((j) => angle(sub(flat(i), piece.metal), sub(flat(j), piece.metal))));
  }

  // which donor goes where: a chelate's donors at the angle it is drawn
  // with (but two joined by a short chain, a five- or six-membered chelate
  // ring, next to each other: EDTA's N with the N and with its own O),
  // ligands opposite each other in the drawing opposite in 3D
  const pieceOf = new Map(pieces.flatMap((p) => p.donors.map((d) => [d, p])));
  const apartInLigand = (piece, from, to) => {
    const inPiece = new Set(piece.atoms);
    const seenHere = new Map([[from, 0]]);
    for (const queue = [from]; queue.length;) {
      const i = queue.shift();
      if (i === to) return seenHere.get(i);
      for (const j of at(i)) if (inPiece.has(j) && !seenHere.has(j)) { seenHere.set(j, seenHere.get(i) + 1); queue.push(j); }
    }
    return Infinity;
  };
  // a bond to the centre drawn as a wedge (towards the viewer) or a hashed wedge (away): the drawing is in 3D,
  // and its angles are read with that depth (as asDrawn reads it)
  const depthOf = (d) => {
    const l = bonded.find((x) => (x.a === d && x.b === m) || (x.b === d && x.a === m));
    if (!l || (l.stereo !== 'wedge' && l.stereo !== 'hash')) return 0;
    const fromCentre = l.kind === 'dative' ? l.b === m : l.a === m; // (the narrow end at the centre)
    return (l.stereo === 'wedge' ? 1 : -1) * (fromCentre ? 1 : -1);
  };
  const inDepth = donors.some((d) => depthOf(d) !== 0);
  const drawnAngle = (i, j) => (inDepth
    ? angle([...sub(flat(i), flat(m)), depthOf(i)], [...sub(flat(j), flat(m)), depthOf(j)])
    : angle(sub(flat(i), flat(m)), sub(flat(j), flat(m))));
  // a main-group centre's double bonds in the page, where there are no wedges for them (sulfate's S=O)
  const multiple = new Set(shape ? bonded.filter((l) => (l.a === m || l.b === m) && l.order > 1).map((l) => other(l, m)) : []);
  // how well an assignment of the donors to the polyhedron's corners (order[k]: donor k's) fits the drawing (0: as well as can be)
  // (`singlesOnly`: in a flat drawing the angles count only between ligands on one donor each, where they mean
  // cis or trans; between a chelate's donor and another ligand they mean nothing: an imidazole drawn on top of a
  // porphyrin. A drawing in 3D, with wedges to the centre, means its angles between any two)
  const costOf = (corners, order, bound = Infinity, singlesOnly = false) => {
    let cost = donors.reduce((sum, d, k) => sum + (multiple.has(d) ? 0.5 * Math.abs(corners[order[k]][2]) : 0)
      + (axial.includes(d) && Math.abs(corners[order[k]][1]) < 0.9 ? 10 : 0), 0); // a transition state's partial bonds axial
    for (let i = 0; i < donors.length && cost < bound; i++) {
      for (let j = i + 1; j < donors.length; j++) {
        const [di, dj] = [donors[i], donors[j]];
        const real = angle(corners[order[i]], corners[order[j]]);
        const piece = pieceOf.get(di);
        if (piece === pieceOf.get(dj) && piece.donors.length > 2) {
          // (more than two donors: a short chain between two means next to each other; a long one, anywhere)
          if (apartInLigand(piece, di, dj) <= 4) cost += ((real - 90 * DEG) / (90 * DEG)) ** 2;
        } else if (piece === pieceOf.get(dj)) cost += ((real - piece.bite[piece.donors.indexOf(di)][piece.donors.indexOf(dj)]) / (90 * DEG)) ** 2;
        else if (singlesOnly && !inDepth && (piece.donors.length > 1 || pieceOf.get(dj).donors.length > 1)) continue;
        else if (drawnAngle(di, dj) > 150 * DEG && real < 150 * DEG) cost += 0.3;
        else if (drawnAngle(di, dj) < 120 * DEG && real > 150 * DEG) cost += 0.3;
      }
    }
    return cost;
  };
  // with OpenChemLib: optimised as a whole by UFF (complex3D.js), a metal complex on the polyhedron the energy
  // chooses, a transition state and a main-group centre on their shape (VSEPR's: the bipyramid for SN2)
  const prefer = centre !== null ? [0, 32] : shape?.prefer ?? { 2: [0, 0], 3: [0, 0], 4: squarePlanar ? [0, 0] : [0, 15], 5: [12, 15], 6: [25, 15], 7: [12, 15], 8: [12, 15] }[donors.length];
  if (OCL) {
    if (defer) return { deferred: true };
    const built = optimisedComplex({ OCL, molecule, m, donors, pieces, costOf, squarePlanar, ligandIn3D, bestRotation,
      ...(!metals.length && { shapes: [{ name: 'vsepr', digit: 3, corners: vertices }], hydrogens: molecule.hydrogens }) });
    if (built) {
      // (a main-group centre's and a transition state's bonds read full length when seen end on, as textbooks draw them)
      return metals.length ? built : { ...built, outTo: reach, flat: Boolean(shape?.flat), prefer, axial: centre === null ? null : axial };
    }
  }
  let best = { cost: Infinity, order: null };
  for (const order of permutations(donors.length)) {
    const cost = costOf(vertices, order, best.cost);
    if (cost < best.cost) best = { cost, order };
  }
  const vertexOf = new Map(donors.map((d, k) => [d, times(vertices[best.order[k]], reach)]));

  // each ligand put in rigidly: its metal point on the metal, its donors on
  // their places; a chelate as large as its donors' places need (at most 1.6×)
  const out = new Array(elements.length);
  out[m] = [0, 0, 0];
  const meanDistance = (list) => {
    const d = list.flatMap((p, i) => list.slice(i + 1).map((q) => norm(sub(p, q))));
    return d.reduce((x, y) => x + y, 0) / d.length;
  };
  for (const piece of pieces) {
    if (piece.atoms.length === 1) {
      out[piece.atoms[0]] = vertexOf.get(piece.atoms[0]);
      continue;
    }
    // wrapped round the metal (more donors than a stand-in carbon can take: EDTA)
    const wrapped = OCL && piece.donors.length > 4 ? wrapLigand(OCL, molecule, piece, m, vertexOf, reach) : null;
    if (wrapped) {
      for (const i of piece.atoms) out[i] = wrapped.get(i);
      continue;
    }
    // in its own 3D shape: the metal's point beyond its donors, fitted onto the metal and its places
    const shape3 = OCL ? ligandIn3D(OCL, molecule, piece, m) : null;
    if (shape3) {
      // a chelate as large as its donors' places need (at most 1.6×), as the flat ones below
      if (piece.donors.length > 1) {
        const places = piece.donors.map((d) => vertexOf.get(d));
        const k = Math.max(1, Math.min(1.6, meanDistance(places) / meanDistance(piece.donors.map((d) => shape3.points[d]))));
        for (const i of piece.atoms) shape3.points[i] = times(shape3.points[i], k);
        shape3.stand = times(shape3.stand, k);
      }
      const ds = piece.donors.map((d) => shape3.points[d]);
      const c = centroid(ds);
      const spread = ds.reduce((sum, p) => sum + norm(sub(p, c)), 0) / ds.length;
      const metalAt = add(c, times(unit(sub(shape3.stand, c)), ds.length === 1 ? reach : Math.sqrt(Math.max(0.1, reach ** 2 - spread * spread))));
      const from = [metalAt, ...ds];
      const to = [[0, 0, 0], ...piece.donors.map((d) => vertexOf.get(d))];
      if (piece.donors.length === 1) {
        // turned about its bond so that it lies across the page where it can
        const axis = unit(sub(ds[0], metalAt));
        const rest = centroid(piece.atoms.filter((i) => i !== piece.donors[0]).map((i) => shape3.points[i]));
        const across = sub(sub(rest, ds[0]), times(axis, dot(sub(rest, ds[0]), axis)));
        const v = unit(vertexOf.get(piece.donors[0]));
        const [w] = [[1, 0, 0], [0, 1, 0]].map((e) => sub(e, times(v, dot(e, v)))).sort((p, q) => norm(q) - norm(p));
        if (norm(across) > 1e-3) {
          from.push(add(ds[0], unit(across)));
          to.push(add(vertexOf.get(piece.donors[0]), unit(w)));
        }
      }
      const [cf, ct] = [centroid(from), centroid(to)];
      const r = bestRotation(from.map((p) => sub(p, cf)), to.map((p) => sub(p, ct)));
      for (const i of piece.atoms) out[i] = add(turn(r, sub(shape3.points[i], cf)), ct);
      continue;
    }
    if (piece.donors.length > 1) {
      const c = centroid(piece.donors.map(flat));
      const k = Math.max(1, Math.min(1.6, meanDistance(piece.donors.map((d) => vertexOf.get(d))) / meanDistance(piece.donors.map(flat))));
      const grown = new Map(piece.atoms.map((i) => [i, add(c, times(sub(flat(i), c), k))]));
      const spread = piece.donors.reduce((sum, d) => sum + norm(sub(grown.get(d), c)), 0) / piece.donors.length;
      const away = unit(sub(piece.metal, c));
      piece.metal = add(c, times(away, Math.sqrt(Math.max(0.1, reach ** 2 - spread * spread))));
      piece.flat = (i) => grown.get(i);
    }
    const flatOf = piece.flat ?? flat;
    const from = [[...piece.metal, 0], ...piece.donors.map((d) => [...flatOf(d), 0])];
    const to = [[0, 0, 0], ...piece.donors.map((d) => vertexOf.get(d))];
    if (piece.donors.length === 1) {
      // its own plane facing the viewer where it can
      const v = unit(vertexOf.get(piece.donors[0]));
      const [w] = [[1, 0, 0], [0, 1, 0]].map((c) => sub(c, times(v, dot(c, v)))).sort((p, q) => norm(q) - norm(p));
      const along = unit(sub(flatOf(piece.donors[0]), piece.metal));
      from.push([piece.metal[0] - along[1] * reach, piece.metal[1] + along[0] * reach, 0]);
      to.push(times(unit(w), reach));
    }
    const [cf, ct] = [centroid(from), centroid(to)];
    const r = bestRotation(from.map((p) => sub(p, cf)), to.map((p) => sub(p, ct)));
    for (const i of piece.atoms) out[i] = add(turn(r, sub([...flatOf(i), 0], cf)), ct);
  }
  // the view textbooks take (turns about the vertical and horizontal axes):
  // an octahedron a little from above and turned, a tetrahedron one bond up
  // (a transition state: its plain bond in the page, the other two well apart, a wedge and a hashed wedge)
  return {
    // ligands seen end on are moved out to this distance (views): a main-group centre's bonds full length, as textbooks draw them
    points: out, metal: m, outTo: metals.length ? 0.8 * reach : reach, flat: shape ? Boolean(shape.flat) : squarePlanar && donors.length === 4, prefer,
    axial: centre === null ? null : axial, // (a transition state: its bonds forming and breaking)
    // (a ligand whose donors surround the metal, EDTA, wraps it: it has no side to be moved out to)
    pieces: pieces.map(({ atoms, donors: d }) => ({ atoms, donors: d, wraps: d.length > 2 && norm(centroid(d.map((x) => out[x]))) < 0.5 * reach })),
  };
}

// The molfile with the 3D points as its coordinates and no wedges, marked
// 3D: RDKit then takes R/S and E/Z from the geometry, to check a 3D model
// against the drawing.
export function molfile3D(molfile, points) {
  const lines = molfile.split('\n');
  const nAtoms = Number.parseInt(lines[3].slice(0, 3), 10);
  const nBonds = Number.parseInt(lines[3].slice(3, 6), 10);
  lines[1] = `${'  olomol'.padEnd(20)}3D`;
  const f = (v) => v.toFixed(4).padStart(10);
  for (let k = 0; k < nAtoms; k++) {
    const [x, y, z] = points[k];
    lines[4 + k] = `${f(x)}${f(y)}${f(z)}${lines[4 + k].slice(30)}`;
  }
  for (let k = 4 + nAtoms; k < 4 + nAtoms + nBonds; k++) lines[k] = `${lines[k].slice(0, 9)}  0${lines[k].slice(12)}`;
  return lines.join('\n');
}

// --- turning by hand (the 3D view) ---

// A rotation by `angle` about the unit vector `axis`, as a 3×3 matrix (rows).
export function rotationAbout([x, y, z], angle) {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const k = 1 - c;
  return [
    [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
    [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
    [z * x * k - y * s, z * y * k + x * s, c + z * z * k],
  ];
}

// The product of two 3×3 matrices: first b, then a.
export const multiply = (a, b) => a.map((row) => [0, 1, 2].map((k) => row.reduce((sum, v, i) => sum + v * b[i][k], 0)));

// A view of centred 3D points (y up, as `views` gives them) turned by
// `rotation`: projected straight onto the page (orthographic, as textbooks
// draw: bonds towards you foreshortened), { points (2D, y down), points3,
// depth (towards the viewer) }, as views() gives them.
export function projected(points3, rotation) {
  const turned = points3.map((p) => turn(rotation, p));
  return { points: turned.map(([x, y]) => [x, -y]), points3: turned, depth: turned.map((p) => p[2]) };
}

// The main axes of a cloud of points (largest spread first): 3×3, rows.
function mainAxes(points) {
  const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i][j] += p[i] * p[j];
  // Jacobi rotations
  let v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(c[p][q]) < 1e-12) continue;
      const theta = (c[q][q] - c[p][p]) / (2 * c[p][q]);
      const tan = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const [cos, sin] = [1 / Math.sqrt(tan * tan + 1), tan / Math.sqrt(tan * tan + 1)];
      const j = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      [j[p][p], j[q][q], j[p][q], j[q][p]] = [cos, cos, sin, -sin];
      const jt = j[0].map((_, k) => j.map((row) => row[k]));
      const mul = (a, b) => a.map((row) => b[0].map((_, k) => row.reduce((s, x, i) => s + x * b[i][k], 0)));
      const next = mul(mul(jt, c), j);
      for (let i = 0; i < 3; i++) c[i] = next[i];
      v = mul(v, j);
    }
  }
  const axes = [0, 1, 2].map((k) => ({ value: c[k][k], axis: v.map((row) => row[k]) })).sort((p, q) => q.value - p.value).map((e) => e.axis);
  const [a, b] = axes;
  return [a, b, [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]]; // right-handed
}

const rotationY = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rotationX = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];

// 0 below 0, 1 above 1, smoothly in between.
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const NEAR_END_ON = 0.5; // a bond seen this short or shorter is nearly end on: it is lengthened less and less, down to not at all

// How long a bond seen `d` long is drawn when it should be at least `want`:
// lengthened to `want`, but less and less as it comes end on, so that a
// turning molecule never jumps (straight end on it can't be helped: which
// way out would be a guess, see hardToRead).
const readable = (d, want) => (d >= want ? d : d + (want - d) * smooth(d / NEAR_END_ON));

// A complex as seen (2D points, y down): its ligands seen end on moved out
// along their bond until it is long enough to read (complex.outTo), as
// textbooks draw them. Only ligands on one side of the metal (a ligand
// wrapped round it, EDTA, has no "out"). A new list; the 3D model stays as
// it is.
export function spreadLigands(points, complex) {
  const out = points.map((p) => [...p]);
  const centre = out[complex.metal];
  for (const piece of complex.pieces) {
    if (piece.wraps) continue;
    const v = sub(centroid(piece.donors.map((d) => out[d])), centre);
    const d = norm(v);
    if (d < 1e-6 || d >= complex.outTo) continue;
    const shift = times(unit(v), readable(d, complex.outTo) - d);
    for (const i of piece.atoms) out[i] = add(out[i], shift);
  }
  return out;
}

// Views of 3D points, the clearest first: [{ points (2D, y down), depth
// (towards the viewer), turned: [ψ, χ] }]. Tried: turns about the vertical
// and the horizontal axis (after the main axes, for `axes`); scored by
// crossing bonds, atoms (and so their labels) closer than ROOM, bonds seen
// nearly end on, and how far the view is from `prefer` (a complex's
// textbook view). `complex` ({ metal, pieces }): ligands seen end on are
// moved out along their bond until it is long enough to read, as
// textbooks draw them. `labelled` (by atom): written out (heteroatoms,
// NH2), which need more room than a bare corner.
export function views(points3, pairs, { axes = true, flat = false, prefer = null, complex = null, count = 2, labelled = [] } = {}) {
  const c = centroid(points3);
  let base = points3.map((p) => sub(p, c));
  if (axes) {
    const frame = mainAxes(base);
    base = base.map((p) => turn(frame, p));
  }
  const bonded = new Set(pairs.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
  // atoms with two bonds that are bent in 3D: [atom, one neighbour, the other]
  const neighbours = points3.map((_, i) => pairs.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : [])));
  const corners = neighbours.flatMap((list, c) => (list.length === 2 && angle(sub(base[list[0]], base[c]), sub(base[list[1]], base[c])) < 150 * DEG ? [[c, ...list]] : []));
  const tried = [];
  // (near the textbook view first; further round where that one is crowded)
  for (const psi of [0, 12, -12, 25, -25, 40, -40, 55, -55, 70, -70, 90]) {
    for (const chi of [0, 15, -15, 30, -30, 45, -45, 60, -60]) {
      const m = rotationX(chi * DEG).map((row) => [0, 1, 2].map((k) => dot(row, rotationY(psi * DEG).map((r) => r[k]))));
      const turned = base.map((p) => turn(m, p));
      const points = complex ? spreadLigands(turned.map(([x, y]) => [x, -y]), complex) : turned.map(([x, y]) => [x, -y]);
      const { crossings } = layoutProblems(points, pairs);
      // bonds too short to read (one to the metal: shorter than most of its length)
      const toMetal = (a, b) => complex && (a === complex.metal || b === complex.metal);
      const short = pairs.reduce((sum, [a, b]) => sum + Math.max(0, (toMetal(a, b) ? 0.8 * complex.outTo : 0.6) - norm(sub(points[a], points[b]))), 0);
      // corners that look straight on the page but aren't (they'd need a dot to be seen)
      const straight = corners.filter(([c, p, q]) => {
        const [u, v] = [sub(points[p], points[c]), sub(points[q], points[c])];
        return dot(u, v) / (norm(u) * norm(v) || 1) < -0.966; // over 165°
      }).length;
      let crowded = 0;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          if (!bonded.has(`${i}-${j}`)) crowded += Math.max(0, ROOM + LABEL_ROOM * (Number(Boolean(labelled[i])) + Number(Boolean(labelled[j]))) - norm(sub(points[i], points[j])));
        }
      }
      const away = prefer ? Math.abs(psi - prefer[0]) + Math.abs(chi - prefer[1]) : Math.abs(psi) + Math.abs(chi);
      // (a crossing is drawn with a gap in the bond behind, so it reads: it costs less than atoms on top of each other)
      const cost = 4 * crossings + 5 * crowded + 8 * short + 2 * straight + (flat || prefer ? 0.03 : 0.004) * away;
      tried.push({ points, points3: turned, depth: turned.map((p) => p[2]), turned: [psi, chi], cost });
    }
  }
  tried.sort((p, q) => p.cost - q.cost);
  const chosen = [];
  for (const view of tried) {
    if (chosen.length >= count) break;
    if (chosen.every((v) => rmsdAfterRotation(v.points, view.points) > 0.25)) chosen.push(view);
  }
  return chosen;
}

// The drawing of a view: { points, stereo: [[a, b, 'wedge' | 'hash' | '' | 'wavy']] }.
// A complex: the metal's plain bonds by depth. Otherwise each stereocentre
// (a wedge's narrow end in `molfile`) gets one wedge, towards or away from
// the viewer: to a substituent rather than to another stereocentre, the one
// that stands out most, on a bond no other centre has its wedge on, and
// only if the flat drawing with that wedge has the handedness of the 3D
// model (so R/S stay as they are: checked by the signed volume of the
// centre's neighbours, as read from the page, against the real one). The
// bonds are shared out so that as many centres as can get one (a ring of
// stereocentres, a sugar, would otherwise take each other's).
export function drawingOf(view, { molfile, links, metal = null }) {
  const { bonds } = parseMolfile(molfile);
  const stereo = new Map(bonds.map(({ a, b, stereo: code }) => [`${a}-${b}`, [a, b, code === 4 ? 'wavy' : '']]));
  const set = (a, b, kind) => {
    stereo.delete(`${b}-${a}`);
    stereo.set(`${a}-${b}`, [a, b, kind]);
  };
  const plain = (l) => !l.kind && l.order === 1;
  const depthOf = (from, to) => view.depth[to] - view.depth[from];
  if (metal !== null) {
    // (a coordination bond's wedge too: drawn from the metal, it stays a coordination bond)
    for (const l of links.filter((x) => (plain(x) || (x.kind === 'dative' && x.order === 1)) && (x.a === metal || x.b === metal))) {
      const d = l.a === metal ? l.b : l.a;
      const steep = depthOf(metal, d) / (norm(sub(view.points3[d], view.points3[metal])) || 1);
      set(metal, d, steep > DEPTH ? 'wedge' : steep < -DEPTH ? 'hash' : '');
    }
  }
  // (in a complex: its ligands' own stereocentres)
  const centres = new Set(bonds.filter((b) => (b.stereo === 1 || b.stereo === 6) && b.a !== metal).map((b) => b.a));
  const volume = ([u, v, w]) => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
  // each centre's bonds that would say its handedness, the best first
  const choices = [...centres].map((c) => {
    const others = (keep) => links.filter((l) => keep(l) && (l.a === c || l.b === c)).map((l) => (l.a === c ? l.b : l.a));
    const around = others(plain);
    // (a sulfoxide has two single bonds: its S=O helps say the handedness, and can't carry the wedge)
    const seen = around.length < 3 ? [...around, ...others((l) => !l.kind && l.order === 2)] : around;
    const from = (i) => sub(view.points3[i], view.points3[c]);
    const fits = seen.length < 3 ? [] : around.filter((d) => {
      if (Math.abs(depthOf(c, d)) < 0.1) return false;
      const three = [d, ...seen.filter((x) => x !== d).slice(0, 2)];
      const flat = volume(three.map((i) => [from(i)[0], from(i)[1], i === d ? Math.sign(depthOf(c, d)) : 0])); // as the page says it
      return Math.abs(flat) >= 0.05 && Math.sign(flat) === Math.sign(volume(three.map(from)));
    }).sort((p, q) => Number(centres.has(p)) - Number(centres.has(q)) || Math.abs(depthOf(c, q)) - Math.abs(depthOf(c, p)));
    return { c, fits };
  }).sort((p, q) => p.fits.length - q.fits.length); // the centres with the fewest choices first
  // shared out depth first: a bond carries one centre's wedge
  let best = { served: -1, picks: [] };
  let steps = 0;
  const share = (k, taken, picks) => {
    if (picks.length + (choices.length - k) <= best.served || steps++ > 20_000) return;
    if (k === choices.length) {
      best = { served: picks.length, picks: [...picks] };
      return;
    }
    for (const d of choices[k].fits) {
      const bond = [choices[k].c, d].sort((p, q) => p - q).join('-');
      if (taken.has(bond)) continue;
      taken.add(bond);
      share(k + 1, taken, [...picks, [choices[k].c, d]]);
      taken.delete(bond);
      if (best.served === choices.length) return;
    }
    share(k + 1, taken, picks); // this one without a wedge
  };
  share(0, new Set(), []);
  for (const [c, d] of best.picks) set(c, d, depthOf(c, d) > 0 ? 'wedge' : 'hash');
  return { points: view.points, stereo: [...stereo.values()] };
}

const END_BOND = 0.75; // an end atom's bond seen this short or shorter is drawn this long

// A drawing's end atoms (one bond: H, =O, F, CH3) whose bond is seen nearly
// end on, moved out along it until it is long enough to read: the drawing
// may lie a little, so that an O–H or a C=O facing the viewer still shows.
// Only on the page; the 3D model stays as it is.
function lengthenEnds(points, links) {
  const out = points.map((p) => [...p]);
  for (const [i, n] of endBonds(points.length, links)) {
    const v = sub(out[i], out[n]);
    if (norm(v) < 1e-6 || norm(v) >= END_BOND) continue;
    out[i] = add(out[n], times(unit(v), readable(norm(v), END_BOND)));
  }
  return out;
}

// The end atoms with their neighbour: [[atom, neighbour]].
function endBonds(n, links) {
  const neighbours = Array.from({ length: n }, (_, i) => links.flatMap((l) => (l.kind === 'hbond' ? [] : l.a === i ? [l.b] : l.b === i ? [l.a] : [])));
  return neighbours.flatMap((list, i) => (list.length === 1 ? [[i, list[0]]] : []));
}

const ON_TOP = { end: 0.4, ligand: 0.6 }; // closer than this, two atoms' labels lie on each other

// Is a drawing from 3D hard to read: a bond seen so nearly end on that it
// couldn't be drawn long enough, so that labels lie on each other (an end
// atom on its neighbour, a ligand on its metal)? Then the view isn't
// offered as it is (the 3D panel: turn it a little).
export function hardToRead(drawing, molecule, model) {
  const { points } = drawing;
  if (endBonds(points.length, molecule.links).some(([i, n]) => norm(sub(points[i], points[n])) < ON_TOP.end)) return true;
  const complex = model.complex;
  if (!complex) return false;
  return complex.pieces.some((piece) => !piece.wraps && norm(sub(centroid(piece.donors.map((d) => points[d])), points[complex.metal])) < ON_TOP.ligand);
}

// The drawing of a view of a molecule's 3D model (model: { metal }, as
// relayout.js's model3D gives it): points, wedges by depth, and the depth of
// each bond (molecule.links' order: where two cross, the one behind is
// broken). A tetrahedral metal with four different ligands keeps plain
// bonds: RDKit would read wedges on them as R/S.
export function drawingOfModel(RDKit, molecule, model, view, { spread = true } = {}) {
  // (a complex's ligands seen end on moved out, as in views, and end atoms too (lengthenEnds); `spread` false:
  // as seen, every bond as long as it looks, Turn in 3D turning it)
  const seen = model.complex && spread ? { ...view, points: spreadLigands(view.points, model.complex) } : view;
  const drawing = drawingOf(seen, { molfile: molecule.molfile, links: molecule.links, metal: model.metal });
  if (model.metal !== null) {
    const smiles = (molfile) => {
      const mol = RDKit.get_mol(molfile);
      try {
        return mol?.get_smiles() ?? null;
      } finally {
        mol?.delete();
      }
    };
    if (smiles(molfileWithStereo(molecule.molfile, drawing.stereo)) !== smiles(molecule.molfile)) {
      drawing.stereo = drawing.stereo.map(([a, b, kind]) => (a === model.metal || b === model.metal ? [a, b, ''] : [a, b, kind]));
    }
  }
  if (spread) drawing.points = lengthenEnds(drawing.points, molecule.links);
  drawing.z = molecule.links.map((l) => (view.depth[l.a] + view.depth[l.b]) / 2);
  drawing.depth = [...view.depth]; // (each atom's: the larger, the nearer)
  return drawing;
}

// The atom a transition state is built round, or null: { centre, axial }, the
// one atom with five bonds of which two are partial (forming and breaking:
// the nucleophile and the leaving group of an SN2, axial).
export function transitionCentre(molecule) {
  const found = molecule.elements.flatMap((el, i) => {
    const links = molecule.links.filter((l) => (l.a === i || l.b === i) && l.kind !== 'hbond');
    const partial = links.filter((l) => l.kind === 'partial');
    return links.length === 5 && partial.length === 2 ? [{ centre: i, axial: partial.map((l) => (l.a === i ? l.b : l.a)) }] : [];
  });
  return found.length === 1 ? found[0] : null;
}

// A transition state's drawing (drawingOfModel's, of the model built round
// transitionCentre's atom) as textbooks draw it: its bonds forming and breaking
// across (Nu···C···LG, the one drawn on the left still left, a little longer
// than a bond), the bond in the page straight up or down, the wedge and the
// hashed wedge to the other side, well apart; each group moved with its atom.
// The groups round the axis go round the way the drawing has them, if its
// wedges say (else, as the model has them): the transition state of the
// molecule drawn, not of its mirror image. (RDKit sees no stereocentre in it
// to check.)
const PARTIAL_LENGTH = 1.15;
const SPREAD = 38 * (Math.PI / 180); // of the wedge and the hashed wedge from straight down (or up)
export function transitionDrawing(molecule, model, drawing) {
  const m = model.metal;
  const [left, right] = [...model.axial].sort((i, j) => molecule.points[i][0] - molecule.points[j][0]);
  const [cx, cy] = drawing.points[m];
  const [p, q] = [drawing.points[left], drawing.points[right]];
  const turn = -Math.atan2(q[1] - p[1], q[0] - p[0]);
  const turned = drawing.points.map(([x, y]) => [cx + (x - cx) * Math.cos(turn) - (y - cy) * Math.sin(turn), cy + (x - cx) * Math.sin(turn) + (y - cy) * Math.cos(turn)]);
  const stereoOf = (i) => drawing.stereo.find(([a, b]) => (a === m && b === i) || (a === i && b === m))?.[2] ?? '';
  const equatorial = model.complex.pieces.flatMap((piece) => piece.donors).filter((d) => !model.axial.includes(d));
  const inPage = equatorial.find((d) => !stereoOf(d)) ?? equatorial[0];
  const side = turned[inPage][1] < cy ? -1 : 1; // the bond in the page up (-1) or down
  const [first, second] = equatorial.filter((d) => d !== inPage).sort((i, j) => turned[i][0] - turned[j][0]);
  const places = new Map([
    [left, [cx - PARTIAL_LENGTH, cy]], [right, [cx + PARTIAL_LENGTH, cy]], [inPage, [cx, cy + side]],
    [first, [cx - Math.sin(SPREAD), cy - side * Math.cos(SPREAD)]], [second, [cx + Math.sin(SPREAD), cy - side * Math.cos(SPREAD)]],
  ]);
  for (const piece of model.complex.pieces) {
    const [d] = piece.donors;
    const [dx, dy] = [places.get(d)[0] - turned[d][0], places.get(d)[1] - turned[d][1]];
    for (const i of piece.atoms) turned[i] = [turned[i][0] + dx, turned[i][1] + dy];
  }
  drawing.points = turned;
  const drawn = handedness(molecule.points, molecule.links.map((l) => [l.a, l.b, l.stereo ?? '']), m, left, equatorial);
  if (drawn && drawn !== handedness(turned, drawing.stereo, m, left, equatorial)) {
    const other = { wedge: 'hash', hash: 'wedge' };
    drawing.stereo = drawing.stereo.map(([a, b, kind]) => [a, b, (a === m || b === m) && other[kind] ? other[kind] : kind]);
  }
  return drawing;
}

// Which way three groups go round an axis from atom m to atom `axial`
// (points in the page, y down; `stereo`: [[narrow end, wide end, kind]],
// wedges towards the viewer, hashed wedges away): +1 or -1, or 0 when the
// wedges don't say.
function handedness(points, stereo, m, axial, [e1, e2, e3]) {
  const depth = (i) => {
    const [a, , kind] = stereo.find(([p, q]) => (p === m && q === i) || (p === i && q === m)) ?? [];
    return kind === 'wedge' || kind === 'hash' ? (kind === 'wedge' ? 1 : -1) * (a === m ? 1 : -1) : 0;
  };
  const v = (i) => [points[i][0] - points[m][0], points[i][1] - points[m][1], depth(i)];
  const [p, q, r] = [v(e1), v(e2), v(e3)];
  const det = dot(cross(sub(q, p), sub(r, p)), [...v(axial).slice(0, 2), 0]);
  return Math.abs(det) < 1e-6 ? 0 : Math.sign(det);
}

// A complex's 3D model (points) as the drawing has it, not its mirror
// image: Λ stays Λ, and any other arrangement its wedges make chiral. The
// bonds to the metal as drawn (across, up, and towards the viewer for a
// wedge, away for a hashed wedge, in the page for a plain line) and in the
// model: for every three of them the volume they span, whose sign a turn
// keeps and a mirror changes. If more of it says mirror, the model is
// mirrored (z → −z). A drawing without wedges says nothing: as built.
export function asDrawn(molecule, metal, points) {
  const bonds = molecule.links.filter((l) => l.kind !== 'hbond' && (l.a === metal || l.b === metal));
  const depth = (l) => {
    if (l.stereo !== 'wedge' && l.stereo !== 'hash') return 0;
    // the narrow end at the metal (a coordination bond is drawn from its acceptor)
    const fromMetal = l.kind === 'dative' ? l.b === metal : l.a === metal;
    return (l.stereo === 'wedge' ? 1 : -1) * (fromMetal ? 1 : -1);
  };
  const [mx, my] = molecule.points[metal];
  const drawn = bonds.map((l) => {
    const d = l.a === metal ? l.b : l.a;
    return [molecule.points[d][0] - mx, my - molecule.points[d][1], depth(l)]; // (y up, as the model)
  });
  // (no mirror image of a complex whose ligands have an R/S of their own: it would turn them round)
  if (drawn.every((v) => v[2] === 0) || molecule.links.some((l) => (l.stereo === 'wedge' || l.stereo === 'hash') && l.a !== metal && l.b !== metal)) return points;
  const model = bonds.map((l) => sub(points[l.a === metal ? l.b : l.a], points[metal]));
  const volume3 = (u, v, w) => dot(u, cross(v, w));
  let agreement = 0;
  for (let i = 0; i < bonds.length; i++) {
    for (let j = i + 1; j < bonds.length; j++) {
      for (let k = j + 1; k < bonds.length; k++) agreement += volume3(drawn[i], drawn[j], drawn[k]) * volume3(model[i], model[j], model[k]);
    }
  }
  return agreement < 0 ? points.map(([x, y, z]) => [x, y, -z]) : points;
}

// The molfile with the drawing's wedges in its bonds (narrow end first), to
// ask RDKit whether they change the molecule.
export function molfileWithStereo(molfile, stereo) {
  const CODES = { wedge: 1, hash: 6, wavy: 4, '': 0 };
  const lines = molfile.split('\n');
  const nAtoms = Number.parseInt(lines[3].slice(0, 3), 10);
  const nBonds = Number.parseInt(lines[3].slice(3, 6), 10);
  const kinds = new Map(stereo.map(([a, b, kind]) => [`${a}-${b}`, [a, b, kind]]));
  for (let k = 4 + nAtoms; k < 4 + nAtoms + nBonds; k++) {
    const [a, b] = [Number.parseInt(lines[k].slice(0, 3), 10) - 1, Number.parseInt(lines[k].slice(3, 6), 10) - 1];
    const found = kinds.get(`${a}-${b}`) ?? kinds.get(`${b}-${a}`);
    if (!found) continue;
    const [first, second] = found[2] ? [found[0], found[1]] : [a, b];
    lines[k] = `${String(first + 1).padStart(3)}${String(second + 1).padStart(3)}${lines[k].slice(6, 9)}${String(CODES[found[2]]).padStart(3)}${lines[k].slice(12)}`;
  }
  return lines.join('\n');
}
