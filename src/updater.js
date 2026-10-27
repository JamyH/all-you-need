// Automatische Updates aus den GitHub-Releases (electron-updater, liest latest.yml am Release).
// Lädt neue Versionen still im Hintergrund (dank .blockmap nur die geänderten Teile) und installiert sie beim
// Beenden der App; über das Tray-Menü auch sofort. Nie mitten im Spiel: Neustart nur auf Klick.
// Die portable Exe kann sich nicht selbst ersetzen, dort nur ein Hinweis mit Link zum Release.
// Nur in der gebauten App; die Entwicklerversion läuft aus dem Quellcode.
const { app, shell } = require('electron');

const RELEASES = 'https://github.com/JamyH/farmy/releases/latest';
const CHECK_MS = 6 * 60 * 60 * 1000;

let state = { status: 'idle', version: null }; // idle | available | downloading | ready | error
let onChange = () => {};
let updater = null;

const portable = () => !!process.env.PORTABLE_EXECUTABLE_DIR;
const set = (patch) => {
  state = { ...state, ...patch };
  onChange(state);
};

function check() {
  if (!updater) return;
  if (state.status === 'ready') return; // schon geladen, wird beim Beenden installiert
  updater.checkForUpdates().catch((e) => console.warn('Update-Prüfung:', e.message)); // offline: beim nächsten Mal wieder
}

// changed(state) wird bei jeder Änderung aufgerufen (Tray-Menü neu bauen, Meldung zeigen)
function start(changed) {
  onChange = changed;
  if (!app.isPackaged) return;
  ({ autoUpdater: updater } = require('electron-updater'));
  updater.autoDownload = !portable();
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', (info) => set({ status: portable() ? 'available' : 'downloading', version: info.version }));
  updater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }));
  updater.on('error', (e) => {
    console.warn('Update:', e.message);
    if (state.status !== 'ready') set({ status: 'error' }); // fertig geladen bleibt fertig, auch wenn die nächste Prüfung scheitert
  });
  setTimeout(check, 15000); // nicht gleich beim Start, da lädt die App schon Daten
  setInterval(check, CHECK_MS);
}

// „Nach Updates suchen“ von Hand: Ergebnis für eine Rückmeldung an den Nutzer.
// latest = schon aktuell, found = neue Version (lädt bzw. portable: Hinweis), ready = schon geladen,
// dev = Entwicklerversion (kein Updater), error = nicht erreichbar
async function checkNow() {
  if (!updater) return { result: 'dev' };
  if (state.status === 'ready') return { result: 'ready', version: state.version };
  try {
    const r = await updater.checkForUpdates();
    const version = r && r.updateInfo && r.updateInfo.version;
    return r && r.isUpdateAvailable ? { result: 'found', version } : { result: 'latest', version: app.getVersion() };
  } catch (e) {
    return { result: 'error', message: e.message };
  }
}

// Jetzt neu starten und installieren (nur wenn fertig geladen), sonst die Release-Seite öffnen
function apply() {
  if (state.status === 'ready' && updater) updater.quitAndInstall(true, true); // still installieren, danach starten
  else shell.openExternal(RELEASES);
}

module.exports = { start, apply, check, checkNow, state: () => state };
