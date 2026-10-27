// Spielfenster von League finden: Innenbereich (ohne Titelleiste und Rahmen) in physischen Bildschirm-Pixeln.
// So stimmen die Bildschirm-Regionen auch im Fenstermodus und wenn League kleiner rechnet als der Bildschirm
// (z. B. 1920×1080 mittig auf 3440×1440). Nur Fensterposition abfragen, nichts im Spiel lesen.
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const RECT = koffi.struct('FarmyRect', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
const POINT = koffi.struct('FarmyPoint', { x: 'long', y: 'long' });
const FindWindowW = user32.func('intptr __stdcall FindWindowW(str16 cls, str16 title)');
const GetClientRect = user32.func('bool __stdcall GetClientRect(intptr h, _Out_ FarmyRect *r)');
const ClientToScreen = user32.func('bool __stdcall ClientToScreen(intptr h, _Inout_ FarmyPoint *p)');
const IsIconic = user32.func('bool __stdcall IsIconic(intptr h)');
const GetForegroundWindow = user32.func('intptr __stdcall GetForegroundWindow()');

// { x, y, width, height } oder null (kein Spiel, minimiert)
function rect() {
  try {
    const h = FindWindowW('RiotWindowClass', null); // Fensterklasse des Spiels (der Client heißt anders)
    if (!h || IsIconic(h)) return null;
    const r = {};
    const p = { x: 0, y: 0 };
    if (!GetClientRect(h, r) || !ClientToScreen(h, p)) return null;
    const width = r.right - r.left, height = r.bottom - r.top;
    return width > 200 && height > 200 ? { x: p.x, y: p.y, width, height } : null;
  } catch {
    return null;
  }
}

// Liegt das Spiel vorne? others: Fenster-Handles, die ebenfalls zählen (Farmys eigene Fenster).
// Ohne Spielfenster (z. B. Fensterklasse unbekannt) lieber true, damit das Overlay nicht ganz verschwindet
function focused(others = []) {
  try {
    const h = FindWindowW('RiotWindowClass', null);
    if (!h) return true;
    const fg = GetForegroundWindow();
    return fg === h || others.includes(fg);
  } catch {
    return true;
  }
}

module.exports = { rect, focused };
