// PubChem's isomeric SMILES of a named compound (PUG REST), cached in a
// committed data file so a rerun doesn't ask again. Only names are sent.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/';

export async function pubchemByName(names, cacheUrl) {
  const cache = existsSync(cacheUrl) ? JSON.parse(readFileSync(cacheUrl, 'utf8')) : {
    SOURCE: 'PubChem PUG REST, https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/<name>/property/SMILES,InChIKey,Title/JSON',
    LICENCE: 'PubChem data are in the public domain (NCBI); see https://www.ncbi.nlm.nih.gov/home/about/policies/',
    DATE: null,
    SEED: 'none',
    answers: {},
  };
  let asked = false;
  for (const name of names) {
    if (cache.answers[name]) continue;
    const response = await fetch(`${API}${encodeURIComponent(name)}/property/SMILES,InChIKey,Title/JSON`);
    const body = await response.json();
    const found = body.PropertyTable?.Properties ?? [];
    cache.answers[name] = found.length
      ? { cid: found[0].CID, smiles: found[0].SMILES, inchikey: found[0].InChIKey, title: found[0].Title, otherCids: found.slice(1).map((p) => p.CID), retrieved: new Date().toISOString().slice(0, 10) }
      : { error: body.Fault?.Message ?? `HTTP ${response.status}`, retrieved: new Date().toISOString().slice(0, 10) };
    asked = true;
    await new Promise((resolve) => setTimeout(resolve, 250)); // (PubChem asks for at most 5 requests a second)
  }
  if (asked) {
    cache.DATE = new Date().toISOString().slice(0, 10);
    writeFileSync(cacheUrl, JSON.stringify(cache, null, 1) + '\n');
  }
  return cache.answers;
}
