// Screenshot des Hauptbildschirms nach debug/screen.png (zum Kalibrieren der OCR-Regionen).
// Start: npx electron tools/screenshot.js            -> ein Bild
//        npx electron tools/screenshot.js --series 8 -> 8 Bilder im Sekundentakt (debug/screen_1.png …)
const { app, desktopCapturer, screen } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const d = screen.getPrimaryDisplay();
  const size = { width: d.size.width * d.scaleFactor, height: d.size.height * d.scaleFactor };
  const i = process.argv.indexOf('--series');
  const count = i > -1 ? Number(process.argv[i + 1] || 5) : 1;
  const dir = path.join(__dirname, '..', 'debug');
  fs.mkdirSync(dir, { recursive: true });
  for (let n = 1; n <= count; n++) {
    const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    const out = path.join(dir, count === 1 ? 'screen.png' : `screen_${n}.png`);
    fs.writeFileSync(out, src.thumbnail.toPNG());
    console.log('gespeichert', out);
    if (n < count) await new Promise((r) => setTimeout(r, 1000));
  }
  app.quit();
});
