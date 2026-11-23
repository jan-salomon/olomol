// 3D models on the canvas: a molecule's ball-and-stick model (render/sticks.js) as a picture in the drawing, beside
// the molecule it shows. What is kept (doc.models): the model as it was built (its atoms' 3D points, a bond 1 long,
// round their middle), how it is turned, where it stands and how large, how it is shown, and a fingerprint of the
// molecule as it was (its atoms, charges and bonds). The molecule's colours and highlights are read from the drawing
// each time; a change to the molecule itself (an atom, a bond, a wedge) makes the picture out of date: it stays as it
// was, marked, until Update builds the model again (the 3D builder takes a moment: not at every keystroke).
import { stickMarkup, VDW } from './sticks.js';
import { conformationOf } from '../chem/conformation.js';

// how a model is shown, unless it says otherwise: see stickMarkup
export const MODEL_LOOK = { style: 'balls', hydrogens: 'all', groups: 'out', fade: true };
export const STYLES = ['balls', 'sticks', 'spacefill'];
export const HYDROGENS = ['all', 'small', 'none'];

const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const turn = (r, v) => r.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const round = (v) => Math.round(v * 1000) / 1000;

// The model kept for the canvas, from the stick model Turn in 3D shows (`sticks`: { elements, bonds, groups, drawn,
// base: its 3D points as the view starts }): its points round their middle, a bond (the median, hydrogens left out)
// 1 long, rounded to a thousandth (a file's size).
export function keptModel(sticks) {
  const { elements, bonds, groups = [], drawn, base } = sticks;
  const middle = [0, 1, 2].map((k) => base.reduce((s, p) => s + p[k], 0) / base.length);
  const lengths = bonds.filter(([a, b]) => elements[a] !== 'H' && elements[b] !== 'H')
    .map(([a, b]) => Math.hypot(...base[a].map((v, k) => v - base[b][k]))).sort((p, q) => p - q);
  const unit = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1;
  return {
    elements: [...elements],
    points: base.map((p) => p.map((v, k) => round((v - middle[k]) / unit))),
    bonds: bonds.map(([a, b, order = 1, kind = null]) => [a, b, order, kind]),
    groups: groups.map(({ name, atoms }) => ({ name, atoms: [...atoms] })),
    drawn: Math.min(drawn ?? elements.length, elements.length),
  };
}

// The molecule as the model was built from it, as a string that changes when the molecule does: the atoms with their
// element, label, charge, isotope, unpaired electrons and hydrogens set by hand, and the handedness of each one
// wedged at; the bonds between them with their order, kind, whether wedged (its narrow end first) and, a double one,
// cis or trans; and the conformation drawn (a chair, a Newman projection: what the 3D model is built in; a ring flip
// changes it), each torsion it shows as its four atoms' elements and gauche+, gauche− or anti, sorted (no ids: a
// copy's is the same). What a drawing means, not how it is drawn: the same molecule moved, turned or flipped (its
// wedges swapped) gives the same string; another configuration (a wedge made a hash, a double bond drawn the other
// way round) another one. `atomIds`: the model's own atoms (the drawing's, in its order); the molecule is all that is
// bonded to them. Where the atoms have gone, null.
export function moleculeSignature(doc, atomIds) {
  const start = atomIds.filter((id) => doc.atoms.has(id));
  if (!start.length) return null;
  const byAtom = new Map();
  for (const bond of doc.bonds.values()) {
    if (bond.kind === 'link') continue;
    for (const id of [bond.a, bond.b]) byAtom.set(id, [...(byAtom.get(id) ?? []), bond]);
  }
  const seen = new Set(start);
  const queue = [...start];
  while (queue.length) {
    const id = queue.pop();
    for (const bond of byAtom.get(id) ?? []) {
      const other = bond.a === id ? bond.b : bond.a;
      if (!seen.has(other) && doc.atoms.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  const ids = [...seen].sort((p, q) => p - q);
  // (an atom's neighbours in the model's order of its atoms, which a copy and a file keep: not by their ids, which
  // they renumber; atoms bonded on since after them)
  const rank = new Map(atomIds.map((id, k) => [id, k]));
  const order = (p, q) => (rank.get(p) ?? 1e9 + p) - (rank.get(q) ?? 1e9 + q);
  const around = (id) => (byAtom.get(id) ?? []).map((b) => [b.a === id ? b.b : b.a, b]).filter(([n]) => doc.atoms.has(n)).sort(([p], [q]) => order(p, q));
  const wedged = (b) => b.stereo === 'wedge' || b.stereo === 'hash';
  // An atom's handedness as drawn, where wedges start at it: for each wedge (in that order), its bonds as arrows in
  // space with only that one out of the page (a wedge up, a hash down; as RDKit reads a wedge), the sign of the first
  // triple product with it that isn't flat. (All lifted at once, a plain bond, a wedge and a hash at 120° were flat:
  // their mirror image the same.) A flip (the page mirrored, the wedges swapped) and a turn keep each; a wedge made a
  // hash turns its own round.
  const handedness = (id) => {
    const bonds = around(id);
    if (bonds.length < 3) return '';
    const c = doc.atoms.get(id);
    const signs = bonds.map(([, b], lifted) => {
      if (b.a !== id || !wedged(b)) return null;
      const arrows = bonds.map(([n], k) => {
        const a = doc.atoms.get(n);
        return [a.x - c.x, a.y - c.y, k === lifted ? (b.stereo === 'wedge' ? 1 : -1) : 0];
      });
      const u = arrows[lifted];
      const rest = arrows.filter((_, k) => k !== lifted);
      for (let j = 0; j < rest.length; j++) {
        for (let k = j + 1; k < rest.length; k++) {
          const [v, w] = [rest[j], rest[k]];
          const triple = u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
          if (Math.abs(triple) > 1e-6) return triple > 0 ? '+' : '-';
        }
      }
      return '';
    });
    return signs.filter((sign) => sign !== null).join('');
  };
  // A double bond's first neighbours (in that order) on the same side of it, or not: cis or trans, as drawn
  const cisTrans = (b) => {
    if (b.order !== 2) return '';
    const [A, B] = [doc.atoms.get(b.a), doc.atoms.get(b.b)];
    const [na] = around(b.a).filter(([n]) => n !== b.b);
    const [nb] = around(b.b).filter(([n]) => n !== b.a);
    if (!na || !nb) return '';
    const side = (from, to) => (B.x - A.x) * (to.y - from.y) - (B.y - A.y) * (to.x - from.x);
    const [s1, s2] = [side(A, doc.atoms.get(na[0])), side(B, doc.atoms.get(nb[0]))];
    if (Math.abs(s1) < 1e-6 || Math.abs(s2) < 1e-6) return '';
    return s1 * s2 > 0 ? 'cis' : 'trans';
  };
  const atoms = ids.map((id) => {
    const a = doc.atoms.get(id);
    return [id, a.el, a.alias ?? '', a.charge || 0, a.isotope ?? '', a.radical || 0, a.hCount ?? '', handedness(id)].join(':');
  });
  const bonds = [...new Set(ids.flatMap((id) => byAtom.get(id) ?? []))]
    .map((b) => [b.a, b.b, b.order, b.kind ?? '', wedged(b) ? 'w' : b.stereo ?? '', cisTrans(b)].join(':')).sort();
  const shown = conformationOf(doc, ids);
  const name = (k) => doc.atoms.get(ids[k])?.alias ?? doc.atoms.get(ids[k])?.el ?? '?';
  const kind = (deg) => (Math.abs(deg) > 120 ? 'a' : deg >= 0 ? 'g+' : 'g-');
  const torsions = shown ? [...shown.checks, ...shown.sets].map(([i, j, k, l, deg]) => `${[i, j, k, l].map(name).join('')}${kind(deg)}`).sort() : [];
  return `${atoms.join(',')}|${bonds.join(',')}|${torsions.join(',')}`;
}

// Is the model out of date: its molecule changed (or gone) since it was built?
export const outOfDate = (doc, item) => moleculeSignature(doc, item.atoms) !== item.signature;

// The drawing's colours and highlights of the model's own atoms and bonds (as stickMarkup takes them); a model
// pictured without its molecule (svgOf) has them with it.
export function modelMarks(doc, item) {
  if (item.marks) return item.marks;
  const marks = { atomColour: new Map(), atomHighlight: new Map(), bondColour: new Map(), bondHighlight: new Map() };
  const index = new Map(item.atoms.map((id, k) => [id, k]));
  item.atoms.forEach((id, k) => {
    const atom = doc.atoms.get(id);
    if (atom?.color) marks.atomColour.set(k, atom.color);
    if (atom?.highlight) marks.atomHighlight.set(k, atom.highlight);
  });
  for (const bond of doc.bonds.values()) {
    if (!index.has(bond.a) || !index.has(bond.b)) continue;
    const [a, b] = [index.get(bond.a), index.get(bond.b)];
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (bond.color) marks.bondColour.set(key, bond.color);
    if (bond.highlight) marks.bondHighlight.set(key, bond.highlight);
  }
  return marks;
}

// The model's points as it is turned and sized: x right, y up, z towards the viewer, in bond lengths of the drawing.
export const turnedPoints = (item) => item.model.points.map((p) => turn(item.rotation ?? IDENTITY, p).map((v) => v * (item.size ?? 1)));

const look = (item) => ({ ...MODEL_LOOK, ...(item.look ?? {}) });
const stickOptions = (item, dark) => {
  const { style, hydrogens, groups, fade } = look(item);
  return { dark, style, hydrogens, collapsed: groups === 'balls', fade };
};

// The box round the model on the page (drawing units, y down): its atoms shown, each with its ball (as stickMarkup
// draws it: a space-filling atom its van der Waals radius), and a little room.
export function modelBox(item) {
  const { style, hydrogens, groups } = look(item);
  const { elements, drawn } = item.model;
  const balls = groups === 'balls' ? new Set(item.model.groups.map(({ atoms }) => atoms[0])) : new Set();
  const hidden = new Set(groups === 'balls' ? item.model.groups.flatMap(({ atoms }) => atoms.slice(1)) : []);
  if (hydrogens === 'none') elements.forEach((el, i) => i >= drawn && el === 'H' && hidden.add(i));
  const size = item.size ?? 1;
  const radius = (i) => size * (0.12 + (balls.has(i) ? 0.42 : style === 'spacefill' ? (VDW[elements[i]] ?? 1.8) / 1.5 : elements[i] === 'H' ? 0.16 : 0.24));
  const shown = turnedPoints(item).map((p, i) => [p, radius(i)]).filter((_, i) => !hidden.has(i));
  if (!shown.length) return { x1: item.x - size, y1: item.y - size, x2: item.x + size, y2: item.y + size };
  return {
    x1: Math.min(...shown.map(([p, r]) => item.x + p[0] - r)), y1: Math.min(...shown.map(([p, r]) => item.y - p[1] - r)),
    x2: Math.max(...shown.map(([p, r]) => item.x + p[0] + r)), y2: Math.max(...shown.map(([p, r]) => item.y - p[1] + r)),
  };
}

// The model's SVG markup at `k` units per bond length, in place (stickMarkup's, moved to the model's middle), with the
// drawing's colours (`doc`). Worked out once for the same model, look, colours and size.
const cache = new Map();
export function modelMarkup(doc, item, k, { dark = false } = {}) {
  const marks = modelMarks(doc, item);
  const key = JSON.stringify([item.model, item.rotation, item.size, item.look, k, dark, [...marks.atomColour], [...marks.atomHighlight], [...marks.bondColour], [...marks.bondHighlight]]);
  let inner = cache.get(key);
  if (inner === undefined) {
    inner = stickMarkup({ ...item.model, points: turnedPoints(item), marks }, k, stickOptions(item, dark));
    if (cache.size > 200) cache.clear();
    cache.set(key, inner);
  }
  return `<g transform="translate(${Math.round(item.x * k * 100) / 100} ${Math.round(item.y * k * 100) / 100})">${inner}</g>`;
}
