// GitHub Releases lookup for the main process: resolves the app's own latest
// release and builds the portable download URL. The live check tries the GitHub
// API first (it returns the real asset list), falls back to the github.com web
// /releases/latest redirect, and finally to the last known result cached on
// disk so a transient network failure never surfaces as a hard error.

import * as https from 'node:https'
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { httpGet } from './ytdlp'

// GitHub rejects unauthenticated requests without a User-Agent header.
const USER_AGENT = 'streamharvest'
const GITHUB_WEB = 'https://github.com'
const GITHUB_API = 'https://api.github.com'

/** App's own GitHub repository, owner/repo. */
const APP_REPO = 'exusxt/StreamHarvest'

// A successful check is cached for 30 minutes so repeated launches do not
// re-hit GitHub; the cached copy is also used as a fallback when a live check
// fails on a flaky network.
const CACHE_TTL_MS = 30 * 60 * 1000

/** One release asset, as surfaced to the portable updater. */
export interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}

/** App-version plus the release assets available for download. */
export interface AppUpdateInfo {
  version: string
  assets: ReleaseAsset[]
}

interface UpdateCache {
  version: string
  downloadUrl: string
  at: number
}

function cacheFile(): string {
  return join(app.getPath('userData'), 'app-update-cache.json')
}

function readCache(): UpdateCache | null {
  try {
    if (!existsSync(cacheFile())) return null
    const c = JSON.parse(readFileSync(cacheFile(), 'utf-8')) as Partial<UpdateCache>
    if (!c || typeof c.version !== 'string' || typeof c.downloadUrl !== 'string') return null
    return { version: c.version, downloadUrl: c.downloadUrl, at: typeof c.at === 'number' ? c.at : 0 }
  } catch {
    return null
  }
}

function writeCache(version: string, downloadUrl: string): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(cacheFile(), JSON.stringify({ version, downloadUrl, at: Date.now() }), 'utf-8')
  } catch {
    // best-effort only
  }
}

function portableAssetName(version: string): string {
  return `StreamHarvest-${version}-${process.arch}.exe`
}

// Follows redirects and returns the final URL of a successful HEAD request, or
// null when the target is not reachable. Used against the github.com web
// endpoints, which are not subject to the API rate limit.
function webHeadRedirect(url: string, redirectsLeft = 5, attemptsLeft = 3): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
        ...(attemptsLeft < 3 ? { family: 4 } : {})
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume()
          const next = new URL(res.headers.location, url).toString()
          webHeadRedirect(next, redirectsLeft - 1, attemptsLeft).then(resolve, reject)
          return
        }
        res.resume()
        resolve(res.statusCode === 200 ? url : null)
      }
    )
    req.on('error', (e) => {
      if (attemptsLeft > 1) {
        setTimeout(() => webHeadRedirect(url, redirectsLeft, attemptsLeft - 1).then(resolve, reject), 1000)
      } else {
        reject(e)
      }
    })
    req.setTimeout(30000, () => req.destroy(new Error('Request timed out')))
    req.end()
  })
}

// Resolves the version tag behind a github.com /releases/latest redirect (e.g.
// .../tag/v1.2.3). Unlike the API this web endpoint has no rate limit, and no
// per-asset data is needed — just the tag.
async function webLatestTag(ownerRepo: string): Promise<string | null> {
  const [owner, repo] = ownerRepo.split('/')
  const finalUrl = await webHeadRedirect(`${GITHUB_WEB}/${owner}/${repo}/releases/latest`)
  if (!finalUrl) return null
  const match = finalUrl.match(/\/releases\/tag\/([^/?#]+)$/)
  return match ? match[1] : null
}

/**
 * Resolves the app's own latest release. Tries the GitHub API first (it returns
 * the real asset list with verified download URLs), falls back to the
 * github.com /releases/latest redirect, then to the last cached result so a
 * flaky network does not turn into a hard "update failed" error.
 */
export async function getAppLatestRelease(): Promise<AppUpdateInfo> {
  const stale = readCache()
  if (stale && Date.now() - stale.at < CACHE_TTL_MS) {
    const name = portableAssetName(stale.version)
    return { version: stale.version, assets: [{ name, size: 0, browser_download_url: stale.downloadUrl }] }
  }

  // 1) GitHub API: real asset names, sizes and download URLs.
  try {
    const body = await httpGet(`${GITHUB_API}/repos/${APP_REPO}/releases/latest`, {
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.github+json'
    })
    const rel = JSON.parse(body) as { tag_name?: string; assets?: ReleaseAsset[] }
    const version = (rel.tag_name ?? '').replace(/^v/i, '')
    if (version) {
      const name = portableAssetName(version)
      const asset = (rel.assets ?? []).find((a) => a.name === name)
      if (asset?.browser_download_url) {
        writeCache(version, asset.browser_download_url)
        return { version, assets: [asset] }
      }
      const downloadUrl = `${GITHUB_WEB}/${APP_REPO}/releases/latest/download/${name}`
      writeCache(version, downloadUrl)
      return { version, assets: [{ name, size: 0, browser_download_url: downloadUrl }] }
    }
  } catch {
    // fall through to the web lookup below
  }

  // 2) github.com web redirect (no API rate limit).
  try {
    const tag = await webLatestTag(APP_REPO)
    if (tag) {
      const version = tag.replace(/^v/i, '')
      const name = portableAssetName(version)
      const downloadUrl = `${GITHUB_WEB}/${APP_REPO}/releases/latest/download/${name}`
      writeCache(version, downloadUrl)
      return { version, assets: [{ name, size: 0, browser_download_url: downloadUrl }] }
    }
  } catch {
    // fall through to the cache below
  }

  // 3) Last known good result (even if stale) instead of a hard failure.
  if (stale) {
    const name = portableAssetName(stale.version)
    return { version: stale.version, assets: [{ name, size: 0, browser_download_url: stale.downloadUrl }] }
  }
  throw new Error('Unable to check for updates')
}