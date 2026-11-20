// Translations: every text the code passes to t('…') (and every template
// name and subgroup) has an entry in each language, no entry is left over, and each
// entry keeps the {names} of its English text. A text without a word in
// it (CID, Ctrl+A, NaBH4) may stay English.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SUBGROUPS, TEMPLATES } from '../src/chem/templates.js';
import cs from '../src/i18n/cs.js';
import de from '../src/i18n/de.js';
import en from '../src/i18n/en.js';

const LITERAL = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;

function sourceTexts() {
  const files = readdirSync('src', { recursive: true }).filter((f) => /\.jsx?$/.test(f) && !f.startsWith('i18n'));
  const texts = new Set();
  for (const file of files) {
    for (const m of readFileSync(join('src', file), 'utf8').matchAll(LITERAL)) texts.add((m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1'));
  }
  for (const [group, entries] of TEMPLATES) {
    texts.add(group);
    for (const [name] of entries) texts.add(name);
  }
  for (const groups of Object.values(SUBGROUPS)) for (const [name] of groups) texts.add(name);
  return texts;
}

const texts = sourceTexts();
const needed = [...texts].filter((text) => /[a-z]{3}/.test(text.replace(/\{\w+\}/g, '')));
const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
// the plural forms a language uses for whole numbers
const forms = (code) => [...new Set(Array.from({ length: 200 }, (_, n) => new Intl.PluralRules(code).select(n)))].sort().join();

for (const [code, table] of Object.entries({ cs, de })) {
  test(`${code}: every text is translated`, () => {
    const missing = needed.filter((text) => !(text in table));
    assert.deepEqual(missing, [], `missing in ${code}.js`);
  });
  test(`${code}: no entries the code no longer has`, () => {
    assert.deepEqual(Object.keys(table).filter((text) => !texts.has(text)), [], `left over in ${code}.js`);
  });
  test(`${code}: translations keep the {names} and the plural forms`, () => {
    for (const [text, value] of Object.entries(table)) {
      const variants = typeof value === 'string' ? [value] : Object.values(value);
      for (const v of variants) assert.equal(names(v), names(text), `${code}: ${JSON.stringify(v)} for ${JSON.stringify(text)}`);
      if (typeof value !== 'string') assert.equal(Object.keys(value).sort().join(), forms(code), `${code}: plural forms of ${JSON.stringify(text)}`);
    }
  });
}

test('en: plural forms only for texts the code has', () => {
  assert.deepEqual(Object.keys(en).filter((text) => !texts.has(text)), []);
  for (const value of Object.values(en)) assert.equal(Object.keys(value).sort().join(), forms('en'));
});
