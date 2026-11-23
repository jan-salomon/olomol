// 3D models on the canvas (render/model3d.js): put there from Turn in 3D, built again by Update when their molecule
// has changed, turned from the panel. Each change one undo step.
import { model3D, prepare } from '../layout/relayout.js';
import { bestRotation } from '../layout/threeD.js';
import { addModel, bondsByAtom } from '../model/doc.js';
import { fragments } from '../model/graph.js';
import { keptModel, modelBox, moleculeSignature, turnedPoints } from '../render/model3d.js';
import { t } from '../i18n/i18n.js';

const centred = (points) => {
  const middle = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  return points.map((p) => p.map((v, k) => v - middle[k]));
};

// The model of a molecule (`sticks`: Turn in 3D's stick model, { elements, bonds, groups, drawn, base }), turned by
// `rotation`, put on the canvas to the right of its molecule (`atomIds`: the molecule's atoms, the model's first),
// as large as the drawing, selected. Returns its id.
export function putModel(editor, { sticks, rotation, atomIds, look = {} }) {
  let id = null;
  editor.change((doc) => {
    const model = keptModel(sticks);
    const atoms = atomIds.map((a) => doc.atoms.get(a)).filter(Boolean);
    const right = Math.max(...atoms.map((a) => a.x));
    const middle = (Math.min(...atoms.map((a) => a.y)) + Math.max(...atoms.map((a) => a.y))) / 2;
    const item = addModel(doc, 0, 0, { rotation, atoms: [...atomIds], model, signature: moleculeSignature(doc, atomIds), look: { ...look } });
    // (its left edge a bond and a half beyond the molecule's right end)
    const box = modelBox(item);
    Object.assign(item, { x: right + 1.5 - box.x1, y: middle - (box.y1 + box.y2) / 2 });
    id = item.id;
  });
  editor.select([id]);
  return id;
}

// The molecule a model shows now: all bonded to its atoms that are still there (links between molecules not
// followed), or null.
function moleculeNow(doc, item) {
  const left = new Set(item.atoms.filter((id) => doc.atoms.has(id)));
  if (!left.size) return null;
  return fragments(doc, bondsByAtom(doc, { links: false })).find((members) => members.some((id) => left.has(id))) ?? null;
}

// Builds a model's 3D model again from its molecule as it is now, seen as before (the new model turned so that the
// atoms both have lie where they did), its look kept. Says why if it can't. Resolves true when done.
export async function updateModel(editor, id) {
  const item = editor.doc.models.get(id);
  if (!item) return false;
  const members = moleculeNow(editor.doc, item);
  if (!members || members.length < 2) {
    editor.say(t('The molecule of this 3D model is no longer in the drawing.'), 'error', 5000);
    return false;
  }
  // (the molecule as the model is built from it: changed meanwhile, the model would be the old one's, marked as the new one's)
  const signature = moleculeSignature(editor.doc, members);
  try {
    const ed = { doc: editor.doc, settings: editor.settings, selectedAtoms: () => members };
    const job = await prepare(ed, { molecules: [members], partial: false });
    const [molecule] = job.molecules;
    const model = await model3D(job, molecule);
    if (model.reason || !model.atoms) {
      editor.say(t('No 3D model of this molecule: {reason}.', { reason: model.reason ?? t('its atoms only') }), 'error', 6000);
      return false;
    }
    const current = editor.doc.models.get(id);
    if (!current) return false;
    if (!members.every((a) => editor.doc.atoms.has(a)) || moleculeSignature(editor.doc, members) !== signature) {
      editor.say(t('The molecule changed while its 3D model was being built: click Update again.'), 'error', 5000);
      return false;
    }
    const kept = keptModel({ ...model.atoms, drawn: molecule.atomIds.length, base: model.atoms.points });
    // seen as before: the atoms it had and has, turned onto where they were (three at least, else as it was turned)
    const was = turnedPoints({ ...current, size: 1 });
    const before = new Map(current.atoms.map((a, k) => [a, was[k]]));
    const common = molecule.atomIds.map((a, k) => [before.get(a), kept.points[k]]).filter(([p]) => p);
    const rotation = common.length >= 3 ? bestRotation(centred(common.map(([, q]) => q)), centred(common.map(([p]) => p))) : current.rotation;
    editor.change((doc) => {
      const target = doc.models.get(id);
      if (!target) return;
      Object.assign(target, { model: kept, rotation, atoms: [...molecule.atomIds], signature: moleculeSignature(doc, molecule.atomIds) });
    });
    return true;
  } catch (error) {
    console.error('[3D model]', error);
    editor.say(t('No 3D model of this molecule: {reason}.', { reason: error.message }), 'error', 6000);
    return false;
  }
}
