import { SettingsNav } from '../settings/frame/SettingsNav'
import { SettingsPane } from '../settings/frame/SettingsPane'
import { SettingsSaveBar } from '../settings/frame/SettingsSaveBar'
import { useSettingsDraft } from '../settings/frame/useSettingsDraft'
import { useSettingsPager } from '../settings/frame/useSettingsPager'
import { SettingsSectionPage } from '../settings/SettingsSectionPage'

/** Layout and wiring: the index picks one page, the pane shows it, and the draft (with its
 *  Save bar) sits above both so edits carry across pages. */
export function SettingsPage(): React.JSX.Element {
  const draft = useSettingsDraft()
  const [pager, select] = useSettingsPager()

  if (!draft.view || !draft.saved) return <p className="muted">Loading…</p>

  return (
    <div className="settings-page">
      <div className="page-head settings-head">
        <h2>Settings</h2>
        <p>Stored on this computer. Changes apply when you save.</p>
      </div>
      <div className="settings-layout">
        <SettingsNav active={pager.active} attention={draft.attention} onSelect={select} />
        <div className="settings-main">
          <SettingsPane key={pager.active} page={pager.active} direction={pager.direction}>
            <SettingsSectionPage
              id={pager.active}
              view={draft.view}
              secrets={draft.secrets}
              problems={draft.problems}
              savedAt={draft.savedAt}
              onChange={draft.onChange}
              onSecret={draft.onSecret}
            />
          </SettingsPane>
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
