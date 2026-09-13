# Changelog

All notable changes to Tabbin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.2] - YYYY-MM-DD

### Added
- (Pending updates)

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

[1.0.0-beta.2]: https://github.com/Vanz15/tabbin/releases/tag/v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/Vanz15/tabbin/releases/tag/v1.0.0-beta.1