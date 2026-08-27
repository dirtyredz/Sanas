import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { Settings, SettingsView } from '../shared/types'

// The whole renderer-facing API surface. Keep it explicit — no generic invoke passthrough.
const api = {
  settings: {
    get: (): Promise<SettingsView> => ipcRenderer.invoke(IPC.SettingsGet),
    set: (patch: Partial<Settings>): Promise<SettingsView> =>
      ipcRenderer.invoke(IPC.SettingsSet, patch)
  },
  overlay: {
    toggle: (): Promise<void> => ipcRenderer.invoke(IPC.OverlayToggle)
  },
  db: {
    ping: (): Promise<{ ok: boolean; jobs: number }> => ipcRenderer.invoke(IPC.DbPing)
  }
}

export type SanasApi = typeof api

contextBridge.exposeInMainWorld('sanas', api)
