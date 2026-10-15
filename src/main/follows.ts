// Followed channels/playlists (Phase 5). A persistent watch list that is
// checked periodically for newly published videos. Storage mirrors the
// download-history pattern: a JSON file under userData. Listing uses the
// same yt-dlp flat-playlist JSON mode as the metadata fetch, with URLs
// reconstructed per entry so new videos can be queued individually.

import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { translate } from '../shared/i18n'
import type { Follow, FollowResult, FollowType, FollowVideo } from '../shared/types'
import { runCapture, ytDlpPath } from './ytdlp'
import { getSettings } from './settings'

const STORE_FILE = 'follows.json'
/** Entries examined per check (newest first where the site supports it). */
const LIST_LIMIT = 25
/** New videos queued/reported per check, to avoid a back-catalogue flood. */
const NEW_LIMIT = 10
/** Remembered video ids per follow — bounds the stored JSON. */
const SEEN_LIMIT = 200

function storeFile(): string {
  return join(app.getPath('userData'), STORE_FILE)
}

let cache: Follow[] | null = null

/** Registered by the main process: queueing + notifications for new videos. */
type NewVideosHandler = (follow: Follow, videos: FollowVideo[]) => Promise<void>
let onNewVideos: NewVideosHandler | null = null

export function setOnNewVideos(handler: NewVideosHandler): void {
  onNewVideos = handler
}

function normalize(f: Partial<Follow>): Follow | null {
  if (!f || typeof f.url !== 'string' || !f.url.trim()) return null
  return {
    id: typeof f.id === 'string' && f.id ? f.id : randomUUID(),
    url: f.url,
    title: typeof f.title === 'string' && f.title ? f.title : f.url,
    thumbnail: typeof f.thumbnail === 'string' ? f.thumbnail : null,
    type: f.type === 'playlist' ? 'playlist' : 'channel',
    seenIds: Array.isArray(f.seenIds) ? f.seenIds.filter((v): v is string => typeof v === 'string').slice(0, SEEN_LIMIT) : [],
    presetId: typeof f.presetId === 'string' && f.presetId ? f.presetId : 'best',
    autoDownload: f.autoDownload !== false,
    lastCheckedAt: typeof f.lastCheckedAt === 'string' ? f.lastCheckedAt : null,
    newCount: typeof f.newCount === 'number' && f.newCount > 0 ? Math.floor(f.newCount) : 0
  }
}

async function load(): Promise<Follow[]> {
  if (cache) return cache
  try {
    const raw = JSON.parse(await readFile(storeFile(), 'utf-8')) as unknown
    const list = Array.isArray(raw) ? raw : []
    cache = list.map((f) => normalize(f as Partial<Follow>)).filter((f): f is Follow => f !== null)
  } catch {
    // Missing or corrupt store — start empty.
    cache = []
  }
  return cache
}

async function persist(): Promise<void> {
  try {
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(storeFile(), JSON.stringify(cache ?? [], null, 2), 'utf-8')
  } catch {
    // best-effort
  }
}

/** All followed channels/playlists (newest addition first). */
export async function listFollows(): Promise<Follow[]> {
  const list = await load()
  return [...list].reverse()
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

/** Rebuilds a watchable URL for a flat playlist entry. */
function entryUrl(e: Record<string, unknown>, followUrl: string): string | null {
  for (const key of ['webpage_url', 'url', 'original_url']) {
    const v = str(e[key])
    if (v && /^https?:\/\//i.test(v)) return v
  }
  // Flat entries from YouTube-style extractors only carry the video id.
  const id = str(e.id)
  if (id && /youtu\.?be/i.test(followUrl)) return `https://www.youtube.com/watch?v=${id}`
  return null
}

interface Listing {
  videos: FollowVideo[]
  title: string | null
  thumbnail: string | null
  type: FollowType
  error: string | null
}

/** Lists the latest videos of a channel/playlist URL via yt-dlp. */
async function listVideos(url: string): Promise<Listing> {
  const lang = getSettings().language
  const bin = ytDlpPath()
  if (!bin) {
    return { videos: [], title: null, thumbnail: null, type: 'playlist', error: translate(lang, 'follows.engineMissing') }
  }
  try {
    const { stdout } = await runCapture(
      bin,
      ['-J', '--flat-playlist', '--no-warnings', '--playlist-end', String(LIST_LIMIT), url],
      120000
    )
    const data = JSON.parse(stdout) as Record<string, unknown>
    // Only multi-entry listings can be followed; a single video URL is not a
    // channel/playlist and would just re-check one item forever.
    const raw = Array.isArray(data.entries) ? (data.entries as Array<Record<string, unknown>>) : []
    const videos: FollowVideo[] = []
    for (const e of raw) {
      const link = entryUrl(e, url)
      const id = str(e.id) ?? link
      if (!link || !id) continue
      videos.push({ id, title: str(e.title) ?? 'Untitled', url: link, thumbnail: str(e.thumbnail) })
      if (videos.length >= LIST_LIMIT) break
    }
    if (!videos.length) {
      return { videos: [], title: null, thumbnail: null, type: 'playlist', error: translate(lang, 'follows.notAPlaylist') }
    }
    return {
      videos,
      title: str(data.title),
      thumbnail: str(data.thumbnail),
      // A channel feed exposes more than a fixed playlist would.
      type: /\/playlist\?|\/playlist\/|list=/i.test(url) ? 'playlist' : 'channel',
      error: null
    }
  } catch (e) {
    return { videos: [], title: null, thumbnail: null, type: 'playlist', error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Adds a channel/playlist to the follow list. The current listing is recorded
 * as already-seen so following never triggers a back-catalogue download.
 */
export async function addFollow(url: string, presetId: string): Promise<FollowResult> {
  const lang = getSettings().language
  const clean = url.trim()
  if (!/^https?:\/\//i.test(clean)) return { ok: false, follow: null, error: translate(lang, 'follows.invalidUrl'), newVideos: [] }
  const list = await load()
  const existing = list.find((f) => f.url === clean)
  if (existing) return { ok: false, follow: existing, error: translate(lang, 'follows.alreadyFollowing'), newVideos: [] }

  const listing = await listVideos(clean)
  if (listing.error) return { ok: false, follow: null, error: listing.error, newVideos: [] }

  const follow: Follow = {
    id: randomUUID(),
    url: clean,
    title: listing.title ?? clean,
    thumbnail: listing.thumbnail,
    type: listing.type,
    seenIds: listing.videos.map((v) => v.id).slice(0, SEEN_LIMIT),
    presetId,
    autoDownload: true,
    lastCheckedAt: new Date().toISOString(),
    newCount: 0
  }
  list.push(follow)
  await persist()
  return { ok: true, follow, error: null, newVideos: [] }
}

/** Removes a follow by id. Returns the remaining list. */
export async function removeFollow(id: string): Promise<Follow[]> {
  const list = await load()
  const i = list.findIndex((f) => f.id === id)
  if (i !== -1) {
    list.splice(i, 1)
    await persist()
  }
  return listFollows()
}

/** Updates auto-download and/or preset for a follow. */
export async function updateFollow(id: string, patch: { autoDownload?: boolean; presetId?: string }): Promise<Follow[]> {
  const list = await load()
  const f = list.find((x) => x.id === id)
  if (f) {
    if (typeof patch.autoDownload === 'boolean') f.autoDownload = patch.autoDownload
    if (typeof patch.presetId === 'string' && patch.presetId) f.presetId = patch.presetId
    await persist()
  }
  return listFollows()
}

/** Clears the unacknowledged-new badge for a follow. */
export async function ackFollow(id: string): Promise<Follow[]> {
  const list = await load()
  const f = list.find((x) => x.id === id)
  if (f && f.newCount !== 0) {
    f.newCount = 0
    await persist()
  }
  return listFollows()
}

/**
 * Checks one follow for new videos. Records the new ids as seen, updates the
 * badge for notify-only follows and hands the videos to the registered
 * handler (queueing / notifications live in the main process).
 */
export async function checkFollow(id: string): Promise<FollowResult> {
  const list = await load()
  const f = list.find((x) => x.id === id)
  if (!f) return { ok: false, follow: null, error: null, newVideos: [] }

  const listing = await listVideos(f.url)
  if (listing.error) return { ok: false, follow: f, error: listing.error, newVideos: [] }

  if (listing.title) f.title = listing.title
  if (listing.thumbnail) f.thumbnail = listing.thumbnail

  const fresh = listing.videos.filter((v) => !f.seenIds.includes(v.id)).slice(0, NEW_LIMIT)
  f.lastCheckedAt = new Date().toISOString()
  if (fresh.length) {
    f.seenIds = [...fresh.map((v) => v.id), ...f.seenIds].slice(0, SEEN_LIMIT)
    if (!f.autoDownload) f.newCount += fresh.length
    await persist()
    if (onNewVideos) await onNewVideos(f, fresh)
  } else {
    await persist()
  }
  return { ok: true, follow: f, error: null, newVideos: fresh }
}

/** Checks every follow (used by the background scheduler). */
export async function checkAllFollows(): Promise<void> {
  const list = await listFollows()
  for (const f of list) {
    try {
      await checkFollow(f.id)
    } catch {
      // one failing follow must not stop the rest
    }
  }
}
