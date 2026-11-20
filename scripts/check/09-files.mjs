// The browser check: Files: saving, opening, exporting, links, XYZ.
// Run alone: npm run check -- --only files [url]

import { readdirSync, readFileSync } from 'node:fs';
import {
  browser, canonical, check, clear, ctrlO, curveNames, drawnSmiles, exportFile, inFirefox, login, page, paste,
  state, unlock, url,
} from './harness.mjs';
// (its parts, in the order run:)
//   a drawing in a link
//   files
//   other programs' files: an RXN with agents, a CDXML with ChemDraw's hydrogens and labels
//   XYZ in the background: a panel while it works, the page free, Cancel, and Save when ready
//   XYZ of a metal complex: built by UFF as Turn in 3D builds it (ZnTPP as pasted); one it can't build said
//   XYZ: stereocentres left open are said; a selection with labels exports
//   what a format has no place for: said in the Export menu and after the export
//   a dative bond in SMILES (N->[Pt], RDKit's): read as one, not as a reaction; written as standard SMILES, with a dot
//   a picture pasted (no text on the clipboard): said, not the last copy pasted again
//   a change made just before the page is reloaded: kept
//   only the selection exported as SVG: the drawing inside it in the drawing's own style, not the settings'
//   an SVG's source pasted: the drawing inside it
//   KET for Ketcher: Indigo reads the molecules olomol's SMILES has (labels, Haworth stereo); olomol reads its
//   labels and Haworth bonds back
//   every example as SMILES: standard SMILES (no RDKit or Indigo notation of their own), read by Indigo as the
//   same molecules (another program's reader, not the one that wrote it)
export default async function run() {
  await whatFormatsLose();
  await reviewedFiles();

  // --- a drawing in a link ---
  await clear();
  await paste('CC(=O)Oc1ccccc1C(=O)O');
  const link = await state(() => window.olomolTest.link());
  const linked = await browser.newPage({ viewport: { width: 1400, height: 900 }, ...login });
  const target = new URL(link);
  target.search = '?test';
  await linked.goto(target.href);
  await unlock(linked);
  await linked.waitForFunction(() => window.olomol && olomol.doc.atoms.size === 13, null, { timeout: 30_000 }).catch(() => {});
  const fromLink = await linked.evaluate(() => ({ atoms: olomol.doc.atoms.size, hash: location.hash }));
  check(fromLink.atoms === 13 && !fromLink.hash && link.length < 2000, `a link carries the drawing (${link.length} characters) and opens it`);
  await linked.close();
  // a link with structures written in it, as llms.txt tells chatbots: each in a tab of its own, with its title,
  // a raw # and an encoded one alike, a reaction with its agent (H+) over the arrow; the address cleaned afterwards
  const written = await browser.newPage({ viewport: { width: 1400, height: 900 }, ...login });
  const plain = new URL(url.href);
  plain.hash = 'title=Nitrile&smiles=N#CC.[Na+]&smiles=CC(=O)O.OCC>[H+]>CC(=O)OCC.O&title=Ester&smiles=C%23C';
  await written.goto(plain.href);
  await unlock(written);
  await written.waitForFunction(() => window.olomol && olomol.tabs.length === 3 && olomol.notice?.text.includes('3 drawings'), null, { timeout: 30_000 }).catch(() => {});
  const fromText = await written.evaluate(async () => {
    const { showTab } = await import('/src/ui/tabs.js');
    const seen = [];
    for (const tab of [...olomol.tabs]) {
      await showTab(olomol, tab.id);
      seen.push({ title: olomol.title, molfile: window.olomolTest.molfile(), arrows: olomol.doc.arrows.size });
    }
    return { seen, hash: location.hash };
  });
  const [nitrile, ester, ethyne] = fromText.seen;
  check(nitrile?.title === 'Nitrile' && canonical(nitrile.molfile) === canonical('N#CC.[Na+]') && ester?.title === 'Ester' && ester.arrows === 1 && canonical(ester.molfile) === canonical('CC(=O)O.OCC.CC(=O)OCC.O.[H+]')
    && canonical(ethyne?.molfile ?? '') === canonical('C#C') && !fromText.hash,
    `a link with structures written in it: each in a tab with its title, # raw or %23, the reaction's agent over its arrow (${JSON.stringify(fromText.seen.map(({ title, arrows }) => [title, arrows]))})`);
  // a link pasted into a window where olomol is open already: only the #part changes, no new page; read all the same
  await written.goto(`${url.href}#smiles=CCO&title=Pasted`);
  await written.waitForFunction(() => olomol.title === 'Pasted', null, { timeout: 10_000 }).catch(() => {});
  const pasted = await written.evaluate(() => ({ title: olomol.title, tabs: olomol.tabs.length, hash: location.hash }));
  check(pasted.title === 'Pasted' && pasted.tabs === 4 && !pasted.hash, `a link pasted into a window with olomol open: a tab of its own beside the others (${JSON.stringify(pasted)})`);
  await written.close();

  // --- files ---
  await clear();
  const fixture = readFileSync(new URL('../../tests/fixtures/ketcher-version.ket', import.meta.url), 'utf8');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTitle(/^Open a file/).click();
  await (await chooser).setFiles({ name: 'old.ket', mimeType: 'application/json', buffer: Buffer.from(fixture) });
  await page.waitForFunction(() => olomol.doc.curves.size === 2, null, { timeout: 10_000 }).catch(() => {});
  check((await curveNames()) === 'O-->C, bond->O', `a KET file of the Ketcher-based version opens with its arrows tied to atoms (${await curveNames()})`);
  await page.screenshot({ path: 'test-output/opened-old.png' });
  const download = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const suggested = await page.getByTestId('file-name').inputValue();
  check(suggested === 'old', `saving asks for a name, the opened file's by default (${suggested})`);
  await page.getByTestId('file-name').fill('mechanism 1');
  await page.keyboard.press('Enter');
  const savedFile = await download;
  const saved = readFileSync(await savedFile.path(), 'utf8');
  check(savedFile.suggestedFilename() === 'mechanism 1.olom' && JSON.parse(saved).format === 'olom' && JSON.parse(saved).electronArrows?.length === 2
    && JSON.parse(saved).electronArrows.every((arrow) => arrow.curve?.length === 4 && arrow.tip?.length === 2),
    `Ctrl+S saves ${savedFile.suggestedFilename()}: olomol's own file, its curved arrows in it with the curves drawn`);
  // (the name field gone first: keys typed into a field are not shortcuts)
  await page.getByTestId('file-name').waitFor({ state: 'detached' });
  await clear();
  // Ctrl+O, right after a download (see ctrlO)
  await (await ctrlO()).setFiles({ name: 'drawing.olom', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await page.waitForFunction(() => olomol.doc.curves.size === 2, null, { timeout: 10_000 }).catch(() => {});
  check((await curveNames()) === 'O-->C, bond->O', 'the saved file opens again with its arrows');
  if (!inFirefox) { // (Playwright can't give Firefox clipboard permissions)
    await page.keyboard.press('Control+Shift+c');
    await page.waitForFunction(() => olomol.notice?.text.includes('clipboard'), null, { timeout: 10_000 }).catch(() => {});
    const clipboardTypes = await state(async () => (await navigator.clipboard.read()).flatMap((item) => item.types));
    check(clipboardTypes.includes('image/png'), `Ctrl+Shift+C copies a picture (${clipboardTypes})`);
    // and the SVG beside it where the browser can (Word and PowerPoint paste it as a vector picture, at its size)
    const svgToo = await state(() => ClipboardItem.supports?.('image/svg+xml') ?? false);
    check(!svgToo || clipboardTypes.includes('image/svg+xml'), `the SVG too, where the browser can write one (can: ${svgToo}; ${clipboardTypes})`);
  }
  const svg = (await exportFile('SVG')).toString();
  check(svg.startsWith('<svg') && svg.includes('<text') && svg.includes('<path') && !svg.includes('<image'), 'SVG export: vector only (text, paths)');
  const png = await exportFile('PNG');
  check(png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47 && png.length > 2000, `PNG export (${png.length} bytes)`);
  // its resolution said (pHYs after IHDR: 384 dpi, 4× the SVG's 96), so Word places it as large as the SVG
  const phys = png.indexOf('pHYs');
  check(phys === 37 && png.readUInt32BE(phys + 4) === 15118 && png.readUInt32BE(phys + 8) === 15118 && png[phys + 12] === 1,
    `PNG export: 384 dpi said in it (pHYs at ${phys}: ${phys > 0 ? png.readUInt32BE(phys + 4) : 'none'} per metre)`);
  // the pictures open again as the drawing (the drawing inside them, unseen: embedded.js); a picture without it is said
  const pictured = await drawnSmiles();
  for (const [name, mimeType, buffer] of [['drawing.svg', 'image/svg+xml', Buffer.from(svg)], ['drawing.png', 'image/png', png]]) {
    await clear();
    await (await ctrlO()).setFiles({ name, mimeType, buffer });
    await page.waitForFunction(() => olomol.doc.curves.size === 2, null, { timeout: 10_000 }).catch(() => {});
    check((await curveNames()) === 'O-->C, bond->O' && (await drawnSmiles()) === pictured && (await state(() => olomol.file?.format)) === name.slice(-3),
      `${name} opens again as the drawing, its arrows and all (its own file the picture: Save never writes over it)`);
  }
  await clear();
  await (await ctrlO()).setFiles({ name: 'other.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
  await page.waitForFunction(() => /no drawing in it/.test(olomol.notice?.text ?? ''), null, { timeout: 5000 }).catch(() => {});
  check(/no drawing in it/.test(await state(() => olomol.notice?.text ?? '')) && (await state(() => olomol.doc.atoms.size)) === 0, 'a picture from elsewhere: said that it has no drawing in it, nothing opened');
  // (back to the drawing, for the rest; under another name: tabs of the pictures' name are open)
  await (await ctrlO()).setFiles({ name: 'again.olom', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await page.waitForFunction(() => olomol.doc.curves.size === 2, null, { timeout: 10_000 }).catch(() => {});
  const expected = canonical('[OH-].CC(=O)Cl');
  const molfile = (await exportFile('Molfile')).toString();
  check(canonical(molfile) === expected, 'molfile export: the same molecules');
  const smiles = (await exportFile('SMILES')).toString();
  check(canonical(smiles) === expected, `SMILES export (${smiles})`);
  // (RXN and CDXML held back from the menu until checked elsewhere; CDXML still written as before)
  await page.getByTitle(/^Export:/).click();
  const offered = await page.locator('.menu .item').allTextContents();
  await page.keyboard.press('Escape');
  check(offered.some((item) => item.startsWith('SDF')) && !offered.some((item) => /^(RXN|CDXML)/.test(item)), `the Export menu offers SDF but not RXN or CDXML (${offered.filter((item) => /\.\w+$/.test(item)).join(', ')})`);
  const cdxml = await state(() => window.olomolTest.writeAs('cdxml'));
  check(cdxml.includes('<CDXML') && cdxml.includes('<fragment'), 'CDXML written (through Indigo)');
  await clear();
  await (await ctrlO()).setFiles({ name: 'drawing.cdxml', mimeType: 'application/xml', buffer: Buffer.from(cdxml) });
  await page.waitForFunction(() => olomol.doc.atoms.size > 0, null, { timeout: 30_000 }).catch(() => {});
  check((await drawnSmiles()) === expected, 'the CDXML opens again (through Indigo)');
  // a molfile goes into the drawing there is, placed like a template; a reaction (RXN, as Molfile writes one) opens as a drawing
  {
    const before = await state(() => olomol.doc.atoms.size);
    await (await ctrlO()).setFiles({ name: 'molecules.mol', mimeType: 'chemical/x-mdl-molfile', buffer: Buffer.from(molfile) });
    await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 }).catch(() => {});
    const placing = await state(() => olomol.tool.name);
    await page.mouse.click(600, 700);
    await page.keyboard.press('Escape');
    const after = await state(() => olomol.doc.atoms.size);
    check(placing === 'place' && before > 0 && after === 2 * before, `a molfile opened goes into the drawing, placed like a template (${placing}; ${before} atoms, then ${after})`);
    await clear();
    await paste('CC(=O)O.OCC>>CC(=O)OCC');
    await page.waitForFunction(() => olomol.doc.arrows.size === 1, null, { timeout: 30_000 }).catch(() => {});
    const reaction = (await exportFile('Molfile')).toString();
    await clear();
    await (await ctrlO()).setFiles({ name: 'reaction.mol', mimeType: 'chemical/x-mdl-molfile', buffer: Buffer.from(reaction) });
    await page.waitForFunction(() => olomol.doc.arrows.size === 1, null, { timeout: 30_000 }).catch(() => {});
    const opened = await state(() => ({ tool: olomol.tool.name, arrows: olomol.doc.arrows.size, atoms: olomol.doc.atoms.size }));
    check(reaction.startsWith('$RXN') && opened.tool !== 'place' && opened.arrows === 1 && opened.atoms === 13,
      `a reaction exported as Molfile (an RXN) opens again as a drawing (${reaction.slice(0, 4)}; ${JSON.stringify(opened)})`);
  }
  // other programs' files through Indigo: an RXN with agents (RDKit's test file) opens with them on the arrow and
  // its "+" and arrow clear of the labels; a CDXML keeps ChemDraw's hydrogens (a lone C stays C) and a label it
  // couldn't read (SiR3, not H2Si)
  {
    const fixture = (name) => readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url));
    await clear();
    await (await ctrlO()).setFiles({ name: 'with-agents.rxn', mimeType: 'chemical/x-mdl-rxnfile', buffer: fixture('rdkit/ChemReactions/v3k_with_agents.rxn') });
    await page.waitForFunction(() => olomol.doc.arrows.size === 1, null, { timeout: 30_000 }).catch(() => {});
    const rxn = await state(() => {
      const scene = olomol.scene;
      const [arrow] = olomol.doc.arrows.values();
      const [plus] = olomol.doc.pluses.values();
      const atoms = [...olomol.doc.atoms.values()];
      // the labels' extent along the row, of the atoms not on the arrow
      const edges = atoms.filter((a) => a.arrow == null).flatMap((a) => (scene.atoms.get(a.id).label?.boxes ?? [{ x1: 0, x2: 0 }]).map((b) => [a.x + b.x1, a.x + b.x2]));
      const clear = (x1, x2) => edges.every(([l, r]) => r < x1 || l > x2);
      return { riding: atoms.filter((a) => a.arrow === arrow?.id).length, plusClear: clear(plus.x - 0.4, plus.x + 0.4), arrowClear: clear(Math.min(arrow.x1, arrow.x2) - 0.2, Math.max(arrow.x1, arrow.x2) + 0.2), length: Math.abs(arrow.x2 - arrow.x1) };
    });
    check(rxn.riding === 3 && rxn.plusClear && rxn.arrowClear && rxn.length < 3.5, `an RXN opens with its agents on the arrow, "+" and arrow clear of the labels (${JSON.stringify(rxn)})`);
    await clear();
    await (await ctrlO()).setFiles({ name: 'labels.cdxml', mimeType: 'application/xml', buffer: fixture('chemdraw-labels.cdxml') });
    await page.waitForFunction(() => olomol.doc.atoms.size > 0, null, { timeout: 30_000 }).catch(() => {});
    const chemDraw = await state(() => {
      const atoms = [...olomol.doc.atoms.values()];
      const shown = (a) => (olomol.scene.atoms.get(a.id).label?.runs ?? []).map((r) => r.text).join('');
      const lone = atoms.filter((a) => ![...olomol.doc.bonds.values()].some((b) => b.a === a.id || b.b === a.id)).map(shown).sort();
      return { lone, labels: atoms.filter((a) => a.alias).map((a) => a.alias), si: atoms.some((a) => a.el === 'Si'), isotopes: atoms.filter((a) => a.isotope).map((a) => `${a.isotope}${a.el}`).sort() };
    });
    check(chemDraw.lone.join() === 'C,D' && chemDraw.labels.join() === 'SiR3' && !chemDraw.si && chemDraw.isotopes.join() === '13C,2H,2H',
      `a CDXML keeps ChemDraw's hydrogens and labels: a lone C and a lone D, SiR3, the isotopes (${JSON.stringify(chemDraw)})`);
    // ChemDraw's abbreviations (Indigo draws them out): labels again, the molecule the same; its attachment point,
    // a squiggle saved as a two-carbon molecule of its own, an R (SiEt3 on R)
    await clear();
    await (await ctrlO()).setFiles({ name: 'protecting-groups.cdxml', mimeType: 'application/xml', buffer: fixture('rdkit/CDXML/protecting-groups.cdxml') });
    await page.waitForFunction(() => olomol.doc.atoms.size > 0, null, { timeout: 30_000 }).catch(() => {});
    const groups = await state(async () => ({ labels: [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.alias).sort(), molecule: await window.olomolTest.chemistry() }));
    check(groups.labels.join() === 'Et,Et,Et,R' && canonical(groups.molecule) === canonical('*[Si](CC)(CC)CC'),
      `a CDXML's abbreviations stay labels and its attachment point (a squiggle) is an R: three Et on the Si, on an R (${groups.labels.join(', ')}; ${canonical(groups.molecule)})`);
    // written as CDXML again (through Indigo): its texts and its labels that are no abbreviation (SiR3, X) kept
    await clear();
    await (await ctrlO()).setFiles({ name: 'template5.cdxml', mimeType: 'application/xml', buffer: fixture('rdkit/CDXML/chemdraw_template5.cdxml') });
    await page.waitForFunction(() => olomol.doc.atoms.size > 0, null, { timeout: 30_000 }).catch(() => {});
    const written = await state(() => window.olomolTest.writeAs('cdxml').then((text) => ({ texts: olomol.doc.texts.size, tactic: text.includes('Tactic 1'), sir3: text.includes('GenericNickname="SiR3"') }), (error) => ({ error: String(error.message ?? error).slice(0, 120) })));
    check(written.texts > 20 && written.tactic && written.sir3, `a drawing written as CDXML keeps its texts and its labels (${JSON.stringify(written)})`);
    // an atom list read from a file ([C,N]): a label in the drawing, an atom list again in an RXN written
    await clear();
    await (await ctrlO()).setFiles({ name: 'github1950_1.rxn', mimeType: 'chemical/x-mdl-rxnfile', buffer: fixture('rdkit/ChemReactions/github1950_1.rxn') });
    await page.waitForFunction(() => olomol.doc.arrows.size === 1, null, { timeout: 30_000 }).catch(() => {});
    const listed = await state(() => window.olomolTest.writeAs('rxn').then((text) => ({ labels: [...olomol.doc.atoms.values()].filter((a) => a.alias).map((a) => a.alias), als: /^M {2}ALS/m.test(text) }), (error) => ({ error: String(error.message ?? error).slice(0, 120) })));
    check(listed.labels?.includes('[C,N]') && listed.als, `an atom list is a label, and an atom list again in an RXN written (${JSON.stringify(listed)})`);
  }
  // XYZ: 3D coordinates out (OpenChemLib, MMFF94s+), and back in as a drawing
  await state((ket) => window.olomolTest.paste(ket), saved);
  await page.waitForTimeout(300);
  await clear();
  await paste('C[C@@H](N)C(=O)O');
  const xyz = (await exportFile('XYZ')).toString();
  const xyzLines = xyz.trim().split('\n');
  check(xyzLines[0] === '13' && /^C\s+-?\d+\.\d{6}\s+-?\d+\.\d{6}\s+-?\d+\.\d{6}$/.test(xyzLines[2]), `XYZ export: D-alanine with its hydrogens, 3D coordinates (${xyzLines[0]} atoms)`);
  await clear();
  await (await ctrlO()).setFiles({ name: 'alanine.xyz', mimeType: 'chemical/x-xyz', buffer: Buffer.from(xyz) });
  await page.waitForFunction(() => olomol.tool.name === 'place', null, { timeout: 30_000 }).catch(() => {});
  await page.mouse.click(600, 400); // placed like a template
  await page.keyboard.press('Escape');
  check((await drawnSmiles()) === canonical('C[C@@H](N)C(=O)O'), `an XYZ file goes in like a template: bonds, orders and the stereocentre from the 3D coordinates (${await drawnSmiles()})`);

  // a SMILES pasted keeps its stereo: artemisinin's ketal carbon (RDKit's own layout loses its wedge, so another
  // layout is taken); a double bond whose E or Z the SMILES leaves open gets a wavy bond beside it, kept by Redraw
  {
    const artemisinin = 'C[C@@H]1CC[C@H]2[C@@H](C)C(=O)O[C@@H]3O[C@@]4(C)CC[C@@H]1[C@]32OO4';
    await clear();
    await paste(artemisinin);
    check((await drawnSmiles()) === canonical(artemisinin), `a SMILES pasted keeps every stereocentre: artemisinin (${await drawnSmiles()})`);
    // written from its other end (as PubChem has it): RDKit's own layout keeps the stereo there but puts the peroxide's
    // two O on top of each other; the paste takes another of Redraw's quick layouts
    const fromPubChem = 'C[C@@H]1CC[C@H]2[C@H](C(=O)O[C@H]3[C@@]24[C@H]1CC[C@](O3)(OO4)C)C';
    await clear();
    await paste(fromPubChem);
    const nearest = await state(() => {
      const atoms = [...olomol.doc.atoms.values()];
      const bonded = new Set([...olomol.doc.bonds.values()].flatMap((b) => [`${b.a}-${b.b}`, `${b.b}-${b.a}`]));
      let d = Infinity;
      for (const p of atoms) for (const q of atoms) if (p.id < q.id && !bonded.has(`${p.id}-${q.id}`)) d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y));
      return d;
    });
    check(nearest > 0.5 && (await drawnSmiles()) === canonical(fromPubChem), `artemisinin as PubChem writes it: no atoms on top of each other (nearest two not bonded ${nearest.toFixed(2)} bond lengths apart), the molecule kept`);
    const diene = 'CC=C(/C=C/c1ccc(OC)c(N)c1)c1cc(OC)c(OC)c(OC)c1';
    await clear();
    await paste(diene);
    const wavy = await state(() => [...olomol.doc.bonds.values()].filter((b) => b.stereo === 'wavy').length);
    check(wavy === 1 && (await drawnSmiles()) === canonical(diene), `a double bond left open in a SMILES: a wavy bond beside it, the molecule kept (${wavy} wavy; ${await drawnSmiles()})`);
    const redrawn = await state((s) => window.olomolTest.redraw(s), diene);
    check(redrawn.candidates.length >= 1 && !redrawn.skipped.some((x) => x.dropped), `Redraw keeps the wavy bond: no drawing dropped (${redrawn.candidates.map((c) => c.label).join(', ')})`);
    await clear();
  }

  // --- XYZ in the background: a panel while it works, the page free, Cancel, and Save when ready ---
  {
    await clear();
    await paste('CC(=O)Oc1ccccc1C(=O)O');
    await state(() => olomol.clearSelection());
    const exportXyz = async () => {
      await page.getByTitle(/^Export:/).click();
      await page.locator('.menu .item', { hasText: 'XYZ' }).first().click();
    };
    // (a large molecule to cancel: a small one is done before the click)
    await clear();
    await paste('CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H]([C@H](c6ccccc6)NC(=O)c7ccccc7)O)O)(C)C');
    await state(() => olomol.clearSelection());
    await exportXyz();
    const panel = await page.getByTestId('xyz-job').count();
    await page.getByTestId('xyz-cancel').click();
    const cancelled = await page.getByTestId('xyz-job').count();
    await clear();
    await paste('CC(=O)Oc1ccccc1C(=O)O');
    await state(() => olomol.clearSelection());
    await exportXyz();
    await state(() => { const c = [...olomol.doc.atoms.values()][0]; olomol.doc.atoms.get(c.id).x += 0; });
    const atoms = await state(() => olomol.doc.atoms.size);
    await paste('C'); // drawing on while it works
    await page.getByTestId('xyz-save').waitFor({ timeout: 60_000 });
    const wait = page.waitForEvent('download');
    await page.getByTestId('xyz-save').click();
    await page.getByTestId('save-name').click();
    const saved = await wait;
    const text = readFileSync(await saved.path()).toString();
    check(saved.suggestedFilename() === 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N.xyz', `an XYZ file is named by its InChIKey (${saved.suggestedFilename()})`);
    await page.waitForTimeout(100);
    check(panel === 1 && cancelled === 0 && Number.parseInt(text, 10) === 21 && atoms === 13 && !(await page.getByTestId('xyz-job').count()), `XYZ works in the background: a panel (${panel}), Cancel, the drawing changed meanwhile not in the file (${Number.parseInt(text, 10)} atoms), Save`);
  }

  // --- XYZ of a metal complex: built by UFF as Turn in 3D builds it (ZnTPP as pasted); one it can't build said ---
  {
    await clear();
    await paste('c1ccc(cc1)C2=C3C=CC4=N3[Zn]56N7C(=C(C8=CC=C(N85)C(=C9C=CC2=N96)c%10ccccc%10)c%11ccccc%11)C=CC7=C4c%12ccccc%12');
    await state(() => olomol.clearSelection());
    await page.getByTitle(/^Export:/).click();
    await page.locator('.menu .item', { hasText: 'XYZ' }).first().click();
    const uffShown = await page.getByTestId('xyz-uff').waitFor({ timeout: 20_000 }).then(() => true, () => false);
    await page.getByTestId('xyz-save').waitFor({ timeout: 120_000 });
    const wait = page.waitForEvent('download');
    await page.getByTestId('xyz-save').click();
    await page.getByTestId('save-name').click();
    const text = readFileSync(await (await wait).path()).toString();
    const atoms = text.trim().split('\n').slice(2).map((line) => line.trim().split(/\s+/)).map(([el, x, y, z]) => ({ el, p: [Number(x), Number(y), Number(z)] }));
    const zn = atoms.find((a) => a.el === 'Zn');
    // (each N's distance; UFF's Zn–N is shorter than the real 2.04 Å; before, as OpenChemLib generated it: 1.90 to 2.66)
    const znN = atoms.filter((a) => a.el === 'N').map((n) => Math.hypot(...n.p.map((v, i) => v - zn.p[i])));
    const hydrogens = atoms.filter((a) => a.el === 'H').length;
    check(uffShown && /UFF/.test(text.split('\n')[1]) && hydrogens === 28 && znN.length === 4 && znN.every((d) => d > 1.88 && d < 2.1) && Math.max(...znN) - Math.min(...znN) < 0.06,
      `XYZ of ZnTPP: built by UFF (the panel said so: ${uffShown}; "${text.split('\n')[1].slice(28, 70)}…"), Zn–N ${znN.map((d) => d.toFixed(2)).join(' ')} Å, ${hydrogens} H`);
    // ferrocene drawn with its ten Fe–C bonds: what Turn in 3D says, no file
    await clear();
    await paste('[CH-]1C=CC=C1.[CH-]1C=CC=C1.[Fe+2]');
    await state(() => olomol.change((doc) => {
      const fe = [...doc.atoms.values()].find((a) => a.el === 'Fe');
      for (const c of [...doc.atoms.values()].filter((a) => a.el === 'C')) window.olomolTest.addBond(doc, c.id, fe.id, 1, { kind: 'dative' });
    }));
    await state(() => olomol.clearSelection());
    await page.getByTitle(/^Export:/).click();
    await page.locator('.menu .item', { hasText: 'XYZ' }).first().click();
    await page.waitForFunction(() => olomol.notice?.text?.includes('Export failed'), null, { timeout: 60_000 }).catch(() => {});
    const refused = await state(() => olomol.notice?.text ?? '');
    check(refused.includes('No 3D model of this molecule') && !(await page.getByTestId('xyz-save').count()), `XYZ of ferrocene: not written, as Turn in 3D says (${refused})`);
  }

  // --- XYZ: stereocentres left open are said; a selection with labels exports ---
  {
    await clear();
    await paste('CC(C)Cc1ccc(cc1)C(C)C(=O)O');
    await state(() => olomol.clearSelection());
    await page.getByTitle(/^Export:/).click();
    await page.locator('.menu .item', { hasText: 'XYZ' }).first().click();
    await page.getByTestId('xyz-save').waitFor({ timeout: 60_000 });
    const open = await page.getByTestId('xyz-open').textContent().catch(() => '');
    await page.getByTestId('xyz-job').getByRole('button', { name: 'Close' }).click();
    check(open.startsWith('1 stereocentre has no R/S'), `XYZ of ibuprofen without its R/S says so ("${open.slice(0, 40)}…")`);
    await clear();
    await paste('N[C@](O)(c1ccccc1)Cc1ccccc1');
    const ids = await state(() => [...olomol.doc.atoms.keys()].sort((p, q) => p - q));
    await state((part) => window.olomolTest.abbreviate(part), ids.slice(3, 9)); // Ph
    await state((part) => window.olomolTest.abbreviate(part), ids.slice(9)); // Bn
    const named = await state(() => [...olomol.doc.atoms.values()].filter((a) => a.alias).length);
    await page.waitForTimeout(200);
    const drawn = canonical(await state(() => window.olomolTest.chemistry()));
    await state(() => olomol.selectAll());
    await page.getByTitle(/^Export:/).click();
    await page.locator('.menu .item', { hasText: 'XYZ' }).first().click();
    await page.getByTestId('xyz-save').waitFor({ timeout: 60_000 });
    const exported = await page.getByTestId('xyz-save').count();
    await page.getByTestId('xyz-job').getByRole('button', { name: 'Close' }).click();
    check(named === 2 && exported === 1, `a selection with two labels exports (${named} labels)`);
    // Redraw keeps the R/S of a centre that carries two labels
    await page.getByTestId('relayout').click();
    await page.getByTestId('layout-card').first().waitFor({ timeout: 60_000 });
    await page.getByTestId('layout-card').first().click();
    await page.waitForTimeout(300);
    const after = canonical(await state(() => window.olomolTest.chemistry()));
    check(drawn.includes('@') && after === drawn, `Redraw keeps the R/S of a centre with two labels (${after})`);
    // keys don't reach what is behind a dialog
    await state(() => olomol.selectAll());
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.keyboard.press('Delete');
    await page.waitForTimeout(150);
    const left = await state(() => olomol.doc.atoms.size);
    await page.getByTestId('turn3d-use').click();
    await page.waitForTimeout(200);
    check(left > 0, `Delete does nothing behind Turn in 3D (${left} atoms left)`);
  }
}

// (the canonical SMILES of each part of a SMILES, by RDKit here in Node; a reaction's parts in order; a transition
// state's five bonds to a carbon, SN2's, unchecked)
const canonicalParts = (smiles) => smiles.split('>').map((part) => part.split('.').map((one) => canonical(one) ?? canonical(one, { sanitize: false }) ?? one).sort().join('.')).join('>');
const sameMolecules = (a, b) => canonicalParts(a) === canonicalParts(b);

async function standardSmiles() {
  const dir = new URL('../../src/ui/examples/', import.meta.url);
  const names = readdirSync(dir).filter((name) => /\.(ket|olom)$/.test(name));
  const wrong = [];
  for (const name of names) {
    const got = await state(async ([name, text]) => {
      const { readAny, writeAs } = await import('/src/io/files.js');
      const { convert } = await import('/src/io/indigo.js');
      const { doc } = await readAny(text, { name, settings: olomol.settings });
      if (!doc.atoms.size) return null;
      try {
        const ours = (await writeAs(doc, 'smiles', null, olomol.settings)).trim();
        return { ours, indigo: (await convert(ours, 'smiles', {})).trim() };
      } catch (error) {
        return { error: error.message };
      }
    }, [name, readFileSync(new URL(name, dir), 'utf8')]);
    if (!got) continue;
    const own = got.ours?.replace(/>>/g, '').match(/->|<-|~|\{|\|/);
    if (got.error || own || !sameMolecules(got.ours, got.indigo)) wrong.push(`${name}: ${got.error ?? (own ? `"${own[0]}" in ${got.ours}` : `${got.ours} read as ${got.indigo}`)}`);
  }
  check(!wrong.length, `every example as SMILES: standard, and Indigo reads the same molecules (${names.length} examples; ${wrong.join('; ') || 'all'})`);
  // (a reaction goes another way, through Indigo: its dative bonds left out too, not written as ordinary ones)
  const reaction = await state(async () => {
    const { addArrow, addAtom, addBond, emptyDoc } = await import('/src/model/doc.js');
    const { writeAs } = await import('/src/io/files.js');
    const doc = emptyDoc();
    const [n, pt, cl] = [addAtom(doc, 0, 0, 'N'), addAtom(doc, 1, 0, 'Pt'), addAtom(doc, 2, 0, 'Cl')];
    addBond(doc, n.id, pt.id, 1, { kind: 'dative' });
    addBond(doc, pt.id, cl.id, 1);
    addArrow(doc, 4, 0, 7, 0);
    const [c, o] = [addAtom(doc, 9, 0, 'C'), addAtom(doc, 10, 0, 'O')];
    addBond(doc, c.id, o.id, 1);
    return (await writeAs(doc, 'smiles', null, olomol.settings)).trim();
  });
  check(sameMolecules(reaction, 'N.[Pt]Cl>>CO'), `a reaction with N→Pt as SMILES: the complex as its parts, as without a reaction (${reaction})`);
  // (what other programs get of arrows: one reaction, every molecule on its side as drawn; arrows that are no
  // reaction no reaction; RXN and SDF written as olomol writes a molfile, read back the same way)
  const sides = await state(async () => {
    const { addArrow, addAtom, addBond, emptyDoc } = await import('/src/model/doc.js');
    const { readAny, writeAs } = await import('/src/io/files.js');
    const doc = emptyDoc();
    addAtom(doc, 0, 3, 'S'); // (before the arrow, off its line)
    addAtom(doc, 6, 0, 'N');
    addArrow(doc, 7, 0, 11, 0);
    addAtom(doc, 12, 0, 'O');
    const dipole = emptyDoc();
    const [c, cl] = [addAtom(dipole, 0, 0, 'C'), addAtom(dipole, 1, 0, 'Cl')];
    addBond(dipole, c.id, cl.id, 1);
    addArrow(dipole, 0, -0.5, 1, -0.5, 'dipole');
    const rxn = await writeAs(doc, 'rxn', null, olomol.settings);
    const back = (await readAny(rxn, { name: 'x.rxn', settings: olomol.settings })).doc;
    const pasted = (await readAny('C[C@H](O)CC>>CC', { settings: olomol.settings })).doc;
    return {
      smiles: (await writeAs(doc, 'smiles', null, olomol.settings)).trim(),
      dipole: (await writeAs(dipole, 'smiles', null, olomol.settings)).trim(),
      rxn: { atoms: back.doc?.atoms.size ?? back.atoms.size, arrows: back.arrows.size },
      stereo: [...pasted.bonds.values()].filter((b) => b.stereo).length,
    };
  });
  check(sameMolecules(sides.smiles, 'S.N>>O') && sameMolecules(sides.dipole, 'CCl') && sides.rxn.atoms === 3 && sides.rxn.arrows === 1 && sides.stereo === 1,
    `reactions for other programs: a molecule off the arrow's line kept (${sides.smiles}), a dipole arrow no reaction (${sides.dipole}), RXN read back whole (${JSON.stringify(sides.rxn)}), a reaction SMILES pasted keeps its wedge (${sides.stereo})`);
  // (a ChemDraw caption with a superscript, H⁺: Indigo left all of it out)
  const captions = await state(async () => {
    const { readAny } = await import('/src/io/files.js');
    const cdxml = '<?xml version="1.0"?><CDXML><page id="1"><fragment id="2"><n id="3" p="100 100"/></fragment><t id="6" p="0 60" InterpretChemically="no"><s font="4" size="10" face="0">H</s><s font="4" size="10" face="64">+</s><s font="4" size="10" face="0"> and NAD</s></t></page></CDXML>';
    return [...(await readAny(cdxml, { name: 'x.cdxml' })).doc.texts.values()].map((x) => x.text);
  });
  check(captions.join() === 'H^{+} and NAD', `a ChemDraw caption with a superscript (H⁺): read, with it (${JSON.stringify(captions)})`);
}

async function whatFormatsLose() {
  await standardSmiles();
  // --- what a format has no place for: said in the Export menu, and after the export ---
  await clear();
  await state(async () => {
    const { addAtom, addCurve, addText, emptyDoc } = await import('/src/model/doc.js');
    const doc = emptyDoc();
    const [o, c] = [addAtom(doc, 0, 0, 'O', { charge: -1 }), addAtom(doc, 3, 0, 'C')];
    addCurve(doc, { atom: o.id }, { atom: c.id });
    addText(doc, 0, 2, 'SN2');
    olomol.setDoc(doc);
    olomol.clearSelection();
    olomol.fit(window.innerWidth, window.innerHeight);
  });
  await page.getByTitle(/^Export:/).click();
  const said = await page.getByTestId('export-mol').textContent();
  const inKet = await page.getByTestId('export-ket').textContent();
  await page.keyboard.press('Escape');
  check(/without curved arrows, texts/.test(said) && !/without/.test(inKet), `Export menu: Molfile says it is without the curved arrow and the text ("${said}"), KET nothing ("${inKet}")`);
  await exportFile('Molfile');
  const after = await page.locator('.notice').textContent({ timeout: 3000 }).catch(() => '');
  check(/without curved arrows, texts/.test(after), `exported as a molfile: the message says what isn't in it ("${after}")`);

  // --- a dative bond in SMILES: one molecule, not a reaction ---
  await clear();
  await paste('N->[Pt](Cl)Cl');
  const dative = await state(() => [...olomol.doc.bonds.values()].filter((b) => b.kind === 'dative').length);
  check(dative === 1 && (await state(() => olomol.doc.arrows.size)) === 0, `N->[Pt](Cl)Cl pasted (RDKit's way of writing it): one dative bond, no reaction arrow (${dative})`);
  // exported: standard SMILES, the complex as its parts (no ->, which other programs can't read)
  const written = (await state(() => window.olomolTest.writeAs('smiles'))).trim();
  check(!written.includes('>') && written.split('.').length === 2 && !written.includes('PtH'), `exported as SMILES: standard, its parts with a dot, no -> (${written})`);

  // --- a picture pasted, no text: said, not the last copy again ---
  await state(() => olomol.selectAll());
  await page.keyboard.press('Control+c');
  await clear();
  await state(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'picture.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
  });
  await page.waitForTimeout(300);
  const pasted = await state(() => ({ tool: olomol.tool.name, notice: document.querySelector('.notice')?.textContent ?? '' }));
  // (0.5: a file on the clipboard is opened as a dropped one: a picture olomol didn't export says it has no drawing)
  check(pasted.tool !== 'place' && /no drawing in it/.test(pasted.notice), `a picture on the clipboard, Ctrl+V: opened as a file is (no drawing in it), not the last copy pasted (${pasted.tool}, "${pasted.notice}")`);

  // --- a change made just before a reload: kept ---
  const other = await browser.newPage({ viewport: { width: 1400, height: 900 }, ...login });
  await other.goto(url.href);
  await unlock(other);
  await other.waitForFunction(() => window.olomol && window.olomolTest, null, { timeout: 30_000 });
  await other.evaluate(() => window.olomolTest.paste('CCO'));
  await other.waitForFunction(() => olomol.doc.atoms.size === 3 && olomol.keeping === 'kept', null, { timeout: 10_000 }).catch(() => {});
  await other.evaluate(() => olomol.change((doc) => { [...doc.atoms.values()].find((a) => a.el === 'O').el = 'S'; }));
  await other.reload();
  await unlock(other);
  await other.waitForFunction(() => window.olomol && olomol.doc.atoms.size === 3, null, { timeout: 30_000 }).catch(() => {});
  const kept = await other.evaluate(() => [...olomol.doc.atoms.values()].map((a) => a.el).sort().join(''));
  check(kept === 'CCS', `a change made just before a reload: kept (${kept})`);
  await other.close();
}

async function reviewedFiles() {
  // --- only the selection exported as SVG: the drawing inside it in the drawing's own style ---
  await clear();
  await paste('[OH3+]');
  await state(() => {
    olomol.change((doc) => {
      doc.style = { style: 'acs', charges: 'circled' };
    });
    olomol.selectAll();
  });
  const svg = (await exportFile('SVG')).toString('utf8');
  const inside = await state(async (svg) => {
    const { drawingInSvg } = await import('/src/io/embedded.js');
    return JSON.parse(drawingInSvg(svg)).style;
  }, svg);
  check(JSON.stringify(inside) === JSON.stringify({ preset: 'acs', charges: 'circled' }), `only the selection exported as SVG: the drawing inside in its own style (${JSON.stringify(inside)})`);

  // --- an SVG's source pasted: the drawing inside it ---
  await clear();
  await paste(svg);
  check((await state(() => olomol.doc.atoms.size)) === 1, `an exported SVG's source pasted: the drawing inside it (${await state(() => olomol.doc.atoms.size)} atom)`);

  // --- KET for Ketcher ---
  await clear();
  const ketcher = await state(async () => {
    const { readOlom } = await import('/src/io/olom.js');
    const { readAny, writeAs } = await import('/src/io/files.js');
    const { convert } = await import('/src/io/indigo.js');
    const text = await (await fetch('/src/ui/examples/sugars.olom')).text();
    const { doc } = readOlom(text);
    const ket = await writeAs(doc, 'ket', null, olomol.settings);
    const ours = (await writeAs(doc, 'smiles', null, olomol.settings)).trim();
    const indigo = (await convert(ket, 'smiles', {})).trim();
    const back = (await readAny(ket, { name: 'x.ket', settings: olomol.settings })).doc;
    const labels = (d) => [...d.atoms.values()].filter((a) => a.alias).map((a) => a.alias).sort().join(',');
    const stereo = (d) => [...d.bonds.values()].map((b) => b.stereo).filter(Boolean).sort().join(',');
    return { ours, indigo, labels: labels(back) === labels(doc) && labels(doc), stereo: stereo(back) === stereo(doc) && stereo(doc) };
  });
  check(sameMolecules(ketcher.ours, ketcher.indigo) && ketcher.labels && ketcher.stereo, `KET for Ketcher: Indigo reads the sugars as olomol's SMILES has them (${ketcher.indigo.slice(0, 60)}…); read back, labels ${ketcher.labels} and bonds ${ketcher.stereo} as drawn`);
}

