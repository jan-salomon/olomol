// IUPAC numbering of a molecule's parent chain or ring (2013
// recommendations, P-44 for the parent and P-31.1.4 for the numbers), as
// far as school and first-year chemistry go: chains, single rings
// (benzene, cyclohexane, pyridine), substituents and the common principal
// groups. Only the parent is numbered; substituents (a methyl on C2) are
// not. Fused, bridged and spiro ring systems (naphthalene, steroids) have
// fixed numberings of their own: they are recognised but not numbered.
//
// The parent: the most principal groups (the suffix: the most senior class
// present, acid > ester > acid halide > amide > nitrile > aldehyde >
// ketone > alcohol > thiol > amine > imine); then a ring before a chain;
// chains: the longest (2013: length before unsaturation), the most
// multiple bonds, the most double bonds, then lowest locants, the most
// substituents; rings: with N, with a heteroatom, more rings, larger.
// The numbers: lowest locants first to ring heteroatoms (O, S, N in that
// order), then to the principal groups, multiple bonds (as a set; then
// double bonds lower than triple), all substituents together, and the
// substituent cited first in alphabetical order (in the language of the
// page: Czech names sort "chlor" after "hydroxy").
import { language } from '../i18n/i18n.js';
import { bondsByAtom, otherEnd } from '../model/doc.js';
import { ringList, smallestRings } from '../model/graph.js';

const CLASSES = ['acid', 'ester', 'acidHalide', 'amide', 'nitrile', 'aldehyde', 'ketone', 'alcohol', 'thiol', 'amine', 'imine'];
const ON_CARBON = new Set(['acid', 'ester', 'acidHalide', 'amide', 'nitrile', 'aldehyde']); // the group's own carbon (–COOH); on a ring: attached to it
const HALOGENS = new Set(['F', 'Cl', 'Br', 'I']);
const HETERO_ORDER = ['O', 'S', 'Se', 'Te', 'N', 'P', 'As', 'Si', 'B'];

// Substituent prefixes, for the alphabetical rule (and to say which one decided).
const NAMES = {
  en: { F: 'fluoro', Cl: 'chloro', Br: 'bromo', I: 'iodo', hydroxy: 'hydroxy', oxo: 'oxo', amino: 'amino', nitro: 'nitro', sulfanyl: 'sulfanyl', phenyl: 'phenyl', cyclo: 'cyclo', yl: 'yl', oxy: 'oxy',
    roots: ['meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'] },
  cs: { F: 'fluor', Cl: 'chlor', Br: 'brom', I: 'jod', hydroxy: 'hydroxy', oxo: 'oxo', amino: 'amino', nitro: 'nitro', sulfanyl: 'sulfanyl', phenyl: 'fenyl', cyclo: 'cyklo', yl: 'yl', oxy: 'oxy',
    roots: ['meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'okt', 'non', 'dek'] },
  de: { F: 'fluor', Cl: 'chlor', Br: 'brom', I: 'iod', hydroxy: 'hydroxy', oxo: 'oxo', amino: 'amino', nitro: 'nitro', sulfanyl: 'sulfanyl', phenyl: 'phenyl', cyclo: 'cyclo', yl: 'yl', oxy: 'oxy',
    roots: ['meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'] },
};

// The first difference decides; equal lists: 0.
function compareLists(p, q) {
  for (let k = 0; k < Math.min(p.length, q.length); k++) if (p[k] !== q[k]) return p[k] - q[k];
  return p.length - q.length;
}

const ORIENTATION_RULES = ['hetero', 'heteroOrder', 'principal', 'multiple', 'double', 'substituents', 'alphabet'];

// The numbering of molecule `members`: { numbers: Map atom id -> number
// (the parent only), parent: { kind: 'chain' | 'ring' | 'system', ... },
// why: { parent, numbers } (which rule decided, for the panel) }; numbers
// empty for a fused ring system or a molecule without a parent.
export function iupacNumbering(doc, members, byAtom = bondsByAtom(doc)) {
  const memberSet = new Set(members);
  const el = (id) => doc.atoms.get(id).el;
  const links = (id) => byAtom.get(id).filter((bond) => bond.kind !== 'hbond' && bond.kind !== 'link').map((bond) => ({ id: otherEnd(bond, id), order: bond.order, bond }));
  const heavy = (id) => links(id).filter((n) => el(n.id) !== 'H');
  const names = NAMES[language] ?? NAMES.en;
  const collate = new Intl.Collator(language).compare;

  const rings = ringList(smallestRings(doc, byAtom)).filter((ring) => ring.every((id) => memberSet.has(id)));
  const inRing = new Set(rings.flat());

  // --- the characteristic groups: { class, carbon, atoms } (a ring's own
  // N, O or S is part of the ring, not a group) ---
  const isTerminal = (id) => heavy(id).length === 1; // OH, O−, SH, NH2 and the like
  const groups = [];
  for (const c of members) {
    if (el(c) !== 'C') continue;
    const ns = heavy(c);
    const oxo = ns.find((n) => el(n.id) === 'O' && n.order === 2);
    if (oxo) {
      const rest = ns.filter((n) => n !== oxo && n.order === 1);
      const o = rest.find((n) => el(n.id) === 'O');
      const x = rest.find((n) => HALOGENS.has(el(n.id)));
      const nitrogen = rest.find((n) => el(n.id) === 'N');
      const carbons = rest.filter((n) => el(n.id) === 'C').length;
      const kind = o ? (isTerminal(o.id) ? 'acid' : 'ester') : x ? 'acidHalide' : nitrogen ? 'amide' : carbons >= 2 ? 'ketone' : 'aldehyde';
      groups.push({ class: kind, carbon: c, atoms: [oxo.id, ...[o ?? x ?? nitrogen].filter(Boolean).map((n) => n.id)] });
    }
    for (const n of ns) {
      if (inRing.has(n.id)) continue;
      if (el(n.id) === 'N' && n.order === 3) groups.push({ class: 'nitrile', carbon: c, atoms: [n.id] });
      if (n === oxo || n.order !== 1 || !isTerminal(n.id)) continue;
      if (el(n.id) === 'O' && !oxo) groups.push({ class: 'alcohol', carbon: c, atoms: [n.id] });
      if (el(n.id) === 'S') groups.push({ class: 'thiol', carbon: c, atoms: [n.id] });
    }
    for (const n of ns) {
      if (el(n.id) !== 'N' || inRing.has(n.id)) continue;
      if (n.order === 2) groups.push({ class: 'imine', carbon: c, atoms: [n.id] });
      // an amine N: not an amide's (no C=O on it), not nitro (no O on it)
      const onN = heavy(n.id);
      const amideN = onN.some((m) => el(m.id) === 'C' && heavy(m.id).some((k) => el(k.id) === 'O' && k.order === 2));
      if (n.order === 1 && !amideN && !onN.some((m) => el(m.id) === 'O') && onN.every((m) => m.order === 1)) groups.push({ class: 'amine', carbon: c, atoms: [n.id] });
    }
  }
  const principalClass = CLASSES.find((kind) => groups.some((g) => g.class === kind)) ?? null;
  const principal = groups.filter((g) => g.class === principalClass);

  // --- candidates: rings and ring systems, chains ---
  const systems = [];
  for (const ring of rings) {
    const joined = systems.filter((s) => ring.some((id) => s.atoms.has(id)));
    const system = { rings: [ring, ...joined.flatMap((s) => s.rings)], atoms: new Set([...ring, ...joined.flatMap((s) => [...s.atoms])]) };
    for (const s of joined) systems.splice(systems.indexOf(s), 1);
    systems.push(system);
  }
  // chains: paths between ends of the carbons outside rings (they form trees)
  const chainCarbons = new Set(members.filter((id) => el(id) === 'C' && !inRing.has(id)));
  const next = (id) => links(id).map((n) => n.id).filter((n) => chainCarbons.has(n));
  const chains = [];
  const done = new Set();
  for (const start of chainCarbons) {
    if (done.has(start)) continue;
    const part = [];
    const stack = [start];
    done.add(start);
    while (stack.length) {
      const id = stack.pop();
      part.push(id);
      for (const n of next(id)) {
        if (done.has(n)) continue;
        done.add(n);
        stack.push(n);
      }
    }
    const ends = part.filter((id) => next(id).length <= 1).sort((a, b) => a - b);
    for (const a of ends) {
      // the path from a to every other end (a tree: one each)
      const from = new Map([[a, null]]);
      const queue = [a];
      for (let i = 0; i < queue.length; i++) {
        for (const n of next(queue[i])) {
          if (from.has(n)) continue;
          from.set(n, queue[i]);
          queue.push(n);
        }
      }
      for (const b of ends) {
        if (b < a || (b === a && part.length > 1)) continue;
        const path = [b];
        while (from.get(path.at(-1)) !== null) path.push(from.get(path.at(-1)));
        chains.push(path.reverse());
      }
    }
  }

  // --- what a parent has: principal groups, substituents ---
  // a principal group counts on a chain if its carbon is in it; on a ring if
  // its carbon is (a ring ketone) or, for –COOH, –CHO, –CN…, it hangs on it
  const carriersOf = (atoms) => principal.flatMap((g) => {
    if (atoms.has(g.carbon)) return [{ atom: g.carbon, group: g }];
    if (!ON_CARBON.has(g.class) || inRing.has(g.carbon)) return [];
    const on = heavy(g.carbon).find((n) => atoms.has(n.id) && inRing.has(n.id));
    return on ? [{ atom: on.id, group: g, outside: true }] : [];
  });
  const substituentName = (n, from, parent) => {
    const e = el(n);
    if (HALOGENS.has(e)) return names[e];
    if (e === 'O') return heavy(n).length === 1 ? (links(n).find((l) => l.id === from)?.order === 2 ? names.oxo : names.hydroxy) : alkylName(heavy(n).find((l) => l.id !== from)?.id, n, parent, names.oxy);
    if (e === 'N') return heavy(n).filter((l) => el(l.id) === 'O').length >= 2 ? names.nitro : names.amino;
    if (e === 'S') return names.sulfanyl;
    if (e === 'C') return alkylName(n, from, parent, names.yl);
    if (e === '*') return (doc.atoms.get(n).alias ?? 'r').toLowerCase();
    return e.toLowerCase();
  };
  // methyl, ethyl… (or methoxy…) by the carbons of the branch; phenyl, cyclohexyl for a ring
  const alkylName = (n, from, parent, ending) => {
    if (n === undefined || el(n) !== 'C') return names.oxy;
    const ring = rings.find((r) => r.includes(n));
    if (ring) return ring.length === 6 && ring.every((id) => links(id).some((l) => ring.includes(l.id) && (l.order === 2 || l.bond.delocalized))) ? names.phenyl : `${names.cyclo}${names.roots[ring.length - 1] ?? ''}${ending}`;
    const seen = new Set([n, from, ...parent]);
    const stack = [n];
    let carbons = 0;
    while (stack.length) {
      const id = stack.pop();
      carbons += 1;
      for (const l of heavy(id)) {
        if (seen.has(l.id) || el(l.id) !== 'C') continue;
        seen.add(l.id);
        stack.push(l.id);
      }
    }
    return `${names.roots[carbons - 1] ?? names.roots.at(-1)}${ending}`;
  };

  // A parent's description and, for a chain or single ring, its orientations:
  // each { order, key } (key: the locant lists of ORIENTATION_RULES).
  const describe = (kind, atoms, orders) => {
    const set = new Set(atoms);
    const carriers = carriersOf(set);
    const groupAtoms = new Set(carriers.flatMap(({ group, outside }) => [...group.atoms, ...(outside ? [group.carbon] : [])]));
    const substituents = atoms.flatMap((p) => heavy(p).filter((n) => !set.has(n.id) && !groupAtoms.has(n.id))
      .map((n) => ({ atom: p, name: substituentName(n.id, p, set) })));
    const parentBonds = [...new Set(atoms.flatMap((p) => links(p).filter((n) => set.has(n.id) && n.order >= 2).map((n) => n.bond)))];
    // a benzene or pyridine ring: its double bonds are where Kekulé put them, no rule for them
    const mancude = kind === 'ring' && atoms.every((id) => links(id).some((n) => set.has(n.id) && (n.order === 2 || n.bond.delocalized)));
    const multiple = mancude ? [] : parentBonds;
    const orientations = orders.map((order) => {
      const pos = new Map(order.map((id, k) => [id, k + 1]));
      const sorted = (list) => list.sort((a, b) => a - b);
      const locant = (bond) => {
        const [p, q] = [pos.get(bond.a), pos.get(bond.b)].sort((a, b) => a - b);
        return q - p === 1 ? p : q; // a ring's closing bond (6–1) is 6
      };
      const hetero = order.filter((id) => el(id) !== 'C');
      const named = [...substituents].sort((a, b) => collate(a.name, b.name) || pos.get(a.atom) - pos.get(b.atom));
      return {
        order,
        key: {
          hetero: sorted(hetero.map((id) => pos.get(id))),
          heteroOrder: HETERO_ORDER.flatMap((e) => sorted(hetero.filter((id) => el(id) === e).map((id) => pos.get(id)))),
          principal: sorted(carriers.map((c) => pos.get(c.atom))),
          multiple: sorted(multiple.map(locant)),
          double: sorted(multiple.filter((b) => b.order === 2).map(locant)),
          substituents: sorted(substituents.map((s) => pos.get(s.atom))),
          alphabet: named.map((s) => pos.get(s.atom)),
        },
        named,
      };
    });
    const compare = (a, b) => {
      for (const rule of ORIENTATION_RULES) {
        const d = compareLists(a.key[rule], b.key[rule]);
        if (d) return { d, rule };
      }
      return { d: 0, rule: null };
    };
    orientations.sort((a, b) => compare(a, b).d || compareLists(a.order, b.order));
    return {
      kind, atoms, carriers, substituents, orientations, best: orientations[0], compare,
      principalCount: carriers.length, multipleCount: multiple.length, doubleCount: multiple.filter((b) => b.order === 2).length,
      hasN: atoms.some((id) => el(id) === 'N'), hetero: atoms.some((id) => el(id) !== 'C'),
    };
  };
  const ringOrders = (ring) => ring.flatMap((_, k) => [
    [...ring.slice(k), ...ring.slice(0, k)],
    [ring[k], ...ring.slice(0, k).reverse(), ...ring.slice(k + 1).reverse()],
  ]);
  const candidates = [
    ...systems.map((s) => (s.rings.length === 1 ? describe('ring', s.rings[0], ringOrders(s.rings[0])) : { ...describe('system', [...s.atoms], [[...s.atoms]]), ringCount: s.rings.length })),
    ...chains.map((path) => describe('chain', path, path.length > 1 ? [path, [...path].reverse()] : [path])),
  ];
  if (!candidates.length) return { numbers: new Map(), parent: null, why: { parent: 'none' } };

  // --- the parent: the rules in order; the first that tells two apart decides ---
  const lists = (a, b, rule) => compareLists(a.best.key[rule], b.best.key[rule]);
  const PARENT_RULES = [
    ['principal', (a, b) => b.principalCount - a.principalCount],
    ['ring', (a, b) => (b.kind !== 'chain') - (a.kind !== 'chain')],
    ['nitrogen', (a, b) => (a.kind === 'chain' ? 0 : b.hasN - a.hasN)],
    ['hetero', (a, b) => (a.kind === 'chain' ? 0 : b.hetero - a.hetero)],
    ['rings', (a, b) => (b.ringCount ?? 1) - (a.ringCount ?? 1)],
    ['length', (a, b) => b.atoms.length - a.atoms.length],
    ['multiple', (a, b) => b.multipleCount - a.multipleCount],
    ['double', (a, b) => b.doubleCount - a.doubleCount],
    ['principalLocants', (a, b) => lists(a, b, 'principal')],
    ['multipleLocants', (a, b) => lists(a, b, 'multiple')],
    ['doubleLocants', (a, b) => lists(a, b, 'double')],
    ['substituentCount', (a, b) => b.substituents.length - a.substituents.length],
    ['substituentLocants', (a, b) => lists(a, b, 'substituents')],
    ['alphabet', (a, b) => lists(a, b, 'alphabet')],
  ];
  const decide = (a, b) => {
    for (const [rule, test] of PARENT_RULES) {
      const d = test(a, b);
      if (d) return { d, rule };
    }
    return { d: compareLists(a.atoms.slice().sort((p, q) => p - q), b.atoms.slice().sort((p, q) => p - q)), rule: null };
  };
  candidates.sort((a, b) => decide(a, b).d);
  const [parent] = candidates;
  // why this one: against the best that differs (not its mirror image, an equal chain)
  const rival = candidates.slice(1).find((c) => decide(parent, c).rule);
  const parentWhy = rival ? decide(parent, rival).rule : 'only';
  const group = principalClass && parent.carriers.length ? principalClass : null;
  if (parent.kind === 'system') return { numbers: new Map(), parent: { kind: 'system' }, why: { parent: 'system' } };

  // --- the numbers, and which rule chose this way round ---
  const { best } = parent;
  const other = parent.orientations.find((o) => parent.compare(best, o).d !== 0);
  const rule = other ? parent.compare(best, other).rule : null;
  const shown = (o) => (rule === 'alphabet' ? [o.key.alphabet[0]] : o.key[rule] ?? []).join(',');
  return {
    numbers: new Map(best.order.map((id, k) => [id, k + 1])),
    parent: { kind: parent.kind, length: parent.atoms.length, group },
    why: {
      parent: parentWhy,
      numbers: rule ? { rule, chosen: shown(best), other: shown(other), name: rule === 'alphabet' ? best.named[0].name : null } : null,
    },
  };
}

// The same, worked out once per structure (a drag changes only coordinates).
const cache = new Map();
export function cachedNumbering(doc, members, byAtom) {
  const set = new Set(members);
  const atoms = members.map((id) => {
    const a = doc.atoms.get(id);
    return `${id}${a.el}${a.alias ?? ''}${a.charge || ''}`;
  });
  const bonds = [...doc.bonds.values()].filter((b) => set.has(b.a)).map((b) => `${b.a}-${b.b}${b.order}${b.kind ?? ''}${b.delocalized ? 'd' : ''}`);
  const key = `${atoms.join()}|${bonds.join()}`;
  if (!cache.has(key)) {
    if (cache.size > 200) cache.clear();
    cache.set(key, iupacNumbering(doc, members, byAtom));
  }
  return cache.get(key);
}
