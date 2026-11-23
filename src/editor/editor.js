// The editor: the document, what is selected, the view (zoom and pan), the
// active tool, undo and redo. The canvas (ui/Canvas.jsx) hands it pointer
// and key events; the tools (tools.js) change the document through it; the
// rest of the interface reads its state and listens for changes.
import { dropStaleMarks, marksKey } from '../chem/delocalize.js';
import { stereoLabels, wantsStereo } from '../chem/stereo.js';
import { bondsByAtom, cloneDoc, completeDoc, deleteObjects, emptyDoc, getObject, kindOf, KINDS, moveObjects, pruneFills } from '../model/doc.js';
import { bracketFits, buildScene, DEFAULT_SETTINGS, keepDrawnCurves } from '../render/scene.js';
import { applyStyle, defaultStyleOf, styleOf } from '../render/style.js';
import { fragments } from '../model/graph.js';
import { hitTest } from './hit.js';
import { TOOLS } from './tools.js';
import { takeOff } from './tools/select.js';
import { dropPartedNewmans, endOnBonds } from '../chem/newman.js';
import { keepFischer } from '../chem/fischer.js';
import { pruneGroups } from './grouping.js';
import { overfullLabel } from '../chem/abbreviations.js';
import { t } from '../i18n/i18n.js';
import { allOn, allowed, EMBED_LOOK, EMBEDDED, lockedAtoms, lockedTouched, refusal, startingTool, switchedOff, toolAllowed, toolPart } from '../features.js';

const HISTORY = 200;

// A name for a new drawing, with date and time so files don't overwrite each other.
// Whether a name is still the one a new drawing got (newTitle): shown as "New drawing" (shownTitle, ui), and the
// suggested name of its file when it is saved, so that no file is written over
export const isNewTitle = (title) => /^drawing-\d{4}-\d{2}-\d{2}-\d{4}$/.test(title ?? '');

export function newTitle(date = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `drawing-${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}`;
}
const SETTINGS_KEY = 'olomol-settings';

function loadSettings() {
  if (EMBEDDED) return { ...DEFAULT_SETTINGS, ...EMBED_LOOK }; // (an embedded editor: as set for everyone, and as its address asks; not this browser's olomol.org settings)
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// The abbreviations on more bonds than one (Ph with two): Map id -> how many.
function overfullLabels(doc) {
  const byAtom = bondsByAtom(doc);
  const found = new Map();
  for (const atom of doc.atoms.values()) {
    const bonds = byAtom.get(atom.id);
    if (overfullLabel(atom, bonds)) found.set(atom.id, bonds.filter((b) => b.kind !== 'hbond' && b.kind !== 'link').length);
  }
  return found;
}

// What a drawing covers, with a margin of a bond length: [x1, x2, y1, y2] in the drawing's units, or null if
// nothing of it has a place (`only`: these objects' ids)
// (`scene`: the drawing as drawn, a text measured by its box there, all its lines; without it, a text's longest
// line: a long note was counted as one line of all its paragraphs, Fit zoomed out to 19 %)
export function boundsOf(doc, only = null, scene = null) {
  const shown = (object) => !only || only.has(object.id);
  const points = [];
  for (const atom of doc.atoms.values()) if (shown(atom)) points.push([atom.x, atom.y]);
  for (const a of [...doc.arrows.values(), ...doc.brackets.values()]) if (shown(a)) points.push([a.x1, a.y1], [a.x2, a.y2]);
  for (const p of doc.pluses.values()) if (shown(p)) points.push([p.x, p.y]);
  for (const t of doc.texts.values()) {
    if (!shown(t)) continue;
    const box = scene?.texts?.get(t.id)?.box;
    if (box) points.push([box.x1, box.y1], [box.x2, box.y2]);
    else {
      const lines = t.text.split('\n');
      points.push([t.x, t.y], [t.x + Math.max(...lines.map((line) => line.length)) * 0.3, t.y + (lines.length - 1) * 0.6]);
    }
  }
  // (3D models with their balls: their box, as the scene has it)
  for (const m of doc.models?.values() ?? []) {
    if (!shown(m)) continue;
    const box = scene?.models?.get(m.id)?.box;
    points.push(...(box ? [[box.x1, box.y1], [box.x2, box.y2]] : [[m.x, m.y]]));
  }
  // (curved arrows as drawn: one bowing far out of the molecules was cut off by Fit)
  for (const [id, curve] of scene?.curves ?? []) if (shown({ id })) points.push(...curve.samples);
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1];
}

export class Editor {
  constructor() {
    this.doc = emptyDoc();
    this.selection = new Set();
    this.hover = null; // what is under the pointer (a hitTest result)
    this.preview = null; // a tool's preview: { kind, ... } drawn by the canvas
    this.view = { scale: 42, tx: 400, ty: 300 };
    this.settings = loadSettings();
    applyStyle(this.settings);
    this.tool = startingTool(); // (embedded with bonds switched off, features.js: curved arrows, else Select)
    this.debug = false;
    this.undoStack = [];
    this.redoStack = [];
    this.checkpoints = 0; // counts them (an action refused goes back to where it began)
    this.version = 0;
    this.listeners = new Set();
    this.notice = null;
    this.gesture = null;
    this.shiftHeld = false;
    this.sceneCache = null;
    this.docVersion = 0; // counts changes of the document
    this.stereo = null; // R/S and E/Z labels, when shown: { atoms, bonds, version }
    this.title = newTitle(); // the drawing's name, for files
    this.nameRequest = null; // a save waiting for a file name: { name, ext, resolve }
    this.question = null; // a choice to make in a dialog: { title, text, choices: [{ id, label, primary }], resolve }
    // the drawing's own file (io/saving.js): its id (which drawing the browser keeps the file of), the file
    // ({ name, format, handle, modified, downloaded }, null for a new drawing), the KET it holds as olomol last
    // wrote or read it (null: none), and whether the drawing has changes the file doesn't (checkUnsaved)
    this.drawingId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    this.file = null;
    this.savedKet = null;
    this.unsaved = false;
    // the drawings open (ui/tabs.js): this one, at first
    this.tabs = [{ id: this.drawingId, title: this.title, unsaved: false, keeping: null, own: null }];
    this.switching = false;
    this.marks = ''; // marksKey of the document when its delocalized bonds were last checked
    this.animation = null; // atoms moving (a ring flip): { frame, finish }
  }

  // --- listening ---

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    this.version += 1;
    for (const listener of this.listeners) listener(this.version);
  }

  // The drawing worked out for display (labels, bonds, arrows), cached.
  get scene() {
    // the latest R/S labels, even if a change is still being looked at (no flicker while dragging)
    const stereo = this.stereo;
    this.applyDrawingStyle();
    const key = `${this.docVersion}|${this.debug}|${stereo?.version}|${this.styleKey}`;
    if (this.sceneCache?.key !== key) {
      const started = performance.now();
      let scene = buildScene(this.doc, this.settings, { debug: this.debug, stereo });
      // a reaction arrow as long as its side arcs need, or as drawn (then drawn again)
      if (scene.arrowFits.length) {
        for (const [id, ends, own] of scene.arrowFits) {
          const arrow = this.doc.arrows.get(id);
          Object.assign(arrow, ends);
          if (own === null) delete arrow.ownLength;
          else arrow.ownLength = own;
        }
        scene = buildScene(this.doc, this.settings, { debug: this.debug, stereo });
      }
      // molecules on an arrow go where the arrow puts them, brackets made round atoms fit them (then drawn again)
      const fits = scene.arrowMoves.length ? [] : bracketFits(this.doc, scene);
      if (scene.arrowMoves.length || fits.length) {
        for (const { atoms, dx, dy } of scene.arrowMoves) moveObjects(this.doc, atoms, dx, dy);
        for (const [id, box] of fits) Object.assign(this.doc.brackets.get(id), box);
        scene = buildScene(this.doc, this.settings, { debug: this.debug, stereo });
        const more = bracketFits(this.doc, scene); // (after a move along an arrow)
        if (more.length) {
          for (const [id, box] of more) Object.assign(this.doc.brackets.get(id), box);
          scene = buildScene(this.doc, this.settings, { debug: this.debug, stereo });
        }
      }
      this.sceneCache = { key, scene, ms: performance.now() - started };
      // texts on an anchor (of a molecule or an arrow) keep the place it gives them (for files, boxes, moving)
      for (const [id, placed] of scene.texts) {
        const text = this.doc.texts.get(id);
        if (placed.anchored && text) [text.x, text.y] = placed.at;
      }
      keepDrawnCurves(this.doc, scene);
    }
    return this.sceneCache.scene;
  }

  // R/S and E/Z labels come from RDKit, a little after each change, when
  // an atom or bond asks for its label.
  updateStereo() {
    clearTimeout(this.stereoTimer);
    if (!wantsStereo(this.doc)) return;
    this.stereoTimer = setTimeout(async () => {
      const version = this.docVersion;
      try {
        const labels = await stereoLabels(this.doc);
        if (version !== this.docVersion) return;
        this.stereo = { ...labels, version };
        this.emit();
      } catch (error) {
        console.error('[stereo labels]', error);
      }
    }, 150);
  }

  // --- changing the document ---

  // Runs `change(doc)` as one undo step. Returns its result. (`lastRefused`: whether it was refused and undone, for
  // a tool not to say it was done)
  change(change) {
    const before = this.labelsNow();
    this.checkpoint();
    const result = change(this.doc);
    this.touched();
    this.lastRefused = this.refuseChange(before);
    return result;
  }

  // An abbreviation can't take a second bond (Ph is C6H5, on one bond): an action that gives one to a label
  // drawn before (a bond grown from it or pulled onto it, a group, ring or atom merged onto it, a label typed on
  // an atom with two bonds) is undone, with a word why. One drawn so already (an older file) is ringed red.
  // With parts of olomol switched off (an embedded editor, features.js), also the drawing as it was, for a change
  // touching one of them to be refused.
  labelsNow() {
    return { over: overfullLabels(this.doc), atoms: new Set(this.doc.atoms.keys()), checkpoints: this.checkpoints, version: this.docVersion, redo: this.redoStack, doc: allOn() && !lockedAtoms().size ? null : cloneDoc(this.doc) };
  }

  // A change refused (undone, said why): one touching a part switched off or an atom the page locked, or one
  // overfilling a label
  refuseChange(before) {
    if (this.docVersion === before.version) return false;
    const part = before.doc && switchedOff(before.doc, this.doc);
    if (part || (before.doc && lockedTouched(before.doc, this.doc))) {
      this.goBack(before);
      this.say(part ? refusal(part) : t('This structure is given: it stays as it is here.'), 'error');
      return true;
    }
    return this.refuseOverfull(before);
  }

  refuseOverfull(before) {
    const now = overfullLabels(this.doc);
    const worse = [...now].find(([id, n]) => before.atoms.has(id) && n > (before.over.get(id) ?? 0));
    if (!worse) return false;
    const label = this.doc.atoms.get(worse[0]).alias; // (before it goes: Ph typed on a carbon is a carbon again)
    this.goBack(before);
    this.say(t('{label} stands for a group on one bond, so it can\'t take another. Draw it out (in the panel) to bond to its atoms.', { label }), 'error');
    return true;
  }

  // Back to where `before` (labelsNow) was: the undo steps since then taken away, the drawing as it was
  goBack(before) {
    let state = null;
    for (let n = this.checkpoints - before.checkpoints; n > 0 && this.undoStack.length; n--) state = this.undoStack.pop();
    if (this.shiftedOff?.at > before.checkpoints) this.undoStack.unshift(this.shiftedOff.state);
    this.shiftedOff = null;
    this.checkpoints = before.checkpoints;
    // (and what could be redone before it: a refused action leaves the history as it was)
    this.redoStack = before.redo ?? this.redoStack;
    if (state) this.restore(state);
  }

  // A Fischer projection's centres that are crossings no more (a bond bent, the chain turned onto its side):
  // drawings again, and said so; crossings drawn onto its chain: centres (chem/fischer.js). True if any changed.
  keepFischer() {
    const { dropped, grown } = keepFischer(this.doc);
    if (dropped) this.say(t('{n} centres of the Fischer projection are no longer crossings (a bond left the horizontal or vertical, or the chain was turned on its side): their stereo is no longer read from it. Undo to keep it.', { n: dropped }), 'info', 7000);
    return Boolean(dropped || grown);
  }

  // Saves the current state for undo (before a change, or at the start of a drag).
  checkpoint() {
    this.finishAnimation(); // (a change during an animation starts from where it ends)
    this.undoStack.push(this.state());
    this.settleCurves();
    this.checkpoints += 1;
    // (the oldest step, if it goes: kept a moment, for an action refused to put back)
    if (this.undoStack.length > HISTORY) this.shiftedOff = { at: this.checkpoints, state: this.undoStack.shift() };
    this.redoneBefore = this.redoStack; // (for dropCheckpoint)
    this.redoStack = [];
  }

  // Curved arrows read from a file are drawn as the file has them (curve.hint) until the drawing is changed; from
  // the first change on, by the way (variant) they are drawn in now, so that they find their way anew as
  // molecules move or flip, as any other arrow. (The undo step before keeps them as read.)
  settleCurves() {
    if (![...this.doc.curves.values()].some((curve) => curve.hint)) return;
    const { curves } = this.scene;
    for (const curve of this.doc.curves.values()) {
      if (!curve.hint) continue;
      curve.variant = curves.get(curve.id)?.variant ?? curve.variant ?? 0;
      delete curve.hint;
    }
  }

  // After the document was changed directly (during a drag): redraw.
  touched() {
    pruneFills(this.doc); // a ring broken, its fill gone
    pruneGroups(this.doc); // what is gone out of its group (a group with nothing left gone too)
    // a bold bond made double, a wedge or another kind: bold no more (only a plain single bond is drawn bold; kept,
    // the panel lit ▬ on a double bond and it came back bold at single again)
    for (const bond of this.doc.bonds.values()) if (bond.bold && (bond.order !== 1 || bond.stereo || bond.kind)) delete bond.bold;
    dropPartedNewmans(this.doc); // a Newman projection's two carbons pulled apart: an ordinary bond
    spreadOnArrows(this.doc); // a molecule on a reaction arrow grown or joined: all of it on the arrow
    if (!this.gesture) this.keepFischer(); // (a drag: when it ends, pointerUp)
    // the structure round aromatic rings or COO⁻ changed: marks that no longer hold go (Kekulé)
    if (marksKey(this.doc) !== this.marks) {
      dropStaleMarks(this.doc);
      this.marks = marksKey(this.doc);
    }
    this.docVersion += 1;
    this.updateStereo();
    // (what has gone leaves the selection; a side arc, no kind of its own, stays while its arrow has it)
    const arcs = new Set([...this.doc.arrows.values()].flatMap((arrow) => (arrow.sides ?? []).map((arc) => arc.id)));
    for (const id of [...this.selection]) if (!kindOf(this.doc, id) && !arcs.has(id)) this.selection.delete(id);
    this.emit();
  }

  // Moves atoms over `duration` ms, as one undo step: `at(t)` gives a Map
  // atom id -> [x, y] for t from 0 to 1. Anything else done meanwhile (a
  // click, a key, undo) first puts them where they end.
  animate(at, duration = 900) {
    this.checkpoint();
    const apply = (t) => {
      for (const [id, [x, y]] of at(t)) {
        const atom = this.doc.atoms.get(id);
        if (atom) [atom.x, atom.y] = [x, y];
      }
      this.touched();
    };
    const started = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - started) / duration);
      if (t >= 1) {
        this.animation = null;
        apply(1);
        return;
      }
      apply(t);
      this.animation.frame = requestAnimationFrame(step);
    };
    this.animation = {
      frame: requestAnimationFrame(step),
      finish: () => {
        cancelAnimationFrame(this.animation.frame);
        this.animation = null;
        apply(1);
      },
    };
    apply(0);
  }

  finishAnimation() {
    this.animation?.finish();
  }

  // Animations on (the settings), or as the system asks (less motion: off).
  animationsOn() {
    if (typeof this.settings.animations === 'boolean') return this.settings.animations;
    return !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  // Throws away the last checkpoint (a drag that changed nothing), as if it had never been made: one step
  // fewer counted (refuseOverfull goes back by that count), the oldest step back if this one pushed it out at
  // the limit, and what could be redone before it.
  dropCheckpoint() {
    if (!this.undoStack.length) return;
    this.undoStack.pop();
    if (this.shiftedOff?.at === this.checkpoints) {
      this.undoStack.unshift(this.shiftedOff.state);
      this.shiftedOff = null;
    }
    this.checkpoints -= 1;
    if (this.redoneBefore) this.redoStack = this.redoneBefore;
    this.redoneBefore = null;
  }

  undo() {
    this.finishAnimation();
    const state = this.undoStack.pop();
    if (!state) return;
    this.redoStack.push(this.state());
    this.restore(state);
  }

  redo() {
    this.finishAnimation();
    const state = this.redoStack.pop();
    if (!state) return;
    this.undoStack.push(this.state());
    this.restore(state);
  }

  // A step to undo or redo: the drawing, what is selected, and whose it is: the drawing's id, file, saved state
  // and name. Undo across opening a file or a new drawing brings the drawing before back with its own file, so
  // that Ctrl+S never writes one drawing into another's file; within one drawing a save isn't undone (the file
  // stays as written), so only a step of another drawing brings these back.
  state() {
    return { doc: cloneDoc(this.doc), selection: [...this.selection], owner: { drawingId: this.drawingId, file: this.file, savedKet: this.savedKet, title: this.title } };
  }

  restore({ doc, selection, owner }) {
    this.doc = cloneDoc(doc);
    this.selection = new Set(selection);
    if (owner && owner.drawingId !== this.drawingId) Object.assign(this, owner);
    this.touched();
  }

  // Replaces the whole document (opening a file), as one undo step.
  // The drawing's style (stored in it: doc.style), else the one set for new drawings (the settings): { style,
  // customStyle }. A drawing from an older file, or another program's, has none and shows in the settings' one.
  drawingStyle() {
    return this.doc.style ?? this.defaultStyle();
  }

  // The drawing's style put in place (render/style.js STYLE) when it isn't already
  applyDrawingStyle() {
    const style = this.drawingStyle();
    const key = JSON.stringify(style);
    if (key === this.styleKey) return;
    applyStyle(style);
    this.styleKey = key;
  }

  // A style chosen (Settings → Style): the drawing's own, an undo step; the one for new drawings stays as it is
  // (J: changing one drawing changes nothing else)
  // (its charges and lone pairs as they were)
  setDrawingStyle(style, customStyle = null) {
    this.setDrawingLook({ style, customStyle });
  }

  // Part of the drawing's style changed (Settings → Charges ⊕ ⊖, Lone pairs as bars): the drawing's own, an undo step
  setDrawingLook(changes) {
    const chosen = styleOf({ ...this.drawingStyle(), ...changes });
    this.change((doc) => {
      doc.style = chosen;
    });
  }

  // The style for new drawings (and drawings that say none): Settings' Use for new drawings
  defaultStyle() {
    return defaultStyleOf(this.settings);
  }

  setDefaultStyle({ style, customStyle = null, charges, lonePairs }) {
    this.setSettings({ style, ...(style === 'custom' && { customStyle }), chargeStyle: charges ?? 'plain', pairStyle: lonePairs ?? 'dots' });
  }

  setDoc(doc) {
    this.checkpoint();
    this.doc = completeDoc(doc);
    this.selection.clear();
    this.touched();
  }

  // --- settings, tools, notices ---

  setSettings(changes) {
    this.settings = { ...this.settings, ...changes };
    this.styleKey = null; // (put in place again before the next drawing: the drawing's own, else these)
    try {
      if (!EMBEDDED) localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // private window: the settings just aren't remembered
    }
    this.docVersion += 1;
    this.updateStereo();
    this.emit();
  }

  setTool(tool) {
    // (a tool of a part switched off: not picked, whatever asks for it, a button, a key, the search bar)
    if (!toolAllowed(tool)) {
      this.say(refusal(allowed(toolPart(tool)) ? 'structure' : toolPart(tool)), 'error');
      return;
    }
    TOOLS[this.tool.name]?.cancel?.(this);
    this.tool = tool;
    this.preview = null;
    this.gesture = null;
    this.emit();
  }

  setDebug(on) {
    this.debug = on;
    this.emit();
  }

  // A short message; it goes away after `duration` ms (Infinity: stays
  // until the next one).
  say(text, kind = 'info', duration = 3500) {
    const notice = { text, kind, id: Math.random() };
    this.notice = notice;
    this.emit();
    if (duration !== Infinity) {
      setTimeout(() => {
        if (this.notice === notice) {
          this.notice = null;
          this.emit();
        }
      }, duration);
    }
  }

  clearNotice() {
    this.notice = null;
    this.emit();
  }

  // --- selection ---

  select(ids, { add = false } = {}) {
    if (!add) this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.emit();
  }

  toggleSelected(id) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit();
  }

  clearSelection() {
    if (!this.selection.size) return;
    this.selection.clear();
    this.emit();
  }

  selectAll() {
    this.selection = new Set(KINDS.flatMap((kind) => [...this.doc[kind].keys()]));
    this.emit();
  }

  // The selected ids of one kind ('atoms', 'bonds', ...).
  selected(kind) {
    return [...this.selection].filter((id) => this.doc[kind].has(id));
  }

  // Atoms that move with the selection: selected atoms and the atoms of
  // selected bonds.
  selectedAtoms() {
    const atoms = new Set(this.selected('atoms'));
    for (const id of this.selected('bonds')) {
      const bond = this.doc.bonds.get(id);
      atoms.add(bond.a);
      atoms.add(bond.b);
    }
    // a Newman projection's two carbons, on one point, go together: for a drag (its merge would join one into
    // the other), Flip and everything else that takes the selection's atoms
    for (const bond of endOnBonds(this.doc)) {
      if (atoms.has(bond.a) !== atoms.has(bond.b)) atoms.add(atoms.has(bond.a) ? bond.b : bond.a);
    }
    return [...atoms];
  }

  // Everything that moves with the selection (atoms, arrows, "+", text,
  // brackets, 3D models), with the numbers of the molecules that move.
  movingIds() {
    const atoms = this.selectedAtoms(); // (a Newman projection's two carbons together)
    const moving = new Set(atoms);
    const numbers = [];
    const anchored = [...this.doc.texts.values()].filter((t) => t.anchor !== undefined && this.doc.atoms.has(t.anchor));
    if (anchored.length && atoms.length) {
      for (const members of fragments(this.doc)) {
        if (!members.some((id) => moving.has(id))) continue;
        const inside = new Set(members);
        for (const t of anchored) if (inside.has(t.anchor)) numbers.push(t.id);
      }
    }
    return [...new Set([...atoms, ...this.selected('arrows'), ...this.selected('pluses'), ...this.selected('texts'), ...this.selected('brackets'), ...this.selected('models'), ...numbers])];
  }

  deleteSelection() {
    if (!this.selection.size) return;
    const ids = [...this.selection];
    this.change((doc) => deleteObjects(doc, ids));
    this.selection.clear();
    this.emit();
  }

  // (the arrow keys: a text or molecule on an anchor or arrow comes off it, as in a drag; else its place put it
  // back, a step to undo with nothing moved)
  moveSelection(dx, dy) {
    const ids = this.movingIds();
    if (!ids.length) return;
    this.change((doc) => {
      takeOff(this, ids, ids.filter((id) => doc.atoms.has(id)).length);
      moveObjects(doc, ids, dx, dy);
    });
  }

  // --- view ---

  toModel(clientX, clientY, rect) {
    const { scale, tx, ty } = this.view;
    return [(clientX - rect.left - tx) / scale, (clientY - rect.top - ty) / scale];
  }

  setView(view) {
    this.view = { ...this.view, ...view };
    this.emit();
  }

  // Zooms by `factor` keeping the model point under (sx, sy) (screen
  // coordinates within the canvas) in place.
  zoomAt(factor, sx, sy) {
    const { scale, tx, ty } = this.view;
    const next = Math.min(400, Math.max(6, scale * factor));
    const k = next / scale;
    this.setView({ scale: next, tx: sx - (sx - tx) * k, ty: sy - (sy - ty) * k });
  }

  // Shows the whole drawing in the part of the canvas of this size
  // (pixels) whose top left corner is at `left`, `top`; with `selected` and
  // something selected, that, as large as it fits (closer than the whole
  // drawing goes).
  // `also`: another drawing whose extent is taken in too (an answer: the room where students will draw)
  fit(width, height, { left = 0, top = 0, selected = false, most = null, also = null } = {}) {
    const ids = KINDS.flatMap((kind) => [...this.doc[kind].keys()]);
    const extra = also ? boundsOf(also) : null;
    if (!ids.length && !extra) {
      this.setView({ scale: 42, tx: left + width / 2, ty: top + height / 2 });
      return;
    }
    const chosen = selected && this.selection.size > 0;
    let box = ids.length ? boundsOf(this.doc, chosen ? this.selection : null, this.scene) : null;
    if (extra) box = box ? [Math.min(box[0], extra[0]), Math.max(box[1], extra[1]), Math.min(box[2], extra[2]), Math.max(box[3], extra[3])] : extra;
    if (!box) return; // (only bonds or curved arrows selected: their atoms aren't)
    const [x1, x2, y1, y2] = box;
    const scale = Math.min(most ?? (chosen ? 200 : 70), Math.max(8, Math.min(width / (x2 - x1), height / (y2 - y1))));
    this.setView({ scale, tx: left + width / 2 - ((x1 + x2) / 2) * scale, ty: top + height / 2 - ((y1 + y2) / 2) * scale });
  }

  // The middle of the visible canvas, in model coordinates.
  viewCentre(width, height) {
    const { scale, tx, ty } = this.view;
    return [(width / 2 - tx) / scale, (height / 2 - ty) / scale];
  }

  // --- pointer events from the canvas (model coordinates) ---

  hitAt(point, options) {
    return hitTest(this.scene, point, options);
  }

  pointerDown(point, event) {
    this.finishAnimation();
    const tool = TOOLS[this.tool.name];
    const hit = this.hitAt(point);
    this.gesture = { start: point, point, hit, moved: false, shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey || event.metaKey, labels: this.labelsNow() };
    tool.down?.(this, this.gesture);
  }

  pointerMove(point, event) {
    this.pointer = point; // where the pointer is over the drawing (pasting goes there)
    this.shiftHeld = event.shiftKey; // tools show what a click would do, which Shift can change
    const tool = TOOLS[this.tool.name];
    if (this.gesture) {
      const g = this.gesture;
      g.point = point;
      g.shift = event.shiftKey;
      g.alt = event.altKey;
      if (!g.moved && Math.hypot(point[0] - g.start[0], point[1] - g.start[1]) * this.view.scale > 4) g.moved = true;
      if (g.moved) tool.drag?.(this, g);
      return;
    }
    const hit = this.hitAt(point);
    const same = hit?.id === this.hover?.id && hit?.kind === this.hover?.kind && hit?.pair === this.hover?.pair;
    this.hover = hit;
    if (tool.hover) tool.hover(this, point, hit, same);
    else if (!same) this.emit();
  }

  pointerUp(point, event) {
    const g = this.gesture;
    if (!g) return;
    g.point = point;
    g.shift = event.shiftKey;
    const tool = TOOLS[this.tool.name];
    this.gesture = null;
    if (g.moved) tool.dragEnd?.(this, g);
    else tool.click?.(this, g);
    if (!this.refuseChange(g.labels) && this.keepFischer()) {
      this.docVersion += 1;
      this.updateStereo();
    }
    this.hover = this.hitAt(point);
    this.emit();
  }

  // Shift pressed or let go with the pointer still: the tool's preview again.
  // Ctrl (Cmd) held: the select tool outlines the group a Ctrl+click would pick (Canvas.jsx)
  setCtrl(held) {
    if (held === Boolean(this.ctrlHeld)) return;
    this.ctrlHeld = held;
    this.emit();
  }

  setShift(held) {
    if (held === this.shiftHeld) return;
    this.shiftHeld = held;
    const tool = TOOLS[this.tool.name];
    if (this.gesture) {
      // (during a drag: the tool told at once, if it wants to know, not only at the next move)
      this.gesture.shift = held;
      tool.shift?.(this, this.gesture);
    } else if (this.pointer && tool.hover) tool.hover(this, this.pointer, this.hover);
  }

  pointerLeave() {
    this.pointer = null;
    if (this.gesture) return;
    this.hover = null;
    if (this.preview && !this.preview.keep) this.preview = null;
    this.emit();
  }

  cancelGesture() {
    TOOLS[this.tool.name]?.cancel?.(this);
    this.gesture = null;
    this.preview = null;
    this.emit();
  }

  // The object under the pointer, if it is an atom or bond (for key shortcuts).
  hovered(kind) {
    return this.hover?.kind === kind && getObject(this.doc, this.hover.id) ? this.hover.id : null;
  }
}

// A molecule on a reaction arrow is on it whole: atoms drawn onto it there (a bond pulled out of it, a group joined
// to it) take its place on the arrow, as the drawing already shows it (scene.js: a molecule with any atom on an
// arrow stands on it). Else a file, or a page reading the drawing (get('olom')), had only part of it there.
const ON_ARROW = ['arrow', 'arrowSlot', 'arrowSign', 'arrowOrder'];
// (along bonds that make one molecule: not a hydrogen bond or a partial bond to a neighbour, which would pull it on
// for good)
function spreadOnArrows(doc) {
  const byAtom = new Map([...doc.atoms.keys()].map((id) => [id, []]));
  for (const bond of doc.bonds.values()) {
    if (bond.kind === 'hbond' || bond.kind === 'partial' || !byAtom.has(bond.a) || !byAtom.has(bond.b)) continue;
    byAtom.get(bond.a).push(bond);
    byAtom.get(bond.b).push(bond);
  }
  for (const members of fragments(doc, byAtom)) {
    const atoms = members.map((id) => doc.atoms.get(id));
    const on = atoms.find((atom) => atom.arrow != null && doc.arrows.has(atom.arrow));
    if (!on) continue;
    for (const atom of atoms) {
      if (ON_ARROW.every((key) => atom[key] === on[key])) continue;
      for (const key of ON_ARROW) {
        if (on[key] === undefined) delete atom[key];
        else atom[key] = on[key];
      }
    }
  }
}
