// ChemDraw's CDXML read through Indigo, with what Indigo leaves out kept:
// - a label ChemDraw couldn't read as atoms (NodeType "Unspecified": SiR3), which Indigo
//   makes the one atom it found inside (Si, filled up with hydrogens): kept as a label;
// - the hydrogens ChemDraw says an atom with a label has (NumHydrogens), which Indigo works out
//   again (a lone "C" with none became CH4). Each such atom gets a mark Indigo passes on (an
//   isotope no atom has), and the count is set where it differs from what olomol works out.
//   Hydrogen keeps no such mark (Indigo keeps only D and T there): a hydrogen atom is found by
//   its place instead, where Indigo put ChemDraw's places worked out from the marked atoms (a
//   lone D with none stays D, not HD).
import { bondsByAtom, deleteObjects } from '../model/doc.js';
import { medianBondLength } from '../layout/geometry.js';
import { electronsOf } from '../chem/valence.js';

const MARK = 900000; // the first mark (an isotope); the next ones count up from it

// Whether this text is a CDXML file.
export const isCdxml = (text) => /^\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE[^>]*>\s*)?<CDXML\b/.test(text);

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Where the element that starts at `start` (`<tag ...>`, not self-closing) ends: the index past its `</tag>`.
function closing(text, tag, start) {
  const pattern = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, 'g');
  pattern.lastIndex = start;
  let depth = 0;
  for (let m; (m = pattern.exec(text));) {
    if (m[0].startsWith('</')) depth -= 1;
    else if (!m[1]) depth += 1;
    if (depth === 0) return pattern.lastIndex;
  }
  return text.length;
}

// Labels ChemDraw couldn't read as atoms: generic labels for Indigo (NodeType "GenericNickname",
// which it keeps as written), without the atoms ChemDraw found inside.
function keepLabels(text) {
  let out = '';
  let from = 0;
  // (also an alternative group, a list of what may stand there, which ChemDraw shows by its name: NaHMDS, LiCl)
  const pattern = /<n\b([^>]*?\bNodeType="(?:Unspecified|AnonymousAlternativeGroup)"[^>]*?)>/g;
  for (let m; (m = pattern.exec(text));) {
    if (m[1].endsWith('/')) continue; // (no label)
    const end = closing(text, 'n', m.index);
    let body = text.slice(pattern.lastIndex, end - '</n>'.length);
    for (let at; (at = body.search(/<fragment\b/)) >= 0;) body = body.slice(0, at) + body.slice(closing(body, 'fragment', at));
    const label = unescape([...body.matchAll(/<s\b[^>]*>([^<]*)<\/s>/g)].map((s) => s[1]).join('')).trim() || unescape(/\bGenericNickname="([^"]*)"/.exec(m[1])?.[1] ?? '').trim();
    if (!label) continue;
    const attrs = m[1].replace(/\s*\bNodeType="[^"]*"/, '').replace(/\s*\bElement="\d+"/, '').replace(/\s*\bGenericNickname="[^"]*"/, '');
    out += `${text.slice(from, m.index)}<n${attrs} NodeType="GenericNickname" GenericNickname="${escape(label)}">${body}</n>`;
    from = end;
    pattern.lastIndex = end;
  }
  return out + text.slice(from);
}

// The CDXML text for Indigo, and what was marked: { text, marks: Map mark -> { hydrogens, isotope, p },
// hydrogens: [{ p, hydrogens }] (ChemDraw's hydrogen atoms that say theirs, found by their places) }.
// With such hydrogens every other atom is marked too, its places to work out Indigo's from (hydrogens
// null: its own count left to olomol).
// (private-use characters: in no file)
const UP = ['\uE0A1', '\uE0A2'];

export function prepareCdxml(text) {
  // (a caption with a superscript, H⁺, NAD⁺: Indigo leaves the whole of it out; the superscript runs written plain
  // between two marks, a superscript again after reading: takeCdxmlMarks)
  // (captions only, not an atom's label inside its <n>: one pass, counting the nodes open)
  let depth = 0;
  const raised = text.replace(/<n\b[^>]*?(\/?)>|<\/n>|<t\b[\s\S]*?<\/t>/g, (tag, closed) => {
    if (tag.startsWith('<n')) depth += closed ? 0 : 1;
    else if (tag === '</n>') depth -= 1;
    else if (depth <= 0) {
      return tag.replace(/<s\b([^>]*)>([^<]*)<\/s>/g, (run, attrs, inner) => {
        const face = Number(/\bface="(\d+)"/.exec(attrs)?.[1] ?? 0);
        if (!(face & 64) || (face & 96) === 96) return run;
        return `<s${attrs.replace(/\bface="\d+"/, `face="${face & ~64}"`)}>${UP[0]}${inner}${UP[1]}</s>`;
      });
    }
    return tag;
  });
  const labelled = keepLabels(raised);
  const nodes = /<n\b([^>]*?)(\/?)>/g;
  const place = (attrs) => /\bp="(-?[\d.]+) (-?[\d.]+)"/.exec(attrs)?.slice(1).map(Number) ?? null;
  // (only where the atom has a label, which shows its hydrogens as ChemDraw counts them: an unlabelled
  // corner is drawn plain whatever count the file holds, as atrop1's, made by editing another file)
  const shown = (start, tag, end) => !end && /^\s*<t\b/.test(labelled.slice(start + tag.length, closing(labelled, 'n', start)).replace(/<fragment\b[\s\S]*<\/fragment>/, ''));
  const count = (attrs, start, tag, end) => (shown(start, tag, end) ? /\bNumHydrogens="(\d+)"/.exec(attrs)?.[1] : undefined);
  const hydrogen = (attrs) => /\bElement="1"/.test(attrs) && !/\bNodeType=/.test(attrs);
  const hydrogens = [...labelled.matchAll(nodes)].filter((m) => hydrogen(m[1]) && count(m[1], m.index, m[0], m[2]) !== undefined && place(m[1]))
    .map((m) => ({ p: place(m[1]), hydrogens: Number(count(m[1], m.index, m[0], m[2])) }));
  const marks = new Map();
  const marked = labelled.replace(nodes, (tag, attrs, end, start) => {
    const said = count(attrs, start, tag, end);
    // (not on hydrogen: Indigo keeps no isotope there but D and T; nor on a label, a group or its attachment point)
    if ((said === undefined && !hydrogens.length) || /\bNodeType=/.test(attrs) || hydrogen(attrs)) return tag;
    const isotope = /\bIsotope="(\d+)"/.exec(attrs);
    const mark = MARK + marks.size;
    marks.set(mark, { hydrogens: said === undefined ? null : Number(said), isotope: isotope ? Number(isotope[1]) : null, p: place(attrs) });
    return `<n${attrs.replace(/\s*\bIsotope="\d+"/, '')} Isotope="${mark}"${end}>`;
  });
  return { text: marked, marks, hydrogens };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
};

// Where Indigo put ChemDraw's places: x -> sx * x + bx, y -> sy * y + by, from the marked atoms (pairs of
// [ChemDraw's place, the atom's]), by medians, so that an atom Indigo placed itself (inside a group it drew
// out) doesn't count. Null with too few.
function placing(pairs) {
  const ratios = (k) => pairs.flatMap(([p, q], i) => pairs.slice(i + 1, i + 8).map(([p2, q2]) => (Math.abs(p2[k] - p[k]) > 1 ? (q2[k] - q[k]) / (p2[k] - p[k]) : null))).filter((r) => r !== null);
  const [sx, sy] = [median(ratios(0)), median(ratios(1))];
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  const [bx, by] = [median(pairs.map(([p, q]) => q[0] - sx * p[0])), median(pairs.map(([p, q]) => q[1] - sy * p[1]))];
  return { at: ([x, y]) => [sx * x + bx, sy * y + by], near: 3 * Math.abs(sx) }; // (within 3 points of ChemDraw's)
}

// Right after reading: the marks taken off the atoms of `ids` (their isotopes as they were, before
// anything writes them into a molfile), and ChemDraw's hydrogen atoms found. Returns Map atom id ->
// ChemDraw's hydrogens.
export function takeCdxmlMarks(doc, ids, { marks, hydrogens: placed = [] }) {
  for (const id of ids) {
    const text = doc.texts.get(id);
    if (text?.text.includes(UP[0])) text.text = text.text.replace(new RegExp(`${UP[0]}([^${UP[1]}]*)${UP[1]}`, 'g'), '^{$1}');
  }
  const hydrogens = new Map();
  const pairs = [];
  for (const id of ids) {
    const atom = doc.atoms.get(id);
    if (!atom || !(atom.isotope >= MARK)) continue;
    const mark = marks.get(atom.isotope);
    atom.isotope = mark?.isotope ?? null;
    if (!mark) continue;
    if (mark.p) pairs.push([mark.p, [atom.x, atom.y]]);
    if (mark.hydrogens !== null && atom.el !== '*') hydrogens.set(id, mark.hydrogens);
  }
  if (placed.length) {
    const free = ids.map((id) => doc.atoms.get(id)).filter((atom) => atom?.el === 'H');
    const map = placing(pairs);
    if (map) {
      for (const { p, hydrogens: count } of placed) {
        const [x, y] = map.at(p);
        const nearest = free.reduce((best, atom) => (Math.hypot(atom.x - x, atom.y - y) < (best ? Math.hypot(best.x - x, best.y - y) : map.near) ? atom : best), null);
        if (!nearest) continue;
        hydrogens.set(nearest.id, count);
        free.splice(free.indexOf(nearest), 1);
      }
    } else if (free.length === placed.length) {
      // (no other atoms to place them by: as many as there are, in their order)
      free.forEach((atom, k) => hydrogens.set(atom.id, placed[k].hydrogens));
    }
  }
  return hydrogens;
}

// Once kekulized (the bond orders final): ChemDraw's hydrogens set where they differ from what
// olomol works out (`hydrogens`: from takeCdxmlMarks).
export function applyCdxmlHydrogens(doc, hydrogens) {
  const byAtom = bondsByAtom(doc);
  for (const [id, count] of hydrogens) {
    const atom = doc.atoms.get(id);
    if (!atom) continue;
    atom.hCount = null;
    if (electronsOf(atom, byAtom.get(id) ?? []).hydrogens !== count) atom.hCount = count;
  }
}

// ChemDraw's attachment point: drawn as a molecule of its own, two plain carbons on one wavy bond, laid across
// the free end of a bond ("the rest of the molecule here": TES on a squiggle). Read as that, it would be an
// ethane, and the end it crosses a methyl. The end becomes an R (as olomol writes where a group attaches) and
// the squiggle goes. In place; returns `ids` without the squiggles' atoms and bonds.
export function attachmentPoints(doc, ids) {
  const wanted = new Set(ids);
  const byAtom = bondsByAtom(doc);
  const atoms = [...doc.atoms.values()].filter((atom) => wanted.has(atom.id));
  const bonds = [...doc.bonds.values()].filter((bond) => wanted.has(bond.id) || (wanted.has(bond.a) && wanted.has(bond.b)));
  const places = Object.fromEntries(atoms.map((a) => [a.id, [a.x, a.y]]));
  const unit = medianBondLength(places, bonds.filter((b) => places[b.a] && places[b.b]).map((b) => [b.a, b.b])) || 1;
  const plain = (atom) => atom.el === 'C' && !atom.alias && !atom.charge && !atom.isotope;
  const gone = new Set();
  for (const squiggle of bonds) {
    const [p, q] = [doc.atoms.get(squiggle.a), doc.atoms.get(squiggle.b)];
    if (!p || !q || squiggle.stereo !== 'wavy' || squiggle.order !== 1 || !plain(p) || !plain(q) || byAtom.get(p.id).length !== 1 || byAtom.get(q.id).length !== 1) continue;
    const [mx, my] = [(p.x + q.x) / 2, (p.y + q.y) / 2];
    // the free end it crosses: a plain carbon on one bond, near its middle, the two lines across each other
    const end = atoms.find((atom) => {
      if (atom === p || atom === q || gone.has(atom.id) || !plain(atom) || byAtom.get(atom.id).length !== 1 || Math.hypot(atom.x - mx, atom.y - my) > 0.35 * unit) return false;
      const [bond] = byAtom.get(atom.id);
      const other = doc.atoms.get(bond.a === atom.id ? bond.b : bond.a);
      const [ux, uy] = [atom.x - other.x, atom.y - other.y];
      const [vx, vy] = [q.x - p.x, q.y - p.y];
      return Math.abs(ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1) < 0.6;
    });
    if (!end) continue;
    Object.assign(end, { el: '*', alias: 'R', hCount: null });
    // (with what hangs on its atoms, as any deletion: a text, a fill)
    const before = new Set(Object.values(doc).flatMap((v) => (v instanceof Map ? [...v.keys()] : [])));
    deleteObjects(doc, [p.id, q.id]);
    for (const id of before) if (!Object.values(doc).some((v) => v instanceof Map && v.has(id))) gone.add(id);
  }
  return gone.size ? ids.filter((id) => !gone.has(id)) : ids;
}
