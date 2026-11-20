// A drawing in a link: its .olom (KET before 0.5.0; both read), compressed (deflate) and written in the URL's
// #fragment, which browsers keep to themselves (it never goes to the
// server), so the drawing travels only where the link is pasted.
import { toOlom } from './olom.js';

const PREFIX = '#d=';

async function squeeze(text, stream) {
  const data = new Blob([text]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(data).arrayBuffer());
}

const base64url = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// The link to this page that opens the drawing.
export async function linkTo(doc, { settings, title, base = location.href.split('#')[0] } = {}) {
  const text = JSON.stringify(toOlom(doc, { settings, title }));
  return `${base}${PREFIX}${base64url(await squeeze(text, new CompressionStream('deflate-raw')))}`;
}

// The drawing's text in a link's #fragment (.olom, or KET from a link made before 0.5.0), or null if it holds no drawing.
export async function drawingIn(hash) {
  if (!hash.startsWith(PREFIX)) return null;
  const text = atob(hash.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await squeeze(bytes, new DecompressionStream('deflate-raw')));
}

// --- structures in a link, written by hand or by a chatbot (llms.txt) ---
// https://olomol.org/#smiles=CC(=O)Oc1ccccc1C(=O)O, also ?smiles=…; more than one: each in a tab of its own, in
// order (an exercise, then its solution). The keys: smiles (a molecule, several joined by dots, or a reaction
// SMILES, reactants>agents>products), inchi, name (looked up on PubChem, English), cid (a PubChem number); the
// n-th title names the n-th drawing (written before its structure or after it, either way).
export const STRUCTURE_KEYS = ['smiles', 'inchi', 'name', 'cid'];
const KEYS = [...STRUCTURE_KEYS, 'title'];

// A value as a person or a chatbot writes it into a link: %XX read where it stands for a printable character
// (%23 #, %2B +, %25 %, %20 a space) and UTF-8 runs (%C3%A9 é), but kept where it can only be a SMILES ring closure
// (%10 to %19 stand for control characters); + is a + (a charge), a space only in a name or title.
export function linkValue(raw, { plusIsSpace = false } = {}) {
  let out = '';
  for (let i = 0; i < raw.length;) {
    const run = /^(?:%[0-9A-Fa-f]{2})+/.exec(raw.slice(i));
    if (!run) {
      const ch = raw[i];
      out += plusIsSpace && ch === '+' ? ' ' : ch;
      i += 1;
      continue;
    }
    for (const escape of run[0].match(/%[0-9A-Fa-f]{2}/g)) {
      const code = parseInt(escape.slice(1), 16);
      out += code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : escape; // (UTF-8 bytes and ring closures for now)
    }
    i += run[0].length;
  }
  // the UTF-8 runs left (a name with é): read as such where they are UTF-8
  return out.replace(/(?:%[89A-Fa-f][0-9A-Fa-f])+/g, (bytes) => {
    try {
      return decodeURIComponent(bytes);
    } catch {
      return bytes;
    }
  });
}

// The structures a link asks for: [{ kind, value, title }], from its #fragment and its ?query (the fragment
// first), in order; [] if none
export function structuresIn(href) {
  const url = new URL(href);
  const parts = [url.hash.slice(1), url.search.slice(1)].filter((part) => part && !part.startsWith('d='));
  const found = [];
  const titles = [];
  for (const part of parts) {
    for (const pair of part.split('&')) {
      const at = pair.indexOf('=');
      if (at < 0) continue;
      const key = pair.slice(0, at).toLowerCase();
      if (!KEYS.includes(key)) continue;
      const value = linkValue(pair.slice(at + 1), { plusIsSpace: key === 'name' || key === 'title' }).trim();
      if (!value) continue;
      if (key === 'title') titles.push(value);
      else found.push({ kind: key, value });
    }
  }
  return found.map((structure, k) => ({ ...structure, title: titles[k] ?? null }));
}

// The address without what structuresIn read (the rest kept: ?lang=, ?test)
export function withoutStructures(href) {
  const url = new URL(href);
  const keep = (part) => part.split('&').filter((pair) => !KEYS.includes(pair.split('=')[0].toLowerCase())).join('&');
  const search = keep(url.search.slice(1));
  url.search = search ? `?${search}` : '';
  url.hash = url.hash.startsWith('#d=') ? url.hash : keep(url.hash.slice(1));
  return url.href.replace(/#$/, '');
}

// A text that is an olomol link, as a full address in a link (https://olomol.org/#smiles=…, also #d=…, ?smiles=…,
// a copy of olomol elsewhere) or only its #part (#smiles=CCO): that address (the #part on this page's), else null.
// For a link pasted into the search bar or onto the canvas, where there is no address bar (the installed app).
// Another site's address (not this page's, not olomol.org) counts only with a drawing (#d=) or structures that are
// all SMILES or InChI, drawn here: one with name= or cid= (example.org/page?name=report, a PubChem page's ?cid=)
// is some other page, and taking it would send its words to PubChem.
export function olomolLink(text, base = typeof location === 'undefined' ? 'https://olomol.org/' : location.href.split('#')[0]) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null; // (spaces allowed: a title typed in, Exercise 1)
  let href;
  if (trimmed.startsWith('#')) href = `${base}${trimmed}`;
  else if (/^https?:\/\//i.test(trimmed)) href = trimmed;
  else return null;
  try {
    const url = new URL(href);
    if (url.hash.startsWith('#d=')) return url.href;
    const structures = structuresIn(url.href);
    const own = url.origin === new URL(base).origin || ['olomol.org', 'www.olomol.org'].includes(url.hostname);
    if (!structures.length || (!own && !structures.every((s) => s.kind === 'smiles' || s.kind === 'inchi'))) return null;
    return url.href;
  } catch {
    return null;
  }
}
