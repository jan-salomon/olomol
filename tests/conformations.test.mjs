// How a drawing shows its molecules in space (src/embed/conformations.js): a chair's groups axial or equatorial, a
// Newman projection's groups anti, gauche or eclipsed, as drawn
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chairDoc } from '../src/chem/chair.js';
import { newmanDoc } from '../src/chem/newman.js';
import { conformationsOf } from '../src/embed/conformations.js';

const slotOf = (doc, el) => {
  const { chairs } = conformationsOf(doc);
  const group = chairs[0]?.groups.find((g) => doc.atoms.get(g.first).el === el);
  return group?.slot;
};

test('a chair: Br axial, or equatorial; a ring drawn flat: no chair', () => {
  assert.equal(slotOf(chairDoc({ axial: ['Br'], equatorial: [] }), 'Br'), 'axial');
  assert.equal(slotOf(chairDoc({ axial: [], equatorial: ['Br'] }), 'Br'), 'equatorial');
});

test('a Newman projection: the two Br anti, gauche or eclipsed, as drawn', () => {
  for (const [dihedral, relation] of [[180, 'anti'], [60, 'gauche'], [0, 'eclipsed']]) {
    const doc = newmanDoc(['Br', 'H', 'H'], ['Br', 'H', 'H'], dihedral);
    const [newman] = conformationsOf(doc).newmans;
    const pair = newman.pairs.find((p) => doc.atoms.get(p.front).el === 'Br' && doc.atoms.get(p.back).el === 'Br');
    assert.equal(pair?.relation, relation, `dihedral ${dihedral}`);
  }
});
