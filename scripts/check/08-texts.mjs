// The browser check: Texts and brackets: typing, formulas, anchors on molecules and arrows, brackets.
// Run alone: npm run check -- --only texts [url]

import {
  atomXY, check, clear, clickAt, dragBetween, inFirefox, page, paste, screen, state,
} from './harness.mjs';
// (its parts, in the order run:)
//   brackets made round a molecule fit it as it changes: an atom drawn on, one deleted
//   texts on a molecule's anchors
//   texts and molecules on reaction arrows
//   brackets
//   text: typed as it is; the Formula button formats the selected part
//   a filled ring: a click selects the ring, a double click the molecule, a drag moves it
//   names typed with the text tool under molecules are theirs: a grid keeps each under its molecule
export default async function run() {
  // --- Fit with a note of several paragraphs under a molecule: the drawing seen, not zoomed out to a speck
  // (a note's lines were counted as one line of all of them: 19 %, J's drawing) ---
  await clear();
  await paste('CCO');
  const fitted = await state(() => {
    const para = 'A paragraph of a note under a scheme, about a hundred characters wide, as one writes it there.';
    olomol.change((doc) => {
      const id = doc.nextId++;
      doc.texts.set(id, { id, x: 0, y: 3, text: [para, para, para, para, para].join('\n'), color: null });
    });
    olomol.fit(window.innerWidth, window.innerHeight);
    const box = olomol.scene.texts.get([...olomol.doc.texts.keys()][0]).box;
    return { scale: olomol.view.scale, width: (box.x2 - box.x1) * olomol.view.scale, window: window.innerWidth };
  });
  check(fitted.width > 0.5 * fitted.window && fitted.width <= fitted.window, `Fit with a note of five paragraphs: it fills the window (${Math.round(fitted.width)} of ${fitted.window} px, scale ${fitted.scale.toFixed(1)})`);

  // --- a text on a reaction arrow double-clicked: its letters in the field stand on the drawn text, a short
  // centred one too (Δ stood off to the right in the wider field, J), and only the field glows, not the text ---
  {
    await clear();
    const placed = await state(() => {
      let text = null;
      olomol.change((doc) => {
        const arrow = doc.nextId++;
        doc.arrows.set(arrow, { id: arrow, x1: 0, y1: 0, x2: 3, y2: 0, kind: 'forward', color: null });
        text = doc.nextId++;
        doc.texts.set(text, { id: text, x: 7, y: 5, text: 'Δ', color: null, arrow, slot: 'above', order: 0 });
      });
      olomol.fit(window.innerWidth, window.innerHeight);
      const { box } = olomol.scene.texts.get(text);
      const { scale, tx, ty } = olomol.view;
      return { id: text, x: ((box.x1 + box.x2) / 2) * scale + tx, y: ((box.y1 + box.y2) / 2) * scale + ty };
    });
    const canvas = await page.locator('.canvas').boundingBox();
    await page.mouse.dblclick(canvas.x + placed.x, canvas.y + placed.y);
    await page.getByTestId('text-editor').waitFor({ timeout: 5000 }).catch(() => {});
    const letters = await page.evaluate(() => {
      const field = document.querySelector('[data-testid=text-editor]');
      if (!field) return null;
      const range = document.createRange();
      range.selectNodeContents(field);
      const r = range.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const glow = await state((id) => olomol.selection.has(id) && document.querySelectorAll('.halos .halo').length, placed.id);
    await page.keyboard.press('Escape');
    const [dx, dy] = letters ? [letters.x - (canvas.x + placed.x), letters.y - (canvas.y + placed.y)] : [NaN, NaN];
    check(letters && Math.abs(dx) < 4 && Math.abs(dy) < 10 && !glow,
      `a text on an arrow double-clicked: its letters in the field on the drawn text (off by ${Math.round(dx)}, ${Math.round(dy)} px), no glow on the drawing (${glow})`);
  }

  // --- a text written in next to the selection's panel: its tools clear of the panel, inside the window (they ran
  // under it, J) ---
  {
    await clear();
    const id = await state(() => {
      let text = null;
      const panelLeft = window.innerWidth - 300;
      const { scale, tx, ty } = olomol.view;
      olomol.change((doc) => {
        text = doc.nextId++;
        doc.texts.set(text, { id: text, x: (panelLeft - 80 - tx) / scale, y: (230 - ty) / scale, text: 'near the panel', color: null });
      });
      olomol.select([text]);
      return text;
    });
    const where = await state((id) => {
      const { box } = olomol.scene.texts.get(id);
      const { scale, tx, ty } = olomol.view;
      return [((box.x1 + box.x2) / 2) * scale + tx, ((box.y1 + box.y2) / 2) * scale + ty];
    }, id);
    const canvas = await page.locator('.canvas').boundingBox();
    await page.mouse.dblclick(canvas.x + where[0], canvas.y + where[1]);
    await page.getByTestId('text-editor').waitFor({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(100);
    const rects = await page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const [tools, panel] = [r('.text-tools'), r('.inspector')];
      return tools && panel && { tools: [tools.left, tools.top, tools.right, tools.bottom], panel: [panel.left, panel.top, panel.right, panel.bottom], width: window.innerWidth };
    });
    await page.keyboard.press('Escape');
    const apart = rects && (rects.tools[2] <= rects.panel[0] || rects.tools[0] >= rects.panel[2] || rects.tools[3] <= rects.panel[1] || rects.tools[1] >= rects.panel[3]);
    check(apart && rects.tools[0] >= 0 && rects.tools[2] <= rects.width,
      `the text tools next to the selection's panel: clear of it, in the window (${JSON.stringify(rects && { tools: rects.tools.map(Math.round), panel: rects.panel.map(Math.round) })})`);
  }

  // --- brackets made round a molecule fit it as it changes: an atom drawn on, one deleted ---
  await clear();
  await paste('CCO');
  await state(() => olomol.selectAll());
  await page.locator('.inspector').getByRole('button', { name: 'Brackets' }).click();
  const bracketWidth = () => state(() => { const b = [...olomol.doc.brackets.values()][0]; return b ? Math.abs(b.x2 - b.x1) : null; });
  const bracketHeight = () => state(() => { const b = [...olomol.doc.brackets.values()][0]; return Math.abs(b.y2 - b.y1); });
  const [w0, h0] = [await bracketWidth(), await bracketHeight()];
  await state(() => { olomol.clearSelection(); olomol.setTool({ name: 'bond', order: 1, stereo: '' }); });
  const oxygenAt = await state(() => { const o = [...olomol.doc.atoms.values()].find((a) => a.el === 'O'); return [o.x, o.y]; });
  await clickAt(oxygenAt); // a bond to a new atom on the O
  const grown = [await bracketWidth(), await bracketHeight()];
  await state(() => olomol.setTool({ name: 'select' }));
  const newest = await state(() => Math.max(...olomol.doc.atoms.keys()));
  await state((id) => { olomol.select([id]); olomol.deleteSelection(); }, newest);
  const shrunk = [await bracketWidth(), await bracketHeight()];
  check((grown[0] > w0 + 0.3 || grown[1] > h0 + 0.3) && Math.abs(shrunk[0] - w0) < 1e-6 && Math.abs(shrunk[1] - h0) < 1e-6,
    `brackets round a molecule: larger with an atom drawn on (${w0.toFixed(2)}×${h0.toFixed(2)} → ${grown.map((v) => v.toFixed(2)).join('×')}), as before when it is deleted`);
  await state(() => olomol.setTool({ name: 'select' }));

  // --- the rail's bracket button and K with a selection (J: resonance forms and their arrow selected, the
  // button only took the tool): brackets round the selection, as the panel's Brackets ---
  for (const how of ['button', 'K']) {
    await clear();
    await state(async () => {
      const { readMolfile } = await import('/src/io/molfile.js');
      const { smilesToMolfile } = await import('/src/io/rdkit.js');
      const { addArrow, copyObjects, emptyDoc } = await import('/src/model/doc.js');
      const doc = emptyDoc();
      const place = async (smiles, x) => {
        const part = readMolfile(await smilesToMolfile(smiles)).doc;
        const xs = [...part.atoms.values()].map((a) => a.x);
        copyObjects(part, [...part.atoms.keys()], x - (Math.min(...xs) + Math.max(...xs)) / 2, 0, doc);
      };
      await place('CC(C)=[OH+]', 0);
      addArrow(doc, 2.5, 0, 5.5, 0, 'resonance');
      await place('C[C+](C)O', 8);
      olomol.setDoc(doc);
      olomol.fit(window.innerWidth, window.innerHeight);
      olomol.selectAll();
    });
    if (how === 'button') await page.locator('.rail button[title^="Brackets"]').click();
    else {
      await page.mouse.move(5, 300);
      await page.keyboard.press('k');
    }
    const made = await state(() => {
      const brackets = [...olomol.doc.brackets.values()];
      const b = brackets[0];
      const arrow = [...olomol.doc.arrows.values()][0];
      const xs = [...olomol.doc.atoms.values()].map((a) => a.x);
      return { count: brackets.length, around: !!b && Math.min(b.x1, b.x2) < Math.min(...xs) && Math.max(b.x1, b.x2) > Math.max(...xs)
        && Math.min(b.x1, b.x2) < arrow.x1 && Math.max(b.x1, b.x2) > arrow.x2, selected: !!b && olomol.selected('brackets').includes(b.id) };
    });
    check(made.count === 1 && made.around && made.selected,
      `the rail's bracket ${how} with resonance forms and their arrow selected: one bracket round them all, selected (${JSON.stringify(made)})`);
  }
  await state(() => olomol.setTool({ name: 'select' }));

  // --- texts on a molecule's anchors ---
  await clear();
  await paste('CCO');
  await state(() => olomol.change((doc) => {
    const id = doc.nextId++;
    doc.texts.set(id, { id, x: 8, y: 6, text: '1', color: null, bold: true });
  }));
  await state(() => olomol.fit(window.innerWidth, window.innerHeight));
  await state(() => { olomol.clearSelection(); olomol.setTool({ name: 'select' }); });
  // drag the text by its middle to just under the molecule: the anchors show, it lands on the one below
  const [textMiddle, underMolecule] = await state(() => {
    const box = olomol.scene.texts.get([...olomol.doc.texts.keys()][0]).box;
    const atoms = [...olomol.doc.atoms.values()];
    return [[(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2],
      [atoms.reduce((s, a) => s + a.x, 0) / atoms.length, Math.max(...atoms.map((a) => a.y)) + 0.9]];
  });
  {
    const [x1, y1] = await screen(textMiddle);
    const [x2, y2] = await screen(underMolecule);
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
    await page.mouse.move(x2, y2, { steps: 6 });
    const chosen = await page.locator('.canvas rect.slot-bar').count();
    const shown = (await page.locator('.canvas rect.slot').count()) + chosen; // (the chosen one dark, over its frame)
    await page.mouse.up();
    await page.waitForTimeout(80);
    const landed = await state(() => { const t = [...olomol.doc.texts.values()][0]; return { anchor: t.anchor, slot: t.slot ?? 'below' }; });
    check(shown === 4 && chosen === 1 && landed.anchor != null && landed.slot === 'below', `a text dragged under a molecule: its four anchors show, it lands on the one below (${shown}, ${chosen}, ${JSON.stringify(landed)})`);
  }
  const anchoredX = await state(() => [...olomol.doc.texts.values()][0].x);
  await state(() => { olomol.select([...olomol.doc.atoms.keys()]); olomol.moveSelection(1, 0); });
  check(Math.abs((await state(() => [...olomol.doc.texts.values()][0].x)) - anchoredX - 1) < 1e-6, 'a text on an anchor moves with its molecule');
  // the panel puts it on the left anchor, then frees it
  await state(() => olomol.select([...olomol.doc.texts.keys()]));
  await page.locator('.inspector').getByRole('button', { name: '←' }).click();
  const onLeft = await state(() => {
    const t = [...olomol.doc.texts.values()][0];
    const box = olomol.scene.texts.get(t.id).box;
    const minX = Math.min(...[...olomol.doc.atoms.values()].map((a) => a.x));
    return { slot: t.slot, leftOf: box.x2 < minX };
  });
  await page.locator('.inspector').getByRole('button', { name: 'free' }).click();
  const freed = await state(() => [...olomol.doc.texts.values()][0].anchor);
  check(onLeft.slot === 'left' && onLeft.leftOf && freed === undefined, `panel: ← puts the text left of its molecule (${JSON.stringify(onLeft)}), free takes it off (${freed})`);

  // a text on a reaction arrow: the panel's In front − puts the molecules' − in front of it (− AlCl₃)
  await clear();
  await state(() => olomol.change((doc) => {
    const arrow = doc.nextId++;
    doc.arrows.set(arrow, { id: arrow, x1: 0, y1: 0, x2: 4, y2: 0, kind: 'forward', color: null });
    const id = doc.nextId++;
    doc.texts.set(id, { id, x: 0, y: 0, text: 'AlCl_{3}', color: null, arrow, slot: 'above' });
  }));
  await state(() => olomol.select([...olomol.doc.texts.keys()]));
  await page.locator('.inspector').getByRole('button', { name: '−', exact: true }).click();
  await page.waitForTimeout(80);
  const signed = await state(() => {
    const t = [...olomol.doc.texts.values()][0];
    const drawn = document.querySelector(`.canvas g[data-id="${t.id}"]`);
    return { sign: t.arrowSign, drawn: [...(drawn?.querySelectorAll('text') ?? [])].some((e) => e.textContent === '−') };
  });
  check(signed.sign === '−' && signed.drawn, `panel: In front − on a text on an arrow puts a − in front of it, drawn with it (${JSON.stringify(signed)})`);

  // a text dragged into the gap between a molecule and the number under it: there, the number one further down
  await clear();
  await paste('CCO');
  await state(() => olomol.change((doc) => {
    const atom = Math.min(...doc.atoms.keys());
    const ys = [...doc.atoms.values()].map((a) => a.y);
    let id = doc.nextId++;
    doc.texts.set(id, { id, x: 0, y: 0, text: '1', color: null, bold: true, anchor: atom, order: 0 });
    id = doc.nextId++;
    doc.texts.set(id, { id, x: Math.max(...[...doc.atoms.values()].map((a) => a.x)) + 3, y: Math.max(...ys) + 3, text: '85 %', color: null });
  }));
  await state(() => { olomol.fit(window.innerWidth, window.innerHeight); olomol.clearSelection(); olomol.setTool({ name: 'select' }); });
  {
    const [from, to] = await state(() => {
      const texts = [...olomol.doc.texts.values()];
      const [one, other] = [texts.find((t) => t.text === '1'), texts.find((t) => t.text !== '1')];
      const box = olomol.scene.texts.get(other.id).box;
      const oneBox = olomol.scene.texts.get(one.id).box;
      const lowest = Math.max(...[...olomol.doc.atoms.values()].map((a) => a.y));
      return [[(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2], [(oneBox.x1 + oneBox.x2) / 2, (lowest + oneBox.y1) / 2 + 0.1]];
    });
    await dragBetween(from, to);
  }
  const reordered = await state(() => {
    const texts = [...olomol.doc.texts.values()];
    const box = (t) => olomol.scene.texts.get(t.id).box;
    const [one, other] = [texts.find((t) => t.text === '1'), texts.find((t) => t.text !== '1')];
    return { anchored: other.anchor != null, first: box(other).y1 < box(one).y1, orders: [other.order, one.order] };
  });
  check(reordered.anchored && reordered.first && reordered.orders.join() === '0,1', `a text dragged between a molecule and the number under it: there, the number further down (${JSON.stringify(reordered)})`);

  // --- texts and molecules on reaction arrows ---
  await clear();
  await paste('CCO');
  const arrowId = await state(() => {
    let id = null;
    olomol.change((doc) => {
      const xs = [...doc.atoms.values()].map((a) => a.x);
      const y = Math.max(...[...doc.atoms.values()].map((a) => a.y)) + 4;
      id = doc.nextId++;
      doc.arrows.set(id, { id, x1: Math.min(...xs), y1: y, x2: Math.min(...xs) + 3, y2: y, kind: 'forward', color: null });
      const t = doc.nextId++;
      doc.texts.set(t, { id: t, x: Math.min(...xs) + 5, y: y + 2, text: 'reflux', color: null });
    });
    olomol.fit(window.innerWidth, window.innerHeight);
    olomol.clearSelection();
    olomol.setTool({ name: 'select' });
    return id;
  });
  // the text dragged by its middle to just under the arrow's middle
  {
    const [from, to] = await state((id) => {
      const a = olomol.doc.arrows.get(id);
      const box = olomol.scene.texts.get([...olomol.doc.texts.keys()][0]).box;
      return [[(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2], [(a.x1 + a.x2) / 2, a.y1 + 0.6]];
    }, arrowId);
    await dragBetween(from, to);
  }
  const textOn = await state(() => { const t = [...olomol.doc.texts.values()][0]; return { arrow: t.arrow, slot: t.slot }; });
  // the whole molecule dragged by an atom to over the arrow
  await state(() => olomol.select([...olomol.doc.atoms.keys()]));
  {
    const [from, to] = await state((id) => {
      const a = olomol.doc.arrows.get(id);
      const [box] = window.olomolTest.itemBoxes();
      const atom = [...olomol.doc.atoms.values()][1];
      const target = [(a.x1 + a.x2) / 2, a.y1 - 0.45 - (box.maxY - box.minY) / 2];
      return [[atom.x, atom.y], [atom.x + target[0] - (box.minX + box.maxX) / 2, atom.y + target[1] - (box.minY + box.maxY) / 2]];
    }, arrowId);
    await dragBetween(from, to);
  }
  const moleculeOn = await state(() => [...new Set([...olomol.doc.atoms.values()].map((a) => `${a.arrow}|${a.arrowSlot}`))]);
  check(textOn.arrow === arrowId && textOn.slot === 'below' && moleculeOn.length === 1 && moleculeOn[0] === `${arrowId}|above`,
    `a text dragged under an arrow and a molecule over it: on the arrow (${JSON.stringify(textOn)}, ${moleculeOn})`);
  // the arrow moved: both go with it; a double click on it selects all three
  const where = () => state(() => [[...olomol.doc.texts.values()][0].x, [...olomol.doc.atoms.values()][0].x]);
  const beforeMove = await where();
  await state((id) => { olomol.select([id]); olomol.moveSelection(2, 0); }, arrowId);
  const afterMove = await where();
  await state(() => olomol.clearSelection());
  {
    const [x, y] = await screen(await state((id) => { const a = olomol.doc.arrows.get(id); return [(a.x1 + a.x2) / 2 + 0.3, a.y1]; }, arrowId));
    await page.mouse.dblclick(x, y);
  }
  const withArrow = await state(() => olomol.selection.size);
  check(afterMove.every((v, k) => Math.abs(v - beforeMove[k] - 2) < 1e-6) && withArrow === 1 + 1 + 3 + 2,
    `the arrow moved: its text and molecule go along (${beforeMove.map((v) => v.toFixed(2))} → ${afterMove.map((v) => v.toFixed(2))}); a double click selects them with it (${withArrow})`);

  // a text dragged in between the arrow and the molecule on it: it goes there, the molecule one further out
  await state((id) => olomol.change((doc) => {
    const a = doc.arrows.get(id);
    const t = doc.nextId++;
    doc.texts.set(t, { id: t, x: a.x2 + 3, y: a.y1 - 3, text: 'cat.', color: null });
  }), arrowId);
  await state(() => olomol.clearSelection());
  {
    const [from, to] = await state((id) => {
      const a = olomol.doc.arrows.get(id);
      const text = [...olomol.doc.texts.values()].find((t) => t.text === 'cat.');
      const box = olomol.scene.texts.get(text.id).box;
      return [[(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2], [(a.x1 + a.x2) / 2, a.y1 - 0.55]];
    }, arrowId);
    await dragBetween(from, to);
  }
  const between = await state((id) => {
    const a = olomol.doc.arrows.get(id);
    const text = [...olomol.doc.texts.values()].find((t) => t.text === 'cat.');
    const box = olomol.scene.texts.get(text.id).box;
    const lowestAtom = Math.max(...[...olomol.doc.atoms.values()].map((atom) => atom.y));
    return { order: text.order, molecule: [...olomol.doc.atoms.values()][0].arrowOrder, under: box.y2 < a.y1 && box.y1 > lowestAtom };
  }, arrowId);
  check(between.order === 0 && between.molecule === 1 && between.under, `a text dragged between an arrow and the molecule on it: next to the arrow, the molecule further out (${JSON.stringify(between)})`);

  // an element chosen, a click on the empty canvas: the atom on its own (O: water)
  await clear();
  await state(() => olomol.setTool({ name: 'bond', order: 1, stereo: '', el: 'O' }));
  await page.mouse.click(640, 420);
  const lone = await state(() => ({ atoms: [...olomol.doc.atoms.values()].map((a) => a.el).join(), bonds: olomol.doc.bonds.size }));
  check(lone.atoms === 'O' && lone.bonds === 0, `O chosen, a click on the empty canvas: water, one O on its own (${JSON.stringify(lone)})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // --- brackets ---
  await clear();
  await paste('CCCC');
  await state(() => {
    const atoms = [...olomol.doc.atoms.values()].sort((p, q) => p.x - q.x);
    olomol.select([atoms[1].id, atoms[2].id]);
  });
  await page.locator('.inspector').getByRole('button', { name: 'Brackets' }).click();
  const unit = await state(() => {
    const [b] = [...olomol.doc.brackets.values()];
    const atoms = [...olomol.doc.atoms.values()].sort((p, q) => p.x - q.x);
    return { sub: b.sub, crosses: b.x1 > atoms[0].x && b.x1 < atoms[1].x && b.x2 > atoms[2].x && b.x2 < atoms[3].x };
  });
  check(unit.sub === 'n' && unit.crosses, `brackets round part of a chain: a repeating unit, n, crossing the bonds that leave it (${JSON.stringify(unit)})`);
  await state(() => olomol.setTool({ name: 'bracket' }));
  await clickAt(await atomXY((await state(() => [...olomol.doc.atoms.keys()]))[0]));
  await page.locator('.inspector').getByRole('button', { name: '‡' }).click();
  check((await state(() => [...olomol.doc.brackets.values()].map((b) => b.sup + b.sub).join(','))) === 'n,‡'
    && (await page.locator('.drawing').innerHTML()).includes('‡'), 'bracket tool: a click on a molecule, ‡ from the panel');
  await page.keyboard.press('Escape');
  await state(() => olomol.selectAll());
  await page.keyboard.press('Delete');
  check((await state(() => olomol.doc.brackets.size)) === 0, 'brackets are deleted with the selection');

  // --- markup typed as text stays text: _{b} and braces escaped in the drawing, shown as typed, the same back from
  // the file ---
  await clear();
  await state(() => olomol.setTool({ name: 'text' }));
  await page.mouse.click(600, 400);
  await page.getByTestId('text-editor').waitFor();
  await page.keyboard.type('a_{b} } C:\\temp');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const typed = await state(async () => {
    const { parseMarkup } = await import('/src/render/text.js');
    const { readOlom, writeOlom } = await import('/src/io/olom.js');
    const [text] = [...olomol.doc.texts.values()];
    const back = [...readOlom(writeOlom(olomol.doc, {})).doc.texts.values()][0];
    const chars = parseMarkup(text.text);
    return { markup: text.text, shown: chars.map((c) => c.ch).join(''), shifted: chars.some((c) => c.shift), back: back.text === text.text };
  });
  check(typed.shown === 'a_{b} } C:\\temp' && !typed.shifted && typed.back, `markup typed as text stays text (${JSON.stringify(typed)})`);

  // --- text: typed as it is; the Formula button formats the selected part ---
  await clear();
  await state(() => olomol.setTool({ name: 'text' }));
  await page.mouse.click(600, 400);
  await page.getByTestId('text-editor').waitFor();
  await page.keyboard.type('doi 10.1021/jacs.5b01234 and H2SO4');
  // select "H2SO4" (the last five characters) and press Formula
  await state(() => {
    const editor = document.querySelector('[data-testid="text-editor"]');
    const node = [...editor.childNodes].at(-1);
    const range = document.createRange();
    range.setStart(node, node.textContent.length - 5);
    range.setEnd(node, node.textContent.length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.getByTestId('text-chem').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' x');
  await page.keyboard.press('Enter');
  const written = await state(() => [...olomol.doc.texts.values()].map((t) => t.text).join());
  check(written === 'doi 10.1021/jacs.5b01234 and H_{2}SO_{4} x', `text: a DOI stays as typed, Formula formats the selected H2SO4, typing after it is plain again (${written})`);
  await state(() => olomol.setTool({ name: 'select' }));
  // a new line (Shift+Enter), then typing: one line more, not one per letter
  await clear();
  await state(() => olomol.setTool({ name: 'text' }));
  await page.mouse.click(600, 400);
  await page.getByTestId('text-editor').waitFor();
  await page.keyboard.type('ab');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('c');
  const twoLines = await page.getByTestId('text-editor').evaluate((e) => e.getBoundingClientRect().height);
  await page.keyboard.type('def');
  const stillTwo = await page.getByTestId('text-editor').evaluate((e) => e.getBoundingClientRect().height);
  await page.keyboard.press('Enter');
  const lines = await state(() => [...olomol.doc.texts.values()].map((t) => t.text).join());
  check(lines === 'ab\ncdef' && Math.abs(stillTwo - twoLines) < 1, `text: Shift+Enter, then letters: two lines (${JSON.stringify(lines)}), the box keeps its height (${twoLines} → ${stillTwo})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // the text window: Formula with nothing selected formats all of it (and leaves the caret), x₂ by
  // Ctrl+, for what is typed next, ° from the row of characters, the lines centred; the example gone while writing
  await clear();
  await state(() => olomol.setTool({ name: 'text' }));
  await page.mouse.click(600, 400);
  await page.getByTestId('text-editor').waitFor();
  const exampleWhileWriting = await page.getByTestId('empty-example').count();
  await page.keyboard.type('H2[SiF6]2-');
  await page.getByTestId('text-chem').click();
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('25 ');
  await page.getByTestId('text-characters').click();
  await page.getByTestId('text-char-°').click();
  await page.keyboard.type('C, H');
  await page.keyboard.press('Control+,');
  await page.keyboard.type('r');
  await page.keyboard.press('Control+,');
  await page.keyboard.type('x ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('CO32-');
  await page.keyboard.press('Control+b');
  await page.getByTestId('text-align').click();
  await page.getByTestId('text-align-center').click();
  // Formula on the selected CO32- (bold kept)
  await state(() => {
    const editor = document.querySelector('[data-testid="text-editor"]');
    let node = editor.lastChild;
    while (node.lastChild) node = node.lastChild;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, node.textContent.length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.getByTestId('text-chem').click();
  await page.keyboard.press('Enter');
  const windowed = await state(() => {
    const text = [...olomol.doc.texts.values()][0];
    const { lines } = olomol.scene.texts.get(text.id);
    const middles = lines.map((line) => line.runs[0].x + line.width / 2);
    return { text: text.text, align: text.align, centred: Math.abs(middles[1] - middles[0]) < 1e-6 && Math.abs(lines[1].width - lines[0].width) > 0.05 };
  });
  check(exampleWhileWriting === 0 && windowed.text === 'H_{2}[SiF_{6}]^{2−}\n25 °C, H_{r}x *{CO_{3}^{2−}}' && windowed.align === 'center' && windowed.centred,
    `text window: the example gone while writing (${exampleWhileWriting}), Formula on all of it and on a bold part, Ctrl+, and Ctrl+B for what is typed next, ° from the characters menu (${JSON.stringify(windowed.text)}), the lines centred from the alignment menu (${windowed.align}, ${windowed.centred})`);
  await state(() => olomol.setTool({ name: 'select' }));

  // copying a text: other programs get its words (a DOI to look up), olomol the text with its formatting
  if (!inFirefox) { // (Playwright can't give Firefox clipboard permissions)
    await clear();
    await state(() => olomol.change((doc) => {
      const id = doc.nextId++;
      doc.texts.set(id, { id, x: 0, y: 0, text: 'doi 10.1021/x, *{H_{2}SO_{4}}', color: null });
    }));
    await state(() => {
      olomol.setTool({ name: 'select' });
      olomol.selectAll();
    });
    await page.mouse.move(600, 400);
    await page.keyboard.press('Control+c');
    const copiedWords = await state(() => navigator.clipboard.readText());
    await page.keyboard.press('Control+v');
    await page.mouse.click(600, 520);
    await page.waitForTimeout(200);
    const pastedTexts = await state(() => [...olomol.doc.texts.values()].map((t) => t.text));
    check(copiedWords === 'doi 10.1021/x, H2SO4' && pastedTexts.length === 2 && pastedTexts.every((x) => x === 'doi 10.1021/x, *{H_{2}SO_{4}}'),
      `copying a text: other programs get its words (${JSON.stringify(copiedWords)}), pasted in olomol it keeps its formatting (${JSON.stringify(pastedTexts[1])})`);
    await page.keyboard.press('Escape');
  }

  // Esc in a text keeps what was written (as Enter); a new drawing starts at 100 %
  await clear();
  await state(() => olomol.setTool({ name: 'text' }));
  await page.mouse.click(600, 400);
  await page.getByTestId('text-editor').waitFor();
  await page.keyboard.type('kept');
  await page.keyboard.press('Escape');
  const keptByEsc = await state(() => [...olomol.doc.texts.values()].map((x) => x.text).join());
  await state(() => olomol.setTool({ name: 'select' }));
  await state(() => olomol.zoomAt(3, 600, 400));
  const tabsBefore = await state(() => olomol.tabs.length);
  await page.locator('.topbar').getByTitle('New drawing', { exact: true }).click();
  // (a new tab, once the drawing in front is kept in the browser: a moment)
  await page.waitForFunction((n) => olomol.tabs.length > n && !olomol.switching, tabsBefore, { timeout: 3000 }).catch(() => {});
  const newScale = await state(() => olomol.view.scale);
  check(keptByEsc === 'kept' && newScale === 42, `Esc in a text keeps it (${JSON.stringify(keptByEsc)}); a new drawing at 100 % (scale ${newScale})`);

  // --- a filled ring: a click selects the ring, a double click the molecule, a drag moves it ---
  await clear();
  await paste('c1ccccc1CC(=O)O');
  await state(() => {
    const ring = olomol.scene.rings.find((r) => r.length === 6);
    olomol.change((doc) => { const id = doc.nextId++; doc.fills.set(id, { id, atoms: [...ring], color: '#b9e8b0' }); });
    olomol.clearSelection();
    olomol.setTool({ name: 'select' });
  });
  const ringMiddle = await state(() => {
    const ring = olomol.scene.rings.find((r) => r.length === 6).map((id) => olomol.doc.atoms.get(id));
    return [ring.reduce((s, a) => s + a.x, 0) / 6, ring.reduce((s, a) => s + a.y, 0) / 6];
  });
  await clickAt(ringMiddle);
  const ringSelected = await state(() => olomol.selection.size);
  const [ringX, ringY] = await screen(ringMiddle);
  await page.mouse.dblclick(ringX, ringY);
  const moleculeSelected = await state(() => [olomol.selection.size, olomol.doc.atoms.size + olomol.doc.bonds.size]);
  const xBefore = await state(() => [...olomol.doc.atoms.values()][0].x);
  await page.mouse.move(ringX, ringY);
  await page.mouse.down();
  await page.mouse.move(ringX + 80, ringY, { steps: 6 });
  await page.mouse.up();
  const ringMoved = await state((b) => [...olomol.doc.atoms.values()][0].x - b, xBefore);
  check(ringSelected === 12 && moleculeSelected[0] === moleculeSelected[1] && ringMoved > 1, `filled ring: a click selects the ring (${ringSelected}), a double click the molecule (${moleculeSelected.join('/')}), a drag moves it (${ringMoved.toFixed(2)})`);

  // --- names typed with the text tool under molecules are theirs: a grid keeps each under its molecule
  // (they used to be free texts, cells of their own, and came out under the wrong molecules); a text typed
  // far away stays free, one typed over a reaction arrow goes on it ---
  {
    await clear();
    const names = [['NCCc1ccc(O)c(O)c1', 'dopamine'], ['CC(N)Cc1ccccc1', 'amphetamine'], ['CN1C=NC2=C1C(=O)N(C(=O)N2C)C', 'caffeine']];
    for (const [smiles] of names) {
      // (what is there moved out of the way first: each is pasted in the middle of the view)
      await state(() => { olomol.selectAll(); olomol.moveSelection(-15, 0); olomol.clearSelection(); });
      await paste(smiles);
      await state(() => olomol.clearSelection());
    }
    await state(() => olomol.fit(window.innerWidth, window.innerHeight));
    // under each molecule, from a little left of its middle, about a line lower than a dragged name would sit
    const spots = await state(() => olomol.scene.frags.map((members) => {
      const atoms = members.map((id) => olomol.doc.atoms.get(id));
      const xs = atoms.map((a) => a.x);
      return [(Math.min(...xs) + Math.max(...xs)) / 2 - 1, Math.max(...atoms.map((a) => a.y)) + 1.3, Math.min(...xs)];
    }).sort((p, q) => p[2] - q[2]));
    const typeAt = async (point, words) => {
      await state(() => olomol.setTool({ name: 'text' }));
      await clickAt(point);
      await page.getByTestId('text-editor').waitFor();
      await page.keyboard.type(words);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(80);
    };
    for (let k = 0; k < names.length; k++) await typeAt(spots[k], names[k][1]);
    await typeAt([spots[0][0], spots[0][1] + 5], 'a note');
    const anchored = await state(() => [...olomol.doc.texts.values()].map((t) => `${t.text}:${t.anchor != null ? t.slot : 'free'}`).join(', '));
    await state(() => { olomol.setTool({ name: 'select' }); olomol.selectAll(); });
    await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
    await page.locator('.menu input[type=number]').first().fill('2');
    await page.getByRole('button', { name: 'Arrange in a grid', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    // each name under its own molecule (told apart by their carbons and nitrogens)
    const placed = await state(() => {
      const atomsOf = { dopamine: [8, 1], amphetamine: [9, 1], caffeine: [8, 4] };
      return [...olomol.doc.texts.values()].filter((t) => atomsOf[t.text]).every((t) => {
        const members = (olomol.scene.frags.find((m) => m.includes(t.anchor)) ?? []).map((id) => olomol.doc.atoms.get(id));
        const count = (el) => members.filter((a) => a.el === el).length;
        const box = olomol.scene.texts.get(t.id)?.box;
        const xs = members.map((a) => a.x);
        const under = box && box.x1 < Math.max(...xs) && box.x2 > Math.min(...xs) && box.y1 > Math.max(...members.map((a) => a.y));
        return under && count('C') === atomsOf[t.text][0] && count('N') === atomsOf[t.text][1];
      });
    });
    // a reagent typed over an arrow rides on it through Align reaction scheme
    await clear();
    await paste('C=CC=C');
    await state(() => olomol.change((doc) => {
      const xs = [...doc.atoms.values()].map((a) => a.x);
      const y = [...doc.atoms.values()].reduce((s, a) => s + a.y, 0) / doc.atoms.size;
      const id = doc.nextId++;
      doc.arrows.set(id, { id, x1: Math.max(...xs) + 1, y1: y + 0.8, x2: Math.max(...xs) + 4, y2: y + 0.8, kind: 'forward', color: null });
    }));
    await state(() => { olomol.clearSelection(); olomol.fit(window.innerWidth, window.innerHeight); });
    const above = await state(() => { const a = [...olomol.doc.arrows.values()][0]; return [(a.x1 + a.x2) / 2 - 0.4, a.y1 - 0.5]; });
    await typeAt(above, 'Br2');
    const onArrow = await state(() => [...olomol.doc.texts.values()][0]?.arrow != null);
    await state(() => { olomol.setTool({ name: 'select' }); olomol.selectAll(); });
    await page.getByTitle('Align: line up, space evenly, grid, reaction scheme').click();
    await page.getByRole('button', { name: 'Align reaction scheme' }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const rides = await state(() => {
      const a = [...olomol.doc.arrows.values()][0];
      const box = olomol.scene.texts.get([...olomol.doc.texts.keys()][0]).box;
      return box.y2 < a.y1 && box.x1 > Math.min(a.x1, a.x2) - 0.5 && box.x2 < Math.max(a.x1, a.x2) + 0.5;
    });
    check(anchored === 'dopamine:below, amphetamine:below, caffeine:below, a note:free' && placed && onArrow && rides,
      `names typed under molecules go on their anchors (${anchored}), a grid keeps each under its own molecule (${placed}); a reagent typed over an arrow is on it (${onArrow}) and stays over it through Align reaction scheme (${rides})`);
  }
}
