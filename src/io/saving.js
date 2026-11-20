// A drawing and its own file, as in a word processor: the file it was opened from or last saved to. Ctrl+S
// writes that file again without asking (Chrome, Edge: the File System Access API; the browser asks once per
// visit whether olomol may), Ctrl+Shift+S asks where. The drawing's file is an .olom, olomol's own (olom.js). A
// file another program wrote (KET, CDXML, a molfile) is never written over: Ctrl+S asks where to save the drawing
// as .olom. A file changed since olomol last read or wrote it
// (by another program, another tab) is written over only when the user says so. What is written is read back
// and compared. Browsers that can't write files (Firefox, Safari) download them: the first time under a name
// asked for, then again under it without asking.
import { isOlom, writeOlom } from './olom.js';
import { get, put, STORES } from './store.js';

// The drawing as its file holds it (what Save writes, what "unsaved changes" compares with, what is kept in the
// browser; the records there still call it `ket`, as they did when it was KET, before 0.5.0)
export const drawingText = (doc, settings, title) => writeOlom(doc, { settings, title });
// The drawing as kept in the browser: as its file would hold it, but a drawing with no style of its own stays so
// (it follows the style for new drawings: changed meanwhile, it comes back in that one)
export const keptText = (doc, title) => writeOlom(doc, { title, ownStyle: true });

// What a file was saved as, kept as KET by olomol before 0.5.0 (`saved`): as .olom, to compare with the drawing now
// (else every drawing kept then would show unsaved changes). Such a KET has no style, nor has the drawing kept
// with it, so both are written in the style for new drawings (`settings`). `read`: files.js readAny (passed in, so
// that saving.js needs none of the file readers). An .olom (or nothing) as it is; one that can't be read: null.
export async function savedAsOlom(saved, title, settings, read) {
  if (saved == null || isOlom(saved)) return saved ?? null;
  try {
    return drawingText((await read(saved, { name: 'saved.ket' })).doc, settings, title);
  } catch {
    return null;
  }
}

// olomol's own files: the extension and the type they are saved with
export const OLOM = { ext: 'olom', mime: 'application/x-olom+json' };

// The files olomol opens, by extension (the open dialog, a drop, the file manager: manifest file_handlers)
// (SVG and PNG: pictures olomol exported, the drawing inside them: embedded.js)
export const OPEN_TYPES = '.olom,.ket,.mol,.sdf,.sd,.rxn,.cdxml,.cdx,.cml,.smi,.smiles,.xyz,.txt,.json,.svg,.png';
export const opens = (name) => OPEN_TYPES.split(',').includes((/\.[^.]+$/.exec(name)?.[0] ?? '').toLowerCase());

// The format of a file, by its extension: 'olom', or another program's ('ket', 'cdxml', 'mol'…)
export const formatOf = (name) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();

// What Ctrl+S does with a drawing whose own file is `file` ({ name, format, handle, downloaded }, or null) and
// whose name is `title`: 'in-place' (writes that file again), 'download' (downloads it again under its name, a
// browser that can't write files), 'dialog' (the browser's save dialog) or 'ask-name' (our name dialog, then a
// download). A new name in the title field is a new file. `picker`: the browser has a save dialog.
export function saveTarget(file, title, { picker }) {
  const same = Boolean(file) && file.format === 'olom' && file.name === `${title}.olom`;
  if (same && file.handle) return 'in-place';
  if (same && file.downloaded && !picker) return 'download';
  return picker ? 'dialog' : 'ask-name';
}

// Whether the drawing has changes its file doesn't have: `saved` is the text last written to or read from its
// file (null: none yet, so any drawing that isn't empty), `now` the drawing's text now
// (the line naming the olomol that wrote it aside: an update of olomol is no change to the drawing)
const withoutApp = (text) => text.replace(/^ "app": "[^"\n]*",\n/m, '');
export const sameDrawing = (a, b) => withoutApp(a) === withoutApp(b);
export const unsavedChanges = (saved, now, empty) => (saved == null ? !empty : !sameDrawing(saved, now));

// Writes `text` (a string, or a Blob: a PNG) into the file `handle` and reads it back: resolves to the file's
// lastModified, or throws (no permission: error.permission; read back differently: error.mismatch). The browser
// writes to a copy and puts it in place on close, so a failed write leaves the file as it was.
// Whether olomol may read and write the file (asked once per visit, at a click or a key: Ctrl+S)
export async function mayWrite(handle) {
  try {
    if (!handle.queryPermission) return true;
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

export async function writeFile(handle, text) {
  if (!(await mayWrite(handle))) throw Object.assign(new Error('no permission to write the file'), { permission: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => {});
    throw error;
  }
  const file = await handle.getFile();
  if (!(await sameContent(file, text))) throw Object.assign(new Error('the file reads back differently from what was written'), { mismatch: true });
  return file.lastModified;
}

// Whether a file read back holds `written`: a string as text, a Blob byte for byte
async function sameContent(file, written) {
  if (typeof written === 'string') return (await file.text()) === written;
  const [a, b] = await Promise.all([file.arrayBuffer(), written.arrayBuffer()]).then((buffers) => buffers.map((x) => new Uint8Array(x)));
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

// When the file was last changed (by anyone), or null if it can't be read (gone, or no permission)
export async function lastModified(handle) {
  try {
    return (await handle.getFile()).lastModified;
  } catch {
    return null;
  }
}

// --- each drawing's file, kept in the browser (io/store.js) ---

// The file and saved state of drawing `id`: { file, saved } (saved: the text its file holds), or null
export const keptFile = (id) => get(STORES.files, id);

// Keeps them for drawing `id` (null: forgets them); false if the browser can't (a private window)
export const keepFile = (id, record) => put(STORES.files, id, record);

// A new drawing's id
export const newDrawingId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
