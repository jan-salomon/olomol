// Shared by the fuzzers: olomol's modules, doc <-> plain JSON, deep diff, chemistry identity.
import { createRequire } from 'node:module';

export const REPO = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const src = (path) => import(`${REPO}/src/${path}`);

export const olom = await src('io/olom.js');
export const files = await src('io/files.js');
export const docm = await src('model/doc.js');
export const graph = await src('model/graph.js');
export const sceneMod = await src('render/scene.js');
export const lost = await src('io/lost.js');
export const molfile = await src('io/molfile.js');
export const abbreviate = await src('editor/abbreviate.js');
export const style = await src('render/style.js');

export const RDKit = await createRequire(`${REPO}/package.json`)('@rdkit/rdkit')();

// --- the drawing as plain data, and back ---

// Every field kept (null included), Maps as arrays of their values; doc's other keys as they are
export function docToPlain(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc)) out[key] = value instanceof Map ? [...value.values()] : value;
  return structuredClone(out);
}
export function docFromPlain(plain) {
  const doc = docm.emptyDoc();
  for (const [key, value] of Object.entries(structuredClone(plain))) {
    if (key in doc && doc[key] instanceof Map) doc[key] = new Map(value.map((o) => [o.id, o]));
    else doc[key] = value;
  }
  return doc;
}
// A fingerprint of everything in a drawing (to see that it wasn't changed)
export const fingerprint = (doc) => JSON.stringify(doc, (k, v) => (v instanceof Map ? { map: [...v.entries()] } : v instanceof Set ? { set: [...v] } : v === undefined ? '«undefined»' : Number.isNaN(v) ? '«NaN»' : v));

// --- deep comparison: [path, a, b] for each difference ---
// `absent` is undefined/missing; null counts as absent (olomol treats them alike), and so do the defaults in
// DEFAULTS (a field at its default is left out of the file). Numbers within `eps`.
const DEFAULTS = {
  atoms: { charge: 0, radical: 0, isotope: null, hCount: null, lonePairs: null, color: null, alias: null, bold: false, cipLabel: false, letter: false, autoNumber: false },
  bonds: { stereo: '', side: null, color: null, delocalized: false, bold: false, cipLabel: false, newman: false },
  arrows: { color: null, lengthByHand: false },
  pluses: { color: null },
  texts: { color: null, bold: false, size: 1 },
  curves: { color: null, variant: 0 },
  fills: { color: null },
  brackets: { shape: 'square', sup: '', sub: '', color: null },
  orbitals: { kind: 'p', ref: null, size: 1, phase: 1, color: null, reach: 1 },
  overlaps: { color: null },
};
// (the defaults that depend on the object: a slot on an arrow is 'above', on a molecule 'below')
function defaulted(kind, o) {
  if (kind === 'texts') {
    if (o.anchor != null && o.slot === 'below') return { ...o, slot: undefined };
    if (o.anchor == null && o.arrow != null && o.slot == null) return { ...o, slot: 'above' };
  }
  if (kind === 'atoms' && o.arrow != null && o.arrowSlot == null) return { ...o, arrowSlot: 'above' };
  // (a curved arrow read from a file is drawn by the curve it was saved with, `hint`, until the drawing changes)
  if (kind === 'curves' && o.hint) return { ...o, hint: undefined };
  // (a group's members are a set: a molecule written as one atom of it, read back as all its atoms, in their order)
  if (kind === 'groups') return { ...o, members: [...o.members].sort((p, q) => p - q) };
  return o;
}
export function diffDocs(a, b, eps = 2e-4) {
  const out = [];
  const kinds = [...docm.KINDS, 'groups'];
  for (const kind of kinds) {
    const [ma, mb] = [a[kind] ?? new Map(), b[kind] ?? new Map()];
    for (const id of new Set([...ma.keys(), ...mb.keys()])) {
      if (!ma.has(id) || !mb.has(id)) {
        out.push([`${kind}#${id}`, ma.has(id) ? 'present' : 'absent', mb.has(id) ? 'present' : 'absent']);
        continue;
      }
      diffValue(`${kind}#${id}`, defaulted(kind, ma.get(id)), defaulted(kind, mb.get(id)), out, eps, DEFAULTS[kind] ?? {});
    }
  }
  diffValue('style', a.style ?? null, b.style ?? null, out, eps, {});
  diffValue('keptStyle', a.keptStyle ?? null, b.keptStyle ?? null, out, eps, {});
  diffValue('unknown', a.unknown ?? null, b.unknown ?? null, out, eps, {});
  return out;
}
function diffValue(path, x, y, out, eps, defaults) {
  if (typeof x === 'number' && typeof y === 'number') {
    if (!(Math.abs(x - y) <= eps * Math.max(1, Math.abs(x))) && !(Number.isNaN(x) && Number.isNaN(y))) out.push([path, x, y]);
    return;
  }
  if (x && y && typeof x === 'object' && typeof y === 'object') {
    if (Array.isArray(x) !== Array.isArray(y)) return void out.push([path, x, y]);
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      const [vx, vy] = [norm(x[k], defaults[k]), norm(y[k], defaults[k])];
      if (vx === undefined && vy === undefined) continue;
      diffValue(Array.isArray(x) ? `${path}[${k}]` : `${path}.${k}`, vx, vy, out, eps, {});
    }
    return;
  }
  if (norm(x) !== norm(y)) out.push([path, x, y]);
}
const norm = (v, dflt) => (v === null || v === undefined || (dflt !== undefined && v === dflt) ? undefined : v);

// --- chemistry ---

// The molecules olomol means by a drawing (or the objects with `ids`): labels drawn out, each covalent molecule as
// RDKit's canonical SMILES, sorted; null if RDKit can't read it. `inchi`: InChIs instead.
export async function chemistry(doc, ids = null, { inchi = false } = {}) {
  const { doc: full, ids: all } = await abbreviate.withGroupsDrawnOut(doc, ids);
  const atomIds = all ? all.filter((id) => full.atoms.has(id)) : null;
  if (atomIds && !atomIds.length) return [];
  if (!full.atoms.size) return [];
  const text = molfile.writeMolfile(full, atomIds).molfile;
  const mol = RDKit.get_mol(text, JSON.stringify({ removeHs: true }));
  if (!mol) return null;
  try {
    if (inchi) return [mol.get_inchi()];
    return mol.get_smiles().split('.').sort().concat(['|', ...mol.get_smiles(JSON.stringify({ doIsomericSmiles: false })).split('.').sort()]);
  } finally {
    mol.delete();
  }
}

// --- errors ---

// Is this error a crash (a bug in olomol's code) rather than a refusal with a message for a person?
export function isRaw(error) {
  if (!(error instanceof Error)) return true;
  if (['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'InternalError'].includes(error.name) && !/^not an olomol|^This drawing/.test(error.message)) return true;
  return /Cannot read|Cannot set|undefined|is not a function|is not iterable|of null|Maximum call stack|NaN|\[object Object\]/.test(error.message ?? '');
}
// An error's message without numbers, ids and quoted values: one per kind of failure
export const shape = (message) => String(message ?? '').replace(/\d+(\.\d+)?/g, '#').replace(/"[^"]*"|'[^']*'/g, '"…"').slice(0, 160);
