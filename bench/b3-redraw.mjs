// B3: Redraw, several layout engines each checked by canonical SMILES, against any single engine.
//
// Each molecule is pasted as SMILES into the built app in Chrome and every Redraw engine is run on it, as the
// Redraw window runs them (window.olomolTest.redraw: prepare and runEngines of src/layout/relayout.js; Indigo
// and the 3D engine need Web Workers). Every drawing, also those the check drops, comes back as put in.
// The quality of each is measured here by our own code (bond-length spread, clashes, crossings, angles);
// olomol's own drawingScore is recorded beside it, but it is code under test and not the judge.
// Usage: npm run bench:b3 [-- --no-build] [-- --limit=N]
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { rng, sample } from './lib/rng.mjs';
import { startApp } from './lib/app.mjs';
import { environment } from './lib/env.mjs';
import { rdkit, src, identity } from './lib/olomol.mjs';
import { readDataFile, saveResults } from './lib/results.mjs';
import { median, quantile, wilson } from './lib/stats.mjs';

const started = performance.now();
const RDKit = await rdkit();
const env = await environment(RDKit);
const { ENGINES } = await src('layout/relayout.js');
// the engines for a whole molecule (the "selected part" ones apply only to part of one)
export const WHOLE = ENGINES.filter((e) => !e.part).map((e) => e.label);
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? Infinity);
const TIMEOUT = 600_000; // (several pages at once: a large molecule takes longer)

// --- data ---
const molecules = [];
for (const set of ['bridged', 'macrocyclic', 'fused']) {
  for (const line of readDataFile(new URL(`data/b3-${set}.smi`, import.meta.url)).lines) {
    const [id, smiles] = line.split('\t');
    molecules.push({ id: `B3-${set}-${id}`, set, name: id, smiles });
  }
}
// the five molecules of olomol's brief (TEST_MOLECULES in scripts/check/harness.mjs, read from the file: importing
// it would start its browser)
const harness = readFileSync(new URL('../scripts/check/harness.mjs', import.meta.url), 'utf8');
const block = harness.slice(harness.indexOf('TEST_MOLECULES = {'), harness.indexOf('};', harness.indexOf('TEST_MOLECULES = {')));
for (const [, name, smiles] of block.matchAll(/^\s*'?([\w-]+)'?:\s*'((?:[^'\\]|\\.)*)',?$/gm)) molecules.push({ id: `B3-brief-${name}`, set: 'brief', name, smiles: smiles.replace(/\\\\/g, '\\') });
if (molecules.filter((m) => m.set === 'brief').length !== 5) throw new Error('B3: could not read the five TEST_MOLECULES');

import { better, quality, round } from './lib/quality.mjs';

// --- the app: the molecules shared among several pages (each with its own workers), then a few again alone ---
// Several pages at once load the machine, so the engines' times from that pass are not used: the times reported
// come from TIMED molecules (seeded, 10 of each set and the five of the brief) redrawn again one by one on one page.
const jobs = Number(process.argv.find((a) => a.startsWith('--jobs='))?.slice(7) ?? defaultJobs());
function defaultJobs() {
  // a page per core, at most one per 0.8 GB of memory available (a page with its workers takes about that)
  let available = os.freemem();
  try {
    available = 1024 * Number(readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/)[1]);
  } catch { /* not Linux */ }
  return Math.max(1, Math.min(os.cpus().length, Math.floor(available / (0.8 * 2 ** 30))));
}
const app = await startApp({ pages: jobs });
console.log(`B3: ${jobs} pages at once`);
// (each page loads its engines first, outside the timing)
await Promise.all(app.pages.map((page) => page.evaluate(() => window.olomolTest.redraw('CCO'))));

async function redrawOn(page, molecule) {
  const t0 = performance.now();
  let timer;
  try {
    const r = await Promise.race([
      page.evaluate((s) => window.olomolTest.redraw(s), molecule.smiles),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`over ${TIMEOUT / 1000} s`)), TIMEOUT); }),
    ]);
    return { r, seconds: (performance.now() - t0) / 1000 };
  } catch (error) {
    await page.reload();
    await page.waitForFunction(() => window.olomolTest);
    return { error: error.message.split('\n')[0] };
  } finally {
    clearTimeout(timer); // (else the process waits for it before it can end)
  }
}

const drawings = {};
function caseOf(molecule, r, seconds) {
  const index = new Map(r.atomIds.map((id, i) => [id, i]));
  const bondsOf = (picture) => picture.bonds.filter(([a, b]) => index.has(a) && index.has(b)).map(([a, b, order]) => [index.get(a), index.get(b), order]);
  // a picture as a drawing (docToJSON form): the pasted molecule, its atoms where the picture has them
  const asDoc = (picture) => {
    const atoms = r.doc.atoms.map((a) => ({ ...a }));
    const at = new Map(r.atomIds.map((id, i) => [id, picture.atoms[i]]));
    for (const a of atoms) if (at.has(a.id)) [a.x, a.y] = at.get(a.id);
    const bonds = r.doc.bonds.map((b, k) => ({ ...b, a: picture.bonds[k][0], b: picture.bonds[k][1], stereo: picture.bonds[k][3], ...(picture.bonds[k][4] !== null ? { z: picture.bonds[k][4] } : {}) }));
    return { atoms, bonds, nextId: Math.max(...atoms.map((a) => a.id), ...bonds.map((b) => b.id)) + 1 };
  };
  const startQuality = quality(r.start.atoms, bondsOf(r.start));
  drawings[`${molecule.id}:start`] = asDoc(r.start);
  const engines = {};
  for (const label of WHOLE) {
    const own = r.candidates.find((c) => c.label === label);
    const twinOf = r.candidates.find((c) => c.also.includes(label));
    const skipped = r.skipped.find((s) => s.label === label);
    let e;
    if (own) e = { outcome: 'drawn', picture: own, ms: Math.round(own.ms), olomolScore: round(own.score, 3), olomolParts: own.parts, problemsSaid: own.problems || '' };
    else if (twinOf) e = { outcome: 'same as another', twinOf: twinOf.label, picture: twinOf, olomolScore: round(twinOf.score, 3) };
    else if (skipped?.dropped) {
      const meant = identity(RDKit, skipped.meant ?? '').smiles ?? skipped.meant;
      // (right after all: it means the molecule as given, where pasting had changed it: see pasteKept)
      e = { outcome: 'rejected', picture: skipped, meant, rightAfterAll: meant === identity(RDKit, molecule.smiles).smiles };
    }
    else if (skipped?.reason === 'same as the current drawing') e = { outcome: 'same as start', picture: r.start };
    else if (skipped?.reason?.startsWith('failed')) e = { outcome: 'failed', reason: skipped.reason };
    else e = { outcome: 'nothing', reason: skipped?.reason ?? 'not run' };
    if (e.picture) {
      e.quality = e.picture === r.start ? startQuality : quality(e.picture.atoms, bondsOf(e.picture));
      e.key = e.picture === r.start ? `${molecule.id}:start` : `${molecule.id}:${e.picture.label}`;
      if (e.picture !== r.start && !drawings[e.key]) drawings[e.key] = asDoc(e.picture);
      delete e.picture;
    }
    engines[label] = e;
  }
  const offered = Object.entries(engines).filter(([, e]) => e.quality && e.outcome !== 'rejected');
  const best = offered.reduce((b, [label, e]) => (!b || better(e.quality, b[1].quality) ? [label, e] : b), null);
  const bestLabels = best ? offered.filter(([, e]) => !better(best[1].quality, e.quality)).map(([label]) => label) : [];
  const olomolPick = Object.entries(engines).filter(([, e]) => e.olomolScore !== undefined && e.outcome === 'drawn').sort((a, b) => a[1].olomolScore - b[1].olomolScore)[0]?.[0] ?? null;
  const c = {
    ...molecule,
    canonical: identity(RDKit, molecule.smiles).smiles,
    // the molecule as pasted (olomol's SMILES of it, what Redraw checks every drawing against): the same as given?
    pasted: identity(RDKit, r.smiles).smiles,
    pasteKept: identity(RDKit, r.smiles).smiles === identity(RDKit, molecule.smiles).smiles,
    atoms: r.atomIds.length,
    seconds: round(seconds, 2),
    engines,
    best: bestLabels,
    bestQuality: best?.[1].quality ?? null,
    olomolPick,
    rejected: Object.entries(engines).filter(([, e]) => e.outcome === 'rejected').map(([l]) => l),
    failed: Object.entries(engines).filter(([, e]) => e.outcome === 'failed').map(([l]) => l),
    cleanOffered: offered.some(([, e]) => e.quality.problems === 0),
  };
  // a molecule "passes" when Redraw offers at least one drawing with no clash and no crossing
  c.pass = c.cleanOffered;
  c.status = c.pass ? 'pass' : 'fail';
  c.reason = c.pass ? '' : best ? `Every drawing offered has clashes or crossings (the best: ${best[1].quality.clashes} clashes, ${best[1].quality.crossings} crossings)` : 'No engine gave a drawing';
  return c;
}

const todo = molecules.slice(0, limit);
const results = new Array(todo.length);
let next = 0;
let done = 0;
// the largest molecules first (by the letters of their SMILES), so that the slowest don't start last and hold up the end
const order = todo.map((m, k) => [k, (m.smiles.match(/[A-Z]/g) ?? []).length]).sort((p, q) => q[1] - p[1]).map(([k]) => k);
await Promise.all(app.pages.map(async (page) => {
  while (next < todo.length) {
    const k = order[next++];
    const molecule = todo[k];
    const { r, seconds, error } = await redrawOn(page, molecule);
    results[k] = error ? { ...molecule, status: 'fail', pass: false, reason: `Redraw did not finish: ${error}`, engines: {} } : caseOf(molecule, r, seconds);
    done += 1;
    const c = results[k];
    console.log(`${done}/${todo.length} ${molecule.id} ${error ? error : `${c.atoms} atoms ${c.seconds} s best ${c.best.join(' = ')}${c.rejected.length ? ` rejected ${c.rejected.join(', ')}` : ''}`}`);
    if (done % 25 === 0) writeFileSync(new URL('out/b3-partial.json', import.meta.url), JSON.stringify(results.filter(Boolean)));
  }
}));
const cases = results;
for (const c of cases) c.secondsUnderLoad = c.seconds;

// the timing pass: one page, nothing else running in the browser
const TIMED = ['bridged', 'macrocyclic', 'fused'].flatMap((set) => sample(rng(20261111), todo.filter((m) => m.set === set), 10)).concat(todo.filter((m) => m.set === 'brief'));
const page = app.pages[0];
await Promise.all(app.pages.slice(1).map((p) => p.context().close()));
const timing = [];
for (const molecule of TIMED) {
  const { r, seconds, error } = await redrawOn(page, molecule);
  if (error) {
    timing.push({ id: molecule.id, error });
    continue;
  }
  timing.push({ id: molecule.id, atoms: r.atomIds.length, seconds: round(seconds, 2), ms: Object.fromEntries(r.candidates.map((c) => [c.label, Math.round(c.ms)])) });
  console.log(`timed ${molecule.id}: ${seconds.toFixed(1)} s`);
}
await app.close();

// --- summary ---
const SETS = ['bridged', 'macrocyclic', 'fused', 'brief'];
const finished = cases.filter((c) => c.engines && Object.keys(c.engines).length);
const perEngine = (list) => Object.fromEntries(WHOLE.map((label) => {
  const es = list.map((c) => c.engines[label]);
  const count = (outcome) => es.filter((e) => e.outcome === outcome).length;
  const usable = list.filter((c) => c.engines[label].quality && c.engines[label].outcome !== 'rejected');
  const beaten = list.filter((c) => {
    const e = c.engines[label];
    if (!c.bestQuality) return false;
    return !e.quality || e.outcome === 'rejected' || better(c.bestQuality, e.quality);
  });
  // (times from the timing pass, one molecule at a time; the shared pass's are under load)
  const ids = new Set(list.map((c) => c.id));
  const ms = timing.filter((t) => ids.has(t.id) && t.ms?.[label] !== undefined).map((t) => t.ms[label]);
  return [label, {
    molecules: list.length,
    failed: count('failed'), rejected: count('rejected'), nothing: count('nothing'), drawn: count('drawn'), sameAsAnother: count('same as another'), sameAsStart: count('same as start'),
    rejectedRate: wilson(count('rejected'), list.length),
    best: wilson(list.filter((c) => c.best.includes(label)).length, list.length),
    clean: wilson(usable.filter((c) => c.engines[label].quality.problems === 0).length, list.length),
    bestOfAllBeats: wilson(beaten.length, list.filter((c) => c.bestQuality).length),
    olomolPick: list.filter((c) => c.olomolPick === label).length,
    ms: { median: median(ms), p95: quantile(ms, 0.95) },
  }];
}));
const summary = {
  molecules: finished.length,
  notFinished: cases.length - finished.length,
  bestOfAllClean: wilson(finished.filter((c) => c.cleanOffered).length, finished.length),
  bySet: Object.fromEntries(SETS.map((s) => [s, { molecules: finished.filter((c) => c.set === s).length, bestOfAllClean: wilson(finished.filter((c) => c.set === s && c.cleanOffered).length, finished.filter((c) => c.set === s).length), engines: perEngine(finished.filter((c) => c.set === s)) }])),
  engines: perEngine(finished),
  olomolPickIsBest: wilson(finished.filter((c) => c.olomolPick && c.best.includes(c.olomolPick)).length, finished.filter((c) => c.olomolPick).length),
  secondsPerMolecule: { median: median(timing.filter((t) => t.seconds).map((t) => t.seconds)), p95: quantile(timing.filter((t) => t.seconds).map((t) => t.seconds), 0.95), molecules: timing.filter((t) => t.seconds).length },
  secondsPerMoleculeUnderLoad: { median: median(finished.map((c) => c.seconds)), pages: jobs },
  anyRejected: wilson(finished.filter((c) => c.rejected.length).length, finished.length),
  pasteChanged: finished.filter((c) => !c.pasteKept).map((c) => c.id),
  rejectedButRight: finished.flatMap((c) => Object.entries(c.engines).filter(([, e]) => e.rightAfterAll).map(([l]) => `${c.id}: ${l}`)),
};
writeFileSync(new URL('out/b3-drawings.json', import.meta.url), JSON.stringify(drawings));
saveResults({
  id: 'b3', title: 'B3: Redraw, several engines with a SMILES check', environment: env, seconds: Math.round((performance.now() - started) / 100) / 10,
  truth: "The molecule pasted (its RDKit canonical SMILES, stereo included) for the check; quality by the benchmark's own measures, not olomol's drawingScore.",
  engines: WHOLE,
  summary, cases,
  csvColumns: ['id', 'set', 'name', 'smiles', 'atoms', 'status', 'best', 'olomolPick', 'rejected', 'failed', 'seconds'],
  csvRows: cases.map((c) => ({ ...c, best: c.best?.join(' | '), rejected: c.rejected?.join(' | '), failed: c.failed?.join(' | ') })),
});
// Figure 4's data: per engine and set, rejected / best / clean / beaten by best-of-all
const rows = [];
for (const set of [...SETS, 'all']) {
  const e = set === 'all' ? summary.engines : summary.bySet[set].engines;
  for (const label of WHOLE) rows.push([set, label, e[label].molecules, e[label].failed, e[label].rejected, e[label].best.k, e[label].clean.k, e[label].bestOfAllBeats.k, e[label].ms.median ?? ''].join(','));
}
writeFileSync(new URL('results/fig-redraw.csv', import.meta.url), `set,engine,molecules,failed,rejected,best,clean,beaten_by_best_of_all,median_ms\n${rows.map((r) => r.replace(/^([^,]*),([^,]*),/, (m, s, l) => `${s},"${l}",`)).join('\n')}\n`);
console.log(JSON.stringify({ clean: summary.bestOfAllClean, rejectedAny: summary.anyRejected, olomolPick: summary.olomolPickIsBest, s: summary.secondsPerMolecule }));
