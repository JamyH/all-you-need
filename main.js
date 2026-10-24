const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const ddragon = require('./src/ddragon');
const live = require('./src/live');
const lcu = require('./src/lcu');
const ocr = require('./src/ocr');
const capture = require('./src/capture');

const CONFIG_FILE = path.join(__dirname, 'config.json');
// Erster Start: eigene config.json aus der Vorlage anlegen (config.json steht nicht im Repo)
if (!fs.existsSync(CONFIG_FILE)) fs.copyFileSync(path.join(__dirname, 'config.example.json'), CONFIG_FILE);
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
// Nur geänderte Schlüssel zurückschreiben, damit Handänderungen an config.json erhalten bleiben
const saveConfig = (patch) => {
  Object.assign(config, patch);
  const onDisk = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...onDisk, ...patch }, null, 2));
};

const APP_ICON = path.join(__dirname, 'assets', 'icon.ico');
// eigener Eintrag in der Taskleiste statt „Electron“
app.setAppUserModelId('All You Need');

let overlay = null;
let stats = null;
let overlayHidden = false;
let editMode = false;
let lastPhase = null;

// Transparentes Fenster über dem ganzen Bildschirm, Klicks gehen durch zum Spiel.
// League muss dafür im Modus "Randlos" oder "Fenster" laufen, nicht "Vollbild".
function createOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    ...bounds,
    transparent: true,
    icon: APP_ICON,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  // Overlay taucht in Bildschirmaufnahmen nicht auf, damit es die OCR nicht verdeckt
  overlay.setContentProtection(true);
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile('renderer/overlay.html');
  overlay.webContents.on('did-finish-load', () => overlay.webContents.send('panel-pos', config.panel));
}

function openStats() {
  if (stats && !stats.isDestroyed()) return stats.focus();
  stats = new BrowserWindow({
    width: 1000,
    height: 720,
    title: 'All You Need',
    icon: APP_ICON,
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  stats.loadFile('renderer/stats.html');
}

function setEditMode(on) {
  editMode = on;
  overlay.setIgnoreMouseEvents(!on, { forward: true });
  overlay.setFocusable(on);
  overlay.webContents.send('edit-mode', on);
  if (on) overlay.showInactive();
}

// Dev-Helfer: Änderungen in renderer/ laden sofort neu, Rohdaten und Fehler landen in debug/
const DEBUG_DIR = path.join(__dirname, 'debug');
const logError = (e) => {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.appendFileSync(path.join(DEBUG_DIR, 'error.log'), `${new Date().toISOString()} ${e && e.stack ? e.stack : e}\n`);
};
process.on('unhandledRejection', logError);
process.on('uncaughtException', logError);
let lastDump = 0;
fs.watch(path.join(__dirname, 'renderer'), () => {
  clearTimeout(fs.watch.t);
  fs.watch.t = setTimeout(() => {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.reload();
    if (stats && !stats.isDestroyed()) stats.webContents.reload();
  }, 200);
});

async function pollGame() {
  const data = await live.fetchGame();
  const summary = data
    ? live.applyBuild(live.applyMana(live.applyScreen(live.summarize(data), screenState, config.minionXp), config.mana), config.builds)
    : null;
  gameRunning = !!summary;
  lastData = data;
  if (!summary) liveRanks = null; // Ränge gelten nur für das jeweilige Spiel
  if (summary && summary.championId) lastChampion = summary.championId;
  if (summary) summary.scoreboard = live.scoreboard(data);
  if (data && Date.now() - lastDump > 5000) {
    lastDump = Date.now();
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEBUG_DIR, 'last-game.json'), JSON.stringify({ summary, data }, null, 2));
  }
  if (summary && !overlayHidden) {
    if (!overlay.isVisible()) overlay.showInactive();
    overlay.webContents.send('game', summary);
  } else if (!summary && overlay.isVisible() && !editMode) {
    overlay.hide();
  }
}

// Bildschirm auslesen, nur während ein Spiel läuft. Jede Sekunde ein Mini-Ausschnitt-Paket aus dem Stream;
// Texterkennung nur wenn nötig: CS alle ocr.intervalMs, Spell-Restzeit einmal pro Cooldown (+ Abgleich alle 15 s).
let gameRunning = false;
let screenState = { cs: null, xp: null, spells: {} };
let ocrBusy = false;
let lastCsRead = 0;
async function pollScreen() {
  if (!gameRunning || ocrBusy) return;
  ocrBusy = true;
  try {
    const slots = Object.entries(config.ocr.spells || {});
    const readCs = Date.now() - lastCsRead >= config.ocr.intervalMs;
    const regions = slots.map(([, r]) => r);
    if (readCs) regions.push(config.ocr.region, ocr.xpBox(config.ocr.xpArc));
    const crops = await capture.grab(regions);

    for (const [i, [slot]] of slots.entries()) {
      const prev = screenState.spells[slot];
      if (!ocr.spellOnCooldown(crops[i])) {
        screenState.spells[slot] = { ready: true };
      } else if (!prev || prev.ready || prev.cd == null || Date.now() - prev.at > 10000) {
        // Zahl lesen beim Start des Cooldowns und danach alle 10 s zum Abgleich
        const cd = await ocr.readSpellCd(crops[i]);
        if (cd != null) screenState.spells[slot] = { ready: false, cd, at: Date.now() };
        else if (!prev || prev.ready) screenState.spells[slot] = { ready: true };
      }
    }
    if (readCs) {
      lastCsRead = Date.now();
      screenState.cs = await ocr.readCs(crops[slots.length]);
      screenState.xp = ocr.readXp(crops[slots.length + 1], config.ocr.xpArc);
    }
  } catch (e) {
    console.warn('OCR:', e.message);
  } finally {
    ocrBusy = false;
  }
}

// Tab-Scoreboard: die Tab-Taste steuert Ein- und Ausblenden sofort (Taste wird nur gelesen, das Spiel
// bekommt sie normal). Kurz nach dem Drücken bestätigt ein Pixel-Check, dass das Scoreboard wirklich offen ist
// und wo es liegt (es lässt sich verschieben); neuer Anker wird gespeichert, sonst wird wieder ausgeblendet.
let sbOpen = false;
let tabDown = false;
let tabPressId = 0;

function sendScoreboard(open, anchor) {
  sbOpen = open;
  overlay.webContents.send('scoreboard-state', { open, anchor: anchor || config.scoreboard.anchor, offsets: config.scoreboard.offsets });
}

async function confirmScoreboard(pressId) {
  const sb = config.scoreboard;
  const a = sb.anchor;
  const stillThisPress = () => tabDown && pressId === tabPressId;
  try {
    for (const waitMs of sb.confirmMs) {
      await new Promise((r) => setTimeout(r, waitMs));
      if (!stillThisPress()) return;
      const found =
        (await capture.findScoreboard({ x: Math.max(0, a.x - 200), y: Math.max(0, a.y - 180), width: 400, height: 220 })) ||
        (await capture.findScoreboard(null));
      if (!stillThisPress()) return;
      if (found) {
        if (found.x !== a.x || found.y !== a.y) {
          saveConfig({ scoreboard: { ...sb, anchor: found } });
          sendScoreboard(true, found);
        }
        return;
      }
    }
    // nach allen Versuchen nichts gefunden (z. B. Tab im Chat): wieder ausblenden
    if (stillThisPress()) sendScoreboard(false);
  } catch (e) {
    console.warn('Scoreboard:', e.message);
  }
}

function startTabHook() {
  const { uIOhook, UiohookKey } = require('uiohook-napi');
  uIOhook.on('keydown', (e) => {
    if (e.keycode !== UiohookKey.Tab || tabDown || !gameRunning) return; // Tastenwiederholung ignorieren
    tabDown = true;
    tabPressId++;
    sendScoreboard(true);
    confirmScoreboard(tabPressId);
  });
  uIOhook.on('keyup', (e) => {
    if (e.keycode !== UiohookKey.Tab) return;
    tabDown = false;
    if (sbOpen) sendScoreboard(false);
  });
  uIOhook.start();
  app.on('will-quit', () => uIOhook.stop());
}

// Zuletzt gespielter / gewählter Champion (Data-Dragon-ID), Vorauswahl im Build-Editor
let lastChampion = null;
let lastRuneKey = null;

const describeRunes = (r) =>
  r && {
    primary: ddragon.rune(r.primaryStyleId),
    sub: ddragon.rune(r.subStyleId),
    perks: r.selectedPerkIds.map((id) => ddragon.rune(id)).filter(Boolean),
  };

function notifyStats(channel, payload) {
  if (stats && !stats.isDestroyed()) stats.webContents.send(channel, payload);
}

async function applyRunesFor(champId) {
  const rune = (config.runes || {})[champId];
  if (!rune) throw new Error(`Für ${champId} ist keine Runenseite gespeichert.`);
  await lcu.applyRunePage(config.leaguePath, rune);
  return `Runen für ${champId} gesetzt (Seite „${lcu.PAGE_NAME}“).`;
}

async function pollClient() {
  const phase = await lcu.gameflowPhase(config.leaguePath);
  if (phase === 'EndOfGame' && lastPhase !== 'EndOfGame' && config.autoOpenStatsAfterGame) openStats();
  if (phase !== 'ChampSelect') lastRuneKey = null;
  // Champ-Auswahl: gespeicherte Runen des gewählten Champs automatisch setzen (einmal pro Champ)
  if (phase === 'ChampSelect') {
    try {
      const key = await lcu.champSelectChampion(config.leaguePath);
      if (key && key !== lastRuneKey) {
        lastRuneKey = key;
        const champId = ddragon.champion(key).id;
        lastChampion = champId;
        notifyStats('build:champion', champId);
        if (config.runesAuto !== false && (config.runes || {})[champId]) {
          notifyStats('runes:status', await applyRunesFor(champId));
        }
      }
    } catch (e) {
      notifyStats('runes:status', `Runen: ${e.message}`);
    }
  }
  lastPhase = phase;
}

// Live-Spiel-Tab: Ränge einmal pro Spiel laden (10 Anfragen an den Client), danach aus dem Speicher
let lastData = null;
let liveRanks = null;
async function loadRanks() {
  liveRanks = new Map();
  try {
    const players = await lcu.gamePlayers(config.leaguePath);
    await Promise.all(
      players.filter((p) => p.puuid).map(async (p) => {
        const rank = await lcu.soloRank(config.leaguePath, p.puuid).catch(() => null);
        liveRanks.set(ddragon.champion(p.championKey).id, rank || { unranked: true });
      })
    );
  } catch (e) {
    console.warn('Ränge:', e.message);
  }
}
ipcMain.handle('live:data', () => {
  if (!gameRunning || !lastData) return null;
  if (!liveRanks) loadRanks(); // läuft im Hintergrund, kommt beim nächsten Abruf mit
  return live.livePlayers(lastData, liveRanks || new Map());
});

ipcMain.handle('build:data', () => ({
  champions: ddragon.championList(),
  items: ddragon.itemList(),
  builds: config.builds || {},
  runes: Object.fromEntries(Object.entries(config.runes || {}).map(([c, r]) => [c, describeRunes(r)])),
  runesAuto: config.runesAuto !== false,
  current: lastChampion,
}));
ipcMain.handle('build:set', (_e, champId, ids) => {
  saveConfig({ builds: { ...(config.builds || {}), [champId]: ids } });
});
ipcMain.handle('runes:saveCurrent', async (_e, champId) => {
  const page = await lcu.currentRunePage(config.leaguePath);
  const rune = { primaryStyleId: page.primaryStyleId, subStyleId: page.subStyleId, selectedPerkIds: page.selectedPerkIds };
  saveConfig({ runes: { ...(config.runes || {}), [champId]: rune } });
  return describeRunes(rune);
});
ipcMain.handle('runes:apply', (_e, champId) => applyRunesFor(champId));
ipcMain.handle('runes:auto', (_e, on) => saveConfig({ runesAuto: on }));

// Maus über dem Griff: Fenster fängt Klicks ab, sonst gehen sie durch zum Spiel
ipcMain.on('grip-hover', (_e, over) => {
  if (!editMode) overlay.setIgnoreMouseEvents(!over, { forward: true });
});
ipcMain.handle('panel-moved', (_e, pos) => {
  saveConfig({ panel: pos });
});
ipcMain.handle('stats:eog', async () => lcu.endOfGame(config.leaguePath));
ipcMain.handle('stats:history', async () => lcu.matchHistory(config.leaguePath, 20));
ipcMain.handle('stats:summoner', async () => lcu.currentSummoner(config.leaguePath));
ipcMain.handle('ddragon:champion', (_e, id) => ddragon.champion(id));
ipcMain.handle('ddragon:version', () => ddragon.getVersion());

app.whenReady().then(async () => {
  await ddragon.load(app.getPath('userData'), config.language);
  createOverlay();
  openStats();

  const keys = config.hotkeys;
  globalShortcut.register(keys.toggleOverlay, () => {
    overlayHidden = !overlayHidden;
    if (overlayHidden) overlay.hide();
  });
  globalShortcut.register(keys.editMode, () => setEditMode(!editMode));
  globalShortcut.register(keys.openStats, openStats);

  setInterval(pollGame, config.pollMs);
  setInterval(pollClient, 3000);
  if (config.ocr && config.ocr.enabled) {
    await Promise.all([ocr.init(app.getPath('userData')), capture.init()]);
    setInterval(pollScreen, 1000);
    if (config.scoreboard && config.scoreboard.enabled) startTabHook();
  }
});

// Overlay läuft im Hintergrund weiter, auch wenn das Stats-Fenster zu ist.
app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => globalShortcut.unregisterAll());
