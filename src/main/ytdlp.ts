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
  const name = ytDlpExeName()
  return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${name}`
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

/** Downloads a URL to a file with progress callbacks, following redirects. */
export function downloadToFile(
  url: string,
  destPath: string,
  opts: { onProgress?: (p: BinaryProgress) => void; headers?: Record<string, string> }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Accept: '*/*', ...(opts.headers ?? {}) }
    const get = (u: string, redirects: number): void => {
      const mod = u.startsWith('https:') ? https : http
      const req = mod.get(u, { headers }, (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          if (redirects <= 0) {
            reject(new Error('Too many redirects'))
            return
          }
          get(new URL(res.headers.location, u).toString(), redirects - 1)
          return
        }
        if (status >= 400) {
          res.resume()
          reject(new Error(`HTTP ${status} for ${u}`))
          return
        }
        const total = Number(res.headers['content-length'] ?? 0)
        let received = 0
        void mkdir(dirname(destPath), { recursive: true })
          .then(() => {
            const stream = createWriteStream(destPath)
            res.on('data', (chunk: Buffer) => {
              received += chunk.length
              opts.onProgress?.({ received, total })
            })
            res.pipe(stream)
            stream.on('finish', () => resolve())
            stream.on('error', reject)
            res.on('error', reject)
          })
          .catch(reject)
      })
      req.on('error', reject)
      req.setTimeout(60000, () => req.destroy(new Error('Request timed out')))
    }
    get(url, MAX_REDIRECTS)
  })
}

/** Simple GET returning the response body as a string. */
export function httpGet(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http
    const req = mod.get(url, { headers }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        httpGet(new URL(res.headers.location, url).toString(), headers).then(resolve, reject)
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
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('Request timed out')))
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
