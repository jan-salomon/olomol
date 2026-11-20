// A 3D model shown as it is, as a ball-and-stick model: every atom (hydrogens
// too) at its place in the model, every bond its true length, nothing moved
// or lengthened to be read (as the drawing of Turn in 3D does). Painted back
// to front: each bond in short pieces in its atoms' colours, from the surface
// of one ball to the surface of the other (a stick never crosses the face of
// its own ball; it passes behind one ball and in front of another as it
// should); a double bond two thinner sticks, a triple three, in the plane of
// their neighbours (across the screen where that plane is seen edge on); a
// coordination bond thinner, a partial one dashed; each atom a small shaded
// ball, the back of the molecule paler. A label's atoms (the phenyls of
// Ph3P=O) in a vivid colour of their own, one per label name, with a legend:
// its carbons, hydrogens and bonds, while its O, N and the like keep their elements' colours;
// or the label shown as one ball with its name (`collapsed`). The drawing's
// own colours win: an atom or a bond coloured there is that colour here, and
// a highlight is a halo round the ball or a band along the stick. For looking
// only (it can't go onto the canvas), or saved as a picture (stickPicture). The hydrogens the model
// added can be drawn small (smallHydrogens).
import { elementColor } from '../chem/elements.js';
import { LAYER_OPACITY, layerDepths } from './style.js';

const BALL = 0.24; // an atom's radius, in bond lengths (a hydrogen's smaller, a label's larger)
const HYDROGEN = 0.16;
const LABEL = 0.42;
const STICK = 0.15; // a bond's width
const PIECES = 8; // each bond painted in this many pieces
const FADE = 0.55; // how much paler the very back is
const VIVID = ['#e8590c', '#7048e8', '#0ca678', '#d6336c', '#1c7ed6', '#f59f00', '#ae3ec9', '#2b8a3e'];

const f = (v) => (Math.round(v * 100) / 100).toString();
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const times = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a) => Math.sqrt(dot(a, a));
const unitOf = (a) => times(a, 1 / (norm(a) || 1));

// a colour (#rrggbb) mixed towards another by t
function mix(hex, toward, t) {
  const c = (h) => [1, 3, 5].map((k) => Number.parseInt(h.slice(k, k + 2), 16));
  const [a, b] = [c(hex), c(toward)];
  return `#${a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// An element's colour in the model: as the canvas colours it, carbon grey and hydrogen white
function colourOf(el, dark) {
  if (el === 'H') return dark ? '#d6d9de' : '#f2f3f5';
  if (el === 'C' || el === '*') return dark ? '#9aa0a8' : '#4a4f57';
  return elementColor(el) ?? (dark ? '#b0b6be' : '#46505a');
}

// The labels' colours: one vivid colour per label name (every Ph the same), in the order they come.
// { byAtom: Map(atom -> colour), legend: [{ name, colour }] }
export function labelColours(groups = []) {
  const byName = new Map();
  const byAtom = new Map();
  for (const { name, atoms } of groups) {
    if (!byName.has(name)) byName.set(name, VIVID[byName.size % VIVID.length]);
    for (const i of atoms) byAtom.set(i, byName.get(name));
  }
  return { byAtom, legend: [...byName].map(([name, colour]) => ({ name, colour })) };
}

// `model`: { elements, points (turned: x right, y up, z towards the viewer), bonds: [[a, b, order, kind]], groups,
// marks: the drawing's colours and highlights, { atomColour, atomHighlight: Map(atom -> colour), bondColour,
// bondHighlight: Map("a-b", the smaller index first -> colour) } }; `scale`: pixels per unit of the points;
// `collapsed`: each label one ball with its name, its group hidden. Returns SVG markup centred on the origin.
// `smallHydrogens`: the hydrogens the model added (not the drawing's own atoms, the model's first `drawn`: an H drawn
// as an atom stays as it is) drawn small and near their atom, so that the skeleton shows and they still do: a small
// ball (`radius`, in bond lengths) on a short thinner stick, `reach` out from its atom along the bond.
const SMALL_H = { reach: 0.42, radius: 0.072, stick: 0.58 };

export function stickMarkup({ elements, points: given, bonds, groups = [], marks = {}, drawn = Infinity }, scale, { dark = false, collapsed = false, smallHydrogens = false } = {}) {
  const background = dark ? '#1f2125' : '#ffffff';
  const outline = dark ? '#0c0d0f' : '#2b2e33';
  const { byAtom } = labelColours(groups);
  const label = new Map(collapsed ? groups.map(({ name, atoms }) => [atoms[0], name]) : []); // the label's own atom: its name
  const hidden = new Set(collapsed ? groups.flatMap(({ atoms }) => atoms.slice(1)) : []);
  // an atom coloured in the drawing in its colour; a label shown as one ball in its label's colour; a label's carbons
  // in its label's (its hydrogens paler); the rest, a label's oxygens and nitrogens too, as their elements (a
  // benzoate's O shows: not every reader knows OBz)
  const inGroup = (i) => byAtom.has(i) && (elements[i] === 'C' || elements[i] === 'H');
  const own = (i) => marks.atomColour?.get(i)
    ?? (label.has(i) ? byAtom.get(i) : inGroup(i) ? (elements[i] === 'H' ? mix(byAtom.get(i), '#ffffff', 0.6) : byAtom.get(i)) : colourOf(elements[i], dark));
  // a bond within a label's group in the group's colour, all along it (C=O too: one group, not two halves)
  const groupBond = (a, b) => (byAtom.has(a) && byAtom.has(b) && byAtom.get(a) === byAtom.get(b) ? byAtom.get(a) : null);
  const key = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  // the model's bond length (the median, hydrogens left out), so that balls and sticks fit any units
  const lengths = bonds.filter(([a, b]) => elements[a] !== 'H' && elements[b] !== 'H')
    .map(([a, b]) => norm(sub(given[a], given[b]))).sort((p, q) => p - q);
  const unit = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1;
  // (the added hydrogens, smaller and nearer: each on the line from its atom, `reach` bond lengths out)
  const small = smallHydrogens ? SMALL_H : null;
  const shrunk = new Set();
  let points = given;
  if (small) {
    points = given.map((p) => p);
    for (const [a, b] of bonds) {
      for (const [h, heavy] of [[a, b], [b, a]]) {
        if (h < drawn || elements[h] !== 'H' || elements[heavy] === 'H') continue;
        const direction = unitOf(sub(given[h], given[heavy]));
        points[h] = add(given[heavy], times(direction, small.reach * unit));
        shrunk.add(h);
      }
    }
  }
  const radius = (i) => (shrunk.has(i) ? small.radius : label.has(i) ? LABEL : elements[i] === 'H' ? HYDROGEN : BALL) * unit;
  const shown = points.map((_, i) => !hidden.has(i));
  const zs = points.filter((_, i) => shown[i]).map((p) => p[2]);
  const [near, far] = [Math.max(...zs), Math.min(...zs)];
  const back = (z) => (near - far > 1e-6 ? (FADE * (near - z)) / (near - far) : 0);
  const at = (p) => [p[0] * scale, -p[1] * scale];
  const neighbours = points.map(() => []);
  for (const [a, b] of bonds) {
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  const items = [];
  // the drawing's highlights: halos round balls and bands along bonds, in among the balls and sticks at their
  // atoms' depth, just behind their own ball, a little see-through (in layers, see style.js: what passes behind
  // one as the model turns is covered a layer at a time, not all at once)
  const highlight = (z, markup) => {
    for (const depth of layerDepths(z, 0.5 * unit)) items.push({ z: depth, markup: `<g opacity="${LAYER_OPACITY}">${markup}</g>` });
  };
  // one stick, from 3D point s to e (a bond's, offset for a double or triple one), its pieces coloured by
  // the atom they are nearer to (`a` before the bond's middle, `b` after), every other piece left out if dashed
  const stick = (s, e, a, b, width, dashed, coloured = null) => {
    const [ss, se] = [at(s), at(e)];
    const along = Math.hypot(se[0] - ss[0], se[1] - ss[1]);
    if (along < 0.5) return; // (seen end on: the balls cover it)
    const overlap = dashed ? 0 : 0.6 / along; // (each piece a hair longer, so that no seam shows)
    // which way is up-left across it, for the light streak
    let [nx, ny] = [-(se[1] - ss[1]) / along, (se[0] - ss[0]) / along];
    if (nx + ny > 0) [nx, ny] = [-nx, -ny];
    const [ox, oy] = [nx * width * 0.2, ny * width * 0.2];
    const [ta, tb] = [norm(sub(s, points[a])), norm(sub(points[b], points[a]))]; // (where s is along the bond)
    const reach = norm(sub(e, s));
    for (let k = 0; k < PIECES; k++) {
      if (dashed && k % 2) continue;
      const [t0, t1] = [k / PIECES, Math.min(1, (k + 1) / PIECES + overlap)];
      const z = s[2] + (e[2] - s[2]) * ((t0 + t1) / 2);
      const nearer = ta + reach * ((t0 + t1) / 2) < tb / 2 ? a : b;
      const colour = mix(coloured ?? own(nearer), background, back(z));
      const p = [ss[0] + (se[0] - ss[0]) * t0, ss[1] + (se[1] - ss[1]) * t0];
      const q = [ss[0] + (se[0] - ss[0]) * t1, ss[1] + (se[1] - ss[1]) * t1];
      // (solid colours throughout: a see-through one would show darker where two pieces overlap)
      items.push({ z, markup: `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="${mix(colour, '#000000', 0.12)}" stroke-width="${f(width)}"/>`
        + `<line x1="${f(p[0] + ox)}" y1="${f(p[1] + oy)}" x2="${f(q[0] + ox)}" y2="${f(q[1] + oy)}" stroke="${mix(colour, '#ffffff', 0.3)}" stroke-width="${f(width * 0.28)}"/>` });
    }
  };
  for (const [a, b, order = 1, kind = null] of bonds) {
    if (hidden.has(a) || hidden.has(b)) continue;
    const drawnColour = marks.bondColour?.get(key(a, b)) ?? groupBond(a, b);
    if (marks.bondHighlight?.has(key(a, b))) {
      // in pieces, each at its own depth (a bond pointing at the viewer is in front at one end and
      // behind at the other), end to end, the ends rounded
      const [p, q] = [at(points[a]), at(points[b])];
      const [za, zb] = [points[a][2], points[b][2]];
      const [colour, width] = [marks.bondHighlight.get(key(a, b)), 0.55 * unit * scale];
      for (let k = 0; k < PIECES; k++) {
        const [t0, t1] = [k / PIECES, (k + 1) / PIECES];
        const [u, v] = [[p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0], [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1]];
        highlight(za + (zb - za) * ((t0 + t1) / 2), `<line x1="${f(u[0])}" y1="${f(u[1])}" x2="${f(v[0])}" y2="${f(v[1])}" stroke="${colour}" stroke-width="${f(width)}"/>`);
      }
      for (const [end, z] of [[p, za], [q, zb]]) highlight(z, `<circle cx="${f(end[0])}" cy="${f(end[1])}" r="${f(width / 2)}" fill="${colour}"/>`);
    }
    const [pa, pb] = [points[a], points[b]];
    const direction = unitOf(sub(pb, pa));
    // from one ball's surface to the other's (a little inside them, so that no gap shows at their edges)
    const s = add(pa, times(direction, radius(a) * 0.85));
    const e = sub(pb, times(direction, radius(b) * 0.85));
    if (dot(sub(e, s), direction) <= 0) continue;
    const lines = kind ? 1 : Math.max(1, Math.min(3, Math.round(order)));
    const toSmall = shrunk.has(a) || shrunk.has(b);
    if (lines === 1) {
      stick(s, e, a, b, (kind === 'dative' ? 0.6 : 1) * (toSmall ? small.stick : 1) * STICK * unit * scale, kind === 'partial', drawnColour);
      continue;
    }
    // the sticks of a double or triple bond side by side: in the plane of a neighbour, unless that plane is seen
    // edge on (then across the bond on the screen, so that they don't lie on each other)
    const other = neighbours[a].find((j) => j !== b && !hidden.has(j)) ?? neighbours[b].find((j) => j !== a && !hidden.has(j));
    let across = other === undefined ? null : sub(sub(points[other], pa), times(direction, dot(sub(points[other], pa), direction)));
    const screen = unitOf([-direction[1], direction[0], 0]);
    if (!across || norm(across) < 1e-6 || Math.abs(dot(unitOf(across), screen)) < 0.5) across = screen;
    across = unitOf(sub(across, times(direction, dot(across, direction))));
    const [gap, width] = lines === 2 ? [0.17, 0.085] : [0.2, 0.065];
    const offsets = lines === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    for (const o of offsets) stick(add(s, times(across, o * unit)), add(e, times(across, o * unit)), a, b, width * unit * scale, false, drawnColour);
  }
  const gradients = new Map();
  points.forEach((p, i) => {
    if (hidden.has(i)) return;
    const [x, y] = at(p);
    const r = radius(i) * scale;
    const colour = mix(own(i), background, back(p[2]));
    const id = `ball${colour.slice(1)}`;
    if (!gradients.has(id)) {
      gradients.set(id, `<radialGradient id="${id}" cx="0.35" cy="0.32" r="0.75"><stop offset="0" stop-color="${mix(colour, '#ffffff', 0.55)}"/><stop offset="0.55" stop-color="${colour}"/><stop offset="1" stop-color="${mix(colour, '#000000', 0.35)}"/></radialGradient>`);
    }
    if (marks.atomHighlight?.has(i)) highlight(p[2], `<circle cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(2 * r, 0.42 * unit * scale))}" fill="${marks.atomHighlight.get(i)}"/>`);
    let markup = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#${id})" stroke="${mix(outline, background, back(p[2]))}" stroke-width="0.8"/>`;
    if (label.has(i)) {
      // its name on it, as large as fits
      const text = label.get(i);
      const size = Math.min(r * 0.95, (2.6 * r) / Math.max(2, text.length));
      markup += `<text x="${f(x)}" y="${f(y + size * 0.36)}" font-size="${f(size)}" font-weight="700" text-anchor="middle" fill="#ffffff" stroke="${mix(colour, '#000000', 0.45)}" stroke-width="${f(size * 0.12)}" paint-order="stroke">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
    }
    items.push({ z: p[2], markup });
  });
  items.sort((p, q) => p.z - q.z);
  return `<defs>${[...gradients.values()].join('')}</defs>${items.map((item) => item.markup).join('')}`;
}

// The stick model as a picture file: an SVG of its own, as large as it needs (its balls, halos and a margin),
// in the light colours, on a transparent background.
export function stickPicture(model, scale, { collapsed = false, smallHydrogens = false } = {}) {
  const markup = stickMarkup(model, scale, { collapsed, smallHydrogens });
  const hidden = new Set(collapsed ? (model.groups ?? []).flatMap(({ atoms }) => atoms.slice(1)) : []);
  const shown = model.points.filter((_, i) => !hidden.has(i));
  const xs = shown.map((p) => p[0] * scale);
  const ys = shown.map((p) => -p[1] * scale);
  const lengths = model.bonds.map(([a, b]) => norm(sub(model.points[a], model.points[b]))).sort((p, q) => p - q);
  const margin = (lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1) * scale * 0.6 + 4;
  const [x0, y0] = [Math.min(...xs) - margin, Math.min(...ys) - margin];
  const [w, h] = [Math.max(...xs) - x0 + margin, Math.max(...ys) - y0 + margin];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="${f(x0)} ${f(y0)} ${f(w)} ${f(h)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">${markup}</svg>`;
}

