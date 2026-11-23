// Turning a molecule in 3D by hand: its 3D model (the one Re-layout's 3D
// drawings come from), turned as you drag and drawn by the canvas's own
// renderer, as a drawing: bonds foreshortened, wedges by depth, a bond
// behind another broken where they cross. "Use this view" puts exactly that
// drawing in, as one undo step. "Stick model" shows the model itself instead,
// turned the same way: every atom with its hydrogens, true bond lengths and
// angles (render/sticks.js), shown as chosen (style, hydrogens, labels,
// depth); "Put on canvas" puts it beside its molecule as a 3D model
// (render/model3d.js). Opened with one 3D model of the canvas selected, it
// turns that model: "Apply" keeps the turn and the look.
import { useEffect, useRef, useState } from 'react';
import { applyCandidate, drawing3D, model3D, placed, prepare, putDrawing, relayoutTargets, sameMolecule } from '../layout/relayout.js';
import { bestRotation, hardToRead, multiply, projected, rotationAbout, views } from '../layout/threeD.js';
import { labelColours, stickMarkup, stickPicture } from '../render/sticks.js';
import { savePicture } from './actions.js';
import { elementColor } from '../chem/elements.js';
import { emptyDoc, orbitalAngle } from '../model/doc.js';
import { MODEL_LOOK, modelMarks } from '../render/model3d.js';
import { putModel } from '../editor/models3d.js';
import { faceOf, hybridBasis, planeNormals } from '../layout/orbitals3D.js';
import { INK } from '../render/style.js';
import { buildScene } from '../render/scene.js';
import { paler, sceneMarkup } from '../render/svg.js';
import { t } from '../i18n/i18n.js';
import { Seconds, useEscape } from './Dialogs.jsx';
import { icons } from './icons.jsx';

const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const PER_PIXEL = 0.01; // radians a drag turns per pixel
const STEP = (5 * Math.PI) / 180; // what an arrow key turns
const [WIDTH, HEIGHT] = [960, 640];
const LARGEST = 100; // a bond at most this long on the stage, so that a small molecule grows with it
const FADE = 0.6; // how much paler the back of the molecule is in the panel (a depth cue; not on the canvas)
// how the stick model is shown (style, hydrogens, labels' groups, depth: as a 3D model's look), as last chosen in
// this tab
const LOOK = 'olomol-3d-look';
const lookAsLast = () => {
  try {
    return { ...MODEL_LOOK, ...JSON.parse(sessionStorage.getItem(LOOK) ?? '{}') };
  } catch {
    return { ...MODEL_LOOK };
  }
};
const HYDROGEN_STEPS = ['all', 'small', 'none'];
const SPACEFILL_ROOM = 1.35; // a space-filling ball's reach beyond its atom, in bond lengths (Br, I: about 1.3)
// the look as stickMarkup takes it
// (`fine` false on the stage: its shading worked out no finer than the screen shows it, quicker to turn)
const stickLook = (look, dark, fine = true) => ({ dark, style: look.style, hydrogens: look.hydrogens, collapsed: look.groups === 'balls', fade: look.fade, fine });

// The panel's copy of the molecule coloured by depth: the further back, the paler.
function fadeByDepth(doc, molecule, depth, settings, own) {
  const [near, far] = [Math.max(...depth), Math.min(...depth)];
  const back = (z) => (near - far > 1e-6 ? (FADE * (near - z)) / (near - far) : 0);
  molecule.atomIds.forEach((id, k) => {
    const atom = doc.atoms.get(id);
    const color = own.atoms.get(id) ?? (settings.colorMode === 'element' ? elementColor(atom.el) ?? INK : INK);
    atom.color = paler(color, back(depth[k]));
    // (a label's atoms in their own colours, as pale: the P of PPh3; not over a colour of the drawing's)
    if (own.atoms.has(id)) delete atom.fade;
    else atom.fade = back(depth[k]);
    atom.depth = depth[k]; // (its highlight over a further one's: svg.js)
  });
  molecule.bondIds.forEach((id, k) => {
    const { a, b } = molecule.links[k];
    const bond = doc.bonds.get(id);
    bond.color = paler(own.bonds.get(id) ?? INK, back((depth[a] + depth[b]) / 2));
    bond.depth = (depth[a] + depth[b]) / 2;
  });
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const centroid = (points) => [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
const turn = (r, v) => r.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

// The model's every atom (model.atoms) placed as the view starts (`start`: the molecule's own atoms as the
// view has them), so that the stick model turns with the drawing: the same rigid move as from the model's points.
// With the drawing's colours and highlights of the molecule's atoms and bonds (`doc`: the drawing).
function sticksAt(model, start, molecule, doc) {
  if (!model.atoms) return null;
  const [cf, ct] = [centroid(model.points), centroid(start)];
  const r = bestRotation(model.points.map((p) => sub(p, cf)), start.map((p) => sub(p, ct)));
  const marks = { atomColour: new Map(), atomHighlight: new Map(), bondColour: new Map(), bondHighlight: new Map() };
  molecule.atomIds.forEach((id, k) => {
    const atom = doc.atoms.get(id);
    if (atom?.color) marks.atomColour.set(k, atom.color);
    if (atom?.highlight) marks.atomHighlight.set(k, atom.highlight);
  });
  molecule.bondIds.forEach((id, k) => {
    const bond = doc.bonds.get(id);
    const { a, b } = molecule.links[k];
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (bond?.color) marks.bondColour.set(key, bond.color);
    if (bond?.highlight) marks.bondHighlight.set(key, bond.highlight);
  });
  return { elements: model.atoms.elements, bonds: model.atoms.bonds, groups: model.atoms.groups, marks, drawn: molecule.atomIds.length, base: model.atoms.points.map((p) => turn(r, sub(p, cf)).map((v, k) => v + ct[k])) };
}

// Has the stick model hydrogens of its own (not the drawing's atoms: its first `drawn`)?
const addedHydrogens = (sticks) => Boolean(sticks?.elements.some((el, i) => i >= sticks.drawn && el === 'H'));

// A drag (dx, dy in pixels) as a turn: about the page's vertical and
// horizontal axes, or with Shift in the plane of the page.
function dragTurn(dx, dy, inPlane) {
  if (inPlane) return rotationAbout([0, 0, 1], -dx * PER_PIXEL);
  const length = Math.hypot(dx, dy);
  return length ? rotationAbout([dy / length, dx / length, 0], length * PER_PIXEL) : IDENTITY;
}

export default function Turn3D({ editor, dark, onClose }) {
  useEscape(onClose);
  const [state, setState] = useState({ status: 'working' });
  const [fits, setFits] = useState(true); // the drawing keeps R/S and E/Z
  const [clear, setClear] = useState(true); // no bond seen too nearly end on to read
  const [sticks, setSticks] = useState(false); // the stick model shown instead of the drawing
  const showSticks = useRef(false);
  // a 3D model of the canvas to turn (one selected, nothing else): its own model and look, Apply to keep them
  const [item] = useState(() => {
    const ids = editor.selected('models');
    const one = ids.length === 1 && editor.selection.size === 1 ? editor.doc.models.get(ids[0]) ?? null : null;
    // (one without points, from a file: nothing to turn; the dialog asks for a molecule instead)
    return one?.model?.points?.length ? one : null;
  });
  const [look, setLook] = useState(() => (item ? { ...MODEL_LOOK, ...item.look } : lookAsLast())); // style, hydrogens, groups, fade
  const shown = useRef(look);
  const stage = useRef(null);
  const live = useRef(null); // { job, molecule, model, base, doc, scale, rotation, drawing }
  const frame = useRef(0);
  const checks = useRef(0); // (the latest check counts: they finish later than the turn that asked)

  // draws the molecule turned by `rotation`, exactly as it would go onto the
  // canvas (once per animation frame while dragging)
  const draw = (rotation) => {
    const now = live.current;
    if (!now || !stage.current) return;
    now.rotation = rotation;
    if (showSticks.current && now.sticks) {
      const points = now.sticks.base.map((p) => turn(rotation, p));
      stage.current.innerHTML = stickMarkup({ ...now.sticks, points }, now.scale, stickLook(shown.current, dark, false));
      return;
    }
    const view = projected(now.base, rotation);
    now.drawing = drawing3D(now.job, now.molecule, now.model, view, { seen: true });
    Object.assign(now.drawing, { faces: now.faces, spatial: now.spatial }); // (and when the view is used)
    putDrawing(now.doc, now.molecule, now.drawing);
    fadeByDepth(now.doc, now.molecule, view.depth, editor.settings, now.own);
    stage.current.innerHTML = sceneMarkup(buildScene(now.doc, editor.settings), now.scale, { dark });
  };
  const redraw = (rotation) => {
    if (live.current) live.current.rotation = rotation;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      draw(live.current.rotation);
    });
  };
  // when the turning stops: is this drawing still the molecule (R/S and E/Z by its wedges), and can every bond be read?
  const check = () => {
    const now = live.current;
    if (!now || showSticks.current) return;
    const asked = ++checks.current;
    sameMolecule(now.job, now.molecule, now.doc).then((same) => asked === checks.current && setFits(same));
    setClear(!hardToRead(now.drawing, now.molecule, now.model));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // the panel (and its spinner) on the screen first: the 3D model takes a moment, and a click wants an answer
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (cancelled) return;
      if (item) {
        // the canvas's model, as it is turned: only the stick model (it is no drawing to put in)
        const { model } = item;
        // (room for space-filling balls whatever the style: switching it neither moves nor clips the model)
        const radius = Math.max(...model.points.map((p) => Math.hypot(...p))) + SPACEFILL_ROOM;
        showSticks.current = true;
        setSticks(true);
        // (with its molecule's colours and highlights, read from the drawing as the canvas does)
        live.current = { sticks: { ...model, base: model.points, marks: modelMarks(editor.doc, item) }, scale: Math.min(LARGEST, Math.min(WIDTH, HEIGHT) / (2 * radius)), rotation: item.rotation };
        setState({ status: 'ready' });
        return;
      }
      const targets = relayoutTargets(editor);
      if (!targets || targets.molecules.length !== 1) {
        setState({ status: 'error', message: t('Select one molecule to turn in 3D.') });
        return;
      }
      try {
        const job = await prepare(editor, targets);
        job.cancelled = () => cancelled; // (closed: its 3D tries stop)
        const [molecule] = job.molecules;
        const model = await model3D(job, molecule);
        if (cancelled) return;
        if (model.reason) {
          setState({ status: 'error', message: t('No 3D model of this molecule: {reason}.', { reason: model.reason }) });
          return;
        }
        // starting from the clearest view; the model's own copy of the molecule to draw
        const { complex } = model;
        const [clearest] = views(model.points, model.pairs, { axes: !complex, flat: complex?.flat, prefer: complex?.prefer, complex, count: 1, labelled: molecule.elements.map((el) => el !== 'C') });
        const doc = emptyDoc();
        for (const id of molecule.atomIds) doc.atoms.set(id, structuredClone(editor.doc.atoms.get(id)));
        for (const id of molecule.bondIds) doc.bonds.set(id, structuredClone(editor.doc.bonds.get(id)));
        // its orbitals, the p orbitals upright to its plane: on the side of it each was drawn on, kept as it turns
        const atoms = new Set(molecule.atomIds);
        const normals = planeNormals(clearest.points3, molecule.links);
        const faces = new Map();
        const spatial = new Map(); // (hybrids: their direction in space, from the drawing as it was)
        for (const orbital of editor.doc.orbitals?.values() ?? []) {
          if (!atoms.has(orbital.atom)) continue;
          const copy = structuredClone(orbital);
          const k = molecule.atomIds.indexOf(orbital.atom);
          const normal = normals[k];
          if (copy.kind === 'p' && normal && copy.plane == null) copy.plane = faceOf(normal, orbitalAngle(editor.doc, orbital));
          if (copy.plane != null) faces.set(copy.id, copy.plane);
          if (copy.kind === 'hybrid') {
            const basis = hybridBasis(molecule.points, molecule.links, k, orbitalAngle(editor.doc, orbital));
            if (basis) spatial.set(copy.id, basis);
          }
          doc.orbitals.set(copy.id, copy);
        }
        const sticks = sticksAt(model, clearest.points3, molecule, editor.doc);
        // one size for the drawing and the stick model (they lie on each other), with room for the drawing's labels
        // and for the stick model's groups drawn out (a benzoate's whole benzoyl, not just its label), turned any way, its
        // balls as large as space-filling ones (switching the style moves nothing)
        const radius = Math.max(...clearest.points3.map((p) => Math.hypot(...p) + 0.9), ...(sticks?.base ?? []).map((p) => Math.hypot(...p) + SPACEFILL_ROOM));
        // (the colours as drawn, to fade by depth from)
        const own = { atoms: new Map(molecule.atomIds.map((id) => [id, editor.doc.atoms.get(id).color ?? null]).filter(([, c]) => c)),
          bonds: new Map(molecule.bondIds.map((id) => [id, editor.doc.bonds.get(id).color ?? null]).filter(([, c]) => c)) };
        live.current = { job, molecule, model, base: clearest.points3, doc, own, faces, spatial, scale: Math.min(LARGEST, Math.min(WIDTH, HEIGHT) / (2 * radius)), rotation: IDENTITY, sticks };
        setState({ status: 'ready', lost: Boolean(model.conformationLost) });
      } catch (error) {
        console.error('[3D]', error);
        if (!cancelled) setState({ status: 'error', message: t('No 3D model of this molecule: {reason}.', { reason: error.message }) });
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame.current);
    };
  }, [editor, item]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    draw(live.current.rotation);
    check();
    stage.current?.parentElement.focus();
  }, [state.status, dark]); // eslint-disable-line react-hooks/exhaustive-deps

  const drag = useRef(null);
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e) => {
    if (!drag.current || !live.current) return;
    const [dx, dy] = [e.clientX - drag.current.x, e.clientY - drag.current.y];
    drag.current = { x: e.clientX, y: e.clientY };
    redraw(multiply(dragTurn(dx, dy, e.shiftKey), live.current.rotation));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    draw(live.current.rotation);
    check();
  };
  const onKeyDown = (e) => {
    const turns = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key === 'Enter' && item) apply();
    if (e.key === 'Enter' && fits && clear && !showSticks.current) use();
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey && live.current?.sticks && !item) {
      e.preventDefault();
      e.stopPropagation();
      toggleSticks();
      return;
    }
    // G: the stick model's groups drawn out, or each a ball with its name
    if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.altKey && showSticks.current && live.current?.sticks?.groups?.length) {
      e.preventDefault();
      e.stopPropagation();
      setShown({ groups: shown.current.groups === 'balls' ? 'out' : 'balls' });
      return;
    }
    // H: the hydrogens the model added as they are, small, or none, in turn
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey && showSticks.current && addedHydrogens(live.current?.sticks)) {
      e.preventDefault();
      e.stopPropagation();
      setShown({ hydrogens: HYDROGEN_STEPS[(HYDROGEN_STEPS.indexOf(shown.current.hydrogens) + 1) % HYDROGEN_STEPS.length] });
      return;
    }
    if (!turns[e.key] || !live.current) return;
    e.preventDefault();
    e.stopPropagation();
    const [x, y] = turns[e.key];
    const by = e.shiftKey ? rotationAbout([0, 0, 1], -x * STEP) : rotationAbout(x ? [0, 1, 0] : [1, 0, 0], (x || y) * STEP);
    draw(multiply(by, live.current.rotation));
    check();
  };
  const reset = () => {
    draw(IDENTITY);
    check();
  };
  // the stick model or the drawing, turned as it is
  const toggleSticks = () => {
    showSticks.current = !showSticks.current;
    setSticks(showSticks.current);
    draw(live.current.rotation);
    check();
    stage.current?.parentElement.focus();
  };
  // the stick model shown another way (`changes` to its look: style, hydrogens, groups, fade), remembered in this tab
  // (a model of the canvas keeps its own: Apply)
  const setShown = (changes) => {
    shown.current = { ...shown.current, ...changes };
    setLook(shown.current);
    if (!item) {
      try {
        sessionStorage.setItem(LOOK, JSON.stringify(shown.current));
      } catch {
        // (no storage: for this window only)
      }
    }
    draw(live.current.rotation);
    stage.current?.parentElement.focus();
  };
  // the stick model as it is turned, saved as a picture (named after the drawing, -3d)
  const save = (format) => {
    const now = live.current;
    const points = now.sticks.base.map((p) => turn(now.rotation, p));
    savePicture(editor, stickPicture({ ...now.sticks, points }, now.scale, stickLook(shown.current, false)), format, '-3d');
  };
  // the stick model as it is turned and shown, onto the canvas beside its molecule (a 3D model)
  const putOnCanvas = () => {
    const now = live.current;
    putModel(editor, { sticks: now.sticks, rotation: now.rotation, atomIds: now.molecule.atomIds, look: shown.current });
    editor.say(t('3D model put on the canvas: the panel on the right shows it another way. Ctrl+Z undoes it.'));
    onClose();
  };
  // the canvas's model turned and shown as here
  const apply = () => {
    const { rotation } = live.current;
    editor.change((doc) => {
      const target = doc.models.get(item.id);
      if (target) Object.assign(target, { rotation, look: { ...shown.current } });
    });
    onClose();
  };
  const use = () => {
    if (showSticks.current) return;
    const { job, molecule, model, base, rotation, faces, spatial } = live.current;
    // (a transition state goes onto the canvas as textbooks draw it, Nu···C···LG straight across, as Redraw draws it:
    // seen as it turns only here)
    const drawing = model.axial ? Object.assign(drawing3D(job, molecule, model, projected(base, rotation)), { faces, spatial }) : live.current.drawing;
    applyCandidate(editor, job, { drawings: [placed(molecule, drawing)] });
    if (fits) editor.say(t('New drawing applied. Ctrl+Z undoes it.'));
    else editor.say(t('New drawing applied, but check its R/S and E/Z. Ctrl+Z undoes it.'), 'error', 6000);
    onClose();
  };

  const hasGroups = Boolean(live.current?.sticks?.groups?.length);
  const legend = sticks && look.groups !== 'balls' && hasGroups ? labelColours(live.current.sticks.groups).legend : [];
  const option = (key, value, label, title = label, testId = null) => (
    <button key={String(value)} type="button" className={look[key] === value ? 'on' : ''} aria-pressed={look[key] === value} title={title} onClick={() => setShown({ [key]: value })} data-testid={testId ?? undefined}>{label}</button>
  );
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="glass dialog turn3d" role="dialog" aria-label={t('Turn in 3D')} style={{ width: `min(${WIDTH + 40}px, calc(100vw - 32px))` }}>
        <header>
          {icons.turn3d} {t('Turn in 3D')}
          <button type="button" className="btn" onClick={onClose} aria-label={t('Close')}>{icons.close}</button>
        </header>
        <div className="body">
          {state.status === 'working' && (
            <div className="stage working" data-testid="turn3d-working">
              <span className="spinner" aria-hidden="true" />
              <span className="small">{t('Building the 3D model…')} <Seconds /></span>
            </div>
          )}
          {state.status === 'error' && <p>{state.message}</p>}
          {state.status === 'ready' && (
            <>
              {/* the stage, and beside it how the stick model is shown: there with the drawing too, unseen, so that the
                  stage keeps its place and size as S switches the views (the model doesn't move) */}
              <div className="stage-row">
                <svg className="stage" viewBox={`${-WIDTH / 2} ${-HEIGHT / 2} ${WIDTH} ${HEIGHT}`} tabIndex={0} data-testid="turn3d-stage"
                  onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}>
                  <g ref={stage} />
                </svg>
                <aside className="look" data-testid="turn3d-look" style={sticks ? undefined : { visibility: 'hidden' }} aria-hidden={!sticks}>
                  <div className="option">
                    <span className="name">{t('Style')}</span>
                    <span className="seg column">
                      {option('style', 'balls', t('Ball and stick'))}
                      {option('style', 'sticks', t('Sticks'))}
                      {option('style', 'spacefill', t('Space-filling'), t('Each atom as large as the atom itself (its van der Waals radius)'), 'turn3d-spacefill')}
                    </span>
                  </div>
                  {addedHydrogens(live.current?.sticks) && (
                    <div className="option">
                      <span className="name" title="H">{t('Hydrogens')} <kbd>H</kbd></span>
                      <span className="seg column">
                        {option('hydrogens', 'all', t('all'), t('Hydrogens'))}
                        {option('hydrogens', 'small', t('small'), t('Small hydrogens: those the model adds small and near their atoms; those you drew stay as they are'), 'turn3d-small-h')}
                        {option('hydrogens', 'none', t('none'), t('Only the hydrogens you drew'), 'turn3d-no-h')}
                      </span>
                    </div>
                  )}
                  {hasGroups && (
                    <div className="option">
                      <span className="name">{t('Labels')} <kbd>G</kbd></span>
                      <span className="seg column">
                        {option('groups', 'out', t('drawn out'), t('Draw out groups'), 'turn3d-drawn-out')}
                        {option('groups', 'balls', t('as balls'), t('Each label one ball with its name'), 'turn3d-as-balls')}
                      </span>
                    </div>
                  )}
                  <div className="option">
                    <span className="name">{t('Depth')}</span>
                    <span className="seg column">
                      {option('fade', true, t('back paler'))}
                      {option('fade', false, t('even'), t('Every atom in its full colour'))}
                    </span>
                  </div>
                  {legend.length > 0 && (
                    <div className="legend" data-testid="turn3d-legend">
                      {legend.map(({ name, colour }) => <span key={name}><i style={{ background: colour }} />{name}</span>)}
                    </div>
                  )}
                </aside>
              </div>
              {/* (what is said under the stage in a box of its own height, and the buttons that stay where they
                  are on the left, so that nothing moves as S and G switch the views: the window stays put) */}
              <div className="notes" data-testid="turn3d-notes">
                <p className="small">{item
                  ? t('A 3D model of the canvas: drag to turn it (Shift: in the plane of the page), or use the arrow keys. Apply keeps the turn and the look.')
                  : sticks
                    ? t('The model as it is: its true bond lengths and angles, with its hydrogens, in the drawing\'s colours. Put it on the canvas beside its molecule, or save it as a picture. S: back to the drawing.')
                    : t('Drag to turn it (Shift: in the plane of the page), or use the arrow keys. What you see is what goes onto the canvas.')}</p>
                {state.lost && <p className="warn" data-testid="turn3d-conformation">{t('No 3D model with the conformation drawn (the chair, the dihedral) was found: this one has another.')}</p>}
                {!sticks && !fits && <p className="warn" role="alert" data-testid="turn3d-warning">{t("From this angle the wedges can't show its R/S, E/Z or Λ/Δ, so this view would lose or change them. Turn it a little, or use it anyway.")}</p>}
                {!sticks && fits && !clear && <p className="warn" role="alert" data-testid="turn3d-warning">{t("A bond points almost straight at you, so it can't be drawn long enough to read. Turn it a little, or use it anyway.")}</p>}
              </div>
              <div className="row buttons">
                <div className="group">
                  <button type="button" className="btn" onClick={reset}>{t('Clearest view')}</button>
                  {live.current?.sticks && !item && (
                    <button type="button" className={`btn${sticks ? ' on' : ''}`} aria-pressed={sticks} onClick={toggleSticks} title={`${t('Stick model')} (S)`} data-testid="turn3d-sticks">{t('Stick model')} <kbd>S</kbd></button>
                  )}
                </div>
                <div className="group">
                  {sticks ? (
                    <>
                      <button type="button" className="btn" onClick={() => save('svg')} title={t('SVG picture')} data-testid="turn3d-save-svg">SVG</button>
                      <button type="button" className="btn" onClick={() => save('png')} data-testid="turn3d-save">{t('Save picture')}</button>
                      {item
                        ? <button type="button" className="btn primary" onClick={apply} data-testid="turn3d-apply">{t('Apply')} <kbd>Enter</kbd></button>
                        : <button type="button" className="btn primary" onClick={putOnCanvas} data-testid="turn3d-put">{t('Put on canvas')}</button>}
                    </>
                  ) : (
                    <button type="button" className={`btn primary${fits && clear ? '' : ' anyway'}`} onClick={use} data-testid="turn3d-use">{fits && clear ? <>{t('Use this view')} <kbd>Enter</kbd></> : t('Use it anyway')}</button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
