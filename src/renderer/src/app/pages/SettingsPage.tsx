import { useRef } from 'react'
import { SettingsNav } from '../settings/frame/SettingsNav'
import { SettingsSaveBar } from '../settings/frame/SettingsSaveBar'
import { useSectionSpy } from '../settings/frame/useSectionSpy'
import { useSettingsDraft } from '../settings/frame/useSettingsDraft'
import { SettingsSections } from '../settings/SettingsSections'

/** Layout and wiring: the draft lives in useSettingsDraft, each section renders one concern. */
export function SettingsPage(): React.JSX.Element {
  const draft = useSettingsDraft()
  const rootRef = useRef<HTMLDivElement>(null)
  const [active, jumpTo] = useSectionSpy(rootRef, draft.view !== null)

  if (!draft.view || !draft.saved) return <p className="muted">Loading…</p>

  return (
    <div className="settings-page" ref={rootRef}>
      <div className="page-head settings-head">
        <h2>Settings</h2>
        <p>Stored on this computer. Changes apply when you save.</p>
      </div>
      <div className="settings-layout">
        <SettingsNav active={active} attention={draft.attention} onJump={jumpTo} />
        <div className="settings-sections">
          <SettingsSections
            view={draft.view}
            secrets={draft.secrets}
            problems={draft.problems}
            savedAt={draft.savedAt}
            onChange={draft.onChange}
            onSecret={draft.onSecret}
          />
          <SettingsSaveBar
            dirty={draft.dirty}
            problemCount={draft.problems.length}
            save={draft.save}
            onSave={() => void draft.onSave()}
            onDiscard={draft.onDiscard}
          />
        </div>
      </div>
    </div>
  )
}
