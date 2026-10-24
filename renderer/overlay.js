const $ = (id) => document.getElementById(id);
const panel = $('panel');

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const signed = (n) => `${n >= 0 ? '+' : ''}${n.toLocaleString('de-DE')}`;
const cls = (n) => (n >= 0 ? 'good' : 'bad');
// +450 / +1,2k / -12k: höchstens 5 Zeichen
const compact = (n) => {
  const a = Math.abs(n);
  const v = a < 1000 ? String(a) : a < 10000 ? `${(a / 1000).toFixed(1).replace('.', ',')}k` : `${Math.round(a / 1000)}k`;
  return `${n >= 0 ? '+' : '-'}${v}`;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

window.lol.onGame((g) => {
  lastGame = g;
  if (sbState.open) renderScoreboard();
  $('champ').textContent = `${g.champion} · Lvl ${g.level}`;
  $('time').textContent = fmtTime(g.gameTime);
  $('kda').textContent = g.kda;
  $('kdaRatio').textContent = g.kdaRatio;
  $('cs').textContent = g.cs;
  $('csm').textContent = `${g.csPerMin}/min`;
  // ohne OCR liefert Riot CS nur in 10er-Schritten
  if (!g.csExact) $('cs').textContent = `${g.cs}+`;

  // Spar-Ziel aus dem Build; RECALL, sobald das Gold reicht
  const b = g.build && !g.build.done ? g.build : null;
  $('build').hidden = !b;
  $('recall').hidden = !(b && b.affordable);
  if (b) {
    $('build').classList.toggle('ready', b.affordable);
    $('buildLabel').textContent = b.name;
    $('buildMissing').textContent = b.affordable ? 'bezahlbar' : `noch ${b.missing.toLocaleString('de-DE')} g`;
    $('buildFill').style.width = `${b.progress}%`;
    $('recall').textContent = 'RECALL';
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

  $('spells').innerHTML = (g.spells || [])
    .map((s) => {
      const value = s.ready ? 'bereit' : s.cd == null ? '…' : fmtTime(s.cd);
      return `<div class="spell ${s.ready ? '' : 'cd'}"><label>${s.key} · ${esc(s.name)}</label>` +
        `<b class="${s.ready ? 'good' : ''}">${value}</b></div>`;
    })
    .join('');

  const xp = g.xp;
  $('xp').hidden = !xp;
  if (xp) {
    $('xpLabel').textContent = `Lvl ${g.level} → ${g.level + 1}`;
    $('xpPct').textContent = `${xp.percent} %`;
    $('xpFill').style.width = `${xp.percent}%`;
    $('xpMinions').textContent = `noch ${xp.missing} XP ≈ ${xp.melee} Melee / ${xp.caster} Caster · ${xp.waves} Wellen`;
  }
  $('gold').textContent = g.gold.toLocaleString('de-DE');
  $('ward').textContent = g.wardScore;

  const o = g.laneOpponent;
  if (o) {
    const diff = g.myItemValue - o.itemValue;
    $('lane').innerHTML =
      `<div class="row"><label>vs ${o.champion}${o.isDead ? ' (tot)' : ''}</label>` +
      `<b class="${cls(diff)}">${signed(diff)} g</b></div>` +
      `<div class="row"><label>CS-Diff</label><b class="${cls(g.cs - o.cs)}">${signed(g.cs - o.cs)}</b></div>`;
  } else {
    $('lane').innerHTML = '';
  }

  const t = $('teamDiff');
  t.textContent = `${signed(g.teamItemDiff)} g`;
  t.className = cls(g.teamItemDiff);
});

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
  team.innerHTML = `<label>Team-Itemwert</label><b class="${cls(sb.teamDiff)}">${signed(sb.teamDiff)} g</b>`;

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
  panel.style.left = `${p.x}px`;
  panel.style.top = `${p.y}px`;
});
window.lol.onEditMode((on) => document.body.classList.toggle('edit', on));

let drag = null;
const grip = $('grip');
grip.addEventListener('mouseenter', () => window.lol.gripHover(true));
grip.addEventListener('mouseleave', () => !drag && window.lol.gripHover(false));
panel.addEventListener('mousedown', (e) => {
  if (!document.body.classList.contains('edit') && e.target !== grip) return;
  drag = { dx: e.clientX - panel.offsetLeft, dy: e.clientY - panel.offsetTop };
  document.body.classList.add('dragging');
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  panel.style.left = `${e.clientX - drag.dx}px`;
  panel.style.top = `${e.clientY - drag.dy}px`;
});
window.addEventListener('mouseup', () => {
  if (!drag) return;
  drag = null;
  document.body.classList.remove('dragging');
  window.lol.gripHover(false);
  window.lol.panelMoved({ x: panel.offsetLeft, y: panel.offsetTop });
});
