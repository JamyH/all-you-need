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
// Data-Dragon-Bild zum Summoner: „GeneratedTip_SummonerSpell_SummonerFlash_DisplayName“ -> SummonerFlash.png.
// Zerschmettern heißt nach dem Aufwerten des Jungle-Items anders (z. B. …SmiteAvatarOffensive), Teleport ab
// Minute 14 „Unbegrenzte Teleportation“ (S12_SummonerTeleportUpgrade); für beide hat Data Dragon kein Bild,
// also das Grundbild (ohne Bild sprang das Summoner-Feld im Panel hin und her).
// Mit der Rune Hexflash meldet die Live-API statt Blitz „SummonerFlashPerksHextechFlashtraptionV2“, auch ohne
// Data-Dragon-Bild (gemeldet 27.10.: kaputtes Symbol im Panel) → Bild der Rune
const HEXFLASH_ICON = 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/Inspiration/HextechFlashtraption/HextechFlashtraption.png';
function spellIcon(spell) {
  const id = ((spell && spell.rawDisplayName) || '').match(/SummonerSpell_(\w+?)_DisplayName/);
  if (!id) return '';
  if (/HextechFlash/i.test(id[1])) return HEXFLASH_ICON;
  return ddragon.iconUrl('spell', /Smite/i.test(id[1]) ? 'SummonerSmite' : /Teleport/i.test(id[1]) ? 'SummonerTeleport' : id[1]);
}

// Hexflash (Rune) ersetzt Blitz und ist blau-lila: sah sonst immer nach Cooldown aus („0“ im Panel)
const BLUE_SPELLS = /Snowball|SummonerBoost|SummonerMana|HextechFlash/;

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
    // ARAM und ARAM Mayhem laufen auf Map 12: kein Recall, eigene lolalytics-Seite
    aram: data.gameData.mapNumber === 12,
    map: data.gameData.mapNumber,
    // zugeteilte Rolle (top, jungle, middle, bottom, utility); leer ohne Rollen (ARAM, Practice Tool)
    position: me.position && me.position !== 'NONE' ? me.position.toLowerCase() : '',
    side: myTeam === 'CHAOS' ? 'red' : 'blue',
    smite: [me.summonerSpells?.summonerSpellOne, me.summonerSpells?.summonerSpellTwo]
      .some((sp) => /SummonerSmite/.test(sp?.rawDisplayName || '')),
    // Summoner mit von Haus aus blauem Symbol (Markieren, Läuterung, Klarheit, Hexflash): strengere Cooldown-Erkennung
    blueSpells: {
      // auch Varianten wie SummonerSnowURFSnowball_Mark (URF/Mayhem)
      d: BLUE_SPELLS.test(me.summonerSpells?.summonerSpellOne?.rawDisplayName || ''),
      f: BLUE_SPELLS.test(me.summonerSpells?.summonerSpellTwo?.rawDisplayName || ''),
    },
    isDead: !!me.isDead,
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
          id: (opponent.rawChampionName || '').replace(/^game_character_displayname_|^Character_|_Name$/g, ''),
          level: opponent.level,
          cs: opponent.scores.creepScore,
          itemValue: itemValue(opponent),
          isDead: opponent.isDead,
        }
      : null,
    teamItemDiff: teamValue(myTeam) - teamValue(enemyTeam),
    championId: (me.rawChampionName || '').replace('game_character_displayname_', ''),
    myItemIds: Array.isArray(me.items) ? me.items.flatMap((it) => Array(it.count || 1).fill(it.itemID)) : [],
    // Inventar nach Slot (0–5, 6 = Trinket); active = Item mit Aktiv-Fähigkeit, kein Verbrauchsgegenstand
    myItems: Array.isArray(me.items)
      ? me.items.map((it) => ({ slot: it.slot, id: it.itemID, name: it.displayName, active: !!it.canUse && !it.consumable }))
      : [],
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
    spellIcons: {
      d: spellIcon(me.summonerSpells?.summonerSpellOne),
      f: spellIcon(me.summonerSpells?.summonerSpellTwo),
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

// Lane-Stand je Lane (eigenes Team gegen Gegner) für die Gank-Priorität des Junglers: Item-Wert-Differenz, Kills,
// Level-Differenz. Alles, was das Tab-Scoreboard ohnehin zeigt; Bot = Bottom + Support. Nur mit Positionen
// (Summoner's Rift mit Rollen, nicht im Practice Tool)
const LANES = [['TOP', 'Top', ['TOP']], ['MIDDLE', 'Mid', ['MIDDLE']], ['BOTTOM', 'Bot', ['BOTTOM', 'UTILITY']]];
function lanes(data) {
  const active = data.activePlayer || {};
  const players = data.allPlayers || [];
  const me = players.find((p) => sameName(p, active));
  if (!me) return null;
  const out = [];
  for (const [, name, positions] of LANES) {
    const side = (mine) => players.filter((p) => (p.team === me.team) === mine && positions.includes(p.position));
    const ally = side(true), enemy = side(false);
    if (!ally.length || !enemy.length) continue;
    const sum = (list, f) => list.reduce((s, p) => s + f(p), 0);
    out.push({
      lane: name,
      gold: sum(ally, itemValue) - sum(enemy, itemValue),
      kills: [sum(ally, (p) => p.scores.kills), sum(enemy, (p) => p.scores.kills)],
      level: Math.round((sum(ally, (p) => p.level) / ally.length - sum(enemy, (p) => p.level) / enemy.length) * 10) / 10,
    });
  }
  return out.length ? out : null;
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
    icon: summary.spellIcons[slot],
    ready: s.ready,
    cd: s.ready || s.cd == null ? null : Math.max(0, Math.ceil(s.cd - (Date.now() - s.at) / 1000)),
  }));
  // Item-Cooldowns (Slot 0–5): Aktiv-Items immer, andere nur, solange ein Cooldown auf dem Slot steht.
  // Tasten wie im Spiel: Slots 1–3 und 5–7 (4 ist das Trinket).
  // Zauberklingen-Items (Glanz, Dreieinigkeit …) laufen nach jedem Treffer 1,5 s ab: das wäre nur Flackern
  summary.itemCds = summary.myItems
    .filter((it) => it.slot < 6)
    .map((it) => {
      const s = (scr.items || {})[it.slot];
      const cd = s && s.id === it.id ? s.cd : null;
      return {
        key: String(it.slot < 3 ? it.slot + 1 : it.slot + 2), name: it.name, icon: ddragon.iconUrl('item', it.id),
        ready: cd == null, cd, active: it.active,
      };
    })
    .filter((it) => it.active || (!it.ready && it.cd >= 5 && !SPELLBLADE.has(it.id % 10000)));
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
    // meist „game_character_displayname_Aatrox“, gesehen 27.10. auch „Character_Aatrox_Name“ (sonst kein Bild)
    const id = (p.rawChampionName || '').replace(/^game_character_displayname_|^Character_|_Name$/g, '');
    const s = p.scores || {};
    return {
      championId: id,
      champion: p.championName,
      name: p.riotIdGameName || (p.riotId || p.summonerName || '').split('#')[0],
      riotId: p.riotId || '', // Name#Tag für die Spielersuche
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
// buildFor(championId) liefert die Item-Liste (eigener Build oder lolalytics-Vorschlag) oder nichts.
// Zauberklingen-Items: Glanz, Stärke der Dreieinigkeit, Lichbane, Eisgeborener Handschuh, Essenzräuber
const SPELLBLADE = new Set([3057, 3078, 3100, 6662, 3508]);

function applyBuild(summary, buildFor) {
  if (!summary) return summary;
  const build = buildFor(summary.championId);
  if (!build || !build.length) return summary;
  const owned = new Map();
  for (const id of summary.myItemIds) owned.set(String(id), (owned.get(String(id)) || 0) + 1);
  // Andere fertige Stiefel als im Build zählen trotzdem als Stiefel (Merkurs statt Stahlkappen):
  // man kauft kein zweites Paar
  let otherBoots = summary.myItemIds.some((id) => ddragon.finishedBoots(id) && !build.includes(id));

  for (const target of build) {
    if ((owned.get(String(target)) || 0) > 0) {
      owned.set(String(target), owned.get(String(target)) - 1); // schon gekauft -> nächstes
      continue;
    }
    if (otherBoots && ddragon.finishedBoots(target)) {
      otherBoots = false;
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

// Nächster Skillpunkt nach der Lolalytics-Reihenfolge, solange ein Punkt offen ist.
// Die Reihenfolge wird bis zum aktuellen Level abgelaufen: die erste Fähigkeit, die dort öfter vorkommt,
// als du sie gelevelt hast, ist dran. So passt der Hinweis auch, wenn du vorher abgewichen bist.
const KEYS = ['Q', 'W', 'E', 'R'];
function applySkills(summary, skillsFor) {
  if (!summary) return summary;
  const s = skillsFor(summary.championId);
  if (!s || !s.skillOrder) return summary;
  const have = Object.fromEntries(KEYS.map((k, i) => [k, summary.abilityLevels[i]]));
  const spent = summary.abilityLevels.reduce((a, b) => a + b, 0);
  const want = { Q: 0, W: 0, E: 0, R: 0 };
  let next = null;
  if (spent < summary.level) {
    const order = s.skillOrder.slice(0, summary.level);
    // ist die Ulti laut Reihenfolge schon dran, kommt sie zuerst (bei mehreren offenen Punkten)
    if (order.filter((k) => k === 'R').length > have.R) next = 'R';
    for (const k of next ? [] : order) {
      if (++want[k] > have[k]) {
        next = k;
        break;
      }
    }
  }
  summary.skill = { next, open: Math.max(0, summary.level - spent), priority: s.skillPriority };
  return summary;
}

module.exports = { fetchGame, summarize, applyScreen, applyMana, applyBuild, applySkills, scoreboard, livePlayers, lanes };
