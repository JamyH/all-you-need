# Changelog

## 1.7.0 – 2026-10-27

Neu
- Automatische Updates: Farmy prüft beim Start und alle 6 Stunden die GitHub-Releases, lädt neue Versionen
  still im Hintergrund und installiert sie beim Beenden (sofort: Tray-Menü „Neu starten und aktualisieren“).
  Die portable Version zeigt nur einen Hinweis mit Download. Gilt ab dieser Version; wer noch 1.6.x hat,
  lädt einmal von Hand
- Jungle-Route: In der Champ-Auswahl zeigt das Build-Tab für Jungler die erste Runde je Startcamp als Mini-Karte
  mit nummerierten Camps, Clear-Zeit, Smites, Patch und Video (Phylaris' Jungle Clear Compilation; ohne Eintrag
  die Standard-Full-Clear). Per „Auf der Minimap“ wählst du die Route fürs Spiel
- Overlay: Die gewählte Route steht auf der Minimap, solange Tab gedrückt ist (nur mit Smite auf Summoner's Rift).
  Größe und Transparenz im ⚙ einstellbar, ganz abschaltbar. Die Minimap sucht Farmy selbst auf dem Bildschirm
  (schwarzer Kartenrand), passt also bei jeder Minimap-Größe, Auflösung und mit „Minimap links“

Bildschirm-Erkennung
- Fenstermodus und kleinere Spielauflösung: Farmy sucht das Spielfenster und rechnet alle Stellen (CS, Summoner,
  Items, XP, Augment-Karten, Scoreboard, Minimap) relativ dazu, statt vom ganzen Bildschirm auszugehen. Verschiebt
  oder vergrößert man das Fenster, zieht Farmy nach ein paar Sekunden nach
- Alt-Tab: Liegt ein anderes Fenster vorne, blendet Farmy das Overlay aus und liest den Bildschirm nicht mehr
  (vorher hing das Panel über anderen Programmen und las deren Pixel, z. B. Summoner fälschlich „bereit“).
  Farmys eigene Fenster (⚙, Stats-Fenster) zählen wie das Spiel
- Markieren (ARAM-Schneeball), Läuterung und Klarheit galten wegen ihres blauen Symbols immer als „im Cooldown“
  und bekamen eine erfundene Restzeit: Für sie zählt jetzt nur, ob die weiße Restzeit im Feld steht (stimmt auch
  gegen Ende des Cooldowns und während des Schneeball-Sprungs)
- Summoner-Timer bei 1080p: Die nur 1 px breite „1“ galt als Störpixel (aus 115 wurde 5), und dreistellige
  Zeiten verloren ihre linke Ziffer. Außerdem blieb ein einmal zu niedrig gelesener Timer hängen (Abgleich nahm
  nur sinkende Werte an, der Timer stand dann bei 0:00): Liest Farmy zweimal hintereinander einen höheren Wert,
  gilt jetzt dieser

## 1.6.1 – 2026-10-26

Leistung
- Bildschirm-Erkennung ohne Video-Stream: Die App holt sich die paar kleinen Ausschnitte (CS, Summoner, Items,
  XP, Mayhem-Karten, Scoreboard) direkt über Windows (GDI), statt im Spiel dauerhaft den ganzen Bildschirm
  mitzuschneiden. Spart rund 230 MB Arbeitsspeicher im Spiel (Bildpuffer des Streams und ein unsichtbares
  Aufnahme-Fenster fallen weg) und CPU; die Farben sind exakt statt durch die Video-Kompression verwischt
- Overlay baut Summoner-/Item-Kacheln, Skill-Banner und Lane-Zeile nur noch neu, wenn sich etwas ändert
  (vorher jede Sekunde neu samt Icons)
- Stats-Fenster: Der Live-Tab fragt nicht mehr nach, solange das Fenster minimiert oder verdeckt ist

App
- Stats-Fenster zeigt oben links das App-Icon statt eines „F“
- Stats-Fenster: Der Startbildschirm „Letztes Spiel“ zeigt seinen Untertitel; schlägt beim Laden ein Bereich
  fehl (z. B. Verlauf, weil der Client gerade neu startet), laden die anderen trotzdem

Fixes
- Stats-Fenster: Schließen- und Minimieren-Knopf ließen sich nur ganz am Rand drücken, der Rest der Fläche
  zog das Fenster (der Seitenkopf zum Verschieben lag darüber)
- Stats-Fenster: Tray-Klick, „Stats-Fenster öffnen“ im Menü oder ein zweiter Start ließen das Fenster
  verschwinden, wenn es gerade oben lag; umschalten macht nur noch Strg+Shift+S
- Stats-Fenster blieb „immer oben“ über dem Spiel, wenn man in der ersten Sekunde nach dem Öffnen ins Spiel klickte
- Overlay: Nach dem Verschieben-Modus (Strg+Shift+E) reagierten Griff und ⚙ nicht mehr, wenn die Maus beim
  Beenden noch darauf stand; ein ausgeblendetes Overlay kam nach dem Verschieben-Modus wieder hervor
- Overlay: Tab-Scoreboard-Werte und Mayhem-Tiers saßen bei Windows-Skalierung über 100 % (z. B. Laptops mit
  125/150 %) zu weit rechts unten
- Overlay: Das Panel lässt sich nicht mehr aus dem Bild ziehen und kommt nach einem Auflösungswechsel zurück
  ins Bild; ändern sich Auflösung oder Skalierung, passt sich das Overlay an
- Overlay-Einstellungen (⚙): auf kleinen Bildschirmen scrollbar statt unten abgeschnitten; beim Neuladen
  (z. B. Sprachwechsel) stehen sie wieder neben dem Panel
- Build & Runen: Bei schnellem Champ-Wechsel konnte der lolalytics-Vorschlag des vorherigen Champs erscheinen;
  „Als meinen Build übernehmen“ zeigt Fehler jetzt an

## 1.6.0 – 2026-10-26

App
- Neuer Name: **Farmy** (bisher „All You Need“). Einstellungen, Builds, Runen und Caches werden beim ersten Start
  automatisch aus dem alten Ordner übernommen; der Installer ersetzt die alte Installation. Die Runenseite
  „All You Need“ und die Item-Sets im Client werden weiterbenutzt und auf „Farmy“ umbenannt
- Neues Icon: F-Monogramm im Hextech-Sechseck mit türkisem Kristall

## 1.5.0 – 2026-10-26

Allgemein
- Englische Oberfläche: Overlay, Stats-Fenster, Tray-Menü und Meldungen gibt es jetzt auf Deutsch und Englisch.
  Umschalten im Menü (Tray oder ☰ im Stats-Fenster) unter „Sprache / Language“; beim ersten Start gilt die
  Sprache von Windows. LoL-Begriffe stehen so da wie im englischen Spiel und Client (Riots eigene Texte), Item-,
  Champion-, Runen- und Summoner-Namen kommen in der gewählten Sprache von Data Dragon

## 1.4.0 – 2026-10-25

Build & Runen
- Matchup-Karte (nur vor dem Spiel): je gegnerischem Pick aus der Champ-Auswahl, oder von Hand gewählt, die
  Siegquote gegen ihn (lolalytics) mit Einordnung von „gewinnend“ bis „verlierend“ und eine Einschätzung, wer
  auf Level 1–3 vorne liegt: First-Blood-Anteil aus echten Spielen plus gerechnetes All-in aus Grundwerten und
  Grundfähigkeiten auf Rang 1 (Meraki Analytics; ohne Passiven und Kontrolleffekte)
- Summoner-Empfehlung: Der Vorschlag zeigt das meistgespielte Summoner-Paar (lolalytics; nicht das Paar mit
  der höchsten Siegrate und kaum Spielen), ersatzweise Riots Empfehlung. Beim festen Pick setzt die App es
  automatisch; dein Blitz bleibt auf seiner Taste (D oder F). Eigene Karte „Summoner“ im Build-Tab mit
  „Jetzt setzen“ und Schalter fürs automatische Setzen

Overlay
- Neuer Look „Graphit flach“ (Redesign Richtung B): Panel, ⚙-Einstellungen, Warn-Pillen (SKILL/RECALL/KAUFEN/
  NO MANA mit Icon), Cooldown-Kacheln, Tab-Scoreboard- und Mayhem-Badges jetzt mit Inter-Schrift, abgerundeten
  Kacheln und türkis/gold/korallenroten Akzentfarben statt Hextech-Gold-Rahmen; das Stats-Fenster im selben
  Stil (siehe App)
- Kompakt-Modus (⚙ → Allgemein): schmaleres Panel mit drei Kacheln (CS, KDA, Gold), Summoner- und Item-Cooldowns
  als Ringe, die mit der Restzeit leerlaufen, und Lane-Gegner, CS-Diff und Team-Itemwert in einer Fußzeile
- Einstellungen direkt im Spiel (⚙ im Panel-Kopf oder Tray „Overlay-Einstellungen“): jedes Modul einzeln
  ein- und ausschalten (Werte, Skill-Hinweis, Spar-Ziel, Mana, Summoner- und Item-Cooldowns, XP, Lane-Gegner,
  Team-Itemwert, Tab-Scoreboard, Mayhem-Augments), UI-Größe, Hintergrund- und Hover-Transparenz (Panel wird
  durchsichtiger, solange die Maus darüber steht) und Klick-durch (aus: Panel lässt sich überall greifen).
  Abgeschaltete Cooldowns, Augments und Scoreboard werden auch nicht mehr vom Bildschirm gelesen
- Summoner-Kacheln nur noch mit Icon, Taste und Restzeit (keine Namen mehr)

App
- Stats-Fenster im Graphit-Stil ohne Windows-Rahmen: Seitenleiste mit Account, Navigation, Client-Status und
  ☰-Menü (dasselbe wie am Tray-Icon), Verschieben an Seitenleiste und Kopf, eigene Knöpfe oben rechts
- Startet still im Hintergrund (Overlay + Tray); das Stats-Fenster öffnet sich nur auf Wunsch (Tray, Strg+Shift+S)
  oder nach Einstellung nach dem Spiel und beim Pick
- Tastenkürzel (Strg+Shift+O/E/S) gehen jetzt auch im Spiel; League ließ die globalen Hotkeys dort nicht durch.
  Strg+Shift+S holt das Stats-Fenster über das Spiel, ein zweiter Druck schickt es weg; ein Klick ins Spiel
  lässt es dahinter verschwinden
- Verlauf nach Spielmodus getrennt (Alle / Kluft / ARAM / ARAM Mayhem …, startet mit dem Modus des letzten
  Spiels): Bilanz, Siegquote, Ø KDA, Ø CS/min, Trend-Kurven und Spielliste rechnen nur mit dem gewählten Modus
- Tray-Menü „League komplett beenden …“: beendet nach Rückfrage Riot Client, League-Client und Spiel, z. B. wenn
  League nach einem Vanguard-Fehler hängt (statt Task-Manager)

Leistung
- Weniger Arbeitsspeicher (im Spiel ~815 → ~670 MB): Das Stats-Fenster schließt sich beim Spielstart, wenn die App
  es selbst geöffnet hat und du es nicht benutzt hast (Strg+Shift+S holt es zurück). Die Texterkennung wird nach
  einer Minute ohne Nutzung entladen, das Aufnahme-Fenster gibt es nur noch während eines Spiels
- Overlay: Mausbewegungen werden nur noch in der Nähe des Griffs ans Overlay weitergeleitet. Vorher bekam
  das Overlay im Spiel jede Mausbewegung; das kostete etwa 21 % eines CPU-Kerns im Hauptprozess plus 6 % im
  Overlay, jetzt unter 1 %
- Tab-Scoreboard: Die App fragt im Spiel nur noch ab, ob Tab gedrückt ist, statt alle Eingaben über einen
  globalen Tastatur- und Maus-Hook mitzulesen. Der bekam jede Mausbewegung mit (bei Gaming-Mäusen bis zu 1000
  pro Sekunde) und kostete dafür 2–4 % eines CPU-Kerns; jetzt praktisch nichts

Mayhem
- Augment-Karten werden nur noch neu gelesen, wenn sich die Schrift ändert (vorher jede Sekunde wegen des
  Glitzerns der Karten)

Fixes
- Zerschmettern: Nach dem Aufwerten fehlte das Icon und das Panel sprang jede Sekunde zwischen „F“ und
  „F · Zerschmettern“; die Ladungszahl wurde in die Restzeit mitgelesen (aus „1“ und „45“ wurde 145 s).
  Springt eine Summoner-Restzeit beim Abgleich nach oben, gilt sie jetzt als Fehllesung
- Live-Spiel: Sieben Items liefen über den Kartenrand bzw. wurden abgeschnitten; Übungspuppen im Practice Tool
  hatten ein kaputtes Bild und keinen Namen; Scrollleisten waren weiß
- Spar-Ziel: Andere fertige Stiefel als im Build (z. B. Merkurs statt Stahlkappen) zählen als Stiefel; vorher
  wollte die App ein zweites Paar kaufen und zeigte dafür „bezahlbar“
- Item-Cooldowns: Glanz, Stärke der Dreieinigkeit, Lichbane, Eisgeborener Handschuh und Essenzräuber flackerten
  nach jedem Treffer kurz auf (1,5 s Zauberklinge); kurze Cooldowns unter 5 s von Items ohne Aktiv-Fähigkeit
  werden nicht mehr gezeigt
- Mayhem: Augment-Tiers fehlten bei Angeboten, die lebend kommen (z. B. Stufe 7 auf der Lane); die App
  schaute nur im Tod nach
- Werte-Schmiede: Splitter mit einem falsch gelesenen Buchstaben („…splittar“) wurden nicht erkannt
- Mayhem: Quest-Augments (z. B. „Stähle dein Herz“) zeigten „keine Daten“, weil arammayhem.com sie mit
  „Quest:“ davor führt

## 1.3.0 – 2026-10-25

Im Spiel
- Skill-Hinweis: Solange ein Skillpunkt offen ist, zeigt ein Banner über dem Panel, welche Fähigkeit laut
  lolalytics dran ist (z. B. „SKILL Q · Q › E › W“); passt sich an, wenn du vorher abgewichen bist
- Item-Cooldowns: Items mit Aktiv-Fähigkeit stehen mit Restzeit unter den Summonern, andere Items
  (z. B. Schutzengel) nur, solange ihr Cooldown läuft
- Summoner und Items als Icon statt Name; im Cooldown ausgegraut
- Vollbild-Hinweis: läuft League im echten Vollbild, kommt bei Spielstart eine Meldung, auf „Randlos“
  umzustellen (im Vollbild sieht man das Overlay nicht)

ARAM und ARAM Mayhem
- lolalytics-Vorschlag von der ARAM-Seite (Build, Runen, Skill-Reihenfolge), getrennt vom Rift-Vorschlag
- Item-Set „All You Need – Champion ARAM“ erscheint im ARAM-Shop (eigenes Set neben dem Rift-Set)
- Riots Runen-Empfehlung für die ARAM-Map
- KAUFEN statt RECALL, und nur solange du tot bist; XP-Anzeige nur in Prozent
- Bank-Helfer: in der Champ-Auswahl zeigt „Build & Runen“ deinen Champ und die Bank mit ARAM-Siegrate
  (lolalytics), markiert, wenn sich ein Tausch lohnt; Klick zeigt Build und Runen des Champs
- Augment-Tiers im Mayhem: Beim Augment-Angebot steht über jeder Karte ein Tier (S bis D) mit Grund,
  z. B. „S Tier · 10,5 % der Kayn-Spieler“ oder „God-Combo mit Kayn“. Daten: arammayhem.com (Pickraten
  und Combo-Einschätzungen, keine Siegquoten, die erlaubt Riot für Augments nicht)
- Werte-Schmiede: Bei den Werte-Splittern zeigt das Tier, wie gut der Wert zu deinem Build passt
  (lolalytics-Build plus deine gekauften Items)

Build & Runen
- Deine meistgebauten Items pro Champion und Modus (Rift/ARAM), mit Anzahl und Siegquote; „Als meinen
  Build übernehmen“. Die App merkt sich dafür die Endbuilds deiner Spiele selbst (der Client kennt nur die
  letzten 20); Practice Tool und Custom Games zählen nicht

App
- Auto-Accept: „Spiel automatisch annehmen“ im Tray-Menü (standardmäßig aus) nimmt „Spiel gefunden“ nach
  2 Sekunden an; wer vorher selbst ablehnt, bleibt abgelehnt
- Eigene Ziffern-Erkennung statt Tesseract für Summoner-, Item- und CS-Zahlen (rund 90× schneller);
  Tesseract nur noch, wenn sie unsicher ist. Muster lernt `tools/digit-samples.js`, `ocr.collectDigits`
  sammelt dafür CS-Ausschnitte
- Alte lolalytics-Einträge ohne Skill-Reihenfolge werden beim nächsten Pick neu geholt
- Weniger Last außerhalb des Spiels: die Bildschirmaufnahme läuft nur noch während eines Spiels, Tesseract
  wird erst bei Bedarf geladen und nach dem Spiel freigegeben (rund 100 MB weniger Arbeitsspeicher ohne Spiel)
- Kein Debug-Abzug mehr alle 5 Sekunden in der veröffentlichten Version (sparte 100 KB Schreiblast je Abzug)

Fixes
- CS wurde oft nicht exakt erkannt („0+“), vor allem eine einzelne 0: der Bildschirm-Stream verwischt Gelb,
  die Erkennung achtet jetzt auf Helligkeit
- Summoner sprangen nach dem Tod kurz auf „bereit“ (grauer Bildschirm), obwohl der Cooldown lief
- Flash zeigte ab und zu kurze Fantasie-Cooldowns (0:03 bis 0:09), obwohl er bereit war
- Skill-Banner: Ist die Ulti dran, wird sie zuerst angezeigt, auch wenn noch ein älterer Punkt offen ist

## 1.2.0 – 2026-10-24

Champ-Auswahl
- Build- und Runen-Vorschlag von lolalytics.com für Champion und Rolle: wird beim festen Pick einmal geladen
  und einen Tag gespeichert. Ohne eigene Runen werden die vorgeschlagenen gesetzt, ohne eigenen Build nutzt
  das Spar-Ziel im Spiel den Vorschlag. Im Stats-Fenster mit Quelle und „Übernehmen“; abschaltbar.
  Antwortet lolalytics nicht, kommt Riots eigene Runen-Empfehlung
- Runen-Auswahl: bis zu vier Runenseiten pro Champion (lolalytics + Riots empfohlene Seiten für die Rolle),
  jede mit „Setzen“ (sofort auf die Seite „All You Need“) und „Merken“ (als eigene Runen speichern)
- Item-Set für den Shop: beim Pick (und per Knopf) landet „All You Need – Champion“ im Client, mit
  Start-Items, Kern-Build und jedem Kern-Item samt seinen Teilen; andere Item-Sets bleiben unangetastet
- Stats-Fenster öffnet sich beim festen Pick direkt auf „Build & Runen“, ohne dem Client den Fokus zu
  nehmen (abschaltbar)

App
- Installations-Assistent mit Zielordner, Desktop- und Startmenü-Verknüpfung und „App starten“ am Ende
- Tray-Icon unten rechts: zeigt, dass die App läuft; Menü mit Stats-Fenster, Overlay ein/aus, Panel verschieben,
  „Mit Windows starten“ und Beenden
- Hinweis beim ersten Start und beim ersten Schließen des Stats-Fensters, wo die App weiterläuft
- Nur eine Instanz: ein zweiter Start öffnet das Stats-Fenster der laufenden App
- `--data-dir=<Ordner>` legt Einstellungen und Caches woandershin als `%APPDATA%` (z. B. wenn C: voll ist);
  `npm start` nutzt dieselben Einstellungen wie die installierte App
- Copyright- und Herstellerangaben in den Dateieigenschaften der `.exe`

Fixes
- Overlay konnte hinter dem Spiel verschwinden; es wird jetzt jede Sekunde wieder nach vorne geholt.
  Ein zweiter Start der `.exe` blendet ein per Hotkey ausgeblendetes Overlay wieder ein
- Wird die HUD-Skalierung mitten im Spiel geändert, passt sich die Erkennung nach wenigen Sekunden an
  (bisher erst beim nächsten Spielstart)
- Volle Festplatte: `config.json` kann nicht mehr leer zurückbleiben, und das Overlay läuft weiter, wenn die
  Debug-Datei nicht geschrieben werden kann
- „Mit Windows starten“ funktioniert auch beim Start aus dem Quellcode

## 1.1.0 – 2026-10-24

- Download: Windows-Installer und portable `.exe` auf der Releases-Seite, kein Node.js mehr nötig
- Auflösungs-unabhängig: Bildschirmbereiche werden aus Auflösung und HUD-Skalierung (`game.cfg`) berechnet
  (getestet mit 3440×1440 bei HUD 0 und 100 sowie simulierten 1080p)
- Scoreboard-Suche funktioniert bei jeder Auflösung
- League-Ordner wird automatisch gefunden (Installationsliste des Riot Clients)
- „Erkennung prüfen“ im Stats-Fenster zeigt die gelesenen Bildschirmbereiche und Werte
- Installierte App speichert Einstellungen unter `%APPDATA%\All You Need`
- README auf Englisch mit Screenshots

## 1.0.0 – 2026-10-24

Erste Version.

- Panel im Spiel: KDA, exakte CS per Texterkennung, CS/min, Gold, Vision
- Summoner-Cooldowns (D/F) mit Countdown, alle 10 s mit dem HUD abgeglichen
- XP bis zum nächsten Level mit „noch X Melee / Y Caster“
- Mana-Leiste mit Combo-Kosten und „NO MANA“-Warnung
- Spar-Ziel aus dem eigenen Build mit Restkosten und „RECALL“-Hinweis
- Tab-Scoreboard: Item-Wert-Differenz pro Zeile und Team, findet verschobene Scoreboards selbst
- Stats-Fenster: Live-Spiel mit Rängen, letztes Spiel, Verlauf mit Trend-Kurven
- Build-Reihenfolge und Runenseite pro Champion, Runen-Auto-Import in der Champ-Auswahl
- Hextech-Look, verschiebbares Panel, Hotkeys
- Eigenes App-Icon (Monogramm), Quell-SVGs in `assets/`, neu bauen mit `npx electron tools/build-icon.js`
