# Changelog

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
