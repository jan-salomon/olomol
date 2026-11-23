// B4: curved arrows placed cleanly, fast, and still right after edits; arrows that make no sense refused.
//   placement: every arrow of ~50 mechanism steps (scripts/arrow-gallery.mjs's and bench/data/b4-mechanisms.json),
//              olomol's scene (buildScene) measured by our own geometry: collisions with labels, bonds, lone pairs and
//              other arrows, where its head and tail end, and how long it takes (Node; Chrome through Playwright);
//   edits:     100 seeded edits per step (move an atom, turn or flip a molecule, redraw it), the arrows checked again;
//   refusals:  arrows olomol's curved-arrow tool should refuse (from an atom with no electrons to give) and allow.
// Usage: npm run bench:b4 [-- --no-build] [-- --no-chrome]
import { writeFileSync } from 'node:fs';
import { putDrawing, startApp } from './lib/app.mjs';
import { docToJSON } from './lib/docjson.mjs';
import { environment } from './lib/env.mjs';
import { finder, mechanismSteps } from './lib/mechanisms.mjs';
import { rdkit, src } from './lib/olomol.mjs';
import { saveResults } from './lib/results.mjs';
import { rng } from './lib/rng.mjs';
import { max, median, quantile, wilson } from './lib/stats.mjs';

const started = performance.now();
const SEED = 20261110;
const RDKit = await rdkit();
const env = await environment(RDKit);
const { mechanismDoc } = await import('../scripts/arrow-gallery.mjs');
const { buildScene } = await src('render/scene.js');
const { writeMolfile } = await src('io/molfile.js');
const { Editor } = await src('editor/editor.js');
const { writeAs } = await src('io/files.js');
// (drawings go to the app as olomol's own file: KET is written for Ketcher, a Newman projection in it drawn plainly since 0.5.0)
const { writeOlom } = await src('io/olom.js');

const NEAR = 0.1; // a collision: the arrow's path this near (bond lengths) to a label, bond, lone pair or other arrow
const ENDS = 0.25; // the path this near its own start or head isn't looked at (it leaves and reaches things there)
const PAIR_RADIUS = 0.12; // a lone pair's two dots, as a disc round its point
const TAIL_OK = 0.5; // anchored: the tail this near its electrons, the head this near its target
const HEAD_OK = 0.75;

// --- the mechanisms as drawings (lib/mechanisms.mjs) ---
const steps = await mechanismSteps(RDKit);

// --- geometry of our own ---
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function pointSegment(p, a, b) {
  const [dx, dy] = sub(b, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}
const pointBox = (p, b) => Math.hypot(Math.max(b.x1 - p[0], 0, p[0] - b.x2), Math.max(b.y1 - p[1], 0, p[1] - b.y2));

// Everything about one arrow in a scene: where its ends are, what its path comes near.
function measureArrow(scene, doc, curveId) {
  const c = scene.curves.get(curveId);
  if (!c) return { missing: true };
  const curve = doc.curves.get(curveId);
  const samples = c.samples;
  const tip = c.head[0];
  const start = samples[0];
  const pos = (id) => scene.atoms.get(id).pos;
  // ends
  const from = curve.from;
  const to = curve.to;
  let tail;
  if (from.bond !== undefined) tail = pointSegment(start, pos(doc.bonds.get(from.bond).a), pos(doc.bonds.get(from.bond).b));
  else {
    const e = scene.atoms.get(from.atom).electrons;
    const dots = from.radical ? e.unpaired : e.pairs;
    tail = dots.length ? Math.min(...dots.map((d) => dist(start, d.point))) : dist(start, pos(from.atom));
  }
  let head;
  if (to.bond !== undefined) head = pointSegment(tip, pos(doc.bonds.get(to.bond).a), pos(doc.bonds.get(to.bond).b));
  else if (to.newBond !== undefined) head = dist(tip, [(pos(to.atom)[0] + pos(to.newBond)[0]) / 2, (pos(to.atom)[1] + pos(to.newBond)[1]) / 2]);
  else {
    const boxes = scene.atoms.get(to.atom).label?.boxes ?? [];
    const p = pos(to.atom);
    head = boxes.length ? Math.min(...boxes.map((b) => pointBox(tip, { x1: p[0] + b.x1, y1: p[1] + b.y1, x2: p[0] + b.x2, y2: p[1] + b.y2 }))) : dist(tip, p);
  }
  // the path, its ends left out
  const middle = samples.filter((p) => dist(p, start) > ENDS && dist(p, tip) > ENDS);
  const own = { atoms: new Set(), bonds: new Set() };
  if (from.atom !== undefined) own.atoms.add(from.atom);
  if (from.bond !== undefined) own.bonds.add(from.bond);
  if (to.atom !== undefined) own.atoms.add(to.atom);
  if (to.newBond !== undefined) own.atoms.add(to.newBond);
  if (to.bond !== undefined) own.bonds.add(to.bond);
  const hits = { labels: [], bonds: [], lonePairs: [], arrows: [] };
  const overlay = [];
  const hitPoints = new Set();
  for (const [id, info] of scene.atoms) {
    const p = info.pos;
    if (!own.atoms.has(id)) {
      for (const b of info.label?.boxes ?? []) {
        const box = { x1: p[0] + b.x1, y1: p[1] + b.y1, x2: p[0] + b.x2, y2: p[1] + b.y2 };
        const near = middle.filter((q) => pointBox(q, box) < NEAR);
        if (near.length) {
          hits.labels.push(id);
          near.forEach((q) => hitPoints.add(q));
          overlay.push({ line: [[box.x1, box.y1], [box.x2, box.y1], [box.x2, box.y2], [box.x1, box.y2], [box.x1, box.y1]], width: 1.5 });
        }
      }
    }
    // lone pairs: every atom's, except the pair the arrow starts at
    for (const pair of info.electrons?.pairs ?? []) {
      if (from.atom === id && !from.radical && dist(pair.point, start) < ENDS + PAIR_RADIUS) continue;
      const near = middle.filter((q) => dist(q, pair.point) < NEAR + PAIR_RADIUS);
      if (near.length) {
        hits.lonePairs.push(id);
        near.forEach((q) => hitPoints.add(q));
        overlay.push({ circle: pair.point, r: PAIR_RADIUS + 0.04, width: 1.5 });
      }
    }
  }
  for (const [id, b] of scene.bonds) {
    if (own.bonds.has(id)) continue;
    const segments = [...(b.shapes?.lines ?? []).map(([x1, y1, x2, y2]) => [[x1, y1], [x2, y2]]), ...(b.shapes?.polygons ?? []).flatMap((poly) => poly.map((q, k) => [q, poly[(k + 1) % poly.length]]))];
    let hit = false;
    for (const [a, z] of segments) {
      const near = middle.filter((q) => pointSegment(q, a, z) < NEAR);
      if (near.length) {
        hit = true;
        near.forEach((q) => hitPoints.add(q));
        overlay.push({ line: [a, z], width: 2 });
      }
    }
    if (hit) hits.bonds.push(id);
  }
  for (const [id, other] of scene.curves) {
    if (id === curveId) continue;
    const theirs = other.samples.filter((p) => dist(p, other.samples[0]) > ENDS && dist(p, other.head[0]) > ENDS);
    const near = middle.filter((q) => theirs.some((t) => dist(q, t) < NEAR));
    if (near.length) {
      hits.arrows.push(id);
      near.forEach((q) => hitPoints.add(q));
      overlay.push({ line: other.samples, width: 2 });
    }
  }
  for (const q of hitPoints) overlay.push({ dot: q, r: 0.05 });
  overlay.push({ dot: start, r: 0.07, color: '#1a7f37' }, { dot: tip, r: 0.07, color: '#1035a9' });
  const kinds = Object.entries(hits).filter(([, v]) => v.length).map(([k]) => k);
  return { tail: round(tail), head: round(head), hits, kinds, collides: kinds.length > 0, overlay, electrons: curve.electrons };
}
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const describeEnd = (doc, end) => {
  const name = (id) => { const a = doc.atoms.get(id); return `${a.alias ?? a.el}${a.charge > 0 ? '+' : a.charge < 0 ? '−' : ''}`; };
  if (end.newBond !== undefined) return `new ${name(end.newBond)}–${name(end.atom)} bond`;
  if (end.bond !== undefined) { const b = doc.bonds.get(end.bond); return `${name(b.a)}${['', '–', '=', '≡'][b.order]}${name(b.b)} bond`; }
  return `${name(end.atom)}${end.radical ? ' (unpaired electron)' : ''}`;
};

// timing: a fresh scene (each run turned by a small seeded angle, so no cached arrow is reused)
const turned = (doc, angle) => {
  const copy = structuredClone(doc);
  const atoms = [...copy.atoms.values()];
  const [cx, cy] = [atoms.reduce((s, a) => s + a.x, 0) / atoms.length, atoms.reduce((s, a) => s + a.y, 0) / atoms.length];
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  for (const a of atoms) [a.x, a.y] = [cx + c * (a.x - cx) - s * (a.y - cy), cy + s * (a.x - cx) + c * (a.y - cy)];
  return copy;
};
const timingRandom = rng(SEED + 1);
function coldScene(doc, runs = 7) {
  const times = [];
  for (let k = 0; k < runs + 2; k++) {
    const copy = turned(doc, timingRandom.uniform(0.02, 0.2));
    const t0 = performance.now();
    buildScene(copy);
    if (k >= 2) times.push(performance.now() - t0);
  }
  return median(times);
}

// --- placement ---
const cases = [];
const drawings = {};
const placement = [];
for (const [m, step] of steps.entries()) {
  const tag = step.name.replace(/[^\w+]+/g, '-').replace(/^-|-$/g, '');
  step.tag = tag;
  const scene = buildScene(step.doc);
  const key = `B4-place-${tag}`;
  drawings[key] = docToJSON(step.doc);
  // timing: the whole scene, fresh and again unchanged (cached, as while nothing near the arrows moves);
  // each arrow alone: the scene with only it, less the scene with none
  const bare = structuredClone(step.doc);
  bare.curves.clear();
  const noArrows = coldScene(bare);
  const whole = coldScene(step.doc);
  const t0 = performance.now();
  for (let k = 0; k < 20; k++) buildScene(step.doc);
  const warm = (performance.now() - t0) / 20;
  step.timing = { scene: round(whole, 2), sceneWarm: round(warm, 2), noArrows: round(noArrows, 2) };
  for (const [k, curveId] of [...step.doc.curves.keys()].entries()) {
    const only = structuredClone(step.doc);
    for (const id of [...only.curves.keys()]) if (id !== curveId) only.curves.delete(id);
    const ms = Math.max(0, coldScene(only) - noArrows);
    const measured = measureArrow(scene, step.doc, curveId);
    const curve = step.doc.curves.get(curveId);
    const c = {
      id: `B4-place-${tag}-a${k + 1}`, part: 'placement', step: step.name, source: step.source, smiles: step.smiles,
      arrow: `${curve.electrons === 1 ? 'fishhook' : 'arrow'} from the ${describeEnd(step.doc, curve.from)} to the ${describeEnd(step.doc, curve.to)}`,
      drawing: key, curveId, ms: round(ms, 2), ...measured,
    };
    c.pass = !c.missing && !c.collides && c.tail <= TAIL_OK && c.head <= HEAD_OK;
    c.status = c.pass ? 'pass' : 'fail';
    c.reason = c.missing ? 'not drawn' : [c.collides ? `comes within ${NEAR} bond lengths of ${c.kinds.map((x) => ({ labels: 'a label', bonds: 'a bond', lonePairs: 'a lone pair', arrows: 'another arrow' })[x]).join(', ')}` : '', c.tail > TAIL_OK ? `tail ${c.tail} from its electrons` : '', c.head > HEAD_OK ? `head ${c.head} from its target` : ''].filter(Boolean).join('; ');
    cases.push(c);
    placement.push(c);
  }
}
console.log(`placement: ${placement.filter((c) => c.pass).length}/${placement.length} clean`);

// --- edits ---
const random = rng(SEED);
const pieces = (doc) => {
  const seen = new Set();
  const out = [];
  for (const start of doc.atoms.keys()) {
    if (seen.has(start)) continue;
    const piece = [start];
    seen.add(start);
    for (let i = 0; i < piece.length; i++) for (const b of doc.bonds.values()) {
      const next = b.a === piece[i] ? b.b : b.b === piece[i] ? b.a : null;
      if (next !== null && !seen.has(next)) { seen.add(next); piece.push(next); }
    }
    out.push(piece);
  }
  return out;
};
const centreOf = (doc, ids) => [ids.reduce((s, id) => s + doc.atoms.get(id).x, 0) / ids.length, ids.reduce((s, id) => s + doc.atoms.get(id).y, 0) / ids.length];
// a molecule drawn again as Redraw's RDKit and CoordGen engines draw it (relayout.js rdkitLayout: set_new_coords,
// normalize_depiction, straighten_depiction), put where it was; Indigo and the 3D engine need Web Workers
const LAYOUTS = [['RDKit', false, false], ['RDKit, straightened', false, true], ['CoordGen', true, false], ['CoordGen, straightened', true, true]];
function redrawn(doc, ids, [, coordGen, straighten]) {
  const { molfile, atomIds } = writeMolfile(doc, ids);
  const mol = RDKit.get_mol(molfile, JSON.stringify({ removeHs: false }));
  if (!mol) return false;
  try {
    mol.set_new_coords(coordGen);
    // (RDKit throws here for some small molecules: then another edit is made instead)
    try {
      mol.normalize_depiction(1);
    } catch {
      return false;
    }
    if (straighten) mol.straighten_depiction(true);
    const lines = mol.get_molblock().split('\n');
    const n = Number(lines[3].slice(0, 3));
    const points = lines.slice(4, 4 + n).map((l) => [Number(l.slice(0, 10)), -Number(l.slice(10, 20))]);
    const bonds = lines.slice(4 + n).filter((l) => /^\s*\d+\s+\d+\s+\d/.test(l) && !l.startsWith('M')).slice(0, 999).map((l) => [Number(l.slice(0, 3)) - 1, Number(l.slice(3, 6)) - 1]);
    const lengths = bonds.map(([a, b]) => dist(points[a], points[b])).sort((x, y) => x - y);
    const scale = 1 / (lengths[Math.floor(lengths.length / 2)] || 1);
    const [ox, oy] = centreOf(doc, atomIds);
    const [cx, cy] = [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
    atomIds.forEach((id, i) => Object.assign(doc.atoms.get(id), { x: ox + (points[i][0] - cx) * scale, y: oy + (points[i][1] - cy) * scale }));
    return true;
  } finally {
    mol.delete();
  }
}
function edit(doc, step) {
  const molecules = pieces(doc);
  const kind = random.next();
  if (kind < 0.4) {
    const atom = random.pick([...doc.atoms.values()]);
    const angle = random.uniform(0, 2 * Math.PI);
    const r = random.uniform(0, 0.5);
    atom.x += r * Math.cos(angle);
    atom.y += r * Math.sin(angle);
    return `moved ${atom.alias ?? atom.el} (atom ${atom.id}) by ${r.toFixed(2)} bond lengths`;
  }
  const choices = molecules.filter((p) => p.length > 1);
  const ids = random.pick(choices.length ? choices : molecules);
  const [cx, cy] = centreOf(doc, ids);
  const name = `the molecule of atom ${ids[0]}`;
  if (kind < 0.65 || (kind < 0.8 && step.newman)) {
    const angle = random.uniform(-Math.PI, Math.PI);
    for (const id of ids) {
      const a = doc.atoms.get(id);
      [a.x, a.y] = [cx + Math.cos(angle) * (a.x - cx) - Math.sin(angle) * (a.y - cy), cy + Math.sin(angle) * (a.x - cx) + Math.cos(angle) * (a.y - cy)];
    }
    return `turned ${name} by ${Math.round((angle * 180) / Math.PI)}°`;
  }
  if (kind < 0.8) {
    // flipped left to right, wedges swapped so that it stays the same molecule (as Flip does)
    for (const id of ids) doc.atoms.get(id).x = 2 * cx - doc.atoms.get(id).x;
    for (const b of doc.bonds.values()) if (ids.includes(b.a) && (b.stereo === 'wedge' || b.stereo === 'hash')) b.stereo = b.stereo === 'wedge' ? 'hash' : 'wedge';
    return `flipped ${name} left to right`;
  }
  const layout = random.pick(LAYOUTS);
  if (step.newman || ids.length < 2 || !redrawn(doc, ids, layout)) return edit(doc, step);
  return `redrew ${name} with ${layout[0]}`;
}
const EDITS = 100;
const editCases = [];
for (const step of steps) {
  const before = buildScene(step.doc);
  const was = new Map([...step.doc.curves.keys()].map((id) => [id, measureArrow(before, step.doc, id)]));
  for (let k = 0; k < EDITS; k++) {
    const doc = structuredClone(step.doc);
    const what = edit(doc, step);
    const scene = buildScene(doc);
    const arrows = [...doc.curves.keys()].map((id) => {
      const after = measureArrow(scene, doc, id);
      const anchored = !after.missing && after.tail <= TAIL_OK && after.head <= HEAD_OK;
      const stillFree = was.get(id).collides || !after.collides;
      return { id, anchored, collides: Boolean(after.collides), stillFree, kinds: after.kinds ?? [], tail: after.tail, head: after.head, overlay: after.overlay?.filter((o) => !o.dot || o.color) ?? [] };
    });
    const id = `B4-edit-${step.tag}-e${String(k + 1).padStart(3, '0')}`;
    drawings[`${id}:after`] = docToJSON(doc);
    const bad = arrows.filter((a) => !a.anchored || !a.stillFree);
    const c = {
      id, part: 'edits', step: step.name, edit: what, editKind: what.split(' ')[0], before: `B4-place-${step.tag}`, after: `${id}:after`, arrows,
      pass: !bad.length, status: bad.length ? 'fail' : 'pass',
      reason: bad.map((a) => `arrow ${a.id}: ${!a.anchored ? `no longer at its ends (tail ${a.tail}, head ${a.head})` : `now comes near ${a.kinds.join(', ')}`}`).join('; '),
    };
    cases.push(c);
    editCases.push(c);
  }
}
console.log(`edits: ${editCases.filter((c) => c.pass).length}/${editCases.length} with every arrow still right`);

// --- refusals: the curved-arrow tool itself (an Editor, pointer down on the start and up on the end) ---
const REFUSE = [
  ['methane', 'C', 'C'], ['ethane', 'CC', 'C'], ['propane, C2', 'CCC', 'C#1'], ['cyclohexane', 'C1CCCCC1', 'C'], ['neopentane C', 'CC(C)(C)C', 'C#1'],
  ['borane', 'B', 'B'], ['boron trifluoride', 'FB(F)F', 'B'], ['trimethylborane', 'CB(C)C', 'B'], ['trimethyl borate', 'COB(OC)OC', 'B'], ['phenylboronic acid', 'OB(O)c1ccccc1', 'B'],
  ['aluminium chloride', 'Cl[Al](Cl)Cl', 'Al'], ['trimethylaluminium', 'C[Al](C)C', 'Al'], ['methyl cation', '[CH3+]', 'C+'], ['tert-butyl cation', 'C[C+](C)C', 'C+'], ['tropylium', '[cH+]1cccccc1', 'C+'],
  ['ammonium', '[NH4+]', 'N+'], ['tetramethylammonium', 'C[N+](C)(C)C', 'N+'], ['tetramethylphosphonium', 'C[P+](C)(C)C', 'P+'], ['borohydride', '[BH4-]', 'B-'], ['tetrafluoroborate', 'F[B-](F)(F)F', 'B-'],
  ['tetrachloroaluminate', 'Cl[Al-](Cl)(Cl)Cl', 'Al-'], ['silane', '[SiH4]', 'Si'], ['tetramethylsilane', 'C[Si](C)(C)C', 'Si'], ['carbon tetrachloride', 'ClC(Cl)(Cl)Cl', 'C'], ['tetrafluoromethane', 'FC(F)(F)F', 'C'],
  ['chloroform', 'ClC(Cl)Cl', 'C'], ['dichloromethane', 'ClCCl', 'C'], ['acetone carbonyl C', 'CC(C)=O', 'C#1'], ['acetaldehyde carbonyl C', 'CC=O', 'C#1'], ['DMF carbonyl C', 'CN(C)C=O', 'C#2'],
  ['urea C', 'NC(N)=O', 'C'], ['carbon dioxide C', 'O=C=O', 'C'], ['acetonitrile nitrile C', 'CC#N', 'C#1'], ['hydrogen cyanide C', 'C#N', 'C'], ['ethylene C', 'C=C', 'C'],
  ['acetylene C', 'C#C', 'C'], ['benzene C', 'c1ccccc1', 'C'], ['toluene methyl C', 'Cc1ccccc1', 'C'], ['acylium C', 'CC#[O+]', 'C#1'], ['nitronium N', 'O=[N+]=O', 'N+'],
  ['nitromethane N', 'C[N+](=O)[O-]', 'N+'], ['sulfur hexafluoride S', 'FS(F)(F)(F)(F)F', 'S'], ['phosphorus pentachloride P', 'ClP(Cl)(Cl)(Cl)Cl', 'P'], ['sulfate S', '[O-]S(=O)(=O)[O-]', 'S'], ['dimethyl sulfone S', 'CS(C)(=O)=O', 'S'],
  ['perchlorate Cl (RDKit writes it Cl3+ with four O−)', '[O-]Cl(=O)(=O)=O', 'Cl+'], ['phosphate P', '[O-]P(=O)([O-])[O-]', 'P'], ['fishhook from methane C', 'C', 'C', 1], ['fishhook from BF3 B', 'FB(F)F', 'B', 1], ['fishhook from ammonium N', '[NH4+]', 'N+', 1],
];
const ALLOW = [
  ['water O', 'O', 'O'], ['ammonia N', 'N', 'N'], ['hydroxide O', '[OH-]', 'O-'], ['chloride', '[Cl-]', 'Cl-'], ['bromide', '[Br-]', 'Br-'],
  ['iodide', '[I-]', 'I-'], ['fluoride', '[F-]', 'F-'], ['acetone O', 'CC(C)=O', 'O'], ['pyridine N', 'c1ccncc1', 'N'], ['furan O', 'c1ccoc1', 'O'],
  ['thiophene S', 'c1ccsc1', 'S'], ['methyl anion C', '[CH3-]', 'C-'], ['cyanide C', '[C-]#N', 'C-'], ['trimethylamine N', 'CN(C)C', 'N'], ['phosphine P', 'P', 'P'],
  ['triphenylphosphine P', 'c1ccc(P(c2ccccc2)c2ccccc2)cc1', 'P'], ['dimethyl sulfide S', 'CSC', 'S'], ['DMSO O', 'CS(C)=O', 'O'], ['acetate O−', 'CC(=O)[O-]', 'O-'], ['ethanol O', 'CCO', 'O'],
  ['aniline N', 'Nc1ccccc1', 'N'], ['enolate O−', 'C=C[O-]', 'O-'], ['hydronium O', '[OH3+]', 'O+'], ['trimethylsulfonium S', 'C[S+](C)C', 'S+'], ['methyl chloride Cl', 'CCl', 'Cl'],
  ['nitrile N', 'CC#N', 'N'], ['carbon monoxide C', '[C-]#[O+]', 'C-'], ['azide terminal N', 'CN=[N+]=[N-]', 'N-'], ['imine N', 'CC=NC', 'N'], ['nitrite O−', 'O=N[O-]', 'O-'],
  ['C=C bond of ethylene', 'C=C', 'C=C'], ['C–H bond of ethane', '[H]C([H])([H])C', 'C-H'], ['C–Br bond', 'CBr', 'C-Br'], ['H–Cl bond', '[H]Cl', 'H-Cl'], ['C=O bond of acetone', 'CC(C)=O', 'C=O'],
  ['B–H bond of borohydride', '[H][BH3-]', 'B--H'], ['C–Mg bond', 'C[Mg]Br', 'C-Mg'], ['C≡N bond', 'CC#N', 'C#N'], ['O–H bond of water', '[H]O', 'O-H'], ['C–C bond of ethane', 'CC', 'C-C'],
  ['C=C bond of benzene', 'C1=CC=CC=C1', 'C=C'], ['N–H bond of ammonium', '[H][NH3+]', 'N+-H'], ['fishhook from chlorine radical', '[Cl]', 'Cl', 1], ['fishhook from methyl radical', '[CH3]', 'C', 1], ['fishhook from TEMPO O', 'CC1(C)CCCC(C)(C)N1[O]', 'O', 1],
  ['fishhook from a Cl–Cl bond', 'ClCl', 'Cl-Cl', 1], ['fishhook from an O–O bond', 'COOC', 'O-O', 1], ['fishhook from a C=C bond', 'C=C', 'C=C', 1], ['fishhook from a C–H bond of ethane', '[H]C([H])([H])C', 'C-H', 1], ['fishhook from a Br–Br bond', 'BrBr', 'Br-Br', 1],
];
const refusalCases = [];
for (const [expected, list] of [['refused', REFUSE], ['allowed', ALLOW]]) {
  for (const [name, smiles, start, electrons = 2] of list) {
    const doc = mechanismDoc(RDKit, { smiles: `${smiles}.[H+]`, arrows: [] });
    const find = finder(doc);
    const from = find(start);
    const to = find('H+');
    const ed = new Editor();
    ed.setDoc(doc);
    ed.setTool({ name: 'curve', electrons });
    ed.notice = null;
    const at = (end) => {
      if (end.bond !== undefined) {
        const b = ed.doc.bonds.get(end.bond);
        const [p, q] = [ed.doc.atoms.get(b.a), ed.doc.atoms.get(b.b)];
        return [(p.x + q.x) / 2, (p.y + q.y) / 2];
      }
      const a = ed.doc.atoms.get(end.atom);
      return [a.x, a.y];
    };
    const [p, q] = [at(from), at(to)];
    const event = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
    ed.pointerDown(p, event);
    for (let k = 1; k <= 5; k++) ed.pointerMove([p[0] + ((q[0] - p[0]) * k) / 5, p[1] + ((q[1] - p[1]) * k) / 5], event);
    ed.pointerUp(q, event);
    const made = ed.doc.curves.size > 0;
    const got = made ? 'allowed' : 'refused';
    const c = {
      id: `B4-${expected === 'refused' ? 'refuse' : 'allow'}-${name.replace(/[^\w+]+/g, '-').replace(/-$/, '')}`, part: 'refusals', step: name, smiles, expected, got,
      arrow: `${electrons === 1 ? 'fishhook' : 'arrow'} from the ${describeEnd(ed.doc, from)} to H+`, message: ed.notice?.text ?? '',
      pass: got === expected, status: got === expected ? 'pass' : 'fail', drawing: null,
    };
    c.reason = c.pass ? '' : expected === 'refused' ? 'Accepted, though it should be refused (false acceptance)' : 'Refused, though it should be allowed (false refusal)';
    const key = `${c.id}:drawing`;
    drawings[key] = docToJSON(ed.doc);
    c.drawing = key;
    cases.push(c);
    refusalCases.push(c);
  }
}
console.log(`refusals: ${refusalCases.filter((c) => c.pass).length}/${refusalCases.length} as expected`);

// --- Chrome: the whole scene rebuilt in the app (window.olomol, the editor; each run turns the drawing a little,
// so that no arrow is taken from the cache) ---
const chrome = {};
if (!process.argv.includes('--no-chrome')) {
  const app = await startApp();
  for (const step of steps) {
    await putDrawing(app.page, writeOlom(step.doc));
    chrome[step.tag] = await app.page.evaluate(async () => {
      const ed = window.olomol;
      const times = [];
      for (let k = 0; k < 9; k++) {
        ed.change((doc) => {
          const atoms = [...doc.atoms.values()];
          const [cx, cy] = [atoms.reduce((s, a) => s + a.x, 0) / atoms.length, atoms.reduce((s, a) => s + a.y, 0) / atoms.length];
          const angle = 0.02 + 0.02 * k;
          const [c, s] = [Math.cos(angle), Math.sin(angle)];
          for (const a of atoms) [a.x, a.y] = [cx + c * (a.x - cx) - s * (a.y - cy), cy + s * (a.x - cx) + c * (a.y - cy)];
        });
        const t0 = performance.now();
        void ed.scene;
        if (k >= 2) times.push(performance.now() - t0);
        await new Promise((r) => setTimeout(r, 30));
      }
      times.sort((a, b) => a - b);
      return { median: times[Math.floor(times.length / 2)], max: times[times.length - 1], curves: ed.doc.curves.size };
    });
  }
  await app.close();
}
for (const step of steps) step.timing.chrome = chrome[step.tag] ? round(chrome[step.tag].median, 2) : null;

// --- summary ---
const kinds = ['labels', 'bonds', 'lonePairs', 'arrows'];
const arrowsAfter = editCases.flatMap((c) => c.arrows);
const freeBefore = editCases.flatMap((c) => c.arrows.filter((a) => !placement.find((p) => p.drawing === c.before && p.curveId === a.id)?.collides));
const summary = {
  steps: steps.length,
  arrows: placement.length,
  clean: wilson(placement.filter((c) => c.pass).length, placement.length),
  collisionFree: wilson(placement.filter((c) => !c.collides).length, placement.length),
  collisionsByKind: Object.fromEntries(kinds.map((k) => [k, wilson(placement.filter((c) => c.kinds?.includes(k)).length, placement.length)])),
  tail: { median: median(placement.map((c) => c.tail)), p95: quantile(placement.map((c) => c.tail), 0.95), max: max(placement.map((c) => c.tail)) },
  head: { median: median(placement.map((c) => c.head)), p95: quantile(placement.map((c) => c.head), 0.95), max: max(placement.map((c) => c.head)) },
  msPerArrow: { median: median(placement.map((c) => c.ms)), p95: quantile(placement.map((c) => c.ms), 0.95), max: max(placement.map((c) => c.ms)) },
  sceneNode: { median: median(steps.map((s) => s.timing.scene)), max: max(steps.map((s) => s.timing.scene)), warmMedian: median(steps.map((s) => s.timing.sceneWarm)) },
  sceneChrome: { median: median(steps.map((s) => s.timing.chrome).filter((v) => v !== null)), max: max(steps.map((s) => s.timing.chrome).filter((v) => v !== null)) },
  largest: (() => { const s = steps.reduce((b, x) => (x.doc.curves.size > b.doc.curves.size ? x : b)); return { step: s.name, arrows: s.doc.curves.size, ...s.timing }; })(),
  edits: editCases.length,
  editsAllRight: wilson(editCases.filter((c) => c.pass).length, editCases.length),
  arrowsAnchored: wilson(arrowsAfter.filter((a) => a.anchored).length, arrowsAfter.length),
  arrowsStillFree: wilson(freeBefore.filter((a) => !a.collides).length, freeBefore.length),
  editsByKind: Object.fromEntries(['moved', 'turned', 'flipped', 'redrew'].map((k) => [k, wilson(editCases.filter((c) => c.editKind === k && c.pass).length, editCases.filter((c) => c.editKind === k).length)])),
  falseAcceptances: wilson(refusalCases.filter((c) => c.expected === 'refused' && c.got === 'allowed').length, refusalCases.filter((c) => c.expected === 'refused').length),
  falseRefusals: wilson(refusalCases.filter((c) => c.expected === 'allowed' && c.got === 'refused').length, refusalCases.filter((c) => c.expected === 'allowed').length),
  thresholds: { near: NEAR, ends: ENDS, tail: TAIL_OK, head: HEAD_OK },
  stepTimings: steps.map((s) => ({ step: s.name, arrows: s.doc.curves.size, atoms: s.doc.atoms.size, ...s.timing })),
};
writeFileSync(new URL('out/b4-drawings.json', import.meta.url), JSON.stringify(drawings));
saveResults({
  id: 'b4', title: 'B4: curved-arrow placement', environment: env, seconds: Math.round((performance.now() - started) / 100) / 10, seed: SEED,
  truth: "Collisions and ends measured on olomol's scene by the benchmark's own geometry; refusals against olomol's stated rule (an arrow can't start at an atom with no lone pair or unpaired electron), not against chemistry olomol doesn't claim to check.",
  summary, cases,
  csvColumns: ['id', 'part', 'step', 'arrow', 'edit', 'status', 'reason', 'tail', 'head', 'ms', 'expected', 'got', 'message'],
});
console.log(JSON.stringify({ clean: summary.clean, ms: summary.msPerArrow, scene: summary.sceneNode, chrome: summary.sceneChrome, edits: summary.editsAllRight, anchored: summary.arrowsAnchored, free: summary.arrowsStillFree, fa: summary.falseAcceptances, fr: summary.falseRefusals }));
