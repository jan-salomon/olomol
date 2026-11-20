// What's new's release bands: thin pictures (1200 × 200, 1 : 6) under each main release's heading, of what it
// brought, made of olomol's own drawings (parts of Help's examples, a template's stick model) exported as SVG at
// one bond length, side by side. No words in them (they serve every language): an example's texts are left out
// unless they are formulas or numbers; the version is the heading's. A release about the interface rather than
// drawing (0.5.0, files) has small pictures of the interface instead (ui below): drawn here in the app's look, with
// its own icons and molecules drawn by olomol, file names but no words.
//   node banners.mjs public/changelog [0.5.0 …]   banner-0.1.0.svg … banner-0.5.0.svg, or only the versions named
//                                                 (OLOMOL_URL: a dev server)
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const APP = process.env.OLOMOL_URL ?? 'http://localhost:5179/';
const [out, ...only] = process.argv.slice(2);
const [W, H] = [1200, 200];
const PAD = 36; // before the first picture and after the last
const GAP = 40; // between the pictures

// [example, box in drawing units [x1, y1, x2, y2] or null for all of it]; { sticks: template } for a stick model
const RELEASES = {
  '0.1.0': [['carbonate', null], ['sugars', null], ['hbonds', null]],
  '0.2.0': [['aspirin', null], ['retrosynthesis', [-1, -3, 16, 2.5]]],
  '0.3.0': [['cobalt', [-1, -3, 4.6, 3]], ['enzyme', null], ['sn2', null]],
  '0.4.0': [['conformations', [9.5, -2, 24, 2]], ['orbitals', [-2, -1.5, 1.8, 4.5]], ['radical', [-0.5, 2, 5.5, 4.5]], { sticks: 'β-D-Glucose, chair' }],
  '0.5.0': [{ ui: 'tabs' }, { ui: 'styles' }, { ui: 'show' }, { ui: 'search' }],
};
const WORDLESS = /^[\d\s.,°+−\-–]*$|[_^]\{|^hν$|^(NADH|NAD|LDH|Et|Ph)/; // texts kept: numbers, formulas

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${APP}?test&lang=en`);
await page.waitForFunction(() => window.olomolTest);

const part = (name, box) => page.evaluate(async ([name, box, wordless]) => {
  const { readOlom } = await import('/src/io/olom.js');
  const { svgOf } = await import('/src/io/files.js');
  const { doc } = readOlom(await (await fetch(`/src/ui/examples/${name}.olom`)).text());
  const inside = (x, y) => !box || (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]);
  const atoms = new Set([...doc.atoms.values()].filter((a) => inside(a.x, a.y)).map((a) => a.id));
  const bonds = new Set([...doc.bonds.values()].filter((b) => atoms.has(b.a) && atoms.has(b.b)).map((b) => b.id));
  const kept = new Set([...atoms, ...bonds]);
  for (const a of doc.arrows.values()) if (inside((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2)) kept.add(a.id);
  for (const p of doc.pluses.values()) if (inside(p.x, p.y)) kept.add(p.id);
  for (const b of doc.brackets.values()) if (inside(b.x1, b.y1) && inside(b.x2, b.y2)) kept.add(b.id);
  for (const o of doc.orbitals?.values() ?? []) if (atoms.has(o.atom)) kept.add(o.id);
  // a curved arrow when what it starts and ends on is kept
  const on = (end) => end.atom ?? end.bond ?? end.orbital ?? end.electron ?? null;
  for (const c of doc.curves.values()) {
    const ends = [on(c.from), on(c.to)];
    if (ends.every((id) => id == null || kept.has(id) || doc.orbitals?.get(id) && atoms.has(doc.orbitals.get(id).atom))) kept.add(c.id);
  }
  for (const t of doc.texts.values()) {
    const at = t.arrow != null ? kept.has(t.arrow) : t.anchor != null ? atoms.has(t.anchor) : inside(t.x, t.y);
    if (at && new RegExp(wordless).test(t.text)) kept.add(t.id);
  }
  return svgOf(doc, olomol.settings, { ids: [...kept], scale: 40 });
}, [name, box, WORDLESS.source]);

// a template's stick model, as Turn in 3D draws it, turned a little so that the chair shows
const sticks = async (template) => {
  await page.evaluate(async (template) => {
    const { CHAIRS } = await import('/src/chem/chair.js');
    const doc = CHAIRS.find(([n]) => n === template)[1]();
    // (the demo's colours: the anomeric OH blue, the ring O purple)
    const ring = [...doc.atoms.values()].find((a) => a.el === 'O' && [...doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length === 2);
    if (ring) ring.highlight = '#d9bdff';
    olomol.setDoc(doc);
  }, template);
  await page.keyboard.press('Control+a');
  await page.getByTestId('turn3d').click();
  await page.getByTestId('turn3d-stage').waitFor({ timeout: 90_000 });
  await page.waitForTimeout(800);
  const svg = await page.evaluate(async () => {
    const { stickPicture } = await import('/src/render/sticks.js');
    const el = document.querySelector('[data-testid=turn3d-stage]');
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber'));
    let live;
    for (let f = el[k]; f && !live; f = f.return)
      for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) { const v = h.memoizedState; if (v?.current?.base && v.current?.molecule) { live = v.current; break; } }
    const [c, s] = [Math.cos(-0.9), Math.sin(-0.9)]; // 52° about the page's horizontal: the chair from a little above
    const R = [[1, 0, 0], [0, c, -s], [0, s, c]];
    const points = live.sticks.base.map((p) => R.map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2]));
    return stickPicture({ ...live.sticks, points }, 40, { collapsed: false });
  });
  await page.keyboard.press('Escape');
  return svg;
};

// --- the interface's pictures (ui) ---
const FONT = `font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"`;
const [ACCENT, SOFT, TEXT, MUTED, EDGE] = ['#1035a9', '#e7ebf6', '#1c1f26', '#687082', '#dfe4ef'];
const SHADOW = '<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#19203c" flood-opacity="0.12"/></filter>';
// a molecule from its SMILES, drawn by olomol as Export draws it
const molecule = (smiles) => page.evaluate(async (smiles) => {
  const { smilesToMolfile } = await import('/src/io/rdkit.js');
  const { readMolfile } = await import('/src/io/molfile.js');
  const { svgOf } = await import('/src/io/files.js');
  return svgOf(readMolfile(await smilesToMolfile(smiles)).doc, olomol.settings, { scale: 40 });
}, smiles);
// one of the app's icons (an SVG in a button), at x, y, size, in a colour
const icon = async (selector, x, y, size, color) => {
  const svg = await page.evaluate((selector) => document.querySelector(selector)?.querySelector('svg')?.outerHTML, selector);
  if (!svg) throw new Error(`no icon in ${selector}`);
  return `<g color="${color}">${svg.replace(/<svg\b[^>]*?(\sviewBox="[^"]*")[^>]*>/, `<svg x="${x}" y="${y}" width="${size}" height="${size}"$1 fill="none" stroke="currentColor">`)}</g>`;
};
// a picture fitted into a box, in its middle (k: its own key for parse)
const fit = (svg, k, x, y, w, h) => {
  const p = parse(svg, k);
  const s = Math.min(w / p.vw, h / p.vh);
  return `<svg x="${(x + (w - p.vw * s) / 2).toFixed(1)}" y="${(y + (h - p.vh * s) / 2).toFixed(1)}" width="${(p.vw * s).toFixed(1)}" height="${(p.vh * s).toFixed(1)}" viewBox="${p.vx} ${p.vy} ${p.vw} ${p.vh}">${p.inner}</svg>`;
};
const picture = (w, h, inside) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${SHADOW}</defs>${inside}</svg>`;
const card = (x, y, w, h, r = 12) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fff" stroke="${EDGE}" filter="url(#shadow)"/>`;
const cross = (x, y, color) => `<path d="M${x - 3.5} ${y - 3.5}l7 7m0 -7l-7 7" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`;
// an example's molecules (no texts) drawn in a style ({ style: 'rsc' | 'acs' | 'slides' } or { style: 'custom',
// customStyle }, render/style.js) at that style's true size (`bond` in pt), as Export draws it, turned by `turn`
// (radians). The style put in place by the editor (the app's own render/style.js: one imported from here may be
// another copy of it, once the dev server has reloaded it), the app's own style back after.
const styled = (name, style, bond, turn = 0) => page.evaluate(async ([name, style, bond, turn]) => {
  const { readOlom } = await import('/src/io/olom.js');
  const { svgOf } = await import('/src/io/files.js');
  const { doc } = readOlom(await (await fetch(`/src/ui/examples/${name}.olom`)).text());
  const [c, n] = [Math.cos(turn), Math.sin(turn)];
  for (const a of doc.atoms.values()) [a.x, a.y] = [a.x * c - a.y * n, a.x * n + a.y * c];
  const own = olomol.doc.style;
  olomol.doc.style = style;
  olomol.styleKey = null;
  olomol.applyDrawingStyle();
  try {
    return svgOf(doc, olomol.settings, { ids: [...doc.atoms.keys(), ...doc.bonds.keys()], scale: (bond * 4) / 3 });
  } finally {
    olomol.doc.style = own;
    olomol.styleKey = null;
    olomol.applyDrawingStyle();
  }
}, [name, style, bond, turn]);
// a picture placed at its own size (k: its own key for parse), its bottom at `bottom`
const at = (svg, k, x, bottom, s = 1) => {
  const p = parse(svg, k);
  return { svg: `<svg x="${x.toFixed(1)}" y="${(bottom - p.vh * s).toFixed(1)}" width="${(p.vw * s).toFixed(1)}" height="${(p.vh * s).toFixed(1)}" viewBox="${p.vx} ${p.vy} ${p.vw} ${p.vh}">${p.inner}</svg>`, w: p.vw * s };
};
const UI = {
  // several drawings in tabs, the one in front with changes not saved yet (its dot)
  async tabs() {
    const [w, h] = [390, 166];
    const names = ['aspirin.olom', 'caffeine.mol', 'esters.cdxml'];
    // (each name's width in the app's font, as this browser measures it)
    const widths = await page.evaluate((names) => names.map((name, i) => {
      const c = document.createElement('canvas').getContext('2d');
      c.font = `${i === 0 ? 600 : 400} 13px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
      return c.measureText(name).width;
    }), names);
    let x = 10;
    const tabs = names.map((name, i) => {
      const width = widths[i] + (i === 0 ? 44 : 32);
      const at = x;
      x += width + 2;
      return `${i === 0 ? `<rect x="${at}" y="12" width="${width}" height="28" rx="7" fill="${SOFT}"/>` : ''}
<text x="${at + 10}" y="30.5" font-size="13" ${i === 0 ? `font-weight="600" fill="${TEXT}"` : `fill="${MUTED}"`}>${name}</text>
${i === 0 ? `<circle cx="${at + width - 25}" cy="26" r="3.5" fill="${ACCENT}"/>` : ''}${cross(at + width - 11, 26, MUTED)}`;
    }).join('\n');
    return picture(w, h, `${card(0.5, 0.5, w - 1, h - 1)}<g ${FONT}>${tabs}
<text x="${x + 6}" y="31.5" font-size="18" fill="${TEXT}">+</text></g>
<path d="M1 48.5H${w - 1}" stroke="${EDGE}"/>
${fit(await molecule('CC(=O)Oc1ccccc1C(=O)O'), 'a', 20, 56, w - 40, h - 66)}`);
  },
  // drawing styles: one molecule (the style example's: its new C–O bond and its O bold) in RSC's, ACS's and a
  // style of one's own in Serif with heavier lines, each at its true size, side by side on a page
  async styles() {
    const h = 166;
    const UP = -Math.PI / 2; // (standing: the ester up)
    const looks = [
      await styled('style', { style: 'rsc' }, 12.2, UP),
      await styled('style', { style: 'acs' }, 14.4, UP),
      await styled('style', { style: 'custom', customStyle: { bond: 20, line: 1.5, bold: 4.5, hash: 3, margin: 2, label: 14, family: 'serif' } }, 20, UP),
    ].map((svg, i) => ({ svg, ...parse(svg, `y${i}`) }));
    // (all three by one factor, the largest filling the page: their sizes as they are to each other)
    const s = (h - 44) / Math.max(...looks.map((p) => p.vh));
    let x = 18;
    const placed = looks.map(({ svg }, i) => {
      const one = at(svg, `y${i}`, x, h - 24, s);
      x += one.w + 14;
      return one.svg;
    });
    const w = x - 14 + 18; // (the page as wide as they are)
    return picture(w, h, `${card(0.5, 0.5, w - 1, h - 1)}${placed.join('')}
<path d="M14 ${h - 15}H${w - 14}" stroke="${EDGE}"/>`);
  },
  // Show: the drawing alone on a projector's screen (the exercise), its small bar to step to the next one
  async show() {
    const [w, h] = [270, 166];
    const bar = `<rect x="${w / 2 - 44}" y="${h - 36}" width="88" height="24" rx="12" fill="${TEXT}" opacity="0.85"/>
<path d="M${w / 2 - 28} ${h - 29}l-5 5l5 5M${w / 2 + 28} ${h - 29}l5 5l-5 5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="${w / 2}" y="${h - 19.5}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#fff" ${FONT}>1 / 2</text>`;
    return picture(w, h, `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="6" fill="#fff" stroke="${TEXT}" stroke-width="4" filter="url(#shadow)"/>
${fit(await part('exercise', null), 'x', 18, 14, w - 36, h - 58)}
${bar}`);
  },
  // the search bar with a part typed (?C=O) and the templates with it above
  async search() {
    const [w, h] = [290, 166];
    const found = await Promise.all(['CC(=O)OC', 'CC(N)=O', 'CC(=O)O'].map(molecule));
    const cells = found.map((svg, i) => `${i === 0 ? `<rect x="${10 + i * 90}" y="12" width="88" height="80" rx="8" fill="${SOFT}"/>` : ''}${fit(svg, `s${i}`, 18 + i * 90, 20, 72, 64)}`).join('');
    return picture(w, h, `${card(0.5, 0.5, w - 1, 104, 10)}${cells}
<rect x="0.5" y="${h - 44}" width="${w - 1}" height="40" rx="10" fill="#fff" stroke="${ACCENT}" stroke-width="1.6" filter="url(#shadow)"/>
${await icon('[data-testid=from-name]', 12, h - 34, 20, MUTED)}
<text x="42" y="${h - 18.5}" font-size="16" fill="${TEXT}" ${FONT}>?C=O</text>
<rect x="84" y="${h - 35}" width="1.6" height="22" fill="${ACCENT}"/>
${cross(w - 20, h - 24, ACCENT)}`);
  },
};

// an SVG's size and inside, its ids made its own
const parse = (svg, k) => {
  const head = svg.match(/<svg\b[^>]*>/)[0];
  const attr = (n) => head.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1];
  const [vx, vy, vw, vh] = (attr('viewBox') ?? `0 0 ${attr('width')} ${attr('height')}`).split(/[\s,]+/).map(Number);
  const inner = svg.slice(svg.indexOf(head) + head.length, svg.lastIndexOf('</svg>'))
    .replace(/\bid="([^"]+)"/g, `id="p${k}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#p${k}-$1)`).replace(/href="#([^"]+)"/g, `href="#p${k}-$1"`);
  return { vx, vy, vw, vh, inner };
};

for (const [version, items] of Object.entries(RELEASES)) {
  if (only.length && !only.includes(version)) continue;
  const pictures = [];
  for (const [k, item] of items.entries()) pictures.push(parse(item.ui ? await UI[item.ui]() : item.sticks ? await sticks(item.sticks) : await part(...item), k));
  // one scale for all: the tallest fits, and so does the row
  const room = W - 2 * PAD;
  const k = Math.min(1, (H - 34) / Math.max(...pictures.map((p) => p.vh)), (room - GAP * (pictures.length - 1)) / pictures.reduce((s, p) => s + p.vw, 0));
  const width = pictures.reduce((s, p) => s + p.vw * k, 0) + GAP * (pictures.length - 1);
  let x = PAD + (room - width) / 2;
  const placed = pictures.map((p) => {
    const at = `<svg x="${x.toFixed(1)}" y="${((H - p.vh * k) / 2).toFixed(1)}" width="${(p.vw * k).toFixed(1)}" height="${(p.vh * k).toFixed(1)}" viewBox="${p.vx} ${p.vy} ${p.vw} ${p.vh}">${p.inner}</svg>`;
    x += p.vw * k + GAP;
    return at;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#eef2fc"/><stop offset="0.5" stop-color="#fafbfe"/><stop offset="1" stop-color="#eef2fc"/></linearGradient></defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="url(#band)" stroke="#dfe4ef"/>
${placed.join('\n')}
</svg>
`;
  writeFileSync(`${out}/banner-${version}.svg`, svg);
  console.log(`banner-${version}.svg: ${pictures.length} pictures at ${(k * 100).toFixed(0)} %, ${(svg.length / 1024).toFixed(0)} kB`);
}
await browser.close();
