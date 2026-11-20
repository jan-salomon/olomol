// The whole window: canvas, toolbars, the selection panel, dialogs, keys
// and the clipboard.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { snapBond } from '../arrange/align.js';
import { abbreviateSelection, chemistryMolfile } from '../editor/abbreviate.js';
import { selectedItems } from '../arrange/items.js';
import { Editor } from '../editor/editor.js';
import { pickElement, TOOLS } from '../editor/tools.js';
import { downloads, onDownloads } from '../io/download.js';
import { writeMolfile } from '../io/molfile.js';
import { addAtom, addBond, emptyDoc, isEmpty } from '../model/doc.js';
import { drawingText } from '../io/saving.js';
import { fragments } from '../model/graph.js';
import { getRDKit } from '../io/rdkit.js';
import { svgOf, writeAs } from '../io/files.js';
import { linkTo } from '../io/link.js';
import { language, t } from '../i18n/i18n.js';
import { checkUnsaved, copySelection, OLOMOL_TYPE, openGiven, openLink, pasteText, saveFile } from './actions.js';
import { keepOnLeaving, keepSoon, restoreTabs, shownTitle, watchOtherWindows } from './tabs.js';
import { Tabs } from './Tabs.jsx';
import { Dock, HelpButton, Rail, TopBar, TopRight, VersionMark } from './Bars.jsx';
import Canvas from './Canvas.jsx';
import DebugPanel from './DebugPanel.jsx';
import { ContextMenu } from './ContextMenu.jsx';
import { ShowBar, useShow } from './Show.jsx';
import { About, NameDialog, PeriodicTable, QuestionDialog, Report, Shortcuts, StyleDialog, VersionsDialog } from './Dialogs.jsx';
import { loadRecent } from './history.js';
import Inspector from './Inspector.jsx';
import { ObjectsPanel } from './ObjectsPanel.jsx';
import { handleKey, mainHint, toolHint } from './keys.js';
import LayoutDialog from './LayoutDialog.jsx';
import Turn3D from './Turn3D.jsx';
import XyzJob from './XyzJob.jsx';
import EmptyExample from './EmptyExample.jsx';
import ExamplesWindow from './ExamplesWindow.jsx';
import Templates from './Templates.jsx';
import './app.css';

export const editor = new Editor();
// for the browser tests (scripts/browser-check.mjs)
if (import.meta.env.DEV || new URLSearchParams(location.search).has('test')) {
  window.olomol = editor;
  window.olomolTest = {
    molfile: () => writeMolfile(editor.doc).molfile,
    // each molecule on its own, abbreviations drawn out (a drawing too large for one V2000 molfile: ChemDraw's templates)
    molfiles: () => Promise.all(fragments(editor.doc).map((members) => chemistryMolfile(editor.doc, members))),
    // the drawing as its SVG export (the report of other programs' files: scripts/other-programs-report.mjs)
    svg: () => svgOf(editor.doc, editor.settings),
    itemBoxes: () => selectedItems(editor, editor.doc).map((item) => item.box()),
    snapBond: (id) => snapBond(editor, id),
    abbreviate: (ids) => abbreviateSelection(editor, ids),
    // the molecule as identified (abbreviations drawn out): what Info and PubChem get
    chemistry: () => chemistryMolfile(editor.doc, [...editor.doc.atoms.keys()]),
    // what Ctrl+V and a click in the middle do with text (Firefox ignores the text of synthetic paste events)
    paste: async (text) => {
      const at = editor.viewCentre(window.innerWidth, window.innerHeight);
      await pasteText(editor, text, at);
      if (editor.tool.name === 'place') TOOLS.place.click(editor, { start: at });
    },
    writeAs: (format) => writeAs(editor.doc, format, null, editor.settings),
    // saving (scripts/check/12-saving.mjs): what Save writes now, whether there are changes the file doesn't
    // have (worked out at once, not a moment after), the drawing's own file
    ket: () => {
      void editor.scene; // (texts and arrows in their places, as Save has them)
      return drawingText(editor.doc, editor.settings, editor.title);
    },
    unsaved: () => {
      checkUnsaved(editor);
      return editor.unsaved;
    },
    file: () => (editor.file ? { ...editor.file, handle: Boolean(editor.file.handle) } : null),
    save: (as = false) => saveFile(editor, { as }),
    // the tabs (scripts/check/13-tabs.mjs): each one's id, name, unsaved, whether in front
    tabs: () => editor.tabs.map((tab) => ({ id: tab.id, title: tab.id === editor.drawingId ? editor.title : tab.title, unsaved: tab.id === editor.drawingId ? editor.unsaved : tab.unsaved, front: tab.id === editor.drawingId })),
    link: () => linkTo(editor.doc, { settings: editor.settings, title: editor.title }),
    // the 3D model of the one molecule selected (Turn in 3D's): its atoms' points in molfile order, and whether
    // the conformation drawn was found
    model3D: async () => {
      const { model3D, prepare, relayoutTargets } = await import('../layout/relayout.js');
      const job = await prepare(editor, relayoutTargets(editor));
      const [molecule] = job.molecules;
      const model = await model3D(job, molecule);
      return { atomIds: molecule.atomIds, points: model.points, reason: model.reason ?? null, conformationLost: Boolean(model.conformationLost) };
    },
    // for scripts that test Redraw: a SMILES pasted, then every Redraw engine run on it as
    // the Redraw window runs them; the candidates, the engines skipped (a dropped one with its drawings and the
    // SMILES they would mean), the drawing it started from, and each drawing as put in (withCandidate)
    redraw: async (smiles) => {
      const { prepare, relayoutTargets, runEngines, withCandidate } = await import('../layout/relayout.js');
      const RDKit = await getRDKit();
      editor.setDoc(emptyDoc());
      await window.olomolTest.paste(smiles);
      const job = await prepare(editor, relayoutTargets(editor));
      const view = await runEngines(editor, job, () => {}, () => false);
      const atomIds = job.molecules.flatMap((m) => m.atomIds);
      const shown = (doc) => {
        const mol = RDKit.get_mol(writeMolfile(doc, atomIds).molfile);
        const meant = mol?.get_smiles() ?? null;
        mol?.delete();
        return { meant, atoms: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]), bonds: [...doc.bonds.values()].map((b) => [b.a, b.b, b.order, b.stereo ?? '', b.z ?? null]) };
      };
      const picture = (drawings) => shown(withCandidate(editor.doc, job, { drawings }));
      return {
        smiles: job.molecules.map((m) => m.smiles).join('.'), atomIds, elements: atomIds.map((id) => editor.doc.atoms.get(id).el),
        doc: { atoms: [...editor.doc.atoms.values()], bonds: [...editor.doc.bonds.values()] },
        start: shown(editor.doc),
        candidates: view.candidates.map(({ label, also, problems, score, parts, ms, drawings }) => ({ label, also: also ?? [], problems, score, parts, ms, ...picture(drawings) })),
        skipped: view.skipped.map(({ label, reason, dropped, drawings }) => ({ label, reason, dropped: Boolean(dropped), ...(drawings ? picture(drawings) : {}) })),
      };
    },
    // to build what no SMILES can say (dative bonds)
    addAtom,
    addBond,
  };
}

const THEME_KEY = 'olomol-theme';

function useTheme() {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) ?? 'light'; // (light at the start; dark or the system's when chosen)
    } catch {
      return 'light';
    }
  });
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const resolved = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;
  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.resolvedTheme = resolved;
  }, [theme, resolved]);
  const setTheme = (value) => {
    setThemeState(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      // not remembered
    }
  };
  return [theme, setTheme, resolved === 'dark'];
}

// the engines, the first time they are needed (src/io/download.js)
const LOADING = {
  RDKit: () => t('Loading the chemistry engine (RDKit)…'),
  Indigo: () => t('Loading the file converter (Indigo)…'),
  OpenChemLib: () => t('Loading the 3D engine (OpenChemLib)…'),
};
const percent = new Intl.NumberFormat(language, { style: 'percent' });

function Downloads() {
  const going = useSyncExternalStore(onDownloads, downloads);
  if (!going.length) return null;
  return (
    <div className="glass downloads">
      {going.map(({ name, done }) => (
        <div key={name} role="progressbar" aria-label={LOADING[name]()} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)}>
          <span>{LOADING[name]()}</span>
          <span className="share">{percent.format(done)}</span>
          <div className="bar"><div style={{ width: `${done * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

export default function App() {
  useSyncExternalStore((listener) => editor.subscribe(listener), () => editor.version);
  const [dialog, setDialog] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { at, point, hit } while the right-click menu is open
  const show = useShow(editor); // Show: the drawings alone, full screen (Show.jsx)
  const showRef = useRef(show);
  showRef.current = show;
  const [theme, setTheme, dark] = useTheme();
  const fit = useCallback(() => {
    // the space between the bars (and the panel, when it is open)
    const edge = (selector, side, fallback) => document.querySelector(selector)?.getBoundingClientRect()[side] ?? fallback;
    const [left, top] = [edge('.rail', 'right', 0) + 8, Math.max(edge('.topbar', 'bottom', 0), edge('.tabs', 'bottom', 0)) + 8];
    const right = Math.min(edge('.inspector', 'left', window.innerWidth), edge('.topright', 'right', window.innerWidth)) - 8;
    const bottom = edge('.dock', 'top', window.innerHeight) - 8;
    editor.fit(Math.max(100, right - left), Math.max(100, bottom - top), { left, top, selected: true });
  }, []);
  const centre = () => editor.viewCentre(window.innerWidth, window.innerHeight);

  // the drawings from last time, and remembering them
  useEffect(() => {
    // every drawing kept (as tabs, each as it was seen), then one a link brings (in a tab of its own)
    loadRecent(editor);
    restoreTabs(editor).then(async ({ found, view, elsewhere }) => {
      // (drawings open in another window of olomol stay there: said, so none seems lost)
      if (elsewhere) editor.say(t('Drawings open in another olomol window stay there ({n}); close that window to have them here.', { n: elsewhere }), 'info', 8000);
      const linked = await openLink(editor);
      if (linked || (found && !view)) fit();
    });
    // a link pasted into the address bar of a window where olomol is open already: only its #part changes, and
    // the browser doesn't load the page again, so it is read here (a drawing #d=…, structures #smiles=…)
    const linkPasted = async () => {
      if (await openLink(editor)) fit();
    };
    window.addEventListener('hashchange', linkPasted);
    let checking = null;
    let last = editor.docVersion;
    let lastTitle = editor.title;
    const pageTitle = document.title; // (the app's own, for a new drawing: what search engines read)
    const unsubscribe = editor.subscribe(() => {
      // the browser tab: the drawing's name, • for changes not in its file yet
      document.title = isEmpty(editor.doc) && !editor.file ? pageTitle : `${editor.unsaved ? '• ' : ''}${shownTitle(editor.title)} – olomol`;
      if (editor.docVersion === last && editor.title === lastTitle) return;
      last = editor.docVersion;
      lastTitle = editor.title;
      // whether the file has it all: a moment after a change (a drag changes it at every step)
      clearTimeout(checking);
      checking = setTimeout(() => checkUnsaved(editor), 250);
      keepSoon(editor); // (kept in the browser a moment later, ui/tabs.js)
    });
    const unwatch = watchOtherWindows(editor);
    // the page going away (closed, reloaded, the browser quitting) or hidden: a change not kept yet kept now
    const now = () => keepOnLeaving(editor);
    const hidden = () => document.visibilityState === 'hidden' && now();
    // (where this browser keeps nothing, a private window or full storage: the browser asks before the drawings go)
    const leaving = (e) => {
      now();
      if ((editor.keeping === 'failed' || editor.keepingFails) && (!isEmpty(editor.doc) || editor.tabs.length > 1)) {
        e.preventDefault();
        e.returnValue = ''; // (older browsers)
      }
    };
    window.addEventListener('pagehide', now);
    window.addEventListener('beforeunload', leaving);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      unsubscribe();
      unwatch();
      window.removeEventListener('hashchange', linkPasted);
      window.removeEventListener('pagehide', now);
      window.removeEventListener('beforeunload', leaving);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [fit]);

  // keys
  const searchField = useRef(null); // (the search bar's field: / goes there)
  const dialogOpen = useRef(false);
  dialogOpen.current = Boolean(dialog);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Shift') editor.setShift(true);
      if (e.key === 'Control' || e.key === 'Meta') editor.setCtrl(true);
      if (typing() || editor.editing || dialogOpen.current || editor.question || editor.nameRequest) return; // (a dialog holds ids of what is drawn: Delete, Ctrl+Z behind it would pull them away)
      // showing: the keys step through the drawings (or leave); none of the drawing's keys
      if (editor.showing) {
        if (showRef.current.key(e) || !(e.ctrlKey || e.metaKey)) e.preventDefault();
        return;
      }
      if (handleKey(editor, e, { fit, help: () => setDialog('keys'), fromName: () => searchField.current?.focus(), templates: () => setDialog('templates') })) e.preventDefault();
    };
    const onKeyUp = (e) => {
      if (e.key === 'Shift') editor.setShift(false);
      if (e.key === 'Control' || e.key === 'Meta') editor.setCtrl(false);
    };
    const onBlur = () => editor.setCtrl(false); // (Ctrl let go in another window)
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [fit]);

  // a key or a click anywhere first finishes a ring flip's animation (900 ms), so that what reads the drawing
  // (Ctrl+S, Ctrl+C, Export, Turn in 3D, Redraw, Info) has it as it ends, not half flipped
  useEffect(() => {
    const finish = () => editor.finishAnimation();
    window.addEventListener('keydown', finish, true);
    window.addEventListener('pointerdown', finish, true);
    return () => {
      window.removeEventListener('keydown', finish, true);
      window.removeEventListener('pointerdown', finish, true);
    };
  }, []);

  // files dropped on the window: opened (one of molecules put where it was dropped), in Chrome and Edge with the
  // file itself, to save into again; and those the installed app is given by the file manager (launchQueue,
  // manifest file_handlers), each in a tab of its own
  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    const files = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    let left = null;
    const over = (e) => {
      if (!files(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      clearTimeout(left);
      setDropping(true);
    };
    const leave = () => {
      clearTimeout(left);
      left = setTimeout(() => setDropping(false), 80); // (dragleave comes for every element crossed)
    };
    const drop = async (e) => {
      if (!files(e)) return;
      e.preventDefault();
      setDropping(false);
      // (the items only during the event: the handles asked for at once, read after)
      const items = [...e.dataTransfer.items].filter((item) => item.kind === 'file');
      const asked = items.map((item) => Promise.resolve(item.getAsFileSystemHandle?.()).catch(() => null));
      const plain = items.map((item) => item.getAsFile());
      const handles = await Promise.all(asked);
      const given = plain.map((file, i) => (handles[i]?.kind === 'file' ? handles[i] : file)).filter(Boolean);
      const { scale, tx, ty } = editor.view;
      await openGiven(editor, given, fit, { at: [(e.clientX - tx) / scale, (e.clientY - ty) / scale] });
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.launchQueue?.setConsumer((params) => {
      if (params.files?.length) openGiven(editor, [...params.files], fit);
    });
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [fit]);

  // clipboard
  useEffect(() => {
    const onCopy = (e) => {
      if (typing()) return;
      const copied = copySelection(editor);
      if (!copied) return;
      e.preventDefault();
      // the text other programs paste (a text's words, a molecule's molfile); all of it for olomol
      e.clipboardData.setData('text/plain', copied.text);
      e.clipboardData.setData(OLOMOL_TYPE, copied.ket);
      if (e.type === 'cut') editor.deleteSelection();
    };
    const onPaste = (e) => {
      if (typing()) return;
      e.preventDefault();
      // Linux pastes the selected text on a middle click: that is panning here
      if (performance.now() - (editor.middleClickAt ?? -Infinity) < 500) return;
      const text = e.clipboardData.getData(OLOMOL_TYPE) || e.clipboardData.getData('text/plain');
      // files and no text (copied in the file manager, a picture olomol exported): opened as if dropped; something
      // else (a picture from another program): said, not this app's last copy pasted instead
      if (!text && e.clipboardData.files?.length) {
        openGiven(editor, [...e.clipboardData.files], fit, { at: editor.pointer ?? centre() });
        return;
      }
      if (!text && e.clipboardData.types.length) {
        editor.say(t('Nothing to paste: copy a drawing, a molecule (SMILES, molfile) or a text. Open a file with Ctrl+O, or drop it here.'));
        return;
      }
      // a see-through copy, at first under the pointer (or in the middle of the view)
      pasteText(editor, text, editor.pointer ?? centre()).then((opened) => opened && fit());
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  return (
    <>
      <Canvas editor={editor} dark={dark} onContextMenu={setContextMenu} />
      {show.showing && <ShowBar editor={editor} show={show} />}
      {contextMenu && <ContextMenu editor={editor} ui={{ fit, show: setDialog, present: show.start }} {...contextMenu} onClose={() => setContextMenu(null)} />}
      <TopBar editor={editor} fit={fit} onRelayout={() => setDialog('layout')} onTurn3D={() => setDialog('turn3d')} onVersions={() => setDialog('versions')} onShow={show.start} />
      <Tabs editor={editor} blocked={Boolean(dialog)} />
      <TopRight editor={editor} theme={theme} setTheme={setTheme} onReport={() => setDialog('report')} onCustomStyle={() => setDialog('style')} />
      <Rail editor={editor} />
      <Dock editor={editor} dark={dark} onPeriodicTable={() => setDialog('periodic')} onTemplates={() => setDialog('templates')} ui={{ fit, show: setDialog, present: show.start }} searchField={searchField} />
      <Inspector editor={editor} short={editor.debug} />
      <ObjectsPanel editor={editor} />
      <HelpButton onHelp={() => setDialog('examples')} />
      <VersionMark onAbout={() => setDialog('about')} />
      {editor.debug && <DebugPanel editor={editor} />}
      {isEmpty(editor.doc) && !editor.gesture && !editor.editing && !dialog && <EmptyExample editor={editor} dark={dark} />}
      <div className="messages">
        <Downloads />
        <XyzJob editor={editor} />
        {editor.notice && (
          <div key={editor.notice.id} className={`glass notice ${editor.notice.kind}`} role="status">{editor.notice.text}</div>
        )}
      </div>
      {dialog === 'layout' && <LayoutDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === 'turn3d' && <Turn3D editor={editor} dark={dark} onClose={() => setDialog(null)} />}
      {dialog === 'examples' && <ExamplesWindow editor={editor} dark={dark} fit={fit} onClose={() => setDialog(null)} onKeys={() => setDialog('keys')} onReport={() => setDialog('report')} onAbout={() => setDialog('about')} />}
      {dialog === 'periodic' && (
        <PeriodicTable onClose={() => setDialog(null)} onPick={(el) => {
          pickElement(editor, el);
          setDialog(null);
        }} />
      )}
      {dialog === 'about' && <About onClose={() => setDialog(null)} onShortcuts={() => setDialog('keys')} />}
      {dialog === 'keys' && <Shortcuts onClose={() => setDialog(null)} />}
      {dialog === 'versions' && <VersionsDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === 'style' && <StyleDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === 'report' && <Report editor={editor} onClose={() => setDialog(null)} />}
      {dialog === 'templates' && <Templates editor={editor} onClose={() => setDialog(null)} />}
      {editor.nameRequest && <NameDialog key={editor.nameRequest.ext + editor.nameRequest.name} request={editor.nameRequest} />}
      {editor.question && <QuestionDialog question={editor.question} />}
      {dropping && <div className="drop-here" data-testid="drop-here"><div className="glass">{t('Drop to open: drawings in tabs of their own, molecules where they are dropped')}</div></div>}
      {!editor.gesture && !editor.editing && !dialog && (
        <div className="tool-hint" aria-live="polite">
          {/* (one line: what the tool mostly does; all of it, and the kinds behind the button's corner, in the
              button's tooltip; the keys on the sheet, ?) */}
          {mainHint(toolHint(editor.tool))} · <kbd>?</kbd> {t('all keys')}
        </div>
      )}
    </>
  );
}
