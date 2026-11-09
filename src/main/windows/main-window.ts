import type { BrowserWindow } from 'electron'
import { createAppWindow, loadAppPage } from './app-window'
import { mainWindowChromeOptions } from './window-chrome'

let mainWindow: BrowserWindow | null = null
let closedHandler: (() => void) | undefined

/** What happens when the main window closes is app policy (lifecycle/start.ts registers it);
 *  this module only owns the window. */
export function onMainWindowClosed(handler: () => void): void {
  closedHandler = handler
}

/** True when an IPC sender is the library window (privileged job deletion/import). */
export function isMainWindowSender(id: number): boolean {
  return !!mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.id === id
}

/** Reveals the existing main window without reloading it: restore if minimized, show if
 *  hidden, then focus. The Live page (and its microphone session) stays mounted. */
function reveal(window: BrowserWindow): BrowserWindow {
  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  window.focus()
  return window
}

/** Startup, second-instance and the overlay's Open Sanas all come here: reveal the window
 *  that exists, or create it. */
export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return reveal(mainWindow)

  mainWindow = createAppWindow({
    window: {
      width: 1100,
      height: 750,
      show: false,
      autoHideMenuBar: true,
      title: 'Sanas',
      ...mainWindowChromeOptions(),
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    closedHandler?.()
  })

  void loadAppPage(mainWindow, 'index.html')
  return mainWindow
}
