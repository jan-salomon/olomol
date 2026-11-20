// Templates of coordination geometries: a generic central atom M with
// generic ligands L, drawn as textbooks do (wedges towards the viewer,
// hashed wedges away), for replacing M and L by real atoms or groups.
import { addAtom, addBond, emptyDoc } from '../model/doc.js';

const DEGREE = Math.PI / 180;
const REACH = 1.3; // M–L bonds a little longer than others: room for the labels

// A complex with ligands in these directions: [[angle (degrees, y down:
// 90 is straight down), stereo ('' | 'wedge' | 'hash')], ...].
function complexDoc(ligands) {
  const doc = emptyDoc();
  const m = addAtom(doc, 0, 0, '*', { alias: 'M' });
  for (const [angle, stereo] of ligands) {
    const l = addAtom(doc, REACH * Math.cos(angle * DEGREE), REACH * Math.sin(angle * DEGREE), '*', { alias: 'L' });
    addBond(doc, m.id, l.id, 1, { stereo });
  }
  return doc;
}

export const COMPLEXES = [
  ['Linear', () => complexDoc([[180, ''], [0, '']])],
  ['Trigonal planar', () => complexDoc([[-90, ''], [30, ''], [150, '']])],
  // two bonds in the page (up, lower right), the other two to the lower left
  ['Tetrahedral', () => complexDoc([[-90, ''], [20, ''], [102, 'wedge'], [152, 'hash']])],
  ['Square planar', () => complexDoc([[0, ''], [90, ''], [180, ''], [270, '']])],
  // the axis upright; of the equator one bond in the page, one towards the viewer, one away
  ['Trigonal bipyramidal', () => complexDoc([[-90, ''], [90, ''], [0, ''], [160, 'wedge'], [200, 'hash']])],
  ['Square pyramidal', () => complexDoc([[-90, ''], [25, 'wedge'], [155, 'wedge'], [195, 'hash'], [-15, 'hash']])],
  ['Octahedral', () => complexDoc([[-90, ''], [90, ''], [25, 'wedge'], [155, 'wedge'], [205, 'hash'], [-25, 'hash']])],
];
