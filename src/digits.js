// Eigene Ziffern-Erkennung statt Tesseract: Ziffern ausschneiden, auf ein festes Raster bringen und mit
// gelernten Mustern (src/digits.json, erzeugt von tools/digit-samples.js) vergleichen.
// Braucht Bruchteile einer Millisekunde statt eines Tesseract-Durchlaufs und kennt nur die HUD-Schrift.
const H = 16; // Raster: Ziffer wird auf 16 Zeilen skaliert, Breite im selben Maßstab, mittig in 12 Spalten
const W = 12;

// Pixel, die test(r,g,b) erfüllen -> 1
function mask(crop, test) {
  const { width, height, data } = crop;
  const m = new Uint8Array(width * height);
  for (let i = 0; i < m.length; i++) m[i] = test(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 1 : 0;
  return m;
}

// Zusammenhängende Flächen (8er-Nachbarschaft) als Rechtecke; Flächen, die sich waagerecht überlappen,
// gehören zur selben Ziffer (z. B. wenn die Kantenglättung eine dünne Stelle auftrennt)
function glyphs(m, width, height, keep = null) {
  const seen = new Uint8Array(m.length);
  const boxes = [];
  for (let start = 0; start < m.length; start++) {
    if (!m[start] || seen[start]) continue;
    const box = { x0: width, y0: height, x1: -1, y1: -1, n: 0 };
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % width, y = (p - x) / width;
      box.n++;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (m[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    boxes.push(box);
  }
  boxes.sort((a, b) => a.x0 - b.x0);
  const merged = [];
  for (const b of boxes) {
    const last = merged[merged.length - 1];
    // nur zusammenfügen, wenn auch senkrecht höchstens 2 px dazwischen liegen (sonst wird Glitzern zur „1“)
    const vGap = last ? Math.max(b.y0 - last.y1, last.y0 - b.y1) - 1 : 0;
    if (last && b.x0 <= last.x1 && vGap <= 2) {
      Object.assign(last, { x1: Math.max(last.x1, b.x1), y0: Math.min(last.y0, b.y0), y1: Math.max(last.y1, b.y1), n: last.n + b.n });
    } else merged.push({ ...b });
  }
  // Störpixel (Ränder vom Icon, Kantenreste) sind deutlich niedriger als die Ziffern
  const kept = keep ? merged.filter(keep) : merged;
  const tall = Math.max(0, ...kept.map((b) => b.y1 - b.y0 + 1));
  // eine echte Ziffer hat mindestens so viele Pixel wie 0,9 × ihre Höhe: bei 1080p ist die „1“ nur 1 px breit
  // (8 px hoch, 9 Pixel); mit 1,2 × fiel sie weg und aus „115“ wurde „5“
  return kept.filter((b) => b.y1 - b.y0 + 1 >= tall * 0.6 && b.n >= Math.max(4, 0.9 * (b.y1 - b.y0 + 1)));
}

// Ziffer -> H×W Werte 0..1 (Flächenanteil je Rasterzelle, 3×3 Stichproben)
function normalize(m, width, b) {
  const h = b.y1 - b.y0 + 1;
  const s = h / H; // Quellpixel pro Rasterzelle
  const cx = (b.x0 + b.x1 + 1) / 2;
  const out = new Float32Array(H * W);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      let sum = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const x = Math.floor(cx + (c - W / 2 + (sx + 0.5) / 3) * s);
          const y = Math.floor(b.y0 + (r + (sy + 0.5) / 3) * s);
          if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) sum += m[y * width + x];
        }
      }
      out[r * W + c] = sum / 9;
    }
  }
  return out;
}

const distance = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
};

// Beste Ziffer je Glyphe; null, wenn eine Glyphe keinem Muster ähnelt oder zwei Muster fast gleich gut
// passen (dann lieber nichts als Unsinn, der Aufrufer fällt auf Tesseract zurück)
// central: nur Ziffern in der Mitte zählen (Item-Slots: Stapelzahl unten rechts ist kein Cooldown)
const MAX_DISTANCE = 0.2;
const MIN_MARGIN = 0.04; // Abstand zum zweitbesten Muster
function read(crop, test, templates, { central = false } = {}) {
  if (!templates) return null;
  const m = mask(crop, test);
  const mid = (a, b, size) => (a + b + 1) / 2 / size;
  // „central“: nur Ziffern in der Mitte (Restzeit), nicht die Ladungszahl unten rechts. Waagerecht bis 0,4 vom
  // Rand, sonst fällt bei dreistelligen Zeiten (z. B. 255) die linke Ziffer heraus
  // Ziffern sind mindestens ein Viertel so hoch wie der Ausschnitt; kurze helle Striche
  // (z. B. das Glitzern auf Zhonyas Icon) sähen hochskaliert sonst wie eine „1“ aus
  const keep = (b) => b.y1 - b.y0 + 1 >= crop.height * 0.25 &&
    (!central || (Math.abs(mid(b.x0, b.x1, crop.width) - 0.5) < 0.4 && Math.abs(mid(b.y0, b.y1, crop.height) - 0.5) < 0.25));
  const found = glyphs(m, crop.width, crop.height, keep);
  if (!found.length) return null;
  let text = '';
  for (const b of found) {
    const g = normalize(m, crop.width, b);
    let best = null, bestD = Infinity, secondD = Infinity;
    for (const [digit, t] of Object.entries(templates)) {
      const d = distance(g, t);
      if (d < bestD) [best, bestD, secondD] = [digit, d, bestD];
      else if (d < secondD) secondD = d;
    }
    if (bestD > MAX_DISTANCE || secondD - bestD < MIN_MARGIN) return null;
    text += best;
  }
  return Number(text);
}

module.exports = { H, W, mask, glyphs, normalize, distance, read };
