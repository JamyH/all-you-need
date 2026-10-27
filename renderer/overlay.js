const $ = (id) => document.getElementById(id);
const panel = $('panel');
i18n.setLang(window.lol.lang);
i18n.translatePage(document);
const { t, num } = i18n;

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const signed = (n) => `${n >= 0 ? '+' : ''}${num(n)}`;
const cls = (n) => (n >= 0 ? 'good' : 'bad');
// +450 / +1,2k / -12k: höchstens 5 Zeichen
const compact = (n) => {
  const a = Math.abs(n);
  const v = a < 1000 ? String(a) : a < 10000 ? `${num(a / 1000, 1)}k` : `${Math.round(a / 1000)}k`;
  return `${n >= 0 ? '+' : '-'}${v}`;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// innerHTML nur bei geänderter Ausgabe neu setzen: jede Sekunde neue Knoten (und neu dekodierte Icons) kostet
// das Overlay sonst laufend Arbeit, obwohl sich meist nichts ändert
const setHtml = (el, html) => {
  if (el.__html === html) return false;
  el.__html = html;
  el.innerHTML = html;
  return true;
};
// Panel bleibt im Bild (Ziehen, gespeicherte Position nach Auflösungswechsel)
const clampPos = (x, y) => ({
  x: Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth)),
  y: Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight)),
});

// Icons für die Warn-Pillen (Richtung B: Icon links neben dem Text)
const ICON_SKILL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
const ICON_RECALL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
const ICON_BUY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';

// Mayhem-Augment-Angebot und Werte-Schmiede: Tier über jeder Karte (keine Siegquoten, die verbietet Riot)
// Jungle-Route über der Minimap (erste Runde), nur solange Tab gedrückt ist: Linie und nummerierte Camps,
// rote Seite punktgespiegelt. Camp-Lagen wie im Stats-Fenster in Prozent der Karte; Größe und Transparenz im ⚙
const CAMP_XY = { Blue: [26, 47], Gromp: [14, 43], Wolves: [26, 57], Raptors: [47, 63], Red: [53, 73], Krugs: [57, 82] };
let jroute = null;
let tabHeld = false;
let jrouteKey = '';
function renderJungleRoute(j = jroute) {
  jroute = j;
  const svg = $('jroute');
  // SVG-Elemente kennen die Eigenschaft „hidden“ nicht, nur das Attribut
  const show = !!j && tabHeld && moduleOn('jungleRoute');
  svg.toggleAttribute('hidden', !show);
  if (!show) return;
  Object.assign(svg.style, { left: `${j.x}px`, top: `${j.y}px`, width: `${j.size}px`, height: `${j.size}px` });
  const size = settings?.jungleSize ?? 1;
  svg.style.opacity = (1 - (settings?.jungleTransparency ?? 40) / 100).toFixed(2);
  const key = `${j.side}|${j.route.join('-')}|${size}`;
  if (key === jrouteKey) return;
  jrouteKey = key;
  const r = 2.3 * size;
  const pts = j.route.map((c) => (j.side === 'red' ? CAMP_XY[c].map((v) => 100 - v) : CAMP_XY[c]));
  svg.innerHTML = `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" stroke-width="${(0.6 * size).toFixed(2)}"/>` +
    pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}"/>` +
      `<text x="${x}" y="${(y + r * 0.42).toFixed(2)}" font-size="${(r * 1.2).toFixed(2)}">${i + 1}</text>`).join('');
}
// FarmyDevBuild: „DEV“ im Panel-Kopf und die Lese-Bereiche als lila Rahmen (Strg+Shift+D)
if (window.lol.dev) {
  const badge = document.createElement('span');
  badge.className = 'dev-badge';
  badge.textContent = 'DEV';
  $('lvl').after(badge);
}
// Lage per CSSOM statt style-Attribut: die CSP des Overlays (style-src ohne 'unsafe-inline') blockt Inline-Styles
window.lol.onDebugRegions((list) => {
  $('dbg').replaceChildren(...(list || []).map((r) => {
    const box = document.createElement('div');
    if (r.y < 16) box.className = 'below'; // am oberen Rand: Beschriftung unter den Rahmen, sonst außerhalb des Bildschirms
    Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
    const label = document.createElement('span');
    label.textContent = `${r.label}: ${r.value}`;
    box.append(label);
    return box;
  }));
});

window.lol.onTabHeld((on) => {
  tabHeld = on;
  renderJungleRoute();
});

function renderAugments(list) {
  const box = $('aug');
  box.hidden = !list;
  if (!list) return box.replaceChildren();
  box.replaceChildren(...list.map((a, i) => {
    if (!a) return '';
    const el = document.createElement('div');
    el.style.left = `${a.x}px`;
    el.style.top = `${a.y}px`;
    if (a.unknown) {
      el.className = 'aug-badge unknown';
      el.textContent = t('nicht erkannt');
      return el;
    }
    // Tier wie bei Blitz: Buchstabe groß, darunter der Grund. Augment-Tiers stammen von arammayhem.com
    // (CC BY 4.0, Quellenangabe nötig), daher unter der mittleren Karte die Quelle
    el.className = `aug-badge grade-${a.tier || 'none'}`;
    const credit = a.credit && i === 1 ? `<small>${t('Daten: arammayhem.com')}</small>` : '';
    el.innerHTML = `<b>${a.tier ? `${esc(a.tier)} Tier` : '–'}</b><span>${esc(a.why)}</span>${credit}`;
    return el;
  }));
}

// Kompakt-Modus: Cooldowns als Ringe. Riot liefert nur die Restzeit, daher gilt die längste Restzeit seit
// Beginn des Cooldowns als volle Länge
const RING = 100.5; // Umfang bei r = 16
const ICON_CHECK = '<svg class="check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
const cdMax = {};
function cdShare(s) {
  if (s.ready) {
    delete cdMax[s.key];
    return 0;
  }
  if (s.cd == null) return 1;
  cdMax[s.key] = Math.max(cdMax[s.key] || 0, s.cd);
  return cdMax[s.key] ? s.cd / cdMax[s.key] : 0;
}
function ringHtml(s) {
  const share = cdShare(s);
  const arc = s.ready ? '' : `<circle class="arc" cx="19" cy="19" r="16" stroke-dasharray="${(share * RING).toFixed(1)} ${RING}"/>`;
  const inner = s.ready ? ICON_CHECK : `<span>${s.cd == null ? '…' : fmtTime(s.cd)}</span>`;
  return `<div class="ring ${s.ready ? 'ready' : ''}"><div class="dial">` +
    `<svg class="bg" viewBox="0 0 38 38" aria-hidden="true"><circle class="trk" cx="19" cy="19" r="16"/>${arc}</svg>${inner}</div>` +
    `<label>${s.key}</label></div>`;
}
function tileHtml(s) {
  const value = s.ready ? t('bereit') : s.cd == null ? '…' : fmtTime(s.cd);
  const b = `<b class="${s.ready ? 'good' : ''}">${value}</b>`;
  // Icon und Taste, keine Namen (passen nicht in die Kachel); ohne Bild nur die Taste
  const img = s.icon ? `<img src="${esc(s.icon)}" alt="">` : '';
  return `<div class="spell item ${s.ready ? '' : 'cd'}">${img}<div><label>${s.key}</label>${b}</div></div>`;
}
const footHtml = (label, n, fmt) => `<span>${esc(label)} <b class="${cls(n)}">${fmt(n)}</b></span>`;

window.lol.onGame((g) => {
  lastGame = g;
  if (sbState.open) renderScoreboard();
  renderAugments(g.augments);
  renderGame(g);
});

function renderGame(g) {
  renderJungleRoute(g.jungleRoute);
  const small = isCompact();
  $('champ').textContent = g.champion;
  $('lvl').textContent = g.level;
  $('time').textContent = fmtTime(g.gameTime);
  $('kda').textContent = g.kda;
  $('kdaRatio').textContent = g.kdaRatio;
  $('cs').textContent = g.cs;
  // CS-Ziel: Schnitt gegen Ziel pro Minute (eigener Schnitt auf dem Champ oder Vorgabe)
  // (kompakt ist die Kachel zu schmal für „Ziel“: dort nur „6,1 / 7,4“)
  const ct = g.csTarget;
  const pm = num(Number(g.csPerMin), 1);
  // Dev „Perfekt-CS“: noch eine Zeile „max 107 · 84 %“ (nur im normalen Panel)
  const max = g.csMax != null && !small ? `\nmax ${g.csMax} · ${g.csMax ? Math.round((g.cs / g.csMax) * 100) : 0} %` : '';
  $('csm').textContent = (!ct ? `${pm}/min` : small ? `${pm} / ${num(ct.perMin, 1)}` : `${pm}/min\n${t('Ziel')} ${num(ct.perMin, 1)}`) + max;
  $('csm').className = ct || max ? 'target' + (ct && g.gameTime > 300 ? (Number(g.csPerMin) >= ct.perMin ? ' good' : ' bad') : '') : '';
  // ohne OCR liefert Riot CS nur in 10er-Schritten
  if (!g.csExact) $('cs').textContent = `${g.cs}+`;

  // Spar-Ziel aus dem Build; RECALL, sobald das Gold reicht. Im ARAM gibt es kein Recall:
  // dort KAUFEN, solange du tot bist (nur dann kommst du an den Shop)
  const b = g.build && !g.build.done ? g.build : null;
  $('build').hidden = !b;
  $('recall').hidden = !(b && b.affordable && (!g.aram || g.isDead));
  if (b) {
    $('build').classList.toggle('ready', b.affordable);
    $('buildLabel').textContent = b.name;
    $('buildMissing').textContent = b.affordable ? t('bezahlbar') : small ? `−${num(b.missing)} g` : t('noch {gold} g', { gold: num(b.missing) });
    $('buildFill').style.width = `${b.progress}%`;
    setHtml($('recall'), (g.aram ? ICON_BUY : ICON_RECALL) + (g.aram ? t('KAUFEN') : t('RECALL')));
  }

  // Skillpunkt offen: welche Fähigkeit laut Lolalytics dran ist, dahinter die Max-Reihenfolge
  const sk = g.skill && g.skill.next ? g.skill : null;
  $('skill').hidden = !sk;
  if (sk) {
    setHtml($('skill'), `${ICON_SKILL}SKILL <b>${esc(sk.next)}</b>${sk.open > 1 ? ` <small>+${sk.open - 1}</small>` : ''}` +
      (sk.priority ? ` <small class="prio">${esc(sk.priority.join(' › '))}</small>` : ''));
  }

  const m = g.mana;
  $('mana').hidden = !m;
  $('noMana').hidden = !(m && m.low);
  if (m) {
    $('mana').classList.toggle('low', m.low);
    $('manaVal').textContent = m.combo ? `${m.value} / ${m.max} · Combo ${m.combo}` : `${m.value} / ${m.max}`;
    $('manaFill').style.width = `${m.percent}%`;
    $('manaCombo').hidden = !m.combo;
    if (m.combo) $('manaCombo').style.left = `${Math.min(100, (m.combo / m.max) * 100)}%`;
  }

  // Summoner D/F, danach Item-Cooldowns (Taste 1–7 wie im Spiel)
  // Ward (Trinket, Taste 4) dahinter, nur auf Summoner's Rift
  const spellsNew = setHtml($('spells'), [...(moduleOn('spells') ? g.spells || [] : []), ...(moduleOn('items') ? g.itemCds || [] : []),
    ...(g.ward ? [g.ward] : [])]
    .map(small ? ringHtml : tileHtml)
    .join(''));
  // Bild fehlt bei Data Dragon (z. B. Sonder-Summoner)? Dann nur die Taste
  if (spellsNew) $('spells').querySelectorAll('img').forEach((img) => img.addEventListener('error', () => img.remove()));

  const xp = g.xp;
  $('xp').hidden = !xp;
  if (xp) {
    $('xpLabel').textContent = small ? `Lvl ${g.level + 1} ·` : `Lvl ${g.level} → ${g.level + 1}`;
    $('xpPct').textContent = `${xp.percent} %`;
    $('xpFill').style.width = `${xp.percent}%`;
    // Vasallen-XP gelten nur auf Summoner's Rift; im ARAM nur den Prozentwert zeigen
    $('xpMinions').hidden = !!g.aram;
    $('xpMinions').textContent = small
      ? `${xp.melee} Melee / ${xp.caster} Caster`
      : t('noch {xp} XP ≈ {melee} Melee / {caster} Caster · {waves} Wellen', { ...xp, xp: xp.missing, waves: num(Number(xp.waves), 1) });

  }
  $('gold').textContent = num(g.gold);
  $('ward').textContent = g.wardScore;

  // Kompakt: Lane-Gegner, CS-Diff und Team in einer Fußzeile
  const o = g.laneOpponent;
  const foot = [];
  if (small && o && moduleOn('lane')) {
    foot.push(footHtml(o.champion, g.myItemValue - o.itemValue, compact), footHtml('CS', g.cs - o.cs, signed));
  }
  if (small && moduleOn('team')) foot.push(footHtml('Team', g.teamItemDiff, compact));
  setHtml($('foot'), foot.join(''));

  if (o && !small) {
    const diff = g.myItemValue - o.itemValue;
    setHtml($('lane'),
      `<div class="row"><label>vs ${esc(o.champion)}${o.isDead ? ` (${t('tot')})` : ''}</label>` +
      `<b class="${cls(diff)}">${signed(diff)} g</b></div>` +
      `<div class="row"><label>${t('CS-Diff')}</label><b class="${cls(g.cs - o.cs)}">${signed(g.cs - o.cs)}</b></div>`);
  } else {
    setHtml($('lane'), '');
  }

  // Erste Runde im Jungle: gemessene Zeit (eine Weile nach dem Ende), bestes bisheriges zum Vergleich
  $('clear').hidden = !g.clear;
  if (g.clear) $('clearVal').textContent = `${fmtTime(g.clear.time)} · ${g.clear.cs} CS` + (g.clear.best != null ? ` · ${t('Bestzeit')} ${fmtTime(g.clear.best)}` : '');

  // Gank-Priorität (nur Jungler): Lane-Stand je Lane wie im Tab-Scoreboard, ohne Empfehlung
  $('gank').hidden = !g.lanes;
  if (g.lanes) {
    setHtml($('gank'), `<label>${t('Lane-Stand')}</label>` + g.lanes.map((l) =>
      `<span><i>${l.lane}</i><b class="${cls(l.gold)}">${signed(l.gold)} g</b><small>${l.kills[0]}:${l.kills[1]}${l.level ? ` · Lvl ${l.level > 0 ? '+' : ''}${num(l.level, 1)}` : ''}</small></span>`).join(''));
  }

  // Session-Ziel (im Stats-Fenster unter „Fortschritt“ gesetzt): Stand gegen das Ziel, „✓“/„✗“ steht im Text
  $('goal').hidden = !g.goal;
  if (g.goal) {
    const G = g.goal;
    const fmt = (v) => (G.key === 'deaths' ? String(v) : num(v, G.key === 'vision' ? 2 : 1));
    $('goalLabel').textContent = t({ deaths: 'Ziel: höchstens {n} Tode', csm: 'Ziel: {n} CS/min', kda: 'Ziel: KDA {n}',
      vision: 'Ziel: {n} Sicht/min' }[G.key], { n: fmt(G.target) });
    $('goalVal').textContent = `${fmt(G.now)} ${G.early ? '' : G.ok ? '✓' : '✗'}`.trim();
    $('goalVal').className = G.early ? 'early' : G.ok ? '' : 'bad';
  }

  // Rollen-Quest (Ring-Fortschritt vom HUD, nur Summoner's Rift): schmale Zeile unter dem Namen
  $('quest').hidden = g.quest == null;
  if (g.quest != null) {
    $('questPct').textContent = g.quest >= 0.99 ? t('fertig') : `${Math.round(g.quest * 100)} %`;
    $('questFill').style.width = `${Math.round(g.quest * 100)}%`;
  }
  $('quest').classList.toggle('done', g.quest != null && g.quest >= 0.99);

  const team = $('teamDiff');
  team.textContent = `${signed(g.teamItemDiff)} g`;
  team.className = cls(g.teamItemDiff);
}

// Tab-Scoreboard: Badges relativ zum gefundenen Anker (Mitte des Scoreboard-Ornaments)
let lastGame = null;
let sbState = { open: false };
function renderScoreboard() {
  const sb = lastGame && lastGame.scoreboard;
  const open = sbState.open && !!sb;
  document.body.classList.toggle('sb-open', open);
  $('sb').hidden = !open;
  if (!open) return;
  const { anchor: a, offsets: o } = sbState;

  const team = $('sbTeam');
  team.style.left = `${a.x}px`;
  team.style.top = `${a.y + o.top - 8}px`;
  team.innerHTML = `<label>${t('Team-Itemwert')}</label><b class="${cls(sb.teamDiff)}">${signed(sb.teamDiff)} g</b>`;

  // Positionen per element.style setzen: die CSP blockt style-Attribute aus innerHTML
  const rows = $('sbRows');
  rows.replaceChildren();
  sb.rows.forEach((r, i) => {
    if (r.diff == null || o.rows[i] == null) return;
    const el = document.createElement('div');
    el.className = `sb-row ${cls(r.diff)}`;
    // über dem Trinket-Slot der Zeile; dein Team steht links (ORDER) oder rechts (CHAOS)
    el.style.left = `${a.x + (sb.myTeamLeft ? o.badgeX : o.badgeXRight)}px`;
    el.style.top = `${a.y + o.rows[i] + o.badgeDy}px`;
    // kompakt, damit es über den Ward-Slot passt; verglichen wird mit der Zeile gegenüber
    el.textContent = compact(r.diff);
    rows.appendChild(el);
  });
}
window.lol.onScoreboard((s) => {
  sbState = s;
  renderScoreboard();
});

// Bearbeiten-Modus: Panel verschieben, Position wird in config.json gespeichert
window.lol.onPanelPos((p) => {
  const c = clampPos(p.x, p.y);
  panel.style.left = `${c.x}px`;
  panel.style.top = `${c.y}px`;
  if (!$('settings').hidden) placeSettings(); // kommt beim Laden nach „settings-open“
  reportRects();
});
// Lage der bedienbaren Teile an main melden: nur in ihrer Nähe werden Mausbewegungen ans Overlay
// weitergeleitet; über dem Panel schaltet main die Hover-Transparenz
const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};
function reportRects() {
  const box = $('settings');
  window.lol.hitRects({ grip: rectOf(grip), gear: rectOf($('gear')), panel: rectOf(panel), settings: box.hidden ? null : rectOf(box) });
}
window.lol.onEditMode((on) => document.body.classList.toggle('edit', on));
window.lol.onPanelHover((on) => document.body.classList.toggle('panel-hover', on));

// Maus über einem bedienbaren Teil: Overlay fängt die Maus (Klicks gehen dann nicht ans Spiel).
// hot = Teile, über denen die Maus gerade steht; holding = Regler wird gerade gezogen
let drag = null;
let holding = false;
let hotSent = false;
const hot = new Set();
const grip = $('grip');
function sendHover() {
  const on = hot.size > 0 || holding || !!drag;
  document.body.classList.toggle('ui-hot', on);
  if (on === hotSent) return;
  hotSent = on;
  window.lol.uiHover(on);
}
function hotZone(el, active = () => true) {
  el.addEventListener('mouseenter', () => {
    if (!active()) return;
    hot.add(el);
    sendHover();
  });
  el.addEventListener('mouseleave', () => {
    if (hot.delete(el)) sendHover();
  });
}
hotZone(grip);
hotZone($('gear'));
hotZone($('settings'));
hotZone(panel, () => settings && !settings.clickThrough);

panel.addEventListener('mousedown', (e) => {
  if (e.target === $('gear')) return;
  const free = document.body.classList.contains('edit') || (settings && !settings.clickThrough);
  if (!free && e.target !== grip) return;
  drag = { dx: e.clientX - panel.offsetLeft, dy: e.clientY - panel.offsetTop };
  document.body.classList.add('dragging');
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const c = clampPos(e.clientX - drag.dx, e.clientY - drag.dy);
  panel.style.left = `${c.x}px`;
  panel.style.top = `${c.y}px`;
});
window.addEventListener('mouseup', () => {
  holding = false;
  if (drag) {
    drag = null;
    document.body.classList.remove('dragging');
    window.lol.panelMoved({ x: panel.offsetLeft, y: panel.offsetTop });
    reportRects();
    if (!$('settings').hidden) placeSettings();
  }
  sendHover();
});

// Overlay-Einstellungen (⚙ im Panel-Kopf oder Tray): Module ein/aus, UI-Größe, Transparenz, Klick-durch.
// Gespeichert in config.json unter „overlay“; main liest dieselben Werte (abgeschaltete Module werden dort
// gar nicht erst vom Bildschirm gelesen)
const MODULES = [
  ['Panel', [
    ['stats', 'Werte (KDA, CS, Gold, Vision)'],
    ['skill', 'Skill-Hinweis'],
    ['build', 'Spar-Ziel und Recall'],
    ['mana', 'Mana und NO MANA'],
    ['spells', 'Summoner-Cooldowns'],
    ['items', 'Item-Cooldowns'],
    ['xp', 'XP bis Level-Up'],
    ['lane', 'Lane-Gegner'],
    ['team', 'Team-Itemwert'],
    ['ward', 'Ward-Cooldown'],
    ['csTarget', 'CS-Ziel'],
    ['clear', 'Erste Runde (Jungle)'],
    ['gank', 'Lane-Stand (Jungle)'],
    ['quest', 'Rollen-Quest'],
    ['goal', 'Session-Ziel'],
  ]],
  ['Weitere Overlays', [
    ['scoreboard', 'Tab: Itemwert je Spieler'],
    ['augments', 'Mayhem: Augment-Tiers'],
    ['jungleRoute', 'Jungle-Route auf der Minimap'],
    ['review', 'Rückblick: Tode und Ulti mitlesen'],
  ]],
];
// [Schlüssel, Name, min, max, Schritt, Anzeige]
const SLIDERS = [
  ['scale', 'UI-Größe', 0.7, 1.5, 0.05, (v) => num(v, 2)],
  ['bgTransparency', 'Hintergrund-Transparenz', 0, 90, 5, (v) => `${v} %`],
  ['hoverTransparency', 'Hover-Transparenz', 0, 90, 5, (v) => `${v} %`],
  ['jungleSize', 'Jungle-Route: Größe', 0.5, 2, 0.1, (v) => num(v, 1)],
  ['jungleTransparency', 'Jungle-Route: Transparenz', 0, 90, 5, (v) => `${v} %`],
];
let settings = null;
const moduleOn = (key) => !settings || settings.modules[key] !== false;
const isCompact = () => !!(settings && settings.compact);

function buildSettings() {
  const toggle = (attr, key, name) =>
    `<label class="toggle"><span>${esc(t(name))}</span><input type="checkbox" ${attr}="${key}"><i></i></label>`;
  $('settingsBody').innerHTML =
    MODULES.map(([title, list]) => `<h4>${t(title)}</h4>${list.map(([k, n]) => toggle('data-mod', k, n)).join('')}`).join('') +
    `<h4>${t('Allgemein')}</h4>` +
    toggle('data-opt', 'compact', 'Kompakt-Modus') +
    toggle('data-opt', 'clickThrough', 'Klick-durch') +
    SLIDERS.map(([k, n, min, max, step]) =>
      `<div class="slider"><label><span>${t(n)}</span><output data-out="${k}"></output></label>` +

      `<input type="range" data-range="${k}" min="${min}" max="${max}" step="${step}"></div>`).join('');

  $('settingsBody').querySelectorAll('[data-mod]').forEach((el) => el.addEventListener('change', () =>
    save({ modules: { [el.dataset.mod]: el.checked } })));
  $('settingsBody').querySelectorAll('[data-opt]').forEach((el) => el.addEventListener('change', () =>
    save({ [el.dataset.opt]: el.checked })));
  $('settingsBody').querySelectorAll('[data-range]').forEach((el) => {
    const key = el.dataset.range;
    // beim Ziehen sofort anzeigen, gespeichert wird beim Loslassen
    el.addEventListener('input', () => applySettings({ ...settings, [key]: Number(el.value) }));
    el.addEventListener('change', () => save({ [key]: Number(el.value) }));
  });
  $('settings').addEventListener('mousedown', () => {
    holding = true;
    sendHover();
  });
  $('settingsClose').addEventListener('click', () => window.lol.settingsOpen(false));
  $('gear').addEventListener('click', () => window.lol.settingsOpen($('settings').hidden));
}
const save = (patch) => window.lol.setOverlay(patch).then(applySettings);

function applySettings(s) {
  settings = s;
  const root = document.documentElement.style;
  root.setProperty('--ui', s.scale);
  root.setProperty('--bg-a', (1 - s.bgTransparency / 100).toFixed(2));
  root.setProperty('--hover-op', (1 - s.hoverTransparency / 100).toFixed(2));
  for (const [, list] of MODULES) for (const [k] of list) document.body.classList.toggle(`off-${k}`, s.modules[k] === false);
  document.body.classList.toggle('click-through', s.clickThrough);
  document.body.classList.toggle('compact', !!s.compact);
  // Kompakt-Modus und Fußzeile hängen an den Einstellungen: sofort neu zeichnen, nicht erst beim nächsten Abruf
  if (lastGame) renderGame(lastGame);
  renderJungleRoute();

  const body = $('settingsBody');
  body.querySelectorAll('[data-mod]').forEach((el) => { el.checked = s.modules[el.dataset.mod] !== false; });
  body.querySelectorAll('[data-opt]').forEach((el) => { el.checked = !!s[el.dataset.opt]; });
  for (const [k, , , , , show] of SLIDERS) {
    const el = body.querySelector(`[data-range="${k}"]`);
    if (Number(el.value) !== s[k]) el.value = s[k];
    body.querySelector(`[data-out="${k}"]`).textContent = show(s[k]);
  }
  // Panel kann durch Ausblenden oder Skalieren die Größe ändern: Maus-Zonen neu melden
  requestAnimationFrame(reportRects);
}

// Neben das Panel, auf die Seite mit mehr Platz. Abstand nach der größten UI-Größe: so bleibt das Fenster beim
// Ziehen am Größen-Regler stehen (rückte es mit, rutschte der Regler unter der Maus weg) und das Panel wächst
// trotzdem nie darunter
const MAX_SCALE = SLIDERS.find(([k]) => k === 'scale')[3];
function placeSettings() {
  const box = $('settings');
  const left = panel.offsetLeft;
  const top = panel.offsetTop;
  const w = box.offsetWidth;
  const reach = left + panel.offsetWidth * MAX_SCALE + 12;
  const right = reach + w <= window.innerWidth;
  box.style.left = `${right ? reach : Math.max(8, left - 12 - w)}px`;
  box.style.top = `${Math.max(8, Math.min(top, window.innerHeight - box.offsetHeight - 8))}px`;
  reportRects(); // Verschieben meldet kein ResizeObserver
}

// Overlay ausgeblendet (Spielende): kein mouseleave mehr, daher Maus-Zustand hier vergessen; main setzt
// seine Seite beim Ausblenden ebenfalls zurück
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  hot.clear();
  holding = false;
  hotSent = false;
  document.body.classList.remove('ui-hot', 'panel-hover');
});

buildSettings();
new ResizeObserver(reportRects).observe(panel);
new ResizeObserver(reportRects).observe($('settings'));
window.lol.onOverlaySettings(applySettings);
window.lol.onSettingsOpen((on) => {
  $('settings').hidden = !on;
  document.body.classList.toggle('settings-open', on);
  if (on) placeSettings();
  else {
    hot.delete($('settings'));
    holding = false;
    sendHover();
  }
  reportRects();
});
