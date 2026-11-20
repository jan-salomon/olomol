// The drawing inside its pictures: an SVG or PNG exported by olomol carries the drawing itself, so that
// olomol opens the picture again as the drawing (Ctrl+O, a drop), as ChemDraw's and Marvin's pictures do. Nothing
// of it is seen and nothing else is in it (no name, no date): in the SVG a <metadata> element, in the PNG a text
// chunk (tEXt, keyword olomol-ket), both the drawing in base64 (its .olom; KET in pictures from before 0.5.0, read too;
// the keyword kept as it was). A program that edits the picture may keep it or drop
// it; a picture copied to the clipboard loses it (the browser draws it anew).
// Also a PNG's resolution (pngWithResolution): how large it is on paper.
const KEYWORD = 'olomol-ket';
const NS = 'https://olomol.org/ket';

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const fromBase64 = (b64) => new TextDecoder().decode(bytesOf(b64));
export const bytesOf = (b64) => Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0));

// --- SVG ---

export function svgWithDrawing(svg, ket) {
  const head = svg.match(/<svg\b[^>]*>/);
  if (!head) return svg;
  const at = head.index + head[0].length;
  return `${svg.slice(0, at)}<metadata><olomol:ket xmlns:olomol="${NS}">${toBase64(ket)}</olomol:ket></metadata>${svg.slice(at)}`;
}

// The KET in an SVG, or null
export function drawingInSvg(svg) {
  const found = /<(?:[\w-]+:)?ket\b[^>]*xmlns(?::[\w-]+)?="https:\/\/olomol\.org\/ket"[^>]*>([A-Za-z0-9+/=\s]+)<\//.exec(svg);
  try {
    return found ? fromBase64(found[1]) : null;
  } catch {
    return null;
  }
}

// --- PNG ---

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const latin1 = (text) => Uint8Array.from(text, (c) => c.charCodeAt(0));

// A chunk of `type` with `data` (its length, type, data and CRC)
function chunkOf(type, data) {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(latin1(type), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}
// `png` with `chunk` put in at byte `at`
const inserted = (png, chunk, at) => {
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at));
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
};

// A PNG (bytes) with the drawing in a text chunk before its end (IEND)
export function pngWithDrawing(png, ket) {
  return inserted(png, chunkOf('tEXt', latin1(`${KEYWORD}\0${toBase64(ket)}`)), png.length - 12); // (IEND: the last chunk, 12 bytes)
}

// A PNG (bytes) that says its resolution, `dpi` (a pHYs chunk right after IHDR, as it must come before the image
// data), so that Word, PowerPoint and other programs place it at its size: olomol's PNGs are drawn at 4× the SVG's
// pixels, which are 1/96 inch, so 384 dpi puts a drawing in ACS's style at ACS's size. Without it they take 96 dpi:
// 4× too large. A pHYs already there is left as it is.
export function pngWithResolution(png, dpi) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let at = 8; at + 12 <= png.length;) {
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (type === 'pHYs') return png;
    if (type === 'IDAT' || type === 'IEND') break;
    at += 12 + view.getUint32(at);
  }
  const perMetre = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const fields = new DataView(data.buffer);
  fields.setUint32(0, perMetre);
  fields.setUint32(4, perMetre);
  data[8] = 1; // (the unit: the metre)
  return inserted(png, chunkOf('pHYs', data), 8 + 12 + view.getUint32(8)); // (after the signature and IHDR)
}

// The KET in a PNG (bytes), or null
export function drawingInPng(png) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const prefix = `${KEYWORD}\0`;
  for (let at = 8; at + 12 <= png.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (type === 'tEXt') {
      const data = png.subarray(at + 8, at + 8 + length);
      const text = String.fromCharCode(...data.subarray(0, prefix.length));
      if (text === prefix) {
        try {
          return fromBase64(new TextDecoder('latin1').decode(data.subarray(prefix.length))); // (base64: ASCII)
        } catch {
          return null;
        }
      }
    }
    if (type === 'IEND') break;
    at += 12 + length;
  }
  return null;
}
