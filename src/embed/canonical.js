// A curved-arrow step as one string, the same for every drawing of the same answer: whichever of equivalent atoms
// an arrow uses (any of a tert-butyl's three methyls, any H of H₃O⁺), in whatever order the arrows were drawn, by
// whatever atom ids, however laid out, with hydrogens no arrow uses drawn out or not. For a page that checks: the student's get('canonicalForms') against the answer's.
// (Data, not a check: what counts as right, another valid mechanism, a resonance form, is the page's to say.)
//
// How: the molecules as a graph, each curved arrow added to it as two atoms of its own, a tail bonded to where the
// electrons come from (an atom with a lone pair or an unpaired electron, or a bond's two atoms) and a head bonded
// to where they go (an atom, a bond's two atoms, the two atoms of a new bond), the tail bonded to its head, what kind
// of end each is in their isotopes; then RDKit's canonical SMILES of the whole, which numbers a graph the same
// whatever its symmetry. Not a molecule anyone could make (a carbon with five neighbours): read without RDKit's
// checks, written as it stands. A hydrogen drawn as an atom that no arrow uses is left out, as implicit ones are
// (for each arrow alone: one that arrow doesn't use).
//
// Stereo: equivalent means equivalent as drawn in 3D, not only as a graph. Where a molecule has stereo drawn (wedges,
// a chair, a Newman or Fischer projection) or a double bond, each of its atoms gets a class: RDKit's isomeric SMILES
// of the molecule with that atom alone labelled, or of its mirror image if that one comes first. Atoms of one class
// are interchangeable (the three H of a methyl; C2's and C6's axial H of a bromocyclohexane chair, mirror images of
// each other); others are not (C2's axial H, anti to an axial Br, and its equatorial one). The classes, ranked, go
// into the graph with each atom (as its atom map number). Stereo not drawn doesn't count: the two H of a CH2 next to a flat-drawn centre
// stay alike. (A bare cyclohexane chair's axial and equatorial H are alike too: a conformation, not a configuration.)
//
// canonicalForms(doc, RDKit, sides) → { step, curvedArrows, products }; sides: { step, products }, atom ids (sides.js):
//   step: the step's molecules (before the reaction arrow; all, without one) with every curved arrow;
//   curvedArrows: each arrow alone on them (in get('curvedArrows') order), to say which arrows are right whatever the others;
//   products: the molecules after the reaction arrow as canonical SMILES (RDKit's, sorted, joined by "."), or null.
// (RDKit and the sides given: this works in Node too, for the tests)
import { writeMolfile } from '../io/molfile.js';
import { fragments } from '../model/graph.js';
import { bondsByAtom } from '../model/doc.js';
import { electronsOf } from '../chem/valence.js';
import { atomicNumber } from '../chem/elements.js';
import { formulaOf, formulaText } from '../chem/formula.js';
import { arrowsOf } from './arrows.js';

const TAIL = 'Lv'; // (elements no drawing has)
const HEAD = 'Ts';
const FROM = { lonePair: 1, unpairedElectron: 2, bond: 3, orbital: 4 };
const TO = { atom: 1, bond: 2, newBond: 3, orbital: 4 };

// an abbreviation or label (Ph, OMe, Nu) as an atom of its own kind: a dummy, its isotope from its text
const labelIsotope = (text) => 1 + ([...text].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7) % 900);

const pad = (value, width) => String(value).padStart(width);

const LABEL = 900; // (an isotope no atom has: the one atom told apart)

// Each atom's stereo class in its molecule (above): Map id -> rank (1, 2, …), the ranks in the order of the classes'
// strings, so the same for every drawing of the molecule; none for molecules without stereo or RDKit couldn't read
function stereoKeys(doc, ids, RDKit) {
  const inStep = new Set(ids);
  const keyed = new Map(); // id -> its key
  for (const members of fragments(doc)) {
    if (!members.every((id) => inStep.has(id))) continue;
    // (only molecules with stereo drawn or a double bond: in the rest, symmetry is the graph's, which the canonical
    // SMILES already numbers)
    let lines;
    try {
      lines = writeMolfile(doc, members, '', { sided: 'wedges' }).molfile.split('\n');
    } catch {
      continue;
    }
    const count = parseInt(lines[3].slice(0, 3), 10);
    const bondLines = lines.slice(4 + count, 4 + count + parseInt(lines[3].slice(3, 6), 10));
    if (!bondLines.some((line) => line.slice(6, 9).trim() === '2' || line.slice(9, 12).trim() !== '0')) continue;
    const keys = labelledKeys(doc, members, RDKit);
    if (keys) for (const [id, key] of keys) keyed.set(id, key);
  }
  return keyed;
}

// The class of each atom a form writes (`kept`) as a number of its own key, not a rank among the keys written: so
// a drawn H left out or not leaves every other number as it is, and the one H an arrow uses keeps its own (an axial
// H's number is never an equatorial one's, whichever other H are drawn)
const classNumber = (key) => 1 + ([...key].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261) % 2147483646);
const classesOf = (keyed, kept) => new Map(kept.filter((id) => keyed.has(id)).map((id) => [id, classNumber(keyed.get(id))]));

// A hydrogen drawn as an atom that none of a form's arrows uses (`used`: their atoms), with nothing of its own (no
// charge, isotope, unpaired electron or label) on one plain single bond to an atom not an H: left out of the graph,
// as an implicit H is, so the string is the same whether the student drew it or not
function foldable(doc, byAtom, id, used) {
  const atom = doc.atoms.get(id);
  if (atom.el !== 'H' || atom.alias || atom.charge || atom.isotope || atom.radical || used.has(id)) return false;
  const bonds = byAtom.get(id) ?? [];
  if (bonds.length !== 1 || bonds[0].kind || (bonds[0].order ?? 1) !== 1) return false;
  return doc.atoms.get(bonds[0].a === id ? bonds[0].b : bonds[0].a)?.el !== 'H';
}

// The atoms an arrow's end is at: a bond's or a new bond's two, or the one atom
const endAtoms = (end) => end.bond ?? end.newBond ?? [end.lonePair ?? end.unpairedElectron ?? end.atom];

// Every atom's class, stereo as drawn, for a page asking which atoms are alike (get('atomClasses'): "click the most
// acidic H" right whichever of equivalent H): Map id -> a short string, the same for atoms alike (the three H of a
// methyl; mirror images in a molecule that is its own mirror image; the same atom of two molecules alike), another
// for the rest. The string is the molecule's isomeric SMILES with that atom alone labelled (or its mirror image's,
// whichever comes first), hashed. A molecule RDKit can't read: each of its atoms a class of its own.
export function atomClasses(doc, RDKit) {
  const classes = new Map();
  const hash = (text) => [...text].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261).toString(36);
  for (const members of fragments(doc)) {
    const keys = labelledKeys(doc, members, RDKit);
    for (const id of members) classes.set(id, keys ? hash(keys.get(id)) : `atom${id}`);
  }
  return classes;
}

// One molecule's atoms as keys: Map id -> the isomeric SMILES with that atom labelled, or its mirror image's (the
// first of the two); null if RDKit can't read it
function labelledKeys(doc, members, RDKit) {
  let written;
  try {
    // (a chair's CH2 with its wedge too: its axial H told from its equatorial one once one of them is labelled)
    written = writeMolfile(doc, members, '', { sided: 'wedges' });
  } catch {
    return null;
  }
  const all = written.molfile.split('\n');
  const mirrored = (lines) => {
    const count = parseInt(lines[3].slice(0, 3), 10);
    return lines.map((line, k) => (k >= 4 && k < 4 + count ? (-parseFloat(line.slice(0, 10))).toFixed(4).padStart(10) + line.slice(10) : line));
  };
  const smiles = (source, at, isotope) => {
    const label = `M  ISO  1${pad(at + 1, 4)}${pad(LABEL + isotope, 4)}`;
    // (hydrogens wedged at a stereocentre taken off once their wedges are read, as implicit ones; the labelled one
    // stays, an isotope)
    const mol = RDKit.get_mol([...source.slice(0, -1), label, 'M  END'].join('\n'), JSON.stringify({ removeHs: true }));
    if (!mol) return null;
    try {
      return mol.get_smiles();
    } finally {
      mol.delete();
    }
  };
  // (every key read without the plain drawn H but the one labelled: an atom's key the same whether its H are drawn
  // or not)
  const base = withoutDrawnHs(all, -1);
  const keys = written.atomIds.map((id, k) => {
    const version = !base ? { lines: all, at: new Map([[k, k]]) } : base.at.has(k) ? base : withoutDrawnHs(all, k);
    const at = version.at.get(k);
    const isotope = doc.atoms.get(id).isotope ?? 0;
    return [smiles(version.lines, at, isotope), smiles(mirrored(version.lines), at, isotope)].sort()[0];
  });
  if (keys.some((key) => !key)) return null;
  return new Map(written.atomIds.map((id, k) => [id, keys[k]]));
}

// A V2000 molfile (its lines) without its plain drawn hydrogens but the atom `keep` (an index): an H with no
// charge, isotope or unpaired electron on one single bond to an atom not an H and without a wedge. RDKit reads such an H
// beside an implicit one as a double bond's stereo (propene with one H of its CH2 drawn), and keeps it; left out,
// it is an implicit H, as in the drawing without it. → { lines, at: Map old index -> new }, or null for a molfile
// with more in it than atoms, bonds, charges, unpaired electrons and isotopes.
function withoutDrawnHs(lines, keep) {
  const count = parseInt(lines[3].slice(0, 3), 10);
  const bondCount = parseInt(lines[3].slice(3, 6), 10);
  const atomLines = lines.slice(4, 4 + count);
  const bondLines = lines.slice(4 + count, 4 + count + bondCount);
  const rest = lines.slice(4 + count + bondCount);
  if (rest.some((line) => !/^M {2}(CHG|RAD|ISO|END)/.test(line))) return null;
  const entries = (line) => Array.from({ length: parseInt(line.slice(6, 9), 10) }, (_, i) => [parseInt(line.slice(9 + 8 * i, 13 + 8 * i), 10) - 1, parseInt(line.slice(13 + 8 * i, 17 + 8 * i), 10)]);
  const named = new Set(rest.filter((line) => line !== 'M  END').flatMap((line) => entries(line).map(([atom]) => atom)));
  const el = (k) => atomLines[k].slice(31, 34).trim();
  const bonds = bondLines.map((line) => [parseInt(line.slice(0, 3), 10) - 1, parseInt(line.slice(3, 6), 10) - 1, parseInt(line.slice(6, 9), 10), parseInt(line.slice(9, 12), 10)]);
  // (atoms with a wedge keep their H: RDKit reads such a centre from every bond drawn, as a Newman projection's,
  // whose carbons lie on each other, needs it; and takes them off itself once read)
  const wedged = new Set(bonds.filter(([, , , stereo]) => stereo).flatMap(([a, b]) => [a, b]));
  const drop = new Set();
  for (let k = 0; k < count; k++) {
    if (k === keep || el(k) !== 'H' || named.has(k)) continue;
    const mine = bonds.filter(([a, b]) => a === k || b === k);
    if (mine.length !== 1) continue;
    const [a, b, order] = mine[0];
    const atom = a === k ? b : a;
    if (order === 1 && !wedged.has(k) && !wedged.has(atom) && el(atom) !== 'H') drop.add(k);
  }
  const at = new Map();
  for (let k = 0; k < count; k++) if (!drop.has(k)) at.set(k, at.size);
  const keptBonds = bonds.map((bond, k) => [bond, bondLines[k]]).filter(([[a, b]]) => at.has(a) && at.has(b));
  const out = [...lines.slice(0, 3), `${pad(at.size, 3)}${pad(keptBonds.length, 3)}${lines[3].slice(6)}`];
  for (let k = 0; k < count; k++) if (at.has(k)) out.push(atomLines[k]);
  for (const [[a, b], line] of keptBonds) out.push(`${pad(at.get(a) + 1, 3)}${pad(at.get(b) + 1, 3)}${line.slice(6)}`);
  for (const line of rest) {
    if (line === 'M  END') continue;
    const list = entries(line).filter(([atom]) => at.has(atom));
    if (list.length) out.push(`${line.slice(0, 6)}${pad(list.length, 3)}${list.map(([atom, value]) => `${pad(at.get(atom) + 1, 4)}${pad(value, 4)}`).join('')}`);
  }
  out.push('M  END');
  return { lines: out, at };
}

// Each molecule's canonical SMILES (RDKit's, isomeric, hydrogens drawn out or not alike), in the drawing's order:
// to compare molecules where bond orders and charges count (resonance forms), which InChIKeys don't tell apart
export function canonicalSmilesOf(doc, RDKit) {
  return fragments(doc).map((members) => {
    try {
      return canonicalSmiles(RDKit, writeMolfile(doc, members).molfile, { removeHs: true }) ?? '?';
    } catch {
      return '?';
    }
  });
}

// Each molecule as a page checking answers asks about it (get('molecules')), in the drawing's order: { atoms: ids, smiles (as
// canonicalSmilesOf), lewis (the same, with the lone pairs shown on each atom and its δ+ or δ− counted: a Lewis
// structure's), pairs (with the lone pairs alone), formula ("C4H10O", with its charge: "NO3-"), chiral (true: not its own mirror image as drawn; drawn
// flat, true where it has a stereocentre, one of its stereoisomers chiral then; false; null: unread), contains (with a
// `group`, { doc, ids }: whether the molecule has those atoms of that drawing, bonded so, groupSmarts: an ester) }.
// `drawOut` (async: a doc and atom ids → { doc, ids }, the bridge's): abbreviations (CHO, OMe) drawn out first, so a
// label and the atoms it stands for are the same molecule.
export async function moleculeFacts(doc, RDKit, group = null, drawOut = async (d, ids) => ({ doc: d, ids })) {
  const byAtom = bondsByAtom(doc);
  let query = null;
  if (group?.ids.length) {
    try {
      query = RDKit.get_qmol(groupSmarts(group.doc, group.ids));
    } catch {
      query = null;
    }
  }
  try {
    const all = [];
    for (const members of fragments(doc)) all.push(await one(members));
    return all;
  } finally {
    query?.delete();
  }
  async function one(members) {
    {
      const facts = { atoms: members, smiles: '?', lewis: '?', pairs: '?', formula: '', chiral: null, contains: null };
      try {
        const { formula, charge } = formulaOf(doc, members);
        facts.formula = formulaText(formula) + (charge ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '-'}` : '');
      } catch {
        // (a label olomol doesn't know: no formula)
      }
      let written;
      const out = await drawOut(doc, members);
      const drawn = out.doc;
      try {
        written = writeMolfile(drawn, out.ids);
      } catch {
        return facts;
      }
      facts.smiles = canonicalSmiles(RDKit, written.molfile, { removeHs: true }) ?? '?';
      // (each atom's lone pairs shown and δ as its atom map number: the canonical SMILES counts them, alike atoms alike)
      const shown = (atom, deltas) => {
        const want = atom.lonePairs;
        const pairs = want === null || want === undefined ? 0 : want === 'auto' ? electronsOf(atom, (drawn === doc ? byAtom : bondsByAtom(drawn)).get(atom.id)).lonePairs : Math.min(want, 4);
        const delta = !deltas ? 0 : atom.partialCharge > 0 ? 1 : atom.partialCharge < 0 ? 2 : 0;
        return pairs || delta ? 1 + pairs * 3 + delta : 0;
      };
      const labelled = (deltas) => {
        const lines = written.molfile.split('\n');
        written.atomIds.forEach((id, k) => {
          const map = shown(drawn.atoms.get(id), deltas);
          if (map) lines[4 + k] = lines[4 + k].slice(0, 60).padEnd(60) + pad(map, 3) + lines[4 + k].slice(63);
        });
        return canonicalSmiles(RDKit, lines.join('\n'), { removeHs: true }) ?? '?';
      };
      facts.lewis = labelled(true);
      facts.pairs = labelled(false); // (the lone pairs alone: which of the two is off, told)
      const mol = RDKit.get_mol(written.molfile);
      if (!mol) return facts;
      try {
        const isomeric = mol.get_smiles();
        if (isomeric.includes('@')) {
          const mirrored = RDKit.get_mol(isomeric.replace(/@@?/g, (m) => (m === '@' ? '@@' : '@')));
          try {
            facts.chiral = mirrored ? mirrored.get_smiles() !== isomeric : null;
          } finally {
            mirrored?.delete();
          }
        } else facts.chiral = JSON.parse(mol.get_descriptors()).NumAtomStereoCenters > 0;
        if (query) facts.contains = mol.get_substruct_match(query) !== '{}';
      } finally {
        mol.delete();
      }
      return facts;
    }
  }
}

// A group of a molecule (`ids`, picked in it) as SMARTS, to find it in others: its atoms by element and charge, a
// heteroatom with as many H as it has in the molecule (an alcohol's O–H is no ether's O, an ester's O no acid's
// however little of it is picked), a carbon with any; its bonds by order, single and double ones aromatic too (a
// phenyl drawn either Kekulé way); labels as any atom. Hydrogens drawn as atoms count as their atom's H.
export function groupSmarts(doc, ids) {
  const byAtom = bondsByAtom(doc);
  const keep = new Set(ids.filter((id) => doc.atoms.has(id) && doc.atoms.get(id).el !== 'H'));
  const covalent = (b) => !b.kind || b.kind === 'dative';
  const hydrogens = (a) => electronsOf(a, byAtom.get(a.id) ?? []).hydrogens + (byAtom.get(a.id) ?? []).filter((b) => covalent(b) && doc.atoms.get(b.a === a.id ? b.b : b.a)?.el === 'H').length;
  const atomSmarts = (id) => {
    const a = doc.atoms.get(id);
    if (a.alias || a.el === '*') return '*';
    const parts = [`#${atomicNumber(a.el)}`];
    if (a.el !== 'C') parts.push(`H${hydrogens(a)}`);
    parts.push(a.charge ? `${a.charge > 0 ? '+' : '-'}${Math.abs(a.charge)}` : '+0');
    return `[${parts.join(';')}]`;
  };
  const bondSmarts = (b) => (b.order === 3 ? '#' : b.order === 2 ? '=,:' : '-,:');
  const near = (id) => (byAtom.get(id) ?? []).filter((b) => covalent(b) && keep.has(b.a) && keep.has(b.b));
  const other = (b, id) => (b.a === id ? b.b : b.a);
  // (a spanning tree; the bonds left over close rings)
  const seen = new Set();
  const tree = new Set();
  const closures = new Map();
  const walk = (id) => {
    seen.add(id);
    for (const b of near(id)) {
      if (tree.has(b.id) || closures.has(b.id)) continue;
      if (seen.has(other(b, id))) closures.set(b.id, closures.size + 1);
      else { tree.add(b.id); walk(other(b, id)); }
    }
  };
  const opened = new Set();
  const write = (id, from) => {
    let text = atomSmarts(id);
    for (const b of near(id).filter((x) => closures.has(x.id))) {
      const digit = closures.get(b.id) > 9 ? `%${closures.get(b.id)}` : String(closures.get(b.id));
      text += opened.has(b.id) ? digit : `${bondSmarts(b)}${digit}`;
      opened.add(b.id);
    }
    const next = near(id).filter((b) => tree.has(b.id) && b.id !== from);
    next.forEach((b, k) => {
      const part = `${bondSmarts(b)}${write(other(b, id), b.id)}`;
      text += k < next.length - 1 ? `(${part})` : part;
    });
    return text;
  };
  const parts = [];
  for (const id of keep) {
    if (seen.has(id)) continue;
    walk(id);
    parts.push(write(id, null));
  }
  return parts.join('.');
}

// The atoms `ids` (and the bonds among them) with `arrows` (arrows.js), as a V3000 molfile RDKit reads unchecked;
// `classes`: their stereo classes, as atom map numbers (which RDKit's canonical order counts)
function graphMolfile(doc, ids, arrows, classes = new Map()) {
  const index = new Map(ids.map((id, k) => [id, k + 1]));
  const atoms = ids.map((id) => {
    const a = doc.atoms.get(id);
    const label = a.el === '*' || a.alias;
    return { el: label ? '*' : a.el, charge: a.charge ?? 0, isotope: label ? labelIsotope(a.alias ?? '*') : a.isotope ?? 0, radical: a.radical ?? 0, map: classes.get(id) ?? 0 };
  });
  const bonds = [];
  for (const b of doc.bonds.values()) {
    if (b.kind === 'link' || !index.has(b.a) || !index.has(b.b)) continue;
    bonds.push([index.get(b.a), index.get(b.b), Math.min(3, Math.max(1, b.order ?? 1))]);
  }
  const ends = (end) => endAtoms(end).filter((id) => index.has(id));
  for (const arrow of arrows) {
    // (an orbital end also names its atom, arrows.js: an orbital's, whatever else it has)
    const kindOf = (kinds, end) => (end.orbital !== undefined ? 'orbital' : Object.keys(kinds).find((key) => end[key] !== undefined));
    const fromKind = kindOf(FROM, arrow.from);
    const toKind = kindOf(TO, arrow.to);
    atoms.push({ el: TAIL, charge: 0, isotope: arrow.electrons * 10 + FROM[fromKind], radical: 0 });
    const tail = atoms.length;
    atoms.push({ el: HEAD, charge: 0, isotope: TO[toKind], radical: 0 });
    const head = atoms.length;
    bonds.push([tail, head, 1]);
    for (const id of ends(arrow.from)) bonds.push([tail, index.get(id), 1]);
    for (const id of ends(arrow.to)) bonds.push([head, index.get(id), 1]);
  }
  // (V3000: an atom's class number is larger than V2000's three places hold)
  const lines = ['', '  olomol canonical', '', '  0  0  0     0  0            999 V3000', 'M  V30 BEGIN CTAB', `M  V30 COUNTS ${atoms.length} ${bonds.length} 0 0 0`, 'M  V30 BEGIN ATOM'];
  atoms.forEach((a, k) => {
    const props = [a.charge && `CHG=${a.charge}`, a.radical && `RAD=${a.radical}`, a.isotope && `MASS=${a.isotope}`].filter(Boolean);
    lines.push(`M  V30 ${k + 1} ${a.el} 0 0 0 ${a.map ?? 0}${props.map((x) => ` ${x}`).join('')}`);
  });
  lines.push('M  V30 END ATOM', 'M  V30 BEGIN BOND');
  bonds.forEach(([a, b, order], k) => lines.push(`M  V30 ${k + 1} ${order} ${a} ${b}`));
  lines.push('M  V30 END BOND', 'M  V30 END CTAB');
  lines.push('M  END');
  return lines.join('\n');
}

function canonicalSmiles(RDKit, molfile, details) {
  const mol = RDKit.get_mol(molfile, JSON.stringify(details));
  if (!mol) return null;
  try {
    return mol.get_smiles();
  } finally {
    mol.delete();
  }
}

export function canonicalForms(doc, RDKit, { step = [...doc.atoms.keys()], products = null } = {}) {
  const arrows = arrowsOf(doc);
  const raw = { sanitize: false, removeHs: false };
  const keyed = stereoKeys(doc, step, RDKit);
  const byAtom = bondsByAtom(doc);
  const form = (list) => {
    const used = new Set(list.flatMap((arrow) => [...endAtoms(arrow.from), ...endAtoms(arrow.to)]));
    const kept = step.filter((id) => !foldable(doc, byAtom, id, used));
    return canonicalSmiles(RDKit, graphMolfile(doc, kept, list, classesOf(keyed, kept)), raw);
  };
  let productSmiles = null;
  if (products?.length) {
    const inProducts = new Set(products);
    productSmiles = fragments(doc).filter((members) => members.some((id) => inProducts.has(id))).map((members) => {
      try {
        return canonicalSmiles(RDKit, writeMolfile(doc, members).molfile, { removeHs: true }) ?? '?';
      } catch {
        return '?';
      }
    }).sort().join('.');
  }
  const curvedArrows = arrows.map((arrow) => form([arrow]));
  // (arrows: curvedArrows by its name before 0.6.0, for pages written then; gone with 0.6.0's release)
  return { step: form(arrows), curvedArrows, arrows: curvedArrows, products: productSmiles };
}
