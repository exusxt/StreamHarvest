// Electron main-process entry point: app lifecycle, the frameless window and
// the IPC surface that drives the yt-dlp download engine.

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { dirname, join } from 'node:path'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { AppStatus, FfmpegCheckResult, YtDlpCheckResult } from '../shared/types'
import { DownloadManager } from './downloads'
import { ClipboardMonitor } from './clipboard'
import { TrayController } from './tray'
import { checkFfmpegUpdate, downloadFfmpeg, ffmpegPath, ffmpegStatus, removeFfmpeg } from './ffmpeg'
import { getSettings, loadSettings, setSettings } from './settings'
import { downloadYtDlp, latestReleaseTag, ytDlpPath, ytDlpStatus, ytDlpVersion } from './ytdlp'
import { checkForUpdates, initUpdater, installUpdate } from './updater'

let mainWindow: BrowserWindow | null = null
let manager: DownloadManager | null = null
let clipboardMonitor: ClipboardMonitor | null = null
let trayController: TrayController | null = null
let quitting = false

function registerIpc(): void {
  // App basics.
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:reveal', (_e, path: string) => {
    if (!path) return
    const real = resolveOnDisk(path, getSettings().downloadsDir)
    if (real) {
      void shell.showItemInFolder(real)
    } else {
      try {
        void shell.openPath(dirname(path))
      } catch {
        // best-effort
      }
    }
  })
  ipcMain.handle('app:openDownloadsFolder', async () => {
    const dir = getSettings().downloadsDir
    try {
      await shell.openPath(dir)
    } catch {
      // best-effort
    }
  })

  // Combined engine + settings status for the renderer shell.
  ipcMain.handle('dl:getStatus', async (): Promise<AppStatus> => {
    const [yd, ffmpeg] = await Promise.all([ytDlpStatus(), ffmpegStatus()])
    return {
      ytDlp: yd,
      ffmpeg,
      downloadsDir: getSettings().downloadsDir,
      pythonStatus: null,
      platform: process.platform
    }
  })

  // Download flow.
  ipcMain.handle('dl:fetchMetadata', (_e, url: string) => {
    const u = String(url ?? '')
    clipboardMonitor?.consume(u)
    return manager?.fetchMetadata(u)
  })
  ipcMain.handle('dl:start', (_e, params) => {
    clipboardMonitor?.consume(String((params as { url?: string } | undefined)?.url ?? ''))
    return manager?.start(params ?? {})
  })
  ipcMain.handle('dl:pause', (_e, id: string) => manager?.pause(String(id)))
  ipcMain.handle('dl:resume', (_e, id: string) => manager?.resume(String(id)))
  ipcMain.handle('dl:cancel', (_e, id: string) => manager?.cancel(String(id)))
  ipcMain.handle('dl:list', () => manager?.list() ?? [])
  ipcMain.handle('dl:clearHistory', () => manager?.clearHistory())
  ipcMain.handle('dl:move', (_e, id: string, direction: -1 | 1) => manager?.move(String(id), direction === -1 ? -1 : 1) ?? [])
  ipcMain.handle('dl:addUrls', (_e, urls: string[]) => {
    const clean = Array.isArray(urls) ? (urls as unknown[]).filter((u): u is string => typeof u === 'string' && !!u.trim()) : []
    const preset = getSettings().audioOnly ? 'audio-mp3' : getSettings().defaultFormat
    return manager?.startMany(clean, preset) ?? []
  })
  ipcMain.handle('dl:chooseUrlFile', async (): Promise<string[]> => {
    const options: Electron.OpenDialogOptions = {
      title: 'Import URLs from text file',
      properties: ['openFile'],
      filters: [{ name: 'Text files', extensions: ['txt', 'text'] }]
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return []
    try {
      const content = await readFile(result.filePaths[0], 'utf-8')
      return extractUrls(content)
    } catch {
      return []
    }
  })

  // Clipboard monitoring.
  ipcMain.handle('clipboard:consume', (_e, url: string) => clipboardMonitor?.consume(String(url ?? '')))

  // Settings.
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', async (_e, patch) => {
    const next = await setSettings(patch ?? {})
    trayController?.sync()
    return next
  })
  ipcMain.handle('settings:chooseDownloadsDir', async (): Promise<string | null> => {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose download folder',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // yt-dlp binary management. Install/update stream progress + status to the
  // renderer and refresh the status snapshot when done.
  ipcMain.handle('ytdlp:install', async () => {
    const send = (channel: string, payload: unknown): void => {
      mainWindow?.webContents.send(channel, payload)
    }
    try {
      const bin = await downloadYtDlp(
        (p) => send('ytdlp:progress', p),
        (msg) => send('dl:ytdlpStatus', { present: false, version: null, busy: true, message: msg })
      )
      const version = await ytDlpVersion(bin)
      send('dl:ytdlpStatus', { present: true, version, busy: false, message: null })
      return { ok: true, message: version ? `yt-dlp ${version} installed` : 'yt-dlp installed', version }
    } catch (e) {
      send('dl:ytdlpStatus', { present: ytDlpPath() !== null, version: null, busy: false, message: e instanceof Error ? e.message : String(e) })
      return { ok: false, message: e instanceof Error ? e.message : String(e), version: null }
    }
  })

  ipcMain.handle('ytdlp:update', async () => {
    const send = (channel: string, payload: unknown): void => {
      mainWindow?.webContents.send(channel, payload)
    }
    try {
      const bin = await downloadYtDlp(
        (p) => send('ytdlp:progress', p),
        (msg) => send('dl:ytdlpStatus', { present: ytDlpPath() !== null, version: null, busy: true, message: msg })
      )
      const version = await ytDlpVersion(bin)
      send('dl:ytdlpStatus', { present: true, version, busy: false, message: null })
      return { ok: true, message: version ? `yt-dlp updated to ${version}` : 'yt-dlp updated', version }
    } catch (e) {
      send('dl:ytdlpStatus', { present: ytDlpPath() !== null, version: null, busy: false, message: e instanceof Error ? e.message : String(e) })
      return { ok: false, message: e instanceof Error ? e.message : String(e), version: null }
    }
  })

  ipcMain.handle('ytdlp:checkUpdate', async (): Promise<YtDlpCheckResult> => {
    const bin = ytDlpPath()
    if (!bin) return { current: null, latest: null, upToDate: false, error: 'yt-dlp is not installed.' }
    const [current, latest] = await Promise.all([ytDlpVersion(bin), latestReleaseTag()])
    if (!latest) return { current, latest: null, upToDate: false, error: 'Could not reach the GitHub release feed.' }
    const normalized = latest.replace(/^v/, '')
    const upToDate = current === normalized || !versionLess(current, normalized)
    return { current, latest: normalized, upToDate, error: null }
  })

  // ffmpeg binary management (managed copy under userData\ffmpeg). Streaming
  // events use ffmpeg:progress and dl:ffmpegStatus, mirroring the yt-dlp flow.
  const sendFfmpegOp = (channel: string, payload: unknown): void => {
    mainWindow?.webContents.send(channel, payload)
  }

  const runFfmpegInstall = async (): Promise<{ ok: boolean; message: string; version: string | null }> => {
    try {
      await downloadFfmpeg(
        (p) => sendFfmpegOp('ffmpeg:progress', p),
        (msg) => sendFfmpegOp('dl:ffmpegStatus', { present: false, version: null, source: null, busy: true, message: msg })
      )
      const status = await ffmpegStatus()
      sendFfmpegOp('dl:ffmpegStatus', { ...status, busy: false, message: null })
      return { ok: true, message: status.version ? `ffmpeg ${status.version} installed` : 'ffmpeg installed', version: status.version }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendFfmpegOp('dl:ffmpegStatus', { present: ffmpegPath() !== null, version: null, source: null, busy: false, message: msg })
      return { ok: false, message: msg, version: null }
    }
  }

  ipcMain.handle('ffmpeg:install', async () => runFfmpegInstall())

  ipcMain.handle('ffmpeg:update', async () => {
    const res = await runFfmpegInstall()
    return res.ok ? { ...res, message: `ffmpeg updated to ${res.version ?? ''}`.trim() } : res
  })

  ipcMain.handle('ffmpeg:remove', async (): Promise<{ ok: boolean; message: string; version: string | null }> => {
    try {
      await removeFfmpeg()
      const status = await ffmpegStatus()
      sendFfmpegOp('dl:ffmpegStatus', { ...status, busy: false, message: null })
      return { ok: true, message: status.present ? 'Removed managed ffmpeg (using system ffmpeg).' : 'Removed managed ffmpeg.', version: status.version }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: msg, version: null }
    }
  })

  ipcMain.handle('ffmpeg:checkUpdate', async (): Promise<FfmpegCheckResult> => checkFfmpegUpdate())

  // App auto-updates (electron-updater for installers, portable self-update).
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:install', () => installUpdate())

  // Frameless-window controls.
  ipcMain.handle('win:minimize', () => mainWindow?.minimize())
  ipcMain.handle('win:toggleMaximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('win:isMaximized', () => mainWindow?.isMaximized() ?? false)
  ipcMain.handle('win:close', () => mainWindow?.close())
}

/** Absolute path of the app window icon (icon.ico on Windows, icon.png elsewhere). */
function windowIconPath(): string {
  const name = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return join(app.getAppPath(), 'resources', name)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    title: 'StreamHarvest',
    icon: windowIconPath(),
    backgroundColor: '#0b1020',
    frame: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('maximize', () => mainWindow?.webContents.send('win:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('win:maximized', false))

  // Tray mode: hide to the tray instead of closing, so downloads keep running.
  mainWindow.on('close', (e) => {
    if (getSettings().minimizeToTray && !quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('minimize', () => {
    if (getSettings().minimizeToTray && !quitting) {
      mainWindow?.restore()
      mainWindow?.hide()
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Windows taskbar groups windows by AppUserModelId; setting it explicitly
  // also fixes the "black icon in taskbar" issue with packaged apps.
  if (process.platform === 'win32') app.setAppUserModelId('com.streamharvest.app')
  await loadSettings()
  manager = new DownloadManager(getSettings, (job) => {
    mainWindow?.webContents.send('dl:job', job)
  })
  clipboardMonitor = new ClipboardMonitor(getSettings, (url) => {
    mainWindow?.webContents.send('clipboard:url', url)
  })
  clipboardMonitor.start()
  trayController = new TrayController(getSettings, () => mainWindow, () => {
    quitting = true
    app.quit()
  })
  trayController.sync()
  registerIpc()
  createWindow()
  initUpdater(mainWindow!)
  // Check for app updates on startup (packaged only), after the window settles.
  if (app.isPackaged) {
    setTimeout(() => checkForUpdates(), 3000)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !getSettings().minimizeToTray) app.quit()
})

/**
 * Returns an existing path for a recorded file. The recorded path may be
 * stale (yt-dlp reports a name that differs from the file it wrote, e.g.
 * Windows-invalid title characters), so fall back to scanning the downloads
 * folder for the video id embedded in the template name.
 */
function resolveOnDisk(p: string, downloadsDir: string): string | null {
  if (existsSync(p)) return p
  try {
    const id = p.match(/\[([A-Za-z0-9_-]{6,24})\](?:\.part)?\.[^.]+$/)?.[1]
    if (id && downloadsDir) {
      let best: { name: string; mtime: number } | null = null
      for (const name of readdirSync(downloadsDir)) {
        if (name.includes(`[${id}]`) && !name.endsWith('.part')) {
          const full = join(downloadsDir, name)
          const st = statSync(full)
          if (!best || st.mtimeMs > best.mtime) best = { name, mtime: st.mtimeMs }
        }
      }
      if (best) return join(downloadsDir, best.name)
    }
  } catch {
    // ignore read errors — fall through
  }
  return null
}

/** True when version a is strictly older than b (numeric segment compare). */
function versionLess(a: string | null, b: string): boolean {
  if (!a) return true
  const pa = a.split('.').map((s) => parseInt(s, 10) || 0)
  const pb = b.split('.').map((s) => parseInt(s, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

/** Pulls http(s) URLs out of free text (one or more per line). */
function extractUrls(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    for (const m of line.matchAll(/https?:\/\/[^\s<>"']+/g)) {
      const url = m[0].replace(/[)\]}>]+$/, '')
      if (!seen.has(url)) {
        seen.add(url)
        out.push(url)
      }
    }
  }
  return out
}
