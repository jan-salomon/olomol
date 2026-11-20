// The browser check: files other programs wrote, from RDKit's own tests (tests/fixtures/rdkit: ChemDraw's
// CDXML and CDX, reactions as RXN), each opened with Ctrl+O as a user would, and what olomol drew compared
// (scripts/report/compare.mjs):
// - a CDXML with the molecules RDKit's tests expect from it (in tests/fixtures/rdkit/expected.json, from
//   Code/GraphMol/FileParsers/cdxml_parser_catch.cpp; either of RDKit's two readers, molecule by molecule);
//   where olomol reads it otherwise, with the molecules olomol reads and why (expected.json says);
// - an RXN with its molecules as RDKit reads each of them from the file: reactants and products in the row,
//   the agents on the arrow, a "+" between the reactants and between the products;
// - a file broken on purpose, or one olomol can't read (expected.json: fails): a message, nothing drawn.
// The same, with pictures of what olomol drew and of the file itself: npm run report:other-programs.
// Run alone: npm run check -- --only other-programs [url]
import { readFileSync } from 'node:fs';
import { RDKit, check, ctrlO, errors, page, state } from './harness.mjs';
import { comparing, fresh, listFiles, opened, readDrawing, root } from '../report/compare.mjs';
// (its parts, in the order run:)
//   every file of tests/fixtures/rdkit, opened and compared

export default async function run() {
  const expected = JSON.parse(readFileSync(new URL('expected.json', root), 'utf8'));
  const files = listFiles();
  const { judge } = comparing(RDKit);
  const missing = files.filter((f) => !f.endsWith('.rxn') && !expected[f]);
  const stray = Object.keys(expected).filter((f) => !f.startsWith('_') && !files.includes(f));
  check(!missing.length && !stray.length, `expected.json covers every CDXML and CDX file and no other file (missing: ${missing.join(', ') || 'none'}; not there: ${stray.join(', ') || 'none'})`);
  for (const file of files) {
    await state(fresh);
    const before = errors.length;
    const name = file.split('/').pop();
    await (await ctrlO()).setFiles({ name, mimeType: 'application/octet-stream', buffer: readFileSync(new URL(file, root)) });
    await page.waitForFunction(opened, name, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(150); // (the drawing settled: what is on the arrow placed by the scene)
    const got = await state(readDrawing);
    const own = errors.splice(before); // (a file that can't be read is said in the console too: '[open] …')
    const want = expected[file];
    if (want?.fails) check(own.every((e) => e.startsWith('[open]')), `${file}: only its error message in the console (${own.map((e) => e.slice(0, 100)).join(' | ')})`);
    else check(!own.length, `${file}: no errors in the console (${own.map((e) => e.slice(0, 100)).join(' | ')})`);
    for (const { ok, label } of judge(file, got, want, readFileSync(new URL(file, root), 'utf8')).checks) check(ok, label);
  }
}
