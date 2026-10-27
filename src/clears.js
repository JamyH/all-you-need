// Erste Runde im Jungle (Clear-Zeit) messen und je Champion merken (userdata/clears.json).
// Die Live-API meldet keine Camp-Kills; deshalb aus den eigenen CS geschätzt: Ab 1:30 steigen sie Camp für Camp.
// Steht der Zähler danach 20 s still, war das Ende der Runde der letzte Anstieg (Recall, Gank oder Krabbe).
const fs = require('fs');
const path = require('path');

const STALL_S = 20; // so lange ohne neue CS = Runde vorbei
const MIN_CS = 12; // weniger ist keine Runde (z. B. nur ein Buff und dann Gank)
const UNTIL_S = 330; // später ist es keine erste Runde mehr

let file = null;
let saved = {}; // championId -> [{ time, cs, at }], neueste zuerst, höchstens 20
let run = null; // laufendes Spiel: { champ, lastCs, changedAt, done }

function init(dir) {
  file = path.join(dir, 'clears.json');
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    saved = {};
  }
}

// Jede Sekunde mit Spielzeit und CS aufrufen (nur mit Smite auf Summoner's Rift). Gibt die gerade fertig
// gemessene Runde zurück ({ time, cs }) oder null
function track(champ, gameTime, cs) {
  if (!run || run.champ !== champ || gameTime < run.seen) run = { champ, lastCs: 0, changedAt: 0, done: false, seen: 0 };
  run.seen = gameTime;
  if (run.done || gameTime < 90 || cs == null) return null;
  if (cs > run.lastCs) {
    run.lastCs = cs;
    run.changedAt = gameTime;
    return null;
  }
  // vor dem ersten Camp ist Stillstand normal (Camps erscheinen um 1:30, der Weg dahin dauert)
  if (!run.lastCs || gameTime - run.changedAt < STALL_S) return null;
  run.done = true;
  if (run.lastCs < MIN_CS || run.changedAt > UNTIL_S) return null;
  const entry = { time: Math.round(run.changedAt), cs: run.lastCs, at: Date.now() };
  saved[champ] = [entry, ...(saved[champ] || [])].slice(0, 20);
  if (file) fs.writeFile(file, JSON.stringify(saved), () => {});
  return entry;
}

// Bisherige Runden eines Champs: { last, best, avg, count } oder null
function stats(champ) {
  const list = saved[champ] || [];
  if (!list.length) return null;
  const times = list.map((e) => e.time);
  return { last: times[0], best: Math.min(...times), avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length), count: list.length };
}

module.exports = { init, track, stats };
