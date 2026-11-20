// Debug mode's panel: which overlays the canvas shows, how long drawing
// took, and the rules' decisions for what is under the pointer.
import { DEGREE_TEXT } from './debugText.js';

const LAYERS = [
  ['boxes', 'Label boxes (bonds stop at them)'],
  ['slots', 'Lone pair places (dashed: not shown)'],
  ['ids', 'Atom ids'],
  ['arrows', 'Arrow candidates and costs'],
];

function describeAtom(info) {
  const { atom, chem, label, electrons } = info;
  const lines = [
    `atom ${atom.id}: ${atom.el}${atom.charge ? ` charge ${atom.charge}` : ''}${atom.isotope ? ` isotope ${atom.isotope}` : ''}`,
    `H: ${chem.hydrogens} (${atom.hCount == null ? 'from the valence' : 'set by hand'}), bond orders ${chem.bondOrder}`,
    `lone pairs: ${chem.lonePairs} (${electrons.pairs.length} shown), unpaired electrons: ${chem.unpaired}`,
  ];
  if (chem.error) lines.push(`problem: ${chem.error}`);
  if (label) {
    lines.push(`label: ${label.hSide ? `H written ${label.hSide}` : 'no H'}${label.chargeAngle != null ? `, charge at ${DEGREE_TEXT(label.chargeAngle)}` : ''}`);
  } else {
    lines.push('no label (a plain corner)');
  }
  if (electrons.slots.length) lines.push(`lone pair directions: ${electrons.slots.map((s) => DEGREE_TEXT(s.angle)).join(', ')}`);
  if (electrons.unpaired.length) lines.push(`unpaired at ${DEGREE_TEXT(electrons.unpaired[0].angle)}`);
  return lines;
}

function describeCurve(geometry) {
  const best = geometry.debug?.best;
  if (!best) return [];
  return [
    `curved arrow ${geometry.curve.id}: ${geometry.curve.electrons === 1 ? 'one electron' : 'electron pair'}, way ${geometry.curve.variant ?? 0}`,
    `start ${best.tail.key}, end ${best.head.key}, turns ${Math.round((best.shape.turn * 180) / Math.PI)}°`,
    `cost ${best.cost.toFixed(2)} = ${Object.entries(best.parts).filter(([, v]) => v > 0.005).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' + ') || '0'}`,
    `${geometry.debug.candidates.length} next-best candidates drawn in red`,
  ];
}

export default function DebugPanel({ editor }) {
  const scene = editor.scene;
  const layers = editor.debugLayers ?? Object.fromEntries(LAYERS.map(([key]) => [key, true]));
  const hover = editor.hover;
  let lines = ['Point at an atom, bond or arrow.'];
  if (hover?.kind === 'atom' && scene.atoms.get(hover.id)) lines = describeAtom(scene.atoms.get(hover.id));
  else if (hover?.kind === 'bond' && scene.bonds.get(hover.id)) {
    const { bond, rule } = scene.bonds.get(hover.id);
    lines = [`bond ${bond.id}: ${bond.a}–${bond.b}, order ${bond.order}${bond.stereo ? `, ${bond.stereo}` : ''}`];
    if (rule) lines.push(bond.order === 2 ? `second line: ${rule}` : rule);
  } else if (hover?.kind === 'curve' && scene.curves.get(hover.id)) lines = describeCurve(scene.curves.get(hover.id));
  return (
    <div className="glass debugpanel" aria-label="Debug">
      <h3 className="small" style={{ margin: '0 0 6px' }}>Debug</h3>
      {LAYERS.map(([key, label]) => (
        <label key={key}>
          <input type="checkbox" checked={layers[key]} onChange={(e) => {
            editor.debugLayers = { ...layers, [key]: e.target.checked };
            editor.emit();
          }} />
          {label}
        </label>
      ))}
      <div className="debug-box" style={{ marginTop: 8 }}>
        {`${scene.atoms.size} atoms, ${scene.bonds.size} bonds, ${scene.curves.size} curved arrows; drawn in ${editor.sceneCache?.ms.toFixed(1)} ms\n\n${lines.join('\n')}`}
      </div>
    </div>
  );
}
