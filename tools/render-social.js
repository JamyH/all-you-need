// Rendert das Vorschaubild für GitHub und die Website (1280×640) nach docs/social-preview.png.
// Start: npx electron tools/render-social.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..');
  const win = new BrowserWindow({ width: 1280, height: 640, show: false, frame: false, useContentSize: true });
  await win.loadFile(path.join(__dirname, 'social-preview.html'));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(root, 'docs', 'social-preview.png'), img.toPNG());
  app.quit();
});
