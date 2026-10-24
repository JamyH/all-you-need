// Rendert die Tab-Ansicht über debug/screen_4.png (Scoreboard-Screenshot) nach debug/scoreboard-overlay.png.
// Start: npx electron tools/render-scoreboard.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
  const { summary, data } = JSON.parse(fs.readFileSync(path.join(root, 'debug', 'last-game.json'), 'utf8'));
  const live = require('../src/live');
  await require('../src/ddragon').load(app.getPath('userData'), config.language);
  summary.scoreboard = live.scoreboard(data);
  // --long: große Diffs testen, ob die Badges noch über den Ward-Slot passen
  if (process.argv.includes('--long')) {
    [12345, -2950, 1275, -48000, 640].forEach((d, i) => summary.scoreboard.rows[i] && (summary.scoreboard.rows[i].diff = d));
  }
  const win = new BrowserWindow({
    width: 3440, height: 1440, show: false, frame: false, useContentSize: true,
    webPreferences: { preload: path.join(root, 'preload.js') },
  });
  await win.loadFile(path.join(root, 'renderer', 'overlay.html'));
  // Magenta-Hintergrund, wird danach in Python durch den Screenshot ersetzt (CSP blockt file://-Bilder)
  await win.webContents.insertCSS('html,body{background:#ff00ff !important}');
  win.webContents.send('panel-pos', config.panel);
  win.webContents.send('game', summary);
  win.webContents.send('scoreboard-state', { open: true, anchor: { x: 1719, y: 406 }, offsets: config.scoreboard.offsets });
  await new Promise((r) => setTimeout(r, 1500));
  console.log(await win.webContents.executeJavaScript('JSON.stringify([...document.querySelectorAll(".sb-row,.sb-team")].map(e=>{const r=e.getBoundingClientRect();return [e.className,Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),getComputedStyle(e).display]}))'));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(root, 'debug', 'scoreboard-overlay.png'), img.toPNG());
  app.quit();
});
