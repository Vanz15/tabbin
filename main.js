const { app, BrowserWindow, ipcMain, screen, Menu, dialog, shell } = require('electron');
const updater = require('./updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');


const hasSingleInstanceLock = app.requestSingleInstanceLock();

let dock;
let loadingWindow;
let dockState = 'hidden';
let hideTimer = null;
// Natural height of the renderer's note list, reported on every render so the
// window can hug its content and stay vertically centred. 0 until first report.
let dockContentHeight = 0;
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

// The taskbar icon has to be a REAL file on disk. In a packaged build __dirname
// lives inside app.asar, and Electron cannot load a taskbar icon from inside an
// asar archive — it silently falls back to the generic page icon, which is why
// an open note showed no Tabbin icon. electron-builder copies icon.ico to
// resources/ as a loose file, so prefer that when packaged and fall back to the
// source tree for `npm start`.
const appIcon = () => {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  if (!app.isPackaged) return path.join(__dirname, file);
  const loose = path.join(process.resourcesPath, file);
  return fs.existsSync(loose) ? loose : path.join(__dirname, file);
};
const configFile = () => userDataFile('config.json');
// Notes live beside Tabbin's other userData by default. When Settings picks a
// folder, notes.json lives there instead — so this resolves on every call rather
// than caching one path at startup, otherwise a folder change would keep writing
// to the old location for the rest of the session.
function notesDir() {
  const configured = loadConfig().saveLocation;
  if (!configured || configured === 'same') return app.getPath('userData');
  return configured;
}
const dataFile = () => path.join(notesDir(), 'notes.json');
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
// dockBg selects the dock's appearance:
//   'classic' - no panel; coloured note tiles that expand on hover
//   'glass'   - the same glass cards with no panel behind them
// v2.2.1 drops the old 'glass' appearance (the near-opaque panel behind glass
// cards). Users asked for the classic coloured-note look back, so that mode
// took the name 'clear' and the bare-glass mode took the name 'glass'.
const DOCK_BACKGROUNDS = ['classic', 'glass'];
// A config written by 2.1.0 or earlier stores 'clear' | 'glass' | 'bare'.
// Mapping has to keep every user on an appearance they recognise:
//   clear -> classic  (same tiles, now under its own name)
//   bare  -> glass    (same bare cards, renamed)
//   glass -> glass    (the old panel mode has no successor; its glass cards do)
// An unrecognised value falls back to the default rather than being dropped,
// so a hand-edited config still opens the app.
const LEGACY_DOCK_BACKGROUNDS = { clear: 'classic', bare: 'glass', glass: 'glass' };
const defaultConfig = {
  edge: 'left', edgeHover: true, noteWidth: 430, noteHeight: 430,
  dockWidth: 'compact', dockBg: 'classic', saveLocation: 'same', launchOnStartup: false
};

function migrateDockBg(value) {
  if (DOCK_BACKGROUNDS.includes(value)) return value;
  return LEGACY_DOCK_BACKGROUNDS[value] || defaultConfig.dockBg;
}

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

// A chosen save folder has to be an absolute, writable directory. Rejecting
// anything else here stops a bad value from silently stranding every later save.
function isValidSaveDir(dir) {
  if (dir === 'same') return true;
  if (typeof dir !== 'string' || !dir.trim() || !path.isAbsolute(dir)) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// Changing the save folder is a real data move: carry notes.json (and its
// backup) across so the user's notes do not appear to vanish. Never clobbers a
// notes.json that already exists at the destination.
function migrateNotesDir(from, to) {
  if (!to || to === 'same') return;
  const source = from && from !== 'same'
    ? path.join(from, 'notes.json')
    : path.join(app.getPath('userData'), 'notes.json');
  try {
    fs.mkdirSync(to, { recursive: true });
    const dest = path.join(to, 'notes.json');
    if (!fs.existsSync(source) || fs.existsSync(dest)) return;
    fs.copyFileSync(source, dest);
    if (fs.existsSync(source + '.bak')) fs.copyFileSync(source + '.bak', dest + '.bak');
    console.log('[Tabbin] Moved notes to', to);
  } catch (err) {
    console.log('[Tabbin] Could not move notes to', to, '-', err.message);
  }
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
    // Dock width. 'roomy' matches the design mockup's 320px; 'compact' fits more
    // on small screens. Users pick this in Settings.
    const fullWidth = config.dockWidth === 'compact' ? 268 : 320;
    // Collapsed dock is a plain sliver. The mockup's coloured edge pills were
    // tried here and removed, because they sit in the left margin and obstruct
    // normal scrolling. Nothing is drawn while collapsed.
    const hiddenWidth = 10;
  // The dock is content-sized and vertically centred instead of filling the
  // screen edge to edge. The renderer measures the height of the notes it is
  // showing (VISIBLE_BY_MODE: six clear tiles, four glass/bare cards) and reports
  // it here; CHROME_H covers the top bar and footer, and keeps the window from
  // collapsing on first paint before that measurement arrives.
  const CHROME_H = 96;
  const natural = typeof dockContentHeight === 'number' && dockContentHeight > 0 ? dockContentHeight : 0;
  const height = Math.min(
    display.size.height,
    Math.max(220, natural + CHROME_H),
  );
  // Centre against the ACTUAL screen height, not workAreaSize. workArea excludes
  // the taskbar, so centring against it left the dock pinned high (y=0 on a
  // 1008px screen) instead of optically centred.
  const screenH = display.size.height;
  const y = Math.max(0, Math.round((screenH - height) / 2));
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
// `at` is a screen position in DIP. Passed when a note is opened by dragging a
// tile out of the dock, so the window lands where it was dropped instead of the
// centre of the display.
function openNote(id, at) {
  clearHideTimer();
  hideDock();
  if (noteWindows.has(id) && !noteWindows.get(id).isDestroyed()) {
    const window = noteWindows.get(id);
    if (window.isMinimized()) window.restore();
    // An already-open note follows the drop rather than jumping to its old spot.
    if (at) {
      const [w, h] = window.getSize();
      window.setPosition(Math.round(at.x - w / 2), Math.round(at.y - 20), false);
    }
    window.show();
    window.focus();
    return;
  }
  const note = loadNotes().find(item => item.id === id);
  const noteColor = note && note.color || palette[0];
  const config = loadConfig();
  // A per-window AppUserModelID. Sharing the app's makes Windows group every
  // window under one identity and take the taskbar icon from the registered
  // shortcut rather than from BrowserWindow.icon, so a note showed a generic
  // page icon despite the exe carrying one. Setting `appId` here is what makes
  // the per-window `icon` actually take effect.
  const window = new BrowserWindow({
    appId: `com.vanz15.tabbin.note.${id}`,
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
    // Frameless + transparent so the CSS clip-path and colour spine genuinely
    // reach the rounded corners against the desktop. The white-box/ghosting
    // regression that an earlier opaque base guarded against is handled in
    // note.html instead (the page paints an opaque gradient over the whole
    // .wrap, so there is no uninitialised region for Chromium to leave white).
    transparent: true,
    backgroundColor: '#00000000',
    icon: appIcon(),
    autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  window.setResizable(true);
  if (at) {
    const [w] = window.getSize();
    window.setPosition(Math.round(at.x - w / 2), Math.round(at.y - 20), false);
  }
  noteWindows.set(id, window);
  // Pass the palette so the colour dots and the window gradient always agree
  // with the colours the main process assigns to new notes.
  // `bg` lets the page follow the dock's appearance: classic notes are solid
  // colour, glass notes keep the dark window. Passed as a query param alongside
  // the palette for the same reason, rather than a second IPC round-trip.
  window.loadFile('note.html', {
    query: { id, palette: palette.join(','), bg: migrateDockBg(config.dockBg) }
  });
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
  // The stored flag can disagree with reality — a user can remove the entry in
  // Task Manager, or reinstall. Ask Windows what is registered so the toggle
  // reflects the truth rather than a stale preference.
  try {
    const actual = app.getLoginItemSettings().openAtLogin;
    const stored = loadConfig().launchOnStartup;
    if (typeof actual === 'boolean' && actual !== stored) {
      const synced = { ...loadConfig(), launchOnStartup: actual };
      saveConfig(synced);
      console.log('[Tabbin] Startup flag reconciled with Windows:', stored, '->', actual);
    }
  } catch (err) {
    console.log('[Tabbin] Could not read login item settings:', err.message);
  }
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
// config:get and config:set must return the SAME shape. The renderer merges
// whatever comes back over its own cfg, so returning the bare config from
// config:set silently erased notesPath and left the save-location row stuck on
// its unresolved state after every settings change.
function configPayload(config) {
  return { ...config, palette, notesPath: dataFile() };
}

ipcMain.handle('config:get', () => {
  const config = loadConfig();
  // Never hand the renderer a value it would put straight into classList.add().
  // This also migrates a pre-2.2 name on the way out, and writes the result back
  // so the rename is not re-applied on every launch.
  const migrated = migrateDockBg(config.dockBg);
  if (migrated !== config.dockBg) {
    config.dockBg = migrated;
    saveConfig(config);
  }
  return configPayload(config);
});
// Settings persist immediately and re-layout the dock, so a change to the
// activation edge or width is visible without a restart.
ipcMain.handle('config:set', (_, patch) => {
  const current = loadConfig();
  // Migrate a pre-2.2 background name before it is merged in, or `next` would
  // carry the legacy value forward and the renderer's classList.add() would be
  // handed a class that no longer exists.
  if ('dockBg' in patch) {
    const wanted = migrateDockBg(patch.dockBg);
    if (wanted !== patch.dockBg) patch = { ...patch, dockBg: wanted };
    else if (!DOCK_BACKGROUNDS.includes(patch.dockBg)) {
      console.log('[Tabbin] Rejected unknown dock background:', patch.dockBg);
      return current;
    }
  }
  const next = { ...current, ...patch };
  // A save folder is the one setting that can break every subsequent save, so
  // it is validated before it is written and the old value survives a bad pick.
  if ('saveLocation' in patch && !isValidSaveDir(patch.saveLocation)) {
    console.log('[Tabbin] Rejected invalid save location:', patch.saveLocation);
    return current;
  }
  // Startup registration is a real side effect on the user's machine, so it is
  // applied the moment the value changes rather than only at next launch.
  if ('launchOnStartup' in patch && typeof patch.launchOnStartup === 'boolean') {
    const wanted = patch.launchOnStartup;
    // `openAtLogin` alone is not enough for a dev run: `npm start` launches
    // electron.exe out of node_modules, so the registered path has to point at
    // that binary. In a packaged build app.getPath('exe') is Tabbin.exe itself,
    // which is exactly what should launch at sign-in.
    const exePath = app.isPackaged ? process.execPath : path.join(process.execPath, '..', '..', 'electron.exe');
    try {
      app.setLoginItemSettings({
        openAtLogin: wanted,
        openAsHidden: false,
        path: exePath,
        args: app.isPackaged ? [] : ['.'],
      });
      console.log('[Tabbin] Launch on startup:', wanted, '->', exePath);
    } catch (err) {
      console.log('[Tabbin] Could not set login item:', err.message);
      return current;
    }
  }
  if (patch.saveLocation && patch.saveLocation !== current.saveLocation) {
    migrateNotesDir(notesDir(), patch.saveLocation);
  }
  saveConfig(next);
  layout();
  // The renderer mirrors the edge with a class, so it has to be told.
  const payload = configPayload(next);
  if (dock && !dock.isDestroyed()) dock.webContents.send('config:changed', payload);
  return payload;
});
ipcMain.handle('updates:status', () => updater.snapshot());
ipcMain.handle('updates:check', () => updater.check());
ipcMain.handle('updates:download', () => updater.download());
ipcMain.handle('updates:install', () => updater.install());
ipcMain.handle('updates:dismiss-nudge', () => updater.dismissNudge());
ipcMain.handle('notes:list', () => loadNotes().sort((a, b) => b.updatedAt - a.updatedAt));
ipcMain.handle('notes:create', () => {
  const notes = loadNotes();
  // New notes rotate through the palette so successive notes are visually distinct.
  // The old "New note color" settings choice was removed — set the colour from the
  // note window's colour dots after creating the note instead.
  const color = palette[notes.length % palette.length];
  const note = { id: crypto.randomUUID(), title: 'Untitled note', content: '', color, updatedAt: Date.now() };
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
// Opened by dragging a tile out of the dock. The renderer sends client coords;
// they are converted to screen coords here so the window lands under the cursor
// regardless of where the dock itself sits.
// A tile drag finished. Decide here whether that was a reorder (dropped on the
// dock) or a request to open the note (dropped anywhere else), because only the
// main process can read the real cursor once it has left the dock window —
// screen.getCursorScreenPoint() is not clipped to the dock's own bounds.
const DROP_MARGIN = 8;
ipcMain.handle('dock:note-dropped', (_, id) => {
  if (!dock || dock.isDestroyed()) return false;
  const cursor = screen.getCursorScreenPoint();
  const [dx, dy] = dock.getPosition();
  const [dw, dh] = dock.getSize();
  const outside =
    cursor.x < dx - DROP_MARGIN ||
    cursor.x > dx + dw + DROP_MARGIN ||
    cursor.y < dy - DROP_MARGIN ||
    cursor.y > dy + dh + DROP_MARGIN;
  if (!outside) return false;
  // The cursor may be on a second monitor, so clamp to the work area of the
  // display it is actually on rather than the primary one.
  const bounds = screen.getDisplayNearestPoint(cursor).workArea;
  openNote(id, {
    x: Math.min(Math.max(cursor.x, bounds.x), bounds.x + bounds.width - 80),
    y: Math.min(Math.max(cursor.y - 20, bounds.y), bounds.y + bounds.height - 40)
  });
  return true;
});
ipcMain.handle('notes:toggle-always-on-top', async (_, id) => {
  const notes = loadNotes(); const index = notes.findIndex(note => note.id === id); if (index < 0) return null;
  notes[index] = { ...notes[index], alwaysOnTop: !notes[index].alwaysOnTop };
  await queueWrite(notes);
  const noteWindow = noteWindows.get(id); if (noteWindow && !noteWindow.isDestroyed()) noteWindow.setAlwaysOnTop(!!notes[index].alwaysOnTop, 'floating');
  broadcast('notes:changed', notes);
  return notes[index];
});
// Clear every note at once (Settings "Clear all notes"). Backed up first so
// a single accidental tap cannot wipe the file irrecoverably.
ipcMain.handle('notes:clear', async (_, confirm) => {
  if (confirm !== true) return { aborted: true };
  const notes = loadNotes();
  const backup = dataFile() + '.bak';
  try { fs.copyFileSync(dataFile(), backup); } catch { /* ignore missing */ }
  saveNotes([]);
  for (const window of noteWindows.values()) {
    if (!window.isDestroyed()) window.close();
  }
  broadcast('notes:changed', []);
  return { cleared: notes.length };
});
ipcMain.handle('dock:hide', () => hideDock());
ipcMain.handle('dock:content-height', (_, h) => {
  const next = Math.max(0, Math.round(Number(h) || 0));
  // Ignore nonsense and no-op repaints: relaying out on every frame would make
  // the dock jitter while the user scrolls or types in search.
  if (!next || Math.abs(next - dockContentHeight) < 4) return;
  dockContentHeight = next;
  layout();
});
ipcMain.handle('dock:cursor-left', () => scheduleHide());
// Folder picker for the Settings "Save location" row. Returns the chosen
// absolute path, or null if the user cancels. Persists via config:set.
// Reveal where notes actually live. Opening the folder itself (rather than
// selecting notes.json) is the useful action: the user is answering "where are
// my notes", not "open this exact file".
ipcMain.handle('shell:show-notes-folder', async () => {
  const file = dataFile();
  // showItemInFolder highlights notes.json when it exists, and falls back to
  // opening the containing directory when it does not — which is the right
  // behaviour for a fresh install with no notes yet.
  if (fs.existsSync(file)) shell.showItemInFolder(file);
  else await shell.openPath(path.dirname(file));
  return true;
});
ipcMain.handle('dialog:browse-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createPrompt'],
    title: 'Choose where new notes are saved',
  });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) return null;
  return result.filePaths[0];
});
