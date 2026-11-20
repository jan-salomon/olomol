// The browser check: Saving: a drawing and its own file (src/io/saving.js). The browser's file dialogs are
// replaced by ones that answer as told and hand out real files of the browser's own file system (OPFS), so
// every file olomol writes is read back here and compared byte for byte with what it should hold.
// Run alone: npm run check -- --only saving [url]
// (its parts, in the order run:)
//   a new drawing: unsaved; Ctrl+S asks where, writes exactly what Save holds; then saved
//   changed: Ctrl+S writes the same file without asking; undo, redo: unsaved, saved again (by content)
//   renamed in the title field: a new file, the old one left as it was; Ctrl+Shift+S: Save as
//   cancelled in the dialog: nothing written, nothing said
//   the file changed by another program: asks; Cancel leaves it, Write over writes; gone: Save as
//   a write that fails: said, the file as it was, still unsaved
//   a KET file opened (Ketcher's, or olomol's before 0.5.0): Save asks where, as .olom, the KET left as it was;
//   then saved into; undo across the opening: the drawing before with its own file
//   another program's file (CDXML) opened: Save asks where, as .olom, and the CDXML stays as it was
//   the page loaded again: the drawing's file kept, saved into without asking
//   a browser without file dialogs (Firefox, Safari): the name asked once, then downloaded again without asking
//   an empty drawing: nothing to save
import { readFileSync } from 'node:fs';
import { browser, check, clear, context, inFirefox, log, login, notice, page, paste, state, unlock, url } from './harness.mjs';
import { answer, asked, dot, file, fileText, freshFiles, ket, PICKERS, removeFile, title, unsaved, writeOutside } from './files.mjs';

// Ctrl+S (or Ctrl+Shift+S) and the save finished: no question or name asked, nothing pending
async function save(keys = 'Control+s') {
  await page.keyboard.press(keys);
  await page.waitForFunction(() => !olomol.question && !olomol.nameRequest, null, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(150);
}
// a change to the drawing, one undo step: its first atom moved a little
const change = () => state(() => {
  const atom = [...olomol.doc.atoms.values()][0];
  olomol.change(() => {
    atom.x += 0.25;
  });
});

export default async function run() {
  if (inFirefox) {
    log('  (Firefox: the file dialogs of Chrome and Edge are not there; only the downloads are checked)');
    return downloads();
  }
  await freshFiles();

  // --- a new drawing ---
  await clear();
  await save();
  check((await asked()).save.length === 0 && /Nothing to save/.test(await notice()), 'an empty drawing: nothing to save, no dialog');
  await paste('CCO');
  await state(() => {
    olomol.title = 'ethanol';
    olomol.emit();
  });
  check((await unsaved()) && (await dot()) === 1, 'a new drawing with something in it: unsaved, the dot on Save');
  check((await state(() => document.title)) === '• ethanol – olomol', `the browser tab: its name and • (${await state(() => document.title)})`);
  await save();
  let first = await fileText('ethanol.olom');
  check(JSON.stringify((await asked()).save) === '["ethanol.olom"]', `Ctrl+S on a new drawing asks where, ethanol.olom suggested (${JSON.stringify((await asked()).save)})`);
  check(first !== null && first === (await ket()), 'ethanol.olom holds exactly what Save writes');
  check(JSON.parse(first).format === 'olom' && JSON.parse(first).version === '1.0', 'ethanol.olom is olomol\'s own format, version 1.0');
  check(!(await unsaved()) && (await dot()) === 0, 'saved: no unsaved changes, no dot');
  check((await state(() => document.title)) === 'ethanol – olomol', `the browser tab without • (${await state(() => document.title)})`);
  check(JSON.stringify(await file()) === JSON.stringify({ name: 'ethanol.olom', format: 'olom', handle: true, modified: (await file()).modified, downloaded: false }), `its own file: ethanol.olom (${JSON.stringify(await file())})`);

  // --- changed: saved into the same file without asking ---
  await change();
  check(await unsaved(), 'changed: unsaved');
  await save();
  const second = await fileText('ethanol.olom');
  check((await asked()).save.length === 1, `Ctrl+S again: no dialog (${(await asked()).save.length} asked)`);
  check(second === (await ket()) && second !== first, 'ethanol.olom written again, exactly as Save holds it, with the change');
  check(!(await unsaved()), 'saved again');
  // (kept in the browser at once, not a moment later: a tab closed right after Ctrl+S comes back as saved, and
  // the next Ctrl+S can't write the drawing before over the file)
  await change();
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => !olomol.unsaved, null, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(150); // (the browser's store written: well before the 600 ms a change waits otherwise)
  const keptNow = await state(async () => {
    const { get, STORES } = await import('/src/io/store.js');
    const record = await get(STORES.drawings, olomol.drawingId);
    return { kept: record?.ket?.includes(`"x": ${+[...olomol.doc.atoms.values()][0].x.toFixed(4)},`), keptAt: Date.now() - (record?.keptAt ?? 0) };
  });
  check(keptNow.kept, `saved: kept in the browser at once, with the change (${JSON.stringify(keptNow)})`);
  // undo and redo, by content: the undone drawing is not what the file holds, the redone one is
  await state(() => olomol.undo());
  check(await unsaved(), 'undone after saving: unsaved (the file has the change)');
  await state(() => olomol.redo());
  check(!(await unsaved()), 'redone: as saved again');
  first = await fileText('ethanol.olom'); // (as written last)

  // --- renamed in the title field: a new file; Ctrl+Shift+S ---
  await page.locator('.title-field').fill('renamed');
  await page.locator('.title-field').press('Enter');
  check(await unsaved(), 'renamed: unsaved (the name is in the file)');
  await save();
  check(JSON.stringify((await asked()).save.slice(1)) === '["renamed.olom"]', `Ctrl+S after renaming asks where, renamed.olom suggested (${JSON.stringify((await asked()).save)})`);
  check((await fileText('renamed.olom')) === (await ket()) && (await fileText('ethanol.olom')) === first, 'renamed.olom written; ethanol.olom left as it was, byte for byte');
  await answer('save', 'copy.olom');
  await save('Control+Shift+s');
  check(JSON.stringify((await asked()).save.slice(2)) === '["renamed.olom"]', 'Ctrl+Shift+S asks where, even with a file of its own');
  check((await title()) === 'copy' && (await fileText('copy.olom')) === (await ket()), `saved as copy.olom: the drawing is named copy and the file holds it with that name (${await title()})`);
  check(JSON.parse(await fileText('copy.olom')).title === 'copy', 'the name inside copy.olom is copy (the name chosen, not the one before)');
  const renamed = await fileText('renamed.olom');
  await change();
  await save();
  check((await asked()).save.length === 3 && (await fileText('copy.olom')) === (await ket()) && (await fileText('renamed.olom')) === renamed,
    'then Ctrl+S writes copy.olom, renamed.olom left as it was');

  // --- cancelled ---
  const copy = await fileText('copy.olom');
  await change();
  await answer('save', null);
  await state(() => olomol.clearNotice());
  await save('Control+Shift+s');
  check((await title()) === 'copy' && (await fileText('copy.olom')) === copy && (await unsaved()), 'Save as cancelled: nothing written, the name as it was, still unsaved');
  check((await page.locator('.notice').count()) === 0, `nothing said about a cancel (${await notice()})`);

  // --- changed by another program ---
  await page.waitForTimeout(30); // (a later lastModified)
  await writeOutside('copy.olom', 'written by another program');
  await page.keyboard.press('Control+s');
  await page.getByTestId('question').waitFor({ timeout: 3000 }).catch(() => {});
  check((await page.getByTestId('question').count()) === 1 && /copy\.olom/.test(await page.getByTestId('question').textContent()), 'the file changed since: asks before writing over it');
  await page.getByTestId('question-cancel').click();
  check((await fileText('copy.olom')) === 'written by another program' && (await unsaved()), 'Cancel: the other program\'s file as it was, the drawing still unsaved');
  await page.keyboard.press('Control+s');
  await page.getByTestId('question-over').click();
  await page.waitForTimeout(200);
  check((await fileText('copy.olom')) === (await ket()) && !(await unsaved()), 'Write over it: copy.olom holds the drawing');
  await change();
  await save();
  check(!(await page.getByTestId('question').count()) && (await fileText('copy.olom')) === (await ket()), 'after that, saved into without asking (olomol knows the file as it wrote it)');
  // gone
  await removeFile('copy.olom');
  await change();
  await answer('save', 'again.olom');
  await page.keyboard.press('Control+s');
  await page.getByTestId('question').waitFor({ timeout: 3000 }).catch(() => {});
  check((await page.getByTestId('question-over').count()) === 0 && (await page.getByTestId('question-as').count()) === 1, 'the file gone: asks, Save as offered, no writing over');
  await page.getByTestId('question-as').click();
  await page.waitForTimeout(300);
  check((await fileText('again.olom')) === (await ket()) && (await title()) === 'again' && (await fileText('copy.olom')) === null, 'Save as: again.olom written, copy.olom not made again');

  // --- a write that fails ---
  const again = await fileText('again.olom');
  await change();
  await state(() => {
    const proto = Object.getPrototypeOf(window.olomol.file.handle);
    const real = proto.createWritable;
    proto.createWritable = async function failing(...args) {
      proto.createWritable = real;
      const writable = await real.apply(this, args);
      return { write: async () => { throw new Error('the disk is full'); }, close: () => writable.close(), abort: () => writable.abort() };
    };
  });
  await save();
  check((await fileText('again.olom')) === again && (await unsaved()) && /disk is full/.test(await notice()), `a failed write: said (${await notice()}), again.olom as it was, still unsaved`);
  await save();
  check((await fileText('again.olom')) === (await ket()) && !(await unsaved()), 'saved on the next try');

  // --- a KET file opened: a tab of its own; Save asks where, as .olom; then saved into; the drawing before keeps its own file ---
  const fixture = readFileSync(new URL('../../tests/fixtures/ketcher-version.ket', import.meta.url), 'utf8');
  await writeOutside('opened.ket', fixture);
  const beforeOpen = await ket();
  await answer('open', 'opened.ket');
  await page.keyboard.press('Control+o');
  await page.waitForFunction(() => olomol.title === 'opened', null, { timeout: 10_000 }).catch(() => {});
  check((await title()) === 'opened' && (await file())?.name === 'opened.ket' && (await file())?.handle && !(await unsaved()), `opened.ket opened: its name, its own file, nothing unsaved (${JSON.stringify(await file())})`);
  check((await state(() => olomol.doc.curves.size)) === 2 && (await state(() => olomol.tabs.length)) === 2, 'with its drawing (two curved arrows), in a tab of its own');
  await change();
  await answer('save', 'opened.olom');
  await save();
  check(JSON.stringify((await asked()).save.slice(-1)) === '["opened.olom"]' && (await fileText('opened.olom')) === (await ket()) && (await fileText('opened.ket')) === fixture,
    `changed, Ctrl+S: asks where, opened.olom suggested and written, the KET left as it was (${JSON.stringify((await asked()).save.slice(-1))})`);
  await change();
  await save();
  check((await asked()).save.length === 6 && (await fileText('opened.olom')) === (await ket()), 'Ctrl+S again: written into opened.olom without asking');
  const opened = await fileText('opened.olom');
  await page.getByTestId('tab-0').click();
  await page.waitForFunction(() => olomol.title === 'again', null, { timeout: 5000 }).catch(() => {});
  check((await title()) === 'again' && (await file())?.name === 'again.olom' && (await ket()) === beforeOpen && !(await unsaved()), `the drawing before, in its tab: as again.olom holds it, its own file (${await title()}, ${(await file())?.name})`);
  await change();
  await save();
  check((await fileText('again.olom')) === (await ket()) && (await fileText('opened.olom')) === opened, 'Ctrl+S there writes again.olom, never opened.olom');
  await state(() => olomol.undo());
  await state(() => olomol.undo());
  check((await title()) === 'again' && (await file())?.name === 'again.olom', 'its undo stays its own: still again, with again.olom');

  // --- another program's file ---
  const cdxml = readFileSync(new URL('../../tests/fixtures/chemdraw-labels.cdxml', import.meta.url), 'utf8');
  await writeOutside('chemdraw.cdxml', cdxml);
  await answer('open', 'chemdraw.cdxml');
  await page.keyboard.press('Control+o');
  await page.waitForFunction(() => olomol.title === 'chemdraw', null, { timeout: 20_000 }).catch(() => {});
  check((await file())?.format === 'cdxml' && !(await unsaved()), `a CDXML opened: its own file is another program's (${JSON.stringify(await file())})`);
  await change();
  await answer('save', null);
  await save();
  check(JSON.stringify((await asked()).save.slice(-1)) === '["chemdraw.olom"]', `Ctrl+S on it asks where, as .olom: chemdraw.olom suggested (${JSON.stringify((await asked()).save.slice(-1))})`);
  check((await fileText('chemdraw.cdxml')) === cdxml, 'the CDXML is never written over');

  // --- the page loaded again: the drawing's own file kept ---
  await answer('save', 'kept.olom');
  await save();
  const kept = await fileText('kept.olom');
  check(kept === (await ket()), 'saved as kept.olom');
  await page.waitForTimeout(800); // (autosaved)
  await page.reload();
  await unlock(page);
  await page.waitForFunction(() => window.olomol && olomol.title === 'kept', null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(500);
  check((await file())?.name === 'kept.olom' && (await file())?.handle && !(await unsaved()), `the page loaded again: the drawing back with its own file kept.olom, nothing unsaved (${JSON.stringify(await file())}, ${await unsaved()})`);
  const askedBefore = (await asked()).save.length;
  await change();
  await save();
  check((await asked()).save.length === askedBefore && (await fileText('kept.olom')) === (await ket()), 'then Ctrl+S writes kept.olom without asking');

  // --- pictures exported through the save dialog: written and read back byte for byte (a PNG is no text) ---
  await clear();
  await paste('CCO');
  const sizes = {};
  for (const [ext, white] of [['png', false], ['png', true], ['svg', false]]) {
    const name = `picture${white ? '-white' : ''}.${ext}`;
    await answer('save', name);
    await page.getByTitle(/^Export:/).click();
    const box = page.locator('.menu label.item', { hasText: 'White background' }).locator('input');
    if ((await box.isChecked()) !== white) await box.click();
    await page.locator('.menu .item', { hasText: ext.toUpperCase() }).first().click();
    await page.waitForFunction((name) => olomol.notice?.text.includes(name) || olomol.notice?.kind === 'error', name, { timeout: 10_000 }).catch(() => {});
    const said = await notice();
    const head = await state(async (name) => {
      const bytes = new Uint8Array(await (await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile()).arrayBuffer());
      return { start: [...bytes.subarray(0, 4)], size: bytes.length, drawing: new TextDecoder('latin1').decode(bytes).includes(name.endsWith('png') ? 'olomol-ket' : 'olomol.org/ket') };
    }, name);
    sizes[name] = head.size;
    check(new RegExp(`Exported ${name}`).test(said) && head.size > 500 && head.drawing && (ext === 'svg' ? head.start[0] === 0x3c : head.start[1] === 0x50),
      `Export ${ext.toUpperCase()}${white ? ' with a white background' : ''} through the save dialog: written, read back the same, the drawing in it (${said}; ${JSON.stringify(head)})`);
  }
  check(sizes['picture-white.png'] !== sizes['picture.png'], `the white background in the PNG (${JSON.stringify(sizes)})`);
  await page.getByTitle(/^Export:/).click();
  const white = page.locator('.menu label.item', { hasText: 'White background' }).locator('input');
  if (await white.isChecked()) await white.click();
  await page.keyboard.press('Escape');

  await downloads();
}

// A browser without file dialogs: the name asked once, then the file downloaded again under it without asking
async function downloads() {
  // (a browser of its own: one sharing this one's storage would bring the drawing above back, with its file)
  const own = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true, ...login });
  const plain = await own.newPage();
  await plain.addInitScript(() => {
    delete window.showSaveFilePicker;
    delete window.showOpenFilePicker;
    window.showSaveFilePicker = undefined;
  });
  await plain.goto(url.href);
  await unlock(plain);
  await plain.waitForFunction(() => window.olomol && window.olomolTest, null, { timeout: 30_000 });
  await plain.evaluate(() => olomol.setDoc({ atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), nextId: 1 }));
  await plain.evaluate(() => window.olomolTest.paste('c1ccccc1'));
  await plain.waitForFunction(() => olomol.doc.atoms.size === 6, null, { timeout: 30_000 });
  const firstDownload = plain.waitForEvent('download');
  await plain.keyboard.press('Control+s');
  await plain.getByTestId('file-name').fill('benzene');
  await plain.keyboard.press('Enter');
  const one = await firstDownload;
  const oneText = readFileSync(await one.path(), 'utf8');
  check(one.suggestedFilename() === 'benzene.olom' && oneText === (await plain.evaluate(() => window.olomolTest.ket())), `without file dialogs: the name asked, benzene.olom downloaded, exactly what Save writes (${one.suggestedFilename()})`);
  check(!(await plain.evaluate(() => window.olomolTest.unsaved())), 'and then nothing unsaved');
  await plain.getByTestId('file-name').waitFor({ state: 'detached' });
  await plain.evaluate(() => {
    const atom = [...olomol.doc.atoms.values()][0];
    olomol.change(() => {
      atom.charge = 1;
    });
  });
  const secondDownload = plain.waitForEvent('download');
  await plain.keyboard.press('Control+s');
  const two = await secondDownload;
  const twoText = readFileSync(await two.path(), 'utf8');
  check((await plain.getByTestId('file-name').count()) === 0, 'Ctrl+S again: no name asked');
  check(two.suggestedFilename() === 'benzene.olom' && twoText === (await plain.evaluate(() => window.olomolTest.ket())) && twoText !== oneText, `downloaded again as benzene.olom, with the change (${two.suggestedFilename()})`);
  check(/downloaded again/.test(await plain.locator('.notice').textContent({ timeout: 3000 }).catch(() => '')), 'and says it went into Downloads');
  await own.close();
}
