// The canvas's right-click menu: what can be done with what is under the pointer. A right click on something not
// selected selects its molecule first (as a double click does); on the empty canvas, what needs nothing selected.
// Each item does what its button or key does (the keys beside them), nothing of its own.
import { snapBond } from '../arrange/align.js';
import { abbreviatable, canDrawOut } from '../editor/abbreviate.js';
import { fragments } from '../model/graph.js';
import { canGroup, canUngroup, groupChain } from '../editor/grouping.js';
import { selectedGroup, selectGroup } from '../editor/tools.js';
import { t } from '../i18n/i18n.js';
import { copyPicture, pasteText } from './actions.js';
import { commands } from './commands.jsx';
import { icons } from './icons.jsx';
import { Popover } from './Menus.jsx';

// `at`: { x, y } in the window and `point` in the drawing, where the right click was; `hit` what was under it
export function ContextMenu({ editor, ui, at, point, hit, onClose }) {
  const anchor = {
    getBoundingClientRect: () => new DOMRect(at.x, at.y - 8, 0, 0), // (the menu's top at the pointer)
    contains: () => false,
  };
  const all = commands(editor, ui);
  const command = (en) => all.find((c) => c.id === `action:${en}`);
  const item = (key, label, icon, run, hint = '') => ({ key, label, icon, run, hint });
  const from = (en, hint = '') => {
    const c = command(en);
    return c && item(en, c.label, c.icon, c.run, hint || c.key || '');
  };
  const selected = editor.selection.size > 0;
  const atoms = editor.selectedAtoms();
  const ids = [...editor.selection];
  const molecules = new Set(atoms).size ? fragments(editor.doc).filter((members) => members.some((id) => atoms.includes(id))).length : 0;
  // the system's own copy and cut: App.jsx's listeners put the selection on the clipboard (KET for olomol)
  const clip = (what) => () => document.execCommand(what);
  const paste = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // (the browser won't let us read it: olomol's own last copy, if any)
    }
    // (a link to a drawing opened: fitted, as after Ctrl+V)
    pasteText(editor, text, point).then((opened) => opened && ui.fit?.());
  };
  const groups = selected ? [
    [item('cut', t('Cut'), icons.cut, clip('cut'), 'Ctrl+X'), item('copy', t('Copy'), icons.copy, clip('copy'), 'Ctrl+C'),
      item('picture', t('Copy as picture'), icons.copy, () => copyPicture(editor), 'Ctrl+Shift+C'), item('paste', t('Paste'), icons.paste, paste, 'Ctrl+V'),
      item('delete', t('Delete'), icons.trash, () => editor.deleteSelection(), 'Del')],
    atoms.length ? [from('Redraw'), from('Turn in 3D')] : [],
    [from('Flip left–right'), from('Flip top–bottom'),
      // (a bond right-clicked: it horizontal or vertical, its molecule turning; again: a quarter further)
      // (the selection turning if the bond is in it, as with the snap tool; else its molecule)
      hit?.kind === 'bond' && editor.doc.bonds.has(hit.id) && item('snap', t('This bond horizontal or vertical'), icons.snap, () => snapBond(editor, hit.id))],
    // (Abbreviate as the panel offers it: a whole molecule too; Separate where One compound was made)
    [abbreviatable(editor.doc, [...new Set([...ids, ...atoms])]) && from('Abbreviate'), canDrawOut(editor.doc, atoms) && from('Draw out'),
      molecules > 1 && from('One compound'), [...editor.doc.bonds.values()].some((b) => b.kind === 'link' && atoms.includes(b.a)) && from('Separate')],
    [canGroup(editor) && from('Group'), canUngroup(editor) && from('Ungroup')],
  ] : [
    [item('paste', t('Paste'), icons.paste, paste, 'Ctrl+V'), from('Select all')],
    [from('Fit'), from('Back to 100%'), from('Show')],
    [from('Duplicate drawing')], // (a copy in a new tab; with one drawing there are no tabs to right-click)
  ];
  // what was right-clicked is in a group: that group (the one round the group selected, if it is selected already)
  const chain = hit ? groupChain(editor.doc, hit.id) : [];
  const now = selectedGroup(editor);
  const next = chain.includes(now) ? chain[chain.indexOf(now) + 1] : chain[0];
  if (next !== undefined) {
    const label = chain.includes(now) ? t('Group round it') : t('Select its group');
    groups.push([item('select-group', label, icons.group, () => selectGroup(editor, next), t('Ctrl+click'))]);
  }
  const shown = groups.map((group) => group.filter(Boolean)).filter((group) => group.length);
  return (
    <Popover anchor={anchor} onClose={onClose} className="menu context-menu">
      {shown.map((group, k) => [
        k > 0 && <hr key={`hr${k}`} />,
        ...group.map(({ key, label, icon, run, hint }) => (
          <button key={key} type="button" className="item" data-testid={`context-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} onClick={() => {
            onClose();
            run();
          }}>
            <span className="icon">{icon}</span>{label}{hint && <span className="hint">{hint}</span>}
          </button>
        )),
      ])}
    </Popover>
  );
}
