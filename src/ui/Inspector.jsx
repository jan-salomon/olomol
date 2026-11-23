// The panel on the right: what is selected and its properties, as in
// ChemSketch's property bar. Changes apply to everything selected of that
// kind, as one undo step each.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { abbreviateSelection, canAbbreviate, canDrawOut, chemistryMolfile, drawOutAbbreviations, isLoneMethyl, moleculeLabel, wholeMolecule } from '../editor/abbreviate.js';
import { aromatize, kekulize } from '../editor/aromatic.js';
import { drawHydrogens, hideHydrogens, hydrogenAction } from '../editor/hydrogens.js';
import { formulaOf, labNumbers } from '../chem/formula.js';
import { ABBREVIATIONS } from '../chem/abbreviations.js';
import { isElement, readIsotope, writtenSymbol } from '../chem/elements.js';
import { writeMolfile } from '../io/molfile.js';
import { identifiers } from '../io/rdkit.js';
import { flipArrowSides, reverseArrow } from '../model/doc.js';
import { fragments } from '../model/graph.js';
import { moleculeBox } from '../render/scene.js';
import { backGroups, dihedralOf, groupsAround, groupText, isEndOn, newmansOf, ownGroup, replaceGroup, setDihedral, turnBack } from '../chem/newman.js';
import { bracketAtoms, changeCharge, highlightObjects, keepApart, keepTogether, numberAtoms, paintObjects, setAtomNumber, toggleLonePairs } from '../editor/tools.js';
import { t } from '../i18n/i18n.js';
import { icons } from './icons.jsx';
import { pubchemLink } from './actions.js';
import { allowed } from '../features.js';
import { HIGHLIGHTS, Swatches } from './Menus.jsx';
import { SHADE } from '../render/orbitals.js';
import { MODEL_LOOK, outOfDate } from '../render/model3d.js';
import { updateModel } from '../editor/models3d.js';
import { multiply, rotationAbout } from '../layout/threeD.js';

// A double bond's second line, from where it is drawn (+1 one side, -1 the other, 0 centred) to the next place.
const SIDES = [[0, 'center'], [1, 'left'], [-1, 'right']];
const nextSide = (shown) => SIDES[(SIDES.findIndex(([side]) => side === shown) + 1) % SIDES.length][1];

const Seg = ({ value, options, onChange }) => (
  <span className="seg">
    {options.map(([key, label, title]) => (
      <button key={String(key)} type="button" title={title ?? label} className={value === key ? 'on' : ''} onClick={() => onChange(key)}>{label}</button>
    ))}
  </span>
);

// Which side of its reaction arrow a text or a molecule (its atoms) is on,
// or free; on an arrow either can have + or − in front (added, taken away),
// the same sign for both (− AlCl₃ written, − HCl drawn).
function ArrowSide({ editor, objects, slotKey, orderKey }) {
  const molecule = slotKey === 'arrowSlot';
  return (
    <>
      <div className="row" title={t('On a reaction arrow: it moves with the arrow. Drag a text or a whole molecule onto an arrow to put it there.')}>
        <span className="name">{t('On arrow')}</span>
        <Seg value={common(objects.map((o) => ({ v: o.arrow == null ? 'free' : o[slotKey] === 'below' ? 'below' : 'above' })), 'v')}
          options={[['above', '↑', t('above')], ['below', '↓', t('below')], ['free', t('free')]]}
          onChange={(slot) => editor.change(() => objects.forEach((o) => {
            // (to the other side: outermost there)
            if (slot !== 'free' && o[slotKey] !== slot) delete o[orderKey];
            if (slot !== 'free') o[slotKey] = slot;
            else for (const key of ['arrow', slotKey, 'arrowSign', orderKey]) delete o[key];
          }))} />
      </div>
      <div className="row" title={molecule ? t('A sign in front of the molecule: + added, − taken away (− CO₂)') : t('A sign in front of the text: + added, − taken away (− AlCl₃), drawn as in front of a molecule')}>
        <span className="name">{t('In front')}</span>
        <Seg value={common(objects.map((o) => ({ v: o.arrowSign ?? '' })), 'v')} options={[['', t('nothing')], ['+', '+', t('added')], ['−', '−', t('taken away')]]}
          onChange={(sign) => editor.change(() => objects.forEach((o) => {
            if (sign) o.arrowSign = sign;
            else delete o.arrowSign;
          }))} />
      </div>
    </>
  );
}

// An atom of the molecule nearest to a text (by the box round each molecule).
function nearestAtom(doc, scene, text) {
  const box = scene.texts.get(text.id)?.box ?? { x1: text.x, y1: text.y, x2: text.x, y2: text.y };
  const [cx, cy] = [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2];
  let best = null;
  for (const members of fragments(doc)) {
    const b = moleculeBox(members, scene.atoms);
    const d = Math.hypot(Math.max(0, b.x1 - cx, cx - b.x2), Math.max(0, b.y1 - cy, cy - b.y2));
    if (!best || d < best.d) best = { d, atom: Math.min(...members) };
  }
  return best?.atom;
}

// A charge as written beside the atom: 2+, −, 0; mixed: –.
function chargeText(charge) {
  if (charge === undefined) return '–';
  if (!charge) return '0';
  return `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '−'}`;
}

// The value all objects share, or undefined if they differ.
const common = (objects, key) => (objects.every((o) => o[key] === objects[0][key]) ? objects[0][key] : undefined);

// A highlight's pattern and colour: 'hatch:#ffb3b3' → ['hatch', '#ffb3b3'], a plain one ['', its colour]
const PATTERNED = /^(hatch|lines|dots):(.+)$/;
const patternOf = (highlight) => { const m = PATTERNED.exec(highlight ?? ''); return m ? [m[1], m[2]] : ['', highlight ?? null]; };

// The selected atoms' and bonds' highlight: its colour (a swatch), and its pattern (plain, hatched, upright lines,
// dots), told apart without colour (in black and white, for colour-blind readers); a pattern kept when the colour
// changes, each highlight's own colour kept when the pattern does
function HighlightSection({ editor, objects }) {
  const highlights = objects.map((o) => o.highlight ?? null);
  const none = highlights.every((h) => !h);
  const parts = highlights.filter(Boolean).map(patternOf);
  const shared = (k) => (parts.length && parts.every((part) => part[k] === parts[0][k]) ? parts[0][k] : undefined);
  const colour = none ? null : objects.every((o) => o.highlight) ? shared(1) : undefined;
  const pattern = none ? '' : shared(0);
  const ids = objects.map((o) => o.id);
  const repattern = (kind) => editor.change((doc) => {
    for (const o of objects) {
      const thing = doc.atoms.get(o.id) ?? doc.bonds.get(o.id);
      if (!thing?.highlight) continue;
      const [, base] = patternOf(thing.highlight);
      thing.highlight = kind ? `${kind}:${base}` : base;
    }
  });
  return (
    <section data-testid="highlight-section">
      <h3>{t('Highlight')}</h3>
      <Swatches value={colour} palette={HIGHLIGHTS} list="highlight" noneTitle={t('No highlight')}
        onPick={(h) => highlightObjects(editor, ids, h && pattern ? `${pattern}:${h}` : h)} />
      {!none && (
        <div className="row">
          <span className="name">{t('Pattern')}</span>
          <Seg value={pattern} onChange={repattern} options={[
            ['', t('no pattern')], ['hatch', t('hatched'), t('Diagonal stripes: told apart without colour, in black and white or by colour-blind readers')],
            ['lines', t('lines'), t('Upright lines: told apart without colour')], ['dots', t('dots'), t('Dots: told apart without colour')],
          ]} />
        </div>
      )}
    </section>
  );
}

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '−': '⁻' };
// [M+H]+ as written: [M+H]⁺, [M]2− as [M]²⁻.
const ionName = (ion) => ion.replace(/\]([\d+−]+)$/, (_, charge) => `]${[...charge].map((c) => SUPERSCRIPT[c]).join('')}`);

// whose info list is open (the key of those molecules): it stays open
// through a drag, while the panel is away, but not for other molecules or
// once nothing is selected
let infoOf = null;

const GROUP_NAMES = {
  acid: t('carboxylic acid'), ester: t('ester'), acidHalide: t('acid halide'), amide: t('amide'), nitrile: t('nitrile'), aldehyde: t('aldehyde'),
  ketone: t('ketone'), alcohol: t('alcohol (OH)'), thiol: t('thiol (SH)'), amine: t('amine'), imine: t('imine'),
};

// Why a molecule is numbered as it is (an IUPAC numbering from the scene):
// which parent, and which rule chose the way round. For the panel.
function numberingReasons({ parent, why }) {
  if (why.parent === 'none') return [t('Nothing to number: no carbon chain or ring.')];
  if (why.parent === 'system') return [t('Fused, bridged and spiro rings have a numbering of their own, not worked out here: the atom number tool numbers them by hand.')];
  const group = parent.group && GROUP_NAMES[parent.group];
  const ring = parent.kind === 'ring';
  const n = parent.length;
  const first = {
    only: ring ? t('Parent: the ring.') : t('Main chain: {n} carbons.', { n }),
    principal: ring ? t('Parent: the ring with the {group} group.', { group }) : t('Main chain: the one with the {group} group.', { group }),
    ring: t('Parent: the ring (a ring comes before a chain).'),
    nitrogen: t('Parent: the ring with the heteroatom.'),
    hetero: t('Parent: the ring with the heteroatom.'),
    rings: t('Parent: the larger ring.'),
    length: ring ? t('Parent: the larger ring.') : t('Main chain: the longest, {n} carbons.', { n }),
    multiple: t('Main chain: of the longest, the one with the most multiple bonds.'),
    double: t('Main chain: of the longest, the one with the most multiple bonds.'),
    substituentCount: t('Main chain: of the longest, the one with the most substituents.'),
  }[why.parent] ?? (ring ? t('Parent: the ring.') : t('Main chain: of the longest, the one that gets the lowest numbers.'));
  const w = why.numbers;
  const second = !w ? t('Numbering from either end gives the same locants.') : {
    hetero: t('Numbered from the ring heteroatom: {chosen}, not {other}.', w),
    heteroOrder: t('Numbered from the ring heteroatom that comes first (O, S, N): {chosen}, not {other}.', w),
    principal: t('Numbered so that the {group} group gets the lowest number: {chosen}, not {other}.', { ...w, group }),
    multiple: t('Numbered so that the multiple bonds get the lowest numbers: {chosen}, not {other}.', w),
    double: t('Numbered so that the double bond gets a lower number than the triple bond: {chosen}, not {other}.', w),
    substituents: t('Numbered so that the substituents get the lowest numbers: {chosen}, not {other}.', w),
    alphabet: t('Numbered so that {name}, first in the alphabet, gets the lower number: {chosen}, not {other}.', w),
  }[w.rule];
  return [first, second];
}

// The formula of the selected molecules; a click on it opens the info list
// in a card beside the panel (until another molecule or nothing is selected):
// masses, HRMS ions, elemental analysis, SMILES, InChI and InChIKey, all
// worked out here (nothing is sent anywhere unless its PubChem page is
// asked for: then the InChIKey goes to PubChem). A click on a row copies it
// as a lab report writes it.
function MoleculeInfo({ editor, doc, atomIds, which }) {
  const [, redraw] = useState(0);
  const open = infoOf === which;
  const setOpen = (value) => {
    infoOf = value ? which : null;
    redraw((n) => n + 1);
  };
  const [found, setFound] = useState(null);
  const numbers = formulaOf(doc, atomIds);
  const { formula, charge, mass, exact } = numbers;
  const sign = charge ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '−'}` : '';
  let molfile = null;
  try {
    molfile = open ? writeMolfile(doc, atomIds).molfile : null;
  } catch {
    // too large for a molfile
  }
  useEffect(() => {
    if (!molfile) return undefined;
    let current = true;
    // with abbreviations drawn out: Ph as a phenyl
    chemistryMolfile(doc, atomIds).then(identifiers).then((result) => current && setFound(result), (error) => current && setFound({ error: error.message }));
    return () => {
      current = false;
    };
  }, [molfile]);
  const copy = async (name, text) => {
    try {
      await navigator.clipboard.writeText(text);
      editor.say(t('{name} copied: {text}', { name, text: text.length > 60 ? `${text.slice(0, 60)}…` : text }));
    } catch {
      editor.say(t('Could not copy the {name}.', { name }), 'error');
    }
  };
  const { ions, analysis } = labNumbers(numbers);
  const rows = [
    ...(mass !== null ? [[t('Molar mass'), `${mass.toFixed(2)} g/mol`, `${mass.toFixed(2)} g/mol`]] : []),
    ...(exact !== null ? [[t('Exact mass'), exact.toFixed(4), exact.toFixed(4)]] : []),
    ...ions.map((ion) => [ionName(ion.ion), ion.mz.toFixed(4), ion.text]),
    ...(analysis ? [[t('Anal. calcd'), analysis.parts.map(([el, p]) => `${el} ${p.toFixed(2)}`).join(', '), analysis.text]] : []),
    ...(found && !found.error ? [['SMILES', found.smiles], ['InChI', found.inchi], ['InChIKey', found.inchikey]].filter(([, text]) => text).map(([name, text]) => [name, text, text]) : []),
  ];
  const shownFormula = (
    <span className="formula">
      {formula.map(([el, n]) => <span key={el}>{el}{n > 1 && <sub>{n}</sub>}</span>)}
      {sign && <sup>{sign}</sup>}
    </span>
  );
  return (
    <>
      <button type="button" className={`formula-row${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}
        title={open ? t('Hide the masses and identifiers') : t('Masses, HRMS, elemental analysis, SMILES, InChI')} data-testid="formula">
        {shownFormula}
        <span className="more">{t('Info')}{icons.chevron}</span>
      </button>
      {/* in the page itself: inside the panel, position: fixed would be relative to it */}
      {open && createPortal(
        <div className="glass info-card" aria-label={t('Info')}>
          <header>
            {shownFormula}
            <button type="button" className="btn" onClick={() => setOpen(false)} aria-label={t('Close')}>{icons.close}</button>
          </header>
          <div className="info">
            {rows.map(([name, shown, text]) => (
              <button key={name} type="button" className="ident" title={t('Copy: {text}', { text })} onClick={() => copy(name, text)}>
                <span className="name">{name}</span><code>{shown}</code>
              </button>
            ))}
            {!found && <p className="small">SMILES, InChI…</p>}
          </div>
          {found?.inchikey && allowed('structures-from-names') && (
            <a className="btn" href={pubchemLink({ inchikey: found.inchikey, ...(found.smiles && { smiles: found.smiles }) })} target="_blank" rel="noopener" data-testid="pubchem-page"
              title={t('Open its page on PubChem (this sends its InChIKey there; if PubChem has no exact match, its SMILES too)')}>
              {icons.external}<span className="label">{t('PubChem page')}</span>
            </a>
          )}
          {found?.error && (
            <p className="small">
              {found.error}{' '}
              {/* our rules may allow what RDKit's don't: a halogen with more than one bond (H–Cl=O, ClO4⁻ with Cl=O) */}
              {atomIds.some((id) => editor.scene.atoms.get(id)?.chem.error) ? t('Atoms in a red ring need fixing first.')
                : t("The drawing is fine by this app's rules, but RDKit allows fewer bonds here (a halogen with more than one, as in H–Cl=O), so it gives no SMILES, InChI or R/S for it.")}
            </p>
          )}
          {mass === null && <p className="small">{t('Generic labels (R, X…) have no mass.')}</p>}
          <p className="small">{t('Click a line to copy it in lab-report format.')}</p>
        </div>,
        document.body,
      )}
    </>
  );
}

// The length of the selected reaction arrows (empty if they differ): typing
// changes it (the tail stays); dragging an arrow's end updates the field.
function LengthField({ editor, arrows }) {
  const lengths = arrows.map((a) => Math.hypot(a.x2 - a.x1, a.y2 - a.y1).toFixed(1));
  const shown = lengths.every((l) => l === lengths[0]) ? lengths[0] : '';
  const [value, setValue] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setValue(shown);
  }, [shown, editing]);
  return (
    <input className="field" type="number" min="0.6" step="0.5" value={value}
      onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        setValue(e.target.value);
        const length = Number(e.target.value);
        if (!(length >= 0.6)) return;
        editor.change(() => arrows.forEach((a) => {
          const now = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1;
          [a.x2, a.y2] = [a.x1 + ((a.x2 - a.x1) * length) / now, a.y1 + ((a.y2 - a.y1) * length) / now];
          // (made this long by hand, as dragging its end makes it: its side arcs don't make it as long as they need again)
          delete a.ownLength;
          a.lengthByHand = true;
        }));
      }} />
  );
}

// A short text typed for the selected objects (a bracket's ‡ or n), set
// when Enter is pressed or the field is left: one undo step, not one per letter.
function TextField({ value, onCommit, title, placeholder, width = 48 }) {
  const [text, setText] = useState(value ?? '');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value ?? '');
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    if (text !== (value ?? '')) onCommit(text);
  };
  return (
    <input className="field" value={text} title={title} placeholder={placeholder} style={{ width }}
      onFocus={() => setEditing(true)} onBlur={commit} onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
      }} />
  );
}

// A whole molecule selected: its label (PPh3), worked out in the background, for the Abbreviate button
function useMoleculeLabel(editor) {
  const ids = editor.gesture ? [] : editor.selectedAtoms();
  const members = ids.length >= 2 ? wholeMolecule(editor.doc, ids) : null;
  const key = members ? `${editor.docVersion}:${members.join(',')}` : '';
  const [found, setFound] = useState({ key: '', name: null });
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    moleculeLabel(editor.doc, members).then((label) => live && setFound({ key, name: label?.name ?? null }), () => {});
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return found.key === key ? found.name : null;
}

// The selection's colour. With orbitals among it, a toggle above the palette: the shaded lobe (the colour of
// everything selected, as without orbitals) or the other phase's lobe (white unless painted), each button
// showing that lobe's colour. The choice is kept while the page is open.
let lobeChosen = 'shaded';
function ColourSection({ editor, ids, color, orbitals }) {
  const [lobe, setLobe] = useState(lobeChosen);
  const choose = (which) => {
    lobeChosen = which;
    setLobe(which);
  };
  const other = orbitals.length > 0 && lobe === 'other';
  const otherColour = orbitals.length ? common(orbitals, 'colorOther') ?? (orbitals.every((o) => !o.colorOther) ? null : undefined) : null;
  const dot = (fill) => <span className="lobe-dot" style={{ background: fill ?? 'transparent' }} />;
  return (
    <section>
      <h3>{t('Colour')}</h3>
      {orbitals.length > 0 && (
        <div className="row" data-testid="lobe-toggle">
          <Seg value={lobe} onChange={choose} options={[
            ['shaded', <>{dot(common(orbitals, 'color') ?? (orbitals.every((o) => !o.color) ? SHADE : null))}{t('shaded')}</>, t('The shaded lobe (and everything else selected)')],
            ['other', <>{dot(otherColour === null ? '#ffffff' : otherColour)}{t('other phase')}</>, t('The lobe of the other phase (white unless painted)')],
          ]} />
        </div>
      )}
      {other
        ? <Swatches value={otherColour} noneTitle={t('White')} onPick={(colorOther) => editor.change(() => orbitals.forEach((o) => { o.colorOther = colorOther; }))} />
        : <Swatches value={color} onPick={(c) => paintObjects(editor, ids, c)} />}
    </section>
  );
}

// A 3D model's look as the panel shows it: its own where set, else the default
const lookOf = (item, key) => item.look?.[key] ?? MODEL_LOOK[key];
const commonLook = (items, key) => (items.every((item) => lookOf(item, key) === lookOf(items[0], key)) ? lookOf(items[0], key) : undefined);
// The panel's turns of 3D models, by sliders: about the page's vertical axis, its horizontal axis, and in its plane,
// each in degrees from how the models were turned when they were selected (`base`), so that the three stay
// independent; a slide one undo step (a checkpoint as it starts, as a drag). Turned another way meanwhile (Turn in
// 3D, undo): the sliders start again from there.
const TURNS = [['y', () => t('Left–right')], ['x', () => t('Back–forward')], ['z', () => t('In the page')]];
const DEG = Math.PI / 180;
// (left–right first, then back–forward, then in the page: each about the page's own axis)
const turnedBy = (angles, base) => multiply(rotationAbout([0, 0, 1], angles.z * DEG), multiply(rotationAbout([1, 0, 0], -angles.x * DEG), multiply(rotationAbout([0, 1, 0], angles.y * DEG), base)));
const sameTurn = (a, b) => a.every((row, i) => row.every((v, j) => Math.abs(v - b[i][j]) < 1e-9));
function useTurns(editor, models) {
  const key = models.map((item) => item.id).join();
  const [turns, setTurns] = useState({ key, angles: { x: 0, y: 0, z: 0 }, base: new Map(models.map((item) => [item.id, item.rotation])) });
  const fresh = { key, angles: { x: 0, y: 0, z: 0 }, base: new Map(models.map((item) => [item.id, item.rotation])) };
  // (other models selected, or turned otherwise since: from where they are now)
  const current = turns.key === key && models.every((item) => turns.base.has(item.id) && sameTurn(item.rotation, turnedBy(turns.angles, turns.base.get(item.id)))) ? turns : fresh;
  useEffect(() => {
    if (current !== turns) setTurns(current);
  });
  const slide = (axis, value) => {
    const angles = { ...current.angles, [axis]: value };
    for (const item of models) item.rotation = turnedBy(angles, current.base.get(item.id));
    setTurns({ ...current, angles });
    editor.touched();
  };
  return { angles: current.angles, slide, start: () => editor.checkpoint() };
}

// 3D models selected: how they are shown (style, hydrogens, labels' groups, depth), their size, turned by steps or in
// Turn in 3D, and built again when their molecule has changed (Update). Each change one undo step.
function ModelSection({ editor, models, onTurn3D }) {
  const [busy, setBusy] = useState(false);
  // (each stays where it is, round its middle: it doesn't move as it is shown another way)
  const look = (changes) => editor.change(() => models.forEach((item) => { item.look = { ...item.look, ...changes }; }));
  const stale = models.filter((item) => outOfDate(editor.doc, item));
  const hasGroups = models.some((item) => item.model.groups?.length);
  const turns = useTurns(editor, models);
  const update = async () => {
    setBusy(true);
    for (const item of stale) await updateModel(editor, item.id); // eslint-disable-line no-await-in-loop
    setBusy(false);
  };
  const size = models.every((item) => (item.size ?? 1) === (models[0].size ?? 1)) ? models[0].size ?? 1 : undefined;
  return (
    <section data-testid="model-section">
      <h3>{models.length === 1 ? t('3D model') : t('{n} 3D models', { n: models.length })}</h3>
      {stale.length > 0 && (
        <div className="row" data-testid="model-stale">
          <span className="small warn">{t('Its molecule has changed since: the model is as it was.')}</span>
          <button type="button" className="btn primary" disabled={busy} onClick={update} data-testid="model-update">{busy ? t('Building…') : t('Update')}</button>
        </div>
      )}
      <div className="row">
        <span className="name">{t('Style')}</span>
        <Seg value={commonLook(models, 'style')} onChange={(style) => look({ style })}
          options={[['balls', t('Ball and stick')], ['sticks', t('Sticks')], ['spacefill', t('Space-filling'), t('Each atom as large as the atom itself (its van der Waals radius)')]]} />
      </div>
      <div className="row">
        <span className="name">{t('Hydrogens')}</span>
        <Seg value={commonLook(models, 'hydrogens')} onChange={(hydrogens) => look({ hydrogens })}
          options={[['all', t('all')], ['small', t('small'), t('Small hydrogens: those the model adds small and near their atoms; those you drew stay as they are')], ['none', t('none'), t('Only the hydrogens you drew')]]} />
      </div>
      {hasGroups && (
        <div className="row">
          <span className="name">{t('Labels')}</span>
          <Seg value={commonLook(models, 'groups')} onChange={(groups) => look({ groups })}
            options={[['out', t('drawn out'), t('Draw out groups')], ['balls', t('as balls'), t('Each label one ball with its name')]]} />
        </div>
      )}
      <div className="row">
        <span className="name">{t('Depth')}</span>
        <Seg value={commonLook(models, 'fade')} onChange={(fade) => look({ fade })}
          options={[[true, t('back paler')], [false, t('even'), t('Every atom in its full colour')]]} />
      </div>
      <div className="row">
        <span className="name">{t('Size')}</span>
        <Seg value={size} onChange={(value) => editor.change(() => models.forEach((item) => { item.size = value; }))}
          options={[[0.5, '½'], [0.75, '¾'], [1, '1', t('A bond as long as in the drawing')], [1.5, '1½'], [2, '2']]} />
      </div>
      <div className="turns" data-testid="model-turn">
        {TURNS.map(([axis, label]) => (
          <label key={axis} className="row slider">
            <span className="name">{label()}</span>
            <input type="range" min={-180} max={180} step={1} value={turns.angles[axis]} data-testid={`model-turn-${axis}`}
              onPointerDown={turns.start} onKeyDown={turns.start} onChange={(e) => turns.slide(axis, Number(e.target.value))}
              onPointerUp={(e) => e.currentTarget.blur()} /* (let go: Ctrl+Z and the keys back with the drawing) */ />
            <span className="small value">{turns.angles[axis]}°</span>
          </label>
        ))}
      </div>
      {models.length === 1 && onTurn3D && (
        <div className="row">
          <button type="button" className="btn" onClick={onTurn3D} data-testid="model-turn3d">{icons.turn3d}<span className="label">{t('Turn in 3D…')}</span></button>
        </div>
      )}
    </section>
  );
}

export default function Inspector({ editor, short, onTurn3D = null }) {
  const moleculeName = useMoleculeLabel(editor);
  const { doc } = editor;
  if (!editor.selection.size) infoOf = null;
  if (!editor.selection.size || editor.gesture) return null;
  const atoms = editor.selected('atoms').map((id) => doc.atoms.get(id));
  const bonds = editor.selected('bonds').map((id) => doc.bonds.get(id));
  const curves = editor.selected('curves').map((id) => doc.curves.get(id));
  const orbitals = editor.selected('orbitals').map((id) => doc.orbitals.get(id));
  const arrows = editor.selected('arrows').map((id) => doc.arrows.get(id));
  const brackets = editor.selected('brackets').map((id) => doc.brackets.get(id));
  const texts = editor.selected('texts').map((id) => doc.texts.get(id));
  const models = editor.selected('models').map((id) => doc.models.get(id)).filter((item) => item?.model);
  const newmans = newmansOf(doc, editor.selectedAtoms());
  const set = (objects, changes) => editor.change(() => objects.forEach((o) => Object.assign(o, changes)));
  const ids = [...editor.selection];
  const scene = editor.scene;
  const moving = new Set(editor.selectedAtoms());
  const molecules = fragments(doc).filter((members) => members.some((id) => moving.has(id)));
  // whole molecules selected: what applies to molecules, not each atom's
  // charge or each bond's order (those for one atom or bond, or part of a molecule)
  const whole = molecules.length > 0 && molecules.every((members) => members.every((id) => editor.selection.has(id)));
  // the molecules by their first atom, which edits keep
  const which = molecules.map((members) => Math.min(...members)).join();
  if (infoOf !== which) infoOf = null;
  const atomDetails = atoms.length === 1 || !whole;
  // molecules kept together by links (K⁺, K⁺, SiF6²⁻)
  const inMolecules = new Set(molecules.flat());
  const linked = [...doc.bonds.values()].some((b) => b.kind === 'link' && inMolecules.has(b.a));
  // carbons: written CH3 at chain ends or left line ends, or all written (CH2, CH)
  const carbons = atoms.filter((a) => a.el === 'C' && !a.alias && scene.atoms.get(a.id)?.degree > 0);
  const ends = carbons.filter((a) => scene.atoms.get(a.id).degree === 1);
  const inner = carbons.filter((a) => scene.atoms.get(a.id).degree > 1);
  // (a Newman projection's bond seen end on: no Order, Kind or Stereo, as the keys and the bond tool keep it single)
  const bondDetails = (bonds.length === 1 || !whole) && !bonds.some((b) => isEndOn(doc, b));
  const colors = [...ids].map((id) => doc.atoms.get(id) ?? doc.bonds.get(id) ?? doc.curves.get(id) ?? doc.arrows.get(id) ?? doc.texts.get(id) ?? doc.pluses.get(id) ?? doc.brackets.get(id) ?? doc.orbitals.get(id) ?? doc.overlaps.get(id) ?? doc.models?.get(id)).filter(Boolean);
  // only side arcs of reaction arrows: no settings of their own, they can be deleted (what is at their end stays)
  if (!colors.length) {
    return (
      <div className="glass inspector" aria-label={t('Selection')}>
        <section>
          <h3>{t('Side arc')}</h3>
        </section>
        <section className="row">
          <button type="button" className="btn" onClick={() => editor.deleteSelection()} title={t('Delete (Del)')}>{icons.trash}<span className="label">{t('Delete')}</span></button>
        </section>
      </div>
    );
  }
  const color = common(colors, 'color');
  return (
    <div className="glass inspector" aria-label={t('Selection')} style={short ? { maxHeight: 'calc(100vh - 470px)' } : undefined}>
      {molecules.length > 0 && (
        <section>
          <h3>{molecules.length === 1 ? t('Molecule') : t('{n} molecules', { n: molecules.length })}</h3>
          {allowed('molecule-info') && <MoleculeInfo editor={editor} doc={doc} atomIds={molecules.flat()} which={which} />}
          {carbons.length > 0 && (() => {
            // the carbons selected (a whole molecule: all of them): CH3 at the chain ends, plain line ends, or every carbon
            // written. A charged carbon is written (C+) unless set to line: then only its charge, at the corner
            const all = editor.settings.allCarbons;
            // (13C, or hydrogens set by hand: written whatever is chosen here, so counted as written)
            const shown = (a) => Boolean(a.isotope) || a.hCount != null || (a.carbonLabel ?? (all || Boolean(a.charge)));
            const written = carbons.every(shown);
            const endsWritten = ends.length ? common(ends.map((a) => ({ v: a.carbonLabel ?? (a.charge ? true : a.endLabel ?? editor.settings.terminalCarbons) })), 'v') : false;
            // (a C+ inside the chain written while the rest is line: neither)
            const value = written && (inner.length || all) ? 'all' : inner.some(shown) ? undefined : endsWritten;
            const choose = (v) => editor.change(() => {
              if (v === 'all') carbons.forEach((a) => { a.carbonLabel = true; });
              else {
                // (with All C set for all drawings, line ends are this molecule's own choice: not written; a charged
                // carbon as line is only its charge)
                ends.forEach((a) => Object.assign(a, { endLabel: v, carbonLabel: (all || a.charge) && !v ? false : undefined }));
                inner.forEach((a) => { a.carbonLabel = all || a.charge ? false : undefined; });
              }
            });
            return (
              <div className="row" title={t('How the selected carbons are written: CH₃ at chain ends, plain line ends, or every carbon (CH₂, CH); a charged carbon as line is only its charge at the corner (Settings has the default for new ones)')}>
                <span className="name">{t('Carbons')}</span>
                <Seg value={value} options={[...(ends.length ? [[true, 'CH₃']] : []), [false, t('line')], ['all', t('All C')]]} onChange={choose} />
              </div>
            );
          })()}
          {allowed('text') && (() => {
            // IUPAC numbers, worked out again after each change; or numbers set by hand
            const auto = molecules.map((members) => members.some((id) => doc.atoms.get(id).autoNumber));
            const on = auto.every(Boolean);
            const own = molecules.some((members, k) => !auto[k] && members.some((id) => doc.atoms.get(id).number != null));
            const numbering = molecules.length === 1 && on ? scene.numbering.get(scene.fragOf.get(molecules[0][0])) : null;
            return (
              <>
                <label className="row tick" title={t('Number the main chain or ring by the IUPAC rules, again after every change; the atom number tool (with Text) numbers atoms in your own order')}>
                  <input type="checkbox" checked={on} ref={(el) => el && (el.indeterminate = !on && auto.some(Boolean))} data-testid="atom-numbers"
                    onChange={(e) => numberAtoms(editor, molecules, e.target.checked)} />
                  {t('IUPAC numbering')}
                </label>
                {numbering && <div className="why" data-testid="numbering-why">{numberingReasons(numbering).map((line) => <p key={line}>{line}</p>)}</div>}
                {own && (
                  <button type="button" className="btn" onClick={() => numberAtoms(editor, molecules, false)}>
                    {icons.trash}<span className="label">{t('Remove own numbers')}</span>
                  </button>
                )}
              </>
            );
          })()}
          {allowed('molecule-info') && (() => {
            // R/S and E/Z labels for the selected atoms and bonds (a whole molecule: all of its)
            const ids = editor.selectedAtoms();
            const inside = new Set(ids);
            const targets = [...ids.map((id) => doc.atoms.get(id)), ...[...doc.bonds.values()].filter((b) => inside.has(b.a) && inside.has(b.b) && !b.kind)];
            const on = targets.filter((o) => o.cipLabel).length;
            return (
              <label className="row tick" title={t('R/S at stereocentres and E/Z at double bonds (from RDKit), Λ/Δ at an octahedral metal with chelates, for the selected atoms and bonds: a whole molecule, or single ones; they go into pictures and files')}>
                <input type="checkbox" checked={on === targets.length} ref={(el) => el && (el.indeterminate = on > 0 && on < targets.length)} data-testid="cip-labels"
                  onChange={(e) => set(targets, { cipLabel: e.target.checked || undefined })} />
                {t('R/S, E/Z, Λ/Δ')}
              </label>
            );
          })()}
          {(allowed('structure') || allowed('brackets')) && (
          <div className="row">
            {allowed('structure') && (<>
            <button type="button" className="btn" onClick={() => aromatize(editor)}
              title={t('Draw aromatic rings with a circle (or dashed lines, see Settings) and charged groups such as COO⁻ and NO₂ delocalized, with δ charges. Files keep single and double bonds.')}>
              {icons.aromatic}<span className="label">{t('Aromatize')}</span>
            </button>
            <button type="button" className="btn" onClick={() => kekulize(editor)} title={t('Single and double bonds again (Kekulé structure)')}>
              {icons.benzene}<span className="label">Kekulé</span>
            </button>
            </>)}
            {allowed('brackets') && (
            <button type="button" className="btn" onClick={() => bracketAtoms(editor, editor.selectedAtoms())}
              title={t('Brackets round the selected atoms: whole molecules for a transition state or an ion, part of a chain for a repeating unit (with n)')}>
              {icons.bracket}<span className="label">{t('Brackets')}</span>
            </button>
            )}
          </div>
          )}
          {(molecules.length > 1 || linked) && allowed('structure') && (
            <div className="row">
              {molecules.length > 1 && (
                <button type="button" className="btn" data-testid="keep-together" onClick={() => keepTogether(editor, molecules)}
                  title={t('The selected molecules as one compound (a salt such as K₂SiF₆): they move, line up and count as one, in its formula and SMILES; an invisible link joins them (Settings shows it)')}>
                  {icons.link}<span className="label">{t('One compound')}</span>
                </button>
              )}
              {linked && (
                <button type="button" className="btn" data-testid="keep-apart" onClick={() => keepApart(editor, molecules.flat())} title={t('Separate the molecules again')}>
                  <span className="label">{t('Separate')}</span>
                </button>
              )}
            </div>
          )}
          {whole && molecules.every((members) => members.some((id) => doc.arrows.has(doc.atoms.get(id).arrow))) && (
            <ArrowSide editor={editor} objects={molecules.flat().map((id) => doc.atoms.get(id))} slotKey="arrowSlot" orderKey="arrowOrder" />
          )}
        </section>
      )}

      {atoms.length > 0 && allowed('structure') && (
        <section>
          <h3>{atoms.length === 1 ? t('Atom') : t('{n} atoms', { n: atoms.length })}</h3>
          {atomDetails && (
            <>
              <div className="row">
                <span className="name" title={t("An element symbol, an isotope (13C, D, T), an abbreviation (Ph, Boc, Ts, OMe, CO2Et) or a generic label (R, R', Nu, LG)")}>{t('Element')}</span>
                <input className="field" key={atoms.map((a) => `${a.id}${a.isotope ?? ''}`).join()} placeholder={t('mixed')}
                  defaultValue={(common(atoms, 'el') === '*' ? common(atoms, 'alias') : common(atoms.map((a) => ({ v: writtenSymbol(a) })), 'v')) ?? ''}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key !== 'Enter') return;
                    const el = e.currentTarget.value.trim();
                    const symbol = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();
                    // a symbol as written, or all in small letters (cl, na); a second letter in capitals is two
                    // atoms (CO, NI), not cobalt or nickel
                    const element = isElement(el) || (el === el.toLowerCase() && isElement(symbol)) ? symbol : null;
                    // abbreviations first: Ac is acetyl, Ts tosyl (the periodic table has the elements); then isotopes: 13C, D, T
                    const isotope = readIsotope(el);
                    if (ABBREVIATIONS[el]) set(atoms, { el: '*', alias: el, hCount: null, isotope: null });
                    else if (isotope) set(atoms, { ...isotope, alias: null, hCount: null });
                    else if (element) set(atoms, { el: element, alias: null, hCount: null, isotope: null });
                    else if (/^[A-Z][A-Z]$/.test(el) && isElement(symbol)) editor.say(t('"{el}" is no element symbol: the second letter of one is small ({symbol}). Two atoms are drawn as two.', { el, symbol }));
                    // anything else short is a group label: R, R', Nu, LG, Ph
                    else if (/^[A-Za-z][A-Za-z0-9'′]{0,5}$/.test(el)) set(atoms, { el: '*', alias: el, hCount: null, isotope: null });
                    else editor.say(t('"{el}" is neither an element nor a short label (like R, Nu, Ph).', { el }));
                  }} />
              </div>
              {atoms.length === 1 && (
                <div className="row">
                  <span className="name" title={t('The number written beside the atom (empty: none)')}>{t('Number')}</span>
                  <TextField value={scene.atoms.get(atoms[0].id)?.number?.text ?? ''} placeholder="–" width={48}
                    onCommit={(text) => {
                      const n = Number.parseInt(text, 10);
                      setAtomNumber(editor, atoms[0].id, n > 0 ? n : null);
                    }} />
                </div>
              )}
              <div className="row charge-row">
                <span className="name">{t('Charge')}</span>
                {/* one charge more or less each click, any charge (back to 0 the same way); δ− and δ+ beside */}
                <span className="seg charge">
                  <button type="button" title={t('one charge less')} data-testid="charge-down"
                    onClick={() => editor.change((d) => changeCharge(d, atoms.map((a) => a.id), -1))}>−</button>
                  <span className="value" data-testid="charge-value">{chargeText(common(atoms, 'charge'))}</span>
                  <button type="button" title={t('one charge more')} data-testid="charge-up"
                    onClick={() => editor.change((d) => changeCharge(d, atoms.map((a) => a.id), 1))}>+</button>
                </span>
                {/* (the δ shown clicked again: none, as with the δ tool) */}
                {(() => {
                  const partial = atoms.some((a) => a.partialCharge && !a.charge) ? common(atoms.map((a) => ({ v: a.partialCharge })), 'v') : null;
                  return (
                    <Seg value={partial}
                      options={[[-1, 'δ−', t('partial charge δ−')], [1, 'δ+', t('partial charge δ+')]]}
                      onChange={(v) => set(atoms, { charge: 0, partialCharge: v === partial ? null : v })} />
                  );
                })()}
              </div>
              <div className="row">
                <span className="name">{t('Unpaired')}</span>
                {/* (each unpaired electron on a place of its own; the singlet's two together. On an atom without
                    bonds its lone pairs come on too: a Lewis symbol shows all its electrons, ·N̈·) */}
                <Seg value={common(atoms, 'radical')} options={[[0, t('none')], [2, '1', t('one unpaired electron (a radical)')], [3, '2', t('two unpaired electrons, each on its own side (triplet; ·Ö: in a Lewis symbol)')],
                  [4, '3', t('three unpaired electrons, each on its own side (·N̈· in a Lewis symbol)')], [5, '4', t('four unpaired electrons, each on its own side (·Ċ· in a Lewis symbol)')],
                  [1, '••', t('two electrons together (a singlet carbene)')]]}
                  onChange={(radical) => editor.change(() => atoms.forEach((a) => {
                    a.radical = radical;
                    if (radical && a.lonePairs === null && ![...editor.doc.bonds.values()].some((b) => b.a === a.id || b.b === a.id)) a.lonePairs = 'auto';
                  }))} />
              </div>
            </>
          )}
          <div className="row">
            <span className="name">{t('Lone pairs')}</span>
            {/* (of the atoms that have lone pairs: ethanol's shown on its O are all it has, its carbons have none) */}
            <Seg value={((withPairs) => (withPairs.length && withPairs.every((a) => a.lonePairs !== null) ? 'on' : withPairs.every((a) => a.lonePairs === null) ? 'off' : undefined))(atoms.filter((a) => scene.atoms.get(a.id)?.chem.lonePairs > 0 || a.lonePairs !== null))}
              options={[['off', t('hidden')], ['on', t('shown')]]}
              onChange={(v) => {
                const want = v === 'on';
                const targets = atoms.filter((a) => (a.lonePairs !== null) !== want).map((a) => a.id);
                if (targets.length) toggleLonePairs(editor, targets);
              }} />
          </div>
          {atoms.length === 1 && (
            <div className="row small">
              {(() => {
                const chem = scene.atoms.get(atoms[0].id)?.chem;
                if (!chem) return null;
                if (chem.error) return <span style={{ color: 'var(--danger)' }}>{chem.error}</span>;
                return [`${chem.hydrogens} H`, t('{n} lone pairs', { n: chem.lonePairs }), chem.unpaired && t('{n} unpaired', { n: chem.unpaired })].filter(Boolean).join(', ');
              })()}
            </div>
          )}
          {atomDetails && (
            <div className="row">
              <span className="name">{t('Label')}</span>
              {/* (a label written bold: an atom to point at) */}
              <Seg value={atoms.every((a) => a.bold) ? 'bold' : atoms.some((a) => a.bold) ? undefined : 'normal'}
                options={[['normal', t('normal')], ['bold', 'B', t('bold')]]}
                onChange={(v) => set(atoms, { bold: v === 'bold' })} />
            </div>
          )}
          {atomDetails && (
            <div className="row">
              <span className="name">{t('Hydrogens')}</span>
              <Seg value={common(atoms, 'hCount') ?? (atoms.every((a) => a.hCount === null) ? 'auto' : undefined)}
                options={[['auto', t('auto')], [0, '0'], [1, '1'], [2, '2'], [3, '3']]}
                onChange={(v) => set(atoms, { hCount: v === 'auto' ? null : v })} />
            </div>
          )}
          {(() => {
            const ids = editor.selectedAtoms();
            const action = hydrogenAction(doc, ids);
            const drawOut = canDrawOut(doc, ids);
            // drawn groups on one bond each (not already labels): they may have abbreviations
            // (groups each on one bond: three Ph on a P; or a whole molecule with a label of its own: PPh3; or one
            // CH3 alone: Me)
            const gather = (ids.length >= 2 && (moleculeName || (!drawOut && canAbbreviate(doc, ids)))) || isLoneMethyl(doc, ids);
            if (!action && !drawOut && !gather) return null;
            return (
              <div className="row buttons">
                {action && (
                  <button type="button" className="btn" data-testid="draw-h"
                    title={action === 'draw' ? t('Draw the hydrogens as atoms of their own (for arrows to and from them)') : t('Back to implicit hydrogens (drawn H with arrows or wedges stay)')}
                    onClick={() => (action === 'draw' ? drawHydrogens(editor, ids) : hideHydrogens(editor, ids))}>
                    {icons.atom}<span className="label">{action === 'draw' ? t('Draw the H') : t('Hide drawn H')}</span>
                  </button>
                )}
                {drawOut && (
                  <button type="button" className="btn" data-testid="draw-out" title={t('Draw the group the label stands for (Ph as a benzene ring)')} onClick={() => drawOutAbbreviations(editor, ids)}>
                    {icons.benzene}<span className="label">{t('Draw out')}</span>
                  </button>
                )}
                {gather && (
                  <button type="button" className="btn" data-testid="abbreviate" title={t('Write the selected group as its abbreviation (Ph, Boc, Ts, OMe, CO2Et…)')} onClick={() => abbreviateSelection(editor, ids)}>
                    {icons.text}<span className="label">{t('Abbreviate')}</span>{moleculeName && <span className="small"> {moleculeName}</span>}
                  </button>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {bonds.length > 0 && bondDetails && allowed('structure') && (
        <section>
          <h3>{bonds.length === 1 ? t('Bond') : t('{n} bonds', { n: bonds.length })}</h3>
          <div className="row">
            <span className="name">{t('Order')}</span>
            {/* (none lit for a bond drawn aromatic, in a circled ring or dashed: neither single nor double) */}
            <Seg value={bonds.some((b) => b.kind || b.delocalized) ? undefined : common(bonds, 'order')} options={[[1, t('single')], [2, t('double')], [3, t('triple')]]}
              onChange={(order) => set(bonds, { order, stereo: '', delocalized: false, kind: undefined })} />
          </div>
          <div className="row">
            <span className="name">{t('Kind')}</span>
            <Seg value={common(bonds.map((b) => ({ kind: b.kind ?? '' })), 'kind')}
              options={[['', t('bond'), t('a covalent bond')], ['partial', '┄', t('partial bond, forming or breaking (transition state)')], ['hbond', '···', t('hydrogen bond')], ['dative', '→', t('dative (coordination) bond, from the donor')]]}
              onChange={(kind) => set(bonds, { kind: kind || undefined, order: 1, stereo: '', delocalized: false })} />
          </div>
          <div className="row">
            <span className="name">{t('Stereo')}</span>
            {/* (bold beside the stereo bonds, as ChemDraw has it: a plain single bond drawn thick, a bond forming in a
                scheme or one to point at, at the style's bold width. A dashed or dotted bond has no stereo drawn, a
                dative one only wedge and hashed wedge: a stereo it can't show makes it a plain bond with it) */}
            <Seg value={bonds.every((b) => b.bold && !b.stereo && !b.kind) ? 'bold' : bonds.some((b) => b.bold) ? undefined : common(bonds.map((b) => ({ v: b.kind === 'partial' || b.kind === 'hbond' ? '' : b.stereo ?? '' })), 'v')}
              options={[['', t('plain')], ['wedge', '▲', t('wedge')], ['hash', '⋮', t('hashed wedge')], ['wavy', '∿', t('wavy')], ['bold', '▬', t('bold bond')]]}
              onChange={(stereo) => editor.change(() => bonds.forEach((b) => {
                if (stereo === 'bold') {
                  Object.assign(b, { stereo: '', bold: true, order: 1 });
                  delete b.kind;
                  return;
                }
                Object.assign(b, { stereo, bold: false, ...(stereo && { order: 1 }) });
                if (stereo && b.kind && !(b.kind === 'dative' && stereo !== 'wavy')) delete b.kind;
              }))} />
          </div>
          {bonds.some((b) => b.order === 2 && !b.delocalized) && (
            <div className="row">
              <span className="name">{t('2nd line')}</span>
              {/* one button that moves it on from where it is drawn (centred, one side, the other), each click a
                  change to see; Auto back to the program's choice once set by hand */}
              <button type="button" className="btn" data-testid="second-line"
                title={t('Next place: middle, one side, the other')}
                onClick={() => editor.change(() => bonds.filter((b) => b.order === 2 && !b.delocalized).forEach((b) => { b.side = nextSide(editor.scene.bonds.get(b.id)?.side ?? 0); }))}>
                {icons.swap}<span className="label">{t('Next')}</span>
              </button>
              {bonds.some((b) => b.order === 2 && b.side) && (
                <button type="button" className="btn" data-testid="second-line-auto" title={t('As the program chooses')}
                  onClick={() => set(bonds.filter((b) => b.order === 2), { side: null })}><span className="label">{t('Auto')}</span></button>
              )}
            </div>
          )}
        </section>
      )}

      {curves.length > 0 && allowed('curved-arrows') && (
        <section>
          <h3>{curves.length === 1 ? t('Curved arrow') : t('{n} curved arrows', { n: curves.length })}</h3>
          <div className="row">
            <span className="name">{t('Electrons')}</span>
            <Seg value={common(curves, 'electrons')} options={[[2, t('pair')], [1, t('one (fishhook)')]]} onChange={(electrons) => set(curves, { electrons })} />
          </div>
          <div className="row">
            <button type="button" className="btn" title={t('Draw it the next-best way (other side, other lone pair); again for more')}
              onClick={() => editor.change(() => curves.forEach((c) => {
                // (round the ways it has: past its last, the first again, not several clicks of the same)
                const ways = editor.scene.curves.get(c.id)?.ways || 6;
                c.variant = (Math.min(c.variant ?? 0, ways - 1) + 1) % ways;
              }))}>
              {icons.swap}<span className="label">{t('Other way')}</span>
            </button>
            {curves.some((c) => c.variant) && (
              <button type="button" className="btn" onClick={() => set(curves, { variant: 0 })}><span className="label">{t('Best way')}</span></button>
            )}
          </div>
        </section>
      )}

      {orbitals.length > 0 && allowed('orbitals') && (
        <section data-testid="orbital-panel">
          <h3>{orbitals.length === 1 ? t('Orbital') : t('{n} orbitals', { n: orbitals.length })}</h3>
          <div className="row">
            <Seg value={common(orbitals, 'kind')} options={[['p', icons.orbitalP, t('p orbital')], ['hybrid', icons.orbitalHybrid, t('hybrid orbital (a lone pair, σ*)')], ['s', icons.orbitalS, t('s orbital')]]}
              onChange={(kind) => set(orbitals, { kind })} />
          </div>
          <div className="row">
            <span className="name" title={t('How large its lobes are drawn: a coefficient (1 as drawn at first)')}>{t('Size')}</span>
            <button type="button" className="btn" aria-label={t('Smaller')} data-testid="orbital-smaller"
              onClick={() => editor.change(() => orbitals.forEach((o) => { o.size = Math.max(0.5, Math.round(((o.size ?? 1) - 0.25) * 4) / 4); }))}>−</button>
            <span className="value" data-testid="orbital-size">{common(orbitals, 'size') ?? '–'}</span>
            <button type="button" className="btn" aria-label={t('Larger')} data-testid="orbital-larger"
              onClick={() => editor.change(() => orbitals.forEach((o) => { o.size = Math.min(2, Math.round(((o.size ?? 1) + 0.25) * 4) / 4); }))}>+</button>
          </div>
          <div className="row">
            <button type="button" className="btn" title={t('The shaded lobe and the white one swapped (or click a lobe with the orbital tool)')} data-testid="orbital-phase"
              onClick={() => editor.change(() => orbitals.forEach((o) => { o.phase = -(o.phase ?? 1); }))}>
              {icons.swap}<span className="label">{t('Other phase')}</span>
            </button>
          </div>
        </section>
      )}

      {arrows.length > 0 && allowed('reaction-arrows') && (
        <section>
          <h3>{arrows.length === 1 ? t('Reaction arrow') : t('{n} reaction arrows', { n: arrows.length })}</h3>
          <div className="row">
            <Seg value={common(arrows, 'kind')} options={[['forward', icons.rxn, t('Reaction arrow')], ['equilibrium', icons.equilibrium, t('Equilibrium arrow')], ['resonance', icons.resonance, t('Resonance arrow')],
                ['multistep', icons.multistep, t('Multistep arrow: drawn as two arrows, one object')], ['retro', icons.retro, t('Retrosynthesis arrow')],
                ['failed', icons.failed, t('Crossed arrow: the reaction does not go')], ['same', icons.same, t('Equals sign: the same thing drawn another way (chair = Haworth)')],
                ['dipole', icons.dipole, t('dipole (from δ+ to δ−)')]]} onChange={(kind) => set(arrows, { kind })} />
          </div>
          {arrows.every((a) => a.kind === 'equilibrium') && (() => {
            // which way it lies: one button that goes on from what is drawn (even, the lower harpoon shorter,
            // the upper one shorter), its icon and label saying what is drawn now; the labels laid over each
            // other, so the button is as wide as the longest and doesn't jump
            const LEANS = [[null, t('neither side'), icons.equilibrium], ['forward', t('the products'), icons.equilibriumForward], ['back', t('the reactants'), icons.equilibriumBack]];
            const now = common(arrows, 'lean') ?? null;
            const k = Math.max(0, LEANS.findIndex(([lean]) => lean === now));
            return (
              <div className="row">
                <span className="name">{t('Favours')}</span>
                <button type="button" className="btn" data-testid="equilibrium-lean" data-lean={LEANS[k][0] ?? 'even'}
                  title={t('Which way the equilibrium lies: both harpoons as long, or the other one shorter (click for the next)')}
                  onClick={() => set(arrows, { lean: LEANS[(k + 1) % LEANS.length][0] })}>
                  {LEANS[k][2]}
                  <span className="label" style={{ display: 'inline-grid' }}>
                    {LEANS.map(([lean, label], j) => <span key={j} style={{ gridArea: '1 / 1', visibility: j === k ? 'visible' : 'hidden' }} aria-hidden={j !== k}>{label}</span>)}
                  </span>
                </button>
              </div>
            );
          })()}
          <div className="row">
            <span className="name" title={t('In bond lengths; or drag an end of the arrow')}>{t('Length')}</span>
            <LengthField editor={editor} arrows={arrows} />
          </div>
          {/* (after turning an arrow in a cycle: its direction, or the side its arcs and stacks are on) */}
          <div className="row">
            <span className="name">{t('Flip')}</span>
            <button type="button" className="btn" data-testid="arrow-reverse" title={t('The other way round: from right to left (its side arcs and stacks stay on their sides)')}
              onClick={() => editor.change(() => arrows.forEach(reverseArrow))}>{icons.flipH}</button>
            <button type="button" className="btn" data-testid="arrow-flip-sides" title={t('Its side arcs and what is stacked on it to the other side (each stack in its order)')}
              onClick={() => editor.change((doc) => arrows.forEach((arrow) => flipArrowSides(doc, arrow)))}>{icons.flipV}</button>
          </div>
        </section>
      )}

      {newmans.length === 1 && (() => {
        const [axle] = newmans;
        const turns = backGroups(doc, axle) !== null;
        const dihedral = dihedralOf(doc, axle);
        return (
          <section>
            <h3>{t('Newman projection')}</h3>
            {[['front', t('Front')], ['back', t('Back')]].map(([side, name]) => (
              <div className="row" key={side}>
                <span className="name" title={t('From the top, clockwise')}>{name}</span>
                {groupsAround(doc, axle, side).map(({ atom }) => (ownGroup(doc, axle, atom)
                  ? <TextField key={`${axle.id}-${atom}`} value={groupText(doc, atom, (id) => scene.atoms.get(id)?.chem.hydrogens ?? 0)}
                    onCommit={(typed) => editor.change((d) => replaceGroup(d, d.bonds.get(axle.id), atom, typed.trim()))} title="H, CH3, OH, Cl, Ph…" placeholder="H" width={44} />
                  : <span key={`${axle.id}-${atom}`} className="small" title={t('Part of a ring: change it on the canvas')}>{t('ring')}</span>))}
              </div>
            ))}
            {turns && (
              <>
                <div className="row">
                  <span className="name" title={t('Between the first front and the first back group (the largest, H only if all are H)')}>{t('Dihedral')}</span>
                  <Seg value={dihedral} options={[[0, '0°', t('eclipsed (syn)')], [60, '60°', t('gauche')], [120, '120°', t('eclipsed')], [180, '180°', t('anti')]]}
                    onChange={(d) => editor.change((doc2) => setDihedral(doc2, doc2.bonds.get(axle.id), d))} />
                </div>
                <div className="row">
                  <button type="button" className="btn" data-testid="newman-turn" title={t('Turn the back carbon by 60°')}
                    onClick={() => editor.change((doc2) => turnBack(doc2, doc2.bonds.get(axle.id), 60))}>
                    {icons.rotate ?? icons.snap}<span className="label">{t('Turn the back 60°')}</span>
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })()}

      {texts.length > 0 && allowed('text') && (
        <section>
          <h3>{texts.length === 1 ? t('Text') : t('{n} texts', { n: texts.length })}</h3>
          <label className="row tick" title={t('Bold text, for example a compound number')}>
            <input type="checkbox" checked={texts.every((text) => text.bold)} onChange={(e) => set(texts, { bold: e.target.checked })} />
            {t('Bold')}
          </label>
          {texts.every((text) => text.arrow != null && doc.arrows.has(text.arrow)) ? (
            <ArrowSide editor={editor} objects={texts} slotKey="slot" orderKey="order" />
          ) : doc.atoms.size > 0 && (
            // on a molecule's anchor (it moves and lines up with it), or free; a free text goes to the nearest molecule
            <div className="row" title={t('Where the text sits on its molecule: it moves and lines up with it. Or drag the text onto a molecule: its anchors show while you drag.')}>
              <span className="name">{t('On molecule')}</span>
              <Seg value={common(texts.map((text) => ({ v: text.anchor != null ? text.slot ?? 'below' : 'free' })), 'v')}
                options={[['below', '↓', t('below')], ['above', '↑', t('above')], ['left', '←', t('left (a count: 2 NaOH)')], ['right', '→', t('right')], ['free', t('free')]]}
                onChange={(slot) => editor.change(() => texts.forEach((text) => {
                  if (slot === 'free') {
                    for (const key of ['anchor', 'slot', 'drop', 'order']) delete text[key];
                    return;
                  }
                  // (onto another anchor: outermost there)
                  if (text.anchor == null || (text.slot ?? 'below') !== slot) delete text.order;
                  text.anchor ??= nearestAtom(doc, scene, text);
                  text.slot = slot;
                  delete text.drop;
                  delete text.arrow;
                }))} />
            </div>
          )}
        </section>
      )}

      {brackets.length > 0 && allowed('brackets') && (
        <section>
          <h3>{brackets.length === 1 ? t('Brackets') : t('{n} brackets', { n: brackets.length })}</h3>
          <div className="row">
            <span className="name">{t('Shape')}</span>
            <Seg value={common(brackets, 'shape')} options={[['square', '[ ]'], ['round', '( )']]} onChange={(shape) => set(brackets, { shape })} />
          </div>
          <div className="row">
            <span className="name">{t('Top right')}</span>
            <Seg value={common(brackets, 'sup')} options={[['', t('none')], ['‡', '‡', t('transition state')], ['+', '+'], ['−', '−']]} onChange={(sup) => set(brackets, { sup })} />
            {/* (a hyphen typed as the minus it is drawn as: the − above lit for it, 2- and 2− the same) */}
            <TextField value={common(brackets, 'sup')} onCommit={(sup) => set(brackets, { sup: sup.replace(/-/g, '−') })} title={t('Anything else: 2−, 3+, •')} placeholder="2−" />
          </div>
          <div className="row">
            <span className="name">{t('Bottom right')}</span>
            <Seg value={common(brackets, 'sub')} options={[['', t('none')], ['n', 'n', t('repeating unit')]]} onChange={(sub) => set(brackets, { sub })} />
            <TextField value={common(brackets, 'sub')} onCommit={(sub) => set(brackets, { sub })} title={t('Anything else: m, x, 2')} placeholder="m" />
          </div>
        </section>
      )}

      {models.length > 0 && allowed('turn-in-3d') && <ModelSection editor={editor} models={models} onTurn3D={onTurn3D} />}

      {/* (a 3D model's colours are its molecule's: no colour of its own) */}
      {models.length < editor.selection.size && allowed('colors') && <ColourSection editor={editor} ids={ids.filter((id) => !doc.models?.has(id))} color={common(colors.filter((o) => !doc.models?.has(o.id)), 'color')} orbitals={orbitals} />}
      {(atoms.length > 0 || bonds.length > 0) && allowed('colors') && <HighlightSection editor={editor} objects={[...atoms, ...bonds]} />}
      <section className="row">
        <button type="button" className="btn" onClick={() => editor.deleteSelection()} title={t('Delete (Del)')}>{icons.trash}<span className="label">{t('Delete')}</span></button>
        <span className="small" style={{ marginLeft: 'auto' }}>{t('{n} selected', { n: editor.selection.size })}</span>
      </section>
    </div>
  );
}
