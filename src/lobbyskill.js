// Skill-Einschätzung fürs Spielerprofil: in jedem seiner Spiele wird der Spieler mit den anderen echten Spielern
// derselben Lobby verglichen (0 = schlechter als alle, 100 = besser als alle, 50 = Lobby-Schnitt) und das über die
// Spiele gemittelt. Elo, Modus und Spieldauer sind so automatisch gleich. Ein Vergleich nur mit sich selbst (wie im
// Fortschritt) sagte über einen fremden Spieler nichts. Werte und Schlüssel wie SKILLS in renderer/stats.js
const METRICS = [
  { key: 'farm', maps: [11], val: (s, mins) => (s.totalMinionsKilled + s.neutralMinionsKilled) / mins },
  { key: 'fight', val: (s) => (s.kills + s.assists) / Math.max(s.deaths, 1) },
  { key: 'aggr', val: (s, mins) => ((s.kills + s.assists) / mins) * 10 },
  { key: 'team', val: (s, mins, teamKills) => (teamKills ? (s.kills + s.assists) / teamKills : 0) * 100 },
  { key: 'survive', lower: true, val: (s, mins) => (s.deaths / mins) * 10 },
  { key: 'vision', maps: [11], val: (s, mins) => (s.visionScore || 0) / mins },
  { key: 'damage', val: (s, mins) => (s.totalDamageDealtToChampions || 0) / mins },
  { key: 'obj', maps: [11], val: (s, mins) => (s.damageDealtToObjectives || 0) / mins },
];
const MIN_GAMES = 3; // je Wert, darunter keine Aussage
const isBot = (puuid) => !puuid || /^0{8}-/.test(puuid);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// details: Spieldetails des Clients (/lol-match-history/v1/games/{id}); nur Kluft und ARAM, Spiele mit Bots zählen nicht
function rate(details, puuid) {
  const count = (m) => details.filter((g) => g.mapId === m).length;
  const map = count(12) > count(11) ? 12 : 11; // Kluft und ARAM nicht mischen
  const acc = {};
  let games = 0;
  for (const g of details) {
    if (g.mapId !== map) continue;
    const who = new Map((g.participantIdentities || []).map((x) => [x.participantId, (x.player && x.player.puuid) || '']));
    const real = g.participants.filter((p) => !isBot(who.get(p.participantId)));
    const me = real.find((p) => who.get(p.participantId) === puuid);
    if (!me || real.length < g.participants.length) continue;
    games++;
    const mins = Math.max(g.gameDuration / 60, 1);
    const teamKills = {};
    for (const p of g.participants) teamKills[p.teamId] = (teamKills[p.teamId] || 0) + (p.stats.kills || 0);
    const value = (m, p) => m.val(p.stats, mins, teamKills[p.teamId]);
    for (const m of METRICS) {
      if (m.maps && !m.maps.includes(g.mapId)) continue;
      const mine = value(m, me);
      const others = real.filter((p) => p !== me).map((p) => value(m, p));
      // Gleichstand zählt halb
      const beat = others.reduce((n, x) => n + (mine === x ? 0.5 : (m.lower ? mine < x : mine > x) ? 1 : 0), 0);
      const a = (acc[m.key] = acc[m.key] || { scores: [], values: [] });
      a.scores.push((beat / others.length) * 100);
      a.values.push(mine);
    }
  }
  const metrics = {};
  for (const [key, a] of Object.entries(acc)) {
    if (a.scores.length >= MIN_GAMES) metrics[key] = { score: Math.round(mean(a.scores)), value: mean(a.values), games: a.scores.length };
  }
  return { map, games, metrics };
}

module.exports = { rate };
