// An embedded editor (embed.html) talking with the page around it: the page asks (<olomol-editor>, public/embed.js,
// or its own postMessage), olomol answers; olomol says when it is ready and when the drawing changes.
//
// A question: { olomol: 1, id, call, args }; its answer, to the page that asked: { olomol: 1, id, result } or
// { olomol: 1, id, error }. What olomol says by itself, to the page around it: { olomol: 1, event: 'ready' |
// 'change', ... } (nothing of the drawing in it: the page asks for that). Only the page around it is answered.
//
// The calls (docs/embed.md says the same for page authors):
//   get(what): 'curvedArrows' (as data, embed/arrows.js), 'canonicalForms' (the step as strings the same for the
//     same answer, embed/canonical.js: { step, curvedArrows, products }), 'olom' (the drawing, .olom as an object),
//     'smiles', 'inchi', 'inchikeys' and 'canonicalSmiles' (one a molecule, a line each), 'atomClasses' ({ atomId:
//     class }, alike atoms one class, stereo as drawn), 'conformations' (chairs' axial and equatorial groups, Newman
//     projections' anti and gauche ones: embed/conformations.js), 'molecules' (each molecule: { atoms, smiles, lewis:
//     with the lone pairs and δ shown, formula, chiral, contains: get(what, drawing, { group: a drawing, atoms }), those
//     atoms of it in the molecule, bonded so, their heteroatoms' H as there }), 'hydrogens' ({ atomId: its implicit H }), 'stereocentres' ([{ atom, label: R, S or ? }]), 'molfile', 'svg' (text), 'png' (a data: URL),
//     'partsOn' (the parts switched on, features.js), 'version' ({ olomol, protocol }). (Their names before 0.6.0,
//     arrows, canonical, inchikey and parts, still read.)
//   get(what, drawing): the same about another drawing (the same kinds as set takes), read on the side; the one on
//     screen untouched. For an answer key: get('canonicalForms', key.answer) is the answer's canonical form by this olomol.
//   set(drawing, { only, off, locked }): a drawing in place of the one there (.olom or KET text or object, a molfile,
//     SMILES, InChI, an olomol link), with nothing to undo; with `only`/`off`, the parts for it (as setParts), with
//     `locked: true` all its atoms locked (as lock)
//   setParts({ only, off, keepView }): the parts switched on from now, as the address's ?only= and ?off= (lists or
//     strings of names); the tools and bars follow, the drawing fitted again (keepView: true, not). Returns the parts on.
//   lock(atomIds | 'all' | null): those atoms' structure fixed (features.js: what a locked atom is); null: none
//   pick({ kinds, count, colour }): resolves with what the student clicks, `count` things (1 without) of `kinds`
//     ('atom', 'bond', 'lonePair', 'unpairedElectron', 'curvedArrow'; ['atom'] without), each { atom: id } |
//     { bond: [a, b] } | { lonePair: atomId } | { unpairedElectron: atomId } | { curvedArrow: id }, marked in
//     `colour` as clicked (clicked again: unpicked) and left marked for the page to clear. Esc or another tool:
//     rejected. Works in a read-only editor too.
//   highlight(targets, colour): marked in that colour, or unmarked (null): a list of atom ids (and the bonds among
//     them), or { atoms: [ids], bonds: [[a, b]], curvedArrows: [ids], texts: [ids] }, or 'all' (everything: highlight('all', null)
//     clears). The page's feedback, not the student's change (not undone, refused by no part switched off).
//   showMessage(text, { kind, seconds }): olomol's message bubble with the page's words ('info', 'success' or
//     'error'; 6 s, 0: until the next); null hides it
//   select(targets): the selection set ({ atoms, bonds: [[a, b]], curvedArrows, texts }; null: none); get('selection') reads it
//   readOnly(on): only to look at, or back to the parts on
//   clear(), fit(drawing): everything in view; with a drawing (an answer), its extent taken in too
// Events: 'select' { selection } (the selection changed: a click, Shift+click, a box), 'ready' { version, protocol, partsOn, drawing: 'address' | 'none', error }, 'change' { changed: kinds of
// things changed: atoms, bonds, curvedArrows, … } (only when something the student made changed; ?changedelay= ms
// after it settles, 150 without), 'error' { message } (the drawing in the address couldn't be read).
import { readAny, pngOf, svgOf, writeAs } from '../io/files.js';
import { drawingIn, olomolLink } from '../io/link.js';
import { toOlom } from '../io/olom.js';
import { completeDoc, emptyDoc } from '../model/doc.js';
import { fragments } from '../model/graph.js';
import { partsGiven, partsOn, setLocked, setParts, setReadOnly, startingTool, toolAllowed } from '../features.js';
import { TOOLS } from '../editor/tools.js';
import { arrowsOf } from './arrows.js';
import { conformationsOf } from './conformations.js';
import { isHighlight } from '../model/colour.js';
import { atomClasses, canonicalForms, canonicalSmilesOf, moleculeFacts } from './canonical.js';
import { sidesOf } from './sides.js';
import { getRDKit } from '../io/rdkit.js';
import { writeMolfile } from '../io/molfile.js';
import { electronsByAtom } from '../chem/valence.js';

const VERSION = 1;
const KINDS = ['curvedArrows', 'canonicalForms', 'olom', 'smiles', 'inchi', 'inchikeys', 'canonicalSmiles', 'molecules', 'hydrogens', 'stereocentres', 'atomClasses', 'conformations', 'selection', 'molfile', 'svg', 'png', 'partsOn', 'version'];
// (the names used before 0.6.0, still read)
const OLD_KINDS = { arrows: 'curvedArrows', canonical: 'canonicalForms', inchikey: 'inchikeys', parts: 'partsOn' };

// The drawing's kinds of things by the names the page sees (change events)
const PUBLIC_KINDS = { atoms: 'atoms', bonds: 'bonds', curves: 'curvedArrows', arrows: 'reactionArrows', pluses: 'pluses', texts: 'texts', fills: 'fills', brackets: 'brackets', orbitals: 'orbitals', overlaps: 'orbitalOverlaps', models: 'models3d' };
// (the page's own marks: not the student's change)
const PAGE_FIELDS = new Set(['highlight']);
const signature = (doc) => Object.fromEntries(Object.keys(PUBLIC_KINDS).map((kind) => [kind, JSON.stringify([...(doc[kind]?.values() ?? [])], (key, value) => (PAGE_FIELDS.has(key) ? undefined : value))]));

const PICKED = '#ffd54a';
// what is selected, by kind: atoms by id, bonds as their two atoms, curved arrows by id
function selectionOf(editor) {
  const { doc } = editor;
  const ids = [...editor.selection];
  return { atoms: ids.filter((id) => doc.atoms.has(id)), bonds: ids.filter((id) => doc.bonds.has(id)).map((id) => pair(doc.bonds.get(id).a, doc.bonds.get(id).b)),
    curvedArrows: ids.filter((id) => doc.curves.has(id)), texts: ids.filter((id) => doc.texts.has(id)) };
} // (what pick marks with, unless the page says)
// (a page's colour that isn't one: refused, never written into the drawing's markup; src/model/colour.js)
const NOT_A_COLOUR = "a colour is a hex colour ('#2563eb', '#26e') or one with a pattern ('hatch:#f87171', 'lines:#2563eb', 'dots:#7c3aed')";
const pair = (a, b) => (a < b ? [a, b] : [b, a]);

// Returns { stop, own, opened }: own(change) makes a change of the page's (a new #drawing in the address) without
// saying it; opened(result) says how the address's drawing went (openEmbedded: { opened, error })
export function startBridge(editor, { fit, opened: first = { opened: false, error: null } }) {
  // (the whole drawing in view, whatever the student has selected; and the extent of the drawing last given to
  // fit(drawing), until another drawing is set: an answer, kept in view through the refits after)
  let also = null;
  const whole = () => fit({ selected: false, also });
  const page = window.parent !== window ? window.parent : null;
  if (!page) return { stop: () => {}, own: (change) => change() };
  const tell = (event, more = {}) => page.postMessage({ olomol: VERSION, event, ...more }, '*');
  let selecting = false; // (the page setting the selection: not said back)
  // the drawing as last said (the page's own changes, set and highlight, aren't said back to it)
  let last = editor.docVersion;
  let seen = signature(editor.doc);
  // the page's own change made in `change` (the editor says it at once, before it returns)
  let quiet = false;
  const own = async (change) => {
    quiet = true;
    try {
      return await change();
    } finally {
      quiet = false;
      last = editor.docVersion;
      seen = signature(editor.doc);
    }
  };
  const delayAsked = Number(new URLSearchParams(location.search).get('changedelay'));
  const delay = Number.isFinite(delayAsked) && delayAsked >= 0 && new URLSearchParams(location.search).has('changedelay') ? delayAsked : 150;

  // the parts from now: the tools and bars follow, the drawing fitted once they have
  // (keepView: the view as it is, the drawing not fitted again: switching tools back and forth, the view not jumping)
  const partsNow = async (parts, keepView = false) => {
    setParts(parts);
    if (!toolAllowed(editor.tool)) editor.setTool(startingTool());
    editor.emit();
    if (!keepView) refit();
  };
  // (fitted once the bars have come or gone, two frames on; not waited for: a frame out of view gets no frames until
  // it is scrolled to, and a call waiting for them would wait as long)
  const refit = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => whole()));
  };

  // --- pick: the student clicks, the page gets what ---
  let picking = null; // { kinds, count, colour, picked, resolve, reject }
  const pickedOf = (hit, kinds) => {
    if (!hit) return null;
    if (hit.kind === 'atom' && hit.pair !== undefined && kinds.includes('lonePair')) return { lonePair: hit.id };
    if (hit.kind === 'atom' && hit.radical && kinds.includes('unpairedElectron')) return { unpairedElectron: hit.id };
    if (hit.kind === 'atom' && kinds.includes('atom')) return { atom: hit.id };
    if (hit.kind === 'bond' && kinds.includes('bond')) {
      const bond = editor.doc.bonds.get(hit.id);
      return bond ? { bond: pair(bond.a, bond.b) } : null;
    }
    if (hit.kind === 'curve' && kinds.includes('curvedArrow')) return { curvedArrow: hit.id };
    return null;
  };
  const mark = (item, colour) => {
    const atom = editor.doc.atoms.get(item.atom ?? item.lonePair ?? item.unpairedElectron);
    if (atom) atom.highlight = colour;
    if (item.bond) {
      const bond = [...editor.doc.bonds.values()].find((b) => pair(b.a, b.b).join() === item.bond.join());
      if (bond) bond.highlight = colour;
    }
    const curve = editor.doc.curves.get(item.curvedArrow);
    if (curve) curve.highlight = colour;
  };
  TOOLS.pick = {
    cursor: 'pointer',
    click(ed, g) {
      const item = picking && pickedOf(g.hit, picking.kinds);
      if (!item) return;
      const at = picking.picked.findIndex((p) => JSON.stringify(p) === JSON.stringify(item));
      if (at >= 0) picking.picked.splice(at, 1);
      else picking.picked.push(item);
      mark(item, at >= 0 ? null : picking.colour);
      ed.touched();
      // (the marks are the page's: nothing of the student's to refuse or to say as a change)
      g.labels = ed.labelsNow();
      seen = signature(ed.doc);
      if (picking.picked.length >= picking.count) {
        const done = picking;
        picking = null;
        ed.setTool(ed.tool.back ?? startingTool());
        done.resolve(done.picked);
      }
    },
    cancel() {
      if (!picking) return;
      const gone = picking;
      picking = null;
      gone.reject(new Error('pick cancelled'));
    },
  };

  const calls = {
    // (with a drawing given: about that one, read on the side, the student's untouched: the answer key's answer worked
    // out by this olomol, the same way as the student's, so the two compare whatever olomol's version)
    get: async (what, drawing, { group = null, atoms = null } = {}) => {
      const { settings } = editor;
      void editor.scene; // (texts and arrows in their places)
      const doc = drawing === undefined || drawing === null ? editor.doc : await read(drawing);
      switch (OLD_KINDS[what] ?? what) {
        case 'curvedArrows': return arrowsOf(doc);
        case 'canonicalForms': return canonicalForms(doc, await getRDKit(), sidesOf(doc));
        case 'olom': return toOlom(doc, { settings, title: editor.title });
        case 'partsOn': return partsOn();
        case 'version': return { olomol: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev', protocol: VERSION };
        case 'svg': return svgOf(doc, settings);
        case 'png': {
          const blob = await pngOf(svgOf(doc, settings), 2);
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
        case 'smiles': case 'inchi': return writeAs(doc, what, null, settings);
        // (one a molecule, a line each, in the drawing's order: products compared molecule by molecule)
        case 'inchikeys': {
          const RDKit = await getRDKit();
          const keys = [];
          for (const members of fragments(doc)) {
            const inchi = (await writeAs(doc, 'inchi', members, settings)).trim();
            if (inchi.startsWith('InChI=')) keys.push(RDKit.get_inchikey_for_inchi(inchi));
          }
          return keys.join('\n');
        }
        // (one a molecule, a line each, in the drawing's order: bond orders and charges counted, resonance forms apart)
        case 'canonicalSmiles': return canonicalSmilesOf(doc, await getRDKit()).join('\n');
        // (each molecule's facts for a page checking answers: its SMILES, its Lewis structure's, formula, chiral, the group given in it)
        // (atom id -> its hydrogens, drawn as its label's or implicit: kept when a page takes its charge away)
        case 'hydrogens': return Object.fromEntries([...electronsByAtom(doc)].map(([id, e]) => [id, e.hydrogens]));
        // (the stereocentres, drawn with their stereo or not: [{ atom, label: 'R' | 'S' | '?' }], RDKit's CIP)
        case 'stereocentres': {
          const RDKit = await getRDKit();
          const found = [];
          for (const members of fragments(doc)) {
            let written;
            try {
              written = writeMolfile(doc, members);
            } catch {
              continue;
            }
            const mol = RDKit.get_mol(written.molfile);
            if (!mol) continue;
            try {
              for (const [index, label] of JSON.parse(mol.get_stereo_tags()).CIP_atoms) found.push({ atom: written.atomIds[index], label: label.replace(/[()]/g, '') });
            } finally {
              mol.delete();
            }
          }
          return found;
        }
        case 'molecules': {
          // (abbreviations drawn out, in the query too: CHO is C=O and H)
          const { withGroupsDrawnOut } = await import('../editor/abbreviate.js');
          // (the group: those atoms of the drawing given, its whole molecule there for their hydrogens; all of it without)
          const example = group && (await read(group));
          const query = example && { doc: example, ids: atoms ?? [...example.atoms.keys()] };
          return moleculeFacts(doc, await getRDKit(), query, (d, ids) => withGroupsDrawnOut(d, ids));
        }
        // (atom id -> its class: the same for atoms alike, stereo as drawn; "click the most acidic H")
        case 'atomClasses': return Object.fromEntries(atomClasses(doc, await getRDKit()));
        // (what is selected, by the select tool's clicks, Shift+clicks, boxes: { atoms, bonds: [[a, b]], curvedArrows, texts })
        case 'selection': return selectionOf(editor);
        // (chairs' groups axial or equatorial, Newman projections' groups anti, gauche…: conformations.js)
        case 'conformations': return conformationsOf(doc);
        case 'molfile': return writeAs(doc, 'mol', null, settings);
        default: throw new Error(`get('${what}'): ask for ${KINDS.join(', ')}`);
      }
    },
    set: async (drawing, { only = null, off = null, locked = false } = {}) => {
      const doc = await read(drawing);
      const parts = only !== null || off !== null ? partsGiven({ only, off }) : null;
      put(doc);
      setLocked(locked ? doc.atoms.keys() : []);
      if (parts) await partsNow(parts);
      return true;
    },
    setParts: async ({ keepView = false, ...given } = {}) => {
      await partsNow(partsGiven(given ?? {}), keepView);
      return partsOn();
    },
    lock: (atomIds) => {
      setLocked(atomIds === 'all' ? editor.doc.atoms.keys() : atomIds ?? []);
      return true;
    },
    pick: ({ kinds = ['atom'], count = 1, colour = PICKED } = {}) => {
      const known = ['atom', 'bond', 'lonePair', 'unpairedElectron', 'curvedArrow'];
      const wrong = [kinds].flat().filter((kind) => !known.includes(kind));
      if (wrong.length) throw new Error(`pick: unknown kinds ${wrong.join(', ')}; known: ${known.join(', ')}`);
      if (!isHighlight(colour)) throw new Error(`pick: ${NOT_A_COLOUR}`);
      // (a pick still waiting: rejected, and the tool set before the new one waits, so that setTool's cancelling
      // of the pick tool doesn't reject it too)
      TOOLS.pick.cancel();
      editor.setTool({ name: 'pick', once: true, back: editor.tool.name === 'pick' ? editor.tool.back : editor.tool });
      return new Promise((resolve, reject) => {
        picking = { kinds: [kinds].flat(), count: Math.max(1, Math.floor(count) || 1), colour, picked: [], resolve, reject };
      });
    },
    highlight: (targets, colour = null) => {
      if (colour !== null && !isHighlight(colour)) throw new Error(`highlight: ${NOT_A_COLOUR}`);
      if (targets === 'all') {
        for (const kind of ['atoms', 'bonds', 'curves', 'texts']) for (const thing of editor.doc[kind].values()) thing.highlight = colour;
      } else if (Array.isArray(targets)) {
        const ids = new Set(targets);
        for (const id of ids) {
          const atom = editor.doc.atoms.get(id);
          if (atom) atom.highlight = colour;
        }
        // (not a One compound link between them: nothing is drawn there)
        for (const bond of editor.doc.bonds.values()) if (ids.has(bond.a) && ids.has(bond.b) && bond.kind !== 'link') bond.highlight = colour;
      } else if (targets && typeof targets === 'object') {
        for (const id of targets.atoms ?? []) mark({ atom: id }, colour);
        for (const ends of targets.bonds ?? []) mark({ bond: pair(...ends) }, colour);
        for (const id of targets.curvedArrows ?? []) mark({ curvedArrow: id }, colour);
        for (const id of targets.texts ?? []) if (editor.doc.texts.has(id)) editor.doc.texts.get(id).highlight = colour;
      } else {
        throw new Error("highlight: atom ids, { atoms, bonds, curvedArrows, texts } or 'all'");
      }
      own(() => editor.touched());
      return true;
    },
    // the selection set: { atoms, bonds: [[a, b]], curvedArrows, texts } (as get('selection') gives it), or null: none
    select: (targets) => {
      const { doc } = editor;
      const ids = [];
      for (const id of targets?.atoms ?? []) if (doc.atoms.has(id)) ids.push(id);
      for (const ends of targets?.bonds ?? []) {
        const bond = [...doc.bonds.values()].find((b) => pair(b.a, b.b).join() === pair(...ends).join());
        if (bond) ids.push(bond.id);
      }
      for (const id of targets?.curvedArrows ?? []) if (doc.curves.has(id)) ids.push(id);
      for (const id of targets?.texts ?? []) if (doc.texts.has(id)) ids.push(id);
      // (the page's own selection: not said back to it as the student's)
      selecting = true;
      try {
        own(() => {
          if (ids.length) editor.select(ids);
          else editor.clearSelection();
          editor.emit();
        });
      } finally {
        selecting = false;
        lastSelection = JSON.stringify(selectionOf(editor));
      }
      return true;
    },
    showMessage: (text, { kind = 'info', seconds = 6 } = {}) => {
      if (text === null || text === undefined || text === '') {
        editor.notice = null;
        editor.emit();
      } else {
        editor.say(String(text), ['info', 'success', 'error'].includes(kind) ? kind : 'info', seconds > 0 ? seconds * 1000 : Infinity);
      }
      return true;
    },
    readOnly: async (on) => {
      setReadOnly(on);
      editor.setTool(on ? { name: 'select' } : startingTool());
      editor.clearSelection();
      editor.emit();
      // (fitted again once the bars have come or gone: the drawing not under the rail)
      refit();
      return true;
    },
    clear: () => {
      put(emptyDoc());
      setLocked([]);
      return true;
    },
    // (with a drawing: its extent taken in too, an answer: the room where students will draw)
    fit: async (drawing) => {
      also = drawing !== undefined && drawing !== null ? await read(drawing) : null;
      whole();
      return true;
    },
  };

  // A drawing the page gives: an olomol link (#d=…), .olom text or object, a molfile, SMILES, InChI
  async function read(drawing) {
    let text = typeof drawing === 'string' ? drawing : JSON.stringify(drawing);
    const link = olomolLink(text);
    if (link) text = (await drawingIn(new URL(link).hash)) ?? text;
    return completeDoc((await readAny(text, { settings: editor.settings })).doc);
  }

  // (in place of what is there, nothing to undo: the page's drawing)
  function put(doc) {
    also = null;
    // (a pick still waiting was about the drawing that goes: rejected)
    if (editor.tool.name === 'pick') editor.setTool(editor.tool.back ?? startingTool());
    own(() => {
      editor.setDoc(doc);
      editor.undoStack = [];
      editor.redoStack = [];
      editor.emit();
      whole();
    });
  }

  const listen = async (e) => {
    const message = e.data;
    if (e.source !== page || !message || message.olomol === undefined || !message.call) return;
    // (a page opened from a file has no origin to name: 'null')
    const answer = (more) => e.source.postMessage({ olomol: VERSION, id: message.id, ...more }, e.origin === 'null' ? '*' : e.origin);
    if (message.olomol !== VERSION) return answer({ error: `this olomol speaks version ${VERSION}, the page ${message.olomol}` });
    const call = Object.hasOwn(calls, message.call) ? calls[message.call] : null;
    if (!call) return answer({ error: `no call ${message.call}: ${Object.keys(calls).join(', ')}` });
    try {
      answer({ result: await call(...(message.args ?? [])) });
    } catch (error) {
      answer({ error: error.message });
    }
  };
  window.addEventListener('message', listen);

  // the selection changed (a click, a box, Shift+click; once a drag has ended): said, with what is selected
  let lastSelection = JSON.stringify(selectionOf(editor));
  const unselect = editor.subscribe(() => {
    if (editor.gesture || selecting) return;
    const now = JSON.stringify(selectionOf(editor));
    if (now === lastSelection) return;
    lastSelection = now;
    tell('select', { selection: JSON.parse(now) });
  });

  // a change of the drawing: said once it has settled (a drag says it at its end), with which kinds of things
  // changed and no drawing in it; nothing said when nothing the student made changed (a click, the page's marks)
  let timer = null;
  const unsubscribe = editor.subscribe(() => {
    if (quiet || editor.docVersion === last || editor.gesture) return;
    last = editor.docVersion;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const now = signature(editor.doc);
      const changed = Object.keys(PUBLIC_KINDS).filter((kind) => now[kind] !== seen[kind]).map((kind) => PUBLIC_KINDS[kind]);
      seen = now;
      if (changed.length) tell('change', { changed });
    }, delay);
  });
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  tell('ready', { version, protocol: VERSION, partsOn: partsOn(), drawing: first.opened ? 'address' : 'none', error: first.error });
  if (first.error) tell('error', { message: first.error });
  return {
    own,
    // (the address's drawing read again, a new #…: an error said)
    opened: (result) => {
      if (result?.error) tell('error', { message: result.error });
    },
    stop: () => {
      window.removeEventListener('message', listen);
      unsubscribe();
      unselect();
    },
  };
}
