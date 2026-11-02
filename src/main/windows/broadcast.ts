import { BrowserWindow } from 'electron'
const restricted = new Map<number, Set<string>>()
/** Output-only windows must not receive transcripts or Sanas suggestions. */
export function restrictWindowBroadcast(window: BrowserWindow, channels: string[]): void {
  const id = window.webContents.id
  restricted.set(id, new Set(channels))
  window.on('closed', () => restricted.delete(id))
}

let rehearsalObserver: ((channel: string, payload: unknown) => void) | undefined
export function observeRehearsalBroadcast(observer: typeof rehearsalObserver): void {
  if (!process.argv.includes('--rehearsal')) throw new Error('Rehearsal mode required')
  rehearsalObserver = observer
}

/** Push an event to every open window (library + overlay). Main → renderer only. */
export function broadcast(channel: string, payload: unknown): void {
  rehearsalObserver?.(channel, payload)
  for (const win of BrowserWindow.getAllWindows()) {
    if (
      !win.isDestroyed() &&
      (!restricted.has(win.webContents.id) || restricted.get(win.webContents.id)!.has(channel))
    )
      win.webContents.send(channel, payload)
  }
}
