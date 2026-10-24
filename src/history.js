// Eigene Endbuilds, im userData-Ordner gemerkt. Der Client liefert nur die letzten 20 Spiele,
// deshalb übernimmt die App jedes Spiel selbst und baut so mit der Zeit einen längeren Verlauf auf.
const fs = require('fs');
const path = require('path');

let file = null;
let games = {}; // gameId -> { champ (Key), map, items, win, at }

function init(dir) {
  file = path.join(dir, 'item-history.json');
  try {
    if (fs.existsSync(file)) games = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn('Item-Verlauf nicht lesbar:', e.message);
  }
}

// Antwort von /lol-match-history/... übernehmen; neue Spiele werden gespeichert. Gibt die Anzahl neuer zurück.
function add(matchHistory) {
  let added = 0;
  for (const g of matchHistory?.games?.games || []) {
    const p = g.participants?.[0];
    // nur echte Spiele: Practice Tool und Custom Games verfälschen die Statistik
    if (!p || games[g.gameId] || g.gameType !== 'MATCHED_GAME') continue;
    const s = p.stats || {};
    games[g.gameId] = {
      champ: p.championId,
      map: g.mapId,
      items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5].filter(Boolean),
      win: !!s.win,
      at: g.gameCreation,
    };
    added++;
  }
  if (added) fs.writeFileSync(file, JSON.stringify(games));
  return added;
}

// Meistgebaute fertige Items eines Champs auf einer Map: [{ id, count, wins }], häufigste zuerst.
// finished(id) entscheidet, was als fertiges Item zählt (keine Teile, Tränke, Schmuckstücke).
function topItems(champKey, map, finished) {
  const list = Object.values(games).filter((g) => g.champ === champKey && g.map === map);
  const count = new Map();
  for (const g of list) {
    for (const id of new Set(g.items.filter(finished))) {
      const c = count.get(id) || { id, count: 0, wins: 0 };
      c.count++;
      if (g.win) c.wins++;
      count.set(id, c);
    }
  }
  return { games: list.length, items: [...count.values()].sort((a, b) => b.count - a.count || b.wins - a.wins) };
}

module.exports = { init, add, topItems };
