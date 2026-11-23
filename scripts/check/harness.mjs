// What every topic of the browser check shares: the browser, a fresh page for each topic (open, close),
// check() and the helpers that draw and read the app. The runner is scripts/browser-check.mjs.
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, firefox } from 'playwright';

export { chromium, firefox };

export const TEST_MOLECULES = {
  morphine: 'CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O',
  strychnine: 'O=C7N2c1ccccc1[C@@]64[C@@H]2[C@@H]3[C@@H](OC/C=C5\\[C@@H]3C[C@@H]6N(CC4)C5)C7',
  'cyclo-hexaglycine': 'O=C1CNC(=O)CNC(=O)CNC(=O)CNC(=O)CNC(=O)CN1',
  cholesterol: 'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C',
  'beta-D-glucose': 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O',
};

export const url = new URL(process.env.CHECK_URL ?? 'http://localhost:5173/');
url.searchParams.set('test', '');
export const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
export const canonical = (text, details = {}) => {
  const mol = RDKit.get_mol(text, JSON.stringify(details));
  try {
    return mol?.get_smiles() ?? null;
  } finally {
    mol?.delete();
  }
};
mkdirSync('test-output', { recursive: true });

export const inFirefox = process.env.PW_BROWSER === 'firefox';
export const browser = inFirefox ? await firefox.launch() : await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
// CHECK_AUTH=user:password for a site behind a password (the Docker image)
export const [user, password] = (process.env.CHECK_AUTH ?? '').split(/:(.*)/s);
export const login = user ? { httpCredentials: { username: user, password } } : {};
// a context and a page of their own for each topic (open), so that each can run alone: what one leaves
// behind (a drawing, a setting, the window's size) doesn't reach the next
export let context = null;
export let page = null;
export let errors = [];
export async function open() {
  context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true, ...login });
  if (!inFirefox) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.origin });
  page = await context.newPage();
  errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    errors.push(msg.text());
    log(`  [browser error] ${msg.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
    log(`  [browser page error] ${error.message}`);
  });
  await page.goto(url.href);
  await unlock(page);
  await page.waitForFunction(() => window.olomol && window.olomolTest, null, { timeout: 30_000 });
  await state(() => localStorage.clear());
}
// The topic's end: no errors in its browser console, then its page closed.
export async function close(topic) {
  check(!errors.length, `${topic}: no errors in the browser console (${errors.length}${errors.length ? `: ${[...new Set(errors.map((e) => e.slice(0, 160)))].slice(0, 5).join(' | ')}` : ''})`);
  await context.close();
}

// what the checks say, as they go (the runner prints it); how many failed
export const tally = { checks: 0, failures: 0 };
export function log(line) {
  console.log(line);
}
export function check(ok, label) {
  tally.checks += 1;
  log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) tally.failures += 1;
}

// --- helpers ---
export const state = (fn, arg) => page.evaluate(fn, arg);
export const counts = () => state(() => ({ atoms: olomol.doc.atoms.size, bonds: olomol.doc.bonds.size, curves: olomol.doc.curves.size }));
export const screen = ([x, y]) => state(([x, y]) => [x * olomol.view.scale + olomol.view.tx, y * olomol.view.scale + olomol.view.ty], [x, y]);
export const atomXY = (id) => state((id) => [olomol.doc.atoms.get(id).x, olomol.doc.atoms.get(id).y], id);
export const bondMiddle = (id) => state((id) => {
  const b = olomol.doc.bonds.get(id);
  const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
  return [(p.x + q.x) / 2, (p.y + q.y) / 2];
}, id);
export async function clickAt(point) {
  const [x, y] = await screen(point);
  await page.mouse.click(x, y);
  await page.waitForTimeout(80);
}
export async function dragBetween(from, to) {
  const [x1, y1] = await screen(from);
  const [x2, y2] = await screen(to);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 });
  await page.mouse.move(x2, y2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
}
export async function hoverAndPress(point, key) {
  const [x, y] = await screen(point);
  await page.mouse.move(x, y);
  await page.keyboard.press(key);
  await page.waitForTimeout(60);
}
export async function clear() {
  await state(() => {
    olomol.setDoc({ atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), nextId: 1 });
    olomol.setTool({ name: 'select' });
  });
}
// Ctrl+V, then a click in the middle that puts the see-through copy down
export async function paste(text) {
  const before = await state(() => olomol.doc.atoms.size);
  await state(([text, direct]) => {
    if (direct) return window.olomolTest.paste(text);
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
  }, [text, inFirefox]);
  if (!inFirefox) {
    await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 });
    await page.mouse.click(700, 450);
  }
  await page.waitForFunction((n) => olomol.doc.atoms.size > n, before, { timeout: 30_000 });
  await state(() => olomol.fit(window.innerWidth, window.innerHeight));
}
// The canonical SMILES of everything drawn, by RDKit here in Node.
export const drawnSmiles = async () => canonical(await state(() => window.olomolTest.molfile()));
export const atomsByEl = (el) => state((el) => [...olomol.doc.atoms.values()].filter((a) => a.el === el).map((a) => a.id), el);
export const tool = (id) => page.getByTestId(`tool-${id}`);
// a projection tool (Ring flip, Turn a chair, Fischer projection, Zigzag), from under the top bar's projections button
export async function projectionTool(id) {
  if (!(await page.getByTestId(id).isVisible().catch(() => false))) await page.getByTestId('projections').click({ button: 'right' });
  await page.getByTestId(id).click();
}
export const notice = () => page.locator('.notice').textContent({ timeout: 3000 }).catch(() => '');
export const curveNames = () => state(() => [...olomol.doc.curves.values()].map((cv) => {
  const name = (end) => (end.bond !== undefined ? 'bond' : olomol.doc.atoms.get(end.atom).el + (olomol.doc.atoms.get(end.atom).charge < 0 ? '-' : ''));
  return `${name(cv.from)}->${name(cv.to)}`;
}).sort().join(', '));
export const layoutWorking = () => page.waitForFunction(() => {
  const dialog = document.querySelector('.dialog');
  return dialog && !dialog.textContent.includes('Still working') && !dialog.textContent.includes('Computing');
}, null, { timeout: 90_000 }).catch(() => {});
// (every drawing shown, not only the best: the dialog remembers that once switched on)
export async function layoutDone() {
  await layoutWorking();
  const more = page.getByTestId('layout-all');
  if ((await more.count()) && (await more.isVisible()) && (await more.textContent()).startsWith('Show all')) await more.click();
}

// A locked site's login window (npm run build:locked): the password, remembered.
export async function unlock(p) {
  if (!process.env.CHECK_PASSWORD) return;
  // the login window, or the app (opened by itself with the key remembered)
  await p.waitForFunction(() => window.olomol || document.querySelector('#lock input[type=password]')?.checkVisibility(), null, { timeout: 30_000 });
  const field = p.locator('#lock input[type=password]');
  if (!(await field.isVisible())) return;
  await field.fill(process.env.CHECK_PASSWORD);
  await p.locator('#lock input[type=checkbox]').check();
  await field.press('Enter');
}


// Ctrl+O: the file dialog (right after a download: the page given the focus
// back first). Should none come: a failed check saying what happened (the key
// seen by the page, a file input clicked), then the Open button.
export async function ctrlO() {
  const chooser = page.waitForEvent('filechooser', { timeout: 10_000 }).catch(() => null);
  await page.bringToFront(); // (after a download Chrome's download bubble may hold the focus, and a page without it gets no file dialog)
  await state(() => {
    window.ctrlO = { keys: [], clicks: 0 };
    addEventListener('keydown', (e) => window.ctrlO.keys.push(`${e.ctrlKey ? 'Ctrl+' : ''}${e.key}${e.defaultPrevented ? ' (taken)' : ''}`), { once: true });
    const click = window.ctrlOClick ??= HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') window.ctrlO.clicks++;
      window.ctrlO.active = navigator.userActivation?.isActive;
      window.ctrlO.focused = document.hasFocus();
      return click.call(this);
    };
  });
  await page.keyboard.press('Control+o');
  const picker = await chooser;
  if (picker) return picker;
  const focus = await state(() => `${document.activeElement?.tagName}${document.activeElement?.title ? ` "${document.activeElement.title}"` : ''}; ${JSON.stringify(window.ctrlO)}; editing ${Boolean(olomol.editing)}`);
  check(false, `Ctrl+O opens the file dialog (it didn't; the focus was on ${focus})`);
  const again = page.waitForEvent('filechooser');
  await page.getByTitle(/^Open a file/).click();
  return again;
}

export async function exportFile(label) {
  await page.getByTitle(/^Export:/).click();
  const wait = page.waitForEvent('download');
  await page.locator('.menu .item', { hasText: label }).first().click();
  if (label === 'XYZ') await page.getByTestId('xyz-save').click({ timeout: 60_000 }); // (worked out in the background)
  await page.getByTestId('save-name').click(); // the name as suggested
  return readFileSync(await (await wait).path());
}
// A tab closed by its ×, as a person does it: the pointer on the tab first (the × only takes room then, Tabs.jsx)
export async function closeTabByX(index) {
  await page.getByTestId(`tab-${index}`).hover();
  await page.waitForTimeout(250); // (its place opening: 0.15 s)
  await page.getByTestId(`tab-close-${index}`).click();
}
