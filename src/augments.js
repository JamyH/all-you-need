// ARAM-Mayhem-Augments: deutsche Namen aus den Spieldaten des Clients, damit die gelesenen Kartennamen
// einer Augment-ID zugeordnet werden können. Die Tiers liefert src/arammayhem.js.
const fs = require('fs');
const path = require('path');

let file = null;
let names = {}; // id -> { name, rarity }

function init(dir) {
  file = path.join(dir, 'augments.json');
  try {
    if (fs.existsSync(file)) names = JSON.parse(fs.readFileSync(file, 'utf8')).names || {};
  } catch (e) {
    console.warn('Augment-Namen nicht lesbar:', e.message);
  }
}

// Namen und Seltenheit aus /lol-game-data/assets/v1/cherry-augments.json (Arena und Mayhem gemischt;
// Mayhem-IDs ab 1000). rarity: kSilver, kGold, kPrismatic
function setNames(list) {
  const next = {};
  for (const a of list || []) if (a.id >= 1000 && a.nameTRA) next[a.id] = { name: a.nameTRA, rarity: a.rarity };
  if (!Object.keys(next).length) return;
  names = next;
  fs.writeFileSync(file, JSON.stringify({ names }));
}

// Gelesenen Kartennamen dem passenden Augment zuordnen. Typische Lesefehler der Texterkennung werden vorher
// angeglichen: „ü“ wird „ii“, „ß“ wird „f3“ oder „3“ (kein Augment-Name enthält eine 3).
// Liefert die ID oder null, wenn kein Name nah genug ist.
const norm = (s) =>
  s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9!]/g, '')
    .replace(/ii/g, 'u').replace(/f3/g, 'ss').replace(/3/g, 's');
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function match(text) {
  const t = norm(text || '');
  if (t.length < 3) return null;
  let best = null, bestD = Infinity;
  // Lange Namen bricht die Karte auf zwei Zeilen um, gelesen wird nur die untere: dann zählen die letzten
  // Wörter, aber nur, wenn sie eindeutig zu einem einzigen Namen passen
  let tail = null, tailD = Infinity, tailIds = new Set();
  for (const [id, a] of Object.entries(names)) {
    const n = norm(a.name);
    const d = distance(t, n) / Math.max(n.length, 1);
    if (d < bestD) [best, bestD] = [Number(id), d];
    const words = a.name.split(' ');
    for (let k = 1; k < words.length && t.length >= 5; k++) {
      const w = norm(words.slice(-k).join(' '));
      const dw = distance(t, w) / Math.max(w.length, 1);
      if (dw < tailD) [tail, tailD, tailIds] = [Number(id), dw, new Set([id])];
      else if (dw === tailD) tailIds.add(id);
    }
  }
  if (bestD <= 0.3) return best;
  return tailD <= 0.2 && tailIds.size === 1 ? tail : null;
}

const hasNames = () => Object.keys(names).length > 0;
const name = (id) => names[id]?.name || null;

module.exports = { init, setNames, hasNames, match, name };
