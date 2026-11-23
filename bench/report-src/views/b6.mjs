// B6 in the report: each variant of a step beside the original, with both strings; each single change; each step's
// products; the time per step in Node and Chrome.
import { esc, num, pctCi, table } from '../html.mjs';
import { tex } from './b2common.mjs';

export const meta = {
  id: 'b6',
  title: 'B6 · The canonical form of a curved-arrow step',
  short: 'B6 canonical form',
  description: "get('canonicalForms') gives one string per curved-arrow step: the same for every drawing of the same step (ids, order, equivalent atoms, layout, hydrogens drawn), another for every single change of it; each arrow alone likewise; the products after a reaction arrow as written.",
};
export const facets = [
  { key: 'part', label: 'Test' },
  { key: 'kind', label: 'Variant / change' },
  { key: 'step', label: 'Step' },
];
export const headline = (r) => {
  const s = r.summary;
  return { big: pctCi(s.invariance).split(' <')[0], text: `of ${s.invariance.n} drawings of the same step give its string (without the hydrogen variants ${pctCi(s.invarianceWithoutH).split(' <')[0]}); ${s.distinctness.k} of ${s.distinctness.n} single changes give another; products right in ${s.products.k} of ${s.products.n} steps; ${num(s.node.median, 2)} ms a step in Node, ${s.chrome ? num(s.chrome.median, 1) : '–'} ms in Chrome (median).` };
};
export const passFail = (r) => {
  const judged = r.cases.filter((c) => c.status !== 'excluded');
  return { pass: judged.filter((c) => c.pass).length, n: judged.length, excluded: r.cases.length - judged.length };
};

export function top(r) {
  const s = r.summary;
  const p = s.perArrow;
  return `<div class="panel"><h2>${s.steps} steps, ${s.arrows} curved arrows</h2>
  <h3>Invariance (${s.variantsPerStep} variants a step, seed ${r.seed}): the same string</h3>
  ${table(['Variant', 'Drawings', 'Same string'], [['all', s.invariance.n, pctCi(s.invariance)], ['all but the hydrogen ones', s.invarianceWithoutH.n, pctCi(s.invarianceWithoutH)], ...Object.entries(s.invarianceByKind).map(([k, w]) => [`&nbsp;&nbsp;${esc(k)}`, w.n, pctCi(w)])], { numeric: [1] })}
  <p>Steps whose 20 variants all gave the same string: ${pctCi(s.stepsAllSame)}. Steps with an automorphism that moves an arrow (equivalent atoms to swap): ${s.equivalentMoves.steps}; every automorphism used keeps RDKit's canonical-ranking classes: ${s.equivalentMoves.classesKept ? 'yes' : '<b>no</b>'}.</p>
  <h3>Distinctness: another string for each single change</h3>
  ${table(['Change', 'Changes', 'Another string'], [['all', s.distinctness.n, pctCi(s.distinctness)], ...Object.entries(s.distinctnessByKind).map(([k, w]) => [`&nbsp;&nbsp;${esc(k)}`, w.n, pctCi(w)])], { numeric: [1] })}
  <p class="small muted">${s.distinctnessNotCounted} changes not counted (no non-equivalent atom to move a head to, or our own test found the change to be the same step).</p>
  <h3>Each arrow alone (curvedArrows)</h3>
  ${table(['', ''], [['In the invariance variants, each arrow\'s string the original arrow\'s', pctCi(p.invariance)], ['&nbsp;&nbsp;without the hydrogen variants', pctCi(p.invarianceWithoutH)], ['A changed arrow (not the same arrow on its own), another string', pctCi(p.distinctness)], ['An arrow not changed (or the same on its own), its string kept', pctCi(p.unchangedKept)]])}
  <h3>Products after a reaction arrow</h3>
  ${table(['', ''], [['Products\' canonical SMILES as written', pctCi(s.productsRight)], ['The step\'s string unchanged by them', pctCi(s.stepKeptWithProducts)]])}
  <h3>Time per step</h3>
  ${table(['', 'median', '95th percentile', 'max'], [
    ['Node: canonicalForms (median of 9 runs a step)', `${num(s.node.median, 2)} ms`, `${num(s.node.p95, 2)} ms`, `${num(s.node.max, 2)} ms (${esc(s.node.slowest)})`],
    ["Chrome: the bridge's get('canonicalForms'), round trip (median of 9 a step)", s.chrome ? `${num(s.chrome.median, 2)} ms` : 'not run', s.chrome ? `${num(s.chrome.p95, 2)} ms` : '', s.chrome ? `${num(s.chrome.max, 2)} ms` : ''],
  ])}
  ${s.chrome ? `<p>Chrome's string the same as Node's for every step: ${s.chrome.sameAsNode ? 'yes' : `<b>no</b> (${esc(s.chrome.differentInChrome.join(', '))})`}.</p>` : ''}
  ${table(['Step', 'Atoms', 'Arrows', 'Automorphisms kept', 'Moving an arrow', 'Node (ms)', 'Chrome (ms)'], r.stepFacts.map((f) => [esc(f.step), f.atoms, f.arrows, f.automorphisms, f.equivalentMoves, num(f.node.median, 2), f.chrome ? num(f.chrome.median, 2) : '–']), { numeric: [1, 2, 3, 4, 5, 6] })}
  <p class="small muted">Truth: ${esc(r.truth)}. Every variant is made by the benchmark's own code, never by canonical.js: ids renumbered at random (atoms, bonds and arrows, and the atoms and bonds stored in another order); the arrows' order shuffled; equivalent atoms: an automorphism applied to every arrow's ends at once; moved, turned: each molecule on its own; flipped: the whole drawing, wedges swapped as Flip does; redrawn: each molecule but a chair or Newman projection laid out by Indigo's layout (Redraw's first engine; indigo-ketcher's wasm called in Node); hydrogens drawn: on a random set of atoms with implicit H (RDKit's count), one or more drawn as atoms; left out: drawn H that no arrow uses, not on a chair or Newman projection. Every variant but those of ids or order alone also has its ids renumbered and its arrows reordered. A kind that a step has nothing for (no automorphism that moves an arrow, no H) is replaced by "turned and moved". Changes: a head on an atom chosen at random until our own test says the step is another; a fishhook (or, in a step of fishhooks only, a full arrowhead); a bond source made the lone pair of one of its atoms (an anion's, else a heteroatom's); a new-bond head from a bond made an atom head (from a lone pair, the two are the same by olomol's data model, so not tested); on chairs and Newman projections the H taken (axial, anti) swapped for the other H on its carbon, in every arrow.</p></div>`;
}

export function caseView(c) {
  const tag = c.step.replace(/[^\w+]+/g, '-').replace(/^-|-$/g, '');
  if (c.part === 'products') {
    return {
      id: c.id, status: c.status, title: `${c.step}: products`, smiles: c.written,
      facets: { part: 'products', kind: 'products', step: c.step },
      reason: c.reason,
      drawings: [{ key: `${c.id}:drawing`, label: 'the step, a reaction arrow, the products' }],
      open: 0,
      compareHeads: ['written (RDKit)', 'olomol'],
      compare: [{ label: 'products', expected: c.expected, got: c.got ?? '–' }, { label: 'step', expected: '(as without products)', got: c.stepKept ? '(the same)' : c.stepString ?? '–', plain: true, differs: !c.stepKept }],
    };
  }
  const arrows = c.perArrow ?? [];
  return {
    id: c.id, status: c.status, title: `${c.step}: ${c.kind}`,
    facets: { part: c.part, kind: c.kind, step: c.step },
    reason: c.reason,
    drawings: [
      { key: `${tag}:original`, label: 'original' },
      ...(c.status === 'excluded' && !c.expected ? [] : [{ key: `${c.id}:variant`, label: c.part === 'invariance' ? 'variant' : 'changed', caption: esc(c.made), classes: c.status === 'fail' ? ['red'] : [] }]),
    ],
    open: 1,
    compareHeads: ['original', c.part === 'invariance' ? 'variant (should be the same)' : 'changed (should differ)'],
    compare: c.expected ? [{ label: 'step', expected: c.expected, got: c.got ?? '–', differs: c.part === 'invariance' ? c.got !== c.expected : c.got === c.expected }] : [],
    tables: arrows.length ? [{
      title: 'Each arrow alone',
      columns: ['arrow', c.part === 'invariance' ? 'same as the original arrow' : 'changed', 'original', 'here'],
      rows: arrows.map((a) => [a.index + 1, c.part === 'invariance' ? (a.same ? 'yes' : 'no') : a.changed ? (a.aloneSame ? 'yes (the same arrow on its own)' : 'yes') : 'no', a.expected ?? '–', a.got ?? '–']),
      bad: arrows.flatMap((a, i) => ((c.part === 'invariance' ? !a.same : (a.changed && !a.aloneSame) ? a.got === a.expected : a.got !== a.expected) ? [i] : [])),
    }] : [],
    notes: c.made ? esc(c.made) : '',
  };
}

export function tableRows(r) {
  const s = r.summary;
  return [
    `B6 canonical form & ${s.steps} steps $\\times$ ${s.variantsPerStep} drawings of the same step & ${s.invariance.n} & ${tex(s.invariance)} same string${s.invarianceWithoutH.k - s.invarianceWithoutH.n === s.invariance.k - s.invariance.n ? '' : `; without H drawn or left out ${tex(s.invarianceWithoutH)}`} \\\\`,
    ` & single changes of a step & ${s.distinctness.n} & ${tex(s.distinctness)} another string \\\\`,
    ` & each arrow alone (in the variants / changed) & ${s.perArrow.invariance.n} / ${s.perArrow.distinctness.n} & ${tex(s.perArrow.invariance)} same${s.perArrow.invarianceWithoutH.k - s.perArrow.invarianceWithoutH.n === s.perArrow.invariance.k - s.perArrow.invariance.n ? '' : ` (without H variants ${tex(s.perArrow.invarianceWithoutH)})`}, ${tex(s.perArrow.distinctness)} another \\\\`,
    ` & products after the reaction arrow & ${s.products.n} & ${tex(s.products)} as written; ${num(s.node.median, 1)}\\,ms a step in Node, ${s.chrome ? num(s.chrome.median, 1) : '--'}\\,ms in Chrome (max ${num(s.node.max, 0)} / ${s.chrome ? num(s.chrome.max, 0) : '--'}) \\\\`,
  ];
}
