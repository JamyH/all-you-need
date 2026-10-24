// Rendert das Overlay-Panel mit den letzten Spieldaten nach debug/panel.png (das echte Overlay ist vor Aufnahmen geschützt).
// Start: npx electron tools/render-panel.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..');
  const { summary } = JSON.parse(fs.readFileSync(path.join(root, 'debug', 'last-game.json'), 'utf8'));
  // --nomana: Mana künstlich unter die Combo-Kosten setzen, um die Warnung zu sehen
  if (process.argv.includes('--nomana') && summary.mana) {
    summary.mana.value = Math.floor((summary.mana.combo || 100) * 0.6);
    summary.mana.percent = Math.round((summary.mana.value / summary.mana.max) * 100);
    summary.mana.low = true;
  }
  // --build / --recall: Spar-Ziel unterwegs bzw. bezahlbar
  if (process.argv.includes('--build') || process.argv.includes('--recall')) {
    const recall = process.argv.includes('--recall');
    summary.build = { name: 'Stärke der Dreieinigkeit', missing: recall ? 0 : 420, progress: recall ? 100 : 87, affordable: recall };
  }
  const out = process.argv.includes('--nomana') ? 'panel-nomana.png'
    : process.argv.includes('--recall') ? 'panel-recall.png'
    : process.argv.includes('--build') ? 'panel-build.png' : 'panel.png';
  const win = new BrowserWindow({
    width: 320, height: 480, show: false, backgroundColor: '#2a3a2a',
    webPreferences: { preload: path.join(root, 'preload.js') },
  });
  await win.loadFile(path.join(root, 'renderer', 'overlay.html'));
  win.webContents.send('panel-pos', { x: 20, y: 50 });
  win.webContents.send('game', summary);
  await new Promise((r) => setTimeout(r, 1500)); // Webfonts laden lassen
  fs.writeFileSync(path.join(root, 'debug', out), (await win.webContents.capturePage()).toPNG());
  app.quit();
});
