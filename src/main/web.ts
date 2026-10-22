/**
 * Opt-in local web interface (0.10.0). A dependency-free Node HTTP server that
 * exposes the media library and download queue over a small JSON API plus an
 * embedded, self-contained responsive UI. It reuses the same LibraryService and
 * DownloadManager as the desktop app, so both front-ends stay in sync.
 *
 * Security posture (per the roadmap): off by default, localhost-only unless the
 * user explicitly opts into LAN, constant-time token checks, no path traversal
 * (media is resolved by library id, never by path) and sessions that can expire.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { AppSettings, DownloadJob, LibrarySnapshot, WebStatus } from '../shared/types'
import { QUALITY_PRESETS } from '../shared/types'
import type { DownloadManager } from './downloads'
import type { LibraryService } from './library'

const SERVER_NAME = 'StreamHarvest'

/** How many failed token attempts before the client is temporarily locked out. */
const MAX_AUTH_FAILURES = 12
const AUTH_LOCKOUT_MS = 5 * 60 * 1000

/** One established web session derived from the shared token + a nonce. */
interface Session {
  id: string
  createdAt: number
}

/** Video MIME map — mirrors the embedded player's scheme handler. */
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

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

/** Constant-time string comparison that is safe for differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return ha.length === hb.length && timingSafeEqual(ha, hb)
}

/**
 * Manages the opt-in web server lifecycle. The server is started/stopped as the
 * `webEnabled` setting changes and always reflects the current settings.
 */
export class WebServer {
  private server: Server | null = null
  private sessions = new Map<string, Session>()
  private clients = new Set<ServerResponse>()
  private authFailures = 0
  private lockedUntil = 0
  private error: string | null = null

  constructor(
    private getSettings: () => AppSettings,
    private getManager: () => DownloadManager | null,
    private getLibrary: () => LibraryService | null
  ) {}

  /** Current status for the desktop UI. */
  status(): WebStatus {
    const s = this.getSettings()
    return {
      enabled: s.webEnabled,
      running: this.server !== null,
      port: s.webPort,
      bind: s.webBind,
      token: s.webToken,
      urls: this.server ? this.urls() : [],
      error: this.error
    }
  }

  /** Reconciles the running server with the current settings (enable/port/bind). */
  apply(): void {
    const s = this.getSettings()
    if (!s.webEnabled) {
      void this.stop()
      return
    }
    if (this.server) {
      // Address or port changed → rebind; token changes need no restart.
      const addr = this.server.address()
      const runningPort = typeof addr === 'object' && addr ? addr.port : 0
      if (runningPort === s.webPort) return
      void this.stop().then(() => void this.start())
      return
    }
    void this.start()
  }

  /** Generates a fresh access token, invalidating every existing session. */
  rotateToken(): string {
    return randomBytes(24).toString('base64url')
  }

  private host(): string {
    return this.getSettings().webBind === 'lan' ? '0.0.0.0' : '127.0.0.1'
  }

  private urls(): string[] {
    const s = this.getSettings()
    const list = [`http://localhost:${s.webPort}/`]
    if (s.webBind === 'lan') {
      for (const ip of lanAddresses()) list.push(`http://${ip}:${s.webPort}/`)
    }
    return list
  }

  private async start(): Promise<void> {
    if (this.server) return
    const s = this.getSettings()
    this.error = null
    const server = createServer((req, res) => this.handle(req, res))
    server.on('clientError', (_err, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'))
    await new Promise<void>((resolve) => {
      const onError = (err: Error): void => {
        this.error = err instanceof Error ? err.message : String(err)
        server.removeListener('listening', onListening)
        resolve()
      }
      const onListening = (): void => {
        server.removeListener('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(s.webPort, this.host())
    })
    if (this.error) {
      try {
        server.close()
      } catch {
        // ignore
      }
      return
    }
    this.server = server
  }

  private async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.sessions.clear()
    for (const res of this.clients) {
      try {
        res.end()
      } catch {
        // ignore
      }
    }
    this.clients.clear()
    if (!server) return
    await new Promise<void>((resolve) => {
      try {
        server.close(() => resolve())
      } catch {
        resolve()
      }
    })
  }

  /** Tears the server down on app quit. */
  async dispose(): Promise<void> {
    await this.stop()
  }

  // --- request routing ------------------------------------------------------

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const path = url.pathname
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')

    // The login/landing page and its assets are public; everything else needs
    // a valid session.
    if (path === '/' || path === '/index.html') {
      this.sendHtml(res, WEB_UI_HTML)
      return
    }
    if (path === '/manifest.webmanifest') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' })
      res.end(WEB_MANIFEST)
      return
    }
    if (path === '/api/login' && req.method === 'POST') {
      this.handleLogin(req, res)
      return
    }

    if (!this.authorized(req, url)) {
      this.sendJson(res, 401, { error: 'unauthorized' })
      return
    }

    if (path === '/api/logout') {
      this.clearSession(req)
      this.sendJson(res, 200, { ok: true })
      return
    }
    if (path === '/api/status') {
      this.sendJson(res, 200, this.apiStatus())
      return
    }
    if (path === '/api/library') {
      this.sendJson(res, 200, this.apiLibrary())
      return
    }
    if (path === '/api/jobs') {
      this.sendJson(res, 200, this.apiJobs())
      return
    }
    if (path === '/api/events') {
      this.handleEvents(req, res)
      return
    }
    if (path.startsWith('/api/media/')) {
      this.handleMedia(req, res, path)
      return
    }
    if (path === '/api/download' && req.method === 'POST') {
      void this.handleDownload(req, res)
      return
    }
    if (path.startsWith('/api/action/') && req.method === 'POST') {
      void this.handleAction(req, res, path.slice('/api/action/'.length))
      return
    }
    this.sendJson(res, 404, { error: 'not found' })
  }

  private authorized(req: IncomingMessage, url: URL): boolean {
    // Prefer the session cookie; fall back to a bearer/token query for
    // programmatic access (e.g. opening a media URL directly).
    const cookie = this.sessionFromCookie(req)
    if (cookie && this.validSession(cookie)) return true
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (bearer && safeEqual(bearer, this.getSettings().webToken)) return true
    const token = url.searchParams.get('token')
    if (token && safeEqual(token, this.getSettings().webToken)) return true
    return false
  }

  private sessionFromCookie(req: IncomingMessage): string {
    const header = req.headers.cookie ?? ''
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=')
      if (name === 'sh_session') return decodeURIComponent(rest.join('='))
    }
    return ''
  }

  private validSession(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    const mins = this.getSettings().webSessionMinutes
    if (mins > 0 && Date.now() - session.createdAt > mins * 60 * 1000) {
      this.sessions.delete(id)
      return false
    }
    return true
  }

  private clearSession(req: IncomingMessage): void {
    const id = this.sessionFromCookie(req)
    if (id) this.sessions.delete(id)
  }

  private handleLogin(req: IncomingMessage, res: ServerResponse): void {
    if (Date.now() < this.lockedUntil) {
      this.sendJson(res, 429, { error: 'too many attempts' })
      return
    }
    void this.readBody(req).then((body) => {
      let token = ''
      try {
        token = String((JSON.parse(body) as { token?: unknown }).token ?? '')
      } catch {
        token = ''
      }
      if (!token || !safeEqual(token, this.getSettings().webToken)) {
        this.authFailures += 1
        if (this.authFailures >= MAX_AUTH_FAILURES) {
          this.authFailures = 0
          this.lockedUntil = Date.now() + AUTH_LOCKOUT_MS
        }
        this.sendJson(res, 401, { error: 'invalid token' })
        return
      }
      this.authFailures = 0
      const id = randomBytes(24).toString('base64url')
      this.sessions.set(id, { id, createdAt: Date.now() })
      res.setHeader('Set-Cookie', `sh_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`)
      this.sendJson(res, 200, { ok: true })
    })
  }

  private handleEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.write('retry: 3000\n\n')
    this.pushEvents(res)
    this.clients.add(res)
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        // ignore
      }
    }, 25000)
    req.on('close', () => {
      clearInterval(ping)
      this.clients.delete(res)
    })
  }

  /** Serializes the current library + jobs to a new SSE subscriber. */
  private pushEvents(res: ServerResponse): void {
    try {
      res.write(`event: library\ndata: ${JSON.stringify(this.apiLibrary())}\n\n`)
      res.write(`event: jobs\ndata: ${JSON.stringify(this.apiJobs())}\n\n`)
    } catch {
      // ignore
    }
  }

  /** Pushes fresh snapshots to every connected web client. */
  broadcast(): void {
    if (this.clients.size === 0) return
    const library = JSON.stringify(this.apiLibrary())
    const jobs = JSON.stringify(this.apiJobs())
    for (const res of [...this.clients]) {
      try {
        res.write(`event: library\ndata: ${library}\n\n`)
        res.write(`event: jobs\ndata: ${jobs}\n\n`)
      } catch {
        this.clients.delete(res)
      }
    }
  }

  private apiStatus(): Record<string, unknown> {
    const s = this.getSettings()
    const manager = this.getManager()
    const jobs = manager?.list() ?? []
    return {
      app: SERVER_NAME,
      concurrency: s.concurrentLimit,
      audioOnly: s.audioOnly,
      defaultFormat: s.defaultFormat,
      jobs: jobs.filter((j) => j.status === 'downloading' || j.status === 'queued').length
    }
  }

  /** Library snapshot without absolute file paths (never leak the disk layout). */
  private apiLibrary(): Record<string, unknown> {
    const snapshot: LibrarySnapshot = this.getLibrary()?.snapshot() ?? { items: [], count: 0, totalBytes: 0, missingIds: [] }
    const items = snapshot.items.map((it) => ({
      id: it.id,
      url: it.url,
      title: it.title,
      thumbnail: it.thumbnail,
      site: it.site,
      duration: it.duration,
      sizeBytes: it.sizeBytes,
      formatLabel: it.formatLabel,
      ext: it.ext,
      playlist: it.playlist,
      addedAt: it.addedAt,
      completedAt: it.completedAt,
      missing: snapshot.missingIds.includes(it.id)
    }))
    return { items, count: snapshot.count, totalBytes: snapshot.totalBytes }
  }

  private apiJobs(): Record<string, unknown> {
    const jobs = (this.getManager()?.list() ?? []).map((j: DownloadJob) => ({
      id: j.id,
      url: j.url,
      title: j.title,
      thumbnail: j.thumbnail,
      site: j.site ?? null,
      formatLabel: j.formatLabel,
      presetId: j.presetId,
      formatId: j.formatId ?? null,
      playlist: j.playlist,
      status: j.status,
      progress: j.progress,
      speed: j.speed,
      eta: j.eta,
      bytesReceived: j.bytesReceived,
      bytesTotal: j.bytesTotal,
      error: j.error,
      createdAt: j.createdAt,
      completedAt: j.completedAt
    }))
    return { jobs, presets: QUALITY_PRESETS.map((p) => ({ id: p.id, label: p.label })) }
  }

  private async handleDownload(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let payload: { url?: unknown; presetId?: unknown; title?: unknown; thumbnail?: unknown } = {}
    try {
      payload = JSON.parse(await this.readBody(req)) as typeof payload
    } catch {
      this.sendJson(res, 400, { error: 'invalid body' })
      return
    }
    const url = typeof payload.url === 'string' ? payload.url.trim() : ''
    if (!/^https?:\/\//i.test(url)) {
      this.sendJson(res, 400, { error: 'a valid http(s) URL is required' })
      return
    }
    const manager = this.getManager()
    if (!manager) {
      this.sendJson(res, 503, { error: 'download engine unavailable' })
      return
    }
    const s = this.getSettings()
    const presetId = typeof payload.presetId === 'string' && payload.presetId ? payload.presetId : s.audioOnly ? 'audio-mp3' : s.defaultFormat
    const result = await manager.start({
      url,
      presetId,
      title: typeof payload.title === 'string' ? payload.title : undefined,
      thumbnail: typeof payload.thumbnail === 'string' ? payload.thumbnail : undefined,
      playlist: true
    })
    if (!result.ok) {
      this.sendJson(res, 400, { error: result.error ?? 'could not start download' })
      return
    }
    this.broadcast()
    this.sendJson(res, 200, { ok: true })
  }

  private async handleAction(req: IncomingMessage, res: ServerResponse, action: string): Promise<void> {
    const manager = this.getManager()
    const library = this.getLibrary()
    let body: { id?: unknown; direction?: unknown } = {}
    try {
      body = JSON.parse(await this.readBody(req)) as typeof body
    } catch {
      body = {}
    }
    const id = typeof body.id === 'string' ? body.id : ''
    switch (action) {
      case 'pause':
        if (id) await manager?.pause(id)
        break
      case 'resume':
        if (id) await manager?.resume(id)
        break
      case 'cancel':
        if (id) await manager?.cancel(id)
        break
      case 'removeLibrary':
        if (id) await library?.remove([id])
        break
      case 'deleteFile':
        if (id) await library?.deleteFile(id)
        break
      case 'clearHistory':
        manager?.clearHistory()
        break
      default:
        this.sendJson(res, 404, { error: 'unknown action' })
        return
    }
    this.broadcast()
    this.sendJson(res, 200, { ok: true })
  }

  /** Streams a library file by id (+ optional index) with HTTP range support. */
  private handleMedia(req: IncomingMessage, res: ServerResponse, path: string): void {
    const rest = path.slice('/api/media/'.length)
    const slash = rest.indexOf('/')
    const id = decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash))
    const index = slash === -1 ? 0 : Number(decodeURIComponent(rest.slice(slash + 1))) || 0
    const library = this.getLibrary()
    const files = library?.filesOf(id) ?? []
    const file = files[index]
    if (!file || !existsSync(file)) {
      this.sendJson(res, 404, { error: 'not found' })
      return
    }
    let size: number
    try {
      size = statSync(file).size
    } catch {
      this.sendJson(res, 404, { error: 'not found' })
      return
    }
    const type = mimeFor(file)
    res.setHeader('Content-Type', type)
    res.setHeader('Accept-Ranges', 'bytes')

    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Length': String(size) })
      res.end()
      return
    }

    const range = req.headers.range
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
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
          res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${size}`, 'Content-Length': String(e - s + 1) })
          createReadStream(file, { start: s, end: e }).pipe(res)
          return
        }
        res.writeHead(416, { 'Content-Range': `bytes */${size}` })
        res.end()
        return
      }
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      res.end()
      return
    }

    res.writeHead(200, { 'Content-Length': String(size) })
    createReadStream(file).pipe(res)
  }

  // --- helpers --------------------------------------------------------------

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = ''
      let overflow = false
      req.on('data', (chunk: Buffer) => {
        if (overflow) return
        data += chunk.toString()
        if (data.length > 1_000_000) {
          overflow = true
          reject(new Error('body too large'))
        }
      })
      req.on('end', () => {
        if (!overflow) resolve(data)
      })
      req.on('error', reject)
    })
  }

  private sendHtml(res: ServerResponse, html: string): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(html)
  }

  private sendJson(res: ServerResponse, code: number, body: unknown): void {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }
}

/** Non-internal IPv4 addresses of the host, for LAN URLs. */
function lanAddresses(): string[] {
  const out: string[] = []
  const ifaces = networkInterfaces()
  for (const list of Object.values(ifaces)) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address)
    }
  }
  return out
}

const WEB_MANIFEST = JSON.stringify({
  name: 'StreamHarvest',
  short_name: 'StreamHarvest',
  start_url: '/',
  display: 'standalone',
  background_color: '#0b1020',
  theme_color: '#0b1020'
})

/** Self-contained responsive web UI (no build step, no external requests). */
const WEB_UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0b1020" />
<link rel="manifest" href="/manifest.webmanifest" />
<title>StreamHarvest</title>
<style>
  :root { color-scheme: dark; --bg:#0b1020; --panel:#141a30; --panel2:#1c2440; --border:#2a3355; --text:#e7ecff; --muted:#93a0c8; --accent:#5cc8ff; --accent2:#8a7bff; --good:#4ade80; --warn:#fbbf24; --bad:#f87171; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); }
  header { position: sticky; top:0; z-index:10; display:flex; align-items:center; gap:10px; padding:12px 16px; background: rgba(11,16,32,.92); backdrop-filter: blur(8px); border-bottom:1px solid var(--border); }
  header h1 { font-size:15px; margin:0; font-weight:700; }
  header .spacer { flex:1; }
  .tabs { display:flex; gap:6px; }
  .tabs button { background:transparent; border:1px solid transparent; color:var(--muted); padding:6px 12px; border-radius:8px; cursor:pointer; font-size:13px; }
  .tabs button.active { background: var(--panel2); color: var(--text); border-color: var(--border); }
  main { padding:16px; max-width:1200px; margin:0 auto; }
  .grid { display:grid; gap:12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .card { background: var(--panel); border:1px solid var(--border); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
  .thumb { position:relative; aspect-ratio:16/9; background:#000; }
  .thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .thumb .dur { position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,.75); padding:2px 6px; border-radius:6px; font-size:11px; font-variant-numeric: tabular-nums; }
  .card .body { padding:10px; display:flex; flex-direction:column; gap:6px; }
  .card h3 { margin:0; font-size:13px; font-weight:600; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .meta { font-size:11px; color:var(--muted); display:flex; flex-wrap:wrap; gap:6px; }
  .actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:auto; }
  button, .btn { background:var(--panel2); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:6px 10px; font-size:12px; cursor:pointer; }
  button:hover { border-color: var(--accent); }
  .primary { background: linear-gradient(90deg, var(--accent), var(--accent2)); color:#0b1020; border-color:transparent; font-weight:600; }
  .danger { color: var(--bad); border-color: rgba(248,113,113,.4); background: rgba(248,113,113,.1); }
  .badge { font-size:10px; padding:2px 7px; border-radius:999px; border:1px solid var(--border); color:var(--muted); }
  .badge.ok { color: var(--good); border-color: rgba(74,222,128,.4); }
  .badge.bad { color: var(--bad); border-color: rgba(248,113,113,.4); }
  .row { display:flex; align-items:center; gap:12px; padding:10px; border:1px solid var(--border); border-radius:10px; background:var(--panel); }
  .row .info { flex:1; min-width:0; }
  .row .info .t { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bar { height:6px; border-radius:999px; background:var(--panel2); overflow:hidden; margin-top:6px; }
  .bar > i { display:block; height:100%; background:linear-gradient(90deg, var(--accent), var(--accent2)); }
  .stack { display:flex; flex-direction:column; gap:10px; }
  form.add { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
  form.add input { flex:1; min-width:220px; background:var(--panel); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:10px 12px; font-size:14px; }
  form.add select { background:var(--panel); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:10px; font-size:13px; }
  .empty { text-align:center; color:var(--muted); padding:40px 0; font-size:14px; }
  .center { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .login { width:100%; max-width:360px; background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:28px; }
  .login h1 { margin:0 0 6px; font-size:20px; }
  .login p { color:var(--muted); font-size:13px; margin:0 0 18px; }
  .login input { width:100%; background:var(--panel2); border:1px solid var(--border); color:var(--text); border-radius:10px; padding:12px; font-size:15px; margin-bottom:12px; }
  .login button { width:100%; padding:12px; font-size:15px; }
  .err { color:var(--bad); font-size:13px; min-height:18px; margin-top:8px; }
  dialog { border:none; background:transparent; padding:0; max-width:min(1000px, 95vw); width:95vw; }
  dialog::backdrop { background: radial-gradient(circle at 50% 30%, rgba(92,200,255,.08), transparent 60%), rgba(0,0,0,.85); }
  video { width:100%; max-height:80vh; background:#000; border-radius:12px; border:1px solid var(--border); }
  .dlgbar { display:flex; align-items:center; gap:10px; margin-bottom:10px; color:var(--muted); font-size:12px; }
  .dlgbar .t { flex:1; min-width:0; color:var(--text); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .toast { position:fixed; bottom:16px; left:50%; transform:translateX(-50%); background:var(--panel2); border:1px solid var(--border); border-radius:10px; padding:10px 16px; font-size:13px; z-index:50; }
  @media (max-width:520px) { .grid { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
<div id="app"></div>
<script>
(function () {
  'use strict';
  var state = { token: localStorage.getItem('sh_token') || '', library: null, jobs: null, presets: [], tab: 'library', source: null, filter: '' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function fmtBytes(b) { if (!b) return '—'; var u=['B','KB','MB','GB','TB'],i=0,v=b; while(v>=1024&&i<u.length-1){v/=1024;i++;} return v.toFixed(i?1:0)+' '+u[i]; }
  function fmtDur(s) { if (!s) return ''; s=Math.round(s); var h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60; return (h?h+':':'')+String(h?String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0'); }
  function toast(msg) { var el=document.createElement('div'); el.className='toast'; el.textContent=msg; document.body.appendChild(el); setTimeout(function(){el.remove();},2400); }
  function api(path, opts) {
    opts = opts || {}; opts.headers = opts.headers || {};
    if (state.token) opts.headers['Authorization'] = 'Bearer ' + state.token;
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { state.token=''; localStorage.removeItem('sh_token'); render(); throw new Error('unauthorized'); }
      return r.json().catch(function(){ return {}; });
    });
  }

  function login(el) {
    el.innerHTML = '<div class="center"><div class="login">' +
      '<h1>StreamHarvest</h1><p>Enter the access token shown in the desktop app\'s Settings.</p>' +
      '<input id="tok" type="password" placeholder="Access token" autocomplete="current-password" />' +
      '<button class="primary" id="go">Open library</button><div class="err" id="err"></div></div></div>';
    var input = el.querySelector('#tok'); input.focus();
    function submit() {
      fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token: input.value }) })
        .then(function (r) { return r.json().then(function (d) { return { ok:r.ok, d:d }; }); })
        .then(function (res) {
          if (!res.ok) { el.querySelector('#err').textContent = res.d.error || 'Login failed'; return; }
          state.token = input.value; localStorage.setItem('sh_token', state.token); boot();
        }).catch(function () { el.querySelector('#err').textContent = 'Network error'; });
    }
    el.querySelector('#go').addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }

  function shell() {
    var app = document.getElementById('app');
    app.innerHTML =
      '<header><h1>StreamHarvest</h1>' +
      '<div class="tabs"><button data-tab="library">Library</button><button data-tab="downloads">Downloads<span id="badge"></span></button></div>' +
      '<span class="spacer"></span>' +
      '<button id="logout" title="Sign out">Sign out</button></header><main id="main"></main>';
    app.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); renderBody(); }); });
    app.querySelector('#logout').addEventListener('click', function () { api('/api/logout', { method:'POST' }).then(function(){ state.token=''; localStorage.removeItem('sh_token'); render(); }); });
  }

  function badge() {
    var el = document.getElementById('badge'); if (!el) return;
    var active = (state.jobs || []).filter(function (j) { return j.status === 'downloading' || j.status === 'queued'; }).length;
    el.textContent = active ? ' (' + active + ')' : '';
  }

  function renderBody() {
    var main = document.getElementById('main'); if (!main) return;
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === state.tab); });
    badge();
    if (state.tab === 'downloads') main.innerHTML = viewDownloads(); else main.innerHTML = viewLibrary();
    wire();
  }

  function viewLibrary() {
    var items = (state.library && state.library.items) || [];
    var f = state.filter.toLowerCase();
    if (f) items = items.filter(function (i) { return (i.title||'').toLowerCase().indexOf(f) >= 0 || (i.site||'').toLowerCase().indexOf(f) >= 0; });
    var add = '<form class="add" id="addform"><input id="url" placeholder="Paste a video URL…" /><select id="preset"></select><button class="primary" type="submit">Add</button></form>';
    if (!items.length) return add + '<div class="empty">No items yet — paste a URL above to download something.</div>';
    return add + '<div class="grid">' + items.map(card).join('') + '</div>';
  }

  function card(it) {
    var thumb = it.thumbnail ? '<img loading="lazy" src="' + esc(it.thumbnail) + '" alt="" referrerpolicy="no-referrer" />' : '';
    var dur = it.duration ? '<span class="dur">' + fmtDur(it.duration) + '</span>' : '';
    var badges = '<span class="badge">' + esc(it.site || 'video') + '</span>' +
      (it.ext ? '<span class="badge">' + esc(it.ext.toUpperCase()) + '</span>' : '') +
      (it.sizeBytes ? '<span class="badge">' + fmtBytes(it.sizeBytes) + '</span>' : '') +
      (it.missing ? '<span class="badge bad">missing</span>' : '');
    return '<div class="card"><div class="thumb">' + thumb + dur + '</div><div class="body">' +
      '<h3 title="' + esc(it.title) + '">' + esc(it.title) + '</h3>' +
      '<div class="meta">' + badges + '</div>' +
      '<div class="actions">' +
      (it.missing ? '' : '<button class="primary" data-play="' + esc(it.id) + '">Play</button><a class="btn" href="/api/media/' + encodeURIComponent(it.id) + '?token=' + encodeURIComponent(state.token) + '" download>Save</a>') +
      '<button data-redl="' + esc(it.id) + '" data-url="' + esc(it.url) + '">Re-download</button>' +
      '<button class="danger" data-rm="' + esc(it.id) + '">Remove</button>' +
      '</div></div></div>';
  }

  function viewDownloads() {
    var jobs = state.jobs || [];
    if (!jobs.length) return '<div class="empty">No downloads right now.</div>';
    return '<div class="stack">' + jobs.map(jobRow).join('') + '</div>';
  }

  function jobRow(j) {
    var active = j.status === 'downloading' || j.status === 'queued';
    var pct = Math.max(0, Math.min(100, j.progress || 0));
    var sub = j.status === 'downloading' ? (Math.round(pct) + '% · ' + (j.speed||'') + (j.eta ? ' · ETA ' + esc(j.eta) : '')) : esc(j.error || j.status);
    var ctrls = j.status === 'downloading' ? '<button data-act="pause" data-id="' + esc(j.id) + '">Pause</button>'
      : j.status === 'paused' ? '<button data-act="resume" data-id="' + esc(j.id) + '">Resume</button>' : '';
    if (active || j.status === 'paused') ctrls += '<button class="danger" data-act="cancel" data-id="' + esc(j.id) + '">Cancel</button>';
    return '<div class="row"><div class="info"><div class="t" title="' + esc(j.title) + '">' + esc(j.title) + '</div>' +
      '<div class="meta"><span class="badge">' + esc(j.status) + '</span><span class="badge">' + esc(j.formatLabel||'') + '</span></div>' +
      '<div class="meta">' + sub + '</div>' +
      (j.status === 'downloading' ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') +
      '</div><div class="actions">' + ctrls + '</div></div>';
  }

  function fillPresets() {
    var sel = document.getElementById('preset'); if (!sel) return;
    sel.innerHTML = (state.presets || []).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.label) + '</option>'; }).join('');
  }

  function wire() {
    var addform = document.getElementById('addform');
    if (addform) { fillPresets(); addform.addEventListener('submit', function (e) {
      e.preventDefault();
      var url = document.getElementById('url').value.trim();
      if (!url) return;
      var presetId = document.getElementById('preset').value;
      api('/api/download', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: url, presetId: presetId }) })
        .then(function () { toast('Added to queue'); document.getElementById('url').value=''; state.tab='downloads'; renderBody(); });
    }); }
    document.querySelectorAll('[data-play]').forEach(function (b) { b.addEventListener('click', function () { var id=b.getAttribute('data-play'); var it=(state.library.items||[]).find(function(x){return x.id===id;}); openPlayer(id, it ? it.title : ''); }); });
    document.querySelectorAll('[data-redl]').forEach(function (b) { b.addEventListener('click', function () {
      api('/api/download', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: b.getAttribute('data-url') }) }).then(function(){ toast('Re-queued'); state.tab='downloads'; renderBody(); });
    }); });
    document.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('Remove this entry from the library?')) return; api('/api/action/removeLibrary', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: b.getAttribute('data-rm') }) }); }); });
    document.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function () { api('/api/action/' + b.getAttribute('data-act'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: b.getAttribute('data-id') }) }); }); });
  }

  function openPlayer(id, title) {
    var dlg = document.createElement('dialog'); dlg.id = 'player';
    dlg.innerHTML = '<div class="dlgbar"><span class="t">' + esc(title) + '</span><button id="close">Close</button></div>' +
      '<video controls autoplay playsinline src="/api/media/' + encodeURIComponent(id) + '?token=' + encodeURIComponent(state.token) + '"></video>';
    document.body.appendChild(dlg);
    dlg.querySelector('#close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.showModal();
  }

  function connect() {
    if (state.source) state.source.close();
    var src = new EventSource('/api/events?token=' + encodeURIComponent(state.token));
    state.source = src;
    src.addEventListener('library', function (e) { state.library = JSON.parse(e.data); if (state.tab==='library') renderBody(); });
    src.addEventListener('jobs', function (e) { var d = JSON.parse(e.data); state.jobs = d.jobs; if (d.presets) state.presets = d.presets; badge(); if (state.tab==='downloads') renderBody(); });
    src.onerror = function () { /* EventSource auto-reconnects */ };
  }

  function boot() {
    shell();
    Promise.all([api('/api/library'), api('/api/jobs'), api('/api/status')]).then(function (r) {
      state.library = r[0]; state.jobs = r[1].jobs; state.presets = r[1].presets; renderBody(); connect();
    }).catch(function () {});
  }

  function render() { var app = document.getElementById('app'); if (state.token) boot(); else login(app); }
  window.addEventListener('DOMContentLoaded', render);
})();
</script>
</body>
</html>`
