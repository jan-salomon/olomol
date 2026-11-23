// Node: the app's file code with real RDKit and Indigo (scripts/formats/*): olomol's src/ in Node (scripts/node/setup.mjs:
// Vite's ?url imports, the WASM files) and a Worker run in this thread for src/io/indigoWorker.js.
await import('../node/setup.mjs');
class InThreadWorker {
  constructor(url) {
    this.ready = (async () => {
      globalThis.self = { postMessage: (data) => setTimeout(() => this.onmessage?.({ data })) };
      await import(url.href ?? url);
      this.target = globalThis.self;
    })();
  }
  postMessage(message) {
    this.ready.then(() => this.target.onmessage({ data: message }));
  }
  terminate() {}
}
globalThis.Worker = InThreadWorker;
