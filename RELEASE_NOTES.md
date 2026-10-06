## Tabbin v2.2.1 — back to classic, and drag out to open

The dock goes back to the classic coloured-note look, drops to two appearances,
and a tile can now be dragged out of the dock to open.

No data format changed, so upgrading preserves your existing notes and settings.

### Added

- **Drag a tile out of the dock to open that note**, where it was released. A
  "Release to open" hint follows the cursor while you drag. Released back inside
  the dock it is still a reorder, so the existing drag-to-reorder is untouched.
  Works from either screen edge.
### Changed

- **The dock has two appearances instead of three.**
  - `classic` — coloured note tiles that expand on hover. Previously `clear`.
  - `glass` — the same cards floating without a panel behind them. Previously
    `bare`.
  - The near-opaque panel mode is gone. It had no successor in user feedback,
    which asked for the classic look back.
- **Note windows follow the dock's appearance.** Classic notes open as a solid
  sheet of the note colour with dark text; glass notes keep the dark window.
- **Settings offers Classic and Glass.**

### Fixed

- **Dragging a tile out of the dock did nothing.** The bounds test lived in the
  renderer, comparing drag coordinates against the dock's own rect — but once
  the cursor leaves the dock window, Chromium stops delivering drag events and
  clamps the coordinates to the window, so no point outside was ever visible
  there. The decision now happens in the main process, which reads the true
  cursor position and compares it against the dock's real bounds. A window
  dropped on a second monitor opens on that monitor.
- **The right edge stopped mirroring after the mode rename.** Two rules were
  compound selectors, `.dock.right.clear`, and renaming the plain `.dock.clear`
  selector never matched them, so they silently stopped applying and notes grew
  left-to-right again.
- **Active formatting was invisible in classic mode.** Bold, italic and
  strikethrough were drawn in the note colour, which on a classic note window is
  the colour of the sheet they sit on. The glyph now follows the page's ink
  colour, so it darkens on the light sheet.
- **Toolbar borders, separators and hover fills were white on the classic
  sheet**, where they read as dirt rather than as surfaces.
- **The note body ignored the classic appearance** because its colour was
  hardcoded instead of following the page's ink token.

Note storage, the note editor, auto-update and the settings panel are unchanged
apart from the mode rename.

### Notes

- A `dockBg` from 2.1.0 or earlier is migrated on first launch rather than
  reset, so you keep the appearance you chose.
- Auto-update still applies to the installed build only; the portable executable
  cannot replace itself.
- Tabbin is not code signed, so Windows SmartScreen may warn you when installing
  or downloading an update.

### Download Links

- [Tabbin-Setup.exe](https://github.com/Vanz15/tabbin/releases/download/v2.2.1/Tabbin-Setup.exe) — installed build, receives updates
- [Tabbin-Portable.exe](https://github.com/Vanz15/tabbin/releases/download/v2.2.1/Tabbin-Portable.exe) — no install, no auto-update

### Checksums

<!-- Digests of the assets GitHub actually stored, not the local dist/.
     `npm run verify:feed -- --tag v2.2.1` checks these against the published
     files and fails on a mismatch. -->

- `Tabbin-Setup.exe`: `2ee3d7bcc36b8b793f43fb8089f32f62a1c1c2d7f8f3befc988d834374863469`
- `Tabbin-Portable.exe`: `0b6545156334976d9d0403b9e15262c2a2fb37e345ce65f5df2e3e23c4679eca`

