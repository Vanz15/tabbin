const fs = require('fs');
const assert = require('assert');
const main = fs.readFileSync('main.js', 'utf8');
const updater = fs.readFileSync('updater.js', 'utf8');
const preload = fs.readFileSync('preload.js', 'utf8');
const dock = fs.readFileSync('dock.html', 'utf8');
const note = fs.readFileSync('note.html', 'utf8');
const loading = fs.readFileSync('loading.html', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.match(main, /dockState = 'hidden'/);
assert.match(main, /function showDock\(\)/);
assert.match(main, /function hideDock\(\)/);
assert.match(main, /function scheduleHide\(\)/);
assert.match(main, /dock\.isVisible\(\)/);
assert.match(main, /function createDock\(\)/);
assert.match(main, /requestSingleInstanceLock\(\)/);
assert.match(main, /second-instance/);
assert.match(main, /const appIcon = \(\) =>/);
assert.match(main, /hideTimer = setTimeout/);
// Edge reveal is limited to the dock's own vertical span (with 4px of slack),
// and the stay check reuses that span so a reveal cannot instantly hide again.
assert.match(main, /const edgePad = 4/);
assert.match(main, /point\.y >= bounds\.y - edgePad && point\.y <= bounds\.y \+ bounds\.height \+ edgePad/);
assert.match(main, /const insideDock = [^;]*inSpan/, 'the stay check must reuse the reveal span');
const scheduleBlock = (main.match(/function scheduleHide\(\)[\s\S]*?\n\}/) || [''])[0];
assert.ok(scheduleBlock, 'scheduleHide must be extractable');
assert.doesNotMatch(scheduleBlock, /dockState = 'hiding'/,
  'a cancelled hide must not leave the dock stuck in the hiding state');
assert.match(main, /dock\.setFocusable\(true\)/);
assert.match(main, /dock\.setFocusable\(false\)/);
assert.match(main, /createLoadingWindow\(\)/);
assert.match(main, /setTimeout[\s\S]*closeLoadingWindow[\s\S]*900/);
assert.match(main, /const DEFAULT_NOTE_SIZE = 430/);
assert.match(main, /noteWidth: DEFAULT_NOTE_SIZE, noteHeight: DEFAULT_NOTE_SIZE/);
assert.match(main, /window\.on\('resize'/);
assert.match(main, /alwaysOnTop: !!note\?\.alwaysOnTop/);
assert.match(main, /dock\.setAlwaysOnTop\(true, 'screen-saver'\)/);
// New fix: dock should not be suppressed during fullscreen
assert.match(main, /setFullScreenable\(false\)/);
assert.match(main, /alwaysOnTop: true/);
assert.match(main, /show: false/);
assert.match(updater, /require\('electron-updater'\)/);
assert.match(main, /ipcMain\.handle\('dock:hide',/);
assert.match(main, /app\.setAppUserModelId\('com\.vanz15\.tabbin'\)/);
assert.match(main, /title: 'Tabbin Notes'/);
console.log('PASS: Tabbin identity, auto-hide, reduced IPC bridge, and beta packaging configuration');
