// Jungle-Route für die Champ-Auswahl aus Phylaris' öffentlicher „Jungle Clear Compilation“ (Google-Tabelle,
// auch von Zilean genutzt). Je Eintrag: Patch, Champion, Camps, Smites, Route („Red-Krugs-Raptors-…“), Zeit, Video.
// Riot liefert keine Routen, lolalytics auch nicht, und OP.GG/Blitz verbieten das Abgreifen in ihren AGB.
// Die Tabelle wird nicht mehr jeden Patch gepflegt (neuester Tab: Season 13), die Reihenfolge der Camps ändert sich
// aber kaum; deshalb gilt je Champion und Startcamp der neueste Eintrag, ohne Eintrag die Standard-Full-Clear.
// Einen Tag lang zwischengespeichert.
const fs = require('fs');
const path = require('path');

const CACHE_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Farmy (+https://github.com/JamyH/farmy)';
const SHEET = 'https://docs.google.com/spreadsheets/d/1Gjk5UrtAbcqdYnRlx9KMDuHGxhKsEv50vhn02cN0y-c';
const SOURCE = `${SHEET}/edit#gid=748212425`;
const TABS = [748212425, 642080859]; // Season 13, Season 12 (gleicher Spaltenaufbau)
const CAMPS = ['Blue', 'Gromp', 'Wolves', 'Raptors', 'Red', 'Krugs'];
// Standard-Full-Clear, wenn die Tabelle den Champion nicht kennt
const STANDARD = [
  ['Red', 'Krugs', 'Raptors', 'Wolves', 'Blue', 'Gromp'],
  ['Blue', 'Gromp', 'Wolves', 'Raptors', 'Red', 'Krugs'],
];

const ALIAS = { nunuwillump: 'nunu' }; // Data-Dragon-Name -> Name in der Tabelle

let cacheFile = null;
let cache = {}; // { fetchedAt, rows: [{ patch, champ, camps, smites, route, time, link, player }] }

function init(dir) {
  cacheFile = path.join(dir, 'jungle-cache.json');
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    cache = {};
  }
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// CSV mit Anführungszeichen (Hinweistexte oben in der Tabelle enthalten Kommas und "")
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') cell += '"', i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n') row.push(cell), rows.push(row), (row = []), (cell = '');
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows;
}

// „Blue (HP)“ → Blue, „Gromp (Speed)“ → Gromp; Sonderfälle wie „Gromp>B>Krugs“ fallen raus
function parseRoute(s) {
  const route = s.split('-').map((x) => x.replace(/\(.*\)/, '').trim());
  return route.length >= 3 && route.every((x) => CAMPS.includes(x)) ? route : null;
}

const patchNum = (p) => {
  const [a, b] = String(p).split('.').map(Number);
  return a * 100 + (b || 0);
};
const seconds = (t) => {
  const [m, s] = String(t).split(':').map(Number);
  return m * 60 + s || null;
};

async function loadRows() {
  if (cache.rows && Date.now() - cache.fetchedAt < CACHE_MS) return cache.rows;
  try {
    const tabs = await Promise.all(TABS.map(async (gid) => {
      const res = await fetch(`${SHEET}/export?format=csv&gid=${gid}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`docs.google.com antwortet mit ${res.status}`);
      return parseCsv(await res.text());
    }));
    const rows = [];
    for (const tab of tabs) {
      const head = tab.findIndex((r) => r[0] === 'Patch');
      for (const r of tab.slice(head + 1)) {
        const route = /^\d+\.\d+$/.test(r[0]) && parseRoute(r[4] || '');
        if (!route) continue;
        // „Lee Sin (Q Start)“, „Kayn (AD/AD)“: Variante in Klammern, zählt zum Champion
        const variant = ((r[1] || '').match(/\((.*)\)/) || [])[1] || '';
        rows.push({ patch: r[0], champ: norm(r[1].replace(/\(.*\)/, '')), variant, camps: Number(r[2]) || route.length, smites: Number(r[3]) || null,
          route, time: seconds(r[5]), link: /^https:\/\/(www\.)?youtube\.com\//.test(r[6]) ? r[6] : null, player: r[7] || '' });
      }
    }
    if (!rows.length) throw new Error('Tabelle ohne Routen');
    cache = { fetchedAt: Date.now(), rows };
    if (cacheFile) fs.writeFile(cacheFile, JSON.stringify(cache), () => {});
  } catch (e) {
    if (!cache.rows) throw e;
    console.warn('Jungle-Routen: alter Stand, weil', e.message); // offline: lieber alte Routen als keine
  }
  return cache.rows;
}

// Routen für einen Champion (Name wie in Data Dragon, z. B. „Bel'Veth“): je Startcamp eine, die neueste zuerst,
// bei gleichem Patch mehr Camps und dann die schnellere. Ohne Eintrag die Standard-Full-Clear (standard: true)
async function routes(champName) {
  const key = ALIAS[norm(champName)] || norm(champName);
  const all = await loadRows().catch((e) => (console.warn('Jungle-Routen:', e.message), []));
  const rows = all.filter((r) => r.champ === key)
    .sort((a, b) => patchNum(b.patch) - patchNum(a.patch) || b.camps - a.camps || (a.time || 1e9) - (b.time || 1e9));
  const byStart = new Map();
  for (const r of rows) if (!byStart.has(r.route[0])) byStart.set(r.route[0], r);
  const list = [...byStart.values()];
  return { source: SOURCE, routes: list.length ? list : STANDARD.map((route) => ({ route, camps: route.length, standard: true })) };
}

module.exports = { init, routes, SOURCE };
