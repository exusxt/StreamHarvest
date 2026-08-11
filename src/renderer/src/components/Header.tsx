/**
 * In-window header/banner below the frameless title bar. Shows the app
 * identity and live engine badges (yt-dlp version, ffmpeg, active downloads).
 */
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { AppStatus } from '../../../shared/types'
import { useT } from '../i18n'
import { Badge, Button, Spinner } from './ui'
import appIcon from '../assets/app-icon.png'

export function Header({
  status,
  refreshing,
  onRefresh,
  activeCount
}: {
  status: AppStatus | null
  refreshing: boolean
  onRefresh: () => void
  activeCount: number
}): React.JSX.Element {
  const t = useT()
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-sc64-accent/40 shadow-glow">
          <img src={appIcon} alt="StreamHarvest" className="h-full w-full object-cover" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight text-sc64-text">StreamHarvest</h1>
          <p className="text-xs text-sc64-muted">{t('header.tagline')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {status?.ytDlp.present ? (
          <Badge tone="good">yt-dlp {status.ytDlp.version}</Badge>
        ) : (
          <Badge tone="bad">
            <AlertTriangle className="h-3 w-3" />
            {t('header.ytdlpMissing')}
          </Badge>
        )}
        {status ? (
          status.ffmpeg.present ? (
            <Badge tone="good">ffmpeg {status.ffmpeg.version ?? ''}</Badge>
          ) : (
            <Badge tone="warn">
              <AlertTriangle className="h-3 w-3" />
              {t('header.ffmpegMissing')}
            </Badge>
          )
        ) : null}
        {activeCount > 0 ? <Badge tone="accent">{t('header.active', { count: activeCount })}</Badge> : null}
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('header.refresh')}
        </Button>
      </div>
    </header>
  )
}
