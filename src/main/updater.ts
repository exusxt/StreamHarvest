// Update handling for the main process. Wires electron-updater (which reads the
// latest.yml / latest-mac.yml / latest-linux.yml metadata that electron-builder
// publishes next to the app's GitHub releases) and exposes the manual
// check/install IPC handlers. Portable Windows builds cannot use electron-
// updater, so they self-update by downloading the newer portable exe and
// swapping it into place via a detached batch script.

import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { downloadToFile } from './ytdlp'
import { getAppLatestRelease, type ReleaseAsset } from './releases'
import type { UpdateState } from '../shared/types'

let win: BrowserWindow | null = null
let busy = false

// electron-builder's portable wrapper sets these env vars; electron-updater has no
// portable support and would otherwise run the NSIS installer instead of updating.
const isPortable = process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE != null

interface PendingUpdate {
  version: string
  asset: ReleaseAsset
  downloadedPath: string | null
}

let pending: PendingUpdate | null = null

function send(state: UpdateState): void {
  if (win && !win.isDestroyed()) win.webContents.send('update:event', state)
}

// Plain numeric comparison (no semver dependency): pad the shorter segment list
// with zeros so "1.10" beats "1.9". autoUpdater does its own comparison, but
// the portable path checks versions from GitHub release tags here.
function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split('.').map((x) => parseInt(x, 10))
  const b = current.split('.').map((x) => parseInt(x, 10))
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av > bv) return true
    if (av < bv) return false
  }
  return false
}

// Portable update check. Uses the web-based release lookup (no API rate limit)
// since electron-updater has no portable support. A newer version triggers the
// download immediately; the renderer drives the actual install via installUpdate.
async function portableCheck(): Promise<void> {
  try {
    const info = await getAppLatestRelease()
    if (!isNewerVersion(info.version, app.getVersion())) {
      send({ state: 'not-available' })
      return
    }
    const asset = info.assets[0]
    if (!asset) {
      send({ state: 'error', message: 'No portable build available for this platform' })
      return
    }
    pending = { version: info.version, asset, downloadedPath: null }
    send({ state: 'available', version: info.version })
    await portableDownload()
  } catch (e) {
    send({ state: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

async function portableDownload(): Promise<void> {
  const p = pending
  if (!p) return
  try {
    // The new exe is downloaded to the temp dir; it replaces the running binary
    // only when the user confirms the install (portableReplace).
    const dest = join(app.getPath('temp'), `streamharvest-update-${p.version}.exe`)
    send({ state: 'downloading', percent: 0 })
    await downloadToFile(p.asset.browser_download_url, dest, {
      headers: { 'User-Agent': 'streamharvest' },
      onProgress: (prog) =>
        send({
          state: 'downloading',
          percent: prog.total > 0 ? Math.round((prog.received / prog.total) * 100) : 0
        })
    })
    p.downloadedPath = dest
    send({ state: 'downloaded', version: p.version })
  } catch (e) {
    send({ state: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

function portableReplace(): void {
  const p = pending
  const exe = process.env.PORTABLE_EXECUTABLE_FILE
  if (!p?.downloadedPath || !exe) return
  const src = p.downloadedPath
  const dst = exe
  // The downloaded portable exe cannot overwrite the running one directly (it is
  // locked). Run a small detached batch file that waits for the app to exit and
  // then swaps the files and relaunches. A .bat is used instead of PowerShell to
  // keep the heuristic surface of the packaged binary smaller.
  //
  // The script itself is ASCII-only; paths are passed as environment variables.
  // cmd.exe re-reads .bat files through its OEM codepage, so any non-ASCII
  // characters embedded literally in the file (user profile, folder names) would
  // be garbled and the move would silently fail. Environment variables carry the
  // paths as Unicode and survive intact.
  const tempDir = app.getPath('temp')
  const batPath = join(tempDir, 'streamharvest-portable-update.bat')
  const logPath = join(tempDir, 'streamharvest-portable-update.log')
  const script = [
    '@echo off',
    'setlocal EnableExtensions',
    '>  "%SH_LOG%" echo [%date% %time%] portable update start',
    '>> "%SH_LOG%" echo src=%SH_SRC%',
    '>> "%SH_LOG%" echo dst=%SH_DST%',
    '>> "%SH_LOG%" echo waiting for app pid %SH_PID% to exit',
    ':waitpid',
    'tasklist /fi "PID eq %SH_PID%" | findstr /c:"%SH_PID%" >nul',
    'if errorlevel 1 goto trymove',
    'ping -n 2 127.0.0.1 >nul',
    'goto waitpid',
    ':trymove',
    'set n=0',
    ':loop',
    'set /a n+=1',
    'move /y "%SH_SRC%" "%SH_DST%" >nul 2>&1',
    'if not errorlevel 1 goto replaced',
    'if %n% gtr 60 goto giveup',
    '>> "%SH_LOG%" echo [%date% %time%] attempt %n% failed',
    'ping -n 2 127.0.0.1 >nul',
    'goto loop',
    ':replaced',
    '>> "%SH_LOG%" echo [%date% %time%] replaced ok, relaunching',
    'start "" "%SH_DST%"',
    'goto end',
    ':giveup',
    '>> "%SH_LOG%" echo [%date% %time%] GIVE UP after %n% tries, relaunching existing build',
    'start "" "%SH_DST%"',
    ':end',
    'exit /b 0'
  ].join('\r\n')
  try {
    writeFileSync(batPath, script, 'ascii')
  } catch {
    return
  }
  const child = spawn(
    'cmd.exe',
    ['/c', `"${batPath}"`],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        SH_SRC: src,
        SH_DST: dst,
        SH_LOG: logPath,
        SH_PID: String(process.pid)
      }
    }
  )
  child.unref()
  app.exit(0)
}

// Maps "no published versions"/"no releases" to a clean 'not-available' state
// so a brand-new repo with nothing published does not surface as an error.
function updaterErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/no published versions|no releases/i.test(message)) {
    return 'not-available'
  }
  return message
}

/**
 * Wires the update pipeline for a window: configures electron-updater and
 * forwards every update event to the renderer over the 'update:event' channel.
 * electron-updater reads the latest.yml metadata files that electron-builder
 * uploads as assets of each GitHub release.
 */
export function initUpdater(w: BrowserWindow): void {
  win = w

  // Auto-download on check, but never auto-install: the user picks when to
  // quit and apply the update.
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // On Linux .deb the updater installs synchronously while the app is still
  // running, then auto-relaunches — the overlapping old+new instances make
  // GNOME report "application was not closed properly" after an update. Quit
  // cleanly instead and let the user relaunch from the launcher.
  autoUpdater.autoRunAppAfterInstall = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    busy = true
    send({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    send({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    busy = false
    send({ state: 'not-available' })
  })
  autoUpdater.on('download-progress', (p) => {
    send({ state: 'downloading', percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    busy = false
    send({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    busy = false
    const message = updaterErrorMessage(err)
    if (message === 'not-available') {
      send({ state: 'not-available' })
    } else {
      send({ state: 'error', message })
    }
  })
}

/**
 * Manual check for updates (renderer IPC entry point). Guarded by a busy flag
 * so overlapping check triggers are ignored, and disabled entirely in dev
 * (unpackaged) runs where there is no update feed. Portable builds route
 * through portableCheck; everything else goes through autoUpdater.
 */
export function checkForUpdates(): void {
  if (busy) return
  if (!app.isPackaged) {
    send({ state: 'not-available' })
    return
  }
  busy = true
  if (isPortable) {
    void portableCheck().finally(() => {
      busy = false
    })
  } else {
    void autoUpdater.checkForUpdates().catch((e: unknown) => {
      busy = false
      const message = updaterErrorMessage(e)
      if (message === 'not-available') {
        send({ state: 'not-available' })
      } else {
        send({ state: 'error', message })
      }
    })
  }
}

/** Applies a downloaded update: portableReplace for portable builds, otherwise quitAndInstall. */
export function installUpdate(): void {
  if (!app.isPackaged) return
  if (isPortable) {
    portableReplace()
  } else {
    autoUpdater.quitAndInstall()
  }
}
