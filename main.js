const { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// --data-dir=<Ordner> legt Einstellungen, Caches und Debug-Dateien woandershin als %APPDATA%
// (z. B. wenn C: voll ist). Muss vor der Instanz-Sperre stehen, die hängt am Datenordner.
const DATA_DIR_ARG = process.argv.find((a) => a.startsWith('--data-dir='));
if (DATA_DIR_ARG) app.setPath('userData', path.resolve(DATA_DIR_ARG.slice('--data-dir='.length)));

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
const capture = require('./src/capture');
const setup = require('./src/setup');
const layout = require('./src/layout');
const lolalytics = require('./src/lolalytics');
const history = require('./src/history');
const augments = require('./src/augments');
const arammayhem = require('./src/arammayhem');
const anvil = require('./src/anvil');
const keys = require('./src/keys');
const riot = require('./src/riot');

// Config und Debug-Dateien liegen unter %APPDATA%\All You Need, beim Start aus dem Quellcode genauso wie in
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
const OVERLAY_DEFAULTS = { modules: {}, scale: 1, bgTransparency: 30, hoverTransparency: 20, clickThrough: true, compact: false };
const overlaySettings = () => ({
  ...OVERLAY_DEFAULTS,
  ...config.overlay,
  modules: { ...(config.overlay && config.overlay.modules) },
});
// Modul an? Ausgeschaltete Module sparen auch die Bildschirm-Erkennung (Cooldowns, Augments, Scoreboard)
const moduleOn = (key) => overlaySettings().modules[key] !== false;

const APP_ICON = path.join(__dirname, 'assets', 'icon.ico');
// eigener Eintrag in der Taskleiste statt „Electron“ (gleiche ID wie die Verknüpfungen des Installers)
app.setAppUserModelId('com.jamyh.allyouneed');

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
  if (!overlay || !overlay.isVisible()) return;
  const p = screen.getCursorScreenPoint();
  const b = overlay.getBounds();
  const x = p.x - b.x, y = p.y - b.y;
  // Hover-Transparenz: Panel wird durchsichtiger, solange die Maus darüber steht (auch mit Klick-durch)
  const hover = inRect(hitRects.panel, x, y, 0);
  if (hover !== panelHover) {
    panelHover = hover;
    overlay.webContents.send('panel-hover', hover);
  }
  if (editMode || uiCaptured) return;
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
function openStats(opts = {}) {
  const { tab, inactive } = opts;
  const auto = !!(inactive || opts.auto);
  if (stats && !stats.isDestroyed()) {
    if (!auto) statsUsed = true;
    if (stats.isMinimized()) stats.restore();
    if (tab) stats.webContents.send('show-tab', tab);
    return inactive ? stats.showInactive() : stats.focus();
  }
  statsUsed = !auto;
  stats = new BrowserWindow({
    width: 1000,
    height: 720,
    title: 'All You Need',
    icon: APP_ICON,
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  stats.once('ready-to-show', () => (inactive ? stats.showInactive() : stats.show()));
  if (tab) stats.webContents.once('did-finish-load', () => stats.webContents.send('show-tab', tab));
  stats.loadFile('renderer/stats.html');
  // beim ersten Schließen einmal erklären, dass die App im Hintergrund weiterläuft
  stats.on('closed', () => {
    if (statsAutoClosing) return (statsAutoClosing = false);
    if (config.closedHint || !tray) return;
    tray.displayBalloon({
      iconType: 'custom',
      icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')),
      title: 'All You Need läuft weiter',
      content: 'Das Overlay bleibt aktiv. Beenden über Rechtsklick aufs Icon hier unten rechts.',
    });
    saveConfig({ closedHint: true });
  });
}

function closeUnusedStats() {
  if (!stats || stats.isDestroyed() || statsUsed) return;
  statsAutoClosing = true;
  stats.close();
}
ipcMain.on('stats:used', () => {
  statsUsed = true;
});

function setEditMode(on) {
  editMode = on;
  if (on) captureMouse();
  else setPassThrough(false);
  overlay.setFocusable(on);
  overlay.webContents.send('edit-mode', on);
  if (on) overlay.showInactive();
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
    icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')),
    title: 'League läuft im Vollbild',
    content: 'Dort ist das Overlay nicht zu sehen. Im Spiel: Einstellungen → Video → Fenstermodus „Randlos“.',
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
    heapMb: Math.round(process.memoryUsage().heapUsed / 1048576) };
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.appendFileSync(path.join(DEBUG_DIR, 'perf.log'), JSON.stringify(row) + '\n');
  } catch {
    // Messung ist nur Beiwerk
  }
}

async function pollGame() {
  const data = await live.fetchGame();
  if (data) gameMode = data.gameData.mapNumber === 12 ? 'aram' : 'sr';
  const summary = data
    ? live.applySkills(
        live.applyBuild(live.applyMana(live.applyScreen(live.summarize(data), screenState, config.minionXp), config.mana), buildFor),
        (champId) => (suggestionsOn() ? lolalytics.cached(champId, gameMode) : null),
      )
    : null;
  if (summary && !gameRunning) {
    refreshLayout(); // Spielstart: HUD-Skalierung könnte sich geändert haben
    closeUnusedStats();
    warnFullscreen();
    if (screenReading) capture.start().catch((e) => console.warn('Bildschirmaufnahme:', e.message));
    if (screenReading) startTabWatch();
  }
  if (!summary && gameRunning) {
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
  meDead = !!(summary && summary.isDead);
  if (summary) summary.scoreboard = live.scoreboard(data);
  if (summary) summary.augments = screenState.augments || null;
  // Debug-Abzug nur in der Entwicklerversion (100 KB alle 5 s wären für Nutzer nur Schreiblast)
  if (data && !app.isPackaged && Date.now() - lastDump > 5000) {
    lastDump = Date.now();
    try {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
      fs.writeFileSync(path.join(DEBUG_DIR, 'last-game.json'), JSON.stringify({ summary, data }, null, 2));
    } catch (e) {
      console.warn('Debug-Datei:', e.message); // z. B. Platte voll: das Overlay muss trotzdem weiterlaufen
    }
  }
  if (summary && !overlayHidden) {
    if (!overlay.isVisible()) overlay.showInactive();
    raiseOverlay();
    overlay.webContents.send('game', summary);
  } else if (!summary && overlay.isVisible() && !editMode && !settingsOpen) {
    overlay.hide();
  }
}

// Bildschirm auslesen, nur während ein Spiel läuft. Jede Sekunde ein Mini-Ausschnitt-Paket aus dem Stream;
// Texterkennung nur wenn nötig: CS alle ocr.intervalMs, Spell-Restzeit einmal pro Cooldown (+ Abgleich alle 15 s).
let gameRunning = false;
let screenReading = false; // Bildschirm-Erkennung eingeschaltet (config.ocr.enabled) und bereit
let screenState = { cs: null, xp: null, spells: {}, items: {} };
let lastItems = []; // Inventar aus der Live-API, damit die Bildschirm-Abfrage nur belegte Item-Slots liest
let meDead = false; // tot: Bildschirm grau, Cooldown-Erkennung der Summoner unzuverlässig

// Regionen aus Auflösung und HUD-Größe (game.cfg) berechnen; neu bei jedem Spielstart,
// falls die HUD-Skalierung inzwischen geändert wurde
let L = null;
// game.cfg alle paar Sekunden auf Änderungen prüfen: League schreibt die HUD-Skalierung sofort,
// wenn sie im Spiel geändert wird (nur Änderungszeit lesen, kostet praktisch nichts)
let cfgMtime = 0;
let cfgChecked = 0;
function checkHudChange() {
  if (Date.now() - cfgChecked < 3000) return;
  cfgChecked = Date.now();
  try {
    const m = fs.statSync(path.join(config.leaguePath, 'Config', 'game.cfg')).mtimeMs;
    if (cfgMtime && m !== cfgMtime) refreshLayout();
    cfgMtime = m;
  } catch {
    // game.cfg fehlt -> Standardwerte bleiben
  }
}
function refreshLayout() {
  const d = screen.getPrimaryDisplay();
  const hud = setup.readHudScale(config.leaguePath);
  L = layout.compute(Math.round(d.size.width * d.scaleFactor), Math.round(d.size.height * d.scaleFactor), hud || 0);
  console.log('Layout', JSON.stringify(L.factors), 'HUD-Skalierung', hud);
}
const sbAnchor = () =>
  config.scoreboard.anchor || { x: Math.round(screen.getPrimaryDisplay().size.width * screen.getPrimaryDisplay().scaleFactor / 2), y: Math.round(406 * L.factors.res) };
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
  const pos = (i) => ({ x: L.augments[i].x, y: L.augments[i].badgeY });
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
    const t = arammayhem.tier(id, lastChampion, champName);
    return { ...pos(i), tier: t ? t.tier : null, why: t ? t.why : 'keine Daten', credit: true };
  });
}

let ocrBusy = false;
let lastCsRead = 0;
async function pollScreen() {
  if (!gameRunning || ocrBusy) return;
  ocrBusy = true;
  try {
    checkHudChange();
    // im ⚙ abgeschaltete Cooldown-Anzeigen werden gar nicht erst gelesen
    const slots = moduleOn('spells') ? Object.entries(L.spells) : [];
    const readCs = Date.now() - lastCsRead >= config.ocr.intervalMs;
    const items = moduleOn('items') ? lastItems.filter((it) => it.slot < 6) : [];
    const regions = [...slots.map(([, r]) => r), ...items.map((it) => L.items[it.slot])];
    if (readCs) regions.push(L.cs, ocr.xpBox(L.xpArc));
    // Mayhem: Augment-Angebote kommen auch lebend (z. B. Stufe 7 auf der Lane), daher immer nachsehen. Der
    // Rahmen-Check kostet fast nichts, Texterkennung läuft nur bei offenem Angebot und geänderter Karte
    const watchAugments = !!lastData && lastData.gameData.gameMode === 'KIWI' && moduleOn('augments');
    if (watchAugments) regions.push(...L.augments.map((a) => a.frame), ...L.augments.map((a) => a.name));
    const crops = await capture.grab(regions);
    const augCrops = watchAugments ? crops.splice(crops.length - 6, 6) : null;
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
      if (!ocr.spellOnCooldown(crops[i])) {
        // Mitten im Countdown „bereit“ nicht sofort glauben: tot ist der Bildschirm grau, dann fehlt das Blau
        // des Cooldowns, obwohl der Summoner nicht bereit ist. Tot -> ignorieren, sonst erst beim zweiten Mal
        const left = prev && !prev.ready && prev.cd != null ? prev.cd - (Date.now() - prev.at) / 1000 : 0;
        if (left > 3 && (meDead || !prev.readySeen)) prev.readySeen = !meDead;
        else screenState.spells[slot] = { ready: true };
      } else if (prev && prev.readySeen) {
        prev.readySeen = false; // war nur ein Ausreißer, Countdown läuft weiter
      } else if (!prev || prev.ready || prev.cd == null || Date.now() - prev.at > 10000) {
        // Zahl lesen beim Start des Cooldowns und danach alle 10 s zum Abgleich
        const cd = await ocr.readSpellCd(crops[i]);
        // Kein Summoner startet mit weniger als 10 s. Solche Werte sind Fehllesungen, z. B. die weiße Kugel
        // im Flash-Icon, das wegen seines Blaus immer nach Cooldown aussieht
        const fresh = !prev || prev.ready;
        // Beim Abgleich kann die Restzeit nur sinken. Springt sie hoch, war es eine Fehllesung: weiter
        // runterzählen und erst beim nächsten Abgleich wieder lesen
        const left = fresh || prev.cd == null ? null : prev.cd - (Date.now() - prev.at) / 1000;
        if (left != null && cd != null && cd > left + 3) screenState.spells[slot] = { ready: false, cd: Math.max(0, Math.round(left)), at: Date.now() };
        else if (cd != null && !(fresh && cd < 10)) screenState.spells[slot] = { ready: false, cd, at: Date.now() };
        else if (fresh) screenState.spells[slot] = { ready: true };
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

// Tab-Scoreboard: die Tab-Taste steuert Ein- und Ausblenden sofort (Taste wird nur gelesen, das Spiel
// bekommt sie normal). Kurz nach dem Drücken bestätigt ein Pixel-Check, dass das Scoreboard wirklich offen ist
// und wo es liegt (es lässt sich verschieben); neuer Anker wird gespeichert, sonst wird wieder ausgeblendet.
let sbOpen = false;
let tabDown = false;
let tabPressId = 0;

function sendScoreboard(open, anchor) {
  sbOpen = open;
  overlay.webContents.send('scoreboard-state', { open, anchor: anchor || sbAnchor(), offsets: L.scoreboard.offsets });
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

// Läuft nur während eines Spiels (Start/Ende in pollGame)
function startTabWatch() {
  if (!config.scoreboard || !config.scoreboard.enabled) return;
  keys.start(
    () => {
      if (!moduleOn('scoreboard')) return; // im ⚙ abgeschaltet: auch keine Scoreboard-Suche
      tabDown = true;
      tabPressId++;
      sendScoreboard(true);
      confirmScoreboard(tabPressId);
    },
    () => {
      tabDown = false;
      if (sbOpen) sendScoreboard(false);
    },
  );
}
function stopTabWatch() {
  keys.stop();
  tabDown = false;
  if (sbOpen) sendScoreboard(false);
}

// Zuletzt gespielter / gewählter Champion (Data-Dragon-ID), Vorauswahl im Build-Editor
let lastChampion = null;
let lastRuneKey = null;
let lastSuggestionKey = null;
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
  if (!rune) throw new Error(`Für ${champId} ist keine Runenseite gespeichert.`);
  await lcu.applyRunePage(config.leaguePath, rune);
  return `Runen für ${champId} gesetzt (Seite „${lcu.PAGE_NAME}“).`;
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
    source = 'Riot-Empfehlung';
  }
  const ownRunes = (config.runes || {})[champId];
  if (ownRunes || config.runesAuto === false) return;
  if (!rune) rune = await lcu.recommendedRunes(config.leaguePath, key, position, mapId()).catch(() => null);
  if (!rune) return;
  await lcu.applyRunePage(config.leaguePath, rune);
  notifyStats('runes:status', `Runen für ${champId} von ${source} gesetzt (Seite „${lcu.PAGE_NAME}“).`);
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
    source = 'Riot-Empfehlung';
    rec = await lcu.recommendedSpells(config.leaguePath, key, position, mapId()).catch(() => null);
  }
  if (!rec) return 'Summoner: keine Empfehlung gefunden.';
  const [d, f] = placeSpells(current, rec);
  const name = (k) => ddragon.summoner(k)?.name || k;
  if (d === current[0] && f === current[1]) return `Summoner ${name(d)} (D) + ${name(f)} (F) passen schon (${source}).`;
  await lcu.applySpells(config.leaguePath, d, f);
  return `Summoner ${name(d)} (D) + ${name(f)} (F) von ${source} gesetzt.`;
}

// Item-Set „All You Need – Champ“ in den Client schreiben, im Spiel im Shop wählbar: eigener Build
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
  if (ownBuild(champId)) blocks.push({ title: 'Dein Build (All You Need)', items: withParts(config.builds[champId]) });
  if (s) {
    blocks.push({ title: 'Start – lolalytics.com', items: s.starting.map((id) => ({ id, count: (s.startCount || {})[id] || 1 })) });
    // Kern-Build erst ohne Teile als Überblick, dann jedes Item mit seinen Teilen in Kaufreihenfolge
    blocks.push({ title: 'Kern-Build – lolalytics.com', items: s.items.slice(0, 3).map((id) => ({ id })) });
    s.items.slice(0, 3).forEach((id, i) => blocks.push({ title: `${i + 1}. ${ddragon.itemName(id)} – Teile`, items: withParts([id]) }));
    if (s.items.length > 3) blocks.push({ title: 'Danach – lolalytics.com', items: withParts(s.items.slice(3)) });
  }
  if (!key || !blocks.length) throw new Error(`Für ${champId} gibt es weder eigenen Build noch Vorschlag.`);
  const name = ddragon.champion(key).name;
  const label = s && (s.mode === 'aram' ? 'ARAM' : LANE_LABEL[s.lane]);
  await lcu.applyItemSet(config.leaguePath, key, `All You Need – ${name}${label ? ` ${label}` : ''}`, blocks, mapId());
  return `Item-Set „All You Need – ${name}“ ist im Client, im Spiel im Shop wählbar.`;
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
    await refreshAugmentNames();
  } catch (e) {
    // Client noch nicht bereit, beim nächsten Abfragen erneut
  }
}

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
    lastRuneKey = lastSuggestionKey = null;
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
            .then((msg) => notifyStats('spells:status', msg), (e) => notifyStats('spells:status', `Summoner: ${e.message}`));
        }
        if (config.itemSetAuto !== false) {
          importItemSet(champId).then((msg) => notifyStats('build:status', msg), (e) => notifyStats('build:status', `Item-Set: ${e.message}`));
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

// „Bildschirm-Erkennung prüfen“: zeigt die ausgeschnittenen Bereiche und was daraus gelesen wird
ipcMain.handle('calib:check', async () => {
  if (!gameRunning) throw new Error('Nur im laufenden Spiel möglich.');
  refreshLayout();
  const slotItems = lastItems.filter((it) => it.slot < 6);
  const regions = [L.cs, L.spells.d, L.spells.f, ocr.xpBox(L.xpArc), ...slotItems.map((it) => L.items[it.slot])];
  const crops = await capture.grab(regions);
  const toUrl = (c) => {
    const bgra = Buffer.from(c.data);
    for (let i = 0; i < bgra.length; i += 4) [bgra[i], bgra[i + 2]] = [bgra[i + 2], bgra[i]];
    return nativeImage.createFromBitmap(bgra, { width: c.width, height: c.height }).toDataURL();
  };
  const spell = async (c) => (ocr.spellOnCooldown(c) ? `Cooldown ${await ocr.readSpellCd(c)}` : 'bereit');
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
        return { label: it.name, img: toUrl(crops[4 + i]), value: cd == null ? 'kein Cooldown' : `Cooldown ${cd}` };
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
  if (lastPhase !== 'ChampSelect') return 'Summoner lassen sich nur in der Champ-Auswahl setzen.';
  const sel = await lcu.champSelect(config.leaguePath);
  if (!sel.key) return 'Erst einen Champion wählen.';
  return applySpells(ddragon.champion(sel.key).id, sel.key, sel.position, sel.spells);
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
  if (!ids.length) throw new Error('Noch keine eigenen Spiele mit diesem Champion.');
  saveConfig({ builds: { ...(config.builds || {}), [champId]: ids } });
});
ipcMain.handle('suggestion:take', (_e, champId, what) => {
  const s = lolalytics.cached(champId, gameMode);
  if (!s) throw new Error('Kein Vorschlag geladen.');
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
  riot.forEach((runes) => options.push({ source: 'Riot-Empfehlung', runes }));
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
  if (!o) throw new Error('Runenseite nicht mehr verfügbar, bitte neu laden.');
  if (save) {
    saveConfig({ runes: { ...(config.runes || {}), [champId]: o.runes } });
    return 'Als deine Runen gespeichert.';
  }
  await lcu.applyRunePage(config.leaguePath, o.runes);
  return `Gesetzt (Seite „${lcu.PAGE_NAME}“).`;
});
ipcMain.handle('build:itemSet', (_e, champId) => importItemSet(champId));
ipcMain.handle('build:itemSetAuto', (_e, on) => saveConfig({ itemSetAuto: on }));
ipcMain.handle('build:openInChampSelect', (_e, on) => saveConfig({ openInChampSelect: on }));
ipcMain.handle('queue:autoAccept', (_e, on) => {
  saveConfig({ autoAccept: on });
  refreshTrayMenu(); // Häkchen im Tray-Menü mitziehen
});
ipcMain.handle('suggestion:enabled', (_e, on) => saveConfig({ lolalytics: { ...(config.lolalytics || {}), enabled: on } }));
// Quellen-Link im Standardbrowser öffnen, nur lolalytics-Seiten
ipcMain.handle('suggestion:open', (_e, url) => {
  if (/^https:\/\/lolalytics\.com\//.test(url)) shell.openExternal(url);
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
    title: 'League komplett beenden',
    message: 'Riot Client, League-Client und ein laufendes Spiel werden sofort beendet.',
    detail: 'Gedacht für den Fall, dass League nach einem Vanguard-Fehler hängt. Ein laufendes Spiel verlässt du damit; danach League normal neu starten.',
    buttons: ['Beenden', 'Abbrechen'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return;
  const { before, left } = await riot.quitAll();
  tray.displayBalloon({
    iconType: 'custom',
    icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')),
    title: 'League komplett beenden',
    content: !before.length ? 'League lief gar nicht.'
      : left.length ? `Noch nicht beendet: ${left.join(', ')}. Dann bitte im Task-Manager.`
        : 'League und Riot Client sind beendet. Du kannst League jetzt neu starten.',
  });
}

// Dasselbe Menü im Tray und hinter dem ☰-Knopf im Stats-Fenster
function appMenu() {
  const keys = config.hotkeys;
  return Menu.buildFromTemplate([
    { label: 'Stats-Fenster öffnen', accelerator: keys.openStats, click: openStats },
    { type: 'separator' },
    { label: 'Overlay anzeigen', type: 'checkbox', checked: !overlayHidden, accelerator: keys.toggleOverlay, click: toggleOverlay },
    { label: 'Panel verschieben', type: 'checkbox', checked: editMode, accelerator: keys.editMode, click: () => setEditMode(!editMode) },
    { label: 'Overlay-Einstellungen', type: 'checkbox', checked: settingsOpen, click: () => setSettingsOpen(!settingsOpen) },
    {
      label: 'Spiel automatisch annehmen',
      type: 'checkbox',
      checked: config.autoAccept === true,
      click: (item) => {
        saveConfig({ autoAccept: item.checked });
        notifyStats('autoAccept', item.checked);
      },
    },
    {
      label: 'Mit Windows starten',
      type: 'checkbox',
      checked: app.getLoginItemSettings(LOGIN_ITEM).openAtLogin,
      click: (item) => app.setLoginItemSettings({ ...LOGIN_ITEM, openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'League komplett beenden …', click: () => quitLeague().catch((e) => console.warn('League beenden:', e.message)) },
    { type: 'separator' },
    { label: `All You Need ${app.getVersion()}`, enabled: false },
    { label: 'Beenden', click: () => app.quit() },
  ]);
}
function refreshTrayMenu() {
  if (tray) tray.setContextMenu(appMenu());
}
ipcMain.on('menu:popup', (_e, pos) => {
  if (stats && !stats.isDestroyed()) appMenu().popup({ window: stats, x: pos.x, y: pos.y });
});
function createTray() {
  tray = new Tray(APP_ICON);
  tray.setToolTip(`All You Need ${app.getVersion()} läuft`);
  tray.on('click', openStats);
  refreshTrayMenu();
  // erster Start: zeigen, wo die App steckt
  if (!config.welcomed) {
    tray.displayBalloon({
      iconType: 'custom',
      icon: nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')),
      title: 'All You Need läuft',
      content: 'Du findest es hier unten rechts im Infobereich. Rechtsklick aufs Icon für Einstellungen und Beenden.',
    });
    saveConfig({ welcomed: true });
  }
}

app.whenReady().then(async () => {
  await ddragon.load(app.getPath('userData'), config.language);
  lolalytics.init(app.getPath('userData'));
  history.init(app.getPath('userData'));
  augments.init(app.getPath('userData'));
  arammayhem.init(app.getPath('userData'));
  refreshLayout();
  createOverlay();
  createTray();
  openStats({ auto: true });

  const hk = config.hotkeys;
  globalShortcut.register(hk.toggleOverlay, toggleOverlay);
  globalShortcut.register(hk.editMode, () => setEditMode(!editMode));
  globalShortcut.register(hk.openStats, openStats);

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
