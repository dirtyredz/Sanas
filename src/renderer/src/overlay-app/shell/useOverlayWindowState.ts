import { useEffect, useState } from 'react'
import type { SettingsView } from '@shared/types'
import { hotkeyLabel } from '../../lib/hotkey-label'

export interface GlobalShortcutLabels {
  /** Show / hide / unghost the overlay. */
  overlay: string
  capture: string
  compose: string
}

export interface OverlayWindowState {
  /** Clicks pass through the window; only the overlay shortcut restores it. */
  ghost: boolean
  /** The configured global shortcuts, as keycap labels ('' until settings load). */
  shortcuts: GlobalShortcutLabels
}

const NO_SHORTCUTS: GlobalShortcutLabels = { overlay: '', capture: '', compose: '' }

/** Window-lifetime state: ghost mode and the global shortcuts the overlay mentions.
 *  Independent of the meeting, so it is never reset with meeting-owned drafts. */
export function useOverlayWindowState(): OverlayWindowState {
  const [ghost, setGhost] = useState(false)
  const [shortcuts, setShortcuts] = useState(NO_SHORTCUTS)
  useEffect(() => window.sanas.overlay.onGhostState(setGhost), [])
  useEffect(() => {
    let active = true
    const apply = (settings: SettingsView): void => {
      if (!active) return
      setShortcuts({
        overlay: hotkeyLabel(settings.overlayHotkey),
        capture: hotkeyLabel(settings.captureHotkey),
        compose: hotkeyLabel(settings.composeHotkey),
      })
    }
    void window.sanas.settings
      .get()
      .then(apply)
      .catch(() => {})
    const remove = window.sanas.settings.onChanged(apply)
    return () => {
      active = false
      remove()
    }
  }, [])
  return { ghost, shortcuts }
}
