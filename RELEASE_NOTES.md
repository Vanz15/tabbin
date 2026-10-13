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