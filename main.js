const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const updater = require('./updater');
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
// Frosted-glass palette from the design mockup. These supersede the original
// six flat tab colours, which were picked for opaque tabs and read as harsh
// against a dark translucent surface. Passed to note.html via the load query so
// the dots and the window gradient always agree with this list.
const palette = ['#F2A38F', '#9CCFA5', '#8EC5E8', '#F0D58A', '#B9A7E8'];
const seed = [
  { id: 'welcome', title: 'Welcome to Tabbin', content: 'Hover a colored tab to preview it. Click to open a full note window.', color: '#F0D58A', updatedAt: Date.now() },
  { id: 'ideas', title: 'Ideas', content: 'Capture ideas quickly, then keep working without losing your train of thought.', color: '#9CCFA5', updatedAt: Date.now() - 1000 },
  { id: 'tasks', title: 'Today', content: '• Clear pending tasks\n• Hit the gym\n• Rest and recharge', color: '#F2A38F', updatedAt: Date.now() - 2000 }
];
const defaultConfig = { edge: 'left', edgeHover: true, noteWidth: 430, noteHeight: 430 };

function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : null;
}
// Nearest palette entry by RGB distance, so a legacy colour lands on the
// closest-looking replacement rather than an arbitrary one.
function nearestPaletteColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of palette) {
    const c = hexToRgb(candidate);
    const distance = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best;
}
// Re-tint notes saved with the legacy flat palette onto the glass palette.
// Idempotent: a colour already in `palette` maps to itself, so running this on
// every launch cannot keep rewriting the file.
function migrateNoteColors(notes) {
  const known = new Set(palette.map((c) => c.toLowerCase()));
  let changed = false;
  for (const note of notes) {
    if (known.has(String(note.color || '').toLowerCase())) continue;
    const next = nearestPaletteColor(note.color);
    if (next) { note.color = next; changed = true; }
  }
  return changed;
}

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
  // Frosted-glass dock width, matching the mockup's `.dock`
  // (min(320px, calc(100vw - 28px))). Sized for reading a full note card
  // rather than a hover preview.
  const fullWidth = 320;
  // Collapsed dock is a plain sliver: the mockup's coloured edge pills were
  // tried here and removed, because they sit in the left margin and obstruct
  // normal scrolling. Nothing is drawn while collapsed.
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
    // NO backgroundMaterial here on purpose. Windows composites acrylic across
    // the whole rectangular window, so it fills the corners underneath the CSS
    // border-radius — the radius then reads as fake rather than as a cut-out.
    // With a transparent window and no material, the radius genuinely shows the
    // desktop through, which is what makes the corners read as real. The frosted
    // look comes from the CSS tint/border/shadow in dock.html, which is also
    // the part that was actually visible (acrylic mostly sampled flat
    // wallpaper, so it contributed almost nothing here).
    // macOS has no acrylic; vibrancy is the equivalent there and it respects the
    // window's rounded shape, so it is safe to keep.
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  dock.loadFile('dock.html');
  layout();
  dock.hide();
  dock.setFullScreenable(false);  // prevent OS from suppressing during fullscreen
  if (process.platform === 'darwin') {
    try { dock.setVibrancy('under-window'); } catch { /* older macOS/Electron */ }
  }
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
  // The updater owns its own state machine and pushes a full snapshot on every
  // change, so renderers can both subscribe and pull (see dock.html) — a plain
  // event firehose loses events that land before the dock finishes loading.
  updater.init(state => broadcast('update:state', state));
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
  const noteColor = note && note.color || palette[0];
  const config = loadConfig();
  const window = new BrowserWindow({
    width: config.noteWidth || 430, height: config.noteHeight || 430, minWidth: 300, minHeight: 260, resizable: true,
    // Frameless with custom chrome drawn in note.html, matching the mockup's
    // logo bar with pin/close controls. titleBarStyle 'hidden' keeps the native
    // controls available on hover via customButtonsOnHover-free behaviour, while
    // the page supplies its own close button so the glass surface reaches the
    // window edge.
    // thickFrame is deliberately off: on a frameless window it keeps the OS
    // resize border hit-testing active through every drag, making resize the
    // most expensive repaint the window does. thickFrame: false still resizes
    // (it only drops the Win32 resize frame, not resize support).
    frame: false, thickFrame: false, titleBarStyle: 'hidden',
    movable: true, maximizable: true, alwaysOnTop: !!note?.alwaysOnTop, title: 'Tabbin Note',
    // Opaque dark base. A frameless window with an alpha-0 background but no
    // `transparent: true` makes Chromium allocate an uninitialised (white)
    // buffer for invalidated regions; the glass then paints over it a frame
    // later, which reads as a white box and ghosted text while typing. An
    // opaque base keeps the surface fully defined, and note.html still paints
    // the glass tint and note gradient on top, so the design is unchanged.
    backgroundColor: '#18181b',
    icon: appIcon(),
    autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  window.setResizable(true);
  noteWindows.set(id, window);
  // Pass the palette so the colour dots and the window gradient always agree
  // with the colours the main process assigns to new notes.
  window.loadFile('note.html', { query: { id, palette: palette.join(',') } });
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
  // Re-tint any notes still carrying a legacy palette colour. Runs every
  // launch but is a no-op once notes are on the glass palette.
  const existing = loadNotes();
  if (migrateNoteColors(existing)) saveNotes(existing);
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
ipcMain.handle('updates:status', () => updater.snapshot());
ipcMain.handle('updates:check', () => updater.check());
ipcMain.handle('updates:download', () => updater.download());
ipcMain.handle('updates:install', () => updater.install());
ipcMain.handle('updates:dismiss-nudge', () => updater.dismissNudge());
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
  // The window is frameless and translucent, so the note colour is painted by
  // the renderer (note.html) rather than by the native window background.
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
