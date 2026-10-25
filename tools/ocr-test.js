// Prüft Stream-Aufnahme + OCR live auf dem aktuellen Bildschirm: npx electron tools/ocr-test.js
// Mit --file nimmt es debug/screen.png statt des Bildschirms.
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const ocr = require('../src/ocr');
const capture = require('../src/capture');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const c = config.ocr;
const regions = [c.region, ocr.xpBox(c.xpArc), c.spells.d, c.spells.f];

app.whenReady().then(async () => {
  await ocr.init(app.getPath('userData'));
  let crops;
  if (process.argv.includes('--file')) {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'debug', 'screen.png'));
    crops = regions.map((r) => ocr.fromNativeImage(img, r));
  } else {
    await capture.start();
    for (let i = 0; i < 5; i++) {
      const t = Date.now();
      crops = await capture.grab(regions);
      console.log('Ausschnitte geholt', `${Date.now() - t} ms`);
    }
  }
  let t = Date.now();
  console.log('CS', await ocr.readCs(crops[0]), `${Date.now() - t} ms`);
  console.log('XP', Math.round(ocr.readXp(crops[1], c.xpArc) * 100), '%');
  const dbg = path.join(__dirname, '..', 'debug');
  for (const [i, k] of [[2, 'D'], [3, 'F']]) {
    const { width, height, data } = crops[i];
    const bgra = Buffer.from(data);
    for (let j = 0; j < bgra.length; j += 4) [bgra[j], bgra[j + 2]] = [bgra[j + 2], bgra[j]];
    fs.writeFileSync(path.join(dbg, `live_${k}.png`), nativeImage.createFromBitmap(bgra, { width, height }).resize({ width: width * 4 }).toPNG());
    let blue = 0;
    for (let j = 0; j < data.length; j += 4) if (data[j + 2] > data[j] + 50) blue++;
    console.log(k, 'blaue Pixel', blue, 'von', data.length / 4);
    const cd = ocr.spellOnCooldown(crops[i]);
    console.log(k, cd ? `Cooldown ${await ocr.readSpellCd(crops[i])}` : 'bereit');
  }
  app.quit();
});
