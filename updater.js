'use strict';

const fs = require('fs');
const path = require('path');
const { app, powerMonitor } = require('electron');
const { autoUpdater } = require('electron-updater');
const { STATUS, createInitialState, reduce, nextAction, isVisible } = require('./updater-state');

const CHANNEL = 'latest';
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RESUME_RECHECK_AFTER_MS = 60 * 60 * 1000;

const stateFile = () => path.join(app.getPath('userData'), 'update-state.json');
const logFile = () => path.join(app.getPath('userData'), 'update.log');
const LOG_MAX_BYTES = 256 * 1024;

let state = createInitialState();
let broadcast = () => {};
let timer = null;
let checkInFlight = false;

// electron-updater logs to stdout, which is discarded for a packaged Windows
// app. Without this, a user's failed update leaves us with nothing to look at.
function fileLogger() {
  const write = (level, args) => {
    try {
      const file = logFile();
      const { size } = fs.statSync(file, { throwIfNoEntry: false }) || { size: 0 };
      if (size > LOG_MAX_BYTES) fs.writeFileSync(file, '');
      const message = args
        .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : safeStringify(a)))
        .join(' ');
      fs.appendFileSync(file, `${new Date().toISOString()} [${level}] ${message}\n`);
    } catch {
      // Logging must never be able to break an update.
    }
  };
  return {
    error: (...a) => write('error', a),
    warn: (...a) => write('warn', a),
    info: (...a) => write('info', a),
    debug: (...a) => write('debug', a),
  };
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function log(level, ...args) {
  try {
    fileLogger()[level](...args);
  } catch {
    // never throw from logging
  }
}

function loadPersisted() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    return createInitialState({
      nudgeDismissed: !!saved.nudgeDismissed,
      checkedAt: typeof saved.checkedAt === 'number' ? saved.checkedAt : null,
    });
  } catch {
    return createInitialState();
  }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ nudgeDismissed: state.nudgeDismissed, checkedAt: state.checkedAt }, null, 2),
    );
  } catch {
    // Never let a failed state write break the update flow.
  }
}

function dispatch(event) {
  const next = reduce(state, event);
  if (next === state) return state;
  state = next;
  persist();
  broadcast(snapshot());
  return state;
}

// The renderer consumes this verbatim, so every policy decision (what is
// clickable, whether to draw the row at all) is resolved here rather than
// being duplicated as string comparisons in dock.html.
function snapshot() {
  return Object.assign({}, state, {
    currentVersion: app.getVersion(),
    action: nextAction(state),
    visible: isVisible(state),
  });
}

// The portable exe runs from a temp-extracted directory; electron-updater's
// Windows path replaces an installed NSIS app and fails confusingly there.
function isPortable() {
  return !!process.env.PORTABLE_EXECUTABLE_FILE;
}

function unsupportedReason() {
  if (!app.isPackaged) return 'dev';
  if (isPortable()) return 'portable';
  return null;
}

function configure() {
  // Declared explicitly rather than relying on electron-updater's default, so
  // a beta build can never publish over the stable feed by accident.
  autoUpdater.channel = CHANNEL;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = fileLogger();

  // Lets a dev run talk to a real feed without a full package/cycle, while
  // `install()` stays disabled so a test run cannot replace a real install.
  const devFeed = process.env.TABBIN_UPDATE_FEED;
  if (!app.isPackaged && devFeed) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.setFeedURL({ provider: 'generic', url: devFeed });
  }
}

function bind() {
  autoUpdater.on('update-available', (info) => {
    dispatch({
      type: 'available',
      version: info && info.version,
      releaseName: info && info.releaseName,
      releaseNotes: info && info.releaseNotes,
      releaseDate: info && info.releaseDate,
      checkedAt: Date.now(),
    });
  });

  autoUpdater.on('update-not-available', () => {
    dispatch({ type: 'no-update', checkedAt: Date.now() });
  });

  autoUpdater.on('download-progress', (progress) => {
    dispatch({
      type: 'progress',
      percent: progress && progress.percent,
      transferred: progress && progress.transferred,
      total: progress && progress.total,
      bytesPerSecond: progress && progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dispatch({
      type: 'downloaded',
      version: info && info.version,
      releaseName: info && info.releaseName,
    });
  });

  autoUpdater.on('error', (error) => {
    checkInFlight = false;
    log('error', 'updater error:', error);
    dispatch({ type: 'error', message: error && error.message });
  });
}

async function check() {
  const reason = unsupportedReason();
  if (reason) {
    dispatch({ type: 'unsupported', reason });
    return snapshot();
  }
  if (checkInFlight) return snapshot();

  checkInFlight = true;
  dispatch({ type: 'check' });
  try {
    await autoUpdater.checkForUpdates();
    // electron-updater can resolve without emitting an event (already-cached
    // feed, same version). Settle so the dock never hangs on "Checking…".
    dispatch({ type: 'settle', checkedAt: Date.now() });
  } catch (error) {
    log('error', 'check failed:', error);
    dispatch({ type: 'error', message: error && error.message });
  } finally {
    checkInFlight = false;
  }
  return snapshot();
}

async function download() {
  if (state.status !== STATUS.AVAILABLE) return snapshot();
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    log('error', 'download failed:', error);
    dispatch({ type: 'error', message: error && error.message });
  }
  return snapshot();
}

function install() {
  // Only ever hand the real installed build to the installer.
  if (unsupportedReason()) return false;
  if (state.status !== STATUS.READY) return false;
  autoUpdater.quitAndInstall();
  return true;
}

function dismissNudge() {
  return dispatch({ type: 'dismiss-nudge' });
}

function startPeriodicChecks() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    check().catch(() => {});
  }, RECHECK_INTERVAL_MS);
  if (timer.unref) timer.unref();

  // A resident utility is rarely restarted, so a single startup check can leave
  // a long-lived install stale for months.
  if (powerMonitor && powerMonitor.on) {
    powerMonitor.on('resume', () => {
      const last = state.checkedAt || 0;
      if (Date.now() - last > RESUME_RECHECK_AFTER_MS) check().catch(() => {});
    });
  }
}

function init(onState) {
  broadcast = typeof onState === 'function' ? onState : () => {};
  state = loadPersisted();
  state.currentVersion = app.getVersion();

  const reason = unsupportedReason();
  if (reason) {
    dispatch({ type: 'unsupported', reason });
    return;
  }

  configure();
  bind();
  startPeriodicChecks();
  check().catch(() => {});
}

module.exports = { init, check, download, install, dismissNudge, snapshot, CHANNEL };
