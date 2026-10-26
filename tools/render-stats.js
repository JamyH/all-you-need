// Rendert das Stats-Fenster (Tabs "Verlauf" und "Build & Runen") mit echten Client-Daten nach debug/stats-*.png.
// Schreibt nichts in die Config. Start: npx electron tools/render-stats.js
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const ddragon = require('../src/ddragon');
const lcu = require('../src/lcu');
const lang = require('./lang');

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
  await ddragon.load(app.getPath('userData'), lang.ddLang);
  const lp = config.leaguePath;
  // Beispiel-Build nur für das Bild, wenn noch keiner gespeichert ist
  const builds = Object.keys(config.builds || {}).length ? config.builds : { Jax: [3078, 3153, 3047] };
  ipcMain.handle('stats:eog', () => lcu.endOfGame(lp));
  ipcMain.handle('stats:history', () => lcu.matchHistory(lp, 20));
  ipcMain.handle('stats:summoner', () => lcu.currentSummoner(lp));
  ipcMain.handle('ddragon:champion', (_e, id) => ddragon.champion(id));
  ipcMain.handle('ddragon:version', () => ddragon.getVersion());
  // Live-Tab: echte Live-Daten, Ränge direkt aus dem Client
  const live = require('../src/live');
  ipcMain.handle('live:data', async () => {
    const data = await live.fetchGame();
    if (!data) return null;
    const ranks = new Map();
    for (const p of await lcu.gamePlayers(lp).catch(() => [])) {
      if (p.puuid) ranks.set(ddragon.champion(p.championKey).id, (await lcu.soloRank(lp, p.puuid).catch(() => null)) || { unranked: true });
    }
    return live.livePlayers(data, ranks);
  });
  ipcMain.handle('build:data', () => ({
    champions: ddragon.championList(), items: ddragon.itemList(), builds, runes: {}, runesAuto: true, current: 'Jax',
  }));
  const win = new BrowserWindow({ width: 1000, height: 900, show: false, backgroundColor: '#0f1117',
    webPreferences: { preload: path.join(root, 'preload.js') } });
  await win.loadFile(path.join(root, 'renderer', 'stats.html'));
  await new Promise((r) => setTimeout(r, 3000));
  // --docs: eigenen Riot-Namen für öffentliche Screenshots durch „Du“ ersetzen
  const docs = process.argv.includes('--docs');
  // Kopfzeile und die eigene Zeile im Live-Tab tragen den Namen; beides wird überschrieben
  const anonymize = docs ? `(() => {
    window.__docs = true;
    document.getElementById('who').textContent = 'Farmy';
    document.querySelectorAll('tr.me .sub').forEach((el) => (el.textContent = 'Du'));
  })()` : '0';
  for (const tab of ['live', 'history', 'build']) {
    await win.webContents.executeJavaScript(`document.querySelector('nav button[data-tab="${tab}"]').click()`);
    await new Promise((r) => setTimeout(r, 800));
    await win.webContents.executeJavaScript(anonymize);
    fs.writeFileSync(path.join(root, 'debug', `stats-${tab}${lang.suffix}.png`), (await win.webContents.capturePage()).toPNG());

  }
  app.quit();
});
