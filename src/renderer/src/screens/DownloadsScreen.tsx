/**
 * Downloads screen: the live queue (with progress, speed, ETA and
 * pause/resume/cancel controls) plus the persisted history of finished
 * downloads with re-download and reveal-in-folder actions.
 */
import { useState } from 'react'
import { FolderOpen, History, Pause, Play, RotateCw, Trash2, X } from 'lucide-react'
import type { DownloadJob } from '../../../shared/types'
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

function JobRow({ job, onRestart }: { job: DownloadJob; onRestart: (job: DownloadJob) => void }): React.JSX.Element {
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
            <Badge tone={statusTone(job)}>{job.status}</Badge>
          </div>

          {showProgress ? (
            <div className="mt-3">
              <ProgressBar value={job.progress} max={100} label={job.speed || '…'} indeterminate={job.status === 'queued' || job.progress === 0} />
              <div className="mt-1 flex items-center justify-between text-[11px] text-sc64-muted">
                <span>
                  {formatBytes(job.bytesReceived)} / {formatBytes(job.bytesTotal)}
                </span>
                <span>{job.eta ? `ETA ${job.eta}` : ''}</span>
              </div>
            </div>
          ) : null}

          {job.error ? <p className="mt-2 truncate text-xs text-sc64-bad" title={job.error}>{job.error}</p> : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {job.status === 'downloading' ? (
              <>
                <Button variant="outline" size="sm" onClick={() => void window.api.pauseDownload(job.id)}>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </Button>
                <Button variant="danger" size="sm" onClick={() => void window.api.cancelDownload(job.id)}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </>
            ) : job.status === 'paused' ? (
              <>
                <Button variant="primary" size="sm" onClick={() => void window.api.resumeDownload(job.id)}>
                  <Play className="h-3.5 w-3.5" /> Resume
                </Button>
                <Button variant="danger" size="sm" onClick={() => void window.api.cancelDownload(job.id)}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </>
            ) : job.status === 'queued' ? (
              <Button variant="danger" size="sm" onClick={() => void window.api.cancelDownload(job.id)}>
                <X className="h-3.5 w-3.5" /> Remove from queue
              </Button>
            ) : null}

            {job.status === 'completed' && job.filePath ? (
              <Button variant="outline" size="sm" onClick={() => void window.api.reveal(job.filePath ?? '')}>
                <FolderOpen className="h-3.5 w-3.5" /> Show in folder
              </Button>
            ) : null}

            {!active ? (
              <Button variant="outline" size="sm" onClick={() => onRestart(job)}>
                <RotateCw className="h-3.5 w-3.5" /> Re-download
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  )
}

export function DownloadsScreen({ jobs }: { jobs: DownloadJob[] }): React.JSX.Element {
  const [restarting, setRestarting] = useState<string | null>(null)

  const activeJobs = jobs.filter((j) => ACTIVE.has(j.status))
  const history = jobs.filter((j) => !ACTIVE.has(j.status))

  const restart = async (job: DownloadJob): Promise<void> => {
    setRestarting(job.id)
    try {
      await window.api.startDownload({
        url: job.url,
        presetId: job.presetId,
        formatId: job.formatId,
        title: job.title,
        thumbnail: job.thumbnail,
        playlist: job.playlist
      })
    } catch {
      // surfaced by the job list update
    } finally {
      setRestarting(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-sc64-text">
          <History className="h-5 w-5 text-sc64-accent" /> Downloads
        </h2>
        {history.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => void window.api.clearHistory()}>
            <Trash2 className="h-3.5 w-3.5" /> Clear history
          </Button>
        ) : null}
      </div>

      {activeJobs.length > 0 ? (
        <div className="space-y-3">
          {activeJobs.map((job) => (
            <JobRow key={job.id} job={job} onRestart={(j) => void restart(j)} />
          ))}
        </div>
      ) : null}

      {history.length > 0 ? (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-sc64-muted">History</h3>
          <div className="space-y-3">
            {history.map((job) => (
              <JobRow key={job.id} job={job} onRestart={(j) => void restart(j)} />
            ))}
          </div>
        </>
      ) : null}

      {jobs.length === 0 ? (
        <Panel className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <History className="h-8 w-8 text-sc64-muted" />
          <p className="text-sm text-sc64-muted">No downloads yet — head to Home and paste a link.</p>
        </Panel>
      ) : null}

      {restarting ? (
        <div className="flex items-center gap-2 text-xs text-sc64-muted">
          <Spinner className="h-3.5 w-3.5" /> Restarting download…
        </div>
      ) : null}
    </div>
  )
}
