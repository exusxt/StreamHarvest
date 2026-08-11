# Changelog

All notable changes to StreamHarvest.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.1.3] - 2026-08-11

### Added

- Automatic app updates: check on startup, toast with download progress, and one-click restart to install (electron-updater for installers, self-update for portable builds)

[Compare v0.1.2...v0.1.3](https://github.com/exusxt/StreamHarvest/compare/v0.1.2...v0.1.3)

## [v0.1.2] - 2026-08-11

### Fixed

- Black taskbar icon by shipping a proper .ico and window icon

[Compare v0.1.1...v0.1.2](https://github.com/exusxt/StreamHarvest/compare/v0.1.1...v0.1.2)

## [v0.1.1] - 2026-08-09

### Fixed

- Cross-platform engine binaries and macOS ffmpeg guidance

[Compare v0.1.0...v0.1.1](https://github.com/exusxt/StreamHarvest/compare/v0.1.0...v0.1.1)

## [v0.1.0] - 2026-08-09

### Added

- Paste a URL and fetch rich metadata (title, thumbnail, duration, available formats)
- Quality picker: six presets plus an individual-format dropdown
- Download with live progress bar, speed and ETA
- Pause, resume and cancel with `.part` cleanup
- Output folder setting with auto-create
- yt-dlp check and one-click auto-download/update
- Bundled ffmpeg management (download, update, remove) with audio-extraction presets
- Download history with re-download and reveal-in-folder actions
- Resolve the real on-disk file even when yt-dlp reports a differently-sanitized name
- Fourteen themes including the Gallery Glass family with gallery backgrounds
- Portable and installer builds

### Infra

- Initial release pipeline: CI and tag-triggered multi-platform build and publish
