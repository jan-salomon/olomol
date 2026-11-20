// The recent files and each drawing's earlier versions, kept in the browser (io/store.js; the lists themselves:
// io/history.js).
import { withRecent, withVersion } from '../io/history.js';
import { get, put, STORES } from '../io/store.js';

// Each change to a list read, changed and written before the next begins: two at once (two files dropped together)
// would each read the list before the other wrote it, and one would be lost
let queue = Promise.resolve();
const inTurn = (work) => {
  const done = queue.then(work, work);
  queue = done.catch(() => {});
  return done;
};

// --- recent files: ed.recent, the list as last read ---

export async function loadRecent(ed) {
  ed.recent = (await get(STORES.recent, 'list')) ?? [];
  ed.emit();
}

// Two entries for the same file: the same name, and where both have the file itself, the same file
async function sameFile(a, b) {
  if (a.name !== b.name) return false;
  if (!a.handle || !b.handle) return true;
  try {
    return await a.handle.isSameEntry(b.handle);
  } catch {
    return false;
  }
}

// A file opened or saved (`file`: { name, handle }; `ket`: the drawing as it holds it, a copy for when the file
// itself can't be reached) to the top of the recent files
export const rememberFile = (ed, file, ket) => inTurn(async () => {
  const list = (await get(STORES.recent, 'list')) ?? [];
  const entry = { name: file.name, handle: file.handle ?? null, ket, at: Date.now() };
  const same = await Promise.all(list.map((other) => sameFile(other, entry)));
  ed.recent = withRecent(list, entry, same);
  await put(STORES.recent, 'list', ed.recent);
  ed.emit();
});

export const forgetRecent = (ed, entry) => inTurn(async () => {
  const list = (await get(STORES.recent, 'list')) ?? [];
  ed.recent = list.filter((other) => !(other.name === entry.name && other.at === entry.at));
  await put(STORES.recent, 'list', ed.recent);
  ed.emit();
});

// --- earlier versions of a drawing ---

export const versionsOf = async (id) => (await get(STORES.versions, id)) ?? [];

// The drawing `id` as kept now (its KET) among its versions
export const keepVersion = (id, ket) => inTurn(async () => {
  const list = await versionsOf(id);
  const next = withVersion(list, { at: Date.now(), ket });
  if (next !== list) await put(STORES.versions, id, next);
});
