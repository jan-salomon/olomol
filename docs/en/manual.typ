#import "../styl.typ": *
#import "../styl.typ" as styl
// the screenshots of the app in English (node scripts/manual-shots.mjs --en)
#let obr(cesta, ..args) = styl.obr("en/" + cesta, ..args)
#let okno(..args) = styl.okno(..args, slozka: "en/img/")
#show: kniha.with(nazev: "Manual", jazyk: "en")
#set heading(numbering: "1.1", supplement: [chapter])

#titulni(
  nazev: [Manual],
  podtitul: [Drawing chemical structures, reactions and mechanisms in the browser],
  obrazek: align(center + horizon, {
    image("img/titul.svg", width: 17cm)
    v(0.6cm)
    // what the picture shows
    let stitek(t) = box(fill: akcent-svetly, inset: (x: 7pt, y: 4pt), radius: 10pt, text(8.5pt, fill: akcent, weight: "medium", t))
    ("curved arrows", "lone pairs", "wedges and R/S", "ring fills", "highlighting", "colours", "charges", "aromatic circle", "group labels", "text")
      .map(stitek).join(h(5pt))
  }),
  pata: [Jan Salomon #h(1fr) testing version · November 2026 \ Department of Physical Chemistry, Palacký University Olomouc],
)

#obsah()
#counter(page).update(1)

= Introduction <uvod>

This manual shows you how to do what you need when drawing chemistry: draw a molecule or a mechanism with curved arrows, arrange it neatly, and get it into Word, PowerPoint or Inkscape. The chapters follow tasks rather than buttons, so you can go straight to the one you need. If you are new to the program, start with the short _Quick start_. If you would like to know how it works inside, see the appendix (@stavba).

Names of buttons and menus are written #ui[like this] and match exactly what you see on the screen when the program is in English. Keys look like this: #kl[Ctrl+Z]. On a Mac, use #kl[Cmd] instead of #kl[Ctrl].

== What olomol is

olomol is a free chemistry drawing program that runs entirely in your web browser. It was made for teaching, as a replacement for ChemSketch. It draws structures, reaction schemes and mechanisms with lone pairs and curved arrows, and it exports clean pictures for lab reports, theses and presentations.

- *Nothing to install.* Chrome, Edge or Firefox is enough, on Windows, Mac or Linux. If you prefer, you can install it as an app (@instalace).
- *Your drawings stay with you.* The program has no accounts and no server that stores drawings. Something leaves your computer only when you ask for it: looking up a name in PubChem sends the name you typed, and a link to a drawing carries the drawing inside it.
- *The chemistry is real.* The program knows how many hydrogens and lone pairs an atom has, computes the formula, masses and identifiers, and makes sure that tidying a drawing never changes the molecule behind your back. The RDKit, Indigo and OpenChemLib libraries do this work on your own computer.

== Opening

The first visit takes a little longer, and a bar shows how much is left. The chemistry libraries are downloaded only when they are first needed (you may see #ui[Loading the chemistry engine (RDKit)…]). After that they stay on your computer, and the program works without the internet too.

== The window <okno>

#block(breakable: false)[
#okno(15cm, ((1, "topbar", "x"), (2, "rail", "x"), (3, "dock", "x"), (4, "inspector", "x"), (5, "tool-hint", "levo"), (6, "topright", "x")))

#v(0.3em)
#grid(columns: (1fr, 1fr), gutter: 16pt,
  legenda(
    (1, [*Top bar*, in groups: the drawing's name and #ui[Autosaved], new drawing #ik("newDoc"), open #ik("open"), save #ik("save"), #ui[Export] | undo and redo #ik("undo") #ik("redo") | #ui[Redraw], #ui[Turn in 3D] #ik("turn3d") | #ui[Align], flips #ik("flipH") #ik("flipV") #ik("flipBond"), #ui[Horizontal / vertical] #ik("snap") | the projections #ik("ringFlip"): ring flip, turning a chair, Fischer projection and zigzag (@fischer) | zoom, #ik("fit") and #ui[Show] #ik("present"). In a narrow window, the groups that don't fit go under #ik("more") at the end of the bar. With two drawings or more, the tabs are under it (@karty).]),
    (2, [*Drawing tools.* A small triangle in a button's corner means it has more variants: rest the pointer on the button, click the triangle, or click the chosen tool again. At the bottom, #ik("objects") opens the #ui[Objects] panel (@objekty).]),
    (3, [*Bottom bar*: elements, the periodic table #ik("table"), rings, #ui[Templates] and the *search bar* (@nazev).]),
  ),
  legenda(
    (4, [*Panel* with the properties of whatever is selected (@panel).]),
    (5, [*Hints* for the chosen tool. The #kl[?] key shows all keyboard shortcuts.]),
    (6, [Reporting a problem #ik("debug") (@problemy) and settings #ik("settings"): the look of the drawing, the language, the theme and debug mode (@nastaveni).]),
  ),
)
]

== Help and examples <pomoc>

Rest the pointer on any button and a tooltip tells you all it does, along with its shortcut. The hint line above the bottom bar changes with the chosen tool, so it is worth a glance whenever a tool surprises you. Where the top bar has room, its buttons have words as well; in a narrower window they drop them, #ui[Turn in 3D]'s first.

A *right click* on the canvas opens a menu of what can be done with what is under the pointer: cut, copy, paste, delete, #ui[Redraw], #ui[Turn in 3D], the flips, a bond made horizontal or vertical, #ui[Abbreviate], #ui[One compound], #ui[Group]… A right click on a molecule selects it first, as a double click does. On the empty canvas the menu has paste, select all, the view and #ui[Show]. Each item does what its button or key does, and the key is beside it.

#obr("img/kontextove-menu.png", sirka: 30%, popis: [The right-click menu of a molecule])

The round button #ik("napoveda") at the bottom right opens *Help*, the quickest way to see how something is done. It holds about thirty finished drawings, shown as small pictures. Tags such as #ui[Mechanisms], #ui[Stereochemistry], #ui[Texts] or #ui[Files and tabs] narrow the list down.

#obr("img/napoveda.png", sirka: 74%, popis: [Help: pointing at a curved arrow says how it is drawn, and its button lights up in the left bar])

- Pick an example and *point at any part of it*: a tip says how that part is drawn, and the button you would use lights up in the program's bars.
- What cannot be shown by pointing (#ui[Redraw], #ui[Templates], #ui[Align]) is listed as steps under the drawing.
- #ui[Open as a drawing] makes the example your own, to look at closely or to change. #kl[Ctrl+Z] brings back what you had before.

Above the tags, #ui[Examples in action] opens the about page in a new tab, with five short videos of olomol at work: a mechanism, a reaction scheme, a molecule built in steps and partly redrawn, a complex turned in 3D, and a Haworth projection of glucose made a chair, flipped and turned in 3D.

The header of the Help window has the #ui[Quick start] (PDF), this #ui[Manual] on the web and, beside it, #ui[PDF] for printing (the Czech ones when the program is in Czech), #ui[What's new] with the changes in each version, #ui[Keyboard shortcuts], #ui[Report a problem] (@problemy, also the bug #ik("debug") at the top right) and #ui[About], the about page with how to cite olomol, the credits and licences. What's new and About are also under the version in the bottom left corner; both open in a new tab.

== The drawing saves itself <ulozeni>

#grid(columns: (1fr, 5cm), gutter: 14pt, align: horizon,
  [You need not worry about losing your drawing. The browser remembers it by itself, a moment after each change, so you can close the window or turn off the computer and it will be waiting when you come back. The mark beside the drawing's name shows this: #ui[Autosaving…] just after a change, then #ui[Autosaved].],
  obr("img/znacka-ulozeno.png"),
)

Every drawing you have open is kept this way, so all of them are back the next time you open olomol, each in its tab (@karty). This is in this browser on this computer. To move a drawing to another computer or to send it to someone, save it as a file with #ui[Save] (#kl[Ctrl+S], @soubory). A file is also the safest home for work that matters to you, because it stays even if the browser's data are cleared.

*Earlier versions.* While you draw, the browser also keeps earlier versions of the drawing, a few minutes apart. Click the mark (#ui[Autosaved]), or #ui[Open] #ik("open") → #ui[Earlier versions of this drawing…], and a window shows them as pictures, the newest first; #ui[Bring back] puts one on the canvas, and #kl[Ctrl+Z] returns to the drawing you had. Closing the drawing forgets its earlier versions.

The mark warns you in two cases. #ui[Not autosaved] means this browser can't autosave, as in a private window or when its storage is full: save your drawing to a file before you close it. #ui[Another tab] means olomol is open in a second tab that has autosaved its own drawing since. Next time, the one changed last comes back, so save this one if you want to be sure of it. A drawing open in one window of olomol stays in that window: a second window doesn't open it too, so the two never write over each other.

The #ik("newDoc") button starts a new drawing in a new tab, and the drawing you had stays in its own. The empty canvas shows a faint example, a different one of four each time. Point at a part of it to learn how it is drawn, and its button lights up in red.

At the top left, next to the logo, is the *drawing's name*. A new drawing has none yet (#ui[New drawing] in grey); its files are offered under `drawing-` with the date and time, so they do not overwrite each other. Click the name to rename the drawing; saved files are named after it. With two drawings or more, the name is on the drawing's tab, and a double click there renames it.

== Moving and zooming

*To zoom*, use #kl[Ctrl] + wheel or the magnifiers at the top. The percentage between them returns to 100 %. The #ik("fit") button shows the whole drawing; with something selected, it centres the selection and zooms in until it fills the window. *To move the canvas*, use the wheel (with #kl[Shift] for sideways), drag with the space bar held down, or drag with the middle mouse button.

= Drawing structures <kresleni>

== Bonds and atoms

Everything starts with the single bond #ik("single"), which is already chosen when the program opens.

- *Click the empty canvas:* the first bond appears.
- *Click an atom:* a new bond grows from it. The program picks a sensible direction, zigzag and into the largest gap; a chain runs across the page. With #kl[Shift] the bond goes to the other side (the next best place), so a chain can bend the other way.
- *Drag from an atom:* pull a bond where you want it, in 15° steps, or at any angle with #kl[Shift]. Release it on another atom to close a ring. Over the target atom the bond snaps straight to it, so you see the result at once.
- *Click a bond:* it changes from single to double to triple.

#grid(columns: (1fr, 6.2cm), gutter: 14pt,
  [
    The other kinds of bonds are among the tool's variants (in the picture, from the left): single, double, triple, wedge, hashed wedge, wavy, coordination, hydrogen and partial bond. Clicking a double bond with the double bond tool moves its second line to the other side or to the middle. Clicking a wedge with the wedge tool turns it round.

    You can also work from the keyboard without switching tools. Point at a bond and press #kl[1], #kl[2] or #kl[3]. Pressing #kl[1] again over a single bond makes it a wedge, then a hashed wedge, then both from the other end, and then a plain bond again. #kl[Shift+1] goes through them backwards. With bonds selected, #kl[1], #kl[2] or #kl[3] makes all of them single, double or triple at once (with the pointer over the selection or over empty space).
  ],
  [
    #obr("img/nastroje-vazby.png")
  ],
)

== Chains and rings

The chain tool #ik("chain") (#kl[Z]) draws a zigzag chain: drag from an atom or from the canvas. While you drag, it shows how many atoms it adds (from the canvas, the one it starts from too); with #kl[Shift] the zigzag starts the other way.

*Rings* are in the bottom bar (benzene and 3- to 8-membered rings) and among the variants of the ring tool on the left. Before you click, a see-through preview shows what will happen:

- clicking the *canvas* draws a ring on its own,
- clicking a *bond* adds a fused ring (naphthalene from benzene), with #kl[Shift] on the bond's other side,
- clicking an *atom* attaches the ring by a new bond (phenyl); dragging from the atom aims it,
- clicking an atom with #kl[Shift] puts the ring through that atom (a spiro compound).

== Elements, the periodic table and group labels

The bottom bar has the most common elements, each in its own colour so you find them quickly. Pick one, and then:

- *click an atom* to change it to that element,
- *click an atom that already is that element*, or any atom with #kl[Shift], to bond a *new atom* of the element to it (clicking carbon on carbon extends a chain),
- *click the canvas* to put down a lone atom (O: water),
- *drag from an atom* to draw a bond to a new atom.

The element keys are quicker: #kl[C] #kl[N] #kl[O] #kl[S] #kl[P] #kl[F] #kl[H] #kl[I], with #kl[L] for Cl and #kl[B] for Br. What a key does depends on where the pointer is.

- *Over an atom*, the atom becomes that element, once, and your tool stays as it was.
- *Over empty space*, you start *drawing with that element*. It lights up in the bottom bar and works just as described above. Clicking a bond still changes the bond, and #kl[1] #kl[2] #kl[3] set the order of new bonds while the element stays (N, then #kl[2]: a double bond to N). #kl[C] switches back to carbon.

This way you can draw with heteroatoms straight away, instead of drawing a carbon skeleton and rewriting it afterwards.

#grid(columns: (1fr, 5.4cm), gutter: 14pt,
  [
    The #ik("table") button after the elements opens the #ui[Periodic table]. Its elements are coloured by group (#ui[Alkali metals], #ui[Halogens], #ui[Noble gases]…) and carry group and period numbers.

    *Group labels and abbreviations* are in #ui[Templates] → #ui[Abbreviations] and attach like functional groups (@skupiny):

    - *Placeholders* such as R, R′, X, Nu, E, LG or Ar have no hydrogens or lone pairs, which suits general mechanisms. (Ar here is aryl, not argon.)
    - *Abbreviations* such as Me, Et, Ph, Bn, Ac, Boc, Ts, OMe or CO2Et count in the formula and mass, and files get the whole group. To the left of a bond they are written reversed (MeO–, EtO2C–).

    With an atom selected, you can also type an abbreviation or a placeholder into the #ui[Element] field of the panel. An isotope is written with its mass number (13C, 18O), and deuterium and tritium as D and T, or 2H and 3H. A symbol is taken as written (Cl, Na) or all in small letters (cl, na); CO or NI is refused rather than read as cobalt or nickel, since two capitals are two atoms.

    #ui[Draw out] in the panel draws the group an abbreviation stands for (Ph as a benzene ring), and #ui[Abbreviate] does the opposite for a selected group. A selection with no abbreviation as a whole gets one for the groups in it that have one (CH#sub[2]N(CH#sub[3])#sub[2] becomes CH#sub[2]NMe#sub[2]), and a CH#sub[3] selected on its own becomes Me. A wedge on the bond to the group stays, so the stereochemistry does not change. An abbreviation stands for a group on one bond, so it takes no second one: draw it out first to bond to its atoms. Charged groups have abbreviations too, with the charge on the label: SO#sub[3]#super[−] (a sulfonate), CO#sub[2]#super[−] or COO#super[−] (a carboxylate), OPO#sub[3]#super[2−] and OPO#sub[3]H#super[−] (phosphates) and PO#sub[3]#super[2−]; drawn out, the charge sits on an O, where it belongs.
  ],
  obr("img/periodicka.png"),
)

== Charges, radicals and hydrogens

The charge tool on the left has four kinds: positive #ik("plusCharge"), negative #ik("minusCharge") and the partial charges *δ+* #ik("deltaPlus") and *δ−* #ik("deltaMinus"). Click an atom, and click again to raise the charge (or lower it, with the negative one); a partial charge clicked again goes. #kl[+] and #kl[−] choose the positive and the negative one.

The unpaired electron #ik("radical") is a variant of the lone pairs tool #ik("pairs"). Click an atom for one electron, again for two side by side (a singlet), and again for none. Two on separate sides (a triplet), three or four are in the panel's #ui[Unpaired] row; on an atom without bonds its lone pairs show with them, as a Lewis symbol (·N̈·).

#figure(
  grid(columns: (1fr, 1fr), column-gutter: 16pt, row-gutter: 5pt, align: center + horizon,
    image("img/lewis.svg", width: 100%),
    image("img/lewis-cary.svg", width: 100%),
    text(8pt, fill: seda)[dots], text(8pt, fill: seda)[bars],
  ),
  caption: [Lewis symbols of B, C, N, O and Cl, in dots and in bars (#ui[Settings] → #ui[Lone pairs])],
  supplement: [Fig.],
  kind: image,
)

Over an atom you can also press #kl[+] or #kl[−] for a charge and #kl[.] for an unpaired electron. With atoms selected, #kl[+] and #kl[−] change the charge of all of them.

#tip(nadpis: "Other keyboard layouts")[Digits are read by the key's position, so #kl[1] #kl[2] #kl[3] also work in the top row of a Czech keyboard, for example (+ ě š). Over an atom, the + in that row raises its charge; over empty space it acts as #kl[1], so choose the positive charge tool with + on the number pad, or with its button #ik("plusCharge").]

An atom with more bonds than it can have gets a *red dashed ring*, which shows only on screen and never in pictures. The panel then says what is wrong, for example #ui[Si can't have 6 bonds]. Usually a charge is missing; for SiF#sub[6]#super[2−] see @komplexy.

*Hydrogens* are worked out from the bonds and the charge (CH#sub[3], NH#sub[2], OH). To set another number, use the #ui[Hydrogens] row of the panel. #ui[Draw the H] draws the hydrogens of the selected atoms as atoms of their own, which you need when a curved arrow goes to or from a hydrogen. #ui[Hide drawn H] hides them again.

Chain ends are written as CH#sub[3] by default. The #ui[Carbons] switch in the panel (#ui[CH₃], #ui[line] or #ui[All C]) changes this for the selected carbons: the whole molecule, or just one end. #ui[All C] writes every carbon (CH#sub[3], CH#sub[2], CH), for those who do not yet read a corner as a carbon. The default for new drawings is in #ui[Settings]. A charged carbon is written (C#super[+]) unless it is set to #ui[line]: then only its charge is drawn, at the corner, as a carbocation or a carbanion often is in a mechanism.

== Stereochemistry

The wedge #ik("wedge") points towards you and the hashed wedge #ik("hash") away from you. Both are among the bond tool's variants. A wedge starts at the atom you drag from, so its narrow end is at the stereocentre. The wavy bond #ik("wavy") marks an undefined configuration.

To show *R/S and E/Z* labels (Λ and Δ for complexes), tick #ui[R/S, E/Z, Λ/Δ] in the panel, for the whole selected molecule or just the selected atoms and bonds. RDKit computes them, and they also go into exported pictures and olomol's files.

When a bond joins the wide ends of two wedges it is drawn bold, as is customary (the bridge of a morphinan, the front edge of a Haworth formula). Any single bond can be drawn bold on purpose too, a bond forming in a scheme or one you want to point at: select it and choose #ui[bold bond] (▬) in the panel's #ui[Stereo] row. An atom's label can be bold as well: #ui[Label] → B in the panel.

== Special bonds

The bond tool's variants also include three bonds that do not count like ordinary ones. The key #kl[D] chooses the first of them, and each further press the next (over a bond, it turns that bond into them):

- #ik("dative") a *coordination (dative) bond*, an arrow from the donor, which spends a lone pair on it (another click turns it round),
- #ik("hbond") a *hydrogen bond*, drawn dotted,
- #ik("partial") a *partial bond*, forming or breaking, drawn dashed, for transition states.

A wedge or a hashed wedge gives a coordination bond depth, with its narrow end at the metal, and it stays a coordination bond, so the donor gets no extra bond. #ui[Redraw] and #ui[Turn in 3D] then keep the mirror image (Λ or Δ) you drew: #ui[Redraw] does not offer drawings that would lose it, and #ui[Turn in 3D] warns at a view that would. For an octahedral complex with two or three chelates (cis-[CoCl#sub[2]\(en)#sub[2]]#super[+], [Co\(en)#sub[3]]#super[3+]), #ui[R/S, E/Z, Λ/Δ] writes (Λ) or (Δ) beside the metal. If you prefer, Settings can draw these arrows as plain lines.

#obr("img/lambda-delta.svg", sirka: 18%, popis: [[Co(en)#sub[3]]#super[3+] drawn with wedges; #ui[R/S, E/Z, Λ/Δ] writes (Λ) or (Δ) beside the metal])

These bonds are kept in olomol's files (.olom), KET files and pictures, but not in molfile, SMILES and similar files (@omezeni).

== Selecting, moving, rotating and deleting

The Select tool #ik("select") (#kl[V], or #kl[Esc]) does the following:

- a click selects an atom, bond, arrow or text, and #kl[Shift]+click adds to the selection,
- dragging over empty space selects everything in a box, and what it will take lights up before you let go; the tool's variants include a lasso #ik("lasso"), and #kl[Esc] switches between the two when there is nothing left to cancel,
- a *double click* selects the whole molecule, #kl[Shift]+double click adds it to the selection, a *triple click* selects its whole row of a reaction scheme (its molecules, + signs and arrows with what is on them), and #kl[Ctrl+A] selects everything,
- #kl[Ctrl]+click selects the group a thing is in (@objekty),
- dragging moves the selection, and so do the arrow keys (with #kl[Shift], further),
- the *round handle* above the selection rotates it,
- an atom or bond dragged onto another atom *merges* with it. It snaps while you drag and shows the result; drag on and it lets go. A filled ring keeps its colour as long as it stays a ring.

To delete, use the eraser #ik("erase") (#kl[E]), which works by clicking or with a box. #kl[Delete] or #ui[Delete] in the panel removes the selection. With nothing selected, #kl[Delete] removes whatever is under the pointer.

Every step can be undone, so feel free to try things: #kl[Ctrl+Z] undoes and #kl[Ctrl+Shift+Z] redoes.

== One compound <pohromade>

A salt such as K#sub[2]SiF#sub[6] is three separate particles (K#super[+], K#super[+] and SiF#sub[6]#super[2−]). Select them all and click #ui[One compound] in the panel. An invisible link joins them, so they move, align and go into a grid as one molecule, and the panel shows one formula (F#sub[6]K#sub[2]Si).

The links show while the compound is selected, or all the time when #ui[Links] in #ui[Settings] is set to #ui[shown]. #ui[Separate] separates the particles again. Links are not written to molfile and SMILES.

== Groups and the Objects panel <objekty>

A *group* holds things together for selecting and moving, without making them one compound: a molecule with its number under it, the two halves of a scheme, an exercise's answer you want to move aside. Select two things or more (molecules, arrows, + signs, texts) and press #kl[Ctrl+G]; groups can go into larger groups too. #kl[Ctrl+Shift+G] takes a group apart, one level.

A plain click still selects an atom or a molecule, so a group never gets in the way of drawing. #kl[Ctrl]+click selects the group, and another #kl[Ctrl]+click the group round it; #kl[Ctrl]+drag moves it, and #kl[Ctrl]+drag of a box takes the whole groups of what it touches. #ui[Align] moves groups as wholes, and SVG pictures keep them as groups, for Inkscape.

#grid(columns: (1fr, 6cm), gutter: 14pt, align: horizon,
  [The #ui[Objects] panel #ik("objects"), at the bottom of the tool bar, lists the drawing's things and groups. A click on a row selects it (with #kl[Shift] or #kl[Ctrl], adds it), the pointer on a row lights it up in the drawing, and the arrow before a group unfolds it. A double click on a group names it. A row dragged onto a group goes into it, and onto the strip at the bottom out of every group. The buttons at the top group and ungroup what is selected. The right-click menu has #ui[Group], #ui[Ungroup] and #ui[Select its group] too.],
  obr("img/objekty.png", popis: [The LDH scheme from Help as one group, named]),
)

== Copying and pasting

#kl[Ctrl+C], #kl[Ctrl+X] and #kl[Ctrl+V] work as they do elsewhere. A pasted copy follows the pointer, see-through, until a click puts it down, and #kl[Esc] cancels.

You can paste from elsewhere too: a SMILES, InChI or molfile copied from a web page or another program is drawn straight away with #kl[Ctrl+V]. A double bond whose E or Z the SMILES leaves open gets a wavy bond beside it.

== Text

Choose the text tool #ik("text") (#kl[T]), click and type. What you type stays exactly as written, so the numbers in a DOI or a name are left alone. A bar over the text holds everything for formatting it:

#obr("img/text-okenko.png", sirka: 60%, popis: [The bar over a text, after #ui[Formula] turned CO32- into a formula])

- #ui[Formula] turns the selected part, or with nothing selected the whole text, into a formula. Digits after letters become subscripts and a charge at the end (Fe3+, CO32-, [SiF6]2-) a superscript. It also understands CO\_3^2-, and e- or 2e- as the electron's charge. #ui[Plain] removes the formatting.
- What this rule cannot do, you set by hand: x#sub[2] (#kl[Ctrl+,]), x#super[2] (#kl[Ctrl+.]), *B* (#kl[Ctrl+B]) and _I_ (#kl[Ctrl+I]). They change the selected part or, with nothing selected, what you type next.
- The bar's menus hold the alignment of lines (a multi-line text under a molecule or on an arrow is otherwise centred) and special characters: Greek letters, arrows, °, ±, ‡.
- #ui[Aa] switches the whole text between a sans-serif (Arial) and a serif font (Times New Roman), and the field beside it sets its size in points. Without them a text has the drawing style's font and size (@nastaveni). A selected text can be made bold as a whole with #ui[Bold] in the panel, a compound number, say.

#kl[Enter] finishes the text and #kl[Shift+Enter] starts a new line. A copied text reaches other programs as plain words, so a DOI pastes straight into the browser.

== Reaction arrows

Choose the reaction arrow #ik("rxn") (#kl[X]). A click puts down an arrow of standard length, and dragging draws your own (#kl[Shift]: at any angle). Its variants are equilibrium #ik("equilibrium"), resonance #ik("resonance"), retrosynthetic #ik("retro"), multi-step #ik("multistep"), crossed #ik("failed") (a reaction that does not go), the equals sign #ik("same") (the same thing drawn another way, a chair = its Haworth projection; #ui[Align reaction scheme] spaces it like an arrow) and the dipole arrow #ik("dipole"), which moves with its molecule. To change a selected arrow's length, use #ui[Length] in the panel (in bond lengths) or drag its end.

For an equilibrium that lies to one side, select the equilibrium arrow and click the button in the panel's #ui[Favours] row: each click moves it on, from even to the products' side (the lower harpoon shorter) and to the reactants' side (the upper one shorter).

#obr("img/sipky.svg", sirka: 70%, ramecek: false, popis: [Top, an equilibrium that favours the products, the crossed arrow and the equals sign. Below, thioredoxin reduced: 2 e#super[−] and 2 H#super[+] come in on the upper harpoon's arc and leave on the lower one's on the way back])

The #ik("plus") tool puts a plus sign between reactants.

== Anchors

Anchors keep a text or a reagent with whatever it belongs to, so you never have to move things one by one.

#obr("img/kotvy.svg", sirka: 86%, ramecek: false, popis: [A reaction scheme with compound numbers on the anchors under the molecules])

*On a molecule.* Every molecule has four places for text: below, above, left and right. Drag a text towards a molecule and the anchors show as boxes, with the nearest one highlighted. Release, and the text stays there: it now moves and aligns with the molecule. Several texts on one anchor stack up, and dragging one to another place changes the order. This is how you put a compound number under a molecule or a count (2 NaOH) to its left. In the panel, the arrow buttons ↓ ↑ ← → choose the anchor and #ui[free] frees the text; dragging it away from the molecule frees it too. A text you type right under, over or beside a molecule goes on that anchor at once.

*On a reaction arrow.* An arrow has anchors above and below. Drag a text (conditions) or a whole molecule (a reagent) onto it and it moves with the arrow, as does a text typed right over or under it; drag within the row to reorder. Beside a turned or upright arrow they stand one under the other, close to it, as over and under a horizontal one. In the panel you can put + or − before a molecule on an arrow (added, leaving). A double click on an arrow selects it with everything on it.

== Side arcs on reaction arrows

A side arc shows something joining or leaving a reaction on the way, as NAD#super[+] → NADH does.

#obr("img/bocni-oblouky.svg", sirka: 62%, ramecek: false, popis: [Lactate dehydrogenase, with NADH coming in and NAD#super[+] leaving on side arcs])

+ Choose the arrow tool. A small circle appears in the middle of each reaction arrow.
+ Drag out of the circle for an outgoing arc, or from the canvas to the circle for an incoming one, above or below the arrow.
+ Drag a text or a molecule onto the end of the arc. The arrow lengthens itself to fit, and shortens again if you take it away.

A further arc snaps to the length of the first; drag on to make it longer. To change an arc afterwards:

- drag its end to change its length, or across the arrow to move it, with its stack, to the other side,
- click it to select just the arc, and #kl[Del] deletes it; what was at its end stays where it is, free,
- in the arrow's panel, #ui[Flip] #ik("flipH") reverses the arrow and #ik("flipV") moves the arcs and stacks to the other side.

If you have set an arrow's length by dragging its end, the arcs leave that length alone, though #ui[Align reaction scheme] does change it.

On an *equilibrium arrow* each of its two harpoons has its own arcs: an arc above it meets the upper harpoon and goes its way, an arc below meets the lower one and goes back. So the reduction of thioredoxin takes in 2 e#super[−] and 2 H#super[+] above and gives them off below on the way back.

== The panel on the right <panel>

#grid(columns: (1fr, 6cm), gutter: 14pt,
  [
    The panel shows the properties of whatever is selected and lets you change them.

    For a *whole molecule* it shows the formula (with the #ui[Info] button, @info), #ui[Carbons], #ui[IUPAC numbering], #ui[R/S, E/Z, Λ/Δ], #ui[Aromatize] and #ui[Kekulé], #ui[Brackets], lone pairs, #ui[Draw the H], #ui[Colour] and #ui[Highlight]. For several molecules it adds #ui[One compound].

    For *one atom or part of a molecule*, an #ui[Atom] section appears: #ui[Element], #ui[Number], #ui[Charge] (− and + by one; also δ− and δ+), #ui[Unpaired] electrons, #ui[Lone pairs], #ui[Label] (normal or bold) and #ui[Hydrogens]. Under the lone pairs it says how many the atom has.

    For a *bond* it shows #ui[Order], #ui[Kind], #ui[Stereo] (with a bold bond among them) and, for a double bond, #ui[2nd line]: #ui[Next] moves the second line on, to the middle, one side or the other, and #ui[Auto] gives it back to the program.

    At the bottom there is always #ui[Delete] and how many things are selected.
  ],
  obr("img/panel-atom.png"),
)

= Templates and structures from names <sablony>

#grid(columns: (1fr, 8cm), gutter: 14pt,
  [
    #ui[Templates] in the bottom bar (or #kl[Shift+T]) opens a collection of ready structures. On the left, under the search, are its groups: #ui[Rings], #ui[Functional groups], #ui[Abbreviations], #ui[Compounds], #ui[Conformations and projections], #ui[Complexes], #ui[Amino acids], #ui[Sugars and nucleobases] and #ui[Reagents and solvents]. The large ones are split further (#ui[Rings] into aromatic, heteroaromatic, alicyclic and saturated heterocycles; #ui[Conformations and projections] into chairs and boats, Newman, Haworth and Fischer projections): a group shows all of it under headings, a subgroup only its own. Next time it opens where you were last.

    A click picks a template. A see-through preview then follows the pointer, and another click puts it down, as often as you like. #kl[Esc] stops.
  ],
  obr("img/sablony.png", popis: [Templates, chairs and Newman projections]),
)

== Searching <hledani>

Type part of a name into #ui[Search…], in English or Czech (`acid`, `glucose`, `chair`). An amino acid is also found by its code, which is on its card (`Phe` or `F`). When no template matches, the field draws a SMILES or looks up a name, as the search bar does (@nazev).

#grid(columns: (1fr, 8cm), gutter: 14pt,
  [
    With a *question mark* in front, the search lists the templates that have a certain part in them, whatever they are called. Capitals do not matter.

    - *a group:* `?oh`, `?Ts`, `?Boc`, `?Ph`,
    - *a kind of compound:* `?ester`, `?amine`, `?ketone`, `?acid`,
    - *an element:* `?S`, `?Cl`,
    - *an amino acid by its three-letter code:* `?ala`,
    - *any part, written as SMILES:* `?C=O`, `?C(=O)N`.

    This is handy in teaching: `?ester` shows all the esters among the templates at once.
  ],
  obr("img/sablony-hledani.png", popis: [Searching the templates with a question mark: `?ester`]),
)

== Functional groups attach <skupiny>

#grid(columns: (1fr, 8cm), gutter: 14pt,
  [
    The templates in #ui[Functional groups] have a point of attachment. Pick a group and click an atom of your molecule: the group bonds to it, turned away from the atom's other bonds. Dragging from the atom aims the group. With #kl[Shift] the atom becomes the group's first atom (COOH on pentane's end carbon gives pentanoic acid). A click on the empty canvas puts the group down on its own, on R.

    A group with an abbreviation (Ph, Boc, OMe…) has a small button with that label on its card. It puts the group in as one atom with that label.
  ],
  obr("img/sablony-skupiny.png", popis: [Functional groups, with their abbreviations at the top right of the cards]),
)

== Conformations and projections

- *Chairs and the boat* are drawn as in a textbook: parallel edges, axial bonds vertical, equatorial ones parallel to ring bonds. A chair is read as the molecule it shows, seen a little from above: its lower long edge in front, its upper one at the back, each group up or down as it points. So SMILES, InChI, #ui[Info] and files get the stereoisomer in the picture (the β-D-glucose template is β-D-glucose, trans-1,2-dibromocyclohexane stays trans); other programs get it as wedges on the chair. A cyclohexene drawn in a chair's shape (the half-chair of an E2 product) is read the same way, though it can't be flipped or turned. Fused and bridged rings (decalins, steroids) get no stereochemistry from the picture yet.

  You can also draw a chair by hand with the bond tool: it is recognised by the shape every chair has, even if it isn't exactly the template's. Its opposite edges are parallel and two opposite corners point inwards (a zigzag). A regular hexagon, a Haworth ring and a boat don't have this shape. A ring with blunt tips, where you can't tell which chair it shows, isn't taken for a chair. When you point at a recognised chair or drag one of its atoms, the whole ring lights up in green-teal instead of the usual blue; the drawing itself doesn't change. Stereochemistry, #ui[Turn in 3D] and the ring flip work on a recognised chair. #ui[Ring flip] #ik("ringFlip") turns a chair into the other chair (@preklopeni).
- *Newman projections* of ethane, butane and cyclohexane are molecules seen along a bond: the front carbon is the point in the middle, the back carbon the circle, and every group round them is an ordinary atom. Curved arrows, charges, lone pairs and R/S work on them as on any molecule: an E2 on cyclohexane, seen along C1–C2 and C5–C4 with the axial bonds straight up and down, is drawn with an arrow from the axial C–H to the bond seen end on (point between the middle and the circle) and one from C–Br to Br. A click right in the middle picks the front carbon, a click on the circle the back one. With a carbon of the projection selected, the #ui[Newman projection] panel rewrites the groups (#ui[Front], #ui[Back]: H, CH3, OH, Cl, Ph…), sets the #ui[Dihedral] (#ui[0°] eclipsed (syn), #ui[60°] gauche, #ui[120°] eclipsed, #ui[180°] anti) and turns the back carbon with #ui[Turn the back 60°]; in cyclohexane the ring groups stay and the back can't turn on its own. Files and SMILES get the stereoisomer the projection shows; molfile, CDXML and the other formats for other programs get it drawn plainly with wedges. #ui[Redraw] makes an ordinary drawing of it, and drawings from older versions open as molecules.
- *Haworth and Fischer projections* from the templates (glucose, galactose, ribose, glyceraldehyde, alanine, serine…) carry stereochemistry, which is written to files as wedges. A Fischer projection can also be made from any open chain drawn with wedges, or drawn by hand and read as one with a click (@fischer).

#obr("img/newman-e2.svg", sirka: 28%, popis: [An E2 on cyclohexane seen along C1–C2 and C5–C4: the Br and the H taken are trans-diaxial])

== Complexes <komplexy>

The #ui[Complexes] group has the general shapes of coordination compounds: #ui[Linear], #ui[Trigonal planar], #ui[Tetrahedral], #ui[Square planar], #ui[Trigonal bipyramidal], #ui[Square pyramidal] and #ui[Octahedral]. A general atom M sits in the middle with ligands L round it, and wedges give depth. Replace M and L like any atom: click with an element from the bottom bar, press a key over the atom, or use the panel's #ui[Element] field, where you can also type NH3, PPh3 or Cl.

*A complex ion's charge belongs to an atom.* The program counts bonds and lone pairs from the atoms' charges, and a charge written on brackets is just text. Take hexafluorosilicate, [SiF#sub[6]]#super[2−], as an example:

+ Put down an #ui[Octahedral] complex, then change M to Si and all L to F (select them and type F into #ui[Element]).
+ Select Si and set #ui[Charge] in the panel to #ui[2−], or press #kl[−] twice over the atom. Si with six bonds is now fine and the red ring goes.
+ For the bracket notation, click the ion with the #ui[Brackets] tool. Si already carries the charge, so do not write it on the brackets, or the picture shows it twice.
+ Add the K#super[+] ions and join the whole salt with #ui[One compound] (@pohromade).

There is another way, closer to the bonding picture: four plain Si–F bonds, and two fluorides F#super[−] attached by coordination bonds #ik("dative") from F to Si. A dative bond does not count among Si's bonds, so Si stays neutral and the two F#super[−] carry the charges.

#obr("img/komplex-kobalt.svg", sirka: 76%, ramecek: false, popis: [Cobalt(II), octahedral (pink) and tetrahedral (blue): charges on the metal, brackets round each complex])

To see any complex in space, use #ui[Turn in 3D] (@otoceni), also a square planar one such as cisplatin drawn as a cross.

== The search bar: structures, templates and actions <nazev>

The field at the right end of the bottom bar (#kl[/] puts the cursor in it) understands what you type in several ways, and a list above it shows what it found, the best next to the field. #kl[↑] and #kl[↓] choose, #kl[Enter] does it, #kl[Esc] leaves.

#grid(columns: (1fr, 7.4cm), gutter: 14pt,
  [
    - A *SMILES* (`CC(=O)Oc1ccccc1C(=O)O`) or an *InChI* is drawn as you type, on your own computer, even offline; #kl[Enter] and a click put it where it should go.
    - A *name* (`aspirin`, `caffeine`) or a *PubChem number* (`CID 2244`) is looked up in PubChem, which needs the internet and knows English names only. PubChem gets only what you typed, never your drawing.
    - *Elements* by symbol or name (`Fe`, `iron`) give the atom tool; *templates* come by name, as in #ui[Templates]; and with a question mark in front, the templates with a part in them (`?ester`, `?C=O`, @hledani).
    - *olomol's own tools and actions* by name or by what they do (`ring flip`, `export SVG`, `newman`, `show`), with their keys beside them, so you can find what you don't know the button of.
    - *Drawings*: the open ones by name, and your recent files.
    - A *link* to olomol, or just its end (`#smiles=CCO`), opens what it holds (@odkazy), handy in the installed app, which has no address bar.
  ],
  obr("img/nazev-smiles.png", popis: [A SMILES drawn as you type]),
)

A SMILES, InChI or CID comes first in the list; words find what olomol has first and PubChem last, so #kl[Enter] never sends a word to PubChem that a template or an action matches.

When a SMILES has a mistake, the program says what and where, for example #ui[Atom 2 (N) has 4 bonds, more than a neutral N can have; with a charge it can have one more: \[N+\].] When the mistake is a charge outside its brackets (N+ for [N+]), it offers the corrected SMILES: #ui[Draw … instead].

#grid(columns: (1fr, 7.4cm), gutter: 14pt,
  [
    A SMILES or InChI copied from elsewhere can simply be pasted onto the canvas with #kl[Ctrl+V]; you do not need the search bar for that.

    A halogen with more bonds is drawn as written: `Cl(=O)(=O)(=O)[O-]` as perchlorate with Cl=O double bonds (not Cl#super[3+] with four O#super[−]) and `Cl=O` as H–Cl=O. RDKit itself rejects such notation, so it gives no InChI or R/S for them.
  ],
  obr("img/hledani.png", popis: [`chair`: templates and actions]),
)

= Mechanisms <mechanismy>

In olomol, lone pairs and curved arrows are *part of the drawing*, not pictures laid on top. They belong to their atoms and bonds, so when you move, rotate or change a molecule they redraw themselves, even while you drag.

#obr("img/mechanismus.svg", ramecek: false, popis: [Friedel–Crafts acylation of benzene in two steps, with the resonance structures of the σ-complex])

== Lone pairs and unpaired electrons

Choose lone pairs #ik("pairs") (#kl[:]) and click an atom, or drag a box over several atoms. If atoms are already selected, pressing the tool's button or #kl[:] shows the pairs on all of them (again: hides them). In the panel the same thing is the #ui[Lone pairs] switch: #ui[hidden] / #ui[shown].

How many pairs an atom has follows from the chemistry: valence electrons minus charge, bonds, hydrogens and unpaired electrons. That is why the nitrogen of pyrrole has none and that of pyridine one. Add a charge or a bond and the count updates itself. Pairs are drawn as dots; #ui[Settings] can switch them to bars (#ui[Bars (Lewis)]).

== Curved arrows and fishhooks

Choose the curved arrow #ik("curve") (#kl[A]) for an electron pair, or the fishhook #ik("fishhook") among its variants (#kl[Shift+A]) for one electron. Then:

+ Start where the *electrons come from*: a bond, an atom with a lone pair, or for a fishhook an atom with an unpaired electron (the fishhook starts at that electron).
+ Drag to where they *go*: an atom, a bond, or the dot of a new bond (see below), and release.

Instead of dragging, you can click the start and then the end. The tool stays on, so you can draw arrow after arrow. The program works out the path itself: it avoids labels, bonds, lone pairs and other arrows, and starts on the right side.

*Arrows to a new bond.* When the electrons make a new bond, the arrow can end between the two atoms, where the bond forms. While you drag a fishhook, or a curved arrow with #kl[Shift] held (it can also be pressed in the middle of the drag), faint dashed lines lead from the electrons to every atom within five bond lengths that a new bond could go to, each with a dot in its middle. The lines in the pointer's direction are stronger. Drop the arrow on a dot and it ends at the new bond; drop it on an atom and it ends on the atom. This is how you draw hydrogen abstraction by a chlorine radical: a fishhook from Cl• and one from the H–C bond meet at the new Cl–H bond, and the other fishhook from the H–C bond goes to the carbon. Two radicals combining, or a nucleophile making a new bond, are drawn the same way.

#obr("img/nova-vazba.png", sirka: 55%, popis: [A fishhook from the H–C bond dragged onto the dot of the new Cl–H bond, where the fishhook from Cl• already ends])

It also checks the chemistry. It refuses an arrow from an atom that has no electrons to give and tells you why, for example #ui[This C has no lone pair or unpaired electron, so the electrons can't come from it. Start on a bond or another atom.]

The colour of new arrows (red, say) is set in #ui[Settings] → #ui[New arrows].

== When an arrow does not look right

#obr("img/sipka-panel.png", sirka: 66%, popis: [A selected curved arrow and its panel])

- *Drag* the arrow with the select tool #ik("select") to where it should run. The program picks the nearest good shape.
- Click #ui[Other way] in the panel to draw the arrow the second best way, from the other side or from another lone pair. Click again for more; #ui[Best way] returns the original shape.
- The #ui[Electrons] switch turns the arrow into a fishhook and back (#ui[pair] / #ui[one (fishhook)]).

== Orbitals <orbitaly>

Orbitals are among the variants of the tool #ik("orbitalP") below the lone pairs: a p orbital #ik("orbitalP"), a hybrid orbital #ik("orbitalHybrid") (a lone pair, σ\*) and an s orbital #ik("orbitalS"); the fourth variant, the overlap line #ik("orbitalOverlap"), only draws dashed lines, dragged from one orbital to an orbital of another molecule. Click an atom to put one on it. A p orbital stands upright, a hybrid points away from the bonds, and dragging from the atom points it that way at once. Orbitals lie behind the bonds and labels, so the drawing stays readable.

- *Turning:* drag a lobe, with the orbital tool or the select tool. It turns in 15° steps and snaps to the bonds' directions, the perpendiculars to them and the lines between them; with Shift it turns freely. It turns, flips and is redrawn with its molecule.
- *Phase:* a click on a lobe with the orbital tool swaps the shaded and the white lobe; in the panel it is #ui[Other phase]. The shaded lobe is grey and the other white. The paint tool colours the lobe you click; in the panel, the toggle above the colours, #ui[shaded] or #ui[other phase], chooses which lobe they paint.
- *Size:* the lobes' size, for instance by the HOMO's and LUMO's coefficients, is set with − and + in the panel.
- *Overlap:* a lobe dragged onto an orbital of another molecule draws a dashed line between them. The two stay two molecules but are aligned together, like a diene and its dienophile. The line runs between the lobe you dragged and the lobe you dropped it on (a C–H bond's lobe and the lower lobe of a p orbital, say); dropped on the atom, it joins the lobes facing each other.
- *Arrows:* a curved arrow can start at a lobe or end on one, from a nucleophile's lone pair into the σ\* of a C–Br bond, say.

On an atom with a label (O, N, Br) the lobes start outside the letters, and written hydrogens and the charge keep out of their way (NH beside the orbital, HO#super[−] with its minus over the O). In #ui[Turn in 3D] (@otoceni) the p orbitals stand upright to the molecule's plane as you see it, on the side you drew them on. After #ui[Use this view] they stay so, and a new p orbital on such an atom gets the same direction.

#figure(
  grid(columns: (1fr, 1.25fr), column-gutter: 16pt, align: center + horizon,
    image("img/orbitaly-diels-alder.svg", width: 78%),
    image("img/orbitaly-sn2.svg", width: 100%),
  ),
  caption: [Left, the diene's HOMO and the ethylene's LUMO in a Diels–Alder reaction: the lobes sized by the coefficients, dashed lines joining lobes of one phase. Right, an S#sub[N]2: the arrow from the hydroxide's lone pair into the σ\* of the C–Br bond],
  supplement: [Fig.],
  kind: image,
)

== Resonance structures, transition states and brackets

#obr("img/sn2.svg", ramecek: false, popis: [S#sub[N]2: a transition state with partial bonds, partial charges and brackets with ‡])

*Resonance structures* are separated by the resonance arrow #ik("resonance"), a variant of the reaction arrow.

*Brackets* #ik("bracket") (#kl[K]): drag a box, or click a molecule. The #ui[Brackets] button in the panel puts them round the selected atoms. Brackets round a whole molecule suit a *transition state* or a *complex ion*, and the panel adds ‡, a charge or anything you type at the top right. Brackets round part of a chain mark a polymer's *repeating unit*: they cross the bonds leaving it and get n. #ui[Shape] switches between square and round.

*Transition states* use the partial bonds and δ charges among the variants of the bond and charge tools. A δ+ or δ− that a curved arrow would cross moves to another side of its atom by itself. #ui[Redraw] turns an S#sub[N]2 transition state sketched by hand into the textbook picture: both partial bonds in a line, and the other three bonds with wedges as you sketched them.

== Aromatic rings

#ui[Aromatize] in the panel draws a circle in aromatic rings, solid, or dashed if you choose that in #ui[Settings] → #ui[Aromatic]. Charged groups that look the same in all resonance structures (COO#super[−], NO#sub[2], SO#sub[3]#super[−], guanidinium) are drawn delocalised with δ charges. With nothing selected, this applies to all molecules. #ui[Kekulé] brings back single and double bonds.

Under the circle the single and double bonds remain, so the formula, lone pairs and files do not change, and other programs get an ordinary Kekulé structure. That is also why #ui[Kekulé] brings back exactly the bonds that were there.

When you change a structure so that an aromatic ring or a delocalised group no longer makes sense (you delete a ring atom, or drag an acetate oxygen onto another atom), the program returns it to a Kekulé structure by itself.

= Editing and arranging <usporadani>

== Redraw

When a molecule looks muddled, perhaps after pasting a SMILES, select it and click #ui[Redraw] #ik("layout"). The program offers several drawings made by different methods, next to your #ui[Current drawing], and you click the one you like. #kl[Ctrl+Z] undoes the choice.

The drawings are ranked. Those without crossing bonds or overlapping atoms, and with even bonds and angles, come first, and only the best few are shown. They are ranked once, when the quick methods are done; drawings from the slower ones (Indigo's clean-up, the 3D views) come a few seconds later and are added after them, so no drawing moves while you look. #ui[Show all drawings] brings in the rest and #ui[Show only the best] hides them again. A note under a drawing warns when bonds cross or atoms overlap in it.

Every drawing is checked: one that would change the molecule, its stereochemistry for example, is never offered. Redraw changes how a molecule looks, never what it is. Each drawing of a whole molecule is lined up with the page, turned by up to 15° so that most of its bonds lie at multiples of 30°, as a molecule pasted as SMILES is (a view of a 3D model keeps the view chosen for it).

#obr("img/rozvrzeni.png", sirka: 80%, popis: [Quinine: your current drawing, and the best of the drawings on offer])

*Drawings from a 3D model.* Some drawings come from a 3D model of the molecule, turned and projected onto the page with wedges for depth. They are offered where they are the right picture: for cages and bridged rings (adamantane, norbornane, tropane), metal complexes, molecules with an expanded octet and S#sub[N]2 transition states. Any other molecule #ui[Turn in 3D] shows in 3D. A large molecule such as taxol can take ten seconds or so, but the page does not freeze while you wait.

Molecules with one central atom with an expanded octet, or with five or more electron pairs round it (PCl#sub[5], SF#sub[6], SF#sub[4], ClF#sub[3], XeF#sub[4], ClO#sub[4]#super[−], SO#sub[4]#super[2−]), get their VSEPR shape, with room for the lone pairs. Sulfate is drawn as in a textbook, with the S=O double bonds in the plane of the page and O#super[−] as a wedge and a hashed wedge. This part is still experimental (@omezeni).

== Turn in 3D <otoceni>

Sometimes a molecule reads best from one particular side. Select one molecule and click the cube #ik("turn3d") next to #ui[Redraw]. The program builds a 3D model, which takes a moment for a large molecule, and shows it just as it will be drawn, with the back paler so that you can see the depth.

#figure(
  grid(columns: (1.15fr, 1.25fr, 1.15fr), column-gutter: 8pt, row-gutter: 5pt, align: center + horizon,
    image("img/otoceni-pred.svg", width: 100%),
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/otoceni-okno.png", width: 100%)),
    image("img/otoceni-po.svg", width: 100%),
    text(8pt, fill: seda)[as pasted], text(8pt, fill: seda)[in the window, turned by hand], text(8pt, fill: seda)[after #ui[Use this view]],
  ),
  caption: [Bornyl salicylate: as pasted, its bridge lies across the ring; turned by hand, the bornane looks as it does in a textbook],
  supplement: [Fig.],
  kind: image,
)

- *Drag* to turn it, or with #kl[Shift] to turn it in the plane of the page.
- The *arrow keys* turn it in small steps, with #kl[Shift] in the plane of the page.
- #ui[Clearest view] goes back to the view the program found best, which is also where it starts.
- #ui[Stick model] (#kl[S]) shows the model itself instead of the drawing, turned the same way: its true bond lengths and angles, with every hydrogen. Groups written as shorthands are drawn out (see below). It has the drawing's colours and highlights of atoms and bonds too. The column beside it sets how it is shown: #ui[Ball and stick], #ui[Sticks] or #ui[Space-filling] (each atom as large as its van der Waals radius); hydrogens #ui[all], #ui[small] (those the model adds small and close to their atoms, so that the skeleton stands out; those you drew stay as they are) or #ui[none] (only those you drew), in turn with #kl[H]; and the back paler or not. Instead of #ui[Use this view] there are #ui[Put on canvas], which puts the model itself beside its molecule (@modely), and #ui[Save picture] (PNG, with SVG beside it). #kl[Esc] closes the window with your drawing as it was.
- #ui[Use this view] puts the drawing on the canvas. #kl[Ctrl+Z] undoes it. The paler back is only a help in this window; on the canvas you get an ordinary drawing.

#figure(
  grid(columns: (1fr, 1fr), column-gutter: 8pt, row-gutter: 5pt, align: center + horizon,
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/tycinkovy-model.png", width: 100%)),
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/tycinkovy-model-male-h.png", width: 100%)),
    text(8pt, fill: seda)[every hydrogen], text(8pt, fill: seda)[#kl[H]: small hydrogens],
  ),
  caption: [The stick model of #emph[N]-acetyl-β-D-glucosamine, turned as in its Haworth projection: every hydrogen, and with #kl[H] the hydrogens small, so that the skeleton shows],
  supplement: [Fig.],
  kind: image,
)

*Groups written as shorthands* (Ph, OMe, NHAc, OBz, also PPh#sub[3] on a metal) are drawn out atom by atom in the stick model, so that the molecule's real shape shows. A group's carbons, hydrogens and bonds have a colour of their own, explained under the model. Oxygen, nitrogen and the other elements keep their usual colours, so you see at once what the group contains: the nitrogen and the carbonyl oxygen of NHAc, both oxygens of a benzoate (OBz). #ui[Draw out groups] (#kl[G]) is on to start with; switched off, it shows each group as one ball with its shorthand, for when the model with every atom is crowded. The window remembers both, #kl[G] and #kl[H], until the tab is closed.

#figure(
  grid(columns: (1fr, 1.3fr, 1.3fr), column-gutter: 8pt, row-gutter: 5pt, align: center + horizon,
    image("img/skupiny-kresba.svg", width: 100%),
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/skupiny-model.png", width: 100%)),
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/skupiny-zkratky.png", width: 100%)),
    text(8pt, fill: seda)[drawn with a shorthand], text(8pt, fill: seda)[the group drawn out], text(8pt, fill: seda)[#kl[G]: the group as its shorthand],
  ),
  caption: [Paracetamol drawn with the shorthand NHAc, and its stick model],
  supplement: [Fig.],
  kind: image,
)

The wedges are chosen so that R/S and E/Z stay as you drew them, and the 3D model itself is checked against your drawing. The model also has the drawing's conformation: a chair (from the templates, or drawn by hand and recognised) gives that chair (an axial OH stays axial, even where the other chair is more stable), cyclohexane in a Newman projection that chair, and a Newman projection of a chain the dihedral drawn, an eclipsed one too. A diene or an enone drawn s-cis (for a Diels–Alder) stays s-cis, though s-trans is more stable. If no such conformation can be found, the window says so and shows another. Sometimes a view cannot be drawn clearly: its wedges would not say the right R/S, or a bond points almost straight at you. The window then says so, and the button becomes #ui[Use it anyway]: turn the molecule a little further, or use the view as it is.

#grid(columns: (1fr, 5.6cm), gutter: 14pt, align: horizon,
  [Complexes work too. The whole complex is optimised by a force field (UFF), so each ligand keeps its proper shape, chelating ligands such as EDTA wrap round the metal and porphyrins stay flat, and where two bonds cross, the one behind is broken. If the program has no 3D model for a molecule, it tells you why.],
  obr("img/otoceni-edta.png", popis: [EDTA round Ca#super[2+], built from a flat drawing]),
)

== 3D models on the canvas <modely>

A molecule's 3D model can stand in the drawing beside it, as a picture that is still a model: in #ui[Turn in 3D], switch to #ui[Stick model] (#kl[S]), turn it as you want it and click #ui[Put on canvas]. The model goes to the right of its molecule, selected; #kl[Ctrl+Z] takes it away again. It has its molecule's colours and highlights, read from the drawing, so a group highlighted in the formula is highlighted in the model too.

#obr("img/model-platno.png", sirka: 100%, popis: [Ibuprofen and its 3D model on the canvas, the model selected and its panel on the right])

With a model selected, the panel on the right shows it another way:

- #ui[Style]: #ui[Ball and stick], #ui[Sticks] or #ui[Space-filling];
- #ui[Hydrogens]: #ui[all], #ui[small] or #ui[none] (only those you drew), and #ui[Labels] #ui[drawn out] or #ui[as balls] for a molecule with shorthands (Ph, OAc);
- #ui[Depth]: #ui[back paler] or #ui[even], and #ui[Size] from ½ to 2 (#ui[1]: a bond as long as in the drawing);
- three sliders turn it, #ui[Left–right], #ui[Back–forward] and #ui[In the page], each from −180° to 180° from where it was when you selected it; #ui[Turn in 3D…] opens the window on the model, where #ui[Apply] keeps the turn and the look.

*When its molecule changes* (an atom, a charge, a bond, a wedge, or the conformation drawn, such as a chair flipped), the model stays as it was built, with a dashed frame round it, and the panel says #ui[Its molecule has changed since: the model is as it was.] #ui[Update] builds it again from the molecule as it is now, seen from the same side as before. Moving the molecule or colouring it doesn't make the model out of date.

A model is part of the drawing like anything else: it is selected, moved, copied (with its molecule, the copy has its own model), grouped, aligned, flipped and turned with the rest, and it is listed in the #ui[Objects] panel (@objekty). It is in pictures and PDFs as you see it. Only olomol's own files (.olom) and links keep it as a model; the other formats leave it out and say so.

== Redrawing only a part <casti>

Often most of a molecule is just as you want it and only one part is a mess: a side chain, or a ring squeezed in. Select only that part, with a box, the lasso or #kl[Shift]+click, and click #ui[Redraw].

The window then opens with a section of its own, #ui[Only the selected part, the rest where it is]. In these drawings nothing outside your selection moves. Depending on the molecule you may see:

- #ui[Selected part redrawn 1] (2, 3…) draws the part anew,
- #ui[Selected part tidied] keeps its shape and cleans it up,
- #ui[Selected part unchanged, reattached] keeps it exactly as drawn and sets it back in place, which helps after you have dragged a part away.

This is also how you get just one part of a molecule in 3D: turn the whole molecule (@otoceni), then clean up the part you want flat. Bornyl salicylate below was made that way. The bornane stays as it was turned, while the salicylate, its ring seen at a slant after the turn, is flat again.

Below, #ui[Whole molecules] offers the usual drawings of the whole thing, should you prefer them. The example #ui[Redrawing a part: the rest stays as drawn] in Help shows the difference on one molecule.

#figure(
  grid(columns: (1.55fr, 1fr), column-gutter: 10pt, align: center + horizon,
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/prekresleni-casti.png", width: 100%)),
    image("img/prekresleni-po.svg", width: 100%),
  ),
  caption: [Bornyl salicylate, turned in 3D (@otoceni), with only its salicylate selected: the window, and the drawing picked. The bornane has not moved],
  supplement: [Fig.],
  kind: image,
)

== Align and grid

#grid(columns: (1fr, 5.2cm), gutter: 14pt,
  [
    Select several molecules, and arrows and texts too if you like, and open #ui[Align]:

    - #ui[Align reaction scheme] makes one row of the selected reaction: equal gaps, horizontal arrows, reagents going with their arrow, and texts under molecules on one line.
    - #ui[Align] lines up the left, right, top or bottom edges, or the middles.
    - #ui[Space evenly] works horizontally or vertically, with equal distances between middles or equal gaps.
    - #ui[Grid] arranges molecules in rows. Enter the number of #ui[Columns] (or leave #ui[auto]) and, if you wish, the #ui[Gap] between cells in bond lengths (1.25 by default), and click #ui[Arrange in a grid]. The grid stays where the selection was.

    Molecules joined by a curved arrow move together. A text on an anchor always goes with its molecule, and free texts align on their own.
  ],
  obr("img/zarovnat.png"),
)

== Flipping and straightening <preklopeni>

- #ik("flipH") and #ik("flipV") in the top bar flip the selection, or with nothing selected the whole drawing. Wedges are swapped, so the molecule stays the same (R stays R).
- *Flip over a bond* #ik("flipBond"): select part of a molecule, click the button, then click a bond. The selected part turns about the bond as an axis; with nothing selected, the smaller side does. The preview washes out what turns and shows in blue where it goes; #kl[Esc] cancels. R/S is kept.
- *Ring flip* #ik("ringFlip") turns a chair into the other chair, axial ⇄ equatorial: choose it under the projections button in the top bar (@fischer), then click the chair (inside its ring or on one of its bonds). Each group stays on its face of the ring (up or down), so an axial group pointing up becomes an equatorial one pointing up, and cis and trans, R/S and D or L are kept: β-D-glucose, all equatorial, becomes the all-axial chair and is still β-D-glucose. Every ring atom stays where it was (left, right, back or front), so the class sees the same carbon go from axial to equatorial; a group such as CH#sub[2]OH or phenyl turns as a whole. The preview shows the other chair in blue. The flip is animated through a boat (one tip drops, then the other rises); #ui[Settings] → #ui[Animations] turns that off. #kl[Shift]+click puts the other chair beside the first, with an equilibrium arrow between them: the picture for a handout. Another click flips the chair back; #kl[Esc] ends.

  A chair from the templates (#ui[Templates] → #ui[Conformations and projections], turned, enlarged, mirrored or with groups added) flips, and so does one drawn by hand if it is recognised (it turns green-teal under the pointer). The flipped chair is drawn in the template's shape. A flat six-membered ring, a hexagon or a Haworth projection, becomes a chair: pointed at, it turns green-teal with the chair see-through over it, and a click draws it. Each group goes axial or equatorial by its face, from its wedge or hashed wedge (a Haworth's group up or down), so the molecule stays the same. It is always the templates' chair, its left tip raised (a sugar ⁴C#sub[1], β-D-glucose all equatorial); the ring flip gives the other one. A group whose side the drawing doesn't say goes equatorial, with a wavy bond where it sits on a stereocentre. A ring with a double bond (a cyclohexene) and fused or bridged rings (decalins, steroids) are refused with a message.

  #obr("img/plochy-kruh.svg", sirka: 100%, ramecek: false, popis: [Menthol drawn as a flat ring with wedges = its chair, every group equatorial; the ring flip gives the other chair, every group axial, and the equilibrium favours the first])

  Cyclohexane in the template's Newman projection (seen along C1–C2 and C5–C4) flips too: both projections stay where they are, C3 and C6 change sides, and each group on the four carbons seen end on goes into the other slot on its face of the ring, axial ⇄ equatorial. Trans-diaxial Br and Cl become diequatorial, and in 3D go from anti to gauche. Groups on C3 or C6 stop the flip.

  #obr("img/preklopeni.png", sirka: 100%, popis: [Ring flip: the other chair under the pointer, see-through in blue; a click draws it])

  #obr("img/newman-preklopeni.svg", sirka: 62%, popis: [Cyclohexane in a Newman projection flipped, with #kl[Shift]+click beside the first: the trans-diaxial Br and Cl are now diequatorial])
- *Turn a chair* #ik("chairTurn") turns a chair a third of the way round its axis, anticlockwise (with #kl[Shift] clockwise): each ring atom moves two corners on with its groups, which stay axial or equatorial, up or down. It is the same molecule in the same conformation, only seen turned; three turns bring it back. When a flat ring becomes a chair with its atoms on other corners than you wanted, turn it until they are where you want them; the ring flip gives the other conformation.
- #ui[Horizontal / vertical] #ik("snap") makes a bond straight. Click the button, then the bond: the selection turns if the bond is in it, otherwise the whole molecule. Another click on the bond turns it a quarter further. With one bond selected, its molecule turns as soon as you press the button.

== Fischer projections and zigzags <fischer>

The projections button in the top bar holds four tools: #ui[Ring flip] #ik("ringFlip"), #ui[Turn a chair] #ik("chairTurn"), #ui[Fischer projection] #ik("fischer") and #ui[Zigzag] #ik("zigzag"). It shows the one used last: a click picks it, and a click on the button again, on its corner or with the right mouse button opens the list.

- *From wedges to a Fischer projection.* Choose #ui[Fischer projection] and click a molecule drawn with wedges: it is drawn as its Fischer projection. The main chain (the IUPAC one, C1 at the top) runs straight down, each stereocentre is a crossing with its horizontal bonds towards you and its vertical ones away, and the groups at the ends are written as CHO, CH#sub[2]OH, CO#sub[2]H, CO#sub[2]Me, CN or CH#sub[3]. A stereocentre at an end of the main chain is a crossing too: the vertical line goes on through its largest carbon group, as books draw ephedrine with its phenyl on top. While you point at the molecule, its projection shows see-through over it.
- *To a zigzag.* #ui[Zigzag] draws the main chain of the molecule you click, a Fischer projection too, as a zigzag: C1 on the left, each group pointing out from its corner, with the wedges that keep each R/S.
- *A Fischer projection drawn by hand.* Draw the chain straight down with the bond tool, each stereocentre a carbon with four single bonds: one to the left, one to the right, one up and one down (each within 15°). As drawn, it is only a drawing: olomol reads no stereochemistry into crossings by their shape. Click the chain with #ui[Fischer projection], and it is read as a Fischer projection, horizontal bonds towards you and vertical ones away, so SMILES, InChI, #ui[Info], R/S and files get the stereoisomer it shows. When you point at it, its spine lights up green, paler while a click would read it. Click it again and it is plain lines again, with no stereochemistry. While it is read, the note above it says so, and the atom you point at lights up blue as anywhere else. A crossing you add straight above or below joins it; one that is no longer a crossing, or a chain turned on its side, stops being read, and the program says so.

Each conversion keeps every stereocentre's R/S and is checked: a result that would be another stereoisomer is not drawn, and the program says why. It also says why when there is nothing it can do: a stereocentre without a wedge, a main chain that is a ring (proline, a sugar in its ring form), a molecule without a stereocentre (glycine), a double bond in the chain or a carbon in it with more than two groups.

#obr("img/fischer-cikcak.svg", sirka: 100%, ramecek: false, popis: [D-glucose drawn with wedges, as its Fischer projection (#ui[Fischer projection]) and as a zigzag again (#ui[Zigzag]): the same stereoisomer each time])

= Atom numbering and the Info card <cislovani>

== IUPAC numbering

#grid(columns: (1fr, 7.4cm), gutter: 14pt,
  [
    Select a molecule and tick #ui[IUPAC numbering] in the panel. The parent chain or ring is numbered by the IUPAC rules (2013 recommendations), and the numbers are worked out again after every change: add Cl to the other end of hexane and C1 moves there. The panel says which rule decided, for example #ui[Numbered so that the alcohol (OH) group gets the lowest number: 2, not 4.]

    The program knows how to choose the parent chain or ring: by the senior principal group (acid > ester > acyl halide > amide > nitrile > aldehyde > ketone > alcohol > thiol > amine), a ring before a chain, then the longest chain with the most multiple bonds and substituents.

    It gives the lowest locants to ring heteroatoms, the principal group, multiple bonds (double before triple) and substituents, and finally goes by alphabetical order. Only the parent is numbered, as in a name.
  ],
  obr("img/cislovani.png"),
)

== Your own numbers

Fused, bridged and spiro rings (naphthalene, steroids) have numberings of their own that the program does not work out. For them, and for assigning NMR signals, use the atom number tool #ik("atomNumber"), a variant of the text tool. Click atoms in the order you want them numbered; clicking again removes a number.

To change one atom's number, use the panel's #ui[Number] field. #ui[Remove own numbers] deletes them all. Numbers are kept in olomol's files, links and pictures.

== The Info card <info>

#grid(columns: (1fr, 6.6cm), gutter: 14pt,
  [
    Select a molecule and click #ui[Info] next to the formula in the panel. A card opens beside the panel with the numbers a lab report or experimental section needs:

    - #ui[Molar mass] and #ui[Exact mass],
    - ions for HRMS: \[M+H\]#super[+], \[M+Na\]#super[+] and \[M−H\]#super[−] (for an ion, \[M\]#super[+]),
    - #ui[Anal. calcd] for C, H, N and S,
    - SMILES, InChI and InChIKey.

    *Click a row to copy it.* You get only the formula, ion and number, with no words, so it fits a report in any language: for example `C9H8O4 [M+H]+ 181.0495` or `C9H8O4: C 60.00, H 4.48`. Then paste it into your text.

    Everything on the card is computed on your computer. The card closes when you select another molecule or click the empty canvas.
  ],
  obr("img/info.png"),
)

== Finding a compound on PubChem <pubchem>

#ui[PubChem page] on the Info card opens the compound's page on PubChem. It is the only thing on the card that sends anything out: the molecule's InChIKey, by which PubChem finds the compound, and its SMILES too if PubChem has no exact match.

What you draw is not always exactly what PubChem has. You may have left a stereocentre undefined, or drawn an isotope. Then, instead of guessing, olomol shows a page of cards with PubChem's picture, name and number for each candidate. Click a card to go to that compound. The heading says how they differ:

- #ui[Your drawing leaves stereochemistry open]: PubChem has it just as you drew it (the first card, marked #ui[as drawn]), and the others define more of it, in agreement with what you drew. One of those is often what you meant.
- #ui[Not with exactly this stereochemistry]: nothing matches exactly, but these agree with the stereocentres you did draw.
- #ui[This stereoisomer isn't on PubChem]: these have the same atoms and bonds, with other stereochemistry.
- #ui[Not with exactly these isotopes]: these have the same atoms and bonds, with other isotopes or none.

#obr("img/pubchem-karty.png", sirka: 72%, popis: [Alanine drawn without stereochemistry: PubChem has DL-alanine, and also L- and D-alanine])

If PubChem has nothing at all, the page says so and offers #ui[Search PubChem].

= Colours and highlighting <barvy>

== Colour

*Colour* changes lines and letters. Select atoms, bonds, arrows or text and click a colour under #ui[Colour] in the panel; the crossed-out circle is #ui[Default colour]. Or use the tool #ik("barva") at the bottom left, with ten colours among its variants, and click or box what you want to colour.

The rainbow circle after the colours (#ui[More colours, or a colour code]) opens a larger choice: a row #ui[Used last], a grid #ui[Colours] and a field for a colour code (`#cc0055`, `#c05`, `rgb(204, 0, 85)` or a name like `teal`; #kl[Enter] uses it). The circle next to the field opens the system's colour picker. The program remembers the colours you use and offers them among the tool's and panel's colours too.

When #ui[Atom colours] in #ui[Settings] is set to #ui[Black], the elements are drawn in black but your own colours stay, so red arrows on black structures stay red.

== Highlighting and filled rings

#grid(columns: (1fr, 6.8cm), gutter: 14pt,
  [
    *Highlighting* is a soft coloured background behind atoms and bonds, as RDKit draws it. It marks a group, a reaction centre or the common part of several molecules.

    Use the highlighter #ik("zvyraznovac") at the very bottom left, with eight colours. Click atoms and bonds or box them; a second click takes the highlight off. The panel does the same under #ui[Highlight], and here too the rainbow circle offers more light colours. Below the colours, #ui[Pattern] makes a highlight #ui[hatched], #ui[lines] or #ui[dots], each in its own colour, so that highlights are told apart without colour too: in black and white, or by colour-blind readers.

    *A click inside a ring fills it* with colour. Round written atoms (O, N, CH#sub[2]) a round cut-out remains, so the colour does not cover the letters.

    With the select tool #ik("select"), a click into a filled ring selects the ring, a double click the whole molecule, and dragging moves it. A smaller highlight always lies over a larger one (the orange difference over the blue common part).
  ],
  obr("img/zvyrazneni.png", popis: [A filled ring, a highlighted ester and the acid in red]),
)

A fill goes when you break the ring by deleting a ring atom or bond. Otherwise you can remove it with the highlighter's #ui[No highlight] variant (click inside the ring), with the eraser (click inside the ring), or with #ui[No highlight] in the panel when all the ring's atoms are selected.

== Example: what molecules have in common

#obr("img/katecholaminy.svg", sirka: 72%, ramecek: false, popis: [Catecholamines and related drugs: the common part in blue, salbutamol's main difference in orange, the groups on nitrogen in purple])

L-DOPA, dopamine, noradrenaline and adrenaline are made in the body one from another; isoprenaline and salbutamol are drugs. The common part, a phenol with a C–C–N chain, is *highlighted in blue* and turned the same way in every molecule. Salbutamol, an asthma drug, has its main difference *highlighted in orange*: CH#sub[2]OH in place of one OH, so the enzyme COMT does not break it down and it acts for hours, not minutes. The groups on nitrogen are *painted purple* with the paint tool: the bigger the group, the more the compound acts on β-receptors.

To make a picture like this:

+ Draw the first molecule, copy it (#kl[Ctrl+C], #kl[Ctrl+V]) and edit the copy. The common part stays turned the same way everywhere, which molecules pasted from SMILES would not do.
+ Select everything, enter 3 #ui[Columns] in #ui[Align] and click #ui[Arrange in a grid].
+ Select the common part (drag a box, #kl[Shift]+click) and click the blue #ui[Highlight] in the panel. Do the same with orange for the difference.
+ Colour the groups on nitrogen with the #ik("barva") tool or with #ui[Colour] in the panel.

= Files, tabs, export and links <soubory>

The way out of olomol depends on what you want to do next:

#[
#set par(justify: false)
#set text(9pt)
#table(columns: (auto, 1fr), stroke: none, inset: (x: 5pt, y: 2.5pt),
  fill: (_, y) => if calc.odd(y) { akcent-svetly } else { none },
  table.header([*You want to…*], [*Use*]),
  [keep working on a drawing later], [#ui[Save] (#kl[Ctrl+S]): an olomol drawing (.olom), with everything in it],
  [put it into Word, PowerPoint or Google Docs], [#ui[Copy as picture] (#kl[Ctrl+Shift+C]), then #kl[Ctrl+V] there],
  [print it, or make a PDF of it], [#ui[Export] → #ui[PDF / Print…]],
  [go on editing it in Inkscape], [#ui[SVG]],
  [send it to a colleague or students], [#ui[Copy link], or the .olom file],
  [show it in a lecture], [#ui[Show] #ik("present") (@promitani)],
  [open it in Ketcher], [#ui[Structure file]: KET],
  [open it in ChemDraw or another chemistry program], [#ui[Structure file]: Molfile, SDF, SMILES or InChI],
  [start a calculation from it], [#ui[Structure file]: XYZ],
)
]

== Save and open

#ui[Save] #ik("save") (#kl[Ctrl+S]) stores the drawing as an *olomol drawing*, a `.olom` file. It opens here again with everything in it: lone pairs, curved arrows, colours, highlights, numbers, groups and the drawing's style. For your own work it is the best choice. (Its name stands for #strong[O]lomol #strong[L]ayout #strong[O]bject #strong[M]odel; @data-soubory says more.)

As in a word processor, a drawing knows its file. In Chrome and Edge, #kl[Ctrl+S] writes it back into that file without asking (the browser asks once per visit whether olomol may), and #kl[Ctrl+Shift+S] (Save as) asks for a new name and folder. A dot on the save button, and on the drawing's tab, means changes that are not in the file yet. A file another program wrote (KET, CDXML, a molfile) is never written over: #kl[Ctrl+S] then asks where to save the drawing as .olom. If the file has changed since olomol read it (in another program or another tab), olomol asks before writing over it. Firefox and Safari can't write into files, so they download them: the first time under a name you give, then again under that name, into the downloads folder.

#ui[Open] #ik("open") (#kl[Ctrl+O]) reads olomol drawings (.olom), KET, molfile, SDF, SMILES, RXN, CDXML and CDX (ChemDraw), CML and XYZ. A picture exported from olomol (SVG or PNG) carries the drawing inside it, so it opens again as the drawing, not as a picture. Once you have opened files, #ui[Open] first lists the *recent files*, and #ui[Open a file from this computer…] below them. Files can also be dropped onto the window, and the installed app (@instalace) opens .olom files from the file manager.

A drawing (.olom, KET, a reaction, CDXML) opens in a tab of its own (@karty). A file of molecules only (molfile, SDF, SMILES, XYZ) goes into the drawing you have, like a template: click where it should go, or it lands where you dropped it. From ChemDraw, abbreviations (OMe, OTBS, Et) stay labels, the hydrogens written on an atom stay as written, and an attachment point (the squiggle across a bond) becomes an R. A reaction from an RXN file is lined up as #ui[Align reaction scheme] does, its reagents on the arrow. An XYZ file from a quantum chemistry program has no bonds, so the program adds them from the distances between atoms, works out bond orders and stereochemistry, and draws the molecule in 2D.

== Several drawings: tabs <karty>

#obr("img/karty.png", sirka: 60%, popis: [Three drawings open: an exercise and its solution opened from a link, and the drawing there was])

Each drawing opens in a tab of its own, with its own undo, file and view, so an exercise and its solution, or a scheme and the molecules for it, sit side by side. The tabs show under the top bar once there are two drawings; the drawing's name is then on its tab.

- A click on a tab shows that drawing, a double click on the tab in front renames it, and a tab dragged along the others moves among them.
- The #ik("close") on a tab, or a middle click, closes the drawing; if it has changes that are not in a file, olomol asks first. + at the end of the tabs (or #ik("newDoc")) starts a new drawing.
- A right click on a tab offers #ui[Duplicate drawing] (a copy in a new tab, say of an exercise for its solution), #ui[Rename] and #ui[Close].
- In the installed app, #kl[Ctrl+Tab] and #kl[Ctrl+Shift+Tab] go to the next and the previous drawing (a browser keeps these keys for its own tabs).

All open drawings are autosaved and come back the next time you open olomol (@ulozeni). The example #ui[An exercise and its solution: tabs and Show] in Help shows it all on one exercise.

== Show: drawings full screen <promitani>

#ui[Show] #ik("present"), the last button of the top bar, puts the open drawings on the whole screen, without bars and panels, each fitted to the screen: the thing for a lecture or a seminar. #kl[→], #kl[↓], #kl[Space] or #kl[Page Down] (what a presentation clicker sends) shows the next drawing, #kl[←], #kl[↑] or #kl[Page Up] the one before, #kl[Home] and #kl[End] the first and the last. While the mouse moves, a small bar at the bottom shows the drawing's number and name with back and next. #kl[Esc] returns to drawing, every drawing as it was. Nothing can be changed meanwhile; the wheel still zooms.

Put each step in a tab of its own, an exercise first and its solution after it, and Show goes through them in order.

== Exporting pictures and files

#grid(columns: (1fr, 3.4cm), gutter: 12pt,
  [
    The #ui[Export] menu in the top bar offers:

    - #ui[SVG] (#ui[vector, for Inkscape]): a clean vector picture in which text stays text. It is the best choice for print, posters and further editing.
    - #ui[PNG] (#ui[4× resolution]): a raster picture with a transparent background, or a white one if you tick #ui[White background]. It says its own size, so Word and PowerPoint place it as large as the drawing's style gives.
    - #ui[Copy as picture] (#kl[Ctrl+Shift+C]): a PNG on the clipboard, and an SVG beside it for programs that take one; transparent or with #ui[White background].
    - #ui[PDF / Print…]: the drawing alone on a page, at the size of its style and smaller only if it doesn't fit, landscape if it is wide. In the browser's print window choose #ui[Save as PDF] for a vector PDF, or a printer.
    - #ui[Copy link]: see @odkazy.
    - #ui[Structure file]: KET (for Ketcher), Molfile, SDF, SMILES, InChI and XYZ (3D coordinates). Beside a format, the menu says what of the drawing it can't hold (#ui[without curved arrows, colours…]).

    With something selected, #ui[Only the selection] is ticked and only the selection is exported. Untick it to export the whole drawing.

    SVG and PNG pictures from olomol carry the drawing inside them, unseen, so #ui[Open] or dropping the picture on the window brings back the drawing itself. A program that edits the picture may drop it, and a picture copied to the clipboard has none.

    Structure files carry atoms, positions, charges, isotopes, radicals and wedges in standard formats. Reading them back has been tested in olomol, RDKit and Indigo, not in other programs. *Lone pairs, curved arrows, brackets, partial bonds and colours are kept only in olomol's own files, links and pictures.* KET keeps the most of them for Ketcher: abbreviations as its groups, and Haworth and Fischer projections with their stereochemistry as wedges.

    An *XYZ* file holds 3D coordinates with all hydrogens. It is a starting geometry for calculations (Gaussian, ORCA and the like), optimised by a force field only, not by quantum chemistry. A metal complex is built as in #ui[Turn in 3D], optimised as a whole by the universal force field (UFF) on its coordination polyhedron; UFF makes metal–ligand bonds somewhat shorter than they are (Zn–N in ZnTPP 1.95 Å instead of 2.04 Å). A complex #ui[Turn in 3D] can't build (ferrocene) isn't written, and the program says why. The coordinates are worked out in the background: a panel shows that it is working while you keep drawing, and #ui[Save XYZ file] saves them when they are ready, for the drawing as it was when you asked. The suggested file name is the molecule's InChIKey, so several structures from one drawing don't overwrite each other. Check the warning about stereocentres with no R/S drawn: the file then holds just one of the possible stereoisomers.
  ],
  obr("img/export.png"),
)

== Into Word, PowerPoint and Google Docs

Select what you want to take over, or nothing for the whole drawing. Press #kl[Ctrl+Shift+C], or choose #ui[Export] → #ui[Copy as picture], and then #kl[Ctrl+V] in Word, PowerPoint or Google Docs.

SVG is the sharpest in print: Word and PowerPoint insert it (Insert → Pictures) and it does not blur when enlarged. For a journal, choose its style first (#ui[Settings] → #ui[Style]: #ui[ACS], #ui[RSC] or your own, @nastaveni), and pictures come out at the size it asks for.

== Links <odkazy>

#ui[Export] → #ui[Copy link] makes a link that *holds the whole drawing*, after the \# sign, which the browser does not send to the server. Whoever opens it sees your drawing, and their own comes back with #kl[Ctrl+Z]. Some chat programs cut long links short; if that happens, send the .olom file.

*A link with a structure.* A link can also say which structure to draw, written by hand, in a worksheet or by a chatbot: `olomol.org/#smiles=CCO` draws ethanol, `#name=caffeine` looks the name up in PubChem, and `#inchi=…` and `#cid=2244` work too. `&title=…` names the drawing, and several structures open each in a tab of its own, in order: `#title=Exercise&smiles=C=CC.Br&title=Solution&smiles=CC(Br)C` is an exercise with its solution behind it, ready for #ui[Show]. A reaction SMILES (reactants`>`reagents`>`products) is drawn as a reaction. The installed app has no address bar: paste such a link into the search bar (@nazev). Chatbots learn how to write these links from `olomol.org/llms.txt`.

== olomol in your own page <vlozeni>

olomol can be put into a web page of your own, a course page, a blog or a practice site, with only the tools you choose: `olomol.org/embed.html?only=curved-arrows#smiles=CC(=O)O.OCC` is an editor with only curved arrows, on acetic acid and ethanol. The address names the parts switched on (`only=`) or off (`off=`), the drawing after the \# as in a link, and `readonly` for a drawing only to look at. Whatever is switched off is refused, however it is asked for. Such an editor has no tabs, files, help or settings, and keeps nothing in the browser.

#ui[Export] → #ui[Embed in a page…] writes this for you in three steps. First what the editor can do: #ui[Curved arrows], #ui[Drawing structures], #ui[Everything] or #ui[Only to look at], or the parts one by one in their groups (pointed at, each says what it is); PubChem, under #ui[Outside olomol], is a choice of its own, because what is typed into it goes there. Then what it starts with: #ui[This drawing], #ui[The selection] or #ui[Empty], and the height. Last, copy the code. #ui[Without code] gives an iframe, which goes into any page that takes HTML, a Moodle page too: anyone can draw in it, but the page can't see what was drawn, so it suits a figure to turn and zoom, or practice whose answer is shown elsewhere. #ui[Try it] shows the editor right there, as the code puts it into a page, at its height and with its tools, and follows whatever you change.

#obr("img/vlozeni.png", sirka: 80%, popis: [The address above in a page: only Select, Erase and the curved arrow, and an arrow drawn])

For a page that reads what was drawn, `olomol.org/embed.js` gives an element, `<olomol-editor>`, and calls that return the drawing as data: the curved arrows by the atoms they start and end at, SMILES, InChI, a step written the same way however it is drawn (to compare an answer with the right one), which atoms were clicked. olomol hands over the data; whether an answer is right is the page's to decide. Everything is described in appendix B of the manual on the web, `olomol.org/manual.html#embedding`.

= Settings and keyboard shortcuts <nastaveni>

== The look of the drawing, language and window

#grid(columns: (1fr, 3.2cm, 3.2cm), column-gutter: 12pt, align: horizon,
  [The look changes most with how *charges*, *lone pairs* and *atom colours* are drawn. On the right is the same glycine in the default look, and with circled charges, lone pairs as bars (Lewis) and black atoms. The style, the charges and the lone pairs belong to the drawing and are kept in its file; the other settings apply to all drawings. All of them show in exported pictures.],
  figure(image("img/styl-vychozi.svg", width: 100%), caption: text(8pt)[default], supplement: none, numbering: none),
  figure(image("img/styl-lewis.svg", width: 100%), caption: text(8pt)[#text(font: "Noto Sans Math")[⊕ ⊖], bars, black], supplement: none, numbering: none),
)

#grid(columns: (1fr, 5.2cm), gutter: 14pt,
  [
    #ui[Settings] (#ik("settings") at the top right):

    *Drawing*
    - #ui[Style] of this drawing: #ui[Screen], #ui[ACS] (ChemDraw's ACS Document 1996: bonds 14.4 pt, lines 0.6 pt, Arial 10 pt), #ui[RSC] (12.2 pt, 0.5 pt, Arial 7 pt), #ui[Slides] (thicker, for a projector) or #ui[Custom…] (below). Pictures and PDFs come out at the style's size.
      - #ui[Charges]: #ui("+ −"), or circled #text(font: "Noto Sans Math")[⊕ ⊖].
      - #ui[Lone pairs]: #ui[Dots ··], or #ui[Bars (Lewis)].
      - #ui[Use for new drawings] (shown when this drawing's style differs): new drawings, and files that say no style, start in it.
    - #ui[Atom colours]: #ui[By element], or #ui[Black] (your own colours stay).
    - #ui[Carbons]: CH#sub[3], #ui[Plain line], or #ui[All C] for new drawings.
    - #ui[Aromatic]: #ui[Circle], or #ui[Dashed] (the circle dashed).
    - #ui[Coordination]: #ui[→] (an arrow from the donor), or #ui[Line] (plain lines, as complexes are often drawn); with depth they are wedges either way.
    - #ui[Links]: #ui[hidden], or #ui[shown] (the invisible links of #ui[One compound], on screen only).
    - #ui[New arrows]: the colour of new curved arrows.

    *Window*
    - #ui[Language]: flag buttons EN, CS, DE. Without a choice the browser's language is used, or English if the program does not have it. The page reloads, and the drawing with its zoom and position stays. Templates can be searched in English or Czech; PubChem knows English names only. The end of the address, `?lang=en`, `?lang=cs` or `?lang=de`, chooses the language too.
    - #ui[Theme]: #ui[Auto] (as the system), #ui[Light], or #ui[Dark].
    - #ui[Animations]: #ui[On] or #ui[Off], short animations such as the ring flip. Until you choose, they follow the system: off when it asks for less motion.
    - #ui[Debug]: debug mode shows how the program decided (layout methods, label boxes, arrow candidates). It is meant for developers, but when you report a drawing problem, a screenshot with it on can help.
  ],
  obr("img/nastaveni.png"),
)

#grid(columns: (1fr, 8.4cm), gutter: 14pt, align: horizon,
  [*A style of your own.* #ui[Custom…] opens the #ui[Drawing style] window for the sizes a journal or your group asks for, in points: #ui[Bond length], #ui[Lines], #ui[Bold bonds, wedges], #ui[Hash spacing], #ui[Margin round labels], #ui[Labels and texts] and the #ui[Font], sans (Arial) or serif (Times). #ui[Start from] fills in ACS 1996 or RSC to change from. A molecule beside them is drawn at true size as you type; #ui[Use] gives the drawing that style. The example #ui[A journal's look: ACS, RSC or a style of your own] in Help shows one drawing in each.],
  obr("img/styl-vlastni.png"),
)

== Keyboard shortcuts <klavesy>

The #kl[?] key or #ui[Keyboard shortcuts] in Help (@pomoc) shows them too. Letters and digits do different things depending on what is under the pointer: an atom, a bond, or empty space.

#let tabulka(nadpis, radky) = block(below: 1em, breakable: false)[
  #text(weight: "bold", fill: akcent, nadpis)
  #v(-0.3em)
  #set par(justify: false)
  #table(columns: (auto, 1fr), stroke: none, inset: (x: 4pt, y: 3pt),
    ..radky.flatten())
]

#grid(columns: (1fr, 1fr), column-gutter: 16pt,
  [
    #tabulka([Over an atom], (
      (kl[C N O S P F H I], [changes the element]),
      ([#kl[L] #kl[B]], [Cl, Br]),
      ([#kl[+] #kl[−]], [charge]),
      (kl[.], [unpaired electron (again: two side by side, then none)]),
      (kl[:], [lone pairs on/off]),
      (kl[Del], [deletes it]),
    ))
    #tabulka([Over a bond], (
      ([#kl[1] #kl[2] #kl[3]], [single, double, triple]),
      ([#kl[1] again], [wedge, hashed wedge, both from the other end, plain]),
      (kl[Shift+1], [the same, backwards]),
      (kl[D], [dative bond, again hydrogen bond, again partial bond]),
      (kl[Del], [deletes the bond]),
    ))
    #tabulka([With a selection (pointer over it or over empty space)], (
      ([#kl[+] #kl[−]], [the charge of every selected atom]),
      ([#kl[1] #kl[2] #kl[3]], [every selected bond single, double, triple]),
      (kl[:], [the selected atoms' lone pairs on/off]),
    ))
    #tabulka([In Turn in 3D], (
      ([Arrow keys], [turn it (Shift: in the plane of the page)]),
      (kl[S], [stick model, and back]),
      (kl[G], [in the stick model: draw out groups]),
      (kl[H], [in the stick model: small hydrogens]),
      (kl[Enter], [#ui[Use this view]]),
      (kl[Esc], [close the window]),
    ))
    #tabulka([Writing text], (
      ([#kl[Enter] #kl[Esc]], [finish]),
      (kl[Shift+Enter], [new line]),
      ([#kl[Ctrl+,] #kl[Ctrl+.]], [subscript, superscript]),
      ([#kl[Ctrl+B] #kl[Ctrl+I]], [bold, italic]),
    ))
  ],
  [
    #tabulka([Tools (pointer over empty space)], (
      (kl[V], [#ik("select") select]), (kl[E], [#ik("erase") eraser]),
      (kl[N], [draw with nitrogen (likewise O, S, P, F, H, I, L = Cl, B = Br; C: carbon again)]),
      (kl[1], [#ik("single") single bond (again: wedge, again: hashed wedge)]),
      (kl[2], [#ik("double") double bond]), (kl[3], [#ik("triple") triple bond]),
      (kl[Z], [#ik("chain") chain (zigzag)]),
      (kl[R], [#ik("benzene") benzene (again: the next ring, 3- to 8-membered)]), (kl[5], [5-membered ring]), (kl[6], [6-membered ring]),
      (kl[+], [#ik("plusCharge") positive charge]), (kl[−], [#ik("minusCharge") negative charge]),
      (kl[.], [#ik("radical") unpaired electron]), (kl[:], [#ik("pairs") lone pairs]),
      (kl[A], [#ik("curve") curved arrow (electron pair)]),
      (kl[Shift+A], [#ik("fishhook") fishhook (one electron)]),
      (kl[Shift+T], [#ui[Templates]]),
      (kl[X], [#ik("rxn") reaction arrow]), (kl[T], [#ik("text") text]), (kl[K], [#ik("bracket") brackets]),
      (kl[D], [#ik("dative") dative bond, again hydrogen bond, again partial bond]),
    ))
    #tip(nadpis: "Other keyboard layouts")[Digits work by the key's position, in the top row of e.g. a Czech keyboard too. #kl[+] over an atom raises its charge there as well; choose the positive charge tool with #kl[+] on the number pad.]
  ],
)
#tabulka([Anywhere], (
  (kl[Esc], [cancel; again: the Select tool; again: nothing selected; again: box or lasso]),
  ([#kl[Ctrl+Z] #kl[Ctrl+Shift+Z] #kl[Ctrl+Y]], [undo, redo]),
  ([#kl[Ctrl+C] #kl[Ctrl+X] #kl[Ctrl+V]], [copy, cut, paste (SMILES and molfile too)]),
  (kl[Ctrl+Shift+C], [copy as picture (PNG), for Word, PowerPoint, Docs]),
  (kl[Ctrl+A], [select all]),
  ([#kl[Ctrl+G] #kl[Ctrl+Shift+G]], [group the selection, take a group apart (one level)]),
  ([#kl[Ctrl]+click], [a group (again: the group round it); #kl[Ctrl]+drag moves it, #kl[Ctrl]+drag of a box takes whole groups]),
  (kl[Del], [delete the selection]),
  ([Arrow keys], [move the selection (Shift: further)]),
  ([#kl[Ctrl+S] #kl[Ctrl+O]], [save, open]),
  (kl[Ctrl+Shift+S], [save as another file]),
  ([#kl[Ctrl+Tab] #kl[Ctrl+Shift+Tab]], [the next drawing, the one before (in the installed app)]),
  ([#kl[Ctrl]+wheel], [zoom]),
  ([space+drag], [move the canvas]),
  (kl[/], [the search bar: a name, SMILES, InChI or what you want to do]),
  (kl[?], [this overview]),
))
#tabulka([In Show], (
  ([#kl[→] #kl[↓] #kl[Space] #kl[Page Down]], [the next drawing]),
  ([#kl[←] #kl[↑] #kl[Page Up]], [the one before]),
  ([#kl[Home] #kl[End]], [the first, the last]),
  (kl[Esc], [back to drawing]),
))

= Installing, limitations and reporting problems

== Installing as an app and working offline <instalace>

#grid(columns: (1fr, 3.8cm), gutter: 14pt,
  [
    After the first visit olomol works *without the internet* too, because the browser keeps all its files. Offline, only the PubChem look-ups do not work.

    *Installed as an app*, it has its own window and an icon on the desktop or in the Start menu, and it opens at once:

    - *Chrome and Edge:* use the #ik("install") button at the top right (the first icon in the picture) or the install icon in the address bar.
    - *Firefox on Linux* cannot install it as an app, but the program works normally in a browser window there, offline too.
  ],
  [
    #styl.obr("img/instalace.png")
  ],
)

== Known limitations <omezeni>

olomol is a testing version. This is what it cannot do yet, or can do only in part:

- *Firefox on Linux* cannot install the program as an app. Use Chrome or Edge, or work in a browser window.
- *Drawings of metal complexes and molecules with an expanded octet* made from a 3D model in #ui[Redraw] are experimental: they sometimes look odd or are not offered at all. The XYZ export is only a starting geometry, optimised by a force field.
- *A name from a structure* is something the program cannot make. The other way round, a structure from a name goes through PubChem, so it needs the internet and English names.
- *IUPAC numbering* handles the parent chain and simple rings. Fused, bridged and spiro rings must be numbered by hand with the atom number tool #ik("atomNumber").
- *Lone pairs, curved arrows, brackets, special bonds and colours* are carried only by olomol's own files (.olom), links and pictures, and mostly by KET, not by molfile or SMILES.
- *3D models on the canvas* are kept as models only in .olom files and links; other formats leave them out (pictures and PDFs show them).
- *Chairs* give stereochemistry only on their own, not fused or bridged; boats give none. #ui[Ring flip] and #ui[Turn a chair] refuse fused and bridged rings and rings with a double bond.
- *Copying pictures to the clipboard* is not allowed by some browsers. The program tells you so; export a PNG instead.
- *The drawings in the browser* live only in this browser on this computer and do not sync between computers. To carry them over, use .olom files or links.
- *Saving back into a file* (#kl[Ctrl+S] without asking) works in Chrome and Edge. Firefox and Safari download the file instead (@soubory).

== Problems and ideas <problemy>

Every message is welcome, even about a small thing. Click the bug #ik("debug") at the top right (or #ui[Report a problem] in Help). A window opens with a table of what helps to find a fault: the program's version, the browser, the system, the window size and, if you leave #ui[With the drawing (a link that holds it whole, so I can see what you saw)] ticked, a link to the drawing.

#obr("img/nahlaseni.png", sirka: 72%, popis: [The window for reporting a problem])

+ Click #ui[Write the e-mail]. A new e-mail to bugs\@olomol.org opens with a few questions that are enough to answer: what you did (briefly is fine), what happened and what you expected. The table is already in it.
+ A link to a drawing is too long for an e-mail, so with the drawing, click #ui[Copy the table] and paste the table (#kl[Ctrl+V]) at the end of the e-mail.
+ A screenshot or the drawing's .olom file helps too.

Ideas and questions go to contact\@olomol.org (the window names it too). Nothing is sent from here: you see the e-mail and send it yourself. If no e-mail opens after the click (you use webmail only, say), write to the address by hand and paste the table all the same. The program's version is also at the bottom left.

#show: prilohy

= How olomol is built <stavba>

This appendix is for those who want to know what is under the bonnet: computing teachers, school network administrators, developers and curious chemists. You do not need it to use the program.

== The big picture

olomol is a *static web page*: HTML, JavaScript and WebAssembly, nothing more. It needs no application server, database or accounts. Any web space with https (a school server, GitHub Pages) is enough, and everything else runs in the user's browser. Its own code is about 33,000 lines of JavaScript.

#let vrstva(nazev, popis, barva, sloupce: 1) = grid.cell(colspan: sloupce, fill: barva, inset: (x: 8pt, y: 6pt), {
  text(9pt, weight: "bold", nazev)
  linebreak()
  text(8pt, fill: rgb("#3a3f4b"), popis)
})

#figure(
  {
    set par(justify: false, leading: 0.5em)
    grid(columns: (1fr, 1fr, 1fr), gutter: 4pt, align: left + top,
      vrstva([Screen · `src/ui`], [bars, tabs, panel, menus, dialogs, the search bar, the Info card (React 19)], akcent.lighten(70%), sloupce: 3),
      vrstva([Editor · `src/editor`], [tools, selection, undo and redo, view, mouse and keys], akcent.lighten(78%)),
      vrstva([Arranging · `src/arrange`], [align, space evenly, grid, reaction scheme], akcent.lighten(78%)),
      vrstva([Layout · `src/layout`], [layout methods, ring templates, checking, 3D], akcent.lighten(78%)),
      vrstva([Drawing · `src/model`], [atoms, bonds, reaction and curved arrows, texts, brackets, fills: plain data, the copy for undo is `structuredClone`], akcent-2.lighten(82%), sloupce: 3),
      vrstva([Chemistry · `src/chem`], [hydrogens and lone pairs, formula and masses, R/S, IUPAC numbering, templates], akcent.lighten(86%)),
      vrstva([Rendering · `src/render`], [the scene: labels, bonds, electrons, arrow rules; canvas and SVG], akcent.lighten(86%)),
      vrstva([Files · `src/io`], [.olom, KET, molfile, conversions, links, PubChem], akcent.lighten(86%)),
      vrstva([RDKit.js, megane-rdkit], [SMILES, InChI, layout, CIP (R/S, E/Z), canonical SMILES; 3D structures (ETKDG, MMFF94s)], rgb("#e8f4ec")),
      vrstva([Indigo (own thread)], [RXN, CDXML, CDX, SDF, CML, Ketcher's layout], rgb("#e8f4ec")),
      vrstva([OpenChemLib], [3D structures where RDKit makes none, the MMFF94s+ force field], rgb("#e8f4ec")),
      vrstva([Browser], [IndexedDB (drawings, earlier versions, recent files) · localStorage (settings) · service worker (offline) · clipboard], rgb("#eef0f4"), sloupce: 3),
    )
  },
  caption: [The program's layers. The top three rows are its own code (folders in `src/`); the green row are WebAssembly libraries, downloaded only when first needed.],
  supplement: [Fig.],
  kind: image,
)

== What each part does

#table(columns: (auto, 1fr), stroke: none, inset: (x: 5pt, y: 4pt),
  fill: (_, y) => if calc.odd(y) { akcent-svetly } else { none },
  table.header([*Folder*], [*What is in it*]),
  [`src/model`], [The drawing as data. Coordinates are in bond lengths, the y axis points down as on screen. `graph.js`: molecules (connected parts), smallest rings.],
  [`src/chem`], [Chemistry computed by its own code: hydrogens and lone pairs (`valence.js`), formula and masses, R/S labels, IUPAC numbering (`numbering.js`), templates, chairs and projections, delocalised groups (COO#super[−], NO#sub[2]).],
  [`src/render`], [After every change the *scene* is computed once: where labels go, how bonds look, where lone pairs sit and which way curved arrows run. The canvas, the SVG export and finding what is under the pointer all use it. The pictures in this manual are exports of that same scene.],
  [`src/editor`], [The editor and tools: selection, dragging, bonds, rings, templates, history (200 steps), keys.],
  [`src/arrange`, `src/layout`], [Aligning and new layouts: several methods (RDKit, CoordGen, Indigo, RDKit's ring system templates, 3D from RDKit or OpenChemLib, metal complexes by UFF), each drawing of a whole molecule turned onto the 30° grid.],
  [`src/io`], [Files: olomol's own .olom and KET (reading and writing), molfile V2000/V3000, conversions through RDKit and Indigo, XYZ, the drawing inside pictures, links, PubChem, printing.],
  [`src/ui`], [The screen in React: bars, tabs, panel, menus, dialogs, the search bar, Show, the Info card.],
  [`src/i18n`], [Languages. The key is the English text, `cs.js` and `de.js` are translation tables; a test reports missing texts.],
)

== Rules that are not from the libraries

- *Lone pairs* are counted as valence electrons − charge − bonds − hydrogens − unpaired electrons. Tests check that the counts match RDKit's.
- *Curved arrows* are not drawn by hand: for each arrow the program makes hundreds of candidate Bézier curves and gives each a "cost". It pays for crossing a label, bond, lone pair, ring interior or another arrow, for a bend that does not suit the arrow's length (short ones bend more, long ones less), for a lopsided arc and, for a new bond, for a head that does not come from the electrons' side. The cheapest wins; #ui[Other way] picks the next one that looks different. Debug mode (#ui[Settings] → #ui[Debug]) shows the candidates with their cost.
- *A new layout* never changes the molecule: each drawing is turned into a canonical SMILES with stereochemistry and compared with the original. Any that differs is dropped.
- *IUPAC numbering* follows the IUPAC 2013 recommendations (parent chain or ring, lowest locants, alphabetical order) and stores the reason with the numbers, which the panel shows.
- *Flipping* swaps wedges and hashed wedges, so the mirror image stays the same molecule; tests check that too.

== Data and files <data-soubory>

- *Its own format* is .olom, #strong[O]lomol #strong[L]ayout #strong[O]bject #strong[M]odel: the drawing as olomol holds it, in JSON (UTF-8), so any program, script or language model can read and write it. Coordinates are in bond lengths, references between objects go by id, defaults are left out. The format makes promises: every olomol opens every earlier .olom; a new minor version (1.0 → 1.1) only adds; what a reader doesn't know (a newer olomol's field, another program's `program:key`) it keeps and writes back unchanged. The full description is appendix C of the manual on the web, `olomol.org/manual.html#olom` (and `docs/olom.md` in the source code).
- *KET*, the JSON of Ketcher, is written for Ketcher and Indigo (abbreviations as Ketcher's groups, projections as wedges) and read, as were olomol's own files before 0.5.0.
- *Saving as you go:* each open drawing, its earlier versions and the recent files are in the browser's IndexedDB; the settings in `localStorage`.
- *A link to a drawing:* the .olom, compressed (`deflate-raw`) and written in base64url after `#d=`. The browser does not send the part of an address after \# to the server, so a drawing in a link never passes through the server olomol is on.
- *The drawing inside a picture:* an SVG carries the .olom in a `<metadata>` element, a PNG in a text chunk (`olomol-ket`), both in base64; nothing of it shows.

== What leaves the computer

#table(columns: (auto, 1fr), stroke: none, inset: (x: 5pt, y: 4pt),
  fill: (_, y) => if calc.odd(y) { akcent-svetly } else { none },
  table.header([*When*], [*What, and where to*]),
  [Looking up a name or CID], [only the typed text, to PubChem PUG REST (`pubchem.ncbi.nlm.nih.gov`)],
  [#ui[PubChem page]], [the molecule's InChIKey (or the typed SMILES or InChI), to PubChem; if PubChem has no exact match, its SMILES too],
  [Loading the page], [an ordinary request to the server olomol is on; libraries, fonts and icons are part of the page, nothing is fetched from elsewhere],
  [Anything else], [nothing: no analytics, no cookies, no accounts],
)

== Offline and installing

The build (`npm run build`) makes a *service worker* (`scripts/pwa.mjs`) that stores all the page's files in the browser's cache on the first visit. The page itself (`index.html`) comes from the network when it can, so a new version shows at the next load; the other files have a fingerprint of their content in their names and can therefore come from the cache. A manifest and icons make the site an installable app (PWA).

== Development and tests

The program is developed in Node.js 24 with Vite:

#table(columns: (auto, 1fr), stroke: none, inset: (x: 5pt, y: 3pt),
  [`npm run dev`], [the development server at `http://localhost:5173/`],
  [`npm test`], [unit tests: chemistry against RDKit, reading and writing files, complete translations],
  [`npm run check`], [the browser check (Chrome through Playwright): drawing, arrows, files, keys; in topics (`scripts/check/`), `--only drawing` runs one, `--jobs 3` three at a time],
  [`npm run build`], [builds the static site into `dist/`],
  [`node scripts/manual-shots.mjs`], [the pictures of this manual from the running program (`--en`: in English); typeset with Typst],
)

The examples in the manual are real drawings of the program, not redrawn pictures. The script builds them from SMILES and checks every molecule through RDKit before saving, stereochemistry included.

== Licence and credits

olomol is free to use under the MIT License: it may be used, shared and changed, also in other programs, as long as the copyright and licence notice stays with it. The program uses *RDKit* (BSD-3-Clause, including the ring system templates © Schrödinger and its universal force field, UFF, ported to JavaScript), *Indigo* by EPAM Systems (Apache 2.0), *megane-rdkit* (BSD-3-Clause; RDKit's 3D structures as WebAssembly), *OpenChemLib* (BSD-3-Clause) and *React* (MIT). KET is the format of *Ketcher* (EPAM Systems, Apache 2.0); no Ketcher code is in the program. Compound data on request come from *PubChem* (National Library of Medicine, USA). All licence texts are linked from the about page (#ui[About] under the version at the bottom left). The code was written with substantial help from Claude, a model by Anthropic.

=== How to cite

If olomol helped with a publication, a thesis or teaching materials, cite it with the version you used. #ui[About] opens the about page, whose #ui[How to cite] has the citation: copy it as text, BibTeX, RIS or CSL JSON, or save it as a .bib, .ris or .json file for a reference manager (Zotero, Mendeley, EndNote, Citavi, LaTeX). It gives olomol's DOI on Zenodo, which stands for all its versions, and the number of the version you use.
