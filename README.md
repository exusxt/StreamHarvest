# StreamHarvest

StreamHarvest is a fast, easy-to-use desktop app for downloading videos from most popular streaming and video-hosting sites. Built with Electron and powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) under the hood, it offers a polished graphical interface — just paste a link (or copy one), pick your quality, and download.

## Features

- 🎥 Supports most major video/streaming platforms (via yt-dlp)
- 🖥️ Clean, cross-platform desktop GUI (Windows, macOS, Linux)
- ⚡ Fast, concurrent downloads with a reorderable queue (1–8 at a time)
- 📁 Format & quality presets (MP4, best audio-only → MP3, custom containers via ffmpeg remux)
- 📋 Clipboard monitoring: copy a link, get prompted to download it
- 🖱️ Drag-and-drop URLs straight into the window
- 📃 Batch downloads via pasted lists or `.txt` import
- 📺 Playlist & channel support with per-video selection
- 🎬 Subtitles (download + embed), metadata & thumbnail embedding, auto-remux
- 🗂️ Auto-organized output folders (flat / by site / by date / by playlist)
- 🎨 14 themes, including the photo-background Gallery Glass family
- 🌍 Multi-language UI — English and German (more planned)
- ⌨️ Global hotkey (Ctrl+Shift+D / ⌘⇧D) to summon the app from anywhere
- 🗑️ System tray mode, desktop notifications, first-run onboarding tutorial
- 🛠️ Advanced mode: raw yt-dlp argument passthrough, download speed limit, proxy
- 🔄 Self-contained engine management: yt-dlp and ffmpeg are bundled/downloaded and updated in-app

## Screenshots

*(Add a screenshot or GIF of the app here once available)*

## Requirements

StreamHarvest manages its own copy of [yt-dlp](https://github.com/yt-dlp/yt-dlp) (and downloads ffmpeg when merging or converting formats is needed), so prebuilt releases work out of the box. Building from source only requires Node.js.

## Installation

### Download prebuilt release

Download the latest release for your platform from the [Releases](https://github.com/exusxt/StreamHarvest/releases) page:

- **Windows**: `StreamHarvest-Setup-<version>.exe` (installer) or `StreamHarvest-<version>-x64.exe` / `-arm64.exe` (portable, no install)
- **macOS**: `StreamHarvest-<version>.dmg` or `.zip` (x64 and arm64)
- **Linux**: `StreamHarvest-<version>.AppImage` plus `.deb`, `.rpm` and `.pacman` packages

### Build from source

```bash
git clone https://github.com/exusxt/StreamHarvest.git
cd StreamHarvest
npm install
npm start
```

## Usage

1. Open StreamHarvest.
2. Paste a video URL into the input field — or just copy a link to your clipboard and StreamHarvest will offer to fetch it.
3. For playlists/channels, tick the videos you want.
4. Choose your desired quality/format and click **Download**.
5. Find your file in the downloads folder (default: `~/Downloads/StreamHarvest`), organized per your chosen layout.

### Keyboard shortcut

The global hotkey **Ctrl+Shift+D** (Windows/Linux) or **⌘⇧D** (macOS) opens the app from anywhere and instantly checks your clipboard for a link. It can be turned off in Settings → Network & hotkeys.

### Batch downloads

Paste multiple URLs (one per line) or import a `.txt` file of links to queue several downloads at once.

### Settings

Available in the app's Settings panel:

- Download location & output folder layout
- Default format/quality, audio-only mode, container (remux)
- Concurrent download limit (1–8)
- Subtitles (languages, embed)
- Clipboard monitoring, global hotkey, minimize-to-tray, desktop notifications
- Theme (14 themes, with live preview grid)
- Language (English / Deutsch)
- Engine: install/update/remove yt-dlp and ffmpeg
- Advanced: raw yt-dlp arguments, download speed limit, proxy

## Building & Packaging

StreamHarvest uses [electron-builder](https://www.electron.build/) for packaging.

```bash
npm run build        # build the app
npm run typecheck    # typecheck main + renderer
npm run dist:win     # create Windows installers (also portable)
npm run dist:mac     # create macOS app + dmg
npm run dist:linux   # create AppImage/deb/rpm/pacman
npm run release      # tag + publish a release (CI builds all platforms)
```

## Supported Sites

Site support is provided entirely by [yt-dlp](https://github.com/yt-dlp/yt-dlp), which supports a very large number of sites out of the box. See yt-dlp's [supported sites list](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) for details. StreamHarvest does not maintain its own site extractors — if a site isn't working, it's likely a yt-dlp issue or an outdated yt-dlp version bundled with the app.

## Updating yt-dlp

Since site support depends on yt-dlp, keeping it up to date matters. Use the app's Settings → Engine panel to check for and install the latest yt-dlp (and ffmpeg) updates at any time.

## Disclaimer

StreamHarvest is intended for personal and educational use only. Downloading content may be subject to the terms of service of the site you're downloading from, as well as copyright law in your jurisdiction. Users are responsible for ensuring their use complies with applicable laws and terms of service.

## Credits

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — the download engine powering StreamHarvest
- [Electron](https://www.electronjs.org/) — desktop app framework

## License

[MIT](LICENSE)
