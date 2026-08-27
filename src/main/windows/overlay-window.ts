import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

let overlay: BrowserWindow | null = null

function createOverlay(): BrowserWindow {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  overlay = new BrowserWindow({
    width: 380,
    height: 460,
    x: width - 400,
    y: 60,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    title: 'Sanas Overlay',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 'screen-saver' level floats above most fullscreen apps on Windows (see GOTCHAS.md).
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.on('closed', () => (overlay = null))

  if (process.env.ELECTRON_RENDERER_URL) {
    overlay.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    overlay.loadFile(join(__dirname, '../renderer/overlay.html'))
  }
  return overlay
}

export function toggleOverlay(): void {
  if (!overlay || overlay.isDestroyed()) {
    createOverlay().once('ready-to-show', () => overlay?.show())
    return
  }
  if (overlay.isVisible()) overlay.hide()
  else overlay.show()
}
