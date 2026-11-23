// Module hooks that let olomol's src/ load in Node as it is. Vite turns an
// import of `something.wasm?url` into the file's address; here it becomes a
// module whose default export is the file's path on disk. Nothing in src/
// is changed. Registered by setup.mjs.
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if (specifier.endsWith('?url')) {
    const { url } = await next(specifier.slice(0, -'?url'.length), context);
    const source = `export default ${JSON.stringify(fileURLToPath(url))};`;
    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  return next(specifier, context);
}
