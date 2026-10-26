// Sprache für die Render-Werkzeuge: --en rendert die englische Oberfläche, die Bilder bekommen dann „-en“ im Namen.
// Beantwortet auch die Sprachabfrage des Preloads (sonst bliebe das Fenster beim Laden hängen).
const { ipcMain } = require('electron');
const i18n = require('../renderer/i18n');

i18n.setLang(process.argv.includes('--en') ? 'en' : 'de');
ipcMain.on('i18n:lang', (e) => {
  e.returnValue = i18n.lang();
});

module.exports = { ddLang: i18n.lang() === 'en' ? 'en_US' : 'de_DE', suffix: i18n.lang() === 'en' ? '-en' : '' };
