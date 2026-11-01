// Overlay workspace names and the local shortcut table. Data only: shared by the overlay
// (rail, key matcher) and Settings → Hotkeys, so the documented labels never drift.

export const WORKSPACES = ['answer', 'ask', 'screen', 'slide', 'transcript', 'context'] as const
export type Workspace = (typeof WORKSPACES)[number]

export const WORKSPACE_LABELS: Record<Workspace, string> = {
  answer: 'Answer',
  ask: 'Ask',
  screen: 'Screen',
  slide: 'Slide',
  transcript: 'Transcript',
  context: 'Context',
}

export const WORKSPACE_KEYS: Record<string, Workspace> = {
  '1': 'answer',
  '2': 'ask',
  '3': 'screen',
  '4': 'slide',
  '5': 'transcript',
  '6': 'context',
}

/** Shortcuts that work only while the overlay window has focus. */
export const LOCAL_SHORTCUTS: { keys: string; action: string }[] = [
  ...Object.entries(WORKSPACE_KEYS).map(([digit, workspace]) => ({
    keys: `Ctrl+${digit}`,
    action: WORKSPACE_LABELS[workspace],
  })),
  { keys: 'Ctrl+,', action: 'Overlay preferences' },
  { keys: 'Esc', action: 'Close preferences, else back to Answer and release focus' },
]
