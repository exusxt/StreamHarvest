/**
 * Renderer entry component: the top-level app shell. Applies the active theme,
 * shows the gallery background for glass themes, and routes between the
 * feature screens behind the frameless title bar and sidebar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, RefreshCw, Shuffle, X } from 'lucide-react'
import type { AppStatus, BinaryProgress, DownloadJob, UpdateState, VideoMetadata } from '../../shared/types'
import { QUALITY_PRESETS } from '../../shared/types'
import { applyTheme, formatDuration, isGalleryTheme, THEMES, type ThemeId } from './lib'
import { BACKGROUNDS } from './backgrounds'
import { TitleBar } from './components/TitleBar'
import { Header } from './components/Header'
import { Sidebar, type ScreenId } from './components/Sidebar'
import { Badge, Button, Panel, ProgressBar, Select, Spinner } from './components/ui'
import { UpdateToast } from './components/UpdateToast'
import { HomeScreen } from './screens/HomeScreen'
import { DownloadsScreen } from './screens/DownloadsScreen'
import { SettingsScreen } from './screens/SettingsScreen'

const THEME_KEY = 'streamharvest-theme'

interface ClipItem {
  id: string
  url: string
  meta: VideoMetadata | null
  quality: string
  busy: boolean
  done: boolean
  error: string | null
}

function loadTheme(): ThemeId {
  const saved = window.localStorage.getItem(THEME_KEY)
  return saved && saved in THEMES ? (saved as ThemeId) : 'gallery'
}

export default function App(): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeId>(loadTheme)
  const [version, setVersion] = useState('')
  const [maximized, setMaximized] = useState(false)
  const [screen, setScreen] = useState<ScreenId>('home')
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [galleryBg, setGalleryBg] = useState<string | null>(null)
  const [jobs, setJobs] = useState<DownloadJob[]>([])
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState<BinaryProgress | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [ytDlpDenied, setYtDlpDenied] = useState(false)
  const [ffmpegBusy, setFfmpegBusy] = useState(false)
  const [ffmpegProgress, setFfmpegProgress] = useState<BinaryProgress | null>(null)
  const [ffmpegError, setFfmpegError] = useState<string | null>(null)
  const [ffmpegBannerDismissed, setFfmpegBannerDismissed] = useState(false)
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [clips, setClips] = useState<ClipItem[]>([])

  const refreshStatus = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      setStatus(await window.api.getStatus())
    } catch {
      setStatus(null)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    window.api.getVersion().then(setVersion).catch(() => undefined)
    window.api.windowIsMaximized().then(setMaximized).catch(() => undefined)
    window.api.listDownloads().then(setJobs).catch(() => undefined)
    const offMax = window.api.onWindowMaximized(setMaximized)
    return offMax
  }, [refreshStatus])

  useEffect(() => {
    const offJob = window.api.onJobUpdate((job) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id)
        if (idx === -1) return [job, ...prev]
        const next = [...prev]
        next[idx] = job
        return next
      })
    })
    const offYt = window.api.onYtDlpStatus((yd) => {
      setStatus((prev) => (prev ? { ...prev, ytDlp: yd } : prev))
    })
    const offProgress = window.api.onBinaryProgress(setInstallProgress)
    const offFfmpegStatus = window.api.onFfmpegStatus((ff) => {
      setStatus((prev) => (prev ? { ...prev, ffmpeg: ff } : prev))
    })
    const offFfmpegProgress = window.api.onFfmpegProgress(setFfmpegProgress)
    const offUpdate = window.api.onUpdateEvent(setUpdate)
    const offClip = window.api.onClipboardUrl((url) => {
      setClips((prev) => {
        if (prev.some((c) => c.url === url)) return prev
        const item: ClipItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          url,
          meta: null,
          quality: 'preset:best',
          busy: true,
          done: false,
          error: null
        }
        window.api
          .getSettings()
          .then((s) => updateClip(item.id, { quality: s.audioOnly ? 'preset:audio-mp3' : `preset:${s.defaultFormat ?? 'best'}` }))
          .catch(() => undefined)
        window.api
          .fetchMetadata(url)
          .then((meta) => updateClip(item.id, { meta, busy: false }))
          .catch(() => updateClip(item.id, { meta: null, busy: false }))
        return [...prev, item]
      })
    })
    return () => {
      offJob()
      offYt()
      offProgress()
      offFfmpegStatus()
      offFfmpegProgress()
      offUpdate()
      offClip()
    }
  }, [])

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!isGalleryTheme(theme)) {
      setGalleryBg(null)
      return
    }
    setGalleryBg(BACKGROUNDS.length > 0 ? BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)] : null)
  }, [theme])

  const shuffleBg = (): void => {
    setGalleryBg((prev) => {
      if (BACKGROUNDS.length === 0) return prev
      if (BACKGROUNDS.length === 1) return BACKGROUNDS[0]
      let next = prev
      while (next === prev) {
        next = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]
      }
      return next
    })
  }

  const ytDlpMissing = status ? !status.ytDlp.present && !status.ytDlp.busy : false
  const showInstallModal = ytDlpMissing && !ytDlpDenied

  const installYtDlp = async (): Promise<void> => {
    setInstalling(true)
    setInstallError(null)
    try {
      const res = await window.api.installYtDlp()
      if (!res.ok) setInstallError(res.message)
      await refreshStatus()
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
      setInstallProgress(null)
    }
  }

  const updateYtDlp = async (): Promise<void> => {
    setInstalling(true)
    setInstallError(null)
    try {
      const res = await window.api.updateYtDlp()
      if (!res.ok) setInstallError(res.message)
      await refreshStatus()
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
      setInstallProgress(null)
    }
  }

  const installFfmpeg = async (): Promise<void> => {
    setFfmpegBusy(true)
    setFfmpegError(null)
    setFfmpegBannerDismissed(false)
    try {
      const res = await window.api.installFfmpeg()
      if (!res.ok) setFfmpegError(res.message)
      await refreshStatus()
    } catch (e) {
      setFfmpegError(e instanceof Error ? e.message : String(e))
    } finally {
      setFfmpegBusy(false)
      setFfmpegProgress(null)
    }
  }

  const updateFfmpeg = async (): Promise<void> => {
    setFfmpegBusy(true)
    setFfmpegError(null)
    try {
      const res = await window.api.updateFfmpeg()
      if (!res.ok) setFfmpegError(res.message)
      await refreshStatus()
    } catch (e) {
      setFfmpegError(e instanceof Error ? e.message : String(e))
    } finally {
      setFfmpegBusy(false)
      setFfmpegProgress(null)
    }
  }

  const removeFfmpeg = async (): Promise<void> => {
    setFfmpegBusy(true)
    setFfmpegError(null)
    try {
      const res = await window.api.removeFfmpeg()
      if (!res.ok) setFfmpegError(res.message)
      await refreshStatus()
    } catch (e) {
      setFfmpegError(e instanceof Error ? e.message : String(e))
    } finally {
      setFfmpegBusy(false)
      setFfmpegProgress(null)
    }
  }

  const activeCount = jobs.filter((j) => j.status === 'downloading' || j.status === 'queued').length
  const isMac = status?.platform === 'darwin'

  const updateClip = (id: string, patch: Partial<ClipItem>): void => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const abortClip = (item: ClipItem): void => {
    void window.api.consumeClipboardUrl(item.url)
    setClips((prev) => prev.filter((c) => c.id !== item.id))
  }

  const clearClips = (): void => {
    for (const c of clips) void window.api.consumeClipboardUrl(c.url)
    setClips([])
  }

  const downloadClip = async (item: ClipItem): Promise<void> => {
    if (item.busy || item.done) return
    let presetId = 'best'
    let formatId: string | undefined
    if (item.quality.startsWith('format:')) {
      formatId = item.quality.slice('format:'.length)
      presetId = ''
    } else if (item.quality.startsWith('preset:')) {
      presetId = item.quality.slice('preset:'.length)
    }
    const meta = item.meta && !item.meta.error ? item.meta : null
    updateClip(item.id, { busy: true, error: null })
    try {
      const res = await window.api.startDownload({
        url: item.url,
        presetId,
        formatId,
        title: meta?.title || item.url,
        thumbnail: meta?.thumbnail ?? null,
        playlist: meta ? meta.playlist : true
      })
      if (!res.ok) {
        updateClip(item.id, { busy: false, error: res.error ?? 'Could not start the download.' })
        return
      }
      if (res.job) setJobs((prev) => (prev.some((j) => j.id === res.job!.id) ? prev : [res.job!, ...prev]))
      updateClip(item.id, { busy: false, done: true })
      setTimeout(() => setClips((prev) => prev.filter((c) => c.id !== item.id)), 1400)
    } finally {
      updateClip(item.id, { busy: false })
    }
  }

  const moveJob = async (id: string, direction: -1 | 1): Promise<void> => {
    const next = await window.api.moveDownload(id, direction).catch(() => null)
    if (next) setJobs(next)
  }

  const screenEl = useMemo(() => {
    switch (screen) {
      case 'home':
        return <HomeScreen status={status} onGoDownloads={() => setScreen('downloads')} />
      case 'downloads':
        return <DownloadsScreen jobs={jobs} onMove={moveJob} />
      case 'settings':
        return (
          <SettingsScreen
            status={status}
            theme={theme}
            onThemeChange={setTheme}
            engineBusy={installing}
            installProgress={installProgress}
            onInstall={() => void installYtDlp()}
            onUpdate={() => void updateYtDlp()}
            ffmpegBusy={ffmpegBusy}
            ffmpegProgress={ffmpegProgress}
            ffmpegError={ffmpegError}
            onInstallFfmpeg={() => void installFfmpeg()}
            onUpdateFfmpeg={() => void updateFfmpeg()}
            onRemoveFfmpeg={() => void removeFfmpeg()}
          />
        )
    }
  }, [screen, jobs, status, theme, installing, installProgress, ffmpegBusy, ffmpegProgress, ffmpegError])

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      {isGalleryTheme(theme) && galleryBg ? (
        <>
          <img src={galleryBg} alt="" className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 z-0" style={{ background: THEMES[theme].vars['--sc64-gallery-overlay'] }} />
        </>
      ) : null}

      <div className="relative z-40 shrink-0">
        <TitleBar
          version={version}
          theme={theme}
          maximized={maximized}
          onThemeChange={setTheme}
          onMinimize={() => void window.api.windowMinimize()}
          onToggleMaximize={() => void window.api.windowToggleMaximize().then(setMaximized)}
          onClose={() => void window.api.windowClose()}
        />
      </div>

      {showInstallModal ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-md rounded-xl border border-sc64-border bg-sc64-panel p-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-sc64-warn" />
              <h2 className="text-base font-bold text-sc64-text">yt-dlp is required</h2>
            </div>
            <p className="mt-2 text-sm text-sc64-muted">
              StreamHarvest uses <span className="font-mono text-sc64-text">yt-dlp</span> as its download engine. It is
              missing, so downloads are disabled until it is installed.
            </p>
            {installError ? <Panel className="mt-3 border-sc64-bad/40 text-xs text-sc64-bad">{installError}</Panel> : null}
            {installProgress && installProgress.total > 0 ? (
              <div className="mt-4">
                <ProgressBar value={installProgress.received} max={installProgress.total} label="Downloading yt-dlp…" />
              </div>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="primary" disabled={installing} onClick={() => void installYtDlp()}>
                {installing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {installing ? 'Installing…' : 'Download yt-dlp'}
              </Button>
              <Button variant="ghost" disabled={installing} onClick={() => void refreshStatus()}>
                Check again
              </Button>
              <Button variant="ghost" disabled={installing} onClick={() => setYtDlpDenied(true)}>
                No thanks — I'll install it myself
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar active={screen} onNavigate={setScreen} disabled={false} />

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-5">
          <Header status={status} refreshing={refreshing} onRefresh={() => void refreshStatus()} activeCount={activeCount} />

          {status && !status.ffmpeg.present && !ffmpegBannerDismissed ? (
            <div className="mb-5 rounded-xl border border-sc64-warn/40 bg-sc64-warn/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sc64-warn" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-sc64-text">ffmpeg is missing</p>
                    <p className="text-xs text-sc64-muted">
                      ffmpeg is needed to merge video + audio streams and to convert formats.{' '}
                      {isMac
                        ? 'Install it with Homebrew (one command) to enable every quality.'
                        : 'Download it so every quality works.'}
                    </p>
                    {ffmpegError ? <p className="mt-1 text-xs text-sc64-bad">{ffmpegError}</p> : null}
                    {ffmpegProgress && ffmpegProgress.total > 0 ? (
                      <div className="mt-2 max-w-sm">
                        <ProgressBar value={ffmpegProgress.received} max={ffmpegProgress.total} label="Downloading ffmpeg…" />
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isMac ? (
                    <>
                      <code className="rounded-md border border-sc64-border bg-sc64-panel px-2.5 py-1.5 font-mono text-xs text-sc64-text">
                        brew install ffmpeg
                      </code>
                      <Button variant="outline" size="sm" onClick={() => void refreshStatus()}>
                        <RefreshCw className="h-3.5 w-3.5" /> Check again
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="primary" size="sm" disabled={ffmpegBusy} onClick={() => void installFfmpeg()}>
                        {ffmpegBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {ffmpegBusy ? 'Installing…' : 'Download ffmpeg'}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={ffmpegBusy} onClick={() => setFfmpegBannerDismissed(true)} title="Dismiss">
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <main className="flex-1">{screenEl}</main>
          <footer className="mt-6 flex items-center justify-between border-t border-sc64-border pt-4">
            <div className="truncate text-[11px] text-sc64-muted">
              downloads → {status?.downloadsDir ?? '…'}
            </div>
            <div className="flex items-center gap-2">
              {isGalleryTheme(theme) ? (
                <Button variant="outline" size="sm" onClick={shuffleBg} title="Shuffle background">
                  <Shuffle className="h-3.5 w-3.5" /> Shuffle
                </Button>
              ) : null}
            </div>
          </footer>
        </div>
      </div>

      {update && update.state !== 'not-available' ? (
        <div className="pointer-events-none absolute bottom-4 right-4 z-50">
          <UpdateToast state={update} onDismiss={() => setUpdate(null)} />
        </div>
      ) : null}

      {clips.length > 0 ? (
        <div className="absolute bottom-4 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 px-4">
          <div className="flex max-h-[55vh] flex-col overflow-hidden rounded-xl border border-sc64-border bg-sc64-panel shadow-2xl shadow-black/50">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sc64-border px-3 py-2">
              <p className="text-xs font-semibold text-sc64-text">
                {clips.length} link{clips.length === 1 ? '' : 's'} found in clipboard
              </p>
              <Button variant="ghost" size="sm" onClick={clearClips}>
                <X className="h-3.5 w-3.5" /> Clear all
              </Button>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto p-2">
              {clips.map((item) =>
                item.busy ? (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-3 text-sm text-sc64-muted">
                    <Spinner className="h-4 w-4 text-sc64-accent" /> Fetching video info…
                  </div>
                ) : item.meta && !item.meta.error ? (
                  <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-sc64-border bg-sc64-panel2/40 p-2 sm:flex-row sm:items-center">
                    {item.meta.thumbnail ? (
                      <div className="relative w-full shrink-0 sm:w-36">
                        <img src={item.meta.thumbnail} alt="" className="aspect-video w-full rounded-md border border-sc64-border object-cover" />
                        {item.meta.duration ? (
                          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 font-mono text-[10px] text-white">
                            {formatDuration(item.meta.duration)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone="accent">{item.meta.playlist ? 'Playlist' : 'Video'}</Badge>
                        {item.meta.playlist && item.meta.entryCount ? (
                          <Badge tone="default">{item.meta.entryCount} videos</Badge>
                        ) : null}
                      </div>
                      <h3 className="truncate text-sm font-semibold text-sc64-text" title={item.meta.title}>
                        {item.meta.title}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <div className="min-w-0 sm:w-52">
                          <Select value={item.quality} onChange={(e) => updateClip(item.id, { quality: e.target.value })} className="w-full">
                            <optgroup label="Presets">
                              {QUALITY_PRESETS.map((p) => (
                                <option key={p.id} value={`preset:${p.id}`}>
                                  {p.label}
                                </option>
                              ))}
                            </optgroup>
                            {item.meta.formats.length > 0 ? (
                              <optgroup label="Specific formats (advanced)">
                                {item.meta.formats.map((f) => (
                                  <option key={f.id} value={`format:${f.id}`}>
                                    {f.label}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                          </Select>
                        </div>
                        {item.done ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sc64-good">
                            <Download className="h-3.5 w-3.5" /> Added to queue
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Button variant="primary" size="sm" disabled={item.busy} onClick={() => void downloadClip(item)}>
                              {item.busy ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                              Download
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => abortClip(item)}>
                              Abort
                            </Button>
                          </div>
                        )}
                      </div>
                      {item.error ? <p className="mt-1.5 text-xs text-sc64-bad">{item.error}</p> : null}
                    </div>
                  </div>
                ) : (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border border-sc64-border bg-sc64-panel2/40 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-sc64-text" title={item.url}>
                        {item.url}
                      </p>
                      <p className="mt-0.5 text-[11px] text-sc64-warn">
                        Couldn't fetch video info — downloads with the default preset.
                      </p>
                      {item.error ? <p className="mt-1 text-xs text-sc64-bad">{item.error}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button variant="primary" size="sm" disabled={item.busy || item.done} onClick={() => void downloadClip(item)}>
                        {item.busy ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                        Download
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => abortClip(item)}>
                        Abort
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
