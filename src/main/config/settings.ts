import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Settings, SettingsView } from '@shared/types'

// Plain JSON in userData. API keys stay in the main process; the renderer only
// ever sees the masked SettingsView (see CLAUDE.md privacy boundary).

const DEFAULTS: Settings = {
  deepgramApiKey: '',
  anthropicApiKey: '',
  overlayHotkey: 'CommandOrControl+Shift+Space',
  assistHotkey: 'CommandOrControl+Shift+Enter',
  audioDeviceId: '',
  recordAudio: true, // needed for post-meeting re-diarization
  captureSystemAudio: true,
  overlayOpacity: 1,
  overlayBounds: null
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  if (!existsSync(settingsPath())) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(settingsPath(), 'utf-8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}

export function toView(s: Settings): SettingsView {
  const { deepgramApiKey, anthropicApiKey, ...rest } = s
  return {
    ...rest,
    deepgramKeySet: deepgramApiKey.length > 0,
    anthropicKeySet: anthropicApiKey.length > 0
  }
}
