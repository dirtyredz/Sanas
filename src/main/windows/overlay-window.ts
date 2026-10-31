import { BrowserWindow, screen, type Rectangle } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import type { OverlayResizeRequest } from '@shared/types'
import { loadSettings, saveSettings } from '../config/settings'

let overlay: BrowserWindow | null = null
let rendererReady = false
let pendingCompose = false
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null
const MIN_WIDTH = 280
const MIN_HEIGHT = 230

function createOverlay(): BrowserWindow {
  rendererReady = false
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
    // Electron does not support native resizing for transparent windows; renderer grips
    // drive the programmatic resize path below instead.
    resizable: false,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    skipTaskbar: true,
    title: 'Sanas Overlay',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  overlay.setContentProtection(true)
  // 'screen-saver' level floats above most fullscreen apps on Windows (see GOTCHAS.md).
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setOpacity(clampOpacity(loadSettings().overlayOpacity))
  overlay.on('closed', () => (overlay = null))

  // remember where the user parks it (debounced — move fires continuously). The write is
  // wrapped because this runs from a timer: an unwritable settings file would otherwise
  // take the whole app down for the sake of remembering a window position.
  const persistBounds = (): void => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
    saveBoundsTimer = setTimeout(() => {
      if (!overlay || overlay.isDestroyed()) return
      try {
        saveSettings({ overlayBounds: overlay.getBounds() })
      } catch (e) {
        console.warn('[sanas] could not save the overlay position:', e)
      }
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

function clampOpacity(o: number): number {
  return Math.min(1, Math.max(0.4, Number.isFinite(o) ? o : 1))
}

/** Where the overlay sits, even while hidden or ghosted; null when it has no window. Screen
 *  capture uses it to pick the display under the overlay. */
export function overlayBounds(): Rectangle | null {
  return overlay && !overlay.isDestroyed() ? overlay.getBounds() : null
}

/** Live-applies opacity when settings change (no-op if overlay not open). */
export function applyOverlayOpacity(opacity: number): void {
  if (overlay && !overlay.isDestroyed()) overlay.setOpacity(clampOpacity(opacity))
}

/** Programmatic resize path for transparent windows, which have no native resize border. */
export function resizeOverlay(request: OverlayResizeRequest): void {
  if (!overlay || overlay.isDestroyed()) return

  const bounds = overlay.getBounds()
  const workArea = screen.getDisplayMatching(bounds).workArea
  const right = workArea.x + workArea.width
  const bottom = workArea.y + workArea.height
  const x = Math.min(Math.max(bounds.x, workArea.x), right - MIN_WIDTH)
  const y = Math.min(Math.max(bounds.y, workArea.y), bottom - MIN_HEIGHT)
  const width = Math.min(Math.max(request.width ?? bounds.width, MIN_WIDTH), right - x)
  const height = Math.min(Math.max(request.height ?? bounds.height, MIN_HEIGHT), bottom - y)

  overlay.setBounds({ x, y, width, height })
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
    createOverlay().once('ready-to-show', () => overlay?.showInactive())
    return
  }
  // ghost mode active → the hotkey un-ghosts instead of hiding (the only way
  // back, since the window itself no longer receives clicks)
  if (clickThrough) {
    setClickThrough(false)
    overlay.showInactive()
    return
  }
  if (overlay.isVisible()) overlay.hide()
  else overlay.showInactive()
}

export function showOverlay(): void {
  if (!overlay || overlay.isDestroyed()) {
    createOverlay().once('ready-to-show', () => overlay?.showInactive())
    return
  }
  if (!overlay.isVisible()) overlay.showInactive()
}

/** Explicit typing is the only display path that takes foreground focus. */
export function activateComposer(): void {
  pendingCompose = true
  if (!overlay || overlay.isDestroyed()) createOverlay()
  setClickThrough(false)
  overlay!.show()
  overlay!.focus()
  deliverCompose()
}
function deliverCompose(): void {
  if (!pendingCompose || !rendererReady || !overlay || overlay.isDestroyed()) return
  pendingCompose = false
  overlay.webContents.send(IPC.ComposeFocus)
}
export function composerReady(): void {
  rendererReady = true
  deliverCompose()
}
export function releaseOverlayFocus(): void {
  overlay?.blur()
}
