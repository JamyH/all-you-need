// Tasten im Spiel abfragen: nur „ist sie gerade gedrückt?“ (GetAsyncKeyState), ~40-mal pro Sekunde und
// nur während eines Spiels. Ein globaler Tastatur-/Maus-Hook (vorher uiohook) bekam jede Mausbewegung mit,
// bei einer Gaming-Maus bis zu 1000 pro Sekunde, nur um eine Taste zu sehen. Das Spiel bekommt die Taste
// in beiden Fällen ganz normal.
// Auch die Tastenkürzel (Strg+Shift+O/E/S) laufen im Spiel hierüber: League nimmt sich von globalen Hotkeys
// aus (RegisterHotKey kommt nicht an, solange das Spiel vorne ist), der Tastenzustand ist trotzdem lesbar.
const koffi = require('koffi');

const VK_TAB = 0x09;
const POLL_MS = 25;
const VK_NAMES = { ctrl: 0x11, control: 0x11, commandorcontrol: 0x11, shift: 0x10, alt: 0x12, tab: 0x09, space: 0x20 };

let getKey = null;
let timer = null;
let down = false;
let combos = [];

// „Ctrl+Shift+S“ -> [0x11, 0x10, 0x53]; null, wenn eine Taste unbekannt ist
function parseAccelerator(acc) {
  const vks = String(acc || '').split('+').map((part) => {
    const k = part.trim().toLowerCase();
    if (VK_NAMES[k]) return VK_NAMES[k];
    if (/^[a-z0-9]$/.test(k)) return k.toUpperCase().charCodeAt(0);
    if (/^f([1-9]|1[0-2])$/.test(k)) return 0x6f + Number(k.slice(1));
    return null;
  });
  return vks.length && !vks.includes(null) ? vks : null;
}

const isDown = (vk) => (getKey(vk) & 0x8000) !== 0; // oberstes Bit: Taste ist jetzt unten

// onDown/onUp: Tab; shortcuts: [{ accelerator, run }], ausgelöst beim Drücken der ganzen Kombination
function start(onDown, onUp, shortcuts = []) {
  if (timer) return;
  if (!getKey) getKey = koffi.load('user32.dll').func('short __stdcall GetAsyncKeyState(int vKey)');
  down = false;
  combos = shortcuts.map((s) => ({ vks: parseAccelerator(s.accelerator), run: s.run, held: true })).filter((c) => c.vks);
  timer = setInterval(() => {
    const now = isDown(VK_TAB);
    if (now !== down) {
      down = now;
      (now ? onDown : onUp)();
    }
    for (const c of combos) {
      const all = c.vks.every(isDown);
      if (all && !c.held) c.run();
      c.held = all; // beim Start als gehalten markiert: eine schon gedrückte Kombination löst nicht aus
    }
  }, POLL_MS);
}

function stop() {
  clearInterval(timer);
  timer = null;
  down = false;
  combos = [];
}

module.exports = { start, stop };
