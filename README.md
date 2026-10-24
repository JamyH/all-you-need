<img src="assets/icon.png" alt="All You Need Icon" width="96" align="right">

# All You Need – A lightweight overlay

**Version 1.0** · Änderungen siehe [CHANGELOG](CHANGELOG.md)

Ein schlankes Desktop-Overlay für League of Legends unter Windows, gebaut mit Electron.
Es zeigt nur Informationen, die du als Spieler ohnehin sehen kannst, und liest dafür ausschließlich
offizielle lokale Schnittstellen und deinen eigenen Bildschirm. Es greift nicht in den Spielprozess ein.
Die Oberfläche ist auf Deutsch.

> Nutzung auf eigenes Risiko. Dieses Projekt ist nicht von Riot Games geprüft oder freigegeben.
> Riot kann die genutzten Schnittstellen jederzeit ändern.

## Funktionen

**Panel im Spiel**
- KDA, CS (exakt per Bildschirm-Texterkennung), CS/min, Gold, Vision
- Summoner-Cooldowns von D und F mit Countdown (Bildschirm-Texterkennung am Icon)
- XP-Fortschritt bis zum nächsten Level, inklusive „noch X Melee / Y Caster“
- Mana-Leiste mit Combo-Kosten (Q+W+E+R auf den aktuellen Rängen) und „NO MANA“-Warnung
- Spar-Ziel: nächstes Item aus deinem Build, fehlendes Gold, „RECALL“, sobald es bezahlbar ist
- Item-Wert-Differenz zum Lane-Gegner und zum gegnerischen Team

**Tab-Scoreboard**
- Item-Wert-Differenz pro Zeile, direkt über dem Ward-Slot, plus Team-Differenz
- Das Scoreboard wird über sein Mittel-Ornament gefunden, auch wenn du es verschiebst

**Stats-Fenster**
- Live-Spiel: alle 10 Spieler mit Rang, Winrate, Level, KDA, CS, Vision, Items, Item-Wert
- Letztes Spiel und Verlauf mit Trend-Kurven (CS/min, KDA, Vision)
- Build-Reihenfolge und Runenseite pro Champion; Runen werden in der Champ-Auswahl automatisch
  auf eine eigene Seite „All You Need“ gesetzt (andere Seiten bleiben unangetastet)

## Voraussetzungen

- Windows 10/11, League of Legends im Modus **Randlos** oder **Fenster** (über echtem Vollbild kann kein Overlay liegen)
- [Node.js](https://nodejs.org) 20 oder neuer

## Installation und Start

```
npm install
npm start
```

Beim ersten Start wird `config.json` aus `config.example.json` angelegt. Dort trägst du ein:

- `leaguePath`: Installationsordner von League of Legends (Standard `C:\Riot Games\League of Legends`)
- `language`: Sprache der Item- und Championnamen (`de_DE`, `en_US`, …)

## Hotkeys

| Taste | Funktion |
|---|---|
| Strg+Shift+O | Overlay ein/aus |
| Strg+Shift+E | Panel verschieben (alternativ am Griff ⠿ ziehen) |
| Strg+Shift+S | Stats-Fenster |
| Tab (im Spiel) | Scoreboard-Badges; die Taste wird nur mitgelesen, das Spiel bekommt sie normal |

## Bildschirm-Texterkennung kalibrieren

Die Positionen in `config.json` → `ocr` sind für **3440×1440** mit Standard-HUD-Größe eingestellt.
Bei anderer Auflösung oder HUD-Skalierung:

1. Im Spiel `npx electron tools/screenshot.js` ausführen (Bild landet in `debug/screen.png`)
2. In `config.json` die Bereiche anpassen: `ocr.region` (CS-Zahl oben rechts), `ocr.spells.d` / `.f`
   (Summoner-Icons), `ocr.xpArc` (Punkte des XP-Bogens am Portrait, von oben nach unten)
3. Mit `npx electron tools/ocr-test.js` prüfen

Die Scoreboard-Erkennung sucht ihre Position selbst; nur die Abstände in `scoreboard.offsets`
hängen von der HUD-Größe ab.

## Woher die Daten kommen

| Daten | Quelle |
|---|---|
| Werte im Spiel | Live Client Data API (`https://127.0.0.1:2999`, nur während eines Spiels) |
| Ränge, Verlauf, Runen, Champ-Auswahl | League-Client-API (LCU), Zugang aus der `lockfile` im League-Ordner |
| Item-, Champion- und Runen-Daten, Icons | Data Dragon (Riots öffentliches CDN), lokal zwischengespeichert |
| Exakte CS, Cooldowns, XP, Scoreboard | Bildschirmausschnitte, nur lokal ausgewertet |

Es wird kein Riot-API-Key benötigt. Außer den Abrufen bei Data Dragon und dem einmaligen Download
der Texterkennungs-Sprachdaten verlässt nichts deinen Rechner.

## Selbst anpassen

| Datei | Inhalt |
|---|---|
| `src/live.js` | Auswertung der Spieldaten, hier lassen sich neue Werte ergänzen |
| `src/ocr.js`, `renderer/capture.js` | Bildschirm-Auswertung und Scoreboard-Suche |
| `src/lcu.js` | Zugriffe auf den League-Client |
| `renderer/overlay.*` | Panel und Scoreboard-Badges |
| `renderer/stats.*` | Stats-Fenster |
| `tools/` | Hilfsskripte zum Kalibrieren und für Render-Tests |

## Drittanbieter

- [Electron](https://www.electronjs.org) – MIT
- [tesseract.js](https://github.com/naptha/tesseract.js) – Apache-2.0
- [uiohook-napi](https://github.com/SnosMe/uiohook-napi) – MIT
- Schriften Cinzel und Source Sans 3 über Google Fonts – SIL Open Font License

## Lizenz

MIT, siehe [LICENSE](LICENSE).

## Rechtlicher Hinweis

All You Need isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games
or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all
associated properties are trademarks or registered trademarks of Riot Games, Inc.
