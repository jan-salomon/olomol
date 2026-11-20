// The perpendicular to a molecule's plane at each atom of a 3D view, for p
// orbitals drawn upright to it: at an atom with two or more neighbours,
// across the plane of its bonds; at an atom with one, across the plane of
// that bond and the next atom's bonds; none for a lone atom. All of a
// molecule's normals point to one side of it (the side the first three
// atoms that aren't in a line turn anticlockwise round), so the phases of
// a conjugated chain stay as drawn whichever way the molecule is turned.
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a) => Math.sqrt(dot(a, a));
const unit = (a) => (norm(a) > 1e-9 ? a.map((v) => v / norm(a)) : null);

// `points3`: the view's points (x right, y up, z towards the viewer); `links`: [{ a, b, kind }] by index.
// Returns, per atom, its unit normal [x, y, z] or null.
export function planeNormals(points3, links) {
  const n = points3.length;
  const neighbours = Array.from({ length: n }, () => []);
  for (const l of links) {
    if (l.kind === 'link' || l.kind === 'hbond') continue;
    neighbours[l.a].push(l.b);
    neighbours[l.b].push(l.a);
  }
  // the molecule's side: from its first three atoms not in a line
  let side = null;
  for (let i = 0; i < n && !side; i++) {
    for (let j = i + 1; j < n && !side; j++) {
      for (let k = j + 1; k < n && !side; k++) {
        const c = cross(sub(points3[j], points3[i]), sub(points3[k], points3[i]));
        if (norm(c) > 0.05 * norm(sub(points3[j], points3[i])) * norm(sub(points3[k], points3[i]))) side = c;
      }
    }
  }
  const across = (i) => {
    const around = neighbours[i];
    let sum = [0, 0, 0];
    const add = (c) => {
      // (each pair's normal turned to the side of those before it: three bonds of a flat atom agree)
      const sign = dot(c, norm(sum) > 1e-9 ? sum : (side ?? c)) < 0 ? -1 : 1;
      sum = sum.map((v, k) => v + sign * c[k]);
    };
    if (around.length >= 2) {
      for (let p = 0; p < around.length; p++) for (let q = p + 1; q < around.length; q++) add(cross(sub(points3[around[p]], points3[i]), sub(points3[around[q]], points3[i])));
    } else if (around.length === 1) {
      const j = around[0];
      for (const k of neighbours[j]) if (k !== i) add(cross(sub(points3[j], points3[i]), sub(points3[k], points3[j])));
    }
    const u = unit(sum);
    if (!u) return null;
    return side && dot(u, side) < 0 ? u.map((v) => -v) : u;
  };
  return points3.map((_, i) => across(i));
}

// A p orbital upright to the plane at an atom whose normal is `normal`: its first lobe along `face` (1 or −1)
// times the normal, as seen on the page: { angle (page, y down), reach (1 in the page, less end on) }.
export function uprightOnPage(normal, face) {
  const [x, y] = [face * normal[0], -face * normal[1]];
  return { angle: Math.atan2(y, x), reach: Math.max(0.2, Math.hypot(x, y)) };
}

// The face (1 or −1) that keeps an orbital's first lobe on the side it was drawn: one drawn pointing up on
// the page goes on the side of the plane towards the viewer (z > 0) of the view it starts in; seen
// nearly edge on, the side nearest the way it points.
export function faceOf(normal, angle) {
  if (Math.abs(normal[2]) > 0.3) return (Math.sin(angle) < 0) === (normal[2] > 0) ? 1 : -1;
  return Math.cos(angle) * normal[0] - Math.sin(angle) * normal[1] >= 0 ? 1 : -1;
}

// A hybrid orbital's direction in a drawing, kept for 3D: { away: true } when it points away from its
// atom's bonds (two or more), else { i, j, a, b }: the direction as a·(unit to atom i) + b·(unit to atom j)
// on the page, i and j its neighbours or theirs (two not in a line); null if there are none. `points`:
// the molecule's atoms on the page (y down), `m` the orbital's atom, `links` its bonds by index.
export function hybridBasis(points, links, m, angle) {
  const neighbours = (k) => links.filter((l) => l.kind !== 'link' && l.kind !== 'hbond' && (l.a === k || l.b === k)).map((l) => (l.a === k ? l.b : l.a));
  const toward = (k) => {
    const [dx, dy] = [points[k][0] - points[m][0], points[k][1] - points[m][1]];
    const d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  };
  const near = neighbours(m);
  const d = [Math.cos(angle), Math.sin(angle)];
  if (near.length >= 2) {
    const sum = near.map(toward).reduce((p, q) => [p[0] + q[0], p[1] + q[1]], [0, 0]);
    const away = Math.atan2(-sum[1], -sum[0]);
    if (Math.hypot(...sum) > 0.2 && Math.abs(Math.atan2(Math.sin(angle - away), Math.cos(angle - away))) < 12 * Math.PI / 180) return { away: true };
  }
  const candidates = [...near, ...near.flatMap(neighbours).filter((k) => k !== m && !near.includes(k))];
  for (let p = 0; p < candidates.length; p++) {
    for (let q = p + 1; q < candidates.length; q++) {
      const [u, v] = [toward(candidates[p]), toward(candidates[q])];
      const det = u[0] * v[1] - u[1] * v[0];
      if (Math.abs(det) < 0.3) continue;
      return { i: candidates[p], j: candidates[q], a: (d[0] * v[1] - d[1] * v[0]) / det, b: (u[0] * d[1] - u[1] * d[0]) / det };
    }
  }
  return null;
}

// That direction in a 3D view (`points3`, x right, y up, z towards the viewer): a unit vector, or null.
export function hybridIn3D(basis, points3, links, m) {
  const unit3 = (k) => {
    const v = points3[k].map((x, n) => x - points3[m][n]);
    const d = norm(v) || 1;
    return v.map((x) => x / d);
  };
  let v;
  if (basis.away) {
    const near = links.filter((l) => l.kind !== 'link' && l.kind !== 'hbond' && (l.a === m || l.b === m)).map((l) => (l.a === m ? l.b : l.a));
    v = near.map(unit3).reduce((p, q) => p.map((x, n) => x - q[n]), [0, 0, 0]);
  } else {
    const [u, w] = [unit3(basis.i), unit3(basis.j)];
    v = u.map((x, n) => basis.a * x + basis.b * w[n]);
  }
  return unit(v);
}
