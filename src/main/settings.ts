// App settings persistence: stored as JSON under userData\settings.json.

import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AppSettings } from '../shared/types'
import { parseTimeOfDay } from '../shared/schedule'

const defaultDownloadsDir = join(homedir(), 'Downloads', 'StreamHarvest')

const DEFAULTS: AppSettings = {
  downloadsDir: defaultDownloadsDir,
  defaultFormat: 'best',
  concurrentLimit: 2,
  audioOnly: false,
  clipboardMonitor: true,
  minimizeToTray: false,
  autoUpdateEngine: true,
  notifications: true,
  embedMetadata: true,
  embedThumbnail: true,
  outputFormat: 'original',
  outputLayout: 'flat',
  filenameTemplate: '%(title)s [%(id)s]',
  subtitles: false,
  subtitleLangs: 'en',
  embedSubtitles: false,
  language: 'en',
  globalHotkey: true,
  speedLimit: '',
  downloadWindowEnabled: false,
  downloadWindowStart: '22:00',
  downloadWindowEnd: '06:00',
  speedWindowEnabled: false,
  speedWindowStart: '09:00',
  speedWindowEnd: '18:00',
  speedWindowLimit: '2M',
  proxy: '',
  advancedMode: false,
  extraArgs: '',
  onboarded: false
}

let settings: AppSettings = { ...DEFAULTS }

/**
 * Strips characters that would break an output file name (Windows-illegal
 * separators and control chars) and trims trailing dots/spaces.
 */
function sanitizeFilenameTemplate(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/[\s.]+$/g, '')
    .slice(0, 120)
    .trim()
}

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** Keeps the schedule fields in range after a load or a settings patch. */
function normalizeSchedule(s: AppSettings): void {
  s.downloadWindowEnabled = s.downloadWindowEnabled === true
  if (parseTimeOfDay(s.downloadWindowStart) === null) s.downloadWindowStart = DEFAULTS.downloadWindowStart
  if (parseTimeOfDay(s.downloadWindowEnd) === null) s.downloadWindowEnd = DEFAULTS.downloadWindowEnd
  s.speedWindowEnabled = s.speedWindowEnabled === true
  if (parseTimeOfDay(s.speedWindowStart) === null) s.speedWindowStart = DEFAULTS.speedWindowStart
  if (parseTimeOfDay(s.speedWindowEnd) === null) s.speedWindowEnd = DEFAULTS.speedWindowEnd
  if (typeof s.speedWindowLimit !== 'string') s.speedWindowLimit = DEFAULTS.speedWindowLimit
}

/** Loads persisted settings (if any), merging over the defaults. */
export async function loadSettings(): Promise<void> {
  try {
    const parsed = JSON.parse(await readFile(settingsFile(), 'utf-8')) as Partial<AppSettings>
    settings = { ...DEFAULTS, ...parsed }
    settings.concurrentLimit = Math.max(1, Math.min(8, Math.floor(settings.concurrentLimit) || 1))
    if (typeof settings.downloadsDir !== 'string' || !settings.downloadsDir) settings.downloadsDir = DEFAULTS.downloadsDir
    settings.clipboardMonitor = settings.clipboardMonitor !== false
    settings.minimizeToTray = settings.minimizeToTray === true
    settings.autoUpdateEngine = settings.autoUpdateEngine !== false
    settings.notifications = settings.notifications !== false
    settings.embedMetadata = settings.embedMetadata !== false
    settings.embedThumbnail = settings.embedThumbnail !== false
    settings.outputFormat = ['original', 'mp4', 'mkv', 'webm'].includes(settings.outputFormat ?? '') ? settings.outputFormat : 'original'
    settings.outputLayout = ['flat', 'site', 'date', 'playlist'].includes(settings.outputLayout ?? '') ? settings.outputLayout : 'flat'
    settings.filenameTemplate = typeof settings.filenameTemplate === 'string' && settings.filenameTemplate.trim() ? sanitizeFilenameTemplate(settings.filenameTemplate) : DEFAULTS.filenameTemplate
    settings.subtitles = settings.subtitles === true
    settings.embedSubtitles = settings.embedSubtitles === true
    if (typeof settings.subtitleLangs !== 'string' || !settings.subtitleLangs.trim()) settings.subtitleLangs = DEFAULTS.subtitleLangs
    settings.language = settings.language === 'de' ? 'de' : 'en'
    settings.globalHotkey = settings.globalHotkey !== false
    if (typeof settings.speedLimit !== 'string') settings.speedLimit = DEFAULTS.speedLimit
    if (typeof settings.proxy !== 'string') settings.proxy = DEFAULTS.proxy
    settings.advancedMode = settings.advancedMode === true
    if (typeof settings.extraArgs !== 'string') settings.extraArgs = DEFAULTS.extraArgs
    settings.onboarded = settings.onboarded === true
    normalizeSchedule(settings)
  } catch {
    // no settings yet — keep defaults
  }
}

export function getSettings(): AppSettings {
  return settings
}

/** Merges a patch, validates and persists. Resolves with the new settings. */
export async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  settings = { ...settings, ...patch }
  settings.concurrentLimit = Math.max(1, Math.min(8, Math.floor(settings.concurrentLimit) || 1))
  if (typeof settings.filenameTemplate === 'string') {
    settings.filenameTemplate = sanitizeFilenameTemplate(settings.filenameTemplate) || DEFAULTS.filenameTemplate
  } else {
    settings.filenameTemplate = DEFAULTS.filenameTemplate
  }
  normalizeSchedule(settings)
  try {
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(settingsFile(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch {
    // best-effort
  }
  return settings
}
