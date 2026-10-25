// Unsichtbares Fenster: hält während eines Spiels einen Bildschirm-Stream mit 4 fps offen und schneidet
// auf Anfrage nur die kleinen Bereiche aus (statt jedes Mal ein Vollbild zu holen).
let stream = null;
let grabber = null;
let generation = 0; // ein stop() während des Starts verwirft den gerade entstehenden Stream

async function start(sourceId) {
  stop();
  const mine = generation;
  const s = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxFrameRate: 4 } },
  });
  if (mine !== generation) return s.getTracks().forEach((t) => t.stop());
  stream = s;
  grabber = new ImageCapture(stream.getVideoTracks()[0]);
}

// Außerhalb des Spiels kein Stream: der kostet sonst dauerhaft Leistung, z. B. beim Video schauen
function stop() {
  generation++;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = grabber = null;
}

// Zeichenflächen je Ausschnittgröße wiederverwenden statt jede Sekunde neue anzulegen
const canvases = new Map();
function canvasFor(width, height) {
  const key = `${width}x${height}`;
  if (!canvases.has(key)) {
    const canvas = new OffscreenCanvas(width, height);
    canvases.set(key, canvas.getContext('2d', { willReadFrequently: true }));
  }
  return canvases.get(key);
}

async function grab(regions) {
  if (!grabber) throw new Error('Bildschirmaufnahme läuft nicht');
  const frame = await grabber.grabFrame();
  const out = regions.map((r) => {
    const ctx = canvasFor(r.width, r.height);
    ctx.drawImage(frame, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    const { data } = ctx.getImageData(0, 0, r.width, r.height);
    return { width: r.width, height: r.height, data };
  });
  frame.close();
  return out;
}

// Scoreboard-Ornament suchen (Raute oben, goldenes Mittelstück, schmale V-Kerbe darunter).
// Das Bild wird so verkleinert, dass das Ornament immer so groß ist wie bei 1440p in halber Auflösung
// (Faktor 2 × scale, scale = Bildschirmhöhe / 1440); alle Maße unten gelten in diesem Raster.
// region = null heißt ganzer Bildschirm. Liefert den Anker (Mitte des Mittelstücks, volle Auflösung) oder null.
async function findScoreboard(region, scale = 1) {
  if (!grabber) throw new Error('Bildschirmaufnahme läuft nicht');
  const frame = await grabber.grabFrame();
  const r = region || { x: 0, y: 0, width: frame.width, height: frame.height };
  const step = 2 * scale;
  const W = Math.floor(r.width / step), H = Math.floor(r.height / step);
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, r.x, r.y, r.width, r.height, 0, 0, W, H);
  frame.close();
  const px = ctx.getImageData(0, 0, W, H).data;

  const g = new Uint8Array(W * H);
  const rowSum = new Uint32Array(H);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    const red = px[p], gr = px[p + 1], b = px[p + 2];
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

window.capture.onStart((id) => start(id).then(() => window.capture.ready(), (e) => window.capture.ready(e.message)));
window.capture.onStop(stop);
// Anfragen nacheinander abarbeiten: gleichzeitige grabFrame()-Aufrufe auf demselben Stream hängen sich auf
let queue = Promise.resolve();
window.capture.onGrab((reqId, req) => {
  queue = queue.then(async () => {
    try {
      // Array = Ausschnitte holen, { scoreboard } = Scoreboard suchen (nicht "find": das hat jedes Array)
      const t = performance.now();
      const result = Array.isArray(req) ? await grab(req) : await findScoreboard(req.scoreboard, req.scale);
      const ms = performance.now() - t;
      if (ms > 800) console.warn(`langsame Anfrage: ${Math.round(ms)} ms`, Array.isArray(req) ? 'grab' : 'scoreboard');
      window.capture.grabbed(reqId, result);
    } catch (e) {
      window.capture.grabbed(reqId, null, e.message);
    }
  });
});
