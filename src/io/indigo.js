// Indigo, loaded the first time it is needed (a 7.5 MB download): file
// formats we don't read or write ourselves (CDXML, CDX, RXN, SDF, CML,
// SMILES of reactions) and its layout engine. All calls go to one worker.
import { progress } from './download.js';

let worker = null;
let nextId = 1;
const waiting = new Map();

// The worker can't start (no network, say): every job fails, the next call
// starts a new one.
function stop(error) {
  for (const job of waiting.values()) job.reject(error);
  waiting.clear();
  worker.terminate();
  worker = null;
  progress('Indigo', null);
}

function call(message) {
  if (!worker) {
    progress('Indigo', 0);
    worker = new Worker(new URL('./indigoWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if ('progress' in data) return progress('Indigo', data.progress);
      if (data.failed) return stop(new Error(data.failed));
      const job = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) job?.reject(new Error(data.error));
      else job?.resolve(data.result);
    };
    worker.onerror = (event) => stop(new Error(event.message || 'Indigo failed to load'));
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, ...message });
  });
}

// Indigo's names for the formats (it also knows some short ones, but not all).
const MIME = {
  ket: 'chemical/x-indigo-ket',
  mol: 'chemical/x-mdl-molfile', // a reaction becomes an RXN file
  rxn: 'chemical/x-mdl-rxnfile',
  smiles: 'chemical/x-daylight-smiles',
  cdxml: 'chemical/x-cdxml',
  cdx: 'chemical/x-cdx', // binary: base64 text
  sdf: 'chemical/x-sdf',
  cml: 'chemical/x-cml',
  inchi: 'chemical/x-inchi',
};

// Converts a structure (any format Indigo reads; it detects which) to
// `format`, one of the keys of MIME.
export function convert(struct, format, options = {}) {
  return call({ op: 'convert', struct, format: MIME[format], options });
}

// Indigo's layout of a molfile, as a V2000 molfile.
export function indigoLayout(molfile) {
  return call({ op: 'layout', struct: molfile, format: MIME.mol, options: { 'molfile-saving-mode': '2000', 'output-content-type': 'application/json' } });
}

// Indigo's clean-up (straightens bonds and angles, keeps the drawing); with
// `selected` (atom indices) only those atoms move, the rest stays exactly.
export function indigoClean(molfile, selected = []) {
  return call({ op: 'clean', struct: molfile, format: MIME.mol, options: { 'molfile-saving-mode': '2000' }, selected });
}
