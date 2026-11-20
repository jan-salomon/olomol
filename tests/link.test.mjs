// Structures in a link, as a person or a chatbot writes them (src/io/link.js): the keys read from the #fragment
// and the ?query, in order; SMILES's own characters kept whether percent-encoded or not (#, +, %10 ring closures,
// \\ and /), + a space only in a name; the n-th title the n-th drawing; the address without them afterwards.
import assert from 'node:assert/strict';
import test from 'node:test';
import { linkValue, olomolLink, structuresIn, withoutStructures } from '../src/io/link.js';

test('SMILES characters survive, encoded or raw', () => {
  assert.equal(linkValue('C%23N'), 'C#N');
  assert.equal(linkValue('[NH4+]'), '[NH4+]', '+ is a charge, not a space');
  assert.equal(linkValue('%5BNH4%2B%5D'), '[NH4+]');
  assert.equal(linkValue('C%12CCCCC%12'), 'C%12CCCCC%12', 'a ring closure %12 is no escape (a control character)');
  assert.equal(linkValue('C%2512CC%2512'), 'C%12CC%12', 'an encoded % is a %');
  assert.equal(linkValue('F/C=C/F'), 'F/C=C/F');
  assert.equal(linkValue('F%5CC=C%2FF'), 'F\\C=C/F');
  assert.equal(linkValue('acetic+acid', { plusIsSpace: true }), 'acetic acid');
  assert.equal(linkValue('kyselina%20octov%C3%A1', { plusIsSpace: true }), 'kyselina octová');
});

test('the structures of a link: fragment and query, in order, titles with them', () => {
  assert.deepEqual(structuresIn('https://olomol.org/#smiles=CC(=O)O'), [{ kind: 'smiles', value: 'CC(=O)O', title: null }]);
  assert.deepEqual(structuresIn('https://olomol.org/?name=aspirin&lang=cs'), [{ kind: 'name', value: 'aspirin', title: null }]);
  assert.deepEqual(structuresIn('https://olomol.org/#smiles=C#N'), [{ kind: 'smiles', value: 'C#N', title: null }], 'a raw # inside the fragment stays');
  const pair = [{ kind: 'smiles', value: 'CCO', title: 'Exercise 1' }, { kind: 'smiles', value: 'CC=O', title: 'Solution' }];
  assert.deepEqual(structuresIn('https://olomol.org/#title=Exercise+1&smiles=CCO&title=Solution&smiles=CC%3DO'), pair, 'titles before their structures');
  assert.deepEqual(structuresIn('https://olomol.org/#smiles=CCO&title=Exercise%201&smiles=CC=O&title=Solution'), pair, 'or after them');
  assert.deepEqual(structuresIn('https://olomol.org/#smiles=CCO&smiles=CC=O&title=Only'), [{ kind: 'smiles', value: 'CCO', title: 'Only' }, { kind: 'smiles', value: 'CC=O', title: null }], 'the n-th title the n-th drawing');
  assert.deepEqual(structuresIn('https://olomol.org/#smiles=CC(=O)O.OCC%3E%3ECC(=O)OCC.O'), [{ kind: 'smiles', value: 'CC(=O)O.OCC>>CC(=O)OCC.O', title: null }]);
  assert.deepEqual(structuresIn('https://olomol.org/#d=abc'), [], 'a drawing link (#d=) is no structure');
  assert.deepEqual(structuresIn('https://olomol.org/?lang=de'), []);
  assert.deepEqual(structuresIn('https://olomol.org/#SMILES=CCO&cid=2244&inchi=InChI%3D1S%2FCH4%2Fh1H4'),
    [{ kind: 'smiles', value: 'CCO', title: null }, { kind: 'cid', value: '2244', title: null }, { kind: 'inchi', value: 'InChI=1S/CH4/h1H4', title: null }]);
});

test('the address afterwards: the structures gone, the rest kept', () => {
  assert.equal(withoutStructures('https://olomol.org/?lang=cs&smiles=CCO#title=x'), 'https://olomol.org/?lang=cs');
  assert.equal(withoutStructures('https://olomol.org/#smiles=CCO'), 'https://olomol.org/');
});

test('an olomol link pasted (search bar, canvas): the whole address or only its #part; nothing else is one', () => {
  assert.equal(olomolLink('#smiles=CCO', 'https://olomol.org/'), 'https://olomol.org/#smiles=CCO');
  assert.equal(olomolLink(' https://olomol.org/#smiles=C#N&title=x ', 'https://olomol.org/'), 'https://olomol.org/#smiles=C#N&title=x');
  assert.equal(olomolLink('http://localhost:5180/?smiles=CCO', 'https://olomol.org/'), 'http://localhost:5180/?smiles=CCO');
  assert.ok(olomolLink('https://olomol.org/#d=abc', 'https://olomol.org/'));
  for (const text of ['C#N', 'CCO', '#', '#hello', 'https://olomol.org/', 'https://example.org/page', 'aspirin']) assert.equal(olomolLink(text, 'https://olomol.org/'), null, text);
  assert.equal(structuresIn(olomolLink('#smiles=CCO&title=Exercise 1', 'https://olomol.org/'))[0].title, 'Exercise 1', 'a title typed with spaces');
});

test('another site\'s address with name= or cid= is no olomol link (its words would go to PubChem)', () => {
  const base = 'https://olomol.org/';
  for (const text of ['https://example.org/page?name=report', 'https://pubchem.ncbi.nlm.nih.gov/summary/summary.cgi?cid=2244', 'https://example.org/#smiles=CCO&name=report'])
    assert.equal(olomolLink(text, base), null, text);
  // olomol's own addresses, this page's, and a copy elsewhere with SMILES or InChI only: links
  assert.ok(olomolLink('https://olomol.org/#name=caffeine', 'http://localhost:5173/'));
  assert.ok(olomolLink('https://www.olomol.org/?cid=2244', base));
  assert.ok(olomolLink('http://localhost:5173/#name=caffeine', 'http://localhost:5173/'), 'this page\'s own address');
  assert.ok(olomolLink('https://school.example/olomol/#smiles=CCO&title=Ethanol', base), 'a copy elsewhere, SMILES');
  assert.ok(olomolLink('https://school.example/olomol/?inchi=InChI=1S/CH4/h1H4', base), 'a copy elsewhere, InChI');
  assert.ok(olomolLink('https://school.example/olomol/#d=abc', base), 'a copy elsewhere, a drawing');
  assert.ok(olomolLink('#name=caffeine', base), 'only the #part: this page\'s');
});
