// Cyclohexane chairs and a boat, for conformation drawings, drawn the way
// they are by hand in textbooks: two parallel long edges (back and front)
// joined at a raised left tip and a lowered right tip, opposite edges
// parallel, the raised tip level with the top corner and the lowered one
// with the bottom corner; axial bonds straight up or down, each equatorial bond parallel
// to the ring bonds one removed from it. The left tip raised and the right
// one lowered is the 4C1 chair of D-glucose. They carry no wedges: a chair
// is read as the 3D chair it shows (ringFlip.js, chairStereo), and files
// get its R/S as wedges.
import { addAtom, addBond, emptyDoc } from '../model/doc.js';
import { cyclohexaneNewmanDoc, newmanDoc } from './newman.js';

const DEGREE = Math.PI / 180;
const SIZE = 1.3; // chairs are drawn larger than flat rings, so their labels have room
const EDGE = 20 * DEGREE; // the long edges rise to the right
const TIP_BACK = -EDGE; // from the left tip to the back edge: the tips level with the far ends of the long edges
const TIP_FRONT = -55 * DEGREE; // from the left tip to the front edge

const unit = (a) => [Math.cos(a), Math.sin(a)];
const add = (p, v, k = 1) => [p[0] + k * v[0], p[1] + k * v[1]];

// The six ring corners (y up) in ring order: the left tip, the back edge,
// the right tip, the front edge; with which way each sticks out (+1 up).
export function chairCorners(flip) {
  const [d, back, front] = [unit(EDGE), unit(TIP_BACK), unit(TIP_FRONT)];
  const t1 = [0, 0];
  const u1 = add(t1, back);
  const l1 = add(t1, front);
  const u2 = add(u1, d);
  const l2 = add(l1, d);
  const t2 = add(u2, front); // the same as add(l2, back): opposite edges are parallel
  const corners = [t1, u1, u2, t2, l2, l1];
  const up = [1, -1, 1, -1, 1, -1];
  // the other chair is the mirror image: its left tip lowered, right tip raised
  return flip ? { corners: corners.map(([x, y]) => [x, -y]), up: up.map((u) => -u) } : { corners, up };
}

// A ring from corners (y up) with substituents: `axial` and `equatorial`
// per ring position a symbol, a list of symbols (a chain: ['C', 'O'] for
// CH2OH) or null.
function ringDoc(ring, { corners, up }, axial, equatorial, scale = SIZE) {
  const doc = emptyDoc();
  const ids = corners.map(([x, y], k) => addAtom(doc, scale * x, -scale * y, ring[k]).id);
  ids.forEach((id, k) => addBond(doc, id, ids[(k + 1) % 6]));
  const centre = [corners.reduce((s, p) => s + p[0], 0) / 6, corners.reduce((s, p) => s + p[1], 0) / 6];
  const ends = []; // substituent atoms so far, to keep labels apart
  const substituent = (from, start, dir, symbols) => {
    let [previous, at] = [from, start];
    [].concat(symbols).forEach((el, n) => {
      // further atoms of a chain zigzag on at 120°
      const turn = n === 0 ? 0 : (n % 2 ? 60 : -60) * DEGREE;
      const step = [dir[0] * Math.cos(turn) - dir[1] * Math.sin(turn), dir[0] * Math.sin(turn) + dir[1] * Math.cos(turn)];
      // a little shorter or longer if the label would land on another one
      // (C3 and C4 of a sugar point into the same corner)
      const room = (r) => Math.min(Infinity, ...ends.map((e) => Math.hypot(e[0] - (at[0] + r * step[0]), e[1] - (at[1] + r * step[1]))));
      const reaches = [1, 0.85, 1.15, 0.7, 1.3, 1.45];
      const reach = reaches.find((r) => room(r) >= 0.85 / scale) ?? reaches.reduce((best, r) => (room(r) > room(best) ? r : best));
      at = add(at, step, reach);
      ends.push(at);
      const atom = addAtom(doc, scale * at[0], -scale * at[1], el);
      addBond(doc, previous, atom.id);
      previous = atom.id;
    });
  };
  corners.forEach((p, k) => {
    if (axial[k]) substituent(ids[k], p, [0, 0.9 * up[k]], axial[k]);
    if (equatorial[k]) {
      const [q, r] = [corners[(k + 1) % 6], corners[(k + 2) % 6]];
      const length = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1;
      let dir = [(r[0] - q[0]) / length, (r[1] - q[1]) / length];
      if ((p[0] - centre[0]) * dir[0] + (p[1] - centre[1]) * dir[1] < 0) dir = [-dir[0], -dir[1]]; // out of the ring
      substituent(ids[k], p, dir, equatorial[k]);
    }
  });
  return doc;
}

// A chair: `ring` six element symbols, `axial` and `equatorial` per ring
// position (see ringDoc); `flip`: the other chair (after a ring flip, axial
// and equatorial swap). Ring positions: 0 the raised left tip, 1 and 2 the
// back edge, 3 the lowered right tip, 4 and 5 the front edge.
export function chairDoc({ ring = Array(6).fill('C'), axial = [], equatorial = [], flip = false, scale = SIZE } = {}) {
  return ringDoc(ring, chairCorners(flip), axial, equatorial, scale);
}

// A boat: both tips raised (the flagpoles), the back and front edges level.
export function boatDoc({ ring = Array(6).fill('C') } = {}) {
  const corners = [[0, 0.55], [0.6, -0.05], [1.6, -0.05], [2.2, 0.55], [1.75, -0.5], [0.45, -0.5]];
  return ringDoc(ring, { corners, up: [1, -1, -1, 1, -1, -1] }, [], []);
}

// Adamantane as a cage, as in textbooks: a chair whose three raised
// corners go straight up (a little longer than a bond) to the CH2 of the
// upper chair, those three joined at the top CH: midway between the two
// upper tips, a third of the rise above them.
export function adamantaneCage(scale = SIZE) {
  const { corners } = chairCorners(false);
  const doc = emptyDoc();
  // each atom's depth (the larger, the nearer): the chair's upper edge behind, its lower edge in front, the tips
  // between; a bridge as deep as its corner, the top in the middle. Each bond gets its atoms' mean (bond.z, as a
  // drawing from a 3D view has), so that a bond behind is broken where one in front crosses it
  const CORNER_DEPTH = [0, -1, -1, 0, 1, 1];
  const depth = new Map();
  const bond = (a, b) => Object.assign(addBond(doc, a, b), { z: (depth.get(a) + depth.get(b)) / 2 });
  const ids = corners.map(([x, y], k) => {
    const { id } = addAtom(doc, scale * x, -scale * y);
    depth.set(id, CORNER_DEPTH[k]);
    return id;
  });
  ids.forEach((id, k) => bond(id, ids[(k + 1) % 6]));
  const RISE = 1.2;
  const tops = [0, 2, 4].map((k) => add(corners[k], [0, RISE]));
  const top = addAtom(doc, scale * (tops[0][0] + tops[1][0]) / 2, -scale * (tops.reduce((s, p) => s + p[1], 0) / 3 + RISE / 3));
  depth.set(top.id, 0);
  [0, 2, 4].forEach((k, n) => {
    const ch2 = addAtom(doc, scale * tops[n][0], -scale * tops[n][1]);
    depth.set(ch2.id, CORNER_DEPTH[k]);
    bond(ids[k], ch2.id);
    bond(ch2.id, top.id);
  });
  return doc;
}

// Adamantane drawn flat, as J drew it (2026-11-09): two six-membered rings sharing three atoms, and from the
// lower ring's bottom atom a long bond through the inside up to the top, behind the bridge it crosses (bond.z:
// that one behind, the others level), so that it is broken there. Bond length 1, as flat rings are drawn.
export function adamantaneFlat() {
  // (J's molfile: x, y up, bond length 1.5)
  const points = [[-0.965, -15.8071], [0.334, -15.0571], [0.334, -13.5571], [-0.965, -12.8071], [-2.2641, -13.5571], [-2.2641, -15.0571],
    [-2.2641, -12.0571], [0.334, -12.0571], [-0.965, -11.3071], [-0.2468, -13.8883]];
  const bonds = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [4, 6], [2, 7], [6, 8], [8, 7], [0, 9], [9, 8]];
  const doc = emptyDoc();
  const ids = points.map(([x, y]) => addAtom(doc, x / 1.5, -y / 1.5).id);
  for (const [a, b] of bonds) Object.assign(addBond(doc, ids[a], ids[b]), { z: a === 9 && b === 8 ? -1 : 0 });
  return doc;
}

export const CHAIRS = [
  ['Chair', () => chairDoc()],
  ['Chair, flipped', () => chairDoc({ flip: true })],
  ['Boat', () => boatDoc()],
  ['Chair with H', () => chairDoc({ axial: Array(6).fill('H'), equatorial: Array(6).fill('H'), scale: 1.5 })],
  ['Methyl, equatorial', () => chairDoc({ equatorial: [null, null, null, 'C'] })],
  ['Methyl, axial', () => chairDoc({ axial: [null, null, null, 'C'] })],
  // 4C1: C4 the raised left tip, C5 and the ring O at the back, C1 the
  // lowered right tip, C2 and C3 in front; β-D: all substituents
  // equatorial, α-D: the OH at C1 axial (down)
  ['β-D-Glucose, chair', () => chairDoc({ ring: ['C', 'C', 'O', 'C', 'C', 'C'], equatorial: ['O', ['C', 'O'], null, 'O', 'O', 'O'], scale: 1.6 })],
  ['α-D-Glucose, chair', () => chairDoc({ ring: ['C', 'C', 'O', 'C', 'C', 'C'], axial: [null, null, null, 'O'], equatorial: ['O', ['C', 'O'], null, null, 'O', 'O'], scale: 1.6 })],
  ['Ethane, staggered (Newman)', () => newmanDoc(['H', 'H', 'H'], ['H', 'H', 'H'], 60)],
  ['Ethane, eclipsed (Newman)', () => newmanDoc(['H', 'H', 'H'], ['H', 'H', 'H'], 0)],
  ['Butane, anti (Newman)', () => newmanDoc(['CH3', 'H', 'H'], ['CH3', 'H', 'H'], 180)],
  ['Butane, gauche (Newman)', () => newmanDoc(['CH3', 'H', 'H'], ['CH3', 'H', 'H'], 60)],
  ['Butane, eclipsed (Newman)', () => newmanDoc(['CH3', 'H', 'H'], ['CH3', 'H', 'H'], 0)],
  // seen along C1–C2 and C5–C4: two Newman projections side by side (E2 needs H and the leaving group anti, both axial)
  ['Cyclohexane (Newman)', () => cyclohexaneNewmanDoc()],
];
