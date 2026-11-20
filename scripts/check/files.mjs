// What the checks of files share (12-saving, 13-tabs): the browser's file dialogs replaced by ones that answer as
// told and hand out real files of the browser's own file system (OPFS), and reading those files back.
import { context, page, state, unlock } from './harness.mjs';

// the browser's dialogs, as the user would answer them: window.olomolTestPickers.answers.save / .open, one
// per dialog (a file name; null: cancelled); asked: the names suggested, in order
export const PICKERS = () => {
  const pickers = { answers: { save: [], open: [] }, asked: { save: [], open: 0 } };
  window.olomolTestPickers = pickers;
  const root = () => navigator.storage.getDirectory();
  const cancelled = () => new DOMException('The user aborted a request.', 'AbortError');
  window.showSaveFilePicker = async ({ suggestedName } = {}) => {
    pickers.asked.save.push(suggestedName);
    const answer = pickers.answers.save.length ? pickers.answers.save.shift() : suggestedName;
    if (answer === null) throw cancelled();
    return (await root()).getFileHandle(answer, { create: true });
  };
  window.showOpenFilePicker = async () => {
    pickers.asked.open += 1;
    const answer = pickers.answers.open.shift();
    if (!answer) throw cancelled();
    return [await (await root()).getFileHandle(answer)];
  };
};
// a file of the browser's file system: its text (null: none), written by "another program", removed
export const fileText = (name) => state(async (name) => {
  try {
    return await (await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}, name);
export const writeOutside = (name, text) => state(async ([name, text]) => {
  const handle = await (await navigator.storage.getDirectory()).getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}, [name, text]);
export const removeFile = (name) => state(async (name) => (await navigator.storage.getDirectory()).removeEntry(name), name);
export const answer = (kind, name) => state(([kind, name]) => window.olomolTestPickers.answers[kind].push(name), [kind, name]);
export const asked = () => state(() => ({ save: [...window.olomolTestPickers.asked.save], open: window.olomolTestPickers.asked.open }));
export const ket = () => state(() => window.olomolTest.ket());
export const unsaved = () => state(() => window.olomolTest.unsaved());
export const file = () => state(() => window.olomolTest.file());
export const title = () => state(() => olomol.title);
export const dot = () => page.getByTestId('unsaved').count();

// The dialogs replaced, on a page loaded again with nothing kept: no files, no drawings in the browser
export async function freshFiles() {
  await context.addInitScript(PICKERS);
  await state(async () => {
    const root = await navigator.storage.getDirectory();
    for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
    localStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('olomol');
      request.onsuccess = request.onerror = request.onblocked = resolve;
    });
  });
  await page.reload();
  await unlock(page);
  await page.waitForFunction(() => window.olomol && window.olomolTestPickers, null, { timeout: 30_000 });
}
