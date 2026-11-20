// The browser check: Redraw: every drawing keeps the molecule, a part redrawn alone, transition states, rings closed by dative bonds.
// Run alone: npm run check -- --only redraw [url]

import {
  canonical, check, clear, drawnSmiles, layoutDone, layoutWorking, page, paste, state, TEST_MOLECULES,
} from './harness.mjs';
// (its parts, in the order run:)
//   re-layout with part of a molecule selected: only that part changes, the rest stays exactly
//   re-layout keeps every test molecule
//   re-layout of a transition state: kept in one piece by its partial bonds; the 3D one as textbooks draw an SN2
//   a ring closed by a dative bond (a BODIPY's N→B): every layout keeps it a ring, the 3D engine builds it too
//   part of a molecule redrawn that hangs by a wedge from a stereocentre outside it: the wedge kept,
//   a part redrawn: what stays where it was keeps its depth from Turn in 3D
export default async function run() {
  // --- re-layout with part of a molecule selected: only that part changes, the rest stays exactly ---
  // an adamantyl dragged away from its phenol (a long bond): put back as drawn, one bond away, the cage unchanged
  await clear();
  await paste('Oc1cccc(c1)C12CC3CC(CC(C3)C1)C2');
  const cage = await state(() => {
    const atoms = [...olomol.doc.atoms.values()];
    const bonds = [...olomol.doc.bonds.values()];
    const aromatic = new Set(bonds.filter((b) => b.order === 2).flatMap((b) => [b.a, b.b]));
    const ring = atoms.filter((a) => aromatic.has(a.id) || a.el === 'O');
    const ringIds = new Set(ring.map((a) => a.id));
    // the ring's other carbon (single bonds only): the one with three ring neighbours
    const inner = atoms.filter((a) => !ringIds.has(a.id) && bonds.filter((b) => (b.a === a.id || b.b === a.id) && (ringIds.has(b.a) || ringIds.has(b.b))).length >= 2);
    for (const a of inner) ringIds.add(a.id);
    const ids = atoms.filter((a) => !ringIds.has(a.id)).map((a) => a.id);
    olomol.change((doc) => { for (const id of ids) { doc.atoms.get(id).x += 1.4; doc.atoms.get(id).y -= 0.9; } });
    olomol.select(ids);
    return { ids, before: Object.fromEntries([...olomol.doc.atoms.values()].map((a) => [a.id, [a.x, a.y]])) };
  });
  await page.getByTestId('relayout').click();
  await layoutWorking();
  // only the best few of each section at first, the drawings of the part on a tint of their own; then all
  const firstShown = await state(() => ['part', 'whole'].map((key) => document.querySelectorAll(`[data-testid=layout-${key}] [data-testid=layout-card]`).length));
  const allButton = await page.getByTestId('layout-all').textContent().catch(() => '');
  await layoutDone();
  const allShown = await state(() => ['part', 'whole'].map((key) => document.querySelectorAll(`[data-testid=layout-${key}] [data-testid=layout-card]`).length));
  check(firstShown.every((n) => n >= 1) && /Show all drawings \(\d+ more\)/.test(allButton) && allShown[0] + allShown[1] > firstShown[0] + firstShown[1],
    `re-layout of a selected part: the best of each section first (part ${firstShown[0]}, whole ${firstShown[1]}), "${allButton}" shows them all (${allShown.join(', ')})`);
  const keptCard = page.getByTestId('layout-card').filter({ hasText: 'Selected part unchanged, reattached' });
  const keptOffered = await keptCard.count();
  const partCards = await page.getByTestId('layout-card').filter({ hasText: 'Selected part' }).count();
  if (keptOffered) await keptCard.click();
  await page.waitForTimeout(150);
  const kept = await state(({ ids, before }) => {
    const part = new Set(ids);
    const atoms = [...olomol.doc.atoms.values()];
    const rest = Math.max(...atoms.filter((a) => !part.has(a.id)).map((a) => Math.hypot(a.x - before[a.id][0], a.y - before[a.id][1])));
    // the cage's own shape: every distance inside it as before
    let shape = 0;
    for (const a of ids) for (const b of ids) {
      const was = Math.hypot(before[a][0] - before[b][0], before[a][1] - before[b][1]);
      const is = Math.hypot(olomol.doc.atoms.get(a).x - olomol.doc.atoms.get(b).x, olomol.doc.atoms.get(a).y - olomol.doc.atoms.get(b).y);
      shape = Math.max(shape, Math.abs(was - is));
    }
    const link = [...olomol.doc.bonds.values()].find((b) => part.has(b.a) !== part.has(b.b));
    const length = Math.hypot(olomol.doc.atoms.get(link.a).x - olomol.doc.atoms.get(link.b).x, olomol.doc.atoms.get(link.a).y - olomol.doc.atoms.get(link.b).y);
    return { rest, shape, length: length.toFixed(2) };
  }, cage);
  check(keptOffered === 1 && partCards >= 2 && kept.rest < 1e-9 && kept.shape < 1e-6 && kept.length === '1.00',
    `re-layout of a selected part: an adamantyl dragged off its phenol is put back as drawn (${keptOffered}, ${partCards} drawings of the part): the phenol stays (moved ${kept.rest}), the cage keeps its shape (${kept.shape.toExponential(1)}), its bond to the ring ${kept.length} long`);
  // a carboxylic acid chain drawn sloppily, redrawn alone and put back: its angles 120°
  await clear();
  await paste('OC(=O)CCc1ccc(cc1)-c1ccccc1');
  const chain = await state(() => {
    const atoms = [...olomol.doc.atoms.values()].slice(0, 5); // O, C, =O, C, C
    const shift = [[0.25, 0.15], [0.1, -0.2], [-0.2, 0.1], [0.2, 0.25], [0, 0.1]];
    olomol.change((doc) => atoms.forEach((a, k) => { doc.atoms.get(a.id).x += shift[k][0]; doc.atoms.get(a.id).y += shift[k][1]; }));
    olomol.select(atoms.map((a) => a.id));
    return { ids: atoms.map((a) => a.id), before: Object.fromEntries([...olomol.doc.atoms.values()].map((a) => [a.id, [a.x, a.y]])) };
  });
  await page.getByTestId('relayout').click();
  await layoutDone();
  const redrawnCard = page.getByTestId('layout-card').filter({ hasText: 'Selected part redrawn 1' });
  const redrawnOffered = await redrawnCard.count();
  if (redrawnOffered) await redrawnCard.click();
  await page.waitForTimeout(150);
  const redrawn = await state(({ ids, before }) => {
    const part = new Set(ids);
    const atoms = [...olomol.doc.atoms.values()];
    const bonds = [...olomol.doc.bonds.values()];
    const rest = Math.max(...atoms.filter((a) => !part.has(a.id)).map((a) => Math.hypot(a.x - before[a.id][0], a.y - before[a.id][1])));
    const worst = Math.max(...ids.map((id) => {
      const at = olomol.doc.atoms.get(id);
      const near = bonds.filter((b) => b.a === id || b.b === id).map((b) => olomol.doc.atoms.get(b.a === id ? b.b : b.a));
      let off = 0;
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
        const u = [near[i].x - at.x, near[i].y - at.y];
        const v = [near[j].x - at.x, near[j].y - at.y];
        const angle = (Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180) / Math.PI;
        off = Math.max(off, Math.abs(angle - 120));
      }
      return off;
    }));
    return { rest, worst: Math.round(worst) };
  }, chain);
  check(redrawnOffered === 1 && redrawn.rest < 1e-9 && redrawn.worst <= 3,
    `re-layout of a selected part: a sloppy acid chain redrawn alone (${redrawnOffered}): the rest stays (moved ${redrawn.rest}), its angles within ${redrawn.worst}° of 120°`);

  // --- re-layout keeps every test molecule ---
  for (const [name, smiles] of Object.entries(TEST_MOLECULES)) {
    await clear();
    await paste(smiles);
    const expected = canonical(smiles);
    await page.getByTestId('relayout').click();
    await layoutDone();
    const cards = await page.getByTestId('layout-card').count();
    await page.screenshot({ path: `test-output/relayout-${name}.png` });
    let kept = true;
    for (let k = 0; k < cards; k++) {
      if (k) {
        await page.getByTestId('relayout').click();
        await layoutDone();
      }
      await page.getByTestId('layout-card').nth(k).click();
      await page.waitForTimeout(100);
      const now = await drawnSmiles();
      if (now !== expected) {
        kept = false;
        console.log(`  candidate ${k + 1}: ${now} != ${expected}`);
      }
      await page.keyboard.press('Control+z');
    }
    check(cards > 0 && kept && (await drawnSmiles()) === expected, `re-layout ${name}: ${cards} candidates, each keeps the molecule`);
  }
  // debug mode names the engines and rules
  await state(() => olomol.setDebug(true));
  await page.getByTestId('relayout').click();
  await layoutDone();
  check((await page.locator('.dialog').textContent()).includes('rule:'), 'debug mode: the layout cards show engine and rules');
  await page.screenshot({ path: 'test-output/relayout-debug.png' });
  await page.keyboard.press('Escape');
  await state(() => olomol.setDebug(false));

  // --- re-layout of a transition state: kept in one piece by its partial bonds; the 3D one as textbooks draw an SN2 ---
  await clear();
  const tsIds = await state(() => {
    const { addAtom, addBond } = window.olomolTest;
    const ids = {};
    olomol.change((doc) => {
      const [o, c, br] = [addAtom(doc, 0, 0, 'O'), addAtom(doc, 1.1, 0.1, 'C'), addAtom(doc, 2.3, -0.1, 'Br')];
      addBond(doc, o.id, c.id, 1, { kind: 'partial' });
      addBond(doc, c.id, br.id, 1, { kind: 'partial' });
      for (const [x, y] of [[1.1, -0.9], [0.6, 0.9], [1.7, 0.8]]) addBond(doc, c.id, addAtom(doc, x, y, 'H').id);
      Object.assign(ids, { o: o.id, c: c.id, br: br.id });
    });
    return ids;
  });
  await page.getByTestId('relayout').click();
  await layoutDone();
  const tsCards = await page.getByTestId('layout-card').count();
  const tsShapes = [];
  for (let k = 0; k < tsCards; k++) {
    if (k) {
      await page.getByTestId('relayout').click();
      await layoutDone();
    }
    await page.getByTestId('layout-card').nth(k).click();
    await page.waitForTimeout(100);
    tsShapes.push(await state(({ o, c, br }) => {
      const [po, pc, pb] = [o, c, br].map((id) => olomol.doc.atoms.get(id));
      const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
      return { apart: Math.max(d(po, pc), d(pc, pb)), across: Math.abs(po.y - pc.y) < 0.01 && Math.abs(pb.y - pc.y) < 0.01 && po.x < pc.x && pc.x < pb.x,
        wedges: [...olomol.doc.bonds.values()].filter((b) => b.stereo).length };
    }, tsIds));
    await page.keyboard.press('Control+z');
  }
  check(tsCards > 1 && tsShapes.every((x) => x.apart < 1.6) && tsShapes.some((x) => x.across && x.wedges === 2),
    `re-layout of an SN2 transition state: ${tsCards} candidates, all in one piece (partial bonds at most ${Math.max(...tsShapes.map((x) => x.apart)).toFixed(2)} long), one with HO···C···Br across and a wedge and a hashed wedge`);

  // --- a ring closed by a dative bond (a BODIPY's N→B): every layout keeps it a ring (no 3D drawing: it is no metal
  // complex, cage or transition state) ---
  await clear();
  await paste('F[B-]1(F)n2cccc2C=C2C=CC=[N+]21');
  await state(() => olomol.change((doc) => {
    const b = [...doc.atoms.values()].find((a) => a.el === 'B');
    const n = [...doc.atoms.values()].find((a) => a.el === 'N' && a.charge === 1);
    const bond = [...doc.bonds.values()].find((x) => [x.a, x.b].includes(b.id) && [x.a, x.b].includes(n.id));
    Object.assign(bond, { a: n.id, b: b.id, kind: 'dative', order: 1 });
    b.charge = 0;
    n.charge = 0;
  }));
  await page.getByTestId('relayout').click();
  await layoutDone();
  const bodipyCards = await page.getByTestId('layout-card').count();
  const bodipyText = await page.locator('.dialog').textContent();
  const nbLengths = [];
  for (let k = 0; k < bodipyCards; k++) {
    if (k) {
      await page.getByTestId('relayout').click();
      await layoutDone();
    }
    await page.getByTestId('layout-card').nth(k).click();
    await page.waitForTimeout(100);
    nbLengths.push(await state(() => {
      const b = [...olomol.doc.atoms.values()].find((a) => a.el === 'B');
      return Math.max(...[...olomol.doc.atoms.values()].filter((a) => a.el === 'N').map((n) => Math.hypot(n.x - b.x, n.y - b.y)));
    }));
    await page.keyboard.press('Control+z');
  }
  check(bodipyCards >= 1 && nbLengths.every((d) => d < 1.6) && !bodipyText.includes('dative'),
    `re-layout of a BODIPY (N→B a dative bond): ${bodipyCards} candidates, the B next to both N in each (at most ${Math.max(...nbLengths).toFixed(2)}), no engine refusing it for its dative bond`);
  // the wedge tool on a coordination bond: depth only, still dative (no error ring on the N); again: none
  await clear();
  await state(() => {
    const { addAtom, addBond } = window.olomolTest;
    olomol.change((doc) => {
      const co = addAtom(doc, 0, 0, 'Co', { charge: 3 });
      for (let k = 0; k < 6; k++) addBond(doc, addAtom(doc, 1.5 * Math.cos(k * Math.PI / 3), 1.5 * Math.sin(k * Math.PI / 3), 'N').id, co.id, 1, { kind: 'dative' });
    });
  });
  const coordinationAt = await state(() => {
    const bond = [...olomol.doc.bonds.values()][0];
    const [a, b] = [olomol.doc.atoms.get(bond.a), olomol.doc.atoms.get(bond.b)];
    const { scale, tx, ty } = olomol.view;
    return [((a.x + b.x) / 2) * scale + tx, ((a.y + b.y) / 2) * scale + ty, bond.id];
  });
  const canvasBox = await page.getByTestId('canvas').boundingBox();
  await state(() => olomol.setTool({ name: 'bond', order: 1, stereo: 'wedge' }));
  await page.mouse.click(canvasBox.x + coordinationAt[0], canvasBox.y + coordinationAt[1]);
  const wedged = await state((id) => ({ ...olomol.doc.bonds.get(id), rings: document.querySelectorAll('.error-ring').length }), coordinationAt[2]);
  await page.mouse.click(canvasBox.x + coordinationAt[0], canvasBox.y + coordinationAt[1]);
  const unwedged = await state((id) => olomol.doc.bonds.get(id).stereo, coordinationAt[2]);
  check(wedged.kind === 'dative' && wedged.stereo === 'wedge' && wedged.rings === 0 && unwedged === '',
    `wedge tool on a coordination bond: still dative (${wedged.kind}), a wedge (${wedged.stereo}), no error ring (${wedged.rings}); again: none (${JSON.stringify(unwedged)})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // --- part of a molecule redrawn that hangs by a wedge from a stereocentre outside it: the wedge kept,
  // so its RDKit drawings aren't dropped as changing the molecule ---
  {
    const ALCOHOL = 'C[C@@H](O)CCc1ccccc1';
    await clear();
    await paste(ALCOHOL);
    // the wedge moved onto the bond to the CH2CH2Ph chain (a hash instead if that is the molecule as it was),
    // the chain pushed out of shape, and selected: the stereocentre at the wedge's narrow end stays out
    const ids = await state(() => [...olomol.doc.atoms.keys()].sort((p, q) => p - q));
    await state(([centre, chain]) => olomol.change((doc) => {
      for (const b of doc.bonds.values()) b.stereo = '';
      const bond = [...doc.bonds.values()].find((b) => [b.a, b.b].includes(centre) && [b.a, b.b].includes(chain));
      Object.assign(bond, { a: centre, b: chain, stereo: 'wedge' });
    }), [ids[1], ids[3]]);
    if (canonical(await state(() => window.olomolTest.chemistry())) !== canonical(ALCOHOL)) {
      await state(() => olomol.change((doc) => { for (const b of doc.bonds.values()) if (b.stereo) b.stereo = 'hash'; }));
    }
    const same = canonical(await state(() => window.olomolTest.chemistry())) === canonical(ALCOHOL);
    const part = await state((chain) => {
      olomol.change((doc) => chain.forEach((id, k) => { doc.atoms.get(id).y += k % 2 ? 0.7 : -0.5; }));
      olomol.select(chain);
      olomol.setDebug(true);
      return chain.length;
    }, ids.slice(3));
    await page.getByTestId('relayout').click();
    await layoutWorking();
    const kept = await state(() => [...document.querySelectorAll('[data-testid=layout-part] [data-testid=layout-card] .caption')].filter((c) => /Selected part by RDKit/.test(c.textContent)).length);
    const dropped = await state(() => [...document.querySelectorAll('.skipped li')].filter((li) => /Selected part by RDKit/.test(li.textContent) && /changed the molecule/.test(li.textContent)).length);
    await page.keyboard.press('Escape');
    await state(() => olomol.setDebug(false));
    check(same && part > 1 && kept > 0 && dropped === 0, `a part hanging by a wedge (${part} atoms, the molecule as before: ${same}) redrawn by RDKit: its drawings kept (${kept}), none dropped for changing the molecule (${dropped})`);
  }

  // --- a part redrawn: what stays where it was keeps its depth from Turn in 3D ---
  {
    await clear();
    await paste('CN1C2CCC1CC(C2)OC(=O)C(CO)c1ccccc1');
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.getByTestId('turn3d-use').click();
    await page.waitForTimeout(200);
    const ids = await state(() => [...olomol.doc.atoms.keys()].sort((p, q) => p - q));
    const part = ids.slice(10); // the acid, past the tropane and its O
    await state((list) => olomol.select(list), part);
    await page.getByTestId('relayout').click();
    await page.getByTestId('layout-part').getByTestId('layout-card').first().waitFor({ timeout: 60_000 });
    await page.getByTestId('layout-part').getByTestId('layout-card').first().click();
    await page.waitForTimeout(300);
    const depth = await state((moving) => {
      const bonds = [...olomol.doc.bonds.values()];
      const stayed = bonds.filter((b) => !moving.includes(b.a) && !moving.includes(b.b));
      const went = bonds.filter((b) => moving.includes(b.a) || moving.includes(b.b));
      return { stayed: stayed.length, kept: stayed.filter((b) => typeof b.z === 'number').length, went: went.filter((b) => typeof b.z === 'number').length };
    }, part);
    check(depth.stayed > 8 && depth.kept === depth.stayed && (await drawnSmiles()) === canonical('CN1C2CCC1CC(C2)OC(=O)C(CO)c1ccccc1'), `a part redrawn after Turn in 3D: the rest keeps its depth (${depth.kept} of ${depth.stayed} bonds)`);
  }

  // --- a drawing whose only fault is a wedge: given new wedges (RDKit's, for the same points), not dropped ---
  {
    // (Indigo hashes the middle one of three bonds that lie within 180°, which reads as the other hand)
    const smiles = 'CCCC[C@]12Cc3ccccc3[C@H](O1)c1c(c3ccccc3oc1=O)O2';
    const r = await state((s) => window.olomolTest.redraw(s), smiles);
    const indigo = r.candidates.find((c) => c.label === 'Indigo layout' || c.also.includes('Indigo layout'));
    check(indigo && !r.skipped.some((x) => x.dropped) && canonical(indigo.meant) === canonical(smiles),
      `Redraw gives a drawing new wedges rather than dropping it: Indigo's layout of a bridged ketal offered, meaning the molecule (${r.candidates.map((c) => c.label).join(', ')})`);
    await clear();
  }

  // --- the cards don't move: ranked once when the quick engines are done, a slow engine's drawing (Indigo's
  // clean-up, seconds later) only added after them ---
  {
    await clear();
    await paste(TEST_MOLECULES.morphine);
    await state(() => {
      const ids = [...olomol.doc.atoms.keys()];
      olomol.change((doc) => ids.forEach((id, k) => { doc.atoms.get(id).x += (k % 3) * 0.25; doc.atoms.get(id).y -= (k % 4) * 0.2; }));
      olomol.selectAll();
    });
    await page.getByTestId('relayout').click();
    const cards = () => state(() => [...document.querySelectorAll('[data-testid=layout-whole] [data-testid=layout-card]')].map((c) => `${c.querySelector('.caption').textContent}|${c.querySelector('img').src.length}`));
    await page.getByTestId('layout-card').first().waitFor({ timeout: 60_000 });
    const first = await cards();
    const stillWorking = await state(() => document.querySelector('.dialog').textContent.includes('Still working'));
    await layoutWorking();
    const last = await cards();
    check(first.length >= 1 && first.every((c, k) => last[k] === c),
      `Redraw's cards stay where they are: the ${first.length} shown first${stillWorking ? ' (slow engines still working)' : ''} still first and in order among ${last.length}`);
    await page.keyboard.press('Escape');
    await clear();
  }

  // --- a double bond whose E or Z the drawing leaves open (an azo dye's naphthol dragged off in line with its
  // N=N, a long bond): Redraw's drawings keep it open with a wavy bond beside it, as pasting does; before, every
  // engine's drawing said E, all were dropped, and the window said every engine gave the current drawing ---
  {
    await clear();
    await paste('[O-]S(=O)(=O)c1ccc(cc1)/N=N/c1c([O-])ccc2ccccc12');
    await state(() => olomol.change((doc) => {
      const near = (id) => [...doc.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
      const double = [...doc.bonds.values()].find((b) => b.order === 2 && doc.atoms.get(b.a).el === 'N' && doc.atoms.get(b.b).el === 'N');
      // the N whose carbon has an O- beside it: the naphthol's; that carbon and all beyond it moved 7 out along N=N
      const [n1, n2] = [double.a, double.b].map((id) => doc.atoms.get(id));
      const naphthylOf = (n) => near(n.id).find((j) => doc.atoms.get(j).el === 'C' && near(j).some((k) => near(k).some((m) => doc.atoms.get(m).charge < 0 && doc.atoms.get(m).el === 'O')));
      const [from, to] = naphthylOf(n2) ? [n1, n2] : [n2, n1];
      const start = naphthylOf(to);
      const part = new Set([start]);
      const todo = [start];
      while (todo.length) for (const j of near(todo.pop())) if (j !== to.id && !part.has(j)) { part.add(j); todo.push(j); }
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const [ux, uy] = [(to.x - from.x) / length, (to.y - from.y) / length];
      const c = doc.atoms.get(start);
      const [dx, dy] = [to.x + 7 * ux - c.x, to.y + 7 * uy - c.y];
      for (const id of part) Object.assign(doc.atoms.get(id), { x: doc.atoms.get(id).x + dx, y: doc.atoms.get(id).y + dy });
    }));
    const before = await drawnSmiles();
    await state(() => olomol.selectAll());
    await page.getByTestId('relayout').click();
    await layoutDone();
    const cards = await page.getByTestId('layout-card').count();
    const said = await state(() => document.querySelector('.dialog').textContent);
    if (cards) await page.getByTestId('layout-card').first().click();
    await page.waitForTimeout(150);
    const after = await drawnSmiles();
    const wavy = await state(() => [...olomol.doc.bonds.values()].filter((b) => b.stereo === 'wavy').length);
    check(cards >= 2 && !/[/\\]/.test(before) && after === before && wavy === 1 && !said.includes('Every engine gave the current drawing'),
      `Redraw keeps an N=N's open E or Z (drawn in line): ${cards} drawings offered, the first put in with ${wavy} wavy bond, the molecule as before (${after === before ? 'same' : `${before} → ${after}`})`);
    await clear();
  }

  // --- a chair's axial H anti to its Br (the E2), on a CH2: each drawing keeps its side, a wedge opposite the Br's ---
  {
    const sides = await state(async () => {
      const { chairDoc } = await import('/src/chem/chair.js');
      const { prepare, relayoutTargets, runEngines, withCandidate } = await import('/src/layout/relayout.js');
      // trans-1-bromo-2-methylcyclohexane, Br and methyl axial, the H anti to the Br drawn on the Br's other neighbour
      olomol.setDoc(chairDoc({ axial: ['Br', 'C', null, null, null, 'H'] }));
      const job = await prepare(olomol, relayoutTargets(olomol));
      const view = await runEngines(olomol, job, () => {}, () => false);
      const atoms = [...olomol.doc.atoms.values()];
      const [br, h] = ['Br', 'H'].map((el) => atoms.find((a) => a.el === el).id);
      return view.candidates.map((c) => {
        const out = withCandidate(olomol.doc, job, c);
        const on = (id) => [...out.bonds.values()].find((b) => b.a === id || b.b === id).stereo || 'none';
        return `${on(br)}/${on(h)}`;
      });
    });
    check(sides.length > 0 && sides.every((s) => s === 'wedge/hash' || s === 'hash/wedge'),
      `Redraw of the E2's chair: the H anti to the Br keeps its side, opposite the Br's (Br/H: ${sides.join(', ')})`);
    await clear();
  }
}
