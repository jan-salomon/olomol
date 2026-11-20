// The browser check: Arranging: flipping, reaction arrows, Align, grids, whole molecules dragged.
// Run alone: npm run check -- --only arrange [url]

import {
  atomXY, bondMiddle, check, clear, clickAt, dragBetween, drawnSmiles, notice, page, paste, screen, state,
} from './harness.mjs';
// (its parts, in the order run:)
//   flipping keeps the molecule; snapping a bond goes round
//   a reaction arrow: shorter by default, its ends can be dragged
//   align
//   a crossed arrow and an equals sign; an equilibrium that lies one way
//   an equilibrium arrow's side arcs follow their harpoons
//   a lone arrow or plus pasted: the see-through copy where the click puts it
//   a triple click: the reaction row, not the row under it
//   groups: Ctrl+G, Ctrl+click picks the innermost (again: the one round it), a plain click the atom, Ctrl+drag
//   moves the group, the outline while Ctrl is held, Ctrl+Shift+G one level, kept in the file
//   Align reaction scheme with resonance forms in brackets: the bracket and what is in it one block, the reaction in it lined up
//   aligning several molecules and texts: every text lines up too
//   Shift+double click adds a whole molecule to the selection; a grid of molecules selected without
//   a grid of molecules in brackets: their names on one line, their brackets level
//   whole molecules dragged slide as they were drawn (one transform, nothing drawn again), and are
export default async function run() {
  // --- flipping keeps the molecule; snapping a bond goes round ---
  await clear();
  await paste('N[C@@H](C)C(=O)O');
  const alanine = await drawnSmiles();
  await page.getByTitle('Flip left–right (selection, or everything)').click();
  await page.getByTitle('Flip top–bottom (selection, or everything)').click();
  check((await drawnSmiles()) === alanine, `flipping keeps L-alanine (${await drawnSmiles()})`);
  const someBond = await state(() => [...olomol.doc.bonds.keys()][0]);
  const bondAngle = () => state((id) => {
    const b = olomol.doc.bonds.get(id);
    const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
    return Math.round((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI);
  }, someBond);
  const angles = [];
  for (let k = 0; k < 4; k++) {
    await state((id) => window.olomolTest.snapBond(id), someBond);
    angles.push(((await bondAngle()) + 360) % 360);
  }
  check(new Set(angles).size === 4 && angles.every((a) => a % 90 === 0), `make horizontal/vertical, pressed again: all four directions (${angles.join(', ')})`);
  // the tool in the top bar: part of a chain selected, a bond in it clicked: only that part turns
  await clear();
  await state(() => olomol.change((doc) => {
    const ids = [[0, 0], [0.87, -0.5], [1.73, 0], [2.6, -0.5], [3.46, 0]].map(([x, y]) => {
      const id = doc.nextId++;
      doc.atoms.set(id, { id, el: 'C', x, y, charge: 0, isotope: null, radical: 0, hCount: null, lonePairs: null, color: null, alias: null });
      return id;
    });
    for (let k = 0; k < 4; k++) { const id = doc.nextId++; doc.bonds.set(id, { id, a: ids[k], b: ids[k + 1], order: 1, stereo: '', side: null, color: null }); }
  }));
  await state(() => olomol.fit(window.innerWidth, window.innerHeight));
  const partSnap = await state(() => {
    const atoms = [...olomol.doc.atoms.values()];
    olomol.select(atoms.slice(2).map((a) => a.id)); // the last three atoms
    return { before: atoms.map((a) => [a.x, a.y]), bond: [...olomol.doc.bonds.values()][2].id };
  });
  await page.getByTestId('snap-bond').click();
  await clickAt(await bondMiddle(partSnap.bond));
  const snapped = await state(({ before, bond }) => {
    const atoms = [...olomol.doc.atoms.values()];
    const b = olomol.doc.bonds.get(bond);
    const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
    return {
      angle: Math.round(((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 360) % 90),
      fixed: atoms.slice(0, 2).every((a, k) => Math.hypot(a.x - before[k][0], a.y - before[k][1]) < 1e-9),
      tool: olomol.tool.name,
    };
  }, partSnap);
  await state(() => olomol.setTool({ name: 'select' }));
  check(snapped.angle === 0 && snapped.fixed && snapped.tool === 'snapBond',
    `make horizontal/vertical in the top bar: with part of a chain selected, the clicked bond comes out straight (${snapped.angle}° off), the rest stays (${snapped.fixed}), the tool stays on (${snapped.tool})`);
  // the button with one bond selected (only it): its whole molecule turns at once, no tool
  const oneBond = await state(() => {
    const bond = [...olomol.doc.bonds.values()][0];
    olomol.select([bond.id]);
    return bond.id;
  });
  await page.getByTestId('snap-bond').click();
  const turnedAtOnce = await state((id) => {
    const b = olomol.doc.bonds.get(id);
    const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
    return [Math.round(((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 360) % 90), olomol.tool.name];
  }, oneBond);
  check(turnedAtOnce[0] === 0 && turnedAtOnce[1] === 'select', `make horizontal/vertical with one bond selected: its molecule turns at once (${turnedAtOnce[0]}° off), no tool (${turnedAtOnce[1]})`);
  // a bond boxed with its two atoms: the same (its molecule, not only the two atoms)
  const boxedBond = await state(() => {
    const bond = [...olomol.doc.bonds.values()][1];
    olomol.select([bond.id, bond.a, bond.b]);
    const others = [...olomol.doc.atoms.values()].filter((a) => a.id !== bond.a && a.id !== bond.b).map((a) => [a.x, a.y]);
    return { id: bond.id, others };
  });
  await page.getByTestId('snap-bond').click();
  const boxedTurned = await state(({ id, others }) => {
    const b = olomol.doc.bonds.get(id);
    const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
    const moved = [...olomol.doc.atoms.values()].filter((a) => a.id !== b.a && a.id !== b.b).some((a, k) => Math.hypot(a.x - others[k][0], a.y - others[k][1]) > 1e-6);
    return [Math.round(((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 360) % 90), moved, olomol.tool.name];
  }, boxedBond);
  check(boxedTurned[0] === 0 && boxedTurned[1] && boxedTurned[2] === 'select', `make horizontal/vertical with a bond and its atoms selected: the whole molecule turns (${boxedTurned.join(', ')})`);
  // Esc with the select tool: the selection first, then the box and the lasso in turn
  await state(() => olomol.setTool({ name: 'select' }));
  await page.keyboard.press('Escape');
  const escCleared = await state(() => [olomol.selection.size, Boolean(olomol.tool.lasso)].join());
  await page.keyboard.press('Escape');
  const escLasso = await state(() => Boolean(olomol.tool.lasso));
  await page.keyboard.press('Escape');
  const escBox = await state(() => Boolean(olomol.tool.lasso));
  check(escCleared === '0,false' && escLasso && !escBox, `Esc with the select tool: deselects first (${escCleared}), then the lasso (${escLasso}), then the box again (${!escBox})`);

  // --- a reaction arrow: shorter by default, its ends can be dragged ---
  await clear();
  await page.keyboard.press('x');
  await page.mouse.click(500, 400);
  const arrow0 = await state(() => [...olomol.doc.arrows.values()][0]);
  await state((id) => {
    olomol.setTool({ name: 'select' });
    olomol.select([id]);
  }, arrow0.id);
  await dragBetween([arrow0.x2, arrow0.y2], [arrow0.x2 + 1.5, arrow0.y2]);
  const arrow1 = await state(() => [...olomol.doc.arrows.values()][0]);
  check(Math.abs(arrow0.x2 - arrow0.x1 - 2) < 1e-6 && Math.abs(arrow1.x2 - arrow1.x1 - 3.5) < 0.05 && arrow1.y1 === arrow1.y2,
    `reaction arrow: 2 long, dragging its head makes it ${(arrow1.x2 - arrow1.x1).toFixed(2)} long`);

  // flip over a bond: the selected part turns about the bond clicked next (R/S kept)
  await clear();
  await paste('C[C@@H](O)c1ccccc1');
  const flipBefore = await drawnSmiles();
  const flipPart = await state(() => {
    const atoms = [...olomol.doc.atoms.values()];
    const bonded = (id) => [...olomol.doc.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
    const o = atoms.find((a) => a.el === 'O').id;
    const centre = bonded(o)[0];
    const methyl = bonded(centre).find((id) => id !== o && bonded(id).length === 1);
    const ipso = bonded(centre).find((id) => id !== o && id !== methyl);
    const ids = [centre, o, methyl];
    const bonds = [...olomol.doc.bonds.values()].filter((b) => ids.includes(b.a) && ids.includes(b.b)).map((b) => b.id);
    const axle = [...olomol.doc.bonds.values()].find((b) => (b.a === centre && b.b === ipso) || (b.b === centre && b.a === ipso)).id;
    olomol.setTool({ name: 'select' });
    olomol.select([...ids, ...bonds]);
    const at = (id) => [olomol.doc.atoms.get(id).x, olomol.doc.atoms.get(id).y];
    return { o, axle, ipso, centre, oAt: at(o) };
  });
  await page.getByTestId('flip-over').click();
  await page.mouse.move(...(await screen(await bondMiddle(flipPart.axle))));
  const flipGhost = await page.locator('.ghost-copy').count();
  await page.mouse.click(...(await screen(await bondMiddle(flipPart.axle))));
  const flipAfter = await state(({ o, ipso, centre, oAt }) => {
    const at = (id) => olomol.doc.atoms.get(id);
    const [p, q] = [at(ipso), at(centre)];
    // the O now on the other side of the axle, as far from it
    const side = ([x, y]) => Math.sign((q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x));
    return { tool: olomol.tool.name, flipped: side(oAt) === -side([at(o).x, at(o).y]), selected: olomol.selection.size };
  }, flipPart);
  check(flipGhost === 1 && flipAfter.flipped && flipAfter.tool === 'select' && (await drawnSmiles()) === flipBefore,
    `flip over a bond: a see-through preview, then the OH side turned over the bond to the ring, R/S kept (${JSON.stringify({ flipGhost, ...flipAfter, smiles: await drawnSmiles() })})`);
  // nothing selected and a ring bond: it says what to do
  await state(() => olomol.clearSelection());
  const ringBondId = await state(() => [...olomol.doc.bonds.values()].find((b) => ['a', 'b'].every((k) => olomol.doc.atoms.get(b[k]).el === 'C' && [...olomol.doc.bonds.values()].filter((x) => x.a === b[k] || x.b === b[k]).length >= 2) && b.order === 2)?.id);
  await page.getByTestId('flip-over').click();
  await page.mouse.click(...(await screen(await bondMiddle(ringBondId))));
  check((await notice()).includes('in a ring'), `flip over a ring bond with nothing selected: asks for a selection ("${await notice()}")`);
  await page.keyboard.press('Escape');

  // --- align ---
  await clear();
  await paste('CCO.c1ccccc1.CC(=O)O');
  await state(() => olomol.selectAll());
  await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
  await page.getByRole('button', { name: 'Align left edges', exact: true }).click();
  const lefts = await state(() => window.olomolTest.itemBoxes().map((b) => b.minX));
  check(lefts.length === 3 && lefts.every((x) => Math.abs(x - lefts[0]) < 1e-6), `align left: ${lefts.map((x) => x.toFixed(2)).join(', ')}`);
  await page.keyboard.press('Escape');
  // a grid stays where the selection was: the same middle
  const middleOf = () => state(() => {
    const boxes = window.olomolTest.itemBoxes();
    const [x1, x2] = [Math.min(...boxes.map((b) => b.minX)), Math.max(...boxes.map((b) => b.maxX))];
    const [y1, y2] = [Math.min(...boxes.map((b) => b.minY)), Math.max(...boxes.map((b) => b.maxY))];
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  });
  const gridBefore = await middleOf();
  await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
  await page.getByRole('button', { name: 'Arrange in a grid', exact: true }).click();
  await page.keyboard.press('Escape');
  const gridAfter = await middleOf();
  check(Math.hypot(gridAfter[0] - gridBefore[0], gridAfter[1] - gridBefore[1]) < 0.01, `grid: the selection keeps its middle (${gridBefore.map((v) => v.toFixed(2))} → ${gridAfter.map((v) => v.toFixed(2))})`);
  // a reaction in one row
  await clear();
  await paste('CCO.CC(=O)O');
  await state(() => {
    olomol.change((doc) => {
      const id = doc.nextId++;
      doc.arrows.set(id, { id, x1: 2, y1: 3, x2: 4, y2: 2.5, kind: 'forward', color: null });
    });
    olomol.selectAll();
  });
  await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
  await page.getByRole('button', { name: /Align reaction scheme/ }).click();
  await page.keyboard.press('Escape');
  const arrow = await state(() => [...olomol.doc.arrows.values()][0]);
  check(Math.abs(arrow.y1 - arrow.y2) < 1e-9, 'align reaction: the arrow is horizontal');
  // a count on the left anchor stays in the row, a number on the anchor below under it
  await clear();
  await paste('O.CCO');
  await state(() => olomol.change((doc) => {
    const atoms = [...doc.atoms.values()];
    const water = atoms.find((a) => a.el === 'O' && [...doc.bonds.values()].every((b) => b.a !== a.id && b.b !== a.id));
    let id = doc.nextId++;
    doc.texts.set(id, { id, x: 0, y: 0, text: '2', color: null, anchor: water.id, slot: 'left' });
    const ethanol = atoms.filter((a) => a.el === 'C');
    id = doc.nextId++;
    doc.texts.set(id, { id, x: 0, y: 0, text: '1', color: null, anchor: ethanol[0].id });
    id = doc.nextId++;
    doc.arrows.set(id, { id, x1: water.x + 1, y1: water.y, x2: water.x + 3, y2: water.y, kind: 'forward', color: null });
  }));
  await state(() => olomol.selectAll());
  await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
  await page.getByRole('button', { name: /Align reaction scheme/ }).click();
  await page.keyboard.press('Escape');
  const placed = await state(() => {
    const texts = [...olomol.doc.texts.values()];
    const arrowY = [...olomol.doc.arrows.values()][0].y1;
    const two = olomol.scene.texts.get(texts.find((t) => t.text === '2').id).box;
    const one = olomol.scene.texts.get(texts.find((t) => t.text === '1').id).box;
    return { twoInRow: two.y1 < arrowY && two.y2 > arrowY, oneBelow: one.y1 > arrowY + 0.5 };
  });
  check(placed.twoInRow && placed.oneBelow, `align reaction: "2 H2O" keeps its 2 in the row, the compound number 1 stays under (${JSON.stringify(placed)})`);

  // a charge and written hydrogens don't lift or lower a molecule: Cl⁻ and H2O lined up by Cl and O, also in a reaction row
  await clear();
  await paste('[Cl-].O.C');
  await state(() => olomol.change((doc) => [...doc.atoms.values()].forEach((a, k) => { a.y += [0, 1.3, -0.8][k]; })));
  await state(() => olomol.selectAll());
  await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
  await page.getByRole('button', { name: 'Align middles (vertically)', exact: true }).click();
  await page.keyboard.press('Escape');
  const levels = await state(() => [...olomol.doc.atoms.values()].map((a) => a.y));
  check(levels.every((y) => Math.abs(y - levels[0]) < 1e-6), `align middles: Cl⁻, H2O and CH4 level by their atoms (${levels.map((y) => y.toFixed(3)).join(', ')})`);

  // side arcs of a reaction arrow, drawn with the arrow tool: from its middle out, from the canvas in;
  // the arrow lengthens to fit; a selected arrow's arc handle changes the reach; the eraser takes one arc
  await clear();
  const sideArrow = await state(() => {
    let made;
    olomol.change((doc) => {
      const id = doc.nextId++;
      doc.arrows.set(id, { id, x1: -1.5, y1: 0, x2: 1.5, y2: 0, kind: 'forward', color: null });
      made = id;
    });
    return made;
  });
  await state(() => olomol.setTool({ name: 'rxn', kind: 'forward' }));
  await dragBetween([0, 0], [1.2, -1]);
  await dragBetween([-1.3, -1], [0.05, 0]);
  await dragBetween([-1, 1.2], [0, 0.02]);
  const drawnArcs = await state((id) => ({ sides: (olomol.doc.arrows.get(id).sides ?? []).map((e) => `${e.side}-${e.way}`).sort().join(), arrows: olomol.doc.arrows.size,
    length: Math.hypot(olomol.doc.arrows.get(id).x2 - olomol.doc.arrows.get(id).x1, olomol.doc.arrows.get(id).y2 - olomol.doc.arrows.get(id).y1) }), sideArrow);
  await state((id) => {
    olomol.setTool({ name: 'select' });
    olomol.select([id]);
  }, sideArrow);
  const outEnd = await state((id) => olomol.scene.arrowArcs.get(`${id}|above-out`).free, sideArrow);
  await dragBetween(outEnd, [outEnd[0] + 1, outEnd[1]]);
  const reachAfter = await state((id) => olomol.doc.arrows.get(id).sides.find((e) => e.side === 'above' && e.way === 'out').reach, sideArrow);
  await state(() => olomol.setTool({ name: 'erase' }));
  await clickAt(await state((id) => olomol.scene.arrowArcs.get(`${id}|below-in`).samples[4], sideArrow));
  const leftArcs = await state((id) => (olomol.doc.arrows.get(id).sides ?? []).map((e) => `${e.side}-${e.way}`).sort().join(), sideArrow);
  check(drawnArcs.sides === 'above-in,above-out,below-in' && drawnArcs.arrows === 1 && drawnArcs.length > 3 && reachAfter > 1.8 && leftArcs === 'above-in,above-out',
    `side arcs: drawn from the middle and to it (${drawnArcs.sides}, still ${drawnArcs.arrows} arrow, lengthened to ${drawnArcs.length.toFixed(2)}); the handle makes one reach further (${reachAfter}); the eraser takes one (${leftArcs})`);
  // a second arc about as long as the first: the same (symmetric); a click selects one arc alone, Del takes it
  // off (what is at its end stays, on the arrow); with no arcs left the arrow is as long as drawn again
  await clear();
  const plainArrow = await state(() => {
    let made;
    olomol.change((doc) => {
      const id = doc.nextId++;
      doc.arrows.set(id, { id, x1: -1, y1: 0, x2: 1, y2: 0, kind: 'forward', color: null });
      made = id;
    });
    return made;
  });
  await state(() => olomol.setTool({ name: 'rxn', kind: 'forward' }));
  await dragBetween([0, 0], [1.5, -1]);
  await dragBetween([-1.3, -1], [0.03, 0]);
  const reaches = await state((id) => olomol.doc.arrows.get(id).sides.map((e) => e.reach), plainArrow);
  await state((id) => olomol.change((doc) => {
    const at = doc.nextId++;
    doc.texts.set(at, { id: at, x: 0, y: 0, text: 'NADH', color: null, arrow: id, slot: 'above-out' });
  }), plainArrow);
  await state(() => olomol.setTool({ name: 'select' }));
  // dragged about as long as the other: just as long (symmetric)
  await state((id) => {
    olomol.change((doc) => { doc.arrows.get(id).sides.find((e) => e.way === 'in').reach = 2; });
    olomol.select([id]);
  }, plainArrow);
  const outFree = await state((id) => olomol.scene.arrowArcs.get(`${id}|above-out`).free, plainArrow);
  await dragBetween(outFree, [outFree[0] + 0.38, outFree[1]]);
  const snappedReach = await state((id) => olomol.doc.arrows.get(id).sides.find((e) => e.way === 'out').reach, plainArrow);
  check(snappedReach === 2, `a side arc dragged about as long as the other arc: just as long (${snappedReach})`);
  await clickAt(await state((id) => olomol.scene.arrowArcs.get(`${id}|above-out`).samples[6], plainArrow));
  const arcSelected = await state((id) => [...olomol.selection].join() === String(olomol.doc.arrows.get(id).sides.find((e) => e.way === 'out').id), plainArrow);
  const arcHandle = await page.locator('.canvas .handle').count(); // (the selected arc's free end, to drag)
  await page.keyboard.press('Delete');
  const afterDel = await state((id) => ({ sides: olomol.doc.arrows.get(id).sides.map((e) => `${e.side}-${e.way}`).join(), nadh: [...olomol.doc.texts.values()][0]?.arrow ?? 'free' }), plainArrow);
  await state((id) => olomol.select([olomol.doc.arrows.get(id).sides[0].id]), plainArrow);
  await page.keyboard.press('Delete');
  const backTo = await state((id) => Math.hypot(olomol.doc.arrows.get(id).x2 - olomol.doc.arrows.get(id).x1, olomol.doc.arrows.get(id).y2 - olomol.doc.arrows.get(id).y1), plainArrow);
  // (the first as the drag gave it: 1.5, or a little off where the browser's pointer is in whole pixels, as Firefox's)
  check(reaches.length === 2 && reaches[0] === reaches[1] && Math.abs(reaches[0] - 1.5) < 0.03 && arcSelected && arcHandle === 1 && afterDel.sides === 'above-in' && afterDel.nadh === 'free' && Math.abs(backTo - 2) < 1e-6,
    `side arcs: the second as long as the first (${reaches.join()}); a click selects one alone (${arcSelected}, its handle shown: ${arcHandle}), Del takes it off (${afterDel.sides}), NADH stays where it was, free (${afterDel.nadh}); none left: the arrow as drawn again (${backTo.toFixed(2)})`);
  // the arrow's end dragged in, shorter than its arcs need: left so, its other end where it was
  await state((id) => olomol.change((doc) => { doc.arrows.get(id).sides = [{ id: doc.nextId++, side: 'above', way: 'out', reach: 1.5 }]; }), plainArrow);
  const arrowEnds = await state((id) => { const a = olomol.doc.arrows.get(id); return [a.x1, a.y1, a.x2, a.y2]; }, plainArrow);
  await state((id) => olomol.select([id]), plainArrow);
  await dragBetween([arrowEnds[2], arrowEnds[3]], [arrowEnds[2] - 1.5, arrowEnds[3]]);
  const dragged = await state((id) => { const a = olomol.doc.arrows.get(id); return [a.x1, a.x2]; }, plainArrow);
  check(Math.abs(dragged[0] - arrowEnds[0]) < 1e-6 && Math.abs(dragged[1] - (arrowEnds[2] - 1.5)) < 0.05,
    `the arrow's end dragged in past what its arc needs: left there, its start where it was (${arrowEnds[0].toFixed(2)} → ${dragged[0].toFixed(2)}; end ${dragged[1].toFixed(2)})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // a side arc dragged across the arrow: on the other side, what is at its end with it; the panel turns
  // the arrow round or flips its arcs and stacks top to bottom
  await clear();
  const flipping = await state(() => {
    let made;
    olomol.change((doc) => {
      const id = doc.nextId++;
      doc.arrows.set(id, { id, x1: -1.5, y1: 0, x2: 1.5, y2: 0, kind: 'forward', color: null, sides: [{ id: doc.nextId++, side: 'above', way: 'out', reach: 1.2 }] });
      for (const [text, slot] of [['NADH', 'above-out'], ['ADH', 'above']]) {
        const at = doc.nextId++;
        doc.texts.set(at, { id: at, x: 0, y: 0, text, color: null, arrow: id, slot });
      }
      made = id;
    });
    olomol.setTool({ name: 'select' });
    olomol.select([made]);
    return made;
  });
  const freeEnd = await state((id) => olomol.scene.arrowArcs.get(`${id}|above-out`).free, flipping);
  await dragBetween(freeEnd, [freeEnd[0], 1.2]);
  const across = await state((id) => ({ side: olomol.doc.arrows.get(id).sides[0].side, nadh: [...olomol.doc.texts.values()].find((x) => x.text === 'NADH').slot }), flipping);
  await page.getByTestId('arrow-flip-sides').click();
  const flippedSides = await state((id) => ({ side: olomol.doc.arrows.get(id).sides[0].side, slots: [...olomol.doc.texts.values()].map((x) => x.slot).join() }), flipping);
  await page.getByTestId('arrow-reverse').click();
  const reversed = await state((id) => olomol.doc.arrows.get(id).x1 > olomol.doc.arrows.get(id).x2, flipping);
  check(across.side === 'below' && across.nadh === 'below-out' && flippedSides.side === 'above' && flippedSides.slots === 'above-out,below' && reversed,
    `a side arc dragged across: below, NADH with it (${across.nadh}); flipped top to bottom: arcs and stacks across (${flippedSides.slots}); turned round (${reversed})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // --- a crossed arrow and an equals sign from the reaction arrow's variants; an equilibrium that lies one way:
  // the panel's button goes on from even to the products' side, the reactants' side and back ---
  await clear();
  const drawnKinds = [];
  for (const [name, y] of [[/^Crossed arrow/, -2], [/^Equals sign/, 0], [/^Equilibrium arrow/, 2]]) {
    await page.getByTestId('tool-rxn').click({ button: 'right' });
    await page.locator('.flyout').getByRole('button', { name }).click();
    await dragBetween([-1, y], [1, y]);
    drawnKinds.push(await state(() => [...olomol.doc.arrows.values()].at(-1).kind));
  }
  const equilibrium = await state(() => {
    const arrow = [...olomol.doc.arrows.values()].at(-1);
    olomol.setTool({ name: 'select' });
    olomol.select([arrow.id]);
    return arrow.id;
  });
  const leans = [];
  for (let k = 0; k < 3; k++) {
    await page.getByTestId('equilibrium-lean').click();
    const button = page.getByTestId('equilibrium-lean');
    const shown = await button.evaluate((el) => [...el.querySelectorAll('.label > span')].find((x) => x.style.visibility === 'visible').textContent);
    leans.push(`${await state((id) => olomol.doc.arrows.get(id).lean ?? 'even', equilibrium)} (${shown}, ${Math.round((await button.boundingBox()).width)} px)`);
  }
  // (the button as wide whatever it says: it doesn't jump under the pointer)
  const widths = new Set(leans.map((lean) => lean.match(/(\d+) px/)[1]));
  check(drawnKinds.join() === 'failed,same,equilibrium' && leans.map((lean) => lean.replace(/, \d+ px/, '')).join() === 'forward (the products),back (the reactants),even (neither side)' && widths.size === 1,
    `reaction arrow variants: crossed, equals sign, equilibrium (${drawnKinds}); the equilibrium's lean in the panel, one width: ${leans.join(', ')}`);

  // --- an equilibrium arrow is two arrows for its side arcs: one dragged out of its middle downwards leaves
  // to the left (the lower harpoon goes back), one dragged in from the upper left meets the upper harpoon ---
  await clear();
  await state(() => olomol.setTool({ name: 'rxn', kind: 'equilibrium' }));
  await dragBetween([-2, 0], [2, 0]);
  const eq = await state(() => [...olomol.doc.arrows.values()].at(-1).id);
  await dragBetween([0, 0], [-1.2, 1]);
  await dragBetween([-1.2, -1], [0, 0]);
  const arcs = await state((id) => {
    const arrow = olomol.doc.arrows.get(id);
    const mid = (arrow.x1 + arrow.x2) / 2;
    return (arrow.sides ?? []).map((e) => {
      const arc = olomol.scene.arrowArcs.get(`${id}|${e.side}-${e.way}`);
      return `${e.side}-${e.way} ${arc.free[0] < mid ? 'left' : 'right'}`;
    }).sort().join();
  }, eq);
  check(arcs === 'above-in left,below-out left', `an equilibrium arrow's side arcs follow their harpoons: ${arcs}`);
  await state(() => olomol.setTool({ name: 'select' }));

  // --- aligning several molecules and texts: every text lines up too ---
  await clear();
  await paste('CCO');
  await state(() => olomol.moveSelection(-4, -2));
  await paste('c1ccccc1');
  await state(() => olomol.moveSelection(3, 2));
  await state(() => olomol.change((doc) => {
    for (const [x, y, text] of [[-2, 4, 'first text'], [2, -4, 'second']]) {
      const id = doc.nextId++;
      doc.texts.set(id, { id, x, y, text, color: null });
    }
  }));
  await state(() => olomol.selectAll());
  await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
  await page.getByRole('button', { name: 'Align left edges' }).click();
  await page.keyboard.press('Escape');
  const leftEdges = await state(() => [...new Set(window.olomolTest.itemBoxes().map((b) => b.minX.toFixed(2)))]);
  check(leftEdges.length === 1, `Align left with two molecules and two texts: all four left edges in line (${leftEdges.join(', ')})`);

  // --- Shift+double click adds a whole molecule to the selection; a grid of molecules selected without
  // their names still puts the names of a row on one line ---
  await clear();
  await state(() => olomol.change((doc) => {
    const molecule = (x, y, n) => {
      const ids = [];
      for (let k = 0; k < n; k++) {
        const id = doc.nextId++;
        doc.atoms.set(id, { id, el: 'C', x: x + k * 0.87, y: y + (k % 2 ? -0.5 : 0), charge: 0, isotope: null, radical: 0, hCount: null, lonePairs: null, color: null, alias: null });
        ids.push(id);
      }
      for (let k = 0; k + 1 < n; k++) { const id = doc.nextId++; doc.bonds.set(id, { id, a: ids[k], b: ids[k + 1], order: 1, stereo: '', side: null, color: null }); }
      const t = doc.nextId++;
      doc.texts.set(t, { id: t, x: 0, y: 0, text: `chain ${n}`, color: null, anchor: ids[0] });
      return ids;
    };
    molecule(0, 0, 2);
    molecule(4, 1, 6);
    molecule(0, 5, 4);
    molecule(5, 6, 3);
  }));
  await state(() => olomol.fit(window.innerWidth, window.innerHeight));
  await page.waitForTimeout(100);
  const chainA = await state(() => [...olomol.doc.atoms.values()][0].id);
  const chainB = await state(() => [...olomol.doc.atoms.values()][2].id);
  let [cx, cy] = await screen(await atomXY(chainA));
  await page.mouse.dblclick(cx, cy);
  [cx, cy] = await screen(await atomXY(chainB));
  await page.keyboard.down('Shift');
  await page.mouse.dblclick(cx, cy);
  await page.keyboard.up('Shift');
  const bothSelected = await state(() => olomol.selectedAtoms().length);
  // only the atoms selected (no names), in a grid of two columns
  await state(() => olomol.select([...olomol.doc.atoms.keys()]));
  await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
  await page.locator('.menu input[type=number]').first().fill('2');
  await page.getByRole('button', { name: 'Arrange in a grid', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const nameRows = await state(() => {
    const ys = [...document.querySelectorAll('.canvas svg text')].filter((e) => e.textContent.startsWith('chain')).map((e) => Math.round(e.getBoundingClientRect().y));
    return [...new Set(ys)].length;
  });
  check(bothSelected === 8 && nameRows === 2,
    `Shift+double click adds a second molecule (${bothSelected} atoms selected of 2 + 6); a grid of molecules selected without their names puts each row's names on one line (${nameRows} lines for 2 rows)`);

  // --- a grid of molecules in brackets: their names on one line, their brackets level ---
  await clear();
  await state(() => olomol.change((doc) => {
    const atom = (x, y, el = 'C') => {
      const id = doc.nextId++;
      doc.atoms.set(id, { id, el, x, y, charge: 0, isotope: null, radical: 0, hCount: null, lonePairs: null, color: null, alias: null });
      return id;
    };
    const bond = (a, b) => { const id = doc.nextId++; doc.bonds.set(id, { id, a, b, order: 1, stereo: '', side: null, color: null }); };
    // a tall one (its atoms reach far below its middle) and a short one, each in brackets with a name below
    const tall = [atom(0, 0, 'N'), atom(0.87, 0.5), atom(0.87, 1.5), atom(0, 2, 'N'), atom(0.87, -0.5)];
    for (let k = 0; k < 3; k++) bond(tall[k], tall[k + 1]);
    bond(tall[1], tall[4]);
    const short = [atom(5, 0, 'N'), atom(5.87, -0.5), atom(6.74, 0, 'N')];
    bond(short[0], short[1]);
    bond(short[1], short[2]);
    const third = [atom(10, 0), atom(10.87, 0.5)];
    bond(third[0], third[1]);
    for (const [ids, name] of [[tall, 'tall one'], [short, 'short one'], [third, 'third one']]) {
      const t = doc.nextId++;
      doc.texts.set(t, { id: t, x: 0, y: 0, text: name, color: null, anchor: ids[0] });
    }
    for (const ids of [tall, short]) {
      const xs = ids.map((id) => doc.atoms.get(id).x);
      const ys = ids.map((id) => doc.atoms.get(id).y);
      const id = doc.nextId++;
      doc.brackets.set(id, { id, x1: Math.min(...xs) - 0.6, y1: Math.min(...ys) - 0.6, x2: Math.max(...xs) + 0.6, y2: Math.max(...ys) + 0.6, shape: 'square', sup: '2+', sub: '', color: null, atoms: ids });
    }
  }));
  await state(() => olomol.fit(window.innerWidth, window.innerHeight));
  await state(() => olomol.selectAll());
  await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
  await page.locator('.menu input[type=number]').first().fill('3');
  await page.getByRole('button', { name: 'Arrange in a grid', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const bracketGrid = await state(() => {
    const names = [...olomol.doc.texts.values()].filter((t) => /one$/.test(t.text));
    const nameYs = names.map((t) => t.y.toFixed(3));
    // (brackets of different heights: their middles level)
    const middles = [...olomol.doc.brackets.values()].map((b) => ((b.y1 + b.y2) / 2).toFixed(3));
    const bottoms = [...olomol.doc.brackets.values()].map((b) => Math.max(b.y1, b.y2));
    return { names: [...new Set(nameYs)].length, tops: [...new Set(middles)].length, below: names.every((t) => t.y > Math.max(...bottoms)) };
  });
  check(bracketGrid.names === 1 && bracketGrid.tops === 1 && bracketGrid.below,
    `a grid of molecules in brackets: the names on one line (${bracketGrid.names}), below the brackets (${bracketGrid.below}), the brackets' middles level (${bracketGrid.tops})`);

  // --- whole molecules dragged slide as they were drawn (one transform, nothing drawn again), and are
  // drawn where they were let go; part of a molecule dragged is drawn again at every step ---
  {
    await clear();
    await paste('c1ccccc1O');
    await paste('CCN');
    const box = await page.getByTestId('canvas').boundingBox();
    const atomAt = (k) => state((k) => { const a = [...olomol.doc.atoms.values()][k]; const { scale, tx, ty } = olomol.view; return [a.x * scale + tx, a.y * scale + ty, a.x, a.y]; }, k);
    const drag = async (k, select) => {
      await state(select);
      const [x, y, ax] = await atomAt(k);
      await page.mouse.move(box.x + x, box.y + y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + x + i * 10, box.y + y + i * 4);
      const slid = await state(() => document.querySelectorAll('.drawing > g[transform]').length);
      // (the bonds' halos on the atoms' halos, not one drag step away)
      const halosMeet = await state(() => {
        const circles = [...document.querySelectorAll('.selection circle.halo')].map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
        const near = (x, y) => circles.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 1e-6);
        return [...document.querySelectorAll('.selection line.halo')].every((l) => near(+l.getAttribute('x1'), +l.getAttribute('y1')) && near(+l.getAttribute('x2'), +l.getAttribute('y2')));
      });
      await page.mouse.up();
      const after = await state(() => document.querySelectorAll('.drawing > g[transform]').length);
      const [, , bx] = await atomAt(k);
      return { slid, after, moved: +(bx - ax).toFixed(2), halosMeet };
    };
    const scale = await state(() => olomol.view.scale);
    const whole = await drag(0, () => olomol.select([...olomol.doc.atoms.keys()].slice(0, 7)));
    const part = await drag(0, () => olomol.select([...olomol.doc.atoms.keys()].slice(0, 2)));
    check(whole.slid === 1 && whole.after === 0 && Math.abs(whole.moved - 80 / scale) < 0.01 && part.slid === 0 && Math.abs(part.moved - 80 / scale) < 0.01 && whole.halosMeet && part.halosMeet,
      `a molecule dragged whole slides as drawn (${whole.slid} layer slid, ${whole.after} after), part of one is drawn again (${part.slid}); both moved by the drag (${whole.moved}, ${part.moved}), bond halos on the atom halos (${whole.halosMeet}, ${part.halosMeet})`);
  }

  // --- a lone reaction arrow and a lone plus pasted: the see-through copy where the click puts them (it was
  // centred on the copy's atoms, and with none, off to the left) ---
  for (const [what, olom] of [
    ['an arrow', '{"format":"olom","version":"1.0","reactionArrows":[{"id":1,"from":[0,0],"to":[3,0]}]}'],
    ['a plus', '{"format":"olom","version":"1.0","plusSigns":[{"id":1,"x":0,"y":0}]}'],
  ]) {
    await clear();
    await state((olom) => {
      const dt = new DataTransfer();
      dt.setData('application/x-olomol-ket', olom);
      dt.setData('text/plain', olom);
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    }, olom);
    await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 10_000 }).catch(() => {});
    await page.mouse.move(640, 300, { steps: 3 });
    await page.waitForTimeout(200);
    const ghost = await state(() => {
      const box = document.querySelector('.ghost-copy')?.getBoundingClientRect();
      return box ? [box.x + box.width / 2, box.y + box.height / 2] : null;
    });
    await page.mouse.click(640, 300);
    await page.waitForTimeout(200);
    const placed = await state(() => {
      const points = [...olomol.doc.arrows.values()].flatMap((a) => [[a.x1, a.y1], [a.x2, a.y2]]).concat([...olomol.doc.pluses.values()].map((q) => [q.x, q.y]));
      if (!points.length) return null;
      const { scale, tx, ty } = olomol.view;
      const xs = points.map(([x]) => x * scale + tx);
      const ys = points.map(([, y]) => y * scale + ty);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    });
    check(ghost && placed && Math.hypot(ghost[0] - placed[0], ghost[1] - placed[1]) < 3,
      `${what} pasted: its see-through copy where the click puts it (copy ${ghost?.map(Math.round)}, placed ${placed?.map(Math.round)})`);
  }

  // --- a triple click: the reaction row of what was clicked (its molecules, "+" and arrow), not the row below ---
  {
    await clear();
    await state(() => window.olomolTest.paste('CC(=O)O.OCC>[H+]>CC(=O)OCC'));
    const top = await state(() => [...olomol.doc.atoms.keys(), ...olomol.doc.arrows.keys(), ...olomol.doc.pluses.keys(), ...olomol.doc.texts.keys()]);
    await state(() => window.olomolTest.paste('C=CC=C.C=C>>C1=CCCCC1'));
    const at = await state(async (top) => {
      const { moveObjects } = await import('/src/model/doc.js');
      const kept = new Set(top);
      const lower = [...olomol.doc.atoms.keys(), ...olomol.doc.arrows.keys(), ...olomol.doc.pluses.keys(), ...olomol.doc.texts.keys()].filter((id) => !kept.has(id));
      olomol.change((doc) => moveObjects(doc, lower, 0, 5));
      const atoms = [...olomol.doc.atoms.values()];
      const [xs, ys] = [atoms.map((a) => a.x), atoms.map((a) => a.y)];
      Object.assign(olomol.view, { scale: 36, tx: 640 - 18 * (Math.min(...xs) + Math.max(...xs)), ty: 400 - 18 * (Math.min(...ys) + Math.max(...ys)) });
      olomol.setTool({ name: 'select' });
      olomol.clearSelection();
      const diene = atoms.filter((a) => !kept.has(a.id)).sort((p, q) => p.x - q.x)[0];
      return [diene.x * 36 + olomol.view.tx, diene.y * 36 + olomol.view.ty, lower.length];
    }, top);
    await page.mouse.click(at[0], at[1], { clickCount: 3 });
    await page.waitForTimeout(200);
    const row = await state((top) => {
      const kept = new Set(top);
      const selected = [...olomol.selection];
      const lower = [...olomol.doc.atoms.keys(), ...olomol.doc.arrows.keys(), ...olomol.doc.pluses.keys()].filter((id) => !kept.has(id));
      return { upper: selected.filter((id) => kept.has(id)).length, lower: lower.filter((id) => olomol.selection.has(id)).length, of: lower.length };
    }, top);
    check(row.upper === 0 && row.lower === row.of, `a triple click: its reaction row, all of it (${row.lower} of ${row.of}), none of the row above (${row.upper})`);
  }

  // --- groups: each row grouped, both rows grouped round them; plain clicks act on atoms as ever, Ctrl+click picks
  // the innermost group, again the one round it; Ctrl+drag moves a group; Ctrl+Shift+G one level; in the file ---
  {
    await clear();
    await state(() => window.olomolTest.paste('CC(=O)O.OCC>[H+]>CC(=O)OCC'));
    const top = await state(() => [...olomol.doc.atoms.keys(), ...olomol.doc.arrows.keys(), ...olomol.doc.pluses.keys(), ...olomol.doc.texts.keys()]);
    await state(() => window.olomolTest.paste('C=CC=C.C=C>>C1=CCCCC1'));
    const where = await state(async (top) => {
      const { moveObjects } = await import('/src/model/doc.js');
      const kept = new Set(top);
      const lower = [...olomol.doc.atoms.keys(), ...olomol.doc.arrows.keys(), ...olomol.doc.pluses.keys(), ...olomol.doc.texts.keys()].filter((id) => !kept.has(id));
      olomol.change((doc) => moveObjects(doc, lower, 0, 5));
      const atoms = [...olomol.doc.atoms.values()];
      const [xs, ys] = [atoms.map((a) => a.x), atoms.map((a) => a.y)];
      Object.assign(olomol.view, { scale: 36, tx: 640 - 18 * (Math.min(...xs) + Math.max(...xs)), ty: 400 - 18 * (Math.min(...ys) + Math.max(...ys)) });
      olomol.setTool({ name: 'select' });
      olomol.clearSelection();
      const screen = (a) => [a.x * 36 + olomol.view.tx, a.y * 36 + olomol.view.ty];
      const upper = atoms.filter((a) => kept.has(a.id)).sort((p, q) => p.x - q.x)[0];
      const lowerAtom = atoms.filter((a) => !kept.has(a.id)).sort((p, q) => p.x - q.x)[0];
      return { upper: screen(upper), upperId: upper.id, lower: screen(lowerAtom), lowerId: lowerAtom.id };
    }, top);
    const selected = () => state(() => olomol.selection.size);
    // each row grouped (a triple click, Ctrl+G), then both (Ctrl+A, Ctrl+G)
    for (const at of [where.upper, where.lower]) {
      await page.mouse.click(at[0], at[1], { clickCount: 3 });
      await page.keyboard.press('Control+g');
    }
    const rowSize = await state(async (id) => {
      const { idsOfGroup } = await import('/src/editor/tools/select.js');
      const { groupChain } = await import('/src/editor/grouping.js');
      return idsOfGroup(olomol, groupChain(olomol.doc, id)[0]).length;
    }, where.upperId);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+g');
    const all = await state(() => olomol.selection.size);
    const made = await page.getByTestId('group-chosen').count();
    check(made === 1, `Ctrl+G: the group made selected, outlined (${made})`);
    const nested = await state(() => [...olomol.doc.groups.values()].map((g) => g.members.filter((id) => olomol.doc.groups.has(id)).length).sort().join());
    check(nested === '0,0,2', `Ctrl+G on each row, then on both: two groups in a third (${nested})`);
    // Align on the group of both rows: the rows (the groups one level inside) lined up as blocks, each as drawn
    const aligned = await state(async ([upperId, lowerId]) => {
      const { align } = await import('/src/arrange/align.js');
      const { groupChain } = await import('/src/editor/grouping.js');
      const { idsOfGroup } = await import('/src/editor/tools/select.js');
      const rowOf = (id) => idsOfGroup(olomol, groupChain(olomol.doc, id)[0]).filter((one) => olomol.doc.atoms.has(one)).map((one) => olomol.doc.atoms.get(one));
      const shape = (atoms) => atoms.map((a) => [a.x - atoms[0].x, a.y - atoms[0].y].map((v) => v.toFixed(3)).join()).join(';');
      const [upper, lower] = [rowOf(upperId), rowOf(lowerId)];
      const before = [shape(upper), shape(lower)];
      align(olomol, 'left');
      // (the edge as drawn, with the labels: Align goes by it)
      const left = (atoms) => Math.min(...atoms.flatMap((a) => { const info = olomol.scene.atoms.get(a.id); return [info.pos[0], ...(info.label?.boxes ?? []).map((b) => info.pos[0] + b.x1)]; }));
      return { same: shape(upper) === before[0] && shape(lower) === before[1], apart: Math.abs(left(upper) - left(lower)) };
    }, [where.upperId, where.lowerId]);
    check(aligned.same && aligned.apart < 0.05, `Align left edges on the group of both rows: the rows lined up as blocks, each as drawn (${JSON.stringify(aligned)})`);
    await state(() => olomol.undo());
    // the Objects panel: the groups listed (both rows in one), a row lit in the drawing while pointed at, a click
    // on it selects it
    await state(() => olomol.clearSelection());
    await page.mouse.move(5, 300);
    if (await page.getByTestId('objects-open').count()) await page.getByTestId('objects-open').click();
    await page.getByTestId('objects').waitFor({ timeout: 3000 }).catch(() => {});
    const listed = await page.locator('.object-row').count();
    await page.locator('.object-row .fold').first().click();
    const unfolded = await page.locator('.object-row').count();
    await page.locator('.object-row').nth(1).hover();
    const lit = await page.getByTestId('box-taking').locator('> *').count();
    await page.locator('.object-row').nth(1).click();
    const byList = await selected();
    // a double click on a group names it; a row dragged onto another group goes into it (undone after)
    await page.locator('.object-row').nth(1).dblclick();
    await page.getByTestId('group-rename').fill('Route A');
    await page.getByTestId('group-rename').press('Enter');
    const named = await page.locator('.object-row').nth(1).locator('.name').textContent();
    // (dragged as a person does: pressed, moved, let go over the target)
    const dragRow = async (fromLocator, toLocator) => {
      const a = await fromLocator().boundingBox();
      await page.mouse.move(a.x + 60, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + 70, a.y + a.height / 2 - 6, { steps: 3 });
      const b = await toLocator().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    };
    const shape = () => state(() => [...olomol.doc.groups.values()].map((g) => `${g.name ?? '-'}:${g.members.filter((id) => olomol.doc.groups.has(id)).length}`).sort().join());
    await dragRow(() => page.locator('.object-row').nth(2), () => page.locator('.object-row').nth(1));
    const regrouped = await shape();
    await state(() => olomol.undo());
    // the strip over the panel's head: out of its group
    // (the lower row's group: the last row, Route A being unfolded now)
    await dragRow(() => page.locator('.object-row').last(), () => page.getByTestId('objects-out'));
    const out = await shape();
    await state(() => { olomol.undo(); olomol.undo(); });
    await page.getByTestId('objects-close').click();
    check(named === 'Route A' && regrouped === '-:0,-:1,Route A:1' && out === '-:0,-:1,Route A:0',
      `Objects panel: a group named by a double click (${named}), the other row dragged into it (${regrouped}), dragged out of its group (${out})`);
    check(listed === 1 && unfolded === 3 && lit > 0 && byList === rowSize,
      `Objects panel: one group listed (${listed}), unfolded its two rows (${unfolded} rows), a row lit while pointed at (${lit}), clicked: selected (${byList} of ${rowSize})`);
    // a plain click: the atom, as ever
    await page.mouse.click(where.upper[0], where.upper[1]);
    check((await selected()) === 1, `a plain click on a grouped atom: the atom alone (${await selected()})`);
    // by clicks alone: the right-click menu's Select its group, then Group round it; the Objects panel's Ungroup
    await page.mouse.click(where.upper[0], where.upper[1], { button: 'right' });
    await page.getByTestId('context-select-group').click();
    const byMenu = await selected();
    await page.mouse.click(where.upper[0], where.upper[1], { button: 'right' });
    const roundIt = await page.getByTestId('context-select-group').textContent();
    await page.getByTestId('context-select-group').click();
    const outerByMenu = await selected();
    await page.getByTestId('objects-open').click();
    const canUngroup = await page.getByTestId('objects-ungroup').isEnabled();
    await page.getByTestId('objects-close').click();
    check(byMenu === rowSize && outerByMenu === all && /Group round it/.test(roundIt) && canUngroup,
      `by clicks: the right-click menu's Select its group (${byMenu} of ${rowSize}), then ${roundIt.trim()} (${outerByMenu} of ${all}); the Objects panel's Ungroup offered (${canUngroup})`);
    await page.mouse.click(where.upper[0], where.upper[1]);
    // a box dragged with Ctrl round one atom: the whole outermost group it touches (both rows)
    await state(() => olomol.clearSelection());
    await page.keyboard.down('Control');
    await page.mouse.move(where.upper[0] - 30, where.upper[1] - 30);
    await page.mouse.down();
    await page.mouse.move(where.upper[0] + 8, where.upper[1] + 8, { steps: 4 });
    // (while dragging: what letting go would select, shown)
    const shown = await state(() => [...(olomol.preview?.taking ?? [])].sort().join());
    const halos = await page.getByTestId('box-taking').locator('> *').count();
    await page.mouse.up();
    await page.keyboard.up('Control');
    const boxed = await selected();
    const taken = await state(() => [...olomol.selection].sort().join());
    check(boxed === all && shown === taken && halos > 0, `a Ctrl box round one atom: the whole group round it (${boxed} of ${all}), shown while dragging as it is selected after (${shown === taken}, ${halos} halos)`);
    await state(() => olomol.clearSelection());
    // the outline while Ctrl is held, then Ctrl+click: the row; again: both rows
    await page.mouse.move(where.upper[0] + 1, where.upper[1]);
    await page.keyboard.down('Control');
    await page.mouse.move(where.upper[0], where.upper[1]);
    await page.waitForTimeout(100);
    const outline = await page.getByTestId('group-outline').count();
    const outlined = await page.locator('.group-box').count();
    await page.mouse.click(where.upper[0], where.upper[1]);
    const first = await selected();
    await page.mouse.click(where.upper[0], where.upper[1]);
    const second = await selected();
    await page.keyboard.up('Control');
    check(outline === 1 && outlined === 3 && first === rowSize && second === all,
      `Ctrl held: every group outlined (${outlined} of 3), the one under the pointer stronger (${outline}); Ctrl+click: its row (${first} of ${rowSize}), again: both rows (${second} of ${all})`);
    // Ctrl+drag on the lower row (not selected): that row moves, the upper one stays
    const before = await state((ids) => ids.map((id) => [olomol.doc.atoms.get(id).x, olomol.doc.atoms.get(id).y]), [where.upperId, where.lowerId]);
    await state(() => olomol.clearSelection()); // (nothing selected)
    await page.keyboard.down('Control');
    await page.mouse.move(where.lower[0], where.lower[1]);
    await page.mouse.down();
    await page.mouse.move(where.lower[0] + 40, where.lower[1] + 20, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    const after = await state((ids) => ids.map((id) => [olomol.doc.atoms.get(id).x, olomol.doc.atoms.get(id).y]), [where.upperId, where.lowerId]);
    const moved = (k) => Math.hypot(after[k][0] - before[k][0], after[k][1] - before[k][1]);
    check(moved(0) < 1e-9 && moved(1) > 0.5,
      `Ctrl+drag on the lower row: it moves (${moved(1).toFixed(2)}), the upper row stays (${moved(0).toFixed(2)})`);
    // kept in the file, nested as it was
    const back = await state(async () => {
      const { readOlom, writeOlom } = await import('/src/io/olom.js');
      const text = writeOlom(olomol.doc, {});
      const { doc } = readOlom(text);
      return { groups: JSON.parse(text).groups?.length, read: [...doc.groups.values()].map((g) => g.members.filter((id) => doc.groups.has(id)).length).sort().join() };
    });
    check(back.groups === 3 && back.read === '0,0,2', `the groups in the file and back, nested (${JSON.stringify(back)})`);
    // Ctrl+Shift+G on both rows: one level apart (the rows still groups); undo: as it was
    await page.keyboard.down('Control');
    await page.mouse.click(where.upper[0], where.upper[1]);
    await page.mouse.click(where.upper[0], where.upper[1]);
    await page.keyboard.up('Control');
    await page.keyboard.press('Control+Shift+G');
    const apart = await state(() => olomol.doc.groups.size);
    await page.keyboard.press('Control+z');
    const undone = await state(() => olomol.doc.groups.size);
    check(apart === 2 && undone === 3, `Ctrl+Shift+G: one level apart (${apart} groups left, the rows), undo: back (${undone})`);
  }

  // --- Align reaction scheme over a bracket round resonance forms and their arrow (J): the bracket with all that is
  // in it one block, in its place in the row, the reaction in it lined up and the bracket fitted round it; no wide
  // gap after the first molecule. With only the bracket and what is in it selected: that lined up ---
  for (const what of ['all', 'bracket']) {
    await clear();
    const order = await state(async (what) => {
      const { readMolfile } = await import('/src/io/molfile.js');
      const { smilesToMolfile } = await import('/src/io/rdkit.js');
      const { addArrow, addBracket, copyObjects, emptyDoc } = await import('/src/model/doc.js');
      const { fragments } = await import('/src/model/graph.js');
      const { alignReaction } = await import('/src/arrange/align.js');
      const doc = emptyDoc();
      const place = async (smiles, x, y) => {
        const part = readMolfile(await smilesToMolfile(smiles)).doc;
        const atoms = [...part.atoms.values()];
        const middle = (key) => (Math.min(...atoms.map((a) => a[key])) + Math.max(...atoms.map((a) => a[key]))) / 2;
        copyObjects(part, [...part.atoms.keys()], x - middle('x'), y - middle('y'), doc);
      };
      // (acetone, its protonated form and the cation as resonance forms in brackets, the cation well below the
      // resonance arrow's line, the enol)
      await place('CC(C)=O', 0, 0);
      addArrow(doc, 2.5, 0, 5.5, 0, 'forward');
      await place('CC(C)=[OH+]', 9, 0.2);
      const resonance = addArrow(doc, 11.5, 0.1, 14.5, 0.1, 'resonance').id;
      await place('C[C+](C)O', 17.5, 0.9);
      const bracket = addBracket(doc, 7, -2, 20, 2.5).id;
      addArrow(doc, 21.5, 0, 24.5, 0, 'forward');
      await place('C=C(C)O', 27, 0);
      olomol.setDoc(doc);
      const forms = fragments(doc).filter((members) => members.some((id) => doc.atoms.get(id).x > 7 && doc.atoms.get(id).x < 20));
      if (what === 'all') olomol.selectAll();
      else olomol.select([bracket, resonance, ...forms.flat()]);
      alignReaction(olomol);
      const d = olomol.doc;
      const br = d.brackets.get(bracket);
      const arrow = d.arrows.get(resonance);
      const firstForward = [...d.arrows.values()].filter((a) => a.kind === 'forward').sort((p, q) => p.x1 - q.x1)[0];
      const spans = forms.map((members) => members.map((id) => d.atoms.get(id)));
      const formsIn = spans.every((atoms) => atoms.every((a) => a.x > Math.min(br.x1, br.x2) && a.x < Math.max(br.x1, br.x2) && a.y > Math.min(br.y1, br.y2) && a.y < Math.max(br.y1, br.y2)));
      // (each form's skeleton middle on the resonance arrow's line, near enough: lined up by the atoms' symbols)
      const off = Math.max(...spans.map((atoms) => Math.abs((Math.min(...atoms.map((a) => a.y)) + Math.max(...atoms.map((a) => a.y))) / 2 - arrow.y1)));
      return { left: Math.min(br.x1, br.x2), right: Math.max(br.x1, br.x2), arrow: Math.min(arrow.x1, arrow.x2), arrowRight: Math.max(arrow.x1, arrow.x2), formsIn, off,
        gap: firstForward.x1 - Math.max(...[...d.atoms.values()].filter((a) => a.x < 1.5).map((a) => a.x)) };
    }, what);
    check(order.arrow > order.left && order.arrowRight < order.right && order.formsIn && order.off < 0.3 && (what === 'bracket' || order.gap < 2),
      `Align reaction scheme over resonance forms in brackets (${what === 'all' ? 'all selected' : 'only the bracket and what is in it'}): the resonance arrow inside the bracket (${order.arrow.toFixed(1)}–${order.arrowRight.toFixed(1)} in ${order.left.toFixed(1)}–${order.right.toFixed(1)}), the forms in it and on the arrow's line (${order.formsIn}, ${order.off.toFixed(2)} off)${what === 'all' ? `, no gap after the first molecule (${order.gap.toFixed(1)})` : ''}`);
  }
}
