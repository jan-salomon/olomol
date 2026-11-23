// B2d in the report: each compound's drawings side by side (pasted with wedges, its Fischer projection, the zigzag,
// the Fischer projection again, PubChem's) with each one's SMILES; each hand-drawn projection as built, as read.
import { esc, pctCi, table } from '../html.mjs';
import { tex } from './b2common.mjs';

export const meta = {
  id: 'b2d',
  title: 'B2d · Fischer projections both ways',
  short: 'B2d Fischer',
  description: "Wedges → Fischer projection → zigzag → Fischer projection with the app's tools keeps PubChem's stereoisomer or is refused with a reason; a Fischer projection drawn as plain crossings and clicked with the Fischer tool is read as its stereoisomer.",
};
export const facets = [
  { key: 'part', label: 'Test' },
  { key: 'kind', label: 'Compounds' },
  { key: 'variant', label: 'Drawn' },
  { key: 'outcome', label: 'Outcome' },
];
export const statusLabels = { fail: 'wrong only', all: 'all', pass: 'right / read', excluded: 'refused, missed, not run' };

const count = (w) => `${w.k}`;
export const headline = (r) => {
  const s = r.summary;
  const a = s.allConversions;
  return { big: pctCi(a.right).split(' <')[0], text: `of ${a.n} conversions (wedges → Fischer → zigzag → Fischer, ${s.converted} compounds) give PubChem's stereoisomer, ${a.refused.k} refused with a reason, ${a.wrong.k} wrong; ${s.hand.read.k} of ${s.hand.drawings} hand-drawn projections read (${s.hand.missed.k} missed, ${s.hand.wrong.k} wrong).` };
};
export const passFail = (r) => {
  const judged = r.cases.filter((c) => c.status !== 'excluded');
  return { pass: judged.filter((c) => c.status !== 'fail').length, n: judged.length, excluded: r.cases.length - judged.length };
};

export function top(r) {
  const s = r.summary;
  const h = s.hand;
  return `<div class="panel"><h2>Conversions with the app's tools (${s.converted} compounds)</h2>
  ${table(['Conversion', 'Tried', 'Right', 'Refused', 'Wrong', 'Not run (refused before)'], Object.values(s.perConversion).map((c) => [esc(c.label), c.n, pctCi(c.right), pctCi(c.refused), pctCi(c.wrong), c.notRun]), { numeric: [1, 5] })}
  <p>All three right (a round trip): ${pctCi(s.roundTrips)}.</p>
  <h3>Refusals</h3>
  ${table(['olomol said', 'Compounds'], Object.entries(s.refusalReasons).map(([m, list]) => [`“${esc(m)}”`, esc(list.join(', '))]))}
  ${s.excluded.length ? `<h3>Not converted</h3>${table(['Compound', 'Why'], s.excluded.map((e) => [esc(e.name), esc(e.reason)]))}` : ''}
  <h2>Fischer projections drawn as crossings (${h.compounds} compounds, ${h.drawings} drawings, ${h.clicks} clicks)</h2>
  ${table(['Drawn', 'Drawings', 'Read', 'Missed (a centre without stereo)', 'Wrong'], Object.entries(h.byVariant).map(([k, v]) => [`${esc(k)}${(h.extraVariants ?? []).includes(k) ? ' <span class="muted small">(beyond the asked variants)</span>' : ''}`, v.n, pctCi(v.read), pctCi(v.missed), pctCi(v.wrong)]), { numeric: [1] })}
  <p>The asked variants together: read ${pctCi(h.read)}, missed ${pctCi(h.missed)}, wrong ${pctCi(h.wrong)}; clicks (one crossing each, on a fresh copy) read ${pctCi(h.clicksRead)}. Drawings with stereo before any click: ${h.stereoBeforeClick} (olomol reads a crossing as a centre only when clicked).</p>
  ${h.notDrawn.length ? `<h3>Not drawn as a projection</h3>${table(['Compound', 'Why'], h.notDrawn.map((e) => [esc(e.name), esc(e.reason)]))}` : ''}
  <p class="small muted">Truth: ${esc(r.truth)}. Conversions: olomol's own drawing of PubChem's SMILES (as Paste makes it) clicked with the Fischer tool, the result with the zigzag tool, that with the Fischer tool again, in an Editor in Node (pointer down and up on an atom, as the app's canvas does); each result's SMILES and InChIKey (olomol's export) against PubChem's. A refusal: olomol said why and changed nothing. Hand-drawn: the projection built by the benchmark (vertical chain, the longest open chain of carbons through every stereocentre, its more oxidised end at the top; each centre's two other groups left and right, an H drawn where it has one; the groups' further atoms as RDKit lays them out), written as a KET file of plain bonds, pasted into the app in Chrome and each crossing clicked with the mouse on a fresh copy. Turned: the whole drawing; uneven arms: every bond of the chain and every horizontal bond 0.6–1.4 long (seed ${r.seed}). Missed: a centre left without stereo (no other wrong); wrong: a centre the other way.</p></div>`;
}

const STEP_LABEL = { toFischer: 'Fischer projection', toZigzag: 'zigzag', backToFischer: 'Fischer projection again' };

export function caseView(c) {
  if (c.part === 'conversions') {
    const steps = c.steps ?? [];
    return {
      id: c.id, status: c.status, badge: c.badge ?? c.status, title: `${c.name} · PubChem CID ${c.cid ?? '–'}`, smiles: c.pubchemSmiles,
      facets: { part: 'conversions', kind: c.kind, outcome: steps.map((s) => `${s.label}: ${s.outcome}`) },
      reason: c.reason,
      drawings: [
        { key: `${c.id}:input`, label: 'pasted, with wedges', caption: 'olomol\'s drawing of PubChem\'s SMILES' },
        ...steps.map((s) => (s.outcome === 'right' || s.outcome === 'wrong' ? { key: `${c.id}:${s.key}`, label: STEP_LABEL[s.key], caption: esc(s.label), classes: s.outcome === 'wrong' ? ['red'] : [] } : { text: s.outcome === 'refused' ? `refused: ${s.message}` : 'not run', label: STEP_LABEL[s.key] })),
        ...(c.expected?.smiles ? [{ key: `exp:${c.expected.smiles}`, label: 'expected', caption: "PubChem's stereoisomer, RDKit's wedges", small: true }] : []),
      ],
      open: 0,
      compareHeads: ['PubChem', 'olomol'],
      compare: [
        { label: 'pasted (canonical SMILES)', expected: c.expected?.smiles ?? '–', got: c.input?.smiles ?? '–' },
        ...steps.map((s) => ({ label: s.label, expected: c.expected?.smiles ?? '–', got: s.got?.smiles ?? (s.outcome === 'refused' ? 'refused' : 'not run'), differs: s.outcome === 'wrong', plain: !s.got })),
        ...steps.filter((s) => s.got).map((s) => ({ label: `${s.label}: InChIKey`, expected: c.expected?.inchikey ?? '–', got: s.got.inchikey ?? '–' })),
      ],
      tables: [{ columns: ['conversion', 'outcome', 'centres drawn as crossings', 'olomol said'], rows: steps.map((s) => [s.label, s.outcome, s.centresDrawn ?? '–', s.message ?? '']), bad: steps.flatMap((s, i) => (s.outcome === 'wrong' ? [i] : [])) }],
    };
  }
  const clicks = c.clicks ?? [];
  return {
    id: c.id, status: c.status, badge: c.badge ?? c.status, title: `${c.name}, drawn by hand: ${c.variant}`, smiles: c.pubchemSmiles,
    facets: { part: 'hand-drawn', kind: c.kind, variant: c.variant, outcome: c.outcome ?? 'not read' },
    reason: c.reason,
    drawings: c.variant === 'none' ? [] : [
      { key: `${c.id}:drawn`, label: 'as drawn', caption: 'plain crossings (the KET file pasted)' },
      ...(clicks.length ? [{ key: `${c.id}:read`, label: 'clicked', caption: 'after a click on its top crossing', classes: c.outcome === 'wrong' ? ['red'] : [] }] : []),
      ...(c.expected?.smiles ? [{ key: `exp:${c.expected.smiles}`, label: 'expected', caption: "PubChem's stereoisomer, RDKit's wedges", small: true }] : []),
    ],
    open: c.variant === 'none' ? undefined : 0,
    compareHeads: ['PubChem', 'olomol'],
    compare: clicks.length ? [
      { label: 'before a click', expected: '(no stereo read)', got: clicks[0].before ?? '–', differs: Boolean(clicks[0].before?.includes('@')), plain: true },
      ...clicks.map((k) => ({ label: `crossing ${k.crossing + 1} clicked`, expected: c.expected.smiles, got: k.got.smiles ?? '–' })),
    ] : [],
    tables: clicks.length ? [{ columns: ['crossing clicked', 'read', 'centres', 'olomol said'], rows: clicks.map((k) => [k.crossing + 1, k.judged.verdict + (k.judged.note ? ` (${k.judged.note})` : ''), k.centres, k.notice]), bad: clicks.flatMap((k, i) => (k.judged.verdict === 'wrong' ? [i] : [])) }] : [],
    notes: c.arms ? `Arms: chain ${c.arms.gaps.map((v) => v.toFixed(2)).join(', ')}; left ${c.arms.left.map((v) => v.toFixed(2)).join(', ')}; right ${c.arms.right.map((v) => v.toFixed(2)).join(', ')}.` : '',
  };
}

export function tableRows(r) {
  const s = r.summary;
  const c = s.perConversion;
  const row = (w, first, set) => `${first} & ${set} & ${w.n} & ${tex(w.right)} right, ${count(w.refused)} refused, ${count(w.wrong)} wrong \\\\`;
  return [
    row(c.toFischer, 'B2d Fischer projections', `wedges $\\to$ Fischer (${s.converted} compounds)`),
    row(c.toZigzag, '', 'Fischer $\\to$ zigzag'),
    row(c.backToFischer, '', 'zigzag $\\to$ Fischer'),
    ` & drawn as crossings (straight, turned $\\pm$3\\textdegree\\ and $\\pm$8\\textdegree, uneven arms) & ${s.hand.drawings} & ${tex(s.hand.read)} read, ${s.hand.missed.k} missed, ${s.hand.wrong.k} wrong \\\\`,
  ];
}
