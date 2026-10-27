// Spielverläufe aus dem League-Client (/lol-match-history/v1/game-timelines/{id} und /games/{id}): Minute für Minute
// CS, Gold und Level aller Spieler und jeder Champion-Kill mit Zeit. Daraus je Spiel kompakt: deine Tode (Sekunden),
// deine Werte bei 10 und 15 Minuten und die deines Lane-Gegners. Gilt rückwirkend für die Spiele, die der Client
// noch liefert; gemerkt in userdata/timelines.json, je Spiel nur einmal abgefragt.
//
// Lane-Gegner: die Lane-Angaben im Client sind oft falsch (zweimal TOP in einem Team, TOP/SUPPORT …). Deshalb zuerst
// der Gegner, den die Live-API im Spiel gemeldet hat (oppChamp aus dem Spielprotokoll); sonst nur, wenn die
// Lane-Angaben eindeutig sind (je Team genau ein Spieler auf deiner Lane). Uneindeutig = kein Lane-Duell, nicht raten
const fs = require('fs');
const path = require('path');

let file = null;
// gameId -> { v: 3, me, team, lane, dur, deaths: [s], deathsAt, kills, teamKills, share, goldDiff, lvl6, oppLvl6, objectives,
// at10, at15, opp10, opp15, oppChamp, enemies: [Champion-Keys] } oder { failed: true }. Ältere Versionen werden neu geladen
let data = {};

function init(dir) {
  file = path.join(dir, 'timelines.json');
  try {
    if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn('Spielverläufe nicht lesbar:', e.message);
  }
}
const save = () => {
  try {
    fs.writeFileSync(file, JSON.stringify(data));
  } catch (e) {
    console.warn('Spielverläufe speichern:', e.message);
  }
};

const laneOf = (t = {}) => {
  if (t.lane === 'TOP') return 'top';
  if (t.lane === 'JUNGLE') return 'jungle';
  if (t.lane === 'MIDDLE' || t.lane === 'MID') return 'middle';
  if (t.lane === 'BOTTOM' || t.lane === 'BOT') return /SUPPORT/.test(t.role || '') ? 'utility' : 'bottom';
  return '';
};

// Stand eines Spielers in einer Minute: CS (Vasallen + Monster), Gold gesamt, Level
const frameAt = (tl, minute, pid) => {
  const f = tl.frames && tl.frames[minute];
  const p = f && f.participantFrames && f.participantFrames[String(pid)];
  return p ? { cs: (p.minionsKilled || 0) + (p.jungleMinionsKilled || 0), gold: p.totalGold || 0, lvl: p.level || 0 } : null;
};

// Aus Details + Timeline das Kompakte für ein Spiel. oppChampKey: Champion-Key des Lane-Gegners laut Live-API
function digest(details, tl, puuid, oppChampKey) {
  const ident = (details.participantIdentities || []).find((x) => x.player && x.player.puuid === puuid);
  if (!ident) return { failed: true };
  const me = (details.participants || []).find((p) => p.participantId === ident.participantId);
  const lane = laneOf(me.timeline);
  let opp = null;
  if (oppChampKey) opp = details.participants.find((p) => p.teamId !== me.teamId && p.championId === Number(oppChampKey));
  if (!opp && lane && lane !== 'jungle') {
    const mine = details.participants.filter((p) => p.teamId === me.teamId && laneOf(p.timeline) === lane);
    const theirs = details.participants.filter((p) => p.teamId !== me.teamId && laneOf(p.timeline) === lane);
    if (mine.length === 1 && theirs.length === 1) [opp] = theirs;
  }
  const pid = me.participantId;
  const events = (tl.frames || []).flatMap((f) => f.events || []);
  const byId = new Map(details.participants.map((p) => [p.participantId, p]));
  const teamOf = (id) => (byId.get(id) || {}).teamId || 0;
  const kills = events.filter((e) => e.type === 'CHAMPION_KILL');
  const myDeaths = kills.filter((e) => e.victimId === pid);
  const deaths = myDeaths.map((e) => Math.round(e.timestamp / 1000));
  // Tode mit Ort (Kartenkoordinaten 0–~15000), Killer-Champion (0 = Turm/Vasallen) und Zahl der beteiligten Gegner
  const deathsAt = myDeaths.map((e) => ({ t: Math.round(e.timestamp / 1000), x: e.position ? e.position.x : null, y: e.position ? e.position.y : null,
    killer: e.killerId > 0 ? (byId.get(e.killerId) || {}).championId || 0 : 0, n: (e.killerId > 0 ? 1 : 0) + (e.assistingParticipantIds || []).length }));
  // eigene Kills: solo = ohne Helfer
  const myKills = kills.filter((e) => e.killerId === pid).map((e) => ({ t: Math.round(e.timestamp / 1000), solo: !(e.assistingParticipantIds || []).length }));
  // Anteile im Team (Schaden an Champions, Gold, Tode) und Kills des Teams für die Kill-Beteiligung
  const team = details.participants.filter((p) => p.teamId === me.teamId);
  const sum = (k) => team.reduce((a, p) => a + ((p.stats || {})[k] || 0), 0);
  const ms = me.stats || {};
  const share = (k) => (sum(k) ? (ms[k] || 0) / sum(k) : null);
  // Gold-Differenz der Teams je Minute (dein Team minus Gegner)
  const goldDiff = (tl.frames || []).map((f) => Object.values(f.participantFrames || {})
    .reduce((a, p) => a + (teamOf(p.participantId) === me.teamId ? 1 : -1) * (p.totalGold || 0), 0));
  // erste Minute mit Level 6 (Ulti), für dich und den Lane-Gegner
  const lvl6 = (id) => {
    const i = (tl.frames || []).findIndex((f) => ((f.participantFrames || {})[String(id)] || {}).level >= 6);
    return i >= 0 ? i : null;
  };
  // Objectives: Drachen, Baron, Herold, Larven, Türme. team = wer es geholt hat (0 = unbekannt), mine = du warst
  // Killer oder Helfer. Türme: das Team, das ihn zerstört hat, ist das Gegenteil des Turm-Teams
  const objectives = events.filter((e) => e.type === 'ELITE_MONSTER_KILL' || (e.type === 'BUILDING_KILL' && e.buildingType === 'TOWER_BUILDING'))
    .map((e) => ({
      t: Math.round(e.timestamp / 1000),
      type: e.type === 'BUILDING_KILL' ? 'TOWER' : e.monsterType,
      team: e.type === 'BUILDING_KILL' ? (e.teamId === 100 ? 200 : e.teamId === 200 ? 100 : 0) : teamOf(e.killerId),
      mine: e.killerId === pid || (e.assistingParticipantIds || []).includes(pid),
    }));
  return {
    v: 3, me: pid, team: me.teamId, lane, dur: details.gameDuration || 0, deaths, deathsAt, kills: myKills,
    teamKills: sum('kills'), share: { dmg: share('totalDamageDealtToChampions'), gold: share('goldEarned'), deaths: share('deaths') },
    goldDiff, lvl6: lvl6(pid), oppLvl6: opp ? lvl6(opp.participantId) : null, objectives,
    at10: frameAt(tl, 10, pid), at15: frameAt(tl, 15, pid),
    opp10: opp ? frameAt(tl, 10, opp.participantId) : null, opp15: opp ? frameAt(tl, 15, opp.participantId) : null,
    oppChamp: opp ? opp.championId : null,
    enemies: details.participants.filter((p) => p.teamId !== me.teamId).map((p) => p.championId),
  };
}

// Fehlende Spiele nachladen (höchstens max je Aufruf, nacheinander, damit der Client nicht ausgebremst wird).
// fetch(path) liefert JSON vom Client; opp(gameId) den Lane-Gegner aus dem Spielprotokoll, falls bekannt
let running = null;
function fill(gameIds, { fetch, puuid, opp = () => null, max = 25 }) {
  if (running) return running;
  running = (async () => {
    let n = 0;
    for (const id of gameIds) {
      // v3 (28.10.): Tode mit Ort/Killer, Kills, Anteile, Gold je Minute, Objectives – ältere Einträge einmal neu
      if ((data[id] && (data[id].failed || data[id].v >= 3)) || n >= max) continue;
      n++;
      try {
        const [details, tl] = await Promise.all([fetch(`/lol-match-history/v1/games/${id}`), fetch(`/lol-match-history/v1/game-timelines/${id}`)]);
        data[id] = digest(details, tl, puuid, opp(id));
      } catch (e) {
        // Client weg oder Spiel zu alt: beim nächsten Mal erneut versuchen, außer der Client kennt es nicht mehr
        if (/404/.test(e.message)) data[id] = { failed: true };
      }
    }
    if (n) save();
    return n;
  })().finally(() => (running = null));
  return running;
}

const get = (id) => (data[id] && !data[id].failed ? data[id] : null);
const all = () => Object.fromEntries(Object.entries(data).filter(([, v]) => !v.failed));

module.exports = { init, fill, get, all, digest };
