// What the buttons and shortcuts do with files and the clipboard: new,
// open, save, export, copy and paste. Kept out of the components so the
// same action works from a button, a menu and a key.
import { lostIn } from '../io/lost.js';
import { canPick, download, FORMATS, holdsMolecules, openPicked, opens, pngOf, readAny, readGiven, svgOf, writeAs } from '../io/files.js';
import { formatOf, keepFile, lastModified, mayWrite, OLOM, saveTarget, writeFile } from '../io/saving.js';
import { printPage } from '../io/print.js';
import { pngWithDrawing, svgWithDrawing } from '../io/embedded.js';
import { snapBond } from '../arrange/align.js';
import { STYLES } from '../render/style.js';
import { checkUnsaved, drawingNow, keepDrawing, newTab, openInTab, showTab, tabNamed, tabWith } from './tabs.js';
import { forgetRecent, rememberFile } from './history.js';

export { checkUnsaved };
import { stereoLabels, wantsStereo } from '../chem/stereo.js';
import { chemistryMolfile } from '../editor/abbreviate.js';
import { identifiers } from '../io/rdkit.js';
import { writeOlom } from '../io/olom.js';
import { parseMarkup } from '../render/text.js';
import { drawingIn, linkTo, olomolLink, structuresIn, withoutStructures } from '../io/link.js';
import { lookUp } from '../io/pubchem.js';
import { writeMolfile } from '../io/molfile.js';
import { newTitle } from '../editor/editor.js';
import { TOOLS } from '../editor/tools.js';
import { copyObjects, emptyDoc, freeIds, isEmpty } from '../model/doc.js';
import { t } from '../i18n/i18n.js';

// --- the drawing's own file ---

// The drawing is what its file holds: `file` and the KET written or read (kept in the browser for next time)
function inFile(ed, file, ket) {
  ed.file = file;
  ed.savedKet = ket;
  ed.unsaved = false;
  keepFile(ed.drawingId, { file, saved: ket });
  rememberFile(ed, file, ket);
  // (kept at once, not a moment later: a tab closed right after Ctrl+S would come back with what was there before,
  // and the next Ctrl+S write that over the file)
  keepDrawing(ed);
  ed.emit();
}

// A question with buttons (QuestionDialog in Dialogs.jsx): resolves to the id of the choice, or null (Esc)
export function ask(ed, { title, text, choices }) {
  return new Promise((resolve) => {
    ed.question = { title, text, choices, resolve: (choice) => {
      ed.question = null;
      ed.emit();
      resolve(choice);
    } };
    ed.emit();
  });
}

// A new drawing in a tab of its own (ui/tabs.js), at 100 %
export const newDrawing = (ed) => newTab(ed, { always: true });

export async function openFile(ed, fit) {
  const file = await openPicked();
  if (file) await openFiles(ed, [file], fit);
}

// Files to open (Ctrl+O, dropped on the window, opened with olomol from the file manager), each read already
// ({ name, text, handle, modified }). One with molecules only (a molfile, SDF, SMILES, a calculation's structure)
// goes into the drawing, placed like a template: where it was dropped (`at`), else where the next click puts it.
// A drawing (KET, CDXML, a reaction), or each of several files, opens in a tab of its own (the drawing in front
// if it's untouched), with the file as its own: KET is saved into again, another program's file is not written
// over (Save asks where).
export async function openFiles(ed, files, fit, { at = null, asDrawing = false } = {}) {
  for (const file of files) {
    try {
      // a file open already (the same file, where the browser can tell): its tab, not a second one on it
      const open = await tabWith(ed, file.handle);
      if (open) {
        await showTab(ed, open);
        ed.say(t('{file} is open already: its tab is in front.', { file: file.name }));
        continue;
      }
      // a file of the same name open in a tab: maybe this one, maybe another of that name (a browser that hands
      // over the same file under another path each time can't tell: Linux's file dialog portal), so asked
      const named = tabNamed(ed, file.name);
      if (named) {
        const choice = await ask(ed, {
          title: t('{file} is open already?', { file: file.name }),
          text: t('A drawing from a file named {file} is open in a tab already: this file, or another of the same name? Show that tab, or open this file in a tab of its own?', { file: file.name }),
          choices: [{ id: 'cancel', label: t('Cancel') }, { id: 'new', label: t('Open in a tab of its own') }, { id: 'show', label: t('Show its tab'), primary: true }],
        });
        if (choice === 'show') await showTab(ed, named);
        if (choice !== 'new') continue;
      }
      ed.say(t('Opening {file}…', { file: file.name }), 'info', Infinity);
      const { doc, newer } = await readAny(file.text, { name: file.name, settings: ed.settings });
      if (files.length === 1 && !asDrawing && holdsMolecules(file.text, file.name)) {
        ed.setTool({ name: 'place', label: file.name, doc, once: Boolean(at), back: ed.tool });
        if (at) {
          TOOLS.place.hover(ed, at);
          TOOLS.place.click(ed, { start: at });
          ed.say(t('{name} put where it was dropped.', { name: file.name }));
        } else ed.say(t('Click where {name} should go (again for more). Esc when done.', { name: file.name }), 'info', 5000);
        return;
      }
      const own = { name: file.name, format: formatOf(file.name), handle: file.handle ?? null, modified: file.modified ?? null };
      if (!(await openInTab(ed, doc, { title: file.name.replace(/\.[^.]+$/, ''), file: own }))) {
        ed.say(t('Could not open {file} now: finish what is being drawn or typed first.', { file: file.name }), 'error', 6000);
        return;
      }
      inFile(ed, own, drawingNow(ed));
      fit();
      if (newer) ed.say(t('Opened {file}. It was saved by a newer olomol: what this one doesn\'t know isn\'t shown, and is kept when saving.', { file: file.name }), 'info', 8000);
      else ed.say(t('Opened {file}.', { file: file.name }));
    } catch (error) {
      console.warn('[open]', error);
      ed.say(t('Could not open {file}: {reason}', { file: file.name, reason: error.message }), 'error', 8000);
    }
  }
}

// A recent file opened again (the recent-files menu): the file itself where the browser can still reach it (asked
// for once a visit), as a drawing in a tab of its own; else the copy olomol kept of it, as a new drawing not
// tied to the file, if the user wants it (or the entry off the list)
export async function openRecent(ed, entry, fit) {
  if (entry.handle) {
    try {
      const readable = async (handle) => (await handle.queryPermission?.({ mode: 'read' })) === 'granted' || (await handle.requestPermission?.({ mode: 'read' })) !== 'denied';
      if (!(await readable(entry.handle))) throw new Error('no permission to read it');
      await openFiles(ed, [await readGiven(entry.handle)], fit, { asDrawing: true });
      return;
    } catch (error) {
      console.warn('[recent]', error); // (moved, deleted, refused: the copy offered)
    }
  }
  const when = new Date(entry.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const choice = await ask(ed, {
    title: t('{file} can\'t be opened', { file: entry.name }),
    text: entry.ket
      ? t('olomol can\'t open {file} where it was: it was moved, renamed or deleted, or this browser can\'t open files itself. Open the copy olomol kept of it ({date})? It opens as a new drawing, not tied to the file.', { file: entry.name, date: when })
      : t('olomol can\'t open {file} where it was: it was moved, renamed or deleted.', { file: entry.name }),
    choices: [{ id: 'forget', label: t('Take it off the list') }, { id: 'cancel', label: t('Cancel') }, ...(entry.ket ? [{ id: 'copy', label: t('Open the copy'), primary: true }] : [])],
  });
  if (choice === 'forget') await forgetRecent(ed, entry);
  if (choice !== 'copy') return;
  const { doc } = await readAny(entry.ket, { name: 'recent.ket' });
  if (await openInTab(ed, doc, { title: entry.name.replace(/\.[^.]+$/, '') })) {
    fit();
    ed.say(t('Opened the copy of {file} olomol kept.', { file: entry.name }));
  }
}

// Files dropped on the window, or given by the file manager (the installed app, launchQueue): those olomol
// opens read and opened (openFiles); the others said. `given`: handles or Files.
export async function openGiven(ed, given, fit, options) {
  const names = given.map((one) => one.name);
  const refused = names.filter((name) => !opens(name));
  const files = [];
  for (const one of given.filter((g) => opens(g.name))) {
    try {
      files.push(await readGiven(one));
    } catch (error) {
      ed.say(t('Could not open {file}: {reason}', { file: one.name, reason: error.message }), 'error', 8000);
    }
  }
  if (files.length) await openFiles(ed, files, fit, options);
  if (refused.length) ed.say(t('olomol does not open {files}: drawings and molecules only (KET, molfile, SDF, RXN, CDXML, CDX, CML, SMILES, XYZ).', { files: refused.join(', ') }), 'error', 8000);
}

// Asks for a file name (the dialog in App.jsx): resolves to the name
// without extension, or null if cancelled.
function askName(ed, ext, suggested) {
  return new Promise((resolve) => {
    ed.nameRequest = { name: suggested, ext, resolve: (name) => {
      ed.nameRequest = null;
      ed.emit();
      resolve(name);
    } };
    ed.emit();
  });
}

// Saves `content` under a name the user picks: the browser's own save
// dialog where there is one (Chrome, Edge: name and folder), else our
// dialog for the name and then a download (Firefox saves into Downloads,
// or asks, as set in its preferences). Returns the name, or null.
async function saveAs(ed, content, options) {
  return (await pickAndWrite(ed, () => content, options))?.name ?? null;
}

// Asks where (the browser's save dialog, else our name dialog), then writes what `contentFor(name)` gives for the
// name chosen (a drawing holds its name): { name, handle, modified } (handle and modified where the browser
// wrote the file itself; none for a download), or null if cancelled
async function pickAndWrite(ed, contentFor, { ext, mime, description, name: suggested = ed.title }) {
  const blobOf = (content) => (content instanceof Blob ? content : new Blob([content], { type: mime }));
  if (canPick('showSaveFilePicker')) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName: `${suggested}.${ext}`, types: [{ description, accept: { [mime]: [`.${ext}`] } }] });
    } catch (error) {
      if (error.name === 'AbortError') return null;
      console.warn('[save] no save dialog, downloading instead:', error);
    }
    if (handle) {
      const name = handle.name.replace(/\.[^.]+$/, '');
      const content = contentFor(name);
      const modified = await writeFile(handle, typeof content === 'string' ? content : blobOf(content));
      return { name, handle, modified };
    }
  }
  const name = await askName(ed, ext, suggested);
  if (!name) return null;
  download(blobOf(contentFor(name)), `${name}.${ext}`, mime);
  return { name, handle: null, modified: null };
}

// Save (Ctrl+S): into the drawing's own file without asking, if it has one in .olom under its name (io/saving.js),
// else as Save as. Save as (Ctrl+Shift+S, `as`): asks where, and the file chosen is the drawing's from then on.
export async function saveFile(ed, { as = false } = {}) {
  if (isEmpty(ed.doc)) {
    ed.say(t('Nothing to save yet.'));
    return;
  }
  const picker = canPick('showSaveFilePicker');
  const target = as ? (picker ? 'dialog' : 'ask-name') : saveTarget(ed.file, ed.title, { picker });
  const file = ed.file?.name;
  try {
    if (target === 'in-place') return await saveInPlace(ed);
    if (target === 'download') {
      const ket = drawingNow(ed);
      download(new Blob([ket], { type: OLOM.mime }), ed.file.name, OLOM.mime);
      inFile(ed, ed.file, ket);
      ed.say(t('{file} downloaded again: this browser saves files into Downloads, not where the file was.', { file }), 'info', 6000);
      return;
    }
    const drawingId = ed.drawingId;
    let ket = null;
    const picked = await pickAndWrite(ed, (name) => {
      ed.title = name;
      ket = drawingNow(ed);
      return ket;
    }, { ...OLOM, description: t('olomol drawing (.olom)') });
    if (!picked || ed.drawingId !== drawingId) return;
    inFile(ed, { name: `${picked.name}.${OLOM.ext}`, format: OLOM.ext, handle: picked.handle, modified: picked.modified, downloaded: !picked.handle }, ket);
    ed.say(t('Saved {file}.', { file: `${picked.name}.${OLOM.ext}` }));
  } catch (error) {
    savingFailed(ed, error, file);
  }
}

// Writes the drawing into its own file again: asks first if the file changed since olomol last read or wrote it
// (another program, another tab) or is gone
async function saveInPlace(ed) {
  const { file } = ed;
  // (a file kept from an earlier visit may be read and written only once the browser has asked again: else it
  // would seem gone)
  if (!(await mayWrite(file.handle))) {
    savingFailed(ed, { permission: true, message: 'no permission' }, file.name);
    return;
  }
  const now = await lastModified(file.handle);
  if (now === null || (file.modified !== null && now !== file.modified)) {
    const choice = await ask(ed, {
      title: now === null ? t('{file} is not there', { file: file.name }) : t('{file} has changed', { file: file.name }),
      text: now === null
        ? t('{file} can no longer be read: it was moved, renamed or deleted, or olomol may no longer open it. Save the drawing as a new file?', { file: file.name })
        : t('{file} was changed after olomol last opened or saved it, by another program or another olomol tab. Write over it with this drawing, or save this drawing as another file?', { file: file.name }),
      choices: [
        { id: 'cancel', label: t('Cancel') },
        { id: 'as', label: t('Save as…'), primary: now === null },
        ...(now === null ? [] : [{ id: 'over', label: t('Write over it') }]),
      ],
    });
    if (choice === 'as') return saveFile(ed, { as: true });
    if (choice !== 'over') return;
  }
  const ket = drawingNow(ed);
  const modified = await writeFile(file.handle, ket);
  inFile(ed, { ...file, modified }, ket);
  ed.say(t('Saved {file}.', { file: file.name }));
}

// (a warning, not an error: the user is told, and nothing in olomol went wrong: a full disk, a refusal)
function savingFailed(ed, error, file) {
  console.warn('[save]', error);
  ed.say(error.permission ? t('olomol may not write {file}. Save as (Ctrl+Shift+S) saves the drawing elsewhere.', { file })
    : error.mismatch ? t('{file} was not written as it should be: save the drawing again, or as another file (Ctrl+Shift+S).', { file })
    : t('Could not save: {reason}', { reason: error.message }), 'error', 10_000);
}

// The R/S and E/Z labels a picture shows (worked out now, so none is
// missing), or null if no atom or bond asks for one.
async function pictureStereo(ed) {
  return wantsStereo(ed.doc) ? stereoLabels(ed.doc) : null;
}

// A picture made elsewhere (the stick model of Turn in 3D, an SVG) saved as SVG or PNG, named after the drawing
// with `suffix`. Returns the name, or null.
export async function savePicture(ed, svg, format, suffix = '') {
  try {
    return format === 'svg'
      ? await saveAs(ed, svg, { ext: 'svg', mime: 'image/svg+xml', description: t('SVG picture'), name: `${ed.title}${suffix}` })
      : await saveAs(ed, await pngOf(svg, 4), { ext: 'png', mime: 'image/png', description: t('PNG picture'), name: `${ed.title}${suffix}` });
  } catch (error) {
    ed.say(error.message, 'error');
    return null;
  }
}

// Exports the selection (if any) or everything.
// (the background as set in the Export menu, from the search bar too: White background)
export async function exportAs(ed, format, { background = ed.settings.whiteBackground ? '#ffffff' : null, selectionOnly = false } = {}) {
  const ids = selectionOnly && ed.selection.size ? [...new Set([...ed.selection, ...ed.selectedAtoms()])] : null;
  if (isEmpty(ed.doc)) {
    ed.say(t('Nothing to export yet.'));
    return;
  }
  if (format === 'xyz') {
    startXyz(ed, ids);
    return;
  }
  try {
    let name;
    if (format === 'svg' || format === 'png') {
      const svg = svgOf(ed.doc, ed.settings, { ids, background, stereo: await pictureStereo(ed) });
      // the drawing (what is in the picture) inside it, unseen: olomol opens the picture again as it (embedded.js)
      const ket = ids ? partText(ed, ids) : drawingNow(ed);
      name = format === 'svg'
        ? await saveAs(ed, svgWithDrawing(svg, ket), { ext: 'svg', mime: 'image/svg+xml', description: t('SVG picture') })
        : await saveAs(ed, new Blob([pngWithDrawing(new Uint8Array(await (await pngOf(svg, 4, background)).arrayBuffer()), ket)], { type: 'image/png' }), { ext: 'png', mime: 'image/png', description: t('PNG picture') });
    } else {
      const text = await writeAs(ed.doc, format, ids, ed.settings);
      name = await saveAs(ed, text, { ext: FORMATS[format].ext, mime: FORMATS[format].mime, description: FORMATS[format].label });
    }
    if (!name) return;
    const file = `${name}.${format === 'svg' || format === 'png' ? format : FORMATS[format].ext}`;
    // (what the format can't hold, said: the Export menu said it too)
    const lost = format === 'svg' || format === 'png' ? [] : lostIn(ed.doc, format, ids);
    ed.say(lost.length ? t('Exported {file}, without {what}: {format} has no place for them.', { file, what: lost.join(', '), format: FORMATS[format].label }) : t('Exported {file}.', { file }), 'info', lost.length ? 8000 : 3500);
  } catch (error) {
    console.error('[export]', error);
    ed.say(t('Export failed: {reason}', { reason: error.message }), 'error', 8000);
  }
}

// A part of the drawing (its ids) as .olom text
function partText(ed, ids) {
  const part = emptyDoc();
  copyObjects(ed.doc, ids, 0, 0, part);
  // (in the drawing's style, as the picture is)
  if (ed.doc.style) part.style = ed.doc.style;
  if (ed.doc.keptStyle) part.keptStyle = ed.doc.keptStyle;
  return writeOlom(part, { settings: ed.settings, title: ed.title });
}

// Export → PDF / Print…: the drawing (or the selection) alone on a page in the browser's print window, which
// saves it as a PDF or prints it (io/print.js). (The browser check takes the page instead: olomolTestPrint.)
export async function printDrawing(ed, { selectionOnly = false } = {}) {
  if (isEmpty(ed.doc)) {
    ed.say(t('Nothing to print yet.'));
    return;
  }
  const ids = selectionOnly && ed.selection.size ? [...new Set([...ed.selection, ...ed.selectedAtoms()])] : null;
  // (at ACS 1996 size, bonds 14.4 pt, whatever the style on screen)
  const page = printPage(svgOf(ed.doc, ed.settings, { ids, background: null, stereo: await pictureStereo(ed), scale: STYLES.acs.exportScale }), ed.title);
  if (window.olomolTestPrint) {
    window.olomolTestPrint(page);
    return;
  }
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0; visibility: hidden';
  document.body.append(frame);
  frame.contentDocument.open();
  frame.contentDocument.write(page);
  frame.contentDocument.close();
  const gone = () => frame.remove();
  frame.contentWindow.addEventListener('afterprint', gone);
  setTimeout(gone, 10 * 60_000); // (a browser without afterprint)
  frame.contentWindow.focus();
  frame.contentWindow.print();
}

// XYZ coordinates take a while (a large molecule, minutes on a slow computer), so they are worked out in the
// background from a copy of the drawing: ed.xyzJob { status: 'working' | 'ready', started, molecule, molecules,
// text, job, drawn (ed.docVersion then), how ('uff': a metal complex optimised by UFF, no tries), inchikey, open (stereocentres without R/S: the file has one of the
// forms, maybe not the drug meant) } shows in a panel (XyzJob) while the drawing goes on, and Save writes the
// file, a click of its own, as a browser wants for a save dialog. Named by its InChIKey, as drawings of one
// file (and their titles) can differ while molecules can't. A new export replaces one still going.
function startXyz(ed, ids) {
  ed.xyzJob?.job.cancel?.();
  const doc = structuredClone(ed.doc);
  const run = { status: 'working', started: performance.now(), molecule: 0, molecules: 1, tries: 0, text: null, job: {}, drawn: ed.docVersion, inchikey: '', open: 0 };
  ed.xyzJob = run;
  ed.emit();
  chemistryMolfile(doc, ids ? ids.filter((id) => doc.atoms.has(id)) : [...doc.atoms.keys()]).then(identifiers).then(({ inchikey, open }) => {
    Object.assign(run, { inchikey, open });
    if (ed.xyzJob === run) ed.emit();
  }).catch(() => {}); // (no identifiers: the drawing's title, no warning)
  const onProgress = (molecule, molecules, tries, how = null) => {
    Object.assign(run, { molecule, molecules, tries, how });
    if (ed.xyzJob === run) ed.emit();
  };
  writeAs(doc, 'xyz', ids, ed.settings, { job: run.job, onProgress }).then((text) => {
    if (ed.xyzJob !== run) return;
    Object.assign(run, { status: 'ready', text });
    ed.emit();
  }, (error) => {
    if (ed.xyzJob !== run) return;
    if (!error.refused) console.error('[export]', error); // (a refusal is said, not a fault)
    ed.xyzJob = null;
    ed.say(t('Export failed: {reason}', { reason: error.message }), 'error', 8000);
    ed.emit();
  });
}

// Stops it, or lets a finished one go unsaved.
export function dropXyz(ed) {
  const run = ed.xyzJob;
  ed.xyzJob = null;
  run?.job.cancel?.();
  ed.emit();
}

export async function saveXyz(ed) {
  const { text, inchikey } = ed.xyzJob;
  try {
    const name = await saveAs(ed, text, { ext: FORMATS.xyz.ext, mime: FORMATS.xyz.mime, description: FORMATS.xyz.label, name: inchikey || ed.title });
    if (!name) return;
    ed.xyzJob = null;
    ed.emit();
    ed.say(t('Exported {file}.', { file: `${name}.${FORMATS.xyz.ext}` }));
  } catch (error) {
    console.error('[export]', error);
    ed.say(t('Export failed: {reason}', { reason: error.message }), 'error', 8000);
  }
}

// The selection (or everything) as a picture on the clipboard, 4×
// resolution: for pasting into Word, PowerPoint, Docs. Transparent, so it
// sits on a coloured slide too, unless `background` (the Export menu's
// White background).
export async function copyPicture(ed, { background = ed.settings.whiteBackground ? '#ffffff' : null } = {}) {
  if (isEmpty(ed.doc)) {
    ed.say(t('Nothing to copy yet.'));
    return;
  }
  try {
    const ids = ed.selection.size ? [...ed.selection, ...ed.selectedAtoms()] : null;
    const svg = pictureStereo(ed).then((stereo) => svgOf(ed.doc, ed.settings, { ids, background, stereo }));
    // the PNG (the browser writes it anew, without its resolution: pasted, it takes 96 dpi, 4× too large) and, where
    // the browser can, the SVG too, which Word, PowerPoint and others paste as a vector picture at its true size
    const kinds = { 'image/png': svg.then((picture) => pngOf(picture, 4, background)) };
    if (ClipboardItem.supports?.('image/svg+xml')) kinds['image/svg+xml'] = svg.then((picture) => new Blob([picture], { type: 'image/svg+xml' }));
    await navigator.clipboard.write([new ClipboardItem(kinds)]);
    ed.say(ids ? t('The selection is on the clipboard as a picture.') : t('The drawing is on the clipboard as a picture.'));
  } catch (error) {
    console.error('[copy picture]', error);
    ed.say(t("This browser doesn't let us copy pictures ({reason}). Export a PNG instead.", { reason: error.message }), 'error', 6000);
  }
}

// --- clipboard ---

let clipboard = null; // { text, ket, doc }: what we copied last, with everything

// The clipboard type of a copy with everything (KET), next to the text other
// programs paste: olomol pastes it first, also in another tab.
export const OLOMOL_TYPE = 'application/x-olomol-ket';

// The selection for the clipboard: { text, ket }. The text is what other
// programs paste: a molfile if it is only molecules, the words if it is only
// texts (a DOI to look up, H2SO4 without its markup), else KET; `ket`: all
// of it, for olomol.
export function copySelection(ed) {
  if (!ed.selection.size) return null;
  const ids = [...new Set([...ed.selection, ...ed.selectedAtoms()])];
  const part = emptyDoc();
  copyObjects(ed.doc, ids, 0, 0, part);
  const onlyMolecules = !freeIds(part).length && !part.curves.size;
  const onlyTexts = part.texts.size && part.texts.size === freeIds(part).length && !part.atoms.size && !part.curves.size;
  const ket = writeOlom(part, { settings: ed.settings });
  const text = onlyMolecules ? writeMolfile(part).molfile
    : onlyTexts ? [...part.texts.values()].map((x) => parseMarkup(x.text).map((c) => c.ch).join('')).join('\n')
    : ket;
  clipboard = { text, ket, doc: part };
  return { text, ket };
}

// Pastes clipboard text (or our own last copy) as templates are placed: a
// see-through copy follows the pointer (shown first at `at`) and a click
// puts it down, selected; Esc leaves it out.
// Resolves to true when it opened a tab of its own (a link: the caller fits the view to it).
export async function pasteText(ed, text, at) {
  // an olomol link (https://olomol.org/#smiles=…, #d=…, or only its #part): opened, as from the address bar
  const link = olomolLink(text);
  if (link) return openLink(ed, link);
  try {
    let doc;
    if (clipboard && (!text || text === clipboard.text || text === clipboard.ket)) doc = clipboard.doc;
    else if (text?.trim()) ({ doc } = await readAny(text, { settings: ed.settings }));
    else return;
    if (isEmpty(doc)) return;
    ed.setTool({ name: 'place', label: t('the pasted structure'), doc, once: true, back: ed.tool.once ? ed.tool.back : ed.tool });
    TOOLS.place.hover(ed, at);
  } catch (error) {
    console.error('[paste]', error);
    ed.say(t('Could not paste: {reason}', { reason: error.message }), 'error', 6000);
  }
}

// --- PubChem ---

// A link to a compound's PubChem page (`query` as for pageOf): our own
// pubchem.html, which asks PubChem for the compound and goes on to its page.
// The query is after the #, which no server gets to see.
export const pubchemLink = (query) => `pubchem.html#${new URLSearchParams(query)}`;

// --- remembering the drawings in this browser (ui/tabs.js) ---

// The page loads again (another language): every drawing kept first, each comes back as it was seen
export async function reloadKeepingView(ed) {
  checkUnsaved(ed);
  await keepDrawing(ed);
  location.reload();
}

// --- links ---

// Copies a link that opens this drawing (it travels inside the link itself).
export async function copyLink(ed) {
  try {
    const link = await linkTo(ed.doc, { settings: ed.settings, title: ed.title });
    await navigator.clipboard.writeText(link);
    const size = Math.round(link.length / 1000);
    ed.say(size > 30 ? t('Link copied ({n} k characters: some chat programs cut links this long).', { n: size }) : t('Link copied: it opens this drawing for whoever you send it to.'), 'info', 6000);
  } catch (error) {
    ed.say(t('Could not make a link: {reason}', { reason: error.message }), 'error');
  }
}

// Opens the drawing of a link (#d=…), replacing the current one (Ctrl+Z
// brings that back); the link's part is then taken off the address. A link with structures in it (#smiles=…,
// ?name=…: written by hand or by a chatbot, llms.txt) opens each in a tab of its own.
// `href`: a link given otherwise (pasted into the search bar or onto the canvas: the installed app has no address
// bar), the address left as it is then.
export async function openLink(ed, href = null) {
  const own = href === null;
  const link = own ? location.href : href;
  if (structuresIn(link).length) return openStructures(ed, link, own);
  let busy = false;
  try {
    const ket = await drawingIn(new URL(link).hash);
    if (!ket) return false;
    const { doc, title } = await readAny(ket, { name: 'link.ket' });
    // (not now: a text being typed, a window open; the link stays in the address to be opened again)
    if (!(await openInTab(ed, doc, { title: title || newTitle() }))) {
      busy = true;
      ed.say(t('The link is not opened while a text is typed or a window is open: finish that, then press Enter in the address bar again.'), 'error', 8000);
      return false;
    }
    ed.say(t('Opened the drawing from the link in a tab of its own.'), 'info', 6000);
    return true;
  } catch (error) {
    ed.say(t('Could not open the drawing in this link: {reason}', { reason: error.message }), 'error', 6000);
    return false;
  } finally {
    if (own && !busy) history.replaceState(null, '', location.href.split('#')[0]);
  }
}

// The structures a link asks for, each in a tab of its own (a SMILES or InChI drawn here; a name or a PubChem
// number looked up on PubChem); one that can't be drawn is said, with why, the others still opened
async function openStructures(ed, link, own) {
  const wanted = structuresIn(link);
  if (own) history.replaceState(null, '', withoutStructures(location.href));
  let opened = 0;
  for (const { kind, value, title } of wanted) {
    try {
      let text = value;
      let name = title;
      if (kind === 'name' || kind === 'cid') {
        ed.say(t('Looking up {name} on PubChem…', { name: value }), 'info', Infinity);
        const found = await lookUp(kind === 'cid' ? `CID ${value}` : value);
        text = found.smiles;
        name ??= found.title;
      }
      if (kind === 'inchi' && !text.startsWith('InChI=')) text = `InChI=${text}`;
      const { doc } = await readAny(text, { name: kind === 'inchi' ? 'link.inchi' : 'link.smi', settings: ed.settings });
      if (isEmpty(doc)) throw new Error(t('nothing to draw'));
      if (await openInTab(ed, doc, { title: name || newTitle() })) opened += 1;
    } catch (error) {
      console.warn('[link]', error);
      ed.say(t('Could not draw {what} from the link: {reason}', { what: value.length > 40 ? `${value.slice(0, 40)}…` : value, reason: error.message }), 'error', 10_000);
      return opened > 0;
    }
  }
  if (opened) ed.say(opened > 1 ? t('Opened {n} drawings from the link, each in a tab of its own.', { n: opened }) : t('Opened the structure from the link.'), 'info', 5000);
  return opened > 0;
}

// The horizontal/vertical button: with one bond selected (perhaps with its two atoms, as a box takes
// them) its whole molecule turns at once (again: a quarter further); else the tool, to click a bond
// with, on or off.
export function snapPressed(editor) {
  const ids = [...editor.selection];
  const bonds = ids.filter((id) => editor.doc.bonds.has(id));
  const bond = bonds.length === 1 ? editor.doc.bonds.get(bonds[0]) : null;
  if (bond && ids.every((id) => id === bond.id || id === bond.a || id === bond.b)) snapBond(editor, bond.id, { whole: true });
  else editor.setTool(editor.tool.name === 'snapBond' ? { name: 'select' } : { name: 'snapBond' });
}
