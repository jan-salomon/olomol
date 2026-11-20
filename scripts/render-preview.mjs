// Renders molecules (SMILES, laid out by RDKit) with our renderer into one
// PNG, to look at the drawing style without the app.
// Usage: node scripts/render-preview.mjs out.png [--pairs] [SMILES ...]
// (--pairs: show the lone pairs of all atoms but carbon)
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { readMolfile } from '../src/io/molfile.js';
import { buildScene } from '../src/render/scene.js';
import { sceneToSVG } from '../src/render/svg.js';

const args = process.argv.slice(2);
const pairs = args.includes('--pairs');
const [out = 'test-output/preview.png', ...smiles] = args.filter((a) => a !== '--pairs');
const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
const list = smiles.length ? smiles : [
  'CC(=O)Cl', 'OC(=O)c1ccccc1', 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', '[NH4+].[Cl-]', 'C[N+](=O)[O-]', 'CS(C)=O',
  'C=CC=O', 'N#CC(N)C(=O)O', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', '[13CH4]', 'C1CC1C(F)(F)F', 'c1ccc2ccccc2c1', 'O', 'Cl[Al](Cl)Cl',
];
const svgs = list.map((s) => {
  const mol = RDKit.get_mol(s);
  mol.set_new_coords();
  const { doc } = readMolfile(mol.get_molblock());
  mol.delete();
  if (pairs) for (const atom of doc.atoms.values()) if (atom.el !== 'C') atom.lonePairs = 'auto';
  return sceneToSVG(buildScene(doc), { scale: 50, background: 'white' });
});
const html = `<html><body style="margin:0;background:#ddd;display:flex;flex-wrap:wrap;gap:8px;padding:8px">${svgs.join('')}</body></html>`;
writeFileSync('test-output/preview.html', html);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('wrote', out);
