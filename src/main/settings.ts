// App settings persistence: stored as JSON under userData\settings.json.

import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AppSettings } from '../shared/types'

const defaultDownloadsDir = join(homedir(), 'Downloads', 'StreamHarvest')

const DEFAULTS: AppSettings = {
  downloadsDir: defaultDownloadsDir,
  defaultFormat: 'best',
  concurrentLimit: 2,
  audioOnly: false,
  clipboardMonitor: true,
  minimizeToTray: false,
  notifications: true,
  embedMetadata: true,
  embedThumbnail: true,
  outputFormat: 'original',
  outputLayout: 'flat',
  subtitles: false,
  subtitleLangs: 'en',
  embedSubtitles: false,
  language: 'en',
  globalHotkey: true,
  speedLimit: '',
  proxy: '',
  advancedMode: false,
  extraArgs: '',
  onboarded: false
}

let settings: AppSettings = { ...DEFAULTS }

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
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
    settings.notifications = settings.notifications !== false
    settings.embedMetadata = settings.embedMetadata !== false
    settings.embedThumbnail = settings.embedThumbnail !== false
    settings.outputFormat = ['original', 'mp4', 'mkv', 'webm'].includes(settings.outputFormat ?? '') ? settings.outputFormat : 'original'
    settings.outputLayout = ['flat', 'site', 'date', 'playlist'].includes(settings.outputLayout ?? '') ? settings.outputLayout : 'flat'
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
  try {
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(settingsFile(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch {
    // best-effort
  }
  return settings
}
