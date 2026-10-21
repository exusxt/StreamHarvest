/**
 * Embedded player transport (0.9.1). Library files are served to the renderer
 * through a privileged custom scheme with HTTP range support, so the <video>
 * element can seek without handing the renderer direct filesystem access.
 */

import { createReadStream, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { MEDIA_SCHEME } from '../shared/media'
import type { LibraryService } from './library'

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  wav: 'audio/wav'
}

type ByteRange = { start: number; end: number } | 'invalid' | null

function contentType(path: string): string {
  return MIME[extname(path).replace(/^\./, '').toLowerCase()] ?? 'application/octet-stream'
}

/** Parses a single-range `Range` header against the file size. */
function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid'
  let start = match[1] === '' ? null : Number(match[1])
  let end = match[2] === '' ? null : Number(match[2])
  if (start === null) {
    const suffix = end ?? 0
    start = Math.max(0, size - suffix)
    end = size - 1
  } else if (end === null) {
    end = size - 1
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'invalid'
  return { start, end: Math.min(end, size - 1) }
}

function headersFor(type: string, size: number, range?: { start: number; end: number }): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  }
  if (range) {
    headers['Content-Length'] = String(range.end - range.start + 1)
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
  } else {
    headers['Content-Length'] = String(size)
  }
  return headers
}

/** Must run before the app is ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

/** Serves `streamharvest-media://item/<library id>` to the embedded player. */
export function registerMediaProtocol(getLibrary: () => LibraryService | null): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    let id: string
    try {
      id = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    const path = getLibrary()?.fileOf(id)
    if (!path) return new Response('Not found', { status: 404 })

    let size: number
    try {
      size = statSync(path).size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const type = contentType(path)
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers: headersFor(type, size) })
    }

    const range = parseRange(request.headers.get('Range'), size)
    if (range === 'invalid') {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    if (range) {
      const stream = createReadStream(path, { start: range.start, end: range.end })
      return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
        status: 206,
        headers: headersFor(type, size, range)
      })
    }
    const stream = createReadStream(path)
    return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
      status: 200,
      headers: headersFor(type, size)
    })
  })
}
