// Colours from outside (a file, a link, an embedding page) go into the drawing's SVG markup: only colours are kept
// and drawn (src/model/colour.js), anything else never reaches the markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanColours, isColour, isHighlight } from '../src/model/colour.js';
import { readOlom, writeOlom } from '../src/io/olom.js';
import { addAtom, addBond, addCurve, addOrbital, addText, emptyDoc } from '../src/model/doc.js';
import { buildScene } from '../src/render/scene.js';
import { sceneLayers, sceneToSVG } from '../src/render/svg.js';

const EVIL = 'red"/><image href="x" onerror="alert(1)';

test('what a colour is: hex, and for highlights also a pattern', () => {
  for (const ok of ['#000', '#2563eb', '#ABCDEF']) assert.ok(isColour(ok) && isHighlight(ok), ok);
  for (const ok of ['hatch:#f87171', 'lines:#2563eb', 'dots:#7c3aed']) assert.ok(isHighlight(ok) && !isColour(ok), ok);
  for (const bad of [EVIL, 'red', '#12', '#1234567', 'url(#x)', 'hatch:red', 'hatch:#f87171"', null, 3, {}]) {
    assert.ok(!isColour(bad) && !isHighlight(bad), String(bad));
  }
});

// a drawing with every kind of colour set to `colour`
function painted(colour) {
  const doc = emptyDoc();
  const a = addAtom(doc, 0, 0, 'O', { color: colour, highlight: colour });
  const b = addAtom(doc, 1, 0, 'C');
  const bond = addBond(doc, a.id, b.id, 1, { color: colour, highlight: colour });
  addText(doc, 0, 2, 'note', { color: colour, highlight: colour });
  addCurve(doc, { bond: bond.id }, { atom: a.id }, 2, { color: colour, highlight: colour });
  addOrbital(doc, b.id, { color: colour, colorOther: colour });
  return doc;
}

test('a file\'s colours that aren\'t one: taken away when read, the drawing drawn without them', () => {
  const { doc } = readOlom(writeOlom(painted(EVIL)));
  // (the atom's colour and highlight, the bond's, the text's, the curved arrow's colour, the orbital's two: a curved
  // arrow's highlight is the page's, not kept in files)
  assert.equal(cleanColours(doc), 9);
  for (const things of [doc.atoms, doc.bonds, doc.texts, doc.curves]) {
    for (const thing of things.values()) assert.ok(!String(thing.color ?? '').includes('"') && !String(thing.highlight ?? '').includes('"'));
  }
  // real colours stay
  const kept = readOlom(writeOlom(painted('hatch:#f87171'))).doc;
  cleanColours(kept);
  assert.equal([...kept.atoms.values()][0].highlight, 'hatch:#f87171');
});

test('the markup never holds a colour that isn\'t one, even one put in the drawing directly', () => {
  const doc = painted(EVIL);
  for (const dark of [false, true]) {
    const markup = sceneLayers(buildScene(doc), 40, { dark }).map(([, m]) => m).join('');
    assert.ok(!markup.includes('onerror'), `dark ${dark}`);
  }
  assert.ok(!sceneToSVG(buildScene(doc)).includes('onerror'));
  // a real colour is drawn as it is
  assert.ok(sceneToSVG(buildScene(painted('#d0021b'))).includes('#d0021b'));
});
