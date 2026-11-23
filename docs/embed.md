# olomol in your own page

olomol can be put into any web page: a lab's wiki, a blog post, a course page, a quiz or practice site. You choose
which of olomol's tools the people using your page get and the drawing they start from, and, with a few lines of code,
read back what they drew. Without code, it is an iframe whose address says it all (below); with `<olomol-editor>`,
your page reads the drawing as data. olomol hands over the data; what your page does with it (keeping it, checking an
answer) is up to your page.

Free (MIT). If you use it in teaching or research, please cite olomol: DOI on <https://olomol.org/about.html>.

The quickest way: in olomol, **Export → Embed in a page…** writes both kinds of code below for the drawing you have,
with the tools you tick (PubChem among them, on its own), ready to copy.

## The address

Everything an embedded olomol needs is in its address:

    https://olomol.org/embed.html?only=curved-arrows,charges-electrons#smiles=CC(=O)O.OCC

| Part | |
|---|---|
| `?only=…` | the parts of olomol the user gets, by name, commas between (below); without it, all |
| `?off=…` | all parts but these |
| `?readonly` | only to look at: no tools, no panel; zooming |
| `?theme=dark` | `light` (the default), `dark`, or `auto` (the user's system) |
| `?arrowcolor=1035a9` | the colour of curved arrows that have none of their own (a hex colour, `#` optional); black without |
| `?changedelay=0` | how long after the user's change settles `change` is sent, in ms; 150 without |
| `?lang=cs` | the language (`en`, `cs`, `de`); without it, the user's browser's |
| `#d=…` | the drawing, as olomol writes it in links (Copy link) |
| `#smiles=…` | the drawing from a SMILES (or `#inchi=`, `#name=`, `#cid=`), laid out by olomol |

The parts:

| Name | |
|---|---|
| `structure` | drawing and changing structures: atoms, bonds, rings, elements, abbreviations |
| `charges-electrons` | charges, partial charges, lone pairs, unpaired electrons |
| `curved-arrows` | curved arrows (electron pushing) |
| `orbitals` | orbitals |
| `reaction-arrows` | reaction arrows and "+" signs |
| `text` | text and atom numbers |
| `brackets` | brackets |
| `colors` | colours and highlights |
| `templates` | templates |
| `structures-from-text` | structures from SMILES, InChI or molfiles, typed or pasted |
| `structures-from-names` | structures from names and PubChem |
| `chairs-projections` | ring flip, turning a chair, Fischer projections, zigzag |
| `align-flip` | aligning and flipping |
| `redraw` | Redraw |
| `turn-in-3d` | Turn in 3D and 3D models |
| `molecule-info` | information about molecules: formula, mass, names, identifiers, R/S |
| `export` | export and copying as a picture |

(Before 0.6.0 some had shorter names: `arrows`, `electrons`, `reactions`, `colours`, `import`, `pubchem`,
`projections`, `arrange`, `3d`, `info`, and `?view` for `?readonly`. They are still read.)

Selecting, moving, zooming, undo and Erase are always there. The user starts with the bond tool, or, with
`structure` off, the curved-arrow tool (if `curved-arrows` is on), else Select. A part switched off is gone
everywhere: its buttons, keys, menus and search entries; and any change that would add, take away or change something
of it (a key over an atom, Delete, a paste) is refused. Where atoms are and which way a wedge points stay free: that is
how a structure is drawn, not what it is. An embedded olomol keeps nothing in the browser and has no files or tabs.

Switching parts off is for focus, not for security: anyone who knows the browser's developer tools can get round
anything in the page. Check answers that count (marks, a grade) on your server.

## With code: `<olomol-editor>`

```html
<script src="https://olomol.org/embed.js"></script>
<olomol-editor id="q1" src="https://olomol.org/embed.html?only=curved-arrows#d=…" height="400"></olomol-editor>
<button id="check">Check</button>
<script>
  const editor = document.getElementById('q1');
  document.getElementById('check').onclick = async () => {
    const arrows = await editor.get('curvedArrows');
    // compare with the answer (A check, below), mark what is wrong:
    await editor.highlight({ curvedArrows: [arrows[0].id] }, '#fecaca');
    await editor.showMessage('The first arrow starts at the wrong lone pair.', { kind: 'error' });
  };
</script>
```

Instead of `src`, the address can be given in parts: `only`, `off`, `readonly`, `theme`, `arrowcolor`,
`changedelay`, and the drawing as `smiles` or `drawing` (a `#d=…`). `height` in pixels (420 without). `lang`: olomol's language (`en`, `cs`, `de`; as `?lang=` in the address).

Each call returns a promise; calls made before olomol has loaded wait for it. When the frame loads anew (an attribute
other than `smiles` or `drawing` changed, or the element moved in the page), calls olomol hadn't answered are rejected;
later ones wait for it again.

A colour is a hex colour, `'#2563eb'` or `'#26e'`. A highlight can also have a pattern, told apart without its colour:
`'hatch:#f87171'` (diagonal stripes), `'lines:#2563eb'` (upright ones), `'dots:#7c3aed'`. Anything else is refused
with an error, and a drawing given with other colours is drawn without them.

| Call | |
|---|---|
| `get('curvedArrows')` | the curved arrows (below) |
| `get('canonicalForms')` | the step as strings the same for every drawing of the same answer (below) |
| `get('olom')` | the whole drawing as an object: olomol's file format ([olom.md](olom.md)), with every atom's `id` |
| `get('smiles')`, `get('inchi')`, `get('molfile')` | the structures, as text |
| `get('inchikeys')` | the InChIKey of each molecule, one a line, in the drawing's order: to compare products molecule by molecule |
| `get('canonicalSmiles')` | each molecule's canonical SMILES, one a line, in the drawing's order: bond orders and charges count (resonance forms apart, which InChIKeys aren't) |
| `get('conformations')` | how the drawing shows its molecules in space: `{ chairs: [{ ring, groups: [{ atom, first, slot: 'axial' \| 'equatorial' }] }], newmans: [{ front, back, pairs: [{ front, back, dihedral, relation: 'anti' \| 'gauche' \| 'eclipsed' \| 'anticlinal' }] }] }`, by atom ids |
| `get('molecules', drawing, { group })` | each molecule: `{ atoms, smiles, lewis, pairs, formula, chiral, contains }`: its canonical SMILES; the same with the lone pairs shown and δ+/δ− counted (`lewis`), with the lone pairs alone (`pairs`); its formula (`C4H10O`, `NO3-`); chiral (not its own mirror image as drawn; drawn flat, with a stereocentre); with `group` (a drawing of a few atoms), whether it has them bonded so. Abbreviations are drawn out first |
| `get('atomClasses')` | `{ atomId: class }`: atoms alike have the same class (the three H of a methyl; stereo counts as drawn), to accept any of equivalent atoms |
| `get('svg')`, `get('png')` | a picture: SVG text, PNG as a `data:` URL |
| `get('partsOn')` | the parts switched on |
| `get('version')` | `{ olomol: '0.6.0', protocol: 1 }` |
| `get(what, drawing)` | any of these for another drawing (what `set` takes), read on the side; the one on screen stays as it is |
| `set(drawing)` | another drawing in place of this one, with nothing to undo: an olomol link (`#d=…`), `.olom` text or object, a molfile, SMILES or InChI |
| `set(drawing, { only, off, locked })` | the same, with its own parts (as `setParts`) and, with `locked: true`, all its atoms locked (as `lock`) |
| `setParts({ only, off, keepView })` | other parts from now, without loading olomol again (the drawing fitted to the bars again; `keepView: true`, not: the view stays): `setParts({ only: ['structure', 'charges-electrons'] })` for a "now draw the product" stage. A name olomol doesn't know is an error |
| `lock(atomIds)` | these atoms stay as given: their element, hydrogens, label and bonds (none taken away, none added, none changed). Moving them, their charges and lone pairs (their own part) and curved arrows to and from them stay free; so does everything else. `lock('all')`: every atom now there; `lock(null)`: none |
| `pick({ kinds, count, colour })` | waits for the user to click `count` things (1 without) of `kinds`: `'atom'` (the default), `'bond'`, `'lonePair'`, `'unpairedElectron'`, `'curvedArrow'`; resolves with them (below). Clicked again: unpicked. What was picked stays marked until you clear it (`highlight('all', null)`). Esc, another tool, another drawing (`set`, `clear`) or another `pick` rejects it. Works in a read-only editor too |
| `highlight(targets, colour)` | mark things in a colour, `null` to unmark: a list of atom ids (and the bonds among them), or `{ atoms: [ids], bonds: [[a, b]], curvedArrows: [ids], texts: [ids] }`, or `'all'`. Your feedback, not part of the user's drawing |
| `select(targets)` | the selection set: `{ atoms, bonds: [[a, b]], curvedArrows, texts }`, or `null` for none; `get('selection')` reads it, in the same form. With the select tool (and no other part), a page can let users mark things as they select them: click, Shift+click, a box, a double click for a molecule |
| `showMessage(text, { kind, seconds })` | your words in olomol's message bubble, where the user is looking: `kind` `'info'`, `'success'` or `'error'`; 6 seconds, `seconds: 0` until the next; `showMessage(null)` hides it |
| `readOnly(true)` / `readOnly(false)` | only to look at (after checking, or to show the answer), and back |
| `clear()`, `fit()` | an empty drawing (nothing locked); everything in view |
| `fit(drawing)` | everything in view, and the extent of another drawing too: the answer's, so the room where the user will draw is in view |

What `pick` resolves with, a list in the order clicked:

```js
[{ atom: 7 }, { bond: [3, 4] }, { lonePair: 8 }, { unpairedElectron: 5 }, { curvedArrow: 13 }]
```

"Click the most acidic H", "the electrophilic carbon", "the bond that breaks": olomol doesn't know the question,
only where the user clicked.

Events on the element:

| Event | `event.detail` |
|---|---|
| `ready` | loaded: `{ version, protocol, partsOn, drawing: 'address' \| 'none', error }` |
| `select` | the selection changed (a click, Shift+click, a box): `{ selection }`, as `get('selection')` gives it; the page's own `select` not said back |
| `change` | the user changed the drawing: `{ changed: ['curvedArrows'] }`, which kinds of things (`atoms`, `bonds`, `curvedArrows`, `reactionArrows`, `pluses`, `texts`, `brackets`, `orbitals`, `orbitalOverlaps`, `fills`, `models3d`). Ask for what you need |
| `error` | the drawing in the address couldn't be read: `{ message }` (the user sees it in olomol too) |

Your own `set`, `highlight` and `pick` marks don't send `change`; neither does a click that changes nothing.

### Keeping what was drawn

`get('olom')` gives everything drawn; keep it where you keep attempts, and `set()` it back later. `set` leaves nothing
to undo, so the user goes on from what was kept.

### The arrows

`get('curvedArrows')` gives each curved arrow by the ids of atoms in the drawing. The ids are the drawing's own, the
same in what the user starts from and its answer when both come from one drawing (the answer drawn, then what the
user fills in taken out), and they stay the same however olomol is updated, since the drawing carries them.

```js
{ id: 13, electrons: 2,             // 2: a curved arrow, 1: a fishhook
  from: { lonePair: 8 },             // or { unpairedElectron: 8 }, { bond: [3, 4] }, { orbital: 21, atom: 8 }
  to: { newBond: [3, 8] } }          // or { atom: 3 }, { bond: [3, 4] }, { orbital: 21, atom: 3 }
```

One way to write each arrow:

- a bond is its two atoms, the smaller id first;
- which lone pair (which dots) an arrow starts at isn't given: that is how it was drawn, not chemistry;
- an arrow from an atom's electrons to an atom not bonded to it makes a bond between them, `{ newBond: [a, b] }`,
  whether drawn to the atom or to the middle between them;
- an arrow from a bond to a third atom stays `{ atom }` (which end of the bond bonds to it is the chemist's to say).

The arrow's own `id` is the user's: leave it out when comparing.

### The canonical form: the same answer, the same string

Comparing arrows by atom ids is too strict: a methyl shift on a tert-butyl group may move any of its three methyls, a
proton may come from any H of H₃O⁺. `get('canonicalForms')` gives the step as strings that are the same for every
drawing of the same answer, whichever of equivalent atoms an arrow uses, in whatever order the arrows were drawn,
whatever the atom ids and the layout, with hydrogens no arrow uses drawn out or not:

```js
{ step: '…',                // the step's molecules (before the reaction arrow) with all their curved arrows
  curvedArrows: ['…', …],   // each arrow alone on them, in get('curvedArrows') order: which arrows are right whatever the others
  products: 'CC(C)=O.O' }   // after the reaction arrow and leaving on it, as canonical SMILES; null without one
```

Compare it with the answer's worked out the same way, by the same olomol: `get('canonicalForms', answer)`, the answer's
drawing given (a link's `#d=…`, or .olom), not a string stored earlier. The answer is right when the two `step`s are equal; an arrow is right when its string is
among the answer's `curvedArrows`. (How: the molecules as a graph, each curved arrow added as a tail and a head bonded
to where the electrons come from and go, and RDKit's canonical SMILES of the whole, which numbers a graph the same
whatever its symmetry. It isn't a molecule; don't read it as one.) It knows symmetry, not chemistry: another valid
mechanism or a resonance form is another string.

Symmetry counts in 3D where the drawing shows 3D (wedges, a chair, a Newman or Fischer projection; a double bond's
two sides). In an E2 on a bromocyclohexane chair with Br axial, the axial H on C2 or C6 (anti to Br) are the same
answer, but the equatorial H on C2 is another. In a Newman projection, the H anti to the leaving group differs from
the gauche ones. Mirror-image atoms of a molecule that is its own mirror image count as one: the two H of ethanol's
CH₂, or C2's and C6's axial H. Stereo the drawing doesn't show doesn't count: drawn flat, the two H of a CH₂ are
alike, and a bare cyclohexane chair's axial and equatorial H are alike too (a conformation, not a configuration).

### A check

For a quiz or practice page: a check that forgives equivalent atoms and any order, and says which arrows are wrong (`answer`: the answer's drawing,
kept in your page or on your server):

```js
const [mine, drawn] = [await editor.get('canonicalForms'), await editor.get('curvedArrows')];
const right = await editor.get('canonicalForms', answer);   // the answer's, worked out now, as the user's
if (mine.step === right.step) { /* right */ }
else {
  const left = [...right.curvedArrows], wrong = [];
  mine.curvedArrows.forEach((form, i) => {
    const at = left.indexOf(form);
    if (at >= 0) left.splice(at, 1); else wrong.push(drawn[i]);   // drawn[i]: where to mark it
  });
  await editor.highlight({ curvedArrows: wrong.map((arrow) => arrow.id) }, '#fecaca');
  // wrong.length arrows not right, left.length still to draw
}
```

With products drawn by the user, compare `mine.products` with `right.products` too (or each molecule's
`get('inchikeys')`). What a check can't know is yours to decide: another valid mechanism, another order of steps, a
resonance form.

Mechanisms in several steps: give each step its own start drawing, not what the user made of the step before, so
one mistake doesn't carry on; set the next once this one is done (`set(next)`). A step whose products the user draws:
`set(start, { only: ['curved-arrows', 'structure', 'charges-electrons'], locked: true })` gives the structure
tools with what they start from locked.

## Without the element

`embed.js` is a small wrapper around `postMessage`. To talk to the iframe yourself, send it
`{ olomol: 1, id, call, args }` (`call` as above: `'get'`, `args: ['curvedArrows']`); it answers your page with
`{ olomol: 1, id, result }` or `{ olomol: 1, id, error }`, and tells the page around it
`{ olomol: 1, event: 'ready' | 'change' | 'error', … }` (the `detail`s above). The version number (1) is there so
that later changes needn't break pages written for this one.

## On your own server

`npm run build` (see the README) gives a `dist/` folder with `embed.html` and `embed.js` in it; served from your
own server, use its addresses instead of olomol.org's.
