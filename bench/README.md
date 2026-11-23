# olomol benchmarks

Benchmarks for olomol's claims: each one measures one thing olomol says it
does, on data and against a truth that don't come from
olomol's own code. Every case can be looked at in an HTML report.

## Running

```
npm run bench          # every benchmark, then the report
npm run bench:b1       # one benchmark (b1 … b5, b2d, b6)
npm run bench:report   # the report again from the saved results, nothing rerun
```

Open `bench/report/index.html` by double-clicking it: it needs no server and
no network (Chrome or Firefox). The Playwright benchmarks (B3, B5, B4's
browser timing) build the app into `bench/out/dist` and serve it themselves.

Requirements: `npm ci`, Google Chrome (Playwright drives the installed
Chrome, as `npm run check` does; `PW_CHANNEL` picks another). While a
benchmark is being written, `-- --app=http://localhost:5183/` uses a dev
server of this working tree that is already running instead of building
and serving the app. The ChEMBL
samples are committed; `node bench/data/make-chembl-samples.mjs` draws them
again from `bench/data/cache/chembl_37_chemreps.txt.gz` (279 MB, from
https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/releases/chembl_37/,
not committed).

**Licences of the data.** olomol's code, the benchmarks' included, is under
the MIT License. The data sets in `data/` keep their own licences, given in
each file's header: the ChEMBL samples (`b1-chembl.smi`, `b3-*.smi`) are
adapted from ChEMBL 37 (EMBL-EBI) and are under CC BY-SA 3.0; PubChem's
data are in the public domain; the sets written for these benchmarks
(`b1-hard.tsv`, `b4-mechanisms.json`, `b6-steps.json`) are CC0.

## Rules

- **The truth never comes from the code under test.** Each benchmark below
  says where its truth comes from.
- **olomol is not changed to make a benchmark pass, and no failing case is
  dropped.** Every case stays in the results and in the report, failures
  first.
- **Reproducible:** fixed seeds, pinned versions (package-lock.json). Every
  results file records the olomol commit (and whether `src/` differed from
  it), the Node, Chrome, Playwright, RDKit.js, Indigo and OpenChemLib
  versions, the date and the machine.
- Proportions come with 95 % Wilson score intervals; timings are the median
  and 95th percentile of at least 5 runs after a warm-up.

## How olomol is loaded

olomol's modules in `src/` load in Node as they are, through
`lib/setup.mjs` (`node --import ./bench/lib/setup.mjs …`), which loads
`scripts/node/setup.mjs`. It does three things Vite and the browser do for
the app: it turns Vite's `something.wasm?url` imports into the file's path
(`scripts/node/hooks.mjs`),
defines Vite's build-time constants, and lets `fetch()` read a `.wasm` file
from disk. Nothing in `src/` is changed for it. So the benchmarks in Node
call the app's own code paths, such as `writeAs(doc, 'smiles')` for a
drawing's SMILES.

What needs a Web Worker (Redraw's Indigo engine and 3D conformers, Turn in
3D) runs in Chrome through Playwright, against the built app opened with
`?test`, through `window.olomolTest`.

## Folder layout

| Path | What |
|---|---|
| `b1-valence.mjs` … `b5-conformations.mjs`, `b2d-fischer.mjs`, `b6-canonical.mjs` | the benchmarks |
| `lib/` | loading olomol, a seeded RNG, statistics, the run's environment, results files, ring facts |
| `data/` | data sets; each file has SOURCE, LICENCE, DATE and SEED in its header |
| `data/cache/` | large downloads (not committed) |
| `data/handdrawn/` | KET files of chairs drawn by hand (B2c), if any |
| `results/` | per benchmark: JSON (every case), CSV (a row per case); `summary.json`, `results-table.tex` (the headline rows as LaTeX) (committed) |
| `report-src/` | the report generator's parts; `make-report.mjs` builds `report/` |
| `report/` | the HTML report (not committed; `npm run bench:report`) |
| `out/` | scratch and the drawings the report shows (not committed) |

The report draws every case with olomol's own renderer (`buildScene`,
`sceneToSVG`), bundled by Vite into `report/olomol-render.js`; "Open in
olomol" links are made by olomol's `linkTo`.

## B1: lone pairs and hydrogens compared with RDKit

**Claim:** olomol's own synchronous rules (`src/chem/valence.js`) give
every atom the hydrogens and lone pairs RDKit gives.

**Data:**
- `data/b1-chembl.smi`: 10,000 molecules from ChEMBL 37 (CC BY-SA 3.0),
  taken in the order of a hash of a seed and the ChEMBL ID; the largest
  fragment of each (salts split), H B C N O F Si P S Cl Se Br I only, at
  most 100 heavy atoms (`data/make-chembl-samples.mjs`).
- `data/b1-hard.tsv`: 159 hard cases chosen by hand: ions, radicals,
  carbenes, ylides, N-oxides, nitro, azides, sulfoxides, sulfones,
  phosphates, hypervalent halogens and xenon, boron and aluminium
  compounds, aromatic heterocycles, isotopes.

**Procedure:** as `both()` in `tests/chem.test.mjs`, the way a pasted SMILES
is read: RDKit lays out the SMILES and writes a Kekulé molfile; olomol
reads it (`readMolfile`) and works out each atom's hydrogens and lone pairs
(`electronsByAtom`). RDKit writes a hydrogen count into the molfile for
unusual atoms (radicals, metals: the atom line's valence field), and
olomol keeps it. The headline therefore drops these counts, so that
olomol's rules decide alone, as for an atom drawn by hand ("rules"). The
molfile as it is ("pasted") is reported beside it.

**Truth:** RDKit 2026.09.1 (the build olomol ships): its implicit hydrogen
count per atom, and the lone pairs its counts imply, (valence electrons −
charge − bond orders − hydrogens − unpaired electrons) / 2, rounded down.
RDKit has no lone pairs of its own, so this is the only RDKit answer
there is. The formula is the textbook one; the counts it is fed are
RDKit's.

**Metrics:** the share of atoms, and of molecules, where both counts agree.
Every disagreement is sorted (`b1-classify.mjs`) into *olomol wrong*,
*RDKit models it differently* or *convention*, with the reason. SMILES
RDKit can't read (ClF3, BrF5, IF7) are not counted; the report shows
olomol's counts for them, read without RDKit's checks as olomol reads them.

## B2: projections read as stereoisomers

**Claim:** a chair, Newman, Haworth or Fischer drawing gives SMILES, InChI
and files the stereoisomer it depicts; a chair drawn by hand is recognised
by its shape. olomol's answer is always its own SMILES and InChI export
(`writeAs(doc, 'smiles' | 'inchi')`, abbreviations drawn out as for
Export). A case passes when the canonical SMILES (stereo included, RDKit)
and the InChIKey both equal the truth's.

### B2a: the templates

**Data:** every template under Conformations and Projections
(`CHAIRS` in `src/chem/chair.js`, `PROJECTIONS` in
`src/chem/projections.js`) and the adamantane cage: 26.
**Truth:** PubChem's isomeric SMILES of the compound each is named after,
looked up by name (`data/b2a-pubchem.json` keeps PubChem's answers and
CIDs, so a rerun doesn't ask again).

### B2b: generated chairs and Newman projections

**Data (seed 20261107):**
- **Chairs:** every specification of the 1,1-, 1,2-, 1,3-, 1,4-, 1,2,3-,
  1,2,4- and 1,3,5-patterns with Me, OH, Cl, tBu, CO2H (tBu and CO2H as
  olomol's labels), every up/down combination, chair A and B
  (`chairDoc({ flip })`), and mirrored (left–right): 13,300; 5,000 drawn
  from them, shared evenly over the patterns (all 1,1-, 1,2-, 1,3- and
  1,4-cases, about 1,233 of each trisubstituted pattern). Pattern position 1
  is the chair's raised left tip (ring position 0 of `chairDoc`).
- **Sugars:** the 8 D-aldohexopyranoses, α and β, drawn as the β-D-glucose
  template is, in both chairs, mirrored: 64.
- **Newman:** 2,3-dibromobutane, 2-bromo-3-chlorobutane,
  3-chlorobutan-2-ol, threonine and 1,2-dibromo-1,2-diphenylethane, every
  order of the three front and three back groups, dihedral 0–300° in steps
  of 60° (`newmanDoc`): 1,080. Cyclohexane seen along C1–C2 and C5–C4
  (`cyclohexaneNewmanDoc`) with two groups (CH3, Cl, OH) axial or
  equatorial on two of its four Newman carbons: 216.
- **Ring flip:** every chair and sugar flipped by `ringFlip` (the app's
  button) must keep olomol's SMILES.
- **toChair:** 1,000 of the chairs' stereoisomers (seeded) drawn with
  RDKit's wedges and turned into a chair by `ringToChair` (the app's "to
  chair") must keep their SMILES.

**Truth, independent of olomol's readers** (`lib/truth3d.mjs`): 3D
coordinates built here and RDKit's stereo perception from 3D (a molfile
marked 3D, written by our own writer).
- *Chairs and sugars:* from the specification: a regular hexagon in the xy
  plane, each group out of the ring and above (up) or below (down) it. The
  ring goes round, seen from above, the way the drawing's ring goes round on
  paper (its signed area): a chair is drawn seen from above and in front,
  the lower edge in front, so the order of the corners on paper is their
  order seen from above. The builder is checked against PubChem: it gives
  PubChem's stereoisomer for all 16 D-aldohexopyranoses.
- *Newman projections:* from the picture under the textbook convention:
  the carbon at the centre is in front (towards the viewer), the one
  behind the circle at the back; each carbon's groups go where they are
  drawn, leaning its way.

### B2c: chairs drawn by hand

**Data (seed 20261108):**
- **Positives:** a chair with two groups (1,2-, 1,3- or 1,4-; Me, OH, Cl;
  any faces; either chair), turned ±20°, sheared ±0.2, stretched (aspect
  0.75–1.33, log-uniform), its corners pulled in or out ±10 % (their
  groups with them), then every atom moved by Gaussian noise of σ = 0,
  0.05, 0.1, 0.15, 0.2, 0.3 bond lengths; 1,000 per σ.
- **Negatives,** 1,000 each, lightly distorted the same way (σ 0, 0.05 or
  0.1): regular hexagons, Haworth hexagons (the template's ring, plain
  lines), boats (`boatDoc`), half-chairs (a chair with one tip folded
  flat), twist-boats (a boat with its edges pushed apart, tips uneven) and
  random hexagons (six corners round a centre at random angles and
  distances).
- **Real hands:** KET files in `data/handdrawn/`, if any.

**Measured:** recognised = `readChair` (src/chem/ringFlip.js) reads the
ring as a chair. Recall against σ; false positives per negative class; for
recognised positives, whether the stereo is right (truth: the undistorted
chair, as in B2b).

### B2d: Fischer projections both ways

**Claim:** wedges → Fischer projection, and Fischer → zigzag along the IUPAC
main chain, keep every R/S; a result that would change the molecule is
refused, never output; a Fischer projection drawn by hand and clicked with
the Fischer tool is read as its stereoisomer.

**Data:** PubChem's isomeric SMILES by name (`data/b2d-pubchem.json`): the
D and L aldoses C3–C6 (open chain, "aldehydo-"), the D-ketoses C4–C6, the
20 amino acids (L and D), (R,R)-, (S,S)- and meso-tartaric acid, (2R,3S)-
and (2R,3R)-2,3-dibromobutane, Ala-Ala-Ala, Thr-Thr, Ile-Thr and Ile-Ile
(three or four stereocentres with an amide N in the chain), D-glucitol and
D-gluconic acid: 87.

**Conversions:** each compound drawn as olomol draws a SMILES (`readAny`,
what Paste does; input, not truth), then clicked with the app's tools in an
`Editor` in Node (pointer down and up on an atom, as the canvas does): the
Fischer tool (wedges → Fischer), the zigzag tool on the result, the Fischer
tool on that. Each result's SMILES and InChIKey (olomol's export) against
PubChem's: right, refused (olomol says why and changes nothing; the
message is kept) or wrong. After a refusal the later steps are not run.

**Hand-drawn:** the benchmark builds each projection itself: the vertical
chain is the longest open chain of carbons through every stereocentre, its
more oxidised end at the top; each centre's two other groups go left and
right (an H drawn where it has one), the groups' further atoms as RDKit lays
them out, turned to point away. Which group goes left is the one whose
wedge drawing (the left horizontal bond a wedge towards the viewer, the
others in the plane: what the projection means) RDKit reads as PubChem's
stereoisomer, the same with the right bond wedged; checked at start-up
against the textbook projections of D-glyceraldehyde, D-glucose and
L-alanine. It is written as a KET file of plain bonds (no stereo; KET's y
axis checked with Indigo), pasted into the app in Chrome, and each crossing
clicked with the mouse on a fresh copy. Drawn straight, turned by ±3° and
±8°, with uneven arms (every chain and horizontal bond 0.6–1.4 long, seed
20261122), and both together; turned by 12° and 20° besides (olomol counts
a bond as horizontal or vertical within 15°). Read, missed (a centre left
without stereo, none wrong) or wrong (a centre the other way), by RDKit's
CIP labels, kept apart: a miss is better than a wrong answer.

**Truth:** PubChem, canonicalised by RDKit; for the hand-drawn
projections, PubChem through the builder's RDKit check.

## B5: the conformation drawn kept in 3D

**Claim:** Turn in 3D (and XYZ export) keeps the conformation drawn: a
chair's groups axial or equatorial, a Newman projection's dihedral, a
diene's s-cis or s-trans, and R/S and E/Z.

**Runs in Chrome:** the 3D model is built in Web Workers, so each drawing
is pasted (as KET, through `window.olomolTest.paste`) into the built app,
and `window.olomolTest.model3D()` gives the model Turn in 3D shows. Pasted
atoms are matched to ours by where they land.

**Data (seed 20261109):** 350 of the B2b chairs with Me, OH and Cl (labels
have no atoms of their own in the model), all 64 B2b sugars, 100 of the
B2b Newman projections (the three ethanes without labels), 50 cyclohexane
Newman projections, and 25 dienes and enones each drawn s-trans (RDKit's
layout) and s-cis (one side of the central single bond turned over it).

**Truth:** the specification drawn, not olomol's reading: each group's
slot from B2b's specification, the Newman dihedral given to `newmanDoc`,
s-cis or s-trans from the drawing's geometry; R/S and E/Z from B2b's 3D
truth or the SMILES.

**Measured on the model, by our own code:** torsion angles (the
Blondel–Karplus formula, checked on points of known angle at start-up). A
group is axial in 3D when its torsion to the ring (X–C1–C2–C3) is under
120° in size, equatorial when over; the ring a chair when its six
torsions alternate in sign within 30–85°. A Newman projection is kept when
every front–back torsion is within 30° of the drawn dihedral (+120° per
place round). A diene is s-cis in 3D when |C=C–C=C| is under 90°. R/S and
E/Z: RDKit from a 3D molfile of the model's points written here. Time:
`model3D()` in the page, after a first model that loads the engines.

RDKit.js has no dihedral function, so the torsions are not cross-checked
with RDKit; the formula is checked against points of known angle instead.
The report shows the model as Turn in 3D first shows it (`views()` of
`src/layout/threeD.js`, used for the picture only).

## B3: Redraw, several engines with a check

**Claim:** no single 2D layout engine is best everywhere; offering every
engine's drawing, each checked by canonical SMILES, gives a correct and
clean drawing more often than any one engine (Ketcher has Indigo only).

**Data:** `data/b3-bridged.smi` (at least 2 bridgehead atoms),
`data/b3-macrocyclic.smi` (a ring of at least 12 atoms) and
`data/b3-fused.smi` (at least 4 fused rings, no bridgeheads), 100 each from
ChEMBL 37 (see B1 for how they are drawn), and the five molecules of
`TEST_MOLECULES` in `scripts/check/harness.mjs`.

**Runs in Chrome:** Indigo and the 3D engine need Web Workers. The one test
hook added to `src/` for the benchmarks, `window.olomolTest.redraw(smiles)`
(`src/ui/App.jsx`, only with `?test`), pastes the SMILES as Ctrl+V does and
runs `prepare` and `runEngines` of `src/layout/relayout.js` unchanged, as
the Redraw window does; it returns the candidates, the engines skipped,
and every drawing as put in (`withCandidate`) with the SMILES it means.
For the report to show what a rejected drawing would have meant,
`runEngines` keeps a dropped candidate's drawings on its skipped entry
(one line; nothing else in the app reads it).

**Engines:** the whole-molecule ones of `ENGINES`: Indigo layout, RDKit +
ring template, RDKit, RDKit straightened, CoordGen, CoordGen straightened,
Indigo clean-up, 3D projected, 3D another view. An engine whose drawing
equals the pasted one (RDKit's, "same as the current drawing") is counted
with that drawing; one whose drawing equals another engine's, with that.

**Measures (ours):** failed (an error), rejected by the SMILES check (stereo
included), bond-length coefficient of variation, clashes (atom pairs closer
than 0.4 of the median bond length), crossings (bonds that cross),
bond-angle deviation (the mean over atoms of |angle − ideal|: 360°/n
between neighbouring bonds round an atom with n ≥ 3 bonds; with two bonds,
the smallest ring's interior angle through both, else 120°, 180° at a
triple bond or C=C=C), olomol's own `drawingScore` (recorded, not the
judge: it is code under test), and time (the candidate's own `ms`). A
drawing is better than another when it has fewer clashes and crossings,
then when it is less irregular (CV/0.05 + angle deviation/10, by more than
0.05). **Best of all** is the best drawing any engine offered (rejected
ones are not offered). For each engine: how often it gives a clean drawing
(no clash, no crossing), how often it is the best, and how often the best
of all is better than its drawing (a failed or rejected engine counts as
beaten): the key number. Bridged systems are often drawn with crossing
bonds on purpose (perspective), so "clean" is strict for them.

**Truth:** the pasted molecule's canonical SMILES for the check (the app's
own check, recorded); quality by our measures.

## B4: curved-arrow placement

**Claim:** curved arrows are placed by scored rules clear of labels, bonds,
electrons and other arrows, fast enough to redo on every edit, stay right
after edits, and an arrow from an atom with no electrons to give is
refused.

**Data:** the 12 mechanism steps of `scripts/arrow-gallery.mjs` and 39 more
in `data/b4-mechanisms.json` (Diels–Alder, Cope, Claisen, a 6π
electrocyclisation, Wittig, ester hydrolysis, imine and amide formation,
SN1, E1, SN2, NADH and NAD⁺ hydride transfers, epoxide openings, radical
chain steps, peroxide homolysis, Grignard, hydroboration, bromonium,
hemiacetal, arenium, nitration, Michael, enolate and enolisation, pinacol
and hydride shifts, ozonolysis, and two E2 steps on Newman projections):
51 steps, 119 arrows. The molecules are laid out by RDKit side by side as
the gallery does (`mechanismDoc`), not in the geometry textbooks use for
pericyclic steps, which makes those harder. Small molecules with every H
written out (H2O, BH3) are written with one H explicit, as RDKit's
`normalize_depiction` throws on them (in the gallery script; the app's own
paste drops explicit H).

**Measured on olomol's scene (`buildScene`), by our own geometry:**
- *collisions:* the arrow's path within 0.1 bond lengths of a label's box,
  a drawn bond line, a lone pair (a disc of 0.12 round its point) or
  another arrow's path, the path within 0.25 of its own start and head
  left out, and the bond, atom or lone pair it starts or ends at;
- *ends:* the tail's distance to its electrons (lone pair point, bond
  line) and the head tip's to its target (the atom's label box, the bond's
  line, a new bond's midpoint);
- *time:* to place one arrow (the scene with only it, less the scene
  without arrows; every run turned by a small seeded angle so that no
  cached arrow is reused) and to rebuild a whole step's scene, in Node and
  in Chrome (the app's editor, `window.olomol.scene`).

**Edits (seed 20261110):** 100 per step: move an atom up to 0.5 bond
lengths (40 %), turn a molecule (25 %), flip it left to right (15 %, wedges
swapped), or redraw it with RDKit or CoordGen, straightened or not (20 %,
the way `rdkitLayout` in `relayout.js` does; Indigo and the 3D engine need
Web Workers, and Newman projections are not redrawn or flipped). Then: is
each arrow still anchored (tail within 0.5 of its electrons, head within
0.75 of its target), and is an arrow that was clear still clear?

**Refusals:** 50 arrows that olomol's rule should refuse (from an atom with
no lone pair or unpaired electron: CH4's C, BH3's B, a carbocation, NH4⁺'s
N, a carbonyl C, a nitrile C, PCl5's P, …; three fishhooks) and 50 it
should allow (from lone pairs, anions, radicals, bonds), each drawn with
olomol's curved-arrow tool (an `Editor` in Node: pointer down on the start,
moved, up on an H⁺) and counted as made or refused. Arrows that are
chemically wrong at their end (a fifth bond to carbon) are not something
olomol claims to check, and are not tested.


## B6: the canonical form of a curved-arrow step

**Claim:** `get('canonicalForms')` (`src/embed/canonical.js`) gives one
string per step, the same for every drawing of the same step (whichever of
equivalent atoms, equivalent as drawn in 3D; whatever ids; in whatever
order; however laid out), another as soon as the step differs; each arrow
alone (`curvedArrows`) likewise; the products after a reaction arrow as
canonical SMILES.

**Data:** B4's 51 steps (`lib/mechanisms.mjs`) and two E2 steps on
bromocyclohexane chairs, Br axial, every H drawn (`data/b6-steps.json`,
which also holds the products written for every step): 53 steps, 125
arrows. mech-USPTO-31K (Chen et al. 2024) was not used: each reaction's
mechanism there is one list of source–sink pairs, with nothing marking where
one elementary step ends.

**Equivalence (truth):** RDKit's substructure matches of the step's
molecules (our own molfile) onto themselves, kept when every atom keeps its
element, charge, unpaired electrons and isotope and every bond its order;
every one used stays within RDKit's canonical-ranking classes without broken
ties (each atom labelled in turn; RDKit.js has no `CanonicalRankAtoms`).
On chairs and Newman projections only those that keep our own geometry:
every group axial or equatorial as drawn (a bond within 20° of vertical is
axial), every front–back pair anti, gauche or eclipsed as drawn. Two steps
are the same when such an automorphism takes one's arrows onto the other's;
an arrow from a lone pair to an atom not bonded to it is the new bond it
makes, as olomol's data model (`src/embed/arrows.js`, docs/embed.md) has it.

**Invariance:** 20 variants a step (seed 20261123), all made by our own
code: ids renumbered (2), arrows reordered (2), an automorphism applied to
every arrow's ends (4), each molecule moved (2) or turned (2), the drawing
flipped (2), each molecule but a projection redrawn by Indigo's layout
(Redraw's first engine, its wasm called in Node, `lib/indigo.mjs`) (2),
hydrogens drawn as atoms on atoms with implicit H (2), drawn hydrogens no
arrow uses left out (1), and all but the hydrogens at once (1). All but the
ids-only and order-only variants are also renumbered and reordered. A kind
a step has nothing for is replaced by "turned and moved".

**Distinctness:** each single change: each arrow's head moved to an atom
our own test calls another step; each full arrowhead made a fishhook (in a
step of fishhooks, a full arrowhead); each bond source made a lone pair of
one of its atoms; each new-bond head from a bond made an atom head; on
chairs and Newman projections the H taken (axial, anti to the leaving
group) swapped for the other H on its carbon in every arrow.

**Each arrow alone:** in every variant each arrow's string must be its
original arrow's; in every change the changed arrow's must differ (unless
it is the same arrow on its own, as an E2's O → H moved to another H of the
CH3), the others' must not.

**Products:** the step, a reaction arrow and the products written for it
drawn after it; the products' string against RDKit's canonical SMILES of
what was written, and the step's string unchanged.

**Time:** `canonicalForms` per step in Node (median of 9 after 2), and the
bridge's `get('canonicalForms')` in Chrome: an `<olomol-editor>`
(public/embed.js) in a page, the step `set()` as .olom, the round trip
(median of 9 after 2); the Chrome string compared with Node's.
