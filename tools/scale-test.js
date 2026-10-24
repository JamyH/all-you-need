// Prüft die Umrechnung der Bildschirm-Regionen an einem Screenshot.
// Start: npx electron tools/scale-test.js <screenshot.png> <GlobalScale>
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const ocr = require('../src/ocr');
const layout = require('../src/layout');

app.whenReady().then(async () => {
  const [file, g] = process.argv.slice(-2);
  const img = nativeImage.createFromPath(path.resolve(file));
  const { width, height } = img.getSize();
  const L = layout.compute(width, height, Number(g));
  console.log('Faktoren', JSON.stringify(L.factors));
  await ocr.init(app.getPath('userData'));
  const crop = (r) => ocr.fromNativeImage(img, r);
  console.log('CS', await ocr.readCs(crop(L.cs)));
  for (const k of ['d', 'f']) {
    const c = crop(L.spells[k]);
    console.log(k.toUpperCase(), ocr.spellOnCooldown(c) ? `Cooldown ${await ocr.readSpellCd(c)}` : 'bereit', JSON.stringify(L.spells[k]));
  }
  console.log('XP', Math.round(ocr.readXp(crop(ocr.xpBox(L.xpArc)), L.xpArc) * 100), '%');
  fs.writeFileSync(path.join(__dirname, '..', 'debug', 'scale-xp.png'), img.crop(ocr.xpBox(L.xpArc)).resize({ width: 200 }).toPNG());
  app.quit();
});
