// .olom: olomol's own file format (spec: docs/olom.md). JSON of the drawing as olomol holds it: every object by
// its id, references by id, coordinates in bond lengths with y up (the drawing has y down: flipped here), angles
// in degrees counter-clockwise, what is left at its default
// not written. Rules that keep files readable for ever:
// - "version" major.minor: a minor version only adds (fields, kinds of objects); a major one would change
//   meanings. An older olomol opens a newer minor version and says that parts may be missing; it refuses a newer
//   major version. Older versions are upgraded step by step on reading (UPGRADES), never dropped.
// - What a reader doesn't know it keeps: an unknown field on an object in its `unknown`, an unknown top-level
//   key in the drawing's `unknown`; both written back as they were. Other programs name what they add with a
//   prefix and a colon ("myapp:grade"); olomol's own keys never have one.
// - Field names are olomol's for good once released: renaming one is a major version.
import { addArrow, addAtom, addBond, addBracket, addCurve, addFill, addOrbital, addOverlap, addPlus, addText, emptyDoc, KINDS } from '../model/doc.js';
import { fragments } from '../model/graph.js';
import { t } from '../i18n/i18n.js';
import { clampPoints, defaultStyleOf, STYLES, styleOf } from '../render/style.js';

export const FORMAT = 'olom';
export const VERSION = '1.0';
const [MAJOR, MINOR] = VERSION.split('.').map(Number);
const STYLE_NAMES = [...Object.keys(STYLES), 'custom'];
const APP = `olomol ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}`;

// upgrades from older versions of the format, each to the next: { '1.0': (file) => file in 1.1 }
const UPGRADES = {};

// the collections, as named in the file
const COLLECTIONS = { atoms: 'atoms', bonds: 'bonds', arrows: 'reactionArrows', pluses: 'plusSigns', texts: 'texts', curves: 'electronArrows', fills: 'ringFills', brackets: 'brackets', orbitals: 'orbitals', overlaps: 'orbitalOverlaps' };
const TOP = new Set(['format', 'version', 'app', 'title', 'style', 'together', 'groups', ...Object.values(COLLECTIONS)]);

const BOND_KINDS = { partial: 'partial', hbond: 'hydrogenBond', dative: 'dative', link: 'link' };
const BOND_KIND_CODES = Object.fromEntries(Object.entries(BOND_KINDS).map(([kind, name]) => [name, kind]));
// reaction arrows' kinds as the interface names them (the drawing's own names on the left)
const ARROW_KINDS = { failed: 'crossed', same: 'equals' };
const ARROW_KIND_CODES = Object.fromEntries(Object.entries(ARROW_KINDS).map(([kind, name]) => [name, kind]));
// a double bond's second line: the drawing's left and right (y down) are the file's right and left (y up), so that
// "left" in the file is on the left seen from a to b, as on graph paper
const SIDE_SWAP = { left: 'right', right: 'left' };
const swapSide = (side) => SIDE_SWAP[side] ?? side;
// the sign in front of a reagent: "-" in the file (as typed), "−" (U+2212) in the drawing; either read
const signOut = (sign) => (sign === '−' ? '-' : sign);
const signIn = (sign) => (sign === '-' ? '−' : sign);

// (a number as written; what a file gave as something else, "2" or nothing, written as a number all the same)
const r4 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? +n.toFixed(4) : 0;
};
const deg = (radians) => +((radians * 180) / Math.PI).toFixed(3);
const rad = (degrees) => (degrees * Math.PI) / 180;
// (the file's y is up, the drawing's down; so are angles turned: counter-clockwise in the file)
const point = (x, y) => [r4(x), r4(-y)];
const up = (y) => r4(-y);
const given = (v) => v !== undefined && v !== null;

// Whether this text is an .olom file
export function isOlom(text) {
  if (typeof text !== 'string' || !/^\s*\{/.test(text) || !text.includes('"olom"')) return false;
  try {
    return JSON.parse(text)?.format === FORMAT;
  } catch {
    return false;
  }
}

// The values a key may have, as the file has them (`path`: a key, or a key inside one, onArrow.slot). A value
// olomol doesn't know (one a newer olomol added: a kind of arrow, a stereo bond) is taken out on reading, so the
// object is drawn with the key's default; it is kept (object.kept: { path: value }) and written back as it was,
// unless that key has been changed in the drawing since. `written`: what the file holds for the default where it
// is written (a slot), else it is left out.
const oneOf = (...values) => (value) => values.includes(value);
const VALUES = {
  atoms: {
    element: (v) => typeof v === 'string' && v.length > 0, group: (v) => typeof v === 'string',
    multiplicity: oneOf(1, 2, 3, 4, 5), hydrogensSide: oneOf('left', 'right'), partialCharge: oneOf(1, -1), projection: oneOf('fischer'),
    lonePairs: (v) => v === 'auto' || (Number.isInteger(v) && v >= 0), number: (v) => v === 'iupac' || Number.isFinite(v),
    'onArrow.slot': oneOf('above', 'below', 'above-in', 'above-out', 'below-in', 'below-out'), 'onArrow.sign': oneOf('+', '-', '−'),
  },
  bonds: { order: oneOf(1, 2, 3, 4), stereo: oneOf('wedge', 'hash', 'wavy', 'perspective'), doubleBondSide: oneOf('left', 'right', 'center'), kind: oneOf('partial', 'hydrogenBond', 'dative', 'link') },
  arrows: { kind: oneOf('forward', 'equilibrium', 'resonance', 'retro', 'multistep', 'dipole', 'crossed', 'equals'), lean: oneOf('forward', 'back') },
  texts: { font: oneOf('sans', 'serif'), align: oneOf('left', 'center', 'right'), 'onMolecule.slot': oneOf('below', 'above', 'left', 'right'), 'onArrow.slot': oneOf('above', 'below', 'above-in', 'above-out', 'below-in', 'below-out'), 'onArrow.sign': oneOf('+', '-', '−') },
  curves: { electrons: oneOf(1, 2) },
  brackets: { shape: oneOf('square', 'round') },
  orbitals: { kind: oneOf('p', 'hybrid', 's'), phase: oneOf(1, -1), plane: oneOf(1, -1) },
};
const WRITTEN = { atoms: { 'onArrow.slot': 'above' }, texts: { 'onMolecule.slot': 'below', 'onArrow.slot': 'above' } };
const pathOf = (path) => path.split('.');

// A record with the values olomol doesn't know taken out: [the record, { path: value } or null]
function knownValues(kind, record) {
  let out = record;
  let kept = null;
  for (const [path, known] of Object.entries(VALUES[kind] ?? {})) {
    const [key, inner] = pathOf(path);
    const holder = inner ? out[key] : out;
    const name = inner ?? key;
    if (!holder || typeof holder !== 'object' || !(name in holder) || holder[name] === null || known(holder[name])) continue;
    (kept ??= {})[path] = holder[name];
    const { [name]: _, ...rest } = holder;
    out = inner ? { ...out, [key]: rest } : rest;
  }
  return [out, kept];
}

// What the file holds for an object (`out`) with the values it was read with that olomol doesn't know put back,
// where the drawing still has the default for them
function withKept(kind, out, kept) {
  if (!kept) return out;
  const file = { ...out };
  for (const [path, value] of Object.entries(kept)) {
    const [key, inner] = pathOf(path);
    const holder = inner ? file[key] : file;
    if (!holder) continue; // (no longer on an arrow, say: nothing to put it in)
    const name = inner ?? key;
    if (holder[name] !== undefined && holder[name] !== WRITTEN[kind]?.[path]) continue; // (changed since)
    if (inner) file[key] = { ...holder, [name]: value };
    else file[name] = value;
  }
  return file;
}

// The drawing's style in the file: a preset by its name ("acs"), one's own as its sizes in points and its font
// ({ "bond": 14.4, …, "font": "serif" }); the drawing's { style, customStyle } (customStyle.family: the font)
// Its look with it: "charges": "circled" (⊕ ⊖) and "lonePairs": "bars" (Lewis), only when so; a preset with either
// is { "preset": "acs", … }, its name alone otherwise.
function styleOut({ style, customStyle, charges, lonePairs }) {
  const look = { ...(charges === 'circled' && { charges }), ...(lonePairs === 'bars' && { lonePairs }) };
  if (style !== 'custom') return Object.keys(look).length ? { preset: style, ...look } : style;
  const { family, ...points } = clampPoints(customStyle);
  return { ...points, font: family, ...look };
}
function styleIn(style) {
  if (typeof style === 'string') return STYLE_NAMES.includes(style) && style !== 'custom' ? { style } : null;
  if (!style || typeof style !== 'object' || Array.isArray(style)) return null;
  const { font, preset, charges, lonePairs, ...points } = style;
  const sizes = preset !== undefined ? (STYLE_NAMES.includes(preset) && preset !== 'custom' ? { style: preset } : null)
    : { style: 'custom', customStyle: clampPoints({ ...points, family: font }) };
  return sizes && styleOf({ ...sizes, charges, lonePairs });
}

// --- writing ---

// Each kind: the model's keys it writes (the rest, except `unknown`, are written as they are and listed in
// `unmapped`: a field added to the model and not yet named here), and how.
const OUT = {
  atoms: {
    keys: ['id', 'el', 'alias', 'x', 'y', 'charge', 'isotope', 'radical', 'hCount', 'lonePairs', 'color', 'highlight', 'bold', 'partialCharge', 'hSide', 'endLabel', 'carbonLabel', 'cipLabel', 'number', 'autoNumber', 'letter', 'projection', 'facing', 'arrow', 'arrowSlot', 'arrowSign', 'arrowOrder'],
    write: (a, has) => ({
      id: a.id,
      ...(a.el !== '*' && { element: a.el }),
      ...(a.alias && { group: a.alias }),
      x: r4(a.x),
      y: up(a.y),
      ...(a.charge && { charge: a.charge }),
      ...(given(a.isotope) && { isotope: a.isotope }),
      ...(a.radical && { multiplicity: a.radical }), // (the spin multiplicity: as the drawing's radical codes)
      ...(given(a.hCount) && { hydrogens: a.hCount }),
      ...(given(a.lonePairs) && { lonePairs: a.lonePairs }),
      ...(a.color && { color: a.color }),
      ...(a.highlight && { highlight: a.highlight }),
      ...(a.bold && { bold: true }),
      ...(a.partialCharge && { partialCharge: a.partialCharge }),
      ...(a.hSide && { hydrogensSide: a.hSide }),
      ...(given(a.endLabel) && { showMethyl: a.endLabel }),
      ...(given(a.carbonLabel) && { showCarbon: a.carbonLabel }),
      ...(a.cipLabel && { showRS: true }),
      // (a number set by hand, or "iupac": numbered with its molecule by the IUPAC rules, worked out again)
      ...(a.autoNumber ? { number: 'iupac' } : given(a.number) && { number: a.number }),
      ...(a.letter && { isotopeLetter: true }),
      ...(a.projection && { projection: a.projection }),
      ...(a.facing && { facing: { ...a.facing, angle: deg(-a.facing.angle), ...(Number.isFinite(a.facing.reach) && { reach: r4(a.facing.reach) }) } }),
      ...(has(a.arrow) && { onArrow: { arrow: a.arrow, slot: a.arrowSlot ?? 'above', ...(a.arrowSign && { sign: signOut(a.arrowSign) }), ...(Number.isInteger(a.arrowOrder) && { order: a.arrowOrder }) } }),
    }),
  },
  bonds: {
    // (turned: which end the 1 key's wedge cycle has swapped to, the editor's while it lasts, not the file's)
    keys: ['id', 'a', 'b', 'order', 'stereo', 'side', 'color', 'highlight', 'delocalized', 'kind', 'z', 'cipLabel', 'newman', 'bold', 'turned'],
    write: (b) => ({
      id: b.id,
      atoms: [b.a, b.b],
      ...(b.order !== 1 && { order: b.order }),
      ...(b.stereo && { stereo: b.stereo }),
      ...(b.side && { doubleBondSide: swapSide(b.side) }),
      ...(b.color && { color: b.color }),
      ...(b.highlight && { highlight: b.highlight }),
      ...(b.delocalized && { delocalized: true }),
      ...(b.kind && { kind: BOND_KINDS[b.kind] ?? b.kind }),
      ...(typeof b.z === 'number' && { depth: r4(b.z) }),
      ...(b.cipLabel && { showEZ: true }),
      ...(b.newman && { newman: true }),
      ...(b.bold && { bold: true }),
    }),
  },
  arrows: {
    keys: ['id', 'x1', 'y1', 'x2', 'y2', 'kind', 'lean', 'color', 'sides', 'ownLength', 'lengthByHand'],
    write: (a) => ({
      id: a.id,
      ...(a.kind !== 'forward' && { kind: ARROW_KINDS[a.kind] ?? a.kind }),
      from: point(a.x1, a.y1),
      to: point(a.x2, a.y2),
      ...(a.lean && { lean: a.lean }),
      ...(a.color && { color: a.color }),
      ...(a.sides?.length && { sideArcs: a.sides.map(({ id, side, way, reach, ...rest }) => ({ id, side, way, reach: r4(reach), ...rest })) }),
      ...(a.ownLength !== undefined && { drawnLength: r4(a.ownLength) }),
      ...(a.lengthByHand && { lengthByHand: true }),
    }),
  },
  pluses: {
    keys: ['id', 'x', 'y', 'color'],
    write: (p) => ({ id: p.id, x: r4(p.x), y: up(p.y), ...(p.color && { color: p.color }) }),
  },
  texts: {
    // (arrowSign too: a sign in front of a text on an arrow, written in onArrow; unlisted it went as a key of its own
    // as well, read back among the unknown ones and written again for ever)
    keys: ['id', 'x', 'y', 'text', 'color', 'bold', 'size', 'family', 'align', 'anchor', 'arrow', 'slot', 'drop', 'order', 'arrowSign'],
    write: (x, has) => ({
      id: x.id,
      x: r4(x.x),
      y: up(x.y),
      text: x.text,
      ...(x.color && { color: x.color }),
      ...(x.bold && { bold: true }),
      ...(r4(x.size) > 0 && x.size !== 1 && { size: r4(x.size) }),
      ...(x.family && { font: x.family }),
      ...(x.align && { align: x.align }),
      ...(has(x.anchor) && { onMolecule: { atom: x.anchor, slot: x.slot ?? 'below', ...(x.drop && { drop: r4(x.drop) }), ...(Number.isInteger(x.order) && { order: x.order }) } }),
      ...(!has(x.anchor) && has(x.arrow) && { onArrow: { arrow: x.arrow, slot: x.slot ?? 'above', ...(x.arrowSign && { sign: signOut(x.arrowSign) }), ...(Number.isInteger(x.order) && { order: x.order }) } }),
    }),
  },
  curves: {
    // (`drawn`: the curve as the editor drew it last, `hint`: as read from a file, until the first change)
    keys: ['id', 'electrons', 'from', 'to', 'color', 'variant', 'drawn', 'hint'],
    write: (c) => ({
      id: c.id,
      ...(c.electrons !== 2 && { electrons: c.electrons }),
      from: { ...c.from },
      to: { ...c.to },
      ...(c.color && { color: c.color }),
      ...(c.variant && { variant: c.variant }),
      ...(c.drawn && { curve: c.drawn.points.map(([x, y]) => point(x, y)), tip: point(...c.drawn.tip) }),
    }),
  },
  fills: {
    keys: ['id', 'atoms', 'color'],
    write: (f) => ({ id: f.id, atoms: [...f.atoms], ...(f.color && { color: f.color }) }),
  },
  brackets: {
    keys: ['id', 'x1', 'y1', 'x2', 'y2', 'shape', 'sup', 'sub', 'color', 'atoms'],
    write: (b, has) => ({
      id: b.id,
      corners: [point(b.x1, b.y1), point(b.x2, b.y2)],
      ...(b.shape !== 'square' && { shape: b.shape }),
      ...(b.sup && { superscript: b.sup }),
      ...(b.sub && { subscript: b.sub }),
      ...(b.color && { color: b.color }),
      ...(b.atoms?.some(has) && { atoms: b.atoms.filter(has) }),
    }),
  },
  orbitals: {
    keys: ['id', 'atom', 'kind', 'angle', 'ref', 'size', 'phase', 'color', 'colorOther', 'plane', 'reach', 'z', 'dz'],
    write: (o, has) => ({
      id: o.id,
      atom: o.atom,
      ...(o.kind !== 'p' && { kind: o.kind }),
      angle: deg(-o.angle),
      ...(has(o.ref) && { angleFrom: o.ref }),
      ...((o.size ?? 1) !== 1 && { size: r4(o.size) }),
      ...((o.phase ?? 1) !== 1 && { phase: o.phase }),
      ...(o.color && { color: o.color }),
      ...(o.colorOther && { otherColor: o.colorOther }),
      ...(o.plane && { plane: o.plane }),
      ...(o.reach != null && o.reach !== 1 && { reach: r4(o.reach) }),
      ...(typeof o.z === 'number' && { depth: r4(o.z), depthTilt: r4(o.dz ?? 0) }),
    }),
  },
  overlaps: {
    keys: ['id', 'a', 'b', 'color', 'sideA', 'sideB'],
    write: (o) => ({ id: o.id, orbitals: [o.a, o.b], ...(o.color && { color: o.color }), ...((o.sideA != null || o.sideB != null) && { lobes: [o.sideA ?? null, o.sideB ?? null] }) }),
  },
};

// Which objects go into the file: all, or those with `ids` and what they need (a bond with both its atoms, an
// orbital with its atom, a curved arrow with both its ends)
function written(doc, ids) {
  const wanted = ids ? new Set(ids) : null;
  const keep = (id) => !wanted || wanted.has(id);
  const out = Object.fromEntries(Object.keys(COLLECTIONS).map((kind) => [kind, []]));
  const has = new Set();
  const take = (kind, o) => {
    out[kind].push(o);
    has.add(o.id);
  };
  for (const a of doc.atoms.values()) if (keep(a.id)) take('atoms', a);
  for (const b of doc.bonds.values()) if (has.has(b.a) && has.has(b.b)) take('bonds', b);
  for (const kind of ['arrows', 'pluses', 'brackets']) for (const o of doc[kind].values()) if (keep(o.id)) take(kind, o);
  for (const o of doc.orbitals.values()) if (has.has(o.atom)) take('orbitals', o);
  for (const o of doc.overlaps.values()) if (has.has(o.a) && has.has(o.b)) take('overlaps', o);
  for (const f of doc.fills.values()) if (f.atoms.every((id) => has.has(id))) take('fills', f);
  for (const x of doc.texts.values()) if (keep(x.id)) take('texts', x);
  const endIn = (end) => [end.atom, end.bond, end.orbital, end.newBond].filter((id) => id !== undefined).every((id) => has.has(id));
  for (const c of doc.curves.values()) if (keep(c.id) && endIn(c.from) && endIn(c.to)) take('curves', c);
  return { out, has: (id) => id !== undefined && id !== null && has.has(id) };
}

// The drawing (or the objects with `ids`) as an .olom object. Its style: its own, else the one set for new
// drawings (`settings`), so that the file keeps the look it was made in; `ownStyle`: its own only (the examples,
// shown in whatever style is set). `unmapped`: a Set that gets the model's fields the format has no name for yet
// (written as they are; the tests want none). `app`: what wrote it.
export function toOlom(doc, { ids = null, settings = {}, title = null, unmapped = null, ownStyle = false, app = APP } = {}) {
  const style = doc.style ?? (ownStyle ? null : defaultStyleOf(settings));
  // (a preset this olomol doesn't know, from a newer one: written back as it was while the drawing has no other)
  const named = doc.style ? styleOut(doc.style) : doc.keptStyle ?? (style && styleOut(style));
  const file = { format: FORMAT, version: VERSION, app, ...(title && { title }), ...(named && { style: named }) };
  const { out, has } = written(doc, ids);
  for (const [kind, name] of Object.entries(COLLECTIONS)) {
    if (!out[kind].length) continue;
    const { keys, write } = OUT[kind];
    const known = new Set([...keys, 'unknown', 'kept', 'unknownIn']);
    const record = (o) => {
      const extra = Object.fromEntries(Object.entries(o).filter(([key, value]) => !known.has(key) && value !== undefined));
      for (const key of Object.keys(extra)) unmapped?.add(`${kind}.${key}`);
      const out = withKept(kind, write(o, has), o.kept);
      // (what a place held that olomol doesn't know, back in it while the object is still there)
      for (const [place, rest] of Object.entries(o.unknownIn ?? {})) if (out[place]) out[place] = { ...out[place], ...rest };
      return { ...out, ...extra, ...o.unknown };
    };
    if (kind !== 'bonds') {
      file[name] = out[kind].map(record);
      continue;
    }
    // One compound (K⁺ with its anion: one species): not a bond (nothing drawn), a list of its own
    const bonds = out.bonds.filter((b) => b.kind !== 'link');
    const links = out.bonds.filter((b) => b.kind === 'link');
    if (bonds.length) file.bonds = bonds.map(record);
    if (links.length) file.together = links.map((b) => ({ id: b.id, atoms: [b.a, b.b], ...b.unknown }));
  }
  const groups = writtenGroups(doc, has);
  if (groups.length) file.groups = groups;
  return { ...file, ...doc.unknown };
}

// The groups (Ctrl+G) of what is written: those all of whose things are, inner ones first; a molecule as one of
// its atoms (the lowest id), a group by its id
function writtenGroups(doc, has) {
  if (!doc.groups?.size) return [];
  const molecule = new Map();
  for (const members of fragments(doc)) for (const id of members) molecule.set(id, members);
  const done = new Set();
  const out = [];
  for (let more = true; more;) {
    more = false;
    for (const group of doc.groups.values()) {
      if (done.has(group.id) || !group.members.every((id) => (doc.groups.has(id) ? done.has(id) : has(id)))) continue;
      const members = [...new Set(group.members.map((id) => (doc.atoms.has(id) ? Math.min(...molecule.get(id)) : id)))];
      out.push({ id: group.id, members, ...(group.name && { name: group.name }), ...group.unknown });
      done.add(group.id);
      more = true;
    }
  }
  return out;
}

// As text: each top-level key on a line of its own, each object of a collection on one line (easy to read, and a
// change to one atom is a change to one line)
export function writeOlom(doc, options) {
  const line = (value) => JSON.stringify(value).replace(/("(?:[^"\\]|\\.)*")|([,:])/g, (_, string, mark) => string ?? `${mark} `);
  const entries = Object.entries(toOlom(doc, options)).map(([key, value]) => (Array.isArray(value) && value.every((item) => item && typeof item === 'object' && !Array.isArray(item))
    ? `${JSON.stringify(key)}: [\n${value.map((item) => `  ${line(item)}`).join(',\n')}\n ]`
    : `${JSON.stringify(key)}: ${line(value)}`));
  return `{\n ${entries.join(',\n ')}\n}\n`;
}

// --- reading ---

// Each kind: the file's keys it reads (the rest go to the object's `unknown`), and how: (record, id of) → the
// object's fields; `id of` gives the drawing's id for a file id (undefined: not in the file).
const IN = {
  atoms: {
    keys: ['id', 'element', 'group', 'x', 'y', 'charge', 'isotope', 'multiplicity', 'hydrogens', 'lonePairs', 'color', 'highlight', 'bold', 'partialCharge', 'hydrogensSide', 'showMethyl', 'showCarbon', 'showRS', 'number', 'isotopeLetter', 'projection', 'facing', 'onArrow'],
    read: (r) => ({
      el: typeof r.element === 'string' && r.element ? r.element : '*',
      alias: typeof r.group === 'string' ? r.group : null,
      charge: r.charge ?? 0,
      isotope: r.isotope ?? null,
      radical: [1, 2, 3, 4, 5].includes(r.multiplicity) ? r.multiplicity : 0,
      hCount: r.hydrogens ?? null,
      lonePairs: r.lonePairs ?? null,
      color: r.color ?? null,
      ...(r.highlight && { highlight: r.highlight }),
      ...(r.bold && { bold: true }),
      ...(r.partialCharge && { partialCharge: r.partialCharge }),
      ...(r.hydrogensSide && { hSide: r.hydrogensSide }),
      ...(given(r.showMethyl) && { endLabel: r.showMethyl }),
      ...(given(r.showCarbon) && { carbonLabel: r.showCarbon }),
      ...(r.showRS && { cipLabel: true }),
      ...(r.number === 'iupac' ? { autoNumber: true } : given(r.number) && { number: r.number }),
      ...(r.isotopeLetter && { letter: true }),
      ...(r.projection && { projection: r.projection }),
      ...(r.facing && { facing: { ...r.facing, angle: -rad(r.facing.angle ?? 0) } }),
    }),
    links: (o, r, ref) => {
      const arrow = ref(r.onArrow?.arrow, 'arrows');
      if (arrow !== undefined) Object.assign(o, { arrow, arrowSlot: r.onArrow.slot ?? 'above', ...(r.onArrow.sign && { arrowSign: signIn(r.onArrow.sign) }), ...(Number.isInteger(r.onArrow.order) && { arrowOrder: r.onArrow.order }) });
    },
  },
  bonds: {
    keys: ['id', 'atoms', 'order', 'stereo', 'doubleBondSide', 'color', 'highlight', 'delocalized', 'kind', 'depth', 'showEZ', 'newman', 'bold'],
    read: (r) => ({
      stereo: r.stereo ?? '',
      side: r.doubleBondSide ? swapSide(r.doubleBondSide) : null,
      color: r.color ?? null,
      ...(r.highlight && { highlight: r.highlight }),
      ...(r.delocalized && { delocalized: true }),
      ...(r.kind && { kind: BOND_KIND_CODES[r.kind] ?? r.kind }),
      ...(typeof r.depth === 'number' && { z: r.depth }),
      ...(r.showEZ && { cipLabel: true }),
      ...(r.newman && { newman: true }),
      ...(r.bold && { bold: true }),
    }),
  },
  arrows: {
    keys: ['id', 'kind', 'from', 'to', 'lean', 'color', 'sideArcs', 'drawnLength', 'lengthByHand'],
    read: (r) => ({
      color: r.color ?? null,
      ...(r.lean && { lean: r.lean }),
      ...(typeof r.drawnLength === 'number' && { ownLength: r.drawnLength }),
      ...(r.lengthByHand && { lengthByHand: true }),
    }),
  },
  pluses: { keys: ['id', 'x', 'y', 'color'], read: (r) => ({ color: r.color ?? null }) },
  texts: {
    keys: ['id', 'x', 'y', 'text', 'color', 'bold', 'size', 'font', 'align', 'onMolecule', 'onArrow'],
    read: (r) => ({
      color: r.color ?? null,
      ...(r.bold && { bold: true }),
      ...(r4(r.size) > 0 && Number(r.size) !== 1 && { size: Number(r.size) }),
      ...(r.font && { family: r.font }),
      ...(r.align && { align: r.align }),
    }),
    links: (o, r, ref) => {
      const anchor = ref(r.onMolecule?.atom, 'atoms');
      const arrow = ref(r.onArrow?.arrow, 'arrows');
      if (anchor !== undefined) Object.assign(o, { anchor, ...(r.onMolecule.slot && r.onMolecule.slot !== 'below' && { slot: r.onMolecule.slot }), ...(Number(r.onMolecule.drop) > 0 && { drop: Number(r.onMolecule.drop) }), ...(Number.isInteger(r.onMolecule.order) && { order: r.onMolecule.order }) });
      else if (arrow !== undefined) Object.assign(o, { arrow, slot: r.onArrow.slot ?? 'above', ...(r.onArrow.sign && { arrowSign: signIn(r.onArrow.sign) }), ...(Number.isInteger(r.onArrow.order) && { order: r.onArrow.order }) });
    },
  },
  curves: {
    keys: ['id', 'electrons', 'from', 'to', 'color', 'variant', 'curve', 'tip'],
    read: (r) => {
      // the curve as drawn: kept (written back), and the arrow drawn by it until the drawing is changed
      const curve = Array.isArray(r.curve) && r.curve.length === 4 && Array.isArray(r.tip) && [...r.curve, r.tip].every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        ? { points: r.curve.map(([x, y]) => [x, -y]), tip: [r.tip[0], -r.tip[1]] } : null;
      return { color: r.color ?? null, variant: r.variant ?? 0, ...(curve && { drawn: curve, hint: structuredClone(curve) }) };
    },
  },
  fills: { keys: ['id', 'atoms', 'color'], read: () => ({}) },
  brackets: {
    keys: ['id', 'corners', 'shape', 'superscript', 'subscript', 'color', 'atoms'],
    read: (r) => ({ shape: r.shape ?? 'square', sup: r.superscript ?? '', sub: r.subscript ?? '', color: r.color ?? null }),
    links: (o, r, ref) => {
      const atoms = listIn(r.atoms).map((id) => ref(id, 'atoms')).filter((id) => id !== undefined);
      if (atoms.length) o.atoms = atoms;
    },
  },
  orbitals: {
    keys: ['id', 'atom', 'kind', 'angle', 'angleFrom', 'size', 'phase', 'color', 'otherColor', 'plane', 'reach', 'depth', 'depthTilt'],
    read: (r) => ({
      kind: r.kind ?? 'p',
      angle: -rad(Number(r.angle ?? 90) || 0),
      size: Number(r.size) > 0 ? Number(r.size) : 1,
      phase: r.phase ?? 1,
      color: r.color ?? null,
      ...(r.otherColor && { colorOther: r.otherColor }),
      ...(r.plane && { plane: r.plane }),
      ...(typeof r.reach === 'number' && { reach: r.reach }),
      ...(typeof r.depth === 'number' && { z: r.depth, dz: r.depthTilt ?? 0 }),
    }),
    links: (o, r, ref) => {
      o.ref = ref(r.angleFrom, 'atoms') ?? null;
    },
  },
  overlaps: {
    keys: ['id', 'orbitals', 'color', 'lobes'],
    read: (r) => ({ color: r.color ?? null, ...(r.lobes?.[0] != null && { sideA: r.lobes[0] }), ...(r.lobes?.[1] != null && { sideB: r.lobes[1] }) }),
  },
};

// A list in a file (anything else: none), a point ([x, y]; anything else: `fallback`)
const listIn = (value) => (Array.isArray(value) ? value : []);
const finiteIn = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pointIn = (value, fallback) => (Array.isArray(value) && value.length >= 2 ? [finiteIn(value[0]), finiteIn(value[1])] : fallback);
// What an object's place (onArrow, onMolecule) holds that olomol doesn't know: kept, written back in it
const PLACES = { atoms: { onArrow: ['arrow', 'slot', 'sign', 'order'] }, texts: { onArrow: ['arrow', 'slot', 'sign', 'order'], onMolecule: ['atom', 'slot', 'drop', 'order'] } };
function unknownIn(kind, record) {
  let out = null;
  for (const [place, keys] of Object.entries(PLACES[kind] ?? {})) {
    const holder = record[place];
    if (!holder || typeof holder !== 'object') continue;
    const rest = Object.fromEntries(Object.entries(holder).filter(([key]) => !keys.includes(key)));
    if (Object.keys(rest).length) (out ??= {})[place] = rest;
  }
  return out ? { unknownIn: out } : {};
}

const unknownOf = (record, keys) => {
  const known = new Set(keys);
  const rest = Object.fromEntries(Object.entries(record).filter(([key]) => !known.has(key)));
  return Object.keys(rest).length ? { unknown: rest } : {};
};

// Reads an .olom file (text or object) into `doc` (default: a new drawing), every object with a new id there.
// Returns { doc, ids, title, newer } (newer: the file is of a newer minor version: some parts may not show).
export function readOlom(input, doc = emptyDoc()) {
  let file = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  if (file?.format !== FORMAT) throw new Error(t('not an olomol drawing'));
  const [major, minor] = String(file.version ?? '1.0').split('.').map(Number);
  if (!Number.isInteger(major)) throw new Error(t('This file says its format version is {version}, which no olomol wrote.', { version: JSON.stringify(file.version) }));
  if (!(major <= MAJOR)) throw new Error(t('This drawing was saved by a newer olomol (format {version}): open it in the newest olomol.', { version: file.version }));
  for (let v = String(file.version ?? '1.0'); UPGRADES[v]; v = file.version) file = UPGRADES[v](file);
  const newer = major === MAJOR && minor > MINOR;

  // the drawing's id for each id in the file
  const ids = new Map();
  // (each record with the values olomol doesn't know taken out, kept for its object: keptOf)
  const keptOf = new Map();
  const records = Object.fromEntries(Object.entries(COLLECTIONS).map(([kind, name]) => [kind, (Array.isArray(file[name]) ? file[name].filter((r) => r && typeof r === 'object') : []).map((r) => {
    const [record, kept] = knownValues(kind, r);
    if (kept) keptOf.set(record, kept);
    return record;
  })]));
  const idOf = (fileId) => (fileId === undefined || fileId === null ? undefined : ids.get(fileId));
  const made = [];
  const add = (kind, record, object) => {
    if (record.id !== undefined) ids.set(record.id, object.id);
    if (keptOf.has(record)) object.kept = keptOf.get(record);
    made.push([kind, record, object]);
    return object;
  };
  // (into a new drawing the file's ids are kept, so that a file read and written again is the same file and what
  // other programs add can refer to them; into a drawing with objects in it, as when pasting, all get new ids)
  const listOf = (key) => (Array.isArray(file[key]) ? file[key].filter((r) => r && typeof r === 'object') : []);
  const [togetherRecords, groupRecords] = [listOf('together'), listOf('groups')];
  const fileIds = [...Object.values(records).flat(), ...togetherRecords, ...groupRecords].flatMap((r) => [r.id, ...listIn(r.sideArcs).filter((arc) => arc && typeof arc === 'object').map((arc) => arc.id)]);
  const keepIds = doc.nextId === 1 && !KINDS.some((kind) => doc[kind].size)
    && fileIds.every((id) => Number.isInteger(id) && id > 0) && new Set(fileIds).size === fileIds.length;
  const next = (r) => {
    if (keepIds) doc.nextId = r.id;
  };
  const at = (r) => [finiteIn(r.x), -finiteIn(r.y)];
  const down = ([x, y]) => [x, -y];
  const fields = (kind, r) => ({ ...IN[kind].read(r), ...unknownOf(r, IN[kind].keys), ...unknownIn(kind, r) });
  // the drawing's id for a file's id of an object of this kind (one of another kind, a bond to an arrow: none)
  const ref = (fileId, kind) => {
    const id = idOf(fileId);
    return id !== undefined && doc[kind]?.has(id) ? id : undefined;
  };

  for (const r of records.atoms) next(r), add('atoms', r, addAtom(doc, ...at(r), typeof r.element === 'string' && r.element ? r.element : '*', fields('atoms', r)));
  for (const r of records.arrows) {
    const [[x1, y1], [x2, y2]] = [down(pointIn(r.from, [0, 0])), down(pointIn(r.to, [1, 0]))];
    next(r);
    const arrow = add('arrows', r, addArrow(doc, x1, y1, x2, y2, ARROW_KIND_CODES[r.kind] ?? r.kind ?? 'forward', fields('arrows', r)));
    // (a side arc: above or below, in or out; its reach a number, 1 if not given)
    const arcs = listIn(r.sideArcs).filter((arc) => arc && typeof arc === 'object' && ['above', 'below'].includes(arc.side) && ['in', 'out'].includes(arc.way));
    if (arcs.length) {
      arrow.sides = arcs.map(({ id, ...arc }) => {
        if (keepIds) doc.nextId = id;
        const own = doc.nextId++;
        if (id !== undefined) ids.set(id, own);
        return { id: own, ...arc, reach: Number(arc.reach) > 0 ? Number(arc.reach) : 1 };
      });
    }
  }
  for (const r of records.bonds) {
    const [a, b] = listIn(r.atoms).map((id) => ref(id, 'atoms'));
    if (a !== undefined && b !== undefined && a !== b) next(r), add('bonds', r, addBond(doc, a, b, r.order ?? 1, fields('bonds', r)));
  }
  for (const r of records.pluses) next(r), add('pluses', r, addPlus(doc, ...at(r), fields('pluses', r)));
  for (const r of records.brackets) {
    const corners = listIn(r.corners);
    const [[x1, y1], [x2, y2]] = [down(pointIn(corners[0], [0, 0])), down(pointIn(corners[1], [1, 1]))];
    next(r);
    add('brackets', r, addBracket(doc, x1, y1, x2, y2, fields('brackets', r)));
  }
  for (const r of records.orbitals) {
    const atom = ref(r.atom, 'atoms');
    if (atom !== undefined) next(r), add('orbitals', r, addOrbital(doc, atom, fields('orbitals', r)));
  }
  for (const r of records.overlaps) {
    const [a, b] = listIn(r.orbitals).map((id) => ref(id, 'orbitals'));
    if (a !== undefined && b !== undefined) next(r), add('overlaps', r, addOverlap(doc, a, b, fields('overlaps', r)));
  }
  for (const r of records.fills) {
    const atoms = listIn(r.atoms).map((id) => ref(id, 'atoms'));
    if (atoms.length && atoms.every((id) => id !== undefined)) next(r), add('fills', r, Object.assign(addFill(doc, atoms, r.color ?? null), fields('fills', r)));
  }
  for (const r of records.texts) next(r), add('texts', r, addText(doc, ...at(r), String(r.text ?? ''), fields('texts', r)));
  // curved arrows: their ends by the drawing's ids (an end on something not in the file, or on nothing: the arrow is
  // left out)
  const ENDS = { atom: 'atoms', bond: 'bonds', orbital: 'orbitals', newBond: 'atoms' };
  const end = (e) => {
    if (!e || typeof e !== 'object' || ['atom', 'bond', 'orbital'].every((key) => e[key] === undefined)) return null;
    const mapped = { ...e };
    for (const [key, kind] of Object.entries(ENDS)) {
      if (e[key] === undefined) continue;
      mapped[key] = ref(e[key], kind);
      if (mapped[key] === undefined) return null;
    }
    return mapped;
  };
  for (const r of records.curves) {
    const [from, to] = [end(r.from), end(r.to)];
    if (from && to) next(r), add('curves', r, addCurve(doc, from, to, r.electrons ?? 2, fields('curves', r)));
  }
  // One compound: links between molecules (bonds of kind 'link' in the drawing)
  for (const r of togetherRecords) {
    const [a, b] = listIn(r.atoms).map((id) => ref(id, 'atoms'));
    if (a !== undefined && b !== undefined && a !== b) next(r), add('bonds', r, addBond(doc, a, b, 1, { kind: 'link', ...unknownOf(r, ['id', 'atoms']) }));
  }
  // groups (Ctrl+G): their ids first (a group may hold one written after it), then what they hold; a molecule
  // by any of its atoms, held whole (all its atoms)
  const grouped = groupRecords.map((r) => {
    next(r);
    const id = doc.nextId++;
    if (r.id !== undefined) ids.set(r.id, id);
    return [r, id];
  });
  if (grouped.length) {
    const molecule = new Map();
    for (const members of fragments(doc)) for (const id of members) molecule.set(id, members);
    for (const [r, id] of grouped) {
      const members = [...new Set((Array.isArray(r.members) ? r.members : []).map(idOf).filter((one) => one !== undefined && one !== id)
        .flatMap((one) => (doc.atoms.has(one) ? molecule.get(one) : [one])))];
      const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : null;
      if (members.length) (doc.groups ??= new Map()).set(id, { id, members, ...(name && { name }), ...unknownOf(r, ['id', 'members', 'name']) });
    }
  }
  // (past the ids of what a newer olomol added, kept as it was: no new object takes one of them)
  const unknownIds = Object.entries(file).filter(([key, value]) => !TOP.has(key) && Array.isArray(value))
    .flatMap(([, value]) => value.map((item) => item?.id).filter((id) => Number.isInteger(id)));
  if (keepIds) doc.nextId = Math.max(0, ...fileIds, ...unknownIds) + 1;
  // what refers to other objects, now that all have their ids
  for (const [kind, record, object] of made) IN[kind].links?.(object, record, ref);

  const style = styleIn(file.style);
  if (style) doc.style = style;
  else if (file.style !== undefined && file.style !== null) doc.keptStyle = file.style; // (a preset of a newer olomol: kept, drawn in the reader's)
  const rest = Object.fromEntries(Object.entries(file).filter(([key]) => !TOP.has(key)));
  if (Object.keys(rest).length) doc.unknown = { ...doc.unknown, ...rest };
  return { doc, ids: made.map(([, , o]) => o.id).concat(made.flatMap(([kind, , o]) => (kind === 'arrows' ? (o.sides ?? []).map((s) => s.id) : []))), title: typeof file.title === 'string' ? file.title : null, newer };
}
