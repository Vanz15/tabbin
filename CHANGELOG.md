# Changelog

All notable changes to Tabbin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-03

A complete UI redesign. The version was set to 2.0.0 rather than 1.1.0 so the
redesigned build is unmistakable next to the v1.x tab-based dock. No data format
changed, so upgrading preserves existing notes and settings.

### Changed

- **Dock redesigned as a frosted-glass panel.** Full-width note cards show title,
  preview and a relative timestamp at rest, replacing the v1.x hover-expand tabs
  (42px collapsed, expanding to 270px on hover). Each card is tinted by its note
  colour with a matching spine on the leading edge.
- **Search is always visible** instead of a zero-width field that expanded on
  hover. `Ctrl K` focuses it and `Escape` clears it.
- **Thin scrollbar** replaces the hidden one.
- **Note window rethemed** with custom chrome: the Tabbin mark, pin and close
  controls, per-note colour dots, live active-formatting highlight, a word count
  and a saved-status dot.
- **Palette reworked** from six flat tab colours to five softer pastels. Existing
  notes are re-tinted on first launch, mapped to the nearest new colour by RGB
  distance; the migration is idempotent and never rewrites a colour it cannot
  parse.
- **Bundled Geist typeface** rather than a Google Fonts link, so the UI renders
  identically offline and does not wait on a CDN.
- **Dock width 390px → 320px**, matching the design.

### Fixed

- **Typing in a note window ghosted and flickered a white box.** The window was
  frameless with an alpha-0 background but no `transparent: true`, so Chromium
  composited an uninitialised region over the text. The window is now opaque.
- **`thickFrame` disabled** on the frameless note window. It kept OS resize
  hit-testing active through every drag, making resize the most expensive repaint
  the window performed.
- **The save round-trip no longer rebuilds the editor.** Saving broadcasts
  `notes:changed` back to the originating window, which reassigned
  `editor.innerHTML` and destroyed the caret. `apply()` now writes only genuine
  changes.
- **Word count debounced.** Reading `editor.innerText` forces a synchronous
  layout flush and was running on every keystroke.
- **Dock unreadable over a busy desktop.** The glass tint is now 0.96 alpha. The
  design mockup's 0.74 assumed a `backdrop-filter` blur that a frameless
  Electron overlay has nothing to sample.

### Notes

- Acrylic was removed from the dock: Windows composites it across the whole
  rectangular window, filling the corners beneath the CSS `border-radius` and
  making them read as fake.
- The mockup's coloured edge pills were tried and removed — they sit in the left
  margin and obstruct normal scrolling. The collapsed dock draws nothing.

## [1.0.1] - 2026-10-02

### Fixed
- **Auto-update was never surfaced to the user.** The updater broadcast its events to renderers that never subscribed, and with downloading disabled a discovered update was silently discarded. Updates now download in the background and install the next time Tabbin quits.
- **Updates found during startup were lost.** The updater kept only an event stream, so an update discovered before the dock finished loading was dropped forever. It now owns a state snapshot that renderers both subscribe to and pull on load.
- **The download progress bar could blank mid-download.** A re-check landing between "update available" and "download finished" reset the state to checking, which rejected the following progress events.
- **Portable builds failed confusingly.** `Tabbin-Portable.exe` now detects itself and explains that it cannot update itself, instead of attempting an install it can never complete.
- **The update channel was implicit.** `latest` was only in effect by default. It is now declared in `build.publish`, so a pre-release build can no longer publish over the stable feed.

### Added
- Dock status row showing update available, download progress, ready to restart, and failure with retry.
- Re-check every 6 hours and on system resume. Previously only once at launch, which could leave a long-lived install stale for months.
- `update.log` in the user data directory, because packaged Windows builds discard electron-updater's stdout logging.
- `npm run verify:feed`, a release-time check that the published `latest.yml` actually matches the artifacts attached to the release. It compares content (size and SHA-512) rather than upload timestamps, since re-uploading identical bytes bumps a timestamp without breaking anything.

### Changed
- The dock version hint is read from the running app instead of being hardcoded to `v1.0.0+`.

## [1.0.0-beta.2] - 2026-09-13

### Added
- Improved dock button contrast using a semi-transparent white background
- Tab font colors now adapt to the luminance of the tab background
- Smoother hover transitions on dock buttons

## [1.0.0-beta.3] and [1.0.0-beta.4] - 2026-09-13/16

No user-facing changes; version bumps used to exercise the auto-update path.

## [1.0.0-beta.1] - 2026-09-13

### Added
- Transparent auto-hide dock on left screen edge
- Always-on-top behavior with fullscreen app compatibility
- Rich-text note editor with 6-color palette
- Drag-to-reorder tabs
- Per-note pinning (always-on-top notes)
- Native-resizable note windows with dimension persistence
- Single-instance enforcement
- Auto-update capability via GitHub releases
- NSIS installer with Start Menu and Desktop shortcuts
- Portable executable option
- Default notes: "Welcome to Tabbin", "Ideas", "Today"

### Fixed
- Dock visibility in fullscreen applications (`setFullScreenable(false)`)
- Proper always-on-top z-order (`setAlwaysOnTop(true, 'screen-saver')`)
- Removed redundant `dock.show()` call causing positioning issues

### Technical Details
- IPC bridge reduced from 11 methods to 7
- Context isolation enabled, nodeIntegration disabled
- Zero dependencies in renderer processes

### Removed
- Settings window (beta reliability focus)
- Right-edge docking (planned for v1.1)

[1.0.1]: https://github.com/Vanz15/tabbin/releases/tag/v1.0.1
[1.0.0-beta.2]: https://github.com/Vanz15/tabbin/releases/tag/v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/Vanz15/tabbin/releases/tag/v1.0.0-beta.1