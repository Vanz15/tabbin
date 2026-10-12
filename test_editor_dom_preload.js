const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tabbin', {
  create: () => ipcRenderer.invoke('test:create'),
  get: (id) => ipcRenderer.invoke('test:get', id),
  update: (note) => ipcRenderer.invoke('test:update', note),
  toggleNoteAlwaysOnTop: (id) => ipcRenderer.invoke('test:toggle-pin', id),
  remove: (id) => ipcRenderer.invoke('test:remove', id),
  onChanged: (callback) => ipcRenderer.on('test:changed', (_, notes) => callback(notes)),
});
