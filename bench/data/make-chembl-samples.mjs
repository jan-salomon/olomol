// Draws the seeded ChEMBL samples once from the chemreps file in
// data/cache/ (not committed) and writes the committed sample files:
// - b1-chembl.smi: 10,000 molecules for B1;
// - b3-bridged.smi, b3-macrocyclic.smi, b3-fused.smi: 100 each for B3.
// The order is fixed by the seed, not by the file: every ChEMBL ID gets a
// hash of (seed, ID), and molecules are taken in the order of their hashes
// until enough pass the filters. Usage: node bench/data/make-chembl-samples.mjs
import { createReadStream, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { largestFragment, ORGANIC, ringFacts } from '../lib/rings.mjs';

const RELEASE = 'chembl_37';
const SEED = 20261106;
const FILE = new URL(`cache/${RELEASE}_chemreps.txt.gz`, import.meta.url);
const SHA256 = 'ea6181ce8dc7af41974e35b92e1febb0c9dcbe2c62f7ccc4a5d983ac19f696e7';
const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();

// FNV-1a over the seed and the ID, then a final mix: a fixed pseudo-random rank for each molecule
function rank(id) {
  let h = 2166136261 ^ SEED;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

const rows = [];
const lines = createInterface({ input: createReadStream(FILE).pipe(createGunzip()) });
let header = true;
for await (const line of lines) {
  if (header) {
    header = false;
    continue;
  }
  const [id, smiles] = line.split('\t');
  if (smiles) rows.push({ id, smiles, rank: rank(id) });
}
rows.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
console.log(`${rows.length} molecules in ${RELEASE}`);

const b1 = [];
const b3 = { bridged: [], macrocyclic: [], fused: [] };
let looked = 0;
for (const row of rows) {
  const b1Full = b1.length >= 10000;
  const b3Full = Object.values(b3).every((list) => list.length >= 100);
  if (b1Full && b3Full) break;
  const smiles = largestFragment(row.smiles);
  // B3 needs several ring closures: skip the rest quickly once B1 is full
  if (b1Full && (smiles.match(/[0-9%]/g) ?? []).length < 6) continue;
  looked += 1;
  const facts = ringFacts(RDKit, smiles);
  if (!facts || ![...facts.elements].every((z) => ORGANIC.has(z)) || facts.heavyAtoms < 2) continue;
  if (!b1Full && facts.heavyAtoms <= 100) b1.push({ ...row, smiles });
  if (facts.heavyAtoms > 100) continue;
  const set = facts.largestRing >= 12 ? 'macrocyclic' : facts.bridgeheads >= 2 ? 'bridged' : facts.largestFused >= 4 ? 'fused' : null;
  if (set && b3[set].length < 100) b3[set].push({ ...row, smiles, facts });
}
console.log(`looked at ${looked}`);

const date = new Date().toISOString().slice(0, 10);
const head = (what, filter) => [
  `# ${what}`,
  `# SOURCE: ChEMBL release 37 (${RELEASE}_chemreps.txt.gz, sha256 ${SHA256}), https://www.ebi.ac.uk/chembl/`,
  '# LICENCE: CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/); this file is an adaptation of ChEMBL data and carries the same licence. Attribution: ChEMBL, EMBL-EBI.',
  `# DATE: ${date}`,
  `# SEED: ${SEED} (molecules in the order of a hash of the seed and the ChEMBL ID; see make-chembl-samples.mjs)`,
  `# FILTER: ${filter}`,
  '# COLUMNS: chembl_id, SMILES (ChEMBL canonical SMILES of the largest fragment), tab separated',
];
const ORGANIC_TEXT = 'largest fragment (salts split); only H B C N O F Si P S Cl Se Br I; RDKit reads it';
writeFileSync(new URL('b1-chembl.smi', import.meta.url), [...head('B1: 10,000 molecules sampled from ChEMBL', `${ORGANIC_TEXT}; at most 100 heavy atoms`), ...b1.map((r) => `${r.id}\t${r.smiles}`)].join('\n') + '\n');
const what = {
  bridged: 'at least 2 bridgehead atoms (RDKit definition: ends of a path of 2 or more bonds shared by two SSSR rings), no ring of 12 or more atoms',
  macrocyclic: 'an SSSR ring of at least 12 atoms',
  fused: 'a system of at least 4 rings fused through shared bonds, no bridgehead atoms, no ring of 12 or more',
};
for (const [set, list] of Object.entries(b3)) {
  writeFileSync(new URL(`b3-${set}.smi`, import.meta.url), [...head(`B3: 100 ${set} molecules from ChEMBL`, `${ORGANIC_TEXT}; at most 100 heavy atoms; ${what[set]}`), ...list.map((r) => `${r.id}\t${r.smiles}`)].join('\n') + '\n');
  console.log(set, list.length);
}
