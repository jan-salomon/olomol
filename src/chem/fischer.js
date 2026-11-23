// Fischer projections drawn by hand, read as such only when the user says so. A centre (atom.projection =
// 'fischer') is a crossing: a carbon with four single bonds, one going left, one right, one up and one down
// (each within 15°); its horizontal bonds come towards the viewer, its vertical ones go away (projectionStereo
// in projections.js). olomol reads no stereo into a drawing by its shape: a crossing is a centre only when a
// template made it one, the user chose Fischer projection in the panel (readAsFischer), or it was drawn onto a
// chain the user said is one (keepFischer: straight above or below a centre). A centre that is no longer a
// crossing, or whose chain now lies on its side, is no centre any more (keepFischer), and the editor says so.
import { bondsByAtom, otherEnd } from '../model/doc.js';

const SKEW = Math.sin((15 * Math.PI) / 180);

// which way `other` lies from `atom`: left, right, up, down (within 15°), or null
function way(atom, other) {
  const [dx, dy] = [other.x - atom.x, other.y - atom.y];
  const n = Math.hypot(dx, dy);
  if (n && Math.abs(dy) <= SKEW * n) return dx < 0 ? 'left' : 'right';
  if (n && Math.abs(dx) <= SKEW * n) return dy < 0 ? 'up' : 'down';
  return null;
}

// The atom `id` as a crossing: { left, right, up, down } (the atom each way), or null if it is none
export function crossing(doc, id, byAtom = bondsByAtom(doc)) {
  const atom = doc.atoms.get(id);
  if (!atom || atom.el !== 'C' || atom.alias) return null;
  const bonds = byAtom.get(id) ?? [];
  if (bonds.length !== 4 || bonds.some((b) => b.order !== 1 || b.stereo || b.kind || b.newman)) return null;
  const ways = {};
  for (const bond of bonds) {
    const other = otherEnd(bond, id);
    const w = way(atom, doc.atoms.get(other));
    if (!w || ways[w] != null) return null;
    ways[w] = other;
  }
  return ways;
}

const isCentre = (doc, id) => doc.atoms.get(id)?.projection === 'fischer';

// The crossings among `ids` that could be read as a Fischer projection's centres, and those that can't: a
// crossing next to another one on its left or right (its chain lies on its side: the vertical bonds of a
// Fischer projection are the chain's)
export function fischerCandidates(doc, ids) {
  const byAtom = bondsByAtom(doc);
  const crossings = new Map(ids.map((id) => [id, crossing(doc, id, byAtom)]).filter(([, ways]) => ways));
  const sideways = (id) => {
    const { left, right } = crossings.get(id);
    return [left, right].some((other) => crossings.has(other) || isCentre(doc, other));
  };
  const ok = [...crossings.keys()].filter((id) => !sideways(id));
  return { ok, sideways: [...crossings.keys()].filter((id) => sideways(id)) };
}

// The centres among `ids` (and the rest of each one's chain: the centres straight above and below it)
export function fischerChains(doc, ids) {
  const byAtom = bondsByAtom(doc);
  const found = new Set(ids.filter((id) => isCentre(doc, id)));
  const queue = [...found];
  while (queue.length) {
    const ways = crossing(doc, queue.pop(), byAtom);
    for (const next of ways ? [ways.up, ways.down] : []) {
      if (isCentre(doc, next) && !found.has(next)) {
        found.add(next);
        queue.push(next);
      }
    }
  }
  return [...found];
}

// Read the crossings among `ids` as a Fischer projection's centres (`on`), or the projection(s) they are in as
// a drawing again. Returns how many centres were made or unmade, and how many crossings were refused (on their
// side).
export function readAsFischer(doc, ids, on) {
  if (!on) {
    const chains = fischerChains(doc, ids);
    for (const id of chains) delete doc.atoms.get(id).projection;
    return { changed: chains.length, sideways: 0 };
  }
  const { ok, sideways } = fischerCandidates(doc, ids);
  for (const id of ok) doc.atoms.get(id).projection = 'fischer';
  return { changed: ok.length, sideways: sideways.length };
}

// After each change: a centre no longer a crossing, or whose chain was turned onto its side (what was above or
// below it is now left or right of it), is a centre no more; a crossing drawn straight above or below a centre
// becomes one (the chain was said to be a Fischer projection). Returns { dropped, grown } (counts).
const seen = new WeakMap(); // a centre's atom -> the atoms above and below it, when last looked at
export function keepFischer(doc) {
  let centres = [...doc.atoms.values()].filter((a) => a.projection === 'fischer');
  if (!centres.length) return { dropped: 0, grown: 0 };
  const byAtom = bondsByAtom(doc);
  let dropped = 0;
  for (const atom of centres) {
    const ways = crossing(doc, atom.id, byAtom);
    const was = seen.get(atom);
    if (!ways || (was && was.some((id) => id === ways.left || id === ways.right))) {
      delete atom.projection;
      seen.delete(atom);
      dropped += 1;
    }
  }
  let grown = 0;
  for (let more = true; more;) {
    more = false;
    for (const atom of doc.atoms.values()) {
      if (atom.projection) continue;
      const ways = crossing(doc, atom.id, byAtom);
      if (ways && (isCentre(doc, ways.up) || isCentre(doc, ways.down))) {
        atom.projection = 'fischer';
        grown += 1;
        more = true;
      }
    }
  }
  centres = [...doc.atoms.values()].filter((a) => a.projection === 'fischer');
  for (const atom of centres) {
    const ways = crossing(doc, atom.id, byAtom);
    seen.set(atom, [ways.up, ways.down]);
  }
  return { dropped, grown };
}

// The Fischer projection (or the chain of crossings that could be one) at `hit` (an atom or a bond: a crossing,
// a group on one, or a bond of one): its crossings, straight above and below each other, and its spine, the
// vertical bonds along them (to the chain's ends too). `read`: all its crossings are centres; `sideways`: one
// has another crossing left or right of it (a chain lying on its side). null: no crossing there.
export function fischerSpine(doc, hit, byAtom = bondsByAtom(doc)) {
  const starts = [];
  if (hit?.kind === 'bond' && doc.bonds.has(hit.id)) starts.push(doc.bonds.get(hit.id).a, doc.bonds.get(hit.id).b);
  else if (hit?.kind === 'atom' && doc.atoms.has(hit.id)) starts.push(hit.id, ...(byAtom.get(hit.id) ?? []).map((b) => otherEnd(b, hit.id)));
  const first = starts.find((id) => crossing(doc, id, byAtom));
  if (first == null) return null;
  const ways = new Map([[first, crossing(doc, first, byAtom)]]);
  const queue = [first];
  while (queue.length) {
    const { up, down } = ways.get(queue.pop());
    for (const next of [up, down]) {
      if (ways.has(next)) continue;
      const w = crossing(doc, next, byAtom);
      if (w) {
        ways.set(next, w);
        queue.push(next);
      }
    }
  }
  const centres = [...ways.keys()];
  const bonds = new Set();
  for (const [id, { up, down }] of ways) {
    for (const bond of byAtom.get(id)) if ([up, down].includes(otherEnd(bond, id))) bonds.add(bond.id);
  }
  const sideways = [...ways.values()].some(({ left, right }) => [left, right].some((id) => crossing(doc, id, byAtom)));
  return { centres, bonds: [...bonds], read: centres.every((id) => isCentre(doc, id)), sideways };
}

// The Fischer projections in a drawing (their centres marked): Map (each of their atoms, the groups on them,
// and their bonds -> the spine's bonds), for lighting the spine when one of them is pointed at
export function fischerSpines(doc) {
  const byAtom = bondsByAtom(doc);
  const spines = new Map();
  for (const atom of doc.atoms.values()) {
    if (atom.projection !== 'fischer' || spines.has(atom.id)) continue;
    const spine = fischerSpine(doc, { kind: 'atom', id: atom.id }, byAtom);
    if (!spine) continue;
    for (const id of spine.centres) {
      spines.set(id, spine.bonds);
      for (const bond of byAtom.get(id)) {
        spines.set(bond.id, spine.bonds);
        if (!spines.has(otherEnd(bond, id))) spines.set(otherEnd(bond, id), spine.bonds);
      }
    }
  }
  return spines;
}
