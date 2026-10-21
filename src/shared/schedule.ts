/**
 * Daily schedule helpers (Phase 5, 0.8.0). Times are 'HH:MM' strings in the
 * user's local time zone; a window may cross midnight (e.g. 22:00 → 06:00).
 */

import type { AppSettings, ScheduleState } from './types'

/** Parses 'HH:MM' into minutes since midnight; null when invalid. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * True when `now` falls inside the daily [start, end) window. Windows that
 * cross midnight wrap around. Equal or invalid bounds mean "always open".
 */
export function isWithinWindow(now: Date, start: string, end: string): boolean {
  const from = parseTimeOfDay(start)
  const to = parseTimeOfDay(end)
  if (from === null || to === null || from === to) return true
  const minutes = now.getHours() * 60 + now.getMinutes()
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to
}

/** Speed limit to hand to yt-dlp, honouring the optional per-time-of-day window. */
export function effectiveSpeedLimit(
  settings: Pick<AppSettings, 'speedLimit' | 'speedWindowEnabled' | 'speedWindowStart' | 'speedWindowEnd' | 'speedWindowLimit'>,
  now: Date
): string {
  const base = settings.speedLimit.trim()
  if (!settings.speedWindowEnabled) return base
  return isWithinWindow(now, settings.speedWindowStart, settings.speedWindowEnd) ? settings.speedWindowLimit.trim() : base
}

/** Snapshot of the scheduling state for the queue UI (via `dl:getStatus`). */
export function scheduleState(settings: AppSettings, now: Date): ScheduleState {
  return {
    downloadWindowEnabled: settings.downloadWindowEnabled,
    downloadAllowed:
      !settings.downloadWindowEnabled || isWithinWindow(now, settings.downloadWindowStart, settings.downloadWindowEnd),
    downloadWindowStart: settings.downloadWindowStart,
    downloadWindowEnd: settings.downloadWindowEnd,
    speedWindowEnabled: settings.speedWindowEnabled,
    speedWindowActive:
      settings.speedWindowEnabled && isWithinWindow(now, settings.speedWindowStart, settings.speedWindowEnd),
    effectiveSpeedLimit: effectiveSpeedLimit(settings, now)
  }
}
