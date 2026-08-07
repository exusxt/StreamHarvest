# StreamHarvest Roadmap

A phased plan for building StreamHarvest, an Electron + yt-dlp powered video downloader with a focus on design polish and usability.

## Phase 1 — MVP (core loop working)
Goal: a working, good-looking app that beats basic yt-dlp GUI wrappers on polish alone.

- Paste URL → fetch metadata (title, thumbnail, duration, available formats)
- Friendly format/quality picker (mapped to yt-dlp flags under the hood)
- Download with progress bar, speed, ETA
- Pause / resume / cancel
- Output folder setting
- yt-dlp version check + auto-download/update
- Basic download history (list of completed downloads, re-download button)
- Apply ready-made themes (14 available) to the UI

## Phase 2 — Convenience & queue
Goal: make it feel effortless for everyday use, not just a one-off tool.

- Clipboard monitoring (detect copied video URLs, prompt to add)
- Drag-and-drop URL support
- Download queue with reordering + concurrency limit
- Batch downloads via URL list / .txt import
- Desktop notifications on completion/failure
- System tray mode (minimize, keep downloading in background)
- Playlist/channel support (select which videos from a playlist to grab)
- Theme preview/gallery in settings (thumbnail per theme instead of plain dropdown)

## Phase 3 — Media quality features
Goal: differentiate on output quality, not just download speed.

- Subtitle download & embedding
- Metadata/thumbnail embedding into the video file
- Auto-convert/remux to chosen format (ffmpeg)
- Auto-categorized output folders (by site/date/playlist)

## Phase 4 — Power-user & polish
Goal: capture advanced users without scaring off casual ones.

- "Advanced mode" toggle exposing raw yt-dlp argument passthrough
- Speed limiting / bandwidth scheduling
- Proxy support
- Global hotkey to open app + paste link instantly
- Portable (no-install) build alongside installer
- Multi-language UI (German + English first)
- Onboarding/first-run tutorial for non-technical users
- Remaining themes rolled out (if staggered as later "theme pack" updates)

## Notes on sequencing

- Phase 1 is where the yt-dlp ↔ Electron IPC bridge gets built (spawning the process, parsing progress output, handling errors) — this plumbing pays off in every later phase, so it's worth getting right early.
- Theming isn't real design work at this point — the 14 themes are already done and ready to use, so applying them is just an implementation task like any other UI work in Phase 1.
- Clipboard monitoring and tray mode (Phase 2) are Electron-specific APIs — good candidates to prototype early since they touch OS-level permissions that can be finicky per platform.
- "Advanced mode" (raw arg passthrough) is saved for last — low effort but best kept away from power users until the core experience is solid.

## Open decisions

- Will all 14 themes ship at launch, or will some be staggered as later theme-pack updates?
- Do themes only restyle colors, or do any also change layout/density (compact vs comfortable view)? This affects how deep the theming system needs to go.
