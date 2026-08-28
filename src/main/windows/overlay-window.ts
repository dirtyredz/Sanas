import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import { loadSettings, saveSettings } from '../config/settings'

let overlay: BrowserWindow | null = null
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null

function createOverlay(): BrowserWindow {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  const saved = loadSettings().overlayBounds
  overlay = new BrowserWindow({
    width: saved?.width ?? 380,
    height: saved?.height ?? 460,
    x: saved?.x ?? width - 400,
    y: saved?.y ?? 60,
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

  // remember where the user parks it (debounced — move fires continuously)
  const persistBounds = (): void => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
    saveBoundsTimer = setTimeout(() => {
      if (overlay && !overlay.isDestroyed()) saveSettings({ overlayBounds: overlay.getBounds() })
    }, 500)
  }
  overlay.on('moved', persistBounds)
  overlay.on('resized', persistBounds)

  if (process.env.ELECTRON_RENDERER_URL) {
    overlay.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    overlay.loadFile(join(__dirname, '../renderer/overlay.html'))
  }
  return overlay
}

let clickThrough = false

/** Ghost mode: overlay stays visible but mouse events pass through to the app
 *  underneath. The overlay hotkey restores interactivity (see toggleOverlay). */
export function setClickThrough(on: boolean): void {
  clickThrough = on
  if (overlay && !overlay.isDestroyed()) {
    overlay.setIgnoreMouseEvents(on, { forward: true })
    overlay.webContents.send(IPC.OverlayGhostState, on)
  }
}

export function toggleOverlay(): void {
  if (!overlay || overlay.isDestroyed()) {
    createOverlay().once('ready-to-show', () => overlay?.show())
    return
  }
  // ghost mode active → the hotkey un-ghosts instead of hiding (the only way
  // back, since the window itself no longer receives clicks)
  if (clickThrough) {
    setClickThrough(false)
    overlay.show()
    return
  }
  if (overlay.isVisible()) overlay.hide()
  else overlay.show()
}

export function showOverlay(): void {
  if (!overlay || overlay.isDestroyed()) {
    createOverlay().once('ready-to-show', () => overlay?.show())
    return
  }
  if (!overlay.isVisible()) overlay.show()
}
