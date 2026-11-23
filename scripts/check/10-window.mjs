// The browser check: The window: the empty canvas, Help and its examples, settings, theme, languages, the kept drawing, reports, the offline copy, the hint line and the top bar.
// Run alone: npm run check -- --only window [url]

import { readFileSync } from 'node:fs';
import {
  bondMiddle, canonical, check, clear, clickAt, drawnSmiles, inFirefox, page, paste, screen, state, unlock,
} from './harness.mjs';
// (its parts, in the order run:)
//   the empty canvas: a faint example, pointed at it says how a part was drawn; clicks draw through it
//   Examples in the help menu: each example, pointed at; the arrows go through them, not the selection; one opened
//   colours and settings
//   the drawing style: presets, Custom… in points and Serif, the picture in it
//   narrow: the groups that don't fit in the ⋯ menus, doing what their buttons do
//   the right-click menu: on a molecule (selected, Copy, Paste, Delete), on the empty canvas
//   the theme button works twice in a row; the selection lies over the drawing (and its highlights)
//   the drawing kept in this browser: a mark beside its name; another tab keeping its own: a warning
//   Help: a click outside closes it, drawing nothing
//   the help button: the quick start and the manual (PDFs next to the app), what is new
//   a tool's corner triangle opens its variants straight away; resting on it opens them too
//   reporting a problem: the bug at the top right, a table to paste into an e-mail
//   languages
//   loading, and the copy for offline use (built site only)
//   Help's example of orbitals: a Diels–Alder's HOMO and LUMO and an SN2 into σ*, opened as a drawing
//   the hint line names the other kinds of the tool's button; the top bar fits beside the top right, dropping
export default async function run() {
  check(await page.locator('.topbar').isVisible() && await page.locator('.rail').isVisible() && await page.locator('.dock').isVisible(), 'toolbars are shown');

  // --- the empty canvas: a faint example, pointed at it says how a part was drawn; clicks draw through it ---
  await state(() => localStorage.setItem('olomol-example', '3')); // (the last one shown: next, the first)
  await clear();
  await page.getByTestId('empty-example').waitFor({ timeout: 5000 }).catch(() => {});
  const exampleShown = await page.getByTestId('empty-example').count();
  const bromine = await state(() => {
    const el = [...document.querySelectorAll('[data-testid=empty-example] svg.example:not(.focus) text')].find((x) => x.textContent === 'Br');
    const b = el?.getBoundingClientRect();
    return b ? [b.left + b.width / 2, b.top + b.height / 2] : null;
  });
  let exampleTip = '';
  if (bromine) {
    await page.mouse.move(bromine[0], bromine[1], { steps: 3 });
    await page.waitForTimeout(150);
    exampleTip = await page.getByTestId('example-tip').textContent().catch(() => '');
  }
  // a curved arrow: its button lit (red), the arrow clearer than the rest; the pointer gone, both gone
  const curveAt = await state(() => {
    const path = document.querySelector('[data-testid=empty-example] svg.example:not(.focus) g[data-id]:not([stroke]):not([fill]) > path[fill="none"]');
    if (!path) return null;
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM();
    return [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f, path.parentNode.dataset.id];
  });
  let taught = [];
  if (curveAt) {
    await page.mouse.move(curveAt[0], curveAt[1], { steps: 3 });
    await page.waitForTimeout(300);
    taught = await state((id) => [
      [...document.querySelectorAll('.taught')].map((b) => b.dataset.testid).join(','),
      getComputedStyle(document.querySelector(`[data-testid=empty-example] .focus [data-id="${id}"]`) ?? document.body).visibility,
      getComputedStyle(document.querySelector('[data-testid=empty-example] .focus [data-id]:not([data-id="' + id + '"])') ?? document.body).visibility,
    ], curveAt[2]);
    await page.mouse.move(5, 300, { steps: 2 });
    await page.waitForTimeout(200);
    taught.push(await page.locator('.taught').count(), await page.locator('[data-testid=empty-example] .focus').count());
  }
  check(taught[0] === 'tool-curve' && taught[1] === 'visible' && taught[2] === 'hidden' && taught[3] === 0 && taught[4] === 0,
    `empty canvas: pointed at a curved arrow, the button lit is "${taught[0]}", the arrow drawn clearer (${taught[1]}, the rest ${taught[2]}); the pointer gone, ${taught[3]} lit, ${taught[4]} clearer`);
  // the SN2 (the first example): its transition state's partial bond lights Layout
  const partialAt = await state(() => {
    const el = [...document.querySelectorAll('[data-testid=empty-example] svg.example:not(.focus) g[data-id] line')].find((x) => x.getAttribute('stroke-dasharray'));
    const b = el?.getBoundingClientRect();
    return b ? [b.x + b.width / 2, b.y + b.height / 2] : null;
  });
  let layoutLit = false;
  if (partialAt) {
    await page.mouse.move(partialAt[0], partialAt[1], { steps: 3 });
    await page.waitForTimeout(300);
    layoutLit = await page.getByTestId('relayout').evaluate((b) => b.classList.contains('taught'));
    await page.mouse.move(5, 300, { steps: 2 });
    await page.waitForTimeout(200);
  }
  await state(() => olomol.setTool({ name: 'bond', order: 1, stereo: '' }));
  if (bromine) await page.mouse.click(bromine[0] - 60, bromine[1]);
  await page.waitForTimeout(150);
  const drawnThrough = [await state(() => olomol.doc.atoms.size), await page.getByTestId('empty-example').count()];
  check(exampleShown === 1 && exampleTip.startsWith('Br: B over an atom') && drawnThrough[0] > 0 && drawnThrough[1] === 0,
    `empty canvas: the example (${exampleShown}), pointed at a Br it says "${exampleTip}", a click draws through it (${drawnThrough[0]} atoms) and it is gone`);
  await state(() => olomol.setTool({ name: 'select' }));
  // the canvas empty again: the next example
  await clear();
  await page.getByTestId('empty-example').waitFor({ timeout: 5000 }).catch(() => {});
  const nextExample = await page.getByTestId('empty-example').getAttribute('data-example').catch(() => null);
  check(nextExample === '1' && layoutLit, `empty canvas again: the next example (${nextExample}); the first one's (the SN2's) partial bond lit Layout (${layoutLit})`);

  // --- Examples in the help menu: each example, pointed at; the arrows go through them, not the selection; one opened ---
  const viewBeforeExamples = await state(() => ({ ...olomol.view }));
  await clear();
  await paste('CC');
  await state(() => olomol.select([...olomol.doc.atoms.keys()]));
  const beforeExamples = await state(() => [...olomol.doc.atoms.values()].map((a) => a.x).join());
  await page.getByTestId('help').click();
  await page.getByTestId('example-enzyme').click();
  const arcAt = await state(() => {
    const path = document.querySelector('[data-testid=examples] svg.example:not(.focus) [data-arc] path');
    if (!path) return null;
    const p = path.getPointAtLength(path.getTotalLength() * 0.4);
    const m = path.getScreenCTM();
    return [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f];
  });
  let arcTip = '';
  let arcLit = '';
  if (arcAt) {
    await page.mouse.move(arcAt[0], arcAt[1], { steps: 3 });
    await page.waitForTimeout(300);
    arcTip = await page.getByTestId('example-tip').textContent().catch(() => '');
    arcLit = await state(() => [...document.querySelectorAll('.taught')].map((b) => b.dataset.testid).join());
  }
  await page.keyboard.press('ArrowDown');
  const afterArrow = [await page.locator('[data-testid=examples] .examples-list .item.on').getAttribute('data-testid'), await state(() => [...olomol.doc.atoms.values()].map((a) => a.x).join())];
  // a tag picked: only those examples; a step's button pointed at lights the real one
  await page.getByTestId('examples-tag-templates').click();
  const tagged = await page.locator('[data-testid=examples] .examples-list .item').evaluateAll((items) => items.map((b) => b.dataset.testid.replace('example-', '')).join());
  await page.getByTestId('example-sugars').click();
  await page.locator('[data-testid=example-steps] .shown.lights').first().hover();
  await page.waitForTimeout(150);
  const stepLit = await page.getByTestId('templates').evaluate((b) => b.classList.contains('taught'));
  await page.mouse.move(5, 300);
  const stepOff = await page.getByTestId('templates').evaluate((b) => b.classList.contains('taught'));
  check(tagged === 'sugars,conformations' && stepLit && !stepOff, `Examples: the tag Templates shows only ${tagged}; in the sugars' steps, Templates pointed at lights its button (${stepLit}), and not after (${stepOff})`);
  await page.getByTestId('examples-all').click();
  await page.getByTestId('example-catecholamines').click();
  await page.getByTestId('example-open').click();
  const opened = [await page.getByTestId('examples').count(), await state(() => olomol.doc.atoms.size)];
  await page.keyboard.press('Control+z');
  const undone = await state(() => olomol.doc.atoms.size);
  await page.getByTestId('help').click();
  await page.keyboard.press('Escape');
  const escClosed = await page.getByTestId('examples').count();
  await state((v) => olomol.setView(v), viewBeforeExamples); // (opening it fitted the view)
  check(arcTip.startsWith('Side arc') && arcLit === 'tool-rxn' && afterArrow[0] === 'example-orbitals' && afterArrow[1] === beforeExamples && opened[0] === 0 && opened[1] > 20 && undone === 2 && escClosed === 0,
    `Examples: pointed at the enzyme's side arc "${arcTip.slice(0, 30)}…" lights ${arcLit}; ↓ goes to ${afterArrow[0]}, the selection left where it was (${afterArrow[1] === beforeExamples}); opened as the drawing (window ${opened[0]}, ${opened[1]} atoms), Ctrl+Z gives the ${undone} atoms back; Esc closes it (${escClosed})`);

  // --- colours and settings ---
  await clear();
  await paste('CC(=O)O');
  await state(() => olomol.select([...olomol.doc.atoms.values()].filter((a) => a.el === 'O').map((a) => a.id)));
  await page.locator('.inspector').getByRole('button', { name: 'blue', exact: true }).click();
  check((await state(() => [...olomol.doc.atoms.values()].filter((a) => a.color === '#0044cc').length)) === 2, 'colour from the panel: the selected atoms');
  // highlighter: a bond, with its atoms
  await state(() => olomol.setTool({ name: 'highlight', color: '#fff09a' }));
  await clickAt(await bondMiddle(await state(() => [...olomol.doc.bonds.keys()][0])));
  check((await state(() => [...olomol.doc.atoms.values()].filter((a) => a.highlight).length)) === 2
    && (await page.locator('.drawing').innerHTML()).includes('#fff09a'), 'highlighter: a bond and its two atoms marked');
  await state(() => olomol.setSettings({ colorMode: 'mono' }));
  const markup = await page.locator('.drawing').innerHTML();
  check(markup.includes('#0044cc') && !markup.includes('#dd2a1f'), 'black and white: element colours off, own colours kept');
  await state(() => olomol.setSettings({ colorMode: 'element' }));
  // filling a ring: the highlighter clicked inside it
  await clear();
  await paste('c1ccccc1');
  await state(() => olomol.setTool({ name: 'highlight', color: '#b5dcff' }));
  await clickAt(await state(() => {
    const atoms = [...olomol.doc.atoms.values()];
    return [atoms.reduce((s, a) => s + a.x, 0) / atoms.length, atoms.reduce((s, a) => s + a.y, 0) / atoms.length];
  }));
  check((await state(() => olomol.doc.fills.size)) === 1 && (await page.locator('.drawing').innerHTML()).includes('#b5dcff'), 'highlighter inside a ring: the ring filled');

  // --- the theme button works twice in a row; the selection lies over the drawing (and its highlights) ---
  {
    const theme = () => state(() => document.documentElement.dataset.resolvedTheme);
    const first = await theme();
    // (in Settings: the top right has only Settings)
    const pick = async (now) => {
      await page.getByTestId('settings').click();
      await page.locator('.settings button', { hasText: now === 'dark' ? 'Light' : 'Dark' }).first().click();
      await page.keyboard.press('Escape');
    };
    await pick(first);
    const second = await theme();
    await pick(second);
    const third = await theme();
    const order = await state(() => [...document.querySelector('.canvas svg').children].map((g) => g.getAttribute('class') ?? '').join());
    check(second !== first && third === first && order.indexOf('drawing') < order.indexOf('selection'), `theme button: ${first} → ${second} → ${third} without touching the canvas; selection drawn over the drawing (${order})`);
  }

  // --- the drawing kept in this browser: a mark beside its name; another tab keeping its own: a warning ---
  await clear();
  await paste('CCO');
  await page.waitForFunction(() => document.querySelector('[data-testid=kept-mark]')?.classList.contains('kept'), null, { timeout: 5000 }).catch(() => {});
  const keptMark = await state(() => [document.querySelector('[data-testid=kept-mark]')?.className, document.querySelector('[data-testid=kept-mark]')?.title ?? '']);
  // (another window of olomol keeping the same drawing: its message on the channel they share, ui/tabs.js)
  await state(() => new BroadcastChannel('olomol').postMessage({ kept: olomol.drawingId, at: Date.now() }));
  await page.waitForTimeout(100);
  const otherTab = await state(() => document.querySelector('[data-testid=kept-mark]')?.className);
  check(/\bkept\b/.test(keptMark[0] ?? '') && keptMark[1].includes('Save (Ctrl+S)') && /elsewhere/.test(otherTab ?? ''),
    `kept in this browser: the mark after a change (${keptMark[0]}), another tab keeping its drawing turns it into a warning (${otherTab})`);

  // --- Help: a click outside closes it, and draws nothing ---
  {
    await state(() => {
      olomol.setDoc({ atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), nextId: 1 });
      olomol.setTool({ name: 'bond', order: 1, stereo: '' });
    });
    await page.getByTestId('help').click();
    const opened = await page.getByTestId('examples').isVisible();
    await page.mouse.click(60, 860); // (the canvas, left of the window, under the tool rail)
    await page.waitForTimeout(150);
    const closed = !(await page.getByTestId('examples').isVisible().catch(() => false));
    const drawn = await state(() => olomol.doc.atoms.size);
    check(opened && closed && drawn === 0, `Help: a click outside closes it (${opened} → ${closed}), nothing drawn there (${drawn} atoms)`);
    await state(() => olomol.setTool({ name: 'select' }));
  }

  // --- the help button: the quick start (a PDF), the manual (a page of the site, and its PDF), what is new ---
  await page.getByTestId('help').click();
  const web = await state(async (h) => { const r = await fetch(h); return `${h} ${r.status} ${(await r.text()).includes('<nav class="toc">')}`; }, await page.getByTestId('help-manual').getAttribute('href'));
  const manuals = [];
  for (const id of ['help-quick-start', 'help-manual-pdf']) {
    const href = await page.getByTestId(id).getAttribute('href');
    manuals.push(`${href} ${await state(async (h) => { const r = await fetch(h); return `${r.status} ${r.headers.get('content-type')}`; }, href)}`);
  }
  const changelog = await state(async (h) => {
    const r = await fetch(h);
    const page = await r.text();
    return { status: r.status, newest: page.match(/<section id="v([\d.]+)"/)?.[1], hint: document.querySelector('[data-testid=help-changelog]')?.title };
  }, await page.getByTestId('help-changelog').getAttribute('href'));
  // beside the examples, the about page's videos in a new tab
  const videos = page.getByTestId('example-videos');
  const videosLink = { href: await videos.getAttribute('href'), target: await videos.getAttribute('target') };
  videosLink.page = await state(async (h) => { const r = await fetch(h); return `${r.status} ${(await r.text()).includes('<video')}`; }, videosLink.href);
  await page.keyboard.press('Escape');
  check(/^(?:(?:cs|de)\/about\.html\?stay|about\.html\?lang=en&stay)$/.test(videosLink.href) && videosLink.target === '_blank' && videosLink.page === '200 true',
    `help: a link to the videos beside the examples, in a new tab (${videosLink.href}, ${videosLink.target}, ${videosLink.page})`);
  check(manuals.every((m) => / 200 application\/pdf/.test(m)), `help button: the quick start and the manual as PDFs open (${manuals.join('; ')})`);
  check(/^(?:cs\/)?manual\.html 200 true$/.test(web), `help button: the manual on the web opens, with its contents (${web})`);
  // the ? button opens Help at once (the examples); its header has the shortcuts, which open in place of it
  await page.getByTestId('help').click();
  const helpOpen = await page.getByTestId('examples').count();
  await page.getByTestId('help-keys').click();
  const keysSheet = await page.locator('.dialog', { hasText: 'Keyboard shortcuts' }).isVisible();
  await page.keyboard.press('Escape');
  check(helpOpen === 1 && keysSheet && (await page.getByTestId('examples').count()) === 0, `help button: opens Help at once (${helpOpen}); Keyboard shortcuts in its header opens the sheet in its place (${keysSheet})`);
  // (a development version, 0.4.0-dev, isn't in the list yet)
  check(changelog.status === 200 && changelog.newest && (changelog.hint.includes(changelog.newest) || /-dev/.test(changelog.hint)), `help button: What's new opens, its newest version is the app's (${JSON.stringify(changelog)})`);
  // the version in the bottom left corner: with What's new's date for it (a development version: none), and its link
  const versionMark = await state(async () => {
    const mark = document.querySelector('[data-testid=version-mark]');
    const line = mark.querySelector('span'); // (the version, then What's new and About under it)
    const href = mark.querySelector('a').getAttribute('href');
    const r = await fetch(href);
    const html = await r.text();
    const version = line.textContent.match(/olomol (\S+)/)?.[1];
    const date = html.match(new RegExp(`<section id="v${version.replace(/\./g, '\\.')}">\\s*<h2>[^<]*<span class="date" data-date="([\\d-]+)"`))?.[1] ?? null;
    const shown = date && new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(`${date}T12:00`));
    return { text: line.textContent, href, status: r.status, version, ok: getComputedStyle(mark).display !== 'none' && (/-dev/.test(version) ? !line.textContent.includes('·') : line.textContent.includes(`· ${shown}`)) };
  });
  check(versionMark.ok && versionMark.status === 200 && versionMark.href.endsWith(`#v${versionMark.version.replace(/-.*/, '')}`),
    `bottom left: the version with its release date and a link to What's new (${versionMark.text}, ${versionMark.href} ${versionMark.status})`);
  // under it, About: the about page in a new tab, with how to cite olomol (its citation, and buttons for BibTeX,
  // RIS, CSL JSON: a development version cites the version it is becoming, once What's new has it)
  const about = await state(async () => {
    const link = document.querySelector('[data-testid=version-about]');
    const r = await fetch(link.getAttribute('href'));
    const html = await r.text();
    return { tag: link.tagName, href: link.getAttribute('href'), target: link.target, status: r.status,
      citation: html.match(/data-testid="citation">([^<]*)/)?.[1] ?? '', buttons: (html.match(/data-(?:copy|save)="/g) ?? []).length, section: html.includes('id="cite"') };
  });
  check(about.tag === 'A' && /about\.html\?(?:lang=en&)?stay$/.test(about.href) && about.target === '_blank' && about.status === 200 && about.section && /^Salomon, J\./.test(about.citation),
    `bottom left: About opens the about page in a new tab, with How to cite (${about.href}, ${about.citation.slice(0, 40)}…)`);
  const release = !/-dev/.test(versionMark.version);
  check(!release || (/\(Version [\d.]+\)/.test(about.citation) && about.buttons === 7),
    `the about page: this version's citation, copied as text, BibTeX, RIS or CSL JSON and saved as .bib, .ris, .json (${about.buttons} buttons)`);

  // --- a tool's corner triangle opens its variants straight away ---
  await state(() => olomol.setTool({ name: 'select' }));
  await page.locator('[data-testid="tool-bond"] .corner').click({ force: true });
  const variants = await page.locator('.flyout .btn').count();
  await page.keyboard.press('Escape');
  // (Esc closes them, and only that: the tool stays the select tool, not the lasso)
  const escaped = [await page.locator('.flyout .btn').count(), await state(() => Boolean(olomol.tool.lasso))];
  check(variants === 9 && escaped[0] === 0 && !escaped[1], `a click on the bond tool's corner triangle opens its variants, also when another tool is active (${variants}); Esc closes them (${escaped[0]} left, lasso ${escaped[1]})`);

  // --- a tool's kinds also open when the mouse rests on its button, and go when it leaves; a click keeps them ---
  {
    const kinds = () => page.locator('.flyout .btn').count();
    const box = await page.getByTestId('tool-charge').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const early = await kinds();
    await page.waitForTimeout(700);
    const rested = await kinds();
    await page.mouse.move(700, 450);
    await page.waitForTimeout(600);
    const left = await kinds();
    // rested on again, then clicked: open for good (moving away doesn't close them)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
    await page.getByTestId('tool-charge').locator('.corner').click({ force: true });
    await page.mouse.move(700, 450);
    await page.waitForTimeout(600);
    const clicked = await kinds();
    await page.keyboard.press('Escape');
    check(early === 0 && rested === 4 && left === 0 && clicked === 4,
      `a tool's kinds open when the mouse rests on its button (charge: ${rested} of 4, none at once: ${early}), go when it leaves (${left}), and stay once clicked (${clicked})`);
  }

  // --- reporting a problem: a table to paste into an e-mail ---
  // (one click on the bug at the top right; Help has it too)
  const topRight = await page.locator('.topright .btn').evaluateAll((buttons) => buttons.map((b) => b.dataset.testid ?? b.title));
  await page.getByTestId('help').click();
  const helpButtons = await page.locator('.help-links .btn').evaluateAll((buttons) => buttons.map((b) => b.dataset.testid));
  await page.getByTestId('help-report').click();
  const fromHelp = await page.getByTestId('report-table').isVisible().catch(() => false);
  await page.keyboard.press('Escape');
  check(topRight.filter((id) => id !== 'install').join() === 'report,settings' && fromHelp && ['help-quick-start', 'help-manual', 'help-manual-pdf', 'help-changelog', 'help-keys', 'help-report', 'help-about'].every((id) => helpButtons.includes(id)),
    `the top right has reporting and Settings (${topRight.join(', ')}); Help has the manuals, What's new, the keys, reporting (opens: ${fromHelp}) and About (${helpButtons.join(', ')})`);
  await page.getByTestId('report').click();
  await page.getByTestId('report-table').locator('tr').nth(7).waitFor({ timeout: 10_000 }).catch(() => {});
  const reportTable = await page.getByTestId('report-table').innerText();
  const mail = await page.getByTestId('report-mail').getAttribute('href');
  const contact = await page.getByTestId('report-contact').locator('a').getAttribute('href');
  let reportCopied = 'not tried (Firefox)';
  if (!inFirefox) {
    await page.getByTestId('report-copy').click();
    await page.getByTestId('report-copy').filter({ hasText: 'Copied' }).waitFor({ timeout: 5000 }).catch(() => {});
    reportCopied = await state(() => navigator.clipboard.readText());
  }
  await page.keyboard.press('Escape');
  const mailBody = decodeURIComponent(mail.split('&body=')[1] ?? '');
  check(reportTable.includes('Version') && reportTable.includes('Browser') && mail.startsWith('mailto:bugs@olomol.org?subject=olomol')
    && (inFirefox || reportCopied.startsWith('Version: ')), `Report a problem: the table (version, browser…), copied as lines, and an e-mail to start (${reportCopied.split('\n')[0]})`);
  check(contact.startsWith('mailto:contact@olomol.org'), `Report a problem: ideas and questions go to contact@, not bugs@ (${contact})`);
  check(mailBody.includes('Version: ') && mailBody.includes('Browser: ') && !mailBody.includes('#d='), `the e-mail has the table in it already, without the drawing's link (${mailBody.length} characters)`);

  // --- languages ---
  // Settings → Čeština: the page loads again in Czech, the drawing still there
  await clear();
  await paste('CC(=O)O');
  await page.waitForTimeout(800); // remembered in the browser
  async function pickLanguage(settings, code) {
    await page.getByTitle(settings, { exact: true }).click();
    await Promise.all([page.waitForEvent('load'), page.getByTestId(`language-${code}`).click()]);
    await unlock(page);
    await page.waitForFunction(() => window.olomol?.doc.atoms.size > 0, null, { timeout: 10_000 }).catch(() => {});
  }
  await state(() => olomol.setView({ scale: 77, tx: 321, ty: 123 }));
  await pickLanguage('Settings', 'cs');
  const czech = await state(() => ({ lang: document.documentElement.lang, tool: document.querySelector('[data-testid="tool-select"]').title, atoms: olomol.doc.atoms.size, view: olomol.view }));
  check(czech.lang === 'cs' && czech.tool.startsWith('Výběr') && czech.atoms === 4, `Settings → Čeština: the page in Czech, the drawing kept (${JSON.stringify(czech)})`);
  check(czech.view.scale === 77 && czech.view.tx === 321, 'Settings → Čeština: the drawing seen as before (zoom and place kept)');
  await page.getByTestId('templates').click();
  await page.getByTestId('template-search').fill('kyselina');
  const acids = await page.locator('.card .caption').allTextContents();
  check(acids.includes('Karboxylová kyselina') && acids.includes('Kyselina sírová'), `templates: Czech names, searched in Czech (${acids.join(', ')})`);
  await page.getByTestId('template-search').fill('sulfuric');
  check((await page.locator('.card .caption').allTextContents()).includes('Kyselina sírová'), 'templates: the English name finds it too');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-output/czech.png' });
  await pickLanguage('Nastavení', 'de');
  check(await page.getByTitle('Rückgängig (Strg+Z)', { exact: true }).isVisible(), 'Settings → Deutsch: German, with German key names');
  await pickLanguage('Einstellungen', 'en');
  check(await page.getByTitle('Undo (Ctrl+Z)', { exact: true }).isVisible(), 'Settings → EN: English again');

  // --- loading, and the copy for offline use (built site only) ---
  check(!(await page.locator('.downloads').count()), 'the progress bar of the engines is gone once they are loaded');
  const offline = await state(async () => {
    if (!(await navigator.serviceWorker?.getRegistration())) return null;
    await navigator.serviceWorker.ready;
    const name = (await caches.keys()).find((n) => n.startsWith('olomol-'));
    const kept = name ? (await (await caches.open(name)).keys()).map((request) => request.url) : [];
    return { kept: kept.length, rdkit: kept.some((url) => /RDKit_minimal.*\.wasm$/.test(url)) };
  });
  if (offline) check(offline.kept > 10 && offline.rdkit, `the service worker keeps the site's files for offline use (${JSON.stringify(offline)})`);
  else console.log('      (no service worker: the dev server; npm run build && npm run preview has one)');

  // --- Help's example of orbitals: a Diels–Alder's HOMO and LUMO and an SN2 into σ*, opened as a drawing ---
  {
    await clear();
    await page.getByTestId('help').click();
    await page.getByTestId('example-orbitals').click();
    await page.getByTestId('example-open').click();
    await page.waitForTimeout(300);
    const opened = await state(() => `${olomol.doc.orbitals.size} ${olomol.doc.overlaps.size} ${[...olomol.doc.curves.values()].filter((c) => c.from.orbital !== undefined).length}`);
    check(opened === '8 2 1', `Help's example of orbitals opens as a drawing: ${opened} (8 orbitals, 2 dashed overlaps, 1 arrow from a lobe)`);
  }

  // --- the hint line: one line, the start of what the tool does; the tool's tooltip all of it and the other kinds of
  // its button; the top bar fits beside the top right, dropping words a step at a time (Turn in 3D's first), in
  // every language ---
  {
    await clear();
    await page.keyboard.press('Escape');
    await page.keyboard.press('1');
    const kinds = async (group) => ((await page.getByTestId(`tool-${group}`).getAttribute('title')) ?? '').split('Also in this button:')[1] ?? '';
    const [bondKinds, selectKinds, chainKinds] = [await kinds('bond'), await kinds('select'), await kinds('chain')];
    const hint = await page.locator('.tool-hint').evaluate((el) => ({ text: el.textContent, lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || '16')) }));
    const bondTitle = await page.getByTestId('tool-bond').getAttribute('title');
    check(/wedge/.test(bondKinds) && /dative bond/.test(bondKinds) && !/single bond/.test(bondKinds) && /lasso/.test(selectKinds) && !chainKinds,
      `the tool's tooltip names its button's other kinds: the bond tool's (${bondKinds.slice(0, 60)}…), the select tool's (${selectKinds}), none for the chain (${chainKinds})`);
    check(/drag from an atom/.test(hint.text) && !/keys over atoms/.test(hint.text) && /keys over atoms/.test(bondTitle) && hint.lines <= 1,
      `the hint line: one line, the tool's first gestures (${hint.text}), all of them in its tooltip`);
    const fitted = async (width) => {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      return state(() => {
        const bar = document.querySelector('.topbar');
        const label = document.querySelector('[data-testid=turn3d] .label');
        return { step: bar.dataset.compact, gap: Math.round(document.querySelector('.topright').getBoundingClientRect().left - bar.getBoundingClientRect().right), word: Boolean(label && label.offsetWidth) };
      });
    };
    const wide = await fitted(1700);
    const laptop = await fitted(1366);
    const narrow = await fitted(1100);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(250);
    check(wide.word && wide.gap >= 0 && laptop.gap >= 0 && !narrow.word && narrow.gap >= 0,
      `the top bar fits beside the top right: 1700 px with Turn in 3D's word (${JSON.stringify(wide)}), 1366 px (${JSON.stringify(laptop)}), 1100 px without it (${JSON.stringify(narrow)}), nothing overlapping`);
  }
  // --- a narrow window: what doesn't fit in the bars is in their ⋯ menus, each item doing what its button does ---
  {
    await clear();
    await page.keyboard.press('Escape');
    await paste('CC(=O)O');
    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForTimeout(300);
    const fits = await state(() => ['.topbar', '.dock'].map((sel) => {
      const el = document.querySelector(sel);
      return { overflow: el.dataset.overflow, inside: el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= innerWidth };
    }));
    check(fits.every((bar) => bar.overflow !== '0' && bar.inside) && (await page.getByTestId('top-more').isVisible()) && (await page.getByTestId('dock-more').isVisible()),
      `600 px: both bars fit, with a ⋯ for the rest (${JSON.stringify(fits)})`);
    const before = await state(() => [...olomol.doc.atoms.values()].map((a) => a.x));
    await page.getByTestId('top-more').click();
    const listed = await page.locator('.more-menu .item').allTextContents();
    await page.locator('.more-menu .item', { hasText: 'Flip left–right' }).click();
    const after = await state(() => [...olomol.doc.atoms.values()].map((a) => a.x));
    check(listed.includes('Flip left–right') && listed.includes('Ring flip of a chair') && after[0] !== before[0] && (await page.locator('.more-menu').count()) === 0,
      `the top bar's ⋯: its hidden buttons by name (${listed.join(', ')}); Flip left–right flips, the menu gone`);
    await page.getByTestId('top-more').click();
    await page.locator('.more-menu .item', { hasText: 'Align' }).click();
    await page.waitForTimeout(200);
    const alignBox = await page.locator('.menu').first().boundingBox();
    check(alignBox && alignBox.y < 200, `Align from it: its menu under the ⋯ (${JSON.stringify(alignBox)})`);
    await page.keyboard.press('Escape');
    await page.getByTestId('dock-more').click();
    await page.locator('.more-grid .btn').nth(2).click();
    check(JSON.stringify(await state(() => olomol.tool)) === JSON.stringify({ name: 'ring', size: 4, aromatic: false }), `the bottom bar's ⋯: a ring from it is the ring tool (${JSON.stringify(await state(() => olomol.tool))})`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    check((await state(() => document.querySelector('.topbar').dataset.overflow)) === '0' && !(await page.getByTestId('top-more').isVisible()), 'wide again: everything back in the bar, no ⋯');
  }

  // --- the drawing style: the presets in Settings; Custom… (sizes in points, Sans or Serif) used; exports in it ---
  {
    await clear();
    await paste('CC(=O)O');
    const styleNow = () => state(() => import('/src/render/style.js').then(({ STYLE }) => ({ font: STYLE.font, line: STYLE.line, family: STYLE.family, scale: STYLE.exportScale, fontFamily: STYLE.fontFamily })));
    await page.getByTestId('settings').click();
    await page.getByTestId('style-rsc').click();
    const rsc = await styleNow();
    check(Math.abs(rsc.font - 7 / 12.2) < 1e-9 && Math.abs(rsc.line - 0.5 / 12.2) < 1e-9 && Math.abs(rsc.scale - 12.2 * 4 / 3) < 1e-9, `Style RSC: labels 7 pt and lines 0.5 pt on bonds of 12.2 pt (${JSON.stringify(rsc)})`);
    await page.getByTestId('style-custom').click();
    await page.getByTestId('style-dialog').waitFor({ timeout: 5000 });
    await page.getByTestId('style-label').fill('12');
    await page.getByTestId('style-font-serif').click();
    await page.getByTestId('style-use').click();
    const custom = await styleNow();
    const svg = await state(async () => (await import('/src/io/files.js')).svgOf(olomol.doc, olomol.settings));
    check(custom.family === 'serif' && /Times/.test(custom.fontFamily) && Math.abs(custom.font - 12 / 12.2) < 1e-9 && /Times New Roman/.test(svg),
      `Custom…: started from the style in use (RSC), 12 pt labels in Serif; the picture in Times (${JSON.stringify(custom)})`);
    await state(() => olomol.setSettings({ style: 'screen' }));
  }

  // --- the style in the drawing: each tab its own, kept in its file; a file says its style, one that doesn't follows
  // the style set for new drawings ---
  {
    const fontNow = () => state(() => import('/src/render/style.js').then(({ STYLE }) => STYLE.font));
    const tabsNow = () => state(() => olomol.tabs.length);
    await clear();
    await paste('CCO');
    await state(() => olomol.setDrawingStyle('acs'));
    const ket = JSON.parse(await state(() => window.olomolTest.ket()));
    // (the tabs counted before the click: the new one comes a moment after it, and counted after, the wait was
    // over at once and the paste below went into the drawing before)
    const tabsBefore = await tabsNow();
    await page.locator('.topbar').getByTitle('New drawing', { exact: true }).click();
    await page.waitForFunction((n) => olomol.tabs.length === n + 1 && !olomol.switching, tabsBefore, { timeout: 3000 }).catch(() => {});
    await paste('CCN');
    await state(() => olomol.setDrawingStyle('rsc'));
    const rscFont = await fontNow();
    await state(async () => (await import('/src/ui/tabs.js')).showTab(olomol, olomol.tabs.at(-2).id));
    await page.waitForTimeout(200);
    const acsFont = await fontNow();
    check(ket.style === 'acs' && Math.abs(acsFont - 10 / 14.4) < 1e-9 && Math.abs(rscFont - 7 / 12.2) < 1e-9,
      `each drawing its own style, kept in its file, the tab shown in its own (ACS ${acsFont.toFixed(3)}, RSC ${rscFont.toFixed(3)})`);
    // a file with a style opens in it, one without in the style for new drawings (RSC, set last)
    const read = (text) => state(async (text) => {
      const { readAny } = await import('/src/io/files.js');
      const { doc } = await readAny(text, { name: 'x.olom' });
      olomol.setDoc(doc);
      return (await import('/src/render/style.js')).STYLE.font + 0 && olomol.drawingStyle().style;
    }, text);
    const withStyle = await read(JSON.stringify(ket));
    delete ket.style;
    const without = await read(JSON.stringify(ket));
    // (choosing a style changes the drawing's only; Use for new drawings sets the default)
    const defaultBefore = await state(() => olomol.defaultStyle().style);
    await state(() => olomol.setDefaultStyle({ style: 'rsc' }));
    const withoutNow = await read(JSON.stringify(ket));
    check(withStyle === 'acs' && defaultBefore === 'screen' && without === 'screen' && withoutNow === 'rsc',
      `a file in ACS opens in ACS (${withStyle}); choosing styles left the default as it was (${defaultBefore}); a file without a style in the default (${without}, then ${withoutNow} once RSC is the default)`);
    await state(() => olomol.setSettings({ style: 'screen' }));
  }

  // --- a bold bond (the panel's Stereo row: ▬) and a bold label (Label: B), kept in the file ---
  {
    await clear();
    await paste('CC(=O)OC');
    await state(() => {
      const o = [...olomol.doc.atoms.values()].find((a) => a.el === 'O' && [...olomol.doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length === 2);
      olomol.select([[...olomol.doc.bonds.values()].find((b) => (b.a === o.id || b.b === o.id) && b.order === 1).id]);
    });
    await page.locator('.inspector button[title="bold bond"]').click();
    await state(() => olomol.select([[...olomol.doc.atoms.values()].find((a) => a.el === 'O' && [...olomol.doc.bonds.values()].filter((b) => b.a === a.id || b.b === a.id).length === 2).id]));
    await page.locator('.inspector button[title="bold"]').click();
    const read = await state(async () => {
      const { readOlom } = await import('/src/io/olom.js');
      const { doc } = readOlom(window.olomolTest.ket());
      return { bonds: [...doc.bonds.values()].filter((b) => b.bold).length, atoms: [...doc.atoms.values()].filter((a) => a.bold).length, thick: olomol.scene.bonds && [...olomol.doc.bonds.values()].some((b) => b.bold) };
    });
    const svg = await state(async () => (await import('/src/io/files.js')).svgOf(olomol.doc, olomol.settings));
    check(read.bonds === 1 && read.atoms === 1 && /font-weight="bold"/.test(svg), `a bold bond and a bold O from the panel, in the picture and kept in the file (${JSON.stringify(read)})`);
  }

  // --- a text's own size (in points, as the style has its texts) and font (Sans, Serif), kept in the file and drawn so ---
  {
    await clear();
    await state(() => olomol.setTool({ name: 'text' }));
    await page.mouse.click(500, 400);
    await page.getByTestId('text-editor').waitFor({ timeout: 3000 });
    await page.keyboard.type('Exercise 1');
    await page.getByTestId('text-serif').click();
    await page.getByTestId('text-size').fill('20');
    await page.mouse.click(900, 650);
    await page.waitForTimeout(300);
    const text = await state(() => [...olomol.doc.texts.values()].map(({ text, size, family }) => ({ text, size, family }))[0]);
    const back = await state(async () => {
      const { readOlom } = await import('/src/io/olom.js');
      return [...readOlom(window.olomolTest.ket()).doc.texts.values()].map(({ size, family }) => ({ size, family }))[0];
    });
    const svg = await state(async () => (await import('/src/io/files.js')).svgOf(olomol.doc, olomol.settings));
    check(text?.text === 'Exercise 1' && text.family === 'serif' && Math.abs(text.size - 20 / 15) < 1e-6 && back?.family === 'serif' && Math.abs(back.size - text.size) < 1e-3 && /Times New Roman/.test(svg),
      `a text in Serif at 20 pt (the style's texts 15 pt): kept, back from the file, its picture in Times (${JSON.stringify(text)})`);
    await state(() => olomol.setTool({ name: 'select' }));
  }

  // --- the right-click menu: a molecule selected and what can be done with it; the empty canvas's ---
  {
    await clear();
    await page.keyboard.press('Escape');
    await paste('CCO');
    const items = () => page.locator('.context-menu .item').allTextContents();
    const [mx, my] = await screen(await bondMiddle(await state(() => [...olomol.doc.bonds.keys()][0])));
    const middle = { x: mx, y: my };
    await page.mouse.click(middle.x, middle.y, { button: 'right' });
    await page.waitForTimeout(200);
    const onMolecule = await items();
    check(await state(() => olomol.selection.has([...olomol.doc.atoms.keys()][0])) && onMolecule.some((x) => x.startsWith('Copy')) && onMolecule.some((x) => x.startsWith('Redraw')),
      `a right click on a molecule selects it, its menu (${onMolecule.join(', ')})`);
    await page.getByTestId('context-copy').click();
    await page.mouse.click(middle.x, middle.y, { button: 'right' });
    await page.getByTestId('context-paste').click();
    await page.waitForTimeout(300);
    await page.mouse.click(middle.x + 200, middle.y);
    await page.keyboard.press('Escape');
    check((await state(() => olomol.doc.atoms.size)) === 6 && (await drawnSmiles()) === canonical('CCO.CCO'), `Copy and Paste from it: a second ethanol (${await drawnSmiles()})`);
    // a bond right-clicked: it horizontal or vertical (ethanol's first bond, drawn at 30°)
    await page.mouse.click(middle.x, middle.y, { button: 'right' });
    await page.getByTestId('context-snap').click();
    const angle = await state(() => {
      const b = [...olomol.doc.bonds.values()][0];
      const [p, q] = [olomol.doc.atoms.get(b.a), olomol.doc.atoms.get(b.b)];
      return Math.round((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI);
    });
    check(angle % 90 === 0 && (await drawnSmiles()) === canonical('CCO.CCO'), `the right-clicked bond horizontal or vertical (${angle}°), the molecule the same`);
    const [sx, sy] = await screen(await bondMiddle(await state(() => [...olomol.doc.bonds.keys()][0])));
    await page.mouse.click(sx, sy, { button: 'right' });
    await page.getByTestId('context-delete').click();
    check((await drawnSmiles()) === canonical('CCO'), `Delete from it: that one gone (${await drawnSmiles()})`);
    await page.mouse.click(250, 250, { button: 'right' });
    await page.waitForTimeout(200);
    const onCanvas = await items();
    check((await state(() => olomol.selection.size)) === 0 && onCanvas.some((x) => x.startsWith('Paste')) && !onCanvas.some((x) => x.startsWith('Delete')),
      `on the empty canvas: nothing selected, its own menu (${onCanvas.join(', ')})`);
    await page.keyboard.press('Escape');
    check((await page.locator('.context-menu').count()) === 0, 'Esc closes it');
  }
}
