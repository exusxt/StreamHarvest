// GitHub Releases lookup for the main process: resolves the app's own latest
// release through the github.com web endpoints (no API rate limit) and builds
// the portable download URL from the known asset name. Used by the portable
// updater, which cannot rely on electron-updater.

import * as https from 'node:https'

// GitHub rejects unauthenticated requests without a User-Agent header.
const USER_AGENT = 'streamharvest'
const GITHUB_WEB = 'https://github.com'

/** App's own GitHub repository, owner/repo. */
const APP_REPO = 'exusxt/StreamHarvest'

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

// Follows redirects and returns the final URL of a successful HEAD request, or
// null when the target is not reachable. Used against the github.com web
// endpoints, which are not subject to the API rate limit.
function webHeadRedirect(url: string, redirectsLeft = 5): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: 'HEAD', headers: { 'User-Agent': USER_AGENT } },
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
          webHeadRedirect(next, redirectsLeft - 1).then(resolve, reject)
          return
        }
        res.resume()
        resolve(res.statusCode === 200 ? url : null)
      }
    )
    req.on('error', reject)
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
 * Resolves the app's own latest release through the github.com web endpoints
 * (no API rate limit): the latest tag comes from the /releases/latest redirect,
 * and the portable download URL is built from the known asset name.
 */
export async function getAppLatestRelease(): Promise<AppUpdateInfo> {
  const tag = await webLatestTag(APP_REPO)
  if (!tag) throw new Error('Unable to check for updates')
  const version = tag.replace(/^v/i, '')
  // Portable builds are named StreamHarvest-<version>-<arch>.exe; the URL is
  // constructed rather than parsed from the asset list so this check stays a
  // cheap web lookup with no API access.
  const name = `StreamHarvest-${version}-${process.arch}.exe`
  const [owner, repo] = APP_REPO.split('/')
  const downloadUrl = `${GITHUB_WEB}/${owner}/${repo}/releases/latest/download/${name}`
  return {
    version,
    assets: [{ name, size: 0, browser_download_url: downloadUrl }]
  }
}
