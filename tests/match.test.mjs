// The search bar's matching (src/editor/match.js). Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchScore, plain, ranked } from '../src/editor/match.js';

test('lower case, no diacritics', () => {
  assert.equal(plain('Židlička'), 'zidlicka');
  assert.equal(plain('Kekulé'), 'kekule');
  assert.equal(plain('Übergangszustand'), 'ubergangszustand');
});

test('the start of words, in any order; a part of a word only from three letters', () => {
  assert.equal(matchScore('ring flip', ['Ring flip']), 4);
  assert.equal(matchScore('ring', ['Ring flip']), 3);
  assert.equal(matchScore('flip', ['Ring flip']), 2);
  assert.equal(matchScore('flip ring', ['Ring flip']), 2, 'in any order');
  assert.equal(matchScore('fl ri', ['Ring flip']), 2, 'the starts of both');
  assert.equal(matchScore('lip', ['Ring flip']), 1, 'a part of a word');
  assert.equal(matchScore('ip', ['Ring flip']), 0, 'two letters inside a word: no');
  assert.equal(matchScore('flip x', ['Ring flip']), 0, 'every word must match');
  assert.equal(matchScore('', ['Ring flip']), 0);
  assert.equal(matchScore('zidlicka', ['Překlopení židličky', 'Ring flip']), 2, 'without the diacritics, inflected (židlička: židličky), in the other language');
  assert.equal(matchScore('sessel', ['Ringinversion des Sessels']), 2, 'German: Sessel, des Sessels');
  assert.equal(matchScore('zid', ['Překlopení židličky']), 2, 'a short start');
  assert.equal(matchScore('zidle', ['Překlopení židličky']), 2, 'a stem: židle and židlička share it');
  assert.equal(matchScore('ring flip', ['Překlopení židličky', 'Ring flip']), 4, 'in English in the Czech interface');
  assert.equal(matchScore('svg', ['SVG']), 4);
  assert.equal(matchScore('δ+', ['partial charge δ+']), 2);
});

test('ranked: the best first, then the shorter, then as they came; at most so many', () => {
  const items = ['Flip over a bond', 'Ring flip', 'Flip left–right', 'Flip top–bottom', 'Text'];
  assert.deepEqual(ranked('flip', items, (x) => [x]).map(({ item }) => item), ['Flip left–right', 'Flip top–bottom', 'Flip over a bond', 'Ring flip']);
  assert.deepEqual(ranked('flip', items, (x) => [x], 2).map(({ item }) => item), ['Flip left–right', 'Flip top–bottom']);
  assert.deepEqual(ranked('nothing', items, (x) => [x]), []);
});

test('other words for a thing: only from three letters, and never above its own name', async () => {
  const { scoreOf } = await import('../src/editor/match.js');
  assert.equal(scoreOf('fe', ['Report a problem'], ['bug', 'feedback']), 0, 'two letters: not by the other words');
  assert.equal(scoreOf('feed', ['Report a problem'], ['bug', 'feedback']), 2, 'from three: by them, as the start of a word');
  assert.equal(scoreOf('feedback', ['Report a problem'], ['feedback']), 2, 'even the whole word: no more than that');
  assert.equal(scoreOf('report', ['Report a problem'], ['feedback']), 3, 'its own name counts for more');
});
