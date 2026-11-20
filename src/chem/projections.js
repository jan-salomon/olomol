// Haworth and Fischer projections: templates, and what their stereo is in
// files. A Haworth ring is drawn with its sides tapered (perspective bonds,
// no stereo of their own) and its front bold; substituents go straight up
// or down. A Fischer projection is a vertical chain whose stereocentres
// (atom.projection = 'fischer') are crossings: horizontal bonds come
// towards the viewer, vertical ones go away.
import { addAtom, addBond, bondsByAtom, emptyDoc, otherEnd } from '../model/doc.js';
import { smallestRings } from '../model/graph.js';
import { chairStereo, standsRound } from './ringFlip.js';

// Wedges for files: a Haworth ring seen from above (the side we look at it
// from), so a substituent drawn up is a wedge and one drawn down a hash;
// at a Fischer centre the horizontal bonds are wedges; a chair as the 3D
// chair it shows (chairStereo). Returns Map bond id -> { stereo: 'wedge' |
// 'hash', from: the atom at the narrow end }. `sided`: also a chair's CH2
// with its two hydrogens drawn (no stereocentre: for telling its axial H
// from its equatorial one, see writeMolfile). `ids`: only these atoms' (a molfile of one molecule: the
// chairs of the others aren't fitted for it), or all.
export function projectionStereo(doc, { sided = false, ids = null } = {}) {
  const result = new Map();
  const wanted = ids ? new Set(ids) : null;
  const among = (id) => !wanted || wanted.has(id);
  const sides = [...doc.bonds.values()].filter((b) => b.stereo === 'perspective' && among(b.a) && among(b.b));
  const centres = [...doc.atoms.values()].filter((a) => a.projection === 'fischer' && among(a.id));
  const byAtom = bondsByAtom(doc);
  // (rings only where a chair could be: six atoms with two bonds or more)
  const ringish = [...doc.atoms.keys()].filter((id) => among(id) && byAtom.get(id).length >= 2).length >= 6;
  if (!sides.length && !centres.length && !ringish) return result;
  // (rings looked for among `ids` only: a molfile of one molecule doesn't search the whole drawing's)
  const part = wanted && {
    atoms: new Map([...wanted].filter((id) => doc.atoms.has(id)).map((id) => [id, doc.atoms.get(id)])),
    bonds: new Map([...doc.bonds].filter(([, b]) => wanted.has(b.a) && wanted.has(b.b))),
  };
  const rings = part ? smallestRings(part, bondsByAtom(part)) : smallestRings(doc, byAtom);
  const inside = [...rings.values()].filter((ring) => ring.every(among));
  for (const [id, wedge] of chairStereo(doc, inside, byAtom)) {
    if (sided || !wedge.hydrogens) result.set(id, { stereo: wedge.stereo, from: wedge.from });
  }
  const free = (bond) => bond.order === 1 && !bond.stereo && !bond.kind && !result.has(bond.id);
  if (sides.length) {
    const ring = new Set(sides.flatMap((b) => rings.get(b.id) ?? []));
    for (const id of ring) {
      const atom = doc.atoms.get(id);
      const at = (bond) => {
        const other = doc.atoms.get(otherEnd(bond, id));
        return [other.x - atom.x, other.y - atom.y];
      };
      // one wedge for the ring atom, on a group drawn up or down (one other than H first); with both its groups
      // drawn (OH up, H down: four bonds), only on one whose other three bonds stand round the atom, as the
      // two groups point opposite ways (a wedge and a hashed wedge on both were read as no R/S, or the wrong
      // one when drawn a little askew); none such (C1 and C4 at the ring's sides, its two ring bonds on one
      // side): no wedge, no R/S rather than a wrong one
      const single = byAtom.get(id).filter((b) => !b.kind && b.order === 1);
      const isH = (b) => Number(doc.atoms.get(otherEnd(b, id)).el === 'H');
      const upright = byAtom.get(id).filter((b) => !ring.has(otherEnd(b, id)) && free(b) && Math.abs(at(b)[0]) <= 0.5 * Math.abs(at(b)[1]))
        .sort((p, q) => isH(p) - isH(q));
      const bond = upright.find((b) => single.length !== 4 || standsRound(single.filter((x) => x !== b).map(at)));
      if (bond) result.set(bond.id, { stereo: at(bond)[1] < 0 ? 'wedge' : 'hash', from: id });
    }
  }
  for (const atom of centres) {
    for (const bond of byAtom.get(atom.id)) {
      const other = doc.atoms.get(otherEnd(bond, atom.id));
      if (free(bond) && Math.abs(other.x - atom.x) > Math.abs(other.y - atom.y)) result.set(bond.id, { stereo: 'wedge', from: atom.id });
    }
  }
  return result;
}

// A copy with the projections' stereo written as wedges (for programs that
// read only wedges), or the drawing itself if it has none.
export function withProjectionStereo(doc) {
  const wedges = projectionStereo(doc);
  if (!wedges.size && ![...doc.bonds.values()].some((b) => b.stereo === 'perspective')) return doc;
  const copy = structuredClone(doc);
  for (const bond of copy.bonds.values()) if (bond.stereo === 'perspective') bond.stereo = '';
  for (const [id, { stereo, from }] of wedges) {
    const bond = copy.bonds.get(id);
    if (bond.a !== from) [bond.a, bond.b] = [bond.b, bond.a];
    bond.stereo = stereo;
  }
  return copy;
}

// --- templates ---

const ELEMENT = { OH: 'O', H: 'H', NH2: 'N', SH: 'S', F: 'F', Cl: 'Cl', Br: 'Br', CH3: 'C' };

// An atom for a substituent written as text: an element (OH, H, NH2) or an
// abbreviation (CH2OH, CO2H); `left`: written backwards (HO, HOH2C).
function substituent(doc, x, y, text, left = false) {
  const side = left ? { hSide: 'left' } : {};
  if (ELEMENT[text]) return addAtom(doc, x, y, ELEMENT[text], text === 'CH3' ? { endLabel: true, ...side } : side);
  return addAtom(doc, x, y, '*', { alias: text, ...side });
}

const RINGS = {
  // O at the back right, C1 right, C2 and C3 in front, C4 left, C5 back left
  pyranose: { atoms: [['O', 1.25, -0.45], ['C', 1.95, 0.05], ['C', 1.3, 0.6], ['C', 0.1, 0.6], ['C', -0.55, 0.05], ['C', 0.2, -0.45]] },
  // O at the back, C1 right, C2 and C3 in front, C4 left
  furanose: { atoms: [['O', 0.7, -0.5], ['C', 1.55, -0.05], ['C', 1.2, 0.6], ['C', 0.2, 0.6], ['C', -0.15, -0.05]] },
};

// A Haworth projection: `ring` 'pyranose' or 'furanose'; `up` and `down`
// per carbon C1, C2... the substituent drawn above or below it (or null).
export function haworthDoc({ ring = 'pyranose', up = [], down = [] }) {
  const doc = emptyDoc();
  const s = 1.45;
  const ids = RINGS[ring].atoms.map(([el, x, y]) => addAtom(doc, s * x, s * y, el).id);
  const n = ids.length;
  // ring bonds: O–C1, C1→C2 (side), C2–C3 (front, bold), C3←C4 (side), on round to O
  for (let k = 0; k < n; k++) {
    const [a, b] = [ids[k], ids[(k + 1) % n]];
    if (k === 1) addBond(doc, a, b, 1, { stereo: 'perspective' });
    else if (k === 3) addBond(doc, b, a, 1, { stereo: 'perspective' });
    else addBond(doc, a, b);
  }
  const middle = RINGS[ring].atoms.reduce((sum, [, , y]) => sum + (s * y) / n, 0);
  const centre = RINGS[ring].atoms.reduce((sum, [, x]) => sum + (s * x) / n, 0);
  for (let c = 0; c < n - 1; c++) {
    const atom = doc.atoms.get(ids[c + 1]);
    // shorter where it points into the ring (up from the front, down from the back)
    // (C1 and C4 at the sides point neither way)
    const depth = atom.y - middle;
    const inward = (dy) => Math.abs(depth) > 0.2 && Math.sign(dy) !== Math.sign(depth);
    for (const [text, dy] of [[up[c], -0.85], [down[c], 0.85]]) {
      if (!text) continue;
      // on the left, written backwards (HO), unless inside the ring
      addBond(doc, atom.id, substituent(doc, atom.x, atom.y + (inward(dy) ? 0.65 * dy : dy), text, atom.x < centre - 0.3 && !inward(dy)).id);
    }
  }
  return doc;
}

// A Fischer projection: `top` and `bottom` the chain ends (CHO, CO2H,
// CH2OH), `rows` from the top [left, right] for each carbon in between
// ('=O' on one side: a C=O, no stereocentre).
export function fischerDoc({ top, rows, bottom }) {
  const doc = emptyDoc();
  let above = substituent(doc, 0, 0, top);
  rows.forEach(([left, right], k) => {
    const y = k + 1;
    const centre = addAtom(doc, 0, y, 'C');
    addBond(doc, above.id, centre.id);
    let sides = 0;
    for (const [text, x] of [[left, -1], [right, 1]]) {
      if (!text) continue;
      if (text === '=O') {
        addBond(doc, centre.id, addAtom(doc, x, y, 'O').id, 2);
        continue;
      }
      addBond(doc, centre.id, substituent(doc, x, y, text).id);
      sides += 1;
    }
    if (sides === 2) centre.projection = 'fischer';
    above = centre;
  });
  addBond(doc, above.id, substituent(doc, 0, rows.length + 1, bottom).id);
  return doc;
}

export const PROJECTIONS = [
  ['β-D-Glucose, Haworth', () => haworthDoc({ up: ['OH', null, 'OH', null, 'CH2OH'], down: [null, 'OH', null, 'OH'] })],
  ['α-D-Glucose, Haworth', () => haworthDoc({ up: [null, null, 'OH', null, 'CH2OH'], down: ['OH', 'OH', null, 'OH'] })],
  ['β-D-Galactose, Haworth', () => haworthDoc({ up: ['OH', null, 'OH', 'OH', 'CH2OH'], down: [null, 'OH'] })],
  ['β-D-Ribose, Haworth', () => haworthDoc({ ring: 'furanose', up: ['OH', null, null, 'CH2OH'], down: [null, 'OH', 'OH'] })],
  ['β-D-2-Deoxyribose, Haworth', () => haworthDoc({ ring: 'furanose', up: ['OH', null, null, 'CH2OH'], down: [null, null, 'OH'] })],
  ['D-Glyceraldehyde, Fischer', () => fischerDoc({ top: 'CHO', rows: [['H', 'OH']], bottom: 'CH2OH' })],
  ['L-Glyceraldehyde, Fischer', () => fischerDoc({ top: 'CHO', rows: [['OH', 'H']], bottom: 'CH2OH' })],
  ['D-Glucose, Fischer', () => fischerDoc({ top: 'CHO', rows: [['H', 'OH'], ['OH', 'H'], ['H', 'OH'], ['H', 'OH']], bottom: 'CH2OH' })],
  ['D-Fructose, Fischer', () => fischerDoc({ top: 'CH2OH', rows: [[null, '=O'], ['OH', 'H'], ['H', 'OH'], ['H', 'OH']], bottom: 'CH2OH' })],
  ['L-Alanine, Fischer', () => fischerDoc({ top: 'CO2H', rows: [['NH2', 'H']], bottom: 'CH3' })],
  ['L-Serine, Fischer', () => fischerDoc({ top: 'CO2H', rows: [['NH2', 'H']], bottom: 'CH2OH' })],
];
