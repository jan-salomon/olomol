// How a 2D drawing of a molecule looks, by measures of our own (B3):
// points [[x, y]] in the molecule's atom order, bonds [[a, b, order]] by index.
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
function segmentsCross(p, q, r, s) {
  const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
}
export function quality(points, bonds) {
  const lengths = bonds.map(([a, b]) => dist(points[a], points[b]));
  const mean = lengths.reduce((s, v) => s + v, 0) / (lengths.length || 1);
  const sd = Math.sqrt(lengths.reduce((s, v) => s + (v - mean) ** 2, 0) / (lengths.length || 1));
  const med = [...lengths].sort((x, y) => x - y)[Math.floor(lengths.length / 2)] || 1;
  const bonded = new Set(bonds.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  let clashes = 0;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (!bonded.has(`${i}-${j}`) && dist(points[i], points[j]) < 0.4 * med) clashes += 1;
  let crossings = 0;
  for (let i = 0; i < bonds.length; i++) {
    for (let j = i + 1; j < bonds.length; j++) {
      const [a, b] = bonds[i];
      const [c, d] = bonds[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(points[a], points[b], points[c], points[d])) crossings += 1;
    }
  }
  // angles: round an atom with n ≥ 3 bonds, 360°/n between neighbouring bonds; with 2 bonds, the interior angle
  // of the smallest ring through both (180° − 360°/size), else 120° (180° at a triple bond or C=C=C)
  const near = points.map(() => []);
  for (const [a, b, order] of bonds) {
    near[a].push([b, order]);
    near[b].push([a, order]);
  }
  const pathAvoiding = (from, to, avoid) => {
    const seen = new Map([[from, 0]]);
    const queue = [from];
    while (queue.length) {
      const at = queue.shift();
      if (at === to) return seen.get(at);
      for (const [n] of near[at]) if (n !== avoid && !seen.has(n)) { seen.set(n, seen.get(at) + 1); queue.push(n); }
    }
    return null;
  };
  let off = 0;
  let counted = 0;
  for (let i = 0; i < points.length; i++) {
    const n = near[i].length;
    if (n < 2) continue;
    const angles = near[i].map(([j]) => Math.atan2(points[j][1] - points[i][1], points[j][0] - points[i][0])).sort((x, y) => x - y);
    if (n === 2) {
      const between = Math.abs(((angles[1] - angles[0]) * 180) / Math.PI);
      const angle = Math.min(between, 360 - between);
      const path = pathAvoiding(near[i][0][0], near[i][1][0], i);
      const linear = near[i].some(([, o]) => o === 3) || near[i].every(([, o]) => o === 2);
      const ideal = path !== null ? 180 - 360 / (path + 2) : linear ? 180 : 120;
      off += Math.abs(angle - ideal);
    } else {
      const gaps = angles.map((a, k) => (((k + 1 < n ? angles[k + 1] : angles[0] + 2 * Math.PI) - a) * 180) / Math.PI);
      off += gaps.reduce((s, g) => s + Math.abs(g - 360 / n), 0) / n;
    }
    counted += 1;
  }
  const angleDev = counted ? off / counted : 0;
  const cv = mean ? sd / mean : 0;
  return { cv: round(cv, 4), clashes, crossings, angleDev: round(angleDev, 2), problems: clashes + crossings, irregularity: round(cv / 0.05 + angleDev / 10, 3) };
}
export const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
// a is better than b: fewer clashes and crossings, else less irregular (by more than 0.05: twins and near-twins tie)
export const better = (a, b) => (a.problems !== b.problems ? a.problems < b.problems : a.irregularity < b.irregularity - 0.05);


