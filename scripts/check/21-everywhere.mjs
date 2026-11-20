// The browser check: 0.5's places do what the others do (20-consistency has 0.4's): the search bar's tools and
// the right-click menu as the left bar and the panel, Align reaction scheme over groups, groups through a molecule
// put on an arrow, a group's dashed orbital lines, a bold bond made double.
// Run alone: npm run check -- --only everywhere [url]

import { check, clear, page, paste, screen, state } from './harness.mjs';
// (its parts, in the order run:)
//   the search bar's Brackets over a selection: brackets round it, as the left bar's button
//   the right-click menu over PPh3: Abbreviate, as the panel offers; over molecules made one compound: Separate;
//   on a side arc: that arc selected, not its arrow with its reagents
//   Align reaction scheme with a molecule and a note grouped: the note goes with it
//   a grouped molecule put on a reaction arrow: out of its group, which can still be taken apart
//   a group of a diene and a dienophile: its dashed line selected with it
//   a bold bond made double, then single again: plain
//   ⊕ ⊖ in Settings: the drawing's style, a new drawing plain, Use for new drawings
const field = () => page.getByTestId('from-name-field');

export default async function run() {
  // --- the search bar's Brackets over a selection ---
  await clear();
  await paste('CCO');
  await state(() => olomol.selectAll());
  await page.mouse.move(700, 120);
  await field().focus();
  await field().fill('Brackets');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const bracketed = await state(() => olomol.doc.brackets.size);
  check(bracketed === 1, `the search bar's Brackets with ethanol selected: brackets round it, as the left bar's button (${bracketed})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // --- the right-click menu ---
  await clear();
  await paste('P(c1ccccc1)(c1ccccc1)c1ccccc1');
  await state(() => olomol.selectAll());
  const p = await state(() => { const a = [...olomol.doc.atoms.values()].find((x) => x.el === 'P'); return [a.x, a.y]; });
  {
    const [x, y] = await screen(p);
    await page.mouse.click(x, y, { button: 'right' });
    await page.waitForTimeout(150);
  }
  const offered = await page.locator('.context-menu').textContent().catch(() => '');
  await page.keyboard.press('Escape');
  check(/Abbreviate/.test(offered), `right-click on PPh3 drawn out, all of it selected: Abbreviate offered, as in the panel ("${offered.slice(0, 120)}")`);
  await clear();
  await paste('[K+].[Cl-]');
  await state(async () => {
    const { keepTogether } = await import('/src/editor/tools.js');
    const { fragments } = await import('/src/model/graph.js');
    keepTogether(olomol, fragments(olomol.doc));
    olomol.selectAll();
  });
  const k = await state(() => { const a = [...olomol.doc.atoms.values()].find((x) => x.el === 'K'); return [a.x, a.y]; });
  {
    const [x, y] = await screen(k);
    await page.mouse.click(x, y, { button: 'right' });
    await page.waitForTimeout(150);
  }
  const linkedMenu = await page.locator('.context-menu').textContent().catch(() => '');
  await page.keyboard.press('Escape');
  check(/Separate/.test(linkedMenu), `right-click on K⁺ and Cl⁻ made one compound: Separate offered ("${linkedMenu.slice(0, 120)}")`);
  await clear();
  const arc = await state(async () => {
    const { addArrow, addText, emptyDoc } = await import('/src/model/doc.js');
    const doc = emptyDoc();
    const arrow = addArrow(doc, 0, 0, 4, 0, 'forward');
    addText(doc, 2, -0.5, 'H2O', { arrow: arrow.id, slot: 'above' });
    arrow.sides = [{ id: doc.nextId++, side: 'below', way: 'in', reach: 1 }];
    olomol.setDoc(doc);
    olomol.fit(window.innerWidth, window.innerHeight);
    olomol.clearSelection();
    const drawn = olomol.scene.arrowArcs.get(`${arrow.id}|below-in`);
    return { arrow: arrow.id, arc: arrow.sides[0].id, at: drawn.samples[Math.floor(drawn.samples.length / 2)] };
  });
  {
    const [x, y] = await screen(arc.at);
    await page.mouse.click(x, y, { button: 'right' });
    await page.waitForTimeout(150);
  }
  const arcSelected = await state(() => [...olomol.selection]);
  await page.keyboard.press('Escape');
  check(arcSelected.length === 1 && arcSelected[0] === arc.arc, `right-click on a side arc: that arc selected, not its arrow with what is on it (${JSON.stringify(arcSelected)})`);

  // --- Align reaction scheme with a molecule and a note grouped ---
  await clear();
  const grouped = await state(async () => {
    const { readMolfile } = await import('/src/io/molfile.js');
    const { smilesToMolfile } = await import('/src/io/rdkit.js');
    const { addArrow, addText, copyObjects, emptyDoc } = await import('/src/model/doc.js');
    const { alignReaction } = await import('/src/arrange/align.js');
    const doc = emptyDoc();
    const place = async (smiles, x, y) => {
      const part = readMolfile(await smilesToMolfile(smiles)).doc;
      const atoms = [...part.atoms.values()];
      const middle = (key) => (Math.min(...atoms.map((a) => a[key])) + Math.max(...atoms.map((a) => a[key]))) / 2;
      copyObjects(part, [...part.atoms.keys()], x - middle('x'), y - middle('y'), doc);
    };
    await place('CCO', 0, 0.6);
    const note = addText(doc, -0.5, 2.5, 'crude');
    addArrow(doc, 3, 0, 6, 0, 'forward');
    await place('CC=O', 9, -0.4);
    const ethanol = [...doc.atoms.values()].find((a) => a.el === 'O' && a.x < 3);
    doc.groups = new Map([[999, { id: 999, members: [ethanol.id, note.id] }]]);
    doc.nextId = 1000;
    olomol.setDoc(doc);
    const offset = () => {
      const o = [...olomol.doc.atoms.values()].find((a) => a.el === 'O' && a.x < 3);
      const t = olomol.doc.texts.get(note.id);
      return [t.x - o.x, t.y - o.y];
    };
    const before = offset();
    olomol.selectAll();
    alignReaction(olomol);
    const after = offset();
    return Math.hypot(after[0] - before[0], after[1] - before[1]);
  });
  check(grouped < 1e-6, `Align reaction scheme, ethanol grouped with a note under it: the note goes with it (${grouped.toFixed(3)} off)`);

  // --- a grouped molecule put on a reaction arrow: out of its group ---
  await clear();
  const putOn = await state(async () => {
    const { addArrow, addAtom, addBond, emptyDoc } = await import('/src/model/doc.js');
    const { canUngroup } = await import('/src/editor/grouping.js');
    const doc = emptyDoc();
    const [a1, a2, b1, b2, c1] = [addAtom(doc, 0, 0), addAtom(doc, 1, 0), addAtom(doc, 3, 0), addAtom(doc, 4, 0), addAtom(doc, 6, 0)];
    addBond(doc, a1.id, a2.id, 1);
    addBond(doc, b1.id, b2.id, 1);
    const arrow = addArrow(doc, 8, 0, 11, 0, 'forward');
    doc.groups = new Map([[900, { id: 900, members: [a1.id, b1.id, c1.id] }]]);
    doc.nextId = 1000;
    olomol.setDoc(doc);
    olomol.change((d) => { for (const id of [b1.id, b2.id]) Object.assign(d.atoms.get(id), { arrow: arrow.id, arrowSlot: 'above', arrowOrder: 0 }); });
    const group = olomol.doc.groups.get(900);
    olomol.select([a1.id, a2.id, c1.id, ...olomol.doc.bonds.keys()].filter((id) => !olomol.doc.bonds.has(id) || olomol.doc.bonds.get(id).a === a1.id));
    const { idsOfGroup } = await import('/src/editor/tools/select.js');
    olomol.select(idsOfGroup(olomol, 900));
    return { members: group?.members ?? null, ungroup: canUngroup(olomol) };
  });
  check(putOn.members && putOn.members.length === 2 && putOn.ungroup, `a grouped molecule put on a reaction arrow: out of its group, the group can still be taken apart (${JSON.stringify(putOn)})`);

  // --- a group of a diene and a dienophile: its dashed line selected with it ---
  await clear();
  const dashed = await state(async () => {
    const { addAtom, addOrbital, emptyDoc } = await import('/src/model/doc.js');
    const { idsOfGroup } = await import('/src/editor/tools/select.js');
    const doc = emptyDoc();
    const [a, b] = [addAtom(doc, 0, 0), addAtom(doc, 3, 0)];
    const [p, q] = [addOrbital(doc, a.id), addOrbital(doc, b.id)];
    const overlap = { id: doc.nextId++, a: p.id, b: q.id, color: null };
    doc.overlaps.set(overlap.id, overlap);
    doc.groups = new Map([[900, { id: 900, members: [a.id, b.id] }]]);
    doc.nextId = 1000;
    olomol.setDoc(doc);
    return idsOfGroup(olomol, 900).includes(overlap.id);
  });
  check(dashed, 'a group of two molecules with a dashed line between their orbitals: the line selected with the group (and coloured with it)');

  // --- a bold bond made double, then single again: plain ---
  await clear();
  await paste('CCC');
  const bold = await state(() => {
    const id = [...olomol.doc.bonds.keys()][0];
    olomol.change((doc) => { doc.bonds.get(id).bold = true; });
    olomol.change((doc) => { doc.bonds.get(id).order = 2; });
    olomol.change((doc) => { doc.bonds.get(id).order = 1; });
    return olomol.doc.bonds.get(id).bold ?? false;
  });
  check(bold === false, `a bold bond made double, then single again: a plain bond, not bold again (${bold})`);

  // --- ⊕ ⊖ and Lewis bars in Settings: this drawing's style, kept in its file; a new drawing as set for new ones ---
  await clear();
  await paste('[OH3+]');
  const circles = () => state(() => [...olomol.scene.atoms.values()].reduce((n, info) => n + (info.label?.circles?.length ?? 0), 0));
  await page.getByTestId('settings').click();
  await page.locator('.menu.settings .row').filter({ has: page.locator('.name', { hasText: /^Charges$/ }) }).getByRole('button', { name: '⊕ ⊖' }).click();
  await page.keyboard.press('Escape');
  const own = { circles: await circles(), file: await state(async () => JSON.parse((await import('/src/io/olom.js')).writeOlom(olomol.doc, { settings: olomol.settings })).style) };
  const tabsBefore = await state(() => olomol.tabs.length);
  await page.locator('.topbar').getByTitle('New drawing', { exact: true }).click();
  await page.waitForFunction((n) => olomol.tabs.length === n + 1 && !olomol.switching, tabsBefore, { timeout: 3000 }).catch(() => {});
  await paste('[OH3+]');
  const fresh = await circles();
  await state(async () => (await import('/src/ui/tabs.js')).showTab(olomol, olomol.tabs.at(-2).id));
  await page.waitForTimeout(200);
  await page.getByTestId('settings').click();
  await page.getByTestId('style-default').click();
  await page.keyboard.press('Escape');
  const asDefault = await state(() => olomol.settings.chargeStyle);
  await state(() => olomol.setSettings({ chargeStyle: 'plain' }));
  check(own.circles === 1 && own.file?.charges === 'circled' && fresh === 0 && asDefault === 'circled',
    `Settings → Charges ⊕ ⊖: this drawing's, in its style (${own.circles}, ${JSON.stringify(own.file)}); a new drawing plain (${fresh}); Use for new drawings takes it (${asDefault})`);
}
