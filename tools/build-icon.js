// Baut aus den SVGs in assets/ die Icon-Dateien: assets/icon.png (256) und assets/icon.ico (16–256).
// Kleine Größen nutzen eigene, vereinfachte SVG-Varianten. Start: npx electron tools/build-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const SIZES = [
  [16, 'icon-16.svg'], [24, 'icon-32.svg'], [32, 'icon-32.svg'], [48, 'icon-48.svg'],
  [64, 'icon.svg'], [128, 'icon.svg'], [256, 'icon.svg'],
];

// Offscreen-Fenster mit transparentem Hintergrund, damit die runden Ecken echte Transparenz bekommen
async function renderPng(svgFile, size) {
  const svg = fs.readFileSync(path.join(ASSETS, svgFile), 'utf8');
  const win = new BrowserWindow({
    width: size, height: size, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent;overflow:hidden">` +
    svg.replace(/width="256" height="256"/, `width="${size}" height="${size}"`) + '</body></html>';
  const tmp = path.join(app.getPath('temp'), `ayn-icon-${size}.html`);
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  win.destroy();
  return img.resize({ width: size, height: size, quality: 'best' }).toPNG();
}

// ICO = Header + Verzeichnis + PNG-Daten je Größe (Windows Vista+ liest PNG-Einträge)
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dir = pngs.map(([size, data]) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // Farbebenen
    e.writeUInt16LE(32, 6); // Bit pro Pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...pngs.map(([, d]) => d)]);
}

app.disableHardwareAcceleration();
// sonst beendet sich Electron, sobald das erste Render-Fenster geschlossen ist
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const pngs = [];
  for (const [size, file] of SIZES) pngs.push([size, await renderPng(file, size)]);
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), pngs.find(([s]) => s === 256)[1]);
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), buildIco(pngs));
  console.log('icon.png + icon.ico mit', pngs.map(([s]) => s).join(', '), 'px');
  app.quit();
});
