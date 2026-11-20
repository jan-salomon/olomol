// XYZ files: atoms and their 3D coordinates in Å, no bonds (what quantum
// chemistry programs read and write). Reading works the bonds out from the
// distances and their orders from the valences, with charges where nothing
// else fits (nitro, carboxylate); RDKit then takes R/S and E/Z from the 3D
// geometry and draws it in 2D (threeD.js). Writing makes 3D coordinates:
// RDKit's ETKDG and MMFF94s, or where it has no MMFF94 types OpenChemLib's
// conformer generator, then MMFF94s+ (where it has atom types: not for boron
// or an acylium C≡O⁺, which stay as generated), each conformer checked for
// the drawn R/S and E/Z (the generator doesn't always keep them in tight ring
// systems). RDKit and OpenChemLib are handed in, so the tests can run this in
// Node.
import { SYMBOLS } from '../chem/elements.js';
import { conformerAtoms, FOLDED, LARGE } from '../layout/conformer.js';
import { t } from '../i18n/i18n.js';

// Covalent radii in Å (Cordero et al., Dalton Trans. 2008); others 1.5.
const RADII = {
  H: 0.31, Li: 1.28, Be: 0.96, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05,
  Cl: 1.02, K: 2.03, Ca: 1.76, Fe: 1.32, Cu: 1.32, Zn: 1.22, Ge: 1.20, As: 1.19, Se: 1.20, Br: 1.20, Sn: 1.39, Sb: 1.39, Te: 1.38, I: 1.39,
};
const BOND_FACTOR = 1.2; // bonded when nearer than 1.2 × the sum of the radii
const METAL_CHARGES = { Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, Mg: 2, Ca: 2, Sr: 2, Ba: 2, Zn: 2, Al: 3 };
// drawn as ions, never bonded (BuLi and Grignards keep their C–Li, C–Mg)
const IONIC = new Set(['Na', 'K', 'Rb', 'Cs', 'Ca', 'Sr', 'Ba']);
const VALENCES = { H: [1], B: [3], C: [4], N: [3], O: [2], F: [1], Si: [4], P: [3, 5], S: [2, 4, 6], Cl: [1], Br: [1], I: [1], Se: [2, 4, 6] };

// [{ el, x, y, z }] of the first structure in an XYZ text (the count line,
// a comment line, then "El x y z"; an atomic number for El also works).
export function parseXyz(text) {
  const lines = text.split(/\r?\n/);
  const count = Number.parseInt(lines[0], 10);
  if (!(count > 0)) throw new Error(t('not an XYZ file'));
  const atoms = lines.slice(2, 2 + count).map((line) => {
    const [name, x, y, z] = line.trim().split(/\s+/);
    const symbol = /^\d+$/.test(name) ? SYMBOLS[Number(name) - 1] : name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    if (!symbol || [x, y, z].some((v) => !Number.isFinite(Number(v)))) throw new Error(t('not an XYZ line: {line}', { line }));
    return { el: symbol, x: Number(x), y: Number(y), z: Number(z) };
  });
  if (atoms.length < count) throw new Error(t('the XYZ file ends early'));
  return atoms;
}

// The rings of six atoms other than hydrogen (atom indexes in order round
// the ring), for telling a benzene ring when bond orders are chosen.
function ringsOfSix(n, neighbours, other, atoms) {
  const rings = new Map();
  const heavy = (i) => atoms[i].el !== 'H';
  const walk = (path) => {
    const last = path.at(-1);
    for (const bond of neighbours[last]) {
      const next = other(bond, last);
      if (!heavy(next) || next < path[0]) continue;
      if (path.length === 6) {
        if (next === path[0]) rings.set([...path].sort((a, b) => a - b).join(), path);
        continue;
      }
      if (!path.includes(next)) walk([...path, next]);
    }
  };
  for (let i = 0; i < n; i++) if (heavy(i)) walk([i]);
  return [...rings.values()];
}

// Bonds between the atoms (indexes), from distances, with orders that give
// each atom its usual valence: { bonds: [{ a, b, order }], charges, radicals }
// (arrays by atom: charges where nothing else fits, unpaired electrons).
export function perceiveBonds(atoms) {
  const n = atoms.length;
  const near = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [p, q] = [atoms[i], atoms[j]];
      if (IONIC.has(p.el) || IONIC.has(q.el)) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      if (d < BOND_FACTOR * ((RADII[p.el] ?? 1.5) + (RADII[q.el] ?? 1.5))) {
        near[i].push({ j, d });
        near[j].push({ j: i, d });
      }
    }
  }
  // a hydrogen has one bond: the nearest
  const bonded = near.map((list, i) => (atoms[i].el === 'H' ? list.sort((a, b) => a.d - b.d).slice(0, 1) : list));
  const pairs = new Map();
  for (let i = 0; i < n; i++) {
    for (const { j } of bonded[i]) {
      const [a, b] = i < j ? [i, j] : [j, i];
      if (atoms[a].el === 'H' && bonded[a][0]?.j !== b) continue;
      if (atoms[b].el === 'H' && bonded[b][0]?.j !== a) continue;
      pairs.set(`${a}-${b}`, { a, b, order: 1 });
    }
  }
  const bonds = [...pairs.values()];
  const neighbours = Array.from({ length: n }, () => []);
  for (const bond of bonds) {
    neighbours[bond.a].push(bond);
    neighbours[bond.b].push(bond);
  }
  const other = (bond, i) => (bond.a === i ? bond.b : bond.a);
  const degree = (i) => neighbours[i].length;
  const terminal = (i) => ['O', 'S'].includes(atoms[i].el) && degree(i) === 1;

  // how many more bond orders each atom wants, and the charges this needs
  const charges = new Array(n).fill(0);
  const want = atoms.map((atom, i) => {
    const d = degree(i);
    const ends = neighbours[i].filter((bond) => terminal(other(bond, i))).length;
    // ammonium N+ (four bonds); nitro and N-oxides: N+ with an N=O
    if (atom.el === 'N' && (d === 4 || (d === 3 && ends > 0))) {
      charges[i] = 1;
      return 4 - d;
    }
    // sulfonium, oxonium, phosphonium: three (P: four) bonds and nothing to double, one charge up
    if ((d === 3 && ends === 0 && ['O', 'S', 'Se'].includes(atom.el)) || (d === 4 && ends === 0 && atom.el === 'P')) {
      charges[i] = 1;
      return 0;
    }
    const valences = VALENCES[atom.el];
    if (!valences) return 0;
    // S and P take their oxygens as double bonds (sulfones, phosphates)
    const need = ['S', 'P', 'Se'].includes(atom.el) ? d + ends : d;
    return Math.max(0, (valences.find((v) => v >= need) ?? valences.at(-1)) - d);
  });

  // among answers that leave as much over (a radical, a charge): the one
  // with the most benzene rings (six-membered, three alternating double
  // bonds) and the fewest C=C=C in a ring, so a phenyl radical keeps its
  // ring and its radical on the carbon without H, a benzyl radical on CH2
  const sixRings = ringsOfSix(n, neighbours, other, atoms);
  const doubles = (i) => neighbours[i].filter((bond) => bond.order === 2).length;
  const inRing = new Set(sixRings.flat());
  const score = () => {
    const benzene = sixRings.filter((ring) => ring.every((i, k) => {
      const bond = neighbours[i].find((b) => other(b, i) === ring[(k + 1) % 6]);
      const next = neighbours[ring[(k + 1) % 6]].find((b) => other(b, ring[(k + 1) % 6]) === ring[(k + 2) % 6]);
      return bond.order + next.order === 3;
    })).length;
    const cumulated = [...inRing].filter((i) => doubles(i) > 1).length;
    return cumulated - 10 * benzene;
  };

  // raise bond orders until every atom has its valence, or as near as can
  // be: depth first, the atom with the fewest choices next; giving up on an
  // atom is the last choice, and counts against the result
  let best = { left: Infinity, score: Infinity, orders: bonds.map(() => 1) };
  let steps = 0;
  const open = (i) => neighbours[i].filter((bond) => bond.order < 3 && want[other(bond, i)] > 0);
  const search = (left) => {
    // (as much over as the best so far: searched on, for a better score)
    if (left > best.left || (left === best.left && left === 0) || steps++ > 200_000) return;
    let pick = -1;
    let choices = Infinity;
    for (let i = 0; i < n; i++) {
      if (want[i] <= 0) continue;
      const c = open(i).length;
      if (c < choices) [pick, choices] = [i, c];
    }
    if (pick < 0) {
      const s = left ? score() : 0;
      if (left < best.left || s < best.score) best = { left, score: s, orders: bonds.map((bond) => bond.order) };
      return;
    }
    for (const bond of open(pick).sort((p, q) => open(other(p, pick)).length - open(other(q, pick)).length)) {
      const j = other(bond, pick);
      bond.order += 1;
      want[pick] -= 1;
      want[j] -= 1;
      search(left);
      bond.order -= 1;
      want[pick] += 1;
      want[j] += 1;
      if (best.left === 0) return;
    }
    const kept = want[pick];
    want[pick] = 0;
    search(left + kept);
    want[pick] = kept;
  };
  search(0);
  bonds.forEach((bond, k) => {
    bond.order = best.orders[k];
  });
  // what is still missing: an anion on N, O, S (carboxylate, the nitro O), unpaired electrons on C;
  // a lone metal of a salt is its cation (Na+, Mg2+)
  const radicals = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!degree(i) && METAL_CHARGES[atoms[i].el]) {
      charges[i] = METAL_CHARGES[atoms[i].el];
      continue;
    }
    const missing = (charges[i] === 1 ? ({ O: 3, S: 3, Se: 3 }[atoms[i].el] ?? 4) : VALENCES[atoms[i].el]?.find((v) => v >= degree(i)) ?? degree(i))
      - neighbours[i].reduce((sum, bond) => sum + bond.order, 0);
    if (missing <= 0) continue;
    if (['N', 'O', 'S', 'Se', 'F', 'Cl', 'Br', 'I'].includes(atoms[i].el)) charges[i] -= missing;
    else radicals[i] = missing;
  }
  return { bonds, charges, radicals };
}

const f = (v, width, digits) => v.toFixed(digits).padStart(width);
const CHARGE_CODES = { 3: 1, 2: 2, 1: 3, '-1': 5, '-2': 6, '-3': 7 };

// An XYZ text as a 3D V2000 molfile (the "3D" in its second line makes
// RDKit take R/S and E/Z from the coordinates).
export function xyzMolfile(text) {
  const atoms = parseXyz(text);
  if (atoms.length > 999) throw new Error(t('more than 999 atoms or bonds: too large for a V2000 molfile'));
  const { bonds, charges, radicals } = perceiveBonds(atoms);
  const lines = ['', `  olomol${' '.repeat(12)}3D`, '', `${f(atoms.length, 3, 0)}${f(bonds.length, 3, 0)}  0  0  1  0  0  0  0  0999 V2000`];
  atoms.forEach((a, i) => lines.push(`${f(a.x, 10, 4)}${f(a.y, 10, 4)}${f(a.z, 10, 4)} ${a.el.padEnd(3)} 0${f(CHARGE_CODES[String(Math.max(-3, Math.min(3, charges[i])))] ?? 0, 3, 0)}  0  0  0  0  0  0  0  0  0  0`));
  for (const { a, b, order } of bonds) lines.push(`${f(a + 1, 3, 0)}${f(b + 1, 3, 0)}${f(order, 3, 0)}  0`);
  const charged = charges.flatMap((c, i) => (c ? [[i + 1, c]] : []));
  for (let k = 0; k < charged.length; k += 8) lines.push(`M  CHG${f(charged.slice(k, k + 8).length, 3, 0)}${charged.slice(k, k + 8).map(([i, c]) => `${f(i, 4, 0)}${f(c, 4, 0)}`).join('')}`);
  const unpaired = radicals.flatMap((r, i) => (r ? [[i + 1, r === 1 ? 2 : 1]] : []));
  for (let k = 0; k < unpaired.length; k += 8) lines.push(`M  RAD${f(unpaired.slice(k, k + 8).length, 3, 0)}${unpaired.slice(k, k + 8).map(([i, r]) => `${f(i, 4, 0)}${f(r, 4, 0)}`).join('')}`);
  lines.push('M  END');
  return lines.join('\n');
}

// An XYZ text of atoms [{ el, x, y, z }].
function xyzText(atoms, comment) {
  const lines = [String(atoms.length), comment.replace(/\n/g, ' ')];
  for (const a of atoms) lines.push(`${a.el.padEnd(2)} ${f(a.x, 12, 6)} ${f(a.y, 12, 6)} ${f(a.z, 12, 6)}`);
  return `${lines.join('\n')}\n`;
}

// Seeds for the conformer generator, tried in turn until a conformer has
// the drawn R/S and E/Z: always the same ones (RDKit's conformer for a seed
// is the same everywhere; OpenChemLib's can differ between browsers, and the
// file with it).
const SEEDS = [42, ...Array.from({ length: 39 }, (_, k) => k + 1)];

const WANTED = 4;
const ENOUGH = 12; // with one that fits, no more tries than this for the others (a drawing few conformers fit)

// Heavy atoms of a molecule (a V2000 molfile or a SMILES).
const heavyAtoms = (input) => (input.includes('V2000') ? Number.parseInt(input.split('\n')[3].slice(0, 3), 10) : (input.replace(/\[[^\]]*H\d?[^\]]*\]/g, 'C').match(/Cl|Br|[BCNOPSFIbcnops]/g) ?? []).length);

// The conformer of a molecule for a file: of RDKit's tries the lowest energy of the first few that fit (see
// embedded); where it has none, OpenChemLib's first that fits. `batch` tries at once, taken in seed order, so
// the structure doesn't depend on how many there are or which finishes first; a large molecule: the first two
// that finish (see LARGE). { best, made: any at all }.
async function bestConformer(input, fits, attempt, batch, group, onTry) {
  const large = heavyAtoms(input) > LARGE;
  const wanted = large ? 2 : WANTED;
  const ahead = [];
  let next = 0;
  let best = null;
  let right = 0;
  let made = false;
  // no more going than can still count: a try left over when enough are found would stop a worker, and the next
  // export wait for a new one (most of the time a small molecule takes)
  const start = () => {
    if (next >= SEEDS.length || (large ? ahead.length >= batch : right + ahead.length >= wanted) || (best && next >= ENOUGH)) return;
    const tried = attempt(input, SEEDS[next++], group);
    tried.catch(() => {}); // (one nobody waits for any more)
    const entry = tried.then((value) => ({ value, entry }));
    entry.catch(() => {});
    ahead.push(entry);
  };
  for (let i = 0; i < batch; i++) start();
  while (ahead.length) {
    const { value: tried, entry } = await (large ? Promise.race(ahead) : ahead[0]);
    ahead.splice(ahead.indexOf(entry), 1);
    onTry();
    if (tried) {
      made = true;
      if (fits(xyzText(tried.atoms, ''))) {
        if (!tried.byRDKit) return { best: best ?? tried, made };
        if (!best || (tried.energy ?? Infinity) < (best.energy ?? Infinity)) best = tried;
        if ((tried.energy ?? 0) <= FOLDED && ++right === wanted) break;
      }
    }
    start();
  }
  return { best, made };
}

// 3D coordinates for molecules: an XYZ text, the molecules side by side along x, 4 Å apart, all hydrogens
// included. Each molecule an isomeric SMILES (as RDKit writes it: OpenChemLib reads R/S and E/Z from it surely,
// while it can misread wedges at a crowded centre, a spiro carbon) or a V2000 molfile; `fits(k, xyz)`: whether
// a conformer of molecule k (an XYZ text) is right (see sameStereo), else the next seed is tried. The tries made
// here with RDKit (`RDKit3D`: megane-rdkit; null: none) and OpenChemLib `OCL` (its resources registered), or
// by `attempt(input, seed, group)` (workers), `batch` at once, `stop(group)` dropping those not wanted any more.
// `onProgress(k, n, tries, how)`: on molecule k of n, this many tries made (`how` 'uff': a complex built by
// UFF, no tries). A molecule may also be { input, build(group) }: build's { atoms } if it gives them (a metal
// complex, see writeXyz), else the conformers of `input`. `comment`: the comment line, or a function of
// { uff, conformers } (how many molecules were built which way) that gives it.
// `job`: given a `cancel` that stops it (then it rejects).
export async function conformersXyz(OCL, molecules, comment, fits = () => true, RDKit3D = null, {
  attempt = async (input, seed) => conformerAtoms(RDKit3D, OCL, input, seed), batch = 1, stop = () => {}, onProgress = () => {}, job = {},
} = {}) {
  const placed = [];
  let x = 0;
  let unminimised = false;
  let group = null;
  let cancelled = false;
  job.cancel = () => {
    cancelled = true;
    if (group) stop(group);
  };
  const built = { uff: 0, conformers: 0 };
  for (const [k, entry] of molecules.entries()) {
    const input = entry?.build ? entry.input : entry;
    onProgress(k, molecules.length, 0);
    group = {};
    let atoms = null;
    if (entry?.build) {
      onProgress(k, molecules.length, 0, 'uff');
      try {
        atoms = (await entry.build(group))?.atoms ?? null;
      } finally {
        stop(group);
      }
      if (cancelled) throw new Error('cancelled');
      // (checked as a conformer is: a ligand's R/S as drawn; Λ or Δ the builder keeps, a file has no word for)
      if (atoms && !fits(k, xyzText(atoms, ''))) throw Object.assign(new Error(t('No 3D structure with the drawn R/S and E/Z was found for this molecule, so none is written.')), { refused: true });
      if (atoms) built.uff += 1;
      onProgress(k, molecules.length, 0);
    }
    if (!atoms) {
      let tries = 0;
      let found;
      try {
        found = await bestConformer(input, (xyz) => fits(k, xyz), attempt, batch, group, () => onProgress(k, molecules.length, ++tries));
      } finally {
        stop(group);
      }
      if (cancelled) throw new Error('cancelled');
      const { best, made } = found;
      atoms = best?.atoms;
      unminimised ||= Boolean(best?.unminimised);
      if (!made) throw Object.assign(new Error(t('no 3D structure found for this molecule')), { refused: true });
      if (!atoms) throw Object.assign(new Error(t('No 3D structure with the drawn R/S and E/Z was found for this molecule, so none is written.')), { refused: true });
      built.conformers += 1;
    }
    const xs = atoms.map((a) => a.x);
    const [cy, cz] = ['y', 'z'].map((axis) => atoms.reduce((s, a) => s + a[axis], 0) / atoms.length);
    const shift = x - Math.min(...xs);
    for (const a of atoms) placed.push({ ...a, x: a.x + shift, y: a.y - cy, z: a.z - cz });
    x += Math.max(...xs) - Math.min(...xs) + 4;
  }
  const line = typeof comment === 'function' ? comment(built) : comment;
  return xyzText(placed, unminimised ? `${line} (where MMFF94 has no atom types: as generated)` : line);
}

// Is a 3D structure (an XYZ text) the drawn molecule (a molfile) with its
// R/S and E/Z? With RDKit: the drawing mapped onto the 3D structure, atom
// by atom (each way it fits: symmetric molecules), and the CIP labels
// compared where the drawing has them (an undefined centre may come out
// either way). Taken as right when there is nothing to compare: no R/S or
// E/Z drawn, or a 3D structure whose bonds can't be read back as drawn (an
// XYZ text has no charges: C≡O⁺ comes back as C=O); the mapping doesn't
// look at stereo, so a wrong centre is always caught.
export const sameStereo = (RDKit, molfile, xyz) => stereoFits(RDKit, molfile, () => xyzMolfile(xyz));

// The same for any 3D structure: `made()` gives its molfile (asked for only
// when the drawing has R/S or E/Z to compare).
export function stereoFits(RDKit, molfile, made3D) {
  const drawn = RDKit.get_mol(molfile, JSON.stringify({ removeHs: true }));
  if (!drawn) return true; // RDKit can't check it: as OpenChemLib made it
  let made = null;
  try {
    const labels = (mol) => JSON.parse(mol.get_stereo_tags());
    // (an undefined centre or double bond is labelled "(?)": any will do)
    const defined = (list = []) => list.filter((entry) => !entry.at(-1).includes('?'));
    const tags = labels(drawn);
    const want = { CIP_atoms: defined(tags.CIP_atoms), CIP_bonds: defined(tags.CIP_bonds) };
    if (!want.CIP_atoms.length && !want.CIP_bonds.length) return true;
    made = RDKit.get_mol(made3D(), JSON.stringify({ removeHs: true }));
    if (!made || made.get_num_atoms() !== drawn.get_num_atoms()) return true;
    const have = labels(made);
    const atomLabel = new Map((have.CIP_atoms ?? []).map(([i, label]) => [i, label]));
    const bondLabel = new Map((have.CIP_bonds ?? []).map(([i, j, label]) => [`${Math.min(i, j)}-${Math.max(i, j)}`, label]));
    // every mapping, also those onto the same atoms (a meso compound: R and S swap places)
    const raw = made.get_substruct_matches(drawn, JSON.stringify({ uniquify: false, maxMatches: 10000 }));
    const matches = raw && raw !== '{}' ? JSON.parse(raw) : [];
    if (!matches.length) return true;
    return matches.some(({ atoms }) => (want.CIP_atoms ?? []).every(([i, label]) => atomLabel.get(atoms[i]) === label)
      && (want.CIP_bonds ?? []).every(([i, j, label]) => bondLabel.get(`${Math.min(atoms[i], atoms[j])}-${Math.max(atoms[i], atoms[j])}`) === label));
  } catch {
    return true; // RDKit can't check it either
  } finally {
    drawn.delete();
    made?.delete();
  }
}
