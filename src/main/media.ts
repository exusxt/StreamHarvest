import { protocol } from 'electron'
import { MEDIA_SCHEME } from '../shared/media'
import type { LibraryService } from './library'

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

/** Serves `streamharvest-media://item/<library id>` or `streamharvest-media://item/<library id>/<index>` with range support. */
export function registerMediaProtocol(getLibrary: () => LibraryService | null): void {
  protocol.registerStreamProtocol(MEDIA_SCHEME, (request, callback) => {
    let id: string
    let index = 0
    try {
      const url = new URL(request.url)
      const parts = url.pathname.replace(/^\/+/, '').split('/')
      id = decodeURIComponent(parts[0] ?? '')
      if (parts[1]) index = Number(parts[1]) || 0
    } catch {
      callback({ statusCode: 400 })
      return
    }
    const files = getLibrary()?.filesOf ? getLibrary()!.filesOf(id) : []
    const path = files[index] ?? getLibrary()?.fileOf(id)
    if (!path) {
      callback({ statusCode: 404 })
      return
    }

    let size: number
    let type: string
    try {
      const stat = require('fs').statSync(path)
      size = stat.size
      const ext = require('path').extname(path).replace(/^\./, '').toLowerCase()
      const mime: Record<string, string> = {
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
      type = mime[ext] ?? 'application/octet-stream'
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

    const header = request.headers.Range as string | undefined
    if (header) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
      if (match && !(match[1] === '' && match[2] === '')) {
        let start = match[1] === '' ? null : Number(match[1])
        let end = match[2] === '' ? null : Number(match[2])
        if (start === null) {
          start = Math.max(0, size - (end ?? 0))
          end = size - 1
        } else if (end === null) {
          end = size - 1
        }
        if (start !== null && end !== null && Number.isFinite(start) && Number.isFinite(end) && start <= end && start < size) {
          const s = start
          const e = Math.min(end, size - 1)
          callback({
            statusCode: 206,
            headers: {
              'Content-Type': type,
              'Content-Length': String(e - s + 1),
              'Content-Range': `bytes ${s}-${e}/${size}`,
              'Accept-Ranges': 'bytes'
            },
            data: require('fs').createReadStream(path, { start: s, end: e })
          })
          return
        }
        callback({ statusCode: 416, headers: { 'Content-Range': `bytes */${size}` } })
        return
      }
      callback({ statusCode: 416, headers: { 'Content-Range': `bytes */${size}` } })
      return
    }

    callback({
      statusCode: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes'
      },
      data: require('fs').createReadStream(path)
    })
  })
}
