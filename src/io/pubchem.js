// PubChem (the open chemistry database of the US National Institutes of
// Health), only when asked: structures by name or number (what was typed is
// sent, never the drawing), and the address of a compound's page (what it
// is looked up by is sent: a name, SMILES, InChI or InChIKey).
import { t } from '../i18n/i18n.js';

const SERVICE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound';

// A PubChem compound number: "2244" or "CID 2244", else null.
export const cidOf = (text) => /^\s*(?:cid\s*:?\s*)?(\d+)\s*$/i.exec(text)?.[1] ?? null;

// PubChem's answer to `path` with `fields` POSTed (so names with slashes or
// other odd characters go through): { response, data }. Throws with a
// message to show if PubChem can't be reached.
// (PubChem takes about five requests a second and turns the rest away, without the header a browser needs to read the
// refusal: asked at most four a second, and a refused one asked again, twice, after a short wait)
let last = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ask(path, fields) {
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, last + 260 - Date.now());
    last = Date.now() + wait;
    if (wait) await pause(wait);
    try {
      const answer = await askOnce(path, fields);
      if (answer.response.status !== 503 || attempt >= 2) return answer;
    } catch (error) {
      if (attempt >= 2) throw error;
    }
    await pause(900 * (attempt + 1));
  }
}
async function askOnce(path, fields) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${SERVICE}/${path}`, { method: 'POST', body: new URLSearchParams(fields), signal: controller.signal });
    return { response, data: await response.json().catch(() => null) };
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error(t('Could not reach PubChem (no internet connection?).'));
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const notFound = ({ response, data }) => response.status === 404 || data?.Fault?.Code === 'PUGREST.NotFound';

// { smiles, title, cid } of the compound with this name or number. Throws
// with a message to show if there is none or PubChem can't be reached.
export async function lookUp(query) {
  const text = query.trim();
  const cid = cidOf(text);
  const answer = await ask(`${cid ? 'cid' : 'name'}/property/SMILES,Title/JSON`, cid ? { cid } : { name: text });
  const found = answer.data?.PropertyTable?.Properties?.[0];
  if (!found?.SMILES && !found?.IsomericSMILES) {
    if (notFound(answer)) throw new Error(t('PubChem has no compound “{name}”.', { name: text }));
    throw new Error(t('PubChem could not answer ({reason}).', { reason: answer.data?.Fault?.Message ?? answer.response.status }));
  }
  return { smiles: found.SMILES ?? found.IsomericSMILES, title: found.Title ?? text, cid: found.CID };
}

const page = (cid) => `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
// (PubChem's own picture of a compound)
const picture = (cid) => `${SERVICE}/cid/${cid}/PNG?image_size=240x180`;

// A database's code rather than a name (PubChem's title is sometimes one: Npc209773 for atropine).
const CODES = /^(?:RefChem:|Npc\d|CHEMBL|SCHEMBL|ZINC|NSC[\s-]?\d|AKOS|MFCD|DTX[CS]ID|BDBM|HMS\d|STK\d|SPECS|CAS-|EINECS|BRN\s|UNII|HSDB|CCRIS|CID\s?\d|[DC]\d{5}$|Q\d+$|\d+-\d\d-\d$)/i;
const isCode = (name) => CODES.test(name) || /^(?=.*\d)[A-Z0-9]{10}$/.test(name); // (and a UNII: ten capitals and digits)
// The name without its stereo descriptors in front ((+/-)-, (2E)-, (1R,2S)-, dl-), to sort by.
const bare = (name) => name.replace(/^(?:\((?:[\dRSEZrsez+\-±/,\s]|alpha|beta|cis|trans|endo|exo)+\)-|(?:dl|DL|rac|[DLdl])-)+/, '');

// The compounds PubChem finds for a SMILES by `identity` (same_connectivity: the same atoms and bonds,
// whatever their stereochemistry and isotopes; nonconflicting_stereo: also the stereocentres drawn,
// those left open may be anything), two dozen at most, named (see named), the shortest name first
// (without stereo descriptors), those with only codes last.
async function identical(smiles, identity) {
  const same = await ask(`fastidentity/smiles/cids/JSON?identity_type=${identity}`, { smiles });
  const cids = (same.data?.IdentifierList?.CID ?? []).filter(Boolean).slice(0, 24);
  if (!cids.length) return [];
  return (await named(cids)).sort((a, b) => (a.code - b.code) || (bare(a.title).length - bare(b.title).length));
}

// These compounds with their names: [{ cid, title, code (only a code found), isotopes (has some),
// open (how many stereocentres and double bonds it leaves undefined), page, picture }]. The name:
// PubChem's title or, if that is a code, the first synonym that is a name.
async function named(cids) {
  const [properties, synonyms] = await Promise.all([
    ask('cid/property/Title,IsotopeAtomCount,UndefinedAtomStereoCount,UndefinedBondStereoCount/JSON', { cid: cids.join(',') }),
    ask('cid/synonyms/JSON', { cid: cids.join(',') }),
  ]);
  const about = new Map((properties.data?.PropertyTable?.Properties ?? []).map((p) => [p.CID, p]));
  const others = new Map((synonyms.data?.InformationList?.Information ?? []).map((i) => [i.CID, i.Synonym ?? []]));
  return cids.map((cid) => {
    const p = about.get(cid) ?? {};
    const name = [p.Title, ...(others.get(cid) ?? [])].find((n) => n && !isCode(n));
    return {
      cid, title: name ?? p.Title ?? `CID ${cid}`, code: !name, isotopes: p.IsotopeAtomCount > 0,
      open: (p.UndefinedAtomStereoCount ?? 0) + (p.UndefinedBondStereoCount ?? 0), page: page(cid), picture: picture(cid),
    };
  });
}

const SHOWN = 12; // compounds on the page to choose from

// A compound's PubChem page, by one of { cid, name, smiles, inchi,
// inchikey }: { page }. By an InChIKey with the drawing's SMILES as well,
// a page to choose from instead, { similar: [{ cid, title, page, picture }],
// why, exact? }:
// - why 'open': PubChem has the drawing as it is (exact), with some
//   stereocentres undefined, and also compounds that define more of them,
//   agreeing with those drawn: likelier what was meant;
// - no compound with exactly that key: why 'agreeing', those agreeing with
//   the stereocentres drawn; if none, why 'stereo', those with the same
//   atoms and bonds; with isotopes drawn, why 'isotopes', those with the
//   same atoms and bonds whatever their isotopes (with none drawn,
//   isotopic ones are always left out).
// Throws with a message to show if PubChem has none.
export async function pageOf(query) {
  if (query.cid) return { page: page(query.cid) };
  const [kind, value] = Object.entries(query).find(([key, v]) => v && key !== 'smiles') ?? ['smiles', query.smiles];
  const answer = await ask(`${kind}/cids/JSON`, { [kind]: value });
  const cid = answer.data?.IdentifierList?.CID?.[0];
  const byKey = kind === 'inchikey' && query.smiles;
  const isotopic = byKey && /\[\d+[A-Za-z]/.test(query.smiles); // ([2H], [13C], an aromatic [13cH]…)
  const plain = (found) => isotopic || !found.isotopes;
  if (cid) {
    if (byKey) {
      const [drawn] = await named([cid]);
      if (drawn.open > 0) {
        const similar = (await identical(query.smiles, 'nonconflicting_stereo')).filter((found) => found.cid !== cid && plain(found) && found.open < drawn.open).slice(0, SHOWN);
        if (similar.length) return { exact: drawn, similar, why: 'open' };
      }
    }
    return { page: page(cid) };
  }
  // an unknown SMILES or InChI comes back as CID 0, an unknown name or InChIKey as not found
  if (cid !== 0 && !notFound(answer)) throw new Error(t('PubChem could not answer ({reason}).', { reason: answer.data?.Fault?.Message ?? answer.response.status }));
  if (byKey) {
    if (!isotopic) {
      const agreeing = (await identical(query.smiles, 'nonconflicting_stereo')).filter(plain).slice(0, SHOWN);
      if (agreeing.length) return { similar: agreeing, why: 'agreeing' };
    }
    const similar = (await identical(query.smiles, 'same_connectivity')).filter(plain).slice(0, SHOWN);
    if (similar.length) return { similar, why: isotopic ? 'isotopes' : 'stereo' };
  }
  throw new Error(t('PubChem has no page for this compound.'));
}
