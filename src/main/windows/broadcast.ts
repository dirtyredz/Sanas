import { BrowserWindow } from 'electron'

let rehearsalObserver: ((channel: string, payload: unknown) => void) | undefined
export function observeRehearsalBroadcast(observer: typeof rehearsalObserver): void {
  if (!process.argv.includes('--rehearsal')) throw new Error('Rehearsal mode required')
  rehearsalObserver = observer
}

/** Push an event to every open window (library + overlay). Main → renderer only. */
export function broadcast(channel: string, payload: unknown): void {
  rehearsalObserver?.(channel, payload)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
