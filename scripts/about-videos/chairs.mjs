// Chairs and Turn in 3D, no story: β-D-glucose's Haworth from Templates, its anomeric OH highlighted blue and its
// ring O purple (not orange: the stick model draws CH2OH out in orange), made a chair with the ring flip tool;
// Turn in 3D's stick model turned exactly edge-on (every OH out to the side) and spun about the ring's axis; then
// the chair flipped and turned in 3D the same way (the OHs up and down): the 3D model is the chair drawn.
//   node chairs.mjs <out dir> [record]       chairs.mp4
// The edge-on turn is worked out from Turn in 3D's own model, read from the window's React state (there is no
// hook for it, and with CH2OH drawn out its model isn't the one relayout gives), so it breaks if Turn3D's
// live ref changes shape.
import { APP, open, turnDrags } from './lib.mjs';
const [out, mode] = process.argv.slice(2);
const d = await open(APP);
const { page, pause, move, click, key, state, atomAt, between } = d;
const snap = async (name) => mode !== 'record' && page.screenshot({ path: `${out}/${name}.png` });
const boxCenter = async (loc) => { const b = await loc.first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const press = async (id) => click(...(await boxCenter(page.getByTestId(id))));
const ids = () => state(() => [...olomol.doc.atoms.keys()]);
const mid = async (a, b) => { const [p, q] = [await atomAt(a), await atomAt(b)]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
// a variant from a rail group's flyout, by its title
const variant = async (group, title) => {
  await press(`tool-${group}`);
  if (!(await page.locator('.flyout').count())) await press(`tool-${group}`);
  await page.locator('.flyout').waitFor();
  await click(...(await boxCenter(page.locator(`.flyout button[title^="${title}"]`))));
};
const REST = [1170, 590];
await state(() => olomol.setView({ scale: 46, tx: 640, ty: 330 }));
await page.addStyleTag({ content: '.empty-hint { display: none !important; }' });
await move(...REST);
await pause(800);
if (mode === 'record') await d.record();
await pause(600);

// β-D-glucose from Templates
await press('templates');
await click(...(await boxCenter(page.getByRole('button', { name: 'Conformations and projections', exact: true }))));
await pause(400);
await click(...(await boxCenter(page.locator('[data-testid=template]', { hasText: 'β-D-Glucose, Haworth' }))));
await pause(300);
const had = await ids();
await click(380, 400);
await pause(300);
await key('Escape', 'Esc');
await key('Escape', 'Esc');
const [o5, c1, , c3, , , o1] = (await ids()).filter((id) => !had.includes(id)); // (the template's order: O5, C1…C5, O1…)
const ring = (await ids()).filter((id) => !had.includes(id)).slice(0, 6);
await pause(500);
await snap('c1-haworth');

// the anomeric OH blue, the ring O purple
await variant('highlight', 'Blue highlight');
await click(...(await atomAt(o1)));
await click(...(await mid(c1, o1)));
await variant('highlight', 'Purple highlight');
await click(...(await atomAt(o5)));
await key('Escape', 'Esc');
await key('Escape', 'Esc');
await pause(400);

// the ring flip tool on a ring: pointed at (its preview), clicked
const ringMiddle = async () => { const ps = await Promise.all(ring.map(atomAt)); return [ps.reduce((s, p) => s + p[0], 0) / 6, ps.reduce((s, p) => s + p[1], 0) / 6]; };
const flipRing = async (look) => {
  if ((await state(() => olomol.tool.name)) !== 'ringFlip') await press('ring-flip');
  const at = await ringMiddle();
  await move(...at);
  await pause(look);
  const was = await state(() => window.olomolTest.molfile());
  await click(...at);
  await page.waitForFunction((was) => window.olomolTest.molfile() !== was, was, { timeout: 8000 });
  await pause(1300); // (the flip's animation)
  await key('Escape', 'Esc');
  await key('Escape', 'Esc');
  await move(...REST);
};
await flipRing(1300);
await pause(900);
await snap('c2-chair');

// Turn in 3D: the stick model turned edge-on (the ring's mean plane horizontal), then spun about the ring's axis
const turn = async (dx, dy, { shift = false, ms = 1300 } = {}) => {
  if (shift) { await page.keyboard.down('Shift'); await d.showKey('Shift', ms + 300); }
  await pause(between(80, 140));
  await page.mouse.down();
  await move(d.at()[0] + dx, d.at()[1] + dy, ms, { exact: true });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await pause(between(220, 340));
};
const edgeOn = () => page.evaluate((ring) => {
  const el = document.querySelector('[data-testid=turn3d-stage]');
  const k = Object.keys(el).find((x) => x.startsWith('__reactFiber'));
  let live;
  for (let f = el[k]; f && !live; f = f.return)
    for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) { const v = h.memoizedState; if (v?.current?.base && v.current?.molecule) { live = v.current; break; } }
  const P = ring.map((id) => live.base[live.molecule.atomIds.indexOf(id)]);
  const c = [0, 1, 2].map((i) => P.reduce((s, p) => s + p[i], 0) / P.length);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let n = [0, 0, 0];
  for (let i = 0; i < 6; i++) n = n.map((v, j) => v + cross(sub(P[i], c), sub(P[(i + 1) % 6], c))[j]);
  n = unit(n);
  if (n[1] < 0) n = n.map((v) => -v); // (the face that was up stays up)
  const x = unit(sub([1, 0, 0], n.map((v) => v * n[0])));
  return [x, n, cross(x, n)];
}, ring);
const in3D = async (name) => {
  await move(...(await atomAt(c3)));
  await pause(200);
  await page.mouse.dblclick(...(await atomAt(c3)));
  await pause(400);
  await press('turn3d');
  await page.getByTestId('turn3d-stage').waitFor({ timeout: 90_000 });
  await pause(1100);
  if ((await page.getByTestId('turn3d-sticks').getAttribute('aria-pressed')) !== 'true') { await press('turn3d-sticks'); await pause(1100); }
  const stage = await page.getByTestId('turn3d-stage').boundingBox();
  const [cx, cy] = [stage.x + stage.width / 2, stage.y + stage.height / 2];
  const corner = [stage.x + stage.width - 40, stage.y + stage.height - 30];
  const { drag: [dx, dy], shift } = turnDrags(await edgeOn());
  await move(cx - dx / 2, cy - dy / 2);
  await turn(dx, dy);
  if (Math.abs(shift) > 3) { await move(cx - shift / 2, cy + 150); await turn(shift, 0, { shift: true, ms: 900 }); }
  await move(...corner);
  await pause(1500);
  await snap(`${name}-edge`);
  await move(cx - 130, cy + 40);
  await turn(260, 0, { ms: 2300 });
  await move(...corner);
  await pause(1400);
  await snap(`${name}-spun`);
  await key('Escape', 'Esc');
  await pause(300);
  await key('Escape', 'Esc');
  await key('Escape', 'Esc');
  await move(...REST);
  await pause(600);
};
await in3D('c3-equatorial');

// flipped: every group axial; and in 3D the same way
await flipRing(600);
await pause(1000);
await snap('c4-flipped');
await in3D('c5-axial');
await pause(900);
await snap('c6-end');
if (mode === 'record') await d.save(`${out}/chairs.mp4`, { hold: 1.5 });
await d.browser.close();
