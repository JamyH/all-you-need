// League-Client-API (LCU). Zugangsdaten stehen in der lockfile, solange der Client läuft.
// Kein Riot-API-Key nötig.
const fs = require('fs');
const path = require('path');
const { requestJson } = require('./http');

function readLockfile(leaguePath) {
  const file = path.join(leaguePath, 'lockfile');
  if (!fs.existsSync(file)) return null;
  const [, , port, password, protocol] = fs.readFileSync(file, 'utf8').split(':');
  return { port, password, protocol };
}

function lcu(leaguePath, endpoint, method = 'GET', body = undefined) {
  const lock = readLockfile(leaguePath);
  if (!lock) return Promise.reject(new Error('League-Client läuft nicht'));
  const auth = Buffer.from(`riot:${lock.password}`).toString('base64');
  return requestJson(method, `${lock.protocol}://127.0.0.1:${lock.port}${endpoint}`, { Authorization: `Basic ${auth}` }, body, 4000);
}

const gameflowPhase = (lp) => lcu(lp, '/lol-gameflow/v1/gameflow-phase').catch(() => null);
const currentSummoner = (lp) => lcu(lp, '/lol-summoner/v1/current-summoner');
const endOfGame = (lp) => lcu(lp, '/lol-end-of-game/v1/eog-stats-block');
const matchHistory = (lp, count = 10) =>
  lcu(lp, `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count - 1}`);

// Champ-Auswahl: Champion-Key (Zahl) des eigenen Picks oder Hovers (0 = noch keiner), zugeteilte Rolle
// (top, jungle, middle, bottom, utility; leer ohne Rollen) und ob der Pick fest ist
async function champSelect(lp) {
  const s = await lcu(lp, '/lol-champ-select/v1/session');
  const me = (s.myTeam || []).find((p) => p.cellId === s.localPlayerCellId);
  if (!me) return { key: 0, position: '', locked: false };
  const myPick = (s.actions || []).flat().find((a) => a.type === 'pick' && a.actorCellId === s.localPlayerCellId);
  return {
    key: me.championId || me.championPickIntent || 0,
    position: me.assignedPosition || '',
    // ohne Pick-Aktion (z. B. ARAM) zählt der zugeteilte Champion als fest
    locked: !!me.championId && (!myPick || myPick.completed),
  };
}

// Riots eigene empfohlene Runenseiten (wie „Empfohlen“ im Client, meist drei Varianten)
async function recommendedRunePages(lp, championKey, position) {
  const pages = await lcu(lp, `/lol-perks/v1/recommended-pages/champion/${championKey}/position/${position || 'none'}/map/11`);
  return (pages || []).map((p) => ({ primaryStyleId: p.primaryPerkStyleId, subStyleId: p.secondaryPerkStyleId, selectedPerkIds: p.perks.map((x) => x.id) }));
}
// Erste davon: Ersatz, wenn lolalytics nicht antwortet
const recommendedRunes = async (lp, championKey, position) => (await recommendedRunePages(lp, championKey, position))[0] || null;

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

// Runen. Wir schreiben nur in eine eigene Seite namens PAGE_NAME; andere Seiten werden nie gelöscht oder überschrieben.
const PAGE_NAME = 'All You Need';
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
  const own = pages.find((p) => p.name === PAGE_NAME && p.isEditable);
  let page;
  if (own) {
    page = await lcu(lp, `/lol-perks/v1/pages/${own.id}`, 'PUT', { ...body, id: own.id });
  } else {
    try {
      page = await lcu(lp, '/lol-perks/v1/pages', 'POST', body);
    } catch (e) {
      throw new Error(`Keine freie Runenseite. Leg im Client eine Seite namens "${PAGE_NAME}" an, die wird dann benutzt.`);
    }
  }
  const id = (page && page.id) || (own && own.id);
  if (id) await lcu(lp, '/lol-perks/v1/currentpage', 'PUT', id);
  return id;
}

// Item-Set für den Shop im Spiel (Reiter mit eigenen Sets). Wir schreiben nur unser eigenes Set pro Champion
// (erkennbar an der uid); alle anderen Sets bleiben, wie sie sind.
// blocks: [{ title, items: [{ id, count }] }]
async function applyItemSet(lp, championKey, title, blocks) {
  const me = await currentSummoner(lp);
  const url = `/lol-item-sets/v1/item-sets/${me.summonerId}/sets`;
  const data = await lcu(lp, url);
  const uid = `all-you-need-${championKey}`;
  const own = {
    uid,
    title,
    type: 'custom',
    map: 'any',
    mode: 'any',
    startedFrom: 'blank',
    sortrank: 0,
    associatedChampions: [Number(championKey)],
    associatedMaps: [11],
    preferredItemSlots: [],
    blocks: blocks.map((b) => ({ type: b.title, items: b.items.map((i) => ({ id: String(i.id), count: i.count || 1 })) })),
  };
  const itemSets = [...(data.itemSets || []).filter((s) => s.uid !== uid), own];
  await lcu(lp, url, 'PUT', { accountId: data.accountId || me.accountId, itemSets, timestamp: Date.now() });
}

module.exports = {
  gameflowPhase, currentSummoner, endOfGame, matchHistory, champSelect, recommendedRunes, recommendedRunePages, currentRunePage, applyRunePage, PAGE_NAME,
  applyItemSet, gamePlayers, soloRank,
};
