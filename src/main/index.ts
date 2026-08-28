import { app, desktopCapturer, globalShortcut, session } from 'electron'
import { join } from 'path'

// Pin the app name/userData path so dev and packaged builds share one data dir
// (dev would otherwise default to %APPDATA%/Electron).
app.setName('sanas')
app.setPath('userData', join(app.getPath('appData'), 'sanas'))
import { createMainWindow } from './windows/main-window'
import { showOverlay, toggleOverlay } from './windows/overlay-window'
import { openDb } from './db'
import { loadSettings } from './config/settings'
import { registerIpcHandlers } from './ipc'
import { runSuggestion } from './services/meetings'

// Single-instance lock: a second launch focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    // System-audio loopback (Windows): when the renderer asks for display media,
    // grant a screen source with audio:'loopback' — the signal headed to the
    // output device. No AEC in this path, so same-PC meeting audio survives.
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
        .catch(() => callback({}))
    })
    openDb()
    registerIpcHandlers()
    createMainWindow()
    registerHotkeys()
  })
}

function registerHotkeys(): void {
  const { overlayHotkey, assistHotkey } = loadSettings()
  // Registration fails silently if another app owns the combo (see GOTCHAS.md).
  if (!globalShortcut.register(overlayHotkey, () => toggleOverlay())) {
    console.warn(`[sanas] global hotkey ${overlayHotkey} is taken by another app`)
  }
  if (
    !globalShortcut.register(assistHotkey, () => {
      showOverlay() // the answer lands in the overlay — make sure it's visible
      void runSuggestion('hotkey')
    })
  ) {
    console.warn(`[sanas] global hotkey ${assistHotkey} is taken by another app`)
  }
}

app.on('second-instance', () => {
  createMainWindow() // focuses existing or recreates
})

app.on('window-all-closed', () => {
  // Standard Windows behavior: quit when all windows close.
  app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
