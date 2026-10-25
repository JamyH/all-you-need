// Level 1–3: wer gewinnt das All-in, gerechnet aus Grundwerten (Data Dragon: Leben, Angriffsschaden, Rüstung,
// Magieresistenz, Angriffstempo, Reichweite, Lauftempo) und, wenn vorhanden, den Grundfähigkeiten auf Rang 1
// (Meraki: Schaden, Skalierung, Heilung/Schild, Abklingzeit). Auf Level 1/2/3 hat jeder 1/2/3 Fähigkeiten, die
// schadensstärksten zuerst. Der Kampf läuft in kleinen Zeitschritten: normale Angriffe durchgehend, jede Fähigkeit
// sofort und bei jedem Ende der Abklingzeit. Passiven, Kontrolleffekte (Betäubung, Verlangsamung) und Mehrfach-
// treffer (z. B. Garens E) fehlen, das Ergebnis ist daher nur ein Anhaltspunkt.
// Hinweis: Data Dragon liefert derzeit für alle Champions attackdamageperlevel = 0; auf Level 1–3 macht der
// Zuwachs ohnehin nur wenige Punkte aus.

const STEP = 0.05;
const MAX_TIME = 30;
// Fähigkeiten mit kürzerer Abklingzeit treffen dasselbe Ziel nicht öfter (z. B. Yasuos E: 0,5 s, je Ziel ~10 s)
const MIN_CD = 4;

// Riots Wachstumsformel für Werte pro Level
const growth = (lvl) => (lvl - 1) * (0.7025 + 0.0175 * (lvl - 1));

function at(s, lvl) {
  const g = growth(lvl);
  return {
    hp: s.hp + s.hpperlevel * g,
    ad: s.attackdamage + (s.attackdamageperlevel || 0) * g,
    armor: s.armor + s.armorperlevel * g,
    mr: s.spellblock + (s.spellblockperlevel || 0) * g,
    as: s.attackspeed * (1 + ((s.attackspeedperlevel || 0) / 100) * g),
    range: s.attackrange,
    ms: s.movespeed,
  };
}

const value = (v, me, target) => v.flat + v.ad * me.ad + v.targetHp * target.hp + v.ownHp * me.hp;
const mitigate = (dmg, type, target) =>
  type === 'true' ? dmg : dmg * (100 / (100 + (type === 'magic' ? target.mr : target.armor)));

// Fähigkeiten auf diesem Level: die n schadensstärksten (n = Level), je mit Schaden pro Einsatz nach Rüstung/MR
function kit(abilities, lvl, me, target) {
  const list = (abilities || []).map((a) => ({
    cd: a.cd ? Math.max(a.cd, MIN_CD) : null, // ohne Abklingzeit: Zusatzschaden bei jedem normalen Angriff
    dmg: a.hits.reduce((sum, h) => sum + mitigate(value(h, me, target), h.type, target), 0),
    heal: a.heal ? value(a.heal, me, target) : 0,
  }));
  return list.sort((x, y) => y.dmg + y.heal - (x.dmg + x.heal)).slice(0, lvl);
}

// Zeit, bis me target besiegt; delay: Sekunden, bis me überhaupt trifft (Reichweite zulaufen)
function killTime(me, target, abilities, delay) {
  const auto = mitigate(me.ad, 'physical', target);
  const onHit = abilities.filter((a) => !a.cd).reduce((s, a) => s + a.dmg, 0);
  const timed = abilities.filter((a) => a.cd);
  const interval = 1 / me.as;
  let hp = target.hp;
  let nextAuto = delay;
  const next = timed.map(() => delay);
  for (let t = 0; t <= MAX_TIME; t += STEP) {
    while (nextAuto <= t) {
      hp -= auto + onHit;
      nextAuto += interval;
    }
    timed.forEach((a, i) => {
      while (next[i] <= t) {
        hp -= a.dmg;
        next[i] += a.cd;
      }
    });
    if (hp <= 0) return t;
  }
  return MAX_TIME;
}

function duel(a, b, lvl, abilA, abilB) {
  const A = at(a, lvl), B = at(b, lvl);
  const kitA = kit(abilA, lvl, A, B), kitB = kit(abilB, lvl, B, A);
  // Heilung und Schilde zählen einmal pro Einsatz als zusätzliches Leben (vereinfacht: ein Einsatz im Kampf)
  const healA = kitA.reduce((s, x) => s + x.heal, 0), healB = kitB.reduce((s, x) => s + x.heal, 0);
  const gap = Math.abs(A.range - B.range);
  const delayA = A.range < B.range ? gap / A.ms : 0;
  const delayB = B.range < A.range ? gap / B.ms : 0;
  const aKills = killTime(A, { ...B, hp: B.hp + healB }, kitA, delayA);
  const bKills = killTime(B, { ...A, hp: A.hp + healA }, kitB, delayB);
  // ratio > 1: a gewinnt (b bräuchte länger); Rest-Leben des Siegers in Prozent als Maß für den Abstand
  const ratio = bKills / aKills;
  return { lvl, ratio, hpLeft: Math.round((1 - Math.min(ratio, 1 / ratio)) * 100), abilities: !!(abilA && abilB) };
}

// stats wie bei Data Dragon (champion.json), abilities wie meraki.champion().abilities (oder null: nur Grundwerte)
const levels = (a, b, abilA = null, abilB = null) => (a && b ? [1, 2, 3].map((lvl) => duel(a, b, lvl, abilA, abilB)) : null);

module.exports = { levels };
