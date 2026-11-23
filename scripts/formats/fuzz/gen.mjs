// A seeded generator of drawings that combine olomol's features, as the editor makes them where it can (molecules
// drawn from SMILES, put on arrows and anchors by the scene's own targets, groups by Ctrl+G's code).
import { readFileSync } from 'node:fs';
import { rng } from './rng.mjs';
import { REPO, docm, files, graph, sceneMod, style } from './lib.mjs';

const { Editor } = await import(`${REPO}/src/editor/editor.js`);
const { groupSelection } = await import(`${REPO}/src/editor/grouping.js`);
// The drawing as the editor settles it when it draws it: arrows as long as their arcs need, molecules on arrows
// where the arrow puts them, brackets fitted, texts on anchors at their place, curved arrows' curves kept
export function settle(doc) {
  const ed = new Editor();
  ed.doc = doc;
  void ed.scene;
  return ed;
}

const { addArrow, addBond, addBracket, addCurve, addFill, addOrbital, addOverlap, addPlus, addText, copyObjects, emptyDoc, bondsByAtom, otherEnd } = docm;

// --- molecules ---
const SPECIAL = [
  'C[N+](C)(C)C', 'CC(=O)[O-]', '[NH4+]', '[Cl-]', '[13CH3]O', '[2H]C([2H])([2H])O', 'O=[13C]=O', '[CH3]', '[CH2]', 'C[O]',
  '[O-][N+](=O)c1ccccc1', 'F[B-](F)(F)F', '[Na+]', 'O=S(=O)([O-])[O-]', 'C[S+](C)C', 'c1ccc2ccccc2c1', 'C#N', '[N-]=[N+]=[N-]',
  'C=C=C', 'O', 'N', 'C[C@H](N)C(=O)O', 'C/C=C/C', 'C/C=C\\Cl', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'c1ccncc1',
  'P(c1ccccc1)(c1ccccc1)c1ccccc1', 'B(F)(F)F', '[Li]C', 'C[Mg]Br', '[2H][2H]', '[3H]O', 'CC(C)(C)[O-]', '[K+]', 'C1CC1',
  'C1CCCCCCCCCCC1', 'OC(=O)CC(O)(CC(=O)O)C(=O)O', '[O][O]', 'S(F)(F)(F)(F)(F)F', 'ClC(Cl)(Cl)Cl', 'Br', 'C=O', '[C-]#[O+]',
  'c1cc[nH]c1', 'CCCCCC', 'C[C@@H](Cl)CC', 'O=C1CCCCC1', '[NH3+]CC([O-])=O', 'CC#CC', 'C[Si](C)(C)C', '[OH-]', '[H+]', '[H]', 'CBr',
  'C=CC=C', 'OO', 'N#N', 'CN=C=O', '[15NH3]', '[18OH2]', 'C[C@]12CC[C@H](C1)C2(C)C',
];
const METALS = ['[Pt+2]', '[Co+3]', '[Cu+2]', '[Fe+2]', '[Ni]', '[Pd]', '[Zn+2]', '[Ag+]'];
const LIGANDS = ['N', 'O', '[Cl-]', '[C-]#[O+]', 'P(C)(C)C', 'c1ccncc1', 'NCCN', '[CN-]', 'C[S]C'.replace('[S]', 'S')];
// olomol's own templates (rings, compounds, amino acids, sugars, reagents …: those written as SMILES, no groups with a "*")
const { TEMPLATES } = await import(`${REPO}/src/chem/templates.js`);
const OWN = TEMPLATES.flatMap(([, entries]) => entries).map(([, smiles]) => smiles).filter((s) => typeof s === 'string' && !s.includes('*'));
// More molecules from SMILES files (run.mjs --molecules a.smi,b.smi): one a line, the SMILES its last field (tabs or
// spaces between fields), lines with # left out
const MORE = (process.env.OLOMOL_FUZZ_MOLECULES ?? '').split(',').filter(Boolean).flatMap((file) => readFileSync(file, 'utf8').split('\n')
  .filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).at(-1)).filter((s) => s.length <= 60));

const drawn = new Map(); // SMILES -> template drawing (or the error)
async function template(smiles) {
  if (!drawn.has(smiles)) {
    try {
      drawn.set(smiles, (await files.readAny(smiles, { name: 'x.smi' })).doc);
    } catch (error) {
      drawn.set(smiles, error);
    }
  }
  const t = drawn.get(smiles);
  return t instanceof Error ? null : t;
}

const box = (doc, ids) => {
  const atoms = ids.map((id) => doc.atoms.get(id));
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
};

// A molecule drawn at x, y (its left middle); returns its atom ids
async function putMolecule(doc, smiles, at) {
  const t = await template(smiles);
  if (!t) return null;
  const b = box(t, [...t.atoms.keys()]);
  const made = copyObjects(t, [...t.atoms.keys()], at[0] - b.x1, at[1] - (b.y1 + b.y2) / 2, doc);
  return made.filter((id) => doc.atoms.has(id));
}

const COLORS = ['#d0021b', '#4a90e2', '#7ed321', '#b5dcff', '#f5a623', '#000000'];
const ABBREVIATIONS = ['Ph', 'OMe', 'Boc', 'CO2Me', 'Me', 'Et', 'tBu', 'Ac', 'Ts', 'OTs', 'NO2', 'CF3', 'CN', 'TMS', 'Bn', 'CHO', 'CO2H', 'R', 'X', 'Nu', 'R1', "R'", 'Ar', 'NMe2', 'SiMe3', 'PPh3', 'NHBoc', 'OTBS', 'CH2OH'];
const MARKUP = ['H_{2}O', 'Δ', 'hν', '*{bold}', '~{italic}', 'x^{2}', 'line one\nline two', '\\{braces\\}', 'C:\\temp', '1. NaOH\n2. H_{3}O^{+}', '(±)-*{1}', 'α-D-~{gluco}', '', ' ', '50 °C, 2 h', '→ ← ⇌', 'Et_{2}O', '*{~{H}_{2}SO_{4}}', 'émoji 🧪', '%d {{x}}'];

export async function generate(seed) {
  const r = rng(seed);
  const chance = (p) => r.next() < p;
  const doc = emptyDoc();
  const molecules = []; // atom id lists
  let x = 0;
  const pickSmiles = () => {
    const k = r.next();
    return k < 0.45 ? r.pick(SPECIAL) : k < 0.85 && MORE.length ? r.pick(MORE) : r.pick(OWN);
  };
  const addMol = async (smiles = pickSmiles(), y = 0) => {
    const ids = await putMolecule(doc, smiles, [x, y]);
    if (!ids) return null;
    x = box(doc, ids).x2 + 2.5;
    molecules.push(ids);
    return ids;
  };
  const log = [];
  const step = (name) => log.push(name);

  // molecules
  const n = 1 + r.int(4);
  for (let i = 0; i < n; i++) await addMol();
  // a metal complex: ligands bound by dative bonds (from the donor)
  if (chance(0.25)) {
    step('complex');
    const metal = await addMol(r.pick(METALS));
    if (metal) {
      const m = doc.atoms.get(metal[0]);
      const count = 2 + r.int(3);
      for (let k = 0; k < count; k++) {
        const angle = (2 * Math.PI * k) / count;
        const ligand = await putMolecule(doc, r.pick(LIGANDS), [m.x + 1.5 * Math.cos(angle), m.y + 1.5 * Math.sin(angle)]);
        if (!ligand) continue;
        const donor = ligand.find((id) => ['N', 'O', 'P', 'S', 'Cl', 'C'].includes(doc.atoms.get(id).el)) ?? ligand[0];
        addBond(doc, donor, metal[0], 1, { kind: 'dative' });
      }
      x += 2;
    }
  }
  // a polymer: a repeating unit in brackets with n (two bonds leaving it)
  if (chance(0.2)) {
    step('unit');
    const chain = await addMol(r.pick(['CCCCCC', 'CC(C)C(Cl)CC', 'CC(c1ccccc1)CC', 'COCCOCC', 'CC(=O)OCC']));
    if (chain) {
      const byAtom = bondsByAtom(doc);
      const inner = chain.filter((id) => byAtom.get(id).length >= 2);
      const [a] = inner;
      const b = byAtom.get(a).map((bd) => otherEnd(bd, a)).find((id) => inner.includes(id) && id !== a);
      const members = [a, b].filter((id) => id !== undefined);
      // (and what hangs on them, not on the chain: a side group)
      if (chance(0.5)) {
        const bb = box(doc, members);
        addBracket(doc, bb.x1 - 0.4, bb.y1 - 0.6, bb.x2 + 0.4, bb.y2 + 0.6, { sub: r.pick(['n', 'm', 'x']) });
      } else addBracket(doc, 0, 0, 1, 1, { shape: chance(0.5) ? 'round' : 'square', sub: 'n', atoms: members });
    }
  }
  if (!molecules.length) await addMol('CCO');

  const allAtoms = () => [...doc.atoms.values()];
  const heavy = () => allAtoms().filter((a) => a.el !== 'H' && a.el !== '*');
  const byAtomNow = () => bondsByAtom(doc);

  // atoms: their own settings
  if (chance(0.7)) {
    step('atoms');
    for (const a of allAtoms()) {
      if (!chance(0.15)) continue;
      const what = r.int(16);
      if (what === 0) a.charge = r.pick([-2, -1, 1, 2, 3]);
      else if (what === 1) a.isotope = a.el === 'H' ? r.pick([2, 3]) : r.pick([13, 14, 15, 18, 2]);
      else if (what === 2) {
        const degree = [...doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length;
        a.radical = degree <= 1 && chance(0.3) ? r.pick([4, 5]) : degree <= 2 && chance(0.5) ? r.pick([1, 3]) : 2;
      }
      else if (what === 3) a.hCount = r.int(4);
      else if (what === 4) a.lonePairs = r.pick(['auto', 0, 1, 2, 3]);
      else if (what === 5) a.color = r.pick(COLORS);
      else if (what === 6) a.highlight = r.pick(COLORS);
      else if (what === 7) a.bold = true;
      else if (what === 8) a.partialCharge = r.pick([1, -1]);
      else if (what === 9) a.hSide = r.pick(['left', 'right']);
      else if (what === 10) a.endLabel = r.pick([true, false]);
      else if (what === 11) a.carbonLabel = r.pick([true, false]);
      else if (what === 12) a.cipLabel = true;
      else if (what === 13) a.number = r.pick([1, 2, 7, 12, 0]);
      else if (what === 14 && a.el === 'H') Object.assign(a, { isotope: r.pick([2, 3]), letter: true });
      else if (what === 15) a.lonePairs = 'auto';
    }
    if (chance(0.2)) for (const id of r.pick(molecules)) if (doc.atoms.has(id)) Object.assign(doc.atoms.get(id), { autoNumber: true, number: undefined });
  }
  // abbreviations: an end atom as a label (Ph, OMe, R)
  if (chance(0.5)) {
    step('labels');
    const byAtom = byAtomNow();
    for (const a of heavy()) {
      const bonds = byAtom.get(a.id).filter(docm.isCovalent);
      if (bonds.length !== 1 || !chance(0.3)) continue;
      const alias = r.pick(ABBREVIATIONS);
      Object.assign(a, { el: '*', alias, charge: 0, isotope: null, radical: 0, hCount: null });
      if (bonds[0].order !== 1) bonds[0].order = 1;
      if (chance(0.1)) Object.assign(a, { alias: r.pick(['SO3', 'CO2']), charge: -1 });
    }
  }
  // bonds: wedges, colours, sides
  if (chance(0.6)) {
    step('bonds');
    for (const b of doc.bonds.values()) {
      if (b.kind || !chance(0.15)) continue;
      const what = r.int(8);
      if (what === 0 && b.order === 1) b.stereo = r.pick(['wedge', 'hash', 'wavy']);
      else if (what === 1) b.color = r.pick(COLORS);
      else if (what === 2) b.highlight = r.pick(COLORS);
      else if (what === 3) b.bold = true;
      else if (what === 4 && b.order === 2) b.side = r.pick(['left', 'right', 'center']);
      else if (what === 5 && b.order === 2) b.cipLabel = true;
      else if (what === 6) [b.a, b.b] = [b.b, b.a];
      else if (what === 7 && b.order === 1 && chance(0.3)) b.kind = r.pick(['partial', 'hbond']);
    }
  }
  // between molecules: hydrogen, partial, dative bonds, and "one compound"
  if (molecules.length >= 2 && chance(0.4)) {
    step('between');
    for (let k = 0; k < 1 + r.int(2); k++) {
      const [m1, m2] = r.shuffle(molecules.filter((m) => m.every((id) => doc.atoms.has(id))));
      if (!m1 || !m2) break;
      const kind = r.pick(['hbond', 'partial', 'dative', 'link']);
      const [p, q] = [r.pick(m1), r.pick(m2)];
      if (!docm.bondBetween(doc, p, q)) addBond(doc, p, q, 1, { kind });
    }
  }
  // reactions: arrows, molecules and texts on them (by the scene's own targets), "+" signs, side arcs
  if (chance(0.6)) {
    step('reaction');
    const kinds = ['forward', 'equilibrium', 'resonance', 'retro', 'multistep', 'dipole', 'failed', 'same'];
    const a = addArrow(doc, x, 0, x + 3 + r.int(3), 0, r.pick(kinds));
    if (a.kind === 'equilibrium' && chance(0.5)) a.lean = r.pick(['forward', 'back']);
    if (chance(0.3)) a.color = r.pick(COLORS);
    if (chance(0.4)) {
      const sides = [];
      for (const side of ['above', 'below']) for (const way of ['in', 'out']) if (chance(0.4)) sides.push({ side, way, reach: +(0.6 + r.next() * 2).toFixed(2), id: doc.nextId++ });
      if (sides.length) a.sides = sides;
      if (chance(0.3)) a.ownLength = 3;
      if (chance(0.2)) a.lengthByHand = true;
    }
    x = a.x2 + 1.5;
    if (chance(0.5)) {
      const prod = await addMol();
      if (prod && chance(0.5)) {
        addPlus(doc, x, 0, chance(0.2) ? { color: r.pick(COLORS) } : {});
        x += 1.5;
        await addMol();
      }
    }
    // put things on the arrow, the editor's way
    for (let k = 0; k < 1 + r.int(3); k++) {
      const scene = sceneMod.buildScene(doc);
      let put;
      if (chance(0.5)) {
        const reagent = await putMolecule(doc, r.pick(['O', '[Na+]', 'CCO', 'Br', 'C1CCOC1', '[OH-]', 'ClCCl', 'O=S(=O)(O)O']), [x + 5, 5]);
        if (!reagent) continue;
        molecules.push(reagent);
        const b = box(doc, reagent);
        const targets = sceneMod.arrowTargets(sceneMod.buildScene(doc), b, reagent);
        if (!targets.length) continue;
        put = reagent.map((id) => doc.atoms.get(id));
        sceneMod.putOnArrow(doc, r.pick(targets), put);
        if (chance(0.3)) for (const atom of put) atom.arrowSign = r.pick(['+', '−']);
        settle(doc);
      } else {
        const text = addText(doc, x + 5, 5, r.pick(MARKUP));
        const targets = sceneMod.arrowTargets(scene, { x1: 0, y1: 0, x2: 1.5, y2: 0.5 }, text.id);
        if (!targets.length) continue;
        sceneMod.putOnArrow(doc, r.pick(targets), [text]);
        if (chance(0.2)) text.arrowSign = r.pick(['+', '−']);
        settle(doc);
      }
    }
    // (and directly, as a file may say: any slot)
    if (chance(0.2)) {
      const t = addText(doc, x, 2, r.pick(MARKUP), { arrow: a.id, slot: r.pick(['above', 'below', 'above-in', 'above-out', 'below-in', 'below-out']), order: r.int(3) });
      if (chance(0.3)) t.arrowSign = '+';
    }
  }
  // texts: free, and on molecules
  if (chance(0.6)) {
    step('texts');
    for (let k = 0; k < 1 + r.int(3); k++) {
      const extra = {
        ...(chance(0.2) && { color: r.pick(COLORS) }), ...(chance(0.2) && { bold: true }), ...(chance(0.2) && { size: r.pick([0.5, 0.75, 1.5, 2]) }),
        ...(chance(0.2) && { family: r.pick(['sans', 'serif']) }), ...(chance(0.2) && { align: r.pick(['left', 'center', 'right']) }),
      };
      const text = addText(doc, r.uniform(-2, x), r.uniform(-3, 3), r.pick(MARKUP), extra);
      if (chance(0.5)) {
        const scene = sceneMod.buildScene(doc);
        const targets = sceneMod.anchorTargets(scene, text);
        if (targets.length) sceneMod.putOnAnchor(doc, r.pick(targets), text);
        if (text.anchor !== undefined && chance(0.3)) text.drop = r.pick([0.5, 1]);
      }
    }
  }
  // brackets: round a molecule (by its atoms or a box), with ‡, 2+
  if (chance(0.4)) {
    step('brackets');
    const m = r.pick(molecules).filter((id) => doc.atoms.has(id));
    if (m.length) {
      const b = box(doc, m);
      const extra = { shape: r.pick(['square', 'round']), ...(chance(0.6) && { sup: r.pick(['‡', '2+', '+', '−', '2−', '*']) }), ...(chance(0.2) && { sub: r.pick(['n', '2', 'x']) }), ...(chance(0.2) && { color: r.pick(COLORS) }) };
      if (chance(0.5)) addBracket(doc, b.x1 - 0.5, b.y1 - 0.5, b.x2 + 0.5, b.y2 + 0.5, extra);
      else addBracket(doc, b.x1, b.y1, b.x2, b.y2, { ...extra, atoms: [...m] });
    }
  }
  // orbitals and their overlaps
  const orbitals = [];
  if (chance(0.35)) {
    step('orbitals');
    const byAtom = byAtomNow();
    for (const a of r.shuffle(heavy()).slice(0, 1 + r.int(4))) {
      const neighbour = byAtom.get(a.id).map((b) => otherEnd(b, a.id))[0] ?? null;
      const o = addOrbital(doc, a.id, {
        kind: r.pick(['p', 'p', 'hybrid', 's']), angle: r.uniform(-Math.PI, Math.PI), ref: chance(0.7) ? neighbour : null, size: r.pick([1, 0.75, 1.25]),
        phase: r.pick([1, -1]), ...(chance(0.2) && { color: r.pick(COLORS) }), ...(chance(0.2) && { colorOther: r.pick(COLORS) }),
        ...(chance(0.15) && { plane: r.pick([1, -1]), reach: r.pick([1, 0.5, 0.3]) }), ...(chance(0.1) && { z: r.uniform(-1, 1), dz: r.uniform(-1, 1) }),
      });
      orbitals.push(o);
    }
    if (orbitals.length >= 2 && chance(0.7)) {
      const [p, q] = r.shuffle(orbitals);
      addOverlap(doc, p.id, q.id, { ...(chance(0.3) && { color: r.pick(COLORS) }), ...(chance(0.3) && { sideA: r.pick([1, -1]), sideB: r.pick([1, -1]) }) });
    }
  }
  // curved arrows: from a lone pair, a radical, a bond, an orbital; to an atom, a bond, a new bond
  if (chance(0.5)) {
    step('curves');
    for (let k = 0; k < 1 + r.int(3); k++) {
      const atoms = heavy();
      const bonds = [...doc.bonds.values()].filter((b) => !b.kind || b.kind === 'partial');
      if (!atoms.length) break;
      const a = r.pick(atoms);
      const fromKind = r.int(orbitals.length ? 5 : 4);
      const from = fromKind === 0 || !bonds.length ? { atom: a.id } : fromKind === 1 ? { bond: r.pick(bonds).id } : fromKind === 2 ? { atom: a.id, radical: true } : fromKind === 3 ? { atom: a.id, pair: r.int(2) } : { orbital: r.pick(orbitals).id };
      const target = r.pick(atoms);
      const toKind = r.int(3);
      const to = toKind === 0 || !bonds.length ? { atom: target.id } : toKind === 1 ? { bond: r.pick(bonds).id } : { atom: target.id, newBond: from.atom ?? a.id };
      if (to.newBond === to.atom) delete to.newBond;
      addCurve(doc, from, to, chance(0.3) ? 1 : 2, { ...(chance(0.4) && { color: r.pick(COLORS) }), ...(chance(0.2) && { variant: 1 + r.int(2) }) });
    }
  }
  // ring fills
  if (chance(0.25)) {
    step('fills');
    const ringsNow = [...graph.smallestRings(doc).values()];
    if (ringsNow.length) addFill(doc, r.pick(ringsNow), r.pick(COLORS));
  }
  // groups (Ctrl+G, with its own code)
  if (chance(0.3)) {
    step('groups');
    for (let k = 0; k < 1 + r.int(2); k++) {
      const things = r.shuffle([...molecules.map((m) => m.find((id) => doc.atoms.has(id))).filter((id) => id !== undefined), ...doc.arrows.keys(), ...doc.pluses.keys(), ...[...doc.texts.values()].filter((t) => t.anchor === undefined && t.arrow === undefined).map((t) => t.id), ...doc.brackets.keys()]).slice(0, 2 + r.int(3));
      const ed = settle(doc);
      ed.selection = new Set(things);
      ed.say = () => {};
      groupSelection(ed);
      const groups = [...doc.groups.values()];
      if (groups.length && chance(0.3)) groups.at(-1).name = r.pick(['Route A', 'step 1', 'Weg {1}']);
    }
  }
  // a drawing style of its own
  if (chance(0.4)) {
    step('style');
    const preset = r.pick(['screen', 'acs', 'rsc', 'slides', 'custom']);
    doc.style = style.styleOf({
      style: preset, ...(preset === 'custom' && { customStyle: style.clampPoints({ bond: r.pick([10, 14.4, 20]), line: r.pick([0.6, 1, 2]), family: r.pick(['sans', 'serif']) }) }),
      ...(chance(0.3) && { charges: 'circled' }), ...(chance(0.3) && { lonePairs: 'bars' }),
    });
  }
  settle(doc);
  return { doc, log };
}
