import { readMol, readSmiles } from './readMol.js';
import { parseMolfile, readMolfile, writeMolfile } from './molfile.js';
import initRDKitModule from '@rdkit/rdkit';
import rdkitWasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';
import { instantiate, progress } from './download.js';
import { gridTurn, layoutProblems, turnedPoints } from '../layout/geometry.js';

let rdkitPromise = null;

// Load RDKit.js (MinimalLib) once; later calls reuse the same instance.
// `?url` makes Vite ship the .wasm as a separate, cacheable file; its
// download (7 MB) shows in the progress bar. After a failed download the
// next call tries again.
export function getRDKit() {
  rdkitPromise ??= new Promise((resolve, reject) => {
    progress('RDKit', 0);
    initRDKitModule({
      instantiateWasm(imports, done) {
        instantiate(rdkitWasmUrl, __RDKIT_WASM_SIZE__, imports, (share) => progress('RDKit', share))
          .then(({ instance, module }) => done(instance, module), reject);
        return {};
      },
    }).then(resolve, reject);
  })
    .finally(() => progress('RDKit', null))
    .catch((error) => {
      rdkitPromise = null;
      throw error;
    });
  return rdkitPromise;
}

// The largest ring of a molecule (0 without rings).
function largestRing(mol) {
  const json = JSON.parse(mol.get_json());
  const rings = json.molecules[0].extensions?.find((e) => e.name === 'rdkitRepresentation')?.atomRings ?? [];
  return Math.max(0, ...rings.map((ring) => ring.length));
}

// A molfile's drawing lined up with the page: turned by up to 15° so that the most bonds lie on the 30° grid
// (gridTurn), as Redraw's drawings are.
function onGrid(molfile) {
  const { atoms, bonds } = parseMolfile(molfile);
  const points = atoms.map(({ x, y }) => [x, y]);
  const turn = gridTurn(points, bonds.map(({ a, b }) => [a, b]));
  if (Math.abs(turn) < 0.01) return molfile;
  // (measured and turned in the molfile's own frame, y up)
  const turned = turnedPoints(points, turn);
  const lines = molfile.split('\n');
  const counts = lines.findIndex((line, i) => i >= 3 && /V2000/.test(line));
  if (counts < 0) return molfile; // (V3000, as RDKit writes over 999 atoms: left as it is)
  const first = counts + 1;
  turned.forEach(([x, y], i) => {
    const line = lines[first + i];
    lines[first + i] = `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}${line.slice(20)}`;
  });
  return lines.join('\n');
}

// The double bonds whose E or Z a molecule says: keys 'i-j' of their atoms (0-based, i < j).
function doubleBondsSaid(mol) {
  return new Set(JSON.parse(mol.get_stereo_tags()).CIP_bonds.map(([i, j]) => `${Math.min(i, j)}-${Math.max(i, j)}`));
}

// `molfile` (a drawing of a molecule) with its double bonds marked "either" (stereo 3) where the drawing would say
// E or Z but the molecule didn't (keys of `said`, doubleBondsSaid). RDKit marks most such bonds itself, not one
// beside a double bond whose E or Z is given.
function withEither(RDKit, molfile, said) {
  const read = RDKit.get_mol(molfile);
  if (!read) return molfile;
  const extra = [...doubleBondsSaid(read)].filter((key) => !said.has(key));
  read.delete();
  if (!extra.length) return molfile;
  const lines = molfile.split('\n');
  const counts = lines.findIndex((line, i) => i >= 3 && /V2000/.test(line));
  if (counts < 0) return molfile; // (V3000: left as it is)
  const nAtoms = parseInt(lines[counts].slice(0, 3), 10);
  const nBonds = parseInt(lines[counts].slice(3, 6), 10);
  for (let k = counts + 1 + nAtoms; k < counts + 1 + nAtoms + nBonds; k++) {
    const [a, b] = [parseInt(lines[k].slice(0, 3), 10) - 1, parseInt(lines[k].slice(3, 6), 10) - 1];
    if (extra.includes(`${Math.min(a, b)}-${Math.max(a, b)}`)) lines[k] = `${lines[k].slice(0, 9)}  3${lines[k].slice(12)}`;
  }
  return lines.join('\n');
}

// Whether RDKit reads `molfile` as the molecule of canonical SMILES `smiles` (stereo included).
function meansSmiles(RDKit, molfile, smiles) {
  const mol = RDKit.get_mol(molfile);
  try {
    return Boolean(mol) && mol.get_smiles() === smiles;
  } finally {
    mol?.delete();
  }
}

// A molecule (RDKit's, its stereo set) drawn in 2D where it comes with no drawing of its own (a SMILES pasted or
// opened, a compound from PubChem, an XYZ file): RDKit's own layout (CoordGen's for a macrocycle, a ring of 9
// atoms or more, as chemists draw them), the long axis horizontal, turned onto the 30° grid. Only when that one is
// broken (another molecule as olomol reads it, as RDKit's own is for artemisinin's ketal carbon; or atoms on top
// of each other, or bonds crossing) the other quick layouts of Redraw that need nothing but RDKit too (the other
// engine, RDKit with a ring template): of those that keep the molecule the one with the fewest atoms on top of each
// other, then the one Redraw ranks first (drawingScore; the earlier on a tie). If none keeps it, the same without
// straightening; if still none, the first. Returns a molfile.
export async function layoutOf(RDKit, mol) {
  const meant = mol.get_smiles();
  const loose = doubleBondsSaid(mol);
  const macrocycle = largestRing(mol) >= 9;
  const finish = (molblock) => withEither(RDKit, onGrid(molblock), loose);
  const laidOut = (coordGen, straighten = true) => {
    mol.set_new_coords(coordGen);
    if (mol.get_num_atoms() > 2) {
      // tiny molecules: nothing to turn (and RDKit may throw: D2O, [2H]O[2H], did; then laid out as it is)
      try {
        mol.normalize_depiction(1);
        if (straighten) mol.straighten_depiction(true);
      } catch {
        // as laid out
      }
    }
    return finish(mol.get_molblock(JSON.stringify({ kekulize: true })));
  };
  // a layout that keeps the molecule as olomol reads it (a double bond marked "either" as a wavy bond beside it),
  // with its overlaps and crossings
  const judged = (molfile) => {
    if (!molfile) return null;
    const { doc, atomIds } = readMolfile(molfile);
    if (!meansSmiles(RDKit, writeMolfile(doc, atomIds).molfile, meant)) return null;
    const { overlaps, crossings } = layoutProblems(atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]), [...doc.bonds.values()].map((b) => [atomIds.indexOf(b.a), atomIds.indexOf(b.b)]));
    return { molfile, doc, atomIds, overlaps, crossings };
  };
  const firstMolfile = laidOut(macrocycle);
  // (over 999 atoms no molfile of olomol's holds it to check: RDKit's own, as it is)
  if (mol.get_num_atoms() > 999 || mol.get_num_bonds() > 999) return firstMolfile;
  const first = judged(firstMolfile);
  if (first && !first.overlaps && !first.crossings) return first.molfile;
  const { drawingScore } = await import('../layout/relayout.js');
  const { templateLayout } = await import('../layout/ringTemplates.js');
  const templated = async () => {
    try {
      const { molfile } = await templateLayout(RDKit, laidOut(false));
      return molfile && finish(withoutLabels(molfile));
    } catch {
      return null;
    }
  };
  let kept = [first, judged(laidOut(!macrocycle)), judged(await templated())].filter(Boolean);
  if (!kept.length) kept = [judged(laidOut(macrocycle, false)), judged(laidOut(!macrocycle, false))].filter(Boolean);
  if (!kept.length) return firstMolfile;
  for (const l of kept) l.score = drawingScore(l.doc, { molecules: [{ atomIds: l.atomIds }] }, l).score;
  // (atoms on top of each other worst of all: fewest of them first)
  return kept.reduce((best, l) => (l.overlaps < best.overlaps || (l.overlaps === best.overlaps && l.score < best.score - 1e-9) ? l : best)).molfile;
}

// A molfile without the isotope labels templateLayout puts on a template's atoms (500 and up, no real isotope).
function withoutLabels(molfile) {
  return molfile.split('\n').flatMap((line) => {
    if (!line.startsWith('M  ISO')) return [line];
    const values = line.slice(9).trim().split(/\s+/).map(Number);
    const pairs = [];
    for (let k = 0; k + 1 < values.length; k += 2) if (values[k + 1] < 500) pairs.push([values[k], values[k + 1]]);
    return pairs.length ? [`M  ISO${String(pairs.length).padStart(3)}${pairs.map(([a, m]) => `${String(a).padStart(4)}${String(m).padStart(4)}`).join('')}`] : [];
  }).join('\n');
}

// A SMILES as a molfile with 2D coordinates, aromatic rings written as
// alternating single and double bonds, drawn by layoutOf. With `core` (a
// molfile with coordinates), the part of the molecule that matches it is
// drawn just like it, so similar molecules (amino acids, nucleobases) come
// out the same way round.
// `keepHs`: the hydrogens written as atoms ([H:3]) kept as atoms (a mechanism's arrows name them).
export async function smilesToMolfile(smiles, options = {}) {
  const RDKit = await getRDKit();
  const { mol } = readSmiles(RDKit, smiles.trim(), { removeHs: !options.keepHs });
  let radicals;
  try {
    radicals = (JSON.parse(mol.get_json()).molecules[0].atoms ?? []).map((atom) => atom.nRad ?? 0);
  } catch {
    radicals = [];
  } finally {
    mol.delete();
  }
  return withRadicals(await laidOutSmiles(RDKit, smiles, options), radicals);
}

// A molfile with the unpaired electrons RDKit knows (`radicals`, by atom) written as M  RAD where it left them out
// (a lone atom: [Cl] came without its electron)
function withRadicals(molfile, radicals) {
  const lines = molfile.split('\n');
  const n = Number(lines[3]?.slice(0, 3));
  if (!(n > 0) || n !== radicals.length) return molfile;
  const written = new Set(lines.filter((l) => l.startsWith('M  RAD')).flatMap((l) => l.slice(9).trim().split(/\s+/).filter((_, k) => k % 2 === 0).map(Number)));
  const missing = radicals.map((r, i) => [i + 1, r]).filter(([i, r]) => r > 0 && !written.has(i));
  if (!missing.length) return molfile;
  const end = lines.findIndex((l) => l.startsWith('M  END'));
  const pad = (x, w) => String(x).padStart(w);
  const add = [];
  for (let k = 0; k < missing.length; k += 8) {
    const part = missing.slice(k, k + 8);
    add.push(`M  RAD${pad(part.length, 3)}${part.map(([i, r]) => `${pad(i, 4)}${pad(r === 1 ? 2 : 3, 4)}`).join('')}`);
  }
  lines.splice(end < 0 ? lines.length : end, 0, ...add);
  return lines.join('\n');
}

async function laidOutSmiles(RDKit, smiles, { core = null, keepHs = false } = {}) {
  const { mol, asWritten } = readSmiles(RDKit, smiles.trim(), { removeHs: !keepHs });
  if (asWritten) {
    // (a halogen with more than one bond, see readSmiles)
    try {
      mol.set_new_coords(false);
      if (mol.get_num_atoms() > 2) {
        mol.normalize_depiction(1);
        mol.straighten_depiction(true);
      }
      return mol.get_molblock(JSON.stringify({ kekulize: true }));
    } finally {
      mol.delete();
    }
  }
  try {
    if (core) {
      const template = RDKit.get_mol(core);
      try {
        const done = template && mol.generate_aligned_coords(template, JSON.stringify({ useCoordGen: false, acceptFailure: false }));
        if (done) return mol.get_molblock(JSON.stringify({ kekulize: true }));
      } finally {
        template?.delete();
      }
    }
    return await layoutOf(RDKit, mol);
  } finally {
    mol.delete();
  }
}

// A molfile of `smiles` laid out by RDKit, turned so that the direction from
// the molecule's middle to atom `atom` points at `angle` (degrees, y up).
// For alignment cores.
export async function orientedMolfile(smiles, atom, angle) {
  const RDKit = await getRDKit();
  const mol = readMol(RDKit, smiles);
  try {
    mol.set_new_coords(false);
    const lines = mol.get_molblock().split('\n');
    const n = parseInt(lines[3].slice(0, 3), 10);
    const xy = lines.slice(4, 4 + n).map((line) => [parseFloat(line.slice(0, 10)), parseFloat(line.slice(10, 20))]);
    const [cx, cy] = [xy.reduce((s, p) => s + p[0], 0) / n, xy.reduce((s, p) => s + p[1], 0) / n];
    const turn = (angle * Math.PI) / 180 - Math.atan2(xy[atom][1] - cy, xy[atom][0] - cx);
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    xy.forEach(([x, y], k) => {
      const [rx, ry] = [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
      lines[4 + k] = `${rx.toFixed(4).padStart(10)}${ry.toFixed(4).padStart(10)}${lines[4 + k].slice(20)}`;
    });
    return lines.join('\n');
  } finally {
    mol.delete();
  }
}

// A molfile with aromatic bonds (order 4) written as single and double
// bonds, or null if RDKit can't do that.
export async function kekulize(molfile) {
  const RDKit = await getRDKit();
  try {
    const mol = readMol(RDKit, molfile);
    try {
      return mol.get_molblock(JSON.stringify({ kekulize: true }));
    } finally {
      mol.delete();
    }
  } catch {
    return null;
  }
}

// Which bonds of a molfile RDKit finds aromatic, and their single and
// double orders: [{ aromatic, order }] in the molfile's bond order. Throws
// if RDKit can't read the structure.
export async function aromaticity(molfile) {
  const RDKit = await getRDKit();
  const mol = readMol(RDKit, molfile);
  try {
    const orders = (block) => parseMolfile(block).bonds.map((bond) => bond.order);
    const aromatic = orders(mol.get_molblock(JSON.stringify({ kekulize: false })));
    const kekule = orders(mol.get_molblock(JSON.stringify({ kekulize: true })));
    return aromatic.map((order, k) => ({ aromatic: order === 4, order: kekule[k] }));
  } finally {
    mol.delete();
  }
}

// SMILES, InChI, InChIKey and how many stereocentres have no R/S drawn (open) of a molfile, worked out here
// (nothing is sent anywhere). InChI is '' where it has no answer (R groups).
export async function identifiers(molfile) {
  const RDKit = await getRDKit();
  // drawn hydrogens (except those that carry stereo) don't change them
  const mol = readMol(RDKit, molfile, { removeHs: true });
  try {
    const inchi = mol.get_inchi?.() ?? '';
    const open = JSON.parse(mol.get_descriptors()).NumUnspecifiedAtomStereoCenters ?? 0;
    return { smiles: mol.get_smiles(), inchi, inchikey: inchi ? RDKit.get_inchikey_for_inchi(inchi) : '', open };
  } finally {
    mol.delete();
  }
}
