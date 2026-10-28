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
  return p ? { cs: (p.minionsKilled || 0) + (p.jungleMinionsKilled || 0), gold: p.totalGold || 0, lvl: p.level || 0, xp: p.xp || 0 } : null;
};

// Aus Details + Timeline das Kompakte für ein Spiel. oppChampKey: Champion-Key des Lane-Gegners laut Live-API
function digest(details, tl, puuid, oppChampKey, roles = null) {
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
  const jungle = jungleDigest(details, tl, me, events, byId, roles);
  return {
    v: 5, me: pid, team: me.teamId, lane, dur: details.gameDuration || 0, deaths, deathsAt, kills: myKills, jungle,
    teamKills: sum('kills'), share: { dmg: share('totalDamageDealtToChampions'), gold: share('goldEarned'), deaths: share('deaths') },
    goldDiff, lvl6: lvl6(pid), oppLvl6: opp ? lvl6(opp.participantId) : null, objectives,
    at10: frameAt(tl, 10, pid), at15: frameAt(tl, 15, pid),
    opp10: opp ? frameAt(tl, 10, opp.participantId) : null, opp15: opp ? frameAt(tl, 15, opp.participantId) : null,
    oppChamp: opp ? opp.championId : null,
    enemies: details.participants.filter((p) => p.teamId !== me.teamId).map((p) => p.championId),
  };
}

// Jungle-Auswertung (nur wenn du Smite hattest; der gegnerische Jungler ist der Gegner mit Smite – anders als die
// Lane-Angaben im Client eindeutig). Alles nach dem Spiel aus dem Spielverlauf, wie ein Replay-Review.
// roles (optional, ab 28.10. aus der Live-API gemerkt): Champion-Key → top/jungle/middle/bottom/utility aller 10
const SMITE = 11;
// gegnerischer Dschungel (gleiche Grobzonen wie im Stats-Fenster): nicht Basis, Lane oder Fluss, auf der Gegnerseite
const inEnemyJungle = (pos, team) => {
  if (!pos) return false;
  const { x, y } = pos;
  if ((x < 3200 && y < 3200) || (x > 11600 && y > 11600) || x < 1900 || y > 12900 || y < 1900 || x > 12900) return false;
  if (Math.abs(x - y) < 1300 || Math.abs(x + y - 14800) < 1500) return false;
  return (team === 100) !== (x + y < 14800);
};
const hasSmite = (p) => p && (p.spell1Id === SMITE || p.spell2Id === SMITE);
const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null);
function jungleDigest(details, tl, me, events, byId, roles) {
  if (!hasSmite(me)) return null;
  const pid = me.participantId;
  const ej = details.participants.find((p) => p.teamId !== me.teamId && hasSmite(p)) || null;
  const frames = tl.frames || [];
  const posAt = (m, id) => {
    const f = frames[Math.min(m, frames.length - 1)];
    const p = f && f.participantFrames && f.participantFrames[String(id)];
    return p && p.position ? { x: p.position.x, y: p.position.y } : null;
  };
  const at = (m, id) => frameAt(tl, m, id);
  // Pfad: deine Position je Minute bis Minute 14
  const path = [];
  for (let m = 1; m <= 14 && m < frames.length; m++) path.push(posAt(m, pid));
  // CS je Minute (für tote Zeit)
  const csAt = (m) => (at(m, pid) || {}).cs;
  const kills = events.filter((e) => e.type === 'CHAMPION_KILL');
  // deine Beteiligungen (Kill oder Assist) und Tode mit Ort, bis Minute 14 (Gank-Phase)
  const involved = kills.filter((e) => e.killerId === pid || (e.assistingParticipantIds || []).includes(pid))
    .map((e) => ({ t: Math.round(e.timestamp / 1000), x: e.position && e.position.x, y: e.position && e.position.y, kill: e.killerId === pid }));
  const died = kills.filter((e) => e.victimId === pid)
    .map((e) => ({ t: Math.round(e.timestamp / 1000), x: e.position && e.position.x, y: e.position && e.position.y, n: (e.killerId > 0 ? 1 : 0) + (e.assistingParticipantIds || []).length }));
  // Lane-Stand im Moment einer Aktion (nur mit gemerkten Rollen): Gold deiner Lane minus Gegner-Lane (Bot mit Support)
  const roleOf = (p) => (roles ? roles[String(p.championId)] : null);
  const laneGold = (zone, m) => {
    if (!roles) return null;
    const want = zone === 'top' ? ['top'] : zone === 'mid' ? ['middle'] : zone === 'bot' ? ['bottom', 'utility'] : null;
    if (!want) return null;
    const side = (mine) => details.participants.filter((p) => (p.teamId === me.teamId) === mine && want.includes(roleOf(p)));
    const a = side(true), b = side(false);
    if (!a.length || a.length !== b.length) return null;
    const g = (list) => list.reduce((x, p) => x + ((at(m, p.participantId) || {}).gold || 0), 0);
    return g(a) - g(b);
  };
  // Objectives (Monster) mit deiner Lage: Abstand, kurz vorher gestorben, Trade (dein Team holt binnen 60 s etwas anderes),
  // gegnerischer Jungler in der Nähe (umkämpft)
  const elites = events.filter((e) => e.type === 'ELITE_MONSTER_KILL' || (e.type === 'BUILDING_KILL' && e.buildingType === 'TOWER_BUILDING'));
  const teamOfE = (e) => (e.type === 'BUILDING_KILL' ? (e.teamId === 100 ? 200 : e.teamId === 200 ? 100 : 0) : (byId.get(e.killerId) || {}).teamId || 0);
  const objs = elites.filter((e) => e.type === 'ELITE_MONSTER_KILL').map((e) => {
    const t = Math.round(e.timestamp / 1000), m = Math.floor(t / 60), pos = e.position ? { x: e.position.x, y: e.position.y } : null;
    const team = teamOfE(e);
    return {
      t, type: e.monsterType, team,
      mine: e.killerId === pid || (e.assistingParticipantIds || []).includes(pid),
      dist: Math.round(dist(posAt(m, pid), pos) || 0) || null,
      dead: died.some((d) => d.t <= t && t - d.t <= 45),
      trade: team && team !== me.teamId ? elites.some((o) => o !== e && teamOfE(o) === me.teamId && Math.abs(o.timestamp - e.timestamp) <= 60000) : false,
      ejNear: ej ? (dist(posAt(m, ej.participantId), pos) || 1e9) < 3000 : false,
      meNear: (dist(posAt(m, pid), pos) || 1e9) < 3000,
    };
  });
  // tote Zeit: Minuten 2–14 ohne neue CS, ohne Beteiligung, ohne eigenes Objective, ohne Tod in der Minute davor
  let idle = 0, counted = 0;
  for (let m = 2; m <= 14 && m < frames.length; m++) {
    const lo = (m - 1) * 60, hi = m * 60;
    if (died.some((d) => d.t >= lo - 60 && d.t < hi)) continue;
    counted++;
    const gotCs = (csAt(m) || 0) > (csAt(m - 1) || 0);
    const acted = involved.some((x) => x.t >= lo && x.t < hi) || objs.some((o) => o.mine && o.t >= lo && o.t < hi);
    if (!gotCs && !acted) idle++;
  }
  const st = (p) => p.stats || {};
  const invaded = (id, team) => {
    let n = 0;
    for (let m = 1; m < frames.length && m <= 20; m++) {
      const a = (frames[m - 1].participantFrames || {})[String(id)], b = (frames[m].participantFrames || {})[String(id)];
      if (!a || !b) continue;
      const got = (b.jungleMinionsKilled || 0) - (a.jungleMinionsKilled || 0);
      if (got > 0 && (inEnemyJungle(b.position, team) || inEnemyJungle(a.position, team))) n += got;
    }
    return n;
  };
  const early = (id) => kills.filter((e) => e.timestamp < 900000 && (e.killerId === id || (e.assistingParticipantIds || []).includes(id))).length;
  const teamEarly = (team) => kills.filter((e) => e.timestamp < 900000 && (byId.get(e.killerId) || {}).teamId === team).length;
  return {
    ejChamp: ej ? ej.championId : null,
    me5: at(5, pid), me10: at(10, pid), me15: at(15, pid),
    ej5: ej ? at(5, ej.participantId) : null, ej10: ej ? at(10, ej.participantId) : null, ej15: ej ? at(15, ej.participantId) : null,
    // Konter-Jungling, geschätzt: Monster-CS, die in einer Minute dazukommen, während man im gegnerischen Dschungel steht
    // (das Statistikfeld neutralMinionsKilledEnemyJungle ist im Client seit einiger Zeit immer 0, geprüft 28.10.)
    invade: invaded(pid, me.teamId), ejInvade: ej ? invaded(ej.participantId, ej.teamId) : null,
    path, involved: involved.filter((x) => x.t < 840), died: died.filter((x) => x.t < 840),
    objs, idle, idleOf: counted,
    fb: !!(st(me).firstBloodKill || st(me).firstBloodAssist),
    kp15: early(pid), ejKp15: ej ? early(ej.participantId) : null, teamKills15: teamEarly(me.teamId),
    roles: !!roles,
    // Beteiligungen (ok) und Tode (nicht ok) bis Minute 14, mit Lane-Gold aller drei Lanes in dieser Minute (nur mit
    // Rollen): daraus „gewinnende oder verlierende Lane gegankt“
    ganks: involved.map((x) => ({ ...x, ok: true })).concat(died.map((x) => ({ ...x, ok: false }))).filter((g) => g.t < 840)
      .map((g) => ({ ...g, lanes: roles ? { top: laneGold('top', Math.floor(g.t / 60)), mid: laneGold('mid', Math.floor(g.t / 60)), bot: laneGold('bot', Math.floor(g.t / 60)) } : null })),
  };
}

// Fehlende Spiele nachladen (höchstens max je Aufruf, nacheinander, damit der Client nicht ausgebremst wird).
// fetch(path) liefert JSON vom Client; opp(gameId) den Lane-Gegner aus dem Spielprotokoll, falls bekannt
let running = null;
function fill(gameIds, { fetch, puuid, opp = () => null, roles = () => null, max = 25 }) {
  if (running) return running;
  running = (async () => {
    let n = 0;
    for (const id of gameIds) {
      // v5 (28.10.): Jungle-Auswertung, Konter-Jungling geschätzt – ältere Einträge einmal neu
      if ((data[id] && (data[id].failed || data[id].v >= 5)) || n >= max) continue;
      n++;
      try {
        const [details, tl] = await Promise.all([fetch(`/lol-match-history/v1/games/${id}`), fetch(`/lol-match-history/v1/game-timelines/${id}`)]);
        data[id] = digest(details, tl, puuid, opp(id), roles(id));
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
