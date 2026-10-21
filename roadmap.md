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

## Phase 5 — Toward v1.0
Goal: turn StreamHarvest from a great one-off downloader into something that works for you over time.

Ships incrementally: 0.7.0 → 0.8.0 → 0.9.0 → 0.10.0 → 0.11.0 → 1.0.0.

### 0.7.0 — Follow channels & playlists (shipped)
- Subscribe to a channel/playlist URL from the app (new sidebar screen)
- Background check on a schedule + manual "Check now"
- Auto-queue newly published videos (per-subscription opt-out, saved quality preset)
- "New videos" desktop notifications when not auto-downloading

### 0.8.0 — Download scheduling
- Time-window scheduling (only download between set hours, queue outside them)
- Bandwidth schedule (per-time-of-day speed limit) — completes Phase 4's promise
- Schedule indicator in the queue UI

### 0.9.0 — Library overhaul
Replace the History/Downloads split with a single, media-centric **Library**; this also becomes the data layer the web UI (0.10.0) reuses.

- Merge the current Download history + job list into one Library view
- Media grid/list: thumbnail, title, site, duration, size, format, date added
- Search, filters (site, format, date range) and sorting
- Item actions: play/open, reveal in folder, copy source URL, re-download with the original format, delete file, remove entry
- Active downloads pinned as an "In progress" section; queue controls stay reachable
- Persistent library index (metadata, file path, thumbnail) with a one-time migration from `download-history.json`
- Storage summary (total size/count) and orphaned-file detection
- Extract a library service from the UI so the desktop and web front-ends share it

### 0.10.0 — Web interface
Optional, opt-in local web UI so the library is reachable from another window or device.

- Local web server (off by default), localhost-only with token/PIN auth
- Responsive web UI where the **Library is the landing page**; downloads/queue live in their own section
- Add URLs, start downloads, browse/search the library, open or save finished files
- Live progress and status via WebSocket/SSE
- Settings: enable web UI, port, bind address (localhost vs LAN), access token, session expiry
- Security: constant-time token checks, no path traversal, file access restricted to the downloads folder
- Optional extras: PWA manifest + a QR code in Settings to open the UI on a phone

### 0.11.0 — Language overhaul
- Add the most-spoken languages beyond English/German (final set by translation coverage): Spanish, Portuguese (Brazil), French, Italian, Russian, Chinese (Simplified), Japanese, Korean, Hindi, Arabic, Indonesian, Turkish, Polish, Dutch
- RTL layout support (Arabic)
- Locale-aware dates, numbers, file sizes and relative times
- OS-locale autodetect on first run + language picker with native names
- Translation QA: key-coverage check, placeholder validation, English fallback

### 1.0.0 — v1.0
- Polish pass across library, web UI and localization, docs & wiki updates, final smoke test
- Desktop and web front-ends stay in sync (same library data, same actions)

## Sequencing notes for Phase 5

- Follow/subscriptions gets its own persistent store (JSON under userData, mirroring the jobs-history pattern) and reuses the existing yt-dlp spawn plumbing for listing entries (`--flat-playlist --print`).
- Scheduling gates the existing queue pump rather than spawning anything new — jobs stay "queued" until the window opens, so concurrency logic doesn't change.
- The Library (0.9.0) becomes the shared data layer: desktop and web UI both read/write the same index through a service layer, so it must land before the web interface (0.10.0).
- The web server is opt-in and reuses `DownloadManager` + the library service; it must stay localhost-only by default and never expose arbitrary file paths.
- Localization (0.11.0) comes after the library and web UI so all new surfaces are translated once, not twice.

## Notes on sequencing

- Phase 1 is where the yt-dlp ↔ Electron IPC bridge gets built (spawning the process, parsing progress output, handling errors) — this plumbing pays off in every later phase, so it's worth getting right early.
- Theming isn't real design work at this point — the 14 themes are already done and ready to use, so applying them is just an implementation task like any other UI work in Phase 1.
- Clipboard monitoring and tray mode (Phase 2) are Electron-specific APIs — good candidates to prototype early since they touch OS-level permissions that can be finicky per platform.
- "Advanced mode" (raw arg passthrough) is saved for last — low effort but best kept away from power users until the core experience is solid.
