## Tabbin v2.1.0 — A dock you can configure

The dock gains a choice of appearances, a settings panel, and right-edge
docking. The note design itself is unchanged from v2.0.0, so no data format
moved — upgrading preserves your existing notes and settings.

> [!NOTE]
> **If you installed v1.0.1 or earlier, download the installer below.** Only
> v1.0.1 and later can self-update, and this release reaches existing installs
> through the normal update feed.

### Added

- **Three dock appearances**, switchable in Settings:
  - **Clear** — no panel; coloured note tiles that expand on hover. The default.
  - **Glass** — the v2.0.0 near-opaque panel behind glass cards.
  - **Bare** — the same glass cards with no panel behind them.
- **Settings panel**, behind the dock menu:
  - **Dock side** — left or right edge.
  - **Dock background** — clear, glass or bare.
  - **Auto-hide** — tuck the dock away when you move off it.
  - **Dock width** — compact (268px, the default) or roomy (320px).
  - **Launch Tabbin on Startup** — registers with Windows as you toggle it, and
    is reconciled against the real registration on launch, so an entry removed
    in Task Manager does not leave a stale "on" in the UI.
  - **Save location** — shows the folder your notes are written to, with a
    folder picker; changing it migrates existing notes.
  - **Clear all notes** — deletes every note, after confirmation.
- **Right-edge docking.** Notes grow leftward away from the screen edge, the
  colour spine swaps to the trailing side, and the header and note count align
  to that edge.
- **Overflow menu** in the header, holding Settings, Hide dock and Exit.

### Changed

- **The dock is content-sized and vertically centred** rather than filling the
  screen edge to edge. It shows six clear tiles or four glass/bare cards and
  scrolls beyond that; the two counts are chosen so the dock stays within a few
  pixels of the same height when you switch appearance.
- **The header is three glyphs**: a search toggle, add, and the menu. Search is
  opt-in and expands in place with the magnifier inside the field. Click the
  glyph again or press `Escape` to close it; `Ctrl K` still opens it.
- **Clear tiles are shorter** — 62px to 52px collapsed, 104px to 88px expanded,
  with the gap between tiles reduced from 10px to 6px.
- **Send feedback and the version number moved** out of the dock footer into
  settings, leaving the note count alone at the bottom.
- **The dock scrollbar is hidden.** The column still scrolls by wheel and
  keyboard.
- **Default dock width is 268px** (compact), down from 320px.
- The hide arrow flips to point at the edge the dock tucks into.

### Fixed

- **Settings rendered horizontally, off both edges of the panel.** Four rows
  were missing a closing `</div>`, so each nested inside the previous one — and
  because a row is a flex container, they laid out side by side.
- **The dock stayed full height no matter how many notes you had.** The renderer
  measured its note list before the configuration and notes had loaded, so the
  window was sized for an empty list and that small value was cached. Nothing
  re-ran the layout afterwards.
- **Right-edge docking looked identical to left-edge.** The `right` class was
  toggled onto the dock from the start, but no CSS rule referenced it, so the
  mirror simply did not exist.
- **A dropped brace could silently blank the whole dock.** A missing `}` in the
  renderer is a parse error that renders nothing and throws nothing. The test
  suite now parses the renderer and checks stylesheet and markup balance.

### Notes

- Auto-update still applies to the installed build only; the portable executable
  cannot replace itself.
- Tabbin is not code signed, so Windows SmartScreen may warn you when installing
  or downloading an update.

### Download Links

- [Tabbin-Setup.exe](https://github.com/Vanz15/tabbin/releases/download/v2.1.0/Tabbin-Setup.exe) — installed build, receives updates
- [Tabbin-Portable.exe](https://github.com/Vanz15/tabbin/releases/download/v2.1.0/Tabbin-Portable.exe) — no install, no auto-update

### Checksums

<!-- Fill these in from the artifacts actually published, not from a local dist/
     taken before the publish-time rebuild. `npm run verify:feed` checks these
     against GitHub's stored asset digests and fails on a mismatch. -->

- `Tabbin-Setup.exe`: _(pending — record sha256 after publish)_
- `Tabbin-Portable.exe`: _(pending — record sha256 after publish)_

> [!IMPORTANT]
> Do not publish with the placeholder checksums above. Copy the digests from the
> uploaded assets, then run `npm run verify:feed -- --tag v2.1.0` to confirm
> they match the files GitHub actually stored.