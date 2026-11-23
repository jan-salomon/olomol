// The mechanism steps of B4 (and of the arrow scan) as drawings: the 12 of
// scripts/arrow-gallery.mjs, those of data/b4-mechanisms.json, and its steps
// on Newman projections. Each { name, source, smiles, doc, newman? }.
import { readFileSync } from 'node:fs';
import { src } from './olomol.mjs';

// atoms and bonds by name, as arrow-gallery.mjs's finder (its notation), and new bonds 'new:A>B'
export function finder(doc) {
  const is = (atom, name) => {
    const [, el, sign] = name.match(/^([A-Z][a-z]?)([+-]?)$/);
    return atom.el === el && (sign === '-' ? atom.charge < 0 : sign === '+' ? atom.charge > 0 : !atom.charge);
  };
  const atomOf = (spec) => {
    const [name, nth = 0] = spec.split('#');
    const atom = [...doc.atoms.values()].filter((a) => is(a, name))[nth];
    if (!atom) throw new Error(`no atom ${spec}`);
    return atom.id;
  };
  return (spec) => {
    if (spec.startsWith('new:')) {
      const [from, to] = spec.slice(4).split('>');
      return { atom: atomOf(to), newBond: atomOf(from) };
    }
    const bond = spec.match(/^([A-Z][a-z]?[+-]?)([-=#])([A-Z][a-z]?[+-]?)(?:#(\d+))?$/);
    if (bond && !/^[A-Z][a-z]?[+-]?#\d+$/.test(spec)) {
      const order = { '-': 1, '=': 2, '#': 3 }[bond[2]];
      const list = [...doc.bonds.values()].filter((b) => {
        const [x, y] = [doc.atoms.get(b.a), doc.atoms.get(b.b)];
        return b.order === order && ((is(x, bond[1]) && is(y, bond[3])) || (is(x, bond[3]) && is(y, bond[1])));
      });
      if (!list[Number(bond[4] ?? 0)]) throw new Error(`no bond ${spec}`);
      return { bond: list[Number(bond[4] ?? 0)].id };
    }
    return { atom: atomOf(spec) };
  };
}

export async function mechanismSteps(RDKit) {
  const { MECHANISMS, mechanismDoc } = await import('../../scripts/arrow-gallery.mjs');
  const { addCurve, addAtom } = await src('model/doc.js');
  const { newmanDoc, cyclohexaneNewmanDoc } = await src('chem/newman.js');
  function withArrows(doc, arrows) {
    const find = finder(doc);
    for (const [from, to, electrons = 2] of arrows) {
      const start = find(from);
      if (electrons === 1 && start.atom !== undefined && doc.atoms.get(start.atom).radical) start.radical = true;
      addCurve(doc, start, find(to), electrons, { color: '#d40000' });
    }
    return doc;
  }
  const data = JSON.parse(readFileSync(new URL('../data/b4-mechanisms.json', import.meta.url), 'utf8'));
  const steps = [
    ...MECHANISMS.map((m) => ({ ...m, source: 'arrow-gallery' })),
    ...data.mechanisms.map((m) => ({ ...m, source: 'b4-mechanisms.json' })),
  ].map((m) => {
    try {
      return { name: m.name, source: m.source, smiles: m.smiles, doc: withArrows(mechanismDoc(RDKit, { smiles: m.smiles, arrows: [] }), m.arrows) };
    } catch (error) {
      throw new Error(`${m.name}: ${error.message}`);
    }
  });
  // steps on Newman projections: the molecule drawn so, hydroxide beside it
  for (const m of data.newman) {
    const doc = m.cyclohexane ? cyclohexaneNewmanDoc(m.cyclohexane) : newmanDoc(m.front, m.back, m.dihedral);
    const ids = [...doc.atoms.keys()];
    const byEl = (el, from) => ids.filter((id) => doc.atoms.get(id).el === el && [...doc.bonds.values()].some((b) => (b.a === id && b.b === from) || (b.b === id && b.a === from)));
    const xs = [...doc.atoms.values()].map((a) => a.x);
    const oh = addAtom(doc, Math.max(...xs) + 2, 0.5, 'O', { charge: -1, lonePairs: 'auto' });
    let front, back, leaving, h;
    if (m.cyclohexane) {
      [front, back] = [ids[0], ids[1]]; // C1 in front, C2 behind (cyclohexaneNewmanDoc)
      leaving = byEl('Cl', front)[0];
      // C2's axial H: added first of C2's two groups
      h = byEl('H', back)[0];
    } else {
      [front, back] = [ids[0], ids[1]];
      leaving = byEl('Br', front)[0];
      h = ids[5]; // the back's first group, H, drawn anti to the front's Br (dihedral 180°)
    }
    doc.atoms.get(leaving).lonePairs = 'auto';
    const bondOf = (a, b) => [...doc.bonds.values()].find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)).id;
    addCurve(doc, { atom: oh.id }, { atom: h }, 2, { color: '#d40000' });
    addCurve(doc, { bond: bondOf(back, h) }, { bond: bondOf(front, back) }, 2, { color: '#d40000' });
    addCurve(doc, { bond: bondOf(front, leaving) }, { atom: leaving }, 2, { color: '#d40000' });
    steps.push({ name: m.name, source: 'b4-mechanisms.json', smiles: null, doc, newman: true });
  }
  return steps;
}
