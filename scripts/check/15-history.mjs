// The browser check: Recent files, earlier versions, PDF / Print (src/ui/history.js, actions.js).
// Run alone: npm run check -- --only history [url]
// (its parts, in the order run:)
//   recent files: none at first (no button); each file opened or saved once, newest first; opened again with the
//   file itself (saved into again), exactly as it was written; one open already: its tab; one gone: its copy
//   offered, or taken off the list
//   earlier versions: kept while drawing; the window lists them newest first, the latest as it is now; one brought
//   back exactly, Ctrl+Z goes back exactly; closing the drawing forgets them
//   PDF / Print: the page the print window gets: the drawing alone, its name as the title
import { check, closeTabByX, page, paste, state } from './harness.mjs';
import { answer, fileText, freshFiles, ket, removeFile } from './files.mjs';

const recent = () => state(() => (olomol.recent ?? []).map((entry) => entry.name));
const tabs = () => state(() => window.olomolTest.tabs());
const save = async () => {
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => !olomol.question && !olomol.nameRequest, null, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
};
const named = (title) => state((title) => {
  olomol.title = title;
  olomol.emit();
}, title);
const change = () => state(() => {
  const atom = [...olomol.doc.atoms.values()][0];
  olomol.change(() => {
    atom.x += 0.25;
  });
});
const kept = () => page.waitForTimeout(800);
// the drawing as kept in the browser (what a version holds)
const keptKet = () => state(() => import('/src/io/ket.js').then(({ writeKet }) => writeKet(olomol.doc, { settings: olomol.settings, pictures: false, title: olomol.title })));

// New drawing, and its tab there before going on (it comes a moment after the click: a paste at once went into the
// drawing before, and the rest of the check with it)
async function newDrawing() {
  const before = await state(() => olomol.tabs.length);
  await page.locator('.topbar').getByTitle('New drawing', { exact: true }).click();
  await page.waitForFunction((n) => olomol.tabs.length === n + 1 && !olomol.switching, before, { timeout: 5000 }).catch(() => {});
}

export default async function run() {
  await freshFiles();

  // --- recent files ---
  await answer('open', null);
  await page.getByTestId('open').click();
  await page.waitForTimeout(300);
  check((await state(() => window.olomolTestPickers.asked.open)) === 1 && (await page.locator('[data-testid^=recent-]').count()) === 0, 'no recent files yet: Open goes to the computer\'s files at once, no menu');
  await paste('CCO');
  await named('first');
  await answer('save', 'first.olom');
  await save();
  await page.getByTestId('open').click();
  const menu = await page.locator('.menu').textContent().catch(() => '');
  await page.keyboard.press('Escape');
  check(JSON.stringify(await recent()) === '["first.olom"]' && /first\.olom/.test(menu) && /this computer/.test(menu), `saved: first.olom among the recent files; Open's menu has it, then the computer's files (${menu})`);
  await newDrawing();
  await paste('c1ccccc1');
  await named('second');
  await answer('save', 'second.olom');
  await save();
  await page.getByTestId('tab-0').click();
  await page.waitForFunction(() => !olomol.switching && olomol.title === 'first', null, { timeout: 5000 }).catch(() => {}); // (the tab in front first)
  await change();
  await save(); // (first.olom again: to the top, once)
  check(JSON.stringify(await recent()) === '["first.olom","second.olom"]', `each once, the newest first (${JSON.stringify(await recent())})`);
  // two at once (files dropped together): neither lost
  const both = await state(() => import('/src/ui/history.js').then(async ({ rememberFile }) => {
    const before = olomol.recent;
    await Promise.all([rememberFile(olomol, { name: 'x.ket' }, '{}'), rememberFile(olomol, { name: 'y.ket' }, '{}')]);
    const names = olomol.recent.map((entry) => entry.name);
    const { put, STORES } = await import('/src/io/store.js');
    await put(STORES.recent, 'list', before); // (back as it was, for the rest)
    olomol.recent = before;
    return names;
  }));
  check(JSON.stringify(both) === '["y.ket","x.ket","first.olom","second.olom"]', `two remembered at once: both kept (${JSON.stringify(both)})`);
  const first = await fileText('first.olom');
  // closed, then opened again from the list: with the file itself, exactly as written
  await closeTabByX(0);
  await page.waitForFunction(() => olomol.tabs.length === 1, null, { timeout: 3000 }).catch(() => {});
  await page.getByTestId('open').click();
  await page.getByTestId('recent-0').click();
  await page.waitForFunction(() => olomol.title === 'first', null, { timeout: 10_000 }).catch(() => {});
  check((await tabs()).length === 2 && (await state(() => window.olomolTest.file()))?.handle === true && !(await state(() => window.olomolTest.unsaved())),
    'first.olom opened again from the list: a tab of its own, with the file itself, nothing unsaved');
  check((await ket()) === first, 'what it opened as is exactly what was written (.olom read and written again, byte for byte)');
  await change();
  const asked = await state(() => window.olomolTestPickers.asked.save.length);
  await save();
  check((await state(() => window.olomolTestPickers.asked.save.length)) === asked && (await fileText('first.olom')) === (await ket()), 'and saved into without asking');
  // one open already: its tab
  await page.getByTestId('tab-0').click(); // (second)
  await page.getByTestId('open').click();
  await page.getByTestId('recent-0').click();
  await page.waitForTimeout(400);
  check((await tabs()).length === 2 && (await state(() => olomol.title)) === 'first', 'a recent file open already: its tab comes forward, no second one');
  // another file of the same name (another folder: not the same file): asked
  await state(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('elsewhere', { create: true });
    const handle = await folder.getFileHandle('first.olom', { create: true });
    const writable = await handle.createWritable();
    await writable.write(await (await (await (await navigator.storage.getDirectory()).getFileHandle('first.olom')).getFile()).text());
    await writable.close();
    window.elsewhere = handle;
  });
  await page.getByTestId('tab-0').click();
  const opening = state(() => import('/src/ui/actions.js').then(({ openGiven }) => openGiven(olomol, [window.elsewhere], () => {})));
  await page.getByTestId('question').waitFor({ timeout: 5000 }).catch(() => {});
  check((await page.getByTestId('question-show').count()) === 1, 'another file of the same name: asked whether it is the one open (show its tab, or a tab of its own)');
  await page.getByTestId('question-show').click();
  await opening;
  check((await tabs()).length === 2 && (await state(() => olomol.title)) === 'first', 'Show its tab: the tab of first.olom in front, no second one');
  // one gone: its copy
  await removeFile('second.olom');
  await closeTabByX(0); // (second: saved, closes at once)
  await page.waitForTimeout(300);
  await page.getByTestId('open').click();
  await page.getByTestId('recent-1').click();
  await page.getByTestId('question').waitFor({ timeout: 5000 }).catch(() => {});
  check((await page.getByTestId('question-copy').count()) === 1, 'second.olom gone: asks, offering the copy olomol kept');
  await page.getByTestId('question-copy').click();
  await page.waitForFunction(() => olomol.title === 'second', null, { timeout: 10_000 }).catch(() => {});
  check((await state(() => olomol.doc.atoms.size)) === 6 && (await state(() => olomol.file)) === null, 'the copy opened: the benzene, as a drawing tied to no file');
  await page.getByTestId('open').click();
  await page.getByTestId('recent-1').click();
  await page.getByTestId('question-forget').click();
  await page.waitForTimeout(300);
  check(JSON.stringify(await recent()) === '["first.olom"]', `taken off the list (${JSON.stringify(await recent())})`);

  // --- earlier versions ---
  await state(() => import('/src/io/history.js').then(({ VERSIONS }) => {
    VERSIONS.gap = 300; // (minutes in use: a moment here)
  }));
  await newDrawing();
  await paste('CC(=O)O');
  await named('acid');
  await kept();
  const oldest = await keptKet();
  await page.waitForTimeout(400);
  await change();
  await kept();
  await page.waitForTimeout(400);
  await change();
  await kept();
  const now = await keptKet();
  await page.getByTestId('kept-mark').click();
  await page.getByTestId('versions').waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('[data-testid=versions] li'), null, { timeout: 5000 }).catch(() => {});
  const listed = await page.locator('[data-testid=versions] li').count();
  check(listed >= 3, `the kept mark opens the earlier versions: ${listed} listed`);
  check((await page.getByTestId('version-back-0').count()) === 0, 'the newest is the drawing as it is now: nothing to bring back (no button)');
  await page.getByTestId(`version-back-${listed - 1}`).click();
  await page.waitForTimeout(300);
  check((await keptKet()) === oldest, 'the oldest brought back: exactly the drawing it was');
  await state(() => olomol.undo());
  check((await keptKet()) === now, 'Ctrl+Z: exactly the drawing before');
  const id = await state(() => olomol.drawingId);
  await state(() => import('/src/ui/tabs.js').then(({ closeTab }) => {
    const promise = closeTab(olomol, olomol.drawingId, { save: async () => {} });
    setTimeout(() => document.querySelector('[data-testid=question-drop]')?.click(), 200);
    return promise;
  }));
  const left = await state((id) => import('/src/ui/history.js').then(({ versionsOf }) => versionsOf(id)), id);
  check(left.length === 0, `the drawing closed: its versions forgotten (${left.length} left)`);

  // --- PDF / Print ---
  await state(() => {
    window.olomolTestPrint = (html) => {
      window.printed = html;
    };
  });
  await page.getByTestId('export').click();
  await page.getByTestId('print').click();
  // (printed at ACS size: bonds 14.4 pt = 19.2 px, the screen style's pictures are 40 px a bond)
  await page.waitForFunction(() => window.printed, null, { timeout: 5000 }).catch(() => {});
  const printed = await state(() => import('/src/io/files.js').then(({ svgOf }) => ({ html: window.printed ?? '', title: olomol.title, svg: svgOf(olomol.doc, olomol.settings, { scale: 19.2 }) })));
  check(printed.html.includes(`<title>${printed.title}</title>`) && (printed.html.match(/<svg/g) ?? []).length === 1 && printed.html.includes(printed.svg),
    `PDF / Print: the page holds the drawing alone, at ACS size (19.2 px a bond), named ${printed.title} (the PDF's name)`);
}
