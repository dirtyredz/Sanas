import { useEffect, useMemo, useRef, useState } from 'react'
import type { SettingsView } from '@shared/types'
import { errorText } from '../../lib/ipc-error'
import { ApiKeysSection } from '../settings/sections/ApiKeysSection'
import { AssistantSection } from '../settings/sections/AssistantSection'
import { HotkeysSection } from '../settings/sections/HotkeysSection'
import { MicrophoneSection } from '../settings/sections/MicrophoneSection'
import { OverlaySection } from '../settings/sections/OverlaySection'
import { EmailSection } from '../settings/sections/EmailSection'
import { RetentionSection } from '../settings/sections/RetentionSection'
import { UpdatesSection } from '../settings/sections/UpdatesSection'
import { SettingsNav } from '../settings/frame/SettingsNav'
import { SettingsSaveBar, type SaveState } from '../settings/frame/SettingsSaveBar'
import { useSectionSpy } from '../settings/frame/useSectionSpy'
import type { SettingsSectionId } from '../settings/frame/settings-sections'
import {
  hasUnsavedChanges,
  NO_SECRETS,
  settingsPatch,
  settingsProblems,
  type SecretKey,
} from '../settings/frame/settings-draft'

/** Owns the draft (view + typed secrets), what was last saved, and the save; each section
 *  renders one concern. */
export function SettingsPage(): React.JSX.Element {
  const [view, setView] = useState<SettingsView | null>(null)
  const [saved, setSaved] = useState<SettingsView | null>(null)
  const [secrets, setSecrets] = useState<Record<SecretKey, string>>(NO_SECRETS)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [savedAt, setSavedAt] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const [active, jumpTo] = useSectionSpy(rootRef, view !== null)

  useEffect(() => {
    window.sanas.settings.get().then((settings) => {
      setView(settings)
      setSaved(settings)
    })
    // The overlay changes its own opacity; keep both the draft and the baseline in step.
    const follow =
      (settings: SettingsView) =>
      (current: SettingsView | null): SettingsView =>
        current ? { ...current, overlayOpacity: settings.overlayOpacity } : settings
    return window.sanas.settings.onChanged((settings) => {
      setView(follow(settings))
      setSaved(follow(settings))
    })
  }, [])

  useEffect(() => {
    if (save.kind !== 'saved') return
    const timer = setTimeout(() => setSave({ kind: 'idle' }), 2000)
    return () => clearTimeout(timer)
  }, [save])

  const problems = useMemo(() => (view ? settingsProblems(view) : []), [view])
  const attention = useMemo(() => {
    const flagged = new Set<SettingsSectionId>(problems.map((p) => p.section))
    if (saved && (!saved.deepgramKeySet || !saved.anthropicKeySet)) flagged.add('api-keys')
    return flagged
  }, [problems, saved])

  if (!view || !saved) return <p className="muted">Loading…</p>

  const dirty = hasUnsavedChanges(view, saved, secrets)

  const onSave = async (): Promise<void> => {
    if (problems.length > 0) return
    setSave({ kind: 'saving' })
    try {
      const next = await window.sanas.settings.set(settingsPatch(view, secrets))
      setView(next)
      setSaved(next)
      setSecrets(NO_SECRETS)
      setSavedAt(Date.now())
      setSave({ kind: 'saved' })
    } catch (e) {
      setSave({ kind: 'error', message: errorText(e) })
    }
  }

  const onDiscard = (): void => {
    setView(saved)
    setSecrets(NO_SECRETS)
    setSave({ kind: 'idle' })
  }

  const onChange = (patch: Partial<SettingsView>): void => setView({ ...view, ...patch })
  const onSecret = (key: SecretKey, value: string): void =>
    setSecrets((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="settings-page" ref={rootRef}>
      <div className="page-head settings-head">
        <h2>Settings</h2>
        <p>Stored on this computer. Changes apply when you save.</p>
      </div>
      <div className="settings-layout">
        <SettingsNav active={active} attention={attention} onJump={jumpTo} />
        <div className="settings-sections">
          <ApiKeysSection view={view} secrets={secrets} onChange={onChange} onSecret={onSecret} />
          <AssistantSection view={view} problems={problems} onChange={onChange} />
          <HotkeysSection view={view} onChange={onChange} />
          <MicrophoneSection view={view} onChange={onChange} />
          <OverlaySection view={view} onChange={onChange} />
          <EmailSection view={view} secrets={secrets} onChange={onChange} onSecret={onSecret} />
          <RetentionSection view={view} savedAt={savedAt} onChange={onChange} />
          <UpdatesSection />
          <SettingsSaveBar
            dirty={dirty}
            problemCount={problems.length}
            save={save}
            onSave={() => void onSave()}
            onDiscard={onDiscard}
          />
        </div>
      </div>
    </div>
  )
}
