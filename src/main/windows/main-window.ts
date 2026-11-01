import { BrowserWindow } from 'electron'
import { join } from 'path'
import { mainWindowChromeOptions } from './window-chrome'

let mainWindow: BrowserWindow | null = null

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

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    title: 'Sanas',
    ...mainWindowChromeOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses require for electron APIs; renderer stays isolated
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}
