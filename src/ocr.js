// Liest Werte vom Bildschirm (nur was du ohnehin siehst, kein Eingriff ins Spiel):
// - CS-Zahl oben rechts per Texterkennung
// - XP-Fortschritt aus dem lila Bogen am Portrait
// - Summoner-Cooldowns (Icon wird blau mit weißer Restzeit)
// Alle Funktionen bekommen kleine RGBA-Ausschnitte { width, height, data } aus src/capture.js.
const { desktopCapturer, nativeImage, screen } = require('electron');
const { createWorker, PSM } = require('tesseract.js');

let worker = null;

async function init(cachePath) {
  worker = await createWorker('eng', 1, { cachePath });
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  });
}

// Nur für die Kalibrier-Tools: ein Vollbild als nativeImage
async function captureScreen() {
  const d = screen.getPrimaryDisplay();
  const size = { width: d.size.width * d.scaleFactor, height: d.size.height * d.scaleFactor };
  const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  return src.thumbnail;
}

// nativeImage (BGRA) -> RGBA-Ausschnitt, damit die Tools dieselben Funktionen nutzen können
function fromNativeImage(img, region) {
  const c = region ? img.crop(region) : img;
  const { width, height } = c.getSize();
  const data = Buffer.from(c.toBitmap());
  for (let i = 0; i < data.length; i += 4) [data[i], data[i + 2]] = [data[i + 2], data[i]];
  return { width, height, data };
}

// Pixel, die test(r,g,b) erfüllen, werden schwarz auf weiß; 4x vergrößert für Tesseract
async function recognize(crop, test) {
  const { width, height, data } = crop;
  const px = Buffer.alloc(width * height * 4);
  for (let i = 0; i < px.length; i += 4) {
    const v = test(data[i], data[i + 1], data[i + 2]) ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  const img = nativeImage.createFromBitmap(px, { width, height }).resize({ width: width * 4, quality: 'best' });
  const { data: res } = await worker.recognize(img.toPNG());
  const digits = res.text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

const isYellow = (r, g, b) => r > 140 && g > 120 && r - b > 60;
const isWhite = (r, g, b) => r > 190 && g > 190 && b > 190;
const isPurple = (r, g, b) => b > 150 && g < 70 && r > 80;

const readCs = (crop) => (worker ? recognize(crop, isYellow) : null);

// Cooldown = blauer Uhrzeiger-Wisch, der mit der Zeit schrumpft. Bereite Icons haben 0–4 blaue Pixel,
// deshalb reichen schon 15, damit die Zahl gelesen wird. Reiner Pixeltest, kostet praktisch nichts.
function spellOnCooldown(crop) {
  const { data } = crop;
  let blue = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 2] > data[i] + 50) blue++;
  return blue >= 15;
}

const readSpellCd = (crop) => (worker ? recognize(crop, isWhite) : null);

// Bereich, den der XP-Bogen braucht (für die Aufnahme-Anfrage)
function xpBox(arc) {
  const xs = arc.map((p) => p[0]), ys = arc.map((p) => p[1]);
  const x = Math.min(...xs) - 4, y = Math.min(...ys) - 4;
  return { x, y, width: Math.max(...xs) - x + 5, height: Math.max(...ys) - y + 5 };
}

// XP-Bogen: Punktliste von oben (leer) nach unten (Start der Füllung).
// Wir laufen von unten nach oben und messen, wie weit der lila Bereich reicht.
function readXp(crop, arc) {
  const box = xpBox(arc);
  const purpleNear = (x, y) => {
    for (let dx = -3; dx <= 3; dx++) {
      const i = ((y - box.y) * crop.width + (x + dx - box.x)) * 4;
      if (isPurple(crop.data[i], crop.data[i + 1], crop.data[i + 2])) return true;
    }
    return false;
  };

  // Lila muss zusammenhängend von unten kommen; Lücken bis 4 px werden toleriert
  const path = [...arc].reverse();
  let total = 0, filled = 0, gap = 0, done = false;
  for (let s = 1; s < path.length; s++) {
    const [x0, y0] = path[s - 1], [x1, y1] = path[s];
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let t = 0; t < len && !done; t++) {
      const x = Math.round(x0 + ((x1 - x0) * t) / len), y = Math.round(y0 + ((y1 - y0) * t) / len);
      if (purpleNear(x, y)) {
        filled = total + t;
        gap = 0;
      } else if (++gap > 4) {
        done = true;
      }
    }
    total += len;
  }
  return Math.min(1, filled / total);
}

module.exports = {
  init, captureScreen, fromNativeImage, readCs, spellOnCooldown, readSpellCd, xpBox, readXp,
};
