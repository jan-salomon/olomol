#import "styl.typ": *
#show: kniha.with(nazev: "Příručka")
#set heading(numbering: "1.1", supplement: [kapitola])

#titulni(
  nazev: [Příručka],
  podtitul: [Kreslení chemických struktur, reakcí a mechanismů v prohlížeči],
  obrazek: align(center + horizon, {
    image("img/titul.svg", width: 17cm)
    v(0.6cm)
    // co je na obrázku vidět
    let stitek(t) = box(fill: akcent-svetly, inset: (x: 7pt, y: 4pt), radius: 10pt, text(8.5pt, fill: akcent, weight: "medium", t))
    ("zahnuté šipky", "volné páry", "klíny a R/S", "výplně kruhů", "zvýraznění", "barvy", "náboje", "aromatický kroužek", "obecné skupiny", "text")
      .map(stitek).join(h(5pt))
  }),
  pata: [Jan Salomon #h(1fr) verze pro testování · listopad 2026 \ Katedra fyzikální chemie, Univerzita Palackého v Olomouci],
)

#obsah()
#counter(page).update(1)

= Úvod <uvod>

Tato příručka vám ukáže, jak v olomolu udělat to, co při kreslení chemie potřebujete: nakreslit molekulu nebo mechanismus se zahnutými šipkami, hezky je uspořádat a dostat do Wordu, PowerPointu nebo Inkscapu. Kapitoly jsou seřazené podle úkolů, ne podle tlačítek, takže můžete rovnou nalistovat to, co právě řešíte. Pokud program vidíte poprvé, začněte krátkým _Rychlým startem_. Kdo chce vědět, jak je program postavený uvnitř, najde to v příloze (@stavba).

Názvy tlačítek a nabídek jsou napsané #ui[takhle] a odpovídají přesně tomu, co uvidíte na obrazovce, když je program v češtině. Klávesy vypadají takhle: #kl[Ctrl+Z]. Na Macu místo #kl[Ctrl] použijte #kl[Cmd].

== Co je olomol

olomol je bezplatný kreslicí program pro chemii, který běží celý ve webovém prohlížeči. Vznikl pro výuku jako náhrada za ChemSketch. Kreslí struktury, reakční schémata a mechanismy s volnými elektronovými páry a zahnutými šipkami a exportuje čisté obrázky pro protokoly, diplomové práce a prezentace.

- *Nic se neinstaluje.* Stačí Chrome, Edge nebo Firefox, ve Windows, na Macu i v Linuxu. Kdo chce, může si ho nainstalovat jako aplikaci (@instalace).
- *Kresby zůstávají u vás.* Program nemá účty ani server, kam by se kresby ukládaly. Ven se něco pošle, jen když o to sami požádáte: hledání názvu v databázi PubChem pošle napsaný název a odkaz na kresbu nese kresbu v sobě.
- *Chemie je opravdová.* Program ví, kolik má atom vodíků a volných párů, počítá vzorec, hmotnosti a identifikátory a hlídá, aby úprava kresby nezměnila molekulu. Výpočty dělají knihovny RDKit, Indigo a OpenChemLib přímo ve vašem počítači.

== Otevření

Poprvé se stránka načítá o něco déle a pruh ukazuje, kolik zbývá. Chemické knihovny se stahují, až když jsou poprvé potřeba (můžete vidět třeba #ui[Načítám chemickou knihovnu (RDKit)…]). Potom už zůstanou v počítači a program funguje i bez internetu.

== Okno <okno>

#block(breakable: false)[
#okno(15.2cm, ((1, "topbar", "x"), (2, "rail", "x"), (3, "dock", "x"), (4, "inspector", "x"), (5, "tool-hint", "levo"), (6, "topright", "x")))

#v(0.3em)
#grid(columns: (1fr, 1fr), gutter: 16pt,
  legenda(
    (1, [*Horní lišta*, ve skupinách: název kresby a #ui[Uchováno], nová kresba #ik("newDoc"), otevřít #ik("open"), uložit #ik("save"), #ui[Export] | zpět a znovu #ik("undo") #ik("redo") | #ui[Překreslit], #ui[Otočit ve 3D] #ik("turn3d") | #ui[Zarovnat], překlopení #ik("flipH") #ik("flipV") #ik("flipBond"), #ui[Vodorovně / svisle] #ik("snap") | projekce #ik("ringFlip"): překlopení a otočení židličky, Fischerova projekce a cik-cak (@fischer) | zvětšení, #ik("fit") a #ui[Promítat] #ik("present"). V úzkém okně se skupiny, které se nevejdou, schovají pod #ik("more") na konci lišty. Při dvou a více kresbách jsou pod ní karty (@karty).]),
    (2, [*Kreslicí nástroje.* Trojúhelníček v rohu tlačítka znamená, že má další varianty: nechte myš chvíli na tlačítku, klikněte na trojúhelníček, nebo znovu na zvolený nástroj. Dole #ik("objects") otevírá panel #ui[Objekty] (@objekty).]),
    (3, [*Dolní lišta*: prvky, periodická tabulka #ik("table"), kruhy, #ui[Šablony] a *vyhledávací řádek* (@nazev).]),
  ),
  legenda(
    (4, [*Panel* s vlastnostmi toho, co je právě vybrané (@panel).]),
    (5, [*Nápověda* k právě zvolenému nástroji. Klávesa #kl[?] ukáže všechny klávesové zkratky.]),
    (6, [Nahlášení problému #ik("debug") (@problemy) a nastavení #ik("settings"): vzhled kresby, jazyk, vzhled okna a ladicí režim (@nastaveni).]),
  ),
)
]

== Nápověda a příklady <pomoc>

Když na tlačítko najedete myší a chvíli počkáte, objeví se popisek se vším, co dělá, i s klávesovou zkratkou. Řádek s nápovědou nad dolní lištou se mění podle zvoleného nástroje, takže stojí za to na něj mrknout, kdykoli vás nástroj překvapí. Kde je v horní liště místo, mají tlačítka i popisky; v užším okně je ztratí, nejdřív #ui[Otočit ve 3D].

*Pravé tlačítko myši* na plátně otevře nabídku toho, co se dá dělat s tím, na co ukazujete: vyjmout, kopírovat, vložit, smazat, #ui[Překreslit], #ui[Otočit ve 3D], překlopení, vazbu vodorovně nebo svisle, #ui[Zkratkou], #ui[Jedna sloučenina], #ui[Seskupit]… Pravé tlačítko na molekule ji nejdřív vybere, stejně jako dvojklik. Na prázdném plátně nabídne vložení, výběr všeho, zobrazení a #ui[Promítat]. Každá položka dělá totéž co její tlačítko nebo klávesa, a ta je napsaná vedle.

#obr("img/kontextove-menu.png", sirka: 30%, popis: [Nabídka pravého tlačítka u molekuly])

Kulaté tlačítko #ik("napoveda") vpravo dole otevře *nápovědu*, nejrychlejší cestu k tomu, jak se co dělá. Je v ní asi třicet hotových kreseb, ukázaných jako malé obrázky. Štítky jako #ui[Mechanismy], #ui[Stereochemie], #ui[Texty] nebo #ui[Soubory a karty] seznam zúží.

#obr("img/napoveda.png", sirka: 80%, popis: [Nápověda: ukázání na zahnutou šipku řekne, jak se kreslí, a její tlačítko se rozsvítí v levé liště])

- Vyberte příklad a *ukažte myší na kteroukoli jeho část*: popisek řekne, jak se kreslí, a tlačítko, které k tomu slouží, se v lištách programu rozsvítí.
- Co myší ukázat nejde (#ui[Překreslit], #ui[Šablony], #ui[Zarovnat]), je jako postup vypsané pod kresbou.
- #ui[Otevřít jako kresbu] udělá z příkladu vaši kresbu, kterou si můžete prohlédnout zblízka nebo změnit. #kl[Ctrl+Z] vrátí to, co jste měli předtím.

Nad štítky otevře #ui[Ukázky na videu] v nové kartě stránku o programu s pěti krátkými videi z práce v programu: mechanismus, reakční schéma, molekula stavěná po krocích a překreslená jen zčásti, komplex otočený ve 3D a Haworthova projekce glukosy změněná na židličku, překlopená a otočená ve 3D.

V záhlaví okna nápovědy je #ui[Rychlý start] (PDF), tato #ui[Příručka] na webu a vedle ní #ui[PDF] k tisku, #ui[Co je nového] se změnami v každé verzi, #ui[Klávesové zkratky], #ui[Nahlásit problém] (@problemy, také brouk #ik("debug") vpravo nahoře) a #ui[O aplikaci], stránka o olomolu s citací, poděkováním a licencemi. #ui[Co je nového] a #ui[O aplikaci] jsou také pod verzí vlevo dole; obojí se otevře v nové kartě.

== Kresba se ukládá sama <ulozeni>

#grid(columns: (1fr, 5cm), gutter: 14pt, align: horizon,
  [Nemusíte se bát, že o kresbu přijdete. Prohlížeč si ji pamatuje sám, chvilku po každé změně, takže klidně zavřete okno nebo vypněte počítač a kresba na vás počká, až se vrátíte. Ukazuje to značka vedle jejího názvu: hned po změně #ui[Uchovává se…], potom #ui[Uchováno].],
  obr("img/znacka-ulozeno.png"),
)

Takhle se uchovává každá otevřená kresba, takže až olomol příště otevřete, budou zpátky všechny, každá ve své kartě (@karty). Platí to v tomto prohlížeči na tomto počítači. Chcete-li kresbu přenést na jiný počítač nebo ji někomu poslat, uložte ji do souboru tlačítkem #ui[Uložit] (#kl[Ctrl+S], @soubory). Soubor je také nejjistější domov pro práci, na které vám hodně záleží, protože zůstane, i když se data prohlížeče vymažou.

*Dřívější verze.* Během kreslení si prohlížeč uchovává i dřívější verze kresby, po několika minutách. Klikněte na značku (#ui[Uchováno]) nebo na #ui[Otevřít] #ik("open") → #ui[Dřívější verze této kresby…] a okno je ukáže jako obrázky, nejnovější nahoře; #ui[Vrátit] dá vybranou na plátno a #kl[Ctrl+Z] vrátí kresbu, kterou jste měli. Zavřením kresby se její dřívější verze zapomenou.

Značka varuje ve dvou případech. #ui[Neuchováno] znamená, že tento prohlížeč nic neuchová, například v anonymním okně nebo při plném úložišti: než okno zavřete, uložte si kresbu do souboru. #ui[Jiná karta] znamená, že olomol je otevřený i v další kartě a ta mezitím uchovala svou kresbu. Příště se vrátí ta naposledy změněná, takže na jistotu si tuto kresbu uložte. Kresba otevřená v jednom okně olomolu zůstane v něm: druhé okno ji už neotevře, takže se dvě okna nikdy navzájem nepřepíšou.

Tlačítko #ik("newDoc") začne novou kresbu v nové kartě a dosavadní kresba zůstane ve své. Na prázdném plátně je bledá ukázka, pokaždé jiná ze čtyř. Najeďte myší na její část a dozvíte se, jak se kreslí; její tlačítko se rozsvítí červeně.

Vlevo nahoře vedle loga je *název kresby*. Nová kresba ho ještě nemá (šedé #ui[Nová kresba]); její soubory se nabídnou pod jménem `drawing-` s datem a časem, takže se navzájem nepřepíšou. Klikněte na název a přepište ho; podle něj se jmenují uložené soubory. Při dvou a více kresbách je název na kartě kresby a přejmenuje se dvojklikem na ni.

== Posun a zvětšení

*Zvětšit a zmenšit* můžete pomocí #kl[Ctrl] + kolečko nebo lupami nahoře. Procenta mezi nimi vrátí 100 %. Tlačítko #ik("fit") ukáže celou kresbu; s výběrem ho vystředí a přiblíží, až vyplní okno, což se hodí při práci na detailu.

*Posunout plátno* můžete kolečkem myši (se #kl[Shift] do stran), tažením se stisknutým mezerníkem, nebo tažením prostředním tlačítkem myši.

= Kreslení struktur <kresleni>

== Vazby a atomy

Všechno začíná jednoduchou vazbou #ik("single"), která je při spuštění už zvolená.

- *Klikněte na prázdné plátno:* vznikne první vazba.
- *Klikněte na atom:* přiroste nová vazba. Program sám zvolí rozumný směr, cik-cak a do největší mezery; řetězec vede napříč stránkou. Se #kl[Shift] půjde vazba na druhou stranu (na druhé nejlepší místo), takže se řetězec může stočit opačně.
- *Táhněte z atomu:* vytáhnete vazbu směrem, kam chcete, po 15°, se stisknutým #kl[Shift] v libovolném úhlu. Když ji pustíte na jiný atom, uzavřete kruh. Nad cílovým atomem se vazba přichytí rovnou k němu, takže hned vidíte výsledek.
- *Klikněte na vazbu:* změní se z jednoduché na dvojnou a trojnou.

#grid(columns: (1fr, 6.2cm), gutter: 14pt,
  [
    Další druhy vazeb jsou ve variantách nástroje (na obrázku zleva): jednoduchá, dvojná, trojná, plný klín, šrafovaný klín, vlnovka, koordinační, vodíková a částečná vazba. Kliknutí dvojnou vazbou na dvojnou vazbu přesune její druhou čáru na druhou stranu nebo doprostřed. Kliknutí klínem na klín ho otočí.

    Pracovat jde i z klávesnice, bez přepínání nástrojů. Najeďte myší nad vazbu a stiskněte #kl[1], #kl[2] nebo #kl[3]. Opakované #kl[1] nad jednoduchou vazbou z ní udělá plný klín, pak šrafovaný klín, pak oba z druhého konce a nakonec zase obyčejnou vazbu. #kl[Shift+1] jde stejnou cestou zpátky. Jsou-li vazby vybrané, #kl[1], #kl[2] nebo #kl[3] z nich udělá jednoduché, dvojné nebo trojné všechny naráz (s ukazatelem nad výběrem nebo nad prázdným místem).
  ],
  [
    #obr("img/nastroje-vazby.png")
  ],
)

== Řetězce a kruhy

Nástroj řetězec #ik("chain") (#kl[Z]) kreslí cik-cak řetězec: táhněte z atomu nebo z plátna. Během tažení ukazuje, kolik atomů přidá (z plátna i ten, ze kterého začíná); se #kl[Shift] začne cik-cak na druhou stranu.

*Kruhy* jsou v dolní liště (benzen a 3- až 8členné kruhy) a také ve variantách nástroje kruhu vlevo. Než kliknete, průhledný náhled ukáže, co se stane:

- kliknutí na *plátno* nakreslí samostatný kruh,
- kliknutí na *vazbu* přidá kondenzovaný kruh (naftalen z benzenu), se #kl[Shift] na druhé straně vazby,
- kliknutí na *atom* připojí kruh novou vazbou (fenyl); tažením od atomu ho namíříte,
- kliknutí na atom se stisknutým #kl[Shift] udělá kruh přímo přes ten atom (spiro sloučenina).

== Prvky, periodická tabulka a obecné skupiny

V dolní liště jsou nejčastější prvky, každý ve své barvě, aby se daly rychle najít. Vyberte si prvek a pak:

- *klikněte na atom*, a změní se na tento prvek,
- *klikněte na atom, který už tím prvkem je*, nebo na jakýkoli atom se #kl[Shift], a připojí se k němu *nový atom* tohoto prvku (kliknutím uhlíkem na uhlík prodlužujete řetězec),
- *klikněte na plátno*, a položíte samostatný atom (O: voda),
- *táhněte z atomu*, a nakreslíte vazbu k novému atomu.

Rychlejší jsou klávesy prvků: #kl[C] #kl[N] #kl[O] #kl[S] #kl[P] #kl[F] #kl[H] #kl[I], dále #kl[L] pro Cl a #kl[B] pro Br. Co klávesa udělá, záleží na tom, kde je myš.

- *Nad atomem* se atom jednorázově změní na ten prvek a váš nástroj zůstane, jaký byl.
- *Nad prázdným místem* začnete *kreslit tímto prvkem*. Rozsvítí se v dolní liště a funguje přesně tak, jak je popsané výše. Kliknutí na vazbu dál mění vazbu a #kl[1] #kl[2] #kl[3] nastaví řád nových vazeb, zatímco prvek zůstane (N, pak #kl[2]: dvojná vazba k N). #kl[C] přepne zpět na uhlík.

Tak můžete kreslit rovnou s heteroatomy, místo abyste kreslili uhlíkovou kostru a pak ji přepisovali.

#grid(columns: (1fr, 5.4cm), gutter: 14pt,
  [
    Tlačítko #ik("table") za prvky otevře #ui[Periodickou tabulku]. Prvky jsou v ní barevně rozdělené podle skupin (#ui[Alkalické kovy], #ui[Halogeny], #ui[Vzácné plyny]…) a mají čísla skupin a period.

    *Obecné skupiny a zkratky* jsou v #ui[Šablony] → #ui[Zkratky] a připojují se jako funkční skupiny (@skupiny):

    - *Zástupné symboly* jako R, R′, X, Nu, E, LG nebo Ar nemají vodíky ani volné páry, a proto se hodí pro obecné mechanismy. (Ar je tu aryl, ne argon.)
    - *Zkratky* jako Me, Et, Ph, Bn, Ac, Boc, Ts, OMe nebo CO2Et se počítají do vzorce a hmotnosti a do souborů se zapíše celá skupina. Vlevo od vazby se píšou obráceně (MeO–, EtO2C–).

    Když je vybraný atom, můžete zkratku nebo symbol napsat také do pole #ui[Prvek] v panelu. Izotop se píše s nukleonovým číslem (13C, 18O), deuterium a tritium jako D a T, nebo 2H a 3H. Značku pište, jak se píše (Cl, Na), nebo celou malými písmeny (cl, na); CO nebo NI program odmítne, místo aby z nich udělal kobalt a nikl: dvě velká písmena jsou dva atomy.

    Tlačítko #ui[Rozkreslit] v panelu nakreslí skupinu, za kterou zkratka stojí (Ph jako benzenový kruh), a #ui[Zkratkou] naopak zapíše vybranou skupinu zkratkou. Nemá-li výběr zkratku jako celek, zkrátí skupiny v něm, které ji mají (z CH#sub[2]N(CH#sub[3])#sub[2] je CH#sub[2]NMe#sub[2]), a samotná vybraná skupina CH#sub[3] se zapíše jako Me. Klín na vazbě ke skupině zůstane, takže se stereochemie nezmění. Zkratka stojí za skupinu na jedné vazbě, takže druhou vazbu nedostane: chcete-li se vázat na její atomy, nejdřív ji rozkreslete. Zkratky mají i nabité skupiny, s nábojem u zkratky: SO#sub[3]#super[−] (sulfonát), CO#sub[2]#super[−] nebo COO#super[−] (karboxylát), OPO#sub[3]#super[2−] a OPO#sub[3]H#super[−] (fosfáty) a PO#sub[3]#super[2−]; po rozkreslení je náboj na kyslíku, kam patří.
  ],
  obr("img/periodicka.png"),
)

== Náboje, radikály a vodíky

Nástroj náboje vlevo má čtyři varianty: kladný #ik("plusCharge"), záporný #ik("minusCharge") a parciální náboje *δ+* #ik("deltaPlus") a *δ−* #ik("deltaMinus"). Klikněte na atom, další kliknutí náboj zvýší (u záporného sníží); parciální náboj další kliknutí vypne. #kl[+] a #kl[−] vyberou kladný a záporný.

Nepárový elektron #ik("radical") je varianta nástroje volných párů #ik("pairs"). Kliknutím na atom přidáte jeden elektron, dalším dva u sebe (singlet) a dalším žádný. Dva elektrony každý na jiné straně (triplet), tři nebo čtyři nastavíte v řádku #ui[Nepárové] v panelu; na atomu bez vazeb se s nimi ukážou i volné páry, jako Lewisův symbol (·N̈·).

#figure(
  grid(columns: (1fr, 1fr), column-gutter: 16pt, row-gutter: 5pt, align: center + horizon,
    image("img/lewis.svg", width: 100%),
    image("img/lewis-cary.svg", width: 100%),
    text(8pt, fill: seda)[tečky], text(8pt, fill: seda)[čárky],
  ),
  caption: [Lewisovy symboly B, C, N, O a Cl, s tečkami a s čárkami (#ui[Nastavení] → #ui[Volné páry])],
  supplement: [Obr.],
  kind: image,
)

Nad atomem můžete stisknout také #kl[+] nebo #kl[−] pro náboj a #kl[.] pro nepárový elektron. Jsou-li atomy vybrané, #kl[+] a #kl[−] změní náboj všem.

#tip(nadpis: "Česká klávesnice")[Číslice se berou podle polohy klávesy, takže #kl[1] #kl[2] #kl[3] fungují i v horní řadě české klávesnice (+ ě š). Nad atomem zvýší + v horní řadě náboj; nad prázdným místem ale funguje jako #kl[1], takže nástroj kladného náboje vyberte klávesou + na numerické části klávesnice, nebo tlačítkem #ik("plusCharge").]

Atom, který má víc vazeb, než může mít, dostane *červený čárkovaný kroužek*, který je vidět jen na obrazovce a do obrázků se nedostane. V panelu je pak napsané, co je špatně, například #ui[Si nemůže mít 6 vazeb]. Většinou chybí náboj; pro SiF#sub[6]#super[2−] viz @komplexy.

*Vodíky* dopočítává program sám podle vazeb a náboje (CH#sub[3], NH#sub[2], OH). Jiný počet nastavíte v panelu v řádku #ui[Vodíky]. Tlačítko #ui[Nakreslit H] nakreslí vodíky vybraných atomů jako samostatné atomy, což potřebujete, když na vodík nebo od něj má vést zahnutá šipka. #ui[Skrýt nakreslené H] je zase schová.

Na koncích řetězců se ve výchozím stavu píše CH#sub[3]. Přepínač #ui[Uhlíky] v panelu (#ui[CH₃], #ui[čára] nebo #ui[Všechny C]) to změní pro vybrané uhlíky: pro celou molekulu, nebo jen pro jeden konec. #ui[Všechny C] napíše každý uhlík (CH#sub[3], CH#sub[2], CH), pro ty, kdo ještě nečtou roh jako uhlík. Výchozí volba pro nové kresby je v #ui[Nastavení]. Nabitý uhlík se píše (C#super[+]), ledaže je nastavený na #ui[čára]: pak se nakreslí jen jeho náboj v rohu, jak se karbokation nebo karbanion v mechanismu často kreslí.

== Stereochemie

Plný klín #ik("wedge") míří k vám a šrafovaný klín #ik("hash") od vás. Oba jsou ve variantách nástroje vazby. Klín začíná na atomu, ze kterého táhnete, takže jeho úzký konec je u stereocentra. Vlnovka #ik("wavy") značí, že konfigurace není určená.

Označení *R/S a E/Z* (u komplexů Λ a Δ) zapnete v panelu zaškrtnutím #ui[R/S, E/Z, Λ/Δ], pro celou vybranou molekulu, nebo jen pro vybrané atomy a vazby. Počítá je RDKit a přejdou i do exportovaných obrázků a do souborů olomolu.

Když spojíte široké konce dvou klínů vazbou, nakreslí se tučně, jak je zvykem (například přemostění u morfinanu nebo přední strana Haworthova vzorce). Tučně můžete nakreslit i kteroukoli jednoduchou vazbu záměrně, třeba vazbu, která ve schématu vzniká, nebo tu, na kterou chcete upozornit: vyberte ji a v řádku #ui[Stereo] v panelu zvolte #ui[tučná vazba] (▬). Tučný může být i popisek atomu: v panelu #ui[Popisek] → B.

== Zvláštní vazby

Ve variantách nástroje vazby jsou ještě tři vazby, které se nepočítají jako obyčejné. Klávesa #kl[D] vybere první z nich, každé další stisknutí další v pořadí (nad vazbou ji na ně mění):

- #ik("dative") *koordinační (dativní) vazba*, šipka od donoru, který na ni spotřebuje svůj volný pár (další kliknutí ji otočí),
- #ik("hbond") *vodíková vazba*, tečkovaná,
- #ik("partial") *částečná vazba*, vznikající nebo zanikající, čárkovaná, pro tranzitní stavy.

Klínem nebo šrafovaným klínem dostane koordinační vazba hloubku, s úzkým koncem u kovu. Zůstane přitom koordinační, takže donor nemá vazbu navíc. #ui[Překreslit] a #ui[Otočit ve 3D] pak zachovají, který z obou zrcadlových obrazů (Λ, Δ) jste nakreslili: nákresy, které by ho ztratily, #ui[Překreslit] nenabídne a #ui[Otočit ve 3D] u takového pohledu varuje. U oktaedrického komplexu se dvěma nebo třemi chelaty (cis-[CoCl#sub[2]\(en)#sub[2]]#super[+], [Co\(en)#sub[3]]#super[3+]) napíše #ui[R/S, E/Z, Λ/Δ] vedle kovu (Λ), nebo (Δ). Chcete-li, v nastavení lze šipky nahradit čarami.

#obr("img/lambda-delta.svg", sirka: 18%, popis: [[Co(en)#sub[3]]#super[3+] nakreslený s klíny; vedle kovu napíše #ui[R/S, E/Z, Λ/Δ] (Λ), nebo (Δ)])

Tyto vazby se ukládají do souborů olomolu (.olom), do souborů KET a do obrázků, ale ne do souborů molfile, SMILES a podobných (@omezeni).

== Výběr, přesun, otáčení a mazání

Nástroj výběr #ik("select") (#kl[V], nebo #kl[Esc]) umí toto:

- kliknutí vybere atom, vazbu, šipku nebo text, #kl[Shift]+kliknutí přidá do výběru,
- tažením po prázdném místě vyberete vše v obdélníku a to, co se vybere, se rozsvítí ještě předtím, než tlačítko pustíte; ve variantách je výběr lasem #ik("lasso") a #kl[Esc] mezi nimi přepíná, když už není co rušit,
- *dvojklik* vybere celou molekulu, #kl[Shift]+dvojklik ji přidá do výběru, *trojklik* vybere celý její řádek reakčního schématu (molekuly, plusy a šipky i s tím, co je na nich) a #kl[Ctrl+A] vybere vše,
- #kl[Ctrl]+kliknutí vybere skupinu, ve které věc je (@objekty),
- vybrané věci přesunete tažením nebo šipkami na klávesnici (se #kl[Shift] dál),
- za *kulatý úchyt* nad výběrem výběr otočíte,
- atom nebo vazba přetažená na jiný atom se s ním *spojí*. Už během tažení se přichytí a ukáže, jak to dopadne; když táhnete dál, zase se pustí. Vyplněný kruh si barvu nechá, pokud zůstane kruhem.

Mazat můžete gumou #ik("erase") (#kl[E]), kliknutím nebo obdélníkem. Vybrané věci smaže #kl[Delete] nebo tlačítko #ui[Smazat] v panelu. Bez výběru smaže #kl[Delete] to, co je právě pod myší.

Každý krok jde vrátit, takže klidně zkoušejte: #kl[Ctrl+Z] je zpět, #kl[Ctrl+Shift+Z] znovu.

== Jedna sloučenina <pohromade>

Sůl jako K#sub[2]SiF#sub[6] jsou tři samostatné částice (K#super[+], K#super[+] a SiF#sub[6]#super[2−]). Vyberte je všechny a v panelu klikněte na #ui[Jedna sloučenina]. Spojí je neviditelné pojítko, takže se posouvají, zarovnávají a skládají do mřížky jako jedna molekula a panel ukáže jeden vzorec (F#sub[6]K#sub[2]Si).

Pojítka uvidíte, když je sloučenina vybraná, nebo pořád, když v #ui[Nastavení] přepnete #ui[Pojítka] na #ui[zobrazené]. #ui[Oddělit] částice zase rozdělí. Do souborů molfile a SMILES se pojítka nezapisují.

== Skupiny a panel Objekty <objekty>

*Skupina* drží věci pohromadě při výběru a posouvání, aniž by z nich dělala jednu sloučeninu: molekulu s jejím číslem pod ní, dvě poloviny schématu, odpověď k úloze, kterou chcete odsunout stranou. Vyberte dvě a více věcí (molekuly, šipky, plusy, texty) a stiskněte #kl[Ctrl+G]; skupiny jdou seskupit i do větších skupin. #kl[Ctrl+Shift+G] skupinu rozdělí, vždy o jednu úroveň.

Obyčejné kliknutí dál vybírá atom nebo molekulu, takže skupina kreslení nikdy nepřekáží. #kl[Ctrl]+kliknutí vybere skupinu a další #kl[Ctrl]+kliknutí skupinu kolem ní; #kl[Ctrl]+tažení ji posune a #kl[Ctrl]+tažení obdélníku vezme celé skupiny toho, čeho se dotkne. #ui[Zarovnat] posouvá skupiny jako celky a obrázky SVG je pro Inkscape zachovají jako skupiny.

#grid(columns: (1fr, 6cm), gutter: 14pt, align: horizon,
  [Panel #ui[Objekty] #ik("objects") dole v liště nástrojů vypisuje věci a skupiny kresby. Kliknutí na řádek ho vybere (se #kl[Shift] nebo #kl[Ctrl] přidá), řádek pod myší se v kresbě rozsvítí a šipka před skupinou ji rozbalí. Dvojklikem na skupinu ji pojmenujete. Řádek přetažený na skupinu do ní přejde, přetažený na proužek dole ze všech skupin vyjde. Tlačítka nahoře seskupí a rozdělí vybrané. V nabídce pravého tlačítka je také #ui[Seskupit], #ui[Zrušit seskupení] a #ui[Vybrat její skupinu].],
  obr("img/objekty.png", popis: [Schéma s LDH z nápovědy jako jedna pojmenovaná skupina]),
)

== Kopírování a vkládání

#kl[Ctrl+C], #kl[Ctrl+X] a #kl[Ctrl+V] fungují jako jinde. Po vložení se průhledná kopie drží u myši, dokud ji kliknutím nepoložíte, a #kl[Esc] vkládání zruší.

Vložit jde i text odjinud: SMILES, InChI nebo molfile zkopírovaný z webu nebo z jiného programu se po #kl[Ctrl+V] rovnou nakreslí. Dvojná vazba, které SMILES neurčuje E ani Z, dostane vedle sebe vlnovku.

== Text

Zvolte nástroj text #ik("text") (#kl[T]), klikněte a pište. Co napíšete, zůstane přesně tak, jak je, takže se čísla v DOI nebo v názvech nezmění. V okénku nad textem je všechno pro jeho úpravu:

#obr("img/text-okenko.png", sirka: 60%, popis: [Okénko nad textem poté, co #ui[Vzorec] změnil CO32- na vzorec])

- #ui[Vzorec] udělá vzorec z označené části, nebo bez označení z celého textu. Číslice za písmeny se změní na dolní indexy a náboj na konci (Fe3+, CO32-, [SiF6]2-) na horní index. Rozumí i zápisu CO\_3^2- a e- nebo 2e- jako náboji elektronu. #ui[Prostý text] formátování zruší.
- Co pravidlo nezvládne, nastavíte ručně: x#sub[2] (#kl[Ctrl+,]), x#super[2] (#kl[Ctrl+.]), *B* (#kl[Ctrl+B]) a _I_ (#kl[Ctrl+I]). Změní označenou část, nebo bez označení to, co napíšete dál.
- V nabídkách okénka je zarovnání řádků (víceřádkový text pod molekulou nebo na šipce je jinak na střed) a zvláštní znaky: řecká písmena, šipky, °, ±, ‡.
- #ui[Aa] přepíná celý text mezi bezpatkovým (Arial) a patkovým písmem (Times New Roman) a pole vedle nastaví jeho velikost v bodech. Bez nich má text písmo a velikost podle stylu kresby (@nastaveni). Vybraný text jde celý ztučnit tlačítkem #ui[Tučně] v panelu, třeba číslo sloučeniny.

#kl[Enter] text dokončí, #kl[Shift+Enter] začne nový řádek. Zkopírovaný text se do jiných programů vloží jako obyčejná slova, takže DOI jde vložit rovnou do prohlížeče.

== Reakční šipky

Zvolte reakční šipku #ik("rxn") (#kl[X]). Kliknutí položí šipku standardní délky, tažením nakreslíte vlastní (#kl[Shift]: libovolný úhel). Ve variantách jsou rovnovážná #ik("equilibrium"), rezonanční (mezomerní) #ik("resonance"), retrosyntetická #ik("retro"), vícekroková #ik("multistep"), přeškrtnutá #ik("failed") (reakce neproběhne), rovnítko #ik("same") (totéž nakreslené jinak, třeba židlička = Haworthova projekce; #ui[Zarovnat reakční schéma] ho rozmístí jako šipku) a šipka dipólu #ik("dipole"), která se pohybuje se svou molekulou. Délku vybrané šipky změníte v panelu (#ui[Délka], v délkách vazby) nebo tažením za konec.

Rovnováhu posunutou na jednu stranu nastavíte u vybrané rovnovážné šipky v panelu tlačítkem #ui[Rovnováha]: každé kliknutí ji posune dál, z vyrovnané na stranu produktů (dolní šipka je kratší) a na stranu reaktantů (kratší je horní).

#obr("img/sipky.svg", sirka: 70%, ramecek: false, popis: [Nahoře rovnováha posunutá k produktům, přeškrtnutá šipka a rovnítko. Dole redukce thioredoxinu: 2 e#super[−] a 2 H#super[+] přicházejí po oblouku horní šipky a cestou zpět odcházejí po oblouku dolní])

Nástroj #ik("plus") položí znaménko plus mezi reaktanty.

== Kotvy

Kotvy drží text nebo činidlo u toho, k čemu patří, takže nemusíte nic přesouvat po kouscích.

#obr("img/kotvy.svg", sirka: 86%, ramecek: false, popis: [Reakční schéma s čísly sloučenin na kotvách pod molekulami])

*U molekuly.* Každá molekula má čtyři místa pro text: pod, nad, vlevo a vpravo. Když text táhnete k molekule, kotvy se ukážou jako rámečky a ta nejbližší se zvýrazní. Pustíte, a text na ní zůstane: odteď se pohybuje a zarovnává s molekulou. Víc textů na jedné kotvě se srovná pod sebe a pořadí změníte přetažením na jiné místo. Takhle dáte číslo sloučeniny pod molekulu nebo počet molů (2 NaOH) vlevo. V panelu jde kotva vybrat šipkami ↓ ↑ ← → a #ui[volně] text uvolní; uvolní se i odtažením od molekuly. Text napsaný těsně pod molekulu, nad ni nebo vedle ní se na kotvu dá rovnou.

*U reakční šipky.* Šipka má kotvy nad sebou a pod sebou. Přetáhněte k ní text (podmínky) nebo celou molekulu (činidlo) a bude se pohybovat se šipkou, stejně jako text napsaný těsně nad ni nebo pod ni; pořadí změníte přetažením v řadě. U otočené nebo svislé šipky stojí pod sebou, těsně u ní, stejně jako nad vodorovnou šipkou a pod ní. Před molekulu na šipce dáte v panelu + nebo − (přidává se, odchází). Dvojklik na šipku ji vybere i se vším, co na ní je.

== Boční oblouky u reakčních šipek

Boční oblouk ukazuje, že se něco cestou k reakci přidává nebo z ní odchází, jako NAD#super[+] → NADH.

#obr("img/bocni-oblouky.svg", sirka: 62%, ramecek: false, popis: [Laktátdehydrogenasa: NADH přichází a NAD#super[+] odchází po bočních obloucích])

+ Zvolte nástroj šipky. Uprostřed každé reakční šipky se ukáže kroužek.
+ Táhněte z kroužku ven (oblouk, který odchází), nebo z plátna ke kroužku (oblouk, který přichází), nad šipku i pod ni.
+ Na konec oblouku přetáhněte text nebo molekulu. Šipka se sama prodlouží, a když je odeberete, zase zkrátí.

Další oblouk se přichytí k délce prvního, tažením dál bude delší. Když chcete oblouk později změnit:

- tažením za konec změníte jeho délku, přes šipku ho přenesete i se stohem na druhou stranu,
- kliknutím vyberete jen oblouk a #kl[Del] ho smaže; co bylo na jeho konci, zůstane volně na svém místě,
- v panelu šipky #ui[Překlopit] #ik("flipH") obrátí její směr a #ik("flipV") dá oblouky a stohy na druhou stranu.

Když jste délku šipky nastavili tažením za její konec, oblouky ji nemění, ale #ui[Zarovnat reakční schéma] ano.

U *rovnovážné šipky* má každá z jejích dvou šipek své oblouky: oblouk nad ní se napojí na horní šipku a jde jejím směrem, oblouk pod ní na dolní a jde zpět. Redukce thioredoxinu tak nahoře přijme 2 e#super[−] a 2 H#super[+] a cestou zpět je dole odevzdá.

== Panel vpravo <panel>

#grid(columns: (1fr, 6cm), gutter: 14pt,
  [
    Panel ukazuje vlastnosti toho, co je vybrané, a umí je měnit.

    Pro *celou molekulu* ukáže vzorec (s tlačítkem #ui[Info], @info), #ui[Uhlíky], #ui[Číslování IUPAC], #ui[R/S, E/Z, Λ/Δ], #ui[Aromatizovat] a #ui[Kekulé], #ui[Závorky], volné páry, #ui[Nakreslit H], #ui[Barva] a #ui[Zvýraznění]. U více molekul přibude #ui[Jedna sloučenina].

    Pro *jeden atom nebo část molekuly* se objeví část #ui[Atom]: #ui[Prvek], #ui[Číslo], #ui[Náboj] (− a + o jeden; i δ− a δ+), #ui[Nepárové] elektrony, #ui[Volné páry], #ui[Popisek] (normální nebo tučný) a #ui[Vodíky]. Pod volnými páry je napsané, kolik jich atom má.

    U *vazby* je to #ui[Řád], #ui[Druh], #ui[Stereo] (mezi nimi i tučná vazba) a u dvojné vazby #ui("2. čára"): #ui[Další] posune druhou čáru dál, doprostřed, na jednu nebo na druhou stranu, a #ui[Auto] ji vrátí programu.

    Dole je vždy #ui[Smazat] a počet vybraných věcí.
  ],
  obr("img/panel-atom.png"),
)

= Šablony a struktury podle názvu <sablony>

#grid(columns: (1fr, 8cm), gutter: 14pt,
  [
    #ui[Šablony] v dolní liště (nebo #kl[Shift+T]) otevřou sbírku hotových struktur. Vlevo pod hledáním jsou její skupiny: #ui[Kruhy], #ui[Funkční skupiny], #ui[Zkratky], #ui[Sloučeniny], #ui[Konformace a projekce], #ui[Komplexy], #ui[Aminokyseliny], #ui[Cukry a nukleové báze] a #ui[Činidla a rozpouštědla]. Velké skupiny se dělí dál (#ui[Kruhy] na aromatické, heteroaromatické, alicyklické a nasycené heterocykly; #ui[Konformace a projekce] na židličky a vaničky, Newmanovy, Haworthovy a Fischerovy projekce): skupina ukáže všechno pod nadpisy, podskupina jen to své. Příště se okno otevře tam, kde jste byli naposledy.

    Kliknutím šablonu vyberete. Průhledný náhled se pak drží u myši a další kliknutí ji položí, i víckrát za sebou. #kl[Esc] vkládání ukončí.
  ],
  obr("img/sablony.png", popis: [Šablony, židličky a Newmanovy projekce]),
)

== Hledání <hledani>

Do pole #ui[Hledat…] napište část názvu, česky nebo anglicky (`kyselina`, `glucose`, `židlička`). Aminokyselinu najdete i podle kódu, který má na kartě (`Phe` nebo `F`). Když žádná šablona neodpovídá, pole nakreslí SMILES nebo vyhledá název, stejně jako vyhledávací řádek (@nazev).

#grid(columns: (1fr, 8cm), gutter: 14pt,
  [
    S *otazníkem* na začátku hledání ukáže šablony, které obsahují určitou část, ať se jmenují jakkoli. Na velikosti písmen nezáleží.

    - *skupina:* `?oh`, `?Ts`, `?Boc`, `?Ph`,
    - *druh sloučeniny:* `?ester`, `?amin`, `?keton`, `?kyselina`,
    - *prvek:* `?S`, `?Cl`,
    - *aminokyselina podle třípísmenného kódu:* `?ala`,
    - *libovolná část zapsaná jako SMILES:* `?C=O`, `?C(=O)N`.

    Hodí se to při výuce: `?ester` ukáže najednou všechny estery mezi šablonami.
  ],
  obr("img/sablony-hledani.png", popis: [Hledání v šablonách s otazníkem: `?ester`]),
)

== Funkční skupiny se připojují <skupiny>

#grid(columns: (1fr, 8cm), gutter: 14pt,
  [
    Šablony ve skupině #ui[Funkční skupiny] mají místo, kterým se připojí. Vyberte skupinu a klikněte na atom své molekuly: skupina se k němu připojí a natočí se od jeho ostatních vazeb. Tažením od atomu ji namíříte. S #kl[Shift] se z atomu stane její první atom (COOH na koncovém uhlíku pentanu dá kyselinu pentanovou). Kliknutím na prázdné plátno ji položíte samostatně, na R.

    Má-li skupina zkratku (Ph, Boc, OMe…), je na její kartě malé tlačítko s touto zkratkou. To ji vloží jako jeden atom se zkratkou.
  ],
  obr("img/sablony-skupiny.png", popis: [Funkční skupiny se zkratkami vpravo nahoře na kartách]),
)

== Konformace a projekce

- *Židličky a vanička* jsou nakreslené jako v učebnici: rovnoběžné hrany, axiální vazby svisle, ekvatoriální rovnoběžně s vazbami kruhu. Židlička se čte jako molekula, kterou ukazuje, viděná trochu shora: spodní dlouhá hrana je vpředu, horní vzadu a každá skupina je nahoře, nebo dole, podle toho, kam míří. SMILES, InChI, #ui[Info] i soubory tak dostanou stereoizomer z obrázku (šablona β-D-glukosy je β-D-glukosa, trans-1,2-dibromcyklohexan zůstane trans); jiné programy ho dostanou jako klíny na židličce. Stejně se čte i cyklohexen nakreslený ve tvaru židličky (položidlička produktu E2), jen ho nejde překlopit ani otočit. Kondenzované a přemostěné kruhy (dekaliny, steroidy) zatím stereochemii z obrázku nemají.

  Židličku můžete nakreslit i ručně, nástrojem vazby: program ji pozná podle tvaru, který má každá židlička, i když není přesně jako v šabloně. Protější hrany jsou rovnoběžné a dva protější rohy míří dovnitř (cik-cak). Pravidelný šestiúhelník, Haworthův kruh ani vanička tento tvar nemají. Kruh se zaoblenými, tupými špičkami, u kterého nejde poznat, kterou židličku ukazuje, program za židličku nebere. Když na rozpoznanou židličku ukážete myší nebo táhnete některý její atom, celý kruh se zvýrazní zelenomodře místo obvyklé modré; kresba se tím nemění. S rozpoznanou židličkou funguje stereochemie, #ui[Otočit ve 3D] i překlopení. #ui[Překlopení židličky] #ik("ringFlip") z jedné židličky udělá druhou (@preklopeni).
- *Newmanovy projekce* ethanu, butanu a cyklohexanu jsou molekuly při pohledu podél vazby: přední uhlík je bod uprostřed, zadní uhlík kruh a každá skupina kolem nich je obyčejný atom. Zahnuté šipky, náboje, volné páry i R/S na nich fungují jako na každé molekule: eliminaci E2 na cyklohexanu, viděném podél C1–C2 a C5–C4 s axiálními vazbami svisle nahoru a dolů, nakreslíte šipkou z axiální vazby C–H na vazbu viděnou z čela (místo mezi středem a kruhem) a šipkou z C–Br na Br. Kliknutí přesně doprostřed vybere přední uhlík, kliknutí na kruh zadní. Když je vybraný uhlík projekce, panel #ui[Newmanova projekce] umí přepsat skupiny (#ui[Přední], #ui[Zadní]: H, CH3, OH, Cl, Ph…), nastavit #ui[Torzní úhel] (#ui[0°] zákrytová (syn), #ui[60°] gauche, #ui[120°] zákrytová, #ui[180°] anti) a tlačítkem #ui[Otočit zadní o 60°] otáčet zadním uhlíkem; v cyklohexanu skupiny kruhu zůstávají a zadní uhlík se sám otočit nedá. Soubory a SMILES dostanou stereoizomer, který projekce ukazuje; molfile, CDXML a další formáty pro jiné programy ho dostanou nakreslený obyčejně, s klíny. #ui[Překreslit] z něj udělá obyčejný nákres a nákresy ze starších verzí se otevřou jako molekuly.
- *Haworthovy a Fischerovy projekce* ze šablon (glukosa, galaktosa, ribosa, glyceraldehyd, alanin, serin…) mají stereochemii, která se do souborů zapíše jako klíny. Fischerovu projekci jde udělat i z kteréhokoli otevřeného řetězce nakresleného s klíny, nebo ji nakreslit ručně a kliknutím ji nechat přečíst (@fischer).

#obr("img/newman-e2.svg", sirka: 28%, popis: [Eliminace E2 na cyklohexanu viděném podél C1–C2 a C5–C4: Br a odtrhávaný H jsou trans-diaxiální])

== Komplexy <komplexy>

Skupina #ui[Komplexy] má obecné tvary koordinačních sloučenin: #ui[Lineární], #ui[Trigonálně planární], #ui[Tetraedrický], #ui[Čtvercově planární], #ui[Trigonálně bipyramidální], #ui[Tetragonálně pyramidální] a #ui[Oktaedrický]. Uprostřed je obecný atom M, kolem něj ligandy L a klíny dávají hloubku. M a L nahradíte jako jakýkoli atom: kliknutím prvkem z dolní lišty, klávesou nad atomem, nebo v panelu v poli #ui[Prvek], kam jde napsat i NH3, PPh3 nebo Cl.

*Náboj komplexního iontu patří atomu.* Program počítá vazby a volné páry z nábojů atomů a náboj napsaný na závorkách je jen text. Jako příklad vezměme hexafluorokřemičitan [SiF#sub[6]]#super[2−]:

+ Položte #ui[Oktaedrický] komplex, M změňte na Si a všechna L na F (vyberte je a do pole #ui[Prvek] napište F).
+ Vyberte Si a v panelu nastavte #ui[Náboj] na #ui[2−], nebo dvakrát stiskněte #kl[−] nad atomem. Si s šesti vazbami je teď v pořádku a červený kroužek zmizí.
+ Chcete-li zápis se závorkami, klikněte nástrojem #ui[Závorky] na ion. Náboj už nese Si, takže ho na závorky nepište, jinak bude v obrázku dvakrát.
+ Přidejte draselné ionty K#super[+] a celou sůl spojte tlačítkem #ui[Jedna sloučenina] (@pohromade).

Druhá možnost je bližší vazebné představě: čtyři obyčejné vazby Si–F a dva fluoridy F#super[−] připojené koordinační vazbou #ik("dative") od F k Si. Dativní vazba se Si do vazeb nepočítá, takže Si zůstane neutrální a náboje nesou oba F#super[−].

#obr("img/komplex-kobalt.svg", sirka: 76%, ramecek: false, popis: [Kobalt(II), oktaedrický (růžový) a tetraedrický (modrý): náboje na kovu, závorky kolem každého komplexu])

Jakýkoli komplex si prohlédnete v prostoru pomocí #ui[Otočit ve 3D] (@otoceni), i čtvercově planární, jako je cisplatina nakreslená jako kříž.

== Vyhledávací řádek: struktury, šablony a akce <nazev>

Pole na pravém konci dolní lišty (kurzor do něj dá #kl[/]) rozumí tomu, co napíšete, několika způsoby a seznam nad ním ukáže, co našel, to nejlepší hned u pole. Šipky #kl[↑] a #kl[↓] vybírají, #kl[Enter] provede, #kl[Esc] odejde.

#grid(columns: (1fr, 7.4cm), gutter: 14pt,
  [
    - *SMILES* (`CC(=O)Oc1ccccc1C(=O)O`) nebo *InChI* se nakreslí hned, jak píšete, přímo ve vašem počítači, i bez internetu; #kl[Enter] a kliknutí ho položí, kam má přijít.
    - *Název* (`aspirin`, `caffeine`) nebo *číslo PubChem* (`CID 2244`) se vyhledá v databázi PubChem. Potřebuje to internet a PubChem zná jen anglické názvy. Na PubChem se pošle jen to, co jste napsali, nikdy vaše kresba.
    - *Prvky* podle značky nebo názvu (`Fe`, `železo`) vyberou nástroj atomu; *šablony* najde podle názvu jako okno #ui[Šablony] a s otazníkem na začátku šablony, které danou část obsahují (`?ester`, `?C=O`, @hledani).
    - *Nástroje a akce olomolu* podle názvu nebo podle toho, co dělají (`překlopení židličky`, `export SVG`, `newman`, `promítat`), i s klávesou, takže najdete i to, u čeho nevíte, kde je tlačítko.
    - *Kresby*: otevřené podle názvu a vaše nedávné soubory.
    - *Odkaz* na olomol, nebo jen jeho konec (`#smiles=CCO`), otevře, co v něm je (@odkazy); hodí se v nainstalované aplikaci, která nemá adresní řádek.
  ],
  obr("img/nazev-smiles.png", popis: [SMILES nakreslený už při psaní]),
)

#grid(columns: (1fr, 7.4cm), gutter: 14pt,
  [
    SMILES, InChI nebo CID je v seznamu první; u slov je první to, co má olomol, a PubChem až poslední, takže #kl[Enter] nikdy nepošle na PubChem slovo, kterému odpovídá šablona nebo akce.

    Když je ve SMILES chyba, program řekne, co je špatně a kde, například #ui[Atom 2 (N) má víc vazeb (4), než může mít neutrální N; s nábojem může mít o jednu víc: [N+].] Když je chybou náboj mimo hranaté závorky (N+ místo [N+]), nabídne opravený SMILES: #ui[Nakreslit místo toho …].

    SMILES nebo InChI zkopírované odjinud stačí vložit na plátno přes #kl[Ctrl+V]; vyhledávací řádek k tomu není potřeba.

    Halogen s více vazbami se nakreslí tak, jak je napsaný: `Cl(=O)(=O)(=O)[O-]` jako chloristan s dvojnými vazbami Cl=O (ne Cl#super[3+] se čtyřmi O#super[−]) a `Cl=O` jako H–Cl=O. RDKit takové zápisy sám odmítá, proto pro ně neumí InChI ani R/S.
  ],
  obr("img/hledani.png", popis: [`židlička`: šablony a akce]),
)

= Mechanismy <mechanismy>

V olomolu jsou volné páry a zahnuté šipky *součástí kresby*, ne obrázky položené navrch. Patří ke svým atomům a vazbám, takže když molekulu posunete, otočíte nebo změníte, překreslí se samy, a to už během tažení.

#obr("img/mechanismus.svg", ramecek: false, popis: [Friedelova–Craftsova acylace benzenu ve dvou krocích, s mezomerními strukturami σ-komplexu])

== Volné páry a nepárové elektrony

Zvolte volné páry #ik("pairs") (#kl[:]) a klikněte na atom, nebo táhněte obdélník přes více atomů. Když jsou atomy už vybrané, stačí stisknout tlačítko nástroje nebo #kl[:] a páry se ukážou u všech (znovu: skryjí se). V panelu je to přepínač #ui[Volné páry]: #ui[skryté] / #ui[zobrazené].

Kolik párů atom má, plyne z chemie: valenční elektrony minus náboj, vazby, vodíky a nepárové elektrony. Proto dusík v pyrrolu nemá žádný a v pyridinu jeden. Když atomu přidáte náboj nebo vazbu, počet párů se sám upraví. Páry se kreslí jako tečky; v #ui[Nastavení] je můžete přepnout na čárky (#ui[Čárky (Lewis)]), jak se často učí u nás.

== Zahnuté šipky a půlšipky

Zvolte zahnutou šipku #ik("curve") (#kl[A]) pro elektronový pár, nebo ve variantách půlšipku #ik("fishhook") (#kl[Shift+A]) pro jeden elektron. Potom:

+ Začněte tam, *odkud elektrony jdou*: na vazbě, na atomu s volným párem, nebo u půlšipky na atomu s nepárovým elektronem (půlšipka vyjde z něj).
+ Táhněte tam, *kam jdou*: na atom, na vazbu, nebo na tečku nové vazby (viz níže), a pusťte.

Místo tažení můžete kliknout na začátek a pak na konec. Nástroj zůstává zapnutý, takže můžete kreslit šipku za šipkou. Kudy šipku vést, si program spočítá sám: vyhne se popiskům, vazbám, volným párům a jiným šipkám a začne na správné straně.

*Šipka k nové vazbě.* Když elektrony vytvoří novou vazbu, může šipka skončit mezi oběma atomy, tam, kde vazba vznikne. Během tažení půlšipky, nebo zahnuté šipky se stisknutým #kl[Shift] (stačí ho stisknout až během tažení), vedou od elektronů slabé čárkované čáry ke všem atomům do vzdálenosti pěti délek vazby, se kterými by nová vazba mohla vzniknout, a uprostřed každé je tečka. Čáry ve směru ukazatele jsou výraznější. Pusťte šipku na tečku a skončí u nové vazby; pustíte-li ji na atom, skončí na atomu. Tak nakreslíte třeba odtržení vodíku radikálem chloru: půlšipka z Cl• a půlšipka z vazby H–C se potkají u nové vazby Cl–H a druhá půlšipka z vazby H–C jde na uhlík. Stejně se kreslí spojení dvou radikálů nebo nukleofil, který tvoří novou vazbu.

#obr("img/nova-vazba.png", sirka: 55%, popis: [Půlšipka z vazby H–C tažená na tečku nové vazby Cl–H, kde už končí půlšipka z Cl•])

Hlídá také chemii. Šipku z atomu, který žádné elektrony nemá, nedovolí a řekne proč, například #ui[Atom C nemá volný elektronový pár ani nepárový elektron, elektrony z něj tedy vycházet nemohou. Začněte na vazbě nebo na jiném atomu.]

Barvu nových šipek (třeba červenou) nastavíte v #ui[Nastavení] → #ui[Nové šipky].

== Když se šipka nelíbí

#obr("img/sipka-panel.png", sirka: 66%, popis: [Vybraná zahnutá šipka a její panel])

- *Táhněte* za šipku nástrojem výběr #ik("select") tam, kudy má vést. Program vybere nejbližší dobrý tvar.
- V panelu klikněte na #ui[Jinak] a šipka se nakreslí druhým nejlepším způsobem, z druhé strany nebo z jiného volného páru. Další kliknutí ukáže další možnosti, #ui[Nejlépe] vrátí původní tvar.
- Přepínač #ui[Elektrony] změní šipku na půlšipku a zpět (#ui[pár] / #ui[jeden (půlšipka)]).

== Orbitaly <orbitaly>

Orbitaly jsou ve variantách nástroje #ik("orbitalP") pod volnými páry: orbital p #ik("orbitalP"), hybridní orbital #ik("orbitalHybrid") (volný pár, σ\*) a orbital s #ik("orbitalS"); čtvrtá varianta, čára překryvu #ik("orbitalOverlap"), jen kreslí čárkované čáry tažením z jednoho orbitalu na orbital jiné molekuly. Kliknutím na atom na něj orbital dáte. Orbital p stojí svisle, hybridní míří od vazeb, a když z atomu táhnete, natočí se rovnou tím směrem. Leží za vazbami a popisky, takže kresba zůstane čitelná.

- *Natočení:* táhněte za lalok, nástrojem orbitalu nebo výběru. Orbital se otáčí po 15° a přichytává se ke směrům vazeb, ke kolmicím na ně a k osám mezi nimi; se Shiftem se otáčí volně. S molekulou se otáčí, překlápí i překresluje.
- *Fáze:* kliknutím na lalok nástrojem orbitalu se stínovaný a bílý lalok vymění, v panelu je to #ui[Opačná fáze]. Stínovaný lalok je šedý a druhý bílý. Nástroj barvy obarví lalok, na který kliknete; v panelu přepínač nad barvami, #ui[stínovaný] nebo #ui[opačná fáze], určí, který lalok barvy obarví.
- *Velikost* laloků, třeba podle koeficientů HOMO a LUMO, nastavíte v panelu tlačítky − a +.
- *Překryv:* lalok přetažený na orbital jiné molekuly nakreslí mezi nimi čárkovanou čáru. Molekuly zůstanou dvě, při zarovnání se ale drží spolu, jako diena a dienofil. Čára vede mezi lalokem, který jste táhli, a lalokem, na který jste ho pustili (třeba lalokem vazby C–H a dolním lalokem orbitalu p); puštěná na atom spojí laloky, které jsou k sobě natočené.
- *Šipky:* zahnutá šipka může začít na laloku nebo na něm skončit, třeba z volného páru nukleofilu do σ\* vazby C–Br.

Na atomu s popiskem (O, N, Br) začínají laloky až za písmenem a vodíky i náboj se jim vyhnou (NH vedle orbitalu, u HO#super[−] je minus nad O). V #ui[Otočit ve 3D] (@otoceni) se orbitaly p postaví kolmo na rovinu molekuly, tak jak ji zrovna vidíte, a zůstanou na té straně, na kterou jste je nakreslili. Po #ui[Použít tento pohled] tak zůstanou, a nový orbital p na takovém atomu dostane stejný směr.

#figure(
  grid(columns: (1fr, 1.25fr), column-gutter: 16pt, align: center + horizon,
    image("img/orbitaly-diels-alder.svg", width: 78%),
    image("img/orbitaly-sn2.svg", width: 100%),
  ),
  caption: [Vlevo HOMO dienu a LUMO ethylenu v Dielsově–Alderově reakci: laloky velké podle koeficientů, čárkovaně překryv laloků stejné fáze. Vpravo S#sub[N]2: šipka z volného páru hydroxidu do σ\* vazby C–Br],
  supplement: [Obr.],
  kind: image,
)

== Mezomerní struktury, tranzitní stavy a závorky

#obr("img/sn2.svg", ramecek: false, popis: [S#sub[N]2: tranzitní stav s částečnými vazbami, parciálními náboji a závorkami s ‡])

*Mezomerní struktury* oddělte rezonanční šipkou #ik("resonance"), variantou reakční šipky.

*Závorky* #ik("bracket") (#kl[K]): táhněte obdélník, nebo klikněte na molekulu. Tlačítko #ui[Závorky] v panelu je dá kolem vybraných atomů. Závorky kolem celé molekuly se hodí pro *tranzitní stav* nebo *komplexní ion* a panel jim přidá vpravo nahoře ‡, náboj nebo cokoli napíšete. Závorky kolem části řetězce značí *opakující se jednotku* polymeru: protnou vazby, které z ní vycházejí, a dostanou n. #ui[Tvar] přepíná hranaté a kulaté.

*Tranzitní stavy* využívají částečné vazby a náboje δ ve variantách nástroje vazby a nástrojů náboje. Značka δ+ nebo δ−, přes kterou by vedla zahnutá šipka, se sama přesune na jinou stranu atomu. Tranzitní stav S#sub[N]2 načrtnutý od ruky promění #ui[Překreslit] v obrázek z učebnice: obě částečné vazby v přímce, zbylé tři vazby s klíny tak, jak jste je načrtli.

== Aromatické kruhy

Tlačítko #ui[Aromatizovat] v panelu nakreslí do aromatických kruhů kroužek, plný, nebo čárkovaný, zvolíte-li to v #ui[Nastavení] → #ui[Aromáty]. Nabité skupiny, které vypadají ve všech mezomerních strukturách stejně (COO#super[−], NO#sub[2], SO#sub[3]#super[−], guanidinium), se nakreslí delokalizovaně s náboji δ. Bez výběru se to týká všech molekul. #ui[Kekulé] vrátí jednoduché a dvojné vazby.

Pod kroužkem zůstávají jednoduché a dvojné vazby, takže se nezmění vzorec, volné páry ani soubory a jiné programy dostanou běžný Kekulého vzorec. Proto také #ui[Kekulé] vrátí přesně ty vazby, které tam byly.

Když strukturu změníte tak, že aromatický kruh nebo delokalizovaná skupina přestane dávat smysl (smažete atom kruhu, kyslík acetátu přetáhnete na jiný atom), program ji sám vrátí na Kekulého vzorec.

= Úprava a uspořádání <usporadani>

== Překreslit

Když molekula vypadá zmateně, třeba po vložení SMILES, vyberte ji a klikněte na #ui[Překreslit] #ik("layout"). Program nabídne několik nákresů od různých metod vedle vašeho #ui[Současný nákres] a vy si kliknutím vyberete. Volbu vrátí #kl[Ctrl+Z].

Nákresy jsou seřazené. První jsou ty bez křížících se vazeb a překrytých atomů, s pravidelnými vazbami a úhly, a ukáže se jen pár nejlepších. Seřadí se jednou, když skončí rychlé metody; nákresy od pomalejších (úprava Indigem, pohledy na 3D model) přijdou o pár sekund později a přidají se za ně, takže se žádný nákres před očima nepřesune. #ui[Ukázat všechny nákresy] přidá ostatní a #ui[Ukázat jen nejlepší] je zase schová. Pod nákresem je upozornění, když se v něm kříží vazby nebo překrývají atomy.

Každý nákres se kontroluje: když by změnil molekulu, třeba její stereochemii, vůbec se nenabídne. Překreslení mění, jak molekula vypadá, nikdy to, co je. Každý nákres celé molekuly se srovná se stránkou: natočí se nejvýš o 15° tak, aby většina vazeb ležela v násobcích 30°, stejně jako molekula vložená jako SMILES (pohled na 3D model si nechá pohled pro něj zvolený).

#obr("img/rozvrzeni.png", sirka: 80%, popis: [Chinin: váš současný nákres a nejlepší z nabízených nákresů])

*Nákresy z 3D modelu.* Některé nákresy vznikají z 3D modelu molekuly, který se natočí a promítne do roviny s klíny pro hloubku. Nabízejí se tam, kde jsou tím pravým obrázkem: pro klece a přemostěné kruhy (adamantan, norbornan, tropan), komplexy kovů, molekuly s rozšířeným oktetem a přechodné stavy S#sub[N]2. Jakoukoli jinou molekulu ukáže ve 3D #ui[Otočit ve 3D]. Velká molekula, třeba taxol, může trvat i deset sekund, ale stránka přitom nezamrzne.

Molekuly s jedním centrálním atomem s rozšířeným oktetem nebo s pěti a více elektronovými páry kolem sebe (PCl#sub[5], SF#sub[6], SF#sub[4], ClF#sub[3], XeF#sub[4], ClO#sub[4]#super[−], SO#sub[4]#super[2−]) dostanou tvar podle VSEPR, i s místy pro volné páry. Síran se nakreslí jako v učebnici, s dvojnými vazbami S=O v rovině papíru a O#super[−] klínem a šrafovaným klínem. Tato část je zatím experimentální (@omezeni).

== Otočit ve 3D <otoceni>

Někdy molekula nejlépe vynikne z jedné konkrétní strany. Vyberte jednu molekulu a klikněte na kostku #ik("turn3d") vedle #ui[Překreslit]. Program sestaví 3D model, což u velké molekuly chvilku trvá, a ukáže ho přesně tak, jak se nakreslí, se zadní částí bledší, aby byla vidět hloubka.

#figure(
  grid(columns: (1.15fr, 1.25fr, 1.15fr), column-gutter: 8pt, row-gutter: 5pt, align: center + horizon,
    image("img/otoceni-pred.svg", width: 100%),
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/otoceni-okno.png", width: 100%)),
    image("img/otoceni-po.svg", width: 100%),
    text(8pt, fill: seda)[po vložení], text(8pt, fill: seda)[v okně, otočený ručně], text(8pt, fill: seda)[po #ui[Použít tento pohled]],
  ),
  caption: [Bornyl-salicylát: po vložení leží můstek přes kruh; po ručním otočení vypadá bornan jako v učebnici],
  supplement: [Obr.],
  kind: image,
)

- *Tažením* molekulu otáčíte, s #kl[Shift] v rovině papíru.
- *Šipky na klávesnici* otáčejí po malých krocích, s #kl[Shift] v rovině papíru.
- #ui[Nejpřehlednější pohled] se vrátí k pohledu, který program našel jako nejlepší a na kterém také začíná.
- #ui[Tyčinkový model] (#kl[S]) ukáže místo nákresu model takový, jaký je, otočený stejně: se skutečnými délkami vazeb a úhly a se všemi vodíky. Skupiny psané zkratkou jsou rozkreslené (viz níže). Barvy a zvýraznění atomů a vazeb z kresby má také. Sloupec vedle něj určuje, jak se ukáže: #ui[Kuličky a tyčinky], #ui[Tyčinky] nebo #ui[Kalotový] (každý atom velký jako jeho van der Waalsův poloměr); vodíky #ui[všechny], #ui[malé] (ty, které model přidá, malé a blízko jejich atomů, aby vynikla kostra; ty, které jste nakreslili, zůstanou, jak jsou) nebo #ui[nic] (jen ty, které jste nakreslili), postupně klávesou #kl[H]; a zadní část bledší, nebo ne. Místo #ui[Použít tento pohled] je tu #ui[Dát na plátno], které dá vedle molekuly samotný model (@modely), a #ui[Uložit obrázek] (PNG, vedle něj SVG). #kl[Esc] okno zavře, kresba zůstane, jak byla.
- #ui[Použít tento pohled] dá nákres na plátno. #kl[Ctrl+Z] ho vrátí. Bledší zadní část je jen pomůcka v tomto okně; na plátně je běžný nákres.

#figure(
  grid(columns: (1fr, 1fr), column-gutter: 8pt, row-gutter: 5pt, align: center + horizon,
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/tycinkovy-model.png", width: 100%)),
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/tycinkovy-model-male-h.png", width: 100%)),
    text(8pt, fill: seda)[všechny vodíky], text(8pt, fill: seda)[#kl[H]: malé vodíky],
  ),
  caption: [Tyčinkový model #emph[N]-acetyl-β-D-glukosaminu, natočený jako v Haworthově projekci: se všemi vodíky a s #kl[H] s malými vodíky, aby vynikla kostra],
  supplement: [Obr.],
  kind: image,
)

*Skupiny psané zkratkou* (Ph, OMe, NHAc, OBz, i PPh#sub[3] u kovu) tyčinkový model rozkreslí na jednotlivé atomy, aby byl vidět skutečný tvar molekuly. Uhlíky, vodíky a vazby skupiny mají vlastní barvu, vysvětlenou pod modelem. Kyslík, dusík a další prvky si nechají svou obvyklou barvu, takže je hned vidět, co skupina obsahuje: v NHAc dusík a karbonylový kyslík, v benzoátu OBz oba kyslíky. #ui[Rozkreslit skupiny] (#kl[G]) je na začátku zapnuté; vypnuté ukáže každou skupinu jako jednu kuličku se zkratkou, když je model se všemi atomy nepřehledný. Obě volby, #kl[G] i #kl[H], si okno pamatuje až do zavření karty.

#figure(
  grid(columns: (1fr, 1.3fr, 1.3fr), column-gutter: 8pt, row-gutter: 5pt, align: center + horizon,
    image("img/skupiny-kresba.svg", width: 100%),
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/skupiny-model.png", width: 100%)),
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/skupiny-zkratky.png", width: 100%)),
    text(8pt, fill: seda)[nákres se zkratkou], text(8pt, fill: seda)[skupina rozkreslená], text(8pt, fill: seda)[#kl[G]: skupina jako zkratka],
  ),
  caption: [Paracetamol nakreslený se zkratkou NHAc a jeho tyčinkový model],
  supplement: [Obr.],
  kind: image,
)

Klíny se volí tak, aby R/S a E/Z zůstaly, jak jste je nakreslili, a podle vaší kresby se kontroluje i samotný 3D model. Model má i konformaci z nákresu: židlička (ze šablon, nebo nakreslená ručně a rozpoznaná) dá tutéž židličku (axiální OH zůstane axiální, i když je druhá židlička stabilnější), cyklohexan v Newmanově projekci tutéž židličku a Newmanova projekce řetězce nakreslený torzní úhel, i zákrytový. Dien nebo enon nakreslený s-cis (pro Dielsovu–Alderovu reakci) zůstane s-cis, i když je s-trans stabilnější. Když se taková konformace najít nedá, okno to napíše a ukáže jinou. Někdy pohled přehledně nakreslit nejde: klíny by neukazovaly správné R/S, nebo vazba míří skoro přímo na vás. Okno to pak napíše a z tlačítka bude #ui[Přesto použít]: molekulu trochu pootočte, nebo pohled použijte, jak je.

#grid(columns: (1fr, 5.6cm), gutter: 14pt, align: horizon,
  [Funguje to i s komplexy. Celý komplex se optimalizuje silovým polem (UFF), takže každý ligand si zachová správný tvar, chelatační ligandy jako EDTA se obtočí kolem kovu, porfyriny zůstanou rovné a kde se dvě vazby kříží, ta vzadu je přerušená. Když program pro molekulu 3D model nemá, řekne proč.],
  obr("img/otoceni-edta.png", popis: [EDTA kolem Ca#super[2+], z ploché kresby]),
)

== 3D modely na plátně <modely>

3D model molekuly může stát v kresbě vedle ní, jako obrázek, který je pořád modelem: v okně #ui[Otočit ve 3D] přepněte na #ui[Tyčinkový model] (#kl[S]), otočte ho, jak ho chcete mít, a klikněte na #ui[Dát na plátno]. Model se objeví vpravo od své molekuly a je vybraný; #kl[Ctrl+Z] ho zase odebere. Má barvy a zvýraznění své molekuly, přečtené z kresby, takže skupina zvýrazněná ve vzorci je zvýrazněná i v modelu.

#obr("img/model-platno.png", sirka: 100%, popis: [Ibuprofen a jeho 3D model na plátně, model vybraný a vpravo jeho panel])

S vybraným modelem ho panel vpravo ukáže jinak:

- #ui[Styl]: #ui[Kuličky a tyčinky], #ui[Tyčinky] nebo #ui[Kalotový];
- #ui[Vodíky]: #ui[všechny], #ui[malé] nebo #ui[nic] (jen ty, které jste nakreslili), a u molekuly se zkratkami (Ph, OAc) #ui[Zkratky] #ui[rozkreslené], nebo #ui[jako koule];
- #ui[Hloubka]: #ui[vzadu bledší], nebo #ui[stejně], a #ui[Velikost] od ½ do 2 (#ui[1]: vazba stejně dlouhá jako v kresbě);
- tři posuvníky ho otáčejí, #ui[Doleva–doprava], #ui[Dozadu–dopředu] a #ui[V rovině stránky], každý od −180° do 180° od toho, jak byl otočený, když jste ho vybrali; #ui[Otočit ve 3D…] otevře okno s modelem a #ui[Použít] v něm otočení i vzhled ponechá.

*Když se jeho molekula změní* (atom, náboj, vazba, klín nebo nakreslená konformace, třeba překlopená židlička), model zůstane takový, jaký byl sestavený, kolem něj se objeví čárkovaný rámeček a panel napíše #ui[Jeho molekula se mezitím změnila: model je, jaký byl.] #ui[Aktualizovat] ho sestaví znovu z molekuly, jaká je teď, a ukáže ho ze stejné strany jako dřív. Přesunutí molekuly ani její obarvení model nezastará.

Model je součástí kresby jako cokoli jiného: vybere se, přesune, zkopíruje (s molekulou, kopie má vlastní model), seskupí, zarovná, překlopí i otočí se zbytkem a je v panelu #ui[Objekty] (@objekty). V obrázcích a PDF je tak, jak ho vidíte. Jako model ho uchovají jen vlastní soubory olomolu (.olom) a odkazy; ostatní formáty ho vynechají a řeknou to.

== Překreslení jen části <casti>

Často je většina molekuly přesně taková, jakou ji chcete, a nepořádek je jen v jedné části: v postranním řetězci nebo ve vmáčknutém kruhu. Vyberte jen tuto část, obdélníkem, lasem nebo #kl[Shift]+kliknutím, a klikněte na #ui[Překreslit].

Okno se pak otevře s vlastním oddílem #ui[Jen vybraná část, zbytek zůstane, kde je]. V těchto nákresech se nic mimo výběr nepohne. Podle molekuly můžete vidět:

- #ui[Vybraná část překreslená 1] (2, 3…) nakreslí část znovu,
- #ui[Upravená vybraná část] zachová její tvar a jen ji upraví,
- #ui[Vybraná část beze změny, znovu připojená] ji nechá přesně tak, jak je nakreslená, a posadí ji zpět na místo, což se hodí, když jste ji odtáhli stranou.

Takhle také dostanete do 3D jen jednu část molekuly: otočte celou molekulu (@otoceni) a pak překreslete tu část, kterou chcete mít plochou. Bornyl-salicylát níže vznikl právě tak. Bornan zůstal, jak byl otočený, a salicylát, jehož kruh byl po otočení vidět šikmo, je zase plochý.

Níž #ui[Celé molekuly] nabízí obvyklé nákresy celé molekuly, kdybyste je chtěli radši. Příklad #ui[Překreslení části: zbytek zůstane, jak je nakreslený] v nápovědě ukazuje rozdíl na jedné molekule.

#figure(
  grid(columns: (1.55fr, 1fr), column-gutter: 10pt, align: center + horizon,
    box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image("img/prekresleni-casti.png", width: 100%)),
    image("img/prekresleni-po.svg", width: 100%),
  ),
  caption: [Bornyl-salicylát otočený ve 3D (@otoceni) s vybraným jen salicylátem: okno a vybraný nákres. Bornan se nepohnul],
  supplement: [Obr.],
  kind: image,
)

== Zarovnat a mřížka

#grid(columns: (1fr, 5.2cm), gutter: 14pt,
  [
    Vyberte několik molekul, klidně i šipek a textů, a otevřete #ui[Zarovnat]:

    - #ui[Zarovnat reakční schéma] udělá z vybrané reakce jednu řadu: stejné mezery, vodorovné šipky, činidla jdou se svou šipkou a texty pod molekulami jsou na jednom řádku.
    - #ui[Zarovnat] srovná levé, pravé, horní nebo dolní okraje, nebo středy.
    - #ui[Rovnoměrně rozmístit] funguje vodorovně i svisle, se stejnými vzdálenostmi středů nebo se stejnými mezerami.
    - #ui[Mřížka] rozestaví molekuly do řad. Zadejte počet #ui[Sloupce] (nebo nechte #ui[auto]), případně #ui[Mezera] mezi buňkami v délkách vazby (výchozí 1,25), a klikněte na #ui[Uspořádat do mřížky]. Mřížka zůstane tam, kde byl výběr.

    Molekuly spojené zahnutou šipkou se pohybují spolu. Text na kotvě jde vždy se svou molekulou a volné texty se zarovnávají samy.
  ],
  obr("img/zarovnat.png"),
)

== Překlopení a srovnání <preklopeni>

- #ik("flipH") a #ik("flipV") v horní liště překlopí výběr, nebo bez výběru celou kresbu. Klíny se přitom prohodí, takže molekula zůstane stejná (R zůstane R).
- *Překlopit přes vazbu* #ik("flipBond"): vyberte část molekuly, klikněte na tlačítko a pak na vazbu. Vybraná část se kolem vazby otočí jako kolem osy; bez výběru se otočí menší strana. Náhled zešedí, co se otočí, a modře ukáže, kam, a #kl[Esc] to zruší. R/S zůstává.
- *Překlopení židličky* #ik("ringFlip") udělá z jedné židličky druhou, axiální ⇄ ekvatoriální: zvolte ho pod tlačítkem projekcí v horní liště (@fischer) a klikněte na židličku (dovnitř kruhu nebo na některou jeho vazbu). Každá skupina zůstane na téže straně kruhu (nahoře, nebo dole), axiální skupina mířící nahoru se tedy stane ekvatoriální mířící nahoru a cis a trans, R/S i D nebo L zůstávají: β-D-glukosa se všemi skupinami ekvatoriálně se změní v židličku se všemi axiálně a je to pořád β-D-glukosa. Každý atom kruhu zůstane, kde byl (vlevo, vpravo, vzadu, vpředu), takže třída vidí, jak týž uhlík přejde z axiální polohy do ekvatoriální; skupina jako CH#sub[2]OH nebo fenyl se otočí jako celek. Náhled modře ukáže druhou židličku. Překlopení je animované přes vaničku (jeden hrot klesne, pak druhý stoupne); #ui[Nastavení] → #ui[Animace] to vypne. #kl[Shift]+kliknutí dá druhou židličku vedle první, mezi ně rovnovážnou šipku: obrázek do podkladů pro studenty. Další kliknutí židličku překlopí zpět; #kl[Esc] skončí.

  Překlopit jde židlička ze šablon (#ui[Šablony] → #ui[Konformace a projekce], otočená, zvětšená, zrcadlená nebo s přidanými skupinami) i nakreslená ručně, pokud ji program pozná (pod ukazatelem se zvýrazní zelenomodře). Překlopená se nakreslí ve tvaru šablony. Plochý šestičlenný kruh, šestiúhelník nebo Haworthova projekce, se změní na židličku: pod ukazatelem se zvýrazní zelenomodře a průhledně se nad ním ukáže židlička, kliknutí ji nakreslí. Každá skupina přijde do axiální nebo ekvatoriální polohy podle strany kruhu, kterou říká její klín nebo šrafovaný klín (u Haworthovy projekce nahoru, nebo dolů), takže molekula zůstane stejná. Vždy je to židlička ze šablon s levou špičkou nahoře (cukr ⁴C#sub[1], β-D-glukosa má všechny skupiny ekvatoriálně); druhou dá překlopení. Skupina, u které kresba neříká, na které straně je, přijde do ekvatoriální polohy a tam, kde sedí na stereocentru, dostane vlnovku. Kruh s dvojnou vazbou (cyklohexen) a kondenzované nebo přemostěné kruhy (dekaliny, steroidy) program odmítne a řekne proč.

  #obr("img/plochy-kruh.svg", sirka: 100%, ramecek: false, popis: [Mentol nakreslený jako plochý kruh s klíny = jeho židlička, všechny skupiny ekvatoriálně; překlopením vznikne druhá židlička se všemi skupinami axiálně a rovnováha leží na straně první])

  Překlopit jde i cyklohexan v Newmanově projekci ze šablony (viděný podél C1–C2 a C5–C4): obě projekce zůstanou na místě, C3 a C6 se přehodí na druhou stranu a každá skupina na čtyřech uhlících viděných z čela přejde do druhé polohy na téže straně kruhu, axiální ⇄ ekvatoriální. Trans-diaxiální Br a Cl tak budou diekvatoriální a ve 3D se z anti stanou gauche. Skupiny na C3 a C6 překlopení nedovolí.

  #obr("img/preklopeni.png", sirka: 100%, popis: [Překlopení židličky: pod ukazatelem druhá židlička, modře a průhledně; klik ji nakreslí])

  #obr("img/newman-preklopeni.svg", sirka: 62%, popis: [Překlopení cyklohexanu v Newmanově projekci, #kl[Shift]+kliknutím vedle původní: trans-diaxiální Br a Cl jsou teď diekvatoriální])
- *Otočit židličku* #ik("chairTurn") otočí židličku o třetinu otáčky kolem její osy, proti směru hodinových ručiček (se #kl[Shift] po směru): každý atom kruhu se posune o dva rohy dál i se svými skupinami, které zůstanou axiální nebo ekvatoriální, nahoře nebo dole. Je to stejná molekula ve stejné konformaci, jen otočená; po třech otočeních je jako na začátku. Když se plochý kruh změní na židličku s atomy na jiných rozích, než jste chtěli, otáčejte ji, dokud nebudou tam, kde je chcete mít; druhou konformaci dá překlopení.
- #ui[Vodorovně / svisle] #ik("snap") srovná vazbu. Klikněte na tlačítko a pak na vazbu: otočí se výběr, pokud je vazba v něm, jinak celá molekula. Další kliknutí na vazbu otočí o čtvrt otáčky dál. S jednou vybranou vazbou se její molekula otočí hned po stisku tlačítka.

== Fischerovy projekce a cik-cak <fischer>

Tlačítko projekcí v horní liště má čtyři nástroje: #ui[Překlopení židličky] #ik("ringFlip"), #ui[Otočit židličku] #ik("chairTurn"), #ui[Fischerova projekce] #ik("fischer") a #ui[Cik-cak] #ik("zigzag"). Ukazuje ten naposledy použitý: kliknutí ho zvolí, další kliknutí na tlačítko, na jeho roh nebo pravým tlačítkem myši otevře seznam.

- *Z klínů Fischerova projekce.* Zvolte #ui[Fischerova projekce] a klikněte na molekulu nakreslenou s klíny: nakreslí se jako její Fischerova projekce. Hlavní řetězec (ten podle IUPAC, C1 nahoře) vede svisle dolů, každé stereocentrum je křížení s vodorovnými vazbami k vám a svislými od vás a skupiny na koncích se napíšou jako CHO, CH#sub[2]OH, CO#sub[2]H, CO#sub[2]Me, CN nebo CH#sub[3]. Stereocentrum na konci hlavního řetězce je také křížení: svislá čára pokračuje jeho největší uhlíkatou skupinou, jako když učebnice kreslí efedrin s fenylem nahoře. Když na molekulu ukazujete, její projekce je nad ní vidět průhledně.
- *Na cik-cak.* #ui[Cik-cak] nakreslí hlavní řetězec molekuly, na kterou kliknete (třeba i Fischerovy projekce), jako cik-cak: C1 vlevo, každá skupina míří ven ze svého rohu a klíny zachovají každé R/S.
- *Fischerova projekce nakreslená ručně.* Nakreslete nástrojem vazby řetězec svisle dolů, každé stereocentrum jako uhlík se čtyřmi jednoduchými vazbami: jednou doleva, jednou doprava, jednou nahoru a jednou dolů (každá s odchylkou nejvýš 15°). Tak, jak je nakreslený, je to jen kresba: olomol do křížení podle jejich tvaru žádnou stereochemii nečte. Klikněte na řetězec nástrojem #ui[Fischerova projekce] a přečte se jako Fischerova projekce, vodorovné vazby k vám a svislé od vás, takže SMILES, InChI, #ui[Info], R/S i soubory dostanou stereoizomer, který ukazuje. Když na něj ukážete, jeho páteř se rozsvítí zeleně, bledě, dokud by ho kliknutí teprve přečetlo. Další kliknutí z něj udělá zase jen čáry, bez stereochemie. Dokud se čte, říká to nápis nad ním a atom, na který ukážete, se rozsvítí modře jako jinde. Křížení, které přidáte přímo nad nebo pod něj, se k němu připojí; to, které už křížením není, nebo řetězec otočený na bok se přestane číst a program to řekne.

Každý převod zachová R/S každého stereocentra a je zkontrolovaný: výsledek, který by byl jiným stereoizomerem, se nenakreslí a program řekne proč. Řekne to i tehdy, když nemůže nic udělat: stereocentrum bez klínu, hlavní řetězec, který je kruhem (prolin, cukr v cyklické formě), molekula bez stereocentra (glycin), dvojná vazba v řetězci nebo uhlík v něm s víc než dvěma skupinami.

#obr("img/fischer-cikcak.svg", sirka: 100%, ramecek: false, popis: [D-glukosa nakreslená s klíny, jako Fischerova projekce (#ui[Fischerova projekce]) a znovu jako cik-cak (#ui[Cik-cak]): pokaždé týž stereoizomer])

= Číslování atomů a karta Info <cislovani>

== Číslování IUPAC

#grid(columns: (1fr, 7.4cm), gutter: 14pt,
  [
    Vyberte molekulu a v panelu zaškrtněte #ui[Číslování IUPAC]. Hlavní řetězec nebo cyklus se očísluje podle pravidel IUPAC (doporučení z roku 2013) a čísla se přepočítají po každé změně: když na druhý konec hexanu přidáte Cl, C1 se přesune tam. Panel napíše, které pravidlo rozhodlo, například #ui[Číslováno tak, aby hlavní skupina (hydroxy (OH)) dostala nejnižší lokant: 2, ne 4.]

    Program umí vybrat hlavní řetězec nebo cyklus: podle nejvyšší hlavní skupiny (kyselina > ester > acylhalogenid > amid > nitril > aldehyd > keton > alkohol > thiol > amin), cyklus má přednost před řetězcem a pak rozhoduje nejdelší řetězec s nejvíce násobnými vazbami a substituenty.

    Nejnižší lokanty dává heteroatomům v cyklu, hlavní skupině, násobným vazbám (dvojná před trojnou) a substituentům, nakonec rozhoduje abeceda (české názvy česky). Čísluje se jen základ, jako v názvu.
  ],
  obr("img/cislovani.png"),
)

== Vlastní čísla

Kondenzované, přemostěné a spiro cykly (naftalen, steroidy) mají vlastní číslování, které program neurčuje. Pro ně, a třeba pro přiřazení signálů v NMR, je tu nástroj čísla atomů #ik("atomNumber"), varianta nástroje text. Klikejte na atomy v pořadí, v jakém je chcete očíslovat; další kliknutí číslo odebere.

Číslo jednoho atomu změníte v poli #ui[Číslo] v panelu, všechna najednou smaže #ui[Odebrat vlastní čísla]. Čísla se ukládají do souborů olomolu, do odkazů a do obrázků.

== Karta Info <info>

#grid(columns: (1fr, 6.6cm), gutter: 14pt,
  [
    Vyberte molekulu a v panelu klikněte na #ui[Info] vedle vzorce. Vedle panelu se otevře karta s čísly, která se hodí do protokolu nebo experimentální části:

    - #ui[Molární hmotnost] a #ui[Přesná hmotnost],
    - ionty pro HRMS: \[M+H\]#super[+], \[M+Na\]#super[+] a \[M−H\]#super[−] (u iontu \[M\]#super[+]),
    - #ui[Elem. analýza (vypočt.)] pro C, H, N a S,
    - SMILES, InChI a InChIKey.

    *Kliknutím na řádek ho zkopírujete.* Dostanete jen vzorec, ion a číslo, bez slov, takže se hodí do protokolu v jakémkoli jazyce: například `C9H8O4 [M+H]+ 181.0495` nebo `C9H8O4: C 60.00, H 4.48`. Pak ho stačí vložit do textu.

    Vše na kartě se počítá ve vašem počítači. Karta se zavře, když vyberete jinou molekulu nebo kliknete na prázdné plátno.
  ],
  obr("img/info.png"),
)

== Hledání sloučeniny na PubChemu <pubchem>

#ui[Stránka na PubChemu] na kartě Info otevře stránku sloučeniny v databázi PubChem. Je to jediná věc na kartě, která něco posílá ven: InChIKey molekuly, podle kterého ji PubChem najde, a když PubChem nemá přesnou shodu, i její SMILES.

Co nakreslíte, nemusí být přesně to, co má PubChem. Třeba jste nechali stereocentrum neurčené nebo jste nakreslili izotop. olomol pak nehádá, ale ukáže stránku s kartami kandidátů, každou s obrázkem z PubChemu, názvem a číslem. Kliknutím na kartu přejdete na tu sloučeninu. Nadpis říká, v čem se liší:

- #ui[Stereochemie není úplně určená]: PubChem ji má přesně tak, jak jste ji nakreslili (první karta, označená #ui[jak je nakreslená]), a ostatní určují víc, v souladu s vaší kresbou. Často je to některá z nich, co jste mysleli.
- #ui[Žádná přesná shoda pro tuto stereochemii]: přesnou shodu PubChem nemá, ale tyto sloučeniny souhlasí se stereocentry, která jste nakreslili.
- #ui[Tento stereoizomer na PubChemu není]: tyto sloučeniny mají stejnou konstituci, ale jinou stereochemii.
- #ui[Žádná přesná shoda pro toto izotopové značení]: tyto sloučeniny mají stejnou konstituci, ale jiné značení nebo žádné.

#obr("img/pubchem-karty.png", sirka: 72%, popis: [Alanin nakreslený bez stereochemie: PubChem má DL-alanin a také L- a D-alanin])

Když PubChem nemá vůbec nic, stránka to řekne a nabídne #ui[Hledat na PubChemu].

= Barvy a zvýraznění <barvy>

== Barva

*Barva* mění čáry a písmo. Vyberte atomy, vazby, šipky nebo text a v panelu klikněte na barvu v části #ui[Barva]; přeškrtnuté kolečko je #ui[Výchozí barva]. Nebo použijte nástroj #ik("barva") vlevo dole, s deseti barvami ve variantách, a klikejte nebo orámujte, co se má obarvit.

Duhové kolečko na konci barev (#ui[Další barvy nebo kód barvy]) otevře větší výběr: řádek #ui[Naposledy použité], mřížku #ui[Barvy] a pole pro kód barvy (`#cc0055`, `#c05`, `rgb(204, 0, 85)` nebo název jako `teal`; #kl[Enter] ho použije). Kolečko vedle pole otevře výběr barvy systému. Použité barvy si program pamatuje a nabídne je pak i mezi barvami nástroje a panelu.

Když v #ui[Nastavení] přepnete #ui[Barvy atomů] na #ui[Černé], prvky se kreslí černě, ale vaše vlastní barvy zůstanou, takže červené šipky na černých strukturách zůstanou červené.

== Zvýraznění a vyplněné kruhy

#grid(columns: (1fr, 6.8cm), gutter: 14pt,
  [
    *Zvýraznění* je měkký barevný podklad za atomy a vazbami, jak ho kreslí RDKit. Hodí se k označení skupiny, reakčního centra nebo společné části několika molekul.

    Použijte zvýrazňovač #ik("zvyraznovac") úplně dole vlevo, s osmi barvami. Klikněte na atomy a vazby nebo je orámujte; další kliknutí zvýraznění zruší. V panelu je totéž v části #ui[Zvýraznění] a i tady duhové kolečko nabízí další, světlé barvy. Pod barvami udělá #ui[Vzor] zvýraznění #ui[šrafované], #ui[čáry] nebo #ui[tečky], každé v jeho barvě, aby se zvýraznění rozlišila i bez barvy: černobíle nebo pro barvoslepé čtenáře.

    *Kliknutí dovnitř kruhu kruh vyplní* barvou. Kolem napsaných atomů (O, N, CH#sub[2]) zůstane kulatý výřez, aby barva nešla přes písmena.

    Nástrojem výběr #ik("select") kliknutí do vyplněného kruhu vybere kruh, dvojklik celou molekulu a tažením ji posunete. Menší zvýraznění leží vždy nad větším (oranžová odlišnost nad modrou společnou částí).
  ],
  obr("img/zvyrazneni.png", popis: [Vyplněný kruh, zvýrazněný ester a červeně obarvená kyselina]),
)

Vyplnění zmizí, když kruh rozbijete smazáním atomu nebo vazby kruhu. Jinak ho odstraníte variantou #ui[Bez zvýraznění] zvýrazňovače (kliknutím do kruhu), gumou (kliknutím do kruhu), nebo #ui[Bez zvýraznění] v panelu, když jsou vybrané všechny atomy kruhu.

== Příklad: co mají molekuly společného

#obr("img/katecholaminy.svg", sirka: 72%, ramecek: false, popis: [Katecholaminy a příbuzná léčiva: společná část modře, hlavní odlišnost salbutamolu oranžově, skupiny na dusíku fialově])

L-DOPA, dopamin, noradrenalin a adrenalin vznikají v těle jeden z druhého, isoprenalin a salbutamol jsou léčiva. Společná část, fenol s řetězcem C–C–N, je *zvýrazněná modře* a ve všech molekulách stejně natočená. Salbutamol, lék na astma, má *oranžově zvýrazněnou* hlavní odlišnost: místo jedné skupiny OH má CH#sub[2]OH, takže ho enzym COMT neodbourává a působí hodiny, ne minuty. Skupiny na dusíku jsou *obarvené fialově* nástrojem #ui[Obarvit]: čím větší skupina, tím víc látka působí na β-receptory.

Takový obrázek vytvoříte takto:

+ Nakreslete první molekulu, zkopírujte ji (#kl[Ctrl+C], #kl[Ctrl+V]) a kopii upravte. Společná část tak zůstane všude stejně natočená, což by u molekul vložených ze SMILES neplatilo.
+ Vyberte vše, v #ui[Zarovnat] zadejte 3 #ui[Sloupce] a klikněte na #ui[Uspořádat do mřížky].
+ Společnou část vyberte (tažením obdélníku, #kl[Shift]+kliknutím) a v panelu klikněte na modré #ui[Zvýraznění]. Stejně to udělejte s oranžovou pro odlišnost.
+ Skupiny na dusíku obarvěte nástrojem #ik("barva") nebo v panelu přes #ui[Barva].

= Soubory, karty, export a odkazy <soubory>

Cesta ven z olomolu záleží na tom, co chcete dělat dál:

#[
#set par(justify: false)
#set text(9pt)
#table(columns: (auto, 1fr), stroke: none, inset: (x: 5pt, y: 2.5pt),
  fill: (_, y) => if calc.odd(y) { akcent-svetly } else { none },
  table.header([*Chcete…*], [*Použijte*]),
  [dál pracovat na kresbě později], [#ui[Uložit] (#kl[Ctrl+S]): kresba olomolu (.olom) se vším všudy],
  [dát ji do Wordu, PowerPointu nebo Dokumentů Google], [#ui[Kopírovat jako obrázek] (#kl[Ctrl+Shift+C]), pak tam #kl[Ctrl+V]],
  [vytisknout ji nebo z ní udělat PDF], [#ui[Export] → #ui[PDF / Tisk…]],
  [dál ji upravovat v Inkscapu], [#ui[SVG]],
  [poslat ji kolegovi nebo studentům], [#ui[Kopírovat odkaz], nebo soubor .olom],
  [ukázat ji na přednášce], [#ui[Promítat] #ik("present") (@promitani)],
  [otevřít ji v programu Ketcher], [#ui[Soubor se strukturou]: KET],
  [otevřít ji v ChemDraw nebo jiném chemickém programu], [#ui[Soubor se strukturou]: Molfile, SDF, SMILES nebo InChI],
  [začít z ní výpočet], [#ui[Soubor se strukturou]: XYZ],
)
]

== Uložit a otevřít

#ui[Uložit] #ik("save") (#kl[Ctrl+S]) uloží kresbu jako *kresbu olomolu*, soubor `.olom`. Ten se tu zase otevře se vším: volnými páry, zahnutými šipkami, barvami, zvýrazněním, čísly, skupinami i stylem kresby. Pro vlastní práci je to nejlepší volba. (Název je zkratka anglického #strong[O]lomol #strong[L]ayout #strong[O]bject #strong[M]odel, tedy model rozvržení objektů olomolu; víc v @data-soubory.)

Jako v textovém editoru zná kresba svůj soubor. V Chromu a Edgi ji #kl[Ctrl+S] zapíše zpět do téhož souboru bez ptaní (prohlížeč se jednou za návštěvu zeptá, zda smí), a #kl[Ctrl+Shift+S] (#ui[Uložit jako]) se zeptá na nový název a složku. Tečka na tlačítku uložení a na kartě kresby znamená změny, které ještě nejsou v souboru. Soubor, který zapsal jiný program (KET, CDXML, molfile), se nikdy nepřepíše: #kl[Ctrl+S] se pak zeptá, kam kresbu uložit jako .olom. Pokud se soubor od otevření změnil (v jiném programu nebo jiné kartě), olomol se před přepsáním zeptá. Firefox a Safari do souborů zapisovat neumějí, takže je stahují: poprvé pod názvem, který zadáte, pak znovu pod týmž, do složky stažených souborů.

#ui[Otevřít] #ik("open") (#kl[Ctrl+O]) přečte kresby olomolu (.olom), KET, molfile, SDF, SMILES, RXN, CDXML a CDX (ChemDraw), CML a XYZ. Obrázek exportovaný z olomolu (SVG nebo PNG) nese kresbu v sobě, takže se otevře zase jako kresba, ne jako obrázek. Jakmile jste už nějaké soubory otevřeli, nabídne #ui[Otevřít] nejdřív *nedávné soubory* a pod nimi #ui[Otevřít soubor z tohoto počítače…]. Soubory jde i přetáhnout do okna a nainstalovaná aplikace (@instalace) otevírá soubory .olom přímo ze správce souborů.

Kresba (.olom, KET, reakce, CDXML) se otevře ve vlastní kartě (@karty). Soubor jen s molekulami (molfile, SDF, SMILES, XYZ) se vloží do kresby, kterou máte, jako šablona: klikněte, kam má přijít, nebo skončí tam, kam jste ho přetáhli. Ze souborů ChemDraw zůstanou zkratky (OMe, OTBS, Et) zkratkami, vodíky napsané u atomu zůstanou tak, jak jsou napsané, a místo připojení (vlnovka přes vazbu) se stane R. Reakce ze souboru RXN se srovná jako přes #ui[Zarovnat reakční schéma], činidla na šipku. Soubor XYZ z kvantově chemického programu nemá vazby, takže je program doplní podle vzdáleností atomů, určí řády vazeb a stereochemii a molekulu nakreslí ve 2D.

== Více kreseb: karty <karty>

#obr("img/karty.png", sirka: 60%, popis: [Tři otevřené kresby: úloha a její řešení otevřené z odkazu a kresba, která tu už byla])

Každá kresba se otevře ve vlastní kartě, s vlastním krokem zpět, souborem i zobrazením, takže úloha a její řešení nebo schéma a molekuly k němu leží vedle sebe. Karty se objeví pod horní lištou, jakmile jsou kresby dvě; název kresby je pak na její kartě.

- Kliknutí na kartu ukáže její kresbu, dvojklik na kartu vpředu ji přejmenuje a kartu přetažením přesunete mezi ostatními.
- #ik("close") na kartě nebo kliknutí prostředním tlačítkem kresbu zavře; má-li změny, které nejsou v souboru, olomol se nejdřív zeptá. + na konci karet (nebo #ik("newDoc")) začne novou kresbu.
- Pravé tlačítko na kartě nabídne #ui[Duplikovat kresbu] (kopii v nové kartě, třeba z úlohy pro její řešení), #ui[Přejmenovat] a #ui[Zavřít].
- V nainstalované aplikaci přepínají #kl[Ctrl+Tab] a #kl[Ctrl+Shift+Tab] na další a předchozí kresbu (v prohlížeči tyto klávesy patří jeho vlastním kartám).

Všechny otevřené kresby se uchovávají a příště jsou zpátky (@ulozeni). Příklad #ui[Úloha a její řešení: karty a Promítat] v nápovědě to všechno ukazuje na jedné úloze.

== Promítání: kresby přes celou obrazovku <promitani>

#ui[Promítat] #ik("present"), poslední tlačítko horní lišty, ukáže otevřené kresby přes celou obrazovku, bez lišt a panelů, každou zvětšenou na celou plochu: přesně pro přednášku nebo seminář. #kl[→], #kl[↓], #kl[Mezerník] nebo #kl[Page Down] (co posílá prezentér) ukáže další kresbu, #kl[←], #kl[↑] nebo #kl[Page Up] předchozí, #kl[Home] a #kl[End] první a poslední. Když pohnete myší, objeví se dole malá lišta s číslem a názvem kresby a tlačítky zpět a dál. #kl[Esc] vás vrátí ke kreslení a každá kresba je, jak byla. Mezitím nejde nic měnit; kolečko myši ale dál zvětšuje.

Dejte každý krok do vlastní karty, napřed úlohu a za ni řešení, a promítání je projde popořadě.

== Export obrázků a souborů

#grid(columns: (1fr, 3.4cm), gutter: 12pt,
  [
    Nabídka #ui[Export] v horní liště nabízí:

    - #ui[SVG] (#ui[vektorový, pro Inkscape]): čistý vektorový obrázek, ve kterém text zůstane textem. Nejlepší volba pro tisk, plakáty a další úpravy.
    - #ui[PNG] (#ui[4× rozlišení]): obrázek v rastru s průhledným pozadím, nebo bílým, když zaškrtnete #ui[Bílé pozadí]. Nese svou velikost, takže ho Word a PowerPoint vloží tak velký, jak určuje styl kresby.
    - #ui[Kopírovat jako obrázek] (#kl[Ctrl+Shift+C]): PNG do schránky a vedle něj SVG pro programy, které ho umějí; průhledný nebo s #ui[Bílé pozadí].
    - #ui[PDF / Tisk…]: kresba sama na stránce, ve velikosti podle svého stylu a menší jen tehdy, když se nevejde, široká na šířku. V okně tisku prohlížeče zvolte #ui[Uložit jako PDF] pro vektorové PDF, nebo tiskárnu.
    - #ui[Kopírovat odkaz]: viz @odkazy.
    - #ui[Soubor se strukturou]: KET (pro Ketcher), Molfile, SDF, SMILES, InChI a XYZ (3D souřadnice). U formátu nabídka napíše, co z kresby neudrží (#ui[bez: zahnuté šipky, barvy…]).

    Když je něco vybrané, je zaškrtnuté #ui[Jen výběr] a exportuje se jen výběr. Odškrtnutím exportujete celou kresbu.

    Obrázky SVG a PNG z olomolu nesou neviditelně v sobě i kresbu, takže #ui[Otevřít] nebo přetažení obrázku do okna vrátí samotnou kresbu. Program, který obrázek upravuje, ji může zahodit, a obrázek zkopírovaný do schránky ji nemá.

    Soubory se strukturou nesou atomy, polohy, náboje, izotopy, radikály a klíny ve standardních formátech. Jejich čtení zpět je vyzkoušené v olomolu, v RDKit a v Indigu, ne v jiných programech. *Volné páry, zahnuté šipky, závorky, částečné vazby a barvy se ale zachovají jen ve vlastních souborech olomolu, v odkazech a v obrázcích.* KET jich pro Ketcher udrží nejvíc: zkratky jako jeho skupiny a Haworthovy a Fischerovy projekce i se stereochemií jako klíny.

    Soubor *XYZ* obsahuje 3D souřadnice se všemi vodíky. Je to výchozí geometrie pro výpočty (Gaussian, ORCA a podobně), optimalizovaná jen silovým polem, ne kvantovou chemií. Komplex kovu se postaví stejně jako v #ui[Otočit ve 3D], celý optimalizovaný univerzálním silovým polem (UFF) na svém koordinačním mnohostěnu; UFF dává vazby kov–ligand o něco kratší než skutečné (Zn–N v ZnTPP 1,95 Å místo 2,04 Å). Komplex, který #ui[Otočit ve 3D] postavit neumí (ferrocen), se do souboru nezapíše a program napíše proč. Souřadnice se počítají na pozadí: panel ukazuje, že výpočet běží, a vy můžete kreslit dál. Až budou hotové, uložíte je tlačítkem #ui[Uložit soubor XYZ], a to pro kresbu v podobě, v jaké byla při zadání. Jako název souboru se nabídne InChIKey molekuly, takže se soubory z jedné kresby navzájem nepřepíší. Všimněte si upozornění na stereocentra bez nakresleného R/S: soubor pak obsahuje jen jeden z možných stereoizomerů.
  ],
  obr("img/export.png"),
)

== Do Wordu, PowerPointu a Dokumentů Google

Vyberte, co chcete přenést, nebo nic, pak se vezme celá kresba. Stiskněte #kl[Ctrl+Shift+C], nebo zvolte #ui[Export] → #ui[Kopírovat jako obrázek], a pak ve Wordu, PowerPointu nebo Dokumentech Google stiskněte #kl[Ctrl+V].

Nejostřejší je v tištěné práci SVG: Word i PowerPoint ho vloží (Vložení → Obrázky) a při zvětšení se nerozmaže. Pro časopis zvolte nejdřív jeho styl (#ui[Nastavení] → #ui[Styl]: #ui[ACS], #ui[RSC] nebo vlastní, @nastaveni) a obrázky vyjdou ve velikosti, jakou žádá.

== Odkazy <odkazy>

#ui[Export] → #ui[Kopírovat odkaz] vytvoří odkaz, ve kterém je *celá kresba přímo uložená*, za znakem \#, který prohlížeč na server neposílá. Kdo ho otevře, uvidí vaši kresbu a jeho vlastní se mu vrátí přes #kl[Ctrl+Z]. Dlouhé odkazy některé chatovací programy zkrátí; pak pošlete soubor .olom.

*Odkaz se strukturou.* Odkaz může také říct, jakou strukturu nakreslit, napsaný ručně, v pracovním listu nebo chatbotem: `olomol.org/#smiles=CCO` nakreslí ethanol, `#name=caffeine` vyhledá název na PubChemu a fungují i `#inchi=…` a `#cid=2244`. `&title=…` kresbu pojmenuje a víc struktur se otevře každá ve vlastní kartě, popořadě: `#title=Úloha&smiles=C=CC.Br&title=Řešení&smiles=CC(Br)C` je úloha a za ní její řešení, připravené pro #ui[Promítat]. Reakční SMILES (výchozí látky`>`činidla`>`produkty) se nakreslí jako reakce. Nainstalovaná aplikace nemá adresní řádek: takový odkaz vložte do vyhledávacího řádku (@nazev). Chatboti se psát takové odkazy naučí z `olomol.org/llms.txt`.

== olomol ve vlastní stránce <vlozeni>

olomol jde vložit do vlastní webové stránky, třeba stránky kurzu, blogu nebo webu s cvičeními, jen s nástroji, které zvolíte: `olomol.org/embed.html?only=curved-arrows#smiles=CC(=O)O.OCC` je editor jen se zahnutými šipkami, na kyselině octové a ethanolu. Adresa říká zapnuté části (`only=`) nebo vypnuté (`off=`), kresbu za \# jako v odkazu a `readonly` pro kresbu jen k prohlížení. Cokoli vypnutého se odmítne, ať o to žádá cokoli. Takový editor nemá karty, soubory, nápovědu ani nastavení a v prohlížeči nic neuchovává.

#ui[Export] → #ui[Vložit do stránky…] to napíše za vás ve třech krocích. Nejdřív co v editoru půjde dělat: #ui[Zahnuté šipky], #ui[Kreslení struktur], #ui[Všechno] nebo #ui[Jen k prohlížení], nebo části jednotlivě v jejich skupinách (když na ni ukážete, řekne, co to je); PubChem pod #ui[Mimo olomol] je volba sama pro sebe, protože tam jde, co se do editoru napíše. Potom čím začne: #ui[Tato kresba], #ui[Výběr], nebo #ui[Prázdná], a výška. Nakonec zkopírujte kód. #ui[Bez kódu] dá iframe, který se vloží do kterékoli stránky, která přijímá HTML, i do stránky v Moodlu: kreslit v něm může kdokoli, ale stránka nevidí, co se nakreslilo, takže se hodí pro obrázek k otáčení a zvětšování nebo pro cvičení, jehož řešení je jinde. #ui[Vyzkoušet] ukáže editor přímo v okně, tak jak ho kód vloží do stránky, s jeho výškou i nástroji, a mění se s tím, co změníte.

#obr("img/vlozeni.png", sirka: 80%, popis: [Adresa výše ve stránce: jen výběr, guma a zahnutá šipka, jedna šipka nakreslená])

Pro stránku, která čte, co se nakreslilo, dává `olomol.org/embed.js` prvek `<olomol-editor>` a volání, která vrátí kresbu jako data: zahnuté šipky podle atomů, na kterých začínají a končí, SMILES, InChI, krok zapsaný stejně, ať je nakreslený jakkoli (k porovnání odpovědi se správnou), a na které atomy se kliklo. olomol předá data; jestli je odpověď správná, rozhodne stránka. Všechno je popsané v příloze B příručky na webu, `olomol.org/cs/manual.html#embedding` (anglicky).

= Nastavení a klávesové zkratky <nastaveni>

== Vzhled kresby, jazyk a okno

#grid(columns: (1fr, 3.2cm, 3.2cm), column-gutter: 12pt, align: horizon,
  [Vzhled nejvíc mění, jak se kreslí *náboje*, *volné páry* a *barvy atomů*. Vpravo je tentýž glycin ve výchozím vzhledu a s náboji v kroužku, volnými páry jako čárky (Lewis) a černými atomy. Styl, náboje a volné páry patří ke kresbě a ukládají se do jejího souboru; ostatní nastavení platí pro všechny kresby. Všechno se projeví i v exportovaných obrázcích.],
  figure(image("img/styl-vychozi.svg", width: 100%), caption: text(8pt)[výchozí], supplement: none, numbering: none),
  figure(image("img/styl-lewis.svg", width: 100%), caption: text(8pt)[#text(font: "Noto Sans Math")[⊕ ⊖], čárky, černé], supplement: none, numbering: none),
)

#grid(columns: (1fr, 5.2cm), gutter: 14pt,
  [
    #ui[Nastavení] (#ik("settings") vpravo nahoře):

    *Kresba*
    - #ui[Styl] této kresby: #ui[Obrazovka], #ui[ACS] (ACS Document 1996 z ChemDraw: vazby 14,4 pt, čáry 0,6 pt, Arial 10 pt), #ui[RSC] (12,2 pt, 0,5 pt, Arial 7 pt), #ui[Prezentace] (silnější, pro projektor) nebo #ui[Vlastní…] (viz níže). Obrázky a PDF vyjdou ve velikosti podle stylu.
      - #ui[Náboje]: #ui("+ −"), nebo v kroužku #text(font: "Noto Sans Math")[⊕ ⊖].
      - #ui[Volné páry]: #ui[Tečky ··], nebo #ui[Čárky (Lewis)].
      - #ui[Použít pro nové kresby] (je tam, když se styl této kresby liší): v tomto stylu začnou nové kresby i soubory, které styl neříkají.
    - #ui[Barvy atomů]: #ui[Podle prvku], nebo #ui[Černé] (vlastní barvy zůstanou).
    - #ui[Uhlíky]: CH#sub[3], #ui[Jen čára], nebo #ui[Všechny C] pro nové kresby.
    - #ui[Aromáty]: #ui[Kroužek], nebo #ui[Čárkovaně] (kroužek čárkovaný).
    - #ui[Koordinace]: #ui[→] (šipka od donoru), nebo #ui[Čára] (obyčejné čáry, jak se komplexy často kreslí); do hloubky jsou to klíny tak jako tak.
    - #ui[Pojítka]: #ui[skryté], nebo #ui[zobrazené] (neviditelná pojítka z #ui[Jedna sloučenina], jen na obrazovce).
    - #ui[Nové šipky]: barva nových zahnutých šipek.

    *Okno*
    - #ui[Jazyk]: tlačítka s vlajkami EN, CS, DE. Bez volby se vezme jazyk prohlížeče, a když ho program nemá, angličtina. Stránka se znovu načte a kresba i s jejím zvětšením a polohou zůstane. Šablony jdou hledat česky i anglicky; PubChem zná jen anglické názvy. Jazyk vybere i konec adresy: `?lang=cs`, `?lang=en` nebo `?lang=de`.
    - #ui[Vzhled]: #ui[Auto] (podle systému), #ui[Světlý], nebo #ui[Tmavý].
    - #ui[Animace]: #ui[Zap.] nebo #ui[Vyp.], krátké animace jako překlopení židličky. Dokud nevyberete, řídí se systémem: vypnuté, když systém žádá méně pohybu.
    - #ui[Ladění]: ladicí režim ukazuje, jak program rozhodl (metody rozvržení, rámečky popisků, kandidáty šipek). Je pro vývojáře, ale když hlásíte chybu v kreslení, může pomoct snímek obrazovky s ním.
  ],
  obr("img/nastaveni.png"),
)

#grid(columns: (1fr, 8.4cm), gutter: 14pt, align: horizon,
  [*Vlastní styl.* #ui[Vlastní…] otevře okno #ui[Styl kresby] pro rozměry, které žádá časopis nebo vaše skupina, v bodech: #ui[Délka vazby], #ui[Čáry], #ui[Tučné vazby, klíny], #ui[Rozestup šrafování], #ui[Okraj kolem popisků], #ui[Popisky a texty] a #ui[Písmo], bezpatkové (Arial) nebo patkové (Times). #ui[Vyjít z] vyplní ACS 1996 nebo RSC jako výchozí bod. Molekula vedle se při psaní kreslí ve skutečné velikosti; #ui[Použít] dá kresbě tento styl. Příklad #ui[Vzhled podle časopisu: ACS, RSC nebo vlastní styl] v nápovědě ukazuje jednu kresbu v každém.],
  obr("img/styl-vlastni.png"),
)

== Klávesové zkratky <klavesy>

Přehled ukáže také klávesa #kl[?] nebo #ui[Klávesové zkratky] v nápovědě (@pomoc). Písmena a číslice dělají něco jiného podle toho, co je pod myší: atom, vazba, nebo prázdné místo.

#let tabulka(nadpis, radky) = block(below: 1em, breakable: false)[
  #text(weight: "bold", fill: akcent, nadpis)
  #v(-0.3em)
  #set par(justify: false)
  #table(columns: (auto, 1fr), stroke: none, inset: (x: 4pt, y: 3pt),
    ..radky.flatten())
]

#grid(columns: (1fr, 1fr), column-gutter: 16pt,
  [
    #tabulka([Nad atomem], (
      (kl[C N O S P F H I], [změní prvek]),
      ([#kl[L] #kl[B]], [Cl, Br]),
      ([#kl[+] #kl[−]], [náboj]),
      (kl[.], [nepárový elektron (znovu: dva u sebe, pak žádný)]),
      (kl[:], [volné páry zap./vyp.]),
      (kl[Del], [smaže ho]),
    ))
    #tabulka([Nad vazbou], (
      ([#kl[1] #kl[2] #kl[3]], [jednoduchá, dvojná, trojná]),
      ([#kl[1] znovu], [plný klín, šrafovaný klín, oba z druhého konce, obyčejná]),
      (kl[Shift+1], [totéž pozpátku]),
      (kl[D], [koordinační vazba, znovu vodíková, znovu částečná]),
      (kl[Del], [smaže vazbu]),
    ))
    #tabulka([S výběrem (ukazatel nad ním nebo nad prázdným místem)], (
      ([#kl[+] #kl[−]], [náboj všech vybraných atomů]),
      ([#kl[1] #kl[2] #kl[3]], [všechny vybrané vazby jednoduché, dvojné, trojné]),
      (kl[:], [volné páry vybraných atomů zap./vyp.]),
    ))
    #tabulka([V okně Otočit ve 3D], (
      ([Šipky], [otočit (Shift: v rovině stránky)]),
      (kl[S], [tyčinkový model a zpět]),
      (kl[G], [v tyčinkovém modelu: rozkreslit skupiny]),
      (kl[H], [v tyčinkovém modelu: malé vodíky]),
      (kl[Enter], [#ui[Použít tento pohled]]),
      (kl[Esc], [zavřít okno]),
    ))
    #tabulka([Při psaní textu], (
      ([#kl[Enter] #kl[Esc]], [dokončit]),
      (kl[Shift+Enter], [nový řádek]),
      ([#kl[Ctrl+,] #kl[Ctrl+.]], [dolní, horní index]),
      ([#kl[Ctrl+B] #kl[Ctrl+I]], [tučně, kurzívou]),
    ))
  ],
  [
    #tabulka([Nástroje (ukazatel nad prázdným místem)], (
      (kl[V], [#ik("select") výběr]), (kl[E], [#ik("erase") guma]),
      (kl[N], [kreslit dusíkem (stejně O, S, P, F, H, I, L = Cl, B = Br; C: zase uhlík)]),
      (kl[1], [#ik("single") jednoduchá vazba (znovu: plný klín, znovu: šrafovaný klín)]),
      (kl[2], [#ik("double") dvojná vazba]), (kl[3], [#ik("triple") trojná vazba]),
      (kl[Z], [#ik("chain") řetězec (cik-cak)]),
      (kl[R], [#ik("benzene") benzen (znovu: další kruh, 3- až 8členný)]), (kl[5], [5členný kruh]), (kl[6], [6členný kruh]),
      (kl[+], [#ik("plusCharge") kladný náboj]), (kl[−], [#ik("minusCharge") záporný náboj]),
      (kl[.], [#ik("radical") nepárový elektron]), (kl[:], [#ik("pairs") volné páry]),
      (kl[A], [#ik("curve") zahnutá šipka (elektronový pár)]),
      (kl[Shift+A], [#ik("fishhook") půlšipka (jeden elektron)]),
      (kl[Shift+T], [#ui[Šablony]]),
      (kl[X], [#ik("rxn") reakční šipka]), (kl[T], [#ik("text") text]), (kl[K], [#ik("bracket") závorky]),
      (kl[D], [#ik("dative") koordinační vazba, znovu vodíková, znovu částečná]),
    ))
    #tip(nadpis: "Česká klávesnice")[Číslice fungují podle polohy klávesy, i v horní řadě české klávesnice. #kl[+] nad atomem zvýší náboj i tam; nástroj kladného náboje vyberte klávesou #kl[+] na numerické části klávesnice.]
  ],
)
#tabulka([Kdekoli], (
  (kl[Esc], [zrušit; znovu: nástroj výběr; znovu: nic vybraného; znovu: obdélník nebo laso]),
  ([#kl[Ctrl+Z] #kl[Ctrl+Shift+Z] #kl[Ctrl+Y]], [zpět, znovu]),
  ([#kl[Ctrl+C] #kl[Ctrl+X] #kl[Ctrl+V]], [kopírovat, vyjmout, vložit (i SMILES a molfile)]),
  (kl[Ctrl+Shift+C], [kopírovat jako obrázek (PNG), pro Word, PowerPoint, Dokumenty]),
  (kl[Ctrl+A], [vybrat vše]),
  ([#kl[Ctrl+G] #kl[Ctrl+Shift+G]], [seskupit výběr, rozdělit skupinu (o jednu úroveň)]),
  ([#kl[Ctrl]+kliknutí], [skupina (znovu: skupina kolem ní); #kl[Ctrl]+tažení ji posune, #kl[Ctrl]+tažení obdélníku vezme celé skupiny]),
  (kl[Del], [smazat výběr]),
  ([Šipky], [posunout výběr (Shift: dál)]),
  ([#kl[Ctrl+S] #kl[Ctrl+O]], [uložit, otevřít]),
  (kl[Ctrl+Shift+S], [uložit jako jiný soubor]),
  ([#kl[Ctrl+Tab] #kl[Ctrl+Shift+Tab]], [další kresba, předchozí (v nainstalované aplikaci)]),
  ([#kl[Ctrl]+kolečko], [přiblížit]),
  ([mezerník+tažení], [posunout]),
  (kl[/], [vyhledávací řádek: název, SMILES, InChI nebo co chcete udělat]),
  (kl[?], [tento přehled]),
))
#tabulka([Při promítání], (
  ([#kl[→] #kl[↓] #kl[Mezerník] #kl[Page Down]], [další kresba]),
  ([#kl[←] #kl[↑] #kl[Page Up]], [předchozí]),
  ([#kl[Home] #kl[End]], [první, poslední]),
  (kl[Esc], [zpět ke kreslení]),
))

= Instalace, omezení a hlášení chyb

== Instalace jako aplikace a práce offline <instalace>

#grid(columns: (1fr, 3.8cm), gutter: 14pt,
  [
    Po prvním otevření funguje olomol *i bez internetu*, protože prohlížeč si všechny jeho soubory pamatuje. Bez připojení nefunguje jen hledání na PubChemu.

    *Nainstalovaný jako aplikace* má vlastní okno a ikonu na ploše nebo v nabídce Start a otevře se hned:

    - *Chrome a Edge:* použijte tlačítko #ik("install") vpravo nahoře (první ikona na obrázku), nebo ikonu instalace v adresním řádku.
    - *Firefox v Linuxu* ho jako aplikaci nainstalovat neumí, ale program v něm normálně funguje v okně prohlížeče, i offline.
  ],
  [
    #obr("img/instalace.png")
  ],
)

== Známá omezení <omezeni>

olomol je zkušební verze. Tohle zatím neumí, nebo umí jen zčásti:

- *Firefox v Linuxu* neumí program nainstalovat jako aplikaci. Použijte Chrome nebo Edge, nebo pracujte v okně prohlížeče.
- *Nákresy komplexů kovů a molekul s rozšířeným oktetem* z 3D modelu v #ui[Překreslit] jsou experimentální: někdy vypadají zvláštně nebo se vůbec nenabídnou. Export XYZ je jen výchozí geometrie optimalizovaná silovým polem.
- *Název ze struktury* program vytvořit neumí. Opačný směr, struktura z názvu, jde přes PubChem, tedy s internetem a s anglickými názvy.
- *Číslování IUPAC* zvládne hlavní řetězec a jednoduché cykly. Kondenzované, přemostěné a spiro cykly je třeba očíslovat ručně nástrojem čísla atomů #ik("atomNumber").
- *Volné páry, zahnuté šipky, závorky, zvláštní vazby a barvy* nesou jen vlastní soubory olomolu (.olom), odkazy a obrázky a z větší části i KET, ne molfile nebo SMILES.
- *3D modely na plátně* uchovají jako modely jen soubory .olom a odkazy; ostatní formáty je vynechají (obrázky a PDF je ukazují).
- *Židličky* dávají stereochemii, jen když stojí samy (ne kondenzované ani přemostěné); vaničky ji nedávají vůbec. #ui[Překlopení židličky] a #ui[Otočit židličku] odmítnou kondenzované a přemostěné kruhy a kruhy s dvojnou vazbou.
- *Kopírování obrázků do schránky* některé prohlížeče nedovolí. Program to oznámí; pak exportujte PNG.
- *Kresby v prohlížeči* jsou jen v tomto prohlížeči na tomto počítači a mezi počítači se nesynchronizují. Přenesete je souborem .olom nebo odkazem.
- *Zápis zpět do souboru* (#kl[Ctrl+S] bez ptaní) umí Chrome a Edge. Firefox a Safari soubor místo toho stáhnou (@soubory).

== Problémy a nápady <problemy>

Budeme rádi za každou zprávu, i za drobnost. Klikněte na brouka #ik("debug") vpravo nahoře (nebo na #ui[Nahlásit problém] v nápovědě). Otevře se okno s tabulkou toho, co pomůže chybu najít: verze programu, prohlížeč, systém, velikost okna, a když necháte zaškrtnuté #ui[S kresbou (odkaz, ve kterém je celá, abych viděl, co vy)], i odkaz na kresbu.

#obr("img/nahlaseni.png", sirka: 72%, popis: [Okno pro nahlášení problému])

+ Klikněte na #ui[Napsat e-mail]. Otevře se nový e-mail na adresu bugs\@olomol.org s pár otázkami, na které stačí odpovědět: co jste dělali (klidně stručně), co se stalo a co jste čekali. Tabulka v něm už je.
+ Odkaz na kresbu je na e-mail moc dlouhý, takže s kresbou klikněte na #ui[Kopírovat tabulku] a tabulku vložte (#kl[Ctrl+V]) na konec e-mailu.
+ Pomůže i snímek obrazovky nebo soubor kresby .olom.

Nápady a otázky patří na contact\@olomol.org (okno tu adresu uvádí také). Odsud se nic neposílá: e-mail uvidíte a odešlete sami. Když se po kliknutí žádný e-mail neotevře (třeba používáte jen webovou poštu), napište na adresu ručně a tabulku vložte stejně. Verzi programu najdete také vlevo dole.

#show: prilohy

= Jak je olomol postavený <stavba>

Tato příloha je pro ty, kdo chtějí vědět, co je pod kapotou: učitele informatiky, správce školní sítě, vývojáře a zvídavé chemiky. K používání programu ji číst nemusíte.

== Celkový pohled

olomol je *statická webová stránka*: HTML, JavaScript a WebAssembly, nic víc. Nepotřebuje server s programem, databázi ani účty. Stačí jakýkoli webový prostor s https (školní server, GitHub Pages) a všechno ostatní běží v prohlížeči uživatele. Vlastní kód má asi 33 000 řádků JavaScriptu.

#let vrstva(nazev, popis, barva, sloupce: 1) = grid.cell(colspan: sloupce, fill: barva, inset: (x: 8pt, y: 6pt), {
  text(9pt, weight: "bold", nazev)
  linebreak()
  text(8pt, fill: rgb("#3a3f4b"), popis)
})

#figure(
  {
    set par(justify: false, leading: 0.5em)
    grid(columns: (1fr, 1fr, 1fr), gutter: 4pt, align: left + top,
      vrstva([Obrazovka · `src/ui`], [lišty, karty, panel, nabídky, dialogy, vyhledávací řádek, karta Info (React 19)], akcent.lighten(70%), sloupce: 3),
      vrstva([Editor · `src/editor`], [nástroje, výběr, zpět a znovu, pohled, myš a klávesy], akcent.lighten(78%)),
      vrstva([Uspořádání · `src/arrange`], [zarovnat, rozmístit, mřížka, reakční schéma], akcent.lighten(78%)),
      vrstva([Rozvržení · `src/layout`], [metody rozvržení, šablony kruhů, kontrola, 3D], akcent.lighten(78%)),
      vrstva([Kresba · `src/model`], [atomy, vazby, reakční a zahnuté šipky, texty, závorky, výplně: prostá data, kopie pro „zpět“ je `structuredClone`], akcent-2.lighten(82%), sloupce: 3),
      vrstva([Chemie · `src/chem`], [vodíky a volné páry, vzorec a hmotnosti, R/S, číslování IUPAC, šablony], akcent.lighten(86%)),
      vrstva([Vykreslení · `src/render`], [scéna: popisky, vazby, elektrony, pravidla šipek; plátno a SVG], akcent.lighten(86%)),
      vrstva([Soubory · `src/io`], [.olom, KET, molfile, převody, odkazy, PubChem], akcent.lighten(86%)),
      vrstva([RDKit.js, megane-rdkit], [SMILES, InChI, rozvržení, CIP (R/S, E/Z), kanonické SMILES; 3D struktury (ETKDG, MMFF94s)], rgb("#e8f4ec")),
      vrstva([Indigo (vlastní vlákno)], [RXN, CDXML, CDX, SDF, CML, rozvržení Ketcheru], rgb("#e8f4ec")),
      vrstva([OpenChemLib], [3D struktury tam, kde je RDKit neudělá, silové pole MMFF94s+], rgb("#e8f4ec")),
      vrstva([Prohlížeč], [IndexedDB (kresby, dřívější verze, nedávné soubory) · localStorage (nastavení) · service worker (offline) · schránka], rgb("#eef0f4"), sloupce: 3),
    )
  },
  caption: [Vrstvy programu. Horní tři řady jsou vlastní kód (složky v `src/`), zelená řada jsou knihovny ve WebAssembly, které se stahují, až když jsou poprvé potřeba.],
  supplement: [Obr.],
  kind: image,
)

== Co dělá která část

#table(columns: (auto, 1fr), stroke: none, inset: (x: 5pt, y: 4pt),
  fill: (_, y) => if calc.odd(y) { akcent-svetly } else { none },
  table.header([*Složka*], [*Co v ní je*]),
  [`src/model`], [Kresba jako data. Souřadnice jsou v délkách vazby, osa y míří dolů jako na obrazovce. `graph.js`: molekuly (souvislé části), nejmenší kruhy.],
  [`src/chem`], [Chemie počítaná vlastním kódem: vodíky a volné páry (`valence.js`), vzorec a hmotnosti, označení R/S, číslování IUPAC (`numbering.js`), šablony, židličky a projekce, delokalizované skupiny (COO#super[−], NO#sub[2]).],
  [`src/render`], [Po každé změně se jednou spočítá *scéna*: kde jsou popisky, jak vypadají vazby, kam jdou volné páry a kudy vedou zahnuté šipky. Z ní kreslí plátno, export SVG i hledání toho, co je pod myší. Obrázky v příručce jsou exporty téže scény.],
  [`src/editor`], [Editor a nástroje: výběr, tažení, vazby, kruhy, šablony, historie (200 kroků), klávesy.],
  [`src/arrange`, `src/layout`], [Zarovnání a nové rozvržení: několik metod (RDKit, CoordGen, Indigo, šablony kruhových systémů RDKit, 3D z RDKit nebo OpenChemLib, komplexy kovů silovým polem UFF), každý nákres celé molekuly natočený do mřížky po 30°.],
  [`src/io`], [Soubory: vlastní .olom a KET (čtení i zápis), molfile V2000/V3000, převody přes RDKit a Indigo, XYZ, kresba uvnitř obrázků, odkazy, PubChem, tisk.],
  [`src/ui`], [Obrazovka v Reactu: lišty, karty, panel, nabídky, dialogy, vyhledávací řádek, promítání, karta Info.],
  [`src/i18n`], [Jazyky. Klíčem je anglický text, `cs.js` a `de.js` jsou překladové tabulky; test hlásí chybějící texty.],
)

== Pravidla, která nejsou z knihoven

- *Volné páry* se počítají jako valenční elektrony − náboj − vazby − vodíky − nepárové elektrony. Testy ověřují, že vycházejí stejné počty jako v RDKit.
- *Zahnuté šipky* se nekreslí ručně: pro každou šipku program vytvoří stovky kandidátních Bézierových křivek a každé spočítá „cenu“. Platí se za průchod popiskem, vazbou, volným párem, vnitřkem kruhu nebo jinou šipkou, za ohyb, který nesedí k délce šipky (krátké se ohýbají víc, dlouhé méně), za nesouměrný oblouk a u nové vazby za hrot, který nepřichází ze strany elektronů. Vyhraje nejlevnější; tlačítko #ui[Jinak] vybírá další, která vypadá jinak. Ladicí režim (#ui[Nastavení] → #ui[Ladění]) ukáže kandidáty i s cenou.
- *Nové rozvržení* nikdy nezmění molekulu: každý nákres se převede na kanonický SMILES včetně stereochemie a porovná s původním. Co se liší, se zahodí.
- *Číslování IUPAC* jde podle doporučení IUPAC 2013 (hlavní řetězec nebo cyklus, nejnižší lokanty, abeceda) a k číslům ukládá i důvod, který panel ukazuje.
- *Překlopení* prohodí plné a šrafované klíny, takže zrcadlový obraz zůstane stejnou molekulou; i to hlídají testy.

== Data a soubory <data-soubory>

- *Vlastní formát* je .olom, z anglického #strong[O]lomol #strong[L]ayout #strong[O]bject #strong[M]odel: kresba tak, jak ji olomol drží, v JSON (UTF-8), takže ji umí přečíst i zapsat kterýkoli program, skript nebo jazykový model. Souřadnice jsou v délkách vazeb, objekty se na sebe odkazují přes id, výchozí hodnoty se nevypisují. Formát něco slibuje: každý olomol otevře každý dřívější soubor .olom; nová dílčí verze (1.0 → 1.1) jen přidává; co čtenář nezná (pole novějšího olomolu, `program:klíč` jiného programu), to si nechá a zapíše zpátky beze změny. Úplný popis je v příloze C příručky na webu, `olomol.org/cs/manual.html#olom` (anglicky; ve zdrojovém kódu `docs/olom.md`).
- *KET*, JSON programu Ketcher, se zapisuje pro Ketcher a Indigo (zkratky jako skupiny Ketcheru, projekce jako klíny) a čte, stejně jako dřívější vlastní soubory olomolu před verzí 0.5.0.
- *Průběžné ukládání:* každá otevřená kresba, její dřívější verze a nedávné soubory jsou v IndexedDB prohlížeče, nastavení v `localStorage`.
- *Odkaz na kresbu:* soubor .olom, zkomprimovaný (`deflate-raw`) a zapsaný v base64url za `#d=`. Část adresy za znakem \# prohlížeč serveru neposílá, takže kresba v odkazu nikdy neprojde serverem, kde je olomol uložený.
- *Kresba uvnitř obrázku:* SVG nese soubor .olom v prvku `<metadata>`, PNG v textovém bloku (`olomol-ket`), obojí v base64; nic z toho není vidět.

== Co odchází z počítače

#table(columns: (auto, 1fr), stroke: none, inset: (x: 5pt, y: 4pt),
  fill: (_, y) => if calc.odd(y) { akcent-svetly } else { none },
  table.header([*Kdy*], [*Co a kam*]),
  [Hledání názvu nebo čísla CID], [jen napsaný text, do PubChem PUG REST (`pubchem.ncbi.nlm.nih.gov`)],
  [#ui[Stránka na PubChemu]], [InChIKey molekuly (nebo napsaný SMILES či InChI), na PubChem; když PubChem nemá přesnou shodu, i její SMILES],
  [Načtení stránky], [běžný požadavek na server, kde je olomol uložený; knihovny, písma a ikony jsou součástí stránky, nic se nestahuje odjinud],
  [Cokoli jiného], [nic: žádná analytika, žádné cookies, žádné účty],
)

== Offline a instalace

Při sestavení (`npm run build`) vznikne *service worker* (`scripts/pwa.mjs`), který při první návštěvě uloží do mezipaměti prohlížeče všechny soubory stránky. Stránka sama (`index.html`) se bere ze sítě, když je k dispozici, takže nová verze se ukáže při dalším načtení; ostatní soubory mají v názvu otisk obsahu, a proto se mohou brát z mezipaměti. Manifest a ikony dělají z webu instalovatelnou aplikaci (PWA).

== Vývoj a testy

Program se vyvíjí v Node.js 24 s nástrojem Vite:

#table(columns: (auto, 1fr), stroke: none, inset: (x: 5pt, y: 3pt),
  [`npm run dev`], [vývojový server na `http://localhost:5173/`],
  [`npm test`], [jednotkové testy: chemie proti RDKit, čtení a zápis souborů, úplnost překladů],
  [`npm run check`], [kontrola v prohlížeči (Chrome přes Playwright): kreslení, šipky, soubory, klávesy; po tématech (`scripts/check/`), `--only drawing` spustí jedno, `--jobs 3` tři najednou],
  [`npm run build`], [sestavení statické stránky do `dist/`],
  [`node scripts/manual-shots.mjs`], [obrázky této příručky z běžícího programu (česky); sazba v programu Typst],
)

Příklady v příručce jsou skutečné kresby programu, ne překreslené obrázky. Skript je postaví ze SMILES a každou molekulu před uložením ověří přes RDKit, včetně stereochemie.

== Licence a poděkování

olomol je zdarma k použití pod licencí MIT: smí se používat, šířit i upravovat, i v jiných programech, pokud zůstane zachována zmínka o autorovi a licenci. Program používá *RDKit* (BSD-3-Clause, včetně šablon kruhových systémů © Schrödinger a univerzálního silového pole UFF, převedeného do JavaScriptu), *Indigo* od EPAM Systems (Apache 2.0), *megane-rdkit* (BSD-3-Clause; 3D struktury z RDKit ve WebAssembly), *OpenChemLib* (BSD-3-Clause) a *React* (MIT). Formát KET je formát programu *Ketcher* (EPAM Systems, Apache 2.0); kód Ketcheru v programu není. Data o sloučeninách na požádání poskytuje *PubChem* (National Library of Medicine, USA). Všechny texty licencí jsou odkázané ze stránky o olomolu (#ui[O aplikaci] pod verzí vlevo dole). Na kódu se výrazně podílel model Claude od společnosti Anthropic.

=== Jak citovat

Pokud vám olomol pomohl s publikací, závěrečnou prací nebo výukovými materiály, citujte ho i s verzí, kterou jste použili. #ui[O aplikaci] otevře stránku o olomolu, kde je v části #ui[Jak citovat] citace: zkopírujete ji jako text, BibTeX, RIS nebo CSL JSON, nebo ji uložíte jako soubor .bib, .ris nebo .json pro správce citací (Zotero, Mendeley, EndNote, Citavi, LaTeX). Obsahuje DOI olomolu na Zenodu, společné všem verzím, a číslo verze, kterou používáte.
