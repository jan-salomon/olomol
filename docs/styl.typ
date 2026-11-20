// Společný vzhled rychlého startu a příručky.
// Obrázky v img/ dělá skript: node scripts/manual-shots.mjs (viz README).
// Z téhož zdroje je i příručka na webu (HTML: npm run manual:web, scripts/manual-web.mjs): co je jen rozvržení
// stránky (mřížky, titulní strana, velké nadpisy kapitol, čísla na snímku okna), se na webu vynechá nebo
// zjednoduší podle `web()`; na papíře se nic nemění.
#let web() = target() == "html"

// Komu psát o problémech a nápady.
#let kontakt = [Jan Salomon (bugs\@olomol.org)]

// Barva katedry (#1035A9) a přechod z ní do světlejší modré, jako má
// v programu vybraný nástroj.
#let akcent = rgb("#1035A9")
#let akcent-2 = rgb("#2E6FDB")
#let akcent-svetly = rgb("#E7ECF8")
#let seda = rgb("#687082")

#let akcent-ruzova = akcent-2 // (starý název, pro starší soubory)
#let barevny-prechod = gradient.linear(akcent, akcent-2, angle: 30deg)

// Česky, nebo anglicky (jazyk: "en"): podle jazyka textu.
#let cesky(cs, en) = context if text.lang == "en" { en } else { cs }

// Písmo, odstavce, seznamy a nadpisy 2. a 3. úrovně: stejné ve všech dokumentech.
#let zaklad(jazyk: "cs", body) = {
  set text(font: "Noto Sans", size: 9.8pt, lang: jazyk)
  set par(justify: true, leading: 0.6em, spacing: 0.8em)
  show heading: set text(fill: akcent)
  show heading.where(level: 2): it => block(above: 1.15em, below: 0.5em, text(11.5pt, weight: "bold", it))
  show heading.where(level: 3): it => block(above: 1em, below: 0.5em, text(10pt, weight: "bold", it))
  set list(indent: 0.6em, spacing: 0.55em)
  set enum(indent: 0.6em, spacing: 0.55em)
  show link: set text(fill: akcent)
  // v, k, s, z, o, u, a, i nezůstanou na konci řádku
  show regex("\\b[ksvzouaiKSVZOUAI] "): it => if jazyk == "cs" { it.text.first() + sym.space.nobreak } else { it }
  body
}

// Rychlý start: krátký dokument, nadpisy za sebou.
#let dokument(nazev: "", jazyk: "cs", body) = {
  set document(title: "olomol – " + nazev, author: "Jan Salomon")
  set page(paper: "a4", margin: (x: 2cm, top: 2cm, bottom: 2cm),
    footer: context {
      set text(8pt, fill: seda)
      [olomol · #nazev]
      h(1fr)
      counter(page).display()
    })
  show heading.where(level: 1): it => block(above: 1.6em, below: 0.8em, text(15pt, weight: "bold", it))
  show: zaklad.with(jazyk: jazyk)
  body
}

// --- příručka jako kniha ---

// Nadpisy kapitol s číslem (bez nadpisu obsahu).
#let kapitoly() = query(heading.where(level: 1)).filter(h => h.numbering != none)
#let cislo-kapitoly(h) = numbering(h.numbering, ..counter(heading).at(h.location()))

// Titulní strana: barevný pruh s názvem, pod ním obrázek (karty), autor a datum.
#let titulni-strana(nazev: "", podtitul: "", obrazek: none, pata: none) = page(margin: 0pt, header: none, footer: none)[
  #block(width: 100%, height: 38%, fill: barevny-prechod, inset: (x: 2.4cm, top: 2.4cm, bottom: 1.6cm))[
    #image("../public/icons/icon.svg", width: 2.2cm)
    #v(1fr)
    #text(56pt, weight: "bold", fill: white, tracking: -0.02em)[olomol]
    #v(-1.1em)
    #text(24pt, fill: white.transparentize(10%), weight: "light", nazev)
    #v(0.1em)
    #text(12pt, fill: white.transparentize(15%), podtitul)
  ]
  #block(width: 100%, height: 54%, inset: (x: 2cm, top: 0.8cm, bottom: 0.5cm), obrazek)
  #block(width: 100%, inset: (x: 2.4cm), {
    line(length: 100%, stroke: 0.6pt + rgb("#d8dbe5"))
    v(0.4em)
    set text(9.5pt, fill: seda)
    pata
  })
]

// Kniha: kapitoly na nové stránce s velkým nadpisem, živé záhlaví
// (číslo a název kapitoly, číslo stránky na vnější straně), obsah a přílohy.
#let kniha(nazev: "", jazyk: "cs", body) = {
  set document(title: "olomol – " + nazev, author: "Jan Salomon")
  set page(paper: "a4", margin: (x: 2cm, top: 2.3cm, bottom: 1.8cm),
    header: context {
      let p = here().page()
      let vsechny = kapitoly()
      if vsechny.len() == 0 or p < vsechny.first().location().page() { return }
      // na první stránce kapitoly záhlaví není, nadpis stačí
      if vsechny.any(h => h.location().page() == p) { return }
      let kap = vsechny.filter(k => k.location().page() < p).last()
      let kapitola = text(fill: akcent, weight: "bold", cislo-kapitoly(kap)) + h(0.6em) + kap.body
      let cislo = text(weight: "bold", counter(page).display())
      set text(8.5pt, fill: seda)
      if calc.even(counter(page).get().first()) {
        cislo + h(1.2em) + kapitola + h(1fr) + [olomol · #nazev]
      } else {
        [olomol · #nazev] + h(1fr) + kapitola + h(1.2em) + cislo
      }
      v(-0.5em)
      line(length: 100%, stroke: 0.5pt + rgb("#d8dbe5"))
    },
    footer: context {
      let p = here().page()
      let vsechny = kapitoly()
      // číslo jen pod otevírací stránkou kapitoly (jinak je v záhlaví)
      if vsechny.any(h => h.location().page() == p) {
        align(center, text(8.5pt, fill: seda, counter(page).display()))
      }
    })
  // na webu mřížka (text vedle obrázku) jen vypíše své části za sebou: stránka se přizpůsobí sama
  show grid: it => context if web() { for c in it.children { c.body } } else { it }
  set heading(supplement: if jazyk == "en" [Chapter] else [Kapitola])
  show heading.where(level: 2): set heading(supplement: if jazyk == "en" [section] else [oddíl])
  show heading.where(level: 3): set heading(numbering: none)
  show heading.where(level: 1): it => context if web() { it } else {
    pagebreak(weak: true)
    block(width: 100%, above: 0pt, below: 1em, {
      if it.numbering != none {
        grid(columns: (auto, 1fr), column-gutter: 14pt, align: (left + bottom, left + bottom),
          text(50pt, weight: "bold", fill: barevny-prechod, counter(heading).display(it.numbering)),
          block(below: 0.9em)[
            #text(10pt, fill: seda, weight: "medium", tracking: 0.12em, upper(it.supplement))
            #v(-0.5em)
            #text(24pt, weight: "bold", fill: akcent, it.body)
          ],
        )
      } else {
        text(24pt, weight: "bold", fill: akcent, it.body)
      }
      v(0.2em)
      line(length: 100%, stroke: 2pt + barevny-prechod)
    })
  }
  // obsah: kapitoly tučně s mezerou, oddíly odsazené s tečkami
  set outline(indent: 1.6em)
  show outline.entry.where(level: 1): it => {
    v(0.5em, weak: true)
    text(weight: "bold", fill: akcent, it)
  }
  show: zaklad.with(jazyk: jazyk)
  body
}

// Obsah na samostatné stránce, bez čísla.
#let obsah-strana() = page(header: none, footer: none, margin: (x: 2cm, top: 2cm, bottom: 1.6cm))[
  #v(0.4cm)
  #text(24pt, weight: "bold", fill: akcent, cesky[Obsah][Contents])
  #v(0.2em)
  #line(length: 100%, stroke: 2pt + barevny-prechod)
  #v(0.6em)
  #set text(8.6pt)
  #set par(leading: 0.36em)
  #outline(title: none, depth: 2)
]

// Přílohy: číslované A, B…
#let prilohy(body) = {
  counter(heading).update(0)
  set heading(numbering: "A.1", supplement: cesky[příloha][appendix])
  body
}

// Text tlačítka nebo nabídky, jak ho vidíte na obrazovce.
// (zvýraznění místo rámečku: dlouhý text se může zalomit)
#let ui-papir(body) = highlight(fill: akcent-svetly, extent: 0.8pt, radius: 2.5pt, top-edge: "ascender", bottom-edge: "descender", text(weight: "medium", body))

// Symbol tlačítka, jak je v programu (docs/img/ikony/, scripts/manual-icons.mjs).
#let ik-papir(name) = box(stroke: 0.5pt + seda, radius: 2.5pt, inset: (x: 0.8pt, y: 0pt), outset: (y: 1.2pt), baseline: 18%, image("img/ikony/" + name + ".svg", height: 0.95em))

// Klávesa.
#let kl-papir(body) = box(stroke: 0.5pt + seda, inset: (x: 2pt, y: 0pt), outset: (y: 2.5pt), radius: 2.5pt, text(font: "DejaVu Sans Mono", size: 0.85em, body))

// Rámeček s tipem nebo poznámkou.
#let tip-papir(nadpis: "Tip", body) = block(fill: akcent-svetly, inset: 9pt, radius: 5pt, width: 100%, below: 1em)[
  #text(weight: "bold", fill: akcent, nadpis) #h(0.4em) #body
]

// Obrázek s popiskem (snímky obrazovky v rámečku, kresby SVG bez něj).
#let obr(cesta, sirka: 100%, popis: none, ramecek: true) = figure(
  if ramecek { box(stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, image(cesta, width: sirka)) } else { image(cesta, width: sirka) },
  caption: popis,
  supplement: cesky[Obr.][Fig.],
)

// Číslo v kroužku, na obrázku i v textu.
#let cislo(n) = box(baseline: 20%, circle(radius: 6.5pt, fill: akcent, stroke: white + 1pt,
  align(center + horizon, text(white, 7.5pt, weight: "bold", str(n)))))

// Snímek okna s čísly na jeho částech: `znacky` jsou (číslo, část, kde),
// část podle img/okno.json, kde: "x", "levo", "pravo" (svisle uprostřed
// části, vodorovně uprostřed nebo u okraje). `slozka`: kde snímek je
// (anglický: "en/img/").
#let okno-papir(sirka, znacky, slozka: "img/") = {
  let casti = json(slozka + "okno.json")
  let vyska = sirka * 1800 / 2880
  box(width: sirka, height: vyska, stroke: 0.5pt + rgb("#d8dbe5"), radius: 4pt, clip: true, {
    image(slozka + "okno.png", width: sirka)
    for (n, cast, kde) in znacky {
      let c = casti.at(cast)
      let x = if kde == "levo" { c.left + 0.012 } else if kde == "pravo" { c.right - 0.012 } else { c.x }
      place(top + left, dx: x * sirka - 7pt, dy: c.y * vyska - 7pt, text(10pt, cislo(n)))
    }
  })
}

// Vysvětlivky k číslům na obrázku: (číslo, text), ...
#let legenda-papir(..polozky) = grid(columns: (auto, 1fr), column-gutter: 5pt, row-gutter: 6pt, align: (center + top, left + top),
  ..polozky.pos().map(((n, t)) => (cislo(n), t)).flatten())


// Na papíře, nebo na webu (viz web() nahoře).
#let titulni(nazev: "", podtitul: "", obrazek: none, pata: none) = context if web() { } else { titulni-strana(nazev: nazev, podtitul: podtitul, obrazek: obrazek, pata: pata) }
#let obsah() = context if web() { html.elem("nav", attrs: (class: "toc"), outline(title: none, depth: 2)) } else { obsah-strana() }
#let ui(body) = context if web() { html.elem("span", attrs: (class: "ui"), body) } else { ui-papir(body) }
#let ik(name) = context if web() { html.elem("span", attrs: (class: "ik"), image("img/ikony/" + name + ".svg", height: 0.95em)) } else { ik-papir(name) }
#let kl(body) = context if web() { html.elem("kbd", body) } else { kl-papir(body) }
#let tip(nadpis: "Tip", body) = context if web() { html.elem("aside", attrs: (class: "tip"), [#strong(nadpis) #body]) } else { tip-papir(nadpis: nadpis, body) }
#let okno(sirka, znacky, slozka: "img/") = context if web() { html.elem("span", attrs: (class: "okno"), image(slozka + "okno.png")) } else { okno-papir(sirka, znacky, slozka: slozka) }
#let legenda(..polozky) = context if web() { enum(..polozky.pos().map(((n, t)) => enum.item(n, t))) } else { legenda-papir(..polozky) }
