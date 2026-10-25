const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('capture', {
  onStart: (cb) => ipcRenderer.on('capture:start', (_e, id) => cb(id)),
  onStop: (cb) => ipcRenderer.on('capture:stop', () => cb()),
  ready: (err) => ipcRenderer.send('capture:ready', err || null),
  onGrab: (cb) => ipcRenderer.on('capture:grab', (_e, reqId, regions) => cb(reqId, regions)),
  grabbed: (reqId, crops, err) => ipcRenderer.send('capture:grabbed', reqId, crops, err || null),
});
