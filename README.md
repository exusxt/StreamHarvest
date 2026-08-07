# StreamHarvest

StreamHarvest is a fast, easy-to-use desktop app for downloading videos from most popular streaming and video-hosting sites. Built with Electron and powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) under the hood, it offers a simple graphical interface — just paste a link, choose your quality, and download.

## Features

- 🎥 Supports most major video/streaming platforms (via yt-dlp)
- 🖥️ Clean, cross-platform desktop GUI (Windows, macOS, Linux)
- ⚡ Fast, concurrent downloads
- 📁 Choose format & quality (MP4, best audio-only, etc.)
- 📋 Paste-and-go: just drop in a URL
- 📃 Batch downloads via a queue

## Screenshots

*(Add a screenshot or GIF of the app here once available)*

## Requirements

StreamHarvest bundles/relies on [yt-dlp](https://github.com/yt-dlp/yt-dlp) as its download engine. Prebuilt releases include everything you need; if building from source, make sure `yt-dlp` (and `ffmpeg` for format conversion/merging) are available.

## Installation

### Download prebuilt release

Download the latest installer for your platform from the [Releases](../../releases) page:

- **Windows**: `StreamHarvest-Setup-x.x.x.exe`
- **macOS**: `StreamHarvest-x.x.x.dmg`
- **Linux**: `StreamHarvest-x.x.x.AppImage`

### Build from source

```bash
git clone https://github.com/<your-username>/streamharvest.git
cd streamharvest
npm install
npm start
```

## Usage

1. Open StreamHarvest.
2. Paste a video URL into the input field.
3. Choose your desired quality/format from the dropdown.
4. Click **Download**.
5. Find your file in the configured downloads folder (default: `~/Downloads/StreamHarvest`).

### Batch downloads

Paste multiple URLs (one per line) or import a `.txt` file of links to queue several downloads at once.

### Settings

Available in the app's Settings panel:
- Default download location
- Preferred quality/format
- Concurrent download limit
- Audio-only mode

## Building & Packaging

StreamHarvest uses [electron-builder](https://www.electron.build/) for packaging.

```bash
npm run build       # build the app
npm run package     # create platform installers
```

## Supported Sites

Site support is provided entirely by [yt-dlp](https://github.com/yt-dlp/yt-dlp), which supports a very large number of sites out of the box. See yt-dlp's [supported sites list](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) for details. StreamHarvest does not maintain its own site extractors — if a site isn't working, it's likely a yt-dlp issue or an outdated yt-dlp version bundled with the app.

## Updating yt-dlp

Since site support depends on yt-dlp, keeping it up to date matters. StreamHarvest will (or should) periodically check for and update its bundled yt-dlp binary.

## Disclaimer

StreamHarvest is intended for personal and educational use only. Downloading content may be subject to the terms of service of the site you're downloading from, as well as copyright law in your jurisdiction. Users are responsible for ensuring their use complies with applicable laws and terms of service.

## Credits

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — the download engine powering StreamHarvest
- [Electron](https://www.electronjs.org/) — desktop app framework

## License

[MIT](LICENSE)
