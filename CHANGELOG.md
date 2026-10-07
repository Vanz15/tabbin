# Changelog

All notable changes to Tabbin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.3] - 2026-10-07

Three fixes for bugs that shipped since 2.2.1, none of which had anything to do
with notes data. No data format changed and nothing needs migrating.

### Fixed

- **Drag-reorder was discarded on every relaunch.** `notes:list` sorted by
  `updatedAt`, so the order you dragged tiles into was thrown away the next time
  the app started. Reordering looked like it worked because the handler
  broadcasts the ordered array and nothing re-sorted it until the next launch.
  The array in `notes.json` is the display order, and `notes:list` now returns it
  as persisted. `updatedAt` still drives the relative timestamp on each tile,
  just not the ordering.
- **Creating a note could lose one.** `notes:create` called `saveNotes()`
  directly while update, reorder, delete and pin all went through `queueWrite`.
  The comment above `queueWrite` warns about lost updates when two handlers read
  before either write lands, and create was not on the queue. It is serialized
  like the rest now.
- **Dragging a tile out of the dock threw a `ReferenceError` on every drag.**
  `dragHint` was declared with `const` inside `measureListCap()` but used from
  `render()`'s drag-end handler, so the identifier was never in scope. The note
  still opened, because `dropNote()` runs first, but the drag-over highlight
  never cleared. The same block was nested inside a measurement helper by
  mistake, so its two document listeners were re-registered on every re-measure.

### Removed

- **The "Release to open" drag hint.** 2.2.1's notes claimed it followed the
  cursor while you dragged. It never did, in any released version: the dock is
  its own OS window 268-320px wide, so a `position: fixed` hint cannot leave the
  panel, and the element was never given the `.show` class that reveals it. Drag
  out still opens the note where you drop it, and the drop handler now also lives
  at script top level where it was always meant to.

### Internal

- **A test was passing on the wrong CSS rule.** The assertion named
  `.dock.classic .tab` and wanted `width: 76px`, but the bare regex spanned past
  that rule's closing brace and matched a declaration 130 lines later inside a
  different block. It passed whether or not the rule it named was correct. It now
  anchors to the rule it names, and is confirmed to fail on a document where the
  width is absent.
- New `test_notes_order.js` runs the real storage functions against a temp notes
  file. Both data bugs above read as correct source, so no text assertion could
  have caught either.
- Dead code removed: an unused `sVersion` lookup, an unused `setSaveLocation`
  bridge entry, two unused CSS custom properties, a redundant `setResizable`,
  a vacuous `typeof` guard, the `electron-reload` dependency, and an orphaned
  icon SVG.

## [2.2.2] - 2026-10-06

Editor keyboard shortcuts, and a Save location row that tells you where your
notes actually are. No data format changed.

### Added

- **Align left / centre / right** — `Ctrl+L`, `Ctrl+E`, `Ctrl+R`
- **Strikethrough** — `Ctrl+Alt+S`, which has no native browser binding
- **Indent and outdent** — `Tab` and `Shift+Tab` inside a list. Outside a list
  `Tab` still moves focus out of the note, as it always did.
- **Automatic lists** — type `1. ` or `- ` at the start of a block to turn it
  into a numbered or bulleted list. Typing the marker inside an existing list
  does not nest a new one.
- **Open the save folder** — a button that reveals where notes are stored,
  separate from the control that changes it.

Bold, italic and underline were already handled by the browser's own shortcuts
and are unchanged.

### Changed

- **Clear all notes** now uses a trash can instead of an X.
- **The three header controls are the same size.** Search was 34px against the
  new-note button's 30px, with a different corner radius, so the glyphs did not
  read as a set. All three are 30px with an 8px radius, and the expanded search
  field matches.

### Fixed

- **Settings showed the settings icon as a brightness glyph.** It was a bare
  ring plus eight short radial strokes, which at 16px is indistinguishable from a
  sun icon. It is now a toothed cog outline with a centre bore.
- **Save location read "Unknown location".** The settings panel painted once
  before the configuration arrived, wrote the placeholder, and nothing repainted
  it afterwards.
- **Save location read "Loading…" forever after changing it.** The read and write
  config handlers returned different shapes, and the renderer merges whatever it
  receives over its own config — so a response with no path in it erased the path
  it already had. Both handlers now return the same shape.
- **Save location showed "notes.json".** The path is the notes file, so taking
  its last segment gave the filename rather than the folder. It now shows the
  directory, clipping from the left so the folder name stays visible on a long
  path.

## [2.2.1] - 2026-10-06

The dock goes back to the classic coloured-note look, and a tile can now be
dragged out of the dock to open. The note data format is unchanged, so upgrading
preserves existing notes and settings.

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

## [2.1.0] - 2026-10-05

The dock gains a choice of appearances, a settings panel, and right-edge
docking. The note design itself is unchanged from 2.0.0, so no data format
moved and upgrading preserves existing notes and settings.

### Added

- **Three dock appearances**, selectable in Settings:
  - `clear` — no panel; coloured note tiles that expand on hover (default)
  - `glass` — the 2.0.0 near-opaque panel behind glass cards
  - `bare` — the same glass cards with no panel behind them
- **Settings panel**, opened from the dock menu:
  - **Dock side** — left or right edge
  - **Dock background** — clear, glass or bare
  - **Auto-hide** — tuck the dock away when you leave it
  - **Dock width** — compact (268px) or roomy (320px)
  - **Launch Tabbin on Startup** — registers with Windows on change, and is
    reconciled against the real registration on launch so an entry removed in
    Task Manager does not leave a stale "on" in the UI
  - **Save location** — shows the folder notes are written to, with a folder
    picker; changing it migrates existing notes
  - **Clear all notes** — deletes every note after confirmation
- **Right-edge docking.** Notes grow leftward away from the screen edge, the
  colour spine swaps to the trailing side, and the top bar and note count align
  to the right edge.
- **Overflow menu** in the top bar holding Settings, Hide dock and Exit.

### Changed

- **The dock is content-sized and vertically centred** instead of filling the
  screen edge to edge. It shows six clear tiles or four glass/bare cards and
  scrolls beyond that; the two counts are chosen so the dock stays within about
  3px of the same height when switching modes.
- **The top bar is three glyphs**: a search toggle, add, and the menu. Search is
  opt-in and expands in place with the magnifier inside the field; clicking the
  glyph again or pressing Escape closes it. `Ctrl K` still opens it.
- **Clear tiles are shorter** — 62px to 52px collapsed, 104px to 88px expanded,
  with the gap between tiles reduced from 10px to 6px.
- **Send feedback and the version number moved** from the dock footer into the
  settings footer, leaving the note count alone at the bottom.
- **Dock scrollbar hidden.** The column still scrolls by wheel and keyboard.
- **Dock width default 320px to 268px** (compact).
- The hide arrow flips to point at the edge the dock tucks into.

### Fixed

- **The search toggle was invisible in Clear and Bare mode.** It had no
  mode-specific rule, so it kept a 6%-white chip with a near-white glyph while
  the add and menu buttons beside it were given dark chips. On a pale desktop
  the magnifier could not be seen at all.
- **The header buttons vanished on hover in Clear and Bare.** The hover state
  added a white overlay to the dark chip, which washed it toward white on a
  light desktop — and took the white glyph with it, so the control you were
  pointing at was the one thing you could not see. Hover now raises the chip's
  own opacity instead.
- **Excessive shadow in the transparent modes.** Clear-mode tiles cast
  `0 6px 18px rgba(0,0,0,0.28)` at rest and more on hover, the overflow menu
  cast `0 18px 44px rgba(0,0,0,0.5)`, the settings view used
  `0 28px 70px rgba(0,0,0,0.45)`, and the footer text was shadowed at 0.5
  alpha. Against a light desktop this read as haze around the whole dock.
  Resting tiles are now flat colour with the lift applied on hover, and the
  menu carries no shadow at all.
- **Settings rendered horizontally, off both edges of the panel.** Four rows
  were missing a closing `</div>`, so each nested inside the previous one, and
  because a row is a flex container they laid out side by side.
- **The dock stayed full height regardless of note count.** The renderer
  measured its note list before the configuration and notes had loaded, so the
  window was sized for an empty list and the small value was cached; nothing
  re-ran the layout afterwards.
- **Right-edge docking looked identical to left-edge.** The `right` class was
  toggled onto the dock from the start but no CSS rule referenced it, so the
  mirror simply did not exist.
- **A dropped brace could silently blank the whole dock.** A missing `}` in the
  renderer is a parse error that renders nothing and throws nothing. The test
  suite now parses the renderer and checks stylesheet and markup balance.

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

[2.2.2]: https://github.com/Vanz15/tabbin/releases/tag/v2.2.2
[2.2.1]: https://github.com/Vanz15/tabbin/releases/tag/v2.2.1
[2.1.0]: https://github.com/Vanz15/tabbin/releases/tag/v2.1.0
[2.0.0]: https://github.com/Vanz15/tabbin/releases/tag/v2.0.0
[1.0.1]: https://github.com/Vanz15/tabbin/releases/tag/v1.0.1
[1.0.0-beta.2]: https://github.com/Vanz15/tabbin/releases/tag/v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/Vanz15/tabbin/releases/tag/v1.0.0-beta.1