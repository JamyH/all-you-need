// Tab-Taste im Spiel abfragen: nur „ist sie gerade gedrückt?“ (GetAsyncKeyState), ~40-mal pro Sekunde und
// nur während eines Spiels. Ein globaler Tastatur-/Maus-Hook (vorher uiohook) bekam jede Mausbewegung mit,
// bei einer Gaming-Maus bis zu 1000 pro Sekunde, nur um eine Taste zu sehen. Das Spiel bekommt die Taste
// in beiden Fällen ganz normal.
const koffi = require('koffi');

const VK_TAB = 0x09;
const POLL_MS = 25;

let getKey = null;
let timer = null;
let down = false;

function start(onDown, onUp) {
  if (timer) return;
  if (!getKey) getKey = koffi.load('user32.dll').func('short __stdcall GetAsyncKeyState(int vKey)');
  down = false;
  timer = setInterval(() => {
    const now = (getKey(VK_TAB) & 0x8000) !== 0; // oberstes Bit: Taste ist jetzt unten
    if (now === down) return;
    down = now;
    (now ? onDown : onUp)();
  }, POLL_MS);
}

function stop() {
  clearInterval(timer);
  timer = null;
  down = false;
}

module.exports = { start, stop };
