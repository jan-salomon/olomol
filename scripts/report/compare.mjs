// How what olomol read from another program's file is compared with what it should be, for the browser check
// (scripts/check/11-other-programs.mjs) and its report (scripts/other-programs-report.mjs). `RDKit`: RDKit.js.
// Molecules are compared as canonical SMILES (RDKit's), the drawing's a molfile each (group labels: *), atom
// maps and the numbers of R-groups left out, "any" bonds (~) as single.
import { readdirSync } from 'node:fs';

export const root = new URL('../../tests/fixtures/rdkit/', import.meta.url);
export const listFiles = () => ['CDXML', 'CDXML/queries', 'ChemReactions'].flatMap((dir) => readdirSync(new URL(`${dir}/`, root)).filter((f) => /\.(cdxml|cdx|rxn)$/i.test(f)).map((f) => `${dir}/${f}`)).sort();

export function comparing(RDKit) {
  const read = (text) => RDKit.get_mol(text) ?? RDKit.get_mol(text, JSON.stringify({ sanitize: false })); // (unsanitized as RDKit's own test reads github7467)
  const plainer = (smiles) => smiles.replace(/\[([^\]:]+):\d+\]/g, '[$1]').replace(/\[\d+\*\]/g, '*').replace(/~/g, '-');
  // a molecule (SMILES or a molfile) as compared: canonical SMILES of each of its parts
  function parts(text) {
    const mol = read(/\n/.test(text) ? text : plainer(text.split(' ')[0]));
    if (!mol) return ['(not read by RDKit)'];
    try {
      return mol.get_smiles().split('.').map((part) => {
        const again = read(plainer(part));
        if (!again) return part;
        try {
          return again.get_smiles();
        } finally {
          again.delete();
        }
      });
    } finally {
      mol.delete();
    }
  }
  const sorted = (list) => list.flatMap(parts).sort();
  const heavyAtoms = (smiles) => {
    const mol = read(smiles);
    try {
      return mol ? JSON.parse(mol.get_descriptors()).NumHeavyAtoms : 0;
    } finally {
      mol?.delete();
    }
  };
  // an RXN file's molecules as RDKit reads each of them: { reactants, agents, products } (SMILES)
  function rxnMolecules(text) {
    text = text.replace(/\r/g, '');
    const smiles = (molfile) => parts(molfile).join('.');
    if (/^\$RXN V3000/.test(text)) {
      const part = (name) => {
        const start = text.indexOf(`M  V30 BEGIN ${name}`);
        if (start < 0) return [];
        const block = text.slice(start, text.indexOf(`M  V30 END ${name}`, start));
        return [...block.matchAll(/M {2}V30 BEGIN CTAB[\s\S]*?M {2}V30 END CTAB/g)].map((m) => smiles(`\n  olomol\n\n  0  0  0     0  0            999 V3000\n${m[0]}\nM  END\n`));
      };
      return { reactants: part('REACTANT'), agents: part('AGENT'), products: part('PRODUCT') };
    }
    const [r, p, a = 0] = text.split('\n')[4].match(/.{1,3}/g).map(Number);
    const blocks = text.split(/^\$MOL[ \t]*\n/m).slice(1).map(smiles);
    return { reactants: blocks.slice(0, r), products: blocks.slice(r, r + p), agents: blocks.slice(r + p, r + p + a) };
  }
  // RDKit's molecules for a CDXML: either of its two readers' (expected.json: rdkit, rdkitChemDraw), molecule by molecule
  function matchesRDKit(molecules, { rdkit, rdkitChemDraw = rdkit }) {
    const left = rdkit.flatMap((smiles, k) => {
      const [a, b] = [parts(smiles), parts(rdkitChemDraw[k] ?? smiles)];
      return a.map((part, i) => new Set([part, b[i] ?? part]));
    });
    for (const molecule of molecules) {
      const k = left.findIndex((either) => either.has(molecule));
      if (k < 0) return false;
      left.splice(k, 1);
    }
    return !left.length;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // What olomol read (`got`: { error } or { molfiles, arrows, pluses, riding }) judged against `want` (its entry in
  // expected.json, or {}), `text` the file's own text: { checks: [{ ok, label }], wanted (molecules), against
  // ('rdkit' | 'rdkit-file' | 'olomol' | 'fails'), molecules (olomol's) }.
  function judge(file, got, want = {}, text = '') {
    const checks = [];
    const label = `${file}${want.why ? ` (${want.why})` : ''}`;
    const shown = (list) => (list.length > 6 ? `${list.length} molecules` : list.join(' '));
    if (want.fails) {
      checks.push({ ok: got.error !== undefined, label: `${label}: not opened, with a message (${got.error ?? `opened: ${sorted(got.molfiles).length} molecules`})` });
      return { checks, against: 'fails', wanted: [], molecules: got.error === undefined ? sorted(got.molfiles) : null };
    }
    if (got.error !== undefined) {
      checks.push({ ok: false, label: `${label}: opens (${got.error})` });
      return { checks, against: 'olomol', wanted: [], molecules: null };
    }
    const molecules = sorted(got.molfiles);
    if (file.endsWith('.rxn')) {
      const reaction = rxnMolecules(text);
      const wanted = want.molecules ? sorted(want.molecules) : sorted([...reaction.reactants, ...reaction.agents, ...reaction.products]);
      const ok = same(molecules, wanted);
      checks.push({ ok, label: `${label}: ${want.molecules ? 'the molecules as olomol reads them' : 'the molecules RDKit reads from the file'} (${ok ? shown(wanted) : `got ${molecules.join(' ')}, wanted ${wanted.join(' ')}`})` });
      const pluses = Math.max(0, reaction.reactants.length - 1) + Math.max(0, reaction.products.length - 1);
      const riding = reaction.agents.reduce((n, smiles) => n + heavyAtoms(smiles), 0);
      checks.push({ ok: got.arrows === 1 && got.pluses === pluses && got.riding === riding, label: `${file}: 1 arrow, ${pluses} "+", the agents on the arrow (${riding} atoms) (${got.arrows}, ${got.pluses}, ${got.riding})` });
      return { checks, against: want.molecules ? 'olomol' : 'rdkit-file', wanted, molecules, reaction };
    }
    if (!want.why && want.rdkit) {
      const ok = matchesRDKit(molecules, want);
      checks.push({ ok, label: `${file}: the molecules RDKit's tests expect (${ok ? shown(molecules) : `got ${molecules.join(' ')}`})` });
      return { checks, against: 'rdkit', wanted: sorted(want.rdkit), molecules };
    }
    const wanted = sorted(want.molecules ?? []);
    const ok = same(molecules, wanted);
    checks.push({ ok, label: `${label}: the molecules as olomol reads them (${ok ? shown(wanted) : `got ${molecules.join(' ')}, wanted ${wanted.join(' ')}`})` });
    return { checks, against: 'olomol', wanted, molecules };
  }
  return { parts, sorted, rxnMolecules, matchesRDKit, judge };
}

// What the page shows after a file is opened (in the browser): { error } or { molfiles, arrows, pluses, riding }.
export const readDrawing = async () => {
  const doc = olomol.doc;
  if (!doc.atoms.size) return { error: (document.querySelector('.notice')?.textContent ?? '').replace(/^Could not open [^:]*: /, '').slice(0, 160) };
  const [arrow] = [...doc.arrows.values()].filter((a) => a.kind !== 'dipole');
  const riding = arrow ? [...doc.atoms.values()].filter((a) => a.arrow === arrow.id && a.el !== 'H').length : 0;
  return { molfiles: await window.olomolTest.molfiles(), arrows: doc.arrows.size, pluses: doc.pluses.size, riding, labels: [...doc.atoms.values()].filter((a) => a.alias).length };
};
// Whether the file `name`, opened with Ctrl+O, is drawn or refused (in the browser; its own message, not one
// left from the file before).
export const opened = (name) => olomol.doc.atoms.size > 0 || (document.querySelector('.notice')?.textContent ?? '').includes(`Could not open ${name}`);
// An empty drawing and no message, before the next file (in the browser).
export const fresh = () => {
  olomol.setDoc({ atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), nextId: 1 });
  olomol.setTool({ name: 'select' });
  olomol.notice = null;
  olomol.emit();
};
