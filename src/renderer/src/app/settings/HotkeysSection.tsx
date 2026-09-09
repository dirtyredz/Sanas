import type { SettingsView } from '@shared/types'
import { hotkeyLabel } from '../../lib/hotkey-label'
import { SettingsSection } from './SettingsSection'

export function HotkeysSection({
  view,
  onChange,
}: {
  view: SettingsView
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  return (
    <SettingsSection
      title="Hotkeys"
      description="Global — they work while the call app has focus. Changes take effect on restart."
    >
      <label className="field">
        <span className="label">
          Show / hide the overlay <span className="kbd">{hotkeyLabel(view.overlayHotkey)}</span>
        </span>
        <input
          type="text"
          className="mono"
          value={view.overlayHotkey}
          onChange={(e) => onChange({ overlayHotkey: e.target.value })}
        />
        <small>Electron accelerator format, e.g. CommandOrControl+Shift+Space.</small>
      </label>

      <label className="field">
        <span className="label">
          Answer now <span className="kbd">{hotkeyLabel(view.assistHotkey)}</span>
        </span>
        <input
          type="text"
          className="mono"
          value={view.assistHotkey}
          onChange={(e) => onChange({ assistHotkey: e.target.value })}
        />
        <small>Pops the overlay and streams a full answer to the current moment.</small>
      </label>
    </SettingsSection>
  )
}
