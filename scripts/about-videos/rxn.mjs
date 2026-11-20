// An enzyme's reaction, from the citric acid cycle: malate dehydrogenase, L-malate to oxaloacetate.
// The arrow drawn, NAD⁺ in and NADH + H⁺ out on its side arcs (they take a stack at their free end),
// the enzyme snapped under the arrow, the names under the molecules (they snap to their anchors).
//   node rxn.mjs <out dir> [record]
import { APP, open } from './lib.mjs';
import { sideBySide } from './scheme.mjs';
const [out, mode] = process.argv.slice(2);
const d = await open(APP);
const { page, pause, move, click, drag, key, type, state, between } = d;
const center = async (id) => { const b = await page.getByTestId(id).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const snap = async (name) => mode !== 'record' && page.screenshot({ path: `${out}/${name}.png` });
const SCALE = 54;
await page.addStyleTag({ content: '.empty-hint { display: none !important; }' });
await state((s) => olomol.setView({ scale: s, tx: 640, ty: 330 }), SCALE);
await state((t) => window.olomolTest.paste(t), sideBySide([['[O-]C(=O)C[C@H](O)C([O-])=O', -7.3], ['[O-]C(=O)CC(=O)C([O-])=O', 7.3]]));
await state(() => olomol.clearSelection());
await state(() => olomol.setTool({ name: 'select' }));
await page.mouse.move(640, 620);
await pause(600);
await snap('r0');
if (mode === 'record') await d.record();
await pause(700);
// a drag that can be photographed half way: the box it snaps to, seen
const dragSeen = async (x, y, x2, y2, name) => {
  await move(x, y);
  await pause(between(120, 200));
  await page.mouse.down();
  await pause(90);
  await move(x2, y2, undefined, { precise: true, bend: 0.06 });
  await pause(between(250, 400));
  await snap(name);
  await page.mouse.up();
  await pause(between(220, 320));
};
const textBox = (id) => page.evaluate((id) => {
  const r = document.querySelector(`svg g[data-id="${id}"]`).getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
}, id);
const lastText = () => state(() => [...olomol.doc.texts.values()].at(-1).id);
const screen = (p) => state((p) => { const { scale, tx, ty } = olomol.view; return [p[0] * scale + tx, p[1] * scale + ty]; }, p);
// a text written at a free place (Formula: with its charge raised), then the select tool for its drag
const write = async (text, x, y, { formula = false } = {}) => {
  await click(...(await center('tool-text')));
  await click(x, y);
  await pause(250);
  await type(text);
  await pause(200);
  if (formula) {
    const b = await page.getByRole('button', { name: /Formula/ }).first().boundingBox();
    await click(b.x + b.width / 2, b.y + b.height / 2);
    await pause(250);
  }
  await key('Escape', 'Esc');
  await click(...(await center('tool-select')));
  return lastText();
};

// 1. the reaction arrow
const spots = await state(() => { const { scale, tx, ty } = olomol.view; return [...olomol.doc.atoms.values()].map((a) => [a.x * scale + tx, a.y * scale + ty]); });
const half = (list) => ({ x: (Math.min(...list.map((p) => p[0])) + Math.max(...list.map((p) => p[0]))) / 2, bottom: Math.max(...list.map((p) => p[1])) });
const [left, right] = [half(spots.filter((p) => p[0] < 640)), half(spots.filter((p) => p[0] > 640))];
const AY = Math.round((Math.min(...spots.map((p) => p[1])) + Math.max(...spots.map((p) => p[1]))) / 2);
const [AX, BX] = [490, 790];
const MID = (AX + BX) / 2;
await click(...(await center('tool-rxn')));
await drag(AX, AY, BX, AY);
const arrow = await state(() => [...olomol.doc.arrows.keys()][0]);
await snap('r1-arrow');
// 2. its side arcs with the same tool: from the canvas in to its middle, from its middle out
await drag(MID - 108, AY - 100, MID + 2, AY);
await drag(MID, AY, MID + 108, AY - 100);
await snap('r2-arcs');
const arcEnd = async (way) => screen(await state(([id, way]) => olomol.scene.arrowArcs.get(`${id}|above-${way}`).free, [arrow, way]));
// 3. what goes in and what comes out, onto the arcs' free ends
const nad = await write('NAD+', 470, 130, { formula: true });
const [ix, iy] = await arcEnd('in');
await dragSeen(...(await textBox(nad)), ix - 4, iy - 22, 'r3-in');
const nadh = await write('NADH + H+', 760, 130, { formula: true });
const [ox, oy] = await arcEnd('out');
await dragSeen(...(await textBox(nadh)), ox + 8, oy - 22, 'r4-out');
// 4. the enzyme under the arrow
const enzyme = await write('malate dehydrogenase', 540, 540);
await dragSeen(...(await textBox(enzyme)), MID, AY + 30, 'r5-enzyme');
// 5. the names under the molecules
const t1 = await write('L-malate', left.x - 40, 560);
await dragSeen(...(await textBox(t1)), left.x, left.bottom + 48, 'r6-name');
const t2 = await write('oxaloacetate', right.x - 60, 560);
await dragSeen(...(await textBox(t2)), right.x, right.bottom + 48, 'r7-name2');
await click(640, 610); // (nothing selected)
await move(760, 625);
await pause(1200);
await snap('r8-done');
if (mode === 'record') await d.save(`${out}/scheme.mp4`, { hold: 2.5 });
await d.browser.close();
