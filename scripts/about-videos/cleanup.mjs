// Cocaine by hand, Turn in 3D and Redraw together: tropane by name, turned in 3D to the textbook view;
// a carboxylic acid from Templates on C2, a methyl on its OH (the methyl ester); benzoic acid by name
// beside it, flipped top–bottom, and a bond pulled from C3 to its OH (the benzoate); then only the
// benzoyl part redrawn, the tropane staying as it was turned. Four drawings J made by hand are the
// targets (FRAME: the turned tropane, with the acid on C2, with benzoic acid beside, joined); each step is
// checked against them, the turn exactly (its drags are worked out from the rotation that gives frame 1).
//   node cleanup.mjs <out dir> [record]       (PROBE=1: stills, and how near each Redraw card comes to frame 4)
import { APP, open, turnDrags } from './lib.mjs';
const [out, mode] = process.argv.slice(2);
const d = await open(APP);
const { page, pause, move, click, drag, key, type, atoms, bonds, atomAt, state, between } = d;
const center = async (id) => { const b = await page.getByTestId(id).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const snap = async (name) => mode !== 'record' && page.screenshot({ path: `${out}/${name}.png` });
const newAtoms = async (before) => (await atoms()).filter((a) => !before.some((b) => b.id === a.id));
const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];

// J's drawings (drawing units, y down; by role) and the turn that gives the first: Turn in 3D's rotation
// from its first view of tropane, fitted to frame 1 (exact: it is that view, untouched)
const FRAME = {
  methyl: [-0.67, 11.9], N: [0.22, 12.2], C1: [0.65, 12.68], C7: [0.25, 13.61], C6: [-0.03, 13.72], C2: [1.64, 12.69], C3: [1.85, 13.11], C4: [1.17, 12.86], C5: [0.22, 12.84],
  acidC: [2.17, 11.84], acidOH: [1.7, 10.96], acidO: [3.17, 11.87], // frame 2
  benzoicC: [5.64, 13.39], benzoicOH: [4.77, 12.89], // frame 3
  esterO: [2.6, 13.78], carbonylC: [3.55, 13.47], carbonylO: [3.75, 12.49], ipso: [4.29, 14.13], // frame 4
};
const ROTATION = [[-0.8635335444136989, 0.27868595011251157, 0.42029032689582685], [-0.40757960657506914, 0.10509195473557423, -0.9071022794337846], [-0.29696579260316514, -0.9546150125887098, 0.022836281742682384]];
const PLACE_OFFSET = [0.112, -1.247]; // where a click puts benzoic acid's carboxyl C, from the click (drawing units)
// the Redraw card picked: CoordGen's, which gives frame 4 (PROBE lists the part's drawings by score: Indigo's ranks first)
const PICK = 'Selected part redrawn 2';
const SCALE = 66; // px per bond length on the canvas
// where J's drawing goes on the screen: its middle (frame 4's) at the middle of the free canvas
const [MIDDLE, SCREEN_MIDDLE] = [[2.66, 13.37], [640, 345]];
const screenOf = ([x, y]) => [SCREEN_MIDDLE[0] + (x - MIDDLE[0]) * SCALE, SCREEN_MIDDLE[1] + (y - MIDDLE[1]) * SCALE];
const atDoc = (id) => state((id) => { const a = olomol.doc.atoms.get(id); return [a.x, a.y]; }, id);
// how far an atom is from where J has it, the drawings lined up by the N
let nAt = null;
const off = async (id, role) => {
  const [p, n] = [await atDoc(id), await atDoc(nAt)];
  return Math.hypot(p[0] - n[0] - (FRAME[role][0] - FRAME.N[0]), p[1] - n[1] - (FRAME[role][1] - FRAME.N[1]));
};
// (more than 0.05 off: stop, unless probing)
const check = async (what, pairs) => {
  const each = await Promise.all(pairs.map(async ([id, role]) => [role, await off(id, role)]));
  console.log(`${what}: off J's drawing by ${each.map(([r, v]) => `${r} ${v.toFixed(2)}`).join(', ')}`);
  if (!process.env.PROBE && each.some(([, v]) => v > 0.05)) throw new Error(`${what} is not J's drawing`);
};
const template = async (name) => {
  await click(...(await page.getByRole('button', { name: 'Templates' }).boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2])));
  await page.getByTestId('template-search').waitFor();
  await pause(between(250, 350));
  await type(name);
  await pause(between(450, 600));
  const card = await page.getByTestId('template').first().boundingBox();
  await click(card.x + card.width / 2, card.y + card.height / 2);
  await pause(between(250, 350));
};
const bondOrder = (a, b) => state(([a, b]) => [...olomol.doc.bonds.values()].find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))?.order ?? 0, [a, b]);

await state(([s, x, y]) => olomol.setView({ scale: s, tx: x, ty: y }), [SCALE, SCREEN_MIDDLE[0] - MIDDLE[0] * SCALE, SCREEN_MIDDLE[1] - MIDDLE[1] * SCALE]);
await page.addStyleTag({ content: '.empty-hint { display: none !important; }' });
await page.mouse.move(640, 560);
await pause(800);
if (mode === 'record') await d.record();
await pause(700);

// 1. tropane by name, put down where its turned drawing will be (Use this view keeps a molecule's middle)
await move(620, 420);
await key('/', '/');
await pause(between(200, 350));
await type('tropane');
await pause(between(300, 450));
await key('Enter', 'Enter');
await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 });
const tropaneMiddle = [(FRAME.methyl[0] + FRAME.C2[0]) / 2, (FRAME.methyl[1] + FRAME.C6[1]) / 2]; // (its box: CH3 to C2, CH3 to C6)
await click(...screenOf(tropaneMiddle));
await pause(between(250, 400));
await key('Escape', 'Esc');
await snap('c1-tropane');

// 2. turned in 3D: one drag, then one Shift drag, in straight lines so that they add up exactly
const list = await bonds();
const [p0, q0] = await Promise.all([list[0].a, list[0].b].map(atomAt));
if ((await state(() => olomol.tool.name)) !== 'select') throw new Error('not the select tool after placing');
await move(...mid(p0, q0));
await pause(between(150, 250));
await page.mouse.dblclick(...mid(p0, q0));
await pause(between(350, 500));
await click(...(await center('turn3d')));
await page.getByTestId('turn3d-stage').waitFor({ timeout: 90_000 });
await pause(500);
const stage = await page.getByTestId('turn3d-stage').boundingBox();
const [cx, cy] = [stage.x + stage.width / 2, stage.y + stage.height / 2];
const turn = async (dx, dy, { shift = false, ms = 950 } = {}) => {
  if (shift) { await page.keyboard.down('Shift'); await d.showKey('Shift', ms + 300); }
  await pause(between(80, 140));
  await page.mouse.down();
  await move(d.at()[0] + dx, d.at()[1] + dy, ms, { exact: true });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await pause(between(220, 340));
};
const { drag: [dx, dy], shift } = turnDrags(ROTATION);
await move(cx - dx / 2, cy - dy / 2);
await turn(dx, dy, { ms: 1100 });
await move(cx - shift / 2, cy + 120);
await turn(shift, 0, { shift: true, ms: 1100 });
await pause(600);
await snap('c2a-stage');
await click(...(await center('turn3d-use')));
await pause(350);
await click(1000, 600); // (nothing selected)
await pause(250);
await snap('c2-turned');
// the atoms by where they are in frame 1
const tropane = await atoms();
nAt = tropane.find((a) => a.el === 'N').id;
const role = {};
{
  const n = await atDoc(nAt);
  for (const a of tropane) {
    const p = await atDoc(a.id);
    const [[name]] = ['methyl', 'N', 'C1', 'C7', 'C6', 'C2', 'C3', 'C4', 'C5']
      .map((r) => [r, Math.hypot(p[0] - n[0] - (FRAME[r][0] - FRAME.N[0]), p[1] - n[1] - (FRAME[r][1] - FRAME.N[1]))]).sort((x, y) => x[1] - y[1]);
    role[name] = a.id;
  }
}
await check('frame 1 (turned)', Object.entries(role).map(([r, id]) => [id, r]));
const before3d = await state(() => [...olomol.doc.atoms.values()].map((a) => [a.id, a.x, a.y]));

// 3. a carboxylic acid from Templates on C2, a methyl on its OH
await template('carboxylic');
let before = await atoms();
await click(...(await atomAt(role.C2)));
await pause(between(250, 400));
await key('Escape', 'Esc');
const acid = await newAtoms(before);
const acidC = acid.find((a) => a.el === 'C').id;
const acidOs = acid.filter((a) => a.el === 'O').map((a) => a.id);
const acidOH = (await bondOrder(acidC, acidOs[0])) === 1 ? acidOs[0] : acidOs[1];
const acidO = acidOs.find((id) => id !== acidOH);
await check('frame 2 (the acid)', [[acidC, 'acidC'], [acidOH, 'acidOH'], [acidO, 'acidO']]);
await click(...(await center('tool-bond')));
before = await atoms();
await click(...(await atomAt(acidOH)));
await pause(between(250, 400));
await snap('c3-ester');

// 4. benzoic acid by name, beside it
await key('Escape', 'Esc');
await move(620, 420);
await key('/', '/');
await pause(between(200, 350));
await type('benzoic acid');
await pause(between(300, 450));
await key('Enter', 'Enter');
await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 });
before = await atoms();
await click(...screenOf(FRAME.benzoicC.map((v, k) => v - PLACE_OFFSET[k])));
await pause(between(250, 400));
await key('Escape', 'Esc');
const benzoic = await newAtoms(before);
// flipped top–bottom, its acid towards the tropane
{
  if ((await state(() => olomol.tool.name)) !== 'select') throw new Error('not the select tool after placing');
  const ring = await bonds();
  const inBenzoic = new Set(benzoic.map((a) => a.id));
  const b = ring.find((x) => inBenzoic.has(x.a) && inBenzoic.has(x.b) && benzoic.find((a) => a.id === x.a).el === 'C' && benzoic.find((a) => a.id === x.b).el === 'C');
  const at = mid(...(await Promise.all([b.a, b.b].map(atomAt))));
  await move(...at);
  await pause(between(150, 250));
  await page.mouse.dblclick(...at);
  await pause(between(300, 450));
  const button = await page.getByTitle('Flip top–bottom (selection, or everything)').boundingBox();
  await click(button.x + button.width / 2, button.y + button.height / 2);
  await pause(between(350, 500));
  await click(1000, 640); // (nothing selected)
  await pause(250);
}
const benzoicOs = benzoic.filter((a) => a.el === 'O').map((a) => a.id);
let benzoicC = null;
for (const c of benzoic.filter((a) => a.el === 'C')) if (await bondOrder(c.id, benzoicOs[0])) benzoicC = c.id;
const benzoicOH = (await bondOrder(benzoicC, benzoicOs[0])) === 1 ? benzoicOs[0] : benzoicOs[1];
await check('frame 3 (benzoic acid)', [[benzoicC, 'benzoicC']]); // (its OH on the other side than J's: one flip, not two)
if (process.env.PROBE) {
  const [c, n] = [await atDoc(benzoicC), await atDoc(nAt)];
  const wanted = [FRAME.benzoicC[0] - FRAME.N[0] + n[0], FRAME.benzoicC[1] - FRAME.N[1] + n[1]];
  console.log('PLACE_OFFSET should be', [c[0] - wanted[0] + PLACE_OFFSET[0], c[1] - wanted[1] + PLACE_OFFSET[1]].map((v) => +v.toFixed(3)));
}
await snap('c4-benzoic');

// 5. a bond pulled from C3 to the benzoic acid's OH: the ester
await click(...(await center('tool-bond')));
await drag(...(await atomAt(role.C3)), ...(await atomAt(benzoicOH)));
await pause(between(300, 400));
if (!(await bondOrder(role.C3, benzoicOH))) throw new Error('C3 and the OH not joined');
await click(...(await center('tool-select')));
await click(1000, 640); // (nothing selected)
await pause(300);
await snap('c5-joined');
const ester = benzoicOH;

// 6. only the benzoyl part selected with a box, and redrawn; the tropane stays
const present = new Set((await atoms()).map((a) => a.id));
const part = benzoic.map((a) => a.id).filter((id) => id !== benzoicOH && present.has(id));
const spots = await Promise.all(part.map(atomAt));
const box = [Math.min(...spots.map((p) => p[0])) - 30, Math.min(...spots.map((p) => p[1])) - 30, Math.max(...spots.map((p) => p[0])) + 30, Math.max(...spots.map((p) => p[1])) + 30];
await drag(box[0], box[1], box[2], box[3]);
await pause(350);
await snap('c6-selected');
if (process.env.PROBE) {
  // the part's drawings, and how near each comes to frame 4
  const found = await state(async (target) => {
    const relayout = await import('/src/layout/relayout.js');
    const job = await relayout.prepare(olomol, relayout.relayoutTargets(olomol));
    const view = await relayout.runEngines(olomol, job, () => {}, () => false);
    return view.candidates.filter((c) => c.part).map((c) => {
      const copy = relayout.withCandidate(olomol.doc, job, c);
      const n = copy.atoms.get(target.n);
      const worst = Math.max(...target.atoms.map(([id, [x, y]]) => Math.hypot(copy.atoms.get(id).x - n.x - x, copy.atoms.get(id).y - n.y - y)));
      return `${c.score} | ${c.label} | ${c.part} | also ${(c.also ?? []).join('; ')} | at most ${worst.toFixed(2)} from frame 4`;
    });
  }, { n: nAt, atoms: [[benzoicC, 'carbonylC'], [ester, 'esterO']].map(([id, r]) => [id, [FRAME[r][0] - FRAME.N[0], FRAME[r][1] - FRAME.N[1]]]) });
  console.log(found.sort((p, q) => parseFloat(p) - parseFloat(q)).join('\n'));
  await d.browser.close();
  process.exit(0);
}
await click(...(await center('relayout')));
const cards = page.getByTestId('layout-part').getByTestId('layout-card');
const picked = cards.filter({ hasText: PICK });
await picked.waitFor({ timeout: 60_000 });
await pause(450);
await snap('c7-cards');
{ const b = await cards.last().boundingBox(); await move(b.x + b.width * between(0.4, 0.6), b.y + b.height * between(0.35, 0.5)); await pause(between(250, 350)); }
const choice = await picked.boundingBox();
await click(choice.x + choice.width / 2, choice.y + choice.height * 0.45);
await pause(500);
await click(1000, 640); // (nothing selected)
await pause(900);
await snap('c8-done');
const carbonylO = benzoicOs.find((id) => id !== benzoicOH);
let ipso = null;
for (const c of benzoic.filter((a) => a.el === 'C' && a.id !== benzoicC)) if (await bondOrder(c.id, benzoicC)) ipso = c.id;
await check('frame 4 (the benzoate)', [[benzoicC, 'carbonylC'], [ester, 'esterO'], [carbonylO, 'carbonylO'], [ipso, 'ipso']]);
const after3d = await state(() => [...olomol.doc.atoms.values()].map((a) => [a.id, a.x, a.y]));
const moved = before3d.map(([id, x, y]) => { const a = after3d.find((p) => p[0] === id); return a ? Math.hypot(a[1] - x, a[2] - y) : Infinity; });
console.log('tropane moved at most', Math.max(...moved).toFixed(4));
if (mode === 'record') await d.save(`${out}/cleanup.mp4`, { hold: 2 });
await d.browser.close();
