// The Objects panel, bottom left (J: groups out of the selection's panel; a list as Inkscape's Objects): the
// drawing's things and groups (objectList.js), groups unfolding to what they hold. A click on a row selects it
// (a group: as Ctrl+click, outlined), Shift or Ctrl adds; the pointer on a row lights it in the drawing. Group and
// Ungroup at its top, for what is selected. Opened and closed by the tool rail's Objects button (remembered).
// A double click on a group names it (J); a row dragged onto a group goes into it, onto something in a group into
// that group, onto the strip at the bottom out of every group (each one undo step).
import { useMemo, useRef, useState } from 'react';
import { canGroup, canUngroup, groupChain, groupSelection, moveIntoGroup, renameGroup, ungroupSelection, wholeGroups } from '../editor/grouping.js';
import { selectGroup } from '../editor/tools/select.js';
import { objectList } from './objectList.js';
import { icons } from './icons.jsx';
import { t } from '../i18n/i18n.js';

const KIND_ICONS = { molecule: icons.benzene, arrow: icons.rxn, plus: icons.plus, text: icons.text, bracket: icons.bracket, group: icons.group };

export function ObjectsPanel({ editor }) {
  const open = Boolean(editor.settings.objectsPanel);
  const [unfolded, setUnfolded] = useState(() => new Set()); // groups opened by a click on their arrow
  const [renaming, setRenaming] = useState(null); // the group whose name is being typed
  const [dragging, setDragging] = useState(null); // the row being dragged
  const [over, setOver] = useState(null); // where it would go: { key (the row under it, or 'out'), target (a group, or null) }
  const press = useRef(null); // { node, x, y, started } from a press on a row: a drag once it moves 5 px
  const targets = useRef(new Map()); // each row's key → where something dropped on it goes (this drawing of the list)
  const list = useMemo(() => (open ? objectList(editor) : []), [open, editor.docVersion, editor.doc]);
  if (editor.tool.name === 'place' || !editor.doc.atoms.size && !editor.doc.arrows.size && !editor.doc.texts.size && !editor.doc.pluses.size) return null;
  if (!open) return null; // (opened from the rail's Objects button)
  // groups with something selected in them, not selected whole: open, so that it shows where the selection is
  const whole = wholeGroups(editor);
  const around = new Set([...editor.selection].flatMap((id) => groupChain(editor.doc, id)).filter((group) => !whole.has(group)));
  const state = (ids) => {
    const n = ids.filter((id) => editor.selection.has(id)).length;
    return n === 0 ? '' : n === ids.length ? ' selected' : ' partly';
  };
  const light = (ids) => {
    editor.preview = ids ? { kind: 'objects', taking: ids, adding: true } : null;
    editor.emit();
  };
  const pick = (e, node) => {
    if (press.current?.started) return; // (the end of a drag, not a click)
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (node.kind === 'group' && !add) selectGroup(editor, node.group);
    else editor.select(node.ids, { add });
  };
  // dragging (pointer events, as the tabs are dragged: a press, then 5 px): where a row would go if dropped on
  // `node` (in group `parent`): into it if it is a group, else into the group it is in; undefined onto itself
  targets.current = new Map([['out', null]]);
  const targetOf = (node, parent) => (dragging && node.key === dragging.key ? undefined : node.kind === 'group' ? node.group : parent);
  const down = (e, node) => {
    if (e.button !== 0 || renaming !== null || e.target.closest('.fold')) return;
    press.current = { node, x: e.clientX, y: e.clientY, started: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const held = press.current;
    if (!held) return;
    if (!held.started) {
      if (Math.hypot(e.clientX - held.x, e.clientY - held.y) < 5) return;
      held.started = true;
      setDragging(held.node);
      light(null);
    }
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]')?.dataset.drop;
    const target = under === undefined ? undefined : targets.current.get(under);
    const next = target === undefined ? null : { key: under, target };
    if (next?.key !== over?.key) setOver(next);
  };
  const up = () => {
    const held = press.current;
    if (held?.started && over && moveIntoGroup(editor, held.node.item, over.target) && over.target !== null) setUnfolded(new Set([...unfolded, over.target]));
    setDragging(null);
    setOver(null);
    setTimeout(() => {
      press.current = null; // (after the click that ends it, which pick leaves alone)
    });
  };
  const row = (node, depth, parent = null) => {
    const isOpen = node.kind === 'group' && (unfolded.has(node.group) || around.has(node.group));
    targets.current.set(node.key, targetOf(node, parent));
    return [
      <div key={node.key} role="treeitem" aria-expanded={node.kind === 'group' ? isOpen : undefined}
        className={`object-row${state(node.ids)}${dragging?.key === node.key ? ' dragged' : ''}${over?.key === node.key ? ' drop' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }} data-testid={`object-${node.key}`} data-drop={node.key}
        onClick={(e) => pick(e, node)} onPointerEnter={() => !dragging && light(node.ids)} onPointerLeave={() => !dragging && light(null)}
        onDoubleClick={() => node.kind === 'group' && setRenaming(node.group)}
        onPointerDown={(e) => down(e, node)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {node.kind === 'group' ? (
          <button type="button" className={`fold${isOpen ? ' open' : ''}`} aria-label={isOpen ? t('Fold') : t('Unfold')} onClick={(e) => {
            e.stopPropagation();
            const next = new Set(unfolded);
            if (next.has(node.group)) next.delete(node.group);
            else next.add(node.group);
            setUnfolded(next);
          }}>{icons.chevron}</button>
        ) : <span className="fold" />}
        <span className="icon">{KIND_ICONS[node.kind]}</span>
        {renaming === node.group && node.kind === 'group' ? (
          <input className="rename" autoFocus defaultValue={node.named ? node.label : ''} placeholder={t('Group')} spellCheck={false} data-testid="group-rename"
            aria-label={t('Name of the group')} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              e.stopPropagation(); // (the drawing's keys are not the field's)
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setRenaming(null);
            }}
            onBlur={(e) => {
              if (renaming === node.group) renameGroup(editor, node.group, e.currentTarget.value);
              setRenaming(null);
            }} />
        ) : <span className="name" title={node.kind === 'group' ? t('Double-click to name it') : undefined}>{node.label}</span>}
        {node.note && <span className="note">{node.note}</span>}
      </div>,
      ...(isOpen ? node.children.flatMap((child) => row(child, depth + 1, node.kind === 'group' ? node.group : parent)) : []),
    ];
  };
  return (
    <div className="glass objects" role="tree" aria-label={t('Objects')} data-testid="objects" onPointerLeave={() => editor.preview?.kind === 'objects' && light(null)}>
      <div className="objects-head">
        <span className="title">{t('Objects')}</span>
        <button type="button" className="btn" disabled={!canGroup(editor)} onClick={() => groupSelection(editor)} data-testid="objects-group"
          title={t('Group what is selected, to select and move it together (Ctrl+G)')}>{icons.group}</button>
        <button type="button" className="btn" disabled={!canUngroup(editor)} onClick={() => ungroupSelection(editor)} data-testid="objects-ungroup"
          title={t('Take the group apart, one level (Ctrl+Shift+G)')}>{icons.ungroup}</button>
        <button type="button" className="btn" onClick={() => editor.setSettings({ objectsPanel: false })} aria-label={t('Close')} data-testid="objects-close">{icons.close}</button>
      </div>
      <div className="objects-list">{list.flatMap((node) => row(node, 0))}</div>
      {dragging && (
        <div className={`objects-out${over?.key === 'out' ? ' drop' : ''}`} data-testid="objects-out" data-drop="out">{t('Drop here: out of its group')}</div>
      )}
    </div>
  );
}
