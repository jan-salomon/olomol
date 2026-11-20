// The order of the tabs (src/editor/tabOrder.js): which one comes forward after closing one, the order they come
// back in, stepping round, moving one. The browser check (13-tabs) does the rest with the app. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { afterClosing, moved, restoredOrder, stepFrom } from '../src/editor/tabOrder.js';

test('closing a tab: the one to its right comes forward, else the one to its left', () => {
  assert.equal(afterClosing(['a', 'b', 'c'], 'b'), 'c');
  assert.equal(afterClosing(['a', 'b', 'c'], 'c'), 'b');
  assert.equal(afterClosing(['a', 'b', 'c'], 'a'), 'b');
  assert.equal(afterClosing(['a'], 'a'), null, 'the last one: none (a new drawing then)');
  assert.equal(afterClosing(['a', 'b'], 'x'), null, 'one not open');
});

test('the order they come back in: the session\'s, then the others kept, oldest first', () => {
  const kept = [{ id: 'a', keptAt: 3 }, { id: 'b', keptAt: 1 }, { id: 'c', keptAt: 2 }, { id: 'd', keptAt: 0 }];
  assert.deepEqual(restoredOrder(['c', 'a'], kept), ['c', 'a', 'd', 'b']);
  assert.deepEqual(restoredOrder(null, kept), ['d', 'b', 'c', 'a'], 'no session: by when they were kept');
  assert.deepEqual(restoredOrder(['x', 'a', 'a', 'b'], kept), ['a', 'b', 'd', 'c'], 'one no longer kept left out, none twice');
  assert.deepEqual(restoredOrder(['a'], []), [], 'nothing kept: nothing');
  assert.deepEqual(restoredOrder(['b'], [{ id: 'a' }, { id: 'b' }]), ['b', 'a'], 'kept without a time: still there');
});

test('a step to the next tab or the one before goes round the ends', () => {
  assert.equal(stepFrom(['a', 'b', 'c'], 'a', 1), 'b');
  assert.equal(stepFrom(['a', 'b', 'c'], 'c', 1), 'a');
  assert.equal(stepFrom(['a', 'b', 'c'], 'a', -1), 'c');
  assert.equal(stepFrom(['a'], 'a', 1), 'a');
  assert.equal(stepFrom(['a', 'b'], 'x', 1), null);
});

test('a tab moved', () => {
  assert.deepEqual(moved(['a', 'b', 'c'], 'a', 2), ['b', 'c', 'a']);
  assert.deepEqual(moved(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
  assert.deepEqual(moved(['a', 'b', 'c'], 'b', 9), ['a', 'c', 'b'], 'past the end: last');
  assert.deepEqual(moved(['a', 'b', 'c'], 'b', -3), ['b', 'a', 'c'], 'before the start: first');
});
