<img src="assets/icon.png" alt="Farmy icon" width="96" align="right">

# Farmy – free League of Legends overlay

*Formerly known as „All You Need“.*

**Version 1.7** · [Website](https://jamyh.github.io/farmy/) · [Changelog](CHANGELOG.md) · [Download](https://github.com/JamyH/farmy/releases/latest) · [💡 Share an idea](https://github.com/JamyH/farmy/issues/new?template=idea.yml)

A free, small and clean overlay for League of Legends on Windows. It shows what matters in a fight – exact CS,
your summoner cooldowns, XP to the next level, mana for your combo, the gold you still need – without
covering your screen. It only uses information you can already see as a player and never touches the
game process.

> The interface is available in **English** and **German**. Switch it in the tray menu → *Sprache / Language*;
> on first start it follows your Windows language.

<p>
  <img src="docs/panel-en.png" alt="In-game panel with exact CS, summoner spell cooldowns and mana for your combo" height="360">
  <img src="docs/stats-history-en.png" alt="Stats window with trends" height="360">
</p>

## Download

1. Grab the latest **`Farmy-Setup-x.y.z.exe`** (installer) or **`Farmy-x.y.z-portable.exe`**
   (no install) from the [Releases page](https://github.com/JamyH/farmy/releases/latest).
2. Start it. Windows SmartScreen may warn because the app is not code-signed: click *More info → Run anyway*.
   This is a reputation warning for new, unsigned files, not a virus detection – Microsoft Defender finds
   nothing in it. You can compare the file's SHA-256 checksum with the one listed in the release notes
   (PowerShell: `Get-FileHash .\Farmy-Setup-x.y.z.exe`), and the full source is in this repository.
3. Set League to **Borderless** or **Windowed** (an overlay cannot sit on top of exclusive fullscreen).

That's it. The League folder, your resolution and your HUD scale are detected automatically.
From 1.7 on, the installed app updates itself: new versions download in the background and install when you
quit Farmy (or right away via the tray menu). *Check for updates* in the tray menu checks on demand. The portable
exe shows a notice instead.

## Can I get banned for using it?

Farmy never reads or changes the game's memory, injects nothing and sends no inputs. It only uses
Riot's official Live Client Data API, the League client API that rune and stats tools use, and small
screenshots of what is already visible on your screen (see [where the data comes from](#where-the-data-comes-from)).
Information Riot does not allow – enemy cooldown timers, augment win rates – is deliberately left out.
The project is not reviewed or approved by Riot, so no third-party tool can make promises, but it only shows
what you could already see or look up yourself.

## Your ideas are welcome

Farmy grows from what players actually miss in their games – so **please bring in your own ideas**,
even very personal ones. Something that would help you in a specific situation, a small annoyance, a
whole new feature: all of it is explicitly wanted.

👉 **[Share an idea](https://github.com/JamyH/farmy/issues/new?template=idea.yml)** (short form, German or English)

The only limit is Riot's rules: the app uses official APIs and what is already visible on your screen,
so things like enemy cooldown timers or augment win rates are off the table. Post those ideas anyway –
often there is an allowed variant. Found something that is read wrong? Use the
[bug form](https://github.com/JamyH/farmy/issues/new?template=bug.yml) instead.

## Features

**In-game panel**
- KDA, exact CS (read from your HUD), CS/min, gold, vision
- Summoner spell cooldowns (D/F) with countdown, re-synced with the HUD every 10 s (also Mark/Snowball,
  Cleanse and Clarity, whose blue icons used to look like a cooldown)
- XP to the next level, including "X melee / Y caster minions"
- Mana bar with your combo cost (Q+W+E+R at current ranks) and a **NO MANA** warning
- Savings goal: next item from your build, gold still missing, **RECALL** once you can afford it
- Skill hint: which ability to level next (lolalytics skill order) while a point is unspent
- Item cooldowns (Zhonya's, Stopwatch, Guardian Angel …) read from your item slots
- Item value difference to your lane opponent and the enemy team
- In-game settings (⚙ in the panel header): switch every module on or off, compact mode, UI scale, background
  and hover transparency, click-through

**Tab scoreboard**
- Item value difference per row (above the ward slot) plus team difference
- Finds the scoreboard on its own, even if you moved it

**Jungle route**
- In champ select (stats window, Build tab) for junglers: the first clear per starting camp as a mini map with
  numbered camps, clear time, smites, patch and video, from
  [Phylaris' Jungle Clear Compilation](https://docs.google.com/spreadsheets/d/1Gjk5UrtAbcqdYnRlx9KMDuHGxhKsEv50vhn02cN0y-c);
  champions without an entry get the standard full clear
- Pick a route with "On the minimap": in game (with Smite on Summoner's Rift) it is drawn on your minimap while
  you hold Tab. Size and transparency in ⚙. Farmy finds the minimap on screen, so any minimap size works
- The sheet is no longer updated every patch: the camp order rarely changes, the times may be outdated

**Stats window** (frameless, opens only when you want it: tray, Ctrl+Shift+S – also in game – or a second start)
- Live game: all 10 players with rank, win rate, level, KDA, CS, vision, items, item value
- Last game and match history with trend charts (CS/min, KDA, vision), split by game mode (Rift, ARAM,
  ARAM Mayhem …)
- Matchup (before the game only): for each enemy pick in champ select, or any champion you choose, your win
  rate against it from lolalytics (winning / losing lane) and who is ahead at levels 1–3 – first-blood rate
  from real games plus a computed all-in from base stats and rank-1 basic abilities
  ([Meraki Analytics](https://github.com/meraki-analytics/lolstaticdata) data; no passives or crowd control)
- Build order and rune page per champion; runes are applied automatically in champ select to a
  dedicated page called "Farmy" (your other pages are never touched)
- Build and rune suggestions from [lolalytics.com](https://lolalytics.com) for your champion and role,
  loaded once when you lock in; your own builds and runes always take priority (can be switched off)
- Several rune pages to choose from (lolalytics plus Riot's recommended pages for your role): apply one
  with a click or keep it as your own; the stats window opens on lock-in without stealing focus

<img src="docs/stats-build-en.png" alt="Build and runes" width="720">

## Hotkeys

| Key | Action |
|---|---|
| Ctrl+Shift+O | Toggle overlay |
| Ctrl+Shift+E | Move panel (or drag the ⠿ handle) |
| ⚙ in the panel header | Overlay settings (also in the tray menu) |
| Ctrl+Shift+S | Stats window |
| Tab (in game) | Scoreboard badges – the key is only read, the game still receives it |

## Resolution, window mode and HUD scale

Screen regions are computed from League's game window and HUD scale (read from `Config/game.cfg`), so
Borderless, Windowed and a game resolution smaller than your screen all work. When another window is in
front, the overlay hides and nothing is read.
Tested at 3440×1440 with HUD scale 0 and 100, and with a 1920×1080 game window. If something is read
wrong, open the stats window → *Live game* → **Check recognition** during a game: it shows exactly
which screen areas are read and what was recognized. Please attach that screenshot plus your
resolution and HUD scale to an issue.

## Where the data comes from

| Data | Source |
|---|---|
| In-game values | Live Client Data API (`https://127.0.0.1:2999`, only during a game) |
| Ranks, history, runes, champ select | League client API (LCU), credentials from the client's `lockfile` |
| Item, champion and rune data, icons | Data Dragon (Riot's public CDN), cached locally |
| Exact CS, cooldowns, XP, scoreboard | Small screen regions, analysed locally (own digit recognition, Tesseract as fallback) |
| Build and rune suggestions | [lolalytics.com](https://lolalytics.com) build page (Emerald+), one request per champion and role, cached for a day; fallback for runes: Riot's own recommended page from the client |
| ARAM Mayhem augment tiers | Data: [arammayhem.com](https://arammayhem.com/data/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)): pick rates and combo tags, no win rates (Riot does not allow augment win rates); English names from [CommunityDragon](https://communitydragon.org); both cached for a day |
| Stat Anvil shards | Rated locally against your build (item tags from Data Dragon) |
| Jungle routes | [Phylaris' Jungle Clear Compilation](https://docs.google.com/spreadsheets/d/1Gjk5UrtAbcqdYnRlx9KMDuHGxhKsEv50vhn02cN0y-c) (public Google Sheet, downloaded as CSV, cached for a day) |
| Updates | GitHub releases of this repository (`latest.yml`), checked at start and every 6 hours (installer version only) |

No Riot API key is needed. Apart from Data Dragon, the lolalytics build page, the arammayhem.com and
CommunityDragon data (only in ARAM Mayhem), the jungle route sheet, the update check on GitHub and a one-time
download of the OCR language data, nothing leaves your PC. Only the champion and role are part of these requests.

## Building from source

```
npm install
npm start          # run in development
npm run dist       # build installer + portable exe into dist/
```

Requires Node.js 20+. Settings live in `%APPDATA%\Farmy\config.json` (created from
`config.example.json` on first start), shared by `npm start` and the installed app.

To use the app straight from source without building, create a shortcut to
`node_modules\electron\dist\electron.exe` with the project folder as argument. Changes to `renderer/`
reload instantly; for everything else restart the app.

| File | What it does |
|---|---|
| `src/live.js` | Game data → panel values |
| `src/layout.js` | Screen regions for any resolution and HUD scale |
| `src/gamewindow.js` | Finds League's game window (position, size, in front or not) |
| `src/minimap.js`, `src/jungle.js` | Minimap detection and jungle routes |
| `src/updater.js` | Auto-update from GitHub releases |
| `src/ocr.js`, `src/screengrab.js` | Screen reading (small screen regions via Windows GDI, no video stream) and scoreboard search |
| `src/digits.js`, `src/digits.json` | Digit recognition; templates learned with `tools/digit-samples.js` |
| `src/lcu.js` | League client access |
| `renderer/overlay.*`, `renderer/stats.*` | Panel and stats window |
| `tools/` | Calibration and render helpers |

## Third-party

- [Electron](https://www.electronjs.org) – MIT
- [tesseract.js](https://github.com/naptha/tesseract.js) – Apache-2.0
- [koffi](https://koffi.dev/) – MIT
- [electron-updater](https://www.electron.build/auto-update) – MIT
- Fonts Cinzel and Source Sans 3 via Google Fonts – SIL Open Font License

## License

MIT, see [LICENSE](LICENSE). Use at your own risk: this project is not reviewed or approved by Riot
Games, and Riot may change the interfaces it relies on at any time.

## Legal

Farmy isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games
or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all
associated properties are trademarks or registered trademarks of Riot Games, Inc.
