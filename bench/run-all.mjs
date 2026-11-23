// npm run bench: every benchmark in turn, then the report. Each runs in its
// own Node process (with setup.mjs), as npm run bench:bN does.
import { execFileSync } from 'node:child_process';

const started = Date.now();
for (const script of ['b1-valence.mjs', 'b2-projections.mjs', 'b2d-fischer.mjs', 'b5-conformations.mjs', 'b3-redraw.mjs', 'b4-arrows.mjs', 'b6-canonical.mjs']) {
  const t = Date.now();
  console.log(`\n=== ${script}`);
  execFileSync('node', ['--import', './bench/lib/setup.mjs', `bench/${script}`], { stdio: 'inherit', cwd: new URL('../', import.meta.url) });
  console.log(`=== ${script}: ${((Date.now() - t) / 60000).toFixed(1)} min`);
}
execFileSync('node', ['bench/make-report.mjs'], { stdio: 'inherit', cwd: new URL('../', import.meta.url) });
console.log(`\nall benchmarks and the report: ${((Date.now() - started) / 60000).toFixed(1)} min`);
