// Runs Indigo (EPAM's chemistry toolkit, compiled to WebAssembly; Apache
// 2.0) in a background thread, so long jobs don't freeze the page.
// Messages: { id, op: 'convert' | 'layout' | 'clean', struct, format,
// options, selected (clean: the atoms it may move, by index; none: all) }
// -> { id, result } or { id, error }. While it starts:
// { progress } (the share of its .wasm downloaded; null: ready), or
// { failed } if it can't.
import Module from 'indigo-ketcher/binaryWasmNoRender';
import wasmUrl from '../../node_modules/indigo-ketcher/indigo-ketcher-norender-1.46.0.wasm?url';
import { instantiate } from './download.js';

const ready = new Promise((resolve, reject) => {
  Module({
    instantiateWasm(imports, done) {
      instantiate(wasmUrl, __INDIGO_WASM_SIZE__, imports, (share) => self.postMessage({ progress: share }))
        .then(({ instance, module }) => done(instance, module), reject);
      return {};
    },
  }).then(resolve, reject);
});
ready.then(() => self.postMessage({ progress: null }), (error) => self.postMessage({ failed: String(error?.message ?? error) }));

self.onmessage = async ({ data: { id, op, struct, format, options = {}, selected = [] } }) => {
  let indigoOptions = null;
  let atoms = null;
  try {
    const indigo = await ready;
    indigoOptions = new indigo.MapStringString();
    for (const [key, value] of Object.entries(options)) indigoOptions.set(key, String(value));
    let result;
    if (op === 'convert') result = indigo.convert(struct, format, indigoOptions);
    else if (op === 'layout') result = JSON.parse(indigo.layout(struct, format, indigoOptions)).struct;
    else if (op === 'clean') {
      atoms = new indigo.VectorInt();
      for (const k of selected) atoms.push_back(k);
      result = indigo.clean2d(struct, format, indigoOptions, atoms);
    }
    else throw new Error(`unknown operation ${op}`);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  } finally {
    indigoOptions?.delete();
    atoms?.delete();
  }
};
