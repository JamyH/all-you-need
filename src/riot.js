// League und Riot Client komplett beenden, wenn sie nach einem Vanguard-Fehler hängen (statt Task-Manager).
// Nur Programme des Nutzers per taskkill; Vanguard selbst (Dienst vgc/vgk) bleibt, der Client startet ihn neu.
const { execFile } = require('child_process');

const NAMES = [
  'League of Legends.exe',
  'LeagueClient.exe',
  'LeagueClientUx.exe',
  'LeagueClientUxRender.exe',
  'LeagueCrashHandler64.exe',
  'Riot Client.exe',
  'RiotClientServices.exe',
  'RiotClientUx.exe',
  'RiotClientUxRender.exe',
  'RiotClientCrashHandler.exe',
];

const run = (cmd, args) =>
  new Promise((resolve) => execFile(cmd, args, { windowsHide: true }, (err, stdout) => resolve({ err, stdout: String(stdout || '') })));

// Welche der Riot-Programme laufen gerade (Namen wie in NAMES)
async function running() {
  const { stdout } = await run('tasklist', ['/FO', 'CSV', '/NH']);
  const names = new Set(stdout.split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean).map((n) => n.toLowerCase()));
  return NAMES.filter((n) => names.has(n.toLowerCase()));
}

// Beendet alle laufenden; liefert, was lief und was danach noch läuft
async function quitAll() {
  const before = await running();
  if (before.length) await run('taskkill', ['/F', '/T', ...before.flatMap((n) => ['/IM', n])]);
  await new Promise((r) => setTimeout(r, 1500));
  return { before, left: await running() };
}

module.exports = { running, quitAll };
