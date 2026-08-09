# Changelog

All notable changes to StreamHarvest.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
