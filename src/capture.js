// Main-Seite der Bildschirmaufnahme: startet das unsichtbare Capture-Fenster
// und liefert auf Anfrage kleine RGBA-Ausschnitte { width, height, data }.
// Der Stream selbst läuft nur zwischen start() und stop() (im Spiel).
const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');

let win = null;
let nextId = 0;
let running = null; // Promise des laufenden Starts bzw. Streams, null = aus
const pending = new Map();

ipcMain.on('capture:grabbed', (_e, reqId, crops, err) => {
  const p = pending.get(reqId);
  if (!p) return;
  pending.delete(reqId);
  err ? p.reject(new Error(err)) : p.resolve(crops);
});

async function init() {
  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-capture.js'),
      backgroundThrottling: false,
    },
  });
  win.webContents.on('console-message', (_e, level, msg) => level >= 2 && console.warn('capture:', msg));
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'capture.html'));
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

function stop() {
  if (!running || !win) return;
  running = null;
  win.webContents.send('capture:stop');
}

async function open(current) {
  // thumbnailSize 0: nur die Quell-ID holen, kein Bild
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  if (!current()) return;
  const primary = String(screen.getPrimaryDisplay().id);
  const src = sources.find((s) => s.display_id === primary) || sources[0];
  await new Promise((resolve, reject) => {
    ipcMain.once('capture:ready', (_e, err) => (err ? reject(new Error(err)) : resolve()));
    win.webContents.send('capture:start', src.id);
  });
  if (!current()) win.webContents.send('capture:stop');
}

function request(payload) {
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

module.exports = { init, start, stop, grab, findScoreboard };
