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
3. Publish the release with all artifacts and `latest.yml`. Uploading in one
   pass is still the right habit, but note that `verify:feed` judges the feed by
   **content**, not upload time — a byte-identical re-upload bumps the timestamp
   without breaking anything.
4. `npm run verify:feed` — confirms the feed matches the published artifacts.
5. Fill in the real checksums in `RELEASE_NOTES.md` and publish those same
   hashes in the release body.

For pre-release builds, publish `beta.yml` and set `"channel": "beta"` in
`build.publish` so a beta can never overwrite the stable feed.

## Verified: the v1.0.0 update feed is sound

An earlier draft of this plan claimed v1.0.0's `latest.yml` was internally
inconsistent because it was uploaded before the installer and blockmap. **That was
wrong, and the claim is retracted here.**

`npm run verify:feed -- --tag v1.0.0` confirms the feed describes the shipped
installer correctly:

- `latest.yml` declares `size: 71589128`, matching the attached
  `Tabbin-Setup.exe` exactly
- the declared SHA-512 is a well-formed 88-character base64 digest

`Tabbin-Setup.exe` was re-uploaded at 14:27 after `latest.yml` was created at
14:24, but a re-upload of identical bytes changes nothing. Timestamps prove
nothing about content, so `verify:feed` no longer uses them as a failure signal
and instead compares size and SHA-512.

**Conclusion: v1.0.0's only update defect was the dead wiring fixed in v1.0.1.**
There is no corrupt feed to replace, so publishing v1.0.1 from a normal
electron-builder build is sufficient. The genuinely wrong thing in the v1.0.0
release is its **body**, which carries beta.1 hashes.

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
  published v1.0.0 assets. Correct this on GitHub. (Verified: the body claims
  `00e466ea…` for the portable exe and `5e14b991…` for the installer, while
  GitHub's own digests are `c635d6a7…` and `f6155202…`.)
- The test suites are mostly assertions against source text. They guard against
  accidental regressions but are not behavioral coverage, with the exception of
  the updater state machine.
