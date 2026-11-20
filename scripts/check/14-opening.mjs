// The browser check: Opening files: dropped on the window, and given to the installed app by the file manager
// (src/ui/actions.js openGiven, openFiles). Run alone: npm run check -- --only opening [url]
// (its parts, in the order run:)
//   files dragged over the window: a mark to drop them, gone when they leave
//   one file of molecules dropped: put into the drawing where it was dropped, no tab of its own
//   a drawing and another program's file dropped together: a tab each, named after them, their files their own
//   a file olomol doesn't open: said, nothing opened
//   a drawing dropped on an untouched drawing: opened in it
//   the file manager's file (the installed app, launchQueue): a tab of its own, saved into again without asking
//   the manifest offers the installed app for olomol's files
import { readKet } from '../../src/io/ket.js';
import { writeOlom } from '../../src/io/olom.js';
import { readFileSync } from 'node:fs';
import { check, notice, page, paste, state, url } from './harness.mjs';
import { asked, fileText, freshFiles, ket, writeOutside } from './files.mjs';

const ETHANOL = ['ethanol', '  olomol', '', '  3  2  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    2.5981    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0', '  2  3  1  0', 'M  END', ''].join('\n');
const KET = readFileSync(new URL('../../tests/fixtures/ketcher-version.ket', import.meta.url), 'utf8');
// (the same drawing as olomol's own file)
const OLOM = writeOlom(readKet(KET).doc);
const CDXML = readFileSync(new URL('../../tests/fixtures/chemdraw-labels.cdxml', import.meta.url), 'utf8');

// files dragged over the window and dropped at (x, y) on the screen, as the browser hands them to the page
const drag = (files, [x, y], kinds = ['dragenter', 'dragover', 'drop']) => state(([files, x, y, kinds]) => {
  const data = new DataTransfer();
  for (const [name, text] of files) data.items.add(new File([text], name));
  for (const kind of kinds) window.dispatchEvent(new DragEvent(kind, { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
}, [files, x, y, kinds]);
const tabs = () => state(() => window.olomolTest.tabs());
const settled = () => page.waitForFunction(() => !olomol.switching && !document.querySelector('.notice')?.textContent.startsWith('Opening'), null, { timeout: 20_000 }).catch(() => {});

export default async function run() {
  await freshFiles();

  // --- dragged over ---
  await drag([['ethanol.mol', ETHANOL]], [700, 450], ['dragenter', 'dragover']);
  const shown = await page.getByTestId('drop-here').count();
  await drag([['ethanol.mol', ETHANOL]], [700, 450], ['dragleave']);
  await page.waitForTimeout(200);
  check(shown === 1 && (await page.getByTestId('drop-here').count()) === 0, 'files dragged over the window: a mark to drop them, gone when they leave');

  // --- one file of molecules: where it was dropped ---
  await paste('c1ccccc1');
  const before = await state(() => ({ atoms: olomol.doc.atoms.size, tool: olomol.tool.name, ids: [...olomol.doc.atoms.keys()] }));
  const at = [300, 250];
  await drag([['ethanol.mol', ETHANOL]], at);
  await settled();
  const placed = await state(([before, [x, y]]) => {
    const added = [...olomol.doc.atoms.values()].filter((a) => !before.includes(a.id));
    const { scale, tx, ty } = olomol.view;
    const centre = [added.reduce((s, a) => s + a.x, 0) / added.length, added.reduce((s, a) => s + a.y, 0) / added.length];
    return { added: added.map((a) => a.el).sort().join(''), off: Math.hypot(centre[0] * scale + tx - x, centre[1] * scale + ty - y), tool: olomol.tool.name, tabs: olomol.tabs.length };
  }, [before.ids, at]);
  check(placed.added === 'CCO' && placed.tabs === 1, `a molfile dropped: its molecule put into the drawing (${placed.added}), no tab of its own`);
  check(placed.off < 60, `where it was dropped (${Math.round(placed.off)} px off)`);
  check(placed.tool === before.tool, `the tool as it was (${placed.tool})`);

  // --- a drawing and another program's file together ---
  await drag([['mechanism.ket', KET], ['chemdraw.cdxml', CDXML]], [700, 450]);
  await settled();
  await page.waitForFunction(() => olomol.tabs.length === 3, null, { timeout: 20_000 }).catch(() => {});
  const opened = await tabs();
  check(opened.length === 3 && opened[1].title === 'mechanism' && opened[2].title === 'chemdraw' && opened[2].front,
    `a KET and a CDXML dropped together: a tab each, named after them (${opened.map((tab) => tab.title).join(', ')})`);
  check((await state(() => window.olomolTest.file()))?.format === 'cdxml', 'the CDXML\'s tab has it as its own file (another program\'s: Save asks where)');
  check(!(await state(() => window.olomolTest.unsaved())), 'nothing unsaved in it');

  // --- a file olomol doesn't open ---
  await drag([['picture.png', 'not a drawing']], [700, 450]);
  await page.waitForTimeout(300);
  check((await tabs()).length === 3 && /picture\.png/.test(await notice()), `a PNG dropped: said (${await notice()}), nothing opened`);

  // --- onto an untouched drawing ---
  await page.getByTestId('tab-new').click();
  await page.waitForTimeout(200);
  check((await tabs()).length === 4, '(a new empty drawing)');
  await drag([['again.ket', KET]], [700, 450]);
  await settled();
  await page.waitForFunction(() => olomol.title === 'again', null, { timeout: 20_000 }).catch(() => {});
  check((await tabs()).length === 4 && (await state(() => olomol.title)) === 'again', 'a drawing dropped on an untouched one: opened in it');

  // --- the file manager's file (the installed app): saved into again ---
  await writeOutside('launched.olom', OLOM);
  await state(() => Promise.all([import('/src/ui/actions.js'), navigator.storage.getDirectory()]).then(async ([{ openGiven }, root]) => {
    await openGiven(olomol, [await root.getFileHandle('launched.olom')], () => {});
  }));
  await page.waitForFunction(() => olomol.title === 'launched', null, { timeout: 20_000 }).catch(() => {});
  check((await tabs()).length === 5 && (await state(() => window.olomolTest.file()))?.handle === true, 'a file given by the file manager: a tab of its own, with the file itself');
  const askedBefore = (await asked()).save.length;
  await state(() => {
    const atom = [...olomol.doc.atoms.values()][0];
    olomol.change(() => {
      atom.x += 0.5;
    });
  });
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(400);
  check((await asked()).save.length === askedBefore && (await fileText('launched.olom')) === (await ket()), 'changed, Ctrl+S: written into it without asking');

  // --- the manifest ---
  const manifest = await state((href) => fetch(new URL('manifest.webmanifest', href)).then((r) => r.json()), url.href);
  const offered = (manifest.file_handlers ?? []).flatMap((handler) => Object.values(handler.accept).flat());
  check(['.olom', '.ket', '.mol', '.sdf', '.rxn', '.cdxml', '.cdx', '.cml', '.smi', '.xyz'].every((ext) => offered.includes(ext)) && manifest.launch_handler?.client_mode === 'focus-existing',
    `the installed app is offered for olomol's files (${offered.join(' ')}), into the window already open`);
}
