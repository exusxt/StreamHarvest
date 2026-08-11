/**
 * Shared type definitions for StreamHarvest. These describe the contract
 * between the Electron renderer, the main process and the yt-dlp download
 * engine.
 */

/** StreamHarvest app status: engine presence/version and runtime paths. */
export interface AppStatus {
  ytDlp: YtDlpStatus
  ffmpeg: FfmpegStatus
  downloadsDir: string
  pythonStatus: string | null
  /** `process.platform` value ('win32' | 'darwin' | 'linux'), for UI guidance. */
  platform: string
}

/** Presence and version info for the yt-dlp engine binary. */
export interface YtDlpStatus {
  present: boolean
  /** Version string from `yt-dlp --version`, null when not installed yet. */
  version: string | null
  /** Human-readable install/update progress message while a binary op runs. */
  busy: boolean
  message: string | null
}

/** A single downloadable format offered to the user. */
export interface MediaFormat {
  id: string
  /** Human-readable label, e.g. "1080p MP4 · 1.2 GB". */
  label: string
  ext: string
  resolution: string | null
  filesize: number | null
  vcodec: string | null
  acodec: string | null
  tbr: number | null
}

/** Friendly preset quality levels mapped to yt-dlp format selectors. */
export interface QualityPreset {
  id: string
  label: string
  /** The yt-dlp -f selector. */
  selector: string
  /** Extra yt-dlp flags appended when this preset is chosen. */
  extraArgs?: string[]
}

export const QUALITY_PRESETS: QualityPreset[] = [
  { id: 'best', label: 'Best available (video + audio)', selector: 'bv*+ba/b' },
  { id: 'best-video', label: 'Best video only (no audio track)', selector: 'bv*' },
  { id: 'best-audio', label: 'Best audio only', selector: 'bestaudio' },
  { id: 'audio-mp3', label: 'Audio only (MP3 192k)', selector: 'bestaudio', extraArgs: ['--extract-audio', '--audio-format', 'mp3', '--audio-quality', '2'] },
  { id: 'audio-opus', label: 'Audio only (OPUS)', selector: 'bestaudio', extraArgs: ['--extract-audio', '--audio-format', 'opus'] }
]

/** Metadata fetched for a pasted URL, shown before downloading. */
export interface VideoMetadata {
  id: string
  title: string
  uploader: string | null
  duration: number | null
  thumbnail: string | null
  webpageUrl: string
  formats: MediaFormat[]
  /** True when the URL points to a playlist/channel with multiple entries. */
  playlist: boolean
  /** Entry count when playlist is true. */
  entryCount: number | null
  error: string | null
}

/** Status of a download job. */
export type DownloadStatus = 'queued' | 'fetching' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled'

/** One download job, active or from history. */
export interface DownloadJob {
  id: string
  url: string
  title: string
  thumbnail: string | null
  /** Friendly format label the user picked. */
  formatLabel: string
  /** The chosen quality preset id (QUALITY_PRESETS), for re-downloads. */
  presetId: string
  /** Optional specific format id (overrides the preset), for re-downloads. */
  formatId?: string
  /** Whether the source URL is a playlist/channel. */
  playlist: boolean
  status: DownloadStatus
  /** 0-100 progress while downloading. */
  progress: number
  speed: string
  eta: string
  bytesReceived: number
  bytesTotal: number
  /** Absolute path of the finished file. */
  filePath: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

/** User-adjustable app settings, persisted to disk. */
export interface AppSettings {
  downloadsDir: string
  defaultFormat: string
  concurrentLimit: number
  audioOnly: boolean
  /** Watch the clipboard and offer to add detected video links. */
  clipboardMonitor: boolean
  /** Hide to the system tray instead of closing/minimizing. */
  minimizeToTray: boolean
  /** Show OS notifications when downloads finish or fail. */
  notifications: boolean
}

/** Result of an install/update operation on the yt-dlp binary. */
export interface YtDlpOpResult {
  ok: boolean
  message: string
  version: string | null
}

/** Result of comparing the installed yt-dlp against the latest GitHub release. */
export interface YtDlpCheckResult {
  current: string | null
  latest: string | null
  upToDate: boolean
  error: string | null
}

/** Presence/version info for ffmpeg, whether managed or found on PATH. */
export interface FfmpegStatus {
  present: boolean
  /** Short build version (e.g. 2026-08-09), null when not available. */
  version: string | null
  /** Where the binary was found. */
  source: 'managed' | 'path' | null
  /** Human-readable install/update progress message while a binary op runs. */
  busy: boolean
  message: string | null
}

/** Result of an install/update operation on the managed ffmpeg binary. */
export interface FfmpegOpResult {
  ok: boolean
  message: string
  version: string | null
}

/** Result of comparing the installed ffmpeg build against the latest release. */
export interface FfmpegCheckResult {
  current: string | null
  latest: string | null
  upToDate: boolean
  error: string | null
}

/** Streamed progress for a yt-dlp binary download, pushed from main. */
export interface BinaryProgress {
  received: number
  total: number
}

/**
 * One snapshot of the auto-update flow (checking, available, downloading,
 * downloaded, error, not-available). Pushed from main over 'update:event';
 * percent tracks download progress while downloading.
 */
export type UpdateState = {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  message?: string
}
