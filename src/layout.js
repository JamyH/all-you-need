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
  // Item-Slots 0–5 (Live-API „slot“): 3 Spalten × 2 Zeilen, dahinter Slot 6 = Trinket
  items: { dx: 150, dy: -118, size: 35, pitchX: 43.5, pitchY: 41, trinket: { dx: 281, dy: -114, width: 31, height: 32 } },
  xpArc: [[1443, 1313], [1447, 1330], [1452, 1345], [1455, 1358], [1456, 1370], [1455, 1382], [1451, 1393], [1446, 1401]]
    .map(([x, y]) => [x - REF.width / 2, y - REF.height]),
  scoreboard: { rows: [59, 160, 261, 362, 463], top: -170, badgeX: -11, badgeXRight: 706, badgeDy: -22 },
  // Mayhem-Augment-Angebot: drei Karten mittig, Abstand der Kartenmitten (dx), Name als weiße Zeile,
  // Oberkante des beigen Kartenrahmens als Erkennungsmerkmal; Badges über den Karten (y absolut)
  augments: { pitch: 490, name: { y: 565, height: 50, half: 180 }, frame: { y: 255, height: 25, half: 150 }, badgeY: 225 },
  // Minimap unten rechts (FlipMiniMap=1: unten links), quadratisch, wächst mit MinimapScale (0–3).
  // Vermessen 27.10. bei MinimapScale 3: Karte 507 px, 25 px vom rechten und 27 px vom unteren Rand.
  // Zuwachs je Stufe geschätzt (nur diese eine Stufe gemessen), daraus die Kantenlänge bei Stufe 0
  minimap: { size: 507 / 1.75, growth: 0.25, right: 25, bottom: 27 },
};

// width/height: Innenbereich des Spielfensters; origin: dessen linke obere Ecke auf dem Bildschirm
function compute(width, height, globalScale = 0, minimap = {}, origin = { x: 0, y: 0 }) {
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
  return shift({
    factors: { res: +res.toFixed(3), hud: +hud.toFixed(3) },
    cs: {
      x: r(width - BASE.cs.right * res), y: r(BASE.cs.y * res),
      width: r(BASE.cs.width * res), height: r(BASE.cs.height * res),
    },
    spells: { d: spell(BASE.spells.d), f: spell(BASE.spells.f) },
    items: [
      ...[0, 1, 2, 3, 4, 5].map((i) => {
        const it = BASE.items;
        return spell({ dx: it.dx + (i % 3) * it.pitchX, dy: it.dy + Math.floor(i / 3) * it.pitchY, width: it.size, height: it.size });
      }),
      spell(BASE.items.trinket),
    ],
    xpArc: BASE.xpArc.map(([dx, dy]) => bottom(dx, dy)),
    minimap: (() => {
      const m = BASE.minimap;
      const size = r(m.size * res * (1 + m.growth * (minimap.scale ?? 1)));
      const side = r(m.right * res);
      return { x: minimap.flip ? side : width - side - size, y: height - r(m.bottom * res) - size, size };
    })(),
    augments: [-1, 0, 1].map((i) => {
      const a = BASE.augments;
      const x = cx + i * a.pitch * res;
      return {
        x: r(x),
        badgeY: r(a.badgeY * res),
        name: { x: r(x - a.name.half * res), y: r(a.name.y * res), width: r(2 * a.name.half * res), height: r(a.name.height * res) },
        frame: { x: r(x - a.frame.half * res), y: r(a.frame.y * res), width: r(2 * a.frame.half * res), height: r(a.frame.height * res) },
      };
    }),
    scoreboard: {
      scale: +res.toFixed(3),
      offsets: {
        rows: sb.rows.map((v) => r(v * res)), top: r(sb.top * res),
        badgeX: r(sb.badgeX * res), badgeXRight: r(sb.badgeXRight * res), badgeDy: r(sb.badgeDy * res),
      },
    },
  }, origin);
}

// Alle Bildschirm-Koordinaten um die Fensterecke verschieben (Scoreboard-Abstände sind relativ zum Anker)
function shift(L, { x: ox, y: oy }) {
  if (!ox && !oy) return L;
  const box = (b) => ({ ...b, x: b.x + ox, y: b.y + oy });
  return {
    ...L,
    cs: box(L.cs),
    spells: { d: box(L.spells.d), f: box(L.spells.f) },
    items: L.items.map(box),
    xpArc: L.xpArc.map(([x, y]) => [x + ox, y + oy]),
    minimap: box(L.minimap),
    augments: L.augments.map((a) => ({ x: a.x + ox, badgeY: a.badgeY + oy, name: box(a.name), frame: box(a.frame) })),
  };
}

module.exports = { compute, REF };
