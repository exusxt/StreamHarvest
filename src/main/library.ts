/**
 * Media library service (0.9.0). Completed downloads become persistent library
 * entries with metadata, file path and thumbnail. The service is independent of
 * the renderer so the future web interface (0.10.0) can reuse it, and it
 * migrates the old download history once on first launch.
 */

import { existsSync, rmSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { app } from 'electron'
import type { AppSettings, DownloadJob, LibraryItem, LibrarySnapshot } from '../shared/types'
import { siteFromUrl } from '../shared/urls'

const LIBRARY_VERSION = 1

function libraryFile(): string {
  return join(app.getPath('userData'), 'library.json')
}

function historyFile(): string {
  return join(app.getPath('userData'), 'download-history.json')
}

/** True when `child` resolves to `parent` or a path below it. */
function isInside(parent: string, child: string): boolean {
  const base = resolve(parent)
  const full = resolve(child)
  const a = process.platform === 'win32' ? base.toLowerCase() : base
  const b = process.platform === 'win32' ? full.toLowerCase() : full
  return b === a || b.startsWith(a.endsWith(sep) ? a : `${a}${sep}`)
}

/** Maps a completed download job onto a library entry (new + migrated items). */
function itemFromJob(job: DownloadJob): LibraryItem | null {
  if (job.status !== 'completed') return null
  let sizeBytes: number | null = null
  let ext: string | null = null
  if (job.filePath) {
    ext = extname(job.filePath).replace(/^\./, '').toLowerCase() || null
    try {
      sizeBytes = statSync(job.filePath).size
    } catch {
      sizeBytes = null
    }
  }
  const files = (job.filePaths && job.filePaths.length > 0 ? job.filePaths : job.filePath ? [job.filePath] : [])
  let totalSize = sizeBytes
  if (files.length > 1) {
    let sum = 0
    for (const f of files) {
      try {
        sum += statSync(f).size
      } catch {
        // skip
      }
    }
    if (sum > 0) totalSize = sum
  }
  return {
    id: job.id,
    jobId: job.id,
    url: job.url,
    title: job.title,
    thumbnail: job.thumbnail,
    site: job.site ?? siteFromUrl(job.url),
    duration: job.duration ?? null,
    sizeBytes: totalSize,
    formatLabel: job.formatLabel,
    ext,
    filePath: job.filePath,
    filePaths: files.length > 0 ? files : undefined,
    presetId: job.presetId,
    formatId: job.formatId,
    playlist: job.playlist,
    playlistItems: job.playlistItems,
    addedAt: job.createdAt,
    completedAt: job.completedAt
  }
}

export class LibraryService {
  private items: LibraryItem[] = []

  constructor(private getSettings: () => AppSettings) {}

  /** Loads library.json, or migrates the legacy download history on first run. */
  async init(): Promise<void> {
    try {
      const raw = await readFile(libraryFile(), 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { items?: unknown }).items)
          ? ((parsed as { items: unknown[] }).items as LibraryItem[])
          : []
      this.items = list.filter(
        (it): it is LibraryItem => !!it && typeof it.id === 'string' && typeof it.url === 'string'
      )
      return
    } catch {
      // No library yet — try the one-time migration below.
    }
    await this.migrateHistory()
  }

  /** Imports completed jobs from download-history.json (the file is left in place
   * so paused jobs can still be resumed by the download manager). */
  private async migrateHistory(): Promise<void> {
    let jobs: DownloadJob[] = []
    try {
      jobs = JSON.parse(await readFile(historyFile(), 'utf-8')) as DownloadJob[]
    } catch {
      return
    }
    this.items = jobs.map(itemFromJob).filter((it): it is LibraryItem => it !== null)
    await this.persist()
  }

  /** Snapshot with derived storage stats and missing-file ids. */
  snapshot(): LibrarySnapshot {
    let totalBytes = 0
    const missingIds: string[] = []
    for (const item of this.items) {
      const files = item.filePaths && item.filePaths.length > 0 ? item.filePaths : item.filePath ? [item.filePath] : []
      const existing = files.filter((p) => existsSync(p))
      if (existing.length === 0 && files.length > 0) {
        missingIds.push(item.id)
        continue
      }
      if (existing.length === 0) continue
      let size = item.sizeBytes
      if (size === null || size <= 0) {
        let sum = 0
        for (const p of existing) {
          try { sum += statSync(p).size } catch { }
        }
        size = sum > 0 ? sum : 0
      }
      totalBytes += size
    }
    return { items: [...this.items], count: this.items.length, totalBytes, missingIds }
  }

  /** Absolute path of an entry's file, when it still exists on disk. */
  fileOf(id: string): string | null {
    const item = this.items.find((it) => it.id === id)
    const list = item?.filePaths && item.filePaths.length > 0 ? item.filePaths : item?.filePath ? [item.filePath] : []
    for (const p of list) if (p && existsSync(p)) return p
    return null
  }

  /** All files for an entry, in order. */
  filesOf(id: string): string[] {
    const item = this.items.find((it) => it.id === id)
    const list = item?.filePaths && item.filePaths.length > 0 ? item.filePaths : item?.filePath ? [item.filePath] : []
    return list.filter((p) => p && existsSync(p))
  }

  /** Adds or updates an entry for a completed job. */
  async addFromJob(job: DownloadJob): Promise<void> {
    const item = itemFromJob(job)
    if (!item) return
    const path = item.filePath?.toLowerCase()
    const idx = this.items.findIndex(
      (it) => it.id === item.id || (!!path && it.filePath?.toLowerCase() === path) || (!!path && it.filePaths?.some((f) => f.toLowerCase() === path))
    )
    if (idx === -1) this.items.push(item)
    else this.items[idx] = { ...item, id: this.items[idx].id, addedAt: this.items[idx].addedAt }
    await this.persist()
  }

  /** Removes entries from the index without touching files on disk. */
  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const drop = new Set(ids)
    this.items = this.items.filter((it) => !drop.has(it.id))
    await this.persist()
  }

  /** Removes every entry whose file is missing. */
  async removeMissing(): Promise<void> {
    await this.remove(this.snapshot().missingIds)
  }

  /** Deletes the media file(s) (restricted to the downloads dir) and their entry. */
  async deleteFile(id: string): Promise<void> {
    const item = this.items.find((it) => it.id === id)
    if (!item) return
    const files = item.filePaths && item.filePaths.length > 0 ? item.filePaths : item.filePath ? [item.filePath] : []
    if (files.length === 0) {
      await this.remove([id])
      return
    }
    let allAllowed = true
    for (const f of files) if (!f || !isInside(this.getSettings().downloadsDir, f)) { allAllowed = false; break }
    if (!allAllowed) return
    let blocked = false
    for (const f of files) {
      try {
        rmSync(f, { force: true })
      } catch {
        if (existsSync(f)) { blocked = true; break }
      }
    }
    if (blocked) return
    await this.remove([id])
  }

  private async persist(): Promise<void> {
    try {
      await mkdir(app.getPath('userData'), { recursive: true })
      await writeFile(
        libraryFile(),
        JSON.stringify({ version: LIBRARY_VERSION, items: this.items }, null, 2),
        'utf-8'
      )
    } catch {
      // best-effort persistence
    }
  }
}
