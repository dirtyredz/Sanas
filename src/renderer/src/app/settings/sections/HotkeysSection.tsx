import type { SettingsView } from '@shared/types'
import { useEffect, useState } from 'react'
import type { HotkeyAction, HotkeyStatus } from '@shared/hotkeys/types'
import { hotkeyLabel } from '../../../lib/hotkey-label'
import { LOCAL_SHORTCUTS } from '../../../lib/overlay-workspaces'
import { Badge } from '../../controls/Badge'
import { FieldRow } from '../../controls/FieldRow'
import { SettingsSection } from '../frame/SettingsSection'
import { describeHotkey } from './hotkey-status'

const GLOBAL_HOTKEYS: { action: HotkeyAction; label: string; help: string }[] = [
  {
    action: 'overlayHotkey',
    label: 'Show / hide the overlay',
    help: 'Also brings the overlay back when clicks pass through it.',
  },
  {
    action: 'assistHotkey',
    label: 'Answer now',
    help: 'Pops the overlay and streams a full answer to the current moment.',
  },
  {
    action: 'captureHotkey',
    label: 'Capture screen',
    help: 'Captures the screen under the overlay and explains it — for code, the error, likely cause and a minimal fix. The image is sent once and not saved.',
  },
  {
    action: 'composeHotkey',
    label: 'Ask composer',
    help: 'Opens the overlay ready to type a question.',
  },
  {
    action: 'presentationPrevHotkey',
    label: 'Previous slide',
    help: 'Moves the presentation back one slide, even while the overlay is paused.',
  },
  {
    action: 'presentationNextHotkey',
    label: 'Next slide',
    help: 'Moves the presentation forward one slide.',
  },
]

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
      id="hotkeys"
      description={
        <>
          Global — they work while the call app has focus. Changes take effect on restart. Electron
          accelerator format, e.g. <span className="mono">CommandOrControl+Shift+Space</span>.
        </>
      }
    >
      {GLOBAL_HOTKEYS.map(({ action, label, help }) => {
        const state = describeHotkey(
          action,
          view,
          saved,
          status.find((s) => s.action === action),
        )
        return (
          <FieldRow
            key={action}
            label={label}
            badge={
              <>
                {view[action] && <kbd className="kbd">{hotkeyLabel(view[action])}</kbd>}
                {state.badge && <Badge tone={state.badge.tone}>{state.badge.text}</Badge>}
              </>
            }
            help={
              <>
                {help}
                {state.notes.map((note) => (
                  <span key={note.text} className={`field-row-note ${note.tone}`}>
                    {note.text}
                  </span>
                ))}
              </>
            }
          >
            <input
              type="text"
              className="mono"
              spellCheck={false}
              value={view[action]}
              onChange={(e) => onChange({ [action]: e.target.value })}
            />
          </FieldRow>
        )
      })}
      {error && (
        <p className="settings-inline-message warn" role="alert">
          Could not read which shortcuts are active: {error}
        </p>
      )}
      <div className="settings-subgroup">
        <div className="field-row-text">
          <span className="field-row-label">In the overlay</span>
          <p className="field-row-help">Only while the overlay is focused; not configurable.</p>
        </div>
        <dl className="shortcut-grid">
          {LOCAL_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys}>
              <dt>
                <kbd className="kbd">{shortcut.keys}</kbd>
              </dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </SettingsSection>
  )
}
