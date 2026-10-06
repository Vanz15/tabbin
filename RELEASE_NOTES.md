## Tabbin v2.2.2 — keyboard shortcuts, and findable notes

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

### Notes

- Auto-update still applies to the installed build only; the portable executable
  cannot replace itself.
- Tabbin is not code signed, so Windows SmartScreen may warn you when installing
  or downloading an update.

### Download Links

- [Tabbin-Setup.exe](https://github.com/Vanz15/tabbin/releases/download/v2.2.2/Tabbin-Setup.exe) — installed build, receives updates
- [Tabbin-Portable.exe](https://github.com/Vanz15/tabbin/releases/download/v2.2.2/Tabbin-Portable.exe) — no install, no auto-update

### Checksums

<!-- Digests of the assets GitHub actually stored, not the local dist/.
     `npm run verify:feed -- --tag v2.2.2` checks these against the published
     files and fails on a mismatch. -->

- `Tabbin-Setup.exe`: `3bd4bb3b0a279691e85a55a386cfda1c878e7a7559363985d91b5dde8014d1b4`
- `Tabbin-Portable.exe`: `bdcfa8651ff00bd08b764b4f6dc2abc471fc253e24ab61a8f4aaf63b8a00a1bb`

