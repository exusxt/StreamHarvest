// Download manager: owns every download job, spawns yt-dlp subprocesses,
// parses their progress output, enforces the concurrency limit and persists
// finished jobs as history.

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app, Notification } from 'electron'
import type { AppSettings, DownloadJob, DownloadStatus, MediaFormat, OutputFormat, OutputLayout, PlaylistEntry, VideoMetadata } from '../shared/types'
import { QUALITY_PRESETS } from '../shared/types'
import { translate } from '../shared/i18n'
import { ffmpegManagedPath, ffmpegStoreDir } from './ffmpeg'
import { ytDlpPath } from './ytdlp'

const HISTORY_LIMIT = 200
const FORMAT_LIMIT = 80

/** Per-job options remembered so resume/re-download reuse the same command. */
interface JobOptions {
  presetId: string
  formatId?: string
  playlist: boolean
  playlistItems?: string
}

/** Resolves a settings value to a yt-dlp `-o` template with subfolder layout. */
function outputTemplate(layout: OutputLayout): string {
  switch (layout) {
    case 'site':
      return `%(extractor_key)s/%(title)s [%(id)s].%(ext)s`
    case 'date':
      return `%(upload_date>%Y-%m-%d)s/%(title)s [%(id)s].%(ext)s`
    case 'playlist':
      return `%(playlist_title|Video)s/%(title)s [%(id)s].%(ext)s`
    default:
      return `%(title)s [%(id)s].%(ext)s`
  }
}

/** Container extension used for `--remux-video`, or null to keep the source. */
function remuxExtension(format: OutputFormat): string | null {
  return format === 'original' ? null : format
}

/** True when ffmpeg is reachable (managed copy or on PATH). */
function ffmpegAvailableSync(): boolean {
  if (existsSync(ffmpegManagedPath())) return true
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const pathVar = process.env.PATH ?? ''
  const dirs = pathVar.split(process.platform === 'win32' ? ';' : ':')
  for (const dir of dirs) {
    if (!dir) continue
    try {
      if (existsSync(join(dir.trim(), exe))) return true
    } catch {
      // unreadable PATH entry — keep scanning
    }
  }
  return false
}

/** Recursively collects file paths matching a predicate under a directory. */
function walkFiles(dir: string, match: (name: string) => boolean, depth = 0): string[] {
  if (depth > 6) return []
  const out: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      out.push(...walkFiles(join(dir, e.name), match, depth + 1))
    } else if (e.isFile() && match(e.name)) {
      out.push(join(dir, e.name))
    }
  }
  return out
}

interface StartParams {
  url: string
  presetId: string
  formatId?: string
  title?: string
  thumbnail?: string | null
  playlist?: boolean
  playlistItems?: string
}

function historyFile(): string {
  return join(app.getPath('userData'), 'download-history.json')
}

/** Parses a yt-dlp `[download] ...` progress line into its numeric parts. */
function parseProgress(line: string): { pct: number; bytes: number; speed: string; eta: string } | null {
  const pctMatch = line.match(/^\[download\]\s+(\d+(?:\.\d+)?)%/)
  if (!pctMatch) return null
  const pct = Math.min(100, parseFloat(pctMatch[1]))
  let bytes = 0
  const sizeMatch = line.match(/of\s+~?([\d.]+)\s*([KMGT]i?B)/)
  if (sizeMatch) bytes = toBytes(parseFloat(sizeMatch[1]), sizeMatch[2])
  let speed = ''
  const speedMatch = line.match(/at\s+([\d.]+)\s*([KMGT]i?B\/s)/)
  if (speedMatch) speed = `${speedMatch[1]} ${speedMatch[2]}`
  let eta = ''
  const etaMatch = line.match(/ETA\s+(\d+:\d+)/)
  if (etaMatch) eta = etaMatch[1]
  return { pct, bytes, speed, eta }
}

function toBytes(value: number, unit: string): number {
  const multiplier: Record<string, number> = {
    B: 1,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    TiB: 1024 ** 4,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4
  }
  return Math.round(value * (multiplier[unit] ?? 1))
}

function isTerminal(status: DownloadStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export class DownloadManager {
  private jobs = new Map<string, DownloadJob>()
  private options = new Map<string, JobOptions>()
  private children = new Map<string, ChildProcess>()
  private partFiles = new Map<string, string>()
  private fileCandidates = new Map<string, string[]>()
  private activeCount = 0
  /** Ordered ids of queued jobs, oldest first — the visible download queue. */
  private order: string[] = []

  constructor(
    private getSettings: () => AppSettings,
    private onJobUpdate: (job: DownloadJob) => void
  ) {
    void this.loadHistory()
  }

  /** Active jobs in queue order, then finished history newest first. */
  list(): DownloadJob[] {
    const active = [...this.jobs.values()]
      .filter((j) => !isTerminal(j.status))
      .sort((a, b) => this.orderIndex(a) - this.orderIndex(b) || a.createdAt.localeCompare(b.createdAt))
    const history = [...this.jobs.values()]
      .filter((j) => isTerminal(j.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return [...active, ...history]
  }

  /** Moves a queued job up (-1) or down (+1) in the queue. */
  async move(id: string, direction: -1 | 1): Promise<DownloadJob[]> {
    const job = this.jobs.get(id)
    if (!job || job.status !== 'queued') return this.list()
    const idx = this.order.indexOf(id)
    if (idx === -1) return this.list()
    const swap = idx + direction
    if (swap < 0 || swap >= this.order.length) return this.list()
    ;[this.order[idx], this.order[swap]] = [this.order[swap], this.order[idx]]
    return this.list()
  }

  /** Adds several URLs to the queue at once (batch import / clipboard). */
  async startMany(urls: string[], presetId: string): Promise<DownloadJob[]> {
    const bin = ytDlpPath()
    if (!bin) return []
    const created: DownloadJob[] = []
    for (const url of urls) {
      const res = await this.start({ url, presetId, playlist: true })
      if (res.job) created.push(res.job)
    }
    return created
  }

  /** Drops finished jobs from history. */
  clearHistory(): void {
    for (const [id, job] of this.jobs) {
      if (isTerminal(job.status)) this.jobs.delete(id)
    }
    void this.persist()
  }

  /** Fetches metadata for a URL without downloading anything. */
  async fetchMetadata(url: string): Promise<VideoMetadata> {
    const bin = ytDlpPath()
    if (!bin) {
      return { id: '', title: '', uploader: null, duration: null, thumbnail: null, webpageUrl: url, formats: [], playlist: false, entryCount: null, entries: null, error: 'yt-dlp is not installed yet.' }
    }
    const args = ['-J', '--flat-playlist', '--no-warnings', url]
    try {
      const { stdout } = await runCapture(bin, args, 90000)
      const data = JSON.parse(stdout) as Record<string, unknown>
      if (isPlaylist(data)) {
        const entries = Array.isArray(data.entries) ? (data.entries as Array<Record<string, unknown>>) : []
        const first = entries[0] ?? {}
        return {
          id: str(data.id) || '',
          title: str(data.title) || str(first.title) || 'Playlist',
          uploader: str(data.uploader) || str(first.uploader) || null,
          duration: null,
          thumbnail: str(data.thumbnail) || str(first.thumbnail) || null,
          webpageUrl: url,
          formats: [],
          playlist: true,
          entryCount: entries.length > 0 ? entries.length : null,
          entries: buildPlaylistEntries(entries),
          error: null
        }
      }
      return {
        id: str(data.id) || '',
        title: str(data.title) || 'Unknown title',
        uploader: str(data.uploader) || null,
        duration: num(data.duration),
        thumbnail: str(data.thumbnail) || null,
        webpageUrl: url,
        formats: buildFormats(data),
        playlist: false,
        entryCount: null,
        entries: null,
        error: null
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { id: '', title: '', uploader: null, duration: null, thumbnail: null, webpageUrl: url, formats: [], playlist: false, entryCount: null, entries: null, error: msg }
    }
  }

  /** Adds a job to the queue and starts it (or waits for a slot). */
  async start(params: StartParams): Promise<{ ok: boolean; job?: DownloadJob; error?: string }> {
    const bin = ytDlpPath()
    if (!bin) return { ok: false, error: 'yt-dlp is not installed yet.' }
    try {
      await mkdir(this.getSettings().downloadsDir, { recursive: true })
    } catch {
      // yt-dlp creates the output directory too; ignore races here.
    }
    const job: DownloadJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: params.url,
      title: params.title || params.url,
      thumbnail: params.thumbnail ?? null,
      formatLabel: presetLabel(params.presetId, params.formatId),
      presetId: params.presetId,
      formatId: params.formatId,
      playlist: params.playlist ?? false,
      playlistItems: params.playlistItems,
      status: 'queued',
      progress: 0,
      speed: '',
      eta: '',
      bytesReceived: 0,
      bytesTotal: 0,
      filePath: null,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null
    }
    this.options.set(job.id, { presetId: params.presetId, formatId: params.formatId, playlist: params.playlist ?? false, playlistItems: params.playlistItems })
    this.jobs.set(job.id, job)
    this.order.push(job.id)
    this.emit(job)
    this.pump()
    return { ok: true, job }
  }

  async pause(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job || job.status !== 'downloading') return
    job.status = 'paused'
    this.removeFromOrder(id)
    this.emit(job)
    this.activeCount = Math.max(0, this.activeCount - 1)
    const child = this.children.get(id)
    if (child) {
      try {
        child.kill()
      } catch {
        // already gone
      }
    }
  }

  async resume(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job || job.status !== 'paused') return
    job.status = 'queued'
    job.error = null
    if (!this.order.includes(id)) this.order.push(id)
    this.emit(job)
    this.pump()
  }

  async cancel(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job || isTerminal(job.status)) return
    job.status = 'cancelled'
    job.completedAt = new Date().toISOString()
    this.removeFromOrder(id)
    this.emit(job)
    void this.persist()
    if (job.status === 'cancelled' && this.children.get(id)) {
      this.activeCount = Math.max(0, this.activeCount - 1)
      const child = this.children.get(id)
      if (child) {
        try {
          child.kill()
        } catch {
          // already gone
        }
      }
      const part = this.partFiles.get(id)
      if (part) {
        try {
          rmSync(part, { force: true })
        } catch {
          // best-effort
        }
      }
      // yt-dlp may write the .part file under a differently-sanitized name
      const list = this.fileCandidates.get(id) ?? []
      const pid = videoIdFromPaths(list) ?? videoIdFromUrl(job.url)
      if (pid) {
        try {
          const dir = this.getSettings().downloadsDir
          for (const name of walkFiles(dir, (n) => n.includes(`[${pid}]`) && n.endsWith('.part'))) {
            try {
              rmSync(name, { force: true })
            } catch {
              // best-effort
            }
          }
        } catch {
          // downloads dir unreadable
        }
      }
    }
    this.pump()
  }

  /** Starts queued jobs while slots are free, oldest in the queue first. */
  private pump(): void {
    const limit = this.getSettings().concurrentLimit
    const queued = [...this.jobs.values()]
      .filter((j) => j.status === 'queued')
      .sort((a, b) => this.orderIndex(a) - this.orderIndex(b))
    for (const job of queued) {
      if (this.activeCount >= limit) return
      this.spawn(job)
    }
  }

  /** Position of a job in the queue; jobs outside it sort last. */
  private orderIndex(job: DownloadJob): number {
    const i = this.order.indexOf(job.id)
    return i === -1 ? this.order.length : i
  }

  private removeFromOrder(id: string): void {
    const i = this.order.indexOf(id)
    if (i !== -1) this.order.splice(i, 1)
  }

  /** Spawns the yt-dlp subprocess for a job. */
  private spawn(job: DownloadJob): void {
    const bin = ytDlpPath()
    if (!bin) return
    const opts = this.options.get(job.id) ?? { presetId: 'best', playlist: false }
    const preset = QUALITY_PRESETS.find((p) => p.id === opts.presetId) ?? QUALITY_PRESETS[0]
    const selector = opts.formatId ? `${opts.formatId}+bestaudio/best` : preset.selector
    const settings = this.getSettings()
    const template = outputTemplate(settings.outputLayout)
    const args = ['--newline', '--no-warnings', '-f', selector, '-o', join(settings.downloadsDir, template)]
    const managedFfmpeg = ffmpegManagedPath()
    if (managedFfmpeg) args.push('--ffmpeg-location', ffmpegStoreDir())
    if (preset.extraArgs) args.push(...preset.extraArgs)
    if (!opts.playlist) args.push('--no-playlist')
    if (opts.playlist && opts.playlistItems) args.push('--playlist-items', opts.playlistItems)

    // Phase 3 media quality flags. ffmpeg-only features are gated on an actual
    // ffmpeg being present so downloads without ffmpeg keep working.
    if (ffmpegAvailableSync()) {
      if (settings.embedMetadata) args.push('--embed-metadata')
      if (settings.embedThumbnail) args.push('--embed-thumbnail')
      const remux = remuxExtension(settings.outputFormat)
      if (remux && !preset.extraArgs?.includes('--extract-audio')) args.push('--remux-video', remux)
      if (settings.embedSubtitles && settings.subtitles) args.push('--embed-subs')
    }
    if (settings.subtitles) {
      const langs = settings.subtitleLangs.trim().replace(/\s+/g, '') || 'en'
      args.push('--write-subs', '--sub-langs', langs, '--sub-format', 'best')
    }

    // Phase 4 network flags.
    if (settings.speedLimit.trim()) args.push('--limit-rate', settings.speedLimit.trim())
    if (settings.proxy.trim()) args.push('--proxy', settings.proxy.trim())
    args.push(job.url)

    // Phase 4 advanced mode: raw passthrough appended last so it can override
    // any flag built above (yt-dlp applies later options first).
    if (settings.advancedMode && settings.extraArgs.trim()) {
      args.push(...splitArgs(settings.extraArgs))
    }

    job.status = 'downloading'
    job.progress = 0
    job.speed = ''
    job.eta = ''
    this.removeFromOrder(job.id)
    this.emit(job)

    let child: ChildProcess
    try {
      child = spawn(bin, args, { windowsHide: true })
    } catch (e) {
      job.status = 'failed'
      job.error = e instanceof Error ? e.message : String(e)
      job.completedAt = new Date().toISOString()
      this.emit(job)
      this.notify(job)
      void this.persist()
      return
    }
    this.children.set(job.id, child)
    this.activeCount++

    const errTail: string[] = []
    child.stdout?.on('data', (d: Buffer) => {
      for (const raw of d.toString().split(/\r?\n/)) {
        const line = raw.trim()
        if (line) this.handleLine(job, line)
      }
    })
    child.stderr?.on('data', (d: Buffer) => {
      for (const line of d.toString().split(/\r?\n/)) {
        const t = line.trim()
        if (t) {
          errTail.push(t)
          if (errTail.length > 8) errTail.shift()
        }
      }
    })
    child.on('error', (err) => {
      errTail.push(String(err.message))
    })
    child.on('close', (code) => {
      this.children.delete(job.id)
      this.activeCount = Math.max(0, this.activeCount - 1)
      this.finalize(job, code, errTail)
      this.pump()
    })
  }

  /** Parses one stdout line from yt-dlp for a job. */
  private handleLine(job: DownloadJob, line: string): void {
    if (line.startsWith('[download] Destination:')) {
      const path = line.slice('[download] Destination:'.length).trim().replace(/^"|"$/g, '')
      this.trackFile(job, path)
      return
    }
    if (line.startsWith('[download]') && line.includes('has already been downloaded')) {
      const path = line
        .slice('[download]'.length)
        .trim()
        .replace(/ has already been downloaded$/, '')
        .replace(/^"|"$/g, '')
      this.trackFile(job, path)
      return
    }
    if (line.startsWith('[Merger]')) {
      const m = line.match(/"([^"]+)"/)
      if (m) this.trackFile(job, m[1])
      return
    }
    if (line.startsWith('[ExtractAudio]') && line.includes('Destination:')) {
      const path = line.slice(line.indexOf('Destination:') + 'Destination:'.length).trim().replace(/^"|"$/g, '')
      this.trackFile(job, path)
      return
    }
    const progress = parseProgress(line)
    if (progress) {
      job.progress = progress.pct
      if (progress.bytes > 0) job.bytesTotal = progress.bytes
      job.bytesReceived = Math.round((job.bytesTotal * job.progress) / 100)
      if (progress.speed) job.speed = progress.speed
      if (progress.eta) job.eta = progress.eta
      this.emit(job)
    }
  }

  /** Remembers a file path yt-dlp reported so the real one can be resolved later. */
  private trackFile(job: DownloadJob, path: string): void {
    if (!path) return
    job.filePath = path
    this.partFiles.set(job.id, `${path}.part`)
    const list = this.fileCandidates.get(job.id) ?? []
    if (!list.includes(path)) {
      list.push(path)
      this.fileCandidates.set(job.id, list)
    }
  }

  /** Finds the actual on-disk file for a finished job. yt-dlp can report a
   * path that differs from the file it really wrote (Windows-invalid title
   * characters are sanitized differently in the destination message than on
   * disk), so we verify candidates and fall back to scanning for the video id. */
  private resolveFilePath(job: DownloadJob): void {
    const candidates = this.fileCandidates.get(job.id) ?? []
    for (const p of candidates) {
      if (!p.endsWith('.part') && existsSync(p)) {
        job.filePath = p
        return
      }
    }
    const id = videoIdFromPaths(candidates) ?? videoIdFromUrl(job.url)
    if (id) {
      const dir = this.getSettings().downloadsDir
      let best: { name: string; mtime: number } | null = null
      try {
        for (const name of walkFiles(dir, (n) => n.includes(`[${id}]`) && !n.endsWith('.part'))) {
          let mtime = 0
          try {
            mtime = statSync(name).mtimeMs
          } catch {
            continue
          }
          if (!best || mtime > best.mtime) best = { name, mtime }
        }
      } catch {
        // downloads dir unreadable — fall through to best effort
      }
      if (best) {
        job.filePath = best.name
        return
      }
    }
    const last = candidates[candidates.length - 1]
    if (last) job.filePath = last
  }

  /** Applies the final status after a subprocess exits. */
  private finalize(job: DownloadJob, code: number | null, errTail: string[]): void {
    if (job.status === 'paused' || job.status === 'cancelled') {
      void this.persist()
      return
    }
    if (isTerminal(job.status)) {
      void this.persist()
      return
    }
    if (code === 0) {
      job.status = 'completed'
      job.progress = 100
      job.speed = ''
      job.eta = ''
      job.completedAt = new Date().toISOString()
      this.resolveFilePath(job)
    } else {
      job.status = 'failed'
      job.completedAt = new Date().toISOString()
      job.error =
        errTail
          .filter((l) => !l.startsWith('[download]'))
          .slice(-4)
          .join(' ') || `yt-dlp exited with code ${code}`
    }
    this.emit(job)
    this.notify(job)
    void this.persist()
  }

  /** Shows an OS notification for a finished download, when enabled. */
  private notify(job: DownloadJob): void {
    if (!this.getSettings().notifications) return
    if (!Notification.isSupported()) return
    const done = job.status === 'completed'
    const lang = this.getSettings().language
    const title = translate(lang, done ? 'notify.complete' : 'notify.failed')
    const body = done ? job.title : `${job.title} — ${job.error ?? 'unknown error'}`
    try {
      new Notification({
        title,
        body: body.length > 220 ? `${body.slice(0, 217)}…` : body,
        silent: false
      }).show()
    } catch {
      // notifications are best-effort
    }
  }

  private emit(job: DownloadJob): void {
    this.onJobUpdate({ ...job })
  }

  private async loadHistory(): Promise<void> {
    try {
      const content = await readFile(historyFile(), 'utf-8')
      const list = JSON.parse(content) as DownloadJob[]
      for (const job of list) {
        if (isTerminal(job.status) || job.status === 'paused') this.jobs.set(job.id, job)
      }
    } catch {
      // no history yet
    }
  }

  private async persist(): Promise<void> {
    const terminal = [...this.jobs.values()].filter((j) => isTerminal(j.status) || j.status === 'paused').slice(0, HISTORY_LIMIT)
    try {
      await mkdir(app.getPath('userData'), { recursive: true })
      await writeFile(historyFile(), JSON.stringify(terminal, null, 2), 'utf-8')
    } catch {
      // best-effort
    }
  }
}

function presetLabel(presetId: string, formatId?: string): string {
  if (formatId) return `Format ${formatId} + best audio`
  return QUALITY_PRESETS.find((p) => p.id === presetId)?.label ?? presetId
}

function isPlaylist(data: Record<string, unknown>): boolean {
  return data._type === 'playlist' || Array.isArray(data.entries)
}

const PLAYLIST_ENTRY_LIMIT = 500

/** Maps raw yt-dlp playlist entries into the compact shape we send to the UI. */
function buildPlaylistEntries(entries: Array<Record<string, unknown>>): PlaylistEntry[] {
  const out: PlaylistEntry[] = []
  for (const e of entries) {
    out.push({
      id: str(e.id) ?? str(e.url) ?? '',
      title: str(e.title) || 'Untitled',
      duration: num(e.duration)
    })
    if (out.length >= PLAYLIST_ENTRY_LIMIT) break
  }
  return out
}

function videoIdFromPaths(paths: string[]): string | null {
  for (const p of paths) {
    const m = p.match(/\[([A-Za-z0-9_-]{6,24})\](?:\.part)?\.[^.]+$/)
    if (m) return m[1]
  }
  return null
}

function videoIdFromUrl(url: string): string | null {
  const m =
    url.match(/[?&]v=([A-Za-z0-9_-]{6,24})/) ??
    url.match(/youtu\.be\/([A-Za-z0-9_-]{6,24})/) ??
    url.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,24})/)
  return m ? m[1] : null
}

function buildFormats(data: Record<string, unknown>): MediaFormat[] {
  const raw = Array.isArray(data.formats) ? (data.formats as Array<Record<string, unknown>>) : []
  const out: MediaFormat[] = []
  const seen = new Set<string>()
  for (const f of raw) {
    const id = str(f.format_id)
    if (!id || seen.has(id)) continue
    const ext = str(f.ext) || '?'
    const height = num(f.height)
    const width = num(f.width)
    const resolution = height ? (width ? `${width}x${height}` : `${height}p`) : null
    const filesize = num(f.filesize) ?? num(f.filesize_approx)
    const vcodec = str(f.vcodec)
    const acodec = str(f.acodec)
    const tbr = num(f.tbr)
    let label = [resolution ?? '', ext].filter(Boolean).join(' ')
    if (vcodec === 'none' && acodec !== 'none') label = `Audio only · ${ext}`
    if (filesize) label += ` · ${formatBytesShort(filesize)}`
    seen.add(id)
    out.push({ id, label, ext, resolution, filesize, vcodec, acodec, tbr })
    if (out.length >= FORMAT_LIMIT) break
  }
  return out.sort((a, b) => heightOf(b) - heightOf(a) || (a.tbr ?? 0) - (b.tbr ?? 0))
}

function heightOf(f: MediaFormat): number {
  const m = f.resolution?.match(/(\d+)p/) ?? f.resolution?.match(/(\d+)x(\d+)/)
  return m ? parseInt(m[1] ?? m[2] ?? '0', 10) : 0
}

function formatBytesShort(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Splits a raw argument string into argv pieces, honoring quotes. */
export function splitArgs(input: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3])
  }
  return out
}

/** Runs a command and returns stdout + stderr. */
export function runCapture(cmd: string, args: string[], timeoutMs = 30000): Promise<{ stdout: string; stderr: string }> {  return new Promise((resolve, reject) => {
    let child: ChildProcess
    try {
      child = spawn(cmd, args, { windowsHide: true })
    } catch (e) {
      reject(e)
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Timed out running ${cmd}`))
    }, timeoutMs)
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`Process exited with code ${code}: ${stderr.trim() || stdout.trim()}`))
    })
  })
}
