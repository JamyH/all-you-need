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
// gameId -> { me, deaths: [s], dur, at10, at15, opp10, opp15, oppChamp, lane, enemies: [Champion-Keys] } oder { failed: true }.
// Einträge ohne enemies (vor dem 27.10. spät) werden einmal neu geladen
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
  const deaths = (tl.frames || []).flatMap((f) => f.events || [])
    .filter((e) => e.type === 'CHAMPION_KILL' && e.victimId === me.participantId)
    .map((e) => Math.round(e.timestamp / 1000));
  return {
    me: me.participantId, lane, dur: details.gameDuration || 0, deaths,
    at10: frameAt(tl, 10, me.participantId), at15: frameAt(tl, 15, me.participantId),
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
      if ((data[id] && (data[id].failed || data[id].enemies)) || n >= max) continue;
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
