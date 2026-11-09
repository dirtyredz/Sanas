import { restrictWindowBroadcast } from './broadcast'
import { IPC } from '@shared/ipc'
import { type BrowserWindow, screen } from 'electron'
import { createAppWindow, loadAppPage } from './app-window'

let window: BrowserWindow | null = null
export function isInterviewerSender(id: number): boolean {
  return window?.webContents.id === id
}
export async function openInterviewer(onClose: () => void): Promise<void> {
  const bounds = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const own = (window = createAppWindow({
    window: { ...bounds, title: 'Sanas — Mock interviewer', autoHideMenuBar: true, show: false },
    extraPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  }))
  restrictWindowBroadcast(own, [IPC.MockChanged])
  own.on('closed', () => {
    if (window === own) window = null
    onClose()
  })
  own.webContents.on('render-process-gone', onClose)
  own.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  own.webContents.on('will-navigate', (e) => e.preventDefault())
  await loadAppPage(own, 'interviewer.html')
  if (!own.isDestroyed()) own.show()
}
export function closeInterviewer(): void {
  window?.destroy()
  window = null
}
