import { app, globalShortcut } from 'electron'
import { join } from 'path'
import { registerShortcuts } from './services/hotkeys/registration'

// Pin the app name/userData path so dev and packaged builds share one data dir
// (dev would otherwise default to %APPDATA%/Electron).
app.setName('sanas')
app.setPath('userData', join(app.getPath('appData'), 'sanas'))
import { createMainWindow } from './windows/main-window'
import { showOverlay, toggleOverlay } from './windows/overlay-window'
import { openDb } from './db'
import { loadSettings } from './config/settings'
import { registerIpcHandlers } from './ipc'
import { answerNow, moveSlideShortcut } from './services/meetings'
import { registerSystemAudioLoopback } from './system-audio'
import { scheduleRetention } from './services/retention'
import { closeDanglingMeetingsAtStartup } from './services/meetings/recovery/startup-recovery'

// Single-instance lock: a second launch focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    registerSystemAudioLoopback()
    openDb()
    closeDanglingMeetingsAtStartup()
    registerIpcHandlers()
    createMainWindow()
    registerHotkeys()
    scheduleRetention()
  })
}

function registerHotkeys(): void {
  registerShortcuts(
    (accelerator, callback) => globalShortcut.register(accelerator, callback),
    loadSettings(),
    {
      overlayHotkey: () => toggleOverlay(),
      assistHotkey: () => {
        showOverlay()
        answerNow()
      },
      presentationPrevHotkey: () => moveSlideShortcut('prev'),
      presentationNextHotkey: () => moveSlideShortcut('next'),
    },
    (error) => console.warn('[sanas] shortcut failed:', error),
  )
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
