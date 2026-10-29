// Eigene Endbuilds, im userData-Ordner gemerkt. Der Client liefert nur die letzten 20 Spiele,
// deshalb übernimmt die App jedes Spiel selbst und baut so mit der Zeit einen längeren Verlauf auf.
const fs = require('fs');
const path = require('path');

let file = null;
// gameId -> { champ (Key), map, items, win, at, k, d, a, cs, dur (s), queue, lane, vis, dmg, gold, taken, obj, turrets }
// k…lane seit 27.10. (CS-Ziel, beste Champs, Session), vis…taken seit 27.10. abends (Reiter „Fortschritt“);
// ältere Einträge werden beim nächsten Import ergänzt, soweit der Client sie noch liefert (letzte 20)
let games = {};

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
    if (!p || g.gameType !== 'MATCHED_GAME') continue;
    const old = games[g.gameId];
    if (old && old.obj != null) continue;
    games[g.gameId] = entry(g, p);
    added++;
  }
  if (added) fs.writeFileSync(file, JSON.stringify(games));
  return added;
}

// Ein Spiel (Kopf aus dem Verlauf oder den Spieldetails) und dein Teilnehmer daraus → gemerkter Eintrag
function entry(g, p) {
  const s = p.stats || {};
  return {
    champ: p.championId,
    map: g.mapId,
    items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5].filter(Boolean),
    win: !!s.win,
    at: g.gameCreation,
    k: s.kills || 0, d: s.deaths || 0, a: s.assists || 0,
    cs: (s.totalMinionsKilled || 0) + (s.neutralMinionsKilled || 0),
    dur: g.gameDuration || 0,
    queue: g.queueId,
    lane: laneOf(p.timeline || {}),
    vis: s.visionScore || 0,
    dmg: s.totalDamageDealtToChampions || 0,
    gold: s.goldEarned || 0,
    taken: s.totalDamageTaken || 0,
    obj: s.damageDealtToObjectives || 0,
    turrets: s.turretKills || 0,
  };
}

// Alte Einträge (vor dem 27.10. nur Items, ohne K/D/A, CS, Queue) aus den Spieldetails des Clients ergänzen.
// Der Verlauf liefert nur die letzten 20 Spiele, die Details zu einer bekannten Spiel-ID aber auch ältere.
// fetch(gameId) → /lol-match-history/v1/games/{id}; puuid findet dich unter den 10 Teilnehmern
async function backfill(fetch, puuid) {
  let n = 0;
  for (const [id, old] of Object.entries(games)) {
    if (old.cs != null && old.obj != null) continue;
    try {
      const d = await fetch(id);
      const ident = (d.participantIdentities || []).find((x) => x.player && x.player.puuid === puuid);
      const p = ident && (d.participants || []).find((x) => x.participantId === ident.participantId);
      if (!p) continue;
      games[id] = entry(d, p);
      n++;
    } catch {
      // Client kennt das Spiel nicht mehr: Eintrag bleibt, wie er ist
    }
  }
  if (n) fs.writeFileSync(file, JSON.stringify(games));
  return n;
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

// Lane wie in der Champ-Auswahl (assignedPosition): top, jungle, middle, bottom, utility; '' wenn unbekannt
function laneOf(t) {
  if (t.lane === 'TOP') return 'top';
  if (t.lane === 'JUNGLE') return 'jungle';
  if (t.lane === 'MIDDLE' || t.lane === 'MID') return 'middle';
  if (t.lane === 'BOTTOM' || t.lane === 'BOT') return /SUPPORT/.test(t.role || '') ? 'utility' : 'bottom';
  return '';
}

// Spiele auf Summoner's Rift mit Statistik (Dauer ab 5 min, Remakes zählen nicht)
const rift = () => Object.values(games).filter((g) => g.map === 11 && g.cs != null && g.dur >= 300);

// Eigener CS-Schnitt pro Minute auf einem Champ (ab 3 Spielen), sonst null
function csPerMin(champKey) {
  const list = rift().filter((g) => g.champ === champKey);
  if (list.length < 3) return null;
  return list.reduce((sum, g) => sum + g.cs, 0) / list.reduce((sum, g) => sum + g.dur / 60, 0);
}

// Beste eigene Champs für eine Rolle: ab 2 Spielen, nach Siegquote (bei Gleichstand mehr Spiele). Höchstens n
function bestChamps(lane, n = 3) {
  const by = new Map();
  for (const g of rift().filter((x) => x.lane === lane)) {
    const c = by.get(g.champ) || { champ: g.champ, games: 0, wins: 0, k: 0, d: 0, a: 0 };
    c.games++;
    if (g.win) c.wins++;
    c.k += g.k; c.d += g.d; c.a += g.a;
    by.set(g.champ, c);
  }
  return [...by.values()].filter((c) => c.games >= 2)
    .sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games).slice(0, n);
}

// Spiele seit einem Zeitpunkt (ms), älteste zuerst: für die Session (heute)
const since = (at) => Object.values(games).filter((g) => g.at >= at).sort((a, b) => a.at - b.at);

// Alle gemerkten Spiele, älteste zuerst (Reiter „Fortschritt“)
const all = () => Object.entries(games).map(([id, g]) => ({ id, ...g })).sort((a, b) => a.at - b.at);

module.exports = { init, add, backfill, topItems, csPerMin, bestChamps, since, all, entry };
