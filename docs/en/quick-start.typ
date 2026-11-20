#import "../styl.typ": *
#import "../styl.typ" as styl
// the screenshots of the app in English (node scripts/manual-shots.mjs --en)
#let obr(cesta, ..args) = styl.obr("en/" + cesta, ..args)
#let okno(..args) = styl.okno(..args, slozka: "en/img/")
#show: dokument.with(nazev: "Quick start", jazyk: "en")
#set par(spacing: 0.75em)
#show heading.where(level: 2): it => block(above: 1.1em, below: 0.5em, text(11.5pt, weight: "bold", it))

#grid(columns: (1fr, auto), align: horizon,
  [#text(22pt, weight: "bold", fill: akcent)[olomol] #h(0.3em) #text(12pt, fill: seda)[quick start]],
  image("../../public/icons/icon.svg", width: 1.3cm),
)

olomol is a free tool for drawing chemical structures, reactions and mechanisms. It runs entirely in the browser: nothing to install, and it works the same on Windows, Mac and Linux. It was made for teaching at the Department of Physical Chemistry, Palacký University Olomouc, as an alternative to ChemSketch, so the layout will feel familiar: tools on the left, elements and rings at the bottom. A quarter of an hour with these three pages is enough to try it out.

== 1. Opening

Open the address you were given in Chrome, Edge or Firefox.

Your drawings are kept in the browser as you go, each in its tab, so they are still there after you close the page and open it again. For anything important, use Save #ik("save") (#kl[Ctrl+S]) as well.

== 2. The window

#grid(columns: (10.4cm, 1fr), gutter: 12pt, align: horizon,
  okno(10.4cm, ((1, "topbar", "x"), (2, "rail", "x"), (3, "dock", "x"), (4, "inspector", "x"), (5, "tool-hint", "levo"))),
  [
    #set par(justify: false)
    #legenda(
      (1, [files, undo, #ui[Redraw], #ui[Turn in 3D], #ui[Align], flipping, #ui[Show]]),
      (2, [drawing tools (the small triangle in the corner: more variants)]),
      (3, [elements, rings, #ui[Templates], the search bar]),
      (4, [the panel for whatever is selected (section 5)]),
      (5, [help for the tool; #kl[?] shows all keys]),
    )
  ],
)

== 3. A first molecule

+ In the bottom bar, click benzene, then click the canvas.
+ On the left, choose the single bond #ik("single") and click a corner of the ring: a new bond grows from it.
+ Point at its free end and press #kl[O]. That is phenol.

Keys over an atom change the element (#kl[N], #kl[O], #kl[S], #kl[L] is Cl…), over a bond #kl[1] #kl[2] #kl[3] change its order. The same letter over an empty spot chooses *drawing with that element*: a click on an atom changes it, #kl[Shift]+click attaches a new one, #kl[C] goes back to carbon. Add a charge with the charge tool #ik("plusCharge") on the left (its variants have the negative one, δ+ and δ−), or with the #kl[+] and #kl[−] keys over an atom. #kl[Ctrl+Z] undoes.

== 4. The search bar: a structure from a name or SMILES

#grid(columns: (1fr, 5.6cm), gutter: 12pt,
  [
    Type into the search bar at the right of the bottom bar (#kl[/] puts the cursor there): a SMILES, an InChI or a name, such as `aspirin`. A SMILES is drawn as you type. Press #kl[Enter] and click where the molecule should go. It also finds templates and olomol's actions (`ring flip`).

    SMILES and InChI are read on your computer. Names are looked up in the PubChem database (this needs the internet); only the typed text is sent, never your drawing. A SMILES copied from elsewhere can simply be pasted onto the canvas with #kl[Ctrl+V].
  ],
  obr("img/nazev-smiles.png"),
)

#pagebreak(weak: true)
== 5. The molecule panel

#grid(columns: (1fr, 6.2cm), gutter: 12pt,
  [
    #set list(spacing: 0.45em)
    Double-click a molecule to select it. The panel on the right shows what you can do with it:

    - the *formula* and next to it #ui[Info]: masses, HRMS, elemental analysis, SMILES and InChI to copy,
    - #ui[Carbons]: CH#sub[3] written, just a #ui[line], or #ui[All C],
    - #ui[IUPAC numbering] numbers the main chain and says why,
    - #ui[Aromatize] draws a circle in aromatic rings, #ui[Kekulé] takes it back,
    - #ui[Brackets] round the molecule (a transition state, an ion),
    - #ui[Lone pairs] #ui[hidden] / #ui[shown] and #ui[Draw the H] (hydrogens as atoms, for arrows),
    - #ui[Colour] of lines and letters, #ui[Highlight] (a coloured background) and #ui[Delete].

    With just an atom or a bond selected, the panel also shows its element, charge, hydrogens, order or wedge.
  ],
  obr("img/panel-molekula.png"),
)

== 6. Redraw: a nicer drawing in one click

#grid(columns: (1fr, 9cm), gutter: 12pt, align: horizon,
  [
    A molecule pasted as SMILES or drawn in a hurry may not look nice. Select it and click #ui[Redraw] in the top bar. The program offers several drawings and warns about crossing bonds. Click the one you like. None of them changes the molecule or its stereochemistry, and #kl[Ctrl+Z] takes it back.
  ],
  obr("img/rozvrzeni.png"),
)

#block(breakable: false)[
== 7. A simple mechanism

Curved arrows are part of the drawing: they stay with their atoms and bonds, and redraw themselves when the molecule is moved or changed. This is the Friedel–Crafts acylation of benzene in two steps, with the resonance structures of the σ-complex:

#figure(image("img/mechanismus.svg", width: 100%))
]

- Curved arrow #ik("curve") (a tool on the left, #kl[A]): drag from the electrons, that is from a bond or an atom with a lone pair, to where they go. The program works out the route; if you don't like it, drag the arrow or click #ui[Other way] in the panel.
- Lone pairs #ik("pairs") (#kl[:]): click an atom. How many it has follows from its bonds and charge.
- The resonance arrow #ik("resonance") is among the variants of the reaction arrow #ik("rxn"); brackets #ik("bracket") (#kl[K]) are a tool on the left: drag a box round the resonance structures.

#pagebreak(weak: true)
== 8. Colours, highlighting and a grid

#figure(image("img/katecholaminy.svg", width: 80%))

Six catecholamines and related drugs. All of them have the same common part *highlighted in blue*, drawn in the same orientation. Salbutamol (an asthma drug) has its one important difference *highlighted in orange*: CH#sub[2]OH in place of an OH, so the enzyme COMT does not break it down and it acts for hours, not minutes. The groups on the nitrogen are *coloured purple*: the bigger they are, the more the compound acts on β-receptors.

+ Draw the first molecule, copy it (#kl[Ctrl+C], #kl[Ctrl+V]) and change the copy. The common part then stays in the same orientation everywhere.
+ Select everything (#kl[Ctrl+A]), type 3 #ui[Columns] in #ui[Align] and click #ui[Arrange in a grid].
+ *Highlighting:* select atoms (drag a box, #kl[Shift]+click) and click a colour under #ui[Highlight] in the panel. Or take the highlighter #ik("zvyraznovac") at the bottom left and click atoms and bonds.
+ *Colour of lines and letters:* the same, under #ui[Colour] in the panel, or the colour tool #ik("barva") (bottom left, variants in its corner).

== 9. Looks: charges, lone pairs, colours

#grid(columns: (1fr, 3cm, 3cm), column-gutter: 10pt, align: horizon,
  [
    #set list(spacing: 0.45em)
    #ui[Settings] (#ik("settings") at the top right) change the look of the whole drawing and of exported pictures:

    - #ui[Charges]: #ui("+ −"), or circled #text(font: "Noto Sans Math")[⊕ ⊖],
    - #ui[Lone pairs]: #ui[Dots ··], or #ui[Bars (Lewis)],
    - #ui[Atom colours]: #ui[By element], or #ui[Black] (your own colours and highlights stay),
    - and #ui[Style] (#ui[ACS], #ui[RSC], #ui[Slides] or your own), #ui[Carbons], #ui[Aromatic] (a circle or dashed); R/S and E/Z labels are ticked in the molecule's panel.
  ],
  figure(image("img/styl-vychozi.svg", width: 100%), caption: text(8pt)[default], supplement: none, numbering: none),
  figure(image("img/styl-lewis.svg", width: 100%), caption: text(8pt)[#text(font: "Noto Sans Math")[⊕ ⊖], bars, black], supplement: none, numbering: none),
)

== 10. Save, export, paste into Word

- Save #ik("save") (#kl[Ctrl+S]) saves the drawing as an .olom file, which opens here again with everything, arrows and colours included.
- #ui[Copy as picture] (#kl[Ctrl+Shift+C]) puts the drawing (or the selection) on the clipboard. In Word or PowerPoint, paste it with #kl[Ctrl+V].
- #ui[Export] offers SVG (a vector picture for Inkscape and print), PNG, #ui[PDF / Print…], and molfile, SDF, SMILES and other files. #ui[Copy link] there makes a link with the drawing stored in it.
- Drawings open side by side as *tabs*; #ui[Show] #ik("present") puts them full screen for a lecture.

== 11. A problem or an idea?
Every message is welcome. Click the bug #ik("debug") at the top right: #ui[Write the e-mail] opens an e-mail to bugs\@olomol.org with the program's version and your browser filled in; write what you did and what happened. A link to the drawing is too long for an e-mail: #ui[Copy the table] copies it with the table, paste it at the end of the e-mail. Help also holds examples of every kind of drawing, where pointing at a part says how it was drawn, with this guide and the full _Manual_ in its header. Its #ui[Examples in action] button shows five short videos of olomol at work.
