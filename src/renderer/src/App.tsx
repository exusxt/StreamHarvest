/**
 * Renderer entry component: the top-level app shell. Applies the active theme,
 * shows the gallery background for glass themes, and routes between the
 * feature screens behind the frameless title bar and sidebar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, RefreshCw, Shuffle, X } from 'lucide-react'
import type { AppStatus, BinaryProgress, DownloadJob, UpdateState } from '../../shared/types'
import { applyTheme, isGalleryTheme, THEMES, type ThemeId } from './lib'
import { BACKGROUNDS } from './backgrounds'
import { TitleBar } from './components/TitleBar'
import { Header } from './components/Header'
import { Sidebar, type ScreenId } from './components/Sidebar'
import { Button, Panel, ProgressBar } from './components/ui'
import { UpdateToast } from './components/UpdateToast'
import { HomeScreen } from './screens/HomeScreen'
import { DownloadsScreen } from './screens/DownloadsScreen'
import { SettingsScreen } from './screens/SettingsScreen'

const THEME_KEY = 'streamharvest-theme'

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
    return () => {
      offJob()
      offYt()
      offProgress()
      offFfmpegStatus()
      offFfmpegProgress()
      offUpdate()
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

  const screenEl = useMemo(() => {
    switch (screen) {
      case 'home':
        return <HomeScreen status={status} onGoDownloads={() => setScreen('downloads')} />
      case 'downloads':
        return <DownloadsScreen jobs={jobs} />
      case 'settings':
        return (
          <SettingsScreen
            status={status}
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
  }, [screen, jobs, status, installing, installProgress, ffmpegBusy, ffmpegProgress, ffmpegError])

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
    </div>
  )
}
