// Liest Werte vom Bildschirm (nur was du ohnehin siehst, kein Eingriff ins Spiel):
// - CS-Zahl oben rechts per Texterkennung
// - XP-Fortschritt aus dem lila Bogen am Portrait
// - Summoner-Cooldowns (Icon wird blau mit weißer Restzeit)
// Alle Funktionen bekommen kleine RGBA-Ausschnitte { width, height, data } aus src/screengrab.js.
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
// Laufende Aufträge je Worker: Entladen nur, wenn keiner läuft. Sonst beendete der Leerlauf-Timer (oder release
// nach dem Spiel) den Worker mitten in einem Augment-Lesen → „Cannot read properties of null (postMessage)“.
// Nach dem Auftrag stellt touch den Timer neu, entladen wird dann eine Minute später.
const busy = { digits: 0, text: 0 };
async function run(kind, png) {
  busy[kind]++; // sofort zählen, noch vor dem ersten await, sonst bleibt eine Lücke für drop
  clearTimeout(idle[kind]);
  try {
    const w = await (kind === 'digits' ? tesseract() : tesseractText());
    if (!w) return null;
    const { data } = await w.recognize(png);
    return data.text;
  } catch (e) {
    console.warn('Tesseract:', e.message);
    return null;
  } finally {
    busy[kind]--;
    touch(kind);
  }
}
async function drop(kind) {
  clearTimeout(idle[kind]);
  if (busy[kind]) return;
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
  const text = await run('text', img.toPNG());
  return text ? text.trim() : '';
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
  const text = await run('digits', img.toPNG());
  if (text == null) return null;
  const digits = text.replace(/\D/g, '');
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

// Spieluhr oben rechts (FarmyDevBuild-Schalter „Spielzeit per OCR“) → Sekunden, null = nicht lesbar.
// Gleiche Schrift wie CS, nur weiß: die gelben Muster passen. Der Doppelpunkt fällt als zu kleine Fläche weg,
// aus „12:35“ wird 1235 → die letzten zwei Ziffern sind die Sekunden (ab einer Stunde „1:02:35“ → 10235)
function readClock(crop) {
  if (!complete(T.yellow)) return null;
  const n = digits.read(crop, isWhite, T.yellow);
  if (n == null || n % 100 >= 60) return null;
  const h = Math.floor(n / 10000), m = Math.floor(n / 100) % 100;
  if (h && m >= 60) return null;
  return h ? h * 3600 + m * 60 + (n % 100) : Math.floor(n / 100) * 60 + (n % 100);
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

// Ulti im Cooldown: weiße Restzeit mittig auf dem R-Symbol (wie bei den Summonern mit blauem Symbol).
// Die Manakosten oben rechts liegen außerhalb der Mitte und zählen nicht
const ultOnCooldown = (crop) => centralDigits(crop);

// FPS und Ping oben rechts (weiß, kleiner als CS): die gelben CS-Muster passen auch hier, die weißen
// Summoner-Muster nicht (getestet 27.10.: FPS 165 und Ping 5 richtig). Die Schrift ist hellgrau, nicht weiß
const isLight = (r, g, b) => r > 150 && g > 150 && b > 150;
const readHudNumber = (crop) => (complete(T.yellow) ? digits.read(crop, isLight, T.yellow) : null);

// Death Recap: Anteile der Schadensarten aus dem Ring um den Gesamtschaden (orange = physisch, blau = magisch,
// weiß = echt), 360 Punkte auf dem Ring. null, wenn kaum Ring zu sehen ist (Recap zugeklappt oder noch nicht da).
// Geprüft 27.10. an zwei Toden: 86/0/14 (Irelia mit echtem Schaden) und 100/0/0 (Turm)
function deathRing(img, cx, cy, r) {
  const n = { phys: 0, magic: 0, true: 0 };
  for (let a = 0; a < 360; a++) {
    const x = Math.floor(cx + r * Math.sin((a * Math.PI) / 180));
    const y = Math.floor(cy - r * Math.cos((a * Math.PI) / 180));
    const i = (y * img.width + x) * 4, R = img.data[i], G = img.data[i + 1], B = img.data[i + 2];
    if (R > 150 && R - B > 60) n.phys++;
    else if (Math.min(R, G, B) > 170) n.true++;
    else if (B > R + 40) n.magic++;
  }
  // unter 2 % ist es die weiße Trennlinie oben am Ring, kein Schaden
  for (const k of Object.keys(n)) if (n[k] < 8) n[k] = 0;
  const sum = n.phys + n.magic + n.true;
  if (sum < 300) return null;
  const pct = (v) => Math.round((v / sum) * 100);
  return { phys: pct(n.phys), magic: pct(n.magic), true: pct(n.true) };
}

// Ausschnitt aus einem großen RGBA-Bild (z. B. dem ganzen Spielfenster)
function subCrop(img, { x, y, width, height }) {
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * img.width + x) * 4;
    img.data.copy(data, row * width * 4, from, from + width * 4);
  }
  return { width, height, data };
}

// Gesamtschaden mitten im Ring: grau und in anderer Schrift als CS, die eigenen Muster treffen nur manchmal
// (1170 ja, 584 nein) → sonst Tesseract, das läuft nur einmal je Tod
async function readDeathTotal(crop) {
  const grey = (r, g, b) => r > 100 && g > 100 && b > 80;
  const own = complete(T.white) ? digits.read(crop, grey, T.white) ?? digits.read(crop, grey, T.yellow) : null;
  return own ?? recognize(crop, grey);
}

// Summoner mit Ladungen (Zerschmettern) zeigen die Ladungszahl weiß unten rechts: wie bei den Items nur die
// Restzeit in der Mitte lesen, sonst wird aus „1“ und „45“ eine 145
async function readSpellCd(crop) {
  if (complete(T.white)) {
    const own = digits.read(crop, isWhite, T.white, { central: true });
    if (own != null) return own;
  }
  return recognize(crop, isWhite, (x, y) => x > crop.width * 0.65 && y > crop.height * 0.7);
}

// Rollen-Quest: Anteil des Rings, der türkis ist (0–1). Wo der Bogen beginnt, ist dafür egal. Abgetastet in 2°-Schritten
// auf drei Radien um die Ausschnittmitte (Ring ~3 px breit), der beste zählt
function readQuest(crop, r) {
  const { width: W, data } = crop;
  const c = (W - 1) / 2;
  let best = 0;
  for (const rr of [r - 0.7, r, r + 0.7]) {
    let hit = 0;
    for (let a = 0; a < 360; a += 2) {
      const x = Math.round(c + rr * Math.cos((a * Math.PI) / 180)), y = Math.round(c + rr * Math.sin((a * Math.PI) / 180));
      const p = (y * W + x) * 4;
      if (data[p + 2] > 160 && data[p + 1] > 130 && data[p + 2] > data[p] + 60) hit++;
    }
    best = Math.max(best, hit / 180);
  }
  return best;
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
  init, release, augmentFrame, readText, captureScreen, fromNativeImage, readCs, readClock, readHudNumber, ultOnCooldown, deathRing, subCrop, readDeathTotal, spellOnCooldown, readSpellCd, readItemCd, xpBox, readXp, readQuest,
  isWhite, isYellow, recognizeTesseract: recognize,
};
