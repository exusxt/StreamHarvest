/**
 * Shared global-hotkey constants (Phase 4). The accelerator string is used by
 * the main process (globalShortcut) and the label by the renderer (settings +
 * onboarding), so it lives in shared to keep both bundles in sync.
 */

export const HOTKEY_ACCELERATOR = 'CommandOrControl+Shift+D'

/** Human-readable shortcut label for the given platform ('darwin' shows ⌘). */
export function hotkeyLabel(platform: string): string {
  return platform === 'darwin' ? '⌘⇧D' : 'Ctrl+Shift+D'
}
