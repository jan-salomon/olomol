// A seeded random number generator (mulberry32: 32-bit state, fast, and
// good enough for sampling and noise), with the helpers the benchmarks use.
// The same seed gives the same numbers on every machine.

export function rng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  return {
    next, // uniform in [0, 1)
    uniform: (a, b) => a + (b - a) * next(),
    int: (n) => Math.floor(next() * n), // 0 … n−1
    pick: (list) => list[Math.floor(next() * list.length)],
    // standard normal (Box–Muller, the second value kept for the next call)
    gauss() {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
    // a copy of `list` in random order (Fisher–Yates)
    shuffle(list) {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

// `k` items of `list` without repetition, in the order of the list.
export function sample(random, list, k) {
  if (k >= list.length) return [...list];
  const chosen = new Set(random.shuffle(list.map((_, i) => i)).slice(0, k));
  return list.filter((_, i) => chosen.has(i));
}
