// Bildschirm-Ausschnitte per Windows-GDI (BitBlt vom Bildschirm in ein kleines Bitmap) statt über einen
// dauerhaften Video-Stream. Gemessen am 26.10. im Spiel (3440×1440): Der Stream hielt im Hauptprozess ~135 MB
// Bildpuffer plus ~100 MB für ein eigenes, unsichtbares Aufnahme-Fenster und kostete ~4 % eines Kerns. GDI
// braucht weder Fenster noch Puffer, liefert die echten Farben (der Stream verwischte Gelb durch die
// Video-Kompression) und kostet ~6 ms je Aufruf, fast unabhängig von der Größe: daher nah beieinanderliegende
// Ausschnitte (untere Leiste) in einem Aufruf holen. Das Overlay taucht wegen setContentProtection auch hier
// nicht auf. Gleiche Schnittstelle wie vorher src/capture.js: start/stop/grab/findScoreboard.
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');
const GetDC = user32.func('intptr __stdcall GetDC(intptr hWnd)');
const ReleaseDC = user32.func('int __stdcall ReleaseDC(intptr hWnd, intptr hDC)');
const CreateCompatibleDC = gdi32.func('intptr __stdcall CreateCompatibleDC(intptr hdc)');
const CreateCompatibleBitmap = gdi32.func('intptr __stdcall CreateCompatibleBitmap(intptr hdc, int cx, int cy)');
const DeleteDC = gdi32.func('int __stdcall DeleteDC(intptr hdc)');
const SelectObject = gdi32.func('intptr __stdcall SelectObject(intptr hdc, intptr h)');
const DeleteObject = gdi32.func('int __stdcall DeleteObject(intptr h)');
const BitBlt = gdi32.func('int __stdcall BitBlt(intptr hdc, int x, int y, int cx, int cy, intptr hdcSrc, int x1, int y1, uint32 rop)');
const StretchBlt = gdi32.func('int __stdcall StretchBlt(intptr hdc, int x, int y, int cx, int cy, intptr hdcSrc, int x1, int y1, int cx1, int cy1, uint32 rop)');
const SetStretchBltMode = gdi32.func('int __stdcall SetStretchBltMode(intptr hdc, int mode)');
// Buffer statt Zeiger-Ansicht: Electron erlaubt keine fremden Speicherblöcke als ArrayBuffer (koffi.view stürzt ab)
const GetDIBits = gdi32.func('int __stdcall GetDIBits(intptr hdc, intptr hbm, uint32 start, uint32 lines, _Out_ uint8_t *bits, uint8_t *bmi, uint32 usage)');
const SRCCOPY = 0x00cc0020;
const COLORONCOLOR = 3; // Verkleinern ohne Mischen, wie drawImage mit imageSmoothingEnabled = false

// Bildschirmbereich (physische Pixel) als BGRA-Buffer, optional verkleinert auf outW × outH
function blit(r, outW = r.width, outH = r.height) {
  const screen = GetDC(0);
  const mem = CreateCompatibleDC(screen);
  const bmp = CreateCompatibleBitmap(screen, outW, outH);
  try {
    const old = SelectObject(mem, bmp);
    if (outW === r.width && outH === r.height) BitBlt(mem, 0, 0, outW, outH, screen, r.x, r.y, SRCCOPY);
    else {
      SetStretchBltMode(mem, COLORONCOLOR);
      StretchBlt(mem, 0, 0, outW, outH, screen, r.x, r.y, r.width, r.height, SRCCOPY);
    }
    SelectObject(mem, old);
    const bmi = Buffer.alloc(44); // BITMAPINFOHEADER: 32 Bit, negative Höhe = Zeilen von oben nach unten
    bmi.writeUInt32LE(40, 0);
    bmi.writeInt32LE(outW, 4);
    bmi.writeInt32LE(-outH, 8);
    bmi.writeUInt16LE(1, 12);
    bmi.writeUInt16LE(32, 14);
    const buf = Buffer.alloc(outW * outH * 4);
    if (!GetDIBits(mem, bmp, 0, outH, buf, bmi, 0)) throw new Error('Bildschirm nicht lesbar');
    return buf;
  } finally {
    DeleteObject(bmp);
    DeleteDC(mem);
    ReleaseDC(0, screen);
  }
}

// Ausschnitte zu Gruppen zusammenfassen, deren umschließendes Rechteck klein bleibt (untere Leiste: Summoner,
// Items, XP-Bogen in einem Aufruf; CS oben rechts getrennt)
const MAX_GROUP = 900 * 300;
const union = (a, b) => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};
function groups(regions) {
  const out = [];
  regions.forEach((r, i) => {
    const g = out.find((c) => { const u = union(c.box, r); return u.width * u.height <= MAX_GROUP; });
    if (g) {
      g.box = union(g.box, r);
      g.members.push(i);
    } else out.push({ box: { ...r }, members: [i] });
  });
  return out;
}

// Ausschnitte als { width, height, data } mit RGBA-Daten, wie vorher aus dem Stream
async function grab(regions) {
  const crops = new Array(regions.length);
  for (const g of groups(regions)) {
    const buf = blit(g.box);
    const stride = g.box.width * 4;
    for (const i of g.members) {
      const r = regions[i];
      const data = new Uint8ClampedArray(r.width * r.height * 4);
      for (let y = 0; y < r.height; y++) {
        let s = (r.y - g.box.y + y) * stride + (r.x - g.box.x) * 4;
        let d = y * r.width * 4;
        for (let x = 0; x < r.width; x++, s += 4, d += 4) {
          data[d] = buf[s + 2];
          data[d + 1] = buf[s + 1];
          data[d + 2] = buf[s];
          data[d + 3] = 255;
        }
      }
      crops[i] = { width: r.width, height: r.height, data };
    }
  }
  return crops;
}

// Scoreboard-Ornament suchen (Raute oben, goldenes Mittelstück, schmale V-Kerbe darunter).
// Das Bild wird so verkleinert, dass das Ornament immer so groß ist wie bei 1440p in halber Auflösung
// (Faktor 2 × scale, scale = Bildschirmhöhe / 1440); alle Maße unten gelten in diesem Raster.
// region = null heißt ganzer Bildschirm. Liefert den Anker (Mitte des Mittelstücks, volle Auflösung) oder null.
let screenSize = null; // { width, height } in physischen Pixeln, setzt main über setScreen()
async function findScoreboard(region, scale = 1) {
  const r = region || { x: 0, y: 0, ...screenSize };
  const step = 2 * scale;
  const W = Math.floor(r.width / step), H = Math.floor(r.height / step);
  const px = blit(r, W, H); // BGRA

  const g = new Uint8Array(W * H);
  const rowSum = new Uint32Array(H);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    const b = px[p], gr = px[p + 1], red = px[p + 2];
    if (red > 120 && gr > 95 && b < 110 && red > b + 30) { g[i] = 1; rowSum[(i / W) | 0]++; }
  }
  const at = (x, y) => g[y * W + x];
  const anyIn = (x0, x1, y0, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (at(x, y)) return true;
    return false;
  };
  const share = (x0, x1, y) => {
    let n = 0;
    for (let x = x0; x < x1; x++) n += at(x, y);
    return n / (x1 - x0);
  };

  for (let y = 76; y < H - 10; y++) {
    if (rowSum[y] < 20) continue;
    for (let x = 46; x < W - 46; x++) { // Prüfungen reichen 45 px (halbe Auflösung) zur Seite
      if (!(at(x, y + 7) && at(x, y + 8))) continue;
      if (anyIn(x - 20, x - 5, y + 7, y + 8) || anyIn(x + 6, x + 20, y + 7, y + 8)) continue; // Kerbe schmal
      if (share(x - 45, x - 12, y) < 0.6 || share(x + 12, x + 45, y) < 0.6) continue; // Mittelstück
      if (!anyIn(x - 38, x - 20, y - 75, y - 62) || !anyIn(x + 20, x + 38, y - 75, y - 62)) continue; // Raute
      // Mitte der Kerbe als Anker, damit er nicht je nach Treffer um ein paar Pixel springt
      let end = x;
      while (end + 1 < W && at(end + 1, y + 7) && at(end + 1, y + 8)) end++;
      return { x: Math.round(r.x + ((x + end) / 2) * step), y: Math.round(r.y + y * step) };
    }
  }
  return null;
}

// Kein Stream, nichts zu starten: bleibt für die gleiche Schnittstelle wie vorher
const start = async () => {};
const stop = () => {};
const setScreen = (size) => (screenSize = size);

module.exports = { start, stop, grab, findScoreboard, setScreen };
