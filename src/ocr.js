// Liest Werte vom Bildschirm (nur was du ohnehin siehst, kein Eingriff ins Spiel):
// - CS-Zahl oben rechts per Texterkennung
// - XP-Fortschritt aus dem lila Bogen am Portrait
// - Summoner-Cooldowns (Icon wird blau mit weißer Restzeit)
// Alle Funktionen bekommen kleine RGBA-Ausschnitte { width, height, data } aus src/capture.js.
// Ziffern liest zuerst die eigene Erkennung (src/digits.js); Tesseract nur, wenn die unsicher ist.
// Tesseract (rund 55 MB) wird erst beim ersten Bedarf geladen und nach dem Spiel wieder freigegeben.
const { desktopCapturer, nativeImage, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const digits = require('./digits');

let T = {};
try {
  T = require('./digits.json');
} catch {
  // noch nichts gelernt -> nur Tesseract
}
const complete = (t) => !!t && Object.keys(t).length === 10;

let worker = null; // Promise des Tesseract-Workers (nur Ziffern), null = nicht geladen
let textWorker = null; // zweiter Worker für Text (Augment-Namen), ebenfalls erst bei Bedarf
let tesseractCache = null;
let collectDir = null;

// collect: Ordner, in dem CS-Ausschnitte mit dem Tesseract-Wert landen (Lernmaterial für tools/digit-samples.js)
async function init(cachePath, { collect } = {}) {
  tesseractCache = cachePath;
  collectDir = collect || null;
  if (collectDir) fs.mkdirSync(collectDir, { recursive: true });
}

function tesseract() {
  if (!worker) {
    worker = (async () => {
      const { createWorker, PSM } = require('tesseract.js');
      const w = await createWorker('eng', 1, { cachePath: tesseractCache });
      await w.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: PSM.SINGLE_LINE });
      return w;
    })().catch((e) => {
      console.warn('Tesseract:', e.message);
      worker = null;
      return null;
    });
  }
  return worker;
}

function tesseractText() {
  if (!textWorker) {
    textWorker = (async () => {
      const { createWorker, PSM } = require('tesseract.js');
      const w = await createWorker('eng', 1, { cachePath: tesseractCache });
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      return w;
    })().catch((e) => {
      console.warn('Tesseract (Text):', e.message);
      textWorker = null;
      return null;
    });
  }
  return textWorker;
}

// Ein Worker belegt ~40 MB, Neuladen dauert ~0,2 s. Die eigene Ziffern-Erkennung braucht Tesseract nur selten,
// Augment-Namen nur bei einem Angebot: nach einer Minute ohne Nutzung wieder entladen.
const IDLE_MS = 60000;
const idle = { digits: null, text: null };
function touch(kind) {
  clearTimeout(idle[kind]);
  idle[kind] = setTimeout(() => drop(kind), IDLE_MS);
}
async function drop(kind) {
  clearTimeout(idle[kind]);
  const p = kind === 'digits' ? worker : textWorker;
  if (kind === 'digits') worker = null;
  else textWorker = null;
  const w = await p;
  if (w) await w.terminate().catch(() => {});
}

// Nach dem Spiel: Speicher freigeben, beim nächsten Bedarf wird neu geladen
async function release() {
  await Promise.all([drop('digits'), drop('text')]);
}

// Augment-Angebot offen? Oberkante des hellen Kartenrahmens (Angebot ~90 % hell, sonst höchstens ~20 %)
function augmentFrame(crop) {
  const { data } = crop;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // heller Kartenrahmen: Gold (beige), Prisma (lila-weiß), Silber; das Spielfeld dahinter ist dunkel
    if (Math.min(r, g, b) > 120 && Math.max(r, g, b) > 170) n++;
  }
  return n / (data.length / 4) >= 0.5;
}

// Eine Textzeile lesen (Augment-Name: helle Schrift auf dunkler Karte), Umlaute gleicht augments.match aus
async function readText(crop) {
  const bgra = Buffer.from(crop.data);
  for (let i = 0; i < bgra.length; i += 4) [bgra[i], bgra[i + 2]] = [bgra[i + 2], bgra[i]];
  const img = nativeImage.createFromBitmap(bgra, { width: crop.width, height: crop.height });
  const w = await tesseractText();
  if (!w) return '';
  touch('text');
  const { data } = await w.recognize(img.toPNG());
  touch('text');
  return data.text.trim();
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

// Pixel, die test(r,g,b) erfüllen, werden schwarz auf weiß; 4x vergrößert für Tesseract.
// skip(x, y): Pixel, die nicht mitgelesen werden (z. B. die Ladungszahl in der Ecke)
async function recognize(crop, test, skip = () => false) {
  const { width, height, data } = crop;
  const px = Buffer.alloc(width * height * 4);
  for (let i = 0; i < px.length; i += 4) {
    const p = i / 4;
    const v = test(data[i], data[i + 1], data[i + 2]) && !skip(p % width, Math.floor(p / width)) ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  const img = nativeImage.createFromBitmap(px, { width, height }).resize({ width: width * 4, quality: 'best' });
  const w = await tesseract();
  if (!w) return null;
  touch('digits');
  const { data: res } = await w.recognize(img.toPNG());
  touch('digits');
  const digits = res.text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

// CS-Zahl: nur auf Helligkeit prüfen, nicht auf Gelb. Der Bildschirm-Stream ist komprimiert, dabei
// verläuft die Farbe stärker als die Helligkeit; mit Gelb-Test kam eine „0“ schief an und wurde nicht erkannt.
// Im CS-Ausschnitt steht nur die Zahl, helle Pixel sind also immer Ziffer.
const isYellow = (r, g) => r > 150 && g > 130;
const isWhite = (r, g, b) => r > 190 && g > 190 && b > 190;
const isPurple = (r, g, b) => b > 150 && g < 70 && r > 80;

// ein Ausschnitt je CS-Wert reicht zum Lernen
function collect(crop, value) {
  const file = collectDir && path.join(collectDir, `cs_${value}.png`);
  if (!file || fs.existsSync(file)) return;
  const bgra = Buffer.from(crop.data);
  for (let i = 0; i < bgra.length; i += 4) [bgra[i], bgra[i + 2]] = [bgra[i + 2], bgra[i]];
  fs.writeFile(file, nativeImage.createFromBitmap(bgra, { width: crop.width, height: crop.height }).toPNG(), () => {});
}

async function readCs(crop) {
  if (complete(T.yellow)) {
    const own = digits.read(crop, isYellow, T.yellow);
    if (own != null) {
      collect(crop, own); // weiter sammeln: 7 und 8 haben erst wenige Beispiele
      return own;
    }
  }
  const v = await recognize(crop, isYellow);
  if (v != null) {
    collect(crop, v);
    return v;
  }
  // Tesseract übersieht gern eine einzelne 0; fehlende gelbe Muster ersetzen die weißen
  return digits.read(crop, isYellow, { ...T.white, ...T.yellow });
}

// Cooldown = blauer Uhrzeiger-Wisch, der mit der Zeit schrumpft. Bereite Icons haben 0–4 blaue Pixel,
// deshalb reichen schon 15, damit die Zahl gelesen wird. Reiner Pixeltest, kostet praktisch nichts.
// Cooldown: dunkles, blau getöntes Feld. Schon wenige blaue Pixel reichen, damit auch das Ende des Cooldowns
// (fast ganz aufgedeckt) noch zählt. Von Haus aus blaue Symbole (Markieren, Läuterung, Klarheit) wären damit
// immer „im Cooldown“, und eine Farb-Regel kippte gegen Ende hin und her (Feld wieder hell): dort zählt nur,
// ob die weiße Restzeit in der Mitte steht. Auch während des Schneeball-Sprungs (helles Symbol, keine Zahl)
// stimmt das: der Cooldown beginnt erst danach
function spellOnCooldown(crop, blueIcon = false) {
  if (blueIcon) return centralDigits(crop);
  const { data } = crop;
  let blue = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 2] > data[i] + 50) blue++;
  return blue >= 15;
}

// Steht in der Mitte eine weiße Zahl? Nur Flächen in Ziffern-Form: ein Viertel bis 45 % so hoch wie
// das Feld (Ziffern ~ ein Drittel; Lichtstreifen im Schneeball ~ die Hälfte) und schmal (die helle Kugel nicht)
function centralDigits(crop) {
  const { width: W, height: H } = crop;
  const keep = (b) => {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    return h >= H * 0.25 && h <= H * 0.45 && w <= W * 0.35 &&
      Math.abs((b.x0 + b.x1 + 1) / 2 / W - 0.5) < 0.4 && Math.abs((b.y0 + b.y1 + 1) / 2 / H - 0.5) < 0.25;
  };
  return digits.glyphs(digits.mask(crop, isWhite), W, H, keep).length > 0;
}

// Item-Cooldown: weiße Restzeit mitten auf dem Slot, sonst null (bereit oder kein Cooldown-Item).
// Nur eigene Erkennung: läuft jede Sekunde für bis zu sechs Slots, Tesseract wäre dafür zu teuer.
const readItemCd = (crop) => (complete(T.white) ? digits.read(crop, isWhite, T.white, { central: true }) : null);

// Summoner mit Ladungen (Zerschmettern) zeigen die Ladungszahl weiß unten rechts: wie bei den Items nur die
// Restzeit in der Mitte lesen, sonst wird aus „1“ und „45“ eine 145
async function readSpellCd(crop) {
  if (complete(T.white)) {
    const own = digits.read(crop, isWhite, T.white, { central: true });
    if (own != null) return own;
  }
  return recognize(crop, isWhite, (x, y) => x > crop.width * 0.65 && y > crop.height * 0.7);
}

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
  init, release, augmentFrame, readText, captureScreen, fromNativeImage, readCs, spellOnCooldown, readSpellCd, readItemCd, xpBox, readXp,
  isWhite, isYellow, recognizeTesseract: recognize,
};
