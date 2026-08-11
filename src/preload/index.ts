// Preload bridge: the only script that runs in the isolated renderer context.
// It exposes a typed, promise-based window.api to the React renderer. Every
// method is a thin ipcRenderer.invoke/send wrapper over the main-process IPC.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppSettings, AppStatus, BinaryProgress, DownloadJob, FfmpegCheckResult, FfmpegOpResult, FfmpegStatus, UpdateState, VideoMetadata, YtDlpCheckResult, YtDlpOpResult, YtDlpStatus } from '../shared/types'

const api = {
  // App / engine status.
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getStatus: (): Promise<AppStatus> => ipcRenderer.invoke('dl:getStatus'),

  // Metadata + downloads.
  fetchMetadata: (url: string): Promise<VideoMetadata> => ipcRenderer.invoke('dl:fetchMetadata', url),
  startDownload: (params: { url: string; presetId: string; formatId?: string; title?: string; thumbnail?: string | null; playlist?: boolean; playlistItems?: string }): Promise<{ ok: boolean; job?: DownloadJob; error?: string }> =>
    ipcRenderer.invoke('dl:start', params),
  pauseDownload: (id: string): Promise<void> => ipcRenderer.invoke('dl:pause', id),
  resumeDownload: (id: string): Promise<void> => ipcRenderer.invoke('dl:resume', id),
  cancelDownload: (id: string): Promise<void> => ipcRenderer.invoke('dl:cancel', id),
  moveDownload: (id: string, direction: -1 | 1): Promise<DownloadJob[]> => ipcRenderer.invoke('dl:move', id, direction),
  addUrls: (urls: string[]): Promise<DownloadJob[]> => ipcRenderer.invoke('dl:addUrls', urls),
  chooseUrlFile: (): Promise<string[]> => ipcRenderer.invoke('dl:chooseUrlFile'),
  listDownloads: (): Promise<DownloadJob[]> => ipcRenderer.invoke('dl:list'),
  clearHistory: (): Promise<void> => ipcRenderer.invoke('dl:clearHistory'),
  reveal: (path: string): Promise<void> => ipcRenderer.invoke('app:reveal', path),
  openDownloadsFolder: (): Promise<void> => ipcRenderer.invoke('app:openDownloadsFolder'),

  // Clipboard monitoring.
  consumeClipboardUrl: (url: string): Promise<void> => ipcRenderer.invoke('clipboard:consume', url),

  // Settings.
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', settings),
  chooseDownloadsDir: (): Promise<string | null> => ipcRenderer.invoke('settings:chooseDownloadsDir'),

  // yt-dlp binary management.
  installYtDlp: (): Promise<YtDlpOpResult> => ipcRenderer.invoke('ytdlp:install'),
  updateYtDlp: (): Promise<YtDlpOpResult> => ipcRenderer.invoke('ytdlp:update'),
  checkYtDlpUpdate: (): Promise<YtDlpCheckResult> => ipcRenderer.invoke('ytdlp:checkUpdate'),

  // ffmpeg binary management (managed copy under userData\ffmpeg).
  installFfmpeg: (): Promise<FfmpegOpResult> => ipcRenderer.invoke('ffmpeg:install'),
  updateFfmpeg: (): Promise<FfmpegOpResult> => ipcRenderer.invoke('ffmpeg:update'),
  removeFfmpeg: (): Promise<FfmpegOpResult> => ipcRenderer.invoke('ffmpeg:remove'),
  checkFfmpegUpdate: (): Promise<FfmpegCheckResult> => ipcRenderer.invoke('ffmpeg:checkUpdate'),

  // App auto-updates.
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updates:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updates:install'),
  onUpdateEvent: (cb: (state: UpdateState) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, state: UpdateState): void => cb(state)
    ipcRenderer.on('update:event', listener)
    return () => ipcRenderer.removeListener('update:event', listener)
  },

  // Frameless-window controls.
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('win:minimize'),
  windowToggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('win:toggleMaximize'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('win:isMaximized'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('win:close'),

  // Subscriptions; all return an unsubscribe function for React effects.
  onWindowMaximized: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('win:maximized', listener)
    return () => ipcRenderer.removeListener('win:maximized', listener)
  },
  onJobUpdate: (cb: (job: DownloadJob) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, job: DownloadJob): void => cb(job)
    ipcRenderer.on('dl:job', listener)
    return () => ipcRenderer.removeListener('dl:job', listener)
  },
  onClipboardUrl: (cb: (url: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, url: string): void => cb(url)
    ipcRenderer.on('clipboard:url', listener)
    return () => ipcRenderer.removeListener('clipboard:url', listener)
  },
  onHotkeyOpen: (cb: (url: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, url: string): void => cb(url)
    ipcRenderer.on('hotkey:open', listener)
    return () => ipcRenderer.removeListener('hotkey:open', listener)
  },
  onYtDlpStatus: (cb: (status: YtDlpStatus) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, status: YtDlpStatus): void => cb(status)
    ipcRenderer.on('dl:ytdlpStatus', listener)
    return () => ipcRenderer.removeListener('dl:ytdlpStatus', listener)
  },
  onBinaryProgress: (cb: (p: BinaryProgress) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, p: BinaryProgress): void => cb(p)
    ipcRenderer.on('ytdlp:progress', listener)
    return () => ipcRenderer.removeListener('ytdlp:progress', listener)
  },
  onFfmpegStatus: (cb: (status: FfmpegStatus) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, status: FfmpegStatus): void => cb(status)
    ipcRenderer.on('dl:ffmpegStatus', listener)
    return () => ipcRenderer.removeListener('dl:ffmpegStatus', listener)
  },
  onFfmpegProgress: (cb: (p: BinaryProgress) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, p: BinaryProgress): void => cb(p)
    ipcRenderer.on('ffmpeg:progress', listener)
    return () => ipcRenderer.removeListener('ffmpeg:progress', listener)
  }
}

/** The shape of window.api; declared for the renderer in index.d.ts. */
export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
