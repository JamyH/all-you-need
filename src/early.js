// Level 1–3: wer gewinnt einen reinen Schlagabtausch mit normalen Angriffen, nur aus den Grundwerten von
// Data Dragon (Leben, Angriffsschaden, Rüstung, Angriffstempo, Reichweite, Lauftempo). Fähigkeiten, Passive,
// Runen und Start-Items fehlen bewusst: sie lassen sich ohne Spieldaten nicht verlässlich rechnen. Das Ergebnis
// ist daher nur ein Anhaltspunkt und steht im Fenster neben dem First-Blood-Anteil aus echten Spielen.
// Hinweis: Data Dragon liefert derzeit für alle Champions attackdamageperlevel = 0; auf Level 1–3 macht der
// Zuwachs ohnehin nur wenige Punkte aus.

// Riots Wachstumsformel für Werte pro Level
const growth = (lvl) => (lvl - 1) * (0.7025 + 0.0175 * (lvl - 1));

function at(s, lvl) {
  const g = growth(lvl);
  return {
    hp: s.hp + s.hpperlevel * g,
    ad: s.attackdamage + (s.attackdamageperlevel || 0) * g,
    armor: s.armor + s.armorperlevel * g,
    as: s.attackspeed * (1 + ((s.attackspeedperlevel || 0) / 100) * g),
    range: s.attackrange,
    ms: s.movespeed,
  };
}

// Zeit, bis a b besiegt hat; mehr Reichweite = freie Treffer, bis der Kürzere die Lücke zugelaufen ist
function duel(a, b, lvl) {
  const A = at(a, lvl), B = at(b, lvl);
  const dps = (x, y) => (x.ad * x.as * 100) / (100 + y.armor);
  let aKills = B.hp / dps(A, B);
  let bKills = A.hp / dps(B, A);
  const gap = Math.abs(A.range - B.range);
  if (A.range > B.range) bKills += gap / B.ms;
  else if (B.range > A.range) aKills += gap / A.ms;
  // ratio > 1: a gewinnt (b bräuchte länger); Rest-Leben des Siegers in Prozent als Maß für den Abstand
  const ratio = bKills / aKills;
  return { lvl, ratio, hpLeft: Math.round((1 - Math.min(ratio, 1 / ratio)) * 100) };
}

// stats wie bei Data Dragon (champion.json); Ergebnis für Level 1, 2 und 3
const levels = (a, b) => (a && b ? [1, 2, 3].map((lvl) => duel(a, b, lvl)) : null);

module.exports = { levels };
