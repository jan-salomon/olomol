// The browser check: Turn in 3D: views, wedges kept or warned about, complexes, Fischer projections, the stick model, C60.
// Run alone: npm run check -- --only threeD [url]

import { readFileSync } from 'node:fs';
import {
  check, clear, dragBetween, drawnSmiles, layoutDone, page, paste, state,
} from './harness.mjs';
// (its parts, in the order run:)
//   turning a molecule in 3D by hand: what the panel shows goes onto the canvas, the molecule kept
//   the 3D layout: [Fe(CN)6]4- drawn flat with dative bonds becomes an octahedron
//   Turn in 3D: a sulfoxide gets its wedge; a view that would change the molecule warns, and can be used
//   Fischer projections turn in 3D without a false warning
//   a 3D model on the canvas: put there from Turn in 3D, shown another way from the panel, out of date when its
//   molecule changes, Update; in a picture, in an .olom file, turned again in Turn in 3D
//   a 3D model with the rest of the drawing: grouped (Ctrl+G), aligned, flipped, turned with the handle, in the
//   Objects panel; the group in a picture and an .olom file
//   the stick model in Turn in 3D: the model as it is (hydrogens too), turned as the drawing, never put onto the canvas
//   the stick model with labels: Ph3P=O with its Ph as labels, drawn out (P, O, 18 C, 15 H) or each one ball named Ph
//   C60: RDKit gives up in seconds and OpenChemLib builds it
//   Help's SN2 transition state in Turn in 3D: built by UFF, every hydrogen in its stick model; its drawing turns
//   as seen (a partial bond foreshortened), not redrawn as the textbook's each time
export default async function run() {
  // --- turning a molecule in 3D by hand: what the panel shows goes onto the canvas, the molecule kept ---
  for (const [name, smiles] of [['menthol', 'CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O'], ['adamantane', 'C1C2CC3CC1CC(C2)C3']]) {
    await clear();
    await paste(smiles);
    const drawnBefore = await drawnSmiles();
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    const stageBox = await page.getByTestId('turn3d-stage').boundingBox();
    const shown = async () => page.getByTestId('turn3d-stage').evaluate((svg) => svg.innerHTML.length);
    const first = await shown();
    await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(stageBox.x + stageBox.width / 2 + k * 6, stageBox.y + stageBox.height / 2 + k * 3);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const panel = await page.getByTestId('turn3d-stage').evaluate((svg) => svg.querySelector('g').innerHTML);
    // a view along a stereocentre's C–H can't say its R/S with wedges: turned a little further, as the panel asks
    for (let k = 0; k < 12 && await page.getByTestId('turn3d-warning').count(); k++) await page.getByTestId('turn3d-stage').press('ArrowLeft');
    const usable = !(await page.getByTestId('turn3d-warning').count());
    if (usable) await page.getByTestId('turn3d-use').click();
    await page.waitForTimeout(200);
    const onCanvas = await state(() => ({
      z: [...olomol.doc.bonds.values()].filter((b) => typeof b.z === 'number').length,
      bonds: olomol.doc.bonds.size,
      broken: [...olomol.scene.bonds.values()].filter((b) => b.shapes.lines.length > 1 && b.bond.order === 1 && !b.bond.stereo).length,
    }));
    const fine = first > 0 && panel !== '' && usable && (await drawnSmiles()) === drawnBefore && onCanvas.z === onCanvas.bonds;
    check(fine && (name !== 'adamantane' || onCanvas.broken > 0),
      `turn in 3D, ${name}: drawn as it turns, the view used keeps the molecule (${await drawnSmiles()}), every bond with its depth${name === 'adamantane' ? `, ${onCanvas.broken} broken where it passes behind another` : ''}`);
    await page.keyboard.press('Control+z');
  }

  // --- the 3D layout: [Fe(CN)6]4- drawn flat with dative bonds becomes an octahedron ---
  await clear();
  await state(() => {
    const { addAtom, addBond } = window.olomolTest;
    olomol.change((doc) => {
      const fe = addAtom(doc, 0, 0, 'Fe', { charge: 0 });
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        const c = addAtom(doc, 1.2 * Math.cos(a), 1.2 * Math.sin(a), 'C', { charge: -1 });
        const n = addAtom(doc, 2.2 * Math.cos(a), 2.2 * Math.sin(a), 'N');
        addBond(doc, c.id, n.id, 3);
        addBond(doc, c.id, fe.id, 1, { kind: 'dative' });
      }
    });
    olomol.selectAll();
    olomol.setDebug(true);
  });
  await page.getByTestId('relayout').click();
  // (every drawing in: cards still coming move the others; its own card, not "another view")
  await layoutDone();
  const threeDCard = page.locator('[data-testid="layout-card"]').filter({ has: page.locator('.caption', { hasText: /^3D, projected( = |$)/ }) }).first();
  await threeDCard.click({ timeout: 10_000 }).catch(() => {});
  const octahedron = await state(() => {
    const atoms = [...olomol.doc.atoms.values()];
    const fe = atoms.find((a) => a.el === 'Fe');
    const ns = atoms.filter((a) => a.el === 'N');
    const apart = ns.every((p, i) => ns.slice(i + 1).every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 0.5));
    // two N straight above and below the Fe: the axis of the octahedron
    const axial = ns.filter((n) => Math.abs(n.x - fe.x) < 0.2).length;
    return { apart, axial };
  });
  check(octahedron.apart && octahedron.axial === 2, `Re-layout, 3D: [Fe(CN)6]4- drawn as an octahedron, axial ligands up and down (${JSON.stringify(octahedron)})`);
  await page.screenshot({ path: 'test-output/octahedron.png' });
  await state(() => olomol.setDebug(false));

  // --- Turn in 3D: a sulfoxide gets its wedge; a view that would change the molecule warns, and can be used ---
  {
    await clear();
    await paste('C[S@](=O)CC');
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    const before = await drawnSmiles();
    let good = 0;
    for (let k = 0; k < 24; k++) {
      await page.getByTestId('turn3d-stage').press('ArrowLeft');
      if (k % 3 === 2) await page.getByTestId('turn3d-stage').press('ArrowUp');
      good += (await page.getByTestId('turn3d-warning').count()) ? 0 : 1;
    }
    for (let k = 0; k < 12 && await page.getByTestId('turn3d-warning').count(); k++) await page.getByTestId('turn3d-stage').press('ArrowLeft');
    await page.getByTestId('turn3d-use').click();
    await page.waitForTimeout(200);
    check(good >= 12 && (await drawnSmiles()) === before, `a sulfoxide in Turn in 3D: most views say its R/S (${good} of 24), and it stays itself`);
    await clear();
    await paste('Cl[Pt]1(Cl)N[C@@H]2CCCC[C@H]2N1');
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(200);
    const warned = await page.getByTestId('turn3d-warning').count();
    const label = await page.getByTestId('turn3d-use').textContent();
    const enabled = await page.getByTestId('turn3d-use').isEnabled();
    await page.getByTestId('turn3d-use').click();
    await page.waitForTimeout(200);
    const said = await state(() => olomol.notice?.text ?? '');
    check(warned === 0 && enabled && label === 'Use this view Enter' && said.includes('New drawing applied'), `a complex keeps its ligands' R/S in Turn in 3D (warnings ${warned}, "${label}", then "${said}")`);
  }

  // --- Fischer projections turn in 3D without a false warning ---
  {
    await clear();
    await state(() => olomol.setTool({ name: 'select' }));
    await page.keyboard.press('Shift+T');
    await page.getByTestId('template-search').fill('D-Glucose, Fischer');
    await page.getByTestId('template').first().click();
    await page.mouse.click(640, 400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    let bad = 0;
    for (let k = 0; k < 16; k++) {
      await page.getByTestId('turn3d-stage').press('ArrowLeft');
      if (k % 4 === 3) await page.getByTestId('turn3d-stage').press('ArrowUp');
      bad += (await page.getByTestId('turn3d-warning').count()) ? 1 : 0;
    }
    await page.keyboard.press('Escape');
    check(bad <= 8, `D-glucose in Fischer projection in Turn in 3D: few false warnings (${bad} of 16 views)`);
  }

  // --- the stick model in Turn in 3D: the model as it is (hydrogens too), turned as the drawing, never put onto the canvas ---
  {
    await clear();
    await paste('BrC1CCCCC1');
    const before = await drawnSmiles();
    const coordinates = await state(() => JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.x, a.y])));
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.getByTestId('turn3d-stage').press('ArrowUp');
    await page.getByTestId('turn3d-sticks').click();
    await page.waitForTimeout(200);
    // bromocyclohexane: 7 heavy atoms and 11 hydrogens, as balls; 18 bonds, as two halves each
    const balls = await page.getByTestId('turn3d-stage').locator('circle[fill^="url(#ball"]').count();
    // H: the eleven hydrogens the model added small and near their carbons (every ball still there), its button on;
    // again: none of them (the seven heavy atoms); again: as they were
    const radii = () => page.getByTestId('turn3d-stage').locator('circle[fill^="url(#ball"]').evaluateAll((cs) => cs.map((c) => Number(c.getAttribute('r'))).sort((p, q) => p - q));
    const fullSize = await radii();
    await page.getByTestId('turn3d-stage').press('h');
    const smallSize = await radii();
    const pressed = await page.getByTestId('turn3d-small-h').getAttribute('aria-pressed');
    await page.getByTestId('turn3d-stage').press('h');
    const none = (await radii()).length;
    await page.getByTestId('turn3d-stage').press('h');
    const again = await radii();
    const shrunk = smallSize.filter((r) => r < 0.6 * fullSize[0]).length;
    check(smallSize.length === fullSize.length && shrunk === 11 && pressed === 'true' && none === 7 && JSON.stringify(again) === JSON.stringify(fullSize),
      `the stick model's small hydrogens (H): ${shrunk} of 11 added hydrogens small, every ball still there (${smallSize.length}), the button on (${pressed}); H again: none (${none} balls of 7); again: as they were (${JSON.stringify(again) === JSON.stringify(fullSize)})`);
    // (with it, no "Use this view": "Save picture" instead, a PNG named after the drawing)
    const disabled = (await page.getByTestId('turn3d-use').count()) === 0 && (await page.getByTestId('turn3d-save').count()) === 1;
    const saved = page.waitForEvent('download');
    await page.getByTestId('turn3d-save').click();
    await page.getByTestId('save-name').click();
    const picture = await saved;
    const pictureName = picture.suggestedFilename();
    const pictureSize = readFileSync(await picture.path()).length;
    await page.getByTestId('turn3d-stage').press('ArrowLeft');
    await page.getByTestId('turn3d-sticks').click();
    await page.waitForTimeout(200);
    const usable = await page.getByTestId('turn3d-use').isEnabled();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const kept = (await state(() => JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.x, a.y])))) === coordinates;
    check(balls === 18 && disabled && usable && kept && (await drawnSmiles()) === before && /-3d\.png$/.test(pictureName) && pictureSize > 2000,
      `the stick model in Turn in 3D: every atom (${balls} of 18), "Use this view" off with it (${disabled}) and on again without (${usable}), saved as ${pictureName} (${pictureSize} bytes), Esc keeps the drawing (${kept})`);
  }

  // --- the stick model with labels: Ph3P=O with its Ph as labels, drawn out (P, O, 18 C, 15 H) or each one ball named Ph ---
  {
    await clear();
    await state(() => olomol.change((doc) => {
      const T = window.olomolTest;
      const p = T.addAtom(doc, 0, 0, 'P');
      T.addBond(doc, p.id, T.addAtom(doc, 0, -1, 'O').id, 2);
      for (const [x, y] of [[-0.9, 0.5], [0.9, 0.5], [0, 1]]) T.addBond(doc, p.id, T.addAtom(doc, x, y, '*', { alias: 'Ph' }).id);
    }));
    await state(() => {
      try { sessionStorage.removeItem('olomol-3d-look'); } catch { /* none */ }
      olomol.selectAll();
    });
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.getByTestId('turn3d-stage').press('s');
    await page.waitForTimeout(200);
    const out = await page.getByTestId('turn3d-stage').locator('circle[fill^="url(#ball"]').count();
    const legend = await page.getByTestId('turn3d-legend').textContent().catch(() => '');
    await page.getByTestId('turn3d-as-balls').click();
    await page.waitForTimeout(200);
    const short = await page.getByTestId('turn3d-stage').locator('circle[fill^="url(#ball"]').count();
    const named = await page.getByTestId('turn3d-stage').locator('text').allTextContents();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.getByTestId('turn3d-stage').press('s');
    await page.waitForTimeout(200);
    const still = await page.getByTestId('turn3d-stage').locator('circle[fill^="url(#ball"]').count();
    await page.keyboard.press('Escape');
    check(out === 35 && legend.includes('Ph') && short === 5 && named.join() === 'Ph,Ph,Ph' && still === 5,
      `the stick model with labels: Ph3P=O drawn out (${out} balls of 35, legend "${legend}"), as shorthands (${short} of 5: ${named.join(', ')}), and so again in the next window (${still})`);

    // a metal complex with labels: ZnTPP with its phenyls written Ph, built by UFF drawn out (before: each Ph a
    // methyl, its stand-in); G for shorthands and back
    await clear();
    await paste('c1ccc(cc1)C2=C3C=CC4=N3[Zn]56N7C(=C(C8=CC=C(N85)C(=C9C=CC2=N96)c%10ccccc%10)c%11ccccc%11)C=CC7=C4c%12ccccc%12');
    const phenyls = await state(() => {
      const near = (id) => [...olomol.doc.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
      // (the CH carbons with two carbons round them, five to a ring, and the ring's sixth)
      const ch = [...olomol.doc.atoms.values()].filter((a) => a.el === 'C' && near(a.id).length === 2 && near(a.id).every((n) => olomol.doc.atoms.get(n).el === 'C'));
      const rings = [];
      const left = new Set(ch.map((a) => a.id));
      for (const a of ch) {
        if (!left.has(a.id)) continue;
        const ring = [a.id];
        for (let k = 0; k < ring.length; k++) for (const n of near(ring[k])) if (left.has(n) && !ring.includes(n)) ring.push(n);
        if (ring.length !== 5) continue;
        const ipso = near(ring[0]).concat(...ring.map(near)).find((n) => !ring.includes(n) && ring.filter((r) => near(r).includes(n)).length === 2);
        ring.forEach((id) => left.delete(id));
        rings.push([...ring, ipso]);
      }
      return rings;
    });
    for (const ring of phenyls) await state((ids) => window.olomolTest.abbreviate(ids), ring);
    await state(() => {
      try { sessionStorage.removeItem('olomol-3d-look'); } catch { /* none */ }
      olomol.selectAll();
    });
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    // where the window, its stage and the Stick model button are: the same whatever S and G show
    const places = new Set();
    const place = async () => places.add(await state(() => ['.turn3d', '[data-testid=turn3d-stage]', '[data-testid=turn3d-sticks]']
      .map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); }).join(' | ')));
    await place();
    await page.getByTestId('turn3d-stage').press('s');
    await page.waitForTimeout(300);
    await place();
    const zntpp = await page.getByTestId('turn3d-stage').locator('circle[fill^="url(#ball"]').count();
    await page.getByTestId('turn3d-stage').press('g');
    await page.waitForTimeout(300);
    await place();
    const zntppShort = await page.getByTestId('turn3d-stage').locator('text').allTextContents();
    await page.getByTestId('turn3d-stage').press('g');
    await page.waitForTimeout(300);
    await place();
    const zntppAgain = await page.getByTestId('turn3d-stage').locator('circle[fill^="url(#ball"]').count();
    await page.getByTestId('turn3d-sticks').click();
    await page.waitForTimeout(300);
    await place();
    await page.keyboard.press('Escape');
    check(phenyls.length === 4 && zntpp === 77 && zntppShort.join() === 'Ph,Ph,Ph,Ph' && zntppAgain === 77,
      `the stick model of a metal complex with labels: ZnTPP's four Ph drawn out (${zntpp} balls of 77), G: shorthands (${zntppShort.join(', ')}), G: drawn out again (${zntppAgain})`);
    check(places.size === 1, `Turn in 3D doesn't move as S, G and a click switch it: the window, the stage and the Stick model button where they were (${[...places].join(' / ')})`);
  }

  // --- C60: RDKit gives up in seconds and OpenChemLib builds it ---
  {
    await clear();
    await paste('c12c3c4c5c2c2c6c7c1c1c8c3c3c9c4c4c%10c5c5c2c2c6c6c%11c7c1c1c7c8c3c3c8c9c4c4c9c%10c5c5c2c2c6c6c%11c1c1c7c3c3c8c4c4c9c5c2c2c6c1c3c42');
    await state(() => olomol.selectAll());
    const started = Date.now();
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 40_000 }).catch(() => {});
    const took = Date.now() - started;
    const built = await page.getByTestId('turn3d-stage').count();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 1000 }).catch(() => {});
    check(built === 1 && took < 30_000, `C60 in Turn in 3D: a model after ${Math.round(took / 1000)} s`);
  }

  // --- Help's SN2 transition state in Turn in 3D: built by UFF, every hydrogen in its stick model; its drawing turns
  // as seen (a partial bond foreshortened), not redrawn as the textbook's each time ---
  {
    await clear();
    await paste(readFileSync(new URL('../../src/ui/examples/sn2.olom', import.meta.url), 'utf8'));
    const partial = await state(async () => {
      const { fragments } = await import('/src/model/graph.js');
      const bond = [...olomol.doc.bonds.values()].find((b) => b.kind === 'partial');
      olomol.select(fragments(olomol.doc).find((m) => m.includes(bond.a)));
      return bond.id;
    });
    await page.getByTestId('turn3d').click();
    const stage = page.getByTestId('turn3d-stage');
    await stage.waitFor({ timeout: 60_000 });
    // (the partial bond's drawn length, in the panel's copy, as it turns)
    const length = () => state((id) => {
      const svg = document.querySelector(`[data-testid=turn3d-stage] [data-id="${id}"]`);
      const lines = [...(svg?.querySelectorAll('line') ?? [])].map((l) => [+l.getAttribute('x1'), +l.getAttribute('y1'), +l.getAttribute('x2'), +l.getAttribute('y2')]);
      if (!lines.length) return 0;
      const xs = lines.flatMap(([x1, , x2]) => [x1, x2]);
      const ys = lines.flatMap(([, y1, , y2]) => [y1, y2]);
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }, partial);
    const lengths = [await length()];
    for (let k = 0; k < 8; k++) {
      for (let j = 0; j < 3; j++) await stage.press('ArrowUp');
      lengths.push(await length());
    }
    await page.getByTestId('turn3d-sticks').click();
    await page.waitForTimeout(200);
    const balls = await stage.locator('circle[fill^="url(#ball"]').count();
    await page.keyboard.press('Escape');
    const spread = Math.max(...lengths) / Math.max(1e-6, Math.min(...lengths));
    check(balls === 16 && spread > 1.25, // (the textbook's each time: 1.15 long whichever way, a spread of 1)
      `Help's SN2 transition state in Turn in 3D: its stick model with every hydrogen (${balls} of 16 atoms); a partial bond foreshortened as it turns (${lengths.map((v) => v.toFixed(0)).join(', ')} px)`);
    // turned, and the view used: on the canvas as textbooks draw it, Nu···C···LG straight across
    await page.getByTestId('turn3d').click();
    await stage.waitFor({ timeout: 60_000 });
    for (let j = 0; j < 7; j++) await stage.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.getByTestId('turn3d-use').click();
    await page.waitForTimeout(300);
    const across = await state(() => {
      const partials = [...olomol.doc.bonds.values()].filter((b) => b.kind === 'partial');
      const centre = [partials[0].a, partials[0].b].find((id) => [partials[1].a, partials[1].b].includes(id));
      const ends = partials.map((b) => olomol.doc.atoms.get(b.a === centre ? b.b : b.a));
      const c = olomol.doc.atoms.get(centre);
      const angle = (a) => Math.atan2(a.y - c.y, a.x - c.x);
      const between = Math.abs(((angle(ends[0]) - angle(ends[1])) * 180) / Math.PI);
      return { angle: Math.min(between, 360 - between), lengths: ends.map((a) => Math.hypot(a.x - c.x, a.y - c.y)) };
    });
    // (as seen it would be neither: after this turn about 173°, 1.08 and 1.52 long)
    check(across.angle > 178 && across.lengths.every((l) => Math.abs(l - 1.15) < 0.03), `Help's SN2 transition state turned and its view used: on the canvas straight across, as textbooks draw it (${across.angle.toFixed(0)}°, partial bonds ${across.lengths.map((l) => l.toFixed(2)).join(', ')} long)`);
  }

  // --- a 3D model on the canvas: from Turn in 3D's stick model, beside its molecule; the panel shows it another way
  // (space-filling, its box wider); its molecule changed: a dashed frame, Update builds it again; in a picture and an
  // .olom file; turned in Turn in 3D (Apply keeps the turn) ---
  {
    await clear();
    await state(() => { try { sessionStorage.removeItem('olomol-3d-look'); } catch { /* none */ } });
    await paste('C[C@@H](C(=O)O)N');
    await state(() => olomol.clearSelection());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.getByTestId('turn3d-sticks').click();
    await page.getByTestId('turn3d-put').click();
    await page.waitForTimeout(300);
    const put = await state(() => {
      const [item] = olomol.doc.models.values();
      const atoms = [...olomol.doc.atoms.values()];
      const right = Math.max(...atoms.map((a) => a.x));
      const box = olomol.scene.models.get(item.id).box;
      return { n: olomol.doc.models.size, selected: olomol.selected('models').length, beside: box.x1 > right, elements: item.model.elements.length };
    });
    const section = await page.getByTestId('model-section').count();
    const width = () => state(() => { const b = [...olomol.scene.models.values()][0].box; return b.x2 - b.x1; });
    const before = await width();
    const where = () => state(() => { const [m] = olomol.doc.models.values(); return `${m.x.toFixed(4)},${m.y.toFixed(4)}`; });
    const placeBefore = await where();
    await page.getByTestId('model-section').getByText('Space-filling').click();
    const wider = await width();
    const stays = (await where()) === placeBefore;
    // turned by the panel's left–right slider: smoothly, one undo step (Ctrl+Z after letting go puts it back)
    const turnOf = () => state(() => JSON.stringify([...olomol.doc.models.values()][0].rotation));
    const unturned = await turnOf();
    const slider = await page.getByTestId('model-turn-y').boundingBox();
    await page.mouse.move(slider.x + slider.width / 2, slider.y + slider.height / 2);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(slider.x + slider.width / 2 + k * 5, slider.y + slider.height / 2);
    await page.mouse.up();
    const slid = (await turnOf()) !== unturned;
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    const slidBack = (await turnOf()) === unturned;
    await state(() => { const n = [...olomol.doc.atoms.values()].find((a) => a.el === 'N'); olomol.change(() => { n.el = 'O'; }); });
    const frame = await page.locator('[data-testid=stale-model]').count();
    await state(() => olomol.select([...olomol.doc.models.keys()]));
    await page.getByTestId('model-update').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid=stale-model]'), null, { timeout: 60_000 }).catch(() => {});
    const after = await page.locator('[data-testid=stale-model]').count();
    const kept = await state(async () => {
      const svg = await window.olomolTest.svg();
      const { readOlom, writeOlom } = await import('/src/io/olom.js');
      const [a] = olomol.doc.models.values();
      const [b] = readOlom(writeOlom(olomol.doc)).doc.models.values();
      // (a picture of the model alone, as Shift+Ctrl+C copies it: its molecule's highlight on it all the same)
      const { svgOf } = await import('/src/io/files.js');
      const atom = olomol.doc.atoms.get(a.atoms[0]);
      atom.highlight = '#12ab34';
      const alone = svgOf(olomol.doc, olomol.settings, { ids: [a.id] });
      delete atom.highlight;
      return { svg: svg === null ? null : svg.includes('radialGradient'), file: JSON.stringify(a.model) === JSON.stringify(b.model) && b.look.style === 'spacefill', alone: alone.includes('12ab34') };
    });
    // turned in Turn in 3D, the model selected: Apply keeps the turn
    const turnedBefore = await state(() => JSON.stringify([...olomol.doc.models.values()][0].rotation));
    // (an atom highlighted in the drawing: there on the model in Turn in 3D too)
    await state(() => {
      const c = [...olomol.doc.atoms.values()].find((a) => a.el === 'C');
      olomol.change(() => { c.highlight = '#ffd8a8'; });
      olomol.select([...olomol.doc.models.keys()]);
    });
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    const lit = await page.getByTestId('turn3d-stage').evaluate((svg) => svg.innerHTML.includes('#ffd8a8'));
    await page.getByTestId('turn3d-stage').press('ArrowLeft');
    await page.getByTestId('turn3d-apply').click();
    await page.waitForTimeout(200);
    const turned = (await state(() => JSON.stringify([...olomol.doc.models.values()][0].rotation))) !== turnedBefore;
    check(put.n === 1 && put.selected === 1 && put.beside && put.elements === 13 && section === 1 && wider > before + 0.5 && stays && slid && slidBack && frame === 1 && after === 0
      && kept.svg && kept.file && kept.alone && turned && lit,
      `a 3D model on the canvas: put beside alanine (${put.beside}, ${put.elements} atoms of 13), the panel's section (${section}); space-filling wider (${before.toFixed(2)} → ${wider.toFixed(2)}) where it was (${stays}); turned by its slider (${slid}), one Ctrl+Z back (${slidBack}); N made O: out of date (${frame} frame), Update (${after} left); in a picture (${kept.svg}), copied alone with its highlight (${kept.alone}) and an .olom file (${kept.file}); turned in Turn in 3D (${turned}), its highlight there (${lit})`);
  }

  // --- a 3D model with the rest of the drawing: grouped with its molecule (Ctrl+G; Ctrl+click on it picks the
  // group), in the Objects panel with its molecule's formula; lined up (Align left edges: by its balls as drawn);
  // flipped left to right as its molecule is (turned half round in space, about the page's upright: not mirrored);
  // turned with the handle (about the line of sight, as much); the group in a picture and an .olom file ---
  {
    await clear();
    await state(() => { try { sessionStorage.removeItem('olomol-3d-look'); } catch { /* none */ } });
    await paste('CC(O)C(=O)O');
    await state(() => olomol.clearSelection());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.getByTestId('turn3d-sticks').click();
    await page.getByTestId('turn3d-put').click();
    await page.waitForTimeout(300);
    const modelId = await state(() => [...olomol.doc.models.keys()][0]);
    // Align left edges, the molecule and its model: the model's box (its balls) on the molecule's left edge
    const lined = await state(async () => {
      const { align } = await import('/src/arrange/align.js');
      olomol.selectAll();
      align(olomol, 'left');
      const boxes = window.olomolTest.itemBoxes();
      const { modelBox } = await import('/src/render/model3d.js');
      const box = modelBox([...olomol.doc.models.values()][0]);
      return { n: boxes.length, lefts: boxes.map((b) => b.minX), model: box.x1 };
    });
    await page.keyboard.press('Control+z');
    // the Objects panel: a row for the model, with its molecule's formula (before they are grouped: a group's
    // rows folded)
    await state(() => olomol.setSettings({ objectsPanel: true }));
    const row = await page.getByTestId('objects').innerText().catch(() => '');
    await state(() => olomol.setSettings({ objectsPanel: false }));
    // grouped: Ctrl+G with all selected; the group holds the model; picking the group selects it with the molecule
    await state(() => olomol.selectAll());
    await page.keyboard.press('Control+g');
    const grouped = await state(async (id) => {
      const { idsOfGroup } = await import('/src/editor/tools/select.js');
      const [group] = olomol.doc.groups?.values() ?? [];
      return { groups: olomol.doc.groups?.size ?? 0, holds: Boolean(group?.members.includes(id)), picks: Boolean(group && idsOfGroup(olomol, group.id).includes(id)) };
    }, modelId);
    // the group in a picture (an SVG group round the model) and an .olom file (read back: the model in it)
    const filed = await state(async (id) => {
      const { svgOf } = await import('/src/io/files.js');
      const { readOlom, writeOlom } = await import('/src/io/olom.js');
      const picture = svgOf(olomol.doc, olomol.settings, {});
      const inGroup = /<g id="group-\d+"[^>]*>(?:(?!<g id="group-).)*data-id="(\d+)"><g transform/.exec(picture)?.[1] === String(id);
      const back = readOlom(writeOlom(olomol.doc)).doc;
      const [group] = back.groups?.values() ?? [];
      const [model] = back.models.values();
      return { inGroup, file: Boolean(group && model && group.members.includes(model.id)) };
    }, modelId);
    // flipped left to right: mirrored in place about the middle, turned half round about the upright (its x and z
    // turned round, its y as it was), not mirrored (its rotation's determinant still 1)
    const flipped = await state(async (id) => {
      const { flip } = await import('/src/arrange/align.js');
      const model = olomol.doc.models.get(id);
      const before = model.rotation ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const [x0] = [model.x];
      olomol.selectAll();
      flip(olomol, true);
      const after = olomol.doc.models.get(id).rotation;
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const same = (a, b) => Math.abs(a - b) < 1e-9;
      return {
        half: before[0].every((v, j) => same(after[0][j], -v)) && before[1].every((v, j) => same(after[1][j], v)) && before[2].every((v, j) => same(after[2][j], -v)),
        det: det(after), moved: Math.abs(olomol.doc.models.get(id).x - x0) > 0.5,
        // (its molecule flipped too, its wedges swapped: the same molecule, the model up to date)
        current: !(await import('/src/render/model3d.js')).outOfDate(olomol.doc, olomol.doc.models.get(id)),
      };
    }, modelId);
    // turned with the handle by 90°: the model's rotation turned about the line of sight by as much
    await state(() => olomol.selectAll());
    const handle = await state(async () => {
      const { rotationHandle } = await import('/src/editor/tools.js');
      const h = rotationHandle(olomol);
      const [cx, cy] = h.centre;
      const [px, py] = h.point;
      return { from: h.point, to: [cx - (py - cy), cy + (px - cx)] };
    });
    const spunBefore = await state((id) => olomol.doc.models.get(id).rotation, modelId);
    await dragBetween(handle.from, handle.to);
    const spun = await state(({ id, before }) => {
      const after = olomol.doc.models.get(id).rotation;
      // a quarter turn clockwise on the page: what pointed right (x) points down (−y up), what pointed up points right
      const ok = (row, want) => row.every((v, j) => Math.abs(v - want[j]) < 1e-6);
      return ok(after[0], before[1]) && ok(after[1], before[0].map((v) => -v)) && ok(after[2], before[2]);
    }, { id: modelId, before: spunBefore });
    check(Math.abs(lined.model - Math.min(...lined.lefts)) < 1e-6 && lined.lefts.every((x) => Math.abs(x - lined.lefts[0]) < 1e-6) && lined.n === 2
      && grouped.groups === 1 && grouped.holds && grouped.picks && /3D model/.test(row) && /C₃H₆O₃/.test(row) && filed.inGroup && filed.file
      && flipped.half && Math.abs(flipped.det - 1) < 1e-9 && flipped.moved && flipped.current && spun,
      `a 3D model with the drawing: Align left edges (${lined.n} things, left edges ${lined.lefts.map((x) => x.toFixed(2)).join(', ')}, the model's balls at ${lined.model.toFixed(2)}); grouped with its molecule (${grouped.holds}), the group picks it (${grouped.picks}); in the Objects panel (${JSON.stringify(row.replace(/\s+/g, ' ').slice(0, 80))}); the group in a picture (${filed.inGroup}) and an .olom file (${filed.file}); flipped: turned half round (${flipped.half}, determinant ${flipped.det.toFixed(3)}), moved across (${flipped.moved}), still up to date (${flipped.current}); turned 90° with the handle (${spun})`);
  }
}
