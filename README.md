# StreamHarvest

StreamHarvest is a fast, easy-to-use desktop app for downloading videos from most popular streaming and video-hosting sites. Built with Electron, it offers a simple graphical interface — just paste a link, choose your quality, and download.

## Features

- 🎥 Supports most major video/streaming platforms
- 🖥️ Clean, cross-platform desktop GUI (Windows, macOS, Linux)
- ⚡ Fast, concurrent downloads
- 📁 Choose format & quality (MP4, best audio-only, etc.)
- 📋 Paste-and-go: just drop in a URL
- 📃 Batch downloads via a queue
- 🧩 Extensible — add support for new sites via plugins/extractors

## Screenshots

*(Add a screenshot or GIF of the app here once available)*

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

StreamHarvest aims to support most sites out of the box. If a site isn't supported, you can open an issue or contribute an extractor — see [Contributing](#contributing).

## Contributing

Contributions are welcome! To add support for a new site, check out the `extractors/` directory for examples, then open a pull request.

```bash
git checkout -b feature/my-extractor
# make changes
npm test
git commit -m "Add extractor for X"
```

## Disclaimer

StreamHarvest is intended for personal and educational use only. Downloading content may be subject to the terms of service of the site you're downloading from, as well as copyright law in your jurisdiction. Users are responsible for ensuring their use complies with applicable laws and terms of service.

## License

[MIT](LICENSE)
