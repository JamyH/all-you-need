// Schneidet 60 s lang alle 0,5 s die Summoner-Icons mit (debug/spells/), zum Kalibrieren.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const ocr = require('../src/ocr');

const SLOTS = { d: { x: 1758, y: 1322, width: 40, height: 40 }, f: { x: 1803, y: 1322, width: 40, height: 40 } };

app.whenReady().then(async () => {
  const dir = path.join(__dirname, '..', 'debug', 'spells');
  fs.mkdirSync(dir, { recursive: true });
  const start = Date.now();
  let n = 0;
  while (Date.now() - start < 60000) {
    const img = await ocr.captureScreen();
    const t = ((Date.now() - start) / 1000).toFixed(1).padStart(5, '0');
    for (const [k, r] of Object.entries(SLOTS)) fs.writeFileSync(path.join(dir, `${t}_${k}.png`), img.crop(r).toPNG());
    n++;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('fertig', n, 'Frames');
  app.quit();
});
