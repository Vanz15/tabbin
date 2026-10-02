## Tabbin v1.0.1 — Auto-update Fixes

A maintenance release that makes auto-update actually work. If you installed
**Tabbin-Setup.exe** for v1.0.0 or earlier, you should receive this update
automatically. If you are still on v1.0.0, nothing has been notifying you — see
"Upgrading" below.

### Fixed

- **You were never told about updates.** The updater was wired up in the main
  process, but no window was listening for its events, and downloading was
  disabled. An available update was found and then silently thrown away.
  Updates now download in the background and install the next time you quit
  Tabbin.
- **Updates found while Tabbin was starting were lost.** The updater now keeps a
  state snapshot that the dock both listens for and reads on load.
- **The download progress bar could disappear mid-download** if a check happened
  to run between "update found" and "download finished".
- **`Tabbin-Portable.exe` no longer tries to update itself.** A portable build
  runs from a temporary folder and cannot be updated in place, so instead of
  failing confusingly it now shows a one-time note pointing you at the installer.
- **Pre-release builds can no longer overwrite the stable update feed.** The
  update channel is now declared explicitly rather than relied upon by default.

### Added

- A status row in the dock: update available, download progress, "Restart to
  update", and a retry option if a check fails.
- Update checks now run at launch, every 6 hours, and when your system resumes
  from sleep. Previously only once at launch.
- `update.log` in Tabbin's application data folder. Packaged Windows builds
  discard the updater's console output, which made diagnosing update problems
  impossible.

### Upgrading

If you are on v1.0.0, v1.0.0 could not notify you of this release. Download
`Tabbin-Setup.exe` from the releases page and install it over your existing copy —
your notes and settings are preserved.

### Notes

- Auto-update applies to the installed (`Tabbin-Setup.exe`) build only. The
  portable executable has no way to replace itself.
- Tabbin is not code signed, so Windows SmartScreen may warn you when installing
  or downloading an update. Signing is planned for a future release.

### Download Links

- [Tabbin-Setup.exe](https://github.com/Vanz15/tabbin/releases/download/v1.0.1/Tabbin-Setup.exe) — installed build, receives updates
- [Tabbin-Portable.exe](https://github.com/Vanz15/tabbin/releases/download/v1.0.1/Tabbin-Portable.exe) — no install, no auto-update

### Checksums

- `Tabbin-Setup.exe`: `672d4a4600d431378d208c26e6043dc2c84f5c7340421f263c4132a24cc32bd8`
- `Tabbin-Portable.exe`: `e1a502f4cd12e8116d051670750ffdff8497b38aedd516148383ec2cf13a290a`
