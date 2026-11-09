import { startUpdates, stopUpdates } from '../services/platform/updates/service'
import { endMock, mockState } from '../services/mock-interview'
import { app, globalShortcut, dialog } from 'electron'
import { registerShortcuts } from '../services/platform/hotkeys/registration'
import { createMainWindow } from '../windows/main-window'
import { activateComposer, showOverlay, toggleOverlay } from '../windows/overlay-window'
import { openDb, closeDb } from '../db'
import { loadSettings } from '../config/settings'
import { registerIpcHandlers } from '../ipc'
import { answerNow, captureScreen, togglePause } from '../services/meetings'
import { registerSystemAudioLoopback } from '../system-audio'
import { scheduleRetention } from '../services/platform/retention'
import { closeDanglingMeetingsAtStartup } from '../services/meetings/recovery/startup-recovery'
import { registerWindowPolicy } from './window-policy'

let initialized = false
registerWindowPolicy()

// Single-instance lock: a second launch focuses the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app
    .whenReady()
    .then(async () => {
      await openDb()
      initialized = true
      registerSystemAudioLoopback()
      closeDanglingMeetingsAtStartup()
      registerIpcHandlers()
      createMainWindow()
      registerHotkeys()
      scheduleRetention()
      startUpdates()
    })
    .catch((error: Error) => {
      dialog.showErrorBox('Sanas could not start', error.message)
      app.quit()
    })
}

function registerHotkeys(): void {
  registerShortcuts(
    (accelerator, callback) => globalShortcut.register(accelerator, callback),
    loadSettings(),
    {
      composeHotkey: activateComposer,
      overlayHotkey: () => toggleOverlay(),
      assistHotkey: () => {
        showOverlay()
        answerNow()
      },
      pauseHotkey: togglePause,
      captureHotkey: () => {
        // the display is picked inside captureScreen before the overlay is revealed (passively)
        const done = captureScreen()
        showOverlay()
        return done.then(() => undefined)
      },
    },
    (error) => console.warn('[sanas] shortcut failed:', error),
  )
}

app.on('second-instance', () => {
  if (initialized) createMainWindow() // focuses existing or recreates
})

app.on('window-all-closed', () => {
  // Standard Windows behavior: quit when all windows close.
  app.quit()
})

app.on('before-quit', (event) => {
  if (!['idle', 'ended'].includes(mockState().status)) {
    event.preventDefault()
    void endMock().finally(() => app.quit())
  }
})

app.on('will-quit', () => {
  stopUpdates()
  closeDb()
  globalShortcut.unregisterAll()
})
