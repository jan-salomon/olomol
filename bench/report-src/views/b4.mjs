// B4 in the report: each arrow of each mechanism step with what it comes near ringed in red, its tail (green) and
// head (blue) marked; each edit before and after; each refusal test with olomol's message.
import { esc, num, pctCi, table } from '../html.mjs';
import { tex } from './b2common.mjs';

export const meta = {
  id: 'b4',
  title: 'B4 · Curved-arrow placement',
  short: 'B4 arrows',
  description: 'Curved arrows are placed clear of labels, bonds, lone pairs and other arrows, in about a millisecond each, stay anchored to their electrons through edits, and an arrow from an atom with no electrons to give is refused.',
};
export const facets = [
  { key: 'part', label: 'Test' },
  { key: 'step', label: 'Mechanism' },
  { key: 'kind', label: 'Collision / edit / expected' },
];
export const headline = (r) => {
  const s = r.summary;
  return { big: pctCi(s.collisionFree).split(' <')[0], text: `of ${s.arrows} arrows in ${s.steps} mechanism steps clear of labels, bonds, lone pairs and other arrows; ${num(s.msPerArrow.median, 2)} ms to place one (median), ${num(s.sceneNode.median, 1)} ms for a whole step's scene; after ${s.edits.toLocaleString('en')} edits ${(100 * s.arrowsAnchored.p).toFixed(1)} % of arrows still anchored; ${s.falseAcceptances.k} false acceptances, ${s.falseRefusals.k} false refusals in 100.` };
};
export const passFail = (r) => ({ pass: r.cases.filter((c) => c.pass).length, n: r.cases.length });

const KIND = { labels: 'label', bonds: 'bond', lonePairs: 'lone pair', arrows: 'other arrow' };
export function top(r) {
  const s = r.summary;
  const t = s.thresholds;
  return `<div class="panel"><h2>Placement (${s.arrows} arrows, ${s.steps} steps)</h2>
  ${table(['', ''], [
    ['Clean (no collision, tail and head at their ends)', pctCi(s.clean)],
    ['No collision', pctCi(s.collisionFree)],
    ...Object.entries(s.collisionsByKind).map(([k, w]) => [`&nbsp;&nbsp;near a ${KIND[k]}`, pctCi(w)]),
    ['Tail to its electrons (bond lengths)', `median ${num(s.tail.median, 3)}, 95th percentile ${num(s.tail.p95, 3)}, max ${num(s.tail.max, 3)}`],
    ['Head to its target', `median ${num(s.head.median, 3)}, 95th percentile ${num(s.head.p95, 3)}, max ${num(s.head.max, 3)}`],
    ['Time to place one arrow (Node; all candidates scored)', `median ${num(s.msPerArrow.median, 2)} ms, 95th percentile ${num(s.msPerArrow.p95, 2)} ms, max ${num(s.msPerArrow.max, 2)} ms`],
    ['A whole step\'s scene, fresh (Node)', `median ${num(s.sceneNode.median, 2)} ms, max ${num(s.sceneNode.max, 2)} ms; unchanged (cached) ${num(s.sceneNode.warmMedian, 2)} ms`],
    ['A whole step\'s scene, fresh (Chrome, the app\'s editor)', s.sceneChrome.median === null ? 'not measured' : `median ${num(s.sceneChrome.median, 2)} ms, max ${num(s.sceneChrome.max, 2)} ms`],
    ['The step with the most arrows', `${esc(s.largest.step)} (${s.largest.arrows} arrows): ${num(s.largest.scene, 2)} ms in Node, ${s.largest.chrome === null ? '–' : `${num(s.largest.chrome, 2)} ms in Chrome`}`],
  ])}
  <h2>After edits (${s.edits.toLocaleString('en')}: 100 per step, seed ${r.seed})</h2>
  ${table(['', ''], [
    ['Arrows still anchored (tail and head at their ends)', pctCi(s.arrowsAnchored)],
    ['Arrows clear before, still clear after', pctCi(s.arrowsStillFree)],
    ['Edits after which every arrow is still right', pctCi(s.editsAllRight)],
    ...Object.entries(s.editsByKind).map(([k, w]) => [`&nbsp;&nbsp;${k}`, pctCi(w)]),
  ])}
  <h2>Refusals (olomol's curved-arrow tool, pointer down on the start and up on H⁺)</h2>
  ${table(['', ''], [['Should be refused, accepted (false acceptances)', pctCi(s.falseAcceptances)], ['Should be allowed, refused (false refusals)', pctCi(s.falseRefusals)]])}
  <h3>Timing per step</h3>
  ${table(['Step', 'Arrows', 'Atoms', 'Scene, fresh (Node, ms)', 'Scene, cached (Node, ms)', 'Scene without arrows (Node, ms)', 'Scene, fresh (Chrome, ms)'], s.stepTimings.map((x) => [esc(x.step), x.arrows, x.atoms, num(x.scene, 2), num(x.sceneWarm, 2), num(x.noArrows, 2), x.chrome === null ? '–' : num(x.chrome, 2)]), { numeric: [1, 2, 3, 4, 5, 6] })}
  <p class="small muted">Measured on olomol's scene (buildScene) by our own geometry (bench/b4-arrows.mjs): a collision is the arrow's path within ${t.near} bond lengths of a label's box, a drawn bond line, a lone pair (a disc of 0.12 round its point) or another arrow's path; the path within ${t.ends} of its own start or head is not looked at, nor the bond, atom or lone pair it starts or ends at. Anchored: tail within ${t.tail} of its electrons (the lone pair's point, the bond's line) and head within ${t.head} of its target (the atom's label box or point, the bond's line, a new bond's midpoint). Timing: each run turned by a small seeded angle so that no cached arrow is reused; one arrow = the scene with only it less the scene without arrows; medians of 7 runs after 2. Edits: move an atom up to 0.5 bond lengths (40 %), turn a molecule (25 %), flip it left to right (15 %), redraw it with RDKit or CoordGen, straightened or not (20 %, as relayout.js's rdkitLayout; Indigo and the 3D engine need Web Workers). Refusals follow olomol's stated rule (no arrow from an atom with no lone pair or unpaired electron); a chemically wrong end (a fifth bond to carbon) is not something olomol claims to check and is not tested.</p></div>`;
}

export function caseView(c) {
  if (c.part === 'placement') {
    return {
      id: c.id, status: c.status, title: `${c.step}: ${c.arrow}`, smiles: c.smiles,
      facets: { part: 'placement', step: c.step, kind: (c.kinds ?? []).map((k) => `near a ${KIND[k]}`) },
      reason: c.reason,
      drawings: [{ key: c.drawing, label: 'as olomol draws it', caption: 'this arrow\'s tail green, head blue; what it comes near in red', overlays: c.overlay ?? [] }],
      open: 0,
      tables: [{ columns: ['tail to its electrons', 'head to its target', 'time to place', 'near'], rows: [[c.tail, c.head, `${c.ms} ms`, (c.kinds ?? []).map((k) => KIND[k]).join(', ') || 'nothing']], bad: c.pass ? [] : [0] }],
    };
  }
  if (c.part === 'edits') {
    const overlays = c.arrows.filter((a) => !a.anchored || !a.stillFree).flatMap((a) => a.overlay);
    return {
      id: c.id, status: c.status, title: `${c.step}: ${c.edit}`,
      facets: { part: 'edits', step: c.step, kind: c.editKind },
      reason: c.reason,
      drawings: [{ key: c.before, label: 'before' }, { key: c.after, label: 'after', caption: esc(c.edit), overlays, classes: c.pass ? [] : ['red'] }],
      open: 1,
      tables: [{ columns: ['arrow', 'anchored', 'near something', 'tail', 'head'], rows: c.arrows.map((a) => [a.id, a.anchored ? 'yes' : 'no', a.kinds.join(', ') || 'no', a.tail, a.head]), bad: c.arrows.flatMap((a, i) => (!a.anchored || !a.stillFree ? [i] : [])) }],
    };
  }
  return {
    id: c.id, status: c.status, title: `${c.step}: ${c.arrow}`, smiles: c.smiles,
    facets: { part: 'refusals', step: c.step, kind: `should be ${c.expected}` },
    reason: c.reason,
    drawings: [{ key: c.drawing, label: c.got === 'allowed' ? 'arrow drawn' : 'refused' }],
    open: 0,
    compareHeads: ['expected', 'olomol'],
    compare: [{ label: 'the arrow', expected: c.expected, got: c.got, plain: true }],
    notes: c.message ? `olomol says: “${esc(c.message)}”` : 'olomol said nothing.',
  };
}

export function tableRows(r) {
  const s = r.summary;
  return [
    `B4 arrow placement & ${s.steps} mechanism steps & ${s.arrows} & ${tex(s.collisionFree)} collision-free; ${num(s.msPerArrow.median, 1)}\\,ms per arrow \\\\`,
    ` & arrows after ${s.edits} edits (100 per step) & ${s.arrowsAnchored.n} & ${tex(s.arrowsAnchored, 2)} anchored; ${tex(s.arrowsStillFree)} of clear ones still clear \\\\`,
    ` & arrows to refuse / to allow & 50 / 50 & ${s.falseAcceptances.k} false acceptances, ${s.falseRefusals.k} false refusals \\\\`,
  ];
}
