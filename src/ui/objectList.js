// The Objects panel's list (ObjectsPanel.jsx): the drawing as things, the way a click selects them, in reading
// order (lines from the top, each from the left): molecules (with the names on their anchors), reaction arrows
// (with what is on them), "+" signs, texts standing free, brackets of their own, 3D models; groups (Ctrl+G) holding
// theirs.
// What belongs to something (a curved arrow, a text on an anchor, a molecule on an arrow) is in it, not listed.
import { formulaOf } from '../chem/formula.js';
import { groupChain, parentOf } from '../editor/grouping.js';
import { arrowIds, idsOfGroup, moleculeIds } from '../editor/tools/select.js';
import { fragments } from '../model/graph.js';
import { parseMarkup } from '../render/text.js';
import { t } from '../i18n/i18n.js';

const ARROW_NAMES = {
  forward: () => t('reaction arrow'), equilibrium: () => t('equilibrium arrow'), resonance: () => t('resonance arrow'),
  multistep: () => t('multistep arrow'), retro: () => t('retrosynthesis arrow'), failed: () => t('crossed arrow'), same: () => t('equals sign'),
};
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const plain = (markup) => parseMarkup(markup).map((c) => c.ch).join('').replace(/\s+/g, ' ').trim();
const short = (text, n = 28) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
// a formula as plain text, H₂O, SO₄²⁻
function formulaText(doc, atoms) {
  const { formula, charge } = formulaOf(doc, atoms);
  const sub = (n) => String(n).replace(/\d/g, (d) => SUBSCRIPT[d]);
  const sign = charge ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '−'}` : '';
  return formula.map(([el, n]) => `${el}${n > 1 ? sub(n) : ''}`).join('') + sign.replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).replace('+', '⁺').replace('−', '⁻');
}

// The things of the drawing, each { key, kind, ids (what selecting it selects), label, note, at ([x, y]: its
// middle), rep (an id of it, for its group), item (what it is to move between groups: { atoms } or { id }) }
function thingsOf(ed) {
  const { doc } = ed;
  const things = [];
  const middle = (points) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };
  for (const members of fragments(doc)) {
    if (members.some((id) => doc.atoms.get(id).arrow != null && doc.arrows.has(doc.atoms.get(id).arrow))) continue; // (on an arrow: in it)
    const names = [...doc.texts.values()].filter((text) => members.includes(text.anchor)).map((text) => plain(text.text)).filter(Boolean);
    things.push({ key: `m${Math.min(...members)}`, kind: 'molecule', ids: moleculeIds(ed, members), label: formulaText(doc, members), note: short(names.join(', ')),
      at: middle(members.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y])), rep: members[0], item: { atoms: members } });
  }
  for (const arrow of doc.arrows.values()) {
    if (arrow.kind === 'dipole') continue; // (on its molecule)
    const riders = fragments(doc).filter((members) => members.some((id) => doc.atoms.get(id).arrow === arrow.id)).map((members) => formulaText(doc, members));
    const texts = [...doc.texts.values()].filter((text) => text.arrow === arrow.id).map((text) => plain(text.text));
    things.push({ key: `o${arrow.id}`, kind: 'arrow', ids: arrowIds(doc, arrow.id), label: capital((ARROW_NAMES[arrow.kind] ?? ARROW_NAMES.forward)()),
      note: short([...riders, ...texts].filter(Boolean).join(', ')), at: middle([[arrow.x1, arrow.y1], [arrow.x2, arrow.y2]]), rep: arrow.id });
  }
  for (const plus of doc.pluses.values()) things.push({ key: `o${plus.id}`, kind: 'plus', ids: [plus.id], label: capital(t('"+" sign')), note: '', at: [plus.x, plus.y], rep: plus.id });
  for (const text of doc.texts.values()) {
    if (text.anchor != null || text.arrow != null) continue;
    things.push({ key: `o${text.id}`, kind: 'text', ids: [text.id], label: short(plain(text.text)) || t('Text'), note: '', at: [text.x, text.y], rep: text.id });
  }
  for (const bracket of doc.brackets.values()) {
    if (bracket.atoms?.length) continue; // (round its molecule: in it)
    things.push({ key: `o${bracket.id}`, kind: 'bracket', ids: [bracket.id], label: t('Brackets'), note: [bracket.sup, bracket.sub].filter(Boolean).join(' '),
      at: middle([[bracket.x1, bracket.y1], [bracket.x2, bracket.y2]]), rep: bracket.id });
  }
  for (const model of doc.models?.values() ?? []) {
    const atoms = model.atoms.filter((id) => doc.atoms.has(id));
    things.push({ key: `o${model.id}`, kind: 'model', ids: [model.id], label: t('3D model'), note: atoms.length ? formulaText(doc, atoms) : '', at: [model.x, model.y], rep: model.id });
  }
  for (const thing of things) thing.item ??= { id: thing.rep };
  return things;
}

// Reading order: lines from the top (things whose middles are within a bond and a half of the line's first),
// each from the left
function readingOrder(nodes) {
  const lines = [];
  for (const node of [...nodes].sort((a, b) => a.at[1] - b.at[1])) {
    const line = lines.at(-1);
    if (line && node.at[1] - line[0].at[1] < 1.5) line.push(node);
    else lines.push([node]);
  }
  return lines.flatMap((line) => line.sort((a, b) => a.at[0] - b.at[0]));
}

// The list: [node], a node a thing or { key: `g${id}`, kind: 'group', group, ids, label, note, at, children }
export function objectList(ed) {
  const { doc } = ed;
  const things = thingsOf(ed);
  if (!doc.groups?.size) return readingOrder(things);
  const nodes = new Map(); // group → node
  const nodeOf = (group) => {
    if (!nodes.has(group)) nodes.set(group, { key: `g${group}`, kind: 'group', group, children: [] });
    return nodes.get(group);
  };
  const top = [];
  for (const thing of things) {
    const [group] = groupChain(doc, thing.rep);
    if (group === undefined) top.push(thing);
    else nodeOf(group).children.push(thing);
  }
  // groups inside groups; the outermost at the top
  for (const group of doc.groups.keys()) {
    const node = nodeOf(group);
    const parent = parentOf(doc, group);
    if (parent) nodeOf(parent.id).children.push(node);
    else top.push(node);
  }
  // each group: what it holds in reading order, its middle, what selecting it selects, how much it holds
  const finish = (node) => {
    if (node.kind !== 'group') return node;
    node.children = readingOrder(node.children.map(finish).filter((child) => child.kind !== 'group' || child.children.length));
    const points = node.children.map((child) => child.at);
    node.at = points.length ? [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length] : [0, 0];
    node.ids = idsOfGroup(ed, node.group);
    node.label = doc.groups.get(node.group)?.name || t('Group');
    node.named = Boolean(doc.groups.get(node.group)?.name);
    node.item = { group: node.group };
    // (what it holds, so that one group is told from another: the first things in it)
    const leaves = (one) => (one.kind === 'group' ? one.children.flatMap(leaves) : one.kind === 'molecule' || one.kind === 'text' ? [one.label] : []);
    node.note = short(leaves(node).join(', '), 30);
    return node;
  };
  return readingOrder(top.map(finish).filter((node) => node.kind !== 'group' || node.children.length));
}
