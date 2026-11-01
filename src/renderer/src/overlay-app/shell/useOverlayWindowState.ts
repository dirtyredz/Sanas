import { useEffect, useState } from 'react'
import { hotkeyLabel } from '../../lib/hotkey-label'

export interface OverlayWindowState {
  /** Clicks pass through the window; only the overlay shortcut restores it. */
  ghost: boolean
  /** The configured show/hide/unghost shortcut, as its keycap label. */
  overlayShortcut: string
}

/** Window-lifetime state: ghost mode and the shortcut that restores it. Independent of the
 *  meeting, so it is never reset with meeting-owned drafts. */
export function useOverlayWindowState(): OverlayWindowState {
  const [ghost, setGhost] = useState(false)
  const [overlayShortcut, setOverlayShortcut] = useState('')
  useEffect(() => window.sanas.overlay.onGhostState(setGhost), [])
  useEffect(() => {
    let active = true
    const apply = (settings: { overlayHotkey: string }): void => {
      if (active) setOverlayShortcut(hotkeyLabel(settings.overlayHotkey))
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
  return { ghost, overlayShortcut }
}
