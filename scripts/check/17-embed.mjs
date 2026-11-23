// The browser check: olomol embedded in another page (embed.html, src/features.js): the parts its address asks
// for, nothing else; the drawing from its #…; nothing kept in the browser.
// Run alone: npm run check -- --only embed [url]
// (its parts, in the order run:)
//   only=curved-arrows,charges-electrons: no tabs, files, help or settings; the rail only Select, Erase, charges, lone pairs and
//   curved arrows; no bottom bar; olomol's mark linking to olomol.org; the drawing from #smiles=, nothing to undo,
//   the curved-arrow tool to start with
//   a curved arrow drawn as anywhere (π bond to O), undone and drawn again; a charge put on
//   refused, said why, the drawing as it was: a key over an atom (element), Delete with an atom selected, a pasted
//   SMILES, the bond tool by its key, Templates by Shift+T
//   nothing of the drawing kept in the browser
//   off=structures-from-names: the full editor, but no PubChem rows in the search bar and no Export with off=export too
//   <olomol-editor> in a page around it: ready; get partsOn, smiles, inchikeys, curvedArrows (one drawn in the frame), olom, png;
//   highlight, set and a new smiles="…" not said back as changes, a student's change is; readOnly hides the tools; a wrong call says why
//   get(canonical): a methyl shift by any of three methyls the same string, another arrow another; get(what, drawing)
//   about another drawing, the one on screen untouched
//   what stands on a reaction arrow: a reagent the step's, what leaves on it a product; a molecule grown on an arrow
import { atomsByEl, bondMiddle, check, context, dragBetween, hoverAndPress, notice, page, paste, state, url } from './harness.mjs';

async function embed(query, hash) {
  const address = new URL('embed.html', url);
  address.search = `?test&${query}`;
  address.hash = hash;
  await page.goto(address.href);
  await page.waitForFunction(() => window.olomol && olomol.doc.atoms.size > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(400);
}
const shown = (selector) => page.locator(selector).count();
const railTools = () => page.locator('.rail [data-testid^=tool-]').evaluateAll((list) => list.map((b) => b.dataset.testid.slice(5)));
const refused = async (what) => /Not available here/.test(await notice()) && (await state(() => olomol.notice?.kind)) === 'error';

export default async function run() {
  await state(() => localStorage.clear());
  await embed('only=curved-arrows,charges-electrons', '#smiles=CC(=O)O.OCC');

  // --- what is there ---
  check((await shown('.tabs')) === 0 && (await shown('.topright')) === 0 && (await shown('.help-button')) === 0 && (await shown('[data-testid=new-drawing], [data-testid=open], [data-testid=save]')) === 0,
    'embedded: no tabs, no settings, no help, no New/Open/Save');
  check(JSON.stringify(await railTools()) === JSON.stringify(['select', 'erase', 'charge', 'pairs', 'curve']), `the rail: only Select, Erase, charges, lone pairs, curved arrows (${await railTools()})`);
  check((await shown('.dock')) === 0 && (await shown('[data-testid=export], [data-testid=relayout], [data-testid=turn3d], [data-testid=align], [data-testid=projections]')) === 0,
    'no bottom bar (elements, rings, templates, search), no Export, Redraw, Turn in 3D, Align, projections');
  check((await page.getByTestId('embed-mark').getAttribute('href')) === 'https://olomol.org/', "olomol's mark, a link to olomol.org");
  check((await state(() => [olomol.doc.atoms.size, olomol.doc.bonds.size, olomol.undoStack.length, olomol.tool.name])).join() === '7,5,0,curve',
    'the drawing from #smiles=: acetic acid and ethanol, nothing to undo, the curved-arrow tool (no bonds to draw)');

  // --- what may be done ---
  const [carbonyl] = await state(() => [...olomol.doc.bonds.values()].filter((b) => b.order === 2).map((b) => b.id));
  const [, , alcohol] = await atomsByEl('O');
  await state(() => olomol.setTool({ name: 'curve', electrons: 2 }));
  await dragBetween(await bondMiddle(carbonyl), await state((id) => [olomol.doc.atoms.get(id).x, olomol.doc.atoms.get(id).y], alcohol));
  check((await state(() => olomol.doc.curves.size)) === 1, 'a curved arrow drawn with the mouse (π bond to an O)');
  await state(() => olomol.undo());
  check((await state(() => olomol.doc.curves.size)) === 0, 'undone');
  await state(() => olomol.redo());
  await state(() => olomol.setTool({ name: 'charge', delta: -1 }));
  const [x, y] = await state((id) => { const a = olomol.doc.atoms.get(id); return [a.x * olomol.view.scale + olomol.view.tx, a.y * olomol.view.scale + olomol.view.ty]; }, alcohol);
  await page.mouse.click(x, y);
  check((await state((id) => olomol.doc.atoms.get(id).charge, alcohol)) === -1, 'a charge put on with its tool');

  // --- what is refused, wherever it comes from ---
  const before = await state(() => JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.el, a.charge])) + olomol.doc.bonds.size);
  const same = async () => (await state(() => JSON.stringify([...olomol.doc.atoms.values()].map((a) => [a.el, a.charge])) + olomol.doc.bonds.size)) === before;
  await state(() => olomol.setTool({ name: 'select' }));
  await hoverAndPress(await state((id) => [olomol.doc.atoms.get(id).x, olomol.doc.atoms.get(id).y], alcohol), 'n');
  check((await same()) && (await refused()), 'N over an O: refused, said why');
  await state((id) => {
    olomol.selection = new Set([id]);
    olomol.emit();
  }, alcohol);
  await page.keyboard.press('Delete');
  check((await same()) && (await state((id) => olomol.doc.atoms.has(id), alcohol)) && (await refused()), 'Delete with an atom selected: refused');
  await state(() => olomol.clearSelection());
  await page.mouse.move(5, 200);
  await state(() => window.olomolTest.paste('c1ccccc1'));
  await page.waitForTimeout(300);
  check((await same()) && (await state(() => olomol.tool.name)) === 'select' && (await refused()), 'a SMILES pasted: refused');
  await page.keyboard.press('1');
  check((await state(() => olomol.tool.name)) === 'select' && (await refused()), 'the bond tool by its key: not picked');
  await page.keyboard.press('Shift+T');
  await page.waitForTimeout(200);
  check((await shown('.templates-window, [role=dialog]')) === 0, 'Templates by Shift+T: not opened');

  // --- nothing kept ---
  await page.waitForTimeout(900);
  const kept = await state(() => Object.keys(localStorage).filter((key) => key.startsWith('olomol')));
  check(kept.length === 0, `nothing kept in the browser (${kept.join(', ') || 'nothing'})`);

  // --- all but some ---
  await embed('off=structures-from-names,export', '#smiles=c1ccccc1');
  check((await railTools()).includes('bond') && (await shown('.dock')) === 1 && (await shown('[data-testid=export]')) === 0 && (await shown('[data-testid=relayout]')) === 1,
    'off=structures-from-names,export: the full editor, without Export');
  await page.getByTestId('from-name-field').fill('caffeine');
  await page.waitForTimeout(600);
  check((await shown('[data-testid=pubchem], [data-testid=pubchem-open]')) === 0, 'a name typed in the search bar: no PubChem rows');
  await page.getByTestId('from-name-field').fill('');

  // --- <olomol-editor> in a page ---
  // (a page of olomol's own site: one made up here counts to Chrome as from the internet, which may not load from
  // this computer, whatever its name; from another site it was tried by hand, 2026-11-19)
  const host = new URL('host-page.html', url).href;
  await page.route(host, (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8">
    <script src="${new URL('embed.js', url).href}"></script>
    <olomol-editor id="q" only="curved-arrows,charges-electrons" smiles="CC(=O)O.OCC" height="420"></olomol-editor>
    <script>window.changes = 0; window.errors = [];
      const q = document.getElementById('q');
      q.addEventListener('change', (e) => { window.changes++; window.changed = e.detail.changed; });
      q.addEventListener('ready', (e) => { window.readyDetail = e.detail; });
      q.addEventListener('error', (e) => window.errors.push(e.detail.message));</script>` }));
  await page.goto(host);
  const q = (fn, arg) => page.evaluate(fn, arg);
  await q(() => document.getElementById('q').ready);
  check(JSON.stringify(await q(() => document.getElementById('q').get('partsOn'))) === '["curved-arrows","charges-electrons"]', '<olomol-editor> in a page: ready, its parts');
  check((await q(() => document.getElementById('q').get('smiles'))) === 'CC(=O)O.CCO', 'get(smiles): the drawing from smiles="…"');
  const keys = (await q(() => document.getElementById('q').get('inchikeys'))).split('\n').sort();
  check(JSON.stringify(keys) === JSON.stringify(['LFQSCWFLJHTTHZ-UHFFFAOYSA-N', 'QTBSBXVTEAMEQO-UHFFFAOYSA-N']), `get(inchikey): ethanol's and acetic acid's, one a line (${keys})`);
  const frame = page.frames().find((f) => f.url().includes('embed.html'));
  const [bondId, oId] = await frame.evaluate(() => {
    const d = olomol.doc;
    const b = [...d.bonds.values()].find((x) => x.order === 2);
    const o = [...d.atoms.values()].filter((a) => a.el === 'O').at(-1);
    olomol.change((doc) => {
      const id = doc.nextId++;
      doc.curves.set(id, { id, electrons: 2, from: { bond: b.id }, to: { atom: o.id }, color: null });
    });
    return [[b.a, b.b].sort((x, y) => x - y), o.id];
  });
  await page.waitForTimeout(400);
  const arrows = await q(() => document.getElementById('q').get('curvedArrows'));
  check(arrows.length === 1 && JSON.stringify(arrows[0].from) === JSON.stringify({ bond: bondId }) && JSON.stringify(arrows[0].to) === JSON.stringify({ atom: oId }) && arrows[0].electrons === 2,
    `get(arrows): the student's arrow by atom ids (${JSON.stringify(arrows)})`);
  check((await q(() => window.changes)) === 1 && JSON.stringify(await q(() => window.changed)) === '["curvedArrows"]', `the student's change: said to the page, with what changed (${await q(() => JSON.stringify(window.changed))})`);
  const ready = await q(() => window.readyDetail);
  check(ready?.protocol === 1 && ready.version && ready.drawing === 'address' && !ready.error && ready.partsOn.length === 2, `ready: olomol's version, the protocol, the parts, the drawing from the address (${JSON.stringify(ready)})`);
  check((await q(() => document.getElementById('q').get('version'))).protocol === 1, "get('version')");
  const olom = await q(() => document.getElementById('q').get('olom'));
  check(olom.atoms?.length === 7 && olom.atoms.some((a) => a.id === oId), 'get(olom): the drawing with its atom ids');
  check(/^data:image\/png;base64,/.test(await q(() => document.getElementById('q').get('png'))), 'get(png): a picture');
  await q((ids) => document.getElementById('q').highlight(ids, '#fecaca'), bondId);
  check((await frame.evaluate((ids) => ids.map((id) => olomol.doc.atoms.get(id).highlight), bondId)).every((h) => h === '#fecaca'), 'highlight: the atoms marked');
  await q(() => document.getElementById('q').readOnly(true));
  await page.waitForTimeout(300);
  check((await frame.locator('.rail').count()) === 0 && (await frame.locator('.inspector').count()) === 0, 'readOnly(true): no tools, no panel');
  await q(() => document.getElementById('q').set('c1ccccc1O'));
  await page.waitForTimeout(400);
  check((await q(() => document.getElementById('q').get('smiles'))) === 'Oc1ccccc1' && (await q(() => window.changes)) === 1, 'set: another drawing; the page\'s own highlight and set not said back as changes');
  await q(() => document.getElementById('q').setAttribute('smiles', 'CCO'));
  await page.waitForFunction(() => document.getElementById('q').get('smiles').then((smiles) => smiles === 'CCO').catch(() => false), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(400);
  check((await q(() => document.getElementById('q').get('smiles'))) === 'CCO' && (await q(() => window.changes)) === 1, 'another smiles="…": that drawing, not said back as a change');
  // the canonical form: a methyl shift with any of the three methyls the same, another arrow not
  await q(() => document.getElementById('q').set('C[CH+]C(C)(C)C'));
  const shift = (which) => frame.evaluate((which) => {
    const d = olomol.doc;
    const degree = (id) => [...d.bonds.values()].filter((x) => x.a === id || x.b === id).length;
    const centre = [...d.atoms.values()].find((a) => degree(a.id) === 4);
    const cation = [...d.atoms.values()].find((a) => a.charge === 1);
    const bonds = which === 'wrong' ? [...d.bonds.values()].filter((x) => x.a === cation.id || x.b === cation.id).slice(0, 1)
      : [...d.bonds.values()].filter((x) => (x.a === centre.id || x.b === centre.id) && degree(x.a === centre.id ? x.b : x.a) === 1);
    olomol.change((doc) => {
      doc.curves.clear();
      const id = doc.nextId++;
      doc.curves.set(id, { id, electrons: 2, from: { bond: bonds[which === 'wrong' ? 0 : which].id }, to: { atom: cation.id } });
    });
  }, which);
  const forms = [];
  for (const which of [0, 1, 2, 'wrong']) {
    await q(() => document.getElementById('q').readOnly(false));
    await shift(which);
    forms.push(await q(() => document.getElementById('q').get('canonicalForms')));
  }
  // about another drawing, read on the side: the one on screen untouched
  const onScreen = await q(() => document.getElementById('q').get('smiles'));
  const other = await q(() => document.getElementById('q').get('inchikeys', 'CCO'));
  check(other === 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N' && (await q(() => document.getElementById('q').get('smiles'))) === onScreen, 'get(inchikey, drawing): about another drawing, the one on screen as it was');
  const olomNow = await q(() => document.getElementById('q').get('olom'));
  check(JSON.stringify((await q((o) => document.getElementById('q').get('canonicalForms', o), olomNow)).step) === JSON.stringify(forms[3].step), 'get(canonical, drawing): the same as of the drawing itself');
  check(forms[0].step && forms[0].step === forms[1].step && forms[1].step === forms[2].step && forms[3].step !== forms[0].step && forms[0].curvedArrows.length === 1 && forms[0].products === null,
    `get(canonical): a methyl shift with any of the three methyls the same, from another bond not (${forms.map((f) => f.step).join(' / ')})`);
  check(/ask for curvedArrows/.test(await q(() => document.getElementById('q').get('nonsense').catch((e) => e.message))), 'a wrong call: said why');
  // which atoms are alike (the three methyls of the t-butyl), and each molecule's canonical SMILES
  const alike = await q(async () => {
    const e = document.getElementById('q');
    const olom = await e.get('olom', 'CC(C)(C)O.C=CC[O-]');
    const classes = await e.get('atomClasses', olom);
    const methyls = olom.atoms.filter((a) => a.element === 'C' && olom.bonds.filter((b) => b.atoms.includes(a.id)).length === 1 && olom.bonds.some((b) => b.atoms.includes(a.id) && olom.atoms.find((x) => x.id === b.atoms.find((y) => y !== a.id)).element === 'C' && olom.bonds.filter((c) => c.atoms.includes(b.atoms.find((y) => y !== a.id))).length === 4));
    return { methyls: new Set(methyls.map((a) => classes[a.id])).size, count: methyls.length, smiles: await e.get('canonicalSmiles', 'CC(C)(C)O.C=CC[O-]') };
  });
  check(alike.count === 3 && alike.methyls === 1 && alike.smiles === 'CC(C)(C)O\nC=CC[O-]', `get(atomClasses): the t-butyl's three methyls one class; get(canonicalSmiles): one a line (${JSON.stringify(alike)})`);

  // --- the parts at runtime, locked atoms, pick, highlights of more than atoms, messages, errors ---
  const ed = (call, ...args) => q(([call, args]) => document.getElementById('q')[call](...args).then((r) => ({ r }), (e) => ({ e: e.message })), [call, args]);
  check(JSON.stringify((await ed('setParts', { only: ['structure', 'arrows'] })).r) === '["structure","curved-arrows"]' && (await frame.locator('[data-testid=tool-bond]').count()) === 1,
    'setParts: other parts without reloading (an old name read as the new), their tools there');
  check(/unknown parts: nonsense/.test((await ed('setParts', { only: 'nonsense' })).e ?? ''), 'setParts with an unknown name: an error, nothing switched');
  await ed('set', 'CCO', { locked: true });
  const lockedIds = await frame.evaluate(() => [...olomol.doc.atoms.keys()]);
  const tryChange = (fn) => frame.evaluate((fn) => {
    const before = olomol.doc.atoms.size + '/' + olomol.doc.bonds.size;
    olomol.change(new Function('doc', fn));
    return [before, olomol.doc.atoms.size + '/' + olomol.doc.bonds.size, olomol.notice?.text ?? ''];
  }, fn);
  const deleted = await tryChange(`doc.atoms.delete(${lockedIds[0]}); for (const [id, b] of doc.bonds) if (b.a === ${lockedIds[0]} || b.b === ${lockedIds[0]}) doc.bonds.delete(id);`);
  const bonded = await tryChange(`const id = doc.nextId++; doc.atoms.set(id, { id, x: 5, y: 5, el: 'C' }); const b = doc.nextId++; doc.bonds.set(b, { id: b, a: ${lockedIds[0]}, b: id, order: 1 });`);
  const apart = await tryChange(`const id = doc.nextId++; doc.atoms.set(id, { id, x: 5, y: 5, el: 'N' });`);
  check(deleted[0] === deleted[1] && /given/.test(deleted[2]) && bonded[0] === bonded[1] && apart[1] === '4/2',
    `lock: a locked atom not taken away, nothing bonded to it, said why; a new molecule beside it drawn (${JSON.stringify([deleted, bonded, apart])})`);
  await ed('lock', null);
  await tryChange(`doc.atoms.get(${lockedIds[0]}).el = 'N';`);
  check((await frame.evaluate((id) => olomol.doc.atoms.get(id).el, lockedIds[0])) === 'N', 'lock(null): changed again');
  await ed('set', 'CC(=O)O', { only: 'curved-arrows' });
  check(JSON.stringify((await ed('get', 'partsOn')).r) === '["curved-arrows"]', 'set(drawing, { only }): the drawing and its parts in one call');
  // pick: an atom and a bond, clicked in the frame
  const box = await page.locator('olomol-editor iframe').boundingBox();
  const onScreenAt = (p) => frame.evaluate(([x, y]) => [x * olomol.view.scale + olomol.view.tx, y * olomol.view.scale + olomol.view.ty], p);
  const [carbonylO, cc] = await frame.evaluate(() => {
    const d = olomol.doc;
    const o = [...d.bonds.values()].find((b) => b.order === 2);
    const oId = d.atoms.get(o.a).el === 'O' ? o.a : o.b;
    const single = [...d.bonds.values()].find((b) => d.atoms.get(b.a).el === 'C' && d.atoms.get(b.b).el === 'C');
    const at = (id) => [d.atoms.get(id).x, d.atoms.get(id).y];
    return [{ id: oId, at: at(oId) }, { ends: [single.a, single.b].sort((x, y) => x - y), at: [(at(single.a)[0] + at(single.b)[0]) / 2, (at(single.a)[1] + at(single.b)[1]) / 2] }];
  });
  await q(() => { window.picked = document.getElementById('q').pick({ kinds: ['atom', 'bond'], count: 2 }); });
  await page.waitForTimeout(200);
  for (const at of [carbonylO.at, cc.at]) {
    const [sx, sy] = await onScreenAt(at);
    await page.mouse.click(box.x + sx, box.y + sy);
    await page.waitForTimeout(150);
  }
  const picked = await q(() => window.picked);
  check(JSON.stringify(picked) === JSON.stringify([{ atom: carbonylO.id }, { bond: cc.ends }]) && (await frame.evaluate((id) => olomol.doc.atoms.get(id).highlight, carbonylO.id)) && (await q(() => window.changes)) === 1,
    `pick: the atom and the bond clicked, marked, not said as a change (${JSON.stringify(picked)})`);
  await q(() => { window.cancelled = document.getElementById('q').pick().catch((e) => e.message); });
  await page.waitForTimeout(200);
  await frame.locator('body').press('Escape');
  check((await q(() => window.cancelled)) === 'olomol: pick cancelled' && (await frame.evaluate(() => olomol.tool.name)) !== 'pick', 'pick, then Esc: rejected, the tool back');
  // a second pick while the first waits: the first rejected, the second answered by the next click
  await q(() => {
    const e = document.getElementById('q');
    window.first = e.pick().catch((error) => error.message);
    window.second = e.pick({ kinds: ['atom'] }).catch((error) => `rejected: ${error.message}`);
  });
  await page.waitForTimeout(200);
  const [ox, oy] = await onScreenAt(carbonylO.at);
  await page.mouse.click(box.x + ox, box.y + oy);
  await page.waitForTimeout(150);
  const [first, second] = await q(() => Promise.all([window.first, window.second]));
  check(first === 'olomol: pick cancelled' && JSON.stringify(second) === JSON.stringify([{ atom: carbonylO.id }]), `a pick while another waits: the first rejected, the second answered (${JSON.stringify([first, second])})`);
  await ed('highlight', 'all', null);
  // a colour that isn't one, from the page or in a drawing it gives: refused, or left out; never in the markup
  const evil = 'red"/><image href="x" onerror="window.parent.injected=1';
  const badHighlight = await ed('highlight', 'all', evil);
  const badPick = await ed('pick', { colour: evil });
  check(/a colour is a hex colour/.test(badHighlight.e ?? '') && /a colour is a hex colour/.test(badPick.e ?? '') && (await frame.evaluate(() => [...olomol.doc.atoms.values()].every((a) => !a.highlight))),
    `highlight and pick with a colour that isn't one: refused, nothing marked (${badHighlight.e})`);
  await ed('set', { format: 'olom', version: '1.1', atoms: [{ id: 1, el: 'O', x: 0, y: 0, color: evil, highlight: evil }, { id: 2, el: 'C', x: 1, y: 0 }], bonds: [{ id: 3, a: 1, b: 2, color: evil }] });
  await page.waitForTimeout(300);
  check((await frame.evaluate(() => [...olomol.doc.atoms.values(), ...olomol.doc.bonds.values()].every((x) => !x.color && !x.highlight))) && (await frame.locator('image[onerror]').count()) === 0 && !(await q(() => window.injected)),
    "a drawing given with colours that aren't ones: drawn without them, nothing of them in the markup");
  await ed('set', 'CC(=O)O', { only: 'curved-arrows' });
  // highlights of curved arrows and bonds; 'all', null clears
  const curveId = await frame.evaluate(() => {
    let id;
    olomol.change((doc) => {
      id = doc.nextId++;
      const o = [...doc.atoms.values()].find((a) => a.el === 'O');
      const b = [...doc.bonds.values()].find((x) => x.order === 2);
      doc.curves.set(id, { id, electrons: 2, from: { bond: b.id }, to: { atom: o.id }, color: null });
    });
    return id;
  });
  await ed('highlight', { curvedArrows: [curveId], bonds: [cc.ends] }, '#ff0000');
  await page.waitForTimeout(200);
  const marked = await frame.evaluate((id) => [olomol.doc.curves.get(id).highlight, [...olomol.doc.bonds.values()].filter((b) => b.highlight === '#ff0000').length], curveId);
  check(marked[0] === '#ff0000' && marked[1] === 1 && (await frame.locator('polyline[stroke="#ff0000"]').count()) === 1, `highlight({ curvedArrows, bonds }): the arrow with a band along it, the bond (${marked})`);
  await ed('highlight', 'all', null);
  check((await frame.evaluate(() => [...olomol.doc.atoms.values(), ...olomol.doc.bonds.values(), ...olomol.doc.curves.values()].every((x) => !x.highlight))), "highlight('all', null): every mark gone");
  await ed('showMessage', 'Right: the π bond.', { kind: 'success' });
  check((await frame.locator('.notice.success').textContent().catch(() => '')) === 'Right: the π bond.', "showMessage: the page's words in olomol's bubble");
  // a drawing the address gives that can't be read: an error event
  await q(() => document.getElementById('q').setAttribute('smiles', 'C1CC(('));
  await page.waitForFunction(() => window.errors.length > 0, null, { timeout: 15_000 }).catch(() => {});
  check((await q(() => window.errors.length)) > 0, `an address whose drawing can't be read: an error event (${await q(() => window.errors[0])})`);
  await page.unroute(host);

  // --- what stands on a reaction arrow (canonical forms' sides) ---
  await page.goto(new URL('?test', url).href);
  await page.waitForFunction(() => window.olomol && window.olomolTest, null, { timeout: 30_000 });

  // what stands on a reaction arrow: H3O+ on it is the step's (an arrow to its H, from its O–H bond), the water out on
  // a side arc and − H2O written on it are products
  const onArrow = await page.evaluate(async () => {
    const { sidesOf } = await import('/src/embed/sides.js');
    const { canonicalForms } = await import('/src/embed/canonical.js');
    const { getRDKit } = await import('/src/io/rdkit.js');
    const { addAtom, addBond, emptyDoc } = await import('/src/model/doc.js');
    const doc = emptyDoc();
    const o = addAtom(doc, 0, 0, 'O');
    addBond(doc, o.id, addAtom(doc, -1, 0, 'C').id, 1);
    const arrow = doc.nextId++;
    doc.arrows.set(arrow, { id: arrow, x1: 2, y1: 0, x2: 6, y2: 0, kind: 'forward', sides: [{ id: doc.nextId++, side: 'below', way: 'out', reach: 1.3 }] });
    const w = addAtom(doc, 4, -1, 'O', { charge: 1, arrow, arrowSlot: 'above' });
    const hs = [0, 1, 2].map((k) => addAtom(doc, 4 + k * 0.5, -2, 'H', { arrow, arrowSlot: 'above' }));
    const bonds = hs.map((h) => addBond(doc, w.id, h.id, 1));
    const out = addAtom(doc, 4, 1, 'O', { arrow, arrowSlot: 'below-out' });
    const minus = addAtom(doc, 4, -3, 'O', { arrow, arrowSlot: 'above', arrowSign: '−' });
    const product = addAtom(doc, 8, 0, 'O', { charge: 1 });
    addBond(doc, product.id, addAtom(doc, 7, 0, 'C').id, 1);
    for (const [from, to] of [[{ atom: o.id, pair: 0 }, { atom: hs[0].id }], [{ bond: bonds[0].id }, { atom: w.id }]]) {
      const id = doc.nextId++;
      doc.curves.set(id, { id, electrons: 2, from, to });
    }
    const sides = sidesOf(doc);
    const forms = canonicalForms(doc, await getRDKit(), sides);
    return { step: sides.step.includes(w.id) && !sides.step.includes(out.id), products: [out.id, minus.id, product.id].every((id) => sides.products.includes(id)), forms: forms.curvedArrows.length, smiles: forms.products };
  });
  // a molecule on an arrow grown there (a bond pulled out of it): the new atom on the arrow too, as the molecule is
  const grown = await state(() => {
    olomol.setDoc((() => { const d = olomol.doc; d.atoms.clear(); d.bonds.clear(); d.arrows.clear(); d.curves.clear(); return d; })());
    let added;
    olomol.change((doc) => {
      const arrow = doc.nextId++;
      doc.arrows.set(arrow, { id: arrow, x1: 0, y1: 0, x2: 4, y2: 0, kind: 'forward' });
      const a = doc.nextId++;
      doc.atoms.set(a, { id: a, el: 'C', x: 2, y: -1, charge: 0, arrow, arrowSlot: 'above', arrowOrder: 0 });
      added = doc.nextId++;
      doc.atoms.set(added, { id: added, el: 'O', x: 3, y: -1, charge: 0 });
      const b = doc.nextId++;
      doc.bonds.set(b, { id: b, a, b: added, order: 1 });
    });
    const atom = olomol.doc.atoms.get(added);
    return [atom.arrow != null, atom.arrowSlot];
  });
  check(grown[0] && grown[1] === 'above', `a molecule on an arrow grown there: all of it on the arrow (${grown})`);
  check(onArrow.step && onArrow.products && onArrow.forms === 2 && onArrow.smiles === 'C[OH2+].O.O',
    `on the arrow: H3O+ the step's, both its arrows counted; the water out on the arc and − H2O products (${JSON.stringify(onArrow)})`);

  // --- olomol.org's Export → Embed in a page: the code for this drawing, the parts chosen; the address it writes opens so ---
  const site = new URL(url);
  site.search = '?test';
  site.hash = '';
  await page.goto(site.href);
  await page.waitForFunction(() => window.olomolTest);
  // (once the drawings kept in the browser are back, a drawing of its own)
  await page.waitForTimeout(1500);
  await state(() => olomol.setDoc({ atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), nextId: 1 }));
  await state(() => window.olomolTest.paste('CC(=O)O.OCC'));
  await page.waitForFunction(() => olomol.doc.atoms.size === 7, null, { timeout: 30_000 });
  await page.getByTestId('export').click();
  await page.getByTestId('embed').click();
  await page.getByTestId('embed-dialog').waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid=embed-iframe]')?.value.includes('#d='), null, { timeout: 10_000 });
  const codeOf = (id) => page.getByTestId(id).inputValue();
  const iframe = await codeOf('embed-iframe');
  const address = iframe.match(/src="([^"]+)"/)?.[1] ?? '';
  await page.getByTestId('embed-kind-element').click();
  const element = await codeOf('embed-element');
  await page.getByTestId('embed-kind-iframe').click();
  check(/embed\.html\?only=charges-electrons,curved-arrows#d=/.test(address) && /^<iframe /.test(iframe) && element.includes(`<olomol-editor src="${address}"`) && element.includes('embed.js"></script>'),
    `Embed in a page: an iframe and <olomol-editor> with the same address, curved arrows and charges, this drawing (${address.slice(0, 80)}…)`);
  await page.getByTestId('embed-part-structures-from-names').check();
  const withPubchem = (await codeOf('embed-iframe')).match(/only=([^#"]*)/)?.[1];
  await page.getByTestId('embed-look').click();
  const look = (await codeOf('embed-iframe')).match(/embed\.html([^#"]*)/)?.[1];
  await page.getByTestId('embed-all').click();
  const all = (await codeOf('embed-iframe')).match(/embed\.html([^#"]*)/)?.[1];
  await page.getByTestId('embed-all').click();
  await page.getByTestId('embed-part-structures-from-names').uncheck();
  const allButPubchem = (await codeOf('embed-iframe')).match(/only=([^#"]*)/)?.[1] ?? '';
  check(withPubchem === 'charges-electrons,curved-arrows,structures-from-names' && look === '?readonly' && all === '' && !allButPubchem.includes('structures-from-names') && allButPubchem.split(',').length === 16,
    `PubChem a tick of its own; Only to look at ?readonly; Everything no ?only, without PubChem every other part (${[withPubchem, look, all, allButPubchem.split(',').length].join(' | ')})`);
  // from Only to look at, a part ticked is the only one on; Empty: no drawing in the address
  await page.getByTestId('embed-look').click();
  await page.getByTestId('embed-part-turn-in-3d').check();
  const fromLook = (await codeOf('embed-iframe')).match(/embed\.html([^#"]*)/)?.[1];
  await page.getByTestId('embed-start-empty').click();
  const empty = await codeOf('embed-iframe');
  await page.getByTestId('embed-start-drawing').click();
  check(fromLook === '?only=turn-in-3d' && !empty.includes('#d='), `from Only to look at, Turn in 3D ticked: only it on; Empty: no drawing in the code (${fromLook})`);
  // Try it: the editor of the code in the dialog, at its height, its tools
  await page.getByTestId('embed-arrows').click();
  await page.locator('.embed input[type=number]').fill('340');
  await page.getByTestId('embed-try').click();
  const tryout = page.locator('[data-testid=embed-tryout] iframe');
  await tryout.waitFor({ timeout: 10_000 });
  const inside = await (await tryout.elementHandle()).contentFrame();
  await inside.waitForFunction(() => window.olomol && olomol.doc.atoms.size > 0, null, { timeout: 30_000 });
  const triedOut = [Math.round((await tryout.boundingBox()).height), await inside.evaluate(() => olomol.doc.atoms.size), await inside.locator('.rail [data-testid^=tool-]').evaluateAll((list) => list.map((b) => b.dataset.testid.slice(5)).join())];
  check(triedOut[0] === 340 && triedOut[1] === 7 && triedOut[2] === 'select,erase,charge,pairs,curve', `Try it: the editor in the dialog, 340 px high, the drawing, only the tools chosen (${triedOut})`);
  // (Esc: the try-out closed, the dialog still open)
  await page.keyboard.press('Escape');
  check((await page.getByTestId('embed-tryout').count()) === 0 && (await page.getByTestId('embed-dialog').count()) === 1, 'Esc: the try-out closed, the dialog still there');
  const opened = await context.newPage();
  const tried = new URL(address);
  tried.search = `${tried.search}&test`;
  await opened.goto(tried.href);
  await opened.waitForFunction(() => window.olomol && olomol.doc.atoms.size > 0, null, { timeout: 30_000 });
  await opened.waitForFunction(() => olomol.doc.atoms.size === 7, null, { timeout: 10_000 }).catch(() => {});
  const there = await opened.evaluate(() => [olomol.doc.atoms.size, [...document.querySelectorAll('.rail [data-testid^=tool-]')].map((b) => b.dataset.testid.slice(5)).join()]);
  check(there[0] === 7 && there[1] === 'select,erase,charge,pairs,curve', `the address opened: the drawing, and only curved arrows and charges on the rail (${there})`);
  await opened.close();
  await page.keyboard.press('Escape');
}
