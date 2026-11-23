// B1 in the report: per molecule, olomol's drawing with its lone pairs and
// each disagreeing atom ringed, and a table per atom.
import { esc, pctCi, pct, ci, table } from '../html.mjs';

export const meta = {
  id: 'b1',
  title: 'B1 · Lone pairs and hydrogens compared with RDKit',
  short: 'B1 lone pairs and H',
  description: "olomol's own valence rules (src/chem/valence.js) give every atom the hydrogens and lone pairs RDKit's valence model gives.",
};

export const facets = [
  { key: 'set', label: 'Set' },
  { key: 'kind', label: 'Kind' },
  { key: 'element', label: 'Disagreeing element' },
  { key: 'category', label: 'Disagreement' },
];

export function headline(r) {
  const s = r.summary;
  return {
    big: pct(s.chembl.atomsAgree, 2),
    text: `of ${s.chembl.atomsAgree.n.toLocaleString('en')} atoms in ${s.chembl.molecules.toLocaleString('en')} ChEMBL molecules agree (95 % CI ${ci(s.chembl.atomsAgree, 2)}); hard set: ${s.hard.moleculesAgree.k} of ${s.hard.moleculesAgree.n} molecules agree, ${s.hard.excluded} not readable by RDKit.`,
  };
}

export function passFail(r) {
  const judged = r.cases.filter((c) => c.status !== 'excluded');
  return { pass: judged.filter((c) => c.pass).length, n: judged.length, excluded: r.cases.length - judged.length };
}

export function top(r) {
  const row = (name, s) => [name, s.molecules, s.excluded, pctCi(s.atomsAgree, 2), pctCi(s.moleculesAgree, 2), pctCi(s.pastedMoleculesAgree, 2), Object.entries(s.failuresByCategory).map(([k, v]) => `${esc(k)}: ${v}`).join('<br>') || '–'];
  return `<div class="panel"><h2>Results</h2>${table(['Set', 'Molecules', 'Not readable by RDKit', 'Atoms agree', 'Molecules agree (olomol\'s rules alone)', 'Molecules agree (read as a pasted SMILES)', 'Disagreements by kind'], [row('ChEMBL 37 sample', r.summary.chembl), row('Hard cases', r.summary.hard)], { numeric: [1, 2] })}
  <p class="small muted">A case passes when every atom has the same hydrogens and lone pairs as RDKit with olomol's rules alone: the hydrogen counts RDKit writes into the molfile for unusual atoms (radicals, metals) dropped, as for an atom drawn by hand. The last column reads the molfile as it is, as a pasted SMILES is read. Truth: ${esc(r.truth)}. RDKit has no lone pairs of its own; they are the ones its counts imply: (valence electrons − charge − bond orders − H − unpaired electrons) / 2. The drawings show olomol's lone pairs; disagreeing atoms are ringed in red.</p></div>`;
}

export function caseView(c) {
  const elements = [...new Set(c.disagreements.map((d) => d.el))];
  const view = {
    id: c.id,
    status: c.status,
    title: c.set === 'chembl' ? c.name : `${c.name}${c.note ? ` · ${c.note}` : ''}`,
    smiles: c.smiles,
    facets: { set: c.set === 'chembl' ? 'ChEMBL' : 'hard', kind: c.set === 'hard' ? c.kind : '', element: elements, category: c.category ?? '' },
    reason: c.reason,
    category: c.category,
    explanation: c.explanation,
    drawings: [{ key: c.id, label: 'olomol', caption: c.status === 'excluded' ? 'read without RDKit\'s checks' : 'its lone pairs shown', overlays: c.disagreements.map((d) => ({ atom: d.atomId })) }],
    open: 0,
    compareHeads: ['RDKit', 'olomol'],
    compare: c.status === 'excluded' ? [] : [
      { label: 'hydrogens (all atoms)', expected: c.hydrogens.rdkit, got: c.hydrogens.ours, plain: true },
      { label: 'lone pairs (all atoms)', expected: c.lonePairs.rdkit, got: c.lonePairs.ours, plain: true },
      { label: 'atoms agreeing', expected: c.atoms, got: c.agreeingAtoms, plain: true },
    ],
    tables: [],
  };
  if (c.disagreements.length) {
    view.tables.push({ title: 'Disagreeing atoms', columns: ['atom', 'charge', 'unpaired e⁻', 'bond orders', 'olomol H', 'olomol lone pairs', 'RDKit H', 'RDKit lone pairs'], rows: c.disagreements.map((d) => [`${d.el}${d.index + 1}`, d.charge, d.radicals, d.bondOrder, d.ours.hydrogens, d.ours.lonePairs, d.rdkit.hydrogens, d.rdkit.lonePairs]), bad: c.disagreements.map((_, i) => i) });
  }
  if (c.olomolOnly) view.tables.push({ title: "olomol's counts (no RDKit truth)", columns: ['atom', 'H', 'lone pairs'], rows: c.olomolOnly.map((a) => [`${a.el}${a.index + 1}`, a.hydrogens, a.lonePairs]) });
  if (c.status !== 'excluded' && c.pastedPass === false) view.notes = `Read as a pasted SMILES (the molfile's hydrogen counts kept), atoms ${c.pastedDisagreeAtoms.join(', ')} disagree too.`;
  else if (c.status === 'fail') view.notes = 'Read as a pasted SMILES (the molfile\'s hydrogen counts kept), every atom agrees.';
  return view;
}

export function tableRows(r) {
  const s = r.summary;
  const f = (w, d = 2) => { const e = w.lo > 0.9995 ? 3 : d; return `${(100 * w.p).toFixed(e)}\\,\\% (${(100 * w.lo).toFixed(e)}--${(100 * w.hi).toFixed(e)})`; };
  return [
    `B1 lone pairs and H vs.\\ RDKit & ChEMBL 37 sample (atoms) & ${s.chembl.atomsAgree.n} & ${f(s.chembl.atomsAgree)} atoms agree \\\\`,
    ` & ChEMBL 37 sample (molecules) & ${s.chembl.moleculesAgree.n} & ${f(s.chembl.moleculesAgree)} molecules agree \\\\`,
    ` & hard cases (molecules) & ${s.hard.moleculesAgree.n} & ${f(s.hard.moleculesAgree, 1)} molecules agree \\\\`,
  ];
}
