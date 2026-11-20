// Opens the app in a browser and uses it like a person would: draws with the
// mouse and keys, pastes SMILES, pushes electrons, redraws the test molecules
// (each candidate must keep the molecule), aligns, colours, saves and opens
// files, exports pictures and structure files. Screenshots go to test-output/.
//
// The checks are in scripts/check/, one file per topic (drawing, mechanisms,
// redraw, threeD, conformations, arrange, labels, texts, files, window), each
// run on a fresh page of its own, so that each can run alone; harness.mjs has
// what they share. This runs them.
//
// Usage: start the app, then
//   npm run check -- --copy                       (best: checks a copy of this checkout, served on its own,
//                                                  so a file saved meanwhile, by you or another session,
//                                                  changes nothing: the dev server would reload the page
//                                                  and the run fail)
//   npm run check -- [url]                        (default url: http://localhost:5173/)
//   npm run check -- --only drawing,files [url]   (only these topics, by name)
//   npm run check -- --jobs 3 [url]               (three topics at a time, in browsers of their own)
//   CHECK_AUTH=user:password npm run check -- [url]   (a site behind a server password)
//   CHECK_PASSWORD=… npm run check -- [url]   (a site locked with npm run build:locked)
// Uses your installed Google Chrome; PW_CHANNEL=chromium uses Playwright's own
// browser instead (download it once with: npx playwright install chromium);
// PW_BROWSER=firefox uses Playwright's Firefox (npx playwright install firefox).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const flagged = new Set(['--only', '--jobs'].map(value));
let url = args.find((a) => !a.startsWith('--') && !flagged.has(a)) ?? 'http://localhost:5173/';

// --copy: this checkout copied (its files as git sees them, node_modules linked) into a folder of its own and
// served by a dev server there, for this run only; both gone when it ends. A file saved meanwhile, by you or
// another session, changes nothing (the checks also import the app's modules: a dev server, not a build)
if (args.includes('--copy')) {
  const root = new URL('..', import.meta.url).pathname;
  const folder = mkdtempSync(join(tmpdir(), 'olomol-check-'));
  const files = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  for (const file of files) {
    if (!existsSync(join(root, file))) continue; // (deleted, not yet committed)
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    copyFileSync(join(root, file), join(folder, file));
  }
  symlinkSync(join(root, 'node_modules'), join(folder, 'node_modules'));
  // (the linked node_modules read as inside the copy, or the dev server serves some of it wrongly)
  writeFileSync(join(folder, 'vite.check.config.mjs'), `import base from './vite.config.js';
const linked = (config) => ({ ...config, resolve: { ...(config.resolve ?? {}), preserveSymlinks: true } });
export default typeof base === 'function' ? (env) => linked(base(env)) : linked(base);
`);
  const port = await new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port: free } = probe.address();
      probe.close(() => resolve(free));
    });
  });
  const server = spawn(process.execPath, [join(folder, 'node_modules/.bin/vite'), '--config', 'vite.check.config.mjs', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: folder, stdio: 'ignore' });
  process.on('exit', () => {
    server.kill();
    rmSync(folder, { recursive: true, force: true });
  });
  url = `http://127.0.0.1:${port}/`;
  for (let k = 0; k < 200; k++) {
    if (await fetch(url).then((r) => r.ok, () => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log(`checking a copy of this checkout (${files.length} files) at ${url}`);
}
const only = value('--only')?.split(',').filter(Boolean) ?? null;
const jobs = Math.max(1, Number(value('--jobs') ?? 1));
const dir = new URL('./check/', import.meta.url);
const topics = readdirSync(dir).filter((f) => /^\d\d-.+\.mjs$/.test(f)).sort()
  .filter((f) => !only || only.some((name) => f.slice(3, -4) === name || f.startsWith(name)));
if (!topics.length) {
  console.log(`no topic called ${only.join(', ')}: ${readdirSync(dir).filter((f) => /^\d\d-/.test(f)).map((f) => f.slice(3, -4)).join(', ')}`);
  process.exit(1);
}

if (jobs > 1 && topics.length > 1 && !args.includes('--worker')) {
  // topics side by side: a process with a browser of its own for each share, their output kept and shown
  // when each is done, the checks added up
  const shares = Array.from({ length: Math.min(jobs, topics.length) }, () => []);
  topics.forEach((topic, k) => shares[k % shares.length].push(topic.slice(3, -4)));
  const results = await Promise.all(shares.map((share) => new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, '--worker', '--only', share.join(','), url], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('close', () => {
      process.stdout.write(out);
      const [, checks, failures] = out.match(/^TALLY (\d+) (\d+)$/m) ?? [null, 0, 1];
      resolve({ checks: Number(checks), failures: Number(failures) });
    });
  })));
  const checks = results.reduce((s, r) => s + r.checks, 0);
  const failures = results.reduce((s, r) => s + r.failures, 0);
  console.log(failures ? `${failures} of ${checks} checks FAILED` : `all ${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

// the topics one after another, each on a fresh page
process.env.CHECK_URL = url;
const harness = await import('./check/harness.mjs');
for (const topic of topics) {
  const name = topic.slice(3, -4);
  harness.log(`--- ${name} ---`);
  try {
    await harness.open();
    await (await import(new URL(topic, dir))).default();
  } catch (error) {
    harness.check(false, `${name}: stopped by ${String(error.message ?? error).split('\n')[0]}`);
  }
  await harness.close(name).catch(() => {});
}
await harness.browser.close();
const { checks, failures } = harness.tally;
if (args.includes('--worker')) console.log(`TALLY ${checks} ${failures}`);
else console.log(failures ? `${failures} of ${checks} checks FAILED` : `all ${checks} checks passed`);
process.exit(failures ? 1 : 0);
