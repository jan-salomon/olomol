# The .olom file format, version 1.1

`.olom` is olomol's own file: a drawing of molecules, reactions and mechanisms as olomol holds it. It is JSON
(UTF-8), so any program, script or language model can read and write it. The name: **O**lomol **L**ayout
**O**bject **M**odel.

olomol also opens KET (Ketcher's format, and olomol's own files before 0.5.0), and exports KET for Ketcher.

## Promises

1. **Old files open for ever.** Every olomol reads every earlier version of the format. A file from any release
   is kept among olomol's test files, and every later olomol must read it unchanged.
2. **Versions say what changed.** `"version": "major.minor"`. A new minor version only *adds* (fields, kinds of
   objects); a field once released keeps its name and its meaning. A new major version would change meanings:
   olomol avoids it, and reads the older one by upgrading it step by step.
3. **What a reader doesn't know, it keeps.** olomol keeps fields and sections it doesn't know (from a newer
   olomol, or from another program) and writes them back unchanged when it saves. An older olomol opening a newer
   minor version says that some parts may not show.
4. **Other programs' additions have a prefix.** olomol's own keys are plain words and never contain a colon.
   Anything another program adds is named `program:key` (`"grader:points": 3`), so it can never collide with a
   key olomol adds later.
5. **What a reader doesn't know of a value, it keeps.** A value olomol doesn't know for a key it knows (a kind of
   arrow or a stereo bond a newer olomol added: `"kind": "ionic"`) is drawn as the key's default meanwhile, kept,
   and written back unchanged, unless that key is changed in the drawing. A newer minor version may add values to
   any key that takes one of a set (the tables below), never change what one means.

## Conventions

- **Coordinates** are in bond lengths (a standard bond is 1 long), x to the right, **y up** (as in molfiles and
  on graph paper). Points are `[x, y]`.
- **Angles** are in degrees, counter-clockwise (0 points right, 90 up).
- **Ids** are positive integers, unique in the whole file (not per collection). References between objects are
  by id. A reference to an id that isn't in the file is dropped when reading (and the object that needs it,
  such as a bond without its atoms, is left out).
- **Defaults are left out.** A field not written has its default (the tables below). Writers should leave out
  defaults; readers must accept them written.
- **Colours** are CSS hex colours (`"#d0021b"`, `"#d02"`); a highlight may also be one with a pattern
  (`"hatch:#f87171"`, `"lines:…"`, `"dots:…"`). olomol reads any other value as no colour.
- **Texts** carry olomol's markup (below, `texts`); a backslash writes a character as it is: `\{`, `\}`, `\\` (and
  `\_`, `\^`, `\*`, `\~`). A backslash before any other character is itself (`C:\temp`).
- **Order** in a collection is drawing order (later on top).

## The file

```json
{
 "format": "olom",
 "version": "1.0",
 "app": "olomol 0.5.0",
 "title": "SN2",
 "style": "acs",
 "atoms": [
  { "id": 1, "element": "C", "x": 0, "y": 0 },
  { "id": 2, "element": "O", "x": 1, "y": 0, "charge": -1, "lonePairs": "auto" }
 ],
 "bonds": [{ "id": 3, "atoms": [1, 2] }]
}
```

| key | | |
|---|---|---|
| `format` | required | always `"olom"`: how a file is recognised, whatever its name |
| `version` | required | `"1.1"`, or the lowest version that holds what is in the file: a drawing without a 3D model is `"1.0"` |
| `app` | | what wrote it (`"olomol 0.5.0"`); informative only |
| `title` | | the drawing's name |
| `style` | | a preset by its name, `"screen"`, `"acs"`, `"rsc"` or `"slides"`; or a style of one's own, `{ "bond", "line", "bold", "hash", "margin", "label" (the bond length, the line, bold and wedge widths, the hash spacing, the margin round labels and the labels' size, all in points), "font": "sans" \| "serif" }`; with charges circled or lone pairs as bars, `"charges": "circled"` (⊕ ⊖; default `"plain"`) and `"lonePairs": "bars"` (Lewis; default `"dots"`) beside the sizes, and a preset then as `{ "preset": "acs", … }`; none: the reader's style for new drawings |
| `atoms`, `bonds`, `together`, `reactionArrows`, `plusSigns`, `texts`, `electronArrows`, `ringFills`, `brackets`, `orbitals`, `orbitalOverlaps`, `models3D`, `groups` | | the collections below; an empty one is left out |

## atoms

| key | default | |
|---|---|---|
| `id`, `x`, `y` | required | |
| `element` | — | the element symbol (`"C"`, `"Co"`); left out for a group |
| `group` | — | a group written instead of an element (`"Ph"`, `"R"`, `"Nu"`, `"SiR3"`) |
| `charge` | 0 | formal charge |
| `isotope` | — | mass number |
| `multiplicity` | none | a radical or carbene centre, by its spin multiplicity: 1 singlet (a carbene's two paired electrons), 2 doublet (one unpaired electron), 3 triplet (two), 4 quartet (three), 5 quintet (four); left out on an ordinary atom |
| `hydrogens` | from the valence | the number of hydrogens, when set by hand |
| `lonePairs` | not shown | `"auto"` (as many as the atom has) or a number to show |
| `color` | black | the label's colour |
| `highlight` | — | a background colour behind the atom |
| `bold` | false | its label in bold |
| `partialCharge` | — | `1` for δ+, `-1` for δ− |
| `hydrogensSide` | automatic | `"left"` or `"right"`: where its H's are written (HO) |
| `showMethyl` | as set for all | `true`/`false`: write CH3 at this chain end |
| `showCarbon` | as set for all | `true`/`false`: write this carbon (CH2, CH, C) |
| `showRS` | false | write its R or S beside it |
| `number` | — | a number shown beside it, set by hand (NMR assignments); or `"iupac"`: numbered with its molecule by the IUPAC rules (on all its atoms; the numbers worked out again after each change, not written) |
| `isotopeLetter` | false | hydrogen 2 or 3 written as D or T |
| `projection` | — | `"fischer"`: a crossing of a Fischer projection |
| `facing` | — | `{ "angle", "reach", "face" }`: where a p orbital put on later faces, from a 3D view (`angle` as an orbital's) |
| `onArrow` | — | the molecule is a reagent on a reaction arrow: `{ "arrow": id, "slot": "above" \| "below" \| "above-in" \| "above-out" \| "below-in" \| "below-out", "sign": "+" \| "-", "order": n }` (set on all its atoms) |

## bonds

| key | default | |
|---|---|---|
| `id`, `atoms` | required | `atoms`: `[a, b]`, the order matters for `doubleBondSide`, wedges (narrow end at a) and dative bonds (from a to b) |
| `order` | 1 | 1, 2 or 3; 4: aromatic, a ring read from a file that couldn't be written with single and double bonds (drawn with a dashed line) |
| `stereo` | none | `"wedge"`, `"hash"`, `"wavy"`, `"perspective"` (the thick front edge of a Haworth ring) |
| `doubleBondSide` | automatic | `"left"`, `"right"`, `"center"`: where a double bond's second line goes, seen from a to b (with y up: from (0,0) to (1,0), `"left"` is above) |
| `kind` | a bond | `"partial"` (forming or breaking, dashed), `"hydrogenBond"` (dotted), `"dative"` (an arrow from a to b) |
| `delocalized` | false | drawn as part of an aromatic ring or a group like COO⁻ (`order` is still the Kekulé one) |
| `color`, `highlight`, `bold` | | as for atoms |
| `showEZ` | false | write its E or Z beside it |
| `newman` | false | seen end on: a Newman projection (front atom a, back atom b, on one point) |
| `depth` | — | its depth in a drawing from a 3D view (where two bonds cross, the one behind is broken) |

## together

Molecules kept together as one species (K⁺ with its anion, a salt for a grid): no bond, nothing drawn, but one
molecule for the chemistry (a formula, a SMILES). `id`, `atoms` (`[a, b]`, required: an atom of each).

## reactionArrows

| key | default | |
|---|---|---|
| `id`, `from`, `to` | required | its tail and its head, `[x, y]` |
| `kind` | `"forward"` | `"equilibrium"`, `"resonance"`, `"retro"`, `"multistep"`, `"dipole"`, `"crossed"` (doesn't go), `"equals"` (an equals sign) |
| `lean` | even | an equilibrium lying `"forward"` or `"back"` |
| `sideArcs` | — | `[{ "id", "side": "above" \| "below", "way": "in" \| "out", "reach" }]`: side arcs (NAD⁺ → NADH); what stands at an arc's end is on the arrow in slot `side-way` |
| `drawnLength` | — | its length as drawn, while its arcs make it longer |
| `lengthByHand` | false | its end was dragged: its arcs don't change its length |
| `color` | black | |

## plusSigns

`id`, `x`, `y` (required), `color`.

## texts

| key | default | |
|---|---|---|
| `id`, `x`, `y`, `text` | required | `x`, `y`: the start of its first baseline; `text`: lines separated by `\n`, with olomol's markup: `_{…}` subscript, `^{…}` superscript, `*{…}` bold, `~{…}` italic, one inside another (`*{H_{2}O}`); `\{`, `\}`, `\\` for the characters themselves |
| `color`, `bold`, `highlight` | | `highlight`: a background colour behind the text |
| `size` | 1 | a factor of the style's text size |
| `font` | the style's | `"sans"` or `"serif"` |
| `align` | left | `"left"`, `"center"`, `"right"` |
| `onMolecule` | — | placed by a molecule: `{ "atom": id, "slot": "below" (default) \| "above" \| "left" \| "right", "drop", "order" }` |
| `onArrow` | — | conditions on a reaction arrow: `{ "arrow": id, "slot": "above" \| "below" \| "above-in" \| "above-out" \| "below-in" \| "below-out", "sign": "+" \| "-", "order" }` (the `-in` and `-out` slots: at the free end of a side arc, NADH and NAD⁺; `sign`: + or − in front, as of a molecule) |

## electronArrows

Curved arrows and fishhooks: where electrons go (what a reaction arrow is to a reaction, these are to its
electrons).

| key | default | |
|---|---|---|
| `id`, `from`, `to` | required | ends, below |
| `electrons` | 2 | 1 for a fishhook |
| `curve` | — | the curve as drawn: a cubic Bézier, `[p0, p1, p2, p3]` (from the electrons to the head's base) |
| `tip` | — | the point of its head, `[x, y]` (with `curve`) |
| `variant` | 0 | which of the good ways olomol draws it in (olomol's "other way" counts up) |
| `color` | | |

Ends: `{ "atom": id }` (a lone pair, `"pair": n` for which one), `{ "atom": id, "radical": true }` (an unpaired
electron), `{ "bond": id }`, `{ "orbital": id }`, and for `to` also `{ "atom": id, "newBond": id }` (a new
bond between the two atoms, the arrow ending between them).

A reader draws `curve` and a head at `tip`. olomol draws an arrow read from a file as it was saved: of the ways it
would draw it, the one nearest `curve` (the same curve while olomol draws arrows as it did when it wrote the file).
From the first change to the drawing on, it finds the arrow's way anew as for any other (`variant`), so that the
arrow follows its molecules when they move or flip; it writes the curve it draws then.

## ringFills

`id`, `atoms` (the ring's atoms in order, required), `color`.

## brackets

| key | default | |
|---|---|---|
| `id`, `corners` | required | two opposite corners of the box it encloses |
| `shape` | `"square"` | or `"round"` |
| `superscript`, `subscript` | — | text at the top and bottom right (`"‡"`, `"2−"`, `"n"`) |
| `atoms` | — | made round these atoms: it keeps fitting them |
| `color` | | |

## orbitals

| key | default | |
|---|---|---|
| `id`, `atom`, `angle` | required | `angle`: the direction of its first lobe, from the direction to atom `angleFrom` |
| `kind` | `"p"` | `"hybrid"`, `"s"` |
| `angleFrom` | the x axis | an atom (a neighbour), so the orbital turns with its molecule; without it, 90 points up |
| `size` | 1 | the lobes' size |
| `phase` | 1 | 1: the first lobe shaded, −1: the other |
| `color`, `otherColor` | grey, white | the shaded and the other lobe |
| `plane`, `reach` | — | a p orbital upright to the plane in a 3D view: on side 1 or −1, how long it looks (1 in the page) |
| `depth`, `depthTilt` | — | from a 3D view: its atom's depth and how much its first lobe points at the viewer |

## orbitalOverlaps

`id`, `orbitals` (`[a, b]`, required), `lobes` (`[1 | -1 | null, …]`: the lobe of each it is drawn from and
to; none: the facing ones), `color`.


## models3D (since 1.1)

A molecule's 3D model as a picture beside it (ball and stick, sticks or space-filling). The model is kept as it was
built, so the picture is the same wherever the file is opened; its colours and highlights are its molecule's. Its own
points and turn are in its own space: x right, y up, z towards the viewer.

| key | default | |
|---|---|---|
| `id`, `at` | required | `at`: its middle on the page |
| `size` | 1 | a bond's length in it, in the drawing's bond lengths |
| `rotation` | none | how it is turned: a 3×3 matrix, by rows, applied to its points |
| `model` | required | `{ "elements", "points", "bonds", "groups", "drawn" }`: its atoms' elements and 3D points (a bond 1 long, round their middle), its bonds `[a, b, order, kind]` (by index; kind `"dative"`, `"partial"` or `null`), the atoms of each group a label stands for (`{ "name", "atoms" }`), and how many of its first atoms are the drawing's (the rest are hydrogens and labels' atoms it added) |
| `atoms` | — | the drawing's atoms it was built from, in its order (its first `drawn`); left out when its molecule isn't in the file |
| `signature` | — | its molecule as it was built (its atoms with their element, group, charge, isotope, multiplicity and hydrogens, and the handedness each wedge gives the atom it starts at, its bonds with their order, kind, whether wedged and, a double one, cis or trans, by the atoms' ids; and the conformation drawn, a chair's or a Newman projection's torsions as gauche or anti: what the drawing means, so the molecule moved, turned or flipped keeps it); another molecule, configuration or conformation now means the picture is out of date (olomol marks it and offers Update) |
| `look` | | `{ "style": "balls" \| "sticks" \| "spacefill", "hydrogens": "all" \| "small" \| "none", "groups": "out" \| "balls", "fade": true \| false }`; what is left out as the defaults: `"balls"`, `"all"`, `"out"`, `true` |
| `color` | | |

## groups

Things grouped to be selected and moved together (olomol: Ctrl+G); nothing chemical. `id`, `name` (optional: what it is called, "Route A"), `members`
(required): ids of atoms (each standing for its whole molecule; olomol writes one atom of it), reaction arrows
(with what is on them), plus signs, texts standing free, brackets, 3D models, and other groups (nested: a group in one group
at most). A bond, an electron arrow, an orbital, a text on a molecule or an arrow, a molecule on an arrow: in the
group of what it belongs to.
