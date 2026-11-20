// The scene as SVG: the same markup for the canvas and for exported files,
// so what you see is what you get. All vector: text stays text, editable
// in Inkscape.
import { elementColor } from '../chem/elements.js';
import { arrowMarkup, electronSVG } from './mechanism.js';
import { lobePath } from './orbitals.js';
import { FONTS, STYLE } from './style.js';
import { SIGN_SIZE } from './scene.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A colour for a dark background: the same hue, light where it was dark
// (black ink becomes nearly white, dark red a lighter red).
export function forDarkBackground(color) {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  if ([r, g, b].some(Number.isNaN)) return color;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const light = 0.93 - 0.5 * l; // black -> 0.93, mid tones -> about 0.68
  const c = (1 - Math.abs(2 * light - 1)) * Math.min(1, s * 1.1);
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(((h % 6) + 6) % 6)];
  const m = light - c / 2;
  return `#${[r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

// the canvas in dark mode (app.css --canvas): an orbital's white lobe there
const CANVAS_DARK = '#13151b';

// A highlight colour on a dark background: blended into it, so light
// bonds and labels stay readable on top.
function dimmed(color) {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const dark = [0x13, 0x15, 0x1b];
  return `#${[0, 2, 4].map((i, k) => Math.round(parseInt(full.slice(i, i + 2), 16) * 0.42 + dark[k] * 0.58).toString(16).padStart(2, '0')).join('')}`;
}

// Markup of the drawing (no <svg> element around it), `k` pixels per bond
// length: on screen the current zoom, so text is laid out at its real size
// (browsers draw tiny text that is then magnified blurred). `dark`: colours
// for a dark background (the screen only; files keep the real ones).
// A colour (#rrggbb) mixed with white: t = 0 the colour, 1 white.
export function paler(hex, t) {
  const c = [1, 3, 5].map((k) => Number.parseInt(hex.slice(k, k + 2), 16));
  return `#${c.map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function sceneMarkup(scene, k = 1, options = {}) {
  if (options.grouping) return `<g font-family="${STYLE.fontFamily}">${groupedMarkup(sceneLayers(scene, k, { ...options, pieces: true }), options.grouping)}</g>`;
  return `<g font-family="${STYLE.fontFamily}">${sceneLayers(scene, k, options).map(([, markup]) => markup).join('')}</g>`;
}

// A picture's markup with the drawing's groups (Ctrl+G) as SVG groups, nested as they are (<g id="group-12">), so
// that a program editing the picture (Inkscape, Illustrator) has them: each molecule, arrow, "+", text, bracket
// and curved arrow in the group it is in (`grouping.owner(id)`: its innermost group, an atom's for a molecule;
// `grouping.parent(group)`), a group where its first part was; highlights and filled rings below all, as ever.
function groupedMarkup({ under, parts }, { owner, parent, name = () => null }) {
  const groups = new Map(); // group → { parts: [markup], inner: [group] }
  const order = []; // markup, or a group (where it first comes)
  const slot = (group) => {
    if (groups.has(group)) return groups.get(group);
    const entry = { parts: [], inner: [] };
    groups.set(group, entry);
    const up = parent(group);
    if (up === undefined) order.push({ group });
    else slot(up).inner.push(group);
    return entry;
  };
  for (const [id, markup] of parts) {
    if (!markup) continue;
    const group = Number.isFinite(id) ? owner(id) : undefined;
    if (group === undefined) order.push(markup);
    else slot(group).parts.push(markup);
  }
  // (a named group: its name as Inkscape's label, its layer name there, and as a title for other programs)
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const write = (group) => {
    const called = name(group);
    const label = called ? ` inkscape:label="${escape(called)}"` : '';
    return `<g id="group-${group}"${label}>${called ? `<title>${escape(called)}</title>` : ''}${groups.get(group).parts.join('')}${groups.get(group).inner.map(write).join('')}</g>`;
  };
  return under + order.map((entry) => (typeof entry === 'string' ? entry : write(entry.group))).join('');
}

// The same markup in layers, bottom first: [[key, markup]]. Highlights
// below, then each molecule (its bonds, then its labels and electrons),
// then arrows, "+", text and brackets, and curved arrows on top. The
// canvas puts each layer in a group of its own, so a redraw replaces only
// the layers that changed (a drag: the molecule that moves).
export function sceneLayers(scene, k = 1, { dark = false, skip = null, pieces = false } = {}) {
  const f = (v) => +(v * k).toFixed(2);
  const paint = dark ? forDarkBackground : (c) => c;
  const pts = (list) => list.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');
  // paths from the scene (wavy bonds, curved arrows) hold only coordinates
  const path = (d) => d.replace(/-?\d*\.?\d+(?:e-?\d+)?/g, (number) => f(Number(number)));
  const under = [];
  // (`skip`: molecules not written, their layers' keys kept: the canvas slides them as they were)
  const molecules = scene.frags.map((members) => ({ orbitals: [], deep: [], bonds: [], rings: [], atoms: [], skip: Boolean(skip?.has(`m${members[0]}`)) }));
  const molecule = (atomId) => molecules[scene.fragOf.get(atomId)];
  const over = [];
  const curves = [];
  // highlights behind everything, one group per colour: same-coloured
  // shapes melt into one region (RDKit-style marking); the larger regions
  // first, so a smaller mark (a difference in orange) lies on top of a
  // larger one (a common part in blue), bonds and atoms alike, whatever
  // order they were marked or are stored in. A molecule turned in 3D (Turn in 3D: its atoms and bonds with a
  // depth, towards the viewer) has its marks by depth instead, a nearer one over a further one
  const marks = new Map();
  const deep = [];
  const mark = (color, element, depth) => {
    if (depth !== undefined) return void deep.push({ color, element, depth });
    if (!marks.has(color)) marks.set(color, []);
    marks.get(color).push(element);
  };
  for (const { bond } of scene.bonds.values()) {
    if (!bond.highlight) continue;
    const [p, q] = [scene.pos(bond.a), scene.pos(bond.b)];
    mark(bond.highlight, `<line x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}"/>`, bond.depth);
  }
  for (const { atom, pos, label } of scene.atoms.values()) {
    if (!atom.highlight) continue;
    // labels get a rounded box around them, plain corners a disc
    const boxes = label?.boxes ?? [];
    if (boxes.length > 1 || boxes.some((b) => b.x2 - b.x1 > 0.5)) {
      const r = STYLE.highlightRadius;
      const [x1, y1, x2, y2] = [Math.min(...boxes.map((b) => b.x1)), Math.min(...boxes.map((b) => b.y1)), Math.max(...boxes.map((b) => b.x2)), Math.max(...boxes.map((b) => b.y2))];
      mark(atom.highlight, `<rect x="${f(pos[0] + x1 - 0.14)}" y="${f(pos[1] + Math.min(y1 - 0.14, -r))}" width="${f(x2 - x1 + 0.28)}" height="${f(Math.max(y2 - y1 + 0.28, 2 * r))}" rx="${f(r)}" stroke="none"/>`, atom.depth);
    } else {
      mark(atom.highlight, `<circle cx="${f(pos[0])}" cy="${f(pos[1])}" r="${f(STYLE.highlightRadius)}" stroke="none"/>`, atom.depth);
    }
  }
  // filled rings under everything
  for (const { fill, polygon } of scene.fills) {
    under.push(`<polygon data-id="${fill.id}" points="${pts(polygon)}" fill="${dark ? dimmed(fill.color) : fill.color}" stroke="none"/>`);
  }
  for (const [color, elements] of [...marks].sort((a, b) => b[1].length - a[1].length)) {
    const shade = dark ? dimmed(color) : color;
    under.push(`<g fill="${shade}" stroke="${shade}" stroke-width="${f(STYLE.highlightWidth)}" stroke-linecap="round">${elements.join('')}</g>`);
  }
  for (const { color, element } of deep.sort((p, q) => p.depth - q.depth)) {
    const shade = dark ? dimmed(color) : color;
    under.push(`<g fill="${shade}" stroke="${shade}" stroke-width="${f(STYLE.highlightWidth)}" stroke-linecap="round">${element}</g>`);
  }
  // orbitals: behind their molecule's bonds and labels, filled (a white lobe hides what lies behind it)
  for (const { orbital, lobes, shade, other, ink } of scene.orbitals?.values() ?? []) {
    if (molecule(orbital.atom).skip) continue;
    // (the other phase white, unless painted a colour of its own)
    const blank = other ? (dark ? dimmed(other) : other) : dark ? CANVAS_DARK : '#ffffff';
    const lobe = (l) => `<path d="${lobePath(l, f)}" fill="${l.shaded ? (dark ? dimmed(shade) : shade) : blank}"/>`;
    const group = (list) => `<g data-id="${orbital.id}" stroke="${paint(ink)}" stroke-width="${f(STYLE.line)}" stroke-linejoin="round">${list.map(lobe).join('')}</g>`;
    // (in a drawing from a 3D view each lobe goes in by its depth, among the bonds: skeleton below;
    // else all behind the bonds)
    if (lobes.some((l) => l.z !== undefined)) {
      for (const l of lobes) molecule(orbital.atom).deep.push({ z: l.z ?? 0, markup: group([l]) });
    } else molecule(orbital.atom).orbitals.push(group(lobes));
  }
  // bonds
  for (const { bond, shapes, color } of scene.bonds.values()) {
    if (bond.kind === 'link' || molecule(bond.a).skip) continue; // (a link: not drawn, the canvas shows it on request)
    const parts = [];
    for (const [x1, y1, x2, y2] of shapes.lines) parts.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
    for (const [x1, y1, x2, y2] of shapes.dashed ?? []) {
      parts.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke-dasharray="${f(0.08)} ${f(0.07)}"/>`);
    }
    for (const [x1, y1, x2, y2] of shapes.dotted ?? []) {
      parts.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke-width="${f(STYLE.line * 1.4)}" stroke-dasharray="0 ${f(0.11)}"/>`);
    }
    for (const d of shapes.paths) parts.push(`<path d="${path(d)}" fill="none"/>`);
    for (const polygon of shapes.polygons) parts.push(`<polygon points="${pts(polygon)}" fill="${paint(color)}" stroke-linejoin="round"/>`);
    const markup = `<g data-id="${bond.id}" stroke="${paint(color)}" stroke-width="${f(STYLE.line)}" stroke-linecap="round">${parts.join('')}</g>`;
    molecule(bond.a).bonds.push(markup);
    molecule(bond.a).deep.push({ z: typeof bond.z === 'number' ? bond.z : 0, markup, bond: true });
  }
  // aromatic circles, and charges spread over a ring in its middle
  // (a closed curve through the middles between its control points, solid or dashed as the bonds' dashes)
  for (const { corners, color, dashed, atom } of scene.circles ?? []) {
    const middle = (k) => corners[k].map((v, i) => (v + corners[(k + 1) % corners.length][i]) / 2);
    const d = `M${f(middle(corners.length - 1)[0])},${f(middle(corners.length - 1)[1])}`
      + corners.map((c, k) => `Q${f(c[0])},${f(c[1])} ${f(middle(k)[0])},${f(middle(k)[1])}`).join('') + 'Z';
    molecule(atom).rings.push(`<path d="${d}" fill="none" stroke="${paint(color)}" stroke-width="${f(STYLE.line)}"${dashed ? ` stroke-dasharray="${f(0.08)} ${f(0.07)}"` : ''}/>`);
  }
  for (const { at, text, charge, circled, color, atom } of scene.ringCharges ?? []) {
    const size = STYLE.font * 0.8;
    if (circled) {
      // ⊕ and ⊖ drawn, as an atom's charge is (a 2 before it for 2+)
      const [r, w] = [size * 0.3, STYLE.line * 0.75];
      const a = r * 0.55;
      const [x, y] = at;
      const digits = Math.abs(charge) > 1 ? `<text x="${f(x - r - 0.03)}" y="${f(y + size * 0.36)}" font-size="${f(size)}" text-anchor="end" fill="${paint(color)}">${Math.abs(charge)}</text>` : '';
      const bar = `M${f(x - a)} ${f(y)}H${f(x + a)}${charge > 0 ? `M${f(x)} ${f(y - a)}V${f(y + a)}` : ''}`;
      molecule(atom).rings.push(`${digits}<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${paint(color)}" stroke-width="${f(w)}"/><path d="${bar}" stroke="${paint(color)}" stroke-width="${f(w)}"/>`);
      continue;
    }
    molecule(atom).rings.push(`<text x="${f(at[0])}" y="${f(at[1] + size * 0.36)}" font-size="${f(size)}" text-anchor="middle" fill="${paint(color)}">${esc(text)}</text>`);
  }
  // + or − in front of a molecule or a text on an arrow (added, taken away): the text's in its group
  // (a text's in the drawing's font, whatever font the text is in)
  const signMarkup = ({ at, text, color, scale = 1 }, font = '') => {
    const size = STYLE.textFont * SIGN_SIZE * scale;
    return `<text x="${f(at[0])}" y="${f(at[1] + size * 0.36)}" font-size="${f(size)}" text-anchor="middle" fill="${paint(color)}"${font}>${esc(text)}</text>`;
  };
  const textSigns = new Map();
  for (const sign of scene.arrowSigns ?? []) {
    if (sign.textId != null) textSigns.set(sign.textId, signMarkup(sign, ` font-family="${STYLE.fontFamily.replace(/"/g, "'")}"`));
    else molecule(sign.atom).rings.push(signMarkup(sign));
  }
  // ⊕ and ⊖ drawn, not typed: the same in every program and font
  const circledSign = (x, y, r, sign, color) => {
    const a = r * 0.55;
    const bar = `M${f(x - a)} ${f(y)}H${f(x + a)}${sign > 0 ? `M${f(x)} ${f(y - a)}V${f(y + a)}` : ''}`;
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${paint(color)}" stroke-width="${f(STYLE.line * 0.75)}"/>`
      + `<path d="${bar}" stroke="${paint(color)}" stroke-width="${f(STYLE.line * 0.75)}"/>`;
  };
  // atom labels and electrons
  for (const { atom, pos, label, color, electrons, straight, mark, number } of scene.atoms.values()) {
    if (molecule(atom.id).skip) continue;
    const parts = [];
    if (mark?.text) parts.push(`<text x="${f(mark.x)}" y="${f(mark.y)}" font-size="${f(mark.size)}">${esc(mark.text)}</text>`);
    if (mark?.circle) parts.push(circledSign(mark.circle.cx, mark.circle.cy, mark.circle.r, mark.circle.sign, color));
    if (number) parts.push(`<text x="${f(number.x)}" y="${f(number.y)}" font-size="${f(number.size)}" text-anchor="middle" fill="${paint(STYLE.numberColor)}">${esc(number.text)}</text>`);
    if (straight) parts.push(`<circle cx="${f(pos[0])}" cy="${f(pos[1])}" r="${f(STYLE.straightDot)}"/>`);
    if (label) {
      for (const run of label.runs) {
        // (in a label of groups, the letters that are atoms in their element's colour: the P of PPh3)
        // (atom.fade: Turn in 3D's paler towards the back, those letters too)
        const element = run.el && (!atom.color || atom.fade !== undefined) && scene.settings.colorMode === 'element' ? elementColor(run.el) : null;
        const own = element && atom.fade ? paler(element, atom.fade) : element;
        parts.push(`<text x="${f(pos[0] + run.x)}" y="${f(pos[1] + run.y)}" font-size="${f(run.size)}"${run.bold ? ' font-weight="bold"' : ''}${own ? ` fill="${paint(own)}"` : ''}>${esc(run.text)}</text>`);
      }
      for (const { cx, cy, r, sign } of label.circles ?? []) parts.push(circledSign(pos[0] + cx, pos[1] + cy, r, sign, color));
    }
    const pairColor = atom.color ?? scene.settings.ink;
    for (const pair of electrons.pairs) parts.push(electronSVG(pair.point, pair.angle, 2, scene.settings.pairStyle, paint(pairColor), k));
    for (const e of electrons.unpaired) parts.push(electronSVG(e.point, e.angle, e.count, 'unpaired', paint(pairColor), k));
    if (parts.length) molecule(atom.id).atoms.push(`<g data-id="${atom.id}" fill="${paint(color)}">${parts.join('')}</g>`);
  }
  // reaction arrows, "+", text
  for (const { arrow, lines, polygons, open, arcs = [], color } of scene.arrows.values()) {
    const parts = lines.map(([x1, y1, x2, y2]) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
    for (const polygon of polygons) parts.push(`<polygon points="${pts(polygon)}" fill="${paint(color)}" stroke="none"/>`);
    if (open) parts.push(`<polyline points="${pts(open)}" fill="none"/>`);
    // its side arcs (NAD⁺ → NADH)
    for (const arc of arcs) {
      // (a group of its own: an example points at it alone)
      const head = arc.head ? `<polygon points="${pts(arc.head)}" fill="${paint(color)}" stroke="none"/>` : '';
      parts.push(`<g data-arc="${arc.id}"><path d="${path(arc.d)}" fill="none"/>${head}</g>`);
    }
    over.push(`<g data-id="${arrow.id}" stroke="${paint(color)}" stroke-width="${f(STYLE.line)}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g>`);
  }
  for (const { plus, color } of scene.pluses.values()) {
    const s = STYLE.plusSize;
    over.push(`<path data-id="${plus.id}" d="M${f(plus.x - s)} ${f(plus.y)}H${f(plus.x + s)}M${f(plus.x)} ${f(plus.y - s)}V${f(plus.y + s)}" stroke="${paint(color)}" stroke-width="${f(STYLE.line * 1.2)}" stroke-linecap="round"/>`);
  }
  for (const { text, lines, color } of scene.texts.values()) {
    const runs = lines.flatMap((line) => line.runs).filter((run) => run.text.trim() || run.text.length);
    const parts = runs.map((run) => `<text x="${f(run.x)}" y="${f(run.y)}" font-size="${f(run.size)}"${run.bold ? ' font-weight="bold"' : ''}${run.italic ? ' font-style="italic"' : ''} xml:space="preserve">${esc(run.text)}</text>`);
    over.push(`<g data-id="${text.id}" fill="${paint(color)}"${text.family && FONTS[text.family] ? ` font-family="${FONTS[text.family].replace(/"/g, "'")}"` : ''}>${parts.join('')}${textSigns.get(text.id) ?? ''}</g>`);
  }
  for (const { bracket, paths, runs, color } of scene.brackets.values()) {
    const parts = paths.map((d) => `<path d="${path(d)}" fill="none"/>`);
    for (const run of runs) parts.push(`<text x="${f(run.x)}" y="${f(run.y)}" font-size="${f(run.size)}"${run.italic ? ' font-style="italic"' : ''} fill="${paint(color)}" stroke="none">${esc(run.text)}</text>`);
    over.push(`<g data-id="${bracket.id}" stroke="${paint(color)}" stroke-width="${f(STYLE.line)}" stroke-linecap="square" stroke-linejoin="miter">${parts.join('')}</g>`);
  }
  // R/S and E/Z
  for (const mark of scene.stereo) {
    over.push(`<text x="${f(mark.x)}" y="${f(mark.y + STYLE.stereoFont * 0.36)}" font-size="${f(STYLE.stereoFont)}" font-style="italic" text-anchor="middle" fill="${paint(STYLE.stereoColor)}">${mark.text}</text>`);
  }
  // dashed lines between orbitals of different molecules (their interaction)
  for (const { overlap, line: [p, q], color } of scene.overlaps?.values() ?? []) {
    over.push(`<line data-id="${overlap.id}" x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}" stroke="${paint(color)}" stroke-width="${f(STYLE.line * 0.8)}" stroke-dasharray="${f(0.1)} ${f(0.08)}" stroke-linecap="round"/>`);
  }
  // curved arrows on top
  for (const geometry of scene.curves.values()) {
    curves.push(`<g data-id="${geometry.curve.id}">${arrowMarkup(geometry, paint(geometry.color), path, (v) => v * k)}</g>`);
  }
  // (`pieces`: each molecule, arrow, text… on its own, for a file with its groups: groupedMarkup)
  if (pieces) {
    const own = (markup) => [Number(/data-id="(\d+)"/.exec(markup)?.[1]), markup];
    return {
      under: under.join(''),
      parts: [...molecules.map((m, i) => [scene.frags[i][0], skeleton(m) + m.rings.join('') + m.atoms.join('')]), ...over.map(own), ...curves.map(own)],
    };
  }
  return [
    ['under', under.join('')],
    ...molecules.map((m, i) => [`m${scene.frags[i][0]}`, m.skip ? null : skeleton(m) + m.rings.join('') + m.atoms.join('')]),
    ['over', over.join('')],
    ['curves', curves.join('')],
  ].filter(([, markup]) => markup !== '');
}

// A molecule's orbitals and bonds: in a drawing from a 3D view with orbitals (lobes with a depth), painted
// from the back to the front, lobes and bonds alike; else the orbitals behind all the bonds.
function skeleton(m) {
  if (!m.deep.some((item) => !item.bond)) return m.orbitals.join('') + m.bonds.join('');
  return m.orbitals.join('') + [...m.deep].sort((p, q) => p.z - q.z).map((item) => item.markup).join('');
}

// The bounding box of everything drawn: { x1, y1, x2, y2 }, or null.
export function sceneBounds(scene) {
  const xs = [];
  const ys = [];
  const point = (x, y) => {
    xs.push(x);
    ys.push(y);
  };
  for (const { pos, label, electrons, atom, mark, number } of scene.atoms.values()) {
    point(...pos);
    for (const { box } of [mark, number].filter(Boolean)) {
      point(box.x1, box.y1);
      point(box.x2, box.y2);
    }
    if (atom.highlight) {
      point(pos[0] - STYLE.highlightRadius, pos[1] - STYLE.highlightRadius);
      point(pos[0] + STYLE.highlightRadius, pos[1] + STYLE.highlightRadius);
    }
    for (const b of label?.boxes ?? []) {
      point(pos[0] + b.x1, pos[1] + b.y1);
      point(pos[0] + b.x2, pos[1] + b.y2);
    }
    for (const e of [...electrons.pairs, ...electrons.unpaired]) {
      point(e.point[0] - 0.15, e.point[1] - 0.15);
      point(e.point[0] + 0.15, e.point[1] + 0.15);
    }
  }
  for (const { arrow, arcs = [] } of scene.arrows.values()) {
    point(arrow.x1, arrow.y1 - 0.15);
    point(arrow.x2, arrow.y2 + 0.15);
    for (const arc of arcs) for (const p of [...arc.samples, ...(arc.head ?? [])]) point(...p);
  }
  for (const { plus } of scene.pluses.values()) {
    point(plus.x - STYLE.plusSize, plus.y - STYLE.plusSize);
    point(plus.x + STYLE.plusSize, plus.y + STYLE.plusSize);
  }
  for (const { box } of [...scene.texts.values(), ...scene.brackets.values()]) {
    point(box.x1, box.y1);
    point(box.x2, box.y2);
  }
  for (const { samples, head } of scene.curves.values()) for (const p of [...samples, ...head]) point(...p);
  for (const { lobes } of scene.orbitals?.values() ?? []) for (const lobe of lobes) for (const p of lobe.polygon) point(...p);
  for (const mark of scene.stereo) {
    point(mark.x - 0.3, mark.y - 0.2);
    point(mark.x + 0.3, mark.y + 0.2);
  }
  if (!xs.length) return null;
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

// A standalone SVG file of the scene: `scale` pixels per bond length (the
// file's units are pixels, so Inkscape shows sensible font sizes),
// `margin` in bond lengths, optional background colour.
export function sceneToSVG(scene, { scale = 40, margin = 0.4, background = null, grouping = null } = {}) {
  const b = sceneBounds(scene) ?? { x1: 0, y1: 0, x2: 1, y2: 1 };
  const px = (v) => +(v * scale).toFixed(2);
  const [x, y] = [px(b.x1 - margin), px(b.y1 - margin)];
  const [w, h] = [px(b.x2 - b.x1 + 2 * margin), px(b.y2 - b.y1 + 2 * margin)];
  const bg = background ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${background}"/>` : '';
  const inkscape = grouping ? ' xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"' : ''; // (named groups' labels)
  return `<svg xmlns="http://www.w3.org/2000/svg"${inkscape} viewBox="${x} ${y} ${w} ${h}" width="${Math.ceil(w)}" height="${Math.ceil(h)}">`
    + `${bg}${sceneMarkup(scene, scale, { grouping })}</svg>`;
}
