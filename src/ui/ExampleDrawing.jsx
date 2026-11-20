// The example drawings (made by scripts/empty-examples.mjs from SMILES and
// the app's own engines, as the manual's pictures are): the first four in
// turn on the empty canvas, all of them in the Examples window (the help
// menu). Pointing at a part of one says how it was drawn and lights the
// button it was drawn with.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { endOnBonds } from '../chem/newman.js';
import dielsAlder from './examples/diels-alder.olom?raw';
import sn2 from './examples/sn2.olom?raw';
import orbitals from './examples/orbitals.olom?raw';
import cobalt from './examples/cobalt.olom?raw';
import enzyme from './examples/enzyme.olom?raw';
import aspirin from './examples/aspirin.olom?raw';
import radical from './examples/radical.olom?raw';
import conformations from './examples/conformations.olom?raw';
import toChair from './examples/to-chair.olom?raw';
import e2Anti from './examples/e2-anti.olom?raw';
import hbonds from './examples/hbonds.olom?raw';
import friedelCrafts from './examples/friedel-crafts.olom?raw';
import sugars from './examples/sugars.olom?raw';
import dipoles from './examples/dipoles.olom?raw';
import carbonate from './examples/carbonate.olom?raw';
import retrosynthesis from './examples/retrosynthesis.olom?raw';
import isotope from './examples/isotope.olom?raw';
import numbering from './examples/numbering.olom?raw';
import polymer from './examples/polymer.olom?raw';
import turning from './examples/turning.olom?raw';
import layoutExample from './examples/layout.olom?raw';
import partial from './examples/partial.olom?raw';
import texts from './examples/texts.olom?raw';
import info from './examples/info.olom?raw';
import looks from './examples/looks.olom?raw';
import names from './examples/names.olom?raw';
import exportExample from './examples/export.olom?raw';
import catecholamines from './examples/catecholamines.olom?raw';
import exercise from './examples/exercise.olom?raw';
import files from './examples/files.olom?raw';
import styleExample from './examples/style.olom?raw';
import { stereoLabels, wantsStereo } from '../chem/stereo.js';
import { hitTest } from '../editor/hit.js';
import { readOlom } from '../io/olom.js';
import { abbreviationOf } from '../chem/abbreviations.js';
import { readChair } from '../chem/ringFlip.js';
import { bondsByAtom } from '../model/doc.js';
import { fragments, ringList, smallestRings } from '../model/graph.js';
import { buildScene } from '../render/scene.js';
import { sceneBounds, sceneMarkup } from '../render/svg.js';
import { t } from '../i18n/i18n.js';
import { ELEMENT_KEYS } from './keys.js';
import { icons } from './icons.jsx';
import { AlignIcon } from './Menus.jsx';

const SCALE = 34; // pixels per bond length
const MARGIN = 0.6;

// A button as it is in the bars, named in a step of how an example was made (Layout, Templates,
// Align: nothing in the drawing to point at); pointed at, the real one lights up. Without
// `button`: something in a menu or panel, shown the same way.
function Shown({ button, icon, children }) {
  const lit = useRef(null);
  const off = () => {
    lit.current?.classList.remove('taught');
    lit.current = null;
  };
  const on = () => {
    lit.current = button ? findButton(button) : null;
    lit.current?.classList.add('taught');
  };
  useEffect(() => off, []);
  return (
    <span className={`shown${button ? ' lights' : ''}`} onPointerEnter={on} onPointerLeave={off}>
      {icon}{children && <span>{children}</span>}
    </span>
  );
}
const layout = () => <Shown button="relayout" icon={icons.layout}>{t('Redraw')}</Shown>;
const alignMenu = () => <Shown button="align" icon={icons.align}>{t('Align')}</Shown>;
const templates = (group) => <><Shown button="templates" icon={icons.templates}>{t('Templates')}</Shown> → <Shown>{group}</Shown></>;
const alignReaction = () => <>{t('The scheme selected:')} {alignMenu()} → <Shown icon={icons.alignReaction}>{t('Align reaction scheme')}</Shown></>;

// (blank: also on the empty canvas, in this order; tags: what it shows, to pick by; steps: how
// what can't be pointed at was done)
export const EXAMPLES = [
  { id: 'names', olom: names, tags: ['menus'], title: () => t('A structure from its name, SMILES or PubChem number'),
    // the tip on every atom and bond: none was drawn by hand
    molecules: () => ({ text: t('From its name, SMILES or PubChem number: Name / SMILES (or /), then Enter and a click'), button: 'from-name' }),
    steps: () => [<><Shown button="from-name" icon={icons.search}>{t('Name / SMILES')}</Shown> {t('(or /): a SMILES or InChI is drawn as you type; a name or a PubChem number (CID 2244) is looked up in PubChem, which needs the internet')}</>,
      t('Enter, then a click where it should go; a SMILES copied from elsewhere: Ctrl+V on the canvas')] },
  { id: 'layout', olom: layoutExample, tags: ['layout'], title: () => t('Redraw: a molecule drawn in a hurry'),
    steps: () => [<>{t('A molecule selected (double click):')} {layout()} → {t('a drawing of the whole molecule')}</>] },
  { id: 'export', olom: exportExample, tags: ['menus'], title: () => t('Into Word, PowerPoint, Inkscape: export and copy'),
    steps: () => [<><Shown button="export" icon={icons.export}>{t('Export')}</Shown> → {t('SVG (Inkscape, print), PNG, molfile, SDF, SMILES, InChI…')}</>,
      <><Shown>{t('Copy as picture')}</Shown> Ctrl+Shift+C: {t('the drawing, or what is selected, into Word, PowerPoint or Google Docs')}</>,
      <><Shown icon={icons.save}>Ctrl+S</Shown> {t('an olomol drawing (.olom), which opens here again with everything')}</>] },
  { id: 'exercise', olom: exercise, tags: ['files'], title: () => t('An exercise and its solution: tabs and Show'),
    steps: () => [<><Shown icon={icons.duplicate}>{t('Duplicate drawing')}</Shown> {t("right-click the exercise's tab (or the empty canvas): a copy of it in the next tab, to draw the solution into")}</>,
      <><Shown button="new-drawing" icon={icons.newDoc}>{t('New drawing')}</Shown> {t('(or + beside the tabs): an empty one; a double click on a tab renames it, a drag moves it, Ctrl+Tab goes to the next')}</>,
      <><Shown button="show" icon={icons.present}>{t('Show')}</Shown> {t('the drawings alone, each fitted to the screen: → and ← (or a clicker) go from the exercise to its solution; Esc: back')}</>,
      t('Each tab keeps its own undo, view and file; all of them are back when olomol is opened again')] },
  { id: 'files', olom: files, tags: ['files'], title: () => t("The drawing's own file: save, open again, earlier versions"),
    steps: () => [<><Shown button="save" icon={icons.save}>Ctrl+S</Shown> {t('saves the drawing in a file of its own (.olom); then Ctrl+S writes it again without asking (Chrome, Edge; other browsers download it again), Ctrl+Shift+S: Save as')}</>,
      <><Shown button="open" icon={icons.open}>Ctrl+O</Shown> {t('its menu: the recent files, opened again with the file itself, or with the copy olomol kept if the file was moved')}</>,
      <><Shown button="kept-mark">{t('Autosaved')}</Shown> {t('a click: the earlier versions of the drawing, kept while drawing; one of them brought back')}</>,
      t('An SVG or PNG exported from olomol has the drawing in it: opened here (Ctrl+O, or dropped onto the window), it is the drawing again. A KET, CDXML or molfile opened is never written over: Ctrl+S saves it as .olom'),
      <><Shown button="export" icon={icons.export}>{t('Export')}</Shown> → <Shown icon={icons.link}>{t('Copy link')}</Shown> {t('the drawing inside a link, for an e-mail or a chat')}</>] },
  { id: 'style', olom: styleExample, tags: ['menus', 'texts'], title: () => t("A journal's look: ACS, RSC or a style of your own"),
    steps: () => [<><Shown button="settings" icon={icons.settings}>{t('Settings')}</Shown> → <Shown>{t('Style')}</Shown> {t("Screen, ACS, RSC, Slides: for this drawing, kept in its file; pictures and PDF at the journal's true size")}</>,
      <><Shown>{t('Custom…')}</Shown> {t("bond length, lines, bold bonds, wedges and hashes, the labels' size and font, in points; starting from ACS or RSC")}</>,
      <><Shown>{t('Use for new drawings')}</Shown> {t('the style new drawings start in, and files that say none')}</>,
      t('A bond selected, in its panel: ▬ for a bold bond; an atom: Label → B for a bold label'),
      t('A text being written: Aa for Sans or Serif, its size in pt')] },
  { id: 'info', olom: info, tags: ['menus'], title: () => t('Info: formula, masses, SMILES and InChI'),
    steps: () => [<>{t('A molecule selected (double click): its formula in the panel, and')} <Shown>{t('Info')}</Shown> → {t('molar and exact mass, HRMS ions, elemental analysis, SMILES and InChI to copy, its PubChem page')}</>] },
  { id: 'looks', olom: looks, tags: ['menus'], title: () => t('The look: charges, lone pairs, colours'),
    looks: () => [[t('default'), {}], [t('Lewis: bars, ⊕ ⊖'), { pairStyle: 'bars', chargeStyle: 'circled' }], [t('black and white'), { colorMode: 'mono' }]],
    steps: () => [<><Shown button="settings" icon={icons.settings}>{t('Settings')}</Shown> → <Shown>{t('Charges')}</Shown> <Shown>{t('Lone pairs')}</Shown> <Shown>{t('Atom colours')}</Shown> <Shown>{t('Style')}</Shown> {t('for the whole drawing and its pictures (ACS 1996 for journals)')}</>] },
  { id: 'aspirin', olom: aspirin, tags: ['reaction', 'colour', 'layout'], title: () => t('A reaction scheme: aspirin'), steps: () => [alignReaction()] },
  { id: 'texts', olom: texts, tags: ['texts', 'reaction'], title: () => t('Texts: formulas, charges, Greek letters, bold and italic'),
    steps: () => [<><Shown button="tool-text" icon={icons.text}>{t('Text')}</Shown> {t('then a click, and type; in the window over the text:')} <Shown>{t('Formula')}</Shown> <Shown>x₂ x²</Shown> <Shown>B I</Shown> <Shown>α → •</Shown></>,
      t('A text dragged onto an arrow: its conditions, moving with it')] },
  { id: 'carbonate', olom: carbonate, tags: ['mechanism', 'bonding'], title: () => t('Lewis structures: the carbonate ion') },
  { id: 'dipoles', olom: dipoles, tags: ['bonding'], title: () => t('Polar bonds: δ+, δ− and dipoles') },
  { id: 'sn2', olom: sn2, blank: true, tags: ['mechanism', 'reaction', 'stereo', '3d', 'layout'], title: () => <>S<sub>N</sub>2: {t('inversion of configuration')}</>,
    steps: () => [<>{t('The transition state drawn roughly with partial bonds, selected:')} {layout()} → {t('its 3D drawing')}</>, alignReaction()] },
  { id: 'friedel-crafts', olom: friedelCrafts, tags: ['mechanism', 'reaction'], title: () => t('Friedel–Crafts acylation: a mechanism with resonance') },
  { id: 'radical', olom: radical, tags: ['mechanism', 'reaction'], title: () => t('Radical chlorination of methane') },
  { id: 'diels-alder', olom: dielsAlder, blank: true, tags: ['mechanism', 'reaction', 'stereo'], title: () => t('Diels–Alder reaction and bromine addition'), steps: () => [alignReaction()] },
  { id: 'numbering', olom: numbering, tags: ['stereo'], title: () => t('Numbering: IUPAC with R/S and E/Z, and by hand for NMR'),
    steps: () => [<>{t('The molecule selected, in its panel:')} <Shown>{t('IUPAC numbering')}</Shown> <Shown>{t('R/S, E/Z, Λ/Δ')}</Shown></>] },
  { id: 'sugars', olom: sugars, tags: ['templates', 'stereo', 'biochem', 'colour'], title: () => t('Glucose: Fischer and Haworth projections'), steps: () => [templates(t('Conformations and projections'))] },
  { id: 'conformations', olom: conformations, tags: ['templates', 'stereo'], title: () => t('Conformations: Newman projections and chairs'),
    steps: () => [templates(t('Conformations and projections')),
      <><Shown button="ring-flip" icon={icons.ringFlip}>{t('Ring flip')}</Shown> {t('then a chair: axial ⇄ equatorial, each group staying up or down; Shift: both chairs, with ⇌')}</>] },
  { id: 'to-chair', olom: toChair, tags: ['stereo', '3d'], title: () => t('A flat ring becomes a chair: menthol, all equatorial'),
    steps: () => [<><Shown button="ring-flip" icon={icons.ringFlip}>{t('Ring flip')}</Shown> {t('then the flat ring: it becomes a chair, each group axial or equatorial as its wedge says')}</>,
      <>{t('Shift+click on the chair: the other chair beside it, with ⇌')}</>,
      <>{t('The ⇌ selected, in its panel:')} <Shown>{t('Favours')}</Shown> {t('(the harpoon towards the less stable chair shorter)')}</>] },
  { id: 'e2-anti', olom: e2Anti, tags: ['mechanism', 'stereo', '3d'], title: () => t('E2 on a chair: the H and the Br must be anti'),
    steps: () => [<>{t('On the flat ring, C1 and C2 selected, in the panel:')} <Shown>{t('Draw the H')}</Shown>{t('; then')} <Shown button="ring-flip" icon={icons.ringFlip}>{t('Ring flip')}</Shown> {t('twice: the Br axial')}</>,
      <>{t('The ⇌ lying to one side:')} <Shown>{t('Favours')}</Shown> {t('in its panel; the reaction that does not go: the crossed arrow among the reaction arrows')}</>,
      <><Shown button="turn3d" icon={icons.turn3d}>{t('Turn in 3D')}</Shown> {t('on the lower chair, the stick model: the highlighted H and Br point opposite ways')}</>] },
  { id: 'turning', olom: turning, tags: ['stereo', 'layout'], title: () => t('Turning a part: flip over a bond, make a bond straight'),
    steps: () => [<><Shown button="flip-over" icon={icons.flipBond}>{t('Flip over a bond')}</Shown> {t('then the bond: the smaller side (or the selection) turns over it, R/S stays')}</>,
      <><Shown button="snap-bond" icon={icons.snap}>{t('Horizontal / vertical')}</Shown> {t('then a bond: the selection (or its molecule) turns until the bond is straight; again: a quarter further')}</>] },
  { id: 'retrosynthesis', olom: retrosynthesis, tags: ['reaction', 'layout'], title: () => t('Retrosynthesis and synthesis: a Grignard reaction'), steps: () => [alignReaction()] },
  { id: 'partial', olom: partial, tags: ['layout'], title: () => t('Redrawing a part: the rest stays as drawn'),
    steps: () => [<>{t('Everything selected:')} {layout()} → {t('the whole molecule redrawn, the bicycle too')}</>,
      <>{t('Only the side chain selected:')} {layout()} → <Shown>{t('Only the selected part, the rest where it is')}</Shown> {t('the bicycle stays as drawn')}</>] },
  { id: 'catecholamines', olom: catecholamines, tags: ['colour', 'layout', 'biochem'], title: () => t('What molecules share: catecholamines in a grid'),
    steps: () => [t('One drawn, then copied (Ctrl+C, Ctrl+V) and changed: the common part stays turned the same way'),
      <>{t('All selected (Ctrl+A):')} {alignMenu()} → <Shown>{t('Columns')} 3</Shown> → <Shown icon={<AlignIcon action="grid" />}>{t('Arrange in a grid')}</Shown></>] },
  { id: 'isotope', olom: isotope, tags: ['reaction', 'colour'], title: () => t('Isotope labelling: where the ester oxygen comes from'), steps: () => [alignReaction()] },
  { id: 'polymer', olom: polymer, tags: ['reaction'], title: () => t('Polymerisation: a repeating unit') },
  { id: 'hbonds', olom: hbonds, tags: ['bonding'], title: () => t('Hydrogen bonds: the acetic acid dimer') },
  { id: 'cobalt', olom: cobalt, blank: true, tags: ['reaction', 'bonding', '3d', 'colour'], title: () => t('Cobalt(II): octahedral (pink) ⇄ tetrahedral (blue)'),
    steps: () => [<>{t('A complex selected:')} <Shown button="turn3d" icon={icons.turn3d}>{t('Turn in 3D')}</Shown> {t('or')} {layout()}</>] },
  { id: 'enzyme', olom: enzyme, blank: true, tags: ['reaction', 'biochem', 'layout'], title: () => t('An enzyme: lactate dehydrogenase'), steps: () => [alignReaction()] },
  { id: 'orbitals', olom: orbitals, tags: ['mechanism', 'bonding'], title: () => t('Orbitals: a Diels–Alder reaction\'s HOMO and LUMO, a lone pair into σ*'),
    steps: () => [<><Shown button="tool-orbital" icon={icons.orbitalP}>{t('Orbital')}</Shown> {t('then an atom: a p orbital on it (its variants: a hybrid orbital, an s orbital); in the panel its size, by the coefficient, and the other phase')}</>,
      t('A lobe dragged onto an orbital of another molecule: a dashed line for their overlap; a curved arrow can start at a lobe or end on one')] },
];
export const TAGS = {
  mechanism: () => t('Mechanisms'),
  reaction: () => t('Reactions'),
  bonding: () => t('Bonding'),
  stereo: () => t('Stereochemistry'),
  templates: () => t('Templates'),
  '3d': () => t('3D'),
  layout: () => t('Redraw and Align'),
  texts: () => t('Texts'),
  menus: () => t('Menus and panels'),
  colour: () => t('Colours'),
  biochem: () => t('Biochemistry'),
  files: () => t('Files and tabs'),
};

// A small picture of an example (no tips, no R/S labels), for the list in the help window.
export function ExampleThumb({ editor, dark, example, settings = null }) {
  const { markup, view } = useMemo(() => {
    const scene = buildScene(exampleDoc(example), settings ? { ...editor.settings, ...settings } : editor.settings);
    const box = sceneBounds(scene);
    return { markup: sceneMarkup(scene, SCALE, { dark }), view: [(box.x1 - MARGIN) * SCALE, (box.y1 - MARGIN) * SCALE, (box.x2 - box.x1 + 2 * MARGIN) * SCALE, (box.y2 - box.y1 + 2 * MARGIN) * SCALE] };
  }, [example, dark, editor.settings, settings]);
  return <svg viewBox={view.join(' ')} className="thumb-drawing" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}

// An example drawn in each of its looks (example.looks: [title, settings]), side by side, each with its
// title: what Settings change.
export function ExampleLooks({ editor, dark, example }) {
  return (
    <div className="example-looks">
      {example.looks().map(([title, settings]) => (
        <figure key={title}>
          <ExampleThumb editor={editor} dark={dark} example={example} settings={settings} />
          <figcaption>{title}</figcaption>
        </figure>
      ))}
    </div>
  );
}

// The words written in the examples, in the app's language
const WORDS = () => ({
  'D-glucose': t('D-glucose'),
  'β-D-glucopyranose': t('β-D-glucopyranose'),
  dopamine: t('dopamine'),
  noradrenaline: t('noradrenaline'),
  adrenaline: t('adrenaline'),
  isoprenaline: t('isoprenaline'),
  initiator: t('initiator'),
  'all selected': t('all selected'),
  menthol: t('menthol'),
  'all equatorial': t('all equatorial'),
  'all axial': t('all axial'),
  'Br equatorial': t('Br equatorial'),
  'Br axial, an H anti to it': t('Br axial, an H anti to it'),
  'no H anti to the Br': t('no H anti to the Br'),
  'side chain selected': t('side chain selected'),
  'Exercise 1': t('Exercise 1'),
  'Draw the mechanism and the product.': t('Draw the mechanism and the product.'),
  'Scheme 1. The new C–O bond in bold.': t('Scheme 1. The new C–O bond in bold.'),
});

// An example's drawing, its words in the app's language
export function exampleDoc(example) {
  const { doc } = readOlom(example.olom);
  const words = WORDS();
  for (const text of doc.texts.values()) if (words[text.text]) text.text = words[text.text];
  return doc;
}

const tool = (id) => `tool-${id}`;
const element = (el) => `el:${el}`;
// the button (tool-…, templates, relayout, turn3d, el:Br)
const findButton = (key) =>
  key.startsWith('el:') ? [...document.querySelectorAll('.dock .el')].find((b) => b.textContent === key.slice(3)) : document.querySelector(`[data-testid="${key}"]`);

// The tip beside the pointer, to its left or above it near the window's right or bottom edge (.example-tip is
// at most 300 px wide; about 80 px high for the longest tips)
const tipPlace = ({ x, y }) => ({
  ...(x + 14 + 300 > window.innerWidth ? { right: window.innerWidth - x + 10 } : { left: x + 14 }),
  ...(y + 16 + 80 > window.innerHeight ? { bottom: window.innerHeight - y + 10 } : { top: y + 16 }),
});

// How a part of an example was drawn, for the tip, and the button it was drawn with (lit while pointed at).
// Each atom's tip for a molecule drawn in 3D (bonds with z), by its molecule: a complex (dative bonds), a
// transition state (partial bonds, drawn by Redraw) or a molecule turned in 3D or drawn so by Redraw
function tipsIn3D(doc) {
  const tips = new Map();
  for (const members of fragments(doc)) {
    const inside = new Set(members);
    const bonds = [...doc.bonds.values()].filter((b) => inside.has(b.a));
    const tip = bonds.some((b) => b.kind === 'dative')
      ? { text: t('A complex in 3D: Turn in 3D, the cube by Redraw; dative bonds are in the left bar'), button: 'turn3d' }
      : bonds.some((b) => b.kind === 'partial')
        ? { text: t('Transition state: drawn roughly with partial bonds, then Redraw draws it in 3D'), button: 'relayout' }
        : { text: t('Drawn as seen in 3D: Turn in 3D, or one of the drawings Redraw offers'), button: 'turn3d' };
    for (const id of members) tips.set(id, tip);
  }
  return tips;
}

function howDrawn(doc, rings, projected, tips3D, hit, example) {
  const bondsOf = (id) => [...doc.bonds.values()].filter((b) => b.a === id || b.b === id);
  if ((hit.kind === 'atom' || hit.kind === 'bond') && example?.molecules) return example.molecules();
  const in3D = (atomId) => tips3D.get(atomId);
  if (hit.kind === 'curve') {
    const curve = doc.curves.get(hit.id);
    if (curve.to.newBond !== undefined) {
      return curve.electrons === 1
        ? { text: t('Fishhook arrow to a new bond: dropped on the dot between the two atoms'), button: tool('curve') }
        : { text: t('Curved arrow to a new bond: with Shift, dropped on the dot between the two atoms'), button: tool('curve') };
    }
    return curve.electrons === 1
      ? { text: t('Fishhook arrow: drag from the electron to where it goes'), button: tool('curve') }
      : { text: t('Curved arrow (A): drag from a bond or a lone pair to an atom or a bond'), button: tool('curve') };
  }
  if (hit.kind === 'orbital') return { text: t('Orbital: the orbital tool in the left bar, a click on an atom; drag a lobe to turn it, click it for the other phase'), button: tool('orbital') };
  if (hit.kind === 'overlap') return { text: t('Overlap of two orbitals: a lobe dragged onto an orbital of another molecule'), button: tool('orbital') };
  // a Newman projection: its two carbons, the circle, and the bonds round it
  const newman = new Set(endOnBonds(doc).flatMap((b) => [b.a, b.b]));
  const onNewman = hit.kind === 'atom' ? newman.has(hit.id) || bondsOf(hit.id).some((b) => newman.has(b.a) || newman.has(b.b))
    : hit.kind === 'bond' && [doc.bonds.get(hit.id).a, doc.bonds.get(hit.id).b].some((id) => newman.has(id));
  if (onNewman) return { text: t('Newman projection: Templates → Conformations and projections; the panel turns the back carbon and changes the groups'), button: 'templates' };
  if (hit.kind === 'fill') return { text: t('Ring fill: the highlighter in the left bar, a click inside the ring'), button: tool('highlight') };
  if (hit.kind === 'arrow') {
    if (hit.arc) return { text: t("Side arc (NAD⁺ → NADH): with the reaction arrow tool, drag from the arrow's middle out, or from the canvas to it"), button: tool('rxn') };
    const kind = doc.arrows.get(hit.id).kind;
    if (kind === 'equilibrium') return { text: t('Equilibrium arrow: one of the reaction arrows in the left bar'), button: tool('rxn') };
    if (kind === 'resonance') return { text: t('Resonance arrow: one of the reaction arrows in the left bar'), button: tool('rxn') };
    if (kind === 'retro') return { text: t('Retrosynthesis arrow: one of the reaction arrows in the left bar'), button: tool('rxn') };
    if (kind === 'failed') return { text: t('Crossed arrow (the reaction does not go): one of the reaction arrows in the left bar'), button: tool('rxn') };
    if (kind === 'same') return { text: t('Equals sign (the same thing drawn another way): one of the reaction arrows in the left bar'), button: tool('rxn') };
    if (kind === 'dipole') return { text: t('Dipole arrow: one of the reaction arrows, drawn from δ+ to δ−; it moves with its molecule'), button: tool('rxn') };
    return { text: t('Reaction arrow (X): a click, or drag it as long as you like'), button: tool('rxn') };
  }
  if (hit.kind === 'plus') return { text: t('"+" sign: a click'), button: tool('plus') };
  if (hit.kind === 'bracket') return { text: t('Brackets: drag a box, or click a molecule; ‡, a charge or n in the panel'), button: tool('bracket') };
  if (hit.kind === 'text') {
    const text = doc.texts.get(hit.id);
    if (text.family || (text.size > 0 && text.size !== 1)) return { text: t('Its own size and font: Aa and pt over a text being written'), button: tool('text') };
    if (text.anchor != null && text.slot === 'left') return { text: t('A count: a text (T) typed or dragged to the left of the molecule; it stays with it'), button: tool('text') };
    if (text.anchor != null && text.bold) return { text: t('Compound number: a bold text (T) typed or dragged under the molecule; it stays with it'), button: tool('text') };
    if (text.anchor != null) return { text: t('A name: a text (T) typed or dragged under the molecule; it stays with it'), button: tool('text') };
    if (text.arrow != null) return { text: t('Conditions: a text (T) typed over the arrow or dragged onto it; it moves with it'), button: tool('text') };
    return { text: t('Text (T): a click, then type'), button: tool('text') };
  }
  if (hit.kind === 'bond') {
    const bond = doc.bonds.get(hit.id);
    if (bond.bold) return { text: t("Bold bond: ▬ in the bond's panel") };
    if (bond.kind === 'partial') return { text: t('Partial bond (forming, breaking): a bond in the left bar; Redraw draws the transition state as textbooks do'), button: 'relayout' };
    if (bond.kind === 'hbond') return { text: t('Hydrogen bond: a bond in the left bar, dotted'), button: tool('bond') };
    if (bond.kind === 'dative' || bond.z !== undefined) return in3D(bond.a);
    if (bond.highlight) return { text: t('Highlight: the highlighter in the left bar, a click on atoms or bonds'), button: tool('highlight') };
    if (projected.has(bond.a)) return { text: t('Fischer and Haworth projections: Templates → Conformations and projections'), button: 'templates' };
    if (bond.color) return { text: t('Colour: the paint tool in the left bar, a click on atoms or bonds'), button: tool('paint') };
    if (bond.cipLabel) return { text: t("E or Z, worked out for you: R/S, E/Z, Λ/Δ in the molecule's panel") };
    if (bond.stereo === 'wedge') return { text: t('Wedge: 1 over a single bond (again: a hashed wedge)'), button: tool('bond') };
    if (bond.stereo === 'hash') return { text: t('Hashed wedge: 1 twice over a single bond'), button: tool('bond') };
    if (bond.order === 3) return { text: t('Triple bond: 3 over a bond'), button: tool('bond') };
    if (bond.order === 2) return { text: t('Double bond: 2 over a bond, or a click on a bond'), button: tool('bond') };
    return { text: t('Bond: a click on an atom, or drag from it'), button: tool('bond') };
  }
  if (hit.kind === 'atom') {
    const atom = doc.atoms.get(hit.id);
    if (atom.bold && !hit.pair && !hit.radical) return { text: t("Bold label: Label → B in the atom's panel") };
    if (hit.radical || (atom.radical && !hit.pair)) return { text: t("Unpaired electron: under the lone pairs' button in the left bar (. over an atom)"), button: tool('pairs') };
    if (hit.pair != null) return { text: t('Lone pairs: a click on the atom'), button: tool('pairs') };
    if (atom.arrow != null) return { text: t('Reagent: a molecule dragged onto the arrow; it moves with it ("+" in the panel)'), button: tool('select') };
    if (bondsOf(atom.id).some((b) => b.kind === 'dative' || b.z !== undefined)) return in3D(atom.id);
    if (projected.has(atom.id) && !atom.highlight) return { text: t('Fischer and Haworth projections: Templates → Conformations and projections'), button: 'templates' };
    if (atom.isotope) return { text: t('Isotope ({isotope}): typed in the Element field of the atom’s panel', { isotope: `${atom.isotope}${atom.el}` }) };
    if (atom.el === '*' && !atom.highlight) {
      return abbreviationOf(atom)
        ? { text: t('Abbreviation (Ph, Boc, OMe): typed in the Element field of the atom’s panel; it counts in the formula') }
        : { text: t('Group label (R, Nu, Enz): typed in the Element field of the atom’s panel') };
    }
    if (atom.partialCharge) return { text: t('δ+ and δ−: with the charge tools in the left bar'), button: tool('charge') };
    if (atom.charge) return { text: t('Charge: the + and − tools in the left bar, or the panel'), button: tool('charge') };
    if (atom.cipLabel) return { text: t("R or S, worked out for you: R/S, E/Z, Λ/Δ in the molecule's panel") };
    if (atom.highlight) return { text: t('Highlight: the highlighter in the left bar, a click on atoms or bonds'), button: tool('highlight') };
    if (atom.color) return { text: t('Colour: the paint tool in the left bar, a click on atoms or bonds'), button: tool('paint') };
    if (atom.autoNumber) return { text: t("IUPAC numbering: ticked in the molecule's panel, which says why it goes that way") };
    if (atom.number != null) return { text: t('Numbers by hand (NMR): the atom numbers tool, a variant of the text tool; click atoms in order'), button: tool('text') };
    if (atom.el !== 'C') {
      const key = Object.entries(ELEMENT_KEYS).find(([, el]) => el === atom.el)?.[0];
      return key
        ? { text: t('{el}: {key} over an atom (or the bottom bar)', { el: atom.el, key: key.toUpperCase() }), button: element(atom.el) }
        : { text: t('{el}: the periodic table in the bottom bar', { el: atom.el }) };
    }
    const ring = rings.get(hit.id);
    if (ring?.chair) return { text: t('Chair: Templates → Conformations and projections, or a flat ring clicked with Ring flip'), button: 'templates' };
    if (atom.carbonLabel) return { text: t("A carbon written out: Carbons → All C in the molecule's panel"), button: null };
    if (ring?.double) return { text: t('Cyclohexene: Templates → Rings → Cyclohexene'), button: 'templates' };
    if (ring) return { text: t('Ring: R (benzene; again for the others) or the rings in the bottom bar'), button: tool('ring') };
    return { text: t('Every corner and end of a line is a carbon; its hydrogens are counted for you'), button: tool('bond') };
  }
  return null;
}

// every ring atom: whether its ring has a double bond in it
function ringAtoms(doc) {
  const atoms = new Map();
  const byAtom = bondsByAtom(doc);
  for (const ring of ringList(smallestRings(doc))) {
    const inRing = new Set(ring);
    // a cyclohexene: six carbons, one double bond in the ring (benzene drawn with three is a ring like any other;
    // caffeine's rings aren't cyclohexenes)
    const double = ring.length === 6 && ring.every((id) => doc.atoms.get(id).el === 'C')
      && [...doc.bonds.values()].filter((b) => b.order === 2 && inRing.has(b.a) && inRing.has(b.b)).length === 1;
    // a chair as olomol reads one (Ring flip, Turn in 3D), not any ring drawn in a hurry
    const chair = ring.length === 6 && !readChair(doc, ring, byAtom).error;
    for (const id of ring) if (!atoms.get(id)?.double) atoms.set(id, { double, chair });
  }
  return atoms;
}

// the atoms of molecules drawn as Fischer or Haworth projections (a crossing, or a tapered ring side)
function projectedAtoms(doc) {
  const atoms = new Set();
  for (const members of fragments(doc)) {
    const ids = new Set(members);
    const projection = members.some((id) => doc.atoms.get(id).projection) || [...doc.bonds.values()].some((b) => b.stereo === 'perspective' && ids.has(b.a));
    if (projection) for (const id of members) atoms.add(id);
  }
  return atoms;
}

// An example drawn, with the tips. `through`: it lies over the canvas, which
// gets the pointer's events (the empty canvas: clicks draw through it); else
// pointed at directly. `onPointed(true/false)`: the pointer over it or not.
// `largest`: at most that many times its own size (so a small one is not blown up).
export default function ExampleDrawing({ editor, dark, example, through = false, onPointed, largest }) {
  const settings = editor.settings;
  const doc = useMemo(() => exampleDoc(example), [example]);
  // R/S labels from RDKit, as the editor gets them
  const [stereo, setStereo] = useState(null);
  useEffect(() => {
    let current = true;
    setStereo(null);
    if (wantsStereo(doc)) stereoLabels(doc).then((labels) => current && setStereo(labels)).catch(() => {});
    return () => {
      current = false;
    };
  }, [doc]);
  const { scene, rings, projected, tips3D } = useMemo(() => ({ scene: buildScene(doc, settings, { stereo }), rings: ringAtoms(doc), projected: projectedAtoms(doc), tips3D: tipsIn3D(doc) }), [doc, settings, stereo]);
  const markup = useMemo(() => sceneMarkup(scene, SCALE, { dark }), [scene, dark]);
  const box = sceneBounds(scene);
  const view = [(box.x1 - MARGIN) * SCALE, (box.y1 - MARGIN) * SCALE, (box.x2 - box.x1 + 2 * MARGIN) * SCALE, (box.y2 - box.y1 + 2 * MARGIN) * SCALE];
  const svg = useRef(null);
  const [tip, setTip] = useState(null); // { text, x, y }
  const [part, setPart] = useState(null); // the id of the part pointed at
  const [button, setButton] = useState(null); // the button that part was drawn with
  const pointedRef = useRef(false);

  // the pointer over the drawing: which part, and how it was drawn
  useEffect(() => {
    const element = svg.current;
    if (!element) return undefined;
    const move = (e) => {
      const r = element.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      const over = inside && (!through || e.target.closest?.('.canvas'));
      if (over !== pointedRef.current) {
        pointedRef.current = over;
        onPointed?.(over);
      }
      if (!over) {
        setTip(null);
        setPart(null);
        setButton(null);
        return;
      }
      const point = [(view[0] + ((e.clientX - r.left) * view[2]) / r.width) / SCALE, (view[1] + ((e.clientY - r.top) * view[3]) / r.height) / SCALE];
      const hit = hitTest(scene, point);
      const how = hit && howDrawn(doc, rings, projected, tips3D, hit, example);
      setTip(how ? { text: how.text, x: e.clientX, y: e.clientY } : null);
      setPart(how ? hit.arcId ?? hit.id : null);
      setButton(how?.button ?? null);
    };
    const target = through ? window : element.parentElement;
    target.addEventListener('pointermove', move);
    if (!through) target.addEventListener('pointerleave', move);
    return () => {
      target.removeEventListener('pointermove', move);
      if (!through) target.removeEventListener('pointerleave', move);
    };
  }, [scene, doc, rings, projected, tips3D, through, onPointed, view[0], view[1], view[2], view[3]]); // eslint-disable-line react-hooks/exhaustive-deps

  // the button lit a moment after the pointer stops on a part (no flicker while it crosses the drawing)
  useEffect(() => {
    let lit = null;
    const timer = setTimeout(() => {
      lit = button && findButton(button);
      lit?.classList.add('taught');
    }, 120);
    return () => {
      clearTimeout(timer);
      lit?.classList.remove('taught');
    };
  }, [button]);

  // (a side arc: its own group, inside its arrow's)
  const arcPart = part != null && [...scene.arrowArcs.values()].some((arc) => arc.id === part);
  const focusRule = part == null ? null
    : arcPart ? `.example-drawing .focus [data-arc="${part}"], .example-drawing .focus [data-arc="${part}"] * { visibility: visible; }`
      : `.example-drawing .focus [data-id="${part}"], .example-drawing .focus [data-id="${part}"] * { visibility: visible; }`;
  return (
    <>
      <div className={`example-drawing${part != null ? ' has-part' : ''}`} style={largest ? { maxWidth: view[2] * largest } : undefined}>
        <svg ref={svg} viewBox={view.join(' ')} className="example" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
        {part != null && (
          // the part pointed at, clearer: the same drawing over it with only that part showing
          <>
            <style>{focusRule}</style>
            <svg viewBox={view.join(' ')} className="example focus" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
          </>
        )}
      </div>
      {/* in body: on the empty canvas the drawing sits in .empty-hint, whose transform would make the
          tip's position: fixed count from it, not from the window (the tip then bottom right, squeezed) */}
      {tip && createPortal(<div className="example-tip" style={tipPlace(tip)} data-testid="example-tip">{tip.text}</div>, document.body)}
    </>
  );
}
