// The drawing inside its pictures (src/io/embedded.js): put into an SVG and a PNG, read back the same; a picture
// without it gives none; the PNG still a PNG (its chunks whole, their checksums right). A PNG's resolution (pHYs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { bytesOf, drawingInPng, drawingInSvg, pngWithDrawing, pngWithResolution, svgWithDrawing } from '../src/io/embedded.js';

const KET = JSON.stringify({ root: { nodes: [] }, olomol: { text: 'δ+ H₂SO₄ ⇌ “quoted” ]]> <tag>' } });
const PNG = bytesOf('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');

test('SVG: the drawing in its metadata, read back the same; none in a plain one', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M0 0h1"/></svg>';
  const withIt = svgWithDrawing(svg, KET);
  assert.match(withIt, /^<svg [^>]*><metadata>/);
  assert.ok(withIt.endsWith('<path d="M0 0h1"/></svg>'));
  assert.equal(drawingInSvg(withIt), KET);
  assert.equal(drawingInSvg(svg), null);
});

test('PNG: the drawing in a text chunk before IEND, read back the same; the chunks whole; none in a plain one', () => {
  const withIt = pngWithDrawing(PNG, KET);
  assert.equal(drawingInPng(withIt), KET);
  assert.equal(drawingInPng(PNG), null);
  // walk the chunks: each length in bounds, the last IEND, the new tEXt's CRC as zlib computes it
  const view = new DataView(withIt.buffer);
  const types = [];
  for (let at = 8; at < withIt.length;) {
    const length = view.getUint32(at);
    types.push(String.fromCharCode(...withIt.subarray(at + 4, at + 8)));
    at += 12 + length;
    assert.ok(at <= withIt.length);
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'tEXt', 'IEND']);
  assert.deepEqual([...withIt.subarray(0, 8)], [...PNG.subarray(0, 8)]);
});

test('PNG: the CRC of the text chunk is right (as zlib.crc32 has it)', async () => {
  const { crc32 } = await import('node:zlib');
  const withIt = pngWithDrawing(PNG, KET);
  const view = new DataView(withIt.buffer);
  let at = 8;
  while (String.fromCharCode(...withIt.subarray(at + 4, at + 8)) !== 'tEXt') at += 12 + view.getUint32(at);
  const length = view.getUint32(at);
  assert.equal(view.getUint32(at + 8 + length), crc32(withIt.subarray(at + 4, at + 8 + length)));
});

test('PNG: its resolution in a pHYs chunk right after IHDR (384 dpi: 15118 per metre), its CRC right; not twice; the drawing after it', async () => {
  const { crc32 } = await import('node:zlib');
  const sized = pngWithResolution(PNG, 384);
  const chunks = (png) => {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const found = [];
    for (let at = 8; at < png.length;) {
      const length = view.getUint32(at);
      found.push({ type: String.fromCharCode(...png.subarray(at + 4, at + 8)), data: png.subarray(at + 8, at + 8 + length), crc: view.getUint32(at + 8 + length), whole: png.subarray(at + 4, at + 8 + length) });
      at += 12 + length;
      assert.ok(at <= png.length);
    }
    return found;
  };
  assert.deepEqual(chunks(sized).map((c) => c.type), ['IHDR', 'pHYs', 'IDAT', 'IEND']);
  const phys = chunks(sized)[1];
  const view = new DataView(phys.data.buffer, phys.data.byteOffset, 9);
  assert.deepEqual([view.getUint32(0), view.getUint32(4), phys.data[8]], [15118, 15118, 1]);
  assert.equal(phys.crc, crc32(phys.whole));
  assert.deepEqual(pngWithResolution(sized, 600), sized);
  const both = pngWithDrawing(sized, KET);
  assert.deepEqual(chunks(both).map((c) => c.type), ['IHDR', 'pHYs', 'IDAT', 'tEXt', 'IEND']);
  assert.equal(drawingInPng(both), KET);
});
