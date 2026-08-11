// Clipboard monitor: polls the system clipboard and surfaces http(s) links so
// the renderer can offer to download them without pasting.

import { clipboard } from 'electron'
import type { AppSettings } from '../shared/types'

const POLL_MS = 2000
const SEEN_LIMIT = 80

/** Matches the first http(s) URL in a line, tolerating surrounding text. */
const URL_RE = /https?:\/\/[^\s<>"']+/

export class ClipboardMonitor {
  private timer: NodeJS.Timeout | null = null
  private lastText = ''
  private lastUrl = ''
  private seen = new Set<string>()

  constructor(
    private getSettings: () => AppSettings,
    private onUrl: (url: string) => void
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), POLL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Marks a URL as handled (downloaded or dismissed) so it is not re-offered. */
  consume(url: string): void {
    if (!url) return
    this.seen.add(url)
    if (this.lastUrl === url) this.lastUrl = ''
    if (this.seen.size > SEEN_LIMIT) {
      const first = this.seen.values().next().value
      if (first !== undefined) this.seen.delete(first)
    }
  }

  private tick(): void {
    if (!this.getSettings().clipboardMonitor) return
    let text = ''
    try {
      text = clipboard.readText()
    } catch {
      return
    }
    if (!text || text === this.lastText) return
    this.lastText = text
    const url = this.firstUrl(text)
    if (!url || url === this.lastUrl || this.seen.has(url)) return
    this.lastUrl = url
    this.onUrl(url)
  }

  /** Extracts the first URL from multi-line clipboard content. */
  private firstUrl(text: string): string | null {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const m = line.match(URL_RE)
      if (m) return m[0].replace(/[)\]}>]+$/, '')
    }
    return null
  }
}
