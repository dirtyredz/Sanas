import { restrictWindowBroadcast } from './broadcast'
import { IPC } from '@shared/ipc'
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

let window: BrowserWindow | null = null
export function isInterviewerSender(id: number): boolean {
  return window?.webContents.id === id
}
export async function openInterviewer(onClose: () => void): Promise<void> {
  const bounds = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const own = (window = new BrowserWindow({
    ...bounds,
    title: 'Sanas — Mock interviewer',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  }))
  restrictWindowBroadcast(own, [IPC.MockChanged])
  own.on('closed', () => {
    if (window === own) window = null
    onClose()
  })
  own.webContents.on('render-process-gone', onClose)
  own.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  own.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL)
    await own.loadURL(`${process.env.ELECTRON_RENDERER_URL}/interviewer.html`)
  else await own.loadFile(join(__dirname, '../renderer/interviewer.html'))
  if (!own.isDestroyed()) own.show()
}
export function closeInterviewer(): void {
  window?.destroy()
  window = null
}
