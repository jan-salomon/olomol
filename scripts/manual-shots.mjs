// The pictures of the Czech manual (docs/img/): screenshots of the app in
// Czech, and the example drawings exported as SVG, as the app exports them.
// Start the dev server (npm run dev), then
//   node scripts/manual-shots.mjs [http://localhost:5173/]
// With --en, those of the English manual (docs/en/img/), the app in English.
// With --built <url> (a site from npm run build:locked, password "heslo"
// in OLOMOL_PASSWORD), also the login window and the Install button.
// With --only <names> (comma separated: preklopeni, newman-e2, newman-preklopeni,
// tycinkovy-model (and tycinkovy-model-male-h), skupiny, lambda-delta, orbitaly-diels-alder, orbitaly-sn2, nova-vazba, plochy-kruh, sipky,
// lewis, or new for all of them; and napoveda, Help's window), only those
// pictures, the others left as they are.
// The pictures are then made 256-colour PNGs (scripts/shrink-pictures.py, needs Pillow).
// Then compile the manual: typst compile --root . docs/manual.typ (and
// docs/rychly-start.typ).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { writeOlom } from '../src/io/olom.js';
import { readMolfile, writeMolfile } from '../src/io/molfile.js';
import { addAtom, addBond, addFill, deleteObjects, emptyDoc, KINDS } from '../src/model/doc.js';
import { fragments } from '../src/model/graph.js';
import { CATECHOLAMINES, catecholamines, friedelCrafts, FRIEDEL_CRAFTS, PENICILLIN_SALT, penicillinCover, sn2, zwitterion } from './manual-scenes.mjs';

const args = process.argv.slice(2);
// the stick model's pictures: N-acetyl-β-D-glucosamine, small enough for its atoms to show large, and how far the
// arrow keys turn it from the view the window starts with: as in its Haworth projection (ring O at the back right,
// C1 on the right, CH2OH up), the ring seen from 30° above, so that the N–C bond to the acetyl shows below it
const STICK_MOLECULE = 'OC[C@H]1O[C@@H](O)[C@H](NC(C)=O)[C@@H](O)[C@@H]1O';
const STICK_TURNS = [...Array(12).fill('ArrowLeft'), ...Array(3).fill('ArrowUp'), ...Array(15).fill('Shift+ArrowRight')];
const built = args.includes('--built') ? args[args.indexOf('--built') + 1] : null;
const base = new URL(args.find((a) => a.startsWith('http') && a !== built) ?? 'http://localhost:5173/');
base.searchParams.set('test', '');
const english = args.includes('--en');
base.searchParams.set('lang', english ? 'en' : 'cs');
const OUT = english ? 'docs/en/img' : 'docs/img';
const say = (cs, en) => (english ? en : cs); // a button's text, as the app shows it
mkdirSync(OUT, { recursive: true });

const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
const canonical = (text) => {
  const mol = RDKit.get_mol(text, JSON.stringify({ removeHs: false }));
  try {
    return mol.get_smiles();
  } finally {
    mol.delete();
  }
};

// the example drawings, checked: every molecule as its SMILES says (R/S included)
function check(doc, smiles, what) {
  const drawn = fragments(doc).map((members) => canonical(writeMolfile(doc, members).molfile)).sort();
  const wanted = smiles.map(canonical).sort();
  if (JSON.stringify(drawn) !== JSON.stringify(wanted)) throw new Error(`${what} is not drawn as its SMILES:\n${drawn.join('\n')}\n--\n${wanted.join('\n')}`);
}
const mechanism = friedelCrafts(RDKit);
check(mechanism, FRIEDEL_CRAFTS, 'the Friedel–Crafts acylation');
const catecholDoc = catecholamines(RDKit, { english });
check(catecholDoc, CATECHOLAMINES.map(([, smiles]) => smiles), 'the catecholamines');
const substitution = sn2();
const cover = penicillinCover(RDKit, { english });
{
  // the penicillin as its SMILES says (the enzyme's serine and K+ aside)
  const molecules = fragments(cover).map((members) => canonical(writeMolfile(cover, members).molfile));
  if (!molecules.includes(canonical(PENICILLIN_SALT))) throw new Error(`penicillin G is not drawn as its SMILES:\n${molecules.join('\n')}`);
}

// aspirin with a filled ring, the ester highlighted and the acid painted
function aspirin() {
  const mol = RDKit.get_mol('CC(=O)Oc1ccccc1C(=O)O');
  mol.set_new_coords();
  mol.normalize_depiction(1);
  mol.straighten_depiction(true);
  const doc = emptyDoc();
  const { atomIds } = readMolfile(mol.get_molblock(JSON.stringify({ kekulize: true })), doc);
  mol.delete();
  const atoms = atomIds.map((id) => doc.atoms.get(id));
  // SMILES order: 0 C, 1 C, 2 =O, 3 O, 4–9 the ring, 10 C, 11 =O, 12 O
  addFill(doc, atomIds.slice(4, 10), '#fff09a');
  const ester = new Set([0, 1, 2, 3].map((k) => atomIds[k]));
  for (const k of [0, 1, 2, 3]) atoms[k].highlight = '#b5dcff';
  for (const b of doc.bonds.values()) if (ester.has(b.a) && ester.has(b.b)) b.highlight = '#b5dcff';
  const acid = new Set([10, 11, 12].map((k) => atomIds[k]));
  for (const k of [10, 11, 12]) atoms[k].color = '#d40000';
  for (const b of doc.bonds.values()) if (acid.has(b.a) && acid.has(b.b)) b.color = '#d40000';
  return doc;
}

// bornyl salicylate, as PubChem has it, and how far the arrow keys turn it for the picture: the
// bornane as in a textbook, its gem-dimethyl bridge on top and the ester going down
const BORNYL_SALICYLATE = 'C[C@@]12CC[C@@H](C1(C)C)C[C@@H]2OC(=O)C3=CC=CC=C3O';
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const TURNS = [...Array(15).fill('ArrowUp'), ...Array(2).fill('ArrowLeft'), ...Array(20).fill('Shift+ArrowRight')];

// the calcium complex of EDTA, drawn flat, its six donors on coordination bonds
function caEdta() {
  const doc = emptyDoc();
  const ca = addAtom(doc, 0, 0, 'Ca', { charge: 2 });
  const [n1, n2] = [addAtom(doc, -0.7, -1, 'N'), addAtom(doc, 0.7, -1, 'N')];
  const [e1, e2] = [addAtom(doc, -0.5, -2, 'C'), addAtom(doc, 0.5, -2, 'C')];
  addBond(doc, n1.id, e1.id);
  addBond(doc, e1.id, e2.id);
  addBond(doc, e2.id, n2.id);
  for (const [n, sx] of [[n1, -1], [n2, 1]]) {
    for (const sy of [-1, 1]) {
      const [c, k] = [addAtom(doc, sx * 2, sy * 0.8, 'C'), addAtom(doc, sx * 2.5, sy * 1.6, 'C')];
      const [o1, o2] = [addAtom(doc, sx * 1.5, sy * 1.8, 'O', { charge: -1 }), addAtom(doc, sx * 3.3, sy * 2, 'O')];
      addBond(doc, n.id, c.id);
      addBond(doc, c.id, k.id);
      addBond(doc, k.id, o1.id);
      addBond(doc, k.id, o2.id, 2);
      addBond(doc, o1.id, ca.id, 1, { kind: 'dative' });
    }
  }
  addBond(doc, n1.id, ca.id, 1, { kind: 'dative' });
  addBond(doc, n2.id, ca.id, 1, { kind: 'dative' });
  return doc;
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
// (a browser as testers have it, for the report window's table: not HeadlessChrome)
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: english ? 'en-GB' : 'cs-CZ', colorScheme: 'light', userAgent });
const page = await context.newPage();
page.on('pageerror', (error) => console.log('[page error]', error.message));
await page.goto(base.href);
await page.waitForFunction(() => window.olomolTest);

const state = (fn, arg) => page.evaluate(fn, arg);
const shot = (name, clip) => page.screenshot({ path: `${OUT}/${name}.png`, ...(clip && { clip }) });
const box = async (selector) => {
  const b = await page.locator(selector).first().boundingBox();
  return b && { x: b.x, y: b.y, width: b.width, height: b.height };
};
// a box round several things, with a margin, inside the window
const around = (boxes, margin = 12) => {
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - margin);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - margin);
  const x2 = Math.min(1440, Math.max(...boxes.map((b) => b.x + b.width)) + margin);
  const y2 = Math.min(900, Math.max(...boxes.map((b) => b.y + b.height)) + margin);
  return { x, y, width: x2 - x, height: y2 - y };
};
async function clear() {
  await page.keyboard.press('Escape');
  await state(() => {
    olomol.setDoc({ atoms: new Map(), bonds: new Map(), arrows: new Map(), pluses: new Map(), texts: new Map(), curves: new Map(), nextId: 1 });
    olomol.setTool({ name: 'select' });
  });
}
// Fits the view into the free part of the window, between the tool rail
// (left), the top bar, the bottom bar and (with `right`) the panel; not
// closer than `zoom` (42: 100 %).
const fit = (right = 30, zoom = 60) => state(([right, zoom]) => {
  const [left, top, bottom] = [110, 90, 150];
  const [width, height] = [window.innerWidth - left - right, window.innerHeight - top - bottom];
  olomol.fit(width, height);
  const { scale, tx, ty } = olomol.view;
  const k = Math.min(1, zoom / scale);
  olomol.setView({ scale: scale * k, tx: left + width / 2 - (width / 2 - tx) * k, ty: top + height / 2 - (height / 2 - ty) * k });
}, [right, zoom]);
// Puts the middle of the drawing at (x, y) on the screen, at `zoom` (42: 100 %).
const placeAt = (x, y, zoom = 60) => state(([x, y, zoom]) => {
  const atoms = [...olomol.doc.atoms.values()];
  const [xs, ys] = [atoms.map((a) => a.x), atoms.map((a) => a.y)];
  const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  olomol.setView({ scale: zoom, tx: x - cx * zoom, ty: y - cy * zoom });
}, [x, y, zoom]);
// pastes a drawing (KET, SMILES, molfile) and fits it into the view
async function show(text, right = 30, zoom = 60) {
  await clear();
  await state((t) => window.olomolTest.paste(t), text);
  await fit(right, zoom);
  await state(() => olomol.clearSelection());
  await page.mouse.move(5, 450);
  await page.waitForTimeout(400);
}
// the screen box of the drawing (atoms, with room for labels)
const drawingBox = () => state(() => {
  const xs = [...olomol.doc.atoms.values()].map((a) => a.x * olomol.view.scale + olomol.view.tx);
  const ys = [...olomol.doc.atoms.values()].map((a) => a.y * olomol.view.scale + olomol.view.ty);
  const pad = olomol.view.scale * 1.3;
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + 2 * pad, height: Math.max(...ys) - Math.min(...ys) + 2 * pad };
});
const selectAll = () => state(() => olomol.selectAll());
// the drawing as the app exports it; `settings`: as if changed in Settings
const svg = (name, settings = {}) => state(async (settings) => {
  const { svgOf } = await import('/src/io/files.js');
  return svgOf(olomol.doc, { ...olomol.settings, ...settings }, { background: '#ffffff' });
}, settings).then((text) => writeFileSync(`${OUT}/${name}.svg`, text));
const ket = (doc) => writeOlom(doc);
const WINDOW_HEIGHT = 720; // of the picture of the whole window
// Templates down to its last row of cards (its height stays the same, so the tabs stay put)
const templatesBox = async () => {
  const dialog = await box('.dialog');
  const last = await page.locator('.dialog .card-place').last().boundingBox();
  return { ...dialog, height: last.y + last.height + 14 - dialog.y };
};
// Redraw's window, until every drawing has come
const drawn = () => page.waitForFunction((words) => {
  const texts = [...document.querySelectorAll('.dialog .small')].map((p) => p.textContent);
  return !texts.some((text) => words.some((word) => text.startsWith(word)));
}, say(['Ještě se počítá', 'Počítám nákresy'], ['Still working', 'Computing drawings']), { timeout: 90_000 }).catch(() => console.log('Redraw is still working'));
// the line of hints above the bottom bar: hidden in cut-outs it would cross
const hints = (on) => state((on) => {
  document.querySelector('.tool-hint').style.visibility = on ? '' : 'hidden';
}, on);
// `doc` without what lies right of its first reaction arrow
function beforeArrow(doc) {
  const [arrow] = doc.arrows.values();
  const right = (item) => (item.x1 ?? item.x) > arrow.x1 - 0.1;
  deleteObjects(doc, KINDS.filter((kind) => kind !== 'bonds' && kind !== 'curves').flatMap((kind) => [...doc[kind].values()].filter(right).map((item) => item.id)));
  return doc;
}

// --- the pictures of 0.4: taken after the others, or alone with --only (names, comma separated, or "new") ---
// `wanted`: their names, or null for all of them
async function newShots(wanted = null) {
  const take = (name) => !wanted || wanted.includes('new') || wanted.includes(name);
  // the ring flip: the conformations example of Help, the tool over its first chair, the other chair see-through
  if (take('preklopeni')) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await show(readFileSync('src/ui/examples/conformations.olom', 'utf8'), 30, 60);
    await page.getByTestId('ring-flip').click();
    const chair = await state(() => {
      // (the first ring of six atoms, the one furthest left: its middle on the screen)
      const rings = olomol.scene.rings.filter((ring) => ring.length === 6);
      const middle = (ring) => [ring.reduce((s, id) => s + olomol.doc.atoms.get(id).x, 0) / 6, ring.reduce((s, id) => s + olomol.doc.atoms.get(id).y, 0) / 6];
      const [x, y] = rings.map(middle).sort((p, q) => p[0] - q[0])[0];
      return [x * olomol.view.scale + olomol.view.tx, y * olomol.view.scale + olomol.view.ty];
    });
    await page.mouse.move(...chair);
    await page.waitForTimeout(500);
    await hints(false);
    await shot('preklopeni', around([await drawingBox()], 0));
    await hints(true);
    await page.keyboard.press('Escape');
  }
  // an E2 on cyclohexane seen along C1–C2: Br axial up in front, hydroxide taking the axial H down at the back
  if (take('newman-e2')) {
    await clear();
    await state(async () => {
      const { cyclohexaneNewmanDoc } = await import('/src/chem/newman.js');
      const { addAtom, addCurve } = await import('/src/model/doc.js');
      const doc = cyclohexaneNewmanDoc({ axial: ['Br'] });
      const axle = [...doc.bonds.values()].find((b) => b.newman);
      const near = (x) => [...doc.bonds.values()].filter((b) => b.a === x || b.b === x);
      const other = (b, x) => (b.a === x ? b.b : b.a);
      const br = near(axle.a).find((b) => doc.atoms.get(other(b, axle.a)).el === 'Br');
      const down = near(axle.b).find((b) => doc.atoms.get(other(b, axle.b)).el === 'H' && doc.atoms.get(other(b, axle.b)).y > doc.atoms.get(axle.b).y + 0.8);
      const h = doc.atoms.get(other(down, axle.b));
      const oh = addAtom(doc, h.x - 0.9, h.y + 1.1, 'O', { charge: -1 });
      addCurve(doc, { atom: oh.id }, { atom: h.id });
      addCurve(doc, { bond: down.id }, { bond: axle.id });
      addCurve(doc, { bond: br.id }, { atom: other(br, axle.a) });
      olomol.setDoc(doc);
    });
    await fit(30, 70);
    await svg('newman-e2');
  }
  // Turn in 3D's stick model of the drawing on the canvas, selected, in the view it starts with (Clearest view),
  // turned by the keys `turns` if any, its groups drawn out unless `shorthands` (G); the stage cut down to the model
  const stickModel = async ({ shorthands = false, turns = [] } = {}) => {
    await state(() => {
      try { sessionStorage.removeItem('olomol-3d-groups-drawn-out'); } catch { /* none */ }
    });
    await selectAll();
    await page.getByTestId('turn3d').click();
    await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(600);
    await page.getByTestId('turn3d-stage').focus();
    await page.keyboard.press('s');
    if (shorthands) await page.keyboard.press('g');
    for (const key of turns) await page.keyboard.press(key);
    await page.waitForTimeout(400);
    await state(() => {
      document.activeElement.blur(); // (no focus ring in the picture)
      // the stage as tall as the model needs, without the empty room round it (as for otoceni-okno)
      const stage = document.querySelector('[data-testid="turn3d-stage"]');
      const b = stage.querySelector('g').getBBox();
      const margin = 14;
      stage.setAttribute('viewBox', `${b.x - margin} ${b.y - margin} ${b.width + 2 * margin} ${b.height + 2 * margin}`);
      stage.style.height = `${(stage.clientWidth * (b.height + 2 * margin)) / (b.width + 2 * margin)}px`;
    });
    await page.waitForTimeout(400);
  };
  // the stick model of Turn in 3D: aspirin (the manual's molecule), the whole window
  // the stick model of a molecule with many hydrogens: every hydrogen, and the same with small hydrogens (H)
  if (take('tycinkovy-model')) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await show(STICK_MOLECULE, 30, 42);
    await stickModel({ turns: STICK_TURNS });
    await shot('tycinkovy-model', around([await box('[data-testid="turn3d-stage"]')], 4));
    await page.getByTestId('turn3d-stage').focus();
    await page.keyboard.press('h');
    await page.waitForTimeout(400);
    await state(() => document.activeElement.blur());
    await shot('tycinkovy-model-male-h', around([await box('[data-testid="turn3d-stage"]')], 4));
    await page.keyboard.press('h'); // (as it was, for the pictures after it)
    await page.keyboard.press('Escape');
  }
  // groups written as shorthands in the stick model: paracetamol drawn with NHAc; the drawing, the stick model
  // with NHAc drawn out (its carbons and hydrogens in the group's colour, the legend under it) and with G (one
  // ball named NHAc); the stage and the legend
  if (take('skupiny')) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await show('Oc1ccc(*)cc1', 30, 60);
    // (turned a quarter, OH left and NHAc right, as the stick model starts)
    await state(() => olomol.change((doc) => {
      for (const atom of doc.atoms.values()) {
        if (atom.el === '*') atom.alias = 'NHAc';
        [atom.x, atom.y] = [atom.y, -atom.x];
      }
    }));
    await fit(30, 60);
    await svg('skupiny-kresba');
    await stickModel();
    await state(() => {
      document.querySelector('[data-testid="turn3d-notes"] p.small').style.display = 'none'; // (only the legend under it)
    });
    await shot('skupiny-model', around([await box('[data-testid="turn3d-stage"]'), await box('[data-testid="turn3d-legend"]')], 4));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await stickModel({ shorthands: true });
    await shot('skupiny-zkratky', around([await box('[data-testid="turn3d-stage"]')], 4));
    await page.keyboard.press('Escape');
  }
  // Λ or Δ beside the metal: [Co(en)3]3+ drawn as an octahedron, two donors wedged in front, two hashed behind
  if (take('lambda-delta')) {
    await clear();
    await state(() => olomol.change((doc) => {
      const { addAtom, addBond } = window.olomolTest;
      const co = addAtom(doc, 0, 0, 'Co', { charge: 3 });
      const at = { up: [0, -1.5], down: [0, 1.5], leftFront: [-1.1, 0.55], rightFront: [0.9, 0.75], leftBack: [-0.9, -0.75], rightBack: [1.1, -0.55] };
      const depth = { up: '', down: '', leftFront: 'wedge', rightFront: 'wedge', leftBack: 'hash', rightBack: 'hash' };
      const ids = {};
      for (const place of Object.keys(at)) {
        ids[place] = addAtom(doc, at[place][0], at[place][1], 'N').id;
        addBond(doc, ids[place], co.id, 1, { kind: 'dative', stereo: depth[place] });
      }
      for (const [p, q] of [['up', 'leftBack'], ['leftFront', 'down'], ['rightBack', 'rightFront']]) {
        // (each ethylene a bond out from its two N, away from the metal)
        const [a, b] = [doc.atoms.get(ids[p]), doc.atoms.get(ids[q])];
        const [mx, my] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
        const [ux, uy] = [mx / Math.hypot(mx, my), my / Math.hypot(mx, my)];
        const c1 = addAtom(doc, a.x + ux, a.y + uy);
        const c2 = addAtom(doc, b.x + ux, b.y + uy);
        addBond(doc, ids[p], c1.id);
        addBond(doc, c1.id, c2.id);
        addBond(doc, c2.id, ids[q]);
      }
      for (const atom of doc.atoms.values()) if (atom.el === 'Co') atom.cipLabel = true;
    }));
    await fit(30, 70);
    await page.waitForFunction(() => olomol.scene.stereo.some((m) => /[ΛΔ]/.test(m.text)), null, { timeout: 15_000 }).catch(() => console.log('no Λ/Δ label'));
    // (the label as the scene has it, into the picture: svgOf gets the labels it is given)
    await state(async () => {
      const { svgOf } = await import('/src/io/files.js');
      const { stereoLabels } = await import('/src/chem/stereo.js');
      window.lambdaDeltaSvg = svgOf(olomol.doc, olomol.settings, { background: '#ffffff', stereo: await stereoLabels(olomol.doc) });
    });
    writeFileSync(`${OUT}/lambda-delta.svg`, await state(() => window.lambdaDeltaSvg));
  }
  // the ring flip of cyclohexane in a Newman projection: trans-diaxial Br and Cl, Shift+click: the other chair
  // beside it (diequatorial), an equilibrium arrow between them
  if (take('newman-preklopeni')) {
    await clear();
    await state(async () => {
      const { cyclohexaneNewmanDoc } = await import('/src/chem/newman.js');
      olomol.setDoc(cyclohexaneNewmanDoc({ axial: ['Br', 'Cl'] }));
    });
    await fit(30, 60);
    await page.getByTestId('ring-flip').click();
    // (on a ring bond that isn't seen end on: C2–C3)
    const at = await state(() => {
      const bond = [...olomol.doc.bonds.values()].find((b) => !b.newman && olomol.doc.atoms.get(b.a).el === 'C' && olomol.doc.atoms.get(b.b).el === 'C');
      const [a, b] = [olomol.doc.atoms.get(bond.a), olomol.doc.atoms.get(bond.b)];
      return [((a.x + b.x) / 2) * olomol.view.scale + olomol.view.tx, ((a.y + b.y) / 2) * olomol.view.scale + olomol.view.ty];
    });
    await page.mouse.move(...at);
    await page.waitForTimeout(300);
    await page.keyboard.down('Shift');
    await page.mouse.click(...at);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(1200); // (the flip is animated)
    await page.keyboard.press('Escape');
    await svg('newman-preklopeni');
  }
  // orbitals: a Diels–Alder's frontier orbitals, the diene's HOMO above the ethylene's LUMO (lobes as the
  // coefficients, 0.60 and 0.37, 0.71), the termini's lobes of one phase joined by dashed lines
  if (take('orbitaly-diels-alder')) {
    await clear();
    await state(async () => {
      const { addAtom, addBond, addOrbital, addOverlap, addText, emptyDoc, setOrbitalAngle } = await import('/src/model/doc.js');
      const doc = emptyDoc();
      const c = [[-1.4, 0.35], [-0.5, 0], [0.5, 0], [1.4, 0.35], [-0.6, 3.1], [0.6, 3.1]].map(([x, y]) => addAtom(doc, x, y, 'C').id);
      addBond(doc, c[0], c[1], 2);
      addBond(doc, c[1], c[2]);
      addBond(doc, c[2], c[3], 2);
      addBond(doc, c[4], c[5], 2);
      const p = (atom, size, phase) => {
        const orbital = addOrbital(doc, atom, { size, phase });
        setOrbitalAngle(doc, orbital, -Math.PI / 2);
        return orbital.id;
      };
      const diene = [p(c[0], 1.25, 1), p(c[1], 0.75, 1), p(c[2], 0.75, -1), p(c[3], 1.25, -1)];
      const ethylene = [p(c[4], 1.5, -1), p(c[5], 1.5, 1)];
      addOverlap(doc, diene[0], ethylene[0]);
      addOverlap(doc, diene[3], ethylene[1]);
      addText(doc, 2.4, 0.2, 'HOMO');
      addText(doc, 2.4, 3.1, 'LUMO');
      olomol.setDoc(doc);
    });
    await fit(30, 70);
    await svg('orbitaly-diels-alder');
  }
  // orbitals: an SN2, the hydroxide's lone pair (a hybrid) into the σ* of C–Br (a hybrid on carbon, its big
  // lobe away from Br), curved arrows from lobe to lobe and from C–Br to Br
  if (take('orbitaly-sn2')) {
    await clear();
    await state(async () => {
      const { addAtom, addBond, addCurve, addOrbital, emptyDoc, setOrbitalAngle } = await import('/src/model/doc.js');
      const doc = emptyDoc();
      const o = addAtom(doc, -3.1, 0, 'O', { charge: -1 });
      const c = addAtom(doc, 0, 0, 'C');
      const br = addAtom(doc, 1.1, 0, 'Br');
      const cbr = addBond(doc, c.id, br.id);
      for (const [x, y, stereo] of [[-0.35, -0.94, ''], [-0.6, 0.72, 'wedge'], [0.2, 0.95, 'hash']]) addBond(doc, c.id, addAtom(doc, x, y, 'H').id, 1, { stereo });
      const hybrid = (atom, angle) => {
        const orbital = addOrbital(doc, atom, { kind: 'hybrid' });
        setOrbitalAngle(doc, orbital, angle);
        return orbital.id;
      };
      const pair = hybrid(o.id, 0);
      const sigma = hybrid(c.id, Math.PI);
      addCurve(doc, { orbital: pair }, { orbital: sigma });
      addCurve(doc, { bond: cbr.id }, { atom: br.id });
      olomol.setDoc(doc);
    });
    await fit(30, 70);
    await svg('orbitaly-sn2');
  }
  // an arrow to a new bond: Cl• + H–CH3, the Cl•'s fishhook already at the new Cl–H bond, a second one being
  // dragged from the H–C bond onto that bond's dot (the lines to the atoms within reach, the dot lit)
  if (take('nova-vazba')) {
    await clear();
    const points = await state(async () => {
      const { addAtom, addBond, addCurve, addPlus, emptyDoc } = await import('/src/model/doc.js');
      const doc = emptyDoc();
      const cl = addAtom(doc, 0, 0, 'Cl', { radical: 2, lonePairs: 'auto' });
      const h = addAtom(doc, 3.3, 0, 'H');
      const c = addAtom(doc, 4.3, 0, 'C');
      const hc = addBond(doc, h.id, c.id);
      addPlus(doc, 1.75, 0);
      addCurve(doc, { atom: cl.id, radical: true }, { atom: h.id, newBond: cl.id }, 1);
      olomol.setDoc(doc);
      olomol.setTool({ name: 'curve', electrons: 1 });
      return { bond: [(h.x + c.x) / 2, (h.y + c.y) / 2], dot: [(cl.x + h.x) / 2, (cl.y + h.y) / 2] };
    });
    await fit(30, 70);
    const screen = ([x, y]) => state(([x, y]) => [x * olomol.view.scale + olomol.view.tx, y * olomol.view.scale + olomol.view.ty], [x, y]);
    await page.mouse.move(...(await screen(points.bond)));
    await page.mouse.down();
    await page.mouse.move(...(await screen([points.dot[0] + 0.15, points.dot[1] - 0.05])), { steps: 8 });
    await page.waitForTimeout(300);
    await shot('nova-vazba', around([await drawingBox()], 0)); // (the hint line is gone while dragging)
    await page.mouse.up();
    await clear();
  }
  // a flat ring becomes a chair: Help's menthol example (drawn flat with its wedges = its chair, all equatorial
  // ⇌ the other chair, all axial), its words in the manual's language
  if (take('plochy-kruh')) {
    await clear();
    await state(async () => {
      const { EXAMPLES, exampleDoc } = await import('/src/ui/ExampleDrawing.jsx');
      olomol.setDoc(exampleDoc(EXAMPLES.find((example) => example.id === 'to-chair')));
    });
    await fit(30, 70);
    await svg('plochy-kruh');
  }
  // the reaction arrows of 0.4: an equilibrium favouring the products, the crossed arrow and the equals sign,
  // each with a word under it; and thioredoxin reduced on an equilibrium arrow, 2 e⁻ and 2 H⁺ taken in on the
  // upper harpoon's arc and given off on the lower one's
  if (take('sipky')) {
    await clear();
    await state(async ([words]) => {
      const { addArrow, addAtom, addBond, addText, emptyDoc } = await import('/src/model/doc.js');
      const doc = emptyDoc();
      const row = [['equilibrium', { lean: 'forward' }, 2.6], ['failed', {}, 2.6], ['same', {}, 1.2]];
      let x = 0;
      row.forEach(([kind, extra, length], k) => {
        const arrow = addArrow(doc, x, 0, x + length, 0, kind, extra);
        addText(doc, 0, 0, words[k], { arrow: arrow.id, slot: 'below' });
        x += length + 2.6;
      });
      // Trx with its disulfide, and with two SH
      const trx = (x0, closed) => {
        const label = addAtom(doc, x0, 0, '*', { alias: 'Trx' });
        const s1 = addAtom(doc, x0 + 1.05, -0.6, 'S');
        const s2 = addAtom(doc, x0 + 1.05, 0.6, 'S');
        addBond(doc, label.id, s1.id);
        addBond(doc, label.id, s2.id);
        if (closed) addBond(doc, s1.id, s2.id);
      };
      const y = 3.6;
      trx(0.6, true);
      for (const atom of doc.atoms.values()) atom.y += y;
      const arrow = addArrow(doc, 2.6, y, 6.6, y, 'equilibrium', {
        sides: [{ id: doc.nextId++, side: 'above', way: 'in', reach: 1 }, { id: doc.nextId++, side: 'below', way: 'out', reach: 1 }],
      });
      addText(doc, 0, 0, '2 e^{−}, 2 H^{+}', { arrow: arrow.id, slot: 'above-in' });
      addText(doc, 0, 0, '2 e^{−}, 2 H^{+}', { arrow: arrow.id, slot: 'below-out' });
      const before = new Set(doc.atoms.keys());
      trx(7.5, false);
      for (const atom of doc.atoms.values()) if (!before.has(atom.id)) atom.y += y;
      olomol.setDoc(doc);
    }, [[say('převažují produkty', 'favours the products'), say('neproběhne', 'does not go'), say('totéž', 'the same')]]);
    await fit(30, 70);
    await svg('sipky');
  }
  // Lewis symbols of single atoms: B, C, N and O with their electrons each on a side of their own, Cl with
  // three pairs and one; in dots (lewis) and in bars (lewis-cary)
  if (take('lewis')) {
    await clear();
    await state(async () => {
      const { addAtom, emptyDoc } = await import('/src/model/doc.js');
      const doc = emptyDoc();
      [['B', 4], ['C', 5], ['N', 4], ['O', 3], ['Cl', 2]].forEach(([el, radical], k) => addAtom(doc, k * 1.6, 0, el, { radical, hCount: 0, lonePairs: 'auto' }));
      olomol.setDoc(doc);
    });
    await fit(30, 70);
    await svg('lewis');
    await svg('lewis-cary', { pairStyle: 'bars' });
  }
}
// Help: an example, its curved arrow pointed at (a lower window: less empty room in it); also alone (--only napoveda)
async function helpShot() {
  await page.setViewportSize({ width: 1440, height: 740 });
  await clear();
  await page.getByTestId('help').click();
  await page.getByTestId('example-friedel-crafts').click();
  await page.waitForTimeout(800);
  const drawing = await box('.examples-view svg');
  await page.mouse.move(drawing.x + drawing.width * 0.12, drawing.y + drawing.height * 0.26);
  await page.getByTestId('example-tip').waitFor({ timeout: 5000 }).catch(() => console.log('no tip over the example'));
  await page.waitForTimeout(400);
  await shot('napoveda');
  await page.mouse.move(5, 450);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
}

const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
// the screenshots in 256 colours: a third of the size, the same to the eye (scripts/shrink-pictures.py)
const shrink = () => {
  const shrunk = spawnSync('python3', ['scripts/shrink-pictures.py', OUT], { encoding: 'utf8' });
  if (shrunk.status === 0) process.stdout.write(shrunk.stdout);
  else console.log('pictures not shrunk (python3 with Pillow needed: python3 scripts/shrink-pictures.py)');
};
if (only) {
  if (only.includes('napoveda')) await helpShot();
  await newShots(only.filter((name) => name !== 'napoveda'));
  await browser.close();
  shrink();
  console.log(`pictures in ${OUT}/: ${only.join(', ')}`);
  process.exit(0);
}

// 1. the window: aspirin, selected, the panel beside it (a lower window: less empty canvas)
await page.setViewportSize({ width: 1440, height: WINDOW_HEIGHT });
await show('CC(=O)Oc1ccccc1C(=O)O', 380);
await selectAll();
await page.waitForTimeout(300);
await shot('okno');
// where the parts of the window are (shares of the picture), for the numbers on it
const parts = {};
for (const name of ['topbar', 'rail', 'dock', 'inspector', 'tool-hint', 'topright']) {
  const b = await box(`.${name}`);
  parts[name] = { x: (b.x + b.width / 2) / 1440, y: (b.y + b.height / 2) / WINDOW_HEIGHT, left: b.x / 1440, top: b.y / WINDOW_HEIGHT, right: (b.x + b.width) / 1440, bottom: (b.y + b.height) / WINDOW_HEIGHT };
}
writeFileSync(`${OUT}/okno.json`, `${JSON.stringify(parts, null, 1)}\n`);
await page.setViewportSize({ width: 1440, height: 900 });

await hints(false);

// 2. the bond tool's variants
await clear();
await page.getByTestId('tool-bond').click({ button: 'right' });
await page.waitForTimeout(300);
{
  const fly = await box('.flyout');
  const rail = await box('.rail');
  await shot('nastroje-vazby', around([fly, { x: rail.x, y: fly.y - 40, width: rail.width, height: fly.height + 80 }], 8));
}
await page.keyboard.press('Escape');

// 3. Name / SMILES with the live picture, and a SMILES with a mistake
await clear();
await page.getByTestId('from-name').click();
await page.getByTestId('from-name-field').fill('CC(=O)Oc1ccccc1C(=O)O');
await page.getByTestId('smiles-preview').waitFor();
await page.waitForTimeout(600);
await shot('nazev-smiles', around([await box('.dialog')], 0));
await page.getByTestId('from-name-field').fill('');
await page.waitForTimeout(300);
await page.getByTestId('from-name-field').fill('CN(C)(C)C');
await page.waitForTimeout(800);
await shot('smiles-chyba', around([await box('.dialog')], 0));
await page.keyboard.press('Escape');

// 4. templates
await clear();
await page.getByTestId('templates').click();
await page.getByRole('button', { name: say('Konformace a projekce', 'Conformations and projections'), exact: true }).click();
await page.waitForTimeout(800);
await shot('sablony', around([await templatesBox()], 0));
// (the functional groups, with their abbreviations on the cards)
await page.getByRole('button', { name: say('Funkční skupiny', 'Functional groups'), exact: true }).click();
await page.waitForTimeout(1000);
await shot('sablony-skupiny', around([await templatesBox()], 0));
await page.getByTestId('template-search').fill('?ester');
await page.waitForTimeout(1500);
await shot('sablony-hledani', around([await templatesBox()], 0));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');

// 5. the Info card of aspirin
await show('CC(=O)Oc1ccccc1C(=O)O', 900);
await selectAll();
await page.getByTestId('formula').click();
await page.waitForFunction(() => [...document.querySelectorAll('.ident .name')].some((n) => n.textContent === 'InChIKey'), null, { timeout: 30_000 });
await page.waitForTimeout(300);
await shot('info', around([await box('.info-card'), await box('.inspector')]));
await page.getByTestId('formula').click();

// 6. IUPAC numbering, with the reason; the drawing beside the panel
await show('OC(C)CCCCl', 600, 60);
await placeAt(960, 380, 60);
await selectAll();
await page.getByTestId('atom-numbers').check();
await page.waitForTimeout(500);
await shot('cislovani', around([await box('.inspector'), await drawingBox()], 8));

// 7. a molecule selected: the panel; then one atom: its own part of the panel
await show(CATECHOLAMINES[3][1], 380);
await placeAt(800, 330, 50);
await selectAll();
await page.waitForTimeout(300);
await shot('panel-molekula', around([await box('.inspector'), await drawingBox()], 8));
await show('CC(=O)[O-]', 380);
await placeAt(960, 300, 60);
await state(() => olomol.select([[...olomol.doc.atoms.values()].find((a) => a.charge === -1).id]));
await page.waitForTimeout(300);
await shot('panel-atom', around([await box('.inspector'), await drawingBox()], 8));

// 8. the mechanism as SVG
await show(ket(mechanism));
await svg('mechanismus');

// 9. SN2: as SVG, and a curved arrow selected (the panel's Other way)
await show(ket(substitution), 380);
await svg('sn2');
await show(ket(beforeArrow(sn2())), 380);
await placeAt(850, 300, 80);
await state(() => olomol.select([[...olomol.doc.curves.keys()][0]]));
await page.waitForTimeout(400);
await shot('sipka-panel', around([await box('.inspector'), await drawingBox()], 8));

// 10. colours and highlights: aspirin, the highlighter's colours open
await show(ket(aspirin()), 30, 70);
await placeAt(560, 420, 70);
await page.getByTestId('tool-highlight').click({ button: 'right' });
await page.waitForTimeout(300);
{
  const fly = await box('.flyout');
  const rail = await box('.rail');
  await shot('zvyrazneni', around([fly, await drawingBox(), { x: rail.x, y: fly.y - 20, width: rail.width, height: fly.height + 20 }], 6));
}
await page.keyboard.press('Escape');

// 11. six catecholamines: the Align menu, then the grid, highlighted
await show(ket(catecholDoc), 30, 40);
await selectAll();
await page.getByTitle(say('Zarovnat: do řady, rovnoměrně rozmístit, mřížka, reakční schéma', 'Align: line up, space evenly, grid, reaction scheme')).click();
await page.waitForTimeout(400);
await shot('zarovnat', around([await box('.menu')], 0));
await page.locator('.menu input[type=number]').first().fill('3');
await page.getByRole('button', { name: say('Uspořádat do mřížky', 'Arrange in a grid'), exact: true }).click();
await page.keyboard.press('Escape');
await state(() => olomol.clearSelection());
await page.waitForTimeout(300);
await svg('katecholaminy');

// 12. the style settings: charges, lone pairs and atom colours
await show(ket(zwitterion(RDKit)));
await svg('styl-vychozi');
await svg('styl-lewis', { colorMode: 'mono', pairStyle: 'bars', chargeStyle: 'circled' });

// 13. the cover: penicillin G with R/S labels on every atom and bond
await show(ket(cover));
await state(async () => {
  const { stereoLabels } = await import('/src/chem/stereo.js');
  const { buildScene } = await import('/src/render/scene.js');
  const { sceneToSVG } = await import('/src/render/svg.js');
  const { STYLE } = await import('/src/render/style.js');
  const doc = structuredClone(olomol.doc);
  for (const object of [...doc.atoms.values(), ...doc.bonds.values()]) object.cipLabel = true;
  const stereo = await stereoLabels(doc);
  return sceneToSVG(buildScene(doc, { ...olomol.settings, ink: '#000000' }, { stereo }), { scale: STYLE.exportScale, background: '#ffffff' });
}).then((text) => writeFileSync(`${OUT}/titul.svg`, text));

// 14. menus: Export, Settings (over an empty canvas, its hint hidden)
await clear();
await state(() => document.querySelector('.empty-hint')?.style.setProperty('visibility', 'hidden'));
await page.getByTitle('Export: SVG, PNG, molfile, SMILES, InChI…').click();
await page.waitForTimeout(300);
await shot('export', around([await box('.menu')], 0));
await page.keyboard.press('Escape');
await page.getByTitle(say('Nastavení', 'Settings'), { exact: true }).click();
await page.waitForTimeout(300);
await shot('nastaveni', around([await box('.menu')], 0));
await page.keyboard.press('Escape');

// 15. the periodic table
await clear();
await page.getByTitle(say('Periodická tabulka', 'Periodic table'), { exact: true }).click();
await page.waitForTimeout(400);
await shot('periodicka', around([await box('.dialog')], 0));
await page.keyboard.press('Escape');

// 16. re-layout of quinine: a choice of drawings, the last ones from 3D
await show('COc1ccc2nccc([C@@H](O)[C@@H]3C[C@@H]4CCN3C[C@@H]4C=C)c2c1', 380);
await selectAll();
await page.getByTestId('relayout').click();
await page.getByTestId('layout-card').nth(2).waitFor({ timeout: 60_000 }).catch(() => console.log('fewer re-layout candidates than expected'));
await drawn();
await page.waitForTimeout(1000);
await shot('rozvrzeni', around([await box('.dialog')], 0));
await page.keyboard.press('Escape');

// 17. reporting a problem: the envelope's window (an empty drawing: no link in the table)
await clear();
await state(() => document.querySelector('.empty-hint')?.style.setProperty('visibility', 'hidden'));
await page.getByTestId('help').click(); // (reporting is in Help)
await page.getByTestId('help-report').click();
await page.getByTestId('report-table').locator('tr').nth(7).waitFor({ timeout: 10_000 });
await page.waitForTimeout(300);
await shot('nahlaseni', around([await box('.dialog')], 0));
await page.keyboard.press('Escape');

// 18. Turn in 3D: bornyl salicylate as pasted, in the window, turned by hand until the bornane looks
// as in a textbook, and the drawing that gives (methyls as plain line ends: CH3 labels crowd the cage)
const methylLabels = await state(() => olomol.settings.terminalCarbons);
await state(() => olomol.setSettings({ terminalCarbons: false }));
await show(BORNYL_SALICYLATE, 30, 42);
await svg('otoceni-pred');
await selectAll();
await page.getByTestId('turn3d').click();
await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
await page.waitForTimeout(600);
await page.getByTestId('turn3d-stage').focus();
for (const key of TURNS) await page.keyboard.press(key);
await state(() => {
  document.activeElement.blur(); // (no focus ring in the picture)
  // the panel as tall as the molecule needs, without the empty room round it
  const stage = document.querySelector('[data-testid="turn3d-stage"]');
  const b = stage.querySelector('g').getBBox();
  const margin = 14;
  stage.setAttribute('viewBox', `${b.x - margin} ${b.y - margin} ${b.width + 2 * margin} ${b.height + 2 * margin}`);
  stage.style.height = `${(stage.clientWidth * (b.height + 2 * margin)) / (b.width + 2 * margin)}px`;
});
await page.waitForTimeout(400);
await shot('otoceni-okno', around([await box('.turn3d')], 0));
await page.getByTestId('turn3d-use').click();
await page.waitForTimeout(600);
await state(() => olomol.clearSelection());
await svg('otoceni-po');

// 19. Redraw of a part: that bornyl salicylate, only its salicylate selected, and the drawing picked
await state(() => {
  // the salicylate: what the bornane (from a carbon with four carbons on it) can't reach without passing an oxygen
  const { atoms, bonds } = olomol.doc;
  const carbons = (id) => [...bonds.values()].filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a)).filter((n) => atoms.get(n).el === 'C');
  const bornane = new Set([[...atoms.values()].find((a) => a.el === 'C' && carbons(a.id).length === 4).id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const b of bonds.values()) {
      for (const [x, y] of [[b.a, b.b], [b.b, b.a]]) {
        if (bornane.has(x) && !bornane.has(y) && atoms.get(y).el !== 'O') {
          bornane.add(y);
          grew = true;
        }
      }
    }
  }
  olomol.select([...atoms.keys()].filter((id) => !bornane.has(id)));
});
await page.getByTestId('relayout').click();
await page.getByTestId('layout-part').waitFor({ timeout: 60_000 });
await page.getByTestId('layout-card').nth(2).waitFor({ timeout: 60_000 }).catch(() => console.log('fewer drawings of a part than expected'));
await drawn();
await page.waitForTimeout(1000);
// (all its drawings: the one picked may be among the rest; down to the end of that section)
if (await page.getByTestId('layout-all').count()) await page.getByTestId('layout-all').click();
await page.waitForTimeout(400);
{
  const dialog = await box('.dialog');
  const section = await box('[data-testid="layout-part"]');
  await shot('prekresleni-casti', around([{ ...dialog, height: section.y + section.height + 10 - dialog.y }], 0));
}
await page.getByTestId('layout-part').locator('.card', { hasText: say('Vybraná část překreslená 1', 'Selected part redrawn 1') }).click();
await page.waitForTimeout(600);
await state(() => olomol.clearSelection());
await svg('prekresleni-po');
await state((on) => olomol.setSettings({ terminalCarbons: on }), methylLabels);

// 20. a complex in the same window: EDTA round calcium (only the molecule, without the room round it)
await show(ket(caEdta()), 30, 42);
await selectAll();
await page.getByTestId('turn3d').click();
await page.getByTestId('turn3d-stage').waitFor({ timeout: 60_000 });
await page.waitForTimeout(600);
{
  const b = await state(() => {
    const r = document.querySelector('[data-testid="turn3d-stage"] g').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await shot('otoceni-edta', around([b], 14));
}
await page.keyboard.press('Escape');

// 21. Help: an example, its curved arrow pointed at (helpShot)
await helpShot();

// 22. the bar over a text, a formula in it
await clear();
await page.getByTestId('tool-text').click();
await page.mouse.click(620, 400);
await page.keyboard.type('CO32-');
await page.getByTestId('text-chem').click();
await page.waitForTimeout(500);
await shot('text-okenko', around([await box('.text-tools'), await box('.text-editor')], 10));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');

// 23. the mark that says the drawing is kept
await show('CC(=O)Oc1ccccc1C(=O)O', 380);
await page.waitForTimeout(1000);
await state(() => { document.querySelector('.title-field').style.width = '172px'; }); // (the mark right after the name)
await page.waitForTimeout(200);
await shot('znacka-ulozeno', around([await box('[data-testid="kept-mark"]'), await box('.title-field')], 4));

// 24. drawings from the examples: anchors, side arcs, a complex in brackets
for (const [example, name] of [['aspirin', 'kotvy'], ['enzyme', 'bocni-oblouky'], ['cobalt', 'komplex-kobalt']]) {
  await show(readFileSync(`src/ui/examples/${example}.olom`, 'utf8'));
  await svg(name);
}

// 25. PubChem's page of cards, for alanine drawn without stereochemistry (it needs the internet)
{
  const cards = await context.newPage();
  const address = new URL('pubchem.html', base);
  address.searchParams.set('lang', english ? 'en' : 'cs');
  address.hash = 'inchikey=QNAYBMKLOCPYGJ-UHFFFAOYSA-N&smiles=CC(N)C(%3DO)O';
  await cards.goto(address.href);
  try {
    await cards.waitForSelector('.cards .card', { timeout: 30_000 });
    await cards.waitForTimeout(2500);
    const b = await cards.locator('#message').boundingBox();
    await cards.screenshot({ path: `${OUT}/pubchem-karty.png`, clip: { x: b.x - 6, y: b.y - 6, width: b.width + 12, height: b.height + 12 } });
  } catch {
    console.log('no PubChem: pubchem-karty.png not taken');
  }
  await cards.close();
}

// the pictures of 0.4 (on the same page, before it goes)
await newShots();
await context.close();

// 26. the login window and the Install button of a built site (the login is in Czech only)
if (built && !english) {
  const profile = 'test-output/manual-profile';
  const persistent = await chromium.launchPersistentContext(profile, { channel: process.env.PW_CHANNEL ?? 'chrome', viewport: { width: 1200, height: 760 }, deviceScaleFactor: 2, locale: 'cs-CZ', colorScheme: 'light' });
  const site = persistent.pages()[0] ?? (await persistent.newPage());
  await site.goto(built);
  await site.locator('#lock input[type=password]').waitFor();
  await site.waitForTimeout(300);
  const form = await site.locator('#lock form').boundingBox();
  await site.screenshot({ path: `${OUT}/prihlaseni.png`, clip: { x: form.x - 30, y: form.y - 30, width: form.width + 60, height: form.height + 60 } });
  await site.locator('#lock input[type=password]').fill(process.env.OLOMOL_PASSWORD ?? 'heslo');
  await site.keyboard.press('Enter');
  await site.locator('.canvas').waitFor();
  await site.evaluate(() => navigator.serviceWorker.ready);
  await site.reload();
  await site.locator('.canvas').waitFor({ timeout: 30_000 }).catch(async () => {
    await site.locator('#lock input[type=password]').fill(process.env.OLOMOL_PASSWORD ?? 'heslo');
    await site.keyboard.press('Enter');
    await site.locator('.canvas').waitFor();
  });
  await site.getByTestId('install').waitFor({ timeout: 15_000 }).catch(() => console.log('no Install button offered'));
  const bar = await site.locator('.topright').boundingBox();
  await site.screenshot({ path: `${OUT}/instalace.png`, clip: { x: bar.x - 10, y: bar.y - 8, width: bar.width + 20, height: bar.height + 16 } });
  await persistent.close();
}
await browser.close();
shrink();
console.log(`pictures in ${OUT}/`);
