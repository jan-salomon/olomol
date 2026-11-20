// E2 drawn by hand: 2-bromopropane and methoxide by name, an H drawn on, lone pairs, three curved
// arrows, one of them dragged to the other side, methoxide moved closer so that they find their way
// again, then all three selected and coloured red.   node e2.mjs <out dir> [record]
import { APP, open } from './lib.mjs';
const [out, mode] = process.argv.slice(2);
const d = await open(APP);
const { page, pause, move, click, drag, key, type, atoms, bonds, atomAt, pairsOf, state, between } = d;
const center = async (id) => { const b = await page.getByTestId(id).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const snap = async (name) => mode !== 'record' && page.screenshot({ path: `${out}/${name}.png` });
const SCALE = 66;
await state((s) => olomol.setView({ scale: s, tx: 640, ty: 330 }), SCALE);
await page.addStyleTag({ content: '.empty-hint { display: none !important; }' });
await page.mouse.move(640, 560);
await pause(800);
if (mode === 'record') await d.record();
await pause(800);
const newAtoms = async (before) => (await atoms()).filter((a) => !before.some((b) => b.id === a.id));
const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];

// a molecule by its name: /, the name, Enter, a click where it goes
async function byName(name, x, y) {
  await key('/', '/');
  await pause(between(200, 350));
  await type(name);
  await pause(between(300, 450));
  await key('Enter', 'Enter');
  await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 });
  const before = await atoms();
  await click(x, y);
  await pause(between(250, 400));
  await key('Escape', 'Esc');
  return newAtoms(before);
}
await move(700, 420);
const substrate = await byName('2-bromopropane', 720, 360);
const base = await byName('methoxide', 380, 440);
await snap('e1-named');
const br = substrate.find((a) => a.el === 'Br').id;
const o = base.find((a) => a.el === 'O').id;
const bondList = await bonds();
const nextTo = (id) => bondList.filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
const ca = nextTo(br)[0];
const methyls = nextTo(ca).filter((id) => id !== br);
const positions = await Promise.all(methyls.map(atomAt));
const cb = methyls[positions[0][1] > positions[1][1] ? 0 : 1]; // the lower methyl, nearer the base

// an H on it: the bond tool, a click on the carbon, H over the new atom
await click(...(await center('tool-bond')));
let before = await atoms();
await click(...(await atomAt(cb)));
const [{ id: h }] = await newAtoms(before);
await move(...(await atomAt(h)), undefined, { precise: true });
await pause(between(150, 250));
await key('h', 'H');
// lone pairs on O and Br
await click(...(await center('tool-pairs')));
await click(...(await atomAt(o)));
await click(...(await atomAt(br)));
await snap('e2-ready');

// the arrows: O's lone pair to H, the C–H bond to the C–C bond, the C–Br bond to Br
await click(...(await center('tool-curve')));
const [pO, pH, pB, pA, pBr] = await Promise.all([o, h, cb, ca, br].map(atomAt));
const pair = (await pairsOf(o)).sort((p, q) => Math.hypot(p[0] - pH[0], p[1] - pH[1]) - Math.hypot(q[0] - pH[0], q[1] - pH[1]))[0];
await drag(...pair, ...pH);
await drag(...mid(pB, pH), ...mid(pB, pA));
await drag(...mid(pA, pBr), pBr[0] + 6, pBr[1] - 8);
await snap('e3-arrows');

// the first arrow over to the other side: the select tool, its middle dragged across
const first = await state(() => [...olomol.doc.curves.values()][0].id);
const curveAt = (id) => page.evaluate((id) => {
  const path = document.querySelector(`svg g[data-id="${id}"] path`);
  const length = path.getTotalLength();
  const m = path.getScreenCTM();
  const at = (l) => { const p = path.getPointAtLength(l); return [p.x * m.a + p.y * m.c + m.e, p.x * m.b + p.y * m.d + m.f]; };
  return { start: at(0), middle: at(length / 2), end: at(length) };
}, id);
await click(...(await center('tool-select')));
const { start, middle, end } = await curveAt(first);
// the middle mirrored across the line from start to end
const [ux, uy] = [(end[0] - start[0]), (end[1] - start[1])];
const k = ((middle[0] - start[0]) * ux + (middle[1] - start[1]) * uy) / (ux * ux + uy * uy);
const foot = [start[0] + k * ux, start[1] + k * uy];
const across = [2 * foot[0] - middle[0], 2 * foot[1] - middle[1]];
await drag(...middle, ...across);
await snap('e4-flipped');

// methoxide moved closer at once: the arrows find their way again as it goes
const methyl = base.find((a) => a.el === 'C').id;
const [pm, po] = await Promise.all([methyl, o].map(atomAt));
const grip = [(pm[0] + po[0]) / 2, (pm[1] + po[1]) / 2];
await move(...grip);
await pause(between(80, 140));
await page.mouse.dblclick(...grip);
await pause(between(180, 260));
await page.mouse.down();
await pause(100);
await move(grip[0] + 75, grip[1] - 5, 700, { precise: true, bend: 0.05 });
await snap('e5-moving');
await move(grip[0] + 150, grip[1] + 5, 700, { precise: true, bend: 0.05 });
await pause(150);
await page.mouse.up();
await pause(400);
await snap('e6-closer');

// all three arrows selected, Shift+click adding to the first, and coloured red
const curves = await state(() => [...olomol.doc.curves.values()].map((c) => c.id));
const points = [];
for (const id of curves) points.push((await curveAt(id)).middle);
await click(...points[0]);
await page.keyboard.down('Shift');
await d.showKey('Shift', 1900);
await click(...points[1]);
await click(...points[2]);
await page.keyboard.up('Shift');
await pause(350);
const red = await page.getByRole('button', { name: 'red', exact: true }).boundingBox();
await click(red.x + red.width / 2, red.y + red.height / 2);
await pause(500);
await click(900, 560); // (nothing selected)
await pause(1400);
await snap('e7-red');
if (mode === 'record') await d.save(`${out}/mechanism.mp4`, { hold: 2.5 });
await d.browser.close();
