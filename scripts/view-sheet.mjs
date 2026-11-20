// A sheet of views to pick from: a molecule's 3D model, the one Turn in 3D
// builds, seen from all round, each view drawn by the app's own renderer
// exactly as "Use this view" would put it on the canvas, numbered on one
// PNG. For choosing the view of a video or a manual picture by looking, not
// by guessing drags or arrow keys. Start the dev server (npm run dev), then
//   node scripts/view-sheet.mjs <name or SMILES> <out dir> [--url http://localhost:5179/] [--count 24] [--whole]
// A name goes to PubChem as the app sends it (Enter in Name / SMILES); a
// stereocentre its record leaves undefined is reported, since the 3D model
// then takes either side. Writes <out>/<slug>.png (the sheet), <slug>/NN.svg
// (each view) and <slug>.json: per view its rotation from Turn in 3D's
// first view (the "clearest" one, #0), a drag and a Shift drag that give it
// exactly (in screen pixels, as the stage turns 0.01 rad per pixel), and
// the arrow keys that come nearest (5° each; what manual-shots.mjs presses).
// The views are judged by the molecule's core (the ring system with the most
// sp3 atoms, with the atoms on it; --whole: all of it), since a side chain
// gets redrawn after the turn. Shown: the core readable (no labels on top of
// each other, no end bond seen too short), R/S and E/Z kept; spread evenly
// over the directions they are seen from, the better drawn first (Redraw's
// own score of the core), turned in the plane so that the longest extent is
// level and the heteroatoms are above.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { multiply, rotationAbout } from '../src/layout/threeD.js';
import { turnDrags } from './about-videos/lib.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const [input, out] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!input || !out) {
  console.log('node scripts/view-sheet.mjs <name or SMILES> <out dir> [--url http://localhost:5179/] [--count 24] [--whole]');
  process.exit(1);
}
const url = new URL(option('--url', 'http://localhost:5179/'));
url.searchParams.set('test', '');
url.searchParams.set('lang', 'en');
const count = Number(option('--count', 24));
const whole = args.includes('--whole'); // judge the whole molecule, not its core
const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'molecule';
mkdirSync(`${out}/${slug}`, { recursive: true });

// --- the molecule: a SMILES as it is, a name from PubChem ---
const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
let smiles = input;
let cid = null;
const typed = RDKit.get_mol(input);
if (typed) typed.delete();
else {
  const response = await fetch('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/property/SMILES,Title/JSON', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `name=${encodeURIComponent(input)}`,
  });
  const found = (await response.json()).PropertyTable?.Properties?.[0];
  if (!found) throw new Error(`PubChem doesn't know "${input}"`);
  ({ SMILES: smiles, CID: cid } = found);
}
const undefinedCentres = (() => {
  const mol = RDKit.get_mol(smiles);
  try {
    const tags = JSON.parse(mol.get_stereo_tags());
    return [...(tags.CIP_atoms ?? []), ...(tags.CIP_bonds ?? [])].filter((t) => t.at(-1) === '(?)').length;
  } finally {
    mol.delete();
  }
})();
console.log(`${input}${cid ? ` (CID ${cid})` : ''}: ${smiles}`);
if (undefinedCentres) console.log(`  ${undefinedCentres} stereocentre(s) undefined: the 3D model takes either side`);

// --- the views, worked out and drawn in the app ---
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
page.on('pageerror', (error) => console.log('[page error]', error.message));
await page.goto(url.href);
await page.waitForFunction(() => window.olomolTest);
const found = await page.evaluate(async ({ smiles, count, whole }) => {
  const relayout = await import('/src/layout/relayout.js');
  const threeD = await import('/src/layout/threeD.js');
  const { distanceToSegment, layoutProblems } = await import('/src/layout/geometry.js');
  const { buildScene } = await import('/src/render/scene.js');
  const { sceneToSVG } = await import('/src/render/svg.js');
  const { emptyDoc } = await import('/src/model/doc.js');
  olomol.setDoc({ atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), nextId: 1 });
  await olomolTest.paste(smiles);
  olomol.setTool({ name: 'select' });
  olomol.select([...olomol.doc.atoms.keys()]);
  const job = await relayout.prepare(olomol, relayout.relayoutTargets(olomol));
  const [molecule] = job.molecules;
  const model = await relayout.model3D(job, molecule);
  if (model.reason) return { reason: model.reason };
  // Turn in 3D's first view, which the rotations start from
  const { complex } = model;
  const [clearest] = threeD.views(model.points, model.pairs, { axes: !complex, flat: complex?.flat, prefer: complex?.prefer, complex, count: 1, labelled: molecule.elements.map((el) => el !== 'C') });
  const base = clearest.points3;
  const doc = emptyDoc();
  for (const id of molecule.atomIds) doc.atoms.set(id, structuredClone(olomol.doc.atoms.get(id)));
  for (const id of molecule.bondIds) doc.bonds.set(id, structuredClone(olomol.doc.bonds.get(id)));
  const hetero = molecule.elements.map((el) => el !== 'C' && el !== 'H');
  // the core the view is judged by: the ring system with the most sp3 atoms (the tropane, not the benzoate),
  // with the atoms on it, which say where its substituents point; the rest gets redrawn after the turn
  const n = molecule.atomIds.length;
  const near = Array.from({ length: n }, () => []);
  model.pairs.forEach(([a, b]) => { near[a].push(b); near[b].push(a); });
  const cyclic = model.pairs.filter(([a, b]) => {
    // a ring bond: a and b still joined without it
    const seen = new Set([a]);
    const todo = [a];
    while (todo.length) {
      const x = todo.pop();
      for (const y of near[x]) {
        if ((x === a && y === b) || seen.has(y)) continue;
        seen.add(y);
        todo.push(y);
      }
    }
    return seen.has(b);
  });
  const systems = [];
  for (const [a, b] of cyclic) {
    const mine = systems.filter((s) => s.has(a) || s.has(b));
    const joined = new Set([a, b, ...mine.flatMap((s) => [...s])]);
    for (const s of mine) systems.splice(systems.indexOf(s), 1);
    systems.push(joined);
  }
  const sp3 = (i) => !molecule.links.some((l) => (l.a === i || l.b === i) && l.order > 1);
  const ringSystem = whole ? null : systems.sort((p, q) => [...q].filter(sp3).length - [...p].filter(sp3).length)[0];
  const core = ringSystem ? [...new Set([...ringSystem, ...[...ringSystem].flatMap((i) => near[i])])] : molecule.atomIds.map((_, i) => i);
  const coreSet = new Set(core);
  const corePairs = model.pairs.filter(([a, b]) => coreSet.has(a) && coreSet.has(b));
  const labelled = (i) => hetero[i] || near[i].length === 1;
  // atoms of the core on top of each other (labels need more room than bare corners), end bonds too short to read
  const crowded = (points) => core.some((i, x) => core.slice(x + 1).some((j) => !near[i].includes(j)
    && Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) < (labelled(i) || labelled(j) ? 0.55 : 0.35)))
    || core.some((i) => near[i].length === 1 && Math.hypot(points[i][0] - points[near[i][0]][0], points[i][1] - points[near[i][0]][1]) < 0.4)
    // a label on a bond of the core it isn't on
    || core.some((i) => labelled(i) && corePairs.some(([a, b]) => a !== i && b !== i && distanceToSegment(points[i], points[a], points[b]) < 0.45));

  // directions to look from (in the first view's frame: z towards the viewer), evenly over the sphere
  const N = 400;
  const directions = Array.from({ length: N }, (_, i) => {
    const z = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - z * z);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    return [r * Math.cos(phi), r * Math.sin(phi), z];
  });
  directions.unshift([0, 0, 1]); // (the first view itself)
  const level = (rotation) => {
    // turned in the plane: the longest extent level, the heteroatoms above the middle
    const p = base.map((v) => rotation.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]));
    const [mx, my] = [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
    let [sxx, syy, sxy] = [0, 0, 0];
    for (const [x, y] of p) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const phi = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let turned = threeD.multiply(threeD.rotationAbout([0, 0, 1], -phi), rotation);
    const up = turned.map((row) => row); // (y up in 3D)
    const heights = base.map((v) => up[1][0] * v[0] + up[1][1] * v[1] + up[1][2] * v[2]);
    const middle = heights.reduce((s, h) => s + h, 0) / heights.length;
    const above = heights.filter((_, k) => hetero[k]).reduce((s, h) => s + h - middle, 0);
    if (above < 0) turned = threeD.multiply(threeD.rotationAbout([0, 0, 1], Math.PI), turned);
    return turned;
  };
  const candidates = [];
  for (const [k, d] of directions.entries()) {
    const sideways = Math.hypot(d[0], d[1]);
    const toViewer = sideways < 1e-9 ? (d[2] > 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : threeD.rotationAbout([0, 1, 0], Math.PI))
      : threeD.rotationAbout([d[1] / sideways, -d[0] / sideways, 0], Math.acos(Math.max(-1, Math.min(1, d[2]))));
    const rotation = k === 0 ? toViewer : level(toViewer);
    const view = threeD.projected(base, rotation);
    const drawing = relayout.drawing3D(job, molecule, model, view);
    const { crossings } = layoutProblems(drawing.points, corePairs);
    if (k && crowded(drawing.points)) continue;
    relayout.putDrawing(doc, molecule, drawing);
    if (k && !(await relayout.sameMolecule(job, molecule, doc))) continue;
    // (Redraw's own score, of the core: crossings, bonds of the wrong length, ring corners seen straight)
    const { score } = relayout.drawingScore(doc, { molecules: [{ atomIds: core.map((i) => molecule.atomIds[i]) }] }, { crossings, overlaps: 0 });
    candidates.push({ direction: d, rotation, score, crossings });
  }
  // spread over the directions, the better drawn first
  const [start, ...rest] = candidates;
  rest.sort((p, q) => p.score - q.score);
  const chosen = [start];
  const apart = (p, q) => Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])));
  for (let least = (40 * Math.PI) / 180; chosen.length < count && least > (8 * Math.PI) / 180; least *= 0.85) {
    for (const c of rest) {
      if (chosen.length >= count) break;
      if (!chosen.includes(c) && chosen.every((x) => apart(x.direction, c.direction) >= least)) chosen.push(c);
    }
  }
  chosen.splice(1, chosen.length, ...chosen.slice(1).sort((p, q) => p.score - q.score)); // (the best drawn first, after the first view)
  return {
    core: ringSystem ? ringSystem.size : null,
    readable: candidates.length - 1,
    views: chosen.map((c) => {
      relayout.putDrawing(doc, molecule, relayout.drawing3D(job, molecule, model, threeD.projected(base, c.rotation)));
      // (what the core isn't drawn pale: it is redrawn after the turn)
      const shown = structuredClone(doc);
      const coreIds = new Set(core.map((i) => molecule.atomIds[i]));
      for (const atom of shown.atoms.values()) if (!coreIds.has(atom.id)) atom.color = '#b9bdc7';
      for (const bond of shown.bonds.values()) if (!coreIds.has(bond.a) || !coreIds.has(bond.b)) bond.color = '#b9bdc7';
      return { ...c, svg: sceneToSVG(buildScene(shown, olomol.settings), { scale: 40, background: '#ffffff' }) };
    }),
  };
}, { smiles, count, whole });
if (found.reason) throw new Error(`no 3D model: ${found.reason}`);

// --- how to get each view in Turn in 3D ---
const STEP = (5 * Math.PI) / 180;
const transpose = (m) => m[0].map((_, k) => m.map((row) => row[k]));
const angleBetween = (p, q) => {
  const m = multiply(transpose(p), q);
  return Math.acos(Math.max(-1, Math.min(1, (m[0][0] + m[1][1] + m[2][2] - 1) / 2)));
};
// a drag in a straight line, then a Shift drag, that give it exactly (as the about page's videos do it)
function drags(R) {
  const { drag, shift } = turnDrags(R);
  return { drag: drag.map((v) => +v.toFixed(1)), shift: +shift.toFixed(1) };
}
// arrow keys: Down/Up about the page's horizontal, then Right/Left about its vertical, then Shift+Right/Left in it
function keys(R) {
  const b = -Math.asin(Math.max(-1, Math.min(1, R[2][0])));
  const a = Math.atan2(R[2][1], R[2][2]);
  const c = Math.atan2(R[1][0], R[0][0]);
  const [na, nb, nc] = [Math.round(a / STEP), Math.round(b / STEP), Math.round(-c / STEP)];
  const keyed = multiply(rotationAbout([0, 0, 1], -nc * STEP), multiply(rotationAbout([0, 1, 0], nb * STEP), rotationAbout([1, 0, 0], na * STEP)));
  const list = [...Array(Math.abs(na)).fill(na > 0 ? 'ArrowDown' : 'ArrowUp'), ...Array(Math.abs(nb)).fill(nb > 0 ? 'ArrowRight' : 'ArrowLeft'), ...Array(Math.abs(nc)).fill(nc > 0 ? 'Shift+ArrowRight' : 'Shift+ArrowLeft')];
  return { keys: list, off: +((angleBetween(keyed, R) * 180) / Math.PI).toFixed(1) };
}

const views = found.views.map((v, n) => {
  writeFileSync(`${out}/${slug}/${String(n).padStart(2, '0')}.svg`, v.svg);
  return { n, rotation: v.rotation, ...drags(v.rotation), ...keys(v.rotation), score: +v.score.toFixed(2), crossings: v.crossings, svg: v.svg };
});
writeFileSync(`${out}/${slug}.json`, JSON.stringify({ input, cid, smiles, undefinedCentres, url: url.origin, views: views.map(({ svg, ...rest }) => rest) }, null, 1));

// --- the sheet ---
// (all at one scale, the largest fitting its cell: a view seen end on looks as small as it is)
const sizes = views.map((v) => v.svg.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number));
const fit = Math.min(1, 300 / Math.max(...sizes.map(([w]) => w)), 220 / Math.max(...sizes.map(([, h]) => h)));
const cells = views.map((v, k) => `<figure><div class="pic">${v.svg.replace(/width="\d+" height="\d+"/, `width="${Math.round(sizes[k][0] * fit)}" height="${Math.round(sizes[k][1] * fit)}"`)}</div>
  <figcaption><b>#${v.n}</b>${v.n === 0 ? ' first view' : ''} · score ${v.score}${v.crossings ? ` · ${v.crossings} crossing${v.crossings > 1 ? 's' : ''}` : ''}<br>
  <span>drag ${v.drag.join(', ')} · Shift ${v.shift} · ${v.keys.length} keys (${v.off}° off)</span></figcaption></figure>`).join('\n');
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body { margin: 16px; font: 13px system-ui, sans-serif; color: #1c1f26; background: #f3f4f7; }
  h1 { font-size: 18px; margin: 0 0 4px; } p { margin: 0 0 12px; color: #555; word-break: break-all; }
  main { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  figure { margin: 0; background: #fff; border: 1px solid #d6d9e0; border-radius: 8px; padding: 8px; }
  .pic { height: 230px; display: flex; align-items: center; justify-content: center; }
  figcaption { margin-top: 6px; font-size: 12px; } figcaption span { color: #777; font-size: 11px; }
</style><h1>${input}${cid ? ` · CID ${cid}` : ''}</h1>
<p>${smiles}${undefinedCentres ? ` · <b>${undefinedCentres} stereocentre(s) undefined</b>` : ''} · judged by ${found.core ? `its core (a ring system of ${found.core} atoms and the atoms on it; the rest pale, to be redrawn)` : 'the whole molecule'} · ${found.readable} readable views of 400, ${views.length} shown</p>
<main>${cells}</main>`);
await page.screenshot({ path: `${out}/${slug}.png`, fullPage: true });
await browser.close();
console.log(`  ${out}/${slug}.png: ${views.length} views (${found.readable} readable)`);
