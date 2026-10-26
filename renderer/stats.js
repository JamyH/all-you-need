const $ = (id) => document.getElementById(id);
i18n.setLang(window.lol.lang);
i18n.translatePage(document);
const { t, num } = i18n;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (v) => num(v);
const dec = (v, digits) => num(v, digits);
// Fehler aus dem Hauptprozess ohne den Electron-Vorspann; läuft der Client nicht, ein kurzer Satz
const errText = (e) => (e.message.includes(t('League-Client läuft nicht')) ? t('League-Client läuft nicht.')
  : e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
const dur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let ddVersion = null;
// ohne Champion (z. B. Übungspuppen im Practice Tool) ein Platzhalter statt eines kaputten Bildes
const champImg = (c) => (c && c.id
  ? `<img src="https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${c.id}.png">`
  : '<span class="champ-ph" aria-hidden="true"></span>');
const itemsHtml = (ids) =>
  `<span class="items">${ids.filter((i) => i > 0)
    .map((i) => `<img src="https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/item/${i}.png">`).join('')}</span>`;

const QUEUES = { 420: 'Solo/Duo', 440: 'Flex', 400: 'Normal Draft', 430: 'Normal Blind', 450: 'ARAM', 490: 'Quickplay', 1700: 'Arena', 1900: 'URF' };

// --- Letztes Spiel (End-of-Game-Screen des Clients) ---
async function renderEog() {
  const el = $('eog');
  let eog;
  try {
    eog = await window.lol.endOfGame();
  } catch {
    el.innerHTML = `<div class="msg">${t('Keine Endspiel-Daten. Die gibt es direkt nach einem Spiel, solange der Client den Endbildschirm zeigt.')}<br>${t('Unter „Verlauf“ findest du ältere Spiele.')}</div>`;
    return;
  }
  const local = eog.localPlayer || {};
  const ls = local.stats || {};
  const mins = Math.max((eog.gameLength || 0) / 60, 1);
  const cs = (ls.MINIONS_KILLED || 0) + (ls.NEUTRAL_MINIONS_KILLED || 0);
  const myTeam = (eog.teams || []).find((t) => t.isPlayerTeam);
  const won = myTeam ? myTeam.isWinningTeam : null;

  let html = `<div class="summary">
    <div class="tile"><label>${t('Ergebnis')}</label><b class="${won ? 'win' : 'loss'}">${won ? t('Sieg') : t('Niederlage')}</b></div>
    <div class="tile"><label>${t('Dauer')}</label><b>${dur(eog.gameLength || 0)}</b></div>
    <div class="tile"><label>KDA</label><b>${ls.CHAMPIONS_KILLED || 0}/${ls.NUM_DEATHS || 0}/${ls.ASSISTS || 0}</b></div>
    <div class="tile"><label>CS/min</label><b>${dec(cs / mins, 1)}</b></div>
    <div class="tile"><label>${t('Schaden/min')}</label><b>${n(Math.round((ls.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0) / mins))}</b></div>
    <div class="tile"><label>Vision</label><b>${ls.VISION_SCORE || 0}</b></div>
  </div>`;

  for (const team of eog.teams || []) {
    const teamDmg = team.players.reduce((s, p) => s + (p.stats.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0), 0) || 1;
    html += `<div class="team-title ${team.isWinningTeam ? 'win' : 'loss'}">${team.isPlayerTeam ? t('Dein Team') : t('Gegner')} · ${team.isWinningTeam ? t('Sieg') : t('Niederlage')}</div>
    <table><tr><th>${t('Spieler')}</th><th>KDA</th><th>CS</th><th>Gold</th><th>${t('Schaden')}</th><th>${t('Anteil')}</th><th>Vision</th><th>Items</th></tr>`;
    for (const p of team.players) {
      const s = p.stats;
      const champ = await window.lol.champion(p.championId);
      const name = p.riotIdGameName || p.summonerName || '';
      const isMe = p.puuid && p.puuid === local.puuid;
      html += `<tr class="${isMe ? 'me' : ''}">
        <td><span class="champ">${champImg(champ)}${esc(champ.name)} <small>${esc(name)}</small></span></td>
        <td>${s.CHAMPIONS_KILLED || 0}/${s.NUM_DEATHS || 0}/${s.ASSISTS || 0}</td>
        <td>${(s.MINIONS_KILLED || 0) + (s.NEUTRAL_MINIONS_KILLED || 0)}</td>
        <td>${n(s.GOLD_EARNED)}</td>
        <td>${n(s.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS)}</td>
        <td>${Math.round(((s.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0) / teamDmg) * 100)}%</td>
        <td>${s.VISION_SCORE || 0}</td>
        <td>${itemsHtml(p.items || [])}</td></tr>`;
    }
    html += '</table>';
  }
  el.innerHTML = html;
}

// --- Verlauf (Match-History des Clients) ---
async function renderHistory() {
  const el = $('history');
  let data;
  try {
    data = await window.lol.history();
  } catch {
    el.innerHTML = `<div class="msg">${t('League-Client läuft nicht.')}</div>`;
    return;
  }
  // Practice-Tool-Runden zählen nicht: kein echtes Ergebnis, verfälschen Winrate und Trends
  const games = ((data.games && data.games.games) || []).filter((g) => g.gameMode !== 'PRACTICETOOL');
  if (!games.length) {
    el.innerHTML = `<div class="msg">${t('Keine Spiele gefunden.')}</div>`;
    return;
  }
  for (const g of games) g.champ = await window.lol.champion(g.participants[0].championId);
  histGames = games;
  // Start mit dem Modus des letzten Spiels; eine eigene Wahl bleibt, solange es den Modus noch gibt
  if (!histMode || (histMode !== 'all' && !games.some((g) => g.gameMode === histMode))) histMode = games[0].gameMode;
  drawHistory();
}

// Modi getrennt: CS, KDA und Vision sind auf der Kluft und im ARAM nicht vergleichbar
const MODES = { CLASSIC: 'Kluft', ARAM: 'ARAM', KIWI: 'ARAM Mayhem', CHERRY: 'Arena', URF: 'URF', ONEFORALL: 'Einer für alle' };
const modeName = (m) => (MODES[m] ? t(MODES[m]) : m);
let histGames = [];
let histMode = null;
$('history').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  histMode = b.dataset.mode;
  drawHistory();
});

function drawHistory() {
  const el = $('history');
  const modes = [...new Set(histGames.map((g) => g.gameMode))];
  const games = histMode === 'all' ? histGames : histGames.filter((g) => g.gameMode === histMode);
  const seg = modes.length > 1
    ? `<div class="seg" role="group" aria-label="${t('Spielmodus')}">${['all', ...modes].map((m) =>
      `<button data-mode="${esc(m)}" aria-pressed="${m === histMode}">${m === 'all' ? t('Alle') : esc(modeName(m))}</button>`).join('')}</div>`
    : '';
  let wins = 0, kdaSum = 0, csmSum = 0;
  let html = '';
  for (const g of games) {
    const p = g.participants[0];
    const s = p.stats;
    const champ = g.champ;
    const mins = Math.max(g.gameDuration / 60, 1);
    kdaSum += (s.kills + s.assists) / Math.max(s.deaths, 1);
    csmSum += (s.totalMinionsKilled + s.neutralMinionsKilled) / mins;
    const cs = s.totalMinionsKilled + s.neutralMinionsKilled;
    if (s.win) wins++;
    const when = new Date(g.gameCreation).toLocaleString(i18n.locale(), { dateStyle: 'short', timeStyle: 'short' });
    html += `<div class="game ${s.win ? 'w' : 'l'}">
      <div class="bar"></div>
      <div class="champ">${champImg(champ)}<div>${esc(champ.name)}<small>${esc(QUEUES[g.queueId] || modeName(g.gameMode))} · ${when}</small></div></div>
      <div><b>${s.kills}/${s.deaths}/${s.assists}</b><small>${dec((s.kills + s.assists) / Math.max(s.deaths, 1), 2)} KDA</small></div>
      <div><b>${cs}</b><small>${dec(cs / mins, 1)} CS/min</small></div>
      <div><b>${n(s.totalDamageDealtToChampions)}</b><small>${t('Schaden')}</small></div>
      <div><b>${dur(g.gameDuration)}</b><small>${t('Dauer')}</small></div>
      <div>${itemsHtml([s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6])}</div>
    </div>`;
  }
  const avg = (sum, digits) => dec(sum / games.length, digits);
  el.innerHTML = seg + `<div class="summary">
    <div class="tile"><label>${t('Letzte {n}', { n: games.length })}${histMode === 'all' ? '' : ` · ${esc(modeName(histMode))}`}</label><b><span class="win">${t('{n}S', { n: wins })}</span> <span class="loss">${t('{n}N', { n: games.length - wins })}</span></b></div>
    <div class="tile"><label>${t('Siegquote')}</label><b>${Math.round((wins / games.length) * 100)} %</b></div>
    <div class="tile"><label>Ø KDA</label><b>${avg(kdaSum, 2)}</b></div>
    <div class="tile"><label>Ø CS/min</label><b>${avg(csmSum, 1)}</b></div></div>` +
    trendsHtml(games) + html;
}

// --- Trends: CS/min, KDA, Vision über die letzten Spiele (links alt, rechts neu) ---
function trendsHtml(games) {
  const chrono = [...games].reverse();
  const series = [
    { label: 'CS/min', color: '#f2c14e', digits: 1,
      values: chrono.map((g) => { const s = g.participants[0].stats; return (s.totalMinionsKilled + s.neutralMinionsKilled) / Math.max(g.gameDuration / 60, 1); }) },
    { label: 'KDA', color: '#5eead4', digits: 2,
      values: chrono.map((g) => { const s = g.participants[0].stats; return (s.kills + s.assists) / Math.max(s.deaths, 1); }) },
    { label: 'Vision/min', color: '#8ab4f8', digits: 2,
      values: chrono.map((g) => (g.participants[0].stats.visionScore || 0) / Math.max(g.gameDuration / 60, 1)) },
  ];
  return `<div class="trends">${series.map(trendCard).join('')}</div>`;
}

function trendCard({ label, color, digits, values }) {
  if (values.length < 2) return '';
  const W = 200, H = 70, pad = 6;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (values.length - 1);
  const y = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const last = values[values.length - 1];
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<div class="trend">
    <div class="trend-head"><label>${label}</label><span><b>${dec(last, digits)}</b><small>Ø ${dec(avg, digits)}</small></span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${t('{label} der letzten {n} Spiele, zuletzt {last}, Durchschnitt {avg}', { label, n: values.length, last: dec(last, digits), avg: dec(avg, digits) })}">
      <line x1="${pad}" x2="${W - pad}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" stroke="rgba(255,255,255,0.18)" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></line>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline>
      <circle cx="${x(values.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="3" fill="${color}"></circle>
    </svg>
  </div>`;
}

// --- Live-Spiel: alle 10 Spieler, aktualisiert alle 2 s solange der Tab offen ist ---
const TIERS = { IRON: 'Eisen', BRONZE: 'Bronze', SILVER: 'Silber', GOLD: 'Gold', PLATINUM: 'Platin', EMERALD: 'Smaragd',
  DIAMOND: 'Diamant', MASTER: 'Meister', GRANDMASTER: 'Großmeister', CHALLENGER: 'Challenger' };

function rankHtml(p) {
  if (p.isBot) return '<span class="sub">Bot</span>';
  const r = p.rank;
  if (!r) return '<span class="sub">…</span>';
  if (r.unranked) return `<span class="sub">${t('ungewertet')}</span>`;
  const games = r.wins + r.losses;
  const wr = games ? Math.round((r.wins / games) * 100) : 0;
  const tier = TIERS[r.tier] ? t(TIERS[r.tier]) : r.tier;
  const div = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(r.tier) ? '' : ` ${r.division}`;
  return `<span class="rank"><span class="tier">${esc(tier)}${div}</span> · ${r.lp} LP` +
    `<span class="sub"><span class="${wr >= 50 ? 'wr-good' : 'wr-bad'}">${wr}%</span> ${t('aus {n} Spielen', { n: games })}</span></span>`;
}

async function renderLive() {
  const el = $('liveList');
  const d = await window.lol.liveData();
  if (!d) {
    el.innerHTML = `<div class="msg">${t('Gerade läuft kein Spiel. Sobald du im Spiel bist, stehen hier alle 10 Spieler mit Rang, Items und Werten.')}</div>`;
    return false;
  }
  const mins = Math.floor(d.gameTime / 60), secs = String(Math.floor(d.gameTime % 60)).padStart(2, '0');
  const mine = d.teams.find((t) => t.id === d.myTeam), theirs = d.teams.find((t) => t.id !== d.myTeam);
  const diff = mine.value - theirs.value;
  let html = `<div class="live-head"><span>${esc(d.gameMode)} · <b>${mins}:${secs}</b></span>` +
    `<span>${t('Team-Itemwert')} <b class="${diff >= 0 ? 'win' : 'loss'}">${diff >= 0 ? '+' : ''}${n(diff)} g</b></span></div>`;
  for (const team of [mine, theirs]) {
    html += `<div class="team-card"><h2 class="${team === mine ? 'mine' : 'enemy'}">${team === mine ? t('Dein Team') : t('Gegner')}<span>${t('Itemwert {gold} g', { gold: n(team.value) })}</span></h2>
      <table><tr><th>${t('Spieler')}</th><th>${t('Rang')}</th><th>Lvl</th><th>KDA</th><th>CS</th><th>Vision</th><th>${t('Itemwert')}</th><th>Items</th></tr>`;
    for (const p of team.players) {
      const champ = { id: p.championId, name: p.champion };
      const name = p.champion || (d.gameMode === 'PRACTICETOOL' ? t('Übungspuppe') : 'Bot');
      html += `<tr class="${p.isMe ? 'me' : ''} ${p.isDead ? 'dead' : ''}">
        <td><span class="champ">${champImg(champ)}<span>${esc(name)}<span class="sub">${p.isBot ? '' : esc(p.name)}${p.isDead ? `${p.isBot ? '' : ' · '}${t('tot {s}s', { s: p.respawn })}` : ''}</span></span></span></td>
        <td>${rankHtml(p)}</td><td>${p.level}</td><td>${p.kda}</td><td>${p.cs}</td><td>${p.vision}</td>
        <td>${n(p.itemValue)}</td><td>${itemsHtml(p.items)}</td></tr>`;
    }
    html += '</table></div>';
  }
  el.innerHTML = html;
  return true;
}
setInterval(() => { if (!$('live').hidden && !window.__docs) renderLive(); }, 2000);

$('calibBtn').addEventListener('click', async () => {
  const out = $('calibOut');
  out.innerHTML = `<span class="hint">${t('Prüfe…')}</span>`;
  try {
    const c = await window.lol.calibCheck();
    out.innerHTML = c.items.map((it) =>
      `<div class="calib-item"><label>${esc(it.label)}</label><img src="${it.img}" alt="${esc(t('Bereich {name}', { name: it.label }))}"><b>${esc(it.value)}</b></div>`).join('') +
      `<div class="calib-meta">${t('Bildschirm {screen} · HUD-Skalierung {hud} · Faktoren Auflösung {res}, untere Leiste {bar}', {
        screen: esc(c.screen), hud: c.hudScale == null ? t('unbekannt') : Math.round(c.hudScale * 100), res: c.factors.res, bar: c.factors.hud })}</div>`;
  } catch (e) {
    out.innerHTML = `<span class="hint">${esc(errText(e))}</span>`;
  }
});

// --- Build & Runen ---
let buildData = null;
let champId = null;
const champByName = new Map();
const itemByName = new Map();

async function loadBuild() {
  buildData = await window.lol.buildData();
  $('champList').innerHTML = buildData.champions.map((c) => `<option value="${esc(c.name)}"></option>`).join('');
  buildData.champions.forEach((c) => champByName.set(c.name.toLowerCase(), c));
  $('itemOptions').innerHTML = buildData.items
    .map((i) => `<option value="${esc(i.name)}">${i.gold} g${i.completed ? '' : ` · ${t('Teil')}`}</option>`).join('');
  buildData.items.forEach((i) => itemByName.set(i.name.toLowerCase(), i));
  $('runesAuto').checked = buildData.runesAuto;
  $('spellsAuto').checked = buildData.spellsAuto;
  $('suggestionsOn').checked = buildData.suggestions;
  $('openInChampSelect').checked = buildData.openInChampSelect;
  $('autoAccept').checked = buildData.autoAccept;
  $('itemSetAuto').checked = buildData.itemSetAuto;
  selectChampion(champId || buildData.current);
}

function selectChampion(id) {
  const champ = buildData && buildData.champions.find((c) => c.id === id);
  if (!champ) return;
  champId = champ.id;
  $('champInput').value = champ.name;
  renderBuild();
  renderRunes();
  renderSuggestion();
  renderOwnItems();
  renderMatchup();
}

// --- Matchup: Lane gewinnend oder verlierend und wer auf Level 1–3 vorne liegt (nur vor dem Spiel) ---
const matchup = { enemies: [], position: '', manual: null };
const signedPct = (v) => `${v >= 0 ? '+' : '−'}${dec(Math.abs(v), 1)} %`;
function laneVerdict(d) {
  const v = d.normalized ?? d.delta;
  if (v >= 2) return [t('gewinnend'), 'win'];
  if (v >= 0.75) return [t('leicht gewinnend'), 'win'];
  if (v > -0.75) return [t('ausgeglichen'), ''];
  return v > -2 ? [t('leicht verlierend'), 'loss'] : [t('verlierend'), 'loss'];
}
// Duell (Schnitt Level 1–3) mit 10 % Vorsprung zählt 1,5; First Blood gilt fürs ganze Spiel und zählt weniger:
// 55 % zählen 1 ohne Fähigkeiten im Duell, mit Fähigkeiten 0,5. Beides zusammen ergibt die Einschätzung
function earlyVerdict(d) {
  const withAbilities = !!(d.duel && d.duel[0].abilities);
  const fb = d.firstBlood != null ? (d.firstBlood - 50) / (withAbilities ? 10 : 5) : 0;
  const duel = d.duel ? (d.duel.reduce((sum, x) => sum + x.ratio, 0) / d.duel.length - 1) * 15 : 0;
  const s = fb + duel;
  return s >= 0.6 ? [t('eher du'), 'win'] : s <= -0.6 ? [t('eher der Gegner'), 'loss'] : [t('offen'), ''];
}
function matchupHtml(vs, d) {
  const name = (buildData.champions.find((c) => c.id === vs) || { name: vs }).name;
  const duel = d.duel ? `${d.duel[0].abilities ? t('Duell L1–3 mit Fähigkeiten') : t('Duell L1–3 (nur Grundwerte)')}: ${d.duel.map((x) =>
    `<span class="${x.ratio >= 1 ? 'win' : 'loss'}">${x.ratio >= 1 ? '+' : '−'}${x.hpLeft} %</span>`).join(' · ')}` : '';
  const ev = earlyVerdict(d);
  const early = `<div><label>${t('Level 1–3')}</label><b class="${ev[1]}">${ev[0]}</b>` +
    `<small>${d.firstBlood != null ? `First Blood ${dec(d.firstBlood, 1)} % · ` : ''}${duel}</small></div>`;
  const head = `<span class="champ">${champImg({ id: vs })}<b>${esc(name)}</b></span>`;
  if (d.error) return `${head}<div><label>Lane</label><b>–</b><small>${esc(d.error)}</small></div>${early}`;
  const lv = laneVerdict(d);
  return `${head}<div><label>Lane</label><b class="${lv[1]}">${dec(d.winRate, 1)} % · ${lv[0]}</b>` +
    `<small>${t('{pct} ggü. Ø-Gegner', { pct: signedPct(d.delta) })}${d.normalized != null ? ` · ${t('bereinigt {pct}', { pct: signedPct(d.normalized) })}` : ''}` +
    `${d.games ? ` · ${t('{n} Spiele', { n: n(d.games) })}` : ''}</small></div>${early}`;
}
async function renderMatchup() {
  const box = $('matchupList');
  const list = [...new Set([...(matchup.manual ? [matchup.manual] : []), ...matchup.enemies])].filter((id) => id !== champId);
  if (!champId || !list.length) {
    box.innerHTML = `<p class="hint">${t('In der Champ-Auswahl stehen hier die gegnerischen Picks. Oder oben einen Gegner wählen.')}</p>`;
    return;
  }
  const forChamp = champId;
  box.innerHTML = list.map((id) => `<div class="mu-row" data-vs="${esc(id)}"><span class="hint">${t('Lade Matchup…')}</span></div>`).join('');
  await Promise.all(list.map(async (id) => {
    const d = await window.lol.matchup(forChamp, id, matchup.position).catch((e) => ({ error: e.message }));
    const row = box.querySelector(`[data-vs="${CSS.escape(id)}"]`);
    if (row && forChamp === champId) row.innerHTML = matchupHtml(id, d);
  }));
}
$('vsInput').addEventListener('change', () => {
  const c = champByName.get($('vsInput').value.trim().toLowerCase());
  if (!c) return;
  matchup.manual = c.id;
  renderMatchup();
});
window.lol.onMatchupEnemies((s) => {
  matchup.enemies = s.enemies;
  matchup.position = s.position;
  renderMatchup();
});
window.lol.matchupState().then((s) => {
  if (!s) return;
  matchup.enemies = s.enemies;
  matchup.position = s.position;
  renderMatchup();
});

// Eigene meistgebaute Items aus den gemerkten Spielen, mit Anzahl und Siegquote
async function renderOwnItems() {
  const el = $('ownItems');
  const forChamp = champId;
  const d = forChamp ? await window.lol.ownItems(forChamp).catch(() => null) : null;
  if (forChamp !== champId) return;
  if (!d || !d.items.length) {
    el.innerHTML = '';
    return;
  }
  const mode = d.mode === 'aram' ? 'ARAM' : "Summoner's Rift";
  el.innerHTML = `<p class="hint">${t(d.games === 1 ? 'Deine meistgebauten Items ({n} Spiel, {mode})' : 'Deine meistgebauten Items ({n} Spiele, {mode})', { n: d.games, mode })}</p>
    <div class="icons">${d.items.map((i) => `<span class="own-item" title="${esc(i.name)}: ${t('{n}× gebaut, {pct} % Siege', { n: i.count, pct: Math.round((i.wins / i.count) * 100) })}">
      <img src="https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/item/${i.id}.png" alt="${esc(i.name)}"><small>${i.count}×</small></span>`).join('')}</div>
    <div class="btn-row"><button data-own="1">${t('Als meinen Build übernehmen')}</button></div>`;
}
window.lol.onOwnItems(() => champId && renderOwnItems());

function renderBuild() {
  const list = $('buildList');
  const ids = (buildData.builds[champId] || []);
  if (!ids.length) {
    list.innerHTML = `<li class="hint">${t('Noch kein Build. Füge unten Items in Kaufreihenfolge hinzu.')}</li>`;
    return;
  }
  list.innerHTML = ids.map((id, i) => {
    const it = buildData.items.find((x) => x.id === id) || { name: `#${id}`, gold: 0 };
    return `<li><img src="https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/item/${id}.png" alt="">
      <span class="name">${i + 1}. ${esc(it.name)}</span><span class="gold">${it.gold} g</span>
      <button data-act="up" data-i="${i}" aria-label="${esc(t('{item} nach oben', { item: it.name }))}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button data-act="down" data-i="${i}" aria-label="${esc(t('{item} nach unten', { item: it.name }))}" ${i === ids.length - 1 ? 'disabled' : ''}>↓</button>
      <button data-act="del" data-i="${i}" aria-label="${esc(t('{item} entfernen', { item: it.name }))}">✕</button></li>`;
  }).join('');
}

async function saveBuild(ids) {
  buildData.builds[champId] = ids;
  await window.lol.setBuild(champId, ids);
  renderBuild();
}

function renderRunes() {
  const r = buildData.runes[champId];
  const img = (x) => (x ? `<img src="${esc(x.icon)}" alt="${esc(x.name)}" title="${esc(x.name)}">` : '');
  $('runeView').innerHTML = r
    ? `<div class="rune-row"><span class="style">${esc(r.primary?.name || '')} / ${esc(r.sub?.name || '')}</span></div>
       <div class="rune-row">${img(r.primary)}${r.perks.map(img).join('')}${img(r.sub)}</div>`
    : `<p class="hint">${t('Für diesen Champion ist noch keine Runenseite gespeichert. Stell sie im Client ein und klick „Aktuelle Runenseite speichern“.')}</p>`;
}

// lolalytics-Vorschlag unter Build und Runen, mit Quelle und „Übernehmen“
const LANE_NAMES = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', support: 'Support' };
async function renderSuggestion(load = false) {
  const b = $('buildSuggestion');
  b.innerHTML = '';
  $('spellView').innerHTML = `<p class="hint">${t('Empfehlung kommt beim Pick in der Champ-Auswahl.')}</p>`;
  if (buildData.suggestions && champId) {
    try {
      const s = await window.lol.suggestion(champId, load);
      if (!s) {
        b.innerHTML = `<p class="hint">${t('Noch kein Vorschlag geladen. Er kommt automatisch beim Pick in der Champ-Auswahl.')}</p><div class="btn-row"><button id="loadSuggestion">${t('Jetzt von lolalytics laden')}</button></div>`;
      } else {
        const icon = (id) => `<img src="https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/item/${id}.png" alt="" title="${esc(buildData.items.find((x) => x.id === id)?.name || '')}">`;
        b.innerHTML = `<p class="hint">${t('Vorschlag von {link} ({lane}, Emerald+, Stand {date})', {
          link: `<a href="#" data-url="${esc(s.url)}">lolalytics.com</a>`, lane: esc(LANE_NAMES[s.lane] || t('Standard-Rolle')),
          date: new Date(s.fetchedAt).toLocaleDateString(i18n.locale()) })}</p>
          <div class="icons">${s.starting.map(icon).join('')}<span class="sep">›</span>${s.items.map(icon).join('')}</div>
          <div class="btn-row"><button data-take="build">${t('Als meinen Build übernehmen')}</button></div>`;
        if (s.spells.length) {
          $('spellView').innerHTML = `<div class="icons">${s.spells.map((x) => `<img src="${esc(x.icon)}" alt="${esc(x.name)}" title="${esc(x.name)}"><span class="label">${esc(x.name)}</span>`).join('')}</div>
            <p class="hint">${t('Meistgespielt laut lolalytics.com')}</p>`;
        }
      }
    } catch (e) {
      b.innerHTML = `<p class="hint">lolalytics.com: ${esc(e.message)}</p>`;
    }
  }
  renderRuneOptions();
}

// Mehrere Runenseiten zur Auswahl (lolalytics + Riot-Empfehlungen): „Setzen“ schreibt sie sofort auf die
// Seite „Farmy“, „Merken“ speichert sie als deine Runen für diesen Champion
async function renderRuneOptions() {
  const r = $('runeSuggestion');
  const forChamp = champId;
  const options = forChamp ? await window.lol.runeOptions(forChamp).catch(() => []) : [];
  if (forChamp !== champId) return; // inzwischen anderer Champion gewählt
  const img = (x) => (x ? `<img src="${esc(x.icon)}" alt="${esc(x.name)}" title="${esc(x.name)}">` : '');
  r.innerHTML = options.length
    ? `<p class="hint">${t('Runenseiten zur Auswahl')}</p>${options.map((o, i) => `
        <div class="rune-option">
          <div class="icons">${o.runes.perks.slice(0, 6).map(img).join('')}</div>
          <span class="label">${esc(o.runes.primary?.name || '')} / ${esc(o.runes.sub?.name || '')}<br>
            ${o.url ? `<a href="#" data-url="${esc(o.url)}">${esc(o.source)}</a>` : esc(o.source)}</span>
          <button data-rune="${i}">${t('Setzen')}</button><button data-rune="${i}" data-save="1">${t('Merken')}</button>
        </div>`).join('')}`
    : '';
}
document.querySelectorAll('.suggestion').forEach((el) => el.addEventListener('click', async (e) => {
  const link = e.target.closest('a[data-url]');
  if (link) {
    e.preventDefault();
    return window.lol.openSource(link.dataset.url);
  }
  if (e.target.id === 'loadSuggestion') return renderSuggestion(true);
  const option = e.target.closest('button[data-rune]');
  if (option && champId) {
    try {
      runeStatus(await window.lol.useRuneOption(champId, Number(option.dataset.rune), !!option.dataset.save));
      if (option.dataset.save) {
        buildData = await window.lol.buildData();
        renderRunes();
      }
    } catch (e) {
      runeStatus(`${t('Fehler')}: ${errText(e)}`);
    }
    return;
  }
  if (e.target.closest('button[data-own]') && champId) {
    try {
      await window.lol.takeOwnItems(champId);
    } catch (err) {
      return buildStatus(errText(err));
    }
    buildData = await window.lol.buildData();
    return renderBuild();
  }
  const take = e.target.closest('button[data-take]');
  if (!take || !champId) return;
  await window.lol.takeSuggestion(champId, take.dataset.take);
  buildData = await window.lol.buildData();
  renderBuild();
  renderRunes();
}));
$('suggestionsOn').addEventListener('change', async () => {
  buildData.suggestions = $('suggestionsOn').checked;
  await window.lol.setSuggestions(buildData.suggestions);
  renderSuggestion();
});
window.lol.onSuggestion((id) => id === champId && renderSuggestion());
$('openInChampSelect').addEventListener('change', () => window.lol.setOpenInChampSelect($('openInChampSelect').checked));
$('autoAccept').addEventListener('change', () => window.lol.setAutoAccept($('autoAccept').checked));
window.lol.onAutoAccept((on) => ($('autoAccept').checked = on));
const buildStatus = (msg) => ($('buildStatus').textContent = msg);
$('importItemSet').addEventListener('click', async () => {
  if (!champId) return;
  try {
    buildStatus(await window.lol.importItemSet(champId));
  } catch (e) {
    buildStatus(`${t('Fehler')}: ${errText(e)}`);
  }
});
$('itemSetAuto').addEventListener('change', () => window.lol.setItemSetAuto($('itemSetAuto').checked));
window.lol.onBuildStatus(buildStatus);

// ARAM-Bank: dein Champ und die Bank nach ARAM-Siegrate; ab 2 Prozentpunkten Vorsprung „Tausch lohnt sich“.
// Klick auf einen Champ zeigt seinen Build und seine Runen.
const pct = (v) => `${dec(v, 1)} %`;
function renderBench(info) {
  $('benchCard').hidden = !info;
  if (!info) return;
  const mine = info.list.find((c) => c.mine);
  $('benchList').innerHTML = info.list.map((c) => {
    const diff = mine && mine.wr != null && c.wr != null && !c.mine ? c.wr - mine.wr : null;
    const better = diff != null && diff >= 2;
    return `<div class="bench-row${c.mine ? ' mine' : ''}${better ? ' better' : ''}" data-champ="${esc(c.id)}">
      <img src="${esc(c.icon)}" alt=""><span class="name">${esc(c.name)}${c.mine ? ` <small>(${t('du')})</small>` : ''}</span>
      <b>${c.wr == null ? '–' : pct(c.wr)}</b>
      <span class="diff">${better ? t('Tausch lohnt sich (+{pct})', { pct: pct(diff) }) : diff != null ? `${diff >= 0 ? '+' : ''}${pct(diff)}` : ''}</span>
    </div>`;
  }).join('');
  $('benchSource').innerHTML = t('ARAM-Siegrate von {link}, Stand {date}. Tauschen musst du selbst im Client.', {
    link: `<a href="#" data-url="${esc(info.url)}">lolalytics.com</a>`, date: new Date(info.fetchedAt).toLocaleDateString(i18n.locale()) });
}
$('benchCard').addEventListener('click', (e) => {
  const link = e.target.closest('a[data-url]');
  if (link) {
    e.preventDefault();
    return window.lol.openSource(link.dataset.url);
  }
  const row = e.target.closest('[data-champ]');
  if (row) selectChampion(row.dataset.champ);
});
window.lol.onBench(renderBench);
window.lol.bench().then(renderBench);

$('champInput').addEventListener('change', () => {
  const c = champByName.get($('champInput').value.trim().toLowerCase());
  if (c) selectChampion(c.id);
});
$('addItem').addEventListener('click', () => {
  const it = itemByName.get($('itemInput').value.trim().toLowerCase());
  if (!it || !champId) return;
  $('itemInput').value = '';
  saveBuild([...(buildData.builds[champId] || []), it.id]);
});
$('itemInput').addEventListener('keydown', (e) => e.key === 'Enter' && $('addItem').click());
$('buildList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const ids = [...(buildData.builds[champId] || [])];
  const i = Number(b.dataset.i);
  if (b.dataset.act === 'del') ids.splice(i, 1);
  if (b.dataset.act === 'up') [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
  if (b.dataset.act === 'down') [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
  saveBuild(ids);
});
const runeStatus = (msg) => ($('runeStatus').textContent = msg);
$('saveRunes').addEventListener('click', async () => {
  if (!champId) return;
  try {
    buildData.runes[champId] = await window.lol.saveRunes(champId);
    renderRunes();
    runeStatus(t('Gespeichert.'));
  } catch (e) {
    runeStatus(`${t('Fehler')}: ${errText(e)}`);
  }
});
$('applyRunes').addEventListener('click', async () => {
  if (!champId) return;
  try {
    runeStatus(await window.lol.applyRunes(champId));
  } catch (e) {
    runeStatus(`${t('Fehler')}: ${errText(e)}`);
  }
});
$('runesAuto').addEventListener('change', () => window.lol.setRunesAuto($('runesAuto').checked));
$('spellsAuto').addEventListener('change', () => window.lol.setSpellsAuto($('spellsAuto').checked));
const spellStatus = (msg) => ($('spellStatus').textContent = msg);
$('applySpells').addEventListener('click', async () => {
  try {
    spellStatus(await window.lol.applySpells());
  } catch (e) {
    spellStatus(`${t('Fehler')}: ${errText(e)}`);
  }
});
window.lol.onSpellsStatus((msg) => spellStatus(msg));

// ☰: dasselbe Menü wie am Tray-Icon, direkt unter dem Knopf
$('menuBtn').addEventListener('click', () => {
  const r = $('menuBtn').getBoundingClientRect();
  window.lol.popupMenu({ x: Math.round(r.left), y: Math.round(r.bottom + 4) });
});

// Benutzt: dann bleibt das Fenster beim Spielstart offen (sonst schließt die App es, wenn sie es selbst geöffnet hat)
for (const ev of ['mousedown', 'keydown', 'wheel']) window.addEventListener(ev, () => window.lol.statsUsed(), { once: true });
window.lol.onBuildChampion((id) => selectChampion(id));
window.lol.onRunesStatus((msg) => runeStatus(msg));

async function loadAll() {
  ddVersion = await window.lol.ddVersion();
  const state = $('clientState');
  try {
    const me = await window.lol.summoner();
    $('who').textContent = me.gameName ? `${me.gameName}#${me.tagLine}` : me.displayName;
    state.className = 'client-state on';
    state.lastElementChild.textContent = t('Client verbunden');
  } catch {
    $('who').textContent = '–';
    state.className = 'client-state off';
    state.lastElementChild.textContent = t('Client nicht verbunden');
  }
  const [inGame] = await Promise.all([renderLive(), renderEog(), renderHistory(), loadBuild()]);
  // läuft gerade ein Spiel, direkt den Live-Tab zeigen
  if (inGame && !loadAll.done) showTab('live');
  loadAll.done = true;
}

// Seitentitel und Untertitel je Reiter
const PAGES = {
  live: ['Live-Spiel', 'Alle 10 Spieler mit Rang, Items und Werten, sobald ein Spiel läuft'],
  eog: ['Letztes Spiel', 'Auswertung direkt nach dem Spiel'],
  history: ['Verlauf', 'Deine letzten Spiele'],
  build: ['Build & Runen', 'Eigene Einstellungen haben immer Vorrang vor Vorschlägen'],
};
function showTab(tab) {
  [$('pageTitle').textContent, $('pageSub').textContent] = PAGES[tab].map((s) => t(s));

  document.querySelectorAll('nav button[data-tab]').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
  document.querySelectorAll('main section').forEach((s) => (s.hidden = s.id !== tab));
  if (tab === 'live') renderLive();
}
document.querySelectorAll('nav button[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
window.lol.onShowTab(showTab); // Champ-Auswahl öffnet direkt „Build & Runen“
$('reload').addEventListener('click', loadAll);
loadAll();

// Fensterknöpfe (Fenster ohne Windows-Rahmen)
$('winMin').addEventListener('click', () => window.lol.statsWindow('min'));
$('winClose').addEventListener('click', () => window.lol.statsWindow('close'));
