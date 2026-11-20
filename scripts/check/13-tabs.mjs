// The browser check: Tabs: several drawings open (src/ui/tabs.js), each with its own drawing, undo, view, name and
// file; all of them kept in the browser and back when olomol opens again.
// Run alone: npm run check -- --only tabs [url]
// (its parts, in the order run:)
//   one drawing: no tabs shown; New drawing: a second tab, at 100 %, the first kept as it was
//   each tab its own: drawing, undo and redo, view, unsaved changes, file (saved into, the other's left alone)
//   the page loaded again: every tab back, in order, the one in front in front, each drawing, view, file as it was
//   closing: with unsaved changes asked (Cancel, Close without saving: gone for good), saved ones at once, the
//   last one leaves a new empty drawing
//   Open and a link: into the untouched drawing in front, else a tab of their own
//   Ctrl+Tab, Ctrl+Shift+Tab; no switching while a text is open
//   + and New drawing: a tab at the end, also beside an empty one
//   Duplicate drawing (a tab's right-click menu, the empty canvas's): a copy right after it, the first left alone
//   Show: the drawings alone, → ← through them, each fitted to the screen, nothing drawn, Esc back as before
//   the one drawing 0.4 kept: the first tab, the old keys gone
//   a second window: not the drawings open in the first (said), a new one; closed, its drawing comes back in the next
import { readFileSync } from 'node:fs';
import { check, closeTabByX, context, page, paste, state, unlock, url } from './harness.mjs';
import { answer, fileText, freshFiles, ket, writeOutside } from './files.mjs';

const tabs = () => state(() => window.olomolTest.tabs());
const front = async () => (await tabs()).findIndex((tab) => tab.front);
const smiles = () => state(() => window.olomolTest.molfile());
const shownTabs = () => page.getByTestId('tabs').count();
const show = async (index) => {
  await page.getByTestId(`tab-${index}`).click();
  await page.waitForFunction((i) => window.olomolTest.tabs()[i]?.front && !olomol.switching, index, { timeout: 5000 }).catch(() => {});
};
// a change to the drawing in front, one undo step: its first atom moved a little
const change = () => state(() => {
  const atom = [...olomol.doc.atoms.values()][0];
  olomol.change(() => {
    atom.x += 0.25;
  });
});
const kept = () => page.waitForTimeout(800); // (kept in the browser 600 ms after a change)
async function reload(target = page) {
  await target.reload();
  await unlock(target);
  await target.waitForFunction(() => window.olomol && window.olomolTest && olomol.tabs.length && !olomol.switching, null, { timeout: 30_000 });
  await target.waitForTimeout(600);
}

export default async function run() {
  await freshFiles();

  // --- one drawing, then a second ---
  check((await tabs()).length === 1 && (await shownTabs()) === 0, 'one drawing: no tabs shown');
  await paste('CCO');
  await state(() => {
    olomol.title = 'ethanol';
    olomol.emit();
    olomol.zoomAt(2, 600, 400);
  });
  const ethanol = { smiles: await smiles(), ket: await ket(), scale: await state(() => olomol.view.scale) };
  await page.locator('.topbar').getByTitle('New drawing', { exact: true }).click();
  await page.waitForFunction(() => olomol.tabs.length === 2, null, { timeout: 3000 }).catch(() => {});
  check((await tabs()).length === 2 && (await shownTabs()) === 1 && (await front()) === 1, `New drawing: a second tab, in front (${JSON.stringify(await tabs())}; shown: ${await page.locator('.tabs .name').allTextContents()}; question: ${await page.getByTestId('question').textContent().catch(() => 'none')})`);
  check((await state(() => olomol.doc.atoms.size)) === 0 && (await state(() => olomol.view.scale)) === 42 && (await state(() => olomol.undoStack.length)) === 0,
    'the new one empty, at 100 %, nothing to undo');
  await paste('c1ccccc1');
  await state(() => {
    olomol.title = 'benzene';
    olomol.emit();
  });
  const benzene = { smiles: await smiles(), ket: await ket(), scale: await state(() => olomol.view.scale) };

  // --- each its own ---
  await show(0);
  check((await smiles()) === ethanol.smiles && (await ket()) === ethanol.ket && (await state(() => olomol.title)) === 'ethanol', 'the first tab: ethanol, exactly as it was');
  check((await state(() => olomol.view.scale)) === ethanol.scale, `its own view (scale ${await state(() => olomol.view.scale)})`);
  await state(() => olomol.undo());
  check((await state(() => olomol.doc.atoms.size)) === 0, 'undo in the first tab undoes its own last step (the paste)');
  await state(() => olomol.redo());
  check((await ket()) === ethanol.ket, 'redo brings it back');
  await show(1);
  check((await smiles()) === benzene.smiles && (await ket()) === benzene.ket && (await state(() => olomol.view.scale)) === benzene.scale && benzene.scale !== ethanol.scale,
    `the second tab: benzene as it was, at its own view (${await state(() => olomol.view.scale)}, ethanol's ${ethanol.scale})`);
  await state(() => olomol.undo());
  check((await state(() => olomol.doc.atoms.size)) === 0 && (await state(() => olomol.redoStack.length)) === 1, 'its undo is its own: the benzene gone, to redo');
  await state(() => olomol.redo());
  const dots = await page.locator('.tab .tab-dot').count();
  check(dots === 2, `unsaved changes on each tab: two dots (${dots})`);

  // --- each its own file ---
  await answer('save', 'benzene.olom');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(300);
  await show(0);
  await answer('save', 'ethanol.olom');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(300);
  check((await fileText('ethanol.olom')) === (await ket()) && (await fileText('benzene.olom')) === benzene.ket, 'each saved into its own file: ethanol.olom, benzene.olom');
  check((await page.locator('.tab .tab-dot').count()) === 0, 'no dots: both saved');
  await change();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(300);
  check((await fileText('ethanol.olom')) === (await ket()) && (await fileText('benzene.olom')) === benzene.ket, 'changed and saved in the first tab: ethanol.olom written, benzene.olom left alone');
  await show(1);
  check((await state(() => window.olomolTest.file()?.name)) === 'benzene.olom' && !(await state(() => window.olomolTest.unsaved())), 'the second tab still has benzene.olom as its file, nothing unsaved');
  await change();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(300);
  check((await fileText('benzene.olom')) === (await ket()), 'Ctrl+S in the second tab writes benzene.olom without asking');
  await change(); // (left unsaved, to see it come back so)
  await kept();

  // --- the page loaded again ---
  const before = await tabs();
  const benzeneNow = await ket();
  await show(0);
  const ethanolNow = await ket();
  await kept();
  await reload();
  const after = await tabs();
  check(JSON.stringify(after.map((tab) => [tab.title, tab.unsaved])) === JSON.stringify(before.map((tab) => [tab.title, tab.unsaved])) && after[0].front,
    `loaded again: both tabs back, in order, with their unsaved changes, the first in front (${JSON.stringify(after)})`);
  check((await ket()) === ethanolNow && (await state(() => olomol.view.scale)) === ethanol.scale && (await state(() => window.olomolTest.file()?.name)) === 'ethanol.olom',
    'the first: its drawing exactly, its view, its file');
  await show(1);
  check((await ket()) === benzeneNow && (await state(() => window.olomolTest.file()?.name)) === 'benzene.olom' && (await state(() => window.olomolTest.unsaved())),
    'the second: its drawing exactly, its file, its unsaved change');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(300);
  check((await fileText('benzene.olom')) === (await ket()), 'and Ctrl+S writes benzene.olom again, without asking');

  // --- closing ---
  await state(() => window.olomolTest.paste('CC(=O)O'));
  await closeTabByX(1);
  await page.getByTestId('question').waitFor({ timeout: 3000 }).catch(() => {});
  check((await page.getByTestId('question').count()) === 1, 'closing a tab with unsaved changes asks first');
  await page.getByTestId('question-cancel').click();
  check((await tabs()).length === 2, 'Cancel: still two tabs');
  await closeTabByX(1);
  await page.getByTestId('question-drop').click();
  await page.waitForFunction(() => olomol.tabs.length === 1, null, { timeout: 3000 }).catch(() => {});
  check((await tabs()).length === 1 && (await state(() => olomol.title)) === 'ethanol' && (await shownTabs()) === 0, 'Close without saving: one tab left, ethanol in front, no tabs shown');
  check((await fileText('benzene.olom')) !== null, 'its file stays where it is (only the drawing in the browser goes)');
  await kept();
  await reload();
  check((await tabs()).length === 1 && (await state(() => olomol.title)) === 'ethanol', 'loaded again: the closed one does not come back');
  // a saved one closes at once
  await page.locator('.topbar').getByTitle('New drawing', { exact: true }).click();
  await paste('N');
  await answer('save', 'ammonia.olom');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(300);
  await closeTabByX(1);
  await page.waitForFunction(() => olomol.tabs.length === 1 && !olomol.switching, null, { timeout: 3000 }).catch(() => {});
  check((await page.getByTestId('question').count()) === 0 && (await tabs()).length === 1, 'a saved one closes without asking');
  // the last one closed: a new empty drawing
  await page.locator('.topbar').getByTitle('New drawing', { exact: true }).click();
  await page.waitForFunction(() => olomol.tabs.length === 2, null, { timeout: 3000 }).catch(() => {});
  check((await tabs()).length === 2, 'New drawing beside ethanol: a second tab');
  await closeTabByX(1); // (empty, untouched: nothing to ask)
  await page.waitForTimeout(200);
  await state(() => window.olomolTest.save()); // (ethanol saved, so it closes without asking)
  await page.waitForTimeout(300);
  await state(() => {
    const id = olomol.drawingId;
    return import('/src/ui/tabs.js').then(({ closeTab }) => closeTab(olomol, id, { save: async () => {} }));
  });
  check((await tabs()).length === 1 && (await state(() => olomol.doc.atoms.size)) === 0 && (await state(() => olomol.file)) === null,
    'the last tab closed: a new empty drawing, no file');

  // --- Open and a link: into the untouched drawing in front, else a tab of their own ---
  const fixture = readFileSync(new URL('../../tests/fixtures/ketcher-version.ket', import.meta.url), 'utf8');
  await writeOutside('mechanism.ket', fixture);
  await writeOutside('again.ket', fixture);
  await answer('open', 'mechanism.ket');
  await page.keyboard.press('Control+o');
  await page.waitForFunction(() => olomol.title === 'mechanism', null, { timeout: 10_000 }).catch(() => {});
  check((await tabs()).length === 1 && (await state(() => olomol.doc.curves.size)) === 2, 'Ctrl+O with the drawing in front untouched: opened in it, no second tab');
  check((await state(() => olomol.undoStack.length)) === 0, 'and nothing to undo (the way back is closing the tab)');
  await answer('open', 'again.ket');
  await page.keyboard.press('Control+o');
  await page.waitForFunction(() => olomol.title === 'again', null, { timeout: 10_000 }).catch(() => {});
  check((await tabs()).length === 2 && (await front()) === 1 && (await state(() => window.olomolTest.file()?.name)) === 'again.ket', 'Ctrl+O with a drawing in front: a tab of its own, after it, with its file');
  const link = await state(() => window.olomolTest.link());
  await kept();
  await page.goto('about:blank'); // (the link from elsewhere: a new load, not a change of the # alone)
  await page.goto(link.replace(/^[^#]*/, `${url.href.split('#')[0]}`));
  await unlock(page);
  await page.waitForFunction(() => window.olomol && olomol.tabs.length === 3 && !location.hash, null, { timeout: 30_000 }).catch(() => {});
  check((await tabs()).length === 3 && (await tabs())[2].front, `a link opened: a tab of its own, beside the kept ones (${(await tabs()).length} tabs)`);

  // --- dragged: in another order, kept so ---
  const order = (await tabs()).map((tab) => tab.title);
  const first = await page.getByTestId('tab-0').boundingBox();
  const last = await page.getByTestId('tab-2').boundingBox();
  await page.mouse.move(first.x + 20, first.y + first.height / 2);
  await page.mouse.down();
  for (let x = first.x + 20; x <= last.x + last.width - 5; x += 15) await page.mouse.move(x, first.y + first.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const dragged = (await tabs()).map((tab) => tab.title);
  check(JSON.stringify(dragged) === JSON.stringify([order[1], order[2], order[0]]), `the first tab dragged past the others: last (${dragged.join(', ')})`);
  await kept();
  await reload();
  check(JSON.stringify((await tabs()).map((tab) => tab.title)) === JSON.stringify(dragged), 'loaded again: in that order');
  await page.getByTestId('tab-0').click();
  await page.waitForTimeout(200);
  check((await front()) === 0 && JSON.stringify((await tabs()).map((tab) => tab.title)) === JSON.stringify(dragged), 'a click (no drag) still shows a tab, and moves none');
  await page.getByTestId('tab-2').click();
  await page.waitForTimeout(200);

  // --- Ctrl+Tab; no switching while a text is typed ---
  await page.keyboard.press('Control+Tab');
  await page.waitForTimeout(200);
  const wrapped = await front();
  await page.keyboard.press('Control+Shift+Tab');
  await page.waitForTimeout(200);
  check(wrapped === 0 && (await front()) === 2, `Ctrl+Tab goes round to the first, Ctrl+Shift+Tab back (${wrapped}, ${await front()})`);
  await state(() => {
    olomol.editing = { id: null, x: 0, y: 0, value: '', auto: 'left' };
    olomol.emit();
  });
  const switched = await state(() => import('/src/ui/tabs.js').then(({ showTab }) => showTab(olomol, olomol.tabs[0].id)));
  check(!switched && (await front()) === 2, 'while a text is open, no other tab is shown (a click on one first finishes the text, as anywhere)');
  await state(() => {
    olomol.editing = null;
    olomol.emit();
  });

  // --- Show: the drawings alone, stepped through by keys, each fitted, nothing drawn; Esc: as before ---
  await show(0);
  const firstView = await state(() => ({ ...olomol.view }));
  const atomsOf = () => state(() => olomol.tabs.map((tab) => (tab.id === olomol.drawingId ? olomol.doc.atoms.size : tab.own?.doc?.atoms.size ?? null)));
  await page.getByTestId('show').click();
  await page.waitForFunction(() => document.body.classList.contains('showing'), null, { timeout: 3000 }).catch(() => {});
  const hidden = await state(() => ['.topbar', '.rail', '.dock', '.tabs'].every((sel) => !document.querySelector(sel) || getComputedStyle(document.querySelector(sel)).display === 'none'));
  check(hidden && (await page.getByTestId('show-bar').isVisible()), 'Show: the bars and the tabs gone, its small bar there');
  const scales = [await state(() => olomol.view.scale)];
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  scales.push(await state(() => olomol.view.scale));
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const reached = await front();
  check(reached === 2 && (await page.getByTestId('show-bar').textContent()).includes('3 / 3'), `→ and Page Down: the next drawings, stopping at the last (${reached})`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  check((await front()) === 1, `← the one before (each drawing fitted to the screen: ${scales.join(', ')})`);
  const drawnBefore = await atomsOf();
  await page.mouse.click(700, 450);
  await page.keyboard.press('Delete');
  await page.keyboard.press('c');
  await page.mouse.click(700, 450, { button: 'right' });
  check(JSON.stringify(await atomsOf()) === JSON.stringify(drawnBefore) && (await page.locator('.context-menu').count()) === 0, 'nothing drawn or deleted while showing, no right-click menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await show(0);
  check(!(await state(() => document.body.classList.contains('showing'))) && (await page.locator('.topbar').isVisible()) && JSON.stringify(await state(() => ({ ...olomol.view }))) === JSON.stringify(firstView),
    'Esc: back, the bars there, each drawing seen as before');

  // --- + (and New drawing): a tab at the end, whichever is in front, also beside an empty one ---
  await show(0);
  const count = (await tabs()).length;
  await page.getByTestId('tab-new').click();
  await page.waitForFunction((n) => olomol.tabs.length === n + 1 && !olomol.switching, count, { timeout: 3000 }).catch(() => {});
  check((await tabs()).length === count + 1 && (await front()) === count, `+ from the first tab: a new drawing at the end, in front (${(await front())} of ${(await tabs()).length})`);
  await page.getByTestId('tab-new').click();
  await page.waitForFunction((n) => olomol.tabs.length === n + 2 && !olomol.switching, count, { timeout: 3000 }).catch(() => {});
  check((await tabs()).length === count + 2, '+ again, the drawing in front empty: still a new tab (it did nothing)');
  for (let k = 0; k < 2; k++) {
    await closeTabByX(count); // (empty, untouched: closed at once)
    await page.waitForTimeout(200);
  }

  // --- the name on the tab: a new drawing's "New drawing" (its file still suggested by date and time), the top
  // bar's name field gone while tabs show, a double click on the tab in front renames it ---
  const fresh = (await tabs()).length; // (counted before: the new tab may not be there yet when the click returns)
  await page.getByTestId('tab-new').click();
  await page.waitForFunction((n) => olomol.tabs.length === n + 1 && !olomol.switching, fresh, { timeout: 3000 }).catch(() => {});
  check((await page.getByTestId(`tab-${fresh}`).locator('.name').textContent()) === 'New drawing' && /^drawing-\d{4}-/.test(await state(() => olomol.title))
    && (await page.locator('.title-field').count()) === 0, `a new drawing: "New drawing" on its tab, its name for the file the date and time, no name field in the top bar (${await page.getByTestId(`tab-${fresh}`).locator('.name').textContent().catch(() => 'no tab')}, ${await state(() => olomol.title)}; shown: ${await page.locator('.tabs .name').allTextContents()})`);
  await page.getByTestId(`tab-${fresh}`).dblclick();
  await page.getByTestId('tab-rename').fill('Exercise 1');
  await page.getByTestId('tab-rename').press('Enter');
  check((await state(() => olomol.title)) === 'Exercise 1' && (await page.getByTestId(`tab-${fresh}`).locator('.name').textContent()) === 'Exercise 1',
    `a double click on its tab, a name typed, Enter: renamed (${await state(() => olomol.title)})`);
  await closeTabByX(fresh); // (empty: closed at once)
  await page.waitForTimeout(200);

  // --- closing another tab than the one in front: the one in front stays in front (not the closed one's neighbour) ---
  const before2 = (await tabs()).length;
  await page.getByTestId('tab-new').click();
  await page.waitForFunction((n) => olomol.tabs.length === n + 1 && !olomol.switching, before2, { timeout: 3000 }).catch(() => {});
  await page.getByTestId('tab-new').click();
  await page.waitForFunction((n) => olomol.tabs.length === n + 2 && !olomol.switching, before2, { timeout: 3000 }).catch(() => {});
  await show(0);
  const firstId = await state(() => olomol.drawingId);
  // (the first of the two new ones: empty, so it closes without asking)
  await state((i) => import('/src/ui/tabs.js').then(({ closeTab }) => closeTab(olomol, olomol.tabs[i].id, { save: async () => {} })), before2);
  await page.waitForTimeout(300);
  check((await state(() => olomol.drawingId)) === firstId && (await tabs()).length === before2 + 1, 'closing a tab not in front: the one in front stays in front');
  await closeTabByX(before2); // (the other new one, empty)
  await page.waitForTimeout(200);

  // --- Duplicate drawing (a tab's right-click menu): a copy right after it, in front: the same drawing, style and
  // view, "(copy)" in its name, no file, nothing to undo, kept; changed, the first stays as it was ---
  await show(0);
  await state(() => olomol.setDrawingStyle('rsc'));
  const original = { smiles: await smiles(), title: await state(() => olomol.title), view: await state(() => JSON.stringify(olomol.view)), style: await state(() => JSON.stringify(olomol.drawingStyle())) };
  const before3 = (await tabs()).length;
  await page.getByTestId('tab-0').click({ button: 'right' });
  await page.getByTestId('tab-menu-duplicate').click();
  await page.waitForFunction((n) => olomol.tabs.length === n + 1 && !olomol.switching, before3, { timeout: 3000 }).catch(() => {});
  const copy = { smiles: await smiles(), title: await state(() => olomol.title), view: await state(() => JSON.stringify(olomol.view)), style: await state(() => JSON.stringify(olomol.drawingStyle())) };
  check((await tabs()).length === before3 + 1 && (await front()) === 1 && copy.title === `${original.title} (copy)`,
    `Duplicate drawing: a copy right after it, in front, "(copy)" in its name (${copy.title}, tab ${await front()} of ${(await tabs()).length})`);
  check(copy.smiles === original.smiles && copy.view === original.view && copy.style === original.style,
    `the same drawing, view and style (${copy.style})`);
  check((await state(() => olomol.undoStack.length)) === 0 && (await state(() => olomol.file)) === null && (await state(() => olomol.unsaved)) === true
    && (await state(() => olomol.keeping)) === 'kept', 'no file, nothing to undo, unsaved, kept in the browser at once');
  await change();
  await show(0);
  check((await smiles()) === original.smiles && (await state(() => olomol.undoStack.length)) > 0, 'the copy changed: the first as it was, its undo its own');
  await state(() => olomol.undo()); // (the style back as it was)
  await page.getByTestId('tab-1').click({ button: 'right' });
  await page.getByTestId('tab-menu-close').click();
  await page.getByTestId('question-drop').click();
  await page.waitForFunction((n) => olomol.tabs.length === n && !olomol.switching, before3, { timeout: 3000 }).catch(() => {});
  check((await tabs()).length === before3, 'Close from the menu: the copy gone (asked first: unsaved)');
  // from the empty canvas's right-click menu too (with one drawing there are no tabs to right-click)
  await state(() => olomol.zoomAt(0.5, 600, 400)); // (the drawing small in the middle: the corner empty)
  await page.mouse.click(160, 520, { button: 'right' });
  await page.getByTestId('context-duplicate-drawing').click();
  await page.waitForFunction((n) => olomol.tabs.length === n + 1 && !olomol.switching, before3, { timeout: 3000 }).catch(() => {});
  check((await tabs()).length === before3 + 1 && (await front()) === 1 && (await smiles()) === original.smiles, 'Duplicate drawing from the empty canvas\'s right-click menu');
  await closeTabByX(1);
  await page.getByTestId('question-drop').click();
  await page.waitForFunction((n) => olomol.tabs.length === n && !olomol.switching, before3, { timeout: 3000 }).catch(() => {});

  // --- the one drawing 0.4 kept ---
  const old = await state(() => window.olomolTest.ket());
  await state(async ([old]) => {
    // (nothing left to keep as the page goes: it would be written back into the storage wiped here)
    clearTimeout(olomol.keepTimer);
    olomol.keeping = 'kept';
    localStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('olomol');
      request.onsuccess = request.onerror = request.onblocked = resolve;
    });
    localStorage.setItem('olomol-autosave', old);
    localStorage.setItem('olomol-autosave-id', 'from-0.4');
  }, [old]);
  await page.goto(url.href);
  await unlock(page);
  await page.waitForFunction(() => window.olomol && olomol.doc.atoms.size > 0, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(400);
  check((await tabs()).length === 1 && (await state(() => olomol.drawingId)) === 'from-0.4' && (await state(() => olomol.doc.curves.size)) === 2,
    'the drawing 0.4 kept comes back as the first tab, with its id');
  check((await state(() => ['olomol-autosave', 'olomol-autosave-id'].map((key) => localStorage.getItem(key)).join())) === ',', 'the old keys gone');

  // --- a second window: the drawings open in the first stay there (one window each: neither writes over the other's) ---
  await kept();
  const other = await context.newPage();
  await other.goto(url.href);
  await unlock(other);
  await other.waitForFunction(() => window.olomol && window.olomolTest, null, { timeout: 30_000 }).catch(() => {});
  await other.waitForTimeout(600);
  const second = await other.evaluate(() => ({ id: olomol.drawingId, atoms: olomol.doc.atoms.size, notice: document.querySelector('.notice')?.textContent ?? '' }));
  check(second.id !== 'from-0.4' && second.atoms === 0 && /another olomol window/.test(second.notice),
    `a second window: not the drawing open in the first, a new one, and says why (${JSON.stringify(second)})`);
  await other.evaluate(() => window.olomolTest.paste('SSSS'));
  await other.waitForFunction(() => olomol.keeping === 'kept', null, { timeout: 5000 }).catch(() => {});
  const ownId = await other.evaluate(() => olomol.drawingId);
  await other.close();
  // (the second window closed: its drawing free again; the first's still held by the first)
  const third = await context.newPage();
  await third.goto(url.href);
  await unlock(third);
  await third.waitForFunction(() => window.olomol && window.olomolTest, null, { timeout: 30_000 }).catch(() => {});
  await third.waitForTimeout(600);
  const ids = await third.evaluate(() => olomol.tabs.map((tab) => tab.id));
  check(ids.includes(ownId) && !ids.includes('from-0.4'), `a window opened after the second closed: the second's drawing back, not the one the first has open (${ids.join(', ')})`);
  await third.close();

  // --- a drawing kept by a newer olomol (format 2.0), not read here: left where it is, not shown ---
  await state(async () => {
    const { put, STORES } = await import('/src/io/store.js');
    await put(STORES.drawings, 'newer', { id: 'newer', title: 'newer', ket: '{"format": "olom", "version": "2.0"}', view: null, unsaved: true, keptAt: Date.now() });
  });
  await reload();
  const newer = await state(async () => {
    const { get, STORES } = await import('/src/io/store.js');
    return { kept: Boolean(await get(STORES.drawings, 'newer')), shown: olomol.tabs.some((tab) => tab.id === 'newer'), front: olomol.drawingId };
  });
  check(newer.kept && !newer.shown && newer.front !== 'newer', `a drawing kept by a newer olomol: left where it is, not shown (${JSON.stringify(newer)})`);
  await state(async () => (await import('/src/io/store.js')).forget('newer'));
}
