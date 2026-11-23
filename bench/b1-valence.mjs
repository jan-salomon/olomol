// B1: lone pairs and hydrogens from olomol's own rules (src/chem/valence.js)
// compared with RDKit, atom by atom.
//
// Each SMILES goes the way a pasted SMILES goes in the app: RDKit lays it
// out and writes a Kekulé molfile, olomol reads it (readMolfile) and works
// out every atom's hydrogens and lone pairs (electronsByAtom). Two modes:
// - 'rules' (the headline): the hydrogen counts RDKit writes into the
//   molfile for unusual atoms (radicals, metals: the valence field) are
//   dropped, so olomol's rules decide alone, as for an atom drawn by hand;
// - 'pasted': the molfile as it is, as a pasted SMILES is read.
// The truth is
// RDKit's: its implicit hydrogen count, and the lone pairs its counts imply
// (valence electrons − charge − bond orders − hydrogens − unpaired
// electrons, halved; RDKit itself has no notion of lone pairs).
// Data: data/b1-chembl.smi (10,000 from ChEMBL), data/b1-hard.tsv.
import { readDataFile, saveResults } from './lib/results.mjs';
import { writeFileSync } from 'node:fs';
import { docToJSON } from './lib/docjson.mjs';
import { environment } from './lib/env.mjs';
import { rdkit, src, valenceElectrons } from './lib/olomol.mjs';
import { wilson } from './lib/stats.mjs';
import { classify } from './b1-classify.mjs';

const started = performance.now();
const RDKit = await rdkit();
const { readMolfile } = await src('io/molfile.js');
const { electronsByAtom } = await src('chem/valence.js');

// RDKit's answer for each atom, and olomol's for the same molfile.
function compare(smiles, mode) {
  const mol = RDKit.get_mol(smiles);
  if (!mol) return { error: 'RDKit cannot read this SMILES', ...unchecked(smiles) };
  let molfile;
  let atoms;
  try {
    mol.set_new_coords();
    molfile = mol.get_molblock(JSON.stringify({ kekulize: true }));
    const { molecules: [m], defaults } = JSON.parse(mol.get_json());
    atoms = m.atoms.map((a) => ({ ...defaults.atom, ...a }));
  } finally {
    mol.delete();
  }
  // bond orders from the Kekulé form (what olomol reads)
  const kekule = RDKit.get_mol(molfile);
  const { molecules: [k], defaults: kd } = JSON.parse(kekule.get_json());
  kekule.delete();
  const order = atoms.map(() => 0);
  for (const bond of k.bonds ?? []) bond.atoms.forEach((i) => { order[i] += bond.bo ?? kd.bond.bo; });
  const rdkitCounts = atoms.map((a, i) => {
    const ve = valenceElectrons(a.z);
    return {
      el: a.z,
      hydrogens: a.impHs,
      lonePairs: ve === undefined ? null : Math.max(0, Math.floor((ve - a.chg - order[i] - a.impHs - a.nRad) / 2)),
      charge: a.chg,
      radicals: a.nRad,
      bondOrder: order[i],
    };
  });
  const start = performance.now();
  const { doc, atomIds } = readMolfile(molfile);
  if (mode === 'rules') for (const atom of doc.atoms.values()) atom.hCount = null;
  const electrons = electronsByAtom(doc);
  const ms = performance.now() - start;
  const ours = atomIds.map((id) => ({ hydrogens: electrons.get(id).hydrogens, lonePairs: electrons.get(id).lonePairs }));
  return { doc, atomIds, ours, rdkit: rdkitCounts, ms };
}

// What olomol makes of a SMILES RDKit can't read (ClF3): read without RDKit's checks, as olomol does for
// halogens with several bonds; shown in the report, not counted.
function unchecked(smiles) {
  const mol = RDKit.get_mol(smiles, JSON.stringify({ sanitize: false }));
  if (!mol) return {};
  try {
    mol.set_new_coords();
    const { doc, atomIds } = readMolfile(mol.get_molblock());
    const electrons = electronsByAtom(doc);
    for (const id of atomIds) if (electrons.get(id).lonePairs || doc.atoms.get(id).el !== 'C') doc.atoms.get(id).lonePairs = 'auto';
    return { doc, olomolOnly: atomIds.map((id, i) => ({ index: i, el: doc.atoms.get(id).el, hydrogens: electrons.get(id).hydrogens, lonePairs: electrons.get(id).lonePairs })) };
  } catch {
    return {};
  } finally {
    mol.delete();
  }
}

const SYMBOL = (z) => ['', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca'][z] ?? { 34: 'Se', 35: 'Br', 53: 'I', 54: 'Xe', 32: 'Ge', 33: 'As', 52: 'Te' }[z] ?? `Z${z}`;

const sets = [];
const chembl = readDataFile(new URL('data/b1-chembl.smi', import.meta.url));
sets.push({ set: 'chembl', header: chembl.header, rows: chembl.lines.map((line) => { const [id, smiles] = line.split('\t'); return { id: `B1-chembl-${id}`, name: id, smiles, kind: 'ChEMBL' }; }) });
const hard = readDataFile(new URL('data/b1-hard.tsv', import.meta.url));
sets.push({ set: 'hard', header: hard.header, rows: hard.lines.map((line) => { const [id, smiles, kind, note] = line.split('\t'); return { id: `B1-hard-${id}`, name: id, smiles, kind, note: note || '' }; }) });

const cases = [];
const drawings = {};
for (const { set, rows } of sets) {
  for (const row of rows) {
    const result = compare(row.smiles, 'rules');
    const c = { id: row.id, set, name: row.name, smiles: row.smiles, kind: row.kind, note: row.note ?? '' };
    if (result.error) {
      Object.assign(c, { status: 'excluded', pass: null, reason: `${result.error}: not counted. olomol's counts, read without RDKit's checks, are shown for a look by eye.`, atoms: 0, disagreements: [], olomolOnly: result.olomolOnly ?? null });
      if (result.doc) drawings[c.id] = docToJSON(result.doc);
      cases.push(c);
      continue;
    }
    // the same molecule read as a pasted SMILES is (the molfile's hydrogen counts kept)
    const pasted = compare(row.smiles, 'pasted');
    const pastedDisagree = pasted.ours.flatMap((o, i) => (o.hydrogens !== pasted.rdkit[i].hydrogens || (pasted.rdkit[i].lonePairs !== null && o.lonePairs !== pasted.rdkit[i].lonePairs) ? [i] : []));
    const { doc, atomIds, ours, rdkit: theirs } = result;
    const disagreements = [];
    ours.forEach((o, i) => {
      const r = theirs[i];
      if (o.hydrogens !== r.hydrogens || (r.lonePairs !== null && o.lonePairs !== r.lonePairs)) {
        disagreements.push({ index: i, atomId: atomIds[i], el: SYMBOL(r.el), charge: r.charge, radicals: r.radicals, bondOrder: r.bondOrder, ours: o, rdkit: { hydrogens: r.hydrogens, lonePairs: r.lonePairs } });
      }
    });
    const pass = disagreements.length === 0;
    const words = disagreements.map((d) => {
      const parts = [];
      if (d.ours.hydrogens !== d.rdkit.hydrogens) parts.push(`${d.ours.hydrogens} H here, RDKit ${d.rdkit.hydrogens}`);
      if (d.ours.lonePairs !== d.rdkit.lonePairs) parts.push(`${d.ours.lonePairs} lone pair${d.ours.lonePairs === 1 ? '' : 's'} here, RDKit ${d.rdkit.lonePairs}`);
      return `${d.el}${d.index + 1} has ${parts.join('; ')}`;
    });
    const { category, explanation } = pass ? { category: null, explanation: '' } : classify(c, disagreements);
    // every atom with lone pairs shows them in the drawing; carbons with a charge or radical too
    for (const [i, id] of atomIds.entries()) {
      const atom = doc.atoms.get(id);
      if (ours[i].lonePairs || theirs[i].lonePairs || atom.el !== 'C') atom.lonePairs = 'auto';
    }
    drawings[c.id] = docToJSON(doc);
    Object.assign(c, {
      status: pass ? 'pass' : 'fail',
      pass,
      atoms: atomIds.length,
      hydrogens: { ours: ours.reduce((s, o) => s + o.hydrogens, 0), rdkit: theirs.reduce((s, r) => s + r.hydrogens, 0) },
      lonePairs: { ours: ours.reduce((s, o) => s + o.lonePairs, 0), rdkit: theirs.reduce((s, r) => s + (r.lonePairs ?? 0), 0) },
      agreeingAtoms: atomIds.length - disagreements.length,
      disagreements,
      reason: words.join('; '),
      category,
      explanation,
      ms: Math.round(result.ms * 1000) / 1000,
      pastedPass: pastedDisagree.length === 0,
      pastedDisagreeAtoms: pastedDisagree.map((i) => i + 1),
    });
    cases.push(c);
  }
}

const summarise = (list) => {
  const compared = list.filter((c) => c.status !== 'excluded');
  const atoms = compared.reduce((s, c) => s + c.atoms, 0);
  const agreeing = compared.reduce((s, c) => s + c.agreeingAtoms, 0);
  const byCategory = {};
  for (const c of compared.filter((c) => !c.pass)) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  return {
    molecules: list.length,
    excluded: list.length - compared.length,
    atomsAgree: wilson(agreeing, atoms),
    moleculesAgree: wilson(compared.filter((c) => c.pass).length, compared.length),
    pastedMoleculesAgree: wilson(compared.filter((c) => c.pastedPass).length, compared.length),
    failuresByCategory: byCategory,
  };
};
const summary = { chembl: summarise(cases.filter((c) => c.set === 'chembl')), hard: summarise(cases.filter((c) => c.set === 'hard')) };
const RDKitVersion = RDKit.version();
const env = await environment(RDKit);
writeFileSync(new URL('out/b1-drawings.json', import.meta.url), JSON.stringify(drawings));
saveResults({
  id: 'b1',
  title: 'B1: lone pairs and hydrogens compared with RDKit',
  environment: env,
  seconds: Math.round((performance.now() - started) / 100) / 10,
  truth: `RDKit ${RDKitVersion} (@rdkit/rdkit ${env.rdkitJs}): implicit hydrogens; lone pairs implied by its valence model`,
  data: Object.fromEntries(sets.map((s) => [s.set, s.header])),
  summary,
  cases,
  csvColumns: ['id', 'set', 'name', 'smiles', 'kind', 'status', 'atoms', 'agreeingAtoms', 'category', 'reason', 'pastedPass'],
});
console.log(JSON.stringify(summary, null, 1));
console.log(`${((performance.now() - started) / 1000).toFixed(1)} s`);
