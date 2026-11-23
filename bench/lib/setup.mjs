// Loaded before every benchmark (node --import ./bench/lib/setup.mjs): olomol's src/ in Node, as for the scripts
// (scripts/node/setup.mjs), with the benchmarks' version name.
await import('../../scripts/node/setup.mjs');
globalThis.__APP_VERSION__ = 'bench';
