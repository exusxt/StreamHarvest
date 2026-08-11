/**
 * Downloads screen: the live queue (with progress, speed, ETA and
 * pause/resume/cancel controls) plus the persisted history of finished
 * downloads with re-download and reveal-in-folder actions.
 */
import { useState } from 'react'
import { ArrowDown, ArrowUp, FolderOpen, History, ListPlus, Pause, Play, RotateCw, Trash2, X } from 'lucide-react'
import type { DownloadJob } from '../../../shared/types'
import { extractUrls } from '../../../shared/urls'
import { useT, type TFunc } from '../i18n'
import { Badge, Button, Panel, ProgressBar, Spinner } from '../components/ui'
import { formatBytes } from '../lib'

const ACTIVE = new Set(['queued', 'fetching', 'downloading', 'paused'])

function fileName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

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

function JobRow({
  job,
  first,
  last,
  onMove,
  onRestart
}: {
  job: DownloadJob
  first: boolean
  last: boolean
  onMove: (job: DownloadJob, direction: -1 | 1) => void
  onRestart: (job: DownloadJob) => void
}): React.JSX.Element {
  const t = useT()
  const active = ACTIVE.has(job.status)
  const showProgress = job.status === 'downloading' || job.status === 'paused'

  return (
    <Panel className="p-4">
      <div className="flex items-start gap-3">
        {job.thumbnail ? (
          <img src={job.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-md border border-sc64-border object-cover" />
        ) : (
          <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-md border border-sc64-border bg-sc64-panel2">
            <History className="h-5 w-5 text-sc64-muted" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-sc64-text" title={job.title}>
                {job.title}
              </h3>
              <p className="mt-0.5 truncate text-xs text-sc64-muted">{job.formatLabel}</p>
              {job.status === 'completed' && job.filePath ? (
                <p className="mt-0.5 truncate text-xs text-sc64-accent" title={job.filePath}>
                  {fileName(job.filePath)}
                </p>
              ) : null}
            </div>
            <Badge tone={statusTone(job)}>{statusLabel(t, job)}</Badge>
          </div>

          {showProgress ? (
            <div className="mt-3">
              <ProgressBar value={job.progress} max={100} label={job.speed || '…'} indeterminate={job.status === 'queued' || job.progress === 0} />
              <div className="mt-1 flex items-center justify-between text-[11px] text-sc64-muted">
                <span>
                  {formatBytes(job.bytesReceived)} / {formatBytes(job.bytesTotal)}
                </span>
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
                <Button variant="outline" size="sm" disabled={first} onClick={() => onMove(job, -1)} title={t('downloads.moveUp')}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" disabled={last} onClick={() => onMove(job, 1)} title={t('downloads.moveDown')}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="danger" size="sm" onClick={() => void window.api.cancelDownload(job.id)}>
                  <X className="h-3.5 w-3.5" /> {t('downloads.removeQueue')}
                </Button>
              </>
            ) : null}

            {job.status === 'completed' && job.filePath ? (
              <Button variant="outline" size="sm" onClick={() => void window.api.reveal(job.filePath ?? '')}>
                <FolderOpen className="h-3.5 w-3.5" /> {t('downloads.showInFolder')}
              </Button>
            ) : null}

            {!active ? (
              <Button variant="outline" size="sm" onClick={() => onRestart(job)}>
                <RotateCw className="h-3.5 w-3.5" /> {t('downloads.redownload')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  )
}

export function DownloadsScreen({
  jobs,
  onMove
}: {
  jobs: DownloadJob[]
  onMove: (id: string, direction: -1 | 1) => void
}): React.JSX.Element {
  const t = useT()
  const [restarting, setRestarting] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [importing, setImporting] = useState(false)

  const activeJobs = jobs.filter((j) => ACTIVE.has(j.status))
  const history = jobs.filter((j) => !ACTIVE.has(j.status))
  const queuedIds = activeJobs.filter((j) => j.status === 'queued').map((j) => j.id)

  const restart = async (job: DownloadJob): Promise<void> => {
    setRestarting(job.id)
    try {
      await window.api.startDownload({
        url: job.url,
        presetId: job.presetId,
        formatId: job.formatId,
        title: job.title,
        thumbnail: job.thumbnail,
        playlist: job.playlist,
        playlistItems: job.playlistItems
      })
    } catch {
      // surfaced by the job list update
    } finally {
      setRestarting(null)
    }
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-sc64-text">
          <History className="h-5 w-5 text-sc64-accent" /> {t('downloads.title')}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen((o) => !o)}>
            <ListPlus className="h-3.5 w-3.5" /> {t('downloads.addUrls')}
          </Button>
          {history.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => void window.api.clearHistory()}>
              <Trash2 className="h-3.5 w-3.5" /> {t('downloads.clearHistory')}
            </Button>
          ) : null}
        </div>
      </div>

      {importOpen ? (
        <Panel>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-sc64-text">{t('downloads.batchAdd')}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={importing} onClick={() => void addFromFile()}>
                <FolderOpen className="h-3.5 w-3.5" /> {t('downloads.importTxt')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)} title={t('titlebar.close')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={t('downloads.bulkPlaceholder')}
            rows={4}
            className="w-full resize-y rounded-md border border-sc64-border bg-sc64-panel2 px-3 py-2 font-mono text-xs text-sc64-text outline-none placeholder:text-sc64-muted focus:border-sc64-accent"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-sc64-muted">
              {importing ? (
                <>
                  <Spinner className="mr-1 inline h-3 w-3" /> {t('downloads.adding')}
                </>
              ) : (
                t('downloads.linksDetected', { count: extractUrls(bulkText).length })
              )}
            </p>
            <Button variant="primary" size="sm" disabled={importing || extractUrls(bulkText).length === 0} onClick={() => void addFromText()}>
              <ListPlus className="h-3.5 w-3.5" /> {t('downloads.addToQueue')}
            </Button>
          </div>
        </Panel>
      ) : null}

      {activeJobs.length > 0 ? (
        <div className="space-y-3">
          {activeJobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              first={job.status === 'queued' && queuedIds.indexOf(job.id) === 0}
              last={job.status === 'queued' && queuedIds.indexOf(job.id) === queuedIds.length - 1}
              onMove={(j, dir) => onMove(j.id, dir)}
              onRestart={(j) => void restart(j)}
            />
          ))}
        </div>
      ) : null}

      {history.length > 0 ? (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-sc64-muted">{t('downloads.history')}</h3>
          <div className="space-y-3">
            {history.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                first
                last
                onMove={() => undefined}
                onRestart={(j) => void restart(j)}
              />
            ))}
          </div>
        </>
      ) : null}

      {jobs.length === 0 ? (
        <Panel className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <History className="h-8 w-8 text-sc64-muted" />
          <p className="text-sm text-sc64-muted">{t('downloads.empty')}</p>
        </Panel>
      ) : null}

      {restarting ? (
        <div className="flex items-center gap-2 text-xs text-sc64-muted">
          <Spinner className="h-3.5 w-3.5" /> {t('downloads.restarting')}
        </div>
      ) : null}
    </div>
  )
}
