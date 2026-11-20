// What olomol keeps in the browser beyond the settings (IndexedDB, database "olomol"): each open drawing
// ("drawings": its id -> { id, title, ket, view, unsaved, keptAt }, the drawing as autosaved) and its own file
// ("files": its id -> { file, saved }, io/saving.js; a file handle can be kept here, not in localStorage), its
// earlier versions ("versions": its id -> [{ at, ket }], io/history.js) and the recent files ("recent": 'list' ->
// [{ name, handle, ket, at }]).
// Everything here fails quietly: a private window or a full disk keeps nothing, and olomol works on.
const NAME = 'olomol';
const VERSION = 3; // 1: files only (0.5.0 before tabs), 2: and drawings
export const STORES = { drawings: 'drawings', files: 'files', versions: 'versions', recent: 'recent' };

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      for (const store of Object.values(STORES)) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('the browser\'s storage is held by an older olomol tab'));
  });
}

// Runs `work(stores)` in one transaction over `names`; resolves to what the last request asked gave
async function inStores(names, mode, work) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(names, mode);
      const stores = Object.fromEntries(names.map((name) => [name, transaction.objectStore(name)]));
      const request = work(stores);
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function get(store, key) {
  try {
    return (await inStores([store], 'readonly', (s) => s[store].get(key))) ?? null;
  } catch {
    return null;
  }
}

export async function all(store) {
  try {
    return (await inStores([store], 'readonly', (s) => s[store].getAll())) ?? [];
  } catch {
    return [];
  }
}

// Puts `value` under `key` (null: deletes it); false if the browser keeps nothing
export async function put(store, key, value) {
  try {
    await inStores([store], 'readwrite', (s) => (value == null ? s[store].delete(key) : s[store].put(value, key)));
    return true;
  } catch {
    return false;
  }
}

// A drawing closed: it, its file and its earlier versions forgotten, in one go
export async function forget(id) {
  try {
    await inStores([STORES.drawings, STORES.files, STORES.versions], 'readwrite', (s) => {
      s.drawings.delete(id);
      s.versions.delete(id);
      return s.files.delete(id);
    });
    return true;
  } catch {
    return false;
  }
}
