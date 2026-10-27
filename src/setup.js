// Findet League-Ordner und HUD-Einstellungen des Nutzers, damit nichts von Hand eingetragen werden muss.
const fs = require('fs');
const path = require('path');

const RIOT_INSTALLS = 'C:\\ProgramData\\Riot Games\\RiotClientInstalls.json';
const isLeagueDir = (dir) => dir && fs.existsSync(path.join(dir, 'LeagueClient.exe'));

// Reihenfolge: Wert aus der Config (falls gültig) -> Installationsliste des Riot Clients -> Standardpfade
function findLeaguePath(configured) {
  if (isLeagueDir(configured)) return configured;
  try {
    const installs = JSON.parse(fs.readFileSync(RIOT_INSTALLS, 'utf8'));
    const hit = Object.keys(installs.associated_client || {}).find((p) => /league of legends/i.test(p) && isLeagueDir(p));
    if (hit) return path.normalize(hit).replace(/[\\/]+$/, '');
  } catch {
    // Datei fehlt (Riot Client nie gestartet) -> Standardpfade probieren
  }
  for (const drive of ['C', 'D', 'E', 'F']) {
    const p = `${drive}:\\Riot Games\\League of Legends`;
    if (isLeagueDir(p)) return p;
  }
  return configured;
}

// HUD-Größe aus Config/game.cfg: GlobalScale 0..1 (Regler „HUD-Skalierung“ 0..100)
function readHudScale(leaguePath) {
  try {
    const cfg = fs.readFileSync(path.join(leaguePath, 'Config', 'game.cfg'), 'utf8');
    const m = cfg.match(/^GlobalScale=([\d.]+)/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

// Fenstermodus aus Config/game.cfg: 0 = Vollbild, 1 = Fenster, 2 = Randlos
function readWindowMode(leaguePath) {
  try {
    const cfg = fs.readFileSync(path.join(leaguePath, 'Config', 'game.cfg'), 'utf8');
    const m = cfg.match(/^WindowMode=(\d)/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

// Minimap aus Config/game.cfg: MinimapScale (Regler „Minimap-Größe“) und FlipMiniMap (Minimap links)
function readMinimap(leaguePath) {
  try {
    const cfg = fs.readFileSync(path.join(leaguePath, 'Config', 'game.cfg'), 'utf8');
    const scale = cfg.match(/^MinimapScale=([\d.]+)/m);
    return { scale: scale ? Number(scale[1]) : 1, flip: /^FlipMiniMap=1/m.test(cfg) };
  } catch {
    return {};
  }
}

module.exports = { findLeaguePath, readHudScale, readWindowMode, readMinimap };
