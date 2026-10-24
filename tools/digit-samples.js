// Lernt die Ziffern-Muster für src/digits.js aus vorhandenen Aufnahmen: npx electron tools/digit-samples.js
// - Summoner-Restzeiten (weiß) aus debug/spells/, CS (gelb) aus den Screenshots in debug/
// - Beschriftung zunächst per Tesseract; Korrekturen in tools/digit-labels.json ({ "datei": "Wert" })
// - schreibt debug/digit-sheet.png zum Nachprüfen und mit --learn die Muster nach src/digits.json
// - meldet, wie oft die eigene Erkennung (jeweils ohne die geprüfte Aufnahme gelernt) daneben liegt
const { app, nativeImage, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const ocr = require('../src/ocr');
const digits = require('../src/digits');
const layout = require('../src/layout');

const root = path.join(__dirname, '..');
const dbg = path.join(root, 'debug');
const labelsFile = path.join(__dirname, 'digit-labels.json');
const labels = fs.existsSync(labelsFile) ? JSON.parse(fs.readFileSync(labelsFile, 'utf8')) : {};

function samples() {
  const list = [];
  for (const f of fs.readdirSync(path.join(dbg, 'spells')).filter((f) => f.endsWith('.png'))) {
    const crop = ocr.fromNativeImage(nativeImage.createFromPath(path.join(dbg, 'spells', f)));
    if (ocr.spellOnCooldown(crop)) list.push({ name: `spells/${f}`, font: 'white', crop, test: ocr.isWhite });
  }
  const shots = ['screen.png', 'sim1080_hud0.png', 'sim1080_hud100.png',
    ...fs.readdirSync(path.join(dbg, 'hud100')).filter((f) => f.startsWith('screen')).map((f) => `hud100/${f}`)];
  for (const f of shots) {
    const img = nativeImage.createFromPath(path.join(dbg, f));
    const { width, height } = img.getSize();
    list.push({ name: f, font: 'yellow', crop: ocr.fromNativeImage(img, layout.compute(width, height).cs), test: ocr.isYellow });
  }
  // gesammelte CS-Ausschnitte aus dem Spiel (ocr.collectDigits): --samples=<Ordner>, Wert steht im Dateinamen
  const arg = process.argv.find((a) => a.startsWith('--samples='));
  const dir = arg && arg.slice('--samples='.length);
  for (const f of dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^cs_\d+\.png$/.test(f)) : []) {
    const name = `samples/${f}`;
    labels[name] ??= f.match(/\d+/)[0];
    list.push({ name, font: 'yellow', crop: ocr.fromNativeImage(nativeImage.createFromPath(path.join(dir, f))), test: ocr.isYellow });
  }
  return list;
}

const png = (crop, scale) => {
  const bgra = Buffer.from(crop.data);
  for (let j = 0; j < bgra.length; j += 4) [bgra[j], bgra[j + 2]] = [bgra[j + 2], bgra[j]];
  return nativeImage.createFromBitmap(bgra, { width: crop.width, height: crop.height })
    .resize({ width: crop.width * scale, quality: 'good' }).toDataURL();
};
const maskPng = (m, width, height, scale) => {
  const px = Buffer.alloc(width * height * 4);
  for (let i = 0; i < m.length; i++) px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = m[i] ? 255 : 0, px[i * 4 + 3] = 255;
  return nativeImage.createFromBitmap(px, { width, height }).resize({ width: width * scale }).toDataURL();
};

function average(list) {
  const out = new Float32Array(digits.H * digits.W);
  for (const g of list) for (let i = 0; i < out.length; i++) out[i] += g[i] / list.length;
  return out;
}
function learn(all, skip) {
  const byFont = {};
  for (const s of all) {
    if (s === skip || !s.glyphs) continue;
    for (const [d, g] of s.glyphs) ((byFont[s.font] ??= {})[d] ??= []).push(g);
  }
  return Object.fromEntries(Object.entries(byFont).map(([font, ds]) =>
    [font, Object.fromEntries(Object.entries(ds).sort().map(([d, gs]) => [d, average(gs)]))]));
}

app.whenReady().then(async () => {
  await ocr.init(app.getPath('userData'));
  const all = samples();
  for (const s of all) {
    s.tess = await ocr.recognizeTesseract(s.crop, s.test);
    s.label = labels[s.name] ?? (s.tess == null ? null : String(s.tess));
    s.mask = digits.mask(s.crop, s.test);
    s.boxes = digits.glyphs(s.mask, s.crop.width, s.crop.height);
    if (s.label && s.label.length === s.boxes.length) {
      s.glyphs = s.boxes.map((b, i) => [s.label[i], digits.normalize(s.mask, s.crop.width, b)]);
    }
  }

  // eigene Erkennung prüfen: jede Aufnahme mit Mustern aus allen anderen lesen
  let ok = 0, wrong = 0;
  for (const s of all) {
    if (!s.glyphs) continue;
    const t = learn(all, s)[s.font];
    s.own = digits.read(s.crop, s.test, t);
    if (String(s.own) === s.label) ok++;
    else wrong++;
  }
  const unlabeled = all.filter((s) => !s.glyphs);
  console.log(`Aufnahmen ${all.length}, beschriftet ${all.length - unlabeled.length}, eigene Erkennung richtig ${ok}, falsch ${wrong}`);
  for (const s of all.filter((s) => s.glyphs && String(s.own) !== s.label)) console.log('  falsch:', s.name, 'soll', s.label, 'ist', s.own);
  for (const s of unlabeled) console.log('  ohne Beschriftung:', s.name, 'Tesseract', s.tess, 'Glyphen', s.boxes.length);
  // Gleiche Schrift? CS (gelb) nur mit den weißen Mustern lesen
  const white = learn(all).white;
  for (const s of all.filter((s) => s.font === 'yellow' && s.label)) {
    const m = digits.mask(s.crop, s.test);
    const ds = s.boxes.map((b) => {
      const g = digits.normalize(m, s.crop.width, b);
      return Object.entries(white).map(([d, t]) => [d, digits.distance(g, t)]).sort((a, b) => a[1] - b[1])[0];
    });
    console.log('  gelb mit weißen Mustern:', s.name, 'soll', s.label, 'ist', ds.map(([d, x]) => `${d}(${x.toFixed(3)})`).join(' '));
  }
  const counts = {};
  for (const s of all) for (const [d] of s.glyphs || []) counts[`${s.font} ${d}`] = (counts[`${s.font} ${d}`] || 0) + 1;
  console.log('Muster je Ziffer:', JSON.stringify(counts));

  if (process.argv.includes('--learn')) {
    const t = learn(all);
    const round = (a) => Array.from(a, (v) => Math.round(v * 100) / 100);
    const json = Object.fromEntries(Object.entries(t).map(([f, ds]) => [f, Object.fromEntries(Object.entries(ds).map(([d, a]) => [d, round(a)]))]));
    fs.writeFileSync(path.join(root, 'src', 'digits.json'), JSON.stringify({ H: digits.H, W: digits.W, ...json }));
    console.log('src/digits.json geschrieben');
  }

  // Übersicht: Ausschnitt, Maske, Tesseract, Beschriftung, eigene Erkennung
  const rows = all.map((s) => {
    const bad = s.glyphs && String(s.own) !== s.label;
    return `<div class="r${bad ? ' bad' : ''}${s.glyphs ? '' : ' none'}"><img src="${png(s.crop, 3)}"><img src="${maskPng(s.mask, s.crop.width, s.crop.height, 3)}">` +
      `<span>${s.name}<br>T ${s.tess} · L ${s.label} · E ${s.own ?? '–'} · ${s.boxes.length} Gl.</span></div>`;
  });
  const html = `<style>body{margin:0;background:#111;color:#ddd;font:11px sans-serif;display:flex;flex-wrap:wrap}
    .r{display:flex;gap:4px;align-items:center;padding:3px;width:330px}.bad{background:#611}.none{background:#443}
    img{image-rendering:pixelated}</style>${rows.join('')}`;
  const win = new BrowserWindow({ show: false, width: 1700, height: 3000 });
  // über eine Datei: bei vielen Aufnahmen wird eine data:-Adresse zu lang
  const sheet = path.join(dbg, 'digit-sheet.html');
  fs.writeFileSync(sheet, html);
  await win.loadFile(sheet);
  const h = await win.webContents.executeJavaScript('document.body.scrollHeight');
  win.setContentSize(1700, h);
  await new Promise((r) => setTimeout(r, 300));
  fs.writeFileSync(path.join(dbg, 'digit-sheet.png'), (await win.webContents.capturePage()).toPNG());
  console.log('debug/digit-sheet.png');
  app.quit();
});
