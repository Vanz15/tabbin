## Tabbin v2.0.0 — Frosted-glass redesign

A complete UI redesign. The version jumps to 2.0.0 so this build is unmistakable
next to the v1.x tab-based dock — if you open v2.0.0 and still see narrow
hover-expand tabs, you are running an older build.

No data format changed, so upgrading preserves your existing notes and settings.

> [!NOTE]
> **If you installed v1.0.1 or earlier, download the installer below.** Only
> v1.0.1 and later can self-update, and this release reaches existing installs
> through the normal update feed.

### Changed

- **Dock redesigned as a frosted-glass panel.** Full-width note cards show title,
  preview and a relative timestamp at rest, replacing the v1.x hover-expand tabs.
  Each card is tinted by its note colour with a matching spine on the leading
  edge.
- **Search is always visible** instead of a zero-width field that expanded on
  hover. `Ctrl K` focuses it and `Escape` clears it.
- **Thin scrollbar** replaces the hidden one.
- **Note window rethemed** with custom chrome: the Tabbin mark, pin and close
  controls, per-note colour dots, live active-formatting highlight, a word count
  and a saved-status dot.
- **Palette reworked** from six flat tab colours to five softer pastels. Existing
  notes are re-tinted on first launch, mapped to the nearest new colour; the
  migration runs once and never rewrites a colour it cannot parse.
- **Bundled Geist typeface** rather than a Google Fonts link, so the UI renders
  identically offline and never waits on a CDN.
- **Dock width 390px → 320px**, matching the design.

### Fixed

- **Typing in a note window ghosted and flickered a white box.** The window was
  frameless with an alpha-0 background but no `transparent: true`, so Chromium
  composited an uninitialised region over the text. The window is now opaque.
- **Resize was the slowest interaction.** `thickFrame` kept OS resize
  hit-testing active through every drag on a frameless window. It is now off.
- **The save round-trip no longer rebuilds the editor.** Saving broadcasts state
  back to the originating window, which rebuilt the text and dropped the caret.
- **Word count no longer stalls typing.** Reading `innerText` forces a
  synchronous layout flush and was running on every keystroke; it is now
  debounced.
- **Dock was unreadable over a busy desktop.** The glass tint is now 0.96 alpha.
  The 0.74 in the design mockup assumed a blur that a frameless overlay has
  nothing to sample.

### Notes

- Acrylic was removed from the dock: Windows composites it across the whole
  rectangular window, filling the corners beneath the CSS `border-radius` and
  making them read as fake.
- The mockup's coloured edge pills were tried and removed — they sit in the left
  margin and obstruct normal scrolling. The collapsed dock draws nothing.
- Auto-update still applies to the installed build only; the portable executable
  cannot replace itself.
- Tabbin is not code signed, so Windows SmartScreen may warn you when installing
  or downloading an update.

### Download Links

- [Tabbin-Setup.exe](https://github.com/Vanz15/tabbin/releases/download/v2.0.0/Tabbin-Setup.exe) — installed build, receives updates
- [Tabbin-Portable.exe](https://github.com/Vanz15/tabbin/releases/download/v2.0.0/Tabbin-Portable.exe) — no install, no auto-update

### Checksums

<!-- Taken from the artifacts actually published, not from a local dist/ taken
     before the publish-time rebuild. `npm run verify:feed` checks these against
     GitHub's stored asset digests. -->
- `Tabbin-Setup.exe`: `be2bb8933b12b15dfb70ba3732c67bb504f0bb1067bc633c2e6cb8a0418d57f5`
- `Tabbin-Portable.exe`: `1badb8361260332ea1667b79e5b81da4c5fb3c1bdfc6627923ba987b59f55872`