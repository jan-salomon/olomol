// Indigo (indigo-ketcher, the build olomol ships) loaded in Node, without olomol's code: for B6's "redrawn" variants
// (Indigo's layout is Redraw's first whole-molecule engine, relayout.js ENGINES) and for checking which way up a
// KET file's y axis points. olomol itself runs Indigo in a Web Worker (src/io/indigoWorker.js); here it is the
// same wasm called directly.
import { readFileSync } from 'node:fs';

const WASM = new URL('../../node_modules/indigo-ketcher/indigo-ketcher-norender-1.46.0.wasm', import.meta.url);
let loaded = null;

export async function indigo() {
  loaded ??= (async () => {
    const { default: Module } = await import('indigo-ketcher/binaryWasmNoRender');
    return Module({ wasmBinary: readFileSync(WASM) });
  })();
  return loaded;
}

// Indigo's call with options as a map, as indigoWorker.js makes it
async function call(op, struct, format, options) {
  const ind = await indigo();
  const map = new ind.MapStringString();
  try {
    for (const [key, value] of Object.entries(options)) map.set(key, String(value));
    return op === 'layout' ? JSON.parse(ind.layout(struct, format, map)).struct : ind.convert(struct, format, map);
  } finally {
    map.delete();
  }
}

// Indigo's layout of a molfile (Redraw's "Indigo layout": src/io/indigo.js indigoLayout), a V2000 molfile back
export const indigoLayout = (molfile) => call('layout', molfile, 'chemical/x-mdl-molfile', { 'molfile-saving-mode': '2000', 'output-content-type': 'application/json' });

// Any structure Indigo reads, as a V2000 molfile
export const indigoToMolfile = (text) => call('convert', text, 'chemical/x-mdl-molfile', { 'molfile-saving-mode': '2000' });
