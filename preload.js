const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tabbin', {
  list: () => ipcRenderer.invoke('notes:list'),
  get: id => ipcRenderer.invoke('notes:get', id),
  create: () => ipcRenderer.invoke('notes:create'),
  update: note => ipcRenderer.invoke('notes:update', note),
  reorder: ids => ipcRenderer.invoke('notes:reorder', ids),
  remove: id => ipcRenderer.invoke('notes:delete', id),
  open: id => ipcRenderer.invoke('notes:open', id),
  hide: () => ipcRenderer.invoke('dock:hide'),
  cursorLeft: () => ipcRenderer.invoke('dock:cursor-left'),
  quit: () => ipcRenderer.invoke('app:quit'),
  config: () => ipcRenderer.invoke('config:get'),
  toggleNoteAlwaysOnTop: id => ipcRenderer.invoke('notes:toggle-always-on-top', id),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onChanged: callback => ipcRenderer.on('notes:changed', (_, notes) => callback(notes)),
  onConfigChanged: callback => ipcRenderer.on('config:changed', (_, config) => callback(config)),
  onUpdate: (channel, callback) => ipcRenderer.on(channel, (_, payload) => callback(payload))
});
