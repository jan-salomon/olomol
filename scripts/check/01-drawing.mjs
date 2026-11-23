// The browser check: Drawing: bonds, atoms, rings and chains with the mouse and keys, charges, bond kinds, hydrogens, atom numbers.
// Run alone: npm run check -- --only drawing [url]

import {
  atomXY, bondMiddle, canonical, check, clear, clickAt, context, counts, dragBetween, drawnSmiles, exportFile,
  hoverAndPress, inFirefox, layoutDone, notice, page, paste, screen, state, tool,
} from './harness.mjs';
// (its parts, in the order run:)
//   drawing with the mouse
//   rings hung on a crowded atom: three clicks of benzene on the P of P=O give Ph3P=O (no ring
//   a ring fused onto a bond: on the side with less drawn on it; with Shift on the other side
//   the charge in the panel: one more or less each click, any charge
//   a carbocation without its C: only the + at the corner
//   bond kinds
//   drawn hydrogens
//   clicking atoms with rings and elements
//   atom numbers
//   CH3 at one chain end; the live picture of a SMILES
//   an element key over the canvas: the bond tool draws that element
//   the chain tool's click on a bond: as the single bond tool's, the bond stays a bond
//   D: the dative bond tool, again the hydrogen bond, again the partial bond, then dative again; over a bond the same on it
//   aromatize
//   pulling a bond onto an atom; keeping molecules together; colours; Cl=O
//   a double bond's second line: one button in the panel moves it on, each click a change; Auto back
//   a chain grown by clicks: ethane's end clicked gives the zigzag across the page; Shift the other side (shown
//   while held), and the chain tool's zigzag the other way
export default async function run() {
  // --- drawing with the mouse ---
  await clear();
  await page.getByTitle('Benzene: click an atom, a bond or the canvas').click();
  await page.mouse.click(600, 450);
  let c = await counts();
  check(c.atoms === 6 && c.bonds === 6 && (await state(() => [...olomol.doc.bonds.values()].filter((b) => b.order === 2).length)) === 3, 'benzene: 6 atoms, alternating double bonds');
  await tool('bond').click();
  const ring = await state(() => [...olomol.doc.atoms.keys()]);
  await clickAt(await atomXY(ring[0]));
  c = await counts();
  check(c.atoms === 7 && c.bonds === 7, 'bond tool: a click on an atom adds a bond');
  const tip = (await state(() => [...olomol.doc.atoms.keys()])).at(-1);
  const tipXY = await atomXY(tip);
  await dragBetween(tipXY, [tipXY[0] + 0.9, tipXY[1] - 0.6]);
  c = await counts();
  const end = (await state(() => [...olomol.doc.atoms.keys()])).at(-1);
  const [ex, ey] = await atomXY(end);
  const length = Math.hypot(ex - tipXY[0], ey - tipXY[1]);
  const angle = (Math.atan2(ey - tipXY[1], ex - tipXY[0]) * 180) / Math.PI;
  check(c.atoms === 8 && Math.abs(length - 1) < 1e-6 && Math.abs(angle / 15 - Math.round(angle / 15)) < 1e-6, `bond tool: dragging pulls out a bond of length 1 at a 15° step (${angle.toFixed(1)}°)`);
  await hoverAndPress([ex, ey], 'o');
  check((await state((id) => olomol.doc.atoms.get(id).el, end)) === 'O', 'key "o" over an atom makes it O');
  const lastBond = (await state(() => [...olomol.doc.bonds.keys()])).at(-1);
  await hoverAndPress(await bondMiddle(lastBond), '2');
  check((await state((id) => olomol.doc.bonds.get(id).order, lastBond)) === 2, 'key "2" over a bond makes it double');
  check((await drawnSmiles()) === canonical('O=Cc1ccccc1'), `drawn: benzaldehyde (${await drawnSmiles()})`);
  const stereos = [];
  const firstEnd = await state((id) => olomol.doc.bonds.get(id).a, lastBond);
  for (let i = 0; i < 6; i++) {
    await hoverAndPress(await bondMiddle(lastBond), '1');
    // (the narrow end: the bond's first atom; '<' when it is the other end)
    stereos.push(await state(([id, first]) => `${olomol.doc.bonds.get(id).order}${olomol.doc.bonds.get(id).stereo}${olomol.doc.bonds.get(id).a === first ? '' : '<'}`, [lastBond, firstEnd]));
  }
  // Shift+1: one step back (from plain: the last, the hashed wedge from the other end)
  await page.mouse.move(...(await screen(await bondMiddle(lastBond))));
  await page.keyboard.press('Shift+Digit1');
  const stepBack = await state(([id, first]) => `${olomol.doc.bonds.get(id).stereo}${olomol.doc.bonds.get(id).a === first ? '' : '<'}`, [lastBond, firstEnd]);
  stereos.push(`back:${stepBack}`);
  check(stereos.slice(0, 5).join() === '1,1wedge,1hash,1wedge<,1hash<' && /^1<?$/.test(stereos[5]) && stepBack === 'hash<',
    `key "1" over a bond: single, again wedge, hashed wedge, both from the other end, plain (${stereos})`);
  await hoverAndPress(await bondMiddle(lastBond), '2');
  await tool('chain').click();
  const r3 = await atomXY(ring[3]);
  {
    // (by hand, to read the badge before the button is let go)
    const [x1, y1] = await screen(r3);
    const [x2, y2] = await screen([r3[0] - 0.2, r3[1] + 3]);
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
    await page.mouse.move(x2, y2, { steps: 6 });
    const shown = await page.evaluate(() => document.querySelector('.canvas svg g.badge text')?.textContent);
    await page.mouse.up();
    await page.waitForTimeout(80);
    c = await counts();
    check(c.atoms === 11 && shown === '3', `chain tool: a drag from an atom adds a zigzag chain (${c.atoms - 8} atoms), the badge counting the atoms it adds (${shown})`);
  }
  await page.keyboard.press('Control+z');
  check((await counts()).atoms === 8, 'Ctrl+Z undoes the chain');
  await page.keyboard.press('Control+Shift+z');
  check((await counts()).atoms === 11, 'Ctrl+Shift+Z redoes it');
  await page.screenshot({ path: 'test-output/drawn.png' });

  // the wheel pans; Shift+wheel sideways
  const view0 = await state(() => ({ ...olomol.view }));
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 100);
  const view1 = await state(() => ({ ...olomol.view }));
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  const view2 = await state(() => ({ ...olomol.view }));
  check(view1.ty < view0.ty && view1.tx === view0.tx && view2.tx < view1.tx && view2.ty === view1.ty, 'wheel scrolls up and down, Shift+wheel left and right');
  await state((v) => olomol.setView(v), view0);
  // a middle click pans; the paste that Linux sends with it (the selected text) is ignored
  if (!inFirefox) {
    const atomsBefore = (await counts()).atoms;
    await page.mouse.click(700, 450, { button: 'middle' });
    await state(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'C');
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    });
    await page.waitForTimeout(300);
    check((await counts()).atoms === atomsBefore, 'a middle click does not paste the selected text ("C" would be methane)');
    await page.waitForTimeout(300);
    // Firefox sends that paste when the button is let go, also after a long
    // pan that ends near where it began
    const view = await state(() => ({ ...olomol.view }));
    await page.mouse.move(700, 450);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(820, 380, { steps: 5 });
    await page.waitForTimeout(800);
    await page.mouse.move(703, 451, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await state(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'C');
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    });
    await page.waitForTimeout(300);
    check((await counts()).atoms === atomsBefore, 'a long middle-button pan back to its start does not paste either');
    await state((v) => olomol.setView(v), view);
    await page.waitForTimeout(300);
  }

  // select with a box, move, delete
  await tool('select').click();
  await page.mouse.move(150, 120);
  await page.mouse.down();
  await page.mouse.move(1000, 850, { steps: 5 });
  await page.mouse.up();
  check((await state(() => olomol.selection.size)) === 22, `select tool: a box selects atoms and bonds (${await state(() => olomol.selection.size)})`);
  const formula = await page.locator('.inspector .formula').textContent().catch(() => '');
  check(formula === 'C10H12O', `the selection panel shows the formula (${formula})`);
  const before = await atomXY(ring[1]);
  await dragBetween(before, [before[0] + 1, before[1] + 0.5]);
  const after = await atomXY(ring[1]);
  check(Math.abs(after[0] - before[0] - 1) < 0.05 && Math.abs(after[1] - before[1] - 0.5) < 0.05, 'dragging a selected atom moves the selection');
  await page.keyboard.press('Delete');
  check((await counts()).atoms === 0, 'Delete removes the selection');
  await page.keyboard.press('Control+z');
  check((await counts()).atoms === 11, 'Ctrl+Z brings it back');

  // --- rings hung on a crowded atom: three clicks of benzene on the P of P=O give Ph3P=O (no ring
  // fused to another); dragged from an atom, a ring points where it is dragged; the fit button
  // with a selection shows it as large as it fits ---
  const viewBeforeRings = await state(() => ({ ...olomol.view }));
  await clear();
  await state(() => olomol.change((doc) => {
    const p = doc.nextId++;
    doc.atoms.set(p, { id: p, el: 'P', x: 0, y: 0, charge: 0, isotope: null, radical: 0, hCount: null, lonePairs: null, color: null, alias: null });
    const o = doc.nextId++;
    doc.atoms.set(o, { id: o, el: 'O', x: 0, y: -1, charge: 0, isotope: null, radical: 0, hCount: null, lonePairs: null, color: null, alias: null });
    const b = doc.nextId++;
    doc.bonds.set(b, { id: b, a: p, b: o, order: 2, stereo: '', side: null, color: null });
  }));
  await state(() => olomol.setTool({ name: 'ring', size: 6, aromatic: true }));
  for (let k = 0; k < 3; k++) await clickAt([0, 0]);
  const triphenyl = await state(() => [olomol.doc.atoms.size, olomol.doc.bonds.size, olomol.smiles?.() ?? '']);
  await clear();
  await state(() => olomol.change((doc) => {
    const p = doc.nextId++;
    doc.atoms.set(p, { id: p, el: 'P', x: 0, y: 0, charge: 0, isotope: null, radical: 0, hCount: null, lonePairs: null, color: null, alias: null });
  }));
  await state(() => olomol.setTool({ name: 'ring', size: 6, aromatic: true }));
  await dragBetween([0, 0], [0, 2.5]);
  const aimed = await state(() => {
    const p = [...olomol.doc.atoms.values()].find((a) => a.el === 'P');
    const bond = [...olomol.doc.bonds.values()].find((b) => b.a === p.id || b.b === p.id);
    const c = olomol.doc.atoms.get(bond.a === p.id ? bond.b : bond.a);
    return [olomol.doc.atoms.size, Math.abs(c.x).toFixed(2), c.y.toFixed(2)];
  });
  await state(() => {
    olomol.setTool({ name: 'select' });
    olomol.select([...olomol.doc.atoms.values()].filter((a) => a.el === 'P').map((a) => a.id));
  });
  await page.getByTestId('fit').click();
  const selectionScale = await state(() => olomol.view.scale);
  await state(() => olomol.select([]));
  await page.getByTestId('fit').click();
  const allScale = await state(() => olomol.view.scale);
  await state((v) => olomol.setView(v), viewBeforeRings);
  check(triphenyl[0] === 20 && triphenyl[1] === 22 && aimed.join() === '7,0.00,1.00' && selectionScale > allScale * 1.5,
    `rings on an atom: three clicks on P=O give ${triphenyl[0]} atoms, ${triphenyl[1]} bonds (Ph3P=O: 20, 22); dragged down from P, a ring hangs below it (${aimed.join(', ')}); fit with P selected zooms to it (${selectionScale.toFixed(0)}), without a selection everything (${allScale.toFixed(0)})`);

  // --- a ring fused onto a bond: on the side with less drawn on it; with Shift on the other side ---
  const ringSide = async (shift) => {
    await clear();
    await state(() => olomol.change((doc) => {
      const ids = [[0, 0], [0.87, -0.5], [1.73, 0]].map(([x, y]) => {
        const id = doc.nextId++;
        doc.atoms.set(id, { id, el: 'C', x, y, charge: 0, isotope: null, radical: 0, hCount: null, lonePairs: null, color: null, alias: null });
        return id;
      });
      for (let k = 0; k < 2; k++) { const id = doc.nextId++; doc.bonds.set(id, { id, a: ids[k], b: ids[k + 1], order: 1, stereo: '', side: null, color: null }); }
    }));
    await state(() => olomol.setTool({ name: 'ring', size: 6, aromatic: false }));
    const middle = await bondMiddle(await state(() => [...olomol.doc.bonds.keys()][0]));
    if (shift) await page.keyboard.down('Shift');
    await clickAt(middle);
    if (shift) await page.keyboard.up('Shift');
    // which side of the first bond the new ring's middle is on
    return state(() => {
      const [a, b] = [...olomol.doc.atoms.values()];
      const atoms = [...olomol.doc.atoms.values()];
      const [cx, cy] = [atoms.reduce((s, p) => s + p.x, 0) / atoms.length, atoms.reduce((s, p) => s + p.y, 0) / atoms.length];
      return [atoms.length, Math.sign((b.x - a.x) * (cy - a.y) - (b.y - a.y) * (cx - a.x))];
    });
  };
  const plainSide = await ringSide(false);
  const shiftSide = await ringSide(true);
  // (on the chain's side its third atom is a corner of the new ring: 6 atoms, not 7)
  check(plainSide[0] === 7 && shiftSide[0] === 6 && plainSide[1] === -shiftSide[1] && plainSide[1] !== 0,
    `a ring fused onto a chain bond goes on the free side (${plainSide.join(', ')}), with Shift on the other, through the chain's next atom (${shiftSide.join(', ')})`);

  // --- the charge in the panel: one more or less each click, any charge ---
  await clear();
  await paste('CN');
  await state(() => olomol.select([...olomol.doc.atoms.values()].filter((a) => a.el === 'N').map((a) => a.id)));
  for (let k = 0; k < 3; k++) await page.getByTestId('charge-up').click();
  const chargeUp = [await state(() => [...olomol.doc.atoms.values()].find((a) => a.el === 'N').charge), await page.getByTestId('charge-value').textContent()];
  await page.getByTestId('charge-down').click();
  const chargeDown = await state(() => [...olomol.doc.atoms.values()].find((a) => a.el === 'N').charge);
  await page.getByTestId('charge-down').click();
  await page.getByTestId('charge-down').click();
  const chargeOff = [await state(() => [...olomol.doc.atoms.values()].find((a) => a.el === 'N').charge), await page.getByTestId('charge-value').textContent()];
  check(chargeUp[0] === 3 && chargeUp[1] === '3+' && chargeDown === 2 && chargeOff.join() === '0,0', `charge buttons: + three times 3+ (${chargeUp.join(', ')}), − once ${chargeDown}, twice more back to 0 (${chargeOff.join(', ')})`);
  // (δ: the one shown clicked again takes it off; the other swaps)
  const partial = () => state(() => [...olomol.doc.atoms.values()].find((a) => a.el === 'N').partialCharge ?? null);
  const deltaButton = (text) => page.locator('.charge-row .seg button', { hasText: text });
  await deltaButton('δ−').click();
  const deltaOn = await partial();
  await deltaButton('δ+').click();
  const deltaSwapped = await partial();
  await deltaButton('δ+').click();
  const deltaOff = [await partial(), await deltaButton('δ+').getAttribute('class')];
  check(deltaOn === -1 && deltaSwapped === 1 && deltaOff[0] === null && !deltaOff[1]?.includes('on'),
    `δ buttons: δ− on (${deltaOn}), δ+ instead (${deltaSwapped}), δ+ again none (${deltaOff.join(', ')})`);

  // --- a carbocation without its C (J): the panel's Carbons line: no label, the + at the corner, in the SVG too; All C:
  // C+ again ---
  await clear();
  await paste('CC(C)=O');
  await state(() => {
    const o = [...olomol.doc.atoms.values()].find((a) => a.el === 'O');
    const c = [...olomol.doc.bonds.values()].find((b) => b.a === o.id || b.b === o.id);
    olomol.change((doc) => { doc.bonds.get(c.id).order = 1; doc.atoms.get(c.a === o.id ? c.b : c.a).charge = 1; });
    olomol.select([c.a === o.id ? c.b : c.a]);
  });
  await page.locator('.inspector .row').filter({ has: page.locator('.name', { hasText: /^Carbons$/ }) }).getByRole('button', { name: 'line', exact: true }).click();
  const bare = await state(async () => {
    const c = [...olomol.doc.atoms.values()].find((a) => a.charge === 1);
    const info = olomol.scene.atoms.get(c.id);
    const { sceneToSVG } = await import('/src/render/svg.js');
    return { label: info.label, mark: info.mark?.text, away: info.mark && Math.hypot((info.mark.box.x1 + info.mark.box.x2) / 2 - c.x, (info.mark.box.y1 + info.mark.box.y2) / 2 - c.y),
      svgC: sceneToSVG(olomol.scene).match(/>C</g)?.length ?? 0, carbonLabel: c.carbonLabel };
  });
  await page.screenshot({ path: `${process.env.CHECK_SHOTS ?? '/tmp'}/carbocation-bare.png` });
  await page.locator('.inspector .row').filter({ has: page.locator('.name', { hasText: /^Carbons$/ }) }).getByRole('button', { name: 'All C', exact: true }).click();
  const written = await state(async () => {
    const { sceneToSVG } = await import('/src/render/svg.js');
    return { label: Boolean(olomol.scene.atoms.get([...olomol.doc.atoms.values()].find((a) => a.charge === 1).id).label), svgC: sceneToSVG(olomol.scene).match(/>C</g)?.length ?? 0 };
  });
  check(!bare.label && bare.mark === '+' && bare.away > 0.2 && bare.away < 0.6 && bare.carbonLabel === false && written.label && bare.svgC === written.svgC - 1,
    `a carbocation without its C: the panel's Carbons line leaves no label, the + beside the corner (${JSON.stringify(bare)}); All C writes it again (${JSON.stringify(written)})`);

  // --- bond kinds ---
  await clear();
  await paste('CCBr');
  await state(() => olomol.setTool({ name: 'bond', order: 1, stereo: '', kind: 'partial' }));
  const cBr = await state(() => [...olomol.doc.bonds.values()].find((b) => olomol.doc.atoms.get(b.b).el === 'Br' || olomol.doc.atoms.get(b.a).el === 'Br').id);
  await clickAt(await bondMiddle(cBr));
  check((await state((id) => olomol.doc.bonds.get(id).kind, cBr)) === 'partial' && (await state((id) => Boolean(olomol.scene.bonds.get(id).shapes.dashed), cBr)),
    'partial bond tool: a click makes the C–Br bond dashed (breaking)');
  check((await state(() => [...olomol.scene.atoms.values()].some((a) => a.chem.error))) === false, 'a partial bond is no valence error');
  await state(() => olomol.setTool({ name: 'charge', partial: 1 }));
  const firstC = await state(() => [...olomol.doc.atoms.values()].find((a) => a.el === 'C' && [...olomol.doc.bonds.values()].some((b) => (b.a === a.id || b.b === a.id) && b.kind)).id);
  await clickAt(await atomXY(firstC));
  check((await page.locator('.drawing').innerHTML()).includes('δ+'), 'δ+ tool: a carbon gets a δ+ beside it');
  await page.keyboard.press('Escape');

  // --- drawn hydrogens ---
  await clear();
  await paste('CCO');
  await state(() => olomol.selectAll());
  await page.getByTestId('draw-h').click();
  check((await counts()).atoms === 9 && canonical(await state(() => window.olomolTest.molfile()), { removeHs: true }) === canonical('CCO'), `"Draw the H": ethanol with its six H drawn, the same molecule (${(await counts()).atoms} atoms)`);
  await page.getByTestId('draw-h').click();
  check((await counts()).atoms === 3, '"Hide drawn H": back to three atoms');

  // --- clicking atoms with rings and elements ---
  // a ring on an atom hangs on it by a new bond (a phenyl); Shift: through the atom (spiro)
  await clear();
  await paste('C1CCCCC1');
  await state(() => olomol.setTool({ name: 'ring', size: 6, aromatic: true }));
  const ringAtom = (await state(() => [...olomol.doc.atoms.keys()]))[0];
  const [rx, ry] = await screen(await atomXY(ringAtom));
  await page.mouse.move(rx, ry);
  const hung = await state(() => Boolean(olomol.preview?.bond));
  await page.keyboard.down('Shift');
  const through = await state(() => olomol.preview?.kind === 'ghost' && !olomol.preview.bond);
  await page.keyboard.up('Shift');
  check(hung && through, `ring tool over an atom: the preview shows the new bond, with Shift held the ring through the atom (${hung}, ${through})`);
  await page.mouse.click(rx, ry);
  await page.waitForTimeout(80);
  check((await drawnSmiles()) === canonical('c1ccc(cc1)C1CCCCC1'), `ring tool on an atom: a phenyl on it (${await drawnSmiles()})`);
  await page.keyboard.press('Control+z');
  await state(() => olomol.setTool({ name: 'ring', size: 6, aromatic: false }));
  await page.keyboard.down('Shift');
  await clickAt(await atomXY(ringAtom));
  await page.keyboard.up('Shift');
  check((await drawnSmiles()) === canonical('C1CCC2(CC1)CCCCC2'), `ring tool, Shift+click on an atom: spiro (${await drawnSmiles()})`);
  // C on C grows a chain, another element replaces, Shift bonds a new one
  await clear();
  await state(() => olomol.setTool({ name: 'atom', el: 'C' }));
  await clickAt([0, 0]);
  await clickAt([0, 0]);
  check((await drawnSmiles()) === 'CC', `C on a C: a bond to a new C (${await drawnSmiles()})`);
  await state(() => olomol.setTool({ name: 'atom', el: 'O' }));
  await clickAt([0, 0]);
  check((await drawnSmiles()) === 'CO', `O on a C: it becomes O (${await drawnSmiles()})`);
  const cAtom = await state(() => [...olomol.doc.atoms.values()].find((a) => a.el === 'C').id);
  await page.keyboard.down('Shift');
  await clickAt(await atomXY(cAtom));
  await page.keyboard.up('Shift');
  check((await drawnSmiles()) === canonical('OCO'), `Shift+click with O on a C: a new O bonded to it (${await drawnSmiles()})`);
  // the element buttons in their colours, also in black and white
  await state(() => olomol.setSettings({ colorMode: 'mono' }));
  const nColour = await page.locator('.dock .el', { hasText: /^N$/ }).evaluate((el) => getComputedStyle(el).color);
  check(nColour === 'rgb(35, 80, 216)', `bottom bar: N in its blue, also when atoms are drawn black (${nColour})`);
  await state(() => olomol.setSettings({ colorMode: 'element' }));
  // the periodic table: families in colour, group and period numbers (the group labels are in Templates)
  await page.getByTitle('Periodic table', { exact: true }).click();
  const table = await state(() => ({
    halogens: document.querySelectorAll('.periodic .fam-halogen').length,
    axis: document.querySelectorAll('.periodic .axis').length,
    labels: document.querySelectorAll('.label-groups').length,
  }));
  check(table.halogens === 6 && table.axis === 25 && table.labels === 0, `periodic table: families, 18 groups and 7 periods numbered, no labels any more (${JSON.stringify(table)})`);
  await page.keyboard.press('Escape');
  // the group labels in Templates: a functional group with an abbreviation offers it on its card (Ph on
  // Phenyl), the rest are under Abbreviations (Fmoc, drawn out, with its full name; not Ph again); found by
  // their full names ("tosyl": the Tosyl card with Ts). Ph from its chip clicked on an atom of ethane
  // attaches by a new bond, with Shift it takes the atom's place
  await page.getByTestId('templates').click();
  await page.getByRole('button', { name: 'Abbreviations', exact: true }).click();
  const fmocCard = page.locator('[data-testid=template]', { hasText: /^Fmoc/ });
  await fmocCard.locator('img').waitFor({ timeout: 20_000 }).catch(() => {});
  const fmocShown = await fmocCard.textContent().catch(() => '');
  const phAgain = await page.locator('[data-testid=template]', { hasText: /^Ph( ·|$)/ }).count();
  // the big categories' subgroups in the list on the left: the whole category with a heading for each, one
  // subgroup alone without headings (Generic: R, X, Nu…, no Fmoc), the choice there again when Templates reopens
  const headings = await page.locator('.template-heading').allTextContents();
  await page.getByTestId('template-subgroup').filter({ hasText: /^Generic$/ }).click();
  const generic = await page.locator('[data-testid=template] .caption').allTextContents();
  const genericHeadings = await page.locator('.template-heading').count();
  await page.keyboard.press('Escape');
  await page.getByTestId('templates').click();
  const reopened = await page.locator('[data-testid=template-subgroup].on').textContent().catch(() => '');
  check(headings.length >= 4 && headings.includes('Generic') && generic.some((c) => c.startsWith('R ')) && generic.some((c) => c.startsWith('Nu'))
    && !generic.some((c) => c.startsWith('Fmoc')) && genericHeadings === 0 && reopened === 'Generic',
    `Templates' list: Abbreviations with its subgroups as headings (${headings.join(', ')}), Generic alone (${generic.length} cards, no Fmoc, ${genericHeadings} headings), kept when reopened (${reopened})`);
  await page.getByRole('button', { name: 'Abbreviations', exact: true }).click();
  await page.getByTestId('template-search').fill('tosyl');
  const searchedTs = await page.getByTestId('as-label-Ts').count();
  // "?Ph", "?S": the templates with that group or element in them
  const withPart = async (text) => {
    await page.getByTestId('template-search').fill(text);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=template]').length > 0, null, { timeout: 20_000 }).catch(() => {});
    return page.locator('[data-testid=template] .caption').allTextContents();
  };
  const withPh = await withPart('?Ph');
  const withS = await withPart('?S');
  check(withPh.some((c) => c.startsWith('Phenyl')) && withPh.some((c) => c.startsWith('Benzyl')) && !withPh.some((c) => c.startsWith('Hydroxy'))
    && withS.some((c) => c.startsWith('Thiol')) && withS.some((c) => c.startsWith('Tosyl')) && !withS.some((c) => c.startsWith('Phenyl')),
    `Templates search "?Ph": ${withPh.length} with a phenyl (Phenyl, Benzyl…); "?S": ${withS.length} with sulfur (Thiol, Tosyl…)`);
  await page.getByTestId('template-search').fill('');
  await page.getByRole('button', { name: 'Functional groups', exact: true }).click();
  await page.getByTestId('as-label-Ph').click();
  await page.waitForFunction(() => olomol.tool.name === 'group', null, { timeout: 10_000 }).catch(() => {});
  await state(() => { window.phTool = olomol.tool; });
  await clear();
  await paste('CC');
  await state(() => { olomol.clearSelection(); olomol.setTool(window.phTool); });
  await clickAt(await atomXY((await state(() => [...olomol.doc.atoms.keys()]))[0]));
  const phAttached = await state(() => [...olomol.doc.atoms.values()].map((a) => a.alias ?? a.el).sort().join());
  await clear();
  await paste('CC');
  await state(() => { olomol.clearSelection(); olomol.setTool(window.phTool); });
  await page.keyboard.down('Shift');
  await clickAt(await atomXY((await state(() => [...olomol.doc.atoms.keys()]))[0]));
  await page.keyboard.up('Shift');
  const phReplaced = await state(() => [...olomol.doc.atoms.values()].map((a) => a.alias ?? a.el).sort().join());
  await page.keyboard.press('Escape');
  check(fmocShown.includes('fluorenylmethoxycarbonyl') && phAgain === 0 && searchedTs === 1 && phAttached === 'C,C,Ph' && phReplaced === 'C,Ph',
    `Templates: Abbreviations has Fmoc ("${fmocShown}"), not Ph again (${phAgain}); "tosyl" finds the Tosyl card with Ts (${searchedTs}); Ph from the Phenyl card clicked on ethane attaches (${phAttached}), with Shift replaces the carbon (${phReplaced})`);
  // isotopes typed into the element field: 13C with its mass number before it, D as D (in the formula as D), 2H as ²H
  await clear();
  await paste('C(C)C'); // (the first atom the middle one: 13C, its ends D and 2H)
  await state(() => olomol.select([Math.min(...olomol.doc.atoms.keys())]));
  {
    const field = page.locator('.inspector input.field').first();
    await field.fill('13C');
    await field.press('Enter');
    const [, middle, last] = await state(() => [...olomol.doc.atoms.keys()].sort((p, q) => p - q));
    await state((id) => olomol.select([id]), middle);
    await field.fill('D');
    await field.press('Enter');
    await state((id) => olomol.select([id]), last);
    await field.fill('2H');
    await field.press('Enter');
  }
  const isotopes = await state(() => {
    const atoms = [...olomol.doc.atoms.values()].sort((p, q) => p.id - q.id);
    const label = (atom) => [...olomol.scene.atoms.get(atom.id).label.runs].sort((p, q) => p.x - q.x).map((r) => r.text).join('');
    return { atoms: atoms.map((a) => `${a.isotope ?? ''}${a.el}`).join(), labels: [label(atoms[1]), label(atoms[2])] };
  });
  await state(() => olomol.selectAll());
  const isotopeFormula = await page.getByTestId('formula').textContent();
  check(isotopes.atoms === '13C,2H,2H' && isotopes.labels.join() === 'D,2H' && isotopeFormula.startsWith('CH2²HD'),
    `isotopes typed in: 13C, D and 2H (${JSON.stringify(isotopes)}), the formula with ²H and D (${isotopeFormula})`);
  // element symbols as written, or in small letters; CO and NI are no symbols (not cobalt, not nickel)
  {
    const field = page.locator('.inspector input.field').first();
    const typed = [];
    for (const text of ['Co', 'cl', 'CO', 'NI']) {
      await clear();
      await paste('C');
      await state(() => olomol.select([...olomol.doc.atoms.keys()]));
      await field.fill(text);
      await field.press('Enter');
      typed.push(`${text}→${await state(() => { const a = [...olomol.doc.atoms.values()][0]; return a.alias ?? a.el; })}`);
    }
    const said = await notice();
    check(typed.join() === 'Co→Co,cl→Cl,CO→C,NI→C' && said.includes('NI'), `element symbols typed: ${typed.join(', ')}; "${said}"`);
  }
  // R again and again: the next ring each time, as in the rail
  await state(() => { olomol.clearSelection(); olomol.setTool({ name: 'select' }); });
  await page.mouse.move(5, 450);
  const rings = [];
  for (let k = 0; k < 3; k += 1) {
    await page.keyboard.press('r');
    rings.push(await state(() => `${olomol.tool.size}${olomol.tool.aromatic ? 'a' : ''}`));
  }
  check(rings.join() === '6a,3,4', `R, R, R: benzene, then a ring of 3, of 4 (${rings.join()})`);
  await state(() => olomol.setTool({ name: 'select' }));
  // the PubChem page of a selected molecule (PubChem's answers made up here, nothing goes out)
  await context.route('https://pubchem.ncbi.nlm.nih.gov/**', (route) => (route.request().url().includes('/rest/')
    ? route.fulfill({ json: { IdentifierList: { CID: [702] } } })
    : route.fulfill({ contentType: 'text/html', body: '<title>PubChem</title>' })));
  await clear();
  await paste('CCO');
  await state(() => olomol.selectAll());
  await page.getByTestId('formula').click();
  await page.getByTestId('pubchem-page').waitFor({ timeout: 20_000 }).catch(() => {});
  const [tab] = await Promise.all([context.waitForEvent('page', { timeout: 10_000 }).catch(() => null), page.getByTestId('pubchem-page').click()]);
  await tab?.waitForURL(/compound/, { timeout: 10_000 }).catch(() => {});
  check(tab?.url() === 'https://pubchem.ncbi.nlm.nih.gov/compound/702', `Info → PubChem page: the compound's page in a new tab (${tab?.url()})`);
  await tab?.close();
  // no compound with exactly this InChIKey: the page says so and lists those with the same connectivity
  await context.unroute('https://pubchem.ncbi.nlm.nih.gov/**');
  await context.route('https://pubchem.ncbi.nlm.nih.gov/**', (route) => {
    const url = route.request().url();
    if (url.includes('/inchikey/')) return route.fulfill({ status: 404, json: { Fault: { Code: 'PUGREST.NotFound', Message: 'No CID found' } } });
    if (url.includes('/fastidentity/')) return route.fulfill({ json: { IdentifierList: { CID: [5281, 9000] } } });
    if (url.includes('/property/Title')) return route.fulfill({ json: { PropertyTable: { Properties: [{ CID: 5281, Title: 'toxiferine' }, { CID: 9000, Title: 'its isomer' }] } } });
    return route.fulfill({ contentType: 'text/html', body: '<title>PubChem</title>' });
  });
  const [similarTab] = await Promise.all([context.waitForEvent('page', { timeout: 10_000 }).catch(() => null), page.getByTestId('pubchem-page').click()]);
  await similarTab?.locator('#message ul a').first().waitFor({ timeout: 10_000 }).catch(() => {});
  const similar = await similarTab?.evaluate(() => [document.querySelector('#message .notice span')?.textContent, [...document.querySelectorAll('#message a')].map((a) => a.href).join()]);
  await similarTab?.close();
  check(similar?.[0]?.startsWith('PubChem has no compound with exactly this stereochemistry') && similar[1] === 'https://pubchem.ncbi.nlm.nih.gov/compound/5281,https://pubchem.ncbi.nlm.nih.gov/compound/9000',
    `Info → PubChem page, no exact match: says so ("${similar?.[0]?.slice(0, 60)}…") and lists the compounds with the same atoms and bonds (${similar?.[1]})`);
  // a drawing without stereochemistry that PubChem has so, and also stereo-defined (atropine): the choice,
  // what was drawn first ("as drawn"), then the others, shortest name first
  await context.unroute('https://pubchem.ncbi.nlm.nih.gov/**');
  await context.route('https://pubchem.ncbi.nlm.nih.gov/**', (route) => {
    const url = route.request().url();
    if (url.includes('/inchikey/')) return route.fulfill({ json: { IdentifierList: { CID: [3661] } } });
    if (url.includes('/fastidentity/')) return route.fulfill({ json: { IdentifierList: { CID: [3661, 154417, 174174] } } });
    if (url.includes('/property/Title')) return route.fulfill({ json: { PropertyTable: { Properties: [{ CID: 3661, Title: '8-methyl-8-azabicyclo[3.2.1]octan-3-yl 3-hydroxy-2-phenylpropanoate', UndefinedAtomStereoCount: 3 }, { CID: 154417, Title: 'Hyoscyamine' }, { CID: 174174, Title: 'Atropine', UndefinedAtomStereoCount: 1 }] } } });
    return route.fulfill({ contentType: 'text/html', body: '<title>PubChem</title>' });
  });
  const [choiceTab] = await Promise.all([context.waitForEvent('page', { timeout: 10_000 }).catch(() => null), page.getByTestId('pubchem-page').click()]);
  await choiceTab?.locator('#message .card').nth(2).waitFor({ timeout: 10_000 }).catch(() => {});
  const choice = await choiceTab?.evaluate(() => [...document.querySelectorAll('#message .card')].map((c) => `${c.querySelector('.name').textContent.slice(0, 12)} (${c.querySelector('.cid').textContent})`).join(' | '));
  await choiceTab?.close();
  check(choice?.startsWith('8-methyl-8-a (CID 3661 · as drawn) | Atropine (CID 174174) | Hyoscyamine (CID 154417)'),
    `Info → PubChem page, drawn without stereochemistry: what was drawn first, then the stereo-defined ones, shortest name first (${choice})`);
  check(await state(() => Boolean(document.querySelector('.info-card .ident') && !document.querySelector('.inspector .ident'))), 'the info list is a card of its own beside the panel');
  await page.getByTestId('formula').click();
  // a whole molecule: no rows for each atom's charge or each bond's order; one atom: all of them
  const rowNames = () => state(() => [...document.querySelectorAll('.inspector .row > .name')].map((n) => n.textContent));
  const wholeRows = await rowNames();
  await state(() => olomol.select([[...olomol.doc.atoms.keys()][0]]));
  const oneRows = await rowNames();
  check(!wholeRows.includes('Charge') && !wholeRows.includes('Order') && wholeRows.includes('Lone pairs') && oneRows.includes('Charge'),
    `the panel: lone pairs for a whole molecule, charge and the rest for one atom (${wholeRows} | ${oneRows})`);
  await context.unroute('https://pubchem.ncbi.nlm.nih.gov/**');

  // --- atom numbers ---
  // IUPAC numbering: hexane from one end; a Cl at the other end and C1 moves there by itself
  await clear();
  await paste('CCCCCC');
  await state(() => olomol.selectAll());
  await page.getByTestId('atom-numbers').check();
  const shown = () => state(() => [...olomol.doc.atoms.values()].filter((a) => a.el === 'C').map((a) => olomol.scene.atoms.get(a.id).number?.text ?? '-').join());
  const hexaneNumbers = await shown();
  check(hexaneNumbers === '1,2,3,4,5,6', `IUPAC numbering: hexane 1–6 (${hexaneNumbers})`);
  const lastC = await state(() => [...olomol.doc.atoms.keys()].at(-1));
  await state(() => olomol.setTool({ name: 'atom', el: 'Cl' }));
  await page.keyboard.down('Shift');
  await clickAt(await atomXY(lastC));
  await page.keyboard.up('Shift');
  const chloroNumbers = await shown();
  const why = await page.getByTestId('numbering-why').textContent().catch(() => '');
  check(chloroNumbers === '6,5,4,3,2,1' && why.includes('substituents get the lowest numbers: 1, not 6'),
    `IUPAC numbering: a Cl on C6 and the chain is numbered from it, by itself, saying why (${chloroNumbers}; ${why})`);
  const ketNumbers = await state(() => window.olomolTest.writeAs('ket'));
  check(/"autoNumber": *true/.test(ketNumbers), 'IUPAC numbering is saved in KET');
  await page.getByTestId('atom-numbers').uncheck();
  check((await shown()) === '-,-,-,-,-,-', 'unticked: the numbers are gone');
  // the tool: atoms in the order clicked; a numbered one again: off
  await state(() => olomol.setTool({ name: 'atomNumber' }));
  const chainAtoms = await state(() => [...olomol.doc.atoms.keys()]);
  await clickAt(await atomXY(chainAtoms[3]));
  await clickAt(await atomXY(chainAtoms[0]));
  await clickAt(await atomXY(chainAtoms[5]));
  await clickAt(await atomXY(chainAtoms[0]));
  const clicked = await state((ids) => ids.map((id) => olomol.doc.atoms.get(id).number ?? '-').join(), chainAtoms);
  check(clicked === '-,-,-,1,-,3,-', `atom number tool: 1, 2, 3 in the order clicked, a second click takes 2 off (${clicked})`);

  // --- CH3 at one chain end; the live picture of a SMILES ---
  await clear();
  await paste('CCC');
  const ends = await state(() => [...olomol.doc.atoms.values()].filter((a) => olomol.scene.atoms.get(a.id).degree === 1).map((a) => a.id));
  await state(() => olomol.settings.terminalCarbons && olomol.setSettings({ terminalCarbons: false }));
  const chainEnds = page.locator('.inspector .row', { hasText: 'Carbons' });
  await state((id) => olomol.select([id]), ends[0]);
  await chainEnds.getByRole('button', { name: 'CH₃' }).click();
  const one = await state((ids) => ids.map((id) => Boolean(olomol.scene.atoms.get(id).label)), ends);
  await state(() => olomol.selectAll());
  await chainEnds.getByRole('button', { name: 'CH₃' }).click();
  const both = await state((ids) => ids.map((id) => Boolean(olomol.scene.atoms.get(id).label)), ends);
  check(one.join() === 'true,false' && both.join() === 'true,true', `one Chain ends switch: CH₃ for the selected chain end, then for the whole molecule (${one} | ${both})`);
  await page.mouse.move(700, 600);
  await page.keyboard.press('/');
  await page.getByTestId('from-name-field').fill('c1ccncc1');
  await page.getByTestId('smiles-preview').waitFor({ timeout: 10_000 }).catch(() => {});
  check(await page.getByTestId('smiles-preview').isVisible().catch(() => false), 'Name / SMILES: a picture of the SMILES while typing');
  // SMILES with mistakes: said in words, never sent to PubChem; a charge after its atom put right
  await page.getByTestId('from-name-field').fill('CCO(C=O)OCC');
  await page.getByTestId('smiles-problem').waitFor({ timeout: 10_000 }).catch(() => {});
  const valence = await page.getByTestId('smiles-problem').textContent().catch(() => '');
  const offered = await page.getByTestId('pubchem').count() + await page.getByTestId('pubchem-open').count();
  check(valence.startsWith('Atom 3 (O) has 3 bonds') && offered === 0, `Name / SMILES: a SMILES with a valence mistake says which atom, and isn't offered to PubChem (${valence})`);
  await clear();
  await page.getByTestId('from-name-field').fill('c1ccc(N[+](O[-])=O)cc1');
  await page.getByTestId('draw-fixed').waitFor({ timeout: 10_000 }).catch(() => {});
  await page.keyboard.press('Enter'); // the SMILES put right
  await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 10_000 }).catch(() => {});
  await page.mouse.click(600, 400);
  await page.keyboard.press('Escape');
  check((await drawnSmiles()) === canonical('O=[N+]([O-])c1ccccc1'), `Name / SMILES: N[+] and O[-] put right to [N+], [O-]: nitrobenzene (${await drawnSmiles()})`);
  await page.mouse.move(700, 600);
  await page.keyboard.press('Escape');

  // --- an element key over the canvas: the bond tool draws that element ---
  await clear();
  await state(() => olomol.change((doc) => {
    const id = doc.nextId++;
    doc.atoms.set(id, { id, el: 'C', x: (500 - olomol.view.tx) / olomol.view.scale, y: (420 - olomol.view.ty) / olomol.view.scale, charge: 0, isotope: null, radical: 0, hCount: null, lonePairs: null, color: null, alias: null });
  }));
  await page.mouse.move(700, 420);
  await page.keyboard.press('n');
  await page.mouse.click(700, 420);
  const drawnN = await state(() => [olomol.tool.el, [...olomol.doc.atoms.values()].map((a) => a.el).join()]);
  // a click on the C makes it N, Shift+click on it bonds a new N
  const firstAtom = await state(() => { const a = [...olomol.doc.atoms.values()][0]; return [a.x, a.y]; });
  await clickAt(firstAtom);
  const replaced = await state(() => [...olomol.doc.atoms.values()].map((a) => a.el).join());
  await page.keyboard.down('Shift');
  await clickAt(firstAtom);
  await page.keyboard.up('Shift');
  const attached = await state(() => [...olomol.doc.atoms.values()].map((a) => a.el).join());
  await page.mouse.move(5, 450);
  await page.keyboard.press('c');
  const backToC = await state(() => `${olomol.tool.el}${document.querySelector('.dock .btn.el.on')?.textContent}`);
  check(drawnN[0] === 'N' && drawnN[1] === 'C,N' && replaced === 'N,N' && attached === 'N,N,N' && backToC === 'CC',
    `N over the canvas: a click on the empty canvas an N on its own (${drawnN[1]}), a click on the C replaces (${replaced}), Shift+click attaches (${attached}); C: carbon again, lit in the bottom bar (${backToC})`);
  await page.keyboard.press('f');
  const fluorine = await state(() => olomol.tool.el);
  await page.keyboard.press('Shift+A');
  const fishhook = await state(() => `${olomol.tool.name}${olomol.tool.electrons}`);
  check(fluorine === 'F' && fishhook === 'curve1', `F over the canvas draws fluorine (${fluorine}); Shift+A is the fishhook arrow (${fishhook})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // --- the chain tool's click on a bond: as the single bond tool's, the bond stays a bond ---
  {
    await clear();
    await paste('CC');
    const bond = await state(() => [...olomol.doc.bonds.keys()][0]);
    const at = await state((id) => { const b = olomol.doc.bonds.get(id); const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)]; const { scale, tx, ty } = olomol.view; return [(p.x + q.x) / 2 * scale + tx, (p.y + q.y) / 2 * scale + ty]; }, bond);
    await state(() => olomol.setTool({ name: 'chain' }));
    await page.mouse.click(...at);
    await page.waitForTimeout(100);
    const order = await state((id) => olomol.doc.bonds.get(id).order, bond);
    check(order === 2 && (await drawnSmiles()) === canonical('C=C'), `the chain tool's click on a bond makes it double, as the bond tool's (order ${order})`);
    await state(() => olomol.setTool({ name: 'select' }));
  }

  // --- D: the dative bond tool, again the hydrogen bond, again the partial bond, then dative again; over a bond the same on it ---
  {
    await clear();
    await page.mouse.move(700, 450);
    const kinds = [];
    for (let k = 0; k < 4; k++) {
      await page.keyboard.press('d');
      kinds.push(await state(() => olomol.tool.kind));
    }
    await paste('CC');
    await state(() => olomol.setTool({ name: 'select' }));
    const middle = await bondMiddle(await state(() => [...olomol.doc.bonds.keys()][0]));
    const [mx, my] = await screen(middle);
    await page.mouse.move(mx, my);
    const onBond = [];
    for (let k = 0; k < 4; k++) {
      await page.keyboard.press('d');
      onBond.push(await state(() => [...olomol.doc.bonds.values()][0].kind));
    }
    check(kinds.join() === 'dative,hbond,partial,dative' && onBond.join() === 'dative,hbond,partial,dative',
      `D: the tool ${kinds.join(' → ')}, over a bond ${onBond.join(' → ')} (dative → hbond → partial → dative)`);
  }

  // --- aromatize ---
  await clear();
  await paste('OC(=O)c1ccccc1.CC(=O)[O-]');
  await state(() => olomol.selectAll());
  await page.locator('.inspector').getByRole('button', { name: 'Aromatize' }).click();
  await page.waitForFunction(() => olomol.scene.circles.length === 1, null, { timeout: 20_000 }).catch(() => {});
  const aromatic = await state(() => ({
    circles: olomol.scene.circles.length,
    dashed: [...olomol.scene.bonds.values()].filter((b) => b.shapes.dashed).length,
    partial: [...olomol.scene.atoms.values()].filter((a) => a.label?.runs.some((r) => r.text.startsWith('δ'))).length,
  }));
  check(aromatic.circles === 1 && aromatic.dashed === 2 && aromatic.partial === 2, `aromatize: a circle in benzene, acetate's C–O bonds dashed with δ− (${JSON.stringify(aromatic)})`);
  check((await drawnSmiles()) === canonical('OC(=O)c1ccccc1.CC(=O)[O-]'), 'aromatized: files still hold the same molecules');
  await page.locator('.inspector').getByRole('button', { name: 'Kekulé' }).click();
  check((await state(() => olomol.scene.circles.length + [...olomol.doc.bonds.values()].filter((b) => b.delocalized).length)) === 0, 'Kekulé: single and double bonds again');

  // --- pulling a bond onto an atom; keeping molecules together; colours; Cl=O ---
  await clear();
  await paste('[C-]#N');
  await state(() => olomol.change((doc) => window.olomolTest.addAtom(doc, -1.5, 3, 'Fe')));
  const [carbon, iron] = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.el !== 'N').map((a) => [a.x, a.y]));
  await state(() => olomol.setTool({ name: 'bond', order: 1, stereo: '', kind: 'dative' }));
  {
    const [x1, y1] = await screen(carbon);
    const [x2, y2] = await screen(iron);
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 8 });
    const during = await state(() => olomol.doc.atoms.size);
    await page.mouse.up();
    const after = await state(() => [...olomol.doc.bonds.values()].map((b) => b.kind ?? 'plain').sort().join());
    check(during === 3 && after === 'dative,plain', `a bond pulled onto an atom goes to it, no CH3 drawn over it meanwhile (${during} atoms; ${after})`);
  }
  // an atom dragged onto another snaps onto it and shows joined until let go
  await clear();
  await paste('CCC');
  await state(() => olomol.change((doc) => window.olomolTest.addAtom(doc, 0, 3, 'O')));
  await state(() => { olomol.clearSelection(); olomol.setTool({ name: 'select' }); });
  {
    const [oxygen, middle] = await state(() => { const a = [...olomol.doc.atoms.values()]; return [[a[3].x, a[3].y], [a[1].x, a[1].y]]; });
    const [x1, y1] = await screen(oxygen);
    const [x2, y2] = await screen(middle);
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2 + 5, y2 + 4, { steps: 8 });
    const snapped = await state(() => olomol.doc.atoms.size);
    await page.mouse.move(x2 + 90, y2 + 60, { steps: 4 });
    const loose = await state(() => olomol.doc.atoms.size);
    await page.mouse.move(x2 + 4, y2 - 3, { steps: 6 });
    await page.mouse.up();
    check(snapped === 3 && loose === 4 && (await state(() => olomol.doc.atoms.size)) === 3, `an atom dragged onto another snaps and shows joined, comes back when dragged on (${snapped}, ${loose})`);
  }
  await clear();
  await paste('[K+].[K+].F[Si-2](F)(F)(F)(F)F');
  await paste('CCO');
  await state(() => olomol.select([...olomol.doc.atoms.keys()].filter((id) => ['K', 'Si', 'F'].includes(olomol.doc.atoms.get(id).el))));
  await page.getByTestId('keep-together').click();
  const together = await page.getByTestId('formula').textContent();
  // the salt's shape: where the K and Si are from each other
  const salt = () => state(() => {
    const [first, ...rest] = [...olomol.doc.atoms.values()].filter((a) => ['K', 'Si'].includes(a.el));
    return rest.map((a) => `${(a.x - first.x).toFixed(2)},${(a.y - first.y).toFixed(2)}`).join(' ');
  });
  const saltBefore = await salt();
  await state(() => olomol.selectAll());
  await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
  await page.getByRole('button', { name: 'Arrange in a grid' }).click();
  await page.keyboard.press('Escape');
  const saltAfter = await salt();
  check(together.startsWith('F6K2Si') && saltAfter === saltBefore, `One compound: K⁺, K⁺ and SiF₆²⁻ are one molecule (${together}) and stay together in a grid (${saltBefore} | ${saltAfter})`);
  await state(() => olomol.setTool({ name: 'select' }));
  await page.getByTestId('tool-paint').click();
  await page.getByTestId('tool-paint').click();
  await page.locator('.flyout .btn').last().click();
  await page.getByTestId('colour-code').fill('#c05');
  await page.keyboard.press('Enter');
  const picked = await state(() => olomol.tool);
  check(picked.name === 'paint' && picked.color === '#cc0055', `the rainbow colour: a colour code typed (#c05) paints with ${picked.color}`);
  await page.getByTestId('tool-paint').click();
  const remembered = await page.locator('.flyout .btn').count();
  await page.keyboard.press('Escape');
  check(remembered === 12, `the colour used is offered again among the paint colours (${remembered} buttons)`);
  await page.getByTestId('tool-highlight').click();
  await page.getByTestId('tool-highlight').click();
  await page.locator('.flyout .btn').nth(-2).click();
  await page.getByTestId('colour-code').fill('#a0e0ff');
  await page.keyboard.press('Enter');
  const marker = await state(() => olomol.tool);
  check(marker.name === 'highlight' && marker.color === '#a0e0ff', `the highlighter's rainbow: any colour for highlights and ring fills (${marker.color})`);
  // R/S and E/Z for the atoms and bonds chosen, also in an exported picture
  await state(() => olomol.setTool({ name: 'select' }));
  await clear();
  await paste('C[C@H](N)C(=O)O');
  await state(() => olomol.selectAll());
  await page.getByTestId('cip-labels').check();
  await page.waitForFunction(() => olomol.scene.stereo.length > 0, null, { timeout: 15_000 }).catch(() => {});
  const labelled = await state(() => olomol.scene.stereo.map((m) => m.text).join());
  await state(() => olomol.clearSelection());
  const labelledSvg = (await exportFile('SVG')).toString();
  check(labelled === '(S)' && labelledSvg.includes('>(S)<'), `R/S ticked for a molecule: L-alanine's (S) beside it and in the SVG export (${labelled})`);

  // Λ and Δ: [Co(en)3]3+ drawn as an octahedron (two donors in front, wedged, two behind, hashed), its label
  // beside the metal; the mirror image (wedges and hashes swapped) the other one; Flip left–right (the same
  // compound turned over), Redraw and Turn in 3D keep it
  {
    await state(() => olomol.setTool({ name: 'select' }));
    await clear();
    await state(() => olomol.change((doc) => {
      const { addAtom, addBond } = window.olomolTest;
      const co = addAtom(doc, 0, 0, 'Co', { charge: 3 });
      const at = { up: [0, -1.5], down: [0, 1.5], leftFront: [-1.1, 0.55], rightFront: [0.9, 0.75], leftBack: [-0.9, -0.75], rightBack: [1.1, -0.55] };
      const depth = { up: '', down: '', leftFront: 'wedge', rightFront: 'wedge', leftBack: 'hash', rightBack: 'hash' };
      const ids = {};
      for (const place of Object.keys(at)) {
        ids[place] = addAtom(doc, at[place][0], at[place][1], 'N').id;
        addBond(doc, ids[place], co.id, 1, { kind: 'dative', stereo: depth[place] });
      }
      for (const [p, q] of [['up', 'leftBack'], ['leftFront', 'down'], ['rightBack', 'rightFront']]) {
        const [a, b] = [doc.atoms.get(ids[p]), doc.atoms.get(ids[q])];
        const out = [(a.x + b.x) * 0.75, (a.y + b.y) * 0.75];
        const c1 = addAtom(doc, out[0] + (a.x - b.x) * 0.25, out[1] + (a.y - b.y) * 0.25);
        const c2 = addAtom(doc, out[0] - (a.x - b.x) * 0.25, out[1] - (a.y - b.y) * 0.25);
        addBond(doc, ids[p], c1.id);
        addBond(doc, c1.id, c2.id);
        addBond(doc, c2.id, ids[q]);
      }
    }));
    await state(() => olomol.selectAll());
    await page.getByTestId('cip-labels').check();
    // (the labels are worked out again after a change, a moment later: `was` waited out, briefly, in case it changes)
    const handed = async (was = null) => {
      await page.waitForFunction((was) => olomol.scene.stereo.some((m) => /[ΛΔ]/.test(m.text) && m.text !== was), was, { timeout: was ? 3000 : 15_000 }).catch(() => {});
      return state(() => olomol.scene.stereo.map((m) => m.text).filter((text) => /[ΛΔ]/.test(text)).join());
    };
    const first = await handed();
    await state(() => olomol.change((doc) => {
      for (const b of doc.bonds.values()) if (b.stereo === 'wedge' || b.stereo === 'hash') b.stereo = b.stereo === 'wedge' ? 'hash' : 'wedge';
    }));
    const mirrored = await handed(first);
    await state(() => olomol.undo());
    await state(() => olomol.selectAll());
    await page.getByTitle('Flip left–right (selection, or everything)').click();
    await page.waitForTimeout(300);
    const flipped = await handed(first);
    check(['(Λ)', '(Δ)'].includes(first) && ['(Λ)', '(Δ)'].includes(mirrored) && mirrored !== first && flipped === first,
      `Λ/Δ ticked for [Co(en)3]3+: ${first} beside the cobalt, its mirror image ${mirrored}, flipped left–right still ${flipped}`);
    // Redraw: every drawing offered keeps it (those that would lose it are dropped), each taken in turn
    const redrawn = [];
    let offered = 1;
    for (let k = 0; k < offered; k++) {
      await state(() => olomol.selectAll());
      await page.getByTestId('relayout').click();
      await page.getByTestId('layout-card').first().waitFor({ timeout: 60_000 });
      await layoutDone();
      offered = await page.getByTestId('layout-card').count();
      await page.getByTestId('layout-card').nth(k).click();
      await page.waitForTimeout(300);
      redrawn.push(await handed(first));
      await state(() => olomol.undo());
    }
    // Turn in 3D: the view taken keeps it
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    const warned = await page.getByTestId('turn3d-warning').count();
    await page.getByTestId('turn3d-use').click();
    await page.waitForTimeout(300);
    const turned = await handed(first);
    check(offered > 0 && redrawn.every((label) => label === first) && !warned && turned === first,
      `Λ/Δ kept: by each drawing Redraw offers (${redrawn.join(' ')}) and Turn in 3D's first view (${turned}${warned ? ', warned' : ''})`);
    await page.getByTestId('cip-labels').uncheck().catch(() => {});
  }
  await state(() => olomol.setTool({ name: 'select' }));
  await clear();
  await paste('Cl(=O)(=O)(=O)[O-]');
  const perchlorate = await state(() => [...olomol.doc.atoms.values()].map((a) => `${a.el}${a.charge || ''}`).sort().join());
  check(perchlorate === 'Cl,O,O,O,O-1', `ClO4⁻ with Cl=O bonds is drawn as written, not as Cl3+ and four O⁻ (${perchlorate})`);

  // --- a chain grown by clicks: across the page; Shift: the other side ---
  {
    await clear();
    await tool('bond').click();
    await page.mouse.click(500, 450); // ethane, 30° up to the right
    const [c1, c2] = await state(() => [...olomol.doc.atoms.keys()]);
    const angleTo = (from, to) => state(([from, to]) => {
      const [a, b] = [olomol.doc.atoms.get(from), olomol.doc.atoms.get(to)];
      return Math.round(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
    }, [from, to]);
    const newest = () => state(() => [...olomol.doc.atoms.keys()].at(-1));
    const ethane = await angleTo(c1, c2);
    await clickAt(await atomXY(c2));
    const plain = await angleTo(c2, await newest());
    await state(() => olomol.undo());
    // Shift held over the end: the bond it would add, see-through, on the other side
    const [x, y] = await screen(await atomXY(c2));
    await page.mouse.move(x, y);
    await page.keyboard.down('Shift');
    await page.waitForTimeout(100);
    const shown = await state(() => {
      const [x1, y1, x2, y2] = olomol.preview?.lines?.[0] ?? [];
      return x1 === undefined ? null : Math.round(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI);
    });
    await page.mouse.click(x, y);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(80);
    const shifted = await angleTo(c2, await newest());
    const atoms = (await counts()).atoms;
    // the chain tool: dragged from the end to the right, the zigzag starts the other way with Shift
    await state(() => olomol.undo());
    await state(() => olomol.setTool({ name: 'chain' }));
    const start = await atomXY(c2);
    const firstOf = async (shift) => {
      if (shift) await page.keyboard.down('Shift');
      await dragBetween(start, [start[0] + 3.5, start[1]]);
      if (shift) await page.keyboard.up('Shift');
      const atom = await state(() => [...olomol.doc.atoms.keys()][2]);
      const angle = await angleTo(c2, atom);
      await state(() => olomol.undo());
      return { angle };
    };
    const chainPlain = await firstOf(false);
    const chainShifted = await firstOf(true);
    check(ethane === -30 && plain === 30 && shown === -90 && shifted === -90 && atoms === 3 && chainPlain.angle !== chainShifted.angle,
      `ethane's end clicked: propane zigzag across the page (${ethane}° then ${plain}°); Shift: the other side, shown while held (${shown}°) and drawn (${shifted}°, ${atoms} atoms); the chain tool's zigzag the other way with Shift (${chainPlain.angle}° → ${chainShifted.angle}°)`);
    await state(() => olomol.setTool({ name: 'select' }));
  }

  // --- a double bond's second line: the panel's button moves it on from where it is drawn ---
  {
    await clear();
    await tool('bond').click();
    await page.mouse.click(600, 450);
    const [c1, c2] = await state(() => [...olomol.doc.atoms.keys()]);
    await clickAt(await atomXY(c2)); // propene: a chain of three
    const double = await state(([a, b]) => [...olomol.doc.bonds.values()].find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)).id, [c1, c2]);
    await clickAt(await bondMiddle(double)); // single to double
    await state((id) => { olomol.setTool({ name: 'select' }); olomol.select([id]); }, double);
    const drawn = () => state((id) => olomol.scene.bonds.get(id).side, double);
    const seen = [await drawn()];
    for (let k = 0; k < 3; k++) {
      await page.getByTestId('second-line').click();
      seen.push(await drawn());
    }
    const auto = await page.getByTestId('second-line-auto').isVisible();
    await page.getByTestId('second-line-auto').click();
    const back = await state((id) => [olomol.doc.bonds.get(id).side ?? null, olomol.scene.bonds.get(id).side], double);
    const changes = seen.slice(1).every((side, k) => side !== seen[k]);
    check(changes && new Set(seen.slice(1)).size === 3 && seen[3] === seen[0] && auto && back[0] === null && back[1] === seen[0],
      `a double bond's second line: each click of the panel's button moves it (${seen.join(' → ')}), through all three places; Auto back to the program's choice (${back[1]})`);
    await state(() => olomol.setTool({ name: 'select' }));
  }
}
