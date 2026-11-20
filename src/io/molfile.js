// MDL molfiles (V2000, reading also V3000): atoms with charges, isotopes and
// radicals, bonds with wedges. Molfiles have y up and bonds about 1.5 long;
// the drawing has y down and bonds 1 long, so coordinates are flipped and
// scaled. Several molecules go into one molfile as separate fragments.
import { isElement, SYMBOLS } from '../chem/elements.js';
import { newmanStereo } from '../chem/newman.js';
import { projectionStereo } from '../chem/projections.js';
import { electronsOf } from '../chem/valence.js';
import { addAtom, addBond, addRepeatingUnit, bondsByAtom, emptyDoc, isCovalent, repeatingUnits } from '../model/doc.js';
import { t } from '../i18n/i18n.js';

export const MOLFILE_BOND_LENGTH = 1.5;
const STEREO_OUT = { wedge: 1, hash: 6, wavy: 4 };
const STEREO_IN = { 1: 'wedge', 6: 'hash', 4: 'wavy' };
const CHARGE_CODES = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 };
const BOND_KINDS_IN = { 9: 'dative', 10: 'hbond' };

// The median bond length of parsed atoms and bonds, 1 if there are no bonds.
function medianLength(atoms, bonds) {
  const lengths = bonds.map(({ a, b }) => Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y)).filter((l) => l > 1e-4).sort((p, q) => p - q);
  return lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1;
}

// Parses a molfile into { atoms: [{ el, x, y, charge, isotope, radical,
// valence }], bonds: [{ a, b, order, stereo }] } (0-based, file units, y up).
export function parseMolfile(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const countsAt = lines.findIndex((line, i) => i >= 3 && /V[23]000/.test(line));
  const counts = lines[countsAt === -1 ? 3 : countsAt] ?? '';
  if (counts.includes('V3000')) return parseV3000(lines);
  const start = countsAt === -1 ? 3 : countsAt;
  const nAtoms = parseInt(counts.slice(0, 3), 10);
  const nBonds = parseInt(counts.slice(3, 6), 10);
  if (!(nAtoms >= 0)) throw new Error(t('not a molfile'));
  const atoms = lines.slice(start + 1, start + 1 + nAtoms).map((line) => {
    const valence = parseInt(line.slice(48, 51), 10) || 0;
    const chargeCode = parseInt(line.slice(36, 39), 10) || 0;
    return {
      x: parseFloat(line.slice(0, 10)),
      y: parseFloat(line.slice(10, 20)),
      el: line.slice(31, 34).trim(),
      charge: CHARGE_CODES[chargeCode] ?? 0,
      radical: chargeCode === 4 ? 2 : 0,
      isotope: null,
      valence,
    };
  });
  const bonds = lines.slice(start + 1 + nAtoms, start + 1 + nAtoms + nBonds).map((line) => {
    const [order, code] = [parseInt(line.slice(6, 9), 10), parseInt(line.slice(9, 12), 10)];
    return {
      a: parseInt(line.slice(0, 3), 10) - 1,
      b: parseInt(line.slice(3, 6), 10) - 1,
      order,
      stereo: STEREO_IN[code] ?? '',
      ...(order === 2 && code === 3 && { either: true }),
    };
  });
  eitherAsWavy(bonds);
  let chargesReset = false;
  const properties = lines.slice(start + 1 + nAtoms + nBonds);
  properties.forEach((line, k) => {
    // "A  nnn" and on the next line a label: the atom is shown as that label (R, Nu, Ph)
    const alias = line.match(/^A\s+(\d+)\s*$/);
    if (alias && atoms[alias[1] - 1] && properties[k + 1]?.trim()) Object.assign(atoms[alias[1] - 1], { el: '*', alias: properties[k + 1].trim() });
  });
  genericAtoms(atoms);
  // atom lists (an atom "L": M  ALS aaannn e then the elements, F one of them, T none of them): a label [C,N], ![C,N]
  for (const line of properties) {
    const list = /^M {2}ALS ([ \d]{3})([ \d]{3}) ([TF]) (.*)$/.exec(line);
    const atom = list && atoms[Number(list[1]) - 1];
    if (!atom) continue;
    const elements = list[4].match(/.{1,4}/g)?.map((e) => e.trim()).filter(Boolean).slice(0, Number(list[2])) ?? [];
    if (elements.length) Object.assign(atom, { el: '*', alias: `${list[3] === 'T' ? '!' : ''}[${elements.join(',')}]` });
  }
  // Marvin's query on an atom (M  MRV SMA aaa [#6,#7;…]): its elements as an atom list, as Indigo reads it; another
  // query as its text, a label
  for (const line of properties) {
    const query = /^M {2}MRV SMA ([ \d]{3}) (\S+)/.exec(line);
    const atom = query && atoms[Number(query[1]) - 1];
    if (!atom) continue;
    const numbers = /^\[((?:#\d+,)*#\d+)[;\]]/.exec(query[2]);
    const elements = numbers ? numbers[1].split(',').map((n) => SYMBOLS[Number(n.slice(1)) - 1]) : null;
    Object.assign(atom, { el: '*', alias: elements?.every(Boolean) ? (elements.length > 1 ? `[${elements.join(',')}]` : elements[0]) : query[2] });
    if (elements?.length === 1) Object.assign(atom, { el: elements[0], alias: null });
  }
  // repeating units (SRU sgroups): their atoms and letter (M  STY, M  SAL, M  SMT)
  const sgroups = new Map();
  for (const line of properties) {
    const [tag, kind, ...rest] = line.split(/\s+/);
    if (tag !== 'M') continue;
    if (kind === 'STY') for (let k = 1; k + 1 < rest.length; k += 2) if (rest[k + 1] === 'SRU') sgroups.set(rest[k], { atoms: [], sub: 'n' });
    if (kind === 'SAL' && sgroups.has(rest[0])) sgroups.get(rest[0]).atoms.push(...rest.slice(2).map((n) => Number(n) - 1));
    if (kind === 'SMT' && sgroups.has(rest[0])) sgroups.get(rest[0]).sub = line.slice(11).trim() || 'n';
  }
  for (const line of properties) {
    const kind = line.slice(3, 6);
    if (!line.startsWith('M  ') || !['CHG', 'RAD', 'ISO'].includes(kind)) continue;
    const values = line.slice(9).trim().split(/\s+/).map(Number);
    if (kind === 'CHG' && !chargesReset) {
      // "M  CHG" replaces all charges of the atom block
      atoms.forEach((atom) => {
        atom.charge = 0;
      });
      chargesReset = true;
    }
    for (let k = 0; k + 1 < values.length; k += 2) {
      const atom = atoms[values[k] - 1];
      if (!atom) continue;
      if (kind === 'CHG') atom.charge = values[k + 1];
      if (kind === 'RAD') atom.radical = values[k + 1];
      if (kind === 'ISO') atom.isotope = values[k + 1];
    }
  }
  return { atoms, bonds, units: [...sgroups.values()] };
}

// Atoms whose symbol is no element, without an alias: D and T, as some programs write them, hydrogen 2 and 3;
// other symbols (R#, A, Q) labels. In place.
function genericAtoms(atoms) {
  for (const atom of atoms) {
    if (!atom.alias && (atom.el === 'D' || atom.el === 'T')) Object.assign(atom, { el: 'H', isotope: atom.el === 'D' ? 2 : 3, letter: true });
    else if (!atom.alias && !isElement(atom.el)) Object.assign(atom, { el: '*', alias: atom.el === 'R#' ? 'R' : atom.el });
  }
}

function parseV3000(lines) {
  // "M  V30 ..." lines; a trailing "-" continues a line on the next one.
  const v30 = lines.filter((line) => line.startsWith('M  V30 ')).map((line) => line.slice(7)).join('\n').replace(/-\n/g, '').split('\n');
  const block = (name) => {
    const begin = v30.indexOf(`BEGIN ${name}`);
    return begin === -1 ? [] : v30.slice(begin + 1, v30.indexOf(`END ${name}`));
  };
  const property = (parts, name) => parts.find((p) => p.startsWith(`${name}=`))?.slice(name.length + 1);
  const atoms = block('ATOM').map((line) => {
    const [, el, x, y, , , ...rest] = line.trim().split(/\s+/);
    return {
      x: parseFloat(x),
      y: parseFloat(y),
      el,
      charge: Number(property(rest, 'CHG') ?? 0),
      radical: Number(property(rest, 'RAD') ?? 0),
      isotope: property(rest, 'MASS') ? Number(property(rest, 'MASS')) : null,
      valence: Number(property(rest, 'VAL') ?? 0),
    };
  });
  const cfg = { 1: 'wedge', 3: 'hash', 2: 'wavy' };
  const bonds = block('BOND').map((line) => {
    const [, order, a, b, ...rest] = line.trim().split(/\s+/);
    return { a: parseInt(a, 10) - 1, b: parseInt(b, 10) - 1, order: parseInt(order, 10), stereo: cfg[property(rest, 'CFG')] ?? '', ...(order === '2' && property(rest, 'CFG') === '2' && { either: true }) };
  });
  eitherAsWavy(bonds);
  genericAtoms(atoms);
  // repeating units: "1 SRU 0 ATOMS=(2 2 3) ... LABEL=n"
  const units = block('SGROUP').map((line) => line.trim().split(/\s+/)).filter((parts) => parts[1] === 'SRU').map((parts) => {
    const list = parts.join(' ').match(/ATOMS=\((\d+)((?:\s+\d+)*)\)/);
    return { atoms: list ? list[2].trim().split(/\s+/).map((n) => Number(n) - 1) : [], sub: property(parts, 'LABEL') || 'n' };
  });
  return { atoms, bonds, units };
}

// A double bond marked "either" (E or Z not said: crossed in some programs, RDKit's for a SMILES without / or \)
// as a drawing says it: a wavy bond beside it, from its atom to a neighbour, on a single bond in no ring if there is
// one (the one to the neighbour with the fewest bonds; not to an atom of another double bond that can be E or Z,
// unless that one's is not said either). Without one, the double bond's E or Z would be read from how it is drawn. In place; a
// double bond with no such neighbour stays as it is.
export function eitherAsWavy(bonds) {
  const near = (atom, except) => bonds.filter((b) => b !== except && (b.a === atom || b.b === atom));
  // the smallest ring through a bond: its size, or 0 for none
  const ringSize = (bond) => {
    const seen = new Map([[bond.a, 1]]);
    const queue = [bond.a];
    while (queue.length) {
      const at = queue.shift();
      for (const b of near(at, bond)) {
        const other = b.a === at ? b.b : b.a;
        if (other === bond.b) return seen.get(at) + 1;
        if (!seen.has(other)) { seen.set(other, seen.get(at) + 1); queue.push(other); }
      }
    }
    return 0;
  };
  const inRing = (bond) => ringSize(bond) > 0;
  // a double bond that can be E or Z: another neighbour at each end, in no ring smaller than 8 (not a C=O, nor a
  // ring's own double bond)
  const canBeEZ = (b) => b.order === 2 && near(b.a, b).length > 0 && near(b.b, b).length > 0 && !(ringSize(b) && ringSize(b) < 8);
  const open = new Set(bonds.filter((b) => b.either));
  for (const double of open) {
    // (not to an atom of another double bond whose E or Z may be said: RDKit would take it as not known too)
    // (a ring bond only where there is no other: an exocyclic C=C on a ring)
    const choices = [double.a, double.b].flatMap((atom) => near(atom, double).filter((b) => b.order === 1 && !b.stereo).map((b) => ({ b, atom, other: b.a === atom ? b.b : b.a, ring: inRing(b) })))
      .filter(({ other }) => !near(other).some((b) => canBeEZ(b) && !open.has(b)));
    choices.sort((p, q) => Number(p.ring) - Number(q.ring) || near(p.other).length - near(q.other).length);
    const [pick] = choices;
    delete double.either;
    if (!pick) continue;
    // (the wavy bond's narrow end at the double bond: its other atom's R/S stays as it is)
    Object.assign(pick.b, { a: pick.atom, b: pick.other, stereo: 'wavy' });
  }
}

// Adds a parsed molfile to `doc` (default: a new one), scaled to bond length
// 1 and flipped to y down, centred on (cx, cy) if given. Returns { doc,
// atomIds } (atomIds[k]: the id of the molfile's atom k).
export function addParsed(parsed, doc = emptyDoc(), centre = null) {
  const { atoms, bonds } = parsed;
  const scale = 1 / (medianLength(atoms, bonds) || 1);
  let [ox, oy] = [0, 0];
  if (centre && atoms.length) {
    const xs = atoms.map((a) => a.x * scale);
    const ys = atoms.map((a) => -a.y * scale);
    ox = centre[0] - (Math.min(...xs) + Math.max(...xs)) / 2;
    oy = centre[1] - (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  const atomIds = atoms.map((atom) => addAtom(doc, atom.x * scale + ox, -atom.y * scale + oy, atom.el, {
    alias: atom.alias ?? null,
    charge: atom.charge,
    isotope: atom.isotope,
    ...(atom.letter && { letter: true }),
    radical: atom.radical,
  }).id);
  for (const bond of bonds) {
    // (types 9 and 10: dative, from the first atom, and hydrogen bonds; others not 1–4 ("any" and the like) single)
    const kind = BOND_KINDS_IN[bond.order];
    const order = bond.order >= 1 && bond.order <= 4 ? bond.order : 1;
    addBond(doc, atomIds[bond.a], atomIds[bond.b], order, { stereo: order === 1 && kind !== 'hbond' ? bond.stereo : '', ...(kind && { kind }) });
  }
  for (const unit of parsed.units ?? []) addRepeatingUnit(doc, unit.atoms.map((k) => atomIds[k]).filter((id) => id !== undefined), unit.sub);
  // a valence set in the file means "this many hydrogens": keep it
  const byAtom = bondsByAtom(doc);
  atoms.forEach((atom, k) => {
    if (!atom.valence) return;
    // (a dative bond counts at its acceptor only, as RDKit writes the field: N->[Pt] is Pt's, not N's; hydrogen
    // bonds don't count)
    const bondOrder = byAtom.get(atomIds[k]).filter((b) => isCovalent(b) || (b.kind === 'dative' && b.b === atomIds[k])).reduce((sum, b) => sum + b.order, 0);
    doc.atoms.get(atomIds[k]).hCount = atom.valence === 15 ? 0 : Math.max(0, atom.valence - bondOrder);
  });
  return { doc, atomIds };
}

export const readMolfile = (text, doc, centre) => addParsed(parseMolfile(text), doc, centre);

const pad = (value, width) => String(value).padStart(width);

// Property lines ("M  CHG" etc.) for [[atomIndex, value], ...], 8 per line.
function propertyLines(kind, pairs) {
  const lines = [];
  for (let i = 0; i < pairs.length; i += 8) {
    const chunk = pairs.slice(i, i + 8);
    lines.push(`M  ${kind}${pad(chunk.length, 3)}${chunk.map(([atom, value]) => `${pad(atom + 1, 4)}${pad(value, 4)}`).join('')}`);
  }
  return lines;
}

// A V2000 molfile of the atoms with these ids (default: all) and the bonds
// between them. Returns { molfile, atomIds } (atomIds[k]: id of atom k).
// For the layout engines: `partial` puts partial bonds (forming, breaking)
// in as "any" bonds (type 8), so a transition state stays in one piece;
// `dative`: 'any' puts dative bonds in so too (a ring closed by N→B stays a
// ring), 'charged' as single bonds with the donor + and the acceptor −
// (N⁺–B⁻: what a 3D builder can read). `sided`: for a 3D builder, the drawn
// hydrogens of a carbon with a wedge or hashed wedge as ²H and ³H, so that
// its wedge counts even where it is no stereocentre (a CH2: the axial H of a
// chair or a Newman projection stays the axial one). `kinds` (for a file, for
// other programs): dative bonds as type 9, from the donor, and hydrogen bonds
// as type 10 (RDKit reads 10 as a single bond). `units`:
// repeating units (brackets with n) as SRU sgroups.
export function writeMolfile(doc, ids = null, name = '', { partial = false, dative = null, sided = false, kinds = null, units = false } = {}) {
  const wanted = ids ? new Set(ids) : null;
  const atoms = [...doc.atoms.values()].filter((atom) => !wanted || wanted.has(atom.id));
  const index = new Map(atoms.map((atom, k) => [atom.id, k]));
  // partial, hydrogen and dative bonds have no place in a V2000 molfile
  const kept = (bond) => isCovalent(bond) || (partial && bond.kind === 'partial') || ((dative || kinds) && bond.kind === 'dative') || (kinds && bond.kind === 'hbond');
  const bonds = [...doc.bonds.values()].filter((bond) => index.has(bond.a) && index.has(bond.b) && kept(bond));
  const charge = new Map(atoms.map((atom) => [atom.id, atom.charge ?? 0]));
  if (dative === 'charged') {
    for (const bond of bonds.filter((b) => b.kind === 'dative')) {
      charge.set(bond.a, charge.get(bond.a) + 1);
      charge.set(bond.b, charge.get(bond.b) - 1);
    }
  }
  const typeOf = (bond) => (bond.kind === 'dative' && dative === 'charged' ? 1 : kinds && bond.kind === 'dative' ? 9 : kinds && bond.kind === 'hbond' ? 10 : bond.kind ? 8 : bond.order);
  if (atoms.length > 999 || bonds.length > 999) throw new Error(t('more than 999 atoms or bonds: too large for a V2000 molfile'));
  const byAtom = bondsByAtom(doc);
  const lines = [name, '  olomol    2D', '', `${pad(atoms.length, 3)}${pad(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`];
  const s = MOLFILE_BOND_LENGTH;
  // Newman projections: drawn as the molecule they show, turned a little, with wedges for their R/S
  const newman = newmanStereo(doc, atoms.map((atom) => atom.id));
  const place = (atom) => newman?.at.get(atom.id) ?? [atom.x, atom.y];
  for (const atom of atoms) {
    let valence = 0;
    // (three or four unpaired electrons, a Lewis symbol's ·N̈·: no radical code for them, so the atom with
    // its H counted, without them; read back, the electrons left over are unpaired: [N])
    let hydrogens = atom.hCount ?? (atom.radical > 3 ? electronsOf(atom, byAtom.get(atom.id)).hydrogens : null);
    // (an atom on a dative bond with the hydrogens it has anyway: no valence field, which RDKit and Indigo count
    // that bond in differently, RDKit at its acceptor, Indigo at neither end: cisplatin's Pt became PtH2)
    if (kinds && hydrogens !== null && byAtom.get(atom.id).some((b) => b.kind === 'dative') && electronsOf({ ...atom, hCount: null }, byAtom.get(atom.id)).hydrogens === hydrogens) hydrogens = null;
    if (hydrogens !== null && hydrogens !== undefined) {
      // (a dative bond written as one counts at its acceptor, as RDKit reads the field; written as a single bond, at both)
      const order = byAtom.get(atom.id).filter((b) => index.has(otherId(b, atom.id)) && (isCovalent(b) || (b.kind === 'dative' && (dative === 'charged' || (kinds && b.b === atom.id))))).reduce((sum, b) => sum + b.order, 0);
      valence = order + hydrogens || 15;
    }
    // a group label (R, Nu, Ph): "any atom" with the label as its alias; an atom list ([C,N]): "L", its elements below
    const symbol = atomList(atom) ? 'L' : atom.alias ? 'A' : atom.el;
    const [x, y] = place(atom);
    lines.push(`${(x * s).toFixed(4).padStart(10)}${(-y * s).toFixed(4).padStart(10)}    0.0000 ${symbol.padEnd(3)} 0  0  0  0  0${pad(valence, 3)}  0  0  0  0  0  0`);
  }
  // Haworth and Fischer projections and chairs: their stereo as wedges
  const projected = projectionStereo(doc, { sided, ids: atoms.map((atom) => atom.id) });
  const isotope = new Map(atoms.map((atom) => [atom.id, atom.isotope]));
  for (const bond of bonds) {
    const wedge = newman?.wedges.get(bond.id) ?? projected.get(bond.id);
    const [a, b] = wedge && wedge.from === bond.b ? [bond.b, bond.a] : [bond.a, bond.b];
    if (sided && (wedge || ['wedge', 'hash'].includes(bond.stereo))) {
      // (the wedge's narrow end: its drawn hydrogens told apart)
      const hydrogens = byAtom.get(a).map((x) => otherId(x, a)).filter((id) => index.has(id) && doc.atoms.get(id).el === 'H' && !isotope.get(id));
      hydrogens.slice(0, 2).forEach((id, k) => isotope.set(id, k + 2));
    }
    lines.push(`${pad(index.get(a) + 1, 3)}${pad(index.get(b) + 1, 3)}${pad(typeOf(bond), 3)}${pad(bond.kind ? 0 : STEREO_OUT[wedge?.stereo ?? bond.stereo] ?? 0, 3)}`);
  }
  atoms.forEach((atom, k) => {
    const list = atomList(atom);
    if (list) lines.push(`M  ALS ${pad(k + 1, 3)}${pad(list.elements.length, 3)} ${list.not ? 'T' : 'F'} ${list.elements.map((e) => e.padEnd(4)).join('')}`);
    else if (atom.alias) lines.push(`A  ${pad(k + 1, 3)}`, atom.alias);
  });
  const pairs = (key) => atoms.map((atom, k) => [k, key === 'charge' ? charge.get(atom.id) : key === 'isotope' ? isotope.get(atom.id) : key === 'radical' && atom.radical > 3 ? 0 : atom[key]]).filter(([, v]) => v);
  lines.push(...propertyLines('CHG', pairs('charge')), ...propertyLines('RAD', pairs('radical')), ...propertyLines('ISO', pairs('isotope')));
  if (units) {
    // (a unit all of whose atoms are written: a selection's atoms, its bracket with them or not)
    const written = repeatingUnits(doc).filter(({ atoms: members }) => members.every((id) => index.has(id)));
    written.forEach(({ bracket, atoms: members }, k) => {
      const n = pad(k + 1, 4);
      lines.push(`M  STY  1${n} SRU`, `M  SLB  1${n}${n}`, `M  SCN  1${n} HT `);
      for (let i = 0; i < members.length; i += 15) {
        const chunk = members.slice(i, i + 15);
        lines.push(`M  SAL ${n.slice(1)}${pad(chunk.length, 3)}${chunk.map((id) => pad(index.get(id) + 1, 4)).join('')}`);
      }
      // (its two brackets, as drawn: up the left and right of its box)
      const [x1, x2] = [Math.min(bracket.x1, bracket.x2), Math.max(bracket.x1, bracket.x2)].map((x) => (x * s).toFixed(4).padStart(10));
      const [y1, y2] = [Math.max(bracket.y1, bracket.y2), Math.min(bracket.y1, bracket.y2)].map((y) => (-y * s).toFixed(4).padStart(10));
      lines.push(`M  SDI ${n.slice(1)}  4${x1}${y1}${x1}${y2}`, `M  SDI ${n.slice(1)}  4${x2}${y2}${x2}${y1}`, `M  SMT ${n.slice(1)} ${bracket.sub}`);
    });
  }
  lines.push('M  END');
  return { molfile: lines.join('\n'), atomIds: atoms.map((atom) => atom.id) };
}

const otherId = (bond, id) => (bond.a === id ? bond.b : bond.a);

// An atom list written as a label ([C,N], ![O,S]): { elements, not }, or null
function atomList(atom) {
  const list = /^(!?)\[([A-Z][a-z]?(?:,[A-Z][a-z]?)+)\]$/.exec(atom.alias ?? '');
  return list && list[2].split(',').every(isElement) ? { elements: list[2].split(','), not: Boolean(list[1]) } : null;
}
