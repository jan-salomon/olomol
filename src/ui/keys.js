// Keyboard shortcuts. Over an atom, letters change its element (as in
// ChemDraw and Ketcher), + and − its charge, "." its unpaired electrons and
// ":" its lone pairs; over a bond, digits change its order (1 again and
// again: wedge, hashed wedge, plain, as in Ketcher); anywhere else the same
// keys choose a tool, and an element's letter the bond tool drawing that
// element (N: the next atoms are N). The table is also what the shortcut sheet (?) shows.
import { bracketAtoms, changeCharge, partSelected, setBondOrder, setElement, toggleLonePairs, toolOnSelection } from '../editor/tools.js';
import { RADICAL_CYCLE } from '../chem/valence.js';
import { deleteObjects } from '../model/doc.js';
import { isEndOn } from '../chem/newman.js';
import { t } from '../i18n/i18n.js';
import { copyPicture, openFile, saveFile } from './actions.js';
import { stepTab } from './tabs.js';
import { groupSelection, ungroupSelection } from '../editor/grouping.js';

export const ELEMENT_KEYS = { c: 'C', n: 'N', o: 'O', s: 'S', p: 'P', f: 'F', h: 'H', i: 'I', l: 'Cl', b: 'Br' };

export const TOOL_KEYS = {
  v: [{ name: 'select' }, t('Select')],
  e: [{ name: 'erase' }, t('Erase')],
  1: [{ name: 'bond', order: 1, stereo: '' }, t('Single bond (again: wedge, again: hashed wedge)')],
  2: [{ name: 'bond', order: 2, stereo: '' }, t('Double bond')],
  3: [{ name: 'bond', order: 3, stereo: '' }, t('Triple bond')],
  z: [{ name: 'chain' }, t('Chain (zigzag)')],
  r: [{ name: 'ring', size: 6, aromatic: true }, t('Benzene (again: the next ring, 3 to 8)')],
  5: [{ name: 'ring', size: 5, aromatic: false }, t('Ring of {n}', { n: 5 })],
  6: [{ name: 'ring', size: 6, aromatic: false }, t('Ring of {n}', { n: 6 })],
  '+': [{ name: 'charge', delta: 1 }, t('Positive charge')],
  '-': [{ name: 'charge', delta: -1 }, t('Negative charge')],
  '.': [{ name: 'radical' }, t('Unpaired electron')],
  ':': [{ name: 'pairs' }, t('Lone pairs')],
  a: [{ name: 'curve', electrons: 2 }, t('Curved arrow (electron pair)')],
  x: [{ name: 'rxn', kind: 'forward' }, t('Reaction arrow')],
  t: [{ name: 'text' }, t('Text')],
  k: [{ name: 'bracket' }, t('Brackets')],
  d: [{ name: 'bond', order: 1, stereo: '', kind: 'dative' }, t('Dative bond (again: hydrogen bond, again: partial bond)')],
};

// What D does with the bond tool drawing one of these kinds, each time (and over a bond of one): dative,
// hydrogen bond, partial bond, dative again; the rail's order.
const KIND_CYCLE = { dative: 'hbond', hbond: 'partial', partial: 'dative' };

// What 1 does to a single bond, or to the single bond tool, each time.
const STEREO_CYCLE = { '': 'wedge', wedge: 'hash', hash: '' };

// 1 over a single bond, each time: plain, wedge, hashed wedge, then both from the other end (the bond's
// ends swapped: a wedge's narrow end is its first atom; bond.turned while that lasts), plain again;
// Shift+1 the other way round (one step back, past what was wanted).
const STEREO_STEPS = ['', 'wedge', 'hash', 'wedge turned', 'hash turned'];
function cycleStereo(bond, back = false) {
  const now = STEREO_STEPS.indexOf(`${bond.stereo ?? ''}${bond.turned ? ' turned' : ''}`.trim());
  const [stereo, turned] = STEREO_STEPS[(Math.max(0, now) + (back ? STEREO_STEPS.length - 1 : 1)) % STEREO_STEPS.length].split(' ');
  if (Boolean(turned) !== Boolean(bond.turned)) [bond.a, bond.b] = [bond.b, bond.a];
  bond.stereo = stereo;
  if (turned) bond.turned = true;
  else delete bond.turned;
}

// What R does with a ring tool chosen, each time: the rings in the rail's order.
const RING_CYCLE = [{ size: 6, aromatic: true }, ...[3, 4, 5, 6, 7, 8].map((size) => ({ size, aromatic: false }))];
function nextRing(tool) {
  const k = RING_CYCLE.findIndex((ring) => ring.size === tool.size && ring.aromatic === Boolean(tool.aromatic));
  return { name: 'ring', ...RING_CYCLE[(k + 1) % RING_CYCLE.length] };
}

// The key for a tool, for tooltips: "V", "1", "1 twice", or undefined.
export function keyOf(tool) {
  const same = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
  const found = Object.entries(TOOL_KEYS).find(([, [t]]) => same(t, tool));
  if (same(tool, { name: 'curve', electrons: 1 })) return t('Shift+A');
  if (same(tool, { name: 'bond', order: 1, stereo: 'wedge' })) return t('1 twice');
  if (same(tool, { name: 'bond', order: 1, stereo: 'hash' })) return t('1 three times');
  if (same(tool, { name: 'bond', order: 1, stereo: '', kind: 'hbond' })) return t('D twice');
  if (same(tool, { name: 'bond', order: 1, stereo: '', kind: 'partial' })) return t('D three times');
  if (tool.name === 'ring' && !tool.aromatic && !found) return t('R {n} times', { n: [3, 4, 5, 6, 7, 8].indexOf(tool.size) + 2 });
  return found?.[0].toUpperCase();
}

// For the shortcut sheet: [section, [[keys, what]]].
export const SHORTCUTS = [
  [t('Over an atom'), [
    ['C N O S P F H I', t('change the element')],
    ['L, B', 'Cl, Br'],
    ['+ −', t('charge')],
    ['.', t('unpaired electron (again: two together ••, then none; with a selection: on all of it)')],
    [':', t('lone pairs on/off')],
    [t('Del'), t('delete it')],
  ]],
  [t('Over a bond'), [['1 2 3', t('single, double, triple')], [t('1 again'), t('wedge, hashed wedge, both from the other end, plain')], [t('Shift+1'), t('the same, backwards')], ['D', t('dative bond, again: hydrogen bond, again: partial bond')], [t('Del'), t('delete it')]]],
  [t('Tools (pointer over nothing)'), [
    ['C N O S P F H I', t('draw that element: the bond tool, its new atoms N, O… (C: carbon again)')],
    ['L, B', t('draw Cl, Br')],
    ...Object.entries(TOOL_KEYS).map(([key, [, what]]) => [key.toUpperCase(), what]),
    [t('Shift+A'), t('Fishhook arrow (one electron)')],
    [t('Shift+T'), t('Templates')],
  ]],
  [t('Anywhere'), [
    ['Esc', t('cancel; again: Select tool; again: nothing selected; again: box or lasso')],
    [t('Ctrl+Z, Ctrl+Shift+Z'), t('undo, redo')],
    [t('Ctrl+C, Ctrl+X, Ctrl+V'), t('copy, cut, paste (also SMILES and molfiles)')],
    [t('Ctrl+Shift+C'), t('copy as a picture (PNG), for Word, PowerPoint, Docs')],
    [t('Ctrl+A'), t('select everything')],
    [t('Ctrl+G, Ctrl+Shift+G'), t('group the selection, take a group apart (one level)')],
    [t('Ctrl+click'), t('a group (again: the group round it); Ctrl+drag moves it')],
    [t('Ctrl+drag a box'), t('the whole groups of what it takes')],
    [t('Del'), t('delete the selection')],
    [t('Arrow keys'), t('move the selection (Shift: further)')],
    [':', t('the selected atoms’ lone pairs on/off')],
    ['+ −', t('the selected atoms’ charge')],
    ['1 2 3', t('the selected bonds single, double, triple')],
    [t('Ctrl+S, Ctrl+O'), t('save, open')],
    [t('Ctrl+Shift+S'), t('save as another file')],
    [t('Ctrl+Tab, Ctrl+Shift+Tab'), t('the next drawing, the one before (in the installed app: a browser keeps these keys for its own tabs)')],
    [t('Ctrl+wheel, Space+drag'), t('zoom, pan')],
    ['/', t('draw from a name, SMILES or InChI')],
    ['?', t('this sheet')],
  ]],
  [t('Turn in 3D'), [
    [t('Arrow keys'), t('turn it (Shift: in the plane of the page)')],
    ['S', t('stick model, and back')],
    ['G', t('in the stick model: draw out groups')],
    ['H', t('in the stick model: small hydrogens')],
    ['Enter', t('use this view')],
    ['Esc', t('close the window')],
  ]],
  [t('Writing text'), [
    ['Enter, Esc', t('finish')],
    [t('Shift+Enter'), t('new line')],
    [t('Ctrl+, Ctrl+.'), t('subscript, superscript')],
    [t('Ctrl+B, Ctrl+I'), t('bold, italic')],
  ]],
];

// Handles a key press; true if it was ours.
export function handleKey(editor, e, { fit, help, fromName, templates }) {
  const ctrl = e.ctrlKey || e.metaKey;
  // digits by the key pressed, whatever the layout (Czech keyboards type + ě š č there)
  const digit = /^(Digit|Numpad)\d$/.test(e.code) ? e.code.slice(-1) : null;
  const key = digit ?? (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const atom = editor.hovered('atom');
  const bond = editor.hovered('bond');
  if (ctrl) {
    if (key === 'z') e.shiftKey ? editor.redo() : editor.undo();
    else if (key === 'y') editor.redo();
    else if (key === 'a') editor.selectAll();
    else if (key === 's') saveFile(editor, { as: e.shiftKey }); // (Ctrl+Shift+S: Save as)
    else if (key === 'c' && e.shiftKey) copyPicture(editor);
    else if (key === 'o') openFile(editor, fit);
    else if (key === 'g') (e.shiftKey ? ungroupSelection : groupSelection)(editor); // (Ctrl+Shift+G: ungroup, one level)
    // the next tab, the one before (where the browser lets these keys through: the installed app)
    else if (key === 'Tab' || key === 'PageDown' || key === 'PageUp') stepTab(editor, key === 'PageUp' || (key === 'Tab' && e.shiftKey) ? -1 : 1);
    else return false; // copy, cut and paste come as their own events
    return true;
  }
  if (e.altKey) return false;
  if (key === 'Escape') {
    // a drag or a half-made arrow first; a ghost under the pointer is no reason to stay
    if (editor.gesture || editor.pendingCurve) editor.cancelGesture();
    else if (editor.tool.once) editor.setTool(editor.tool.back ?? { name: 'select' }); // a paste left out
    else if (editor.tool.name !== 'select') editor.setTool({ name: 'select' });
    else if (editor.selection.size) editor.clearSelection();
    // nothing selected: the box and the lasso, in turn
    else editor.setTool(editor.tool.lasso ? { name: 'select' } : { name: 'select', lasso: true });
    return true;
  }
  if (key === 'Delete' || key === 'Backspace') {
    if (editor.selection.size) editor.deleteSelection();
    else if (editor.hover) {
      // (a side arc under the pointer: that arc, as the eraser takes it, not its arrow)
      const id = editor.hover.arcId ?? editor.hover.id;
      editor.change((doc) => deleteObjects(doc, [id]));
    }
    return true;
  }
  if (key.startsWith('Arrow') && editor.selection.size) {
    const step = e.shiftKey ? 1 : 0.1;
    editor.moveSelection(...{ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key]);
    return true;
  }
  if (key === '?') {
    help();
    return true;
  }
  if (key === '/') {
    fromName();
    return true;
  }
  if (key === 't' && e.shiftKey) {
    templates();
    return true;
  }
  // : with atoms selected, as the lone pair button: their lone pairs shown (or, all shown already, hidden), and
  // the tool on; again: off again. The pointer over an atom outside the selection: that atom's, as without one
  const chosenAtoms = editor.selectedAtoms();
  if (key === ':' && chosenAtoms.length && (atom === null || chosenAtoms.includes(atom))) {
    toggleLonePairs(editor, chosenAtoms);
    if (editor.tool.name !== 'pairs') editor.setTool(TOOL_KEYS[':'][0]);
    return true;
  }
  // K with atoms selected, as the bracket button: brackets round them, and the tool on
  if (key === 'k' && !e.shiftKey && chosenAtoms.length) {
    bracketAtoms(editor, chosenAtoms);
    editor.setTool(TOOL_KEYS.k[0]);
    return true;
  }
  // With a selection, the keys that change one atom or bond change all of it: + and − every selected atom's
  // charge, 1 2 3 every selected bond single (plain), double, triple, in one step. The pointer over nothing or
  // over the selection; over an atom or bond outside it, that one, as without a selection. (+ by the character:
  // on a Czech keyboard it is the 1 key, so it is a charge, not a single bond)
  const outside = (atom !== null && !editor.selection.has(atom)) || (bond !== null && !editor.selection.has(bond));
  const signed = e.key === '+' ? '+' : key === '-' ? '-' : null;
  if (!outside && signed && editor.selected('atoms').length) {
    const ids = editor.selected('atoms');
    editor.change((doc) => changeCharge(doc, ids, signed === '+' ? 1 : -1));
    return true;
  }
  // . with atoms selected, as the rail's unpaired electron with them: each one's next (one, two together, none)
  if (!outside && key === '.' && partSelected(editor, 'atoms').length) return toolOnSelection(editor, { name: 'radical' });
  // (one bond selected, the pointer on it or on nothing: as that bond under the pointer, below: 1 again a wedge)
  const oneBond = editor.selected('bonds').length === 1 && editor.selected('atoms').length <= 2 && (bond === null || editor.selection.has(bond)) ? editor.selected('bonds')[0] : null;
  if (!outside && !signed && ['1', '2', '3'].includes(key) && editor.selected('bonds').length && oneBond === null) {
    const all = editor.selected('bonds').map((id) => editor.doc.bonds.get(id));
    // (a Newman projection's bond seen end on stays a single bond, as one alone does)
    const ids = all.filter((b) => !isEndOn(editor.doc, b)).map((b) => b.id);
    if (ids.length < all.length && key !== '1') editor.say(t("A Newman projection's bond seen end on stays a single bond."));
    if (ids.length) {
      editor.change((doc) => {
        for (const id of ids) {
          const changed = Object.assign(doc.bonds.get(id), { order: Number(key), stereo: '' });
          delete changed.delocalized;
          delete changed.kind; // (a plain bond, as the panel's Order makes it: no double hydrogen bond)
        }
      });
    }
    return true;
  }
  // an element key over the selection's atoms (or over nothing): all of them that element, as + and − change all
  // (part of a molecule selected, as the panel's Element: not a whole pasted molecule, which N would make all N)
  const chosenPart = partSelected(editor, 'atoms');
  const onSelection = atom !== null ? editor.selection.has(atom) && chosenPart.length > 1 : bond === null && chosenPart.length > 0 && !TOOL_KEYS[key];
  if (ELEMENT_KEYS[key] && onSelection) {
    setElement(editor, chosenPart, ELEMENT_KEYS[key]);
    return true;
  }
  if (atom !== null) {
    // (+ by the character over an atom: on a Czech keyboard it is the 1 key, and 1 does nothing to an atom)
    const sign = e.key === '+' ? '+' : key;
    if (ELEMENT_KEYS[key]) setElement(editor, atom, ELEMENT_KEYS[key]);
    else if (sign === '+' || sign === '-') {
      editor.change((doc) => changeCharge(doc, [atom], sign === '+' ? 1 : -1));
    } else if (key === '.') {
      editor.change((doc) => {
        const a = doc.atoms.get(atom);
        a.radical = RADICAL_CYCLE[a.radical ?? 0];
      });
    } else if (key === ':') toggleLonePairs(editor, [atom]);
    else return false;
    return true;
  }
  const onBond = bond ?? (['1', '2', '3', 'd'].includes(key) ? oneBond : null);
  if (onBond !== null) {
    const bond = onBond;
    const b = editor.doc.bonds.get(bond);
    // a Newman projection's bond seen end on stays a single bond (as a double, a wedge or a coordination
    // bond the projection would fall apart)
    if (['1', '2', '3', 'd'].includes(key) && isEndOn(editor.doc, b)) {
      editor.say(t("A Newman projection's bond seen end on stays a single bond."));
      return true;
    }
    const plainSingle = b.order === 1 && !b.kind && !b.delocalized && b.stereo in STEREO_CYCLE;
    // (a coordination bond: arrow, wedge, hashed wedge; it stays one)
    if (key === '1' && plainSingle) editor.change((doc) => cycleStereo(doc.bonds.get(bond), e.shiftKey));
    else if (key === '1' && b.kind === 'dative' && (b.stereo ?? '') in STEREO_CYCLE) editor.change((doc) => { doc.bonds.get(bond).stereo = STEREO_CYCLE[b.stereo ?? '']; });
    else if (['1', '2', '3'].includes(key)) setBondOrder(editor, bond, Number(key));
    // D: a dative bond, again a hydrogen bond, again a partial bond, then dative again
    else if (key === 'd') {
      editor.change((doc) => {
        const changed = doc.bonds.get(bond);
        Object.assign(changed, { kind: KIND_CYCLE[changed.kind] ?? 'dative', order: 1, stereo: '' });
        delete changed.delocalized;
      });
    } else return false;
    return true;
  }
  const { tool } = editor;
  // the element new atoms get stays when the bond changes (N, then 2: a double bond to N)
  const element = (tool.name === 'bond' || tool.name === 'atom') && tool.el ? { el: tool.el } : {};
  if (key === '1' && tool.name === 'bond' && tool.order === 1 && !tool.kind && tool.stereo in STEREO_CYCLE) {
    editor.setTool({ name: 'bond', order: 1, stereo: STEREO_CYCLE[tool.stereo], ...element });
    return true;
  }
  if (key === 'd' && tool.name === 'bond' && KIND_CYCLE[tool.kind]) {
    editor.setTool({ name: 'bond', order: 1, stereo: '', kind: KIND_CYCLE[tool.kind] });
    return true;
  }
  if (key === 'r' && tool.name === 'ring') {
    editor.setTool(nextRing(tool));
    return true;
  }
  // A: curved arrow, Shift+A: fishhook (F is fluorine)
  if (key === 'a' && e.shiftKey) {
    editor.setTool({ name: 'curve', electrons: 1 });
    return true;
  }
  // an element key over the canvas: the bond tool, its new atoms of that element (C too: it
  // lights up in the bottom bar, and a click turns an atom into carbon)
  if (ELEMENT_KEYS[key] && !TOOL_KEYS[key]) {
    const el = ELEMENT_KEYS[key];
    const bond = tool.name === 'bond' && !tool.kind ? { order: tool.order, stereo: tool.stereo } : { order: 1, stereo: '' };
    editor.setTool({ name: 'bond', ...bond, el });
    return true;
  }
  if (TOOL_KEYS[key]) {
    const chosen = TOOL_KEYS[key][0];
    editor.setTool({ ...chosen, ...(chosen.name === 'bond' && element) });
    return true;
  }
  return false;
}

// What the active tool does, for the hint line under the canvas.
// The hint line's part of a tool's hint: its first two gestures (the whole hint is in the tool's tooltip)
export const mainHint = (hint) => hint.split(' · ').slice(0, 2).join(' · ');

export function toolHint(tool) {
  switch (tool.name) {
    case 'select':
      if (tool.lasso) return t('Click to select · Shift+click to add · drag round what you want: lasso · double click: whole molecule (Shift: add it) · triple click: its reaction row · Ctrl+click: its group · round handle: rotate · drag a curved arrow: bend it');
      return t('Click to select · Shift+click to add · drag a box · double click: whole molecule (Shift: add it) · triple click: its reaction row · Ctrl+click: its group · round handle: rotate · drag a curved arrow: bend it');
    case 'erase':
      return t('Click to delete · drag a box to delete what is inside');
    case 'bond':
      if (tool.el) return t('Drawing {el} (C: carbon again) · click an atom: make it {el} (Shift, or on an {el}: bond a new {el} to it) · drag from an atom: a bond to {el} · click the canvas: a new {el} · click a bond: change it', { el: tool.el });
      return t('Click an atom: new bond (Shift: on the other side) · drag from an atom: pull one out (Shift: any angle) · click a bond: change it · keys over atoms: C N O S…');
    case 'chain':
      return t('Drag from an atom or the canvas: a zigzag chain (Shift: zigzag the other way)');
    case 'ring':
      return t('Click the canvas, a bond (fused ring; Shift: on its other side) or an atom (hung on it by a new bond, or drag from the atom to aim it; Shift: through the atom, spiro)');
    case 'atom':
      return t('Click an atom: make it {el} (if it is one already, or with Shift: bond a new one to it) · click the canvas: new {el} · drag from an atom: bond to {el}', { el: tool.alias ?? tool.el });
    case 'charge':
      return t('Click an atom: charge {charge}', { charge: tool.partial ? (tool.partial > 0 ? 'δ+' : 'δ−') : tool.delta > 0 ? '+1' : '−1' });
    case 'radical':
      return t('Click an atom: one unpaired electron, again two together (••), again none · two apart, three or four: Unpaired in the panel');
    case 'pairs':
      return t('Click an atom (or drag a box): lone pairs on/off');
    case 'orbital':
      if (tool.kind === 'overlap') return t('Drag from an orbital (or an atom with one) to an orbital of another molecule: a dashed line between them');
      return t('Click an atom: an orbital on it (drag from it: pointing that way) · drag a lobe: turn it in 15° steps (Shift: freely), onto another orbital: a dashed line between them · click a lobe: the other phase');
    case 'curve':
      return tool.electrons === 1 ? t('Drag from the electron (a bond, an unpaired electron) to where it goes (an atom, a bond, or the dot between two atoms: a new bond) · or click both · Esc cancels')
        : t('Drag from the electrons (a bond, a lone pair) to where they go (an atom or a bond; with Shift the dot between two atoms: a new bond) · or click both · Esc cancels');
    case 'rxn':
      if (tool.kind === 'equilibrium') return t('Drag to draw an equilibrium arrow (Shift: any angle) · click: a standard one · favouring one side: Favours in its panel · drag out of its middle circle: a side arc');
      return t("Drag to draw a reaction arrow (Shift: any angle) · click: a standard one · drag out of an arrow's middle circle: a side arc");
    case 'plus':
      return t('Click to place a "+"');
    case 'atomNumber':
      return t("Click atoms in the order you want them numbered: 1, 2, 3… · click a number again to take it off · the panel's IUPAC numbering box numbers by the rules instead");
    case 'bracket':
      return t('Drag a box for brackets · click a molecule: brackets round it · the panel adds ‡, a charge or n');
    case 'text':
      return t('Click to write · Formula for H2SO4 and charges, x₂ x² B I by hand, Greek letters in the window · Enter finishes, Shift+Enter: new line');
    case 'snapBond':
      return t('Click a bond: it becomes horizontal or vertical, the selection turning if the bond is in it, else its molecule · again: a quarter further · Esc: done');
    case 'flipOver':
      return t('Click a bond: the selection turns over it, as about an axle (with nothing selected: the smaller side) · wedges swap, R/S stays · Esc: cancel');
    case 'ringFlip':
      return t('Click a chair: it flips, axial ⇄ equatorial, each group staying up or down · a flat six-membered ring: it becomes a chair · Shift+click: the other chair beside it, with ⇌ · Esc: done');
    case 'chairTurn':
      return t('Click a chair: it turns a third of the way round, anticlockwise, each group staying axial or equatorial · Shift+click: clockwise · the other chair: Ring flip · Esc: done');
    case 'place':
      if (tool.once) return t('Click where {name} should go · Esc: leave it out', { name: tool.label });
      return tool.label ? t('Click where {name} should go · Esc when done', { name: tool.label }) : t('Click where it should go · Esc when done');
    case 'group':
      return t('Click an atom: attach {name} there (drag from it to aim; Shift: the atom becomes its first atom) · click the canvas: {name} on R · Esc when done', { name: tool.label });
    case 'highlight':
      return t('Click or box atoms and bonds to mark them (again: unmark), as RDKit does · click inside a ring to fill it');
    case 'paint':
      return t('Click or drag a box over atoms, bonds, arrows or text to colour them');
    default:
      return '';
  }
}
