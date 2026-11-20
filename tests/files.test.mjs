// Files: molfile and KET round trips (also with curved arrows, lone pairs
// and colours), reading files of the Ketcher-based version, and the text
// formatting of formulas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { readKet, toKet, writeKet } from '../src/io/ket.js';
import { readMolfile, writeMolfile } from '../src/io/molfile.js';
import { addAtom, addBond, addBracket, addCurve, addArrow, addFill, addText, deleteObjects, emptyDoc } from '../src/model/doc.js';
import { CAP_HEIGHT, formatRuns, parseMarkup, writeMarkup } from '../src/render/text.js';
import { STYLE } from '../src/render/style.js';
import { sceneToSVG } from '../src/render/svg.js';
import { buildScene } from '../src/render/scene.js';
import { applyCdxmlHydrogens, isCdxml, prepareCdxml, takeCdxmlMarks } from '../src/io/cdxml.js';
import { alignReadReaction } from '../src/arrange/align.js';
import { fragments } from '../src/model/graph.js';

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
const canonical = (molfile) => {
  const mol = RDKit.get_mol(molfile);
  try {
    return mol.get_smiles();
  } finally {
    mol.delete();
  }
};

test('molfile round trip keeps the molecule (stereo, charges, isotopes, radicals)', () => {
  for (const smiles of ['OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'C[N+](=O)[O-]', '[13CH3]C(=O)O', '[CH3]', 'F/C=C/F']) {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const molfile = mol.get_molblock();
    const expected = mol.get_smiles();
    mol.delete();
    const { doc } = readMolfile(molfile);
    assert.equal(canonical(writeMolfile(doc).molfile), expected, smiles);
  }
});

test('a double bond marked "either" in a molfile comes in with a wavy bond beside it, its E or Z left open', () => {
  for (const smiles of ['CCCN=C(S)N1CCCC1', 'CC(=NO)CC']) {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const molfile = mol.get_molblock();
    mol.delete();
    assert.ok(/^\s+\d+\s+\d+\s+2\s+3/m.test(molfile), `${smiles}: RDKit marks the double bond "either"`);
    const { doc } = readMolfile(molfile);
    const wavy = [...doc.bonds.values()].filter((b) => b.stereo === 'wavy');
    assert.equal(wavy.length, 1, smiles);
    const double = [...doc.bonds.values()].find((b) => b.order === 2 && [b.a, b.b].includes(wavy[0].a));
    assert.ok(double, `${smiles}: the wavy bond starts at the double bond`);
    assert.equal(canonical(writeMolfile(doc).molfile), canonical(smiles), smiles);
  }
  // marked by hand where RDKit leaves it (beside a double bond whose E/Z is given): the wavy bond not on a single bond
  // that also touches a double bond whose E/Z is said (that one's E would be lost); on a ring bond if there is no
  // other; next to another double bond left open, as that one says nothing anyway
  const said = (mol) => new Set(JSON.parse(mol.get_stereo_tags()).CIP_bonds.map(([i, j]) => `${Math.min(i, j)}-${Math.max(i, j)}`));
  for (const smiles of ['C/C=C/C=C1CCCC(C)C1', 'CC/C=C/C=CC=C/C']) {
    const mol = RDKit.get_mol(smiles);
    mol.set_new_coords();
    const given = said(mol);
    const lines = mol.get_molblock().split('\n');
    mol.delete();
    const read = RDKit.get_mol(lines.join('\n'));
    const open = [...said(read)].filter((k) => !given.has(k));
    read.delete();
    const [nAtoms, nBonds] = [parseInt(lines[3].slice(0, 3), 10), parseInt(lines[3].slice(3, 6), 10)];
    for (let k = 4 + nAtoms; k < 4 + nAtoms + nBonds; k++) {
      const [a, b] = [parseInt(lines[k].slice(0, 3), 10) - 1, parseInt(lines[k].slice(3, 6), 10) - 1];
      if (open.includes(`${Math.min(a, b)}-${Math.max(a, b)}`) || /^\s*\d+\s+\d+\s+2\s+3/.test(lines[k])) lines[k] = `${lines[k].slice(0, 9)}  3${lines[k].slice(12)}`;
    }
    const { doc } = readMolfile(lines.join('\n'));
    assert.equal(canonical(writeMolfile(doc).molfile), canonical(smiles), smiles);
  }
});

test('hydrogens set by hand survive a molfile round trip', () => {
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C', { hCount: 2 }); // a carbene drawn as CH2 by hand
  addBond(doc, c.id, addAtom(doc, 1, 0, 'O').id);
  const { doc: back } = readMolfile(writeMolfile(doc).molfile);
  assert.equal([...back.atoms.values()][0].hCount, 2);
});

function mechanismDoc() {
  const doc = emptyDoc();
  const o = addAtom(doc, -2.5, 0, 'O', { charge: -1, lonePairs: 'auto', color: '#d40000' });
  const c1 = addAtom(doc, 0, 0, 'C');
  const c2 = addAtom(doc, 0.866, -0.5, 'C');
  const o2 = addAtom(doc, 0.866, -1.5, 'O', { lonePairs: 'auto' });
  const cl = addAtom(doc, 1.732, 0, 'Cl');
  addBond(doc, c1.id, c2.id);
  const co = addBond(doc, c2.id, o2.id, 2, { color: '#0044cc' });
  addBond(doc, c2.id, cl.id);
  addCurve(doc, { atom: o.id }, { atom: c2.id }, 2, { color: '#d40000' });
  addCurve(doc, { bond: co.id }, { atom: o2.id }, 2, { variant: 1 });
  addArrow(doc, 3, 0, 6, 0, 'equilibrium');
  addText(doc, 3.5, -0.5, 'H2SO4');
  return doc;
}

test('KET round trip keeps curved arrows, lone pairs, colours, arrows and text', () => {
  const doc = mechanismDoc();
  const { doc: back } = readKet(writeKet(doc));
  assert.equal(back.atoms.size, 5);
  assert.equal(back.bonds.size, 3);
  const atoms = [...back.atoms.values()];
  assert.deepEqual(atoms.filter((a) => a.lonePairs === 'auto').map((a) => a.el), ['O', 'O']);
  assert.equal(atoms.find((a) => a.charge === -1).color, '#d40000');
  assert.equal([...back.bonds.values()].find((b) => b.order === 2).color, '#0044cc');
  const curves = [...back.curves.values()];
  assert.equal(curves.length, 2);
  assert.equal(back.atoms.get(curves[0].from.atom).el, 'O');
  assert.equal(back.atoms.get(curves[0].to.atom).el, 'C');
  assert.equal(back.bonds.get(curves[1].from.bond).order, 2);
  assert.equal(curves[1].variant, 1);
  assert.equal([...back.arrows.values()][0].kind, 'equilibrium');
  assert.equal([...back.texts.values()][0].text, 'H2SO4');
  const key = (d) => [...d.atoms.values()].map((x) => `${x.el}${x.x.toFixed(3)},${x.y.toFixed(3)}`).sort().join(' ');
  assert.equal(key(back), key(doc), 'positions kept');
});

test('KET for Ketcher: pictures of lone pairs and arrows, standard molecule nodes', () => {
  const ket = toKet(mechanismDoc());
  const images = ket.root.nodes.filter((n) => n.type === 'image');
  // hydroxide: 3 pairs, carbonyl O: 2 pairs, 2 arrows
  assert.equal(images.length, 7);
  assert.ok(ket.root.nodes.some((n) => n.$ref) && ket.mol0.atoms.every((a) => a.location.length === 3));
  assert.equal(ket.root.nodes.find((n) => n.type === 'arrow').data.mode, 'equilibrium-filled-half-bow');
});

test('files of the Ketcher-based version: lone pairs and arrows come back tied to their atoms', () => {
  const { doc } = readKet(readFileSync(new URL('./fixtures/ketcher-version.ket', import.meta.url), 'utf8'));
  const name = (end) => (end.bond !== undefined ? 'bond' : doc.atoms.get(end.atom).el + (doc.atoms.get(end.atom).charge < 0 ? '-' : ''));
  assert.deepEqual([...doc.atoms.values()].filter((a) => a.lonePairs === 'auto').map((a) => a.el).sort(), ['Cl', 'O', 'O']);
  assert.deepEqual([...doc.curves.values()].map((c) => `${name(c.from)}->${name(c.to)}`), ['O-->C', 'bond->O']);
  assert.ok([...doc.curves.values()].every((c) => c.color === '#d40000'));
});

test('chemical text formatting', () => {
  const show = (text) => formatRuns(text).map((r) => (r.shift === 'sub' ? `_${r.text}` : r.shift === 'sup' ? `^${r.text}` : r.text)).join('');
  assert.equal(show('H2SO4'), 'H_2SO_4');
  assert.equal(show('- AlCl4-'), '- AlCl_4^−');
  assert.equal(show('Fe3+'), 'Fe^3+');
  assert.equal(show('SO42-'), 'SO_4^2−');
  assert.equal(show('H+, heat'), 'H^+, heat');
  assert.equal(show('1. LDA, THF, -78 °C'), '1. LDA, THF, -78 °C');
  assert.equal(show('CH3CH2OH'), 'CH_3CH_2OH');
  assert.equal(show('x^{2}'), 'x^2');
  // a complex ion: the number after its bracket, before the sign, is the charge
  assert.equal(show('H2[SiF6]2-'), 'H_2[SiF_6]^2−');
  assert.equal(show('[Fe(CN)6]3-'), '[Fe(CN)_6]^3−');
  assert.equal(show('K4[Fe(CN)6]'), 'K_4[Fe(CN)_6]');
  // LaTeX's mhchem short forms
  assert.equal(show('CO32-'), 'CO_3^2−');
  assert.equal(show('CO_3^2-'), 'CO_3^2−');
  assert.equal(show('NH4^+'), 'NH_4^+');
});

test('bold and italic for part of a text: markup inside markup, read and written back the same', () => {
  for (const markup of ['*{trans}-~{cis}', '*{H_{2}O} and ~{x}^{2}', '*{~{x}^{2}}', 'a\\}b', 'x^{2}']) {
    assert.equal(writeMarkup(parseMarkup(markup)), markup);
  }
  // a stray brace (a text written before the escapes) reads as itself, written back escaped
  assert.equal(writeMarkup(parseMarkup('a}b')), 'a\\}b');
  const runs = formatRuns('*{H_{2}O} ~{cis}', { auto: false }).map((r) => [r.text, r.shift, r.bold, r.italic]);
  assert.deepEqual(runs, [['H', 0, true, false], ['2', 'sub', true, false], ['O', 0, true, false], [' ', 0, false, false], ['cis', 0, false, true]]);
});

test('group labels (R, Nu, Ar) survive molfiles and KET, and are no elements', () => {
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C');
  const r = addAtom(doc, 1, 0, '*', { alias: 'Ar' });
  addBond(doc, c.id, r.id);
  const { doc: fromMol } = readMolfile(writeMolfile(doc).molfile);
  assert.deepEqual([...fromMol.atoms.values()].map((a) => [a.el, a.alias]), [['C', null], ['*', 'Ar']]);
  const { doc: fromKet } = readKet(writeKet(doc));
  assert.deepEqual([...fromKet.atoms.values()].map((a) => [a.el, a.alias]), [['C', null], ['*', 'Ar']]);
  assert.equal(canonical(writeMolfile(doc).molfile), '*C');
});

test('highlights survive KET and are drawn behind the structure', () => {
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'C', { highlight: '#b5dcff' });
  const b = addAtom(doc, 1, 0, 'O', { highlight: '#b5dcff' });
  addBond(doc, a.id, b.id, 2, { highlight: '#b5dcff' });
  const { doc: back } = readKet(writeKet(doc));
  assert.deepEqual([...back.atoms.values()].map((x) => x.highlight), ['#b5dcff', '#b5dcff']);
  assert.equal([...back.bonds.values()][0].highlight, '#b5dcff');
});

test('ring fills survive KET and go with their atoms', () => {
  const doc = emptyDoc();
  const ring = [0, 1, 2, 3, 4, 5].map((k) => addAtom(doc, Math.cos(k), Math.sin(k)).id);
  ring.forEach((id, k) => addBond(doc, id, ring[(k + 1) % 6]));
  addFill(doc, ring, '#fff09a');
  const { doc: back } = readKet(writeKet(doc));
  assert.equal([...back.fills.values()][0].color, '#fff09a');
  assert.equal([...back.fills.values()][0].atoms.length, 6);
  deleteObjects(doc, [ring[2]]);
  assert.equal(doc.fills.size, 0);
  // a ring broken by taking out a bond loses its fill too
  const other = readKet(writeKet(back)).doc;
  const [first] = other.fills.values();
  const bond = [...other.bonds.values()].find((b) => b.a === first.atoms[0] || b.b === first.atoms[0]);
  deleteObjects(other, [bond.id]);
  assert.equal(other.fills.size, 0, 'ring bond deleted');
});

test('links keeping molecules together survive KET, are no bonds for Ketcher or molfiles, and make one molecule', async () => {
  const { fragments } = await import('../src/model/graph.js');
  const { electronsByAtom } = await import('../src/chem/valence.js');
  const doc = emptyDoc();
  const k1 = addAtom(doc, -2, 0, 'K', { charge: 1 });
  const k2 = addAtom(doc, 2, 0, 'K', { charge: 1 });
  const s = addAtom(doc, 0, 0, 'Si', { charge: -2 });
  for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.5, 0.5], [-0.5, -0.5]]) addBond(doc, s.id, addAtom(doc, x, y, 'F').id);
  addBond(doc, k1.id, s.id, 1, { kind: 'link' });
  addBond(doc, k2.id, s.id, 1, { kind: 'link' });
  assert.equal(fragments(doc).length, 1, 'one molecule');
  assert.equal(electronsByAtom(doc).get(k1.id).error, null, 'no valence for a link');
  const ket = toKet(doc);
  assert.ok(ket.mol0.bonds.every((b) => b.atoms.every((i) => ket.mol0.atoms[i].label !== 'K')), 'Ketcher sees no K–Si bond');
  const { doc: back } = readKet(writeKet(doc));
  assert.equal([...back.bonds.values()].filter((b) => b.kind === 'link').length, 2);
  assert.equal(fragments(back).length, 1);
  const { molfile } = writeMolfile(doc);
  assert.equal(molfile.split('\n')[3].slice(0, 6), '  9  6', 'molfile: nine atoms, the six Si–F bonds');
});

test('the R/S and E/Z labels asked for survive KET and are drawn only there', async () => {
  const { buildScene } = await import('../src/render/scene.js');
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C', { cipLabel: true });
  const n = addAtom(doc, 1, 0, 'N');
  const bond = addBond(doc, c.id, n.id, 1, { cipLabel: true });
  const { doc: back } = readKet(writeKet(doc));
  assert.ok([...back.atoms.values()][0].cipLabel && [...back.bonds.values()][0].cipLabel && ![...back.atoms.values()][1].cipLabel);
  const stereo = { atoms: new Map([[c.id, 'R'], [n.id, 'S']]), bonds: new Map([[bond.id, 'E']]) };
  assert.deepEqual(buildScene(doc, undefined, { stereo }).stereo.map((m) => m.text), ['(R)', '(E)']);
});

test('delocalized bonds survive KET; molfiles keep single and double bonds', () => {
  const { doc } = readMolfile(RDKit.get_mol('CC(=O)[O-]').get_molblock());
  for (const bond of doc.bonds.values()) if (bond.order === 2 || doc.atoms.get(bond.b).charge) bond.delocalized = true;
  const { doc: back } = readKet(writeKet(doc));
  assert.equal([...back.bonds.values()].filter((b) => b.delocalized).length, 2);
  assert.equal(canonical(writeMolfile(back).molfile), 'CC(=O)[O-]');
});

test('brackets survive KET, also through their pictures alone (a file Ketcher saved again)', () => {
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0);
  const b = addAtom(doc, 1, 0, 'Br');
  addBond(doc, a.id, b.id);
  addBracket(doc, -0.5, -0.6, 1.6, 0.6, { sup: '‡', sub: '', shape: 'round' });
  const ket = toKet(doc);
  const { doc: back } = readKet(JSON.stringify(ket));
  const [bracket] = [...back.brackets.values()];
  assert.deepEqual([bracket.x1, bracket.y1, bracket.x2, bracket.y2, bracket.shape, bracket.sup], [-0.5, -0.6, 1.6, 0.6, 'round', '‡']);
  delete ket.root.olomol;
  const [fromPicture] = [...readKet(JSON.stringify(ket)).doc.brackets.values()];
  assert.ok(Math.abs(fromPicture.x1 + 0.5) < 1e-3 && Math.abs(fromPicture.y2 - 0.6) < 1e-3 && fromPicture.sup === '‡');
});

test('partial, hydrogen and dative bonds: kept in KET, left out of molfiles', () => {
  const doc = emptyDoc();
  const [n, b, h, o] = [addAtom(doc, 0, 0, 'N'), addAtom(doc, 1.5, 0, 'B'), addAtom(doc, 0, 1, 'H'), addAtom(doc, 0, 2.5, 'O')];
  addBond(doc, n.id, b.id, 1, { kind: 'dative' });
  addBond(doc, n.id, h.id);
  addBond(doc, h.id, o.id, 1, { kind: 'hbond' });
  addBond(doc, b.id, o.id, 1, { kind: 'partial' });
  const { doc: back } = readKet(writeKet(doc));
  assert.deepEqual([...back.bonds.values()].map((x) => x.kind ?? ''), ['dative', '', 'hbond', 'partial']);
  assert.equal(writeMolfile(doc).molfile.split('\n')[3].slice(3, 6).trim(), '1');
});

test('δ charges and dipole arrows survive KET', () => {
  const doc = emptyDoc();
  const [c, o] = [addAtom(doc, 0, 0, 'C', { partialCharge: 1 }), addAtom(doc, 1, 0, 'O', { partialCharge: -1 })];
  addBond(doc, c.id, o.id, 2);
  addArrow(doc, 0.1, -0.4, 0.9, -0.4, 'dipole');
  const { doc: back } = readKet(writeKet(doc));
  assert.deepEqual([...back.atoms.values()].map((a) => a.partialCharge), [1, -1]);
  assert.equal([...back.arrows.values()][0].kind, 'dipole');
});

test('a compound number keeps its molecule through KET', () => {
  const doc = emptyDoc();
  const [a, b] = [addAtom(doc, 0, 0), addAtom(doc, 1, 0, 'O')];
  addBond(doc, a.id, b.id);
  addText(doc, 0.3, 1.2, '1', { bold: true, anchor: b.id });
  const { doc: back } = readKet(writeKet(doc));
  const [number] = [...back.texts.values()];
  assert.equal(number.bold, true);
  assert.equal(back.atoms.get(number.anchor).el, 'O');
});

test('Haworth and Fischer drawings keep their look in KET and their stereo in molfiles', async () => {
  const { PROJECTIONS } = await import('../src/chem/projections.js');
  const fischer = PROJECTIONS.find(([name]) => name === 'L-Alanine, Fischer')[1]();
  const haworth = PROJECTIONS.find(([name]) => name === 'β-D-Ribose, Haworth')[1]();
  for (const doc of [fischer, haworth]) {
    const { doc: back } = readKet(writeKet(doc));
    const stereo = (d) => [...d.bonds.values()].map((b) => b.stereo).sort();
    assert.deepEqual(stereo(back), stereo(doc));
    const marks = (d) => [...d.atoms.values()].map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)}:${a.projection ?? ''}:${a.hSide ?? ''}`).sort();
    assert.deepEqual(marks(back), marks(doc));
  }
  // a Fischer centre: wedges for its horizontal bonds in the molfile
  assert.equal(writeMolfile(fischer).molfile.split('\n').filter((line) => /^\s*\d+\s+\d+\s+1\s+1$/.test(line)).length, 2);
});

test('Newman projections: molecules that survive KET; older files\' drawings open as molecules', async () => {
  const { addNewmanMolecule, endOnBonds } = await import('../src/chem/newman.js');
  const doc = emptyDoc();
  addNewmanMolecule(doc, 1, 2, { front: ['CH3', 'H', 'Br'], back: ['CH3', 'H', 'H'], dihedral: 180 });
  const back = readKet(JSON.stringify(toKet(doc))).doc;
  const [axle] = endOnBonds(back);
  assert.ok(axle, 'the bond seen end on, still end on');
  assert.deepEqual([back.atoms.get(axle.a).x, back.atoms.get(axle.a).y], [1, 2]);
  const smiles = (d) => {
    const mol = RDKit.get_mol(writeMolfile(d).molfile, JSON.stringify({ removeHs: true }));
    const s = mol.get_smiles();
    mol.delete();
    return s;
  };
  assert.equal(smiles(back), smiles(doc));
  assert.ok(smiles(back).includes('@'), `with its R/S (${smiles(back)})`);
  // a file from before: the projection in our section, and in a picture alone (Ketcher kept only that)
  const old = { root: { nodes: [], olomol: { version: 2, molecules: {}, newmans: [{ x: 1, y: -2, front: ['CH_{3}', 'H', 'H'], back: ['CH3', 'H', 'H'], dihedral: 180 }] } } };
  const opened = readKet(JSON.stringify(old)).doc;
  assert.equal(endOnBonds(opened).length, 1);
  assert.equal(smiles(opened), 'CCCC');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><desc>${JSON.stringify({ olomol: 'newman', front: ['OH', 'H', 'H'], back: ['H', 'H', 'H'], dihedral: 60, corners: [[0.5, -0.5], [0.5, -0.5]] })}</desc></svg>`;
  const picture = { type: 'image', format: 'image/svg+xml', boundingBox: { x: 0, y: 0, z: 0, width: 1, height: 1 }, data: btoa(svg) };
  const fromPicture = readKet(JSON.stringify({ root: { nodes: [picture] } })).doc;
  assert.equal(smiles(fromPicture), 'CCO');
});

test('an older file\'s coloured Newman projection colours only itself; an atom\'s facing (from Turn in 3D) survives KET', async () => {
  // (a 0.3 file: an uncoloured water, and in our section a red projection)
  const drawing = emptyDoc();
  addAtom(drawing, 6, 6, 'O');
  const file = toKet(drawing);
  file.root.olomol = { ...(file.root.olomol ?? {}), newmans: [{ x: 1, y: -2, front: ['CH3', 'H', 'H'], back: ['CH3', 'H', 'H'], dihedral: 180, color: '#c00000' }] };
  const opened = readKet(JSON.stringify(file)).doc;
  const colours = [...opened.atoms.values()].map((a) => (a.el === 'O' ? `O:${a.color ?? 'none'}` : a.color));
  assert.ok(colours.includes('O:none') && colours.filter((c) => c === '#c00000').length >= 2, `the projection red, the water as it was: ${colours.join(' ')}`);
  // and opened next to a drawing: the drawing keeps its colours
  const { addNewmanMolecule } = await import('../src/chem/newman.js');
  const doc = emptyDoc();
  const water = addAtom(doc, 9, 9, 'O');
  addNewmanMolecule(doc, 0, 0, { front: ['CH3', 'H', 'H'], back: ['CH3', 'H', 'H'], color: '#0000c0' });
  assert.equal(doc.atoms.get(water.id).color ?? null, null, 'another molecule not coloured');
  // facing alone on an atom
  const plain = emptyDoc();
  const c = addAtom(plain, 0, 0, 'C');
  addBond(plain, c.id, addAtom(plain, 1, 0, 'C').id, 2);
  c.facing = { angle: 1.571, reach: 0.8, face: 1 };
  const back = readKet(JSON.stringify(toKet(plain))).doc;
  assert.deepEqual([...back.atoms.values()][0].facing, { angle: 1.571, reach: 0.8, face: 1 });
});

// Texts are formatted only where asked (the Formula button writes markup);
// texts of older files, which were formatted on their own, keep their look.
test('texts: formatted only as marked; older files converted to markup; the Formula button', async () => {
  const { chemMarkup } = await import('../src/render/text.js');
  const { formatPart, markupOf, modelOf } = await import('../src/ui/richText.js');
  const { layoutText } = await import('../src/render/scene.js');
  const shifts = (markup) => layoutText({ x: 0, y: 0, text: markup }).lines[0].runs.map((r) => r.text).join('|');
  assert.equal(shifts('doi 10.1021/jacs.5b01234'), 'doi 10.1021/jacs.5b01234', 'a DOI stays as typed');
  assert.equal(shifts('H_{2}SO_{4}'), 'H|2|SO|4');
  assert.equal(chemMarkup('H2SO4, Fe3+'), 'H_{2}SO_{4}, Fe^{3+}');
  assert.equal(chemMarkup('Fe3+ + e- → Fe2+, Cl2 + 2e− → 2 Cl-'), 'Fe^{3+} + e^{−} → Fe^{2+}, Cl_{2} + 2e^{−} → 2 Cl^{−}', 'the electron\'s charge too');
  assert.equal(chemMarkup('see the e-mail'), 'see the e-mail', 'a hyphen in a word stays');
  // the Formula button on a part of the text, and Plain again
  const model = modelOf('see 10.1021/x and H2SO4');
  const start = 'see 10.1021/x and '.length;
  const formatted = formatPart(model, start, model.length, 'chem');
  assert.equal(markupOf(formatted), 'see 10.1021/x and H_{2}SO_{4}');
  assert.equal(markupOf(formatPart(formatted, 0, formatted.length, 'plain')), 'see 10.1021/x and H2SO4');
  // a KET of version 1 (texts formatted on their own) and of version 2
  const doc = emptyDoc();
  addText(doc, 0, 0, 'H2SO4 at 10.1021/x');
  const ket = JSON.parse(writeKet(doc));
  assert.equal([...readKet(ket).doc.texts.values()][0].text, 'H2SO4 at 10.1021/x', 'version 2: as written');
  ket.root.olomol.version = 1;
  assert.equal([...readKet(ket).doc.texts.values()][0].text, 'H_{2}SO_{4} at 10.1021/x', 'version 1: as it looked');
});

test('texts on anchors: placed by the molecule, kept in KET, passed on when their atom goes', () => {
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'C');
  const b = addAtom(doc, 1, 0, 'O');
  addBond(doc, a.id, b.id);
  const below = addText(doc, 9, 9, '1', { anchor: a.id });
  const left = addText(doc, 9, 9, '2', { anchor: a.id, slot: 'left' });
  const scene = buildScene(doc);
  const [under, before] = [scene.texts.get(below.id), scene.texts.get(left.id)];
  assert.ok(under.anchored && under.box.y1 > 0.2 && under.box.x1 < 1 && under.box.x2 > 0, 'below the molecule, under its middle');
  assert.ok(before.box.x2 < 0 && before.box.y1 < 0.3 && before.box.y2 > -0.3, 'left of it, in its row');
  const back = readKet(writeKet(doc)).doc;
  const texts = [...back.texts.values()];
  const [a2] = [...back.atoms.values()].filter((atom) => atom.el === 'C');
  assert.deepEqual(texts.map((t) => [t.text, t.anchor === a2.id, t.slot ?? 'below']), [['1', true, 'below'], ['2', true, 'left']]);
  deleteObjects(doc, [a.id]);
  assert.deepEqual([...doc.texts.values()].map((t) => t.anchor), [b.id, b.id], 'on the atom left over');
  deleteObjects(doc, [b.id]);
  assert.equal(doc.texts.size, 0, 'with the molecule gone, its texts go too');
});

test('a multistep arrow stays one in KET', () => {
  const doc = emptyDoc();
  addArrow(doc, 0, 0, 3, 0, 'multistep');
  assert.deepEqual([...readKet(writeKet(doc)).doc.arrows.values()].map((a) => a.kind), ['multistep']);
});

test('on an arrow: texts and molecules stacked over and under it, kept in KET, free when the arrow goes', () => {
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 3, 0, 'forward');
  const over = addText(doc, 9, 9, 'H_{2}O', { arrow: arrow.id });
  const under = addText(doc, 9, 9, 'reflux', { arrow: arrow.id, slot: 'below' });
  const o = addAtom(doc, 7, 7, 'O', { arrow: arrow.id, arrowSlot: 'above', arrowSign: '−' });
  const scene = buildScene(doc);
  const [up, down] = [scene.texts.get(over.id), scene.texts.get(under.id)];
  const middle = (b) => (b.x1 + b.x2) / 2;
  assert.ok(up.anchored && up.box.y2 < 0 && Math.abs(middle(up.box) - 1.5) < 1e-9, 'over the arrow, in its middle');
  assert.ok(down.box.y1 > 0 && Math.abs(middle(down.box) - 1.5) < 1e-9, 'under it');
  // the O (made after the text) goes over the text, the editor moves it there
  const [move] = scene.arrowMoves;
  assert.ok(move && move.atoms[0] === o.id && 7 + move.dy < up.box.y1 && Math.abs(7 + move.dx - 1.5) < 0.8, JSON.stringify(move)); // (its H₂O label and the sign are what is centred)
  const [sign] = scene.arrowSigns;
  assert.ok(sign.text === '−' && sign.at[0] < 7 + move.dx - 0.3, 'a − in front of it');
  const back = readKet(writeKet(doc)).doc;
  const [arrow2] = [...back.arrows.keys()];
  assert.deepEqual([...back.texts.values()].map((t) => [t.text, t.arrow === arrow2, t.slot]), [['H_{2}O', true, 'above'], ['reflux', true, 'below']]);
  assert.deepEqual([...back.atoms.values()].map((a) => [a.arrow === arrow2, a.arrowSlot, a.arrowSign]), [[true, 'above', '−']]);
  deleteObjects(doc, [arrow.id]);
  assert.deepEqual([...doc.texts.values(), ...doc.atoms.values()].map((x) => x.arrow), [undefined, undefined, undefined]);
});

test('on an arrow: a − in front of a text as in front of a molecule (− AlCl₃ over, − HCl under), kept in KET', () => {
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 3, 0, 'forward');
  const text = addText(doc, 9, 9, 'AlCl_{3}', { arrow: arrow.id, arrowSign: '−' });
  const cl = addAtom(doc, 7, 7, 'Cl', { arrow: arrow.id, arrowSlot: 'below', arrowSign: '−' });
  const scene = buildScene(doc);
  const signs = new Map(scene.arrowSigns.map((s) => [s.textId ?? s.atom, s]));
  assert.equal(signs.size, 2);
  const written = scene.texts.get(text.id);
  const textSign = signs.get(text.id);
  // at the middle of its capitals, as far in front of its first letter as the molecule's from its HCl
  assert.ok(Math.abs(textSign.at[1] - (written.at[1] - (CAP_HEIGHT * STYLE.textFont) / 2)) < 1e-9, 'at the middle of the capitals');
  const [move] = scene.arrowMoves;
  const info = scene.atoms.get(cl.id);
  const front = 7 + move.dx + Math.min(...info.label.boxes.map((b) => b.x1));
  const molSign = signs.get(cl.id);
  assert.ok(Math.abs((written.lines[0].runs[0].x - textSign.at[0]) - (front - molSign.at[0])) < 1e-9, `gaps ${written.lines[0].runs[0].x - textSign.at[0]} and ${front - molSign.at[0]}`);
  // the text with its sign is what is centred over the arrow
  const half = written.lines[0].runs[0].x - textSign.at[0] - 0.3; // (half the sign's width: 0.3 between it and the text)
  assert.ok(Math.abs((textSign.at[0] - half + written.box.x2) / 2 - 1.5) < 1e-9, 'centred with its sign');
  assert.ok(sceneToSVG(scene).includes('>−</text></g>'), 'drawn with the text');
  const back = readKet(writeKet(doc)).doc;
  assert.deepEqual([...back.texts.values()].map((t) => [t.text, t.arrowSign]), [['AlCl_{3}', '−']]);
});

test('a stack on an arrow: in the order things were put there, put in another order, closing up when one goes', async () => {
  const { arrowTargets, putOnArrow, moleculeBox } = await import('../src/render/scene.js');
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 3, 0, 'forward');
  const water = addAtom(doc, 9, 9, 'O'); // made first
  const ring = [...Array(6)].map((_, k) => addAtom(doc, 20 + Math.cos(k * Math.PI / 3), 20 + Math.sin(k * Math.PI / 3)).id);
  ring.forEach((id, k) => addBond(doc, id, ring[(k + 1) % 6]));
  // the editor's part: molecules moved where the arrow puts them
  const settle = () => {
    let scene = buildScene(doc);
    for (const { atoms, dx, dy } of scene.arrowMoves) for (const id of atoms) { doc.atoms.get(id).x += dx; doc.atoms.get(id).y += dy; }
    scene = buildScene(doc);
    return scene;
  };
  const put = (members, index) => {
    const scene = settle();
    const target = arrowTargets(scene, moleculeBox(members, scene.atoms), members).find((t) => t.arrow === arrow.id && t.slot === 'above' && t.index === index);
    putOnArrow(doc, target, members.map((id) => doc.atoms.get(id)));
  };
  const height = (id) => doc.atoms.get(id).y;
  put(ring, 0);
  put([water.id], 1); // on top of the benzene
  settle();
  assert.ok(height(water.id) < Math.min(...ring.map(height)), 'the water over the benzene, though it is older');
  put([water.id], 0); // moved between the arrow and the benzene
  settle();
  assert.ok(height(water.id) > Math.max(...ring.map(height)), 'now between the arrow and the benzene');
  const lowest = Math.max(...ring.map(height));
  deleteObjects(doc, [water.id]);
  settle();
  const closed = Math.max(...ring.map(height));
  assert.ok(closed > lowest && Math.abs(closed - -0.45) < 0.2, `the benzene down in the place next to the arrow (${closed})`);
});

test('a stack on a molecule anchor: in the order texts were put there, put in another order, kept in KET', async () => {
  const { anchorTargets, putOnAnchor } = await import('../src/render/scene.js');
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C');
  addBond(doc, c.id, addAtom(doc, 1, 0, 'O').id);
  const yieldText = addText(doc, 5, 5, '85 %'); // made first
  const number = addText(doc, 5, 7, '3a', { bold: true });
  const put = (text, index) => {
    const target = anchorTargets(buildScene(doc), text).find((t) => t.slot === 'below' && t.index === index);
    putOnAnchor(doc, target, text);
  };
  const top = (text) => buildScene(doc).texts.get(text.id).box.y1;
  put(number, 0);
  put(yieldText, 1); // under the number, though it is older
  assert.ok(top(yieldText) > top(number), 'the yield under the number');
  const gap = anchorTargets(buildScene(doc), yieldText).find((t) => t.slot === 'below' && t.index === 0);
  assert.ok(gap.line && gap.line[1] < top(number), 'a place between the molecule and the number, shown as a line in the gap');
  put(yieldText, 0); // moved between the molecule and the number
  assert.ok(top(yieldText) < top(number), 'now the yield first');
  const back = readKet(writeKet(doc)).doc;
  const [first, second] = [...back.texts.values()].sort((p, q) => buildScene(back).texts.get(p.id).box.y1 - buildScene(back).texts.get(q.id).box.y1);
  assert.deepEqual([first.text, second.text], ['85 %', '3a']);
});

test('the depth of bonds from a 3D view stays in KET', () => {
  const doc = emptyDoc();
  const [a, b] = [addAtom(doc, 0, 0, 'C'), addAtom(doc, 1, 0, 'O')];
  addBond(doc, a.id, b.id, 1, { z: -0.375 });
  assert.deepEqual([...readKet(writeKet(doc)).doc.bonds.values()].map((x) => x.z), [-0.375]);
});

test('KET for Ketcher: nothing at the top but what its schema allows (our section in the root); files with it at the top still read', () => {
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'O', { lonePairs: 'auto', color: '#d0021b' });
  addBond(doc, a.id, addAtom(doc, 1, 0).id);
  const ket = toKet(doc);
  // Ketcher's schema (ketcher-core, serializers/ket/schema.json): "additionalProperties": false at the top
  for (const key of Object.keys(ket)) assert.match(key, /^(root|ket_version|header|mol\d+|rg\d+)$/, `${key} at the top`);
  assert.ok(ket.root.olomol, 'our section in the root');
  const old = { ...ket, root: { nodes: ket.root.nodes }, olomol: ket.root.olomol }; // as 0.2.1 and earlier wrote it
  assert.equal([...readKet(JSON.stringify(old)).doc.atoms.values()][0].color, '#d0021b');
});

test('a text\'s lines: centred under a molecule and on an arrow, from the left elsewhere, as set if set; kept in KET (Ketcher\'s alignment too)', () => {
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'O');
  const name = addText(doc, 0, 0, 'dimethyl-\nsuccinate', { anchor: a.id });
  const free = addText(doc, 5, 5, 'one\nthree');
  const right = addText(doc, 5, 9, 'one\nthree', { align: 'right' });
  const scene = buildScene(doc);
  const middle = (line) => line.runs[0].x + line.width / 2;
  const [n, f, r] = [name, free, right].map((x) => scene.texts.get(x.id).lines);
  assert.ok(Math.abs(middle(n[0]) - middle(n[1])) < 1e-9, 'under a molecule: centred');
  assert.ok(Math.abs(f[0].runs[0].x - f[1].runs[0].x) < 1e-9, 'free: from the left');
  assert.ok(Math.abs(r[0].runs[0].x + r[0].width - (r[1].runs[0].x + r[1].width)) < 1e-9, 'set: from the right');
  const ket = toKet(doc);
  assert.deepEqual(ket.root.nodes.filter((x) => x.type === 'text').map((x) => x.alignment ?? 'left'), ['center', 'left', 'right']);
  assert.deepEqual([...readKet(JSON.stringify(ket)).doc.texts.values()].map((x) => x.align ?? null), [null, null, 'right']);
});

test('side arcs of a reaction arrow and what stands at their ends: kept in KET', () => {
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 3, 0, 'forward', { sides: [{ side: 'below', way: 'out', reach: 1.25 }] });
  addText(doc, 0, 0, 'NADH', { arrow: arrow.id, slot: 'below-out' });
  const { doc: back } = readKet(writeKet(doc));
  const [arc] = [...back.arrows.values()][0].sides;
  assert.deepEqual([arc.side, arc.way, arc.reach], ['below', 'out', 1.25]);
  assert.ok(Number.isInteger(arc.id), 'an id of its own');
  assert.equal([...back.texts.values()][0].slot, 'below-out');
});

test('a side arc moved to the other side takes its stack along (an arc going the same way there changes places); a reaction arrow flipped top to bottom or turned round', async () => {
  const { arcToOtherSide, flipArrowSides, reverseArrow } = await import('../src/model/doc.js');
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 3, 0, 'forward', { sides: [{ id: 50, side: 'above', way: 'in', reach: 1 }, { id: 51, side: 'below', way: 'in', reach: 1 }] });
  const nad = addText(doc, 0, 0, 'NAD+', { arrow: arrow.id, slot: 'above-in', order: 0 });
  const h = addText(doc, 0, 0, 'H+', { arrow: arrow.id, slot: 'above-in', order: 1 });
  const water = addText(doc, 0, 0, 'H2O', { arrow: arrow.id, slot: 'below-in' });
  const enzyme = addText(doc, 0, 0, 'ADH', { arrow: arrow.id });
  arcToOtherSide(doc, arrow, arrow.sides[0]);
  assert.deepEqual(arrow.sides.map((e) => `${e.id}:${e.side}`), ['50:below', '51:above']);
  assert.deepEqual([nad.slot, h.slot, nad.order, h.order, water.slot], ['below-in', 'below-in', 0, 1, 'above-in'], 'the stacks with their arcs, in their order');
  flipArrowSides(doc, arrow);
  assert.deepEqual([arrow.sides.map((e) => e.side).join(), nad.slot, water.slot, enzyme.slot], ['above,below', 'above-in', 'below-in', 'below']);
  reverseArrow(arrow);
  assert.deepEqual([arrow.x1, arrow.x2], [3, 0]);
});

test('three or four unpaired electrons (Lewis symbols) carry their hydrogens in KET, so that Indigo adds none; read back, they are not fixed', () => {
  const doc = emptyDoc();
  addAtom(doc, 0, 0, 'N', { radical: 4 }); // ·N̈·
  addAtom(doc, 3, 0, 'C', { radical: 5 }); // ·Ċ·
  const ket = toKet(doc);
  const atoms = Object.values(ket).filter((n) => n?.type === 'molecule').flatMap((m) => m.atoms);
  assert.deepEqual(atoms.map((a) => [a.label, a.radical, a.implicitHCount]), [['N', 3, 0], ['C', 3, 0]]);
  const back = readKet(writeKet(doc));
  assert.deepEqual([...back.doc.atoms.values()].map((a) => [a.el, a.radical, a.hCount]), [['N', 4, null], ['C', 5, null]]);
});

// CDXML through Indigo (the fixture's .indigo.ket: what Indigo made of the marked text): a lone "C" ChemDraw
// gives no hydrogens stays C (not CH4), a label ChemDraw couldn't read (SiR3) stays a label (not H2Si),
// counts as olomol's own are left automatic, isotopes are kept, a lone D (no mark on hydrogen) is found by its place
test('CDXML: ChemDraw\'s hydrogens and unreadable labels kept', () => {
  const cdxml = readFileSync(new URL('./fixtures/chemdraw-labels.cdxml', import.meta.url), 'utf8');
  assert.ok(isCdxml(cdxml) && !isCdxml('{"root":{}}'));
  const prepared = prepareCdxml(cdxml);
  const { text, marks } = prepared;
  assert.match(text, /NodeType="GenericNickname" GenericNickname="SiR3"/);
  assert.ok(!text.includes('Element="14"'), 'the Si ChemDraw found inside the label is gone');
  assert.deepEqual([...marks.values()].map((m) => m.hydrogens).filter((h) => h !== null), [0, 1, 3]);
  assert.deepEqual(prepared.hydrogens.map((h) => h.hydrogens), [0, 0], 'the D bonded to C and the lone D, by their places');
  assert.match(text, /Element="1" Isotope="2"/);
  const { doc, ids } = readKet(readFileSync(new URL('./fixtures/chemdraw-labels.indigo.ket', import.meta.url), 'utf8'));
  applyCdxmlHydrogens(doc, takeCdxmlMarks(doc, ids, prepared));
  const atoms = [...doc.atoms.values()];
  const lone = fragments(doc).filter((members) => members.length === 1).map(([id]) => doc.atoms.get(id));
  assert.deepEqual(lone.map((a) => [a.el, a.isotope, a.hCount]), [['C', null, 0], ['H', 2, 0]], 'a lone C and a lone D, neither given hydrogens');
  assert.deepEqual(atoms.filter((a) => a.alias).map((a) => [a.el, a.alias]), [['*', 'SiR3']]);
  assert.deepEqual(atoms.filter((a) => a.el === 'O').map((a) => a.hCount), [null]);
  assert.deepEqual(atoms.filter((a) => a.isotope).map((a) => [a.el, a.isotope, a.hCount]).sort(), [['C', 13, null], ['H', 2, null], ['H', 2, 0]]);
  assert.ok(atoms.every((a) => !(a.isotope >= 900000)), 'no mark left');
});

// A reaction without places for its "+" and arrow (RXN): Indigo's are between the atoms' middles, the
// agents spread where the file had them (the fixture: Indigo's KET of RDKit's v3k_with_agents.rxn).
// Afterwards the agents ride the arrow, and "+" and arrow keep clear of the labels.
test('a read RXN: agents on the arrow, "+" and arrow clear of the labels', () => {
  const { doc, ids } = readKet(readFileSync(new URL('./fixtures/rxn-with-agents.indigo.ket', import.meta.url), 'utf8'));
  alignReadReaction(doc, ids);
  const scene = buildScene(doc);
  const boxOf = (members) => {
    const xs = members.flatMap((id) => {
      const atom = doc.atoms.get(id);
      const boxes = scene.atoms.get(id).label?.boxes ?? [];
      return [atom.x, ...boxes.flatMap((b) => [atom.x + b.x1, atom.x + b.x2])];
    });
    return [Math.min(...xs), Math.max(...xs)];
  };
  const [arrow] = doc.arrows.values();
  const [plus] = doc.pluses.values();
  const molecules = fragments(doc).map((members) => ({ members, riding: members.some((id) => doc.atoms.get(id).arrow === arrow.id), box: boxOf(members) }));
  assert.equal(molecules.filter((m) => m.riding).length, 3, 'H2O, Na and HCl on the arrow');
  const row = molecules.filter((m) => !m.riding).sort((p, q) => p.box[0] - q.box[0]);
  assert.equal(row.length, 3);
  const gap = 0.3;
  assert.ok(row[0].box[1] + gap < plus.x - 0.2 && plus.x + 0.2 + gap < row[1].box[0], `the + between the reactants (${row[0].box[1].toFixed(2)} | ${plus.x.toFixed(2)} | ${row[1].box[0].toFixed(2)})`);
  assert.ok(row[1].box[1] + gap < arrow.x1 && arrow.x2 + gap < row[2].box[0], `the arrow between NH3 and the product (${row[1].box[1].toFixed(2)} | ${arrow.x1.toFixed(2)}–${arrow.x2.toFixed(2)} | ${row[2].box[0].toFixed(2)})`);
  assert.ok(arrow.x2 - arrow.x1 < 3.5, `the arrow as long as its agents need, not as in the file (${(arrow.x2 - arrow.x1).toFixed(2)})`);
});

// KET as Ketcher and Indigo write it: an R-group atom (rg-label) and an atom list are labels, not carbons; a
// double bond with its E or Z not said (stereo 3) gets a wavy bond beside it, as from a molfile
test('KET: R-group atoms and atom lists as labels, a double bond of either E or Z with a wavy bond', () => {
  const ket = {
    root: { nodes: [{ $ref: 'mol0' }] },
    mol0: {
      type: 'molecule',
      atoms: [{ type: 'rg-label', $refs: ['rg-1'], location: [0, 0, 0] }, { label: 'C', location: [1, 0, 0] }, { label: 'C', location: [1.5, -0.87, 0] },
        { label: 'C', location: [2.5, -0.87, 0] }, { type: 'atom-list', elements: ['C', 'N'], location: [3, 0, 0] }, { type: 'atom-list', elements: ['O', 'S'], notList: true, location: [3, -1.73, 0] }],
      bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }, { type: 2, atoms: [2, 3], stereo: 3 }, { type: 1, atoms: [3, 4] }, { type: 1, atoms: [3, 5] }],
    },
  };
  const { doc } = readKet(JSON.stringify(ket));
  const atoms = [...doc.atoms.values()];
  assert.deepEqual(atoms.filter((a) => a.el === '*').map((a) => a.alias), ['R1', '[C,N]', '![O,S]']);
  const bonds = [...doc.bonds.values()];
  assert.equal(bonds.filter((b) => b.stereo === 'wavy').length, 1, 'one wavy bond beside the double bond');
  assert.ok(bonds.every((b) => !b.either));
});

test('a + or − in front of a molecule on an arrow: at its atoms\' middle height, not raised by a charge or lone pair above (⁻:C≡N)', () => {
  const signHeight = (charged) => {
    const doc = emptyDoc();
    const arrow = addArrow(doc, 0, 0, 3, 0, 'forward');
    const c = addAtom(doc, 7, 7, 'C', { arrow: arrow.id, arrowSlot: 'above', arrowSign: '+', ...(charged && { charge: -1, lonePairs: 'auto' }) });
    const n = addAtom(doc, 8, 7, 'N', { arrow: arrow.id, arrowSlot: 'above' });
    addBond(doc, c.id, n.id, 3);
    const scene = buildScene(doc);
    const [sign] = scene.arrowSigns;
    const [move] = scene.arrowMoves;
    return sign.at[1] - (7 + (move?.dy ?? 0)); // (from the atoms' line)
  };
  assert.ok(Math.abs(signHeight(true) - signHeight(false)) < 1e-6, `the same height with the charge and lone pair as without (${signHeight(true)}, ${signHeight(false)})`);
});

test('a + or − in front of a molecule on an arrow: in front of the count on its left too (+ 2 H2O), not on it', () => {
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 4, 0, 'forward');
  const o = addAtom(doc, 7, 7, 'O', { arrow: arrow.id, arrowSlot: 'above', arrowSign: '+' });
  const count = addText(doc, 6, 7, '2', { anchor: o.id, slot: 'left' });
  const name = addText(doc, 7, 8, 'water, a long name under it', { anchor: o.id, slot: 'below' });
  const scene = buildScene(doc);
  const [sign] = scene.arrowSigns;
  const countBox = scene.texts.get(count.id).box;
  assert.ok(sign.at[0] < countBox.x1 - 0.05, `the + (${sign.at[0].toFixed(2)}) left of the 2 (${countBox.x1.toFixed(2)})`);
  assert.ok(sign.at[0] > scene.texts.get(name.id).box.x1, 'not pushed out by the wider name under it');
});

test('a stack on a turned arrow: one under the other on the page, beside an upright arrow lined up towards it, never across it', () => {
  for (const deg of [0, 30, 45, 90, -90, 135, -60, 180]) {
    const doc = emptyDoc();
    const a = (deg * Math.PI) / 180;
    const [ux, uy] = [Math.cos(a), -Math.sin(a)];
    const arrow = addArrow(doc, -2 * ux, -2 * uy, 2 * ux, 2 * uy, 'forward');
    const near = addText(doc, 0, 0, 'NH_{3}', { arrow: arrow.id, slot: 'above', order: 0 });
    const far = addText(doc, 0, 0, 'an enzyme', { arrow: arrow.id, slot: 'above', order: 1 });
    const under = addText(doc, 0, 0, '−78 °C', { arrow: arrow.id, slot: 'below', order: 0 });
    const scene = buildScene(doc);
    const [n, f, u] = [near, far, under].map((t) => scene.texts.get(t.id).box);
    const what = `at ${deg}°`;
    // (as over a horizontal arrow: the first nearest the arrow, the next above it)
    assert.ok(f.y2 <= n.y1 + 1e-9, `${what}: the second above the first`);
    // no box across the arrow: all its corners on one side of the arrow's line, the stacks on opposite sides
    const side = (b) => [[b.x1, b.y1], [b.x2, b.y1], [b.x1, b.y2], [b.x2, b.y2]].map(([x, y]) => Math.sign(ux * y - uy * x));
    for (const [b, name] of [[n, 'first'], [f, 'second'], [u, 'under']]) assert.equal(new Set(side(b)).size, 1, `${what}: the ${name} clear of the arrow`);
    assert.notEqual(side(n)[0], side(u)[0], `${what}: the two stacks either side`);
    if (Math.abs(Math.sin(a)) > 0.9) {
      // upright: beside it, lined up on the side towards it, the block at the arrow's middle
      const towards = Math.sign(-(n.x1 + n.x2)); // (+1: the stack on the left)
      const edge = (b) => (towards > 0 ? b.x2 : b.x1);
      assert.ok(Math.abs(edge(n) - edge(f)) < 1e-9, `${what}: lined up towards the arrow`);
      assert.ok(Math.abs((f.y1 + n.y2) / 2) < 1e-9, `${what}: the block at the arrow's middle`);
    }
    if (deg === 0) assert.ok(Math.abs((n.x1 + n.x2) / 2) < 1e-9 && Math.abs((f.x1 + f.x2) / 2) < 1e-9, 'horizontal: centred over it, as before');
  }
});

// --- other programs' files: what they hold, kept (0.4.5) ---

test('a molfile keeps dative bonds (from the donor) and hydrogen bonds', () => {
  const doc = emptyDoc();
  const [n, pt, cl, o, h, o2] = [addAtom(doc, 0, 0, 'N'), addAtom(doc, 1, 0, 'Pt'), addAtom(doc, 2, 0, 'Cl'), addAtom(doc, 4, 0, 'O'), addAtom(doc, 5, 0, 'H'), addAtom(doc, 6, 0, 'O')];
  addBond(doc, n.id, pt.id, 1, { kind: 'dative' });
  addBond(doc, pt.id, cl.id, 1);
  addBond(doc, o.id, h.id, 1);
  addBond(doc, h.id, o2.id, 1, { kind: 'hbond' });
  const { molfile } = writeMolfile(doc, null, '', { kinds: true });
  const back = readMolfile(molfile).doc;
  const kinds = [...back.bonds.values()].map((b) => `${back.atoms.get(b.a).el}${b.kind ?? '-'}${back.atoms.get(b.b).el}`);
  assert.deepEqual(kinds.sort(), ['HhbondO', 'NdativePt', 'O-H', 'Pt-Cl']);
  // (for SMILES, as the standard has it: the complex as its parts)
  assert.equal(canonical(writeMolfile(doc, [n.id, pt.id, cl.id]).molfile), 'N.[Cl][Pt]');
});

test('a V3000 molfile: D, T and R# as in a V2000 one (hydrogen 2 and 3, a label R)', () => {
  const v3 = '\n  t\n\n  0  0  0     0  0            999 V3000\nM  V30 BEGIN CTAB\nM  V30 COUNTS 3 2 0 0 0\nM  V30 BEGIN ATOM\nM  V30 1 D 0 0 0 0\nM  V30 2 C 1.5 0 0 0\nM  V30 3 R# 3 0 0 0\nM  V30 END ATOM\nM  V30 BEGIN BOND\nM  V30 1 1 1 2\nM  V30 2 1 2 3\nM  V30 END BOND\nM  V30 END CTAB\nM  END\n';
  const atoms = [...readMolfile(v3).doc.atoms.values()].map((a) => `${a.el}${a.isotope ?? ''}${a.alias ?? ''}`);
  assert.deepEqual(atoms, ['H2', 'C', '*R']);
});

test('a repeating unit (brackets with n) goes into a molfile as an SRU and comes back round its atoms', () => {
  const doc = emptyDoc();
  const atoms = [0, 1, 2, 3].map((x) => addAtom(doc, x, 0));
  for (let i = 0; i < 3; i++) addBond(doc, atoms[i].id, atoms[i + 1].id, 1);
  addBracket(doc, 0.5, -0.6, 2.5, 0.6, { sub: 'n', atoms: [atoms[1].id, atoms[2].id] });
  const { molfile } = writeMolfile(doc, null, '', { units: true });
  assert.match(molfile, /M {2}STY {2}1 {3}1 SRU/);
  const back = readMolfile(molfile).doc;
  const [bracket] = back.brackets.values();
  assert.equal(bracket.sub, 'n');
  // (the two middle carbons)
  const order = [...back.atoms.values()].sort((p, q) => p.x - q.x).map((atom) => atom.id);
  assert.deepEqual([...bracket.atoms].sort(), [order[1], order[2]].sort());
});

test("Ketcher's and Indigo's KET: a valence set gives the H count, an SRU brackets with n, CH4 an atom", () => {
  const ket = {
    root: { nodes: [{ $ref: 'mol0' }, { $ref: 'mol1' }] },
    mol0: { type: 'molecule', atoms: [{ label: 'C', location: [0, 0, 0], explicitValence: 3 }, { label: 'C', location: [1, 0, 0] }, { label: 'C', location: [2, 0, 0] }, { label: 'C', location: [3, 0, 0] }],
      bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }, { type: 1, atoms: [2, 3] }], sgroups: [{ type: 'SRU', atoms: [1, 2], subscript: 'n', connectivity: 'HT' }] },
    mol1: { type: 'molecule', atoms: [{ label: 'CH4', location: [5, 0, 0] }, { label: 'H2O', location: [7, 0, 0] }], bonds: [] },
  };
  const { doc } = readKet(ket);
  const atoms = [...doc.atoms.values()];
  assert.equal(atoms[0].hCount, 2);
  assert.deepEqual(atoms.slice(4).map((a) => `${a.el}${a.hCount}`), ['C4', 'O2']);
  assert.deepEqual([...doc.brackets.values()].map((b) => [b.sub, b.atoms.length]), [['n', 2]]);
  // (our own repeating units: written for Ketcher, ours read from our section, not twice)
  assert.equal(readKet(writeKet(doc)).doc.brackets.size, 1);
  assert.ok(Object.values(toKet(doc)).some((m) => m.sgroups?.some((g) => g.type === 'SRU')));
});

test("a draft text's own sub- and superscripts, bold and italic (Ketcher's, ChemDraw's through Indigo); none: guessed", () => {
  const text = (blocks) => [...readKet({ root: { nodes: [{ type: 'text', data: { content: JSON.stringify({ blocks, entityMap: {} }), position: { x: 0, y: 0, z: 0 } } }] } }).doc.texts.values()][0].text;
  assert.equal(text([{ text: 'm2, 10 cm-1, SN2', inlineStyleRanges: [{ offset: 1, length: 1, style: 'SUPERSCRIPT' }, { offset: 9, length: 2, style: 'SUPERSCRIPT' }, { offset: 14, length: 1, style: 'SUBSCRIPT' }] }]), 'm^{2}, 10 cm^{-1}, S_{N}2');
  assert.equal(text([{ text: 't-BuOK', inlineStyleRanges: [{ offset: 0, length: 1, style: 'ITALIC' }] }]), '~{t}-BuOK');
  assert.equal(text([{ text: 'H2O', inlineStyleRanges: [] }]), 'H_{2}O');
});

test('Export says what a format has no place for: curved arrows and texts not in a molfile, nothing missing in KET', async () => {
  const { lostIn } = await import('../src/io/lost.js');
  const doc = emptyDoc();
  const [a, b] = [addAtom(doc, 0, 0, 'O', { charge: -1 }), addAtom(doc, 3, 0)];
  addCurve(doc, { atom: a.id }, { atom: b.id });
  addText(doc, 0, 2, 'SN2');
  assert.deepEqual(lostIn(doc, 'mol'), ['curved arrows', 'texts']);
  assert.deepEqual(lostIn(doc, 'mol', [a.id, b.id]), []);
  assert.deepEqual(lostIn(doc, 'ket'), []);
});

test('a dative bond counts in the valence field at its acceptor only, as RDKit writes it: NH3->PtH(Cl) and back', () => {
  const doc = emptyDoc();
  const [n, pt, cl] = [addAtom(doc, 0, 0, 'N', { hCount: 3 }), addAtom(doc, 1, 0, 'Pt', { hCount: 1 }), addAtom(doc, 2, 0, 'Cl')];
  addBond(doc, n.id, pt.id, 1, { kind: 'dative' });
  addBond(doc, pt.id, cl.id, 1);
  const { molfile } = writeMolfile(doc, null, '', { kinds: true });
  assert.equal(canonical(molfile), '[NH3]->[PtH][Cl]');
  const back = readMolfile(molfile).doc;
  // (N's three H as it has them anyway: no field, which RDKit and Indigo read differently on a dative bond)
  assert.deepEqual([...back.atoms.values()].map((a) => `${a.el}${a.hCount ?? ''}`), ['N', 'Pt1', 'Cl']);
});


test('KET for Ketcher: a bond whose stereo a projection replaced by a wedge comes back as drawn, whatever it was', () => {
  for (const was of ['', 'perspective', 'wedge', 'hash', 'wavy']) {
    const doc = emptyDoc();
    const a = addAtom(doc, 0, 0);
    const b = addAtom(doc, 1, 0);
    const bond = addBond(doc, a.id, b.id, 1);
    bond.stereo = 'wedge'; // (as written for Ketcher)
    const back = readKet(toKet(doc, { projected: new Map([[bond.id, { stereo: was, swapped: false }]]) })).doc;
    assert.equal([...back.bonds.values()][0].stereo, was, `drawn as ${was || 'plain'}`);
  }
});
