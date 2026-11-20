// Opening, pasting, saving and exporting. Our own file format is KET (see
// ket.js); molfiles and SMILES are read and written here too; everything
// else (RXN, CDXML, CDX, SDF, CML, InChI) goes through Indigo.
import { OPEN_TYPES, opens } from './saving.js';
import { addArrow, addPlus, bondsByAtom, dropLooseCurves, emptyDoc, KINDS, repeatingUnits } from '../model/doc.js';
import { svgGrouping } from '../editor/grouping.js';
import { fragments } from '../model/graph.js';
import { buildScene } from '../render/scene.js';
import { sceneToSVG } from '../render/svg.js';
import { STYLE } from '../render/style.js';
import { endOnBonds, plainNewmans } from '../chem/newman.js';
import { withProjectionStereo } from '../chem/projections.js';
import { collapseGroups, withGroupsDrawnOut } from '../editor/abbreviate.js';
import { alignReadReaction } from '../arrange/align.js';
import { applyCdxmlHydrogens, attachmentPoints, isCdxml, prepareCdxml, takeCdxmlMarks } from './cdxml.js';
import { bytesOf, drawingInPng, drawingInSvg, pngWithResolution } from './embedded.js';
import { convert } from './indigo.js';
import { readKet, toKet, writeKet } from './ket.js';
import { isOlom, readOlom } from './olom.js';
import { parseMolfile, readMolfile, writeMolfile } from './molfile.js';
import { getRDKit, kekulize, smilesToMolfile } from './rdkit.js';
import { readMol } from './readMol.js';
import { explainSmiles, looksLikeSmiles } from './smiles.js';
import { electronsOf } from '../chem/valence.js';
import { oneReaction, REACTION_ARROWS } from './lost.js';
import { t } from '../i18n/i18n.js';

// --- reading ---

// A reaction SMILES (A>B>C), not a molecule's with a dative bond (N->[Pt], [Pt]<-N)
const isReactionSmiles = (text) => text.replace(/->|<-/g, '').includes('>');

// What kind of text this is: 'ket', 'molfile', 'rxn', 'picture' (an SVG's source), 'xml', 'xyz', 'inchi', 'smiles'.
export function sniff(text) {
  const t = text.trim();
  if (t.startsWith('{')) return 'ket';
  if (t.startsWith('$RXN') || t.startsWith('$RDFILE')) return 'rxn';
  // an SVG's source (copied from an exported picture): the drawing inside it
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(t)) return 'picture';
  if (/^<\?xml|^<CDXML|^<cml|<molecule/i.test(t)) return 'xml';
  // XYZ: a count, a comment, then "El x y z" lines
  if (/^\d+[ \t]*\r?\n.*\r?\n[ \t]*[A-Za-z]{1,2}[ \t]+-?\d+(\.\d*)?[ \t]+-?\d/.test(t)) return 'xyz';
  if (/M {2}END/.test(t)) return 'molfile';
  if (/^InChI=/.test(t)) return 'inchi';
  if (!t.includes('\n') || t.split('\n').every((line) => !/\s{3,}/.test(line.trim()))) return 'smiles';
  return 'unknown';
}

// Scales the objects with these ids so bonds are 1 long (unless `scale`
// is false) and moves their middle to `centre` (if given).
function normalize(doc, ids, centre, { scale: rescale = true } = {}) {
  const set = new Set(ids);
  const atoms = [...doc.atoms.values()].filter((a) => set.has(a.id));
  const lengths = [...doc.bonds.values()].filter((b) => set.has(b.id))
    .map((b) => Math.hypot(doc.atoms.get(b.a).x - doc.atoms.get(b.b).x, doc.atoms.get(b.a).y - doc.atoms.get(b.b).y))
    .filter((l) => l > 1e-4).sort((p, q) => p - q);
  const scale = rescale && lengths.length && Math.abs(lengths[Math.floor(lengths.length / 2)] - 1) > 0.05 ? 1 / lengths[Math.floor(lengths.length / 2)] : 1;
  const points = [];
  const each = (fn) => {
    for (const a of atoms) fn(a, 'x', 'y');
    for (const id of set) {
      const ends = doc.arrows.get(id) ?? doc.brackets.get(id);
      if (ends) {
        fn(ends, 'x1', 'y1');
        fn(ends, 'x2', 'y2');
      }
      for (const kind of ['pluses', 'texts']) if (doc[kind].has(id)) fn(doc[kind].get(id), 'x', 'y');
    }
  };
  each((o, kx, ky) => points.push([o[kx], o[ky]]));
  if (!points.length) return;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const middle = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const target = centre ?? [middle[0] * scale, middle[1] * scale];
  each((o, kx, ky) => {
    o[kx] = (o[kx] - middle[0]) * scale + target[0];
    o[ky] = (o[ky] - middle[1]) * scale + target[1];
  });
}

// Aromatic bonds (order 4, from some files) as alternating single and double bonds.
async function kekulizeAromatic(doc, ids) {
  const set = new Set(ids);
  if (![...doc.bonds.values()].some((b) => b.order === 4 && set.has(b.id))) return;
  const byAtom = bondsByAtom(doc);
  for (const members of fragments(doc, byAtom)) {
    if (!members.some((id) => byAtom.get(id).some((b) => b.order === 4))) continue;
    const { molfile, atomIds } = writeMolfile(doc, members);
    const kekule = await kekulize(molfile);
    if (!kekule) continue;
    const { doc: fixed, atomIds: fixedIds } = readMolfile(kekule);
    const index = new Map(atomIds.map((id, k) => [id, fixedIds[k]]));
    for (const bond of doc.bonds.values()) {
      if (bond.order !== 4 || !index.has(bond.a)) continue;
      const twin = [...fixed.bonds.values()].find((b) => (b.a === index.get(bond.a) && b.b === index.get(bond.b)) || (b.a === index.get(bond.b) && b.b === index.get(bond.a)));
      if (twin) bond.order = twin.order;
    }
  }
}

// Reads a file's text (any supported format) into `doc` (default: a new
// document). `centre`: where to put it (pasting); otherwise it keeps its
// place. Returns { doc, ids } (and `newer`: an .olom from a newer olomol, some parts not shown).
export async function readAny(text, { doc = emptyDoc(), centre = null, name = '', settings } = {}) {
  const byName = [[/\.(svg|png)$/i, 'picture'], [/\.(ket|json)$/i, 'ket'], [/\.(mol|sdf|sd)$/i, 'molfile'], [/\.(smi|smiles)$/i, 'smiles'], [/\.xyz$/i, 'xyz'], [/\.(cdx|cdxml|cml|rxn|rdf)$/i, 'indigo']];
  // (a reaction by its content: olomol's Molfile export of a reaction is an RXN file)
  // (olomol's own file by its content, whatever its name: also what olomol keeps in the browser, links, pictures)
  let kind = isOlom(text) ? 'olom' : sniff(text) === 'rxn' ? 'indigo' : byName.find(([pattern]) => pattern.test(name))?.[1] ?? sniff(text);
  if (kind === 'picture') {
    // a picture olomol exported: the drawing inside it (embedded.js); a PNG comes as base64 (textOf)
    const ket = /\.png$/i.test(name) ? drawingInPng(bytesOf(text)) : drawingInSvg(text);
    if (!ket) throw new Error(t('this picture has no drawing in it: only SVG and PNG pictures exported from olomol open as drawings'));
    text = ket;
    kind = isOlom(ket) ? 'olom' : 'ket';
  }
  if (kind === 'xyz') {
    // 3D coordinates without bonds: bonds, orders and stereo worked out, drawn in 2D
    const { xyzTo2D } = await import('./threeD.js');
    text = await xyzTo2D(text);
    kind = 'molfile';
  }
  if (kind === 'inchi') {
    // no coordinates in an InChI: Indigo reads it, RDKit draws it as a SMILES
    text = (await convert(text.trim(), 'smiles')).trim();
    kind = 'smiles';
  }
  let result;
  let chemDrawHydrogens = null;
  if (kind === 'olom') {
    result = readOlom(text, doc);
  } else if (kind === 'ket') {
    result = readKet(text, doc);
  } else if (kind === 'molfile' && !/^\$\$\$\$/m.test(text.trim().split('\n').slice(0, -1).join('\n'))) {
    const { atomIds } = readMolfile(text, doc);
    result = { doc, ids: [...atomIds, ...[...doc.bonds.values()].filter((b) => atomIds.includes(b.a)).map((b) => b.id)] };
  } else if (kind === 'smiles' && !isReactionSmiles(text)) {
    const ids = [];
    let x = 0;
    for (const smiles of smilesPieces(text)) {
      const placed = await placeSmiles(smiles, doc, x, 0);
      x = placed.right + 2.5;
      ids.push(...placed.ids);
    }
    result = { doc, ids };
  } else if (kind === 'smiles' && /^[^\s>]*>[^\s>]*>[^\s>]*(\s|$)/.test(text.trim().replace(/->|<-/g, '~~'))) {
    // a reaction SMILES (reactants>agents>products): each molecule drawn by RDKit as a SMILES of its own is, its
    // stereo kept (Indigo's drawing of a reaction had none), in a row with + and the arrow, the agents above it
    const [reactants, agents, products] = text.trim().split(/\s/)[0].split(/(?<!-)>/).map((part) => (part ? smilesPieces(part) : []).map((one) => (x, y) => placeSmiles(one, doc, x, y)));
    result = { doc, ids: await placeReaction(doc, { reactants, agents, products }) };
  } else if (kind === 'molfile' || (sniff(text) === 'rxn' && rxnMolfiles(text))) {
    // an SDF of several molecules side by side; an RXN (V2000) as a reaction SMILES is: read here as a molfile is
    // (Indigo's reading lost what a molfile says: a lone N with three unpaired electrons came back NH)
    const place = (molfile) => (x, y) => placeMolfile(molfile, doc, x, y);
    if (kind === 'molfile') {
      const ids = [];
      let x = 0;
      for (const record of text.split(/^\$\$\$\$[^\n]*$/m).filter((part) => /M {2}END/.test(part))) {
        const placed = await place(record)(x, 0);
        x = placed.right + 2.5;
        ids.push(...placed.ids);
      }
      result = { doc, ids };
    } else {
      const { reactants, products, agents } = rxnMolfiles(text);
      result = { doc, ids: await placeReaction(doc, { reactants: reactants.map(place), agents: agents.map(place), products: products.map(place) }) };
    }
  } else {
    // SDF with several records, reactions, CDXML, CDX, CML: through Indigo (CDXML with what Indigo
    // would lose marked: cdxml.js)
    let cdxml = isCdxml(text) && prepareCdxml(text);
    // (wedges that don't make a stereocentre Indigo can name, ChemDraw's templates among them, refuse the
    // whole file: read as drawn, olomol checks stereochemistry itself)
    const options = { 'ignore-stereochemistry-errors': true };
    let ket;
    try {
      ket = await convert(cdxml ? cdxml.text : text, 'ket', options);
    } catch (error) {
      // (should Indigo refuse the marked text, the file as it is, without what the marks keep)
      if (!cdxml) throw error;
      cdxml = null;
      ket = await convert(text, 'ket', options);
    }
    result = readKet(ket, doc, [0, 0], { valences: !isCdxml(text) && !/\.cdx$/i.test(name) });
    if (cdxml) chemDrawHydrogens = takeCdxmlMarks(result.doc, result.ids, cdxml);
  }
  await kekulizeAromatic(result.doc, result.ids);
  if (chemDrawHydrogens) {
    applyCdxmlHydrogens(result.doc, chemDrawHydrogens);
    result.ids = attachmentPoints(result.doc, result.ids); // (ChemDraw's squiggle across a bond's end: an R)
  }
  // our own files keep their exact geometry (unless pasted somewhere else)
  const ours = kind === 'olom' || (kind === 'ket' && text.includes('"olomol"'));
  // (our KET for Ketcher, written at Ketcher's size: back at the drawing's own)
  if (kind === 'ket' && result.scale && result.scale !== 1) scaleObjects(result.doc, result.scale, result.ids);
  if (!ours || centre) normalize(result.doc, result.ids, centre, { scale: !ours });
  // abbreviations the file has drawn out (ChemDraw's nicknames through Indigo, Ketcher's): labels again
  if (result.superatoms?.length) result.ids = await collapseGroups(result.doc, result.ids, result.superatoms);
  // a reaction without places for its "+" and arrow: placed as Align reaction does
  // (one reaction: an RDF of several leaves each where Indigo put it, apart)
  const reactions = text.trim().startsWith('$RDFILE') ? (text.match(/^\$RXN/gm) ?? []).length : 1;
  if ((sniff(text) === 'rxn' || (kind === 'smiles' && isReactionSmiles(text))) && reactions === 1) alignReadReaction(result.doc, result.ids, settings);
  return result;
}

// Our KET as Indigo's writers read it (in place), for `format`: a group label (R, X, SiR3; Ketcher's "A" with
// the label as its alias, which Indigo takes only in a query) as a label of its own, written as it is (a
// ChemDraw nickname), an atom list as one where the format has them;
// text also in the older form Indigo reads (data.content, as Ketcher's drafts: its runs as styled ranges), not
// only as paragraphs, which it leaves out.
function forIndigo(ket, format) {
  for (const value of Object.values(ket)) {
    for (const atom of value?.type === 'molecule' ? value.atoms ?? [] : []) {
      if (atom.label !== 'A' || !atom.alias) continue;
      // (an atom list, [C,N] or ![O,S]: one in a molfile, RXN or SDF, which hold them; a label in CDXML)
      const list = /^(!?)\[([A-Z][a-z]?(?:,[A-Z][a-z]?)+)\]$/.exec(atom.alias);
      if (list && format !== 'cdxml') {
        Object.assign(atom, { type: 'atom-list', elements: list[2].split(','), ...(list[1] && { notList: true }) });
        delete atom.label;
      } else {
        atom.label = atom.alias;
      }
      delete atom.alias;
    }
  }
  for (const node of ket.root.nodes) {
    if (node.type !== 'text' || !node.paragraphs || node.data) continue;
    const blocks = node.paragraphs.map((paragraph) => {
      let text = '';
      const inlineStyleRanges = [];
      for (const part of paragraph.parts ?? []) {
        const offset = text.length;
        text += part.text;
        for (const [flag, style] of [['bold', 'BOLD'], ['italic', 'ITALIC'], ['subscript', 'SUBSCRIPT'], ['superscript', 'SUPERSCRIPT']]) {
          if (part[flag] && part.text.length) inlineStyleRanges.push({ offset, length: part.text.length, style });
        }
      }
      return { text, inlineStyleRanges, entityRanges: [], data: {} };
    });
    const { x, y } = node.boundingBox ?? { x: 0, y: 0 };
    node.data = { content: JSON.stringify({ blocks, entityMap: {} }), position: { x, y, z: 0 } };
  }
  return ket;
}

// Whether a file holds molecules only (a molfile, SDF, SMILES, InChI, or an XYZ structure from a calculation),
// to go into the drawing there is, rather than a drawing (KET, a reaction, CDXML, CDX, CML).
export function holdsMolecules(text, name = '') {
  const kind = sniff(text);
  if (kind === 'rxn' || (kind === 'smiles' && isReactionSmiles(text)) || /\.(ket|json|cdx|cdxml|cml|rxn|rdf|svg|png)$/i.test(name)) return false;
  return /\.(mol|sdf|sd|smi|smiles|xyz)$/i.test(name) || ['molfile', 'smiles', 'inchi', 'xyz'].includes(kind);
}

// --- writing ---

// The molecules of a SMILES text: per line its SMILES (a name may follow, dots and all), split at its dots,
// unless a ring is closed across one (C1.C1).
function smilesPieces(text) {
  const closed = (piece) => {
    const open = new Set();
    for (const [label] of piece.replace(/\[[^\]]*\]/g, '').matchAll(/%\d\d|\d/g)) {
      if (!open.delete(label)) open.add(label);
    }
    return !open.size;
  };
  return text.trim().split(/\r?\n/).flatMap((line) => {
    const [smiles] = line.trim().split(/\s+/);
    if (!smiles) return [];
    const pieces = smiles.split(/\.(?![^[]*\])/).filter(Boolean);
    return pieces.every(closed) ? pieces : [smiles];
  });
}

// Everything in the drawing scaled by `factor` about (0, 0) (in place): atoms, arrows, pluses, texts, brackets
export function scaleObjects(doc, factor, ids = null) {
  const wanted = ids ? new Set(ids) : null;
  const kept = (o) => !wanted || wanted.has(o.id);
  for (const a of doc.atoms.values()) if (kept(a)) Object.assign(a, { x: a.x * factor, y: a.y * factor });
  for (const o of [...doc.arrows.values(), ...doc.brackets.values()]) if (kept(o)) Object.assign(o, { x1: o.x1 * factor, y1: o.y1 * factor, x2: o.x2 * factor, y2: o.y2 * factor });
  for (const o of [...doc.pluses.values(), ...doc.texts.values()]) if (kept(o)) Object.assign(o, { x: o.x * factor, y: o.y * factor });
  for (const arrow of doc.arrows.values()) if (kept(arrow) && arrow.ownLength !== undefined) arrow.ownLength *= factor;
}

// The drawing as Ketcher should read it: abbreviations (Ph, OMe) drawn out as its contracted groups (Ketcher shows
// Ph, and knows it is a phenyl; it took a label for an unknown atom), Haworth, Fischer and chair stereo as wedges.
// olomol, reading the file, takes both back (labels again, the bonds as drawn: ket.js). [doc, { ids, superatoms,
// projected }] for writeKet.
async function forKetcher(doc, ids) {
  const units = repeatingUnits(doc);
  const byAtomBefore = bondsByAtom(doc);
  const drawn = await withGroupsDrawnOut(doc, ids);
  let out = drawn.doc;
  const other = (bond, id) => (bond.a === id ? bond.b : bond.a);
  // each label as the atoms it was drawn out as, joined where the label was (to the atom it hung on)
  const superatoms = [];
  for (const [label, atoms] of drawn.drawnAs) {
    const [bond] = byAtomBefore.get(label) ?? [];
    const outside = bond ? other(bond, label) : null;
    const first = outside === null ? undefined : atoms.find((id) => [...out.bonds.values()].some((b) => (b.a === id && b.b === outside) || (b.b === id && b.a === outside)));
    superatoms.push({ name: doc.atoms.get(label).alias, atoms, attachment: first === undefined ? null : { atom: first, outside } });
  }
  // (a repeating unit with its labels drawn out: those atoms in it)
  // (only on the copy made in drawing out: the drawing itself untouched)
  if (drawn.drawnAs.size) for (const { bracket, atoms } of units) out.brackets.get(bracket.id).unitAtoms = atoms.flatMap((id) => drawn.drawnAs.get(id) ?? [id]);
  // Newman projections as the molecules they show, with wedges for their R/S, as the other formats have them (Ketcher
  // drew a six-armed star)
  if (endOnBonds(out).length) out = plainNewmans(out, { RDKit: await getRDKit(), writeMolfile, readMol, parseMolfile, fragments });
  // projection stereo as wedges; what each bond was, for olomol to take back
  const projected = new Map();
  const wedged = withProjectionStereo(out);
  for (const bond of wedged.bonds.values()) {
    const was = out.bonds.get(bond.id);
    if (was && (was.stereo !== bond.stereo || was.a !== bond.a)) projected.set(bond.id, { stereo: was.stereo || '', swapped: was.a !== bond.a });
  }
  out = wedged;
  // at the size Ketcher shows a drawing, its bonds 1 long on average (it scales the molecules, not the pictures of
  // lone pairs and curved arrows, which then stood beside their atoms); olomol, reading its file, scales it back
  const lengths = [...out.bonds.values()].map((b) => [out.atoms.get(b.a), out.atoms.get(b.b)]).filter(([a, b]) => a && b).map(([a, b]) => Math.hypot(a.x - b.x, a.y - b.y)).filter((l) => l > 1e-4);
  const mean = lengths.length ? lengths.reduce((sum, l) => sum + l, 0) / lengths.length : 1;
  // (the scale written only when the drawing was scaled by it: else reading it back would enlarge a drawing that
  // never shrank, a little more on each round trip)
  const scale = Math.abs(mean - 1) > 1e-3 ? mean : 1;
  if (scale !== 1) {
    if (out === doc) out = structuredClone(doc);
    scaleObjects(out, 1 / scale);
  }
  return [out, { ids: drawn.ids, superatoms, projected, scale }];
}

// The molecules of the one reaction among these objects (oneReaction), by side: { reactants, agents, products },
// each a list of atom ids (a molecule as drawn, a complex with its dative bonds whole). Those on the arrow are its
// agents; the others are before or after it along it (a retrosynthesis, target ⇒ precursors, the other way round).
function reactionSides(doc, ids) {
  const kept = (id) => !ids || ids.includes(id);
  const arrow = [...doc.arrows.values()].find((a) => kept(a.id) && REACTION_ARROWS.includes(a.kind));
  const length = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1) || 1;
  const [ux, uy] = [(arrow.x2 - arrow.x1) / length, (arrow.y2 - arrow.y1) / length];
  const sides = { reactants: [], agents: [], products: [] };
  for (const members of fragments(doc)) {
    const atoms = members.filter(kept).map((id) => doc.atoms.get(id));
    if (!atoms.length) continue;
    const [cx, cy] = ['x', 'y'].map((key) => (Math.min(...atoms.map((a) => a[key])) + Math.max(...atoms.map((a) => a[key]))) / 2);
    const along = (cx - arrow.x1) * ux + (cy - arrow.y1) * uy;
    const where = atoms.some((a) => a.arrow === arrow.id) || (along >= 0 && along <= length) ? 'agents' : (along < 0) !== (arrow.kind === 'retro') ? 'reactants' : 'products';
    sides[where].push(...atoms.map((a) => a.id));
  }
  return sides;
}

// The drawing as other programs' formats hold it (a copy where it differs): arrows that are no reaction (or all
// but one reaction's: oneReaction) left out, the molecules then alone; partial bonds (forming, breaking) left out,
// and for SMILES and InChI, as the standard has them, dative and hydrogen bonds too (a complex as its parts,
// N.N.Cl[Pt]Cl), each atom keeping its hydrogens as drawn (a transition state's O doesn't become water).
function forOtherPrograms(doc, ids, format) {
  const hasReaction = oneReaction(doc, ids, format);
  // (CDXML, held back, holds a scheme: left as it is)
  const arrows = format === 'cdxml' ? [] : [...doc.arrows.values()].filter((a) => !hasReaction || !REACTION_ARROWS.includes(a.kind));
  const pluses = hasReaction || format === 'cdxml' ? [] : [...doc.pluses.values()];
  const standard = ['smiles', 'inchi'].includes(format);
  const bonds = [...doc.bonds.values()].filter((b) => b.kind === 'partial' || (standard && (b.kind === 'dative' || b.kind === 'hbond')));
  if (!arrows.length && !pluses.length && !bonds.length) return { doc, hasReaction };
  const copy = structuredClone(doc);
  const byAtom = bondsByAtom(copy);
  for (const bond of bonds) {
    for (const id of [bond.a, bond.b]) {
      const atom = copy.atoms.get(id);
      if (atom && atom.hCount == null && atom.el !== '*') atom.hCount = electronsOf(atom, byAtom.get(id) ?? []).hydrogens;
    }
  }
  for (const bond of bonds) copy.bonds.delete(bond.id);
  for (const arrow of arrows) copy.arrows.delete(arrow.id);
  for (const plus of pluses) copy.pluses.delete(plus.id);
  return { doc: copy, hasReaction };
}

// A molecule's SMILES drawn into `doc`, its left edge at x, its middle at y: { ids, right } (a mistake in it said
// in words)
async function placeSmiles(smiles, doc, x, y) {
  let molfile;
  try {
    molfile = await smilesToMolfile(smiles);
  } catch (error) {
    // a SMILES with a mistake: what it is, in words
    const why = looksLikeSmiles(smiles) && explainSmiles(await getRDKit(), smiles);
    if (!why) throw error;
    throw new Error(why.fixed ? `${why.message} ${t('Did you mean {smiles}?', { smiles: why.fixed })}` : why.message);
  }
  const { atomIds } = readMolfile(molfile, doc);
  const atoms = atomIds.map((id) => doc.atoms.get(id));
  const [minX, minY, maxY] = [Math.min(...atoms.map((a) => a.x)), Math.min(...atoms.map((a) => a.y)), Math.max(...atoms.map((a) => a.y))];
  for (const a of atoms) {
    a.x += x - minX;
    a.y += y - (minY + maxY) / 2;
  }
  return { ids: [...atomIds, ...[...doc.bonds.values()].filter((b) => atomIds.includes(b.a)).map((b) => b.id)], right: Math.max(...atoms.map((a) => a.x)) };
}

// A molfile drawn into `doc` as placeSmiles draws a SMILES: { ids, right }
function placeMolfile(molfile, doc, x, y) {
  const { atomIds } = readMolfile(molfile, doc);
  const atoms = atomIds.map((id) => doc.atoms.get(id));
  if (!atoms.length) return { ids: [], right: x };
  const [minX, minY, maxY] = [Math.min(...atoms.map((a) => a.x)), Math.min(...atoms.map((a) => a.y)), Math.max(...atoms.map((a) => a.y))];
  for (const a of atoms) {
    a.x += x - minX;
    a.y += y - (minY + maxY) / 2;
  }
  const brackets = [...doc.brackets.values()].filter((b) => b.atoms?.some((id) => atomIds.includes(id))).map((b) => b.id);
  return { ids: [...atomIds, ...[...doc.bonds.values()].filter((b) => atomIds.includes(b.a)).map((b) => b.id), ...brackets], right: Math.max(...atoms.map((a) => a.x)) };
}

// The molfiles of a V2000 RXN by role: { reactants, products, agents }, or null (V3000, or not one)
function rxnMolfiles(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines[0].trim() !== '$RXN') return null;
  // (the counts in their columns, as the format has them: a line out of them, as RDKit's broken test file has, is
  // left to Indigo, which refuses it)
  const counts = lines[4] ?? '';
  if (!/^[ \d]{2}\d[ \d]{2}\d([ \d]{2}\d)?\s*$/.test(counts)) return null;
  const [nR, nP, nA] = [counts.slice(0, 3), counts.slice(3, 6), counts.slice(6, 9)].map((n) => parseInt(n, 10) || 0);
  const blocks = text.replace(/\r/g, '').split(/^\$MOL[^\n]*\n/m).slice(1);
  if (blocks.length !== nR + nP + nA || !blocks.every((block) => /V2000/.test(block))) return null;
  return { reactants: blocks.slice(0, nR), products: blocks.slice(nR, nR + nP), agents: blocks.slice(nR + nP) };
}

// A reaction drawn into `doc`: reactants and products in a row, + between them, the arrow, the agents above it
// (lined up afterwards, alignReadReaction). Each of the lists: functions (x, y) => { ids, right } that draw a
// molecule. Returns the new objects' ids.
async function placeReaction(doc, { reactants, agents, products }) {
  const ids = [];
  let x = 0;
  const row = async (list) => {
    for (const [k, one] of list.entries()) {
      if (k) {
        ids.push(addPlus(doc, x + 0.6, 0).id);
        x += 1.2;
      }
      const placed = await one(x, 0);
      ids.push(...placed.ids);
      x = placed.right + 0.6;
    }
  };
  await row(reactants);
  const start = x + 0.4;
  let above = start + 0.5;
  for (const one of agents) {
    const placed = await one(above, -2);
    ids.push(...placed.ids);
    above = placed.right + 1;
  }
  const end = Math.max(start + 3, above + 0.5);
  ids.push(addArrow(doc, start, 0, end, 0, 'forward').id);
  x = end + 1;
  await row(products);
  return ids;
}

// The document (or selected objects) in a format: 'ket', 'mol', 'sdf',
// 'smiles', 'rxn', 'cdxml', 'inchi', 'xyz' (3D). Returns text.
export async function writeAs(doc, format, ids = null, settings, watch = {}) {
  if (format === 'ket') {
    const [shown, extra] = await forKetcher(doc, ids);
    return writeKet(shown, { ...extra, settings });
  }
  // other programs get abbreviations (Ph, Boc) as the atoms they stand for (in a repeating unit's brackets those a
  // label in it stands for, wherever they are drawn)
  const units = repeatingUnits(doc);
  let drawnAs;
  ({ doc, ids, drawnAs } = await withGroupsDrawnOut(doc, ids));
  if (drawnAs.size) for (const { bracket, atoms } of units) doc.brackets.get(bracket.id).unitAtoms = atoms.flatMap((id) => drawnAs.get(id) ?? [id]);
  if (format === 'xyz') {
    const keep = new Set(ids ? ids.filter((id) => doc.atoms.has(id)) : doc.atoms.keys());
    if ([...keep].some((id) => doc.atoms.get(id).el === '*')) throw new Error(t('Labels such as R or X have no 3D structure: replace them with atoms first.'));
    // each molecule on its own, side by side
    const molecules = fragments(doc).map((members) => members.filter((id) => keep.has(id))).filter((members) => members.length);
    // (each as Turn in 3D reads it, so that a metal complex is built the same way: by UFF)
    const [{ writeXyz }, { describeMolecule }] = await Promise.all([import('./threeD.js'), import('../layout/relayout.js')]);
    const entries = molecules.map((members) => ({ molfile: writeMolfile(doc, members).molfile, molecule: describeMolecule(doc, members) }));
    // (the comment line in plain English: some programs read only ASCII there)
    const comment = ({ uff, conformers }) => {
      const complexes = 'optimised by UFF (universal force field) on the coordination polyhedron';
      const others = 'an RDKit ETKDG or OpenChemLib conformer, MMFF94s minimised';
      if (!uff) return `3D coordinates from olomol: ${others}`;
      if (!conformers) return `3D coordinates from olomol: ${uff > 1 ? 'metal complexes' : 'a metal complex'} ${complexes}`;
      return `3D coordinates from olomol: metal complexes ${complexes}, other molecules ${others}`;
    };
    return writeXyz(entries, comment, watch);
  }
  // Newman projections: other programs get the molecules drawn plainly, with wedges for their R/S
  if (!['smiles', 'inchi'].includes(format) && endOnBonds(doc).length) {
    doc = plainNewmans(doc, { RDKit: await getRDKit(), writeMolfile, readMol, parseMolfile, fragments });
  }
  let hasReaction;
  const drawn = doc;
  ({ doc, hasReaction } = forOtherPrograms(doc, ids, format));
  // a reaction as SMILES: each side's molecules by RDKit as a molecule's are, sides as drawn (Indigo, finding them by
  // where they stand, left a molecule out once the complex was in its parts)
  if (format === 'smiles' && hasReaction) {
    const RDKit = await getRDKit();
    const side = (members) => {
      if (!members.length) return '';
      const mol = readMol(RDKit, writeMolfile(doc, members).molfile, { removeHs: true });
      try {
        return mol.get_smiles();
      } finally {
        mol.delete();
      }
    };
    const { reactants, agents, products } = reactionSides(drawn, ids);
    return `${side(reactants)}>${side(agents)}>${side(products)}`;
  }
  // (dative and hydrogen bonds in a molfile; SMILES as the standard has it, without them: a complex as its parts,
  // N.N.Cl[Pt]Cl, not RDKit's N->[Pt] that other programs can't read)
  // molfiles, RXN and SDF written here, each molecule as a molfile is (Indigo, writing them from the drawing, found
  // a reaction's sides by where the molecules stand, and left out those off the arrow's line)
  const atomIds = ids ? ids.filter((id) => doc.atoms.has(id)) : null;
  const molfileOf = (members) => writeMolfile(doc, members, '', { kinds: true, units: true }).molfile;
  if (format === 'mol' && !hasReaction) return molfileOf(atomIds);
  if (format === 'sdf') {
    const keep = new Set(atomIds ?? doc.atoms.keys());
    return fragments(doc).map((members) => members.filter((id) => keep.has(id))).filter((members) => members.length)
      .map((members) => `${molfileOf(members)}\n$$$$\n`).join('');
  }
  if (format === 'rxn' && !hasReaction) throw new Error(t('An RXN file holds one reaction: this has no reaction arrow (or several). Export it as Molfile or SDF.'));
  if ((format === 'mol' || format === 'rxn') && hasReaction) {
    // (V2000 RXN: its reactants, products, then the agents on the arrow, each molecule a molfile)
    const sides = reactionSides(doc, ids);
    const molecules = (members) => {
      const keep = new Set(members);
      return fragments(doc).map((all) => all.filter((id) => keep.has(id))).filter((part) => part.length);
    };
    const [reactants, products, agents] = [molecules(sides.reactants), molecules(sides.products), molecules(sides.agents)];
    const pad = (n) => String(n).padStart(3);
    return ['$RXN', '', '      olomol', '', `${pad(reactants.length)}${pad(products.length)}${agents.length ? pad(agents.length) : ''}`,
      ...[...reactants, ...products, ...agents].flatMap((members) => ['$MOL', molfileOf(members)])].join('\n') + '\n';
  }
  if (format === 'smiles' && !hasReaction) {
    const RDKit = await getRDKit();
    const mol = readMol(RDKit, writeMolfile(doc, ids ? ids.filter((id) => doc.atoms.has(id)) : null).molfile, { removeHs: true });
    try {
      return mol.get_smiles();
    } finally {
      mol.delete();
    }
  }
  if (format === 'inchi') {
    // (an InChI is of elements only: RDKit's of a drawing with a label is empty, a file with nothing in it)
    if ([...doc.atoms.values()].some((a) => a.el === '*' && (!ids || ids.includes(a.id)))) throw new Error(t('Labels such as R or X have no InChI: replace them with atoms first, or select the molecules without them.'));
    const RDKit = await getRDKit();
    const mol = readMol(RDKit, writeMolfile(doc, ids ? ids.filter((id) => doc.atoms.has(id)) : null).molfile);
    try {
      return mol.get_inchi();
    } finally {
      mol.delete();
    }
  }
  // Indigo reads wedges only: Haworth and Fischer stereo written as wedges
  // (no repeating units for SMILES and InChI, which Indigo writes in a notation of its own, CC{-}C{+n}C)
  const ket = JSON.stringify(forIndigo(toKet(withProjectionStereo(doc), { ids, settings, pictures: false, units: !['smiles', 'inchi'].includes(format) }), format));
  // (wedges that don't make a stereocentre Indigo can name are written as drawn, as when reading)
  const options = { 'ignore-stereochemistry-errors': true, ...(format === 'mol' || format === 'rxn' || format === 'sdf' ? { 'molfile-saving-mode': '2000' } : {}) };
  return convert(ket, format === 'mol' && hasReaction ? 'rxn' : format, options);
}

// (`held`: written as ever, but not offered in the Export menu until it is checked in the programs that
// read it: RXN in a reaction program, CDXML in ChemDraw)
export const FORMATS = {
  ket: { label: t('KET (Ketcher)'), ext: 'ket', mime: 'application/json' },
  mol: { label: 'Molfile', ext: 'mol', mime: 'chemical/x-mdl-molfile' },
  sdf: { label: 'SDF', ext: 'sdf', mime: 'chemical/x-mdl-sdfile' },
  rxn: { label: t('RXN (reaction)'), ext: 'rxn', mime: 'chemical/x-mdl-rxnfile', held: true },
  cdxml: { label: t('CDXML (ChemDraw)'), ext: 'cdxml', mime: 'application/xml', held: true },
  smiles: { label: 'SMILES', ext: 'smi', mime: 'text/plain' },
  inchi: { label: 'InChI', ext: 'txt', mime: 'text/plain' },
  xyz: { label: t('XYZ (3D coordinates)'), ext: 'xyz', mime: 'chemical/x-xyz' },
};

// --- pictures ---

// The drawing as a standalone SVG file (black ink; `colors`: keep element
// and other colours, else black and white). `ids`: only these objects.
// `stereo`: R/S and E/Z labels (stereo.js) for the atoms and bonds that ask for theirs.
export function svgOf(doc, settings, { ids = null, scale = STYLE.exportScale, background = null, stereo = null } = {}) {
  let part = doc;
  if (ids) {
    part = structuredClone(doc);
    const keep = new Set(ids);
    // (ring fills, orbitals and the lines between them go with their atoms, below)
    for (const kind of KINDS) for (const id of [...(part[kind]?.keys() ?? [])]) if (!keep.has(id) && !['fills', 'orbitals', 'overlaps'].includes(kind)) part[kind].delete(id);
    for (const orbital of [...(part.orbitals?.values() ?? [])]) if (!part.atoms.has(orbital.atom)) part.orbitals.delete(orbital.id);
    for (const overlap of [...(part.overlaps?.values() ?? [])]) if (!part.orbitals.has(overlap.a) || !part.orbitals.has(overlap.b)) part.overlaps.delete(overlap.id);
    for (const fill of [...part.fills.values()]) if (!fill.atoms.every((id) => keep.has(id))) part.fills.delete(fill.id);
    for (const bond of [...part.bonds.values()]) if (!part.atoms.has(bond.a) || !part.atoms.has(bond.b)) part.bonds.delete(bond.id);
    dropLooseCurves(part); // (a curved arrow selected without what it runs between: not drawn from nothing)
  }
  // (the drawing's groups as SVG groups)
  return sceneToSVG(buildScene(part, { ...settings, ink: '#000000' }, { stereo }), { scale, background, grouping: svgGrouping(part) });
}

// The SVG as a PNG blob, `pixelRatio` times its size, saying so (96 × pixelRatio dpi: on paper as large as the SVG)
export function pngOf(svg, pixelRatio = 4, background = null) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(image.width * pixelRatio);
      canvas.height = Math.ceil(image.height * pixelRatio);
      const ctx = canvas.getContext('2d');
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error(t('PNG export failed')));
        else blob.arrayBuffer().then((bytes) => resolve(new Blob([pngWithResolution(new Uint8Array(bytes), 96 * pixelRatio)], { type: 'image/png' })), reject);
      }, 'image/png');
    };
    image.onerror = () => reject(new Error(t('PNG export failed')));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// --- files on disk ---

export function download(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Asks for a file and returns { name, text } (CDX, a binary format, as base64).

// A file's text (CDX and PNG, binary formats, as base64)
export async function textOf(file) {
  if (!/\.(cdx|png)$/i.test(file.name)) return file.text();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export { OPEN_TYPES, opens };

export function pickFile(accept = OPEN_TYPES) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ name: file.name, text: await textOf(file) });
    };
    input.click();
  });
}

// The browser's file dialogs (Chrome, Edge), which give olomol the file itself to write again; not in the
// browser check, unless it puts its own in their place (window.olomolTestPickers: scripts/check/12-saving.mjs)
export const canPick = (name) => typeof window !== 'undefined' && name in window
  && (!new URLSearchParams(location.search).has('test') || Boolean(window.olomolTestPickers));

// A file the browser gave (a handle: from its dialog, a drop, the file manager; else a File) read for opening:
// { name, text, handle, modified }
export async function readGiven(given) {
  const handle = given.kind === 'file' && given.getFile ? given : null;
  const file = handle ? await handle.getFile() : given;
  return { name: file.name, text: await textOf(file), handle, modified: handle ? file.lastModified : null };
}

// Asks for a file to open: { name, text, handle, modified } (handle and modified, the file's last change, where
// the browser gives the file itself: Chrome, Edge), or null if none was chosen
export async function openPicked() {
  if (canPick('showOpenFilePicker')) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Drawings and molecules', accept: { 'application/octet-stream': OPEN_TYPES.split(',') } }] });
      const file = await handle.getFile();
      return { name: file.name, text: await textOf(file), handle, modified: file.lastModified };
    } catch (error) {
      if (error.name === 'AbortError') return null;
      console.warn('[open] no open dialog, the file chooser instead:', error);
    }
  }
  return pickFile();
}

