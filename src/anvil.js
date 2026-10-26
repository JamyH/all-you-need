// Werte-Schmiede (Stat Anvil) im ARAM Mayhem: drei Werte-Splitter zur Wahl, sieht aus wie ein Augment-Angebot.
// Für Splitter gibt es keine Statistiken; die App bewertet sie danach, wie gut der Wert zum Build passt:
// Anteil der Build-Items, die diesen Wert haben (Item-Tags aus Data Dragon).
// Namen wie im deutschen Client (Stringtable cherry_statanvil_*, cherry_goldstatanvil_*, cherry_prisstatanvil_*).
const { t } = require('../renderer/i18n');
const SHARDS = [
  { key: 'ad', name: 'Angriffsschadensplitter', tags: ['Damage'] },
  { key: 'ap', name: 'Fähigkeitsstärkesplitter', tags: ['SpellDamage'] },
  { key: 'as', name: 'Angriffstemposplitter', tags: ['AttackSpeed'] },
  { key: 'ah', name: 'Fähigkeitstemposplitter', tags: ['AbilityHaste'] },
  { key: 'hp', name: 'Lebenssplitter', tags: ['Health'] },
  { key: 'ar', name: 'Rüstungssplitter', tags: ['Armor'] },
  { key: 'mr', name: 'Magieresistenzsplitter', tags: ['SpellBlock'] },
  { key: 'lethality', name: 'Tödlichkeitsfaktorsplitter', tags: ['ArmorPenetration'] },
  { key: 'crit', name: 'Kritischer Splitter', tags: ['CriticalStrike'] },
  { key: 'crit', name: 'Kritischer Treffer-Splitter', tags: ['CriticalStrike'] },
  { key: 'swift', name: 'Schnelligkeitssplitter', tags: ['AttackSpeed', 'AbilityHaste'] },
  { key: 'might', name: 'Machtsplitter', tags: ['Damage', 'SpellDamage'] },
  { key: 'tough', name: 'Unverwüstlicher Splitter', tags: ['Armor', 'SpellBlock'] },
  { key: 'critdmg', name: 'Krit.-Schadensplitter', tags: ['CriticalStrike'] },
  { key: 'size', name: 'Lebens- und Größesplitter', tags: ['Health'] },
  { key: 'armorpen', name: 'Rüstungsdurchdringung-Splitter', tags: ['ArmorPenetration'] },
  { key: 'pen', name: 'Magiedurchdringungs- splitter', tags: ['MagicPenetration'] },
  { key: 'omnivamp', name: 'Omnivampirsplitter', tags: ['LifeSteal', 'SpellVamp'], any: true, floor: 'B', floorWhy: 'Heilung nützt jedem' },
  { key: 'spirit', name: 'Heil- und Schildkraftsplitter', tags: ['LifeSteal', 'SpellVamp'], any: true },
  { key: 'ms', name: 'Lauftemposplitter', always: 'B', why: 'nützt jedem' },
  { key: 'tenacity', name: 'Zähigkeitssplitter', always: 'B', why: 'nützt jedem' },
  { key: 'gold', name: 'Glückssplitter', always: 'C', why: 'nur Gold' },
  { key: 'random', name: 'Zwei zufällige Splitter', always: 'C', why: 'Glückssache' },
];

// Lesefehler wie bei den Augments angleichen: „ü“ -> „ii“, „ß“/„s“ -> „3“
const norm = (s) =>
  s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
    .replace(/ii/g, 'u').replace(/3/g, 's');
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// Gelesenen Kartennamen einem Splitter zuordnen, sonst null (dann ist es ein Augment).
// Lange Namen bricht die Karte um; bleibt unten nur „splitter“, ist es Magie- oder Rüstungsdurchdringung.
function match(text) {
  const t = norm(text || '');
  // Endung „splitter“ mit höchstens zwei Lesefehlern („splittar“), sonst ist es ein Augment
  if (t.length < 8 || distance(t.slice(-8), 'splitter') > 2) return null;
  if (t === 'splitter') return SHARDS.find((s) => s.key === 'pen');
  let best = null, bestD = Infinity;
  for (const s of SHARDS) {
    const n = norm(s.name);
    const d = distance(t, n.slice(-t.length)) / t.length; // nur die gelesene (untere) Zeile vergleichen
    if (d < bestD) [best, bestD] = [s, d];
  }
  return bestD <= 0.25 ? best : null;
}

// Passung eines Splitters zum Build: itemTags = Tag-Listen der Build-Items, magic = Champion macht
// Magieschaden (für die Durchdringung, deren Name umbrechen kann). Liefert { score 0–1, hits, total }.
function fit(shard, itemTags, magic) {
  const total = itemTags.length;
  const share = (tag) => itemTags.filter((t) => t.includes(tag)).length / total;
  if (shard.key === 'pen' || shard.key === 'armorpen') {
    // Durchdringung ohne passendes Item: Schaden der richtigen Art zählt abgeschwächt
    const [pen, dmg] = magic ? ['MagicPenetration', 'SpellDamage'] : ['ArmorPenetration', 'Damage'];
    return { score: Math.max(share(pen), share(dmg) * 0.6), hits: Math.round(share(pen) * total), total };
  }
  // Doppel-Splitter: jeder Wert ist halb so groß wie beim Einzel-Splitter, zählt also zur Hälfte.
  // any: ein Wert, für den mehrere Tags passen (Heilung über Lebensraub oder Zaubervampir)
  const shares = shard.tags.map(share);
  return { score: shard.any ? Math.max(...shares) : shares.reduce((a, b) => a + b, 0) / shares.length, hits: Math.round(Math.max(...shares) * total), total };
}

// Wertung aller Splitter eines Angebots: S nur für die am besten passende Karte, damit die Wahl klar ist.
// Liefert je Splitter { tier, why }.
function rateOffer(shards, itemTags, magic = false) {
  const fits = shards.map((s) => (s && !s.always && itemTags.length ? fit(s, itemTags, magic) : null));
  const best = Math.max(0, ...fits.map((f) => (f ? f.score : 0)));
  return shards.map((s, i) => {
    if (!s) return null;
    if (s.always) return { tier: s.always, why: t(s.why) };
    const f = fits[i];
    if (!f) return { tier: null, why: t('Build unbekannt') };
    const why = f.hits ? t('passt zu {hits} von {total} Build-Items', f) : t('passt nicht zum Build');
    const tier = f.score >= 0.5 ? (f.score === best ? 'S' : 'A') : f.score >= 0.3 ? 'A' : f.score > 0 ? 'B' : 'C';
    if (s.floor && 'SABCD'.indexOf(tier) > 'SABCD'.indexOf(s.floor)) return { tier: s.floor, why: t(s.floorWhy) };

    return { tier, why };
  });
}

module.exports = { match, rateOffer, SHARDS };
