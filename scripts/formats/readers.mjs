// Independent-reader check of olomol's structure exports.
//
// Every drawing (the examples, plus small drawings below for features the examples may lack) is exported with
// olomol's writeAs in each structure format; other programs' readers read the file: RDKit's own parsers (molfile,
// RXN split into its molfiles, SDF records, SMILES), Indigo (convert, which detects the format; what it read written
// out as a V2000 molfile/RXN for RDKit to canonicalise) and olomol itself (readAny). What each read is compared with
// what olomol meant: per molecule, the drawing with its abbreviations drawn out as a V2000 molfile (olomol's
// writeMolfile, as abbreviate.js chemistryMolfile, with dative bonds kept as type 9), as RDKit's canonical SMILES;
// hydrogen bonds as element pairs; repeating units as their heavy-atom count and letter; for a drawing with one
// reaction arrow, which molecules are reactants, products and agents (by where they stand). InChI: the exported text
// against RDKit's InChI of the meaning (SMILES and InChI: dative bonds left out, as lost.js declares), and the InChI of
// what Indigo and olomol read from it. A file with one reaction (RXN, a molfile of a reaction, reaction SMILES) for a
// drawing with several arrows or arrows that are no reaction (resonance, dipole, =, crossed) is reported as 'scheme'.
// A difference src/io/lost.js lostIn declares for the format is reported as declared, not as a problem.
//
// Run: npm run check:formats -- [drawing-filter] [--out dir] [-v]
// (node --import ./scripts/formats/node-setup.mjs scripts/formats/readers.mjs: olomol's src/ in Node and an
// in-thread Worker for Indigo). One line per drawing x format:
// ok / ok (declared lost: ...) / DIFF, with each reader's verdict and, under a DIFF, what it read against what was
// meant; a summary at the end; exit code 1 if anything undeclared differs. --out dir keeps every exported file.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const REPO = new URL('../../', import.meta.url).pathname;
const R = REPO + 'src/';
const { readAny, writeAs } = await import(R + 'io/files.js');
const { convert } = await import(R + 'io/indigo.js');
const { writeMolfile } = await import(R + 'io/molfile.js');
const { lostIn, oneReaction: writtenAsReaction } = await import(R + 'io/lost.js');
const { withGroupsDrawnOut } = await import(R + 'editor/abbreviate.js');
const { DEFAULT_SETTINGS: S } = await import(R + 'render/scene.js');
const { emptyDoc, addAtom, addBond, addArrow, addPlus, addRepeatingUnit, repeatingUnits } = await import(R + 'model/doc.js');
const { fragments } = await import(R + 'model/graph.js');
const RDKit = await createRequire(REPO + 'package.json')('@rdkit/rdkit')();

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const outAt = args.indexOf('--out');
const OUT = outAt >= 0 ? args[outAt + 1] : null;
const filter = args.find((a, i) => !a.startsWith('-') && (outAt < 0 || i !== outAt + 1)) ?? null;
const FORMATS = ['mol', 'sdf', 'rxn', 'ket', 'cdxml', 'smiles', 'inchi'];
const EXT = { mol: 'mol', sdf: 'sdf', rxn: 'rxn', ket: 'ket', cdxml: 'cdxml', smiles: 'smi', inchi: 'txt' };

// --- reading V2000 molfiles (olomol's, Indigo's) with RDKit ---

const quiet = RDKit.set_log_capture('rdApp.*');
// RDKit's canonical SMILES, dummy atoms (R, labels) as plain *
const tidy = (smiles) => smiles.replace(/\[\d*\*[^\]]*\]/g, '*');

// A V2000 molfile read by RDKit: { frags: [canonical SMILES], hbonds: ['O...O'], units: ['2:n'] } or { error }.
// Hydrogen bonds (type 10) are taken out first and listed (RDKit reads them as null query bonds, which would join
// molecules); repeating units as RDKit read them (its CXSMILES Sg fields), heavy atoms counted.
function readV2000(block) {
  const lines = block.replace(/\r/g, '').split('\n');
  const c = lines.findIndex((l, i) => i >= 3 && /V2000/.test(l));
  if (c < 0) return { error: 'no V2000 counts line' };
  const nA = parseInt(lines[c].slice(0, 3), 10);
  const nB = parseInt(lines[c].slice(3, 6), 10);
  const els = lines.slice(c + 1, c + 1 + nA).map((l) => l.slice(31, 34).trim());
  const bondLines = lines.slice(c + 1 + nA, c + 1 + nA + nB);
  const hbonds = [];
  const kept = bondLines.filter((l) => {
    if (parseInt(l.slice(6, 9), 10) !== 10) return true;
    hbonds.push([els[parseInt(l.slice(0, 3), 10) - 1], els[parseInt(l.slice(3, 6), 10) - 1]].sort().join('...'));
    return false;
  });
  const counts = lines[c].slice(0, 3) + String(kept.length).padStart(3) + lines[c].slice(6);
  const rest = lines.slice(c + 1 + nA + nB).filter((l) => !l.startsWith('M  SBL'));
  const text = [...lines.slice(0, c), counts, ...lines.slice(c + 1, c + 1 + nA), ...kept, ...rest].join('\n');
  const mol = RDKit.get_mol(text, JSON.stringify({ removeHs: true }));
  if (!mol) return { error: 'RDKit: ' + quiet.get_buffer().split('\n').filter(Boolean).pop() };
  try {
    const cx = mol.get_cxsmiles();
    const units = [...cx.matchAll(/Sg:n:([\d,]+):([^:|,]*)/g)].map(([, atoms, sub]) => `${atoms.split(',').length}:${sub || 'n'}`);
    return { frags: tidy(mol.get_smiles()).split('.').filter(Boolean), hbonds, units };
  } finally {
    mol.delete();
  }
}

// The molfiles of an RXN: { reactants, products, agents } (lists of molfile texts).
function rxnBlocks(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const at = lines.findIndex((l) => l.startsWith('$RXN'));
  const counts = lines[at + 4];
  const [r, p, a] = [0, 3, 6].map((k) => parseInt(counts.slice(k, k + 3), 10) || 0);
  const blocks = text.replace(/\r/g, '').split(/^\$MOL[ \t]*\n/m).slice(1);
  return { reactants: blocks.slice(0, r), products: blocks.slice(r, r + p), agents: blocks.slice(r + p, r + p + a) };
}
const sdfBlocks = (text) => text.replace(/\r/g, '').split(/^\$\$\$\$\s*$/m).filter((b) => /M {2}END/.test(b));

// Several readings as one: their molecules, hydrogen bonds and units together.
function merge(readings) {
  const error = readings.find((r) => r.error)?.error;
  if (error) return { error };
  return { frags: readings.flatMap((r) => r.frags), hbonds: readings.flatMap((r) => r.hbonds), units: readings.flatMap((r) => r.units) };
}

// A molfile, RXN or SDF text read by RDKit's parsers; an RXN also by RDKit's reaction parser (that it opens), with
// its roles: { ..., roles: { reactants, products, agents } (molecule counts) }.
function rdkitFile(text) {
  if (text.trimStart().startsWith('$RXN')) {
    const rxn = RDKit.get_rxn(text);
    if (!rxn) return { error: 'RDKit get_rxn refuses it' };
    rxn.delete();
    const roles = rxnBlocks(text);
    const reading = merge(Object.values(roles).flat().map(readV2000));
    return { ...reading, roles: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, v.flatMap((b) => readV2000(b).frags ?? ['?'])])) };
  }
  const blocks = sdfBlocks(text);
  return merge((blocks.length ? blocks : [text]).map(readV2000));
}

// A SMILES (or reaction SMILES) read by RDKit.
// (a CXSMILES extension, |^1:3| for a radical, read with it; a reaction's parts without it, noted)
function rdkitSmiles(text) {
  const line = text.trim().split('\n')[0];
  const [smiles, cx] = line.split(/\s+(?=\|)/);
  const parts = smiles.includes('>') ? smiles.split('>').flatMap((s) => s.split('.')).filter(Boolean) : [line];
  if (smiles.includes('>') && cx) return { error: 'reaction CXSMILES: ' + line.slice(0, 120) };
  const read = (part) => {
    const mol = RDKit.get_mol(part);
    if (!mol) throw new Error('RDKit cannot read ' + part);
    try { return tidy(mol.get_smiles()).split('.'); } finally { mol.delete(); }
  };
  try {
    const frags = parts.flatMap(read);
    if (!smiles.includes('>')) return { frags, hbonds: [], units: [] };
    const [reactants, agents, products] = smiles.split('>').map((side) => side.split('.').filter(Boolean).flatMap(read));
    return { frags, hbonds: [], units: [], roles: { reactants, products, agents } };
  } catch (e) {
    return { error: e.message };
  }
}

// Indigo's molfiles in RDKit's terms: a valence field (the atom's bonds and hydrogens) counts no dative bond in
// Indigo's (it reads and writes it so: H3N->PtH(Cl)2 has Pt valence 3), a dative bond at its acceptor in RDKit's
// (valence 4); so that what Indigo read is what RDKit gets, each acceptor's field gets its dative bonds added.
function indigoValences(text) {
  return text.replace(/^(.*\n)?( *\d+ *\d+ .*V2000)\n([\s\S]*?)(?=^M {2}|^\$)/gm, (all, before = '', counts, body) => {
    const nA = parseInt(counts.slice(0, 3), 10);
    const nB = parseInt(counts.slice(3, 6), 10);
    const lines = body.split('\n');
    const atoms = lines.slice(0, nA);
    for (const bond of lines.slice(nA, nA + nB)) {
      if (parseInt(bond.slice(6, 9), 10) !== 9) continue;
      const k = parseInt(bond.slice(3, 6), 10) - 1;
      const v = parseInt(atoms[k].slice(48, 51), 10) || 0;
      if (v && v !== 15) atoms[k] = atoms[k].slice(0, 48) + String(v + 1).padStart(3) + atoms[k].slice(51);
    }
    return before + counts + '\n' + [...atoms, ...lines.slice(nA)].join('\n');
  });
}

// A file read by Indigo (which detects its format), what it read written as V2000 (a reaction as RXN), read by
// RDKit as above. An SDF goes record by record (Indigo's convert reads one structure).
async function indigoFile(text, format) {
  // (a SMILES or InChI has no coordinates: Indigo's molfile of it would have no wedges, so its SMILES instead)
  const viaSmiles = format === 'smiles' || format === 'inchi';
  const pieces = format === 'sdf' ? sdfBlocks(text).map((b) => b + '\n$$$$\n') : [text];
  const readings = [];
  for (const piece of pieces) {
    let out;
    try {
      out = await convert(piece, viaSmiles ? 'smiles' : 'mol', { 'molfile-saving-mode': '2000' });
    } catch (e) {
      // (as Ketcher reads files: stereo it can't place not an error)
      try {
        out = await convert(piece, viaSmiles ? 'smiles' : 'mol', { 'molfile-saving-mode': '2000', 'ignore-stereochemistry-errors': true });
        readings.push({ note: 'needs ignore-stereochemistry-errors' });
      } catch (e2) {
        return { error: 'Indigo: ' + String(e2?.message ?? e2).slice(0, 120) };
      }
    }
    readings.push({ ...(viaSmiles ? rdkitSmiles(out) : rdkitFile(indigoValences(out))), indigoText: out });
  }
  const notes = readings.filter((r) => r.note);
  const read = readings.filter((r) => !r.note);
  const merged = merge(read);
  return { ...merged, ...(read.length === 1 && read[0].roles && { roles: read[0].roles }), ...(notes.length && { note: notes[0].note }), indigoText: read.map((r) => r.indigoText).join('\n') };
}

// --- what olomol means ---

// The drawing's chemistry as olomol means it: abbreviations drawn out; partial bonds and links no bonds; hydrogen
// bonds listed apart; dative bonds kept (`dative` false: left out, as SMILES and InChI have them).
async function meaning(doc, { dative = true } = {}) {
  // (a repeating unit's atoms as before its labels were drawn out, with what they were drawn out as: as writeAs)
  const before = repeatingUnits(doc);
  const { doc: full, drawnAs } = await withGroupsDrawnOut(doc);
  const copy = structuredClone(full);
  const hbonds = [];
  for (const bond of [...copy.bonds.values()]) {
    if (bond.kind === 'hbond') hbonds.push([copy.atoms.get(bond.a).el, copy.atoms.get(bond.b).el].sort().join('...'));
    if (bond.kind === 'hbond' || bond.kind === 'partial' || bond.kind === 'link' || (bond.kind === 'dative' && !dative)) copy.bonds.delete(bond.id);
  }
  const reading = readV2000(writeMolfile(copy, null, '', { kinds: true }).molfile);
  const units = before.map(({ bracket, atoms }) => `${atoms.flatMap((id) => drawnAs.get(id) ?? [id]).filter((id) => full.atoms.get(id).el !== 'H').length}:${bracket.sub}`);
  return { ...reading, hbonds, units };
}

// The reaction as olomol means it, for a drawing with one reaction arrow (forward or equilibrium): each molecule a
// reactant (before the arrow's tail, along it), a product (past its head) or an agent (on the arrow, or beside it
// between its ends). null for other drawings.
async function rolesMeant(doc, { dative = true } = {}) {
  const arrows = [...doc.arrows.values()];
  if (arrows.length !== 1 || !['forward', 'equilibrium'].includes(arrows[0].kind)) return null;
  const [arrow] = arrows;
  const { doc: full } = await withGroupsDrawnOut(doc);
  const copy = structuredClone(full);
  for (const bond of [...copy.bonds.values()]) if (['hbond', 'partial', 'link'].includes(bond.kind) || (bond.kind === 'dative' && !dative)) copy.bonds.delete(bond.id);
  const length = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1);
  const [dx, dy] = [(arrow.x2 - arrow.x1) / length, (arrow.y2 - arrow.y1) / length];
  const roles = { reactants: [], products: [], agents: [] };
  for (const members of fragments(copy)) {
    const atoms = members.map((id) => copy.atoms.get(id));
    const { frags } = readV2000(writeMolfile(copy, members, '', { kinds: true }).molfile);
    const along = atoms.reduce((sum, a) => sum + (a.x - arrow.x1) * dx + (a.y - arrow.y1) * dy, 0) / atoms.length;
    const role = atoms.some((a) => a.arrow === arrow.id) ? 'agents' : along < 0 ? 'reactants' : along > length ? 'products' : 'agents';
    roles[role].push(...(frags ?? ['?']));
  }
  return roles;
}
function roleDifferences(got, meant) {
  if (!meant || !got.roles) return [];
  return Object.keys(meant).filter((role) => !same(got.roles[role] ?? [], meant[role]))
    .map((role) => `${role}: meant [${meant[role].join(' ')}] read [${(got.roles[role] ?? []).join(' ')}]`);
}
// Arrows a file with one reaction (RXN, a molfile of a reaction, reaction SMILES) can't say: more than one, or one
// that is no reaction going forward (resonance, dipole, equals, crossed)
function schemeOf(doc) {
  const arrows = [...doc.arrows.values()];
  const odd = arrows.filter((a) => ['dipole', 'same', 'resonance', 'failed'].includes(a.kind)).map((a) => a.kind);
  return arrows.length > 1 || odd.length ? `${arrows.length} arrow${arrows.length > 1 ? 's' : ''} (${arrows.map((a) => a.kind ?? 'forward').join(', ')}) written as one reaction` : null;
}

const inchiOf = (smiles) => {
  const mol = RDKit.get_mol(smiles);
  try { return mol ? mol.get_inchi() : 'unreadable'; } finally { mol?.delete(); }
};

// --- comparing ---

const multiset = (list) => list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
function minus(a, b) {
  const left = multiset(b);
  return a.filter((x) => (left.get(x) ? (left.set(x, left.get(x) - 1), false) : true));
}
const same = (a, b) => !minus(a, b).length && !minus(b, a).length;

// What a reading lacks or has more than the meaning: [] when the same. `lost`: what lostIn declares for the format.
function differences(got, meant, plain, lost) {
  if (got.error) return [got.error];
  const out = [];
  const datives = lost.includes('dative bonds');
  const want = datives && !same(got.frags, meant.frags) ? plain.frags : meant.frags;
  if (!same(got.frags, want)) {
    const missing = minus(want, got.frags);
    const extra = minus(got.frags, want);
    out.push(`molecules: meant ${missing.join(' ') || '-'} | read ${extra.join(' ') || '-'}`);
  }
  if (!same(got.hbonds, meant.hbonds) && !(lost.includes('hydrogen bonds') && !got.hbonds.length)) out.push(`hydrogen bonds: meant [${meant.hbonds}] read [${got.hbonds}]`);
  if (!same(got.units, meant.units) && !(lost.includes('repeating units (n)') && !got.units.length)) out.push(`repeating units: meant [${meant.units}] read [${got.units}]`);
  return out;
}
// What of the meaning a reading lacks that lostIn declares (shown, not counted)
function declared(got, meant, lost) {
  if (got.error) return [];
  const out = [];
  if (lost.includes('dative bonds') && !same(got.frags, meant.frags)) out.push('dative');
  if (lost.includes('hydrogen bonds') && meant.hbonds.length && !got.hbonds.length) out.push('hbond');
  if (lost.includes('repeating units (n)') && meant.units.length && !got.units.length) out.push('units');
  return out;
}

// --- the drawings ---

function drawing(name, build) {
  const doc = emptyDoc();
  const A = (x, y, el = 'C', extra = {}) => addAtom(doc, x, y, el, extra).id;
  const B = (a, b, order = 1, extra = {}) => addBond(doc, a, b, order, extra).id;
  build({ doc, A, B });
  return { name, doc };
}
const H = 0.866;
const BUILT = [
  drawing('charges', ({ A, B }) => {
    A(0, 0, 'N', { charge: 1 }); A(1.5, 0, 'Cl', { charge: -1 });
    const c1 = A(0, 3), c2 = A(H, 2.5), o1 = A(H, 1.5, 'O'), o2 = A(2 * H, 3, 'O', { charge: -1 });
    B(c1, c2); B(c2, o1, 2); B(c2, o2);
    const m = A(4, 0), n = A(4 + H, -0.5, 'N', { charge: 1 }), oa = A(4 + H, -1.5, 'O'), ob = A(4 + 2 * H, 0, 'O', { charge: -1 });
    B(m, n); B(n, oa, 2); B(n, ob);
  }),
  drawing('isotopes', ({ A, B }) => {
    const c = A(0, 0, 'C', { isotope: 13 }), o = A(1, 0, 'O'); B(c, o);
    const w = A(4, 0, 'O'), d1 = A(4 + H, 0.5, 'H', { isotope: 2, letter: true }), d2 = A(4 - H, 0.5, 'H', { isotope: 2, letter: true }); B(w, d1); B(w, d2);
    const c2 = A(7, 0), cl = A(8, 0, 'Cl', { isotope: 37 }); B(c2, cl);
  }),
  drawing('radicals', ({ A, B }) => {
    A(0, 0, 'C', { radical: 2 }); // methyl radical
    A(2, 0, 'C', { radical: 1 }); // singlet carbene
    A(4, 0, 'C', { radical: 3 }); // triplet carbene
    A(6, 0, 'N', { radical: 4 }); // atomic N, three unpaired
    const n = A(8, 0, 'N'), o = A(9, 0, 'O', { radical: 2 }), c1 = A(8 - H, 0.5), c2 = A(8 - H, -0.5); B(n, o); B(n, c1); B(n, c2); // dimethyl nitroxide
    const x = A(0, 3), y = A(1, 3, 'C', { radical: 2 }); B(x, y); // ethyl radical
  }),
  drawing('h-counts', ({ A, B }) => {
    const c1 = A(0, 0), c2 = A(1, 0, 'C', { hCount: 2 }); B(c1, c2); // CH3-CH2 (by hand: a radical by valence)
    A(3, 0, 'B', { charge: -1, hCount: 4 }); // BH4-
    const n = A(5, 0, 'N', { hCount: 0 }), m = A(6, 0); B(n, m); // CH3-N with no H
    const s = A(8, 0, 'S', { hCount: 2 }), so = A(9, 0, 'O'); B(s, so, 2); // H2S=O
    const p = A(11, 0, 'P', { hCount: 1 }), po = A(12, 0, 'O'), pm = A(11, 1), pn = A(11, -1); B(p, po, 2); B(p, pm); B(p, pn); // HP(=O)(C)C
    const o = A(14, 0, 'O', { hCount: 3, charge: 1 }); // H3O+
  }),
  drawing('wedges', ({ A, B }) => {
    // (R or S)-butan-2-ol, wedge from the stereocentre; the same with the wedge's narrow end at O; and with a hash
    for (const [k, kind, reversed] of [[0, 'wedge', false], [1, 'wedge', true], [2, 'hash', false], [3, 'hash', true]]) {
      const y = k * 3;
      const c1 = A(0, y), c2 = A(H, y - 0.5), c3 = A(2 * H, y), c4 = A(3 * H, y - 0.5), o = A(H, y - 1.5, 'O');
      B(c1, c2); B(c2, c3); B(c3, c4);
      if (reversed) B(o, c2, 1, { stereo: kind }); else B(c2, o, 1, { stereo: kind });
    }
    // a wedge to a drawn H; and 2,3-dibromobutane with a wedge and a hash
    const y = 12;
    const c1 = A(0, y), c2 = A(H, y - 0.5), c3 = A(2 * H, y), c4 = A(3 * H, y - 0.5), cl = A(H, y - 1.5, 'Cl'), h = A(H + 0.8, y - 1.1, 'H');
    B(c1, c2); B(c2, c3); B(c3, c4); B(c2, h, 1, { stereo: 'wedge' }); B(c2, cl);
    const y2 = 15;
    const d1 = A(0, y2), d2 = A(H, y2 - 0.5), d3 = A(2 * H, y2), d4 = A(3 * H, y2 - 0.5), br1 = A(H, y2 - 1.5, 'Br'), br2 = A(2 * H, y2 + 1, 'Br');
    B(d1, d2); B(d2, d3); B(d3, d4); B(d2, br1, 1, { stereo: 'wedge' }); B(d3, br2, 1, { stereo: 'hash' });
  }),
  drawing('e-z', ({ A, B }) => {
    const z = [A(0, 0), A(H, -0.5), A(H + 1, -0.5), A(2 * H + 1, 0)]; B(z[0], z[1]); B(z[1], z[2], 2); B(z[2], z[3]); // Z
    const e = [A(0, 3), A(H, 2.5), A(H + 1, 2.5), A(2 * H + 1, 2)]; B(e[0], e[1]); B(e[1], e[2], 2); B(e[2], e[3]); // E
    const w = [A(0, 6), A(H, 5.5), A(H + 1, 5.5), A(2 * H + 1, 6)]; B(w[1], w[0], 1, { stereo: 'wavy' }); B(w[1], w[2], 2); B(w[2], w[3]); // either
    const o = [A(5, 0), A(5 + H, -0.5), A(5 + H + 1, -0.5, 'N'), A(5 + 2 * H + 1, 0, 'O')]; B(o[0], o[1]); B(o[1], o[2], 2); B(o[2], o[3]); // an oxime, Z
  }),
  drawing('abbreviations', ({ A, B }) => {
    let x = 0;
    for (const label of ['Ph', 'OMe', 'Boc', 'CO2Et', 'NO2', 'CF3', 'OAc', 'TMS', 'Ts', 'CN', 'OTf', 'tBu', 'R']) {
      const c1 = A(x, 0), c2 = A(x + H, -0.5), g = A(x + 2 * H, 0, '*', { alias: label });
      B(c1, c2); B(c2, g);
      x += 4;
    }
    const n = A(x, 0, 'N'), boc = A(x + H, -0.5, '*', { alias: 'Boc' }), c = A(x - H, -0.5); B(n, boc); B(n, c); // a Boc on N
    const ph = A(x + 4, 0, '*', { alias: 'Ph' }), ts = A(x + 5, 0, '*', { alias: 'Ts' }); B(ph, ts); // Ph-Ts (two labels)
  }),
  drawing('dative', ({ A, B }) => {
    const n = A(0, 0, 'N'), b = A(1, 0, 'B'); B(n, b, 1, { kind: 'dative' }); // H3N->BH3
    const pt = A(5, 0, 'Pt'), cl1 = A(6, 0, 'Cl'), cl2 = A(5, 1, 'Cl'), n1 = A(4, 0, 'N'), n2 = A(5, -1, 'N');
    B(pt, cl1); B(pt, cl2); B(n1, pt, 1, { kind: 'dative' }); B(n2, pt, 1, { kind: 'dative' }); // cisplatin
    const ni = A(9, 0, 'Ni'); for (const [x, y] of [[10, 0], [8, 0], [9, 1], [9, -1]]) { const c = A(x, y, 'C', { charge: -1 }), o = A(x + (x - 9), y + (y - 0) * 1, 'O', { charge: 1 }); B(c, o, 3); B(c, ni, 1, { kind: 'dative' }); } // Ni(CO)4, C- -> Ni
  }),
  drawing('dative-hcount', ({ A, B }) => {
    // H counts set by hand on donors and acceptors: H3N->PtH(Cl)2, H2O->Fe2+ (no H on Fe, set)
    const n = A(0, 0, 'N', { hCount: 3 }), pt = A(1, 0, 'Pt', { hCount: 1 }); B(n, pt, 1, { kind: 'dative' }); B(pt, A(2, 0, 'Cl')); B(pt, A(1, 1, 'Cl'));
    const o = A(4, 0, 'O', { hCount: 2 }), fe = A(5, 0, 'Fe', { charge: 2, hCount: 0 }); B(o, fe, 1, { kind: 'dative' });
  }),
  drawing('hbond', ({ A, B }) => {
    const o1 = A(0, 0, 'O'), h1 = A(1, 0, 'H'), o2 = A(2, 0, 'O'); B(o1, h1); B(h1, o2, 1, { kind: 'hbond' });
    const n = A(4, 0, 'N'), h = A(5, 0, 'H'), oc = A(6, 0, 'O'), c = A(7, 0, 'C'); B(n, h); B(h, oc, 1, { kind: 'hbond' }); B(oc, c, 2);
  }),
  drawing('polyethylene', ({ doc, A, B }) => {
    const c = [A(0, 0), A(H, -0.5), A(2 * H, 0), A(3 * H, -0.5)];
    B(c[0], c[1]); B(c[1], c[2]); B(c[2], c[3]);
    addRepeatingUnit(doc, [c[1], c[2]], 'n');
  }),
  drawing('poly-ester', ({ doc, A, B }) => {
    // -[O-C(=O)-CH2]n- with ends H and CH3, a unit with a label in it
    const o = A(0, 0, 'O'), c = A(H, -0.5), oo = A(H, -1.5, 'O'), ch = A(2 * H, 0), me = A(3 * H, -0.5, '*', { alias: 'OMe' }), h = A(-H, -0.5);
    B(h, o); B(o, c); B(c, oo, 2); B(c, ch); B(ch, me);
    addRepeatingUnit(doc, [o, c, oo, ch], 'm');
  }),
  drawing('metals', ({ A, B }) => {
    const c = A(0, 0), mg = A(1, 0, 'Mg'), br = A(2, 0, 'Br'); B(c, mg); B(mg, br); // CH3MgBr
    A(4, 0, 'Na', { charge: 1 }); const a1 = A(5, 0), a2 = A(5 + H, -0.5), a3 = A(5 + H, -1.5, 'O'), a4 = A(5 + 2 * H, 0, 'O', { charge: -1 }); B(a1, a2); B(a2, a3, 2); B(a2, a4); // sodium acetate
    const zn = A(9, 0, 'Zn'), z1 = A(8, 0), z2 = A(10, 0); B(z1, zn); B(zn, z2); // Me2Zn
    const fe = A(12, 0, 'Fe', { charge: 3 }); A(13, 0, 'Cl', { charge: -1 }); A(13, 1, 'Cl', { charge: -1 }); A(13, -1, 'Cl', { charge: -1 }); void fe;
    const li = A(15, 0, 'Li'), bu = A(16, 0); B(li, bu); // MeLi
  }),
  drawing('reaction-dative', ({ doc, A, B }) => {
    // PtCl4 2- + 2 NH3 -> cisplatin + 2 Cl-: the product with dative bonds
    const pt = A(0, 0, 'Pt', { charge: 2 }); for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) B(A(x, y, 'Cl', { charge: -1 }), pt, 1, { kind: 'dative' });
    addPlus(doc, 2, 0); A(3, 0, 'N');
    addArrow(doc, 4, 0, 7, 0);
    const p = A(9, 0, 'Pt'); B(p, A(10, 0, 'Cl')); B(p, A(9, 1, 'Cl')); B(A(8, 0, 'N'), p, 1, { kind: 'dative' }); B(A(9, -1, 'N'), p, 1, { kind: 'dative' });
    addPlus(doc, 11, 0); A(12, 0, 'Cl', { charge: -1 });
  }),
  drawing('reaction-hbond', ({ doc, A, B }) => {
    // an acid and water held by a hydrogen bond -> ions
    const c = A(0, 0), o1 = A(H, -0.5, 'O'), o2 = A(0, 1, 'O'), h = A(2 * H, 0, 'H'), w = A(3 * H, -0.5, 'O');
    B(c, o1); B(c, o2, 2); B(o1, h); B(h, w, 1, { kind: 'hbond' });
    addArrow(doc, 4, 0, 7, 0);
    const c2 = A(8, 0), p1 = A(8 + H, -0.5, 'O', { charge: -1 }), p2 = A(8, 1, 'O'); B(c2, p1); B(c2, p2, 2);
    addPlus(doc, 10, 0); A(11, 0, 'O', { charge: 1 });
  }),
  drawing('retro-single', ({ doc, A, B }) => {
    // ethyl acetate => ethanol + acetic acid (a retrosynthetic arrow: the target on the left)
    const p = [A(0, 0), A(H, -0.5), A(H, -1.5, 'O'), A(2 * H, 0, 'O'), A(3 * H, -0.5), A(4 * H, 0)];
    B(p[0], p[1]); B(p[1], p[2], 2); B(p[1], p[3]); B(p[3], p[4]); B(p[4], p[5]);
    addArrow(doc, 5, 0, 8, 0, 'retro');
    const e1 = A(9, 0), e2 = A(9 + H, -0.5), e3 = A(9 + 2 * H, 0, 'O'); B(e1, e2); B(e2, e3);
    addPlus(doc, 12, 0);
    const a1 = A(13, 0), a2 = A(13 + H, -0.5), a3 = A(13 + H, -1.5, 'O'), a4 = A(13 + 2 * H, 0, 'O'); B(a1, a2); B(a2, a3, 2); B(a2, a4);
  }),
  drawing('reaction-agent', ({ doc, A, B }) => {
    // ethanol + acetic acid -> ethyl acetate + water, H2SO4 on the arrow
    const e1 = A(0, 0), e2 = A(H, -0.5), e3 = A(2 * H, 0, 'O'); B(e1, e2); B(e2, e3);
    addPlus(doc, 3, 0);
    const a1 = A(4, 0), a2 = A(4 + H, -0.5), a3 = A(4 + H, -1.5, 'O'), a4 = A(4 + 2 * H, 0, 'O'); B(a1, a2); B(a2, a3, 2); B(a2, a4);
    const arrow = addArrow(doc, 7, 0, 11, 0);
    const s = A(9, -1, 'S', { arrow: arrow.id, arrowSlot: 'above' }), so = [A(10, -1, 'O', { arrow: arrow.id }), A(8, -1, 'O', { arrow: arrow.id }), A(9, -2, 'O', { arrow: arrow.id }), A(9, 0, 'O', { arrow: arrow.id })];
    B(s, so[0]); B(s, so[1]); B(s, so[2], 2); B(s, so[3], 2);
    const p = [A(12, 0), A(12 + H, -0.5), A(12 + H, -1.5, 'O'), A(12 + 2 * H, 0, 'O'), A(12 + 3 * H, -0.5), A(12 + 4 * H, 0)];
    B(p[0], p[1]); B(p[1], p[2], 2); B(p[1], p[3]); B(p[3], p[4]); B(p[4], p[5]);
    addPlus(doc, 17, 0);
    A(18, 0, 'O');
  }),
];

// --- the run ---

async function loadExamples() {
  const dir = R + 'ui/examples/';
  const out = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.olom')).sort()) {
    const { doc } = await readAny(readFileSync(dir + f, 'utf8'), { name: f, settings: S });
    if (doc.atoms.size) out.push({ name: f.replace(/\.olom$/, ''), doc });
  }
  return out;
}

// drawings as olomol reads a SMILES typed or pasted (its H counts as RDKit's molfile sets them: Pt with none)
const FROM_SMILES = { 'cisplatin-smiles': '[NH3]->[Pt](Cl)(Cl)<-[NH3]' };
const typed = [];
for (const [name, smiles] of Object.entries(FROM_SMILES)) typed.push({ name, doc: (await readAny(smiles, { name: 'typed.smi', settings: S })).doc });

const drawings = [...(await loadExamples()), ...BUILT, ...typed].filter((d) => !filter || d.name.includes(filter));
if (OUT) mkdirSync(OUT, { recursive: true });
const tally = { ok: 0, declared: 0, bad: 0 };
const problems = [];

for (const { name, doc } of drawings) {
  const meant = await meaning(doc);
  const plain = await meaning(doc, { dative: false });
  if (meant.error) {
    const line = `${name.padEnd(20)} (all)  DIFF  olomol's own meaning unreadable by RDKit: ${meant.error}`;
    console.log(line); problems.push(line); tally.bad++;
    continue;
  }
  const roles = await rolesMeant(doc);
  const rolesPlain = await rolesMeant(doc, { dative: false });
  const scheme = schemeOf(doc);
  for (const format of FORMATS) {
    let text;
    try {
      text = await writeAs(doc, format, null, S);
    } catch (e) {
      const line = `${name.padEnd(20)} ${format.padEnd(6)} EXPORT FAILED: ${String(e?.message ?? e).slice(0, 100)}`;
      console.log(line); problems.push(line); tally.bad++;
      continue;
    }
    if (OUT) writeFileSync(`${OUT}/${name}.${EXT[format]}`, text);
    const lost = lostIn(doc, format);
    const results = {};
    if (format === 'inchi') {
      const want = inchiOf(plain.frags.join('.'));
      const exported = text.trim();
      results.rdkit = !exported && doc.atoms.size ? [`InChI: an empty file for ${plain.frags.length} molecules`] : exported === want ? [] : [`InChI: meant ${want} | written ${exported}`];
      try {
        const got = inchiOf(await convert(exported, 'smiles'));
        results.indigo = got === exported ? [] : [`Indigo read ${got}`];
      } catch (e) { results.indigo = ['Indigo: ' + String(e?.message ?? e).slice(0, 100)]; }
    } else {
      if (['mol', 'sdf', 'rxn'].includes(format)) results.rdkit = rdkitFile(text);
      if (format === 'smiles') results.rdkit = rdkitSmiles(text);
      results.indigo = await indigoFile(text, format);
    }
    try {
      const { doc: back } = await readAny(text, { name: `export.${EXT[format]}`, settings: S });
      const again = await meaning(back);
      results.olomol = format === 'inchi' ? (inchiOf(again.frags.join('.')) === text.trim() ? [] : [`olomol read ${inchiOf(again.frags.join('.'))}`]) : again;
    } catch (e) { results.olomol = { error: 'olomol: ' + String(e?.message ?? e).slice(0, 100) }; }
    // (one reaction in the file for a scheme, unless the format is declared to lose arrows)
    // (written as one reaction: one reaction arrow, the format holds one; then any other arrow must be declared lost)
    const oneReaction = (format === 'rxn' || format === 'mol' || format === 'smiles') && writtenAsReaction(doc, null, format);
    const verdicts = Object.entries(results).map(([reader, got]) => {
      const diff = Array.isArray(got) ? got : [...differences(got, meant, plain, lost), ...(oneReaction ? roleDifferences(got, lost.includes('dative bonds') ? rolesPlain : roles) : [])];
      const decl = Array.isArray(got) ? [] : declared(got, meant, lost);
      return { reader, diff, decl, note: got.note };
    });
    if (oneReaction && scheme && !lost.includes("arrows other than the reaction's")) verdicts.push({ reader: 'scheme', diff: [scheme], decl: [] });
    const bad = verdicts.filter((v) => v.diff.length);
    const decl = [...new Set(verdicts.flatMap((v) => v.decl))];
    const status = bad.length ? 'DIFF' : decl.length ? 'ok (declared lost: ' + decl.join(', ') + ')' : 'ok';
    tally[bad.length ? 'bad' : decl.length ? 'declared' : 'ok']++;
    const readers = verdicts.map((v) => `${v.reader}${v.diff.length ? '✗' : '✓'}${v.note ? '(' + v.note + ')' : ''}`).join(' ');
    const line = `${name.padEnd(20)} ${format.padEnd(6)} ${status.padEnd(4)}  [${readers}]`;
    console.log(line);
    for (const v of bad) {
      for (const d of v.diff) console.log(`      ${v.reader}: ${d}`);
      problems.push(`${name} ${format} ${v.reader}: ${v.diff.join('; ')}`);
    }
    if (verbose && results.rdkit?.roles) console.log('      rdkit roles', JSON.stringify(results.rdkit.roles));
    if (verbose && results.indigo?.roles) console.log('      indigo roles', JSON.stringify(results.indigo.roles));
  }
}
console.log(`\n${drawings.length} drawings x ${FORMATS.length} formats: ${tally.ok} ok, ${tally.declared} ok with declared losses, ${tally.bad} differ`);
process.exit(tally.bad ? 1 : 0);
