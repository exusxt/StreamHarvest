/**
 * Bottom-right toast surfacing the app auto-update flow (checking, available,
 * downloading, downloaded, error). The 'downloaded' state offers the "Restart
 * and install" action; portable builds swap in the new exe, installer builds
 * go through electron-updater's quitAndInstall.
 */
import React from 'react'
import type { UpdateState } from '../../../shared/types'
import { useT } from '../i18n'
import { Button, ProgressBar, Spinner } from './ui'

export function UpdateToast({
  state,
  onDismiss
}: {
  state: UpdateState
  onDismiss: () => void
}): React.JSX.Element {
  const t = useT()
  const title = ((): string => {
    switch (state.state) {
      case 'checking':
        return t('updates.checking')
      case 'available':
        return t('updates.available', { version: state.version ?? '' })
      case 'downloading':
        return t('updates.downloading', { version: state.version ?? '' })
      case 'downloaded':
        return t('updates.downloaded', { version: state.version ?? '' })
      case 'error':
        return t('updates.failed')
      default:
        return ''
    }
  })()

  return (
    <div className="pointer-events-auto w-80 max-w-[calc(100vw-3rem)] rounded-xl border border-sc64-borderlight bg-sc64-panel2/95 shadow-glow backdrop-blur">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 shrink-0">
          {state.state === 'checking' || state.state === 'available' || state.state === 'downloading' ? (
            <Spinner />
          ) : state.state === 'downloaded' ? (
            <span className="text-sc64-good">✓</span>
          ) : (
            <span className="text-sc64-bad">!</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-sc64-text">{title}</div>
          {state.state === 'downloading' ? (
            <ProgressBar
              value={state.percent ?? 0}
              max={100}
              label={state.percent != null ? `${state.percent}%` : undefined}
              className="mt-2"
            />
          ) : state.state === 'available' ? (
            <div className="mt-1 text-xs text-sc64-muted">{t('updates.background')}</div>
          ) : state.state === 'error' && state.message ? (
            <div className="mt-1 break-words text-xs text-sc64-muted">{state.message}</div>
          ) : state.state === 'downloaded' ? (
            <div className="mt-1 text-xs text-sc64-muted">{t('updates.restartToApply')}</div>
          ) : null}
        </div>
        {state.state === 'error' || state.state === 'not-available' ? (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded p-1 text-sc64-muted transition-colors hover:text-sc64-text"
          >
            ×
          </button>
        ) : null}
      </div>
      {state.state === 'downloaded' ? (
        <div className="border-t border-sc64-borderlight p-3">
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() => void window.api.installUpdate()}
          >
            {t('updates.restartInstall')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
