/**
 * Custom URL scheme used by the embedded player (0.9.1). The main process
 * streams library files through this privileged scheme.
 */

export const MEDIA_SCHEME = 'streamharvest-media'

/** `streamharvest-media://item/<id>` for a library entry id. */
export function mediaUrlFor(id: string, index = 0): string {
  if (index === 0) return `${MEDIA_SCHEME}://item/${encodeURIComponent(id)}`
  return `${MEDIA_SCHEME}://item/${encodeURIComponent(id)}/${index}`
}
