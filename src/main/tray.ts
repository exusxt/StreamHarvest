// System tray integration: an icon + menu that keeps the app reachable while
// the window is hidden. The tray exists only while "minimize to tray" is on.

import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { AppSettings } from '../shared/types'

function iconPath(): string {
  const name = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return join(app.getAppPath(), 'resources', name)
}

export class TrayController {
  private tray: Tray | null = null

  constructor(
    private getSettings: () => AppSettings,
    private getWindow: () => BrowserWindow | null,
    private onQuit: () => void
  ) {}

  /** Creates or removes the tray icon to match the minimizeToTray setting. */
  sync(): void {
    if (this.getSettings().minimizeToTray && !this.tray) {
      this.create()
    } else if (!this.getSettings().minimizeToTray && this.tray) {
      this.destroy()
    }
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private create(): void {
    const tray = new Tray(nativeImage.createFromPath(iconPath()))
    tray.setToolTip('StreamHarvest')
    const menu = Menu.buildFromTemplate([
      { label: 'Show StreamHarvest', click: () => this.show() },
      { label: 'Hide to tray', click: () => this.getWindow()?.hide() },
      { type: 'separator' },
      { label: 'Quit StreamHarvest', click: () => this.onQuit() }
    ])
    if (process.platform === 'darwin') {
      // On macOS the context menu is the primary surface; a left click shows it.
      tray.setContextMenu(menu)
      tray.on('click', () => this.show())
    } else {
      // On Windows a left click pops the menu up and a double-click restores.
      tray.on('click', () => tray.popUpContextMenu(menu))
      tray.on('double-click', () => this.show())
    }
    this.tray = tray
  }

  private show(): void {
    const win = this.getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}
