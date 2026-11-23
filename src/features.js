// What olomol lets people do, by name, so that a page embedding it (embed.html) can switch parts off: a practice
// page where students only push electrons (`only=arrows,electrons`), a test without PubChem (`off=pubchem`).
// olomol.org itself has everything on.
//
// Each part is switched off at every way in to it, not only at its button:
// - its tools can't be picked (Editor.setTool), so neither their buttons, keys, search entries nor menus pick them;
// - its windows don't open (App's dialogs) and its actions do nothing (export, PubChem, pasting a SMILES);
// - and, under all of that, a change of the drawing that adds, takes away or changes something of a part
//   switched off is refused and undone, whatever made it (a key over an atom, the panel, Delete, a paste):
//   switchedOff(before, after). How things are drawn stays free: where atoms are, which way a wedge points (a
//   chair turned or flipped draws the same molecule anew), how a curved arrow bends.
// Selecting, moving, zooming, undo and Erase are always there (Erase takes away only what may change).
//
// The page says which parts in its address: embed.html?only=arrows,electrons or ?off=pubchem,projections (comma
// or space between the names; an unknown name is ignored, and said in the console).
import { t } from './i18n/i18n.js';

// The parts by name, each with what it is (for the message when something is refused, and for the page that
// writes an embed's address)
export const FEATURES = {
  structure: () => t('drawing and changing structures (atoms, bonds, rings, elements)'),
  'charges-electrons': () => t('charges, lone pairs and unpaired electrons'),
  'curved-arrows': () => t('curved arrows'),
  orbitals: () => t('orbitals'),
  'reaction-arrows': () => t('reaction arrows and "+" signs'),
  text: () => t('text and atom numbers'),
  brackets: () => t('brackets'),
  colors: () => t('colours and highlights'),
  templates: () => t('templates'),
  'structures-from-text': () => t('structures from SMILES, InChI or molfiles, typed or pasted'),
  'structures-from-names': () => t('structures from names and PubChem'),
  'chairs-projections': () => t('chairs and projections (ring flip, turning a chair, Fischer, zigzag)'),
  'align-flip': () => t('aligning and flipping'),
  redraw: () => t('Redraw'),
  'turn-in-3d': () => t('Turn in 3D and 3D models'),
  'molecule-info': () => t('information about molecules (formula, mass, names, identifiers, R/S)'),
  export: () => t('export and copying as a picture'),
};

// Embedded (embed.html marks its <html data-embed>): no tabs, nothing kept in the browser, the parts the
// address asks for
export const EMBEDDED = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-embed');

// The names used before 0.6.0, still read, as the new ones
export const OLD_NAMES = {
  arrows: 'curved-arrows', reactions: 'reaction-arrows', electrons: 'charges-electrons', import: 'structures-from-text',
  pubchem: 'structures-from-names', projections: 'chairs-projections', arrange: 'align-flip', '3d': 'turn-in-3d',
  info: 'molecule-info', colours: 'colors',
};

const names = (text) => (text ?? '').split(/[\s,]+/).filter(Boolean).map((name) => {
  if (!OLD_NAMES[name]) return name;
  console.warn(`[olomol] the part "${name}" is now called "${OLD_NAMES[name]}"`);
  return OLD_NAMES[name];
});

// The parts switched on, from an address's ?only= and ?off= (all, without them)
export function partsFrom(search) {
  const query = new URLSearchParams(search);
  const known = (list) => {
    const unknown = list.filter((name) => !FEATURES[name]);
    if (unknown.length) console.warn(`[olomol] unknown parts ignored: ${unknown.join(', ')}; known: ${Object.keys(FEATURES).join(', ')}`);
    return list.filter((name) => FEATURES[name]);
  };
  const on = new Set(query.has('only') ? known(names(query.get('only'))) : Object.keys(FEATURES));
  for (const name of known(names(query.get('off')))) on.delete(name);
  return on;
}

let on = new Set(EMBEDDED ? partsFrom(location.search) : Object.keys(FEATURES));

// What the address sets of how an embedded editor draws: ?arrowcolor=1035a9 (or %231035a9), the colour of curved
// arrows that have none of their own (the drawing's ink without). Merged into its settings (Editor).
export function lookFrom(search) {
  const colour = new URLSearchParams(search).get('arrowcolor')?.trim().replace(/^#?/, '#');
  return colour && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colour) ? { curveColor: colour.toLowerCase() } : {};
}
export const EMBED_LOOK = EMBEDDED ? lookFrom(location.search) : {};
// Only to look at (?readonly, or the page's readOnly(true): an answer shown, a drawing checked): every part off, no
// tools but Select, no bars but zooming. (?view: its name before 0.6.0)
export const readOnlyFrom = (search) => ['readonly', 'view'].some((name) => new URLSearchParams(search).has(name));
let readOnly = EMBEDDED && readOnlyFrom(location.search);

export const allowed = (name) => !name || (!readOnly && on.has(name));
export const allOn = () => !readOnly && on.size === Object.keys(FEATURES).length;
export const isReadOnly = () => readOnly;
export function setReadOnly(value) {
  readOnly = Boolean(value);
}
// the parts on, by name (for the page: get('partsOn'))
export const partsOn = () => (readOnly ? [] : [...on]);

// The parts on from now (the page's setParts, the tests)
export function setParts(names) {
  on = new Set(names);
}

// The parts a page gives at runtime, { only, off } as in the address (each a list of names, or a string of them);
// an unknown name is an error (a mistyped name would switch nothing off)
export function partsGiven({ only = null, off = null } = {}) {
  const list = (value) => names(Array.isArray(value) ? value.join(',') : value);
  const unknown = [...list(only), ...list(off)].filter((name) => !FEATURES[name]);
  if (unknown.length) throw new Error(`unknown parts: ${unknown.join(', ')}; known: ${Object.keys(FEATURES).join(', ')}`);
  const parts = new Set(only === null ? Object.keys(FEATURES) : list(only));
  for (const name of list(off)) parts.delete(name);
  return parts;
}

// --- atoms the page gave, locked (lock(atomIds), set(drawing, { locked: true })) ---
// What a locked atom is: its element, isotope, hydrogens, label and its bonds (added, taken away, their order, kind and
// wedge) as the page gave them. Where it is drawn stays free, and so do its charges and electrons (their own part),
// curved arrows to and from it, and everything not locked: students draw on and around what they were given.

let locked = new Set();
export const lockedAtoms = () => locked;
export function setLocked(ids) {
  locked = new Set(ids);
}
const LOCKED_ATOM_FIELDS = ['el', 'isotope', 'hCount', 'alias', 'letter'];
const LOCKED_BOND_FIELDS = ['a', 'b', 'order', 'kind', 'stereo'];

// Whether the change from `before` to `after` touches a locked atom (above)
export function lockedTouched(before, after) {
  if (!locked.size) return false;
  for (const id of locked) {
    const [was, now] = [before.atoms.get(id), after.atoms.get(id)];
    if (was && (!now || LOCKED_ATOM_FIELDS.some((field) => !same(was[field], now[field])))) return true;
  }
  const touches = (bond) => locked.has(bond.a) || locked.has(bond.b);
  for (const [id, bond] of before.bonds) {
    const now = after.bonds.get(id);
    if (touches(bond) && (!now || LOCKED_BOND_FIELDS.some((field) => !same(bond[field], now[field])))) return true;
  }
  for (const [id, bond] of after.bonds) if (touches(bond) && !before.bonds.has(id)) return true;
  return false;
}

// --- tools ---

const TOOL_PARTS = {
  bond: 'structure', atom: 'structure', chain: 'structure', ring: 'structure', place: 'structure', group: 'templates',
  charge: 'charges-electrons', radical: 'charges-electrons', pairs: 'charges-electrons',
  orbital: 'orbitals', curve: 'curved-arrows', rxn: 'reaction-arrows', plus: 'reaction-arrows',
  text: 'text', atomNumber: 'text', bracket: 'brackets', paint: 'colors', highlight: 'colors',
  ringFlip: 'chairs-projections', chairTurn: 'chairs-projections', fischer: 'chairs-projections', zigzag: 'chairs-projections',
  flipOver: 'align-flip', snapBond: 'align-flip',
};

// The part a tool belongs to (none: select, erase, always there)
export const toolPart = (tool) => TOOL_PARTS[tool?.name] ?? null;
// (pick: the page's question, "click the atom", answered also where all else is read-only)
export const toolAllowed = (tool) => tool?.name === 'pick' || (readOnly ? tool?.name === 'select' : allowed(toolPart(tool)) && (tool?.name !== 'group' || allowed('structure')));

// The tool to start with: the bond tool; with bonds switched off (embedded), curved arrows, what such pages are
// about; else Select
export const startingTool = () => [{ name: 'bond', order: 1, stereo: '' }, { name: 'curve', electrons: 2 }].find(toolAllowed) ?? { name: 'select' };

// --- windows ---

const DIALOG_PARTS = { layout: 'redraw', turn3d: 'turn-in-3d', templates: 'templates', periodic: 'structure', embed: 'export' };
// (olomol.org's own: its help, versions, reports; not in an embedded editor)
const SITE_DIALOGS = new Set(['examples', 'keys', 'versions', 'report', 'style', 'embed']);

export const dialogAllowed = (name) => !(EMBEDDED && SITE_DIALOGS.has(name)) && allowed(DIALOG_PARTS[name]) && (name !== 'templates' || allowed('structure'));

// --- changes of the drawing ---

// What of an atom, a bond, a curved arrow belongs to which part (the rest is how it is drawn: free)
const ATOM_FIELDS = {
  el: 'structure', isotope: 'structure', hCount: 'structure', alias: 'structure', letter: 'structure',
  charge: 'charges-electrons', radical: 'charges-electrons', lonePairs: 'charges-electrons', partialCharge: 'charges-electrons',
  color: 'colors', highlight: 'colors',
  number: 'text', autoNumber: 'text',
  cipLabel: 'molecule-info',
};
const BOND_FIELDS = { a: 'structure', b: 'structure', order: 'structure', kind: 'structure', color: 'colors', highlight: 'colors', cipLabel: 'molecule-info' };
const CURVE_FIELDS = { electrons: 'curved-arrows', from: 'curved-arrows', to: 'curved-arrows', color: 'colors' };
// the other kinds of things: whole, by what they are
const KIND_PARTS = { arrows: 'reaction-arrows', pluses: 'reaction-arrows', texts: 'text', fills: 'colors', brackets: 'brackets', orbitals: 'orbitals', overlaps: 'orbitals', models: 'turn-in-3d' };
const TEXT_FIELDS = ['text', 'color', 'bold'];

const same = (a, b) => a === b || ((a ?? null) === null && (b ?? null) === null) || JSON.stringify(a) === JSON.stringify(b);

// The first part switched off that the change from `before` to `after` (two drawings) touches, or null
export function switchedOff(before, after) {
  if (allOn()) return null;
  // things of `kind` added or taken away (their whole part off), or a field changed whose part is off
  const fields = (kind, table, wholePart) => {
    const [was, now] = [before[kind] ?? new Map(), after[kind] ?? new Map()];
    const whole = !allowed(wholePart);
    const off = Object.entries(table).filter(([, part]) => !allowed(part));
    if (!whole && !off.length) return null;
    for (const [id, old] of was) {
      const thing = now.get(id);
      if (!thing) {
        if (whole) return wholePart;
        continue;
      }
      for (const [field, part] of off) if (!same(old[field], thing[field])) return part;
    }
    if (whole) for (const id of now.keys()) if (!was.has(id)) return wholePart;
    return null;
  };
  const checks = [
    () => fields('atoms', ATOM_FIELDS, 'structure'),
    () => fields('bonds', BOND_FIELDS, 'structure'),
    () => fields('curves', CURVE_FIELDS, 'curved-arrows'),
    ...Object.entries(KIND_PARTS).map(([kind, part]) => () => {
      if (allowed(part)) return null;
      const [was, now] = [before[kind] ?? new Map(), after[kind] ?? new Map()];
      if (was.size !== now.size || [...was.keys()].some((id) => !now.has(id))) return part;
      // (a text's words, colour: text; where it stands is free)
      if (kind === 'texts') return [...was].some(([id, old]) => TEXT_FIELDS.some((f) => !same(old[f], now.get(id)[f]))) ? part : null;
      return null;
    }),
  ];
  for (const check of checks) {
    const part = check();
    if (part) return part;
  }
  return null;
}

// What is said when a change is refused
export const refusal = (part) => t('Not available here: {part}.', { part: FEATURES[part]?.() ?? part });
