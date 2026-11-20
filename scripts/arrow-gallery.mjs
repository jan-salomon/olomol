// Draws textbook mechanisms (molecules from SMILES, laid out by RDKit) with
// our lone pairs and curved arrows into one picture, to judge the arrow
// rules by eye. Usage: node scripts/arrow-gallery.mjs [out.png] [--debug]
// Atoms are named by element and charge ("O-", "C+"), the nth one with
// "#n" (counting from 0); bonds as "C=O", "C-Br", "C#N" with an optional
// "#n" after them, e.g. "C=C#1".
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { readMolfile } from '../src/io/molfile.js';
import { addCurve, emptyDoc } from '../src/model/doc.js';
import { buildScene } from '../src/render/scene.js';
import { sceneToSVG } from '../src/render/svg.js';

export const MECHANISMS = [
  { name: 'Acyl substitution', smiles: '[OH-].CC(=O)Cl', arrows: [['O-', 'C#1'], ['C=O', 'O']] },
  { name: 'SN2', smiles: '[OH-].CBr', arrows: [['O-', 'C'], ['C-Br', 'Br']] },
  { name: 'E2', smiles: '[OH-].[H]C([H])([H])C([H])([H])Br', arrows: [['O-', 'H#0'], ['C-H', 'C-C'], ['C-Br', 'Br']] },
  { name: 'HBr addition', smiles: 'CC=C.[H]Br', arrows: [['C=C', 'H'], ['H-Br', 'Br']] },
  { name: 'Enolate alkylation', smiles: 'C=C([O-])C.CI', arrows: [['O-', 'O--C'], ['C=C', 'C#3'], ['C-I', 'I']] },
  { name: 'Aldol addition', smiles: 'C=C[O-].CC=O', arrows: [['O-', 'O--C'], ['C=C', 'C#3'], ['C=O', 'O']] },
  { name: 'Acylium formation', smiles: 'CC(=O)Cl.Cl[Al](Cl)Cl', arrows: [['Cl#0', 'Al'], ['C-Cl#0', 'Cl#0']] },
  { name: 'Aromatic acylation', smiles: 'c1ccccc1.CC#[O+]', arrows: [['C=C#0', 'C#7'], ['C#O+', 'O+']] },
  { name: 'Radical chlorination', smiles: '[CH3].ClCl', arrows: [['C', 'Cl#0', 1], ['Cl-Cl', 'Cl#0', 1], ['Cl-Cl', 'Cl#1', 1]] },
  { name: 'Homolysis', smiles: 'ClCl', arrows: [['Cl-Cl', 'Cl#0', 1], ['Cl-Cl', 'Cl#1', 1]] },
  { name: 'Carbonyl addition', smiles: '[C-]#N.CC(C)=O', arrows: [['C-', 'C#1'], ['C=O', 'O']] },
  { name: 'Proton transfer', smiles: 'O.[H]Cl', arrows: [['O', 'H'], ['H-Cl', 'Cl']] },
];

// Atoms and bonds by name (see above).
function finder(doc) {
  const is = (atom, name) => {
    const [, el, sign] = name.match(/^([A-Z][a-z]?)([+-]?)$/);
    return atom.el === el && (sign === '-' ? atom.charge < 0 : sign === '+' ? atom.charge > 0 : !atom.charge);
  };
  return (spec) => {
    const bond = spec.match(/^([A-Z][a-z]?[+-]?)([-=#])([A-Z][a-z]?[+-]?)(?:#(\d+))?$/);
    if (bond && !/^[A-Z][a-z]?[+-]?#\d+$/.test(spec)) {
      const order = { '-': 1, '=': 2, '#': 3 }[bond[2]];
      const list = [...doc.bonds.values()].filter((b) => {
        const [x, y] = [doc.atoms.get(b.a), doc.atoms.get(b.b)];
        return b.order === order && ((is(x, bond[1]) && is(y, bond[3])) || (is(x, bond[3]) && is(y, bond[1])));
      });
      if (!list[Number(bond[4] ?? 0)]) throw new Error(`no bond ${spec}`);
      return { bond: list[Number(bond[4] ?? 0)].id };
    }
    const [name, nth = 0] = spec.split('#');
    const atom = [...doc.atoms.values()].filter((a) => is(a, name))[nth];
    if (!atom) throw new Error(`no atom ${spec}`);
    return { atom: atom.id };
  };
}

// The molecules side by side, each laid out by RDKit on its own (as pasting does).
export function mechanismDoc(RDKit, { smiles, arrows }) {
  const doc = emptyDoc();
  let x = 0;
  for (const part of smiles.split('.')) {
    const mol = RDKit.get_mol(part, JSON.stringify({ removeHs: false }));
    mol.set_new_coords();
    if (mol.get_num_atoms() > 2) mol.normalize_depiction(1);
    const { atomIds } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })), doc);
    mol.delete();
    const atoms = atomIds.map((id) => doc.atoms.get(id));
    const [minX, maxX] = [Math.min(...atoms.map((a) => a.x)), Math.max(...atoms.map((a) => a.x))];
    const midY = (Math.min(...atoms.map((a) => a.y)) + Math.max(...atoms.map((a) => a.y))) / 2;
    for (const a of atoms) {
      a.x += x - minX;
      a.y -= midY;
    }
    x += maxX - minX + 2.2;
  }
  const find = finder(doc);
  for (const atom of doc.atoms.values()) if (atom.el !== 'C' && atom.el !== 'H') atom.lonePairs = 'auto';
  for (const [from, to, electrons = 2] of arrows) {
    const start = find(from);
    // one electron from an atom with an unpaired one: that one
    if (electrons === 1 && start.atom !== undefined && doc.atoms.get(start.atom).radical) start.radical = true;
    addCurve(doc, start, find(to), electrons, { color: '#d40000' });
  }
  return doc;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv.find((a) => a.endsWith('.png')) ?? 'test-output/arrow-gallery.png';
  const debug = process.argv.includes('--debug');
  const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  const cells = MECHANISMS.map((m) => {
    const scene = buildScene(mechanismDoc(RDKit, m), undefined, { debug });
    const costs = debug ? [...scene.curves.values()].map((g) => g.debug.best.cost.toFixed(2)).join(' ') : '';
    return `<figure><figcaption>${m.name} ${costs}</figcaption>${sceneToSVG(scene, { scale: 46, background: 'white' })}</figure>`;
  });
  const html = `<html><body style="margin:0;background:#e5e7eb;font:13px sans-serif;display:flex;flex-wrap:wrap;gap:6px;padding:6px">
    <style>figure{margin:0;background:white;padding:4px}figcaption{color:#555}</style>${cells.join('')}</body></html>`;
  mkdirSync('test-output', { recursive: true });
  writeFileSync('test-output/arrow-gallery.html', html);
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await page.setContent(html);
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log('wrote', out);
}
