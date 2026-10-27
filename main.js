const { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// --data-dir=<Ordner> legt Einstellungen, Caches und Debug-Dateien woandershin als %APPDATA%
// (z. B. wenn C: voll ist). Muss vor der Instanz-Sperre stehen, die hängt am Datenordner.
const DATA_DIR_ARG = process.argv.find((a) => a.startsWith('--data-dir='));
if (DATA_DIR_ARG) app.setPath('userData', path.resolve(DATA_DIR_ARG.slice('--data-dir='.length)));

// Bis 1.5 hieß die App „All You Need“: Einstellungen, Builds, Runen und Caches beim ersten Start als Farmy aus dem
// alten Ordner übernehmen. Chromiums eigene Ordner (Cache, Local Storage …) baut Electron selbst neu auf.
const OLD_DATA_DIR = path.join(app.getPath('appData'), 'All You Need');
const CHROMIUM_ENTRIES = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Local Storage',
  'Session Storage', 'Network', 'Shared Dictionary', 'blob_storage', 'Crashpad', 'Local State', 'Preferences', 'lockfile']);
if (!DATA_DIR_ARG && !fs.existsSync(path.join(app.getPath('userData'), 'config.json')) && fs.existsSync(path.join(OLD_DATA_DIR, 'config.json'))) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  for (const name of fs.readdirSync(OLD_DATA_DIR)) {
    if (CHROMIUM_ENTRIES.has(name) || name.startsWith('Singleton')) continue;
    try {
      fs.cpSync(path.join(OLD_DATA_DIR, name), path.join(app.getPath('userData'), name), { recursive: true });
    } catch (e) {
      console.warn('Übernahme aus „All You Need“:', name, e.message); // ein Cache fehlt dann nur und wird neu geladen
    }
  }
}

// Nur eine Instanz: ein zweiter Start öffnet das Stats-Fenster der laufenden App statt eines zweiten Overlays
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
// Ein ausgeblendetes Overlay kommt dabei auch wieder zurück
app.on('second-instance', () => {
  overlayHidden = false;
  if (overlay && overlay.isVisible()) raiseOverlay(); // sonst blendet der nächste Spiel-Abruf es ein
  refreshTrayMenu();
  openStats();
});
const ddragon = require('./src/ddragon');
const live = require('./src/live');
const lcu = require('./src/lcu');
const ocr = require('./src/ocr');
const capture = require('./src/screengrab'); // Bildschirm-Ausschnitte per GDI (vorher Video-Stream in src/capture.js)
const setup = require('./src/setup');
const layout = require('./src/layout');
const lolalytics = require('./src/lolalytics');
const early = require('./src/early');
const meraki = require('./src/meraki');
const history = require('./src/history');
const gamelog = require('./src/gamelog');
const notes = require('./src/notes');
const timelines = require('./src/timelines');
const augments = require('./src/augments');
const arammayhem = require('./src/arammayhem');
const jungle = require('./src/jungle');
const minimap = require('./src/minimap');
const gamewindow = require('./src/gamewindow');
const updater = require('./src/updater');
const clears = require('./src/clears');
const anvil = require('./src/anvil');
const keys = require('./src/keys');
const riot = require('./src/riot');
const i18n = require('./renderer/i18n');
const { t } = i18n;
// Data-Dragon-Sprache (Item-, Champion-, Runen- und Summoner-Namen) folgt der Sprache der Oberfläche
const DD_LANG = { de: 'de_DE', en: 'en_US' };

// Config und Debug-Dateien liegen unter %APPDATA%\Farmy, beim Start aus dem Quellcode genauso wie in
// der installierten App, damit beide dieselben Einstellungen, Builds und Runen nutzen
const DATA_DIR = app.getPath('userData');
fs.mkdirSync(DATA_DIR, { recursive: true });
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
// Erster Start: eigene config.json aus der Vorlage anlegen (config.json steht nicht im Repo)
if (!fs.existsSync(CONFIG_FILE)) fs.copyFileSync(path.join(__dirname, 'config.example.json'), CONFIG_FILE);
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
// Nur geänderte Schlüssel zurückschreiben, damit Handänderungen an config.json erhalten bleiben.
// Erst in eine Temp-Datei, dann umbenennen: ist die Platte voll, bleibt die alte config.json heil.
const saveConfig = (patch) => {
  Object.assign(config, patch);
  const onDisk = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  fs.writeFileSync(`${CONFIG_FILE}.tmp`, JSON.stringify({ ...onDisk, ...patch }, null, 2));
  fs.renameSync(`${CONFIG_FILE}.tmp`, CONFIG_FILE);
};

// League-Ordner automatisch finden (Installationsliste des Riot Clients), falls der eingetragene nicht passt
const detectedPath = setup.findLeaguePath(config.leaguePath);
if (detectedPath !== config.leaguePath) saveConfig({ leaguePath: detectedPath });

// Overlay-Einstellungen (⚙ im Panel-Kopf): Module ein/aus, UI-Größe, Transparenz, Klick-durch.
// Fehlende Werte (ältere config.json) kommen aus den Vorgaben.
const OVERLAY_DEFAULTS = { modules: {}, scale: 1, bgTransparency: 30, hoverTransparency: 20, clickThrough: true, compact: false,
  jungleSize: 1, jungleTransparency: 40 };
const overlaySettings = () => ({
  ...OVERLAY_DEFAULTS,
  ...config.overlay,
  modules: { ...(config.overlay && config.overlay.modules) },
});
// Modul an? Ausgeschaltete Module sparen auch die Bildschirm-Erkennung (Cooldowns, Augments, Scoreboard)
const moduleOn = (key) => overlaySettings().modules[key] !== false;
// Spiel-Rückblick: Death Recap und eigene Ulti mitlesen, fürs Spielprotokoll (Reiter „Letztes Spiel“)
const reviewOn = () => moduleOn('review');

// Entwicklerversion (aus dem Quellcode): eigener Name und lila Icon, damit man sie von der installierten App
// unterscheidet (Tray, Taskleiste, Meldungen, Stats-Fenster)
const DEV = !app.isPackaged;
const APP_NAME = DEV ? 'FarmyDevBuild' : 'Farmy';
const APP_ICON = path.join(__dirname, 'assets', DEV ? 'icon-dev.ico' : 'icon.ico');
const APP_PNG = path.join(__dirname, 'assets', DEV ? 'icon-dev.png' : 'icon.png');
// eigener Eintrag in der Taskleiste statt „Electron“ (gleiche ID wie die Verknüpfungen des Installers)
// Die ID bleibt aus der Zeit als „All You Need“: so ersetzt der Installer die alte Installation, statt daneben zu landen
app.setAppUserModelId(DEV ? 'com.jamyh.allyouneed.dev' : 'com.jamyh.allyouneed');

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
  setPassThrough(false);
  overlay.loadFile('renderer/overlay.html');
  // ausgeblendet kommt kein mouseleave mehr an: Maus wieder durchlassen, sonst fängt das Overlay sie im nächsten Spiel
  overlay.on('hide', () => {
    uiCaptured = false;
    panelHover = false;
    setPassThrough(false);
  });
  overlay.webContents.on('did-finish-load', () => {
    overlay.webContents.send('overlay-settings', overlaySettings());
    overlay.webContents.send('settings-open', settingsOpen);
    overlay.webContents.send('panel-pos', config.panel);
  });
}

// Klicks gehen durchs Overlay zum Spiel. Mausbewegungen ans Overlay weiterleiten (forward) brauchen nur die
// bedienbaren Teile (Hover): Griff, ⚙, offene Einstellungen und, ohne Klick-durch, das Panel. Electron hängt
// dafür einen globalen Maus-Hook ein und schickt jede Bewegung ans Overlay: gemessen ~21 % eines Kerns im
// Hauptprozess plus ~6 % im Overlay. Daher nur einschalten, solange die Maus in der Nähe eines solchen Teils
// ist; das prüft ein billiger Blick auf die Mausposition alle 150 ms.
let forwarding = null; // true/false = Stand der Weiterleitung, null = Overlay fängt die Maus gerade selbst
let hitRects = {}; // grip, gear, panel, settings im Overlay (CSS-Pixel), meldet das Overlay
let uiCaptured = false; // Maus steht über einem bedienbaren Teil, das Overlay fängt sie
let panelHover = false;
let settingsOpen = false;
const GRIP_MARGIN = 40;
const inRect = (r, x, y, m) => !!r && x >= r.x - m && x <= r.x + r.width + m && y >= r.y - m && y <= r.y + r.height + m;
function setPassThrough(forward) {
  if (forwarding === forward) return;
  forwarding = forward;
  overlay.setIgnoreMouseEvents(true, forward ? { forward: true } : undefined);
}
function captureMouse() {
  forwarding = null;
  overlay.setIgnoreMouseEvents(false);
}
setInterval(() => {
  // beim Beenden (z. B. Dev → Neu starten) ist das Fenster schon zerstört, der Takt läuft noch
  if (!overlay || overlay.isDestroyed() || !overlay.isVisible()) return;
  const p = screen.getCursorScreenPoint();
  const b = overlay.getBounds();
  const x = p.x - b.x, y = p.y - b.y;
  // Hover-Transparenz: Panel wird durchsichtiger, solange die Maus darüber steht (auch mit Klick-durch)
  const hover = inRect(hitRects.panel, x, y, 0);
  if (hover !== panelHover) {
    panelHover = hover;
    overlay.webContents.send('panel-hover', hover);
  }
  if (uiCaptured) return;
  // Verschiebe-Modus: nur über dem Panel fangen (zum Ziehen; das Panel wandert mit der Maus mit), sonst gehen die
  // Klicks ans Spiel. Vorher fing das ganze Overlay die Maus, und im Spiel konnte man nicht mehr laufen
  if (editMode) {
    if (!inRect(hitRects.panel, x, y, 60)) setPassThrough(false);
    else if (forwarding !== null) captureMouse();
    return;
  }
  const zones = [hitRects.grip, hitRects.gear, settingsOpen && hitRects.settings, !overlaySettings().clickThrough && hitRects.panel];
  setPassThrough(zones.some((r) => inRect(r, x, y, GRIP_MARGIN)));
}, 150);

// Einstellungen gehen auch außerhalb des Spiels auf (Tray); dann bleibt das Overlay sichtbar, bis sie zu sind
function setSettingsOpen(on) {
  settingsOpen = on;
  overlay.webContents.send('settings-open', on);
  if (on) overlay.showInactive();
  else if (overlayHidden) overlay.hide();
  refreshTrayMenu();
}

// Windows nimmt dem Fenster „immer im Vordergrund“ manchmal weg (z. B. nach Alt+Tab), dann liegt es
// hinter dem Spiel. Daher bei jedem Spiel-Abruf neu setzen; moveTop aktiviert das Fenster nicht.
function raiseOverlay() {
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.moveTop();
}

// tab: Reiter, der angezeigt werden soll; inactive: einblenden, ohne dem League-Client den Fokus zu nehmen
// (Champ-Auswahl). Auch Klick-Handler rufen das auf, opts kann dann ein Event sein.
// auto: von der App geöffnet (App-Start, nach dem Spiel). Automatisch geöffnet und nicht benutzt -> schließt sich
// beim Spielstart wieder (im Spiel sieht man es nicht, spart ~125 MB). Klick oder Taste im Fenster = benutzt.
let statsUsed = false;
let statsAutoClosing = false;
// Windows holt ein Fenster aus einem Hintergrundprogramm mit focus() nicht nach vorne; über dem Spiel landete es
// dahinter. Daher „immer oben“, bis du woanders hinklickst (blur), dann wieder normal. Den Fokus gibt Windows beim
// Öffnen oft kurz und nimmt ihn gleich zurück: ein blur in der ersten Sekunde zählt deshalb nicht
let statsRaisedAt = 0;
function raiseStats() {
  statsRaisedAt = Date.now();
  stats.show();
  // 'floating' (und ohne Ebene) wirkt unter Windows nicht, getestet; 'pop-up-menu' liegt unter dem Overlay
  stats.setAlwaysOnTop(true, 'pop-up-menu');
  stats.moveTop();
  stats.focus();
}
function openStats(opts = {}) {
  const { tab, inactive } = opts;
  const auto = !!(inactive || opts.auto);
  if (stats && !stats.isDestroyed()) {
    // Strg+Shift+S schaltet um: liegt das Fenster schon oben, verschwindet es wieder (sonst bliebe es über dem
    // Spiel, falls Windows ihm keinen Fokus gab und daher nie ein blur kommt). Nur das Tastenkürzel: Tray, Menü und
    // ein zweiter Start sollen das Fenster immer zeigen, nicht wegschicken
    if (opts.toggle && stats.isVisible() && !stats.isMinimized() && stats.isAlwaysOnTop()) {
      stats.setAlwaysOnTop(false);
      return stats.minimize();
    }
    if (!auto) statsUsed = true;
    if (stats.isMinimized()) stats.restore();
    if (tab) stats.webContents.send('show-tab', tab);
    return inactive ? stats.showInactive() : raiseStats();
  }
  statsUsed = !auto;
  stats = new BrowserWindow({
    width: 1180,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    // ohne Windows-Rahmen wie das Overlay; Verschieben über Seitenleiste und Kopf, eigene Knöpfe oben rechts
    frame: false,
    title: APP_NAME,
    icon: APP_ICON,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  stats.once('ready-to-show', () => (inactive ? stats.showInactive() : raiseStats()));
  stats.on('blur', () => {
    const early = 1000 - (Date.now() - statsRaisedAt);
    if (early <= 0) return stats.setAlwaysOnTop(false);
    // in der ersten Sekunde nicht sofort glauben, aber nachsehen: wer schnell ins Spiel klickt, hätte das Fenster
    // sonst dauerhaft „immer oben“ über dem Spiel
    setTimeout(() => !stats.isDestroyed() && !stats.isFocused() && stats.setAlwaysOnTop(false), early);
  });
  if (tab) stats.webContents.once('did-finish-load', () => stats.webContents.send('show-tab', tab));
  stats.loadFile('renderer/stats.html');
  // beim ersten Schließen einmal erklären, dass die App im Hintergrund weiterläuft
  stats.on('closed', () => {
    if (statsAutoClosing) return (statsAutoClosing = false);
    if (config.closedHint || !tray) return;
    tray.displayBalloon({
      iconType: 'custom',
      icon: nativeImage.createFromPath(APP_PNG),
      title: t('Farmy läuft weiter'),
      content: t('Das Overlay bleibt aktiv. Beenden über Rechtsklick aufs Icon hier unten rechts.'),
    });
    saveConfig({ closedHint: true });
  });
}

function closeUnusedStats() {
  if (!stats || stats.isDestroyed() || statsUsed) return;
  statsAutoClosing = true;
  stats.close();
}
// Fensterknöpfe des rahmenlosen Stats-Fensters
ipcMain.on('stats:window', (_e, action) => {
  if (!stats || stats.isDestroyed()) return;
  if (action === 'min') stats.minimize();
  else stats.close();
});
ipcMain.on('stats:used', () => {
  statsUsed = true;
});

function setEditMode(on) {
  editMode = on;
  // Steht die Maus beim Beenden noch über Griff/⚙, bliebe uiCaptured hängen: ohne Weiterleitung kommt kein
  // mouseleave mehr, dann wären Griff und ⚙ bis zum Ausblenden tot. Daher Zustand zurücksetzen
  uiCaptured = false;
  if (on) captureMouse();
  else setPassThrough(false);
  overlay.setFocusable(on);
  overlay.webContents.send('edit-mode', on);
  if (on) overlay.showInactive();
  else if (overlayHidden && !settingsOpen) overlay.hide(); // ausgeblendetes Overlay bleibt ausgeblendet
  refreshTrayMenu();
}

// Dev-Helfer: Änderungen in renderer/ laden sofort neu, Rohdaten und Fehler landen in debug/
const DEBUG_DIR = path.join(DATA_DIR, 'debug');
const logError = (e) => {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.appendFileSync(path.join(DEBUG_DIR, 'error.log'), `${new Date().toISOString()} ${e && e.stack ? e.stack : e}\n`);
};
process.on('unhandledRejection', logError);
process.on('uncaughtException', logError);
let lastDump = 0;
if (!app.isPackaged) {
  fs.watch(path.join(__dirname, 'renderer'), () => {
    clearTimeout(fs.watch.t);
    fs.watch.t = setTimeout(() => {
      if (overlay && !overlay.isDestroyed()) overlay.webContents.reload();
      if (stats && !stats.isDestroyed()) stats.webContents.reload();
    }, 200);
  });
}

// Echtes Vollbild: kein Fenster kann über dem Spiel liegen, und die Bildschirmaufnahme bleibt meist schwarz.
// Ins Spiel einklinken wäre bannbar, also nur ein Hinweis bei Spielstart.
function warnFullscreen() {
  if (setup.readWindowMode(config.leaguePath) !== 0 || !tray) return;
  tray.displayBalloon({
    iconType: 'custom',
    icon: nativeImage.createFromPath(APP_PNG),
    title: t('League läuft im Vollbild'),
    content: t('Dort ist das Overlay nicht zu sehen. Im Spiel: Einstellungen → Video → Fenstermodus „Randlos“.'),
  });
}

// Dev-Lastmessung im Spiel: alle 30 s CPU und Speicher je Prozess (Haupt, Overlay, Capture, GPU …) nach
// debug/perf.log. Nur in der Entwicklerversion.
let perfAt = 0;
let perfCpu = null;
function perfSample() {
  if (app.isPackaged || Date.now() - perfAt < 30000) return;
  const first = !perfCpu;
  const cpu = process.cpuUsage(perfCpu || undefined);
  const secs = (Date.now() - perfAt) / 1000;
  perfAt = Date.now();
  perfCpu = process.cpuUsage();
  const procs = app.getAppMetrics().map((m) => ({
    type: m.type, name: m.name || m.serviceName || '', cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10,
    mb: Math.round(m.memory.workingSetSize / 1024),
  }));
  const row = { t: new Date().toISOString(), procs, ...(first ? {} : { mainJs: Math.round(((cpu.user + cpu.system) / 1e4 / secs) * 10) / 10 }),
    heapMb: Math.round(process.memoryUsage().heapUsed / 1048576), ...hudPerf() };
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.appendFileSync(path.join(DEBUG_DIR, 'perf.log'), JSON.stringify(row) + '\n');
  } catch {
    // Messung ist nur Beiwerk
  }
}

// Session-Ziel im Panel: aktueller Stand gegen das Ziel (nur auf der Map, für die es gesetzt wurde)
// key: deaths (höchstens), csm, kda, vision (Sicht/min) jeweils mindestens
function goalNow(s) {
  const g = config.goal;
  if (!g || !moduleOn('goal') || (g.map && g.map !== s.map)) return null;
  const [k, d, a] = String(s.kda).split('/').map(Number);
  const mins = Math.max(s.gameTime / 60, 1);
  const now = { deaths: d, csm: Number(s.csPerMin), kda: (k + a) / Math.max(d, 1), vision: (s.wardScore || 0) / mins }[g.key];
  if (now == null || Number.isNaN(now)) return null;
  const ok = g.key === 'deaths' ? now <= g.target : now >= g.target;
  // Raten wie CS/min sind die ersten Minuten noch nicht aussagekräftig
  return { key: g.key, target: g.target, now, ok, early: g.key !== 'deaths' && s.gameTime < 300 };
}

// Dev „FPS/Ping ins perf.log“: Schnitt und Minimum der gelesenen Werte seit der letzten Zeile (alle 5 s gelesen)
let hudSamples = { fps: [], ping: [] };
function hudPerf() {
  const { fps, ping } = hudSamples;
  hudSamples = { fps: [], ping: [] };
  if (!fps.length && !ping.length) return {};
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return { fps: avg(fps), fpsMin: fps.length ? Math.min(...fps) : null, ping: avg(ping) };
}

// Dev „Perfekt-CS“: alle Vasallen der Wellen, die bis jetzt an der Lane angekommen sind. Wellen alle 30 s ab dem
// ersten Spawn (Live-API-Ereignis „MinionsSpawning“, sonst 1:05), rund 30 s Laufweg; je Welle 3 Nahkampf + 3 Fernkampf,
// Kanone jede 3. Welle bis 14:00, jede 2. bis 25:00, danach jede. Näherung: Quellen nennen auch 15 bzw. 20 min.
// Ergibt 107 bei 10:00 (der übliche Richtwert)
function perfectCs(t, spawn) {
  let cs = 0;
  for (let n = 0, s = spawn; s + 30 <= t; n++, s += 30) cs += 6 + (s >= 1500 || (s >= 840 ? n % 2 === 1 : n % 3 === 2) ? 1 : 0);
  return cs;
}
// Spawn in angezeigter Zeit: mit „Spielzeit per OCR“ weicht die Uhr von der API-Zeit ab (Practice Tool)
function minionSpawn(data, apiTime) {
  const ev = ((data.events || {}).Events || []).find((e) => e.EventName === 'MinionsSpawning');
  return ev ? ev.EventTime - (apiTime - data.gameData.gameTime) : 65;
}

async function pollGame() {
  const data = await live.fetchGame();
  if (data) gameMode = data.gameData.mapNumber === 12 ? 'aram' : 'sr';
  const apiTime = data ? data.gameData.gameTime : 0;
  // Dev-Schalter „Spielzeit per OCR“: bewusst nur die Uhr vom Bildschirm, die Zeit der Live-API wird verworfen
  // (Practice Tool: dort springt bzw. steht die Uhr). Alles Weitere (CS/min, Clear-Zeit …) rechnet damit
  if (data && clockOcr()) data.gameData.gameTime = screenState.clock ?? 0;
  const summary = data
    ? live.applySkills(
        live.applyBuild(live.applyMana(live.applyScreen(live.summarize(data), screenState, config.minionXp), config.mana), buildFor),
        (champId) => (suggestionsOn() ? lolalytics.cached(champId, gameMode) : null),
      )
    : null;
  if (summary && !gameRunning) {
    refreshLayout(); // Spielstart: HUD-Skalierung könnte sich geändert haben
    screenState.quest = screenState.ward = screenState.clock = null; // Rollen-Quest, Ward und Uhr gelten je Spiel
    deaths = [];
    if (data.gameData.gameMode !== 'PRACTICETOOL') {
      gamelog.start({ champ: Number(ddragon.championKey(summary.championId)), map: summary.map, mode: data.gameData.gameMode,
        at: Date.now() - apiTime * 1000 });
      lcu.gameflowSession(config.leaguePath).then((x) => gamelog.setGameId(x && x.gameData && x.gameData.gameId)).catch(() => {});
    }
    closeUnusedStats();
    warnFullscreen();
    if (screenReading) capture.start().catch((e) => console.warn('Bildschirmaufnahme:', e.message));
    startTabWatch(); // Tastenkürzel immer; Tab-Scoreboard nur mit Bildschirm-Erkennung (Prüfung dort)
  }
  if (!summary && gameRunning) {
    gamelog.finish(reviewOn() ? { ult: { readySec: Math.round(ultIdle.total), longestSec: Math.round(ultIdle.longest) } } : {});
    logUltIdle();
    stopTabWatch();
    capture.stop();
    ocr.release().catch(() => {});
  }
  gameRunning = !!summary;
  if (gameRunning) perfSample();
  lastData = data;
  if (!summary) liveRanks = null; // Ränge gelten nur für das jeweilige Spiel
  if (summary && summary.championId) lastChampion = summary.championId;
  // Mayhem: Augment-Tiers für den Champ bereitlegen, bevor das erste Angebot kommt
  if (summary && data.gameData.gameMode === 'KIWI') arammayhem.prepare(lastChampion);
  lastItems = summary ? summary.myItems : [];
  blueSpells = summary ? summary.blueSpells : {};
  if (summary && summary.isDead && !meDead) gamelog.died(summary.gameTime, (data.activePlayer && data.activePlayer.currentGold) || 0);
  if (summary && summary.laneOpponent && summary.laneOpponent.id) gamelog.opponent(ddragon.championKey(summary.laneOpponent.id));
  if (summary && summary.position) gamelog.role(summary.position);
  meDead = !!(summary && summary.isDead);
  if (summary) summary.scoreboard = live.scoreboard(data);
  if (summary) summary.augments = screenState.augments || null;
  if (summary) summary.jungleRoute = jungleRouteFor(summary);
  if (summary) summary.quest = summary.map === 11 && moduleOn('quest') ? screenState.quest : null;
  if (summary) addRiftExtras(summary, data);
  if (summary && summary.map === 11 && devFlag('perfectCs')) summary.csMax = perfectCs(summary.gameTime, minionSpawn(data, apiTime));
  if (summary) gamelog.tick(summary, summary.map === 11 ? perfectCs(600, minionSpawn(data, apiTime)) : null);
  if (summary) summary.goal = goalNow(summary);
  // Ward (Trinket-Slot, Taste 4) als Kachel wie Summoner und Items; null = aus
  if (summary) {
    const trinket = summary.map === 11 && moduleOn('ward') && summary.myItems.find((it) => it.slot === 6);
    summary.ward = trinket ? { key: '4', name: trinket.name, icon: ddragon.iconUrl('item', trinket.id),
      ready: screenState.ward == null, cd: screenState.ward ?? null } : null;
  }
  // Lese-Bereiche (Dev) jede Sekunde, auch wenn das Lesen gerade pausiert (z. B. Stats-Fenster vorne)
  if (summary && debugRegions) sendDebugRegions();
  // Debug-Abzug nur in der Entwicklerversion (100 KB alle 5 s wären für Nutzer nur Schreiblast)
  if (data && !app.isPackaged && Date.now() - lastDump > 5000) {
    lastDump = Date.now();
    try {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
      fs.writeFileSync(path.join(DEBUG_DIR, 'last-game.json'), JSON.stringify({ summary, layout: { gameArea, spells: L && L.spells, factors: L && L.factors }, data }, null, 2));
    } catch (e) {
      console.warn('Debug-Datei:', e.message); // z. B. Platte voll: das Overlay muss trotzdem weiterlaufen
    }
  }
  // Alt-Tab: liegt ein anderes Fenster vorne, Overlay ausblenden (hing sonst über z. B. WhatsApp)
  if (summary && !overlayHidden && (gameFocused() || editMode || settingsOpen)) {
    if (!overlay.isVisible()) overlay.showInactive();
    raiseOverlay();
    overlay.webContents.send('game', summary);
  } else if (overlay.isVisible() && !editMode && !settingsOpen) {
    overlay.hide();
  }
}

// Spiel oder ein Farmy-Fenster vorne (Klick ins ⚙ oder ins Stats-Fenster soll das Overlay nicht verstecken).
// Zum Bildschirm-Lesen zählt das Stats-Fenster nicht: es liegt dann über dem Spiel und verdeckt das HUD
// (das Overlay selbst taucht in der Aufnahme nicht auf)
const hwnd = (w) => (w && !w.isDestroyed() ? Number(w.getNativeWindowHandle().readBigUInt64LE()) : 0);
const gameFocused = (withStats = true) => gamewindow.focused([hwnd(overlay), withStats && hwnd(stats)].filter(Boolean));

// Summoner's Rift: CS-Ziel, erste Runde im Jungle (Clear-Zeit) und Lane-Stand für die Gank-Priorität
let clearShown = null; // { time, cs, until (Spielzeit) }: fertig gemessene Runde, eine Weile im Panel
function addRiftExtras(summary, data) {
  if (summary.map !== 11) return;
  // CS-Ziel: eigener Schnitt auf dem Champ (ab 3 Spielen), sonst config.csTarget (Standard 8/min)
  if (moduleOn('csTarget')) {
    const own = history.csPerMin(Number(ddragon.championKey(summary.championId)));
    summary.csTarget = { perMin: Math.round((own || config.csTarget || 8) * 10) / 10, own: !!own };
  }
  if (!summary.smite) return;
  // Clear-Zeit: aus den genauen CS (Bildschirm), sonst API
  if (moduleOn('clear')) {
    const done = clears.track(summary.championId, summary.gameTime, summary.cs);
    if (done) clearShown = { ...done, until: summary.gameTime + 90 };
    if (clearShown && summary.gameTime < clearShown.until) {
      const st = clears.stats(summary.championId);
      summary.clear = { time: clearShown.time, cs: clearShown.cs, best: st && st.count > 1 ? st.best : null };
    } else clearShown = null;
  }
  if (moduleOn('gank')) summary.lanes = live.lanes(data);
}

// Jungle-Route auf der Minimap: nur mit Smite auf Summoner's Rift; das Overlay zeigt sie nur, solange Tab gedrückt ist.
// Zeigt einen vorher festgelegten Plan (Startcamp aus dem Stats-Fenster, sonst die neueste Route),
// keine Informationen aus dem Spiel
let jungleRoutes = { champ: null, routes: null };
function jungleRouteFor(summary) {
  if (!summary.smite || summary.map !== 11 || !moduleOn('jungleRoute')) return null;
  const champ = summary.championId;
  if (jungleRoutes.champ !== champ) {
    jungleRoutes = { champ, routes: null };
    jungle.routes(ddragon.champion(ddragon.championKey(champ)).name)
      .then((d) => { if (jungleRoutes.champ === champ) jungleRoutes.routes = d.routes; })
      .catch((e) => console.warn('Jungle-Route:', e.message));
  }
  const list = jungleRoutes.routes;
  if (!list) return null;
  const start = (config.jungleStart || {})[champ];
  const pick = list.find((r) => r.route[0] === start) || list[0];
  if (!minimapFound && Date.now() - minimapTriedAt > 5000 && gameFocused(false)) findMinimap();
  const m = minimapFound || L.minimap; // bis zur Erkennung die Maße aus game.cfg (vermessen bei Größe 3)
  return { x: toDip(m.x), y: toDip(m.y), size: toDip(m.size), side: summary.side, route: pick.route };
}

// Minimap auf dem Bildschirm suchen (schwarzer Kartensaum, src/minimap.js): passt so bei jeder Größe, Auflösung
// und mit „Minimap links“. Einmal je Spiel bzw. nach geänderter game.cfg, bei Fehlschlag alle 5 s neu
let minimapFound = null;
let minimapTriedAt = 0;
async function findMinimap() {
  minimapTriedAt = Date.now();
  try {
    const a = gameArea;
    const flip = !!setup.readMinimap(config.leaguePath).flip;
    const side = Math.round(a.height * 0.6);
    const x0 = a.x + (flip ? 0 : a.width - side), y0 = a.y + a.height - side;
    const [crop] = await capture.grab([{ x: x0, y: y0, width: side, height: side }]);
    const m = minimap.find(crop, flip);
    if (m && m.size >= a.height * 0.15) minimapFound = { x: x0 + m.x, y: y0 + m.y, size: m.size };
  } catch (e) {
    console.warn('Minimap suchen:', e.message);
  }
}

// Bildschirm auslesen, nur während ein Spiel läuft. Jede Sekunde ein Mini-Ausschnitt-Paket aus dem Stream;
// Texterkennung nur wenn nötig: CS alle ocr.intervalMs, Spell-Restzeit einmal pro Cooldown (+ Abgleich alle 15 s).
let gameRunning = false;
let screenReading = false; // Bildschirm-Erkennung eingeschaltet (config.ocr.enabled) und bereit
let screenState = { cs: null, xp: null, spells: {}, items: {} };
// FarmyDevBuild-Schalter (Tray → Dev und Devtools-Seite), gespeichert in config.devFlags
const DEV_FLAGS = [
  ['clockOcr', 'Spielzeit per OCR (statt Live-API)'],
  ['perfectCs', 'Perfekt-CS im CS-Feld'],
  ['fps', 'FPS/Ping ins perf.log'],
  ['deathRecap', 'Death Recap auswerten'],
  ['ultIdle', 'Ulti ungenutzt zählen'],
];
const devFlag = (k) => DEV && !!(config.devFlags || {})[k];
const clockOcr = () => devFlag('clockOcr');
let lastItems = []; // Inventar aus der Live-API, damit die Bildschirm-Abfrage nur belegte Item-Slots liest
let meDead = false; // tot: Bildschirm grau, Cooldown-Erkennung der Summoner unzuverlässig
let blueSpells = {}; // { d, f }: Summoner mit blauem Symbol, siehe ocr.spellOnCooldown

// Regionen aus Auflösung und HUD-Größe (game.cfg) berechnen; neu bei jedem Spielstart,
// falls die HUD-Skalierung inzwischen geändert wurde
let L = null;
// Bildschirm-Regionen sind physische Pixel, das Overlay rechnet in CSS-Pixeln (DIP). Bei Windows-Skalierung
// 125/150 % säßen Badges sonst um diesen Faktor zu weit rechts unten
const toDip = (v) => Math.round(v / screen.getPrimaryDisplay().scaleFactor);
// game.cfg alle paar Sekunden auf Änderungen prüfen: League schreibt die HUD-Skalierung sofort,
// wenn sie im Spiel geändert wird (nur Änderungszeit lesen, kostet praktisch nichts)
let cfgMtime = 0;
let cfgChecked = 0;
function checkHudChange() {
  if (Date.now() - cfgChecked < 3000) return;
  cfgChecked = Date.now();
  // Spielfenster verschoben oder in der Größe geändert (Fenstermodus, andere Auflösung): Regionen neu
  const w = gamewindow.rect();
  if (w && ['x', 'y', 'width', 'height'].some((k) => w[k] !== gameArea[k])) return refreshLayout();
  try {
    const m = fs.statSync(path.join(config.leaguePath, 'Config', 'game.cfg')).mtimeMs;
    if (cfgMtime && m !== cfgMtime) refreshLayout();
    cfgMtime = m;
  } catch {
    // game.cfg fehlt -> Standardwerte bleiben
  }
}
// Bereich, in dem League zeichnet (physische Pixel): das Spielfenster, ohne Spiel der ganze Hauptbildschirm.
// Randlos in voller Auflösung ist beides gleich; im Fenstermodus oder bei kleinerer Spielauflösung nicht
let gameArea = { x: 0, y: 0, width: 0, height: 0 };
function refreshLayout() {
  const d = screen.getPrimaryDisplay();
  const hud = setup.readHudScale(config.leaguePath);
  gameArea = gamewindow.rect() || { x: 0, y: 0, width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const a = gameArea;
  L = layout.compute(a.width, a.height, hud || 0, setup.readMinimap(config.leaguePath), a);
  minimapFound = null; // Auflösung oder Minimap-Größe geändert: neu suchen
  capture.setScreen(a); // Spielfenster für die Scoreboard-Suche
  console.log('Layout', JSON.stringify(L.factors), 'HUD-Skalierung', hud, 'Spielfenster', JSON.stringify(a));
}
// gelernter Anker gilt nur, solange er im Spielfenster liegt (Fenster verschoben -> Standardlage)
const sbAnchor = () => {
  const a = gameArea, saved = config.scoreboard.anchor;
  if (saved && saved.x >= a.x && saved.x < a.x + a.width && saved.y >= a.y && saved.y < a.y + a.height) return saved;
  return { x: Math.round(a.x + a.width / 2), y: Math.round(a.y + 406 * L.factors.res) };
};
// Ausschnitt um den letzten bekannten Scoreboard-Anker (wächst mit der Auflösung)
const sbNear = (a) => {
  const s = L.scoreboard.scale;
  return { x: Math.max(0, Math.round(a.x - 200 * s)), y: Math.max(0, Math.round(a.y - 180 * s)), width: Math.round(400 * s), height: Math.round(220 * s) };
};
// Augment-Angebot und Werte-Schmiede: drei Karten erkennen, Namen lesen (nur wenn sich der Ausschnitt geändert
// hat, z. B. nach Neu-Würfeln) und bewerten. Augments nach arammayhem.com, Werte-Splitter nach dem eigenen Build.
// Ergebnis landet im Overlay über den Karten.
const augmentCache = [null, null, null]; // je Karte { sig, text }
// Fingerabdruck nur der weißen Schrift: das Glitzern der Karten ändert die Farben laufend, die Schrift nicht.
// So läuft die Texterkennung nur, wenn wirklich ein anderer Name dasteht (statt jede Sekunde)
const cropSig = (c) => {
  let s = 0;
  for (let i = 0; i < c.data.length; i += 8) {
    const r = c.data[i], g = c.data[i + 1], b = c.data[i + 2];
    const white = Math.min(r, g, b) > 170 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
    s = (s * 31 + (white ? 1 : 0)) >>> 0;
  }
  return s;
};
// Build für die Splitter-Wertung: Lolalytics-Build des Champs plus die schon gekauften fertigen Items
function buildItemTags() {
  const planned = (lastChampion && lolalytics.cached(lastChampion, 'aram')?.items) || [];
  const owned = lastItems.map((it) => it.id).filter(ddragon.finishedItem);
  return [...new Set([...planned, ...owned])].map(ddragon.itemTags);
}
async function readAugmentOffer(augCrops) {
  const frames = augCrops.slice(0, 3), names = augCrops.slice(3);
  if (!frames.every(ocr.augmentFrame)) {
    screenState.augments = null;
    return;
  }
  const texts = await Promise.all(names.map(async (crop, i) => {
    const sig = cropSig(crop);
    if (!augmentCache[i] || augmentCache[i].sig !== sig) {
      const text = await ocr.readText(crop);
      augmentCache[i] = { sig, text };
      if (!app.isPackaged) fs.appendFileSync(path.join(DATA_DIR, 'augments-debug.log'), `${new Date().toISOString()} Karte ${i}: "${text}"
`);
    }
    return augmentCache[i].text;
  }));
  const pos = (i) => ({ x: toDip(L.augments[i].x), y: toDip(L.augments[i].badgeY) });
  const shards = texts.map(anvil.match);
  if (shards.some(Boolean)) {
    const key = lastChampion && ddragon.championKey(lastChampion);
    const info = key ? ddragon.champion(key).info : null;
    const rated = anvil.rateOffer(shards, buildItemTags(), !!info && info.magic > info.attack);
    screenState.augments = rated.map((r, i) => (r ? { ...pos(i), ...r } : { ...pos(i), unknown: true }));
    return;
  }
  const champName = lastChampion ? ddragon.champion(ddragon.championKey(lastChampion)).name : '';
  screenState.augments = texts.map((text, i) => {
    // beim Umdrehen der Karten (Neu-Würfeln) steht kurz kein lesbarer Name da: dann kein Badge
    if ((text.match(/\p{L}/gu) || []).length < 4) return null;
    const id = augments.match(text);
    if (!id) return { ...pos(i), unknown: true };
    const rated = arammayhem.tier(id, lastChampion, champName);
    return { ...pos(i), tier: rated ? rated.tier : null, why: rated ? rated.why : t('keine Daten'), credit: true };
  });
}

let ocrBusy = false;
let lastCsRead = 0;
let lastFpsRead = 0;

// Dev „Ulti ungenutzt“: Sekunden, in denen R gelernt war, du gelebt hast und R bereit war (keine Restzeit auf dem
// Symbol). Nur deine eigene Ulti. Am Spielende eine Zeile in debug/ult-idle.log
let ultIdle = { total: 0, streak: 0, longest: 0, at: 0 };
function trackUlt(crop) {
  const now = Date.now();
  const dt = ultIdle.at ? Math.min(5, (now - ultIdle.at) / 1000) : 0; // Lücken (anderes Fenster vorne) nicht zählen
  ultIdle.at = now;
  const r = lastData && lastData.activePlayer.abilities && lastData.activePlayer.abilities.R;
  const ready = !!r && r.abilityLevel > 0 && !meDead && !ocr.ultOnCooldown(crop);
  if (ready) {
    ultIdle.total += dt;
    ultIdle.streak += dt;
    ultIdle.longest = Math.max(ultIdle.longest, ultIdle.streak);
  } else ultIdle.streak = 0;
  screenState.ultReady = ready;
}
function logUltIdle() {
  const u = ultIdle;
  ultIdle = { total: 0, streak: 0, longest: 0, at: 0 };
  if (!devFlag('ultIdle') || !u.total) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.appendFileSync(path.join(DEBUG_DIR, 'ult-idle.log'), JSON.stringify({ t: new Date().toISOString(), champion: lastChampion,
      readySec: Math.round(u.total), longestSec: Math.round(u.longest) }) + '\n');
  } catch {
    // nur Beiwerk
  }
}

// Dev „Death Recap“: einmal je Tod, 3 s danach, ein Bild des Spielfensters (zum Nachprüfen, debug/deathrecap/)
// und daraus Gesamtschaden und Schadensarten (Ring im Recap oben links) → deaths (je Spiel) und debug/deaths.log
let deadSince = 0;
let deathSaved = false;
let deaths = [];
// „3 Tode · 81 % physisch · 5 % magisch · 14 % echt“, gewichtet mit dem Gesamtschaden, soweit gelesen
function deathSummary() {
  const read = deaths.filter((d) => d.phys != null);
  if (!read.length) return deaths.length ? `${deaths.length} Tode, Recap nicht lesbar` : 'noch keine Tode';
  const w = (d) => d.total || 1;
  const sum = read.reduce((a, d) => a + w(d), 0);
  const share = (k) => Math.round(read.reduce((a, d) => a + d[k] * w(d), 0) / sum);
  return `${deaths.length} Tode · ${share('phys')} % physisch · ${share('magic')} % magisch · ${share('true')} % echt`;
}
async function saveDeathRecap() {
  if (!meDead) {
    deadSince = 0;
    deathSaved = false;
    return;
  }
  if (!deadSince) deadSince = Date.now();
  if (deathSaved || Date.now() - deadSince < 3000) return;
  deathSaved = true;
  const [img] = await capture.grab([gameArea]);
  if (!img) return;
  // Bild nur in der Entwicklerversion mit Dev-Schalter (zum Nachprüfen der Erkennung)
  const name = devFlag('deathRecap') ? `${new Date().toISOString().replace(/[:.]/g, '-')}_${lastChampion || 'x'}.png` : null;
  if (name) {
    const bgra = Buffer.from(img.data);
    for (let i = 0; i < bgra.length; i += 4) [bgra[i], bgra[i + 2]] = [bgra[i + 2], bgra[i]];
    const dir = path.join(DEBUG_DIR, 'deathrecap');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFile(path.join(dir, name), nativeImage.createFromBitmap(bgra, { width: img.width, height: img.height }).toPNG(), () => {});
  }
  const d = L.deathRecap;
  const ring = ocr.deathRing(img, d.cx, d.cy, d.r);
  const total = ring ? await ocr.readDeathTotal(ocr.subCrop(img, d.total)) : null;
  const death = { t: new Date().toISOString(), gameTime: lastData ? Math.round(lastData.gameData.gameTime) : null,
    champion: lastChampion, total, ...(ring || { phys: null, magic: null, true: null }), image: name };
  deaths.push(death);
  gamelog.death({ gameTime: death.gameTime, total, phys: death.phys, magic: death.magic, true: death.true });
  if (name) fs.appendFile(path.join(DEBUG_DIR, 'deaths.log'), JSON.stringify(death) + '\n', () => {});
}
async function pollScreen() {
  // anderes Fenster vorne: dort steht nicht das Spiel, Lesen ergäbe Unsinn (z. B. Summoner „bereit“)
  if (!gameRunning || ocrBusy || !gameFocused(false)) return;
  ocrBusy = true;
  try {
    checkHudChange();
    // im ⚙ abgeschaltete Cooldown-Anzeigen werden gar nicht erst gelesen
    const slots = moduleOn('spells') ? Object.entries(L.spells) : [];
    const readCs = Date.now() - lastCsRead >= config.ocr.intervalMs;
    const items = moduleOn('items') ? lastItems.filter((it) => it.slot < 6) : [];
    const regions = [...slots.map(([, r]) => r), ...items.map((it) => L.items[it.slot])];
    if (readCs) regions.push(L.cs, ocr.xpBox(L.xpArc));
    // Rollen-Quest und Ward-Slot nur auf Summoner's Rift (ARAM hat beides nicht); vor den Augments, die hinten
    // abgeschnitten werden
    const rift = !!lastData && lastData.gameData.mapNumber === 11;
    const questIdx = rift && moduleOn('quest') ? regions.push(L.quest) - 1 : -1;
    const wardIdx = rift && (moduleOn('ward') || debugRegions) ? regions.push(L.items[6]) - 1 : -1;
    const clockIdx = clockOcr() ? regions.push(L.clock) - 1 : -1;
    const fpsIdx = devFlag('fps') && Date.now() - lastFpsRead >= 5000 ? regions.push(L.fps, L.ping) - 2 : -1;
    const ultIdx = devFlag('ultIdle') || reviewOn() ? regions.push(L.ult) - 1 : -1;
    // Mayhem: Augment-Angebote kommen auch lebend (z. B. Stufe 7 auf der Lane), daher immer nachsehen. Der
    // Rahmen-Check kostet fast nichts, Texterkennung läuft nur bei offenem Angebot und geänderter Karte
    const watchAugments = !!lastData && lastData.gameData.gameMode === 'KIWI' && moduleOn('augments');
    if (watchAugments) regions.push(...L.augments.map((a) => a.frame), ...L.augments.map((a) => a.name));
    const crops = await capture.grab(regions);
    const augCrops = watchAugments ? crops.splice(crops.length - 6, 6) : null;
    if (questIdx >= 0) screenState.quest = ocr.readQuest(crops[questIdx], L.quest.r);
    if (clockIdx >= 0) screenState.clock = ocr.readClock(crops[clockIdx]) ?? screenState.clock; // unlesbar: letzte Zeit
    if (fpsIdx >= 0) {
      lastFpsRead = Date.now();
      screenState.fps = ocr.readHudNumber(crops[fpsIdx]);
      screenState.ping = ocr.readHudNumber(crops[fpsIdx + 1]);
      if (screenState.fps != null) hudSamples.fps.push(screenState.fps);
      if (screenState.ping != null) hudSamples.ping.push(screenState.ping);
    }
    if (ultIdx >= 0) trackUlt(crops[ultIdx]);
    if (devFlag('deathRecap') || reviewOn()) await saveDeathRecap();
    // Restzeit mittig wie bei den Items; die Ladungszahl unten rechts (Gelbe Ward) zählt nicht
    if (wardIdx >= 0) screenState.ward = ocr.readItemCd(crops[wardIdx]);
    if (augCrops) await readAugmentOffer(augCrops);
    else screenState.augments = null;

    // Item-Cooldowns: jede Sekunde neu lesen (eigene Ziffern-Erkennung, kostet praktisch nichts)
    screenState.items = {};
    for (const [i, it] of items.entries()) {
      const cd = ocr.readItemCd(crops[slots.length + i]);
      if (cd != null) screenState.items[it.slot] = { id: it.id, cd };
    }
    crops.splice(slots.length, items.length); // danach folgen CS und XP wie bisher

    for (const [i, [slot]] of slots.entries()) {
      const prev = screenState.spells[slot];
      if (!ocr.spellOnCooldown(crops[i], !!blueSpells[slot])) {
        // Mitten im Countdown „bereit“ nicht sofort glauben: tot ist der Bildschirm grau, dann fehlt das Blau
        // des Cooldowns, obwohl der Summoner nicht bereit ist. Tot -> ignorieren, sonst erst beim zweiten Mal
        const left = prev && !prev.ready && prev.cd != null ? prev.cd - (Date.now() - prev.at) / 1000 : 0;
        if (left > 3 && (meDead || !prev.readySeen)) prev.readySeen = !meDead;
        else screenState.spells[slot] = { ready: true };
      } else if (prev && prev.readySeen) {
        prev.readySeen = false; // war nur ein Ausreißer, Countdown läuft weiter
      } else if (!prev || prev.ready || prev.cd == null || Date.now() - (prev.checkedAt || prev.at) > (prev.recheckMs || 10000)) {
        // Zahl lesen beim Start des Cooldowns und danach alle 10 s zum Abgleich
        const cd = await ocr.readSpellCd(crops[i]);
        // Kein Summoner startet mit weniger als 10 s. Solche Werte sind Fehllesungen, z. B. die weiße Kugel
        // im Flash-Icon, das wegen seines Blaus immer nach Cooldown aussieht
        const fresh = !prev || prev.ready;
        const left = fresh || prev.cd == null ? null : prev.cd - (Date.now() - prev.at) / 1000;
        if (left != null && cd != null && cd > left + 3) {
          // Höher als erwartet: Fehllesung jetzt oder schon vorher (bei 1080p z. B. 300 als 200 gelesen, danach
          // blieb der Timer bei 0 hängen). Liest Farmy 2 s später denselben Wert (Zeit abgezogen), gilt er;
          // bis dahin weiter runterzählen
          const p = prev.higher;
          if (p && Math.abs(cd - (p.cd - (Date.now() - p.at) / 1000)) <= 3) screenState.spells[slot] = { ready: false, cd, at: Date.now() };
          else Object.assign(prev, { cd: Math.max(0, Math.round(left)), at: Date.now(), checkedAt: Date.now(), recheckMs: 2000, higher: { cd, at: Date.now() } });
        } else if (cd != null && !(fresh && cd < 10)) screenState.spells[slot] = { ready: false, cd, at: Date.now() };
        else if (fresh) screenState.spells[slot] = { ready: true };
        else prev.checkedAt = Date.now(); // nicht lesbar: erst beim nächsten Abgleich wieder (Tesseract ist teuer)
      }
    }
    if (readCs) {
      lastCsRead = Date.now();
      screenState.cs = await ocr.readCs(crops[slots.length]);
      screenState.xp = ocr.readXp(crops[slots.length + 1], L.xpArc);
    }
  } catch (e) {
    console.warn('OCR:', e.message);
  } finally {
    ocrBusy = false;
  }
}

// FarmyDevBuild: alle Stellen, die Farmy gerade liest, als lila Rahmen mit erkanntem Wert ins Overlay
// (Strg+Shift+D oder Dev-Menü). Spart das Rätselraten bei fremden Auflösungen und falschen Timern
let debugRegions = false;
function toggleDebugRegions() {
  debugRegions = DEV && !debugRegions;
  if (!debugRegions) overlay.webContents.send('debug-regions', null);
  else if (gameRunning && L) sendDebugRegions(); // sofort, nicht erst beim nächsten Abruf
  refreshTrayMenu();
}
// zuletzt gelesene Werte; gleiche Auswahl wie pollScreen (belegte Item-Slots, Augment-Karten nur im Mayhem)
function sendDebugRegions() {
  const items = lastItems.filter((it) => it.slot < 6);
  const watchAugments = !!lastData && lastData.gameData.gameMode === 'KIWI';
  const box = (label, r, value) => ({ label, value: value == null ? '–' : String(value),
    x: toDip(r.x), y: toDip(r.y), width: toDip(r.width), height: toDip(r.height) });
  const spell = (s) => (!s ? '–' : s.ready ? 'bereit' : s.cd != null ? `${Math.max(0, Math.round(s.cd - (Date.now() - s.at) / 1000))} s` : 'Cooldown');
  // Minimap auch ohne Jungle-Route suchen, damit man die Erkennung prüfen kann
  if (!minimapFound && Date.now() - minimapTriedAt > 5000 && gameFocused(false)) findMinimap();
  const m = minimapFound || L.minimap;
  const list = [
    box('Spielfenster', gameArea, `${gameArea.width}×${gameArea.height}`),
    box('CS', L.cs, screenState.cs),
    ...(clockOcr() ? [box('Uhr', L.clock, screenState.clock == null ? null : `${Math.floor(screenState.clock / 60)}:${String(screenState.clock % 60).padStart(2, '0')}`)] : []),
    ...(devFlag('fps') ? [box('FPS', L.fps, screenState.fps), box('Ping', L.ping, screenState.ping)] : []),
    ...(devFlag('ultIdle') ? [box('R', L.ult, `${screenState.ultReady ? 'bereit' : '–'} · ${Math.round(ultIdle.total)} s`)] : []),
    box('XP', ocr.xpBox(L.xpArc), screenState.xp == null ? null : `${Math.round(screenState.xp * 100)} %`),
    box('Quest', L.quest, screenState.quest == null ? null : `${Math.round(screenState.quest * 100)} %`),
    ...Object.entries(L.spells).map(([k, r]) => box(k.toUpperCase(), r, spell(screenState.spells[k]))),
    ...items.map((it) => box(`Item ${it.slot + 1}`, L.items[it.slot], (screenState.items[it.slot] || {}).cd)),
    box('Ward', L.items[6], screenState.ward == null ? 'bereit' : `${screenState.ward} s`),
    box('Minimap', { x: m.x, y: m.y, width: m.size, height: m.size }, minimapFound ? 'gefunden' : 'geschätzt'),
    ...(watchAugments ? L.augments.map((a, i) => box(`Karte ${i + 1}`, a.name, (augmentCache[i] || {}).text)) : []),
  ];
  overlay.webContents.send('debug-regions', list);
}

// Tab-Scoreboard: die Tab-Taste steuert Ein- und Ausblenden sofort (Taste wird nur gelesen, das Spiel
// bekommt sie normal). Kurz nach dem Drücken bestätigt ein Pixel-Check, dass das Scoreboard wirklich offen ist
// und wo es liegt (es lässt sich verschieben); neuer Anker wird gespeichert, sonst wird wieder ausgeblendet.
let sbOpen = false;
let tabDown = false;
let tabPressId = 0;

function sendScoreboard(open, anchor) {
  sbOpen = open;
  const a = anchor || sbAnchor(), o = L.scoreboard.offsets;
  const offsets = { ...o, top: toDip(o.top), badgeX: toDip(o.badgeX), badgeXRight: toDip(o.badgeXRight), badgeDy: toDip(o.badgeDy),
    rows: o.rows.map((r) => (r == null ? r : toDip(r))) };
  overlay.webContents.send('scoreboard-state', { open, anchor: { x: toDip(a.x), y: toDip(a.y) }, offsets });
}

async function confirmScoreboard(pressId) {
  const sb = config.scoreboard;
  const a = sbAnchor();
  const scale = L.scoreboard.scale;
  const stillThisPress = () => tabDown && pressId === tabPressId;
  try {
    for (const waitMs of sb.confirmMs) {
      await new Promise((r) => setTimeout(r, waitMs));
      if (!stillThisPress()) return;
      const found =
        (await capture.findScoreboard(sbNear(a), scale)) || (await capture.findScoreboard(null, scale));
      if (!stillThisPress()) return;
      if (found) {
        if (found.x !== a.x || found.y !== a.y) {
          saveConfig({ scoreboard: { ...config.scoreboard, anchor: found } });
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

// Läuft nur während eines Spiels (Start/Ende in pollGame). Liest Tab fürs Scoreboard und die Tastenkürzel, die
// League im Spiel als globale Hotkeys schluckt
function startTabWatch() {
  const scoreboardOn = !!(config.scoreboard && config.scoreboard.enabled);
  keys.start(
    () => {
      overlay.webContents.send('tab-held', true); // Jungle-Route auf der Minimap nur, solange Tab gedrückt ist
      // im ⚙ abgeschaltet oder ohne Bildschirm-Erkennung: keine Scoreboard-Suche
      if (!scoreboardOn || !screenReading || !moduleOn('scoreboard')) return;
      tabDown = true;
      tabPressId++;
      sendScoreboard(true);
      confirmScoreboard(tabPressId);
    },
    () => {
      overlay.webContents.send('tab-held', false);
      tabDown = false;
      if (sbOpen) sendScoreboard(false);
    },
    hotkeyActions(),
  );
}
function stopTabWatch() {
  keys.stop();
  tabDown = false;
  overlay.webContents.send('tab-held', false);
  if (sbOpen) sendScoreboard(false);
}

// Zuletzt gespielter / gewählter Champion (Data-Dragon-ID), Vorauswahl im Build-Editor
let lastChampion = null;
let lastRuneKey = null;
let lastSuggestionKey = null;
let lastMatchupKey = null;
let matchupState = null; // { champId, position, enemies } aus der Champ-Auswahl, fürs Stats-Fenster
let lastPosition = ''; // Rolle aus der letzten Champ-Auswahl, für Riots Runen-Empfehlung
// 'sr' oder 'aram' (auch ARAM Mayhem): aus der Map der Champ-Auswahl bzw. des laufenden Spiels.
// Bestimmt lolalytics-Seite, Item-Set-Map und Riots Runen-Empfehlung.
let gameMode = 'sr';
const mapId = () => (gameMode === 'aram' ? 12 : 11);

// lolalytics-Vorschläge: an, solange nicht ausdrücklich abgeschaltet
const suggestionsOn = () => !config.lolalytics || config.lolalytics.enabled !== false;
const ownBuild = (champId) => ((config.builds || {})[champId] || []).length > 0;
// Spar-Ziel im Spiel: eigener Build, sonst der zuletzt geladene Vorschlag
function buildFor(champId) {
  if (ownBuild(champId)) return config.builds[champId];
  return (suggestionsOn() && lolalytics.cached(champId, gameMode)?.items) || null;
}

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
  if (!rune) throw new Error(t('Für {champ} ist keine Runenseite gespeichert.', { champ: champId }));
  await lcu.applyRunePage(config.leaguePath, rune);
  return t('Runen für {champ} gesetzt (Seite „{page}“).', { champ: champId, page: lcu.PAGE_NAME });
}

// Fester Pick ohne eigene Runen/eigenen Build: Vorschlag von lolalytics laden (aus dem Cache, wenn
// jünger als ein Tag) und die Runen setzen. Antwortet lolalytics nicht, kommen Riots eigene Empfehlungen.
async function useSuggestion(champId, key, position) {
  if (ownBuild(champId) && (config.runes || {})[champId]) return; // nichts zu ergänzen, kein Abruf
  let source = 'lolalytics.com';
  let rune = null;
  try {
    rune = (await lolalytics.load(champId, position, gameMode)).runes;
    notifyStats('suggestion', champId);
  } catch (e) {
    console.warn('lolalytics:', e.message);
    source = t('Riot-Empfehlung');
  }
  const ownRunes = (config.runes || {})[champId];
  if (ownRunes || config.runesAuto === false) return;
  if (!rune) rune = await lcu.recommendedRunes(config.leaguePath, key, position, mapId()).catch(() => null);
  if (!rune) return;
  await lcu.applyRunePage(config.leaguePath, rune);
  notifyStats('runes:status', t('Runen für {champ} von {source} gesetzt (Seite „{page}“).', { champ: champId, source, page: lcu.PAGE_NAME }));
}

// Summoner beim festen Pick setzen: das meistgespielte Paar laut lolalytics, sonst Riots Empfehlung.
// Was schon richtig liegt, bleibt auf seiner Taste (Blitz auf D oder F, wie gewohnt); nur der Rest wird getauscht.
function placeSpells(current, rec) {
  const out = [null, null];
  for (const s of rec) {
    const i = current.indexOf(s);
    if (i >= 0 && out[i] === null) out[i] = s;
  }
  const rest = rec.filter((s) => !out.includes(s));
  return out.map((s) => (s === null ? rest.shift() : s));
}
async function applySpells(champId, key, position, current) {
  let rec = null;
  let source = 'lolalytics.com';
  if (suggestionsOn()) rec = await lolalytics.load(champId, position, gameMode).then((s) => s.spells, () => null);
  if (!rec) {
    source = t('Riot-Empfehlung');
    rec = await lcu.recommendedSpells(config.leaguePath, key, position, mapId()).catch(() => null);
  }
  if (!rec) return t('Summoner: keine Empfehlung gefunden.');
  const [d, f] = placeSpells(current, rec);
  const name = (k) => ddragon.summoner(k)?.name || k;
  const vars = { d: name(d), f: name(f), source };
  if (d === current[0] && f === current[1]) return t('Summoner {d} (D) + {f} (F) passen schon ({source}).', vars);
  await lcu.applySpells(config.leaguePath, d, f);
  return t('Summoner {d} (D) + {f} (F) von {source} gesetzt.', vars);
}

// Item-Set „Farmy – Champ“ in den Client schreiben, im Spiel im Shop wählbar: eigener Build
// und/oder der lolalytics-Vorschlag (Start, Kern, danach). Ohne beides passiert nichts.
const LANE_LABEL = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', support: 'Support' };
// Vor jedes Item seine Teile (gleiche Teile zusammengefasst, z. B. 2× Verstärkender Foliant), dann das Item
const withParts = (ids) =>
  ids.flatMap((id) => {
    const parts = new Map();
    for (const p of ddragon.components(id)) parts.set(p, (parts.get(p) || 0) + 1);
    return [...[...parts].map(([pid, count]) => ({ id: pid, count })), { id }];
  });
async function importItemSet(champId) {
  const key = ddragon.championKey(champId);
  const s = suggestionsOn() ? lolalytics.cached(champId, gameMode) : null;
  const blocks = [];
  if (ownBuild(champId)) blocks.push({ title: t('Dein Build (Farmy)'), items: withParts(config.builds[champId]) });
  if (s) {
    blocks.push({ title: t('Start – lolalytics.com'), items: s.starting.map((id) => ({ id, count: (s.startCount || {})[id] || 1 })) });
    // Kern-Build erst ohne Teile als Überblick, dann jedes Item mit seinen Teilen in Kaufreihenfolge
    blocks.push({ title: t('Kern-Build – lolalytics.com'), items: s.items.slice(0, 3).map((id) => ({ id })) });
    s.items.slice(0, 3).forEach((id, i) => blocks.push({ title: t('{n}. {item} – Teile', { n: i + 1, item: ddragon.itemName(id) }), items: withParts([id]) }));
    if (s.items.length > 3) blocks.push({ title: t('Danach – lolalytics.com'), items: withParts(s.items.slice(3)) });
  }
  if (!key || !blocks.length) throw new Error(t('Für {champ} gibt es weder eigenen Build noch Vorschlag.', { champ: champId }));
  const name = ddragon.champion(key).name;
  const label = s && (s.mode === 'aram' ? 'ARAM' : LANE_LABEL[s.lane]);
  await lcu.applyItemSet(config.leaguePath, key, `Farmy – ${name}${label ? ` ${label}` : ''}`, blocks, mapId());
  return t('Item-Set „Farmy – {name}“ ist im Client, im Spiel im Shop wählbar.', { name });
}

// ARAM-Bank: dein Champ und die Bank-Champs mit ARAM-Siegrate (lolalytics-Tierliste, einmal am Tag),
// beste zuerst. Das Stats-Fenster zeigt das als Tausch-Hilfe; getauscht wird weiter von Hand im Client.
let benchInfo = null;
function setBench(info) {
  if (JSON.stringify(info) === JSON.stringify(benchInfo)) return;
  benchInfo = info;
  notifyStats('bench', info);
}
async function updateBench(sel) {
  if (!suggestionsOn() || !sel.bench.length) return setBench(null);
  const tier = await lolalytics.aramTier();
  const row = (key, mine) => {
    const c = ddragon.champion(key);
    const t = tier.champs[key];
    return { id: c.id, name: c.name, icon: ddragon.iconUrl('champion', c.id), wr: t ? t.wr : null, games: t ? t.games : null, mine };
  };
  const list = [...(sel.key ? [row(sel.key, true)] : []), ...sel.bench.map((k) => row(k, false))];
  list.sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0));
  setBench({ list, url: tier.url, fetchedAt: tier.fetchedAt });
}

// Endbuilds der letzten Spiele in den eigenen Verlauf übernehmen (Client kennt nur 20)
let historyImported = false;
async function importHistory() {
  try {
    const h = await lcu.matchHistory(config.leaguePath, 20);
    if (history.add(h)) notifyStats('history:items');
    historyImported = true;
    fillTimelines().then((n) => n && notifyStats('progress:update')).catch((e) => console.warn('Spielverläufe:', e.message));
    updateSession().catch((e) => console.warn('Session:', e.message));
    await refreshAugmentNames();
  } catch (e) {
    // Client noch nicht bereit, beim nächsten Abfragen erneut
  }
}

// Session (heute): Siege/Niederlagen aus der eigenen Historie, LP seit dem ersten Blick heute (Solo und Flex).
// Nach 3 Niederlagen am Stück einmal ein Hinweis im Tray
const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const DIVS = ['IV', 'III', 'II', 'I'];
// Rang als Zahl, damit Auf- und Abstiege mitzählen (eine Division = 100 LP; ab Master nur noch LP)
const lpScore = (r) => (!r ? null : TIERS.indexOf(r.tier) * 400 + (TIERS.indexOf(r.tier) >= 7 ? 0 : DIVS.indexOf(r.division) * 100) + r.lp);
let sessionInfo = null;
let streakWarned = 0;
async function updateSession() {
  const today = new Date().toDateString();
  const dayStart = new Date(new Date().toDateString()).getTime();
  const me = await lcu.currentSummoner(config.leaguePath);
  const r = await lcu.ranks(config.leaguePath, me.puuid);
  const now = { solo: lpScore(r.solo), flex: lpScore(r.flex) };
  gamelog.trackLp(now);
  if (!config.session || config.session.day !== today) saveConfig({ session: { day: today, start: now } });
  const games = history.since(dayStart);
  let streak = 0;
  for (const g of games) streak = g.win ? 0 : streak + 1;
  const delta = (q) => (now[q] != null && config.session.start[q] != null ? now[q] - config.session.start[q] : null);
  sessionInfo = { wins: games.filter((g) => g.win).length, losses: games.filter((g) => !g.win).length, streak,
    lp: { solo: delta('solo'), flex: delta('flex') } };
  notifyStats('session', sessionInfo);
  if (streak >= 3 && streak !== streakWarned && tray) {
    streakWarned = streak;
    tray.displayBalloon({ iconType: 'custom', icon: nativeImage.createFromPath(APP_PNG),
      title: t('{n} Niederlagen am Stück', { n: streak }), content: t('Kurz durchatmen? Eine Pause hilft oft mehr als das nächste Spiel.') });
  }
}
ipcMain.handle('session:get', () => sessionInfo);
// Beste eigene Champs für eine Rolle (Champ-Auswahl): Data-Dragon-ID, Spiele, Siege, KDA
ipcMain.handle('history:best', (_e, lane) => history.bestChamps(lane).map((c) => {
  const champ = ddragon.champion(c.champ);
  return { id: champ.id, name: champ.name, games: c.games, wins: c.wins, kda: (c.k + c.a) / Math.max(1, c.d) };
}));

// Deutsche Augment-Namen aus dem Client, einmal pro App-Start (neue Augments kommen mit Patches)
let augmentNamesFresh = false;
async function refreshAugmentNames() {
  if (augmentNamesFresh) return;
  augments.setNames(await lcu.cherryAugments(config.leaguePath));
  augmentNamesFresh = augments.hasNames();
}

// Auto-Accept: „Spiel gefunden“ nach kurzer Verzögerung annehmen (Zeit, um selbst abzulehnen).
// Läuft jede Sekunde, fragt aber nur in der Queue nach; ein Ready-Check dauert rund 10 s.
let acceptAt = 0; // geplanter Zeitpunkt fürs Annehmen, 0 = nichts geplant
async function pollReadyCheck() {
  if (config.autoAccept !== true || !['Matchmaking', 'ReadyCheck'].includes(lastPhase)) {
    acceptAt = 0;
    return;
  }
  const rc = await lcu.readyCheck(config.leaguePath);
  if (!rc || rc.state !== 'InProgress' || rc.playerResponse !== 'None') {
    acceptAt = 0; // kein Check, schon angenommen oder selbst abgelehnt
    return;
  }
  if (!acceptAt) acceptAt = Date.now() + (config.autoAcceptDelayMs ?? 2000);
  if (Date.now() < acceptAt) return;
  acceptAt = 0;
  try {
    await lcu.acceptReadyCheck(config.leaguePath);
    console.log('Auto-Accept: Spiel angenommen');
  } catch (e) {
    console.warn('Auto-Accept:', e.message);
  }
}

async function pollClient() {
  const phase = await lcu.gameflowPhase(config.leaguePath);
  if (!historyImported && phase !== null) importHistory();
  // das gerade beendete Spiel steht oft erst nach ein paar Sekunden im Verlauf
  if (lastPhase === 'EndOfGame' && phase !== 'EndOfGame') importHistory();
  if (phase === 'EndOfGame' && lastPhase !== 'EndOfGame') {
    if (config.autoOpenStatsAfterGame) openStats({ auto: true });
    setTimeout(importHistory, 10000);
  }
  if (phase !== 'ChampSelect') {
    lastRuneKey = lastSuggestionKey = lastMatchupKey = null;
    setBench(null);
  }
  // Champ-Auswahl: gespeicherte Runen des gewählten Champs automatisch setzen (einmal pro Champ)
  if (phase === 'ChampSelect') {
    try {
      if (lastPhase !== 'ChampSelect') gameMode = (await lcu.mapId(config.leaguePath)) === 12 ? 'aram' : 'sr';
      const sel = await lcu.champSelect(config.leaguePath);
      const champId = sel.key ? ddragon.champion(sel.key).id : null;
      lastPosition = sel.position;
      if (gameMode === 'aram') updateBench(sel).catch((e) => console.warn('ARAM-Bank:', e.message));
      // Matchup-Karte im Stats-Fenster: gegnerische Picks, sobald sich etwas ändert (nur Summoner's Rift)
      const enemies = gameMode === 'sr' ? sel.enemies.map((k) => ddragon.champion(k).id) : [];
      const matchupKey = `${champId}|${sel.position}|${sel.side}|${enemies.join(',')}`;
      if (matchupKey !== lastMatchupKey) {
        lastMatchupKey = matchupKey;
        matchupState = { champId, position: sel.position, side: sel.side, enemies };
        notifyStats('matchup:enemies', matchupState);
      }
      if (sel.key && sel.key !== lastRuneKey) {
        lastRuneKey = sel.key;
        lastChampion = champId;
        notifyStats('build:champion', champId);
        if (config.runesAuto !== false && (config.runes || {})[champId]) {
          notifyStats('runes:status', await applyRunesFor(champId));
        }
      }
      // Vorschlag erst beim festen Pick, damit Durchklicken beim Hovern keine Abrufe auslöst
      const suggestionKey = `${sel.key}|${sel.position}`;
      if (sel.locked && suggestionKey !== lastSuggestionKey) {
        lastSuggestionKey = suggestionKey;
        if (config.openInChampSelect !== false) openStats({ tab: 'build', inactive: true });
        if (suggestionsOn()) await useSuggestion(champId, sel.key, sel.position);
        if (config.spellsAuto !== false) {
          await applySpells(champId, sel.key, sel.position, sel.spells)
            .then((msg) => notifyStats('spells:status', msg), (e) => notifyStats('spells:status', `${t('Summoner')}: ${e.message}`));
        }
        if (config.itemSetAuto !== false) {
          importItemSet(champId).then((msg) => notifyStats('build:status', msg), (e) => notifyStats('build:status', `${t('Item-Set')}: ${e.message}`));
        }
      }
    } catch (e) {
      notifyStats('runes:status', `${t('Runen')}: ${e.message}`);
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

// „Bildschirm-Erkennung prüfen“: zeigt die ausgeschnittenen Bereiche und was daraus gelesen wird
ipcMain.handle('calib:check', async () => {
  if (!gameRunning) throw new Error(t('Nur im laufenden Spiel möglich.'));
  refreshLayout();
  const slotItems = lastItems.filter((it) => it.slot < 6);
  const regions = [L.cs, L.spells.d, L.spells.f, ocr.xpBox(L.xpArc), ...slotItems.map((it) => L.items[it.slot])];
  const crops = await capture.grab(regions);
  const toUrl = (c) => {
    const bgra = Buffer.from(c.data);
    for (let i = 0; i < bgra.length; i += 4) [bgra[i], bgra[i + 2]] = [bgra[i + 2], bgra[i]];
    return nativeImage.createFromBitmap(bgra, { width: c.width, height: c.height }).toDataURL();
  };
  const spell = async (c) => (ocr.spellOnCooldown(c) ? `Cooldown ${await ocr.readSpellCd(c)}` : t('bereit'));
  return {
    screen: (() => {
      const d = screen.getPrimaryDisplay();
      return `${Math.round(d.size.width * d.scaleFactor)}×${Math.round(d.size.height * d.scaleFactor)}`;
    })(),
    hudScale: setup.readHudScale(config.leaguePath),
    factors: L.factors,
    items: [
      { label: 'CS', img: toUrl(crops[0]), value: String(await ocr.readCs(crops[0])) },
      { label: 'D', img: toUrl(crops[1]), value: await spell(crops[1]) },
      { label: 'F', img: toUrl(crops[2]), value: await spell(crops[2]) },
      { label: 'XP', img: toUrl(crops[3]), value: `${Math.round(ocr.readXp(crops[3], L.xpArc) * 100)} %` },
      ...slotItems.map((it, i) => {
        const cd = ocr.readItemCd(crops[4 + i]);
        return { label: it.name, img: toUrl(crops[4 + i]), value: cd == null ? t('kein Cooldown') : `Cooldown ${cd}` };
      }),
    ],
  };
});

ipcMain.handle('build:data', () => ({
  champions: ddragon.championList(),
  items: ddragon.itemList(),
  builds: config.builds || {},
  runes: Object.fromEntries(Object.entries(config.runes || {}).map(([c, r]) => [c, describeRunes(r)])),
  runesAuto: config.runesAuto !== false,
  spellsAuto: config.spellsAuto !== false,
  suggestions: suggestionsOn(),
  openInChampSelect: config.openInChampSelect !== false,
  autoAccept: config.autoAccept === true,
  itemSetAuto: config.itemSetAuto !== false,
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
ipcMain.handle('spells:auto', (_e, on) => saveConfig({ spellsAuto: on }));
// „Jetzt setzen“ im Stats-Fenster: geht nur in der Champ-Auswahl mit gewähltem Champion
ipcMain.handle('spells:apply', async () => {
  if (lastPhase !== 'ChampSelect') return t('Summoner lassen sich nur in der Champ-Auswahl setzen.');
  const sel = await lcu.champSelect(config.leaguePath);
  if (!sel.key) return t('Erst einen Champion wählen.');
  return applySpells(ddragon.champion(sel.key).id, sel.key, sel.position, sel.spells);
});

// Matchup gegen einen Lane-Gegner: lolalytics (Siegrate, First Blood) plus Level-1–3-Duell aus den Grundwerten.
// Nur vor dem Spiel im Stats-Fenster: Siegraten im Spiel erlaubt Riot nicht
ipcMain.handle('matchup:state', () => matchupState);
// Jungle-Route (Phylaris' Clear-Tabelle) fürs Stats-Fenster; reine Vorbereitung vor dem Spiel
ipcMain.handle('jungle:routes', async (_e, champId) => ({
  ...(await jungle.routes(ddragon.champion(ddragon.championKey(champId)).name)),
  chosen: (config.jungleStart || {})[champId] || null,
  clears: clears.stats(champId), // eigene gemessene erste Runden mit diesem Champ
}));
// Startcamp für die Minimap merken (je Champion)
ipcMain.handle('jungle:choose', (_e, champId, start) => saveConfig({ jungleStart: { ...(config.jungleStart || {}), [champId]: start } }));
ipcMain.handle('matchup:get', async (_e, champId, vsId, position) => {
  const stats = (id) => ddragon.champion(ddragon.championKey(id)).stats;
  // Fähigkeiten von Meraki; fehlen sie (offline, unbekannter Champ), rechnet das Duell nur mit Grundwerten
  const kit = (id) => meraki.champion(id).then((c) => c.abilities, () => null);
  const [abilA, abilB] = await Promise.all([kit(champId), kit(vsId)]);
  const duel = early.levels(stats(champId), stats(vsId), abilA, abilB);
  try {
    return { ...(await lolalytics.matchup(champId, vsId, position || lastPosition)), duel };
  } catch (e) {
    return { error: e.message, duel };
  }
});

// lolalytics-Vorschlag fürs Stats-Fenster: aus dem Cache; load = true holt ihn (Standard-Rolle des Champs)
ipcMain.handle('suggestion:get', async (_e, champId, load) => {
  const s = lolalytics.cached(champId, gameMode) || (load ? await lolalytics.load(champId, '', gameMode) : null);
  return s && {
    lane: s.lane, url: s.url, fetchedAt: s.fetchedAt, starting: s.starting, items: s.items,
    spells: (s.spells || []).map(ddragon.summoner).filter(Boolean),
    runes: describeRunes(s.runes),
  };
});
ipcMain.handle('bench:get', () => benchInfo);
// Eigene meistgebaute Items für den Champ im aktuellen Modus (SR oder ARAM)
ipcMain.handle('history:items', (_e, champId) => {
  const key = Number(ddragon.championKey(champId));
  const top = history.topItems(key, mapId(), ddragon.finishedItem);
  return { mode: gameMode, games: top.games, items: top.items.slice(0, 8).map((i) => ({ ...i, name: ddragon.itemName(i.id) })) };
});
ipcMain.handle('history:take', (_e, champId) => {
  const top = history.topItems(Number(ddragon.championKey(champId)), mapId(), ddragon.finishedItem);
  const ids = top.items.slice(0, 6).map((i) => i.id);
  if (!ids.length) throw new Error(t('Noch keine eigenen Spiele mit diesem Champion.'));
  saveConfig({ builds: { ...(config.builds || {}), [champId]: ids } });
});
ipcMain.handle('suggestion:take', (_e, champId, what) => {
  const s = lolalytics.cached(champId, gameMode);
  if (!s) throw new Error(t('Kein Vorschlag geladen.'));
  if (what === 'build') saveConfig({ builds: { ...(config.builds || {}), [champId]: s.items } });
  if (what === 'runes' && s.runes) saveConfig({ runes: { ...(config.runes || {}), [champId]: s.runes } });
});
// Runenseiten zur Auswahl: lolalytics-Vorschlag (falls geladen) und Riots empfohlene Seiten für Champion
// und Rolle. Doppelte Seiten fliegen raus. Die Liste wird gemerkt, „Setzen“/„Merken“ geben nur den Index an.
const runeOptions = new Map();
const LANE_TO_POSITION = { top: 'top', jungle: 'jungle', middle: 'middle', bottom: 'bottom', support: 'utility' };
ipcMain.handle('runes:options', async (_e, champId) => {
  const s = suggestionsOn() ? lolalytics.cached(champId, gameMode) : null;
  const position = (champId === lastChampion && lastPosition) || LANE_TO_POSITION[s?.lane] || '';
  const options = [];
  if (s?.runes) options.push({ source: 'lolalytics.com', url: s.url, runes: s.runes });
  const riot = await lcu.recommendedRunePages(config.leaguePath, ddragon.championKey(champId), position, mapId()).catch(() => []);
  riot.forEach((runes) => options.push({ source: t('Riot-Empfehlung'), runes }));
  const seen = new Set();
  const unique = options.filter((o) => {
    const k = o.runes.selectedPerkIds.join(',');
    return !seen.has(k) && seen.add(k);
  });
  runeOptions.set(champId, unique);
  return unique.map((o) => ({ source: o.source, url: o.url, runes: describeRunes(o.runes) }));
});
ipcMain.handle('runes:useOption', async (_e, champId, i, save) => {
  const o = (runeOptions.get(champId) || [])[i];
  if (!o) throw new Error(t('Runenseite nicht mehr verfügbar, bitte neu laden.'));
  if (save) {
    saveConfig({ runes: { ...(config.runes || {}), [champId]: o.runes } });
    return t('Als deine Runen gespeichert.');
  }
  await lcu.applyRunePage(config.leaguePath, o.runes);
  return t('Gesetzt (Seite „{page}“).', { page: lcu.PAGE_NAME });
});
ipcMain.handle('build:itemSet', (_e, champId) => importItemSet(champId));
ipcMain.handle('build:itemSetAuto', (_e, on) => saveConfig({ itemSetAuto: on }));
ipcMain.handle('build:openInChampSelect', (_e, on) => saveConfig({ openInChampSelect: on }));
ipcMain.handle('queue:autoAccept', (_e, on) => {
  saveConfig({ autoAccept: on });
  refreshTrayMenu(); // Häkchen im Tray-Menü mitziehen
});
ipcMain.handle('suggestion:enabled', (_e, on) => saveConfig({ lolalytics: { ...(config.lolalytics || {}), enabled: on } }));
// Quellen-Link im Standardbrowser öffnen, nur lolalytics-Seiten, die Jungle-Tabelle und deren YouTube-Videos
ipcMain.handle('suggestion:open', (_e, url) => {
  if (/^https:\/\/(lolalytics\.com|www\.youtube\.com|youtube\.com)\//.test(url) || url === jungle.SOURCE) shell.openExternal(url);
});

// Maus über Griff, ⚙ oder Einstellungen: Fenster fängt Klicks ab, sonst gehen sie durch zum Spiel
ipcMain.on('ui-hover', (_e, over) => {
  uiCaptured = over;
  if (editMode) return;
  if (over) captureMouse();
  else setPassThrough(true);
});
ipcMain.on('hit-rects', (_e, r) => {
  hitRects = r;
});
ipcMain.on('overlay:settingsOpen', (_e, on) => setSettingsOpen(on));
ipcMain.handle('overlay:set', (_e, patch) => {
  const s = overlaySettings();
  saveConfig({ overlay: { ...s, ...patch, modules: { ...s.modules, ...patch.modules } } });
  return overlaySettings();
});
ipcMain.handle('panel-moved', (_e, pos) => {
  saveConfig({ panel: pos });
});
ipcMain.handle('stats:eog', async () => lcu.endOfGame(config.leaguePath));
ipcMain.handle('stats:history', async () => {
  const h = await lcu.matchHistory(config.leaguePath, 20);
  history.add(h);
  return h;
});
// Spielverläufe aus dem Client (Tode mit Zeit, Werte bei 10/15 min für dich und deinen Lane-Gegner), nur für
// gemerkte Spiele mit vollständigen Werten, neueste zuerst. Der Lane-Gegner kommt bevorzugt aus dem Spielprotokoll
async function fillTimelines(ids) {
  const me = await lcu.currentSummoner(config.leaguePath);
  const list = ids || history.all().filter((g) => g.cs != null).map((g) => g.id).reverse();
  return timelines.fill(list, { fetch: (p) => lcu.get(config.leaguePath, p), puuid: me.puuid,
    opp: (id) => (gamelog.get(id) || {}).oppChamp });
}

// Reiter „Fortschritt“: alle selbst gemerkten Spiele (nicht nur die 20 des Clients); vorher die neuesten übernehmen
ipcMain.handle('stats:progress', async () => {
  try {
    history.add(await lcu.matchHistory(config.leaguePath, 20));
    // Spielverläufe dauern ~0,25 s je Spiel: im Hintergrund nachladen, das Fenster zeichnet danach neu
    fillTimelines().then((n) => n && notifyStats('progress:update')).catch((e) => console.warn('Spielverläufe:', e.message));
  } catch {
    // Client aus: dann eben nur die schon gemerkten Spiele
  }
  return { games: history.all(), lp: gamelog.lpHistory(), goal: config.goal || null, timelines: timelines.all(), logs: gamelog.all() };
});
// Eigene Notizen je Champion (Reiter „Notizen“, Anzeige in „Build & Runen“)
ipcMain.handle('notes:all', () => notes.all());
ipcMain.handle('notes:set', (_e, key, text) => notes.set(key, text));
ipcMain.handle('notes:learn', (_e, key, entry) => notes.learn(key, entry));
// „Letztes Spiel“: Farmys Protokoll zu diesem Spiel, dazu die Historie als Vergleich
ipcMain.handle('stats:review', async (_e, gameId) => {
  await fillTimelines([gameId]).catch(() => {});
  return { log: gamelog.get(gameId), tl: timelines.get(gameId), games: history.all(), goal: config.goal || null };
});
// Session-Ziel (wie eine Challenge): eins zur Zeit, Ergebnis je Spiel für Serie und Quote
ipcMain.handle('goal:set', (_e, goal) => {
  saveConfig({ goal: goal ? { ...goal, since: Date.now(), results: [] } : null });
  return config.goal;
});
ipcMain.handle('goal:result', (_e, gameId, ok) => {
  const g = config.goal;
  if (!g || g.results.some((r) => String(r.gameId) === String(gameId))) return g;
  saveConfig({ goal: { ...g, results: [...g.results, { gameId, ok, at: Date.now() }].slice(-50) } });
  return config.goal;
});
ipcMain.handle('stats:summoner', async () => lcu.currentSummoner(config.leaguePath));
ipcMain.handle('ddragon:champion', (_e, id) => ddragon.champion(id));
ipcMain.handle('ddragon:version', () => ddragon.getVersion());

function toggleOverlay() {
  overlayHidden = !overlayHidden;
  if (overlayHidden) overlay.hide(); // eingeblendet wird beim nächsten Spiel-Abruf
  if (overlayHidden && settingsOpen) setSettingsOpen(false);
  refreshTrayMenu();
}

// Tray-Icon unten rechts: zeigt, dass die App läuft; Klick öffnet die Stats, Rechtsklick das Menü mit Beenden
let tray = null;
// Autostart: beim Start aus dem Quellcode electron.exe mit dem Projektordner eintragen, nicht electron.exe allein
const LOGIN_ITEM = {
  ...(app.isPackaged ? {} : { path: process.execPath }),
  args: [...(app.isPackaged ? [] : [app.getAppPath()]), ...(DATA_DIR_ARG ? [DATA_DIR_ARG] : [])],
};
// League hängt nach einem Vanguard-Fehler: Riot Client, League-Client und Spiel auf einen Klick beenden
async function quitLeague() {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: t('League komplett beenden'),
    message: t('Riot Client, League-Client und ein laufendes Spiel werden sofort beendet.'),
    detail: t('Gedacht für den Fall, dass League nach einem Vanguard-Fehler hängt. Ein laufendes Spiel verlässt du damit; danach League normal neu starten.'),
    buttons: [t('Beenden'), t('Abbrechen')],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return;
  const { before, left } = await riot.quitAll();
  tray.displayBalloon({
    iconType: 'custom',
    icon: nativeImage.createFromPath(APP_PNG),
    title: t('League komplett beenden'),
    content: !before.length ? t('League lief gar nicht.')
      : left.length ? t('Noch nicht beendet: {list}. Dann bitte im Task-Manager.', { list: left.join(', ') })
        : t('League und Riot Client sind beendet. Du kannst League jetzt neu starten.'),
  });
}

// Dasselbe Menü im Tray und hinter dem ☰-Knopf im Stats-Fenster
function appMenu() {
  const keys = config.hotkeys;
  return Menu.buildFromTemplate([
    { label: t('Stats-Fenster öffnen'), accelerator: keys.openStats, click: () => openStats() },
    { type: 'separator' },
    { label: t('Overlay anzeigen'), type: 'checkbox', checked: !overlayHidden, accelerator: keys.toggleOverlay, click: toggleOverlay },
    { label: t('Panel verschieben'), type: 'checkbox', checked: editMode, accelerator: keys.editMode, click: () => setEditMode(!editMode) },
    { label: t('Overlay-Einstellungen'), type: 'checkbox', checked: settingsOpen, click: () => setSettingsOpen(!settingsOpen) },
    {
      label: t('Spiel automatisch annehmen'),
      type: 'checkbox',
      checked: config.autoAccept === true,
      click: (item) => {
        saveConfig({ autoAccept: item.checked });
        notifyStats('autoAccept', item.checked);
      },
    },
    {
      label: t('Mit Windows starten'),
      type: 'checkbox',
      checked: app.getLoginItemSettings(LOGIN_ITEM).openAtLogin,
      click: (item) => app.setLoginItemSettings({ ...LOGIN_ITEM, openAtLogin: item.checked }),
    },
    // Sprachnamen immer in der eigenen Sprache, damit man zurückfindet
    {
      label: 'Sprache / Language',
      submenu: [['de', 'Deutsch'], ['en', 'English']].map(([lang, label]) => ({
        label, type: 'radio', checked: i18n.lang() === lang,
        click: () => setLanguage(lang).catch((e) => console.warn('Sprache:', e.message)),
      })),
    },
    { type: 'separator' },
    { label: t('League komplett beenden …'), click: () => quitLeague().catch((e) => console.warn('League beenden:', e.message)) },
    { type: 'separator' },
    { label: `${APP_NAME} ${app.getVersion()}`, enabled: false },
    ...updateMenu(),
    ...devMenu(),
    { label: t('Beenden'), click: () => app.quit() },
  ]);
}
// Nur FarmyDevBuild: Werkzeuge zum Entwickeln (nicht übersetzt, sieht nur der Entwickler). Dieselben Aktionen
// im Tray-Untermenü „Dev“ und auf der Devtools-Seite im Stats-Fenster
const devTools = (w) => w && !w.isDestroyed() && w.webContents.openDevTools({ mode: 'detach' });
const DEV_ACTIONS = {
  regions: () => toggleDebugRegions(),
  restart: () => { app.relaunch(); app.exit(0); },
  devtoolsOverlay: () => devTools(overlay),
  devtoolsStats: () => { openStats(); devTools(stats); },
  debugDir: () => { fs.mkdirSync(DEBUG_DIR, { recursive: true }); shell.openPath(DEBUG_DIR); },
  testUpdate: () => { updateNotified = null; updateChanged({ status: 'ready', version: '9.9.9' }); },
  ...Object.fromEntries(DEV_FLAGS.map(([k]) => [`flag:${k}`, () => {
    saveConfig({ devFlags: { ...config.devFlags, [k]: !devFlag(k) } });
    if (k === 'clockOcr') screenState.clock = null;
    refreshTrayMenu();
  }])),
};
function devMenu() {
  if (!DEV) return [];
  return [{
    label: 'Dev',
    submenu: [
      { label: 'Lese-Bereiche zeigen', type: 'checkbox', checked: debugRegions, accelerator: DEV_HOTKEYS.debugRegions, click: DEV_ACTIONS.regions },
      ...DEV_FLAGS.map(([k, label]) => ({ label, type: 'checkbox', checked: devFlag(k), click: DEV_ACTIONS[`flag:${k}`] })),
      { type: 'separator' },
      { label: 'Neu starten', click: DEV_ACTIONS.restart },
      { type: 'separator' },
      { label: 'DevTools: Overlay', click: DEV_ACTIONS.devtoolsOverlay },
      { label: 'DevTools: Stats-Fenster', click: DEV_ACTIONS.devtoolsStats },
      { label: 'Debug-Ordner öffnen', click: DEV_ACTIONS.debugDir },
      { label: 'Update-Meldung testen', click: DEV_ACTIONS.testUpdate },
    ],
  }];
}
ipcMain.handle('dev:action', (_e, name) => DEV && DEV_ACTIONS[name] && DEV_ACTIONS[name]());
// Zustand für die Devtools-Seite
ipcMain.handle('dev:info', () => {
  if (!DEV) return null;
  const m = minimapFound;
  return {
    version: `${APP_NAME} ${app.getVersion()} · Electron ${process.versions.electron}`,
    dataDir: DATA_DIR,
    gameArea: gameWindowText(),
    factors: L ? `Auflösung ×${L.factors.res} · HUD ×${L.factors.hud}` : '–',
    game: gameRunning ? `läuft (${lastData ? lastData.gameData.gameMode : '?'})` : 'kein Spiel',
    focused: gameRunning ? (gameFocused(false) ? 'ja' : 'nein – Overlay aus, nichts wird gelesen') : '–',
    minimap: m ? `gefunden: ${m.size} px bei ${m.x}/${m.y}` : 'noch nicht gesucht oder nicht gefunden',
    regions: debugRegions,
    clock: clockOcr() ? `OCR (${screenState.clock == null ? 'noch nicht gelesen' : `${screenState.clock} s`})` : 'Live-API',
    flags: DEV_FLAGS.filter(([k]) => devFlag(k)).map(([, label]) => label).join(' · ') || 'keine',
    deaths: devFlag('deathRecap') ? deathSummary() : '–',
    hud: devFlag('fps') ? `FPS ${screenState.fps ?? '–'} · Ping ${screenState.ping ?? '–'} ms` : '–',
    ult: devFlag('ultIdle') ? `${Math.round(ultIdle.total)} s bereit ungenutzt (längste Phase ${Math.round(ultIdle.longest)} s)` : '–',
    update: updater.state().status,
  };
});
const gameWindowText = () => {
  const w = gamewindow.rect();
  return w ? `${w.width}×${w.height} bei ${w.x}/${w.y}` : 'kein Spielfenster (ganzer Bildschirm)';
};

// Update-Eintrag im Tray: fertig geladen -> neu starten; portable -> Release-Seite; sonst nichts
function updateMenu() {
  const u = updater.state();
  if (u.status === 'ready') return [{ label: t('Neu starten und auf {version} aktualisieren', { version: u.version }), click: () => updater.apply() }];
  if (u.status === 'available') return [{ label: t('Version {version} herunterladen …', { version: u.version }), click: () => updater.apply() }];
  if (u.status === 'downloading') return [{ label: t('Lade Version {version} …', { version: u.version }), enabled: false }];
  return [{ label: t('Nach Updates suchen'), click: () => manualUpdateCheck().catch((e) => console.warn('Update-Suche:', e.message)) }];
}
// Von Hand gesucht: immer eine Antwort zeigen, auch wenn alles aktuell ist
async function manualUpdateCheck() {
  const r = await updater.checkNow();
  if (r.result === 'found' || r.result === 'ready') return; // Meldung kommt über updateChanged, sobald geladen
  const text = {
    latest: [t('Farmy ist aktuell'), t('Du hast die neueste Version ({version}).', { version: r.version })],
    dev: [t('Entwicklerversion'), t('Updates gibt es nur für die installierte Version.')],
    error: [t('Update-Suche fehlgeschlagen'), t('GitHub nicht erreichbar. Später nochmal versuchen.')],
  }[r.result];
  tray.displayBalloon({ iconType: 'custom', icon: nativeImage.createFromPath(APP_PNG), title: text[0], content: text[1] });
}
// Meldung einmal je neuer Version, sobald sie fertig geladen (bzw. bei portable: verfügbar) ist
let updateNotified = null;
function updateChanged(u) {
  refreshTrayMenu();
  if (!tray || updateNotified === `${u.status}|${u.version}` || !['ready', 'available'].includes(u.status)) return;
  updateNotified = `${u.status}|${u.version}`;
  tray.displayBalloon({
    iconType: 'custom',
    icon: nativeImage.createFromPath(APP_PNG),
    title: t('Farmy {version} ist da', { version: u.version }),
    content: u.status === 'ready'
      ? t('Wird beim Beenden installiert. Sofort: Tray-Menü → „Neu starten und aktualisieren“.')
      : t('Die portable Version aktualisiert sich nicht selbst. Tray-Menü → herunterladen.'),
  });
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(appMenu());
  tray.setToolTip(DEV ? `${APP_NAME} ${app.getVersion()}` : t('Farmy {version} läuft', { version: app.getVersion() }));
}

// Sprache umschalten: Namen aus Data Dragon neu laden, Menü neu bauen und beide Fenster neu laden
async function setLanguage(lang) {
  if (lang === i18n.lang()) return;
  i18n.setLang(lang);
  saveConfig({ uiLanguage: lang });
  refreshTrayMenu();
  await ddragon.load(DATA_DIR, DD_LANG[lang]);
  if (overlay && !overlay.isDestroyed()) overlay.webContents.reload();
  if (stats && !stats.isDestroyed()) stats.webContents.reload();
}
// Entwicklerversion? Fürs Stats-Fenster (Name und lila Logo in der Seitenleiste)
ipcMain.on('app:dev', (e) => {
  e.returnValue = DEV;
});
ipcMain.on('i18n:lang', (e) => {
  e.returnValue = i18n.lang();
});
ipcMain.on('menu:popup', (_e, pos) => {
  if (stats && !stats.isDestroyed()) appMenu().popup({ window: stats, x: pos.x, y: pos.y });
});
function createTray() {
  tray = new Tray(APP_ICON);
  tray.on('click', () => openStats());
  refreshTrayMenu();
  // erster Start: zeigen, wo die App steckt
  if (!config.welcomed) {
    tray.displayBalloon({
      iconType: 'custom',
      icon: nativeImage.createFromPath(APP_PNG),
      title: t('Farmy läuft'),

      content: t('Du findest es hier unten rechts im Infobereich. Rechtsklick aufs Icon für Einstellungen und Beenden.'),
    });
    saveConfig({ welcomed: true });
  }
}

// Tastenkürzel: außerhalb des Spiels als globale Hotkeys, im Spiel zusätzlich über die Tastenabfrage (keys.js).
// Falls beide Wege dieselbe Taste sehen, zählt sie nur einmal
const lastHotkey = {};
const hotkeyOnce = (name, run) => () => {
  if (Date.now() - (lastHotkey[name] || 0) < 400) return;
  lastHotkey[name] = Date.now();
  run();
};
const HOTKEYS = {
  toggleOverlay: hotkeyOnce('toggleOverlay', () => toggleOverlay()),
  editMode: hotkeyOnce('editMode', () => setEditMode(!editMode)),
  openStats: hotkeyOnce('openStats', () => openStats({ toggle: true })),
};
// FarmyDevBuild: Lese-Bereiche ein/aus (fest, nicht in config.json)
const DEV_HOTKEYS = { debugRegions: 'Ctrl+Shift+D' };
if (DEV) HOTKEYS.debugRegions = hotkeyOnce('debugRegions', () => toggleDebugRegions());
const hotkeyFor = (name) => config.hotkeys[name] || DEV_HOTKEYS[name];
const hotkeyActions = () => Object.entries(HOTKEYS).map(([name, run]) => ({ accelerator: hotkeyFor(name), run }));

app.whenReady().then(async () => {
  // Sprache der Oberfläche: gespeicherte Wahl, beim ersten Start die von Windows (Deutsch, sonst Englisch)
  if (!config.uiLanguage) saveConfig({ uiLanguage: app.getLocale().startsWith('de') ? 'de' : 'en' });
  i18n.setLang(config.uiLanguage);
  await ddragon.load(app.getPath('userData'), DD_LANG[i18n.lang()]);

  lolalytics.init(app.getPath('userData'));
  meraki.init(app.getPath('userData'));
  history.init(app.getPath('userData'));
  gamelog.init(app.getPath('userData'));
  notes.init(app.getPath('userData'));
  timelines.init(app.getPath('userData'));
  augments.init(app.getPath('userData'));
  arammayhem.init(app.getPath('userData'));
  jungle.init(app.getPath('userData'));
  clears.init(app.getPath('userData'));
  refreshLayout();
  createOverlay();
  createTray();
  updater.start(updateChanged);
  // Auflösung oder Windows-Skalierung geändert (z. B. anderer Monitor als Hauptbildschirm): Overlay mitziehen,
  // Bildschirm-Regionen neu rechnen. Sonst deckte das Overlay nur einen Teil ab und las an falschen Stellen
  screen.on('display-metrics-changed', () => {
    overlay.setBounds(screen.getPrimaryDisplay().bounds);
    refreshLayout();
  });
  // kein Fenster beim Start: die App läuft im Hintergrund (Overlay + Tray), das Stats-Fenster nur auf Wunsch

  for (const [name, run] of Object.entries(HOTKEYS)) {
    if (!globalShortcut.register(hotkeyFor(name), run)) console.warn(`Tastenkürzel ${hotkeyFor(name)} ist belegt`);
  }

  setInterval(pollGame, config.pollMs);
  setInterval(pollClient, 3000);
  setInterval(pollReadyCheck, 1000);
  if (config.ocr && config.ocr.enabled) {
    // ocr.collectDigits: CS-Ausschnitte als Lernmaterial für die eigene Ziffern-Erkennung sammeln
    const collect = config.ocr.collectDigits ? path.join(app.getPath('userData'), 'digit-samples') : null;
    await ocr.init(app.getPath('userData'), { collect });
    screenReading = true;
    if (gameRunning) {
      capture.start().catch((e) => console.warn('Bildschirmaufnahme:', e.message));
      startTabWatch();
    }
    setInterval(pollScreen, 1000);
  }
});

// Overlay läuft im Hintergrund weiter, auch wenn das Stats-Fenster zu ist.
app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => globalShortcut.unregisterAll());
