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
  audioOnly: false
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
