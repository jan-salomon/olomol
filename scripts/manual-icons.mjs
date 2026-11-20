// The buttons' icons for the Czech manual (docs/img/ikony/*.svg), drawn
// from src/ui/icons.jsx through Vite (it reads the JSX) and React's static
// markup, so the manual shows the very symbols of the app.
//   node scripts/manual-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const OUT = 'docs/img/ikony';
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { icons } = await server.ssrLoadModule('/src/ui/icons.jsx');
  const ink = '#1c1f26';
  for (const [name, icon] of Object.entries(icons)) {
    // (the colour written out: not every SVG reader knows currentColor)
    const markup = renderToStaticMarkup(icon).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replaceAll('currentColor', ink);
    writeFileSync(`${OUT}/${name}.svg`, markup);
  }
  // the paint tool (a black swatch) and the highlighter (on yellow), as on the rail
  writeFileSync(`${OUT}/barva.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="8" fill="${ink}"/></svg>`);
  const marker = renderToStaticMarkup(icons.highlighter).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  writeFileSync(`${OUT}/zvyraznovac.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="6" fill="#fff09a"/><g transform="translate(2.4 2.4) scale(0.8)" fill="none" stroke="${ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${marker.replaceAll('currentColor', ink)}</g></svg>`);
  // the help button: a question mark on the selected tool's gradient
  writeFileSync(`${OUT}/napoveda.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1035a9"/><stop offset="1" stop-color="#2e6fdb"/></linearGradient></defs><circle cx="12" cy="12" r="11" fill="url(#g)"/><text x="12" y="16.6" text-anchor="middle" font-family="Noto Sans, Arial, sans-serif" font-weight="700" font-size="14" fill="#fff">?</text></svg>`);
  console.log(`${Object.keys(icons).length + 3} icons in ${OUT}/`);
} finally {
  await server.close();
}
