// Proportions with 95 % Wilson score intervals, medians and percentiles.

const Z95 = 1.959963984540054;

// The Wilson score interval of k successes in n (Wilson 1927): { p, lo, hi }.
export function wilson(k, n, z = Z95) {
  if (!n) return { k, n, p: null, lo: null, hi: null };
  const p = k / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { k, n, p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

// The q-th quantile (0 … 1) by linear interpolation between order statistics (R's type 7).
export function quantile(values, q) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

export const median = (values) => quantile(values, 0.5);
export const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
export const max = (values) => (values.length ? Math.max(...values) : null);

// Timing: the function run `warmup` times unmeasured, then `runs` times;
// { median, p95, runs: [ms…] }.
export async function timed(fn, { warmup = 2, runs = 5 } = {}) {
  for (let i = 0; i < warmup; i++) await fn();
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return { median: median(times), p95: quantile(times, 0.95), runs: times };
}

// "97.3 % (96.9–97.6)" for a Wilson result.
export const percent = (w, digits = 1) => (w.p === null ? '–' : `${(100 * w.p).toFixed(digits)} % (${(100 * w.lo).toFixed(digits)}–${(100 * w.hi).toFixed(digits)})`);
