/** Builds a yt-dlp `--playlist-items` value from a set of 1-based indices,
 * compressing consecutive runs into ranges (e.g. {1,2,3,5} -> "1-3,5"). */
export function buildPlaylistItems(sel: Set<number>): string {
  const nums = [...sel].sort((a, b) => a - b)
  const parts: string[] = []
  if (nums.length === 0) return ''
  let start = nums[0]
  let prev = nums[0]
  for (let i = 1; i <= nums.length; i++) {
    const cur = nums[i]
    if (cur === prev + 1) {
      prev = cur
      continue
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`)
    start = cur
    prev = cur
  }
  return parts.join(',')
}
