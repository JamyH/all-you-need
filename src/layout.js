// Rechnet alle Bildschirm-Regionen für die aktuelle Auflösung und HUD-Größe aus.
// Grundlage ist eine Kalibrierung bei 3440×1440 mit HUD-Skalierung 0 (GlobalScale=0).
// Gemessen: League skaliert seine Oberfläche mit der Bildschirmhöhe; die untere Leiste (Portrait,
// Fähigkeiten, Summoner, XP-Bogen) wächst zusätzlich mit der HUD-Skalierung, bei 100 um Faktor 1,5,
// und bleibt dabei unten mittig. Die Anzeige oben rechts (CS) und das Tab-Scoreboard wachsen nicht mit.
const REF = { width: 3440, height: 1440 };
const HUD_GROWTH = 0.5; // Faktor 1 + 0.5 * GlobalScale

// Referenzwerte in Pixeln bei 3440×1440, HUD 0
const BASE = {
  cs: { right: 190, y: 4, width: 78, height: 30 }, // Abstand vom rechten Rand
  // untere Leiste: Koordinaten relativ zur Bildschirmmitte unten (dx, dy nach oben negativ)
  spells: {
    d: { dx: 42, dy: -114, width: 32, height: 32 },
    f: { dx: 87, dy: -114, width: 32, height: 32 },
  },
  xpArc: [[1443, 1313], [1447, 1330], [1452, 1345], [1455, 1358], [1456, 1370], [1455, 1382], [1451, 1393], [1446, 1401]]
    .map(([x, y]) => [x - REF.width / 2, y - REF.height]),
  scoreboard: { rows: [59, 160, 261, 362, 463], top: -170, badgeX: -11, badgeXRight: 706, badgeDy: -22 },
};

function compute(width, height, globalScale = 0) {
  const res = height / REF.height; // Auflösung
  const hud = res * (1 + HUD_GROWTH * (globalScale || 0)); // untere Leiste zusätzlich mit HUD-Größe
  const cx = width / 2;
  const r = Math.round;
  const bottom = (dx, dy) => [r(cx + dx * hud), r(height + dy * hud)];

  const spell = (s) => {
    const [x, y] = bottom(s.dx, s.dy);
    return { x, y, width: r(s.width * hud), height: r(s.height * hud) };
  };
  const sb = BASE.scoreboard;
  return {
    factors: { res: +res.toFixed(3), hud: +hud.toFixed(3) },
    cs: {
      x: r(width - BASE.cs.right * res), y: r(BASE.cs.y * res),
      width: r(BASE.cs.width * res), height: r(BASE.cs.height * res),
    },
    spells: { d: spell(BASE.spells.d), f: spell(BASE.spells.f) },
    xpArc: BASE.xpArc.map(([dx, dy]) => bottom(dx, dy)),
    scoreboard: {
      scale: +res.toFixed(3),
      offsets: {
        rows: sb.rows.map((v) => r(v * res)), top: r(sb.top * res),
        badgeX: r(sb.badgeX * res), badgeXRight: r(sb.badgeXRight * res), badgeDy: r(sb.badgeDy * res),
      },
    },
  };
}

module.exports = { compute, REF };
