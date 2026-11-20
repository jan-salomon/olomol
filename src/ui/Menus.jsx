// Drop-down menus under toolbar buttons: Export, Align, Settings, colours.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { align, alignReaction, GRID_GAP } from '../arrange/align.js';
import { FORMATS } from '../io/files.js';
import { lostIn } from '../io/lost.js';
import { language, LANGUAGES, pickLanguage, t } from '../i18n/i18n.js';
import { copyLink, copyPicture, exportAs, openFile, openRecent, printDrawing, reloadKeepingView } from './actions.js';
import { COLOR_GRIDS, parseColor, recentColors, rememberColor } from './colors.js';
import { icons } from './icons.jsx';

// A floating panel under (or beside) an anchor element; closes on Esc or a
// click outside. One that would reach below the window goes above its
// anchor instead (or up as far as it must).
export function Popover({ anchor, onClose, side = 'below', className = 'menu', children, onPointerEnter, onPointerLeave }) {
  const ref = useRef(null);
  // (the latest onClose, without listening again at every render: the app's own Esc changes the tool, which
  // draws this again while the key is still on its way, and a listener taken off then never hears it)
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Esc closes the menu, and only that (first, before the app takes it for the tool or the selection)
    const key = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close.current();
    };
    const click = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return;
      // a colour picker opened from this menu lies outside it, in the page
      if (e.target.closest?.('.color-picker') && !ref.current?.classList.contains('color-picker')) return;
      close.current();
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', click, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', click, true);
    };
  }, [anchor]);
  const rect = anchor?.getBoundingClientRect();
  const style = !rect ? {} : side === 'right'
    // beside; low in the window, ending level with the anchor's bottom
    ? { left: rect.right + 8, ...(rect.top + rect.height / 2 > window.innerHeight / 2 ? { bottom: Math.max(8, window.innerHeight - rect.bottom - 6) } : { top: Math.max(8, rect.top - 6) }) }
    : side === 'above'
      ? { left: Math.max(8, rect.left + rect.width / 2 - 150), bottom: window.innerHeight - rect.top + 8 }
      : side === 'above-right'
        // above, ending at the anchor's right edge (the help button in the corner)
        ? { right: Math.max(8, window.innerWidth - rect.right), bottom: window.innerHeight - rect.top + 10 }
      // below; on the right half of the window, ending at the anchor's right edge
      : rect.left + rect.width / 2 > window.innerWidth / 2
        ? { right: Math.max(8, window.innerWidth - rect.right), top: rect.bottom + 8 }
        : { left: Math.max(8, rect.left), top: rect.bottom + 8 };
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !rect) return;
    element.style.translate = '';
    const box = element.getBoundingClientRect();
    const over = box.bottom - (window.innerHeight - 8);
    if (over <= 0) return;
    const above = rect.top - 8 - box.height;
    const dy = side === 'below' && above >= 8 ? above - box.top : -Math.min(over, box.top - 8);
    element.style.translate = `0 ${dy}px`;
  });
  // Keys typed in a menu (digits in a field) must not reach the drawing's shortcuts; Esc closes it.
  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
  };
  // In the page itself, not inside a toolbar (a menu stays above the panels).
  return createPortal(<div ref={ref} className={`glass ${className}`} style={style} onKeyDown={onKeyDown} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>{children}</div>, document.body);
}

// Open's menu, once there are recent files: they (opened or saved, newest first; a click opens one again,
// actions.js openRecent), then a file from this computer (the browser's dialog, as Ctrl+O), then the drawing's
// earlier versions (as a click on the Autosaved mark), once it has been kept
export function OpenMenu({ editor, anchor, fit, onClose, onVersions }) {
  const when = (at) => new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="title">{t('Recent files')}</div>
      {(editor.recent ?? []).map((entry, index) => (
        <button key={`${entry.name}-${entry.at}`} type="button" className="item" data-testid={`recent-${index}`} title={entry.handle ? entry.name : t('{file} (a copy olomol kept: this browser opens no files itself)', { file: entry.name })} onClick={() => {
          onClose();
          openRecent(editor, entry, fit);
        }}>{entry.name}<span className="hint">{when(entry.at)}</span></button>
      ))}
      <hr />
      <button type="button" className="item" data-testid="open-computer" onClick={() => {
        onClose();
        openFile(editor, fit);
      }}>{t('Open a file from this computer…')}<span className="hint">Ctrl+O</span></button>
      {editor.keeping && onVersions && (
        <>
          <hr />
          <button type="button" className="item" data-testid="open-versions" onClick={() => {
            onClose();
            onVersions();
          }}>{t('Earlier versions of this drawing…')}</button>
        </>
      )}
    </Popover>
  );
}

export function ExportMenu({ editor, anchor, onClose }) {
  // (see-through unless ticked, remembered with the settings)
  const background = Boolean(editor.settings.whiteBackground);
  const setBackground = (whiteBackground) => editor.setSettings({ whiteBackground });
  const [selectionOnly, setSelectionOnly] = useState(editor.selection.size > 0); // ticked when something is selected
  const run = (format) => {
    onClose();
    exportAs(editor, format, { background: background ? '#ffffff' : null, selectionOnly });
  };
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="title">{t('Picture')}</div>
      <button type="button" className="item" onClick={() => run('svg')}>SVG<span className="hint">{t('vector, for Inkscape')}</span></button>
      <button type="button" className="item" onClick={() => run('png')}>PNG<span className="hint">{t('4× resolution')}</span></button>
      <button type="button" className="item" onClick={() => {
        onClose();
        copyPicture(editor, { background: background ? '#ffffff' : null });
      }}>{t('Copy as picture')}<span className="hint">{t('Ctrl+Shift+C')}</span></button>
      <button type="button" className="item" data-testid="print" onClick={() => {
        onClose();
        printDrawing(editor, { selectionOnly });
      }}>{t('PDF / Print…')}<span className="hint">{t('Save as PDF in the print window')}</span></button>
      <label className="item"><input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />{t('White background')}</label>
      <hr />
      <button type="button" className="item" data-testid="copy-link" onClick={() => {
        onClose();
        copyLink(editor);
      }}>{t('Copy link')}<span className="hint">{t('the drawing inside the link')}</span></button>
      <hr />
      <div className="title">{t('Structure file')}</div>
      {Object.entries(FORMATS).filter(([, { held }]) => !held).map(([format, { label, ext }]) => {
        // (what of this drawing the format can't hold, said before it is picked)
        const lost = lostIn(editor.doc, format, selectionOnly && editor.selection.size ? [...new Set([...editor.selection, ...editor.selectedAtoms()])] : null);
        return (
          <button key={format} type="button" className="item" data-testid={`export-${format}`} onClick={() => run(format)}>
            <span className="format">{label}{lost.length > 0 && <span className="lost">{t('without {what}', { what: lost.join(', ') })}</span>}</span>
            <span className="hint">.{ext}</span>
          </button>
        );
      })}
      <hr />
      <label className="item"><input type="checkbox" checked={selectionOnly} onChange={(e) => setSelectionOnly(e.target.checked)} />{t('Only the selection')}</label>
    </Popover>
  );
}

// 20×20 line icons for the align actions: boxes are the objects.
const box = (x, y, w, h) => <rect x={x} y={y} width={w} height={h} rx="1" />;
const dashed = { strokeDasharray: '2 1.5' };
const centresH = <>{box(2, 6, 3, 8)}{box(7.5, 6, 5, 8)}{box(15, 6, 3, 8)}<path d="M3.5 2.5v2M10 2.5v2M16.5 2.5v2M3.5 15.5v2M10 15.5v2M16.5 15.5v2" /></>;
const gapsH = <>{box(1.5, 5, 3, 10)}{box(7.5, 5, 5, 10)}{box(15.5, 5, 3, 10)}<path d="M5.3 10h1.4M13.3 10h1.4" /></>;
const ALIGN_ICONS = {
  left: <><path d="M3 2v16" />{box(5, 4, 11, 4)}{box(5, 12, 6, 4)}</>,
  centre: <><path d="M10 2v16" {...dashed} />{box(3.5, 4, 13, 4)}{box(6.5, 12, 7, 4)}</>,
  right: <><path d="M17 2v16" />{box(4, 4, 11, 4)}{box(9, 12, 6, 4)}</>,
  top: <><path d="M2 3h16" />{box(4, 5, 4, 11)}{box(12, 5, 4, 6)}</>,
  middle: <><path d="M2 10h16" {...dashed} />{box(4, 3.5, 4, 13)}{box(12, 6.5, 4, 7)}</>,
  bottom: <><path d="M2 17h16" />{box(4, 4, 4, 11)}{box(12, 9, 4, 6)}</>,
  'centres-x': centresH,
  'gaps-x': gapsH,
  'centres-y': <g transform="rotate(90 10 10)">{centresH}</g>,
  'gaps-y': <g transform="rotate(90 10 10)">{gapsH}</g>,
  grid: <>{box(3, 3, 5.5, 5.5)}{box(11.5, 3, 5.5, 5.5)}{box(3, 11.5, 5.5, 5.5)}{box(11.5, 11.5, 5.5, 5.5)}</>,
};
const ALIGN_ROWS = [
  [t('Align'), [['left', t('Align left edges')], ['centre', t('Align centres (horizontally)')], ['right', t('Align right edges')],
    ['top', t('Align top edges')], ['middle', t('Align middles (vertically)')], ['bottom', t('Align bottom edges')]]],
  [t('Space evenly'), [['centres-x', t('Horizontally: equal distances between centres')], ['gaps-x', t('Horizontally: equal gaps')],
    ['centres-y', t('Vertically: equal distances between centres')], ['gaps-y', t('Vertically: equal gaps')]]],
];

export const AlignIcon = ({ action }) => (
  <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    {ALIGN_ICONS[action]}
  </svg>
);

// Stays open, so several actions can follow each other.
export function AlignMenu({ editor, anchor, onClose }) {
  const [columns, setColumns] = useState('');
  const [gap, setGap] = useState('');
  const run = (action) => align(editor, action, Number(columns) || 0, gap === '' || !(Number(gap) >= 0) ? GRID_GAP : Number(gap));
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <button type="button" className="item" onClick={() => alignReaction(editor)}>
        {icons.alignReaction} {t('Align reaction scheme')}<span className="hint">{t('one row')}</span>
      </button>
      <hr />
      {ALIGN_ROWS.map(([title, actions]) => (
        <div key={title}>
          <div className="title">{title}</div>
          <div className="row" style={{ padding: '0 6px' }}>
            {actions.map(([action, label]) => (
              <button key={action} type="button" className="btn" title={label} aria-label={label} onClick={() => run(action)}><AlignIcon action={action} /></button>
            ))}
          </div>
        </div>
      ))}
      <div className="title">{t('Grid')}</div>
      <div className="row" style={{ padding: '0 6px 4px' }}>
        <span className="small">{t('Columns')}</span>
        <input className="field" type="number" min="1" placeholder={t('auto')} value={columns} onChange={(e) => setColumns(e.target.value)} />
        <span className="small" title={t('Space between the cells, in bond lengths')}>{t('Gap')}</span>
        <input className="field" type="number" min="0" step="0.25" placeholder={String(GRID_GAP)} value={gap} onChange={(e) => setGap(e.target.value)}
          title={t('Space between the cells, in bond lengths')} data-testid="grid-gap" />
        <button type="button" className="btn" title={t('Arrange in a grid')} aria-label={t('Arrange in a grid')} onClick={() => run('grid')}><AlignIcon action="grid" /></button>
      </div>
    </Popover>
  );
}

const Choice = ({ value, options, onChange }) => (
  <span className="seg">
    {options.map(([key, label]) => (
      <button key={key} type="button" className={value === key ? 'on' : ''} onClick={() => onChange(key)}>{label}</button>
    ))}
  </span>
);

// Small flags for the language buttons (drawn here: flag emoji don't show on Windows).
const flag = (children) => <svg className="flag" viewBox="0 0 18 12" width="18" height="12" aria-hidden="true">{children}</svg>;
const FLAGS = {
  en: flag(<>
    <rect width="18" height="12" fill="#012169" />
    <path d="M0 0L18 12M18 0L0 12" stroke="#fff" strokeWidth="2.4" />
    <path d="M0 0L18 12M18 0L0 12" stroke="#c8102e" strokeWidth="0.9" />
    <path d="M9 0V12M0 6H18" stroke="#fff" strokeWidth="3.6" />
    <path d="M9 0V12M0 6H18" stroke="#c8102e" strokeWidth="2" />
  </>),
  cs: flag(<>
    <rect width="18" height="6" fill="#fff" />
    <rect y="6" width="18" height="6" fill="#d7141a" />
    <path d="M0 0L9 6L0 12Z" fill="#11457e" />
  </>),
  de: flag(<>
    <rect width="18" height="4" fill="#000" />
    <rect y="4" width="18" height="4" fill="#dd0000" />
    <rect y="8" width="18" height="4" fill="#ffce00" />
  </>),
};

export function SettingsMenu({ editor, anchor, onClose, theme, setTheme, onCustomStyle }) {
  const s = editor.settings;
  return (
    <Popover anchor={anchor} onClose={onClose} className="menu settings">
      <div className="title">{t('Drawing')}</div>
      <div className="row" style={{ padding: '2px 10px' }} title={t("ACS: ChemDraw's ACS Document 1996 (bonds 14.4 pt, lines 0.6 pt, Arial 10 pt); RSC: what the RSC asks (12.2 pt, 0.5 pt, Arial 7 pt); pictures then come out at that size. Slides: thicker, for a projector. Custom: sizes and font of your own. For this drawing (kept in its file)")}>
        <span className="name">{t('Style')}</span>
        <span className="seg" data-testid="style-choice">
          {[['screen', t('Screen')], ['acs', 'ACS'], ['rsc', 'RSC'], ['slides', t('Slides')]].map(([style, name]) => (
            <button key={style} type="button" className={editor.drawingStyle().style === style ? 'on' : ''} data-testid={`style-${style}`} onClick={() => editor.setDrawingStyle(style)}>{name}</button>
          ))}
          <button type="button" className={editor.drawingStyle().style === 'custom' ? 'on' : ''} data-testid="style-custom" onClick={() => {
            onClose();
            onCustomStyle?.();
          }}>{t('Custom…')}</button>
        </span>
      </div>
      {/* (charges and lone pairs: within the style, under it, whatever its preset (no journal's says which); kept in
          the drawing's file as its sizes are; carbons aren't, a drawing often has both kinds) */}
      <div className="row sub" style={{ padding: '2px 10px' }} title={t('For this drawing (kept in its file)')}>
        <span className="name">{t('Charges')}</span>
        <Choice value={editor.drawingStyle().charges ?? 'plain'} options={[['plain', '+ −'], ['circled', '⊕ ⊖']]} onChange={(charges) => editor.setDrawingLook({ charges })} />
      </div>
      <div className="row sub" style={{ padding: '2px 10px' }} title={t('For this drawing (kept in its file)')}>
        <span className="name">{t('Lone pairs')}</span>
        <Choice value={editor.drawingStyle().lonePairs ?? 'dots'} options={[['dots', t('Dots ··')], ['bars', t('Bars (Lewis)')]]} onChange={(lonePairs) => editor.setDrawingLook({ lonePairs })} />
      </div>
      {/* (this drawing's style for new drawings too: only when it isn't already) */}
      {JSON.stringify(editor.drawingStyle()) !== JSON.stringify(editor.defaultStyle()) && (
        <div className="row" style={{ padding: '0 10px 2px' }}>
          <span className="name" />
          <span className="seg">
            <button type="button" data-testid="style-default" title={t('New drawings, and files that say no style, will be drawn in this style')}
              onClick={() => editor.setDefaultStyle(editor.drawingStyle())}>{t('Use for new drawings')}</button>
          </span>
        </div>
      )}
      <div className="row" style={{ padding: '2px 10px' }}>
        <span className="name">{t('Atom colours')}</span>
        <Choice value={s.colorMode} options={[['element', t('By element')], ['mono', t('Black')]]} onChange={(colorMode) => editor.setSettings({ colorMode })} />
      </div>
      <div className="row" style={{ padding: '2px 10px' }} title={t('All C: every carbon written (CH₃, CH₂, CH), for those who don\'t yet read a corner as a carbon')}>
        <span className="name">{t('Carbons')}</span>
        <Choice value={s.allCarbons ? 'all' : s.terminalCarbons ? 'on' : 'off'} options={[['on', 'CH₃'], ['off', t('Plain line')], ['all', t('All C')]]}
          onChange={(v) => editor.setSettings({ terminalCarbons: v !== 'off', allCarbons: v === 'all' })} />
      </div>
      <div className="row" style={{ padding: '2px 10px' }}>
        <span className="name">{t('Aromatic')}</span>
        <Choice value={s.aromaticStyle ?? 'circle'} options={[['circle', t('Circle')], ['dashed', t('Dashed')]]} onChange={(aromaticStyle) => editor.setSettings({ aromaticStyle })} />
      </div>
      <div className="row" style={{ padding: '2px 10px' }} title={t('Coordination (dative) bonds in the page: arrows from the donor, or plain lines as complexes are often drawn; with depth they are wedges either way')}>
        <span className="name">{t('Coordination')}</span>
        <Choice value={s.dativeStyle ?? 'arrow'} options={[['arrow', '→'], ['line', t('Line')]]} onChange={(dativeStyle) => editor.setSettings({ dativeStyle })} />
      </div>
      <div className="row" style={{ padding: '2px 10px' }} title={t('The invisible links that make molecules one compound (One compound in the panel), on screen only')}>
        <span className="name">{t('Links')}</span>
        <Choice value={s.showLinks ? 'on' : 'off'} options={[['off', t('hidden')], ['on', t('shown')]]} onChange={(v) => editor.setSettings({ showLinks: v === 'on' })} />
      </div>
      <div className="row" style={{ padding: '2px 10px' }}>
        <span className="name">{t('New arrows')}</span>
        <Swatches value={s.arrowColor ?? null} onPick={(arrowColor) => editor.setSettings({ arrowColor })} />
      </div>
      <hr />
      <div className="title">{t('Window')}</div>
      <div className="row" style={{ padding: '2px 10px' }}>
        <span className="name">{t('Language')}</span>
        {/* the page loads again in the new language; the drawing and the view are kept */}
        <span className="seg languages">
          {LANGUAGES.map(([code, name]) => (
            <button key={code} type="button" className={language === code ? 'on' : ''} title={name} aria-label={name} data-testid={`language-${code}`}
              onClick={() => {
                if (code === language) return;
                pickLanguage(code);
                reloadKeepingView(editor);
              }}>
              {FLAGS[code]}{code.toUpperCase()}
            </button>
          ))}
        </span>
      </div>
      <div className="row" style={{ padding: '2px 10px' }}>
        <span className="name">{t('Theme')}</span>
        <Choice value={theme} options={[['auto', t('Auto')], ['light', t('Light')], ['dark', t('Dark')]]} onChange={setTheme} />
      </div>
      <div className="row" style={{ padding: '2px 10px' }} title={t('Short animations, as of a ring flip; off: a change shows at once')}>
        <span className="name">{t('Animations')}</span>
        <Choice value={editor.animationsOn() ? 'on' : 'off'} options={[['on', t('On')], ['off', t('Off')]]} onChange={(v) => editor.setSettings({ animations: v === 'on' })} />
      </div>
      <div className="row" style={{ padding: '2px 10px 6px' }}>
        <span className="name">{t('Debug')}</span>
        <Choice value={editor.debug ? 'on' : 'off'} options={[['off', t('Off')], ['on', t('On')]]} onChange={(v) => editor.setDebug(v === 'on')} />
      </div>
    </Popover>
  );
}

// Colours offered for atoms, bonds, arrows and text: dark enough for
// paper, apart enough to tell apart.
export const PALETTE = [
  ['#000000', t('black')], ['#d40000', t('red')], ['#0044cc', t('blue')], ['#008800', t('green')], ['#e06000', t('orange')],
  ['#7a00b0', t('purple')], ['#0b8a8a', t('teal')], ['#c2185b', t('magenta')], ['#8d6e63', t('brown')], ['#78909c', t('grey')],
];

// Soft colours for highlights (RDKit's are like these), light enough for
// black bonds and labels on top.
export const HIGHLIGHTS = [
  ['#ffb3b3', t('Red highlight')], ['#ffd59e', t('Orange highlight')], ['#fff09a', t('Yellow highlight')], ['#b9e8b0', t('Green highlight')],
  ['#b5dcff', t('Blue highlight')], ['#d9bdff', t('Purple highlight')], ['#ffbde4', t('Pink highlight')], ['#dcdcdc', t('Grey highlight')],
];

// The colours used last (of `list`, see colors.js) that aren't in the palette, as [colour, name].
export const recentExtras = (palette = PALETTE, list = 'paint') => recentColors(list).filter((c) => !palette.some(([p]) => p === c)).slice(0, 4).map((c) => [c, c]);

export function Swatches({ value, onPick, allowNone = true, palette = PALETTE, custom = true, list = 'paint', noneTitle = t('Default colour') }) {
  const [picker, setPicker] = useState(null); // the rainbow button, while the picker is open
  const shown = custom ? [...palette, ...recentExtras(palette, list)] : palette;
  const other = value && !shown.some(([c]) => c === value);
  return (
    <div className="swatches">
      {allowNone && <button type="button" className={`swatch none${value == null ? ' on' : ''}`} title={noneTitle} aria-label={noneTitle} onClick={() => onPick(null)} />}
      {shown.map(([color, name]) => (
        <button key={color} type="button" className={`swatch${value === color ? ' on' : ''}`} style={{ background: color }} title={name} aria-label={name} onClick={() => onPick(color)} />
      ))}
      {custom && (
        <button type="button" className={`swatch custom${other ? ' on' : ''}`} title={t('More colours, or a colour code')} aria-label={t('More colours, or a colour code')}
          data-testid="more-colours" onClick={(e) => setPicker(picker ? null : e.currentTarget)} />
      )}
      {picker && <ColorPicker anchor={picker} value={value} list={list} onClose={() => setPicker(null)} onPick={(color) => {
        setPicker(null);
        onPick(color);
      }} />}
    </div>
  );
}

// More colours: the ones used last, a grid by hue and lightness, a colour
// code (#c05, #cc0055, rgb(…), a name) and the system's colour dialog.
// Whatever is picked is remembered for next time, in `list` (highlights apart).
export function ColorPicker({ anchor, value, onPick, onClose, side = 'below', list = 'paint' }) {
  const [text, setText] = useState(value ?? '');
  const typed = parseColor(text);
  const pick = (color) => {
    rememberColor(color, list);
    onPick(color);
  };
  const recent = recentColors(list);
  return (
    <Popover anchor={anchor} onClose={onClose} side={side} className="menu color-picker">
      {recent.length > 0 && (
        <>
          <div className="title">{t('Used last')}</div>
          <div className="grid">
            {recent.map((c) => <button key={c} type="button" className={`swatch${value === c ? ' on' : ''}`} style={{ background: c }} title={c} aria-label={c} onClick={() => pick(c)} />)}
          </div>
        </>
      )}
      <div className="title">{t('Colours')}</div>
      <div className="grid">
        {COLOR_GRIDS[list].flat().map((c) => <button key={c} type="button" className={`cell${value === c ? ' on' : ''}`} style={{ background: c }} title={c} aria-label={c} onClick={() => pick(c)} />)}
      </div>
      <div className="row code">
        <span className="swatch" style={{ background: typed ?? 'transparent' }} />
        <input className="field" value={text} placeholder="#cc0055" spellCheck={false} data-testid="colour-code" aria-label={t('Colour code')}
          title={t('A colour code: #cc0055, #c05, rgb(204, 0, 85) or a name (teal); Enter takes it')} autoFocus
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && typed && pick(typed)} />
        <button type="button" className="btn" disabled={!typed} onClick={() => pick(typed)}>{t('OK')}</button>
        <label className="swatch custom" title={t("The system's colour dialog")} aria-label={t("The system's colour dialog")}>
          <input type="color" value={typed ?? value ?? '#000000'} onChange={(e) => setText(e.target.value)} />
        </label>
      </div>
    </Popover>
  );
}
