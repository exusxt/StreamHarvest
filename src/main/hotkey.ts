// Global hotkey controller (Phase 4): registers a system-wide shortcut that
// opens the app and forwards whatever link is currently on the clipboard to
// the renderer so the Home screen can paste + fetch it instantly.

import { clipboard, globalShortcut, type BrowserWindow } from 'electron'
import type { AppSettings } from '../shared/types'
import { HOTKEY_ACCELERATOR } from '../shared/hotkey'

export { hotkeyLabel } from '../shared/hotkey'

export class HotkeyController {
  private registered = false

  constructor(
    private getSettings: () => AppSettings,
    private getWindow: () => BrowserWindow | null
  ) {}

  /** Registers/unregisters the shortcut to match the globalHotkey setting. */
  sync(): void {
    const want = this.getSettings().globalHotkey
    if (want && !this.registered) {
      this.register()
    } else if (!want && this.registered) {
      this.unregister()
    }
  }

  unregister(): void {
    globalShortcut.unregister(HOTKEY_ACCELERATOR)
    this.registered = false
  }

  private register(): void {
    const ok = globalShortcut.register(HOTKEY_ACCELERATOR, () => this.trigger())
    this.registered = ok
  }

  private trigger(): void {
    const win = this.getWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
    let url = ''
    try {
      url = clipboard.readText()
    } catch {
      // clipboard unavailable — still show the window
    }
    win?.webContents.send('hotkey:open', url)
  }
}
