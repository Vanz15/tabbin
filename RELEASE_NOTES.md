## Tabbin v2.2.3 — your note order stops resetting

Three fixes for bugs that shipped since 2.2.1. None of them touched your notes,
and nothing needs migrating.

### Fixed

- **Your tile order no longer resets when you restart.** Dragging tiles into an
  order looked like it worked, then went back to sorted-by-recently-edited on
  the next launch. The order was being saved and then immediately re-sorted away
  on the way out. It sticks now.
- **Creating a note while another note was saving could lose one of them.**
  Every other action was already serialized through a write queue; creating a
  note was calling the file writer directly and skipping it. It is on the queue
  like the rest.
- **Dragging a tile out of the dock no longer throws an internal error.** The
  note still opened where you dropped it, but the code after that point silently
  failed, so the drag highlight could get stuck. It is fixed. Your tile order and
  note windows are unaffected.

### Removed

- **The "Release to open" drag hint.** v2.2.1's release notes said this hint
  followed your cursor while you dragged a tile. It never did, in any released
  version — the dock is its own small window, so the hint had nowhere to go. It
  has been removed rather than half-fixing it. Dragging a tile out still opens the
  note exactly where you drop it.

### Notes

- No data format change. Your existing notes, colours, and dock settings carry
  over untouched.
- Auto-update still applies to the installed build only; the portable executable
  cannot replace itself.
- Tabbin is not code signed, so Windows SmartScreen may warn you when installing
  or downloading an update.

### Download Links

- [Tabbin-Setup.exe](https://github.com/Vanz15/tabbin/releases/download/v2.2.3/Tabbin-Setup.exe) — installed build, receives updates
- [Tabbin-Portable.exe](https://github.com/Vanz15/tabbin/releases/download/v2.2.3/Tabbin-Portable.exe) — no install, no auto-update

### Checksums

<!-- FILL THESE IN BEFORE PUBLISHING — read them from GitHub's stored asset
     digests AFTER upload, never from local dist/, because `--publish` rebuilds.

       TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')
       curl -s -H "Authorization: token $TOKEN" \
         https://api.github.com/repos/Vanz15/tabbin/releases/tags/v2.2.3 \
         | python -c "import sys,json;[print(a['name'],a['digest']) for a in json.load(sys.stdin)['assets']]"

     Then: npm run verify:feed -- --tag v2.2.3
     It fails if a checksum here does not match what GitHub stored. -->

- `Tabbin-Setup.exe`: `b001ed8b0260a53798a026810ae883d9c7704943f62f85177080ae0f4620cf69`
- `Tabbin-Portable.exe`: `dd479a093b113c357ef4bf57d1889f623f0268a3c69f166e0b8b753b97430193`