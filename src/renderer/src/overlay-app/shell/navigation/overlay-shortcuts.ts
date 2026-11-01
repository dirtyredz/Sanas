import { WORKSPACE_KEYS, type Workspace } from '../../../lib/overlay-workspaces'

// Local overlay shortcuts — only while the overlay window has focus. The global shortcuts
// (show/hide, Answer now, Ask, Capture, slides) are registered by main and live in Settings.
// The label/key table is shared data in lib/overlay-workspaces.ts.

export function workspaceShortcut(workspace: Workspace): string {
  const digit = Object.keys(WORKSPACE_KEYS).find((key) => WORKSPACE_KEYS[key] === workspace)
  return `Ctrl+${digit}`
}

export type ShortcutAction =
  { type: 'workspace'; workspace: Workspace } | { type: 'preferences' } | { type: 'escape' }

export interface ShortcutKey {
  key: string
  code?: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  isComposing?: boolean
}

/** The overlay's reserved chords. They work inside draft fields too (none of them types a
 *  character there), but never during IME composition, and ordinary typing, selection,
 *  clipboard keys and arrows are never claimed. */
export function overlayShortcut(e: ShortcutKey): ShortcutAction | null {
  if (e.isComposing || e.key === 'Process') return null
  if (e.key === 'Escape') {
    return e.ctrlKey || e.altKey || e.shiftKey || e.metaKey ? null : { type: 'escape' }
  }
  if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return null
  if (e.key === ',') return { type: 'preferences' }
  const digit = /^(?:Digit|Numpad)([1-6])$/.exec(e.code ?? '')?.[1] ?? e.key
  const workspace = WORKSPACE_KEYS[digit]
  return workspace ? { type: 'workspace', workspace } : null
}
