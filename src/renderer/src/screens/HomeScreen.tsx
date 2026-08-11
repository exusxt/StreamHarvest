/**
 * Home screen: paste a URL, fetch its metadata, pick a quality and download.
 * The pasted link is turned into a video card (thumbnail, title, duration)
 * before the user commits to a download.
 */
import { useEffect, useState } from 'react'
import { ArrowRight, Check, Clock, Download, Folder, Link2, ListChecks, ListVideo, Search, Upload, User, X } from 'lucide-react'
import type { AppStatus, VideoMetadata } from '../../../shared/types'
import { QUALITY_PRESETS } from '../../../shared/types'
import { buildPlaylistItems } from '../../../shared/playlist'
import { Badge, Button, Field, Input, Panel, Select, Spinner } from '../components/ui'
import { cn, formatDuration } from '../lib'

function StatusLine({ text, tone }: { text: string; tone?: 'good' | 'bad' }): React.JSX.Element {
  return (
    <p className={cn('text-sm', tone === 'bad' ? 'text-sc64-bad' : 'text-sc64-muted')}>{text}</p>
  )
}

export function HomeScreen({
  status,
  onGoDownloads
}: {
  status: AppStatus | null
  onGoDownloads: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState('')
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [quality, setQuality] = useState('preset:best')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (metadata?.playlist && metadata.entries) {
      setSelected(new Set(metadata.entries.map((_, i) => i + 1)))
    } else {
      setSelected(new Set())
    }
  }, [metadata])

  const toggleEntry = (index: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const selectAll = (): void => {
    if (!metadata?.entries) return
    setSelected(new Set(metadata.entries.map((_, i) => i + 1)))
  }

  const selectNone = (): void => setSelected(new Set())

  const engineReady = status?.ytDlp.present ?? false

  const fetchInfo = async (): Promise<void> => {
    const value = url.trim()
    if (!value) return
    setFetching(true)
    setFetchError(null)
    setMetadata(null)
    setStartError(null)
    try {
      const res = await window.api.fetchMetadata(value)
      if (res.error) {
        setFetchError(res.error)
        return
      }
      setMetadata(res)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    } finally {
      setFetching(false)
    }
  }

  const start = async (): Promise<void> => {
    if (!metadata) return
    setStarting(true)
    setStartError(null)
    let presetId = 'best'
    let formatId: string | undefined
    if (quality.startsWith('format:')) {
      formatId = quality.slice('format:'.length)
      presetId = ''
    } else if (quality.startsWith('preset:')) {
      presetId = quality.slice('preset:'.length)
    }
    try {
      const allSelected = metadata.entries ? selected.size === metadata.entries.length : true
      const playlistItems =
        metadata.playlist && metadata.entries && !allSelected ? buildPlaylistItems(selected) : undefined
      const res = await window.api.startDownload({
        url: metadata.webpageUrl,
        presetId,
        formatId,
        title: metadata.title,
        thumbnail: metadata.thumbnail,
        playlist: metadata.playlist,
        playlistItems
      })
      if (!res.ok) {
        setStartError(res.error ?? 'Could not start the download.')
        return
      }
      setMetadata(null)
      setUrl('')
      setQuality('preset:best')
      onGoDownloads()
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  const chosenPreset = QUALITY_PRESETS.find((p) => p.id === quality.slice('preset:'.length))

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-sc64-accent" />
          <h2 className="text-base font-bold text-sc64-text">New download</h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={url}
            placeholder="Paste a video URL — YouTube, Vimeo, Twitch and more…"
            disabled={!engineReady || fetching}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void fetchInfo()
            }}
            className="flex-1"
          />
          <Button variant="primary" onClick={() => void fetchInfo()} disabled={!engineReady || fetching || !url.trim()}>
            {fetching ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            {fetching ? 'Fetching…' : 'Fetch info'}
          </Button>
        </div>
        {!engineReady ? (
          <StatusLine text="yt-dlp is not installed yet — open Settings to install it." tone="bad" />
        ) : (
          <StatusLine text={`Downloads are saved to ${status?.downloadsDir ?? '…'}`} />
        )}
        {fetchError ? <StatusLine text={fetchError} tone="bad" /> : null}
      </Panel>

      {metadata ? (
        <Panel className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row">
            {metadata.thumbnail ? (
              <div className="relative w-full shrink-0 overflow-hidden rounded-lg border border-sc64-border sm:w-64">
                <img src={metadata.thumbnail} alt="" className="aspect-video w-full object-cover" />
                {metadata.duration ? (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-mono text-white">
                    {formatDuration(metadata.duration)}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone="accent">{metadata.playlist ? 'Playlist / Channel' : 'Video'}</Badge>
                {metadata.playlist && metadata.entryCount ? (
                  <Badge tone="default">
                    <ListVideo className="h-3 w-3" /> {metadata.entryCount} videos
                  </Badge>
                ) : null}
              </div>
              <h2 className="text-lg font-bold leading-snug text-sc64-text">{metadata.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sc64-muted">
                {metadata.uploader ? (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" /> {metadata.uploader}
                  </span>
                ) : null}
                {metadata.duration ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatDuration(metadata.duration)}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Folder className="h-3 w-3" /> {metadata.formats.length} formats
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Quality / format">
                  <Select value={quality} onChange={(e) => setQuality(e.target.value)}>
                    <optgroup label="Presets">
                      {QUALITY_PRESETS.map((p) => (
                        <option key={p.id} value={`preset:${p.id}`}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    {metadata.formats.length > 0 ? (
                      <optgroup label="Specific formats (advanced)">
                        {metadata.formats.map((f) => (
                          <option key={f.id} value={`format:${f.id}`}>
                            {f.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </Select>
                </Field>
                <div className="flex items-end">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={starting || (metadata.playlist && metadata.entries ? selected.size === 0 : false)}
                    onClick={() => void start()}
                  >
                    {starting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                    {starting
                      ? 'Starting…'
                      : metadata.playlist && metadata.entries
                        ? `Download ${selected.size} of ${metadata.entries.length}`
                        : 'Download'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {chosenPreset?.extraArgs?.length ? (
                <p className="mt-2 text-[11px] text-sc64-muted">Conversion with ffmpeg will run after downloading.</p>
              ) : null}
              {startError ? <p className="mt-2 text-sm text-sc64-bad">{startError}</p> : null}
            </div>
          </div>

          {metadata.playlist && metadata.entries ? (
            <div className="mt-4 border-t border-sc64-border pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sc64-muted">
                  <ListChecks className="h-3.5 w-3.5" /> Videos — {selected.size} of {metadata.entries.length} selected
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    <Check className="h-3.5 w-3.5" /> All
                  </Button>
                  <Button variant="outline" size="sm" onClick={selectNone}>
                    <X className="h-3.5 w-3.5" /> None
                  </Button>
                </div>
              </div>
              <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {metadata.entries.map((entry, i) => {
                  const index = i + 1
                  return (
                    <label
                      key={entry.id || index}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-sc64-border bg-sc64-panel2/60 px-3 py-1.5 text-xs hover:border-sc64-borderlight"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 shrink-0 accent-sc64-accent"
                        checked={selected.has(index)}
                        onChange={() => toggleEntry(index)}
                      />
                      <span className="w-7 shrink-0 text-right font-mono text-sc64-muted">{index}</span>
                      <span className="min-w-0 flex-1 truncate text-sc64-text" title={entry.title}>
                        {entry.title}
                      </span>
                      {entry.duration ? (
                        <span className="shrink-0 font-mono text-sc64-muted">{formatDuration(entry.duration)}</span>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}

          {metadata.formats.length > 0 ? (
            <div className="mt-4 border-t border-sc64-border pt-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sc64-muted">
                <Upload className="h-3.5 w-3.5" /> Available formats
              </div>
              <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                {metadata.formats.slice(0, 24).map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-sc64-border bg-sc64-panel2/60 px-3 py-1.5 text-xs"
                  >
                    <span className="truncate font-mono text-sc64-text">
                      {f.resolution ?? 'audio'} · {f.ext}
                    </span>
                    <span className="shrink-0 text-sc64-muted">{f.id}</span>
                  </div>
                ))}
              </div>
              {metadata.formats.length > 24 ? (
                <p className="mt-2 text-[11px] text-sc64-muted">+{metadata.formats.length - 24} more in the dropdown above</p>
              ) : null}
            </div>
          ) : null}
        </Panel>
      ) : fetching ? (
        <Panel className="flex items-center gap-2 text-sc64-muted">
          <Spinner /> Fetching video info…
        </Panel>
      ) : null}
    </div>
  )
}
