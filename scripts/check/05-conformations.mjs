// The browser check: Conformations: the ring flip, Newman projections, the drawn conformation kept in 3D, chairs drawn by hand.
// Run alone: npm run check -- --only conformations [url]

import {
  atomXY, bondMiddle, canonical, check, clear, dragBetween, drawnSmiles, hoverAndPress, layoutDone, notice, page, paste,
  screen, state, tool,
} from './harness.mjs';
// (its parts, in the order run:)
//   ring flip of a chair
//   turning a chair (a third of a turn, and back)
//   a flat ring becomes a chair (the ring flip tool on it): lit, the same molecule, the templates' chair, wavy where unsaid;
//   not put in once the drawing has changed meanwhile
//   Newman projections: molecules seen along a bond; dragged by either carbon, moved whole
//   the drawn conformation in 3D: a chair's axial group axial, a Newman projection's dihedral as drawn
//   Newman projections
//   chairs drawn by hand: a template chair and one drawn with the bond tool's 30° steps light up green-teal under the
export default async function run() {
  // --- ring flip of a chair ---
  {
    // A chair read as chemists read it: each group up or down by its first bond on screen, the ring
    // seen from above with the back edge (the higher neighbour of each tip) at the top; RDKit names
    // the compound from that, so its R/S (D or L) comes from the picture, not from the app
    async function chairSmiles() {
      const { atoms, bonds } = await state(() => ({ atoms: [...olomol.doc.atoms.values()], bonds: [...olomol.doc.bonds.values()] }));
      const byId = new Map(atoms.map((a) => [a.id, a]));
      const near = (id) => bonds.filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
      const sides = await chairSides();
      const ring = Object.keys(sides).map(Number);
      const tip = (side) => ring.find((id) => sides[id] === side);
      const place = new Map([[tip('left'), [-1, 0]], [tip('right'), [1, 0]]]); // seen from above, y up, the back at the top
      for (const [side, x] of [['left', -0.5], ['right', 0.5]]) {
        for (const n of near(tip(side)).filter((n) => ring.includes(n))) place.set(n, [x, sides[n] === 'back' ? 0.87 : -0.87]);
      }
      const stereo = new Map();
      for (const id of ring) {
        const [x, y] = place.get(id);
        for (const n of near(id).filter((n) => !ring.includes(n))) {
          const up = byId.get(n).y < byId.get(id).y;
          place.set(n, [x * 1.8 + (up ? 0.15 : -0.15), y * 1.8]);
          stereo.set(`${id},${n}`, up ? 1 : 6);
          // further atoms of the group (CH2OH's O): straight on outwards
          for (const m of near(n).filter((m) => m !== id)) place.set(m, [x * 2.6, y * 2.6]);
        }
      }
      const ids = [...place.keys()];
      const index = new Map(ids.map((id, i) => [id, i + 1]));
      const used = bonds.filter((b) => index.has(b.a) && index.has(b.b));
      const pad = (v, n) => String(v).padStart(n);
      const block = ['', '  chair', '',
        `${pad(ids.length, 3)}${pad(used.length, 3)}  0  0  0  0  0  0  0  0999 V2000`,
        ...ids.map((id) => `${pad(place.get(id)[0].toFixed(4), 10)}${pad(place.get(id)[1].toFixed(4), 10)}    0.0000 ${byId.get(id).el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
        ...used.map((b) => {
          // a wedge starts at its ring atom
          const [a, c] = stereo.has(`${b.b},${b.a}`) ? [b.b, b.a] : [b.a, b.b];
          return `${pad(index.get(a), 3)}${pad(index.get(c), 3)}${pad(b.order, 3)}${pad(stereo.get(`${a},${c}`) ?? 0, 3)}`;
        }),
        'M  END'].join('\n');
      return canonical(block);
    }
    // the ring atoms of a chair drawn alone: which is a tip (left, right) and which edge (back, front) each is on
    const chairSides = () => state(() => {
      const atoms = [...olomol.doc.atoms.values()];
      const near = (id) => [...olomol.doc.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
      const ring = atoms.filter((a) => near(a.id).filter((n) => near(n).length >= 2).length >= 2 && near(a.id).length >= 2).map((a) => a.id);
      const by = (id) => olomol.doc.atoms.get(id);
      const sorted = [...ring].sort((p, q) => by(p).x - by(q).x);
      const sides = { [sorted[0]]: 'left', [sorted[5]]: 'right' };
      for (const tip of [sorted[0], sorted[5]]) {
        const [p, q] = near(tip).filter((n) => ring.includes(n)).sort((p, q) => by(p).y - by(q).y);
        sides[p] = 'back';
        sides[q] = 'front';
      }
      return sides;
    });
    async function placeChair(name) {
      await clear();
      await page.getByTestId('templates').click();
      await page.getByRole('button', { name: 'Conformations and projections', exact: true }).click();
      await page.locator('[data-testid=template]', { hasText: name }).first().click();
      await page.mouse.move(600, 400);
      await page.mouse.click(620, 410);
      await page.keyboard.press('Escape');
      await state(() => olomol.fit(window.innerWidth, window.innerHeight));
    }
    const ringMiddle = (ids) => state((ids) => {
      const atoms = ids.map((id) => olomol.doc.atoms.get(id));
      return [atoms.reduce((s, a) => s + a.x, 0) / atoms.length, atoms.reduce((s, a) => s + a.y, 0) / atoms.length];
    }, ids);
    const positions = () => state(() => JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.id, a.x.toFixed(4), a.y.toFixed(4)])));

    // methylcyclohexane: the methyl's carbon goes from axial (straight down) to equatorial, and every ring
    // atom keeps its side: the tips stay tips, the back stays at the back
    await placeChair('Methyl, axial');
    await state(() => olomol.setSettings({ animations: false }));
    const methyl = await state(() => {
      const near = (id) => [...olomol.doc.bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
      const end = [...olomol.doc.atoms.values()].find((a) => near(a.id).length === 1);
      return { end: end.id, carbon: near(end.id)[0] };
    });
    const slant = () => state(({ end, carbon }) => {
      const [e, c] = [olomol.doc.atoms.get(end), olomol.doc.atoms.get(carbon)];
      return Math.round((Math.atan2(c.y - e.y, e.x - c.x) * 180) / Math.PI);
    }, methyl);
    const sidesBefore = await chairSides();
    const slantBefore = await slant();
    const ringIds = Object.keys(sidesBefore).map(Number);
    await page.getByTestId('ring-flip').click();
    await page.mouse.move(...(await screen(await ringMiddle(ringIds))));
    const flipGhosts = await page.locator('.ghost-copy').count();
    await page.mouse.click(...(await screen(await ringMiddle(ringIds))));
    const sidesAfter = await chairSides();
    const slantAfter = await slant();
    check(flipGhosts === 1 && Math.abs(Math.abs(slantBefore) - 90) <= 1 && Math.abs(Math.abs(slantAfter) - 90) > 20 && sidesAfter[methyl.carbon] === sidesBefore[methyl.carbon]
      && JSON.stringify(sidesAfter) === JSON.stringify(sidesBefore) && (await state(() => olomol.tool.name)) === 'ringFlip',
      `ring flip: a see-through preview (${flipGhosts}); the methyl's carbon (the ${sidesBefore[methyl.carbon]} tip) goes from axial (${slantBefore}°) to equatorial (${slantAfter}°), every ring atom keeping its side (${JSON.stringify(sidesAfter) === JSON.stringify(sidesBefore)}); the tool stays`);
    // again: back as drawn
    const flippedOnce = await positions();
    await page.mouse.click(...(await screen(await ringMiddle(ringIds))));
    check((await slant()) === slantBefore, `ring flip again: the methyl axial again (${await slant()}°)`);
    await state(() => olomol.undo());
    check((await positions()) === flippedOnce, 'ring flip: one undo step');

    // β-D-glucose stays β-D-glucose: read from the picture before and after (and as β-D before, so the reading is right)
    await placeChair('β-D-Glucose, chair');
    const betaD = canonical('OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O');
    const glucoseBefore = await chairSmiles();
    const glucoseRing = Object.keys(await chairSides()).map(Number);
    // (animated: where it ends is the same as at once)
    await state(() => olomol.setSettings({ animations: true }));
    await page.getByTestId('ring-flip').click();
    await page.mouse.click(...(await screen(await ringMiddle(glucoseRing))));
    await page.waitForFunction(() => !olomol.animation, null, { timeout: 5000 }).catch(() => {});
    const glucoseAfter = await chairSmiles();
    const allAxial = await state((ring) => [...olomol.doc.bonds.values()].filter((b) => ring.includes(b.a) !== ring.includes(b.b)).every((b) => {
      const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
      return Math.abs(p.x - q.x) < 0.01;
    }), glucoseRing);
    check(glucoseBefore === betaD && glucoseAfter === betaD && allAxial && (await drawnSmiles()) === betaD,
      `ring flip, animated: β-D-glucose stays β-D-glucose, now all axial, as the app reads it too (${glucoseAfter === betaD}, ${allAxial}; ${glucoseAfter}, ${await drawnSmiles()})`);
    // a key pressed while it flips (Ctrl+S, Ctrl+C, Export…): the flip finished first, so what is read is its end
    {
      await page.mouse.click(...(await screen(await ringMiddle(glucoseRing))));
      await page.waitForTimeout(150);
      const during = await state(() => Boolean(olomol.animation));
      await page.keyboard.press('Shift');
      const after = await state(() => Boolean(olomol.animation));
      const equatorial = await state((ring) => [...olomol.doc.bonds.values()].filter((b) => ring.includes(b.a) !== ring.includes(b.b)).filter((b) => {
        const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
        return Math.abs(p.x - q.x) < 0.01;
      }).length, glucoseRing);
      check(during && !after && (await chairSmiles()) === betaD && equatorial < 3,
        `a key pressed during the ring flip's animation finishes it first (animating ${during}, then ${after}; β-D-glucose, ${equatorial} bonds still upright)`);
    }

    // Shift+click: the other chair beside it, with an equilibrium arrow; the chair stays
    const shiftBefore = await positions();
    const idsBefore = await state(() => [...olomol.doc.atoms.keys()]);
    await page.keyboard.down('Shift');
    await page.mouse.click(...(await screen(await ringMiddle(glucoseRing))));
    await page.keyboard.up('Shift');
    const beside = await state((before) => {
      const atoms = [...olomol.doc.atoms.values()];
      const old = atoms.filter((a) => before.includes(a.id));
      const added = atoms.filter((a) => !before.includes(a.id));
      return { atoms: atoms.length, arrows: [...olomol.doc.arrows.values()].map((a) => a.kind).join(), right: Math.min(...added.map((a) => a.x)) > Math.max(...old.map((a) => a.x)) + 2 };
    }, idsBefore);
    const kept = (await positions()).startsWith(shiftBefore.slice(0, -1));
    check(beside.atoms === 24 && beside.arrows === 'equilibrium' && beside.right && kept,
      `ring flip with Shift: the other chair beside it, with ⇌ (${JSON.stringify(beside)}, the first chair kept: ${kept})`);
    await page.screenshot({ path: 'test-output/ring-flip.png' });

    // the animation: chair → boat (the raised tip drops) → the other chair, never a flat ring
    await placeChair('Chair');
    await state(() => olomol.setSettings({ animations: true }));
    const bareRing = Object.keys(await chairSides()).map(Number);
    await page.getByTestId('ring-flip').click();
    await state((ring) => {
      window.ringFrames = [];
      // (until the flip has started and ended: the click can come some frames later, as in Firefox)
      let started = false;
      const record = () => {
        if (!ring.every((id) => olomol.doc.atoms.has(id))) return;
        const pts = ring.map((id) => [olomol.doc.atoms.get(id).x, olomol.doc.atoms.get(id).y]);
        window.ringFrames.push(pts);
        if (olomol.animation) started = true;
        if ((olomol.animation || !started) && window.ringFrames.length < 2000) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    }, bareRing);
    await page.mouse.click(...(await screen(await ringMiddle(bareRing))));
    await page.waitForFunction(() => !olomol.animation, null, { timeout: 5000 }).catch(() => {});
    const motion = await state(() => window.ringFrames.map((pts) => {
      // the tips: leftmost and rightmost; how far each hangs below (+) the middle of the other four
      const order = pts.map((p, i) => i).sort((i, j) => pts[i][0] - pts[j][0]);
      const edge = order.slice(1, 5).reduce((s, i) => s + pts[i][1], 0) / 4;
      return [pts[order[0]][1] - edge, pts[order[5]][1] - edge];
    }));
    const flat = motion.filter(([l, r]) => Math.abs(l) < 0.2 && Math.abs(r) < 0.2).length;
    const boats = motion.filter(([l, r]) => l > 0.2 && r > 0.2).length;
    check(motion.length > 10 && flat === 0 && boats > 0 && motion[motion.length - 1][0] > 0.2 && motion[0][0] < -0.2,
      `ring flip animated: ${motion.length} frames, through a boat (${boats} frames), never flat (${flat}); the left tip from raised to lowered`);

    // a ring drawn flat becomes a chair (see below); a decalin is refused, with a message, nothing moved
    await clear();
    await paste('C1CCCCC1');
    const flatRing = await state(() => [...olomol.doc.atoms.keys()]);
    const flatBefore = await positions();
    await page.getByTestId('ring-flip').click();
    await page.mouse.click(...(await screen(await ringMiddle(flatRing))));
    await page.waitForFunction((was) => JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.id, a.x.toFixed(4), a.y.toFixed(4)])) !== was, flatBefore, { timeout: 15_000 }).catch(() => {});
    const flatChair = await page.evaluate(async (ring) => { const { readChair } = await import('/src/chem/ringFlip.js'); return readChair(olomol.doc, ring).error ?? 'a chair'; }, flatRing);
    check(flatChair === 'a chair', `ring flip on a ring drawn flat: it becomes a chair (${flatChair})`);
    await placeChair('Chair');
    const chairRing = Object.keys(await chairSides()).map(Number);
    const fuseOn = await state((ring) => [...olomol.doc.bonds.values()].find((b) => ring.includes(b.a) && ring.includes(b.b)).id, chairRing);
    await state(() => olomol.setTool({ name: 'ring', size: 6, aromatic: false }));
    await page.mouse.click(...(await screen(await bondMiddle(fuseOn))));
    const fusedBefore = await positions();
    await page.getByTestId('ring-flip').click();
    await page.mouse.click(...(await screen(await ringMiddle(chairRing))));
    const fusedSays = await notice();
    check((await state(() => olomol.doc.atoms.size)) >= 10 && fusedSays.includes('Fused') && (await positions()) === fusedBefore,
      `ring flip: a chair with a ring fused on (a decalin) is refused ("${fusedSays}")`);
    await page.keyboard.press('Escape');
    // a chair with a wedge on one of its own bonds: refused for that wedge, not as if it had a double bond
    await placeChair('Chair');
    const wedgedRing = Object.keys(await chairSides()).map(Number);
    await state((ring) => olomol.change((doc) => { [...doc.bonds.values()].find((b) => ring.includes(b.a) && ring.includes(b.b)).stereo = 'wedge'; }), wedgedRing);
    const wedgedBefore = await positions();
    await state(() => olomol.clearNotice());
    await page.getByTestId('ring-flip').click();
    await page.mouse.click(...(await screen(await ringMiddle(wedgedRing))));
    const wedgeSays = await notice();
    check(/wedge/.test(wedgeSays) && !/Only a ring of single bonds/.test(wedgeSays) && (await positions()) === wedgedBefore,
      `ring flip: a chair with a wedge on a ring bond is refused for the wedge ("${wedgeSays}")`);
    await page.keyboard.press('Escape');
    await state(() => olomol.setSettings({ animations: undefined }));
  }

  // --- Newman projections: molecules seen along a bond ---
  {
    async function placeTemplate(name) {
      await clear();
      await page.getByTestId('templates').click();
      await page.getByRole('button', { name: 'Conformations and projections', exact: true }).click();
      await page.locator('[data-testid=template]', { hasText: name }).first().click();
      await page.mouse.move(600, 400);
      await page.mouse.click(620, 410);
      await page.keyboard.press('Escape');
      await state(() => olomol.fit(window.innerWidth, window.innerHeight));
    }
    const axles = () => state(() => [...olomol.doc.bonds.values()].filter((b) => b.newman && Math.hypot(olomol.doc.atoms.get(b.a).x - olomol.doc.atoms.get(b.b).x, olomol.doc.atoms.get(b.a).y - olomol.doc.atoms.get(b.b).y) < 0.02).map((b) => ({ id: b.id, a: b.a, b: b.b, at: [olomol.doc.atoms.get(b.a).x, olomol.doc.atoms.get(b.a).y] })));
    const hitAt = (p) => state((p) => {
      const hit = olomol.hitAt(p);
      return hit ? `${hit.kind}:${hit.id}` : 'none';
    }, p);
    const panel = () => page.locator('.inspector section', { hasText: 'Newman projection' });
    // (the template's hydrogens are atoms: compared without them)
    const smilesNow = async () => canonical(await state(() => window.olomolTest.molfile()), { removeHs: true });

    // butane, anti: a molecule (butane), the circle drawn as its bond; the middle is the front carbon, the circle the back one, between them the bond
    await placeTemplate('Butane, anti (Newman)');
    const [axle] = await axles();
    const [cx, cy] = axle.at;
    const hits = [await hitAt([cx + 0.03, cy]), await hitAt([cx + 0.2, cy + 0.02]), await hitAt([cx + 0.42, cy + 0.03]), await hitAt([cx - 0.3, cy - 0.32])];
    const circle = await page.locator(`[data-id="${axle.id}"] path`).count();
    check((await smilesNow()) === canonical('CCCC') && circle === 1 && hits.join() === [`atom:${axle.a}`, `bond:${axle.id}`, `atom:${axle.b}`, `atom:${axle.b}`].join(),
      `Newman projection: butane as a molecule, the circle its bond seen end on (${circle}); the middle, the ring between and the circle: ${hits.join(', ')}`);
    // D, 2 (or 3, 1) over that bond: refused with a word, the projection as it was (before, D made it a
    // coordination arrow of no length and the projection fell apart)
    const keyed = [];
    for (const key of ['d', '2']) {
      await hoverAndPress([cx + 0.2, cy + 0.02], key);
      keyed.push({ said: await notice(), axles: (await axles()).length, kind: await state((id) => olomol.doc.bonds.get(id)?.kind ?? null, axle.id), order: await state((id) => olomol.doc.bonds.get(id)?.order, axle.id) });
    }
    check(keyed.every((k) => k.axles === 1 && k.kind === null && k.order === 1 && k.said.includes('end on')),
      `Newman projection: D and 2 over its bond seen end on are refused (${keyed.map((k) => `${k.axles} axle, ${k.kind ?? 'plain'} order ${k.order}`).join('; ')}; "${keyed[0].said}")`);

    // dragged by its front carbon (the middle point) or its back one (the circle), the projection moves whole:
    // the two carbons stay two, on one point
    {
      await state(() => olomol.setTool({ name: 'select' }));
      const dragged = [];
      for (const grip of [[cx + 0.03, cy], [cx + 0.42, cy + 0.03]]) {
        await state(() => olomol.clearSelection());
        await dragBetween(grip, [grip[0] + 1.5, grip[1] + 0.8]);
        const [moved] = await axles();
        dragged.push({ smiles: await smilesNow(), atoms: await state(() => [...olomol.doc.atoms.values()].filter((a) => a.el === 'C').length), endOn: Boolean(moved) });
        await state(() => olomol.undo());
      }
      check(dragged.every((d) => d.smiles === canonical('CCCC') && d.atoms === 4 && d.endOn),
        `Newman projection dragged by its middle point or its circle: still butane, its two carbons on one point (${dragged.map((d) => `${d.atoms} C, ${d.smiles}, end on ${d.endOn}`).join('; ')})`);
    }

    // the panel: the front's and the back's groups typed in (2,3-dibromobutane), R/S as drawn; turning the back keeps the molecule
    await page.mouse.click(...(await screen([cx, cy])));
    const fields = panel().locator('input.field');
    const shown = await fields.evaluateAll((inputs) => inputs.map((i) => i.value));
    // from the top, clockwise: front CH3, H, H; back (anti) H, H, CH3 or as turned
    const frontH = shown.slice(0, 3).indexOf('H');
    await fields.nth(frontH).fill('Br');
    await fields.nth(frontH).press('Enter');
    const backFields = await panel().locator('input.field').evaluateAll((inputs) => inputs.map((i) => i.value));
    const backH = 3 + backFields.slice(3).indexOf('H');
    await panel().locator('input.field').nth(backH).fill('Br');
    await panel().locator('input.field').nth(backH).press('Enter');
    const dibromo = await smilesNow();
    await page.getByTestId('newman-turn').click();
    const turned = await smilesNow();
    await panel().getByRole('button', { name: '0°', exact: true }).click();
    const eclipsed = await smilesNow();
    const isomers = [canonical('C[C@@H](Br)[C@H](C)Br'), canonical('C[C@@H](Br)[C@@H](C)Br'), canonical('C[C@H](Br)[C@H](C)Br')];
    check(shown.length === 6 && isomers.includes(dibromo) && turned === dibromo && eclipsed === dibromo,
      `Newman panel: groups typed in (${shown.join(' ')} → ${dibromo}); Turn the back 60° and eclipsed keep it (${turned === dibromo}, ${eclipsed === dibromo})`);
    // flipped left to right: the back carbon now in front, the same compound
    await state(() => olomol.selectAll());
    await page.getByTitle('Flip left–right (selection, or everything)').click();
    check((await smilesNow()) === dibromo && (await axles()).length === 1, `Newman projection flipped left–right: the same stereoisomer (${await smilesNow()})`);
    // other programs get it drawn plainly, with wedges; Redraw too
    const molfile = await state(() => window.olomolTest.writeAs('mol'));
    const lines = molfile.split('\n');
    const counts = parseInt(lines[3].slice(0, 3), 10);
    const points = lines.slice(4, 4 + counts).map((l) => [parseFloat(l.slice(0, 10)), parseFloat(l.slice(10, 20))]);
    const apart = points.every((p, i) => points.every((q, j) => i === j || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.3));
    check(canonical(molfile, { removeHs: true }) === dibromo && apart && /\s1\s+[16]\s*$/m.test(lines.slice(4 + counts).join('\n')),
      `Newman projection in a molfile: drawn plainly (no atoms on one another: ${apart}), with wedges, the same stereoisomer`);
    await page.getByTestId('relayout').click();
    await page.getByTestId('layout-card').first().waitFor({ timeout: 60_000 });
    await layoutDone();
    await page.getByTestId('layout-card').first().click();
    await page.waitForTimeout(300);
    check((await smilesNow()) === dibromo && (await axles()).length === 0, `Redraw of a Newman projection: an ordinary drawing of the same stereoisomer (${await smilesNow()})`);

    // cyclohexane seen along two bonds: an E2 drawn on it, curved arrows to the bond seen end on
    await placeTemplate('Cyclohexane (Newman)');
    // (the right-hand projection: there a 3D model once put the two H of the CH2 the other way round)
    const ring = (await axles()).sort((p, q) => q.at[0] - p.at[0]);
    const e2 = await state(({ a, b, id }) => {
      const near = (x) => [...olomol.doc.bonds.values()].filter((bond) => bond.a === x || bond.b === x).map((bond) => ({ bond, other: bond.a === x ? bond.b : bond.a }));
      const at = (x) => olomol.doc.atoms.get(x);
      // the front carbon's H straight up becomes Br, the back carbon's H straight down gives the base its proton
      const up = near(a).find(({ other }) => at(other).el === 'H' && at(other).y < at(a).y - 0.8);
      const down = near(b).find(({ other }) => at(other).el === 'H' && at(other).y > at(b).y + 0.8);
      olomol.change(() => {
        at(up.other).el = 'Br';
      });
      return { brBond: up.bond.id, br: up.other, hBond: down.bond.id, axle: id };
    }, ring[0]);
    await tool('curve').click();
    const middle = async (bondId) => state((id) => {
      const b = olomol.doc.bonds.get(id);
      const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
      return [(p.x + q.x) / 2, (p.y + q.y) / 2];
    }, bondId);
    const hMiddle = await middle(e2.hBond);
    await dragBetween(hMiddle, [ring[0].at[0] + 0.2, ring[0].at[1] + 0.02]);
    await dragBetween(await middle(e2.brBond), await atomXY(e2.br));
    const arrows = await state(() => [...olomol.doc.curves.values()].map((c) => `${c.from.bond ?? c.from.atom}>${c.to.bond ?? c.to.atom}`));
    await page.keyboard.press('Escape');
    check(arrows.includes(`${e2.hBond}>${e2.axle}`) && arrows.includes(`${e2.brBond}>${e2.br}`) && (await smilesNow()) === canonical('BrC1CCCCC1'),
      `E2 on cyclohexane seen along two bonds: an arrow from the axial C–H to the bond seen end on, one from C–Br to Br (${arrows.join(', ')})`);
    await page.screenshot({ path: 'test-output/newman-e2.png' });
    // in 3D (Turn in 3D, Use this view) the H the base takes stays anti to the Br, though its carbon (a CH2) is
    // no stereocentre: read with that H as ²H, before and after
    const withD = async () => {
      await state((h) => olomol.change((doc) => {
        doc.atoms.get(h).isotope = 2;
      }), e2.hBond && (await state((id) => {
        const b = olomol.doc.bonds.get(id);
        return olomol.doc.atoms.get(b.a).el === 'H' ? b.a : b.b;
      }, e2.hBond)));
      const marked = canonical(await state(() => window.olomolTest.molfile()), { removeHs: true });
      await state(() => olomol.undo());
      return marked;
    };
    const antiBefore = await withD();
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.getByTestId('turn3d-use').click();
    await page.waitForTimeout(300);
    const antiAfter = await withD();
    check(antiBefore.includes('@') && antiAfter === antiBefore && (await axles()).length === 0,
      `Newman projection in 3D: the axial H the base takes stays anti to the Br (${antiBefore} → ${antiAfter})`);
  }

  // --- the drawn conformation in 3D: a chair's axial group axial, a Newman projection's dihedral as drawn ---
  {
    async function placeConformation(name) {
      await clear();
      await page.getByTestId('templates').click();
      await page.getByRole('button', { name: 'Conformations and projections', exact: true }).click();
      await page.locator('[data-testid=template]', { hasText: name }).first().click();
      await page.mouse.move(600, 400);
      await page.mouse.click(620, 410);
      await page.keyboard.press('Escape');
    }
    // the 3D model's geometry, worked out in the page: torsions of atoms given by id, the angle of a group to its ring's axis
    const model = () => state(async () => {
      olomol.selectAll();
      const m = await window.olomolTest.model3D();
      const at = (id) => m.points[m.atomIds.indexOf(id)];
      const sub = (a, b) => a.map((v, i) => v - b[i]);
      const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const bonds = [...olomol.doc.bonds.values()];
      const near = (id) => bonds.filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
      const atoms = [...olomol.doc.atoms.values()];
      // a chair with one group: the group the atom with one bond, the ring the rest
      const group = atoms.find((a) => near(a.id).length === 1);
      let toAxis = null;
      if (group && atoms.length === 7) {
        const ring = atoms.filter((a) => a !== group).map((a) => a.id);
        const c = [0, 1, 2].map((k) => ring.reduce((s, id) => s + at(id)[k], 0) / 6);
        const order = [ring[0]];
        while (order.length < 6) order.push(near(order.at(-1)).find((n) => ring.includes(n) && !order.includes(n)));
        const normal = order.reduce((n, id, k) => n.map((v, q) => v + cross(sub(at(id), c), sub(at(order[(k + 1) % 6]), c))[q]), [0, 0, 0]);
        const bond = sub(at(group.id), at(near(group.id)[0]));
        toAxis = Math.round((Math.acos(Math.abs(dot(bond, normal)) / Math.hypot(...bond) / Math.hypot(...normal)) * 180) / Math.PI);
      }
      const torsion = (ids) => {
        const [a, b, c, d] = ids.map(at);
        const [b1, b2, b3] = [sub(b, a), sub(c, b), sub(d, c)];
        const [n1, n2] = [cross(b1, b2), cross(b2, b3)];
        return Math.round((Math.atan2(dot(cross(n1, n2), b2) / Math.hypot(...b2), dot(n1, n2)) * 180) / Math.PI);
      };
      // each Newman projection's two heavy end groups (butane's CH3): their torsion in the model and as drawn
      const newman = bonds.filter((b) => b.newman).map((axle) => {
        const end = (c, o) => near(c).find((n) => n !== o && olomol.doc.atoms.get(n).el !== 'H');
        const [f, g] = [end(axle.a, axle.b), end(axle.b, axle.a)];
        if (f === undefined || g === undefined) return null;
        const angle = (id, c) => Math.atan2(olomol.doc.atoms.get(id).y - olomol.doc.atoms.get(c).y, olomol.doc.atoms.get(id).x - olomol.doc.atoms.get(c).x);
        const drawn = Math.round(((((angle(g, axle.b) - angle(f, axle.a)) * 180) / Math.PI + 540) % 360) - 180);
        return { model: torsion([f, axle.a, axle.b, g]), drawn };
      });
      return { toAxis, lost: m.conformationLost, newman, reason: m.reason };
    });
    const results = [];
    for (const [name, change, axial] of [['Methyl, axial', null, true], ['Methyl, equatorial', null, false], ['Methyl, axial', 'O', true]]) {
      await placeConformation(name);
      if (change) await state((el) => olomol.change((doc) => {
        const atom = [...doc.atoms.values()].find((a) => [...doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length === 1);
        atom.el = el;
      }), change);
      const { toAxis, lost } = await model();
      results.push(`${change === 'O' ? 'cyclohexanol, OH axial' : name}: ${toAxis}°`);
      check(!lost && (axial ? toAxis < 35 : toAxis > 50), `3D model of a chair: ${results.at(-1)} to the ring's axis, as drawn`);
    }
    for (const name of ['Butane, gauche (Newman)', 'Butane, eclipsed (Newman)', 'Butane, anti (Newman)']) {
      await placeConformation(name);
      const { newman: [torsion] } = await model();
      // (an eclipsed back is drawn a little further round: eclipsed in 3D)
      const want = Math.round(torsion.drawn / 60) * 60;
      const off = Math.abs(((torsion.model - want + 540) % 360) - 180);
      check(off < 15, `3D model of ${name}: C–C–C–C ${torsion.model}°, drawn ${want}°`);
    }
    // butadiene drawn s-cis, as for a Diels–Alder: s-cis in 3D too (a conformer generator makes it s-trans)
    await clear();
    await paste('C=CC=C');
    await state(() => olomol.change((doc) => {
      [...doc.atoms.values()].forEach((a, k) => Object.assign(a, { x: [0, 0.5, 1.5, 2][k], y: [0, -0.87, -0.87, 0][k] }));
    }));
    const diene = await state(async () => {
      olomol.selectAll();
      const m = await window.olomolTest.model3D();
      const [a, b, c, d] = m.points;
      const sub = (p, q) => p.map((v, i) => v - q[i]);
      const dot = (p, q) => p.reduce((s, v, i) => s + v * q[i], 0);
      const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
      const [b1, b2, b3] = [sub(b, a), sub(c, b), sub(d, c)];
      const [n1, n2] = [cross(b1, b2), cross(b2, b3)];
      return Math.round((Math.atan2(dot(cross(n1, n2), b2) / Math.hypot(...b2), dot(n1, n2)) * 180) / Math.PI);
    });
    check(Math.abs(diene) < 60, `3D model of butadiene drawn s-cis: s-cis (C=C–C=C ${diene}°)`);

    // the E2 on cyclohexane seen along C1–C2: Br axial up in front, the base's H axial down at the back, anti in 3D
    await placeConformation('Cyclohexane (Newman)');
    const [br, h, front, back] = await state(() => {
      const axle = [...olomol.doc.bonds.values()].find((b) => b.newman);
      const near = (x) => [...olomol.doc.bonds.values()].filter((b) => b.a === x || b.b === x).map((b) => (b.a === x ? b.b : b.a));
      const at = (x) => olomol.doc.atoms.get(x);
      const up = near(axle.a).find((id) => at(id).el === 'H' && at(id).y < at(axle.a).y - 0.8);
      const down = near(axle.b).find((id) => at(id).el === 'H' && at(id).y > at(axle.b).y + 0.8);
      olomol.change(() => {
        at(up).el = 'Br';
      });
      return [up, down, axle.a, axle.b];
    });
    const anti = await state(async (ids) => {
      olomol.selectAll();
      const m = await window.olomolTest.model3D();
      const [a, b, c, d] = ids.map((id) => m.points[m.atomIds.indexOf(id)]);
      const sub = (p, q) => p.map((v, i) => v - q[i]);
      const dot = (p, q) => p.reduce((s, v, i) => s + v * q[i], 0);
      const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
      const [b1, b2, b3] = [sub(b, a), sub(c, b), sub(d, c)];
      const [n1, n2] = [cross(b1, b2), cross(b2, b3)];
      return Math.round((Math.atan2(dot(cross(n1, n2), b2) / Math.hypot(...b2), dot(n1, n2)) * 180) / Math.PI);
    }, [br, front, back, h]);
    check(Math.abs(Math.abs(anti) - 180) < 30, `3D model of the E2 on cyclohexane seen along C1–C2: Br and the base's H trans-diaxial (${anti}°)`);

    // the ring flip on it: with that H a Cl (trans-1-bromo-2-chlorocyclohexane), Br and Cl equatorial after it,
    // the same compound, gauche in 3D; a second flip puts every atom back
    await state((id) => olomol.change(() => {
      olomol.doc.atoms.get(id).el = 'Cl';
    }), h);
    const where = () => state(() => [...olomol.doc.atoms.values()].map((a) => `${a.x.toFixed(3)},${a.y.toFixed(3)}`).join(' '));
    const vertical = (id, carbon) => state(([id, c]) => Math.abs(olomol.doc.atoms.get(id).x - olomol.doc.atoms.get(c).x) < 0.05, [id, carbon]);
    const smilesBefore = canonical(await state(() => window.olomolTest.molfile()), { removeHs: true });
    const drawnBefore = await where();
    const axialBefore = (await vertical(br, front)) && (await vertical(h, back));
    const middle = await state(([p, q]) => {
      const [a, b] = [olomol.doc.atoms.get(p), olomol.doc.atoms.get(q)];
      return [(a.x + b.x) / 2, (a.y + b.y) / 2];
    }, [front, await state(() => [...olomol.doc.bonds.values()].filter((b) => b.newman)[1].a)]);
    await page.getByTestId('ring-flip').click();
    await page.mouse.click(...(await screen(middle)));
    await page.waitForFunction(() => !olomol.animation, null, { timeout: 5000 }).catch(() => {});
    const smilesAfter = canonical(await state(() => window.olomolTest.molfile()), { removeHs: true });
    const equatorialAfter = !(await vertical(br, front)) && !(await vertical(h, back));
    const gauche = await state(async (ids) => {
      olomol.selectAll();
      const m = await window.olomolTest.model3D();
      const [a, b, c, d] = ids.map((id) => m.points[m.atomIds.indexOf(id)]);
      const sub = (p, q) => p.map((v, i) => v - q[i]);
      const dot = (p, q) => p.reduce((s, v, i) => s + v * q[i], 0);
      const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
      const [b1, b2, b3] = [sub(b, a), sub(c, b), sub(d, c)];
      const [n1, n2] = [cross(b1, b2), cross(b2, b3)];
      return Math.round((Math.atan2(dot(cross(n1, n2), b2) / Math.hypot(...b2), dot(n1, n2)) * 180) / Math.PI);
    }, [br, front, back, h]);
    await page.mouse.click(...(await screen(middle)));
    await page.waitForFunction(() => !olomol.animation, null, { timeout: 5000 }).catch(() => {});
    const drawnAgain = await where();
    await page.keyboard.press('Escape');
    check(smilesBefore.includes('@') && smilesAfter === smilesBefore && axialBefore && equatorialAfter && Math.abs(Math.abs(gauche) - 60) < 30 && drawnAgain === drawnBefore,
      `ring flip of cyclohexane seen along two bonds: trans-diaxial Br and Cl now diequatorial (${axialBefore}, ${equatorialAfter}), the same compound (${smilesAfter}), gauche in 3D (${gauche}°), and back again (${drawnAgain === drawnBefore})`);
  }

  // --- cyclohexane seen along two bonds but not drawn as the template (a carbon between pulled aside): the ring
  // flip refuses it with a word, it isn't made a chair ---
  {
    await clear();
    await page.getByTestId('templates').click();
    await page.getByRole('button', { name: 'Conformations and projections', exact: true }).click();
    await page.locator('[data-testid=template]', { hasText: 'Cyclohexane (Newman)' }).first().click();
    await page.mouse.move(600, 400);
    await page.mouse.click(620, 410);
    await page.keyboard.press('Escape');
    const middle = await state(() => {
      const ring = olomol.scene.rings.find((r) => r.length === 6);
      const endOn = new Set([...olomol.doc.bonds.values()].filter((b) => b.newman).flatMap((b) => [b.a, b.b]));
      const between = ring.find((id) => !endOn.has(id));
      olomol.change((doc) => { doc.atoms.get(between).x += 0.6; doc.atoms.get(between).y += 0.5; });
      const xs = ring.map((id) => olomol.doc.atoms.get(id).x);
      const ys = ring.map((id) => olomol.doc.atoms.get(id).y);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    });
    const where = () => state(() => [...olomol.doc.atoms.values()].map((a) => `${a.x.toFixed(3)},${a.y.toFixed(3)}`).join(' '));
    const before = await where();
    await page.getByTestId('ring-flip').click();
    await page.mouse.click(...(await screen(middle)));
    await page.waitForTimeout(600);
    const said = await notice();
    const after = await where();
    await page.keyboard.press('Escape');
    check(after === before && /seen along two bonds/.test(said), `cyclohexane seen along two bonds, not as the template draws it: the ring flip refuses it ("${said}"), not made a chair (${after === before ? 'every atom where it was' : 'moved'})`);
  }

  // --- Newman projections ---
  await clear();
  await page.getByTestId('templates').click();
  await page.getByRole('button', { name: 'Conformations and projections', exact: true }).click();
  await page.locator('[data-testid=template]', { hasText: 'Butane, anti' }).click();
  await page.mouse.move(600, 400);
  await page.mouse.click(620, 410);
  await page.keyboard.press('Escape');
  await state(() => olomol.selectAll());
  const gauche = page.locator('.inspector section', { hasText: 'Newman projection' }).getByRole('button', { name: '60°', exact: true });
  await gauche.click();
  const butaneNow = canonical(await state(() => window.olomolTest.molfile()), { removeHs: true });
  check(butaneNow === canonical('CCCC') && (await gauche.getAttribute('class'))?.includes('on'), `Newman template: butane anti, turned to gauche in the panel (${butaneNow})`);

  // --- chairs drawn by hand: a template chair and one drawn with the bond tool's 30° steps light up green-teal under the
  // pointer (their whole ring), a flat hexagon in the usual blue; nothing is drawn for them otherwise; the hand-drawn
  // one flips into the template's shape ---
  {
    await clear();
    await state(async () => {
      const { chairDoc } = await import('/src/chem/chair.js');
      const { addAtom, addBond } = await import('/src/model/doc.js');
      const D = Math.PI / 180;
      const doc = chairDoc({ axial: ['Br', 'Br'] });
      const ring = (corners, dx) => {
        const ids = corners.map(([x, y]) => addAtom(doc, x + dx, y).id);
        ids.forEach((id, k) => addBond(doc, id, ids[(k + 1) % 6]));
        return ids;
      };
      const step = ([x, y], a) => [x + 1.3 * Math.cos(a * D), y + 1.3 * Math.sin(a * D)];
      const [t1, u1, l1] = [[0, 0], step([0, 0], -30), step([0, 0], -60)];
      const [u2, l2] = [step(u1, 30), step(l1, 30)];
      window.handChair = ring([t1, u1, u2, step(u2, -60), l2, l1].map(([x, y]) => [x, -y]), 5);
      window.hexagon = ring([0, 60, 120, 180, 240, 300].map((a) => [1.3 * Math.cos(a * D), 1.3 * Math.sin(a * D)]), 11);
      olomol.setDoc(doc);
    });
    await state(() => olomol.fit(window.innerWidth - 400, window.innerHeight - 250));
    await page.getByTestId('tool-select').click().catch(() => {});
    // the middle of the bond between two of a ring's atoms, on the screen
    const bondMiddle = (ring, i, j) => state(([ring, i, j]) => {
      const [a, b] = [olomol.doc.atoms.get(window[ring][i]), olomol.doc.atoms.get(window[ring][j])];
      return [((a.x + b.x) / 2) * olomol.view.scale + olomol.view.tx, ((a.y + b.y) / 2) * olomol.view.scale + olomol.view.ty];
    }, [ring, i, j]);
    const lit = async (point) => {
      await page.mouse.move(...point);
      await page.waitForTimeout(150);
      // (the ring's bonds; the atom or bond pointed at may be lit too)
      return [await page.locator('[data-testid=chair-under] line').count(), await page.locator('.halo.hover').count()];
    };
    const onChair = await lit(await bondMiddle('handChair', 1, 2));
    const onHexagon = await lit(await bondMiddle('hexagon', 0, 1));
    await page.mouse.move(5, 300);
    await page.waitForTimeout(150);
    const away = await page.locator('[data-testid=chair-under] line, .halo.hover').count();
    // the ring flip on the hand-drawn chair, on its long back edge
    await page.getByTestId('ring-flip').click();
    const edge = await bondMiddle('handChair', 1, 2);
    const before = await state(() => window.handChair.map((id) => olomol.doc.atoms.get(id).y.toFixed(2)).join());
    await page.mouse.move(...edge);
    await page.mouse.click(...edge);
    await page.waitForTimeout(1200); // (the flip is animated)
    await page.keyboard.press('Escape');
    const after = await state(() => window.handChair.map((id) => olomol.doc.atoms.get(id).y.toFixed(2)).join());
    check(onChair.join() === '6,0' && onHexagon.join() === '0,1' && away === 0 && before !== after,
      `chairs drawn by hand: pointed at, the hand-drawn chair's ring green-teal (${onChair[0]} of 6 bonds, ${onChair[1]} blue), the hexagon's bond blue (${onHexagon.join(' green-teal, ')} blue), nothing away from them (${away}); the hand-drawn chair flipped (${before !== after})`);
  }

  // --- turning a chair: the chair turn tool on β-D-glucose's chair, a third of a turn round, then back ---
  {
    await clear();
    await page.getByTestId('templates').click();
    await page.getByRole('button', { name: 'Conformations and projections', exact: true }).click();
    await page.locator('[data-testid=template]', { hasText: 'β-D-Glucose, chair' }).first().click();
    await page.mouse.move(600, 400);
    await page.mouse.click(620, 410);
    await page.keyboard.press('Escape');
    await state(() => { olomol.clearSelection(); olomol.fit(window.innerWidth, window.innerHeight); });
    const before = await drawnSmiles();
    const read = () => page.evaluate(async () => {
      const { readChair } = await import('/src/chem/ringFlip.js');
      const ring = olomol.scene.rings.find((r) => r.length === 6);
      const chair = readChair(olomol.doc, ring);
      const left = [...ring].sort((p, q) => olomol.doc.atoms.get(p).x - olomol.doc.atoms.get(q).x)[0];
      return { slots: chair.error ? chair.error : chair.groups.map((g) => `${g.first}${g.slot}`).sort().join(), left, where: JSON.stringify([...olomol.doc.atoms.values()].map((a) => [Math.round(a.x * 100), Math.round(a.y * 100)])), steps: olomol.undoStack.length };
    });
    const start = await read();
    await page.getByTestId('chair-turn').click();
    const middle = await state(() => {
      const ring = olomol.scene.rings.find((r) => r.length === 6);
      const [x, y] = [ring.reduce((s, id) => s + olomol.doc.atoms.get(id).x, 0) / 6, ring.reduce((s, id) => s + olomol.doc.atoms.get(id).y, 0) / 6];
      return [x * olomol.view.scale + olomol.view.tx, y * olomol.view.scale + olomol.view.ty];
    });
    await page.mouse.move(...middle);
    await page.waitForTimeout(150);
    const ghost = await state(() => Boolean(olomol.preview?.doc));
    await page.mouse.click(...middle);
    await page.waitForFunction(() => !olomol.animation, null, { timeout: 5000 });
    const turned = await read();
    const turnedSmiles = await drawnSmiles();
    await page.keyboard.down('Shift');
    await page.mouse.click(...middle);
    await page.keyboard.up('Shift');
    await page.waitForFunction(() => !olomol.animation, null, { timeout: 5000 });
    const back = await read();
    check(ghost && turnedSmiles === before && turned.slots === start.slots && turned.left !== start.left && turned.steps === start.steps + 1
      && back.where === start.where && back.slots === start.slots,
      `turning a chair: β-D-glucose a third of a turn round (shown first: ${ghost}), the same molecule (${turnedSmiles === before}), every group axial or equatorial as before (${turned.slots === start.slots}), another atom at the left tip (${turned.left !== start.left}), one undo step; Shift+click: back as drawn (${back.where === start.where})`);
    await state(() => olomol.setTool({ name: 'select' }));
  }

  // --- a flat ring becomes a chair: the ring flip tool on a six-membered ring that isn't a chair ---
  {
    const ringMiddleOf = () => state(() => {
      const ring = olomol.scene.rings.find((r) => r.length === 6);
      const [x, y] = [ring.reduce((s, id) => s + olomol.doc.atoms.get(id).x, 0) / 6, ring.reduce((s, id) => s + olomol.doc.atoms.get(id).y, 0) / 6];
      return [x * olomol.view.scale + olomol.view.tx, y * olomol.view.scale + olomol.view.ty];
    });
    const flatToChair = async (smiles, prepare = null) => {
      await clear();
      await paste(smiles);
      if (prepare) await prepare();
      await state(() => { olomol.clearSelection(); olomol.fit(window.innerWidth, window.innerHeight); });
      const before = await drawnSmiles();
      await page.getByTestId('ring-flip').click();
      const at = await ringMiddleOf();
      await page.mouse.move(...at);
      await page.waitForFunction(() => Boolean(olomol.preview?.lit), null, { timeout: 15_000 }).catch(() => {});
      const lit = await page.locator('[data-testid=chair-under] path, [data-testid=chair-under] line').count();
      await state(() => olomol.clearNotice()); // (what it says now, not the case before's)
      await page.mouse.click(...at);
      // (drawn as a chair, or refused with a word)
      await page.waitForFunction((was) => window.olomolTest.molfile() !== was || document.querySelector('.notice'), await state(() => window.olomolTest.molfile()), { timeout: 15_000 }).catch(() => {});
      const said = await notice();
      await page.waitForTimeout(200);
      const read = await page.evaluate(async () => {
        const { readChair } = await import('/src/chem/ringFlip.js');
        const ring = olomol.scene.rings.find((r) => r.length === 6 && !readChair(olomol.doc, r).error);
        if (!ring) return null;
        const chair = readChair(olomol.doc, ring);
        return { slots: chair.groups.map((g) => `${olomol.doc.atoms.get(g.first).alias ?? olomol.doc.atoms.get(g.first).el}${g.slot[0]}`).sort().join(' '), wavy: [...olomol.doc.bonds.values()].filter((b) => b.stereo === 'wavy').length };
      });
      await page.mouse.move(5, 450);
      return { lit, before, after: await drawnSmiles(), read, said };
    };
    const menthol = await flatToChair('CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O');
    const unsaid = await flatToChair('CC1CCCCC1C');
    const hexene = await flatToChair('CC1=CCCCC1');
    check(menthol.lit > 0 && menthol.after === menthol.before && menthol.read?.slots === 'Ce Ce Oe'
      && unsaid.after === unsaid.before && unsaid.read?.wavy === 2 && hexene.read === null && hexene.said.includes('cyclohexene'),
      `a flat ring becomes a chair: menthol lit while pointed at (${menthol.lit}), then a chair of the same molecule (${menthol.after === menthol.before}), all equatorial (${menthol.read?.slots}); 1,2-dimethylcyclohexane with its sides not said: wavy (${unsaid.read?.wavy}); a cyclohexene refused ("${hexene.said}")`);
    // a wedge on a bond of the ring itself (J's drawings): the ring still becomes a chair, the wedge moved onto a group
    // (a stereocentre's) or gone (none there), the molecule the same
    const ringBondWedged = async (choose) => state(([choose]) => {
      const ring = olomol.scene.rings.find((r) => r.length === 6 && r.every((id) => !olomol.scene.atoms.get(id)?.aromatic));
      const set = new Set(ring);
      const bonds = [...olomol.doc.bonds.values()].filter((b) => set.has(b.a) && set.has(b.b));
      return bonds.map((b) => [b.id, b.a, b.b]).slice(0, choose ?? bonds.length);
    }, [choose]);
    const ringWedgesLeft = () => state(() => {
      const ring = olomol.scene.rings.find((r) => r.length === 6 && r.every((id) => !olomol.scene.atoms.get(id)?.aromatic));
      const set = new Set(ring);
      return [...olomol.doc.bonds.values()].filter((b) => set.has(b.a) && set.has(b.b) && ['wedge', 'hash'].includes(b.stereo)).length;
    });
    const plainWedge = await flatToChair('CN(C)CC1CCCCC1', async () => {
      const [[id]] = await ringBondWedged(1);
      await state((id) => olomol.change((doc) => { doc.bonds.get(id).stereo = 'wedge'; }), id);
    });
    check(plainWedge.read !== null && plainWedge.after === plainWedge.before && (await ringWedgesLeft()) === 0 && !/Only a ring/.test(plainWedge.said),
      `a wedge on a ring bond where no ring atom is a stereocentre: the chair all the same, the wedge gone, the same molecule ("${plainWedge.said}")`);
    // tramadol, C1's R/S as a wedge on a ring bond: the one that draws it so
    const tramadol = 'CN(C)C[C@@H]1CCCC[C@]1(O)c1cccc(OC)c1';
    let wedgedRight = false;
    const tramadolChair = await flatToChair(tramadol, async () => {
      const want = await drawnSmiles();
      const c1 = await state(() => [...olomol.doc.atoms.values()].find((a) => a.el === 'C' && [...olomol.doc.bonds.values()].some((b) => (b.a === a.id || b.b === a.id) && olomol.doc.atoms.get(b.a === a.id ? b.b : b.a).el === 'O' && !olomol.doc.atoms.get(b.a === a.id ? b.b : b.a).alias) && [...olomol.doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length === 4).id);
      await state((c1) => olomol.change((doc) => { for (const b of doc.bonds.values()) if (b.a === c1 || b.b === c1) b.stereo = ''; }), c1);
      for (const [id, a, b] of await ringBondWedged()) {
        if (a !== c1 && b !== c1) continue;
        for (const stereo of ['wedge', 'hash']) {
          if (wedgedRight) break;
          await state(([id, c1, stereo]) => olomol.change((doc) => {
            const bond = doc.bonds.get(id);
            const other = bond.a === c1 ? bond.b : bond.a;
            Object.assign(bond, { a: c1, b: other, stereo });
          }), [id, c1, stereo]);
          if ((await drawnSmiles()) === want) wedgedRight = true;
          else await state((id) => olomol.change((doc) => { doc.bonds.get(id).stereo = ''; }), id);
        }
      }
    });
    check(wedgedRight && tramadolChair.read !== null && tramadolChair.after === tramadolChair.before && tramadolChair.after === canonical(tramadol) && (await ringWedgesLeft()) === 0 && !/Only a ring/.test(tramadolChair.said),
      `tramadol with C1's R/S as a wedge on a ring bond: a chair, the same molecule, no wedge on the ring (${wedgedRight}, "${tramadolChair.said}")`);

    // the chair comes once worked out: if the drawing changes before it does (the ring deleted, or moved), it
    // isn't put in (before: an error halfway through a change with the ring deleted, the move undone with it moved)
    const race = async (meanwhile) => {
      await clear();
      await paste('CC1CCCCC1');
      return page.evaluate(async (meanwhile) => {
        const { ringFlipTool } = await import('/src/editor/tools/turning.js');
        olomol.clearSelection();
        olomol.setTool({ name: 'ringFlip' });
        const ring = olomol.scene.rings.find((r) => r.length === 6);
        const atom = olomol.doc.atoms.get(ring[0]);
        const start = [atom.x, atom.y];
        const steps = olomol.undoStack.length;
        let thrown = null;
        const failed = (event) => { thrown = String(event.reason); };
        window.addEventListener('unhandledrejection', failed);
        ringFlipTool.click(olomol, { start, hit: olomol.hitAt(start), shift: false });
        // (at once, before the chair is worked out)
        if (meanwhile === 'delete') olomol.change((doc) => { for (const id of ring) doc.atoms.delete(id); for (const [id, b] of doc.bonds) if (ring.includes(b.a) || ring.includes(b.b)) doc.bonds.delete(id); });
        else { olomol.selectAll(); olomol.moveSelection(3, 0); }
        const after = JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.x, a.y]));
        await new Promise((resolve) => setTimeout(resolve, 1500));
        window.removeEventListener('unhandledrejection', failed);
        return { kept: JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.x, a.y])) === after, steps: olomol.undoStack.length - steps, thrown };
      }, meanwhile);
    };
    const deleted = await race('delete');
    const moved = await race('move');
    check(deleted.kept && !deleted.thrown && deleted.steps === 1 && moved.kept && !moved.thrown && moved.steps === 1,
      `a flat ring's chair not put in once the drawing has changed: the ring deleted meanwhile (kept ${deleted.kept}, ${deleted.steps} undo step, error ${deleted.thrown}), moved (kept ${moved.kept}, ${moved.steps} undo step, error ${moved.thrown})`);
  }
}
