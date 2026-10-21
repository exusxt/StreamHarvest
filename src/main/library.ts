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
  return {
    id: job.id,
    jobId: job.id,
    url: job.url,
    title: job.title,
    thumbnail: job.thumbnail,
    site: job.site ?? siteFromUrl(job.url),
    duration: job.duration ?? null,
    sizeBytes,
    formatLabel: job.formatLabel,
    ext,
    filePath: job.filePath,
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

  /** Current library plus derived storage stats and missing-file ids. */
  snapshot(): LibrarySnapshot {
    let totalBytes = 0
    const missingIds: string[] = []
    for (const item of this.items) {
      if (!item.filePath || !existsSync(item.filePath)) {
        missingIds.push(item.id)
        continue
      }
      let size = item.sizeBytes
      if (size === null || size <= 0) {
        try {
          size = statSync(item.filePath).size
        } catch {
          size = 0
        }
      }
      totalBytes += size
    }
    return { items: [...this.items], count: this.items.length, totalBytes, missingIds }
  }

  /** Absolute path of an entry's file, when it still exists on disk. */
  fileOf(id: string): string | null {
    const item = this.items.find((it) => it.id === id)
    if (!item?.filePath || !existsSync(item.filePath)) return null
    return item.filePath
  }

  /** Adds or updates an entry for a completed job. */
  async addFromJob(job: DownloadJob): Promise<void> {
    const item = itemFromJob(job)
    if (!item) return
    const path = item.filePath?.toLowerCase()
    const idx = this.items.findIndex(
      (it) => it.id === item.id || (!!path && it.filePath?.toLowerCase() === path)
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

  /** Deletes the media file (restricted to the downloads dir) and its entry. */
  async deleteFile(id: string): Promise<void> {
    const item = this.items.find((it) => it.id === id)
    if (!item) return
    if (!item.filePath) {
      await this.remove([id])
      return
    }
    if (!isInside(this.getSettings().downloadsDir, item.filePath)) return
    try {
      rmSync(item.filePath, { force: true })
    } catch {
      // Keep the entry when a locked file could not actually be removed.
      if (existsSync(item.filePath)) return
    }
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
