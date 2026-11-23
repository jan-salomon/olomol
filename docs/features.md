# olomol: what it does, in detail

A reference of the features, for those who want all of it in one place.
olomol is made at the Department of Physical Chemistry, Palacký University
Olomouc.
The [README](../README.md) is the short tour; the manuals
([Czech](manual.pdf), [English](en/manual.pdf)) explain how to use them.

## What it does

**Drawing** (tools on the left; elements and rings at the bottom, as in
ChemSketch):

- Bonds: single, double, triple, wedge, hashed wedge, wavy, and **partial**
  (dashed: forming or breaking, for transition states), **hydrogen bonds**
  (dotted) and **dative** bonds (an arrow from the donor; it uses the
  donor's lone pair). Partial, hydrogen and dative bonds don't go into
  molfiles; .olom files and KET keep them. Click an atom to
  add a bond in a sensible direction (zigzag, the widest gap), drag from it
  to pull one out in 15° steps (Shift: free), drop it on an atom to close a
  ring. Clicking a bond changes it (single → double → triple; a double bond
  again: moves its second line; a wedge again: turns it round).
- Chains (drag; the number of atoms is shown), rings of 3–8 and benzene
  (click the canvas, an atom or a bond; a see-through preview shows what a
  click does). On a bond a ring is fused; on an atom it hangs on it by a new
  bond (a phenyl), and with **Shift** it goes through the atom (spiro, or
  the end of a chain as a ring corner).
- Elements: from the bottom bar (in their colours, also when atoms are
  drawn black) or the periodic table (coloured by family, with group and
  period numbers). Clicking an atom makes it that element; on an atom
  that already is one (C on C), or with **Shift**, a new atom is bonded to
  it instead. **Group labels** for mechanisms and general structures (R,
  R′, X, Nu, E, LG, Ar, Ph, Me, Boc…): from the periodic table dialog,
  sorted by kind, or typed into the panel's element field; they work like
  elements, and R, X, Nu and the like have no hydrogens or lone pairs (Ar
  is aryl, not argon).
- **Templates** (bottom bar; its groups in a list on the left, the large ones in subgroups): ring systems
  (adamantane flat and as a cage), functional groups, **conformations and projections** (chairs: cyclohexane, flipped, with all axial and
  equatorial H, methyl axial and equatorial, α- and β-D-glucopyranose; a
  boat; **Newman projections** of ethane, butane and cyclohexane (seen along
  C1–C2 and C5–C4), molecules seen along a bond, so curved arrows (an E2
  to the bond seen end on), charges and R/S work on them; the panel
  changes their groups and dihedral angle, files get the stereoisomer
  they show, other programs a plain drawing with wedges), **projections** (**Haworth**: glucose,
  galactose, ribose, deoxyribose; **Fischer**: glyceraldehyde, glucose,
  fructose, alanine, serine; their stereo goes into files and identifiers
  as wedges), the 20 amino acids, sugars and nucleobases, reagents and
  solvents. **Functional groups attach**: pick
  one, then click an atom of your molecule and the group is bonded there,
  pointing away from the atom's other bonds (on the canvas it comes with
  an R). Chairs (and a boat) are drawn the textbook way, with parallel
  edges, axial bonds straight up or down and equatorial ones parallel to
  ring bonds; a chair is read as the molecule it shows (the lower edge in
  front, each group up or down), so SMILES, InChI, Info and files get the
  stereoisomer drawn (the β-D-glucose chair is β-D-glucose), other programs
  wedges on the chair; fused chairs get none yet. A cyclohexene drawn in a
  chair's shape (a half-chair, an E2 product) is read the same way. A chair drawn by hand is
  read too, by the shape every chair drawing has (a zigzag hexagon: opposite
  edges parallel, two opposite corners pointing in); pointed at, a chair
  read lights up green-teal instead of blue.
- **The search bar** (the right end of the bottom bar, or the / key): type a **SMILES or
  InChI** (drawn here, offline, with a picture as you type; a SMILES with a
  mistake is explained, e.g. "Atom 3 (O) has 3 bonds", and a charge
  written after its atom, N[+], is put right to [N+]) or a **name or PubChem number** (aspirin,
  CID 2244, looked up on PubChem) and press Enter; then click where it
  should go. Only what you typed is sent to PubChem, and only names and
  numbers, unless you ask for the **PubChem page** of what you typed (then
  that SMILES or InChI is sent to find it). It also finds elements, templates
  (by name, or `?ester` for those with a part), olomol's own tools and
  actions by name or by what they do (with their keys), the open drawings and
  recent files, and opens an olomol link or its #part pasted in. A SMILES,
  InChI or CID comes first; a word finds what olomol has before PubChem.
- Charges and **δ+ / δ−** (beside a bare corner where there is room),
  **unpaired electrons** (radical tool: one dot, again two side by side,
  again none; three or four, each on a side of its own, in the panel's
  Unpaired row, and on an atom without bonds its lone pairs show with them,
  a **Lewis symbol**: ·N̈·, ·Ċ·, in dots or bars), **lone pairs** (click an atom, or drag a box; with atoms selected,
  the button does it for them).
- **Curved arrows** (electron pair) and **fishhooks** (one electron): drag
  from the electrons (a bond, a lone pair, an unpaired electron) to where
  they go (an atom or a bond), or click start and end. Arrows from an atom
  without electrons to give are refused, with the reason. The tool stays on.
  **Arrows to a new bond:** while a fishhook is drawn (a curved arrow: with
  Shift held, also pressed during the drag), faint lines lead to the
  atoms within five bond lengths that the electrons could bond to, the ones
  towards the pointer stronger; dropped on the dot in a line's middle, the
  arrow ends between the two atoms (Cl• + H–CH3: fishhooks from Cl• and
  from the H–C bond meet at the new Cl–H bond; two radicals combining). A
  fishhook from an atom with an unpaired electron starts at it.
- **Orbitals** on atoms, as JOC figures draw them: p orbitals (two lobes,
  one shaded for the phase, sized by a coefficient), hybrid orbitals (a
  lone pair, σ*) and s orbitals, behind the bonds. Each turns on its own
  in 15° steps, snapping to the molecule's bond directions, and turns and
  flips with its molecule; a click on a lobe swaps the phase, and each
  phase's lobe can have its own colour. A lobe dragged onto another
  molecule's orbital draws a dashed overlap line between the two lobes
  chosen (a Diels–Alder's HOMO and LUMO); curved arrows start and end on lobes.
  In Turn in 3D the p orbitals stand upright to the molecule's plane as
  seen, on the side they were drawn on. .olom files and KET keep them.
- **Brackets** (tool on the left, key K, or "Brackets" in the panel for
  the selected atoms): round a whole molecule for a **transition state**
  (‡) or an **ion** ([Fe(CN)₆]⁴⁻; the panel puts ‡, + or − at the top
  right, or anything you type), round part of a chain for a **repeating
  unit**: the brackets cross the bonds that leave it, at their middle,
  and get an n. Square or round. They move with the molecule inside when
  you align. .olom files and KET keep them (Ketcher shows them as
  pictures); other structure files don't.
- **Abbreviations** that count: Me, Et, iPr, tBu, Ph, Bn, Ac, Bz, Boc,
  Cbz, Fmoc, Ts, Ms, Tf, TMS, TBS, TIPS, OMe, OAc, OTs, OTf, CO2Et, CO2H,
  CHO, CH2OH, CN, CF3, NO2, NHBoc and more (periodic table dialog, or typed
  into the element field; Ac is acetyl and Ts tosyl there). Formulas and
  masses include them, files and identifiers get the whole group; left of
  their bond they are written backwards (MeO–, EtO2C–). **Draw out** turns
  one into its atoms, **Abbreviate** a selected group back into its label.
  Charged groups too: SO3⁻, CO2⁻ (COO⁻), OPO3²⁻, OPO3H⁻, PO3²⁻, the charge on
  the label and, drawn out, on the O. Generic labels (R, X, Nu, Ar) stay placeholders.
- **Draw the H**: the implicit hydrogens of the selected atoms as atoms of
  their own, for arrows to and from them (and back: Hide drawn H).
- **Compound numbers**: a bold text dragged or typed under a molecule goes
  on its anchor (below, above, left or right) and moves with it.
- **Atom numbers.** Tick **IUPAC numbering** in the panel and the main
  chain or ring is numbered by the IUPAC rules (2013 recommendations), and
  again after every change: add a Cl to the far end of hexane and C1 moves
  there. The panel says which rule decided ("numbered so that the alcohol
  (OH) group gets the lowest number: 2, not 5"). What it knows: the parent
  (the most principal groups: acid > ester > acid halide > amide > nitrile
  > aldehyde > ketone > alcohol > thiol > amine; a ring before a chain; the
  longest chain, then the most multiple bonds, then the most
  substituents), and lowest locants to ring heteroatoms (pyridine N1), the
  principal group, multiple bonds (a double bond before a triple),
  substituents, and alphabetical order (in the page's language: Czech
  "chlor" comes after "hydroxy"). Only the parent is numbered, as in the
  name. Fused, bridged and spiro rings (naphthalene, steroids) have a
  numbering of their own and are left to the **atom number** tool (with
  Text), which numbers atoms in the order you click them (again: off), for
  NMR assignments and the like; the panel's **Number** field changes one.
  The numbers sit beside the atoms, outside rings, and go into .olom and
  KET files, links and pictures.
- Reaction arrows (→, ⇌, ↔, ⇒, the multistep arrow, a **crossed** arrow for a reaction that does not go, an
  **equals sign** for the same thing drawn another way), an equilibrium that **lies to one
  side** (the panel's Favours: the other harpoon shorter), the **dipole arrow** (crossed, from δ+ to
  δ−; it goes with its molecule), "+", text. Text formats formulas for you:
  H2SO4, AlCl4-, Fe3+, SO42- get their sub- and superscripts; `_{...}` and
  `^{...}` force them.
- Select (box, lasso, double click: the whole molecule), move, rotate with
  the handle above the selection, erase (click or box), undo and redo
  (Ctrl+Z, Ctrl+Shift+Z), copy and paste (Ctrl+C, Ctrl+V: a see-through
  copy follows the pointer until a click puts it down, as with templates;
  pasting a SMILES or molfile from elsewhere works too, checked to mean
  the molecule given, a double bond left open with a wavy bond beside
  it), arrows nudge the
  selection. The **right mouse button** offers what can be done with what is
  under it (cut, copy, paste, delete, Redraw, Turn in 3D, flips, a bond
  horizontal, Abbreviate, One compound, Group…), each with its key.
- **Groups** (Ctrl+G, apart again with Ctrl+Shift+G, nested): things held
  together for selecting and moving without being one compound (a molecule
  and its number, half a scheme). A click still selects an atom or a
  molecule; Ctrl+click the group, Ctrl+drag moves it; Align moves groups
  as wholes and SVG keeps them as groups. The **Objects** panel (at the foot
  of the tool rail) lists the drawing's things and groups: select, light
  up, unfold, name a group by a double click, drag rows into or out of
  groups.
- Zoom with Ctrl+wheel or the buttons, pan with Space+drag, the middle
  button (it doesn't paste selected text, as Linux would), the wheel
  (Shift+wheel: sideways).
- **Tabs**: each drawing in a tab of its own, with its own undo, file and
  view; renamed by a double click, moved by dragging, duplicated from the
  right-click menu (an exercise and a copy for its solution). Every open
  drawing is kept in the browser and comes back next time; the browser also
  keeps **earlier versions** of each, a few minutes apart, shown as pictures
  to bring one back. **Show** puts the open drawings full screen one after
  another, for a lecture (→ and ←, Space, Page Up/Down: a clicker; Esc back
  to drawing).
- **Keys**: over an atom, C N O S P F H I L (Cl) B (Br) change the
  element, + − the charge, "." the unpaired electrons, ":" the lone pairs;
  over a bond 1 2 3 (1 again: wedge, then hashed wedge, as in Ketcher);
  over nothing the same keys choose tools (V select, E erase, A curved
  arrow, Shift+A fishhook, R benzene…), D over a bond the dative, hydrogen,
  then partial bond. A
  line above the bottom bar says what the current tool does; **?** shows
  all keys. Digits work by key position, also on Czech keyboards.

**Electron pushing is part of the drawing.** Lone pairs and unpaired
electrons belong to their atom: how many comes from the chemistry
(valence electrons − charge − bonds − hydrogens − unpaired electrons; the
same counts as RDKit, checked in the tests), so pyrrole's N has none and
pyridine's one. Curved arrows belong to the bond, lone pair or atom they
start and end at. Whatever you do (move atoms, change elements and charges,
Redraw, align, delete, undo), lone pairs and arrows are drawn again for
the new situation, live while you drag.

Arrows are placed by rules: they leave the lone pair or bond outwards, turn
one way and smoothly (short arrows more, long ones less), end in a small
head pointing at the atom or bond, come in from the side of the electrons
when they make a new bond, keep clear of labels, bonds, electrons, the
inside of rings and other arrows, and two arrows from one bond (homolysis)
start on the same side. Hundreds of curves are scored; the best wins. If
you don't like it, **drag the arrow** where you want it to bend (it takes
the nearest good way of drawing it), or press **Other way** in the panel.
Carbons in a straight line (C≡C–C) get a dot so they don't disappear;
charges move to a free corner, away from bonds and lone pairs. A bond
between the wide ends of two wedges is drawn bold, also along a short
chain (the bridge of a morphinan, the front of a Haworth ring), and wedge
ends meet the next bond without a notch.

**Aromatize** (in the panel, for the selected molecules or all): aromatic
rings get a circle (or dashed lines, see Settings) and charged groups that
are the same in their resonance forms (COO⁻, NO₂, SO₃⁻, guanidinium, O₃)
are drawn with dashed partial bonds and δ charges; a charge spread over a
ring (C₅H₅⁻, C₇H₇⁺) goes in its middle. The bonds stay single and double
underneath, so formulas, lone pairs and files don't change, and other
programs read the Kekulé structure. **Kekulé** takes it back.

**The panel on the right** shows the selection: the formula, and its
**Info** button opens a card beside the panel (it closes when you select
another molecule or click the empty canvas) with the numbers a lab report needs: molar mass, exact mass, the HRMS
ions ([M+H]⁺, [M+Na]⁺, [M−H]⁻, or [M]⁺ for an ion), the elemental analysis
(C, H, N, S), SMILES, InChI and InChIKey, all worked out here; a click on a
row copies it without words, for a report in any language ("C9H8O4 [M+H]+
181.0495", "C9H8O4: C 60.00, H 4.48"). **PubChem page** opens the molecule's page on
PubChem; this one button sends something about your drawing out: the
molecule's InChIKey, which PubChem finds the compound by. For whole
molecules the panel offers what applies to molecules (lone pairs, Draw
the H, colour, highlight); an atom's element, charge and hydrogens and a
bond's order and stereo are there when you select one atom or bond, or
part of a molecule. Then for atoms the element, charge, unpaired electrons, lone pairs and
hydrogens; for bonds order, stereo and where a double bond's second line
goes; for curved arrows pair/one electron and "Other way". **Colours** for
atoms, bonds, arrows and text (ten colours, the ones used last, and more
from the rainbow: a larger choice or a colour code such as #c05), also with the
paint tool. **Highlights**, as in RDKit's drawings: soft colour behind
atoms and bonds to mark a group (panel or highlighter tool), and **filled
rings** (the highlighter clicked inside a ring, also in any colour from its
rainbow; a round bite keeps the colour off
written atoms, goes when the ring is broken, and the highlighter's "No
highlight" or the eraser takes it away). **One compound** joins
molecules such as K⁺, K⁺ and SiF₆²⁻ into one by invisible links: they
move, line up in a grid and count as one (formula K₂SiF₆); Settings shows
the links. An atom with too many bonds gets a dashed red ring on screen. Black-and-white mode
(Settings) switches off the element colours but keeps your own, so red
arrows on black structures stay red.

**Arranging** (top bar): **Redraw** offers several drawings of the
selected molecule from different engines (Indigo, RDKit, RDKit with
ring-system templates for textbook drawings of bridged and fused systems,
CoordGen, Indigo's clean-up, and **3D, projected** for cages, metal
complexes, molecules with an expanded octet and SN2 transition states);
every drawing of a whole molecule is turned by up to 15° so that most of
its bonds lie on the 30° grid (as a pasted SMILES is; a view of a 3D
model keeps its own), and every
candidate is checked by RDKit canonical SMILES (stereo included) and
dropped if it would change the molecule; one whose atoms are right but
whose wedges read the wrong way gets new wedges (RDKit's, for the same
points) and is checked again. The window ranks the drawings once, when
the quick engines are done; the slow ones' (Indigo's clean-up, the 3D
views) are added after them, so no card moves. The **3D** drawings build the
molecule in 3D, turn it to a clear view and project it, with wedges and
hashed wedges for depth: a **metal complex** optimised as a whole by the
universal force field (UFF, ported from RDKit), the polyhedron chosen by
energy among those that fit (square planar for d8 metals, Ni with carbon
donors and copper(II); porphyrins flat, chelates where they sit), cis and
trans as drawn, in the textbook view (an octahedron with its axis up, the front
ligand wedged, the back one hashed; dative arrows can't show depth);
a main-group molecule with more than an octet or five electron pairs
(PCl5, SF6, ClO4⁻, SF4, ClF3, XeF4) by VSEPR, lone pairs taking places of
the polyhedron, a tetrahedron as textbooks draw it (sulfate's S=O in the
page, wedge and hash to the O⁻); other molecules from RDKit's 3D structure,
or OpenChemLib's where RDKit has no MMFF94 types (cages such as cubane and
adamantane, R/S kept), in the conformation drawn: a chair's axial groups
axial, a Newman projection's dihedral (gauche, eclipsed) as drawn, a diene
drawn s-cis s-cis, the same
in Turn in 3D.

**Turn in 3D** (the cube by Redraw): the selected molecule as a 3D model,
turned with the mouse or the arrow keys (Shift: in the plane of the page)
and drawn as seen, the back paler; **Use this view** puts it on the canvas
with wedges that keep R/S, E/Z and Λ/Δ, and **Clearest view** goes back
to the view it starts with. The model has the conformation drawn (as for
Redraw's 3D drawings), and a metal complex is optimised as a whole by
UFF. **Stick model** (S) shows the model itself: balls and sticks with
their true lengths and angles, every hydrogen, double and triple bonds,
the drawing's colours and highlights (the highlights lying by depth among
the balls); groups written as shorthands drawn out in a colour of their
own with a legend, or with **Draw out groups** off (G) each as one ball
with its name; **Small hydrogens** (H) draws the hydrogens the model adds
small and close to their atoms. **Save picture** saves the stick model as
PNG or SVG. The window remembers G and H until the tab is closed.

**3D models on the canvas** (**Put on canvas** in Turn in 3D's stick
model): the model beside its molecule, in its colours and highlights; in the
panel ball and stick, sticks or space-filling (van der Waals radii),
hydrogens all, small or none, shorthands drawn out or as balls, the back
paler or even, size ½ to 2, turned by three sliders (left–right,
back–forward, in the page) or in Turn in 3D (Apply). When the molecule
changes (an atom, a charge, a bond, a wedge, the conformation drawn: a chair
flipped; not a move or a colour), the model stays as built, in a dashed
frame, and **Update** builds it again, seen from the same side. Selected,
moved, copied, grouped, aligned, flipped and turned with the rest, in the
Objects panel, in pictures and PDFs; kept as a model only in .olom files
and links.

**Align**: line up, space evenly, grid (where the selection was), and **Align reaction
scheme** (one row, even gaps, horizontal arrows, reagents travel with their
arrow, compound labels on one line). Molecules joined by a curved arrow
move as one. Flip left–right and top–bottom (wedges swap, so the molecule
stays the same), and **flip over a bond**: select a part, press the button,
click a bond, and the part turns half a circle about it (with nothing
selected, the smaller side of the bond), R/S kept, with a see-through
preview first; **Make horizontal or vertical** turns a bond's molecule
so that the bond lies straight. **Ring flip** of a chair (from the
templates, or drawn by hand and recognised):
axial ⇄ equatorial, each group staying up or down (cis/trans, R/S, D/L
kept) and each ring atom where it was, animated through a boat (Settings:
Animations); with Shift the other chair beside it with ⇌, for handouts;
fused rings refused; cyclohexane seen along two bonds (Newman) flips the
same way, C3 and C6 changing sides; a flat six-membered ring (a hexagon
or a Haworth projection) clicked with it becomes a chair, each group axial
or equatorial by its wedge, always the templates' chair (its left tip
raised: a sugar ⁴C₁; the ring flip gives the other), a wavy
bond where a group's side isn't drawn on a stereocentre; cyclohexenes
refused. **Turn a chair** turns a chair a third of the way round its axis
(Shift: the other way), each ring atom two corners on with its groups,
which stay axial or equatorial, up or down: the same conformation, seen
turned. Ring flip, Turn a chair, **Fischer projection** and **Zigzag** are
under one projections button in the top bar. **Fischer projection**: a
molecule drawn with wedges clicked is drawn as its Fischer projection (the
IUPAC main chain upright, C1 at the top, each stereocentre a crossing, the
end groups written CHO, CH2OH, CO2H, CO2Me, CN, CH3); a chain of crossings
drawn by hand (each a carbon with four single bonds left, right, up and
down, within 15°) is read as a Fischer projection only when clicked
(horizontal bonds towards the viewer, vertical ones away), its spine lit
green when pointed at; clicked again, a drawing again. **Zigzag**: any
molecule's main chain (a Fischer projection's too) as a zigzag, C1 on the
left, with the wedges that keep its R/S. Each conversion is checked by
canonical SMILES and refused with a reason (a stereocentre without a wedge,
a ring as the main chain, no stereocentre, a double bond in the chain);
a see-through preview on hover. In the panel: **R/S and E/Z labels** (from RDKit; **Λ and Δ** at an octahedral metal with two or three chelates, by IUPAC's skew lines, kept by Redraw and Turn in 3D) for the selected molecule or for single atoms and bonds; they go into exported pictures, .olom and KET files.

**Settings**: the drawing's **style**, Screen, **ACS** (ChemDraw's ACS
Document 1996: bonds 14.4 pt, lines 0.6 pt, Arial 10 pt), **RSC** (12.2 pt,
0.5 pt, Arial 7 pt), Slides (thicker, for a projector) or one's own (bond
length, lines, bold bonds and wedges, hash spacing, the margin round labels,
label size, sans or serif), with its charges and lone pairs: it belongs to
the drawing and its file, pictures and PDFs come out at its true size, and
**Use for new drawings** makes it the default; atom colours by element or black; **carbons**: CH₃ written at chain ends,
plain line ends, or every carbon written (CH₂, CH: for those who don't yet
read a corner as a carbon; the panel's **Carbons** switch changes the
carbons selected: all of a molecule's, or single ones); charges as + − or circled ⊕ ⊖; aromatic rings with a circle or
dashed lines; lone pairs as dots or bars (Lewis,
as taught in Czechia and Germany); coordination bonds as arrows or plain lines;
One compound's links hidden or shown; the colour of new curved arrows (e.g.
red); the **language**; light, dark or automatic theme; animations on or off
(by default as the system asks); debug mode.

**Languages**: English, Czech and German. The browser's language is used
when there is one of these; Settings picks another (the page loads again,
the drawing stays), and a link with `?lang=cs` opens in that language.
Template names are translated and can be searched in either language;
PubChem only knows English names. A language is one file of translations
in `src/i18n/` (English text → its translation); `npm test` lists any text
that is missing from one. The manuals are in English and Czech; Help in
German opens the English one.

**Debug mode** (Settings → Debug) shows how the rules decided: in the
re-layout dialog the engine, its rule, the ring template used, the time and
the SMILES check of every candidate, and why other engines gave nothing; on
the canvas the label boxes bonds stop at, where lone pairs go (also hidden
ones), atom ids, and for each curved arrow the next-best candidates with
their costs. A panel explains the decisions for whatever is under the
pointer (hydrogen side, charge corner, electron counts, double bond rule,
the cost of an arrow and what it is made of).

## In another page

**embed.html**: olomol with only the parts its address switches on or off
(`?only=curved-arrows,charges-electrons`, `?off=…`; 17 named parts), the
drawing from `#d=`, `#smiles=`, `#inchi=`, `#name=` or `#cid=`, `?readonly`,
`?theme`, `?lang`, `?arrowcolor`; no tabs, files, help or settings, nothing
kept in the browser. A change that touches a part switched off is refused
and said why, whatever made it. **`<olomol-editor>`** (embed.js) wraps it,
with calls through `postMessage`: `get` the curved arrows by atom ids, the
canonical form of a step (one string for every drawing of the same step:
equivalent atoms as drawn in 3D, any ids, any order, any layout), SMILES,
InChI, InChIKeys, molfile, .olom, SVG, PNG, chairs' and Newman projections'
conformations, atom classes; `set`, `setParts`, `lock`, `pick`,
`highlight`, `showMessage`, `readOnly`; events when the student changes the
drawing. Described in [embed.md](embed.md). **Export → Embed in a page…** writes
both for the drawing on screen: the tools by preset (curved arrows, drawing
structures, everything, only to look at) or part by part, PubChem as a tick of
its own, the height, and a Try it link.

## Files

- The drawing has a **name** (top bar; by default `drawing-` with date and
  time, so files don't overwrite each other; an opened file's name).
  Saving and exporting **ask for the file name**: Chrome and Edge show
  their own save dialog (name and folder); in Firefox our dialog asks for
  the name and the file goes where Firefox puts downloads.
- **Save** (Ctrl+S) writes an **olomol drawing**, a `.olom` file (JSON,
  described in [olom.md](olom.md)), with everything in it: lone pairs,
  curved arrows, colours, highlights, numbers, groups, 3D models and the
  drawing's style. As in a word processor, a drawing knows its file: in
  Chrome and Edge Ctrl+S writes it back without asking, Ctrl+Shift+S is
  Save as; a dot on the button and the tab marks changes not in the file
  yet; a file another program wrote is never written over, and one changed
  since it was read is asked about first. Firefox and Safari download
  instead.
- **Open** (Ctrl+O) reads .olom, KET (also files of the Ketcher-based version:
  their lone pair and arrow pictures become real, anchored ones again),
  molfiles, SDF, SMILES, RXN, CDXML, CDX (ChemDraw), CML and **XYZ**, and
  SVG and PNG pictures exported from olomol (they carry the drawing inside
  them); it lists the **recent files** first; files can be dropped on the
  window, and the installed app opens .olom files from the file manager;
  pasting also takes an InChI. From ChemDraw, abbreviations stay labels, an
  atom's written hydrogens are kept and an attachment point becomes an R; a
  reaction from an RXN file is lined up, its reagents on the arrow. A drawing (.olom, KET, CDXML, CDX, CML) or a
  reaction opens in a tab of its own; a file of molecules only
  (molfile, SDF, SMILES, XYZ) goes into the drawing like a template (click
  where it should go). Its 3D coordinates come without bonds
  (from a quantum chemistry program): it gets its bonds from the distances,
  bond orders from the valences (with charges where nothing else fits:
  nitro, carboxylate, ammonium), R/S and E/Z from the geometry, and is
  then drawn in 2D.
- **Copy as picture** (Ctrl+Shift+C): a PNG on the clipboard, with an SVG
  beside it for programs that take one, to paste into Word, PowerPoint or
  Google Docs.
- **Copy link** (Export menu): a link with the drawing inside it (in the
  part after #, which browsers don't send to the server). Whoever opens it
  gets the drawing; their own comes back with Ctrl+Z. A link can also say
  which structure to draw: `#smiles=CCO`, `#name=caffeine`, `#inchi=…`,
  `#cid=2244`, with `&title=…`; several open in tabs of their own, in order
  (an exercise, then its solution, for Show).
- **Export**: **SVG** (pure vector, text stays text, for Inkscape), **PNG**
  (4× resolution, transparent or white; it says its own size, so Word places
  it as large as the style gives), **PDF / Print** (the drawing alone on a
  page at its style's size), and as structure files KET (for Ketcher:
  abbreviations as its groups, Haworth and Fischer projections as wedges),
  molfile, SDF, SMILES, InChI and **XYZ** with 3D coordinates
  (all hydrogens; a conformer from RDKit's ETKDG, or OpenChemLib's, that
  keeps R/S and E/Z, minimised with MMFF94s; a metal complex optimised by
  UFF as in Turn in 3D, Λ/Δ and its ligands' R/S as drawn; several molecules side by side; worked out in the background while you draw on, then saved with a button): a starting
  geometry for Gaussian, ORCA and the like, not an optimised one.
  Structure files keep atoms, positions, charges, isotopes, radicals and
  wedges, so other programs can load them; lone pairs, curved arrows,
  brackets, partial bonds and colours are kept only in olomol's own files,
  links and pictures, and mostly in KET. Beside a format, the menu says what
  of the drawing it can't hold. "Only the selection" exports part of the
  drawing (ticked by itself when something is selected). RXN and CDXML
  are not offered until they are tried in the programs that read them.

