// Λ and Δ: the handedness of an octahedral complex with two or three
// chelates on two donors each ([Co(en)3]3+, cis-[CoCl2(en)2]+), as drawn: the
// bonds to the metal across, up and, by their wedges, towards the viewer or
// away (as asDrawn in threeD.js reads them). The donors are put on an ideal
// octahedron, each where the drawing's angles say (a chelate's two donors
// next to each other), the mirror image where the drawing's handedness says
// so; then IUPAC's rule for two skew lines (IR-9.3.4.11): each chelate's
// line through its two donors, the two a helix about their common normal,
// Δ if it is right-handed, Λ if left-handed. A drawing without wedges at its
// metal says neither.
import { bondsByAtom, otherEnd } from '../model/doc.js';
import { permutations } from '../layout/geometry.js';

const VERTICES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => a.map((v) => v / (Math.hypot(...a) || 1));
const volume = (u, v, w) => dot(u, cross(v, w));

// The helicity of two chelates' lines (donor points): +1 right-handed (Δ), −1 left-handed (Λ), 0 neither
// (parallel, crossing or at right angles). IUPAC: the first line the axis of a helix, the second a tangent
// to it where their common normal meets it. A right-handed helix about u, at r (from the axis to the
// point), runs along u × r and forward along u: the tangent v has v·(u × r) and v·u of one sign.
export function helicity([a1, a2], [b1, b2]) {
  const [u, v] = [sub(a2, a1), sub(b2, b1)];
  const normal = cross(u, v);
  if (Math.hypot(...normal) < 1e-6) return 0;
  const apart = dot(sub(b1, a1), normal); // (r along the normal, + or −: then v·(u × r) has the other sign)
  const along = dot(u, v);
  return Math.abs(apart) < 1e-6 || Math.abs(along) < 1e-6 ? 0 : -Math.sign(apart * along);
}

// Map metal atom id -> 'Λ' | 'Δ' for the complexes among `atomIds` (or all) that have one.
export function complexHandedness(doc, atomIds = null) {
  const wanted = atomIds ? new Set(atomIds) : null;
  const byAtom = bondsByAtom(doc);
  const result = new Map();
  const bonded = (b) => b.kind !== 'hbond' && b.kind !== 'link';
  for (const metal of doc.atoms.values()) {
    if (wanted && !wanted.has(metal.id)) continue;
    const bonds = byAtom.get(metal.id).filter(bonded);
    if (bonds.length !== 6) continue;
    const donors = bonds.map((b) => otherEnd(b, metal.id));
    if (new Set(donors).size !== 6) continue;
    // the chelates: donors joined other than through the metal, two to a ligand
    const piece = new Map();
    donors.forEach((d) => {
      if (piece.has(d)) return;
      const seen = new Set([d]);
      const stack = [d];
      while (stack.length) {
        const x = stack.pop();
        for (const b of byAtom.get(x)) {
          const to = otherEnd(b, x);
          if (!bonded(b) || to === metal.id || seen.has(to)) continue;
          seen.add(to);
          stack.push(to);
        }
      }
      const own = donors.filter((x) => seen.has(x));
      for (const x of own) piece.set(x, own);
    });
    const chelates = [...new Set([...piece.values()])].filter((own) => own.length === 2).map((own) => own.map((d) => donors.indexOf(d)));
    if (chelates.length < 2 || [...new Set(piece.values())].some((own) => own.length > 2)) continue;
    // the bonds as drawn: across, up, and towards the viewer for a wedge (its narrow end at the metal)
    const drawn = bonds.map((b, k) => {
      const d = doc.atoms.get(donors[k]);
      const fromMetal = b.kind === 'dative' ? b.b === metal.id : b.a === metal.id;
      const depth = b.stereo === 'wedge' || b.stereo === 'hash' ? (b.stereo === 'wedge' ? 1 : -1) * (fromMetal ? 1 : -1) : 0;
      return [d.x - metal.x, metal.y - d.y, depth];
    });
    if (drawn.every((v) => v[2] === 0)) continue;
    // the donors on the octahedron where the drawing's angles fit best (a chelate's two donors cis)
    const cosines = drawn.map((u) => drawn.map((v) => dot(unit(u), unit(v))));
    let best = null;
    for (const order of permutations(6)) {
      if (chelates.some(([i, j]) => dot(VERTICES[order[i]], VERTICES[order[j]]) < -0.5)) continue;
      let cost = 0;
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) cost += (cosines[i][j] - dot(VERTICES[order[i]], VERTICES[order[j]])) ** 2;
      if (!best || cost < best.cost) best = { cost, order };
    }
    if (!best) continue;
    let ideal = best.order.map((v) => VERTICES[v]);
    // the octahedron's mirror image where the drawing's handedness says so
    let agreement = 0;
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) agreement += volume(drawn[i], drawn[j], drawn[k]) * volume(ideal[i], ideal[j], ideal[k]);
    if (Math.abs(agreement) < 1e-6) continue;
    if (agreement < 0) ideal = ideal.map(([x, y, z]) => [x, y, -z]);
    let sum = 0;
    for (let p = 0; p < chelates.length; p++) {
      for (let q = p + 1; q < chelates.length; q++) sum += helicity(chelates[p].map((i) => ideal[i]), chelates[q].map((i) => ideal[i]));
    }
    if (sum) result.set(metal.id, sum > 0 ? 'Δ' : 'Λ');
  }
  return result;
}
