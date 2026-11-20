// The big downloads (the chemistry engines, 1 to 8 MB each), counted for
// the progress bar: which are on their way and how far they are.
const going = new Map(); // name -> the share done, 0 to 1
const listeners = new Set();
let current = [];

export function onDownloads(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// [{ name, done }], for useSyncExternalStore
export const downloads = () => current;

// `done` (0 to 1) of `name`; null: finished (or failed).
export function progress(name, done) {
  if (done === null) going.delete(name);
  else going.set(name, done);
  current = [...going].map(([name, done]) => ({ name, done }));
  for (const listener of listeners) listener();
}

// The body of `url`, counted as it comes: onDone(share done). `size` is
// the file's size, known when the site was built (the download's own
// length is that of the compressed file, if the server compresses it).
export async function countedBody(url, size, onDone) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} : ${url}`);
  let loaded = 0;
  return response.body.pipeThrough(new TransformStream({
    transform(chunk, stream) {
      loaded += chunk.byteLength;
      onDone(Math.min(1, loaded / size));
      stream.enqueue(chunk);
    },
  }));
}

// For Emscripten's `instantiateWasm`: the .wasm file compiled while it
// downloads, counted.
export async function instantiate(url, size, imports, onDone) {
  const body = await countedBody(url, size, onDone);
  return WebAssembly.instantiateStreaming(new Response(body, { headers: { 'Content-Type': 'application/wasm' } }), imports);
}
