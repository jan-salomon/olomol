// The recent files and a drawing's earlier versions (src/io/history.js). Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECENT_MOST, VERSIONS, withRecent, withVersion } from '../src/io/history.js';

test('recent files: the newest first, each file once, at most ten', () => {
  const entry = (name, at) => ({ name, handle: null, ket: name, at });
  let list = [];
  list = withRecent(list, entry('a.olom', 1), []);
  list = withRecent(list, entry('b.olom', 2), list.map(() => false));
  assert.deepEqual(list.map((e) => e.name), ['b.olom', 'a.olom']);
  list = withRecent(list, entry('a.olom', 3), list.map((e) => e.name === 'a.olom'));
  assert.deepEqual(list.map((e) => [e.name, e.at]), [['a.olom', 3], ['b.olom', 2]], 'opened again: to the top, once');
  list = withRecent(list, entry('a.olom', 4), [false, false]); // (another a.olom, in another folder: both)
  assert.deepEqual(list.map((e) => e.name), ['a.olom', 'a.olom', 'b.olom'], 'two files of one name in two folders: both');
  for (let i = 0; i < 15; i++) list = withRecent(list, entry(`${i}.ket`, 10 + i), list.map(() => false));
  assert.equal(list.length, RECENT_MOST);
  assert.equal(list[0].name, '14.ket');
});

test('earlier versions: each at least the gap after the one before, but the latest (the drawing as last kept)', () => {
  const opts = { gap: 100, most: 4 };
  let list = [];
  const keep = (at, ket) => {
    list = withVersion(list, { at, ket }, opts);
    return list.map((v) => `${v.at}:${v.ket}`).join(' ');
  };
  assert.equal(keep(0, 'a'), '0:a');
  assert.equal(keep(10, 'b'), '0:a 10:b', 'the latest at once');
  assert.equal(keep(20, 'c'), '0:a 20:c', '10 after 0: provisional, replaced');
  assert.equal(keep(30, 'c'), '0:a 20:c', 'unchanged: no new version');
  assert.equal(keep(150, 'd'), '0:a 150:d', '20 was still within the gap of 0: replaced');
  assert.equal(keep(160, 'e'), '0:a 150:d 160:e', '150 is past the gap of 0: it stays');
  assert.equal(keep(300, 'f'), '0:a 150:d 300:f', '160 within the gap of 150: replaced');
  assert.equal(keep(500, 'g'), '0:a 150:d 300:f 500:g');
  assert.equal(keep(700, 'h'), '150:d 300:f 500:g 700:h', 'beyond the most: the oldest goes');
  for (let i = 1; i < list.length - 1; i++) assert.ok(list[i].at - list[i - 1].at >= opts.gap, `${list[i - 1].at} → ${list[i].at}: the gap`);
  assert.ok(VERSIONS.gap >= 60_000 && VERSIONS.most >= 10, 'the real gap and number');
});

test('the print page: the drawing alone, no room for the browser\'s header and footer, turned to fit, its name as the title', async () => {
  const { printPage, svgSize } = await import('../src/io/print.js');
  const wide = '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="500" viewBox="0 0 1100 500"><path d="M0 0L10 10"/></svg>';
  const small = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><path d="M0 0L10 10"/></svg>';
  const tall = '<svg xmlns="http://www.w3.org/2000/svg" width="120.5" height="200"><path d="M0 0L10 10"/></svg>';
  assert.deepEqual(svgSize(wide), { width: 1100, height: 500 });
  assert.deepEqual(svgSize(tall), { width: 120.5, height: 200 });
  assert.equal(svgSize('<svg viewBox="0 0 1 1"></svg>'), null);
  const page = printPage(wide, 'aspirin & <b>salicylic acid</b>');
  assert.ok(page.includes(wide), 'the drawing as it is');
  assert.ok(page.includes('<title>aspirin &amp; &lt;b&gt;salicylic acid&lt;/b&gt;</title>'), 'the name, escaped');
  assert.ok(/@page \{ size: landscape; margin: 0; \}/.test(page), 'wide: landscape; no page margin, so no header or footer');
  assert.ok(/@page \{ size: portrait; margin: 0; \}/.test(printPage(tall, 'x')), 'tall: portrait');
  assert.ok(/@page \{ size: portrait; margin: 0; \}/.test(printPage(small, 'x')), 'small and wide (it fits upright): portrait');
  assert.ok(/@page \{ size: portrait; margin: 0; \}/.test(printPage('<svg width="1100" height="1400"></svg>', 'x')), 'too wide upright but taller than wide: portrait (shrunk)');
  assert.ok(/padding: 15mm/.test(page) && /print-color-adjust: exact/.test(page) && /max-width: 100%/.test(page) && /max-height: 100%/.test(page), 'the margin inside, colours kept, no bigger than the paper');
  assert.equal((page.match(/<svg/g) ?? []).length, 1, 'only the drawing');
  assert.ok(!/olomol/i.test(page.replace(wide, '')), 'nothing of olomol\'s on it');
});
