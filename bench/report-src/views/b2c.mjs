// B2c in the report: a gallery of distorted chairs and of hexagons that are no chairs, each framed green
// (recognised as a chair) or red; recall against noise at the top.
import { esc, pctCi, table } from '../html.mjs';
import { lineChart } from '../charts.mjs';
import { wilson } from '../../lib/stats.mjs';
import { tex } from './b2common.mjs';

export const meta = {
  id: 'b2c',
  title: 'B2c · Chairs drawn by hand',
  short: 'B2c hand-drawn chairs',
  description: 'A chair drawn by hand (turned, sheared, stretched, uneven, shaky) is recognised by its shape and read as the stereoisomer it shows; hexagons that are no chairs are not taken for one.',
};
export const layout = 'gallery';
export const facets = [
  { key: 'kind', label: 'Kind' },
  { key: 'class', label: 'Class' },
  { key: 'sigma', label: 'σ' },
  { key: 'recognised', label: 'Recognised' },
];
export const headline = (r) => {
  const s = r.summary;
  return { big: pctCi(s.recallBySigma['0.05']).split(' <')[0], text: `of chairs with vertex noise σ = 0.05 bond lengths are recognised (σ = 0: ${(100 * s.recallBySigma['0'].p).toFixed(1)} %, σ = 0.1: ${(100 * s.recallBySigma['0.1'].p).toFixed(1)} %); stereo right in ${s.stereoRight.k}/${s.stereoRight.n} recognised; ${s.falsePositive.k} of ${s.falsePositive.n} non-chairs taken for a chair.` };
};
export const passFail = (r) => ({ pass: r.cases.filter((c) => c.pass).length, n: r.cases.length });

export function top(r) {
  const s = r.summary;
  const sigmas = Object.keys(s.recallBySigma).map(Number);
  const chart = lineChart({
    xLabel: 'vertex noise σ (bond lengths)', yLabel: 'share of chairs',
    series: [
      { name: 'recognised as a chair', points: sigmas.map((x) => ({ x, y: s.recallBySigma[x].p, lo: s.recallBySigma[x].lo, hi: s.recallBySigma[x].hi })) },
      { name: 'of those, stereo right', points: sigmas.filter((x) => s.stereoRightBySigma[x].n).map((x) => ({ x, y: s.stereoRightBySigma[x].p, lo: s.stereoRightBySigma[x].lo, hi: s.stereoRightBySigma[x].hi })) },
    ],
  });
  // what hurts: recall at σ = 0.1 by the size of each other distortion
  const at = r.cases.filter((c) => c.kind === 'positive' && c.sigma === 0.1);
  const bin = (name, test) => { const list = at.filter(test); return [name, list.length, pctCi(wilson(list.filter((c) => c.recognised).length, list.length))]; };
  const ablation = [
    bin('turn under 10°', (c) => Math.abs(c.params.turn) < 10), bin('turn 10–20°', (c) => Math.abs(c.params.turn) >= 10),
    bin('|shear| under 0.1', (c) => Math.abs(c.params.shear) < 0.1), bin('|shear| 0.1–0.2', (c) => Math.abs(c.params.shear) >= 0.1),
    bin('aspect under 0.9', (c) => c.params.aspect < 0.9), bin('aspect 0.9–1.1', (c) => c.params.aspect >= 0.9 && c.params.aspect <= 1.1), bin('aspect over 1.1', (c) => c.params.aspect > 1.1),
  ];
  return `<div class="panel"><h2>Recognition against noise</h2>${chart}
  ${table(['σ', 'Recognised', 'Stereo right, of those recognised'], sigmas.map((x) => [x, pctCi(s.recallBySigma[x]), pctCi(s.stereoRightBySigma[x])]))}
  <p class="small muted">Each positive: a chair with two groups (1,2-, 1,3- or 1,4-; Me, OH, Cl; any faces; either chair), turned ±20°, sheared ±0.2, stretched (aspect 0.75–1.33), its corners pulled in or out ±10 %, then every atom moved by Gaussian noise of σ bond lengths; 1,000 per σ, seed ${r.seed}. Recognised: readChair reads the ring as a chair. Median fit of the positives ${s.fitOffPositive.median.toFixed(3)} (95th percentile ${s.fitOffPositive.p95.toFixed(3)}; readChair accepts up to 0.3).</p>
  <h3>Which distortion matters, at σ = 0.1</h3>${table(['', 'Chairs', 'Recognised'], ablation, { numeric: [1] })}
  <h2>Hexagons that are no chairs</h2>${table(['Class (1,000 each, lightly distorted)', 'Taken for a chair'], Object.entries(s.falsePositiveByClass).map(([k, w]) => [esc(k), pctCi(w)]))}
  ${s.hand.n ? `<h2>Drawn by hand</h2><p>${pctCi(s.hand)} of ${s.hand.n} rings drawn by hand recognised.</p>` : '<p class="small muted">No chairs drawn by hand yet (bench/data/handdrawn/ is empty).</p>'}
  <p class="small muted">Gallery: green frame, recognised as a chair; red, not. A positive passes when it is recognised and its stereo is right; a negative when it is not recognised.</p></div>`;
}

export function caseView(c) {
  const p = c.params ?? {};
  const params = c.params ? `σ ${p.sigma} · turn ${p.turn}° · shear ${p.shear} · aspect ${p.aspect}` : '';
  const view = {
    id: c.id, status: c.status, title: c.kind === 'positive' ? `${c.spec.pattern}-${c.spec.subs.join(',')} ${c.spec.faces.map((f) => (f > 0 ? 'up' : 'down')).join(',')}, chair ${c.spec.chair}` : c.class,
    smiles: c.expected?.smiles,
    facets: { kind: c.kind, class: c.class, sigma: c.sigma ?? '', recognised: c.recognised ? 'yes' : 'no' },
    reason: c.reason,
    drawings: [{ key: c.id, small: true, classes: [c.recognised ? 'green' : 'red'], label: c.recognised ? 'recognised' : `not recognised${c.readError ? ` (${c.readError})` : ''}`, metrics: `${params}${c.fitOff !== null ? ` · fit ${c.fitOff.toFixed(3)}` : ''}` }],
    open: 0,
  };
  if (c.kind === 'positive' && c.recognised) view.compare = [{ label: 'SMILES', expected: c.expected.smiles, got: c.got.smiles }];
  if (c.kind === 'positive') view.compareHeads = ['truth', 'olomol'];
  return view;
}

export function tableRows(r) {
  const s = r.summary;
  return [
    `B2c hand-drawn chairs & distorted chairs, $\\sigma = 0.05$ & ${s.recallBySigma['0.05'].n} & ${tex(s.recallBySigma['0.05'])} recognised \\\\`,
    ` & distorted chairs, $\\sigma = 0.1$ & ${s.recallBySigma['0.1'].n} & ${tex(s.recallBySigma['0.1'])} recognised \\\\`,
    ` & recognised chairs, stereo & ${s.stereoRight.n} & ${tex(s.stereoRight, 2)} correct \\\\`,
    ` & non-chair hexagons (6 classes) & ${s.falsePositive.n} & ${tex(s.falsePositive, 2)} false pos. \\\\`,
  ];
}
