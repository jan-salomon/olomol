// What the search bar (Search.jsx) finds besides structures and templates: olomol's tools and actions, each by
// its English name (the key of its translation, so found in the interface's language and in English), other words
// people may look for it by, its key, and what it does. Built for the moment of searching: `ui` gives what lives in
// the App (fit, a window to open by name: 'layout', 'turn3d', 'templates', 'periodic', 'examples', 'keys',
// 'report', 'versions').
import { align, alignReaction, flip, GRID_GAP } from '../arrange/align.js';
import { abbreviateSelection, abbreviatable, canDrawOut, drawOutAbbreviations } from '../editor/abbreviate.js';
import { aromatize, kekulize } from '../editor/aromatic.js';
import { keepApart, keepTogether, pressTool } from '../editor/tools.js';
import { groupSelection, ungroupSelection } from '../editor/grouping.js';
import { fragments } from '../model/graph.js';
import { FORMATS } from '../io/files.js';
import { language, t as translate } from '../i18n/i18n.js';
import { allowed, EMBEDDED, toolAllowed } from '../features.js';
import { copyLink, copyPicture, exportAs, newDrawing, openFile, printDrawing, saveFile, snapPressed } from './actions.js';
import { ALIASES } from './aliases.js';
import { icons } from './icons.jsx';
import { AlignIcon } from './Menus.jsx';
import { keyOf } from './keys.js';
import { ABOUT_PAGE, DOCS, WHATS_NEW } from './report.js';
import { duplicateTab, shownTitle } from './tabs.js';

const fill = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? vars[name] : whole));

// A name: t('…') here only marks it, keeping its English (the test of the translations finds every t('…')), and
// entry() translates it
const t = (en, vars) => ({ en, vars });

// One entry: `name` (t('…')), `key` its shortcut; other words for it from aliases.js (by its English name, filled
// in: Ring of 6, or as written: Export {format})
function entry({ en, vars }, run, { key = null, icon = null, kind = 'action', tool = null } = {}) {
  const label = translate(en, vars);
  const also = [...(ALIASES[fill(en, vars)] ?? []), ...(fill(en, vars) !== en ? ALIASES[en] ?? [] : [])];
  return { id: `${kind}:${fill(en, vars)}`, en, label, names: [label, fill(en, vars)], also, key, icon, kind, run, tool };
}

// The actions of parts that may be switched off (features.js), by their English names; SITE: olomol.org's own,
// not in an embedded editor (files, tabs, help)
const ACTION_PARTS = {
  Redraw: 'redraw', 'Turn in 3D': 'turn-in-3d', 'Align reaction scheme': 'align-flip', 'Arrange in a grid': 'align-flip', 'Flip left–right': 'align-flip', 'Flip top–bottom': 'align-flip',
  'Horizontal / vertical': 'align-flip', 'One compound': 'structure', Separate: 'structure', Aromatize: 'structure', 'Kekulé': 'structure', Abbreviate: 'structure',
  'Draw out': 'structure', 'Periodic table': 'structure', Templates: 'templates', 'Export {format}': 'export', 'Copy as picture': 'export', 'PDF / Print…': 'export',
};
const ALIGNING = /^(Align |Horizontally: |Vertically: )/;
const SITE = new Set(['New drawing', 'Duplicate drawing', 'Open a file from this computer…', 'Save', 'Save as', 'Copy link', 'Show', 'Earlier versions of {name}', 'Help',
  'Keyboard shortcuts', 'Report a problem', 'Embed in a page…', 'About', "What's new", 'Manual', 'Quick start']);
const commandAllowed = (c) => (c.tool ? toolAllowed(c.tool) : allowed(ACTION_PARTS[c.en] ?? (ALIGNING.test(c.en) ? 'align-flip' : null)) && !(EMBEDDED && SITE.has(c.en)));

// the molecules the selection has atoms of (as the panel has them)
function selectedMolecules(editor) {
  const atoms = new Set(editor.selectedAtoms());
  return fragments(editor.doc).filter((members) => members.some((id) => atoms.has(id)));
}

export function commands(editor, ui) {
  const say = ({ en, vars }) => editor.say(translate(en, vars)); // (a message, marked with t('…') as the names are)
  // (as the left bar's button: with a selection, brackets round it, lone pairs on it, a charge or bond on part of a molecule)
  const tool = (en, which, options = {}) => entry(en, () => pressTool(editor, which), { kind: 'tool', key: keyOf(which) ?? null, tool: which, ...options });
  const opens = (en, name, options) => entry(en, () => ui.show(name), options);
  const page = (en, href, options) => entry(en, () => window.open(href, '_blank', 'noopener'), options);
  const zoom = (k) => editor.zoomAt(k, window.innerWidth / 2, window.innerHeight / 2);
  return all(editor, ui, { say, tool, opens, page, zoom }).filter(commandAllowed);
}

function all(editor, ui, { say, tool, opens, page, zoom }) {
  return [
    // the tools (the left bar's, by the short names its hint line uses)
    tool(t('Select'), { name: 'select' }, { icon: icons.select }),
    tool(t('Lasso select'), { name: 'select', lasso: true }, { icon: icons.lasso }),
    tool(t('Erase'), { name: 'erase' }, { icon: icons.erase }),
    tool(t('single bond'), { name: 'bond', order: 1, stereo: '' }, { icon: icons.single }),
    tool(t('double bond'), { name: 'bond', order: 2, stereo: '' }, { icon: icons.double }),
    tool(t('triple bond'), { name: 'bond', order: 3, stereo: '' }, { icon: icons.triple }),
    tool(t('wedge'), { name: 'bond', order: 1, stereo: 'wedge' }, { icon: icons.wedge }),
    tool(t('hashed wedge'), { name: 'bond', order: 1, stereo: 'hash' }, { icon: icons.hash }),
    tool(t('wavy bond'), { name: 'bond', order: 1, stereo: 'wavy' }, { icon: icons.wavy }),
    tool(t('dative bond'), { name: 'bond', order: 1, stereo: '', kind: 'dative' }, { icon: icons.dative }),
    tool(t('hydrogen bond'), { name: 'bond', order: 1, stereo: '', kind: 'hbond' }, { icon: icons.hbond }),
    tool(t('partial bond'), { name: 'bond', order: 1, stereo: '', kind: 'partial' }, { icon: icons.partial }),
    tool(t('Chain (zigzag)'), { name: 'chain' }, { icon: icons.chain }),
    tool(t('Benzene'), { name: 'ring', size: 6, aromatic: true }, { icon: icons.benzene }),
    ...[3, 4, 5, 6, 7, 8].map((n) => tool(t('Ring of {n}', { n }), { name: 'ring', size: n, aromatic: false }, { icon: icons.ring })),
    tool(t('positive charge'), { name: 'charge', delta: 1 }, { icon: icons.plusCharge }),
    tool(t('negative charge'), { name: 'charge', delta: -1 }, { icon: icons.minusCharge }),
    tool(t('partial charge δ+'), { name: 'charge', partial: 1 }, { icon: icons.deltaPlus }),
    tool(t('partial charge δ−'), { name: 'charge', partial: -1 }, { icon: icons.deltaMinus }),
    tool(t('lone pairs'), { name: 'pairs' }, { icon: icons.pairs }),
    tool(t('unpaired electron'), { name: 'radical' }, { icon: icons.radical }),
    tool(t('p orbital'), { name: 'orbital', kind: 'p' }, { icon: icons.orbitalP }),
    tool(t('hybrid orbital'), { name: 'orbital', kind: 'hybrid' }, { icon: icons.orbitalHybrid }),
    tool(t('s orbital'), { name: 'orbital', kind: 's' }, { icon: icons.orbitalS }),
    tool(t('overlap line'), { name: 'orbital', kind: 'overlap' }, { icon: icons.orbitalOverlap }),
    tool(t('curved arrow'), { name: 'curve', electrons: 2 }, { icon: icons.curve }),
    tool(t('fishhook arrow'), { name: 'curve', electrons: 1 }, { icon: icons.fishhook }),
    tool(t('reaction arrow'), { name: 'rxn', kind: 'forward' }, { icon: icons.rxn }),
    tool(t('equilibrium arrow'), { name: 'rxn', kind: 'equilibrium' }, { icon: icons.equilibrium }),
    tool(t('resonance arrow'), { name: 'rxn', kind: 'resonance' }, { icon: icons.resonance }),
    tool(t('multistep arrow'), { name: 'rxn', kind: 'multistep' }, { icon: icons.multistep }),
    tool(t('retrosynthesis arrow'), { name: 'rxn', kind: 'retro' }, { icon: icons.retro }),
    tool(t('crossed arrow'), { name: 'rxn', kind: 'failed' }, { icon: icons.failed }),
    tool(t('equals sign'), { name: 'rxn', kind: 'same' }, { icon: icons.same }),
    tool(t('dipole arrow'), { name: 'rxn', kind: 'dipole' }, { icon: icons.dipole }),
    tool(t('"+" sign'), { name: 'plus' }, { icon: icons.plus }),
    tool(t('text'), { name: 'text' }, { icon: icons.text }),
    tool(t('atom numbers'), { name: 'atomNumber' }, { icon: icons.atomNumber }),
    tool(t('Brackets'), { name: 'bracket' }, { icon: icons.bracket }),
    tool(t('Flip over a bond'), { name: 'flipOver' }, { icon: icons.flipBond }),
    tool(t('Ring flip'), { name: 'ringFlip' }, { icon: icons.ringFlip }),
    tool(t('Turn a chair'), { name: 'chairTurn' }, { icon: icons.chairTurn }),
    entry(t('Horizontal / vertical'), () => snapPressed(editor), { icon: icons.snap }),
    // files
    entry(t('New drawing'), () => newDrawing(editor), { icon: icons.newDoc }),
    entry(t('Duplicate drawing'), () => duplicateTab(editor), { icon: icons.duplicate }),
    entry(t('Open a file from this computer…'), () => openFile(editor, ui.fit), { key: 'Ctrl+O', icon: icons.open }),
    entry(t('Save'), () => saveFile(editor), { key: 'Ctrl+S', icon: icons.save }),
    entry(t('Save as'), () => saveFile(editor, { as: true }), { key: 'Ctrl+Shift+S', icon: icons.save }),
    entry(t('Export {format}', { format: 'SVG' }), () => exportAs(editor, 'svg'), { icon: icons.export }),
    entry(t('Export {format}', { format: 'PNG' }), () => exportAs(editor, 'png'), { icon: icons.export }),
    ...Object.entries(FORMATS).filter(([, { held }]) => !held).map(([format, { label }]) =>
      entry(t('Export {format}', { format: label }), () => exportAs(editor, format), { icon: icons.export })),
    entry(t('Copy as picture'), () => copyPicture(editor), { key: 'Ctrl+Shift+C', icon: icons.copy }),
    entry(t('Copy link'), () => copyLink(editor), { icon: icons.link }),
    opens(t('Embed in a page…'), 'embed', { icon: icons.external }),
    entry(t('PDF / Print…'), () => printDrawing(editor), { icon: icons.export }),
    // the drawing
    entry(t('Undo'), () => editor.undo(), { key: 'Ctrl+Z', icon: icons.undo }),
    entry(t('Redo'), () => editor.redo(), { key: 'Ctrl+Shift+Z', icon: icons.redo }),
    entry(t('Select all'), () => editor.selectAll(), { key: 'Ctrl+A', icon: icons.select }),
    entry(t('Group'), () => groupSelection(editor), { key: 'Ctrl+G', icon: icons.group }),
    entry(t('Ungroup'), () => ungroupSelection(editor), { key: 'Ctrl+Shift+G', icon: icons.ungroup }),
    opens(t('Redraw'), 'layout', { icon: icons.layout }),
    opens(t('Turn in 3D'), 'turn3d', { icon: icons.turn3d }),
    entry(t('Align reaction scheme'), () => alignReaction(editor), { icon: icons.alignReaction }),
    ...[['left', t('Align left edges')], ['centre', t('Align centres (horizontally)')], ['right', t('Align right edges')], ['top', t('Align top edges')],
      ['middle', t('Align middles (vertically)')], ['bottom', t('Align bottom edges')], ['centres-x', t('Horizontally: equal distances between centres')],
      ['gaps-x', t('Horizontally: equal gaps')], ['centres-y', t('Vertically: equal distances between centres')], ['gaps-y', t('Vertically: equal gaps')]]
      .map(([action, name]) => entry(name, () => align(editor, action, 0, GRID_GAP), { icon: <AlignIcon action={action} /> })),
    entry(t('Arrange in a grid'), () => align(editor, 'grid', 0, GRID_GAP), { icon: <AlignIcon action="grid" /> }),
    entry(t('Flip left–right'), () => flip(editor, true), { icon: icons.flipH }),
    entry(t('Flip top–bottom'), () => flip(editor, false), { icon: icons.flipV }),
    entry(t('Zoom in'), () => zoom(1.25), { icon: icons.zoomIn }),
    entry(t('Zoom out'), () => zoom(1 / 1.25), { icon: icons.zoomOut }),
    entry(t('Back to 100%'), () => zoom(42 / editor.view.scale), { icon: icons.fit }),
    entry(t('Fit'), () => ui.fit(), { icon: icons.fit }),
    entry(t('Show'), () => ui.present?.(), { icon: icons.present }),
    // the panel's, on what is selected (said what to select where it can't)
    entry(t('One compound'), () => {
      const molecules = selectedMolecules(editor);
      if (molecules.length > 1) keepTogether(editor, molecules);
      else say(t('Select two molecules or more to make one compound (a salt: K⁺ and its anion).'));
    }, { icon: icons.link }),
    entry(t('Separate'), () => {
      const atoms = selectedMolecules(editor).flat();
      const linked = [...editor.doc.bonds.values()].some((b) => b.kind === 'link' && atoms.includes(b.a));
      if (linked) keepApart(editor, atoms);
      else say(t('Select molecules made one compound to separate them again.'));
    }),
    entry(t('Aromatize'), () => aromatize(editor), { icon: icons.aromatic }),
    entry(t('Kekulé'), () => kekulize(editor), { icon: icons.benzene }),
    entry(t('Abbreviate'), () => {
      const ids = [...new Set([...editor.selection, ...editor.selectedAtoms()])];
      if (abbreviatable(editor.doc, ids)) abbreviateSelection(editor, ids);
      else say(t('Select a group to abbreviate first (a phenyl, an OMe).'));
    }),
    entry(t('Draw out'), () => {
      const ids = editor.selectedAtoms();
      if (canDrawOut(editor.doc, ids)) drawOutAbbreviations(editor, ids);
      else say(t('Select an abbreviation to draw out first (Ph, OMe).'));
    }),
    // windows
    opens(t('Templates'), 'templates', { key: 'Shift+T', icon: icons.templates }),
    opens(t('Periodic table'), 'periodic', { icon: icons.table }),
    opens(t('Earlier versions of {name}', { name: shownTitle(editor.title) }), 'versions', { icon: icons.undo }),
    opens(t('Help'), 'examples', { icon: icons.info }),
    opens(t('Keyboard shortcuts'), 'keys', { key: '?', icon: icons.keyboard }),
    opens(t('Report a problem'), 'report', { icon: icons.debug }),
    page(t('About'), ABOUT_PAGE, { icon: icons.info }),
    page(t("What's new"), WHATS_NEW, { icon: icons.external }),
    page(t('Manual'), DOCS.manual, { icon: icons.external }),
    page(t('Manual as PDF'), DOCS.manualPdf, { icon: icons.external }),
    page(t('Quick start'), DOCS.quickStart, { icon: icons.external }),
  ];
}
