import type { SettingsView } from '@shared/types'
import { useEffect, useState } from 'react'
import type { HotkeyStatus } from '@shared/hotkeys/types'
import { hotkeyLabel } from '../../lib/hotkey-label'
import { LOCAL_SHORTCUTS } from '../../lib/overlay-workspaces'
import { SettingsSection } from './SettingsSection'

export function HotkeysSection({
  view,
  onChange,
}: {
  view: SettingsView
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  const [status, setStatus] = useState<HotkeyStatus[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(view)
  useEffect(() => {
    window.sanas.hotkeys
      .getStatus()
      .then(setStatus)
      .catch((e) => setError(String(e)))
    return window.sanas.settings.onChanged(setSaved)
  }, [])
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
      <label className="field">
        <span className="label">
          Capture screen <span className="kbd">{hotkeyLabel(view.captureHotkey)}</span>
        </span>
        <input
          type="text"
          className="mono"
          value={view.captureHotkey}
          onChange={(e) => onChange({ captureHotkey: e.target.value })}
        />
        <small>
          Captures the screen under the overlay and explains it — for code, the error, likely cause
          and a minimal fix. The image is sent once and not saved.
        </small>
      </label>
      {(['presentationPrevHotkey', 'presentationNextHotkey'] as const).map((key, i) => (
        <label className="field" key={key}>
          <span>{i ? 'Next slide' : 'Previous slide'}</span>
          <input value={view[key]} onChange={(e) => onChange({ [key]: e.target.value })} />
        </label>
      ))}
      <label className="field">
        <span>Ask composer</span>
        <input
          value={view.composeHotkey}
          onChange={(e) => onChange({ composeHotkey: e.target.value })}
        />
      </label>
      {status.map((s) => (
        <p key={s.action}>
          {s.action}: startup {hotkeyLabel(s.accelerator)} — {s.registered ? 'registered' : s.error}
          . {saved[s.action] !== s.accelerator && 'Saved value awaits restart. '}
          {view[s.action] !== saved[s.action] && 'Unsaved change.'}
        </p>
      ))}
      <div className="field">
        <span className="label">In the overlay (only while it is focused; not configurable)</span>
        <ul className="local-shortcuts">
          {LOCAL_SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys}>
              <span className="kbd">{shortcut.keys}</span> {shortcut.action}
            </li>
          ))}
        </ul>
      </div>
      {error && <p role="alert">{error}</p>}
    </SettingsSection>
  )
}
