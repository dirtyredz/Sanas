import { useEffect, useMemo, useState } from 'react'
import type { SettingsView } from '@shared/types'
import { errorText } from '../../../lib/ipc-error'
import {
  hasUnsavedChanges,
  NO_SECRETS,
  settingsPatch,
  settingsProblems,
  type SecretKey,
  type SettingsProblem,
} from './settings-draft'
import type { SettingsSectionId } from './settings-sections'

/** Settings something other than this page writes while it is open (the overlay's opacity
 *  slider). Pushed changes to these keys update both the draft and the saved baseline, so
 *  they never read as unsaved edits. Every other key keeps the draft the user is typing. */
const EXTERNALLY_CHANGED = ['overlayOpacity'] as const satisfies readonly (keyof SettingsView)[]

function followExternal(pushed: SettingsView) {
  return (current: SettingsView | null): SettingsView => {
    if (!current) return pushed
    const next = { ...current }
    for (const key of EXTERNALLY_CHANGED) Object.assign(next, { [key]: pushed[key] })
    return next
  }
}

export type SaveState =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }

export interface SettingsDraft {
  /** Null until the first load. */
  view: SettingsView | null
  saved: SettingsView | null
  secrets: Readonly<Record<SecretKey, string>>
  save: SaveState
  /** When the last successful save finished (ms); 0 before any. */
  savedAt: number
  dirty: boolean
  problems: SettingsProblem[]
  /** Sections the index should mark: fields Save refuses, or a missing API key. */
  attention: Set<SettingsSectionId>
  onChange: (patch: Partial<SettingsView>) => void
  onSecret: (key: SecretKey, value: string) => void
  onSave: () => Promise<void>
  onDiscard: () => void
}

/** The Settings page's state: load, the draft (view + typed secrets) against what was last
 *  saved, following externally written keys, and the save state machine. */
export function useSettingsDraft(): SettingsDraft {
  const [view, setView] = useState<SettingsView | null>(null)
  const [saved, setSaved] = useState<SettingsView | null>(null)
  const [secrets, setSecrets] = useState<Record<SecretKey, string>>(NO_SECRETS)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [savedAt, setSavedAt] = useState(0)

  useEffect(() => {
    window.sanas.settings.get().then((settings) => {
      setView(settings)
      setSaved(settings)
    })
    return window.sanas.settings.onChanged((settings) => {
      setView(followExternal(settings))
      setSaved(followExternal(settings))
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

  const dirty = view && saved ? hasUnsavedChanges(view, saved, secrets) : false

  const onSave = async (): Promise<void> => {
    if (!view || problems.length > 0) return
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

  const onChange = (patch: Partial<SettingsView>): void =>
    setView((current) => (current ? { ...current, ...patch } : current))
  const onSecret = (key: SecretKey, value: string): void =>
    setSecrets((prev) => ({ ...prev, [key]: value }))

  return {
    view,
    saved,
    secrets,
    save,
    savedAt,
    dirty,
    problems,
    attention,
    onChange,
    onSecret,
    onSave,
    onDiscard,
  }
}
