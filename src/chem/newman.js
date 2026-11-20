// Newman projections as molecules: a bond seen end on. Its two atoms lie on
// one point, the front one (bond.a) in the middle with its bonds drawn from
// there, the back one (bond.b) behind it, drawn as the circle with its bonds
// from the rim (bond.newman: true). Everything round them is ordinary atoms
// and bonds, so curved arrows, charges, lone pairs and R/S work as anywhere.
// A bond is end on only while its atoms lie together: pulled apart (Redraw,
// a drag) it is an ordinary bond again.
//
// For R/S (molfiles, SMILES, Info, Redraw) the projection is read as the
// molecule it shows: the front carbon towards the viewer, the back one away,
// each one's other bonds leaning its way. That model is drawn turned a little,
// so the two carbons part, and each carbon gets a wedge that says its
// handedness (as Turn in 3D's drawings do).
import { addAtom, addBond, bondsByAtom, deleteObjects, emptyDoc, otherEnd } from '../model/doc.js';
import { atomicNumber, isElement } from './elements.js';
import { ABBREVIATIONS, heavyAtomsOf } from './abbreviations.js';

export const NEWMAN_RADIUS = 0.42; // the circle, the back carbon
export const NEWMAN_REACH = 1.05; // the bonds round it
const TOGETHER = 0.02; // the two atoms of an end-on bond at most this far apart
// degrees an eclipsed back is drawn further round, so that its bonds show: more past labels wider than H
const ECLIPSED = { narrow: 20, wide: 25 };
const DEGREE = Math.PI / 180;

// Is this bond seen end on (a Newman projection's)?
export function isEndOn(doc, bond) {
  if (!bond?.newman || bond.kind || bond.order !== 1) return false;
  const [a, b] = [doc.atoms.get(bond.a), doc.atoms.get(bond.b)];
  return Boolean(a && b) && Math.hypot(a.x - b.x, a.y - b.y) <= TOGETHER;
}

export const endOnBonds = (doc) => [...doc.bonds.values()].filter((bond) => isEndOn(doc, bond));

// A bond marked end on whose atoms have parted (Redraw, a drag) is an ordinary bond: its mark goes.
export function dropPartedNewmans(doc) {
  for (const bond of doc.bonds.values()) if (bond.newman && !isEndOn(doc, bond)) delete bond.newman;
}

// --- making them ---

// The atom(s) a group's text stands for, bonded to `from` at `angle`, `reach` away: an element with its
// hydrogens (H, CH3, OH, NH2, Cl) as that atom, anything else (Ph, CH2OH, COOH, R) as a label; an abbreviation
// first, as the panel's Element field reads it (Ac acetyl, Ts tosyl, not actinium and tennessine). Empty: none.
export function addGroup(doc, from, text, angle, reach = NEWMAN_REACH) {
  const plain = String(text ?? '').replace(/[_^]\{([^}]*)\}/g, '$1').replace(/[{}]/g, '').trim();
  if (!plain) return null;
  const origin = doc.atoms.get(from);
  const [x, y] = [origin.x + reach * Math.cos(angle), origin.y + reach * Math.sin(angle)];
  const element = !ABBREVIATIONS[plain] && plain.match(/^([A-Z][a-z]?)(?:H\d*)?$/);
  const atom = element && isElement(element[1]) ? addAtom(doc, x, y, element[1]) : addAtom(doc, x, y, '*', { alias: plain });
  addBond(doc, from, atom.id);
  return atom.id;
}

// Where the bonds round a Newman projection go (radians, y down): the front's up, lower right and lower
// left, the back's turned by the dihedral; eclipsed, a little further round, so that they show.
// `wide`: the front has a group wider than H.
export function newmanAngles(dihedral, wide = false) {
  const front = [-90, 30, 150].map((d) => d * DEGREE);
  return { front, back: front.map((a) => a + drawnAt(dihedral, wide) * DEGREE) };
}

// Where a dihedral is drawn (degrees): eclipsed ones a little further round.
const drawnAt = (d, wide) => (((d % 120) + 120) % 120 === 0 ? d + ECLIPSED[wide ? 'wide' : 'narrow'] : d);

// A Newman projection at (x, y) in `doc`: front and back each three group texts, from the top clockwise
// (see addGroup), the back turned by `dihedral` degrees. Returns the bond seen end on.
export function addNewmanMolecule(doc, x, y, { front = ['H', 'H', 'H'], back = ['H', 'H', 'H'], dihedral = 60, color = null } = {}) {
  const before = new Set(doc.atoms.keys());
  const near = addAtom(doc, x, y, 'C');
  const far = addAtom(doc, x, y, 'C');
  const axle = addBond(doc, near.id, far.id, 1, { newman: true });
  const wideText = (text) => String(text ?? '').replace(/[_^{}]/g, '').trim();
  const angles = newmanAngles(dihedral, front.some((text) => wideText(text) && wideText(text) !== 'H'));
  front.forEach((text, k) => addGroup(doc, near.id, text, angles.front[k]));
  // eclipsed: each back group out far enough that its label clears the one in front of it
  const half = (text) => [0.1 + 0.16 * String(text ?? '').replace(/[_^{}]/g, '').length, 0.2];
  const reach = (k) => {
    const eclipsed = ((dihedral % 120) + 120) % 120 === 0;
    if (!eclipsed || !front[k] || !back[k]) return NEWMAN_REACH;
    const [fw, fh] = half(front[k]);
    const [bw, bh] = half(back[k]);
    const f = [NEWMAN_REACH * Math.cos(angles.front[k]), NEWMAN_REACH * Math.sin(angles.front[k])];
    for (let r = NEWMAN_REACH; r < 2.2; r += 0.05) {
      const b = [r * Math.cos(angles.back[k]), r * Math.sin(angles.back[k])];
      if (Math.abs(b[0] - f[0]) >= fw + bw || Math.abs(b[1] - f[1]) >= fh + bh) return r;
    }
    return 2.2;
  };
  back.forEach((text, k) => addGroup(doc, far.id, text, angles.back[k], reach(k)));
  // (the colour on its own atoms only: the rest of the drawing keeps its own)
  if (color) {
    for (const atom of doc.atoms.values()) if (!before.has(atom.id) && (atom.color === undefined || atom.color === null)) atom.color = color;
  }
  return axle;
}

export function newmanDoc(front, back, dihedral) {
  const doc = emptyDoc();
  addNewmanMolecule(doc, 0, 0, { front, back, dihedral });
  return doc;
}

// Cyclohexane seen along two of its ring bonds (C1–C2 and C5–C4, parallel in the chair): two Newman
// projections side by side, C6 between the front carbons, C3 between the back ones, the axial bonds
// straight up and down. Worked out from a chair in 3D, so the angles are the chair's; every bond round
// a circle as long as in the other Newman projections. Groups: { axial, equatorial } per Newman carbon,
// [C1, C2, C4, C5] (H when not given).
export function cyclohexaneNewmanDoc({ axial = [], equatorial = [] } = {}) {
  const { ring, slots } = cyclohexaneNewmanShape();
  const doc = emptyDoc();
  const ids = ring.map((p) => addAtom(doc, ...p, 'C').id);
  // (front first: C1–C2 and C5–C4 end on)
  addBond(doc, ids[0], ids[1], 1, { newman: true });
  addBond(doc, ids[1], ids[2]);
  addBond(doc, ids[2], ids[3]);
  addBond(doc, ids[4], ids[3], 1, { newman: true });
  addBond(doc, ids[4], ids[5]);
  addBond(doc, ids[5], ids[0]);
  [0, 1, 3, 4].forEach((k, n) => {
    for (const slot of ['axial', 'equatorial']) addGroup(doc, ids[k], (slot === 'axial' ? axial : equatorial)[n] ?? 'H', Math.atan2(slots[k][slot].dir[1], slots[k][slot].dir[0]));
  });
  return doc;
}

// The cyclohexane Newman projections' geometry (see cyclohexaneNewmanDoc), for the chair drawn or, with
// `flip`, the other chair seen the same way (every ring atom's height the other way: C3 and C6 change
// sides, the two projections stay): { ring: [x, y] per ring atom C1…C6 (y down; C1 and C2, C4 and C5
// on one point), slots: per ring atom { axial, equatorial }, each { dir: [dx, dy] (a unit vector on the
// page), face: +1 or −1 (which face of the ring it is on, the same face in both chairs) } }.
export function cyclohexaneNewmanShape(flip = false) {
  // a chair: ring atoms round the z axis, alternately up and down, C–C 1, ring angles 111°
  // (r² + 4h² = 1, and cos 111° = 6h² − ½)
  const h = Math.sqrt((Math.cos(111 * DEGREE) + 0.5) / 6);
  const r = Math.sqrt(1 - 4 * h * h);
  const ring = [];
  for (let k = 0; k < 6; k++) ring.push([r * Math.cos(k * 60 * DEGREE), r * Math.sin(k * 60 * DEGREE), (k % 2 ? -h : h) * (flip ? -1 : 1)]);
  const sub3 = (p, q) => p.map((v, i) => v - q[i]);
  const unit3 = (v) => v.map((x) => x / Math.hypot(...v));
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  // each ring atom's two other bonds, tetrahedral: out of the ring, either side of the ring's plane there;
  // the axial one along z
  const slots = ring.map((p, k) => {
    const [u, v] = [unit3(sub3(ring[(k + 1) % 6], p)), unit3(sub3(ring[(k + 5) % 6], p))];
    const out = unit3(u.map((x, i) => -(x + v[i])));
    const side = unit3(cross(u, v));
    const half = 54.75 * DEGREE;
    const two = [1, -1].map((sign) => out.map((x, i) => x * Math.cos(half) + sign * side[i] * Math.sin(half)));
    two.sort((p2, q2) => Math.abs(q2[2]) - Math.abs(p2[2]));
    return { axial: two[0], equatorial: two[1] };
  });
  // seen along C1→C2 (atoms 0 and 1): C1 and C5 (atom 4) in front
  const view = unit3(sub3(ring[1], ring[0]));
  const upish = [0, 0, 1];
  const dot = (p, q) => p.reduce((s, v, i) => s + v * q[i], 0);
  const screenUp = unit3(upish.map((v, i) => v - dot(upish, view) * view[i]));
  const screenRight = [screenUp[1] * view[2] - screenUp[2] * view[1], screenUp[2] * view[0] - screenUp[0] * view[2], screenUp[0] * view[1] - screenUp[1] * view[0]];
  const flat = (p) => [dot(p, screenRight), -dot(p, screenUp)]; // y down
  const [c1, c6] = [flat(ring[0]), flat(ring[5])];
  const scale = NEWMAN_REACH / Math.hypot(c6[0] - c1[0], c6[1] - c1[1]);
  const place = (p) => flat(p).map((v) => v * scale);
  const points = ring.map(place);
  // the two end-on pairs share a point exactly
  for (const [front, back] of [[0, 1], [4, 3]]) points[back] = [...points[front]];
  const onPage = (v) => {
    const [dx, dy] = flat(v);
    const length = Math.hypot(dx, dy) || 1;
    return [dx / length, dy / length];
  };
  return {
    ring: points,
    slots: slots.map(({ axial, equatorial }) => ({
      axial: { dir: onPage(axial), face: Math.sign(axial[2]) },
      equatorial: { dir: onPage(equatorial), face: Math.sign(equatorial[2]) },
    })),
  };
}

// A Newman projection's bonds among `bondIds` seen in 3D (a view of the molecule turned): the front carbon
// (bond.a, drawn as the point, its groups in front) the one nearer the viewer by `depth(atom id)` (larger:
// nearer), the two swapped where the view looks from the other end.
export function nearerInFront(doc, bondIds, depth) {
  for (const id of bondIds) {
    const bond = doc.bonds.get(id);
    if (bond?.newman && depth(bond.b) > depth(bond.a)) [bond.a, bond.b] = [bond.b, bond.a];
  }
}

// --- editing ---

// The Newman projections a selection touches: end-on bonds with an atom selected.
export function newmansOf(doc, atomIds) {
  const chosen = new Set(atomIds);
  return endOnBonds(doc).filter((bond) => chosen.has(bond.a) || chosen.has(bond.b));
}

// The back of a Newman projection: the back atom's groups (the atoms reached from it not through the
// front one), or null if they lead round to the front (a ring: it can't turn on its own).
export function backGroups(doc, bond) {
  const byAtom = bondsByAtom(doc);
  const seen = new Set([bond.b]);
  const stack = [bond.b];
  while (stack.length) {
    const id = stack.pop();
    for (const next of byAtom.get(id)) {
      if (next === bond) continue;
      const to = otherEnd(next, id);
      if (to === bond.a) return null;
      if (!seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  seen.delete(bond.b);
  return [...seen];
}

// Turns the back of a Newman projection by `degrees` (clockwise on the page). False if it can't (a ring).
export function turnBack(doc, bond, degrees) {
  const atoms = backGroups(doc, bond);
  if (!atoms) return false;
  const centre = doc.atoms.get(bond.b);
  const [c, s] = [Math.cos(degrees * DEGREE), Math.sin(degrees * DEGREE)];
  for (const id of atoms) {
    const atom = doc.atoms.get(id);
    const [dx, dy] = [atom.x - centre.x, atom.y - centre.y];
    [atom.x, atom.y] = [centre.x + dx * c - dy * s, centre.y + dx * s + dy * c];
  }
  return true;
}

// The groups on a Newman projection's front or back carbon, from the top clockwise: [{ atom (the first
// atom of the group), angle (radians, y down) }].
export function groupsAround(doc, bond, side) {
  const centre = side === 'front' ? bond.a : bond.b;
  const other = side === 'front' ? bond.b : bond.a;
  const here = doc.atoms.get(centre);
  const up = (a) => ((a + Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); // from the top, clockwise
  return [...bondsByAtom(doc).get(centre)].map((b) => otherEnd(b, centre)).filter((id) => id !== other)
    .map((id) => ({ atom: id, angle: Math.atan2(doc.atoms.get(id).y - here.y, doc.atoms.get(id).x - here.x) }))
    .sort((p, q) => up(p.angle) - up(q.angle));
}

// How large a group on a Newman carbon is: its heavy atoms (a label's as its abbreviation has them; an
// unknown label, R, three), not counting the carbon it is on.
function groupSize(doc, centre, atom) {
  const byAtom = bondsByAtom(doc);
  const seen = new Set([centre, atom]);
  const stack = [atom];
  let size = 0;
  while (stack.length) {
    const id = stack.pop();
    size += heavyAtomsOf(doc.atoms.get(id));
    for (const next of byAtom.get(id)) {
      const to = otherEnd(next, id);
      if (!seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  return size;
}

// The group a Newman projection's dihedral is told by, on its front or back carbon: the largest (the most
// heavy atoms, then the heaviest first atom; H only if all are H), the same however the back is turned (a
// tie: the lower id). { atom, angle } as groupsAround has it, or undefined.
export function referenceGroup(doc, bond, side) {
  const centre = side === 'front' ? bond.a : bond.b;
  const weight = (g) => [groupSize(doc, centre, g.atom), atomicNumber(doc.atoms.get(g.atom).el) ?? 0, -g.atom];
  const heavier = (p, q) => {
    const [x, y] = [weight(p), weight(q)];
    for (let k = 0; k < 3; k++) if (x[k] !== y[k]) return x[k] > y[k] ? p : q;
    return p;
  };
  return groupsAround(doc, bond, side).reduce((best, g) => (best ? heavier(best, g) : g), undefined);
}

// The dihedral between the front's and the back's largest group (referenceGroup), in degrees 0–359, one of
// 0, 60 … 300 (an eclipsed back drawn a little further round counts as eclipsed), with the angle as drawn:
// { dihedral, raw, wide }, or null.
export function dihedralDrawn(doc, bond) {
  const [f, b] = [referenceGroup(doc, bond, 'front'), referenceGroup(doc, bond, 'back')];
  if (!f || !b) return null;
  const raw = ((((b.angle - f.angle) / DEGREE) % 360) + 360) % 360;
  const wide = groupsAround(doc, bond, 'front').some((g) => doc.atoms.get(g.atom).el !== 'H');
  const off = (x) => Math.abs(((raw - x + 540) % 360) - 180);
  const dihedral = [0, 60, 120, 180, 240, 300].reduce((best, d) => (off(drawnAt(d, wide)) < off(drawnAt(best, wide)) ? d : best), 0);
  return { dihedral, raw, wide };
}

export const dihedralOf = (doc, bond) => dihedralDrawn(doc, bond)?.dihedral ?? null;

// Sets the dihedral (degrees, as dihedralOf counts it) by turning the back. False if it can't turn.
export function setDihedral(doc, bond, dihedral) {
  const now = dihedralDrawn(doc, bond);
  if (!now || !backGroups(doc, bond)) return false;
  return turnBack(doc, bond, drawnAt(dihedral, now.wide) - now.raw);
}

// Is the group at `atom` on a Newman carbon a group of its own (not part of a ring through the carbon)?
export function ownGroup(doc, bond, atom) {
  const byAtom = bondsByAtom(doc);
  const centre = [bond.a, bond.b].find((id) => byAtom.get(id).some((b) => otherEnd(b, id) === atom));
  if (centre === undefined) return false;
  const others = new Set(byAtom.get(centre).map((b) => otherEnd(b, centre)).filter((id) => id !== atom));
  const seen = new Set([atom]);
  const stack = [atom];
  while (stack.length) {
    const id = stack.pop();
    for (const b of byAtom.get(id)) {
      const to = otherEnd(b, id);
      if (to === centre) continue;
      if (others.has(to)) return false;
      if (!seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  return true;
}

// Replaces the group at `atom` (on a Newman carbon) by the one `text` stands for, in the same place.
export function replaceGroup(doc, bond, atom, text) {
  const centre = [bond.a, bond.b].find((id) => bondsByAtom(doc).get(id).some((b) => otherEnd(b, id) === atom));
  if (centre === undefined) return;
  const here = doc.atoms.get(centre);
  const there = doc.atoms.get(atom);
  const angle = Math.atan2(there.y - here.y, there.x - here.x);
  // the old group: the atom and all beyond it
  const byAtom = bondsByAtom(doc);
  const gone = new Set([atom]);
  const stack = [atom];
  while (stack.length) {
    const id = stack.pop();
    for (const b of byAtom.get(id)) {
      const to = otherEnd(b, id);
      if (to !== centre && !gone.has(to)) {
        gone.add(to);
        stack.push(to);
      }
    }
  }
  // (as any deletion: its curved arrows, orbitals and overlap lines, highlights and brackets go or follow; an
  // orbital measured from it keeps its direction on the page)
  deleteObjects(doc, [...gone]);
  addGroup(doc, centre, text, angle);
}

// The text a group is shown as in the panel: its element with hydrogens, or its label.
export function groupText(doc, atom, valence) {
  const a = doc.atoms.get(atom);
  if (a.alias) return a.alias;
  const h = valence?.(atom) ?? 0;
  return `${a.el}${h ? `H${h > 1 ? h : ''}` : ''}`;
}

// --- for R/S: the molecule a projection shows ---

const LEAN = 0.33; // how far a Newman carbon's other bonds lean its way (front: towards the viewer)
const TURN = [28 * DEGREE, -18 * DEGREE]; // the model drawn turned so (about y, then x): the two carbons apart

// The atoms' places and wedges to write for molecules drawn as Newman projections, among `atomIds`:
// { at: Map id -> [x, y] (drawing units), wedges: Map bond id -> { stereo, from } }, or null if none is.
export function newmanStereo(doc, atomIds = null) {
  const wanted = atomIds ? new Set(atomIds) : null;
  const axles = endOnBonds(doc).filter((b) => !wanted || (wanted.has(b.a) && wanted.has(b.b)));
  if (!axles.length) return null;
  const byAtom = bondsByAtom(doc);
  const z = new Map();
  const queue = [];
  for (const axle of axles) {
    z.set(axle.a, 0.5);
    z.set(axle.b, -0.5);
  }
  for (const axle of axles) {
    for (const [centre, sign] of [[axle.a, 1], [axle.b, -1]]) {
      for (const b of byAtom.get(centre)) {
        const to = otherEnd(b, centre);
        if (z.has(to)) continue;
        z.set(to, z.get(centre) + sign * LEAN);
        queue.push(to);
      }
    }
  }
  // further atoms at their neighbour's depth (a group lies as drawn), wedges drawn there kept as they are
  while (queue.length) {
    const id = queue.shift();
    for (const b of byAtom.get(id)) {
      const to = otherEnd(b, id);
      if (z.has(to)) continue;
      z.set(to, z.get(id));
      queue.push(to);
    }
  }
  const [ay, ax] = TURN;
  const turned = (id) => {
    const atom = doc.atoms.get(id);
    const [x, y, d] = [atom.x, atom.y, z.get(id)];
    // about the vertical axis, then the horizontal one
    const [x1, z1] = [x * Math.cos(ay) + d * Math.sin(ay), -x * Math.sin(ay) + d * Math.cos(ay)];
    const [y2, z2] = [y * Math.cos(ax) - z1 * Math.sin(ax), y * Math.sin(ax) + z1 * Math.cos(ax)];
    return [x1, y2, z2];
  };
  const p3 = new Map([...z.keys()].map((id) => [id, turned(id)]));
  const at = new Map([...p3].map(([id, p]) => [id, [p[0], p[1]]]));
  const wedges = new Map();
  const used = new Set(); // bonds carrying a wedge already
  for (const b of doc.bonds.values()) if (b.stereo && b.stereo !== 'perspective') used.add(b.id);
  const volume = ([u, v, w]) => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
  const centres = new Set(axles.flatMap((b) => [b.a, b.b]));
  for (const c of centres) {
    const bonds = byAtom.get(c).filter((b) => !b.kind && b.order === 1);
    if (bonds.length < 3) continue;
    const from = (id) => p3.get(id).map((v, i) => v - p3.get(c)[i]);
    const depth = (id) => from(id)[2];
    const neighbours = bonds.map((b) => otherEnd(b, c));
    // a substituent first, then the one that stands out most
    const order = bonds.filter((b) => !used.has(b.id) && Math.abs(depth(otherEnd(b, c))) >= 0.1)
      .sort((p, q) => Number(centres.has(otherEnd(p, c))) - Number(centres.has(otherEnd(q, c))) || Math.abs(depth(otherEnd(q, c))) - Math.abs(depth(otherEnd(p, c))));
    for (const b of order) {
      const d = otherEnd(b, c);
      const three = [d, ...neighbours.filter((x) => x !== d).slice(0, 2)];
      const page = volume(three.map((i) => [from(i)[0], from(i)[1], i === d ? Math.sign(depth(d)) : 0]));
      if (Math.abs(page) < 0.05 || Math.sign(page) !== Math.sign(volume(three.map(from)))) continue;
      wedges.set(b.id, { stereo: depth(d) > 0 ? 'wedge' : 'hash', from: c });
      used.add(b.id);
      break;
    }
  }
  return { at, wedges };
}

// A copy of the drawing with its Newman projections drawn plainly (RDKit's 2D drawing, with wedges for
// their R/S), for other programs; the drawing itself if it has none. `RDKit`: the loaded RDKit.js;
// `writeMolfile`, `readMol`: passed in (they live in io/).
export function plainNewmans(doc, { RDKit, writeMolfile, readMol, parseMolfile, fragments }) {
  if (!endOnBonds(doc).length) return doc;
  const copy = structuredClone(doc);
  for (const members of fragments(copy)) {
    if (!endOnBonds(copy).some((b) => members.includes(b.a))) continue;
    const { molfile, atomIds } = writeMolfile(copy, members);
    const mol = readMol(RDKit, molfile);
    let block;
    try {
      mol.set_new_coords(true);
      block = mol.get_molblock();
    } finally {
      mol.delete();
    }
    const parsed = parseMolfile(block);
    if (parsed.atoms.length !== atomIds.length) continue;
    const lengths = parsed.bonds.map(({ a, b }) => Math.hypot(parsed.atoms[a].x - parsed.atoms[b].x, parsed.atoms[a].y - parsed.atoms[b].y)).sort((p, q) => p - q);
    const unit = lengths[Math.floor(lengths.length / 2)] || 1;
    const old = atomIds.map((id) => copy.atoms.get(id));
    const [cx, cy] = [old.reduce((s, a) => s + a.x, 0) / old.length, old.reduce((s, a) => s + a.y, 0) / old.length];
    const [px, py] = [parsed.atoms.reduce((s, a) => s + a.x, 0) / old.length, parsed.atoms.reduce((s, a) => s + a.y, 0) / old.length];
    parsed.atoms.forEach((p, k) => Object.assign(copy.atoms.get(atomIds[k]), { x: cx + (p.x - px) / unit, y: cy - (p.y - py) / unit }));
    const byPair = new Map(parsed.bonds.map((b) => [[atomIds[b.a], atomIds[b.b]].sort((p, q) => p - q).join('-'), b]));
    for (const bond of copy.bonds.values()) {
      const found = byPair.get([bond.a, bond.b].sort((p, q) => p - q).join('-'));
      if (!found) continue;
      delete bond.newman;
      bond.stereo = found.stereo;
      if (found.stereo && atomIds[found.a] !== bond.a) [bond.a, bond.b] = [bond.b, bond.a];
    }
  }
  return copy;
}
