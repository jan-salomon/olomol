// The browser check: one thing done from different places, or with other things in the drawing, comes out the
// same: the rail's buttons and the keys over a selection as the panel, Align over brackets and curved arrows,
// what a drop, Draw out or Abbreviate leaves of what was on an atom, turning and flipping brackets and texts.
// Run alone: npm run check -- --only consistency [url]

import {
  check, clear, clickAt, dragBetween, page, paste, screen, state, tool,
} from './harness.mjs';
// (its parts, in the order run:)
//   a drop that joins atoms, with a curved arrow on the bond that goes: the drawing stays, the arrow on the bond there
//   exporting only a curved arrow selected without its molecules: no failure
//   resonance forms in a box bracket: a double click on one leaves the bracket; the lasso takes it; Align middle
//   over the forms (the bracket not selected) lines them up
//   HO⁻ + CH3Br with the SN2 arrow: Align reaction scheme keeps the + between them
//   Carbons → line with All C in Settings: the chain ends too
//   a bond clicked, then 1: a wedge; 2 on a hydrogen bond: a plain double bond
//   the rail's + and single bond, element keys, the bottom bar's N and . over a selection: on all of it
//   a charge key after a δ: the δ gone; up to 8+
//   Del with the pointer on a side arc: the arc, not its arrow
//   an arrow key on a compound number: off its anchor, moved
//   the panel: Lone pairs lit for ethanol's; Order and 2nd line for an aromatic bond; Stereo on a dashed bond
//   a text made bold opens bold in the text field
//   turning a box bracket by 45°, a text left by Flip, a Fischer projection, Make bond horizontal with a bracket
//   a Newman projection's bond seen end on, clicked with the double bond tool: single
//   a bracket made round a molecule, then an atom drawn on, copied and pasted: round all of it
//   Draw out and Abbreviate keep what was on the molecule; an arrow's typed length; ⊖ in a ring; Other way
export default async function run() {
  const docOf = async (build) => state(build);

  // --- a drop that joins atoms, with a curved arrow on the bond that goes (the page went blank) ---
  await clear();
  await docOf(async () => {
    const { addAtom, addBond, addCurve, emptyDoc } = await import('/src/model/doc.js');
    const doc = emptyDoc();
    const [x, y, z, o] = [addAtom(doc, 0, 0), addAtom(doc, 1.5, 0), addAtom(doc, 1.5, 1.5), addAtom(doc, 4, 0, 'O', { charge: -1, lonePairs: 'auto' })];
    addBond(doc, x.id, y.id, 1);
    const xz = addBond(doc, x.id, z.id, 1);
    addCurve(doc, { atom: o.id }, { bond: xz.id });
    olomol.setDoc(doc);
    olomol.fit(window.innerWidth, window.innerHeight);
    olomol.setTool({ name: 'select' });
  });
  const [zAt, yAt] = await state(() => [...olomol.doc.atoms.values()].slice(1, 3).reverse().map((a) => [a.x, a.y]));
  await dragBetween(zAt, yAt);
  const dropped = await state(() => ({
    atoms: olomol.doc.atoms.size,
    curve: [...olomol.doc.curves.values()].map((c) => c.to.bond !== undefined && olomol.doc.bonds.has(c.to.bond))[0],
    drawn: olomol.scene.curves.size,
    page: document.querySelectorAll('svg').length > 0,
  }));
  check(dropped.atoms === 3 && dropped.curve && dropped.drawn === 1 && dropped.page,
    `an atom dropped onto another, a curved arrow on the bond that goes: the arrow on the bond there, the drawing stays (${JSON.stringify(dropped)})`);

  // --- exporting only a curved arrow, its molecules not selected (Export failed) ---
  const exported = await state(async () => {
    const { svgOf } = await import('/src/io/files.js');
    try {
      return svgOf(olomol.doc, olomol.settings, { ids: [...olomol.doc.curves.keys()] }).startsWith('<svg') || 'no svg';
    } catch (error) {
      return error.message;
    }
  });
  check(exported === true, `exporting only a curved arrow, its molecules not selected: a picture, no failure (${exported})`);

  // --- resonance forms in a box bracket ---
  const resonance = async () => {
    await clear();
    return docOf(async () => {
      const { readMolfile } = await import('/src/io/molfile.js');
      const { smilesToMolfile } = await import('/src/io/rdkit.js');
      const { addArrow, addBracket, copyObjects, emptyDoc } = await import('/src/model/doc.js');
      const doc = emptyDoc();
      const place = async (smiles, x, y) => {
        const part = readMolfile(await smilesToMolfile(smiles)).doc;
        const atoms = [...part.atoms.values()];
        const middle = (key) => (Math.min(...atoms.map((a) => a[key])) + Math.max(...atoms.map((a) => a[key]))) / 2;
        copyObjects(part, [...part.atoms.keys()], x - middle('x'), y - middle('y'), doc);
      };
      await place('CC(C)=[OH+]', 0, 0);
      const arrow = addArrow(doc, 2.5, 0, 5.5, 0, 'resonance').id;
      await place('C[C+](C)O', 8, 0.9);
      const bracket = addBracket(doc, -2.5, -2.5, 10.5, 3).id;
      olomol.setDoc(doc);
      olomol.fit(window.innerWidth, window.innerHeight);
      olomol.setTool({ name: 'select' });
      return { arrow, bracket };
    });
  };
  let ids = await resonance();
  const firstAtom = await state(() => { const a = [...olomol.doc.atoms.values()].find((a) => a.el === 'O'); return [a.x, a.y]; });
  {
    const [x, y] = await screen(firstAtom);
    await page.mouse.dblclick(x, y);
    await page.waitForTimeout(100);
  }
  const doubled = await state((id) => ({ bracket: olomol.selection.has(id), atoms: olomol.selected('atoms').length }), ids.bracket);
  check(!doubled.bracket && doubled.atoms > 0, `a double click on one resonance form in a bracket: the form, not the bracket round both (${JSON.stringify(doubled)})`);
  const lassoed = await state(async (id) => {
    const { idsInPolygon } = await import('/src/editor/hit.js');
    return idsInPolygon(olomol.scene, [[-4, -4], [12, -4], [12, 5], [-4, 5]]).includes(id);
  }, ids.bracket);
  check(lassoed, 'the lasso round a bracket takes it, as a box does');
  const lined = await state(async (arrow) => {
    const { align } = await import('/src/arrange/align.js');
    const { fragments } = await import('/src/model/graph.js');
    olomol.select([...olomol.doc.atoms.keys(), ...olomol.doc.bonds.keys(), arrow]);
    align(olomol, 'middle');
    const middles = fragments(olomol.doc).map((members) => {
      const ys = members.map((id) => olomol.doc.atoms.get(id).y);
      return (Math.min(...ys) + Math.max(...ys)) / 2;
    });
    return { off: Math.abs(middles[0] - middles[1]), notice: olomol.notice?.text ?? '' };
  }, ids.arrow);
  check(lined.off < 0.3 && !/Select at least/.test(lined.notice), `Align middle over resonance forms and their arrow in a bracket (the bracket not selected): lined up (${lined.off.toFixed(2)} apart${lined.notice ? `, "${lined.notice}"` : ''})`);

  // --- HO⁻ + CH3Br with the SN2 arrow: the + stays between them ---
  await clear();
  const sn2 = await docOf(async () => {
    const { readMolfile } = await import('/src/io/molfile.js');
    const { smilesToMolfile } = await import('/src/io/rdkit.js');
    const { addArrow, addCurve, addPlus, copyObjects, emptyDoc } = await import('/src/model/doc.js');
    const { alignReaction } = await import('/src/arrange/align.js');
    const doc = emptyDoc();
    const place = async (smiles, x, y) => {
      const part = readMolfile(await smilesToMolfile(smiles)).doc;
      const atoms = [...part.atoms.values()];
      const middle = (key) => (Math.min(...atoms.map((a) => a[key])) + Math.max(...atoms.map((a) => a[key]))) / 2;
      return copyObjects(part, [...part.atoms.keys()], x - middle('x'), y - middle('y'), doc);
    };
    await place('[OH-]', 0, 0.4);
    const plus = addPlus(doc, 1.5, 0).id;
    await place('CBr', 3.5, -0.3);
    addArrow(doc, 6, 0, 9, 0, 'forward');
    await place('CO', 11, 0);
    const o = [...doc.atoms.values()].find((a) => a.el === 'O' && a.charge === -1);
    const c = [...doc.atoms.values()].find((a) => a.el === 'C' && a.x > 2 && a.x < 5);
    addCurve(doc, { atom: o.id }, { atom: c.id });
    olomol.setDoc(doc);
    olomol.selectAll();
    alignReaction(olomol);
    const xs = (el, test) => [...olomol.doc.atoms.values()].filter((a) => a.el === el && test(a)).map((a) => a.x);
    return { oh: Math.max(...xs('O', (a) => a.charge === -1)), plus: olomol.doc.pluses.get(plus).x, br: Math.min(...xs('Br', () => true), ...xs('C', (a) => a.x < 6)) };
  });
  check(sn2.oh < sn2.plus && sn2.plus < sn2.br, `HO⁻ + CH3Br with the SN2 arrow, Align reaction scheme: the + still between them (${sn2.oh.toFixed(1)} < ${sn2.plus.toFixed(1)} < ${sn2.br.toFixed(1)})`);

  // --- Carbons → line with All C in Settings: the chain ends too ---
  await clear();
  await paste('CCCC');
  const lineEnds = await state(async () => {
    olomol.setSettings({ ...olomol.settings, allCarbons: true });
    olomol.selectAll();
    return null;
  });
  await page.locator('.inspector .row').filter({ has: page.locator('.name', { hasText: /^Carbons$/ }) }).getByRole('button', { name: 'line', exact: true }).click();
  const labelled = await state(() => {
    const n = [...olomol.scene.atoms.values()].filter((info) => info.label).length;
    olomol.setSettings({ ...olomol.settings, allCarbons: false });
    return n;
  });
  check(lineEnds === null && labelled === 0, `Carbons → line with All C set in Settings: no C written, the chain ends too (${labelled} written)`);

  // --- a bond clicked, then 1: a wedge; 2 on a hydrogen bond: a plain double bond ---
  await clear();
  await paste('CC(C)O');
  const bondOf = () => state(() => {
    const b = [...olomol.doc.bonds.values()].find((x) => olomol.doc.atoms.get(x.a).el === 'C' && olomol.doc.atoms.get(x.b).el === 'C');
    const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
    return { id: b.id, at: [(p.x + q.x) / 2, (p.y + q.y) / 2] };
  });
  let bond = await bondOf();
  await clickAt(bond.at);
  await page.keyboard.press('1');
  const wedged = await state((id) => olomol.doc.bonds.get(id).stereo, bond.id);
  await state((id) => olomol.change((doc) => Object.assign(doc.bonds.get(id), { kind: 'hbond', stereo: '' })), bond.id);
  await page.keyboard.press('2');
  const hDouble = await state((id) => ({ order: olomol.doc.bonds.get(id).order, kind: olomol.doc.bonds.get(id).kind ?? null }), bond.id);
  check(wedged === 'wedge' && hDouble.order === 2 && hDouble.kind === null, `a bond clicked, then 1: a wedge (${wedged}); 2 on a hydrogen bond: a plain double bond (${JSON.stringify(hDouble)})`);

  // --- the rail's buttons, element keys, the bottom bar's elements and . over a selection ---
  await clear();
  await paste('CC(C)C');
  await state(() => olomol.select([...olomol.doc.atoms.keys()].slice(1, 3)));
  await tool('charge').click();
  const charged = await state(() => [...olomol.doc.atoms.values()].map((a) => a.charge));
  await state(() => olomol.change((doc) => { for (const b of doc.bonds.values()) b.order = 2; }));
  await state(() => { olomol.setTool({ name: 'select' }); olomol.select([[...olomol.doc.bonds.keys()][0]]); });
  await tool('bond').click();
  const single = await state(() => olomol.doc.bonds.get([...olomol.doc.bonds.keys()][0]).order);
  check(charged.filter((c) => c === 1).length === 2 && single === 1,
    `the rail's + over two selected atoms charges both (${charged.join(',')}); its single bond over a selected double bond makes it single (${single})`);
  await state(() => { olomol.setTool({ name: 'select' }); olomol.select([...olomol.doc.atoms.keys()].slice(0, 3)); });
  const third = await state(() => { const a = [...olomol.doc.atoms.values()][2]; return [a.x, a.y]; });
  {
    const [x, y] = await screen(third);
    await page.mouse.move(x, y);
    await page.keyboard.press('n');
    await page.waitForTimeout(60);
  }
  const nitrogens = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.el === 'N').length);
  await state(() => olomol.select([[...olomol.doc.atoms.keys()][3]]));
  await page.locator('.dock button.el', { hasText: /^O$/ }).click();
  await page.mouse.move(5, 300);
  await state(() => { olomol.setTool({ name: 'select' }); olomol.select([...olomol.doc.atoms.keys()].slice(0, 2)); });
  await page.keyboard.press('.');
  const after = await state(() => ({ o: [...olomol.doc.atoms.values()].filter((a) => a.el === 'O').length, radicals: [...olomol.doc.atoms.values()].filter((a) => a.radical).length }));
  check(nitrogens === 3 && after.o === 1 && after.radicals === 2,
    `N over one of three selected atoms: all three N (${nitrogens}); the bottom bar's O with an atom selected: that atom O (${after.o}); . over two selected atoms: both unpaired (${after.radicals})`);
  await state(() => olomol.setTool({ name: 'bond', order: 1, stereo: '' }));
  await page.locator('.dock button.el', { hasText: /^N$/ }).click();
  await state(() => olomol.clearSelection());
  await page.mouse.move(5, 300);
  await page.keyboard.press('2');
  const kept = await state(() => ({ name: olomol.tool.name, order: olomol.tool.order, el: olomol.tool.el ?? null }));
  check(kept.name === 'bond' && kept.order === 2 && kept.el === 'N', `N from the bottom bar, then 2: a double bond to N, as after N's key (${JSON.stringify(kept)})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // --- a whole molecule selected (as Paste leaves it): the rail's bond and the bottom bar's N only pick the tool ---
  await clear();
  await paste('CC=O');
  await state(() => olomol.selectAll());
  await tool('bond').click();
  await page.locator('.dock button.el', { hasText: /^N$/ }).click();
  const untouched = await state(() => ({ double: [...olomol.doc.bonds.values()].some((b) => b.order === 2), n: [...olomol.doc.atoms.values()].some((a) => a.el === 'N'), tool: olomol.tool.name }));
  check(untouched.double && !untouched.n && untouched.tool === 'atom', `a whole molecule selected, the rail's single bond and then N: the tools picked, the molecule as it was (${JSON.stringify(untouched)})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // --- a charge key after a δ: the δ gone; up to 8+ ---
  await clear();
  await paste('O');
  await state(() => olomol.change((doc) => { [...doc.atoms.values()][0].partialCharge = 1; }));
  await state(() => olomol.select([...olomol.doc.atoms.keys()]));
  await page.mouse.move(5, 300);
  await page.keyboard.press('+');
  await page.keyboard.press('-');
  const delta = await state(() => [...olomol.doc.atoms.values()][0].partialCharge ?? null);
  for (let k = 0; k < 7; k++) await page.keyboard.press('+');
  const high = await state(() => [...olomol.doc.atoms.values()][0].charge);
  check(delta === null && high === 7, `a δ+, then + and −: the δ gone, not back (${delta}); the keys go past 4+, as the panel does (${high})`);

  // --- Del with the pointer on a side arc: the arc, not its arrow ---
  await clear();
  const arc = await docOf(async () => {
    const { addArrow, emptyDoc } = await import('/src/model/doc.js');
    const doc = emptyDoc();
    const arrow = addArrow(doc, 0, 0, 4, 0, 'forward');
    arrow.sides = [{ id: doc.nextId++, side: 'above', way: 'in', reach: 1 }];
    olomol.setDoc(doc);
    olomol.fit(window.innerWidth, window.innerHeight);
    return { arrow: arrow.id, arc: arrow.sides[0].id };
  });
  await state((a) => { olomol.clearSelection(); olomol.hover = { kind: 'arrow', id: a.arrow, arc: 'above-in', arcId: a.arc }; }, arc);
  await page.keyboard.press('Delete');
  const arcGone = await state((id) => ({ arrow: olomol.doc.arrows.has(id), arcs: olomol.doc.arrows.get(id)?.sides?.length ?? 0 }), arc.arrow);
  check(arcGone.arrow && arcGone.arcs === 0, `Del with the pointer on a side arc: the arc goes, its arrow stays (${JSON.stringify(arcGone)})`);

  // --- an arrow key on a compound number: off its anchor, moved ---
  await clear();
  await paste('CCO');
  const number = await state(() => {
    olomol.change((doc) => {
      const id = doc.nextId++;
      const first = [...doc.atoms.keys()][0];
      doc.texts.set(id, { id, x: 0, y: 0, text: '1', color: null, anchor: first, slot: 'below' });
    });
    const id = Math.max(...olomol.doc.texts.keys());
    olomol.select([id]);
    return { id, x: olomol.scene.texts.get(id).at[0] };
  });
  await page.mouse.move(5, 300);
  await page.keyboard.press('ArrowRight');
  const nudged = await state((id) => ({ anchor: olomol.doc.texts.get(id).anchor ?? null, x: olomol.scene.texts.get(id).at[0] }), number.id);
  check(nudged.anchor === null && Math.abs(nudged.x - number.x - 0.1) < 1e-6, `→ on a compound number: off its anchor, 0.1 to the right (${JSON.stringify(nudged)} from ${number.x.toFixed(2)})`);

  // --- the panel: Lone pairs lit for ethanol's; Order and 2nd line for an aromatic bond; Stereo on a dashed bond ---
  await clear();
  await paste('CCO');
  await state(() => olomol.selectAll());
  const lonePairs = page.locator('.inspector .row').filter({ has: page.locator('.name', { hasText: /^Lone pairs$/ }) });
  await lonePairs.getByRole('button', { name: 'shown', exact: true }).click();
  const lit = await lonePairs.locator('button.on, button[aria-pressed=true]').textContent().catch(() => '');
  check(lit === 'shown', `ethanol's lone pairs shown from the panel: "shown" lit ("${lit}")`);
  await clear();
  await paste('c1ccccc1');
  const aromatic = await state(async () => {
    const { aromatize } = await import('/src/editor/aromatic.js');
    olomol.selectAll();
    await aromatize(olomol);
    const bond = [...olomol.doc.bonds.values()].find((b) => b.delocalized && b.order === 2);
    olomol.select([bond.id]);
    return null;
  });
  const orderLit = await page.locator('.inspector .row').filter({ has: page.locator('.name', { hasText: /^Order$/ }) }).locator('button.on').count();
  const secondLine = await page.getByTestId('second-line').count();
  check(aromatic === null && orderLit === 0 && secondLine === 0, `an aromatic bond: no order lit (${orderLit}), no 2nd line to move (${secondLine})`);
  await clear();
  await paste('CC');
  await state(() => {
    olomol.change((doc) => Object.assign([...doc.bonds.values()][0], { kind: 'partial' }));
    olomol.select([...olomol.doc.bonds.keys()]);
  });
  await page.locator('.inspector .row').filter({ has: page.locator('.name', { hasText: /^Stereo$/ }) }).getByRole('button', { name: '▲', exact: true }).click();
  const wedge = await state(() => { const b = [...olomol.doc.bonds.values()][0]; return { stereo: b.stereo, kind: b.kind ?? null }; });
  check(wedge.stereo === 'wedge' && wedge.kind === null, `▲ on a dashed (partial) bond: a wedge drawn, the bond a plain one (${JSON.stringify(wedge)})`);

  // --- a text made bold opens bold in the text field ---
  await clear();
  const bolded = await state(async () => {
    const { editText } = await import('/src/editor/tools.js');
    olomol.change((doc) => {
      const id = doc.nextId++;
      doc.texts.set(id, { id, x: 0, y: 0, text: 'rt\n24 h', color: null, bold: true });
    });
    editText(olomol, [...olomol.doc.texts.values()][0]);
    const value = olomol.editing.value;
    olomol.editing = null;
    return value;
  });
  check(bolded === '*{rt}\n*{24 h}', `a text made bold from the panel opens bold in the field, where B can take it off (${JSON.stringify(bolded)})`);

  // --- turning a box bracket by 45° with the handle: upright round what turned, not a line ---
  ids = await resonance();
  await state(() => olomol.selectAll());
  const handle = await state(async () => {
    const { rotationHandle } = await import('/src/editor/tools.js');
    const h = rotationHandle(olomol);
    const [cx, cy] = h.centre;
    const [px, py] = h.point;
    const t = Math.PI / 4;
    return { from: h.point, to: [cx + (px - cx) * Math.cos(t) - (py - cy) * Math.sin(t), cy + (px - cx) * Math.sin(t) + (py - cy) * Math.cos(t)] };
  });
  await dragBetween(handle.from, handle.to);
  const turned = await state((id) => { const b = olomol.doc.brackets.get(id); return { w: Math.abs(b.x2 - b.x1), h: Math.abs(b.y2 - b.y1) }; }, ids.bracket);
  check(turned.w > 5 && turned.h > 5, `a box bracket turned by 45° with what is in it: upright round it, not flat (${turned.w.toFixed(1)} × ${turned.h.toFixed(1)})`);

  // --- flipping: a text stays where it is (no one flips a text); a Fischer projection said to be the mirror image;
  // written sides swapped ---
  await clear();
  await paste('OCC(O)C=O');
  const flipped = await state(async () => {
    const { flip } = await import('/src/arrange/align.js');
    olomol.change((doc) => {
      const id = doc.nextId++;
      doc.texts.set(id, { id, x: 3, y: 0, text: 'rt, 24 h', color: null });
      const o = [...doc.atoms.values()].find((a) => a.el === 'O');
      Object.assign(o, { hSide: 'left' });
      [...doc.atoms.values()].find((a) => a.el === 'C').projection = 'fischer';
    });
    const id = Math.max(...olomol.doc.texts.keys());
    const at = () => [olomol.doc.texts.get(id).x, olomol.doc.texts.get(id).y].join();
    const before = at();
    olomol.selectAll();
    flip(olomol, true);
    const result = { stays: at() === before, side: [...olomol.doc.atoms.values()].find((a) => a.el === 'O').hSide, notice: olomol.notice?.text ?? '' };
    olomol.select([id]);
    flip(olomol, true);
    return { ...result, alone: at() === before, said: olomol.notice?.text ?? '' };
  });
  check(flipped.stays && flipped.alone && /Texts aren/.test(flipped.said) && flipped.side === 'right' && /mirror image/.test(flipped.notice),
    `Flip left–right: a text stays where it is, with the molecule (${flipped.stays}) and alone, said (${flipped.alone}, "${flipped.said}"); an OH written on the left now on the right (${flipped.side}); a Fischer projection said to be its mirror image ("${flipped.notice}")`);

  // --- Make bond horizontal with a box bracket round the molecule: the bracket turns with it ---
  await clear();
  await paste('CCCCC');
  const snapped = await state(async () => {
    const { snapBond } = await import('/src/arrange/align.js');
    const { addBracket } = await import('/src/model/doc.js');
    const atoms = [...olomol.doc.atoms.values()];
    const [xs, ys] = [atoms.map((a) => a.x), atoms.map((a) => a.y)];
    olomol.change((doc) => addBracket(doc, Math.min(...xs) - 0.5, Math.min(...ys) - 0.5, Math.max(...xs) + 0.5, Math.max(...ys) + 0.5));
    olomol.clearSelection();
    snapBond(olomol, [...olomol.doc.bonds.keys()][0]);
    snapBond(olomol, [...olomol.doc.bonds.keys()][0]);
    const b = [...olomol.doc.brackets.values()][0];
    const moved = [...olomol.doc.atoms.values()];
    return moved.every((a) => a.x > Math.min(b.x1, b.x2) && a.x < Math.max(b.x1, b.x2) && a.y > Math.min(b.y1, b.y2) && a.y < Math.max(b.y1, b.y2));
  });
  check(snapped, 'a chain in a box bracket turned by Make bond horizontal/vertical: still inside its bracket');

  // --- a Newman projection's bond seen end on, clicked with the double bond tool: single ---
  await clear();
  const newman = await state(async () => {
    const { addAtom, addBond, emptyDoc } = await import('/src/model/doc.js');
    const doc = emptyDoc();
    const [a, b] = [addAtom(doc, 0, 0), addAtom(doc, 0, 0)];
    const axle = addBond(doc, a.id, b.id, 1, { newman: true });
    for (const k of [0, 1, 2]) addBond(doc, a.id, addAtom(doc, Math.cos(k * 2.09), Math.sin(k * 2.09)).id, 1);
    for (const k of [0, 1, 2]) addBond(doc, b.id, addAtom(doc, Math.cos(k * 2.09 + 1), Math.sin(k * 2.09 + 1)).id, 1);
    olomol.setDoc(doc);
    const { isEndOn } = await import('/src/chem/newman.js');
    olomol.setTool({ name: 'bond', order: 2, stereo: '' });
    const { TOOLS } = await import('/src/editor/tools.js');
    TOOLS.bond.click(olomol, { start: [0, 0], point: [0, 0], hit: { kind: 'bond', id: axle.id } });
    olomol.setTool({ name: 'select' });
    return { endOn: isEndOn(olomol.doc, olomol.doc.bonds.get(axle.id)), order: olomol.doc.bonds.get(axle.id).order };
  });
  check(newman.order === 1, `a Newman projection's bond seen end on, clicked with the double bond tool: stays single (${JSON.stringify(newman)})`);

  // --- a bracket made round a molecule, an atom drawn on after, copied and pasted: round all of it ---
  await clear();
  await paste('CCO');
  const pasted = await state(async () => {
    const { bracketAtoms } = await import('/src/editor/tools.js');
    const { addAtom, addBond, bracketMembers, copyObjects } = await import('/src/model/doc.js');
    bracketAtoms(olomol, [...olomol.doc.atoms.keys()]);
    olomol.change((doc) => {
      const o = [...doc.atoms.values()].find((a) => a.el === 'O');
      addBond(doc, o.id, addAtom(doc, o.x + 1, o.y).id, 1);
    });
    let copied = null;
    olomol.change((doc) => {
      const before = new Set(doc.brackets.keys());
      copyObjects(doc, [...doc.atoms.keys(), ...doc.bonds.keys(), ...doc.brackets.keys()], 0, 5);
      copied = [...doc.brackets.keys()].find((id) => !before.has(id));
    });
    return [...bracketMembers(olomol.doc, olomol.doc.brackets.get(copied))].length;
  });
  check(pasted === 4, `a bracket made round ethanol, a methyl drawn on, copied: the copy round all 4 atoms (${pasted})`);

  // --- Draw out of PPh3 written as one label, a "2" under it and on a reaction arrow: they stay with it ---
  await clear();
  const drawnOut = await state(async () => {
    const D = await import('/src/model/doc.js');
    const A = await import('/src/editor/abbreviate.js');
    const doc = D.emptyDoc();
    const arrow = D.addArrow(doc, -1.5, 1, 1.5, 1, 'forward');
    const label = D.addAtom(doc, 0, 0, '*', { alias: 'PPh3', arrow: arrow.id, arrowSlot: 'above', arrowOrder: 0 });
    const number = D.addText(doc, 0, 1, '2', { anchor: label.id, slot: 'below' });
    olomol.setDoc(doc);
    await A.drawOutAbbreviations(olomol, [label.id]);
    const atoms = [...olomol.doc.atoms.values()];
    const text = olomol.doc.texts.get(number.id);
    return { atoms: atoms.length, onArrow: atoms.every((a) => a.arrow === arrow.id), number: Boolean(text && olomol.doc.atoms.has(text.anchor)) };
  });
  check(drawnOut.atoms > 10 && drawnOut.onArrow && drawnOut.number,
    `Draw out of PPh3 written as one label: on its reaction arrow still (${drawnOut.onArrow}), its "2" under it still (${drawnOut.number}), ${drawnOut.atoms} atoms`);

  // --- Abbreviate of a whole molecule made round by brackets: the brackets stay, round the label ---
  await clear();
  await paste('P(c1ccccc1)(c1ccccc1)c1ccccc1');
  const abbreviated = await state(async () => {
    const { bracketAtoms } = await import('/src/editor/tools.js');
    const A = await import('/src/editor/abbreviate.js');
    bracketAtoms(olomol, [...olomol.doc.atoms.keys()]);
    const bracket = [...olomol.doc.brackets.keys()][0];
    olomol.selectAll();
    await A.abbreviateSelection(olomol, [...olomol.selection]);
    const b = olomol.doc.brackets.get(bracket);
    return { labels: [...olomol.doc.atoms.values()].map((a) => a.alias).join(), bracket: Boolean(b), round: b ? b.atoms.join() === [...olomol.doc.atoms.keys()].join() : false };
  });
  check(abbreviated.labels === 'PPh3' && abbreviated.bracket && abbreviated.round, `Abbreviate of PPh3 in brackets: PPh3, its brackets round the label (${JSON.stringify(abbreviated)})`);

  // --- an arrow with a side arc, its length typed: as typed, not back to what the arc needs ---
  await clear();
  const typed = await state(async () => {
    const { addArrow, emptyDoc } = await import('/src/model/doc.js');
    const doc = emptyDoc();
    const arrow = addArrow(doc, 0, 0, 4, 0, 'forward');
    arrow.sides = [{ id: doc.nextId++, side: 'above', way: 'in', reach: 1 }];
    olomol.setDoc(doc);
    olomol.select([arrow.id]);
    return arrow.id;
  });
  const length = page.locator('.inspector input.field[type=number]').first();
  await length.fill('7');
  await page.waitForTimeout(100);
  const typedLength = await state((id) => { const a = olomol.doc.arrows.get(id); return Math.hypot(a.x2 - a.x1, a.y2 - a.y1); }, typed);
  check(Math.abs(typedLength - 7) < 0.01, `an arrow with a side arc, 7 typed as its length: 7 it stays (${typedLength.toFixed(2)})`);

  // --- ⊕ and ⊖ set: a charge in a ring's middle circled too ---
  await clear();
  await paste('[cH-]1cccc1');
  const ringCircle = await state(async () => {
    const { sceneToSVG } = await import('/src/render/svg.js');
    const { aromatize } = await import('/src/editor/aromatic.js');
    olomol.selectAll();
    await aromatize(olomol);
    olomol.setSettings({ chargeStyle: 'circled' });
    const scene = olomol.scene;
    const svg = sceneToSVG(scene);
    olomol.setSettings({ chargeStyle: 'plain' });
    return { centred: scene.ringCharges?.length ?? 0, circles: (svg.match(/<circle/g) ?? []).length };
  });
  check(ringCircle.centred === 1 && ringCircle.circles >= 1, `the cyclopentadienide's − in its ring's middle, ⊖ when charges are circled (${JSON.stringify(ringCircle)})`);

  // --- Other way: round the ways a curved arrow has, each click another ---
  await clear();
  await paste('C=O');
  const ways = await state(() => {
    const [c, o] = ['C', 'O'].map((el) => [...olomol.doc.atoms.values()].find((a) => a.el === el));
    const bond = [...olomol.doc.bonds.values()][0];
    olomol.change((doc) => { const id = doc.nextId++; doc.curves.set(id, { id, electrons: 2, from: { bond: bond.id }, to: { atom: o.id }, color: null, variant: 0 }); });
    olomol.select([...olomol.doc.curves.keys()]);
    return { ways: olomol.scene.curves.get([...olomol.doc.curves.keys()][0]).ways, c: c.id };
  });
  const seen = [];
  for (let k = 0; k < ways.ways; k++) {
    seen.push(await state(() => olomol.scene.curves.get([...olomol.doc.curves.keys()][0]).samples.map((p) => p.map((v) => v.toFixed(2)).join()).join(';')));
    await page.locator('.inspector').getByRole('button', { name: /Other way/ }).click();
  }
  const back = await state(() => olomol.scene.curves.get([...olomol.doc.curves.keys()][0]).samples.map((p) => p.map((v) => v.toFixed(2)).join()).join(';'));
  check(new Set(seen).size === ways.ways && back === seen[0], `Other way: each click another of the arrow's ${ways.ways} ways, then the first again (${new Set(seen).size} different)`);

  // --- Draw out and Abbreviate keep the curved arrows on a label and on its bond (SN2 with OTs leaving) ---
  await clear();
  const leaving = await state(async () => {
    const { addAtom, addBond, addCurve, addText, emptyDoc } = await import('/src/model/doc.js');
    const { abbreviateSelection, drawOutAbbreviations } = await import('/src/editor/abbreviate.js');
    const doc = emptyDoc();
    const c = addAtom(doc, 0, 0, 'C');
    const ots = addAtom(doc, 1, 0, '*', { alias: 'OTs' });
    const link = addBond(doc, c.id, ots.id, 1);
    const nu = addAtom(doc, -2, 0, 'O', { charge: -1 });
    addCurve(doc, { atom: nu.id }, { atom: c.id });
    addCurve(doc, { bond: link.id }, { atom: ots.id });
    addText(doc, 1, 1, 'LG', { anchor: ots.id });
    olomol.setDoc(doc);
    await drawOutAbbreviations(olomol, [ots.id]);
    const out = { curves: olomol.doc.curves.size, text: olomol.doc.atoms.get([...olomol.doc.texts.values()][0].anchor)?.el };
    olomol.selectAll();
    await abbreviateSelection(olomol, [...olomol.doc.atoms.keys()].filter((id) => id !== c.id && id !== nu.id));
    const label = [...olomol.doc.atoms.values()].find((a) => a.alias);
    const curve = [...olomol.doc.curves.values()].find((cv) => cv.from.bond !== undefined);
    const bond = curve && olomol.doc.bonds.get(curve.from.bond);
    return { out, back: { curves: olomol.doc.curves.size, label: label?.alias, onLabel: Boolean(bond && (bond.a === label?.id || bond.b === label?.id) && curve.to.atom === label?.id), text: olomol.doc.texts.size && [...olomol.doc.texts.values()][0].anchor === label?.id } };
  });
  check(leaving.out.curves === 2 && leaving.out.text === 'O' && leaving.back.curves === 2 && leaving.back.onLabel && leaving.back.text,
    `OTs drawn out and abbreviated again: both curved arrows (to C, from the C–OTs bond to OTs) and its text stay with it (${JSON.stringify(leaving)})`);
}
