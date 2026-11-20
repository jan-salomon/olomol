// .olom, olomol's own format: every drawing olomol has (the examples, the test files) written and read back
// unchanged; no field of the model without a name in the format; what a reader doesn't know kept; versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { readKet, toKet } from '../src/io/ket.js';
import { isOlom, readOlom, toOlom, VERSION, writeOlom } from '../src/io/olom.js';
import { addArrow, addAtom, addBond, addOrbital, addPlus, addText, emptyDoc, KINDS } from '../src/model/doc.js';

// the drawings olomol has: the examples (.olom), the KET test files
const drawings = [
  ...readdirSync('src/ui/examples').filter((f) => f.endsWith('.olom')).map((f) => `src/ui/examples/${f}`),
  ...readdirSync('tests/fixtures', { recursive: true }).filter((f) => String(f).endsWith('.ket')).map((f) => `tests/fixtures/${f}`),
];

// a drawing as plain data to compare: what is unset left out, numbers to 3 places
const plain = (value) => {
  if (typeof value === 'number') return Math.round(Math.round(value * 10000) / 10) / 1000 + 0; // (as written: 4 places)
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '').map(([k, v]) => [k, plain(v)]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return value;
};
// (a drawing without a style of its own: written with the one for new drawings, here the default)
const contents = (doc) => Object.fromEntries([...KINDS.map((kind) => [kind, [...doc[kind].values()].map(plain)]), ['style', plain(doc.style ?? { style: 'screen' })]]);

test('.olom: every example and test drawing written and read back is the same drawing, every field named', () => {
  assert.ok(drawings.filter((path) => path.endsWith('.olom')).length > 20);
  for (const path of drawings) {
    let doc;
    try {
      ({ doc } = (path.endsWith('.olom') ? readOlom : readKet)(readFileSync(path, 'utf8')));
    } catch {
      continue; // (a test file that isn't a drawing)
    }
    const unmapped = new Set();
    const text = writeOlom(doc, { unmapped });
    assert.deepEqual([...unmapped], [], `${path}: fields with no name in .olom`);
    const back = readOlom(text);
    assert.deepEqual(contents(back.doc), contents(doc), path);
    assert.equal(writeOlom(back.doc), text, `${path}: written again, the same file`);
  }
});

test('.olom: x to the right and y up, angles counter-clockwise (the drawing has y down)', () => {
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'C');
  addAtom(doc, 0, -1, 'O'); // (above it on screen)
  addOrbital(doc, a.id, { angle: -Math.PI / 2 }); // (pointing up on screen)
  const file = toOlom(doc);
  assert.deepEqual(file.atoms.map(({ x, y }) => [x, y]), [[0, 0], [0, 1]]);
  assert.equal(file.orbitals[0].angle, 90);
  const back = readOlom(JSON.stringify(file)).doc;
  assert.equal([...back.atoms.values()][1].y, -1);
  assert.ok(Math.abs([...back.orbitals.values()][0].angle + Math.PI / 2) < 1e-9);
});

test('.olom: recognised by its content, with its version', () => {
  const doc = emptyDoc();
  addAtom(doc, 0, 0, 'O');
  const text = writeOlom(doc);
  assert.ok(isOlom(text));
  assert.ok(!isOlom('{"root":{"nodes":[]}}'));
  assert.equal(JSON.parse(text).version, VERSION);
});

test('.olom: what a reader does not know is kept and written back', () => {
  const file = {
    format: 'olom', version: '1.0', 'grader:points': 3,
    atoms: [{ id: 1, element: 'C', x: 0, y: 0, 'grader:correct': true }, { id: 2, element: 'O', x: 1, y: 0 }],
    bonds: [{ id: 3, atoms: [1, 2], order: 2, 'grader:note': 'carbonyl' }],
    holograms: [{ id: 9, x: 5 }],
  };
  const { doc } = readOlom(JSON.stringify(file));
  const out = toOlom(doc);
  assert.equal(out['grader:points'], 3);
  assert.deepEqual(out.holograms, [{ id: 9, x: 5 }]);
  assert.equal(out.atoms[0]['grader:correct'], true);
  assert.equal(out.bonds[0]['grader:note'], 'carbonyl');
  assert.equal(out.bonds[0].order, 2);
});

test('.olom: a newer minor version opens (with a note), a newer major version is refused', () => {
  const file = (version) => JSON.stringify({ format: 'olom', version, atoms: [{ id: 1, element: 'N', x: 0, y: 0, glow: 'blue' }] });
  const read = readOlom(file('1.7'));
  assert.equal(read.newer, true);
  assert.equal(read.doc.atoms.get(1).el, 'N');
  assert.equal(toOlom(read.doc).atoms[0].glow, 'blue');
  assert.throws(() => readOlom(file('2.0')), /newer olomol/);
});

test('.olom: read into a drawing with objects (pasted), everything gets new ids and keeps its links', () => {
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'C');
  const b = addAtom(doc, 1, 0, 'C');
  addBond(doc, a.id, b.id);
  const text = writeOlom(doc);
  const { doc: both, ids } = readOlom(text, doc);
  assert.equal(both.atoms.size, 4);
  assert.equal(both.bonds.size, 2);
  const pasted = [...both.bonds.values()][1];
  assert.ok(ids.includes(pasted.a) && ids.includes(pasted.b) && pasted.a !== a.id);
});

test('.olom: a part (a selection) holds what it needs only', () => {
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'C');
  const b = addAtom(doc, 1, 0, 'O');
  addBond(doc, a.id, b.id);
  const part = toOlom(doc, { ids: [a.id] });
  assert.equal(part.atoms.length, 1);
  assert.equal(part.bonds, undefined);
});

// Files of each released version, frozen (tests/fixtures/olom/<version>/): never changed, every later olomol must
// read them with everything in them understood, and write them back the same (but for the app that wrote them).
test('.olom: the files of every version read whole and written back the same', () => {
  const versions = readdirSync('tests/fixtures/olom');
  assert.ok(versions.includes('1.0'));
  for (const version of versions) {
    for (const name of readdirSync(`tests/fixtures/olom/${version}`)) {
      const text = readFileSync(`tests/fixtures/olom/${version}/${name}`, 'utf8');
      const { doc, title, newer } = readOlom(text);
      const path = `${version}/${name}`;
      assert.ok(!newer && !doc.unknown && KINDS.every((kind) => [...doc[kind].values()].every((o) => !o.unknown)), `${path}: everything in it understood`);
      assert.ok(doc.atoms.size || doc.texts.size, `${path}: a drawing`);
      const app = (t) => t.replace(/^ "app": .*\n/m, '');
      assert.equal(app(writeOlom(doc, { title, ownStyle: true })), app(text), `${path}: written back the same`); // (its own style, or none)
    }
  }
});

test(".olom: the keys as revised before 1.0 (J): group, style, font, crossed, equals, the sign, a double bond's side", () => {
  const file = {
    format: 'olom', version: '1.0', style: { bond: 20, line: 1, bold: 3, hash: 3, margin: 2, label: 12, font: 'serif' },
    atoms: [{ id: 1, element: 'C', x: 0, y: 0 }, { id: 2, element: 'C', x: 1, y: 0 }, { id: 3, group: 'Ph', x: 5, y: 3, onArrow: { arrow: 6, slot: 'above', sign: '-' } }],
    bonds: [{ id: 4, atoms: [1, 2], order: 2, doubleBondSide: 'left' }],
    reactionArrows: [{ id: 5, from: [3, 0], to: [6, 0], kind: 'crossed' }, { id: 6, from: [3, 2], to: [6, 2], kind: 'equals' }],
    texts: [{ id: 7, x: 0, y: 0, text: 'AlCl_{3}', onArrow: { arrow: 6, slot: 'below', sign: '-' } }],
  };
  const { doc } = readOlom(JSON.stringify(file));
  assert.equal(doc.atoms.get(3).alias, 'Ph');
  assert.equal(doc.atoms.get(3).arrowSign, '−');
  assert.equal(doc.texts.get(7).arrowSign, '−');
  assert.deepEqual([doc.arrows.get(5).kind, doc.arrows.get(6).kind], ['failed', 'same']);
  assert.equal(doc.style.style, 'custom');
  assert.equal(doc.style.customStyle.family, 'serif');
  // "left" seen from a to b with y up: from (0,0) to (1,0), above; on screen (y down) the drawing's "right" of a→b
  assert.equal(doc.bonds.get(4).side, 'right');
  const out = toOlom(doc);
  assert.deepEqual(out.style, { ...file.style, bond: 20, line: 1, bold: 3, hash: 3, margin: 2, label: 12 });
  assert.equal(out.atoms[2].group, 'Ph');
  assert.equal(out.atoms[2].onArrow.sign, '-');
  assert.equal(out.texts[0].onArrow.sign, '-');
  assert.equal(out.bonds[0].doubleBondSide, 'left');
  assert.deepEqual(out.reactionArrows.map((a) => a.kind), ['crossed', 'equals']);
  assert.equal(toOlom(readOlom(JSON.stringify({ ...file, style: 'rsc' })).doc).style, 'rsc');
});

test('.olom: an electron arrow keeps the curve it was drawn as (y up in the file), a copy of it not the choice', async () => {
  const { copyObjects } = await import('../src/model/doc.js');
  const file = {
    format: 'olom', version: '1.0',
    atoms: [{ id: 1, element: 'O', x: 0, y: 0, charge: -1 }, { id: 2, element: 'C', x: 2, y: 0 }],
    electronArrows: [{ id: 3, from: { atom: 1 }, to: { atom: 2 }, curve: [[0.2, 0.1], [0.6, 0.8], [1.4, 0.8], [1.8, 0.1]], tip: [1.9, 0] }],
  };
  const { doc } = readOlom(JSON.stringify(file));
  const curve = doc.curves.get(3);
  assert.deepEqual(curve.hint.points[1], [0.6, -0.8]);
  assert.deepEqual(curve.drawn, curve.hint);
  assert.deepEqual(toOlom(doc).electronArrows[0].curve, file.electronArrows[0].curve);
  assert.deepEqual(toOlom(doc).electronArrows[0].tip, file.electronArrows[0].tip);
  const ids = copyObjects(doc, [1, 2], 5, 0);
  const copy = [...doc.curves.values()].find((c) => ids.includes(c.id));
  assert.equal(copy.hint, undefined);
  assert.deepEqual(copy.drawn.points[0], [5.2, -0.1]);
});

test('.olom: a value olomol does not know (a newer one\'s) is drawn as the default, kept and written back; changed, it goes', () => {
  const file = {
    format: 'olom', version: '1.1', style: 'wiley',
    atoms: [{ id: 1, element: 'C', x: 0, y: 0, projection: 'haworth' }, { id: 2, element: 'C', x: 1, y: 0 },
      { id: 3, element: 'O', x: 0, y: 2, onArrow: { arrow: 5, slot: 'beside' } }],
    bonds: [{ id: 4, atoms: [1, 2], order: 5, stereo: 'boldWedge' }],
    reactionArrows: [{ id: 5, from: [3, 0], to: [6, 0], kind: 'ionic' }],
    texts: [{ id: 6, x: 0, y: 0, text: 'x', align: 'justify' }],
    electronArrows: [{ id: 7, from: { atom: 1 }, to: { atom: 2 }, electrons: 3 }],
  };
  const { doc } = readOlom(JSON.stringify(file));
  const bond = doc.bonds.get(4);
  assert.deepEqual([bond.order, bond.stereo, doc.arrows.get(5).kind, doc.atoms.get(1).projection, doc.atoms.get(3).arrowSlot, doc.curves.get(7).electrons],
    [1, '', 'forward', undefined, 'above', 2]);
  assert.equal(doc.style, undefined);
  const out = toOlom(doc);
  assert.equal(out.style, 'wiley');
  assert.deepEqual([out.bonds[0].order, out.bonds[0].stereo, out.reactionArrows[0].kind, out.atoms[0].projection, out.atoms[2].onArrow.slot, out.texts[0].align, out.electronArrows[0].electrons],
    [5, 'boldWedge', 'ionic', 'haworth', 'beside', 'justify', 3]);
  // changed in the drawing: the drawing's value is written, not the kept one
  bond.stereo = 'wedge';
  doc.arrows.get(5).kind = 'equilibrium';
  doc.style = { style: 'acs' };
  const changed = toOlom(doc);
  assert.deepEqual([changed.bonds[0].stereo, changed.bonds[0].order, changed.reactionArrows[0].kind, changed.style], ['wedge', 5, 'equilibrium', 'acs']);
});

test('.olom: a number set by hand, or "iupac" (numbered with its molecule)', () => {
  const file = { format: 'olom', version: '1.0', atoms: [{ id: 1, element: 'C', x: 0, y: 0, number: 'iupac' }, { id: 2, element: 'C', x: 9, y: 0, number: 4 }] };
  const { doc } = readOlom(JSON.stringify(file));
  assert.equal(doc.atoms.get(1).autoNumber, true);
  assert.equal(doc.atoms.get(2).number, 4);
  assert.deepEqual(toOlom(doc).atoms.map((a) => a.number), ['iupac', 4]);
});

test('texts: a backslash writes { } \\ as they are, so typed markup stays text (and back the same)', async () => {
  const { parseMarkup, writeMarkup } = await import('../src/render/text.js');
  const typed = [...'a_{b} {x} C:\\temp *{'].map((ch) => ({ ch, shift: 0, bold: false, italic: false }));
  const sub = [...'H2O}'].map((ch, k) => ({ ch, shift: k === 1 || k === 3 ? 'sub' : 0, bold: false, italic: false }));
  for (const chars of [typed, sub]) assert.deepEqual(parseMarkup(writeMarkup(chars)), chars);
  assert.equal(writeMarkup(typed), 'a_\\{b\\} \\{x\\} C:\\\\temp *\\{');
  // a backslash before anything else is itself (texts written before the escapes)
  assert.equal(parseMarkup('C:\\temp').map((c) => c.ch).join(''), 'C:\\temp');
});

test('.olom: groups (a molecule by one of its atoms, nested), Keep together as "together", not as bonds', async () => {
  const file = {
    format: 'olom', version: '1.0',
    atoms: [{ id: 1, element: 'C', x: 0, y: 0 }, { id: 2, element: 'O', x: 1, y: 0 }, { id: 3, element: 'K', x: 5, y: 0, charge: 1 }, { id: 4, element: 'Cl', x: 7, y: 0, charge: -1 }],
    bonds: [{ id: 5, atoms: [1, 2] }],
    together: [{ id: 6, atoms: [3, 4] }],
    reactionArrows: [{ id: 7, from: [2, 0], to: [4, 0] }],
    plusSigns: [{ id: 8, x: 9, y: 0 }],
    groups: [{ id: 10, members: [9, 8] }, { id: 9, members: [2, 7] }],
  };
  const { doc } = readOlom(JSON.stringify(file));
  assert.equal(doc.bonds.get(6).kind, 'link');
  assert.deepEqual(doc.groups.get(9).members.sort(), [1, 2, 7]); // (the molecule held whole: C and O)
  assert.deepEqual(doc.groups.get(10).members, [9, 8]);
  const out = toOlom(doc);
  assert.deepEqual(out.bonds.map((b) => b.id), [5]);
  assert.deepEqual(out.together, [{ id: 6, atoms: [3, 4] }]);
  assert.deepEqual(out.groups, [{ id: 9, members: [1, 7] }, { id: 10, members: [9, 8] }]);
  // a part: only the groups all of whose things are in it
  assert.deepEqual(toOlom(doc, { ids: [1, 2, 7] }).groups, [{ id: 9, members: [1, 7] }]);
  assert.equal(toOlom(doc, { ids: [1, 2] }).groups, undefined);
  // copied whole: grouped again, as copies
  const { copyObjects } = await import('../src/model/doc.js');
  const before = doc.groups.size;
  copyObjects(doc, [1, 2, 7, 8], 0, 5);
  assert.equal(doc.groups.size, before + 2);
});

test('groups: what is gone goes out of its group, a group with nothing left goes', async () => {
  const { pruneGroups } = await import('../src/editor/grouping.js');
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'C');
  doc.pluses.set(50, { id: 50, x: 1, y: 0 });
  doc.groups.set(60, { id: 60, members: [a.id, 50] });
  doc.groups.set(61, { id: 61, members: [60] });
  doc.pluses.delete(50);
  pruneGroups(doc);
  assert.deepEqual(doc.groups.get(60).members, [a.id]);
  doc.atoms.delete(a.id);
  pruneGroups(doc);
  assert.equal(doc.groups.size, 0);
});

test('groups: two grouped molecules bonded into one are in one group, the older one', async () => {
  const { pruneGroups, groupChain } = await import('../src/editor/grouping.js');
  const doc = emptyDoc();
  const [a1, a2] = [addAtom(doc, 0, 0, 'C'), addAtom(doc, 1, 0, 'C')];
  addBond(doc, a1.id, a2.id, 1);
  const b1 = addAtom(doc, 5, 0, 'O');
  doc.pluses.set(50, { id: 50, x: 9, y: 0 });
  doc.groups.set(61, { id: 61, members: [b1.id, 50] });
  doc.groups.set(60, { id: 60, members: [a1.id] }); // (each molecule stands in its group by one atom)
  addBond(doc, a2.id, b1.id, 1); // bonded: one molecule, its atoms in both groups
  pruneGroups(doc);
  assert.deepEqual(doc.groups.get(60).members, [a1.id], 'kept in the older group');
  assert.deepEqual(doc.groups.get(61).members, [50], 'out of the other, which keeps its "+"');
  assert.deepEqual(groupChain(doc, b1.id), [60], 'Ctrl+click: one group, whichever atom is clicked');
  assert.deepEqual(groupChain(doc, a2.id), [60]);
  // the newer group left with nothing goes
  const d = emptyDoc();
  const [c1, c2] = [addAtom(d, 0, 0, 'C'), addAtom(d, 1, 0, 'C')];
  d.groups.set(70, { id: 70, members: [c1.id] });
  d.groups.set(71, { id: 71, members: [c2.id] });
  addBond(d, c1.id, c2.id, 1);
  pruneGroups(d);
  assert.deepEqual([...d.groups.keys()], [70]);
});

test('SVG pictures carry the groups (nested <g id="group-…">), each molecule, arrow and "+" in its own', async () => {
  const { buildScene } = await import('../src/render/scene.js');
  const { sceneToSVG } = await import('../src/render/svg.js');
  const { svgGrouping } = await import('../src/editor/grouping.js');
  const { addArrow } = await import('../src/model/doc.js');
  const svgOf = (doc) => sceneToSVG(buildScene(doc, {}), { grouping: svgGrouping(doc) });
  const doc = emptyDoc();
  const c = addAtom(doc, 0, 0, 'C');
  const o = addAtom(doc, 1, 0, 'O');
  addBond(doc, c.id, o.id);
  const n = addAtom(doc, 6, 0, 'N');
  const arrow = addArrow(doc, 2, 0, 5, 0, 'forward');
  doc.pluses.set(90, { id: 90, x: 8, y: 0, color: null });
  doc.groups.set(80, { id: 80, members: [c.id, o.id, arrow.id] });
  doc.groups.set(81, { id: 81, members: [80, n.id] });
  const svg = svgOf(doc, {});
  const outer = svg.indexOf('<g id="group-81">');
  const inner = svg.indexOf('<g id="group-80">');
  assert.ok(outer > 0 && inner > outer, 'the inner group inside the outer one');
  // the arrow inside the inner group, the plus outside both
  const at = (id) => svg.indexOf(`data-id="${id}"`);
  const close = (from) => {
    let depth = 0;
    for (let i = from; i < svg.length; i++) {
      if (svg.startsWith('<g', i)) depth += 1;
      else if (svg.startsWith('</g>', i) && --depth === 0) return i;
    }
    return -1;
  };
  assert.ok(at(arrow.id) > inner && at(arrow.id) < close(inner));
  assert.ok(at(90) > close(outer));
  // no groups, no group elements
  doc.groups.clear();
  assert.ok(!svgOf(doc, {}).includes('id="group-'));
});

test('groups: a name kept in the file and in SVG pictures (Inkscape\'s label); things moved between groups', async () => {
  const { moveIntoGroup, renameGroup } = await import('../src/editor/grouping.js');
  const { buildScene } = await import('../src/render/scene.js');
  const { sceneToSVG } = await import('../src/render/svg.js');
  const { svgGrouping } = await import('../src/editor/grouping.js');
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'C');
  const b = addAtom(doc, 3, 0, 'N');
  doc.pluses.set(40, { id: 40, x: 6, y: 0, color: null });
  doc.groups.set(50, { id: 50, members: [a.id, 40] });
  doc.groups.set(51, { id: 51, members: [b.id, 50] });
  const ed = { doc, change: (fn) => fn(doc) }; // (as the editor does it, without the undo step)
  renameGroup(ed, 50, '  Route A ');
  assert.equal(doc.groups.get(50).name, 'Route A');
  const back = readOlom(JSON.stringify(toOlom(doc))).doc;
  assert.equal(back.groups.get(50).name, 'Route A');
  const svg = sceneToSVG(buildScene(doc, {}), { grouping: svgGrouping(doc) });
  assert.match(svg, /<g id="group-50" inkscape:label="Route A"><title>Route A<\/title>/);
  assert.match(svg, /xmlns:inkscape=/);
  renameGroup(ed, 50, '');
  assert.equal(doc.groups.get(50).name, undefined);
  // the + out of group 50 into 51; then C out of every group (group 50, empty, goes); a group not into itself
  assert.equal(moveIntoGroup(ed, { id: 40 }, 51), true);
  assert.deepEqual(doc.groups.get(51).members, [b.id, 50, 40]);
  assert.equal(moveIntoGroup(ed, { group: 51 }, 50), false);
  assert.equal(moveIntoGroup(ed, { atoms: [a.id] }, null), true);
  assert.equal(doc.groups.has(50), false);
  assert.deepEqual(doc.groups.get(51).members, [b.id, 40]);
});

test('.olom: a sign in front of a text on an arrow (− AlCl3) written once, in onArrow, and read back', () => {
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 3, 0, 'forward');
  addText(doc, 1, -0.5, 'AlCl_{3}', { arrow: arrow.id, slot: 'above', arrowSign: '−' });
  const file = JSON.parse(writeOlom(doc));
  assert.deepEqual(Object.keys(file.texts[0]).sort(), ['id', 'onArrow', 'text', 'x', 'y']);
  assert.equal([...readOlom(writeOlom(doc)).doc.texts.values()][0].arrowSign, '−');
});

test('KET: groups (Ctrl+G) and their names kept, a group in a group too', () => {
  const doc = emptyDoc();
  const [a, b] = [addAtom(doc, 0, 0), addAtom(doc, 1, 0)];
  addBond(doc, a.id, b.id, 1);
  const plus = addPlus(doc, 2, 0);
  const note = addText(doc, 3, 0, 'note');
  const arrow = addArrow(doc, 4, 0, 6, 0, 'forward');
  doc.groups = new Map([[100, { id: 100, members: [a.id, plus.id], name: 'left' }], [101, { id: 101, members: [100, note.id, arrow.id] }]]);
  const back = readKet(toKet(doc)).doc;
  const groups = [...back.groups.values()];
  const kinds = (g) => g.members.map((id) => (back.groups.has(id) ? 'group' : back.atoms.has(id) ? 'atom' : back.pluses.has(id) ? 'plus' : back.texts.has(id) ? 'text' : 'arrow')).sort();
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, 'left');
  assert.deepEqual(kinds(groups[0]), ['atom', 'plus']);
  assert.deepEqual(kinds(groups[1]), ['arrow', 'group', 'text']);
});

test('.olom: charges circled and lone pairs as bars are the drawing\'s style, a preset\'s or its own, written and read back', () => {
  for (const style of [{ style: 'acs', charges: 'circled', lonePairs: 'bars' }, { style: 'rsc', lonePairs: 'bars' }, { style: 'screen' },
    { style: 'custom', customStyle: { bond: 12, line: 0.5, bold: 2, hash: 2.5, margin: 1.5, label: 9, family: 'serif' }, charges: 'circled' }]) {
    const doc = emptyDoc();
    addAtom(doc, 0, 0, 'O', { charge: 1, lonePairs: 'auto' });
    doc.style = style;
    const file = JSON.parse(writeOlom(doc));
    const back = readOlom(writeOlom(doc)).doc;
    assert.deepEqual(back.style, style, JSON.stringify(file.style));
    assert.deepEqual(readKet(toKet(doc)).doc.style, style);
  }
  const plain = emptyDoc();
  plain.style = { style: 'acs' };
  assert.equal(JSON.parse(writeOlom(plain)).style, 'acs');
});

// --- what the review before 0.5.0 found ---

test('.olom: a text at a side arc\'s free end (NADH) stays there; an aromatic bond stays aromatic; the 1 key\'s turn is not written', () => {
  const doc = emptyDoc();
  const arrow = addArrow(doc, 0, 0, 4, 0, 'forward');
  arrow.sides = [{ id: doc.nextId++, side: 'above', way: 'in', reach: 1 }];
  addText(doc, 1, -1, 'NADH', { arrow: arrow.id, slot: 'above-in' });
  const [a, b] = [addAtom(doc, 0, 3), addAtom(doc, 1, 3)];
  addBond(doc, a.id, b.id, 4, { turned: true });
  const unmapped = new Set();
  const text = writeOlom(doc, { unmapped });
  assert.ok(!text.includes('turned') && !unmapped.size);
  const back = readOlom(text).doc;
  assert.equal([...back.texts.values()][0].slot, 'above-in');
  assert.equal([...back.bonds.values()][0].order, 4);
});

test('.olom: a reference to the wrong kind of object (a bond to an arrow, an arrow end on an atom as a bond) is left out, not drawn from it', () => {
  const file = {
    format: 'olom', version: '1.0',
    atoms: [{ id: 1, element: 'C', x: 0, y: 0 }, { id: 2, element: 'O', x: 1, y: 0 }],
    reactionArrows: [{ id: 3, from: [3, 0], to: [6, 0] }],
    bonds: [{ id: 4, atoms: [1, 3] }, { id: 5, atoms: [1, 2] }],
    electronArrows: [{ id: 6, from: { bond: 1 }, to: { atom: 2 } }, { id: 7, from: {}, to: { atom: 1 } }],
  };
  const { doc } = readOlom(JSON.stringify(file));
  assert.deepEqual([...doc.bonds.keys()], [5]);
  assert.equal(doc.curves.size, 0);
});

test('.olom: a loosely written file (numbers as text, an arc without its reach, a point as an object) opens and saves', () => {
  const file = {
    format: 'olom', version: '1.0',
    atoms: [{ id: 1, element: 'C', x: 0, y: 0 }],
    reactionArrows: [{ id: 2, from: { x: 0, y: 0 }, to: [4, 0], sideArcs: [{ id: 3, side: 'below', way: 'out' }, null] }],
    texts: [{ id: 4, x: 0, y: 2, text: 'x', size: '2', onMolecule: { atom: 1, drop: '0.5' } }],
    orbitals: [{ id: 5, atom: 1, size: '1.5' }],
  };
  const { doc } = readOlom(JSON.stringify(file));
  assert.equal(doc.arrows.get(2).sides[0].reach, 1);
  assert.doesNotThrow(() => writeOlom(doc));
  assert.equal(doc.texts.get(4).size, 2);
});

test('.olom: what a newer olomol adds is kept: keys inside onArrow, a section\'s ids (no new object takes one), a style it names', () => {
  const file = {
    format: 'olom', version: '1.1', style: { preset: 'nature', charges: 'circled' },
    atoms: [{ id: 1, element: 'C', x: 0, y: 0, onArrow: { arrow: 2, slot: 'below', spacing: 2 } }],
    reactionArrows: [{ id: 2, from: [0, 0], to: [4, 0] }],
    arrowLabels: [{ id: 3, arrow: 2, text: 'hν' }],
  };
  const { doc } = readOlom(JSON.stringify(file));
  assert.ok(addAtom(doc, 5, 5).id > 3);
  const out = toOlom(doc);
  assert.equal(out.atoms[0].onArrow.spacing, 2);
  assert.deepEqual(out.style, { preset: 'nature', charges: 'circled' });
  assert.deepEqual(out.arrowLabels, file.arrowLabels);
});
