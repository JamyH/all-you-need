// Farmys eigenes Spielprotokoll: was nur während des Spiels zu sehen ist und im Client-Verlauf fehlt
// (CS je Minute, CS bei 10 min gegen Perfekt-CS, Tode mit Schadensart aus dem Death Recap, Ulti ungenutzt).
// Am Spielende in userdata/gamelog.json; die Spiel-ID aus dem Client verknüpft es mit der Historie (src/history.js).
// Dazu der LP-Verlauf (userdata/lp.json): ein Eintrag je Änderung, für die Kurve im Reiter „Fortschritt“
const fs = require('fs');
const path = require('path');

const KEEP = 300; // ältere Spiele fallen raus (Datei bleibt klein)
let file = null;
let lpFile = null;
let games = []; // älteste zuerst
let lp = []; // { at, solo, flex } als Rang-Zahl (lpScore in main.js)
let cur = null;

const load = (f, fallback) => {
  try {
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback;
  } catch (e) {
    console.warn('Spielprotokoll nicht lesbar:', e.message);
    return fallback;
  }
};

function init(dir) {
  file = path.join(dir, 'gamelog.json');
  lpFile = path.join(dir, 'lp.json');
  games = load(file, []);
  lp = load(lpFile, []);
}

// Spielstart. at = Startzeit des Spiels (ms), champ = Champion-Key (Zahl wie in der Historie)
function start({ champ, map, mode, at }) {
  cur = { gameId: null, champ, map, mode, at, minutes: [], cs10: null, perfect10: null, deaths: [], died: [], ult: null, oppChamp: null, position: '', roles: null };
}
// Spiel-ID kommt aus dem Client etwas später als der Spielstart
function setGameId(id) {
  if (cur && id) cur.gameId = id;
}

// Jede Sekunde aus pollGame: ein Stand je volle Minute, CS bei 10:00 einmal festhalten
function tick(s, perfect10) {
  if (!cur) return;
  const m = Math.floor(s.gameTime / 60);
  const last = cur.minutes[cur.minutes.length - 1];
  if (m >= 1 && (!last || m > last.m)) {
    const [k, d, a] = String(s.kda).split('/').map(Number);
    cur.minutes.push({ m, cs: s.cs, lvl: s.level, k, d, a });
  }
  if (cur.cs10 == null && s.gameTime >= 600) {
    cur.cs10 = s.cs;
    cur.perfect10 = perfect10;
  }
}

function death(d) {
  if (cur) cur.deaths.push(d);
}
// Zeitpunkt (s) und Gold in der Tasche beim Tod, aus der Live-API (die Timeline kennt Gold nur je Minute)
function died(t, gold) {
  if (cur) cur.died.push({ t: Math.round(t), gold: Math.round(gold) });
}
// zugeteilte Rolle laut Live-API (zuverlässiger als die Lane-Angabe im Client-Verlauf)
function role(pos) {
  if (cur && pos && !cur.position) cur.position = pos;
}
// Rollen aller 10 Spieler laut Live-API (Champion-Key → top/jungle/middle/bottom/utility), einmal je Spiel. Damit
// lässt sich im Spielverlauf genau sagen, welche Lane du gegankt hast und wie sie stand (Client-Lanes sind unzuverlässig)
function roles(map) {
  if (cur && map && !cur.roles && Object.keys(map).length >= 8) cur.roles = map;
}
// Lane-Gegner laut Live-API (Champion-Key), einmal je Spiel
function opponent(key) {
  if (cur && key && !cur.oppChamp) cur.oppChamp = Number(key);
}

// Spielende: speichern (nur mit Spiel-ID, sonst lässt es sich keinem Spiel zuordnen, z. B. Practice Tool)
function finish(extra = {}) {
  const g = cur;
  cur = null;
  if (!g || !g.gameId) return;
  Object.assign(g, extra);
  games = games.filter((x) => x.gameId !== g.gameId).concat(g).slice(-KEEP);
  try {
    fs.writeFileSync(file, JSON.stringify(games));
  } catch (e) {
    console.warn('Spielprotokoll speichern:', e.message);
  }
}

const get = (gameId) => games.find((g) => String(g.gameId) === String(gameId)) || null;
const all = () => games;

// LP-Stand merken, wenn er sich geändert hat
function trackLp(now) {
  const last = lp[lp.length - 1];
  if (now.solo == null && now.flex == null) return;
  if (last && last.solo === now.solo && last.flex === now.flex) return;
  lp.push({ at: Date.now(), solo: now.solo, flex: now.flex });
  try {
    fs.writeFileSync(lpFile, JSON.stringify(lp.slice(-1000)));
  } catch (e) {
    console.warn('LP-Verlauf speichern:', e.message);
  }
}
const lpHistory = () => lp;

module.exports = { init, start, setGameId, tick, death, died, opponent, role, roles, finish, get, all, trackLp, lpHistory };
