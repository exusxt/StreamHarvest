/**
 * Embedded player transport (0.9.1). Library files are served to the renderer
 * through a privileged custom scheme by proxying to the local file URL via
 * Electron's net.fetch, preserving Range requests for seeking.
 */

import { net } from 'electron'
import { pathToFileURL } from 'node:url'
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

    try {
      const headers = new Headers()
      const range = request.headers.get('Range')
      if (range) headers.set('Range', range)
      const resp = await net.fetch(pathToFileURL(path).href, {
        headers,
        bypassCustomProtocolHandlers: true
      })
      if (request.method === 'HEAD') {
        const h = new Headers(resp.headers)
        return new Response(null, { status: resp.status, headers: h })
      }
      return resp
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
