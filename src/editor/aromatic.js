// Aromatize and Kekulé: mark the aromatic rings and charged delocalized
// groups (COO⁻, NO2) of the selection, or of everything, for drawing with
// circles and dashed lines, or take the marks away. Bonds keep their single
// and double orders; aromatic bonds read from files (order 4) get them here.
import { delocalizedGroups } from '../chem/delocalize.js';
import { writeMolfile } from '../io/molfile.js';
import { isCovalent } from '../model/doc.js';
import { aromaticity } from '../io/rdkit.js';
import { t } from '../i18n/i18n.js';

function scope(ed) {
  const atoms = ed.selection.size ? new Set(ed.selectedAtoms()) : new Set(ed.doc.atoms.keys());
  const bonds = [...ed.doc.bonds.values()].filter((bond) => atoms.has(bond.a) && atoms.has(bond.b) && isCovalent(bond));
  return { atoms, bonds };
}

// RDKit's aromatic bonds and Kekulé orders, by bond id (writeMolfile keeps
// the bonds in document order).
async function rdkitBonds(ed, atoms, bonds) {
  const { molfile } = writeMolfile(ed.doc, [...atoms]);
  const found = await aromaticity(molfile);
  return new Map(bonds.map((bond, k) => [bond.id, found[k]]));
}

export async function aromatize(ed) {
  const { atoms, bonds } = scope(ed);
  if (!bonds.length) {
    ed.say(t('Select the molecules to aromatize (or nothing, for all of them).'));
    return;
  }
  let found;
  try {
    found = await rdkitBonds(ed, atoms, bonds);
  } catch (error) {
    ed.say(error.message, 'error', 6000);
    return;
  }
  let marked = 0;
  ed.change((doc) => {
    for (const [id, { aromatic, order }] of found) {
      const bond = doc.bonds.get(id);
      if (!bond) continue;
      if (bond.order === 4) bond.order = order;
      if (aromatic) bond.delocalized = true;
    }
    for (const id of delocalizedGroups(doc, atoms)) doc.bonds.get(id).delocalized = true;
    marked = [...doc.bonds.values()].filter((bond) => bond.delocalized && atoms.has(bond.a)).length;
  });
  if (!marked) ed.say(t('No aromatic rings or delocalized groups (COO⁻, NO₂) here.'));
}

export async function kekulize(ed) {
  const { atoms, bonds } = scope(ed);
  let found = null;
  if (bonds.some((bond) => bond.order === 4)) {
    try {
      found = await rdkitBonds(ed, atoms, bonds);
    } catch (error) {
      ed.say(error.message, 'error', 6000);
      return;
    }
  }
  if (!found && !bonds.some((bond) => bond.delocalized)) {
    ed.say(t('Nothing aromatic here: this is already written with single and double bonds.'));
    return;
  }
  ed.change((doc) => {
    for (const { id } of bonds) {
      const bond = doc.bonds.get(id);
      if (!bond) continue;
      if (bond.order === 4 && found?.get(id)) bond.order = found.get(id).order;
      delete bond.delocalized;
    }
  });
}
