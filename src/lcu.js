// League-Client-API (LCU). Zugangsdaten stehen in der lockfile, solange der Client läuft.
// Kein Riot-API-Key nötig.
const fs = require('fs');
const path = require('path');
const { requestJson } = require('./http');
const { t } = require('../renderer/i18n');

function readLockfile(leaguePath) {
  const file = path.join(leaguePath, 'lockfile');
  if (!fs.existsSync(file)) return null;
  const [, , port, password, protocol] = fs.readFileSync(file, 'utf8').split(':');
  return { port, password, protocol };
}

function lcu(leaguePath, endpoint, method = 'GET', body = undefined) {
  const lock = readLockfile(leaguePath);
  if (!lock) return Promise.reject(new Error(t('League-Client läuft nicht')));
  const auth = Buffer.from(`riot:${lock.password}`).toString('base64');
  return requestJson(method, `${lock.protocol}://127.0.0.1:${lock.port}${endpoint}`, { Authorization: `Basic ${auth}` }, body, 4000);
}

const gameflowPhase = (lp) => lcu(lp, '/lol-gameflow/v1/gameflow-phase').catch(() => null);
const currentSummoner = (lp) => lcu(lp, '/lol-summoner/v1/current-summoner');
const endOfGame = (lp) => lcu(lp, '/lol-end-of-game/v1/eog-stats-block');
// Laufendes Spiel: gameData.gameId verknüpft Farmys Spielprotokoll mit der Historie
const gameflowSession = (lp) => lcu(lp, '/lol-gameflow/v1/session');
// Ready-Check nach „Spiel gefunden“: { state: 'InProgress' | …, playerResponse: 'None' | 'Accepted' | 'Declined' }.
// Ohne laufenden Check antwortet der Client mit 404 -> null
const readyCheck = (lp) => lcu(lp, '/lol-matchmaking/v1/ready-check').catch(() => null);
const acceptReadyCheck = (lp) => lcu(lp, '/lol-matchmaking/v1/ready-check/accept', 'POST');
// Details eines Spiels mit allen 10 Spielern (bei Mayhem inkl. playerAugment1–6)
// Spieldaten des Clients: Augments (Arena und Mayhem) mit Namen in Client-Sprache, Seltenheit, Icon
const cherryAugments = (lp) => lcu(lp, '/lol-game-data/assets/v1/cherry-augments.json');
const matchHistory = (lp, count = 10) =>
  lcu(lp, `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count - 1}`);

// Champ-Auswahl: Champion-Key (Zahl) des eigenen Picks oder Hovers (0 = noch keiner), zugeteilte Rolle
// (top, jungle, middle, bottom, utility; leer ohne Rollen), ob der Pick fest ist und die ARAM-Bank (Keys)
async function champSelect(lp) {
  const s = await lcu(lp, '/lol-champ-select/v1/session');
  const me = (s.myTeam || []).find((p) => p.cellId === s.localPlayerCellId);
  const bench = s.benchEnabled ? (s.benchChampions || []).map((b) => b.championId) : [];
  if (!me) return { key: 0, position: '', locked: false, bench };
  const myPick = (s.actions || []).flat().find((a) => a.type === 'pick' && a.actorCellId === s.localPlayerCellId);
  return {
    key: me.championId || me.championPickIntent || 0,
    position: me.assignedPosition || '',
    side: me.team === 2 ? 'red' : 'blue', // 1 = blaue Seite (unten links), 2 = rote
    // ohne Pick-Aktion (z. B. ARAM) zählt der zugeteilte Champion als fest
    locked: !!me.championId && (!myPick || myPick.completed),
    spells: [me.spell1Id, me.spell2Id], // D, F
    bench,
    // Picks des Gegnerteams (Keys), sobald sichtbar; deren Rollen kennt der Client nicht
    enemies: (s.theirTeam || []).map((p) => p.championId).filter(Boolean),
  };
}

// Map der aktuellen Warteschlange (11 = Summoner's Rift, 12 = ARAM/ARAM Mayhem); null ohne Lobby/Spiel
const mapId = (lp) => lcu(lp, '/lol-gameflow/v1/session').then((s) => (s.map && s.map.id) || null, () => null);

// Riots eigene empfohlene Runenseiten (wie „Empfohlen“ im Client, meist drei Varianten)
async function recommendedRunePages(lp, championKey, position, map = 11) {
  const pages = await lcu(lp, `/lol-perks/v1/recommended-pages/champion/${championKey}/position/${position || 'none'}/map/${map}`);
  return (pages || []).map((p) => ({ primaryStyleId: p.primaryPerkStyleId, subStyleId: p.secondaryPerkStyleId, selectedPerkIds: p.perks.map((x) => x.id) }));
}
// Riots Summoner-Empfehlung (steht bei den empfohlenen Runenseiten mit dabei)
async function recommendedSpells(lp, championKey, position, map = 11) {
  const pages = await lcu(lp, `/lol-perks/v1/recommended-pages/champion/${championKey}/position/${position || 'none'}/map/${map}`);
  const ids = pages?.[0]?.summonerSpellIds;
  return Array.isArray(ids) && ids.length === 2 ? ids : null;
}
// Summoner in der Champ-Auswahl setzen (spell1 = D, spell2 = F)
const applySpells = (lp, spell1Id, spell2Id) => lcu(lp, '/lol-champ-select/v1/session/my-selection', 'PATCH', { spell1Id, spell2Id });
// Erste davon: Ersatz, wenn lolalytics nicht antwortet
const recommendedRunes = async (lp, championKey, position, map) => (await recommendedRunePages(lp, championKey, position, map))[0] || null;

// Laufendes Spiel: Spieler beider Teams mit puuid und Champion-Key (Bots haben keine puuid)
async function gamePlayers(lp) {
  const s = await lcu(lp, '/lol-gameflow/v1/session');
  const gd = s.gameData || {};
  return [...(gd.teamOne || []), ...(gd.teamTwo || [])].map((p) => ({ puuid: p.puuid, championKey: p.championId }));
}

// Solo/Duo-Rang eines Spielers; null, wenn ungewertet
async function soloRank(lp, puuid) {
  const r = await lcu(lp, `/lol-ranked/v1/ranked-stats/${puuid}`);
  const q = r.queueMap && r.queueMap.RANKED_SOLO_5x5;
  if (!q || !q.tier || q.tier === 'NONE') return null;
  return { tier: q.tier, division: q.division, lp: q.leaguePoints, wins: q.wins, losses: q.losses };
}

// Eigene Ränge in Solo/Duo und Flex (für die Session): { solo, flex }, je null wenn ungewertet
async function ranks(lp, puuid) {
  const r = await lcu(lp, `/lol-ranked/v1/ranked-stats/${puuid}`);
  const pick = (q) => (q && q.tier && q.tier !== 'NONE' ? { tier: q.tier, division: q.division, lp: q.leaguePoints } : null);
  return { solo: pick(r.queueMap && r.queueMap.RANKED_SOLO_5x5), flex: pick(r.queueMap && r.queueMap.RANKED_FLEX_SR) };
}

// Runen. Wir schreiben nur in eine eigene Seite namens PAGE_NAME; andere Seiten werden nie gelöscht oder überschrieben.
// Eine Seite mit dem alten App-Namen (bis 1.5) wird weiterbenutzt und dabei umbenannt.
const PAGE_NAME = 'Farmy';
const OLD_PAGE_NAME = 'All You Need';
const currentRunePage = (lp) => lcu(lp, '/lol-perks/v1/currentpage');

async function applyRunePage(lp, rune) {
  const body = {
    name: PAGE_NAME,
    primaryStyleId: rune.primaryStyleId,
    subStyleId: rune.subStyleId,
    selectedPerkIds: rune.selectedPerkIds,
    current: true,
  };
  const pages = await lcu(lp, '/lol-perks/v1/pages');
  const own = pages.find((p) => p.name === PAGE_NAME && p.isEditable) || pages.find((p) => p.name === OLD_PAGE_NAME && p.isEditable);
  let page;
  if (own) {
    page = await lcu(lp, `/lol-perks/v1/pages/${own.id}`, 'PUT', { ...body, id: own.id });
  } else {
    try {
      page = await lcu(lp, '/lol-perks/v1/pages', 'POST', body);
    } catch (e) {
      throw new Error(t('Keine freie Runenseite. Leg im Client eine Seite namens "{page}" an, die wird dann benutzt.', { page: PAGE_NAME }));
    }
  }
  const id = (page && page.id) || (own && own.id);
  if (id) await lcu(lp, '/lol-perks/v1/currentpage', 'PUT', id);
  return id;
}

// Item-Set für den Shop im Spiel (Reiter mit eigenen Sets). Wir schreiben nur unser eigenes Set pro Champion
// (erkennbar an der uid); alle anderen Sets bleiben, wie sie sind. Das Set mit der alten uid (bis 1.5) wird ersetzt.
// blocks: [{ title, items: [{ id, count }] }]; map 11 = Summoner's Rift, 12 = ARAM (eigenes Set daneben)
async function applyItemSet(lp, championKey, title, blocks, map = 11) {
  const me = await currentSummoner(lp);
  const url = `/lol-item-sets/v1/item-sets/${me.summonerId}/sets`;
  const data = await lcu(lp, url);
  const suffix = `${championKey}${map === 12 ? '-aram' : ''}`;
  const uid = `farmy-${suffix}`;
  const own = {
    uid,
    title,
    type: 'custom',
    map: 'any',
    mode: 'any',
    startedFrom: 'blank',
    sortrank: 0,
    associatedChampions: [Number(championKey)],
    associatedMaps: [map],
    preferredItemSlots: [],
    blocks: blocks.map((b) => ({ type: b.title, items: b.items.map((i) => ({ id: String(i.id), count: i.count || 1 })) })),
  };
  const itemSets = [...(data.itemSets || []).filter((s) => s.uid !== uid && s.uid !== `all-you-need-${suffix}`), own];

  await lcu(lp, url, 'PUT', { accountId: data.accountId || me.accountId, itemSets, timestamp: Date.now() });
}

module.exports = {
  gameflowPhase, gameflowSession, currentSummoner, endOfGame, matchHistory, ranks, champSelect, mapId, recommendedRunes, recommendedRunePages, recommendedSpells, applySpells, currentRunePage, applyRunePage, PAGE_NAME,
  applyItemSet, gamePlayers, soloRank, readyCheck, acceptReadyCheck, cherryAugments,
};
