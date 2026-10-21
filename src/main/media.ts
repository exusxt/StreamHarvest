/**
 * Embedded player transport (0.9.2). Serves library files through a privileged
 * custom scheme with proper HTTP range support so the <video> element can
 * seek reliably.
 */

import { createReadStream, statSync } from 'node:fs'
import { extname } from 'node:path'
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

function contentType(path: string): string {
  return MIME[extname(path).replace(/^\./, '').toLowerCase()] ?? 'application/octet-stream'
}

function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
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

/** Serves `streamharvest-media://item/<library id>` with range support. */
export function registerMediaProtocol(getLibrary: () => LibraryService | null): void {
  protocol.registerStreamProtocol(MEDIA_SCHEME, (request, callback) => {
    let id: string
    try {
      id = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
    } catch {
      callback({ statusCode: 400 })
      return
    }
    const path = getLibrary()?.fileOf(id)
    if (!path) {
      callback({ statusCode: 404 })
      return
    }

    let size: number
    let type: string
    try {
      const stat = statSync(path)
      size = stat.size
      type = contentType(path)
    } catch {
      callback({ statusCode: 404 })
      return
    }

    if (request.method === 'HEAD') {
      callback({
        statusCode: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes'
        }
      })
      return
    }

    const range = parseRange(request.headers.Range as string | undefined, size)
    if (range === 'invalid') {
      callback({
        statusCode: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      })
      return
    }
    if (range) {
      callback({
        statusCode: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(range.end - range.start + 1),
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          'Accept-Ranges': 'bytes'
        },
        data: createReadStream(path, { start: range.start, end: range.end })
      })
      return
    }

    callback({
      statusCode: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes'
      },
      data: createReadStream(path)
    })
  })
}
