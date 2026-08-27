import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { Settings } from '@shared/types'
import { loadSettings, saveSettings, toView } from '../config/settings'
import { toggleOverlay } from '../windows/overlay-window'
import { getDb } from '../db'

// Thin handlers only — validate and delegate (see STRUCTURE.md).

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.SettingsGet, () => toView(loadSettings()))

  ipcMain.handle(IPC.SettingsSet, (_e, patch: Partial<Settings>) => toView(saveSettings(patch)))

  ipcMain.handle(IPC.OverlayToggle, () => toggleOverlay())

  // Phase 0 smoke-test: proves SQLite is open and migrated.
  ipcMain.handle(IPC.DbPing, () => {
    const row = getDb().prepare('SELECT COUNT(*) AS jobs FROM jobs').get() as { jobs: number }
    return { ok: true, jobs: row.jobs }
  })
}
