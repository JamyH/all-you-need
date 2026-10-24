// Data Dragon: Itempreise und Championnamen, im userData-Ordner gecacht.
const fs = require('fs');
const path = require('path');

let items = {};
let champsById = {};
let version = null;

async function load(cacheDir, language) {
  const cacheFile = path.join(cacheDir, 'ddragon-cache.json');
  try {
    const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
    version = versions[0];
    let cache = null;
    if (fs.existsSync(cacheFile)) cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (!cache || cache.version !== version || cache.language !== language || !cache.runes) {
      const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${language}`;
      const [itemJson, champJson, runes] = await Promise.all([
        (await fetch(`${base}/item.json`)).json(),
        (await fetch(`${base}/champion.json`)).json(),
        (await fetch(`${base}/runesReforged.json`)).json(),
      ]);
      cache = { version, language, items: itemJson.data, champions: champJson.data, runes };
      fs.writeFileSync(cacheFile, JSON.stringify(cache));
    }
    apply(cache);
  } catch (e) {
    // Offline: alten Cache nehmen, falls vorhanden
    if (fs.existsSync(cacheFile)) apply(JSON.parse(fs.readFileSync(cacheFile, 'utf8')));
    console.warn('Data Dragon nicht erreichbar:', e.message);
  }
}

let runeNames = {};
let runeStyles = {};
function apply(cache) {
  version = cache.version;
  items = cache.items;
  runeNames = {};
  runeStyles = {};
  for (const style of cache.runes || []) {
    runeNames[style.id] = { name: style.name, icon: `https://ddragon.leagueoflegends.com/cdn/img/${style.icon}` };
    for (const slot of style.slots) {
      for (const r of slot.runes) {
        runeNames[r.id] = { name: r.name, icon: `https://ddragon.leagueoflegends.com/cdn/img/${r.icon}` };
        runeStyles[r.id] = style.id;
      }
    }
  }
  champsById = {};
  for (const c of Object.values(cache.champions)) champsById[c.key] = { id: c.id, name: c.name };
}

// Fähigkeitskosten pro Champion (Q, W, E, R je Rang), einmal geladen und gemerkt
const spellCache = new Map();
function championSpells(id) {
  if (!version || !id) return null;
  if (!spellCache.has(id)) {
    spellCache.set(id, null);
    fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${id}.json`)
      .then((r) => r.json())
      .then((j) => {
        const c = j.data[id];
        spellCache.set(id, { partype: c.partype, costs: c.spells.map((s) => s.cost) });
      })
      .catch(() => spellCache.delete(id)); // beim nächsten Poll erneut versuchen
  }
  return spellCache.get(id);
}

function itemGold(itemId, fallback = 0) {
  const it = items[String(itemId)];
  return it ? it.gold.total : fallback;
}

function champion(id) {
  return champsById[String(id)] || { id: String(id), name: `#${id}` };
}

// Data-Dragon-ID („Ahri“) -> Champion-Key (Zahl), den der Client erwartet
const championKey = (id) => Object.keys(champsById).find((k) => champsById[k].id === id) || null;

const championList = () => Object.values(champsById).sort((a, b) => a.name.localeCompare(b.name, 'de'));

// Kaufbare Items auf Summoner's Rift (Map 11), für den Build-Editor
function itemList() {
  return Object.entries(items)
    .filter(([, it]) => it.gold.purchasable && it.maps?.['11'] && it.gold.total > 0 && !it.requiredChampion)
    .map(([id, it]) => ({ id: Number(id), name: it.name, gold: it.gold.total, completed: !it.into || it.into.length === 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// Was kostet das Item noch, wenn man die Teile im Inventar anrechnet? Wie im Shop:
// besitzt man ein Teil des Rezepts, zählt es als bezahlt (owned: Map itemId -> Anzahl, wird verbraucht).
function remainingCost(itemId, owned) {
  const id = String(itemId);
  if ((owned.get(id) || 0) > 0) {
    owned.set(id, owned.get(id) - 1);
    return 0;
  }
  const it = items[id];
  if (!it) return 0;
  return it.gold.base + (it.from || []).reduce((sum, child) => sum + remainingCost(child, owned), 0);
}

// Direkte Teile eines Items, wie der Shop sie im Rezept zeigt (Item-IDs als Zahlen)
const components = (itemId) => (items[String(itemId)]?.from || []).map(Number);

// Name + Icon für Runenbaum oder Rune (Werte-Splitter haben keinen Eintrag -> null)
const rune = (id) => runeNames[id] || null;
// Runenbaum, zu dem eine Rune gehört
const runeStyle = (id) => runeStyles[id] || null;

const itemName = (itemId) => items[String(itemId)]?.name || `#${itemId}`;

function iconUrl(kind, file) {
  if (!version) return '';
  if (kind === 'champion') return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${file}.png`;
  if (kind === 'item') return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${file}.png`;
  return '';
}

module.exports = {
  load, itemGold, champion, championKey, championList, championSpells, itemList, itemName, remainingCost, components, rune, runeStyle, iconUrl,
  getVersion: () => version,
};
