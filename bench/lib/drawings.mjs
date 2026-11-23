// Drawings made with olomol's own template functions (chairDoc, newmanDoc,
// cyclohexaneNewmanDoc), shared by B2 and B5, with which atom is which.
import { src } from './olomol.mjs';

const { chairDoc, chairCorners } = await src('chem/chair.js');

export const SUBS = { Me: 'C', OH: 'O', Cl: 'Cl', tBu: 'tBu', CO2H: 'CO2H' };
export const PATTERNS = { '1,1': [0, 0], '1,2': [0, 1], '1,3': [0, 2], '1,4': [0, 3], '1,2,3': [0, 1, 2], '1,2,4': [0, 1, 3], '1,3,5': [0, 2, 4] };

// abbreviations as olomol has them: an atom '*' with the label
const LABELS = new Set(['tBu', 'CO2H', 'CH2OH']);
export function labelAtoms(doc) {
  for (const a of doc.atoms.values()) {
    if (LABELS.has(a.el)) {
      a.alias = a.el;
      a.el = '*';
    }
  }
  return doc;
}

export const mirrored = (doc) => {
  for (const a of doc.atoms.values()) a.x = -a.x;
  return doc;
};

// A chair drawing of a specification: positions (ring positions 0–5 of chairDoc: 0 the raised left tip),
// subs (SUBS keys, or element lists), faces (+1 up, −1 down), chair 'A' | 'B', mirror. A group is axial where
// its face is the way its corner's axial bond goes. Returns { doc, ringIds, slots (per group), firsts (per
// group: the id of its atom on the ring) }.
export function chairDrawing({ positions, subs, faces, chair, mirror, ring = Array(6).fill('C'), scale }) {
  const { up } = chairCorners(chair === 'B');
  const axial = [];
  const equatorial = [];
  const slots = positions.map((p, i) => (faces[i] === up[p] ? 'axial' : 'equatorial'));
  positions.forEach((p, i) => {
    const slot = slots[i] === 'axial' ? axial : equatorial;
    if (slot[p]) throw new Error('two groups in one slot');
    slot[p] = Array.isArray(subs[i]) ? subs[i] : SUBS[subs[i]] ?? subs[i];
  });
  const doc = labelAtoms(chairDoc({ ring, axial, equatorial, flip: chair === 'B', ...(scale ? { scale } : {}) }));
  if (mirror) mirrored(doc);
  const ids = [...doc.atoms.keys()];
  const ringIds = ids.slice(0, 6);
  // chairDoc adds, corner by corner, the axial group's atoms and then the equatorial group's
  const first = new Map();
  let next = 6;
  for (let k = 0; k < 6; k++) {
    for (const [slot, list] of [['axial', axial], ['equatorial', equatorial]]) {
      if (!list[k]) continue;
      first.set(`${k}:${slot}`, ids[next]);
      next += [].concat(list[k]).length;
    }
  }
  const firsts = positions.map((p, i) => first.get(`${p}:${slots[i]}`));
  return { doc, ringIds, slots, firsts };
}
