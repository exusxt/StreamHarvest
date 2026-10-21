/**
 * Custom URL scheme used by the embedded player (0.9.1). The main process
 * streams library files through this privileged scheme so the renderer can
 * play local media without exposing arbitrary file paths or disabling the
 * renderer sandbox.
 */

export const MEDIA_SCHEME = 'streamharvest-media'

/** `streamharvest-media://item/<id>` for a library entry id. */
export function mediaUrlFor(id: string): string {
  return `${MEDIA_SCHEME}://item/${encodeURIComponent(id)}`
}
