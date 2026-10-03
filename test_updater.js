const fs = require('fs');
const assert = require('assert');

const { STATUS, createInitialState, reduce, nextAction, isVisible } = require('./updater-state');

const updater = fs.readFileSync('updater.js', 'utf8');
const updaterState = fs.readFileSync('updater-state.js', 'utf8');
const main = fs.readFileSync('main.js', 'utf8');
const preload = fs.readFileSync('preload.js', 'utf8');
const dock = fs.readFileSync('dock.html', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const apply = (state, type, payload) => reduce(state, Object.assign({ type }, payload));
const at = (status) => createInitialState({ status });

// --- Reducer: happy path -------------------------------------------------
{
  let s = createInitialState();
  assert.equal(s.status, STATUS.IDLE);
  assert.equal(nextAction(s), 'none');
  assert.equal(isVisible(s), false);

  s = apply(s, 'check');
  assert.equal(s.status, STATUS.CHECKING);

  s = apply(s, 'available', {
    version: '1.1.0',
    releaseName: 'Tabbin v1.1.0',
    checkedAt: 1000,
  });
  assert.equal(s.status, STATUS.AVAILABLE);
  assert.equal(s.availableVersion, '1.1.0');
  assert.equal(s.checkedAt, 1000);
  assert.equal(nextAction(s), 'download');
  assert.equal(isVisible(s), true);

  s = apply(s, 'progress', { percent: 42.4, transferred: 10, total: 20 });
  assert.equal(s.status, STATUS.DOWNLOADING);
  assert.equal(s.percent, 42.4);
  assert.equal(nextAction(s), 'none');
  assert.equal(isVisible(s), true);

  s = apply(s, 'downloaded', { version: '1.1.0' });
  assert.equal(s.status, STATUS.READY);
  assert.equal(s.percent, 100);
  assert.equal(nextAction(s), 'install');
}

{
  let s = apply(at(STATUS.CHECKING), 'no-update', { checkedAt: 42 });
  assert.equal(s.status, STATUS.UPTODATE);
  assert.equal(s.checkedAt, 42);
  assert.equal(isVisible(s), false);
}

// --- Reducer: illegal transitions are rejected, not applied --------------
// A rejected event must return the *same object* so callers can skip work.
{
  const idle = at(STATUS.IDLE);
  assert.strictEqual(apply(idle, 'progress', { percent: 50 }), idle, 'progress outside a download');
  // Deliberately permissive: a cached `update-downloaded` should still be honoured.
  assert.equal(apply(idle, 'downloaded', { version: '1.1.0' }).status, STATUS.READY);

  const checking = at(STATUS.CHECKING);
  assert.strictEqual(apply(checking, 'check'), checking, 'duplicate check');

  const ready = at(STATUS.READY);
  assert.strictEqual(apply(ready, 'check'), ready, 'periodic recheck must not clobber a finished download');
  assert.strictEqual(apply(ready, 'no-update'), ready, 'stale no-update must not clobber it');
  assert.strictEqual(apply(ready, 'available', { version: '9.9.9' }), ready);

  const downloading = at(STATUS.DOWNLOADING);
  assert.strictEqual(apply(downloading, 'check'), downloading, 'periodic recheck must not reset progress');

  // autoDownload starts fetching the instant we reach 'available', so a
  // recheck landing in that window used to reset to 'checking' and reject every
  // following 'progress' event, blanking the progress bar mid-download.
  const available = createInitialState({ status: STATUS.AVAILABLE, availableVersion: '1.0.2' });
  assert.strictEqual(apply(available, 'check'), available, 'recheck must not interrupt a pending auto-download');
  assert.strictEqual(apply(available, 'no-update'), available, 'stale no-update must not clear a pending download');
  assert.strictEqual(apply(available, 'available', { version: '1.0.3' }), available, 're-announce is ignored');
  assert.equal(
    apply(available, 'progress', { percent: 43 }).status,
    STATUS.DOWNLOADING,
    'progress still lands after a rejected recheck',
  );

  const unsupported = at(STATUS.UNSUPPORTED);
  for (const type of ['check', 'available', 'no-update', 'error', 'downloaded', 'reset']) {
    assert.strictEqual(apply(unsupported, type, { version: '1.1.0' }), unsupported, `${type} while unsupported`);
  }

  const done = at(STATUS.UPTODATE);
  assert.strictEqual(apply(done, 'settle'), done, 'settle only applies to an in-flight check');
}

// --- Reducer: unsupported builds and the portable nudge -----------------
{
  let s = apply(createInitialState(), 'unsupported', { reason: 'portable' });
  assert.equal(s.status, STATUS.UNSUPPORTED);
  assert.equal(s.reason, 'portable');
  assert.equal(isVisible(s), true, 'portable users get a one-time nudge');

  s = apply(s, 'dismiss-nudge');
  assert.equal(s.nudgeDismissed, true);
  assert.equal(isVisible(s), false, 'nudge stays dismissed');

  const dismissed = s;
  assert.strictEqual(apply(dismissed, 'dismiss-nudge'), dismissed, 'dismiss is idempotent');
}

// --- Reducer: settle clears a stuck spinner -----------------------------
{
  const s = apply(at(STATUS.CHECKING), 'settle', { checkedAt: 7 });
  assert.equal(s.status, STATUS.UPTODATE);
  assert.equal(s.checkedAt, 7);
}

// --- Reducer: percent is clamped, bad input is survivable ---------------
{
  assert.equal(apply(at(STATUS.AVAILABLE), 'progress', { percent: -5 }).percent, 0);
  assert.equal(apply(at(STATUS.AVAILABLE), 'progress', { percent: 500 }).percent, 100);
  assert.equal(apply(at(STATUS.AVAILABLE), 'progress', { percent: NaN }).percent, 0);
  const messy = apply(at(STATUS.AVAILABLE), 'progress', { total: 'nope' });
  assert.equal(messy.total, 0, 'non-numeric payload falls back instead of corrupting state');

  const someState = at(STATUS.IDLE);
  assert.strictEqual(reduce(someState, null), someState, 'malformed event is ignored');
  assert.strictEqual(reduce(someState, { type: 'nope' }), someState, 'unknown event is ignored');
  assert.strictEqual(reduce(null, { type: 'check' }), null, 'reducer tolerates a missing state');
}

// --- Purity: the reducer must be usable without Electron ----------------
{
  assert.doesNotMatch(updaterState, /require\(['"]electron/, 'reducer must not import Electron');
  assert.doesNotMatch(updaterState, /require\(['"]fs['"]\)/, 'reducer must not touch the filesystem');
}

// --- Wiring policy: main process ----------------------------------------
{
  assert.match(main, /require\('\.\/updater'\)/);
  assert.match(main, /updater\.init\(state => broadcast\('update:state', state\)\)/);
  assert.doesNotMatch(main, /require\('electron-updater'\)/, 'main must delegate to updater.js');
  assert.doesNotMatch(main, /autoUpdater/, 'main must not touch electron-updater directly');
  for (const channel of ['update:available', 'update:not-available', 'update:progress', 'update:downloaded', 'update:error']) {
    assert.doesNotMatch(main, new RegExp(`broadcast\\('${channel}'`), `${channel} replaced by a single state push`);
  }
  assert.match(main, /ipcMain\.handle\('updates:status'/);
  assert.match(main, /ipcMain\.handle\('updates:dismiss-nudge'/);
}

// --- Wiring policy: updater module ---------------------------------------
{
  assert.match(updater, /autoUpdater\.channel = CHANNEL/);
  assert.match(updater, /autoUpdater\.allowPrerelease = false/);
  assert.match(updater, /autoUpdater\.autoDownload = true/);
  assert.match(updater, /autoUpdater\.autoInstallOnAppQuit = true/);
  assert.match(updater, /const CHANNEL = 'latest'/);

  // Guards
  assert.match(updater, /app\.isPackaged/);
  assert.match(updater, /process\.env\.PORTABLE_EXECUTABLE_FILE/);
  assert.match(updater, /if \(unsupportedReason\(\)\) return false;/, 'install refuses non-installed builds');

  // Recheck cadence for a resident utility
  assert.match(updater, /setInterval/);
  assert.match(updater, /powerMonitor\.on\('resume'/);
  assert.match(updater, /\.unref\(\)/);

  // The push stream is not the only source of truth: renderers also pull.
  assert.match(updater, /function snapshot\(\)/);
  assert.match(updater, /action: nextAction\(state\)/);
  assert.match(updater, /visible: isVisible\(state\)/);
}

// --- Wiring policy: renderer --------------------------------------------
{
  assert.match(preload, /updateStatus: \(\) => ipcRenderer\.invoke\('updates:status'\)/);
  assert.match(preload, /onUpdateState: callback => ipcRenderer\.on\('update:state'/);
  assert.match(preload, /dismissUpdateNudge: \(\) => ipcRenderer\.invoke\('updates:dismiss-nudge'\)/);
  assert.doesNotMatch(preload, /onUpdate:/, 'generic per-channel listener replaced by a single state channel');

  assert.match(dock, /id="update"/);
  assert.match(dock, /onUpdateState/);
  // Pull as well as subscribe, or an update found during startup is lost.
  assert.match(dock, /updateStatus\(\)/);
  assert.match(dock, /function renderUpdate/);
  assert.match(dock, /appVersion/);
  assert.doesNotMatch(dock, /v1\.0\.0\+/, 'hardcoded version string removed in favour of the real one');
}

// --- Packaging ----------------------------------------------------------
{
  const publish = pkg.build.publish[0];
  assert.equal(publish.provider, 'github');
  assert.equal(publish.channel, 'latest', 'channel must be declared, not left to the default');
  assert.ok(pkg.build.files.includes('updater.js'), 'updater.js must ship in the package');
  assert.ok(pkg.build.files.includes('updater-state.js'), 'updater-state.js must ship in the package');
  assert.match(pkg.scripts['verify:feed'], /verify-feed/);
  assert.match(fs.readFileSync('scripts/verify-feed.js', 'utf8'), /sha512/);

  // The feed can verify clean while the release body advertises checksums from a
  // build that never shipped, so the body needs its own guard. v1.0.1 shipped
  // hashes copied from dist/ before `--publish always` rebuilt the binaries.
  const verifySrc = fs.readFileSync('scripts/verify-feed.js', 'utf8');
  assert.match(verifySrc, /verifyBodyChecksums/, 'verify-feed must check release-body checksums');
  assert.match(
    verifySrc,
    /verifyBodyChecksums\(release\.body,\s*assets\)/,
    'the body check must actually run against the published release',
  );
  // Both historical body formats have to be understood, or a stale table-style
  // checksum block (as on v1.0.0) slips through unverified.
  assert.match(verifySrc, /BODY_NAME_RE/, 'body asset names must be parsed');
  assert.match(verifySrc, /BODY_HASH_RE/, 'body checksum runs must be parsed');
  assert.match(
    verifySrc,
    /asset\.digest/,
    'body checksums must be compared against GitHub\'s stored asset digest',
  );
  // The guard must report what it found by return value so it can be unit
  // tested offline, rather than only mutating the module-scoped problems list.
  assert.match(
    verifySrc,
    /return found;/,
    'verifyBodyChecksums must return its findings so they can be tested',
  );
  assert.match(
    verifySrc,
    /require\.main === module/,
    'verify-feed must only run main() when invoked directly, so tests can require it',
  );
}

console.log(
  'PASS: updater state machine (reducer transitions, rejected events, portable guard, percent clamping) and live renderer wiring',
);
