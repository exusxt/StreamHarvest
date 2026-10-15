/**
 * Followed channels/playlists (Phase 5). Lets the user add a channel or
 * playlist URL, see the follow list, toggle auto-download, pick the quality
 * preset used for queued videos and trigger an on-demand check. The main
 * process polls follows in the background and pushes updates via
 * `window.api.onFollowsUpdated`.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link2, Plus, RefreshCw, Rss, Trash2 } from 'lucide-react'
import type { Follow } from '../../../shared/types'
import { QUALITY_PRESETS } from '../../../shared/types'
import { useT } from '../i18n'
import { Badge, Button, Field, Input, Panel, Select, Spinner } from '../components/ui'

/** Formats an ISO timestamp for the "last checked" line, or null when never. */
function formatWhen(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString(navigator.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return null
  }
}

export function FollowsScreen(): React.JSX.Element {
  const t = useT()
  const [follows, setFollows] = useState<Follow[]>([])
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setFollows(await window.api.listFollows())
  }, [])

  useEffect(() => {
    void refresh()
    return window.api.onFollowsUpdated(setFollows)
  }, [refresh])

  const add = async (): Promise<void> => {
    const value = url.trim()
    if (!value || adding) return
    setAdding(true)
    setError(null)
    setNotice(null)
    try {
      const res = await window.api.addFollow(value)
      if (!res.ok) {
        setError(res.error ?? t('follows.invalidUrl'))
      } else {
        setUrl('')
        await refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  const check = async (follow: Follow): Promise<void> => {
    if (checking) return
    setChecking(follow.id)
    setError(null)
    setNotice(null)
    try {
      const res = await window.api.checkFollow(follow.id)
      if (!res.ok) {
        setError(t('follows.checkFailed', { error: res.error ?? '' }))
      } else if (res.newVideos.length === 0) {
        setNotice(t('follows.upToDate'))
      } else {
        const count = res.newVideos.length
        const title = res.follow?.title ?? follow.title
        if (res.follow?.autoDownload) {
          setNotice(t(count === 1 ? 'follows.queuedOne' : 'follows.queuedMany', { count, title }))
        } else {
          setNotice(t(count === 1 ? 'follows.foundOne' : 'follows.foundMany', { count, title }))
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(null)
    }
  }

  const remove = async (id: string): Promise<void> => {
    if (!window.confirm(t('follows.confirmRemove'))) return
    setFollows(await window.api.removeFollow(id))
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-sc64-text">
          <Rss className="h-5 w-5 text-sc64-accent" />
          {t('follows.title')}
        </h1>
        <p className="mt-1 text-sm text-sc64-muted">{t('follows.subtitle')}</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('follows.add')} className="min-w-[260px] flex-1">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('follows.addPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add()
              }}
              spellCheck={false}
            />
          </Field>
          <Button variant="primary" disabled={adding || !url.trim()} onClick={() => void add()}>
            {adding ? <Spinner /> : <Plus className="h-4 w-4" />}
            {adding ? t('follows.adding') : t('follows.add')}
          </Button>
        </div>
        {error ? <p className="mt-3 text-xs text-sc64-bad">{error}</p> : null}
        {notice ? <p className="mt-3 text-xs text-sc64-good">{notice}</p> : null}
      </Panel>

      {follows.length === 0 ? (
        <Panel className="flex flex-col items-center gap-2 py-10 text-center">
          <Rss className="h-8 w-8 text-sc64-muted/60" />
          <p className="text-sm font-medium text-sc64-text">{t('follows.empty')}</p>
          <p className="max-w-md text-xs text-sc64-muted">{t('follows.emptyHint')}</p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {follows.map((f) => {
            const when = formatWhen(f.lastCheckedAt)
            return (
              <Panel key={f.id} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  {f.thumbnail ? (
                    <img src={f.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-sc64-border object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-sc64-border bg-sc64-panel2">
                      <Rss className="h-5 w-5 text-sc64-muted" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-sc64-text">{f.title}</span>
                      <Badge tone="default">{t(f.type === 'channel' ? 'follows.type.channel' : 'follows.type.playlist')}</Badge>
                      {f.newCount > 0 ? (
                        <button type="button" onClick={() => void window.api.ackFollow(f.id).then(setFollows)}>
                          <Badge tone="accent">{t('follows.newBadge', { count: f.newCount })}</Badge>
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-sc64-muted">
                      <Link2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{f.url}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-sc64-muted">{when ? t('follows.lastChecked', { date: when }) : t('follows.neverChecked')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" disabled={checking === f.id} onClick={() => void check(f)}>
                      {checking === f.id ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {checking === f.id ? t('follows.checking') : t('follows.checkNow')}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(f.id)} aria-label={t('follows.remove')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 border-t border-sc64-border pt-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-sc64-text">
                    <input
                      type="checkbox"
                      checked={f.autoDownload}
                      onChange={(e) => void window.api.updateFollow(f.id, { autoDownload: e.target.checked }).then(setFollows)}
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded border border-sc64-borderlight bg-sc64-panel2 transition-all checked:border-sc64-accent checked:bg-sc64-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-sc64-accent/60"
                    />
                    {f.autoDownload ? t('follows.autoDownload') : t('follows.autoDownloadOff')}
                  </label>
                  <label className="flex items-center gap-2 text-xs text-sc64-muted">
                    {t('follows.preset')}
                    <Select
                      className="w-auto min-w-[180px] py-1 text-xs"
                      value={f.presetId}
                      onChange={(e) => void window.api.updateFollow(f.id, { presetId: e.target.value }).then(setFollows)}
                    >
                      {QUALITY_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
