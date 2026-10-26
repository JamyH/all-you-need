// Rendert das Panel-Bild für README und Website: normales und kompaktes Panel nebeneinander, mit festen
// Beispieldaten (Jax gegen Darius) statt eines echten Spiels. Ergebnis: docs/panel.png bzw. mit --en docs/panel-en.png.
// Start: npx electron tools/render-docs-panel.js [--en]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const lang = require('./lang');

const DD = 'https://ddragon.leagueoflegends.com/cdn/16.21.1/img';
const en = !!lang.suffix;
const summary = {
  gameTime: 18 * 60 + 42, gameMode: 'CLASSIC', champion: 'Jax', championId: 'Jax', level: 11,
  gold: 1240, kda: '4/2/6', kdaRatio: '5.00', cs: 142, csExact: true, csPerMin: '7.6', wardScore: 14,
  myItemValue: 6850, laneOpponent: { champion: 'Darius', itemValue: 6000, cs: 130, isDead: false }, teamItemDiff: -1430,
  mana: { value: 310, max: 520, percent: 60, combo: 140, low: false },
  build: { name: en ? 'Trinity Force' : 'Stärke der Dreieinigkeit', missing: 420, progress: 87, affordable: false },
  skill: { next: 'W', open: 1, priority: ['Q', 'W', 'E'] },
  spells: [
    { key: 'D', ready: false, cd: 192, icon: `${DD}/spell/SummonerFlash.png` },
    { key: 'F', ready: true, cd: null, icon: `${DD}/spell/SummonerDot.png` },
  ],
  itemCds: [
    { key: '3', ready: false, cd: 48, icon: `${DD}/item/3157.png` },
    { key: '4', ready: true, cd: null, icon: `${DD}/item/3026.png` },
  ],
  xp: { percent: 64, missing: 380, melee: 6, caster: 9, waves: '1.1' },
};
const SETTINGS = { modules: {}, scale: 1, bgTransparency: 30, hoverTransparency: 20, clickThrough: true };

// Ein Panel rendern und auf seinen Rahmen zuschneiden
async function panelShot(root, compact) {
  const win = new BrowserWindow({
    width: 320, height: 900, show: false, backgroundColor: '#1d2620',
    webPreferences: { preload: path.join(root, 'preload.js') },
  });
  await win.loadFile(path.join(root, 'renderer', 'overlay.html'));
  win.webContents.send('overlay-settings', { ...SETTINGS, compact });
  win.webContents.send('panel-pos', { x: 16, y: 80 });
  win.webContents.send('game', summary);
  await new Promise((r) => setTimeout(r, 2500)); // Webfonts und Icons laden lassen
  const r = await win.webContents.executeJavaScript(
    '(() => { const b = document.getElementById("panel").getBoundingClientRect(); const a = document.querySelector(".alerts").getBoundingClientRect();' +
    ' return { x: b.x, y: b.y, w: b.width, h: b.height, top: Math.min(b.y, a.height ? a.y : b.y) }; })()');
  // Warn-Pillen sitzen über dem Panel-Rahmen: ab ihrer Oberkante zuschneiden
  const top = Math.max(0, Math.floor(r.top) - 16);
  const img = await win.webContents.capturePage({ x: 0, y: top, width: Math.ceil(r.x + r.w) + 16, height: Math.ceil(r.y + r.h) - top + 16 });
  win.destroy();
  return img;
}

// zwischen den Aufnahmen ist kurz kein Fenster offen; ohne diesen Handler würde Electron dann beenden
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..');
  const [full, small] = [await panelShot(root, false), await panelShot(root, true)];
  // beide nebeneinander, oben bündig
  const a = full.getSize(), b = small.getSize();
  const html = `<body style="margin:0;background:#1d2620;display:flex;align-items:flex-start">` +
    `<img src="${full.toDataURL()}" width="${a.width}"><img src="${small.toDataURL()}" width="${b.width}"></body>`;
  const win = new BrowserWindow({ width: a.width + b.width, height: Math.max(a.height, b.height), show: false, useContentSize: true });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  const out = path.join(root, 'docs', `panel${lang.suffix}.png`);
  fs.writeFileSync(out, (await win.webContents.capturePage()).toPNG());
  console.log(out, win.getContentSize().join('×'));
  app.quit();
});
