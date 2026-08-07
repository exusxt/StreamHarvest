# StreamHarvest

StreamHarvest is a fast, lightweight video downloader for Node.js that supports most popular streaming and video-hosting sites. Grab videos in your preferred format and resolution, right from the command line.

## Features

- 🎥 Supports most major video/streaming platforms
- ⚡ Fast, concurrent downloads
- 📁 Choose format & quality (MP4, best audio-only, etc.)
- 🔧 Simple, dependency-light CLI
- 🧩 Extensible — add support for new sites via plugins/extractors

## Requirements

- Node.js 18+
- npm (or yarn/pnpm)

## Installation

Global install (recommended for CLI use):

```bash
npm install -g streamharvest
```

Or run without installing:

```bash
npx streamharvest <url>
```

Or clone and run locally for development:

```bash
git clone https://github.com/<your-username>/streamharvest.git
cd streamharvest
npm install
npm link
```

## Usage

Basic download:

```bash
streamharvest <video-url>
```

Choose quality:

```bash
streamharvest <video-url> --quality 1080p
```

Audio only:

```bash
streamharvest <video-url> --audio-only
```

Specify output directory/filename:

```bash
streamharvest <video-url> -o ./downloads/%(title)s.%(ext)s
```

Download a batch from a list of URLs:

```bash
streamharvest --batch urls.txt
```

### CLI options

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output path/filename template |
| `-q, --quality <res>` | Preferred video quality (e.g. `720p`, `1080p`, `best`) |
| `--audio-only` | Extract audio only |
| `--batch <file>` | Download multiple URLs from a text file |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

## Configuration

StreamHarvest can be configured via a `.streamharvestrc` file or environment variables for defaults like output directory, preferred format, and concurrency limits. See [Configuration](#) for details.

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
