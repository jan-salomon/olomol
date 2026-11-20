// The toolbars: file and arrange actions on top, drawing tools on the left,
// elements and rings at the bottom (as in ChemSketch).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flip } from '../arrange/align.js';
import { SearchBar } from './Search.jsx';
import { elementColor } from '../chem/elements.js';
import { pickElement, pressTool } from '../editor/tools.js';
import { forDarkBackground } from '../render/svg.js';
import { newDrawing, openFile, saveFile, snapPressed } from './actions.js';
import { t } from '../i18n/i18n.js';
import { keyOf, toolHint } from './keys.js';
import { isNewTitle, newTitle } from '../editor/editor.js';
import { RELEASED, VERSION, WHATS_NEW } from './report.js';
import { icons, RingIcon } from './icons.jsx';
import { install, installOffer, onInstallOffer } from './install.js';
import { AlignMenu, ColorPicker, ExportMenu, HIGHLIGHTS, OpenMenu, PALETTE, Popover, recentExtras, SettingsMenu } from './Menus.jsx';

function Btn({ title, onClick, on, toggled, disabled, children, label, labelClass = '', testId }) {
  return (
    <button type="button" className={`btn${on ? ' on' : ''}${toggled ? ' toggled' : ''}`} title={title} aria-label={title}
      onClick={onClick} disabled={disabled} data-testid={testId}>
      {children}
      {label && <span className={`label${labelClass ? ` ${labelClass}` : ''}`}>{label}</span>}
    </button>
  );
}

// A bar as full as there is room for: where it doesn't fit, the top bar's words go one step at a time
// (data-compact, app.css): Turn in 3D's word, then the other buttons' words, then the drawing's name, then olomol's.
// Then, in both bars, whole groups (data-group, the last first: `order`) go into the bar's ⋯ menu (data-out on
// each, data-overflow on the bar: how many). Measured, not by the window's width, so it fits in every language and
// with a name of any length. The top bar ends left of the group at the top right; the bottom bar in the window.
const COMPACT_STEPS = 4;
function useFitted(bar, deps, { steps = 0, order = [], right = null } = {}) {
  useLayoutEffect(() => {
    const fit = () => {
      const el = bar.current;
      if (!el) return;
      const corner = right && document.querySelector(right);
      const limit = (corner ? corner.getBoundingClientRect().left : window.innerWidth) - 8;
      const fits = () => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= limit;
      const groups = order.map((name) => el.querySelector(`[data-group="${name}"]`)).filter(Boolean);
      for (const group of groups) delete group.dataset.out;
      el.dataset.overflow = '0';
      let step = 0;
      for (; step <= steps; step++) {
        el.dataset.compact = String(step);
        if (fits()) return;
      }
      el.dataset.compact = String(steps);
      for (let k = 1; k <= groups.length; k++) {
        groups[k - 1].dataset.out = '';
        el.dataset.overflow = String(k);
        if (fits()) return;
      }
    };
    fit();
    window.addEventListener('resize', fit);
    // (the group at the top right changes too: Install comes and goes)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    const corner = right && document.querySelector(right);
    if (observer && corner) observer.observe(corner);
    return () => {
      window.removeEventListener('resize', fit);
      observer?.disconnect();
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// The ⋯ button at a bar's end, there while groups are out of it, and its menu: their buttons, each doing what it
// does in the bar (a click on it there). `list`: as a list with their names (the top bar's), else as they look in
// the bar, side by side (the elements and rings).
function More({ bar, side = 'below', list = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const groups = open ? [...(bar.current?.querySelectorAll('[data-group][data-out]') ?? [])]
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((group) => [...group.querySelectorAll('button')]) : [];
  const run = (button) => {
    setOpen(false);
    // (a menu of the bar's own, Align's, opens at this button: its own is out of sight)
    button.click();
  };
  // a button's name: its tooltip up to the first explanation
  const name = (button) => (button.getAttribute('aria-label') || button.title || button.textContent).split(/[:(]| — /)[0].trim();
  return (
    <span ref={ref} className="more" data-more="">
      <Btn title={t('More')} onClick={() => setOpen(!open)} testId={list ? 'top-more' : 'dock-more'}>{icons.more}</Btn>
      {open && (
        <Popover anchor={ref.current?.firstElementChild} side={side} className={list ? 'menu more-menu' : 'menu more-grid'} onClose={() => setOpen(false)}>
          {groups.map((buttons, k) => [
            k > 0 && list && <hr key={`hr${k}`} />,
            ...buttons.map((button, i) => (list ? (
              <button key={`${k}-${i}`} type="button" className="item" onClick={() => run(button)}>
                <span className="icon" dangerouslySetInnerHTML={{ __html: button.querySelector('svg')?.outerHTML ?? '' }} />{name(button)}
              </button>
            ) : (
              <button key={`${k}-${i}`} type="button" className={button.className} style={{ color: button.style.color }} title={button.title} aria-label={button.getAttribute('aria-label') ?? button.title}
                onClick={() => run(button)} dangerouslySetInnerHTML={{ __html: button.innerHTML }} />
            ))),
          ])}
        </Popover>
      )}
    </span>
  );
}
// (the groups that go first when the bars are short of room)
const TOP_OVERFLOW = ['view', 'chairs', 'arrange', 'anew'];
const DOCK_OVERFLOW = ['rings', 'elements'];

// The top bar in groups, | between them: the drawing's file (New, Open, Save, Export) | Undo, Redo | drawing it
// anew (Redraw, Turn in 3D) | arranging (Align, the flips, a bond horizontal) | chairs (Ring flip, Turn a chair) |
// the view (zoom, fit)
export function TopBar({ editor, fit, onRelayout, onTurn3D, onVersions, onShow }) {
  const [menu, setMenu] = useState(null);
  const bar = useRef(null);
  // (again when the words change: another language, another name)
  useFitted(bar, [editor.title, editor.tabs.length < 2, t('Redraw')], { steps: COMPACT_STEPS, order: TOP_OVERFLOW, right: '.topright' });
  const exportRef = useRef(null);
  const openRef = useRef(null);
  const alignRef = useRef(null);
  const { scale } = editor.view;
  const zoom = (k) => editor.zoomAt(k, window.innerWidth / 2, window.innerHeight / 2);
  return (
    <div className="glass topbar" ref={bar}>
      <div className="brand"><img className="brand-mark" src="icons/icon.svg" alt="" />olomol</div>
      {/* (the name on its tab once there are tabs; a new drawing's: empty here, "New drawing" in grey, its file still
          suggested under the date and time) */}
      {editor.tabs.length < 2 && (
        <input className="title-field" value={isNewTitle(editor.title) ? '' : editor.title} placeholder={t('New drawing')}
          aria-label={t('Name of the drawing (for its files)')} title={t('Name of the drawing (for its files)')}
          size={Math.max(8, (isNewTitle(editor.title) ? t('New drawing') : editor.title).length)} spellCheck={false}
          onChange={(e) => {
            editor.title = e.target.value || newTitle();
            editor.emit();
          }}
          onBlur={(e) => {
            editor.title = e.target.value.trim() || (isNewTitle(editor.title) ? editor.title : newTitle());
            editor.emit();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }} />
      )}
      <KeptMark editor={editor} onVersions={onVersions} />
      <Btn title={t('New drawing')} onClick={() => newDrawing(editor)} testId="new-drawing">{icons.newDoc}</Btn>
      {/* (with recent files: a small menu, them and the computer's files; without: the computer's at once) */}
      <span ref={openRef}><Btn title={t('Open a file (Ctrl+O): olomol drawings (.olom), KET, molfile, SDF, RXN, CDXML, CDX, SMILES, XYZ')} testId="open"
        onClick={() => (editor.recent?.length ? setMenu(menu === 'open' ? null : 'open') : openFile(editor, fit))}>{icons.open}</Btn></span>
      <Btn title={editor.file?.format === 'olom'
        ? t('Save into {file} (Ctrl+S); Save as: Ctrl+Shift+S', { file: editor.file.name })
        : t('Save (Ctrl+S) as an olomol drawing (.olom)')}
        onClick={() => saveFile(editor)} testId="save">
        {icons.save}{editor.unsaved && <span className="unsaved-dot" title={t('Changes not saved in a file yet')} data-testid="unsaved" />}
      </Btn>
      <span ref={exportRef}><Btn title={t('Export: SVG, PNG, molfile, SMILES, InChI…')} onClick={() => setMenu(menu === 'export' ? null : 'export')} label={t('Export')} testId="export">{icons.export}</Btn></span>
      <span className="sep" />
      <Btn title={t('Undo (Ctrl+Z)')} onClick={() => editor.undo()} disabled={!editor.undoStack.length}>{icons.undo}</Btn>
      <Btn title={t('Redo (Ctrl+Shift+Z)')} onClick={() => editor.redo()} disabled={!editor.redoStack.length}>{icons.redo}</Btn>
      <span className="bar-group" data-group="anew">
      <span className="sep" />
      <Btn title={t('Redraw: pick from several drawings of the selected molecule, or of only its selected part')} onClick={onRelayout} label={t('Redraw')} testId="relayout">{icons.layout}</Btn>
      <Btn title={t('Turn in 3D: turn the selected molecule as you like, see it as it will be drawn, then use that view')} onClick={onTurn3D} label={t('Turn in 3D')} labelClass="roomy" testId="turn3d">{icons.turn3d}</Btn>
      </span>
      <span className="bar-group" data-group="arrange">
      <span className="sep" />
      <span ref={alignRef}><Btn title={t('Align: line up, space evenly, grid, reaction scheme')} onClick={() => setMenu(menu === 'align' ? null : 'align')} label={t('Align')} testId="align">{icons.align}</Btn></span>
      <Btn title={t('Flip left–right (selection, or everything)')} onClick={() => flip(editor, true)}>{icons.flipH}</Btn>
      <Btn title={t('Flip top–bottom (selection, or everything)')} onClick={() => flip(editor, false)}>{icons.flipV}</Btn>
      <Btn title={t('Flip over a bond: then click the bond; the selection (or the smaller side) turns about it, R/S kept')} toggled={editor.tool.name === 'flipOver'}
        onClick={() => editor.setTool(editor.tool.name === 'flipOver' ? { name: 'select' } : { name: 'flipOver' })} testId="flip-over">{icons.flipBond}</Btn>
      <Btn title={t('Make a bond horizontal or vertical: then click the bond, the selection (or its molecule) turning; with one bond selected, its molecule at once; again: a quarter further')} toggled={editor.tool.name === 'snapBond'}
        onClick={() => snapPressed(editor)} testId="snap-bond">{icons.snap}</Btn>
      </span>
      <span className="bar-group" data-group="chairs">
      <span className="sep" />
      <Btn title={t('Ring flip of a chair: then click the chair; axial and equatorial swap, each group staying up or down (cis/trans, R/S kept); Shift+click: both chairs, with ⇌. A flat six-membered ring clicked becomes a chair')}
        toggled={editor.tool.name === 'ringFlip'}
        onClick={() => editor.setTool(editor.tool.name === 'ringFlip' ? { name: 'select' } : { name: 'ringFlip' })} testId="ring-flip">{icons.ringFlip}</Btn>
      <Btn title={t('Turn a chair: then click the chair; it turns a third of the way round its axis, anticlockwise (Shift+click: clockwise), every group staying axial or equatorial, up or down: the same chair, seen turned')}
        toggled={editor.tool.name === 'chairTurn'}
        onClick={() => editor.setTool(editor.tool.name === 'chairTurn' ? { name: 'select' } : { name: 'chairTurn' })} testId="chair-turn">{icons.chairTurn}</Btn>
      </span>
      <span className="bar-group" data-group="view">
      <span className="sep" />
      <Btn title={t('Zoom out (Ctrl+wheel)')} onClick={() => zoom(1 / 1.25)}>{icons.zoomOut}</Btn>
      <button type="button" className="btn zoom-label" title={t('Back to 100%')} onClick={() => zoom(42 / scale)}>{Math.round((scale / 42) * 100)}%</button>
      <Btn title={t('Zoom in (Ctrl+wheel)')} onClick={() => zoom(1.25)}>{icons.zoomIn}</Btn>
      <Btn title={t('Fit everything, or the selection, in the window')} onClick={fit} testId="fit">{icons.fit}</Btn>
      <Btn title={t('Show: the drawings alone, full screen, for a lecture; → and ← (or a clicker) step through the open drawings, an exercise and then its solution; Esc: back')} onClick={onShow} testId="show">{icons.present}</Btn>
      </span>
      <More bar={bar} list />
      {menu === 'export' && <ExportMenu editor={editor} anchor={exportRef.current} onClose={() => setMenu(null)} />}
      {menu === 'open' && <OpenMenu editor={editor} anchor={openRef.current} fit={fit} onClose={() => setMenu(null)} onVersions={onVersions} />}
      {menu === 'align' && <AlignMenu editor={editor} anchor={alignRef.current?.offsetParent ? alignRef.current : bar.current?.querySelector('[data-more] button')} onClose={() => setMenu(null)} />}
    </div>
  );
}

// The top right: reporting a problem (a bug, one click), Settings (the theme and debug mode in it too), and
// Install where the browser offers it. The keyboard shortcuts, the manuals and About are in Help (?), reporting
// there too; What's new and About also under the version in the bottom left corner.
export function TopRight({ editor, theme, setTheme, onReport, onCustomStyle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const offer = useSyncExternalStore(onInstallOffer, installOffer);
  return (
    <div className="glass topright">
      {offer && <Btn title={t('Install as an app: its own window, works offline')} onClick={install} testId="install">{icons.install}</Btn>}
      <Btn title={t('Report a problem or an idea')} onClick={onReport} testId="report">{icons.debug}</Btn>
      <span ref={ref}><Btn title={t('Settings')} onClick={() => setOpen(!open)} testId="settings">{icons.settings}</Btn></span>
      {open && <SettingsMenu editor={editor} anchor={ref.current} onClose={() => setOpen(false)} theme={theme} setTheme={setTheme} onCustomStyle={onCustomStyle} />}
    </div>
  );
}

// --- the tool rail ---

const BONDS = [
  [{ name: 'bond', order: 1, stereo: '' }, icons.single, t('Single bond (click a bond: single → double → triple)')],
  [{ name: 'bond', order: 2, stereo: '' }, icons.double, t('Double bond (click a double bond: move its second line)')],
  [{ name: 'bond', order: 3, stereo: '' }, icons.triple, t('Triple bond')],
  [{ name: 'bond', order: 1, stereo: 'wedge' }, icons.wedge, t('Wedge, towards you (click again: turn around)')],
  [{ name: 'bond', order: 1, stereo: 'hash' }, icons.hash, t('Hashed wedge, away from you')],
  [{ name: 'bond', order: 1, stereo: 'wavy' }, icons.wavy, t('Wavy bond (either)')],
  // (in the order D goes through them)
  [{ name: 'bond', order: 1, stereo: '', kind: 'dative' }, icons.dative, t('Dative (coordination) bond: from the donor to the acceptor (click again: turn around)')],
  [{ name: 'bond', order: 1, stereo: '', kind: 'hbond' }, icons.hbond, t('Hydrogen bond: dotted')],
  [{ name: 'bond', order: 1, stereo: '', kind: 'partial' }, icons.partial, t('Partial bond, forming or breaking (transition states): dashed')],
];
const RINGS = [[{ name: 'ring', size: 6, aromatic: true }, icons.benzene, t('Benzene')],
  ...[3, 4, 5, 6, 7, 8].map((size) => [{ name: 'ring', size, aromatic: false }, <RingIcon size={size} />, t('Ring of {n}', { n: size })])];
const ARROWS = [
  [{ name: 'rxn', kind: 'forward' }, icons.rxn, t('Reaction arrow')],
  [{ name: 'rxn', kind: 'equilibrium' }, icons.equilibrium, t('Equilibrium arrow')],
  [{ name: 'rxn', kind: 'resonance' }, icons.resonance, t('Resonance arrow')],
  [{ name: 'rxn', kind: 'multistep' }, icons.multistep, t('Multistep arrow: drawn as two arrows, one object')],
  [{ name: 'rxn', kind: 'retro' }, icons.retro, t('Retrosynthesis arrow')],
  [{ name: 'rxn', kind: 'failed' }, icons.failed, t('Crossed arrow: the reaction does not go')],
  [{ name: 'rxn', kind: 'same' }, icons.same, t('Equals sign: the same thing drawn another way (chair = Haworth)')],
  [{ name: 'rxn', kind: 'dipole' }, icons.dipole, t('Dipole arrow: from δ+ (the crossed end) to δ−; moves with its molecule')],
];

const GROUPS = [
  { id: 'select', variants: [[{ name: 'select' }, icons.select, t('Select: click, Shift+click, drag a box; double click: whole molecule; triple click: its reaction row; Ctrl+click: its group; drag the handle to rotate')], [{ name: 'select', lasso: true }, icons.lasso, t('Lasso select')]] },
  { id: 'erase', variants: [[{ name: 'erase' }, icons.erase, t('Erase: click or drag a box')]] },
  'sep',
  { id: 'bond', variants: BONDS },
  { id: 'chain', variants: [[{ name: 'chain' }, icons.chain, t('Chain: drag to draw a zigzag chain')]] },
  { id: 'ring', variants: RINGS },
  'sep',
  // (the charges in one button: + and − by their keys, the partial charges among its kinds)
  { id: 'charge', variants: [[{ name: 'charge', delta: 1 }, icons.plusCharge, t('Positive charge: click an atom')],
    [{ name: 'charge', delta: -1 }, icons.minusCharge, t('Negative charge: click an atom')],
    [{ name: 'charge', partial: 1 }, icons.deltaPlus, t('δ+ (partial charge): click an atom (again: off)')],
    [{ name: 'charge', partial: -1 }, icons.deltaMinus, t('δ− (partial charge): click an atom (again: off)')]] },
  // (the single electron and its fishhook arrow as variants of the pairs': used much less)
  { id: 'pairs', variants: [[{ name: 'pairs' }, icons.pairs, t('Lone pairs: click an atom, or drag a box (with a selection: press for all of it)')],
    [{ name: 'radical' }, icons.radical, t('Unpaired electron (radical): click an atom (again: two together ••, then none)')]] },
  { id: 'orbital', variants: [[{ name: 'orbital', kind: 'p' }, icons.orbitalP, t('p orbital: click an atom; drag a lobe to turn it (Shift: freely), onto another orbital for a dashed line; click a lobe for the other phase')],
    [{ name: 'orbital', kind: 'hybrid' }, icons.orbitalHybrid, t('Hybrid orbital (a lone pair, σ*): click an atom; drag a lobe to turn it, onto another orbital for a dashed line')],
    [{ name: 'orbital', kind: 's' }, icons.orbitalS, t('s orbital: click an atom')],
    [{ name: 'orbital', kind: 'overlap' }, icons.orbitalOverlap, t('Overlap line: drag from one orbital to another (a dashed line between them)')]] },
  'sep',
  { id: 'curve', variants: [[{ name: 'curve', electrons: 2 }, icons.curve, t('Curved arrow (electron pair): drag from the electrons (bond or lone pair) to where they go')],
    [{ name: 'curve', electrons: 1 }, icons.fishhook, t('Fishhook arrow (one electron): drag from the electron to where it goes')]] },
  'sep',
  { id: 'rxn', variants: ARROWS },
  { id: 'plus', variants: [[{ name: 'plus' }, icons.plus, t('"+" sign')]] },
  { id: 'text', variants: [[{ name: 'text' }, icons.text, t('Text: click to write; Formula for H2SO4 and charges, x₂ x² B I and Greek letters in the window over it')],
    [{ name: 'atomNumber' }, icons.atomNumber, t('Atom numbers: click atoms in the order you want them numbered (again: off)')]] },
  { id: 'bracket', variants: [[{ name: 'bracket' }, icons.bracket, t('Brackets: round the selection, drag a box, or click a molecule (transition state ‡, complex ion, repeating unit n)')]] },
  // the palette, the colours used last and a rainbow for more (worked out as the rail is drawn)
  { id: 'paint', variants: () => [...PALETTE, ...recentExtras()].map(([color, name]) => [{ name: 'paint', color }, <span className="swatch" style={{ background: color, width: 18, height: 18 }} />, t('Paint {colour}: click or box atoms, bonds, arrows, text', { colour: name })])
    .concat([[{ name: 'paint', pick: true }, <span className="swatch custom" style={{ width: 18, height: 18 }} />, t('More colours, or a colour code')]]) },
  // the soft colours, those used last, a rainbow for more and none
  { id: 'highlight', variants: () => [...HIGHLIGHTS, ...recentExtras(HIGHLIGHTS, 'highlight')].map(([color, name]) => [{ name: 'highlight', color }, <span className="marker" style={{ background: color }}>{icons.highlighter}</span>, t('{highlight}: click or box atoms and bonds to mark them, click inside a ring to fill it (again: unmark)', { highlight: name })])
    .concat([[{ name: 'highlight', pick: true }, <span className="marker custom">{icons.highlighter}</span>, t('More colours, or a colour code')],
      [{ name: 'highlight', color: null }, <span className="marker none">{icons.highlighter}</span>, t('No highlight: click or box atoms and bonds, or click inside a filled ring, to take the colour away')]]) },
];

// Each group's kinds by short name, for the hint line under the canvas: the kinds behind the corner of a
// button aren't seen until it is opened. In the groups' order; the colours' groups (paint, highlight) are
// left out, their colours being what they show.
const KINDS = {
  select: [t('select'), t('lasso')],
  bond: [t('single bond'), t('double bond'), t('triple bond'), t('wedge'), t('hashed wedge'), t('wavy bond'), t('dative bond'), t('hydrogen bond'), t('partial bond')],
  charge: [t('positive charge'), t('negative charge'), t('partial charge δ+'), t('partial charge δ−')],
  pairs: [t('lone pairs'), t('unpaired electron')],
  orbital: [t('p orbital'), t('hybrid orbital'), t('s orbital'), t('overlap line')],
  curve: [t('curved arrow'), t('fishhook arrow')],
  rxn: [t('reaction arrow'), t('equilibrium arrow'), t('resonance arrow'), t('multistep arrow'), t('retrosynthesis arrow'), t('crossed arrow'), t('equals sign'), t('dipole arrow')],
  text: [t('text'), t('atom numbers')],
};

// The other kinds of the active tool's button, for the hint line: [{ name }], or null where it has none.
// The rings as one: benzene and 3 to 8.
export function otherKinds(tool) {
  const now = railTool(tool);
  const group = GROUPS.find((g) => g !== 'sep' && Array.isArray(g.variants) && g.variants.some(([v]) => same(v, now)));
  if (!group) return null;
  if (group.id === 'ring') return [{ name: t('benzene and rings of 3 to 8') }];
  const names = KINDS[group.id];
  if (!names) return null;
  const others = group.variants.flatMap(([v], k) => (same(v, now) || !names[k] ? [] : [{ name: names[k] }]));
  return others.length ? others : null;
}

// A rail button's tooltip: its name, then all the tool does (the hint line has only the start of it) and the
// other kinds behind its corner
function railTitle(tool, name) {
  const hint = toolHint(tool) ?? '';
  const kinds = otherKinds(tool);
  return [name, hint && hint.split(' · ').join('\n'), kinds && `${t('Also in this button:')} ${kinds.map(({ name: kind }) => kind).join(', ')}`].filter(Boolean).join('\n\n');
}

const same = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
// the active tool as the rail knows it: the bond tool whatever element it draws
const railTool = (tool) => {
  const { el, ...rest } = tool;
  return tool.name === 'bond' ? rest : tool;
};

// A tool's kinds also open when the mouse rests on its button (as a click on the active tool, its corner
// triangle or a right click open them), and go when it leaves both the button and them; opened by a click
// they stay until a choice, Esc or a click elsewhere. Moving on to the next button while they are open
// shows its kinds at once.
const HOVER_OPEN = 450; // ms resting on a button
const HOVER_NEXT = 120; // ms on the next button while one tool's kinds are open by hover
const HOVER_CLOSE = 300; // ms after leaving the button and the kinds

export function Rail({ editor }) {
  const [chosen, setChosen] = useState({}); // group id -> variant index
  const [flyout, setFlyout] = useState(null); // { group, anchor, hovered (opened by resting on the button) }
  const timers = useRef({ open: null, close: null });
  const stop = (which) => {
    clearTimeout(timers.current[which]);
    timers.current[which] = null;
  };
  useEffect(() => () => {
    stop('open');
    stop('close');
  }, []);
  const rest = (group, anchor, e) => {
    if (e.pointerType !== 'mouse' || group.variants.length < 2) return;
    stop('open');
    stop('close');
    timers.current.open = setTimeout(() => setFlyout((now) => (now && !now.hovered ? now : now?.group.id === group.id ? now : { group, anchor, hovered: true })),
      flyout?.hovered ? HOVER_NEXT : HOVER_OPEN);
  };
  const leave = () => {
    stop('open');
    stop('close');
    timers.current.close = setTimeout(() => setFlyout((now) => (now?.hovered ? null : now)), HOVER_CLOSE);
  };
  const [picker, setPicker] = useState(null); // { anchor (the button), tool ('paint' | 'highlight') } while a colour picker is open
  const groups = GROUPS.map((group) => (typeof group.variants === 'function' ? { ...group, variants: group.variants() } : group));
  const activate = (group, index, anchor) => {
    const [tool] = group.variants[index];
    if (tool.pick) {
      setPicker({ anchor, tool: tool.name });
      return;
    }
    setChosen({ ...chosen, [group.id]: index });
    pressTool(editor, tool);
  };
  return (
    <div className="glass rail" role="toolbar" aria-label={t('Drawing tools')}>
      {groups.map((group, k) => {
        if (group === 'sep') return <div key={`sep${k}`} className="group-sep" />;
        const active = group.variants.findIndex(([tool]) => same(tool, railTool(editor.tool)));
        const index = active >= 0 ? active : (chosen[group.id] ?? 0);
        const [tool, icon, label] = group.variants[index];
        const title = keyOf(tool) ? `${label} (${keyOf(tool)})` : label;
        const many = group.variants.length > 1;
        return (
          <button key={group.id} type="button" className={`btn${active >= 0 ? ' on' : ''}`} title={railTitle(tool, many ? t('{tool} — click again for more', { tool: title }) : title)}
            aria-label={title} data-testid={`tool-${group.id}`}
            onClick={(e) => {
              // the active tool clicked again, or its corner triangle: the variants
              const corner = Boolean(e.target.closest?.('.corner'));
              stop('open');
              // (open already by resting on it: the click keeps it open)
              if (many && (active >= 0 || corner)) setFlyout(flyout?.group.id === group.id ? (flyout.hovered ? { ...flyout, hovered: false } : null) : { group, anchor: e.currentTarget });
              else {
                activate(group, index, e.currentTarget);
                setFlyout(null);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              stop('open');
              if (many) setFlyout({ group, anchor: e.currentTarget });
            }}
            onPointerEnter={(e) => rest(group, e.currentTarget, e)}
            onPointerLeave={leave}>
            {icon}
            {many && <span className="corner" />}
          </button>
        );
      })}
      {/* (not a tool: the Objects panel beside the rail, ObjectsPanel.jsx; open or closed is remembered) */}
      <div className="group-sep" />
      <button type="button" className={`btn${editor.settings.objectsPanel ? ' on' : ''}`} data-testid="objects-open"
        title={t('Objects: the drawing as a list of its things and groups, to select them')} aria-label={t('Objects')}
        onClick={() => editor.setSettings({ objectsPanel: !editor.settings.objectsPanel })}>{icons.objects}</button>
      {flyout && (
        <Popover anchor={flyout.anchor} side="right" className="flyout" onClose={() => setFlyout(null)} onPointerEnter={() => stop('close')} onPointerLeave={() => flyout.hovered && leave()}>
          {flyout.group.variants.map(([tool, icon, label], i) => {
            const title = keyOf(tool) ? `${label} (${keyOf(tool)})` : label;
            return (
            <button key={title} type="button" className={`btn${same(tool, railTool(editor.tool)) ? ' on' : ''}`} title={title} aria-label={title}
              onClick={() => {
                activate(flyout.group, i, flyout.anchor);
                setFlyout(null);
              }}>{icon}</button>
            );
          })}
        </Popover>
      )}
      {picker && (
        <ColorPicker anchor={picker.anchor} side="right" list={picker.tool} value={editor.tool.name === picker.tool ? editor.tool.color : null} onClose={() => setPicker(null)}
          onPick={(color) => {
            setPicker(null);
            editor.setTool({ name: picker.tool, color });
          }} />
      )}
    </div>
  );
}

// --- the dock: elements and rings ---

const ELEMENTS = ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I'];

// The element buttons are in their colours whatever the drawing's colours
// are: easier to find.
export function Dock({ editor, dark, onPeriodicTable, onTemplates, ui, searchField }) {
  const colour = (el) => elementColor(el) && (dark ? forDarkBackground(elementColor(el)) : elementColor(el));
  // the element tool, or the bond tool drawing that element (chosen by its key)
  const drawing = (el) => (editor.tool.name === 'atom' || editor.tool.name === 'bond') && editor.tool.el === el;
  const bar = useRef(null);
  useFitted(bar, [], { order: DOCK_OVERFLOW });
  return (
    <div className="glass dock" role="toolbar" aria-label={t('Elements and rings')} ref={bar}>
      <span className="bar-group" data-group="elements">
      {ELEMENTS.map((el) => (
        <button key={el} type="button" className={`btn el${drawing(el) ? ' on' : ''}`}
          style={drawing(el) ? undefined : { color: colour(el) ?? undefined }}
          title={t('{el}: click an atom to change it (Shift+click: bond a new {el} to it), or the canvas for a new one; drag from an atom for a bond to {el}', { el })}
          onClick={() => pickElement(editor, el)}>{el}</button>
      ))}
      <Btn title={t('Periodic table')} onClick={onPeriodicTable}>{icons.table}</Btn>
      </span>
      <span className="bar-group" data-group="rings">
      <span className="sep" />
      {RINGS.map(([tool, icon, title]) => (
        <Btn key={title} title={t('{ring}: click an atom, a bond or the canvas', { ring: title })} on={same(tool, editor.tool)} onClick={() => editor.setTool({ ...tool })}>{icon}</Btn>
      ))}
      </span>
      <More bar={bar} side="above" />
      <span className="sep" />
      <Btn title={t('Templates (Shift+T): rings, functional groups, amino acids, sugars, reagents')} onClick={onTemplates} label={t('Templates')} testId="templates">{icons.templates}</Btn>
      <SearchBar editor={editor} ui={ui} field={searchField} />
    </div>
  );
}

// --- help: a big round button at the bottom right ---

// Beside the drawing's name: whether the browser has kept it (see autosave in actions.js).
const MARK = (path) => <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;
function KeptMark({ editor, onVersions }) {
  const { keeping, keptAt } = editor;
  const time = keptAt ? new Date(keptAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const states = {
    pending: [MARK(<circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />), t('Autosaving…'), t('Autosaving in this browser in a moment')],
    kept: [MARK(<path d="M3.5 8.5l3 3 6-7" />), t('Autosaved'), t('Autosaved in this browser at {time}: it is here when you come back. Files are written only by Save (Ctrl+S).', { time })],
    failed: [MARK(<path d="M8 3.5v5.5M8 12v.5" />), t('Not autosaved'), t("This browser can't autosave (a private window, or its storage is full): save your drawing (Ctrl+S).")],
    elsewhere: [MARK(<path d="M8 3.5v5.5M8 12v.5" />), t('Another tab'), t('olomol is open in another tab too, and that tab has autosaved its drawing since: next time the one changed last comes back. Save this one (Ctrl+S) to be sure.')],
  };
  const [mark, , title] = states[keeping] ?? states.kept;
  // always as wide as its longest label (all of them in one place, only this one seen), so that the bar doesn't
  // move as it goes from Autosaving to Autosaved; there, unseen, before anything is kept. A click: the earlier versions.
  return (
    <button type="button" className={`kept-mark ${keeping ?? 'none'}`} title={keeping ? `${title} ${t('Click for its earlier versions.')}` : undefined}
      data-testid="kept-mark" onClick={onVersions} disabled={!keeping} aria-hidden={!keeping}>
      {mark}
      <span className="label labels">{Object.entries(states).map(([key, [, label]]) => <span key={key} className={key === keeping ? '' : 'unseen'}>{label}</span>)}</span>
    </button>
  );
}


// Opens Help: the examples, with the quick start, the manual, what is new,
// the keyboard shortcuts and reporting a problem in its header.
export function HelpButton({ onHelp }) {
  return <button type="button" className="help-button" title={t('Help: examples, quick start, manual, keyboard shortcuts')} aria-label={t('Help')} onClick={onHelp} data-testid="help">?</button>;
}

// The version in the bottom left corner, small: its release date, and under it What's new and About
export function VersionMark({ onAbout }) {
  return (
    <div className="version-mark" data-testid="version-mark">
      <span title={VERSION}>olomol {__APP_VERSION__}{RELEASED && ` · ${RELEASED}`}</span>
      <span className="links">
        <a href={WHATS_NEW} target="_blank" rel="noopener">{t("What's new")}</a>
        {' · '}
        <button type="button" className="link" onClick={onAbout} data-testid="version-about">{t('About')}</button>
      </span>
    </div>
  );
}
