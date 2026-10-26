// Übersetzungen. Deutsch ist die Ausgangssprache: der deutsche Text ist der Schlüssel, hier steht nur Englisch.
// {name} im Text wird durch den gleichnamigen Wert ersetzt. Läuft im Hauptprozess (require) und in den Fenstern
// (<script>, die Sprache kommt dort vom Preload); fehlt eine Übersetzung, bleibt der deutsche Text stehen.
(function (root) {
  // LoL-Begriffe wie in Riots englischen Texten (Spiel- und Client-Stringtables, z. B. Recall, Ready, Victory,
  // Defeat, Unranked, Emerald, Target Dummy, Summoner Spells, Rune Page, Item Sets, champ select, Window Mode,
  // Borderless); Item-, Champion-, Runen- und Summoner-Namen kommen ohnehin aus Data Dragon (en_US)
  const EN = {
    // Overlay-Panel
    'bereit': 'ready',
    'bezahlbar': 'affordable',
    'noch {gold} g': '{gold} g left',
    'KAUFEN': 'PURCHASE',
    'RECALL': 'RECALL',
    'noch {xp} XP ≈ {melee} Melee / {caster} Caster · {waves} Wellen': '{xp} XP left ≈ {melee} melee / {caster} caster · {waves} waves',
    'tot': 'dead',
    'CS-Diff': 'CS diff',
    'Team-Itemwert': 'Team item value',
    'nicht erkannt': 'not recognized',
    'Daten: arammayhem.com': 'Data: arammayhem.com',
    'Nächstes Item': 'Next item',
    'Ziehen zum Verschieben': 'Drag to move',
    'Ziehen zum Verschieben · Strg+Shift+E beendet': 'Drag to move · Ctrl+Shift+E to finish',
    'Overlay-Einstellungen': 'Overlay settings',
    'Schließen': 'Close',
    // Overlay-Einstellungen
    'Panel': 'Panel',
    'Werte (KDA, CS, Gold, Vision)': 'Stats (KDA, CS, Gold, Vision)',
    'Skill-Hinweis': 'Skill hint',
    'Spar-Ziel und Recall': 'Savings goal and Recall',
    'Mana und NO MANA': 'Mana and NO MANA',
    'Summoner-Cooldowns': 'Summoner Spell cooldowns',
    'Item-Cooldowns': 'Item cooldowns',
    'XP bis Level-Up': 'XP to Level Up',
    'Lane-Gegner': 'Lane opponent',
    'Weitere Overlays': 'More overlays',
    'Tab: Itemwert je Spieler': 'Tab: item value per player',
    'Mayhem: Augment-Tiers': 'Mayhem: augment tiers',
    'Allgemein': 'General',
    'Kompakt-Modus': 'Compact mode',
    'Klick-durch': 'Click-through',
    'UI-Größe': 'UI size',
    'Hintergrund-Transparenz': 'Background transparency',
    'Hover-Transparenz': 'Hover transparency',
    // Augment- und Splitter-Tiers
    'keine Daten': 'no data',
    'Falle mit {champ}': 'trap with {champ}',
    'God-Combo mit {champ}': 'god combo with {champ}',
    'Bug-Combo mit {champ}': 'bug combo with {champ}',
    'starke Combo mit {champ}': 'strong combo with {champ}',
    'Geheimtipp für {champ}': 'hidden gem for {champ}',
    '{rate} % der {champ}-Spieler': '{rate}% of {champ} players',
    'Spaß-Combo mit {champ}': 'fun combo with {champ}',
    'oft gewählt': 'often picked',
    'selten gewählt': 'rarely picked',
    'Build unbekannt': 'build unknown',
    'passt zu {hits} von {total} Build-Items': 'fits {hits} of {total} build items',
    'passt nicht zum Build': "doesn't fit the build",
    'Heilung nützt jedem': 'healing helps everyone',
    'nützt jedem': 'helps everyone',
    'nur Gold': 'gold only',
    'Glückssache': 'luck of the draw',
    // Tray, Menü und Hinweise
    'Stats-Fenster öffnen': 'Open stats window',
    'Overlay anzeigen': 'Show overlay',
    'Panel verschieben': 'Move panel',
    'Spiel automatisch annehmen': 'Auto-accept match',
    'Mit Windows starten': 'Start with Windows',
    'League komplett beenden …': 'Quit League completely …',
    'League komplett beenden': 'Quit League completely',
    'Beenden': 'Quit',
    'Abbrechen': 'Cancel',
    'Farmy {version} läuft': 'Farmy {version} is running',
    'Farmy läuft': 'Farmy is running',
    'Farmy läuft weiter': 'Farmy keeps running',
    'Du findest es hier unten rechts im Infobereich. Rechtsklick aufs Icon für Einstellungen und Beenden.':
      'You can find it here in the notification area. Right-click the icon for settings and Quit.',
    'Das Overlay bleibt aktiv. Beenden über Rechtsklick aufs Icon hier unten rechts.':
      'The overlay stays active. To quit, right-click the icon down here in the corner.',
    'League läuft im Vollbild': 'League is running in Full Screen',
    'Dort ist das Overlay nicht zu sehen. Im Spiel: Einstellungen → Video → Fenstermodus „Randlos“.':
      'The overlay is not visible there. In game: Settings → Video → Window Mode "Borderless".',
    'Riot Client, League-Client und ein laufendes Spiel werden sofort beendet.':
      'Riot Client, League client and any running game will be closed immediately.',
    'Gedacht für den Fall, dass League nach einem Vanguard-Fehler hängt. Ein laufendes Spiel verlässt du damit; danach League normal neu starten.':
      'Meant for when League hangs after a Vanguard error. You will leave a running game; afterwards, start League again as usual.',
    'League lief gar nicht.': 'League was not running.',
    'Noch nicht beendet: {list}. Dann bitte im Task-Manager.': 'Still running: {list}. Please end it in Task Manager.',
    'League und Riot Client sind beendet. Du kannst League jetzt neu starten.': 'League and Riot Client are closed. You can start League again now.',
    // Meldungen zu Runen, Summoner Spells und Item-Sets
    'League-Client läuft nicht': 'League client is not running',
    'League-Client läuft nicht.': 'League client is not running.',
    'Riot-Empfehlung': 'Riot recommendation',
    'Für {champ} ist keine Runenseite gespeichert.': 'No Rune Page saved for {champ}.',
    'Runen für {champ} gesetzt (Seite „{page}“).': 'Runes for {champ} set (page "{page}").',
    'Runen für {champ} von {source} gesetzt (Seite „{page}“).': 'Runes for {champ} from {source} set (page "{page}").',
    'Keine freie Runenseite. Leg im Client eine Seite namens "{page}" an, die wird dann benutzt.':
      'No free Rune Page. Create a page called "{page}" in the client, it will be used from then on.',
    'Runenseite nicht mehr verfügbar, bitte neu laden.': 'Rune Page no longer available, please reload.',
    'Als deine Runen gespeichert.': 'Saved as your runes.',
    'Gesetzt (Seite „{page}“).': 'Set (page "{page}").',
    'Summoner': 'Summoner Spells',
    'Summoner: keine Empfehlung gefunden.': 'Summoner Spells: no recommendation found.',
    'Summoner {d} (D) + {f} (F) passen schon ({source}).': 'Summoner Spells {d} (D) + {f} (F) already match ({source}).',
    'Summoner {d} (D) + {f} (F) von {source} gesetzt.': 'Summoner Spells {d} (D) + {f} (F) from {source} set.',
    'Summoner lassen sich nur in der Champ-Auswahl setzen.': 'Summoner Spells can only be set in champ select.',
    'Erst einen Champion wählen.': 'Pick a champion first.',
    'Item-Set': 'Item Set',
    'Runen': 'Runes',
    'Dein Build (Farmy)': 'Your build (Farmy)',
    'Start – lolalytics.com': 'Starting items – lolalytics.com',
    'Kern-Build – lolalytics.com': 'Core build – lolalytics.com',
    '{n}. {item} – Teile': '{n}. {item} – components',
    'Danach – lolalytics.com': 'After that – lolalytics.com',
    'Für {champ} gibt es weder eigenen Build noch Vorschlag.': 'There is neither an own build nor a suggestion for {champ}.',
    'Item-Set „Farmy – {name}“ ist im Client, im Spiel im Shop wählbar.':
      'Item Set "Farmy – {name}" is in the client and can be picked in the shop in game.',
    'Noch keine eigenen Spiele mit diesem Champion.': 'No own games with this champion yet.',
    'Kein Vorschlag geladen.': 'No suggestion loaded.',
    'lolalytics.com: Seitenaufbau nicht erkannt': 'lolalytics.com: page layout not recognized',
    'lolalytics.com: zu wenige Spiele oder Seitenaufbau nicht erkannt': 'lolalytics.com: too few games or page layout not recognized',
    'lolalytics.com: Tierliste nicht erkannt': 'lolalytics.com: tier list not recognized',
    // Bildschirm-Erkennung
    'Nur im laufenden Spiel möglich.': 'Only possible during a game.',
    'kein Cooldown': 'no cooldown',
    'Bildschirm-Erkennung': 'Screen recognition',
    'Zeigt, welche Bildschirmbereiche das Overlay liest und was es erkennt. Stimmt ein Wert nicht, schick den Screenshot dieses Bereichs mit deiner Auflösung und HUD-Skalierung als GitHub-Issue.':
      'Shows which screen areas the overlay reads and what it recognizes. If a value is wrong, send a screenshot of this section with your resolution and HUD scale as a GitHub issue.',
    'Erkennung prüfen': 'Check recognition',
    'Prüfe…': 'Checking…',
    'Bereich {name}': 'Area {name}',
    'Bildschirm {screen} · HUD-Skalierung {hud} · Faktoren Auflösung {res}, untere Leiste {bar}':
      'Screen {screen} · HUD scale {hud} · factors resolution {res}, bottom bar {bar}',
    'unbekannt': 'unknown',
    // Stats-Fenster: Rahmen und Reiter
    'Minimieren': 'Minimize',
    'Angemeldet als': 'Signed in as',
    'Hauptmenü': 'Main menu',
    'Live-Spiel': 'Live game',
    'Letztes Spiel': 'Last game',
    'Verlauf': 'Match History',
    'Build & Runen': 'Build & Runes',
    'Client …': 'Client …',
    'Client verbunden': 'Client connected',
    'Client nicht verbunden': 'Client not connected',
    'Menü': 'Menu',
    'Neu laden': 'Reload',
    'Alle 10 Spieler mit Rang, Items und Werten, sobald ein Spiel läuft': 'All 10 players with rank, items and stats while a game is running',
    'Auswertung direkt nach dem Spiel': 'Summary right after the game',
    'Deine letzten Spiele': 'Your recent games',
    'Eigene Einstellungen haben immer Vorrang vor Vorschlägen': 'Your own settings always take priority over suggestions',
    'Overlay an/aus': 'Overlay on/off',
    'Overlay verschieben': 'Move overlay',
    'dieses Fenster': 'this window',
    'Strg+Shift+O': 'Ctrl+Shift+O',
    'Strg+Shift+E': 'Ctrl+Shift+E',
    'Strg+Shift+S': 'Ctrl+Shift+S',
    // Letztes Spiel, Verlauf, Live-Spiel
    'Keine Endspiel-Daten. Die gibt es direkt nach einem Spiel, solange der Client den Endbildschirm zeigt.':
      'No end-of-game data. It is available right after a game while the client shows the end-of-game screen.',
    'Unter „Verlauf“ findest du ältere Spiele.': 'Older games are under "Match History".',
    'Ergebnis': 'Result',
    'Sieg': 'Victory',
    'Niederlage': 'Defeat',
    'Dauer': 'Duration',
    'Schaden': 'Damage',
    'Schaden/min': 'Damage/min',
    'Anteil': 'Share',
    'Dein Team': 'Your team',
    'Gegner': 'Enemy team',
    'Spieler': 'Player',
    'Rang': 'Rank',
    'Itemwert': 'Item value',
    'Itemwert {gold} g': 'Item value {gold} g',
    'Keine Spiele gefunden.': 'No games found.',
    'Spielmodus': 'Game mode',
    'Alle': 'All',
    'Letzte {n}': 'Last {n}',
    '{n}S': '{n}W',
    '{n}N': '{n}L',
    'Siegquote': 'Win rate',
    '{label} der letzten {n} Spiele, zuletzt {last}, Durchschnitt {avg}': '{label} over the last {n} games, latest {last}, average {avg}',
    'Kluft': "Summoner's Rift",
    'ARAM Mayhem': 'ARAM: Mayhem',
    'Einer für alle': 'One For All',
    'Eisen': 'Iron',
    'Silber': 'Silver',
    'Platin': 'Platinum',
    'Smaragd': 'Emerald',
    'Diamant': 'Diamond',
    'Meister': 'Master',
    'Großmeister': 'Grandmaster',
    'ungewertet': 'Unranked',
    'aus {n} Spielen': 'of {n} games',
    'Gerade läuft kein Spiel. Sobald du im Spiel bist, stehen hier alle 10 Spieler mit Rang, Items und Werten.':
      'No game is running right now. Once you are in a game, all 10 players appear here with rank, items and stats.',
    'Übungspuppe': 'Target Dummy',
    'tot {s}s': 'dead {s}s',
    // Build & Runen
    'Champion wählen…': 'Choose champion…',
    'ARAM-Bank': 'ARAM bench',
    'Matchup': 'Matchup',
    'nur vor dem Spiel · lolalytics.com': 'before the game only · lolalytics.com',
    'Gegner wählen…': 'Choose opponent…',
    'Gegner wählen': 'Choose opponent',
    'Lane: Siegquote gegen diesen Gegner, Einordnung nach dem bereinigten Wert (Stärke beider Champions herausgerechnet). Level 1–3: First-Blood-Anteil aus echten Spielen und ein gerechnetes All-in aus Grundwerten und den Grundfähigkeiten auf Rang 1 (Meraki Analytics; Abstand = Rest-Leben des Siegers). Passiven und Kontrolleffekte fehlen, also nur ein Anhaltspunkt.':
      'Lane: win rate against this opponent, rated by the adjusted value (strength of both champions factored out). Level 1–3: First Blood share from real games and a computed all-in from base stats and the basic abilities at rank 1 (Meraki Analytics; margin = winner\'s remaining Health). Passives and crowd control are missing, so it is only a rough guide.',
    'gewinnend': 'winning',
    'leicht gewinnend': 'slightly winning',
    'ausgeglichen': 'even',
    'leicht verlierend': 'slightly losing',
    'verlierend': 'losing',
    'eher du': 'likely you',
    'eher der Gegner': 'likely the enemy',
    'offen': 'open',
    'Duell L1–3 mit Fähigkeiten': 'Duel L1–3 with abilities',
    'Duell L1–3 (nur Grundwerte)': 'Duel L1–3 (base stats only)',
    'Level 1–3': 'Level 1–3',
    '{pct} ggü. Ø-Gegner': '{pct} vs. avg. opponent',
    'bereinigt {pct}': 'adjusted {pct}',
    '{n} Spiele': '{n} games',
    'In der Champ-Auswahl stehen hier die gegnerischen Picks. Oder oben einen Gegner wählen.':
      'In champ select, the enemy picks show up here. Or choose an opponent above.',
    'Lade Matchup…': 'Loading matchup…',
    'Build-Reihenfolge': 'Build order',
    'Item suchen…': 'Search item…',
    'Item suchen': 'Search item',
    'Hinzufügen': 'Add',
    'Teil': 'component',
    'Im Spiel zeigt das Panel das erste Item der Liste, das du noch nicht hast, und wie viel Gold fehlt. Teile im Inventar werden angerechnet. Reicht dein Gold, erscheint RECALL.':
      'In game, the panel shows the first item on the list you do not have yet and how much gold is missing. Components in your inventory count. Once you have enough gold, RECALL appears.',
    'Als Item-Set in den Client': 'Send to client as Item Set',
    'Beim Pick automatisch als Item-Set in den Client': 'Send to client as Item Set automatically on pick',
    'Das Set „Farmy – Champion“ findest du im Spiel im Shop bei deinen Item-Sets. Deine anderen Sets bleiben unangetastet.':
      'You will find the set "Farmy – Champion" in the shop in game under your Item Sets. Your other sets stay untouched.',
    'Deine meistgebauten Items ({n} Spiel, {mode})': 'Your most built items ({n} game, {mode})',
    'Deine meistgebauten Items ({n} Spiele, {mode})': 'Your most built items ({n} games, {mode})',
    '{n}× gebaut, {pct} % Siege': 'built {n}×, {pct}% wins',
    'Als meinen Build übernehmen': 'Use as my build',
    'Noch kein Build. Füge unten Items in Kaufreihenfolge hinzu.': 'No build yet. Add items below in buy order.',
    '{item} nach oben': 'Move {item} up',
    '{item} nach unten': 'Move {item} down',
    '{item} entfernen': 'Remove {item}',
    'Jetzt setzen': 'Set now',
    'Aktuelle Runenseite speichern': 'Save current Rune Page',
    'In der Champ-Auswahl automatisch setzen': 'Set automatically in champ select',
    'Gesetzt wird immer auf die Seite „Farmy“. Deine anderen Runenseiten bleiben unangetastet.':
      'Runes are always set on the page "Farmy". Your other Rune Pages stay untouched.',
    'Für diesen Champion ist noch keine Runenseite gespeichert. Stell sie im Client ein und klick „Aktuelle Runenseite speichern“.':
      'No Rune Page saved for this champion yet. Set it up in the client and click "Save current Rune Page".',
    'Beim Pick automatisch setzen': 'Set automatically on pick',
    'Was schon passt, bleibt auf seiner Taste (Blitz auf D oder F, wie du es gewohnt bist). Ohne lolalytics-Vorschlag nimmt die App Riots Empfehlung.':
      "What already matches stays on its key (Flash on D or F, the way you are used to). Without a lolalytics suggestion, the app uses Riot's recommendation.",
    'Empfehlung kommt beim Pick in der Champ-Auswahl.': 'The recommendation arrives when you pick in champ select.',
    'Noch kein Vorschlag geladen. Er kommt automatisch beim Pick in der Champ-Auswahl.':
      'No suggestion loaded yet. It arrives automatically when you pick in champ select.',
    'Jetzt von lolalytics laden': 'Load from lolalytics now',
    'Vorschlag von {link} ({lane}, Emerald+, Stand {date})': 'Suggestion from {link} ({lane}, Emerald+, as of {date})',
    'Standard-Rolle': 'default role',
    'Meistgespielt laut lolalytics.com': 'Most played according to lolalytics.com',
    'Runenseiten zur Auswahl': 'Rune Pages to choose from',
    'Setzen': 'Set',
    'Merken': 'Save',
    'Fehler': 'Error',
    'Gespeichert.': 'Saved.',
    'du': 'you',
    'Tausch lohnt sich (+{pct})': 'worth a swap (+{pct})',
    'ARAM-Siegrate von {link}, Stand {date}. Tauschen musst du selbst im Client.':
      'ARAM win rate from {link}, as of {date}. You have to swap yourself in the client.',
    'Automatik': 'Automation',
    '2 Sekunden nach „Spiel gefunden“, selbst ablehnen geht weiter': '2 seconds after the match is found; you can still decline yourself',
    'Fenster beim Pick öffnen': 'Open window on pick',
    'in der Champ-Auswahl, ohne den Client in den Hintergrund zu schieben': 'in champ select, without pushing the client into the background',
    'Vorschläge von lolalytics.com': 'Suggestions from lolalytics.com',
    'ein Abruf pro Champ-Auswahl, einen Tag gespeichert; eigene Builds und Runen haben Vorrang':
      'one request per champ select, kept for a day; your own builds and runes take priority',
  };

  let lang = 'de';
  const t = (s, vars) => {
    let out = lang === 'en' && EN[s] != null ? EN[s] : s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  };
  const locale = () => (lang === 'en' ? 'en-US' : 'de-DE');
  // Zahl mit Tausenderpunkt bzw. -komma und festen Nachkommastellen in der gewählten Sprache
  const num = (v, digits = 0) =>
    Number(v || 0).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });

  // Feste Texte im HTML: Textknoten und title/placeholder/aria-label, deren Inhalt eine Übersetzung hat
  function translatePage(doc) {
    doc.documentElement.lang = lang;
    if (lang === 'de') return;
    const walk = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const key = node.nodeValue.trim();
      if (EN[key] != null) node.nodeValue = node.nodeValue.replace(key, EN[key]);
    }
    for (const attr of ['title', 'placeholder', 'aria-label']) {
      doc.querySelectorAll(`[${attr}]`).forEach((el) => {
        const key = el.getAttribute(attr);
        if (EN[key] != null) el.setAttribute(attr, EN[key]);
      });
    }
  }

  const api = { EN, t, num, locale, translatePage, setLang: (l) => (lang = l === 'en' ? 'en' : 'de'), lang: () => lang };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.i18n = api;
})(this);
