// The built app in Chrome, for what needs the browser (Web Workers: Redraw's
// Indigo engine, the 3D conformers of Turn in 3D). The app is built into
// bench/out/dist from this working tree, served by `vite preview` on a free
// port, and opened with ?test, which gives window.olomol (the editor) and
// window.olomolTest (the test hooks, src/ui/App.jsx).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

const ROOT = new URL('../../', import.meta.url);
const DIST = new URL('../out/dist/', import.meta.url);

const freePort = () => new Promise((resolve) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

// `pages`: how many pages of the app to open (each with its own workers), for work shared among them;
// the first is also returned as `page`. `--app=URL`: an app already running there (a dev server of this
// working tree, while a benchmark is being written), nothing built or served.
export async function startApp({ build = !process.argv.includes('--no-build'), pages: count = 1 } = {}) {
  const given = process.argv.find((a) => a.startsWith('--app='))?.slice(6) ?? null;
  let server = null;
  let url;
  if (given) url = `${given.replace(/\/?$/, '/')}?test`;
  else {
    // (a working tree whose node_modules is a link to another's builds with its own vite.local.config.mjs, which
    // keeps the links: without it the 3D workers' modules are not found)
    const local = existsSync(new URL('vite.local.config.mjs', ROOT)) ? ['--config', 'vite.local.config.mjs'] : [];
    if (build) execFileSync('npx', ['vite', 'build', ...local, '--outDir', DIST.pathname, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
    const port = await freePort();
    // (vite itself, not through npx: so that closing it stops the server)
    const vite = new URL('node_modules/vite/bin/vite.js', ROOT).pathname;
    server = spawn(process.execPath, [vite, 'preview', '--outDir', DIST.pathname, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
    url = `http://127.0.0.1:${port}/?test`;
  }
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
  const errors = [];
  const open = async () => {
    // (a context each: pages that share nothing, as separate windows would)
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(url);
    await page.waitForFunction(() => window.olomol && window.olomolTest, null, { timeout: 120_000 });
    return page;
  };
  const pages = await Promise.all(Array.from({ length: count }, open));
  return {
    page: pages[0], pages, errors, url, open,
    async close() {
      await browser.close();
      server?.kill();
    },
  };
}

// Empties the drawing and pastes `ket` (as Ctrl+V and a click put a copied drawing down); returns the
// drawing's atoms and bonds in the page, in order.
export async function putDrawing(page, ket) {
  return page.evaluate(async (text) => {
    const ed = window.olomol;
    ed.setDoc({ atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), fills: new Map(), brackets: new Map(), orbitals: new Map(), overlaps: new Map(), nextId: 1 });
    await window.olomolTest.paste(text);
    const doc = ed.doc;
    return {
      atoms: [...doc.atoms.values()].map((a) => ({ id: a.id, el: a.el, alias: a.alias, x: a.x, y: a.y })),
      bonds: [...doc.bonds.values()].map((b) => ({ id: b.id, a: b.a, b: b.b, order: b.order, newman: Boolean(b.newman) })),
    };
  }, ket);
}
