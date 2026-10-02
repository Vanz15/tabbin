'use strict';

// Pure update state machine. No Electron, no filesystem, no clock.
//
// Everything impure (timestamps, the autoUpdater instance, disk) is injected by
// the caller as event payloads, which keeps every transition here trivially
// testable with plain `node`. This is the only part of the updater that can be
// verified behaviorally, so keep it that way.

const STATUS = Object.freeze({
  UNSUPPORTED: 'unsupported',
  IDLE: 'idle',
  CHECKING: 'checking',
  UPTODATE: 'uptodate',
  AVAILABLE: 'available',
  DOWNLOADING: 'downloading',
  READY: 'ready',
  ERROR: 'error',
});

// Statuses during which a download is pending, in flight, or already finished.
// `available` counts because autoDownload starts fetching the moment we reach
// it: letting a recheck reset that to `checking` would reject every subsequent
// `progress` event and make the dock's progress bar disappear mid-download.
const DOWNLOAD_LOCKED = Object.freeze([STATUS.AVAILABLE, STATUS.DOWNLOADING, STATUS.READY]);

function createInitialState(overrides) {
  return Object.assign(
    {
      status: STATUS.IDLE,
      // Set when status is 'unsupported': 'dev' or 'portable'.
      reason: null,
      currentVersion: null,
      availableVersion: null,
      releaseName: null,
      releaseNotes: null,
      releaseDate: null,
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
      message: null,
      checkedAt: null,
      nudgeDismissed: false,
    },
    overrides || {},
  );
}

function reduce(state, event) {
  if (!state || !event || typeof event.type !== 'string') return state;

  switch (event.type) {
    // The build can never update itself (dev run, or the portable exe).
    case 'unsupported': {
      if (state.status === STATUS.UNSUPPORTED) return state;
      return Object.assign({}, state, {
        status: STATUS.UNSUPPORTED,
        reason: event.reason || null,
        availableVersion: null,
        releaseName: null,
        releaseNotes: null,
        releaseDate: null,
        percent: 0,
      });
    }

    case 'dismiss-nudge': {
      if (state.nudgeDismissed) return state;
      return Object.assign({}, state, { nudgeDismissed: true });
    }

    case 'check': {
      if (state.status === STATUS.UNSUPPORTED) return state;
      if (state.status === STATUS.CHECKING) return state;
      if (DOWNLOAD_LOCKED.indexOf(state.status) !== -1) return state;
      return Object.assign({}, state, { status: STATUS.CHECKING, message: null });
    }

    case 'no-update': {
      if (state.status === STATUS.UNSUPPORTED) return state;
      if (DOWNLOAD_LOCKED.indexOf(state.status) !== -1) return state;
      return Object.assign({}, state, {
        status: STATUS.UPTODATE,
        availableVersion: null,
        releaseName: null,
        releaseNotes: null,
        releaseDate: null,
        percent: 0,
        message: null,
        checkedAt: event.checkedAt === undefined ? state.checkedAt : event.checkedAt,
      });
    }

    case 'available': {
      if (state.status === STATUS.UNSUPPORTED) return state;
      if (DOWNLOAD_LOCKED.indexOf(state.status) !== -1) return state;
      return Object.assign({}, state, {
        status: STATUS.AVAILABLE,
        availableVersion: event.version || state.availableVersion,
        releaseName: event.releaseName || null,
        releaseNotes: event.releaseNotes || null,
        releaseDate: event.releaseDate || null,
        percent: 0,
        transferred: 0,
        total: 0,
        bytesPerSecond: 0,
        message: null,
        checkedAt: event.checkedAt === undefined ? state.checkedAt : event.checkedAt,
      });
    }

    case 'progress': {
      // Progress only means something once we know we are downloading.
      if (state.status !== STATUS.AVAILABLE && state.status !== STATUS.DOWNLOADING) {
        return state;
      }
      const percent = clampPercent(event.percent);
      return Object.assign({}, state, {
        status: STATUS.DOWNLOADING,
        percent,
        transferred: numberOr(event.transferred, state.transferred),
        total: numberOr(event.total, state.total),
        bytesPerSecond: numberOr(event.bytesPerSecond, state.bytesPerSecond),
      });
    }

    case 'downloaded': {
      if (state.status === STATUS.UNSUPPORTED) return state;
      return Object.assign({}, state, {
        status: STATUS.READY,
        availableVersion: event.version || state.availableVersion,
        releaseName: event.releaseName || state.releaseName,
        percent: 100,
        message: null,
      });
    }

    case 'error': {
      if (state.status === STATUS.UNSUPPORTED) return state;
      return Object.assign({}, state, {
        status: STATUS.ERROR,
        message: event.message || 'Update failed',
      });
    }

    // Used when a check resolves without emitting any event, so the spinner in
    // the dock can never get stuck on "Checking…".
    case 'settle': {
      if (state.status !== STATUS.CHECKING) return state;
      return Object.assign({}, state, {
        status: STATUS.UPTODATE,
        checkedAt: event.checkedAt === undefined ? state.checkedAt : event.checkedAt,
      });
    }

    case 'reset': {
      if (state.status === STATUS.UNSUPPORTED) return state;
      return createInitialState({
        currentVersion: state.currentVersion,
        nudgeDismissed: state.nudgeDismissed,
        checkedAt: state.checkedAt,
      });
    }

    default:
      return state;
  }
}

// What the user can usefully do right now. Computed in main so the renderer
// never has to re-derive policy from status strings.
function nextAction(state) {
  switch (state.status) {
    case STATUS.AVAILABLE:
      return 'download';
    case STATUS.READY:
      return 'install';
    case STATUS.ERROR:
      return 'retry';
    default:
      return 'none';
  }
}

function isVisible(state) {
  if (!state) return false;
  if (state.status === STATUS.UNSUPPORTED) return !state.nudgeDismissed;
  return [STATUS.AVAILABLE, STATUS.DOWNLOADING, STATUS.READY, STATUS.ERROR].indexOf(
    state.status,
  ) !== -1;
}

function clampPercent(value) {
  const n = Number(value);
  if (!isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function numberOr(value, fallback) {
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

module.exports = {
  STATUS,
  DOWNLOAD_LOCKED,
  createInitialState,
  reduce,
  nextAction,
  isVisible,
};
