// ffmpeg binary management. ffmpeg is needed by yt-dlp for merging separate
// video/audio streams and for audio conversion. We mirror the yt-dlp approach:
// download a managed copy into userData\ffmpeg so the app is self-contained,
// and point yt-dlp at it via --ffmpeg-location. Builds come from the official
// yt-dlp/FFmpeg-Builds rolling "latest" release.

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BinaryProgress, FfmpegCheckResult, FfmpegStatus } from '../shared/types'
import { downloadToFile, httpGet, runCapture } from './ytdlp'

const VERSION_FILE = 'version.txt'

/** Folder-relative name of the binary on each platform. */
export function ffmpegExeName(): string {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

/** Persistent storage folder for the managed binary. */
export function ffmpegStoreDir(): string {
  return join(app.getPath('userData'), 'ffmpeg')
}

/** Absolute path of the managed binary, regardless of existence. */
export function ffmpegManagedPath(): string {
  return join(ffmpegStoreDir(), ffmpegExeName())
}

/** Absolute path to the managed ffmpeg binary, or null when not installed. */
export function ffmpegPath(): string | null {
  const managed = ffmpegManagedPath()
  return existsSync(managed) ? managed : null
}

/** Runs `ffmpeg -version` and resolves the raw version token, or null. */
export async function ffmpegVersion(bin: string): Promise<string | null> {
  try {
    const { stdout } = await runCapture(bin, ['-version'], 8000)
    const m = stdout.match(/^ffmpeg version\s+(\S+)/m)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Shrinks a git-master version token to its build date when possible. */
export function shortFfmpegVersion(v: string): string {
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : v
}

/** The stored build date written at install time, or null. */
async function storedVersion(): Promise<string | null> {
  try {
    const content = await readFile(join(ffmpegStoreDir(), VERSION_FILE), 'utf-8')
    return content.trim() || null
  } catch {
    return null
  }
}

/** True when the given token looks like a yt-dlp build date (YYYY-MM-DD). */
function isBuildDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(v)
}

/**
 * Latest ffmpeg build info from the yt-dlp/FFmpeg-Builds release feed. The
 * release name carries the build time, e.g. "Latest Auto-Build (2026-08-09 …)".
 */
export async function latestFfmpegInfo(): Promise<{ date: string | null; name: string | null; error: string | null }> {
  try {
    const body = await httpGet('https://api.github.com/repos/yt-dlp/FFmpeg-Builds/releases/latest', { 'User-Agent': 'streamharvest' })
    const data = JSON.parse(body) as { name?: string }
    const name = data.name ?? null
    const m = name?.match(/\((\d{4}-\d{2}-\d{2})/)
    return { date: m ? m[1] : null, name, error: null }
  } catch (e) {
    return { date: null, name: null, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Download URL + local archive name for the current platform. */
function archiveTarget(): { url: string; fileName: string } {
  const platform = process.platform
  const arm = process.arch === 'arm64'
  if (platform === 'win32') {
    return {
      url: `https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win${arm ? 'arm64' : '64'}-gpl.zip`,
      fileName: `ffmpeg-win${arm ? 'arm64' : '64'}-gpl.zip`
    }
  }
  if (platform === 'linux') {
    return {
      url: `https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux${arm ? 'arm64' : '64'}-gpl.tar.xz`,
      fileName: `ffmpeg-linux${arm ? 'arm64' : '64'}-gpl.tar.xz`
    }
  }
  return { url: '', fileName: '' }
}

/**
 * Downloads and installs the latest managed ffmpeg into the persistent store.
 * onProgress streams byte counts; onStatus reports phase changes. Resolves with
 * the installed path.
 */
export async function downloadFfmpeg(onProgress: (p: BinaryProgress) => void, onStatus: (message: string) => void): Promise<string> {
  const storeDir = ffmpegStoreDir()
  const dest = ffmpegManagedPath()
  const target = archiveTarget()
  if (!target.url) {
    const msg =
      process.platform === 'darwin'
        ? 'Auto-installing ffmpeg is not available on macOS. Install it with Homebrew:\n\n  brew install ffmpeg\n\nThen check again or restart StreamHarvest.'
        : 'Auto-installing ffmpeg is not supported on this platform yet. Please install ffmpeg and add it to PATH.'
    throw new Error(msg)
  }
  await mkdir(storeDir, { recursive: true })

  onStatus('Downloading ffmpeg…')
  const archivePath = join(storeDir, target.fileName)
  await downloadToFile(target.url, `${archivePath}.part`, {
    headers: { 'User-Agent': 'streamharvest' },
    onProgress
  })
  await rename(`${archivePath}.part`, archivePath)

  onStatus('Extracting ffmpeg…')
  const extractDir = join(storeDir, '.extract')
  await rm(extractDir, { recursive: true, force: true })
  await extractArchive(archivePath, extractDir)

  onStatus('Installing ffmpeg…')
  const found = await findFile(extractDir, ffmpegExeName())
  if (!found) throw new Error('Could not locate ffmpeg inside the downloaded archive.')
  await rm(dest, { force: true })
  await rename(found, dest)
  if (process.platform !== 'win32') {
    // Make the binary executable on unix-like systems.
    try {
      const { chmod } = await import('node:fs/promises')
      await chmod(dest, 0o755)
    } catch {
      // best-effort
    }
  }
  await rm(extractDir, { recursive: true, force: true })
  await rm(archivePath, { force: true })

  const version = await ffmpegVersion(dest)
  const short = version ? shortFfmpegVersion(version) : null
  await writeFile(join(storeDir, VERSION_FILE), short ?? '', 'utf-8')
  onStatus(short ? `ffmpeg ${short} ready` : 'ffmpeg installed')
  return dest
}

/** Removes the managed binary (PATH ffmpeg, if any, keeps working). */
export async function removeFfmpeg(): Promise<void> {
  try {
    await rm(ffmpegStoreDir(), { recursive: true, force: true })
  } catch {
    // best-effort
  }
}

/** Builds an FfmpegStatus snapshot for the renderer. */
export async function ffmpegStatus(): Promise<FfmpegStatus> {
  const managed = ffmpegPath()
  if (managed) {
    const version = (await storedVersion()) ?? shortFfmpegVersion((await ffmpegVersion(managed)) ?? '')
    return { present: true, version: version || null, source: 'managed', busy: false, message: null }
  }
  const pathVersion = await ffmpegVersion(ffmpegExeName())
  if (pathVersion) {
    return { present: true, version: shortFfmpegVersion(pathVersion), source: 'path', busy: false, message: null }
  }
  return { present: false, version: null, source: null, busy: false, message: null }
}

/** Compares the installed ffmpeg against the latest released build. */
export async function checkFfmpegUpdate(): Promise<FfmpegCheckResult> {
  const managed = ffmpegPath()
  const current = managed ? (await storedVersion()) ?? null : await ffmpegVersion(ffmpegExeName())
  const currentShort = current ? shortFfmpegVersion(current) : null
  if (!currentShort) return { current: null, latest: null, upToDate: false, error: 'ffmpeg is not installed.' }
  const info = await latestFfmpegInfo()
  if (!info.date) return { current: currentShort, latest: info.name ?? null, upToDate: false, error: info.error ?? 'Could not reach the ffmpeg release feed.' }
  const upToDate = !isBuildDate(currentShort) || currentShort >= info.date
  return { current: currentShort, latest: info.date, upToDate, error: null }
}

/** Extracts a zip or tar.xz archive into destDir. */
async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true })
  const isWin = process.platform === 'win32'
  const isXz = archivePath.endsWith('.tar.xz')
  if (isWin) {
    try {
      await runCapture('tar', ['-xf', archivePath, '-C', destDir], 300000)
      return
    } catch {
      // Fall back to PowerShell's Expand-Archive (handles spaces in paths).
    }
    const quote = (p: string): string => p.replace(/'/g, "''")
    await runCapture(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${quote(archivePath)}' -DestinationPath '${quote(destDir)}' -Force`],
      600000
    )
    return
  }
  await runCapture('tar', [isXz ? '-xJf' : '-xf', archivePath, '-C', destDir], 600000)
}

/** Recursively finds a file by (case-insensitive) name inside a directory. */
async function findFile(dir: string, name: string): Promise<string | null> {
  let found: string | null = null
  const walk = async (d: string): Promise<void> => {
    if (found) return
    let entries
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (found) return
      const full = join(d, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) found = full
    }
  }
  await walk(dir)
  return found
}
