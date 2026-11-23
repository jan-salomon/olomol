// Shrinking a generated drawing that fails a check: objects, molecules, atoms and fields taken away while the
// same failure (its sig) stays.
import { docm, graph } from './lib.mjs';
import { rerun } from './checks.mjs';

// fields that make an object what it is: never taken away
const KEEP = new Set(['id', 'x', 'y', 'el', 'a', 'b', 'order', 'x1', 'y1', 'x2', 'y2', 'text', 'from', 'to', 'electrons', 'atom', 'atoms', 'members', 'kind']);
const DROP_TO = { charge: 0, radical: 0, isotope: null, hCount: null, lonePairs: null, color: null, alias: null, stereo: '', side: null, shape: 'square', sup: '', sub: '', variant: 0, angle: 0, ref: null, size: 1, phase: 1 };

export async function shrinkDoc(doc, failure, budget = 60_000) {
  const end = Date.now() + budget;
  const still = async (candidate) => {
    try {
      return (await rerun(failure, candidate)).some((f) => f.sig === failure.sig);
    } catch {
      return false;
    }
  };
  let current = structuredClone(doc);
  const attempt = async (edit) => {
    if (Date.now() > end) return false;
    const candidate = structuredClone(current);
    try {
      if (edit(candidate) === false) return false;
    } catch {
      return false;
    }
    if (!(await still(candidate))) return false;
    current = candidate;
    return true;
  };
  for (let changed = true; changed && Date.now() < end;) {
    changed = false;
    if (current.groups?.size && await attempt((d) => void (d.groups = new Map()))) changed = true;
    for (const key of ['style', 'keptStyle', 'unknown']) if (current[key] !== undefined && await attempt((d) => delete d[key])) changed = true;
    for (const id of [...(current.groups?.keys() ?? [])]) if (await attempt((d) => d.groups.delete(id))) changed = true;
    // whole kinds, then objects one by one
    for (const kind of ['curves', 'overlaps', 'orbitals', 'fills', 'texts', 'brackets', 'pluses', 'arrows']) {
      if (current[kind].size && await attempt((d) => docm.deleteObjects(d, [...d[kind].keys()]))) changed = true;
      for (const id of [...current[kind].keys()]) if (await attempt((d) => docm.deleteObjects(d, [id]))) changed = true;
    }
    // molecules, then atoms, then bonds
    for (const members of graph.fragments(current)) if (await attempt((d) => docm.deleteObjects(d, members))) changed = true;
    for (const id of [...current.atoms.keys()]) if (current.atoms.has(id) && await attempt((d) => docm.deleteObjects(d, [id]))) changed = true;
    for (const id of [...current.bonds.keys()]) if (current.bonds.has(id) && await attempt((d) => docm.deleteObjects(d, [id]))) changed = true;
    // side arcs
    for (const arrow of current.arrows.values()) if (arrow.sides && await attempt((d) => delete d.arrows.get(arrow.id).sides)) changed = true;
    // fields
    for (const kind of [...docm.KINDS, 'groups']) {
      for (const [id, object] of current[kind] ?? []) {
        for (const key of Object.keys(object)) {
          if (KEEP.has(key)) continue;
          if (await attempt((d) => {
            const o = d[kind].get(id);
            if (key in DROP_TO) {
              if (o[key] === DROP_TO[key]) return false;
              o[key] = DROP_TO[key];
            } else delete o[key];
          })) changed = true;
        }
      }
    }
  }
  // ids from 1 again, in order (a smaller file to read)
  return current;
}
