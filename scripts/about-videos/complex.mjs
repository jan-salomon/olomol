// Turn in 3D for what it is most for: a complex. Co³⁺ with its ligands lying loose round it
// (ethylenediamine, two NH3, two Cl⁻), each donor joined to the metal with the dative bond tool,
// then the complex turned in 3D as textbooks draw an octahedron (the Cl top and bottom, the N square
// with an edge at the front), and drawn so.   node complex.mjs <out dir> [record]
import { APP, open, turnDrags } from './lib.mjs';
const [out, mode] = process.argv.slice(2);
const d = await open(APP);
const { page, pause, move, click, drag, state, atomAt, between } = d;
const center = async (id) => { const b = await page.getByTestId(id).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const snap = async (name) => mode !== 'record' && page.screenshot({ path: `${out}/${name}.png` });

// the metal and the loose ligands, in bond lengths (molfile y up)
const ATOMS = [['Co', 0, 0, 3], ['N', -1.7, 0.8], ['C', -2.65, 0.5], ['C', -2.65, -0.5], ['N', -1.7, -0.8],
  ['N', 1.8, 1.0], ['N', 1.8, -1.0], ['Cl', 0, 1.9, -1], ['Cl', 0, -1.9, -1]];
const BONDS = [[2, 3], [3, 4], [4, 5]];
const molfile = ['', '  olomol demo', '', `${String(ATOMS.length).padStart(3)}${String(BONDS.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
  ...ATOMS.map(([el, x, y]) => `${(x * 1.5).toFixed(4).padStart(10)}${(y * 1.5).toFixed(4).padStart(10)}${'0.0000'.padStart(10)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
  ...BONDS.map(([a, b]) => `${String(a).padStart(3)}${String(b).padStart(3)}  1  0`),
  `M  CHG${String(3).padStart(3)}${[[1, 3], [8, -1], [9, -1]].map(([k, c]) => `${String(k).padStart(4)}${String(c).padStart(4)}`).join('')}`, 'M  END'].join('\n');
await page.addStyleTag({ content: '.empty-hint { display: none !important; }' });
await state((t) => window.olomolTest.paste(t), molfile);
await state(() => {
  olomol.clearSelection();
  olomol.setTool({ name: 'select' });
  const [left, top, bottom] = [110, 90, 150];
  const [width, height] = [innerWidth - left - 40, innerHeight - top - bottom];
  olomol.fit(width, height);
  const { scale, tx, ty } = olomol.view;
  const k = Math.min(1, 70 / scale);
  olomol.setView({ scale: scale * k, tx: left + width / 2 - (width / 2 - tx) * k, ty: top + height / 2 - (height / 2 - ty) * k });
});
await page.mouse.move(900, 600);
await pause(800);
await snap('x0');
const ids = await state(() => [...olomol.doc.atoms.values()].map((a) => ({ id: a.id, el: a.el, charge: a.charge })));
console.log(ids);
if (mode === 'record') await d.record();
await pause(900);

// the dative bond: the bond tool's variants, Dative
await click(...(await center('tool-bond')));
await pause(between(150, 250));
await click(...(await center('tool-bond')));
await page.locator('.flyout').waitFor();
const dative = await page.locator('.flyout').getByRole('button', { name: /^Dative/ }).boundingBox();
await click(dative.x + dative.width / 2, dative.y + dative.height / 2);
// each donor to the metal: Cl above, the NH3s, Cl below, the en's two N
const metal = ids.find((a) => a.el === 'Co').id;
const [n1, , , n2, a1, a2, cl1, cl2] = ids.filter((a) => a.el !== 'Co').map((a) => a.id);
for (const donor of [cl1, a1, a2, cl2, n2, n1]) {
  const [p, m] = [await atomAt(donor), await atomAt(metal)];
  await drag(...p, m[0] + between(-3, 3), m[1] + between(-3, 3));
}
await snap('x1-joined');

// selected (the select tool, a double click on the en), turned in 3D
await click(...(await center('tool-select')));
const [pn, pc] = [await atomAt(n1), await atomAt(ids[2].id)];
const grip = [(pn[0] + pc[0]) / 2, (pn[1] + pc[1]) / 2];
await move(...grip);
await pause(between(150, 250));
await page.mouse.dblclick(...grip);
await pause(between(400, 600));
await click(...(await center('turn3d')));
await page.getByTestId('turn3d-stage').waitFor({ timeout: 90_000 });
await pause(1000);
const stageBox = await page.getByTestId('turn3d-stage').boundingBox();
const shotStage = (name) => mode !== 'record' && page.screenshot({ path: `${out}/${name}.png`, clip: stageBox });
await shotStage('x2-start');
const [cx, cy] = [stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2];
// The view as textbooks draw an octahedron, worked out from the model: the Cl–Co–Cl axis straight up
// (its arrows vertical), the N square seen from a little above (TILT) with an edge at the front, an en N
// and an NH3 N, en on the left, turned by SKEW about the axis: at 30° Co's 3+ is clear of every bond (2026-11-07, the metal's bonds 1.8 long and drawn long at a slant; at 8–22°
// it lay on one, at 38° the front NH3 on the lower Cl; before, at −25…18°).
// Its axial bonds TILT out of the page (under 27°: they stay arrows), the front edge wedges, the back hashed.
const turn = async (dx, dy, { shift = false, ms = 950 } = {}) => {
  if (shift) { await page.keyboard.down('Shift'); await d.showKey('Shift', ms + 300); }
  await pause(between(80, 140));
  await page.mouse.down();
  await move(d.at()[0] + dx, d.at()[1] + dy, ms, { exact: true });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await pause(between(220, 340));
};
const [TILT, SKEW] = [Number(process.env.TILT ?? 25), Number(process.env.SKEW ?? 30)];
const view = await page.evaluate(({ metal, cls, ens, nh3s, tilt, skew }) => {
  const el = document.querySelector('[data-testid=turn3d-stage]');
  const k = Object.keys(el).find((x) => x.startsWith('__reactFiber'));
  let live;
  for (let f = el[k]; f && !live; f = f.return)
    for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) { const v = h.memoizedState; if (v?.current?.base && v.current?.molecule) { live = v.current; break; } }
  const at = (id) => live.base[live.molecule.atomIds.indexOf(id)];
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const times = (a, k) => a.map((v) => v * k);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const unit = (v) => times(v, 1 / Math.hypot(...v));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const co = at(metal);
  const [top] = cls.map(at).sort((p, q) => q[1] - p[1]); // (the Cl that was up stays up)
  const y = unit(sub(top, co));
  const flat = (id) => { const v = sub(at(id), co); return unit(sub(v, times(y, dot(v, y)))); };
  const rad = Math.PI / 180;
  for (const en of ens) for (const nh3 of nh3s) {
    const [e, a] = [flat(en), flat(nh3)];
    if (Math.abs(dot(e, a)) > 0.5) continue; // (trans: no edge)
    const m = unit(add(e, a));
    const side = cross(y, m);
    const along = add(times(m, Math.cos(skew * rad)), times(side, Math.sin(skew * rad)));
    const z = unit(add(times(along, Math.cos(tilt * rad)), times(y, Math.sin(tilt * rad))));
    const x = unit(cross(y, z));
    const up = cross(z, x);
    if (dot(x, e) < 0 && dot(x, a) > 0) return [x, up, z]; // en on the left
  }
  return null;
}, { metal, cls: [cl1, cl2], ens: [n1, n2], nh3s: [a1, a2], tilt: TILT, skew: SKEW });
console.log('view', JSON.stringify(view));
const { drag: [dx, dy], shift } = turnDrags(view);
await move(cx - dx / 2, cy - dy / 2);
await turn(dx, dy, { ms: 1500 });
await shotStage('x4-over');
if (Math.abs(shift) > 3) {
  await move(cx - shift / 2, cy + 150);
  await turn(shift, 0, { shift: true, ms: 900 });
}
// where the drags really left it (pointer moves come differently while recording, each a turn of its own):
// what is still missing, as a short drag more, until within half a degree
const rotation = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid=turn3d-stage]');
  const k = Object.keys(el).find((x) => x.startsWith('__reactFiber'));
  for (let f = el[k]; f; f = f.return)
    for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) { const v = h.memoizedState; if (v?.current?.base && v.current?.molecule) return v.current.rotation; }
  return null;
});
for (let k = 0; k < 3; k++) {
  const now = await rotation();
  const missing = view.map((row) => [0, 1, 2].map((j) => row.reduce((sum, v, i) => sum + v * now[j][i], 0))); // view · nowᵀ
  const off = Math.acos(Math.max(-1, Math.min(1, (missing[0][0] + missing[1][1] + missing[2][2] - 1) / 2))) * 180 / Math.PI;
  console.log(`off by ${off.toFixed(2)}°`);
  if (off < 0.5) break;
  const more = turnDrags(missing);
  await move(cx - more.drag[0] / 2, cy - more.drag[1] / 2 + 60, 500, { precise: true });
  await turn(...more.drag, { ms: 600 });
  if (Math.abs(more.shift) > 2) {
    await move(cx - more.shift / 2, cy + 150, 500, { precise: true });
    await turn(more.shift, 0, { shift: true, ms: 500 });
  }
}
await shotStage('x5-view');
await pause(1100);
await click(...(await center('turn3d-use')));
await pause(700);
await click(1000, 590); // (nothing selected)
await pause(1600);
await snap('x6-done');
if (mode === 'record') await d.save(`${out}/turn3d.mp4`, { hold: 2.5 });
await d.browser.close();
