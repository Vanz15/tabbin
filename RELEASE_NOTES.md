## Tabbin v2.3.1 - to-do lists and a shortcuts cheat sheet

A small release about getting things done. Notes now hold real checklists,
and every shortcut lives in one window you can open from Settings. Existing
notes carry over untouched; no data format changed.

### Added

- **To-do items.** The checklist button in the toolbar turns the current line
  into a to-do, and typing `[] ` starts one while writing. Clicking the circle
  strikes the item through and sinks it below the open ones, so the list stays
  tidy. `Enter` starts the next item, `Ctrl+Enter` checks the current one, and
  `Backspace` at the start removes the marker or deletes an empty item.
- **Keyboard-shortcuts window.** Settings → Help lists every formatting, list
  and to-do shortcut, along with `Esc`, the Windows emoji picker, and dock
  search.
- **Star the project.** Settings → Help adds a "Loving Tabbin?" row that opens
  the GitHub repository in your browser, with a yellow star.
- **Send feedback opens your browser.** The link no longer creates a second
  Electron window.

### Install

Windows-only, x64. The setup file installs Tabbin and receives updates
automatically.

1. Download **[Tabbin-Setup.exe](https://github.com/Vanz15/tabbin/releases/download/v2.3.1/Tabbin-Setup.exe)**.
2. Windows will warn you the publisher is unknown. Tabbin is not code signed, so this is expected. Click **More info**, then **Run anyway**.
3. Pick where to install it, finish the installer, and launch it.

Not wanting to install anything? [Tabbin-Portable.exe](https://github.com/Vanz15/tabbin/releases/download/v2.3.1/Tabbin-Portable.exe) runs straight from the folder, but cannot update itself.

### Notes

- No data format change. Your existing notes, colours and dock settings carry
  over untouched.
- Auto-update applies to the installed build only.
- Full notes in the [README](https://github.com/Vanz15/tabbin#install).

### Checksums

Digests of the assets GitHub actually stored, not the local build output.

- `Tabbin-Setup.exe`: `f8edd6f30de6348139153339b0ff72413108d5eee1dbe39cbb23af08eb5920cb`
- `Tabbin-Portable.exe`: `2fe705e0a37f50ef4fe8512c5951a1cd9a9ff7ec686d5eb065b64b5cff734811`

## Tabbin v2.3.0 - your fonts, your sizes, ten colours, true fullscreen

A note-taking release. Notes no longer force one typeface or one text size on
you, the palette grew from six flat colours to ten pastels chosen to stay
readable, and fullscreen now behaves like a mode instead of a window resize.
Existing notes carry over: a saved `Caveat` title maps to Parisienne, and inline
formatting still renders through a legacy alias.

### Added

- **Five bundled typefaces.** Geist, Inter, Public Sans, Gelasio and Parisienne
  ship inside the app under the SIL Open Font License, so a note looks the same
  on a computer that never installed the font. Choose a body face for the
  current selection, and a separate face for the title.
- **Per-selection text sizes.** 12, 14, 16, 18, 20 and 24 px from the toolbar,
  with the title scaled to 1.5× the note's base size.
- **Ten pastel note colours.** One swatch opens a popover of all ten, and each
  one is checked for 4.5:1 contrast against the note text.
- **Fullscreen notes.** The header button fills the screen. Leave with the
  button, `Esc`, or the OS shortcut and the note returns to a normal 430×430
  window, with the highlight cleared.

### Changed

- **The script face is Parisienne.** Caveat was never actually bundled, so it
  silently fell back to another font. Titled notes saved with `Caveat` now open
  in Parisienne; text you had already styled as Caveat still renders through a
  legacy alias.

### Fixed

- **A fullscreen or screen-sized note can no longer save that size as its own.**
  The resize saver skips fullscreen, maximized and screen-sized windows, so a
  note reopened later cannot cover the display.
- **The font and size controls show the real formatting** under the caret or in
  the title, instead of a stale selection.
- **The popovers report their state to assistive technology** with
  `aria-pressed`, and Escape closes them.

### Install

Windows-only, x64. The setup file installs Tabbin and receives updates
automatically.

1. Download **[Tabbin-Setup.exe](https://github.com/Vanz15/tabbin/releases/download/v2.3.0/Tabbin-Setup.exe)**.
2. Windows will warn you the publisher is unknown. Tabbin is not code signed, so this is expected. Click **More info**, then **Run anyway**.
3. Pick where to install it, finish the installer, and launch it.

Not wanting to install anything? [Tabbin-Portable.exe](https://github.com/Vanz15/tabbin/releases/download/v2.3.0/Tabbin-Portable.exe) runs straight from the folder, but cannot update itself.

### Notes

- No data format change. Your existing notes, colours and dock settings carry
  over untouched.
- Auto-update applies to the installed build only.
- Full notes in the [README](https://github.com/Vanz15/tabbin#install).

### Checksums

Digests of the assets GitHub actually stored, not the local build output.

- `Tabbin-Setup.exe`: `fd3b04a7d5f099627fb8a2727fb794dd4abbb19ffb1345e1807758bfa6622f13`
- `Tabbin-Portable.exe`: `75718b1d04b9aa534d8cd0032d48cc8037c000e41b4212d4a7f83d54cef66977`

## Tabbin v2.2.4 - one typeface, one search box, and saves that tell you the truth

A consistency release. The dock and the note windows finally look like the same
app, the search field behaves like a search field, and the save status stopped
lying to you. No data format change, so your notes, colours and dock settings
carry over untouched.

### Fixed

- **Typing `1. ` or `- ` no longer doubles your list marker.** The browser adds
  its own marker to a list, and the text you typed was left in place as well, so
  a numbered list showed `1. 1.` and a bulleted one showed two bullets. Only the
  marker you want is there now.
- **A list marker after existing text no longer hijacks the line.** Typing
  `buy milk - ` used to turn the whole line into a bullet list. The shorthand
  now only fires at the start of a line, the way every other editor does it.
- **A failed save no longer disables every later save.** Saves are queued. One
  transient failure - an antivirus scan holding the file, a cloud sync client
  locking it, a full disk - used to poison that queue for the rest of the
  session, so every save after it silently did nothing. The queue now recovers,
  and the next edit retries on its own.
- **Saving a note that no longer exists reports failure instead of success.**
- **Deleting a note no longer leaves you with an error you cannot fix.** Delete
  and Clear all both close their windows without cancelling a pending save, so
  that save could arrive after the note was already gone. The window now stops
  trying instead of repeating a failure that retrying cannot solve.
- **Quitting waits for the save you were making.** Quit while a save was still
  writing used to discard it. Nothing is flushed on exit now.
- **Clear all notes can no longer be overwritten by a save already in flight.**
- **Unsaved text no longer looks saved.** After a failed save, the window used to
  refuse to repaint itself from the file, leaving text that looked authoritative
  but was not stored.
- **The search placeholder is left-aligned when the dock is on the right edge.**
  It was sharing an alignment rule with the status line, so `Search notes...` sat
  on the right while everything else hugged the right edge.

### Added

- **One typeface across the whole app.** The note editor and the splash screen
  were asking for Inter, which was never bundled, so they quietly fell back to a
  different font than the dock used. All three windows now render in Geist.
- **A new-note button inside the note window.** Same `+` as the dock, opening a
  second note window and leaving your current note untouched.
- **A pinned note now looks pinned.** The pin used to change its icon colour by a
  shade you could not see. It is now filled with your note's own colour, so a
  pinned note is obvious at a glance.

### Changed

- **The search magnifier and the search field are one box.** They were already
  part of the same control, but drew as two separate pills with a gap between
  them. Expanded search is now one continuous field, and the whole field reacts
  when it has focus.
- **The save status is plain text.** The green dot is gone. The status now reads
  `Saved.`, `Saving...`, or `Failed saving your note.` If the note has been
  deleted from disk while its window is still open, it says so and asks you to
  copy your text first, because that text is only in the window.

### Install

Windows-only, x64. The setup file installs Tabbin and receives updates
automatically.

1. Download **[Tabbin-Setup.exe](https://github.com/Vanz15/tabbin/releases/download/v2.2.4/Tabbin-Setup.exe)** (about 68 MB).
2. Windows will warn you the publisher is unknown. Tabbin is not code signed, so this is expected. Click **More info**, then **Run anyway**.
3. Pick where to install it, finish the installer, and launch it.

Not wanting to install anything? [Tabbin-Portable.exe](https://github.com/Vanz15/tabbin/releases/download/v2.2.4/Tabbin-Portable.exe) runs straight from the folder, but cannot update itself.

### Notes

- No data format change. Your existing notes, colours and dock settings carry over untouched.
- Auto-update applies to the installed build only.
- Full notes in the [README](https://github.com/Vanz15/tabbin#install).

### Checksums

Digests of the assets GitHub actually stored, not the local build output.

- `Tabbin-Setup.exe`: `d20425fc273517fe6b7e29a3d83f6c159c32ad008d86340b40ab5b465e06e032`
- `Tabbin-Portable.exe`: `30b1ec404e183695d82fc687e53122c5c8be141d3fd28677dcc057ef72a790aa`