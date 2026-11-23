// An olomol drawing (src/model/doc.js: Maps of objects by id) as plain JSON
// and back, for the results files and the report, which draws it with
// olomol's own renderer.
const round = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v);

export function docToJSON(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (value instanceof Map) {
      if (value.size) out[key] = [...value.values()].map((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, round(v)])));
    } else out[key] = value;
  }
  return out;
}

const KINDS = ['atoms', 'bonds', 'arrows', 'pluses', 'texts', 'curves', 'fills', 'brackets', 'orbitals', 'overlaps'];

export function docFromJSON(json) {
  const doc = { nextId: json.nextId ?? 1 };
  for (const kind of KINDS) doc[kind] = new Map((json[kind] ?? []).map((o) => [o.id, { ...o }]));
  // (atoms and bonds as addAtom and addBond make them: the fields left out above were null)
  for (const atom of doc.atoms.values()) {
    atom.charge ??= 0;
    atom.radical ??= 0;
    for (const key of ['isotope', 'hCount', 'lonePairs', 'color', 'alias']) atom[key] ??= null;
  }
  for (const bond of doc.bonds.values()) {
    bond.stereo ??= '';
    bond.side ??= null;
    bond.color ??= null;
  }
  for (const curve of doc.curves.values()) curve.color ??= null;
  return doc;
}
