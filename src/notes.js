// Eigene Notizen je Champion (Data-Dragon-ID, z. B. „Akshan“) plus eine allgemeine („_general“), nur lokal in
// userdata/notes.json. Leerer Text löscht die Notiz
const fs = require('fs');
const path = require('path');

let file = null;
let notes = {}; // key -> { text, at }

function init(dir) {
  file = path.join(dir, 'notes.json');
  try {
    if (fs.existsSync(file)) notes = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn('Notizen nicht lesbar:', e.message);
  }
}

const all = () => notes;

function set(key, text) {
  if (!key) return notes;
  const clean = String(text || '').replace(/\s+$/, '');
  if (clean) notes[key] = { text: clean, at: Date.now() };
  else delete notes[key];
  // erst in eine Hilfsdatei, dann umbenennen: ein Absturz beim Schreiben zerstört die alten Notizen nicht
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(notes, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  return notes;
}

module.exports = { init, all, set };
