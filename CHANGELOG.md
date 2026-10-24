# Changelog

## Unveröffentlicht

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
