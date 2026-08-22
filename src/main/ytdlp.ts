// yt-dlp binary management: locating the engine, checking its version and
// downloading/updating it from the official GitHub release. The binary is
// stored persistently under userData\yt-dlp so it survives portable re-extracts
// and stays writable under Program Files.

import { app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import * as http from 'node:http'
import * as https from 'node:https'
import { createWriteStream } from 'node:fs'
import type { BinaryProgress, YtDlpStatus } from '../shared/types'

/** Folder-relative name of the binary on each platform. */
export function ytDlpExeName(): string {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
}

/**
 * GitHub release asset name of the standalone binary for this OS + arch.
 * yt-dlp publishes prebuilt executables per platform (the generic `yt-dlp`
 * zipapp is a last resort since it needs a Python interpreter).
 */
function downloadAssetName(): string {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'win32') return arch === 'arm64' ? 'yt-dlp_arm64.exe' : 'yt-dlp.exe'
  if (platform === 'darwin') return 'yt-dlp_macos' // universal (x64 + arm64)
  if (platform === 'linux') return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'
  return 'yt-dlp' // generic zipimport binary, needs Python
}

/** Persistent storage folder for the downloaded binary. */
export function ytDlpStoreDir(): string {
  return join(app.getPath('userData'), 'yt-dlp')
}

/** Absolute path of the binary we manage ourselves. */
export function ytDlpBinaryPath(): string {
  return join(ytDlpStoreDir(), ytDlpExeName())
}

/** Absolute path to the yt-dlp binary that should be used, or null. */
export function ytDlpPath(): string | null {
  const store = ytDlpBinaryPath()
  if (existsSync(store)) return store
  return null
}

/** Runs `yt-dlp --version` and resolves the version string, or null. */
export async function ytDlpVersion(bin: string): Promise<string | null> {
  try {
    const out = await runCapture(bin, ['--version'])
    const first = out.stdout.split('\n').find((l) => l.trim().length > 0)
    return first?.trim() ?? null
  } catch {
    return null
  }
}

/** Resolves the tag of the latest yt-dlp GitHub release (e.g. 2026.01.15). */
export async function latestReleaseTag(): Promise<string | null> {
  try {
    const body = await httpGet('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', { 'User-Agent': 'streamharvest' })
    const data = JSON.parse(body) as { tag_name?: string }
    return data.tag_name ?? null
  } catch {
    return null
  }
}

/** Latest downloadable binary URL (redirects to the actual asset). */
function latestBinaryUrl(): string {
  return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${downloadAssetName()}`
}

/**
 * Downloads the latest yt-dlp binary into the persistent store. onProgress
 * streams byte counts; onStatus reports phase changes. Resolves with the
 * installed path.
 */
export async function downloadYtDlp(
  onProgress: (p: BinaryProgress) => void,
  onStatus: (message: string) => void
): Promise<string> {
  const destDir = ytDlpStoreDir()
  const dest = ytDlpBinaryPath()
  await mkdir(destDir, { recursive: true })

  onStatus('Downloading yt-dlp…')
  const tmp = `${dest}.part`
  await downloadToFile(latestBinaryUrl(), tmp, {
    headers: { 'User-Agent': 'streamharvest' },
    onProgress
  })
  await rename(tmp, dest)
  if (process.platform !== 'win32') {
    // HTTP downloads don't preserve the execute bit on unix-like systems.
    try {
      const { chmod } = await import('node:fs/promises')
      await chmod(dest, 0o755)
    } catch {
      // best-effort
    }
  }
  onStatus('Installed — checking version…')
  const version = await ytDlpVersion(dest)
  onStatus(version ? `yt-dlp ${version} ready` : 'yt-dlp installed')
  return dest
}

/** Removes the managed binary (used before reinstalling). */
export async function removeYtDlp(): Promise<void> {
  const dest = ytDlpBinaryPath()
  try {
    await rm(dest, { force: true })
    await rm(`${dest}.part`, { force: true })
  } catch {
    // best-effort
  }
}

/** Builds a YtDlpStatus snapshot for the renderer. */
export async function ytDlpStatus(): Promise<YtDlpStatus> {
  const bin = ytDlpPath()
  if (!bin) return { present: false, version: null, busy: false, message: null }
  return { present: true, version: await ytDlpVersion(bin), busy: false, message: null }
}

/** True when a usable ffmpeg is on PATH (needed for merging + audio convert). */
export async function ffmpegPresent(): Promise<boolean> {
  try {
    await runCapture('ffmpeg', ['-version'], 8000)
    return true
  } catch {
    return false
  }
}

const MAX_REDIRECTS = 10
const MAX_ATTEMPTS = 4
const RETRY_DELAY_MS = 1000

/** Errors that are worth retrying once. The transfer is resumed, not restarted. */
export function isRetryable(err: Error): boolean {
  const m = err.message
  return (
    m.includes('aborted') ||
    m.includes('premature close') ||
    m.includes('ECONNRESET') ||
    m.includes('socket hang up') ||
    m.includes('ETIMEDOUT') ||
    m.includes('ECONNREFUSED') ||
    m.includes('EAI_AGAIN') ||
    m.includes('ENOTFOUND') ||
    m.includes('EPIPE') ||
    m.includes('request timed out')
  )
}

/** GET that follows redirects and resolves with the final response. */
function requestOnce(url: string, headers: Record<string, string>, family: number | undefined, redirects: number): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http
    const opts: http.RequestOptions = { headers, ...(family ? { family } : {}) }
    const req = mod.get(url, opts, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        if (redirects <= 0) {
          reject(new Error('Too many redirects'))
          return
        }
        resolve(requestOnce(new URL(res.headers.location, url).toString(), headers, family, redirects - 1))
        return
      }
      resolve(res)
    })
    req.on('error', reject)
    req.setTimeout(60000, () => req.destroy(new Error('Request timed out')))
  })
}

/** Downloads a URL to a file with progress callbacks, following redirects. */
export function downloadToFile(
  url: string,
  destPath: string,
  opts: { onProgress?: (p: BinaryProgress) => void; headers?: Record<string, string> }
): Promise<void> {
  const baseHeaders: Record<string, string> = { Accept: '*/*', ...(opts.headers ?? {}) }
  return new Promise((resolve, reject) => {
    let attempt = 0
    // Bytes already persisted to disk; the next attempt resumes from here.
    let resumeFrom = 0

    const run = (): void => {
      const headers = { ...baseHeaders }
      if (resumeFrom > 0) headers['Range'] = `bytes=${resumeFrom}-`
      // Broken IPv6 routes can reset connections; retries fall back to IPv4.
      const family = attempt > 0 ? 4 : undefined
      requestOnce(url, headers, family, MAX_REDIRECTS)
        .then((res) => {
          const status = res.statusCode ?? 0
          if (status === 416) {
            // Range not satisfiable: the file is already complete.
            res.resume()
            resolve()
            return
          }
          if (status >= 400) {
            res.resume()
            reject(new Error(`HTTP ${status} for ${url}`))
            return
          }
          const partial = status === 206
          const chunkTotal = Number(res.headers['content-length'] ?? 0)
          const total = partial ? resumeFrom + chunkTotal : chunkTotal
          return mkdir(dirname(destPath), { recursive: true })
            .then(
              () =>
                new Promise<void>((done, fail) => {
                  const stream = createWriteStream(destPath, { flags: partial ? 'a' : 'w' })
                  let settled = false
                  let resEnded = false
                  const failWith = (e: Error): void => {
                    if (settled) return
                    settled = true
                    resumeFrom = stream.bytesWritten
                    stream.destroy()
                    res.destroy()
                    fail(e)
                  }
                  const doneOnce = (): void => {
                    if (settled) return
                    settled = true
                    resumeFrom = 0
                    done()
                  }
                  res.on('data', (c: Buffer) => {
                    opts.onProgress?.({ received: (partial ? resumeFrom : 0) + stream.bytesWritten + c.length, total })
                  })
                  res.on('end', () => {
                    resEnded = true
                  })
                  res.pipe(stream)
                  stream.on('finish', doneOnce)
                  stream.on('error', failWith)
                  res.on('error', failWith)
                  res.on('close', () => {
                    // Connection closed before the body ended (socket hang up).
                    if (!resEnded) failWith(new Error('socket hang up'))
                  })
                })
            )
            .then(() => resolve())
        })
        .catch((e) => {
          attempt++
          if (attempt < MAX_ATTEMPTS && isRetryable(e)) {
            setTimeout(run, RETRY_DELAY_MS * attempt)
          } else {
            reject(e)
          }
        })
    }
    run()
  })
}

/** Simple GET returning the response body as a string. */
export function httpGet(url: string, headers: Record<string, string>, attempts = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const tryOnce = (left: number, family?: number): void => {
      const mod = url.startsWith('https:') ? https : http
      const opts: http.RequestOptions = { headers, ...(family ? { family } : {}) }
      const req = mod.get(url, opts, (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          httpGet(new URL(res.headers.location, url).toString(), headers, attempts).then(resolve, reject)
          return
        }
        if (status >= 400) {
          res.resume()
          reject(new Error(`HTTP ${status} for ${url}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        res.on('error', (e) => {
          if (left > 1 && isRetryable(e)) setTimeout(() => tryOnce(left - 1, 4), RETRY_DELAY_MS)
          else reject(e)
        })
      })
      req.on('error', (e) => {
        if (left > 1 && isRetryable(e)) setTimeout(() => tryOnce(left - 1, 4), RETRY_DELAY_MS)
        else reject(e)
      })
      req.setTimeout(30000, () => req.destroy(new Error('Request timed out')))
    }
    tryOnce(attempts)
  })
}

/** Spawns a command, collects stdout/stderr and resolves once it exits. */
export function runCapture(cmd: string, args: string[], timeoutMs = 30000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child
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
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim() || stdout.trim()}`))
    })
  })
}
