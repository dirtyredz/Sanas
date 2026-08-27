import { app, globalShortcut } from 'electron'
import { join } from 'path'

// Pin the app name/userData path so dev and packaged builds share one data dir
// (dev would otherwise default to %APPDATA%/Electron).
app.setName('sanas')
app.setPath('userData', join(app.getPath('appData'), 'sanas'))
import { createMainWindow } from './windows/main-window'
import { toggleOverlay } from './windows/overlay-window'
import { openDb } from './db'
import { loadSettings } from './config/settings'
import { registerIpcHandlers } from './ipc'

// Single-instance lock: a second launch focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    openDb()
    registerIpcHandlers()
    createMainWindow()
    registerHotkeys()
  })
}

function registerHotkeys(): void {
  const { overlayHotkey } = loadSettings()
  const ok = globalShortcut.register(overlayHotkey, () => toggleOverlay())
  if (!ok) {
    // Another app owns the combo — registration fails silently otherwise (see GOTCHAS.md).
    console.warn(`[sanas] global hotkey ${overlayHotkey} is taken by another app`)
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
