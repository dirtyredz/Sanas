import type { SettingsView } from '@shared/types'
import { useEffect, useState } from 'react'
import type { HotkeyStatus } from '@shared/presentation/hotkeys'
import { hotkeyLabel } from '../../lib/hotkey-label'
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
  useEffect(() => {
    window.sanas.hotkeys
      .getStatus()
      .then(setStatus)
      .catch((e) => setError(String(e)))
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
      {(['presentationPrevHotkey', 'presentationNextHotkey'] as const).map((key, i) => (
        <label className="field" key={key}>
          <span>{i ? 'Next slide' : 'Previous slide'}</span>
          <input value={view[key]} onChange={(e) => onChange({ [key]: e.target.value })} />
        </label>
      ))}
      {status.map((s) => (
        <p key={s.action}>
          {s.action}: startup {hotkeyLabel(s.accelerator)} — {s.registered ? 'registered' : s.error}
          .{' '}
          {view[s.action] !== s.accelerator &&
            'Changed value takes effect after saving and restarting.'}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
    </SettingsSection>
  )
}
