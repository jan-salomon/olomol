// The page the browser prints (Export → PDF / Print…): the drawing alone, at the top in the middle, its colours
// kept. Drawn at ACS 1996 size (bonds 14.4 pt, as journals and textbooks print them; the caller gives it so) and
// smaller only if it doesn't fit the paper; landscape only for a drawing too wide for the page upright but
// wider than tall (the paper's size is the print window's: A4 or Letter, upright 186 mm wide inside the margins at
// the narrower, Letter's 216 mm less 2 × 15 mm). No margin of the page's own, so the browser has no room for its header and footer (date, address,
// page number): the 15 mm margin is inside. Nothing of olomol's on it: the PDF is the drawing. The title is the
// name the PDF is offered under.
const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// the size an SVG says it is (its own width and height), or null
export function svgSize(svg) {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const [width, height] = ['width', 'height'].map((name) => Number(new RegExp(`\\s${name}="([\\d.]+)`).exec(tag)?.[1]));
  return width > 0 && height > 0 ? { width, height } : null;
}

const UPRIGHT_WIDTH = (186 / 25.4) * 96; // px (CSS px: 96 an inch)

// Landscape: wider than the page upright, and wider than tall (a drawing that fits upright stays upright)
export const landscapeFor = (size) => Boolean(size) && size.width > UPRIGHT_WIDTH && size.width > size.height;

export function printPage(svg, title) {
  const landscape = landscapeFor(svgSize(svg));
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
  @page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 0; }
  html, body { margin: 0; background: #fff; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { box-sizing: border-box; height: 100vh; padding: 15mm; display: flex; justify-content: center; align-items: flex-start; }
  body > svg { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; }
</style></head>
<body>${svg}</body></html>
`;
}
