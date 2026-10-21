/**
 * Library screen (0.9.0): a media-centric view that merges the live download
 * queue with the persistent library index. Active downloads stay pinned in an
 * "In progress" section; finished media can be searched, filtered, opened,
 * re-downloaded, removed or deleted.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Copy,
  Film,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  LibraryBig,
  List,
  ListPlus,
  Pause,
  Play,
  RotateCw,
  Search,
  Trash2,
  X
} from 'lucide-react'
import type { DownloadJob, LibraryItem, LibrarySnapshot, ScheduleState } from '../../../shared/types'
import { extractUrls } from '../../../shared/urls'
import { useT, type TFunc } from '../i18n'
import { Badge, Button, Input, Panel, ProgressBar, Select, Spinner } from '../components/ui'
import { cn, formatBytes, formatDuration } from '../lib'

const ACTIVE = new Set(['queued', 'fetching', 'downloading', 'paused'])
const VIEW_KEY = 'streamharvest:library-view'

type ViewMode = 'grid' | 'list'
type DateRange = 'all' | 'today' | 'week' | 'month' | 'year'
type SortMode = 'newest' | 'oldest' | 'title' | 'size'

function statusTone(job: DownloadJob): 'accent' | 'good' | 'warn' | 'bad' | 'default' {
  switch (job.status) {
    case 'downloading':
    case 'fetching':
      return 'accent'
    case 'queued':
      return 'default'
    case 'paused':
      return 'warn'
    case 'completed':
      return 'good'
    default:
      return 'bad'
  }
}

function statusLabel(t: TFunc, job: DownloadJob): string {
  switch (job.status) {
    case 'queued':
      return t('downloads.status.queued')
    case 'fetching':
      return t('downloads.status.fetching')
    case 'downloading':
      return t('downloads.status.downloading')
    case 'paused':
      return t('downloads.status.paused')
    case 'completed':
      return t('downloads.status.completed')
    case 'failed':
      return t('downloads.status.failed')
    case 'cancelled':
      return t('downloads.status.cancelled')
  }
}

function itemTime(item: LibraryItem): number {
  return Date.parse(item.completedAt ?? item.addedAt) || 0
}

function withinRange(item: LibraryItem, range: DateRange): boolean {
  if (range === 'all') return true
  const ts = itemTime(item)
  if (!ts) return false
  const now = new Date()
  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    return ts >= start
  }
  if (range === 'year') return new Date(ts).getFullYear() === now.getFullYear()
  const days = range === 'week' ? 7 : 30
  return ts >= now.getTime() - days * 24 * 60 * 60 * 1000
}

function itemMeta(item: LibraryItem): string {
  return [item.site, item.ext ? item.ext.toUpperCase() : null, item.sizeBytes ? formatBytes(item.sizeBytes) : null]
    .filter((part): part is string => !!part)
    .join(' · ')
}

export function LibraryScreen({
  jobs,
  library,
  onMove,
  schedule
}: {
  jobs: DownloadJob[]
  library: LibrarySnapshot | null
  onMove: (id: string, direction: -1 | 1) => void
  schedule: ScheduleState | null
}): React.JSX.Element {
  const t = useT()
  const [restarting, setRestarting] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')
  const [site, setSite] = useState('')
  const [format, setFormat] = useState('')
  const [range, setRange] = useState<DateRange>('all')
  const [sort, setSort] = useState<SortMode>('newest')
  const [view, setView] = useState<ViewMode>(() =>
    window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  )
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem(VIEW_KEY, view)
  }, [view])

  const items = library?.items ?? []
  const missing = useMemo(() => new Set(library?.missingIds ?? []), [library?.missingIds])
  const activeJobs = jobs.filter((j) => ACTIVE.has(j.status))
  const queuedIds = activeJobs.filter((j) => j.status === 'queued').map((j) => j.id)

  const sites = useMemo(
    () => [...new Set(items.map((i) => i.site).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b)),
    [items]
  )
  const formats = useMemo(
    () => [...new Set(items.map((i) => i.ext).filter((s): s is string => !!s))].sort(),
    [items]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = items.filter((item) => {
      if (site && item.site !== site) return false
      if (format && item.ext !== format) return false
      if (!withinRange(item, range)) return false
      if (!q) return true
      return [item.title, item.site, item.formatLabel, item.ext]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    })
    return filtered.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return itemTime(a) - itemTime(b)
        case 'title':
          return a.title.localeCompare(b.title)
        case 'size':
          return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)
        default:
          return itemTime(b) - itemTime(a)
      }
    })
  }, [items, search, site, format, range, sort])

  const restart = async (item: LibraryItem): Promise<void> => {
    setRestarting(item.id)
    try {
      await window.api.startDownload({
        url: item.url,
        presetId: item.presetId,
        formatId: item.formatId,
        title: item.title,
        thumbnail: item.thumbnail,
        site: item.site,
        duration: item.duration,
        playlist: item.playlist,
        playlistItems: item.playlistItems
      })
    } catch {
      // surfaced by the job list update
    } finally {
      setRestarting(null)
    }
  }

  const copyUrl = async (item: LibraryItem): Promise<void> => {
    await window.api.copyText(item.url)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId((id) => (id === item.id ? null : id)), 1500)
  }

  const addFromText = async (): Promise<void> => {
    const urls = extractUrls(bulkText)
    if (urls.length === 0) return
    setImporting(true)
    try {
      await window.api.addUrls(urls)
      setBulkText('')
      setImportOpen(false)
    } finally {
      setImporting(false)
    }
  }

  const addFromFile = async (): Promise<void> => {
    setImporting(true)
    try {
      const urls = await window.api.chooseUrlFile()
      if (urls.length > 0) await window.api.addUrls(urls)
    } finally {
      setImporting(false)
    }
  }

  const actions = (item: LibraryItem): React.JSX.Element => {
    const gone = missing.has(item.id)
    if (confirmDelete === item.id) {
      return (
        <div className="flex w-full flex-wrap items-center gap-1.5">
          <span className="min-w-0 flex-1 text-[11px] font-medium text-sc64-bad">{t('library.deleteConfirm')}</span>
          <Button variant="danger" size="sm" onClick={() => { setConfirmDelete(null); void window.api.deleteLibraryFile(item.id) }}>
            <Trash2 className="h-3.5 w-3.5" /> {t('library.delete')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
            {t('downloads.cancel')}
          </Button>
        </div>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" disabled={gone} onClick={() => void window.api.openLibraryItem(item.id)} title={t('library.play')}>
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" disabled={gone} onClick={() => void window.api.revealLibraryItem(item.id)} title={t('library.reveal')}>
          <FolderOpen className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copyUrl(item)} title={t('library.copyUrl')}>
          {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-sc64-good" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void restart(item)} title={t('library.redownload')}>
          <RotateCw className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void window.api.removeLibraryItems([item.id])} title={t('library.removeEntry')}>
          <X className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(item.id)} title={t('library.delete')}>
          <Trash2 className="h-3.5 w-3.5 text-sc64-bad" />
        </Button>
      </div>
    )
  }

  const thumb = (item: LibraryItem, className: string): React.JSX.Element =>
    item.thumbnail ? (
      <img src={item.thumbnail} alt="" loading="lazy" className={cn('shrink-0 border border-sc64-border object-cover', className)} />
    ) : (
      <div className={cn('flex shrink-0 items-center justify-center border border-sc64-border bg-sc64-panel2', className)}>
        <Film className="h-5 w-5 text-sc64-muted" />
      </div>
    )

  const card = (item: LibraryItem): React.JSX.Element => {
    const gone = missing.has(item.id)
    return (
      <div key={item.id} className="overflow-hidden rounded-xl border border-sc64-border bg-sc64-panel">
        <div className="relative aspect-video bg-sc64-panel2">
          {item.thumbnail ? (
            <img src={item.thumbnail} alt="" loading="lazy" className={cn('h-full w-full object-cover', gone && 'opacity-40')} />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Film className="h-8 w-8 text-sc64-muted" />
            </div>
          )}
          {item.duration ? (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
              {formatDuration(item.duration)}
            </span>
          ) : null}
          {gone ? (
            <span className="absolute left-1.5 top-1.5">
              <Badge tone="warn"><AlertTriangle className="h-3 w-3" /> {t('library.fileMissing')}</Badge>
            </span>
          ) : null}
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 text-sm font-semibold text-sc64-text" title={item.title}>{item.title}</h3>
          <p className="truncate text-[11px] text-sc64-muted" title={itemMeta(item)}>{itemMeta(item)}</p>
          <p className="text-[11px] text-sc64-muted">
            {new Date(item.completedAt ?? item.addedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
          <div className="pt-1">{actions(item)}</div>
        </div>
      </div>
    )
  }

  const row = (item: LibraryItem): React.JSX.Element => {
    const gone = missing.has(item.id)
    return (
      <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-sc64-border bg-sc64-panel p-2.5">
        <div className="relative">
          {thumb(item, 'h-14 w-24 rounded-md')}
          {gone ? (
            <span className="absolute -right-1 -top-1 rounded-full bg-sc64-warn p-0.5 text-sc64-bg">
              <AlertTriangle className="h-3 w-3" />
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sc64-text" title={item.title}>{item.title}</p>
          <p className="truncate text-[11px] text-sc64-muted">{itemMeta(item)}</p>
          <p className="text-[11px] text-sc64-muted">
            {new Date(item.completedAt ?? item.addedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
        </div>
        <div className="w-full sm:w-auto">{actions(item)}</div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-sc64-text">
            <LibraryBig className="h-5 w-5 text-sc64-accent" /> {t('library.title')}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-sc64-muted">
            <HardDrive className="h-3.5 w-3.5" />
            {t('library.summary', { count: library?.count ?? 0, size: formatBytes(library?.totalBytes) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-sc64-border p-0.5">
            <button
              type="button"
              onClick={() => setView('grid')}
              title={t('library.viewGrid')}
              className={cn('rounded px-1.5 py-1 transition-colors', view === 'grid' ? 'bg-sc64-accent/15 text-sc64-accent' : 'text-sc64-muted hover:text-sc64-text')}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              title={t('library.viewList')}
              className={cn('rounded px-1.5 py-1 transition-colors', view === 'list' ? 'bg-sc64-accent/15 text-sc64-accent' : 'text-sc64-muted hover:text-sc64-text')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setImportOpen((o) => !o)}>
            <ListPlus className="h-3.5 w-3.5" /> {t('library.addUrls')}
          </Button>
        </div>
      </div>

      {schedule?.downloadWindowEnabled ? (
        <Panel
          className={cn(
            'flex items-start gap-3 p-3',
            schedule.downloadAllowed ? 'border-sc64-accent/40 bg-sc64-accent/5' : 'border-sc64-warn/40 bg-sc64-warn/5'
          )}
        >
          <CalendarClock className={cn('mt-0.5 h-4 w-4 shrink-0', schedule.downloadAllowed ? 'text-sc64-accent' : 'text-sc64-warn')} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-sc64-text">
              {schedule.downloadAllowed ? t('downloads.schedule.active') : t('downloads.schedule.waiting', { start: schedule.downloadWindowStart })}
            </p>
            <p className="mt-0.5 text-[11px] text-sc64-muted">
              {t('downloads.schedule.window', { start: schedule.downloadWindowStart, end: schedule.downloadWindowEnd })}
              {schedule.speedWindowActive ? ` · ${t('downloads.schedule.speed', { limit: schedule.effectiveSpeedLimit || t('settings.noLimit') })}` : ''}
            </p>
          </div>
        </Panel>
      ) : null}

      {importOpen ? (
        <Panel>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-sc64-text">{t('library.batchAdd')}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={importing} onClick={() => void addFromFile()}>
                <FolderOpen className="h-3.5 w-3.5" /> {t('library.importTxt')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)} title={t('titlebar.close')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={t('library.bulkPlaceholder')}
            rows={4}
            className="w-full resize-y rounded-md border border-sc64-border bg-sc64-panel2 px-3 py-2 font-mono text-xs text-sc64-text outline-none placeholder:text-sc64-muted focus:border-sc64-accent"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-sc64-muted">
              {importing ? (
                <>
                  <Spinner className="mr-1 inline h-3 w-3" /> {t('library.adding')}
                </>
              ) : (
                t('library.linksDetected', { count: extractUrls(bulkText).length })
              )}
            </p>
            <Button variant="primary" size="sm" disabled={importing || extractUrls(bulkText).length === 0} onClick={() => void addFromText()}>
              <ListPlus className="h-3.5 w-3.5" /> {t('library.addToQueue')}
            </Button>
          </div>
        </Panel>
      ) : null}

      {activeJobs.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-sc64-muted">{t('library.inProgress')}</h3>
          {activeJobs.map((job) => (
            <Panel key={job.id} className="p-4">
              <div className="flex items-start gap-3">
                {job.thumbnail ? (
                  <img src={job.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-md border border-sc64-border object-cover" />
                ) : (
                  <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-md border border-sc64-border bg-sc64-panel2">
                    <Film className="h-5 w-5 text-sc64-muted" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-sc64-text" title={job.title}>{job.title}</h3>
                      <p className="mt-0.5 truncate text-xs text-sc64-muted">{job.formatLabel}</p>
                    </div>
                    <Badge tone={statusTone(job)}>{statusLabel(t, job)}</Badge>
                  </div>
                  {job.status === 'downloading' || job.status === 'paused' ? (
                    <div className="mt-3">
                      <ProgressBar value={job.progress} max={100} label={job.speed || '…'} indeterminate={job.progress === 0} />
                      <div className="mt-1 flex items-center justify-between text-[11px] text-sc64-muted">
                        <span>{formatBytes(job.bytesReceived)} / {formatBytes(job.bytesTotal)}</span>
                        <span>{job.eta ? t('downloads.eta', { eta: job.eta }) : ''}</span>
                      </div>
                    </div>
                  ) : null}
                  {job.error ? <p className="mt-2 truncate text-xs text-sc64-bad" title={job.error}>{job.error}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {job.status === 'downloading' ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => void window.api.pauseDownload(job.id)}>
                          <Pause className="h-3.5 w-3.5" /> {t('downloads.pause')}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void window.api.cancelDownload(job.id)}>
                          <X className="h-3.5 w-3.5" /> {t('downloads.cancel')}
                        </Button>
                      </>
                    ) : job.status === 'paused' ? (
                      <>
                        <Button variant="primary" size="sm" onClick={() => void window.api.resumeDownload(job.id)}>
                          <Play className="h-3.5 w-3.5" /> {t('downloads.resume')}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void window.api.cancelDownload(job.id)}>
                          <X className="h-3.5 w-3.5" /> {t('downloads.cancel')}
                        </Button>
                      </>
                    ) : job.status === 'queued' ? (
                      <>
                        <Button variant="outline" size="sm" disabled={queuedIds.indexOf(job.id) === 0} onClick={() => onMove(job.id, -1)} title={t('downloads.moveUp')}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={queuedIds.indexOf(job.id) === queuedIds.length - 1} onClick={() => onMove(job.id, 1)} title={t('downloads.moveDown')}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void window.api.cancelDownload(job.id)}>
                          <X className="h-3.5 w-3.5" /> {t('downloads.removeQueue')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      ) : null}

      {library && library.missingIds.length > 0 ? (
        <Panel className="flex flex-wrap items-center gap-3 border-sc64-warn/40 bg-sc64-warn/5 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-sc64-warn" />
          <p className="min-w-0 flex-1 text-xs text-sc64-text">
            {t('library.missing', { count: library.missingIds.length })}
          </p>
          <Button variant="outline" size="sm" onClick={() => void window.api.removeMissingLibraryItems()}>
            {t('library.removeMissing')}
          </Button>
        </Panel>
      ) : null}

      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sc64-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('library.searchPlaceholder')}
            className="pl-8"
          />
        </div>
        <Select value={site} onChange={(e) => setSite(e.target.value)} className="w-auto min-w-[9rem]">
          <option value="">{t('library.allSites')}</option>
          {sites.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select value={format} onChange={(e) => setFormat(e.target.value)} className="w-auto min-w-[8rem]">
          <option value="">{t('library.allFormats')}</option>
          {formats.map((f) => (
            <option key={f} value={f}>{f.toUpperCase()}</option>
          ))}
        </Select>
        <Select value={range} onChange={(e) => setRange(e.target.value as DateRange)} className="w-auto">
          <option value="all">{t('library.anyTime')}</option>
          <option value="today">{t('library.today')}</option>
          <option value="week">{t('library.last7')}</option>
          <option value="month">{t('library.last30')}</option>
          <option value="year">{t('library.thisYear')}</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="w-auto">
          <option value="newest">{t('library.sort.newest')}</option>
          <option value="oldest">{t('library.sort.oldest')}</option>
          <option value="title">{t('library.sort.title')}</option>
          <option value="size">{t('library.sort.size')}</option>
        </Select>
      </Panel>

      {items.length === 0 ? (
        <Panel className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <LibraryBig className="h-8 w-8 text-sc64-muted" />
          <p className="text-sm text-sc64-muted">{t('library.empty')}</p>
        </Panel>
      ) : visible.length === 0 ? (
        <Panel className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Search className="h-6 w-6 text-sc64-muted" />
          <p className="text-sm text-sc64-muted">{t('library.emptyFiltered')}</p>
        </Panel>
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visible.map(card)}</div>
      ) : (
        <div className="space-y-2">{visible.map(row)}</div>
      )}

      {restarting ? (
        <div className="flex items-center gap-2 text-xs text-sc64-muted">
          <Spinner className="h-3.5 w-3.5" /> {t('library.restarting')}
        </div>
      ) : null}
    </div>
  )
}
