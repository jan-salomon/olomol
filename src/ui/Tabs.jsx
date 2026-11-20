// The drawings open, as tabs under the top bar (ui/tabs.js): shown once there are two, the drawing's name then on
// its tab only (the top bar's name field gone). A click shows one, a double click on the one in front renames it,
// its × or a middle click closes it (asking first if it has unsaved changes), + makes a new drawing at the end; a
// right click opens its menu (Duplicate drawing, Rename, Close); a
// tab dragged along the others moves among them as the pointer passes their middles. The dot: changes not in its
// file yet, where its × is (the × there while the pointer is on the tab, and on the one in front if saved). Not while a window on the drawing is open (Redraw, Turn in 3D), a text is typed or a
// drag goes on: those belong to the drawing in front.
import { useRef, useState } from 'react';
import { saveFile } from './actions.js';
import { canSwitch, closeTab, duplicateTab, moveTab, newTab, showTab, shownTitle } from './tabs.js';
import { isNewTitle, newTitle } from '../editor/editor.js';
import { icons } from './icons.jsx';
import { Popover } from './Menus.jsx';
import { t } from '../i18n/i18n.js';

export function Tabs({ editor, blocked }) {
  const strip = useRef(null);
  const drag = useRef(null); // { id, x, moved }: a tab held down, and whether it has been dragged (then no click)
  const [renaming, setRenaming] = useState(null); // the drawing id whose tab is being renamed
  const [menu, setMenu] = useState(null); // { id, x, y }: a tab's right-click menu
  if (editor.tabs.length < 2) return null;
  // a name typed on the tab: the drawing's (empty: the name it had)
  const rename = (value) => {
    const name = value.trim();
    if (name) editor.title = name;
    else if (!isNewTitle(editor.title)) editor.title = editor.title || newTitle();
    setRenaming(null);
    editor.emit();
  };
  // the position the pointer is at among the tabs: the number of other tabs whose middle is left of it
  const placeAt = (x, id) => [...strip.current.querySelectorAll('.tab')].filter((tab) => tab.dataset.id !== id)
    .filter((tab) => {
      const box = tab.getBoundingClientRect();
      return box.left + box.width / 2 < x;
    }).length;
  const down = (e, id) => {
    if (e.button !== 0 || e.target.closest('.close')) return;
    drag.current = { id, x: e.clientX, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const held = drag.current;
    if (!held) return;
    if (!held.moved && Math.abs(e.clientX - held.x) < 6) return; // (a click wobbles a little)
    held.moved = true;
    moveTab(editor, held.id, placeAt(e.clientX, held.id));
  };
  const up = () => {
    setTimeout(() => {
      drag.current = null;
    });
  };
  const off = blocked || !canSwitch(editor);
  const close = (id) => closeTab(editor, id, { save: () => saveFile(editor) });
  return (
    <div ref={strip} className={`glass tabs${off ? ' off' : ''}`} role="tablist" aria-label={t('Open drawings')} data-testid="tabs">
      {editor.tabs.map((tab, index) => {
        const front = tab.id === editor.drawingId;
        const title = shownTitle(front ? editor.title : tab.title);
        const unsaved = front ? editor.unsaved : tab.unsaved;
        const file = front ? editor.file : tab.own?.file;
        return (
          <div key={tab.id} className={`tab${front ? ' front' : ''}${unsaved ? ' unsaved' : ''}${drag.current?.moved && drag.current.id === tab.id ? ' dragged' : ''}`} role="tab" aria-selected={front}
            data-testid={`tab-${index}`} data-id={tab.id}
            title={`${file ? t('{name}: {file}', { name: title, file: file.name }) : t('{name}: not saved in a file yet', { name: title })}${front ? `\n${t('Double-click to rename it')}` : ''}`}
            onDoubleClick={() => front && !off && setRenaming(tab.id)}
            onPointerDown={(e) => down(e, tab.id)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onClick={() => !off && !drag.current?.moved && showTab(editor, tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1 && !off) close(tab.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!off) setMenu({ id: tab.id, x: e.clientX, y: e.clientY });
            }}>
            {renaming === tab.id && front ? (
              <input className="rename" autoFocus defaultValue={isNewTitle(editor.title) ? '' : editor.title} placeholder={t('New drawing')} spellCheck={false}
                size={Math.max(3, (isNewTitle(editor.title) ? t('New drawing') : editor.title).length)} aria-label={t('Name of the drawing (for its files)')} data-testid="tab-rename"
                onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  e.stopPropagation(); // (the drawing's keys are not the field's)
                  if (e.key === 'Enter') rename(e.currentTarget.value);
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={(e) => renaming && rename(e.currentTarget.value)} />
            ) : <span className="name">{title}</span>}
            {/* (the dot and the × in one place: the dot until the pointer comes, then the ×) */}
            <span className="end">
              {unsaved && <span className="tab-dot" aria-label={t('Changes not saved in a file yet')} />}
              <button type="button" className="close" disabled={off} aria-label={t('Close {name}', { name: title })} data-testid={`tab-close-${index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  close(tab.id);
                }}>{icons.close}</button>
            </span>
          </div>
        );
      })}
      {menu && editor.tabs.some((tab) => tab.id === menu.id) && (
        <Popover anchor={{ getBoundingClientRect: () => new DOMRect(menu.x, menu.y - 8, 0, 0), contains: () => false }}
          onClose={() => setMenu(null)} className="menu context-menu">
          {[
            ['duplicate', t('Duplicate drawing'), icons.duplicate, () => duplicateTab(editor, menu.id)],
            ['rename', t('Rename'), icons.text, async () => {
              if (await showTab(editor, menu.id)) setRenaming(menu.id);
            }],
            ['close', t('Close'), icons.close, () => close(menu.id)],
          ].map(([key, label, icon, run]) => (
            <button key={key} type="button" className="item" data-testid={`tab-menu-${key}`} onClick={() => {
              setMenu(null);
              run();
            }}><span className="icon">{icon}</span>{label}</button>
          ))}
        </Popover>
      )}
      <button type="button" className="btn new-tab" disabled={off} title={t('New drawing')} aria-label={t('New drawing')} onClick={() => newTab(editor, { always: true })} data-testid="tab-new">+</button>
    </div>
  );
}
