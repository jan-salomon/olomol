// The browser check: Templates and labels: templates, abbreviations drawn out and back, labels on stereocentres.
// Run alone: npm run check -- --only labels [url]

import {
  atomXY, canonical, check, clear, clickAt, counts, dragBetween, drawnSmiles, layoutDone, notice, page, paste, state, tool,
} from './harness.mjs';
// (its parts, in the order run:)
//   templates
//   an abbreviation takes no second bond (Ph): bond, drag, label, Shift+atom refused; one drawn so is ringed red
//   abbreviations
//   abbreviating keeps the stereochemistry: cocaine with its benzoate and its methyl ester as OBz and
//   two labels on one stereocentre (CO2Me and Ph on the same carbon), turned in 3D: each label its own
//   a whole molecule written as one label (PPh3), its P in phosphorus's colour, drawn out and back;
export default async function run() {
  // --- templates ---
  await clear();
  await page.getByTestId('templates').click();
  await page.getByRole('button', { name: 'Amino acids', exact: true }).click();
  await page.locator('[data-testid=template]', { hasText: 'Phenylalanine' }).click();
  await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 20_000 }).catch(() => {});
  await page.mouse.move(600, 400);
  await page.mouse.move(650, 420);
  check((await page.locator('.ghost-copy').count()) === 1 && (await counts()).atoms === 0, 'a template follows the pointer, see-through, until a click');
  await page.mouse.click(650, 420);
  check((await drawnSmiles()) === canonical('N[C@@H](Cc1ccccc1)C(=O)O'), 'template placed: L-phenylalanine, with its stereo');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // amino acids come out the same way round: backbone N left, C=O down
  const backbone = await state(() => {
    const atoms = [...olomol.doc.atoms.values()];
    const n = atoms.find((a) => a.el === 'N');
    const o = atoms.filter((a) => a.el === 'O');
    return { nLeft: n.x < Math.min(...o.map((a) => a.x)) };
  });
  check(backbone.nLeft, 'amino acid templates: the backbone as H2N–CH(R)–COOH');
  await clear();
  await page.getByTestId('templates').click();
  await page.getByTestId('template-search').fill('glucose');
  const found = await page.locator('[data-testid=template]').allTextContents();
  check(found.length >= 3 && found.every((t) => /glucose/i.test(t)), `template search "glucose": ${found.join(', ')}`);
  await page.keyboard.press('Escape');
  // a SMILES typed into the search draws it (here, offline); an InChI pasted too
  await clear();
  await page.getByTestId('templates').click();
  await page.getByTestId('template-search').fill('CC(=O)Nc1ccc(O)cc1');
  await page.getByTestId('draw-identifier').click();
  await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 20_000 }).catch(() => {});
  await page.mouse.move(600, 400);
  await page.mouse.click(620, 410);
  check((await drawnSmiles()) === canonical('CC(=O)Nc1ccc(O)cc1'), `search field: a SMILES drawn from it (${await drawnSmiles()})`);
  await page.keyboard.press('Escape');
  check((await state(() => olomol.tool.name)) === 'select', 'one Esc ends placing');
  await clear();
  await paste('InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3');
  await page.waitForFunction(() => olomol.doc.atoms.size > 0, null, { timeout: 30_000 }).catch(() => {});
  check((await drawnSmiles()) === canonical('CCO'), `pasted InChI: ethanol (${await drawnSmiles()})`);
  // the dock's Name / SMILES button and the / key: Enter draws an InChI or a SMILES here
  await clear();
  await page.getByTestId('from-name').click();
  await page.getByTestId('from-name-field').fill('InChI=1S/C3H6O/c1-3(2)4/h1-2H3');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 }).catch(() => {});
  await page.mouse.move(600, 400);
  await page.mouse.click(620, 410);
  check((await drawnSmiles()) === canonical('CC(C)=O'), `Name / SMILES: an InChI and Enter (${await drawnSmiles()})`);
  await page.keyboard.press('Escape');
  await clear();
  await page.mouse.move(700, 300);
  await page.keyboard.press('/');
  await page.getByTestId('from-name-field').fill('c1ccncc1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 20_000 }).catch(() => {});
  await page.mouse.move(600, 400);
  await page.mouse.click(620, 410);
  check((await drawnSmiles()) === canonical('c1ccncc1'), `/ opens it: a SMILES and Enter (${await drawnSmiles()})`);
  await page.keyboard.press('Escape');
  await clear();
  await paste('CCO');
  await state(() => olomol.selectAll());
  await page.getByTestId('formula').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.ident .name')].some((n) => n.textContent === 'InChIKey'), null, { timeout: 20_000 }).catch(() => {});
  const info = Object.fromEntries(await page.locator('.ident').evaluateAll((rows) => rows.map((r) => [r.querySelector('.name').textContent, r.querySelector('code').textContent])));
  check(info.InChI === 'InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3' && info.InChIKey === 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N' && info['[M+H]⁺'] === '47.0491' && info['Anal. calcd'] === 'C 52.14, H 13.13',
    `a click on the formula: masses, HRMS, elemental analysis, SMILES, InChI, InChIKey (${JSON.stringify(info)})`);
  // it closes for another molecule, and once nothing is selected
  const ethanol = await state(() => [...olomol.selection]);
  await paste('CC');
  const other = await page.locator('.info-card').count();
  await state((ids) => olomol.select(ids), ethanol);
  const back = await page.locator('.info-card').count();
  await page.getByTestId('formula').click();
  await page.mouse.click(250, 650);
  await state((ids) => olomol.select(ids), ethanol);
  const again = await page.locator('.info-card').count();
  check(other === 0 && back === 0 && again === 0, `the info list closes for another molecule and on a click on the empty canvas (${[other, back, again]})`);
  // a functional group attached to an atom
  await clear();
  await paste('c1ccccc1');
  await state(() => olomol.clearSelection());
  await page.getByTestId('templates').click();
  await page.getByRole('button', { name: 'Functional groups', exact: true }).click();
  await page.locator('[data-testid=template]', { hasText: 'Carboxylic acid' }).click();
  await page.waitForFunction(() => olomol.tool.name === 'group', null, { timeout: 20_000 }).catch(() => {});
  await clickAt(await atomXY((await state(() => [...olomol.doc.atoms.keys()]))[0]));
  check((await drawnSmiles()) === canonical('OC(=O)c1ccccc1'), `functional group: COOH attached to benzene (${await drawnSmiles()})`);
  // with Shift on the end carbon of pentane, that carbon becomes the group's C: pentanoic acid; dragged
  // from it, the group goes where it is dragged (hexanoic acid, its C straight below)
  await state(() => { window.coohTool = olomol.tool; });
  await clear();
  await paste('CCCCC');
  await state(() => { olomol.clearSelection(); olomol.setTool(window.coohTool); });
  const pentaneEnd = (await state(() => [...olomol.doc.atoms.keys()]))[0];
  await page.keyboard.down('Shift');
  await clickAt(await atomXY(pentaneEnd));
  await page.keyboard.up('Shift');
  const fusedAcid = await drawnSmiles();
  await clear();
  await paste('CCCCC');
  await state(() => { olomol.clearSelection(); olomol.setTool(window.coohTool); });
  const chainEnd = await state(() => { const a = [...olomol.doc.atoms.values()][0]; return [a.id, a.x, a.y]; });
  await dragBetween([chainEnd[1], chainEnd[2]], [chainEnd[1], chainEnd[2] + 2]);
  const draggedAcid = await drawnSmiles();
  const below = await state(([id, x, y]) => {
    const bond = [...olomol.doc.bonds.values()].find((b) => (b.a === id || b.b === id) && olomol.doc.atoms.get(b.a === id ? b.b : b.a).y > y + 0.5);
    const c = bond && olomol.doc.atoms.get(bond.a === id ? bond.b : bond.a);
    return c ? [Math.abs(c.x - x).toFixed(2), (c.y - y).toFixed(2)].join() : 'none';
  }, chainEnd);
  check(fusedAcid === canonical('CCCCC(=O)O') && draggedAcid === canonical('CCCCCC(=O)O') && below === '0.00,1.00',
    `functional group: Shift+click on pentane's end carbon gives pentanoic acid (${fusedAcid}); dragged down from it, hexanoic acid with the COOH straight below (${draggedAcid}; ${below})`);
  await page.keyboard.press('Escape');
  // a chair
  await clear();
  await page.getByTestId('templates').click();
  await page.getByRole('button', { name: 'Conformations and projections', exact: true }).click();
  await page.locator('[data-testid=template]', { hasText: 'β-D-Glucose, chair' }).click();
  await page.mouse.move(600, 400);
  await page.mouse.click(620, 410);
  {
    const betaD = canonical('OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O');
    // (SDF through Indigo, which reads only wedges: they are on the chair)
    const sdf = canonical((await state(() => window.olomolTest.writeAs('sdf'))).split('$$$$')[0], { removeHs: true });
    check((await drawnSmiles()) === betaD && sdf === betaD, `chair template: β-D-glucose, read from the chair, and so in an SDF through Indigo (${await drawnSmiles()}, ${sdf})`);
    // Redraw: no drawing left out for changing it (Indigo's clean-up evens the ring out, its wedges kept as they read)
    await state(() => olomol.selectAll());
    await page.getByTestId('relayout').click();
    await page.getByTestId('layout-card').first().waitFor({ timeout: 60_000 });
    await layoutDone();
    const cards = await page.getByTestId('layout-card').count();
    const leftOut = await page.getByText('Some drawings were left out').count();
    await page.keyboard.press('Escape');
    check(cards >= 3 && !leftOut, `Redraw of the β-D-glucose chair: ${cards} drawings, none left out for changing its stereo`);
  }

  // --- abbreviations ---
  await clear();
  await paste('COc1ccccc1');
  // highlighted, the OMe and its bonds (J, 2026-11-11: Draw out lost the highlight): kept both ways
  const HL = '#ffd0d0';
  await state((HL) => olomol.change((doc) => {
    const o = [...doc.atoms.values()].find((a) => a.el === 'O');
    for (const b of doc.bonds.values()) {
      if (b.a !== o.id && b.b !== o.id) continue;
      b.highlight = HL;
      const other = doc.atoms.get(b.a === o.id ? b.b : b.a);
      if ([...doc.bonds.values()].filter((x) => x.a === other.id || x.b === other.id).length === 1) other.highlight = HL;
    }
    o.highlight = HL;
  }), HL);
  const looks = () => state(() => {
    const o = [...olomol.doc.atoms.values()].find((a) => a.el === 'O' || a.alias === 'OMe');
    const bonds = [...olomol.doc.bonds.values()].filter((b) => b.a === o.id || b.b === o.id);
    const ends = bonds.map((b) => olomol.doc.atoms.get(b.a === o.id ? b.b : b.a));
    return { o: o.highlight ?? null, bonds: bonds.map((b) => b.highlight ?? null), ends: ends.map((a) => [a.el, a.highlight ?? null]) };
  });
  await state(() => {
    const atoms = [...olomol.doc.atoms.values()];
    const o = atoms.find((a) => a.el === 'O');
    const me = [...olomol.doc.bonds.values()].map((b) => (b.a === o.id ? b.b : b.b === o.id ? b.a : null)).filter((n) => n !== null)
      .find((n) => [...olomol.doc.bonds.values()].filter((b) => b.a === n || b.b === n).length === 1);
    olomol.select([o.id, me]);
  });
  await page.getByTestId('abbreviate').click();
  await page.waitForFunction(() => [...olomol.doc.atoms.values()].some((a) => a.alias === 'OMe'), null, { timeout: 20_000 }).catch(() => {});
  const abbreviated = await state(() => ({ atoms: olomol.doc.atoms.size, formula: document.querySelector('.formula')?.textContent }));
  check(abbreviated.atoms === 7 && abbreviated.formula.startsWith('C7H8O'), `Abbreviate: O–CH3 becomes OMe, the formula stays C7H8O (${JSON.stringify(abbreviated)})`);
  const asLabel = await looks();
  check(asLabel.o === HL && asLabel.bonds.join() === HL, `Abbreviate keeps the highlight: on the OMe and its bond (${JSON.stringify(asLabel)})`);
  const exported = await state(() => window.olomolTest.writeAs('smiles'));
  check(canonical(exported) === canonical('COc1ccccc1'), `files get the OMe as atoms (${exported})`);
  await page.getByTestId('draw-out').click();
  await page.waitForFunction(() => olomol.doc.atoms.size === 8, null, { timeout: 20_000 }).catch(() => {});
  check((await drawnSmiles()) === canonical('COc1ccccc1'), 'Draw out: the OMe as O and CH3 again');
  const drawn = await looks();
  check(drawn.o === HL && drawn.bonds.every((h) => h === HL) && drawn.bonds.length === 2 && drawn.ends.every(([, h]) => h === HL || h === null)
    && drawn.ends.some(([el, h]) => el === 'C' && h === HL),
  `Draw out keeps it: on the O, the CH3, the bond between them and the bond to the ring (${JSON.stringify(drawn)})`);

  // --- a selection with no abbreviation as a whole: the group in it that has one (CH2NMe2 selected: CH2–NMe2) ---
  {
    await clear();
    await paste('CN(C)Cc1ccccc1');
    const part = await state(() => {
      const atoms = [...olomol.doc.atoms.values()];
      const n = atoms.find((a) => a.el === 'N');
      const near = [...olomol.doc.bonds.values()].filter((b) => b.a === n.id || b.b === n.id).map((b) => (b.a === n.id ? b.b : b.a));
      return [n.id, ...near]; // (N, its two CH3 and the CH2)
    });
    await state((ids) => window.olomolTest.abbreviate(ids), part);
    const labels = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.alias).join());
    const identified = canonical(await state(() => window.olomolTest.chemistry()));
    check(labels === 'NMe2' && identified === canonical('CN(C)Cc1ccccc1') && (await state(() => olomol.doc.atoms.size)) === 8,
      `CH2NMe2 selected (no abbreviation as a whole): NMe2 written, the CH2 left drawn, the same molecule (${labels})`);
    check(/NMe2/.test(await notice()), `and said (${await notice()})`);
  }
  // a piece in the middle of a chain selected with a group: only the group written (alone, Abbreviate isn't
  // offered for the piece, so it isn't one with others either); its CH3 stays drawn
  {
    await clear();
    await paste('COc1ccc(C(C)CC)cc1');
    const ids = await state(() => {
      const ring = new Set(olomol.scene.rings.flat());
      const near = (id) => [...olomol.doc.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
      const atoms = [...olomol.doc.atoms.values()];
      const o = atoms.find((a) => a.el === 'O').id;
      const ch = atoms.find((a) => a.el === 'C' && !ring.has(a.id) && near(a.id).length === 3).id;
      const methyl = (id) => near(id).find((n) => !ring.has(n) && near(n).length === 1);
      return [o, methyl(o), ch, methyl(ch)];
    });
    await state(() => olomol.clearNotice());
    await state((ids) => window.olomolTest.abbreviate(ids), ids);
    const labels = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.alias).join());
    check(labels === 'OMe' && !/No abbreviation for all/.test(await notice()),
      `OMe and a CH(CH3) in a chain selected: only OMe written (${labels}; "${await notice()}")`);
    // one CH3 alone selected: Abbreviate offered, it becomes Me (as two separate CH3 did); the CH, a carbon
    // with three bonds, isn't offered it
    const [, , ch, methyl] = ids;
    await state((id) => olomol.select([id]), ch);
    const onCh = await page.getByTestId('abbreviate').count();
    await state((id) => olomol.select([id]), methyl);
    const onMethyl = await page.getByTestId('abbreviate').count();
    if (onMethyl) await page.getByTestId('abbreviate').click();
    await page.waitForFunction(() => [...olomol.doc.atoms.values()].some((a) => a.alias === 'Me'), null, { timeout: 20_000 }).catch(() => {});
    const after = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.alias).sort().join());
    check(onCh === 0 && onMethyl === 1 && after === 'Me,OMe', `one CH3 selected: Abbreviate offered (${onMethyl}; on the CH: ${onCh}), Me written (${after})`);
  }

  // --- abbreviating keeps the stereochemistry: cocaine with its benzoate and its methyl ester as OBz and
  // CO2Me is still cocaine (the wedges stay on the bonds to the labels, also when drawn out to identify it)
  {
    const COCAINE = 'COC(=O)[C@H]1[C@@H](OC(=O)c2ccccc2)C[C@@H]2CC[C@H]1N2C';
    await clear();
    await paste(COCAINE);
    const ids = await state(() => [...olomol.doc.atoms.keys()].sort((p, q) => p - q));
    await state((part) => window.olomolTest.abbreviate(part), ids.slice(6, 15)); // O–C(=O)–Ph
    await state((part) => window.olomolTest.abbreviate(part), ids.slice(0, 4)); // CH3–O–C(=O)
    const labels = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.alias).sort().join());
    const identified = canonical(await state(() => window.olomolTest.chemistry()));
    check(labels === 'CO2Me,OBz' && identified === canonical(COCAINE), `abbreviated as ${labels}, cocaine is still cocaine (${identified === canonical(COCAINE)}: ${identified})`);
    // drawn out again (the panel's button, OBz selected after abbreviating), Abbreviate offered at once, and back
    await state(() => olomol.select([...olomol.doc.atoms.values()].filter((a) => a.alias === 'OBz').map((a) => a.id)));
    await page.getByTestId('draw-out').click();
    await page.getByTestId('abbreviate').waitFor({ timeout: 5000 }).catch(() => {});
    const offered = await page.getByTestId('abbreviate').count();
    if (offered) await page.getByTestId('abbreviate').click();
    await page.waitForTimeout(200);
    const back = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.alias).sort().join());
    check(offered === 1 && back === 'CO2Me,OBz', `drawn out, Abbreviate is offered straight away (${offered}) and writes OBz again (${back})`);
    // turned in 3D with its labels (built with the groups drawn out) and drawn as seen: still cocaine
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 }).catch(() => {});
    const turned = await page.getByTestId('turn3d-stage').count();
    if (turned) await page.getByTestId('turn3d-use').click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const seen = canonical(await state(() => window.olomolTest.chemistry()));
    check(turned === 1 && seen === canonical(COCAINE), `cocaine with OBz and CO2Me turned in 3D (${turned ? 'a model' : 'no model'}) and drawn as seen: still cocaine (${seen})`);
  }

  // --- a charged group collapsed and drawn out again: p-toluenesulfonate's SO3⁻ (before, only SO3H could be) ---
  {
    const TOSYLATE = 'Cc1ccc(cc1)S(=O)(=O)[O-]';
    await clear();
    await paste(TOSYLATE);
    const ids = await state(() => [...olomol.doc.atoms.keys()].sort((p, q) => p - q));
    await state((part) => window.olomolTest.abbreviate(part), ids.slice(7, 11)); // S, O, O, O⁻
    const label = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => `${a.alias} ${a.charge}`).join());
    const same = canonical(await state(() => window.olomolTest.chemistry()));
    await state(() => olomol.select([...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.id)));
    await page.getByTestId('draw-out').click();
    await page.waitForTimeout(300);
    const drawn = canonical(await state(() => window.olomolTest.molfile()));
    check(label === 'SO3 -1' && same === canonical(TOSYLATE) && drawn === canonical(TOSYLATE),
      `a sulfonate abbreviated as SO3⁻ (${label}), still tosylate (${same === canonical(TOSYLATE)}), drawn out again with its O⁻ (${drawn})`);
  }

  // --- drawn out on the grid: CHO, OMe, Et and nBu on a chain, each bond at a multiple of 30° (RDKit draws their
  // first angle 122°, so before, the C=O of a CHO lay 2° off) ---
  {
    const off = await page.evaluate(async () => {
      const D = await import('/src/model/doc.js');
      const A = await import('/src/editor/abbreviate.js');
      const worst = {};
      for (const name of ['CHO', 'OMe', 'Et', 'nBu']) {
        const doc = D.emptyDoc();
        const c0 = D.addAtom(doc, -0.5, -0.866, 'C');
        const c = D.addAtom(doc, 0, 0, 'C');
        D.addBond(doc, c0.id, c.id);
        const label = D.addAtom(doc, 1, 0, '*', { alias: name });
        D.addBond(doc, c.id, label.id);
        olomol.setDoc(doc);
        await A.drawOutAbbreviations(olomol, [label.id]);
        worst[name] = Math.max(...[...olomol.doc.bonds.values()].map((b) => {
          const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
          const r = ((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 360) % 30;
          return +Math.min(r, 30 - r).toFixed(1);
        }));
      }
      return worst;
    });
    check(Object.values(off).every((d) => d <= 1), `groups drawn out lie on the 30° grid (the most any bond is off: ${JSON.stringify(off)})`);
    await clear();
  }

  // --- two labels on one stereocentre (CO2Me and Ph on the same carbon), turned in 3D: each label its own
  // group's atom in the model, the molecule as it was ---
  {
    const ESTER = 'C[C@@H](C(=O)OC)c1ccccc1';
    await clear();
    await paste(ESTER);
    const ids = await state(() => [...olomol.doc.atoms.keys()].sort((p, q) => p - q));
    await state((part) => window.olomolTest.abbreviate(part), ids.slice(6, 12)); // Ph
    await state((part) => window.olomolTest.abbreviate(part), ids.slice(2, 6)); // CO2Me
    const labels = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.alias).sort().join());
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 }).catch(() => {});
    const turned = await page.getByTestId('turn3d-stage').count();
    if (turned) await page.getByTestId('turn3d-use').click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const seen = canonical(await state(() => window.olomolTest.chemistry()));
    const apart = await state(() => { const l = [...olomol.doc.atoms.values()].filter((a) => a.alias); return Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y) > 0.5; });
    check(labels === 'CO2Me,Ph' && turned === 1 && apart && seen === canonical(ESTER), `${labels} on one stereocentre, turned in 3D: a model (${turned}), the labels apart (${apart}), the same molecule (${seen})`);
  }

  // --- a whole molecule written as one label (PPh3), its P in phosphorus's colour, drawn out and back;
  // a label typed as an atom with groups (Et3N) counts as its molecule ---
  {
    const PPH3 = 'P(c1ccccc1)(c1ccccc1)c1ccccc1';
    await clear();
    await paste(PPH3);
    await state(() => olomol.selectAll());
    await page.getByTestId('abbreviate').waitFor({ timeout: 10_000 }).catch(() => {});
    const offered = await page.getByTestId('abbreviate').textContent().catch(() => '');
    if (offered.includes('PPh3')) await page.getByTestId('abbreviate').click();
    await page.waitForTimeout(300);
    const label = await state(() => [...olomol.doc.atoms.values()].map((a) => a.alias ?? a.el).join());
    const same = canonical(await state(() => window.olomolTest.chemistry())) === canonical(PPH3);
    // (its P in its own colour, the Ph in the ink's)
    const colours = await state(() => [...document.querySelectorAll('.drawing text')].filter((x) => ['P', 'Ph'].includes(x.textContent)).map((x) => `${x.textContent}:${x.getAttribute('fill') ? 'coloured' : 'ink'}`).sort().join());
    await state(() => olomol.selectAll());
    await page.getByTestId('draw-out').click().catch(() => {});
    await page.waitForTimeout(300);
    const drawn = await state(() => olomol.doc.atoms.size);
    const back = canonical(await state(() => window.olomolTest.chemistry())) === canonical(PPH3);
    const again = await page.getByTestId('abbreviate').waitFor({ timeout: 10_000 }).then(() => page.getByTestId('abbreviate').textContent(), () => '');
    check(offered.includes('PPh3') && label === 'PPh3' && same && colours === 'P:coloured,Ph:ink' && drawn === 19 && back && again.includes('PPh3'),
      `PPh3: offered (${offered}), one label (${label}), still PPh3 (${same}), coloured (${colours}); drawn out (${drawn} atoms, the same: ${back}), offered again (${again})`);
    // the three rings alone selected: each a Ph label; then the whole: PPh3 (labels count as its groups)
    await clear();
    await paste(PPH3);
    await state(() => olomol.select([...olomol.doc.atoms.values()].filter((a) => a.el !== 'P').map((a) => a.id)));
    await page.getByTestId('abbreviate').click().catch(() => {});
    await page.waitForTimeout(300);
    const rings = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.alias).join());
    await state(() => olomol.selectAll());
    const whole = await page.getByTestId('abbreviate').waitFor({ timeout: 10_000 }).then(() => page.getByTestId('abbreviate').textContent(), () => '');
    // Ph3P=O: the P with its rings selected, PPh3 on the O by the double bond, the P next to it; the same molecule
    const OXIDE = 'O=P(c1ccccc1)(c1ccccc1)c1ccccc1';
    await clear();
    await paste(OXIDE);
    await state(() => olomol.select([...olomol.doc.atoms.values()].filter((a) => a.el !== 'O').map((a) => a.id)));
    await page.getByTestId('abbreviate').click().catch(() => {});
    await page.waitForTimeout(300);
    const oxide = await state(() => { const l = [...olomol.doc.atoms.values()].find((a) => a.alias); const b = [...olomol.doc.bonds.values()].find((x) => x.a === l?.id || x.b === l?.id); return `${l?.alias}${b?.order === 2 ? '=O' : ''}`; });
    const oxideSame = canonical(await state(() => window.olomolTest.chemistry())) === canonical(OXIDE);
    check(rings === 'Ph,Ph,Ph' && whole.includes('PPh3') && oxide === 'PPh3=O' && oxideSame,
      `three rings selected: ${rings}, then the whole offered as ${whole}; Ph3P=O: ${oxide}, the same molecule (${oxideSame})`);
    await clear();
    await state(() => olomol.change((doc) => window.olomolTest.addAtom(doc, 0, 0, '*', { alias: 'Et3N' })));
    const amine = canonical(await state(() => window.olomolTest.chemistry()));
    check(amine === canonical('CCN(CC)CC'), `a label typed Et3N counts as triethylamine (${amine})`);
  }

  // --- an abbreviation takes no second bond: Ph is C6H5, on one bond ---
  {
    await clear();
    await tool('bond').click();
    await page.mouse.click(600, 450);
    let ids = await state(() => [...olomol.doc.atoms.keys()]);
    await clickAt(await atomXY(ids[1]));
    ids = await state(() => [...olomol.doc.atoms.keys()]);
    const [, middle, end] = ids;
    await state(() => olomol.setTool({ name: 'atom', el: '*', alias: 'Ph' }));
    await clickAt(await atomXY(end));
    const before = await counts();
    const steps = await state(() => olomol.undoStack.length);
    const refused = [];
    // the bond tool's click on Ph, a bond pulled out of it, Ph typed on the middle carbon, O on Ph with Shift
    await state(() => olomol.setTool({ name: 'bond', order: 1, stereo: '' }));
    await clickAt(await atomXY(end));
    refused.push([await counts(), await notice()]);
    const phXY = await atomXY(end);
    await dragBetween(phXY, [phXY[0] + 1, phXY[1] + 0.5]);
    refused.push([await counts(), await notice()]);
    await state(() => olomol.setTool({ name: 'atom', el: '*', alias: 'Ph' }));
    await clickAt(await atomXY(middle));
    refused.push([await counts(), await notice()]);
    await state(() => olomol.setTool({ name: 'atom', el: 'O' }));
    await page.keyboard.down('Shift');
    await clickAt(phXY);
    await page.keyboard.up('Shift');
    refused.push([await counts(), await notice()]);
    const labels = await state(() => [...olomol.doc.atoms.values()].map((a) => a.alias ?? a.el).join(' '));
    const kept = refused.every(([c, text]) => c.atoms === before.atoms && c.bonds === before.bonds && text.includes('Ph'));
    const stepsAfter = await state(() => olomol.undoStack.length);
    // a drawing that has one already (an older file): ringed red, as an atom with too many bonds is
    // (as a file opens: not an action, nothing refused)
    await state(() => {
      const doc = structuredClone(olomol.doc);
      const o = window.olomolTest.addAtom(doc, 3, 3, 'O');
      window.olomolTest.addBond(doc, [...doc.atoms.values()].find((a) => a.alias === 'Ph').id, o.id, 1);
      olomol.setDoc(doc);
    });
    const ringed = await state(() => {
      const ph = [...olomol.doc.atoms.values()].find((a) => a.alias === 'Ph');
      return olomol.scene.atoms.get(ph.id).chem.error ?? null;
    });
    check(kept && labels === 'C C Ph' && stepsAfter === steps && ringed?.includes('Ph'),
      `Ph takes no second bond: the bond tool's click, a bond pulled out, Ph on a carbon with two bonds and O with Shift refused (${refused.map(([c]) => `${c.atoms}/${c.bonds}`).join(', ')}: ${labels}; "${refused[2][1]}"), no undo step left behind (${steps} → ${stepsAfter}); one drawn so is ringed red ("${ringed}")`);
    await state(() => olomol.setTool({ name: 'select' }));

    // a refused action leaves the history as it was: what could be redone still can (two steps undone, then the
    // bond tool's click on Ph by mistake); and an action that threw a step of its own away (dropCheckpoint: a
    // drag that changed nothing) and is then refused goes back to where it began, not a step further
    await clear();
    await tool('bond').click();
    await page.mouse.click(600, 450);
    ids = await state(() => [...olomol.doc.atoms.keys()]);
    const [first, ph] = ids;
    await state(() => olomol.setTool({ name: 'atom', el: '*', alias: 'Ph' }));
    await clickAt(await atomXY(ph));
    // (two more bonds from the other end, both undone)
    await state(() => olomol.setTool({ name: 'bond', order: 1, stereo: '' }));
    await clickAt(await atomXY(first));
    await clickAt(await atomXY(first));
    await state(() => { olomol.undo(); olomol.undo(); });
    const redoBefore = await state(() => olomol.redoStack.length);
    await clickAt(await atomXY(ph));
    const redo = { said: await notice(), left: await state(() => olomol.redoStack.length) };
    // (a gesture as the editor makes one: its start noted, a step saved and thrown away, another saved, then the
    // change that is refused)
    const dropped = await state(() => {
      const steps = olomol.undoStack.length;
      const drawn = JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.id, a.alias ?? a.el]));
      const start = olomol.labelsNow();
      olomol.checkpoint();
      olomol.dropCheckpoint();
      olomol.checkpoint();
      const p = [...olomol.doc.atoms.values()].find((a) => a.alias === 'Ph');
      const o = window.olomolTest.addAtom(olomol.doc, p.x + 1, p.y + 1, 'O');
      window.olomolTest.addBond(olomol.doc, p.id, o.id, 1);
      olomol.touched();
      const refusedNow = olomol.refuseOverfull(start);
      return { refusedNow, steps: olomol.undoStack.length - steps, same: JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.id, a.alias ?? a.el])) === drawn };
    });
    check(redoBefore === 2 && redo.left === 2 && redo.said.includes('Ph') && dropped.refusedNow && dropped.steps === 0 && dropped.same,
      `a refused action keeps the history: ${redo.left} of ${redoBefore} redo steps left after Ph's refusal ("${redo.said.slice(0, 30)}…"); one that threw a step away goes back by its own steps (${dropped.steps} more or less, the drawing as before: ${dropped.same})`);
    await state(() => olomol.setTool({ name: 'select' }));
  }
}
