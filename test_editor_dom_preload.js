const { contextBridge, ipcRenderer } = require('electron');
let failNextUpdate = false;
let failNextMode = null;

contextBridge.exposeInMainWorld('tabbin', {
  create: () => ipcRenderer.invoke('test:create'),
  failNextUpdate: () => { failNextUpdate = true; },
  failWithMissingNote: () => { failNextMode = 'missing'; },
  get: (id) => ipcRenderer.invoke('test:get', id),
  update: (note) => {
    if (failNextUpdate) {
      failNextUpdate = false;
      return Promise.reject(new Error('Simulated note write failure'));
    }
    // Rejected from the MAIN process on purpose: the renderer matches the
    // NOTE_MISSING marker on the error that survives a real IPC crossing, which
    // is not the same error object the renderer constructed itself.
    if (failNextMode === 'missing') {
      failNextMode = null;
      return ipcRenderer.invoke('test:update-missing', note);
    }
    return ipcRenderer.invoke('test:update', note);
  },
  toggleNoteAlwaysOnTop: (id) => ipcRenderer.invoke('test:toggle-pin', id),
  broadcast: (notes) => ipcRenderer.invoke('test:broadcast', notes),
  remove: (id) => ipcRenderer.invoke('test:remove', id),
  onChanged: (callback) => ipcRenderer.on('test:changed', (_, notes) => callback(notes)),
});
