// 2D helpers on arrays of [x, y] points.

export function centroid(points) {
  const sum = points.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

// pairs: [[i, j], ...] indices into points (the bonds). NaN if there are none.
export function medianBondLength(points, pairs) {
  const lengths = pairs
    .map(([i, j]) => Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]))
    .sort((p, q) => p - q);
  return lengths.length ? lengths[Math.floor(lengths.length / 2)] : NaN;
}

// Root-mean-square distance between two drawings of the same atoms, after
// moving both to their centroids and rotating `a` onto `b` (no mirroring).
export function rmsdAfterRotation(a, b) {
  const [ax, ay] = centroid(a);
  const [bx, by] = centroid(b);
  const p = a.map(([x, y]) => [x - ax, y - ay]);
  const q = b.map(([x, y]) => [x - bx, y - by]);
  let dot = 0;
  let cross = 0;
  p.forEach(([x, y], i) => {
    dot += x * q[i][0] + y * q[i][1];
    cross += x * q[i][1] - y * q[i][0];
  });
  const angle = Math.atan2(cross, dot);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const sum = p.reduce((s, [x, y], i) => s + (x * cos - y * sin - q[i][0]) ** 2 + (x * sin + y * cos - q[i][1]) ** 2, 0);
  return Math.sqrt(sum / p.length);
}

// Drawing problems worth pointing out: bonds that cross other bonds, and
// atoms closer than 0.4 bond lengths to each other.
export function layoutProblems(points, pairs) {
  const tooClose = 0.4 * (medianBondLength(points, pairs) || 1);
  const side = ([ax, ay], [bx, by], [cx, cy]) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  let crossings = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a, b] = pairs[i];
      const [c, d] = pairs[j];
      if (a === c || a === d || b === c || b === d) continue; // bonds sharing an atom
      const [p, q, r, s] = [points[a], points[b], points[c], points[d]];
      if (side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0) crossings += 1;
    }
  }
  let overlaps = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) < tooClose) overlaps += 1;
    }
  }
  return { crossings, overlaps };
}

// Distance from point p to the line segment from a to b.
export function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Every order of 0 … n−1 (Heap's algorithm; n ≤ 8: at most 40320), each as a new array: the ways donors can sit
// on a polyhedron's corners (threeD.js, complex3D.js), or atoms on an octahedron's (handedness.js).
export function* permutations(n) {
  const order = Array.from({ length: n }, (_, k) => k);
  const c = new Array(n).fill(0);
  yield [...order];
  for (let i = 1; i < n;) {
    if (c[i] < i) {
      const j = i % 2 ? c[i] : 0;
      [order[j], order[i]] = [order[i], order[j]];
      yield [...order];
      c[i] += 1;
      i = 1;
    } else {
      c[i] = 0;
      i += 1;
    }
  }
}

// The small turn (degrees, within ±15°) that puts the most bonds of a drawing on the 30° grid, as drawings in
// books lie: each bond counts by how near it is to a multiple of 30° (a Gaussian of 2°), and of turns that do
// as well the smallest wins. 0 for a drawing with no bond. `points` [[x, y]], `pairs` [[a, b]] by index.
export function gridTurn(points, pairs) {
  const angles = pairs.map(([a, b]) => (Math.atan2(points[b][1] - points[a][1], points[b][0] - points[a][0]) * 180) / Math.PI);
  if (!angles.length) return 0;
  let best = 0;
  let bestScore = -Infinity;
  for (let t = -15; t <= 15; t += 0.25) {
    const score = angles.reduce((s, angle) => {
      const r = (((angle + t) % 30) + 30) % 30;
      return s + Math.exp(-((Math.min(r, 30 - r) / 2) ** 2));
    }, 0) - 0.001 * Math.abs(t);
    if (score > bestScore) [bestScore, best] = [score, t];
  }
  return best;
}

// The points turned by `degrees` about their centre.
export function turnedPoints(points, degrees) {
  const [cx, cy] = centroid(points);
  const t = (degrees * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  return points.map(([x, y]) => [cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)]);
}
