const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lol', {
  onGame: (cb) => ipcRenderer.on('game', (_e, d) => cb(d)),
  onEditMode: (cb) => ipcRenderer.on('edit-mode', (_e, on) => cb(on)),
  onScoreboard: (cb) => ipcRenderer.on('scoreboard-state', (_e, s) => cb(s)),
  onPanelPos: (cb) => ipcRenderer.on('panel-pos', (_e, p) => cb(p)),
  panelMoved: (pos) => ipcRenderer.invoke('panel-moved', pos),
  gripHover: (over) => ipcRenderer.send('grip-hover', over),
  endOfGame: () => ipcRenderer.invoke('stats:eog'),
  history: () => ipcRenderer.invoke('stats:history'),
  summoner: () => ipcRenderer.invoke('stats:summoner'),
  champion: (id) => ipcRenderer.invoke('ddragon:champion', id),
  ddVersion: () => ipcRenderer.invoke('ddragon:version'),
  liveData: () => ipcRenderer.invoke('live:data'),
  buildData: () => ipcRenderer.invoke('build:data'),
  setBuild: (champId, ids) => ipcRenderer.invoke('build:set', champId, ids),
  saveRunes: (champId) => ipcRenderer.invoke('runes:saveCurrent', champId),
  applyRunes: (champId) => ipcRenderer.invoke('runes:apply', champId),
  setRunesAuto: (on) => ipcRenderer.invoke('runes:auto', on),
  onBuildChampion: (cb) => ipcRenderer.on('build:champion', (_e, id) => cb(id)),
  onRunesStatus: (cb) => ipcRenderer.on('runes:status', (_e, msg) => cb(msg)),
});
