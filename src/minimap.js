// Minimap auf dem Bildschirm finden, damit die Jungle-Route bei jeder Minimap-Größe, Auflösung und mit
// „Minimap links“ passt. Merkmal: Die Karte von Summoner's Rift hat an allen vier Rändern einen schwarzen Saum
// (vermessen 27.10. bei 3440×1440: ~20 px breit), nur die Basen in den Ecken sind farbig. Rahmen und
// Spielwelt drumherum sind nie ganz schwarz.
// Vorgehen auf einem Ausschnitt der unteren Ecke (RGBA): erst die äußere Kante (rechts bzw. links) und die
// Unterkante als äußerste schwarze Pixel, dann die Kantenlänge, bei der die gegenüberliegenden Ränder in der
// Mitte schwarz sind und direkt davor nicht.
const BLACK = 12; // hellster Kanal darunter = schwarz

function find(crop, flip = false) {
  const { width: W, height: H, data } = crop;
  const black = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const p = (y * W + x) * 4;
    return data[p] < BLACK && data[p + 1] < BLACK && data[p + 2] < BLACK;
  };
  const median = (list) => {
    const v = list.filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[v.length >> 1] : null;
  };
  const reach = Math.round(H * 0.15); // so weit vom Bildrand suchen wir die äußeren Kanten
  // Außenkante: je Zeile im unteren Bereich das äußerste schwarze Pixel
  const edgeX = median(Array.from({ length: 12 }, (_, i) => {
    const y = H - Math.round(H * (0.12 + i * 0.01));
    for (let k = 0; k < reach; k++) {
      const x = flip ? k : W - 1 - k;
      if (black(x, y) && black(flip ? x + 1 : x - 1, y)) return x;
    }
    return null;
  }));
  if (edgeX == null) return null;
  const inward = flip ? 1 : -1;
  const bottom = median(Array.from({ length: 12 }, (_, i) => {
    const x = edgeX + inward * Math.round(H * (0.12 + i * 0.01));
    for (let k = 0; k < reach; k++) if (black(x, H - 1 - k) && black(x, H - 2 - k)) return H - 1 - k;
    return null;
  }));
  if (bottom == null) return null;

  // Anteil schwarzer Pixel auf einer Linie (Mitte des Randes, 30 % der Kantenlänge)
  const shareCol = (x, y0, y1) => {
    let n = 0;
    for (let y = y0; y < y1; y++) n += black(x, y);
    return n / Math.max(1, y1 - y0);
  };
  const shareRow = (y, x0, x1) => {
    let n = 0;
    for (let x = x0; x < x1; x++) n += black(x, y);
    return n / Math.max(1, x1 - x0);
  };
  let best = null;
  for (let s = Math.round(H * 0.2); s <= Math.min(H, W) - 4; s++) {
    const far = edgeX + inward * (s - 1); // gegenüberliegende Seitenkante
    const top = bottom - (s - 1);
    if (far < 2 || far > W - 3 || top < 2) break;
    const ys = [bottom - Math.round(s * 0.65), bottom - Math.round(s * 0.35)];
    const xa = edgeX + inward * Math.round(s * 0.35), xb = edgeX + inward * Math.round(s * 0.65);
    const [x0, x1] = [Math.min(xa, xb), Math.max(xa, xb)];
    // innen: die Kante selbst und ein Pixel nach innen; außen: zwei Pixel davor
    const score = shareCol(far, ...ys) + shareCol(far - inward, ...ys) + shareRow(top, x0, x1) + shareRow(top + 1, x0, x1)
      - 2 * shareCol(far + inward * 2, ...ys) - 2 * shareRow(top - 2, x0, x1);
    if (!best || score >= best.score) best = { s, score }; // Gleichstand: der äußere Rand des Saums
  }
  // vier Linien innen fast ganz schwarz, außen kaum: Höchstwert 4
  if (!best || best.score < 2.5) return null;
  return { x: flip ? edgeX : edgeX - best.s + 1, y: bottom - best.s + 1, size: best.s };
}

module.exports = { find };
