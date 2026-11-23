// B3 in the report: per molecule every engine's drawing in one row (rejected ones greyed and struck through,
// with the SMILES they would mean; the best by our measures framed; olomol's own pick marked), and at the top
// engines against data sets, with a bar chart.
import { esc, pctCi, table } from '../html.mjs';
import { barChart } from '../charts.mjs';
import { tex } from './b2common.mjs';

export const meta = {
  id: 'b3',
  title: 'B3 · Redraw: several engines, each checked',
  short: 'B3 Redraw',
  description: 'No single 2D layout engine is best everywhere: Redraw offers every engine\'s drawing, each checked by canonical SMILES, and the best of them is clean more often than any one engine alone (Ketcher has Indigo only).',
};
export const facets = [
  { key: 'set', label: 'Set' },
  { key: 'best', label: 'Best engine' },
  { key: 'rejected', label: 'Rejected engine' },
  { key: 'failed', label: 'Failed engine' },
  { key: 'paste', label: 'Paste' },
];
const short = (label) => label.replace('RDKit + ring template', 'RDKit+template').replace(', straightened', ' str.').replace('3D, projected, another view', '3D, 2nd view').replace('3D, projected', '3D').replace('Indigo clean-up', 'Indigo clean').replace('Indigo layout', 'Indigo');

export const headline = (r) => {
  const s = r.summary;
  const indigo = s.engines['Indigo layout'];
  return { big: pctCi(s.bestOfAllClean).split(' <')[0], text: `of ${s.molecules} molecules get at least one drawing with no clash or crossing from Redraw's engines together; Indigo alone (Ketcher's) ${(100 * indigo.clean.p).toFixed(1)} %. The best of all is better than Indigo's drawing for ${(100 * indigo.bestOfAllBeats.p).toFixed(1)} % of molecules; some engine's drawing was rejected by the SMILES check for ${(100 * s.anyRejected.p).toFixed(1)} %.` };
};
export const passFail = (r) => ({ pass: r.cases.filter((c) => c.pass).length, n: r.cases.length });

function engineTable(engines, labels) {
  return table(['Engine', 'Failed', 'Rejected by the check', 'Gave nothing', 'Clean (no clash, no crossing)', 'Best (own measures)', 'Best of all better than it', 'olomol\'s pick', 'Median ms'],
    labels.map((l) => {
      const e = engines[l];
      return [esc(l), e.failed, e.rejected, e.nothing, pctCi(e.clean), pctCi(e.best), pctCi(e.bestOfAllBeats), e.olomolPick, e.ms.median === null ? '–' : Math.round(e.ms.median)];
    }), { numeric: [1, 2, 3, 7, 8] });
}

export function figure(r) {
  const s = r.summary;
  const sets = ['bridged', 'macrocyclic', 'fused'];
  return {
    best: barChart({ categories: r.engines.map(short), series: sets.map((set) => ({ name: set, values: r.engines.map((l) => s.bySet[set].engines[l].best.p) })), percent: true, max: 1, yLabel: 'best drawing (share of molecules)', width: 820 }),
    rejected: barChart({ categories: r.engines.map(short), series: sets.map((set) => ({ name: set, values: r.engines.map((l) => s.bySet[set].engines[l].rejectedRate.p) })), percent: true, yLabel: 'rejected by the SMILES check (share of molecules)', width: 820, max: Math.max(0.05, ...sets.flatMap((set) => r.engines.map((l) => s.bySet[set].engines[l].rejectedRate.p))) }),
    clean: barChart({ categories: ['all engines', ...r.engines.map(short)], series: sets.map((set) => ({ name: set, values: [s.bySet[set].bestOfAllClean.p, ...r.engines.map((l) => s.bySet[set].engines[l].clean.p)] })), percent: true, max: 1, yLabel: 'a clean drawing (no clash, no crossing)', width: 860 }),
  };
}

// What each engine adds: molecules with a clean drawing offered by all engines, by all but one, and the fewest
// engines (chosen greedily) that reach the same.
export function contribution(r) {
  const cases = r.cases.filter((c) => c.engines && Object.keys(c.engines).length);
  const ok = (e) => e?.quality && e.outcome !== 'rejected';
  const clean = (c, set) => set.some((l) => ok(c.engines[l]) && c.engines[l].quality.problems === 0);
  const all = cases.filter((c) => clean(c, r.engines)).length;
  const without = r.engines.map((l) => {
    const rest = r.engines.filter((x) => x !== l);
    const lost = cases.filter((c) => clean(c, r.engines) && !clean(c, rest)).map((c) => c.id);
    const distinct = cases.filter((c) => c.engines[l].outcome === 'drawn').length;
    return { engine: l, lost, distinct };
  });
  const greedy = [];
  let covered = 0;
  while (covered < all) {
    let best = null;
    let n = -1;
    for (const l of r.engines) {
      if (greedy.some((g) => g.engine === l)) continue;
      const k = cases.filter((c) => clean(c, [...greedy.map((g) => g.engine), l])).length;
      if (k > n) [best, n] = [l, k];
    }
    greedy.push({ engine: best, covered: n });
    covered = n;
  }
  return { molecules: cases.length, all, without, greedy };
}

export function top(r) {
  const s = r.summary;
  const f = figure(r);
  const k = contribution(r);
  return `<div class="panel"><h2>All molecules (${s.molecules}${s.notFinished ? `; ${s.notFinished} did not finish` : ''})</h2>
  ${s.pasteChanged?.length ? `<p><b>Pasting changed ${s.pasteChanged.length} molecules</b> before any engine ran (RDKit's wedges lose a stereocentre or a ring double bond's E/Z): ${s.pasteChanged.map((id) => `<a href="#${esc(id)}">${esc(id)}</a>`).join(', ')}. Redraw checked their drawings against the changed molecule, and rejected ${s.rejectedButRight.length} drawings that were right.</p>` : ''}
  <p>A clean drawing offered for ${pctCi(s.bestOfAllClean)} of molecules. olomol's own pick (lowest drawingScore) is among the best by these measures for ${pctCi(s.olomolPickIsBest)}. A molecule takes ${s.secondsPerMolecule.median.toFixed(1)} s (median; 95th percentile ${s.secondsPerMolecule.p95.toFixed(1)} s) for all engines in Chrome.</p>
  ${engineTable(s.engines, r.engines)}
  <h3>What each engine adds</h3>
  <p>With all engines, a clean drawing for ${k.all} of ${k.molecules} molecules. The fewest engines that reach the same, added one by one (each the one adding most): ${k.greedy.map((g) => `${esc(g.engine)} → ${g.covered}`).join(', ')}.</p>
  ${table(['Engine', 'Its own drawing (not a duplicate of another)', 'Clean drawings lost without it', 'Molecules lost'], k.without.map((w) => [esc(w.engine), w.distinct, w.lost.length, w.lost.map((id) => `<a href="#${esc(id)}">${esc(id.replace(/^B3-/, ''))}</a>`).join(', ') || '–']), { numeric: [1, 2] })}
  ${f.clean}${f.best}${f.rejected}
  ${['bridged', 'macrocyclic', 'fused', 'brief'].map((set) => `<h3>${set} (${s.bySet[set].molecules}): a clean drawing offered for ${pctCi(s.bySet[set].bestOfAllClean)}</h3>${engineTable(s.bySet[set].engines, r.engines)}`).join('')}
  <p class="small muted">Measures (ours, bench/b3-redraw.mjs): bond-length coefficient of variation; clashes, atom pairs closer than 0.4 of the median bond length; crossings, bonds that cross; angle deviation, the mean over atoms of |angle − ideal| (360°/n round an atom with n ≥ 3 bonds; with two bonds the smallest ring's interior angle, else 120°, 180° at a triple bond). A drawing is better when it has fewer clashes and crossings, then when it is less irregular (CV/0.05 + angle deviation/10, by more than 0.05). "Best of all" is the best drawing any engine offered; an engine that failed or was rejected counts as beaten. Engines whose drawing was the one pasted (RDKit's) count with that drawing ("same as start"); one whose drawing equals another's, with that one's. Bridged systems are often drawn with crossing bonds on purpose (perspective), so "clean" is strict for them.</p></div>`;
}

export function caseView(c) {
  const engines = c.engines ?? {};
  const fmt = (q) => (q ? `CV ${q.cv.toFixed(3)} · ${q.clashes} clash${q.clashes === 1 ? '' : 'es'} · ${q.crossings} crossing${q.crossings === 1 ? '' : 's'} · angles ${q.angleDev.toFixed(1)}°` : '');
  const drawings = Object.entries(engines).map(([label, e]) => {
    const classes = [];
    if (e.outcome === 'rejected') classes.push('dim');
    if (c.best?.includes(label)) classes.push('framed');
    if (c.olomolPick === label) classes.push('chosen');
    const caption = {
      drawn: '', 'same as another': `same as ${esc(e.twinOf)}`, 'same as start': 'same as the pasted drawing',
      rejected: `rejected: would mean <code>${esc(e.meant ?? '?')}</code>${e.rightAfterAll ? ' — <b>the molecule as given</b>: the pasted drawing had changed it' : ''}`, failed: esc(e.reason), nothing: esc(e.reason),
    }[e.outcome];
    const marks = [c.best?.includes(label) ? 'best' : '', c.olomolPick === label ? 'olomol\'s pick' : ''].filter(Boolean).join(', ');
    return {
      key: e.key ?? null, text: e.key ? null : e.outcome, small: true, classes, label: `${label}${marks ? ` (${marks})` : ''}`, caption,
      metrics: `${fmt(e.quality)}${e.olomolScore !== undefined ? ` · olomol ${e.olomolScore}` : ''}${e.ms !== undefined ? ` · ${e.ms} ms` : ''}`,
    };
  });
  drawings.unshift({ key: `${c.id}:start`, small: true, label: 'pasted (start)', caption: 'RDKit, as a SMILES is pasted' });
  return {
    id: c.id, status: c.status, title: `${c.name} · ${c.atoms ?? '?'} atoms · ${c.seconds ?? '–'} s`, smiles: c.smiles,
    facets: { set: c.set, best: c.best ?? [], rejected: c.rejected ?? [], failed: c.failed ?? [], paste: c.pasteKept === false ? 'changed by pasting' : '' },
    reason: c.pasteKept === false ? `Pasting the SMILES changed the molecule (${c.pasted}), so Redraw checked against the wrong one. ${c.reason}` : c.reason,
    compareHeads: ['given', 'as pasted'],
    compare: c.pasted ? [{ label: 'canonical SMILES', expected: c.canonical, got: c.pasted }] : [],
    drawings,
    open: 0,
    notes: `Green frame: best by our measures; blue ring: olomol's own pick (lowest drawingScore); grey and struck through: dropped by the SMILES check.`,
  };
}

export function tableRows(r) {
  const s = r.summary;
  const rows = [];
  for (const set of ['bridged', 'macrocyclic', 'fused']) {
    const b = s.bySet[set];
    rows.push(`${set === 'bridged' ? 'B3 Redraw' : ''} & ${set} & ${b.molecules} & clean: all ${tex(b.bestOfAllClean)}, Indigo ${tex(b.engines['Indigo layout'].clean)} \\\\`);
  }
  rows.push(` & all (incl.\\ 5 from the brief) & ${s.molecules} & best of all $>$ Indigo: ${tex(s.engines['Indigo layout'].bestOfAllBeats)}; see Figure~\\ref{fig:redraw} \\\\`);
  return rows;
}
