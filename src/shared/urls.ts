/** Shared helpers for extracting URLs from pasted/dropped text or filenames. */

const URL_RE = /https?:\/\/[^\s<>"']+/g

/** Pulls unique http(s) URLs out of free text (one or more per line). */
export function extractUrls(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    for (const m of line.matchAll(URL_RE)) {
      const url = m[0].replace(/[)\]}>]+$/, '')
      if (!seen.has(url)) {
        seen.add(url)
        out.push(url)
      }
    }
  }
  return out
}
