// KET, Ketcher's JSON format: our own file format too. A saved drawing is
// ordinary KET that Ketcher and Indigo open (molecules, reaction arrows,
// "+", text), plus:
// - lone pairs, unpaired electrons and curved arrows as small SVG pictures
//   (KET images), so Ketcher shows them, each describing itself in its
//   <desc> (as the Ketcher-based version of this app wrote them);
// - brackets (transition states, ions, repeating units) as pictures too;
// - an "olomol" section in its root with what only we use (colours, which
//   atoms show lone pairs, curved arrows tied to their atoms and bonds,
//   brackets), which other programs ignore. (In the root, not beside it:
//   Ketcher checks a file against its schema, which allows no other key at
//   the top; files from olomol 0.2.1 and earlier have it there.)
// Reading takes the "olomol" section if there is one, else rebuilds lone
// pairs and arrows from the pictures (files from the Ketcher-based version,
// or saved again by Ketcher). KET has y up; the drawing has y down.
import { isElement } from '../chem/elements.js';
import { addArrow, addAtom, addBond, addBracket, addCurve, addFill, addOrbital, addOverlap, addPlus, addRepeatingUnit, addText, bondsByAtom, emptyDoc, isCovalent, orbitalAngle, repeatingUnits } from '../model/doc.js';
import { electronsOf } from '../chem/valence.js';
import { addNewmanMolecule } from '../chem/newman.js';
import { fragments } from '../model/graph.js';
import { eitherAsWavy } from './molfile.js';
import { buildScene, DEFAULT_SETTINGS, SIDE_SLOTS, textAlign } from '../render/scene.js';
import { arrowMarkup, electronSVG } from '../render/mechanism.js';
import { STYLE } from '../render/style.js';
import { chemMarkup, escapeMarkup, formatRuns } from '../render/text.js';
import { t } from '../i18n/i18n.js';
import { clampPoints, defaultStyleOf, STYLES, styleOf } from '../render/style.js';

const STYLE_NAMES = [...Object.keys(STYLES), 'custom'];

const MODES = { forward: 'filled-triangle', equilibrium: 'equilibrium-filled-half-bow', resonance: 'both-ends-filled-triangle', retro: 'retrosynthetic', failed: 'failed' };
const KIND_OF_MODE = (mode = '') => {
  if (mode.startsWith('elliptical')) return null;
  if (mode === 'failed') return 'failed';
  if (mode.includes('equilibrium')) return 'equilibrium';
  if (mode.startsWith('both-ends')) return 'resonance';
  if (mode === 'retrosynthetic') return 'retro';
  return 'forward';
};
const STEREO_OUT = { wedge: 1, hash: 6, wavy: 4 };
// where something on an arrow is: above, below, or at the free end of one of its side arcs
const slotOnArrow = (slot) => (slot === 'below' || SIDE_SLOTS.includes(slot) ? slot : 'above');
const STEREO_IN = { 1: 'wedge', 6: 'hash', 4: 'wavy' };
const f = (v) => +v.toFixed(4);
const xml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// --- writing ---

// The document (or the objects with `ids`) as a KET object.
// `superatoms`: [{ name, atoms, attachment: { atom, outside } }], abbreviations drawn out, written as Ketcher's
// contracted groups; `projected`: bond id -> { stereo, swapped }, wedges written for a projection's stereo and what
// the bond was (both from files.js forKetcher: olomol, reading the file, takes them back).
// `scale`: what the drawing was scaled by, written so that olomol scales it back (Ketcher's size: forKetcher).
export function toKet(doc, { ids = null, settings = DEFAULT_SETTINGS, pictures = true, title = null, superatoms = [], projected = null, units = true, scale = 1 } = {}) {
  const wanted = ids ? new Set(ids) : null;
  const keep = (id) => !wanted || wanted.has(id);
  const ket = { root: { nodes: [] } };
  // version 2: texts formatted only as marked (_{…}, ^{…}); before, digits after letters were subscripts on their own
  // (the drawing's style: its own, else the one set for new drawings, so that the file keeps the look it was made in)
  const style = doc.style ?? defaultStyleOf(settings);
  const extra = { version: 2, ...(title && { title }), style, molecules: {}, curves: [], fills: [], brackets: [], links: [], orbitals: [], overlaps: [] };
  const where = new Map(); // atom id -> [ref, index]
  // arrows by their place in the file (for what is on them)
  const arrowIndex = new Map([...doc.arrows.values()].filter((arrow) => keep(arrow.id)).map((arrow, i) => [arrow.id, i]));
  const bondWhere = new Map(); // bond id -> [ref, index]
  const byAtom = bondsByAtom(doc);
  const onPartial = (atom) => (byAtom.get(atom.id) ?? []).some((b) => b.kind === 'partial');
  const molecules = fragments(doc).map((members) => members.filter(keep)).filter((members) => members.length);
  molecules.forEach((members, m) => {
    const ref = `mol${m}`;
    const atoms = members.map((id) => doc.atoms.get(id));
    atoms.forEach((atom, i) => where.set(atom.id, [ref, i]));
    // (links keeping molecules together go in our section only: Ketcher would take them for bonds)
    const bonds = [...doc.bonds.values()].filter((b) => b.kind !== 'link' && where.get(b.a)?.[0] === ref && where.get(b.b)?.[0] === ref);
    bonds.forEach((bond, i) => bondWhere.set(bond.id, [ref, i]));
    ket[ref] = {
      type: 'molecule',
      atoms: atoms.map((atom) => ({
        // a group label (R, Nu, Ph): "any atom" showing the label
        ...(atom.alias ? { label: 'A', alias: atom.alias } : { label: atom.el }),
        location: [f(atom.x), f(-atom.y), 0],
        ...(atom.charge && { charge: atom.charge }),
        ...(atom.isotope && { isotope: atom.isotope }),
        // (three or four unpaired electrons: no KET code for them; ours in the olomol section. Their hydrogens said, as
        // in a molfile: else Indigo would give KET's radical 3 hydrogens of its own, ·N̈· as [NH])
        ...(atom.radical && { radical: Math.min(atom.radical, 3) }),
        // (on a partial bond too: Ketcher, taking it for a hydrogen bond, would give the atom hydrogens of its own,
        // a transition state's HO as H2O)
        ...(atom.hCount !== null && atom.hCount !== undefined ? { implicitHCount: atom.hCount } : (atom.radical > 3 || onPartial(atom)) && { implicitHCount: electronsOf(atom, byAtom.get(atom.id) ?? []).hydrogens }),
      })),
      bonds: bonds.map((bond) => ({
        // KET's dative (9) and hydrogen (10) bonds; a partial bond is a hydrogen bond to Ketcher
        type: { dative: 9, hbond: 10, partial: 10 }[bond.kind] ?? bond.order,
        atoms: [where.get(bond.a)[1], where.get(bond.b)[1]],
        ...(STEREO_OUT[bond.stereo] && { stereo: STEREO_OUT[bond.stereo] }),
      })),
    };
    ket.root.nodes.push({ $ref: ref });
    // our extras, by atom and bond index
    const atomExtras = atoms.map((atom, i) => ({ i, color: atom.color, lonePairs: atom.lonePairs, highlight: atom.highlight ?? null, endLabel: atom.endLabel ?? null, ...(atom.carbonLabel != null && { carbonLabel: atom.carbonLabel }), ...(atom.cipLabel && { cipLabel: true }), ...(atom.bold && { bold: true }), ...(atom.partialCharge && { partialCharge: atom.partialCharge }), ...(atom.projection && { projection: atom.projection }), ...(atom.hSide && { hSide: atom.hSide }), ...(atom.number != null && { number: atom.number }), ...(atom.autoNumber && { autoNumber: true }), ...(atom.letter && { letter: true }), ...(atom.facing && { facing: atom.facing }), ...(atom.radical > 3 && { radical: atom.radical }), ...((atom.radical > 3 || onPartial(atom)) && atom.hCount == null && { hAuto: true }), ...(arrowIndex.has(atom.arrow) && { arrow: arrowIndex.get(atom.arrow), arrowSlot: slotOnArrow(atom.arrowSlot), ...(atom.arrowSign && { arrowSign: atom.arrowSign }), ...(Number.isInteger(atom.arrowOrder) && { arrowOrder: atom.arrowOrder }) }) }))
      .filter((e) => e.color || e.lonePairs !== null || e.highlight || e.endLabel !== null || e.carbonLabel != null || e.cipLabel || e.bold || e.partialCharge || e.projection || e.hSide || e.number != null || e.autoNumber || e.letter || e.facing || e.radical || e.hAuto || e.arrow !== undefined);
    const bondExtras = bonds.map((bond, i) => ({ i, color: bond.color, side: bond.side, highlight: bond.highlight ?? null, ...(bond.delocalized && { delocalized: true }), ...(bond.cipLabel && { cipLabel: true }), ...(bond.kind === 'partial' && { kind: 'partial' }), ...(bond.stereo === 'perspective' && { perspective: true }), ...(typeof bond.z === 'number' && { z: f(bond.z) }), ...(bond.newman && { newman: true }), ...(bond.bold && { bold: true }), ...(projected?.has(bond.id) && { projected: projected.get(bond.id) }) }))
      .filter((e) => e.color || e.side || e.highlight || e.delocalized || e.cipLabel || e.kind || e.perspective || e.z !== undefined || e.newman || e.bold || e.projected);
    if (atomExtras.length || bondExtras.length) extra.molecules[ref] = { atoms: atomExtras, bonds: bondExtras };
  });
  // repeating units, for other programs (Ketcher, and through Indigo SDF, RXN, CDXML): brackets with n round atoms
  // of one molecule (our brackets themselves are in our section)
  const unitBrackets = new Set(); // (their brackets: no picture of them as well, Ketcher drew both)
  for (const { bracket, atoms } of units ? repeatingUnits(doc) : []) {
    if (!keep(bracket.id) || !atoms.every((id) => where.has(id)) || new Set(atoms.map((id) => where.get(id)[0])).size !== 1) continue;
    unitBrackets.add(bracket.id);
    const ref = where.get(atoms[0])[0];
    (ket[ref].sgroups ??= []).push({ type: 'SRU', atoms: atoms.map((id) => where.get(id)[1]), subscript: bracket.sub, connectivity: 'HT' });
  }
  // abbreviations drawn out: Ketcher's contracted groups (as Indigo writes them), shown as their names
  for (const { name, atoms, attachment } of superatoms) {
    if (!atoms.every((id) => where.has(id)) || new Set(atoms.map((id) => where.get(id)[0])).size !== 1) continue;
    const ref = where.get(atoms[0])[0];
    const joined = attachment && where.get(attachment.outside)?.[0] === ref;
    (ket[ref].sgroups ??= []).push({ type: 'SUP', atoms: atoms.map((id) => where.get(id)[1]), name,
      ...(joined && { attachmentPoints: [{ attachmentAtom: where.get(attachment.atom)[1], leavingAtom: where.get(attachment.outside)[1], attachmentId: '1' }] }) });
  }
  for (const arrow of doc.arrows.values()) {
    if (!keep(arrow.id)) continue;
    ket.root.nodes.push({
      type: 'arrow',
      // (an equilibrium that lies one way is Ketcher's unbalanced one, its lower harpoon shorter: lying back, written
      // from its other end, which draws the same)
      data: arrow.kind === 'equilibrium' && arrow.lean
        ? { mode: 'unbalanced-equilibrium-filled-half-bow', pos: (arrow.lean === 'back' ? [[arrow.x2, arrow.y2], [arrow.x1, arrow.y1]] : [[arrow.x1, arrow.y1], [arrow.x2, arrow.y2]]).map(([x, y]) => ({ x: f(x), y: f(-y), z: 0 })) }
        : { mode: MODES[arrow.kind] ?? MODES.forward, pos: [{ x: f(arrow.x1), y: f(-arrow.y1), z: 0 }, { x: f(arrow.x2), y: f(-arrow.y2), z: 0 }] },
      ...(arrow.color && { olomolColor: arrow.color }),
      ...(['dipole', 'multistep', 'same'].includes(arrow.kind) && { olomolKind: arrow.kind }), // Ketcher draws an arrow
      ...(arrow.kind === 'equilibrium' && arrow.lean && { olomolLean: arrow.lean }),
      ...(arrow.sides?.length && { olomolSides: arrow.sides.map(({ side, way, reach }) => ({ side, way, reach: f(reach) })) }), // (its side arcs)
      ...(arrow.ownLength !== undefined && { olomolOwnLength: f(arrow.ownLength) }), // (its length as drawn, while they make it longer)
      ...(arrow.lengthByHand && { olomolLengthByHand: true }),
    });
  }
  for (const plus of doc.pluses.values()) {
    if (keep(plus.id)) ket.root.nodes.push({ type: 'plus', location: [f(plus.x), f(-plus.y), 0], ...(plus.color && { olomolColor: plus.color }) });
  }
  const scene = buildScene(doc, settings);
  for (const text of doc.texts.values()) {
    if (!keep(text.id)) continue;
    const { box, at } = scene.texts.get(text.id); // (at: where it is, also when its molecule placed it)
    ket.root.nodes.push({
      type: 'text',
      boundingBox: { x: f(box.x1), y: f(-box.y1), width: f(box.x2 - box.x1), height: f(box.y2 - box.y1) },
      ...(textAlign(text) !== 'left' && { alignment: textAlign(text) }),
      paragraphs: text.text.split('\n').map((line) => ({
        parts: formatRuns(line, { auto: false }).map((run) => ({ text: run.text, ...((text.bold || run.bold) && { bold: true }), ...(run.italic && { italic: true }), ...(run.shift === 'sub' && { subscript: true }), ...(run.shift === 'sup' && { superscript: true }) })),
      })),
      olomol: {
        text: text.text, x: f(at[0]), y: f(-at[1]), ...(text.color && { color: text.color }), ...(text.bold && { bold: true }), ...(text.align && { align: text.align }),
        ...(text.size > 0 && text.size !== 1 && { size: f(text.size) }), ...(['sans', 'serif'].includes(text.family) && { family: text.family }),
        ...(where.has(text.anchor) && { anchor: { mol: where.get(text.anchor)[0], atom: where.get(text.anchor)[1] }, ...(text.slot && text.slot !== 'below' && { slot: text.slot }), ...(text.drop && { drop: f(text.drop) }) }),
        ...(arrowIndex.has(text.arrow) && { arrow: arrowIndex.get(text.arrow), slot: slotOnArrow(text.slot), ...(text.arrowSign && { arrowSign: text.arrowSign }) }),
        ...((where.has(text.anchor) || arrowIndex.has(text.arrow)) && Number.isInteger(text.order) && { order: text.order }),
      },
    });
  }
  // orbitals on the atoms written (their angle as in the drawing, y down, from the neighbour `ref`), the
  // dashed lines between them by their places in that list
  const orbitalIndex = new Map();
  for (const o of doc.orbitals?.values() ?? []) {
    const at = where.get(o.atom);
    if (!at) continue;
    const ref = o.ref != null && where.has(o.ref) ? where.get(o.ref) : null;
    orbitalIndex.set(o.id, extra.orbitals.length);
    extra.orbitals.push({ mol: at[0], atom: at[1], kind: o.kind, angle: f(ref || o.ref == null ? o.angle : orbitalAngle(doc, o)), ref, size: o.size ?? 1, phase: o.phase ?? 1, color: o.color ?? null, ...(o.colorOther && { colorOther: o.colorOther }),
      ...(o.plane && { plane: o.plane }), ...(o.reach != null && o.reach !== 1 && { reach: f(o.reach) }), ...(typeof o.z === 'number' && { z: f(o.z), dz: f(o.dz ?? 0) }) });
  }
  for (const o of doc.overlaps?.values() ?? []) {
    if (orbitalIndex.has(o.a) && orbitalIndex.has(o.b)) extra.overlaps.push({ a: orbitalIndex.get(o.a), b: orbitalIndex.get(o.b), color: o.color ?? null, ...(o.sideA != null && { sideA: o.sideA }), ...(o.sideB != null && { sideB: o.sideB }) });
  }
  const endOut = (end) => {
    if (end.orbital !== undefined) return orbitalIndex.has(end.orbital) ? { orbital: orbitalIndex.get(end.orbital) } : null;
    if (end.bond !== undefined) {
      const [ref, i] = bondWhere.get(end.bond) ?? [];
      return ref ? { mol: ref, bond: i } : null;
    }
    const [ref, i] = where.get(end.atom) ?? [];
    if (end.newBond !== undefined) {
      const [other, j] = where.get(end.newBond) ?? [];
      return ref && other ? { mol: ref, atom: i, newBond: { mol: other, atom: j } } : null;
    }
    return ref ? { mol: ref, atom: i, ...(end.pair !== undefined && { pair: end.pair }), ...(end.radical && { radical: true }) } : null;
  };
  for (const curve of doc.curves.values()) {
    if (!keep(curve.id)) continue;
    const [from, to] = [endOut(curve.from), endOut(curve.to)];
    if (from && to) extra.curves.push({ electrons: curve.electrons, from, to, color: curve.color, variant: curve.variant ?? 0 });
  }
  for (const bond of doc.bonds.values()) {
    const [a, b] = [where.get(bond.a), where.get(bond.b)];
    if (bond.kind === 'link' && a && b) extra.links.push({ mol: a[0], a: a[1], b: b[1] });
  }
  for (const fill of doc.fills.values()) {
    const places = fill.atoms.map((id) => where.get(id));
    if (places.every((p) => p && p[0] === places[0][0])) extra.fills.push({ mol: places[0][0], atoms: places.map((p) => p[1]), color: fill.color });
  }
  for (const b of doc.brackets.values()) {
    const atoms = (b.atoms ?? []).filter((id) => where.has(id)).map((id) => where.get(id));
    if (keep(b.id)) extra.brackets.push({ x1: f(b.x1), y1: f(-b.y1), x2: f(b.x2), y2: f(-b.y2), shape: b.shape, sup: b.sup, sub: b.sub, color: b.color, ...(atoms.length && { atoms }) });
  }
  // groups (Ctrl+G, olomol's own: Ketcher has none), their members by their places in the file (a molecule by one
  // of its atoms, a "+" and a text among those written, a bracket in the list above, a group in this one); they
  // went, a drawing exported as KET and opened again had none
  if (doc.groups?.size) {
    const index = (list) => new Map(list.filter((o) => keep(o.id)).map((o, i) => [o.id, i]));
    const [pluses, texts, brackets] = [index([...doc.pluses.values()]), index([...doc.texts.values()]), index([...doc.brackets.values()])];
    // (only groups all of whose things are written, as in .olom: one with a part left out is no group of the part)
    const groupIndex = new Map();
    const member = (id) => (where.has(id) ? { mol: where.get(id)[0], atom: where.get(id)[1] } : arrowIndex.has(id) ? { arrow: arrowIndex.get(id) }
      : pluses.has(id) ? { plus: pluses.get(id) } : texts.has(id) ? { text: texts.get(id) } : brackets.has(id) ? { bracket: brackets.get(id) }
        : groupIndex.has(id) ? { group: groupIndex.get(id) } : null);
    const written = [];
    for (let more = true; more;) {
      more = false;
      for (const g of doc.groups.values()) {
        if (groupIndex.has(g.id) || !g.members.every(member)) continue;
        groupIndex.set(g.id, written.length);
        written.push(g);
        more = true;
      }
    }
    if (written.length) extra.groups = written.map((g) => ({ ...(g.name && { name: g.name }), members: g.members.map(member) }));
  }
  if (pictures) ket.root.nodes.push(...electronPictures(scene, where, keep), ...bracketPictures(scene, (id) => keep(id) && !unitBrackets.has(id)));
  // (Ketcher showed a contracted group's name only when its group came before a repeating unit holding it)
  for (const value of Object.values(ket)) value?.sgroups?.sort((p, q) => (p.type === 'SUP' ? 0 : 1) - (q.type === 'SUP' ? 0 : 1));
  if (scale !== 1) extra.scale = f(scale);
  ket.root.olomol = extra;
  return ket;
}

export const writeKet = (doc, options) => JSON.stringify(toKet(doc, options), null, 1);

// A KET image of SVG markup drawn in drawing coordinates within `box`.
function picture(box, markup, meta) {
  const pad = 0.05;
  const [x, y, w, h] = [box.x1 - pad, box.y1 - pad, box.x2 - box.x1 + 2 * pad, box.y2 - box.y1 + 2 * pad];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}" width="${Math.ceil(w * 200)}" height="${Math.ceil(h * 200)}">`
    + `<desc>${JSON.stringify(meta)}</desc>${markup}</svg>`;
  return { type: 'image', format: 'image/svg+xml', boundingBox: { x: f(x), y: f(-y), z: 0, width: f(w), height: f(h) }, data: btoa(unescape(encodeURIComponent(svg))) };
}

// Lone pairs, unpaired electrons and curved arrows as pictures for Ketcher.
// Their <desc> holds what the Ketcher-based version stored (positions
// relative to the picture's top-left corner, KET axes), so either version
// can rebuild them from the pictures alone.
function electronPictures(scene, where, keep) {
  const nodes = [];
  const relative = (box, [x, y]) => [f(x - (box.x1 - 0.05)), f(-(y - (box.y1 - 0.05)))];
  for (const info of scene.atoms.values()) {
    if (!where.has(info.atom.id)) continue;
    const color = info.atom.color ?? scene.settings.ink;
    for (const pair of info.electrons.pairs) {
      const box = { x1: pair.point[0] - 0.16, y1: pair.point[1] - 0.16, x2: pair.point[0] + 0.16, y2: pair.point[1] + 0.16 };
      const meta = { olomol: 'lonePair', style: scene.settings.pairStyle, angle: f(-pair.angle), atoms: [relative(box, info.pos)] };
      nodes.push(picture(box, electronSVG(pair.point, pair.angle, 2, scene.settings.pairStyle, color), meta));
    }
    for (const e of info.electrons.unpaired) {
      const box = { x1: e.point[0] - 0.16, y1: e.point[1] - 0.16, x2: e.point[0] + 0.16, y2: e.point[1] + 0.16 };
      const meta = { olomol: 'radical', dots: e.count, atoms: [relative(box, info.pos)] };
      nodes.push(picture(box, electronSVG(e.point, e.angle, e.count, 'unpaired', color), meta));
    }
  }
  for (const { curve, head, samples, color } of scene.curves.values()) {
    if (!keep(curve.id)) continue;
    const points = [...samples, ...head];
    const box = { x1: Math.min(...points.map((p) => p[0])), y1: Math.min(...points.map((p) => p[1])), x2: Math.max(...points.map((p) => p[0])), y2: Math.max(...points.map((p) => p[1])) };
    const ends = (end) => {
      if (end.bond !== undefined) {
        const bond = scene.bonds.get(end.bond).bond;
        return { kind: 'bond', atoms: [bond.a, bond.b].map((id) => relative(box, scene.pos(id))) };
      }
      return { kind: end.radical ? 'radical' : 'lonePair', atoms: [relative(box, scene.pos(atomOf(end)))] };
    };
    // (an end on an orbital: its atom, for a program that reads these pictures)
    const atomOf = (end) => (end.orbital !== undefined ? scene.orbitals.get(end.orbital).orbital.atom : end.atom);
    const to = curve.to.bond !== undefined ? ends(curve.to)
      : curve.to.newBond !== undefined ? { kind: 'newBond', atoms: [curve.to.newBond, curve.to.atom].map((id) => relative(box, scene.pos(id))) }
        : { kind: 'atom', atoms: [relative(box, scene.pos(atomOf(curve.to)))] };
    const meta = { olomol: 'arrow', electrons: curve.electrons, color, from: ends(curve.from), to, path: samples.filter((_, k) => k % 5 === 0).map((p) => relative(box, p)) };
    const markup = arrowMarkup(scene.curves.get(curve.id), color);
    nodes.push(picture(box, markup, meta));
  }
  return nodes;
}

// Brackets as pictures for Ketcher; the <desc> has the bracket itself.
function bracketPictures(scene, keep) {
  const nodes = [];
  for (const { bracket: b, paths, runs, box, color } of scene.brackets.values()) {
    if (!keep(b.id)) continue;
    const corners = [[b.x1, b.y1], [b.x2, b.y2]].map(([x, y]) => [f(x - (box.x1 - 0.05)), f(-(y - (box.y1 - 0.05)))]);
    const markup = paths.map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${STYLE.line}"/>`).join('')
      + runs.map((r) => `<text x="${f(r.x)}" y="${f(r.y)}" font-size="${f(r.size)}" font-family="Arial, sans-serif"${r.italic ? ' font-style="italic"' : ''} fill="${color}">${xml(r.text)}</text>`).join('');
    nodes.push(picture(box, markup, { olomol: 'bracket', shape: b.shape, sup: b.sup, sub: b.sub, corners }));
  }
  return nodes;
}

// --- reading ---

// Text of an old-style KET text node (Draft.js content).
// An element with its hydrogens written as one label (CH4, NH3, OH2, H2O): { el, hydrogens }, or null
function hydrideLabel(label) {
  const match = typeof label === 'string' && (label.match(/^([A-Z][a-z]?)H(\d*)$/) ?? label.match(/^H(\d*)([A-Z][a-z]?)$/)?.slice(0, 3).reverse());
  if (!match) return null;
  const [el, count] = label.startsWith('H') && label !== 'H' ? [match[0], match[1]] : [match[1], match[2]];
  return el !== 'H' && isElement(el) ? { el, hydrogens: count === '' ? 1 : Number(count) } : null;
}

// A formatted part of a text (Ketcher's paragraphs, or a draft's styled run) as markup
const partMarkup = (x) => {
  const plain = escapeMarkup(x.text ?? '');
  const shifted = x.subscript ? `_{${plain}}` : x.superscript ? `^{${plain}}` : plain;
  const slanted = x.italic ? `~{${shifted}}` : shifted;
  return x.bold ? `*{${slanted}}` : slanted;
};
const DRAFT_STYLES = { BOLD: 'bold', ITALIC: 'italic', SUBSCRIPT: 'subscript', SUPERSCRIPT: 'superscript' };

// A draft text (Ketcher's older texts, Indigo's from a CDXML's captions) as markup: with its own sub- and
// superscripts, bold and italic where it has any; with none, a formula's guessed (H2O: H₂O)
function draftText(content) {
  let blocks;
  try {
    blocks = JSON.parse(content).blocks;
  } catch {
    return '';
  }
  if (!Array.isArray(blocks)) return '';
  const styled = blocks.some((block) => (block.inlineStyleRanges ?? []).some((range) => DRAFT_STYLES[range.style]));
  if (!styled) return chemMarkup(blocks.map((block) => String(block.text ?? '')).join('\n'));
  return blocks.map((block) => {
    const text = String(block.text ?? '');
    const flags = [...text].map(() => ({}));
    // (offsets in UTF-16 units, as JavaScript's: a character beyond them, an emoji, counted as two)
    const at = [];
    [...text].forEach((ch, k) => { for (let u = 0; u < ch.length; u++) at.push(k); });
    for (const range of block.inlineStyleRanges ?? []) {
      const flag = DRAFT_STYLES[range.style];
      if (!flag) continue;
      for (let u = range.offset; u < range.offset + range.length && u < at.length; u++) if (u >= 0) flags[at[u]][flag] = true;
    }
    const parts = [];
    [...text].forEach((ch, k) => {
      const last = parts.at(-1);
      const same = last && Object.values(DRAFT_STYLES).every((flag) => !!last[flag] === !!flags[k][flag]);
      if (same) last.text += ch;
      else parts.push({ ...flags[k], text: ch });
    });
    return parts.map(partMarkup).join('');
  }).join('\n');
}

// What one of our pictures says about itself (positions made absolute,
// KET axes), or null.
function readPicture(node) {
  if (node.type !== 'image' || node.format !== 'image/svg+xml') return null;
  let svg;
  try {
    svg = decodeURIComponent(escape(atob(node.data)));
  } catch {
    return null;
  }
  const match = svg.match(/<desc>(\{"olomol".*?\})<\/desc>/);
  if (!match) return null;
  const meta = JSON.parse(match[1]);
  const { x, y } = node.boundingBox;
  const absolute = (list) => list.map(([dx, dy]) => [x + dx, y + dy]);
  if (meta.atoms) meta.atoms = absolute(meta.atoms);
  if (meta.corners) meta.corners = absolute(meta.corners);
  for (const end of [meta.from, meta.to]) if (end) end.atoms = absolute(end.atoms);
  return meta;
}

// Reads KET text (or an object) into a new document (or into `doc`,
// shifted by dx, dy). Returns { doc, ids: the new objects' ids, title: the
// drawing's name if the file has one }.
export function readKet(input, doc = emptyDoc(), [dx, dy] = [0, 0], { valences = true } = {}) {
  const ket = typeof input === 'string' ? JSON.parse(input) : input;
  if (!ket.root?.nodes) throw new Error(t('not a KET file'));
  const extra = ket.root.olomol ?? ket.olomol; // (at the top in files from 0.2.1 and earlier)
  const ids = [];
  const atomIds = {}; // ref -> [atom ids]
  const bondIds = {};
  const arrowIds = []; // in the file's order
  const plusIds = []; // (and these, for the groups)
  const textIds = [];
  const pictures = [];
  const superatoms = [];
  // texts of files from before version 2 (and of Ketcher's old drafts) were formatted on their
  // own (H2SO4): written out as markup, so they look as they did
  const older = (text) => ((extra?.version ?? 1) < 2 ? chemMarkup(text) : text);
  for (const node of ket.root.nodes) {
    if (node.$ref) {
      const mol = ket[node.$ref];
      if (mol?.type !== 'molecule') continue;
      atomIds[node.$ref] = (mol.atoms ?? []).map((a) => {
        const heavy = !a.alias && { D: 2, T: 3 }[a.label]; // (Ketcher's D and T: hydrogen 2 and 3)
        // (an R-group atom, Ketcher's and Indigo's R1: no label of its own, its groups in $refs: rg-1;
        // an atom list: [C,N] as Ketcher writes it, none of them: ![C,N])
        const rGroup = a.type === 'rg-label' ? `R${(a.$refs ?? []).map((ref) => String(ref).replace(/^rg-/, '')).join(',')}`
          : a.type === 'atom-list' && Array.isArray(a.elements) ? `${a.notList ? '!' : ''}[${a.elements.join(',')}]` : null;
        // (a lone atom with its H as its label, Indigo's from ChemDraw: CH4, NH3, H2O; the atom with its H)
        const hydride = !heavy && !rGroup && !a.alias && hydrideLabel(a.label);
        const generic = !heavy && !hydride && (rGroup || a.alias || !isElement(a.label ?? 'C'));
        const atom = addAtom(doc, a.location[0] + dx, -a.location[1] + dy, heavy ? 'H' : hydride ? hydride.el : generic ? '*' : a.label ?? 'C', {
          alias: generic ? rGroup || a.alias || a.label : null,
          charge: a.charge ?? 0,
          isotope: heavy || (a.isotope ?? null),
          ...(heavy && { letter: true }),
          radical: a.radical ?? 0,
          hCount: a.implicitHCount ?? (hydride ? hydride.hydrogens : null),
        });
        ids.push(atom.id);
        return atom.id;
      });
      bondIds[node.$ref] = (mol.bonds ?? []).map((b) => {
        const order = [1, 2, 3, 4].includes(b.type) ? b.type : 1;
        const kind = { 9: 'dative', 10: 'hbond' }[b.type];
        const bond = addBond(doc, atomIds[node.$ref][b.atoms[0]], atomIds[node.$ref][b.atoms[1]], order, { stereo: (order === 1 && (!kind || kind === 'dative') && STEREO_IN[b.stereo]) || '', ...(kind && { kind }) });
        if (order === 2 && b.stereo === 3) bond.either = true; // (E or Z not said: as a molfile's, a wavy bond beside it)
        ids.push(bond.id);
        return bond.id;
      });
      const bonds = bondIds[node.$ref].map((id) => doc.bonds.get(id));
      if (bonds.some((bond) => bond.either)) eitherAsWavy(bonds);
      // a valence set (Ketcher's, Indigo's from a molfile's valence field): this many H, as a molfile's (not
      // ChemDraw's, through Indigo: its hydrogens are read from the file itself, cdxml.js)
      if (valences) (mol.atoms ?? []).forEach((a, k) => {
        if (!Number.isInteger(a.explicitValence) || a.explicitValence < 0 || Number.isInteger(a.implicitHCount)) return;
        const id = atomIds[node.$ref][k];
        const order = bonds.filter((b) => (isCovalent(b) && (b.a === id || b.b === id)) || (b.kind === 'dative' && b.b === id)).reduce((sum, b) => sum + (b.order === 4 ? 1.5 : b.order), 0);
        doc.atoms.get(id).hCount = Math.max(0, Math.round(a.explicitValence - order));
      });
      // abbreviations drawn out in the file (Ketcher's, and Indigo's from a CDXML's nicknames: Me, OTBS), each
      // with its name and atoms: written as labels again after reading where olomol knows them (files.js)
      for (const group of mol.sgroups ?? []) {
        // a repeating unit (Ketcher's, ChemDraw's through Indigo): brackets round its atoms, with its n (ours
        // are in our section)
        if (group.type === 'SRU' && !extra && Array.isArray(group.atoms)) {
          const bracket = addRepeatingUnit(doc, group.atoms.map((i) => atomIds[node.$ref][i]).filter((id) => id !== undefined), String(group.subscript || 'n'));
          if (bracket) ids.push(bracket.id);
          continue;
        }
        if (group.type !== 'SUP' || group.expanded === true || !Array.isArray(group.atoms)) continue;
        superatoms.push({ name: String(group.name ?? ''), atoms: group.atoms.map((i) => atomIds[node.$ref][i]).filter((id) => id !== undefined) });
      }
    } else if (node.type === 'arrow') {
      const kind = ['dipole', 'multistep', 'same'].includes(node.olomolKind) ? node.olomolKind : KIND_OF_MODE(node.data?.mode);
      let [p, q] = node.data?.pos ?? [];
      if (!kind || !p || !q) continue;
      // an equilibrium that lies one way (Ketcher's unbalanced one: as drawn, forward); lying back, it was
      // written from its other end
      const lean = kind !== 'equilibrium' ? null
        : ['forward', 'back'].includes(node.olomolLean) ? node.olomolLean : String(node.data?.mode).startsWith('unbalanced') ? 'forward' : null;
      if (node.olomolLean === 'back') [p, q] = [q, p];
      const sides = (node.olomolSides ?? []).filter((e) => ['above', 'below'].includes(e.side) && ['in', 'out'].includes(e.way) && e.reach > 0);
      const arrow = addArrow(doc, p.x + dx, -p.y + dy, q.x + dx, -q.y + dy, kind, { color: node.olomolColor ?? null, ...(lean && { lean }) });
      if (sides.length) arrow.sides = sides.map(({ side, way, reach }) => ({ id: doc.nextId++, side, way, reach }));
      if (node.olomolOwnLength > 0) arrow.ownLength = node.olomolOwnLength;
      if (node.olomolLengthByHand) arrow.lengthByHand = true;
      ids.push(arrow.id);
      arrowIds.push(arrow.id);
    } else if (node.type === 'plus') {
      ids.push(addPlus(doc, node.location[0] + dx, -node.location[1] + dy, { color: node.olomolColor ?? null }).id);
      plusIds.push(ids.at(-1));
    } else if (node.type === 'text') {
      if (node.olomol) {
        const { anchor, bold, slot, drop, arrow, align, size, family, arrowSign } = node.olomol;
        const order = node.olomol.order ?? node.olomol.arrowOrder; // (arrowOrder: drafts of 2026-10-28)
        const anchorId = anchor && atomIds[anchor.mol]?.[anchor.atom];
        const anchored = anchorId !== undefined && anchorId !== null;
        const arrowId = Number.isInteger(arrow) ? arrowIds[arrow] : undefined;
        ids.push(addText(doc, node.olomol.x + dx, -node.olomol.y + dy, older(node.olomol.text), {
          color: node.olomol.color ?? null, ...(bold && { bold: true }), ...(['left', 'center', 'right'].includes(align) && { align }),
          ...(size > 0 && size !== 1 && { size: Math.min(8, Math.max(0.2, size)) }), ...(['sans', 'serif'].includes(family) && { family }),
          ...(anchored && { anchor: anchorId, ...(['above', 'left', 'right'].includes(slot) && { slot }), ...(drop > 0 && { drop }) }),
          ...(!anchored && arrowId !== undefined && { arrow: arrowId, slot: slotOnArrow(slot), ...(['+', '−'].includes(arrowSign) && { arrowSign }) }),
          ...((anchored || arrowId !== undefined) && Number.isInteger(order) && { order }),
        }).id);
        textIds.push(ids.at(-1));
      } else if (node.paragraphs) {
        // Ketcher's own formatting as markup
        const text = node.paragraphs.map((p) => (p.parts ?? []).map(partMarkup).join('')).join('\n');
        const b = node.boundingBox;
        ids.push(addText(doc, b.x + dx, -b.y + dy + STYLE.textFont * 0.75, text).id);
      } else if (node.data?.content) {
        const p = node.data.position;
        ids.push(addText(doc, p.x + dx, -p.y + dy + STYLE.textFont * 0.75, draftText(node.data.content)).id);
      }
    } else if (node.type === 'image') {
      const meta = readPicture(node);
      if (meta) pictures.push(meta);
    }
  }
  if (extra) applyExtras(doc, extra, atomIds, bondIds, ids, [dx, dy], arrowIds, { plusIds, textIds });
  else if (pictures.length) applyPictures(doc, pictures, atomIds, [dx, dy], ids);
  // its style, if it says one olomol has (a custom one's sizes kept within what draws well)
  if (extra?.style && STYLE_NAMES.includes(extra.style.style)) {
    doc.style = styleOf({ style: extra.style.style, customStyle: extra.style.style === 'custom' ? clampPoints(extra.style.customStyle) : undefined, charges: extra.style.charges, lonePairs: extra.style.lonePairs });
  }
  // (abbreviations drawn out: Ketcher's and Indigo's, and ours, written so for Ketcher: labels again, files.js)
  return { doc, ids, title: extra?.title ?? null, superatoms, scale: Number(extra?.scale) > 0 ? Number(extra.scale) : 1 };
}

function applyExtras(doc, extra, atomIds, bondIds, ids, [dx, dy], arrowIds, { plusIds = [], textIds = [] } = {}) {
  for (const [ref, { atoms = [], bonds = [] }] of Object.entries(extra.molecules ?? {})) {
    for (const { i, color, lonePairs, highlight, endLabel, carbonLabel, cipLabel, bold, partialCharge, projection, hSide, number, autoNumber, letter, facing, radical, hAuto, arrow, arrowSlot, arrowSign, arrowOrder } of atoms) {
      const atom = doc.atoms.get(atomIds[ref]?.[i]);
      if (!atom) continue;
      atom.color = color ?? null;
      atom.lonePairs = lonePairs ?? null;
      atom.highlight = highlight ?? null;
      atom.endLabel = endLabel ?? null;
      if (typeof carbonLabel === 'boolean') atom.carbonLabel = carbonLabel;
      if (cipLabel === true) atom.cipLabel = true;
      if (bold === true) atom.bold = true;
      if (partialCharge === 1 || partialCharge === -1) atom.partialCharge = partialCharge;
      if (projection === 'fischer') atom.projection = 'fischer';
      if (['left', 'right', 'up', 'down'].includes(hSide)) atom.hSide = hSide;
      if (Number.isInteger(number)) atom.number = number;
      if (autoNumber === true) atom.autoNumber = true;
      if (letter === true) atom.letter = true;
      if (radical === 4 || radical === 5) atom.radical = radical; // (three or four unpaired electrons: see writing)
      if (hAuto === true) atom.hCount = null; // (their hydrogens written for other programs, not set by hand)
      // (which way the molecule's plane looks there, in a drawing from a 3D view: for p orbitals put on it)
      if (Number.isFinite(facing?.angle) && Number.isFinite(facing?.reach)) atom.facing = { angle: facing.angle, reach: facing.reach, face: facing.face === -1 ? -1 : 1 };
      if (Number.isInteger(arrow) && arrowIds[arrow] !== undefined) {
        Object.assign(atom, { arrow: arrowIds[arrow], arrowSlot: slotOnArrow(arrowSlot), ...(['+', '−'].includes(arrowSign) && { arrowSign }), ...(Number.isInteger(arrowOrder) && { arrowOrder }) });
      }
    }
    for (const { i, color, side, highlight, delocalized, cipLabel, kind, perspective, z, newman, bold, projected } of bonds) {
      const bond = doc.bonds.get(bondIds[ref]?.[i]);
      if (!bond) continue;
      bond.color = color ?? null;
      bond.side = side ?? null;
      bond.highlight = highlight ?? null;
      if (delocalized) bond.delocalized = true;
      if (cipLabel === true) bond.cipLabel = true;
      if (kind === 'partial') bond.kind = 'partial';
      if (perspective) bond.stereo = 'perspective';
      if (Number.isFinite(z)) bond.z = z;
      if (newman === true) bond.newman = true;
      if (bold === true) bond.bold = true;
      // (a wedge written for Ketcher in place of a projection's stereo: the bond as it was drawn)
      if (projected && typeof projected === 'object') {
        // (any stereo it had: a perspective bond, or a wedge, hash or wavy bond drawn by hand on a chair)
        bond.stereo = ['perspective', 'wedge', 'hash', 'wavy'].includes(projected.stereo) ? projected.stereo : '';
        if (projected.swapped === true) [bond.a, bond.b] = [bond.b, bond.a];
      }
    }
  }
  // orbitals (before the curved arrows, which can start or end on one)
  const orbitalIds = [];
  for (const o of extra.orbitals ?? []) {
    const atom = atomIds[o.mol]?.[o.atom];
    const ref = o.ref ? atomIds[o.ref[0]]?.[o.ref[1]] : undefined;
    const kind = ['p', 'hybrid', 's'].includes(o.kind) ? o.kind : 'p';
    const orbital = atom === undefined ? null : addOrbital(doc, atom, { kind, angle: Number(o.angle) || 0, ref: ref ?? null, size: Number(o.size) || 1, phase: o.phase === -1 ? -1 : 1, color: o.color ?? null, ...(typeof o.colorOther === 'string' && { colorOther: o.colorOther }),
      ...((o.plane === 1 || o.plane === -1) && { plane: o.plane }), ...(o.plane === true && { plane: 1 }), ...(o.reach != null && { reach: Number(o.reach) }), ...(Number.isFinite(o.z) && { z: Number(o.z), dz: Number(o.dz) || 0 }) });
    orbitalIds.push(orbital?.id);
    if (orbital) ids.push(orbital.id);
  }
  for (const o of extra.overlaps ?? []) {
    const [a, b] = [orbitalIds[o.a], orbitalIds[o.b]];
    if (a !== undefined && b !== undefined) ids.push(addOverlap(doc, a, b, { color: o.color ?? null, ...((o.sideA === 1 || o.sideA === -1) && { sideA: o.sideA }), ...((o.sideB === 1 || o.sideB === -1) && { sideB: o.sideB }) }).id);
  }
  const endIn = (end) => {
    if (end.orbital !== undefined) return orbitalIds[end.orbital] === undefined ? null : { orbital: orbitalIds[end.orbital] };
    if (end.bond !== undefined) {
      const id = bondIds[end.mol]?.[end.bond];
      return id === undefined ? null : { bond: id };
    }
    const id = atomIds[end.mol]?.[end.atom];
    if (id === undefined) return null;
    if (end.newBond) {
      const other = atomIds[end.newBond.mol]?.[end.newBond.atom];
      return other === undefined ? null : { atom: id, newBond: other };
    }
    return { atom: id, ...(end.pair !== undefined && { pair: end.pair }), ...(end.radical && { radical: true }) };
  };
  for (const { mol, a, b } of extra.links ?? []) {
    const [ia, ib] = [atomIds[mol]?.[a], atomIds[mol]?.[b]];
    if (ia !== undefined && ib !== undefined) ids.push(addBond(doc, ia, ib, 1, { kind: 'link' }).id);
  }
  for (const { mol, atoms, color } of extra.fills ?? []) {
    const ids = atoms.map((i) => atomIds[mol]?.[i]);
    if (ids.every((id) => id !== undefined)) addFill(doc, ids, color);
  }
  for (const c of extra.curves ?? []) {
    const [from, to] = [endIn(c.from), endIn(c.to)];
    if (from && to) ids.push(addCurve(doc, from, to, c.electrons === 1 ? 1 : 2, { color: c.color ?? null, variant: c.variant ?? 0 }).id);
  }
  // (files from before Newman projections were molecules: a drawing with texts round it)
  for (const n of extra.newmans ?? []) ids.push(...oldNewman(doc, n.x + dx, -n.y + dy, { front: n.front, back: n.back, dihedral: n.dihedral ?? 60, color: n.color ?? null }));
  const bracketIds = [];
  for (const b of extra.brackets ?? []) {
    const atoms = (b.atoms ?? []).map(([mol, i]) => atomIds[mol]?.[i]).filter((id) => id !== undefined);
    bracketIds.push(doc.nextId);
    ids.push(addBracket(doc, b.x1 + dx, -b.y1 + dy, b.x2 + dx, -b.y2 + dy, { shape: b.shape === 'round' ? 'round' : 'square', sup: b.sup ?? '', sub: b.sub ?? '', color: b.color ?? null, ...(atoms.length && { atoms }) }).id);
  }
  // groups (Ctrl+G): their ids first (a group may hold one listed after it), then what they hold
  const groupIds = (extra.groups ?? []).map(() => doc.nextId++);
  (extra.groups ?? []).forEach((g, k) => {
    const members = (g.members ?? []).map((m) => (m.mol !== undefined ? atomIds[m.mol]?.[m.atom] : m.arrow !== undefined ? arrowIds[m.arrow]
      : m.plus !== undefined ? plusIds[m.plus] : m.text !== undefined ? textIds[m.text] : m.bracket !== undefined ? bracketIds[m.bracket]
        : m.group !== undefined ? groupIds[m.group] : undefined)).filter((id) => id !== undefined);
    if (members.length) (doc.groups ??= new Map()).set(groupIds[k], { id: groupIds[k], members, ...(typeof g.name === 'string' && g.name && { name: g.name }) });
  });
}

// A Newman projection of an older file (texts round a circle) as the molecule it shows. Returns the
// new atoms' and bonds' ids.
function oldNewman(doc, x, y, options) {
  const [atoms, bonds] = [new Set(doc.atoms.keys()), new Set(doc.bonds.keys())];
  addNewmanMolecule(doc, x, y, options);
  return [...[...doc.atoms.keys()].filter((id) => !atoms.has(id)), ...[...doc.bonds.keys()].filter((id) => !bonds.has(id))];
}

// Files without our section: lone pairs and arrows from their pictures,
// found by the atom positions the pictures recorded.
function applyPictures(doc, pictures, atomIds, [dx, dy], ids) {
  const fresh = new Set(Object.values(atomIds).flat());
  const atomAt = ([x, y]) => {
    for (const id of fresh) {
      const atom = doc.atoms.get(id);
      if (Math.hypot(atom.x - (x + dx), atom.y - (-y + dy)) < 0.06) return id;
    }
    return undefined;
  };
  const bondOf = (a, b) => [...doc.bonds.values()].find((bond) => (bond.a === a && bond.b === b) || (bond.a === b && bond.b === a))?.id;
  for (const meta of pictures) {
    if (meta.olomol !== 'newman' || meta.corners?.length !== 2) continue;
    const [[x, y]] = meta.corners;
    ids.push(...oldNewman(doc, x + dx, -y + dy, { front: meta.front, back: meta.back, dihedral: meta.dihedral ?? 60 }));
  }
  for (const meta of pictures) {
    if (meta.olomol !== 'bracket' || meta.corners?.length !== 2) continue;
    const [[x1, y1], [x2, y2]] = meta.corners;
    ids.push(addBracket(doc, x1 + dx, -y1 + dy, x2 + dx, -y2 + dy, { shape: meta.shape === 'round' ? 'round' : 'square', sup: meta.sup ?? '', sub: meta.sub ?? '' }).id);
  }
  for (const meta of pictures) {
    if (meta.olomol !== 'lonePair') continue;
    const id = atomAt(meta.atoms[0]);
    if (id !== undefined) doc.atoms.get(id).lonePairs = 'auto';
  }
  for (const meta of pictures) {
    if (meta.olomol !== 'arrow') continue;
    const end = ({ kind, atoms }) => {
      const found = atoms.map(atomAt);
      if (found.includes(undefined)) return null;
      if (kind === 'bond') {
        const bond = bondOf(found[0], found[1]);
        return bond === undefined ? null : { bond };
      }
      if (kind === 'newBond') return found.length === 2 ? { atom: found[1], newBond: found[0] } : null;
      return kind === 'radical' ? { atom: found[0], radical: true } : { atom: found[0] };
    };
    const [from, to] = [end(meta.from), end(meta.to)];
    const color = meta.color && meta.color !== 'black' ? meta.color : null;
    if (from && to) ids.push(addCurve(doc, from, to, meta.electrons === 1 ? 1 : 2, { color }).id);
  }
}
