// Malformed .olom files: valid ones (the examples, generated drawings) mutated, and what olomol does with them.
// It must refuse with a message for a person, or give a drawing it draws, saves, reads again, exports and edits.
import { readdirSync, readFileSync } from 'node:fs';
import { rng } from './rng.mjs';
import { REPO, docm, files, isRaw, olom, sceneMod, shape } from './lib.mjs';

export const EXAMPLES = readdirSync(`${REPO}/src/ui/examples`).filter((f) => f.endsWith('.olom')).sort().map((f) => [f, readFileSync(`${REPO}/src/ui/examples/${f}`, 'utf8')]);

const HUGE = [1e308, -1e308, 1e21, 2 ** 53 + 1, 1e9, -1e9, 1e-320];
const WEIRD = () => [null, true, false, '', 'NaN', 'Infinity', '-1', '2', 'x'.repeat(5000), '🧪', [], {}, [1, 2], { a: { b: [1, { c: null }] } }, -1, 0, 0.5, 1.5, 3, 99999, ...HUGE];

// Every [holder, key] in a JSON value (paths into it), with its depth
function places(value, out = [], depth = 0) {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      out.push([value, Array.isArray(value) ? Number(key) : key, depth]);
      places(value[key], out, depth + 1);
    }
  }
  return out;
}
const idsIn = (file) => Object.values(file).filter(Array.isArray).flatMap((list) => list.map((o) => o?.id).filter((id) => id !== undefined));
const REF_KEYS = ['atoms', 'arrow', 'atom', 'bond', 'orbital', 'newBond', 'orbitals', 'members', 'angleFrom'];

// One mutation of the file (in place); returns what was done, in words
function mutateOnce(file, r) {
  const all = places(file);
  const k = r.int(12);
  const [holder, key] = r.pick(all) ?? [file, 'format'];
  const was = JSON.stringify(holder[key])?.slice(0, 40);
  if (k === 0) {
    if (Array.isArray(holder)) holder.splice(key, 1);
    else delete holder[key];
    return `delete ${key} (${was})`;
  }
  if (k <= 3) {
    holder[key] = r.pick(WEIRD());
    return `${key}: ${was} -> ${JSON.stringify(holder[key])?.slice(0, 40)}`;
  }
  if (k === 4) {
    // a duplicate id
    const lists = Object.values(file).filter((v) => Array.isArray(v) && v.length && v[0]?.id !== undefined);
    const ids = idsIn(file);
    if (!lists.length || !ids.length) return 'nothing';
    const o = r.pick(r.pick(lists));
    if (!o || typeof o !== 'object') return 'nothing';
    const id = r.pick(ids);
    const old = o.id;
    o.id = id;
    return `id ${old} -> ${id} (duplicate)`;
  }
  if (k <= 6) {
    // a reference to something missing, or of another kind
    const refs = all.filter(([h, kk]) => REF_KEYS.includes(kk) || (Array.isArray(h) && typeof h[kk] === 'number' && REF_KEYS.some((name) => all.some(([hh, kkk]) => hh[kkk] === h && kkk === name))));
    if (!refs.length) return 'nothing';
    const [h, kk] = r.pick(refs);
    const ids = idsIn(file);
    const value = r.next() < 0.5 ? r.pick([99999, 0, -3, 1.5, '7', null]) : r.pick(ids);
    const before = JSON.stringify(h[kk]);
    if (Array.isArray(h[kk])) h[kk][r.int(h[kk].length || 1)] = value;
    else h[kk] = value;
    return `ref ${kk}: ${before} -> ${JSON.stringify(h[kk])}`;
  }
  if (k === 7) {
    file.version = r.pick(['1.1', '1.99', '2.0', '0.9', '1', 'abc', 1.0, 2, null, '', '1.0.1', '10.0']);
    return `version -> ${JSON.stringify(file.version)}`;
  }
  if (k === 8) {
    // a number as a huge or odd one
    const numeric = all.filter(([h, kk]) => typeof h[kk] === 'number');
    if (!numeric.length) return 'nothing';
    const [h, kk] = r.pick(numeric);
    h[kk] = r.pick([...HUGE, -0, 1e-9, 0.1 + 0.2]);
    return `${kk}: -> ${h[kk]}`;
  }
  if (k === 9) {
    // a collection as something else, or a record of one in another
    const lists = Object.entries(file).filter(([, v]) => Array.isArray(v));
    if (!lists.length) return 'nothing';
    const [name, list] = r.pick(lists);
    const choice = r.int(4);
    if (choice === 0) file[name] = { ...list };
    else if (choice === 1) file[name] = 'garbage';
    else if (choice === 2) list.push(r.pick([null, 5, 'x', [], { id: 99998 }, { id: 99997, x: 'a', y: null }]));
    else {
      const [other] = r.pick(lists);
      file[other] = [...file[other], structuredClone(r.pick(list))];
    }
    return `collection ${name} (${choice})`;
  }
  if (k === 10) {
    // a place (onArrow, onMolecule, an end) as garbage or empty
    const objects = all.filter(([h, kk]) => ['onArrow', 'onMolecule', 'from', 'to', 'facing', 'style', 'curve', 'tip', 'corners', 'sideArcs', 'lobes'].includes(kk));
    if (!objects.length) return 'nothing';
    const [h, kk] = r.pick(objects);
    h[kk] = r.pick([{}, [], null, 'x', { arrow: null }, { atom: 1e9 }, [[1, 2]], [[1, 'a'], [2, 3]], { slot: 'sideways', arrow: 1 }, [null, null], { angle: 'up' }, [{ id: 5 }], [{ side: 'above', way: 'in', reach: -2 }]]);
    return `${kk} -> ${JSON.stringify(h[kk])}`;
  }
  // a key of another program's, or an unknown one of olomol's
  const objs = all.filter(([h, kk]) => h[kk] && typeof h[kk] === 'object' && !Array.isArray(h[kk]));
  const [h, kk] = objs.length ? r.pick(objs) : [{ x: file }, 'x'];
  h[kk][r.pick(['grader:points', 'newKey', '__proto__', 'constructor', 'toString', 'id'])] = r.pick(WEIRD());
  return `unknown key on ${kk}`;
}

// A mutated file: [text, what was done]
export function mutated(text, seed) {
  const r = rng(seed);
  const file = JSON.parse(text);
  const done = [];
  for (let i = 0, n = 1 + r.int(3); i < n; i++) done.push(mutateOnce(file, r));
  return [JSON.stringify(file), done];
}

const fail = (sig, detail) => ({ sig, detail });
const where = (e) => e?.stack?.split('\n').slice(1, 3).map((l) => l.trim().replace(/^at /, '').replace(`file://${REPO}/`, '')).join(' < ') ?? '';

// What olomol does with a file: a refusal in words, or a drawing that works. [{ sig, detail }]
export async function checkMalformed(text) {
  let doc;
  try {
    ({ doc } = await files.readAny(text, { name: 'x.olom' }));
  } catch (e) {
    return isRaw(e) ? [fail(`read-crash ${shape(e.message)}`, `${e.name}: ${e.message} @ ${where(e)}`)] : [];
  }
  const out = [];
  const step = async (name, fn) => {
    try {
      return await fn();
    } catch (e) {
      out.push(fail(`${name}-crash ${shape(e.message)} @ ${where(e).split(' < ')[0].replace(/:\d+:\d+\)?$/, '')}`, `${e.name}: ${e.message} @ ${where(e)}`));
      return undefined;
    }
  };
  await step('scene', () => sceneMod.buildScene(doc));
  await step('svg', () => files.svgOf(doc, sceneMod.DEFAULT_SETTINGS));
  const written = await step('write', () => olom.writeOlom(doc));
  if (written !== undefined) {
    const again = await step('reread', () => olom.readOlom(written).doc);
    if (again) {
      const twice = await step('rewrite', () => olom.writeOlom(again));
      if (twice !== undefined && twice !== written) out.push(fail('not-a-fixpoint', firstLine(written, twice)));
      // (numbers that aren't: NaN, Infinity written as null)
      if (/\bnull\b/.test(written) && !/\bnull\b/.test(text)) out.push(fail('writes-null', written.split('\n').find((l) => /\bnull\b/.test(l))?.slice(0, 200)));
    }
  }
  for (const format of ['ket', 'mol', 'smiles']) {
    await step(`export-${format}`, async () => {
      try {
        await files.writeAs(doc, format);
      } catch (e) {
        if (isRaw(e)) throw e;
      }
    });
  }
  // editing it as the editor does: all of it copied (into a part, as Copy) and pasted back beside it, one thing
  // deleted, drawn again
  await step('edit', () => {
    const copy = structuredClone(doc);
    const ids = docm.KINDS.flatMap((kind) => [...copy[kind].keys()]);
    const part = docm.emptyDoc();
    docm.copyObjects(copy, ids, 0, 0, part);
    docm.copyObjects(part, docm.KINDS.flatMap((kind) => [...part[kind].keys()]), 1, 1, copy);
    if (ids.length) docm.deleteObjects(copy, [ids[Math.floor(ids.length / 2)]]);
    sceneMod.buildScene(copy);
  });
  // (a drawing whose numbers aren't: NaN coordinates draw nothing and break fitting it in view)
  const bad = [...doc.atoms.values(), ...doc.texts.values(), ...doc.pluses.values()].find((o) => !Number.isFinite(o.x) || !Number.isFinite(o.y))
    ?? [...doc.arrows.values(), ...doc.brackets.values()].find((o) => ![o.x1, o.y1, o.x2, o.y2].every(Number.isFinite));
  if (bad) out.push(fail('non-finite-coordinates', JSON.stringify(bad).slice(0, 200)));
  return out;
}
const firstLine = (a, b) => {
  const [la, lb] = [a.split('\n'), b.split('\n')];
  const k = la.findIndex((l, i) => l !== lb[i]);
  return `-${la[k]?.slice(0, 160)}\n+${lb[k]?.slice(0, 160)}`;
};

// The smallest file that still fails so: collections, items and keys taken out while it does
export async function shrinkFile(text, sig, budget = 40_000) {
  const end = Date.now() + budget;
  let file = JSON.parse(text);
  const still = async (candidate) => (await checkMalformed(JSON.stringify(candidate))).some((f) => f.sig === sig);
  const attempt = async (edit) => {
    if (Date.now() > end) return false;
    const candidate = structuredClone(file);
    if (edit(candidate) === false) return false;
    if (!(await still(candidate))) return false;
    file = candidate;
    return true;
  };
  for (let changed = true; changed && Date.now() < end;) {
    changed = false;
    for (const key of Object.keys(file)) if (!['format', 'version'].includes(key) && await attempt((c) => delete c[key])) changed = true;
    // items of each list, in halves, quarters, … one by one
    for (const key of Object.keys(file).filter((k) => Array.isArray(file[k]))) {
      for (let size = Math.ceil((file[key]?.length ?? 0) / 2); size >= 1; size = size === 1 ? 0 : Math.ceil(size / 2)) {
        for (let start = 0; Array.isArray(file[key]) && start < file[key].length;) {
          if (await attempt((c) => void c[key].splice(start, size))) changed = true;
          else start += size;
        }
      }
    }
    // keys and inner items, deepest last
    const all = places(file).filter(([, , depth]) => depth >= 1).sort((p, q) => p[2] - q[2]);
    for (const [holder, key] of all) {
      const path = pathTo(file, holder, key);
      if (!path) continue;
      if (await attempt((c) => {
        const [h, k] = follow(c, path);
        if (!h || typeof h !== 'object' || !(k in h)) return false;
        if (Array.isArray(h)) h.splice(k, 1);
        else delete h[k];
      })) changed = true;
    }
  }
  return JSON.stringify(file);
}
function pathTo(root, holder, key, path = []) {
  if (root === holder) return [...path, key];
  if (root && typeof root === 'object') {
    for (const k of Object.keys(root)) {
      const found = pathTo(root[k], holder, key, [...path, Array.isArray(root) ? Number(k) : k]);
      if (found) return found;
    }
  }
  return null;
}
const follow = (root, path) => [path.slice(0, -1).reduce((v, k) => v[k], root), path.at(-1)];
