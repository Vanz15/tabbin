# Tabbin — Project Plan

Tabbin is a lightweight, hover-activated dock for quick notes. The dock parks on
a screen edge, reveals itself on hover, and opens notes in native-resizable
windows. **The current version is 2.2.2.**

## What is shipped

A transparent auto-hide dock on a screen edge, two appearances (`classic`
coloured tiles, `glass` floating cards), rich-text note editing, drag-to-reorder
inside the dock, drag-out-to-open past the dock edge, per-note pinning and
colour, single-instance enforcement, and background auto-updates for the
installed build. Notes and settings persist in the Electron user data
directory with atomic writes and a backup fallback.

Configuration lives in a **settings panel inside the dock**, reached from the
header menu. It exposes dock side (left/right), appearance, auto-hide, dock
width, launch-on-startup, save location, and clear-all-notes. A `dockBg` value
written by 2.1.0 or earlier is migrated on read rather than reset, so upgrading
never costs a user their chosen appearance.

## Auto-update

`updater.js` owns a pure state machine (`updater-state.js`) so every
transition is unit tested, and the dock both subscribes to and pulls the current
state on load. Portable builds detect themselves and explain that they cannot
self-update. Checks run at launch, every 6 hours, and on system resume.

## Before publishing a release

1. `npm test` — 7 suites, all must pass.
2. `npm run build:win` — produces `Tabbin-Setup.exe` and `Tabbin-Portable.exe`.
3. `npm run verify:feed -- --tag vX.Y.Z` — confirms the published feed matches
   the attached artifacts. Judge the feed by **content** (size and SHA-512),
   never by upload timestamp; a byte-identical re-upload changes nothing.
4. Fill the checksums in the release body from **GitHub's stored asset
   digests**, never from local `dist/` — `--publish` rebuilds, so the local
   bytes are not the bytes that ship.

For pre-release builds, publish `beta.yml` and set `"channel": "beta"` in
`build.publish` so a beta can never overwrite the stable feed.

## Known gaps

- **No code signing.** Every install and update download can hit a SmartScreen
  warning. This is the largest remaining launch-funnel risk.
- **No CI.** There are no GitHub Actions workflows; builds and releases are
  performed manually on one machine. `npm run verify:feed` is the only automated
  guard against a malformed release.
- **No macOS artifact has ever been published**, despite `build:mac`,
  `build:all`, and the `build.mac` config block existing. The README advertises
  DMG/ZIP for macOS; that claim is not yet true.
- **Four-edge docking is not implemented.** Only left and right are supported.
  A horizontal dock would be new layout work rather than a switch.
- **Drag-out-to-close is not built.** Dragging a note window back into the dock
  to close it was requested and deliberately deferred out of 2.2.1 and 2.2.2.
  It must resolve the drop in the **main** process via
  `screen.getCursorScreenPoint()` — a renderer-side bounds test cannot work,
  because once the cursor leaves the window Chromium stops delivering drag
  events and clamps coordinates. Needs: the dock reopens if hidden, a dashed drop
  zone, the note stays in the list, and it must work from both edges.
- **The test suites are mostly assertions against source text.** They guard
  against accidental regressions but are not behavioral coverage, with the
  exception of the updater state machine and the release-body checksum guard.

## Retracted and corrected claims

**The v1.0.0 update feed was never corrupt.** An earlier version of this plan
claimed v1.0.0's `latest.yml` was internally inconsistent because it was
uploaded before the installer and blockmap. That was wrong, and it stays
retracted. `verify:feed -- --tag v1.0.0` confirms the feed describes the
shipped installer correctly, and v1.0.0's only update defect was dead updater
wiring, fixed in v1.0.1.

**The v1.0.0 release body has been corrected.** It previously carried beta.1
checksums (`00e466ea…`, `5e14b991…`); it now carries the digests GitHub
actually stored for v1.0.0 (`c635d6a7…`, `f6155202…`). Nothing further is
needed there.