import { globalShortcut } from 'electron'
import { subscribeMeeting } from '../meetings/observation'
import type { MockSessionDeps } from './turns/session'

export const registerMockShortcuts: MockSessionDeps['controls'] = (actions) => {
  const keys: string[] = []
  const release = (): void => {
    for (const key of keys.splice(0)) globalShortcut.unregister(key)
  }
  try {
    for (const [key, action] of [
      ['CommandOrControl+Alt+Right', actions.skip],
      ['CommandOrControl+Alt+End', actions.end],
      ['CommandOrControl+Alt+Backspace', actions.dismiss],
    ] as const) {
      if (!globalShortcut.register(key, action))
        throw new Error(`Mock interview shortcut unavailable: ${key}`)
      keys.push(key)
    }
  } catch (e) {
    release()
    throw e
  }
  // Shortcuts are released at End, independently of late suggestion observation.
  const unsubscribe = subscribeMeeting((e) => {
    if (e.kind === 'state' && e.value.status !== 'live') release()
  })
  return () => {
    release()
    unsubscribe()
  }
}
