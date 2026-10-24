// Main-Seite der Bildschirmaufnahme: startet das unsichtbare Capture-Fenster
// und liefert auf Anfrage kleine RGBA-Ausschnitte { width, height, data }.
const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const path = require('path');

let win = null;
let nextId = 0;
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
  // thumbnailSize 0: nur die Quell-ID holen, kein Bild
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const primary = String(screen.getPrimaryDisplay().id);
  const src = sources.find((s) => s.display_id === primary) || sources[0];
  await new Promise((resolve, reject) => {
    ipcMain.once('capture:ready', (_e, err) => (err ? reject(new Error(err)) : resolve()));
    win.webContents.send('capture:start', src.id);
  });
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
const findScoreboard = (region) => request({ scoreboard: region });

module.exports = { init, grab, findScoreboard };
