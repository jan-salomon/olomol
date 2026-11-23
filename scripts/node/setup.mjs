// olomol's src/ in Node (node --import ./scripts/node/setup.mjs …): what
// the browser and Vite give olomol's code and Node doesn't.
// - the module hooks for Vite's `?url` imports (hooks.mjs);
// - the constants Vite defines at build time (vite.config.js `define`);
// - fetch() of a path on disk (the .wasm files the `?url` imports name),
//   which Node's fetch can't do.
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);

Object.assign(globalThis, {
  __RDKIT_WASM_SIZE__: 0,
  __INDIGO_WASM_SIZE__: 0,
  __OCL_RESOURCES_SIZE__: 0,
  __APP_VERSION__: 'node',
  __BUILD_DATE__: '',
  __RELEASE_DATE__: '',
  __COMMIT__: '',
});

const networkFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
  if (typeof url === 'string' && url.startsWith('/')) {
    const type = url.endsWith('.wasm') ? 'application/wasm' : url.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    return new Response(await readFile(url), { headers: { 'content-type': type } });
  }
  return networkFetch(url, ...rest);
};
