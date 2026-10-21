# Changelog

All notable changes to StreamHarvest.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.9.4] - 2026-10-21

### Added

- Collect all playlist files for embedded playback

[Compare v0.9.3...v0.9.4](https://github.com/exusxt/StreamHarvest/compare/v0.9.3...v0.9.4)

## [v0.9.3] - 2026-10-21

### Fixed

- Use registerStreamProtocol for reliable media seeking

[Compare v0.9.2...v0.9.3](https://github.com/exusxt/StreamHarvest/compare/v0.9.2...v0.9.3)

## [v0.9.2] - 2026-10-21

### Fixed

- Stream local media via net.fetch for embedded player

[Compare v0.9.1...v0.9.2](https://github.com/exusxt/StreamHarvest/compare/v0.9.1...v0.9.2)

## [v0.9.1] - 2026-10-21

### Added

- Embedded in-app video playback

[Compare v0.9.0...v0.9.1](https://github.com/exusxt/StreamHarvest/compare/v0.9.0...v0.9.1)

## [v0.9.0] - 2026-10-21

### Added

- Media library with search, filters and storage stats

[Compare v0.8.0...v0.9.0](https://github.com/exusxt/StreamHarvest/compare/v0.8.0...v0.9.0)

## [v0.8.0] - 2026-10-21

### Added

- Download scheduling with time windows and per-window speed limits

[Compare v0.7.0...v0.8.0](https://github.com/exusxt/StreamHarvest/compare/v0.7.0...v0.8.0)

## [v0.7.0] - 2026-10-15

### Added

- Follow channels and playlists with background new-video checks

### Infra

- Phase 5 roadmap and landing page follow preview
- Use a neutral example.com URL in the preview mockup

[Compare v0.6.1...v0.7.0](https://github.com/exusxt/StreamHarvest/compare/v0.6.1...v0.7.0)

## [v0.6.1] - 2026-08-24

### Fixed

- Install ffprobe with managed ffmpeg and stop passing a bogus --ffmpeg-location

[Compare v0.6.0...v0.6.1](https://github.com/exusxt/StreamHarvest/compare/v0.6.0...v0.6.1)

## [v0.6.0] - 2026-08-22

### Added

- Automatic yt-dlp background updates with engine lock and opt-out setting

### Infra

- Interactive app replica in hero — real chrome, 3 switchable screens, live theme menu

[Compare v0.5.0...v0.6.0](https://github.com/exusxt/StreamHarvest/compare/v0.5.0...v0.6.0)

## [v0.5.0] - 2026-08-22

### Added

- Playlist subfolders, protocol links, network resilience, tray & update fixes
- GitHub Pages landing page

### Infra

- Fix nav download button text color (specificity override)
- Rebuild landing page as interactive Gallery Glass site
- Restyle landing page in Gallery Glass theme

[Compare v0.4.0...v0.5.0](https://github.com/exusxt/StreamHarvest/compare/v0.4.0...v0.5.0)

## [v0.4.0] - 2026-08-11

### Added

- I18n (DE/EN), onboarding tutorial, global hotkey, settings sync

[Compare v0.3.3...v0.4.0](https://github.com/exusxt/StreamHarvest/compare/v0.3.3...v0.4.0)

## [v0.3.3] - 2026-08-11

### Added

- Phase 3 media quality (embed metadata/thumbnail, remux, subtitles, folder layouts)

[Compare v0.3.2...v0.3.3](https://github.com/exusxt/StreamHarvest/compare/v0.3.2...v0.3.3)

## [v0.3.2] - 2026-08-11

### Fixed

- Robust portable update replace (unicode-safe bat, logging, pid wait)

### Infra

- Bump setup-node to v7 (fixes punycode deprecation warning)
- Bump upload-artifact to v7 (Node 24 runtime)

[Compare v0.3.1...v0.3.2](https://github.com/exusxt/StreamHarvest/compare/v0.3.1...v0.3.2)

## [v0.3.1] - 2026-08-11

### Fixed

- Playlist selection UI and add it to the clipboard tray

[Compare v0.3.0...v0.3.1](https://github.com/exusxt/StreamHarvest/compare/v0.3.0...v0.3.1)

## [v0.3.0] - 2026-08-11

### Added

- Playlist video selection and drag-and-drop URL import

[Compare v0.2.0...v0.3.0](https://github.com/exusxt/StreamHarvest/compare/v0.2.0...v0.3.0)

## [v0.2.0] - 2026-08-11

### Added

- Clipboard link tray, system tray, notifications, queue reorder, batch import and theme gallery

[Compare v0.1.4...v0.2.0](https://github.com/exusxt/StreamHarvest/compare/v0.1.4...v0.2.0)

## [v0.1.4] - 2026-08-11

### Fixed

- Build Windows for arm64 like mac and linux, and arch-qualify installer names

[Compare v0.1.3...v0.1.4](https://github.com/exusxt/StreamHarvest/compare/v0.1.3...v0.1.4)

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
