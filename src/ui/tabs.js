// Several drawings open, one in front: the tabs. The editor holds the drawing in front; each other one keeps
// its own state here (its drawing, selection, view, undo and redo, name, file and saved state), swapped in when
// its tab is chosen. Every open drawing is kept in the browser (io/store.js), each by its own id, so all of
// them come back when olomol opens again. A drawing is open in one window of olomol only (the browser's lock on
// it, claim): a second window doesn't bring back those open in the first, so the two can't write over each other.
// ed.tabs: [{ id, title, unsaved, keeping, own }], in order; own is null for the drawing in front (its state is
// the editor's), else its state (doc null until it is first shown: the KET it was kept as, in ket).
import { readAny } from '../io/files.js';
import { drawingText, keptFile, keptText, newDrawingId, savedAsOlom, unsavedChanges } from '../io/saving.js';
import { all, forget, get, put, STORES } from '../io/store.js';
import { keepVersion } from './history.js';
import { isNewTitle, newTitle } from '../editor/editor.js';
import { afterClosing, moved, restoredOrder, stepFrom } from '../editor/tabOrder.js';
import { completeDoc, emptyDoc, isEmpty } from '../model/doc.js';
import { t } from '../i18n/i18n.js';

const SESSION_KEY = 'olomol-tabs'; // { order, active }: the tabs as this browser had them last
const OLD_KEYS = ['olomol-autosave', 'olomol-autosave-id', 'olomol-view']; // (0.4: one drawing, in localStorage)
const KEEP_AFTER = 600; // ms after a change

// what is each drawing's own (the rest, the tool and the settings, is the same for all)
const OWN = ['doc', 'selection', 'view', 'undoStack', 'redoStack', 'checkpoints', 'shiftedOff', 'title', 'marks',
  'drawingId', 'file', 'savedKet', 'unsaved', 'keeping', 'keptAt', 'stereo'];

const startView = () => ({ scale: 42, tx: window.innerWidth / 2, ty: window.innerHeight / 2 });
const fresh = () => ({
  doc: emptyDoc(), selection: new Set(), view: startView(), undoStack: [], redoStack: [], checkpoints: 0, shiftedOff: null,
  title: newTitle(), marks: '', drawingId: newDrawingId(), file: null, savedKet: null, unsaved: false, keeping: null, keptAt: null, stereo: null,
});

const take = (ed) => Object.fromEntries(OWN.map((key) => [key, ed[key]]));
function bring(ed, own) {
  for (const key of OWN) ed[key] = own[key];
  Object.assign(ed, { hover: null, preview: null, gesture: null, pendingCurve: null, redoneBefore: null, sceneCache: null });
  ed.touched(); // (a new docVersion: drawn again, R/S worked out again)
}

// The tab of the drawing in front; the tabs' ids in order
export const frontTab = (ed) => ed.tabs.find((tab) => tab.id === ed.drawingId);
export const tabOrder = (ed) => ed.tabs.map((tab) => tab.id);

// A drawing that can take a file or a new drawing instead of a tab of its own: nothing drawn, nothing undone, no file
export const untouched = (ed) => isEmpty(ed.doc) && !ed.undoStack.length && !ed.redoStack.length && !ed.file;

// Whether a tab can be chosen now (not while drawing, typing a text or with a window open on the drawing)
export const canSwitch = (ed) => !ed.gesture && !ed.editing && !ed.question && !ed.nameRequest && !ed.switching;

// --- unsaved changes ---

// The drawing's text now (.olom), as Save would write it (after the drawing is worked out for display, which puts
// texts and arrows in their places)
export function drawingNow(ed) {
  void ed.scene;
  return drawingText(ed.doc, ed.settings, ed.title);
}

// Whether the drawing in front has changes its file doesn't (ed.unsaved: the dot on Save and on its tab); after
// each change (App.jsx), and before it is put aside or kept
export function checkUnsaved(ed) {
  const unsaved = unsavedChanges(ed.savedKet, drawingNow(ed), isEmpty(ed.doc));
  if (unsaved === ed.unsaved) return;
  ed.unsaved = unsaved;
  ed.emit();
}

// --- keeping them in the browser ---

// The drawing in front kept now (its .olom text, the view, whether unsaved), for next time;
// told to other windows of olomol (watchOtherWindows)
export async function keepDrawing(ed) {
  clearTimeout(ed.keepTimer);
  checkUnsaved(ed);
  const id = ed.drawingId;
  const record = { id, title: ed.title, ket: keptText(ed.doc, ed.title), view: { ...ed.view }, unsaved: ed.unsaved, keptAt: Date.now() };
  const kept = await put(STORES.drawings, id, record);
  if (kept) await keepVersion(id, record.ket);
  if (ed.drawingId === id) Object.assign(ed, kept ? { keeping: 'kept', keptAt: record.keptAt } : { keeping: 'failed' });
  if (!kept) ed.keepingFails = true; // (this browser keeps nothing: the page asks before it goes, App.jsx)
  if (kept) channel()?.postMessage({ kept: id, at: record.keptAt });
  keepSession(ed);
  ed.emit();
  return kept;
}

// The page going away with a change not kept yet: the browser's store is written in the background, which a page
// leaving may cut short; so the drawing in front is also written at once where that can be done at once
// (localStorage), and taken in when olomol opens next (restoreTabs), if it's newer than what was kept
const LEAVING_KEY = 'olomol-leaving';
export function keepOnLeaving(ed) {
  if (ed.keeping !== 'pending') return;
  try {
    void ed.scene; // (texts and arrows in their places)
    localStorage.setItem(LEAVING_KEY, JSON.stringify({ id: ed.drawingId, title: ed.title, ket: keptText(ed.doc, ed.title), view: { ...ed.view }, unsaved: ed.unsaved, keptAt: Date.now() }));
  } catch {
    // (too large, or nothing kept in this browser: the background write is all there is)
  }
  keepDrawing(ed);
}

// What a page left behind as it went (keepOnLeaving), into the store if newer than what is kept there
async function takeLeft() {
  let left = null;
  try {
    left = JSON.parse(localStorage.getItem(LEAVING_KEY) ?? 'null');
  } catch {
    return;
  }
  if (!left?.id || !left.ket) return;
  const kept = await get(STORES.drawings, left.id);
  if (!kept || (kept.keptAt ?? 0) < left.keptAt) await put(STORES.drawings, left.id, left);
  try {
    localStorage.removeItem(LEAVING_KEY);
  } catch {
    // left; taken again next time, and only if still newer
  }
}

// After a change: kept a moment later (a drag changes it at every step)
export function keepSoon(ed) {
  ed.keeping = 'pending';
  clearTimeout(ed.keepTimer);
  ed.keepTimer = setTimeout(() => keepDrawing(ed), KEEP_AFTER);
}

export function keepSession(ed) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ order: tabOrder(ed), active: ed.drawingId }));
  } catch {
    // not remembered
  }
}

// --- one window each ---

// The drawings this window has open, each held by a lock of the browser's (Web Locks) until its tab is closed
// or the window goes: id -> release. Without locks (an old browser) every window has all of them, as before 0.5.
const held = new Map();
const lockName = (id) => `olomol-drawing-${id}`;

// Drawing `id` taken for this window: resolves to false if another window of olomol has it open
export function claim(id) {
  if (held.has(id) || typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks.request(lockName(id), { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return null;
      }
      return new Promise((release) => {
        held.set(id, release);
        resolve(true);
      });
    }).catch(() => resolve(true));
  });
}

// Drawing `id` no longer open in this window (its tab closed)
export function letGo(id) {
  held.get(id)?.();
  held.delete(id);
}

// Something done once at a time across windows (taking over what 0.4 kept: two windows opened at once after the
// update would each take it)
const alone = (name, fn) => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(name, fn) : fn());

// --- the tabs ---

// Shows tab `id`: the drawing in front kept and put aside, that one brought forward (read from its KET the first
// time). Resolves to false if it can't be now.
export async function showTab(ed, id) {
  if (id === ed.drawingId) return true;
  const tab = ed.tabs.find((other) => other.id === id);
  if (!tab || !canSwitch(ed)) return false;
  ed.switching = true;
  try {
    ed.finishAnimation();
    if (ed.keeping === 'pending') await keepDrawing(ed);
    let { own } = tab;
    if (!own.doc) own = await unpack(own, ed.settings);
    checkUnsaved(ed);
    const front = frontTab(ed);
    if (front) Object.assign(front, { title: ed.title, unsaved: ed.unsaved, keeping: ed.keeping, own: take(ed) });
    tab.own = null;
    bring(ed, own);
  } finally {
    ed.switching = false;
  }
  keepSession(ed);
  ed.emit();
  return true;
}

// A kept drawing's state, from its KET and its file record (the first time its tab is shown); what its file was
// saved as compared in the style for new drawings (`settings`) where neither has one (kept by 0.4)
async function unpack(own, settings) {
  const { doc } = await readAny(own.ket, { name: 'kept.ket' });
  const record = await keptFile(own.drawingId);
  return { ...fresh(), ...own, doc: completeDoc(doc), ket: undefined, file: record?.file ?? null, savedKet: await savedAsOlom(record?.saved, own.title, settings, readAny) };
}

// The tab that has the file itself (`handle`) as its own, or null (a file opened again: its tab, not a second one)
export async function tabWith(ed, handle) {
  if (!handle?.isSameEntry) return null;
  for (const tab of ed.tabs) {
    const file = tab.id === ed.drawingId ? ed.file : tab.own?.file;
    if (file?.handle && (await file.handle.isSameEntry(handle).catch(() => false))) return tab.id;
  }
  return null;
}

// The tab whose own file has this name (the first), or null
export function tabNamed(ed, name) {
  return ed.tabs.find((tab) => (tab.id === ed.drawingId ? ed.file : tab.own?.file)?.name === name)?.id ?? null;
}

// A new tab with a new drawing, at the end (as + stands there: J), or the one in front if it's untouched and a file
// or a link comes into it (`always`: a new tab whatever, as New drawing and + make one); resolves to
// whether it is new
export async function newTab(ed, { always = false } = {}) {
  if (!always && untouched(ed)) return false;
  if (!canSwitch(ed)) return false;
  ed.finishAnimation();
  if (ed.keeping === 'pending') await keepDrawing(ed);
  checkUnsaved(ed);
  const own = fresh();
  claim(own.drawingId); // (a new drawing: no other window has it, so not waited for)
  const at = ed.tabs.findIndex((tab) => tab.id === ed.drawingId);
  const front = ed.tabs[at];
  Object.assign(front, { title: ed.title, unsaved: ed.unsaved, keeping: ed.keeping, own: take(ed) });
  ed.tabs.push({ id: own.drawingId, title: own.title, unsaved: false, keeping: null, own: null });
  bring(ed, own);
  keepSession(ed);
  ed.emit();
  return true;
}

// A copy of drawing `id` (shown first) in a new tab right after it, brought forward: the same drawing, style and
// view, its name with "(copy)" (a new drawing's copy: a new drawing), no file and no undo of its own (an exercise
// copied for its solution, a mechanism step by step for Show). Kept at once. Resolves to whether it was made.
export async function duplicateTab(ed, id = ed.drawingId) {
  if (!(await showTab(ed, id)) || !canSwitch(ed)) return false;
  ed.finishAnimation();
  if (ed.keeping === 'pending') await keepDrawing(ed);
  checkUnsaved(ed);
  // (as kept and brought back: nothing shared; a drawing without a style of its own stays so, the copy follows the
  // style for new drawings as the original does)
  void ed.scene;
  const { doc } = await readAny(keptText(ed.doc, ed.title), { name: 'copy.olom' });
  const title = isNewTitle(ed.title) ? newTitle() : t('{name} (copy)', { name: ed.title });
  const own = { ...fresh(), doc: completeDoc(doc), view: { ...ed.view }, title };
  claim(own.drawingId); // (a new drawing: no other window has it, so not waited for)
  const at = ed.tabs.findIndex((tab) => tab.id === ed.drawingId);
  Object.assign(ed.tabs[at], { title: ed.title, unsaved: ed.unsaved, keeping: ed.keeping, own: take(ed) });
  ed.tabs.splice(at + 1, 0, { id: own.drawingId, title, unsaved: false, keeping: null, own: null });
  bring(ed, own);
  await keepDrawing(ed);
  return true;
}

// Tab `id` moved to position `to` (dragged along the tabs); kept so for next time
export function moveTab(ed, id, to) {
  const order = moved(tabOrder(ed), id, to);
  if (order.join() === tabOrder(ed).join()) return;
  ed.tabs = order.map((other) => ed.tabs.find((tab) => tab.id === other));
  keepSession(ed);
  ed.emit();
}

// Tab `step` (1: the next, -1: the one before) shown
export const stepTab = (ed, step) => (ed.tabs.length > 1 ? showTab(ed, stepFrom(tabOrder(ed), ed.drawingId, step)) : false);

// Closes tab `id` (shown first): with changes its file doesn't have, asks first (Save, Don't save, Cancel).
// `save` saves (actions.js saveFile). The last tab closed leaves a new empty drawing. Resolves to whether it closed.
export async function closeTab(ed, id, { save }) {
  // (another tab than the one in front: shown to be closed (asked about there if it has unsaved changes), and the
  // one that was in front comes back after, not its neighbour)
  const was = ed.drawingId;
  if (!(await showTab(ed, id))) return false;
  checkUnsaved(ed); // (a change a moment ago, not looked at yet, counts)
  if (ed.unsaved) {
    const choice = await new Promise((resolve) => {
      ed.question = { title: t('Close {name}?', { name: shownTitle(ed.title) }), text: ed.file
        ? t('{name} has changes that are not in {file}. Save them first?', { name: shownTitle(ed.title), file: ed.file.name })
        : t('{name} has not been saved in a file. Save it first? Closed without saving, it is gone.', { name: shownTitle(ed.title) }),
      choices: [{ id: 'cancel', label: t('Cancel') }, { id: 'drop', label: t('Close without saving') }, { id: 'save', label: t('Save'), primary: true }],
      resolve: (answer) => {
        ed.question = null;
        ed.emit();
        resolve(answer);
      } };
      ed.emit();
    });
    if (choice === 'save') {
      await save();
      if (ed.unsaved) return false; // (the save was cancelled or failed: the drawing stays)
    } else if (choice !== 'drop') return false;
  }
  clearTimeout(ed.keepTimer);
  const next = was !== id && ed.tabs.some((tab) => tab.id === was) ? was : afterClosing(tabOrder(ed), id);
  await forget(id);
  letGo(id);
  ed.tabs = ed.tabs.filter((tab) => tab.id !== id);
  const tab = ed.tabs.find((other) => other.id === next);
  if (tab) {
    const own = tab.own.doc ? tab.own : await unpack(tab.own, ed.settings);
    tab.own = null;
    bring(ed, own);
  } else {
    const own = fresh();
    claim(own.drawingId); // (a new drawing: no other window has it, so not waited for)
    ed.tabs = [{ id: own.drawingId, title: own.title, unsaved: false, keeping: null, own: null }];
    bring(ed, own);
  }
  keepSession(ed);
  ed.emit();
  return true;
}

// The drawing in front takes `doc` (a file opened, a link) in a new tab, or in this one if it's untouched:
// no undo step (closing the tab is the way back), `title` and `file` its own
export async function openInTab(ed, doc, { title, file = null }) {
  if (!untouched(ed) && !(await newTab(ed))) return false;
  ed.doc = completeDoc(doc);
  ed.selection.clear();
  ed.undoStack = [];
  ed.redoStack = [];
  ed.title = title;
  ed.file = file;
  ed.savedKet = null;
  ed.unsaved = false;
  ed.touched();
  return true;
}

// A drawing's name as people see it: "New drawing" while it has the name a new drawing got (its file is still
// suggested under that name, a date and time: no file written over)
export const shownTitle = (title) => (isNewTitle(title) ? t('New drawing') : title);

// --- when olomol opens ---

// The drawings kept, as tabs in the order they had (the one in front then in front); the one drawing 0.4 kept,
// if it's there, as the first. Those open in another window of olomol stay there (`elsewhere`: how many). One that
// can't be read (kept by a newer olomol) is left where it is, not shown. Resolves to { found, view, elsewhere }
// (found: whether there was any; else the editor's new drawing is the one tab).
export async function restoreTabs(ed) {
  await alone('olomol-from-0.4', fromOldVersion);
  await alone('olomol-leaving', takeLeft);
  let session = null;
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    // none
  }
  const kept = (await all(STORES.drawings)).filter((record) => record?.id && record.ket);
  const order = restoredOrder(session?.order, kept);
  const byId = new Map(kept.map((record) => [record.id, record]));
  let front = order.includes(session?.active) ? session.active : order[0];
  const tabs = [];
  let elsewhere = 0;
  for (const id of order) {
    const record = byId.get(id);
    if (!(await claim(id))) {
      elsewhere += 1;
      if (id === front) front = null;
      continue;
    }
    let empty = false;
    try {
      empty = isEmpty((await readAny(record.ket, { name: 'kept.ket' })).doc);
    } catch {
      // (one that can't be read, kept by a newer olomol: left where it is, not shown)
      letGo(id);
      if (id === front) front = null;
      continue;
    }
    if (empty && id !== front) {
      await forget(id); // (an empty drawing left behind: nothing to bring back)
      letGo(id);
      continue;
    }
    const file = (await keptFile(id))?.file ?? null; // (known from the start: its tooltip, a file opened again)
    tabs.push({ id, title: record.title, unsaved: Boolean(record.unsaved), keeping: 'kept', own: { ...fresh(), drawingId: id, title: record.title, view: record.view ?? startView(), unsaved: Boolean(record.unsaved), keeping: 'kept', keptAt: record.keptAt, doc: null, ket: record.ket, file } });
  }
  if (!tabs.length) {
    await claim(ed.drawingId);
    ed.tabs = [{ id: ed.drawingId, title: ed.title, unsaved: false, keeping: null, own: null }];
    return { found: false, elsewhere };
  }
  ed.tabs = tabs;
  const shown = tabs.find((tab) => tab.id === front) ?? tabs[0];
  const own = await unpack(shown.own, ed.settings);
  shown.own = null;
  bring(ed, own);
  keepSession(ed);
  return { found: true, view: Boolean(byId.get(shown.id)?.view), elsewhere };
}

// 0.4 kept one drawing in localStorage: it becomes the first kept drawing (its file, kept with its id since
// 0.5's saving, with it), and the old keys go
async function fromOldVersion() {
  let ket = null;
  let id = null;
  try {
    ket = localStorage.getItem(OLD_KEYS[0]);
    id = localStorage.getItem(OLD_KEYS[1]);
  } catch {
    return;
  }
  if (!ket) return;
  let title = null;
  try {
    ({ title } = await readAny(ket, { name: 'autosave.ket' }));
  } catch {
    // kept as it is
  }
  id ??= newDrawingId();
  if (await put(STORES.drawings, id, { id, title: title || newTitle(), ket, view: null, unsaved: true, keptAt: Date.now() })) {
    try {
      for (const key of OLD_KEYS) localStorage.removeItem(key);
    } catch {
      // left
    }
  }
}

// --- other windows ---

let shared = null;
const channel = () => {
  if (shared === null) shared = typeof BroadcastChannel === 'undefined' ? false : new BroadcastChannel('olomol');
  return shared || null;
};

// Another window of olomol has kept a drawing that is open here too: what comes back next time is the one changed
// last, so this one's tab says so ('elsewhere')
export function watchOtherWindows(ed) {
  const own = channel();
  if (!own) return () => {};
  const heard = ({ data }) => {
    if (!data?.kept) return;
    if (data.kept === ed.drawingId) ed.keeping = 'elsewhere';
    const tab = ed.tabs.find((other) => other.id === data.kept);
    if (tab && tab.id !== ed.drawingId) tab.keeping = 'elsewhere';
    ed.emit();
  };
  own.addEventListener('message', heard);
  return () => own.removeEventListener('message', heard);
}
