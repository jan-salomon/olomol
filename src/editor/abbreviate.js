// Abbreviations drawn out (a Ph label becomes a benzene ring) or a drawn
// group gathered into its label, and copies of a drawing with every
// abbreviation drawn out, for files, identifiers and R/S labels: other
// programs and RDKit then see the real molecule.
import { ABBREVIATIONS, chargedAbbreviation, CHARGED_ABBREVIATIONS } from '../chem/abbreviations.js';
import { condensedGroup, condensedName, GROUPS } from '../chem/condensed.js';
import { readMolfile, writeMolfile } from '../io/molfile.js';
import { getRDKit, smilesToMolfile } from '../io/rdkit.js';
import { readMol } from '../io/readMol.js';
import { addAtom, addBond, bondsByAtom, deleteObjects, emptyDoc, otherEnd } from '../model/doc.js';
import { fragments } from '../model/graph.js';
import { electronsByAtom } from '../chem/valence.js';
import { drawOutWith, expandable, groupKey } from './groups.js';
import { joinAtom } from './build.js';
import { t } from '../i18n/i18n.js';

// name -> the group's drawing (its * atom attaches); 'name alone' -> the molecule a label on no bond
// stands for (its first atom the one the groups are on: no *, which would give Et3N's N a bond too many)
const groups = new Map();

async function groupDoc(name, alone = false, charge = 0) {
  // (an abbreviation of the list, or an atom with groups: PPh3; the charge goes on afterwards; a charged group
  // of its own, SO3⁻: its drawing with the charge where it is)
  const ion = chargedAbbreviation(name, charge);
  const key = groupKey(name, charge, alone);
  if (!groups.has(key)) {
    const smiles = ion?.[2] ?? ABBREVIATIONS[name]?.[0] ?? condensedGroup(name).smiles;
    groups.set(key, readMolfile(await smilesToMolfile(alone ? smiles.replace(/^\*/, '') : smiles)).doc);
  }
  return groups.get(key);
}

// Draws out these abbreviation atoms in `doc` (group drawings loaded
// first). Returns the ids of the new atoms and bonds.
async function drawOut(doc, ids) {
  const targets = expandable(doc, ids);
  const byAtom = bondsByAtom(doc);
  for (const id of targets) await groupDoc(doc.atoms.get(id).alias, !byAtom.get(id).length, doc.atoms.get(id).charge ?? 0);
  return drawOutWith(doc, targets, groups);
}

export function canDrawOut(doc, ids) {
  return expandable(doc, ids).length > 0;
}

export async function drawOutAbbreviations(ed, ids) {
  const targets = expandable(ed.doc, ids);
  if (!targets.length) {
    ed.say(t('Only a label on one single bond can be drawn out.'));
    return;
  }
  const byAtom = bondsByAtom(ed.doc);
  for (const id of targets) await groupDoc(ed.doc.atoms.get(id).alias, !byAtom.get(id).length, ed.doc.atoms.get(id).charge ?? 0);
  let made = [];
  ed.checkpoint();
  made = await drawOut(ed.doc, targets);
  ed.touched();
  // the groups drawn out selected, without the bonds that hold them (or the atoms they hold on to
  // would be selected too): Abbreviate turns them straight back into their labels
  const atoms = new Set(made.filter((id) => ed.doc.atoms.has(id)));
  ed.select(made.filter((id) => atoms.has(id) || (ed.doc.bonds.has(id) && atoms.has(ed.doc.bonds.get(id).a) && atoms.has(ed.doc.bonds.get(id).b))));
}

// A copy of the drawing with every abbreviation drawn out; the atoms keep
// their ids. `ids`: the objects wanted (null: all); returns { doc, ids,
// drawnAs } with the new atoms and bonds added to ids; drawnAs: label id ->
// the ids of the atoms it was drawn out as (what stood for the label: in a
// repeating unit's brackets, say).
export async function withGroupsDrawnOut(doc, ids = null) {
  // (each atom once: a selection's objects and its atoms can both be in `ids`, and a label goes only once)
  const atoms = ids ? [...new Set(ids.filter((id) => doc.atoms.has(id)))] : [...doc.atoms.keys()];
  const targets = expandable(doc, atoms);
  if (!targets.length) return { doc, ids, drawnAs: new Map() };
  const copy = structuredClone(doc);
  const made = [];
  const drawnAs = new Map();
  for (const id of targets) {
    const before = new Set(copy.atoms.keys());
    made.push(...(await drawOut(copy, [id])));
    drawnAs.set(id, [...copy.atoms.keys()].filter((atom) => !before.has(atom)));
  }
  return { doc: copy, ids: ids ? [...ids, ...made] : null, drawnAs };
}

// A molfile of these atoms with abbreviations drawn out.
export async function chemistryMolfile(doc, atomIds) {
  const { doc: full, ids } = await withGroupsDrawnOut(doc, atomIds);
  return writeMolfile(full, ids).molfile;
}

// --- gathering a group into its label ---

let canonicalGroups = null; // canonical SMILES -> name

async function knownGroups() {
  if (canonicalGroups) return canonicalGroups;
  const RDKit = await getRDKit();
  canonicalGroups = new Map();
  for (const [name, [smiles]] of Object.entries(ABBREVIATIONS)) {
    const mol = RDKit.get_mol(smiles);
    const key = mol?.get_smiles();
    mol?.delete();
    if (key && !canonicalGroups.has(key)) canonicalGroups.set(key, name);
  }
  return canonicalGroups;
}

// The charged groups (SO3⁻, CO2⁻, OPO3²⁻) by canonical SMILES (* where they attach): [label, charge].
let canonicalIons = null;
async function knownIons() {
  if (canonicalIons) return canonicalIons;
  const RDKit = await getRDKit();
  canonicalIons = new Map();
  for (const [name, charge, smiles] of CHARGED_ABBREVIATIONS) {
    const mol = RDKit.get_mol(smiles);
    const key = mol?.get_smiles();
    mol?.delete();
    if (key && !canonicalIons.has(key)) canonicalIons.set(key, [name, charge]); // (CO2⁻ before COO⁻)
  }
  return canonicalIons;
}

// The selected atoms in pieces: those joined by bonds among them, each a list of ids.
function selectedParts(doc, ids) {
  const chosen = new Set(ids.filter((id) => doc.atoms.has(id)));
  const byAtom = bondsByAtom(doc);
  const seen = new Set();
  const parts = [];
  for (const start of chosen) {
    if (seen.has(start)) continue;
    const part = [start];
    seen.add(start);
    for (let i = 0; i < part.length; i++) {
      for (const bond of byAtom.get(part[i])) {
        const next = otherEnd(bond, part[i]);
        if (chosen.has(next) && !seen.has(next)) {
          seen.add(next);
          part.push(next);
        }
      }
    }
    parts.push(part);
  }
  return parts;
}

// The bonds that join a piece to the rest of its molecule.
const exitsOf = (doc, part) => {
  const inside = new Set(part);
  return [...doc.bonds.values()].filter((b) => inside.has(b.a) !== inside.has(b.b));
};
// (hanging by one plain bond, single or double: Ph3P=O)
const hangs = (exits) => exits.length === 1 && !exits[0].kind && exits[0].order <= 2;

// Is anything selected that Abbreviate may write as a label: a piece hanging on the rest by one bond
// (a whole molecule is asked about apart: moleculeLabel)?
export function canAbbreviate(doc, ids) {
  return selectedParts(doc, ids).some((part) => part.some((id) => !doc.atoms.get(id).alias) && hangs(exitsOf(doc, part)));
}

// Is the selection one atom that is a methyl: a plain carbon (no charge, isotope, unpaired electron, its three
// hydrogens implicit) on one single bond? It is Me, the only label of one atom: Abbreviate is offered for it alone,
// as for any other group (two separate CH3 selected became Me each already).
export function isLoneMethyl(doc, ids) {
  if (ids.length !== 1) return false;
  const atom = doc.atoms.get(ids[0]);
  if (!atom || atom.el !== 'C' || atom.alias || atom.charge || atom.isotope || atom.radical || (atom.hCount != null && atom.hCount !== 3)) return false;
  const bonds = [...doc.bonds.values()].filter((b) => b.a === atom.id || b.b === atom.id);
  return bonds.length === 1 && !bonds[0].kind && bonds[0].order === 1;
}

// What Abbreviate is offered for, from the right-click menu and the search bar as from the panel: a group on one
// bond, a whole molecule (PPh3: said if it has no label here), a lone methyl. `ids`: the selection with the atoms
// of its bonds.
export function abbreviatable(doc, ids) {
  return (ids.length >= 2 && (wholeMolecule(doc, ids) !== null || canAbbreviate(doc, ids))) || isLoneMethyl(doc, ids);
}

// The selected atoms if they are one whole molecule (of two atoms or more), else null.
export function wholeMolecule(doc, ids) {
  const atoms = ids.filter((id) => doc.atoms.has(id));
  if (atoms.length < 2) return null;
  const members = fragments(doc).find((list) => list.includes(atoms[0]));
  const chosen = new Set(atoms);
  return members.length === chosen.size && members.every((id) => chosen.has(id)) ? members : null;
}

// The canonical SMILES of these atoms (`star`: written as *, where the rest of the molecule was), the
// labels among them drawn out; null if RDKit can't read it.
async function canonicalOf(doc, ids, star = null) {
  const keep = new Set(ids);
  const mini = {
    ...doc,
    atoms: new Map([...keep].map((id) => [id, id === star ? { ...doc.atoms.get(id), el: '*', alias: 'R', charge: 0, isotope: null, hCount: null } : doc.atoms.get(id)])),
    bonds: new Map([...doc.bonds].filter(([, b]) => keep.has(b.a) && keep.has(b.b))),
  };
  const { doc: full } = await withGroupsDrawnOut(mini, [...keep]);
  const RDKit = await getRDKit();
  try {
    const mol = readMol(RDKit, writeMolfile(full).molfile, { removeHs: true });
    const out = mol.get_smiles();
    mol.delete();
    return out;
  } catch {
    return null;
  }
}

async function smilesCanonical(smiles) {
  const RDKit = await getRDKit();
  const mol = RDKit.get_mol(smiles);
  const out = mol?.get_smiles() ?? null;
  mol?.delete();
  return out;
}

// The groups of the list on an atom (`centre`), within `atoms`, `exit` (the bond to the rest) left out:
// drawn (a benzene ring: Ph) or labels already (Ph). Their names, or null if anything else is on it.
async function groupsOn(doc, centre, atoms, exit = null) {
  const inside = new Set(atoms);
  const byAtom = bondsByAtom(doc);
  const known = await knownGroups();
  const names = [];
  let covered = 1;
  for (const bond of byAtom.get(centre)) {
    if (bond === exit) continue;
    const start = otherEnd(bond, centre);
    if (bond.order !== 1 || bond.kind || !inside.has(start)) return null;
    // the branch the bond leads to, the centre left out; a group if it touches the centre only there
    const branch = [start];
    for (let i = 0; i < branch.length; i++) {
      for (const b of byAtom.get(branch[i])) {
        const next = otherEnd(b, branch[i]);
        if (next !== centre && !branch.includes(next)) branch.push(next);
      }
    }
    if (branch.some((id) => !inside.has(id))) return null;
    if (branch.reduce((n, id) => n + byAtom.get(id).filter((b) => otherEnd(b, id) === centre).length, 0) !== 1) return null;
    const label = branch.length === 1 && doc.atoms.get(start).alias;
    const name = label ? ({ Pr: 'nPr', Bu: 'nBu' }[label] ?? label) : known.get(await canonicalOf(doc, [centre, ...branch], centre));
    if (!GROUPS.includes(name)) return null;
    names.push(name);
    covered += branch.length;
  }
  return covered === inside.size && names.length ? names : null;
}

// can this atom carry a label of groups (PPh3): no carbon (a carbon with groups is one of the list: Tr,
// tBu), its bonds to the groups single
function centreOf(doc, id, exit = null) {
  const bonds = bondsByAtom(doc).get(id) ?? [];
  return doc.atoms.get(id).el !== 'C' && !doc.atoms.get(id).alias && bonds.some((b) => b !== exit) && bonds.every((b) => b === exit || (b.order === 1 && !b.kind));
}

// A whole molecule as one label: an atom (not a carbon) with nothing on it but groups of the list on
// single bonds, its hydrogens and its charge (PPh3, NEt3, Et2O, AcOH, PhNH2; P with three Ph labels
// too). { centre, name } or null. The name is read back (condensed.js) and must give the same molecule.
const labels = new Map(); // the molecule's atoms and drawing -> { centre, name } or null
export async function moleculeLabel(doc, members) {
  if (members.length > 80 || members.some((id) => doc.atoms.get(id).isotope)) return null;
  const whole = await canonicalOf(doc, members);
  if (!whole) return null;
  const key = `${whole} ${members.join(',')}`;
  if (labels.has(key)) return labels.get(key);
  const electrons = electronsByAtom(doc);
  let found = null;
  for (const centre of members.filter((id) => centreOf(doc, id))) {
    const names = await groupsOn(doc, centre, members);
    if (!names) continue;
    const atom = doc.atoms.get(centre);
    const name = condensedName(atom.el, electrons.get(centre).hydrogens, names);
    const back = condensedGroup(name, atom.charge ?? 0);
    if (back && (await smilesCanonical(back.smiles.replace(/^\*/, ''))) === whole) {
      found = { centre, name };
      break;
    }
  }
  labels.set(key, found);
  return found;
}

// A selected piece as a label: { atoms, name, at (where the label goes), outside, bond (to the rest),
// charge } or null. On one bond: a group of the list (OBz, CO2Me), else an atom with groups, written atom
// first (PPh3 on a phosphonium's CH2, or on the O of Ph3P=O by its double bond); on none, the molecule's
// own label (PPh3).
async function partLabel(doc, part) {
  const exits = exitsOf(doc, part);
  if (!exits.length) {
    const found = part.length > 1 && (await moleculeLabel(doc, part));
    return found ? { atoms: part, name: found.name, at: found.centre, charge: doc.atoms.get(found.centre).charge ?? 0 } : null;
  }
  if (!hangs(exits)) return null;
  const [bond] = exits;
  const inside = part.includes(bond.a) ? bond.a : bond.b;
  const outside = otherEnd(bond, inside);
  const key = await canonicalOf(doc, [...part, outside], outside);
  if (!key) return null;
  const listed = bond.order === 1 && (await knownGroups()).get(key);
  if (listed) return { atoms: part, name: listed, at: inside, outside, bond, charge: 0 };
  // a charged group (a sulfonate: SO3⁻), its charge on the label
  const ion = bond.order === 1 && (await knownIons()).get(key);
  if (ion) return { atoms: part, name: ion[0], at: inside, outside, bond, charge: ion[1] };
  if (!centreOf(doc, inside, bond)) return null;
  const names = await groupsOn(doc, inside, part, bond);
  if (!names) return null;
  const atom = doc.atoms.get(inside);
  const charge = atom.charge ?? 0;
  const name = condensedName(atom.el, electronsByAtom(doc).get(inside).hydrogens, names, { attached: true });
  const back = condensedGroup(name, charge);
  const smiles = bond.order === 2 ? back?.smiles.replace(/^\*/, '*=') : back?.smiles;
  return back && (await smilesCanonical(smiles)) === key ? { atoms: part, name, at: inside, outside, bond, charge } : null;
}

// The groups within a selected piece that has no label as a whole, each hanging on the rest of the piece by one
// bond (CH2NMe2 selected: its NMe2): the largest that has a label first, then again in what is left, never one
// that holds an atom the piece hangs on the molecule by. Their labels, as partLabel gives them.
async function labelsWithin(doc, part) {
  const inside = new Set(part);
  const holds = new Set(exitsOf(doc, part).map((b) => (inside.has(b.a) ? b.a : b.b)));
  const byAtom = bondsByAtom(doc);
  const left = new Set(part);
  const found = [];
  const tried = new Set(); // (pieces without a label: the same in each round, the drawing unchanged)
  for (;;) {
    // each bond within what is left, cut: the side without the atoms the piece hangs by, if it comes apart there
    const pieces = new Map();
    for (const bond of doc.bonds.values()) {
      if (bond.kind || !left.has(bond.a) || !left.has(bond.b)) continue;
      const side = new Set([bond.a]);
      for (const stack = [bond.a]; stack.length;) {
        const id = stack.pop();
        for (const b of byAtom.get(id)) {
          if (b === bond) continue;
          const to = otherEnd(b, id);
          if (left.has(to) && !side.has(to)) {
            side.add(to);
            stack.push(to);
          }
        }
      }
      if (side.size === left.size) continue; // (a ring bond: nothing comes apart)
      for (const atoms of [[...side], [...left].filter((id) => !side.has(id))]) {
        if (atoms.some((id) => holds.has(id)) || atoms.every((id) => doc.atoms.get(id).alias)) continue;
        const key = atoms.sort((p, q) => p - q).join();
        if (!tried.has(key)) pieces.set(key, atoms);
      }
    }
    let picked = null;
    for (const [key, piece] of [...pieces].sort(([, p], [, q]) => q.length - p.length)) {
      picked = await partLabel(doc, piece);
      if (picked) break;
      tried.add(key);
    }
    if (!picked) return found;
    found.push(picked);
    for (const id of picked.atoms) left.delete(id);
  }
}

// What a label takes over from the group's atom on the bond, and the bond to it from the bond it replaces:
// colour and highlight (Draw out gives them back: groups.js)
const looks = (object) => ({ color: object.color ?? null, ...(object.highlight ? { highlight: object.highlight } : {}) });

// Writes each selected piece that has a label as that label (a group of the list, an atom with groups, a
// whole molecule: Ph, OBz, PPh3); a piece without one that hangs on one bond, as Abbreviate is offered for
// (canAbbreviate), has the groups in it that have one written so (CH2NMe2: CH2–NMe2), the rest left as it is.
// Any other piece is left as it is (a piece in the middle of a chain: alone, Abbreviate isn't offered for it).
export async function abbreviateSelection(ed, ids) {
  const parts = selectedParts(ed.doc, ids).filter((part) => part.some((id) => !ed.doc.atoms.get(id).alias));
  const found = [];
  const within = []; // (those of a part of a piece only: said)
  for (const part of parts) {
    const label = await partLabel(ed.doc, part);
    if (label) {
      found.push(label);
      continue;
    }
    if (!hangs(exitsOf(ed.doc, part))) continue;
    const labels = await labelsWithin(ed.doc, part);
    within.push(...labels);
    found.push(...labels);
  }
  if (within.length) ed.say(t('No abbreviation for all of it: written for the groups in it that have one ({names}).', { names: within.map((f) => f.name).join(', ') }), 'info', 6000);
  if (!found.length) {
    ed.say(parts.some((part) => hangs(exitsOf(ed.doc, part)) || !exitsOf(ed.doc, part).length)
      ? t('This group has no abbreviation here (Ph, Bn, Boc, Ts, OMe, CO2Et…).')
      : t('Select a group that hangs on one single bond (a phenyl, a Boc, an OMe).'));
    return;
  }
  ed.change((doc) => {
    const made = [];
    for (const { atoms, name, at, outside, bond, charge } of found) {
      const atom = doc.atoms.get(at);
      const label = addAtom(doc, atom.x, atom.y, '*', { alias: name, ...looks(atom), charge });
      // a wedge from the atom it hangs on (a stereocentre) stays on the bond to the label
      if (bond) addBond(doc, outside, label.id, bond.order, { stereo: bond.a === outside ? bond.stereo : '', ...looks(bond) });
      // (a name on one of its atoms' anchors, on the label now)
      for (const text of doc.texts.values()) if (atoms.includes(text.anchor)) text.anchor = label.id;
      // (on a reaction arrow, as its molecule was: stays there; brackets made round its atoms, round the label)
      for (const key of ['arrow', 'arrowSlot', 'arrowOrder', 'arrowSign']) if (atom[key] !== undefined) label[key] = atom[key];
      for (const bracket of doc.brackets.values()) {
        if (bracket.atoms?.some((id) => atoms.includes(id))) bracket.atoms = [...bracket.atoms.filter((id) => !atoms.includes(id)), label.id];
      }
      // (a whole molecule in a group: the label in it)
      for (const group of doc.groups?.values() ?? []) {
        if (group.members.some((id) => atoms.includes(id))) group.members = [...group.members.filter((id) => !atoms.includes(id)), label.id];
      }
      // (curved arrows, orbitals, groups on its atom on the bond and on that bond: on the label and its bond, as
      // drawn out they were on them: joinAtom)
      if (bond && doc.atoms.has(at)) joinAtom(doc, at, label.id);
      deleteObjects(doc, atoms.filter((id) => doc.atoms.has(id)));
      made.push(label.id);
    }
    ed.selection = new Set(made);
  });
}

// Abbreviations a file had drawn out (`superatoms`: [{ name, atoms }], Ketcher's and Indigo's, from a CDXML's
// nicknames: Me, OTBS, CO2Me) written as labels again, each only where olomol knows the group, its atoms are
// just that group (as Abbreviate finds it), and its molecule stays exactly the same with the label (drawn out
// again, R/S and E/Z included: a carbon with more wedges than it needs can read otherwise once its Me is
// redrawn), so any other stays drawn out. The file's own name where olomol has it for the same group (OTBS,
// not another name for it). In place, on a drawing scaled to bond length 1; returns `ids` with the atoms gone
// left out and the labels made added.
export async function collapseGroups(doc, ids, superatoms) {
  const known = await knownGroups();
  const keyOf = new Map([...known].map(([key, name]) => [name, key]));
  const own = async (name) => keyOf.get(name) ?? (ABBREVIATIONS[name] ? smilesCanonical(ABBREVIATIONS[name][0]) : null);
  // a label in place of the group's atoms (as Abbreviate writes it); returns the label's id
  const put = (d, label, name) => {
    const atom = d.atoms.get(label.at);
    const extra = { alias: name, ...looks(atom), charge: label.charge };
    if (atom.arrow != null) Object.assign(extra, { arrow: atom.arrow, arrowSlot: atom.arrowSlot, arrowOrder: atom.arrowOrder }); // (on a reaction arrow: stays there)
    const made = addAtom(d, atom.x, atom.y, '*', extra);
    if (label.bond) addBond(d, label.outside, made.id, label.bond.order, { stereo: label.bond.a === label.outside ? label.bond.stereo : '', ...looks(label.bond) });
    for (const text of d.texts.values()) if (label.atoms.includes(text.anchor)) text.anchor = made.id;
    // what was on the group's atom on the bond, and on that bond, on the label and its bond (curved arrows, orbitals,
    // groups: joinAtom); then the rest of the group goes
    if (label.bond && d.atoms.has(label.at)) joinAtom(d, label.at, made.id);
    deleteObjects(d, label.atoms.filter((id) => d.atoms.has(id)));
    return made.id;
  };
  // the molecules, worked out once and kept up to date: atom id -> its molecule { atoms, meaning }
  const moleculeOf = new Map();
  for (const members of fragments(doc)) {
    const molecule = { atoms: new Set(members), meaning: undefined };
    for (const id of members) moleculeOf.set(id, molecule);
  }
  const made = [];
  for (const { name, atoms } of superatoms) {
    if (!atoms.length || atoms.some((id) => !doc.atoms.has(id))) continue;
    const label = await partLabel(doc, atoms).catch(() => null);
    if (!label) continue;
    const named = name && name !== label.name && (await own(name)) && (await own(name)) === (await own(label.name)) ? name : label.name;
    // the molecule with the label, tried first on a copy of that molecule alone (nothing done to it reaches
    // the drawing: its brackets, orbitals or arrows)
    const molecule = moleculeOf.get(atoms[0]);
    molecule.meaning ??= await canonicalOf(doc, [...molecule.atoms]);
    if (!molecule.meaning) continue;
    const trial = { ...emptyDoc(), nextId: doc.nextId };
    for (const id of molecule.atoms) trial.atoms.set(id, { ...doc.atoms.get(id) });
    for (const [id, bond] of doc.bonds) if (molecule.atoms.has(bond.a)) trial.bonds.set(id, { ...bond });
    put(trial, label, named);
    const after = await canonicalOf(trial, [...trial.atoms.keys()]);
    if (after !== molecule.meaning) continue;
    const real = put(doc, label, named);
    for (const id of label.atoms) {
      molecule.atoms.delete(id);
      moleculeOf.delete(id);
    }
    molecule.atoms.add(real);
    moleculeOf.set(real, molecule);
    made.push(real, ...[...doc.bonds.values()].filter((b) => b.a === real || b.b === real).map((b) => b.id));
  }
  // (what is still in the drawing, of any kind, and the labels made)
  const there = (id) => Object.values(doc).some((v) => v instanceof Map && v.has(id));
  return [...new Set([...ids.filter(there), ...made])];
}
