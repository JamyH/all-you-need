// Build- und Runen-Vorschlag von lolalytics.com (Emerald+, aktueller Patch). Lolalytics hat keine offizielle
// Schnittstelle, daher wird die normale Build-Seite gelesen: ein Abruf pro Champion und Rolle, danach
// einen Tag aus dem Cache. Ändert Lolalytics den Seitenaufbau, liefert parse() null statt falscher Daten.
const fs = require('fs');
const path = require('path');
const ddragon = require('./ddragon');

const CACHE_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'AllYouNeed (+https://github.com/JamyH/all-you-need)';
// Rollen der Champ-Auswahl -> Lolalytics-Lanes
const LANES = { top: 'top', jungle: 'jungle', middle: 'middle', bottom: 'bottom', utility: 'support' };
// Lolalytics nimmt den Data-Dragon-Namen in Kleinbuchstaben, bis auf Ausnahmen
const SLUGS = { MonkeyKing: 'wukong' };

const slug = (champId) => SLUGS[champId] || champId.toLowerCase();
const lane = (position) => LANES[position] || null;

function pageUrl(champId, position) {
  const l = lane(position);
  return `https://lolalytics.com/lol/${slug(champId)}/build/${l ? `?lane=${l}` : ''}`;
}

// Abschnitt zwischen zwei Überschriften der Seite (die Überschriften stehen als reiner Text im HTML)
function section(html, from, to, start = 0) {
  const a = html.indexOf(`>${from}<`, start);
  if (a < 0) return null;
  const b = html.indexOf(`>${to}<`, a);
  return b < 0 ? null : { text: html.slice(a, b), end: b };
}

// Bilder eines Abschnitts in Reihenfolge: { id, dim } (dim = ausgegraut, also nicht gewählt).
// Nur src= zählt, srcset enthält dieselbe Adresse noch einmal.
function images(text, kind) {
  const re = new RegExp(`<img[^>]*?src="[^"]*/${kind}/(\\d+)\\.webp"[^>]*>`, 'g');
  return [...text.matchAll(re)].map((m) => ({ id: Number(m[1]), dim: /class="[^"]*grayscale/.test(m[0]) }));
}

// Item-Alternativen (Item 4–6) mit Siegrate und Anzahl Spiele, meistgespielte zuerst
function byGames(text) {
  const re = /src="[^"]*\/item64\/(\d+)\.webp"[\s\S]*?>([\d.]+)%<\/span>[\s\S]*?>([\d,]+)<\/span>/g;
  const options = [...text.matchAll(re)].map((m) => ({ id: Number(m[1]), games: Number(m[3].replace(/,/g, '')) }));
  return options.sort((a, b) => b.games - a.games);
}

function parse(page) {
  const html = page.replace(/<!--[\s\S]*?-->/g, ''); // Framework-Kommentare stehen mitten in Zahlen („78.19<!---->%“)
  const runes = section(html, 'Primary Runes', 'Starting Items');
  const start = runes && section(html, 'Starting Items', 'Core Build', runes.end);
  const core = start && section(html, 'Core Build', 'Item 4', start.end);
  if (!core) return null;

  const picked = images(runes.text, 'rune68').filter((r) => !r.dim).map((r) => r.id);
  const shards = images(runes.text, 'statmod32').filter((r) => !r.dim).map((r) => r.id);
  const primaryStyleId = ddragon.runeStyle(picked[0]);
  const subStyleId = ddragon.runeStyle(picked[4]);
  // 1 Schlüsselstein + 3 Hauptbaum + 2 Nebenbaum + 3 Werte-Splitter, sonst stimmt etwas mit der Seite nicht
  const runeOk = picked.length === 6 && shards.length === 3 && primaryStyleId && subStyleId && primaryStyleId !== subStyleId;

  const items = images(core.text, 'item64').map((i) => i.id);
  for (const [from, to] of [['Item 4', 'Item 5'], ['Item 5', 'Item 6'], ['Item 6', 'LEGEND:']]) {
    const s = section(html, from, to, core.end);
    // meistgespielte Alternative, die noch nicht im Build steht
    const best = s && byGames(s.text).find((o) => !items.includes(o.id));
    if (best) items.push(best.id);
  }
  if (items.length < 3) return null;

  // Start-Items mit Anzahl („x 2“ steht direkt hinter dem Bild)
  const startCount = {};
  for (const chunk of start.text.split('<img').slice(1)) {
    const id = chunk.match(/^[^>]*?src="[^"]*\/item64\/(\d+)\.webp"/);
    if (id) startCount[id[1]] = Number((chunk.match(/>x\s*(\d+)</) || [])[1] || 1);
  }

  return {
    starting: [...new Set(images(start.text, 'item64').map((i) => i.id))],
    startCount,
    items,
    runes: runeOk ? { primaryStyleId, subStyleId, selectedPerkIds: [...picked, ...shards] } : null,
  };
}

let cache = null;
let cacheFile = null;
function init(dir) {
  cacheFile = path.join(dir, 'lolalytics-cache.json');
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }
}

// Vorschlag aus dem Cache, ohne Abruf (für das Spar-Ziel im Spiel und das Stats-Fenster):
// der zuletzt benutzte, also die Rolle aus der letzten Champ-Auswahl
function cached(champId) {
  const hits = Object.values(cache || {}).filter((e) => e.champId === champId);
  return hits.sort((a, b) => (b.usedAt || b.fetchedAt) - (a.usedAt || a.fetchedAt))[0] || null;
}

async function load(champId, position) {
  const key = `${champId}|${lane(position) || ''}`;
  const hit = cache[key];
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) {
    hit.usedAt = Date.now();
    return hit;
  }
  const url = pageUrl(champId, position);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`lolalytics.com antwortet mit ${res.status}`);
  const data = parse(await res.text());
  if (!data) throw new Error('lolalytics.com: Seitenaufbau nicht erkannt');
  cache[key] = { champId, lane: lane(position), url, fetchedAt: Date.now(), ...data };
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return cache[key];
}

module.exports = { init, load, cached, parse, pageUrl };
