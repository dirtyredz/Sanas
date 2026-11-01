import type { HotkeyAction, HotkeyStatus } from '@shared/hotkeys/types'
import { hotkeyLabel } from '../../../lib/hotkey-label'
import type { BadgeTone } from '../../controls/Badge'

export interface HotkeyRowState {
  badge: { tone: BadgeTone; text: string } | null
  /** Short lines under the help: why it failed, what waits for a restart, what is unsaved. */
  notes: { tone: 'warn' | 'muted'; text: string }[]
}

/** One global shortcut's state in Settings, from what this run registered at startup, what is
 *  saved, and what is typed. Saved changes only take effect on restart. */
export function describeHotkey(
  action: HotkeyAction,
  draft: Record<HotkeyAction, string>,
  saved: Record<HotkeyAction, string>,
  status: HotkeyStatus | undefined,
): HotkeyRowState {
  const notes: HotkeyRowState['notes'] = []
  let badge: HotkeyRowState['badge'] = null
  if (status) {
    badge = status.registered
      ? { tone: 'ok', text: 'Active' }
      : { tone: 'warn', text: 'Not registered' }
    if (!status.registered) {
      const keys = hotkeyLabel(status.accelerator) || 'This shortcut'
      const reason = (status.error ?? 'could not be registered').replace(/\.+$/, '')
      notes.push({ tone: 'warn', text: `${keys}: ${reason}.` })
    }
    if (saved[action] !== status.accelerator) {
      badge = { tone: 'accent', text: 'Restart to apply' }
      const running = hotkeyLabel(status.accelerator) || 'nothing'
      notes.push({ tone: 'muted', text: `Running ${running} until Sanas restarts.` })
    }
  }
  if (draft[action] !== saved[action]) notes.push({ tone: 'muted', text: 'Unsaved change.' })
  return { badge, notes }
}
