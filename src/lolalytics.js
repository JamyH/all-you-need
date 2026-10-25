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

// mode: 'sr' (Summoner's Rift, je Rolle) oder 'aram' (eigene Seite, gilt auch für ARAM Mayhem)
function pageUrl(champId, position, mode = 'sr') {
  if (mode === 'aram') return `https://lolalytics.com/lol/${slug(champId)}/aram/build/`;
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

// Skill-Priorität (z. B. Q > E > W) und Skill-Reihenfolge für Level 1–18 als Buchstaben.
// Lolalytics zeigt die Reihenfolge als Raster: je Fähigkeit eine Zeile, belegte Felder enthalten das Level (1–15).
// Level 16–18 ergänzen wir: R, sobald möglich, sonst die nächste noch nicht volle Fähigkeit nach Priorität.
function skills(html) {
  const prio = section(html, 'Skill Priority', 'Summoner Spells');
  const grid = section(html, 'Skill Order', 'Primary Runes');
  if (!prio || !grid) return { skillPriority: null, skillOrder: null };
  // nur src= zählen, srcset enthält dieselbe Adresse noch einmal
  const skillPriority = [...prio.text.matchAll(/src="[^"]*\/skill68\/[^"]*_([qwe])\.webp"/g)].map((m) => m[1].toUpperCase());
  const order = [];
  for (const chunk of grid.text.split(/src="[^"]*\/skill68\//).slice(1)) {
    const key = (chunk.match(/^[^"]*_([qwer])\.webp/) || [])[1];
    if (!key) continue;
    for (const m of chunk.matchAll(/leading-\[26px\][^>]*>(\d+)</g)) order[Number(m[1]) - 1] = key.toUpperCase();
  }
  if (skillPriority.length !== 3 || order.filter(Boolean).length < 10) return { skillPriority: null, skillOrder: null };
  // Champs ohne normale Ulti auf 6/11/16 (Jayce, Udyr …) haben bis zu 6 Ränge pro Fähigkeit
  const normalUlt = order[5] === 'R' && order[10] === 'R';
  const max = normalUlt ? { Q: 5, W: 5, E: 5, R: 3 } : { Q: 6, W: 6, E: 6, R: 6 };
  const candidates = normalUlt ? skillPriority : [...skillPriority, 'R'];
  const count = (k, upTo) => order.slice(0, upTo).filter((x) => x === k).length;
  for (let lvl = 1; lvl <= 18; lvl++) {
    if (order[lvl - 1]) continue;
    const rReady = normalUlt && [6, 11, 16].filter((l) => l <= lvl).length > count('R', lvl - 1);
    order[lvl - 1] = rReady ? 'R' : candidates.find((k) => count(k, lvl - 1) < max[k]) || candidates[0];
  }
  return { skillPriority, skillOrder: order };
}

// Summoner: das meistgespielte Paar, nicht das mit der höchsten Siegrate, das die Seite oben zeigt (bei Kayn
// Jungle z. B. Zerschmettern + Entzünden mit 6 % statt Blitz + Zerschmettern mit 94 %). Alle Paare stehen im
// eingebetteten Qwik-Zustand als [„4_11“, Siegrate, Pickrate, Spiele]; fehlt der, gilt das gezeigte Paar.
function spells(page, html) {
  try {
    const m = page.match(/<script type="qwik\/json">([\s\S]*?)<\/script>/);
    const objs = m ? JSON.parse(m[1]).objs || [] : [];
    const deref = (v) => (typeof v === 'string' && /^[0-9a-z]+$/.test(v) && objs[parseInt(v, 36)] !== undefined ? objs[parseInt(v, 36)] : v);
    const root = objs.find((o) => o && typeof o === 'object' && !Array.isArray(o) && 'spells' in o && 'runes' in o && 'skill6' in o);
    const list = root ? deref(root.spells) : null;
    const rows = Array.isArray(list) ? list.map(deref).filter(Array.isArray).map((r) => r.map(deref)) : [];
    const best = rows.filter((r) => /^\d+_\d+$/.test(r[0]) && typeof r[3] === 'number').sort((a, b) => b[3] - a[3])[0];
    if (best) return best[0].split('_').map(Number);
  } catch {
    // Zustand nicht lesbar -> gezeigtes Paar
  }
  const shown = section(html, 'Summoner Spells', 'Skill Order');
  const ids = shown ? images(shown.text, 'spell64').map((s) => s.id) : [];
  return ids.length === 2 ? ids : null;
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
    ...skills(html),
    spells: spells(page, html),
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
function cached(champId, mode = 'sr') {
  const hits = Object.values(cache || {}).filter((e) => e.champId === champId && (e.mode || 'sr') === mode);
  return hits.sort((a, b) => (b.usedAt || b.fetchedAt) - (a.usedAt || a.fetchedAt))[0] || null;
}

async function load(champId, position, mode = 'sr') {
  const aram = mode === 'aram';
  const key = aram ? `${champId}|aram` : `${champId}|${lane(position) || ''}`;
  const hit = cache[key];
  // ältere Einträge ohne Summoner -> neu holen
  if (hit && 'spells' in hit && Date.now() - hit.fetchedAt < CACHE_MS) {
    hit.usedAt = Date.now();
    return hit;
  }
  const url = pageUrl(champId, position, mode);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`lolalytics.com antwortet mit ${res.status}`);
  const data = parse(await res.text());
  if (!data) throw new Error('lolalytics.com: Seitenaufbau nicht erkannt');
  cache[key] = { champId, mode: aram ? 'aram' : 'sr', lane: aram ? null : lane(position), url, fetchedAt: Date.now(), ...data };
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return cache[key];
}

// Matchup-Seite (Champion gegen Lane-Gegner, nur Summoner's Rift): Siegrate, Abweichung zum Durchschnittsgegner,
// bereinigte Abweichung (Stärke beider Champs herausgerechnet), Spiele und First-Blood-Anteil als frühes Signal.
// Die Werte stehen im Fließtext („Irelia wins against Darius 51.22% of the time which is 4.02% different …“)
// und in der Ziel-Tabelle („First Blood 52.59 56.81 47.41 45.02“: eigener Anteil, Siegrate damit, Gegner …)
const num = (s) => Number(String(s).replace(/,/g, ''));
function parseMatchup(page) {
  const text = page.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
  const wr = text.match(/wins against .{1,40}? (-?[\d.]+)% of the time which is (-?[\d.]+)% different/);
  if (!wr) return null;
  const norm = text.match(/After normalising both champions win rates .{1,60}? (-?[\d.]+)% different/);
  const games = text.match(/% Win Rate ([\d,]+) Games/);
  const fb = text.match(/First Blood ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/);
  return {
    winRate: num(wr[1]),
    delta: num(wr[2]),
    normalized: norm ? num(norm[1]) : null,
    games: games ? num(games[1]) : null,
    firstBlood: fb ? num(fb[1]) : null,
  };
}

async function matchup(champId, vsId, position) {
  const l = lane(position) || 'top';
  const key = `vs|${champId}|${vsId}|${l}`;
  const hit = cache[key];
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit;
  const url = `https://lolalytics.com/lol/${slug(champId)}/vs/${slug(vsId)}/build/?lane=${l}&vslane=${l}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`lolalytics.com antwortet mit ${res.status}`);
  const data = parseMatchup(await res.text());
  if (!data) throw new Error('lolalytics.com: zu wenige Spiele oder Seitenaufbau nicht erkannt');
  cache[key] = { champId, vsId, lane: l, url, fetchedAt: Date.now(), ...data };
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return cache[key];
}

// ARAM-Tierliste: Siegrate, Pickrate und Spiele aller Champions, nach Champion-Key ({ "32": { wr, pr, games } }).
// Die Tabelle im HTML zeigt nur die ersten 20 Zeilen; alle Werte stehen im eingebetteten Qwik-Zustand
// (<script type="qwik/json">). Dort verweisen Werte per Base-36-Index auf die Liste objs.
const TIER_URL = 'https://lolalytics.com/lol/tierlist/aram/';
function parseTier(page) {
  const m = page.match(/<script type="qwik\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  const objs = JSON.parse(m[1]).objs || [];
  const ref = (v) => objs[parseInt(v, 36)];
  const isStat = (x) => x && typeof x === 'object' && !Array.isArray(x) && 'wr' in x && 'games' in x;
  // das Objekt mit über 100 Zahlen-Schlüsseln (Champion-Keys), deren Werte auf Statistik-Objekte zeigen
  const table = objs.find((x) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length > 100 &&
    Object.keys(x).every((k) => /^\d+$/.test(k)) && isStat(ref(Object.values(x)[0])));
  if (!table) return null;
  const out = {};
  for (const [key, v] of Object.entries(table)) {
    const s = ref(v);
    if (isStat(s) && typeof ref(s.wr) === 'number') out[key] = { wr: ref(s.wr), pr: ref(s.pr), games: ref(s.games) };
  }
  return Object.keys(out).length > 100 ? out : null;
}

async function aramTier() {
  const hit = cache['tier|aram'];
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit;
  const res = await fetch(TIER_URL, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`lolalytics.com antwortet mit ${res.status}`);
  const champs = parseTier(await res.text());
  if (!champs) throw new Error('lolalytics.com: Tierliste nicht erkannt');
  cache['tier|aram'] = { url: TIER_URL, fetchedAt: Date.now(), champs };
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return cache['tier|aram'];
}

module.exports = { init, load, cached, parse, pageUrl, parseTier, aramTier, parseMatchup, matchup };
