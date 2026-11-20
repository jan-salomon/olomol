// Saving a drawing into its own file (src/io/saving.js): where Ctrl+S goes, when a drawing has unsaved changes,
// and writing a file (permission, a failed write, what is read back). The browser check (12-saving) does the
// same with real files in the browser. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawingText, formatOf, lastModified, saveTarget, unsavedChanges, writeFile } from '../src/io/saving.js';
import { addAtom, addBond, emptyDoc } from '../src/model/doc.js';
import { DEFAULT_SETTINGS } from '../src/render/scene.js';

test('the format of a file is its extension, in lower case', () => {
  assert.equal(formatOf('ethanol.olom'), 'olom');
  assert.equal(formatOf('ethanol.ket'), 'ket');
  assert.equal(formatOf('Scheme.KET'), 'ket');
  assert.equal(formatOf('from.chemdraw.cdxml'), 'cdxml');
  assert.equal(formatOf('aspirin.mol'), 'mol');
  assert.equal(formatOf('no extension'), '');
  assert.equal(formatOf('drawing.ket.json'), 'json');
});

test('Ctrl+S: into its own file only if it is an .olom under the drawing\'s name; else the dialog', () => {
  const ket = (extra = {}) => ({ name: 'ethanol.olom', format: 'olom', handle: {}, modified: 1, ...extra });
  for (const picker of [true, false]) {
    const ask = picker ? 'dialog' : 'ask-name';
    assert.equal(saveTarget(null, 'ethanol', { picker }), ask, 'a new drawing');
    assert.equal(saveTarget(ket(), 'ethanol', { picker }), 'in-place', 'its own .olom file, its handle kept');
    assert.equal(saveTarget(ket(), 'ethanol-2', { picker }), ask, 'renamed in the title field: a new file');
    assert.equal(saveTarget(ket(), 'Ethanol', { picker }), ask, 'the name differs in case: a new file');
    assert.equal(saveTarget(ket({ name: 'ethanol.OLOM', format: 'olom' }), 'ethanol', { picker }), ask, 'ETHANOL.OLOM is not ethanol.olom');
    assert.equal(saveTarget(ket({ name: 'ethanol.ket', format: 'ket' }), 'ethanol', { picker }), ask, 'a KET file (Ketcher\'s, or olomol\'s before 0.5.0) is not written over');
    assert.equal(saveTarget(ket({ name: 'ethanol.cdxml', format: 'cdxml' }), 'ethanol', { picker }), ask, 'another program\'s file is never written over');
    assert.equal(saveTarget(ket({ name: 'ethanol.mol', format: 'mol' }), 'ethanol', { picker }), ask, 'a molfile neither');
    assert.equal(saveTarget(ket({ name: 'ethanol.json', format: 'json' }), 'ethanol', { picker }), ask, 'nor a .json');
  }
  // without a handle (downloaded, or opened by the file chooser)
  assert.equal(saveTarget(ket({ handle: null, downloaded: true }), 'ethanol', { picker: false }), 'download', 'downloaded before: again, without asking');
  assert.equal(saveTarget(ket({ handle: null, downloaded: true }), 'ethanol', { picker: true }), 'dialog', 'a browser with a dialog after all: the dialog, to get the file itself');
  assert.equal(saveTarget(ket({ handle: null }), 'ethanol', { picker: false }), 'ask-name', 'opened, never downloaded: asks once');
  assert.equal(saveTarget(ket({ handle: null, downloaded: true }), 'other', { picker: false }), 'ask-name', 'renamed: asks');
});

test('unsaved changes: the drawing differs from what its file holds', () => {
  assert.equal(unsavedChanges(null, '{}', true), false, 'a new empty drawing');
  assert.equal(unsavedChanges(null, '{"a":1}', false), true, 'a new drawing with something in it');
  assert.equal(unsavedChanges('{"a":1}', '{"a":1}', false), false, 'as saved');
  assert.equal(unsavedChanges('{"a":1}', '{"a":2}', false), true, 'changed');
  assert.equal(unsavedChanges('{"a":1}', '{}', true), true, 'emptied after saving: the file still has it');
});

test('the .olom a drawing is saved as: the same drawing, the same text; its name in it', () => {
  const draw = () => {
    const doc = emptyDoc();
    const c = addAtom(doc, 0, 0, 'C');
    const o = addAtom(doc, 1.5, 0, 'O', { lonePairs: 'auto' }); // (its lone pairs: shown, whatever the settings draw them as)
    addBond(doc, c.id, o.id, 1);
    return doc;
  };
  const one = drawingText(draw(), DEFAULT_SETTINGS, 'methanol');
  assert.equal(drawingText(draw(), DEFAULT_SETTINGS, 'methanol'), one, 'written twice, the same');
  assert.notEqual(drawingText(draw(), DEFAULT_SETTINGS, 'methanol-2'), one, 'another name, another file');
  assert.notEqual(drawingText(draw(), { ...DEFAULT_SETTINGS, pairStyle: 'bars' }, 'methanol'), one, 'lone pairs as bars set for new drawings: in the file, its style');
  assert.equal(drawingText(draw(), { ...DEFAULT_SETTINGS, allCarbons: true }, 'methanol'), one, 'every carbon written: a setting, not in the file');
  const moved = draw();
  [...moved.atoms.values()][1].x += 0.5;
  assert.notEqual(drawingText(moved, DEFAULT_SETTINGS, 'methanol'), one, 'an atom moved');
});

// A file handle as the browser gives one, in memory: what was written, what permission says, what fails
function fakeHandle({ permission = 'granted', requested = 'granted', failWrite = false, readBack = null, query = true } = {}) {
  const handle = {
    content: 'old', modified: 100, written: [], aborted: 0, asked: 0,
    async getFile() {
      if (handle.gone) throw Object.assign(new Error('gone'), { name: 'NotFoundError' });
      const content = readBack ?? handle.content;
      const blob = content instanceof Blob ? content : new Blob([content]);
      return { lastModified: handle.modified, text: () => blob.text(), arrayBuffer: () => blob.arrayBuffer() };
    },
    async createWritable() {
      let pending = handle.content;
      return {
        write: async (text) => {
          if (failWrite) throw new Error('disk full');
          pending = text;
        },
        close: async () => {
          handle.content = pending;
          handle.modified += 1;
          handle.written.push(pending);
        },
        abort: async () => {
          handle.aborted += 1;
        },
      };
    },
  };
  if (query) {
    handle.queryPermission = async () => permission;
    handle.requestPermission = async () => {
      handle.asked += 1;
      return requested;
    };
  }
  return handle;
}

test('writing a file: written whole, read back the same, its new lastModified', async () => {
  const handle = fakeHandle();
  assert.equal(await writeFile(handle, 'new drawing'), 101);
  assert.deepEqual(handle.written, ['new drawing']);
  assert.equal(handle.content, 'new drawing');
  assert.equal(handle.asked, 0, 'permission there: not asked');
});

test('writing a file: permission asked for when the browser wants it, and nothing written without', async () => {
  const asked = fakeHandle({ permission: 'prompt', requested: 'granted' });
  await writeFile(asked, 'x');
  assert.equal(asked.asked, 1);
  assert.deepEqual(asked.written, ['x']);
  const refused = fakeHandle({ permission: 'prompt', requested: 'denied' });
  await assert.rejects(writeFile(refused, 'x'), (error) => error.permission === true);
  assert.deepEqual(refused.written, [], 'nothing written');
  assert.equal(refused.content, 'old', 'the file as it was');
  const older = fakeHandle({ query: false }); // (a browser without queryPermission)
  await writeFile(older, 'y');
  assert.deepEqual(older.written, ['y']);
});

test('writing a file: a failed write leaves the file as it was, and says so', async () => {
  const handle = fakeHandle({ failWrite: true });
  await assert.rejects(writeFile(handle, 'new'), /disk full/);
  assert.equal(handle.content, 'old');
  assert.equal(handle.aborted, 1, 'the half-written copy thrown away');
  assert.equal(handle.modified, 100);
});

test('writing a file: a picture (a Blob, a PNG) read back byte for byte', async () => {
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255])], { type: 'image/png' });
  const handle = fakeHandle();
  assert.equal(await writeFile(handle, png), 101, 'the same bytes: written');
  const changed = fakeHandle({ readBack: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 254])]) });
  await assert.rejects(writeFile(changed, png), (error) => error.mismatch === true);
});

test('writing a file: one that reads back differently is an error', async () => {
  const handle = fakeHandle({ readBack: 'something else' });
  await assert.rejects(writeFile(handle, 'new'), (error) => error.mismatch === true);
});

test('lastModified: the file\'s, or null when it is gone', async () => {
  const handle = fakeHandle();
  assert.equal(await lastModified(handle), 100);
  handle.gone = true;
  assert.equal(await lastModified(handle), null);
});

test('the files olomol opens: by extension, any case; the installed app is offered the same ones', async () => {
  const { opens, OPEN_TYPES } = await import('../src/io/saving.js');
  for (const name of ['a.olom', 'b.OLOM', 'a.ket', 'A.KET', 'x.mol', 'x.sdf', 'r.rxn', 'c.cdxml', 'c.cdx', 'm.cml', 's.smi', 'g.xyz']) assert.ok(opens(name), name);
  for (const name of ['a.ket.bak', 'ket', 'a.docx', 'a.jpg']) assert.ok(!opens(name), name);
  for (const name of ['a.png', 'b.SVG']) assert.ok(opens(name), `${name}: a picture olomol exported, the drawing in it`);
  const { readFileSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  const offered = manifest.file_handlers.flatMap((handler) => Object.values(handler.accept).flat());
  for (const ext of offered) assert.ok(OPEN_TYPES.split(',').includes(ext), `the file manager offers ${ext}: olomol opens it`);
});

test('an update of olomol is no change to a drawing: its file names the olomol that wrote it, the rest compared', async () => {
  const { unsavedChanges } = await import('../src/io/saving.js');
  const saved = '{\n "format": "olom",\n "version": "1.0",\n "app": "olomol 0.5.0",\n "style": "screen"\n}\n';
  assert.equal(unsavedChanges(saved, saved.replace('0.5.0', '0.5.1'), false), false);
  assert.equal(unsavedChanges(saved, saved.replace('screen', 'acs'), false), true);
});

test('a drawing kept in the browser without a style of its own stays so (it follows the style for new drawings)', async () => {
  const { keptText } = await import('../src/io/saving.js');
  const { readOlom } = await import('../src/io/olom.js');
  const { addAtom, emptyDoc } = await import('../src/model/doc.js');
  const doc = emptyDoc();
  addAtom(doc, 0, 0);
  assert.equal(readOlom(keptText(doc, 'x')).doc.style, undefined);
  doc.style = { style: 'acs' };
  assert.deepEqual(readOlom(keptText(doc, 'x')).doc.style, { style: 'acs' });
});

test('a file saved by 0.4 (a KET, no style) is no change, whatever the style for new drawings is', async () => {
  const { savedAsOlom } = await import('../src/io/saving.js');
  const { readKet } = await import('../src/io/ket.js');
  const read = async (text) => readKet(text);
  const ket = JSON.stringify({ root: { nodes: [{ $ref: 'mol0' }] }, mol0: { type: 'molecule', atoms: [{ label: 'C', location: [0, 0, 0] }, { label: 'O', location: [1, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] } });
  for (const style of ['screen', 'acs', 'rsc', 'slides']) {
    const settings = { ...DEFAULT_SETTINGS, style };
    // the drawing kept with it (no style of its own either), as the tab has it now
    const now = drawingText(readKet(ket).doc, settings, 'Ethanol');
    assert.equal(unsavedChanges(await savedAsOlom(ket, 'Ethanol', settings, read), now, false), false, style);
  }
  const olom = drawingText(readKet(ket).doc, DEFAULT_SETTINGS, 'x');
  assert.equal(await savedAsOlom(olom, 'x', DEFAULT_SETTINGS, read), olom, 'an .olom as it is');
  assert.equal(await savedAsOlom(null, 'x', DEFAULT_SETTINGS, read), null);
  assert.equal(await savedAsOlom('not a file', 'x', DEFAULT_SETTINGS, async () => { throw new Error('no'); }), null, 'unreadable: null');
});
