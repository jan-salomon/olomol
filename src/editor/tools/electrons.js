// What sits on atoms: charges, unpaired electrons, lone pairs.
// (Part of the drawing tools: src/editor/tools.js puts them together.)
import { RADICAL_CYCLE } from '../../chem/valence.js';
import { t } from '../../i18n/i18n.js';
import { idsInRect } from '../hit.js';
import { rectOf } from './shared.js';

// --- atom properties: charge, unpaired electrons, lone pairs ---

// The same from the tool, the keys and the panel:
// one charge more or less on these atoms (up to ±8), their δ gone (it came back with the charge back at 0)
export function changeCharge(doc, ids, delta) {
  for (const id of ids) {
    const a = doc.atoms.get(id);
    a.charge = Math.max(-8, Math.min(8, (a.charge ?? 0) + delta));
    a.partialCharge = null;
  }
}

// δ+ or δ− (`partial`: 1, −1) on these atoms, their charge gone (a δ isn't drawn on a charged atom); on all of
// them already: off again
export function togglePartial(doc, ids, partial) {
  const atoms = ids.map((id) => doc.atoms.get(id));
  const off = atoms.every((a) => a.partialCharge === partial && !a.charge);
  for (const a of atoms) Object.assign(a, { charge: 0, partialCharge: off ? null : partial });
}

export const charge = {
  cursor: 'pointer',
  click(ed, g) {
    if (g.hit?.kind !== 'atom') return;
    ed.change((doc) => (ed.tool.partial ? togglePartial(doc, [g.hit.id], ed.tool.partial) : changeCharge(doc, [g.hit.id], ed.tool.delta)));
  },
};


export const radical = {
  cursor: 'pointer',
  click(ed, g) {
    if (g.hit?.kind !== 'atom') return;
    ed.change((doc) => {
      const a = doc.atoms.get(g.hit.id);
      a.radical = RADICAL_CYCLE[a.radical ?? 0];
    });
  },
};

// Lone pairs on or off for atoms; atoms without lone pairs are skipped.
export function toggleLonePairs(ed, atomIds) {
  const scene = ed.scene;
  const withPairs = atomIds.filter((id) => scene.atoms.get(id)?.chem.lonePairs > 0);
  if (!withPairs.length) {
    ed.say(atomIds.length === 1 ? t('This {el} has no lone pairs.', { el: ed.doc.atoms.get(atomIds[0]).el }) : t('These atoms have no lone pairs.'));
    return;
  }
  const on = withPairs.some((id) => ed.doc.atoms.get(id).lonePairs === null);
  ed.change((doc) => withPairs.forEach((id) => {
    doc.atoms.get(id).lonePairs = on ? 'auto' : null;
  }));
}

export const pairs = {
  cursor: 'pointer',
  click(ed, g) {
    if (g.hit?.kind === 'atom') toggleLonePairs(ed, [g.hit.id]);
    else if (g.hit?.kind === 'bond') {
      const b = ed.doc.bonds.get(g.hit.id);
      toggleLonePairs(ed, [b.a, b.b]);
    }
  },
  drag(ed, g) {
    ed.preview = { kind: 'rect', ...rectOf(g.start, g.point) };
    ed.emit();
  },
  dragEnd(ed, g) {
    ed.preview = null;
    const atoms = idsInRect(ed.scene, rectOf(g.start, g.point)).filter((id) => ed.doc.atoms.has(id));
    if (atoms.length) toggleLonePairs(ed, atoms);
    else ed.emit();
  },
};
