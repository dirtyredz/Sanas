import { useEffect, useState } from 'react'
import type { Settings, SettingsView } from '@shared/types'
import { ApiKeysSection } from '../settings/ApiKeysSection'
import { HotkeysSection } from '../settings/HotkeysSection'
import { MicrophoneSection } from '../settings/MicrophoneSection'
import { OverlaySection } from '../settings/OverlaySection'
import { EmailSection } from '../settings/EmailSection'
import { RetentionSection } from '../settings/RetentionSection'
import type { SecretKey } from '../settings/SettingsSection'

const NO_SECRETS: Record<SecretKey, string> = {
  deepgramApiKey: '',
  anthropicApiKey: '',
  smtpPass: '',
}

/** Owns the draft (view + typed secrets) and the save; each section renders one concern. */
export function SettingsPage(): React.JSX.Element {
  const [view, setView] = useState<SettingsView | null>(null)
  const [secrets, setSecrets] = useState(NO_SECRETS)
  const [saved, setSaved] = useState(false)
  const [savedAt, setSavedAt] = useState(0)

  useEffect(() => {
    window.sanas.settings.get().then(setView)
  }, [])

  if (!view) return <p className="muted">Loading…</p>

  const save = async (): Promise<void> => {
    const patch: Partial<Settings> = {
      overlayHotkey: view.overlayHotkey,
      assistHotkey: view.assistHotkey,
      anthropicWorkspaceId: view.anthropicWorkspaceId.trim(),
      audioDeviceId: view.audioDeviceId,
      recordAudio: view.recordAudio,
      overlayOpacity: view.overlayOpacity,
      summaryEmailAuto: view.summaryEmailAuto,
      smtpHost: view.smtpHost.trim(),
      smtpPort: view.smtpPort,
      smtpUser: view.smtpUser.trim(),
      audioRetentionDays: view.audioRetentionDays,
      meetingRetentionDays: view.meetingRetentionDays,
    }
    // Only send secrets the user actually typed — empty means "keep existing".
    for (const key of Object.keys(secrets) as SecretKey[]) {
      if (secrets[key]) patch[key] = secrets[key]
    }
    setView(await window.sanas.settings.set(patch))
    setSecrets(NO_SECRETS)
    setSaved(true)
    setSavedAt(Date.now())
    setTimeout(() => setSaved(false), 2000)
  }

  const onChange = (patch: Partial<SettingsView>): void => setView({ ...view, ...patch })
  const onSecret = (key: SecretKey, value: string): void =>
    setSecrets((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="settings">
      <div className="page-head">
        <h2>Settings</h2>
      </div>
      <ApiKeysSection view={view} secrets={secrets} onChange={onChange} onSecret={onSecret} />
      <HotkeysSection view={view} onChange={onChange} />
      <MicrophoneSection view={view} onChange={onChange} />
      <OverlaySection view={view} onChange={onChange} />
      <EmailSection view={view} secrets={secrets} onChange={onChange} onSecret={onSecret} />
      <RetentionSection view={view} savedAt={savedAt} onChange={onChange} />
      <div className="save-bar">
        <button className="btn btn-primary" onClick={save}>
          Save
        </button>
        {saved && <span className="ok">Saved ✓</span>}
      </div>
    </div>
  )
}
