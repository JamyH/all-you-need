// Live Client Data API (läuft nur während eines Spiels auf Port 2999).
// Liefert nur, was du als Spieler ohnehin sehen kannst.
const { getJson } = require('./http');
const ddragon = require('./ddragon');

const URL = 'https://127.0.0.1:2999/liveclientdata/allgamedata';

async function fetchGame() {
  try {
    return await getJson(URL, {}, 800);
  } catch {
    return null; // kein Spiel aktiv
  }
}

const sameName = (p, active) =>
  (active.riotId && p.riotId === active.riotId) ||
  (active.summonerName && p.summonerName === active.summonerName);

function itemValue(p) {
  // Practice-Tool-Dummys liefern statt einer Liste { error: "Unable to find player" }
  if (!Array.isArray(p.items)) return 0;
  return p.items.reduce((sum, it) => sum + ddragon.itemGold(it.itemID, it.price) * (it.count || 1), 0);
}

// Kurznamen fürs Panel; erkannt am internen Namen (rawDisplayName), Rest bleibt der deutsche Name
const SHORT_SPELLS = { Teleport: 'Teleport', Smite: 'Zerschmettern', Haste: 'Geist', Boost: 'Läuterung', Barrier: 'Barriere' };
function spellName(spell) {
  if (!spell) return null;
  const raw = spell.rawDisplayName || '';
  const hit = Object.keys(SHORT_SPELLS).find((k) => raw.includes(`Summoner${k}`));
  return hit ? SHORT_SPELLS[hit] : spell.displayName;
}

// Rohdaten -> das, was das Overlay anzeigt. Hier kannst du eigene Werte ergänzen.
function summarize(data) {
  const active = data.activePlayer || {};
  const players = data.allPlayers || [];
  const me = players.find((p) => sameName(p, active)) || players[0];
  if (!me) return null;

  const minutes = Math.max(data.gameData.gameTime / 60, 1 / 60);
  const myTeam = me.team;
  const opponent = me.position && me.position !== 'NONE'
    ? players.find((p) => p.team !== myTeam && p.position === me.position)
    : null;

  const teamValue = (team) => players.filter((p) => p.team === team).reduce((s, p) => s + itemValue(p), 0);
  const enemyTeam = myTeam === 'ORDER' ? 'CHAOS' : 'ORDER';
  const s = me.scores;

  return {
    gameTime: data.gameData.gameTime,
    gameMode: data.gameData.gameMode,
    champion: me.championName,
    level: me.level,
    gold: Math.floor(active.currentGold || 0),
    kda: `${s.kills}/${s.deaths}/${s.assists}`,
    kdaRatio: ((s.kills + s.assists) / Math.max(s.deaths, 1)).toFixed(2),
    cs: s.creepScore,
    csPerMin: (s.creepScore / minutes).toFixed(1),
    wardScore: Math.round(s.wardScore),
    myItemValue: itemValue(me),
    laneOpponent: opponent
      ? {
          champion: opponent.championName,
          level: opponent.level,
          cs: opponent.scores.creepScore,
          itemValue: itemValue(opponent),
          isDead: opponent.isDead,
        }
      : null,
    teamItemDiff: teamValue(myTeam) - teamValue(enemyTeam),
    championId: (me.rawChampionName || '').replace('game_character_displayname_', ''),
    myItemIds: Array.isArray(me.items) ? me.items.flatMap((it) => Array(it.count || 1).fill(it.itemID)) : [],
    abilityLevels: ['Q', 'W', 'E', 'R'].map((k) => active.abilities?.[k]?.abilityLevel || 0),
    resource: {
      type: active.championStats?.resourceType,
      value: Math.floor(active.championStats?.resourceValue || 0),
      max: Math.floor(active.championStats?.resourceMax || 0),
    },
    spellNames: {
      d: spellName(me.summonerSpells?.summonerSpellOne) || 'D',
      f: spellName(me.summonerSpells?.summonerSpellTwo) || 'F',
    },
  };
}

// Tab-Scoreboard: Zeile i links = i-ter Spieler von ORDER, rechts = i-ter von CHAOS (Reihenfolge wie im Spiel).
// Verglichen wird immer Zeile gegen Zeile: in Normal/Ranked sortiert das Scoreboard nach Rolle,
// und in Bot-/Custom-Spielen sind Riots Positionsangaben unbrauchbar (z. B. MID gegenüber BOT).
// Diff aus Sicht deines Teams: positiv = dein Spieler hat mehr Item-Wert.
function scoreboard(data) {
  const active = data.activePlayer || {};
  const players = data.allPlayers || [];
  const me = players.find((p) => sameName(p, active)) || players[0];
  if (!me) return null;
  const order = players.filter((p) => p.team === 'ORDER');
  const chaos = players.filter((p) => p.team === 'CHAOS');
  const mine = me.team === 'ORDER' ? order : chaos;
  const theirs = me.team === 'ORDER' ? chaos : order;
  const rows = mine.map((p, i) => {
    const opp = theirs[i];
    return {
      champion: p.championName,
      opponent: opp ? opp.championName : null,
      diff: opp ? itemValue(p) - itemValue(opp) : null,
      isMe: p === me,
    };
  });
  const sum = (list) => list.reduce((s, p) => s + itemValue(p), 0);
  return { myTeamLeft: me.team === 'ORDER', rows, teamDiff: sum(mine) - sum(theirs) };
}

// XP von Level n auf n+1 (280, 380, 480 … bis 18)
const xpForNext = (level) => (level >= 18 ? 0 : 180 + 100 * level);

// Bildschirmwerte (OCR) einmischen. OCR-CS gilt nur, wenn sie zur 10er-Stufe der API passt.
function applyScreen(summary, scr, minionXp) {
  if (!summary || !scr) return summary;
  if (scr.cs != null && scr.cs >= summary.cs && scr.cs < summary.cs + 10) {
    summary.cs = scr.cs;
    summary.csPerMin = (scr.cs / Math.max(summary.gameTime / 60, 1 / 60)).toFixed(1);
    summary.csExact = true;
  }
  // Restzeit seit der letzten Ablesung selbst runterzählen
  summary.spells = Object.entries(scr.spells || {}).map(([slot, s]) => ({
    key: slot.toUpperCase(),
    name: summary.spellNames[slot],
    ready: s.ready,
    cd: s.ready || s.cd == null ? null : Math.max(0, Math.ceil(s.cd - (Date.now() - s.at) / 1000)),
  }));
  const need = xpForNext(summary.level);
  if (scr.xp != null && need) {
    const missing = Math.round(need * (1 - scr.xp));
    const wave = 3 * minionXp.melee + 3 * minionXp.caster;
    summary.xp = {
      percent: Math.round(scr.xp * 100),
      missing,
      melee: Math.ceil(missing / minionXp.melee),
      caster: Math.ceil(missing / minionXp.caster),
      waves: (missing / wave).toFixed(1),
    };
  }
  return summary;
}

// Mana-Warnung: reicht das Mana noch für Q+W+E(+R) auf den aktuellen Rängen?
// Nur für Mana-Champions; bei Energie, Wut usw. bleibt summary.mana leer.
function applyMana(summary, cfg = {}) {
  if (!summary || summary.resource.type !== 'MANA' || !summary.resource.max) return summary;
  const spells = ddragon.championSpells(summary.championId);
  let combo = null;
  if (spells) {
    combo = summary.abilityLevels.reduce((sum, rank, i) => {
      if (!rank || (i === 3 && cfg.includeUlt === false)) return sum;
      const cost = spells.costs[i];
      return sum + (cost ? cost[Math.min(rank, cost.length) - 1] || 0 : 0);
    }, 0);
  }
  const { value, max } = summary.resource;
  summary.mana = {
    value,
    max,
    percent: Math.round((value / max) * 100),
    combo,
    low: combo != null && combo > 0 && value < combo,
  };
  return summary;
}

// Alle 10 Spieler für den Live-Spiel-Tab. ranks: Map Champion-ID (Data Dragon) -> Rang oder null
function livePlayers(data, ranks = new Map()) {
  const active = data.activePlayer || {};
  const players = data.allPlayers || [];
  const row = (p) => {
    const id = (p.rawChampionName || '').replace('game_character_displayname_', '');
    const s = p.scores || {};
    return {
      championId: id,
      champion: p.championName,
      name: p.riotIdGameName || (p.riotId || p.summonerName || '').split('#')[0],
      isBot: !!p.isBot,
      isMe: sameName(p, active),
      level: p.level,
      kda: `${s.kills || 0}/${s.deaths || 0}/${s.assists || 0}`,
      cs: s.creepScore || 0,
      vision: Math.round(s.wardScore || 0),
      items: Array.isArray(p.items) ? p.items.map((it) => it.itemID) : [],
      itemValue: itemValue(p),
      isDead: !!p.isDead,
      respawn: p.isDead ? Math.ceil(p.respawnTimer || 0) : 0,
      rank: ranks.get(id) || null,
    };
  };
  const team = (t) => players.filter((p) => p.team === t).map(row);
  const me = players.find((p) => sameName(p, active));
  const order = team('ORDER'), chaos = team('CHAOS');
  return {
    gameTime: data.gameData.gameTime,
    gameMode: data.gameData.gameMode,
    myTeam: me ? me.team : 'ORDER',
    teams: [
      { id: 'ORDER', players: order, value: order.reduce((s, p) => s + p.itemValue, 0) },
      { id: 'CHAOS', players: chaos, value: chaos.reduce((s, p) => s + p.itemValue, 0) },
    ],
  };
}

// Spar-Ziel: erstes Item der Build-Liste, das noch nicht im Inventar ist, und was es noch kostet.
// Reicht das aktuelle Gold, setzt affordable -> Panel zeigt RECALL.
function applyBuild(summary, builds = {}) {
  if (!summary) return summary;
  const build = builds[summary.championId];
  if (!build || !build.length) return summary;
  const owned = new Map();
  for (const id of summary.myItemIds) owned.set(String(id), (owned.get(String(id)) || 0) + 1);

  for (const target of build) {
    if ((owned.get(String(target)) || 0) > 0) {
      owned.set(String(target), owned.get(String(target)) - 1); // schon gekauft -> nächstes
      continue;
    }
    const total = ddragon.itemGold(target);
    const missing = ddragon.remainingCost(target, new Map(owned));
    summary.build = {
      itemId: target,
      name: ddragon.itemName(target),
      icon: ddragon.iconUrl('item', target),
      missing: Math.max(0, missing - summary.gold),
      progress: total ? Math.min(100, Math.round(((total - missing + Math.min(summary.gold, missing)) / total) * 100)) : 0,
      affordable: summary.gold >= missing,
    };
    return summary;
  }
  summary.build = { done: true };
  return summary;
}

module.exports = { fetchGame, summarize, applyScreen, applyMana, applyBuild, scoreboard, livePlayers };
