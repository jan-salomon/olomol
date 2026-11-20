// Groups (Ctrl+G): things kept together for selecting and moving, and nothing more (One compound is chemistry:
// K⁺ and its anion one species). Plain clicks act on the drawing as ever (an atom, a double click its molecule,
// a triple click its row); groups come with Ctrl: Ctrl+click picks the innermost group round what was clicked,
// Ctrl+click again on it the group round that, and so on out (J: what is done most, editing, costs least).
// Groups may hold groups.
//
// doc.groups: Map id → { id, members: [ids] }. Members: atoms (each standing for its molecule: all its atoms are
// kept, so that one deleted or a bond broken leaves the rest in), reaction arrows (with what is on them), "+"
// signs, texts standing free, brackets, and groups. A bond, a curved arrow, an orbital, a text on an anchor, a
// molecule on an arrow: in the group of what it belongs to.
import { fragments } from '../model/graph.js';
import { t } from '../i18n/i18n.js';
// (the select tool's: what selecting a group selects; used when called, so the two may import each other)
import { idsOfGroup } from './tools/select.js';

const groupsOf = (doc) => (doc.groups ??= new Map());

// Each atom's molecule (its atom ids), worked out once
function moleculesOf(doc) {
  const of = new Map();
  for (const members of fragments(doc)) for (const id of members) of.set(id, members);
  return (id) => of.get(id) ?? [id];
}

// What an object counts as for groups: { atoms: its molecule's atoms } or { id } (an arrow, a "+", a free text,
// a bracket); a bond, a curved arrow, an orbital, a ring fill, a text on an anchor or an arrow, a molecule on an
// arrow: what it belongs to. null: nothing that can be grouped.
function unitOf(doc, id, molecule) {
  if (doc.atoms.has(id)) {
    const atom = doc.atoms.get(id);
    return atom.arrow != null && doc.arrows.has(atom.arrow) ? { id: atom.arrow } : { atoms: molecule(id) };
  }
  if (doc.bonds.has(id)) return unitOf(doc, doc.bonds.get(id).a, molecule);
  if (doc.curves.has(id)) {
    const end = doc.curves.get(id).from;
    const atom = end.atom ?? (end.orbital !== undefined ? doc.orbitals.get(end.orbital)?.atom : doc.bonds.get(end.bond)?.a);
    return atom === undefined ? null : unitOf(doc, atom, molecule);
  }
  if (doc.orbitals?.has(id)) return unitOf(doc, doc.orbitals.get(id).atom, molecule);
  if (doc.overlaps?.has(id)) return unitOf(doc, doc.orbitals.get(doc.overlaps.get(id).a)?.atom, molecule);
  if (doc.fills.has(id)) return unitOf(doc, doc.fills.get(id).atoms[0], molecule);
  if (doc.texts.has(id)) {
    const text = doc.texts.get(id);
    if (text.anchor != null && doc.atoms.has(text.anchor)) return unitOf(doc, text.anchor, molecule);
    if (text.arrow != null && doc.arrows.has(text.arrow)) return { id: text.arrow };
    return { id };
  }
  if (doc.arrows.has(id) || doc.pluses.has(id) || doc.brackets.has(id)) return { id };
  return null;
}
const keyOf = (unit) => (unit.atoms ? `m${Math.min(...unit.atoms)}` : `o${unit.id}`);

const holds = (group, unit) => (unit.atoms ? unit.atoms.some((id) => group.members.includes(id)) : group.members.includes(unit.id));
export const parentOf = (doc, groupId) => [...groupsOf(doc).values()].find((group) => group.members.includes(groupId)) ?? null;

// The groups round an object, innermost first ([] for none)
export function groupChain(doc, id) {
  if (!doc.groups?.size) return [];
  const unit = unitOf(doc, id, moleculesOf(doc));
  if (!unit) return [];
  let group = [...doc.groups.values()].find((g) => holds(g, unit));
  const chain = [];
  while (group && !chain.includes(group.id)) {
    chain.push(group.id);
    group = parentOf(doc, group.id);
  }
  return chain;
}

// Everything a group stands for, to select: each member as a double click takes it (`moleculeIds`, `arrowIds`
// of the select tool), the groups in it as theirs, and the curved arrows between its molecules
export function groupIds(ed, groupId, { moleculeIds, arrowIds }) {
  const { doc } = ed;
  const molecule = moleculesOf(doc);
  const ids = new Set();
  const seen = new Set();
  const take = (id) => {
    if (groupsOf(doc).has(id)) {
      if (seen.has(id)) return;
      seen.add(id);
      for (const member of groupsOf(doc).get(id).members) take(member);
    } else if (doc.atoms.has(id)) {
      if (!ids.has(id)) for (const one of moleculeIds(ed, molecule(id))) ids.add(one);
    } else if (doc.arrows.has(id)) {
      for (const one of arrowIds(doc, id)) ids.add(one);
    } else if (doc.pluses.has(id) || doc.texts.has(id) || doc.brackets.has(id)) {
      ids.add(id);
    }
  };
  take(groupId);
  const endAtom = (end) => end.atom ?? (end.orbital !== undefined ? doc.orbitals.get(end.orbital)?.atom : doc.bonds.get(end.bond)?.a);
  for (const curve of doc.curves.values()) if (ids.has(endAtom(curve.from)) && ids.has(endAtom(curve.to))) ids.add(curve.id);
  // (and the dashed lines between their orbitals: a Diels–Alder's diene and dienophile, coloured with the group)
  for (const overlap of doc.overlaps?.values() ?? []) if (ids.has(overlap.a) && ids.has(overlap.b)) ids.add(overlap.id);
  return [...ids];
}

// Members gone (deleted, or a text now on an anchor) taken out; a group with none left goes, and out of the
// group it was in. After each change (editor.touched), as ring fills are pruned.
export function pruneGroups(doc) {
  if (!doc.groups?.size) return;
  // (a molecule put on a reaction arrow is the arrow's now, as a text put on an anchor: out of its group, which
  // could no longer be taken apart, its keys matching nothing)
  const onArrow = (id) => doc.atoms.get(id).arrow != null && doc.arrows.has(doc.atoms.get(id).arrow);
  const member = (id) => doc.groups.has(id) || (doc.atoms.has(id) && !onArrow(id)) || doc.arrows.has(id) || doc.pluses.has(id) || doc.brackets.has(id)
    || (doc.texts.has(id) && doc.texts.get(id).anchor == null && doc.texts.get(id).arrow == null);
  oneGroupPerMolecule(doc);
  for (let changed = true; changed;) {
    changed = false;
    for (const group of [...doc.groups.values()]) {
      if (!group.members.every(member)) {
        group.members = group.members.filter(member);
        changed = true;
      }
      if (!group.members.length) {
        doc.groups.delete(group.id);
        changed = true;
      }
    }
  }
}

// A molecule is in one group: two molecules of different groups bonded into one (or merged by dropping an atom on
// another) stay in the older of the groups (a group lists one atom for each molecule, so how much of it each held
// is not known), out of the others. Else Ctrl+click would pick either, and moving one group would drag the other's
// atoms along.
function oneGroupPerMolecule(doc) {
  const holding = new Map(); // atom id -> the groups that have it as a member
  for (const group of doc.groups.values()) {
    for (const id of group.members) if (doc.atoms.has(id)) (holding.get(id) ?? holding.set(id, []).get(id)).push(group);
  }
  if (holding.size < 2) return;
  for (const members of fragments(doc)) {
    const groups = new Set(members.flatMap((id) => holding.get(id) ?? []));
    if (groups.size < 2) continue;
    const kept = [...groups].reduce((older, group) => (group.id < older.id ? group : older));
    const inIt = new Set(members);
    for (const group of groups) if (group !== kept) group.members = group.members.filter((id) => !inIt.has(id));
  }
}

// For a picture with the drawing's groups (render/svg.js groupedMarkup): each part's innermost group, worked out
// once, and each group's parent; null without groups
export function svgGrouping(doc) {
  if (!doc.groups?.size) return null;
  const owners = new Map();
  return {
    owner: (id) => {
      if (!owners.has(id)) owners.set(id, groupChain(doc, id)[0]);
      return owners.get(id);
    },
    parent: (group) => parentOf(doc, group)?.id,
    name: (group) => doc.groups.get(group)?.name ?? null,
  };
}

// --- grouping and ungrouping what is selected ---

// The groups all of whose things are selected
export function wholeGroups(ed) {
  const { doc } = ed;
  if (!doc.groups?.size) return new Set();
  const molecule = moleculesOf(doc);
  const chosen = new Set();
  for (const id of ed.selection) {
    const unit = unitOf(doc, id, molecule);
    if (unit) chosen.add(keyOf(unit));
  }
  const keysIn = (groupId, out = [], seen = new Set()) => {
    if (seen.has(groupId)) return out;
    seen.add(groupId);
    for (const member of doc.groups.get(groupId)?.members ?? []) {
      if (doc.groups.has(member)) keysIn(member, out, seen);
      else out.push(doc.atoms.has(member) ? `m${Math.min(...molecule(member))}` : `o${member}`);
    }
    return out;
  };
  return new Set([...doc.groups.keys()].filter((id) => keysIn(id).every((key) => chosen.has(key))));
}

// What is selected, as the things a group would hold: the outermost groups all of whose things are selected, and
// the molecules (any atom of them selected), arrows, "+" signs, free texts and brackets not in one of those:
// [{ group: id } | { atoms } | { id }], each with the group it is in now (`parent`).
function selectedItems(ed) {
  const { doc } = ed;
  const molecule = moleculesOf(doc);
  const units = new Map();
  for (const id of ed.selection) {
    const unit = unitOf(doc, id, molecule);
    if (unit && !units.has(keyOf(unit))) units.set(keyOf(unit), unit);
  }
  // the things in a group, by their keys
  const keysIn = (groupId, out = []) => {
    for (const member of groupsOf(doc).get(groupId)?.members ?? []) {
      if (groupsOf(doc).has(member)) keysIn(member, out);
      else if (doc.atoms.has(member)) out.push(`m${Math.min(...molecule(member))}`);
      else out.push(`o${member}`);
    }
    return out;
  };
  const whole = (groupId) => keysIn(groupId).every((key) => units.has(key));
  const items = [];
  const taken = new Set();
  for (const unit of units.values()) {
    const chain = groupChain(doc, unit.atoms ? unit.atoms[0] : unit.id);
    const outer = chain.filter(whole).at(-1);
    if (outer === undefined) items.push({ ...unit, parent: chain[0] ?? null });
    else if (!taken.has(outer)) {
      taken.add(outer);
      items.push({ group: outer, parent: parentOf(doc, outer)?.id ?? null });
    }
  }
  return items;
}

// Whether the selection holds things Ctrl+G would group, or a group Ctrl+Shift+G would take apart (the
// right-click menu)
export const canGroup = (ed) => ed.selection.size > 1 && selectedItems(ed).length > 1;
export const canUngroup = (ed) => ed.selection.size > 0 && Boolean(ed.doc.groups?.size) && selectedItems(ed).some((item) => item.group !== undefined);

// Ctrl+G: what is selected made a group, one undo step; inside the group they were all in, if they were in one
// (each taken out of the group it was in otherwise)
export function groupSelection(ed) {
  const items = selectedItems(ed);
  if (items.length < 2) {
    ed.say(t('Select two things or more to group (molecules, arrows, "+" signs, texts).'));
    return false;
  }
  const parents = new Set(items.map((item) => item.parent));
  const into = parents.size === 1 ? [...parents][0] : null;
  const memberIds = (item) => (item.group !== undefined ? [item.group] : item.atoms ?? [item.id]);
  let made = null;
  ed.change((doc) => {
    const groups = groupsOf(doc);
    for (const item of items) {
      const parent = item.parent === null ? null : groups.get(item.parent);
      if (!parent) continue;
      const gone = new Set(memberIds(item));
      parent.members = parent.members.filter((id) => !gone.has(id));
    }
    const group = { id: doc.nextId++, members: items.flatMap(memberIds) };
    made = group.id;
    groups.set(group.id, group);
    if (into !== null && groups.has(into)) groups.get(into).members.push(group.id);
    pruneGroups(doc);
  });
  // the group made selected, all of it (whole molecules, what is on its arrows), and so outlined (Canvas.jsx)
  ed.select(idsOfGroup(ed, made));
  ed.groupPick = made;
  ed.say(t('Grouped. Ctrl+click picks the group (again: the one round it); Ctrl+Shift+G takes it apart.'));
  return true;
}

// Ctrl+Shift+G: the outermost groups that are wholly selected taken apart, one level (what they held goes into the
// group they were in), one undo step
export function ungroupSelection(ed) {
  const chosen = selectedItems(ed).filter((item) => item.group !== undefined);
  if (!chosen.length) {
    ed.say(t('Select a group to take apart first (Ctrl+click picks one).'));
    return false;
  }
  ed.change((doc) => {
    for (const { group: id } of chosen) {
      const group = doc.groups.get(id);
      if (!group) continue;
      const parent = parentOf(doc, id);
      if (parent) parent.members = parent.members.flatMap((member) => (member === id ? group.members : [member]));
      doc.groups.delete(id);
    }
  });
  ed.groupPick = null;
  ed.say(t('Taken apart, one level (groups inside it stay groups).'));
  return true;
}

// --- the Objects panel: a group's name, things moved between groups ---

// A group named (an empty name: none), one undo step
export function renameGroup(ed, groupId, name) {
  const group = ed.doc.groups?.get(groupId);
  const clean = String(name ?? '').trim();
  if (!group || (group.name ?? '') === clean) return;
  ed.change((doc) => {
    const same = doc.groups.get(groupId);
    if (clean) same.name = clean;
    else delete same.name;
  });
}

// Whether group `inner` is `outer` or inside it
function within(doc, inner, outer) {
  for (let group = inner, seen = 0; group !== undefined && seen < 100; group = parentOf(doc, group)?.id, seen += 1) if (group === outer) return true;
  return false;
}

// A thing or a group (`item`: { group } or { atoms } or { id }, as the Objects panel lists it) moved into group
// `target` (null: out of every group), out of the one it was in; a group with nothing left goes. One undo step;
// false when it can't (a group into itself or one inside it, or where it is already).
export function moveIntoGroup(ed, item, target) {
  const { doc } = ed;
  const ids = item.group !== undefined ? [item.group] : item.atoms ?? [item.id];
  const from = item.group !== undefined ? parentOf(doc, item.group)?.id : groupChain(doc, ids[0])[0];
  if ((from ?? null) === target) return false;
  if (item.group !== undefined && target !== null && within(doc, target, item.group)) return false;
  ed.change((d) => {
    if (from !== undefined && d.groups.has(from)) d.groups.get(from).members = d.groups.get(from).members.filter((id) => !ids.includes(id));
    if (target !== null && d.groups.has(target)) d.groups.get(target).members.push(...ids);
    pruneGroups(d);
  });
  return true;
}

// --- Ctrl+click ---

// The group a Ctrl+click on object `id` picks: the innermost round it; if the one the last Ctrl+click picked is
// round it and is what is selected now, the one round that (the outermost stays). null: not in a group.
// `idsOf(group)`: what selecting a group selects.
export function groupToPick(ed, id, idsOf) {
  const chain = groupChain(ed.doc, id);
  if (!chain.length) return null;
  const at = ed.groupPick == null ? -1 : chain.indexOf(ed.groupPick);
  if (at >= 0) {
    const ids = idsOf(ed.groupPick);
    if (ids.length === ed.selection.size && ids.every((one) => ed.selection.has(one))) return chain[Math.min(at + 1, chain.length - 1)];
  }
  return chain[0];
}
