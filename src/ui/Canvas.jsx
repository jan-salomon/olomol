// The drawing area: the drawing itself (SVG from render/svg.js), and on top
// of it what the editor wants to show: selection, hover, tool previews,
// and in debug mode how labels, electrons and arrows were placed.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { arrowHandles, editText, groupBoxes, groupUnder, putTypedText, selectedGroup, selectMolecule, TOOLS, rotationHandle, selectionBox } from '../editor/tools.js';
import { buildScene, DEFAULT_SETTINGS } from '../render/scene.js';
import { lobePath } from '../render/orbitals.js';
import { FONTS, STYLE } from '../render/style.js';
import { bondsByAtom, freeIds, moveObjects, otherEnd } from '../model/doc.js';
import { readChair } from '../chem/ringFlip.js';
import { fischerSpines } from '../chem/fischer.js';
import { moleculeAt } from '../chem/chains.js';
import { NEWMAN_RADIUS } from '../chem/newman.js';
import { sceneLayers, sceneMarkup } from '../render/svg.js';
import { t } from '../i18n/i18n.js';
import { formatPart, markupOf, modelOf, readModel, select, selectionIn, togglePart, writeModel } from './richText.js';
import DebugLayer from './DebugLayer.jsx';
import { icons } from './icons.jsx';

const f = (v) => +v.toFixed(3);

// A small + (on the place something dragged goes to).
const plusAt = ([x, y], r) => <path className="slot-plus" d={`M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}`} />;

// Halos: what is selected or under the pointer (blended into the drawing);
// with `turning`, instead, the part a bond would turn over, washed out
// towards the canvas (its turned copy, in blue, goes over it).
function Halos({ editor, scene, turning: washed = false }) {
  const items = [];
  const halo = (id, className) => {
    const atom = scene.atoms.get(id);
    // a Newman projection's back carbon: its circle
    if (atom && scene.newmanBacks?.has(id)) {
      items.push(<circle key={`${className}${id}`} className={className} cx={atom.pos[0]} cy={atom.pos[1]} r={NEWMAN_RADIUS} style={{ fill: 'none' }} strokeWidth={0.2} />);
      return;
    }
    if (atom) {
      items.push(<circle key={`${className}${id}`} className={className} cx={atom.pos[0]} cy={atom.pos[1]} r={atom.label ? 0.36 : 0.26} stroke="none" />);
      return;
    }
    const bond = scene.bonds.get(id);
    if (bond) {
      // (where the scene has them, not the document: a slide shows the scene it started with)
      const [p, q] = [scene.atoms.get(bond.a).pos, scene.atoms.get(bond.b).pos];
      items.push(<line key={`${className}${id}`} className={className} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} strokeWidth={0.34} strokeLinecap="round" />);
      return;
    }
    const arrow = scene.arrows.get(id);
    if (arrow) {
      const [x1, y1, x2, y2] = arrow.ends;
      items.push(<line key={`${className}${id}`} className={className} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={0.4} strokeLinecap="round" />);
      // its side arcs with it
      for (const arc of arrow.arcs ?? []) items.push(<path key={`${className}${id}-${arc.id}`} className={className} d={arc.d} style={{ fill: 'none' }} strokeWidth={0.3} strokeLinecap="round" />);
      return;
    }
    // a side arc on its own
    const arc = [...(scene.arrowArcs?.values() ?? [])].find((x) => x.id === id);
    if (arc) {
      items.push(<path key={`${className}${id}`} className={className} d={arc.d} style={{ fill: 'none' }} strokeWidth={0.3} strokeLinecap="round" />);
      return;
    }
    const curve = scene.curves.get(id);
    if (curve) {
      items.push(<path key={`${className}${id}`} className={className} d={curve.d} style={{ fill: 'none' }} strokeWidth={0.26} strokeLinecap="round" />);
      return;
    }
    const plus = scene.pluses.get(id);
    if (plus) {
      items.push(<circle key={`${className}${id}`} className={className} cx={plus.at[0]} cy={plus.at[1]} r={0.42} stroke="none" />);
      return;
    }
    const bracket = scene.brackets.get(id);
    if (bracket) {
      for (const [k, d] of bracket.paths.entries()) items.push(<path key={`${className}${id}-${k}`} className={className} d={d} style={{ fill: 'none' }} strokeWidth={0.3} strokeLinecap="round" strokeLinejoin="round" />);
      return;
    }
    // an orbital: its lobes, widened; the dashed line between two
    const orbital = scene.orbitals?.get(id);
    if (orbital) {
      for (const [k, lobe] of orbital.lobes.entries()) items.push(<path key={`${className}${id}-${k}`} className={className} d={lobePath(lobe, (v) => v)} strokeWidth={0.2} strokeLinejoin="round" />);
      return;
    }
    const overlap = scene.overlaps?.get(id);
    if (overlap) {
      const [p, q] = overlap.line;
      items.push(<line key={`${className}${id}`} className={className} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} strokeWidth={0.26} strokeLinecap="round" />);
      return;
    }
    const fill = scene.fills.find((f) => f.fill.id === id);
    if (fill) {
      items.push(<polygon key={`${className}${id}`} className={className} points={fill.polygon.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')} stroke="none" />);
      return;
    }
    const text = scene.texts.get(id);
    if (text) {
      const b = text.box;
      items.push(<rect key={`${className}${id}`} className={className} x={b.x1 - 0.08} y={b.y1 - 0.06} width={b.x2 - b.x1 + 0.16} height={b.y2 - b.y1 + 0.12} rx={0.12} stroke="none" />);
      return;
    }
    const model = scene.models?.get(id);
    if (model) {
      const b = model.box;
      items.push(<rect key={`${className}${id}`} className={className} x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} rx={0.2} style={{ fill: 'none' }} strokeWidth={0.12} />);
    }
  };
  // turning over a bond: what turns, washed out (its copy shows where it goes), and the axle in
  // the copy's blue over it
  const flip = editor.preview?.turning;
  if (washed) {
    if (!flip) return null;
    for (const id of flip) halo(id, 'halo wash');
    const wash = items.splice(0);
    halo(editor.preview.axle, 'halo axle');
    return (
      <>
        <g className="halos washed">{wash}</g>
        <g className="halos axle">{items}</g>
      </>
    );
  }
  // One group with one opacity, so overlapping halos never add up: what is under the pointer
  // (paler) first, the selection over it, so where they meet only the selection shows.
  // Making a bond horizontal: the bond under the pointer in the flip's blue, over the selection.
  const snapping = editor.tool.name === 'snapBond' && editor.hover?.kind === 'bond';
  // (a ring read as a chair under the pointer shows in its own colour, ChairUnder, instead of the pointer's blue)
  // (a Fischer projection's spine doesn't: its atoms are drawn on one by one, so the one pointed at shows; with the
  // Fischer tool, a click takes the whole projection, so the spine alone)
  // (a text being written in: none, the field over it shows it as chosen, with a glow of its own)
  const writing = editor.editing?.id;
  // a box or lasso being dragged: what letting go would select, paler; what is selected now only if it stays
  // (Shift adds)
  const taking = editor.preview?.taking;
  if (taking) {
    for (const id of taking) if (!(editor.preview.adding && editor.selection.has(id))) halo(id, 'halo hover');
    if (editor.preview.adding) for (const id of editor.selection) halo(id, 'halo');
    return <g className="halos" data-testid="box-taking">{items}</g>;
  }
  if (editor.hover && editor.hover.id !== writing && !editor.selection.has(editor.hover.id) && editor.tool.name !== 'text' && !flip && !snapping && !pointedChair(editor, scene) && !(editor.tool.name === 'fischer' && pointedSpine(editor, scene))) halo(editor.hover.id, 'halo hover');
  for (const id of editor.selection) if (id !== writing) halo(id, 'halo');
  if (snapping) {
    const selected = items.splice(0);
    halo(editor.hover.id, 'halo axle');
    return (
      <>
        <g className="halos">{selected}</g>
        <g className="halos axle">{items}</g>
      </>
    );
  }
  return <g className="halos">{items}</g>;
}

// Atoms with more bonds than they can have: a dashed red ring round each
// (on screen only; a colour alone looked like cobalt's or oxygen's).
function ErrorRings({ scene }) {
  const rings = [];
  for (const [id, info] of scene.atoms) {
    if (info.chem.error) rings.push(<circle key={id} className="error-ring" cx={info.pos[0]} cy={info.pos[1]} r={info.label ? 0.42 : 0.3} />);
  }
  return rings.length ? <g>{rings}</g> : null;
}

// 3D models out of date (their molecule changed since they were built): a dashed frame round each, on the canvas
// only (not in pictures and files), till Update in the panel builds it again
function StaleModels({ scene }) {
  const frames = [];
  for (const [id, { box, stale }] of scene.models ?? []) {
    if (stale) frames.push(<rect key={id} className="stale-model" x={box.x1} y={box.y1} width={box.x2 - box.x1} height={box.y2 - box.y1} rx={0.2} data-testid="stale-model" />);
  }
  return frames.length ? <g>{frames}</g> : null;
}

// Rings read as chairs (drawn as the templates draw them or by hand, readChair), per scene: Map (each of their
// atoms and bonds -> the ring's bonds). Pointed at or an atom of one dragged, the ring lights up in the chairs'
// colour instead of the pointer's blue: nothing is drawn on the canvas for it otherwise.
const chairsOf = new WeakMap();
function chairBonds(doc, scene) {
  if (chairsOf.has(scene)) return chairsOf.get(scene);
  const byAtom = bondsByAtom(doc);
  const chairs = new Map();
  for (const ring of scene.rings) {
    if (ring.length !== 6 || !ring.every((id) => doc.atoms.has(id)) || readChair(doc, ring, byAtom).error) continue;
    const bonds = ring.map((id, i) => byAtom.get(id).find((b) => otherEnd(b, id) === ring[(i + 1) % 6])?.id).filter((id) => id != null);
    for (const id of [...ring, ...bonds]) chairs.set(id, bonds);
  }
  chairsOf.set(scene, chairs);
  return chairs;
}

// The bonds of the chair pointed at, or an atom of which is dragged (null: none): not while a bond is turned
// over or made straight, nor with the text tool.
function pointedChair(editor, scene) {
  // (a flat ring the ring flip tool would make a chair of: lit as one)
  if (editor.tool.name === 'ringFlip' && editor.preview?.lit) return editor.preview.lit;
  if (editor.tool.name === 'text' || editor.preview?.turning || (editor.tool.name === 'snapBond' && editor.hover?.kind === 'bond')) return null;
  const gesture = editor.gesture;
  const pointed = gesture?.moved && gesture.hit?.kind === 'atom' ? gesture.hit.id : editor.hover?.id;
  return pointed == null ? null : chairBonds(editor.doc, scene).get(pointed) ?? null;
}

// Fischer projections (their centres marked: chem/fischer.js), per scene: Map (each of their atoms, the groups
// on them and their bonds -> the spine's bonds). Pointed at, the spine lights up in the chairs' colour: nothing
// on the canvas says otherwise that a cross is read as a Fischer projection.
const spinesOf = new WeakMap();
function spineBonds(doc, scene) {
  if (!spinesOf.has(scene)) spinesOf.set(scene, fischerSpines(doc));
  return spinesOf.get(scene);
}

// The spine lit, { bonds, pale } (null: none): with the Fischer tool, the one a click would read (pale) or reads;
// else a Fischer projection pointed at, not while something is dragged
function pointedSpine(editor, scene) {
  if (editor.tool.name === 'fischer') return editor.preview?.kind === 'fischer' ? editor.preview : null;
  if (editor.tool.name === 'text' || editor.preview?.turning || editor.gesture?.moved) return null;
  const pointed = editor.hover?.id;
  const bonds = pointed == null ? null : spineBonds(editor.doc, scene).get(pointed);
  return bonds ? { bonds, pale: false } : null;
}

// The chair pointed at: its ring in a pastel green-teal, opaque, under the whole drawing, its highlights and ring
// fills too (a highlight, or a mark an embedding page put on an atom, stays whole over it). A Fischer projection's
// spine the same (paler: what the Fischer tool would read).
function ChairUnder({ editor, scene, scale }) {
  const chair = pointedChair(editor, scene);
  const spine = pointedSpine(editor, scene);
  // (the Fischer or zigzag tool over a molecule: how it would be drawn, see-through, a word above it)
  const note = ['fischer', 'zigzag'].includes(editor.tool.name) && editor.preview?.kind === 'place' ? editor.preview.note : null;
  if (!chair && !spine && !note) return null;
  const lines = (bonds) => bonds.map((id) => {
    const bond = scene.bonds.get(id);
    if (!bond) return null;
    const [p, q] = [scene.atoms.get(bond.bond.a).pos, scene.atoms.get(bond.bond.b).pos];
    return <line key={id} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />;
  });
  return (
    <g className="chair-under" transform={`scale(${scale})`} strokeWidth={STYLE.highlightWidth + 0.06} strokeLinecap="round" data-testid="chair-under">
      {chair && lines(chair)}
      {spine && <g className="spine" opacity={spine.pale ? 0.6 : 1} data-testid="fischer-spine" data-pale={spine.pale ? 'true' : 'false'}>{lines(spine.bonds)}</g>}
      {spine && <SpineNote editor={editor} scene={scene} spine={spine} />}
      {note && <text className="chair-note" x={note.at[0]} y={note.at[1]} fontSize={0.3} textAnchor="middle" data-testid="fischer-note">{note.text}</text>}
    </g>
  );
}

// Above a Fischer projection's spine, pointed at: that it is read as one (so one look says it; with the Fischer
// tool, what a click does)
function SpineNote({ editor, scene, spine }) {
  // (above the whole molecule, its groups too: not on a label at the top)
  const first = scene.bonds.get(spine.bonds[0])?.bond.a;
  if (first == null) return null;
  const points = moleculeAt(editor.doc, first).map((id) => scene.atoms.get(id)?.pos).filter(Boolean);
  const top = [scene.atoms.get(first).pos[0], Math.min(...points.map((p) => p[1]))];
  const tool = editor.tool.name === 'fischer';
  const text = spine.pale ? t('Plain lines · click: Fischer projection') : tool ? t('Fischer projection · click: plain lines') : t('Fischer projection');
  return <text className="chair-note" x={top[0]} y={top[1] - 0.5} fontSize={0.3} textAnchor="middle" data-testid="fischer-note">{text}</text>;
}

// The links that keep molecules together: dashed, on screen only, when
// Settings shows them or both their atoms are selected.
function Links({ editor, scene }) {
  const lines = [];
  for (const { bond } of scene.bonds.values()) {
    if (bond.kind !== 'link' || !(scene.settings.showLinks || (editor.selection.has(bond.a) && editor.selection.has(bond.b)))) continue;
    const [p, q] = [scene.atoms.get(bond.a), scene.atoms.get(bond.b)];
    const length = Math.hypot(q.pos[0] - p.pos[0], q.pos[1] - p.pos[1]) || 1;
    const [ux, uy] = [(q.pos[0] - p.pos[0]) / length, (q.pos[1] - p.pos[1]) / length];
    const [cutP, cutQ] = [p.label ? 0.32 : 0.1, q.label ? 0.32 : 0.1];
    if (cutP + cutQ >= length) continue;
    lines.push(<line key={bond.id} className="link-line" x1={p.pos[0] + ux * cutP} y1={p.pos[1] + uy * cutP} x2={q.pos[0] - ux * cutQ} y2={q.pos[1] - uy * cutQ} />);
  }
  return lines.length ? <g>{lines}</g> : null;
}

// While a text or molecule is dragged: the places it could go (anchors,
// arrows) and the one it snaps to, with a +; under the drawing, so what
// is dragged stays in sight.
function Places({ preview, scale }) {
  if (preview?.kind !== 'slots') return null;
  const px = 1 / scale;
  return (
    <g>
      {preview.boxes.map((b, k) => <rect key={k} className="slot" x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} rx={3 * px} />)}
      {/* the chosen place: blue, with a + (a block, or a bar in a gap of a stack on an arrow) */}
      {preview.chosen && <rect className="slot-bar" x={preview.chosen.x1} y={preview.chosen.y1} width={preview.chosen.x2 - preview.chosen.x1} height={preview.chosen.y2 - preview.chosen.y1} rx={3 * px} />}
      {preview.chosen && plusAt([(preview.chosen.x1 + preview.chosen.x2) / 2, (preview.chosen.y1 + preview.chosen.y2) / 2], 6 * px)}
      {preview.line && (() => {
        // a place inside a stack on an arrow: a thin bar in the gap, with a +
        const [x1, y1, x2, y2] = preview.line;
        const [cx, cy, length] = [(x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1)];
        return (
          <g>
            <rect className="slot-bar" transform={`translate(${cx} ${cy}) rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI})`}
              x={-length / 2} y={-8 * px} width={length} height={16 * px} rx={3 * px} />
            {plusAt([cx, cy], 5 * px)}
          </g>
        );
      })()}
    </g>
  );
}

// While a curved arrow is drawn: a faint line from where its electrons are to each atom they could make a new
// bond with, a dot in its middle to drop the arrow on (stronger in the pointer's direction; the one the arrow
// would end on, strongest). The lines stop short of the atoms.
function NewBonds({ gaps, px }) {
  if (!gaps?.length) return null;
  return (
    <g className="new-bonds">
      {gaps.map(({ p, q, mid, strong, active }, k) => {
        const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        const cut = Math.min(0.3, length / 4) / length;
        const [x1, y1, x2, y2] = [p[0] + (q[0] - p[0]) * cut, p[1] + (q[1] - p[1]) * cut, q[0] - (q[0] - p[0]) * cut, q[1] - (q[1] - p[1]) * cut];
        return (
          <g key={k} className={active ? 'active' : strong ? 'strong' : undefined}>
            <line x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} />
            <circle cx={f(mid[0])} cy={f(mid[1])} r={(active ? 6 : 4) * px} />
          </g>
        );
      })}
    </g>
  );
}

function Preview({ preview, scale }) {
  if (!preview) return null;
  const px = 1 / scale;
  switch (preview.kind) {
    case 'rect':
      return <rect className={`rubber${preview.erase ? ' erase' : ''}`} x={preview.x1} y={preview.y1} width={preview.x2 - preview.x1} height={preview.y2 - preview.y1} rx={4 * px} />;
    case 'lasso':
      return <polygon className="rubber" points={preview.points.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')} />;
    case 'curve':
      return (
        <>
        <NewBonds gaps={preview.gaps} px={px} />
        <g className="curve-preview">
          <path d={preview.d} fill="none" strokeWidth={0.05} strokeLinecap="round" />
          {preview.barb
            ? <path d={preview.barb} fill="none" strokeWidth={0.05} strokeLinecap="round" strokeLinejoin="round" />
            : <polygon points={preview.head.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')} strokeWidth={0.012} />}
        </g>
        </>
      );
    case 'slots':
      return null; // (drawn under the drawing: Places)
    case 'anchor':
      // a reaction arrow's middle: drag from it (an arc going out) or to it (one going in)
      return <circle className="anchor" cx={preview.at[0]} cy={preview.at[1]} r={7 * px} />;
    case 'lines':
      return (
        <g className="ghost">
          {preview.lines.map(([x1, y1, x2, y2], k) => <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />)}
        </g>
      );
    case 'ghost': {
      const polygon = <polygon className="ghost" points={preview.polygon.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')} />;
      if (!preview.bond) return polygon;
      // a ring hung on an atom: the bond it hangs by too
      const [x1, y1, x2, y2] = preview.bond;
      return <>{polygon}<g className="ghost"><line x1={x1} y1={y1} x2={x2} y2={y2} /></g></>;
    }
    case 'overlap': {
      // a lobe dragged onto another orbital: the dashed line it will draw between them
      if (!preview.line) return null;
      const [p, q] = preview.line;
      return <line className="curve-preview" x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} strokeWidth={0.05} strokeDasharray="0.1 0.08" strokeLinecap="round" />;
    }
    case 'pull': {
      const [p, q] = [preview.from, preview.to];
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const n = [-(q[1] - p[1]) * 0.3, (q[0] - p[0]) * 0.3];
      return (
        <>
          <NewBonds gaps={preview.gaps} px={px} />
          <path className="pull" d={`M${f(p[0])} ${f(p[1])} Q${f(mid[0] + n[0])} ${f(mid[1] + n[1])} ${f(q[0])} ${f(q[1])}`} />
        </>
      );
    }
    default:
      return null;
  }
}

// A see-through copy of a template under the pointer, in screen pixels;
// `tint`: all in blue (where a part turned over a bond goes).
const ghosts = new WeakMap(); // template drawing -> { scale, markup }
const TINT = { light: '#1f5fe0', dark: '#6f9dff' }; // a saturated blue of the theme (--turned in app.css)
function Ghost({ preview, view, dark }) {
  let ghost = ghosts.get(preview.doc);
  if (!ghost || ghost.scale !== view.scale || ghost.dark !== dark) {
    const doc = structuredClone(preview.doc);
    const xs = [...doc.atoms.values()].map((a) => a.x);
    const ys = [...doc.atoms.values()].map((a) => a.y);
    // (`middle`: where the click puts it, given by the tool placing it; else the atoms' middle, which the turning
    // previews give `at` by)
    const [cx, cy] = preview.middle ?? (xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0]);
    moveObjects(doc, [...doc.atoms.keys(), ...freeIds(doc)], -cx, -cy); // (with an arrow: a ring flip's other chair beside)
    const settings = preview.tint ? { ...DEFAULT_SETTINGS, colorMode: 'mono', ink: TINT[dark ? 'dark' : 'light'] } : DEFAULT_SETTINGS;
    if (preview.tint) for (const object of [...doc.atoms.values(), ...doc.bonds.values()]) object.color = null;
    ghost = { scale: view.scale, dark, markup: sceneMarkup(buildScene(doc, settings), view.scale, { dark: dark && !preview.tint }) };
    ghosts.set(preview.doc, ghost);
  }
  const [x, y] = [preview.at[0] * view.scale + view.tx, preview.at[1] * view.scale + view.ty];
  return <g className={`ghost-copy${preview.tint ? ' tinted' : ''}`} transform={`translate(${f(x)} ${f(y)})`} dangerouslySetInnerHTML={{ __html: ghost.markup }} />;
}

// Previews in screen pixels (counts, angles), drawn outside the zoomed group.
function ScreenPreview({ preview, view, dark }) {
  if (preview?.kind === 'place') return <Ghost preview={preview} view={view} dark={dark} />;
  // a count or an angle; or a hint beside a curved arrow being drawn ("Shift: to a new bond")
  const badge = preview?.kind === 'badge' ? preview : preview?.kind === 'angle' ? { at: preview.centre, text: preview.text } : preview?.hint;
  if (!badge) return null;
  const [x, y] = [badge.at[0] * view.scale + view.tx, badge.at[1] * view.scale + view.ty];
  const width = 10 + badge.text.length * 7;
  return (
    <g className={`badge${preview.hint === badge ? ' hint' : ''}`} transform={`translate(${f(x)} ${f(y)})`} data-testid={preview.hint === badge ? 'new-bond-hint' : undefined}>
      <rect x={preview.hint === badge ? 0 : -width / 2} y={-10} width={width} height={20} rx={10} />
      <text textAnchor={preview.hint === badge ? 'start' : 'middle'} x={preview.hint === badge ? 8 : 0} y={4}>{badge.text}</text>
    </g>
  );
}

function SelectionFrame({ editor, scale }) {
  if (editor.tool.name !== 'select' || (editor.gesture && editor.gesture.mode !== 'arrowEnd')) return null;
  const px = 1 / scale;
  // the ends of selected reaction arrows can be dragged
  const ends = arrowHandles(editor).map(({ id, end, point }) => (
    <circle key={`${id}-${end}`} className="handle" cx={point[0]} cy={point[1]} r={5 * px} />
  ));
  const box = selectionBox(editor);
  if (!box || editor.selection.size < 2 || editor.gesture) return <g>{ends}</g>;
  const handle = rotationHandle(editor);
  // (a group selected: its outline stands for the selection's box, GroupOutlines; the handle's stalk reaches it)
  const group = selectedGroup(editor);
  const top = group === null ? box.y1 : groupBoxes(editor).get(group)?.y1 ?? box.y1;
  return (
    <g>
      {ends}
      {group === null && <rect className="sel-box" x={box.x1} y={box.y1} width={box.x2 - box.x1} height={box.y2 - box.y1} rx={6 * px} />}
      {handle && (
        <>
          <line className="sel-box" x1={handle.point[0]} y1={handle.point[1] + 6 * px} x2={handle.point[0]} y2={Math.max(top, handle.point[1] + 6 * px)} />
          <circle className="handle" cx={handle.point[0]} cy={handle.point[1]} r={6 * px} />
        </>
      )}
    </g>
  );
}

// Groups seen (grouping.js): while Ctrl is held with the select tool, every group outlined, boxes in boxes where
// they are nested, the one a Ctrl+click would pick (under the pointer) stronger; and the group that is what is
// selected (picked by Ctrl+click, just made by Ctrl+G) outlined while it is
function GroupOutlines({ editor, scale }) {
  if (editor.tool.name !== 'select' || editor.gesture || !editor.doc.groups?.size) return null;
  const showing = editor.ctrlHeld;
  const chosen = selectedGroup(editor);
  if (!showing && chosen === null) return null;
  const boxes = groupBoxes(editor);
  const under = showing && editor.hover ? groupUnder(editor, editor.hover.id) : null;
  const shown = showing ? [...boxes.keys()] : [chosen];
  return (
    <g data-testid="group-outlines">
      {shown.filter((id) => boxes.has(id)).sort((a, b) => boxes.get(b).depth - boxes.get(a).depth).map((id) => {
        const box = boxes.get(id);
        const kind = id === under ? ' under' : id === chosen ? ' chosen' : '';
        return <rect key={id} className={`group-box${kind}`} x={box.x1} y={box.y1} width={box.x2 - box.x1} height={box.y2 - box.y1} rx={8 / scale}
          data-testid={id === under ? 'group-outline' : id === chosen ? 'group-chosen' : undefined} />;
      })}
    </g>
  );
}

// Characters a chemist types that a keyboard hasn't, in groups (the
// characters menu of the text window), and the alignments of a text's lines.
const CHARACTERS = [
  [() => t('Greek letters'), 'αβγδεζηθικλμνξπρστυφχψω'],
  [() => t('Capital Greek letters'), 'ΓΔΘΛΞΠΣΦΨΩ'],
  [() => t('Arrows'), '→←↔⇌⇄↑↓'],
  [() => t('Signs'), '°±×·•‡−′″≈≠≤≥∞‰'],
];
const ALIGNS = { left: 'alignLeft', center: 'alignCentre', right: 'alignRight' }; // (the menu: from the left at the bottom, on its button)
const plainTyping = { shift: 0, bold: false, italic: false };
const CHARACTERS_HEIGHT = 340; // (about: the characters menu, for whether it fits under the window)

// Writing a text: what is typed stays plain. The window above it, one row:
// Formula formats the selection (or, with nothing selected, all of it) as
// a formula (H2SO4, CO32−, [SiF6]2−), Plain takes all formatting off; x₂,
// x², B and I (Ctrl+, Ctrl+. Ctrl+B Ctrl+I) change the selection, or with
// nothing selected what is typed next; the alignment of its lines and the
// characters (°, Greek letters, arrows) open small menus. Kept as markup in
// the drawing (richText.js).
function TextEditor({ editor }) {
  const ref = useRef(null);
  const [typing, setTyping] = useState(plainTyping); // how what is typed next is formatted
  const [align, setAlign] = useState(null); // as set here (null: as it was)
  const [menu, setMenu] = useState(null); // the open menu: 'align', 'characters' or none
  const [upwards, setUpwards] = useState(false); // the characters menu over the window (no room under it, above the bottom bar)
  const [size, setSize] = useState(1); // the text's size, a factor of the style's text size
  const [family, setFamily] = useState(null); // 'sans', 'serif', or null: the style's
  const editing = editor.editing;
  // The text tools clear of the panels and bars (the selection's panel on the right, the bars) and inside the window:
  // over the field if there is room, else under it; moved sideways off a panel in the way. { dx (px from where they
  // would stand), y (their top, px) }, or null before they are measured.
  const toolsRef = useRef(null);
  const [toolsPlace, setToolsPlace] = useState(null);
  useLayoutEffect(() => {
    const tools = toolsRef.current;
    const field = ref.current;
    if (!tools || !field) return;
    const t = tools.getBoundingClientRect();
    const f = field.getBoundingClientRect();
    const [w, h] = [t.width, t.height];
    const base = t.left - (toolsPlace?.dx ?? 0);
    const panels = [...document.querySelectorAll('.inspector, .topbar, .topright, .rail, .dock')]
      .map((element) => element.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const GAP = 8;
    const fit = (y) => {
      let x = base;
      for (let round = 0; round < 3; round++) {
        const inWay = panels.find((p) => x < p.right + GAP && x + w > p.left - GAP && y < p.bottom && y + h > p.top);
        if (!inWay) break;
        // beside it, on the side towards the window's middle first; the other side if that one has no room
        const [before, after] = [inWay.left - GAP - w, inWay.right + GAP];
        const fits = (at) => at >= GAP && at + w <= window.innerWidth - GAP;
        const first = (inWay.left + inWay.right) / 2 > x + w / 2 ? before : after;
        x = fits(first) ? first : fits(first === before ? after : before) ? (first === before ? after : before) : first;
      }
      x = Math.max(GAP, Math.min(window.innerWidth - GAP - w, x));
      const clear = y >= GAP && y + h <= window.innerHeight - GAP && !panels.some((p) => x < p.right && x + w > p.left && y < p.bottom && y + h > p.top);
      return { x, y, clear };
    };
    const above = fit(f.top - 6 - h);
    const chosen = above.clear ? above : [fit(f.bottom + 6)].find((below) => below.clear) ?? above;
    const next = { dx: chosen.x - base, y: chosen.y };
    if (!toolsPlace || Math.abs(next.dx - toolsPlace.dx) > 0.5 || Math.abs(next.y - toolsPlace.y) > 0.5) setToolsPlace(next);
  });
  useEffect(() => {
    if (!editing || !ref.current) return;
    const model = modelOf(editing.value ?? '');
    writeModel(ref.current, model);
    ref.current.focus();
    select(ref.current, model.length);
    setTyping(plainTyping);
    setAlign(null);
    setMenu(null);
    setSize(editing.size > 0 ? editing.size : 1);
    setFamily(editing.family ?? null);
  }, [editing]);
  // typing: plain characters, put in by the model (not into a neighbouring <sub>);
  // the browser's own beforeinput (React's onBeforeInput is another event)
  const insertRef = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const typed = (e) => {
      if (e.inputType !== 'insertText' || !e.data) return;
      e.preventDefault();
      insertRef.current?.(e.data, true);
    };
    element.addEventListener('beforeinput', typed);
    return () => element.removeEventListener('beforeinput', typed);
  }, [editing]);
  if (!editing) return null;
  const { scale, tx, ty } = editor.view;
  const shownAlign = align ?? editing.align ?? editing.auto ?? 'left';
  // the model changed here: drawn again, the selection (or caret) put back
  const redraw = (next, start, end = start) => {
    writeModel(ref.current, next);
    select(ref.current, start, end);
  };
  // typed text (formatted as the buttons say) and pasted text (plain)
  const insert = (text, typed = false) => {
    const current = readModel(ref.current); // (deleting is the browser's own: read what is there)
    const range = selectionIn(ref.current) ?? { start: current.length, end: current.length };
    const added = [...text.replace(/\r/g, '')].map((ch) => ({ ch, ...(typed && ch !== '\n' ? typing : plainTyping) }));
    redraw([...current.slice(0, range.start), ...added, ...current.slice(range.end)], range.start + added.length);
  };
  insertRef.current = insert;
  // the selection (still selected after), or with nothing selected all of it (the caret where it was)
  const format = (how) => {
    const model = readModel(ref.current);
    const range = selectionIn(ref.current);
    if (range && range.end > range.start) redraw(formatPart(model, range.start, range.end, how), range.start, range.end);
    else redraw(formatPart(model, 0, model.length, how), range?.start ?? model.length);
  };
  // x₂, x², B, I: the selection given it (again: taken off), or what is typed next
  const toggle = (kind) => {
    const range = selectionIn(ref.current);
    if (range && range.end > range.start) {
      redraw(togglePart(readModel(ref.current), range.start, range.end, kind), range.start, range.end);
    } else if (kind === 'sub' || kind === 'sup') {
      setTyping((now) => ({ ...now, shift: now.shift === kind ? 0 : kind }));
    } else {
      setTyping((now) => ({ ...now, [kind]: !now[kind] }));
    }
  };
  const commit = () => {
    const text = markupOf(readModel(ref.current)).replace(/\s+$/, '');
    const newAlign = align ?? editing.align;
    // (its size and font: kept only where not the style's)
    const look = { size: Math.abs(size - 1) > 1e-6 ? size : undefined, family: family ?? undefined };
    const lookChanged = look.size !== (editing.size > 0 && editing.size !== 1 ? editing.size : undefined) || look.family !== (editing.family ?? undefined);
    editor.editing = null;
    if (editing.id !== null) {
      if (!text) editor.change((doc) => doc.texts.delete(editing.id));
      else if (text !== editing.value || newAlign !== editing.align || lookChanged) {
        editor.change((doc) => {
          const changed = doc.texts.get(editing.id);
          changed.text = text;
          if (editing.bold) delete changed.bold; // (its bold is in the text now: editText)
          if (newAlign) changed.align = newAlign;
          for (const key of ['size', 'family']) {
            if (look[key] === undefined) delete changed[key];
            else changed[key] = look[key];
          }
        });
      } else editor.emit();
    } else if (text) {
      editor.change((doc) => {
        const id = doc.nextId++;
        doc.texts.set(id, { id, x: editing.x, y: editing.y, text, color: null, ...(newAlign && { align: newAlign }), ...(look.size && { size: look.size }), ...(look.family && { family: look.family }) });
        putTypedText(editor, doc, doc.texts.get(id)); // (typed where a molecule's or an arrow's text goes: put there)
      });
    } else {
      editor.emit();
    }
  };
  const fontPx = Math.max(12, STYLE.textFont * size * scale);
  // the size in points as the drawing's style has its texts (a factor of them kept: they follow the style)
  const stylePt = STYLE.textFont * STYLE.exportScale * 0.75;
  const shownPt = Math.round(stylePt * size * 2) / 2;
  // the field's text on the drawn text, as it is aligned: from its left edge, by its middle (a short centred text,
  // on an arrow or under a molecule, stood off to the right in the wider field) or from its right edge; the field
  // grows that way as one types (its padding and border: 9 px)
  const box = editing.box;
  const [edge, shift, pad] = {
    left: [box ? box.x1 : editing.x, 0, -9],
    center: [box ? (box.x1 + box.x2) / 2 : editing.x, -50, 0],
    right: [box ? box.x2 : editing.x, -100, 9],
  }[shownAlign] ?? [editing.x, 0, -9];
  const [left, top] = [edge * scale + tx + pad, editing.y * scale + ty - fontPx * 1.15];
  // (a press on the window keeps the selection and the editor open)
  const keep = (e) => e.preventDefault();
  const button = (kind, label, title, on) => (
    <button type="button" className={`btn${on ? ' on' : ''}`} onClick={() => toggle(kind)} data-testid={`text-${kind}`} title={title}>{label}</button>
  );
  return (
    <>
      <div ref={toolsRef} className="glass text-tools" onMouseDown={keep}
        style={toolsPlace ? { left, top: toolsPlace.y, transform: `translate(calc(${shift}% + ${toolsPlace.dx}px), 0)` } : { left, top: top - 6, transform: `translate(${shift}%, -100%)` }}>
        <button type="button" className="btn" onClick={() => format('chem')} data-testid="text-chem"
          title={t('Format as a chemical formula, the selected part or with nothing selected all of it: digits after letters as subscripts, a charge at the end as a superscript (H2SO4, CO32-, [SiF6]2-; also CO_3^2-). For the rest, x₂ and x²')}>
          <span>H<sub>2</sub>O</span><span className="label">{t('Formula')}</span>
        </button>
        <button type="button" className="btn" onClick={() => format('plain')} data-testid="text-plain"
          title={t('Take the formatting off, the selected part or with nothing selected all of it')}>
          <span className="label">{t('Plain')}</span>
        </button>
        <span className="sep" />
        {button('sub', <span>x<sub>2</sub></span>, t('Subscript (Ctrl+,): the selected part, or what you type next'), typing.shift === 'sub')}
        {button('sup', <span>x<sup>2</sup></span>, t('Superscript (Ctrl+.): the selected part, or what you type next'), typing.shift === 'sup')}
        {button('bold', <b>B</b>, t('Bold (Ctrl+B): the selected part, or what you type next'), typing.bold)}
        {button('italic', <i className="serif">I</i>, t('Italic (Ctrl+I): the selected part, or what you type next'), typing.italic)}
        <span className="sep" />
        {/* the whole text's font and size (the style's unless set here): Aa in the font it is, a click the other */}
        <button type="button" className="btn" data-testid={(family ?? STYLE.family) === 'serif' ? 'text-sans' : 'text-serif'}
          title={(family ?? STYLE.family) === 'serif' ? t('Serif font (Times New Roman); click: sans-serif (Arial)') : t('Sans-serif font (Arial); click: serif (Times New Roman)')}
          onClick={() => {
            const next = (family ?? STYLE.family) === 'serif' ? 'sans' : 'serif';
            setFamily(next === STYLE.family ? null : next);
          }}><span style={{ fontFamily: FONTS[family ?? STYLE.family] }}>Aa</span></button>
        <input className="text-size" type="number" min={2} max={72} step={0.5} value={shownPt} data-testid="text-size"
          title={t('Size in points (as the drawing style has its texts: {pt} pt)', { pt: Math.round(stylePt * 2) / 2 })}
          onMouseDown={(e) => e.stopPropagation()}
          onBlur={(e) => {
            // (from the size to elsewhere than the text or its window: the text done, as a click elsewhere does)
            if (e.relatedTarget === ref.current || toolsRef.current?.contains(e.relatedTarget)) return;
            commit();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              ref.current?.focus();
            }
          }}
          onChange={(e) => {
            const pt = Number(e.target.value);
            if (pt > 0) setSize(Math.min(8, Math.max(0.2, pt / stylePt)));
          }} />
        <span className="sep" />
        <div className="menu-holder">
          <button type="button" className={`btn align-button${menu === 'align' ? ' toggled' : ''}`} onClick={() => setMenu(menu === 'align' ? null : 'align')} data-testid="text-align"
            title={t('Lines: from the left, centred or from the right')}>
            {icons[ALIGNS[shownAlign]]}<span className="caret">▾</span>
          </button>
          {menu === 'align' && (
            <div className="glass text-menu align-menu">
              {Object.entries(ALIGNS).reverse().map(([value, icon]) => (
                <button key={value} type="button" className={`btn${shownAlign === value ? ' toggled' : ''}`} data-testid={`text-align-${value}`}
                  title={{ left: t('Lines from the left'), center: t('Lines centred'), right: t('Lines from the right') }[value]}
                  onClick={() => {
                    setAlign(value);
                    setMenu(null);
                  }}>
                  {icons[icon]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="menu-holder">
          <button type="button" className={`btn${menu === 'characters' ? ' toggled' : ''}`} data-testid="text-characters"
            onClick={(e) => {
              const below = document.querySelector('.dock')?.getBoundingClientRect().top ?? window.innerHeight;
              setUpwards(e.currentTarget.getBoundingClientRect().bottom + CHARACTERS_HEIGHT > below);
              setMenu(menu === 'characters' ? null : 'characters');
            }}
            title={t('Characters: Greek letters, arrows, °, ±, ‡ …')}>
            <span>αΔ°</span><span className="caret">▾</span>
          </button>
          {menu === 'characters' && (
            <div className={`glass text-menu characters-menu${upwards ? ' upwards' : ''}`}>
              {CHARACTERS.map(([group, chars]) => (
                <div key={chars} className="group">
                  <div className="group-name">{group()}</div>
                  <div className="chars">
                    {[...chars].map((ch) => (
                      <button key={ch} type="button" className="btn char" onClick={() => insert(ch, true)} title={ch} data-testid={`text-char-${ch}`}>{ch}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        ref={ref}
        className="text-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-testid="text-editor"
        data-placeholder={t('Text; Formula for H2SO4, x₂ and x² by hand')}
        style={{ left, top, fontSize: fontPx, fontFamily: FONTS[family ?? STYLE.family], textAlign: shownAlign, ...(shift && { transform: `translateX(${shift}%)` }) }}
        onBlur={(e) => {
          // (the size field or a button of the window: the text stays open)
          if (toolsRef.current?.contains(e.relatedTarget)) return;
          commit();
        }}
        onPaste={(e) => {
          e.preventDefault();
          insert(e.clipboardData.getData('text/plain'));
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          const keys = { ',': 'sub', '.': 'sup', b: 'bold', i: 'italic' };
          if ((e.ctrlKey || e.metaKey) && keys[e.key.toLowerCase()]) {
            e.preventDefault();
            toggle(keys[e.key.toLowerCase()]);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            insert('\n');
          } else if (e.key === 'Escape') {
            // a menu closed first; then the text kept, as Enter does (Ctrl+Z takes it back)
            if (menu) setMenu(null);
            else commit();
          }
        }}
      />
    </>
  );
}


// Are the slid molecules' atoms where the slide puts them (nothing else moved them: a snap, an arrow)?
function slid(slide, scene) {
  for (const key of slide.keys) {
    for (const id of slide.scene.frags.find((members) => `m${members[0]}` === key) ?? []) {
      // (each atom's pos as the scene was built: scene.pos() reads the document as it is now)
      const [p, q] = [slide.scene.atoms.get(id).pos, scene.atoms.get(id)?.pos];
      if (!q || Math.abs(q[0] - p[0] - slide.dx) > 1e-9 || Math.abs(q[1] - p[1] - slide.dy) > 1e-9) return false;
    }
  }
  return true;
}

export default function Canvas({ editor, dark, onContextMenu }) {
  const host = useRef(null);
  const pan = useRef(null);
  const space = useRef(false);
  const scene = editor.scene;
  const { scale, tx, ty } = editor.view;
  // whole molecules dragged: their layers and halos as drawn at the start, slid (one transform, nothing
  // drawn again), as long as the drawing has them where the slide puts them
  const slide = editor.gesture?.slide ?? null;
  const frozen = useMemo(() => slide && {
    layers: new Map(sceneLayers(slide.scene, scale, { dark })),
    halos: <Halos editor={editor} scene={slide.scene} />,
    washed: <Halos editor={editor} scene={slide.scene} turning />,
  }, [slide, scale, dark, editor]);
  const sliding = slide && slid(slide, scene) ? slide : null;
  const shift = sliding && `translate(${f(sliding.dx * scale)} ${f(sliding.dy * scale)})`;
  // the drawing in screen pixels (only moved, not magnified: sharp text),
  // in layers: a change redraws only the layers it changed (not those slid)
  const layers = useMemo(() => sceneLayers(scene, scale, { dark, skip: sliding?.keys }), [scene, scale, dark, sliding]);

  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        space.current = true;
        if (host.current) host.current.style.cursor = 'grab';
      }
    };
    const up = (e) => {
      if (e.code === 'Space') {
        space.current = false;
        if (host.current) host.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // first view: the middle of the window
  useEffect(() => {
    const rect = host.current.getBoundingClientRect();
    editor.fit(rect.width, rect.height);
  }, [editor]);

  // wheel: pan (trackpads), Ctrl+wheel or pinch: zoom
  useEffect(() => {
    const element = host.current;
    const wheel = (e) => {
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        editor.zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0022)), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        const k = e.deltaMode ? 20 : 1;
        // Shift+wheel: sideways (some browsers already turn it into deltaX, some don't)
        const [dx, dy] = e.shiftKey && !e.deltaX ? [e.deltaY, 0] : [e.deltaX, e.deltaY];
        editor.setView({ tx: editor.view.tx - dx * k, ty: editor.view.ty - dy * k });
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [editor]);

  const model = (e) => editor.toModel(e.clientX, e.clientY, host.current.getBoundingClientRect());

  const onPointerDown = (e) => {
    if (editor.editing) return;
    host.current.setPointerCapture(e.pointerId);
    if (e.button === 1) {
      // the middle button only pans: on Linux it would also paste the
      // selected text (a "C" selected anywhere would become methane);
      // App.jsx ignores pastes just after it is pressed or let go
      e.preventDefault();
      editor.middleClickAt = performance.now();
    }
    if (e.button === 1 || (e.button === 0 && space.current)) {
      pan.current = { x: e.clientX, y: e.clientY, tx: editor.view.tx, ty: editor.view.ty };
      host.current.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0 || editor.showing) return; // (showing: nothing drawn, Show.jsx)
    editor.pointerDown(model(e), e);
  };
  const onPointerMove = (e) => {
    editor.setCtrl(e.ctrlKey || e.metaKey);
    if (pan.current) {
      editor.setView({ tx: pan.current.tx + e.clientX - pan.current.x, ty: pan.current.ty + e.clientY - pan.current.y });
      return;
    }
    if (editor.showing) return; // (nothing lit under the pointer)
    editor.pointerMove(model(e), e);
  };
  const onPointerUp = (e) => {
    // Firefox pastes when the button is let go, however long the pan was
    if (e.button === 1) editor.middleClickAt = performance.now();
    if (pan.current) {
      pan.current = null;
      host.current.style.cursor = space.current ? 'grab' : '';
      return;
    }
    editor.pointerUp(model(e), e);
  };
  const onDoubleClick = (e) => {
    if (editor.showing) return;
    // (a third click soon after, at the same place, is the select tool's: the reaction row)
    editor.lastDouble = { time: performance.now(), point: model(e) };
    const hit = editor.hitAt(model(e));
    if (hit?.kind === 'text') {
      editText(editor, editor.doc.texts.get(hit.id));
      editor.emit();
    } else if (hit && editor.tool.name === 'select') {
      selectMolecule(editor, hit, { add: e.shiftKey });
    }
  };

  const tool = TOOLS[editor.tool.name];
  const dotStep = scale >= 24 ? scale : scale * Math.ceil(24 / scale);
  return (
    <div
      ref={host}
      className="canvas"
      style={{
        cursor: tool?.cursor ?? 'default',
        backgroundSize: `${dotStep}px ${dotStep}px`,
        backgroundPosition: `${tx % dotStep}px ${ty % dotStep}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => editor.pointerLeave()}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        // the right-click menu (ContextMenu.jsx); not while something is being drawn or placed
        if (!onContextMenu || editor.showing || editor.gesture || editor.tool.name === 'place' || editor.tool.name === 'group') return;
        const point = model(e);
        const hit = editor.hitAt(point);
        // something not selected: its molecule selected (or it alone), as a double click would; nothing: none
        // (a side arc: that arc, as a click selects it; its menu's Delete took the arrow with its reagents)
        if (hit?.arcId != null) {
          if (!editor.selection.has(hit.arcId)) editor.select([hit.arcId]);
        } else if (hit && !editor.selection.has(hit.id)) {
          if (selectMolecule(editor, hit) === false) editor.select([hit.id]);
        } else if (!hit) editor.select([]);
        onContextMenu({ at: { x: e.clientX, y: e.clientY }, point, hit });
      }}
      onAuxClick={(e) => e.preventDefault()}
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      data-testid="canvas"
    >
      <div id="paper" className="paper">
        <svg>
          <g transform={`matrix(${scale} 0 0 ${scale} ${tx} ${ty})`}>
            <Places preview={editor.preview} scale={scale} />
          </g>
          <g className="drawing" transform={`translate(${tx} ${ty})`} fontFamily={STYLE.fontFamily}>
            {/* (the chair or Fischer spine pointed at under everything, highlights too: a mark on an atom stays whole) */}
            {!sliding && <ChairUnder editor={editor} scene={scene} scale={scale} />}
            {layers.map(([key, markup]) => (sliding?.keys.has(key)
              ? <g key={key} transform={shift} dangerouslySetInnerHTML={{ __html: frozen.layers.get(key) }} />
              : <g key={key} dangerouslySetInnerHTML={{ __html: markup }} />))}
          </g>
          {/* over the drawing, blended in, so it shows on highlights and ring fills too */}
          <g className="selection" transform={`matrix(${scale} 0 0 ${scale} ${tx} ${ty})`}>
            {sliding ? <g transform={`translate(${sliding.dx} ${sliding.dy})`}>{frozen.halos}</g> : <Halos editor={editor} scene={scene} />}
          </g>
          {/* (not blended: a wash in the canvas colour fades what is under it) */}
          <g transform={`matrix(${scale} 0 0 ${scale} ${tx} ${ty})`}>
            {sliding ? <g transform={`translate(${sliding.dx} ${sliding.dy})`}>{frozen.washed}</g> : <Halos editor={editor} scene={scene} turning />}
          </g>
          <g transform={`matrix(${scale} 0 0 ${scale} ${tx} ${ty})`}>
            <ErrorRings scene={scene} />
            <StaleModels scene={scene} />
            <Links editor={editor} scene={scene} />
            {editor.debug && <DebugLayer editor={editor} scene={scene} />}
            <SelectionFrame editor={editor} scale={scale} />
            <GroupOutlines editor={editor} scale={scale} />
            <Preview preview={editor.preview} scale={scale} />
          </g>
          <ScreenPreview preview={editor.preview} view={editor.view} dark={dark} />
        </svg>
      </div>
      <TextEditor editor={editor} />
    </div>
  );
}
