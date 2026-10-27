const $ = (id) => document.getElementById(id);
i18n.setLang(window.lol.lang);
i18n.translatePage(document);
// Entwicklerversion: Name und lila Logo, damit man sie von der installierten App unterscheidet
if (window.lol.dev) {
  document.title = 'FarmyDevBuild';
  document.querySelector('.brand .logo').src = '../assets/icon-dev.png';
  document.querySelector('.brand span').textContent = 'FarmyDevBuild';
  // Meme: Klick aufs Logo legt 23× „Farmy“ in die Zwischenablage
  const logo = document.querySelector('.brand .logo');
  logo.style.cursor = 'pointer';
  logo.style.webkitAppRegion = 'no-drag'; // die Seitenleiste ist Zieh-Fläche fürs Fenster, dort kämen Klicks nicht an
  logo.title = '23× Farmy';
  logo.addEventListener('click', async () => {
    const name = document.querySelector('.brand span');
    try {
      await navigator.clipboard.writeText(Array(23).fill('Farmy').join(' '));
      name.textContent = '23× Farmy kopiert';
    } catch {
      name.textContent = 'Zwischenablage gesperrt';
    }
    setTimeout(() => (name.textContent = 'FarmyDevBuild'), 1500);
  });
}
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
    if (!eog) throw new Error('keine Daten');
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

  let html = await reviewHtml(eog, ls, won) + `<div class="summary">
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

// Rückblick (wie ein Coach-Report): dieses Spiel gegen deinen Schnitt auf derselben Map, dazu Farmys Protokoll
// (CS bei 10 min gegen Perfekt-CS, Schadensarten deiner Tode, Ulti ungenutzt), eigene Rekorde und das Session-Ziel
async function reviewHtml(eog, ls, won) {
  let r;
  try {
    r = await window.lol.review(eog.gameId);
  } catch {
    return '';
  }
  const map = eog.gameMode === 'CLASSIC' ? 11 : ['ARAM', 'KIWI'].includes(eog.gameMode) ? 12 : null;
  const me = { cs: (ls.MINIONS_KILLED || 0) + (ls.NEUTRAL_MINIONS_KILLED || 0), k: ls.CHAMPIONS_KILLED || 0, d: ls.NUM_DEATHS || 0,
    a: ls.ASSISTS || 0, vis: ls.VISION_SCORE || 0, dmg: ls.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0, dur: eog.gameLength || 0 };
  const base = (r.games || []).filter((g) => g.map === map && g.cs != null && String(g.id) !== String(eog.gameId));
  const lines = [];
  const chips = [];
  const skills = base.length >= 5 ? SKILLS.filter((s) => !s.set && (!s.maps || s.maps.includes(map)) && me[s.needs || 'cs'] != null).map((s) => {
    const list = base.filter((g) => !s.needs || g[s.needs] != null);
    if (list.length < 5) return null;
    const v = s.val(me), b = mean(list.map(s.val));
    const better = b ? ((v - b) / b) * (s.lower ? -1 : 1) : 0;
    // Rekord: besser als jedes bisherige Spiel (ab 10 Spielen), sonst unter deinen besten 10 %
    const vals = list.map(s.val).sort((x, y) => (s.lower ? x - y : y - x));
    const record = list.length >= 10 && (s.lower ? v < vals[0] : v > vals[0]);
    const top = !record && list.length >= 10 && (s.lower ? v <= vals[Math.floor(vals.length * 0.1)] : v >= vals[Math.floor(vals.length * 0.1)]);
    if (record) chips.push(`<span class="chip rec">${t('Rekord')}: ${t(s.label)}</span>`);
    else if (top) chips.push(`<span class="chip">${t('Top 10 %')}: ${t(s.label)}</span>`);
    return { ...s, v, b, better };
  }).filter(Boolean) : [];
  const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} %`;
  const good = skills.filter((s) => s.better > 0.05).sort((a, b) => b.better - a.better).slice(0, 2);
  const bad = skills.filter((s) => s.better < -0.05).sort((a, b) => a.better - b.better).slice(0, 2);
  if (good.length) lines.push(['good', t('Gut'), good.map((s) => `${t(s.label)} ${dec(s.v, s.digits)} ${t(s.unit)} (${pct(s.better)})`).join(' · ')]);
  if (bad.length) lines.push(['bad', t('Hat gekostet'), bad.map((s) => `${t(s.label)} ${dec(s.v, s.digits)} ${t(s.unit)} (${pct(s.better)})`).join(' · ')]);
  if (bad.length) lines.push(['', t('Zuerst verbessern'), t(map === 12 && bad[0].tipAram ? bad[0].tipAram : bad[0].tip)]);
  const log = r.log;
  if (log && log.cs10 != null && log.perfect10) {
    lines.push(['', t('CS bei 10 min'), t('{cs} von {max} möglich ({p} %)', { cs: log.cs10, max: log.perfect10, p: Math.round((log.cs10 / log.perfect10) * 100) })]);
  }
  const read = log ? log.deaths.filter((d) => d.phys != null) : [];
  if (read.length) {
    const w = (d) => d.total || 1;
    const sum = read.reduce((a, d) => a + w(d), 0);
    const mix = (k) => Math.round(read.reduce((a, d) => a + d[k] * w(d), 0) / sum);
    const [ph, mg] = [mix('phys'), mix('magic')];
    const hint = ph >= 60 ? t('Rüstung wäre eine Option.') : mg >= 60 ? t('Magieresistenz wäre eine Option.') : t('Gemischter Schaden.');
    lines.push(['', t('Deine Tode'), `${t('{n} gelesen: {p} % physisch, {m} % magisch, {e} % echt.', { n: read.length, p: ph, m: mg, e: mix('true') })} ${hint}`]);
  }
  // Gold beim Tod, live gemessen: viel Gold beim Sterben heißt meist zu spät zum Shop
  if (log && log.died && log.died.length) {
    const golds = log.died.map((d) => d.gold);
    const rich = golds.filter((g) => g >= RICH_GOLD).length;
    const often = rich * 2 >= golds.length && rich >= 2;
    lines.push([often ? 'bad' : '', t('Gold beim Tod'), t('Ø {g} g · {r} von {n} Toden mit {min}+ g in der Tasche.', { g: n(Math.round(mean(golds))), r: rich, n: golds.length, min: n(RICH_GOLD) }) +
      (often ? ` ${t('Vor riskanten Kämpfen erst einkaufen.')}` : '')]);
  }
  // Spielverlauf aus dem Client: wann du gestorben bist und wie die Lane bei 10/15 min stand
  const tl = r.tl;
  if (tl && tl.deaths.length) lines.push(['', t('Tode bei'), tl.deaths.map(dur).join(', ')]);
  if (tl && tl.opp10) {
    const oc = await window.lol.champion(tl.oppChamp).catch(() => null);
    lines.push(['', t('Lane-Duell'), duelText(tl, oc)]);
  }
  if (log && log.ult && log.ult.readySec >= 60) {
    lines.push(['', t('Ulti'), t('{t} bereit und ungenutzt (längste Phase {l})', { t: dur(log.ult.readySec), l: dur(log.ult.longestSec) })]);
  }
  // Session-Ziel: nur, wenn es vor diesem Spiel gesetzt war; das Ergebnis zählt für Serie und Quote
  const g = r.goal;
  if (g && (!g.map || g.map === map) && g.since <= Date.now() - me.dur * 1000) {
    const now = { deaths: me.d, csm: me.cs / gmins(me), kda: kdaOf(me), vision: me.vis / gmins(me) }[g.key];
    const ok = g.key === 'deaths' ? now <= g.target : now >= g.target;
    window.lol.goalResult(eog.gameId, ok).catch(() => {});
    const f = (v) => (g.key === 'deaths' ? String(v) : dec(v, g.key === 'vision' ? 2 : 1));
    lines.push([ok ? 'good' : 'bad', t('Session-Ziel'), `${t(GOAL_TEXT[g.key], { n: f(g.target) })}: ${f(now)} ${ok ? '✓' : '✗'}`]);
  }
  // Tagebuch: „Was nehme ich mit?“ landet datiert in den Notizen des Champions
  const champ = await window.lol.champion((eog.localPlayer || {}).championId).catch(() => null);
  let learn = '';
  if (champ && champ.id) {
    const all = await window.lol.notes().catch(() => ({}));
    const entry = ((all[champ.id] || {}).journal || []).find((j) => String(j.gameId) === String(eog.gameId));
    learn = `<div class="learn"><label for="learnText">${t('Was nehme ich mit? ({champ})', { champ: esc(champ.name) })}</label>` +
      `<textarea id="learnText" spellcheck="false" placeholder="${esc(t('z. B. „Nach dem ersten Item früher zurück, nicht mit 1.500 Gold sterben“'))}">${esc(entry ? entry.text : '')}</textarea>` +
      `<div class="learn-row"><button id="learnSave" class="ghost" data-champ="${esc(champ.id)}" data-game="${esc(eog.gameId)}" data-win="${won ? 1 : 0}">${t('Speichern')}</button>` +
      `<span id="learnState" class="hint">${entry ? t('in deinen Notizen zu {champ}', { champ: esc(champ.name) }) : ''}</span></div></div>`;
  }
  return `<div class="card review"><div class="card-head"><h2>${t('Rückblick')}</h2>${chips.join('')}</div>` +
    lines.map(([cls, label, text]) => `<div class="rv-row"><span class="rv-label ${cls}">${label}</span><span>${esc(text)}</span></div>`).join('') +
    (base.length < 5 ? `<p class="hint">${t('Vergleich mit deinem Schnitt ab 5 Spielen auf dieser Map.')}</p>` : '') + learn + '</div>';
}
$('eog').addEventListener('click', async (e) => {
  const b = e.target.closest('#learnSave');
  if (!b) return;
  notesData = await window.lol.noteLearn(b.dataset.champ, { gameId: b.dataset.game, win: b.dataset.win === '1', text: $('learnText').value });
  $('learnState').textContent = $('learnText').value.trim() ? t('gespeichert') : t('gelöscht');
  drawNoteList();
  if (noteKey === b.dataset.champ) openNote(noteKey);
  renderNoteCard();
});
const RICH_GOLD = 1000; // ab so viel Gold in der Tasche zählt ein Tod als „mit Gold gestorben“
const sgn = (v) => `${v > 0 ? '+' : ''}${n(v)}`;
// „gegen Darius · 10 min: CS +12, Gold +450, Level +1 · 15 min: …“
function duelText(tl, oc) {
  const part = (a, b, m) => (a && b ? `${m} min: CS ${sgn(a.cs - b.cs)}, Gold ${sgn(a.gold - b.gold)}, Level ${sgn(a.lvl - b.lvl)}` : null);
  return [t('gegen {c}', { c: oc ? oc.name : '?' }), part(tl.at10, tl.opp10, 10), part(tl.at15, tl.opp15, 15)].filter(Boolean).join(' · ');
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

// --- Fortschritt: deine letzten Spiele gegen deinen eigenen Schnitt, wie ein Coach, aber nur mit eigenen Daten
// (Farmys gemerkte Spiele, nicht nur die 20 des Clients). Kein Vergleich mit anderen Spielern: Riot erlaubt
// Nach-dem-Spiel-Analyse, und für „besser werden“ zählt ohnehin der Abstand zu dir selbst ---
const RECENT = 10; // „zuletzt“ = die letzten 10 Spiele, verglichen mit allen davor
const gmins = (g) => Math.max(g.dur / 60, 1);
const SKILLS = [
  // Farmen und Sicht nur auf der Kluft: im ARAM gibt es kaum CS-Druck und fast nichts zu warden
  { key: 'farm', label: 'Farmen', unit: 'CS/min', digits: 1, maps: [11], val: (g) => g.cs / gmins(g),
    tip: 'Im Practice Tool 10 Minuten nur Last-Hits üben und beim Recall auf eine volle Welle achten.' },
  { key: 'fight', label: 'Kämpfen', unit: 'KDA', digits: 2, val: (g) => (g.k + g.a) / Math.max(g.d, 1),
    tip: 'Nur in Kämpfe gehen, wenn Summoner und Ulti bereit sind; Kills zählen mit, Assists auch.' },
  { key: 'survive', label: 'Überleben', unit: 'Tode/10 min', digits: 1, lower: true, val: (g) => (g.d / gmins(g)) * 10,
    tip: 'Vor jedem Schritt über die Flussmitte auf die Minimap schauen; ohne Sicht auf den Gegner-Jungler zurückhalten.',
    tipAram: 'Nicht als Erster vorne stehen, solange deine Tanks noch nicht drin sind, und Gesundheitspakete erst nehmen, wenn du sie brauchst.' },
  { key: 'vision', label: 'Sicht', unit: 'Sicht/min', digits: 2, needs: 'vis', maps: [11], val: (g) => g.vis / gmins(g),
    tip: 'Trinket nie voll liegen lassen und bei jedem Recall eine Kontrollwarde kaufen.' },
  { key: 'damage', label: 'Schaden', unit: 'Schaden/min', digits: 0, needs: 'dmg', val: (g) => g.dmg / gmins(g),
    tip: 'In Kämpfen dranbleiben und alle Fähigkeiten loswerden, statt früh rauszulaufen.' },
  { key: 'obj', label: 'Objectives', unit: 'Obj.-Schaden/min', digits: 0, needs: 'obj', maps: [11], val: (g) => g.obj / gmins(g),
    tip: 'Nach einem gewonnenen Kampf oder Kill direkt Turm, Drache oder Herold nehmen statt zurück in die Lane.' },
  // Konstanz: wie stark deine KDA von Spiel zu Spiel schwankt (Variationskoeffizient), weniger ist besser
  { key: 'steady', label: 'Konstanz', unit: '% Schwankung', digits: 0, lower: true, set: (list) => cv(list.map(kdaOf)) * 100,
    tip: 'Vor jedem Spiel denselben Plan: sicher farmen bis zum ersten Item-Spike, erst dann auf Kämpfe gehen.' },
];
const kdaOf = (g) => (g.k + g.a) / Math.max(g.d, 1);
// Aggression (wie bei Mobalytics): wie viel du an Kills beteiligt bist, unabhängig von deinen Toden
SKILLS.splice(2, 0, { key: 'aggr', label: 'Aggression', unit: 'Kills+Assists/10 min', digits: 1, val: (g) => ((g.k + g.a) / gmins(g)) * 10,
  tip: 'Mehr an Kämpfen deines Teams teilnehmen: nach dem Push zur nächsten Gruppe statt allein weiterfarmen.',
  tipAram: 'Bei jedem Kampf von Anfang an dabei sein, nicht hinten warten, bis er entschieden ist.' });
// Woraus jeder Wert besteht (Skill-Details, wie „Metric Allocation“)
const HOW = {
  farm: 'Vasallen und Monster pro Spielminute.',
  fight: 'Kills plus Assists geteilt durch Tode, je Spiel.',
  aggr: 'Kills plus Assists pro 10 Spielminuten, unabhängig von deinen Toden.',
  survive: 'Tode pro 10 Spielminuten, weniger ist besser.',
  vision: 'Sichtwert (Wards gesetzt, zerstört, Sicht verweigert) pro Spielminute.',
  damage: 'Schaden an Champions pro Spielminute.',
  obj: 'Schaden an Türmen, Inhibitoren, Drachen, Baron und Herold pro Spielminute.',
  steady: 'Wie stark deine KDA von Spiel zu Spiel schwankt (Standardabweichung durch Mittelwert), weniger ist besser.',
};
for (const sk of SKILLS) sk.how = HOW[sk.key];
const cv = (a) => {
  const m = mean(a);
  return m ? Math.sqrt(mean(a.map((v) => (v - m) ** 2))) / m : 0;
};
// Skill → Session-Ziel (Schaden, Objectives, Konstanz zeigt die Live-API im Spiel nicht)
const GOALS = {
  survive: { key: 'deaths', text: 'Höchstens {n} Tode', make: (r) => Math.max(1, Math.floor(mean(r.map((g) => g.d)) * 0.85)) },
  farm: { key: 'csm', text: '{n} CS/min', make: (r) => Math.round(mean(r.map((g) => g.cs / gmins(g))) * 1.08 * 10) / 10 },
  fight: { key: 'kda', text: 'KDA {n}', make: (r) => Math.round(mean(r.map(kdaOf)) * 1.15 * 10) / 10 },
  vision: { key: 'vision', text: '{n} Sicht/min', make: (r) => Math.round(mean(r.map((g) => g.vis / gmins(g))) * 1.1 * 100) / 100 },
};
const GOAL_TEXT = Object.fromEntries(Object.values(GOALS).map((x) => [x.key, x.text]));
const PMODES = { 11: 'Kluft', 12: 'ARAM' };
// Modus-Gruppen nach Queue-ID des Clients; „Kluft (alle)“ fasst alle Queues auf Summoner's Rift zusammen.
// Swiftplay hatte 27.10. die Queue 880 (früher 480)
const PQUEUES = [
  ['rift', 'Kluft (alle)', 11, null],
  ['solo', 'Solo/Duo', 11, [420]],
  ['flex', 'Flex', 11, [440]],
  ['normal', 'Normal', 11, [400, 430, 490]],
  ['swift', 'Swiftplay', 11, [480, 880]],
  ['aram', 'ARAM', 12, [450]],
  ['mayhem', 'ARAM Mayhem', 12, [2400]],
];
const ROLES = [['top', 'Top'], ['jungle', 'Jungle'], ['middle', 'Mid'], ['bottom', 'ADC'], ['utility', 'Support']];
const inQueue = (g, q) => g.map === q[2] && (!q[3] || q[3].includes(g.queue));
// Rolle: aus Farmys Spielprotokoll (Live-API, zuverlässig), sonst die Lane-Angabe des Clients
const roleOf = (g) => (progLogs.find((l) => String(l.gameId) === String(g.id)) || {}).position || g.lane || '';
let progQueue = null;
let progRole = 'all';
let progRange = 'all'; // 'all' | 50 | 20: nur die letzten N Spiele der Auswahl
let progDetail = null; // aufgeklappte Skill-Details (Skill-Key)
let progChamp = null; // Champion-Profil (Champion-Key)
let progGoalHistory = [];
let progGames = [];
let progLp = [];
let progTimelines = {}; // gameId -> Spielverlauf aus dem Client (src/timelines.js)
let progLogs = []; // Farmys Spielprotokolle (Gold beim Tod, Death Recap)
let progGoal = null;
let progMap = 11;
// Skill-Karten sind per Tastatur bedienbar (Enter/Leertaste wie ein Klick)
$('progress').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-skill]')) {
    e.preventDefault();
    e.target.click();
  }
});
$('progress').addEventListener('click', async (e) => {
  const g = e.target.closest('[data-goal]');
  if (g) {
    progGoal = await window.lol.goalSet(g.dataset.goal === 'none' ? null : { key: g.dataset.goal, target: Number(g.dataset.target), map: progMap });
    drawProgress();
    return;
  }
  const q = e.target.closest('[data-queue]');
  const r = e.target.closest('[data-role]');
  const rg = e.target.closest('[data-range]');
  const sk = e.target.closest('[data-skill]');
  const pr = e.target.closest('[data-prof]');
  if (q) {
    progQueue = q.dataset.queue;
    progRole = 'all';
    progChamp = null;
  } else if (r) progRole = r.dataset.role;
  else if (rg) progRange = rg.dataset.range === 'all' ? 'all' : Number(rg.dataset.range);
  else if (sk) progDetail = progDetail === sk.dataset.skill ? null : sk.dataset.skill;
  else if (pr) progChamp = pr.dataset.prof === '' || String(progChamp) === pr.dataset.prof ? null : pr.dataset.prof;
  else return;
  drawProgress();
});

async function renderProgress() {
  let list;
  try {
    const r = await window.lol.progress();
    [list, progLp, progGoal, progTimelines, progLogs] = [r.games, r.lp || [], r.goal, r.timelines || {}, r.logs || []];
    progGoalHistory = r.goalHistory || [];
  } catch {
    list = [];
  }
  // eigene Champions und alle Gegner aus den Spieldetails (für „Schwer für dich“)
  const keys = new Set([...list.map((g) => g.champ), ...Object.values(progTimelines).flatMap((tl) => tl.enemies || [])]);
  for (const id of keys) {
    if (!champCache.has(Number(id))) champCache.set(Number(id), await window.lol.champion(id).catch(() => null));
  }
  list.forEach((g) => (g.c = champCache.get(Number(g.champ))));
  progGames = list;
  // Start: Modus des letzten Spiels, wenn es dort genug Spiele für Skill-Verläufe und Fokus gibt; sonst der Modus mit
  // den meisten Spielen (vorher startete es z. B. in Swiftplay mit 2 Spielen, und alle Graphen fehlten).
  // Eine eigene Wahl bleibt, solange es Spiele dafür gibt
  const complete = list.filter((g) => g.cs != null);
  const last = complete[complete.length - 1];
  if (last && !(progQueue && complete.some((g) => inQueue(g, PQUEUES.find((x) => x[0] === progQueue))))) {
    const count = (q) => complete.filter((g) => inQueue(g, q)).length;
    const own = PQUEUES.slice(1).find((q) => inQueue(last, q));
    const biggest = PQUEUES.reduce((a, q) => (count(q) > count(a) ? q : a), PQUEUES[0]);
    progQueue = (own && count(own) >= RECENT + 5 ? own : biggest)[0];
  }
  drawProgress();
  renderNoteCard(); // Plan-Karte braucht Fokus und Session-Ziel
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// Skill-Bereiche: letzte 10 Spiele gegen alle davor; focus = der Bereich, der zuletzt am meisten nachgelassen hat
function rateSkills(games, map) {
  const recent = games.slice(-RECENT), before = games.slice(0, -RECENT);
  const skills = SKILLS.filter((s) => !s.maps || s.maps.includes(map)).map((s) => {
    const has = (g) => !s.needs || g[s.needs] != null;
    const r = recent.filter(has), b = before.filter(has);
    if (r.length < 5 || b.length < 5) return { ...s, missing: true };
    const agg = s.set || ((list) => mean(list.map(s.val)));
    const now = agg(r), base = agg(b);
    const delta = base ? (now - base) / base : 0;
    const better = s.lower ? -delta : delta; // > 0 = besser als dein Schnitt
    // gleitender Schnitt über 5 Spiele: zeigt die Richtung, nicht jedes Ausreißer-Spiel
    const all = games.filter(has);
    const rolling = all.map((_, i) => agg(all.slice(Math.max(0, i - 4), i + 1))).slice(4);
    return { ...s, now, base, better, rolling, tip: map === 12 && s.tipAram ? s.tipAram : s.tip };
  });
  const rated = skills.filter((s) => !s.missing);
  const focus = rated.reduce((a, s) => (!a || s.better < a.better ? s : a), null);
  return { recent, before, skills, rated, focus };
}

function drawProgress() {
  const el = $('progress');
  // Einträge vor dem 27.10. haben teils nur Items (keine K/D/A, CS): die zählen hier nicht
  const complete = progGames.filter((g) => g.cs != null);
  const groups = PQUEUES.filter((q) => complete.some((g) => inQueue(g, q)));
  const queue = groups.find((q) => q[0] === progQueue) || groups[0] || PQUEUES[0];
  progMap = queue[2];
  const inMode = complete.filter((g) => inQueue(g, queue));
  const roles = progMap === 11 ? ROLES.filter(([r]) => inMode.some((g) => roleOf(g) === r)) : [];
  if (!roles.some(([r]) => r === progRole)) progRole = 'all';
  const byRole = progRole === 'all' ? inMode : inMode.filter((g) => roleOf(g) === progRole);
  const games = progRange === 'all' ? byRole : byRole.slice(-progRange);
  // alle Modi zeigen, auch ohne Spiele (ausgegraut): sonst fragt man sich, wo z. B. Solo/Duo geblieben ist
  const seg = `<div class="seg" role="group" aria-label="${t('Spielmodus')}">${PQUEUES.map((q) => {
    const count = complete.filter((g) => inQueue(g, q)).length;
    return `<button data-queue="${q[0]}" aria-pressed="${q === queue}"${count ? '' : ` disabled title="${esc(t('Noch keine Spiele, seit Farmy mitschreibt'))}"`}>${t(q[1])} <small>${count}</small></button>`;
  }).join('')}</div>` +
    (roles.length ? `<div class="seg roles" role="group" aria-label="${t('Rolle')}">${[['all', 'Alle Rollen'], ...roles].map(([r, label]) =>
      `<button data-role="${r}" aria-pressed="${r === progRole}">${t(label)} <small>${r === 'all' ? inMode.length : inMode.filter((g) => roleOf(g) === r).length}</small></button>`).join('')}</div>` +
      `<p class="hint role-hint">${t('Rolle ab jetzt aus dem Spiel; bei älteren Spielen laut Client, bei Blind und Swiftplay nicht immer genau.')}</p>` : '') +
    `<div class="seg roles" role="group" aria-label="${t('Zeitraum')}">${[[20, 'Letzte 20'], [50, 'Letzte 50'], ['all', 'Alle Spiele']].map(([v, label]) =>
      `<button data-range="${v}" aria-pressed="${v === progRange}"${v !== 'all' && byRole.length <= v ? ' disabled' : ''}>${t(label)}</button>`).join('')}</div>`;
  // Ohne Spiele in dieser Auswahl nichts; unter 15 Spielen fehlen nur Skill-Vergleich, Fokus und Ziel-Vorschläge
  if (!games.length) {
    el.innerHTML = seg + `<div class="msg">${t('Keine Spiele gefunden.')}</div>`;
    return;
  }
  const rest = `<h3 class="sec-title">${t('Siege gegen Niederlagen')}</h3>${winLossCard(games, progMap)}` +
    `<h3 class="sec-title">${t('Wann du stirbst')}</h3>${deathCard(games)}` +
    (progMap === 11 ? `<h3 class="sec-title">${t('Lane-Duell')}</h3>${duelCard(games)}` : '') +
    `<h3 class="sec-title">${t('Gegen wen du verlierst')}</h3>${enemyCard(games)}` +
    `<h3 class="sec-title">${t('Nach Niederlagen')}</h3>${tiltCard(games)}` +
    `<h3 class="sec-title">${t('Wann du gewinnst')}</h3><div class="wins-grid">${winBlocks(games).join('')}</div>` +
    `<h3 class="sec-title">${t('Champion-Pool')}</h3>${champPool(games)}${champProfile(games, progMap)}` +
    `<h3 class="sec-title">${t('Rekorde')}</h3>${recordsCard(games, progMap)}`;
  if (games.length < RECENT + 5) {
    el.innerHTML = seg + weekCard(games) + lpCard() +
      `<div class="msg">${t('Noch zu wenige Spiele für einen Vergleich ({n} von {need}). Farmy merkt sich jedes Spiel, schau nach ein paar Runden wieder rein.', { n: games.length, need: RECENT + 5 })}</div>` + rest;
    return;
  }
  const { recent, before, skills, rated, focus } = rateSkills(games, progMap);
  const wr = (list) => Math.round((list.filter((g) => g.win).length / list.length) * 100);

  const tiles = `<div class="summary">
    <div class="tile"><label>${t('Spiele gemerkt')}</label><b>${games.length}</b></div>
    <div class="tile"><label>${t('Siegquote zuletzt')}</label><b>${wr(recent)} %</b><small class="tile-sub">${t('sonst {n} %', { n: wr(before) })}</small></div>
    <div class="tile"><label>${t('Stärke zuletzt')}</label><b>${t(rated.reduce((a, s) => (s.better > a.better ? s : a)).label)}</b></div>
    <div class="tile"><label>${t('Fokus')}</label><b class="loss">${t(focus.label)}</b></div>
  </div>`;

  const focusCard = focus && focus.better < 0 ? `<div class="card focus-card">
    <h2>${t('Dein Fokus: {skill}', { skill: t(focus.label) })}</h2>
    <p>${t('Zuletzt {now} {unit}, sonst {base}.', { now: dec(focus.now, focus.digits), unit: t(focus.unit), base: dec(focus.base, focus.digits) })}
    ${esc(t(focus.tip))}</p></div>` : '';

  el.innerHTML = seg + tiles + weekCard(games) + focusCard + goalCard(recent, rated) + lpCard() +
    `<h3 class="sec-title">${t('Skill-Bereiche · letzte {n} Spiele gegen deinen Schnitt davor', { n: RECENT })}</h3>` +
    `<div class="skills">${skills.map(skillCard).join('')}</div>` + detailCard(skills, games) +
    `<h3 class="sec-title">${t('Skill-Profil')}</h3>${profileCard(rated)}` + rest;
}

// Session-Ziel (wie eine Challenge): eins zur Zeit, im Spiel als Zeile im Panel, nach dem Spiel ✓/✗.
// Vorschläge aus deinen schwächsten Bereichen, jeweils etwas besser als dein Schnitt zuletzt
function goalCard(recent, rated) {
  const fmtT = (key, v) => (key === 'deaths' ? String(v) : dec(v, key === 'vision' ? 2 : 1));
  const g = progGoal;
  let head = `<p class="hint">${t('Ein Ziel für die nächsten Spiele: Farmy zeigt es im Panel und hakt es nach jedem Spiel ab.')}</p>`;
  if (g) {
    const res = g.results || [];
    let streak = 0;
    for (const r of res) streak = r.ok ? streak + 1 : 0;
    const last = res.slice(-5);
    head = `<p><b>${t(GOAL_TEXT[g.key], { n: fmtT(g.key, g.target) })}</b>${g.map ? ` · ${t(PMODES[g.map] || '')}` : ''}</p>` +
      `<p class="hint">${res.length ? t('{ok} von {n} der letzten Spiele geschafft · Serie {s}', { ok: last.filter((r) => r.ok).length, n: last.length, s: streak })
        : t('Noch kein Spiel mit diesem Ziel.')} ${last.map((r) => (r.ok ? '✓' : '✗')).join(' ')}</p>`;
  }
  const options = rated.filter((s) => GOALS[s.key] && (progMap === 11 || !['farm', 'vision'].includes(s.key))).sort((a, b) => a.better - b.better).slice(0, 3).map((s) => {
    const G = GOALS[s.key];
    const target = G.make(recent);
    return `<button class="ghost" data-goal="${G.key}" data-target="${target}">${t(G.text, { n: fmtT(G.key, target) })}</button>`;
  });
  if (g) options.push(`<button class="ghost" data-goal="none">${t('Kein Ziel')}</button>`);
  return `<div class="card goal-card"><h2>${t('Session-Ziel')}</h2>${head}<div class="goal-opts">${options.join('')}</div>${goalHistoryHtml()}</div>`;
}

// LP-Verlauf (Solo/Duo, sonst Flex): Rang als Zahl, gemerkt bei jeder Änderung
const TIER_NAMES = ['Eisen', 'Bronze', 'Silber', 'Gold', 'Platin', 'Smaragd', 'Diamant', 'Meister', 'Großmeister', 'Challenger'];
const rankName = (v) => {
  const tier = Math.min(9, Math.floor(v / 400));
  if (tier >= 7) return `${t(TIER_NAMES[tier])} ${v - 2800} LP`;
  return `${t(TIER_NAMES[tier])} ${['IV', 'III', 'II', 'I'][Math.floor((v % 400) / 100)]} · ${v % 100} LP`;
};
function lpCard() {
  for (const [q, label] of [['solo', 'Solo/Duo'], ['flex', 'Flex']]) {
    const pts = progLp.filter((p) => p[q] != null);
    if (pts.length < 2) continue;
    const vals = pts.map((p) => p[q]);
    const diff = vals[vals.length - 1] - vals[0];
    const W = 400, H = 70, pad = 6, min = Math.min(...vals), span = Math.max(...vals) - min || 1;
    const x = (i) => pad + (i * (W - 2 * pad)) / (vals.length - 1);
    const y = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
    const hits = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[q]).toFixed(1)}" r="6" fill="transparent"><title>${new Date(p.at).toLocaleDateString(i18n.locale())}: ${rankName(p[q])}</title></circle>`).join('');
    return `<div class="card lp-card"><div class="card-head"><h2>${t('LP-Verlauf')} · ${label}</h2>` +
      `<span><b>${rankName(vals[vals.length - 1])}</b> <small class="${diff >= 0 ? 'win' : 'loss'}">${diff >= 0 ? '+' : ''}${diff} LP</small></span></div>` +
      `<svg class="spark lp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${t('LP-Verlauf')}">` +
      `<polyline points="${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline>${hits}</svg></div>`;
  }
  return '';
}

// Wochenbericht: diese Woche (ab Montag) gegen letzte Woche, auf der gewählten Map; LP über alle Queues
function weekCard(games) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
  const lastMonday = monday - 7 * 864e5;
  const thisW = games.filter((g) => g.at >= monday), lastW = games.filter((g) => g.at >= lastMonday && g.at < monday);
  if (!thisW.length && !lastW.length) return '';
  const st = (list) => (!list.length ? null : {
    n: list.length, wr: Math.round((list.filter((g) => g.win).length / list.length) * 100),
    kda: list.reduce((a, g) => a + g.k + g.a, 0) / Math.max(list.reduce((a, g) => a + g.d, 0), 1),
    csm: list.reduce((a, g) => a + g.cs, 0) / list.reduce((a, g) => a + gmins(g), 0),
    dpm: (list.reduce((a, g) => a + g.d, 0) / list.reduce((a, g) => a + gmins(g), 0)) * 10,
  });
  const a = st(thisW), b = st(lastW);
  const rows = [['Spiele', 'n', 0], ['Siegquote', 'wr', 0, ' %'], ['KDA', 'kda', 2], ['CS/min', 'csm', 1], ['Tode/10 min', 'dpm', 1, '', true]];
  const cell = (x, k, d, suf = '') => (x ? `${dec(x[k], d)}${suf}` : '–');
  const arrow = (k, lower) => {
    if (!a || !b || k === 'n' || !b[k]) return '';
    const better = ((a[k] - b[k]) / b[k]) * (lower ? -1 : 1);
    return Math.abs(better) < 0.03 ? '' : better > 0 ? ' <span class="win">↑</span>' : ' <span class="loss">↓</span>';
  };
  // bester Champ der Woche: meiste Siege, dann meiste Spiele
  const by = new Map();
  for (const g of thisW) {
    const c = by.get(g.champ) || { c: g.c, n: 0, w: 0 };
    c.n++;
    if (g.win) c.w++;
    by.set(g.champ, c);
  }
  const best = [...by.values()].sort((x, y) => y.w - x.w || y.n - x.n)[0];
  // LP seit Montag (Solo/Duo, sonst Flex): letzter Stand vor Montag gegen jetzt
  let lp = '';
  for (const [q, label] of [['solo', 'Solo/Duo'], ['flex', 'Flex']]) {
    const pts = progLp.filter((x) => x[q] != null);
    const start = [...pts].reverse().find((x) => x.at < monday) || pts.find((x) => x.at >= monday);
    const end = pts[pts.length - 1];
    if (start && end && end.at >= monday && start !== end) {
      const d = end[q] - start[q];
      lp = `<span class="${d >= 0 ? 'win' : 'loss'}">${d >= 0 ? '+' : ''}${d} LP</span> ${label}`;
      break;
    }
  }
  return `<div class="card week"><div class="card-head"><h2>${t('Wochenbericht')}</h2><span class="hint">${t('seit Montag gegen letzte Woche')}</span></div>` +
    `<table class="pool"><thead><tr><th></th><th>${t('Diese Woche')}</th><th>${t('Letzte Woche')}</th></tr></thead><tbody>` +
    rows.map(([label, k, d, suf, lower]) => `<tr><td>${t(label)}</td><td>${cell(a, k, d, suf)}${arrow(k, lower)}</td><td>${cell(b, k, d, suf)}</td></tr>`).join('') +
    '</tbody></table>' +
    `<p class="week-foot">${best && best.c ? `${t('Champ der Woche')}: <b>${esc(best.c.name)}</b> (${best.w}/${best.n})` : ''}${best && lp ? ' · ' : ''}${lp}</p></div>`;
}

// Wann du stirbst: Tode je 10 Minuten Spielzeit in jeder Phase (aus den Spielverläufen des Clients, also auch
// rückwirkend), dazu Gold beim Tod und Schadensart je Phase aus Farmys Spielprotokoll, soweit vorhanden
const PHASES = [[0, 600, '0–10 min'], [600, 1200, '10–20 min'], [1200, 1800, '20–30 min'], [1800, Infinity, '30+ min']];
function deathCard(games) {
  const tls = games.map((g) => progTimelines[g.id]).filter(Boolean);
  if (tls.length < 3) return `<div class="card"><p class="hint">${t('Noch zu wenige Spielverläufe ({n} von 3). Farmy lädt sie aus dem Client, sobald er läuft.', { n: tls.length })}</p></div>`;
  const ph = PHASES.map(([lo, hi, label]) => {
    let mins = 0, deaths = 0;
    for (const tl of tls) {
      mins += Math.max(0, Math.min(tl.dur, hi) - lo) / 60;
      deaths += tl.deaths.filter((s) => s >= lo && s < hi).length;
    }
    return { lo, hi, label, mins, deaths, rate: mins >= 20 ? (deaths / mins) * 10 : null };
  });
  const shown = ph.filter((x) => x.rate != null);
  const max = Math.max(...shown.map((x) => x.rate), 0.1);
  const worst = shown.reduce((a, x) => (!a || x.rate > a.rate ? x : a), null);
  // Schadensart je Phase aus dem Death Recap (nur Spiele mit Farmy-Protokoll)
  const ids = new Set(games.map((g) => String(g.id)));
  const logs = progLogs.filter((l) => ids.has(String(l.gameId)));
  const recap = logs.flatMap((l) => (l.deaths || []).filter((d) => d.phys != null && d.gameTime != null));
  const mixOf = (x) => {
    const list = recap.filter((d) => d.gameTime >= x.lo && d.gameTime < x.hi);
    if (list.length < 3) return '';
    const m = (k) => Math.round(mean(list.map((d) => d[k])));
    const [p, g] = [m('phys'), m('magic')];
    return p >= 60 ? t('meist physisch ({p} %)', { p }) : g >= 60 ? t('meist magisch ({p} %)', { p: g }) : t('gemischt');
  };
  const rows = shown.map((x) => `<div class="wrow phase"><span>${x.label}</span>` +
    `<svg class="wtrack" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" rx="2" class="wbg"></rect>` +
    `<rect width="${Math.round((x.rate / max) * 100)}" height="8" rx="2" class="${x === worst ? 'wbad' : 'wfill'}"></rect></svg>` +
    `<small><b>${dec(x.rate, 1)}</b> · ${t('{n} Tode', { n: x.deaths })}${mixOf(x) ? ` · ${mixOf(x)}` : ''}</small></div>`).join('');
  // Gold beim Tod über alle protokollierten Spiele
  const golds = logs.flatMap((l) => (l.died || []).map((d) => d.gold));
  const gold = golds.length >= 3 ? `<p class="hint">${t('Gold beim Tod: Ø {g} g, {p} % deiner Tode mit {min}+ g in der Tasche ({n} Tode).', { g: n(Math.round(mean(golds))), p: Math.round((golds.filter((x) => x >= RICH_GOLD).length / golds.length) * 100), min: n(RICH_GOLD), n: golds.length })}</p>`
    : `<p class="hint">${t('Gold beim Tod misst Farmy ab jetzt in jedem Spiel live.')}</p>`;
  return `<div class="card deaths"><p class="deaths-head">${worst ? t('Am häufigsten stirbst du in Minute {p}: {r} Tode je 10 Minuten.', { p: worst.label.replace(' min', ''), r: dec(worst.rate, 1) }) : ''}</p>` +
    rows + `<p class="hint">${t('Tode je 10 Minuten Spielzeit in der Phase, aus {n} Spielverläufen.', { n: tls.length })}</p>${gold}</div>`;
}

// Lane-Duell (Kluft): CS-, Gold- und Level-Differenz zu deinem Lane-Gegner bei 10 und 15 Minuten. Nur Spiele, in
// denen der Gegner eindeutig ist (siehe src/timelines.js)
function duelCard(games) {
  const list = games.map((g) => progTimelines[g.id]).filter((tl) => tl && tl.opp10 && tl.at10);
  if (list.length < 3) return `<div class="card"><p class="hint">${t('Noch zu wenige Spiele mit eindeutigem Lane-Gegner ({n} von 3). Ab jetzt merkt sich Farmy deinen Gegner im Spiel.', { n: list.length })}</p></div>`;
  const avg = (key, m) => {
    const xs = list.filter((tl) => tl[`at${m}`] && tl[`opp${m}`]).map((tl) => tl[`at${m}`][key] - tl[`opp${m}`][key]);
    return xs.length ? { v: mean(xs), n: xs.length } : null;
  };
  const cell = (x, d) => (x ? `<span class="${x.v >= 0 ? 'win' : 'loss'}">${x.v >= 0 ? '+' : ''}${dec(x.v, d)}</span>` : '–');
  const row = (m) => `<tr><td>${m} min</td><td>${cell(avg('cs', m), 1)}</td><td>${cell(avg('gold', m), 0)}</td><td>${cell(avg('lvl', m), 1)}</td></tr>`;
  const golds = list.map((tl) => tl.at10.gold - tl.opp10.gold);
  const ahead = golds.filter((x) => x > 0).length;
  return `<div class="card duel"><p>${t('In {a} von {n} Spielen warst du bei 10 Minuten im Gold vorne.', { a: ahead, n: list.length })}</p>` +
    `<table class="pool"><thead><tr><th>${t('Ø Differenz')}</th><th>CS</th><th>Gold</th><th>Level</th></tr></thead><tbody>${row(10)}${row(15)}</tbody></table>` +
    spark(golds, { label: t('Gold-Differenz bei 10 min'), unit: 'g', digits: 0 }, 1) +
    `<p class="hint">${t('Gold-Differenz bei 10 Minuten je Spiel, gestrichelt dein Schnitt. {n} Spiele mit eindeutigem Gegner.', { n: list.length })}</p></div>`;
}

// --- Fortschritt, Ausbau nach Mobalytics-Vorbild (nur eigene Spiele): Skill-Profil jetzt gegen früher, Skill-Details,
// Siege gegen Niederlagen, Angstgegner, Nach Niederlagen, Champion-Profil und Vielseitigkeit, Rekorde, Ziel-Verlauf ---
const champCache = new Map(); // Champion-Key -> Data-Dragon-Champion (für Gegner, die du nie selbst gespielt hast)
const champOf = (key) => champCache.get(Number(key)) || null;
const better = (s, a, b) => (s.lower ? a < b : a > b);

// Skill-Profil wie „jetzt gegen früher“: beide Werte auf einer Skala 0–100, gemessen an deinen eigenen Fünf-Spiele-
// Schnitten (100 = so gut wie dein bester Abschnitt, 0 = wie dein schwächster). Kein Vergleich mit anderen Spielern
function profileCard(rated) {
  const score = (s, v) => {
    const r = s.rolling;
    if (!r || r.length < 3) return null;
    return Math.round((r.filter((x) => !better(s, x, v)).length / r.length) * 100);
  };
  const rows = rated.map((s) => ({ s, now: score(s, s.now), before: score(s, s.base) })).filter((x) => x.now != null && x.before != null);
  if (!rows.length) return '';
  return `<div class="card profile"><div class="card-head"><h2>${t('Skill-Profil')}</h2>` +
    `<span class="hint">${t('davor → zuletzt, 0–100 gemessen an deinen eigenen Fünf-Spiele-Abschnitten')}</span></div>` +
    `<div class="pgrid">${rows.length >= 3 ? radarSvg(rows) : ''}<div class="pbars">` +
    rows.map(({ s, now, before }) => `<div class="wrow prow" title="${esc(t('{label}: zuletzt {now}, davor {before}', { label: t(s.label), now, before }))}"><span>${t(s.label)}</span>` +
      `<svg class="ptrack" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect y="4" width="100" height="2" rx="1" class="wbg"></rect>` +
      `<line x1="${before}" x2="${now}" y1="5" y2="5" class="${now >= before ? 'pup' : 'pdown'}" vector-effect="non-scaling-stroke"></line></svg>` +
      `<small><span class="muted">${before}</span> → <b class="${now >= before ? 'win' : 'loss'}">${now}</b></small></div>`).join('') +
    // Punkte als HTML über dem SVG wären genauer; Kreise im gestauchten SVG würden zu Ellipsen, daher nur die Strecke
    `<p class="hint">${t('Grün: besser als in den Spielen davor, Rot: schlechter.')}</p></div></div></div>`;
}

// Netzdiagramm (wie das Skill-Hexagon bei Mobalytics): je Skill eine Achse von der Mitte (0) nach außen (100).
// Fläche = zuletzt, gestrichelt = davor. Gleiche Werte wie die Balken daneben, die bleiben als genaue Ablesung
function radarSvg(rows) {
  const n = rows.length, cx = 160, cy = 150, R = 105;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const rings = [25, 50, 75, 100].map((v) => `<polygon points="${poly(rows.map(() => v))}" class="rgrid"></polygon>`).join('');
  const axes = rows.map((_, i) => {
    const [x, y] = pt(i, 100);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="rgrid"></line>`;
  }).join('');
  const labels = rows.map(({ s, now }, i) => {
    const [x, y] = pt(i, 122);
    const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" class="rlabel">${esc(t(s.label))}</text>` +
      `<text x="${x.toFixed(1)}" y="${(y + 18).toFixed(1)}" text-anchor="${anchor}" class="rvalue">${now}</text>`;
  }).join('');
  // Punkte mit Hover: Wert zuletzt und davor
  const dots = rows.map(({ s, now, before }, i) => {
    const [x, y] = pt(i, now);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="rdot"><title>${esc(t('{label}: zuletzt {now}, davor {before}', { label: t(s.label), now, before }))}</title></circle>`;
  }).join('');
  return `<figure class="radar"><svg viewBox="-20 0 360 310" role="img" aria-label="${esc(t('Skill-Profil als Netzdiagramm: zuletzt gegen davor'))}">` +
    `${rings}${axes}<polygon points="${poly(rows.map((r) => r.before))}" class="rbefore"></polygon>` +
    `<polygon points="${poly(rows.map((r) => r.now))}" class="rnow"></polygon>${dots}${labels}</svg>` +
    `<figcaption><span class="lg now"></span>${t('zuletzt')} <span class="lg before"></span>${t('davor')}</figcaption></figure>`;
}

// Skill-Details („Metric Allocation“): woraus der Wert besteht, bestes und schlechtestes Spiel, Verlauf je Spiel
function detailCard(skills, games) {
  const s = skills.find((x) => x.key === progDetail && !x.missing);
  if (!s) return '';
  const has = (g) => !s.needs || g[s.needs] != null;
  const list = games.filter(has);
  let extremes = '';
  if (!s.set) {
    const sorted = [...list].sort((a, b) => (better(s, s.val(a), s.val(b)) ? -1 : 1));
    const show = (g, label) => `<div class="rec"><label>${label}</label><b>${dec(s.val(g), s.digits)}</b> <small>${t(s.unit)}</small>` +
      `<span class="champ">${champImg(g.c)}${esc(g.c ? g.c.name : '?')}</span><small class="${g.win ? 'win' : 'loss'}">${g.win ? t('Sieg') : t('Niederlage')}</small>` +
      `<small>${new Date(g.at).toLocaleDateString(i18n.locale())}</small></div>`;
    extremes = `<div class="recs">${show(sorted[0], t('Bestes Spiel'))}${show(sorted[sorted.length - 1], t('Schwächstes Spiel'))}</div>`;
  }
  const per = s.set ? s.rolling : list.slice(-30).map(s.val);
  return `<div class="card detail"><div class="card-head"><h2>${t(s.label)}</h2><button class="ghost" data-skill="${s.key}">${t('Schließen')}</button></div>` +
    `<p>${esc(t(s.how))}</p>${extremes}` +
    spark(per, s, s.set ? 5 : Math.max(1, list.length - per.length + 1)) +
    `<p class="hint">${s.set ? t('Je Fünf-Spiele-Abschnitt, gestrichelt dein Schnitt.') : t('Je Spiel (letzte {n}), gestrichelt dein Schnitt.', { n: per.length })}</p></div>`;
}

// Siege gegen Niederlagen: welche Werte sich in deinen Siegen am stärksten von deinen Niederlagen unterscheiden
function winLossCard(games, map) {
  const W = games.filter((g) => g.win), L = games.filter((g) => !g.win);
  if (W.length < 3 || L.length < 3) return `<div class="card"><p class="hint">${t('Für den Vergleich braucht es mindestens 3 Siege und 3 Niederlagen ({w} / {l}).', { w: W.length, l: L.length })}</p></div>`;
  const extra = [
    { label: 'Gold', unit: 'Gold/min', digits: 0, needs: 'gold', val: (g) => g.gold / gmins(g) },
    { label: 'Erlittener Schaden', unit: 'Schaden/min', digits: 0, needs: 'taken', lower: true, val: (g) => g.taken / gmins(g) },
  ];
  const rows = [...SKILLS.filter((s) => !s.set && (!s.maps || s.maps.includes(map))), ...extra].map((s) => {
    const has = (g) => !s.needs || g[s.needs] != null;
    const w = W.filter(has), l = L.filter(has);
    if (w.length < 3 || l.length < 3) return null;
    const mw = mean(w.map(s.val)), ml = mean(l.map(s.val));
    return { s, mw, ml, rel: ml ? (mw - ml) / ml : 0 };
  }).filter(Boolean).sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel)).slice(0, 5);
  if (!rows.length) return '';
  const top = rows[0];
  const pct = (r) => `${Math.round(Math.abs(r.rel) * 100)} %`;
  return `<div class="card winloss"><p class="deaths-head">${t('Größter Unterschied: {label} – in Siegen {w}, in Niederlagen {l} {unit} ({p} {dir}).', {
    label: t(top.s.label), w: dec(top.mw, top.s.digits), l: dec(top.ml, top.s.digits), unit: t(top.s.unit), p: pct(top), dir: top.rel > 0 ? t('mehr') : t('weniger') })}</p>` +
    `<table class="pool"><thead><tr><th></th><th>${t('in Siegen')}</th><th>${t('in Niederlagen')}</th><th>${t('Unterschied')}</th></tr></thead><tbody>` +
    rows.map((r) => `<tr><td>${t(r.s.label)} <small class="muted">${t(r.s.unit)}</small></td><td>${dec(r.mw, r.s.digits)}</td><td>${dec(r.ml, r.s.digits)}</td>` +
      `<td>${r.rel > 0 ? '+' : '−'}${pct(r)}</td></tr>`).join('') +
    `</tbody></table><p class="hint">${t('Aus {w} Siegen und {l} Niederlagen. Zeigt Zusammenhänge, nicht unbedingt Ursachen: in Siegen hat oft das ganze Team mehr Gold.', { w: W.length, l: L.length })}</p></div>`;
}

// Gegen wen du verlierst: Siegquote gegen gegnerische Champions (aus den Spieldetails, ab 3 Spielen gegen ihn)
function enemyCard(games) {
  const by = new Map();
  let withData = 0;
  for (const g of games) {
    const tl = progTimelines[g.id];
    if (!tl || !tl.enemies) continue;
    withData++;
    for (const key of tl.enemies) {
      const c = by.get(key) || { key, n: 0, w: 0 };
      c.n++;
      if (g.win) c.w++;
      by.set(key, c);
    }
  }
  const list = [...by.values()].filter((c) => c.n >= 3);
  if (list.length < 2) return `<div class="card"><p class="hint">${t('Noch zu wenige Spiele gegen dieselben Champions (ab 3 Spielen je Champion, {n} Spiele mit Gegnerdaten).', { n: withData })}</p></div>`;
  const wr = (c) => c.w / c.n;
  const hard = [...list].sort((a, b) => wr(a) - wr(b) || b.n - a.n).slice(0, 5);
  const easy = [...list].filter((c) => wr(c) >= 0.5).sort((a, b) => wr(b) - wr(a) || b.n - a.n).slice(0, 3);
  const row = (c) => {
    const ch = champOf(c.key);
    return `<div class="erow"><span class="champ">${champImg(ch)}${esc(ch ? ch.name : String(c.key))}</span>` +
      `<b class="${wr(c) >= 0.5 ? 'win' : 'loss'}">${Math.round(wr(c) * 100)} %</b><small>${c.w}/${c.n}</small></div>`;
  };
  return `<div class="card enemies"><div class="ecols"><div><h2>${t('Schwer für dich')}</h2>${hard.map(row).join('')}</div>` +
    `<div><h2>${t('Liegt dir')}</h2>${easy.length ? easy.map(row).join('') : `<p class="hint">${t('Noch kein Champion mit Siegquote ab 50 %.')}</p>`}</div></div>` +
    `<p class="hint">${t('Deine Siegquote in Spielen, in denen dieser Champion im Gegnerteam war (ab 3 Spielen, aus {n} Spielen).', { n: withData })}</p></div>`;
}

// Nach Niederlagen: Siegquote im nächsten Spiel derselben Session (höchstens 2 Stunden Pause dazwischen)
function tiltCard(games) {
  const list = [...games].sort((a, b) => a.at - b.at);
  const buckets = { afterWin: [], afterLoss: [], afterTwo: [] };
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1], g = list[i];
    if (g.at - (prev.at + prev.dur * 1000) > 2 * 3600e3) continue;
    if (prev.win) buckets.afterWin.push(g);
    else {
      buckets.afterLoss.push(g);
      const prev2 = list[i - 2];
      if (prev2 && !prev2.win && prev.at - (prev2.at + prev2.dur * 1000) <= 2 * 3600e3) buckets.afterTwo.push(g);
    }
  }
  const rows = [['Nach einem Sieg', buckets.afterWin], ['Nach einer Niederlage', buckets.afterLoss], ['Nach 2 Niederlagen am Stück', buckets.afterTwo]];
  const total = rows.reduce((a, [, l]) => a + l.length, 0);
  if (total < 5) return `<div class="card"><p class="hint">${t('Noch zu wenige Spiele direkt hintereinander ({n}).', { n: total })}</p></div>`;
  const w = (l) => (l.length >= 3 ? Math.round((l.filter((g) => g.win).length / l.length) * 100) : null);
  const two = w(buckets.afterTwo), win = w(buckets.afterWin);
  const verdict = two != null && win != null && two + 15 <= win
    ? `<p class="deaths-head loss">${t('Nach 2 Niederlagen am Stück gewinnst du nur {two} % (nach einem Sieg {win} %). Eine Pause lohnt sich.', { two, win })}</p>` : '';
  return `<div class="card tilt">${verdict}` + rows.map(([label, l]) => {
    const v = w(l);
    if (v == null) return `<div class="wrow"><span>${t(label)}</span><span class="hint">${t('zu wenig')}</span><small>${l.length === 1 ? t('1 Spiel') : t('{n} Spiele', { n: l.length })}</small></div>`;
    return `<div class="wrow"><span>${t(label)}</span><svg class="wtrack" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" rx="2" class="wbg"></rect>` +
      `<rect width="${v}" height="8" rx="2" class="wfill"></rect><line x1="50" x2="50" y1="0" y2="8" class="wmid" vector-effect="non-scaling-stroke"></line></svg>` +
      `<small><b class="${v >= 50 ? 'win' : 'loss'}">${v} %</b> · ${l.length}</small></div>`;
  }).join('') + `<p class="hint">${t('Siegquote im nächsten Spiel derselben Session (höchstens 2 Stunden Pause).')}</p></div>`;
}

// Vielseitigkeit: auf wie vielen deiner Champions (ab 3 Spielen) du mindestens auf deinem Niveau spielst
function versatility(games) {
  const by = new Map();
  for (const g of games) by.set(g.champ, [...(by.get(g.champ) || []), g]);
  const kda = (l) => l.reduce((a, g) => a + g.k + g.a, 0) / Math.max(l.reduce((a, g) => a + g.d, 0), 1);
  const all = kda(games);
  const champs = [...by.values()].filter((l) => l.length >= 3);
  if (champs.length < 2) return '';
  const good = champs.filter((l) => kda(l) >= all * 0.9 && l.filter((g) => g.win).length / l.length >= 0.5).length;
  return `<p class="deaths-head">${t('Vielseitigkeit: auf {good} von {n} Champions (ab 3 Spielen) spielst du auf deinem Niveau (KDA und Siegquote).', { good, n: champs.length })}</p>`;
}

// Champion-Profil: Klick auf einen Champion im Pool zeigt seine Werte gegen deinen Schnitt in dieser Auswahl
function champProfile(games, map) {
  if (progChamp == null) return '';
  const mine = games.filter((g) => String(g.champ) === String(progChamp));
  if (mine.length < 3) return '';
  const c = mine[0].c;
  const rows = SKILLS.filter((s) => !s.set && (!s.maps || s.maps.includes(map))).map((s) => {
    const has = (g) => !s.needs || g[s.needs] != null;
    const a = mine.filter(has), b = games.filter(has);
    if (a.length < 3) return null;
    const va = mean(a.map(s.val)), vb = mean(b.map(s.val));
    const rel = vb ? ((va - vb) / vb) * (s.lower ? -1 : 1) : 0;
    return `<tr><td>${t(s.label)}</td><td>${dec(va, s.digits)}</td><td>${dec(vb, s.digits)}</td>` +
      `<td class="${Math.abs(rel) < 0.03 ? '' : rel > 0 ? 'win' : 'loss'}">${Math.abs(rel) < 0.03 ? t('wie immer') : rel > 0 ? t('{n} % besser', { n: Math.round(rel * 100) }) : t('{n} % schlechter', { n: Math.round(-rel * 100) })}</td></tr>`;
  }).filter(Boolean);
  return `<div class="card cprofile"><div class="card-head"><h2>${champImg(c)} ${esc(c ? c.name : '?')}</h2><button class="ghost" data-prof="">${t('Schließen')}</button></div>` +
    `<table class="pool"><thead><tr><th></th><th>${esc(c ? c.name : '')} (${mine.length})</th><th>${t('dein Schnitt')}</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

// Rekorde: dein bestes Spiel je Wert in dieser Auswahl (Tode erst ab 15 Minuten Spieldauer), längste Siegesserie
function recordsCard(games, map) {
  const tiles = SKILLS.filter((s) => !s.set && (!s.maps || s.maps.includes(map))).map((s) => {
    const list = games.filter((g) => (!s.needs || g[s.needs] != null) && (s.key !== 'survive' || g.dur >= 900));
    if (!list.length) return '';
    const g = list.reduce((a, x) => (better(s, s.val(x), s.val(a)) ? x : a));
    return `<div class="rec"><label>${t(s.label)}</label><b>${dec(s.val(g), s.digits)}</b> <small>${t(s.unit)}</small>` +
      `<span class="champ">${champImg(g.c)}${esc(g.c ? g.c.name : '?')}</span>` +
      `<small><span class="${g.win ? 'win' : 'loss'}">${g.win ? t('Sieg') : t('Niederlage')}</span> · ${new Date(g.at).toLocaleDateString(i18n.locale())}</small></div>`;
  });
  let best = 0, run = 0;
  for (const g of [...games].sort((a, b) => a.at - b.at)) {
    run = g.win ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return `<div class="card"><div class="recs grid">${tiles.join('')}` +
    `<div class="rec"><label>${t('Längste Siegesserie')}</label><b>${best}</b> <small>${t('Siege am Stück')}</small></div></div></div>`;
}

// Ziel-Verlauf: frühere Session-Ziele mit Zeitraum und Quote
function goalHistoryHtml() {
  const list = [...progGoalHistory].reverse().slice(0, 6);
  if (!list.length) return '';
  const f = (g) => (g.key === 'deaths' ? String(g.target) : dec(g.target, g.key === 'vision' ? 2 : 1));
  const day = (ms) => new Date(ms).toLocaleDateString(i18n.locale());
  return `<div class="ghist"><h3>${t('Frühere Ziele')}</h3>` + list.map((g) => {
    const ok = g.results.filter((r) => r.ok).length;
    return `<div class="rv-row"><span class="rv-label">${day(g.since)} – ${day(g.until)}</span><span>${esc(t(GOAL_TEXT[g.key], { n: f(g) }))}` +
      `${g.map ? ` · ${t(PMODES[g.map] || '')}` : ''}: <b class="${ok * 2 >= g.results.length ? 'win' : 'loss'}">${t('{ok} von {n} geschafft', { ok, n: g.results.length })}</b></span></div>`;
  }).join('') + '</div>';
}

function skillCard(s) {
  if (s.missing) {
    return `<div class="skill"><label>${t(s.label)}</label><p class="hint">${t('Noch zu wenige Spiele mit diesem Wert')}</p></div>`;
  }
  const pct = Math.round(Math.abs(s.better) * 100);
  const word = pct < 3 ? t('wie immer') : s.better > 0 ? t('{n} % besser', { n: pct }) : t('{n} % schlechter', { n: pct });
  const cls = pct < 3 ? '' : s.better > 0 ? 'good' : 'bad';
  const arrow = pct < 3 ? '→' : s.better > 0 ? '↑' : '↓';
  return `<div class="skill click${progDetail === s.key ? ' open' : ''}" data-skill="${s.key}" role="button" tabindex="0" title="${esc(t('Details zu {label}', { label: t(s.label) }))}">
    <div class="trend-head"><label>${t(s.label)}</label><span class="delta ${cls}">${arrow} ${word}</span></div>
    <div class="skill-val"><b>${dec(s.now, s.digits)}</b><small>${t(s.unit)} · Ø ${dec(s.base, s.digits)}</small></div>
    ${spark(s.rolling, s)}
  </div>`;
}

// Gleitender Schnitt als Linie, gestrichelt dein Gesamtschnitt; Hover zeigt den Wert je Spiel
function spark(values, s, first = 5) {
  if (values.length < 2) return '';
  const W = 200, H = 56, pad = 5;
  const avg = mean(values);
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const x = (i) => pad + (i * (W - 2 * pad)) / (values.length - 1);
  const y = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const hits = values.map((v, i) => `<rect x="${(x(i) - (W - 2 * pad) / values.length / 2).toFixed(1)}" y="0" width="${((W - 2 * pad) / values.length).toFixed(1)}" height="${H}" fill="transparent"><title>${t('Spiel {i}: Ø {v} {unit}', { i: i + first, v: dec(v, s.digits), unit: t(s.unit) })}</title></rect>`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${t('{label}: gleitender Schnitt über 5 Spiele', { label: t(s.label) })}">
    <line x1="${pad}" x2="${W - pad}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" stroke="rgba(255,255,255,0.18)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"></line>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline>
    <circle cx="${x(values.length - 1).toFixed(1)}" cy="${y(values[values.length - 1]).toFixed(1)}" r="3" fill="var(--accent)"></circle>${hits}
  </svg>`;
}

// Siegquote nach Spiel-Nr. am Tag (Tilt?), Tageszeit und Spiellänge. Ein „Tag“ geht bis 5 Uhr morgens
function winBlocks(games) {
  const dayOf = (g) => new Date(g.at - 5 * 3600e3).toDateString();
  const nth = new Map();
  const count = {};
  for (const g of games) {
    const d = dayOf(g);
    count[d] = (count[d] || 0) + 1;
    nth.set(g, count[d]);
  }
  const blocks = [
    [t('Spiel am Tag'), [['1.', (g) => nth.get(g) === 1], ['2.', (g) => nth.get(g) === 2], ['3.', (g) => nth.get(g) === 3], ['4+', (g) => nth.get(g) >= 4]]],
    [t('Tageszeit'), [[t('Morgens'), (g) => hour(g) >= 6 && hour(g) < 12], [t('Nachmittags'), (g) => hour(g) >= 12 && hour(g) < 18],
      [t('Abends'), (g) => hour(g) >= 18], [t('Nachts'), (g) => hour(g) < 6]]],
    [t('Spiellänge'), [['< 25 min', (g) => g.dur < 1500], ['25–35 min', (g) => g.dur >= 1500 && g.dur < 2100], ['> 35 min', (g) => g.dur >= 2100]]],
  ];
  return blocks.map(([title, rows]) => `<div class="card wins"><h2>${title}</h2>${rows.map(([label, test]) => {
    const list = games.filter(test);
    if (!list.length) return ''; // keine Spiele in dieser Zeile: weglassen statt „zu wenig · 0 Spiele“
    if (list.length < 3) return `<div class="wrow"><span>${label}</span><span class="hint">${t('zu wenig')}</span><small>${list.length === 1 ? t('1 Spiel') : t('{n} Spiele', { n: list.length })}</small></div>`;
    const w = Math.round((list.filter((g) => g.win).length / list.length) * 100);
    return `<div class="wrow" title="${t('{w} % Siege aus {n} Spielen', { w, n: list.length })}"><span>${label}</span>` +
      // SVG statt style="width": die CSP des Fensters blockt style-Attribute in innerHTML; Strich = 50 %
      `<svg class="wtrack" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" rx="2" class="wbg"></rect>` +
      `<rect width="${w}" height="8" rx="2" class="wfill"></rect><line x1="50" x2="50" y1="0" y2="8" class="wmid" vector-effect="non-scaling-stroke"></line></svg><small><b class="${w >= 50 ? 'win' : 'loss'}">${w} %</b> · ${list.length}</small></div>`;
  }).join('')}</div>`);
}
const hour = (g) => new Date(g.at).getHours();

function champPool(games) {
  const by = new Map();
  for (const g of games) {
    const c = by.get(g.champ) || { c: g.c, games: [], };
    c.games.push(g);
    by.set(g.champ, c);
  }
  const rows = [...by.values()].sort((a, b) => b.games.length - a.games.length).slice(0, 8);
  return `<div class="card">${versatility(games)}<table class="pool"><thead><tr><th>${t('Champion')}</th><th>${t('Spiele')}</th><th>${t('Siegquote')}</th><th>KDA</th>${progMap === 11 ? '<th>CS/min</th>' : ''}</tr></thead><tbody>` +
    rows.map(({ c, games: list }) => {
      const w = Math.round((list.filter((g) => g.win).length / list.length) * 100);
      const kda = list.reduce((a, g) => a + g.k + g.a, 0) / Math.max(list.reduce((a, g) => a + g.d, 0), 1);
      const csm = list.reduce((a, g) => a + g.cs, 0) / list.reduce((a, g) => a + gmins(g), 0);
      return `<tr class="click${String(progChamp) === String(list[0].champ) ? ' open' : ''}"${list.length >= 3 ? ` data-prof="${list[0].champ}"` : ''}><td><span class="pool-champ">${c ? champImg(c) + esc(c.name) : '?'}</span></td><td>${list.length}</td>` +
        `<td class="${w >= 50 ? 'win' : 'loss'}">${w} %</td><td>${dec(kda, 2)}</td>${progMap === 11 ? `<td>${dec(csm, 1)}</td>` : ''}</tr>`; // CS/min nur auf der Kluft
    }).join('') + '</tbody></table></div>';
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
// minimiert oder verdeckt (document.hidden) nicht neu zeichnen: die Abfrage holt sonst alle 2 s Daten für niemanden
setInterval(() => { if (!$('live').hidden && !document.hidden && !window.__docs) renderLive(); }, 2000);

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
  renderNotes(); // braucht die Champion-Liste aus buildData
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
  renderJungle();
  renderNoteCard();
}

// --- Notizen: eigene Notizen je Champion plus eine allgemeine, nur lokal; speichert beim Tippen (600 ms Pause) ---
const GENERAL = '_general';
let notesData = {};
let noteKey = GENERAL;
let noteTimer = null;
const champById = (id) => buildData && buildData.champions.find((c) => c.id === id);
const noteName = (key) => (key === GENERAL ? t('Allgemein') : (champById(key) || { name: key }).name);

async function renderNotes() {
  notesData = await window.lol.notes().catch(() => ({}));
  drawNoteList();
  openNote(noteKey);
  renderNoteCard();
}
function drawNoteList() {
  const keys = Object.keys(notesData).sort((a, b) => notesData[b].at - notesData[a].at);
  $('noteList').innerHTML = keys.length ? keys.map((k) => `<button class="note-item${k === noteKey ? ' active' : ''}" data-note="${esc(k)}">` +
    `${k === GENERAL ? '<span class="champ-ph" aria-hidden="true"></span>' : champImg(champById(k))}` +
    `<span><b>${esc(noteName(k))}</b><small>${esc((notesData[k].text || ((notesData[k].journal || []).slice(-1)[0] || {}).text || '').split('\n')[0].slice(0, 60))}</small></span></button>`).join('')
    : `<p class="hint">${t('Noch keine Notizen. Wähl oben einen Champion.')}</p>`;
}
function openNote(key) {
  flushNote();
  noteKey = key;
  const n = notesData[key];
  $('noteTitle').textContent = noteName(key);
  $('noteArea').value = n ? n.text : '';
  $('noteState').textContent = n ? t('gespeichert {when}', { when: new Date(n.at).toLocaleString(i18n.locale(), { dateStyle: 'short', timeStyle: 'short' }) }) : '';
  $('noteChamp').value = key === GENERAL ? '' : noteName(key);
  resetDelete();
  drawJournal();
  document.querySelectorAll('.note-item').forEach((b) => b.classList.toggle('active', b.dataset.note === key));
}
// Schlüssel und Text werden vor dem ersten await gelesen: ein Wechsel zum nächsten Champ kommt nicht dazwischen
async function saveNote() {
  noteTimer = null;
  const key = noteKey;
  notesData = await window.lol.noteSet(key, $('noteArea').value);
  if (key === noteKey) {
    $('noteState').textContent = notesData[key] ? t('gespeichert') : '';
    $('noteDelete').hidden = !notesData[key];
  }
  drawNoteList();
  renderNoteCard();
}
// Tagebuch des Champions: Einträge aus dem Rückblick („Was nehme ich mit?“), neueste zuerst, einzeln löschbar
function drawJournal() {
  const list = [...((notesData[noteKey] || {}).journal || [])].sort((a, b) => b.at - a.at);
  $('noteJournal').innerHTML = !list.length ? '' : `<h3>${t('Aus deinen Spielen')}</h3>` + list.map((j) =>
    `<div class="j-row"><span class="j-meta"><b class="${j.win ? 'win' : 'loss'}">${j.win ? t('Sieg') : t('Niederlage')}</b> · ` +
    `${new Date(j.at).toLocaleDateString(i18n.locale())}</span><span class="j-text">${esc(j.text)}</span>` +
    `<button class="ghost j-del" data-game="${esc(j.gameId)}" title="${esc(t('Eintrag löschen'))}" aria-label="${esc(t('Eintrag löschen'))}">×</button></div>`).join('');
}
$('noteJournal').addEventListener('click', async (e) => {
  const b = e.target.closest('.j-del');
  if (!b) return;
  notesData = await window.lol.noteLearn(noteKey, { gameId: b.dataset.game, text: '' });
  drawJournal();
  drawNoteList();
  renderNoteCard();
});
// Löschen in zwei Schritten (ohne Browser-Dialog): erster Klick fragt nach, zweiter innerhalb von 4 s löscht
let deleteArmed = null;
function resetDelete() {
  clearTimeout(deleteArmed);
  deleteArmed = null;
  $('noteDelete').textContent = t('Löschen');
  $('noteDelete').classList.remove('danger');
  $('noteDelete').hidden = !notesData[noteKey];
}
$('noteDelete').addEventListener('click', async () => {
  if (!deleteArmed) {
    $('noteDelete').textContent = t('Wirklich löschen?');
    $('noteDelete').classList.add('danger');
    deleteArmed = setTimeout(resetDelete, 4000);
    return;
  }
  clearTimeout(noteTimer);
  noteTimer = null;
  $('noteArea').value = '';
  await saveNote();
  $('noteState').textContent = t('gelöscht');
  resetDelete();
});
function flushNote() {
  if (!noteTimer) return;
  clearTimeout(noteTimer);
  saveNote();
}
$('noteArea').addEventListener('input', () => {
  $('noteState').textContent = '…';
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveNote, 600);
});
$('noteArea').addEventListener('blur', flushNote);
window.addEventListener('beforeunload', flushNote);
$('noteList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-note]');
  if (b) openNote(b.dataset.note);
});
$('noteGeneral').addEventListener('click', () => openNote(GENERAL));
$('noteChamp').addEventListener('change', () => {
  const c = champByName.get($('noteChamp').value.trim().toLowerCase());
  if (c) openNote(c.id);
});
// „Build & Runen“: Notiz zum gewählten Champion, „Bearbeiten“ springt in den Reiter „Notizen“
// „Build & Runen“ in der Champ-Auswahl: dein Plan für dieses Spiel – Notiz, letzte Learnings zum Champion,
// Session-Ziel, Fokus aus dem Fortschritt und die Lane-Einschätzung gegen die gegnerischen Picks
function renderNoteCard() {
  if (!champId) return;
  const note = notesData[champId];
  $('noteText').innerHTML = note && note.text ? esc(note.text) : `<span class="hint">${t('Noch keine Notiz zu diesem Champion.')}</span>`;
  $('noteEdit').textContent = note && note.text ? t('Bearbeiten') : t('Notiz schreiben');
  const parts = [];
  const learned = [...((note || {}).journal || [])].sort((a, b) => b.at - a.at).slice(0, 3);
  if (learned.length) parts.push([t('Zuletzt gelernt'), learned.map((j) => esc(j.text)).join('<br>')]);
  if (progGoal) {
    const f = (v) => (progGoal.key === 'deaths' ? String(v) : dec(v, progGoal.key === 'vision' ? 2 : 1));
    parts.push([t('Session-Ziel'), esc(t(GOAL_TEXT[progGoal.key], { n: f(progGoal.target) }))]);
  }
  // Fokus auf der Map des kommenden Spiels (ARAM-Bank sichtbar = ARAM)
  const map = $('benchCard').hidden ? 11 : 12;
  const games = progGames.filter((g) => g.map === map && g.cs != null);
  if (games.length >= RECENT + 5) {
    const { focus } = rateSkills(games, map);
    if (focus && focus.better < 0) parts.push([t('Fokus'), `${esc(t(focus.label))}: ${esc(t(focus.tip))}`]);
  }
  const mu = Object.entries(matchupResults).filter(([id]) => id !== champId && matchupResults[id] && !matchupResults[id].error);
  if (mu.length) {
    parts.push([t('Lane'), mu.map(([id, d]) => {
      const [label, cls] = laneVerdict(d);
      return `${esc((champById(id) || { name: id }).name)} <span class="${cls}">${esc(label)}</span>`;
    }).join(' · ')]);
  }
  $('planMore').innerHTML = parts.map(([label, html]) => `<div class="rv-row"><span class="rv-label">${label}</span><span>${html}</span></div>`).join('');
}
$('noteEdit').addEventListener('click', () => {
  showTab('notes');
  openNote(champId);
  $('noteArea').focus();
});

// --- Matchup: Lane gewinnend oder verlierend und wer auf Level 1–3 vorne liegt (nur vor dem Spiel) ---
const matchup = { enemies: [], position: '', manual: null };
let matchupResults = {}; // Gegner-ID -> Matchup-Daten (für die Plan-Karte), gilt für den gewählten Champion
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
  matchupResults = {};
  box.innerHTML = list.map((id) => `<div class="mu-row" data-vs="${esc(id)}"><span class="hint">${t('Lade Matchup…')}</span></div>`).join('');
  await Promise.all(list.map(async (id) => {
    const d = await window.lol.matchup(forChamp, id, matchup.position).catch((e) => ({ error: e.message }));
    const row = box.querySelector(`[data-vs="${CSS.escape(id)}"]`);
    if (row && forChamp === champId) row.innerHTML = matchupHtml(id, d);
    if (forChamp === champId) matchupResults[id] = d && !d.error && d.winRate != null ? d : { error: true };
  }));
  renderNoteCard();
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
  matchup.side = s.side;
  renderMatchup();
  renderJungle();
  renderBest();
});

// Deine besten Champs für die zugeteilte Rolle (nur in der Champ-Auswahl mit Rollen)
const LANE_NAME = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' };
async function renderBest() {
  const card = $('bestCard');
  const lane = matchup.position;
  if (!LANE_NAME[lane]) return (card.hidden = true);
  const list = await window.lol.bestChamps(lane).catch(() => []);
  card.hidden = false;
  $('bestLane').textContent = LANE_NAME[lane];
  $('bestList').innerHTML = list.length ? list.map((c) =>
    `<div class="best-row"><span class="champ">${champImg({ id: c.id })}<b>${esc(c.name)}</b></span>` +
    `<span>${t('{n} Spiele', { n: c.games })}</span><b class="${c.wins / c.games >= 0.5 ? 'win' : 'loss'}">${dec((c.wins / c.games) * 100, 0)} %</b>` +
    `<span>KDA ${dec(c.kda, 2)}</span></div>`).join('')
    : `<p class="hint">${t('Noch zu wenige eigene Spiele in dieser Rolle.')}</p>`;
}

// Session heute im Kopf der Seitenleiste: Siege/Niederlagen und LP seit dem ersten Blick heute
function renderSession(s) {
  const el = $('session');
  if (!s || s.wins + s.losses === 0) return (el.textContent = '');
  const lp = [['Solo', s.lp.solo], ['Flex', s.lp.flex]].filter(([, v]) => v).map(([q, v]) => `${q} ${v > 0 ? '+' : ''}${v} LP`);
  el.innerHTML = `${t('Heute')} <b class="win">${t('{n}S', { n: s.wins })}</b> <b class="loss">${t('{n}N', { n: s.losses })}</b>${lp.length ? ` · ${lp.join(' · ')}` : ''}` +
    (s.streak >= 3 ? ` · <span class="loss">${t('{n} Niederlagen am Stück', { n: s.streak })}</span>` : '');
}
window.lol.onSession(renderSession);
window.lol.onProgressUpdate(() => renderProgress()); // neue Spielverläufe aus dem Client geladen
window.lol.session().then(renderSession);
window.lol.matchupState().then((s) => {
  if (!s) return;
  matchup.enemies = s.enemies;
  matchup.position = s.position;
  matchup.side = s.side;
  renderMatchup();
  renderJungle();
  renderBest();
});

// --- Jungle-Route: erste Runde je Startcamp als nummerierte Mini-Karte (nur vor dem Spiel) ---
// Camp-Lagen der blauen Seite auf Summoner's Rift in Prozent der Karte (links unten = blaue Basis),
// die rote Seite ist punktgespiegelt
const CAMP_XY = { Blue: [26, 47], Gromp: [14, 43], Wolves: [26, 57], Raptors: [47, 63], Red: [53, 73], Krugs: [57, 82] };
const CAMP_NAME = { Blue: 'Blau', Gromp: 'Gromp', Wolves: 'Wölfe', Raptors: 'Raptoren', Red: 'Rot', Krugs: 'Krugs' };
function jungleMap(route, side) {
  const xy = (c) => (side === 'red' ? CAMP_XY[c].map((v) => 100 - v) : CAMP_XY[c]);
  const pts = route.map(xy);
  const line = pts.map((p) => p.join(',')).join(' ');
  const dots = pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4.6"/><text x="${x}" y="${y + 2}">${i + 1}</text>`).join('');
  // Lanes und Fluss nur als Orientierung
  return `<svg class="jmap" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="6"/>` +
    `<path class="lane" d="M8 92 L8 8 L92 8 M8 92 L92 92 L92 8 M8 92 L92 8"/><path class="river" d="M6 6 L94 94"/>` +
    `<polyline points="${line}"/>${dots}</svg>`;
}
const fmtClear = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
async function renderJungle() {
  const card = $('jungleCard');
  const forChamp = champId;
  // in der Champ-Auswahl nur für Jungler, sonst (Build ansehen) nur, wenn die Tabelle den Champ kennt
  if (!forChamp || (matchup.position && matchup.position !== 'jungle')) return (card.hidden = true);
  const d = await window.lol.jungleRoutes(forChamp).catch(() => null);
  if (forChamp !== champId) return;
  if (!d || (!matchup.position && d.routes[0].standard)) return (card.hidden = true);
  card.hidden = false;
  $('jungleSource').onclick = (e) => (e.preventDefault(), window.lol.openSource(d.source));
  const side = matchup.side || 'blue';
  const chosen = d.routes.some((r) => r.route[0] === d.chosen) ? d.chosen : d.routes[0].route[0];
  $('jungleList').innerHTML = d.routes.map((r) => {
    const time = r.time ? `${Math.floor(r.time / 60)}:${String(r.time % 60).padStart(2, '0')}` : '';
    const meta = r.standard
      ? t('Standard-Full-Clear (kein Eintrag für diesen Champ)')
      : [time && t('{time} bis zum letzten Camp', { time }), r.smites && t('{n}× Smite', { n: r.smites }), `Patch ${r.patch}`]
        .filter(Boolean).join(' · ');
    const video = r.link ? `<a href="#" data-link="${esc(r.link)}">${t('Video')}${r.player ? ` (${esc(r.player)})` : ''}</a>` : '';
    const on = r.route[0] === chosen;
    const pick = `<button class="ghost${on ? ' on' : ''}" data-start="${esc(r.route[0])}">${on ? t('Auf der Minimap ✓') : t('Auf der Minimap')}</button>`;
    return `<div class="jroute">${jungleMap(r.route, side)}<div><b>${t('Start {camp}', { camp: t(CAMP_NAME[r.route[0]]) })}${r.variant ? ` (${esc(r.variant)})` : ''}` +
      `${r.camps < 6 ? ` · ${t('{n} Camps', { n: r.camps })}` : ' · Full Clear'}</b>` +
      `<ol>${r.route.map((c) => `<li>${t(CAMP_NAME[c])}</li>`).join('')}</ol><small>${meta}</small>${video}${pick}</div></div>`;
  }).join('') + `<p class="hint">${side === 'red' ? t('Rote Seite (oben rechts)') : t('Blaue Seite (unten links)')}</p>` +
    (d.clears ? `<p class="clears">${t('Deine erste Runde mit dem Champ')}: <b>${fmtClear(d.clears.last)}</b> · ` +
      `${t('beste')} <b>${fmtClear(d.clears.best)}</b> · Ø ${fmtClear(d.clears.avg)} (${d.clears.count}×)</p>` : '');
  $('jungleList').querySelectorAll('[data-link]').forEach((a) => (a.onclick = (e) => (e.preventDefault(), window.lol.openSource(a.dataset.link))));
  $('jungleList').querySelectorAll('[data-start]').forEach((b) => (b.onclick = async () => {
    await window.lol.jungleChoose(forChamp, b.dataset.start);
    renderJungle();
  }));
}

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
    const forChamp = champId;
    try {
      const s = await window.lol.suggestion(champId, load);
      if (forChamp !== champId) return; // inzwischen anderer Champ gewählt, dessen Aufruf zeichnet selbst
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
      if (forChamp !== champId) return;
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
  try {
    await window.lol.takeSuggestion(champId, take.dataset.take);
  } catch (err) {
    return buildStatus(errText(err));
  }
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
  // allSettled: ein Teil mit Fehler (z. B. Client gerade weg) soll die anderen und die Reiterwahl nicht aufhalten
  const results = await Promise.allSettled([renderLive(), renderEog(), renderHistory(), loadBuild(), renderProgress()]);
  results.forEach((r) => r.status === 'rejected' && console.warn('Laden:', r.reason && r.reason.message));
  const inGame = results[0].status === 'fulfilled' && results[0].value;
  // läuft gerade ein Spiel, direkt den Live-Tab zeigen
  // sonst „Letztes Spiel“ mit Untertitel (ohne diesen Aufruf blieb der Untertitel beim Start leer)
  if (!loadAll.done && !shownTab) showTab(inGame ? 'live' : 'eog');
  loadAll.done = true;
}

// Seitentitel und Untertitel je Reiter
const PAGES = {
  live: ['Live-Spiel', 'Alle 10 Spieler mit Rang, Items und Werten, sobald ein Spiel läuft'],
  eog: ['Letztes Spiel', 'Auswertung direkt nach dem Spiel'],
  history: ['Verlauf', 'Deine letzten Spiele'],
  progress: ['Fortschritt', 'Deine letzten Spiele gegen deinen eigenen Schnitt'],
  notes: ['Notizen', 'Eigene Notizen je Champion, nur auf deinem PC'],
  build: ['Build & Runen', 'Eigene Einstellungen haben immer Vorrang vor Vorschlägen'],
};
let shownTab = null; // schon von außen gewählter Reiter (z. B. Champ-Auswahl → Build & Runen)
function showTab(tab) {
  shownTab = tab;
  [$('pageTitle').textContent, $('pageSub').textContent] = PAGES[tab].map((s) => t(s));

  document.querySelectorAll('nav button[data-tab]').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
  document.querySelectorAll('main section').forEach((s) => (s.hidden = s.id !== tab));
  if (tab === 'live') renderLive();
}
document.querySelectorAll('nav button[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
window.lol.onShowTab(showTab); // Champ-Auswahl öffnet direkt „Build & Runen“

// FarmyDevBuild: eigene Seite „Devtools“ mit Zustand und allen Dev-Werkzeugen (gleiche Aktionen wie Tray → Dev)
if (window.lol.dev) {
  PAGES.dev = ['Devtools', 'Nur in FarmyDevBuild · Strg+Shift+D schaltet die Lese-Bereiche'];
  const nav = document.createElement('button');
  nav.dataset.tab = 'dev';
  nav.className = 'dev-nav';
  nav.innerHTML = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/></svg>Devtools';
  nav.addEventListener('click', () => showTab('dev'));
  document.querySelector('nav').append(nav);
  const page = document.createElement('section');
  page.id = 'dev';
  page.hidden = true;
  const tools = [
    ['regions', 'Lese-Bereiche an/aus'], ['flag:clockOcr', 'Spielzeit per OCR an/aus'], ['flag:perfectCs', 'Perfekt-CS an/aus'],
    ['flag:fps', 'FPS/Ping-Log an/aus'], ['flag:deathRecap', 'Death Recap an/aus'], ['flag:ultIdle', 'Ulti ungenutzt an/aus'],
    ['restart', 'Neu starten'], ['devtoolsOverlay', 'DevTools: Overlay'],
    ['devtoolsStats', 'DevTools: Stats-Fenster'], ['debugDir', 'Debug-Ordner öffnen'], ['testUpdate', 'Update-Meldung testen'],
  ];
  page.innerHTML = '<div class="card dev-card"><h2>Status</h2><div id="devInfo" class="dev-grid"></div></div>' +
    `<div class="card dev-card"><h2>Werkzeuge</h2><div class="dev-tools">${tools.map(([k, label]) =>
      `<button class="ghost" data-dev="${k}">${label}</button>`).join('')}</div></div>`;
  document.querySelector('main').append(page);
  page.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', async () => {
    await window.lol.devAction(b.dataset.dev);
    renderDevInfo();
  }));
  const ROWS = [['version', 'Version'], ['dataDir', 'Datenordner'], ['game', 'Spiel'], ['focused', 'League vorne'],
    ['gameArea', 'Spielfenster'], ['factors', 'Skalierung'], ['minimap', 'Minimap'], ['regions', 'Lese-Bereiche'], ['clock', 'Spielzeit'], ['flags', 'Dev-Schalter an'], ['deaths', 'Tode (Recap)'], ['hud', 'FPS / Ping'], ['ult', 'Ulti ungenutzt'], ['update', 'Updater']];
  async function renderDevInfo() {
    const d = await window.lol.devInfo();
    if (!d) return;
    d.regions = d.regions ? 'an' : 'aus';
    $('devInfo').innerHTML = ROWS.map(([k, label]) => `<span>${label}</span><b>${esc(d[k])}</b>`).join('');
  }
  // nur aktualisieren, solange die Seite offen ist
  setInterval(() => !page.hidden && renderDevInfo(), 2000);
  nav.addEventListener('click', renderDevInfo);
}
$('reload').addEventListener('click', loadAll);
loadAll();

// Fensterknöpfe (Fenster ohne Windows-Rahmen)
$('winMin').addEventListener('click', () => window.lol.statsWindow('min'));
$('winClose').addEventListener('click', () => window.lol.statsWindow('close'));
