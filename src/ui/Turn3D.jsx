// Turning a molecule in 3D by hand: its 3D model (the one Re-layout's 3D
// drawings come from), turned as you drag and drawn by the canvas's own
// renderer, as a drawing: bonds foreshortened, wedges by depth, a bond
// behind another broken where they cross. "Use this view" puts exactly that
// drawing in, as one undo step. "Stick model" shows the model itself instead,
// turned the same way: every atom with its hydrogens, true bond lengths and
// angles (render/sticks.js); only for looking, it can't go onto the canvas.
import { useEffect, useRef, useState } from 'react';
import { applyCandidate, drawing3D, model3D, placed, prepare, putDrawing, relayoutTargets, sameMolecule } from '../layout/relayout.js';
import { bestRotation, hardToRead, multiply, projected, rotationAbout, views } from '../layout/threeD.js';
import { labelColours, stickMarkup, stickPicture } from '../render/sticks.js';
import { savePicture } from './actions.js';
import { elementColor } from '../chem/elements.js';
import { emptyDoc, orbitalAngle } from '../model/doc.js';
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
// whether the stick model draws out the groups that labels stand for, as last chosen in this tab
const DRAWN_OUT = 'olomol-3d-groups-drawn-out';
// and whether it draws the hydrogens it added small (H)
const SMALL_HYDROGENS = 'olomol-3d-small-hydrogens';
const smallAsLast = () => {
  try {
    return sessionStorage.getItem(SMALL_HYDROGENS) === 'yes';
  } catch {
    return false;
  }
};
const drawnOutAsLast = () => {
  try {
    return sessionStorage.getItem(DRAWN_OUT) !== 'no';
  } catch {
    return true;
  }
};

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
  const [drawnOut, setDrawnOut] = useState(drawnOutAsLast); // the labels' groups drawn out in it, or each one ball with its name
  const groupsDrawnOut = useRef(drawnOut);
  const [small, setSmall] = useState(smallAsLast); // the hydrogens the model added small and near their atoms (H)
  const smallHydrogens = useRef(small);
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
      stage.current.innerHTML = stickMarkup({ ...now.sticks, points }, now.scale, { dark, collapsed: !groupsDrawnOut.current, smallHydrogens: smallHydrogens.current });
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
        // and for the stick model's groups drawn out (a benzoate's whole benzoyl, not just its label), turned any way
        const radius = Math.max(...clearest.points3.map((p) => Math.hypot(...p) + 0.9), ...(sticks?.base ?? []).map((p) => Math.hypot(...p) + 0.4));
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
  }, [editor]);

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
    if (e.key === 'Enter' && fits && clear && !showSticks.current) use();
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey && live.current?.sticks) {
      e.preventDefault();
      e.stopPropagation();
      toggleSticks();
      return;
    }
    // G: the stick model's groups drawn out, or each a ball with its name
    if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.altKey && showSticks.current && live.current?.sticks?.groups?.length) {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawnOut();
      return;
    }
    // H: the hydrogens the model added small, or as they are
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey && showSticks.current && addedHydrogens(live.current?.sticks)) {
      e.preventDefault();
      e.stopPropagation();
      toggleSmall();
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
  const toggleDrawnOut = () => {
    groupsDrawnOut.current = !groupsDrawnOut.current;
    setDrawnOut(groupsDrawnOut.current);
    try {
      sessionStorage.setItem(DRAWN_OUT, groupsDrawnOut.current ? 'yes' : 'no');
    } catch {
      // (no storage: for this window only)
    }
    draw(live.current.rotation);
    stage.current?.parentElement.focus();
  };
  const toggleSmall = () => {
    smallHydrogens.current = !smallHydrogens.current;
    setSmall(smallHydrogens.current);
    try {
      sessionStorage.setItem(SMALL_HYDROGENS, smallHydrogens.current ? 'yes' : 'no');
    } catch {
      // (no storage: for this window only)
    }
    draw(live.current.rotation);
    stage.current?.parentElement.focus();
  };
  // the stick model as it is turned, saved as a picture (named after the drawing, -3d)
  const save = (format) => {
    const now = live.current;
    const points = now.sticks.base.map((p) => turn(now.rotation, p));
    savePicture(editor, stickPicture({ ...now.sticks, points }, now.scale, { collapsed: !groupsDrawnOut.current, smallHydrogens: smallHydrogens.current }), format, '-3d');
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
  const legend = sticks && drawnOut && hasGroups ? labelColours(live.current.sticks.groups).legend : [];
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
              <svg className="stage" viewBox={`${-WIDTH / 2} ${-HEIGHT / 2} ${WIDTH} ${HEIGHT}`} tabIndex={0} data-testid="turn3d-stage"
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}>
                <g ref={stage} />
              </svg>
              {/* (what is said under the stage in a box of its own height, and the buttons that stay where they
                  are on the left, so that nothing moves as S and G switch the views: the window stays put) */}
              <div className="notes" data-testid="turn3d-notes">
                <p className="small">{sticks
                  ? t('The model as it is: its true bond lengths and angles, with its hydrogens, in the drawing\'s colours. It can be saved as a picture; only the drawing goes onto the canvas. S: back to the drawing.')
                  : t('Drag to turn it (Shift: in the plane of the page), or use the arrow keys. What you see is what goes onto the canvas.')}</p>
                {state.lost && <p className="warn" data-testid="turn3d-conformation">{t('No 3D model with the conformation drawn (the chair, the dihedral) was found: this one has another.')}</p>}
                {sticks && legend.length > 0 && (
                  <div className="legend" data-testid="turn3d-legend">
                    {legend.map(({ name, colour }) => <span key={name}><i style={{ background: colour }} />{name}</span>)}
                  </div>
                )}
                {!sticks && !fits && <p className="warn" role="alert" data-testid="turn3d-warning">{t("From this angle the wedges can't show its R/S, E/Z or Λ/Δ, so this view would lose or change them. Turn it a little, or use it anyway.")}</p>}
                {!sticks && fits && !clear && <p className="warn" role="alert" data-testid="turn3d-warning">{t("A bond points almost straight at you, so it can't be drawn long enough to read. Turn it a little, or use it anyway.")}</p>}
              </div>
              <div className="row buttons">
                <div className="group">
                  <button type="button" className="btn" onClick={reset}>{t('Clearest view')}</button>
                  {live.current?.sticks && (
                    <button type="button" className={`btn${sticks ? ' on' : ''}`} aria-pressed={sticks} onClick={toggleSticks} title={`${t('Stick model')} (S)`} data-testid="turn3d-sticks">{t('Stick model')} <kbd>S</kbd></button>
                  )}
                  {sticks && hasGroups && (
                    <button type="button" className={`btn${drawnOut ? ' on' : ''}`} aria-pressed={drawnOut} onClick={toggleDrawnOut} title={`${t('Draw out groups')} (G)`} data-testid="turn3d-drawn-out">{t('Draw out groups')} <kbd>G</kbd></button>
                  )}
                  {sticks && addedHydrogens(live.current?.sticks) && (
                    <button type="button" className={`btn${small ? ' on' : ''}`} aria-pressed={small} onClick={toggleSmall}
                      title={`${t('Small hydrogens: those the model adds small and near their atoms; those you drew stay as they are')} (H)`} data-testid="turn3d-small-h">{t('Small hydrogens')} <kbd>H</kbd></button>
                  )}
                </div>
                <div className="group">
                  {sticks ? (
                    <>
                      <button type="button" className="btn" onClick={() => save('svg')} title={t('SVG picture')} data-testid="turn3d-save-svg">SVG</button>
                      <button type="button" className="btn primary" onClick={() => save('png')} data-testid="turn3d-save">{t('Save picture')}</button>
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
