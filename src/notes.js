// Eigene Notizen je Champion (Data-Dragon-ID, z. B. „Akshan“) plus eine allgemeine („_general“), nur lokal in
// userdata/notes.json. Dazu je Champion ein Spiel-Tagebuch (journal): nach dem Spiel „Was nehme ich mit?“.
// Leerer Text löscht die Notiz, solange kein Tagebuch-Eintrag mehr dranhängt
const fs = require('fs');
const path = require('path');

let file = null;
let notes = {}; // key -> { text, at, journal: [{ at, gameId, win, text }] }

function init(dir) {
  file = path.join(dir, 'notes.json');
  try {
    if (fs.existsSync(file)) notes = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn('Notizen nicht lesbar:', e.message);
  }
}

const all = () => notes;

// erst in eine Hilfsdatei, dann umbenennen: ein Absturz beim Schreiben zerstört die alten Notizen nicht
function write() {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(notes, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  return notes;
}
const tidy = (key) => {
  const n = notes[key];
  if (n && !n.text && !(n.journal || []).length) delete notes[key];
};

function set(key, text) {
  if (!key) return notes;
  const clean = String(text || '').replace(/\s+$/, '');
  notes[key] = { ...(notes[key] || {}), text: clean, at: Date.now() };
  tidy(key);
  return write();
}

// Tagebuch-Eintrag zu einem Spiel: ein Eintrag je Spiel, erneutes Speichern ersetzt ihn, leer löscht ihn
function learn(key, { gameId, win, text }) {
  if (!key || !gameId) return notes;
  const n = notes[key] || { text: '', at: Date.now() };
  const clean = String(text || '').trim();
  const rest = (n.journal || []).filter((j) => String(j.gameId) !== String(gameId));
  n.journal = clean ? [...rest, { at: Date.now(), gameId, win: !!win, text: clean }] : rest;
  notes[key] = n;
  tidy(key);
  return write();
}

module.exports = { init, all, set, learn };
