#import "styl.typ": *
#show: dokument.with(nazev: "Rychlý start")
#set par(spacing: 0.75em)
#show heading.where(level: 2): it => block(above: 1.1em, below: 0.5em, text(11.5pt, weight: "bold", it))

#grid(columns: (1fr, auto), align: horizon,
  [#text(22pt, weight: "bold", fill: akcent)[olomol] #h(0.3em) #text(12pt, fill: seda)[rychlý start]],
  image("../public/icons/icon.svg", width: 1.3cm),
)

olomol je bezplatný nástroj na kreslení chemických struktur, reakcí a mechanismů. Běží celý v prohlížeči: nic se neinstaluje, funguje stejně ve Windows, na Macu i v Linuxu a je česky. Vznikl pro výuku na Katedře fyzikální chemie Univerzity Palackého v Olomouci jako alternativa k ChemSketchi, takže rozložení bude povědomé: nástroje vlevo, prvky a kruhy dole. Na vyzkoušení stačí čtvrt hodiny s těmito třemi stránkami.

== 1. Otevření

Otevřete adresu, kterou jste dostali, v Chromu, Edgi nebo Firefoxu.

Kresba se průběžně ukládá v prohlížeči, takže po zavření a novém otevření tam bude. Na důležité věci ale používejte uložit #ik("save") (#kl[Ctrl+S]).

== 2. Okno

#grid(columns: (10.4cm, 1fr), gutter: 12pt, align: horizon,
  okno(10.4cm, ((1, "topbar", "x"), (2, "rail", "x"), (3, "dock", "x"), (4, "inspector", "x"), (5, "tool-hint", "levo"))),
  [
    #set par(justify: false)
    #legenda(
      (1, [soubory, zpět, #ui[Překreslit], #ui[Otočit ve 3D], #ui[Zarovnat], překlopení]),
      (2, [kreslicí nástroje (trojúhelníček v rohu: další varianty)]),
      (3, [prvky, kruhy, #ui[Šablony], #ui[Název / SMILES]]),
      (4, [panel s vlastnostmi toho, co je vybrané (bod 5)]),
      (5, [nápověda k nástroji; #kl[?] ukáže všechny klávesy]),
    )
  ],
)

== 3. První molekula

+ V dolní liště klikněte na benzen a pak na plátno.
+ Vlevo zvolte jednoduchou vazbu #ik("single") a klikněte na jeden roh kruhu: vyroste nová vazba.
+ Najeďte myší na její volný konec a stiskněte #kl[O]. Máte fenol.

Klávesy nad atomem mění prvek (#kl[N], #kl[O], #kl[S], #kl[L] je Cl…), nad vazbou #kl[1] #kl[2] #kl[3] mění její řád. Stejné písmeno nad prázdným místem zvolí *kreslení tím prvkem*: kliknutí na atom ho změní, #kl[Shift]+kliknutí připojí nový, #kl[C] vrátí uhlík. Náboj přidáte nástrojem náboje #ik("plusCharge") vlevo (ve variantách je i záporný, δ+ a δ−), nebo klávesou #kl[+] či #kl[−] nad atomem. #kl[Ctrl+Z] vrací zpět.

== 4. Struktura podle názvu nebo SMILES

#grid(columns: (1fr, 5.6cm), gutter: 12pt,
  [
    Klikněte na #ui[Název / SMILES] (nebo stiskněte #kl[/]) a napište SMILES, InChI nebo název, třeba `aspirin`. SMILES se nakreslí hned, jak píšete. Stiskněte #kl[Enter] a klikněte, kam má molekula přijít.

    SMILES a InChI se zpracují ve vašem počítači. Názvy se hledají v databázi PubChem (potřebuje internet a zná jen anglické názvy); odešle se jen napsaný text, nikdy vaše kresba. SMILES zkopírovaný odjinud stačí vložit na plátno přes #kl[Ctrl+V].
  ],
  obr("img/nazev-smiles.png"),
)

#pagebreak(weak: true)
== 5. Panel molekuly

#grid(columns: (1fr, 6.2cm), gutter: 12pt,
  [
    #set list(spacing: 0.45em)
    Dvojklikem vyberte molekulu. Panel vpravo ukáže, co s ní jde dělat:

    - *vzorec* a vedle něj #ui[Info]: hmotnosti, HRMS, elementární analýza, SMILES a InChI ke zkopírování,
    - #ui[Uhlíky]: CH#sub[3] napsané, jen #ui[čára], nebo #ui[Všechny C],
    - #ui[Číslování IUPAC] očísluje hlavní řetězec a napíše proč,
    - #ui[Aromatizovat] nakreslí v aromatických kruzích kroužek, #ui[Kekulé] ho vrátí,
    - #ui[Závorky] kolem molekuly (tranzitní stav, ion),
    - #ui[Volné páry] #ui[skryté] / #ui[zobrazené] a #ui[Nakreslit H] (vodíky jako atomy, pro šipky),
    - #ui[Barva] čar a písma, #ui[Zvýraznění] (barevný podklad) a #ui[Smazat].

    Když vyberete jen atom nebo vazbu, panel ukáže i jejich prvek, náboj, vodíky, řád nebo klín.
  ],
  obr("img/panel-molekula.png"),
)

== 6. Překreslit: hezčí nákres jedním kliknutím

#grid(columns: (1fr, 9cm), gutter: 12pt, align: horizon,
  [
    Molekula vložená ze SMILES nebo nakreslená narychlo nemusí vypadat hezky. Vyberte ji a v horní liště klikněte na #ui[Překreslit]. Program nabídne několik nákresů a upozorní na křížící se vazby. Ten, který se vám líbí, vyberete kliknutím. Žádný nákres nezmění molekulu ani její stereochemii a #kl[Ctrl+Z] ho vrátí.
  ],
  obr("img/rozvrzeni.png"),
)

#block(breakable: false)[
== 7. Jednoduchý mechanismus

Zahnuté šipky jsou součástí kresby: drží u svých atomů a vazeb, a když molekulu posunete nebo změníte, překreslí se samy. Takhle vypadá Friedelova–Craftsova acylace benzenu ve dvou krocích, s mezomerními strukturami σ-komplexu:

#figure(image("img/mechanismus.svg", width: 100%))
]

- Zahnutá šipka #ik("curve") (nástroj vlevo, #kl[A]): táhněte od elektronů, tedy od vazby nebo atomu s volným párem, tam, kam jdou. Kudy šipku vést, si program spočítá; když se vám nelíbí, táhněte za ni nebo v panelu klikněte na #ui[Jinak].
- Volné páry #ik("pairs") (#kl[:]): klikněte na atom. Kolik jich je, se odvodí z vazeb a náboje.
- Rezonanční šipka #ik("resonance") je ve variantách reakční šipky #ik("rxn"), závorky #ik("bracket") (#kl[K]) jsou nástroj vlevo: táhněte obdélník kolem mezomerních struktur.

#pagebreak(weak: true)
== 8. Barvy, zvýraznění a mřížka

#figure(image("img/katecholaminy.svg", width: 86%))

Šest katecholaminů a příbuzných léčiv. Všechny mají *modře zvýrazněnou* stejnou společnou část, nakreslenou stejně natočenou. Salbutamol (lék na astma) má *oranžově zvýrazněnou* hlavní odlišnost: místo jedné skupiny OH má CH#sub[2]OH, enzym COMT ho proto neodbourává a působí hodiny, ne minuty. *Fialově obarvené* jsou skupiny na dusíku: čím větší, tím víc látka působí na β-receptory.

+ Nakreslete první molekulu, zkopírujte ji (#kl[Ctrl+C], #kl[Ctrl+V]) a kopii upravte. Společná část tak zůstane všude stejně natočená.
+ Vyberte vše (#kl[Ctrl+A]), v #ui[Zarovnat] zadejte 3 #ui[Sloupce] a klikněte na #ui[Uspořádat do mřížky].
+ *Zvýraznění:* vyberte atomy (tažením obdélníku, #kl[Shift]+kliknutím) a v panelu klikněte na barvu v #ui[Zvýraznění]. Nebo použijte zvýrazňovač #ik("zvyraznovac") vlevo dole a klikejte na atomy a vazby.
+ *Barva čar a písma:* stejně, jen v panelu #ui[Barva], nebo nástroj #ik("barva") (vlevo dole, varianty v rohu).

== 9. Vzhled: náboje, volné páry, barvy

#grid(columns: (1fr, 3cm, 3cm), column-gutter: 10pt, align: horizon,
  [
    #set list(spacing: 0.45em)
    #ui[Nastavení] (#ik("settings") vpravo nahoře) mění vzhled celé kresby i exportovaných obrázků:

    - #ui[Náboje]: #ui("+ −"), nebo v kroužku #text(font: "Noto Sans Math")[⊕ ⊖],
    - #ui[Volné páry]: #ui[Tečky ··], nebo #ui[Čárky (Lewis)], jak se často učí u nás,
    - #ui[Barvy atomů]: #ui[Podle prvku], nebo #ui[Černé] (vlastní barvy a zvýraznění zůstanou),
    - dále #ui[Styl] #ui[ACS 1996] pro časopisy, #ui[Uhlíky], #ui[Aromáty] (kroužek nebo čárkovaně); označení R/S a E/Z se zaškrtává v panelu u molekuly.
  ],
  figure(image("img/styl-vychozi.svg", width: 100%), caption: text(8pt)[výchozí], supplement: none, numbering: none),
  figure(image("img/styl-lewis.svg", width: 100%), caption: text(8pt)[#text(font: "Noto Sans Math")[⊕ ⊖], čárky, černé], supplement: none, numbering: none),
)

== 10. Uložit, exportovat, vložit do Wordu

- Uložit #ik("save") (#kl[Ctrl+S]) uloží kresbu jako soubor KET, který se tu zase otevře se vším, i se šipkami a barvami.
- #ui[Kopírovat jako obrázek] (#kl[Ctrl+Shift+C]) dá kresbu (nebo výběr) do schránky. Ve Wordu nebo PowerPointu ji vložte přes #kl[Ctrl+V].
- #ui[Export] nabízí SVG (vektorový obrázek pro Inkscape a tisk), PNG a soubory molfile, SDF, SMILES a další. #ui[Kopírovat odkaz] tamtéž udělá odkaz, ve kterém je kresba přímo uložená.

== 11. Problém nebo nápad?
Budeme rádi za každou zprávu. Klikněte na brouka #ik("debug") vpravo nahoře: #ui[Napsat e-mail] otevře e-mail na bugs\@olomol.org i s verzí programu a prohlížečem; napište, co jste dělali a co se stalo. Odkaz na kresbu je na e-mail moc dlouhý: #ui[Kopírovat tabulku] ho zkopíruje i s tabulkou, vložte ho na konec e-mailu. V nápovědě jsou také příklady (u každé části kresby řeknou, jak se kreslí) a v jejím záhlaví tento návod i podrobná _Příručka_. Tlačítko #ui[Ukázky na videu] v ní ukáže pět krátkých videí z práce v programu.
