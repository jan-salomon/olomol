// Builds the HTML report in bench/report/ from the saved results
// (bench/results/*.json, and the drawings in bench/out/), without running
// any benchmark; also bench/results/results-table.tex.
// Usage: npm run bench:report  (node bench/make-report.mjs [--no-bundle])
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { esc, markdown, page, table } from './report-src/html.mjs';
import { loadResults, RESULTS } from './lib/results.mjs';
import { wilson } from './lib/stats.mjs';

const HERE = new URL('./', import.meta.url);
const REPORT = new URL('report/', HERE);
// the maintainer's notes on what the benchmarks found (not in the public repository: no findings page without them)
const findings = new URL('FINDINGS.md', HERE);
const DATA = new URL('report/data/', HERE);
const CHUNK = 200;
// the benchmarks in the order the report shows them (each a results file and a view)
const ORDER = ['b1', 'b2a', 'b2b', 'b2c', 'b2d', 'b3', 'b4', 'b5', 'b6', 'xredraw'];

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });
if (!process.argv.includes('--no-bundle') || !existsSync(new URL('olomol-render.js', REPORT))) {
  execFileSync('npx', ['vite', 'build', '--config', 'bench/report-src/vite.config.mjs'], { cwd: new URL('../', HERE), stdio: 'inherit' });
}
copyFileSync(new URL('report-src/style.css', HERE), new URL('style.css', REPORT));
copyFileSync(new URL('report-src/app.js', HERE), new URL('app.js', REPORT));

const index = [];
const tableRows = [];
for (const id of ORDER) {
  const results = loadResults(id);
  if (!results) continue;
  const view = await import(`./report-src/views/${id}.mjs`);
  const drawingsFile = new URL(`out/${id}-drawings.json`, HERE);
  const drawings = existsSync(drawingsFile) ? JSON.parse(readFileSync(drawingsFile, 'utf8')) : {};
  // failures first, so the first pages of "all" show them too; otherwise the benchmark's order
  const order = { fail: 0, excluded: 1, info: 1, pass: 2 };
  const views = (view.select ? view.select(results.cases) : results.cases).map((c) => view.caseView(c, drawings, results)).map((v, i) => ({ v, i })).sort((a, b) => (order[a.v.status] ?? 3) - (order[b.v.status] ?? 3) || a.i - b.i).map(({ v }) => v);
  const chunks = [];
  views.forEach((v, i) => {
    v.chunk = Math.floor(i / CHUNK);
    chunks[v.chunk] ??= {};
    // drawings a view makes itself (B5's projected 3D model)
    Object.assign(chunks[v.chunk], v.extraDrawings ?? {});
    delete v.extraDrawings;
    for (const d of v.drawings ?? []) if (drawings[d.key]) chunks[v.chunk][d.key] = drawings[d.key];
  });
  chunks.forEach((chunk, n) => {
    const name = `${id}-d${String(n).padStart(3, '0')}`;
    writeFileSync(new URL(`${name}.js`, DATA), `window.BENCH_D[${JSON.stringify(name)}]=${JSON.stringify(chunk)};\n`);
  });
  writeFileSync(new URL(`${id}-cases.js`, DATA), `window.BENCH=${JSON.stringify({ id, title: view.meta.title, facets: view.facets, layout: view.layout ?? 'list', statusLabels: view.statusLabels, cases: views })};\n`);
  const env = results.environment;
  const body = `<h1>${esc(view.meta.title)}</h1><p class="muted">${esc(view.meta.description)}</p>
    <p class="small muted">olomol ${esc(env.olomol)} · commit <code>${esc(env.commitShort)}</code>${env.srcChanged ? ' <b>(src/ changed since the commit)</b>' : ''}${env.tag ? ` · tag ${esc(env.tag)}` : ''} · run ${esc(env.date.slice(0, 16).replace('T', ' '))} UTC · ${results.seconds} s</p>
    ${view.top(results)}
    <div class="pages" id="pages-top"></div><div id="cases"></div><div class="pages" id="pages-bottom"></div>`;
  writeFileSync(new URL(`${id}.html`, REPORT), page({ title: view.meta.short, body, bar: true, scripts: [`data/${id}-cases.js`, 'olomol-render.js', 'app.js'] }));
  // a figure of the results, for a benchmark that has one (B3)
  if (view.figure) {
    const f = view.figure(results);
    writeFileSync(new URL(`fig-redraw.svg`, RESULTS), `<?xml version="1.0" encoding="UTF-8"?>\n${f.best.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/, '$1<style>text { font: 11px Arial, sans-serif; fill: #222 } .gridline { stroke: #e3e3e3 } .axis { stroke: #555 }</style>')}\n`);
  }
  const pf = view.passFail(results);
  index.push({ id, view, results, pf, headline: view.headline(results) });
  tableRows.push(...view.tableRows(results));
}

// --- the index page ---
const envOf = index[0]?.results.environment;
const card = ({ id, view, results, pf, headline }) => {
  // (an exploration judges nothing: its headline and a link)
  if (view.meta.explore) return `<div class="panel bench-card"><h2><a href="${id}.html">${esc(view.meta.title)}</a></h2><p>${esc(view.meta.description)}</p><p><span class="big">${headline.big}</span> ${esc(headline.text)}</p><p class="small muted">Ran ${results.seconds} s on commit <code>${esc(results.environment.commitShort)}</code>. <a href="${id}.html">All molecules →</a></p></div>`;
  const w = wilson(pf.pass, pf.n);
  return `<div class="panel bench-card"><h2><a href="${id}.html">${esc(view.meta.title)}</a></h2>
    <p>${esc(view.meta.description)}</p>
    <p><span class="big">${headline.big}</span> ${esc(headline.text)}</p>
    <p>${pf.n.toLocaleString('en')} cases judged: <b style="color:var(--pass)">${pf.pass.toLocaleString('en')} passed</b>, <b style="color:var(--fail)">${(pf.n - pf.pass).toLocaleString('en')} failed</b>${pf.excluded ? `, ${pf.excluded} not judged` : ''}; pass rate ${w.p === null ? '–' : `${(100 * w.p).toFixed(2)} % (95 % CI ${(100 * w.lo).toFixed(2)}–${(100 * w.hi).toFixed(2)})`}.</p>
    <p class="small muted">Ran ${results.seconds} s on commit <code>${esc(results.environment.commitShort)}</code>${results.environment.srcChanged ? ' (src/ changed)' : ''}. <a href="${id}.html">All cases →</a></p></div>`;
};
const envTable = envOf ? table(['', ''], [
  ['olomol', `${esc(envOf.olomol)}, commit <code>${esc(envOf.commit)}</code> (${esc(envOf.branch)}${envOf.tag ? `, tag ${esc(envOf.tag)}` : ''}) of ${esc(envOf.commitDate)}${envOf.srcChanged ? ' <b>— src/ differs from this commit</b>' : ''}`],
  ['Node', esc(envOf.node)], ['Chrome', esc(envOf.chrome)], ['Playwright', esc(envOf.playwright)],
  ['RDKit.js', `${esc(envOf.rdkitJs)} (RDKit ${esc(envOf.rdkitCore)})`], ['megane-rdkit', esc(envOf.meganeRdkit)], ['Indigo', esc(envOf.indigo)], ['OpenChemLib', esc(envOf.openchemlib)],
  ['Machine', `${esc(envOf.machine.cpu)}, ${envOf.machine.cores} threads, ${envOf.machine.ramGB} GB RAM, ${esc(envOf.machine.os)}`],
  ['Run', index.map(({ id, results }) => `${id}: ${esc(results.environment.date.slice(0, 16).replace('T', ' '))} UTC, ${results.seconds} s`).join('<br>')],
]) : '';
writeFileSync(new URL('index.html', REPORT), page({
  title: 'olomol benchmarks',
  body: `<h1>olomol benchmarks</h1><p class="muted">Every case of every benchmark, drawn by olomol, with what was expected and what olomol gave. Failures come first.${existsSync(findings) ? ' <a href="findings.html">Findings (bugs and surprises) →</a>' : ''}</p>
  <div class="grid">${index.filter((b) => !b.view.meta.explore).map(card).join('')}</div>
  ${index.some((b) => b.view.meta.explore) ? `<h2>Explorations (not benchmarks)</h2><div class="grid">${index.filter((b) => b.view.meta.explore).map(card).join('')}</div>` : ''}
  <div class="panel"><h2>What this run ran on</h2>${envTable}</div>`,
}));

// --- the findings ---
if (existsSync(findings)) writeFileSync(new URL('findings.html', REPORT), page({ title: 'Findings', body: `<p><a href="index.html">← all benchmarks</a></p><div class="markdown panel">${markdown(readFileSync(findings, 'utf8'))}</div>` }));

// --- the results table's rows (LaTeX) ---
writeFileSync(new URL('results-table.tex', RESULTS), `% The rows of a LaTeX results table, from bench/results/*.json; made by bench/make-report.mjs.\n% Commit ${envOf?.commit ?? '?'}${envOf?.srcChanged ? ' (src/ changed)' : ''}; 95 % Wilson intervals in parentheses.\n${tableRows.join('\n')}\n`);
console.log(`report: ${new URL('index.html', REPORT).pathname}`);
