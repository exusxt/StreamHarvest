/**
 * Settings screen: download folder, concurrency and default format, plus the
 * engine section (yt-dlp and ffmpeg install / update / check / remove).
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, Film, Folder, FolderOpen, RefreshCw, Settings2, Trash2, Wrench, Zap } from 'lucide-react'
import type { AppSettings, AppStatus, BinaryProgress, FfmpegCheckResult, YtDlpCheckResult } from '../../../shared/types'
import { QUALITY_PRESETS } from '../../../shared/types'
import { Badge, Button, Checkbox, Field, Input, Panel, ProgressBar, Select, Spinner } from '../components/ui'
import { formatBytes } from '../lib'

export function SettingsScreen({
  status,
  engineBusy,
  installProgress,
  onInstall,
  onUpdate,
  ffmpegBusy,
  ffmpegProgress,
  ffmpegError,
  onInstallFfmpeg,
  onUpdateFfmpeg,
  onRemoveFfmpeg
}: {
  status: AppStatus | null
  engineBusy: boolean
  installProgress: BinaryProgress | null
  onInstall: () => void
  onUpdate: () => void
  ffmpegBusy: boolean
  ffmpegProgress: BinaryProgress | null
  ffmpegError: string | null
  onInstallFfmpeg: () => void
  onUpdateFfmpeg: () => void
  onRemoveFfmpeg: () => void
}): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [check, setCheck] = useState<YtDlpCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [ffmpegCheck, setFfmpegCheck] = useState<FfmpegCheckResult | null>(null)
  const [checkingFfmpeg, setCheckingFfmpeg] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getSettings().then(setSettings).catch(() => undefined)
  }, [])

  const update = (patch: Partial<AppSettings>): void => {
    setSaved(false)
    window.api.setSettings(patch).then((next) => {
      setSettings(next)
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    })
  }

  const checkUpdate = async (): Promise<void> => {
    setChecking(true)
    try {
      setCheck(await window.api.checkYtDlpUpdate())
    } catch (e) {
      setCheck({ current: null, latest: null, upToDate: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setChecking(false)
    }
  }

  const checkFfmpegUpdate = async (): Promise<void> => {
    setCheckingFfmpeg(true)
    try {
      setFfmpegCheck(await window.api.checkFfmpegUpdate())
    } catch (e) {
      setFfmpegCheck({ current: null, latest: null, upToDate: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setCheckingFfmpeg(false)
    }
  }

  const yd = status?.ytDlp
  const ff = status?.ffmpeg

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="flex items-center gap-2 text-lg font-bold text-sc64-text">
        <Settings2 className="h-5 w-5 text-sc64-accent" /> Settings
      </h2>

      <Panel>
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sc64-muted">
          <Folder className="h-3.5 w-3.5" /> Download folder
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={settings?.downloadsDir ?? ''}
            readOnly
            className="flex-1 font-mono text-xs"
            placeholder="Choose a folder…"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const dir = await window.api.chooseDownloadsDir()
                if (dir) update({ downloadsDir: dir })
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" /> Browse
            </Button>
            <Button variant="outline" size="sm" onClick={() => void window.api.openDownloadsFolder()}>
              Open
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sc64-muted">
          <Zap className="h-3.5 w-3.5" /> Downloads
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Concurrent downloads" hint="How many files may download at once.">
            <Select
              value={settings?.concurrentLimit ?? 2}
              onChange={(e) => update({ concurrentLimit: parseInt(e.target.value, 10) })}
            >
              {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default format">
            <Select value={settings?.defaultFormat ?? 'best'} onChange={(e) => update({ defaultFormat: e.target.value })}>
              {QUALITY_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Checkbox
            label="Audio-only mode"
            hint="Downloads audio only by default (converted to MP3 with ffmpeg)."
            checked={settings?.audioOnly ?? false}
            onChange={(v) => update({ audioOnly: v, defaultFormat: v ? 'audio-mp3' : 'best' })}
          />
        </div>
        {saved ? <p className="mt-3 text-xs text-sc64-good">Settings saved.</p> : null}
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sc64-muted">
          <Wrench className="h-3.5 w-3.5" /> Download engine
        </div>

        <div className="space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {yd?.present ? (
                <Badge tone="good">
                  <CheckCircle2 className="h-3 w-3" /> yt-dlp {yd.version}
                </Badge>
              ) : (
                <Badge tone="bad">yt-dlp not installed</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {yd?.present ? (
                <>
                  <Button variant="outline" size="sm" disabled={engineBusy} onClick={onUpdate}>
                    {engineBusy ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Update yt-dlp
                  </Button>
                  <Button variant="ghost" size="sm" disabled={engineBusy || checking} onClick={() => void checkUpdate()}>
                    {checking ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Check for updates
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" disabled={engineBusy} onClick={onInstall}>
                  {engineBusy ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Install yt-dlp
                </Button>
              )}
            </div>

            {installProgress && installProgress.total > 0 ? (
              <div className="mt-3">
                <ProgressBar value={installProgress.received} max={installProgress.total} label="Downloading yt-dlp…" />
                <p className="mt-1 text-[11px] text-sc64-muted">
                  {formatBytes(installProgress.received)} / {formatBytes(installProgress.total)}
                </p>
              </div>
            ) : null}

            {check ? (
              check.error ? (
                <p className="mt-3 text-sm text-sc64-bad">{check.error}</p>
              ) : check.upToDate ? (
                <p className="mt-3 text-sm text-sc64-good">yt-dlp is up to date ({check.latest}).</p>
              ) : (
                <p className="mt-3 text-sm text-sc64-warn">
                  A newer version is available: {check.latest}. Use “Update yt-dlp” above.
                </p>
              )
            ) : null}
          </div>

          <div className="border-t border-sc64-border pt-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {ff?.present ? (
                <Badge tone="good">
                  <CheckCircle2 className="h-3 w-3" /> ffmpeg {ff.version}
                  {ff.source === 'managed' ? ' (managed)' : ' (system)'}
                </Badge>
              ) : (
                <Badge tone="warn">ffmpeg not found — merging & conversion need it</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ff?.present ? (
                <>
                  <Button variant="outline" size="sm" disabled={ffmpegBusy} onClick={onUpdateFfmpeg}>
                    {ffmpegBusy ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Update ffmpeg
                  </Button>
                  <Button variant="ghost" size="sm" disabled={ffmpegBusy || checkingFfmpeg} onClick={() => void checkFfmpegUpdate()}>
                    {checkingFfmpeg ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Check for updates
                  </Button>
                  {ff.source === 'managed' ? (
                    <Button variant="ghost" size="sm" disabled={ffmpegBusy} onClick={onRemoveFfmpeg} title="Remove the managed copy">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  ) : null}
                </>
              ) : status?.platform === 'darwin' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md border border-sc64-border bg-sc64-panel px-2 py-1 font-mono text-xs text-sc64-text">
                    brew install ffmpeg
                  </code>
                  <span className="text-xs text-sc64-muted">then reopen Settings to detect it</span>
                </div>
              ) : (
                <Button variant="primary" size="sm" disabled={ffmpegBusy} onClick={onInstallFfmpeg}>
                  {ffmpegBusy ? <Spinner className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
                  Install ffmpeg
                </Button>
              )}
            </div>

            {ffmpegProgress && ffmpegProgress.total > 0 ? (
              <div className="mt-3">
                <ProgressBar value={ffmpegProgress.received} max={ffmpegProgress.total} label="Downloading ffmpeg…" />
                <p className="mt-1 text-[11px] text-sc64-muted">
                  {formatBytes(ffmpegProgress.received)} / {formatBytes(ffmpegProgress.total)}
                </p>
              </div>
            ) : null}

            {ffmpegError ? <p className="mt-3 text-sm text-sc64-bad">{ffmpegError}</p> : null}

            {ffmpegCheck ? (
              ffmpegCheck.error ? (
                <p className="mt-3 text-sm text-sc64-bad">{ffmpegCheck.error}</p>
              ) : ffmpegCheck.upToDate ? (
                <p className="mt-3 text-sm text-sc64-good">ffmpeg is up to date ({ffmpegCheck.latest}).</p>
              ) : (
                <p className="mt-3 text-sm text-sc64-warn">
                  A newer build is available: {ffmpegCheck.latest}. Use “Update ffmpeg” above.
                </p>
              )
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sc64-muted">
          <RefreshCw className="h-3.5 w-3.5" /> App updates
        </div>
        <p className="mb-3 text-xs text-sc64-muted">
          StreamHarvest checks for updates on startup. Use the button below to check again right now.
        </p>
        <Button variant="outline" size="sm" onClick={() => void window.api.checkForUpdates()}>
          <RefreshCw className="h-3.5 w-3.5" /> Check for app updates
        </Button>
      </Panel>
    </div>
  )
}
