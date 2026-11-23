// Writing a benchmark's results: bench/results/<id>.json (every case, the
// summary and the environment) and <id>.csv (one row per case).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

export const RESULTS = new URL('../results/', import.meta.url);
export const OUT = new URL('../out/', import.meta.url);
mkdirSync(RESULTS, { recursive: true });
mkdirSync(OUT, { recursive: true });

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCSV(rows, columns) {
  return [columns.join(','), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(','))].join('\n') + '\n';
}

// results: { id, title, environment, summary, cases: [...], csvColumns, csvRows? , extra files }; inSummary: false
// keeps a run out of summary.json (an exploration, not a benchmark)
export function saveResults(results) {
  const { id, csvColumns, csvRows, inSummary = true, ...rest } = results;
  writeFileSync(new URL(`${id}.json`, RESULTS), JSON.stringify({ id, ...rest }));
  if (csvColumns) writeFileSync(new URL(`${id}.csv`, RESULTS), toCSV(csvRows ?? results.cases, csvColumns));
  // the run's summary, in the shared summary.json
  if (!inSummary) return;
  const file = new URL('summary.json', RESULTS);
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  all[id] = { title: results.title, environment: results.environment, seconds: results.seconds, summary: results.summary };
  writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
}

export const loadResults = (id) => {
  const file = new URL(`${id}.json`, RESULTS);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

// A data file's header: lines starting with '#' (SOURCE, LICENCE, DATE, SEED…) and the rest.
export function readDataFile(url) {
  const lines = readFileSync(url, 'utf8').split('\n');
  const header = {};
  const body = [];
  for (const line of lines) {
    const m = line.match(/^#\s*([A-Z]+):\s*(.*)$/);
    if (m) header[m[1]] = header[m[1]] ? `${header[m[1]]} ${m[2]}` : m[2];
    else if (line.trim() && !line.startsWith('#')) body.push(line);
  }
  return { header, lines: body };
}
