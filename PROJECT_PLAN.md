# Tabbin — Launch Plan

Tabbin is a lightweight, hover-activated workspace for organizing quick notes
without interrupting the user's workflow. **v1.0.0** is published as a stable
release; **v1.0.1** is the auto-update fix that makes it maintainable in the
field. The current source tree is v1.0.1.

## What is shipped

Transparent auto-hide dock on the primary display's edge, colored note tabs with
hover preview, rich-text note editing, drag-to-reorder, native-resizable note
windows, per-note pinning, single-instance enforcement, and background
auto-updates for the installed build. Notes and settings persist in the Electron
user data directory with atomic writes and a backup fallback.

The Settings window was removed during beta because it was unreliable. Dock
behavior uses safe defaults and persisted configuration internally. Right-edge
docking is implemented in the layout and CSS but not yet reachable from the UI.

## Auto-update (v1.0.1)

v1.0.0 shipped an updater that no window listened to, with downloading disabled,
so an available update was discovered and discarded. v1.0.1 rebuilds it around a
pure state machine (`updater-state.js`) so that every transition is unit tested,
and the dock both subscribes to and pulls the current state on load. Portable
builds detect themselves and explain that they cannot self-update. Checks run at
launch, every 6 hours, and on system resume.

## Before announcing a release

1. `npm test`
2. `npm run build:win` — produces `Tabbin-Setup.exe` and `Tabbin-Portable.exe`
3. Publish the release with all artifacts and `latest.yml` in a **single pass**.
   Do not re-upload assets over an already-published release; the v1.0.0 feed was
   generated before its installer and blockmap were uploaded, which breaks
   differential download.
4. `npm run verify:feed` — confirms the feed matches the published artifacts.
5. Fill in the real checksums in `RELEASE_NOTES.md` and publish those same
   hashes in the release body.

For pre-release builds, publish `beta.yml` and set `"channel": "beta"` in
`build.publish` so a beta can never overwrite the stable feed.

## Known gaps

- **No code signing.** Every install and update download hits a SmartScreen
  warning. This is the largest remaining launch-funnel risk and is planned for a
  post-1.0.0 release.
- **No CI.** There are no GitHub Actions workflows; builds and releases are
  performed manually on one machine. `npm run verify:feed` is the only automated
  guard against a malformed release.
- **Right-edge docking** is implemented but unreachable without a settings
  surface.
- **The v1.0.0 release body lists the beta.1 checksums**, which do not match the
  published v1.0.0 assets. Correct this on GitHub.
- The test suites are mostly assertions against source text. They guard against
  accidental regressions but are not behavioral coverage, with the exception of
  the updater state machine.
