// Everything needed to draw the document, worked out once per change: atom
// labels, bond shapes, electrons, curved arrow paths, reaction arrows and
// text. Drawing (svg.js), hit testing and the debug view all read from it.
import { spreadCharges } from '../chem/delocalize.js';
import { cachedNumbering } from '../chem/numbering.js';
import { elementColor } from '../chem/elements.js';
import { endOnBonds, NEWMAN_RADIUS } from '../chem/newman.js';
import { electronsByAtom, RADICAL_PLACES } from '../chem/valence.js';
import { bondsByAtom, bracketMembers, curveEndsThere, orbitalAngle, otherEnd, ringIntact } from '../model/doc.js';
import { fragmentIndex, fragments, ringList, smallestRings } from '../model/graph.js';
import { boldBonds, bondShapes, dashSide, doubleBondRule } from './bonds.js';
import { crowdedLabelSide, hasLabel, hydrogenSide, layoutLabel } from './labels.js';
import { lobeSpans, orbitalLobes, overlapLine, SHADE } from './orbitals.js';
import { angleBetween, arrowCandidates, arrowGeometry, distinctCandidates, electronAngles, electronLayout, pickCurve, shownPairs } from './mechanism.js';
import { INK, STYLE } from './style.js';
import { CAP_HEIGHT, formatRuns, runsWidth, textWidth } from './text.js';

export const DEFAULT_SETTINGS = {
  colorMode: 'element', // or 'mono': black and white
  terminalCarbons: true, // write CH3 at chain ends
  allCarbons: false, // write every carbon (CH2, CH, C)
  showLinks: false, // show the links that keep molecules together (on screen only)
  pairStyle: 'dots', // or 'bars' (Lewis)
  arrowColor: null, // colour of new curved arrows (null: like the bonds)
  chargeStyle: 'plain', // or 'circled': ⊕ and ⊖
  aromaticStyle: 'circle', // aromatic rings: a circle inside, or 'dashed' (the circle dashed)
  dativeStyle: 'arrow', // coordination bonds in the page: arrows (donor → acceptor) or 'line's
  whiteBackground: false, // pictures exported or copied on white (else see-through)
  style: 'screen', // line widths and label sizes: 'screen' or 'acs' (ACS 1996, see style.js)
  ink: INK,
};

const DEGREE = Math.PI / 180;
const LINEAR = 165 * DEGREE; // bonds this straight make a corner invisible
const DOT_GAP = { boxes: [{ x1: -0.055, y1: -0.055, x2: 0.055, y2: 0.055, margin: 0.045 }] };

// The smallest rings of the last document drawn, kept while its bonds are the same: a drag moves atoms
// only, and finding the rings of a large drawing at every step of it takes long; Redraw's drawings of a
// molecule have its bonds too (read only: shared)
let lastRings = { key: null, rings: null };
export function ringsOf(doc, byAtom = bondsByAtom(doc)) {
  let key = '';
  for (const bond of doc.bonds.values()) key += `${bond.id},${bond.a},${bond.b},${bond.kind ?? ''};`;
  if (lastRings.key !== key) lastRings = { key, rings: smallestRings(doc, byAtom) };
  return lastRings.rings;
}

export function buildScene(doc, settingsGiven = DEFAULT_SETTINGS, { debug = false, stereo = null } = {}) {
  // (charges circled and lone pairs as bars are the drawing's style, as its sizes are: its own, in its file; a
  // drawing with none follows the settings, the style for new drawings)
  const settings = doc.style ? { ...settingsGiven, chargeStyle: doc.style.charges ?? 'plain', pairStyle: doc.style.lonePairs ?? 'dots' } : settingsGiven;
  const ink = settings.ink ?? INK;
  const byAtom = bondsByAtom(doc);
  const electrons = electronsByAtom(doc, byAtom);
  const frags = fragments(doc, byAtom);
  const fragOf = fragmentIndex(frags);
  const rings = ringsOf(doc, byAtom);
  const pos = (id) => {
    const atom = doc.atoms.get(id);
    return [atom.x, atom.y];
  };
  // Newman projections: bonds seen end on, their front atom in the middle, the back one the circle
  const axles = endOnBonds(doc);
  const axleIds = new Set(axles.map((b) => b.id));
  const backAt = new Map(axles.map((b) => [b.b, [doc.atoms.get(b.b).x, doc.atoms.get(b.b).y]])); // back atom -> the circle's middle
  const inNewman = new Set(axles.flatMap((b) => [b.a, b.b]));
  // a group on a Newman projection's front carbon writes its hydrogens on the side no back bond crosses
  const backBonds = new Map(); // front atom -> the back's bonds as segments, rim to atom
  for (const axle of axles) {
    const centre = backAt.get(axle.b);
    backBonds.set(axle.a, byAtom.get(axle.b).filter((b) => b !== axle).map((b) => {
      const to = doc.atoms.get(otherEnd(b, axle.b));
      return [centre, [to.x, to.y]];
    }));
  }
  const newmanHSide = (atom) => {
    const front = byAtom.get(atom.id).map((b) => otherEnd(b, atom.id)).find((id) => backBonds.has(id));
    if (front === undefined) return null;
    // (a back bond through where they'd be written, or a back group's label beside them)
    const crosses = (x1, x2) => backBonds.get(front).some(([p, q]) => Array.from({ length: 21 }, (_, k) => k / 20).some((t) => {
      const [x, y] = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      return x > atom.x + x1 && x < atom.x + x2 && Math.abs(y - atom.y) < (t === 1 ? 0.6 : 0.2);
    }));
    if (crosses(0.12, 0.95) && !crosses(-0.95, -0.12)) return 'left';
    if (crosses(-0.95, -0.12) && !crosses(0.12, 0.95)) return 'right';
    return null;
  };
  const centroids = frags.map((members) => {
    const sum = members.reduce((s, id) => [s[0] + doc.atoms.get(id).x, s[1] + doc.atoms.get(id).y], [0, 0]);
    return [sum[0] / members.length, sum[1] / members.length];
  });

  // Atoms: where their electrons go (lone pairs, shown or not: arrows start
  // at them; unpaired electrons), then their labels (the charge goes to a
  // corner the electrons leave free), then the electrons' exact places.
  // Electrons of an atom an arrow starts from turn towards its target.
  // (and each fishhook from its unpaired electrons has an electron of its own facing where it goes: aims, by
  // curve, so that the arrow starts at just that one: tails)
  const facing = new Map();
  const aims = new Map();
  for (const curve of doc.curves.values()) {
    const from = doc.atoms.get(curve.from.atom);
    const orbital = curve.to.orbital !== undefined ? doc.orbitals?.get(curve.to.orbital) : null;
    const to = orbital ? doc.atoms.get(orbital.atom) : curve.to.atom !== undefined ? doc.atoms.get(curve.to.atom) : doc.bonds.get(curve.to.bond);
    if (!from || !to) continue;
    const [tx, ty] = to.el ? [to.x, to.y] : [(doc.atoms.get(to.a).x + doc.atoms.get(to.b).x) / 2, (doc.atoms.get(to.a).y + doc.atoms.get(to.b).y) / 2];
    const angle = Math.atan2(ty - from.y, tx - from.x);
    if (!facing.has(from.id)) facing.set(from.id, angle);
    if (curve.from.radical) aims.set(from.id, [...(aims.get(from.id) ?? []), { curve: curve.id, angle }]);
  }
  // the directions of the orbitals' lobes on each atom (written hydrogens keep out of them), and every lobe
  // with its width (a charge isn't written where one runs)
  const lobeAngles = new Map();
  const lobeWidths = new Map();
  for (const orbital of doc.orbitals?.values() ?? []) {
    if (orbital.kind === 's' || !doc.atoms.has(orbital.atom)) continue;
    const a = orbitalAngle(doc, orbital);
    const list = lobeAngles.get(orbital.atom) ?? [];
    list.push(a, ...(orbital.kind === 'p' ? [a + Math.PI] : []));
    lobeAngles.set(orbital.atom, list);
    lobeWidths.set(orbital.atom, [...(lobeWidths.get(orbital.atom) ?? []), ...lobeSpans(doc, orbital)]);
  }
  // delocalized bonds: circles in aromatic rings, charges spread (δ−) or in a ring's middle
  const spread = spreadCharges(doc, rings, byAtom);
  const ringAtoms = ringList(rings);
  const circles = ringAtoms.filter((ring) => ring.length >= 5 && ring.length <= 7
    && ring.every((id, k) => byAtom.get(id).find((bond) => otherEnd(bond, id) === ring[(k + 1) % ring.length])?.delocalized));
  const circled = new Set(circles.flatMap((ring) => ring.map((id, k) => byAtom.get(id).find((bond) => otherEnd(bond, id) === ring[(k + 1) % ring.length]).id)));
  // where dashed second lines leave each atom, so charges keep clear of them
  const dashes = new Map();
  for (const bond of doc.bonds.values()) {
    if (!bond.delocalized || bond.order > 2 || circled.has(bond.id)) continue;
    const side = dashSide(bond, { pos, bondsAt: (id) => byAtom.get(id), ring: rings.get(bond.id) });
    const [a, b] = [pos(bond.a), pos(bond.b)];
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (const [id, direction, turn] of [[bond.a, angle, side], [bond.b, angle + Math.PI, -side]]) {
      dashes.set(id, [...(dashes.get(id) ?? []), direction + turn * 25 * DEGREE]);
    }
  }
  // atom numbers: IUPAC, worked out again, for molecules that ask for them
  // (atom.autoNumber); else the numbers set by hand
  const numbering = new Map(); // molecule index -> its IUPAC numbering
  const shownNumbers = new Map();
  frags.forEach((members, k) => {
    if (members.some((id) => doc.atoms.get(id).autoNumber)) {
      const result = cachedNumbering(doc, members, byAtom);
      numbering.set(k, result);
      for (const [id, n] of result.numbers) shownNumbers.set(id, n);
    } else {
      for (const id of members) if (doc.atoms.get(id).number != null) shownNumbers.set(id, doc.atoms.get(id).number);
    }
  });
  // from each ring atom towards its ring's middle: labels beside it keep out
  const inward = new Map();
  for (const ring of ringAtoms) {
    const [cx, cy] = centroid(ring.map(pos));
    for (const id of ring) inward.set(id, [...(inward.get(id) ?? []), Math.atan2(cy - doc.atoms.get(id).y, cx - doc.atoms.get(id).x)]);
  }
  const atoms = new Map();
  for (const atom of doc.atoms.values()) {
    // (a Newman projection's carbons: the bond seen end on has no direction on the page)
    const bonds = byAtom.get(atom.id).filter((bond) => bond.kind !== 'link' && !axleIds.has(bond.id));
    const bondAngles = bonds.map((bond) => {
      const other = doc.atoms.get(otherEnd(bond, atom.id));
      return Math.atan2(other.y - atom.y, other.x - atom.x);
    });
    const e = electrons.get(atom.id);
    // a delocalized charge is written as δ±, or in the ring's middle; a δ
    // set by hand goes with the label, or beside a corner without one
    const spreadPartial = spread.partial.get(atom.id);
    const partial = spreadPartial ?? (atom.charge ? 0 : atom.partialCharge || 0);
    let shown = spreadPartial || spread.hidden.has(atom.id) ? { ...atom, charge: 0 } : atom;
    const turnedAside = !atom.hSide && backBonds.size ? newmanHSide(atom) : null;
    if (turnedAside) shown = { ...shown, hSide: turnedAside };
    // (a Newman projection's carbons are the point and the circle: no label; another atom in front has its
    // own, where the point was. The back one stays the circle: its label would sit on the front's point)
    const quiet = inNewman.has(atom.id) && (backAt.has(atom.id) || (atom.el === 'C' && !atom.alias));
    const labelled = !quiet && (Boolean(spreadPartial) || hasLabel(shown, bonds.length, e, settings));
    // (written the other way round where its usual side runs into another atom: HO beside a drawn H)
    if (labelled) {
      const near = [];
      for (const other of doc.atoms.values()) {
        const [dx, dy] = [other.x - atom.x, other.y - atom.y];
        if (other !== atom && Math.abs(dx) < 3 && Math.abs(dy) < 1) near.push([dx, dy]);
      }
      const aside = crowdedLabelSide(shown, bondAngles, e.hydrogens, near);
      if (aside) shown = { ...shown, hSide: aside };
    }
    // (written hydrogens keep out of the way of orbitals' lobes as of bonds: NH beside a p orbital)
    const hSide = labelled && e.hydrogens > 0 ? hydrogenSide(shown, [...bondAngles, ...(lobeAngles.get(atom.id) ?? [])]) : null;
    if (hSide && lobeAngles.has(atom.id)) shown = { ...shown, hSide }; // (the label writes them there too)
    const want = atom.lonePairs;
    const pairs = want === null || want === undefined ? 0 : want === 'auto' ? e.lonePairs : Math.min(want, 4);
    const dots = RADICAL_PLACES[atom.radical ?? 0] ?? [];
    const angles = electronAngles({ bondAngles, hSide, labelled }, Math.max(e.lonePairs, pairs), dots.length, facing.get(atom.id) ?? null, (aims.get(atom.id) ?? []).map((aim) => aim.angle));
    const avoid = [...shownPairs(angles.pairs, pairs), ...angles.radicals, ...(dashes.get(atom.id) ?? [])];
    // (double and triple bonds: their lines lie either side of the angle, where a charge mustn't go)
    const wide = bonds.flatMap((bond, k) => (bond.order > 1 && !bond.kind ? [bondAngles[k]] : []));
    const labelOptions = { circled: settings.chargeStyle === 'circled', partial, wide, lobes: lobeWidths.get(atom.id) ?? [] };
    const label = labelled ? layoutLabel(shown, bondAngles, e.hydrogens, avoid, labelOptions) : null;
    // (an atom with too many bonds keeps its colour: the canvas rings it, chem.error)
    const color = atom.color ?? (settings.colorMode === 'element' ? elementColor(atom.el) ?? ink : ink);
    const info = { atom, pos: [atom.x, atom.y], bondAngles, degree: bonds.length, label, labelled, hSide, color, chem: e, inward: inward.get(atom.id) ?? [] };
    // a corner in a straight line (C≡C–C, C=C=C) can't be seen: a dot marks it
    info.straight = !label && !inNewman.has(atom.id) && bonds.length === 2 && angleBetween(bondAngles[0], bondAngles[1]) > LINEAR;
    info.electrons = electronLayout(info, angles, pairs, dots, settings.pairStyle === 'bars');
    // (the fishhook each of the first unpaired places was turned towards: its start)
    info.electrons.startOf = new Map((aims.get(atom.id) ?? []).slice(0, angles.aimed).map((aim, k) => [aim.curve, k]));
    // a δ, or the charge of a carbon not written (C⁺ as a + at the corner), beside the corner
    const bare = !label && !quiet && shown.charge ? shown.charge : 0;
    const markAt = (taken) => (bare ? chargeMark(info.pos, taken, bare, labelOptions.circled) : cornerMark(info.pos, taken, `δ${partial > 0 ? '+' : '−'}`));
    if ((partial || bare) && !label) info.mark = markAt([...bondAngles, ...avoid]);
    // the δ (or that charge) again, keeping out of these directions too (curved arrows, see below)
    if (partial || bare) {
      info.placePartial = (away) => {
        if (label) info.label = layoutLabel(shown, bondAngles, e.hydrogens, [...avoid, ...away], labelOptions);
        else info.mark = markAt([...bondAngles, ...avoid, ...away]);
      };
    }
    if (shownNumbers.has(atom.id)) info.number = numberMark(info, shownNumbers.get(atom.id));
    atoms.set(atom.id, info);
  }

  // bonds
  const bold = boldBonds(doc.bonds.values(), (id) => byAtom.get(id));
  const bondCtx = {
    pos,
    dativeLines: settings.dativeStyle === 'line',
    bondsAt: (id) => byAtom.get(id).filter((bond) => bond.kind !== 'link'),
    bold: (bond) => bold.has(bond.id),
    circled: (bond) => circled.has(bond.id),
    degree: (id) => atoms.get(id).degree,
    labelled: (id) => Boolean(atoms.get(id).label),
    straight: (id) => atoms.get(id).straight,
    neighbours: (id) => byAtom.get(id).filter((bond) => bond.kind !== 'link').map((bond) => otherEnd(bond, id)),
    // bonds stop short of a corner's dot too (C≡C–C), so it stands free
    label: (id) => atoms.get(id).label ?? (atoms.get(id).straight ? DOT_GAP : null),
  };
  const bonds = new Map();
  for (const bond of doc.bonds.values()) {
    const ctx = { ...bondCtx, ring: rings.get(bond.id), centroid: centroids[fragOf.get(bond.a)] };
    let shapes = bond.kind === 'link' ? { lines: [], polygons: [], paths: [] } : axleIds.has(bond.id) ? newmanCircle(pos(bond.b)) : bondShapes(bond, ctx);
    // a bond from a Newman projection's back carbon starts at the circle
    for (const end of [bond.a, bond.b]) {
      if (!backAt.has(end) || axleIds.has(bond.id)) continue;
      shapes = { ...shapes, lines: shapes.lines.flatMap((line) => cutLine(line, backAt.get(end), NEWMAN_RADIUS)) };
    }
    bonds.set(bond.id, {
      bond, a: bond.a, b: bond.b, shapes, color: bond.color ?? ink, extent: bondExtent(pos(bond.a), pos(bond.b), shapes),
      // (where its second line is drawn, set by hand or not: the panel moves it on from there)
      ...(bond.order === 2 && !bond.kind && (({ side, rule }) => ({ side, ...(debug && { rule }) }))(doubleBondRule(bond, ctx))),
      ...(debug && bold.has(bond.id) && { rule: 'bold: between the wide ends of wedges' }),
      ...(debug && bond.delocalized && { rule: circled.has(bond.id) ? 'delocalized: in a ring with a circle' : 'delocalized: dashed second line' }),
    });
  }

  // bonds crossing on the page: the one behind (bond.z, from a 3D view) broken where the one in front goes over it
  breakCrossings(bonds, pos, bold);

  const scene = {
    doc,
    settings,
    atoms,
    bonds,
    pos,
    frags,
    fragOf,
    numbering,
    bonded: (a, b) => byAtom.get(a)?.some((bond) => otherEnd(bond, a) === b) ?? false,
    rings: ringAtoms, // atom ids around each ring
    newmanBacks: backAt, // Newman projections' back atoms -> their circle's middle
    newmanFronts: new Set(axles.map((b) => b.a)),
    newmanAxles: axleIds,
    ringPolygons: ringAtoms.map((ring) => ring.map(pos)),
    fills: [...doc.fills.values()].filter((fill) => ringIntact(doc, fill, byAtom)).map((fill) => ({ fill, polygon: fillPolygon(fill.atoms.map((id) => atoms.get(id))) })),
    // (`atom`: one of the ring's, for the molecule it is drawn with)
    circles: circles.map((ring) => ({ ...aromaticCircle(ring.map(pos), ring.map((id, k) => doc.bonds.get(byAtom.get(id).find((b) => otherEnd(b, id) === ring[(k + 1) % ring.length]).id).color), ink), dashed: settings.aromaticStyle === 'dashed', atom: ring[0] })),
    // (circled as the atoms' charges are, with ⊕ and ⊖ set)
    ringCharges: spread.centred.map(({ ring, charge }) => ({ at: centroid(ring.map(pos)), text: chargeText(charge), charge, circled: settings.chargeStyle === 'circled', color: ink, atom: ring[0] })),
    curves: new Map(),
    arrows: new Map(),
    pluses: new Map(),
    texts: new Map(),
    brackets: new Map(),
    stereo: stereo ? stereoMarks(stereo, atoms, bonds, pos, ringAtoms.map((ring) => ring.map(pos))) : [], // (only for atoms and bonds with cipLabel)
  };

  // orbitals on atoms (behind their molecule's bonds), and the dashed lines between them
  scene.orbitals = new Map();
  for (const orbital of doc.orbitals?.values() ?? []) {
    if (!atoms.has(orbital.atom)) continue;
    // (shade: the shaded lobe's colour; other: the other phase's, white unless painted)
    scene.orbitals.set(orbital.id, { orbital, lobes: orbitalLobes(doc, orbital, atoms.get(orbital.atom)), shade: orbital.color ?? SHADE, other: orbital.colorOther ?? null, ink });
  }
  scene.overlaps = new Map();
  for (const overlap of doc.overlaps?.values() ?? []) {
    const [a, b] = [scene.orbitals.get(overlap.a), scene.orbitals.get(overlap.b)];
    const line = a && b && overlapLine(a.lobes, b.lobes, overlap);
    if (line) scene.overlaps.set(overlap.id, { overlap, line, color: overlap.color ?? ink });
  }

  // (ends and at: where they were when the scene was made, as an atom's pos, while a drag moves them)
  for (const arrow of doc.arrows.values()) scene.arrows.set(arrow.id, { arrow, ends: [arrow.x1, arrow.y1, arrow.x2, arrow.y2], ...arrowShapes(arrow), color: arrow.color ?? ink });
  for (const plus of doc.pluses.values()) scene.pluses.set(plus.id, { plus, at: [plus.x, plus.y], color: plus.color ?? ink });
  // a text on one of a molecule's anchors is placed by the molecule, one on
  // an arrow by the arrow (anchored: true); molecules on arrows are moved
  // there by the editor (scene.arrowMoves)
  const anchored = placeAnchored(doc, atoms, frags, fragOf);
  Object.assign(scene, placeOnArrows(doc, scene, anchored, ink));
  for (const arc of scene.arrowArcs.values()) (scene.arrows.get(Number(arc.key.split('|')[0])).arcs ??= []).push(arc);
  for (const text of doc.texts.values()) {
    const placed = anchored.get(text.id);
    scene.texts.set(text.id, { text, at: placed ? [placed.x, placed.y] : [text.x, text.y], ...layoutText(placed ?? text), color: text.color ?? ink, anchored: Boolean(placed) });
  }
  for (const bracket of doc.brackets.values()) scene.brackets.set(bracket.id, { bracket, ...bracketShapes(bracket), color: bracket.color ?? ink });
  // curved arrows, each keeping clear of the ones before it
  const done = [];
  const curveList = [...doc.curves.values()];
  for (const curve of curveList) {
    // (one whose start or end has gone is left out, not drawn from nothing: a page without the drawing)
    if (!curveEndsThere(doc, curve) || [curve.from, curve.to].some((end) => end.orbital !== undefined && !scene.orbitals.has(end.orbital))) continue;
    const candidates = arrowCandidates(scene, curve, done, { paired: pairedFirst(doc, curveList, curve) });
    const { best, variant } = pickCurve(candidates, curve);
    if (!best) continue;
    // (`shape`, `tip`, `variant`: the curve drawn, kept with the arrow for its file: editor.js; ways: how many that
    // look different it has, for the panel's Other way to go round them)
    const geometry = { ...arrowGeometry(best, curve.electrons), color: curve.color ?? ink, curve, tailKey: best.tail.key, headNormal: best.head.normal ?? null,
      shape: best.shape, tip: best.tip, variant, ways: distinctCandidates(candidates, 6).length };
    if (debug) geometry.debug = { best, candidates: candidates.slice(0, 12) };
    scene.curves.set(curve.id, geometry);
    done.push(geometry);
  }
  if (scene.curves.size) for (const info of atoms.values()) if (info.placePartial) clearOfArrows(info, scene.curves);

  return scene;
}

// Curved arrows keep the curve they are drawn as (curve.drawn: [p0, p1, p2, p3], a cubic Bézier, and the tip of its
// head), for their files: after each drawing of the scene (the editor), or before writing one (scripts)
export function keepDrawnCurves(doc, scene) {
  const r4 = (p) => p.map((v) => +v.toFixed(4));
  for (const [id, drawn] of scene.curves) {
    const curve = doc.curves.get(id);
    if (curve) curve.drawn = { points: [drawn.shape.p0, drawn.shape.p1, drawn.shape.p2, drawn.shape.p3].map(r4), tip: r4(drawn.tip) };
  }
}

// --- brackets round atoms ---

const BRACKET_ROOM = 0.35; // between brackets and what they enclose

// The box of brackets round these atoms as drawn (their labels and
// electrons, BRACKET_ROOM round them); a repeating unit's brackets cross
// the bonds that leave it at their middle. { x1, y1, x2, y2, exits }, or null.
export function bracketBox(doc, scene, atomIds) {
  const points = atomIds.flatMap((id) => {
    const info = scene.atoms.get(id);
    if (!info) return [];
    const [x, y] = info.pos;
    return [[x, y], ...(info.label?.boxes ?? []).flatMap((b) => [[x + b.x1, y + b.y1], [x + b.x2, y + b.y2]]),
      ...[...info.electrons.pairs, ...info.electrons.unpaired].map((e) => e.point)];
  });
  if (!points.length) return null;
  const inside = new Set(atomIds);
  const exits = [...doc.bonds.values()].filter((b) => b.kind !== 'link' && inside.has(b.a) !== inside.has(b.b));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  let [x1, x2] = [Math.min(...xs) - BRACKET_ROOM, Math.max(...xs) + BRACKET_ROOM];
  const middle = (x1 + x2) / 2;
  for (const b of exits) {
    const x = (doc.atoms.get(b.a).x + doc.atoms.get(b.b).x) / 2;
    if (x < middle) x1 = Math.min(x1, x);
    else x2 = Math.max(x2, x);
  }
  return { x1, y1: Math.min(...ys) - BRACKET_ROOM, x2, y2: Math.max(...ys) + BRACKET_ROOM, exits: exits.length };
}

// Brackets made round atoms whose box no longer fits them (an atom deleted,
// one drawn on): [[id, box]], for the editor to fit.
export function bracketFits(doc, scene) {
  const fits = [];
  for (const bracket of doc.brackets.values()) {
    if (!bracket.atoms?.length) continue;
    const box = bracketBox(doc, scene, bracketMembers(doc, bracket));
    if (box && ['x1', 'y1', 'x2', 'y2'].some((k) => Math.abs(box[k] - bracket[k]) > 1e-6)) fits.push([bracket.id, { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 }]);
  }
  return fits;
}

// --- crossing bonds ---

const GAP = 0.12; // half the gap in a bond behind another, either side of the crossing (more for a double bond in front)

// Where the segments p1–p2 and q1–q2 cross (inside both), or null.
function crossing(p1, p2, q1, q2) {
  const d = (p2[0] - p1[0]) * (q2[1] - q1[1]) - (p2[1] - p1[1]) * (q2[0] - q1[0]);
  if (Math.abs(d) < 1e-9) return null;
  const s = ((q1[0] - p1[0]) * (q2[1] - q1[1]) - (q1[1] - p1[1]) * (q2[0] - q1[0])) / d;
  const u = ((q1[0] - p1[0]) * (p2[1] - p1[1]) - (q1[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return s > 0.02 && s < 0.98 && u > 0.02 && u < 0.98 ? [p1[0] + s * (p2[0] - p1[0]), p1[1] + s * (p2[1] - p1[1])] : null;
}

// A line [x1, y1, x2, y2] without its part within `r` of point c: 0, 1 or 2 lines.
function cutLine([x1, y1, x2, y2], [cx, cy], r) {
  const [dx, dy] = [x2 - x1, y2 - y1];
  const a = dx * dx + dy * dy;
  const b = 2 * (dx * (x1 - cx) + dy * (y1 - cy));
  const c = (x1 - cx) ** 2 + (y1 - cy) ** 2 - r * r;
  const disc = b * b - 4 * a * c;
  if (a < 1e-12 || disc <= 0) return [[x1, y1, x2, y2]];
  const [t1, t2] = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)];
  if (t2 <= 0 || t1 >= 1) return [[x1, y1, x2, y2]];
  const at = (t) => [x1 + t * dx, y1 + t * dy];
  return [...(t1 > 0 ? [[x1, y1, ...at(t1)]] : []), ...(t2 < 1 ? [[...at(t2), x2, y2]] : [])];
}

// How much more of the bond behind the one in front covers (either side of
// the crossing) than a thin line crossing it square: its half width there
// (a thick bond, a wedge or hashed wedge, whose narrow end is bond.a, a coordination bond's bond.b),
// measured along the bond behind.
function frontWidth(front, back, at, pos, bold) {
  const [fa, fb, ba, bb] = [pos(front.a), pos(front.b), pos(back.a), pos(back.b)];
  const u = [fb[0] - fa[0], fb[1] - fa[1]];
  const v = [bb[0] - ba[0], bb[1] - ba[1]];
  const sine = Math.abs(u[0] * v[1] - u[1] * v[0]) / (Math.hypot(...u) * Math.hypot(...v) || 1);
  const { stereo, order } = front.bond;
  let half = STYLE.line / 2;
  if (order === 1 && (stereo === 'wedge' || stereo === 'perspective' || stereo === 'hash')) {
    const t = ((at[0] - fa[0]) * u[0] + (at[1] - fa[1]) * u[1]) / (u[0] * u[0] + u[1] * u[1] || 1);
    half = Math.max(half, (STYLE.wedgeWidth / 2) * (front.bond.kind === 'dative' ? 1 - t : t)); // (a coordination wedge starts at b)
  } else if (bold.has(front.bond.id)) half = STYLE.wedgeWidth / 2;
  return half / Math.max(sine, 0.35) - STYLE.line / 2;
}

// Bonds that cross on the page and both have a depth (bond.z: drawn from a
// 3D view, see layout/threeD.js): the lines of the one behind are broken
// where the one in front goes over it, as in drawings of cages and of
// molecules in perspective. (A wedge or a wavy bond behind stays whole.)
// The gap is wider where the bond in front is: a thick bond (`bold`: the ids
// of bonds drawn thick), a wedge towards its wide end, a double bond; and
// where they cross at a slant, as the one in front covers more of the other.
function breakCrossings(bonds, pos, bold = new Set()) {
  const deep = [...bonds.values()].filter((info) => typeof info.bond.z === 'number' && info.bond.kind !== 'link');
  for (let i = 0; i < deep.length; i++) {
    for (let j = i + 1; j < deep.length; j++) {
      const [p, q] = [deep[i], deep[j]];
      if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
      if (Math.abs(p.bond.z - q.bond.z) < 0.05) continue;
      const at = crossing(pos(p.a), pos(p.b), pos(q.a), pos(q.b));
      if (!at) continue;
      const [front, back] = p.bond.z > q.bond.z ? [p, q] : [q, p];
      const r = GAP + (front.bond.order > 1 ? 0.07 : 0) + frontWidth(front, back, at, pos, bold);
      for (const key of ['lines', 'dashed', 'dotted']) {
        if (back.shapes[key]) back.shapes[key] = back.shapes[key].flatMap((line) => cutLine(line, at, r));
      }
    }
  }
}

// The circle of a Newman projection (the bond seen end on, the back carbon), as a bond's shapes: a path of
// four cubic curves (only coordinates in it, so that it scales as the other paths do).
function newmanCircle([cx, cy], r = NEWMAN_RADIUS) {
  const k = 0.5523 * r;
  const p = (x, y) => `${+(cx + x).toFixed(4)} ${+(cy + y).toFixed(4)}`;
  const d = `M${p(r, 0)}C${p(r, k)} ${p(k, r)} ${p(0, r)}C${p(-k, r)} ${p(-r, k)} ${p(-r, 0)}C${p(-r, -k)} ${p(-k, -r)} ${p(0, -r)}C${p(k, -r)} ${p(r, -k)} ${p(r, 0)}Z`;
  return { lines: [], polygons: [], paths: [d] };
}

// A pair of brackets round a box: [ ] with short hooks or ( ) as arcs;
// `sup` at the top right (‡, a charge), `sub` at the bottom right (n).
// Returns { paths (svg d), runs ([{ text, x, y, size, italic }]), box,
// sides: the two vertical lines [x, y1, x, y2], for hit testing }.
export function bracketShapes(b) {
  const [x1, x2] = [Math.min(b.x1, b.x2), Math.max(b.x1, b.x2)];
  const [y1, y2] = [Math.min(b.y1, b.y2), Math.max(b.y1, b.y2)];
  const f = (v) => +v.toFixed(4);
  let paths;
  if (b.shape === 'round') {
    const bulge = Math.min(0.22, (y2 - y1) / 6);
    const arc = (x, out) => `M${f(x - out * bulge)} ${f(y1)}Q${f(x + out * bulge)} ${f((y1 + y2) / 2)} ${f(x - out * bulge)} ${f(y2)}`;
    paths = [arc(x1, -1), arc(x2, 1)];
  } else {
    const hook = Math.min(0.16, (y2 - y1) / 4);
    paths = [`M${f(x1 + hook)} ${f(y1)}H${f(x1)}V${f(y2)}H${f(x1 + hook)}`, `M${f(x2 - hook)} ${f(y1)}H${f(x2)}V${f(y2)}H${f(x2 - hook)}`];
  }
  const size = STYLE.font * STYLE.subScale;
  const runs = [];
  let right = x2;
  // a typed hyphen in a charge is a minus sign
  const sup = (b.sup ?? '').replace(/-$/, '−');
  if (sup) {
    runs.push({ text: sup, x: x2 + 0.07, y: y1 + CAP_HEIGHT * size * 0.85, size, italic: false });
    right = Math.max(right, x2 + 0.07 + textWidth(sup, size));
  }
  if (b.sub) {
    runs.push({ text: b.sub, x: x2 + 0.07, y: y2 + CAP_HEIGHT * size * 0.55, size, italic: /^[a-z]$/.test(b.sub) });
    right = Math.max(right, x2 + 0.07 + textWidth(b.sub, size));
  }
  return { paths, runs, box: { x1, y1, x2: right, y2: y2 + (b.sub ? 0.2 : 0) }, sides: [[x1, y1, x1, y2], [x2, y1, x2, y2]] };
}

// A δ+ or δ− that a curved arrow passes through goes to another side of
// its atom, away from the arrows that pass near it.
function clearOfArrows(info, curves) {
  const [x, y] = info.pos;
  const box = info.label ? info.label.boxes.at(-1) : info.mark?.box;
  if (!box) return;
  const [dx, dy] = info.label ? [x, y] : [0, 0]; // (label boxes are relative to the atom)
  const points = [...curves.values()].flatMap((c) => [...c.samples, ...c.head]);
  const inside = ([px, py]) => px > box.x1 + dx - 0.06 && px < box.x2 + dx + 0.06 && py > box.y1 + dy - 0.06 && py < box.y2 + dy + 0.06;
  if (!points.some(inside)) return;
  const away = points.filter(([px, py]) => Math.hypot(px - x, py - y) < 0.9).map(([px, py]) => Math.atan2(py - y, px - x));
  info.placePartial(away);
}

// A short text (δ+) beside an unlabelled corner, where there is most room
// between its bonds and electrons; top right if that is as good.
function cornerMark([x, y], taken, text) {
  let best = { angle: -45 * DEGREE, room: -1 };
  for (let k = 0; k < 36; k++) {
    const angle = (-45 + k * 10) * DEGREE;
    const room = Math.min(Math.PI, ...taken.map((a) => angleBetween(a, angle)));
    if (room > best.room + 1e-6) best = { angle, room };
  }
  const size = STYLE.font * STYLE.subScale;
  const [cx, cy] = [x + 0.36 * Math.cos(best.angle), y + 0.36 * Math.sin(best.angle)];
  const width = textWidth(text, size);
  return { text, size, angle: best.angle, x: cx - width / 2, y: cy + (CAP_HEIGHT * size) / 2, box: { x1: cx - width / 2, y1: cy - (CAP_HEIGHT * size) / 2, x2: cx + width / 2, y2: cy + (CAP_HEIGHT * size) / 2 } };
}

// A charge beside an unlabelled corner (a carbon whose C isn't written): +, 2−; circled, ⊕ drawn as a label's.
function chargeMark(at, taken, charge, circled) {
  const digits = Math.abs(charge) > 1 ? String(Math.abs(charge)) : '';
  const mark = cornerMark(at, taken, `${digits}${charge > 0 ? '+' : '−'}`);
  if (!circled) return mark;
  const r = 0.11; // (as a label's)
  return { ...mark, text: digits, circle: { cx: mark.box.x2 - r, cy: (mark.box.y1 + mark.box.y2) / 2, r, sign: Math.sign(charge) } };
}

const SIDE_ANGLES = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

// The directions around an atom that something already takes: bonds, the
// electrons drawn, the hydrogens of its label, its charge, a δ beside it,
// the inside of its rings.
function takenAround(info) {
  const taken = [...info.bondAngles, ...info.inward, ...[...info.electrons.pairs, ...info.electrons.unpaired].map((e) => e.angle)];
  if (info.label?.hSide) taken.push(SIDE_ANGLES[info.label.hSide]);
  if (info.label?.chargeAngle != null) taken.push(info.label.chargeAngle);
  if (info.mark) taken.push(info.mark.angle);
  return taken;
}

// The middle of the widest free gap among the `taken` directions (in 15° steps).
function freeAngle(taken) {
  let best = { angle: -Math.PI / 2, room: -1 };
  for (let k = 0; k < 24; k++) {
    const angle = (k * Math.PI) / 12;
    const room = Math.min(Math.PI, ...taken.map((a) => angleBetween(a, angle)));
    if (room > best.room + 1e-6) best = { angle, room };
  }
  return best.angle;
}

// An atom's number: small, beside it where nothing else is (outside a
// ring, away from its bonds and electrons), a little further off a label.
function numberMark(info, number) {
  const angle = freeAngle(takenAround(info));
  const distance = info.label ? 0.6 : 0.36;
  const [x, y] = [info.pos[0] + distance * Math.cos(angle), info.pos[1] + distance * Math.sin(angle)];
  const size = STYLE.numberFont;
  const text = String(number);
  const [w, h] = [textWidth(text, size) / 2, (CAP_HEIGHT * size) / 2];
  return { text, size, angle, x, y: y + h, box: { x1: x - w, y1: y - h, x2: x + w, y2: y + h } };
}

// A ring fill's outline: through the ring's corners, but round a written
// atom (O, N, CH2) a round bite out of it, round its symbol and as far as
// the label reaches along the ring bonds, so the colour stays off the letters.
function fillPolygon(ring) {
  const polygon = [];
  const outline = ring.map((info) => info.pos);
  ring.forEach((info, k) => {
    if (!info.label) {
      polygon.push(info.pos);
      return;
    }
    const [x, y] = info.pos;
    const inside = (px, py) => info.label.boxes.some((b) => px >= x + b.x1 - 0.05 && px <= x + b.x2 + 0.05 && py >= y + b.y1 - 0.05 && py <= y + b.y2 + 0.05);
    const sides = [ring[(k + ring.length - 1) % ring.length], ring[(k + 1) % ring.length]].map((other) => {
      const [dx, dy] = [other.pos[0] - x, other.pos[1] - y];
      const length = Math.hypot(dx, dy) || 1;
      let t = 0;
      while (t < 0.45 * length && inside(x + (dx / length) * t, y + (dy / length) * t)) t += 0.02;
      return { angle: Math.atan2(dy, dx), t, length };
    });
    // round the whole symbol, and as far as the label reaches along the bonds
    const b = info.label.symbolBox ?? info.label.boxes[0];
    const symbol = Math.max(...[[b.x1, b.y1], [b.x1, b.y2], [b.x2, b.y1], [b.x2, b.y2]].map(([px, py]) => Math.hypot(px, py)));
    const r = Math.min(Math.max(sides[0].t, sides[1].t, symbol) + 0.05, 0.45 * Math.min(sides[0].length, sides[1].length));
    // the arc from the bond before to the bond after, through the ring's
    // inside: the short way round, or the long one at a corner that points
    // into the ring (the inside is then more than half way round)
    let turn = Math.atan2(Math.sin(sides[1].angle - sides[0].angle), Math.cos(sides[1].angle - sides[0].angle));
    const middle = sides[0].angle + turn / 2;
    if (!insidePolygon([x + 0.05 * Math.cos(middle), y + 0.05 * Math.sin(middle)], outline)) turn -= Math.sign(turn) * 2 * Math.PI;
    for (let s = 0; s <= 10; s++) {
      const a = sides[0].angle + (turn * s) / 10;
      polygon.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    }
  });
  return polygon;
}

// Is the point inside the polygon (even-odd)?
function insidePolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [[xi, yi], [xj, yj]] = [polygon[i], polygon[j]];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const centroid = (points) => points.reduce((s, p) => [s[0] + p[0] / points.length, s[1] + p[1] / points.length], [0, 0]);
const chargeText = (charge) => `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '−'}`;

// The circle in an aromatic ring: a smooth closed curve (quadratic Béziers)
// with the ring's corners pulled 0.62 of the way in towards its middle as
// its control points, through the middles of the lines between them. Round
// (within 1 %) in a regular ring; in a ring seen in perspective it is that
// curve seen alike, in the ring's plane; in one drawn out of shape it
// follows the shape; it moves smoothly with the atoms. Coloured like the
// bonds if they all have the same colour. { corners (the control points), color }
function aromaticCircle(polygon, colors, ink) {
  const [cx, cy] = centroid(polygon);
  const corners = polygon.map(([x, y]) => [cx + 0.62 * (x - cx), cy + 0.62 * (y - cy)]);
  const color = colors.every((c) => c === colors[0]) && colors[0] ? colors[0] : ink;
  return { cx, cy, corners, color };
}

// How far a bond's lines reach to each side of the line between its atoms
// ({ 1: ..., -1: ... }, sides as in bonds.js), so arrows can start beside them.
function bondExtent(p, q, shapes) {
  const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const normal = [-(q[1] - p[1]) / length, (q[0] - p[0]) / length];
  const extent = { 1: 0, [-1]: 0 };
  const points = [...[...shapes.lines, ...(shapes.dashed ?? []), ...(shapes.dotted ?? [])].flatMap(([x1, y1, x2, y2]) => [[x1, y1], [x2, y2]]), ...shapes.polygons.flat()];
  for (const [x, y] of points) {
    const d = (x - p[0]) * normal[0] + (y - p[1]) * normal[1];
    if (d > 0) extent[1] = Math.max(extent[1], d);
    else extent[-1] = Math.max(extent[-1], -d);
  }
  return extent;
}

// --- R/S and E/Z ---

// Where the stereo labels go: [{ text, x, y }] (x, y: the label's middle),
// for the atoms and bonds that ask for theirs (cipLabel).
// Next to an atom where it is in nothing's way: of the places round it, the one whose box crosses the
// fewest bonds, labels, numbers, electrons and marks already placed, and not inside a ring (on a chair
// a mark there sits between the ring's bonds; a CH2OH's text beside the corner), the direction with most room
// (away from bonds, hydrogens, charge and electrons) deciding between equals, a little further out
// (up to 0.3) only if that clears it; beside a double bond on its emptier side.
function stereoMarks(stereo, atoms, bonds, pos, rings) {
  const marks = [];
  const size = STYLE.stereoFont;
  const segments = [...bonds.values()].map((scene) => [pos(scene.a), pos(scene.b)]);
  const boxes = [...atoms.values()].flatMap((info) => [
    // (a label's boxes hold its capitals only: a little space round them)
    ...(info.label?.boxes ?? []).map((b) => ({ x1: info.pos[0] + b.x1 - 0.06, y1: info.pos[1] + b.y1 - 0.08, x2: info.pos[0] + b.x2 + 0.06, y2: info.pos[1] + b.y2 + 0.08 })),
    ...(info.number ? [info.number.box] : []),
    ...[...info.electrons.pairs, ...info.electrons.unpaired].map(({ point: [x, y] }) => ({ x1: x - 0.05, y1: y - 0.05, x2: x + 0.05, y2: y + 0.05 })),
  ]);
  const overlaps = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  const boxAt = (x, y, text) => {
    // (brackets reach above and below the capitals: about the font's size in all)
    const [w, h] = [textWidth(text, size) / 2 + 0.06, size / 2 + 0.06];
    return { x1: x - w, y1: y - h, x2: x + w, y2: y + h };
  };
  for (const [id, label] of stereo.atoms) {
    const info = atoms.get(id);
    if (!info?.atom.cipLabel) continue;
    const text = `(${label})`;
    // (only what is near enough to be in the way: the places tried are within 1.6 of the atom)
    const [ax, ay] = info.pos;
    const reach = { x1: ax - 1.6, y1: ay - 1.6, x2: ax + 1.6, y2: ay + 1.6 };
    const nearSegments = segments.filter((seg) => segmentInBox(seg, reach));
    const nearBoxes = boxes.filter((b) => overlaps(b, reach));
    // (inside a ring, a mark reads as the ring's, not its atom's; but at a ring fusion, with no place
    // outside, that is better than on a bond: those count twice)
    const clashes = (box) => 2 * (nearSegments.filter((seg) => segmentInBox(seg, box)).length + nearBoxes.filter((b) => overlaps(b, box)).length
      + marks.filter((m) => overlaps(m.box, box)).length) + rings.filter((ring) => insidePolygon([(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2], ring)).length;
    const taken = [...takenAround(info), ...(info.number ? [info.number.angle] : [])];
    const near = info.label ? 0.62 : 0.42;
    let best = null;
    for (let k = 0; k < 24; k++) {
      const angle = (k * Math.PI) / 12;
      const room = Math.min(Math.PI, ...taken.map((a) => angleBetween(a, angle)));
      for (const [distance, further] of [[near, 0], [near + 0.15, 1], [near + 0.3, 2]]) {
        const [x, y] = [info.pos[0] + distance * Math.cos(angle), info.pos[1] + distance * Math.sin(angle)];
        const box = boxAt(x, y, text);
        const score = [clashes(box), further, -Math.round(room / (Math.PI / 24))];
        const first = best && score.findIndex((v, i) => v !== best.score[i]);
        if (!best || (first >= 0 && score[first] < best.score[first])) best = { score, x, y, box };
      }
    }
    marks.push({ text, x: best.x, y: best.y, box: best.box });
  }
  for (const [id, label] of stereo.bonds) {
    const scene = bonds.get(id);
    if (!scene?.bond.cipLabel) continue;
    const [p, q] = [pos(scene.a), pos(scene.b)];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const normal = [-(q[1] - p[1]) / length, (q[0] - p[0]) / length];
    // the side away from the second line (or from the molecule)
    const inner = scene.shapes.lines[1];
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const towards = inner ? Math.sign((inner[0] - p[0]) * normal[0] + (inner[1] - p[1]) * normal[1]) || 1 : 1;
    marks.push({ text: `(${label})`, x: mid[0] - towards * 0.38 * normal[0], y: mid[1] - towards * 0.38 * normal[1] });
  }
  return marks.map(({ text, x, y }) => ({ text, x, y }));
}

// Does the segment (two points) cross or lie in the box?
function segmentInBox([[x1, y1], [x2, y2]], box) {
  let [t0, t1] = [0, 1];
  const [dx, dy] = [x2 - x1, y2 - y1];
  for (const [p, q] of [[-dx, x1 - box.x1], [dx, box.x2 - x1], [-dy, y1 - box.y1], [dy, box.y2 - y1]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

// The ways an arrow can be drawn (distinct candidates, best first), for
// dragging it into another shape: [{ variant, samples }].
export function arrowVariants(scene, curveId) {
  const before = [];
  for (const [id, geometry] of scene.curves) {
    if (id === curveId) break;
    before.push(geometry);
  }
  const curve = scene.curves.get(curveId)?.curve;
  if (!curve) return [];
  return distinctCandidates(arrowCandidates(scene, curve, before, { paired: pairedFirst(scene.doc ?? null, [...scene.curves.values()].map((g) => g.curve), curve) })).map((c, variant) => ({ variant, samples: c.samples }));
}

// Is this curve the first of a homolysis's two fishhooks: from a bond to one of its atoms, with a later one in
// `curves` from the same bond to its other atom (drawn as this one's mirror image: arrowCandidates)?
function pairedFirst(doc, curves, curve) {
  const halves = (c) => c.from.bond !== undefined && c.to.atom !== undefined && c.to.newBond === undefined && c.from.bond === curve.from.bond;
  if (!halves(curve)) return false;
  const k = curves.indexOf(curve);
  if (curves.slice(0, k).some(halves)) return false;
  const bond = doc?.bonds.get(curve.from.bond);
  return Boolean(bond) && curves.slice(k + 1).some((c) => halves(c) && c.to.atom !== curve.to.atom && [bond.a, bond.b].includes(c.to.atom) && [bond.a, bond.b].includes(curve.to.atom));
}

// --- text on a molecule's anchors ---

export const SLOTS = ['below', 'above', 'left', 'right'];
const SLOT_GAP = { below: 0.45, above: 0.45, left: 0.25, right: 0.25 };

// The box round a molecule (atom ids) as drawn: its atoms, labels,
// electrons and atom numbers ({ x1, y1, x2, y2 }); `atoms`: the scene's.
export function moleculeBox(members, atoms) {
  const points = members.flatMap((id) => {
    const info = atoms.get(id);
    if (!info) return [];
    const [x, y] = info.pos;
    return [[x, y], ...(info.label?.boxes ?? []).flatMap((b) => [[x + b.x1, y + b.y1], [x + b.x2, y + b.y2]]),
      ...[...info.electrons.pairs, ...info.electrons.unpaired].map((e) => e.point),
      ...(info.number ? [[info.number.box.x1, info.number.box.y1], [info.number.box.x2, info.number.box.y2]] : [])];
  });
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

// A molecule's atoms and their symbols only (no charges, written
// hydrogens, lone pairs): what a count beside it lines up with.
export function moleculeCore(members, atoms) {
  const points = members.flatMap((id) => {
    const info = atoms.get(id);
    if (!info) return [];
    const [x, y] = info.pos;
    const b = info.label?.symbolBox;
    return b ? [[x + b.x1, y + b.y1], [x + b.x2, y + b.y2]] : [[x, y]];
  });
  return { x1: Math.min(...points.map((p) => p[0])), y1: Math.min(...points.map((p) => p[1])), x2: Math.max(...points.map((p) => p[0])), y2: Math.max(...points.map((p) => p[1])) };
}

// Where a text goes in a slot of a molecule's box, after `offset` of the
// texts before it there: the text's x, y (start of its first baseline) and
// how much further the next one goes. Beside the molecule (left, right) a
// one-line text has the middle of its capitals level with the middle of
// the molecule's `core` (its atoms: 4 Cl⁻ with the 4 level with the Cl).
export function slotPlace(box, slot, text, offset = 0, core = box) {
  const laid = layoutText({ ...text, x: 0, y: 0 });
  const b = laid.box;
  const [w, h] = [b.x2 - b.x1, b.y2 - b.y1];
  const cx = (box.x1 + box.x2) / 2;
  const cy = (core.y1 + core.y2) / 2;
  const oneLine = laid.lines.length === 1;
  const capital = CAP_HEIGHT * STYLE.textFont;
  const gap = SLOT_GAP[slot] + (text.drop ?? 0);
  let x1;
  let y1;
  if (slot === 'above') [x1, y1] = [cx - w / 2, box.y1 - gap - offset - h];
  else if (slot === 'left') [x1, y1] = [box.x1 - gap - offset - w, cy - h / 2];
  else if (slot === 'right') [x1, y1] = [box.x2 + gap + offset, cy - h / 2];
  else [x1, y1] = [cx - w / 2, box.y2 + gap + offset];
  const step = slot === 'left' || slot === 'right' ? w + 0.15 : h + 0.08;
  if ((slot === 'left' || slot === 'right') && oneLine) return { x: x1 - b.x1, y: cy + capital / 2, step };
  return { x: x1 - b.x1, y: y1 - b.y1, step };
}

// The texts on molecules' anchors (text.anchor: one of the molecule's
// atoms; text.slot: below (the default: a compound number), above, left (a
// count in front, 2 NaOH), right; text.drop: further away, to put a row's
// labels on one line): Map text id -> the text placed. Several in one slot
// stack outwards by text.order (where they were put; then in the order
// they were made). A molecule in brackets has its texts outside them (above
// and below still centred on the molecule, not on the brackets' charge).
const slotOf = (text) => (SLOTS.includes(text.slot) ? text.slot : 'below');
const inStackOrder = (p, q) => ((p.order ?? Infinity) === (q.order ?? Infinity) ? p.id - q.id : (p.order ?? Infinity) < (q.order ?? Infinity) ? -1 : 1);
function placeAnchored(doc, atoms, frags, fragOf) {
  const groups = new Map();
  for (const text of doc.texts.values()) {
    if (text.anchor === undefined || text.anchor === null || !doc.atoms.has(text.anchor)) continue;
    const key = `${fragOf.get(text.anchor)}|${slotOf(text)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(text);
  }
  const placed = new Map();
  for (const [key, texts] of groups) {
    const [k, slot] = key.split('|');
    const own = moleculeBox(frags[Number(k)], atoms);
    const core = moleculeCore(frags[Number(k)], atoms);
    const [mx, my] = [(own.x1 + own.x2) / 2, (own.y1 + own.y2) / 2];
    const round = [...doc.brackets.values()].map((b) => bracketShapes(b).box).filter((b) => mx > b.x1 && mx < b.x2 && my > b.y1 && my < b.y2);
    const box = { ...own };
    for (const b of round) {
      [box.y1, box.y2] = [Math.min(box.y1, b.y1), Math.max(box.y2, b.y2)];
      if (slot === 'left' || slot === 'right') [box.x1, box.x2] = [Math.min(box.x1, b.x1), Math.max(box.x2, b.x2)];
    }
    let offset = 0;
    for (const text of texts.sort(inStackOrder)) {
      const { x, y, step } = slotPlace(box, slot, text, offset, core);
      placed.set(text.id, { ...text, x, y });
      offset += step;
    }
  }
  return placed;
}

// Where a free text could go on the molecules' anchors, for snapping it
// there: at each place of each stack (next to the molecule, between two,
// outermost), the rest moving out: [{ atom (the anchor), slot, index,
// stack (the texts there, as in the scene, in order), box (where the text
// would be), line (a place inside the stack: the gap it goes into) }].
export function anchorTargets(scene, text) {
  const targets = [];
  scene.frags.forEach((members, k) => {
    if (members.length === 0) return;
    const box = moleculeBox(members, scene.atoms);
    const core = moleculeCore(members, scene.atoms);
    for (const slot of SLOTS) {
      const stack = [...scene.texts.values()]
        .filter((t) => t.anchored && t.text.id !== text.id && t.text.anchor != null && scene.fragOf.get(t.text.anchor) === k && slotOf(t.text) === slot)
        .sort((p, q) => inStackOrder(p.text, q.text));
      let offset = 0;
      for (let index = 0; index <= stack.length; index += 1) {
        const { x, y } = slotPlace(box, slot, { ...text, drop: 0 }, offset, core);
        targets.push({ atom: Math.min(...members), slot, index, stack, box: layoutText({ ...text, x, y }).box,
          ...(index < stack.length && { line: anchorGap(box, slot, stack, index) }) });
        if (index < stack.length) offset += slotPlace(box, slot, stack[index].text).step;
      }
    }
  });
  return targets;
}

// The gap before the `index`th text of a molecule's stack (box: the
// molecule's): a line across it, as long as the wider of its neighbours.
function anchorGap(box, slot, stack, index) {
  const [before, after] = [stack[index - 1]?.box, stack[index].box];
  const span = (b) => (slot === 'left' || slot === 'right' ? b.y2 - b.y1 : b.x2 - b.x1);
  const half = Math.max(...[before, after].filter(Boolean).map(span)) / 2;
  const [cx, cy] = [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2];
  if (slot === 'left' || slot === 'right') {
    const x = slot === 'left' ? ((before?.x1 ?? box.x1) + after.x2) / 2 : ((before?.x2 ?? box.x2) + after.x1) / 2;
    return [x, cy - half, x, cy + half];
  }
  const y = slot === 'above' ? ((before?.y1 ?? box.y1) + after.y2) / 2 : ((before?.y2 ?? box.y2) + after.y1) / 2;
  return [cx - half, y, cx + half, y];
}

// Puts a text onto a molecule's anchor at `index` (a target of
// anchorTargets): the texts there numbered again, in order.
export function putOnAnchor(doc, { atom, slot, index, stack }, text) {
  const texts = stack.map((t) => doc.texts.get(t.text.id)).filter(Boolean);
  texts.splice(index, 0, text);
  texts.forEach((t, order) => {
    t.order = order;
  });
  Object.assign(text, { anchor: atom, slot });
  delete text.drop;
}

// --- texts and molecules on reaction arrows ---

export const ARROW_SLOTS = ['above', 'below'];
// the free ends of a reaction arrow's side arcs (arrow.sides): what goes in (NAD⁺), what comes out (NADH)
export const SIDE_SLOTS = ['above-in', 'above-out', 'below-in', 'below-out'];
const ARC_RISE = 0.7; // a side arc's height, as a share of its reach along the arrow
const ARC_OVERHANG = 0.45; // how far the arrow goes on past its side arcs
const ARC_ROOM = 0.15; // between the arcs and the arrow's own stack between them
const ARROW_GAP = 0.2; // between an arrow and what is on it
const STACK_GAP = 0.12; // between things stacked on one side

// An arrow's middle, the way to its "above" side (up; left of an upright
// arrow) and how far its drawing reaches to either side.
export function arrowFrame(arrow) {
  const length = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1) || 1;
  let n = [(arrow.y2 - arrow.y1) / length, -(arrow.x2 - arrow.x1) / length];
  if (n[1] > 1e-9 || (Math.abs(n[1]) <= 1e-9 && n[0] > 0)) n = [-n[0], -n[1]];
  const mid = [(arrow.x1 + arrow.x2) / 2, (arrow.y1 + arrow.y2) / 2];
  const { lines, polygons, open = [] } = arrowShapes(arrow);
  const points = [...lines.flatMap((l) => [[l[0], l[1]], [l[2], l[3]]]), ...polygons.flat(), ...open];
  const thick = Math.max(0, ...points.map(([x, y]) => Math.abs((x - mid[0]) * n[0] + (y - mid[1]) * n[1])));
  return { mid, n, thick };
}

// The middles of boxes ({ w, h }) stacked on one side of an arrow, the first next to it. However the arrow is
// turned, as over and under a horizontal one: one under the other on the page (above it the first lowest, below
// it the first highest; beside an upright arrow, its side above the arrow's: n points up, or left), the block
// at the arrow's middle, as near as it can be without touching the arrow, and beside an arrow steeper than 30°
// each lined up on the side towards it (right-aligned on its left, left-aligned on its right; over and under a
// flatter one, centred). (Each stacked along the arrow's normal, a turned arrow had its texts in a row beside
// it, or far out along a slanted one.)
export function stackOnArrow(frame, slot, sizes) {
  return stackPlaces(frame, slot, sizes).map((place) => place.at);
}

// stackOnArrow's places, with each box's top and bottom ([{ at, top, bottom }]) and the block's ({ x1, x2 }: its
// left and right, `dir`: from the arrow towards it), for the gaps between them
function stackPlaces(frame, slot, sizes) {
  const dir = slot === 'below' ? [-frame.n[0], -frame.n[1]] : frame.n;
  if (!sizes.length) return [];
  const width = Math.max(...sizes.map((s) => s.w));
  const height = sizes.reduce((sum, s) => sum + s.h, 0) + STACK_GAP * (sizes.length - 1);
  const reach = (Math.abs(dir[0]) * width + Math.abs(dir[1]) * height) / 2;
  const [cx, cy] = [frame.mid[0] + dir[0] * (frame.thick + ARROW_GAP + reach), frame.mid[1] + dir[1] * (frame.thick + ARROW_GAP + reach)];
  const side = Math.abs(dir[0]) > 0.5 ? -Math.sign(dir[0]) : 0; // (+1: right-aligned, −1: left-aligned, 0: centred)
  const upwards = slot !== 'below'; // (the first at the bottom)
  let y = upwards ? cy + height / 2 : cy - height / 2;
  return sizes.map(({ w, h }) => {
    const [top, bottom] = upwards ? [y - h, y] : [y, y + h];
    y = upwards ? top - STACK_GAP : bottom + STACK_GAP;
    return { at: [cx + side * (width - w) / 2, (top + bottom) / 2], top, bottom, x1: cx - width / 2, x2: cx + width / 2, w };
  });
}

// A side arc of a reaction arrow (side: 'above' or 'below' of it, way: 'in'
// or 'out', reach: how far along the arrow it goes): a curve that meets the
// arrow at its middle, touching it, and rises to its free end, where a stack
// can go. Meeting at the very middle, unless the arrow's own stack is on
// that side: then either side of it (`width`: that stack's, along the
// arrow). Only an arc going out has a head, at its free end.
// { key (`${id}|${side}-${way}`), d, head (polygon or null), samples, free
// (its free end), out (from there away from the arrow) }.
function sideArc(arrow, frame, entry, width) {
  const length = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1) || 1;
  let u = [(arrow.x2 - arrow.x1) / length, (arrow.y2 - arrow.y1) / length];
  const ns = entry.side === 'below' ? [-frame.n[0], -frame.n[1]] : frame.n;
  // an equilibrium arrow is two arrows here: an arc meets the harpoon on its side and goes its way (the
  // forward one lies on the side of -n, n = (-u.y, u.x) as arrowShapes has it; the other goes back)
  let middle = frame.mid;
  if (arrow.kind === 'equilibrium') {
    if (ns[0] * u[1] - ns[1] * u[0] < 0) u = [-u[0], -u[1]];
    middle = [frame.mid[0] + ns[0] * EQUILIBRIUM_GAP, frame.mid[1] + ns[1] * EQUILIBRIUM_GAP];
  }
  const way = entry.way === 'in' ? -1 : 1;
  const reach = entry.reach;
  const rise = reach * ARC_RISE;
  const off = width > 0 ? width / 2 + ARC_ROOM : 0;
  const at = (p, along, across) => [p[0] + u[0] * along + ns[0] * across, p[1] + u[1] * along + ns[1] * across];
  const meet = at(middle, way * off, 0);
  const free = at(meet, way * reach, rise);
  const nearFree = at(free, 0, -rise * 0.55);
  const nearMeet = at(meet, way * reach * 0.5, 0);
  // the curve from where it starts to where its head is; a head a little further out than the
  // free end (only as drawn: the handle and the stack keep the free end), so that it doesn't look
  // lower than the plain end of an arc going in at the same height
  const lift = entry.way === 'out' ? STYLE.rxnHeadLength * 0.45 : 0;
  const [p0, p1, p2, p3] = entry.way === 'in' ? [free, nearFree, nearMeet, meet] : [meet, nearMeet, at(nearFree, 0, lift), at(free, 0, lift)];
  const swoop = entry.way === 'in'; // (what goes in: no head; only what comes out has one)
  const bezier = (t) => [0, 1].map((k) => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * p1[k] + 3 * (1 - t) * t * t * p2[k] + t ** 3 * p3[k]);
  const samples = Array.from({ length: 17 }, (_, i) => bezier(i / 16));
  let head = null;
  let end = p3;
  if (!swoop) {
    const tangent = [p3[0] - p2[0], p3[1] - p2[1]];
    const t = Math.hypot(...tangent) || 1;
    const d = [tangent[0] / t, tangent[1] / t];
    const n = [-d[1], d[0]];
    const [L, W] = [STYLE.rxnHeadLength * 0.85, STYLE.rxnHeadHalfWidth * 0.85];
    const base = [p3[0] - d[0] * L, p3[1] - d[1] * L];
    head = [p3, [base[0] + n[0] * W, base[1] + n[1] * W], [p3[0] - d[0] * L * 0.78, p3[1] - d[1] * L * 0.78], [base[0] - n[0] * W, base[1] - n[1] * W]];
    end = [p3[0] - d[0] * L * 0.6, p3[1] - d[1] * L * 0.6]; // (the line ends under the head)
  }
  const pt = (p) => `${+p[0].toFixed(4)} ${+p[1].toFixed(4)}`;
  return { key: `${arrow.id}|${entry.side}-${entry.way}`, id: entry.id, d: `M${pt(p0)} C${pt(p1)} ${pt(p2)} ${pt(end)}`, head, samples, free, out: ns, meetAt: way * off + way * reach };
}

const sizeOf = (box) => ({ w: box.x2 - box.x1, h: box.y2 - box.y1 });
const middleOf = (box) => [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2];
const usable = (doc, id) => doc.arrows.has(id) && doc.arrows.get(id).kind !== 'dipole';

// What sits on the arrows: texts (text.arrow, text.slot) and molecules
// (atom.arrow, atom.arrowSlot on their atoms), stacked outwards on each
// side by their order (text.order, atom.arrowOrder: where they were put;
// then in the order they were made). The texts are placed here (into
// `anchored`, with the texts on the moved molecules' anchors); the
// molecules' moves are returned for the editor to make: { arrowFrames,
// arrowStacks (key "arrow|slot" -> [{ text | frag, box }]), arrowMoves
// ([{ atoms, dx, dy }]), arrowSigns: + or − in front of a molecule or a
// text (atom.arrowSign, text.arrowSign: added, or taken away) ([{ at,
// text, color, atom | textId }]) }.
const SIGN_GAP = 0.3; // between a + or − and its molecule or text
export const SIGN_SIZE = 1.4; // of the text font: larger than a charge, so it is not taken for one
function placeOnArrows(doc, scene, anchored, ink) {
  const arrowFrames = new Map();
  const arrowStacks = new Map();
  const arrowMoves = [];
  const arrowSigns = [];
  const arrowArcs = new Map(); // `${id}|${side}-${way}` -> the side arc (sideArc)
  const arrowFits = []; // [id, { x1, y1, x2, y2 }, ownLength or null]: arrows to make as long as their side arcs need
  const arrowNeeds = new Map(); // id -> how far from its middle an arrow with side arcs must reach
  if (!doc.arrows.size) return { arrowFrames, arrowStacks, arrowMoves, arrowSigns, arrowArcs, arrowFits, arrowNeeds };
  for (const arrow of doc.arrows.values()) if (arrow.kind !== 'dipole') arrowFrames.set(arrow.id, arrowFrame(arrow));
  // the slot something is in: a side arc's free end if the arrow has that arc, else above or below
  const slotOf = (arrowId, slot) => {
    if (SIDE_SLOTS.includes(slot)) {
      const [side, way] = slot.split('-');
      if ((doc.arrows.get(arrowId).sides ?? []).some((e) => e.side === side && e.way === way)) return slot;
      return side;
    }
    return slot === 'below' ? 'below' : 'above';
  };
  const join = (key, entry) => {
    if (!arrowStacks.has(key)) arrowStacks.set(key, []);
    arrowStacks.get(key).push(entry);
  };
  // the sign drawn as a molecule's (signFont; larger with a larger text), its middle at that of the capitals of its first line
  const signFont = STYLE.textFont * SIGN_SIZE;
  for (const text of doc.texts.values()) {
    if (text.arrow == null || !usable(doc, text.arrow)) continue;
    const { lines, box } = layoutText({ ...text, x: 0, y: 0 });
    const sign = { '+': '+', '−': '−' }[text.arrowSign];
    const scale = text.size > 0 ? text.size : 1;
    const width = sign ? textWidth(sign, signFont * scale) : 0;
    const front = sign && Math.min(box.x2, ...lines[0].runs.map((run) => run.x));
    const signAt = sign && [front - SIGN_GAP * scale - width / 2, (-CAP_HEIGHT * STYLE.textFont * scale) / 2];
    if (sign) box.x1 = Math.min(box.x1, front - SIGN_GAP * scale - width);
    join(`${text.arrow}|${slotOf(text.arrow, text.slot)}`, { order: text.order ?? Infinity, id: text.id, text, box, sign, signAt, scale });
  }
  scene.frags.forEach((members, k) => {
    const on = members.map((id) => doc.atoms.get(id)).find((atom) => atom.arrow != null && usable(doc, atom.arrow));
    if (!on) return;
    // the molecule with the texts on its anchors
    const own = moleculeBox(members, scene.atoms);
    const boxes = [own];
    const labels = [...anchored.values()].filter((t) => members.includes(t.anchor));
    for (const label of labels) boxes.push(layoutText(label).box);
    const box = { x1: Math.min(...boxes.map((b) => b.x1)), y1: Math.min(...boxes.map((b) => b.y1)), x2: Math.max(...boxes.map((b) => b.x2)), y2: Math.max(...boxes.map((b) => b.y2)) };
    // + or − in front of it, at the middle height of its atoms and their symbols (as a count beside a molecule:
    // not raised by a charge or lone pair above, ⁻:C≡N), in front of what stands at that height too (a count on
    // its left: + 2 H2O, not the + on the 2; a name under it, wider, isn't), inside its share of the stack
    const sign = { '+': '+', '−': '−' }[on.arrowSign];
    const signWidth = sign ? textWidth(sign, signFont) : 0;
    const core = sign && moleculeCore(members, scene.atoms);
    const signY = sign && (core.y1 + core.y2) / 2;
    const front = sign && Math.min(own.x1, ...boxes.filter((b) => b.y1 <= signY && b.y2 >= signY).map((b) => b.x1));
    const signAt = sign && [front - SIGN_GAP - signWidth / 2, signY];
    if (sign) box.x1 = Math.min(box.x1, front - SIGN_GAP - signWidth);
    join(`${on.arrow}|${slotOf(on.arrow, on.arrowSlot)}`, { order: on.arrowOrder ?? Infinity, id: Math.min(...members), frag: k, members, labels, box, sign, signAt });
  });
  for (const stack of arrowStacks.values()) stack.sort((p, q) => (p.order === q.order ? p.id - q.id : p.order < q.order ? -1 : 1));
  // the side arcs: either side of the arrow's own stack on their side, if it has one (one going in
  // and one going out on opposite sides: either side of its stack on either side); the arrow as
  // long as they need, or as it was drawn (ownLength) if that is longer: back to it when they go
  for (const arrow of doc.arrows.values()) {
    if ((!arrow.sides?.length && arrow.ownLength === undefined) || !arrowFrames.has(arrow.id)) continue;
    const frame = arrowFrames.get(arrow.id);
    const length = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1) || 1;
    const u = [(arrow.x2 - arrow.x1) / length, (arrow.y2 - arrow.y1) / length];
    const along = (box) => (Math.abs(u[0]) * (box.x2 - box.x1) + Math.abs(u[1]) * (box.y2 - box.y1));
    const stackWidth = (side) => Math.max(0, ...(arrowStacks.get(`${arrow.id}|${side}`) ?? []).map((entry) => along(entry.box)));
    const sides = arrow.sides ?? [];
    const crossing = sides.length === 2 && sides[0].side !== sides[1].side && sides[0].way !== sides[1].way;
    const width = (side) => (crossing ? Math.max(stackWidth('above'), stackWidth('below')) : stackWidth(side));
    // (past the arcs, and past what stands at their free ends, half its width either side)
    let need = 0;
    for (const entry of sides) {
      const arc = sideArc(arrow, frame, entry, width(entry.side));
      arrowArcs.set(arc.key, arc);
      const stacked = Math.max(0, ...(arrowStacks.get(arc.key) ?? []).map((e) => along(e.box) / 2 + ARC_ROOM));
      need = Math.max(need, Math.abs(arc.meetAt) + Math.max(ARC_OVERHANG, stacked));
    }
    arrowNeeds.set(arrow.id, need);
    const own = arrow.ownLength ?? length;
    const target = Math.max(own, 2 * need);
    // (made this long by hand: left so, its ends where they were put)
    if (!arrow.lengthByHand && Math.abs(target - length) > 1e-6) {
      const [mx, my] = frame.mid;
      const half = target / 2;
      arrowFits.push([arrow.id, { x1: mx - u[0] * half, y1: my - u[1] * half, x2: mx + u[0] * half, y2: my + u[1] * half }, target > own + 1e-6 ? own : null]);
    }
  }
  for (const [key, stack] of arrowStacks) {
    const [arrowId, slot] = key.split('|');
    // (at a side arc's free end: stacked from there away from the arrow)
    const arc = arrowArcs.get(key);
    const frame = arc ? { mid: arc.free, n: arc.out, thick: 0 } : arrowFrames.get(Number(arrowId));
    const places = stackOnArrow(frame, arc ? 'above' : slot, stack.map((entry) => sizeOf(entry.box)));
    stack.forEach((entry, i) => {
      const [mx, my] = middleOf(entry.box);
      const [dx, dy] = [places[i][0] - mx, places[i][1] - my];
      if (entry.text) {
        anchored.set(entry.text.id, { ...entry.text, x: dx, y: dy });
        if (entry.sign) arrowSigns.push({ at: [entry.signAt[0] + dx, entry.signAt[1] + dy], text: entry.sign, color: ink, textId: entry.text.id, scale: entry.scale });
        return;
      }
      for (const label of entry.labels) anchored.set(label.id, { ...label, x: label.x + dx, y: label.y + dy });
      if (Math.hypot(dx, dy) > 1e-6) arrowMoves.push({ atoms: entry.members, dx, dy });
      if (entry.sign) arrowSigns.push({ at: [entry.signAt[0] + dx, entry.signAt[1] + dy], text: entry.sign, color: ink, atom: entry.id });
    });
  }
  return { arrowFrames, arrowStacks, arrowMoves, arrowSigns, arrowArcs, arrowFits, arrowNeeds };
}

// Where something of size `box` would go on the arrows, at each place in
// each stack (next to the arrow, between two, outermost), the rest moving
// up (but `skip`: a text id or a molecule's atoms, is left out): [{ arrow,
// slot, index, stack (what is there, in order), box, line (a place inside
// the stack: the gap it goes into, [x1, y1, x2, y2]) }], for snapping it there.
export function arrowTargets(scene, box, skip = null) {
  const targets = [];
  const size = sizeOf(box);
  // above and below each arrow, and at the free end of each of its side arcs (stacked away from the arrow)
  const places = [...scene.arrowFrames].flatMap(([arrow, frame]) => ARROW_SLOTS.map((slot) => [arrow, slot, frame, slot]));
  for (const arc of scene.arrowArcs?.values() ?? []) {
    const [arrow, slot] = arc.key.split('|');
    places.push([Number(arrow), slot, { mid: arc.free, n: arc.out, thick: 0 }, 'above']);
  }
  for (const [arrow, slot, frame, way] of places) {
    const stack = (scene.arrowStacks.get(`${arrow}|${slot}`) ?? [])
      .filter((entry) => !(entry.text && entry.text.id === skip) && !(entry.members && Array.isArray(skip) && entry.members.some((id) => skip.includes(id))));
    const now = stack.map((entry) => sizeOf(entry.box));
    for (let index = 0; index <= stack.length; index += 1) {
      const sizes = [...now];
      sizes.splice(index, 0, size);
      const [cx, cy] = stackOnArrow(frame, way, sizes)[index];
      targets.push({ arrow, slot, index, stack, box: { x1: cx - size.w / 2, y1: cy - size.h / 2, x2: cx + size.w / 2, y2: cy + size.h / 2 },
        ...(index < stack.length && { line: gapLine(frame, way, now, index) }) });
    }
  }
  return targets;
}

// The gap before the `index`th of a stack (sizes, as stackOnArrow lays them out): a level line across it, as long
// as the wider of its neighbours (before the first: between it and the arrow's side of the stack).
function gapLine(frame, slot, sizes, index) {
  const places = stackPlaces(frame, slot, sizes);
  const upwards = slot !== 'below';
  const near = (k) => (upwards ? places[k].bottom : places[k].top); // (the edge towards the first)
  const far = (k) => (upwards ? places[k].top : places[k].bottom);
  const y = index === 0 ? near(0) + (upwards ? 1 : -1) * ARROW_GAP / 2 : (near(index) + far(index - 1)) / 2;
  const ends = [index - 1, index].filter((k) => k >= 0).flatMap((k) => [places[k].at[0] - places[k].w / 2, places[k].at[0] + places[k].w / 2]);
  return [Math.min(...ends), y, Math.max(...ends), y];
}

// Puts `put` (a text, or a molecule's atoms) into an arrow's stack at
// `index` (a target of arrowTargets): everything there numbered again, in order.
export function putOnArrow(doc, { arrow, slot, index, stack }, put) {
  const entries = stack.map((entry) => (entry.text ? [doc.texts.get(entry.text.id)] : entry.members.map((id) => doc.atoms.get(id))));
  entries.splice(index, 0, put);
  entries.forEach((objects, order) => {
    for (const object of objects) {
      if (!object) continue;
      object.arrow = arrow;
      if (doc.texts.get(object.id) === object) Object.assign(object, { slot, order });
      else Object.assign(object, { arrowSlot: slot, arrowOrder: order });
    }
  });
}

// --- reaction arrows, "+" and text ---

const EQUILIBRIUM_GAP = 0.07; // each harpoon of an equilibrium arrow from its middle (the forward one on the side of -n)

// Lines and filled heads of a reaction arrow, by kind.
export function arrowShapes({ x1, y1, x2, y2, kind, lean = null }) {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const d = [(x2 - x1) / length, (y2 - y1) / length];
  const n = [-d[1], d[0]];
  const L = STYLE.rxnHeadLength;
  const W = STYLE.rxnHeadHalfWidth;
  const at = (p, along, across) => [p[0] + d[0] * along + n[0] * across, p[1] + d[1] * along + n[1] * across];
  const [p, q] = [[x1, y1], [x2, y2]];
  const lines = [];
  const polygons = [];
  const head = (tip, back, half = 0) => {
    // full (half = 0) or one side only (+1 / -1): a harpoon
    const [b1, b2] = [at(tip, -back * L, W), at(tip, -back * L, -W)];
    const notch = at(tip, -back * L * 0.78, 0);
    if (half === 0) polygons.push([tip, b1, notch, b2]);
    else polygons.push([tip, half > 0 ? b1 : b2, notch]);
  };
  if (kind === 'equilibrium') {
    // lean: which way it lies, the other harpoon shorter, in the middle ('forward': the lower one, back to
    // the reactants; 'back': the upper one)
    const gap = EQUILIBRIUM_GAP;
    const short = 0.22 * length;
    const [upper, lower] = [lean === 'back' ? short : 0, lean === 'forward' ? short : 0];
    // a harpoon: its half head as wide as the line too, its straight edge along the line's inner edge and its
    // point there, the line ending inside it (nothing of the line beyond the point). Returns where the line ends.
    const h = STYLE.line / 2;
    const harpoon = (base, tip, way, y, out) => {
      const [inner, outer] = [y - out * h, y + out * h];
      const back = tip - way * L * 0.78;
      polygons.push([at(base, tip, inner), at(base, tip - way * L, y + out * W), at(base, back, outer), at(base, back, inner)]);
      return at(base, back, y);
    };
    // (each point a little past the other harpoon's tail, as a side arc's head is lifted a little: balanced)
    const over = h + L * 0.3;
    lines.push([...at(p, upper + over, -gap), ...harpoon(q, -upper, 1, -gap, -1)]);
    lines.push([...harpoon(p, lower, -1, gap, 1), ...at(q, -lower - over, gap)]);
  } else if (kind === 'failed') {
    // a reaction that does not go: the arrow crossed in its middle
    lines.push([...p, ...at(q, -L * 0.6, 0)]);
    head(q, 1);
    const middle = at(p, length / 2, 0);
    lines.push([...at(middle, -0.11, -0.19), ...at(middle, 0.11, 0.19)], [...at(middle, 0.11, -0.19), ...at(middle, -0.11, 0.19)]);
  } else if (kind === 'same') {
    // an equals sign as long as the arrow: the same thing drawn two ways
    lines.push([...at(p, 0.1, -0.08), ...at(q, -0.1, -0.08)], [...at(p, 0.1, 0.08), ...at(q, -0.1, 0.08)]);
  } else if (kind === 'resonance') {
    lines.push([...at(p, L * 0.6, 0), ...at(q, -L * 0.6, 0)]);
    head(q, 1);
    head(p, -1);
  } else if (kind === 'dipole') {
    // from δ+ (the crossed end) to δ−, smaller than a reaction arrow
    const [l, w] = [L * 0.6, W * 0.75];
    lines.push([...p, ...at(q, -l * 0.6, 0)], [...at(p, 0.16, -0.11), ...at(p, 0.16, 0.11)]);
    polygons.push([q, at(q, -l, w), at(q, -l * 0.78, 0), at(q, -l, -w)]);
  } else if (kind === 'multistep') {
    // "in n steps": two arrows, one over the other, the lower one further on
    const [across, along] = [0.17, 0.27 * length];
    const upper = at(p, length - along, -across);
    lines.push([...at(p, 0, -across), ...at(upper, -L * 0.6, 0)], [...at(p, along, across), ...at(q, -L * 0.6, across)]);
    head(upper, 1);
    head(at(q, 0, across), 1);
  } else if (kind === 'retro') {
    const gap = 0.08;
    lines.push([...at(p, 0, gap), ...at(q, -L * 0.9, gap)], [...at(p, 0, -gap), ...at(q, -L * 0.9, -gap)]);
    return { lines, polygons, open: [at(q, -L * 1.2, W * 1.9), q, at(q, -L * 1.2, -W * 1.9)] };
  } else {
    lines.push([...p, ...at(q, -L * 0.6, 0)]);
    head(q, 1);
  }
  return { lines, polygons };
}

// How a text's lines line up: as set (text.align: 'left', 'center',
// 'right'), else centred when it sits under or over a molecule or on an
// arrow (a name in two lines, conditions), else from the left.
export function textAlign(text) {
  if (['left', 'center', 'right'].includes(text.align)) return text.align;
  const onMolecule = text.anchor !== undefined && text.anchor !== null && !['left', 'right'].includes(text.slot);
  return onMolecule || (text.arrow !== undefined && text.arrow !== null) ? 'center' : 'left';
}

// Text lines laid out: { lines: [{ runs, y }], box }, runs with x positions
// (each line moved within the widest as textAlign says). A superscript
// right after a subscript stands over it (CO₃²⁻), and the other way round.
// (`text.size`: a factor of the style's text size, 1 when not set; `text.family`: 'sans' or 'serif', else the style's)
export function layoutText(text) {
  const size = STYLE.textFont * (text.size > 0 ? text.size : 1);
  const family = text.family ?? STYLE.family;
  const small = size * STYLE.subScale;
  const lineHeight = size * 1.25;
  const lines = text.text.split('\n').map((line, k) => {
    let x = text.x;
    const y = text.y + k * lineHeight;
    let last = null; // the index run before, with where it ends
    const runs = formatRuns(line, { auto: false }).map((run) => {
      const bold = Boolean(text.bold || run.bold);
      const width = runsWidth([run], size, STYLE.subScale, { bold, family });
      const over = last && run.shift && last.shift !== run.shift ? last : null;
      const at = over ? over.x : x;
      const placed = { text: run.text, x: at, y: y + (run.shift === 'sub' ? 0.22 * size : run.shift === 'sup' ? -0.4 * size : 0), size: run.shift ? small : size, bold, italic: Boolean(run.italic) };
      x = over ? Math.max(over.end, at + width) : x + width;
      last = run.shift && !over ? { shift: run.shift, x: at, end: x } : null;
      return placed;
    });
    return { runs, width: x - text.x, y };
  });
  const width = Math.max(0.2, ...lines.map((l) => l.width));
  const share = { left: 0, center: 0.5, right: 1 }[textAlign(text)];
  for (const line of lines) for (const run of line.runs) run.x += (width - line.width) * share;
  const box = { x1: text.x, y1: text.y - CAP_HEIGHT * size - 0.05, x2: text.x + width, y2: text.y + (lines.length - 1) * lineHeight + 0.15 };
  return { lines, box };
}
