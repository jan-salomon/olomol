// Generated tests of olomol's file handling.
//
//   node scripts/formats/fuzz/run.mjs [--seed 1] [--count 100] [--mode gen|mutate|all] [--no-shrink] [--out DIR]
//     [--timeout 60] [--molecules a.smi,b.smi]
//
// gen: drawings made by a seeded generator (gen.mjs) combining olomol's features, each checked (checks.mjs):
//   .olom written, read and written again unchanged (text and model); drawn before and after; every structure
//   format written or refused in words, the drawing passed in unchanged, read back with the same molecules and
//   what it lost said by lostIn; a part written with all its references inside it.
// mutate: the examples and generated drawings as .olom, mutated (mutate.mjs): refused in words, or a drawing that
//   draws, saves, reads, exports and edits.
// Each case runs in a child process with a time limit (a hang is a failure too). Each kind of failure (its sig) is
// shrunk once to a small drawing or file and written to DIR/repro/; DIR/results.json lists them all.
// The same seed gives the same cases; a case is rerun alone with --seed S --count 1 --first K.
// Exit code 1 if anything but refusals failed.
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : fallback;
};
const caseSeed = (seed, index) => (Math.imul(seed, 1000003) + Math.imul(index, 7919) + 12345) >>> 0;

if (args.includes('--child')) {
  await import('../node-setup.mjs');
  const { generate } = await import('./gen.mjs');
  const { checkAll } = await import('./checks.mjs');
  const { shrinkDoc } = await import('./shrink.mjs');
  const { EXAMPLES, checkMalformed, mutated, shrinkFile } = await import('./mutate.mjs');
  const { docToPlain, olom } = await import('./lib.mjs');
  const { rng } = await import('./rng.mjs');
  // (olomol's own warnings kept out of the report)
  console.warn = () => {};
  process.on('message', async ({ mode, seed, index, seen, shrink }) => {
    const s = caseSeed(seed, index);
    const t0 = Date.now();
    const results = [];
    try {
      if (mode === 'gen') {
        const { doc, log } = await generate(s);
        const failures = await checkAll(doc, rng(s ^ 0x5bd1e995));
        for (const f of failures) {
          const result = { mode, seed, index, sig: f.sig, check: f.check, format: f.format, detail: String(f.detail).slice(0, 2000), features: log };
          if (shrink && !seen.includes(f.sig) && !f.sig.startsWith('export-refused')) {
            seen.push(f.sig);
            const small = await shrinkDoc(doc, f);
            result.repro = { doc: docToPlain(small), ids: f.ids?.filter((id) => small.atoms.has(id) || [...Object.values(small)].some((m) => m instanceof Map && m.has(id))) ?? null };
            try {
              result.reproOlom = olom.writeOlom(small, { ownStyle: true });
            } catch {}
          }
          results.push(result);
        }
      } else {
        // the examples in turn, every other case a generated drawing
        let text;
        let source;
        if (index % 2 === 0) [source, text] = EXAMPLES[(index / 2) % EXAMPLES.length];
        else {
          const { doc } = await generate(s);
          [source, text] = [`generated ${s}`, olom.writeOlom(doc)];
        }
        const [bad, done] = mutated(text, s);
        for (const f of await checkMalformed(bad)) {
          const result = { mode, seed, index, sig: f.sig, detail: String(f.detail).slice(0, 2000), source, mutations: done };
          if (shrink && !seen.includes(f.sig)) {
            seen.push(f.sig);
            result.repro = { file: await shrinkFile(bad, f.sig) };
          }
          results.push(result);
        }
      }
    } catch (e) {
      results.push({ mode, seed, index, sig: `harness-error ${e.message}`.slice(0, 120), detail: e.stack });
    }
    process.send({ index, results, ms: Date.now() - t0 });
  });
  process.send({ ready: true });
} else {
  const seed = Number(opt('seed', 1));
  const count = Number(opt('count', 100));
  const first = Number(opt('first', 0));
  const mode = opt('mode', 'all');
  const out = opt('out', fileURLToPath(new URL('../../../test-output/fuzz', import.meta.url)));
  // (more molecules for the generator, gen.mjs: read in each case's process)
  if (opt('molecules')) process.env.OLOMOL_FUZZ_MOLECULES = opt('molecules');
  const timeout = Number(opt('timeout', 90)) * 1000;
  const shrink = !args.includes('--no-shrink');
  mkdirSync(`${out}/repro`, { recursive: true });
  const modes = mode === 'all' ? ['gen', 'mutate'] : [mode];
  const queue = modes.flatMap((m) => Array.from({ length: count }, (_, k) => ({ mode: m, seed, index: first + k })));
  const seen = [];
  const all = [];
  let child = null;
  const start = () => new Promise((resolve) => {
    child = fork(fileURLToPath(import.meta.url), ['--child'], { execArgv: ['--max-old-space-size=1024'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    child.once('message', () => resolve());
  });
  const runOne = (job) => new Promise((resolve) => {
    // (shrinking takes longer: its own allowance)
    const timer = setTimeout(() => {
      child.off('exit', died);
      child.kill('SIGKILL');
      child = null;
      resolve({ index: job.index, results: [{ ...job, sig: `hang-${job.mode} (over ${timeout / 1000} s)`, detail: `case seed ${caseSeed(job.seed, job.index)}` }] });
    }, timeout + (shrink ? 180_000 : 0));
    const died = (code, signal) => {
      clearTimeout(timer);
      child = null;
      resolve({ index: job.index, results: [{ ...job, sig: `child-died-${job.mode} (${signal ?? code}: out of memory?)`, detail: `case seed ${caseSeed(job.seed, job.index)}` }] });
    };
    child.once('exit', died);
    child.once('message', (m) => {
      clearTimeout(timer);
      child?.off('exit', died);
      resolve(m);
    });
    child.send({ ...job, seen, shrink });
  });
  // what was found so far, written out (results.json, the repros)
  const report = () => {
    // per kind of failure: how often, the first case, its repro
    const kinds = new Map();
    for (const r of all) {
      const k = kinds.get(r.sig) ?? { sig: r.sig, count: 0, first: r, repro: null };
      k.count++;
      if (r.repro && !k.repro) k.repro = r;
      kinds.set(r.sig, k);
    }
    const slug = (sig) => sig.replace(/[^a-z0-9]+/gi, '-').slice(0, 80).replace(/-$/, '');
    for (const k of kinds.values()) {
      const r = k.repro;
      if (!r) continue;
      const name = slug(k.sig);
      if (r.repro.file) writeFileSync(`${out}/repro/${name}.olom`, r.repro.file);
      else {
        writeFileSync(`${out}/repro/${name}.json`, JSON.stringify({ sig: k.sig, check: r.check, format: r.format, ids: r.repro.ids, doc: r.repro.doc }, null, 1));
        if (r.reproOlom) writeFileSync(`${out}/repro/${name}.olom`, r.reproOlom);
      }
      k.file = `repro/${name}`;
    }
    const summary = [...kinds.values()].sort((p, q) => q.count - p.count).map(({ sig, count, first, file }) => ({ sig, count, case: `--mode ${first.mode} --seed ${first.seed} --first ${first.index} --count 1`, file, detail: first.detail?.slice(0, 600), ...(first.mutations && { mutations: first.mutations, source: first.source }) }));
    writeFileSync(`${out}/results.json`, JSON.stringify({ seed, count, mode, seconds: Math.round((Date.now() - t0) / 1000), kinds: summary }, null, 1));
    return summary;
  };
  const t0 = Date.now();
  let done = 0;
  for (const job of queue) {
    if (!child) await start();
    const { results } = await runOne(job);
    for (const r of results) {
      if (!seen.includes(r.sig) && (r.repro || r.sig.startsWith('hang') || r.sig.startsWith('export-refused') || !shrink)) seen.push(r.sig);
      all.push(r);
    }
    if (++done % 25 === 0) report();
    process.stderr.write(`\r${job.mode} ${job.index + 1}/${first + count}  ${all.length} failures, ${new Set(all.map((r) => r.sig)).size} kinds  `);
  }
  child?.kill();
  process.stderr.write('\n');
  const summary = report();
  for (const k of summary) console.log(`${String(k.count).padStart(5)}  ${k.sig}${k.file ? `   [${k.file}]` : ''}`);
  console.log(`${queue.length} cases, ${all.length} failures of ${summary.length} kinds, ${Math.round((Date.now() - t0) / 1000)} s; ${out}/results.json`);
  process.exit(summary.some((k) => !k.sig.startsWith('export-refused')) ? 1 : 0);
}
