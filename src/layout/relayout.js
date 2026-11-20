// Re-layout: several drawings of the selected molecules from different
// layout engines, to pick from. A drawing may change only the picture,
// never the molecule: every candidate is checked by RDKit canonical SMILES
// (stereo included) against the molecule as drawn, and dropped if it
// differs. Lone pairs and curved arrows follow, being tied to their atoms.
import { electronsByAtom } from '../chem/valence.js';
import { readMol } from '../io/readMol.js';
import { indigoClean, indigoLayout } from '../io/indigo.js';
import { eitherAsWavy, parseMolfile as readMolfile, writeMolfile } from '../io/molfile.js';
import { chemistryMolfile, withGroupsDrawnOut } from '../editor/abbreviate.js';
import { expandable } from '../editor/groups.js';
import { getRDKit } from '../io/rdkit.js';
import { bondsByAtom, bracketsOfMolecule, keepMargins, orbitalAngle, otherEnd, setOrbitalAngle } from '../model/doc.js';
import { fragments, ringList } from '../model/graph.js';
import { ringsOf as cachedRings } from '../render/scene.js';
import { FOLDED, LARGE } from './conformer.js';
import { faceOf, hybridIn3D, planeNormals, uprightOnPage } from './orbitals3D.js';
import { gridTurn, layoutProblems, rmsdAfterRotation, turnedPoints } from './geometry.js';
import { keepHandedness, parseMolfile } from './molfile.js';
import { templateLayout } from './ringTemplates.js';
import { asDrawn, buildComplex, drawingOfModel, hasMetal, molfile3D, transitionDrawing, views } from './threeD.js';
import { stereoFits } from '../io/xyz.js';
import { complexIn3D, conformerBatch, conformerIn3D, openChemLib, stopConformers } from '../io/threeD.js';
import { labelAtom } from './complex3D.js';
import { conformationOf, hasConformation, setTorsions } from '../chem/conformation.js';
import { complexHandedness } from '../chem/handedness.js';
import { nearerInFront } from '../chem/newman.js';
import { t } from '../i18n/i18n.js';

// Two drawings count as the same if, after the best rotation, atoms are on
// average less than this many bond lengths apart.
const SAME_DRAWING = 0.05;
const STEREO = { 1: 'wedge', 6: 'hash', 4: 'wavy' };

function rdkitLayout(RDKit, molfile, { coordGen = false, straighten = false } = {}) {
  const mol = readMol(RDKit, molfile);
  try {
    mol.set_new_coords(coordGen);
    mol.normalize_depiction(1); // the long axis horizontal
    if (straighten) mol.straighten_depiction(true); // bonds on "nice" angles
    return mol.get_v2Kmolblock();
  } finally {
    mol.delete(); // RDKit objects live in WebAssembly memory and must be freed by hand
  }
}

// Seeds for the conformers, tried in turn until the 3D model has the drawn
// R/S and E/Z (RDKit keeps them; OpenChemLib, for what RDKit has no MMFF94
// types for, reads the wedges of some crowded centres wrong, and doesn't
// always keep them in tight ring systems).
const SEEDS = [42, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
// with a drawn conformation to find (a chair with an axial group: the other chair is often the one found)
const MORE_SEEDS = [...SEEDS, ...Array.from({ length: 32 }, (_, k) => 16 + k)];

// A molecule in 3D (a metal complex built from its coordination geometry,
// anything else by RDKit or OpenChemLib, checked for the drawn R/S and E/Z:
// mirrored, or built again, if it hasn't them), worked out once per job:
// { points (3D, bond lengths), pairs, complex, metal } or { reason }.
export function model3D(job, molecule) {
  job.model3D ??= new Map();
  if (!job.model3D.has(molecule)) {
    job.model3D.set(molecule, (async () => {
      const OCL = await openChemLib();
      let complex = buildComplex(molecule, { OCL, defer: true });
      if (complex?.reason) return { reason: complex.reason };
      // a metal complex: optimised by UFF in a worker, the page free meanwhile; with its labels drawn out (a Ph
      // on a porphyrin as its phenyl, PPh3 with its phenyls: what the XYZ export builds too), the molecule's own
      // atoms the first of it, the groups' after them (`drawnOut`: every atom's point)
      let drawnOut = null;
      if (complex?.deferred) {
        const source = molecule.full3D?.described ?? molecule;
        complex = await complexIn3D(source);
        if (job.cancelled?.()) return { reason: 'cancelled' };
        if (complex?.reason) return { reason: complex.reason };
        if (source !== molecule && complex?.points) {
          const own = molecule.elements.length;
          drawnOut = complex.points;
          complex = { ...complex, points: complex.points.slice(0, own), pieces: complex.pieces.map((piece) => ({ ...piece, atoms: piece.atoms.filter((i) => i < own) })) };
        }
      }
      // (a transition state with a five-bonded centre, SN2, is one too: buildComplex finds it, UFF builds it on a
      // trigonal bipyramid, the bonds forming and breaking axial)
      if (!complex && molecule.links.some((l) => l.kind === 'partial' || l.kind === 'hbond')) return { reason: t('partial or hydrogen bonds outside a transition state or a metal complex') };
      let points = complex?.points;
      let full = null; // the conformer's every atom (its hydrogens and groups drawn out after the molecule's own)
      let conformationLost = false; // no conformer with the drawn conformation found: another one
      if (!points) {
        try {
          // the lowest energy of a few tries with the drawn R/S and E/Z (S8's crown is found only now and then)
          // (abbreviations drawn out: the molecule's own atoms are the first of the model's, the rest dropped)
          const checked = molecule.full3D?.molfile ?? molecule.sidedMolfile ?? molecule.molfile;
          const fits = (p) => stereoFits(job.RDKit, checked, () => molfile3D(checked, p));
          // the drawn conformation (a chair, a Newman projection along a ring bond): only conformers with it count;
          // the best without it kept in case none has it
          const { conformation } = molecule;
          const shaped = (p) => hasConformation(conformation, p);
          const seeds = conformation?.checks.length ? MORE_SEEDS : SEEDS;
          let unshaped = null;
          const large = molecule.elements.length > LARGE;
          const wanted = large ? 2 : 4;
          const found = [];
          // the tries in workers (a large molecule takes a second or two), as many at once as there are workers,
          // taken in order, not as they finish: RDKit's result for a seed is the same in every browser and
          // whatever its worker built before. (OpenChemLib's, for what RDKit can't do, isn't. A dative bond in it as N⁺–B⁻.)
          // Once enough are found, or the window is closed (looked at every 250 ms, not after a try of
          // seconds), the tries still going are stopped.
          const ahead = [];
          const group = {};
          let k = 0;
          const start = () => {
            if (k < seeds.length && (large ? ahead.length < conformerBatch() : found.length + ahead.length < wanted)) {
              const entry = conformerIn3D(molecule.full3D?.for3D ?? molecule.molfileFor3D ?? molecule.molfile, seeds[k++], group).then((points) => ({ points, from: entry }), (error) => ({ error, from: entry }));
              ahead.push(entry);
            }
          };
          let watch;
          const closed = new Promise((resolve) => {
            watch = setInterval(() => job.cancelled?.() && resolve({ closed: true }), 250);
          });
          try {
            for (let i = 0; i < conformerBatch(); i++) start();
            while (ahead.length) {
              // in seed order; a large molecule: as they finish (see LARGE)
              const { points: tried, error, closed: gone, from } = await Promise.race([...(large ? ahead : ahead.slice(0, 1)), closed]);
              if (from) ahead.splice(ahead.indexOf(from), 1);
              if (gone || job.cancelled?.()) return { reason: 'cancelled' };
              if (error) throw error;
              if (tried) {
                const mirrored = Object.assign(tried.map(([x, y, z]) => [x, y, -z]), { energy: tried.energy, hydrogens: (tried.hydrogens ?? []).map(([x, y, z]) => [x, y, -z]) }); // every centre the other way round
                const right = [tried, mirrored].filter(shaped).find(fits);
                if (right) found.push({ points: right, energy: tried.energy ?? Infinity });
                else if (conformation && (!unshaped || (tried.energy ?? Infinity) < unshaped.energy)) {
                  const loose = [tried, mirrored].find(fits);
                  if (loose) unshaped = { points: loose, energy: tried.energy ?? Infinity };
                }
                if (found.filter((f) => f.energy <= FOLDED).length >= wanted || (found.length && tried.energy === null)) break;
              }
              start(); // (no more going than can still count: one left over would stop its worker, and the next 3D model wait for a new one)
            }
          } finally {
            clearInterval(watch);
            stopConformers(group);
          }
          if (!found.length && unshaped) {
            found.push(unshaped);
            conformationLost = true;
          }
          if (!found.length) return { reason: t('no 3D structure with the drawn R/S and E/Z') };
          const chosen = found.reduce((best, f) => (f.energy < best.energy ? f : best)).points;
          full = [...chosen, ...(chosen.hydrogens ?? [])];
          points = chosen.slice(0, molecule.atomIds.length);
          // no force field types (P with five bonds): built round that atom by VSEPR, if there is one; else as generated (boron)
          if (found[0].energy === Infinity) {
            const centred = buildComplex(molecule, { anyLigands: true, OCL });
            if (centred?.points) [complex, points, full] = [centred, centred.points, null];
          }
        } catch (error) {
          // no force field types (P with five bonds): built round that atom by VSEPR, if there is one
          complex = buildComplex(molecule, { anyLigands: true, OCL });
          if (!complex?.points) throw error;
          points = complex.points;
        }
      }
      if (!points) return { reason: t('no 3D structure found') };
      // a complex as drawn, not its mirror image (Λ stays Λ; a transition state's groups round the way its wedges say)
      let mirrored = false;
      if (complex?.metal !== undefined && complex?.metal !== null) {
        const drawn = asDrawn(molecule, complex.metal, points);
        mirrored = drawn !== points;
        points = drawn;
      }
      if (drawnOut) full = drawnOut.map(([x, y, z]) => [x, y, mirrored ? -z : z]);
      const atoms = modelAtoms(molecule, points, full, complex?.points === undefined ? null : complex.hydrogens, mirrored);
      // a Newman projection of a chain: its back turned to the dihedral drawn (gauche, eclipsed), the hydrogens with it
      if (!complex && molecule.conformation?.sets.length) {
        setTorsions(molecule.conformation, atoms.points, atoms.bonds);
        points = atoms.points.slice(0, molecule.elements.length);
      }
      return { points, pairs: molecule.links.map((l) => [l.a, l.b]), complex, metal: complex?.metal ?? null, axial: complex?.axial ?? null, atoms, conformationLost };
    })());
  }
  return job.model3D.get(molecule);
}

// A 3D model's every atom, for showing it as it is (a stick model): { elements, points, bonds: [[a, b]] }, the
// molecule's own atoms first. With an organic molecule's conformer (`full`) its hydrogens and the groups its labels
// stand for (from the molfile it was made from), a hydrogen on its nearest atom; with a complex, the
// hydrogens UFF placed ([atom, point]); otherwise the molecule's atoms only. `mirrored`: the model turned to
// its mirror image (a complex as drawn), the hydrogens with it.
function modelAtoms(molecule, points, full, hydrogens, mirrored) {
  const own = molecule.elements.length;
  const labels = readMolfile(molecule.molfile).atoms; // (with the labels' text)
  // a label's atom as the atom it hangs by (the conformer's, where its group was drawn out)
  const elements = molecule.elements.map((el, i) => (el === '*' ? labelAtom(labels[i]?.alias, labels[i]?.charge ?? 0) : el));
  const all = points.map((p) => [...p]);
  // [a, b, order, kind]: double and triple bonds shown as such, a coordination bond (dative) and a partial one their own way
  const bonds = molecule.links.filter((l) => l.kind !== 'hbond').map((l) => [l.a, l.b, l.order ?? 1, l.kind ?? null]);
  if (full && full.length > own) {
    // the molfile the conformer was made from: its atoms (the molecule's, then a label's groups) and bonds
    const source = (molecule.full3D?.for3D ?? molecule.molfileFor3D ?? molecule.molfile).split('\n');
    const [count, bondCount] = [Number(source[3].slice(0, 3)), Number(source[3].slice(3, 6))];
    for (let k = own; k < full.length; k++) {
      elements.push(k < count ? source[4 + k].slice(31, 34).trim() : 'H');
      all.push([...full[k]]);
    }
    for (let k = 0; k < bondCount; k++) {
      const line = source[4 + count + k];
      const [a, b, order] = [Number(line.slice(0, 3)) - 1, Number(line.slice(3, 6)) - 1, Number(line.slice(6, 9))];
      if (a >= own || b >= own) bonds.push([a, b, order >= 1 && order <= 3 ? order : 1, null]);
    }
    for (let k = Math.max(count, own); k < full.length; k++) {
      let nearest = 0;
      for (let j = 0; j < Math.max(count, own); j++) if (Math.hypot(...all[j].map((v, q) => v - all[k][q])) < Math.hypot(...all[nearest].map((v, q) => v - all[k][q]))) nearest = j;
      bonds.push([nearest, k, 1, null]);
    }
  }
  for (const [on, point] of hydrogens ?? []) {
    elements.push('H');
    all.push(mirrored ? [point[0], point[1], -point[2]] : [...point]);
    bonds.push([on, all.length - 1, 1, null]);
  }
  // each label's atoms: its own, and what hangs on it beyond the molecule's atoms (its group drawn out, its hydrogens)
  const near = all.map(() => []);
  for (const [a, b] of bonds) {
    near[a].push(b);
    near[b].push(a);
  }
  const groups = molecule.elements.flatMap((el, i) => {
    if (el !== '*') return [];
    const members = [i];
    const seen = new Set(members);
    for (let k = 0; k < members.length; k++) for (const j of near[members[k]]) if (j >= own && !seen.has(j)) { seen.add(j); members.push(j); }
    return [{ name: labels[i]?.alias ?? '?', atoms: members }];
  });
  return { elements, points: all, bonds, groups };
}

// The drawing of a view of a molecule's 3D model: see threeD.js. A complex's ligands and end atoms seen nearly end
// on moved out along their bond until it is long enough to read (drawingOfModel: smoothly, so that a turning
// molecule never jumps), in Redraw and in Turn in 3D alike; for Redraw a transition state as textbooks draw it.
// `seen` (Turn in 3D, turning it) and a transition state: as the view has it, every bond as long as it looks from
// there, so that its partial bonds shorten as it turns, a thing in space.
export function drawing3D(job, molecule, model, view, { seen = false } = {}) {
  const drawing = drawingOfModel(job.RDKit, molecule, model, view, { spread: !seen || !model.axial });
  // (the perpendicular to the molecule's plane at each atom, for p orbitals upright to it)
  if (view.points3) {
    drawing.normals = planeNormals(view.points3, molecule.links);
    drawing.points3 = view.points3; // (for hybrid orbitals' directions)
  }
  return model.axial && !seen ? transitionDrawing(molecule, model, drawing) : drawing;
}

// The 3D engine's views of a molecule, the clearest first: { drawings } or { reason }.
async function threeDViews(job, molecule) {
  const model = await model3D(job, molecule);
  if (model.reason) return model;
  const { complex } = model;
  const options = { axes: !complex, flat: complex?.flat, prefer: complex?.prefer, complex, labelled: molecule.elements.map((el) => el !== 'C') };
  return { drawings: views(model.points, model.pairs, options).map((view) => drawing3D(job, molecule, model, view)) };
}

// Indigo's clean-up of the selected atoms of a molecule only partly
// selected (the rest stays exactly where it is, so the drawing is put back
// in place, not centred); a molecule selected whole is cleaned whole.
async function cleanPart(job, molfile, molecule) {
  if (!job.partial) return { molfile: null, reason: 'no molecule only partly selected' };
  return inPlace(molecule, molfile, keepHandedness(molfile, await indigoClean(molfile, molecule.selected ?? [])));
}

// An engine's molfile of a whole molecule in which only the selected atoms
// moved, back in the drawing's coordinates: the rest exactly where it was.
function inPlace(molecule, molfile, out) {
  const before = parseMolfile(molfile).atoms;
  const after = parseMolfile(out).atoms;
  // the molfile's coordinates to the drawing's (its scale, y up): from where the atoms were
  const middle = (points) => points.reduce(([x, y], p) => [x + p[0] / points.length, y + p[1] / points.length], [0, 0]);
  const [mx, my] = middle(before.map((a) => [a.x, a.y]));
  const [dx, dy] = middle(molecule.points);
  const spread = (points, [cx, cy]) => points.reduce((sum, [x, y]) => sum + Math.hypot(x - cx, y - cy), 0);
  const scale = spread(molecule.points, [dx, dy]) / (spread(before.map((a) => [a.x, a.y]), [mx, my]) || 1) || 1;
  const moving = new Set(molecule.selected ?? molecule.atomIds.map((_, k) => k));
  const points = after.map((a, k) => (moving.has(k) ? [dx + (a.x - mx) * scale, dy - (a.y - my) * scale] : molecule.points[k]));
  return { drawing: { points, stereo: engineStereo(molecule, parseMolfile(out).bonds) }, inPlace: true };
}

// --- a selected part redrawn and put back ---

// A molfile's drawing in drawing units: bonds 1 long (by the median), y down.
function unitPoints(molfile) {
  const { atoms, bonds } = parseMolfile(molfile);
  const lengths = bonds.map(({ a, b }) => Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y)).sort((p, q) => p - q);
  const scale = 1 / (lengths[Math.floor(lengths.length / 2)] || 1);
  return { points: atoms.map(({ x, y }) => [x * scale, -y * scale]), bonds };
}

// Where a bond from atom `f` (index) can go, the rest of the molecule as it
// is: between its other bonds (`others`: indices), or the way it went.
function freeDirections(points, f, others, current) {
  const angles = others.map((k) => Math.atan2(points[k][1] - points[f][1], points[k][0] - points[f][0])).sort((a, b) => a - b);
  if (!angles.length) return [current];
  if (angles.length === 1) return [angles[0] + (2 * Math.PI) / 3, angles[0] - (2 * Math.PI) / 3, current];
  // the middle of the widest gap between its bonds
  let best = null;
  angles.forEach((a, k) => {
    const next = k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI;
    if (!best || next - a > best.gap) best = { gap: next - a, middle: (a + next) / 2 };
  });
  return [best.middle, current];
}

// The pieces put back: each piece's drawing (`drawn`: { points in piece
// order, f included; kept: as it was drawn }) turned onto the bond it hangs
// by, p one bond from f, the way (and side: mirrored or not) that crosses
// and crowds the rest least. A laid-out piece brings its bond to f along; a
// kept one has it leave p where p's own bonds leave room (where f was says
// nothing once the part has been dragged off). Returns { points, mirrored:
// [bool per piece] }.
function putBack(molecule, pieces, drawn) {
  const points = molecule.points.map((p) => [...p]);
  const mirrored = [];
  pieces.forEach((piece, n) => {
    const { points: own, kept } = drawn[n];
    const [pi, fi] = [piece.index.indexOf(piece.p), piece.index.indexOf(piece.f)];
    const insideP = molecule.pairs.flatMap(([a, b]) => (a === piece.p ? [b] : b === piece.p ? [a] : []))
      .filter((k) => k !== piece.f).map((k) => piece.index.indexOf(k));
    const F = molecule.points[piece.f];
    const current = Math.atan2(molecule.points[piece.p][1] - F[1], molecule.points[piece.p][0] - F[0]);
    const others = molecule.pairs.flatMap(([a, b]) => (a === piece.f && b !== piece.p ? [b] : b === piece.f && a !== piece.p ? [a] : []))
      .filter((k) => !piece.index.includes(k) || k === piece.f);
    let best = null;
    for (const direction of freeDirections(points, piece.f, others, current)) {
      for (const mirror of [false, true]) {
        const flip = ([x, y]) => (mirror ? [x, -y] : [x, y]);
        const P0 = flip(own[pi]);
        let F0 = flip(own[fi]);
        if (kept) {
          const flipped = own.map(flip);
          const [out] = freeDirections(flipped, pi, insideP, Math.atan2(F0[1] - P0[1], F0[0] - P0[0]));
          F0 = [P0[0] + Math.cos(out), P0[1] + Math.sin(out)];
        }
        const P = [F[0] + Math.cos(direction), F[1] + Math.sin(direction)];
        const turn = Math.atan2(F[1] - P[1], F[0] - P[0]) - Math.atan2(F0[1] - P0[1], F0[0] - P0[0]);
        const [c, s] = [Math.cos(turn), Math.sin(turn)];
        const trial = points.map((p) => [...p]);
        piece.index.forEach((k, i) => {
          if (k === piece.f) return;
          const [x, y] = flip(own[i]);
          const [dx, dy] = [x - P0[0], y - P0[1]];
          trial[k] = [P[0] + c * dx - s * dy, P[1] + s * dx + c * dy];
        });
        const { crossings, overlaps } = layoutProblems(trial, molecule.pairs);
        const score = 3 * crossings + overlaps;
        if (!best || score < best.score) best = { score, trial, mirror };
      }
    }
    piece.index.forEach((k) => { points[k] = best.trial[k]; });
    mirrored.push(best.mirror);
  });
  return { points, mirrored };
}

const SWAPPED = { wedge: 'hash', hash: 'wedge' };

// An engine for the selected part only: each piece of it laid out alone by
// `layout` (a molfile in, one out), or as drawn (no layout), and put back;
// the rest of the molecule stays exactly. A molecule selected whole stays
// as it is; a piece tied to the rest by more than one bond can't be put
// back this way (the tidy-up can do it).
const partEngine = (layout) => async (job, molfile, molecule) => {
  if (!job.partial) return { molfile: null, reason: 'no molecule only partly selected' };
  if (!molecule.pieces) return { molfile };
  if (molecule.pieces.some((piece) => piece.tied)) return { molfile: null, reason: 'the selected part hangs on the rest by more than one bond' };
  const drawn = [];
  const stereos = [];
  for (const piece of molecule.pieces) {
    if (!layout) {
      drawn.push({ points: piece.index.map((k) => molecule.points[k]), kept: true });
      stereos.push(null);
      continue;
    }
    const result = asResult(await layout(job, piece.molfile));
    if (!result.molfile) return { molfile: null, reason: result.reason ?? 'no drawing of the part' };
    const { points, bonds } = unitPoints(result.molfile);
    drawn.push({ points, kept: false });
    stereos.push(bonds.map(({ a, b, stereo }) => [piece.index[a], piece.index[b], STEREO[stereo] ?? '']));
  }
  const { points, mirrored } = putBack(molecule, molecule.pieces, drawn);
  // the wedges: as they were, the pieces' own from their layout; mirrored, wedges and hashes swapped (R/S kept)
  // (the bond a piece hangs by, wedged from a stereocentre on the rest: as it was, neither the layout's,
  // which sees that atom with one bond and no stereo, nor swapped, as that atom stays where it is)
  const hanging = molecule.pieces.map((piece) => molecule.links.find((l) => l.stereo && l.a === piece.f && l.b === piece.p));
  const holds = (n, a, b) => Boolean(hanging[n]) && [a, b].includes(hanging[n].a) && [a, b].includes(hanging[n].b);
  const inPiece = (n, a, b) => molecule.pieces[n].index.includes(a) && molecule.pieces[n].index.includes(b) && !holds(n, a, b);
  const stereo = molecule.links.map((l) => [l.a, l.b, l.stereo ?? '']).filter(([a, b]) => !molecule.pieces.some((_, n) => stereos[n] && inPiece(n, a, b)));
  stereos.forEach((list, n) => list && stereo.push(...list.filter(([a, b]) => !holds(n, a, b))));
  const flipped = stereo.map(([a, b, kind]) => {
    const n = molecule.pieces.findIndex((_, m) => inPiece(m, a, b));
    return [a, b, n >= 0 && mirrored[n] ? SWAPPED[kind] ?? kind : kind];
  });
  return { drawing: { points, stereo: flipped }, inPlace: true };
};

// The selected part laid out by RDKit (or CoordGen) around the rest, which
// stays fixed as a template: for a part held at any number of places (a
// ring in the middle). If the template fits the molecule another way round
// (symmetry), the fixed atoms would move: then nothing.
// A molfile with these atoms (index -> label) marked by isotopes, so that a
// template marked the same way fits only one way (its other isotopes gone).
function labelled(molfile, labels) {
  const lines = molfile.split('\n').filter((line) => !line.startsWith('M  ISO'));
  const entries = [...labels].map(([k, label]) => `${String(k + 1).padStart(4)}${String(label).padStart(4)}`);
  const iso = [];
  for (let i = 0; i < entries.length; i += 8) iso.push(`M  ISO${String(Math.min(8, entries.length - i)).padStart(3)}${entries.slice(i, i + 8).join('')}`);
  const end = lines.findIndex((line) => line.startsWith('M  END'));
  return [...lines.slice(0, end), ...iso, ...lines.slice(end)].join('\n');
}

const aroundEngine = ({ coordGen = false } = {}) => (job, molfile, molecule) => {
  if (!job.partial) return { molfile: null, reason: 'no molecule only partly selected' };
  if (!molecule.selected) return { molfile };
  // every fixed atom its own label (a mass no element has), in the molecule and in the template
  const moving = new Set(molecule.selected);
  const fixed = molecule.atomIds.map((_, k) => k).filter((k) => !moving.has(k));
  let mol = null;
  let template = null;
  try {
    mol = readMol(job.RDKit, labelled(molfile, new Map(fixed.map((k, i) => [k, 300 + i]))));
    template = readMol(job.RDKit, labelled(molecule.fixedMolfile, new Map(fixed.map((k, i) => [i, 300 + i]))));
    const found = mol.generate_aligned_coords(template, JSON.stringify({ useCoordGen: coordGen, allowRGroups: false, acceptFailure: false, alignOnly: false }));
    if (!found || found === '{}') return { molfile: null, reason: 'the rest could not be kept as a template' };
    const out = mol.get_v2Kmolblock();
    const [before, after] = [parseMolfile(molfile).atoms, parseMolfile(out).atoms];
    if (before.some((a, k) => !moving.has(k) && Math.hypot(a.x - after[k].x, a.y - after[k].y) > 1e-3)) return { molfile: null, reason: 'the template fitted the molecule another way round' };
    return inPlace(molecule, molfile, out);
  } finally {
    mol?.delete();
    template?.delete();
  }
};

// Is a drawing from a 3D model what this molecule needs? A metal complex (its coordination geometry), a molecule
// built round one atom with more than an octet or five electron pairs and only single atoms on it (VSEPR: PCl5,
// SF6, ClO4-), a transition state (partial bonds: SN2's trigonal bipyramid) and a cage (rings sharing two bonds or
// more: adamantane, norbornane, tropane). Any other molecule Turn in 3D shows in 3D; Redraw's flat engines draw it
// better (a chemist's picks in the drawing game: the 3D drawings lost about 95 % of their pairs).
function needs3D(job, molfile, molecule) {
  if (hasMetal(molecule)) return true;
  if (molecule.links.some((l) => l.kind === 'partial')) return true;
  const n = molecule.elements.length;
  const order = Array(n).fill(0);
  const near = Array.from({ length: n }, () => []);
  for (const l of molecule.links) {
    if (l.kind) continue;
    order[l.a] += l.order;
    order[l.b] += l.order;
    near[l.a].push(l.b);
    near[l.b].push(l.a);
  }
  const hypervalent = (i) => !['C', 'H', '*'].includes(molecule.elements[i]) && near[i].length >= 2 && near[i].every((j) => near[j].length === 1)
    && (order[i] > 4 || near[i].length + (molecule.lonePairs[i] ?? 0) >= 5);
  if (molecule.elements.some((_, i) => hypervalent(i))) return true;
  const mol = job.RDKit.get_mol(molfile, JSON.stringify({ sanitize: false }));
  if (!mol) return false;
  try {
    const rings = JSON.parse(mol.get_json()).molecules[0].extensions?.find((e) => e.name === 'rdkitRepresentation')?.atomRings ?? [];
    const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const bonds = rings.map((r) => new Set(r.map((a, i) => key(a, r[(i + 1) % r.length]))));
    return bonds.some((p, i) => bonds.slice(i + 1).some((q) => [...p].filter((b) => q.has(b)).length >= 2));
  } catch {
    return false;
  } finally {
    mol.delete();
  }
}

const threeD = (k) => async (job, molfile, molecule) => {
  if (!needs3D(job, molfile, molecule)) return { molfile: null, reason: 'only for metal complexes, molecules with more than an octet (VSEPR), cages and transition states: Turn in 3D shows any molecule in 3D' };
  const found = await threeDViews(job, molecule);
  if (found.reason) return { molfile: null, reason: found.reason };
  return found.drawings[k] ? { drawing: found.drawings[k] } : { molfile: null, reason: 'only one clear view' };
};

// The engines, run and shown in this order. Each takes a molfile (and the
// molecule as prepared) and gives one with the same atoms in the same
// order, or { molfile, detail }, or { drawing } (points and wedges), or
// { molfile: null, reason } if it doesn't apply. `rule` is what debug mode
// shows about how the engine draws.
export const ENGINES = [
  { label: 'Selected part unchanged, reattached', part: 'kept', rule: 'The selected part kept as drawn, put back one bond from the rest on the bond it hangs by, the way that crosses and crowds least', run: partEngine(null), fallback: (ctx, m) => m },
  { label: 'Selected part by RDKit', part: 'redrawn', rule: "The selected part drawn alone by RDKit (with the atom it hangs on), put back the same way", run: partEngine(({ RDKit }, m) => rdkitLayout(RDKit, m)), fallback: (ctx, m) => m },
  { label: 'Selected part by RDKit, straightened', part: 'redrawn', rule: 'The same, bonds turned onto multiples of 30°', run: partEngine(({ RDKit }, m) => rdkitLayout(RDKit, m, { straighten: true })), fallback: (ctx, m) => m },
  { label: 'Selected part with a ring template', part: 'redrawn', rule: "The selected part drawn alone with RDKit's ring-system templates, put back the same way", run: partEngine(async ({ RDKit }, m) => (await templateLayout(RDKit, m)) ?? rdkitLayout(RDKit, m)), fallback: (ctx, m) => m },
  { label: 'Selected part by CoordGen', part: 'redrawn', rule: 'The selected part drawn alone by CoordGen, put back the same way', run: partEngine(({ RDKit }, m) => rdkitLayout(RDKit, m, { coordGen: true })), fallback: (ctx, m) => m },
  { label: 'Selected part by Indigo', part: 'redrawn', rule: "The selected part drawn alone by Indigo's layout, put back the same way", run: partEngine((ctx, m) => indigoLayout(m)), fallback: (ctx, m) => m },
  { label: 'Selected part by RDKit around the rest', part: 'redrawn', rule: 'The whole molecule laid out by RDKit with the unselected atoms kept where they are (a template): for a part held at several places', run: aroundEngine(), fallback: (ctx, m) => m },
  { label: 'Selected part by CoordGen around the rest', part: 'redrawn', rule: 'The same with CoordGen', run: aroundEngine({ coordGen: true }), fallback: (ctx, m) => m },
  { label: 'Indigo clean-up, selected part', part: 'tidied', slow: true, rule: "Indigo's clean-up of the selected atoms only (bond lengths and angles evened out there), the rest left exactly where it is", run: cleanPart, fallback: (ctx, m) => m },
  { label: 'Indigo layout', rule: "Indigo's layout (Ketcher's Layout button)", run: (ctx, m) => indigoLayout(m) },
  {
    label: 'RDKit + ring template',
    rule: "RDKit with RDKit's ring-system templates (textbook drawings of bridged and fused systems) for the largest matching ring system, the rest laid out around it",
    run: ({ RDKit }, m) => templateLayout(RDKit, m),
    fallback: ({ RDKit }, m) => rdkitLayout(RDKit, m),
  },
  { label: 'RDKit', rule: "RDKit's own depiction, long axis horizontal", run: ({ RDKit }, m) => rdkitLayout(RDKit, m) },
  { label: 'CoordGen', rule: 'Schrödinger CoordGen (good for macrocycles)', run: ({ RDKit }, m) => rdkitLayout(RDKit, m, { coordGen: true }) },
  { label: 'Indigo clean-up', slow: true, rule: "Indigo's clean-up of the current drawing (bond lengths and angles evened out)", run: async (ctx, m) => keepHandedness(m, await indigoClean(m)) },
  {
    label: '3D, projected',
    slow: true,
    rule: 'Built in 3D (a metal complex optimised as a whole by UFF on its coordination polyhedron; anything else by OpenChemLib, MMFF94s+), turned to the clearest view and projected; wedges for depth. Only for metal complexes, molecules with more than an octet, cages and transition states',
    view: true,
    run: threeD(0),
    fallback: (ctx, m) => m,
  },
  { label: '3D, projected, another view', slow: true, rule: 'The same 3D structure from the next clearest side', view: true, run: threeD(1), fallback: (ctx, m) => m },
];

const asResult = (result) => (typeof result === 'string' || result === null ? { molfile: result } : result);
const found = (result) => Boolean(result.molfile || result.drawing);

// The molecules to re-layout: those with a selected atom (whole molecules),
// or the only molecule there is. Null if nothing fits.
export function relayoutTargets(ed) {
  // (molecules kept together by links each on their own)
  const frags = fragments(ed.doc, bondsByAtom(ed.doc, { links: false })).filter((members) => members.length > 1);
  const selected = new Set(ed.selectedAtoms());
  if (!selected.size) return frags.length === 1 ? { molecules: frags, partial: false } : null;
  const molecules = frags.filter((members) => members.some((id) => selected.has(id)));
  if (!molecules.length) return null;
  return { molecules, partial: molecules.some((members) => members.some((id) => !selected.has(id))) };
}

// A molecule with abbreviations (CO2Me, OBz) is built in 3D drawn out: a label is no atom to build or to
// tell R/S by. The molfiles of it drawn out (full3D: { molfile, for3D }) have the molecule's atoms first,
// in its order, a label as its group's first atom, and the rest of the groups after them.
async function drawnOutFor3D(doc, molecule) {
  const labels = expandable(doc, molecule.atomIds);
  if (!labels.length) return;
  // one label at a time, so that each is known by its group's atom on the atom it hung on (three Ph on
  // one carbon: three different atoms)
  const byAtom = bondsByAtom(doc);
  const became = new Map();
  let full = doc;
  for (const label of labels) {
    const before = new Set(full.atoms.keys());
    ({ doc: full } = await withGroupsDrawnOut(full, [label]));
    const anchor = otherEnd(byAtom.get(label)[0], label);
    const bond = [...full.bonds.values()].find((b) => (b.a === anchor || b.b === anchor) && !before.has(otherEnd(b, anchor)));
    if (!bond) return;
    became.set(label, otherEnd(bond, anchor));
  }
  const ours = molecule.atomIds.map((id) => became.get(id) ?? id);
  const taken = new Set(ours);
  const ordered = { ...full, atoms: new Map([...ours, ...[...full.atoms.keys()].filter((id) => !taken.has(id))].map((id) => [id, full.atoms.get(id)])) };
  const members = [...ordered.atoms.keys()].filter((id) => taken.has(id) || !doc.atoms.has(id));
  const sided = writeMolfile(ordered, members, '', { sided: true }).molfile;
  molecule.full3D = {
    molfile: sided,
    for3D: molecule.dative ? writeMolfile(ordered, members, '', { sided: true, dative: 'charged' }).molfile : sided,
    // (for a metal complex: built drawn out by UFF, as describeMolecule reads it)
    described: describeMolecule(ordered, members),
  };
}

// Everything the engines need: per molecule its atom ids (molfile order),
// molfile, canonical SMILES and current coordinates.
// A molecule as the 3D builders read it (Turn in 3D, Redraw and the XYZ export share it): `members` of `doc`,
// its atom ids in molfile order, elements, lone pairs, every bond (also those a molfile has no place for),
// molfile and drawn points.
export function describeMolecule(doc, members, electrons = electronsByAtom(doc)) {
  const { molfile, atomIds } = writeMolfile(doc, members);
  const atomSet = new Set(atomIds);
  const bonds = [...doc.bonds.values()].filter((b) => atomSet.has(b.a) && b.kind !== 'link');
  return {
    atomIds,
    bondIds: bonds.map((b) => b.id),
    elements: atomIds.map((id) => doc.atoms.get(id).el),
    lonePairs: atomIds.map((id) => electrons.get(id).lonePairs), // for VSEPR shapes
    // (each atom's hydrogens by our rules, a partial bond counted as a bond: a transition state's for UFF)
    hydrogens: atomIds.map((id) => electrons.get(id).hydrogens),
    // every bond, also those a molfile has no place for (dative, partial, hydrogen bonds); wedges narrow end first (a)
    links: bonds.map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind, stereo: b.stereo })),
    molfile,
    points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]),
    pairs: bonds.map((b) => [atomIds.indexOf(b.a), atomIds.indexOf(b.b)]),
    dative: bonds.some((b) => b.kind === 'dative'),
  };
}

export async function prepare(ed, targets) {
  const RDKit = await getRDKit();
  const electrons = electronsByAtom(ed.doc);
  const molecules = targets.molecules.map((members) => {
    const described = describeMolecule(ed.doc, members, electrons);
    const { molfile, atomIds, links, dative } = described;
    // (with its drawn hydrogens on a carbon with a wedge told apart, so that the axial one stays axial)
    const sided = writeMolfile(ed.doc, members, '', { sided: true }).molfile;
    return {
      ...described,
      // for the 2D engines: partial and dative bonds in it, so that a transition state stays in one
      // piece and a ring closed by a dative bond (N→B in a BODIPY) stays a ring
      layoutMolfile: links.some((l) => l.kind === 'partial' || l.kind === 'dative') ? writeMolfile(ed.doc, members, '', { partial: true, dative: 'any' }).molfile : molfile,
      // for the 3D builder outside a metal complex: a dative bond as N⁺–B⁻ (without one, the sided molfile)
      molfileFor3D: dative ? writeMolfile(ed.doc, members, '', { sided: true, dative: 'charged' }).molfile : sided,
      sidedMolfile: sided,
      smiles: readSmiles(RDKit, molfile),
      // the atoms whose drawn H has a side but which are no stereocentre (a chair's CH2 with its axial H
      // drawn): their R or S with that H told apart, which a drawing keeps (keepSidedHydrogens)
      sidedOnly: sidedOnly(RDKit, molfile, sided, described),
      // the conformation drawn (a chair, a Newman projection), for the 3D model
      conformation: conformationOf(ed.doc, atomIds),
      // Λ or Δ of an octahedral complex with chelates, as drawn (metal atom id -> 'Λ' | 'Δ')
      handedness: complexHandedness(ed.doc, atomIds),
    };
  });
  for (const molecule of molecules) {
    await drawnOutFor3D(ed.doc, molecule);
    // (only where it matters, an atom with two labels: drawn out in a turned view, a Fischer sugar's labels would not read back)
    const byAtom = bondsByAtom(ed.doc);
    const anchors = expandable(ed.doc, molecule.atomIds).map((label) => otherEnd(byAtom.get(label)[0], label));
    if (new Set(anchors).size < anchors.length) molecule.identity = readSmiles(RDKit, await chemistryMolfile(ed.doc, molecule.atomIds));
  }
  // a molecule only partly selected: its selected atoms (molfile order), the part to clean up alone,
  // and that part in pieces (connected), each with the bond it hangs on the rest by (p in it, f not)
  // and a molfile of it with f, to be drawn alone; or `tied`, if more than one bond holds it
  const selected = new Set(ed.selectedAtoms());
  for (const molecule of molecules) {
    const part = molecule.atomIds.flatMap((id, k) => (selected.has(id) ? [k] : []));
    if (part.length === molecule.atomIds.length) continue;
    molecule.selected = part;
    molecule.fixedMolfile = writeMolfile(ed.doc, molecule.atomIds.filter((id) => !selected.has(id)), '', { partial: true, dative: 'any' }).molfile;
    const inPart = new Set(part);
    const seen = new Set();
    molecule.pieces = [];
    for (const start of part) {
      if (seen.has(start)) continue;
      const piece = [start];
      seen.add(start);
      for (let i = 0; i < piece.length; i++) {
        for (const [a, b] of molecule.pairs) {
          const other = a === piece[i] ? b : b === piece[i] ? a : null;
          if (other !== null && inPart.has(other) && !seen.has(other)) {
            seen.add(other);
            piece.push(other);
          }
        }
      }
      const holding = molecule.pairs.filter(([a, b]) => piece.includes(a) !== piece.includes(b));
      if (holding.length !== 1) {
        molecule.pieces.push({ tied: holding.length });
        continue;
      }
      const [a, b] = holding[0];
      const [p, f] = piece.includes(a) ? [a, b] : [b, a];
      const ids = [...piece, f].map((k) => molecule.atomIds[k]);
      const written = writeMolfile(ed.doc, ids, '', { partial: true, dative: 'any' });
      molecule.pieces.push({ p, f, molfile: written.molfile, index: written.atomIds.map((id) => molecule.atomIds.indexOf(id)) });
    }
  }
  return { RDKit, molecules, partial: targets.partial };
}

function readSmiles(RDKit, molfile) {
  const mol = readMol(RDKit, molfile);
  try {
    return mol.get_smiles();
  } finally {
    mol.delete();
  }
}

// RDKit's R or S of each atom of a molfile that has one: index -> label.
function stereoTags(RDKit, molfile) {
  const mol = readMol(RDKit, molfile);
  try {
    return new Map(JSON.parse(mol.get_stereo_tags()).CIP_atoms.filter(([, label]) => /^\([RSrs]\)$/.test(label)));
  } finally {
    mol.delete();
  }
}

// The atoms (indices) with a drawn H whose side the drawing says though they are no stereocentre: R or S
// in the sided molfile (its drawn H as ²H), none in the plain one. index -> { label, hydrogens (their drawn
// H on an ordinary bond: indices) }.
function sidedOnly(RDKit, molfile, sided, { elements, links }) {
  const plain = stereoTags(RDKit, molfile);
  const out = new Map();
  for (const [i, label] of stereoTags(RDKit, sided)) {
    if (plain.has(i)) continue;
    const hydrogens = links.filter((l) => (l.a === i || l.b === i) && l.order === 1 && !l.kind && elements[l.a === i ? l.b : l.a] === 'H')
      .map((l) => (l.a === i ? l.b : l.a)).filter((h) => links.filter((l) => l.a === h || l.b === h).length === 1);
    if (hydrogens.length) out.set(i, { label, hydrogens });
  }
  return out;
}

// A drawing that kept the molecule, with the side of each drawn H that had one and that the engine left
// flat (a chair's axial H, anti to its Br, in the E2: on a CH2 the engines put no wedge, and the check, the
// SMILES, can't tell its two H apart): a wedge, or else a hashed wedge, on its bond, whichever gives its
// carbon the R or S it had with that H told apart. Only where the engine put no wedge at that carbon; a
// drawing these wedges would change (checked again) is left as the engine drew it.
async function keepSidedHydrogens(job, molecule, base, drawing) {
  if (!molecule.sidedOnly?.size) return drawing;
  const one = { molecules: [molecule] };
  const labels = (stereo) => stereoTags(job.RDKit, writeMolfile(withCandidate(base, one, { drawings: [{ ...drawing, stereo }] }), molecule.atomIds, '', { sided: true }).molfile);
  let stereo = drawing.stereo.map((s) => [...s]);
  const now = labels(stereo);
  let changed = false;
  for (const [c, { label, hydrogens }] of molecule.sidedOnly) {
    if (now.get(c) === label || stereo.some(([a, , st]) => a === c && st)) continue;
    found: for (const h of hydrogens) {
      const k = stereo.findIndex(([a, b]) => (a === c && b === h) || (a === h && b === c));
      if (k < 0) continue;
      for (const wedge of ['wedge', 'hash']) {
        const tried = stereo.map((s, j) => (j === k ? [c, h, wedge] : s));
        if (labels(tried).get(c) === label) {
          stereo = tried;
          changed = true;
          break found;
        }
      }
    }
  }
  if (!changed) return drawing;
  const kept = { ...drawing, stereo };
  return (await sameMolecule(job, molecule, withCandidate(base, one, { drawings: [kept] }))) ? kept : drawing;
}

// A molecule redrawn from an engine's molfile: atom positions in drawing
// units (bonds 1 long, y down) centred where the molecule was, and wedges
// as the engine set them: { points, stereo: [[a, b, stereo]] } (indices).
function fromMolfile(molecule, molfile) {
  const { atoms, bonds } = parseMolfile(molfile);
  const lengths = bonds.map(({ a, b }) => Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y)).sort((p, q) => p - q);
  const scale = 1 / (lengths[Math.floor(lengths.length / 2)] || 1);
  return placed(molecule, {
    points: atoms.map(({ x, y }) => [x * scale, -y * scale]),
    stereo: engineStereo(molecule, bonds),
  });
}

// An engine's wedges, [[a, b, stereo]] (indices), with each wavy bond of the drawing kept where the engine put no
// wedge (it says a double bond's E or Z, or a centre's R or S, is not known; an engine may say so on the double
// bond itself, "either", which the drawing shows by a wavy bond beside it, or not at all).
function engineStereo(molecule, bonds) {
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const wavy = new Map(molecule.links.filter((l) => l.stereo === 'wavy').map((l) => [key(l.a, l.b), l]));
  const out = bonds.map(({ a, b, order, stereo }) => {
    const said = STEREO[stereo] ?? '';
    const was = wavy.get(key(a, b));
    // (a double bond marked "either", its E or Z not said: as pasting draws it, a wavy bond beside it, or the
    // drawing would say E or Z where the molecule doesn't)
    return { ...(!said && was ? { a: was.a, b: was.b, stereo: 'wavy' } : { a, b, stereo: said }), order, ...(order === 2 && stereo === 3 && { either: true }) };
  });
  eitherAsWavy(out);
  return out.map(({ a, b, stereo }) => [a, b, stereo]);
}

// A drawing (points in drawing units) centred where the molecule was.
export function placed(molecule, drawing) {
  const centre = (points) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };
  const [cx, cy] = centre(drawing.points);
  const [ox, oy] = centre(molecule.points);
  return { ...drawing, points: drawing.points.map(([x, y]) => [x - cx + ox, y - cy + oy]) };
}

// Puts a molecule's drawing into `doc` (in place): its atoms' positions,
// wedges, and from 3D the depth of each bond (bond.z). Any other drawing has
// no depth: bonds that move lose theirs, those it leaves where they are (the
// rest, when a part is redrawn) keep it, so a tropane turned in 3D still
// crosses over itself. An atom that moves is no longer in a Fischer projection.
export function putDrawing(doc, molecule, drawing) {
  const moved = new Set();
  molecule.atomIds.forEach((id, k) => {
    const atom = doc.atoms.get(id);
    const [x, y] = drawing.points[k];
    if (Math.hypot(x - atom.x, y - atom.y) > 1e-3) {
      moved.add(id);
      delete atom.projection;
    }
    [atom.x, atom.y] = [x, y];
  });
  molecule.bondIds.forEach((id, k) => {
    const bond = doc.bonds.get(id);
    if (drawing.z) bond.z = Math.round(drawing.z[k] * 1000) / 1000;
    else if (moved.has(bond.a) || moved.has(bond.b)) delete bond.z;
  });
  // a Newman projection seen from its other end in 3D: its front carbon the one nearer the viewer now
  if (drawing.depth) nearerInFront(doc, molecule.bondIds, (atom) => drawing.depth[molecule.atomIds.indexOf(atom)]);
  uprightOrbitals(doc, molecule, drawing);
  for (const [a, b, stereo] of drawing.stereo) {
    const [ia, ib] = [molecule.atomIds[a], molecule.atomIds[b]];
    const id = molecule.bondIds.find((x) => [ia, ib].includes(doc.bonds.get(x).a) && [ia, ib].includes(doc.bonds.get(x).b));
    const bond = doc.bonds.get(id);
    if (!bond || bond.order !== 1 || (bond.kind && bond.kind !== 'dative')) continue;
    bond.stereo = stereo;
    // the wedge's narrow end first (a coordination bond keeps donor → acceptor: drawn from the acceptor)
    if (stereo && bond.a !== ia && bond.kind !== 'dative') [bond.a, bond.b] = [ia, ib];
  }
}

// p orbitals in a drawing from a 3D view: upright to the molecule's plane at their atoms (on the side
// chosen when they were first turned: orbital.plane, or drawing.faces), as long as that looks; each
// atom keeps which way the plane's perpendicular looks (atom.facing, from its first neighbour), for a
// p orbital put on it later. A drawing without depth (Redraw) leaves the orbitals as they are and the
// atoms it moves without a facing.
function uprightOrbitals(doc, molecule, drawing) {
  const index = new Map(molecule.atomIds.map((id, k) => [id, k]));
  if (!drawing.normals) {
    for (const id of molecule.atomIds) delete doc.atoms.get(id)?.facing;
    // (a flat drawing: no depth, every lobe behind the bonds again)
    for (const orbital of doc.orbitals?.values() ?? []) {
      if (!index.has(orbital.atom)) continue;
      delete orbital.z;
      delete orbital.dz;
    }
    return;
  }
  const round = (v) => Math.round(v * 1000) / 1000;
  for (const orbital of doc.orbitals?.values() ?? []) {
    const k = index.get(orbital.atom);
    if (k === undefined) continue;
    // its depth (the atom's), for painting the lobes back to front among the bonds
    if (drawing.depth) orbital.z = round(drawing.depth[k]);
    const normal = drawing.normals[k];
    if (orbital.kind === 'p' && normal) {
      const face = orbital.plane ?? drawing.faces?.get(orbital.id) ?? faceOf(normal, orbitalAngle(doc, orbital));
      const { angle, reach } = uprightOnPage(normal, face);
      setOrbitalAngle(doc, orbital, angle);
      Object.assign(orbital, { plane: face, reach: round(reach), dz: round(face * normal[2]) });
    } else if (orbital.kind === 'hybrid' && drawing.points3 && drawing.spatial?.get(orbital.id)) {
      // a hybrid (a lone pair in a pyridine's plane, say): its direction in space, as seen
      const v = hybridIn3D(drawing.spatial.get(orbital.id), drawing.points3, molecule.links, k);
      if (!v) continue;
      setOrbitalAngle(doc, orbital, Math.atan2(-v[1], v[0]));
      Object.assign(orbital, { reach: round(Math.max(0.2, Math.hypot(v[0], v[1]))), dz: round(v[2]) });
    }
  }
  for (const [id, k] of index) {
    const atom = doc.atoms.get(id);
    const normal = drawing.normals[k];
    if (!atom || !normal) {
      delete atom?.facing;
      continue;
    }
    // (the side pointing up the page, or towards the viewer when it is seen end on)
    const face = normal[1] > 0 || (Math.abs(normal[1]) < 1e-6 && normal[2] > 0) ? 1 : -1;
    const { angle, reach } = uprightOnPage(normal, face);
    const probe = { atom: id, angle: 0, ref: null };
    setOrbitalAngle(doc, probe, angle);
    atom.facing = { angle: Math.round(probe.angle * 1000) / 1000, reach: Math.round(reach * 1000) / 1000, face };
  }
}

// A copy of the document with the candidate's drawing put in.
export function withCandidate(doc, job, candidate) {
  const copy = structuredClone(doc);
  candidate.drawings.forEach((drawing, m) => putDrawing(copy, job.molecules[m], drawing));
  return copy;
}

// A drawing whose atoms are where they may be but whose wedges say other stereo than the molecule (an engine's
// wedge on the middle of three bonds that lie within 180°, which reads the other way; Indigo's clean-up keeping
// wedges that mean the other hand where atoms moved; a bond of a 3D view seen almost edge on): the molecule's own
// stereo laid onto its points by RDKit, which chooses the wedges anew. The drawing with them (still to be checked),
// or null: a molecule with labels, a metal's handedness or bonds a molfile has no place for is left as it is.
function rewedged(job, molecule, drawing) {
  if (molecule.identity || molecule.handedness?.size || molecule.links.some((l) => l.kind)) return null;
  const lines = molecule.molfile.split('\n');
  const counts = lines.findIndex((line, i) => i >= 3 && /V2000/.test(line));
  if (counts < 0) return null;
  const nAtoms = parseInt(lines[counts].slice(0, 3), 10);
  const nBonds = parseInt(lines[counts].slice(3, 6), 10);
  if (drawing.points.length !== nAtoms) return null;
  // the drawing's points (y up), no wedges
  const template = lines.map((line, k) => {
    const i = k - counts - 1;
    if (i >= 0 && i < nAtoms) return `${drawing.points[i][0].toFixed(4).padStart(10)}${(-drawing.points[i][1]).toFixed(4).padStart(10)}${line.slice(20)}`;
    if (i >= nAtoms && i < nAtoms + nBonds) return `${line.slice(0, 9)}  0${line.slice(12)}`;
    return line;
  }).join('\n');
  let mol = null;
  let shape = null;
  try {
    mol = readMol(job.RDKit, molecule.molfile);
    shape = readMol(job.RDKit, template);
    const match = mol.generate_aligned_coords(shape, JSON.stringify({ useCoordGen: false, acceptFailure: false }));
    if (!match || match === '{}') return null;
    return { ...drawing, stereo: engineStereo(molecule, parseMolfile(mol.get_molblock()).bonds) };
  } catch {
    return null;
  } finally {
    mol?.delete();
    shape?.delete();
  }
}

// Is the molecule, as drawn in `doc`, still the one it was (RDKit's canonical SMILES, stereo included)? With
// abbreviations drawn out, as R/S is told by the real atoms: to RDKit two labels on a stereocentre are the
// same unknown atom, so the centre has no R/S to compare, and a lost wedge would go unnoticed.
export async function sameMolecule(job, molecule, doc) {
  try {
    // (a complex's Λ or Δ, as drawn, kept: a drawing whose wedges at the metal say the other one, or neither, is another compound)
    if (molecule.handedness?.size) {
      const now = complexHandedness(doc, molecule.atomIds);
      if ([...molecule.handedness].some(([metal, label]) => now.get(metal) !== label)) return false;
    }
    if (!molecule.identity) return readSmiles(job.RDKit, writeMolfile(doc, molecule.atomIds).molfile) === molecule.smiles;
    return readSmiles(job.RDKit, await chemistryMolfile(doc, molecule.atomIds)) === molecule.identity;
  } catch {
    return false; // (a view RDKit can't read as a molecule)
  }
}

// How good a drawing looks, for the ranking (lower is better): crossings and
// overlaps count most; then bonds of the wrong length (in a chain, a
// substituent or a lone ring a fifth off already, a sloppy bond; in a cage or
// fused rings, drawn in perspective, only under half or over twice);
// ring atoms flattened into a straight line, drawn as a dot (a cage squashed
// flat); and
// angles away from what they should be where that is clear: 120° (180° at a
// triple bond) for an atom in no ring, the regular polygon's in a ring that
// shares no atom with another (fused rings and cages have no such ideal).
// Returns { score, parts } (the parts for debug mode).
export function drawingScore(doc, job, { crossings = 0, overlaps = 0 } = {}) {
  const ids = new Set(job.molecules.flatMap((m) => m.atomIds));
  const bonds = [...doc.bonds.values()].filter((b) => ids.has(b.a) && !b.kind);
  const at = (id) => doc.atoms.get(id);
  const rings = ringList(cachedRings(doc)).filter((ring) => ids.has(ring[0]));
  const bondsAt = new Map([...ids].map((id) => [id, []]));
  for (const b of bonds) {
    bondsAt.get(b.a)?.push(b);
    bondsAt.get(b.b)?.push(b);
  }
  const ringsOf = new Map();
  for (const ring of rings) for (const id of ring) ringsOf.set(id, [...(ringsOf.get(id) ?? []), ring]);
  const polycyclic = (id) => (ringsOf.get(id) ?? []).length > 1;
  const lengths = bonds.map((b) => Math.hypot(at(b.a).x - at(b.b).x, at(b.a).y - at(b.b).y));
  const median = [...lengths].sort((p, q) => p - q)[Math.floor(lengths.length / 2)] || 1;
  const uneven = bonds.reduce((sum, b, k) => {
    const r = lengths[k] / median;
    const [short, long] = polycyclic(b.a) && polycyclic(b.b) ? [0.45, 2] : [0.8, 1.2];
    return sum + Math.max(0, r - long) + Math.max(0, short - r);
  }, 0);
  let off = 0;
  let counted = 0;
  let flat = 0;
  for (const id of ids) {
    const mine = bondsAt.get(id);
    const inRings = ringsOf.get(id) ?? [];
    // a ring atom with its two bonds in a straight line: lost in it, drawn as a dot (as scene.js does)
    if (inRings.length && mine.length === 2) {
      const direction = (b) => Math.atan2(at(b.a === id ? b.b : b.a).y - at(id).y, at(b.a === id ? b.b : b.a).x - at(id).x);
      const between = Math.abs(((direction(mine[0]) - direction(mine[1]) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      if (Math.PI - between < (15 * Math.PI) / 180) flat += 1;
    }
    if (mine.length < 2 || inRings.length > 1 || (inRings.length === 1 && inRings[0].some((x) => (ringsOf.get(x) ?? []).length > 1))) continue;
    const ring = inRings[0];
    const ideal = ring ? 180 - 360 / ring.length : mine.some((b) => b.order === 3) ? 180 : mine.length === 4 ? 90 : 120;
    const angle = (b) => Math.atan2(at(b.a === id ? b.b : b.a).y - at(id).y, at(b.a === id ? b.b : b.a).x - at(id).x);
    // between neighbouring bonds round the atom (in a ring: the two ring bonds)
    const round = (ring ? mine.filter((b) => ring.includes(b.a === id ? b.b : b.a)) : mine).map(angle).sort((p, q) => p - q);
    const gaps = round.map((a, k) => ((k + 1 < round.length ? round[k + 1] : round[0] + 2 * Math.PI) - a) * (180 / Math.PI));
    const used = ring ? [Math.min(gaps[0], 360 - gaps[0])] : gaps;
    for (const gap of used) {
      off += Math.abs(gap - ideal);
      counted += 1;
    }
  }
  const angles = counted ? off / counted / 15 : 0;
  return { score: 3 * (crossings + overlaps) + 6 * uneven + 2 * flat + angles, parts: { crossings, overlaps, uneven, flat, angles } };
}

// Runs every engine, the quick ones first and the slow ones (`slow`: Indigo's clean-up, seconds; the 3D views)
// after them; calls onUpdate(view) as results come in. view: { candidates: [{ id, label, rule, detail,
// drawings, problems, ms }], skipped: [{ label, reason }], pending: [labels], quickDone (the quick engines have
// all finished: the Redraw window ranks the drawings then, once) }. Stops when `cancelled()` says so.
export async function runEngines(ed, job, onUpdate, cancelled) {
  const order = [...ENGINES.filter((e) => !e.slow), ...ENGINES.filter((e) => e.slow)];
  const view = { candidates: [], skipped: [], pending: order.map((e) => e.label), quickDone: false };
  // (the drawing as the job was prepared from it: the window may be closed, and the drawing changed, while engines run)
  const base = structuredClone(ed.doc);
  const tolerance = SAME_DRAWING;
  const allPoints = (drawings) => drawings.flatMap((d) => d.points);
  const current = allPoints(job.molecules);
  const pairs = job.molecules.flatMap((m, i) => {
    const offset = job.molecules.slice(0, i).reduce((sum, x) => sum + x.atomIds.length, 0);
    return m.pairs.map(([a, b]) => [a + offset, b + offset]);
  });
  onUpdate(view);
  job.cancelled ??= cancelled; // (the 3D model stops trying once the window is closed)
  for (const engine of order) {
    if (cancelled()) return view;
    if (engine.slow && !view.quickDone) {
      view.quickDone = true;
      onUpdate({ ...view });
    }
    const started = performance.now();
    try {
      const results = [];
      for (const molecule of job.molecules) results.push(asResult(await engine.run(job, molecule.layoutMolfile, molecule)));
      if (!results.some(found)) {
        view.skipped.push({ label: engine.label, reason: [...new Set(results.map((r) => r.reason))].join('; ') });
      } else {
        for (const [i, r] of results.entries()) if (!found(r)) results[i] = asResult(await engine.fallback(job, job.molecules[i].layoutMolfile, job.molecules[i]));
        let drawings = results.map((r, i) => (r.inPlace ? r.drawing : r.drawing ? placed(job.molecules[i], r.drawing) : fromMolfile(job.molecules[i], r.molfile)));
        // a whole molecule's drawing lined up with the page: turned by up to 15° so that the most bonds lie on the
        // 30° grid (a part redrawn stays as it fits onto the rest; a view of a 3D model keeps the view chosen for it,
        // an octahedron's axis up)
        if (!engine.part && !engine.view) drawings = drawings.map((d, i) => ({ ...d, points: turnedPoints(d.points, gridTurn(d.points, job.molecules[i].pairs)) }));
        const candidate = { id: engine.label, label: engine.label, part: engine.part, rule: engine.rule, detail: [...new Set(results.map((r) => r.detail).filter(Boolean))].join(', '), drawings };
        // the check: the molecule, drawn this way, must still be the same molecule
        let copy = withCandidate(base, job, candidate);
        let same = await Promise.all(job.molecules.map((m) => sameMolecule(job, m, copy)));
        // the atoms where they may be but the wedges saying other stereo: new wedges for the same points, checked again
        if (same.includes(false) && !cancelled()) {
          const again = drawings.map((d, i) => (same[i] ? d : rewedged(job, job.molecules[i], d) ?? d));
          if (again.some((d, i) => d !== drawings[i])) {
            const retry = { ...candidate, drawings: again };
            const retryCopy = withCandidate(base, job, retry);
            const retrySame = await Promise.all(job.molecules.map((m) => sameMolecule(job, m, retryCopy)));
            if (!retrySame.includes(false)) [drawings, candidate.drawings, copy, same] = [again, again, retryCopy, retrySame];
          }
        }
        const changed = same.includes(false);
        if (!changed) {
          drawings = await Promise.all(drawings.map((d, i) => keepSidedHydrogens(job, job.molecules[i], base, d)));
          candidate.drawings = drawings;
        }
        const points = allPoints(drawings);
        if (changed) {
          view.skipped.push({ label: engine.label, reason: 'changed the molecule (stereo or connectivity), so it was dropped', dropped: true, drawings });
        } else if (rmsdAfterRotation(current, points) < tolerance) {
          view.skipped.push({ label: engine.label, reason: 'same as the current drawing' });
        } else {
          const twin = view.candidates.find((c) => rmsdAfterRotation(allPoints(c.drawings), points) < tolerance);
          if (twin) {
            twin.also = [...(twin.also ?? []), engine.label];
          } else {
            const { crossings, overlaps } = layoutProblems(points, pairs);
            candidate.problems = [crossings && t('{n} crossing bonds', { n: crossings }), overlaps && t('{n} overlapping atoms', { n: overlaps })].filter(Boolean).join(', ');
            Object.assign(candidate, drawingScore(copy, job, { crossings, overlaps }));
            candidate.ms = Math.round(performance.now() - started);
            candidate.smiles = job.molecules.map((m) => m.smiles).join('.');
            view.candidates.push(candidate);
          }
        }
      }
    } catch (error) {
      console.error(`[relayout] ${engine.label}:`, error);
      view.skipped.push({ label: engine.label, reason: `failed: ${error.message}` });
    }
    view.pending = view.pending.slice(1);
    if (!view.pending.length) view.quickDone = true;
    onUpdate({ ...view });
  }
  return view;
}

// Puts the candidate's drawing in, as one undo step.
export function applyCandidate(ed, job, candidate) {
  const copy = withCandidate(ed.doc, job, candidate);
  ed.change((doc) => {
    for (const molecule of job.molecules) {
      // (a bracket drawn as a box round it: round it again, as far out as before)
      const atomBox = () => {
        const [xs, ys] = [molecule.atomIds.map((id) => doc.atoms.get(id).x), molecule.atomIds.map((id) => doc.atoms.get(id).y)];
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
      };
      const boxes = bracketsOfMolecule(doc, new Set(molecule.atomIds)).map((id) => doc.brackets.get(id)).filter((br) => !br.atoms?.length);
      const before = atomBox();
      for (const id of molecule.atomIds) {
        const atom = doc.atoms.get(id);
        Object.assign(atom, { x: copy.atoms.get(id).x, y: copy.atoms.get(id).y });
        if (!copy.atoms.get(id).projection) delete atom.projection;
      }
      for (const id of molecule.bondIds) {
        const { a, b, stereo, z } = copy.bonds.get(id);
        Object.assign(doc.bonds.get(id), { a, b, stereo });
        if (z === undefined) delete doc.bonds.get(id).z;
        else doc.bonds.get(id).z = z;
      }
      // (orbitals turned with the view, and which way each atom's plane looks)
      const atoms = new Set(molecule.atomIds);
      for (const id of atoms) {
        const facing = copy.atoms.get(id).facing;
        if (facing) doc.atoms.get(id).facing = facing;
        else delete doc.atoms.get(id).facing;
      }
      for (const orbital of doc.orbitals?.values() ?? []) {
        const turned = atoms.has(orbital.atom) && copy.orbitals?.get(orbital.id);
        if (!turned) continue;
        for (const key of ['angle', 'ref', 'plane', 'reach', 'z', 'dz']) {
          if (turned[key] === undefined) delete orbital[key];
          else orbital[key] = turned[key];
        }
      }
      for (const br of boxes) keepMargins(br, before, atomBox());
    }
  });
}
