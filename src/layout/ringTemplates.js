// Ring-system templates (textbook drawings of bridged and macrocyclic ring
// systems): RDKit's own set plus a few of ours. RDKit.js can't use them
// itself, so we repeat what RDKit's depictor does (Depictor/EmbeddedFrag.cpp):
// find a template that matches a whole ring system exactly, then lay out the
// rest of the molecule around it with generate_aligned_coords.
import { readMol } from '../io/readMol.js';
import extraTemplates from './extraTemplates.js';
import { isotopeLines, parseMolfile, writeMolfile } from './molfile.js';

const TEMPLATE_BOND_LENGTH = 1.42; // the scale the templates are drawn at
const RDKIT_BOND_LENGTH = 1.5;
// In the templates, #200 is a dummy for "atom outside the ring system". We
// mark those atoms as Cl instead (valence 1, so the ring-system copy below
// stays a valid molecule) and rewrite the queries to match.
const OUTSIDE = 'Cl';
const OUTSIDE_QUERY = '!#17';

let templatesBySize = null; // atom count -> [{ name, smarts, shape, bondCount, coords }]

export async function loadTemplates() {
  if (!templatesBySize) {
    const { default: rdkitTemplates } = await import('./ringTemplateData.js'); // separate download, only when needed
    templatesBySize = new Map();
    const add = (name, entry) => {
      const [smarts, cx] = entry.split(' |(');
      const coords = cx.slice(0, -2).split(';').filter(Boolean).map((xy) => xy.split(',').slice(0, 2).map(Number));
      const query = smarts.replaceAll('!#200', OUTSIDE_QUERY);
      const template = {
        name,
        smarts: query,
        shape: query.replace(/&D\d/g, ''), // the ring shape alone, without RDKit's substituent rules
        bondCount: smarts.split('~').length - 1, // every template bond is written as "~"
        coords,
      };
      if (!templatesBySize.has(coords.length)) templatesBySize.set(coords.length, []);
      templatesBySize.get(coords.length).push(template);
    };
    rdkitTemplates.forEach((entry, i) => add(`#${i}`, entry));
    for (const { name, template } of extraTemplates) add(name, template);
  }
  return templatesBySize;
}

// Ring systems as lists of atom indices, largest first. Rings sharing at
// least one atom belong to the same system, as in RDKit's depictor.
function ringSystems(mol) {
  const json = JSON.parse(mol.get_json());
  const rings = json.molecules[0].extensions?.find((e) => e.name === 'rdkitRepresentation')?.atomRings ?? [];
  const systems = [];
  for (const ring of rings) {
    const merged = new Set(ring);
    for (let i = systems.length - 1; i >= 0; i--) {
      if ([...systems[i]].some((atom) => merged.has(atom))) {
        systems[i].forEach((atom) => merged.add(atom));
        systems.splice(i, 1);
      }
    }
    systems.push(merged);
  }
  return systems.map((system) => [...system]).sort((p, q) => q.length - p.length);
}

// Finds a template for one ring system: { template, atoms, shapeOnly } where
// atoms[k] is the molecule atom that template atom k matched, or null.
// Templates whose substituent rules fit come first; otherwise one whose ring
// shape fits ("shape only"). Fills in `counts` (ring-system size) for messages.
function matchRingSystem(RDKit, system, atoms, bonds, templates, counts) {
  // The ring system on its own: its atoms as carbon, plus one OUTSIDE atom
  // per bond to a non-hydrogen atom outside the system, so the templates'
  // rules ("D2" = no substituent here) see the real substitution pattern.
  // Explicit hydrogens don't count, as in RDKit's usual implicit-H molecules.
  const index = new Map(system.map((atom, i) => [atom, i]));
  const copyAtoms = system.map(() => ({ symbol: 'C', x: 0, y: 0 }));
  const copyBonds = [];
  let bondCount = 0;
  for (const { a, b } of bonds) {
    const [ia, ib] = [index.get(a), index.get(b)];
    if (ia !== undefined && ib !== undefined) {
      copyBonds.push({ a: ia, b: ib, order: 1 });
      bondCount += 1;
    } else if ((ia ?? ib) !== undefined && atoms[ia === undefined ? a : b].symbol !== 'H') {
      copyAtoms.push({ symbol: OUTSIDE, x: 0, y: 0 });
      copyBonds.push({ a: ia ?? ib, b: copyAtoms.length - 1, order: 1 });
    }
  }
  counts.atoms = system.length;
  counts.rings = bondCount - system.length + 1;
  const sameShape = templates.filter((t) => t.bondCount === bondCount);
  if (!sameShape.length) return null;
  const copy = RDKit.get_mol(writeMolfile(copyAtoms, copyBonds));
  if (!copy) return null; // e.g. a ring atom with more than four bonds
  const find = (smarts) => {
    const query = RDKit.get_qmol(smarts);
    try {
      return JSON.parse(copy.get_substruct_match(query) || '{}').atoms;
    } finally {
      query.delete();
    }
  };
  try {
    let shapeOnly = null;
    for (const template of sameShape) {
      const strict = find(template.smarts);
      if (strict?.length) return { template, atoms: strict.map((i) => system[i]), shapeOnly: false };
      const shape = !shapeOnly && find(template.shape);
      if (shape?.length) shapeOnly = { template, atoms: shape.map((i) => system[i]), shapeOnly: true };
    }
    return shapeOnly;
  } finally {
    copy.delete();
  }
}

// RDKit layout of `molfile` with its largest templated ring system drawn as
// the template. Returns { molfile, detail } (detail names the template), or
// { molfile: null, reason } if no template fits.
export async function templateLayout(RDKit, molfile) {
  const templates = await loadTemplates();
  const { atoms, bonds } = parseMolfile(molfile);
  const mol = readMol(RDKit, molfile);
  let found = null;
  const largest = {};
  try {
    for (const [i, system] of ringSystems(mol).entries()) {
      const counts = i === 0 ? largest : {};
      found = matchRingSystem(RDKit, system, atoms, bonds, templates.get(system.length) ?? [], counts);
      if (found) break;
    }
  } finally {
    mol.delete();
  }
  if (!found) {
    const reason = largest.atoms
      ? `no ring template has the shape of the largest ring system (${largest.atoms} atoms, ${largest.rings} ring${largest.rings === 1 ? '' : 's'})`
      : 'the molecule has no rings';
    return { molfile: null, reason };
  }

  // generate_aligned_coords copies coordinates from a reference molecule that
  // it finds by substructure search. Unique isotope labels on the matched
  // atoms (in a working copy only; we keep just the coordinates and wedges)
  // make that search hit exactly those atoms.
  const label = (k) => 500 + k;
  const scale = RDKIT_BOND_LENGTH / TEMPLATE_BOND_LENGTH;
  const position = new Map(found.atoms.map((atom, k) => [atom, k]));
  const reference = writeMolfile(
    found.atoms.map((atom, k) => ({
      symbol: atoms[atom].symbol,
      x: found.template.coords[k][0] * scale,
      y: found.template.coords[k][1] * scale,
      isotope: label(k),
    })),
    bonds
      .filter(({ a, b }) => position.has(a) && position.has(b))
      .map(({ a, b }) => ({ a: position.get(a), b: position.get(b), order: 8 })), // 8 = any bond
  );
  const lines = molfile.split('\n');
  lines.splice(lines.findIndex((line) => line.startsWith('M  END')), 0,
    ...isotopeLines(found.atoms.map((atom, k) => [atom, label(k)])));

  const work = readMol(RDKit, lines.join('\n'));
  const ref = readMol(RDKit, reference);
  try {
    const matched = work.generate_aligned_coords(ref, JSON.stringify({ useCoordGen: false, acceptFailure: false }));
    if (!matched) return { molfile: null, reason: `template ${found.template.name} fits, but RDKit could not use it` };
    console.debug(`[relayout] ring template ${found.template.name}${found.shapeOnly ? ' (ring shape only)' : ''}:`, found.template.smarts);
    return {
      molfile: work.get_v2Kmolblock(),
      detail: found.shapeOnly ? `${found.template.name}, ring shape only` : found.template.name,
    };
  } finally {
    work.delete();
    ref.delete();
  }
}
