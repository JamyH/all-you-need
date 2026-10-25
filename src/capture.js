// Main-Seite der Bildschirmaufnahme: unsichtbares Capture-Fenster, liefert auf Anfrage kleine
// RGBA-Ausschnitte { width, height, data }. Fenster und Stream gibt es nur zwischen start() und stop()
// (im Spiel); außerhalb sparen wir so einen Renderer-Prozess (~80 MB).
const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');

let win = null;
let winReady = null; // Promise, bis das Fenster geladen ist
let nextId = 0;
let running = null; // Promise des laufenden Starts bzw. Streams, null = aus
const pending = new Map();

ipcMain.on('capture:grabbed', (_e, reqId, crops, err) => {
  const p = pending.get(reqId);
  if (!p) return;
  pending.delete(reqId);
  err ? p.reject(new Error(err)) : p.resolve(crops);
});

function ensureWindow() {
  if (!winReady) {
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload-capture.js'),
        backgroundThrottling: false,
      },
    });
    win.webContents.on('console-message', (_e, level, msg) => level >= 2 && console.warn('capture:', msg));
    winReady = win.loadFile(path.join(__dirname, '..', 'renderer', 'capture.html'));
  }
  return winReady;
}

// Stream starten (Spielbeginn). Mehrfache Aufrufe warten auf denselben Start.
function start() {
  if (!running) {
    // current(): ist dieser Start noch gewollt? (stop() kann kommen, während open() noch wartet)
    const p = open(() => running === p).catch((e) => {
      if (running === p) running = null;
      throw e;
    });
    running = p;
  }
  return running;
}

// Fenster schließen beendet auch den Stream
function stop() {
  running = null;
  const w = win;
  win = winReady = null;
  if (w && !w.isDestroyed()) w.destroy();
}

async function open(current) {
  await ensureWindow().catch(() => {}); // Laden bricht ab, wenn stop() das Fenster schon geschlossen hat
  const w = win; // stop() kann das Fenster zwischendurch schließen
  if (!current() || !w) return;
  // thumbnailSize 0: nur die Quell-ID holen, kein Bild
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  if (!current() || w.isDestroyed()) return;
  const primary = String(screen.getPrimaryDisplay().id);
  const src = sources.find((s) => s.display_id === primary) || sources[0];
  await new Promise((resolve, reject) => {
    const closed = () => reject(new Error('Bildschirmaufnahme beendet'));
    w.once('closed', closed);
    ipcMain.once('capture:ready', (_e, err) => {
      w.removeListener('closed', closed);
      err ? reject(new Error(err)) : resolve();
    });
    w.webContents.send('capture:start', src.id);
  });
}

function request(payload) {
  if (!win || win.isDestroyed()) return Promise.reject(new Error('Bildschirmaufnahme läuft nicht'));
  const reqId = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    win.webContents.send('capture:grab', reqId, payload);
    setTimeout(() => pending.delete(reqId) && reject(new Error('capture timeout')), 3000);
  });
}

const grab = (regions) => request(regions);
// Scoreboard-Anker suchen; region = kleiner Ausschnitt um die letzte Position oder null für den ganzen Bildschirm
// scale = Bildschirmhöhe / 1440, damit die Suche bei jeder Auflösung mit denselben Maßen arbeitet
const findScoreboard = (region, scale = 1) => request({ scoreboard: region, scale });

module.exports = { start, stop, grab, findScoreboard };
