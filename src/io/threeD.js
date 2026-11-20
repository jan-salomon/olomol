// 3D in the browser: XYZ files written with RDKit's ETKDG (megane-rdkit, BSD)
// and OpenChemLib (BSD; loaded the first time, with its 1.3 MB of torsion and
// force field data) and read through RDKit. The work itself is in xyz.js.
import { countedBody, progress } from './download.js';
import { getRDKit, layoutOf } from './rdkit.js';
import { readMol } from './readMol.js';
import { conformersXyz, sameStereo, xyzMolfile } from './xyz.js';
import { conformerAtoms, moleculeIn3D } from '../layout/conformer.js';
import { asDrawn, buildComplex, hasMetal } from '../layout/threeD.js';
import { t } from '../i18n/i18n.js';

// its data counted for the progress bar (the code, 1 MB, comes alongside)
async function resources() {
  const { default: url } = await import('../../node_modules/openchemlib/dist/resources.json?url');
  const body = await countedBody(url, __OCL_RESOURCES_SIZE__, (share) => progress('OpenChemLib', share));
  return URL.createObjectURL(await new Response(body).blob());
}

let loading = null;
export function openChemLib() {
  if (loading) return loading;
  progress('OpenChemLib', 0);
  loading = Promise.all([import('openchemlib'), resources()])
    .then(async ([{ default: OCL }, url]) => {
      await OCL.Resources.registerFromUrl(url);
      URL.revokeObjectURL(url);
      return OCL;
    })
    .finally(() => progress('OpenChemLib', null))
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

// RDKit's 3D embedding on the page (only where no worker can start), or null if it can't start; asked again next time.
let embedding = null;
function rdkit3D() {
  embedding ??= Promise.all([import('megane-rdkit'), import('megane-rdkit/dist/megane-rdkit.wasm?url')])
    .then(([{ loadRDKit }, { default: wasm }]) => loadRDKit({ locateFile: () => wasm }))
    .catch(() => {
      embedding = null;
      return null;
    });
  return embedding;
}

// 3D tries (layout/conformerWorker.js) in workers, so the page doesn't freeze, several tries at once: at most
// four, and two cores left free (the page, Indigo). They start when there is work and stop after a minute
// without any; if none can start, the tries are made here.
const WORKERS = Math.min(4, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 2));
const IDLE = 60000;
const workers = []; // { worker, job (the try it is making, or null), idle (its timer), answered }
const queue = []; // tries waiting for a worker: { message, onPage, group, resolve, reject }
let noWorkers = false; // (none could start: the tries are made here, a late model better than none)

function startWorker() {
  let worker;
  try {
    worker = new Worker(new URL('../layout/conformerWorker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  const slot = { worker, job: null, idle: null, answered: false };
  worker.onmessage = ({ data }) => {
    const { job } = slot;
    slot.job = null;
    slot.answered = true;
    if (data.error) job?.reject(new Error(data.error));
    else if ('made' in data) job?.resolve(data.made);
    else if ('complex' in data) job?.resolve(data.complex);
    else job?.resolve(data.points && Object.assign(data.points, { energy: data.energy, hydrogens: data.hydrogens ?? [] }));
    next(slot);
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    stop(slot);
    // one that never answered: workers don't start here; one that broke on a try: that try once more
    if (!slot.answered) noWorkers = true;
    if (slot.job) {
      slot.job.broke = (slot.job.broke ?? 0) + 1;
      if (slot.job.broke > 1) slot.job.reject(new Error('the 3D builder stopped'));
      else queue.unshift(slot.job);
    }
    run();
  };
  workers.push(slot);
  return slot;
}

function stop(slot) {
  clearTimeout(slot.idle);
  slot.worker.terminate();
  const k = workers.indexOf(slot);
  if (k >= 0) workers.splice(k, 1);
}

// the next try for this worker, or it waits (and stops after a while)
function next(slot) {
  clearTimeout(slot.idle);
  const job = queue.shift();
  if (!job) {
    slot.idle = setTimeout(() => stop(slot), IDLE);
    return;
  }
  slot.job = job;
  slot.worker.postMessage(job.message);
}

function run() {
  if (noWorkers) {
    for (const slot of [...workers]) {
      if (slot.job) queue.unshift(slot.job);
      stop(slot);
    }
    for (const job of queue.splice(0)) job.onPage().then(job.resolve, job.reject);
    return;
  }
  for (const slot of workers) if (!slot.job && queue.length) next(slot);
  while (queue.length && workers.length < WORKERS) {
    const slot = startWorker();
    if (!slot) {
      if (!workers.length) noWorkers = true;
      if (noWorkers) run();
      return;
    }
    next(slot);
  }
}

// What a try gave, kept for the next time the same is asked (a molecule opened again, exported again): the same
// try gives the same answer.
const KEPT = 200;
const kept = new Map();

const inWorker = (message, onPage, group) => {
  const key = JSON.stringify(message);
  if (kept.has(key)) return Promise.resolve(kept.get(key));
  return new Promise((resolve, reject) => {
    queue.push({ message, onPage, group, resolve, reject });
    run();
  }).then((answer) => {
    kept.set(key, answer);
    if (kept.size > KEPT) kept.delete(kept.keys().next().value);
    return answer;
  });
};

// A try in a worker: its points (points.energy), or null. `group`: what it is for, so that
// stopConformers(group) can drop it once nobody wants it.
export const conformerIn3D = (molfile, seed, group = null) => inWorker({ molfile, seed },
  () => openChemLib().then((OCL) => moleculeIn3D(OCL, molfile, seed)), group);

// A metal complex, a transition state or a main-group centre beyond the octet optimised by UFF in a worker (it
// takes a few seconds for a large one: a porphyrin with phenyls): buildComplex's result. Only what it reads is sent.
export const complexIn3D = ({ elements, points, links, molfile, lonePairs, hydrogens }, group = null) => {
  const molecule = { elements, points, links, molfile, lonePairs, hydrogens };
  return inWorker({ complex: molecule }, () => openChemLib().then((OCL) => buildComplex(molecule, { OCL })), group);
};

// A try for a file in a worker (see conformerAtoms): the atoms with their hydrogens, or null.
const atomsIn3D = (input, seed, group = null) => inWorker({ input, seed },
  () => Promise.all([openChemLib(), rdkit3D()]).then(([OCL, RDKit3D]) => conformerAtoms(RDKit3D, OCL, input, seed)), group);

// The tries of `group` nobody wants any more (enough found, the window closed): those waiting dropped,
// the workers making one stopped (a fresh one starts for the next try)
export function stopConformers(group) {
  const gone = new Error('not wanted');
  for (let k = queue.length - 1; k >= 0; k--) {
    if (queue[k].group !== group) continue;
    queue[k].reject(gone);
    queue.splice(k, 1);
  }
  for (const slot of [...workers]) {
    if (slot.job?.group !== group) continue;
    slot.job.reject(gone);
    stop(slot);
  }
  run();
}

// Tries started together (as many as there are workers), to be taken in order.
export const conformerBatch = () => WORKERS;

// A metal complex for a file, built as Turn in 3D builds it (buildComplex's quick checks, then UFF in a
// worker): { atoms: [{ el, x, y, z }] in Å with every hydrogen, as drawn, not its mirror image (Λ stays Λ) },
// or null where `molecule` (describeMolecule's) is no metal complex: a conformer then, as for any molecule.
// Throws, in the page's language, what Turn in 3D says where it can't build one (ferrocene's η-ligands).
async function complexAtoms(molecule, group) {
  const OCL = await openChemLib();
  // (refused: an answer for the user, not a fault: not logged as one)
  const refuse = (reason) => Object.assign(new Error(t('No 3D model of this molecule: {reason}.', { reason })), { refused: true });
  const quick = buildComplex(molecule, { OCL, defer: true });
  if (quick?.reason) throw refuse(quick.reason);
  if (!quick?.deferred) return null;
  const built = await complexIn3D(molecule, group);
  if (built?.reason) throw refuse(built.reason);
  if (!built?.angstrom) throw refuse(t('the universal force field (UFF) could not be set up for it'));
  const mirrored = asDrawn(molecule, built.metal, built.points) !== built.points;
  return { atoms: built.angstrom.map((a) => ({ ...a, z: mirrored ? -a.z : a.z })), uff: true };
}

// An XYZ text for these molecules ([{ molfile (V2000), molecule (describeMolecule's) }]): a metal complex
// optimised by UFF as in Turn in 3D (complexAtoms); any other molecule a conformer, RDKit's 3D embedding and
// OpenChemLib getting RDKit's isomeric SMILES of it (OpenChemLib misreads wedges at some crowded centres),
// each conformer checked against the drawing. The work is done in the workers, so the page goes on working:
// `watch` as in conformersXyz, for the progress and to stop it. `comment({ uff, conformers })`: the comment
// line, by how many molecules were built which way.
export async function writeXyz(entries, comment, watch = {}) {
  const RDKit = await getRDKit();
  const molfiles = entries.map((e) => e.molfile);
  const inputs = entries.map(({ molfile, molecule }) => {
    let input = molfile; // (RDKit can't read it: OpenChemLib takes the molfile)
    try {
      const mol = readMol(RDKit, molfile, { removeHs: true });
      try {
        input = mol.get_smiles();
      } finally {
        mol.delete();
      }
    } catch {
      // as it is
    }
    // (only a molecule with a metal goes to the complex builder: OpenChemLib isn't loaded on the page for the rest)
    return molecule && hasMetal(molecule) ? { input, build: (group) => complexAtoms(molecule, group) } : input;
  });
  return conformersXyz(null, inputs, comment, (k, xyz) => sameStereo(RDKit, molfiles[k], xyz), null, { attempt: atomsIn3D, batch: WORKERS, stop: stopConformers, ...watch });
}

// An XYZ text as a 2D molfile: the bonds from the distances, R/S and E/Z
// from the geometry, then RDKit's 2D drawing, hydrogens implicit.
export async function xyzTo2D(text) {
  const RDKit = await getRDKit();
  const mol = readMol(RDKit, xyzMolfile(text), { removeHs: true });
  try {
    return await layoutOf(RDKit, mol);
  } finally {
    mol.delete();
  }
}
