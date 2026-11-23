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
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// a short name for a text (djb2): ids of masks by what they hold
const hash = (text) => {
  let h = 5381;
  for (let k = 0; k < text.length; k++) h = ((h * 33) ^ text.charCodeAt(k)) >>> 0;
  return h.toString(36);
};

// The part of a ball's front (the hemisphere towards the viewer) that lies inside a sphere, as seen: SVG path data
// in screen units (`scale` per unit of their points, y up in them, down on the screen), or null where none is.
// F: the ball { c, r }; S: the sphere { c, r }. Its edge is the front part of the circle where the two cut each
// other (an ellipse's arc), closed along the ball's outline inside the sphere (a little outside it: its line too);
// `evenodd` when the region is the ball outside an ellipse (the sphere taking the larger part of it; `inner` that
// ellipse). `beyond`: how far outside the outline it reaches (its line, half outside it: 2 px). Exact, and
// changing smoothly as the two turn: used where one ball is in front of another (space-filling) and where a ball
// is seen through a highlight's sphere. Its curves in short straight runs: `fine`, enough for any zoom; else no longer
// than CHORD on the screen (off the true curve by less than a twentieth of a pixel), quicker.
const CHORD = 4;
const segments = (radius, angle, fine, most) => (fine ? most : Math.min(most, Math.max(6, Math.ceil((radius * angle) / CHORD))));
export function capInside(F, S, scale, beyond = 2 / scale, fine = true) {
  const screen = ([px, py]) => `${f(px * scale)},${f(-py * scale)}`;
  const axis = sub(S.c, F.c);
  const d = norm(axis);
  if (d >= F.r + S.r) return null;
  const onLimb = (angle, out = 0) => [F.c[0] + (F.r + out) * Math.cos(angle), F.c[1] + (F.r + out) * Math.sin(angle), F.c[2]];
  if (d <= S.r - F.r) {
    // the ball all inside the sphere: all of it
    const n = segments(F.r * scale, 2 * Math.PI, fine, 48);
    return { d: `M${Array.from({ length: n }, (_, k) => screen(onLimb((2 * Math.PI * k) / n, beyond))).join('L')}Z`, evenodd: false };
  }
  if (d <= F.r - S.r || d < 1e-9) return null; // (the sphere inside the ball: none of its surface in it)
  const u = times(axis, 1 / d);
  const along = (d * d + F.r * F.r - S.r * S.r) / (2 * d); // from F's middle to the circle's plane
  const rho = Math.sqrt(Math.max(0, F.r * F.r - along * along));
  const middle = add(F.c, times(u, along));
  const v = unitOf(Math.abs(u[2]) < 0.9 ? cross(u, [0, 0, 1]) : cross(u, [1, 0, 0]));
  const w = cross(u, v);
  const N = segments(rho * scale, 2 * Math.PI, fine, 64);
  const circle = Array.from({ length: N }, (_, k) => {
    const [cos, sin] = [rho * Math.cos((2 * Math.PI * k) / N), rho * Math.sin((2 * Math.PI * k) / N)];
    return [middle[0] + v[0] * cos + w[0] * sin, middle[1] + v[1] * cos + w[1] * sin, middle[2] + v[2] * cos + w[2] * sin];
  });
  const front = circle.map((q) => q[2] >= F.c[2]);
  if (!front.some(Boolean)) return null;
  if (front.every(Boolean)) {
    // the whole circle in front: the part inside the sphere is inside the ellipse (or, the sphere taking the larger
    // part of the ball, outside it)
    const ellipse = `M${circle.map(screen).join('L')}Z`;
    if (along >= 0) return { d: ellipse, evenodd: false };
    const [x0, y0, size] = [F.c[0] * scale - F.r * scale - 2, -F.c[1] * scale - F.r * scale - 2, 2 * F.r * scale + 4];
    return { d: `M${f(x0)},${f(y0)}h${f(size)}v${f(size)}h${f(-size)}Z${ellipse}`, evenodd: true, inner: ellipse };
  }
  // the front run of the circle, from where it comes over the outline to where it goes behind it
  const start = front.findIndex((q, k) => q && !front[(k + N - 1) % N]);
  const run = [];
  for (let k = start; front[k % N]; k++) run.push(circle[k % N]);
  // its two ends on the outline (between the last front and first back points), and the outline between them that
  // lies inside the sphere
  const limb = (q, back) => {
    const t = (q[2] - F.c[2]) / (q[2] - back[2] || 1e-9);
    const e = add(q, times(sub(back, q), t));
    return Math.atan2(e[1] - F.c[1], e[0] - F.c[0]);
  };
  const a0 = limb(run[0], circle[(start + N - 1) % N]);
  const a1 = limb(run.at(-1), circle[(start + run.length) % N]);
  let span = ((a0 - a1) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); // from a1 on to a0, anticlockwise
  if (!(norm(sub(onLimb(a1 + span / 2), S.c)) < S.r)) span -= 2 * Math.PI; // (the other way round)
  const steps = Math.max(2, fine ? Math.ceil(Math.abs(span) / (Math.PI / 24)) : segments(F.r * scale, Math.abs(span), false, 48));
  const arc = Array.from({ length: steps + 1 }, (_, k) => onLimb(a1 + (span * k) / steps, beyond));
  return { d: `M${[...run, ...arc].map(screen).join('L')}Z`, evenodd: false };
}

// a colour (#rrggbb) mixed towards another by t
function mix(hex, toward, t) {
  const c = (h) => [1, 3, 5].map((k) => Number.parseInt(h.slice(k, k + 2), 16));
  const [a, b] = [c(hex), c(toward)];
  return `#${a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// The light on the model (view coordinates: x right, y up, z towards the viewer): a lamp up left in front, a softer
// one from the viewer, a little light all round, and the lamp's reflection (a small bright spot: a shiny surface).
// Worked out in linear light (the dark side falls off as a real one does, not muddy), as sRGB colours.
const LAMP = unitOf([-0.45, 0.55, 0.7]);
const HALFWAY = unitOf(add(LAMP, [0, 0, 1])); // where the lamp's reflection is: a surface facing this way
const [ALL_ROUND, BY_LAMP, BY_VIEWER, SHINE, SHININESS] = [0.12, 0.72, 0.28, 0.45, 36];
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
// linear light (0…1) to an sRGB level (0…255, not rounded), from a table (a frame works out thousands)
const SRGB = Float64Array.from({ length: 4097 }, (_, k) => {
  const v = k / 4096;
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
});
const srgb = (v) => {
  const x = Math.min(1, Math.max(0, v)) * 4096;
  const k = Math.floor(x);
  return k >= 4096 ? SRGB[4096] : SRGB[k] + (SRGB[k + 1] - SRGB[k]) * (x - k);
};
const rgbOf = (hex) => [1, 3, 5].map((k) => Number.parseInt(hex.slice(k, k + 2), 16));
const hexOf = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
// A surface of colour `base` (its channels in linear light) facing `n` (a unit vector), as lit, in sRGB levels; seen
// through `haze` of the background (`behind`, sRGB levels: the back of the model paler, as a ball's haze is laid over
// it); then each highlight colour in `over` (sRGB levels) laid over it (as see-through as a highlight is).
function lit(base, n, over = [], haze = 0, behind = null) {
  const light = ALL_ROUND + BY_LAMP * Math.max(0, dot(n, LAMP)) + BY_VIEWER * Math.max(0, n[2]);
  const shine = SHINE * Math.max(0, dot(n, HALFWAY)) ** SHININESS;
  let rgb = base.map((c) => srgb(c * light + shine));
  if (haze) rgb = rgb.map((v, k) => v + (behind[k] - v) * haze);
  for (const hl of over) rgb = rgb.map((v, k) => v + (hl[k] - v) * THROUGH);
  return rgb;
}
// how many colours a gradient is worked out from: on the screen (`fine` false) two to a pixel across `span` (no finer
// than it is seen), else enough for any zoom
const samplesFor = (span, fine, most) => (fine ? most : Math.min(most, Math.max(5, Math.ceil(2 * span) + 1)));
const linearOf = (hex) => rgbOf(hex).map((v) => linear(v / 255));
// A gradient's stops from its colours worked out closely (`samples`: [offset, sRGB levels], in order): as few as keep
// every one of them within a level of the gradient (Douglas–Peucker: the stop where the straight run between two is
// furthest off, until none is more than a level off). Where the shading is smooth a few, round a bright spot more.
const STOP_TOLERANCE = 2; // in sRGB levels (of 255): not to be seen
function fewestStops(samples) {
  const keep = [0, samples.length - 1];
  const split = (i, j) => {
    let [worst, at] = [STOP_TOLERANCE, -1];
    const [[ti, ci], [tj, cj]] = [samples[i], samples[j]];
    for (let k = i + 1; k < j; k++) {
      const [tk, ck] = samples[k];
      const w = (tk - ti) / (tj - ti || 1);
      for (let c = 0; c < 3; c++) {
        const off = Math.abs(ck[c] - (ci[c] + (cj[c] - ci[c]) * w));
        if (off > worst) [worst, at] = [off, k];
      }
    }
    if (at < 0) return;
    keep.push(at);
    split(i, at);
    split(at, j);
  };
  split(0, samples.length - 1);
  return keep.sort((p, q) => p - q).map((k) => `<stop offset="${f(samples[k][0])}" stop-color="${hexOf(samples[k][1])}"/>`).join('');
}
// A ball's shading as a radial gradient round the lamp's reflection (in the ball's box), reaching the ball's edge
// on the far side: the colours as lit along that side (on the near side the same distance out is lit about as much).
// The same for a colour each time: kept.
const SPOT = [HALFWAY[0], -HALFWAY[1]]; // (on the page, in the ball's radii: y down)
const ballGradients = new Map();
function ballGradient(id, colour, count) {
  let markup = ballGradients.get(id);
  if (markup) return markup;
  const off = Math.hypot(...SPOT);
  const away = SPOT.map((v) => -v / off);
  const base = linearOf(colour);
  const samples = Array.from({ length: count }, (_, k) => {
    const t = (k / (count - 1)) ** 1.4; // (closer together at the bright spot)
    const [x, y] = SPOT.map((v, j) => v + t * (1 + off) * away[j]);
    return [t, lit(base, unitOf([x, -y, Math.sqrt(Math.max(0, 1 - x * x - y * y))]))];
  });
  markup = `<radialGradient id="${id}" cx="${f(0.5 + SPOT[0] / 2)}" cy="${f(0.5 + SPOT[1] / 2)}" r="${f((1 + off) / 2)}">${fewestStops(samples)}</radialGradient>`;
  if (ballGradients.size > 2000) ballGradients.clear();
  ballGradients.set(id, markup);
  return markup;
}
// A stick's shading, its axis `axis` (a unit vector): a linear gradient across it on the page (from `from` to `to`,
// one edge to the other) of the colours as lit, a cylinder's surface facing the viewer at its middle and turned
// away at its edges, seen through `haze` of `behind`; each highlight colour in `over` laid over it. From `count`
// colours.
function stickGradient(id, { colour, haze, behind }, over, axis, from, to, count) {
  const side = unitOf([axis[1], -axis[0], 0]);
  const front = unitOf(sub([0, 0, 1], times(axis, axis[2])));
  const [base, tints, back] = [linearOf(colour), over.map(rgbOf), rgbOf(behind)];
  // (`from` is on the page's side of `side`: y down)
  const samples = Array.from({ length: count }, (_, k) => {
    const u = -1 + (2 * k) / (count - 1);
    return [k / (count - 1), lit(base, add(times(side, u), times(front, Math.sqrt(Math.max(0, 1 - u * u)))), tints, haze, back)];
  });
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(from[0])}" y1="${f(from[1])}" x2="${f(to[0])}" y2="${f(to[1])}">${fewestStops(samples)}</linearGradient>`;
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
// (a patterned highlight, 'hatch:#f87171', 'dots:…', 'lines:…' as svg.js draws them on the page: a 3D model's balls in its plain colour)
const plainHighlight = (colour) => /^(hatch|lines|dots):(.+)$/.exec(String(colour ?? ''))?.[2] ?? colour;

// marks: the drawing's colours and highlights, { atomColour, atomHighlight: Map(atom -> colour), bondColour,
// bondHighlight: Map("a-b", the smaller index first -> colour) } }; `scale`: pixels per unit of the points;
// `collapsed`: each label one ball with its name, its group hidden. Returns SVG markup centred on the origin.
// `smallHydrogens`: the hydrogens the model added (not the drawing's own atoms, the model's first `drawn`: an H drawn
// as an atom stays as it is) drawn small and near their atom, so that the skeleton shows and they still do: a small
// ball (`radius`, in bond lengths) on a short thinner stick, `reach` out from its atom along the bond.
const SMALL_H = { reach: 0.42, radius: 0.072, stick: 0.58 };
// `style`: 'balls' (ball and stick), 'sticks' (thick sticks, each atom only the round end of its sticks) or
// 'spacefill' (each atom a ball as large as the atom itself, its van der Waals radius: the bonds hidden inside);
// `hydrogens`: 'all', 'small' (as smallHydrogens) or 'none' (the model's own left out; an H drawn as an atom stays);
// `fade`: the back of the molecule paler (a depth cue), or every atom in its full colour.
// van der Waals radii (Å; Bondi), over a C–C bond's 1.5 Å: an atom's radius in bond lengths, for 'spacefill'
export const VDW = { H: 1.2, C: 1.7, N: 1.55, O: 1.52, F: 1.47, P: 1.8, S: 1.8, Cl: 1.75, Br: 1.85, I: 1.98, B: 1.92, Si: 2.1, Se: 1.9 };
const LICORICE = 0.26; // a stick's width in 'sticks', in bond lengths
const THROUGH = 0.6; // how opaque a highlight is: what lies behind it shows through, tinted

// A joint of the 'sticks' style as it is: a ball and the sticks out of it, all as wide (radius r), their axes through
// its middle. Where their surfaces meet, a point of the surface belongs to the stick it lies furthest along (P·d, the
// way out d), or to the ball where it lies along none (P·d ≤ 0 for all): a stick's surface and the ball's meet on the
// circle across the stick through the middle, two sticks' on the plane halfway between their ways out (equal radii:
// the same distance from both axes there). Drawn as the ball (whole) and over it each stick's own part of the joint,
// in the stick's colours: for each point across it (s, from one edge to the other), the part of its surface facing
// the viewer from where it is the stick's own (a(s): how far along it, the largest of 0 and where each other stick's
// plane is) on out; the stick's line under it the same beyond. Exact (no corner where the ball's outline crossed the
// sticks, no cut end of a stick showing), and plain paths. `x, y`: the middle on the page, `r` in pixels, `sticks`:
// { d: the way out (a unit vector: x right, y up, z towards the viewer), stroke: its paint at this end, half: half
// its length, in pixels }.
function jointParts(x, y, r, sticks, fine = true) {
  const N = 2 * Math.ceil(segments(r, Math.PI, fine, 16) / 2); // (even: one point in the middle)
  return [...sticks].sort((m, n) => m.d[2] - n.d[2]).map(({ d, stroke, half }) => {
    const L = Math.hypot(d[0], d[1]);
    if (L < 0.05) return ''; // (seen end on: the ball covers it)
    const side = [d[1] / L, -d[0] / L, 0];
    const front = unitOf(sub([0, 0, 1], times(d, d[2])));
    // each other stick's plane, halfway between the two: along this one from s·across + h·towards / against
    const others = sticks.filter((o) => o.d !== d).map((o) => [dot(side, o.d), dot(front, o.d), Math.max(1e-9, 1 - dot(d, o.d))]);
    // just past the ball's outline on the page (its line beyond, the same colours; nothing further out painted over),
    // no further than its half
    const end = Math.min(half, (r * (1 + Math.abs(d[2]))) / L + 0.5);
    const point = (sx, a) => {
      const h = Math.sqrt(Math.max(0, r * r - sx * sx));
      // (on its surface, from the middle: a along it, sx across, h towards the viewer)
      return `${f(x + d[0] * a + side[0] * sx + front[0] * h)},${f(y - (d[1] * a + side[1] * sx + front[1] * h))}`;
    };
    const across = Array.from({ length: N + 1 }, (_, k) => {
      const sx = r * (-1 + (2 * k) / N);
      const h = Math.sqrt(Math.max(0, r * r - sx * sx));
      let a = 0;
      for (const [so, fo, denom] of others) a = Math.max(a, (sx * so + h * fo) / denom);
      return point(sx, Math.min(end, a));
    });
    return `<path d="M${[...across, point(r, end), point(-r, end)].join('L')}Z" fill="${stroke}"/>`;
  }).join('');
}

export function stickMarkup({ elements, points: given, bonds, groups = [], marks = {}, drawn = Infinity }, scale, { dark = false, collapsed = false, smallHydrogens = false, style = 'balls', hydrogens = smallHydrogens ? 'small' : 'all', fade = true, fine = true } = {}) {
  const background = dark ? '#1f2125' : '#ffffff';
  const { byAtom } = labelColours(groups);
  const label = new Map(collapsed ? groups.map(({ name, atoms }) => [atoms[0], name]) : []); // the label's own atom: its name
  const hidden = new Set(collapsed ? groups.flatMap(({ atoms }) => atoms.slice(1)) : []);
  // (the model's own hydrogens left out: not one drawn as an atom, the first `drawn`)
  if (hydrogens === 'none') elements.forEach((el, i) => i >= drawn && el === 'H' && hidden.add(i));
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
  const small = hydrogens === 'small' ? SMALL_H : null;
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
  const radius = (i) => (shrunk.has(i) ? small.radius : label.has(i) ? LABEL
    : style === 'spacefill' ? (VDW[elements[i]] ?? 1.8) / 1.5 : style === 'sticks' ? LICORICE / 2 : elements[i] === 'H' ? HYDROGEN : BALL) * unit;
  const shown = points.map((_, i) => !hidden.has(i));
  const zs = points.filter((_, i) => shown[i]).map((p) => p[2]);
  const [near, far] = [Math.max(...zs), Math.min(...zs)];
  // (in 128ths: steps too small to see, and the same colours again as the model turns, their shading kept)
  const back = (z) => (fade && near - far > 1e-6 ? Math.round((128 * FADE * (near - z)) / (near - far)) / 128 : 0);
  const at = (p) => [p[0] * scale, -p[1] * scale];
  const neighbours = points.map(() => []);
  for (const [a, b] of bonds) {
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  const items = [];
  const gradients = new Map(); // (and masks: the <defs>)
  const joints = new Map(); // in 'sticks': each joint's sticks as wide as its ball, { d: their way out of it, stroke, half }
  // The drawing's highlights as things in the model: round a highlighted atom a see-through sphere, along a
  // highlighted bond a tube (a row of spheres along it). What lies behind one's front is seen through it, tinted,
  // what it highlights too (its atom's ball inside its sphere, its bond's stick inside its tube); what lies in front of
  // it isn't.
  // Drawn so: the glow of each colour once, behind the whole model, as one see-through layer (where two overlap,
  // no darker: Ph's six atoms' and bonds' one glow); then each ball tinted where its front is inside a sphere
  // (capInside: as exact as space-filling's overlaps), each stick over the stretches of its axis behind one; a tinted
  // part drawn solid (its own colour, the highlight over it), so that tinted parts overlapping never darken.
  const spheres = []; // { c, r (the model's units), colour }
  const glows = new Map(); // colour -> its shapes (SVG)
  const glow = (colour, markup) => glows.set(colour, `${glows.get(colour) ?? ''}${markup}`);
  points.forEach((p, i) => {
    if (!marks.atomHighlight?.has(i) || hidden.has(i)) return;
    const colour = plainHighlight(marks.atomHighlight.get(i));
    const r = style === 'spacefill' ? radius(i) + 0.25 * unit : Math.max(2 * radius(i), 0.42 * unit);
    spheres.push({ c: p, r, colour });
    const [x, y] = at(p);
    glow(colour, `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * scale)}" fill="${colour}"/>`);
  });
  for (const [a, b] of bonds) {
    if (hidden.has(a) || hidden.has(b) || !marks.bondHighlight?.has(key(a, b))) continue;
    const colour = plainHighlight(marks.bondHighlight.get(key(a, b)));
    const r = 0.275 * unit;
    const [pa, pb] = [points[a], points[b]];
    const steps = Math.max(2, Math.ceil(norm(sub(pb, pa)) / (0.5 * r)));
    for (let k = 0; k <= steps; k++) spheres.push({ c: add(pa, times(sub(pb, pa), k / steps)), r, colour });
    const [p, q] = [at(pa), at(pb)];
    glow(colour, `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="${colour}" stroke-width="${f(2 * r * scale)}" stroke-linecap="round"/>`);
  }
  for (const [colour, markup] of glows) items.push({ z: -Infinity, markup: `<g opacity="${THROUGH}">${markup}</g>` });
  // a stick from 3D point s to e (`a`, `b` its bond's atoms): the stretches of it behind highlights' spheres' fronts,
  // by colour, as [from, to] along it (0 to 1), joined where they overlap
  const stretches = (s, e, a, b) => {
    const byColour = new Map();
    const pointAt = (t) => add(s, times(sub(e, s), t));
    // (a point of its axis behind S's front, within its outline on the screen)
    const behind = (sp, t) => {
      const q = pointAt(t);
      const flat = Math.hypot(q[0] - sp.c[0], q[1] - sp.c[1]);
      return flat < sp.r && q[2] < sp.c[2] + Math.sqrt(sp.r * sp.r - flat * flat);
    };
    const N = 24;
    for (const sp of spheres) {
      const seen = Array.from({ length: N + 1 }, (_, k) => behind(sp, k / N));
      if (!seen.some(Boolean)) continue;
      // each change between samples found exactly (by halves)
      const edge = (k) => {
        let [lo, hi] = [k / N, (k + 1) / N];
        for (let n = 0; n < 12; n++) {
          const mid = (lo + hi) / 2;
          if (behind(sp, mid) === seen[k]) lo = mid;
          else hi = mid;
        }
        return (lo + hi) / 2;
      };
      let from = seen[0] ? 0 : null;
      for (let k = 0; k < N; k++) {
        if (seen[k] === seen[k + 1]) continue;
        const at = edge(k);
        if (seen[k + 1]) from = at;
        else {
          byColour.set(sp.colour, [...(byColour.get(sp.colour) ?? []), [from, at]]);
          from = null;
        }
      }
      if (from !== null) byColour.set(sp.colour, [...(byColour.get(sp.colour) ?? []), [from, 1]]);
    }
    for (const [colour, ranges] of byColour) {
      ranges.sort((p, q) => p[0] - q[0]);
      const joined = [];
      for (const r of ranges) {
        if (joined.length && r[0] <= joined.at(-1)[1]) joined.at(-1)[1] = Math.max(joined.at(-1)[1], r[1]);
        else joined.push([...r]);
      }
      byColour.set(colour, joined);
    }
    return byColour;
  };
  // Where a highlight's sphere S is in front of ball F, as seen: white shapes for a mask (SVG), or ''. Apart in
  // space, the one on the viewer's side covers all their overlap (the same one while they overlap on the screen, as
  // they turn); F inside S: all of F; S inside F: none. Cutting each other: S's middle the nearer, all the overlap
  // but where S's front is inside F (F in front there); else only where F's front is inside S. (At equal depths the
  // two are the same region: no jump as one passes the other.)
  const disc = (c, r, rule = '') => `<circle cx="${f(c[0] * scale)}" cy="${f(-c[1] * scale)}" r="${f(r * scale)}" fill="#fff"${rule}/>`;
  const circlePath = (c, r) => `M${f(c[0] * scale + r * scale)},${f(-c[1] * scale)}a${f(r * scale)},${f(r * scale)} 0 1,0 ${f(-2 * r * scale)},0a${f(r * scale)},${f(r * scale)} 0 1,0 ${f(2 * r * scale)},0Z`;
  const seeThrough = (F, S) => {
    if (Math.hypot(S.c[0] - F.c[0], S.c[1] - F.c[1]) >= F.r + S.r) return ''; // (not over each other on the screen)
    const d = norm(sub(S.c, F.c));
    if (d >= F.r + S.r) return S.c[2] > F.c[2] ? disc(S.c, S.r) : '';
    if (d <= S.r - F.r) return disc(F.c, F.r + 2 / scale);
    if (d <= F.r - S.r) return '';
    if (S.c[2] >= F.c[2]) {
      const mine = capInside(S, F, scale, 0, fine); // (where S's front is inside F: F in front there)
      if (!mine) return disc(S.c, S.r);
      return mine.evenodd ? `<path d="${mine.inner}" fill="#fff"/>` : `<path d="${circlePath(S.c, S.r)}${mine.d}" fill="#fff" fill-rule="evenodd"/>`;
    }
    const cap = capInside(F, S, scale, 2 / scale, fine);
    return cap ? `<path d="${cap.d}" fill="#fff"${cap.evenodd ? ' fill-rule="evenodd"' : ''}/>` : '';
  };
  // one stick, from 3D point s to e (a bond's, offset for a double or triple one), its pieces coloured by
  // the atom they are nearer to (`a` before the bond's middle, `b` after), every other piece left out if dashed
  const stick = (s, e, a, b, width, dashed, coloured = null) => {
    const [ss, se] = [at(s), at(e)];
    const along = Math.hypot(se[0] - ss[0], se[1] - ss[1]);
    if (along < 0.5) return; // (seen end on: the balls cover it)
    // Each piece (and each part of it, see below) reaches a hair back under what was drawn before it along the stick:
    // where two meet, the later one's edge lies over the same colours as its own, and no line shows across. The pieces
    // are drawn by depth: from s on if the stick comes towards the viewer.
    const overlap = dashed ? 0 : 0.6 / along;
    const forwards = e[2] >= s[2];
    // shaded across as a cylinder lit (stickGradient), one gradient for each colour along it (its id from what it
    // holds: the same stick of the same model twice on a page shares it, two models never mix theirs)
    const axis = unitOf(sub(e, s));
    const side = unitOf([axis[1], -axis[0], 0]);
    const [from, to] = [-1, 1].map((k) => [ss[0] + (k * side[0] * width) / 2, ss[1] - (k * side[1] * width) / 2]);
    const where = `${f(from[0])},${f(from[1])},${f(to[0])},${f(to[1])},${f(axis[2])}`;
    const paints = new Map();
    const count = samplesFor(width, fine, 33);
    const paint = (look, over) => {
      const key = `${look.colour}${look.haze}${over.join('')}`;
      let url = paints.get(key);
      if (!url) {
        const id = `st${hash(`${key}${where}${count}`)}`;
        if (!gradients.has(id)) gradients.set(id, stickGradient(id, look, over, axis, from, to, count));
        url = `url(#${id})`;
        paints.set(key, url);
      }
      return url;
    };
    const [ta, tb] = [norm(sub(s, points[a])), norm(sub(points[b], points[a]))]; // (where s is along the bond)
    const reach = norm(sub(e, s));
    // the stretches of it seen through highlights (by colour), for its pieces
    const seen = dashed ? new Map() : stretches(s, e, a, b);
    const point = (t) => [ss[0] + (se[0] - ss[0]) * t, ss[1] + (se[1] - ss[1]) * t];
    // each half of it (a's, b's: where the bond's middle is) in its atom's colour, paled as far as the half's middle is
    // back (one shading for each half, not for each piece: a picture's size), the whole stick as one if both are alike
    const turnsAt = Math.min(1, Math.max(0, (tb / 2 - ta) / reach)); // (where its colour turns: the bond's middle)
    const zAt = (t) => s[2] + (e[2] - s[2]) * t;
    const same = coloured || own(a) === own(b);
    const halfColour = (k) => ({ colour: coloured ?? own(k ? b : a), haze: back(zAt(same ? 0.5 : k ? (1 + turnsAt) / 2 : turnsAt / 2)), behind: background });
    const line = (u, v, stroke) => {
      const [p, q] = (forwards ? [Math.max(0, u - overlap), v] : [u, Math.min(1, v + overlap)]).map(point);
      return `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="${stroke}" stroke-width="${f(width)}"/>`;
    };
    // In pieces so that what lies between its ends in depth is drawn in between: as many as keep each piece within
    // an eighth of a bond in depth (a stick across the page one piece, one going straight back eight); a dashed one
    // in its dashes
    const pieces = dashed ? PIECES : Math.min(PIECES, Math.max(1, Math.ceil(Math.abs(e[2] - s[2]) / (unit / PIECES) - 1e-9)));
    for (let k = 0; k < pieces; k++) {
      if (dashed && k % 2) continue;
      const [t0, t1] = [k / pieces, (k + 1) / pieces];
      const z = s[2] + (e[2] - s[2]) * ((t0 + t1) / 2);
      // (solid colours throughout: a see-through one would show darker where two pieces overlap); the part of it seen
      // through a highlight in its colour, the highlight over it, solid too (tinted parts of sticks and balls meeting at
      // a joint: the same colour, not darker), the piece split where a highlight begins or ends, each part drawn once,
      // in the order the pieces are
      const cuts = [t0, t1];
      if (!same && turnsAt > t0 && turnsAt < t1) cuts.push(turnsAt); // (where its colour changes)
      for (const ranges of seen.values()) for (const [r0, r1] of ranges) for (const t of [r0, r1]) if (t > t0 && t < t1) cuts.push(t);
      cuts.sort((p, q) => (forwards ? p - q : q - p));
      let markup = '';
      for (let c = 0; c + 1 < cuts.length; c++) {
        const [u, v] = [Math.min(cuts[c], cuts[c + 1]), Math.max(cuts[c], cuts[c + 1])];
        if (v - u < 1e-9) continue;
        const middle = (u + v) / 2;
        const colour = halfColour(middle < turnsAt ? 0 : 1);
        const over = [...seen].filter(([, ranges]) => ranges.some(([r0, r1]) => middle > r0 && middle < r1)).map(([hl]) => hl);
        const stroke = paint(colour, over);
        markup += line(u, v, stroke);
        // (in 'sticks', its ends at its atoms' joints, as wide as their balls: see jointParts)
        if (style === 'sticks' && !dashed) {
          const half = (norm(sub(e, s)) * scale) / 2;
          if (u === 0 && Math.abs(width / 2 - radius(a) * scale) < 1e-6) joints.set(a, [...(joints.get(a) ?? []), { d: axis, stroke, half }]);
          if (v === 1 && Math.abs(width / 2 - radius(b) * scale) < 1e-6) joints.set(b, [...(joints.get(b) ?? []), { d: times(axis, -1), stroke, half }]);
        }
      }
      items.push({ z, markup });
    }
  };
  for (const [a, b, order = 1, kind = null] of bonds) {
    if (hidden.has(a) || hidden.has(b) || style === 'spacefill') continue;
    const drawnColour = marks.bondColour?.get(key(a, b)) ?? groupBond(a, b);
    const [pa, pb] = [points[a], points[b]];
    const direction = unitOf(sub(pb, pa));
    // from one ball's surface to the other's (a little inside them, so that no gap shows at their edges); in 'sticks'
    // from middle to middle, as the sticks of a model meet: a stick's cut end then lies within its ball's outline,
    // which covers it (no corner standing out beside the ball)
    const into = style === 'sticks' ? 0 : 0.85;
    const s = add(pa, times(direction, radius(a) * into));
    const e = sub(pb, times(direction, radius(b) * into));
    if (dot(sub(e, s), direction) <= 0) continue;
    const lines = kind ? 1 : Math.max(1, Math.min(3, Math.round(order)));
    const toSmall = shrunk.has(a) || shrunk.has(b);
    if (lines === 1) {
      stick(s, e, a, b, (kind === 'dative' ? 0.6 : 1) * (toSmall ? small.stick : 1) * (style === 'sticks' ? LICORICE : STICK) * unit * scale, kind === 'partial', drawnColour);
      continue;
    }
    // the sticks of a double or triple bond side by side: in the plane of a neighbour, unless that plane is seen
    // edge on (then across the bond on the screen, so that they don't lie on each other)
    const other = neighbours[a].find((j) => j !== b && !hidden.has(j)) ?? neighbours[b].find((j) => j !== a && !hidden.has(j));
    let across = other === undefined ? null : sub(sub(points[other], pa), times(direction, dot(sub(points[other], pa), direction)));
    const screen = unitOf([-direction[1], direction[0], 0]);
    if (!across || norm(across) < 1e-6 || Math.abs(dot(unitOf(across), screen)) < 0.5) across = screen;
    across = unitOf(sub(across, times(direction, dot(across, direction))));
    // (in 'sticks' the lines of a double or triple bond close enough to end within the joint's ball, half a stick wide)
    const [gap, width] = (style === 'sticks' ? (lines === 2 ? [0.14, 0.11] : [0.09, 0.07]) : lines === 2 ? [0.17, 0.085] : [0.2, 0.065]);
    const offsets = lines === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    for (const o of offsets) stick(add(s, times(across, o * unit)), add(e, times(across, o * unit)), a, b, width * unit * scale, false, drawnColour);
  }
  // Space-filling balls overlap deeply. Drawn back to front by their middles' depth alone, a ball whose middle is
  // nearer covers the whole overlap even where the other ball's surface is in front (two equal balls side by side:
  // half the overlap is each's), and the overlap jumps from one to the other as the model turns past them. So each
  // ball is masked where a ball drawn before it is really in front: where its front (the hemisphere towards the
  // viewer) is inside that ball. That region's edge is the front part of the circle where the two spheres cut each
  // other, seen from the front (an ellipse's arc), closed along the ball's outline inside the other ball: exact, and
  // moving smoothly as the model turns. `frontOf(i)`: the mask's black shapes for ball i (SVG), or null.
  const sphere = (i) => ({ c: points[i], r: radius(i) });
  const order = points.map((_, i) => i).filter((i) => shown[i]).sort((p, q) => points[p][2] - points[q][2] || p - q);
  const rank = new Map(order.map((i, k) => [i, k]));
  const frontOf = (i) => {
    if (style !== 'spacefill') return null;
    const shapes = [];
    for (const j of order) {
      if (rank.get(j) >= rank.get(i)) break;
      const cap = capInside(sphere(i), sphere(j), scale, 2 / scale, fine);
      if (cap) shapes.push(`<path d="${cap.d}" fill="#000"${cap.evenodd ? ' fill-rule="evenodd"' : ''}/>`);
    }
    return shapes.length ? shapes.join('') : null;
  };
  points.forEach((p, i) => {
    if (hidden.has(i)) return;
    const [x, y] = at(p);
    const r = radius(i) * scale;
    // shaded in its own colour (one gradient for each colour and size: see samplesFor), the back of the model seen
    // through a haze of the background: a circle of it over the ball, as see-through as it is near (the same as its
    // colours mixed with the background's)
    const haze = back(p[2]);
    const colour = mix(own(i), background, haze); // (as seen: its name's outline)
    const count = samplesFor(r * (1 + Math.hypot(...SPOT)), fine, 49);
    const id = `ball${own(i).slice(1)}${fine ? '' : `n${count}`}`;
    if (!gradients.has(id)) gradients.set(id, ballGradient(id, own(i), count));
    const hazy = (radius) => (haze ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(radius)}" fill="${background}" opacity="${+haze.toFixed(3)}"/>` : '');
    // seen through highlights' spheres (its own too: it is inside it): where a sphere's front is nearer than its own,
    // tinted (seeThrough), each colour's parts together (where tube spheres overlap, no darker)
    const tints = new Map();
    for (const sp of spheres) {
      const shape = seeThrough({ c: p, r: radius(i) }, sp);
      if (shape) tints.set(sp.colour, `${tints.get(sp.colour) ?? ''}${shape}`);
    }
    const tinted = [...tints].map(([colour, shapes]) => {
      const id3 = `ht${hash(`${x},${y},${r},${shapes}`)}`;
      gradients.set(id3, `<mask id="${id3}" maskUnits="userSpaceOnUse" x="${f(x - r - 3)}" y="${f(y - r - 3)}" width="${f(2 * r + 6)}" height="${f(2 * r + 6)}">${shapes}</mask>`);
      // (the ball again over its tinted part, the highlight over it: solid, so that it doesn't darken where a stick's
      // tinted end lies over it)
      return `<g mask="url(#${id3})"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#${id})"/>${hazy(r)}<circle cx="${f(x)}" cy="${f(y)}" r="${f(r + 0.5)}" fill="${colour}" opacity="${THROUGH}"/></g>`;
    }).join('');
    // its name on it, as large as fits
    const name = () => {
      const text = label.get(i);
      const size = Math.min(r * 0.95, (2.6 * r) / Math.max(2, text.length));
      return `<text x="${f(x)}" y="${f(y + size * 0.36)}" font-size="${f(size)}" font-weight="700" text-anchor="middle" fill="#ffffff" stroke="${mix(colour, '#000000', 0.45)}" stroke-width="${f(size * 0.12)}" paint-order="stroke">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
    };
    // (in 'sticks' a ball is the rounded joint of its sticks, as wide as they are, at the depth of
    // its front, so that it caps their ends there, a stick coming towards the viewer not showing its cut end across it)
    const joint = style === 'sticks';
    if (style === 'spacefill') {
      // (masked where a ball drawn before it is in front of it: see frontOf; the mask's id from what it holds, so
      // that the same model twice on a page shares it and two models never mix theirs)
      const hidden = frontOf(i);
      if (hidden) {
        const id2 = `sfm${hash(hidden)}`;
        gradients.set(id2, `<mask id="${id2}" maskUnits="userSpaceOnUse" x="${f(x - r - 2)}" y="${f(y - r - 2)}" width="${f(2 * r + 4)}" height="${f(2 * r + 4)}"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r + 2)}" fill="#fff"/>${hidden}</mask>`);
        items.push({ z: p[2], markup: `<g mask="url(#${id2})"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#${id})"/>${hazy(r)}${tinted}${label.has(i) ? name() : ''}</g>` });
        return;
      }
    }
    const ball = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#${id})"/>${hazy(r)}${tinted}${label.has(i) ? name() : ''}`;
    items.push({ z: p[2] + (joint ? radius(i) : 0), markup: ball + (joint ? jointParts(x, y, r, joints.get(i) ?? [], fine) : '') });
  });
  items.sort((p, q) => p.z - q.z);
  return `<defs>${[...gradients.values()].join('')}</defs>${items.map((item) => item.markup).join('')}`;
}

// The stick model as a picture file: an SVG of its own, as large as it needs (its balls, halos and a margin),
// in the light colours, on a transparent background.
export function stickPicture(model, scale, options = {}) {
  const markup = stickMarkup(model, scale, options);
  const { collapsed = false } = options;
  const hidden = new Set(collapsed ? (model.groups ?? []).flatMap(({ atoms }) => atoms.slice(1)) : []);
  const shown = model.points.filter((_, i) => !hidden.has(i));
  const xs = shown.map((p) => p[0] * scale);
  const ys = shown.map((p) => -p[1] * scale);
  const lengths = model.bonds.map(([a, b]) => norm(sub(model.points[a], model.points[b]))).sort((p, q) => p - q);
  // (round the balls: a space-filling atom reaches over a bond length out)
  const margin = (lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1) * scale * (options.style === 'spacefill' ? 1.4 : 0.6) + 4;
  const [x0, y0] = [Math.min(...xs) - margin, Math.min(...ys) - margin];
  const [w, h] = [Math.max(...xs) - x0 + margin, Math.max(...ys) - y0 + margin];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="${f(x0)} ${f(y0)} ${f(w)} ${f(h)}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"><g fill="#000000" stroke="none">${markup}</g></svg>`;
}

