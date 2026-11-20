// The browser check: the search bar in the bottom bar (src/ui/Search.jsx): typed into, a list above it of what the
// text can mean (a structure, an element, templates, actions, drawings and files), ↑ ↓ and Enter, Esc.
// (Name / SMILES's own behaviour, SMILES drawn as typed, mistakes said, never sent to PubChem: 01-drawing, 07-labels.)
// Run alone: npm run check -- --only search [url]
import { canonical, check, clear, drawnSmiles, notice, page, paste, state } from './harness.mjs';

const field = () => page.getByTestId('from-name-field');
const rows = () => page.locator('[data-testid=search-results] .search-row').evaluateAll((list) => list.map((row) => row.querySelector('.label')?.textContent ?? ''));
const sections = () => page.locator('[data-testid=search-results] .search-section').allTextContents();
const active = () => page.locator('[data-testid=search-results] .search-row.active .label').textContent().catch(() => '');
async function search(text) {
  await page.mouse.move(700, 120); // (the pointer away from the list: hovering a row highlights it)
  await field().focus();
  await field().fill(text);
  await page.waitForTimeout(500);
}
const focused = () => state(() => document.activeElement?.dataset?.testid ?? document.activeElement?.tagName);

export default async function run() {
  // --- / and the hint ---
  await clear();
  await page.mouse.move(700, 300);
  await page.keyboard.press('/');
  await page.waitForTimeout(200);
  check((await focused()) === 'from-name-field' && (await field().inputValue()) === '', '/ puts the cursor in the search bar (and types no /)');
  check((await page.getByTestId('search-results').count()) === 0 && /ring flip, export SVG/.test(await field().getAttribute('title')),
    'empty: no list (the field\'s placeholder and tooltip say what it takes)');
  await page.keyboard.type('e'); // (a tool's key over the canvas: here a letter typed)
  check((await state(() => olomol.tool.name)) !== 'erase' && (await field().inputValue()) === 'e', 'typing in it is typing, not the drawing\'s keys (e: not Erase)');

  // --- actions: the best first, Enter does it ---
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); // (out of the bar: a paste there is the field's)
  await paste('CCO');
  const before = await state(() => [...olomol.doc.atoms.values()].map((a) => a.x));
  await search('flip');
  const flipRows = await rows();
  check(flipRows[0] === 'Flip left–right' && flipRows.includes('Ring flip') && (await sections())[0] === 'Actions',
    `flip: the actions first, Flip left–right at the top (${flipRows.join(', ')})`);
  check((await sections()).at(-1) === 'Structure', 'and PubChem last: Enter never sends a word to PubChem that something here matches');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const after = await state(() => [...olomol.doc.atoms.values()].map((a) => a.x));
  check(after[0] !== before[0] && (await drawnSmiles()) === canonical('CCO'), 'Enter: flipped left–right, the molecule the same');
  check((await field().inputValue()) === '' && (await focused()) !== 'from-name-field' && (await page.getByTestId('search-results').count()) === 0,
    'and the bar empty again, the cursor out of it, the list gone');
  // ↑ and ↓ (the list reads upwards from the bar, the best next to it)
  await search('flip');
  const best = await page.locator('[data-testid=search-results] .search-row.active').boundingBox();
  const bar = await page.getByTestId('from-name').boundingBox();
  check(best && Math.abs(best.y + best.height - bar.y) < 30 && best.x + best.width > bar.x + bar.width / 2,
    'the best (what Enter does) right above the field, on its side of the panel');
  await page.keyboard.press('ArrowUp');
  check((await active()) === 'Flip top–bottom', `↑: the next, further up (${await active()})`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  check((await active()) === (await rows()).at(-1), `↓ from the first: round to the last (${await active()})`);
  await page.keyboard.press('Escape');
  check((await field().inputValue()) === '' && (await focused()) === 'from-name-field', 'Esc: the text gone, the cursor still there');
  await page.keyboard.press('Escape');
  check((await focused()) !== 'from-name-field', 'Esc again: out of the bar');
  // a tool
  await search('ring flip');
  await page.keyboard.press('Enter');
  check((await state(() => olomol.tool.name)) === 'ringFlip', 'ring flip, Enter: the ring flip tool');
  await search('curved');
  await page.keyboard.press('Enter');
  check(JSON.stringify(await state(() => olomol.tool)) === JSON.stringify({ name: 'curve', electrons: 2 }), 'curved, Enter: the curved arrow tool');
  // an element
  await search('Fe');
  check((await rows())[0] === 'iron (Fe): the atom tool' && !(await rows()).includes('Report a problem or an idea'), `Fe: the element first, nothing by its other words from two letters (${(await rows()).join(', ')})`);
  await page.keyboard.press('Enter');
  check(JSON.stringify(await state(() => olomol.tool)) === JSON.stringify({ name: 'atom', el: 'Fe' }), 'Enter: the atom tool for Fe');
  // ? and a part: the templates with it, only them (as the Templates window: ?Ph, ?S)
  await search('?Ph');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=search-results] .search-row').length > 0, null, { timeout: 30_000 }).catch(() => {});
  const withPh = await rows();
  check(withPh.length >= 10 && withPh.includes('Benzyl') && (await sections()).every((s) => s === 'Templates with this part') && !(await page.getByTestId('pubchem').count()),
    `?Ph: the templates with a phenyl, nothing else, no PubChem (${withPh.length}: ${withPh.slice(0, 5).join(', ')}…)`);
  await search('?S');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=search-results] .search-row .label')].some((x) => x.textContent === 'Thiol'), null, { timeout: 30_000 }).catch(() => {});
  check((await rows()).includes('Thiol'), `?S: with sulfur, Thiol among them (${(await rows()).slice(0, 4).join(', ')}…)`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check(['place', 'group'].includes(await state(() => olomol.tool.name)), `Enter: the first of them to place (${await state(() => olomol.tool.name)})`);
  await page.keyboard.press('Escape');
  await search('?zzz');
  await page.waitForTimeout(800);
  check((await rows()).length === 0 && /No template has “zzz”/.test(await page.getByTestId('search-results').textContent()), 'a part no template has: said');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // other words for things (aliases.js), in the three languages, never above a name itself
  for (const [word, wanted] of [['group', 'Group'], ['ungroup', 'Ungroup'], ['salt', 'One compound'], ['keep together', 'One compound'], ['keep apart', 'Separate'], ['smazat', 'Erase'], ['löschen', 'Erase'], ['clean up', 'Redraw'], ['cyclohexane', 'Ring of 6'], ['radical', 'unpaired electron'], ['tisk', 'PDF / Print…']]) {
    await search(word);
    check((await rows()).includes(wanted), `${word}: ${wanted} (${(await rows()).slice(0, 4).join(', ')})`);
  }
  // each align action its own picture: the grid's is not the align button's
  await search('grid');
  const icons = await page.locator('[data-testid=search-results] .search-row').evaluateAll((list) => Object.fromEntries(list.map((row) => [row.querySelector('.label').textContent, row.querySelector('.icon').innerHTML])));
  await search('align left');
  const left = await page.locator('[data-testid=search-results] .search-row').evaluateAll((list) => list.map((row) => [row.querySelector('.label').textContent, row.querySelector('.icon').innerHTML]).find(([label]) => label === 'Align left edges')?.[1]);
  check(icons['Arrange in a grid'] && left && icons['Arrange in a grid'] !== left, 'Arrange in a grid has its own picture, not the align one');
  // a panel action with nothing to act on: said what to select
  await state(() => olomol.clearSelection());
  await search('one compound');
  await page.keyboard.press('Enter');
  check(/Select two molecules or more/.test(await notice()), `One compound with nothing selected: says what to select (${await notice()})`);

  // two letters: an action only by a whole word
  await search('as');
  check(!(await rows()).includes('Save as') && !(await rows()).includes('Copy as picture'), `as: no Save as, no Copy as picture (${(await rows()).join(', ')})`);
  await search('3d');
  check((await rows()).includes('Turn in 3D'), '3d: Turn in 3D (a whole word)');
  // an element by its name, in any of the three languages
  for (const name of ['iron', 'Eisen', 'zelezo']) {
    await search(name);
    check((await rows())[0] === 'iron (Fe): the atom tool', `${name}: iron's atom tool first (${(await rows())[0]})`);
  }
  await search('chlor');
  check((await rows()).includes('chlorine (Cl): the atom tool'), `chlor: chlorine (${(await rows()).slice(0, 3).join(', ')})`);
  await search('sulphur');
  check((await rows())[0] === 'sulfur (S): the atom tool', 'sulphur: sulfur');
  // one template in two groups, or two of one name: each once, no rows left over from the search before
  await search('epoxide');
  await search('porphyrin');
  const porphyrins = await rows();
  check(!porphyrins.includes('Epoxide') && new Set(porphyrins).size === porphyrins.length, `porphyrin after epoxide: no Epoxide left, nothing twice (${porphyrins.join(', ')})`);
  const headers = await sections();
  check(new Set(headers).size === headers.length, `each section once (${headers.join(', ')})`);
  // other words for a thing
  await search('delete');
  check((await rows())[0] === 'Erase', `delete: Erase (${(await rows())[0]})`);
  // a template
  await search('Newman');
  check((await sections())[0] === 'Templates' && /Newman/.test((await rows())[0]), `Newman: the templates first (${(await rows())[0]})`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check(['place', 'group'].includes(await state(() => olomol.tool.name)), `Enter: the template to place (${await state(() => olomol.tool.name)})`);
  await page.keyboard.press('Escape');
  // a SMILES: the structure first
  await search('c1ccncc1');
  check((await sections())[0] === 'Structure' && (await page.getByTestId('smiles-preview').count()) === 1, 'a SMILES: the structure first, its picture');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 20_000 }).catch(() => {});
  await page.mouse.click(600, 400);
  await page.keyboard.press('Escape');
  check((await drawnSmiles()).includes(canonical('c1ccncc1')), 'Enter: drawn, then placed with a click');
  // a word nothing here matches: PubChem's lookup, no picture left from before
  await search('aspirinxyz');
  check((await page.getByTestId('pubchem').count()) === 1 && (await page.getByTestId('smiles-preview').count()) === 0, 'a word nothing in olomol matches: the PubChem lookup offered; no picture of the SMILES before');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // --- calm while typing a name: the panel one height, the structure never in front for a plain word ---
  await page.mouse.move(700, 120);
  await field().focus();
  await field().fill('');
  const heights = [];
  let structureFront = 0;
  for (const letter of 'aspirin') {
    await page.keyboard.type(letter);
    await page.waitForTimeout(250);
    const panel = await page.getByTestId('search-results').boundingBox();
    if (panel) heights.push(Math.round(panel.height));
    if ((await sections())[0] === 'Structure' && (await rows()).length > 2) structureFront += 1;
  }
  check(new Set(heights).size === 1, `typing aspirin: the panel keeps one height (${heights.join(', ')})`);
  check(!(await page.getByTestId('smiles-preview').count()), 'and no SMILES picture for a name (as, asp are no arsenic)');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // --- the drawings open, by name ---
  await state(() => {
    olomol.title = 'scheme one';
    olomol.emit();
  });
  await page.locator('.topbar').getByTitle('New drawing', { exact: true }).click();
  await paste('N');
  await search('scheme');
  check((await rows()).includes('Show scheme one'), `the other drawing open, by its name (${(await rows()).join(', ')})`);
  const at = (await rows()).indexOf('Show scheme one');
  for (let k = 0; k < at; k++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => olomol.title === 'scheme one', null, { timeout: 3000 }).catch(() => {});
  check((await state(() => olomol.title)) === 'scheme one', 'Enter: its tab in front');

  // --- an olomol link, or its #part, typed or pasted in: opened (the installed app has no address bar) ---
  await search('#smiles=C%23N&title=From the bar');
  check(JSON.stringify(await rows()) === '["Open the link"]', `a link's #part: one row, opening it (${(await rows()).join(', ')})`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => olomol.title === 'From the bar', null, { timeout: 10_000 }).catch(() => {});
  check((await state(() => olomol.title)) === 'From the bar' && (await drawnSmiles()) === canonical('C#N'), `Enter: the structure in a tab of its own (${await state(() => olomol.title)})`);

  // --- in Czech, without diacritics ---
  await state(() => localStorage.setItem('olomol-language', 'cs'));
  await page.reload();
  await page.waitForFunction(() => window.olomol && window.olomolTest, null, { timeout: 30_000 });
  await search('zidlicka');
  const czech = await rows();
  check(czech.includes('Překlopení židličky') && czech.some((row) => /Židlička/.test(row)), `in Czech, zidlicka: the ring flip and the chairs (${czech.join(', ')})`);
  await search('ring flip');
  check((await rows()).includes('Překlopení židličky'), 'and in English too: ring flip finds Překlopení židličky');
  await state(() => localStorage.removeItem('olomol-language'));
}
