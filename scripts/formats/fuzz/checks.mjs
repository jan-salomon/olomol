// The invariants every drawing must keep, each a check that returns its failures: [{ sig, detail }] (sig: what
// kind of failure, the same for every drawing it happens in; detail: this drawing's).
import { RDKit, chemistry, diffDocs, docm, files, fingerprint, isRaw, lost, olom, sceneMod, shape } from './lib.mjs';

export const FORMATS = ['mol', 'sdf', 'smiles', 'inchi', 'ket', 'rxn', 'cdxml'];
const EXT = { mol: 'mol', sdf: 'sdf', smiles: 'smi', inchi: 'txt', ket: 'ket', rxn: 'rxn', cdxml: 'cdxml' };

const fail = (sig, detail) => ({ sig, detail });
const errText = (e) => `${e?.name}: ${e?.message}`;

// (a) .olom written, read and written again: the same text, the same drawing; every field named
export function checkOlom(doc) {
  const out = [];
  const before = fingerprint(doc);
  let text;
  const unmapped = new Set();
  try {
    text = olom.writeOlom(doc, { unmapped, ownStyle: true });
  } catch (e) {
    return [fail(`olom-write-crash ${shape(e.message)}`, errText(e))];
  }
  if (fingerprint(doc) !== before) out.push(fail('olom-write-mutates', ''));
  if (unmapped.size) out.push(fail(`olom-unmapped ${[...unmapped].sort().join(',')}`, [...unmapped].join(',')));
  let back;
  try {
    back = olom.readOlom(text).doc;
  } catch (e) {
    return [...out, fail(`olom-read-crash ${shape(e.message)}`, errText(e))];
  }
  const again = olom.writeOlom(back, { ownStyle: true });
  if (again !== text) {
    const [l1, l2] = [text.split('\n'), again.split('\n')];
    const k = l1.findIndex((line, i) => line !== l2[i]);
    out.push(fail(`olom-text-unstable ${shape((l1[k] ?? '').replace(/[\d.-]+/g, '#')).slice(0, 60)}`, `-${l1[k]}\n+${l2[k]}`));
  }
  const diffs = diffDocs(doc, back);
  // (nextId and what the reader keeps for writing back: not compared; the rest must be)
  for (const [path, a, b] of diffs) out.push(fail(`olom-model-diff ${path.replace(/#\d+/g, '#').replace(/\[\d+\]/g, '[]')}`, `${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`));
  return out;
}

// (b) drawn before and after reading back, and as an SVG
export function checkScene(doc, label = 'scene') {
  try {
    sceneMod.buildScene(doc);
  } catch (e) {
    return [fail(`${label}-crash ${shape(e.message)}`, `${errText(e)}\n${e.stack?.split('\n').slice(1, 3).join('\n')}`)];
  }
  try {
    files.svgOf(doc, sceneMod.DEFAULT_SETTINGS);
  } catch (e) {
    return [fail(`${label}-svg-crash ${shape(e.message)}`, `${errText(e)}\n${e.stack?.split('\n').slice(1, 3).join('\n')}`)];
  }
  return [];
}
export function checkSceneAfterRead(doc) {
  let back;
  try {
    back = olom.readOlom(olom.writeOlom(doc)).doc;
  } catch {
    return []; // (checkOlom says)
  }
  return checkScene(back, 'scene-after-read');
}

// What of a drawing a file keeps or loses, by the kinds lostIn names: kind -> how many
function features(doc) {
  const bonds = [...doc.bonds.values()];
  const units = new Set(docm.repeatingUnits(doc).map(({ bracket }) => bracket.id));
  const coloured = [...doc.atoms.values(), ...bonds].filter((o) => o.color || o.highlight).length
    + ['arrows', 'pluses', 'texts', 'curves', 'brackets'].reduce((n, kind) => n + [...doc[kind].values()].filter((o) => o.color).length, 0) + doc.fills.size;
  return {
    'curved arrows': doc.curves.size,
    'lone pairs': [...doc.atoms.values()].filter((a) => !a.alias && (a.lonePairs === 'auto' || a.lonePairs > 0)).length,
    'lone pairs on abbreviations': [...doc.atoms.values()].filter((a) => a.alias && (a.lonePairs === 'auto' || a.lonePairs > 0)).length,
    orbitals: doc.orbitals.size,
    texts: doc.texts.size,
    brackets: [...doc.brackets.values()].filter((b) => !units.has(b.id)).length,
    'repeating units (n)': units.size,
    // (a "+" without an arrow is no reaction: nothing a structure file has a place for; the arrows that make a
    // reaction, lost.js REACTION_ARROWS, apart from the others, which a file of one reaction leaves out)
    'arrows and +': [...doc.arrows.values()].filter((a) => lost.REACTION_ARROWS.includes(a.kind)).length + (doc.arrows.size ? doc.pluses.size : 0),
    "arrows other than the reaction's": [...doc.arrows.values()].filter((a) => !lost.REACTION_ARROWS.includes(a.kind)).length,
    colours: coloured,
    'hydrogen bonds': bonds.filter((b) => b.kind === 'hbond').length,
    'partial bonds': bonds.filter((b) => b.kind === 'partial').length,
    'dative bonds': bonds.filter((b) => b.kind === 'dative').length,
  };
}

// (c), (d): every structure format written; a refusal with a message for a person, never a crash; the drawing
// passed in unchanged; read back, the same molecules, and what is lost said by lostIn. `ids`: a part only (e).
export async function checkExport(doc, format, ids = null) {
  const out = [];
  const tag = ids ? `${format}-part` : format;
  const before = fingerprint(doc);
  let text;
  try {
    text = await files.writeAs(doc, format, ids);
  } catch (e) {
    if (fingerprint(doc) !== before) out.push(fail(`export-mutates ${tag}`, 'on a refusal'));
    out.push(fail(`${isRaw(e) ? 'export-crash' : 'export-refused'} ${tag} ${shape(e.message)}`, errText(e)));
    return out;
  }
  if (fingerprint(doc) !== before) out.push(fail(`export-mutates ${tag}`, firstChange(before, fingerprint(doc))));
  const atomsIn = ids ? ids.filter((id) => doc.atoms.has(id)).length : doc.atoms.size;
  if (typeof text !== 'string' || !text.trim()) return atomsIn ? [...out, fail(`export-empty ${tag}`, JSON.stringify(text))] : out;
  if (format === 'smiles' && /->|<-|~|\{|\||\$/.test(text)) out.push(fail(`smiles-nonstandard ${shape(text.match(/->|<-|~|\{|\||\$/)[0])}`, text));
  if (format === 'ket' && ids) out.push(...ketReferences(text));
  let back;
  try {
    back = (await files.readAny(text, { name: `back.${EXT[format]}` })).doc;
  } catch (e) {
    return [...out, fail(`readback-${isRaw(e) ? 'crash' : 'refused'} ${tag} ${shape(e.message)}`, `${errText(e)}\n--- file:\n${text.slice(0, 400)}`)];
  }
  // the molecules
  const inchi = format === 'inchi';
  const [want, got] = [await chemistry(doc, ids, { inchi }), await chemistry(back, null, { inchi })];
  if (want && got && JSON.stringify(want) !== JSON.stringify(got)) {
    // how: molecules missing, stereo lost (the same without it), or other
    const flat = (list) => list.slice(list.indexOf('|') + 1);
    const iso = (list) => list.slice(0, list.indexOf('|'));
    const missing = (a, b) => { const rest = [...b]; return a.filter((s) => { const k = rest.indexOf(s); if (k < 0) return true; rest.splice(k, 1); return false; }); };
    const how = inchi ? 'inchi' : JSON.stringify(flat(want)) === JSON.stringify(flat(got)) ? 'stereo-or-isotope'
      : !missing(iso(got), iso(want)).length && missing(iso(want), iso(got)).length ? 'molecules-missing' : 'different';
    out.push(fail(`chemistry-changed ${tag} ${how}`, `meant: ${iso(want).join(' . ')}\nread back: ${iso(got).join(' . ')}\nfile: ${text.slice(0, 300)}`));
  } else if (want && !got) out.push(fail(`chemistry-unreadable-after ${tag}`, `meant: ${want.join(' . ')}\nfile: ${text.slice(0, 300)}`));
  // what it lost, said?
  const part = ids ? partOf(doc, ids) : doc;
  const said = new Set(lost.lostIn(doc, format, ids));
  const [had, has] = [features(part), features(back)];
  for (const [what, n] of Object.entries(had)) {
    // (all arrows left out, said as such: the other arrows with them)
    const saidAll = (what === "arrows other than the reaction's" && said.has('arrows and +')) || (what === 'lone pairs on abbreviations' && said.has('lone pairs'));
    if (n > 0 && has[what] < n && !said.has(what) && !saidAll) out.push(fail(`lost-unsaid ${tag} ${what}`, `${what}: ${n} -> ${has[what]}`));
  }
  return out;
}
const firstChange = (a, b) => {
  let k = 0;
  while (k < a.length && a[k] === b[k]) k++;
  return `…${a.slice(Math.max(0, k - 80), k + 60)}\n…${b.slice(Math.max(0, k - 80), k + 60)}`;
};
// The objects with `ids` and what goes with them, as a drawing (for counting what a part has)
function partOf(doc, ids) {
  const part = olom.readOlom(olom.toOlom(doc, { ids })).doc;
  return part;
}
// KET: every $ref names a node there, every atom index of a bond is in its molecule
function ketReferences(text) {
  const out = [];
  const ket = JSON.parse(text);
  for (const node of ket.root?.nodes ?? []) {
    if (node.$ref && !ket[node.$ref]) out.push(fail('ket-part-dangling-ref', node.$ref));
  }
  for (const [key, value] of Object.entries(ket)) {
    if (value?.type !== 'molecule') continue;
    const n = value.atoms?.length ?? 0;
    for (const bond of value.bonds ?? []) if (bond.atoms.some((i) => !(i >= 0 && i < n))) out.push(fail('ket-part-bond-outside', `${key}: ${JSON.stringify(bond.atoms)} of ${n}`));
    for (const group of value.sgroups ?? []) for (const i of group.atoms ?? []) if (!(i >= 0 && i < n)) out.push(fail('ket-part-sgroup-outside', `${key}: ${i} of ${n}`));
  }
  return out;
}

// (e) a part saved as .olom: every reference in it to something in it
export function checkOlomPart(doc, ids) {
  let file;
  try {
    file = olom.toOlom(doc, { ids });
  } catch (e) {
    return [fail(`olom-part-crash ${shape(e.message)}`, errText(e))];
  }
  const out = [];
  const present = new Set();
  const lists = ['atoms', 'bonds', 'together', 'reactionArrows', 'plusSigns', 'texts', 'electronArrows', 'ringFills', 'brackets', 'orbitals', 'orbitalOverlaps', 'groups'];
  for (const key of lists) for (const o of file[key] ?? []) {
    present.add(o.id);
    for (const arc of o.sideArcs ?? []) present.add(arc.id);
  }
  const refs = [];
  for (const b of [...(file.bonds ?? []), ...(file.together ?? [])]) refs.push(['bond.atoms', ...b.atoms]);
  for (const a of file.atoms ?? []) if (a.onArrow) refs.push(['atom.onArrow', a.onArrow.arrow]);
  for (const t of file.texts ?? []) {
    if (t.onArrow) refs.push(['text.onArrow', t.onArrow.arrow]);
    if (t.onMolecule) refs.push(['text.onMolecule', t.onMolecule.atom]);
  }
  for (const c of file.electronArrows ?? []) for (const end of [c.from, c.to]) for (const k of ['atom', 'bond', 'orbital', 'newBond']) if (end[k] !== undefined) refs.push([`curve.${k}`, end[k]]);
  for (const f of file.ringFills ?? []) refs.push(['fill.atoms', ...f.atoms]);
  for (const b of file.brackets ?? []) if (b.atoms) refs.push(['bracket.atoms', ...b.atoms]);
  for (const o of file.orbitals ?? []) refs.push(['orbital.atom', o.atom], ...(o.angleFrom !== undefined ? [['orbital.angleFrom', o.angleFrom]] : []));
  for (const o of file.orbitalOverlaps ?? []) refs.push(['overlap.orbitals', ...o.orbitals]);
  for (const g of file.groups ?? []) refs.push(['group.members', ...g.members]);
  for (const [what, ...ids2] of refs) for (const id of ids2) if (!present.has(id)) out.push(fail(`olom-part-dangling ${what}`, `${what} -> ${id}`));
  return out;
}

// A part of the drawing as a person would select it: a molecule or two (atoms and bonds), maybe an arrow, a text,
// a curved arrow
export function pickPart(doc, r) {
  const molecules = [];
  const all = [];
  const byAtom = docm.bondsByAtom(doc);
  const seen = new Set();
  for (const id of doc.atoms.keys()) {
    if (seen.has(id)) continue;
    const members = [];
    for (const stack = [id]; stack.length;) {
      const a = stack.pop();
      if (seen.has(a)) continue;
      seen.add(a);
      members.push(a);
      for (const b of byAtom.get(a)) if (b.kind !== 'link') stack.push(docm.otherEnd(b, a));
    }
    molecules.push(members);
  }
  for (const m of r.shuffle(molecules).slice(0, 1 + r.int(2))) {
    all.push(...m);
    for (const b of doc.bonds.values()) if (m.includes(b.a) && m.includes(b.b)) all.push(b.id);
  }
  for (const kind of ['arrows', 'texts', 'curves', 'pluses', 'brackets']) {
    const ids = [...doc[kind].keys()];
    if (ids.length && r.next() < 0.4) all.push(r.pick(ids));
  }
  return all;
}

// All the checks of a generated drawing: [{ sig, detail, check, format? }]
export async function checkAll(doc, r) {
  const out = [];
  const tagged = (check, format, list) => list.map((f) => ({ ...f, check, format }));
  out.push(...tagged('olom', null, checkOlom(doc)));
  out.push(...tagged('scene', null, checkScene(doc)));
  out.push(...tagged('sceneAfterRead', null, checkSceneAfterRead(doc)));
  for (const format of FORMATS) out.push(...tagged('export', format, await checkExport(doc, format)));
  const ids = pickPart(doc, r);
  if (ids.length) {
    out.push(...tagged('olomPart', null, checkOlomPart(doc, ids)).map((f) => ({ ...f, ids })));
    for (const format of ['ket', 'mol', 'smiles']) out.push(...tagged('exportPart', format, await checkExport(doc, format, ids)).map((f) => ({ ...f, ids })));
  }
  return out;
}

// One check again (for shrinking): its failures' sigs
export async function rerun({ check, format, ids }, doc) {
  const keep = ids?.filter((id) => docm.kindOf(doc, id) || [...doc.arrows.values()].some((a) => a.sides?.some((s) => s.id === id)));
  switch (check) {
    case 'olom': return checkOlom(doc);
    case 'scene': return checkScene(doc);
    case 'sceneAfterRead': return checkSceneAfterRead(doc);
    case 'export': return checkExport(doc, format);
    case 'olomPart': return checkOlomPart(doc, keep);
    case 'exportPart': return checkExport(doc, format, keep);
    default: return [];
  }
}
export { RDKit };
