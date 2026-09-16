const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');


const hasSingleInstanceLock = app.requestSingleInstanceLock();

let dock;
let loadingWindow;
let dockState = 'hidden';
let hideTimer = null;
const noteWindows = new Map();

const userDataFile = name => path.join(app.getPath('userData'), name);

// Crash logging — must come after userDataFile is defined
process.on('uncaughtException', (err) => {
  try { fs.appendFileSync(userDataFile('crash.log'), `${new Date().toISOString()} ${err.stack}\n`); } catch {}
});
process.on('unhandledRejection', (err) => {
  try { fs.appendFileSync(userDataFile('crash.log'), `${new Date().toISOString()} [unhandledRejection] ${err.stack}\n`); } catch {}
});

if (!hasSingleInstanceLock) {
  console.log('[Tabbin] Another instance running - quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!dock || dock.isDestroyed()) return;
    showDock();
    dock.focus();
  });
}

const appIcon = () => path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const configFile = () => userDataFile('config.json');
const dataFile = () => userDataFile('notes.json');
const palette = ['#f5c542', '#66d9c7', '#ff8b8b', '#a98bff', '#76b7ff', '#f29b72'];
const seed = [
  { id: 'welcome', title: 'Welcome to Tabbin', content: 'Hover a colored tab to preview it. Click to open a full note window.', color: '#f5c542', updatedAt: Date.now() },
  { id: 'ideas', title: 'Ideas', content: 'Capture ideas quickly, then keep working without losing your train of thought.', color: '#66d9c7', updatedAt: Date.now() - 1000 },
  { id: 'tasks', title: 'Today', content: '• Clear pending tasks\n• Hit the gym\n• Rest and recharge', color: '#ff8b8b', updatedAt: Date.now() - 2000 }
];
const defaultConfig = { edge: 'left', edgeHover: true, noteWidth: 430, noteHeight: 430 };

function loadConfig() {
  try { return { ...defaultConfig, ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) }; }
  catch { return { ...defaultConfig }; }
}
function saveConfig(config) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(config, null, 2));
  return config;
}

// Load notes with backup fallback: primary → .bak → seed
function loadNotes() {
  try { return JSON.parse(fs.readFileSync(dataFile(), 'utf8')); }
  catch {
    try { return JSON.parse(fs.readFileSync(dataFile() + '.bak', 'utf8')); }
    catch { return seed; }
  }
}

// Atomic write: backup old → write temp → rename. Serialized via writeChain
// to prevent concurrent writes (e.g. two note windows autosaving at once).
let writeChain = Promise.resolve();
function saveNotes(notes) {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Keep last-known-good state as backup before overwriting
  try { fs.copyFileSync(file, file + '.bak'); } catch {}
  // Atomic write via temp file + rename
  const tmp = file + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(notes, null, 2));
  fs.renameSync(tmp, file);
}
// Serialize all writes to prevent lost updates when multiple IPC calls land
// in adjacent ticks (e.g. two note windows autosaving near-simultaneously).
// Note: this prevents file corruption but does NOT prevent logical last-write-wins
// when two handlers both read via loadNotes() before either's write resolves —
// concurrent edits to different notes may silently race.
function queueWrite(notes) {
  writeChain = writeChain.then(() => saveNotes(notes));
  return writeChain;
}
function broadcast(channel, payload) {
  if (dock && !dock.isDestroyed()) dock.webContents.send(channel, payload);
  for (const window of noteWindows.values()) if (!window.isDestroyed()) window.webContents.send(channel, payload);
}
function clearHideTimer() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
function layout() {
  if (!dock || dock.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const config = loadConfig();
  const fullWidth = 390;
  const hiddenWidth = 10;
  const height = Math.min(760, display.workAreaSize.height - 120);
  const y = display.workArea.y + 80;
  const width = ['revealed', 'revealing', 'hiding'].includes(dockState) ? fullWidth : hiddenWidth;
  const x = config.edge === 'right' ? display.workArea.x + display.workArea.width - width : display.workArea.x;
  dock.setBounds({ x, y, width, height });
  // The dock is an edge overlay, so it must remain above fullscreen/maximized
  // windows. This is internal behavior, not a user-configurable note pin.
  dock.setAlwaysOnTop(true, 'screen-saver');
}
function showDock() {
  if (!dock || dock.isDestroyed()) return;
  clearHideTimer();
  if (dockState === 'revealed' && dock.isVisible()) return;
  dockState = 'revealing';
  layout();
  dock.setFocusable(true);
  dock.showInactive();
  dock.setAlwaysOnTop(true, 'screen-saver'); // re-assert after visible window
  dockState = 'revealed';
}
function hideDock() {
  if (!dock || dock.isDestroyed()) return;
  clearHideTimer();
  if (dockState === 'hidden' && !dock.isVisible()) return;
  dockState = 'hiding';
  dock.setFocusable(false);
  dock.hide();
  dockState = 'hidden';
  layout();
}
function onEdgeEnter() { if (dockState === 'hidden' || dockState === 'hiding') { clearHideTimer(); showDock(); } }
function scheduleHide() {
  if (dockState === 'revealed' && !hideTimer) {
    dockState = 'hiding';
    hideTimer = setTimeout(() => { hideTimer = null; hideDock(); }, 400);
  }
}
function startEdgeWatcher() {
  setInterval(() => {
    if (!dock || dock.isDestroyed()) return;
    const display = screen.getPrimaryDisplay();
    const config = loadConfig();
    const point = screen.getCursorScreenPoint();
    const workArea = display.workArea;
    const hotZone = 12;
    if (!config.edgeHover) { if (dockState === 'hidden') showDock(); return; }
    const edgeHit = config.edge === 'right' ? point.x >= workArea.x + workArea.width - hotZone : point.x <= workArea.x + hotZone;
    if ((dockState === 'hidden' || !dock.isVisible()) && edgeHit) { onEdgeEnter(); return; }
    if (dockState === 'hidden' || !dock.isVisible()) return;
    const bounds = dock.getBounds();
    const insideDock = point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    if (insideDock) clearHideTimer(); else scheduleHide();
  }, 50);
}
function createDock() {
  const display = screen.getPrimaryDisplay();
  dock = new BrowserWindow({
    width: 6, height: Math.min(760, display.workAreaSize.height - 80), x: display.workArea.x, y: display.workArea.y + 40,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, focusable: false,
    icon: appIcon(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  dock.loadFile('dock.html');
  layout();
  dock.hide();
  dock.setFullScreenable(false);  // prevent OS from suppressing during fullscreen
  startEdgeWatcher();
}
function createLoadingWindow() {
  loadingWindow = new BrowserWindow({ width: 360, height: 220, frame: false, resizable: false, transparent: true, center: true, alwaysOnTop: true, skipTaskbar: true, show: true, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  loadingWindow.loadFile('loading.html');
}
function closeLoadingWindow() {
  if (loadingWindow && !loadingWindow.isDestroyed()) loadingWindow.close();
  loadingWindow = null;
}
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', info => broadcast('update:available', info));
  autoUpdater.on('update-not-available', () => broadcast('update:none'));
  autoUpdater.on('download-progress', progress => broadcast('update:progress', progress));
  autoUpdater.on('update-downloaded', info => broadcast('update:downloaded', info));
  autoUpdater.on('error', error => broadcast('update:error', { message: error.message }));
  if (app.isPackaged) autoUpdater.checkForUpdates().catch(error => broadcast('update:error', { message: error.message }));
}
function openNote(id) {
  clearHideTimer();
  hideDock();
  if (noteWindows.has(id) && !noteWindows.get(id).isDestroyed()) {
    const window = noteWindows.get(id);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }
  const note = loadNotes().find(item => item.id === id);
  const noteColor = note && note.color || '#f5c542';
  const config = loadConfig();
  const window = new BrowserWindow({
    width: config.noteWidth || 430, height: config.noteHeight || 430, minWidth: 300, minHeight: 260, resizable: true, frame: true, thickFrame: true,
    movable: true, maximizable: true, alwaysOnTop: !!note?.alwaysOnTop, title: 'Tabbin Note', backgroundColor: noteColor, icon: appIcon(),
    autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  window.setResizable(true);
  noteWindows.set(id, window);
  window.loadFile('note.html', { query: { id } });
  let resizeTimer;
  window.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { const [width, height] = window.getSize(); saveConfig({ ...loadConfig(), noteWidth: width, noteHeight: height }); }, 250);
  });
  window.on('closed', () => noteWindows.delete(id));
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  console.log('[Tabbin] App starting...');
  app.setAppUserModelId('com.vanz15.tabbin');
  Menu.setApplicationMenu(null);
  if (!fs.existsSync(configFile())) saveConfig(defaultConfig);
  if (!loadNotes().length) saveNotes(seed);
  createLoadingWindow();
  createDock();
  setupAutoUpdater();
  setTimeout(() => {
    closeLoadingWindow();
    console.log('[Tabbin] Ready - hover left edge to reveal dock');
  }, 900);
});
app.on('window-all-closed', event => event.preventDefault());

ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('updates:check', () => autoUpdater.checkForUpdates().catch(error => ({ error: error.message })));
ipcMain.handle('updates:download', () => autoUpdater.downloadUpdate().catch(error => ({ error: error.message })));
ipcMain.handle('updates:install', () => autoUpdater.quitAndInstall());
ipcMain.handle('notes:list', () => loadNotes().sort((a, b) => b.updatedAt - a.updatedAt));
ipcMain.handle('notes:create', () => {
  const notes = loadNotes();
  const note = { id: crypto.randomUUID(), title: 'Untitled note', content: '', color: palette[notes.length % palette.length], updatedAt: Date.now() };
  notes.unshift(note); saveNotes(notes); broadcast('notes:changed', notes); openNote(note.id); return note;
});
ipcMain.handle('notes:get', (_, id) => loadNotes().find(note => note.id === id));
ipcMain.handle('notes:update', async (_, note) => {
  const notes = loadNotes(); const index = notes.findIndex(item => item.id === note.id); if (index < 0) return;
  notes[index] = { ...notes[index], title: note.title, content: note.content, color: note.color || notes[index].color, alwaysOnTop: !!note.alwaysOnTop, updatedAt: Date.now() };
  await queueWrite(notes);
  const noteWindow = noteWindows.get(note.id);
  if (noteWindow && !noteWindow.isDestroyed()) noteWindow.setBackgroundColor(notes[index].color);
  broadcast('notes:changed', notes);
});
ipcMain.handle('notes:reorder', async (_, ids) => {
  const notes = loadNotes(); const byId = new Map(notes.map(note => [note.id, note]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean); const remaining = notes.filter(note => !ids.includes(note.id));
  const result = [...ordered, ...remaining];
  await queueWrite(result);
  broadcast('notes:changed', result);
  return true;
});
ipcMain.handle('notes:delete', async (_, id) => {
  const notes = loadNotes().filter(note => note.id !== id);
  await queueWrite(notes);
  if (noteWindows.has(id)) noteWindows.get(id).close();
  broadcast('notes:changed', notes);
});
ipcMain.handle('notes:open', (_, id) => openNote(id));
ipcMain.handle('notes:toggle-always-on-top', async (_, id) => {
  const notes = loadNotes(); const index = notes.findIndex(note => note.id === id); if (index < 0) return null;
  notes[index] = { ...notes[index], alwaysOnTop: !notes[index].alwaysOnTop };
  await queueWrite(notes);
  const noteWindow = noteWindows.get(id); if (noteWindow && !noteWindow.isDestroyed()) noteWindow.setAlwaysOnTop(!!notes[index].alwaysOnTop, 'floating');
  broadcast('notes:changed', notes);
  return notes[index];
});
ipcMain.handle('dock:hide', () => hideDock());
ipcMain.handle('dock:cursor-left', () => scheduleHide());
