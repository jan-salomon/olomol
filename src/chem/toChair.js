// A flat six-membered ring drawn as a chair (the ring flip tool on a ring that isn't a chair yet): the
// template's chair (chair.js) put where the ring was, each group on its ring atom's axial or equatorial
// place by the face it is on (a wedge towards the viewer: the top face; a hashed wedge: the bottom one;
// a Haworth projection's groups up or down as projectionStereo reads them). Always the same chair, the
// templates' (its left tip raised, a sugar's 4C1), each ring atom on the corner where it stood round the ring,
// so two isomers drawn alike come out alike (the other chair is the ring flip's); a group whose face the
// drawing doesn't say goes equatorial, with a wavy bond where it
// sits on a stereocentre (moved to its other place, the molecule would change). Which way round the ring
// goes onto the template is the one that keeps the drawn stereoisomer (checked by RDKit's SMILES). A ring
// hung on a larger molecule (a cyclohexyl) moves to it; the rest of the molecule stays where it is.
// Refused: a ring with a double bond in it or on it (a cyclohexene's half-chair isn't drawn), fused or
// bridged rings, more than two groups on a ring atom.
import { chairCorners } from './chair.js';
import { heavyAtomsOf } from './abbreviations.js';
import { projectionStereo } from './projections.js';
import { writeMolfile } from '../io/molfile.js';
import { bondsByAtom, otherEnd } from '../model/doc.js';

const SIZE = 1.3; // as the chair templates are drawn (a sugar's larger, its labels needing room: SUGAR)
const SUGAR = 1.6;
const REACHES = [1, 0.85, 1.15, 0.7, 1.3, 1.45]; // a group's bond a little shorter or longer where its label would meet another (chair.js)
const AXIAL = 0.9; // an axial bond's length, in the template's units (chair.js)

const covalent = (bond) => !bond.kind;

// How much a group weighs for being axial: its heavy atoms (a label's as its abbreviation has them, R three).
function heavyAtoms(doc, members) {
  let n = 0;
  for (const id of members) n += heavyAtomsOf(doc.atoms.get(id));
  return n;
}

// The ring's groups as the chair needs them, or { error }: [{ k (ring position), ring (atom), first, bond,
// members, face (+1 the top face, −1 the bottom one, 0 not said), size }].
export function chairPlan(doc, ring, byAtom = bondsByAtom(doc)) {
  if (ring.length !== 6) return { error: 'shape' };
  const inRing = new Set(ring);
  for (let i = 0; i < 6; i++) {
    const bond = byAtom.get(ring[i]).find((b) => otherEnd(b, ring[i]) === ring[(i + 1) % 6]);
    if (bond && !bond.kind && bond.order === 1 && isWedge(bond)) return { error: 'ringWedge' }; // (one ringToChair couldn't move off)
    if (!bond || bond.kind || bond.order !== 1 || !['', 'perspective', undefined].includes(bond.stereo)) return { error: 'double' };
  }
  const projected = projectionStereo(doc, { ids: [...doc.atoms.keys()] });
  const groups = [];
  for (const [k, c] of ring.entries()) {
    const own = byAtom.get(c).filter((b) => covalent(b) && !inRing.has(otherEnd(b, c)));
    if (own.length > 2) return { error: 'crowded' };
    for (const bond of own) {
      if (bond.order !== 1) return { error: 'double' };
      const first = otherEnd(bond, c);
      const members = new Set([first]);
      for (const stack = [first]; stack.length;) {
        const id = stack.pop();
        for (const next of byAtom.get(id)) {
          if (!covalent(next) && next.kind !== 'dative') continue;
          const to = otherEnd(next, id);
          if (inRing.has(to)) {
            if (next !== bond) return { error: 'fused' };
            continue;
          }
          if (!members.has(to)) {
            members.add(to);
            stack.push(to);
          }
        }
      }
      // the face: a wedge from the ring atom towards the viewer is on the top face (from the group's end, the
      // other way round); a Haworth group up or down as projectionStereo has it
      const stereo = bond.stereo === 'wedge' || bond.stereo === 'hash' ? { stereo: bond.stereo, from: bond.a } : projected.get(bond.id);
      const face = !stereo ? 0 : (stereo.stereo === 'wedge' ? 1 : -1) * (stereo.from === c ? 1 : -1);
      groups.push({ k, ring: c, first, bond, members: [...members], face, size: heavyAtoms(doc, members) });
    }
  }
  // the two groups of one atom on opposite faces: one said, the other is the other one
  for (const c of ring) {
    const here = groups.filter((g) => g.ring === c);
    if (here.length === 2 && !here[0].face !== !here[1].face) {
      const [known, other] = here[0].face ? here : [here[1], here[0]];
      other.face = -known.face;
    }
  }
  return { groups };
}

const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const plus = (p, q) => [p[0] + q[0], p[1] + q[1]];
const times = (p, k) => [p[0] * k, p[1] * k];

// The chair's places, on the page (y down): `way` ±1 round the template, `turn` the template corner of ring
// position 0, `flip` the other chair. { corner(k), slot(k, top): [direction], top(k): the slot on the top face }.
function template(way, turn, flip, size = SIZE) {
  const SIZE = size;
  const { corners, up } = chairCorners(flip);
  const page = corners.map(([x, y]) => [SIZE * x, -SIZE * y]);
  const middle = [page.reduce((s, p) => s + p[0], 0) / 6, page.reduce((s, p) => s + p[1], 0) / 6];
  const at = (k) => (((turn + way * k) % 6) + 6) % 6;
  const equatorial = (c) => {
    const [q, r] = [page[(c + 1) % 6], page[(c + 2) % 6]];
    const length = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1;
    const dir = [(r[0] - q[0]) / length, (r[1] - q[1]) / length];
    return (page[c][0] - middle[0]) * dir[0] + (page[c][1] - middle[1]) * dir[1] < 0 ? times(dir, -SIZE) : times(dir, SIZE);
  };
  return {
    corner: (k) => sub(page[at(k)], middle),
    // the axial place points up the page where the corner sticks up: that is the top face's there
    axial: (k) => [0, -AXIAL * SIZE * up[at(k)]],
    equatorial: (k) => equatorial(at(k)),
    topIsAxial: (k) => up[at(k)] === 1,
    // where the corner stands round the ring, as if the chair were a regular hexagon seen from above (degrees,
    // y up): the left tip 180°, the back edge's corners 120° and 60°, the right tip 0°, the front edge's 300°
    // and 240° (the other chair, mirrored, has its back and front edges' corners the other way round)
    round: (k) => (flip ? [180, 240, 300, 0, 60, 120] : [180, 120, 60, 0, 300, 240])[at(k)],
  };
}

// Where each group goes for `faces` (group -> ±1, every group's): 'axial' or 'equatorial'.
function slotsFor(plan, place, faces) {
  return new Map(plan.groups.map((g) => [g, (faces.get(g) === 1) === place.topIsAxial(g.k) ? 'axial' : 'equatorial']));
}

// The faces of the groups the drawing leaves open, for a chair: equatorial where it can (the larger of two
// on one atom), the other one the other face.
function openFaces(plan, place) {
  const faces = new Map(plan.groups.map((g) => [g, g.face]));
  for (const k of [0, 1, 2, 3, 4, 5]) {
    const here = plan.groups.filter((g) => g.k === k && !faces.get(g));
    const said = plan.groups.find((g) => g.k === k && faces.get(g));
    const equatorialFace = place.topIsAxial(k) ? -1 : 1;
    if (said) for (const g of here) faces.set(g, -faces.get(said));
    else if (here.length === 2) {
      const [big, small] = here[0].size >= here[1].size ? here : [here[1], here[0]];
      faces.set(big, equatorialFace);
      faces.set(small, -equatorialFace);
    } else if (here.length === 1) faces.set(here[0], equatorialFace);
  }
  return faces;
}

// The drawing as a chair: a copy of `doc` with the ring and its groups moved, the groups' wedges taken off
// (a chair says it), `wavy` groups' bonds wavy. Returns the copy.
function drawn(doc, ring, plan, place, faces, wavy) {
  const copy = structuredClone(doc);
  const centre = ring.reduce((s, id) => plus(s, [doc.atoms.get(id).x, doc.atoms.get(id).y]), [0, 0]).map((v) => v / 6);
  const slots = slotsFor(plan, place, faces);
  const slotOf = (g) => (slots.get(g) === 'axial' ? place.axial(g.k) : place.equatorial(g.k));
  // each group's bond as long as it can be with its first atom clear of the others' (as the templates do it)
  const reach = new Map();
  const ends = [];
  for (const g of plan.groups) {
    const tip = (r) => plus(place.corner(g.k), times(slotOf(g), r));
    const room = (r) => Math.min(Infinity, ...ends.map((e) => Math.hypot(...sub(e, tip(r)))));
    const r = REACHES.find((x) => room(x) >= 0.85) ?? REACHES.reduce((best, x) => (room(x) > room(best) ? x : best));
    reach.set(g, r);
    ends.push(tip(r));
  }
  const direction = (g) => times(slotOf(g), reach.get(g));
  // a ring hung on a larger molecule: that molecule stays, the chair goes to it
  const anchor = plan.groups.filter((g) => g.size > 6).sort((p, q) => q.size - p.size)[0];
  let shift = centre;
  if (anchor) {
    const first = doc.atoms.get(anchor.first);
    shift = sub([first.x, first.y], plus(place.corner(anchor.k), direction(anchor)));
  }
  ring.forEach((id, k) => {
    const [x, y] = plus(place.corner(k), shift);
    Object.assign(copy.atoms.get(id), { x, y });
  });
  for (const g of plan.groups) {
    const bond = copy.bonds.get(g.bond.id);
    bond.stereo = wavy.has(g) ? 'wavy' : '';
    if (wavy.has(g) && bond.a !== g.ring) [bond.a, bond.b] = [bond.b, bond.a];
    if (g === anchor) continue;
    // the group turned about its first atom to its new direction, its first atom at its place
    const [r0, f0] = [doc.atoms.get(g.ring), doc.atoms.get(g.first)];
    const was = Math.atan2(f0.y - r0.y, f0.x - r0.x);
    const dir = direction(g);
    const turn = Math.atan2(dir[1], dir[0]) - was;
    const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
    const target = plus([copy.atoms.get(g.ring).x, copy.atoms.get(g.ring).y], dir);
    for (const id of g.members) {
      const a = doc.atoms.get(id);
      const [dx, dy] = [a.x - f0.x, a.y - f0.y];
      Object.assign(copy.atoms.get(id), { x: target[0] + dx * cos - dy * sin, y: target[1] + dx * sin + dy * cos });
    }
  }
  // the ring's bonds: plain (a Haworth's thick front edge goes)
  for (let i = 0; i < 6; i++) {
    for (const bond of copy.bonds.values()) {
      if ((bond.a === ring[i] && bond.b === ring[(i + 1) % 6]) || (bond.b === ring[i] && bond.a === ring[(i + 1) % 6])) bond.stereo = '';
    }
  }
  return copy;
}

// The canonical SMILES of the copy's molecule (these atoms). (Its drawn hydrogens taken off: two drawn on one
// ring carbon and none on the other side would make a carbon that isn't one look like a stereocentre.)
function smilesOf(RDKit, doc, ids) {
  const mol = RDKit.get_mol(writeMolfile(doc, ids).molfile, JSON.stringify({ removeHs: true }));
  if (!mol) return null;
  try {
    return mol.get_smiles();
  } finally {
    mol.delete();
  }
}

// The atoms of the molecule `ring` is in
function moleculeOf(ring, byAtom) {
  const molecule = new Set(ring);
  for (const stack = [...ring]; stack.length;) {
    const id = stack.pop();
    for (const b of byAtom.get(id)) {
      const to = otherEnd(b, id);
      if (b.kind !== 'link' && !molecule.has(to)) {
        molecule.add(to);
        stack.push(to);
      }
    }
  }
  return [...molecule];
}

// A wedge or hashed wedge (the bond's narrow end at its atom a)
export const isWedge = (bond) => bond.stereo === 'wedge' || bond.stereo === 'hash';
// The wedges on the bonds of the ring `ring` itself (six atom ids), not on its groups
export function ringWedges(doc, ring) {
  const inRing = new Set(ring);
  return [...doc.bonds.values()].filter((b) => inRing.has(b.a) && inRing.has(b.b) && isWedge(b));
}

// A wedge on a bond of the ring itself (one way to draw a ring atom's R/S: tramadol's C1, wedged towards C6)
// says which face a ring atom is on, which a chair's axial and equatorial places can't take. Each such wedge
// moved onto a group of the ring atom at its narrow end, as a wedge or a hashed wedge, whichever keeps the
// molecule the same (by its canonical SMILES), or simply taken off where that keeps it (no stereocentre there,
// or its R/S drawn by another wedge already). No other bond is touched. A copy of `doc` so, or `doc` itself if
// no ring bond has a wedge or one can't be moved.
function wedgesOffRing(RDKit, doc, ring, byAtom) {
  const wedges = ringWedges(doc, ring);
  if (!wedges.length) return doc;
  const inRing = new Set(ring);
  const ids = moleculeOf(ring, byAtom);
  const want = smilesOf(RDKit, doc, ids);
  if (!want) return doc;
  const copy = structuredClone(doc);
  const copyByAtom = bondsByAtom(copy);
  const same = () => smilesOf(RDKit, copy, ids) === want;
  for (const { id } of wedges) {
    const centre = copy.bonds.get(id).a;
    copy.bonds.get(id).stereo = '';
    if (same()) continue;
    // its groups' plain single bonds (one with a wedge of its own, or wavy, stays as drawn)
    const groups = copyByAtom.get(centre).filter((b) => !b.kind && b.order === 1 && !b.stereo && !inRing.has(otherEnd(b, centre)));
    const moved = groups.some((bond) => ['wedge', 'hash'].some((stereo) => {
      const { a, b } = bond;
      Object.assign(bond, { a: centre, b: otherEnd(bond, centre), stereo }); // (its narrow end at the ring atom)
      if (same()) return true;
      Object.assign(bond, { a, b, stereo: '' });
      return false;
    }));
    if (!moved) return doc;
  }
  return copy;
}

// The ring `ring` (six atom ids in ring order) of `doc` as a chair: { doc (a copy, drawn so), atoms (those
// moved), wavy (how many groups got a wavy bond) } or { error: 'shape' | 'double' | 'ringWedge' | 'fused' |
// 'crowded' | 'stereo' }. `RDKit`: loaded.
export function ringToChair(RDKit, given, ring) {
  // (a wedge on a ring bond first moved onto a group, the R/S the same)
  const givenByAtom = bondsByAtom(given);
  const doc = wedgesOffRing(RDKit, given, ring, givenByAtom);
  const byAtom = doc === given ? givenByAtom : bondsByAtom(doc);
  const plan = chairPlan(doc, ring, byAtom);
  if (plan.error) return plan;
  // the molecule's atoms, to compare it with
  const ids = moleculeOf(ring, byAtom);
  const want = smilesOf(RDKit, doc, ids);
  if (!want) return { error: 'stereo' };
  // a larger molecule the ring hangs on stays where it is (see drawn): the angle at its first atom
  const anchor = plan.groups.filter((g) => g.size > 6).sort((p, q) => q.size - p.size)[0];
  const onward = anchor && byAtom.get(anchor.first).map((b) => otherEnd(b, anchor.first)).find((id) => id !== anchor.ring);
  // every way the ring can go onto the template's chair (round it either way, six turns), the best first: no
  // two groups' first atoms close (their labels on each other), nor
  // (hung on a larger molecule that stays) the chair on that molecule; then, so hung, the angle at its first
  // atom nearest 120°, else the ring's atoms nearest where they were; then the groups furthest apart
  const ringCentre = ring.reduce((s, id) => plus(s, [doc.atoms.get(id).x, doc.atoms.get(id).y]), [0, 0]).map((v) => v / 6);
  // (a ring with four groups or more, a sugar, drawn as large as the sugar templates: its labels need room)
  const size = plan.groups.filter((g) => g.size > 0).length >= 4 ? SUGAR : SIZE;
  const candidates = [];
  for (const way of [1, -1]) {
    for (const flip of [false]) { // (the templates' chair only: see the top)
      for (let turn = 0; turn < 6; turn++) {
        const place = template(way, turn, flip, size);
        const faces = openFaces(plan, place);
        const slots = slotsFor(plan, place, faces);
        const tip = (g) => plus(place.corner(g.k), slots.get(g) === 'axial' ? place.axial(g.k) : place.equatorial(g.k));
        const gaps = plan.groups.flatMap((g, i) => plan.groups.slice(i + 1).map((h) => Math.hypot(...sub(tip(g), tip(h)))));
        const closest = Math.min(Infinity, ...gaps);
        let crowded = gaps.filter((d) => d < 1.2).length;
        let off;
        if (anchor) {
          const dir = slots.get(anchor) === 'axial' ? place.axial(anchor.k) : place.equatorial(anchor.k);
          const first = doc.atoms.get(anchor.first);
          const shift = sub([first.x, first.y], plus(place.corner(anchor.k), dir));
          const points = [...ring.map((_, k) => plus(place.corner(k), shift)), ...plan.groups.filter((g) => g !== anchor).map((g) => plus(tip(g), shift))];
          const staying = anchor.members.filter((id) => id !== anchor.first).map((id) => doc.atoms.get(id));
          crowded += points.filter((p) => staying.some((a) => Math.hypot(a.x - p[0], a.y - p[1]) < 1)).length;
        }
        if (onward !== undefined) {
          const dir = slots.get(anchor) === 'axial' ? place.axial(anchor.k) : place.equatorial(anchor.k);
          const [f, n] = [doc.atoms.get(anchor.first), doc.atoms.get(onward)];
          const back = Math.atan2(-dir[1], -dir[0]);
          const on = Math.atan2(n.y - f.y, n.x - f.x);
          off = Math.abs(Math.abs(Math.atan2(Math.sin(back - on), Math.cos(back - on))) * 180 / Math.PI - 120);
        } else {
          // each ring atom on the corner that stands where it did round the ring (the drawing tilted back: its
          // top edge the chair's back edge, its tips the chair's tips), so two isomers drawn alike come out
          // alike, a group on the same corner; a ring drawn with a tip up is turned anticlockwise by 30°
          // (its top atom onto the back edge's left corner)
          let turned = 0;
          off = ring.reduce((s, id, k) => {
            const a = doc.atoms.get(id);
            const drawnAt = Math.atan2(ringCentre[1] - a.y, a.x - ringCentre[0]) * 180 / Math.PI;
            const d = ((place.round(k) - drawnAt) % 360 + 540) % 360 - 180;
            turned += d;
            return s + Math.abs(d);
          }, 0);
          if (turned < 0) off += 0.5;
        }
        candidates.push({ key: `${way}${flip}`, place, faces, crowded, off, near: -closest });
      }
    }
  }
  // (a ring on its own: where it was drawn before the labels' room; hung on a larger molecule, that molecule clear
  // first)
  const order = anchor ? ['crowded', 'off', 'near'] : ['off', 'crowded', 'near'];
  candidates.sort((p, q) => {
    for (const key of order) if (Math.abs(p[key] - q[key]) > 1e-6) return p[key] - q[key];
    return 0;
  });
  // the best whose way round keeps the drawn stereoisomer: the other way round is the drawing's mirror image
  // (it keeps it too only for a molecule that is its own mirror image)
  const refused = new Set();
  for (const { key, place, faces } of candidates) {
    if (refused.has(key)) continue;
    // the groups the drawing leaves open on a stereocentre: their other place makes another molecule
    const placed = smilesOf(RDKit, drawn(doc, ring, plan, place, faces, new Set()), ids);
    const wavy = new Set();
    for (const g of plan.groups.filter((x) => !x.face)) {
      const swapped = new Map(faces);
      for (const h of plan.groups.filter((x) => x.k === g.k)) swapped.set(h, -faces.get(h));
      if (smilesOf(RDKit, drawn(doc, ring, plan, place, swapped, new Set()), ids) !== placed) wavy.add(g);
    }
    const result = drawn(doc, ring, plan, place, faces, wavy);
    if (smilesOf(RDKit, result, ids) === want) {
      const atoms = [...ring, ...plan.groups.flatMap((g) => g.members)];
      return { doc: result, atoms, wavy: wavy.size };
    }
    refused.add(key);
  }
  return { error: 'stereo' };
}
