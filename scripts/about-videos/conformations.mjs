// Conformations, what 0.4.0 is about, in one of three takes:
//   e2       bromocyclohexane drawn flat, its H on C1 and C2 drawn; the ring flip tool makes it a chair
//            (Br equatorial), a second click flips it (Br axial, an H on C2 axial beside it, anti); methoxide
//            under that H, three curved arrows (the E2), and Turn in 3D's stick model showing them anti
//   flip     trans-1,2-dibromocyclohexane drawn flat with its wedges: a chair (both Br equatorial), then
//            Shift+click: the other chair beside it, with ⇌ (both axial, anti); its stick model
//   glucose  β-D-glucose's Haworth projection from Templates: a chair, all its groups equatorial, then
//            Shift+click: the all-axial chair beside it, with ⇌
//   node conformations.mjs <e2|flip|glucose> <out dir> [record]      (without record: stills to look at)
import { APP, open } from './lib.mjs';
const [take, out, mode] = process.argv.slice(2);
if (!['e2', 'flip', 'glucose'].includes(take)) throw new Error('take: e2, flip or glucose');
const d = await open(APP);
const { page, pause, move, click, key, type, atoms, bonds, atomAt, pairsOf, state, between, showKey } = d;
const center = async (id) => { const b = await page.getByTestId(id).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const snap = async (name) => mode !== 'record' && page.screenshot({ path: `${out}/${take}-${name}.png` });
const SCALE = 58;
await state((s) => olomol.setView({ scale: s, tx: 640, ty: 330 }), SCALE);
await page.addStyleTag({ content: '.empty-hint { display: none !important; }' });
await page.mouse.move(640, 560);
await pause(800);
if (mode === 'record') await d.record();
await pause(700);
const newAtoms = async (before) => (await atoms()).filter((a) => !before.some((b) => b.id === a.id));
const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
const shifted = async (fn) => {
  await page.keyboard.down('Shift');
  await showKey('Shift', 900);
  await fn();
  await page.keyboard.up('Shift');
};

// a molecule from a SMILES or a name: /, the text, Enter, a click where it goes
async function fromName(text, x, y) {
  await key('/', '/');
  await pause(between(200, 350));
  await type(text);
  await pause(between(300, 450));
  await key('Enter', 'Enter');
  await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 });
  const before = await atoms();
  await click(x, y);
  await pause(between(250, 400));
  await key('Escape', 'Esc');
  return newAtoms(before);
}
// the six-membered ring of these atoms, its middle on the screen
const ringOf = (ids) => state((ids) => olomol.scene.rings.find((r) => r.length === 6 && r.every((id) => ids.includes(id))), ids);
const middleOf = (ring) => state((ring) => {
  const [x, y] = [ring.reduce((s, id) => s + olomol.doc.atoms.get(id).x, 0) / 6, ring.reduce((s, id) => s + olomol.doc.atoms.get(id).y, 0) / 6];
  return [x * olomol.view.scale + olomol.view.tx, y * olomol.view.scale + olomol.view.ty];
}, ring);
// the ring flip tool on the ring: pointed at (lit, the chair it becomes see-through), then a click
async function ringFlip(ring, { shift = false, first = true } = {}) {
  if (first) await click(...(await center('ring-flip')));
  const at = await middleOf(ring);
  await move(...at, undefined, { precise: true });
  await pause(1400);
  const before = await state(() => window.olomolTest.molfile());
  if (shift) await shifted(() => click(...at));
  else await click(...at);
  await page.waitForFunction((was) => window.olomolTest.molfile() !== was && !olomol.animation, before, { timeout: 15_000 });
  await pause(500);
  // (the pointer off the ring: its see-through preview goes)
  await move(at[0] + 40, 600);
  await pause(900);
}
// Turn in 3D on the molecule of this atom: selected by a double click, the stick model, turned a little
async function sticks(atomId) {
  await click(...(await center('tool-select')));
  const [x, y] = await atomAt(atomId);
  await move(x, y, undefined, { precise: true });
  await page.mouse.dblclick(x, y);
  await pause(600);
  await click(...(await center('turn3d')));
  await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
  await pause(1500);
  await click(...(await center('turn3d-sticks')));
  await pause(1800);
  const stage = await page.getByTestId('turn3d-stage').boundingBox();
  const [cx, cy] = [stage.x + stage.width / 2, stage.y + stage.height / 2];
  await move(cx - 60, cy + 40);
  await page.mouse.down();
  await move(cx + 80, cy + 10, 1800);
  await page.mouse.up();
  await pause(2200);
}

if (take === 'e2') {
  const made = await fromName('BrC1CCCCC1', 560, 330);
  const br = made.find((a) => a.el === 'Br').id;
  const list = await bonds();
  const nextTo = (id) => list.filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
  const c1 = nextTo(br)[0];
  const ring = await ringOf(made.map((a) => a.id));
  const c2 = nextTo(c1).find((id) => id !== br && ring.includes(id));
  await snap('1-flat');
  // the H on C1 and C2, drawn
  await click(...(await center('tool-select')));
  await click(...(await atomAt(c1)));
  await shifted(async () => click(...(await atomAt(c2))));
  await pause(500);
  await click(...(await center('draw-h')));
  await pause(800);
  await click(900, 600);
  await snap('2-hydrogens');
  // a chair, then the other chair: Br axial
  await ringFlip(ring);
  await snap('3-chair');
  await ringFlip(ring, { first: false });
  await snap('4-flipped');
  // the H on C2 that is axial now, anti to the Br
  const anti = await page.evaluate(async ([ring, c2]) => {
    const { readChair } = await import('/src/chem/ringFlip.js');
    const chair = readChair(olomol.doc, ring);
    return chair.groups.find((g) => g.ring === c2 && g.slot === 'axial' && olomol.doc.atoms.get(g.first).el === 'H')?.first ?? null;
  }, [ring, c2]);
  if (anti === null) throw new Error('no axial H on C2 after the flip');
  // methoxide beyond that H, along its bond
  const [pc2, ph] = await Promise.all([atomAt(c2), atomAt(anti)]);
  const away = [ph[0] - pc2[0], ph[1] - pc2[1]];
  const length = Math.hypot(...away);
  const base = await fromName('C[O-]', ph[0] + (away[0] / length) * 95 - 30, ph[1] + (away[1] / length) * 95);
  const o = base.find((a) => a.el === 'O').id;
  await click(...(await center('tool-pairs')));
  await click(...(await atomAt(o)));
  await pause(400);
  // the arrows: O's lone pair to H, the C2–H bond to C1–C2, the C1–Br bond to Br
  await click(...(await center('tool-curve')));
  const [pO, pH, pC2, pC1, pBr] = await Promise.all([o, anti, c2, c1, br].map(atomAt));
  const pair = (await pairsOf(o)).sort((p, q) => Math.hypot(p[0] - pH[0], p[1] - pH[1]) - Math.hypot(q[0] - pH[0], q[1] - pH[1]))[0];
  await d.drag(...pair, ...pH);
  await d.drag(...mid(pC2, pH), ...mid(pC2, pC1));
  await d.drag(...mid(pC1, pBr), pBr[0] + 6, pBr[1] - 8);
  await pause(1200);
  await snap('5-arrows');
  await click(900, 620);
  await sticks(c1);
  await snap('6-sticks');
} else if (take === 'flip') {
  const made = await fromName('Br[C@@H]1CCCC[C@H]1Br', 520, 330);
  const ring = await ringOf(made.map((a) => a.id));
  await snap('1-flat');
  await ringFlip(ring);
  await snap('2-chair');
  // the other chair beside it, with ⇌: both Br axial, anti
  const before = await atoms();
  await ringFlip(ring, { first: false, shift: true });
  await snap('3-both');
  const other = await newAtoms(before);
  await click(1000, 620);
  await sticks(other.find((a) => a.el === 'C').id);
  await snap('4-sticks');
} else {
  await click(...(await center('templates')));
  await pause(700);
  await click(...(await (async () => { const b = await page.getByRole('button', { name: 'Conformations and projections', exact: true }).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; })()));
  await pause(700);
  const card = await page.locator('[data-testid=template]', { hasText: 'β-D-Glucose, Haworth' }).first().boundingBox();
  await click(card.x + card.width / 2, card.y + card.height / 2);
  await pause(500);
  const before = await atoms();
  await move(380, 320);
  await pause(500);
  await click(380, 320);
  await pause(400);
  await key('Escape', 'Esc');
  const made = await newAtoms(before);
  const ring = await ringOf(made.map((a) => a.id));
  await snap('1-haworth');
  await ringFlip(ring);
  await snap('2-chair');
  await ringFlip(ring, { first: false, shift: true });
  await snap('3-both');
  await move(640, 620);
  await pause(2000);
}
if (mode === 'record') await d.save(`${out}/conformations-${take}.mp4`, { hold: 2.5 });
await d.browser.close();
