// 3D conformers in a background thread (a large molecule takes a second, and Redraw tries several, one
// worker each), so the page doesn't freeze: RDKit's (moleculeIn3DByRDKit), OpenChemLib's where RDKit has
// none. Messages, one at a time: { molfile, seed } -> { points, energy } (points null: none), for a model;
// { input, seed } -> { made } (conformerAtoms), for a file; { complex } (a molecule) -> { complex }
// (buildComplex's result: a metal complex optimised by UFF); or { error }.
import { loadRDKit } from 'megane-rdkit';
import wasm from 'megane-rdkit/dist/megane-rdkit.wasm?url';
import OCL from 'openchemlib';
import resources from '../../node_modules/openchemlib/dist/resources.json?url';
import { conformerAtoms, moleculeIn3D, moleculeIn3DByRDKit } from './conformer.js';
import { buildComplex } from './threeD.js';

const ready = OCL.Resources.registerFromUrl(resources);
const rdkit = loadRDKit({ locateFile: () => wasm }).catch(() => null); // (it can't start: OpenChemLib makes them all)

// What RDKit made nothing of, not asked again: its next seeds would fail the same way, one after the other.
let refused = null;

self.onmessage = async ({ data: { molfile, input, seed, complex } }) => {
  try {
    await ready;
    if (complex !== undefined) {
      self.postMessage({ complex: buildComplex(complex, { OCL }) });
      return;
    }
    const asked = input ?? molfile;
    const RDKit3D = asked === refused ? null : await rdkit;
    if (input !== undefined) {
      const made = conformerAtoms(RDKit3D, OCL, input, seed);
      if (RDKit3D && !made?.byRDKit) refused = input;
      self.postMessage({ made });
      return;
    }
    const byRDKit = RDKit3D && moleculeIn3DByRDKit(RDKit3D, OCL, molfile, seed);
    if (RDKit3D && !byRDKit) refused = molfile;
    const points = byRDKit ?? moleculeIn3D(OCL, molfile, seed);
    self.postMessage({ points: points && [...points], energy: points?.energy ?? null, hydrogens: points?.hydrogens ?? [] });
  } catch (error) {
    self.postMessage({ error: String(error?.message ?? error) });
  }
};
