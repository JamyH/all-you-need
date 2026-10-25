// Fähigkeitswerte der Champions von Meraki Analytics (offene Champion-Daten, wie sie viele LoL-Tools nutzen):
// Schaden je Rang mit Skalierung, Schadensart, Heilung/Schild und Abklingzeit. Data Dragon hat davon nur Texte.
// Für die Level-1–3-Einschätzung reicht Rang 1 der Grundfähigkeiten (Q, W, E); eine Woche gespeichert.
const fs = require('fs');
const path = require('path');

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const url = (id) => `https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions/${id}.json`;

let dir = null;
const mem = new Map();
function init(dataDir) {
  dir = path.join(dataDir, 'meraki');
  fs.mkdirSync(dir, { recursive: true });
}

// Ein Wert auf Rang 1 als Teile: fest, % Gesamt-AD, % des Maximallebens des Ziels, % des eigenen Maximallebens.
// Bonus-AD, AP und Bonusleben sind auf Level 1–3 ohne Items 0 und fallen weg; unbekannte Einheiten ebenso
function rank1(leveling) {
  const v = { flat: 0, ad: 0, targetHp: 0, ownHp: 0 };
  for (const m of leveling.modifiers) {
    const x = Number(m.values[0]) || 0;
    const unit = (m.units[0] || '').trim().toLowerCase();
    if (unit === '') v.flat += x;
    else if (unit === '% ad') v.ad += x / 100;
    else if (/^% (of )?(the )?target'?s? max(imum)? health/.test(unit)) v.targetHp += x / 100;
    else if (/^% (of )?(his |her |its |their )?max(imum)? health/.test(unit)) v.ownHp += x / 100;
  }
  return v;
}

const typeOf = (attr, fallback) =>
  /true/i.test(attr) ? 'true' : /magic/i.test(attr) ? 'magic' : /physical/i.test(attr) ? 'physical' : fallback;

// Pro Wirkung höchstens ein Schadenswert: Maximal-, Monster- und Vasallen-Werte zählen nicht (Minimum statt Maximum)
const SKIP = /maximum|monster|minion|reduction|per second|empowered|increased|total/i;

function simplify(data) {
  const abilities = [];
  for (const key of ['Q', 'W', 'E']) {
    const a = (data.abilities[key] || [])[0];
    if (!a) continue;
    // gemischter Schaden (z. B. Ahris Q) zählt als magisch
    const fallback = /MAGIC|MIXED/.test(a.damageType || '') ? 'magic' : /TRUE/.test(a.damageType || '') ? 'true' : 'physical';
    const hits = [];
    let heal = null;
    for (const e of a.effects || []) {
      const lv = e.leveling || [];
      const dmg = lv.find((l) => /damage/i.test(l.attribute) && !SKIP.test(l.attribute));
      if (dmg) hits.push({ type: typeOf(dmg.attribute, fallback), ...rank1(dmg) });
      const h = lv.find((l) => /^(heal|shield)/i.test(l.attribute));
      if (h && !heal) heal = rank1(h);
    }
    const cd = a.cooldown && a.cooldown.modifiers && a.cooldown.modifiers[0] ? Number(a.cooldown.modifiers[0].values[0]) : null;
    if (hits.length || heal) abilities.push({ key, cd: cd || null, hits, heal });
  }
  return { patch: data.patchLastChanged || null, abilities };
}

async function champion(id) {
  if (mem.has(id)) return mem.get(id);
  const file = dir && path.join(dir, `${id}.json`);
  try {
    const hit = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - hit.fetchedAt < CACHE_MS) {
      mem.set(id, hit);
      return hit;
    }
  } catch {
    // noch nicht geladen
  }
  const res = await fetch(url(id), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`merakianalytics.com antwortet mit ${res.status}`);
  const out = { fetchedAt: Date.now(), ...simplify(await res.json()) };
  mem.set(id, out);
  if (file) fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

module.exports = { init, champion, simplify };
