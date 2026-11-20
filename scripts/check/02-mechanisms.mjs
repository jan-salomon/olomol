// The browser check: Mechanisms: curved arrows from electrons, orbitals.
// Run alone: npm run check -- --only mechanisms [url]

import {
  atomsByEl, atomXY, bondMiddle, canonical, check, clear, clickAt, counts, curveNames, dragBetween,
  drawnSmiles, hoverAndPress, inFirefox, notice, page, paste, screen, state, tool,
} from './harness.mjs';
// (its parts, in the order run:)
//   electron pushing
//   a curved arrow saved in its second way opens in it from its curve alone, and keeps it after a change
//   orbitals: a Diels–Alder's p orbitals put on with the orbital tool, a lobe turned and clicked, a dashed
export default async function run() {
  // --- electron pushing ---
  await clear();
  await paste('[OH-].CC(=O)Cl');
  check((await drawnSmiles()) === canonical('[OH-].CC(=O)Cl'), 'pasted SMILES: hydroxide and acetyl chloride');
  // Ctrl+V as with templates: a see-through copy follows the pointer, a click
  // puts it down (selected, the tool as before); Esc leaves it out
  if (!inFirefox) {
    const before = await counts();
    await tool('bond').click();
    await page.mouse.move(500, 500);
    await state(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'CCO');
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    });
    await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 });
    await page.mouse.move(520, 480);
    const ghost = { copies: await page.locator('.ghost-copy').count(), atoms: (await counts()).atoms };
    await page.keyboard.press('Escape');
    const left = { atoms: (await counts()).atoms, tool: await state(() => olomol.tool.name) };
    check(ghost.copies === 1 && ghost.atoms === before.atoms && left.atoms === before.atoms && left.tool === 'bond',
      `Ctrl+V: a see-through copy under the pointer, Esc leaves it out (${JSON.stringify({ ghost, left })})`);
    await state(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'CCO');
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    });
    await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 });
    await page.mouse.click(520, 480);
    const placed = await state(() => {
      const atoms = [...olomol.doc.atoms.values()];
      const [x, y] = [(520 - olomol.view.tx) / olomol.view.scale, (480 - olomol.view.ty) / olomol.view.scale];
      const mine = atoms.filter((a) => olomol.selection.has(a.id));
      const xs = mine.map((a) => a.x);
      const ys = mine.map((a) => a.y);
      return { added: atoms.length, selected: mine.length, tool: olomol.tool.name, off: Math.hypot((Math.min(...xs) + Math.max(...xs)) / 2 - x, (Math.min(...ys) + Math.max(...ys)) / 2 - y) };
    });
    check(placed.added === before.atoms + 3 && placed.selected === 3 && placed.tool === 'bond' && placed.off < 0.01,
      `Ctrl+V, then a click: ethanol put down there, selected, the bond tool again (${JSON.stringify(placed)})`);
    await page.keyboard.press('Control+z');
    await tool('select').click();
  }
  await state(() => olomol.clearSelection());
  await tool('pairs').click();
  for (const id of await atomsByEl('O')) await clickAt(await atomXY(id));
  const pairCount = await state(() => [...olomol.scene.atoms.values()].reduce((sum, info) => sum + info.electrons.pairs.length, 0));
  check(pairCount === 5, `lone pair tool: hydroxide 3 + carbonyl O 2 = ${pairCount} pairs shown`);
  await tool('curve').click();
  const [hydroxide, carbonylO] = await state(() => {
    const o = [...olomol.doc.atoms.values()].filter((a) => a.el === 'O');
    return [o.find((a) => a.charge === -1).id, o.find((a) => !a.charge).id];
  });
  const carbonylC = await state((id) => {
    const b = [...olomol.doc.bonds.values()].find((x) => x.a === id || x.b === id);
    return b.a === id ? b.b : b.a;
  }, carbonylO);
  const methyl = await state((id) => [...olomol.doc.atoms.values()].find((a) => a.el === 'C' && a.id !== id).id, carbonylC);
  await clickAt(await atomXY(methyl));
  check((await notice()).includes('has no lone pair'), `curved arrow: refused from a C without lone pair ("${await notice()}")`);
  await dragBetween(await atomXY(hydroxide), await atomXY(carbonylC));
  const co = await state(([a, b]) => [...olomol.doc.bonds.values()].find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)).id, [carbonylC, carbonylO]);
  // the tool stays on: click-click for the second arrow
  await clickAt(await bondMiddle(co));
  check((await notice()).startsWith('From the C=O bond'), `curved arrow: the first click names the start ("${await notice()}")`);
  await clickAt(await atomXY(carbonylO));
  check((await curveNames()) === 'O-->C, bond->O', `curved arrows drawn by drag and by two clicks (${await curveNames()})`);
  const curveBefore = await state(() => [...olomol.scene.curves.values()].map((g) => g.d).join());
  await tool('select').click();
  await state(() => olomol.clearSelection());
  const oxy = await atomXY(hydroxide);
  await dragBetween(oxy, [oxy[0] - 0.5, oxy[1] + 1]);
  const curveAfter = await state(() => [...olomol.scene.curves.values()].map((g) => g.d).join());
  check(curveBefore !== curveAfter && (await curveNames()) === 'O-->C, bond->O', 'moving the hydroxide: its arrow follows');
  await page.keyboard.press('Control+z');
  await state((id) => olomol.select([id]), hydroxide);
  await page.keyboard.press('Delete');
  check((await curveNames()) === 'bond->O', 'deleting the hydroxide takes its arrow away');
  await page.keyboard.press('Control+z');
  check((await curveNames()) === 'O-->C, bond->O', 'Ctrl+Z brings both back');
  // dragging an arrow bends it to another way of drawing it
  const firstCurve = await state(() => [...olomol.scene.curves.values()].find((g) => g.curve.from.atom !== undefined));
  const middle = firstCurve.samples[10];
  await dragBetween(middle, [middle[0], middle[1] - 4]);
  check((await state((id) => olomol.doc.curves.get(id).variant, firstCurve.curve.id)) > 0, 'dragging a curved arrow bends it the other way');
  await page.keyboard.press('Control+z');
  // (the single electron: a variant of the lone pairs' button, chosen from its flyout)
  await tool('pairs').click({ button: 'right' });
  await page.locator('.flyout').getByRole('button', { name: /^Unpaired electron/ }).click();
  await clickAt(await atomXY(methyl));
  check((await state((id) => olomol.scene.atoms.get(id).electrons.unpaired.length, methyl)) === 1
    && (await state((id) => olomol.scene.atoms.get(id).chem.hydrogens, methyl)) === 2, 'radical tool: CH3 becomes CH2 with one unpaired electron');
  await page.keyboard.press('Control+z');
  await page.mouse.move(5, 890);
  await page.screenshot({ path: 'test-output/mechanism.png' });
  // keys over an atom, and tool keys
  await hoverAndPress(await atomXY(carbonylO), ':');
  check((await state((id) => olomol.doc.atoms.get(id).lonePairs, carbonylO)) === null, 'key ":" over an atom: lone pairs off');
  await hoverAndPress(await atomXY(carbonylO), ':');
  // ":" with the molecule selected, the pointer over nothing (as the lone pair button: the tooltip says so): all
  // its atoms' lone pairs shown, the tool on; again: hidden
  {
    const withPairs = await state(() => [...olomol.scene.atoms].filter(([, a]) => a.chem?.lonePairs > 0).map(([id]) => id));
    await state((ids) => olomol.change((doc) => { for (const id of ids) doc.atoms.get(id).lonePairs = null; }), withPairs);
    await state(() => olomol.selectAll());
    await page.mouse.move(5, 890);
    const pairsOf = () => state((ids) => ids.map((id) => olomol.doc.atoms.get(id).lonePairs), withPairs);
    await page.keyboard.press(':');
    const shown = await pairsOf();
    const toolOn = await state(() => olomol.tool.name);
    await page.keyboard.press(':');
    const hidden = await pairsOf();
    check(withPairs.length >= 2 && shown.every((p) => p === 'auto') && toolOn === 'pairs' && hidden.every((p) => p === null),
      `key ":" with a selection: all its lone pairs shown (${shown.join()}), the tool on (${toolOn}); again: hidden (${hidden.join()})`);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await state(() => { olomol.clearSelection(); olomol.setTool({ name: 'select' }); });
  }
  // + and 1 2 3 with a selection, the pointer over nothing: every selected atom's charge, every selected bond's
  // order, each in one step; over an atom outside the selection: that atom only
  {
    const charges = () => state(() => [...olomol.doc.atoms.values()].map((a) => a.charge ?? 0));
    const orders = () => state(() => [...olomol.doc.bonds.values()].filter((b) => !b.kind).map((b) => b.order));
    const [chargesBefore, ordersBefore] = [await charges(), await orders()];
    await state(() => olomol.selectAll());
    await page.mouse.move(5, 890);
    await page.keyboard.press('+');
    const charged = await charges();
    await page.keyboard.press('Control+z');
    await page.keyboard.press('2');
    const doubled = await orders();
    const toolAfter = await state(() => olomol.tool.name);
    await page.keyboard.press('Control+z');
    await state((id) => olomol.select([id]), carbonylO);
    await hoverAndPress(await atomXY(methyl), '+');
    const one = await state(([o, m]) => [olomol.doc.atoms.get(o).charge, olomol.doc.atoms.get(m).charge], [carbonylO, methyl]);
    await page.keyboard.press('Control+z');
    await state(() => { olomol.clearSelection(); olomol.setTool({ name: 'select' }); });
    const restored = JSON.stringify([await charges(), await orders()]) === JSON.stringify([chargesBefore, ordersBefore]);
    check(charged.every((c, k) => c === Math.min(4, chargesBefore[k] + 1)) && doubled.every((o) => o === 2) && toolAfter === 'select'
      && one[0] === 0 && one[1] === 1 && restored,
    `keys with a selection: + charges every atom (${charged.join()}), 2 makes every bond double (${doubled.join()}), the tool kept (${toolAfter}); over an atom outside it, that one (O ${one[0]}, CH3 ${one[1]}); undone (${restored})`);
  }
  await hoverAndPress(await atomXY(methyl), '.');
  check((await state((id) => olomol.doc.atoms.get(id).radical, methyl)) === 2, 'key "." over an atom: an unpaired electron');
  await page.keyboard.press('Control+z');
  // + over an atom, also as a Czech keyboard types it: the 1 key (Digit1), its character +
  await hoverAndPress(await atomXY(methyl), '+');
  const plus = await state((id) => olomol.doc.atoms.get(id).charge, methyl);
  await state(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', code: 'Digit1', bubbles: true })));
  await page.waitForTimeout(60);
  const czechPlus = await state((id) => olomol.doc.atoms.get(id).charge, methyl);
  check(plus === 1 && czechPlus === 2, `key "+" over an atom: its charge up, also on a Czech keyboard's 1 key (${plus}, ${czechPlus})`);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.mouse.move(5, 450);
  await page.keyboard.press('a');
  check((await state(() => olomol.tool.name)) === 'curve', 'key "a" over nothing: curved arrow tool');
  await page.keyboard.press('Digit2');
  check((await state(() => olomol.tool.order)) === 2, 'key "2" over nothing: double bond tool');
  const bondTools = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Digit1');
    bondTools.push(await state(() => `${olomol.tool.order}${olomol.tool.stereo}`));
  }
  check(bondTools.join() === '1,1wedge,1hash', `key "1" over nothing: single bond tool, again wedge, again hashed wedge (${bondTools})`);
  await page.keyboard.press('Shift+Slash');
  check(await page.locator('.dialog', { hasText: 'Keyboard shortcuts' }).isVisible(), 'key "?": the shortcut sheet');
  await page.keyboard.press('Escape');
  // homolysis with fishhooks
  await clear();
  await paste('ClCl');
  const clcl = await state(() => [...olomol.doc.bonds.keys()][0]);
  const [cl1, cl2] = await atomsByEl('Cl');
  // (the fishhook: a variant of the curved arrow's button)
  await tool('curve').click({ button: 'right' });
  await page.locator('.flyout').getByRole('button', { name: /^Fishhook arrow/ }).click();
  await dragBetween(await bondMiddle(clcl), await atomXY(cl1));
  await dragBetween(await bondMiddle(clcl), await atomXY(cl2));
  check((await state(() => [...olomol.doc.curves.values()].filter((cv) => cv.electrons === 1).length)) === 2, 'fishhooks: Cl–Cl homolysis');
  // two radicals combining: while a fishhook is drawn, faint lines to the atoms a new bond could go to, a dot in
  // each middle; dropped on the dot between Cl and C, the arrow ends there, and the one back meets it
  await clear();
  await paste('Cl.C');
  const [clRadical, methylRadical] = [(await atomsByEl('Cl'))[0], (await atomsByEl('C'))[0]];
  await state(() => olomol.setTool({ name: 'radical' }));
  for (const id of [clRadical, methylRadical]) await clickAt(await atomXY(id));
  await state(() => olomol.setTool({ name: 'curve', electrons: 1 }));
  const [clAt, cAt] = [await atomXY(clRadical), await atomXY(methylRadical)];
  const between = [(clAt[0] + cAt[0]) / 2, (clAt[1] + cAt[1]) / 2];
  // (from the Cl itself, not its dot: a fishhook from an atom with an unpaired electron starts at it)
  await page.mouse.move(...(await screen(clAt)));
  await page.mouse.down();
  const towards = [clAt[0] + (cAt[0] - clAt[0]) * 0.3, clAt[1] + (cAt[1] - clAt[1]) * 0.3 + 0.05];
  await page.mouse.move(...(await screen(towards)), { steps: 4 });
  const drawing = await page.evaluate(() => ({ lines: document.querySelectorAll('.new-bonds line').length, strong: document.querySelectorAll('.new-bonds .strong').length }));
  await page.mouse.move(...(await screen(between)), { steps: 4 });
  const onDot = await page.evaluate(() => document.querySelectorAll('.new-bonds .active').length);
  await page.mouse.up();
  await dragBetween(cAt, between);
  const meeting = await state(([a, b]) => {
    const [p, q] = [olomol.doc.atoms.get(a), olomol.doc.atoms.get(b)];
    const middle = [(p.x + q.x) / 2, (p.y + q.y) / 2];
    return { ends: [...olomol.doc.curves.values()].map((cv) => `${cv.from.radical ? 'radical' : '?'}→${cv.to.newBond !== undefined ? 'new bond' : 'atom'}`).join(),
      tips: [...olomol.scene.curves.values()].map((g) => +Math.hypot(g.head[0][0] - middle[0], g.head[0][1] - middle[1]).toFixed(2)) };
  }, [clRadical, methylRadical]);
  check(drawing.lines === 1 && drawing.strong === 1 && onDot === 1 && meeting.ends === 'radical→new bond,radical→new bond' && meeting.tips.every((d) => d < 0.25),
    `fishhooks: Cl• and •CH3 combining, dropped on the new bond's dot (lines ${drawing.lines}, ${drawing.strong} strong towards the pointer, the dot lit ${onDot}; ${meeting.ends}; heads ${meeting.tips} from the middle)`);
  // dropped on the atom instead: the arrow ends on the atom, as before
  await page.keyboard.press('Control+z');
  await dragBetween(cAt, clAt);
  check((await state(() => [...olomol.doc.curves.values()].at(-1).to.newBond)) === undefined, 'fishhooks: dropped on an atom, not on the dot: it ends on the atom');
  // a Lewis symbol: a lone N (NH3 as pasted) given three unpaired electrons in the panel: each on a side of its own,
  // the H gone, its lone pair on the fourth side (shown by itself); a fishhook from it starts at one of them
  {
    await clear();
    await paste('N.[Cl]');
    const [n] = await atomsByEl('N');
    const [cl] = await atomsByEl('Cl');
    await state((id) => olomol.select([id]), n);
    await page.getByTitle('three unpaired electrons, each on its own side (·N̈· in a Lewis symbol)').click();
    const lewis = await state((id) => {
      const info = olomol.scene.atoms.get(id);
      return { label: info.label?.runs.map((r) => r.text).join(''), dots: info.electrons.unpaired.map((u) => u.count).join(''), pairs: info.electrons.pairs.length };
    }, n);
    const smiles = await drawnSmiles();
    await state(() => olomol.clearSelection());
    await tool('curve').click({ button: 'right' });
    await page.locator('.flyout').getByRole('button', { name: /^Fishhook arrow/ }).click();
    await dragBetween(await atomXY(n), await atomXY(cl));
    const from = await state(() => [...olomol.doc.curves.values()].at(-1)?.from);
    check(lewis.label === 'N' && lewis.dots === '111' && lewis.pairs === 1 && smiles === canonical('[N].[Cl]') && from?.radical === true,
      `a Lewis symbol from the panel: NH3 becomes ${lewis.label} with three unpaired electrons apart (${lewis.dots}) and its lone pair (${lewis.pairs}), ${smiles}; a fishhook from it starts at one (${JSON.stringify(from)})`);
  }
  // a two-electron arrow: the new bonds only with Shift (in most mechanisms it ends on an atom or a bond, and the
  // lines would crowd them); without, a badge at the pointer says so
  {
    await clear();
    await paste('[Cl-].C');
    const [cl, c] = [(await atomsByEl('Cl'))[0], (await atomsByEl('C'))[0]];
    await state(() => olomol.setTool({ name: 'curve', electrons: 2 }));
    const [p, q] = [await atomXY(cl), await atomXY(c)];
    const middle = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const lines = () => page.evaluate(() => document.querySelectorAll('.new-bonds line').length);
    const badge = () => page.getByTestId('new-bond-hint').count();
    await page.mouse.move(...(await screen(p)));
    await page.mouse.down();
    await page.mouse.move(...(await screen(middle)), { steps: 6 });
    const plain = [await lines(), await badge()];
    await page.keyboard.down('Shift');
    await page.waitForTimeout(100);
    const held = [await lines(), await badge(), await page.evaluate(() => document.querySelectorAll('.new-bonds .active').length)];
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const ended = await state(() => [...olomol.doc.curves.values()].map((cv) => (cv.to.newBond !== undefined ? 'new bond' : 'atom')).join());
    check(plain[0] === 0 && plain[1] === 1 && held[0] > 0 && held[1] === 0 && held[2] === 1 && ended === 'new bond',
      `a two-electron arrow: no new bonds offered without Shift (lines ${plain[0]}, the badge ${plain[1]}), with Shift pressed during the drag the lines (${held[0]}) and the dot (${held[2]}); dropped there: ${ended}`);
  }

  // --- orbitals: a Diels–Alder's p orbitals put on with the orbital tool, a lobe turned and clicked, a dashed
  // line and a curved arrow between lobes, flipped, saved and opened, exported, and turned in 3D ---
  {
    await clear();
    await paste('C=CC=C');
    await state(() => olomol.moveSelection(0, -1.5));
    await paste('C=C');
    await state(() => { olomol.moveSelection(0, 1.5); olomol.clearSelection(); olomol.fit(window.innerWidth, window.innerHeight); });
    const ids = await state(() => [...olomol.doc.atoms.values()].map((a) => [a.id, a.x, a.y]));
    await page.getByTestId('tool-orbital').click();
    for (const [, x, y] of ids) await clickAt([x, y]);
    const orbitals = await state(() => [...olomol.scene.orbitals.values()].map((o) => ({ id: o.orbital.id, atom: o.orbital.atom, middles: o.lobes.map((l) => l.middle) })));
    const angleOf = (id) => page.evaluate(async (id) => { const m = await import('/src/model/doc.js'); return Math.round(m.orbitalAngle(olomol.doc, olomol.doc.orbitals.get(id)) * 180 / Math.PI); }, id);
    // a click on a lobe: the other phase; a lobe dragged to the right of its atom: turned in a 15° step
    await clickAt(orbitals[0].middles[0]);
    const phase = await state((id) => olomol.doc.orbitals.get(id).phase, orbitals[0].id);
    const [, ax, ay] = ids.find(([id]) => id === orbitals[1].atom);
    await dragBetween(orbitals[1].middles[0], [ax + 1, ay - 0.27]);
    const turned = await angleOf(orbitals[1].id);
    // the diene's first lobe below dragged onto the ethylene's orbital: a dashed line, the orbital as it was
    const lower = orbitals.find((o) => o.atom === ids[4][0]);
    await dragBetween(orbitals[0].middles[1], lower.middles[0]);
    const lines = await state(() => olomol.doc.overlaps.size);
    const kept = await angleOf(orbitals[0].id);
    // dragged onto it again: no second line, and no undo step that changes nothing
    const steps = await state(() => olomol.undoStack.length);
    await dragBetween(orbitals[0].middles[1], lower.middles[0]);
    const again = await state(() => `${olomol.undoStack.length} ${olomol.doc.overlaps.size}`);
    // a curved arrow from the diene's last lobe below to the ethylene's other orbital
    await state(() => olomol.setTool({ name: 'curve', electrons: 2 }));
    const now = await state(() => [...olomol.scene.orbitals.values()].map((o) => ({ atom: o.orbital.atom, middles: o.lobes.map((l) => l.middle) })));
    await dragBetween(now.find((o) => o.atom === ids[3][0]).middles[1], now.find((o) => o.atom === ids[5][0]).middles[0]);
    const arrow = await state(() => [...olomol.doc.curves.values()].map((c) => Object.keys(c.from).concat(Object.keys(c.to)).join('→')).join());
    // flipped left to right: the turned orbital mirrored (−15° → 195°)
    await state(() => { olomol.setTool({ name: 'select' }); olomol.selectAll(); });
    await page.getByTitle(/^Flip left/).first().click();
    const mirrored = await angleOf(orbitals[1].id);
    // saved as KET and opened: everything there; in an SVG: the lobes as paths
    const ket = await state(() => window.olomolTest.writeAs('ket'));
    const reopened = await page.evaluate(async (text) => { const { readKet } = await import('/src/io/ket.js'); const { doc } = readKet(text); return `${doc.orbitals.size} ${doc.overlaps.size} ${[...doc.curves.values()].filter((c) => c.from.orbital !== undefined).length}`; }, ket);
    const svgPaths = await page.evaluate(async () => { const { svgOf } = await import('/src/io/files.js'); return (svgOf(olomol.doc, olomol.settings).match(/fill="#9aa1ad"/g) ?? []).length; });
    check(orbitals.length === 6 && phase === -1 && turned === -15 && lines === 1 && kept === -90 && again === `${steps} 1` && arrow === 'orbital→orbital' && mirrored === 195 && reopened === '6 1 1' && svgPaths === 6,
      `orbitals: ${orbitals.length} of 6 put on, a lobe clicked: phase ${phase}, a lobe dragged: ${turned}° (−15), onto another orbital: ${lines} dashed line (the orbital still ${kept}°; again: undo steps and lines ${again}, before ${steps} 1), a curved arrow ${arrow}, flipped: ${mirrored}° (195), KET: ${reopened} (6 1 1), SVG: ${svgPaths} shaded lobes`);
    // Shift+click on lobes with the select tool: orbitals added to the selection, one taken out again
    await state(() => { olomol.setTool({ name: 'select' }); olomol.clearSelection(); });
    const lobeMiddles = await state(() => [...olomol.scene.orbitals.values()].slice(0, 3).map((o) => o.lobes[0].middle));
    await clickAt(lobeMiddles[0]);
    await page.keyboard.down('Shift');
    for (const k of [1, 2, 1]) {
      await clickAt(lobeMiddles[k]);
      await page.waitForTimeout(550); // (not taken for the second half of a Shift+double click)
    }
    await page.keyboard.up('Shift');
    const shiftSelected = await state(() => olomol.selected('orbitals').length);
    check(shiftSelected === 2, `orbitals: Shift+click adds lobes to the selection and takes one out again (${shiftSelected} of 2 selected)`);
    // turned in 3D: the p orbitals upright to the molecule's plane as seen, on the side drawn, their atoms remembering it
    await clear();
    await paste('C=CC=C');
    await page.evaluate(async () => {
      const { addOrbitalTo } = await import('/src/editor/tools.js');
      olomol.change((doc) => [...doc.atoms.keys()].forEach((id, k) => { addOrbitalTo(doc, id, 'p').phase = k < 2 ? 1 : -1; }));
      olomol.selectAll();
    });
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    const stage = await page.getByTestId('turn3d-stage').boundingBox();
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2 - 110, { steps: 8 });
    await page.mouse.up();
    await page.getByTestId('turn3d-use').click();
    await page.waitForTimeout(200);
    const upright = await state(() => {
      const os = [...olomol.doc.orbitals.values()];
      // (the HOMO: the first two carbons' shaded lobes on one side of the plane, the last two's on the other)
      const side = (o) => o.plane * o.phase;
      return { planes: os.every((o) => o.plane === 1 || o.plane === -1), shorter: os.every((o) => o.reach < 1), phases: side(os[0]) === side(os[1]) && side(os[2]) === side(os[3]) && side(os[1]) !== side(os[2]),
        facings: [...olomol.doc.atoms.values()].every((a) => a.facing) };
    });
    check(upright.planes && upright.shorter && upright.phases && upright.facings, `orbitals in Turn in 3D: the p orbitals upright to butadiene's plane (${JSON.stringify(upright)})`);
    // flipped left to right, a half turn in space: each lobe's depth turns with the bonds' (before, the bonds' did
    // and the lobes' didn't, so a lobe now behind a bond was painted over it)
    const depths = () => state(() => [...olomol.doc.orbitals.values()].map((o) => [o.z, o.dz, o.plane]));
    const unflipped = await depths();
    await page.evaluate(async () => {
      const { flip } = await import('/src/arrange/align.js');
      olomol.selectAll();
      flip(olomol, true);
    });
    const flipped = await depths();
    check(flipped.every(([z, dz, plane], k) => z === -unflipped[k][0] && dz === -unflipped[k][1] && plane === unflipped[k][2]),
      `orbitals from Turn in 3D flipped left to right: their depths turn with the bonds' (${JSON.stringify(unflipped)} → ${JSON.stringify(flipped)})`);
  }

  // --- a dashed line stays between the lobes it was dragged between: hyperconjugation in a carbocation, the C–H
  // bond's lobe (pointing down to its H) dragged onto the empty p orbital's lower lobe; before, the line went
  // between the lobes nearest each other, the hybrid's small lobe behind and the upper p lobe ---
  {
    await clear();
    const ids = await page.evaluate(async () => {
      const D = await import('/src/model/doc.js');
      const doc = D.emptyDoc();
      const c = D.addAtom(doc, 0, 0, 'C', { charge: 1 });
      const ch = D.addAtom(doc, -1, 0, 'C');
      const h = D.addAtom(doc, -1.2, 1, 'H');
      D.addBond(doc, c.id, ch.id);
      D.addBond(doc, ch.id, h.id);
      const p = D.addOrbital(doc, c.id);
      D.setOrbitalAngle(doc, p, -Math.PI / 2);
      const bond = D.addOrbital(doc, ch.id, { kind: 'hybrid' });
      D.setOrbitalAngle(doc, bond, Math.atan2(1, -0.2));
      olomol.setDoc(doc);
      olomol.fit(window.innerWidth, window.innerHeight);
      return { p: p.id, bond: bond.id };
    });
    const lobes = (id) => state((id) => olomol.scene.orbitals.get(id).lobes.map((l) => ({ middle: l.middle, tip: l.tip, side: l.side })), id);
    const [pLobes, bondLobes] = [await lobes(ids.p), await lobes(ids.bond)];
    const big = bondLobes.find((l) => l.side === 1);
    const below = pLobes.reduce((a, b) => (b.middle[1] > a.middle[1] ? b : a));
    // (from beside the C–H bond, inside the lobe: on the bond itself the bond is hit)
    const [dx, dy] = [big.tip[0] - big.middle[0], big.tip[1] - big.middle[1]];
    const across = 0.15 / Math.hypot(dx, dy);
    await page.getByTestId('tool-orbital').click();
    await dragBetween([big.middle[0] - dy * across, big.middle[1] + dx * across], below.middle);
    const made = await state(() => [...olomol.doc.overlaps.values()].map((o) => ({ sideA: o.sideA, sideB: o.sideB, line: olomol.scene.overlaps.get(o.id)?.line })));
    const line = made[0]?.line ?? [[0, 0], [0, 0]];
    const near = (point, tip) => Math.hypot(point[0] - tip[0], point[1] - tip[1]) < 0.15;
    const between = line.some((e) => near(e, big.tip)) && line.some((e) => near(e, below.tip));
    const ket = await state(() => window.olomolTest.writeAs('ket'));
    const reopened = await page.evaluate(async (text) => { const { readKet } = await import('/src/io/ket.js'); const [o] = readKet(text).doc.overlaps.values(); return `${o?.sideA} ${o?.sideB}`; }, ket);
    check(made.length === 1 && between && reopened === `${made[0].sideA} ${made[0].sideB}`,
      `a dashed line dragged from a C–H bond's lobe to the lower p lobe stays there: ${made.length} line, from the lobe dragged and to the lobe dropped on (${between}; sides ${made[0]?.sideA} ${made[0]?.sideB}), kept in KET (${reopened})`);
    // the paint tool on the p orbital's white lobe: that lobe in the colour, the shaded one as it was; then on the
    // shaded one: that one (before, the other phase was always white)
    const pNow = await state((id) => olomol.scene.orbitals.get(id).lobes.map((l) => ({ middle: l.middle, shaded: l.shaded })), ids.p);
    await state(() => olomol.setTool({ name: 'paint', color: '#2e6fdb' }));
    await clickAt(pNow.find((l) => !l.shaded).middle);
    const white = await state((id) => { const o = olomol.doc.orbitals.get(id); return `${o.color} ${o.colorOther}`; }, ids.p);
    await state(() => olomol.setTool({ name: 'paint', color: '#e83e8c' }));
    await clickAt(pNow.find((l) => l.shaded).middle);
    const both = await state((id) => { const o = olomol.doc.orbitals.get(id); return `${o.color} ${o.colorOther}`; }, ids.p);
    const svgFills = await page.evaluate(async () => { const { svgOf } = await import('/src/io/files.js'); const svg = svgOf(olomol.doc, olomol.settings); return ['#2e6fdb', '#e83e8c'].every((c) => svg.includes(`fill="${c}"`)); });
    check(white === 'null #2e6fdb' && both === '#e83e8c #2e6fdb' && svgFills,
      `the paint tool on an orbital's white lobe paints that lobe (${white}), on the shaded one that one (${both}), both in the SVG (${svgFills})`);
    // the same from the panel: the orbital selected, "other phase" chosen above the colours, a colour, then White
    await state((id) => { olomol.setTool({ name: 'select' }); olomol.select([id]); }, ids.p);
    await page.getByTestId('lobe-toggle').locator('button').nth(1).click();
    const row = page.getByTestId('lobe-toggle').locator('xpath=..').locator('.swatches');
    await row.locator('.swatch:not(.none):not(.custom)').nth(2).click();
    const fromPanel = await state((id) => olomol.doc.orbitals.get(id).colorOther, ids.p);
    await row.locator('.swatch.none').click();
    const whiteAgain = await state((id) => olomol.doc.orbitals.get(id).colorOther, ids.p);
    const shadedKept = await state((id) => olomol.doc.orbitals.get(id).color, ids.p);
    check(fromPanel && fromPanel !== '#2e6fdb' && whiteAgain === null && shadedKept === '#e83e8c',
      `the panel's colours with "other phase" chosen: a colour for that lobe (${fromPanel}), then White (${whiteAgain}), the shaded lobe kept (${shadedKept})`);
    // (the choice back to the shaded lobe, as the next checks expect it)
    await page.getByTestId('lobe-toggle').locator('button').first().click();
    await state(() => olomol.setTool({ name: 'select' }));
    await clear();
  }

  // --- a curved arrow from a file: drawn as its curve says (here the second way, the file without its variant),
  // kept so after a change, from then on by its variant ---
  await clear();
  await paste('C[O-].CBr');
  const kept = await state(async () => {
    const { readOlom, writeOlom } = await import('/src/io/olom.js');
    const atoms = [...olomol.doc.atoms.values()];
    const O = atoms.find((a) => a.el === 'O');
    const C = atoms.find((a) => a.el === 'C' && a.id > O.id);
    olomol.change((doc) => {
      doc.curves.set(doc.nextId, { id: doc.nextId, electrons: 2, from: { atom: O.id }, to: { atom: C.id }, color: null, variant: 1 });
      doc.nextId += 1;
    });
    void olomol.scene;
    const file = JSON.parse(writeOlom(olomol.doc, {}));
    const [arrow] = file.electronArrows;
    delete arrow.variant;
    olomol.setDoc(readOlom(JSON.stringify(file)).doc);
    const first = olomol.scene.curves.values().next().value;
    const read = { variant: first.variant, p1: first.shape.p1.map((v) => +v.toFixed(3)), saved: [arrow.curve[1][0], -arrow.curve[1][1]].map((v) => +v.toFixed(3)) };
    olomol.change((doc) => {
      [...doc.atoms.values()].at(-1).x += 0.001;
    });
    const curve = olomol.doc.curves.values().next().value;
    return { read, variant: curve.variant, hint: Boolean(curve.hint), p1: olomol.scene.curves.values().next().value.shape.p1.map((v) => +v.toFixed(3)) };
  });
  check(kept.read.variant === 1 && kept.read.p1.join() === kept.read.saved.join() && kept.variant === 1 && !kept.hint && kept.p1.join() === kept.read.p1.join(),
    `a curved arrow saved its second way opens so from its curve alone, and keeps it after a change (${JSON.stringify(kept)})`);
}
