<div align="center">

<img src="icon.png" alt="Tabbin logo" width="96" />

# Tabbin

**A lightweight hover-activated dock for your notes — always on top, never in the way.**

[Features](#features) • [Getting started](#getting-started) • [Development](#development) • [Architecture](#architecture)

</div>

## Overview

Tabbin is a hover-activated dock for quick notes that stays out of your way. It
parks on the edge of your primary display and hides itself until you reach for
it. Notes open in native-resizable windows with rich-text editing, and tabs
reorder by dragging.

> [!NOTE]
> **v1.0.1** is the current stable release. It fixes auto-update, which had
> shipped but was never surfaced to users — the updater found releases and then
> discarded them. If you installed v1.0.0 or earlier, download
> `Tabbin-Setup.exe` from the releases page and install over your existing copy;
> your notes and settings are preserved.

## Features

- **Transparent auto-hide dock** — frame-less overlay with a 12px hover hot zone that hides when you move away
- **Always on top** — stays above fullscreen and maximized windows via `setAlwaysOnTop(true, 'screen-saver')`
- **Fullscreen suppression prevention** — `setFullScreenable(false)` keeps the dock reachable in fullscreen apps
- **Colored note tabs** — six-colour palette assigned per note
- **Rich-text editing** — bold, italic, underline, strikethrough, lists, indent/outdent, alignment, and format blocks
- **Drag to reorder** — rearrange tabs by dragging them within the dock
- **Native-resizable windows** — note windows remember their size across sessions
- **Per-note pinning** — keep an individual note above other windows
- **Search** — filter notes as you type
- **Single instance** — relaunching focuses the running dock instead of starting a second copy
- **Auto-updates** — checks GitHub releases at launch, every 6 hours, and on system resume; downloads in the background and installs when you quit
- **Portable and installer builds** — NSIS installer for Windows, DMG/ZIP for macOS

## Getting started

### Download

Pre-built binaries for Windows (x64) are on the [releases page](https://github.com/Vanz15/tabbin/releases):

| Build | Use it when |
|---|---|
| **`Tabbin-Setup.exe`** | You want auto-updates. Installs with Start Menu and Desktop shortcuts. |
| **`Tabbin-Portable.exe`** | You want no installation. Cannot self-update — it runs from a temp folder and replaces nothing. |

### Using it

1. Launch the executable. A splash screen (~900ms) fades to the dock.
2. The dock sits on the **left edge** of your primary display.
3. **Hover a tab** (34px collapsed, 270px expanded) to preview its content.
4. **Click a tab** to open the full note window.
5. Move the pointer away and the dock hides after 400ms.

First run creates three notes: **Welcome to Tabbin** (instructions), **Ideas**,
and **Today** (a task list).

The dock's bottom status row reports update state — available, download
progress, restart to install, or a retry option after a failure. It stays
hidden when there is nothing to report.

## Development

### Prerequisites

Node.js 18+ and npm. Electron 32.3.3 installs itself via devDependencies.

```bash
npm install
npm start
```

### Tests

```bash
npm test
```

| Suite | Covers |
|---|---|
| `test_sticky_dock.js` | Dock behavior, reduced IPC bridge, packaging config |
| `test_v2_features.js` | Rich-text commands, drag reorder, resizing, pinning, installer config |
| `test_updater.js` | Update state machine transitions, rejected events, portable guard, renderer wiring |
| `test_release_body_checksums.js` | Release-body checksum guard across stale, malformed, truncated and CRLF cases |

These run on plain Node with no dependencies. Most assert on the *text* of
source files, which catches regressions but is not behavioral coverage. The
updater suites are the exception: `updater-state.js` is a pure module and the
checksum guard is imported directly, so both are genuinely exercised.

### Verifying a release

```bash
npm run verify:feed
```

Release-time only, and needs network access. It confirms that:

- the published `latest.yml` declares the version the tag claims
- every file it references is attached to the release
- declared sizes and SHA-512 digests match the stored artifacts
- any SHA-256 advertised in the **release body** matches GitHub's per-asset digest

> [!IMPORTANT]
> Take checksums for the release body from GitHub's asset digests *after*
> publishing, never from a local `dist/`. `electron-builder --publish always`
> rebuilds before uploading, so the bytes that reach GitHub differ from the
> ones on disk. v1.0.0, v1.0.1 and v1.0.2 all shipped stale checksums before
> this was caught.

Upload the feed **last**, and do not replace assets on a published release.

## Architecture

| File | Role |
|---|---|
| `main.js` | Main process — windows, IPC handlers, note storage, edge-hover detection, crash handlers |
| `updater.js` | Update wiring — electron-updater events, build guards, re-check cadence, file logging |
| `updater-state.js` | Pure update state machine (no Electron imports), so transitions are unit testable |
| `preload.js` | Context bridge exposing `window.tabbin`; context isolation on, `nodeIntegration` off |
| `dock.html` | Dock renderer — transparent overlay, tabs, search, update row |
| `note.html` | Note editor — contenteditable with rich-text toolbar and pin toggle |
| `loading.html` | Splash screen |
| `scripts/verify-feed.js` | Release-time feed and checksum verification |
| `icon.ico` / `icon.png` | Application icons |

### Update flow

`updater.js` owns a state machine and pushes a full snapshot to the dock on
every transition, which the dock both subscribes to and pulls on load. A
snapshot rather than an event stream, so an update found before the dock
finishes loading is not lost.

States resolve to one dock row: `available` → `downloading` → `ready`, plus
`error` (retryable) and `unsupported`. `install()` refuses to run for a portable
build or an unpackaged dev run, so a test can never replace a real install.

### IPC API

| Method | Description |
|---|---|
| `list()` / `get(id)` | Read notes, newest first |
| `create()` | Create a note and open its window |
| `update(note)` | Save title, content, color, pinning |
| `reorder(ids)` | Persist drag-and-drop order |
| `remove(id)` | Delete a note |
| `open(id)` | Open a note window |
| `hide()` / `cursorLeft()` | Hide the dock, or arm its hide timer |
| `quit()` | Quit the app |
| `config()` | Dock configuration |
| `toggleNoteAlwaysOnTop(id)` | Pin a note |
| `updateStatus()` | Current update snapshot |
| `checkForUpdates()` / `downloadUpdate()` / `installUpdate()` | Drive an update |
| `dismissUpdateNudge()` | Dismiss the portable-build notice |
| `onChanged(cb)` / `onConfigChanged(cb)` / `onUpdateState(cb)` | Subscribe to changes |

### Data storage

Stored in the Electron user data directory (`app.getPath('userData')`):

| File | Contents |
|---|---|
| `notes.json` | Notes — id, title, content, color, pinning, timestamp |
| `config.json` | Dock `edge` (left/right), `edgeHover`, note window `noteWidth`/`noteHeight` |
| `update-state.json` | Last check timestamp, portable-notice dismissal |
| `update.log` | Updater diagnostics, since packaged Windows builds discard stdout |
| `crash.log` | Uncaught exceptions and unhandled rejections |

Notes are written atomically with a backup rollback and serialized through a
write queue, so concurrent saves cannot lose data.

### Build

```bash
npm run build:win    # Windows: portable + NSIS installer
npm run build:mac    # macOS: DMG + ZIP
npm run build:all    # both
npm run build:dir    # unpacked directory, for debugging
```

Output lands in `dist/`.

> [!NOTE]
> Builds are not code signed, so Windows SmartScreen may warn on install or
> update. Signing is planned for a future release.

## Acknowledgements

- [Electron](https://www.electronjs.org/) — cross-platform desktop framework
- [electron-builder](https://www.electron.build/) — packaging and installation
- [electron-updater](https://www.electron.build/auto-update.html) — auto-updating
