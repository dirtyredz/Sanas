import type { HotkeyAction, HotkeyStatus } from '@shared/hotkeys/types'

const REPEAT_GUARDED = new Set<HotkeyAction>(['captureHotkey', 'pauseHotkey'])

let statuses: HotkeyStatus[] = []
export function hotkeyStatus(): HotkeyStatus[] {
  return statuses.map((s) => ({ ...s }))
}

export function registerShortcuts(
  register: (accelerator: string, callback: () => void) => boolean,
  settings: Partial<Record<HotkeyAction, string>>,
  callbacks: Partial<Record<HotkeyAction, () => void | Promise<void>>>,
  report: (error: unknown) => void,
  now: () => number = () => performance.now(),
): HotkeyStatus[] {
  const seen = new Set<string>()
  const lastPress = new Map<HotkeyAction, number>()
  statuses = (Object.keys(callbacks) as HotkeyAction[]).map((action) => {
    const accelerator = settings[action] ?? ''
    try {
      const key = accelerator
        .toLowerCase()
        .replace(/commandorcontrol|ctrl/g, 'control')
        .split('+')
        .sort()
        .join('+')
      if (seen.has(key)) throw new Error('Duplicate shortcut.')
      seen.add(key)
      const registered = register(accelerator, () => {
        // a held toggle-like shortcut auto-repeats: one action per deliberate press
        if (REPEAT_GUARDED.has(action)) {
          const time = now()
          if (time - (lastPress.get(action) ?? -Infinity) < 1000) return
          lastPress.set(action, time)
        }
        try {
          Promise.resolve(callbacks[action]?.()).catch(report)
        } catch (e) {
          report(e)
        }
      })
      return {
        action,
        accelerator,
        registered,
        ...(registered ? {} : { error: 'Shortcut is occupied or unavailable.' }),
      }
    } catch (e) {
      return {
        action,
        accelerator,
        registered: false,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  })
  return hotkeyStatus()
}
