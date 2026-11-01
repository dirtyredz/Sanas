import type { Workspace } from './overlay-navigation'

// Local overlay shortcuts — only while the overlay window has focus. The global shortcuts
// (show/hide, Answer now, Ask, Capture, slides) are registered by main and live in Settings.
// Settings → Hotkeys imports LOCAL_SHORTCUTS so the documented labels never drift.

export const WORKSPACE_LABELS: Record<Workspace, string> = {
  answer: 'Answer',
  ask: 'Ask',
  screen: 'Screen',
  slide: 'Slide',
  transcript: 'Transcript',
  context: 'Context',
}

const WORKSPACE_KEYS: Record<string, Workspace> = {
  '1': 'answer',
  '2': 'ask',
  '3': 'screen',
  '4': 'slide',
  '5': 'transcript',
  '6': 'context',
}

export const LOCAL_SHORTCUTS: { keys: string; action: string }[] = [
  ...Object.entries(WORKSPACE_KEYS).map(([digit, workspace]) => ({
    keys: `Ctrl+${digit}`,
    action: WORKSPACE_LABELS[workspace],
  })),
  { keys: 'Ctrl+,', action: 'Overlay preferences' },
  { keys: 'Esc', action: 'Close preferences, else back to Answer and release focus' },
]

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
