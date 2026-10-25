// Augment-Tiers für ARAM Mayhem nach arammayhem.com (Daten unter CC BY 4.0, Quellenangabe Pflicht).
// Riot erlaubt keine Siegquoten für Augments, deshalb nutzt die Seite (und diese App) nur Pickraten und
// redaktionelle Combo-Einschätzungen:
// - je Champion die 6 meistgewählten Augments jeder Seltenheit (Champion-Seite)
// - Combo-Tags je Champion: god, strong, blackTech, trap, entertainment, bug (Datei combos.json)
// - globale Pickrate jedes Augments (Datei augments.json)
// arammayhem.com nennt Augments englisch, die Zuordnung zur Riot-ID läuft über die englischen Namen
// von CommunityDragon. Alles wird einen Tag lang zwischengespeichert.
const fs = require('fs');
const path = require('path');

const CACHE_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'AllYouNeed (+https://github.com/JamyH/all-you-need)';
const DATA = 'https://arammayhem.com/data/v1/latest';
const EN_NAMES = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json';
const RARITY = { kSilver: 'silver', kGold: 'gold', kPrismatic: 'prismatic' };

let cacheFile = null;
let cache = {}; // global: { fetchedAt, augments, combos, champions }, champ|<id>: { fetchedAt, top }

function init(dir) {
  cacheFile = path.join(dir, 'arammayhem-cache.json');
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }
}

async function get(url, json = true) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${new URL(url).host} antwortet mit ${res.status}`);
  return json ? res.json() : res.text();
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const unescape = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// Pickraten, Combos und Champion-Adressen; Augments schon auf Riot-IDs umgeschlüsselt
async function loadGlobal() {
  const hit = cache.global;
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit;
  const [aug, combos, champs, en] = await Promise.all([
    get(`${DATA}/augments.json`), get(`${DATA}/combos.json`), get(`${DATA}/champions.json`), get(EN_NAMES),
  ]);
  const riotId = {}; // normierter englischer Name -> Riot-ID
  for (const a of en) if (a.id >= 1000 && a.nameTRA) riotId[norm(a.nameTRA)] = a.id;
  const byAm = {}; // arammayhem-ID -> Riot-ID
  const augments = {}; // Riot-ID -> { rarity, rank (1 = beliebteste ihrer Seltenheit), of }
  const rows = aug.rows.filter((r) => riotId[norm(r.name.en)]);
  for (const r of rows) byAm[r.augmentId] = riotId[norm(r.name.en)];
  for (const rarity of new Set(rows.map((r) => r.rarity))) {
    const list = rows.filter((r) => r.rarity === rarity).sort((a, b) => b.pickRate - a.pickRate);
    list.forEach((r, i) => (augments[byAm[r.augmentId]] = { rarity, rank: i + 1, of: list.length }));
  }
  // nur Combos aus einem einzigen Augment sagen etwas über dieses Augment allein
  const comboTags = {}; // championId -> { Riot-ID: [tags] }
  for (const c of combos.rows) {
    if (c.augmentIds.length !== 1 || !byAm[c.augmentIds[0]]) continue;
    (comboTags[c.championId] ||= {})[byAm[c.augmentIds[0]]] = c.types;
  }
  const champions = Object.fromEntries(champs.rows.map((c) => [c.championId, c.url]));
  cache.global = { fetchedAt: Date.now(), augments, comboTags, champions, enIds: riotId };
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return cache.global;
}

// Champion-Seite: Liste „Appearance rate“ je Seltenheit (die 6 meistgewählten), als { Riot-ID: { rank, rate } }
function parseChampion(page, enIds) {
  const re = /text-rarity-(\w+)" title="([^"]+)"[\s\S]{0,400}?Appearance rate: <span[^>]*>([\d.]+)%/g;
  const top = {};
  const seen = {};
  for (const m of page.matchAll(re)) {
    const id = enIds[norm(unescape(m[2]))];
    if (!id || top[id]) continue;
    seen[m[1]] = (seen[m[1]] || 0) + 1;
    top[id] = { rank: seen[m[1]], rate: Number(m[3]) };
  }
  return Object.keys(top).length ? top : null;
}

async function loadChampion(champId) {
  const g = await loadGlobal();
  const key = `champ|${champId}`;
  const hit = cache[key];
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit;
  const url = g.champions[champId] || `https://arammayhem.com/build/${champId.toLowerCase()}/`;
  const top = parseChampion(await get(url, false), g.enIds);
  if (!top) throw new Error('arammayhem.com: Seitenaufbau nicht erkannt');
  cache[key] = { fetchedAt: Date.now(), url, top };
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return cache[key];
}

// Laden anstoßen, ohne zu warten (beim Spielstart); läuft pro Champion höchstens einmal gleichzeitig
const pending = {};
function prepare(champId) {
  if (!champId || pending[champId]) return;
  const fresh = (e) => e && Date.now() - e.fetchedAt < CACHE_MS;
  if (fresh(cache.global) && fresh(cache[`champ|${champId}`])) return;
  pending[champId] = loadChampion(champId)
    .catch((e) => console.warn('arammayhem:', e.message))
    .finally(() => delete pending[champId]);
}

const ORDER = ['S', 'A', 'B', 'C', 'D'];
const better = (a, b) => (!b || ORDER.indexOf(a.tier) < ORDER.indexOf(b.tier) ? a : b);

// Tier eines Augments für einen Champion (nur aus dem Cache): { tier, why } oder null ohne Daten.
// Combo-Tags gehen vor, „Falle“ schlägt alles; sonst Rang unter den meistgewählten des Champions,
// zuletzt die globale Beliebtheit innerhalb der Seltenheit.
function tier(id, champId, champName = champId) {
  const g = cache.global;
  if (!g) return null;
  const tags = g.comboTags[champId]?.[id] || [];
  if (tags.includes('trap')) return { tier: 'D', why: `Falle mit ${champName}` };
  let best = null;
  if (tags.includes('god')) best = better({ tier: 'S', why: `God-Combo mit ${champName}` }, best);
  if (tags.includes('bug')) best = better({ tier: 'S', why: `Bug-Combo mit ${champName}` }, best);
  if (tags.includes('strong')) best = better({ tier: 'A', why: `starke Combo mit ${champName}` }, best);
  if (tags.includes('blackTech')) best = better({ tier: 'A', why: `Geheimtipp für ${champName}` }, best);
  const top = cache[`champ|${champId}`]?.top?.[id];
  if (top) {
    const t = top.rank <= 2 ? 'S' : top.rank <= 4 ? 'A' : 'B';
    best = better({ tier: t, why: `${String(top.rate).replace('.', ',')} % der ${champName}-Spieler` }, best);
  }
  if (tags.includes('entertainment')) best = better({ tier: 'C', why: `Spaß-Combo mit ${champName}` }, best);
  const all = g.augments[id];
  if (!best && all) best = all.rank <= all.of / 4 ? { tier: 'B', why: 'oft gewählt' } : { tier: 'C', why: 'selten gewählt' };
  return best;
}

module.exports = { init, prepare, loadChampion, tier, parseChampion, RARITY };
