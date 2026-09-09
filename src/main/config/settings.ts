import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { Settings, SettingsView } from '@shared/types'

// Plain JSON in userData. API keys stay in the main process; the renderer only
// ever sees the masked SettingsView (see CLAUDE.md privacy boundary).

const DEFAULTS: Settings = {
  deepgramApiKey: '',
  anthropicApiKey: '',
  anthropicWorkspaceId: '',
  overlayHotkey: 'CommandOrControl+Shift+Space',
  assistHotkey: 'CommandOrControl+Shift+Enter',
  audioDeviceId: '',
  recordAudio: true, // needed for post-meeting re-diarization
  // 'elsewhere' is the safe default: mono + diarization works anywhere, whereas
  // 'this-pc' silently stamps every voice the mic hears as the user (GOTCHAS.md)
  meetingSource: 'elsewhere',
  overlayOpacity: 1,
  overlayBounds: null,
  summaryEmailAuto: false,
  smtpHost: '',
  smtpPort: 465,
  smtpUser: '',
  smtpPass: '',
  audioRetentionDays: 90, // recordings only feed the re-diarization pass at stop
  meetingRetentionDays: 0, // the record is the product — keep unless told otherwise
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  if (!existsSync(settingsPath())) return { ...DEFAULTS }
  try {
    const stored = JSON.parse(readFileSync(settingsPath(), 'utf-8')) as Record<string, unknown>
    // known keys only, so a retired setting (the old captureSystemAudio flag) drops out
    const known = Object.fromEntries(Object.entries(stored).filter(([k]) => k in DEFAULTS))
    return { ...DEFAULTS, ...(known as Partial<Settings>) }
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
  const { deepgramApiKey, anthropicApiKey, smtpPass, ...rest } = s
  return {
    ...rest,
    deepgramKeySet: deepgramApiKey.length > 0,
    anthropicKeySet: anthropicApiKey.length > 0,
    smtpPassSet: smtpPass.length > 0,
  }
}
