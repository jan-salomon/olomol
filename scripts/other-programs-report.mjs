// A report of how olomol reads other programs' files (RDKit's test files, tests/fixtures/rdkit): each file
// opened as in the browser check (scripts/check/11-other-programs.mjs), judged the same way
// (scripts/report/compare.mjs), and shown three times: as the file draws itself (a CDXML from its own
// coordinates and labels, scripts/report/cdxml-svg.mjs; an RXN, which has none, as RDKit draws its molecules),
// as olomol drew it (its SVG export), and the molecules RDKit's tests expect, drawn by RDKit.
//
//   npm run report:other-programs [url]     (default: the dev server at http://localhost:5173/; a built site works too)
//
// Writes test-output/other-programs/: index.html, and file/, olomol/, rdkit/ with a picture each.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { cdxmlToSvg } from './report/cdxml-svg.mjs';
import { comparing, fresh, listFiles, opened, readDrawing, root } from './report/compare.mjs';

const url = new URL(process.argv[2] ?? 'http://localhost:5173/');
url.searchParams.set('test', '');
const out = new URL('../test-output/other-programs/', import.meta.url);
rmSync(out, { recursive: true, force: true });
for (const dir of ['file', 'olomol', 'rdkit']) mkdirSync(new URL(`${dir}/`, out), { recursive: true });

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
const { judge, parts } = comparing(RDKit);
const expected = JSON.parse(readFileSync(new URL('expected.json', root), 'utf8'));
const files = listFiles();
const slug = (file) => file.replace(/[/.]/g, '_');

// molecules side by side as RDKit draws them (an RXN's: reactants + … → products, the agents over the arrow)
const MOL = { w: 200, h: 150 };
function moleculeSvg(smiles, w = MOL.w, h = MOL.h) {
  const mol = RDKit.get_mol(smiles) ?? RDKit.get_mol(smiles, JSON.stringify({ sanitize: false }));
  if (!mol) return null;
  try {
    return mol.get_svg(w, h).replace(/<\?xml[^>]*>/, '').replace(/<!-- END OF HEADER -->/, '');
  } finally {
    mol.delete();
  }
}
const nested = (svg, x, y, w, h) => svg.replace(/<svg\b([^>]*)>/, (tag, attrs) => `<svg${attrs.replace(/\s(width|height|x|y)=['"][^'"]*['"]/g, '')} x="${x}" y="${y}" width="${w}" height="${h}">`);
function row(items) {
  // items: { svg } molecules, { text } signs, { arrow, over: [svg] }
  let x = 0;
  const pieces = [];
  const h = MOL.h + 70;
  for (const item of items) {
    if (item.svg) {
      pieces.push(nested(item.svg, x, 60, MOL.w, MOL.h));
      x += MOL.w;
    } else if (item.text) {
      pieces.push(`<text x="${x + 15}" y="${60 + MOL.h / 2 + 8}" font-size="26" text-anchor="middle" font-family="Arial, sans-serif">${item.text}</text>`);
      x += 30;
    } else if (item.arrow) {
      const width = Math.max(120, item.over.length * 110);
      item.over.forEach((svg, k) => pieces.push(nested(svg, x + k * 110, 0, 110, 82)));
      pieces.push(`<line x1="${x + 6}" y1="${60 + MOL.h / 2}" x2="${x + width - 10}" y2="${60 + MOL.h / 2}" stroke="#000" stroke-width="2"/><polygon points="${x + width - 4},${60 + MOL.h / 2} ${x + width - 16},${60 + MOL.h / 2 - 6} ${x + width - 16},${60 + MOL.h / 2 + 6}"/>`);
      x += width;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${h}" width="${x}" height="${h}"><rect width="${x}" height="${h}" fill="#fff"/>${pieces.join('')}</svg>`;
}
function grid(smilesList, columns = 4) {
  const shown = smilesList.slice(0, 12);
  const rows = Math.ceil(shown.length / columns);
  const w = Math.min(columns, shown.length) * MOL.w;
  const cells = shown.map((s, k) => {
    const svg = moleculeSvg(s);
    const [x, y] = [(k % columns) * MOL.w, Math.floor(k / columns) * MOL.h];
    return svg ? nested(svg, x, y, MOL.w, MOL.h) : `<text x="${x + 10}" y="${y + 70}" font-size="12" font-family="monospace">${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${rows * MOL.h}" width="${w}" height="${rows * MOL.h}"><rect width="${w}" height="${rows * MOL.h}" fill="#fff"/>${cells.join('')}</svg>`;
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));
await page.goto(url.href);
await page.waitForFunction(() => window.olomol && window.olomolTest, null, { timeout: 60_000 });

const entries = [];
for (const file of files) {
  const text = readFileSync(new URL(file, root), 'utf8');
  await page.evaluate(fresh);
  const before = consoleErrors.length;
  // (the Open button: the browser check tests Ctrl+O itself)
  const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
  await page.getByTitle(/^Open a file/).click();
  await (await chooser).setFiles({ name: file.split('/').pop(), mimeType: 'application/octet-stream', buffer: readFileSync(new URL(file, root)) });
  await page.waitForFunction(opened, file.split('/').pop(), { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(150);
  const got = await page.evaluate(readDrawing);
  const own = consoleErrors.splice(before);
  const want = expected[file] ?? {};
  const result = judge(file, got, want, text);
  const consoleOk = want.fails ? own.every((e) => e.startsWith('[open]')) : !own.length;
  const images = {};
  if (got.error === undefined) {
    writeFileSync(new URL(`olomol/${slug(file)}.svg`, out), await page.evaluate(() => window.olomolTest.svg()));
    images.olomol = `olomol/${slug(file)}.svg`;
  }
  try {
    if (file.endsWith('.cdxml')) {
      writeFileSync(new URL(`file/${slug(file)}.svg`, out), cdxmlToSvg(text));
      images.file = `file/${slug(file)}.svg`;
    } else if (file.endsWith('.rxn')) {
      const reaction = result.reaction ?? comparing(RDKit).rxnMolecules(text);
      const molecules = (list) => list.map((s) => moleculeSvg(parts(s).join('.'))).filter(Boolean);
      const join = (svgs) => svgs.flatMap((svg, k) => (k ? [{ text: '+' }, { svg }] : [{ svg }]));
      writeFileSync(new URL(`file/${slug(file)}.svg`, out), row([...join(molecules(reaction.reactants)), { arrow: true, over: molecules(reaction.agents).map((svg) => svg) }, ...join(molecules(reaction.products))]));
      images.file = `file/${slug(file)}.svg`;
    }
  } catch (error) {
    images.fileError = String(error.message ?? error);
  }
  const rdkitList = want.rdkitChemDraw ?? want.rdkit;
  if (rdkitList?.length) {
    writeFileSync(new URL(`rdkit/${slug(file)}.svg`, out), grid(rdkitList.flatMap((s) => s.split(' ')[0].split('.')).map((s) => parts(s)[0])));
    images.rdkit = `rdkit/${slug(file)}.svg`;
  }
  const ok = consoleOk && result.checks.every((c) => c.ok);
  entries.push({
    file, kind: file.startsWith('ChemReactions') ? 'rxn' : file.includes('/queries/') ? 'query' : file.endsWith('.cdx') ? 'cdx' : 'cdxml',
    ok, against: result.against, why: want.why ?? null, reference: Boolean(want.rdkit || file.endsWith('.rxn')), error: got.error ?? null, checks: result.checks,
    console: own.map((e) => e.slice(0, 200)), molecules: result.molecules, wanted: result.wanted,
    rdkitCount: rdkitList ? rdkitList.flatMap((s) => s.split(' ')[0].split('.')).length : 0, images,
  });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}`);
}
await browser.close();

const build = { at: new Date().toISOString(), url: url.origin + url.pathname, files: entries.length, passed: entries.filter((e) => e.ok).length };
const template = readFileSync(new URL('report/other-programs.html', import.meta.url), 'utf8');
writeFileSync(new URL('index.html', out), template.replace('/*DATA*/null', JSON.stringify({ build, entries }).replace(/</g, '\\u003c')));
console.log(`${build.passed} of ${build.files} files as they should be: ${new URL('index.html', out).pathname}`);
