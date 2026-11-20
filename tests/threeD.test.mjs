// The 3D layout engine: complexes built from their coordination geometry
// (angles, cis and trans kept, chelates on neighbouring positions), views
// and depth wedges; molecules from OpenChemLib keep their R/S.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import OCL from 'openchemlib';
import { asDrawn, bestRotation, buildComplex, drawingOf, drawingOfModel, molfileWithStereo, moleculeIn3D, transitionCentre, transitionDrawing, views } from '../src/layout/threeD.js';
import { readMolfile, writeMolfile } from '../src/io/molfile.js';

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
OCL.Resources.register(readFileSync(new URL('../node_modules/openchemlib/dist/resources.json', import.meta.url), 'utf8'));
const DEG = Math.PI / 180;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const len = (a) => Math.hypot(...a);
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((s, v, i) => s + v * b[i], 0) / len(a) / len(b)))) / DEG;

// A complex drawn flat: the metal at the origin, each ligand a chain of atoms going out at its angle.
function drawn(metal, ligands) {
  const elements = [metal];
  const points = [[0, 0]];
  const links = [];
  for (const { atoms, at, kind } of ligands) {
    let previous = 0;
    atoms.forEach((el, k) => {
      elements.push(el);
      points.push([(k + 1) * Math.cos(at * DEG), (k + 1) * Math.sin(at * DEG)]);
      links.push({ a: previous, b: elements.length - 1, order: k === 0 ? 1 : 3, kind: k === 0 ? kind : undefined });
      previous = elements.length - 1;
    });
  }
  return { elements, points, links };
}

test('a rotation is found again (Horn)', () => {
  const a = 0.7;
  const r = [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const from = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, -1, 0]];
  const to = from.map((p) => r.map((row) => row.reduce((s, v, i) => s + v * p[i], 0)));
  const found = bestRotation(from, to);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(found[i][j] - r[i][j]) < 1e-6);
});

test('[Fe(CN)6]4−, drawn flat with dative bonds: octahedral, the C≡N straight out', () => {
  const molecule = drawn('Fe', [0, 60, 120, 180, 240, 300].map((at) => ({ atoms: ['C', 'N'], at, kind: 'dative' })));
  const { points, metal } = buildComplex(molecule);
  const carbons = molecule.elements.flatMap((el, i) => (el === 'C' ? [i] : []));
  for (const c of carbons) assert.ok(Math.abs(len(sub(points[c], points[metal])) - 1.8) < 0.05, 'Fe–C 1.8 (longer than other bonds: room for labels)');
  const angles = carbons.flatMap((c, k) => carbons.slice(k + 1).map((d) => Math.round(angle(sub(points[c], points[metal]), sub(points[d], points[metal])))));
  assert.deepEqual([...new Set(angles)].sort((p, q) => p - q), [90, 180]);
  for (const c of carbons) assert.ok(angle(sub(points[c], points[metal]), sub(points[c + 1], points[c])) < 2, 'C≡N along Fe–C');
  // the clearest view: no bond on top of another, all ligands apart
  const [view] = views(points, molecule.links.map((l) => [l.a, l.b]), { axes: false });
  const ends = carbons.map((c) => view.points[c + 1]);
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) assert.ok(len(sub(ends[i], ends[j])) > 0.5, 'the N apart');
});

test('square planar Pt: cis stays cis, trans stays trans', () => {
  for (const [name, angles, expected] of [['cis', [0, 90, 180, 270], 90], ['trans', [0, 180, 90, 270], 180]]) {
    const molecule = drawn('Pt', [{ atoms: ['Cl'], at: angles[0] }, { atoms: ['Cl'], at: angles[1] }, { atoms: ['N'], at: angles[2] }, { atoms: ['N'], at: angles[3] }]);
    const { points, flat } = buildComplex(molecule);
    assert.ok(flat, 'square planar');
    assert.equal(Math.round(angle(points[1], points[2])), expected, `${name}-PtCl2(NH3)2: Cl–Pt–Cl`);
  }
});

test('a chelate (ethylenediamine) on neighbouring positions; octahedral views get wedges and hashes', () => {
  // [Co(en)Cl4]: N–C–C–N, both N on Co
  const molecule = {
    elements: ['Co', 'N', 'C', 'C', 'N', 'Cl', 'Cl', 'Cl', 'Cl'],
    points: [[0, 0], [-0.6, 0.8], [-0.4, 1.8], [0.4, 1.8], [0.6, 0.8], [1, 0], [-1, 0], [0.5, -0.9], [-0.5, -0.9]],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 5], [0, 6], [0, 7], [0, 8]].map(([a, b]) => ({ a, b, order: 1 })),
  };
  const { points } = buildComplex(molecule);
  const bite = angle(points[1], points[4]);
  assert.ok(bite > 70 && bite < 100, `N–Co–N cis, the ligand as drawn (${bite.toFixed(0)}°)`);
  const [view] = views(points, molecule.links.map((l) => [l.a, l.b]), { axes: false });
  const molfile = ['', '', '', '  9  9  0  0  0  0  0  0  0  0999 V2000', ...molecule.elements.map((el) => `    0.0000    0.0000    0.0000 ${el.padEnd(3)} 0  0`),
    ...molecule.links.map(({ a, b }) => `${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}  1  0`), 'M  END'].join('\n');
  const { stereo } = drawingOf(view, { molfile, links: molecule.links, metal: 0 });
  const kinds = stereo.filter(([a, b]) => a === 0 || b === 0).map(([, , kind]) => kind);
  assert.ok(kinds.includes('wedge') && kinds.includes('hash'), `depth shown (${kinds})`);
});

// A main-group molecule from a SMILES, as the 3D engine gets it (lone pairs from our valence rules).
async function mainGroup(smiles) {
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const mol = RDKit.get_mol(smiles, JSON.stringify({ sanitize: false }));
  mol.set_new_coords();
  const { doc } = readMolfile(mol.get_molblock());
  mol.delete();
  const { molfile, atomIds } = writeMolfile(doc);
  const electrons = electronsByAtom(doc);
  return {
    elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs), molfile,
    points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]),
    links: [...doc.bonds.values()].map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order })),
  };
}

test('main-group molecules by VSEPR: PCl5, SF6, SF4, ClF3, XeF4, XeF2, sulfate', async () => {
  const shapes = {
    'ClP(Cl)(Cl)(Cl)Cl': [90, 90, 90, 90, 90, 90, 120, 120, 120, 180], // trigonal bipyramid
    'FS(F)(F)(F)(F)F': [...Array(12).fill(90), 180, 180, 180], // octahedron
    'FS(F)(F)F': [90, 90, 90, 90, 120, 180], // seesaw: the lone pair on the equator
    'FCl(F)F': [90, 90, 180], // T-shaped
    'F[Xe](F)(F)F': [90, 90, 90, 90, 180, 180], // square planar
    'F[Xe]F': [180], // linear
    'O=Cl(=O)(=O)[O-]': [109, 109, 109, 109, 109, 109], // tetrahedral
  };
  for (const [smiles, expected] of Object.entries(shapes)) {
    const molecule = await mainGroup(smiles);
    const { points, metal: c, flat } = buildComplex(molecule);
    const around = molecule.links.map((l) => (l.a === c ? l.b : l.a));
    const angles = around.flatMap((i, k) => around.slice(k + 1).map((j) => Math.round(angle(sub(points[i], points[c]), sub(points[j], points[c])))));
    assert.deepEqual(angles.sort((p, q) => p - q), expected, smiles);
    assert.equal(Boolean(flat), smiles === 'F[Xe](F)(F)F', `${smiles}: flat`);
  }
  // sulfate as textbooks draw it: S=O in the page, wedge and hash to the O⁻
  const sulfate = await mainGroup('O=S(=O)([O-])[O-]');
  const complex = buildComplex(sulfate);
  const [view] = views(complex.points, sulfate.links.map((l) => [l.a, l.b]), { axes: false, prefer: complex.prefer, complex });
  const { stereo } = drawingOf(view, { molfile: sulfate.molfile, links: sulfate.links, metal: complex.metal });
  const kinds = stereo.filter(([a, b]) => sulfate.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)).order === 1).map(([, , kind]) => kind).sort();
  assert.deepEqual(kinds, ['hash', 'wedge']);
  // organic molecules stay with OpenChemLib; a P with five bonds and a phenyl only when OpenChemLib can't
  assert.equal(buildComplex(await mainGroup('CS(=O)(=O)c1ccccc1')), null, 'a sulfone');
  assert.equal(buildComplex(await mainGroup('ClP(Cl)(Cl)(Cl)c1ccccc1')), null);
  // (MMFF94 has no types for it: OpenChemLib's structure as generated, energy unknown, so the VSEPR one is taken)
  assert.equal(moleculeIn3D(OCL, writeMolfile(readMolfile(RDKit.get_mol('ClP(Cl)(Cl)(Cl)c1ccccc1').get_molblock()).doc).molfile).energy, null);
  assert.ok(buildComplex(await mainGroup('ClP(Cl)(Cl)(Cl)c1ccccc1'), { anyLigands: true }).points);
});

test('molecules from OpenChemLib: projected views keep R/S and E/Z', () => {
  const canonical = (molfile) => {
    const mol = RDKit.get_mol(molfile);
    try {
      return mol.get_smiles();
    } finally {
      mol.delete();
    }
  };
  for (const smiles of ['C[C@@H](N)C(=O)O', 'C/C=C\\C', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O', 'C1C2CC3CC1CC(C2)C3']) {
    const rd = RDKit.get_mol(smiles);
    rd.set_new_coords();
    const { doc } = readMolfile(rd.get_molblock());
    rd.delete();
    const { molfile, atomIds } = writeMolfile(doc);
    const links = [...doc.bonds.values()].map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order }));
    const points = moleculeIn3D(OCL, molfile);
    const [view] = views(points, links.map((l) => [l.a, l.b]));
    const drawing = drawingOf(view, { molfile, links });
    // the projected coordinates and the new wedges, read by RDKit
    const lines = molfileWithStereo(molfile, drawing.stereo).split('\n');
    drawing.points.forEach(([x, y], i) => {
      lines[4 + i] = `${x.toFixed(4).padStart(10)}${(-y).toFixed(4).padStart(10)}${lines[4 + i].slice(20)}`;
    });
    assert.equal(canonical(lines.join('\n')), canonical(smiles), smiles);
  }
});

test('turning by hand: rotations keep the molecule, the projection foreshortens; the 3D model is checked for R/S', async () => {
  const { multiply, projected, rotationAbout, molfile3D } = await import('../src/layout/threeD.js');
  const { stereoFits } = await import('../src/io/xyz.js');
  // a turn and its product with another keep lengths; a bond along z is a point on the page
  const r = multiply(rotationAbout([0, 1, 0], 0.7), rotationAbout([0.6, 0, 0.8], 1.3));
  const points = [[0, 0, 0], [1, 0, 0], [0, 0, 1]];
  const view = projected(points, r);
  assert.ok(Math.abs(len(sub(view.points3[1], view.points3[0])) - 1) < 1e-9 && Math.abs(len(sub(view.points3[2], view.points3[0])) - 1) < 1e-9);
  const front = projected(points, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.ok(len(sub(front.points[2], front.points[0])) < 1e-9 && front.depth[2] === 1, 'a bond towards the viewer: no length on the page');
  // hinckdentine A: OpenChemLib's model (from the molfile's wedges) is checked by RDKit; one of the first tries has the drawn R/S
  const mol = RDKit.get_mol('C1CNC(=O)C[C@H]2[C@@]13C4=C(C=CC(=C4)Br)N=CN3C5=C2C=C(C=C5Br)Br');
  mol.set_new_coords();
  const { doc } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })));
  mol.delete();
  const { molfile } = writeMolfile(doc);
  const tries = [42, 1, 2, 3, 4, 5, 6, 7].flatMap((seed) => {
    const found = moleculeIn3D(OCL, molfile, seed);
    return found ? [found, found.map(([x, y, z]) => [x, y, -z])] : [];
  });
  const fits = tries.map((p) => stereoFits(RDKit, molfile, () => molfile3D(molfile, p)));
  assert.ok(fits.includes(true), 'a model with the drawn R/S');
  assert.ok(fits.includes(false), 'and the check tells a wrong one (its mirror image) apart');
});

test('a complex with OpenChemLib: each ligand in its own 3D shape (a chelate ring puckered, water bent)', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const ring = Array.from({ length: 6 }, (_, k) => [1.5 * Math.cos((k * Math.PI) / 3), 1.5 * Math.sin((k * Math.PI) / 3)]);
  const moleculeOf = (doc) => {
    const electrons = electronsByAtom(doc);
    const { molfile, atomIds } = writeMolfile(doc);
    return {
      atomIds, molfile, elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs),
      links: [...doc.bonds.values()].map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind })),
      points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]),
    };
  };
  // [Ni(en)3]3+: every N–C–C–N twisted (a five-membered chelate ring is never flat), and close to the metal
  const ni = emptyDoc();
  const m = addAtom(ni, 0, 0, 'Ni', { charge: 3 });
  const chains = [0, 2, 4].map((k) => {
    const [a, b] = [ring[k], ring[k + 1]];
    const [n1, c1, c2, n2] = [addAtom(ni, ...a, 'N'), addAtom(ni, a[0] * 1.8, a[1] * 1.8, 'C'), addAtom(ni, b[0] * 1.8, b[1] * 1.8, 'C'), addAtom(ni, ...b, 'N')];
    addBond(ni, n1.id, c1.id); addBond(ni, c1.id, c2.id); addBond(ni, c2.id, n2.id);
    addBond(ni, n1.id, m.id, 1, { kind: 'dative' }); addBond(ni, n2.id, m.id, 1, { kind: 'dative' });
    return [n1, c1, c2, n2].map((x) => x.id);
  });
  const molecule = moleculeOf(ni);
  const { points, metal } = buildComplex(molecule, { OCL });
  const at = (id) => points[molecule.atomIds.indexOf(id)];
  const torsion = ([a, b, c, d]) => {
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const [b1, b2, b3] = [sub(at(b), at(a)), sub(at(c), at(b)), sub(at(d), at(c))];
    return angle(cross(b1, b2), cross(b2, b3));
  };
  for (const chain of chains) {
    assert.ok(torsion(chain) > 25 && torsion(chain) < 90, `N–C–C–N ${torsion(chain).toFixed(0)}°: puckered`);
    for (const id of chain) assert.ok(len(sub(at(id), points[metal])) < 3.2, 'the chelate near its metal');
  }
  // a water on cobalt: H–O–H bent as in water, not as drawn on the page
  const co = emptyDoc();
  const cobalt = addAtom(co, 0, 0, 'Co');
  const water = ring.map(([x, y]) => {
    const o = addAtom(co, x, y, 'O');
    addBond(co, o.id, cobalt.id, 1, { kind: 'dative' });
    return [o.id, ...[-0.6, 0.6].map((s) => { const h = addAtom(co, x * 1.5 - y * s, y * 1.5 + x * s, 'H'); addBond(co, o.id, h.id); return h.id; })];
  });
  const wet = moleculeOf(co);
  const built = buildComplex(wet, { OCL });
  const [o, h1, h2] = water[0].map((id) => built.points[wet.atomIds.indexOf(id)]);
  const hoh = angle(sub(h1, o), sub(h2, o));
  assert.ok(hoh > 100 && hoh < 115, `H–O–H ${hoh.toFixed(0)}°`);
});

test('a hexadentate ligand wraps its metal (Ca–EDTA); S8 is a crown at its lowest energy; boron without MMFF94', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const doc = emptyDoc();
  const ca = addAtom(doc, 0, 0, 'Ca', { charge: 2 });
  const [n1, n2] = [addAtom(doc, -0.7, -1, 'N'), addAtom(doc, 0.7, -1, 'N')];
  const [e1, e2] = [addAtom(doc, -0.5, -2, 'C'), addAtom(doc, 0.5, -2, 'C')];
  addBond(doc, n1.id, e1.id); addBond(doc, e1.id, e2.id); addBond(doc, e2.id, n2.id);
  for (const [n, sx] of [[n1, -1], [n2, 1]]) {
    for (const sy of [-1, 1]) {
      const [c, k] = [addAtom(doc, sx * 2, sy * 0.8, 'C'), addAtom(doc, sx * 2.5, sy * 1.6, 'C')];
      const [o1, o2] = [addAtom(doc, sx * 1.5, sy * 1.8, 'O', { charge: -1 }), addAtom(doc, sx * 3.3, sy * 2, 'O')];
      addBond(doc, n.id, c.id); addBond(doc, c.id, k.id); addBond(doc, k.id, o1.id); addBond(doc, k.id, o2.id, 2);
      addBond(doc, o1.id, ca.id, 1, { kind: 'dative' });
    }
  }
  addBond(doc, n1.id, ca.id, 1, { kind: 'dative' }); addBond(doc, n2.id, ca.id, 1, { kind: 'dative' });
  const electrons = electronsByAtom(doc);
  const { molfile, atomIds } = writeMolfile(doc);
  const links = [...doc.bonds.values()].map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind }));
  const molecule = { molfile, links, elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs), points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]) };
  const { points, metal } = buildComplex(molecule, { OCL });
  const zs = points.map((p) => p[2]);
  assert.ok(Math.max(...zs) - Math.min(...zs) > 2, 'not flat');
  // (UFF's Ca–O and Ca–N, about 2.2 Å: some 1.55 bond lengths)
  const reach = links.filter((x) => x.kind === 'dative').map((l) => len(sub(points[l.a], points[metal])));
  assert.ok(reach.every((r) => r > 1.3 && r < 2), `each donor bonded to Ca (${reach.map((r) => r.toFixed(2)).join(' ')})`);
  const toCa = links.filter((x) => x.kind === 'dative').map((l) => sub(points[l.a], points[metal]));
  const across = toCa.flatMap((u, i) => toCa.slice(i + 1).map((v) => angle(u, v))).filter((a) => a > 150);
  assert.equal(across.length, 3, 'six donors round it, three pairs across (an octahedron)');
  for (const l of links.filter((x) => !x.kind)) assert.ok(len(sub(points[l.a], points[l.b])) > 0.8 && len(sub(points[l.a], points[l.b])) < 1.3, 'the ligand\'s bonds as in the free ligand');
  // S8: the lowest-energy try of a few is the crown (every S–S–S–S torsion about ±100°)
  const s8 = RDKit.get_mol('S1SSSSSSS1');
  s8.set_new_coords();
  const [crown] = [42, 1, 2, 3].map((seed) => moleculeIn3D(OCL, s8.get_molblock(), seed)).sort((p, q) => p.energy - q.energy);
  s8.delete();
  const torsion = (i) => {
    const p = [0, 1, 2, 3].map((k) => crown[(i + k) % 8]);
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return angle(cross(sub(p[1], p[0]), sub(p[2], p[1])), cross(sub(p[2], p[1]), sub(p[3], p[2])));
  };
  for (let i = 0; i < 8; i++) assert.ok(Math.abs(torsion(i) - 100) < 10, `S8 torsion ${torsion(i).toFixed(0)}°`);
  // phenylboronic acid: no MMFF94 types for B, OpenChemLib's structure as generated
  const boron = RDKit.get_mol('OB(O)c1ccccc1');
  boron.set_new_coords();
  const built = moleculeIn3D(OCL, boron.get_molblock());
  boron.delete();
  assert.ok(built && built.length === 9 && built.energy === null);
});

test('a transition state (SN2): a trigonal bipyramid, Nu···C···LG across, the groups round it as drawn (not its mirror image)', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  // HO···CH(CH3)(C2H5)···Br drawn roughly, the wedges as for (S)-2-bromobutane attacked from behind
  for (const wedges of [['hash', 'wedge'], ['wedge', 'hash']]) {
    const doc = emptyDoc();
    const c = addAtom(doc, 0, 0);
    const o = addAtom(doc, -1.2, 0.1, 'O');
    const br = addAtom(doc, 1.2, -0.1, 'Br');
    addBond(doc, o.id, c.id, 1, { kind: 'partial' });
    addBond(doc, c.id, br.id, 1, { kind: 'partial' });
    addBond(doc, c.id, addAtom(doc, 0, -1, 'H').id);
    addBond(doc, c.id, addAtom(doc, -0.5, 0.9).id, 1, { stereo: wedges[0] });
    const ch2 = addAtom(doc, 0.5, 0.9);
    addBond(doc, c.id, ch2.id, 1, { stereo: wedges[1] });
    addBond(doc, ch2.id, addAtom(doc, 1.4, 1.3).id);
    const electrons = electronsByAtom(doc);
    const { molfile, atomIds } = writeMolfile(doc);
    const bonds = [...doc.bonds.values()];
    const molecule = { molfile, elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs),
      links: bonds.map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind, stereo: b.stereo })), points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]) };
    const centre = transitionCentre(molecule);
    assert.deepEqual([centre.centre, [...centre.axial].sort()], [atomIds.indexOf(c.id), [atomIds.indexOf(o.id), atomIds.indexOf(br.id)].sort()]);
    const complex = buildComplex(molecule, { OCL, ...centre });
    const model = { metal: complex.metal, complex, axial: complex.axial };
    const [view] = views(complex.points, molecule.links.map((l) => [l.a, l.b]), { axes: false, prefer: complex.prefer, complex, count: 1 });
    const drawing = transitionDrawing(molecule, model, drawingOfModel(RDKit, molecule, model, view));
    const at = (id) => drawing.points[atomIds.indexOf(id)];
    assert.ok(Math.abs(at(o.id)[1] - at(c.id)[1]) < 1e-6 && Math.abs(at(br.id)[1] - at(c.id)[1]) < 1e-6 && at(o.id)[0] < at(c.id)[0] && at(c.id)[0] < at(br.id)[0], 'HO···C···Br across');
    // as the reactant (C–Br a bond, no O): the R/S of the drawing it was laid out from
    const asReactant = (points, stereo) => {
      const copy = structuredClone(doc);
      for (const b of copy.bonds.values()) if (b.kind === 'partial') (copy.atoms.get(b.a === c.id ? b.b : b.a).el === 'Br' ? delete b.kind : copy.bonds.delete(b.id));
      atomIds.forEach((id, k) => Object.assign(copy.atoms.get(id), { x: points[k][0], y: points[k][1] }));
      for (const b of copy.bonds.values()) {
        const s = stereo?.find(([p, q]) => [p, q].includes(atomIds.indexOf(b.a)) && [p, q].includes(atomIds.indexOf(b.b)));
        if (stereo) b.stereo = s?.[2] ?? '';
        if (s && s[2] && atomIds[s[0]] !== b.a) [b.a, b.b] = [b.b, b.a];
      }
      const mol = RDKit.get_mol(writeMolfile(copy, atomIds.filter((id) => id !== o.id)).molfile, JSON.stringify({ removeHs: false }));
      const tags = JSON.parse(mol.get_stereo_tags()).CIP_atoms;
      mol.delete();
      return tags?.[0]?.[1];
    };
    assert.equal(asReactant(drawing.points, drawing.stereo), asReactant(molecule.points, null), `drawn with ${wedges}: the same R/S`);
  }
});

test('a chiral complex drawn with wedged coordination bonds (cis-[CoCl2(en)2]+, Λ or Δ): its 3D model as drawn, not its mirror image', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const volume3 = (u, v, w) => u[0] * cross(v, w)[0] + u[1] * cross(v, w)[1] + u[2] * cross(v, w)[2];
  const built = (mirror) => {
    // Co in the middle: N up and down in the page, on the left N (hashed) and N (wedge), on the right Cl (hashed) and Cl (wedge)
    const doc = emptyDoc();
    const co = addAtom(doc, 0, 0, 'Co', { charge: 3 });
    const at = { up: [0, -1.5], down: [0, 1.5], leftUp: [-1.3, -0.6], leftDown: [-1.3, 0.6], rightUp: [1.3, -0.6], rightDown: [1.3, 0.6] };
    const depth = { up: '', down: '', leftUp: 'hash', leftDown: 'wedge', rightUp: 'hash', rightDown: 'wedge' };
    const swap = { hash: 'wedge', wedge: 'hash', '': '' };
    const donor = {};
    for (const [place, el] of [['up', 'N'], ['leftUp', 'N'], ['leftDown', 'N'], ['down', 'N'], ['rightUp', 'Cl'], ['rightDown', 'Cl']]) {
      donor[place] = addAtom(doc, ...at[place], el, el === 'Cl' ? { charge: -1 } : {});
      addBond(doc, donor[place].id, co.id, 1, { kind: 'dative', stereo: mirror ? swap[depth[place]] : depth[place] });
    }
    // the two ethylenediamines: N(up)–C–C–N(leftUp), N(leftDown)–C–C–N(down)
    for (const [p, q] of [['up', 'leftUp'], ['leftDown', 'down']]) {
      const [a, b] = [at[p], at[q]];
      const c1 = addAtom(doc, a[0] - 0.9, a[1] - 0.2);
      const c2 = addAtom(doc, b[0] - 0.9, b[1] - 0.2);
      addBond(doc, donor[p].id, c1.id);
      addBond(doc, c1.id, c2.id);
      addBond(doc, c2.id, donor[q].id);
    }
    const electrons = electronsByAtom(doc);
    const { molfile, atomIds } = writeMolfile(doc);
    const bonds = [...doc.bonds.values()];
    const molecule = { molfile, elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs),
      links: bonds.map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind, stereo: b.stereo })),
      points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]) };
    const complex = buildComplex(molecule, { OCL });
    const points = asDrawn(molecule, complex.metal, complex.points);
    const order = ['up', 'leftUp', 'leftDown', 'down', 'rightUp', 'rightDown'].map((place) => atomIds.indexOf(donor[place].id));
    return { vectors: order.map((i) => sub(points[i], points[complex.metal])), drawn: order.map((i, k) => {
      const place = ['up', 'leftUp', 'leftDown', 'down', 'rightUp', 'rightDown'][k];
      const z = { wedge: 1, hash: -1, '': 0 }[mirror ? swap[depth[place]] : depth[place]];
      return [at[place][0], -at[place][1], z];
    }) };
  };
  const signs = [false, true].map((mirror) => {
    const { vectors, drawn } = built(mirror);
    // (the triple up, left-down wedge or hash, right-down: one the drawing makes chiral)
    const [u, v, w] = [vectors[0], vectors[2], vectors[5]];
    const [du, dv, dw] = [drawn[0], drawn[2], drawn[5]];
    assert.ok(volume3(u, v, w) * volume3(du, dv, dw) > 0, `drawn ${mirror ? 'one way' : 'the other way'}: the model as drawn`);
    return Math.sign(volume3(u, v, w));
  });
  assert.equal(signs[0], -signs[1], 'the two drawings: mirror images in 3D');
});

test('a boron with four bonds (BODIPY\'s B⁻) minimised as the carbon it is like: the conjugated system flat', () => {
  const mol = RDKit.get_mol('F[B-]1(F)n2cccc2C=C2C=CC=[N+]21');
  mol.set_new_coords();
  const block = mol.get_molblock();
  mol.delete();
  const points = moleculeIn3D(OCL, block, 42);
  assert.ok(points && points.energy !== null, 'minimised (an MMFF94 energy)');
  // every C and N within a hair of the plane of three of the ring's atoms
  const elements = block.split('\n').slice(4, 4 + points.length).map((line) => line.slice(31, 34).trim());
  const flat = elements.flatMap((el, i) => (el === 'C' || el === 'N' ? [i] : []));
  const [p, q, r] = flat.slice(0, 3).map((i) => points[i]);
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const normal = cross(sub(q, p), sub(r, p));
  const unit = normal.map((v) => v / len(normal));
  const off = Math.max(...flat.map((i) => Math.abs(sub(points[i], p).reduce((s, v, k) => s + v * unit[k], 0))));
  assert.ok(off < 0.05, `flat (${off.toFixed(3)} bond lengths out of the plane at most)`);
});

// --- metal complexes optimised as a whole by UFF (complex3D.js) ---

// A complex from a SMILES with the metal bonded (its donors one charge up, so that RDKit takes it), laid out
// by RDKit, then as drawn in olomol: the bonds to the metal dative, the donors one charge down. `at`: the
// metal's own charge. Returns { molecule, built, donors, angles (between every two donors, sorted) }.
async function complexFrom(smiles, at, { covalent = () => false } = {}) {
  const { addParsed, parseMolfile } = await import('../src/io/molfile.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const mol = RDKit.get_mol(smiles);
  mol.set_new_coords(true);
  const { doc } = addParsed(parseMolfile(mol.get_molblock()));
  mol.delete();
  const metal = [...doc.atoms.values()].find((a) => !['C', 'N', 'O', 'H', 'Cl', 'B'].includes(a.el));
  metal.charge = at;
  for (const b of doc.bonds.values()) {
    if (b.a !== metal.id && b.b !== metal.id) continue;
    if (b.a === metal.id) [b.a, b.b] = [b.b, b.a];
    if (covalent(doc.atoms.get(b.a))) continue; // (an anionic donor drawn with an ordinary bond, as it was)
    doc.atoms.get(b.a).charge -= 1;
    b.kind = 'dative';
  }
  const electrons = electronsByAtom(doc);
  const { molfile, atomIds } = writeMolfile(doc);
  const molecule = {
    atomIds, molfile, elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs),
    links: [...doc.bonds.values()].map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind })),
    points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]),
  };
  const built = buildComplex(molecule, { OCL });
  const m = built.metal;
  const donors = molecule.links.filter((l) => l.b === m).map((l) => l.a);
  const angles = donors.flatMap((d, k) => donors.slice(k + 1).map((e) => Math.round(angle(sub(built.points[d], built.points[m]), sub(built.points[e], built.points[m]))))).sort((a, b) => a - b);
  return { molecule, built, donors, angles };
}

// How far atoms are from the plane through three others, at most.
function offPlane(points, ids, [a, b, c]) {
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const n = cross(sub(points[b], points[a]), sub(points[c], points[a]));
  const unit = n.map((v) => v / len(n));
  return Math.max(...ids.map((i) => Math.abs(sub(points[i], points[a]).reduce((s, v, k) => s + v * unit[k], 0))));
}

// A ligand's core: its donors and the atoms up to two bonds from them (not through the metal).
function core(molecule, metal, donors) {
  const near = (i) => molecule.links.filter((l) => (l.a === i || l.b === i) && l.a !== metal && l.b !== metal).map((l) => (l.a === i ? l.b : l.a));
  const out = new Set(donors);
  for (const d of donors) for (const j of near(d)) { out.add(j); for (const k of near(j)) out.add(k); }
  return [...out];
}

test('UFF: porphyrins and phthalocyanines flat round their metal, with axial ligands too; substituents in their own shapes (cyclohexyl chairs, twisted phenyls)', async () => {
  const porphyrin = (metal, extra) => `[${metal}]%91%92%93%94${extra}.C1=CC2=[N+]%91C1=CC1=CC=C(N1%92)C=C1C=CC(=[N+]1%93)C=C1C=CC(=C2)N1%94`;
  for (const [name, smiles, at, shape] of [
    ['Fe porphyrin', porphyrin('Fe', ''), 2, 'square'],
    ['Zn porphyrin + pyridine', porphyrin('Zn', '[n+]1ccccc1'), 2, 'square pyramid'],
    ['Fe porphyrin + two waters', porphyrin('Fe', '([OH2+])[OH2+]'), 3, 'octahedron'],
    ['heme + methylimidazole + O2', porphyrin('Fe', '([n+]1ccn(C)c1)[O+]=O'), 2, 'octahedron'],
  ]) {
    const { molecule, built, donors, angles } = await complexFrom(smiles, at);
    assert.equal(built.polyhedron, shape, `${name}: a ${shape}`);
    const ring = donors.filter((d) => molecule.elements[d] === 'N' && molecule.links.filter((l) => l.a === d || l.b === d).length === 3 && core(molecule, built.metal, [d]).length > 6);
    const ns = ring.length === 4 ? ring : donors.slice(0, 4);
    const off = offPlane(built.points, core(molecule, built.metal, ns).filter((i) => molecule.elements[i] !== 'H'), ns);
    assert.ok(off < 0.35, `${name}: the porphyrin flat (${off.toFixed(2)} out of its plane at most)`);
    assert.ok(angles.filter((a) => a > 165).length >= 2, `${name}: its N trans across the metal (${angles.join(' ')})`);
  }
  // Fe phthalocyanine with three cyclohexyls (as J drew it, the cyclohexyls were flat): the core flat, each cyclohexyl a chair
  const pc = await complexFrom('[Fe]%91%92%93%94.C1CCC(CC1)c1ccc(C2CCCCC2)c2c1C1=NC3=[N+]%91C(=NC4=C5C=CC=CC5=C(N=C5[N+]%93=C(N=C2N1%92)c1c(C2CCCCC2)cccc15)N4%94)c1ccccc13', 2);
  assert.equal(pc.built.polyhedron, 'square');
  assert.ok(offPlane(pc.built.points, core(pc.molecule, pc.built.metal, pc.donors), pc.donors) < 0.5, 'the phthalocyanine flat');
  const P = pc.built.points;
  const torsion = (a, b, c, d) => {
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const [b1, b2, b3] = [sub(P[b], P[a]), sub(P[c], P[b]), sub(P[d], P[c])];
    const [n1, n2] = [cross(b1, b2), cross(b2, b3)];
    return Math.abs((Math.atan2(cross(n1, n2).reduce((s, v, i) => s + v * b2[i], 0) / len(b2), n1.reduce((s, v, i) => s + v * n2[i], 0)) * 180) / Math.PI);
  };
  const saturated = (i) => pc.molecule.elements[i] === 'C' && !pc.molecule.links.some((l) => (l.a === i || l.b === i) && l.order > 1);
  const near = (i) => pc.molecule.links.filter((l) => l.a === i || l.b === i).map((l) => (l.a === i ? l.b : l.a));
  const rings = [];
  for (let a = 0; a < P.length; a++) {
    if (!saturated(a)) continue;
    const walk = (path) => {
      if (path.length === 6) { if (near(path[5]).includes(path[0]) && path[1] < path[5]) rings.push(path); return; }
      for (const j of near(path.at(-1))) if (saturated(j) && !path.includes(j) && j > path[0]) walk([...path, j]);
    };
    walk([a]);
  }
  assert.equal(rings.length, 3, 'three cyclohexyls');
  for (const r of rings) {
    const mean = r.reduce((s, _, k) => s + torsion(r[k], r[(k + 1) % 6], r[(k + 2) % 6], r[(k + 3) % 6]), 0) / 6;
    assert.ok(mean > 45 && mean < 65, `a cyclohexyl a chair (ring torsions ${mean.toFixed(0)}° on average; flat would be 0°)`);
  }
});

test('UFF: chelates as physics has them (terpyridine and dipicolinate meridional, tacn facial, salen square planar), the polyhedron by energy ([ZnCl4]2− tetrahedral, Fe(CO)5 a trigonal bipyramid) or by d8/d9 ([Ni(CN)4]2−, [Cu(NH3)4]2+ square)', async () => {
  const terpy = (a, b, c) => `[n+]${a}1ccccc1-c1cccc([n+]${b}1)-c1cccc[n+]${c}1`;
  const bis = await complexFrom(`[Fe]%91%92%93%94%95%96.${terpy('%91', '%92', '%93')}.${terpy('%94', '%95', '%96')}`, 3);
  assert.equal(bis.angles.filter((a) => a > 160).length, 3, `[Fe(terpy)2]3+: octahedral (${bis.angles.join(' ')})`);
  // each terpyridine meridional: its outer N across the metal
  for (const three of [bis.donors.slice(0, 3), bis.donors.slice(3)]) {
    const widest = Math.max(...three.flatMap((d, k) => three.slice(k + 1).map((e) => angle(sub(bis.built.points[d], bis.built.points[bis.built.metal]), sub(bis.built.points[e], bis.built.points[bis.built.metal])))));
    assert.ok(widest > 150, `a terpyridine meridional (${widest.toFixed(0)}°)`);
  }
  const dipic = await complexFrom('[Co]%91%92%93%94%95%96.O=C(O%91)c1cccc(C(=O)O%92)[n+]1%93.O=C(O%94)c1cccc(C(=O)O%95)[n+]1%96', 3);
  assert.ok(dipic.angles.filter((a) => a > 160).length === 3 && dipic.angles.slice(0, 12).every((a) => a > 75 && a < 105), `[Co(dipic)2]−: octahedral, meridional (${dipic.angles.join(' ')})`);
  const tacn = await complexFrom('[Fe]%91%92%93%94%95%96.C1C[NH+]%91CC[NH+]%92CC[NH+]%931.C1C[NH+]%94CC[NH+]%95CC[NH+]%961', 3);
  for (const three of [tacn.donors.slice(0, 3), tacn.donors.slice(3)]) {
    const widest = Math.max(...three.flatMap((d, k) => three.slice(k + 1).map((e) => angle(sub(tacn.built.points[d], tacn.built.points[tacn.built.metal]), sub(tacn.built.points[e], tacn.built.points[tacn.built.metal])))));
    assert.ok(widest < 110, `a tacn facial (${widest.toFixed(0)}°)`);
  }
  const salen = await complexFrom('[Co]%91%92%93%94.O%91c1ccccc1C=[N+]%92CC[N+]%93=Cc1ccccc1O%94', 2);
  assert.equal(salen.built.polyhedron, 'square', 'Co(salen): square planar');
  const mn = await complexFrom('[Mn]%91%92%93%94Cl.O%91c1ccccc1C=[N+]%92CC[N+]%93=Cc1ccccc1O%94', 3);
  assert.equal(mn.built.polyhedron, 'square pyramid', 'Mn(salen)Cl: a square pyramid, the salen flat under the Cl');
  for (const [name, smiles, at, shape] of [
    ['[ZnCl4]2−', 'Cl[Zn](Cl)(Cl)Cl', 2, 'tetrahedron'],
    ['[CoCl4]2−', 'Cl[Co](Cl)(Cl)Cl', 2, 'tetrahedron'],
    ['[Ni(CN)4]2−', 'N#C[Ni](C#N)(C#N)C#N', 2, 'square'],
    ['[Cu(NH3)4]2+', '[NH3+][Cu]([NH3+])([NH3+])[NH3+]', 2, 'square'],
    ['Fe(CO)5', '[Fe]%91%92%93%94%95.[O+]#C%91.[O+]#C%92.[O+]#C%93.[O+]#C%94.[O+]#C%95', 0, 'trigonal bipyramid'],
  ]) {
    const { built } = await complexFrom(smiles, at);
    assert.equal(built.polyhedron, shape, `${name}: a ${shape}`);
  }
  // copper(II) drawn neutral, its anionic donors on ordinary bonds (as Cu(gly)2 and Cu(acac)2 usually are): square
  const glycinate = (n, o) => `[NH2+]${n}CC(=O)O${o}`;
  const gly = await complexFrom(`[Cu]%91%92%93%94.${glycinate('%91', '%92')}.${glycinate('%93', '%94')}`, 0, { covalent: (atom) => atom.el === 'O' });
  assert.equal(gly.built.polyhedron, 'square', 'Cu(gly)2 drawn neutral: copper(II), square planar');
  const acac = await complexFrom('[Cu]%91%92%93%94.CC(O%91)=CC(C)=[O+]%92.CC(O%93)=CC(C)=[O+]%94', 0, { covalent: (atom) => atom.charge === 0 });
  assert.equal(acac.built.polyhedron, 'square', 'Cu(acac)2 drawn neutral: square planar');
  for (const [name, smiles] of [['CuCl2(NH3)2', 'Cl[Cu](Cl)([NH3+])[NH3+]'], ['CuCl2(py)2', 'Cl[Cu](Cl)([n+]1ccccc1)[n+]1ccccc1'], ['CuBr2(NH3)2', 'Br[Cu](Br)([NH3+])[NH3+]']]) {
    // (with monodentate ligands UFF alone prefers a tetrahedron: the drawn bonds say copper(II))
    const made = await complexFrom(smiles, 0, { covalent: (atom) => atom.el === 'Cl' || atom.el === 'Br' });
    assert.equal(made.built.polyhedron, 'square', `${name} drawn neutral, its halides on ordinary bonds: copper(II), square planar`);
  }
});


test('UFF: a label as the atom it hangs by (RhCl(PPh3)3 with its PPh3 written as labels: square planar), a partial bond longer than a whole one (a Pd oxidative-addition transition state)', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const moleculeOf = (doc) => {
    const electrons = electronsByAtom(doc);
    const { molfile, atomIds } = writeMolfile(doc);
    return {
      atomIds, molfile, elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs),
      links: [...doc.bonds.values()].map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind })),
      points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]),
    };
  };
  const wilkinson = emptyDoc();
  const rh = addAtom(wilkinson, 0, 0, 'Rh');
  addBond(wilkinson, addAtom(wilkinson, 1.5, 0, 'Cl', { charge: -1 }).id, rh.id, 1, { kind: 'dative' });
  for (const [x, y] of [[0, -1.5], [-1.5, 0], [0, 1.5]]) addBond(wilkinson, addAtom(wilkinson, x, y, '*', { alias: 'PPh3' }).id, rh.id, 1, { kind: 'dative' });
  const built = buildComplex(moleculeOf(wilkinson), { OCL });
  assert.equal(built.polyhedron, 'square', 'built by UFF, square planar (rhodium(I), d8)');
  assert.equal(built.hydrogens.length, 9, 'each PPh3 as PH3');
  // Pd(PMe3)2 with partial bonds to the C and Br of a C–Br, which is partial too
  const ts = emptyDoc();
  const pd = addAtom(ts, 0, 0, 'Pd');
  for (const [x, y] of [[-1.3, -0.8], [-1.3, 0.8]]) {
    const p = addAtom(ts, x, y, 'P');
    addBond(ts, p.id, pd.id, 1, { kind: 'dative' });
    for (const k of [0, 1, 2]) addBond(ts, p.id, addAtom(ts, x - 0.8 + 0.3 * k, y + Math.sign(y) * 0.8, 'C').id);
  }
  const [c, br, me] = [addAtom(ts, 1.2, -0.6, 'C'), addAtom(ts, 1.2, 0.8, 'Br'), addAtom(ts, 2.4, -1.2, 'C')];
  addBond(ts, c.id, me.id);
  for (const [a, b] of [[c, br], [c, pd], [br, pd]]) addBond(ts, a.id, b.id, 1, { kind: 'partial' });
  const molecule = moleculeOf(ts);
  const model = buildComplex(molecule, { OCL });
  const at = (atom) => model.points[molecule.atomIds.indexOf(atom.id)];
  assert.ok(model.polyhedron, 'built by UFF, not the older way');
  assert.ok(len(sub(at(c), at(br))) > 1.3 * len(sub(at(c), at(me))), `the breaking C···Br longer than a C–C (${len(sub(at(c), at(br))).toFixed(2)} vs ${len(sub(at(c), at(me))).toFixed(2)})`);
});

test('the drawn conformation in 3D: a chair\'s axial group axial, a Newman projection\'s torsions as drawn (gauche, eclipsed), a diene s-cis as drawn, cyclohexane\'s trans-diaxial', async () => {
  const { chairDoc } = await import('../src/chem/chair.js');
  const { newmanDoc, cyclohexaneNewmanDoc } = await import('../src/chem/newman.js');
  const { conformationOf, hasConformation, setTorsions, torsion } = await import('../src/chem/conformation.js');
  const mirror = (points) => points.map(([x, y, z]) => [x, y, -z]);
  // the angle of a ring atom's group to the ring's axis: axial near 0°, equatorial near 70°
  const toAxis = (points, ring, atom, group) => {
    const c = [0, 1, 2].map((k) => ring.reduce((s, i) => s + points[i][k], 0) / 6);
    let n = [0, 0, 0];
    ring.forEach((i, k) => {
      const [u, v] = [sub(points[i], c), sub(points[ring[(k + 1) % 6]], c)];
      n = n.map((x, q) => x + [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]][q]);
    });
    const b = sub(points[group], points[atom]);
    return Math.min(angle(b, n), angle(b, n.map((x) => -x)));
  };
  for (const [name, spec, axial] of [['methyl axial', { axial: [null, null, null, 'C'] }, true], ['methyl equatorial', { equatorial: [null, null, null, 'C'] }, false],
    ['hydroxy axial', { axial: ['O'] }, true]]) {
    const doc = chairDoc(spec);
    const { molfile, atomIds } = writeMolfile(doc);
    const conformation = conformationOf(doc, atomIds);
    assert.ok(conformation?.checks.length === 7, `${name}: six ring torsions and the group's`);
    const ring = atomIds.slice(0, 6).map((id) => atomIds.indexOf(id));
    const group = atomIds.length - 1;
    const atom = ring.find((i) => doc.bonds.size && [...doc.bonds.values()].some((b) => [b.a, b.b].includes(atomIds[i]) && [b.a, b.b].includes(atomIds[group])));
    let taken = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const points = moleculeIn3D(OCL, molfile, seed);
      for (const p of [points, mirror(points)]) {
        if (!hasConformation(conformation, p)) continue;
        taken++;
        assert.equal(toAxis(p, ring, atom, group) < 35, axial, `${name}, seed ${seed}: ${axial ? 'axial' : 'equatorial'} where taken`);
      }
    }
    assert.ok(taken > 0, `${name}: some conformer has it`);
  }
  // butane and 2,3-dibromobutane seen along C2–C3, gauche and eclipsed: the back turned to the drawn torsion,
  // every pair of groups as drawn (the dibromide with R/S of its own: the turn's sense matters)
  for (const [front, back, dihedral] of [[['CH3', 'H', 'H'], ['CH3', 'H', 'H'], 60], [['CH3', 'H', 'H'], ['CH3', 'H', 'H'], 0], [['CH3', 'Br', 'H'], ['CH3', 'H', 'Br'], 60], [['CH3', 'Br', 'H'], ['CH3', 'Br', 'H'], 180]]) {
    const doc = newmanDoc(front, back, dihedral);
    const { molfile, atomIds } = writeMolfile(doc);
    const conformation = conformationOf(doc, atomIds);
    assert.equal(conformation.sets.length, 1);
    const points = moleculeIn3D(OCL, molfile, 3).slice(0, atomIds.length);
    const bonds = [...doc.bonds.values()].map((b) => [atomIds.indexOf(b.a), atomIds.indexOf(b.b)]);
    const lengths = bonds.map(([a, b]) => len(sub(points[a], points[b])));
    setTorsions(conformation, points, bonds);
    bonds.forEach(([a, b], k) => assert.ok(Math.abs(len(sub(points[a], points[b])) - lengths[k]) < 1e-9, 'bond lengths kept'));
    // the drawn torsion of every front and back group, from the page: clockwise from the front group to the back one
    const axle = [...doc.bonds.values()].find((b) => b.newman);
    const [fa, ba] = [axle.a, axle.b].map((id) => atomIds.indexOf(id));
    const at = (id) => doc.atoms.get(id);
    const side = (centre, other) => [...doc.bonds.values()].filter((b) => (b.a === centre || b.b === centre) && b !== axle).map((b) => (b.a === centre ? b.b : b.a)).filter((id) => id !== other);
    for (const f of side(axle.a, axle.b)) {
      for (const g of side(axle.b, axle.a)) {
        if (at(f).el === 'H' || at(g).el === 'H') continue;
        const drawn = Math.atan2(at(g).y - at(axle.b).y, at(g).x - at(axle.b).x) - Math.atan2(at(f).y - at(axle.a).y, at(f).x - at(axle.a).x);
        const want = Math.round((((drawn / DEG) % 360) + 360) % 360 / 60) * 60; // (an eclipsed back is drawn a little further round)
        const got = torsion(points[atomIds.indexOf(f)], points[fa], points[ba], points[atomIds.indexOf(g)]);
        const off = Math.abs((((got - want) % 360) + 540) % 360 - 180);
        assert.ok(off < 25, `${front}/${back} at ${dihedral}°: ${at(f).el}–C–C–${at(g).el} ${got.toFixed(0)}°, drawn ${want}°`);
      }
    }
  }
  // butadiene drawn s-cis (for a Diels–Alder): turned s-cis, as no conformer generator makes it; drawn s-trans:
  // the conformer left as it is; a styrene's vinyl: free (its ring's Kekulé structure says nothing)
  for (const [name, points, want] of [['s-cis', [[0, 0], [0.5, 0.87], [1.5, 0.87], [2, 0]], 0], ['s-trans', [[0, 0], [0.5, 0.87], [1.5, 0.87], [2, 1.73]], 180]]) {
    const doc = readMolfile(RDKit.get_mol('C=CC=C').get_molblock()).doc;
    [...doc.atoms.values()].forEach((a, k) => Object.assign(a, { x: points[k][0], y: points[k][1] }));
    const { molfile, atomIds } = writeMolfile(doc);
    const conformation = conformationOf(doc, atomIds);
    assert.equal(conformation?.sets.length, 1, `${name}: its single bond read`);
    const points3 = moleculeIn3D(OCL, molfile, 42).slice(0, 4);
    const before = torsion(...points3);
    setTorsions(conformation, points3, [[0, 1], [1, 2], [2, 3]]);
    const after = torsion(...points3);
    assert.ok(Math.abs((((after - want) % 360) + 540) % 360 - 180) < 60, `${name}: ${after.toFixed(0)}° (the conformer's ${before.toFixed(0)}°)`);
    if (want === 180 && Math.abs(Math.abs(before) - 180) < 60) assert.equal(after, before, 's-trans already: left as it is');
  }
  const styrene = readMolfile(RDKit.get_mol('C=Cc1ccccc1').get_molblock()).doc;
  assert.equal(conformationOf(styrene, writeMolfile(styrene).atomIds), null, "a styrene's vinyl: free");

  // cyclohexane seen along C1–C2 with Br axial up on C1 and H axial down on C2: taken conformers trans-diaxial
  const ring = cyclohexaneNewmanDoc();
  const [axle] = [...ring.bonds.values()].filter((b) => b.newman);
  const near = (x) => [...ring.bonds.values()].filter((b) => b.a === x || b.b === x).map((b) => (b.a === x ? b.b : b.a));
  const up = near(axle.a).find((id) => ring.atoms.get(id).el === 'H' && ring.atoms.get(id).y < ring.atoms.get(axle.a).y - 0.8);
  const down = near(axle.b).find((id) => ring.atoms.get(id).el === 'H' && ring.atoms.get(id).y > ring.atoms.get(axle.b).y + 0.8);
  ring.atoms.get(up).el = 'Br';
  const { molfile, atomIds } = writeMolfile(ring);
  const conformation = conformationOf(ring, atomIds);
  let taken = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const points = moleculeIn3D(OCL, molfile, seed);
    for (const p of [points, mirror(points)]) {
      if (!hasConformation(conformation, p)) continue;
      taken++;
      const t = torsion(...[up, axle.a, axle.b, down].map((id) => p[atomIds.indexOf(id)]));
      assert.ok(Math.abs(Math.abs(t) - 180) < 30, `seed ${seed}: Br and the H anti (${t.toFixed(0)}°)`);
    }
  }
  assert.ok(taken > 0, 'cyclohexane Newman: some conformer has it');
});

test('Λ and Δ read from a drawing: the 3D model\'s own (cis-[CoCl2(en)2]+, [Co(en)3]3+), the mirror image the other one, a turn on the page the same', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const { complexHandedness, helicity } = await import('../src/chem/handedness.js');
  // an octahedron as textbooks draw it: up and down in the page, two in front (wedges), two behind (hashed)
  const at = { up: [0, -1.5], down: [0, 1.5], leftFront: [-1.1, 0.55], rightFront: [0.9, 0.75], leftBack: [-0.9, -0.75], rightBack: [1.1, -0.55] };
  const depth = { up: '', down: '', leftFront: 'wedge', rightFront: 'wedge', leftBack: 'hash', rightBack: 'hash' };
  const build = (donors, chelates, mirror) => {
    const doc = emptyDoc();
    const co = addAtom(doc, 0, 0, 'Co', { charge: 3 });
    const ids = {};
    for (const [place, el] of Object.entries(donors)) {
      const [x, y] = at[place];
      ids[place] = addAtom(doc, mirror ? -x : x, y, el, el === 'Cl' ? { charge: -1 } : {}).id;
      addBond(doc, ids[place], co.id, 1, { kind: 'dative', stereo: depth[place] });
    }
    for (const [p, q] of chelates) {
      const [a, b] = [doc.atoms.get(ids[p]), doc.atoms.get(ids[q])];
      const out = [(a.x + b.x) * 0.75, (a.y + b.y) * 0.75];
      const c1 = addAtom(doc, out[0] + (a.x - b.x) * 0.25, out[1] + (a.y - b.y) * 0.25);
      const c2 = addAtom(doc, out[0] - (a.x - b.x) * 0.25, out[1] - (a.y - b.y) * 0.25);
      addBond(doc, ids[p], c1.id);
      addBond(doc, c1.id, c2.id);
      addBond(doc, c2.id, ids[q]);
    }
    return { doc, co: co.id };
  };
  // the 3D model's handedness: the helicity of its chelates' donor lines
  const modelSays = (doc, chelates, metalId) => {
    const electrons = electronsByAtom(doc);
    const { molfile, atomIds } = writeMolfile(doc);
    const bonds = [...doc.bonds.values()];
    const molecule = { molfile, elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs),
      links: bonds.map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind, stereo: b.stereo })),
      points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]) };
    const complex = buildComplex(molecule, { OCL });
    const points = asDrawn(molecule, complex.metal, complex.points);
    const lines = chelates.map((pair) => pair.map((id) => points[atomIds.indexOf(id)]));
    let sum = 0;
    for (let p = 0; p < lines.length; p++) for (let q = p + 1; q < lines.length; q++) sum += helicity(lines[p], lines[q]);
    return sum > 0 ? 'Δ' : sum < 0 ? 'Λ' : null;
  };
  const cases = [
    ['cis-[CoCl2(en)2]+', { up: 'N', leftBack: 'N', leftFront: 'N', down: 'N', rightBack: 'Cl', rightFront: 'Cl' }, [['up', 'leftBack'], ['leftFront', 'down']]],
    ['[Co(en)3]3+', { up: 'N', leftBack: 'N', leftFront: 'N', down: 'N', rightBack: 'N', rightFront: 'N' }, [['up', 'leftBack'], ['leftFront', 'down'], ['rightBack', 'rightFront']]],
  ];
  for (const [name, donors, chelates] of cases) {
    const said = [false, true].map((mirror) => {
      const { doc, co } = build(donors, chelates, mirror);
      const drawn = complexHandedness(doc).get(co);
      const donorIds = (place) => [...doc.bonds.values()].filter((b) => b.kind === 'dative').map((b) => b.a)
        .find((id) => Math.abs(doc.atoms.get(id).y - at[place][1]) < 1e-9 && Math.abs(Math.abs(doc.atoms.get(id).x) - Math.abs(at[place][0])) < 1e-9);
      assert.equal(modelSays(doc, chelates.map((pair) => pair.map(donorIds)), co), drawn, `${name}${mirror ? ', mirrored' : ''}: the 3D model as read`);
      // turned on the page: the same
      const turned = structuredClone(doc);
      for (const a of turned.atoms.values()) [a.x, a.y] = [a.x * Math.cos(1) - a.y * Math.sin(1), a.x * Math.sin(1) + a.y * Math.cos(1)];
      assert.equal(complexHandedness(turned).get(co), drawn, `${name}: turned, the same`);
      // without wedges: neither
      const flat = structuredClone(doc);
      for (const b of flat.bonds.values()) b.stereo = '';
      assert.equal(complexHandedness(flat).get(co), undefined, `${name}: no wedges, neither`);
      return drawn;
    });
    assert.ok(said[0] && said[1] && said[0] !== said[1], `${name}: ${said[0]}, mirrored ${said[1]}`);
  }
  // the propeller (IUPAC's skew lines): seen down the threefold axis, chelates turning clockwise as they go away: Δ
  const h = Math.SQRT1_2;
  const point = (deg, z) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), z];
  const blades = [0, 120, 240].map((deg) => [point(deg, h), point(deg - 60, -h)]);
  assert.equal(helicity(blades[0], blades[1]), 1, 'clockwise going away: right-handed, Δ');
});

test('UFF for a file, in Å (the XYZ export): ZnTPP with Zn–N about 1.95 Å (UFF\'s, real 2.04), its core flat (no saddle), its phenyls across it, 28 H; cisplatin square planar, cis as drawn', async () => {
  const { electronsByAtom } = await import('../src/chem/valence.js');
  // as pasted: RDKit's molblock read as the app reads it (plain single bonds to the metal, no charges)
  // (`arrows`: these donors' bonds to the metal made coordination arrows, so that NH3 stays NH3)
  const pasted = (smiles, arrows = []) => {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords(true);
    const { doc } = readMolfile(mol.get_molblock());
    mol.delete();
    for (const b of doc.bonds.values()) {
      const [p, q] = [doc.atoms.get(b.a), doc.atoms.get(b.b)];
      const donor = arrows.includes(p.el) && !arrows.includes(q.el) ? p : arrows.includes(q.el) && !arrows.includes(p.el) ? q : null;
      if (!donor || ![p, q].some((x) => x.el === 'Pt')) continue;
      if (b.a !== donor.id) [b.a, b.b] = [b.b, b.a];
      b.kind = 'dative';
    }
    const electrons = electronsByAtom(doc);
    const { molfile, atomIds } = writeMolfile(doc);
    return {
      doc, atomIds, molfile, elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs),
      links: [...doc.bonds.values()].map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind, stereo: b.stereo })),
      points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]),
    };
  };
  const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  const zntpp = pasted('c1ccc(cc1)C2=C3C=CC4=N3[Zn]56N7C(=C(C8=CC=C(N85)C(=C9C=CC2=N96)c%10ccccc%10)c%11ccccc%11)C=CC7=C4c%12ccccc%12');
  const built = buildComplex(zntpp, { OCL });
  const atoms = built.angstrom;
  assert.ok(atoms, 'UFF in Å');
  const zn = zntpp.elements.indexOf('Zn');
  const ns = zntpp.links.filter((l) => l.a === zn || l.b === zn).map((l) => (l.a === zn ? l.b : l.a));
  const znN = ns.map((n) => distance(atoms[zn], atoms[n]));
  assert.equal(ns.length, 4);
  // (UFF's own Zn–N is 1.88 Å, the porphyrin's hole stretches it; all four alike, the bond orders from the
  // whole π system, not the drawing's one Kekulé structure. Before, as OpenChemLib generated it: 1.90–2.66)
  assert.ok(znN.every((d) => d > 1.88 && d < 2.1) && Math.max(...znN) - Math.min(...znN) < 0.02, `Zn–N ${znN.map((d) => d.toFixed(3)).join(' ')} Å`);
  assert.equal(atoms.filter((a) => a.el === 'H').length, 28, 'every hydrogen');
  assert.equal(atoms.length, zntpp.elements.length + 28);
  // the core: the four N and the 20 carbons of the porphyrin (atoms in rings with them, not the phenyls), flat
  const near = (i) => zntpp.links.filter((l) => (l.a === i || l.b === i) && l.a !== zn && l.b !== zn).map((l) => (l.a === i ? l.b : l.a));
  const coreAtoms = new Set(ns);
  for (let grown = true; grown;) {
    grown = false;
    for (const i of [...coreAtoms]) {
      for (const j of near(i)) {
        // (a carbon of the porphyrin: in a five-ring with an N, or a meso carbon between two such rings)
        if (coreAtoms.has(j) || zntpp.elements[j] !== 'C') continue;
        const pyrrole = ns.some((n) => near(n).includes(j) || near(n).some((k) => near(k).includes(j)));
        const meso = near(j).filter((k) => ns.some((n) => near(n).includes(k))).length === 2;
        if (pyrrole || meso) {
          coreAtoms.add(j);
          grown = true;
        }
      }
    }
  }
  assert.equal(coreAtoms.size, 24, 'the 24-atom core');
  // flat: the least-squares plane (the normal: the smallest axis of the points' spread, by power iteration on its inverse's stand-in)
  const pts = [...coreAtoms].map((i) => [atoms[i].x, atoms[i].y, atoms[i].z]);
  const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const cov = [0, 1, 2].map((i) => [0, 1, 2].map((j) => pts.reduce((s, p) => s + (p[i] - c[i]) * (p[j] - c[j]), 0)));
  const trace = cov[0][0] + cov[1][1] + cov[2][2];
  let v = [0.3, 0.5, 0.8];
  for (let k = 0; k < 200; k++) {
    // (trace·I − cov has the smallest axis of cov as its largest)
    v = [0, 1, 2].map((i) => trace * v[i] - [0, 1, 2].reduce((s, j) => s + cov[i][j] * v[j], 0));
    v = v.map((x) => x / len(v));
  }
  const off = Math.max(...pts.map((p) => Math.abs(sub(p, c).reduce((s, x, k) => s + x * v[k], 0))));
  // (with its phenyls held in its plane by a meso–phenyl bond conjugated as if flat it was a saddle, 0.27 Å out)
  assert.ok(off < 0.1, `the core flat (${off.toFixed(2)} Å out of its plane at most)`);
  // each phenyl across the core's plane: its two ortho carbons one above, one below it
  const ring = (i) => zntpp.links.filter((l) => l.a === i || l.b === i).map((l) => (l.a === i ? l.b : l.a));
  const ipsos = [...coreAtoms].flatMap((i) => ring(i).filter((j) => !coreAtoms.has(j) && j !== zn));
  assert.equal(ipsos.length, 4);
  for (const ipso of ipsos) {
    const ortho = ring(ipso).filter((j) => !coreAtoms.has(j));
    const heights = ortho.map((j) => sub([atoms[j].x, atoms[j].y, atoms[j].z], c).reduce((s, x, k) => s + x * v[k], 0));
    assert.ok(heights[0] * heights[1] < 0 && Math.min(...heights.map(Math.abs)) > 0.8, `a phenyl across the core (its ortho carbons ${heights.map((h) => h.toFixed(2)).join(', ')} Å from its plane)`);
  }
  // cisplatin: square planar, the two Cl cis
  const cisplatin = pasted('N[Pt](N)(Cl)Cl', ['N']);
  const pt = buildComplex(cisplatin, { OCL });
  const m = cisplatin.elements.indexOf('Pt');
  const angle = (i, j) => {
    const [u, v] = [i, j].map((k) => sub([pt.angstrom[k].x, pt.angstrom[k].y, pt.angstrom[k].z], [pt.angstrom[m].x, pt.angstrom[m].y, pt.angstrom[m].z]));
    return (Math.acos(u.reduce((s, x, q) => s + x * v[q], 0) / len(u) / len(v)) * 180) / Math.PI;
  };
  const [cl1, cl2] = cisplatin.elements.flatMap((el, i) => (el === 'Cl' ? [i] : []));
  const [n1, n2] = cisplatin.elements.flatMap((el, i) => (el === 'N' ? [i] : []));
  assert.equal(pt.polyhedron, 'square');
  assert.ok(Math.abs(angle(cl1, cl2) - 90) < 10 && Math.abs(angle(n1, n2) - 90) < 15 && Math.abs(angle(cl1, n1) + angle(cl1, n2) - 270) < 15, `cis (Cl–Pt–Cl ${angle(cl1, cl2).toFixed(0)}°)`);
  assert.equal(pt.angstrom.filter((a) => a.el === 'H').length, 6);
});

test('only a molecule with a metal bonded goes to the complex builder (the XYZ export): not benzene, not one bound to its neighbour by a hydrogen bond only', async () => {
  const { hasMetal } = await import('../src/layout/threeD.js');
  assert.equal(hasMetal({ elements: ['C', 'C', 'C', 'C', 'C', 'C'], links: [0, 1, 2, 3, 4, 5].map((k) => ({ a: k, b: (k + 1) % 6 })) }), false, 'benzene');
  assert.equal(hasMetal({ elements: ['Pt', 'Cl', 'Cl', 'N', 'N'], links: [1, 2, 3, 4].map((k) => ({ a: k, b: 0, kind: k > 2 ? 'dative' : undefined })) }), true, 'cisplatin');
  assert.equal(hasMetal({ elements: ['Na', 'O'], links: [{ a: 0, b: 1, kind: 'hbond' }] }), false, 'a hydrogen bond only');
  assert.equal(hasMetal({ elements: ['Na'], links: [] }), false, 'a lone ion');
});

test('a label as the atom it hangs by, read as SMILES reads its first atom: Bn, PMB and Cbz by C (not "Cc"), OPh by O, SPh by S, PPh3 by P, TMS by Si', async () => {
  const { labelAtom } = await import('../src/layout/complex3D.js');
  const got = Object.fromEntries(['Bn', 'PMB', 'Cbz', 'OPh', 'SPh', 'PPh3', 'TMS', 'Ph', 'OMe'].map((a) => [a, labelAtom(a)]));
  assert.deepEqual(got, { Bn: 'C', PMB: 'C', Cbz: 'C', OPh: 'O', SPh: 'S', PPh3: 'P', TMS: 'Si', Ph: 'C', OMe: 'O' });
});

test('UFF reads OpenChemLib\'s atoms as drawn when hydrogens drawn as atoms come first (a hydride, water drawn H–O–H): its hydrogens, aromaticity and charges for the right atoms', async () => {
  const { readBack } = await import('../src/layout/complex3D.js');
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  // H–O–H (water drawn), then a pyridinium-like N⁺ and an aromatic ring: OpenChemLib puts the H last
  const doc = emptyDoc();
  const h1 = addAtom(doc, -0.8, -0.6, 'H').id;
  const o = addAtom(doc, 0, 0, 'O').id;
  const h2 = addAtom(doc, 0.8, -0.6, 'H').id;
  addBond(doc, h1, o);
  addBond(doc, o, h2);
  const ring = [0, 1, 2, 3, 4, 5].map((k) => addAtom(doc, 3 + Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3), k ? 'C' : 'N', k ? {} : { charge: 1 }).id);
  ring.forEach((id, k) => addBond(doc, id, ring[(k + 1) % 6], k % 2 ? 1 : 2));
  addBond(doc, ring[0], addAtom(doc, 4.6, 0, 'C').id);
  const { molfile, atomIds } = writeMolfile(doc);
  const { mol, ocl } = readBack(OCL, molfile);
  const els = atomIds.map((id) => doc.atoms.get(id).el);
  assert.deepEqual(atomIds.map((_, k) => mol.getAtomLabel(ocl.get(k))), els, 'each drawn atom read back as itself');
  const k = (id) => ocl.get(atomIds.indexOf(id));
  assert.equal(mol.getAtomCharge(k(ring[0])), 1, 'the N⁺ keeps its charge');
  assert.ok(mol.isAromaticAtom(k(ring[2])), 'a ring carbon aromatic');
  assert.equal(mol.getImplicitHydrogens(k(o)), 0, 'the O has its drawn hydrogens, no implicit ones');
});

test('3D points for the drawn atoms when hydrogens drawn as atoms aren\'t last: methanol drawn C, H, O, H (OpenChemLib moves them to the end)', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C').id;
  const h1 = addAtom(doc, -0.5, -0.87, 'H').id;
  const o = addAtom(doc, 1, 0, 'O').id;
  const h2 = addAtom(doc, 1.5, -0.87, 'H').id;
  addBond(doc, c, h1);
  addBond(doc, c, o);
  addBond(doc, o, h2);
  const made = moleculeIn3D(OCL, writeMolfile(doc).molfile);
  const points = made.points ?? made;
  const d = (i, j) => Math.hypot(...points[i].map((v, k) => v - points[j][k]));
  // (in bond lengths: C–O 1.43 Å, C–H 1.09, O–H 0.97; before, C–O came out 0.61 and O–H 1.59)
  assert.ok(d(0, 2) > d(0, 1) && d(0, 1) > d(2, 3), `C–O ${d(0, 2).toFixed(2)}, C–H ${d(0, 1).toFixed(2)}, O–H ${d(2, 3).toFixed(2)}`);
  assert.ok(Math.abs(d(0, 2) / d(2, 3) - 1.43 / 0.97) < 0.15);
});

test('a transition state and a main-group centre beyond the octet optimised by UFF: every hydrogen, the shape held, the partial bonds longer; Turn in 3D draws it as seen', async () => {
  const { addAtom, addBond, emptyDoc } = await import('../src/model/doc.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const describe = (doc) => {
    const electrons = electronsByAtom(doc);
    const { molfile, atomIds } = writeMolfile(doc);
    const bonds = [...doc.bonds.values()];
    return { atomIds, molfile, elements: atomIds.map((id) => doc.atoms.get(id).el), lonePairs: atomIds.map((id) => electrons.get(id).lonePairs),
      hydrogens: atomIds.map((id) => electrons.get(id).hydrogens), wanted: atomIds.reduce((s, id) => s + electrons.get(id).hydrogens, 0),
      links: bonds.map((b) => ({ a: atomIds.indexOf(b.a), b: atomIds.indexOf(b.b), order: b.order, kind: b.kind, stereo: b.stereo })), points: atomIds.map((id) => [doc.atoms.get(id).x, doc.atoms.get(id).y]) };
  };
  // HO···CH(CH3)(C2H5)···Br, found by buildComplex itself (as the worker calls it, the molecule alone)
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0);
  const o = addAtom(doc, -1.2, 0.1, 'O');
  const br = addAtom(doc, 1.2, -0.1, 'Br');
  addBond(doc, o.id, c.id, 1, { kind: 'partial' });
  addBond(doc, c.id, br.id, 1, { kind: 'partial' });
  addBond(doc, c.id, addAtom(doc, 0, -1, 'H').id);
  const me = addAtom(doc, -0.5, 0.9);
  addBond(doc, c.id, me.id, 1, { stereo: 'hash' });
  const ch2 = addAtom(doc, 0.5, 0.9);
  addBond(doc, c.id, ch2.id, 1, { stereo: 'wedge' });
  addBond(doc, ch2.id, addAtom(doc, 1.4, 1.3).id);
  const ts = describe(doc);
  for (const molecule of [ts, { ...ts, hydrogens: undefined }]) {
    assert.deepEqual(buildComplex(molecule, { OCL, defer: true }), { deferred: true }, 'handed to UFF (in a worker)');
    const built = buildComplex(molecule, { OCL });
    assert.ok(built.hydrogens && built.axial, 'built by UFF, its axial bonds known');
    // its hydrogens: the drawing's (OH 1, CH3 3, CH2 2, CH3 3), none on the Br, the H drawn not again
    const on = (id) => built.hydrogens.filter(([atom]) => atom === ts.atomIds.indexOf(id)).length;
    assert.deepEqual([built.hydrogens.length, on(o.id), on(br.id), on(c.id)], [ts.wanted, 1, 0, 0], `${molecule.hydrogens ? 'our' : "OpenChemLib's"} H counts`);
    const p = (id) => built.points[ts.atomIds.indexOf(id)];
    const from = (id) => sub(p(id), p(c.id));
    // (held to the bipyramid, UFF relaxing it a little: O–C–Br about 173°)
    assert.ok(Math.abs(angle(from(o.id), from(br.id)) - 180) < 10 && Math.abs(angle(from(me.id), from(ch2.id)) - 120) < 5 && Math.abs(angle(from(o.id), from(me.id)) - 90) < 5, 'a trigonal bipyramid, O and Br axial');
    // the bonds forming and breaking longer than ordinary ones to the same atoms would be (UFF: order ½, some
    // 0.15 Å longer; a C–Br 1.27, a C–O 0.93 times a C–C)
    assert.ok(len(from(br.id)) > 1.35 * len(from(ch2.id)) && len(from(o.id)) > 1.0 * len(from(ch2.id)), `partial bonds long (${len(from(o.id)).toFixed(2)}, ${len(from(br.id)).toFixed(2)} for C–C ${len(from(ch2.id)).toFixed(2)})`);
  }
  // Turn in 3D (`seen`): the drawing is the view's projection, nothing moved; Redraw's spreads and lengthens
  const built = buildComplex(ts, { OCL });
  const model = { metal: built.metal, complex: built, axial: built.axial };
  const [view] = views(built.points, ts.links.map((l) => [l.a, l.b]), { axes: false, prefer: built.prefer, complex: built, count: 1 });
  const seen = drawingOfModel(RDKit, ts, model, view, { spread: false });
  assert.ok(seen.points.every((q, i) => len(sub(q, view.points[i])) < 1e-9), 'seen: as projected');
  // sulfuric acid (each OH an end atom on S: built round S by VSEPR): its two H, the tetrahedron held
  const acid = describe(readMolfile(RDKit.get_mol('OS(=O)(=O)O').get_molblock()).doc);
  const sulfur = buildComplex(acid, { OCL });
  assert.ok(sulfur.hydrogens?.length === 2 && acid.links.filter((l) => l.a === sulfur.metal || l.b === sulfur.metal).length === 4, `H2SO4: its two H (${sulfur.hydrogens?.length})`);
});

test('a drawing turned a little off the 30° grid is turned back onto it (gridTurn), the smallest turn winning', async () => {
  const { gridTurn, turnedPoints } = await import('../src/layout/geometry.js');
  // a zigzag chain on the grid (bonds at ±30°), then turned by 7°
  const chain = [[0, 0], [0.866, 0.5], [1.732, 0], [2.598, 0.5], [3.464, 0]];
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 4]];
  assert.equal(gridTurn(chain, pairs), 0);
  const slanted = turnedPoints(chain, 7);
  const turn = gridTurn(slanted, pairs);
  assert.ok(Math.abs(turn + 7) < 0.3, `turned back by ${turn}°`);
  // nothing to line up: no bonds
  assert.equal(gridTurn([[0, 0]], []), 0);
});
