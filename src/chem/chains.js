// A molecule's main chain drawn anew, as Ring flip draws a flat ring as a chair: as a Fischer projection
// (toFischer, the Fischer tool) or as a zigzag (toZigzag, the zigzag tool). Both take IUPAC's main chain, C1 first
// (on to a label at an end, CHO or CO2H written as one atom, which IUPAC's chain leaves out, where that end has
// groups to put on both sides); move each group's further atoms with it as they were drawn (turned, never
// mirrored); decide each stereocentre by RDKit's CIP labels; and check the whole by the molecule's SMILES (the
// labels drawn out), drawing nothing that would change it.
//
// A Fischer projection: the chain straight down; each carbon inside it a crossing, its two groups left and right
// (an H drawn where it had only implicit ones), read as a Fischer projection's centre (atom.projection); the
// groups on the chain's ends fanned out above and below, the ends then written as the templates write them (CHO,
// CH2OH, CO2H, CO2Me, CN, CH3). Refused: a main chain that is a ring or in one ('ring'), no stereocentre at all
// ('achiral': glycine), no stereo drawn ('none'), a stereocentre without a wedge ('open', n), a double bond in the
// chain or more than two groups on one of its carbons ('shape'), the SMILES changed ('stereo').
//
// A zigzag: the chain left to right, C1 on the left; each group pointing out from its corner (two: either side of
// that), the drawn hydrogens on the chain left out, a wedge or hashed wedge where a stereocentre needs one. Refused:
// 'ring', more than two groups on a carbon inside the chain ('shape'), 'stereo' (a Z double bond in the chain,
// which a zigzag would draw E, say). Either: 'short', no chain (one carbon, without labels on two sides).
import { iupacNumbering } from './numbering.js';
import { ABBREVIATIONS } from './abbreviations.js';
import { drawOutWith } from '../editor/groups.js';
import { readMolfile, writeMolfile } from '../io/molfile.js';
import { addAtom, addBond, bondsByAtom, otherEnd } from '../model/doc.js';
import { smallestRings } from '../model/graph.js';

const covalent = (bond) => bond.kind !== 'hbond' && bond.kind !== 'link';

// The atoms of the molecule `id` is in
export function moleculeAt(doc, id, byAtom = bondsByAtom(doc)) {
  const molecule = new Set([id]);
  for (const stack = [id]; stack.length;) {
    const at = stack.pop();
    for (const b of byAtom.get(at) ?? []) {
      const to = otherEnd(b, at);
      if (b.kind !== 'link' && !molecule.has(to)) {
        molecule.add(to);
        stack.push(to);
      }
    }
  }
  return [...molecule];
}

// The molecule's SMILES and how many stereocentres it has without a side said (null: RDKit can't read it). Read
// with its drawn hydrogens, as stereoLabels reads it (RDKit taking off a wedged H beside a label, CHO, read the
// centre the other way round), then the hydrogens off by its own SMILES.
function smilesOf(RDKit, doc, ids) {
  const drawn = RDKit.get_mol(writeMolfile(doc, ids).molfile, JSON.stringify({ removeHs: false }));
  if (!drawn) return null;
  let smiles;
  try {
    smiles = drawn.get_smiles();
  } finally {
    drawn.delete();
  }
  const mol = RDKit.get_mol(smiles);
  if (!mol) return null;
  try {
    return { smiles: mol.get_smiles(), open: JSON.parse(mol.get_descriptors()).NumUnspecifiedAtomStereoCenters ?? 0 };
  } finally {
    mol.delete();
  }
}

// The abbreviations' drawings (name -> a drawing, its * atom attaching), as RDKit draws them, for drawing labels out
const groupDrawings = new Map();
function groupsFor(RDKit, names) {
  for (const name of names) {
    if (groupDrawings.has(name)) continue;
    const mol = RDKit.get_mol(ABBREVIATIONS[name][0]);
    mol.set_new_coords();
    groupDrawings.set(name, readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true }))).doc);
    mol.delete();
  }
  return groupDrawings;
}

// The molecule `ids` with its labels drawn out (CHO as C and O: RDKit reads a label as a dummy atom, which turned a
// centre beside it round; IUPAC's numbering doesn't count a label's carbons), its atoms then, and `labelOf`: each
// drawn-out group's atom on the bond -> the label it was
function chemistry(RDKit, doc, ids) {
  const labels = ids.filter((id) => ABBREVIATIONS[doc.atoms.get(id)?.alias]);
  if (!labels.length) return { drawn: doc, ids, labelOf: new Map() };
  const drawn = structuredClone(doc);
  const groups = groupsFor(RDKit, labels.map((id) => doc.atoms.get(id).alias));
  const labelOf = new Map();
  for (const label of labels) {
    const anchors = [...drawn.bonds.values()].filter((b) => b.a === label || b.b === label).map((b) => otherEnd(b, label));
    const before = new Set(drawn.atoms.keys());
    drawOutWith(drawn, [label], groups);
    const onBond = [...drawn.bonds.values()].find((b) => (anchors.includes(b.a) && !before.has(b.b)) || (anchors.includes(b.b) && !before.has(b.a)));
    if (onBond) labelOf.set(before.has(onBond.a) ? onBond.b : onBond.a, label);
  }
  return { drawn, ids: moleculeAt(drawn, ids.find((id) => !labels.includes(id)) ?? ids[0]), labelOf };
}

// Map atom id -> its CIP label (R, S, r, s)
function cipOf(RDKit, doc, ids) {
  const { molfile, atomIds } = writeMolfile(doc, ids);
  const mol = RDKit.get_mol(molfile, JSON.stringify({ removeHs: false }));
  const labels = new Map();
  if (!mol) return labels;
  try {
    for (const [i, label] of JSON.parse(mol.get_stereo_tags()).CIP_atoms ?? []) {
      const cip = label.replace(/[()]/g, '');
      if (cip !== '?') labels.set(atomIds[i], cip); // (?: a stereocentre whose side isn't said)
    }
  } catch {
    // none
  } finally {
    mol.delete();
  }
  return labels;
}

// The molecule at `start` and its main chain, ready to be drawn anew (or { error }): its atoms, the chain (C1
// first), each chain atom's groups ({ root, bond, order, members }), the SMILES and CIP labels to keep, and
// place(doc, group, from, centre, dir): the group put on its chain atom (now at `centre`) towards `dir`, its
// first atom a bond away, turned as it was drawn
function chainPlan(RDKit, given, start) {
  const byAtom = bondsByAtom(given);
  const ids = moleculeAt(given, start, byAtom);
  const before = chemistry(RDKit, given, ids);
  const want = smilesOf(RDKit, before.drawn, before.ids);
  if (!want) return { error: 'stereo' };
  // (numbered with its labels drawn out, so that CHO's carbon is C1; each drawn-out group's atom on the bond is
  // its label in the drawing, the rest of the group beyond it)
  const numbering = iupacNumbering(before.drawn, before.ids, bondsByAtom(before.drawn));
  if (numbering.parent?.kind !== 'chain' || !numbering.numbers.size) return { error: 'ring' };
  const chain = [];
  for (const [id] of [...numbering.numbers].sort((p, q) => p[1] - q[1])) {
    const here = given.atoms.has(id) ? id : before.labelOf.get(id);
    if (here != null && !chain.includes(here)) chain.push(here);
  }
  if (!chain.length) return { error: 'ring' };
  const inRings = new Set([...smallestRings(given, byAtom).values()].flat());
  if (chain.some((id) => inRings.has(id))) return { error: 'ring' };
  const links = (id) => byAtom.get(id).filter(covalent);
  const isLabel = (b, from) => b.order === 1 && given.atoms.get(otherEnd(b, from)).alias && links(otherEnd(b, from)).length === 1;
  if (chain.length === 1) {
    // (one carbon between labels, D-glyceraldehyde's template: the chain from the upper label to the lower one)
    const [c] = chain;
    const labels = links(c).filter((b) => isLabel(b, c)).map((b) => otherEnd(b, c)).sort((p, q) => given.atoms.get(p).y - given.atoms.get(q).y);
    if (labels.length < 2) return { error: 'short' };
    chain.unshift(labels[0]);
    chain.push(labels.at(-1));
  }
  const onward = (end, inner) => {
    const groups = links(end).filter((b) => otherEnd(b, end) !== inner);
    const label = groups.length >= 2 && groups.find((b) => isLabel(b, end));
    return label ? otherEnd(label, end) : null;
  };
  const head = given.atoms.get(chain[0]).alias ? null : onward(chain[0], chain[1]);
  if (head != null) chain.unshift(head);
  const tail = given.atoms.get(chain.at(-1)).alias ? null : onward(chain.at(-1), chain.at(-2));
  if (tail != null && tail !== head) chain.push(tail);
  const inChain = new Set(chain);
  const groupOf = (root, from) => {
    const members = new Set([root]);
    for (const stack = [root]; stack.length;) {
      const id = stack.pop();
      for (const b of byAtom.get(id) ?? []) {
        const to = otherEnd(b, id);
        if (to === from || inChain.has(to) || members.has(to) || b.kind === 'link') continue;
        members.add(to);
        stack.push(to);
      }
    }
    return [...members];
  };
  const groupsAt = new Map(chain.map((id) => [id, links(id).filter((b) => !inChain.has(otherEnd(b, id))).map((b) => {
    const root = otherEnd(b, id);
    return { root, bond: b.id, order: b.order, members: groupOf(root, id) };
  })]));
  const at = (id) => [given.atoms.get(id).x, given.atoms.get(id).y];
  const place = (doc, group, from, centre, dir) => {
    if (group.added) {
      Object.assign(doc.atoms.get(group.root), { x: centre[0] + dir[0], y: centre[1] + dir[1] });
      return;
    }
    const [fx, fy] = at(from);
    const [rx, ry] = at(group.root);
    const turn = Math.atan2(dir[1], dir[0]) - Math.atan2(ry - fy, rx - fx);
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    for (const id of group.members) {
      const [x, y] = at(id);
      const [dx, dy] = [x - rx, y - ry];
      Object.assign(doc.atoms.get(id), { x: centre[0] + dir[0] + c * dx - s * dy, y: centre[1] + dir[1] + s * dx + c * dy });
    }
  };
  const atoms = ids.map((id) => given.atoms.get(id));
  const middle = [atoms.reduce((s, a) => s + a.x, 0) / atoms.length, atoms.reduce((s, a) => s + a.y, 0) / atoms.length];
  return { ids, chain, inChain, links, groupsAt, place, middle, want, wanted: cipOf(RDKit, before.drawn, before.ids) };
}

// The molecule drawn anew moved so that its atoms' middle (their average place) is where it was: the atoms in both
// drawings only (not an H drawn on or left out, nor a group gone into its label), so a drawing clicked that is
// drawn so already stays where it is
function keepPlace(given, doc, atoms) {
  const both = atoms.filter((id) => given.atoms.has(id) && doc.atoms.has(id));
  if (!both.length) return;
  const mean = (d) => [0, 1].map((k) => both.reduce((sum, id) => sum + (k ? d.atoms.get(id).y : d.atoms.get(id).x), 0) / both.length);
  const [was, now] = [mean(given), mean(doc)];
  for (const id of atoms) {
    const atom = doc.atoms.get(id);
    if (!atom) continue;
    atom.x += was[0] - now[0];
    atom.y += was[1] - now[1];
  }
}

// The SMILES of the drawing as it now is (its labels drawn out), and its CIP labels
const nowOf = (RDKit, doc, ids) => {
  const { drawn, ids: members } = chemistry(RDKit, doc, ids);
  return { smiles: smilesOf(RDKit, drawn, members)?.smiles ?? null, cip: cipOf(RDKit, drawn, members) };
};

export async function toFischer(RDKit, given, start) {
  const plan = chainPlan(RDKit, given, start);
  if (plan.error) return plan;
  const { ids, chain, inChain, groupsAt, place, middle, want, wanted } = plan;
  if (!want.smiles.includes('@')) return { error: want.open ? 'none' : 'achiral' };
  if (want.open) return { error: 'open', n: want.open };
  // (two carbons are a projection when one of them is a stereocentre: mandelic acid, its phenyl below)
  if (chain.length < 3 && !(chain.length === 2 && chain.some((id) => wanted.has(id)))) return { error: 'shape' };
  for (let i = 0; i + 1 < chain.length; i++) {
    const bond = plan.links(chain[i]).find((b) => otherEnd(b, chain[i]) === chain[i + 1]);
    if (!bond || bond.order !== 1) return { error: 'shape' };
  }
  const doc = structuredClone(given);
  const top = middle[1] - (chain.length - 1) / 2;
  const spot = (i) => [middle[0], top + i];
  const added = [];
  const sides = new Map(); // a centre -> [left group, right group]
  for (const [i, id] of chain.entries()) {
    const groups = [...groupsAt.get(id)];
    Object.assign(doc.atoms.get(id), { x: spot(i)[0], y: spot(i)[1] });
    delete doc.atoms.get(id).hSide; // (a label at an end written forwards, CHO, not OHC)
    if ((i === 0 || i === chain.length - 1) && wanted.has(id) && groups.length >= 2) {
      // a stereocentre at an end of the main chain (ephedrine's C1, with its phenyl): the vertical line goes on
      // through its largest carbon group (else its largest), the other two left and right, as books draw it
      const s = i === 0 ? -1 : 1;
      const size = (g) => (given.atoms.get(g.root).el === 'C' ? 1000 : 0) + g.members.length;
      const on = groups.filter((g) => g.order === 1).sort((p, q) => size(q) - size(p))[0];
      const rest = groups.filter((g) => g !== on);
      if (!on || rest.length > 2 || rest.some((g) => g.order !== 1)) return { error: 'shape' };
      while (rest.length < 2) {
        const h = addAtom(doc, 0, 0, 'H');
        addBond(doc, id, h.id);
        added.push(h.id);
        rest.unshift({ root: h.id, added: true, members: [h.id] });
      }
      place(doc, on, id, spot(i), [0, s]);
      sides.set(id, rest);
      place(doc, rest[0], id, spot(i), [-1, 0]);
      place(doc, rest[1], id, spot(i), [1, 0]);
      continue;
    }
    if (i === 0 || i === chain.length - 1) {
      const s = i === 0 ? -1 : 1;
      const fans = { 1: [[0, s]], 2: [[-0.87, s * 0.5], [0.87, s * 0.5]], 3: [[-1, 0], [0, s], [1, 0]] }[groups.length];
      if (groups.length && !fans) return { error: 'shape' };
      groups.forEach((g, k) => place(doc, g, id, spot(i), fans[k]));
      continue;
    }
    if (groups.length === 1 && groups[0].order === 2) {
      place(doc, groups[0], id, spot(i), [1, 0]); // (a C=O in the chain: the O on the right, no centre)
      continue;
    }
    if (groups.length > 2 || groups.some((g) => g.order !== 1)) return { error: 'shape' };
    // (implicit hydrogens drawn: a crossing has four bonds)
    while (groups.length < 2) {
      const h = addAtom(doc, 0, 0, 'H');
      addBond(doc, id, h.id);
      added.push(h.id);
      groups.unshift({ root: h.id, added: true, members: [h.id] });
    }
    sides.set(id, groups);
    place(doc, groups[0], id, spot(i), [-1, 0]);
    place(doc, groups[1], id, spot(i), [1, 0]);
  }
  // no wedges at the chain (its centres' bonds are read as the projection's), no depth from a 3D view
  for (const bond of doc.bonds.values()) {
    if (!inChain.has(bond.a) && !inChain.has(bond.b)) continue;
    bond.stereo = '';
    delete bond.z;
  }
  for (const id of sides.keys()) doc.atoms.get(id).projection = 'fischer';
  // each centre's groups the way round that keeps its R/S
  const all = [...ids, ...added];
  const got = nowOf(RDKit, doc, all).cip;
  for (const [id, [left, right]] of sides) {
    if (!wanted.has(id) || wanted.get(id) === got.get(id)) continue;
    const i = chain.indexOf(id);
    place(doc, right, id, spot(i), [-1, 0]);
    place(doc, left, id, spot(i), [1, 0]);
  }
  if (nowOf(RDKit, doc, all).smiles !== want.smiles) return { error: 'stereo' };
  // the chain's ends written as the templates write them (CHO, CH2OH, CO2H, CH3): their atoms one label
  const removed = [];
  for (const [end, next] of [[chain[0], chain[1]], [chain.at(-1), chain.at(-2)]]) {
    const name = endLabel(doc, end, next);
    const atom = doc.atoms.get(end);
    if (name === 'CH3') atom.endLabel = true;
    if (!name || name === 'CH3') continue;
    for (const group of groupsAt.get(end)) {
      for (const id of group.members) {
        for (const [bid, bond] of doc.bonds) if (bond.a === id || bond.b === id) doc.bonds.delete(bid);
        doc.atoms.delete(id);
        removed.push(id);
      }
    }
    Object.assign(atom, { el: '*', alias: name, hCount: null });
  }
  const kept = all.filter((id) => doc.atoms.has(id));
  keepPlace(given, doc, kept);
  return { doc, atoms: kept, removed, added, centres: [...sides.keys()] };
}

const turned = ([x, y], degrees) => {
  const r = (degrees * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

export async function toZigzag(RDKit, given, start) {
  const plan = chainPlan(RDKit, given, start);
  if (plan.error) return plan;
  const { ids, chain, inChain, groupsAt, place, middle, want, wanted } = plan;
  const doc = structuredClone(given);
  const n = chain.length;
  // C1 on the left, the corners up and down in turn (a bond 1 long, 120° at each corner)
  const spot = (i) => [middle[0] + (i - (n - 1) / 2) * 0.866, middle[1] + (i % 2 ? -0.25 : 0.25)];
  const removed = [];
  const wedged = new Map(); // a stereocentre -> its bonds that may carry a wedge
  for (const [i, id] of chain.entries()) {
    const atom = doc.atoms.get(id);
    Object.assign(atom, { x: spot(i)[0], y: spot(i)[1] });
    delete atom.projection; // (no longer a Fischer projection's centre)
    delete atom.hSide;
    // (the drawn hydrogens on the chain left out, as a zigzag is drawn: those that are only an H)
    const groups = groupsAt.get(id).filter((g) => {
      const h = given.atoms.get(g.root);
      const bare = g.members.length === 1 && h.el === 'H' && !h.isotope && !h.charge && g.order === 1;
      if (bare) removed.push(g.root);
      return !bare;
    });
    let dirs;
    if (i === 0 || i === n - 1) {
      const inner = spot(i === 0 ? 1 : n - 2);
      const back = [inner[0] - spot(i)[0], inner[1] - spot(i)[1]];
      const on = i === 0 ? spot(-1) : spot(n); // (where the chain would go on)
      dirs = { 0: [], 1: [[on[0] - spot(i)[0], on[1] - spot(i)[1]]], 2: [turned(back, 120), turned(back, -120)], 3: [turned(back, 90), turned(back, 180), turned(back, 270)] }[groups.length];
    } else {
      const out = i % 2 ? [0, -1] : [0, 1];
      dirs = { 0: [], 1: [out], 2: [turned(out, -35), turned(out, 35)] }[groups.length];
    }
    if (!dirs) return { error: 'shape' };
    groups.forEach((g, k) => place(doc, g, id, spot(i), dirs[k]));
    if (wanted.has(id)) wedged.set(id, groups.filter((g) => g.order === 1).map((g) => g.bond));
  }
  for (const id of removed) {
    for (const [bid, bond] of doc.bonds) if (bond.a === id || bond.b === id) doc.bonds.delete(bid);
    doc.atoms.delete(id);
  }
  // no wedges from before at the chain, nor depth from a 3D view; then a wedge on each stereocentre (two groups:
  // a wedge and a hashed wedge), its narrow end there
  for (const bond of doc.bonds.values()) {
    if (!inChain.has(bond.a) && !inChain.has(bond.b)) continue;
    bond.stereo = '';
    delete bond.z;
  }
  const mark = (centre, bondId, stereo) => {
    const bond = doc.bonds.get(bondId);
    if (bond.a !== centre) [bond.a, bond.b] = [bond.b, bond.a];
    bond.stereo = stereo;
  };
  // (at an end of the chain, a centre with three bonds drawn: one wedge, as a wedge and a hashed wedge there would
  // leave its side unsaid)
  const ends = new Set([chain[0], chain.at(-1)]);
  for (const [id, bonds] of wedged) bonds.slice(0, ends.has(id) ? 1 : 2).forEach((b, k) => mark(id, b, k ? 'hash' : 'wedge'));
  const all = ids.filter((id) => doc.atoms.has(id));
  const got = nowOf(RDKit, doc, all).cip;
  for (const [id, bonds] of wedged) {
    if (wanted.get(id) === got.get(id)) continue;
    for (const b of bonds.slice(0, 2)) if (doc.bonds.get(b).stereo) doc.bonds.get(b).stereo = doc.bonds.get(b).stereo === 'wedge' ? 'hash' : 'wedge';
  }
  if (nowOf(RDKit, doc, all).smiles !== want.smiles) return { error: 'stereo' };
  keepPlace(given, doc, all);
  return { doc, atoms: all, removed, added: [], centres: [...wedged.keys()] };
}

// What a chain's end (`end`, bonded on to `next`) is written as, if it is one of the groups the templates write
// as a label: CHO, CH2OH, CO2H, CO2Me, CN, CH3 (else null)
function endLabel(doc, end, next) {
  const atom = doc.atoms.get(end);
  if (atom.el !== 'C' || atom.charge || atom.isotope || atom.alias) return null;
  const byAtom = bondsByAtom(doc);
  const heavy = (id, not) => byAtom.get(id).filter((b) => covalent(b) && otherEnd(b, id) !== not && doc.atoms.get(otherEnd(b, id)).el !== 'H');
  const plain = (id) => !doc.atoms.get(id).charge && !doc.atoms.get(id).isotope && !doc.atoms.get(id).alias;
  const groups = heavy(end, next).map((b) => {
    const id = otherEnd(b, end);
    const on = heavy(id, end);
    const methyl = on.length === 1 && doc.atoms.get(otherEnd(on[0], id)).el === 'C' && heavy(otherEnd(on[0], id), id).length === 0 && on[0].order === 1;
    return { el: doc.atoms.get(id).el, order: b.order, rest: on.length, methyl, plain: plain(id) };
  });
  if (!groups.every((g) => g.plain)) return null;
  const is = (...want) => groups.length === want.length && want.every((w) => groups.some((g) => g.el === w[0] && g.order === w[1] && (w[2] === 'Me' ? g.methyl : g.rest === 0)));
  if (!groups.length) return 'CH3';
  if (is(['O', 2])) return 'CHO';
  if (is(['O', 1])) return 'CH2OH';
  if (is(['O', 2], ['O', 1])) return 'CO2H';
  if (is(['O', 2], ['O', 1, 'Me'])) return 'CO2Me';
  if (is(['N', 3])) return 'CN';
  return null;
}
